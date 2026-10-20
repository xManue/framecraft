import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Database, Save, X } from "lucide-react";
import { emptyRecipeCatalog, parseRecipeCatalog, recipeConfigurationError, recipeConfigurationIssues, type RecipeCatalog, type RecipeConfigurationSnapshot } from "../core/recipeConfiguration";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";
import "./alarms.css";
import "./recipes.css";
import { RecipeCatalogEditor } from "./RecipeCatalogEditor";
import { useRecipeDialog } from "./useRecipeDialog";

export function RecipesDialog({ onClose }: { onClose(): void }) {
  const project = useEditorStore(state => state.project), [initial] = useState(project);
  const [snapshot, setSnapshot] = useState<RecipeConfigurationSnapshot>(), [catalog, setCatalog] = useState<RecipeCatalog>(emptyRecipeCatalog), [base, setBase] = useState("");
  const [epoch, setEpoch] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "saving">("loading"), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [confirmClose, setConfirmClose] = useState(false), [imported, setImported] = useState<RecipeCatalog>();
  const mounted = useRef(true), sequence = useRef(0), title = useId(), closeRef = useRef(onClose); closeRef.current = onClose;
  const dirty = !!snapshot && JSON.stringify(catalog) !== base;
  const issues = useMemo(() => recipeConfigurationIssues(catalog), [catalog]);
  const change = (next: RecipeCatalog) => { setCatalog(next); setMessage(""); setError(""); setConfirmClose(false); };
  const close = () => { if (phase === "saving") return; if (dirty) setConfirmClose(true); else onClose(); };
  const dialog = useRecipeDialog(close);
  async function load() {
    if (!initial || useEditorStore.getState().project !== initial) return;
    const request = ++sequence.current; setPhase("loading"); setError(""); setMessage("");
    try {
      const next = await desktopBridge.readRecipeConfiguration(initial.root);
      if (!mounted.current || request !== sequence.current || useEditorStore.getState().project !== initial) return;
      const parsed = next.source === null ? emptyRecipeCatalog() : parseRecipeCatalog(next.source);
      setSnapshot(next); setCatalog(parsed); setBase(JSON.stringify(parsed)); setEpoch(value => value + 1); setImported(undefined); setConfirmClose(false); setPhase("ready");
    } catch (caught) { if (mounted.current && request === sequence.current) { setError(recipeConfigurationError(caught)); setPhase("error"); } }
  }
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; sequence.current++; }; }, []);
  useEffect(() => { if (project !== initial) closeRef.current(); }, [project, initial]);
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
  return createPortal(<div className="alarm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section ref={dialog} className="alarm-dialog recipe-dialog" role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1}>
    <header><div><small>CONFIGURAZIONE DEL PROGETTO</small><h2 id={title}><Database size={22} /> Ricette</h2></div><button type="button" aria-label="Chiudi ricette" disabled={phase === "saving"} onClick={close}><X size={20} /></button></header>
    <p>Uno schema definisce i parametri; ogni ricetta contiene i suoi valori. Qui prepari la configurazione iniziale, non cambi i valori della macchina.</p>
    {error && <p className="alarm-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {phase === "loading" ? <p role="status">Lettura della configurazione ricette…</p> : phase === "error" ? <><p>I file esistenti non vengono sostituiti con un catalogo vuoto.</p><button type="button" onClick={() => void load()}>Riprova lettura</button></> : <>
      {snapshot?.initialized && <p className="alarm-error" role="status">Archivio operativo già presente: configurazione in sola lettura. Serve una migrazione con backup per cambiare lo schema o i valori iniziali. Non eliminare l’archivio per sbloccare il salvataggio.</p>}
      <RecipeCatalogEditor key={epoch} catalog={catalog} onChange={change} disabled={phase === "saving" || snapshot?.initialized} toolbar={<label className="recipe-import">Importa catalogo Framecraft<input type="file" accept=".json,application/json" onChange={event => { void readImport(event.target.files?.[0]); event.target.value = ""; }} /></label>}>
        {imported && <section className="recipe-notice" aria-label="Rivedi importazione"><strong>Prima di usare il catalogo importato</strong><p>{imported.schemas.length} schemi · {imported.schemas.reduce((total, item) => total + item.records.length, 0)} ricette. Sostituirà solo la bozza in questa finestra, comprese modifiche non salvate. Non è ancora un salvataggio su disco.</p><button type="button" onClick={() => { change(imported); setImported(undefined); setEpoch(value => value + 1); }}>Usa il catalogo importato</button><button type="button" onClick={() => setImported(undefined)}>Annulla importazione</button></section>}
      </RecipeCatalogEditor>
      {!!issues.length && <div className="alarm-error" role="alert"><strong>Prima di salvare</strong><ul>{issues.slice(0, 12).map((issue, index) => <li key={index}>{issue}</li>)}</ul>{issues.length > 12 && <p>Altri {issues.length - 12} valori da controllare nelle ricette.</p>}</div>}
    </>}
    <footer>{confirmClose ? <><span>Hai una bozza non salvata. Vuoi scartarla?</span><button type="button" onClick={() => setConfirmClose(false)}>Continua modifica</button><button type="button" onClick={onClose}>Scarta e chiudi</button></> : <><span>Salva solo {"framecraft.recipes.json"}. Nessuna scrittura PLC. Il servizio legge questa configurazione al prossimo avvio manuale; gestione operativa e migrazioni restano da collegare.</span><button type="button" disabled={phase !== "ready" || !dirty || !!issues.length || snapshot?.initialized} onClick={() => void save()}><Save size={16} />{phase === "saving" ? "Salvataggio…" : "Salva configurazione ricette"}</button></>}</footer>
  </section></div>, document.body);
}
