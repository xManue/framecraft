import { Keyboard, LayoutTemplate, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { defaultEditorShortcuts, editorCommands, editorShortcutFromEvent, editorShortcutIssue, editorShortcutsIssue, formatEditorShortcut, type EditorCommandId } from "../../scripts/editor-shortcuts.mjs";
import { useEditorShortcuts } from "../state/editorShortcuts";
import { layoutPresets, snapGrids, useEditorStore, type UiDensity, type WorkLayout } from "../state/editorStore";

const workLayouts: { id: WorkLayout; label: string; description: string }[] = [
  { id: "disegno", label: "Grafica e componenti", description: "Componenti e più spazio al disegno" },
  { id: "plc", label: "Variabili e dinamiche", description: "Catalogo PLC e proprietà più larghe" },
  { id: "sviluppo", label: "File e codice", description: "File del progetto e strumenti di sviluppo" },
];

export function EditorSettings() {
  const bindings = useEditorShortcuts(state => state.bindings);
  const section = useEditorShortcuts(state => state.section);
  const setOpen = useEditorShortcuts(state => state.setOpen);
  const apply = useEditorShortcuts(state => state.apply);
  const [draft, setDraft] = useState(() => structuredClone(bindings));
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<{ id: EditorCommandId; index: number }>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const panel = useRef<HTMLElement>(null), capture = useRef<HTMLButtonElement>(null);
  const recordingRef = useRef(recording); recordingRef.current = recording;
  const uiDensity = useEditorStore(state => state.uiDensity);
  const setUiDensity = useEditorStore(state => state.setUiDensity);
  const workLayout = useEditorStore(state => state.workLayout);
  const paneSizes = useEditorStore(state => state.paneSizes);
  const leftPanel = useEditorStore(state => state.leftPanel);
  const leftCollapsed = useEditorStore(state => state.leftPanelCollapsed);
  const preset = layoutPresets[workLayout];
  const layoutCustomized = leftCollapsed || leftPanel !== preset.panel || paneSizes.left !== preset.panes.left || paneSizes.inspector !== preset.panes.inspector;
  const applyWorkLayout = useEditorStore(state => state.applyWorkLayout);
  const snap = useEditorStore(state => state.snap);
  const setSnap = useEditorStore(state => state.setSnap);
  const changed = JSON.stringify(draft) !== JSON.stringify(bindings);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const commands = editorCommands.filter(command => `${command.label} ${command.description} ${command.group}`.toLocaleLowerCase("it").includes(query.trim().toLocaleLowerCase("it")));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        if (recordingRef.current) setRecording(undefined); else setOpen(false);
      }
      if (event.key !== "Tab") return;
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])];
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === nodes.length - 1)) { event.preventDefault(); nodes[0]?.focus(); }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      const target = previous?.isConnected && previous !== document.body ? previous : document.querySelector<HTMLElement>('.topbar-menus > .topbar-menu > button');
      target?.focus({ preventScroll: true });
    };
  }, [setOpen]);
  useEffect(() => { if (recording) capture.current?.focus({ preventScroll: true }); }, [recording]);

  function record(event: React.KeyboardEvent) {
    if (!recording || event.currentTarget !== capture.current || event.key === "Tab" || event.key === "Escape") return;
    event.preventDefault(); event.stopPropagation();
    const shortcut = editorShortcutFromEvent(event.nativeEvent);
    if (!shortcut) {
      if (event.nativeEvent.getModifierState("AltGraph")) setError("Questa combinazione viene interpretata come AltGr. Usa Ctrl+Shift o un tasto funzione.");
      else if (!event.repeat && !event.nativeEvent.isComposing && !/^(?:Control|Meta|Alt|Shift|AltGraph)$/.test(event.key)) setError("Questo tasto non è supportato. Usa una lettera, un numero, una freccia o un tasto funzione con Ctrl o Alt.");
      return;
    }
    const issue = editorShortcutIssue(shortcut);
    if (issue) { setError(issue); return; }
    const owner = editorCommands.find(command => command.id !== recording.id && draft[command.id].includes(shortcut));
    if (owner) { setError(`Questa combinazione è già assegnata a «${owner.label}». Rimuovila prima da quel comando.`); return; }
    const values = [...draft[recording.id]]; values[recording.index] = shortcut;
    const next = { ...draft, [recording.id]: values }, conflict = editorShortcutsIssue(next);
    if (conflict) { setError(conflict); return; }
    setDraft(next); setRecording(undefined); setError(""); setMessage("Combinazione pronta. Premi Salva scorciatoie per applicarla.");
  }
  function save() {
    const issue = apply(draft);
    if (issue) { setError(issue); return; }
    setError(""); setMessage("Scorciatoie salvate: sono attive anche nel canvas e negli altri progetti.");
  }

  return createPortal(<div className="editor-settings-backdrop">
    <section className="editor-settings" role="dialog" aria-modal="true" aria-labelledby="editor-settings-title" ref={panel} tabIndex={-1}>
      <header><div><small>PREFERENZE DELL’APP</small><h2 id="editor-settings-title">Impostazioni dell’editor</h2><p>Personalizza il tuo lavoro. Il pannello HMI finale non viene modificato.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Chiudi impostazioni"><X size={20} /></button></header>
      <nav aria-label="Sezioni delle impostazioni">
        <button type="button" aria-pressed={section === "workspace"} onClick={() => { setOpen(true, "workspace"); setRecording(undefined); }}><LayoutTemplate size={18} />Area di lavoro</button>
        <button type="button" aria-pressed={section === "shortcuts"} onClick={() => setOpen(true, "shortcuts")}><Keyboard size={18} />Scorciatoie e comandi</button>
      </nav>
      <div className="editor-settings-body">
        {section === "workspace" ? <div className="editor-settings-workspace">
          <p className="editor-settings-hint">Queste preferenze si applicano subito e sono condivise tra i progetti. Puoi cambiarle anche dai menu rapidi.</p>
          <fieldset><legend>Disposizione dei pannelli</legend><p>{layoutCustomized ? "Disposizione personalizzata. Scegli una configurazione per riapplicarla." : "Scegli gli strumenti per il lavoro corrente."} Non cambia grafica o codice della pagina.</p><div className="editor-settings-layouts">{workLayouts.map(layout => <button type="button" key={layout.id} aria-pressed={!layoutCustomized && workLayout === layout.id} onClick={() => applyWorkLayout(layout.id)}><strong>{layout.label}</strong><small>{layout.description}</small></button>)}</div></fieldset>
          <fieldset><legend>Leggibilità</legend><label htmlFor="editor-density">Dimensione dell’interfaccia</label><select id="editor-density" value={uiDensity} onChange={event => setUiDensity(event.target.value as UiDensity)}><option value="compatta">Compatta</option><option value="normale">Normale</option><option value="grande">Grande</option></select><p>Ingrandisce gli strumenti dell’editor, non gli elementi dell’HMI.</p></fieldset>
          <fieldset><legend>Precisione del disegno</legend><label className="editor-settings-toggle"><input type="checkbox" checked={snap.enabled} onChange={event => setSnap({ enabled: event.target.checked })} />Guide intelligenti e aggancio alla griglia</label><label htmlFor="editor-grid">Passo della griglia</label><select id="editor-grid" value={snap.grid} disabled={!snap.enabled} onChange={event => setSnap({ grid: Number(event.target.value) })}><option value={0}>Libero: solo bordi e centri</option>{snapGrids.map(step => <option key={step} value={step}>{step} px</option>)}</select><p>Shift mantiene il trascinamento dritto. Alt ignora temporaneamente le guide. Questi gesti restano fissi.</p></fieldset>
        </div> : <>
          <p className="editor-settings-hint">Clicca una combinazione per cambiarla, poi premi i tasti. Puoi aggiungerne fino a tre per comando o rimuoverle tutte per disattivarlo. Esc annulla la registrazione.</p>
          <label className="editor-settings-search"><Search size={17} /><span className="sr-only">Cerca un comando nelle impostazioni</span><input value={query} onChange={event => { setQuery(event.target.value); setRecording(undefined); }} placeholder="Cerca: salva, duplica, zoom…" /></label>
          <div className="editor-shortcut-list">{commands.map(command => <article key={command.id}>
            <div><small>{command.group}</small><strong>{command.label}</strong><p>{command.description}{command.edit && " · Solo in Modifica"}</p></div>
            <div className="editor-shortcut-combinations">{draft[command.id].map((shortcut, index) => <div className="editor-shortcut-chip" key={index}><button type="button" className={recording?.id === command.id && recording.index === index ? "recording" : ""} ref={recording?.id === command.id && recording.index === index ? capture : undefined} onClick={() => { setRecording({ id: command.id, index }); setError(""); }} onKeyDown={record} aria-label={`Cambia ${formatEditorShortcut(shortcut, mac)} per ${command.label}`}><kbd>{recording?.id === command.id && recording.index === index ? "Premi i tasti…" : formatEditorShortcut(shortcut, mac)}</kbd></button><button type="button" aria-label={`Rimuovi ${formatEditorShortcut(shortcut, mac)} da ${command.label}`} onClick={() => { setDraft({ ...draft, [command.id]: draft[command.id].filter((_, current) => current !== index) }); setRecording(undefined); setError(""); }}><X size={14} /></button></div>)}
              {draft[command.id].length < 3 && <button type="button" className={recording?.id === command.id && recording.index === draft[command.id].length ? "recording" : ""} ref={recording?.id === command.id && recording.index === draft[command.id].length ? capture : undefined} aria-label={`Aggiungi scorciatoia per ${command.label}`} onClick={() => { setRecording({ id: command.id, index: draft[command.id].length }); setError(""); }} onKeyDown={record}>{recording?.id === command.id && recording.index === draft[command.id].length ? "Premi i tasti…" : "+ Combinazione"}</button>}
              {!draft[command.id].length && <small>Non assegnata</small>}
            </div>
          </article>)}</div>
          {!commands.length && <p>Nessun comando trovato. Prova un altro nome.</p>}
        </>}
      </div>
      <footer><div>{error ? <p role="alert">{error}</p> : <p role="status">{message || (changed ? "Hai modifiche alle scorciatoie non ancora salvate." : "Le scorciatoie sono preferenze locali dell’app: non inviano comandi al PLC.")}</p>}</div>
        <div className="editor-settings-actions">{section === "shortcuts" && <><button type="button" onClick={() => { setDraft(defaultEditorShortcuts()); setRecording(undefined); setError(""); setMessage("Predefiniti ripristinati nella bozza. Salva per applicarli."); }}><RotateCcw size={16} />Ripristina predefiniti</button><button type="button" className="primary" disabled={!changed || !!recording} onClick={save}>Salva scorciatoie</button></>}<button type="button" onClick={() => setOpen(false)}>{changed ? "Chiudi senza salvare" : "Chiudi"}</button></div>
      </footer>
    </section>
  </div>, document.body);
}
