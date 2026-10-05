import { AlertTriangle, Boxes, Highlighter, Lock, MousePointerClick, Move, RefreshCw, Route, TerminalSquare, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ElementGeometry, PreviewMessage, ResizeHandle, SelectionRect, SourceRef, TransformOperation } from "../core/types";
import { useEditorStore } from "../state/editorStore";
import { MessageNotice } from "../editor/MessageNotice";
import { contentGrantLimit, fitCanvasZoom, normalizeContentHeight, normalizeContentWidth, settledContentSize } from "./sizing";
import { panelFormat } from "./panels";
import { stylePatch, transformedRect } from "./transformGeometry";
import { canvasPointFromClient, componentDragDropEvent, componentDragMoveEvent, type ComponentDragDetail } from "../components/componentDrag";
import { simulationCommands } from "../core/plcSimulation";
import { parseHmiDynamizations } from "../core/hmiDynamizations";
import { hmiTextDictionary } from "../core/hmiResources";
import { executeHmiEventAsync, parseHmiEvents } from "../core/hmiEvents";
import { parseHmiFaceplateBinding } from "../core/hmiFaceplates";
import { executeHmiScriptAsync, type HmiScriptFaceplateEvent, type HmiScriptProgram } from "../core/hmiScript";
import { createHmiScriptContextManager } from "../core/hmiScriptModules";
import { createHmiTimerManager } from "../core/hmiTimers";
import { createHmiFaceplatePopupManager } from "../core/hmiPopupManager";
import { renderHmiFaceplates } from "../core/hmiFaceplateVisuals";
import { renderHmiTrendControls } from "../core/hmiTrend";
import { renderHmiFunctionTrendControls } from "../core/hmiFunctionTrend";
import { createHmiDataLogRuntime } from "../core/hmiDataLogs";
import { createHmiPropertyFlashing, type HmiScreenItemSnapshot } from "../../scripts/hmi-property-flashing.mjs";

const resizeHandles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
type Selection = { source: SourceRef; instanceId: string; rect: SelectionRect; geometry: ElementGeometry };
type SelectionRequest = { requestId: number; source: SourceRef; selectionVersion: number; confirmed?: () => void };
function sameSource(left?: SourceRef, right?: SourceRef) {
  return Boolean(left && right && left.file === right.file && left.start === right.start && left.end === right.end);
}
type TransformSession = {
  pointerId: number;
  operation: TransformOperation;
  startX: number;
  startY: number;
  origin: SelectionRect;
  latest: SelectionRect;
  source: SourceRef;
  instanceId: string;
  geometry: ElementGeometry;
  cleanup?: () => void;
  cancel?: () => void;
  frame?: number;
};

export function Canvas() {
  const previewUrl = useEditorStore((state) => state.previewUrl);
  const previewPath = useEditorStore((state) => state.previewPath);
  const requestedStatePage = useEditorStore((state) => state.requestedStatePage);
  const previewStatus = useEditorStore((state) => state.previewStatus);
  const previewError = useEditorStore((state) => state.previewError);
  const interactionMode = useEditorStore((state) => state.interactionMode);
  const highlightPicker = useEditorStore((state) => state.highlightPicker);
  const [regionMessage, setRegionMessage] = useState<string>();
  const zonePicking = useEditorStore((state) => state.zonePicking);
  const guided = useEditorStore((state) => Boolean(state.guidedPage()));
  const zonePickSelector = useEditorStore((state) => state.activeAffordances().find((item) => item.id === state.zonePicking?.affordanceId)?.stage?.selector);
  const highlightPreview = useEditorStore((state) => state.highlightPreview);
  const draggedComponent = useEditorStore((state) => state.draggedComponent);
  const viewport = useEditorStore((state) => state.viewport);
  const snap = useEditorStore((state) => state.snap);
  const multiSelection = useEditorStore((state) => state.multiSelection);
  const simulation = useEditorStore((state) => state.simulation);
  const resourceCatalog = useEditorStore((state) => state.resourceCatalog);
  const scriptCatalog = useEditorStore((state) => state.scriptCatalog);
  const dataLogCatalog = useEditorStore((state) => state.dataLogCatalog);
  const projectRoot = useEditorStore((state) => state.project?.root);
  const setMultiSelection = useEditorStore((state) => state.setMultiSelection);
  const commitMultiSelection = useEditorStore((state) => state.commitMultiSelection);
  const zoom = useEditorStore((state) => state.zoom);
  const fitCanvas = useEditorStore((state) => state.fitCanvas);
  const leftPanel = useEditorStore((state) => state.leftPanel);
  const leftPanelCollapsed = useEditorStore((state) => state.leftPanelCollapsed);
  const setLeftPanel = useEditorStore((state) => state.setLeftPanel);
  const setConsoleOpen = useEditorStore((state) => state.setConsoleOpen);
  const selectSource = useEditorStore((state) => state.selectSource);
  const inspectSource = useEditorStore((state) => state.inspectSource);
  const setSelectionRect = useEditorStore((state) => state.setSelectionRect);
  const setSelectionStyles = useEditorStore((state) => state.setSelectionStyles);
  const setSelectionInfo = useEditorStore((state) => state.setSelectionInfo);
  const updateText = useEditorStore((state) => state.updateText);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
  const insert = useEditorStore((state) => state.insertComponent);
  const syncPreviewPath = useEditorStore((state) => state.syncPreviewPath);
  const syncStatePage = useEditorStore((state) => state.syncStatePage);
  const restartPreview = useEditorStore((state) => state.restartPreview);
  const previewBusy = useEditorStore((state) => state.loading || state.previewRestarting);
  const markPreviewReady = useEditorStore((state) => state.markPreviewReady);
  const cancelHighlightSelection = useEditorStore((state) => state.cancelHighlightSelection);
  const updateStyles = useEditorStore((state) => state.updateStyles);
  const document = useEditorStore((state) => state.document);
  const selectionInfo = useEditorStore((state) => state.selectionInfo);
  const selectedId = useEditorStore((state) => state.selectedId);
  const selectedNode = selectedId ? document?.nodes[selectedId] : undefined;
  const format = panelFormat(viewport);
  const [selection, setSelection] = useState<Selection>();
  const [transforming, setTransforming] = useState(false);
  const [contentHeight, setContentHeight] = useState(() => panelFormat(viewport).height);
  const [contentWidth, setContentWidth] = useState(() => panelFormat(viewport).width);
  const [availableWidth, setAvailableWidth] = useState(1000);
  const [componentDropPoint, setComponentDropPoint] = useState<{ x: number; y: number }>();
  const [guideDismissed, setGuideDismissed] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<TransformSession | undefined>(undefined);
  // How many times this page has already been allowed to resize the canvas, and the size it has
  // now: the message handler is set up once and would otherwise read the size it saw at the start.
  const sizeGrants = useRef(0);
  const sizeRef = useRef({ width: format.width, height: format.height });
  const selectionRef = useRef<Selection | undefined>(undefined);
  const selectionRequestRef = useRef<SelectionRequest | undefined>(undefined);
  const selectionRequestCounterRef = useRef(0);
  const selectionIntentRef = useRef(0);
  const previewSelectionVersionRef = useRef(0);
  const selectionProtocolRef = useRef(0);
  const hmiScriptQueueRef = useRef(Promise.resolve());
  const hmiScreenItemsRef = useRef<HmiScreenItemSnapshot[]>([]);
  const hmiPropertyFlashingRef = useRef<ReturnType<typeof createHmiPropertyFlashing> | undefined>(undefined);
  if (!hmiPropertyFlashingRef.current) hmiPropertyFlashingRef.current = createHmiPropertyFlashing({
    items: () => hmiScreenItemsRef.current,
    apply: (commands) => frameRef.current?.contentWindow?.postMessage({ type: "framecraft:property-flashing", commands }, "*"),
    applyProperties: (commands) => frameRef.current?.contentWindow?.postMessage({ type: "framecraft:screen-properties", commands }, "*"),
    report: (message) => useEditorStore.getState().addPreviewOutput("stderr", `[HMI lampeggio] ${message}`),
  });
  const hmiPropertyFlashing = hmiPropertyFlashingRef.current;
  const faceplateLocalStateRef = useRef(new Map<string, { signature: string; values: Record<string, string>; names: Set<string> }>());
  const hmiPopupManagerRef = useRef<ReturnType<typeof createHmiFaceplatePopupManager> | undefined>(undefined);
  if (!hmiPopupManagerRef.current) {
    const send = (type: "framecraft:popup-open" | "framecraft:popup-update" | "framecraft:popup-close", state: unknown) => {
      frameRef.current?.contentWindow?.postMessage({ type, state }, "*");
      if (type !== "framecraft:popup-close") window.setTimeout(renderFaceplateVisuals, 0);
    };
    hmiPopupManagerRef.current = createHmiFaceplatePopupManager({
      open: (state) => send("framecraft:popup-open", state),
      update: (state) => send("framecraft:popup-update", state),
      close: (state) => send("framecraft:popup-close", state),
    });
  }
  const hmiPopupManager = hmiPopupManagerRef.current;
  const hmiScriptContextsRef = useRef<ReturnType<typeof createHmiScriptContextManager> | undefined>(undefined);
  if (!hmiScriptContextsRef.current) hmiScriptContextsRef.current = createHmiScriptContextManager();
  const hmiScriptContexts = hmiScriptContextsRef.current;
  const hmiTimerManagerRef = useRef<ReturnType<typeof createHmiTimerManager> | undefined>(undefined);
  if (!hmiTimerManagerRef.current) {
    let manager: ReturnType<typeof createHmiTimerManager>;
    manager = createHmiTimerManager((callback, timer, context) => {
      hmiScriptQueueRef.current = hmiScriptQueueRef.current.then(async () => {
        const store = useEditorStore.getState();
        const program: HmiScriptProgram = callback.kind === "inline"
          ? callback.program
          : { version: 1, statements: [{ kind: "module-call", call: callback.call }] };
        const result = await executeHmiScriptAsync(program, store.simulation.values, {
          tagStatus: store.simulation.status,
          ...(context ?? hmiScriptContexts.options(store.scriptCatalog, store.previewPath, "events")),
          timerManager: manager,
          popupManager: hmiPopupManager,
          screenItems: context?.screenItems ?? hmiPropertyFlashing.context(),
        });
        for (const trace of result.traces) store.addPreviewOutput("stdout", `[HMI TIMER ${timer.id}] ${trace}`);
        for (const operatorMessage of result.operatorMessages) store.addPreviewOutput("stdout", `[HMI OPERATORE] ${operatorMessage.tag}: ${operatorMessage.oldValue} → ${operatorMessage.newValue} · ${operatorMessage.reason}`);
        if (result.error) store.addPreviewOutput("stderr", `[HMI TIMER ${timer.id}] ${result.error}`);
        let wrote = false;
        for (const [tag, value] of Object.entries(result.writes)) { store.setSimulationValue(tag, value); wrote = true; }
        for (const [tag, status] of Object.entries(result.tagStatus)) store.setSimulationStatus(tag, status);
        if (wrote && !store.simulation.on) store.setSimulationOn(true);
        if (result.navigation.length) {
          store.addPreviewOutput("stdout", `[HMI TIMER ${timer.id}] naviga → ${result.navigation.join(", ")}`);
          hmiPopupManager.closeParentBound("screen");
        }
        frameRef.current?.contentWindow?.postMessage({ type: "framecraft:hmi-event-result", navigation: result.navigation }, "*");
      }).catch((error) => useEditorStore.getState().addPreviewOutput("stderr", `[HMI TIMER ${timer.id}] ${error instanceof Error ? error.message : String(error)}`));
    }, (error, timer) => useEditorStore.getState().addPreviewOutput("stderr", `[HMI TIMER ${timer.id}] ${error instanceof Error ? error.message : String(error)}`));
    hmiTimerManagerRef.current = manager;
  }
  const hmiTimerManager = hmiTimerManagerRef.current!;
  const dataLogRuntime = useMemo(() => createHmiDataLogRuntime(dataLogCatalog, {
    storageKey: `framecraft:editor-data-logs:${projectRoot ?? dataLogCatalog.projectKey}`,
    onError: (message) => useEditorStore.getState().addPreviewOutput("stderr", message),
  }), [dataLogCatalog, projectRoot]);
  const fittedZoom = fitCanvasZoom(availableWidth, contentWidth);
  const effectiveZoom = fitCanvas ? fittedZoom : zoom;
  const previewSrc = useMemo(() => {
    if (!previewUrl) return undefined;
    const url = new URL(previewUrl);
    url.pathname = previewPath || "/";
    return url.toString();
  }, [previewPath, previewUrl]);
  useEffect(() => {
    selectionProtocolRef.current = 0;
    previewSelectionVersionRef.current = 0;
    selectionRequestRef.current = undefined;
    selectionIntentRef.current++;
  }, [previewSrc]);
  useEffect(() => {
    faceplateLocalStateRef.current.clear();
    hmiPropertyFlashing.reset();
    hmiScreenItemsRef.current = [];
    hmiScriptContexts.dispose();
    hmiPopupManager.closeParentBound("screen");
  }, [previewSrc, hmiPopupManager, hmiScriptContexts]);
  useEffect(() => () => hmiScriptContexts.dispose(), [hmiScriptContexts]);
  useEffect(() => () => hmiPopupManager.dispose(), [hmiPopupManager]);

  function sendMode() {
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:set-mode", mode: interactionMode }, "*");
  }

  function sendRegionPick() {
    const picker = useEditorStore.getState().highlightPicker;
    frameRef.current?.contentWindow?.postMessage(picker && picker.mode !== "element"
      ? { type: "framecraft:begin-region-pick", requestId: picker.requestId, mode: picker.mode, color: picker.color, width: picker.width }
      : { type: "framecraft:end-region-pick" }, "*");
  }

  function sendStatePage() {
    if (requestedStatePage) frameRef.current?.contentWindow?.postMessage({ type: "framecraft:open-state-page", value: requestedStatePage }, "*");
  }

  function sendPreviewStyles(source: SourceRef, instanceId: string, styles: Record<string, string | number>) {
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:preview-style", source, instanceId, styles }, "*");
  }

  function requestSelection(source: SourceRef, instanceId?: string, confirmed?: () => void) {
    if (selectionProtocolRef.current !== 2 || useEditorStore.getState().interactionMode !== "edit"
      || useEditorStore.getState().multiSelection.length > 1) return;
    const info = useEditorStore.getState().selectionInfo;
    const request = { requestId: ++selectionRequestCounterRef.current, source,
      selectionVersion: previewSelectionVersionRef.current, confirmed };
    selectionRequestRef.current = request;
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:request-selection", source, instanceId,
      requestId: request.requestId, selectionVersion: request.selectionVersion,
      info: info ? { instanceIndex: info.instanceIndex, listIndex: info.listIndex } : undefined }, "*");
  }

  function selectionIsCurrent(source: SourceRef, intent: number) {
    const store = useEditorStore.getState();
    const node = store.selectedId ? store.document?.nodes[store.selectedId] : undefined;
    return intent === selectionIntentRef.current && sameSource(node?.source, source);
  }

  function sendSnap() {
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:set-snap", enabled: snap.enabled, grid: snap.grid, threshold: 6 }, "*");
  }

  function sendMultiSelection() {
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:set-multi-selection", items: multiSelection }, "*");
  }

  /** La simulazione: prima si chiede all'anteprima quali oggetti hanno una dinamizzazione, poi le si
   * manda, per ognuno, cosa deve diventare. Il conto lo fa l'editor perche' le regole del
   * `ValueConverter` stanno in `plcSimulation.ts`, dove si possono provare. */
  function collectDynamizations() {
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:collect-dynamizations" }, "*");
  }

  function renderFaceplateVisuals() {
    const root = frameRef.current?.contentDocument;
    if (!root) return;
    const store = useEditorStore.getState();
    renderHmiFaceplates(root, store.faceplateCatalog, store.simulation.values, {
      localValues: (host, type) => {
        const instanceId = (host as HTMLElement).dataset.framecraftInstanceId;
        const current = instanceId ? faceplateLocalStateRef.current.get(instanceId) : undefined;
        if (current) return current.values;
        return Object.fromEntries(type.localTags.map((tag) => [tag.name, tag.startValue ?? (/bool/i.test(tag.dataType) ? "false" : /string/i.test(tag.dataType) ? "" : "0")]));
      },
    });
  }

  function renderTrendVisuals() {
    const root = frameRef.current?.contentDocument;
    if (!root) return;
    const store = useEditorStore.getState();
    const sources = { tags: store.plcVariables.map((variable) => variable.name), logs: store.dataLogCatalog.logs };
    renderHmiTrendControls(root, store.simulation.values, {
      sample: store.simulation.on,
      status: store.simulation.status,
      sources,
      history: (trend, from, to) => trend.logId && trend.loggedTagId
        ? dataLogRuntime.query(trend.logId, trend.loggedTagId, from, to).flatMap((sample) => {
          const value = Number(sample.value);
          return sample.value.trim() && Number.isFinite(value) ? [{ time: sample.time, value, qualityCode: sample.qualityCode }] : [];
        })
        : [],
    });
    renderHmiFunctionTrendControls(root, store.simulation.values, {
      sample: store.simulation.on,
      status: store.simulation.status,
      sources,
      history: (source, from, to) => source.logId && source.loggedTagId ? dataLogRuntime.query(source.logId, source.loggedTagId, from, to) : [],
    });
  }

  function sendSimulation() {
    const preview = frameRef.current?.contentWindow;
    if (!preview) return;
    if (!simulation.on) { preview.postMessage({ type: "framecraft:simulate", on: false }, "*"); return; }
    const context = hmiScriptContexts.options(scriptCatalog, previewPath, "dynamizations");
    const { commands, unresolved } = simulationCommands(simulation.elements, simulation.values, resourceCatalog, resourceCatalog.activeLanguage, context.functions, hmiTimerManager, context.globalScope, context.variables, (instanceId) => hmiPropertyFlashing.context(instanceId));
    preview.postMessage({ type: "framecraft:simulate", on: true, commands }, "*");
    useEditorStore.getState().setSimulationUnresolved(unresolved);
  }

  function sendLanguage() {
    frameRef.current?.contentWindow?.postMessage({
      type: "framecraft:set-language",
      language: resourceCatalog.activeLanguage,
      translations: hmiTextDictionary(resourceCatalog, resourceCatalog.activeLanguage),
    }, "*");
  }

  function sendHighlightPreview() {
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:preview-highlight", preview: highlightPreview }, "*");
  }

  function beginTransform(event: ReactPointerEvent<HTMLButtonElement>, operation: TransformOperation) {
    if (!selection) return;
    transformRef.current?.cancel?.();
    event.preventDefault();
    event.stopPropagation();
    const session: TransformSession = {
      pointerId: event.pointerId,
      operation,
      startX: event.clientX,
      startY: event.clientY,
      origin: selection.rect,
      latest: selection.rect,
      source: selection.source,
      instanceId: selection.instanceId,
      geometry: selection.geometry,
    };
    const target = event.currentTarget;
    const paint = () => {
      session.frame = undefined;
      if (transformRef.current !== session) return;
      const next = session.latest;
      setSelection((current) => current && current.instanceId === session.instanceId ? { ...current, rect: next } : current);
      setSelectionRect(next);
      sendPreviewStyles(session.source, session.instanceId, stylePatch(session.origin, next, session.geometry, session.operation));
    };
    const moveTo = (pointerEvent: PointerEvent) => {
      session.latest = transformedRect(session.origin, session.operation, (pointerEvent.clientX - session.startX) / effectiveZoom, (pointerEvent.clientY - session.startY) / effectiveZoom);
    };
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== session.pointerId) return;
      if (pointerEvent.cancelable) pointerEvent.preventDefault();
      moveTo(pointerEvent);
      if (session.frame === undefined) session.frame = window.requestAnimationFrame(paint);
    };
    const cancel = () => {
      if (transformRef.current !== session) return;
      session.cleanup?.();
      transformRef.current = undefined;
      setTransforming(false);
      frameRef.current?.contentWindow?.postMessage({ type: "framecraft:end-transform", instanceId: session.instanceId, canceled: true }, "*");
      if (useEditorStore.getState().project?.root === projectRoot && useEditorStore.getState().interactionMode === "edit") {
        setSelection((current) => current && current.instanceId === session.instanceId ? { ...current, rect: session.origin } : current);
        if (selectionRef.current?.instanceId === session.instanceId) setSelectionRect(session.origin);
      }
      try { target.releasePointerCapture?.(session.pointerId); } catch { /* Capture can already be lost. */ }
    };
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== session.pointerId) return;
      if (pointerEvent.type === "pointercancel") { cancel(); return; }
      moveTo(pointerEvent);
      if (session.frame !== undefined) window.cancelAnimationFrame(session.frame);
      paint();
      session.cleanup?.();
      transformRef.current = undefined;
      setTransforming(false);
      const styles = stylePatch(session.origin, session.latest, session.geometry, session.operation);
      const changed = session.latest.x !== session.origin.x || session.latest.y !== session.origin.y
        || session.latest.width !== session.origin.width || session.latest.height !== session.origin.height;
      frameRef.current?.contentWindow?.postMessage({ type: "framecraft:end-transform", instanceId: session.instanceId, canceled: !changed }, "*");
      const intent = selectionIntentRef.current;
      if (changed) void selectSource(session.source).then((selected) => {
        if (selected && selectionIsCurrent(session.source, intent)) return updateStyles(styles);
      });
    };
    const escape = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") { keyEvent.preventDefault(); keyEvent.stopImmediatePropagation(); cancel(); }
    };
    const lostCapture = (pointerEvent: PointerEvent) => { if (pointerEvent.pointerId === session.pointerId) cancel(); };
    session.cleanup = () => {
      if (session.frame !== undefined) window.cancelAnimationFrame(session.frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancel);
      target.removeEventListener("lostpointercapture", lostCapture);
    };
    session.cancel = cancel;
    transformRef.current = session;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
    target.addEventListener("lostpointercapture", lostCapture);
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:begin-transform", source: session.source, instanceId: session.instanceId }, "*");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setTransforming(true);
  }

  useEffect(() => {
    return () => { transformRef.current?.cancel?.(); hmiTimerManager.dispose(); };
  }, []);
  useEffect(() => () => transformRef.current?.cancel?.(), [interactionMode, previewSrc, projectRoot]);
  useEffect(() => {
    if (transformRef.current && !sameSource(transformRef.current.source, selectedNode?.source)) transformRef.current.cancel?.();
  }, [selectedNode?.source.file, selectedNode?.source.start, selectedNode?.source.end]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    sizeRef.current = { width: contentWidth, height: contentHeight };
  }, [contentHeight, contentWidth]);

  useEffect(() => {
    sendMode();
    if (interactionMode === "edit") hmiPropertyFlashing.reset();
    if (interactionMode === "navigate") {
      selectionIntentRef.current++;
      selectionRequestRef.current = undefined;
      selectionRef.current = undefined;
      setSelection(undefined); setSelectionRect(undefined);
    }
  }, [interactionMode]);

  useEffect(() => {
    sendStatePage();
  }, [requestedStatePage, previewSrc]);

  useEffect(() => {
    sendHighlightPreview();
  }, [highlightPreview, previewSrc, selection?.instanceId]);

  useEffect(() => {
    sendSnap();
  }, [snap.enabled, snap.grid, previewSrc]);

  useEffect(() => {
    sendMultiSelection();
  }, [multiSelection, previewSrc]);

  // Accendendo la simulazione si chiede la lista; a ogni valore nuovo si rimanda solo il risultato.
  useEffect(() => {
    if (simulation.on) collectDynamizations();
  }, [simulation.on, previewSrc]);

  useEffect(() => {
    sendSimulation();
    renderFaceplateVisuals();
    renderTrendVisuals();
    if (simulation.on) dataLogRuntime.updateSnapshot(simulation.values, simulation.status);
  }, [simulation.on, simulation.values, simulation.status, simulation.elements, resourceCatalog, scriptCatalog, dataLogRuntime, previewPath, previewSrc]);

  useEffect(() => {
    if (!simulation.on) return;
    dataLogRuntime.start(() => {
      const current = useEditorStore.getState().simulation;
      return { values: current.values, status: current.status };
    });
    const unsubscribe = dataLogRuntime.subscribe(renderTrendVisuals);
    dataLogRuntime.updateSnapshot(simulation.values, simulation.status);
    return () => { unsubscribe(); dataLogRuntime.stop(); };
  }, [dataLogRuntime, simulation.on]);

  useEffect(() => {
    const timer = window.setInterval(renderTrendVisuals, 250);
    return () => window.clearInterval(timer);
  }, [dataLogRuntime, previewSrc]);

  useEffect(() => {
    sendLanguage();
  }, [resourceCatalog, previewSrc]);

  useEffect(() => {
    const pointFor = (detail: ComponentDragDetail) => {
      const rect = frameRef.current?.getBoundingClientRect();
      return rect ? canvasPointFromClient(detail.clientX, detail.clientY, rect, contentWidth, contentHeight) : undefined;
    };
    const move = (event: Event) => setComponentDropPoint(pointFor((event as CustomEvent<ComponentDragDetail>).detail));
    const drop = (event: Event) => {
      const detail = (event as CustomEvent<ComponentDragDetail>).detail;
      const point = pointFor(detail);
      setComponentDropPoint(undefined);
      if (!point) return;
      const preview = frameRef.current?.contentWindow;
      if (!preview) return;
      // Message order is guaranteed for one window. Setting edit mode here removes the race between
      // starting a drag in the palette and the preview receiving the editor-mode update.
      preview.postMessage({ type: "framecraft:set-mode", mode: "edit" }, "*");
      preview.postMessage({ type: "framecraft:drop-at-point", jsx: detail.jsx, ...point }, "*");
    };
    window.addEventListener(componentDragMoveEvent, move);
    window.addEventListener(componentDragDropEvent, drop);
    return () => {
      window.removeEventListener(componentDragMoveEvent, move);
      window.removeEventListener(componentDragDropEvent, drop);
    };
  }, [contentHeight, contentWidth]);

  useEffect(() => {
    if (!selectedNode) { selectionRequestRef.current = undefined; return; }
    const current = selectionRef.current;
    const same = sameSource(current?.source, selectedNode.source);
    const instanceId = current?.instanceId;
    if (!same && current) {
      setSelection(undefined);
      setSelectionRect(undefined);
    }
    const intent = selectionIntentRef.current;
    let confirmed = false;
    const request = () => {
      if (confirmed || intent !== selectionIntentRef.current) return;
      const store = useEditorStore.getState();
      const node = store.selectedId ? store.document?.nodes[store.selectedId] : undefined;
      if (sameSource(node?.source, selectedNode.source)) requestSelection(selectedNode.source, instanceId, () => { confirmed = true; });
    };
    request();
    const retries = [80, 240, 600].map((delay) => window.setTimeout(request, delay));
    return () => retries.forEach(window.clearTimeout);
  }, [document?.version, previewSrc, selectedNode?.id, selectedNode?.source.end, selectedNode?.source.start]);

  // Chiedere un punto è una modalità della pagina, non un click come gli altri: finché è accesa il
  // canvas non seleziona e non trascina niente.
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:set-editing", drag: !guided }, "*");
  }, [guided, previewSrc, previewStatus]);

  useEffect(() => {
    const preview = frameRef.current?.contentWindow;
    if (!preview) return;
    if (zonePicking) preview.postMessage({ type: "framecraft:begin-point-pick", selector: zonePickSelector }, "*");
    else preview.postMessage({ type: "framecraft:end-point-pick" }, "*");
  }, [zonePicking, zonePickSelector, previewSrc]);

  useEffect(() => {
    if (!zonePicking) return;
    const finish = (event: KeyboardEvent) => {
      if (event.key === "Escape") useEditorStore.getState().cancelZonePicking();
      if (event.key === "Enter") void useEditorStore.getState().finishZonePicking();
    };
    window.addEventListener("keydown", finish);
    return () => window.removeEventListener("keydown", finish);
  }, [zonePicking]);

  useEffect(() => {
    if (!highlightPicker) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelHighlightSelection();
      if (event.key === "Enter" && highlightPicker.mode === "polygon" && !(event.target instanceof Element && event.target.matches("input,textarea,select,[contenteditable=true]"))) frameRef.current?.contentWindow?.postMessage({ type: "framecraft:finish-region-pick", requestId: highlightPicker.requestId }, "*");
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [cancelHighlightSelection, highlightPicker]);

  useEffect(() => {
    setRegionMessage(undefined);
    if (highlightPicker && highlightPicker.previewPath !== previewPath) { cancelHighlightSelection(); return; }
    if (highlightPicker?.mode !== "element") transformRef.current?.cancel?.();
    sendRegionPick();
    return () => { frameRef.current?.contentWindow?.postMessage({ type: "framecraft:end-region-pick" }, "*"); };
  }, [highlightPicker, previewSrc, previewPath, cancelHighlightSelection]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const updateWidth = () => setAvailableWidth(container.clientWidth);
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    updateWidth();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    sizeGrants.current = 0;
    setContentHeight(format.height);
    setContentWidth(format.width);
    setSelection(undefined);
    setSelectionRect(undefined);
    setMultiSelection([]);
    setGuideDismissed(false);
  }, [previewPath, previewUrl, viewport]);

  const openPanel = (panel: "pages" | "components") => {
    if (leftPanel !== panel || leftPanelCollapsed) setLeftPanel(panel);
  };

  useEffect(() => {
    const clearSelectionIfDeleted = () => {
      if (useEditorStore.getState().selectedId) return;
      selectionRef.current = undefined;
      selectionRequestRef.current = undefined;
      setSelection(undefined);
      setSelectionRect(undefined);
    };
    const listener = (event: MessageEvent<PreviewMessage>) => {
      if (!event.data?.type || event.source !== frameRef.current?.contentWindow) return;
      if (event.data.type === "framecraft:select" || event.data.type === "framecraft:selection-response") {
        const selectMessage = event.data;
        const store = useEditorStore.getState();
        if (store.highlightPicker && store.highlightPicker.mode !== "element") return;
        if (store.interactionMode !== "edit") return;
        if (selectMessage.type === "framecraft:selection-response") {
          const request = selectionRequestRef.current;
          const selected = store.selectedId ? store.document?.nodes[store.selectedId] : undefined;
          if (!request || request.requestId !== selectMessage.requestId
            || request.selectionVersion !== previewSelectionVersionRef.current
            || selectMessage.selectionVersion !== request.selectionVersion
            || !sameSource(request.source, selectMessage.source) || !sameSource(selected?.source, request.source)) return;
          request.confirmed?.();
          selectionRequestRef.current = undefined;
        } else {
          if (selectMessage.selectionVersion != null) {
            if (selectMessage.selectionVersion < previewSelectionVersionRef.current) return;
            previewSelectionVersionRef.current = selectMessage.selectionVersion;
            selectionProtocolRef.current = 2;
          }
          selectionIntentRef.current++;
          selectionRequestRef.current = undefined;
        }
        const currentDocument = store.document;
        const sourceNode = currentDocument && Object.values(currentDocument.nodes).find((node) => node.source.file === selectMessage.source.file
          && node.source.start === selectMessage.source.start && node.source.end === selectMessage.source.end);
        const savedScale = typeof sourceNode?.styles.scale === "string" ? sourceNode.styles.scale : "none";
        const geometry = event.data.geometry
          ? { ...event.data.geometry, scale: event.data.geometry.scale || savedScale }
          : { display: "block", translate: "none", scale: savedScale, cssWidth: event.data.rect.width, cssHeight: event.data.rect.height };
        const nextSelection = {
          source: event.data.source,
          instanceId: event.data.instanceId,
          rect: event.data.rect,
          geometry,
        };
        if (transformRef.current && (transformRef.current.instanceId !== nextSelection.instanceId || !sameSource(transformRef.current.source, nextSelection.source))) transformRef.current.cancel?.();
        selectionRef.current = nextSelection;
        setSelection(nextSelection);
        setSelectionRect(event.data.rect);
        const styles = event.data.styles ?? {
          display: geometry.display,
          translate: geometry.translate,
          scale: geometry.scale,
          width: `${Math.round(geometry.cssWidth * 10) / 10}px`,
          height: `${Math.round(geometry.cssHeight * 10) / 10}px`,
        };
        setSelectionInfo(event.data.info);
        setSelectionStyles(styles);
        if (selectMessage.type === "framecraft:select") void selectSource(event.data.source, event.data.tag);
      } else if (event.data.type === "framecraft:inspect") {
        void inspectSource(event.data.source, event.data.tag, event.data.editText);
      } else if (event.data.type === "framecraft:edit-text") {
        const { source, value } = event.data;
        const intent = selectionIntentRef.current;
        void selectSource(source).then((selected) => {
          if (selected && selectionIsCurrent(source, intent)) return updateText(value);
        });
      } else if (event.data.type === "framecraft:drop") {
        const { source, jsx, x, y, positionContainer } = event.data;
        void insert(jsx, { source, x, y, positionContainer });
      } else if (event.data.type === "framecraft:selection-rect") {
        const { source, instanceId, rect } = event.data;
        if (selectionRef.current?.instanceId !== instanceId || !sameSource(selectionRef.current.source, source)) return;
        setSelection((current) => current ? { ...current, rect } : current);
        setSelectionRect(rect);
      } else if (event.data.type === "framecraft:drag-move") {
        const { source, instanceId, rect } = event.data;
        if (useEditorStore.getState().interactionMode !== "edit" || selectionRef.current?.instanceId !== instanceId
          || !sameSource(selectionRef.current.source, source)
          || (event.data.selectionVersion != null && event.data.selectionVersion !== previewSelectionVersionRef.current)) return;
        setSelection((current) => current && current.instanceId === instanceId && current.source.file === source.file && current.source.start === source.start ? { ...current, rect } : current);
        setSelectionRect(rect);
      } else if (event.data.type === "framecraft:drag-end") {
        const { source, instanceId, rect, translate } = event.data;
        if (useEditorStore.getState().interactionMode !== "edit" || selectionRef.current?.instanceId !== instanceId
          || !sameSource(selectionRef.current.source, source)
          || (event.data.selectionVersion != null && event.data.selectionVersion !== previewSelectionVersionRef.current)) return;
        setSelection((current) => current && current.instanceId === instanceId && current.source.file === source.file && current.source.start === source.start ? { ...current, rect } : current);
        setSelectionRect(rect);
        const intent = selectionIntentRef.current;
        void selectSource(source).then((selected) => {
          if (selected && selectionIsCurrent(source, intent)) return updateStyles({ translate });
        });
      } else if (event.data.type === "framecraft:delete") {
        const { source, info } = event.data;
        // The preview says which copy it had selected, so the delete lands on that one even when the
        // editor's own selection is a step behind.
        if (info) setSelectionInfo(info);
        const intent = selectionIntentRef.current;
        void selectSource(source).then(async (selected) => {
          if (!selected || !selectionIsCurrent(source, intent)) return;
          await deleteSelection();
          if (intent === selectionIntentRef.current) clearSelectionIfDeleted();
        });
      } else if (event.data.type === "framecraft:region-picked") {
        const picker = useEditorStore.getState().highlightPicker;
        if (!picker || picker.mode === "element" || picker.requestId !== event.data.requestId || useEditorStore.getState().interactionMode !== "edit") return;
        selectionIntentRef.current++;
        selectionRequestRef.current = undefined;
        void selectSource(event.data.source, undefined, event.data.region);
      } else if (event.data.type === "framecraft:region-cancelled") {
        if (useEditorStore.getState().highlightPicker?.requestId === event.data.requestId) cancelHighlightSelection();
      } else if (event.data.type === "framecraft:region-missed") {
        if (useEditorStore.getState().highlightPicker?.requestId === event.data.requestId) setRegionMessage(event.data.message);
      } else if (event.data.type === "framecraft:point-picked") {
        void useEditorStore.getState().addPickedPoint(event.data.x, event.data.y);
      } else if (event.data.type === "framecraft:select-many") {
        selectionIntentRef.current++;
        selectionRequestRef.current = undefined;
        if (event.data.selectionVersion != null) previewSelectionVersionRef.current = event.data.selectionVersion;
        setMultiSelection(event.data.items);
      } else if (event.data.type === "framecraft:group-drag-move") {
        setMultiSelection(event.data.items);
      } else if (event.data.type === "framecraft:group-drag-end") {
        setMultiSelection(event.data.items);
        void commitMultiSelection(event.data.items);
      } else if (event.data.type === "framecraft:shortcut") {
        // Keys pressed inside the preview never reach the editor shell, so the canvas replays the
        // shortcuts the shell owns. Without this, undo, redo and save are dead while the user works
        // in the very place they spend all their time.
        const { key, shift } = event.data;
        const store = useEditorStore.getState();
        // Leaving the outline over a deleted element is what made the next Canc look dead: it hit a
        // selection that no longer existed.
        if (key === "delete") {
          const intent = selectionIntentRef.current;
          void store.deleteSelection().then(() => { if (intent === selectionIntentRef.current) clearSelectionIfDeleted(); });
        }
        else if (key === "s") void store.save();
        else if (key === "d") void store.duplicateSelection();
        else if (key === "y") void store.redo();
        else if (key === "z") void (shift ? store.redo() : store.undo());
      } else if (event.data.type === "framecraft:ready") {
        transformRef.current?.cancel?.();
        hmiPropertyFlashing.reset();
        hmiScreenItemsRef.current = event.data.screenItems ?? [];
        const currentStore = useEditorStore.getState();
        if (currentStore.highlightPicker && currentStore.highlightPicker.mode !== "element") currentStore.cancelHighlightSelection();
        for (const context of ["events", "dynamizations"] as const) {
          for (const error of hmiScriptContexts.initialize(currentStore.scriptCatalog, event.data.path ?? currentStore.previewPath, context, currentStore.simulation.values, { tagStatus: currentStore.simulation.status })) currentStore.addPreviewOutput("stderr", `[HMI SCRIPT ${context}] ${error}`);
        }
        selectionProtocolRef.current = event.data.selectionProtocol ?? 0;
        previewSelectionVersionRef.current = event.data.selectionVersion ?? 0;
        selectionRequestRef.current = undefined;
        selectionIntentRef.current++;
        // A new page starts with its own budget: this one is allowed to say how big it is.
        sizeGrants.current = 0;
        sendMode();
        sendStatePage();
        sendSnap();
        sendMultiSelection();
        sendLanguage();
        for (const state of hmiPopupManager.states()) frameRef.current?.contentWindow?.postMessage({ type: "framecraft:popup-open", state }, "*");
        window.setTimeout(() => { renderFaceplateVisuals(); renderTrendVisuals(); }, 0);
        const currentSelectedId = useEditorStore.getState().selectedId;
        const currentDocument = useEditorStore.getState().document;
        const currentNode = currentSelectedId ? currentDocument?.nodes[currentSelectedId] : undefined;
        const currentSelection = selectionRef.current;
        if (currentNode) requestSelection(currentNode.source, currentSelection?.source.file === currentNode.source.file && currentSelection.source.start === currentNode.source.start ? currentSelection.instanceId : undefined);
        sendHighlightPreview();
        if (useEditorStore.getState().simulation.on) collectDynamizations();
        void syncPreviewPath(event.data.path);
      } else if (event.data.type === "framecraft:highlight-anchor") {
        const { index, x, y, done } = event.data;
        void useEditorStore.getState().moveHighlightAnchor(index, x, y, done);
      } else if (event.data.type === "framecraft:highlight-insert") {
        const { afterIndex, x, y } = event.data;
        void useEditorStore.getState().insertHighlightAnchor(afterIndex, x, y);
      } else if (event.data.type === "framecraft:highlight-remove") {
        void useEditorStore.getState().removeHighlightAnchor(event.data.index);
      } else if (event.data.type === "framecraft:screen-items") {
        if (Array.isArray(event.data.screenItems)) hmiScreenItemsRef.current = event.data.screenItems;
      } else if (event.data.type === "framecraft:dynamizations") {
        hmiScreenItemsRef.current = event.data.screenItems ?? hmiScreenItemsRef.current;
        const items = Array.isArray(event.data.items) ? event.data.items : [];
        useEditorStore.getState().setSimulationElements(items.map((item: { instanceId: string; raw: string }) => ({
          instanceId: item.instanceId,
          dynamizations: parseHmiDynamizations(item.raw),
        })));
      } else if (event.data.type === "framecraft:hmi-event") {
        const message = event.data;
        hmiScreenItemsRef.current = message.screenItems ?? hmiScreenItemsRef.current;
        const screenItems = hmiPropertyFlashing.context(message.instanceId);
        hmiScriptQueueRef.current = hmiScriptQueueRef.current.then(async () => {
          const bindings = parseHmiEvents(message.raw).filter((binding) => binding.event === message.eventType);
          const store = useEditorStore.getState();
          const instance = message.faceplateRaw ? parseHmiFaceplateBinding(message.faceplateRaw) : undefined;
          const type = instance && store.faceplateCatalog.types.find((candidate) => candidate.id === instance.typeId && candidate.version === instance.version);
          let localState: { signature: string; values: Record<string, string>; names: Set<string> } | undefined;
          if (message.faceplateInstanceId && type?.localTags.length) {
            const signature = `${type.id}@${type.version}:${type.localTags.map((tag) => `${tag.name}=${tag.startValue ?? ""}`).join("|")}`;
            localState = faceplateLocalStateRef.current.get(message.faceplateInstanceId);
            if (!localState || localState.signature !== signature) {
              localState = {
                signature,
                names: new Set(type.localTags.map((tag) => tag.name)),
                values: Object.fromEntries(type.localTags.map((tag) => [tag.name, tag.startValue ?? (/bool/i.test(tag.dataType) ? "false" : /string/i.test(tag.dataType) ? "" : "0")])),
              };
              faceplateLocalStateRef.current.set(message.faceplateInstanceId, localState);
            }
          }
          const values = { ...store.simulation.values, ...(localState?.values ?? {}) };
          const navigation: string[] = [];
          const faceplateEvents: HmiScriptFaceplateEvent[] = [];
          let wrote = false;
          for (const binding of bindings) {
            const result = await executeHmiEventAsync(binding, values, { gesture: message.gesture, key: message.key, command: message.command, interfaceEvent: message.interfaceEvent, tagStatus: store.simulation.status, ...hmiScriptContexts.options(store.scriptCatalog, store.previewPath, "events"), timerManager: hmiTimerManager, popupManager: hmiPopupManager, screenItems });
            for (const trace of result.traces) store.addPreviewOutput("stdout", `[HMI ${binding.event}] ${trace}`);
            for (const operatorMessage of result.operatorMessages) store.addPreviewOutput("stdout", `[HMI OPERATORE] ${operatorMessage.tag}: ${operatorMessage.oldValue} → ${operatorMessage.newValue} · ${operatorMessage.reason}`);
            if (result.error) store.addPreviewOutput("stderr", `[HMI ${binding.event}] ${result.error}`);
            const writes = Object.entries(result.writes);
            if (writes.length) {
              const shown = writes.slice(0, 8).map(([tag, value]) => `${tag}=${value}`).join(", ");
              store.addPreviewOutput("stdout", `[HMI ${binding.event}] scrive ${shown}${writes.length > 8 ? ` (+${writes.length - 8})` : ""}`);
            }
            for (const [tag, value] of writes) {
              values[tag] = value;
              if (localState?.names.has(tag)) {
                localState.values[tag] = value;
                store.addPreviewOutput("stdout", `[HMI FACEPLATE LOCALE] ${tag}=${value}`);
              } else {
                store.setSimulationValue(tag, value);
                wrote = true;
              }
            }
            for (const [tag, status] of Object.entries(result.tagStatus)) if (!localState?.names.has(tag)) store.setSimulationStatus(tag, status);
            if (result.navigation.length) store.addPreviewOutput("stdout", `[HMI ${binding.event}] naviga → ${result.navigation.join(", ")}`);
            navigation.push(...result.navigation);
            faceplateEvents.push(...result.faceplateEvents);
          }
          if (navigation.length) hmiPopupManager.closeParentBound("screen");
          if (wrote && !store.simulation.on) store.setSimulationOn(true);
          renderFaceplateVisuals();
          frameRef.current?.contentWindow?.postMessage({ type: "framecraft:hmi-event-result", instanceId: message.instanceId, navigation, faceplateEvents }, "*");
        }).catch((error) => useEditorStore.getState().addPreviewOutput("stderr", `[HMI ${message.eventType}] ${error instanceof Error ? error.message : String(error)}`));
      } else if (event.data.type === "framecraft:faceplate-event") {
        const message = event.data;
        hmiScreenItemsRef.current = message.screenItems ?? hmiScreenItemsRef.current;
        const screenItems = hmiPropertyFlashing.context(message.instanceId);
        hmiScriptQueueRef.current = hmiScriptQueueRef.current.then(async () => {
          const store = useEditorStore.getState();
          const instance = parseHmiFaceplateBinding(message.raw);
          const type = instance && store.faceplateCatalog.types.find((candidate) => candidate.id === instance.typeId && candidate.version === instance.version);
          const definition = type?.interfaceEvents.find((candidate) => candidate.name === message.eventName);
          const handler = instance?.eventBindings?.[message.eventName];
          if (!instance || !type || !definition || !handler) {
            store.addPreviewOutput("stderr", `[HMI FACEPLATE ${message.eventName}] evento o binding non valido per l'istanza.`);
            return;
          }
          const parameters = Object.fromEntries(definition.parameters.map((parameter) => [parameter.name, message.parameters?.[parameter.name] ?? null]));
          const result = await executeHmiEventAsync({ event: "InterfaceEvent", ...handler }, { ...store.simulation.values }, {
            interfaceEvent: message.eventName, parameters, tagStatus: store.simulation.status,
            ...hmiScriptContexts.options(store.scriptCatalog, store.previewPath, "events"), timerManager: hmiTimerManager, popupManager: hmiPopupManager, screenItems,
          });
          for (const trace of result.traces) store.addPreviewOutput("stdout", `[HMI FACEPLATE ${message.eventName}] ${trace}`);
          for (const operatorMessage of result.operatorMessages) store.addPreviewOutput("stdout", `[HMI OPERATORE] ${operatorMessage.tag}: ${operatorMessage.oldValue} → ${operatorMessage.newValue} · ${operatorMessage.reason}`);
          if (result.error) store.addPreviewOutput("stderr", `[HMI FACEPLATE ${message.eventName}] ${result.error}`);
          const writes = Object.entries(result.writes);
          for (const [tag, value] of writes) store.setSimulationValue(tag, value);
          for (const [tag, status] of Object.entries(result.tagStatus)) store.setSimulationStatus(tag, status);
          if (writes.length && !store.simulation.on) store.setSimulationOn(true);
          renderFaceplateVisuals();
          if (result.navigation.length) hmiPopupManager.closeParentBound("screen");
          frameRef.current?.contentWindow?.postMessage({ type: "framecraft:hmi-event-result", instanceId: message.instanceId, navigation: result.navigation, faceplateEvents: result.faceplateEvents, faceplateFromParent: true }, "*");
        }).catch((error) => useEditorStore.getState().addPreviewOutput("stderr", `[HMI FACEPLATE ${message.eventName}] ${error instanceof Error ? error.message : String(error)}`));
      } else if (event.data.type === "framecraft:popup-user-close") {
        try { hmiPopupManager.close({ popupId: event.data.popupId }); }
        catch (error) { useEditorStore.getState().addPreviewOutput("stderr", `[HMI POPUP] ${error instanceof Error ? error.message : String(error)}`); }
      } else if (event.data.type === "framecraft:state-page") {
        syncStatePage(event.data.value);
      } else if (event.data.type === "framecraft:resize") {
        if (sizeGrants.current >= contentGrantLimit) return;
        const { width, height } = sizeRef.current;
        const panel = panelFormat(viewport);
        const nextWidth = settledContentSize(width, normalizeContentWidth(event.data.width, panel.width));
        const nextHeight = settledContentSize(height, normalizeContentHeight(event.data.height, panel.height));
        if (nextWidth === width && nextHeight === height) return;
        sizeGrants.current += 1;
        sizeRef.current = { width: nextWidth, height: nextHeight };
        setContentWidth(nextWidth);
        setContentHeight(nextHeight);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [commitMultiSelection, deleteSelection, insert, inspectSource, selectSource, setMultiSelection, setSelectionRect, setSelectionInfo, setSelectionStyles, syncPreviewPath, syncStatePage, updateStyles, updateText, interactionMode, requestedStatePage, snap.enabled, snap.grid, viewport, multiSelection, hmiPopupManager, hmiTimerManager]);

  const recoveryActions = <div className="preview-error-actions">
    <button disabled={previewBusy} onClick={() => void restartPreview()}><RefreshCw size={14} /> {previewBusy ? "Avvio dell’anteprima…" : "Riprova anteprima"}</button>
    <button disabled={previewBusy} onClick={() => void restartPreview(true)} title="Riavvia l’anteprima ricompilando le dipendenze. Non corregge errori nel codice."><RefreshCw size={14} /> Ricompila anteprima</button>
    <button onClick={() => setConsoleOpen(true)}><TerminalSquare size={14} /> Apri diagnostica</button>
    {previewSrc && <button disabled={previewBusy} onClick={markPreviewReady}><X size={14} /> Continua comunque</button>}
  </div>;

  return <section className="canvas-area" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
    event.preventDefault();
    const jsx = event.dataTransfer.getData("application/x-framecraft-jsx");
    if (jsx) void insert(jsx);
  }}>
    {zonePicking && <div className="highlight-picker-banner zone-picker-banner" role="status">
      <MousePointerClick size={15} />
      <span>{zonePicking.mode === "point"
        ? <><strong>Indica il punto</strong> Clicca sulla foto dove va il bottone.</>
        : <><strong>Disegna il contorno</strong> Clicca gli angoli uno dopo l’altro, poi premi Invio. Punti: {zonePicking.points.length}</>}</span>
      {zonePicking.mode === "path" && <button onClick={() => void useEditorStore.getState().finishZonePicking()}>Fine</button>}
      <button onClick={() => useEditorStore.getState().cancelZonePicking()} aria-label="Annulla" title="Annulla (Esc)"><X size={15} /></button>
    </div>}
    {highlightPicker && <div className="highlight-picker-banner" role="status">
      <Highlighter size={15} />
      <span className="region-picker-instructions"><strong>Collega “{highlightPicker.triggerLabel}”</strong>{highlightPicker.mode === "element" ? "Clicca nel canvas la parte da evidenziare." : highlightPicker.mode === "rectangle" ? "Trascina sulla foto o sul disegno per delimitare la zona." : "Clicca gli angoli del contorno, poi premi Invio o Fine. Backspace toglie l’ultimo punto."}{regionMessage && <small role="alert">{regionMessage}</small>}</span>
      {highlightPicker.mode === "polygon" && <button type="button" className="region-picker-finish" onPointerDown={(event) => event.preventDefault()} onClick={() => frameRef.current?.contentWindow?.postMessage({ type: "framecraft:finish-region-pick", requestId: highlightPicker.requestId }, "*")}>Fine</button>}
      <button onClick={cancelHighlightSelection} aria-label="Annulla selezione evidenziazione" title="Annulla (Esc)"><X size={15} /></button>
    </div>}
    {!guideDismissed && previewStatus === "ready" && interactionMode === "edit" && !selection && multiSelection.length === 0 && !highlightPicker && <aside className="canvas-start-guide" aria-label="Come iniziare">
      <button className="canvas-guide-close" onClick={() => setGuideDismissed(true)} aria-label="Nascondi suggerimento"><X size={14} /></button>
      <small>MODIFICA VISUALE</small>
      <strong>Clicca un elemento della pagina</strong>
      <p>Compariranno subito testo, dimensioni, colori, azioni e variabile PLC nel pannello a destra.</p>
      <div><button onClick={() => openPanel("components")}><Boxes size={14} /> Aggiungi elemento</button><button onClick={() => openPanel("pages")}><Route size={14} /> Cambia pagina</button></div>
    </aside>}
    <div className="canvas-scroll" ref={scrollRef}>
      <div className="canvas-stage" style={{ width: contentWidth * effectiveZoom, minHeight: contentHeight * effectiveZoom }}>
        <div className="canvas-frame-wrap" style={{ width: contentWidth, height: contentHeight, transform: `scale(${effectiveZoom})` }}>
          {previewSrc && <>
             <iframe ref={frameRef} src={previewSrc} title="Project preview" sandbox="allow-scripts allow-forms allow-modals allow-same-origin allow-popups" onLoad={() => { sendMode(); sendStatePage(); }} />
            {draggedComponent && <div className={`canvas-component-drop-surface ${componentDropPoint ? "inside" : ""}`}>
              <span>{componentDropPoint ? "Rilascia qui" : "Porta il componente dentro la pagina"}</span>
              {componentDropPoint && <i style={{ left: componentDropPoint.x, top: componentDropPoint.y }} />}
            </div>}
            {interactionMode === "edit" && multiSelection.map((item) => <div key={item.instanceId} className="selection-box group"
              style={{ left: item.rect.x, top: item.rect.y, width: item.rect.width, height: item.rect.height }} />)}
            {interactionMode === "edit" && selection && !highlightPicker && <div
              className={`selection-box ${transforming ? "transforming" : ""} ${selectionInfo?.locked ? "locked" : ""}`}
              style={{ left: selection.rect.x, top: selection.rect.y, width: selection.rect.width, height: selection.rect.height }}
            >
              {/* An element the app makes click-through is shown but never offered for dragging:
                  moving it from the canvas is exactly what the user does not want to happen. */}
              {selectionInfo?.locked
                ? <span className={`selection-drag-handle locked ${selection.rect.y < 32 ? "inside" : ""}`}><Lock size={11} /><span>{Math.round(selection.rect.width)} × {Math.round(selection.rect.height)}</span></span>
                : <>
                  <button className={`selection-drag-handle ${selection.rect.y < 32 ? "inside" : ""}`} onPointerDown={(event) => beginTransform(event, "move")} title="Trascina per spostare" aria-label="Sposta elemento">
                    <Move size={12} /><span>{Math.round(selection.rect.width)} × {Math.round(selection.rect.height)}</span>
                  </button>
                  {resizeHandles.map((handle) => <button key={handle} className={`resize-handle resize-${handle}`} onPointerDown={(event) => beginTransform(event, handle)} title={`Ridimensiona ${handle}`} aria-label={`Ridimensiona ${handle}`} />)}
                </>}
            </div>}
          </>}
        </div>
      </div>
    </div>
    {(!previewSrc || previewStatus === "error") && <div className={`preview-empty preview-state-overlay${previewStatus === "error" ? " preview-error" : ""}`} role={previewStatus === "error" ? "alert" : "status"}>
      {previewStatus === "error" ? <>
        <AlertTriangle size={24} /><strong>{previewSrc ? "L’anteprima segnala un problema" : "Anteprima non disponibile"}</strong>
        <MessageNotice context="preview" raw={previewError ?? "L’anteprima non è stata avviata."} />{recoveryActions}
      </> : <><RefreshCw className="spin" size={22} /><strong>Avvio dell’anteprima…</strong><span>Preparo la visualizzazione del pannello. Le modifiche non salvate restano nell’editor.</span></>}
    </div>}
  </section>;
}
