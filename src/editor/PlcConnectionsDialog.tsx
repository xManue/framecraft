import { Cable, Check, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeMqttTagValue, type PlcConnectionConfig } from "../../runtime/connection-config.mjs";
import type { MqttBinding } from "../../runtime/mqtt-driver.mjs";
import type { GatewayConfig } from "../../runtime/gateway.mjs";
import {
  connectionConfigurationIssues, newMqttConnection, parseConnectionConfiguration, serializeConnectionConfiguration,
  type ConnectionConfigurationSnapshot, type ConnectionEditorModel, type ConnectionIssue,
} from "../core/plcConnections";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";

type FieldProps = {
  label: string; path: string; value?: string | number; onChange(value: string): void;
  issues: ConnectionIssue[]; hint?: string; placeholder?: string; numeric?: boolean; min?: number; max?: number;
  choices?: readonly { value: string; label: string; disabled?: boolean }[]; disabled?: boolean;
};
function Field({ label, path, value, onChange, issues, hint, placeholder, numeric, min, max, choices, disabled }: FieldProps) {
  const id = useId(); const error = issues.find((issue) => issue.path === path);
  const props = { id, "data-field": path, value: typeof value === "number" && !Number.isFinite(value) ? "" : value ?? "", disabled, "aria-invalid": !!error, "aria-describedby": (hint ? id + "-hint " : "") + (error ? id + "-error" : "") || undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(event.target.value) };
  return <div className="connection-field"><label htmlFor={id}>{label}</label>
    {choices ? <select {...props}>{choices.map((choice) => <option key={choice.value} value={choice.value} disabled={choice.disabled}>{choice.label}</option>)}</select> : <input {...props} type={numeric ? "number" : "text"} min={min} max={max} placeholder={placeholder} autoComplete="off" spellCheck={false} />}
    {hint && <small id={id + "-hint"}>{hint}</small>}{error && <small className="connection-error" id={id + "-error"}>{error.message}</small>}
  </div>;
}
function Toggle({ label, path, checked, onChange, issues, hint }: { label: string; path: string; checked?: boolean; onChange(value: boolean): void; issues: ConnectionIssue[]; hint?: string }) {
  const id = useId(); const error = issues.find((issue) => issue.path === path);
  return <div className="connection-toggle"><label><input type="checkbox" data-field={path} checked={checked === true} onChange={(event) => onChange(event.target.checked)} aria-invalid={!!error} aria-describedby={error ? id : undefined} /><span>{label}</span></label>{hint && <small>{hint}</small>}{error && <small id={id} className="connection-error">{error.message}</small>}</div>;
}
const qosChoices = [0, 1, 2].map((value) => ({ value: String(value), label: "QoS " + value }));
const encodings = [{ value: "json", label: "JSON" }, { value: "text", label: "Testo scalare" }];
const optionalNumber = (value: string) => value === "" ? undefined : Number(value);
function supportedType(type: string): boolean { try { normalizeMqttTagValue(["string", "wstring"].includes(type.toLowerCase()) ? "" : 0, type); return true; } catch { return false; } }

export function PlcConnectionsDialog({ onClose }: { onClose(): void }) {
  const project = useEditorStore((state) => state.project);
  const [initialProject] = useState(project);
  const [snapshot, setSnapshot] = useState<ConnectionConfigurationSnapshot>();
  const [model, setModel] = useState<ConnectionEditorModel>();
  const [base, setBase] = useState("");
  const [selected, setSelected] = useState(0);
  const [mappingPage, setMappingPage] = useState(0);
  const [mappingSearch, setMappingSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [confirm, setConfirm] = useState<"close" | "reload">();
  const [focusPath, setFocusPath] = useState<string>();
  const dialog = useRef<HTMLElement>(null);
  const mounted = useRef(true); const sequence = useRef(0);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const dirty = !!model && JSON.stringify(model) !== base;
  const issues = model ? connectionConfigurationIssues(model) : [];
  const handlers = useRef({ close: () => {}, save: () => {} });

  async function load() {
    if (!initialProject || useEditorStore.getState().project !== initialProject) return;
    const request = ++sequence.current; setPhase("loading"); setError(""); setStatus("");
    try {
      const next = await desktopBridge.readConnectionConfiguration(initialProject.root);
      const parsed = parseConnectionConfiguration(next);
      if (!mounted.current || sequence.current !== request || useEditorStore.getState().project !== initialProject) return;
      setSnapshot(next); setModel(parsed); setBase(JSON.stringify(parsed)); setSelected(0); setMappingPage(0); setMappingSearch(""); setTagSearch(""); setPhase("ready");
    } catch (e) {
      if (!mounted.current || sequence.current !== request || useEditorStore.getState().project !== initialProject) return;
      setModel(undefined); setPhase("error"); setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    mounted.current = true; void load();
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("[data-close-connections]")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); handlers.current.close(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); event.stopImmediatePropagation(); handlers.current.save(); return; }
      if (event.key === "Tab") {
        const scope = dialog.current?.querySelector<HTMLElement>('[role="alertdialog"]') ?? dialog.current;
        const controls = [...(scope?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? [])].filter((element) => !element.closest("fieldset:disabled") && (!element.closest("details:not([open])") || element.tagName === "SUMMARY"));
        const first = controls[0], last = controls.at(-1);
        if (controls.length && (event.shiftKey && (document.activeElement === first || !scope?.contains(document.activeElement)) || !event.shiftKey && (document.activeElement === last || !scope?.contains(document.activeElement)))) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      }
      event.stopPropagation();
    };
    window.addEventListener("keydown", keydown, true);
    return () => { mounted.current = false; sequence.current++; window.removeEventListener("keydown", keydown, true); if (previous?.isConnected) previous.focus(); };
    // Drafts are local to this opening, intentionally absent from recovery/checkpoints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (project !== initialProject) onCloseRef.current(); }, [project, initialProject]);
  useEffect(() => {
    if (!focusPath) return;
    const field = [...(dialog.current?.querySelectorAll<HTMLElement>("[data-field]") ?? [])].find((element) => element.dataset.field === focusPath);
    if (field) { const details = field.closest("details"); if (details) details.open = true; field.focus(); field.scrollIntoView?.({ block: "nearest" }); setFocusPath(undefined); }
  }, [focusPath, selected, mappingPage, mappingSearch]);

  function requestClose() {
    if (phase === "saving") return;
    if (confirm) { setConfirm(undefined); return; }
    if (dirty) setConfirm("close"); else onCloseRef.current();
  }
  function requestReload() { if (dirty) setConfirm("reload"); else void load(); }
  async function save() {
    if (!initialProject || !model || !snapshot || phase !== "ready" || confirm || issues.length || !dirty || useEditorStore.getState().project !== initialProject || useEditorStore.getState().loading) return;
    const state = useEditorStore.getState();
    if (state.dirty && state.document && ["framecraft.connections.json", "framecraft.runtime.json", "framecraft.plc.json"].some((name) => state.document?.file.replaceAll("\\", "/") === initialProject.root.replaceAll("\\", "/") + "/" + name)) { setError("Salva o annulla prima le modifiche al catalogo aperto nella vista codice."); return; }
    const request = ++sequence.current; setPhase("saving"); setError(""); setStatus("");
    try {
      const next = await desktopBridge.saveConnectionConfiguration(initialProject.root, snapshot, serializeConnectionConfiguration(model));
      if (!mounted.current || request !== sequence.current || useEditorStore.getState().project !== initialProject) return;
      const parsed = parseConnectionConfiguration(next);
      setSnapshot(next); setModel(parsed); setBase(JSON.stringify(parsed)); setPhase("ready");
      setStatus("Configurazione salvata. Nessun collegamento o comando è stato avviato: prepara l’ambiente, poi avvia o riavvia il servizio e il server del pannello.");
    } catch (e) {
      if (!mounted.current || request !== sequence.current || useEditorStore.getState().project !== initialProject) return;
      setPhase("ready"); setError(e instanceof Error ? e.message : String(e));
    }
  }
  handlers.current = { close: requestClose, save: () => void save() };
  function update(action: (current: ConnectionEditorModel) => ConnectionEditorModel) { setModel((current) => current ? action(current) : current); setStatus(""); setError(""); }
  function chooseConnection(index: number) { setSelected(index); setMappingPage(0); setMappingSearch(""); setTagSearch(""); }
  function gateway(patch: Partial<GatewayConfig>) { update((current) => ({ ...current, catalog: { ...current.catalog, gateway: { ...current.catalog.gateway, ...patch } } })); }
  function client(patch: Partial<ConnectionEditorModel["runtime"]["gateway"]>) { update((current) => ({ ...current, runtime: { ...current.runtime, gateway: { ...current.runtime.gateway, ...patch } } })); }
  function connection(patch: Partial<PlcConnectionConfig>) { update((current) => ({ ...current, catalog: { ...current.catalog, connections: current.catalog.connections.map((c, i) => i === selected ? { ...c, ...patch } : c) } })); }
  function binding(index: number, patch: Partial<MqttBinding>) { if (model) connection({ bindings: model.catalog.connections[selected].bindings.map((b, i) => i === index ? { ...b, ...patch } : b) }); }
  const current = model?.catalog.connections[selected];
  const pageSize = 10;
  const mappingRows = current?.bindings.map((value, index) => ({ value, index })).filter(({ value }) => !mappingSearch || value.tag.toLowerCase().includes(mappingSearch.toLowerCase())) ?? [];
  const page = Math.min(mappingPage, Math.max(0, Math.ceil(mappingRows.length / pageSize) - 1));
  const availableTags = model?.variables.filter((tag) => !tagSearch || tag.name.toLowerCase().includes(tagSearch.toLowerCase())).slice(0, 100) ?? [];
  const prefix = "connections." + selected + ".";
  const field = (label: string, key: string, value: string | number | undefined, onChange: (value: string) => void, extra: Partial<FieldProps> = {}) => <Field label={label} path={key} value={value} onChange={onChange} issues={issues} {...extra} />;
  const toggle = (label: string, key: string, checked: boolean | undefined, onChange: (value: boolean) => void, hint?: string) => <Toggle label={label} path={key} checked={checked} onChange={onChange} issues={issues} hint={hint} />;

  return createPortal(<div className="connections-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={dialog} className="connections-dialog" role="dialog" aria-modal="true" aria-labelledby="plc-connections-title" aria-describedby="plc-connections-purpose" aria-busy={phase === "loading" || phase === "saving"}>
      <header><div><h2 id="plc-connections-title"><Cable size={20} aria-hidden="true" /> Connessioni PLC</h2><p id="plc-connections-purpose">{initialProject?.name} · configurazione offline del servizio MQTT e dei tag del pannello</p></div><button type="button" data-close-connections disabled={phase === "saving"} onClick={requestClose} aria-label="Chiudi Connessioni PLC"><X size={20} /></button></header>
      <div className="connections-body">
        {phase === "loading" && <p role="status">Lettura dei cataloghi del progetto…</p>}
        {error && <div className="connection-error-banner" role="alert">{error}</div>}
        {status && <div className="connection-success" role="status"><Check size={18} />{status}</div>}
        {model && <fieldset disabled={phase !== "ready" || !!confirm}>
          <p className="connection-note">MQTT disponibile. OPC UA: driver ancora da implementare. Salvare configura i JSON; non verifica CPU, broker, certificati o credenziali e non avvia la rete.</p>
          <section className="connection-section"><h3>1. Servizio e pannello</h3><div className="connection-grid">
            {toggle("Abilita il servizio gateway", "gateway.enabled", model.catalog.gateway.enabled, (enabled) => gateway({ enabled }), "Vale al prossimo avvio manuale del servizio Node.")}
            {toggle("Collega il pannello al gateway", "runtime.gateway.enabled", model.runtime.gateway.enabled, (enabled) => client({ enabled }), "Solo nel Runtime autonomo, non nel canvas dell’editor.")}
            {field("Porta locale del gateway", "gateway.port", model.catalog.gateway.port, (value) => gateway({ port: value === "" ? NaN : Number(value) }), { numeric: true, min: 1, max: 65535, hint: "Host fisso 127.0.0.1. Per accesso remoto usa un reverse proxy protetto." })}
            {field("Variabile ambiente del token gateway", "gateway.tokenEnv", model.catalog.gateway.tokenEnv, (tokenEnv) => gateway({ tokenEnv }), { hint: "Solo il nome: il valore privato (32+ caratteri) deve esistere nel servizio e nel server proxy. Mai VITE_*." })}
          </div><details><summary>Opzioni gateway e autorizzazione delle scritture</summary><div className="connection-grid">
            {field("Lettura del pannello (ms)", "runtime.gateway.pollMs", model.runtime.gateway.pollMs, (value) => client({ pollMs: value === "" ? NaN : Number(value) }), { numeric: true, min: 100, max: 60000 })}
            {field("Timeout del pannello (ms)", "runtime.gateway.timeoutMs", model.runtime.gateway.timeoutMs, (value) => client({ timeoutMs: optionalNumber(value) }), { numeric: true, min: 250, max: 70000, hint: "Vuoto: default del client." })}
            {field("Percorso same-origin del gateway", "runtime.gateway.path", model.runtime.gateway.path, () => {}, { disabled: true, hint: "Il gateway attuale usa solo /_framecraft/plc/v1." })}
            {model.runtime.gateway.path !== "/_framecraft/plc/v1" && <button type="button" onClick={() => client({ path: "/_framecraft/plc/v1" })}>Ripristina percorso standard</button>}
            <div className="connection-field"><label htmlFor="plc-origins">Origini HTTP/HTTPS autorizzate</label><textarea id="plc-origins" data-field="gateway.allowedOrigins" value={model.catalog.gateway.allowedOrigins.join("\n")} onChange={(event) => gateway({ allowedOrigins: event.target.value.split("\n") })} placeholder="https://hmi.azienda.local" aria-invalid={issues.some((i) => i.path === "gateway.allowedOrigins")} aria-describedby="plc-origins-help" autoComplete="off" spellCheck={false} /><small id="plc-origins-help">Una origine esatta per riga, senza percorso. Non è CORS aperto né autenticazione operatore. Non vengono aggiunte origini automaticamente.</small>{issues.filter((i) => i.path === "gateway.allowedOrigins").map((i) => <small className="connection-error" key={i.path}>{i.message}</small>)}</div>
            {toggle("Consenti scritture nel gateway", "gateway.allowWrites", model.catalog.gateway.allowWrites, (allowWrites) => gateway({ allowWrites }), "Servono anche il consenso della connessione, un tag scrivibile e il topic comando. L’ACK broker non conferma l’esecuzione PLC.")}
          </div></details></section>
          <section className="connection-section"><div className="connection-section-heading"><h3>2. Broker e tag</h3><button type="button" disabled={model.catalog.connections.length >= 1000} onClick={() => { setSelected(model.catalog.connections.length); update((m) => ({ ...m, catalog: { ...m.catalog, connections: [...m.catalog.connections, newMqttConnection(m.catalog.connections)] } })); }}><Plus size={17} /> Aggiungi MQTT</button></div>
            {!!model.catalog.connections.length && <div className="connection-picker" role="group" aria-label="Scegli connessione MQTT">{model.catalog.connections.map((c, index) => <button key={index} type="button" aria-pressed={selected === index} onClick={() => chooseConnection(index)}>{c.id || "Connessione " + (index + 1)}<small>{c.enabled ? "Abilitata" : "Disabilitata"} · {c.bindings.length} tag</small></button>)}</div>}
            {!current && <p>Nessuna connessione configurata. Aggiungi un broker MQTT e usa i tag già salvati in Variabili PLC.</p>}
            {current && <><div className="connection-grid">
              {field("Nome connessione", prefix + "id", current.id, (id) => connection({ id }))}
              {field("Indirizzo del broker", prefix + "url", current.url, (url) => connection({ url }), { placeholder: "mqtts://broker.azienda.local:8883", hint: "mqtt, mqtts, ws o wss. Non inserire utente e password nell’URL." })}
              {toggle("Abilita questa connessione", prefix + "enabled", current.enabled, (enabled) => connection({ enabled }))}
              {toggle("Accetto MQTT senza TLS (solo rete di test)", prefix + "allowInsecure", current.allowInsecure, (allowInsecure) => connection({ allowInsecure }), "Obbligatorio per mqtt:// e ws://. Non costituisce approvazione alla produzione.")}
            </div><details><summary>Autenticazione, TLS e opzioni MQTT</summary><div className="connection-grid">
              {field("Variabile ambiente utente", prefix + "usernameEnv", current.usernameEnv, (value) => connection({ usernameEnv: value || undefined }))}
              {field("Variabile ambiente password", prefix + "passwordEnv", current.passwordEnv, (value) => connection({ passwordEnv: value || undefined }), { hint: "Nomi di variabili private del servizio. Nessun segreto nel browser o nei checkpoint dell’editor." })}
              {field("Client ID", prefix + "clientId", current.clientId, (value) => connection({ clientId: value || undefined }), { hint: "Vuoto: ID generato dal driver. Non condividere lo stesso ID fra servizi." })}
              {field("Versione MQTT", prefix + "protocolVersion", current.protocolVersion ?? 4, (value) => connection({ protocolVersion: Number(value) as 4 | 5 }), { choices: [{ value: "4", label: "3.1.1" }, { value: "5", label: "5.0" }] })}
              {field("Riconnessione (ms)", prefix + "reconnectMs", current.reconnectMs, (value) => connection({ reconnectMs: optionalNumber(value) }), { numeric: true, min: 250, max: 60000, hint: "Default: 1000 ms. I comandi non vengono accodati o ripetuti." })}
              {field("Timeout MQTT (ms)", prefix + "timeoutMs", current.timeoutMs, (value) => connection({ timeoutMs: optionalNumber(value) }), { numeric: true, min: 250, max: 60000, hint: "Default: 10000 ms." })}
              {field("Limite payload (byte)", prefix + "maxPayloadBytes", current.maxPayloadBytes, (value) => connection({ maxPayloadBytes: optionalNumber(value) }), { numeric: true, min: 1, max: 1048576 })}
              {(["caFile", "certificateFile", "privateKeyFile"] as const).map((key) => <Field key={key} label={{ caFile: "Percorso CA sul servizio", certificateFile: "Percorso certificato client", privateKeyFile: "Percorso chiave privata" }[key]} path={prefix + "tls." + key} value={current.tls?.[key]} onChange={(value) => connection({ tls: { ...current.tls, [key]: value || undefined } })} issues={issues} hint="Percorso locale del servizio Node, non contenuto del certificato. Certificato client e chiave vanno insieme." />)}
              {toggle("Consenti comandi su questa connessione", prefix + "allowWrites", current.allowWrites, (allowWrites) => connection({ allowWrites }))}
            </div></details>
            <div className="connection-section-heading"><h4>Mapping dei tag · {current.bindings.length}</h4><button type="button" disabled={model.catalog.connections.reduce((n, c) => n + c.bindings.length, 0) >= 5000 || !model.variables.some((v) => supportedType(v.dataType) && !current.bindings.some((b) => b.tag === v.name))} onClick={() => { const tag = model.variables.find((v) => supportedType(v.dataType) && !current.bindings.some((b) => b.tag === v.name)); if (tag) connection({ bindings: [...current.bindings, { tag: tag.name, encoding: "json", qos: 0, staleAfterMs: 5000 }] }); }}><Plus size={17} /> Associa tag</button></div>
            {!model.variables.length && <p className="connection-note">Prima importa o crea i tag in <b>Pannello → Variabili PLC e simulazione</b> e salva il catalogo. Il mapping non crea indirizzi PLC inventati.</p>}
            {current.bindings.length > pageSize && <div className="connection-grid">{field("Cerca nei mapping", "mapping-search", mappingSearch, (value) => { setMappingSearch(value); setMappingPage(0); })}<div className="connection-pagination" role="group" aria-label="Pagine mapping"><button type="button" disabled={page === 0} onClick={() => setMappingPage(page - 1)}>Precedenti</button><span>Pagina {page + 1} di {Math.max(1, Math.ceil(mappingRows.length / pageSize))} · {mappingRows.length} mapping</span><button type="button" disabled={(page + 1) * pageSize >= mappingRows.length} onClick={() => setMappingPage(page + 1)}>Successivi</button></div></div>}
            {model.variables.length > 100 && field("Cerca un tag nel catalogo", "tag-search", tagSearch, setTagSearch, { hint: "Le scelte mostrano fino a 100 risultati e il tag già associato. Cerca il nome per trovare gli altri." })}
            {mappingRows.slice(page * pageSize, (page + 1) * pageSize).map(({ value: b, index }) => {
              const path = prefix + "bindings." + index + "."; const variable = model.variables.find((v) => v.name === b.tag);
              return <article className="connection-binding" key={index}><div className="connection-grid">
                {field("Tag PLC " + (index + 1), path + "tag", b.tag, (tag) => binding(index, { tag }), { choices: [{ value: "", label: "Scegli un tag" }, ...[...availableTags, ...model.variables.filter((v) => v.name === b.tag && !availableTags.some((a) => a.name === v.name))].map((v) => ({ value: v.name, label: v.name + " · " + v.dataType + " · " + v.access, disabled: !supportedType(v.dataType) || current.bindings.some((other, i) => i !== index && other.tag === v.name) }))], hint: "Tipo e permessi vengono dal catalogo; UDT e array non sono supportati da questo driver scalare." })}
                {field("Topic di lettura " + (index + 1), path + "topic", b.topic, (value) => binding(index, { topic: value || undefined }), { disabled: variable?.access === "write", placeholder: "impianto/stazione/stato", hint: "Topic concreto, senza + o #. Nessuna sottoscrizione generica." })}
                {field("Formato payload " + (index + 1), path + "encoding", b.encoding ?? "json", (value) => binding(index, { encoding: value as "json" | "text" }), { choices: encodings })}
                {field("Valore nel JSON " + (index + 1), path + "valuePath", b.valuePath, (value) => binding(index, { valuePath: value || undefined }), { disabled: b.encoding === "text", placeholder: "/value", hint: "JSON Pointer. Vuoto: l’intero payload è un valore scalare." })}
              </div><details><summary>Qualità, timestamp e topic comando del tag {index + 1}</summary><div className="connection-grid">
                {field("Qualità nel JSON " + (index + 1), path + "qualityPath", b.qualityPath, (value) => binding(index, { qualityPath: value || undefined }), { disabled: b.encoding === "text", placeholder: "/qualityCode" })}
                {field("Timestamp nel JSON " + (index + 1), path + "timestampPath", b.timestampPath, (value) => binding(index, { timestampPath: value || undefined }), { disabled: b.encoding === "text", placeholder: "/timestamp" })}
                {field("Unità timestamp " + (index + 1), path + "timestampUnit", b.timestampUnit ?? "ms", (value) => binding(index, { timestampUnit: value as "ms" | "s" }), { choices: [{ value: "ms", label: "Millisecondi Unix" }, { value: "s", label: "Secondi Unix" }] })}
                {field("Scadenza campione (ms) " + (index + 1), path + "staleAfterMs", b.staleAfterMs, (value) => binding(index, { staleAfterMs: optionalNumber(value) }), { numeric: true, min: 250, hint: "Un valore vecchio non viene presentato come Good." })}
                {field("QoS lettura " + (index + 1), path + "qos", b.qos ?? 0, (value) => binding(index, { qos: Number(value) as 0 | 1 | 2 }), { choices: qosChoices })}
                {field("Topic comando " + (index + 1), path + "writeTopic", b.writeTopic, (value) => binding(index, { writeTopic: value || undefined }), { disabled: variable?.access === "read", placeholder: "impianto/stazione/comando", hint: "Vuoto: nessuna scrittura di questo tag. Comandi sempre non-retained." })}
                {field("Formato comando " + (index + 1), path + "writeEncoding", b.writeEncoding ?? "json", (value) => binding(index, { writeEncoding: value as "json" | "text" }), { choices: encodings, disabled: variable?.access === "read" })}
                {field("QoS comando " + (index + 1), path + "writeQos", b.writeQos ?? 1, (value) => binding(index, { writeQos: Number(value) as 0 | 1 | 2 }), { choices: qosChoices, disabled: variable?.access === "read" })}
              </div></details><button type="button" className="connection-remove" onClick={() => connection({ bindings: current.bindings.filter((_, i) => i !== index) })} aria-label={"Rimuovi mapping " + (index + 1)}><Trash2 size={16} /> Rimuovi mapping</button></article>;
            })}
            <button type="button" className="connection-remove" onClick={() => { update((m) => ({ ...m, catalog: { ...m.catalog, connections: m.catalog.connections.filter((_, i) => i !== selected) } })); setSelected(Math.max(0, selected - 1)); }}><Trash2 size={16} /> Rimuovi connessione</button></>}
          </section>
          {!!issues.length && <div className="connection-error-banner" role="alert"><strong>Correggi la configurazione prima di salvare</strong>{issues.slice(0, 6).map((issue) => <button type="button" key={issue.path + issue.message} onClick={() => { const match = /^connections\.(\d+)\./.exec(issue.path); if (match) setSelected(Number(match[1])); const mapping = /\.bindings\.(\d+)\./.exec(issue.path); setMappingSearch(""); if (mapping) setMappingPage(Math.floor(Number(mapping[1]) / pageSize)); setFocusPath(issue.path); }}>{issue.message}</button>)}</div>}
        </fieldset>}
        {confirm && <section className="connection-discard" role="alertdialog" aria-modal="true" aria-label="Modifiche alla connessione non salvate"><p>Ci sono modifiche alla configurazione non salvate. Vuoi scartarle{confirm === "reload" ? " e ricaricare i cataloghi" : " e chiudere"}?</p><button type="button" autoFocus onClick={() => setConfirm(undefined)}>Continua a modificare</button><button type="button" onClick={() => { const action = confirm; setConfirm(undefined); if (action === "reload") void load(); else onCloseRef.current(); }}>Scarta modifiche</button></section>}
      </div>
      <footer><span>{phase === "saving" ? "Salvataggio dei cataloghi…" : dirty ? "Modifiche non salvate" : "Nessuna modifica da salvare"} · credenziali solo nel servizio</span><div><button type="button" disabled={phase === "saving" || phase === "loading" || !!confirm} onClick={requestReload}><RefreshCw size={16} /> Ricarica</button><button type="button" disabled={phase === "saving" || !!confirm} onClick={requestClose}>Chiudi</button><button type="button" className="connection-save" disabled={phase !== "ready" || !dirty || !!issues.length || !!confirm} onClick={() => void save()}><Save size={16} /> Salva configurazione</button></div></footer>
    </section>
  </div>, document.body);
}
