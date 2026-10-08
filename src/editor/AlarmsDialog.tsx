import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Plus, Save, Trash2, X } from "lucide-react";
import { alarmCatalogIssues, createAlarmEngine, emptyAlarmCatalog, parseAlarmCatalog, type AlarmCatalog, type AlarmConfigurationSnapshot, type AlarmDefinition } from "../core/hmiAlarms";
import { createHmiAlarmControl } from "../core/hmiAlarmControl";
import { parsePlcCatalog } from "../core/plcVariables";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";
import "./alarms.css";

function Field({ label, value, onChange, choices, number, min, max }: { label: string; value: string | number; onChange(value: string): void; choices?: { value: string; label: string }[]; number?: boolean; min?: number; max?: number }) {
  const id = useId();
  return <label htmlFor={id}>{label}{choices ? <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{choices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : <input id={id} type={number ? "number" : "text"} value={Number.isNaN(value) ? "" : value} min={min} max={max} onChange={(event) => onChange(event.target.value)} />}</label>;
}

export function AlarmsDialog({ onClose }: { onClose(): void }) {
  const project = useEditorStore((state) => state.project), [initial] = useState(project);
  const [snapshot, setSnapshot] = useState<AlarmConfigurationSnapshot>(), [catalog, setCatalog] = useState<AlarmCatalog>(emptyAlarmCatalog), [base, setBase] = useState("");
  const [selected, setSelected] = useState(0), [error, setError] = useState(""), [message, setMessage] = useState(""), [phase, setPhase] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [confirmClose, setConfirmClose] = useState(false), [testValue, setTestValue] = useState("0"), [quality, setQuality] = useState("192");
  const dialog = useRef<HTMLElement>(null), view = useRef<HTMLDivElement>(null), mounted = useRef(true), sequence = useRef(0), titleId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const dirty = !!snapshot && JSON.stringify(catalog) !== base;
  const variables = useMemo(() => snapshot?.plc ? parsePlcCatalog(snapshot.plc) : [], [snapshot?.plc]);
  const issues = useMemo(() => alarmCatalogIssues(catalog, variables), [catalog, variables]);
  const engine = useMemo(() => issues.length ? undefined : createAlarmEngine(catalog, variables), [catalog, variables, issues.length]);
  const selectedAlarm = catalog.alarms[selected];
  const close = () => { if (phase === "saving") return; if (dirty) setConfirmClose(true); else onClose(); };
  const handlers = useRef({ close }); handlers.current.close = close;
  async function load() {
    if (!initial || useEditorStore.getState().project !== initial) return;
    const request = ++sequence.current; setPhase("loading"); setError("");
    try {
      const next = await desktopBridge.readAlarmConfiguration(initial.root);
      const tags = next.plc ? parsePlcCatalog(next.plc) : [];
      const parsed = next.source === null ? emptyAlarmCatalog() : parseAlarmCatalog(next.source);
      if (!mounted.current || sequence.current !== request || useEditorStore.getState().project !== initial) return;
      if (next.source !== null && alarmCatalogIssues(parsed, tags).length) setMessage("Controlla gli errori qui sotto prima di salvare o provare.");
      setSnapshot(next); setCatalog(parsed); setBase(JSON.stringify(parsed)); setSelected(0); setPhase("ready");
    } catch (caught) { if (mounted.current && sequence.current === request) { setPhase("error"); setError(caught instanceof Error ? caught.message : "Impossibile leggere il catalogo allarmi. Controlla accesso al progetto e JSON."); } }
  }
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; sequence.current++; }; }, []);
  useEffect(() => { if (project !== initial) closeRef.current(); }, [project, initial]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; dialog.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); handlers.current.close(); }
      if (event.key !== "Tab") return;
      const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') ?? [])].filter((node) => !node.hidden);
      if (!nodes.length) { event.preventDefault(); dialog.current?.focus(); return; }
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && (index === -1 || index === nodes.length - 1)) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    if (!engine || !view.current) return;
    const control = createHmiAlarmControl(view.current, async (command) => { engine.action(command, "Prova locale"); });
    const update = () => control.update({ ...engine.snapshot(), actionsEnabled: true });
    update(); const unsubscribe = engine.subscribe(update);
    return () => { unsubscribe(); control.dispose(); };
  }, [engine]);
  const change = (next: AlarmCatalog) => { setCatalog(next); setMessage(""); setConfirmClose(false); };
  const patch = (values: Partial<AlarmDefinition>) => change({ ...catalog, alarms: catalog.alarms.map((item, index) => index === selected ? { ...item, ...values } : item) });
  async function save() {
    if (!initial || !snapshot || phase !== "ready" || issues.length || useEditorStore.getState().project !== initial) return;
    setPhase("saving"); setError("");
    try {
      const next = await desktopBridge.saveAlarmConfiguration(initial.root, snapshot, JSON.stringify(catalog, null, 2) + "\n");
      if (!mounted.current || useEditorStore.getState().project !== initial) return;
      setSnapshot(next); setBase(JSON.stringify(catalog)); setMessage("Catalogo salvato. Nessun comando o collegamento PLC avviato. Il servizio carica gli allarmi al prossimo avvio manuale."); setPhase("ready");
    } catch (caught) { if (mounted.current) { setPhase("ready"); setError(caught instanceof Error ? caught.message : "Salvataggio non riuscito. Le modifiche restano in questa finestra."); } }
  }
  return createPortal(<div className="alarm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={dialog} className="alarm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
    <header><div><small>CONFIGURA E PROVA</small><h2 id={titleId}><Bell size={20} /> Allarmi</h2></div><button type="button" aria-label="Chiudi allarmi" onClick={close} disabled={phase === "saving"}><X size={20} /></button></header>
    <p>Un allarme segnala un guasto. La presa visione registra che l'operatore lo ha visto: non modifica il PLC e non risolve il guasto.</p>
    {error && <p role="alert" className="alarm-error">{error}</p>}{message && <p role="status">{message}</p>}
    {phase === "loading" ? <p role="status">Lettura dei cataloghi…</p> : phase === "error" ? <button type="button" onClick={() => void load()}>Riprova lettura</button> : <fieldset disabled={phase === "saving"}>
      <details><summary>Classi e presa visione</summary><p>Nessuna: chiude al rientro. Presa visione: richiede anche l'operatore. Con conferma: dopo il rientro valido serve un secondo comando.</p>
        <Field label="Eventi conservati nello storico di sessione" value={catalog.maxHistory} number min={100} max={10000} onChange={(value) => change({ ...catalog, maxHistory: value === "" ? NaN : Number(value) })} />
        {catalog.classes.map((item, index) => <div className="alarm-fields" key={index}><Field label="Nome classe" value={item.name} onChange={(name) => change({ ...catalog, classes: catalog.classes.map((c, i) => i === index ? { ...c, name } : c) })} /><Field label="Chiusura allarme" value={item.acknowledgment} choices={[{ value: "none", label: "Solo rientro" }, { value: "single", label: "Rientro + presa visione" }, { value: "reset", label: "Rientro + presa visione + conferma" }]} onChange={(value) => change({ ...catalog, classes: catalog.classes.map((c, i) => i === index ? { ...c, acknowledgment: value as typeof c.acknowledgment } : c) })} /></div>)}
        <button type="button" onClick={() => change({ ...catalog, classes: [...catalog.classes, { name: "Classe_" + (catalog.classes.length + 1), acknowledgment: "single" }] })} disabled={catalog.classes.length >= 100}><Plus size={16} /> Nuova classe</button>
      </details>
      <div className="alarm-list-head"><Field label="Allarme da modificare" value={String(selected)} choices={catalog.alarms.length ? catalog.alarms.map((item, index) => ({ value: String(index), label: item.name || "Nuovo allarme" })) : [{ value: "0", label: "Nessun allarme" }]} onChange={(value) => setSelected(Number(value))} /><button type="button" disabled={catalog.alarms.length >= 2000} onClick={() => { let id = "alarm-" + (catalog.alarms.length + 1); while (catalog.alarms.some((a) => a.id === id)) id += "-new"; change({ ...catalog, alarms: [...catalog.alarms, { id, name: "Nuovo allarme", text: "", tag: "", className: catalog.classes[0]?.name ?? "", priority: 1, area: "", enabled: true, trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] }); setSelected(catalog.alarms.length); }}><Plus size={16} /> Nuovo allarme</button></div>
      {selectedAlarm && <><div className="alarm-fields">
        <Field label="Identificativo" value={selectedAlarm.id} onChange={(id) => patch({ id })} /><Field label="Nome" value={selectedAlarm.name} onChange={(name) => patch({ name })} /><Field label="Messaggio operatore" value={selectedAlarm.text} onChange={(text) => patch({ text })} />
        <Field label="Segnale PLC" value={selectedAlarm.tag} choices={[{ value: "", label: "Scegli un segnale dichiarato" }, ...variables.filter((v) => v.access !== "write").map((v) => ({ value: v.name, label: v.name + " · " + v.dataType })), ...(!variables.some((v) => v.name === selectedAlarm.tag) && selectedAlarm.tag ? [{ value: selectedAlarm.tag, label: selectedAlarm.tag + " · non dichiarato" }] : [])]} onChange={(tag) => patch({ tag })} />
        <Field label="Classe" value={selectedAlarm.className} choices={catalog.classes.map((c) => ({ value: c.name, label: c.name }))} onChange={(className) => patch({ className })} /><Field label="Zona macchina" value={selectedAlarm.area ?? ""} onChange={(area) => patch({ area })} /><Field label="Priorità (più alta = prima)" value={selectedAlarm.priority} number min={0} max={255} onChange={(value) => patch({ priority: value === "" ? NaN : Number(value) })} />
        <Field label="Attivazione" value={selectedAlarm.trigger.kind} choices={[{ value: "bit", label: "Bit / Bool" }, { value: "high", label: "Valore sopra la soglia" }, { value: "low", label: "Valore sotto la soglia" }]} onChange={(value) => patch({ trigger: value === "bit" ? { kind: "bit", bit: 0, activeWhen: "set" } : { kind: value as "high" | "low", limit: 0, hysteresis: 0 } })} />
        {selectedAlarm.trigger.kind === "bit" ? <><Field label="Numero bit (Bool = 0)" value={selectedAlarm.trigger.bit} number min={0} max={63} onChange={(value) => { if (selectedAlarm.trigger.kind === "bit") patch({ trigger: { ...selectedAlarm.trigger, bit: value === "" ? NaN : Number(value) } }); }} /><Field label="Attivo quando il bit vale" value={selectedAlarm.trigger.activeWhen} choices={[{ value: "set", label: "1" }, { value: "clear", label: "0" }]} onChange={(value) => { if (selectedAlarm.trigger.kind === "bit") patch({ trigger: { ...selectedAlarm.trigger, activeWhen: value as "set" | "clear" } }); }} /></> : <><Field label="Soglia" value={selectedAlarm.trigger.limit} number onChange={(value) => { if (selectedAlarm.trigger.kind !== "bit") patch({ trigger: { ...selectedAlarm.trigger, limit: value === "" ? NaN : Number(value) } }); }} /><Field label="Isteresi di rientro" value={selectedAlarm.trigger.hysteresis} number min={0} onChange={(value) => { if (selectedAlarm.trigger.kind !== "bit") patch({ trigger: { ...selectedAlarm.trigger, hysteresis: value === "" ? NaN : Number(value) } }); }} /></>}
      </div><label className="alarm-check"><input type="checkbox" checked={selectedAlarm.enabled} onChange={(event) => patch({ enabled: event.target.checked })} /> Allarme abilitato</label><button type="button" onClick={() => { change({ ...catalog, alarms: catalog.alarms.filter((_, index) => index !== selected) }); setSelected(0); }}><Trash2 size={16} /> Rimuovi dal catalogo</button></>}
      {!!issues.length && <div className="alarm-error" role="alert"><strong>Prima di salvare:</strong><ul>{issues.slice(0, 20).map((issue, index) => <li key={index}>{issue.path}: {issue.message}</li>)}</ul>{issues.length > 20 && <p>Altri {issues.length - 20} problemi nel catalogo.</p>}</div>}
      <details open><summary>Prova locale · nessuna connessione PLC</summary><p>Questa prova usa gli stessi stati del servizio. Cambiare la configurazione azzera solo la prova locale.</p><div className="alarm-fields"><Field label="Valore del segnale selezionato" value={testValue} onChange={setTestValue} /><Field label="Qualità del segnale" value={quality} choices={[{ value: "192", label: "Buona" }, { value: "0", label: "Non valida / connessione persa" }, { value: "", label: "Sconosciuta" }]} onChange={setQuality} /><button type="button" disabled={!engine || !selectedAlarm} onClick={() => engine?.updateSample({ tag: selectedAlarm.tag, value: testValue, qualityCode: quality === "" ? undefined : Number(quality) })}>Applica segnale di prova</button></div>{engine ? <div ref={view} className="alarm-test-view" /> : <p>Completa i campi e correggi gli errori per attivare la prova.</p>}</details>
    </fieldset>}
    <footer>{confirmClose ? <><span>Hai modifiche non salvate. Vuoi scartarle?</span><button type="button" onClick={() => setConfirmClose(false)}>Continua modifica</button><button type="button" onClick={onClose}>Scarta e chiudi</button></> : <><span>Storico limitato alla sessione; archivio e autorizzazioni industriali restano da completare.</span><button type="button" disabled={!dirty || phase !== "ready" || !!issues.length} onClick={() => void save()}><Save size={16} /> {phase === "saving" ? "Salvataggio…" : "Salva allarmi"}</button></>}</footer>
  </section></div>, document.body);
}
