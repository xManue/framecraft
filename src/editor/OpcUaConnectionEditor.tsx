import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PlcConnectionConfig } from "../../runtime/connection-config.mjs";
import type { OpcUaBinding } from "../../runtime/opcua-driver.mjs";
import type { PlcVariableDefinition } from "../core/plcVariables";
import type { FieldProps } from "./PlcConnectionsDialog";

type Profile = Extract<PlcConnectionConfig, { protocol: "opcua" }>;
interface Props {
  config: Profile; prefix: string; variables: PlcVariableDefinition[]; mappingLimit: boolean; focusPath?: string; onFocusHandled(): void;
  onChange(config: Profile): void; onRemove(): void; supportedType(type: string): boolean;
  field(label: string, path: string, value: string | number | undefined, change: (value: string) => void, extra?: Partial<FieldProps>): ReactNode;
  toggle(label: string, path: string, checked: boolean | undefined, change: (value: boolean) => void, hint?: string): ReactNode;
}
const number = (value: string) => value === "" ? undefined : Number(value);
export function OpcUaConnectionEditor({ config, prefix, variables, mappingLimit, focusPath, onFocusHandled, onChange, onRemove, supportedType, field, toggle }: Props) {
  const [page, setPage] = useState(0), [search, setSearch] = useState(""), [tagSearch, setTagSearch] = useState("");
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusPath?.startsWith(prefix)) return;
    const match = focusPath.slice(prefix.length).match(/^bindings\.(\d+)\./);
    if (match) { setSearch(""); setPage(Math.floor(Number(match[1]) / 10)); }
  }, [focusPath, prefix]);
  useEffect(() => {
    if (!focusPath) return;
    const target = [...(container.current?.querySelectorAll<HTMLElement>("[data-field]") ?? [])].find((e) => e.dataset.field === focusPath);
    if (target) { const details = target.closest("details"); if (details) details.open = true; target.focus(); target.scrollIntoView?.({ block: "nearest" }); onFocusHandled(); }
  }, [focusPath, page, search, onFocusHandled]);
  const patch = (value: Partial<Profile>) => onChange({ ...config, ...value, protocol: "opcua" });
  const binding = (index: number, value: Partial<OpcUaBinding>) => patch({ bindings: config.bindings.map((b, i) => i === index ? { ...b, ...value } : b) });
  const rows = config.bindings.map((value, index) => ({ value, index })).filter(({ value }) => value.tag.toLowerCase().includes(search.toLowerCase()));
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(rows.length / 10) - 1));
  const nextTag = variables.find((v) => supportedType(v.dataType) && !config.bindings.some((b) => b.tag === v.name));
  return <div ref={container}>
    <div className="connection-grid">
      {field("Nome connessione", prefix + "id", config.id, (id) => patch({ id }))}
      {field("Endpoint OPC UA", prefix + "url", config.url, (url) => patch({ url }), { placeholder: "opc.tcp://plc.azienda.local:4840/percorso", hint: "Indirizzo reale del server e porta esplicita. Nessuna connessione avviata dal dialogo." })}
      {toggle("Abilita questa connessione", prefix + "enabled", config.enabled, (enabled) => patch({ enabled }))}
      {field("Modalità di sicurezza OPC UA", prefix + "securityMode", config.securityMode, (value) => patch({ securityMode: value as Profile["securityMode"], securityPolicy: value === "None" ? "None" : config.securityPolicy === "None" ? "Basic256Sha256" : config.securityPolicy }), { choices: [{ value: "SignAndEncrypt", label: "Firma e cifra (consigliato)" }, { value: "Sign", label: "Firma, senza cifrare i dati" }, { value: "None", label: "Nessuna sicurezza (solo test)" }], hint: "Il servizio richiede questa modalità: non ripiega automaticamente su una meno sicura." })}
      {field("Policy OPC UA", prefix + "securityPolicy", config.securityPolicy, (value) => patch({ securityPolicy: value as Profile["securityPolicy"] }), { choices: config.securityMode === "None" ? [{ value: "None", label: "None" }] : ["Basic256Sha256", "Aes128_Sha256_RsaOaep", "Aes256_Sha256_RsaPss"].map((value) => ({ value, label: value })) })}
      {config.securityMode === "None" && toggle("Accetto OPC UA senza sicurezza (solo rete di test)", prefix + "allowInsecure", config.allowInsecure, (allowInsecure) => patch({ allowInsecure }), "Solo accesso anonimo. Per produzione configura Firma e cifra e certificati verificati.")}
      {field("Application URI del client", prefix + "applicationUri", config.applicationUri, (value) => patch({ applicationUri: value || undefined }), { placeholder: "urn:servizio:framecraft", hint: "Deve coincidere con l'URI nel certificato client; non è l'endpoint del PLC." })}
      {field("Directory PKI sul servizio", prefix + "pkiDirectory", config.pkiDirectory, (value) => patch({ pkiDirectory: value || undefined }), { hint: "Trust store del servizio: certificati trusted, issuers e CRL preparati dal responsabile. Nessuna accettazione automatica dei certificati sconosciuti." })}
      {field("Percorso certificato client OPC UA", prefix + "certificateFile", config.certificateFile, (value) => patch({ certificateFile: value || undefined }), { hint: "Percorso sul servizio Node, non contenuto PEM/DER. Necessario per la connessione sicura." })}
      {field("Percorso chiave privata OPC UA", prefix + "privateKeyFile", config.privateKeyFile, (value) => patch({ privateKeyFile: value || undefined }), { hint: "La chiave resta sul servizio, mai nel progetto React o nel browser." })}
    </div>
    <details><summary>Accesso al server, acquisizione e scritture OPC UA</summary><div className="connection-grid">
      {field("Variabile ambiente utente OPC UA", prefix + "usernameEnv", config.usernameEnv, (value) => patch({ usernameEnv: value || undefined }), { hint: "Vuoto insieme alla password: accesso anonimo. Il server decide se autorizzarlo." })}
      {field("Variabile ambiente password OPC UA", prefix + "passwordEnv", config.passwordEnv, (value) => patch({ passwordEnv: value || undefined }), { hint: "Solo il nome di una variabile privata del servizio, mai VITE_*." })}
      {field("Timeout OPC UA (ms)", prefix + "timeoutMs", config.timeoutMs, (value) => patch({ timeoutMs: number(value) }), { numeric: true, min: 250, max: 60000, hint: "Default 10000 ms per operazione. Nessun replay dei comandi scaduti." })}
      {field("Riconnessione OPC UA (ms)", prefix + "reconnectMs", config.reconnectMs, (value) => patch({ reconnectMs: number(value) }), { numeric: true, min: 250, max: 60000, hint: "Default 1000 ms per guasti rete. Errori trust, accesso o mapping richiedono correzione e riavvio manuale." })}
      {field("Acquisizione OPC UA (ms)", prefix + "readIntervalMs", config.readIntervalMs, (value) => patch({ readIntervalMs: number(value) }), { numeric: true, min: 250, max: 60000, hint: "Default 1000 ms: lettura periodica anche se il valore non cambia. Non confonde un keepalive con un campione fresco." })}
      {field("Campionamento sottoscrizioni (ms)", prefix + "samplingIntervalMs", config.samplingIntervalMs, (value) => patch({ samplingIntervalMs: number(value) }), { numeric: true, min: 250, max: 60000, hint: "Default 250 ms. Il server può rivedere gli intervalli richiesti." })}
      {toggle("Consenti comandi su questa connessione", prefix + "allowWrites", config.allowWrites, (allowWrites) => patch({ allowWrites }), "Servono anche consenso del gateway, tag scrivibile, consenso del nodo e autorizzazione OPC UA del server. Uno StatusCode Good non conferma l'esecuzione della macchina.")}
    </div></details>
    <div className="connection-section-heading"><h4>Mapping dei nodi · {config.bindings.length}</h4><button type="button" disabled={mappingLimit || !nextTag} onClick={() => { if (nextTag) patch({ bindings: [...config.bindings, { tag: nextTag.name, namespaceUri: "", nodeId: "", writeEnabled: false, staleAfterMs: 5000 }] }); }}><Plus size={17} /> Associa tag</button></div>
    <p className="connection-note">Copia Namespace URI e identificatore dal server reale. Non usare un indice ns= di un'altra sessione. Array e UDT non sono ancora supportati dal driver scalare.</p>
    {field("Cerca tag o mapping OPC UA", "opcua-tag-search", search, (value) => { setSearch(value); setPage(0); })}
    {variables.length > 100 && field("Cerca tag nel catalogo OPC UA", "opcua-catalog-search", tagSearch, setTagSearch, { hint: "Limita le opzioni dei menu Tag PLC, senza nascondere i mapping già presenti." })}
    {rows.length > 10 && <div className="connection-pagination" role="group" aria-label="Pagine mapping OPC UA"><button type="button" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>Precedenti</button><span>Pagina {visiblePage + 1} di {Math.ceil(rows.length / 10)}</span><button type="button" disabled={(visiblePage + 1) * 10 >= rows.length} onClick={() => setPage(visiblePage + 1)}>Successivi</button></div>}
    {rows.slice(visiblePage * 10, (visiblePage + 1) * 10).map(({ value: b, index }) => {
      const path = prefix + "bindings." + index + ".", variable = variables.find((v) => v.name === b.tag);
      const choices = variables.filter((v) => v.name === b.tag || v.name.toLowerCase().includes(tagSearch.toLowerCase())).slice(0, 100);
      if (variable && !choices.includes(variable)) choices.push(variable);
      return <article className="connection-binding" key={index}><div className="connection-grid">
        {field("Tag PLC " + (index + 1), path + "tag", b.tag, (tag) => binding(index, { tag, writeEnabled: false }), { choices: choices.map((v) => ({ value: v.name, label: v.name + " · " + v.dataType + " · " + v.access, disabled: !supportedType(v.dataType) || config.bindings.some((other, i) => i !== index && other.tag === v.name) })) })}
        {field("Namespace URI " + (index + 1), path + "namespaceUri", b.namespaceUri, (namespaceUri) => binding(index, { namespaceUri }), { placeholder: "urn:server:namespace", hint: "URI del namespace reale. L'indice viene risolto nuovamente a ogni sessione." })}
        {field("Identificatore nodo " + (index + 1), path + "nodeId", b.nodeId, (nodeId) => binding(index, { nodeId }), { placeholder: "s=NomeRealeDelNodo", hint: "i=numero, s=testo, g=GUID o b=base64, senza prefisso ns=. Tipo e permessi vengono verificati sul server." })}
        {field("Scadenza campione (ms) " + (index + 1), path + "staleAfterMs", b.staleAfterMs, (value) => binding(index, { staleAfterMs: number(value) }), { numeric: true, min: 250, max: 3600000, hint: "Scegli un limite coerente con l'acquisizione; un campione vecchio non viene presentato come Good." })}
        {toggle("Abilita comandi per il nodo " + (index + 1), path + "writeEnabled", b.writeEnabled, (writeEnabled) => binding(index, { writeEnabled }), variable?.access === "read" ? "Il catalogo è di sola lettura: non abilitare questo consenso." : "Default disabilitato. Nessun aggiornamento ottimistico del valore mostrato.")}
      </div><button type="button" className="connection-remove" onClick={() => patch({ bindings: config.bindings.filter((_, i) => i !== index) })} aria-label={"Rimuovi mapping " + (index + 1)}><Trash2 size={16} /> Rimuovi mapping</button></article>;
    })}
    <button type="button" className="connection-remove" onClick={onRemove}><Trash2 size={16} /> Rimuovi connessione</button>
  </div>;
}
