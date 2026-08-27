import { AlertCircle, Braces, ShieldCheck, TerminalSquare } from "lucide-react";
import { useEditorStore } from "../state/editorStore";

export function StatusBar() {
  const project = useEditorStore((state) => state.project)!;
  const document = useEditorStore((state) => state.document);
  const selected = useEditorStore((state) => state.selectedId);
  const consoleOpen = useEditorStore((state) => state.consoleOpen);
  const setConsoleOpen = useEditorStore((state) => state.setConsoleOpen);
  const errors = useEditorStore((state) => state.consoleEntries.filter((item) => item.level === "error").length);
  return <footer className="statusbar">
    <span><Braces size={12} /> {project.framework}</span><span title={project.originalRoot ?? project.root}><ShieldCheck size={12} /> Originale protetto</span>
    <span className="status-spacer" />
    {selected && document && <span><Braces size={12} />{document.nodes[selected]?.type}</span>}
    <button className={errors ? "has-error" : ""} onClick={() => setConsoleOpen(!consoleOpen)}><AlertCircle size={12} /> {errors}</button>
    <button onClick={() => setConsoleOpen(!consoleOpen)}><TerminalSquare size={12} /> {project.packageManager}</button>
  </footer>;
}
