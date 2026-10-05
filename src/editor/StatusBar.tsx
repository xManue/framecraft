import { AlertCircle, Braces, LayoutTemplate, ShieldCheck, TerminalSquare, ZoomIn } from "lucide-react";
import { useEditorStore, type UiDensity, type WorkLayout } from "../state/editorStore";

const layouts: { id: WorkLayout; label: string }[] = [
  { id: "disegno", label: "Disegno" },
  { id: "plc", label: "Collegamenti PLC" },
  { id: "sviluppo", label: "Sviluppo" },
];

const densities: { id: UiDensity; label: string }[] = [
  { id: "compatta", label: "Compatta" },
  { id: "normale", label: "Normale" },
  { id: "grande", label: "Grande" },
];

export function StatusBar() {
  const project = useEditorStore((state) => state.project)!;
  const document = useEditorStore((state) => state.document);
  const selected = useEditorStore((state) => state.selectedId);
  const consoleOpen = useEditorStore((state) => state.consoleOpen);
  const setConsoleOpen = useEditorStore((state) => state.setConsoleOpen);
  const errors = useEditorStore((state) => state.consoleEntries.filter((item) => item.level === "error").length);
  const workLayout = useEditorStore((state) => state.workLayout);
  const applyWorkLayout = useEditorStore((state) => state.applyWorkLayout);
  const uiDensity = useEditorStore((state) => state.uiDensity);
  const setUiDensity = useEditorStore((state) => state.setUiDensity);
  return <footer className="statusbar">
    <span><Braces size={12} /> {project.framework}</span><span title={project.originalRoot ?? project.root}><ShieldCheck size={12} /> Copia sicura · originale protetto</span>
    {/* How the workspace is arranged and how large it is drawn: set here once, remembered after. */}
    <label className="status-select" title="Disposizione dei pannelli"><LayoutTemplate size={12} />
      <select value={workLayout} onChange={(event) => applyWorkLayout(event.target.value as WorkLayout)} aria-label="Disposizione dei pannelli">
        {layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}
      </select>
    </label>
    <label className="status-select" title="Dimensione dell'interfaccia"><ZoomIn size={12} />
      <select value={uiDensity} onChange={(event) => setUiDensity(event.target.value as UiDensity)} aria-label="Dimensione dell'interfaccia">
        {densities.map((density) => <option key={density.id} value={density.id}>{density.label}</option>)}
      </select>
    </label>
    <span className="status-spacer" />
    {selected && document && <span><Braces size={12} />{document.nodes[selected]?.type}</span>}
    <button className={errors ? "has-error" : ""} onClick={() => setConsoleOpen(!consoleOpen)} title="Apri la diagnostica"><AlertCircle size={12} /> {errors ? `${errors} errori` : "Nessun errore"}</button>
    <button onClick={() => setConsoleOpen(!consoleOpen)}><TerminalSquare size={12} /> Diagnostica</button>
  </footer>;
}
