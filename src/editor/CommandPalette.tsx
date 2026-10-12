import { Code2, FolderOpen, Keyboard, MousePointer2, Wrench, X, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { editorCommands, formatEditorShortcut } from "../../scripts/editor-shortcuts.mjs";
import { editorCommandEnabled, runEditorCommand } from "../core/editorCommands";
import { useEditorStore } from "../state/editorStore";
import { useEditorShortcuts } from "../state/editorShortcuts";

const icons: Record<string, typeof Keyboard> = { Comandi: Keyboard, File: FolderOpen, Modifica: MousePointer2, Visualizza: Code2, Strumenti: Wrench, "Zoom e guide": ZoomIn };

export function CommandPalette() {
  const [query, setQuery] = useState(""), [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null), panel = useRef<HTMLElement>(null);
  const state = useEditorStore(), bindings = useEditorShortcuts(store => store.bindings);
  const close = state.setPaletteOpen;
  const commands = editorCommands.filter(command => command.id !== "commands" && `${command.label} ${command.description}`.toLocaleLowerCase("it").includes(query.toLocaleLowerCase("it")));
  const available = commands.filter(command => editorCommandEnabled(command.id, state));
  const active = available[Math.min(selected, available.length - 1)];
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; inputRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(false); }
      if (event.key !== "Tab") return;
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)') ?? [])];
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === nodes.length - 1)) { event.preventDefault(); nodes[0]?.focus(); }
    };
    document.addEventListener("keydown", keydown, true);
    return () => { document.removeEventListener("keydown", keydown, true); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [close]);
  useEffect(() => { panel.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest" }); }, [active?.id]);
  function run(command: typeof editorCommands[number]) { close(false); void runEditorCommand(command.id); }
  return <div className="palette-backdrop" onMouseDown={() => close(false)} role="presentation">
    <section className="command-palette" ref={panel} role="dialog" aria-modal="true" aria-label="Comandi rapidi" onMouseDown={event => event.stopPropagation()}>
      <div className="palette-input"><span>&gt;</span><input ref={inputRef} aria-label="Cerca un comando" value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelected(index => Math.max(0, Math.min(available.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
        if (event.key === "Enter" && active) { event.preventDefault(); run(active); }
      }} placeholder="Cerca: salva, duplica, zoom…" /><button onClick={() => close(false)} aria-label="Chiudi comandi"><X size={15} /></button></div>
      <div className="palette-results"><small>COMANDI · ↑ ↓ PER SCEGLIERE · INVIO PER ESEGUIRE</small>{commands.map(command => { const Icon = icons[command.group]; return <button key={command.id} disabled={!editorCommandEnabled(command.id, state)} aria-current={active?.id === command.id ? "true" : undefined} onClick={() => run(command)}><Icon size={15} /><span>{command.label}</span>{bindings[command.id].length > 0 && <kbd>{formatEditorShortcut(bindings[command.id][0], mac)}</kbd>}</button>; })}{!commands.length && <p>Nessun comando trovato.</p>}</div>
    </section>
  </div>;
}
