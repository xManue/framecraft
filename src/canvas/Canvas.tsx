import { AlertTriangle, Compass, Highlighter, Maximize, Minus, Move, Pencil, Plus, RefreshCw, TerminalSquare, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import type { ElementGeometry, PreviewMessage, ResizeHandle, SelectionRect, SourceRef, TransformOperation } from "../core/types";
import { useEditorStore } from "../state/editorStore";
import { fitCanvasZoom, normalizeContentHeight, normalizeContentWidth } from "./sizing";
import { stylePatch, transformedRect } from "./transformGeometry";

const widths = { desktop: 1440, laptop: 1200, tablet: 768, mobile: 390 };
const resizeHandles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
type Selection = { source: SourceRef; instanceId: string; rect: SelectionRect; geometry: ElementGeometry };
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
};

export function Canvas() {
  const previewUrl = useEditorStore((state) => state.previewUrl);
  const previewPath = useEditorStore((state) => state.previewPath);
  const requestedStatePage = useEditorStore((state) => state.requestedStatePage);
  const previewStatus = useEditorStore((state) => state.previewStatus);
  const previewError = useEditorStore((state) => state.previewError);
  const interactionMode = useEditorStore((state) => state.interactionMode);
  const highlightPicker = useEditorStore((state) => state.highlightPicker);
  const draggedComponent = useEditorStore((state) => state.draggedComponent);
  const setDraggedComponent = useEditorStore((state) => state.setDraggedComponent);
  const viewport = useEditorStore((state) => state.viewport);
  const zoom = useEditorStore((state) => state.zoom);
  const setZoom = useEditorStore((state) => state.setZoom);
  const setInteractionMode = useEditorStore((state) => state.setInteractionMode);
  const setConsoleOpen = useEditorStore((state) => state.setConsoleOpen);
  const selectSource = useEditorStore((state) => state.selectSource);
  const setSelectionRect = useEditorStore((state) => state.setSelectionRect);
  const setSelectionStyles = useEditorStore((state) => state.setSelectionStyles);
  const updateText = useEditorStore((state) => state.updateText);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
  const insert = useEditorStore((state) => state.insertComponent);
  const syncPreviewPath = useEditorStore((state) => state.syncPreviewPath);
  const syncStatePage = useEditorStore((state) => state.syncStatePage);
  const refresh = useEditorStore((state) => state.refreshPreview);
  const restartPreview = useEditorStore((state) => state.restartPreview);
  const markPreviewReady = useEditorStore((state) => state.markPreviewReady);
  const cancelHighlightSelection = useEditorStore((state) => state.cancelHighlightSelection);
  const updateStyles = useEditorStore((state) => state.updateStyles);
  const document = useEditorStore((state) => state.document);
  const selectedId = useEditorStore((state) => state.selectedId);
  const selectedNode = selectedId ? document?.nodes[selectedId] : undefined;
  const [selection, setSelection] = useState<Selection>();
  const [transforming, setTransforming] = useState(false);
  const [contentHeight, setContentHeight] = useState(760);
  const [contentWidth, setContentWidth] = useState(widths.desktop);
  const [availableWidth, setAvailableWidth] = useState(1000);
  const [fitCanvas, setFitCanvas] = useState(true);
  const [componentDropPoint, setComponentDropPoint] = useState<{ x: number; y: number }>();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<TransformSession | undefined>(undefined);
  const selectionRef = useRef<Selection | undefined>(undefined);
  const fittedZoom = fitCanvasZoom(availableWidth, contentWidth);
  const effectiveZoom = fitCanvas ? fittedZoom : zoom;
  const previewSrc = useMemo(() => {
    if (!previewUrl) return undefined;
    const url = new URL(previewUrl);
    url.pathname = previewPath || "/";
    return url.toString();
  }, [previewPath, previewUrl]);

  function sendMode() {
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:set-mode", mode: interactionMode }, "*");
  }

  function sendStatePage() {
    if (requestedStatePage) frameRef.current?.contentWindow?.postMessage({ type: "framecraft:open-state-page", value: requestedStatePage }, "*");
  }

  function sendPreviewStyles(source: SourceRef, instanceId: string, styles: Record<string, string | number>) {
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:preview-style", source, instanceId, styles }, "*");
  }

  function requestSelection(source: SourceRef, instanceId?: string) {
    frameRef.current?.contentWindow?.postMessage({ type: "framecraft:request-selection", source, instanceId }, "*");
  }

  function componentPoint(event: ReactDragEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, (event.clientX - rect.left) / effectiveZoom),
      y: Math.max(0, (event.clientY - rect.top) / effectiveZoom),
    };
  }

  function beginTransform(event: ReactPointerEvent<HTMLButtonElement>, operation: TransformOperation) {
    if (!selection) return;
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
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== session.pointerId) return;
      if (pointerEvent.cancelable) pointerEvent.preventDefault();
      const next = transformedRect(session.origin, session.operation, (pointerEvent.clientX - session.startX) / effectiveZoom, (pointerEvent.clientY - session.startY) / effectiveZoom);
      session.latest = next;
      setSelection((current) => current ? { ...current, rect: next } : current);
      setSelectionRect(next);
      sendPreviewStyles(session.source, session.instanceId, stylePatch(session.origin, next, session.geometry, session.operation));
    };
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== session.pointerId) return;
      session.cleanup?.();
      transformRef.current = undefined;
      setTransforming(false);
      const styles = stylePatch(session.origin, session.latest, session.geometry, session.operation);
      const changed = session.latest.x !== session.origin.x || session.latest.y !== session.origin.y
        || session.latest.width !== session.origin.width || session.latest.height !== session.origin.height;
      if (changed) void selectSource(session.source).then(() => updateStyles(styles));
    };
    session.cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    transformRef.current = session;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setTransforming(true);
  }

  useEffect(() => {
    return () => { transformRef.current?.cleanup?.(); };
  }, []);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    sendMode();
    if (interactionMode === "navigate") { setSelection(undefined); setSelectionRect(undefined); }
  }, [interactionMode]);

  useEffect(() => {
    sendStatePage();
  }, [requestedStatePage, previewSrc]);

  useEffect(() => {
    if (!selectedNode) return;
    const current = selectionRef.current;
    if (current && current.source.file === selectedNode.source.file && current.source.start === selectedNode.source.start && current.source.end === selectedNode.source.end) return;
    requestSelection(selectedNode.source);
  }, [selectedNode?.id]);

  useEffect(() => {
    if (!highlightPicker) return;
    const cancelOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") cancelHighlightSelection(); };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [cancelHighlightSelection, highlightPicker]);

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
    setContentHeight(760);
    setContentWidth(widths[viewport]);
    setSelection(undefined);
    setSelectionRect(undefined);
  }, [previewPath, previewUrl, viewport]);

  useEffect(() => {
    const listener = (event: MessageEvent<PreviewMessage>) => {
      if (!event.data?.type || event.source !== frameRef.current?.contentWindow) return;
      if (event.data.type === "framecraft:select") {
        const selectMessage = event.data;
        const currentDocument = useEditorStore.getState().document;
        const sourceNode = currentDocument && Object.values(currentDocument.nodes).find((node) => node.source.file === selectMessage.source.file
          && node.source.start === selectMessage.source.start && node.source.end === selectMessage.source.end);
        const savedScale = typeof sourceNode?.styles.scale === "string" ? sourceNode.styles.scale : "none";
        const geometry = event.data.geometry
          ? { ...event.data.geometry, scale: event.data.geometry.scale || savedScale }
          : { display: "block", translate: "none", scale: savedScale, cssWidth: event.data.rect.width, cssHeight: event.data.rect.height };
        setSelection({
          source: event.data.source,
          instanceId: event.data.instanceId,
          rect: event.data.rect,
          geometry,
        });
        setSelectionRect(event.data.rect);
        const styles = event.data.styles ?? {
          display: geometry.display,
          translate: geometry.translate,
          scale: geometry.scale,
          width: `${Math.round(geometry.cssWidth * 10) / 10}px`,
          height: `${Math.round(geometry.cssHeight * 10) / 10}px`,
        };
        void selectSource(event.data.source).then(() => setSelectionStyles(styles));
      } else if (event.data.type === "framecraft:edit-text") {
        const { source, value } = event.data;
        void selectSource(source).then(() => updateText(value));
      } else if (event.data.type === "framecraft:drop") {
        const { source, jsx, x, y, positionContainer } = event.data;
        void insert(jsx, { source, x, y, positionContainer });
      } else if (event.data.type === "framecraft:drag-move") {
        const { source, instanceId, rect } = event.data;
        setSelection((current) => current && current.instanceId === instanceId && current.source.file === source.file && current.source.start === source.start ? { ...current, rect } : current);
        setSelectionRect(rect);
      } else if (event.data.type === "framecraft:drag-end") {
        const { source, instanceId, rect, translate } = event.data;
        setSelection((current) => current && current.instanceId === instanceId && current.source.file === source.file && current.source.start === source.start ? { ...current, rect } : current);
        setSelectionRect(rect);
        void selectSource(source).then(() => updateStyles({ translate }));
      } else if (event.data.type === "framecraft:delete") {
        const { source } = event.data;
        void selectSource(source).then(async () => {
          await deleteSelection();
          if (!useEditorStore.getState().selectedId) {
            setSelection(undefined);
            setSelectionRect(undefined);
          }
        });
      } else if (event.data.type === "framecraft:ready") {
        sendMode();
        sendStatePage();
        const currentSelectedId = useEditorStore.getState().selectedId;
        const currentDocument = useEditorStore.getState().document;
        const currentNode = currentSelectedId ? currentDocument?.nodes[currentSelectedId] : undefined;
        const currentSelection = selectionRef.current;
        if (currentNode) requestSelection(currentNode.source, currentSelection?.source.file === currentNode.source.file && currentSelection.source.start === currentNode.source.start ? currentSelection.instanceId : undefined);
        void syncPreviewPath(event.data.path);
      } else if (event.data.type === "framecraft:state-page") {
        syncStatePage(event.data.value);
      } else if (event.data.type === "framecraft:resize") {
        setContentWidth(normalizeContentWidth(event.data.width, widths[viewport]));
        setContentHeight(normalizeContentHeight(event.data.height));
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [deleteSelection, insert, selectSource, setSelectionRect, setSelectionStyles, syncPreviewPath, syncStatePage, updateStyles, updateText, interactionMode, requestedStatePage, viewport]);

  return <section className="canvas-area" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
    event.preventDefault();
    const jsx = event.dataTransfer.getData("application/x-framecraft-jsx");
    if (jsx) void insert(jsx);
  }}>
    <div className="canvas-toolbar">
      <div className="interaction-switch" role="group" aria-label="Canvas interaction">
        <button className={interactionMode === "navigate" ? "active" : ""} onClick={() => setInteractionMode("navigate")} title="Usa link, menu, campi e pulsanti"><Compass size={14} /><span>Naviga</span></button>
        <button className={interactionMode === "edit" ? "active" : ""} onClick={() => setInteractionMode("edit")} title="Seleziona e modifica gli elementi"><Pencil size={13} /><span>Modifica</span></button>
      </div>
      <span className="interaction-hint">{highlightPicker ? "Scegli la parte da evidenziare" : interactionMode === "navigate" ? "La pagina è utilizzabile" : selection ? "Trascina: sposta · punti: ridimensiona · Canc: elimina" : "Clicca un elemento per modificarlo"}</span>
      <span className="canvas-size">{contentWidth} × {contentHeight} px</span>
      <div className="zoom-controls">
        <button onClick={() => { setFitCanvas(false); setZoom(effectiveZoom - 0.1); }} aria-label="Zoom out"><Minus size={13} /></button>
        <button className="zoom-value" onClick={() => { setFitCanvas(false); setZoom(1); }}>{Math.round(effectiveZoom * 100)}%</button>
        <button onClick={() => { setFitCanvas(false); setZoom(effectiveZoom + 0.1); }} aria-label="Zoom in"><Plus size={13} /></button>
        <button className={`fit-button ${fitCanvas ? "active" : ""}`} onClick={() => setFitCanvas(true)} aria-label="Adatta il canvas allo spazio" title="Adatta automaticamente allo spazio disponibile"><Maximize size={13} /><span>Adatta</span></button>
        <button onClick={refresh} aria-label="Refresh preview" title="Refresh preview"><RefreshCw size={13} /></button>
      </div>
    </div>
    {highlightPicker && <div className="highlight-picker-banner" role="status">
      <Highlighter size={15} />
      <span><strong>Collega “{highlightPicker.triggerLabel}”</strong> Clicca nel canvas la parte da evidenziare.</span>
      <button onClick={cancelHighlightSelection} aria-label="Annulla selezione evidenziazione" title="Annulla (Esc)"><X size={15} /></button>
    </div>}
    <div className="canvas-scroll" ref={scrollRef}>
      <div className="canvas-stage" style={{ width: contentWidth * effectiveZoom, minHeight: contentHeight * effectiveZoom }}>
        <div className="canvas-frame-wrap" style={{ width: contentWidth, height: contentHeight, transform: `scale(${effectiveZoom})` }}>
          {previewSrc ? <>
             <iframe ref={frameRef} src={previewSrc} title="Project preview" sandbox="allow-scripts allow-forms allow-modals allow-same-origin allow-popups" onLoad={() => { sendMode(); sendStatePage(); }} />
            {draggedComponent && <div className="canvas-component-drop-surface"
              onDragEnter={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
              onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; setComponentDropPoint(componentPoint(event)); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setComponentDropPoint(undefined); }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const point = componentPoint(event);
                frameRef.current?.contentWindow?.postMessage({ type: "framecraft:drop-at-point", jsx: draggedComponent, ...point }, "*");
                setComponentDropPoint(undefined);
                setDraggedComponent(undefined);
              }}
            >
              <span>Rilascia il componente nel punto desiderato</span>
              {componentDropPoint && <i style={{ left: componentDropPoint.x, top: componentDropPoint.y }} />}
            </div>}
            {interactionMode === "edit" && selection && <div
              className={`selection-box ${transforming ? "transforming" : ""}`}
              style={{ left: selection.rect.x, top: selection.rect.y, width: selection.rect.width, height: selection.rect.height }}
            >
              <button className={`selection-drag-handle ${selection.rect.y < 32 ? "inside" : ""}`} onPointerDown={(event) => beginTransform(event, "move")} title="Trascina per spostare" aria-label="Sposta elemento">
                <Move size={12} /><span>{Math.round(selection.rect.width)} × {Math.round(selection.rect.height)}</span>
              </button>
              {resizeHandles.map((handle) => <button key={handle} className={`resize-handle resize-${handle}`} onPointerDown={(event) => beginTransform(event, handle)} title={`Ridimensiona ${handle}`} aria-label={`Ridimensiona ${handle}`} />)}
            </div>}
            {/* A running preview is never unmounted: the failure is reported over it so the page can be recovered. */}
            {previewStatus === "error" && <div className="preview-empty preview-error preview-error-overlay"><AlertTriangle size={24} /><strong>La preview segnala un errore</strong><span>{previewError}</span><div className="preview-error-actions"><button onClick={() => void restartPreview()}><RefreshCw size={14} /> Riavvia anteprima</button><button onClick={() => setConsoleOpen(true)}><TerminalSquare size={14} /> Diagnostica</button><button onClick={markPreviewReady}><X size={14} /> Continua comunque</button></div></div>}
          </> : previewStatus === "error" ? <div className="preview-empty preview-error"><AlertTriangle size={24} /><strong>Anteprima non disponibile</strong><span>{previewError}</span><div className="preview-error-actions"><button onClick={() => void restartPreview()}><RefreshCw size={14} /> Riavvia anteprima</button><button onClick={() => setConsoleOpen(true)}><TerminalSquare size={14} /> Diagnostica</button></div></div>
            : <div className="preview-empty"><RefreshCw className="spin" size={22} /><strong>Avvio dell’anteprima…</strong><span>L’editor resta utilizzabile anche se Vite segnala un errore.</span></div>}
        </div>
      </div>
    </div>
  </section>;
}
