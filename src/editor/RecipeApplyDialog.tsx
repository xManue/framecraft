import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Save, X } from "lucide-react";
import { emptyRecipeCatalog, parseRecipeCatalog, type RecipeCatalog } from "../core/recipeConfiguration";
import { emptyRecipeApplyConfig, newRecipeApplyProfile, parseRecipeApplyConfig, recipeApplyConfigurationError, recipeApplyConfigurationIssues, recipeApplyEnvironment, type RecipeApplyConfig, type RecipeApplyProfile, type RecipeApplyConfigurationSnapshot, type RecipeApplyEnvironment } from "../core/recipeApplyConfiguration";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";
import { useRecipeDialog } from "./useRecipeDialog";
import "./recipe-plc.css";

export function RecipeApplyDialog({ onClose }: { onClose(): void }) {
  const project = useEditorStore(state => state.project), [initial] = useState(project);
  const [snapshot, setSnapshot] = useState<RecipeApplyConfigurationSnapshot>(), [recipes, setRecipes] = useState<RecipeCatalog>(emptyRecipeCatalog), [environment, setEnvironment] = useState<RecipeApplyEnvironment>();
  const [config, setConfig] = useState<RecipeApplyConfig>(emptyRecipeApplyConfig), [base, setBase] = useState(""), [selected, setSelected] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "error">("loading"), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [review, setReview] = useState<string>(), [acknowledged, setAcknowledged] = useState(false), [discard, setDiscard] = useState<"close" | "reload">();
  const mounted = useRef(true), sequence = useRef(0), closeRef = useRef(onClose), title = useId(); closeRef.current = onClose;
  const currentProject = () => useEditorStore.getState().project === initial;
  const dirty = !!snapshot && JSON.stringify(config) !== base;
  const close = () => { if (phase === "saving") return; if (dirty) setDiscard("close"); else onClose(); };
  const dialog = useRecipeDialog(close);
  async function load() {
    if (!initial || !currentProject()) return; const request = ++sequence.current; setPhase("loading"); setError(""); setNotice("");
    try {
      const next = await desktopBridge.readRecipeApplyConfiguration(initial.root);
      if (!mounted.current || request !== sequence.current || !currentProject()) return;
      const catalog = next.recipes === null ? emptyRecipeCatalog() : parseRecipeCatalog(next.recipes), context = recipeApplyEnvironment(next);
      const parsed = next.source === null ? emptyRecipeApplyConfig() : parseRecipeApplyConfig(next.source);
      setSnapshot(next); setRecipes(catalog); setEnvironment(context); setConfig(parsed); setBase(JSON.stringify(parsed));
      setSelected(catalog.schemas[0]?.id ?? parsed.schemas[0]?.schemaId ?? ""); setReview(undefined); setDiscard(undefined); setAcknowledged(false); setPhase("ready");
    } catch (reason) { if (mounted.current && request === sequence.current && currentProject()) { setError(recipeApplyConfigurationError(reason)); setPhase("error"); } }
  }
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; sequence.current++; }; }, []);
  useEffect(() => { if (project !== initial) closeRef.current(); }, [project, initial]);
  useEffect(() => { if (review) dialog.current?.querySelector<HTMLInputElement>('[data-apply-ack]')?.focus(); }, [review]);
  const change = (next: RecipeApplyConfig) => { setConfig(next); setReview(undefined); setAcknowledged(false); setDiscard(undefined); setError(""); setNotice(""); };
  const mapping = config.schemas.find(item => item.schemaId === selected), schema = recipes.schemas.find(item => item.id === selected);
  const others = config.schemas.filter(item => item.schemaId !== selected), shared = !!mapping?.channelId && others.some(item => item.channelId === mapping.channelId);
  const channels = [...new Map(others.filter(item => item.channelId).map(item => [item.channelId, item])).values()];
  const patch = (next: Partial<RecipeApplyProfile>) => { if (mapping) change({ ...config, schemas: config.schemas.map(item => item === mapping ? { ...item, ...next } : item) }); };
  const issues = environment ? recipeApplyConfigurationIssues(config, recipes, environment) : [];
  const locked = phase !== "ready" || snapshot?.commissioned === true || review !== undefined;
  const prepare = () => { if (locked || !dirty || issues.length) return; setReview(JSON.stringify(parseRecipeApplyConfig(config, recipes, environment?.variables))); setAcknowledged(false); setError(""); };
  async function save() {
    if (!initial || !snapshot || !environment || snapshot.commissioned || phase !== "ready" || !review || !acknowledged || !dirty || issues.length || !currentProject()) return;
    const parsed = parseRecipeApplyConfig(config, recipes, environment.variables); if (JSON.stringify(parsed) !== review) return;
    setPhase("saving"); setError("");
    try {
      const next = await desktopBridge.saveRecipeApplyConfiguration(initial.root, snapshot, JSON.stringify(parsed, null, 2) + "\n");
      if (!mounted.current || !currentProject()) return;
      setSnapshot(next); setConfig(parsed); setBase(JSON.stringify(parsed)); setReview(undefined); setAcknowledged(false); setPhase("ready");
      setNotice("Interfaccia salvata. Nessuna connessione avviata, consenso di scrittura modificato o ricetta inviata. Il servizio carica il file al prossimo avvio manuale.");
    } catch (reason) { if (mounted.current && currentProject()) { setPhase("ready"); setReview(undefined); setAcknowledged(false); setError(recipeApplyConfigurationError(reason)); } }
  }
  const tagSelect = (key: "requestTag" | "responseTag", label: string, access: "write" | "read") => {
    const tags = environment?.variables.filter(item => !item.detected && [access, "read-write"].includes(item.access) && ["string", "wstring"].includes(item.dataType.toLowerCase())) ?? [], value = mapping?.[key] ?? "";
    return <label>{label}<select aria-label={label} value={value} onChange={event => patch({ [key]: event.target.value })}><option value="">Scegli un tag {access === "write" ? "scrivibile" : "leggibile"}</option>{value && !tags.some(item => item.name === value) && <option value={value}>Da correggere · {value}</option>}{tags.map(tag => <option key={tag.name} value={tag.name}>{tag.name} · {tag.dataType}</option>)}</select></label>;
  };
  const number = (key: "maxPayloadBytes" | "maxAgeMs" | "prepareTimeoutMs" | "applyTimeoutMs" | "stageLifetimeMs", label: string, min: number, max: number) => <label>{label}<input aria-label={label} type="number" min={min} max={max} step="1" value={mapping && Number.isFinite(mapping[key]) ? mapping[key] : ""} onChange={event => patch({ [key]: event.target.value === "" ? NaN : Number(event.target.value) })} /></label>;
  return createPortal(<div className="recipe-plc-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section className="recipe-plc-dialog recipe-apply-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1}>
    <header><div><small>RICETTE · INTERFACCIA DEL PROGRAMMA PLC</small><h2 id={title}>Applicazione ricette al PLC</h2></div><button type="button" aria-label="Chiudi applicazione ricette" disabled={phase === "saving"} onClick={close}><X size={18} /></button></header>
    <div className="recipe-plc-body" aria-busy={phase === "loading" || phase === "saving"}>
      <p>La ricetta viene preparata completa e applicata soltanto dopo il comando previsto dal protocollo. Framecraft richiede la conferma del programma PLC: una risposta MQTT o OPC UA Write Good non basta.</p>
      <p>Qui configuri soltanto l’interfaccia. I tag devono essere già dichiarati e collegati in Connessioni PLC; il programma macchina deve implementare Framecraft Recipe Apply v1.</p>
      {phase === "loading" && <p role="status">Lettura dei file salvati…</p>}{error && <p role="alert" className="recipe-plc-error">{error}</p>}{notice && <p role="status">{notice}</p>}
      {phase !== "loading" && <button type="button" disabled={phase === "saving"} onClick={() => { if (dirty) setDiscard("reload"); else void load(); }}>Rileggi interfaccia</button>}
      {snapshot && environment && phase !== "loading" && <>
        {snapshot.commissioned && <p className="recipe-plc-confirm" role="status">Registro trasferimenti già presente: interfaccia in sola lettura per conservare identità e recupero delle richieste. Serve una migrazione con verifica e backup, non cancellare il registro per sbloccarla. L’archivio ricette resta separato.</p>}
        <fieldset disabled={phase === "saving" || review !== undefined}><label>Schema ricetta<select aria-label="Schema ricetta" value={selected} onChange={event => setSelected(event.target.value)}>{!recipes.schemas.length && !config.schemas.length && <option value="">Nessuno schema</option>}{recipes.schemas.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}{config.schemas.filter(item => !recipes.schemas.some(schema => schema.id === item.schemaId)).map(item => <option key={item.schemaId} value={item.schemaId}>Schema mancante · {item.schemaId}</option>)}</select></label></fieldset>
        <fieldset disabled={locked}>
          {!schema && !mapping && <p>Salva prima uno schema nella finestra Ricette. Non vengono aggiunti tag o valori macchina dimostrativi.</p>}
          {schema && <label className="recipe-plc-check"><input type="checkbox" checked={!!mapping} onChange={event => change({ ...config, schemas: event.target.checked ? [...config.schemas, newRecipeApplyProfile(schema.id)] : config.schemas.filter(item => item.schemaId !== selected) })} />Configura applicazione PLC per questo schema</label>}
          {mapping && <>
            {!!channels.length && <label>Riprendi un canale già configurato<select aria-label="Riprendi un canale già configurato" value="" onChange={event => { const existing = channels.find(item => item.channelId === event.target.value); if (existing) patch({ ...existing, schemaId: selected }); }}><option value="">Scegli solo per condividere la stessa area PLC</option>{channels.map(item => <option key={item.channelId} value={item.channelId}>{item.channelId} · {item.requestTag} / {item.responseTag}</option>)}</select></label>}
            {shared && <p>Canale condiviso con altri schemi: tag e tempi sono unici per quell’area PLC. <button type="button" onClick={() => patch({ channelId: "" })}>Separa in un nuovo canale</button></p>}
            <fieldset disabled={shared} className="recipe-apply-channel"><label>ID canale PLC<input aria-label="ID canale PLC" type="text" maxLength={80} value={mapping.channelId} placeholder="ID concordato con chi programma il PLC" onChange={event => patch({ channelId: event.target.value })} /></label>
              <div className="recipe-plc-timing">{tagSelect("requestTag", "Tag richiesta al PLC", "write")}{tagSelect("responseTag", "Tag risposta del PLC", "read")}</div>
              <details className="recipe-apply-budgets" open><summary>Capacità del buffer e tempi</summary><p>Il buffer deve contenere il messaggio completo: STRING[254] non è sufficiente. I tempi dipendono da rete e programma PLC; non nascondono una connessione guasta.</p><div className="recipe-plc-timing">{number("maxPayloadBytes", "Capacità richiesta PLC (caratteri ASCII)", 512, 131072)}{number("maxAgeMs", "Età massima risposta (ms)", 250, 10000)}{number("prepareTimeoutMs", "Attesa preparazione (ms)", 1000, 20000)}{number("applyTimeoutMs", "Attesa applicazione (ms)", 1000, 20000)}{number("stageLifetimeMs", "Durata preparazione nel PLC (ms)", mapping.prepareTimeoutMs + 1000, 120000)}</div></details>
            </fieldset>
            {!snapshot.commissioned && <button type="button" onClick={() => change({ ...config, schemas: config.schemas.filter(item => item.schemaId !== selected) })}>Rimuovi interfaccia dello schema</button>}
          </>}
        </fieldset>
        {!!issues.length && <section className="recipe-plc-error" aria-label="Prima di salvare"><h3>Da completare</h3><ul>{issues.map(item => <li key={item}>{item}</li>)}</ul></section>}
        <details className="recipe-apply-guide"><summary>Preparazione e guida per chi programma il PLC</summary><p>Usa due buffer String/WString della stessa connessione: richiesta scrivibile e risposta leggibile. Servono controllo di schema e valori, interblocchi, scadenza della preparazione e identità/contatori ritentivi. Un esito incerto non autorizza un reinvio automatico.</p><p>Namespace del progetto: <code>{environment.auth?.namespace ?? "Da configurare in Account e permessi"}</code>. Non accettare automaticamente un’altra identità.</p><p>Nel Runtime generato trovi <code>runtime/RECIPE-APPLY-PROTOCOL.md</code> e il comando di sola lettura <code>npm run recipe-interface -- --json</code> (dalla cartella runtime) per namespace, hash e campi. Non stampa valori delle ricette né credenziali.</p><p>Assegna esplicitamente il permesso recipes.apply e gli schemi consentiti in Account e permessi. Il collaudo di rete, ritenzione e applicazione coerente sulla CPU reale è indispensabile prima della produzione.</p></details>
        {review && <section className="recipe-plc-confirm" role="group" aria-label="Conferma interfaccia ricette">
          <h3>Controlla prima di salvare</h3><p>{config.schemas.length} schemi configurati. Verrà sostituito solo framecraft.recipe-apply.json. Nessun tag, account, consenso di scrittura o valore ricetta viene modificato.</p>
          <ul>{config.schemas.map(item => <li key={item.schemaId}>{recipes.schemas.find(schema => schema.id === item.schemaId)?.name ?? item.schemaId} · canale {item.channelId} · {item.requestTag} → {item.responseTag} · {item.maxPayloadBytes} caratteri</li>)}</ul>
          <label className="recipe-plc-check"><input data-apply-ack type="checkbox" disabled={phase === "saving"} checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />Confermo che il servizio è fermo e che canale, buffer e protocollo sono concordati con chi programma il PLC</label>
          <div className="recipe-apply-actions"><button type="button" disabled={phase === "saving"} onClick={() => { setReview(undefined); setAcknowledged(false); }}>Torna alla configurazione</button><button data-apply-confirm type="button" disabled={!acknowledged || phase === "saving"} onClick={() => { void save(); }}><Save size={16} />{phase === "saving" ? "Salvataggio…" : "Conferma salvataggio interfaccia"}</button></div>
        </section>}
      </>}
      {discard && <section className="recipe-plc-confirm" role="group" aria-label="Modifiche non salvate"><p>Scartare la bozza dell’interfaccia? I file e il PLC restano invariati.</p><div className="recipe-apply-actions"><button type="button" onClick={() => setDiscard(undefined)}>Mantieni bozza</button><button type="button" onClick={() => { if (discard === "close") onClose(); else void load(); }}>Scarta e {discard === "close" ? "chiudi" : "rileggi"}</button></div></section>}
    </div>
    <footer><small>File separato: framecraft.recipe-apply.json. Nessun invio al PLC da questa finestra.</small><button type="button" disabled={locked || !dirty || !!issues.length} onClick={prepare}>Verifica configurazione</button></footer>
  </section></div>, document.body);
}
