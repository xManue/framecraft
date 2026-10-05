import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { AlertTriangle, CheckCircle2, Info, Undo2, X } from "lucide-react";
import { ActivityBar } from "./ActivityBar";
import { LeftPanel } from "./LeftPanel";
import { TopBar } from "./TopBar";
import { ConsolePanel } from "./ConsolePanel";
import { Inspector } from "../inspector/Inspector";
import { Workspace } from "./Workspace";
import { densityScale, useEditorStore, type PaneSizes } from "../state/editorStore";
import { StandalonePreview } from "../preview/StandalonePreview";
import { consoleMessageSource, describeEditorMessage } from "../core/editorMessages";

/** The bar between two panels. It is dragged in the editor's own pixels, which are not the screen's
 * once the interface is scaled up, so the pointer distance is divided back down before it is used. */
function PaneResizer({ pane, edge, scale }: { pane: keyof PaneSizes; edge: "left" | "right"; scale: number }) {
  const width = useEditorStore((state) => state.paneSizes[pane]);
  const setPaneSize = useEditorStore((state) => state.setPaneSize);
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
  return <div className={`pane-resizer pane-resizer-${pane}`} role="separator" aria-orientation="vertical"
    aria-label={pane === "left" ? "Larghezza pannello sinistro" : "Larghezza pannello proprietà"}
    onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
    // Reaching for the keyboard is the way back when a panel has been dragged somewhere unusable.
    tabIndex={0} onKeyDown={(event) => {
      const step = event.shiftKey ? 40 : 10;
      if (event.key === "ArrowLeft") setPaneSize(pane, width + (edge === "left" ? -step : step));
      if (event.key === "ArrowRight") setPaneSize(pane, width + (edge === "left" ? step : -step));
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
  const consoleOpen = useEditorStore((state) => state.consoleOpen);
  const leftPanelCollapsed = useEditorStore((state) => state.leftPanelCollapsed);
  const standalonePreviewOpen = useEditorStore((state) => state.standalonePreviewOpen);
  const paneSizes = useEditorStore((state) => state.paneSizes);
  const density = useEditorStore((state) => state.uiDensity);
  const scale = densityScale[density];
  // The whole shell is scaled from one place. Everything inside keeps its own sizes in editor
  // pixels, so no rule has to know that the interface can be made larger.
  useEffect(() => {
    document.documentElement.style.setProperty("--ui", String(scale));
  }, [scale]);
  return (
    <>
      <main className="app-shell">
        <TopBar />
        <div className={`editor-grid ${leftPanelCollapsed ? "left-collapsed" : ""}`}
          style={{ "--pane-left": `${paneSizes.left}px`, "--pane-inspector": `${paneSizes.inspector}px` } as React.CSSProperties}>
          <ActivityBar />
          {!leftPanelCollapsed && <LeftPanel />}
          <section className="workspace-stack">
            <Workspace />
            {consoleOpen && <ConsolePanel />}
          </section>
          <Inspector />
          {!leftPanelCollapsed && <PaneResizer pane="left" edge="left" scale={scale} />}
          <PaneResizer pane="inspector" edge="right" scale={scale} />
        </div>
        <ActionToast />
      </main>
      {standalonePreviewOpen && <StandalonePreview />}
    </>
  );
}
