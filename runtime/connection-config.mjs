// Shared by the offline editor and the Node service. No sockets, environment or file access.
export class ConnectionConfigurationError extends Error {
  constructor(message, path) { super(message); this.name = "ConnectionConfigurationError"; this.path = path; }
}
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (message, path) => { throw new ConnectionConfigurationError(message, path); };
const envName = (value) => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) && !value.startsWith("VITE_");
const topic = (value) => typeof value === "string" && value.length > 0 && new TextEncoder().encode(value).length <= 65_535 && !/[\0+#]/.test(value);

export function normalizeMqttTagValue(value, dataType) {
  const type = dataType.toLowerCase();
  if (type === "bool" || type === "boolean") {
    if (value === true || value === "true" || value === 1 || value === "1") return true;
    if (value === false || value === "false" || value === 0 || value === "0") return false;
    throw new Error("Valore Bool non valido.");
  }
  const limits = { sint: [-128, 127], usint: [0, 255], byte: [0, 255], int: [-32768, 32767], uint: [0, 65535], word: [0, 65535], dint: [-2147483648, 2147483647], udint: [0, 4294967295], dword: [0, 4294967295] };
  if (Object.hasOwn(limits, type) || ["real", "lreal", "float", "double"].includes(type)) {
    if (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && !value.trim()) throw new Error("Valore numerico non valido.");
    const numeric = Number(value); const range = limits[type];
    if (!Number.isFinite(numeric) || range && (!Number.isInteger(numeric) || numeric < range[0] || numeric > range[1])) throw new Error("Valore fuori dal tipo PLC dichiarato.");
    return numeric;
  }
  if (["string", "wstring"].includes(type)) { if (typeof value !== "string") throw new Error("Valore stringa non valido."); return value; }
  throw new Error("Tipo PLC non supportato dal driver MQTT: " + dataType);
}

export function validateMqttConnection(config, variables, prefix = "") {
  const reject = (message, key) => fail(message, prefix + key);
  if (!object(config) || typeof config.id !== "string" || !config.id.trim()) reject("La connessione MQTT richiede un id.", "id");
  if (Object.hasOwn(config, "password") || Object.hasOwn(config, "username")) reject("Usa usernameEnv/passwordEnv, non credenziali nel JSON.", "passwordEnv");
  let url;
  try { url = new URL(config.url); } catch { reject("URL MQTT non valido; le credenziali devono restare nell'ambiente del servizio.", "url"); }
  if (!["mqtt:", "mqtts:", "ws:", "wss:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) reject("URL MQTT non valido; niente credenziali, query o frammenti nell’indirizzo del broker.", "url");
  if (["mqtt:", "ws:"].includes(url.protocol) && config.allowInsecure !== true) reject("MQTT senza TLS richiede allowInsecure esplicito.", "allowInsecure");
  for (const key of ["allowInsecure", "allowWrites"]) if (config[key] !== undefined && typeof config[key] !== "boolean") reject("Il consenso deve essere booleano.", key);
  if (config.clientId !== undefined && (typeof config.clientId !== "string" || !config.clientId.trim() || /\0/.test(config.clientId))) reject("Client ID MQTT non valido.", "clientId");
  if (!Array.isArray(config.bindings) || config.bindings.length > 5_000) reject("Mapping MQTT non valido.", "bindings");
  if (!Array.isArray(variables) || variables.some((v) => !object(v) || typeof v.name !== "string" || !v.name.trim() || typeof v.dataType !== "string") || new Set(variables.map((v) => v.name)).size !== variables.length) reject("Catalogo PLC non valido o duplicato.", "bindings");
  const tags = new Map(variables.map((v) => [v.name, { ...v }])); const seen = new Set();
  for (const [index, binding] of config.bindings.entries()) {
    const error = (message, key) => reject(message, "bindings." + index + "." + key);
    if (!object(binding) || !tags.has(binding.tag) || seen.has(binding.tag)) error("Mapping MQTT duplicato o tag non dichiarato.", "tag");
    seen.add(binding.tag); const variable = tags.get(binding.tag);
    if (!["read", "write", "read-write"].includes(variable.access)) error("Accesso PLC non valido.", "tag");
    try { normalizeMqttTagValue(["bool", "boolean"].includes(variable.dataType.toLowerCase()) ? false : ["string", "wstring"].includes(variable.dataType.toLowerCase()) ? "" : 0, variable.dataType); } catch (e) { error(e.message, "tag"); }
    if (variable.access !== "write" && !topic(binding.topic) || binding.topic !== undefined && !topic(binding.topic)) error("Il driver richiede topic MQTT concreti, senza wildcard.", "topic");
    if (binding.writeTopic !== undefined && !topic(binding.writeTopic)) error("Il driver richiede topic MQTT concreti, senza wildcard.", "writeTopic");
    for (const key of ["qos", "writeQos"]) if (binding[key] !== undefined && ![0, 1, 2].includes(binding[key])) error("QoS MQTT non valido.", key);
    for (const key of ["encoding", "writeEncoding"]) if (!["json", "text"].includes(binding[key] ?? "json")) error("Formato MQTT non valido.", key);
    for (const key of ["valuePath", "qualityPath", "timestampPath"]) if (binding[key] !== undefined && (typeof binding[key] !== "string" || binding[key] && (!binding[key].startsWith("/") || /~(?![01])/u.test(binding[key])))) error("Usa un JSON Pointer per " + key + ".", key);
    if (binding.staleAfterMs !== undefined && (!Number.isFinite(binding.staleAfterMs) || binding.staleAfterMs < 250)) error("staleAfterMs deve essere almeno 250 ms.", "staleAfterMs");
    if (binding.timestampUnit !== undefined && !["ms", "s"].includes(binding.timestampUnit)) error("Unità timestamp non valida.", "timestampUnit");
    if (binding.writeRetain !== undefined && binding.writeRetain !== false) error("I comandi PLC non possono essere retained.", "writeRetain");
  }
  for (const key of ["usernameEnv", "passwordEnv"]) if (config[key] !== undefined && !envName(config[key])) reject("Le credenziali richiedono variabili ambiente del servizio, mai VITE_* pubbliche.", key);
  if (config.tls !== undefined && !object(config.tls)) reject("Percorsi TLS non validi.", "tls.caFile");
  for (const key of ["caFile", "certificateFile", "privateKeyFile"]) if (config.tls?.[key] !== undefined && (typeof config.tls[key] !== "string" || !config.tls[key].trim() || /\0|-----BEGIN/.test(config.tls[key]))) reject("Inserisci il percorso del certificato sul servizio, non il suo contenuto.", "tls." + key);
  if (Boolean(config.tls?.certificateFile) !== Boolean(config.tls?.privateKeyFile)) reject("Certificato client e chiave privata devono essere configurati insieme.", "tls.privateKeyFile");
  if (config.protocolVersion !== undefined && ![4, 5].includes(config.protocolVersion)) reject("Versione MQTT non valida.", "protocolVersion");
  for (const key of ["reconnectMs", "timeoutMs"]) if (config[key] !== undefined && (!Number.isFinite(config[key]) || config[key] < 250 || config[key] > 60_000)) reject("Intervallo MQTT non valido: " + key + ".", key);
  if (config.maxPayloadBytes !== undefined && (!Number.isInteger(config.maxPayloadBytes) || config.maxPayloadBytes < 1 || config.maxPayloadBytes > 1_048_576)) reject("Limite payload MQTT non valido.", "maxPayloadBytes");
  return tags;
}

export function validateGatewayConfiguration(config, allowEphemeralPort = false) {
  if (!object(config) || typeof config.enabled !== "boolean") fail("Gateway non abilitato o catalogo non valido.", "gateway.enabled");
  if (!Number.isInteger(config.port) || config.port < (allowEphemeralPort ? 0 : 1) || config.port > 65_535) fail("Porta gateway non valida.", "gateway.port");
  if (config.host !== undefined && config.host !== "127.0.0.1") fail("Il gateway HTTP deve restare sul loopback; usa un reverse proxy per l'accesso remoto.", "gateway.host");
  if (!envName(config.tokenEnv) || Object.hasOwn(config, "token")) fail("Il token del gateway deve essere un riferimento ambiente del servizio, mai VITE_* pubblico.", "gateway.tokenEnv");
  if (config.allowWrites !== undefined && typeof config.allowWrites !== "boolean") fail("Il consenso deve essere booleano.", "gateway.allowWrites");
  if (!Array.isArray(config.allowedOrigins) || config.allowedOrigins.some((origin) => {
    try { const url = new URL(origin); return !["http:", "https:"].includes(url.protocol) || url.origin !== origin || url.username || url.password; } catch { return true; }
  })) fail("allowedOrigins deve contenere origini HTTP/HTTPS esatte.", "gateway.allowedOrigins");
}

export function validateConnectionCatalog(catalog, variables, options = {}) {
  if (!object(catalog) || catalog.version !== 1 || !Array.isArray(catalog.connections)) fail("Catalogo connessioni non valido: versione 1 e array connections richiesti.", "connections");
  validateGatewayConfiguration(catalog.gateway, options.allowEphemeralPort === true);
  const selected = catalog.connections.map((connection, index) => ({ connection, index })).filter(({ connection }) => options.includeDisabled || connection?.enabled === true);
  if (selected.length > 1_000 || selected.reduce((n, { connection }) => n + (Array.isArray(connection?.bindings) ? connection.bindings.length : 0), 0) > 5_000) fail("Catalogo gateway troppo grande: massimo 1000 connessioni e 5000 tag.", "connections");
  const ids = new Set(), owners = new Set();
  for (const { connection, index } of selected) {
    const prefix = "connections." + index + ".";
    if (!object(connection) || connection.protocol !== "mqtt") fail("Il driver OPC UA non è ancora disponibile; questo editor gestisce solo MQTT.", prefix + "protocol");
    if (typeof connection.enabled !== "boolean") fail("Abilitazione connessione non valida.", prefix + "enabled");
    validateMqttConnection(connection, variables, prefix);
    if (ids.has(connection.id)) fail("Id di connessione duplicati.", prefix + "id"); ids.add(connection.id);
    if (connection.enabled) for (const binding of connection.bindings) {
      if (owners.has(binding.tag)) fail("Un tag non può avere due sorgenti MQTT attive.", prefix + "bindings." + connection.bindings.indexOf(binding) + ".tag"); owners.add(binding.tag);
    }
  }
}
