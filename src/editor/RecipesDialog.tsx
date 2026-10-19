import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Database, Plus, Save, Trash2, X } from "lucide-react";
import { emptyRecipeCatalog, parseRecipeCatalog, recipeConfigurationError, recipeConfigurationIssues, recipeDraftNumber, recipeNewId, type RecipeCatalog, type RecipeConfigurationSnapshot, type RecipeField, type RecipeScalar } from "../core/recipeConfiguration";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";
import "./alarms.css";
import "./recipes.css";

function Field({ label, value, onChange, numeric = false }: { label: string; value: string | number | undefined; onChange(value: string): void; numeric?: boolean }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const display = typeof value === "number" && !Number.isFinite(value) ? "" : value ?? "";
  return <label>{label}<input value={numeric && editing ? draft : display} inputMode={numeric ? "decimal" : undefined} onFocus={() => { setEditing(true); setDraft(String(display)); }} onBlur={() => setEditing(false)} onChange={event => { setDraft(event.target.value); onChange(event.target.value); }} /></label>;
}
function Value({ field, value, onChange }: { field: RecipeField; value: RecipeScalar | undefined; onChange(value: RecipeScalar): void }) {
  const help = useId();
  const [text, setText] = useState(value === undefined ? "" : String(value));
  if (field.type === "boolean") return <label>{field.name}<select value={typeof value === "boolean" ? String(value) : ""} onChange={event => onChange(event.target.value === "" ? "" : event.target.value === "true")}><option value="">Scegli il valore</option><option value="false">Disattivato · false</option><option value="true">Attivato · true</option></select></label>;
  return <label>{field.name}{field.unit ? ` · ${field.unit}` : ""}<input aria-label={field.name + (field.unit ? ` · ${field.unit}` : "")} aria-describedby={help} value={text} inputMode={field.type === "string" ? "text" : "decimal"} onChange={event => { setText(event.target.value); onChange(field.type === "string" ? event.target.value : recipeDraftNumber(event.target.value)); }} /><small id={help}>{field.type === "integer" ? "Numero intero" : field.type === "number" ? "Numero" : "Testo"}{field.minimum !== undefined ? ` · minimo ${field.minimum}` : ""}{field.maximum !== undefined ? ` · massimo ${field.maximum}` : ""}{field.maxLength ? ` · fino a ${field.maxLength} caratteri` : ""}</small></label>;
}
export function RecipesDialog({ onClose }: { onClose(): void }) {
  const project = useEditorStore(state => state.project), [initial] = useState(project);
  const [snapshot, setSnapshot] = useState<RecipeConfigurationSnapshot>(), [catalog, setCatalog] = useState<RecipeCatalog>(emptyRecipeCatalog), [base, setBase] = useState("");
  const [schemaIndex, setSchemaIndex] = useState(0), [recordIndex, setRecordIndex] = useState(0), [epoch, setEpoch] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "saving">("loading"), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [confirmClose, setConfirmClose] = useState(false), [removal, setRemoval] = useState<"schema" | "record" | number>(), [imported, setImported] = useState<RecipeCatalog>();
  const dialog = useRef<HTMLElement>(null), mounted = useRef(true), sequence = useRef(0), title = useId(), closeRef = useRef(onClose); closeRef.current = onClose;
  const dirty = !!snapshot && JSON.stringify(catalog) !== base, schema = catalog.schemas[schemaIndex], record = schema?.records[recordIndex];
  const issues = useMemo(() => recipeConfigurationIssues(catalog), [catalog]);
  const change = (next: RecipeCatalog) => { setCatalog(next); setMessage(""); setError(""); setConfirmClose(false); setRemoval(undefined); };
  const patchSchema = (patch: Partial<RecipeCatalog["schemas"][number]>) => { if (schema) change({ ...catalog, schemas: catalog.schemas.map((item, index) => index === schemaIndex ? { ...item, ...patch } : item) }); };
  const close = () => { if (phase === "saving") return; if (dirty) setConfirmClose(true); else onClose(); };
  const handlers = useRef({ close }); handlers.current.close = close;
  async function load() {
    if (!initial || useEditorStore.getState().project !== initial) return;
    const request = ++sequence.current; setPhase("loading"); setError(""); setMessage("");
    try {
      const next = await desktopBridge.readRecipeConfiguration(initial.root);
      if (!mounted.current || request !== sequence.current || useEditorStore.getState().project !== initial) return;
      const parsed = next.source === null ? emptyRecipeCatalog() : parseRecipeCatalog(next.source);
      setSnapshot(next); setCatalog(parsed); setBase(JSON.stringify(parsed)); setSchemaIndex(0); setRecordIndex(0); setEpoch(value => value + 1); setImported(undefined); setConfirmClose(false); setRemoval(undefined); setPhase("ready");
    } catch (caught) { if (mounted.current && request === sequence.current) { setError(recipeConfigurationError(caught)); setPhase("error"); } }
  }
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; sequence.current++; }; }, []);
  useEffect(() => { if (project !== initial) closeRef.current(); }, [project, initial]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; dialog.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); handlers.current.close(); }
      if (event.key !== "Tab") return;
      const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]') ?? [])].filter(node => !node.closest("[hidden]"));
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (!nodes.length) { event.preventDefault(); dialog.current?.focus(); }
      else if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && (index === -1 || index === nodes.length - 1)) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", key, true); return () => { document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  async function save() {
    if (!initial || !snapshot || snapshot.initialized || phase !== "ready" || issues.length || useEditorStore.getState().project !== initial) return;
    setPhase("saving"); setError("");
    try {
      const parsed = parseRecipeCatalog(catalog);
      const next = await desktopBridge.saveRecipeConfiguration(initial.root, snapshot, JSON.stringify(parsed, null, 2) + "\n");
      if (!mounted.current || useEditorStore.getState().project !== initial) return;
      setSnapshot(next); setBase(JSON.stringify(catalog)); setPhase("ready"); setMessage("Configurazione salvata nel progetto. Nessun servizio riavviato e nessun valore inviato al PLC.");
    } catch (caught) { if (mounted.current) { setPhase("ready"); setError(recipeConfigurationError(caught)); } }
  }
  async function readImport(file?: File) {
    if (!file || phase !== "ready" || snapshot?.initialized) return;
    const request = ++sequence.current; setError("");
    try {
      if (file.size > 2_000_000) throw new Error("File troppo grande: massimo 2 MB.");
      const parsed = parseRecipeCatalog(await file.text());
      if (mounted.current && request === sequence.current && useEditorStore.getState().project === initial) setImported(parsed);
    } catch { if (mounted.current && request === sequence.current) { setImported(undefined); setError("Importazione non valida. Serve un catalogo Framecraft v1 entro 2 MB, con tipi e valori corretti. La configurazione attuale resta invariata."); } }
  }
  function remove() {
    if (!schema) return;
    if (removal === "schema") { change({ ...catalog, schemas: catalog.schemas.filter((_, index) => index !== schemaIndex) }); setSchemaIndex(0); setRecordIndex(0); }
    else if (removal === "record") { patchSchema({ records: schema.records.filter((_, index) => index !== recordIndex) }); setRecordIndex(0); }
    else if (typeof removal === "number") { const id = schema.fields[removal].id; patchSchema({ fields: schema.fields.filter((_, index) => index !== removal), records: schema.records.map(item => ({ ...item, values: Object.fromEntries(Object.entries(item.values).filter(([key]) => key !== id)) })) }); }
  }
  const addRecord = (copy = false) => {
    if (!schema || copy && !record) return;
    const id = recipeNewId(schema.records.map(item => item.id), "recipe");
    let name = copy ? `${record.name} · copia` : `Ricetta ${schema.records.length + 1}`; while (schema.records.some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) name += " nuova";
    patchSchema({ records: [...schema.records, { id, name, values: copy ? { ...record.values } : {} }] }); setRecordIndex(schema.records.length);
  };
  return createPortal(<div className="alarm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section ref={dialog} className="alarm-dialog recipe-dialog" role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1}>
    <header><div><small>CONFIGURAZIONE DEL PROGETTO</small><h2 id={title}><Database size={22} /> Ricette</h2></div><button type="button" aria-label="Chiudi ricette" disabled={phase === "saving"} onClick={close}><X size={20} /></button></header>
    <p>Uno schema definisce i parametri; ogni ricetta contiene i suoi valori. Qui prepari la configurazione iniziale, non cambi i valori della macchina.</p>
    {error && <p className="alarm-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {phase === "loading" ? <p role="status">Lettura della configurazione ricette…</p> : phase === "error" ? <><p>I file esistenti non vengono sostituiti con un catalogo vuoto.</p><button type="button" onClick={() => void load()}>Riprova lettura</button></> : <>
      {snapshot?.initialized && <p className="alarm-error" role="status">Archivio operativo già presente: configurazione in sola lettura. Serve una migrazione con backup per cambiare lo schema o i valori iniziali. Non eliminare l’archivio per sbloccare il salvataggio.</p>}
      <fieldset disabled={phase === "saving" || snapshot?.initialized}>
        <div className="recipe-toolbar"><label>Schema<select value={schemaIndex} onChange={event => { setSchemaIndex(Number(event.target.value)); setRecordIndex(0); setRemoval(undefined); }}>{catalog.schemas.length ? catalog.schemas.map((item, index) => <option key={item.id} value={index}>{item.name || "Schema senza nome"}</option>) : <option value="0">Nessuno schema</option>}</select></label>
          <button type="button" disabled={catalog.schemas.length >= 32} onClick={() => { const id = recipeNewId(catalog.schemas.map(item => item.id), "schema"); change({ ...catalog, schemas: [...catalog.schemas, { id, name: `Schema ${id.split("-").at(-1)}`, fields: [], records: [] }] }); setSchemaIndex(catalog.schemas.length); setRecordIndex(0); }}><Plus size={16} /> Nuovo schema</button>
          <label className="recipe-import">Importa catalogo Framecraft<input type="file" accept=".json,application/json" onChange={event => { void readImport(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
        {imported && <section className="recipe-notice" aria-label="Rivedi importazione"><strong>Prima di usare il catalogo importato</strong><p>{imported.schemas.length} schemi · {imported.schemas.reduce((total, item) => total + item.records.length, 0)} ricette. Sostituirà solo la bozza in questa finestra, comprese modifiche non salvate. Non è ancora un salvataggio su disco.</p><button type="button" onClick={() => { change(imported); setImported(undefined); setSchemaIndex(0); setRecordIndex(0); setEpoch(value => value + 1); }}>Usa il catalogo importato</button><button type="button" onClick={() => setImported(undefined)}>Annulla importazione</button></section>}
        {!schema && <p>Nessuno schema configurato. Crea uno schema, aggiungi i campi che servono al tuo impianto e poi le ricette. L’AI non è necessaria.</p>}
        {schema && <>
          <div className="alarm-fields"><Field label="Nome schema" value={schema.name} onChange={name => patchSchema({ name })} /><p className="recipe-id">ID interno: <code>{schema.id}</code></p><button type="button" onClick={() => setRemoval("schema")}><Trash2 size={16} /> Rimuovi schema</button></div>
          <h3>1. Campi dello schema</h3><p>Non scegliamo valori macchina al tuo posto. Cambiare tipo o aggiungere un campo può richiedere di completare tutte le ricette.</p>
          <div className="recipe-fields">{schema.fields.map((field, index) => {
            const patch = (next: Partial<RecipeField>) => patchSchema({ fields: schema.fields.map((item, i) => i === index ? { ...item, ...next } : item) });
            return <article key={field.id}><Field label="Nome campo" value={field.name} onChange={name => patch({ name })} /><label>Tipo<select value={field.type} onChange={event => { const type = event.target.value as RecipeField["type"]; patch({ type, minimum: undefined, maximum: undefined, maxLength: undefined }); }}><option value="number">Numero decimale</option><option value="integer">Numero intero</option><option value="boolean">Attivato / disattivato</option><option value="string">Testo</option></select></label>
              <Field label="Unità (facoltativa)" value={field.unit} onChange={unit => patch({ unit: unit || undefined })} />
              {["number", "integer"].includes(field.type) && <><Field label="Minimo (facoltativo)" numeric value={field.minimum} onChange={value => patch({ minimum: value === "" ? undefined : Number(value.trim() || NaN) })} /><Field label="Massimo (facoltativo)" numeric value={field.maximum} onChange={value => patch({ maximum: value === "" ? undefined : Number(value.trim() || NaN) })} /></>}
              {field.type === "string" && <Field label="Lunghezza massima (facoltativa)" numeric value={field.maxLength} onChange={value => patch({ maxLength: value === "" ? undefined : Number(value) })} />}
              <small>ID: {field.id}</small><button type="button" aria-label={`Rimuovi campo ${field.name}`} onClick={() => setRemoval(index)}><Trash2 size={16} /> Rimuovi campo</button></article>;
          })}</div><button type="button" disabled={schema.fields.length >= 64} onClick={() => { const id = recipeNewId(schema.fields.map(item => item.id), "field"); patchSchema({ fields: [...schema.fields, { id, name: `Parametro ${id.split("-").at(-1)}`, type: "number" }] }); }}><Plus size={16} /> Aggiungi campo</button>
          <h3>2. Ricette iniziali</h3><div className="recipe-toolbar"><label>Ricetta<select value={recordIndex} onChange={event => { setRecordIndex(Number(event.target.value)); setRemoval(undefined); }}>{schema.records.length ? schema.records.map((item, index) => <option key={item.id} value={index}>{item.name || "Ricetta senza nome"}</option>) : <option value="0">Nessuna ricetta</option>}</select></label><button type="button" disabled={!schema.fields.length || schema.records.length >= 500} onClick={() => addRecord()}><Plus size={16} /> Nuova ricetta</button>{record && <><button type="button" disabled={schema.records.length >= 500} onClick={() => addRecord(true)}><Copy size={16} /> Copia ricetta</button><button type="button" onClick={() => setRemoval("record")}><Trash2 size={16} /> Rimuovi ricetta</button></>}</div>
          {record ? <><div className="alarm-fields"><Field label="Nome ricetta" value={record.name} onChange={name => patchSchema({ records: schema.records.map((item, index) => index === recordIndex ? { ...item, name } : item) })} /></div><div className="alarm-fields">{schema.fields.map(field => <Value key={`${epoch}:${schema.id}:${record.id}:${field.id}:${field.type}`} field={field} value={record.values[field.id]} onChange={value => patchSchema({ records: schema.records.map((item, index) => index === recordIndex ? { ...item, values: { ...item.values, [field.id]: value } } : item) })} />)}</div></> : <p>Puoi salvare lo schema senza ricette oppure aggiungerne una e compilare tutti i valori.</p>}
        </>}
        {removal !== undefined && <section className="recipe-notice" role="group" aria-label="Conferma rimozione"><p>{removal === "schema" ? "Rimuovere lo schema e tutte le sue ricette dalla bozza?" : removal === "record" ? "Rimuovere questa ricetta dalla bozza?" : "Rimuovere il campo e i suoi valori da tutte le ricette della bozza?"} I dati operativi non vengono toccati.</p><button type="button" onClick={() => setRemoval(undefined)}>Mantieni</button><button type="button" onClick={remove}>Conferma rimozione</button></section>}
      </fieldset>
      {!!issues.length && <div className="alarm-error" role="alert"><strong>Prima di salvare</strong><ul>{issues.slice(0, 12).map((issue, index) => <li key={index}>{issue}</li>)}</ul>{issues.length > 12 && <p>Altri {issues.length - 12} valori da controllare nelle ricette.</p>}</div>}
    </>}
    <footer>{confirmClose ? <><span>Hai una bozza non salvata. Vuoi scartarla?</span><button type="button" onClick={() => setConfirmClose(false)}>Continua modifica</button><button type="button" onClick={onClose}>Scarta e chiudi</button></> : <><span>Salva solo {"framecraft.recipes.json"}. Nessuna scrittura PLC. Il servizio legge questa configurazione al prossimo avvio manuale; gestione operativa e migrazioni restano da collegare.</span><button type="button" disabled={phase !== "ready" || !dirty || !!issues.length || snapshot?.initialized} onClick={() => void save()}><Save size={16} />{phase === "saving" ? "Salvataggio…" : "Salva configurazione ricette"}</button></>}</footer>
  </section></div>, document.body);
}
