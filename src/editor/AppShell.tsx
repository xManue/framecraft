import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { AlertTriangle, CheckCircle2, FileText, Info, PanelRightClose, PanelRightOpen, Undo2, X } from "lucide-react";
import { ActivityBar } from "./ActivityBar";
import { LeftPanel } from "./LeftPanel";
import { TopBar } from "./TopBar";
import { ConsolePanel } from "./ConsolePanel";
import { Inspector } from "../inspector/Inspector";
import { Workspace } from "./Workspace";
import { densityScale, layoutPresets, useEditorStore, type PaneSizes } from "../state/editorStore";
import { fitWorkspacePanes } from "../core/workspaceLayout";
import { StandalonePreview } from "../preview/StandalonePreview";
import { consoleMessageSource, describeEditorMessage } from "../core/editorMessages";
import { useEditorAi } from "../state/editorAi";
import { AiProjectChat } from "./AiProjectChat";
import { AiContextMenu } from "./AiContextMenu";
import "./workspace-chrome.css";

/** The bar between two panels. It is dragged in the editor's own pixels, which are not the screen's
 * once the interface is scaled up, so the pointer distance is divided back down before it is used. */
function PaneResizer({ pane, edge, scale, width }: { pane: keyof PaneSizes; edge: "left" | "right"; scale: number; width: number }) {
  const setPaneSize = useEditorStore((state) => state.setPaneSize);
  const workLayout = useEditorStore((state) => state.workLayout);
  const reset = () => setPaneSize(pane, layoutPresets[workLayout].panes[pane]);
  const drag = useRef<{ pointerId: number; clientX: number; width: number }>(undefined);
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    drag.current = { pointerId: event.pointerId, clientX: event.clientX, width };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = drag.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const delta = (event.clientX - session.clientX) / scale;
    setPaneSize(pane, session.width + (edge === "left" ? delta : -delta));
  };
  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  return <div className={`pane-resizer pane-resizer-${pane}`} role="separator" aria-orientation="vertical" aria-valuenow={Math.round(width)}
    aria-label={pane === "left" ? "Larghezza pannello sinistro" : "Larghezza pannello proprietà"}
    title="Trascina per allargare o restringere. Doppio clic per ripristinare la larghezza."
    onDoubleClick={reset}
    onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
    // Reaching for the keyboard is the way back when a panel has been dragged somewhere unusable.
    tabIndex={0} onKeyDown={(event) => {
      const step = event.shiftKey ? 40 : 10;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setPaneSize(pane, width + (event.key === "ArrowRight" ? 1 : -1) * (edge === "left" ? 1 : -1) * step);
      } else if (event.key === "Home") { event.preventDefault(); reset(); }
    }} />;
}

export function ActionToast() {
  const entries = useEditorStore((state) => state.consoleEntries);
  const undoCount = useEditorStore((state) => state.history.length);
  const undo = useEditorStore((state) => state.undo);
  const showDiagnostics = useEditorStore((state) => state.setConsoleOpen);
  const last = [...entries].reverse().find((item) => item.level !== "info");
  const [visibleId, setVisibleId] = useState<string>();
  useEffect(() => {
    if (!last) return;
    setVisibleId(last.id);
    if (last.level === "error") return;
    const timer = window.setTimeout(() => setVisibleId((current) => current === last.id ? undefined : current), last.level === "warning" ? 10000 : 4500);
    return () => window.clearTimeout(timer);
  }, [last?.id]);
  if (!last || visibleId !== last.id) return null;
  const message = describeEditorMessage(last.message, consoleMessageSource(last) === "preview" ? "preview" : "editor", last.level);
  const Icon = last.level === "success" ? CheckCircle2 : last.level === "error" ? AlertTriangle : Info;
  return <div className={`action-toast ${last.level}`} role={last.level === "error" ? "alert" : "status"} aria-live={last.level === "error" ? "assertive" : "polite"}>
    <Icon size={18} /><span>{message.text}{message.nextStep && <small>{message.nextStep}</small>}</span>
    {(last.level === "error" || last.level === "warning") && <button onClick={() => { showDiagnostics(true); setVisibleId(undefined); }}>Apri diagnostica</button>}
    {last.level === "success" && undoCount > 0 && <button onClick={() => { void undo(); setVisibleId(undefined); }}><Undo2 size={14} /> Annulla</button>}
    <button className="toast-close" onClick={() => setVisibleId(undefined)} aria-label="Chiudi messaggio"><X size={15} /></button>
  </div>;
}

export function AppShell() {
  const chatOpen = useEditorAi(state => state.open && state.mode === "edit");
  const consoleOpen = useEditorStore((state) => state.consoleOpen);
  const leftPanelCollapsed = useEditorStore((state) => state.leftPanelCollapsed);
  const standalonePreviewOpen = useEditorStore((state) => state.standalonePreviewOpen);
  const paneSizes = useEditorStore((state) => state.paneSizes);
  const density = useEditorStore((state) => state.uiDensity);
  const editing = useEditorStore(state => state.interactionMode === "edit");
  const pageTitle = useEditorStore(state => state.pages.find(page => page.id === state.activePageId)?.name ?? state.document?.file.split(/[\\/]/).at(-1) ?? "Pannello");
  const selection = useEditorStore(state => {
    if (state.multiSelection.length > 1) return JSON.stringify(state.multiSelection.map(item => item.instanceId).sort());
    const node = state.selectedId ? state.document?.nodes[state.selectedId] : undefined;
    if (node) return JSON.stringify([node.source.file, node.source.start, node.type, state.selectionInfo?.listIndex, state.selectionInfo?.instanceIndex]);
    const unresolved = state.unresolvedSelection;
    return unresolved ? JSON.stringify([unresolved.file, unresolved.source?.start, unresolved.tag]) : "";
  });
  const propertiesRequest = useEditorStore(state => Math.max(state.propertiesExpandedAt ?? 0, state.textFocusRequestedAt ?? 0));
  const [dismissedProperties, setDismissedProperties] = useState<{ selection: string; request: number }>();
  const propertiesOpen = editing && !!selection && (dismissedProperties?.selection !== selection || dismissedProperties.request !== propertiesRequest);
  const rightOpen = chatOpen || propertiesOpen;
  const propertiesButton = useRef<HTMLButtonElement>(null);
  function closeProperties() {
    setDismissedProperties({ selection, request: propertiesRequest });
    propertiesButton.current?.focus({ preventScroll: true });
  }
  const scale = densityScale[density];
  const grid = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(() => window.innerWidth / scale);
  const visiblePanes = fitWorkspacePanes(paneSizes, gridWidth, leftPanelCollapsed, rightOpen);
  // The whole shell is scaled from one place. Everything inside keeps its own sizes in editor
  // pixels, so no rule has to know that the interface can be made larger.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--ui", String(scale));
    const measure = () => { if (grid.current) setGridWidth(grid.current.clientWidth); };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
    if (grid.current) observer?.observe(grid.current);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [scale]);
  return (
    <>
      <main className="app-shell">
        <TopBar />
        <div className={`editor-grid ${leftPanelCollapsed ? "left-collapsed" : ""} ${rightOpen ? "" : "inspector-closed"}`} ref={grid}
          style={{ "--pane-left": `${visiblePanes.left}px`, "--pane-inspector": `${visiblePanes.inspector}px` } as React.CSSProperties}>
          <ActivityBar />
          {!leftPanelCollapsed && <LeftPanel />}
          <section className="workspace-stack">
            <header className="workspace-heading"><span className="workspace-page-title"><FileText size={15} aria-hidden="true" />{pageTitle}</span><button type="button" ref={propertiesButton} disabled={!selection || !editing} aria-expanded={!chatOpen && propertiesOpen} aria-controls="editor-property-panel" title={selection ? "Mostra o nascondi le proprietà dell’elemento selezionato" : "Seleziona un elemento per aprire le sue proprietà"} onClick={() => {
              if (chatOpen) { useEditorAi.getState().close(); setDismissedProperties(undefined); }
              else if (propertiesOpen) closeProperties(); else setDismissedProperties(undefined);
            }}><PanelRightOpen size={16} aria-hidden="true" /><span>Proprietà</span></button></header>
            <Workspace />
            {consoleOpen && <ConsolePanel />}
          </section>
          <section id="editor-property-panel" className={`editor-right-pane ${chatOpen ? "chat-open" : ""}`} hidden={!rightOpen}>
            {!chatOpen && <button type="button" className="context-panel-close" aria-label="Nascondi proprietà" title="Nascondi proprietà e lascia più spazio al canvas" onClick={closeProperties}><PanelRightClose size={16} /></button>}
            {chatOpen ? <AiProjectChat /> : <Inspector />}
          </section>
          {!leftPanelCollapsed && <PaneResizer pane="left" edge="left" scale={scale} width={visiblePanes.left} />}
          {rightOpen && <PaneResizer pane="inspector" edge="right" scale={scale} width={visiblePanes.inspector} />}
        </div>
        <ActionToast />
        <AiContextMenu />
      </main>
      {standalonePreviewOpen && <StandalonePreview />}
    </>
  );
}
