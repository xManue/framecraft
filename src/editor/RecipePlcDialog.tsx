import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Save, X } from "lucide-react";
import { emptyRecipeCatalog, parseRecipeCatalog, type RecipeCatalog } from "../core/recipeConfiguration";
import { emptyRecipePlcConfig, parseRecipePlcConfig, recipePlcConfigurationError, recipePlcTypeCompatible, recipePlcVariables, type RecipePlcConfig, type RecipePlcMapping, type RecipePlcConfigurationSnapshot } from "../core/recipePlcConfiguration";
import type { RecipePlcVariable } from "../../runtime/recipe-plc.mjs";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";
import { useRecipeDialog } from "./useRecipeDialog";
import "./recipe-plc.css";

export function RecipePlcDialog({ onClose }: { onClose(): void }) {
  const project = useEditorStore(state => state.project), [initial] = useState(project);
  const [snapshot, setSnapshot] = useState<RecipePlcConfigurationSnapshot>(), [catalog, setCatalog] = useState<RecipeCatalog>(emptyRecipeCatalog);
  const [variables, setVariables] = useState<RecipePlcVariable[]>([]), [config, setConfig] = useState<RecipePlcConfig>(emptyRecipePlcConfig), [base, setBase] = useState("");
  const [selected, setSelected] = useState(""), [phase, setPhase] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [discard, setDiscard] = useState<"close" | "reload">();
  const mounted = useRef(true), sequence = useRef(0), title = useId(), closeRef = useRef(onClose); closeRef.current = onClose;
  const dirty = !!snapshot && JSON.stringify(config) !== base;
  const close = () => { if (phase === "saving") return; if (dirty) setDiscard("close"); else onClose(); };
  const dialog = useRecipeDialog(close);
  async function load() {
    if (!initial || useEditorStore.getState().project !== initial) return;
    const current = ++sequence.current; setPhase("loading"); setError(""); setNotice("");
    try {
      const next = await desktopBridge.readRecipePlcConfiguration(initial.root);
      if (!mounted.current || current !== sequence.current || useEditorStore.getState().project !== initial) return;
      const recipes = next.recipes === null ? emptyRecipeCatalog() : parseRecipeCatalog(next.recipes), tags = recipePlcVariables(next.plc);
      const parsed = next.source === null ? emptyRecipePlcConfig() : parseRecipePlcConfig(next.source);
      setSnapshot(next); setCatalog(recipes); setVariables(tags); setConfig(parsed); setBase(JSON.stringify(parsed));
      setSelected(recipes.schemas[0]?.id ?? parsed.schemas[0]?.schemaId ?? ""); setDiscard(undefined); setPhase("ready");
    } catch (reason) { if (mounted.current && current === sequence.current) { setError(recipePlcConfigurationError(reason)); setPhase("error"); } }
  }
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; sequence.current++; }; }, []);
  useEffect(() => { if (project !== initial) closeRef.current(); }, [project, initial]);
  const change = (next: RecipePlcConfig) => { setConfig(next); setError(""); setNotice(""); setDiscard(undefined); };
  const mapping = config.schemas.find(item => item.schemaId === selected), schema = catalog.schemas.find(item => item.id === selected);
  const patch = (next: Partial<RecipePlcMapping>) => { if (mapping) change({ ...config, schemas: config.schemas.map(item => item === mapping ? { ...item, ...next } : item) }); };
  let issue = "";
  try { parseRecipePlcConfig(config, catalog, variables); } catch (reason) { issue = recipePlcConfigurationError(reason); }
  async function save() {
    if (!initial || !snapshot || phase !== "ready" || issue || !dirty || useEditorStore.getState().project !== initial) return;
    setPhase("saving"); setError("");
    try {
      const parsed = parseRecipePlcConfig(config, catalog, variables);
      const next = await desktopBridge.saveRecipePlcConfiguration(initial.root, snapshot, JSON.stringify(parsed, null, 2) + "\n");
      if (!mounted.current || useEditorStore.getState().project !== initial) return;
      setSnapshot(next); setConfig(parsed); setBase(JSON.stringify(parsed)); setPhase("ready"); setNotice("Collegamenti salvati. Riavvia manualmente il servizio per caricarli. Nessuna connessione avviata, ricetta operativa alterata o scrittura PLC.");
    } catch (reason) { if (mounted.current) { setPhase("ready"); setError(recipePlcConfigurationError(reason)); } }
  }
  return createPortal(<div className="recipe-plc-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section className="recipe-plc-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1}>
    <header><div><small>RICETTE · CONFIGURAZIONE DEL PROGETTO</small><h2 id={title}>Collegamenti PLC</h2></div><button type="button" aria-label="Chiudi collegamenti PLC" disabled={phase === "saving"} onClick={close}><X size={18} /></button></header>
    <div className="recipe-plc-body" aria-busy={phase === "loading" || phase === "saving"}>
      <p>Associa i campi ai tag dichiarati per leggere e confrontare i valori della macchina. Nessuna associazione automatica e nessun invio al PLC.</p>
      <p>L’applicazione futura di una ricetta richiederà una conferma del programma PLC. Una scrittura riuscita o una risposta MQTT non significherà “ricetta applicata”.</p>
      {phase === "loading" && <p role="status">Lettura dei file salvati…</p>}
      {error && <p role="alert" className="recipe-plc-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {phase !== "loading" && <button type="button" disabled={phase === "saving"} onClick={() => { if (dirty) setDiscard("reload"); else void load(); }}>Rileggi configurazione</button>}
      {snapshot && phase !== "loading" && <fieldset disabled={phase !== "ready"}>
        <label>Schema ricetta<select aria-label="Schema ricetta" value={selected} onChange={event => setSelected(event.target.value)}>
          {!catalog.schemas.length && !config.schemas.length && <option value="">Nessuno schema</option>}
          {catalog.schemas.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
          {config.schemas.filter(item => !catalog.schemas.some(schema => schema.id === item.schemaId)).map(item => <option value={item.schemaId} key={item.schemaId}>Schema mancante · {item.schemaId}</option>)}
        </select></label>
        {!schema && !mapping && <p>Salva prima uno schema in Ricette e dichiara i tag in Variabili PLC.</p>}
        {schema && <label className="recipe-plc-check"><input type="checkbox" checked={!!mapping} onChange={event => change({ ...config, schemas: event.target.checked ? [...config.schemas, { schemaId: schema.id, maxAgeMs: 2000, maxSkewMs: 250, fields: schema.fields.map(field => ({ fieldId: field.id, tag: "" })) }] : config.schemas.filter(item => item.schemaId !== selected) })} />Abilita lettura PLC per questo schema</label>}
        {mapping && !schema && <p role="alert">Lo schema non esiste più nel catalogo salvato. Rimuovi esplicitamente il collegamento obsoleto o ripristina lo schema.</p>}
        {mapping && <>
          <div className="recipe-plc-timing"><label>Età massima del campione (ms)<input type="number" min="250" max="600000" step="1" value={Number.isFinite(mapping.maxAgeMs) ? mapping.maxAgeMs : ""} onChange={event => patch({ maxAgeMs: event.target.value === "" ? NaN : Number(event.target.value) })} /></label><label>Distanza massima tra i campioni (ms)<input type="number" min="0" max={mapping.maxAgeMs} step="1" value={Number.isFinite(mapping.maxSkewMs) ? mapping.maxSkewMs : ""} onChange={event => patch({ maxSkewMs: event.target.value === "" ? NaN : Number(event.target.value) })} /></label></div>
          <p className="recipe-plc-muted">Sono gli ultimi campioni ricevuti dal servizio, non valori letti contemporaneamente nello stesso ciclo PLC. Qualità non buona, retained MQTT e valori fuori limite impediscono la copia completa.</p>
          <div className="recipe-plc-fields">{schema?.fields.map(field => {
            const binding = mapping.fields.find(item => item.fieldId === field.id), tag = binding?.tag ?? "";
            const compatible = variables.filter(item => !item.detected && ["read", "read-write"].includes(item.access) && recipePlcTypeCompatible(field.type, item.dataType));
            return <label key={field.id}><span>{field.name}{field.unit ? ` · ${field.unit}` : ""}<small>{field.type} · {field.id}</small></span><select aria-label={`Tag PLC per ${field.name}`} value={tag} onChange={event => patch({ fields: [...mapping.fields.filter(item => item.fieldId !== field.id), { fieldId: field.id, tag: event.target.value }] })}>
              <option value="">Scegli un tag leggibile</option>{tag && !compatible.some(item => item.name === tag) && <option value={tag}>Da correggere · {tag}</option>}{compatible.map(item => <option key={item.name} value={item.name}>{item.name} · {item.dataType}</option>)}
            </select></label>;
          })}</div>
          {schema && mapping.fields.some(item => !schema.fields.some(field => field.id === item.fieldId)) && <p role="alert">Ci sono campi obsoleti: disabilita e riabilita la lettura per ricostruire il mapping, poi scegli di nuovo tutti i tag.</p>}
          <button type="button" onClick={() => change({ ...config, schemas: config.schemas.filter(item => item.schemaId !== selected) })}>Rimuovi collegamento dello schema</button>
        </>}
        {issue && <p className="recipe-plc-error" role="status">Da completare: {issue}</p>}
      </fieldset>}
      {discard && <section className="recipe-plc-confirm" role="group" aria-label="Modifiche non salvate"><p>Scartare le modifiche ai collegamenti non salvate? I file su disco restano invariati.</p><button type="button" onClick={() => setDiscard(undefined)}>Mantieni bozza</button><button type="button" onClick={() => { if (discard === "close") onClose(); else void load(); }}>Scarta e {discard === "close" ? "chiudi" : "rileggi"}</button></section>}
    </div>
    <footer><small>File separato: framecraft.recipe-plc.json. Non sostituisce l’archivio operativo.</small><button type="button" disabled={phase !== "ready" || !dirty || !!issue} onClick={() => { void save(); }}><Save size={16} />{phase === "saving" ? "Salvataggio…" : "Salva collegamenti"}</button></footer>
  </section></div>, document.body);
}
