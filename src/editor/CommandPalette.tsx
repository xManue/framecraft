import { Code2, FolderOpen, RotateCcw, Save, ShieldCheck, TerminalSquare, Undo2, Users, X } from "lucide-react";
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
  const openAccess = useEditorStore((state) => state.openUserAccess);
  const check = useEditorStore((state) => state.checkHmiProject);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const commands = useMemo(() => [
    { name: "Apri un altro progetto", hint: "Ctrl+O", icon: FolderOpen, action: () => void open() },
    { name: "Salva la modifica corrente", hint: "Ctrl+S", icon: Save, action: () => void save() },
    { name: "Annulla ultima modifica", hint: "Ctrl+Z", icon: Undo2, action: () => void undo() },
    { name: "Ripristina modifica", hint: "Ctrl+Shift+Z", icon: RotateCcw, action: () => void redo() },
    { name: "Mostra pagina e codice", hint: "", icon: Code2, action: () => setMode("split") },
    { name: "Gestisci account e permessi", hint: "", icon: Users, action: () => void openAccess() },
    { name: "Controlla il pannello", hint: "", icon: ShieldCheck, action: () => void check() },
    { name: "Apri diagnostica", hint: "", icon: TerminalSquare, action: () => setConsole(true) },
  ].filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [open, openAccess, query, redo, save, setConsole, setMode, undo]);
  return <div className="palette-backdrop" onMouseDown={() => close(false)} role="presentation">
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="Comandi rapidi" onMouseDown={(event) => event.stopPropagation()}>
      <div className="palette-input"><span>&gt;</span><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Escape" && close(false)} placeholder="Cerca un comando…" /><button onClick={() => close(false)} aria-label="Chiudi"><X size={15} /></button></div>
      <div className="palette-results"><small>COMANDI</small>{commands.map(({ name, hint, icon: Icon, action }) => <button key={name} onClick={() => { action(); close(false); }}><Icon size={15} /><span>{name}</span><kbd>{hint}</kbd></button>)}</div>
    </section>
  </div>;
}
