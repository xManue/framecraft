import { FileCode2, Save } from "lucide-react";
import { useEditorStore } from "../state/editorStore";

export function CodeEditor() {
  const document = useEditorStore((state) => state.document);
  const dirty = useEditorStore((state) => state.dirty);
  const replace = useEditorStore((state) => state.replaceCode);
  const save = useEditorStore((state) => state.save);
  if (!document) return <section className="code-pane" />;
  return <section className="code-pane">
    <header><span><FileCode2 size={14} />{document.file.split(/[\\/]/).at(-1)}{dirty && " •"}</span><button onClick={() => void save()}><Save size={13} /> Save</button></header>
    <textarea aria-label="Source code" spellCheck={false} value={document.source} onChange={(event) => replace(event.target.value)} />
  </section>;
}
