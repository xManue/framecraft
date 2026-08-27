import { ArrowLeft, Code2, Eye, FolderOpen, Laptop, Maximize2, Monitor, Play, Redo2, Save, Smartphone, Tablet, Undo2 } from "lucide-react";
import { useEditorStore } from "../state/editorStore";
import type { ViewMode, Viewport } from "../core/types";

const viewports: { id: Viewport; label: string; icon: typeof Monitor }[] = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "laptop", label: "Laptop", icon: Laptop },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone },
];

export function TopBar() {
  const project = useEditorStore((state) => state.project)!;
  const viewport = useEditorStore((state) => state.viewport);
  const setViewport = useEditorStore((state) => state.setViewport);
  const mode = useEditorStore((state) => state.viewMode);
  const setMode = useEditorStore((state) => state.setViewMode);
  const previewUrl = useEditorStore((state) => state.previewUrl);
  const save = useEditorStore((state) => state.save);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const undoCount = useEditorStore((state) => state.history.length);
  const redoCount = useEditorStore((state) => state.future.length);
  const dirty = useEditorStore((state) => state.dirty);
  const closeProject = useEditorStore((state) => state.closeProject);
  const switchProject = useEditorStore((state) => state.chooseAndOpenProject);
  const openPreview = useEditorStore((state) => state.openStandalonePreview);
  return <header className="topbar">
    <div className="topbar-project">
      <button onClick={() => void closeProject()} title="Torna ai progetti" aria-label="Torna ai progetti"><ArrowLeft size={15} /></button>
      <span className="brand-mini">F</span><strong>{project.name}</strong>
      {project.isWorkingCopy && <span className="working-copy-badge" title={project.originalRoot ? `Originale protetto: ${project.originalRoot}` : "Progetto creato nell'area di lavoro Framecraft"}>COPIA</span>}
      <button onClick={() => void switchProject()} title="Cambia progetto" aria-label="Cambia progetto"><FolderOpen size={14} /></button>
    </div>
    <div className="history-actions">
      <button onClick={() => void undo()} disabled={!undoCount} title={`Annulla (${undoCount} azioni) · Ctrl+Z`} aria-label="Annulla ultima azione"><Undo2 size={16} />{undoCount > 0 && <span className="history-count">{undoCount}</span>}</button>
      <button onClick={() => void redo()} disabled={!redoCount} title={`Ripristina (${redoCount} azioni) · Ctrl+Shift+Z`} aria-label="Ripristina azione"><Redo2 size={16} />{redoCount > 0 && <span className="history-count">{redoCount}</span>}</button>
      <button onClick={() => void save()} title="Save (Ctrl+S)" aria-label="Save"><Save size={16} />{dirty && <span className="dirty-dot" />}</button>
    </div>
    <div className="viewport-switch" aria-label="Canvas viewport">
      {viewports.map(({ id, label, icon: Icon }) => <button key={id} className={viewport === id ? "active" : ""} onClick={() => setViewport(id)} title={label} aria-label={label}><Icon size={15} /></button>)}
    </div>
    <div className="mode-switch">
      {(["visual", "split", "code"] as ViewMode[]).map((item) => <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item === "visual" ? <Eye size={14} /> : <Code2 size={14} />}{item}</button>)}
    </div>
    <div className="topbar-run">
      <button className="run-button standalone" onClick={() => void openPreview()} disabled={!previewUrl} title="Prova il progetto a schermo intero"><Play size={14} fill="currentColor" /> Prova app <Maximize2 size={12} /></button>
    </div>
  </header>;
}
