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
    if (!Number.isFinite(numeric) || ["real", "float"].includes(type) && (Math.abs(numeric) > 3.4028234663852886e38 || numeric !== 0 && Math.fround(numeric) === 0) || range && (!Number.isInteger(numeric) || numeric < range[0] || numeric > range[1])) throw new Error("Valore fuori dal tipo PLC dichiarato.");
    return numeric;
  }
  if (["string", "wstring"].includes(type)) { if (typeof value !== "string") throw new Error("Valore stringa non valido."); return value; }
  throw new Error("Tipo PLC non supportato dal driver MQTT: " + dataType);
}

export function validateMqttConnection(config, variables, prefix = "") {
  const reject = (message, key) => fail(message, prefix + key);
  if (!object(config) || typeof config.id !== "string" || !config.id.trim() || config.id.length > 200 || /[\u0000-\u001f\u007f]/.test(config.id)) reject("La connessione MQTT richiede un id valido, fino a 200 caratteri e senza caratteri di controllo.", "id");
  if (Object.hasOwn(config, "password") || Object.hasOwn(config, "username")) reject("Usa usernameEnv/passwordEnv, non credenziali nel JSON.", "passwordEnv");
  let url;
  try { url = new URL(config.url); } catch { reject("URL MQTT non valido; le credenziali devono restare nell'ambiente del servizio.", "url"); }
  if (!["mqtt:", "mqtts:", "ws:", "wss:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) reject("URL MQTT non valido; niente credenziali, query o frammenti nell’indirizzo del broker.", "url");
  if (["mqtt:", "ws:"].includes(url.protocol) && config.allowInsecure !== true) reject("MQTT senza TLS richiede allowInsecure esplicito.", "allowInsecure");
  for (const key of ["allowInsecure", "allowWrites"]) if (config[key] !== undefined && typeof config[key] !== "boolean") reject("Il consenso deve essere booleano.", key);
  if (config.clientId !== undefined && (typeof config.clientId !== "string" || !config.clientId.trim() || /\0/.test(config.clientId))) reject("Client ID MQTT non valido.", "clientId");
  if (!Array.isArray(config.bindings) || config.bindings.length > 5_000) reject("Mapping MQTT non valido.", "bindings");
  if (!Array.isArray(variables) || variables.some((v) => !object(v) || typeof v.name !== "string" || !v.name.trim() || v.name.length > 200 || /[\u0000-\u001f\u007f]/.test(v.name) || typeof v.dataType !== "string") || new Set(variables.map((v) => v.name)).size !== variables.length) reject("Catalogo PLC non valido o duplicato.", "bindings");
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
    for (const key of ["valuePath", "qualityPath", "timestampPath"]) if (binding.encoding === "text" && binding[key] !== undefined && (key !== "valuePath" || binding[key] !== "")) error("Il testo scalare non contiene campi JSON: rimuovi " + key + " o scegli JSON.", key);
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

export function validateOpcUaConnection(config, variables, prefix = "") {
  const reject = (message, key) => fail(message, prefix + key);
  if (!object(config) || typeof config.id !== "string" || !config.id.trim() || config.id.length > 200 || /[\u0000-\u001f\u007f]/.test(config.id)) reject("La connessione OPC UA richiede un nome valido, senza caratteri di controllo.", "id");
  let endpoint;
  try { endpoint = new URL(config.url); } catch { reject("Endpoint OPC UA non valido: usa opc.tcp://server:porta/percorso.", "url"); }
  if (endpoint.protocol !== "opc.tcp:" || !endpoint.hostname || !endpoint.port || Number(endpoint.port) < 1 || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) reject("Endpoint OPC UA non valido: porta esplicita valida, niente credenziali, query o frammenti.", "url");
  if (!["None", "Sign", "SignAndEncrypt"].includes(config.securityMode)) reject("Scegli la modalità di sicurezza OPC UA prevista dal server.", "securityMode");
  if (!["None", "Basic256Sha256", "Aes128_Sha256_RsaOaep", "Aes256_Sha256_RsaPss"].includes(config.securityPolicy)) reject("Policy OPC UA non supportata; le policy deprecate non sono abilitate.", "securityPolicy");
  if ((config.securityMode === "None") !== (config.securityPolicy === "None")) reject("None richiede sia modalità sia policy None; non viene applicato alcun downgrade automatico.", "securityPolicy");
  for (const key of ["allowInsecure", "allowWrites"]) if (config[key] !== undefined && typeof config[key] !== "boolean") reject("Il consenso deve essere booleano.", key);
  if (config.securityMode === "None" && config.allowInsecure !== true) reject("OPC UA senza sicurezza richiede consenso esplicito, solo per rete di test isolata.", "allowInsecure");
  if (Object.hasOwn(config, "username") || Object.hasOwn(config, "password")) reject("Credenziali soltanto nell'ambiente del servizio, non nel JSON.", "usernameEnv");
  for (const key of ["usernameEnv", "passwordEnv"]) if (config[key] !== undefined && !envName(config[key])) reject("Inserisci un nome di variabile ambiente privata del servizio, mai VITE_*.", key);
  if (Boolean(config.usernameEnv) !== Boolean(config.passwordEnv)) reject("Utente e password richiedono entrambi i riferimenti ambiente.", "passwordEnv");
  if (config.securityMode === "None" && config.usernameEnv) reject("L'accesso con utente/password richiede una connessione OPC UA sicura.", "securityMode");
  for (const key of ["certificateFile", "privateKeyFile", "pkiDirectory"]) {
    const value = config[key];
    if (value !== undefined && (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\u007f]|-----BEGIN/.test(value))) reject("Inserisci un percorso sul servizio, non un certificato o una chiave inline.", key);
    if (config.securityMode !== "None" && !value) reject("La connessione sicura richiede certificato client, chiave privata e directory PKI sul servizio.", key);
  }
  if (Boolean(config.certificateFile) !== Boolean(config.privateKeyFile)) reject("Certificato client e chiave privata vanno configurati insieme.", "privateKeyFile");
  if (config.applicationUri !== undefined && (typeof config.applicationUri !== "string" || !/^(urn:|https?:\/\/)/.test(config.applicationUri) || /[\u0000-\u0020\u007f]/.test(config.applicationUri))) reject("Application URI non valida: deve corrispondere all'URI nel certificato client.", "applicationUri");
  if (config.securityMode !== "None" && !config.applicationUri) reject("Specifica l'Application URI riportata nel certificato client.", "applicationUri");
  for (const key of ["timeoutMs", "reconnectMs", "readIntervalMs", "samplingIntervalMs"]) if (config[key] !== undefined && (!Number.isInteger(config[key]) || config[key] < 250 || config[key] > 60_000)) reject("Intervallo OPC UA non valido: da 250 a 60000 ms.", key);
  if (!Array.isArray(variables) || variables.some((v) => !object(v) || typeof v.name !== "string" || !v.name.trim() || v.name.length > 200 || /[\u0000-\u001f\u007f]/.test(v.name) || typeof v.dataType !== "string" || !["read", "write", "read-write"].includes(v.access)) || new Set(variables.map((v) => v.name)).size !== variables.length) reject("Catalogo PLC non valido o duplicato.", "bindings");
  if (!Array.isArray(config.bindings) || config.bindings.length > 5000) reject("Mapping OPC UA non valido: massimo 5000 tag.", "bindings");
  const tags = new Map(variables.map((v) => [v.name, { ...v }])), seen = new Set();
  for (const [index, binding] of config.bindings.entries()) {
    const error = (message, key) => reject(message, "bindings." + index + "." + key);
    if (!object(binding) || !tags.has(binding.tag) || seen.has(binding.tag)) error("Tag non dichiarato o mapping OPC UA duplicato.", "tag");
    seen.add(binding.tag); const variable = tags.get(binding.tag);
    try { normalizeMqttTagValue(["bool", "boolean"].includes(variable.dataType.toLowerCase()) ? false : ["string", "wstring"].includes(variable.dataType.toLowerCase()) ? "" : 0, variable.dataType); } catch { error("Tipo PLC non supportato dal driver OPC UA scalare; array e UDT richiedono un mapping dedicato.", "tag"); }
    if (typeof binding.namespaceUri !== "string" || !binding.namespaceUri.trim() || binding.namespaceUri.length > 2048 || /[\u0000-\u001f\u007f]/.test(binding.namespaceUri)) error("Usa il Namespace URI reale del server, non un indice ns= che può cambiare al riavvio.", "namespaceUri");
    const node = binding.nodeId;
    if (typeof node !== "string" || node.length > 4096 || /[\u0000-\u001f\u007f]/.test(node) || !(/^(i=(0|[1-9]\d*)|s=.+|g=[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}|b=(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.test(node)) || node === "b=" || node.startsWith("i=") && Number(node.slice(2)) > 4294967295) error("Identificatore nodo non valido: i=numero, s=testo, g=GUID o b=base64; namespace separato, senza ns=.", "nodeId");
    if (binding.writeEnabled !== undefined && typeof binding.writeEnabled !== "boolean") error("Abilitazione comando non valida.", "writeEnabled");
    if (variable.access === "read" && binding.writeEnabled === true) error("Un tag di sola lettura non può abilitare comandi.", "writeEnabled");
    if (binding.staleAfterMs !== undefined && (!Number.isInteger(binding.staleAfterMs) || binding.staleAfterMs < 250 || binding.staleAfterMs > 3_600_000)) error("Scadenza campione non valida: da 250 a 3600000 ms.", "staleAfterMs");
  }
  return tags;
}

export function validatePlcConnection(config, variables, prefix = "") {
  if (config?.protocol === "mqtt") return validateMqttConnection(config, variables, prefix);
  if (config?.protocol === "opcua") return validateOpcUaConnection(config, variables, prefix);
  fail("Protocollo PLC non supportato: scegli MQTT oppure OPC UA.", prefix + "protocol");
}

export function validateConnectionCatalog(catalog, variables, options = {}) {
  if (!object(catalog) || catalog.version !== 1 || !Array.isArray(catalog.connections)) fail("Catalogo connessioni non valido: versione 1 e array connections richiesti.", "connections");
  validateGatewayConfiguration(catalog.gateway, options.allowEphemeralPort === true);
  const selected = catalog.connections.map((connection, index) => ({ connection, index })).filter(({ connection }) => options.includeDisabled || connection?.enabled === true);
  if (selected.length > 1_000 || selected.reduce((n, { connection }) => n + (Array.isArray(connection?.bindings) ? connection.bindings.length : 0), 0) > 5_000) fail("Catalogo gateway troppo grande: massimo 1000 connessioni e 5000 tag.", "connections");
  const ids = new Set(), owners = new Set();
  for (const { connection, index } of selected) {
    const prefix = "connections." + index + ".";
    if (!object(connection)) fail("Profilo connessione non valido.", prefix + "protocol");
    if (typeof connection.enabled !== "boolean") fail("Abilitazione connessione non valida.", prefix + "enabled");
    validatePlcConnection(connection, variables, prefix);
    if (ids.has(connection.id)) fail("Id di connessione duplicati.", prefix + "id"); ids.add(connection.id);
    if (connection.enabled) for (const binding of connection.bindings) {
      if (owners.has(binding.tag)) fail("Un tag non può avere due sorgenti PLC attive, anche tra MQTT e OPC UA.", prefix + "bindings." + connection.bindings.indexOf(binding) + ".tag"); owners.add(binding.tag);
    }
  }
}
