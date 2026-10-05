import {
  ConnectionConfigurationError, validateConnectionCatalog, validateGatewayConfiguration, validateMqttConnection,
  type ConnectionCatalog, type PlcConnectionConfig,
} from "../../runtime/connection-config.mjs";
import type { PlcVariableDefinition } from "./plcVariables";

export interface ConnectionConfigurationSnapshot {
  generation: number;
  files: { connections: string | null; runtime: string | null; plc: string | null };
}
export interface RuntimeConnectionConfiguration {
  version: 1;
  gateway: { enabled: boolean; path: string; pollMs: number; timeoutMs?: number };
}
export interface ConnectionEditorModel { catalog: ConnectionCatalog; runtime: RuntimeConnectionConfiguration; variables: PlcVariableDefinition[] }
export interface ConnectionIssue { path: string; message: string }

export function defaultConnectionCatalog(): ConnectionCatalog {
  return { version: 1, gateway: { enabled: false, host: "127.0.0.1", port: 4877, tokenEnv: "FRAMECRAFT_GATEWAY_TOKEN", allowedOrigins: [], allowWrites: false }, connections: [] };
}
export function newMqttConnection(existing: readonly PlcConnectionConfig[]): PlcConnectionConfig {
  let index = 1; while (existing.some((c) => c.id === "mqtt-" + index)) index++;
  return { id: "mqtt-" + index, protocol: "mqtt", enabled: false, url: "", allowInsecure: false, allowWrites: false, bindings: [] };
}

function parseObject(source: string, file: string): Record<string, unknown> {
  if (new TextEncoder().encode(source).length > 4 * 1024 * 1024) throw new Error(file + ": catalogo troppo grande.");
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error(file + ": JSON non valido. Correggi il file prima di aprire la configurazione."); }
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as { version?: unknown }).version !== 1) throw new Error(file + ": versione o struttura non supportata.");
  return value as Record<string, unknown>;
}
function rejectInlineSecrets(value: unknown, depth = 0): void {
  if (depth > 30) throw new Error("Catalogo connessioni troppo annidato.");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(password|username|token|secret|clientSecret|accessToken|credentials|privateKey|certificate)$/i.test(key)) throw new Error("Credenziali inline nel catalogo: spostale nell’ambiente del servizio. Nessun valore segreto viene mostrato o copiato nel draft.");
    if (key === "url" && typeof child === "string") {
      try { const url = new URL(child); if (url.username || url.password || url.search || url.hash) throw new Error("inline"); } catch (error) {
        if (error instanceof Error && error.message === "inline") throw new Error("URL con credenziali inline: usa riferimenti ambiente del servizio.");
      }
    }
    if (/^(caFile|certificateFile|privateKeyFile)$/.test(key) && typeof child === "string" && child.includes("-----BEGIN")) throw new Error("Il catalogo contiene certificati o chiavi inline: lascia solo i percorsi dei file sul servizio.");
    rejectInlineSecrets(child, depth + 1);
  }
}

export function parseConnectionConfiguration(snapshot: ConnectionConfigurationSnapshot): ConnectionEditorModel {
  const raw = snapshot.files.connections === null ? defaultConnectionCatalog() : parseObject(snapshot.files.connections, "framecraft.connections.json");
  rejectInlineSecrets(raw);
  const catalog = { ...raw, gateway: raw.gateway ?? defaultConnectionCatalog().gateway } as ConnectionCatalog;
  if (!Array.isArray(catalog.connections) || catalog.connections.length > 1000) throw new Error("Il catalogo deve contenere fino a 1000 connessioni MQTT.");
  for (const c of catalog.connections) {
    if (!c || c.protocol !== "mqtt") throw new Error("Questo editor gestisce solo MQTT. Un profilo OPC UA o sconosciuto non viene alterato: il driver OPC UA è ancora da implementare.");
    if (typeof c.id !== "string" || typeof c.url !== "string" || !Array.isArray(c.bindings) || c.bindings.some((b) => !b || typeof b !== "object" || Array.isArray(b))) throw new Error("Struttura della connessione MQTT non valida.");
    const shape = (value: object, fields: string[], type: string) => fields.every((key) => (value as Record<string, unknown>)[key] === undefined || typeof (value as Record<string, unknown>)[key] === type);
    if (!shape(c, ["clientId", "usernameEnv", "passwordEnv"], "string") || !shape(c, ["enabled", "allowWrites", "allowInsecure"], "boolean") || !shape(c, ["reconnectMs", "timeoutMs", "maxPayloadBytes", "protocolVersion"], "number") || c.tls !== undefined && (!c.tls || typeof c.tls !== "object" || Array.isArray(c.tls) || !shape(c.tls, ["caFile", "certificateFile", "privateKeyFile"], "string")) || c.bindings.some((b) => !shape(b, ["tag", "topic", "writeTopic", "valuePath", "qualityPath", "timestampPath", "timestampUnit", "encoding", "writeEncoding"], "string") || !shape(b, ["qos", "writeQos", "staleAfterMs"], "number"))) throw new Error("Tipi dei campi MQTT non validi; il catalogo non è stato alterato.");
  }
  if (!catalog.gateway || typeof catalog.gateway !== "object" || Array.isArray(catalog.gateway) || !Array.isArray(catalog.gateway.allowedOrigins) || catalog.gateway.allowedOrigins.some((origin) => typeof origin !== "string") || typeof catalog.gateway.port !== "number" || typeof catalog.gateway.tokenEnv !== "string" || typeof catalog.gateway.enabled !== "boolean") throw new Error("Struttura del gateway non valida.");
  const runtime = (snapshot.files.runtime === null ? { version: 1, gateway: { enabled: false, path: "/_framecraft/plc/v1", pollMs: 250 } } : parseObject(snapshot.files.runtime, "framecraft.runtime.json")) as unknown as RuntimeConnectionConfiguration;
  rejectInlineSecrets(runtime);
  if (!runtime.gateway || typeof runtime.gateway !== "object" || Array.isArray(runtime.gateway) || typeof runtime.gateway.enabled !== "boolean" || typeof runtime.gateway.path !== "string" || typeof runtime.gateway.pollMs !== "number") throw new Error("Configurazione client gateway non valida.");
  const plc = snapshot.files.plc === null ? { variables: [] } : parseObject(snapshot.files.plc, "framecraft.plc.json");
  if (!Array.isArray(plc.variables) || plc.variables.some((v: unknown) => !v || typeof v !== "object" || typeof (v as PlcVariableDefinition).name !== "string" || typeof (v as PlcVariableDefinition).dataType !== "string" || !["read", "write", "read-write"].includes((v as PlcVariableDefinition).access))) throw new Error("Catalogo tag PLC non valido. Usa Variabili PLC e salva il catalogo prima di configurare il mapping.");
  const variables = plc.variables as PlcVariableDefinition[];
  if (new Set(variables.map((v) => v.name)).size !== variables.length || variables.some((v) => !v.name.trim())) throw new Error("Il catalogo PLC contiene nomi vuoti o duplicati.");
  return { catalog, runtime, variables };
}

function normalizedCatalog(model: ConnectionEditorModel): ConnectionCatalog {
  return { ...model.catalog, gateway: { ...model.catalog.gateway, allowedOrigins: model.catalog.gateway.allowedOrigins.map((origin) => origin.trim()).filter(Boolean) } };
}
export function connectionConfigurationIssues(model: ConnectionEditorModel): ConnectionIssue[] {
  const issues: ConnectionIssue[] = [];
  const check = (action: () => void, fallback: string) => {
    try { action(); } catch (error) {
      const issue = { path: error instanceof ConnectionConfigurationError ? error.path : fallback, message: error instanceof Error ? error.message : "Configurazione non valida." };
      if (!issues.some((i) => i.path === issue.path && i.message === issue.message)) issues.push(issue);
    }
  };
  const catalog = normalizedCatalog(model);
  check(() => validateGatewayConfiguration(catalog.gateway), "gateway");
  catalog.connections.forEach((c, index) => check(() => validateMqttConnection(c, model.variables, "connections." + index + "."), "connections." + index));
  check(() => validateConnectionCatalog(catalog, model.variables, { includeDisabled: true }), "connections");
  const client = model.runtime.gateway;
  if (typeof client.enabled !== "boolean") issues.push({ path: "runtime.gateway.enabled", message: "Abilitazione client non valida." });
  if (client.path !== "/_framecraft/plc/v1") issues.push({ path: "runtime.gateway.path", message: "Usa il percorso same-origin /_framecraft/plc/v1 del gateway attuale." });
  if (!Number.isFinite(client.pollMs) || client.pollMs < 100 || client.pollMs > 60_000) issues.push({ path: "runtime.gateway.pollMs", message: "Lettura client: da 100 a 60000 ms." });
  if (client.timeoutMs !== undefined && (!Number.isFinite(client.timeoutMs) || client.timeoutMs < 250 || client.timeoutMs > 70_000)) issues.push({ path: "runtime.gateway.timeoutMs", message: "Timeout client: da 250 a 70000 ms." });
  if (client.enabled && (!catalog.gateway.enabled || !catalog.connections.some((c) => c.enabled && c.bindings.length))) issues.push({ path: "runtime.gateway.enabled", message: "Il client richiede il servizio abilitato e almeno una connessione attiva con tag associati." });
  return issues;
}
export function serializeConnectionConfiguration(model: ConnectionEditorModel): { connections: string; runtime: string } {
  const issues = connectionConfigurationIssues(model); if (issues.length) throw new Error(issues[0].message);
  return { connections: JSON.stringify(normalizedCatalog(model), null, 2) + "\n", runtime: JSON.stringify(model.runtime, null, 2) + "\n" };
}
