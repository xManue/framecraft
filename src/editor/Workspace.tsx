import { Canvas } from "../canvas/Canvas";
import { CodeEditor } from "./CodeEditor";
import { useEditorStore } from "../state/editorStore";

export function Workspace() {
  const mode = useEditorStore((state) => state.viewMode);
  return <div className={`workspace mode-${mode}`}>
    {mode !== "code" && <Canvas />}
    {mode !== "visual" && <CodeEditor />}
  </div>;
}
