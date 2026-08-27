import { Code2, FolderOpen, RotateCcw, Save, TerminalSquare, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../state/editorStore";

export function CommandPalette() {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const close = useEditorStore((state) => state.setPaletteOpen);
  const open = useEditorStore((state) => state.chooseAndOpenProject);
  const save = useEditorStore((state) => state.save);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const setMode = useEditorStore((state) => state.setViewMode);
  const setConsole = useEditorStore((state) => state.setConsoleOpen);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const commands = useMemo(() => [
    { name: "Open project", hint: "Ctrl+O", icon: FolderOpen, action: () => void open() },
    { name: "Save active file", hint: "Ctrl+S", icon: Save, action: () => void save() },
    { name: "Undo source change", hint: "Ctrl+Z", icon: Undo2, action: () => void undo() },
    { name: "Redo source change", hint: "Ctrl+Shift+Z", icon: RotateCcw, action: () => void redo() },
    { name: "Show split view", hint: "", icon: Code2, action: () => setMode("split") },
    { name: "Toggle console", hint: "", icon: TerminalSquare, action: () => setConsole(true) },
  ].filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [open, query, redo, save, setConsole, setMode, undo]);
  return <div className="palette-backdrop" onMouseDown={() => close(false)} role="presentation">
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
      <div className="palette-input"><span>&gt;</span><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Escape" && close(false)} placeholder="Type a command…" /><button onClick={() => close(false)} aria-label="Close"><X size={15} /></button></div>
      <div className="palette-results"><small>COMMANDS</small>{commands.map(({ name, hint, icon: Icon, action }) => <button key={name} onClick={() => { action(); close(false); }}><Icon size={15} /><span>{name}</span><kbd>{hint}</kbd></button>)}</div>
    </section>
  </div>;
}
