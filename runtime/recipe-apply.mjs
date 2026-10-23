import { parseRecipeCatalog, parseRecipeValues, recipeByteSize, recipeId, recipeKeys, recipeText } from "./recipe-catalog.mjs";

const messages = {
  RECIPE_APPLY_CONFIG: [400, "Interfaccia di applicazione ricette non valida", "Controlla canale, tag richiesta/risposta, capacità del messaggio e tempi. Il programma PLC deve implementare esplicitamente Framecraft Recipe Apply v1."],
  RECIPE_APPLY_DISABLED: [503, "Applicazione ricette al PLC non configurata", "Configura l’interfaccia Framecraft sul PLC e nel progetto. La lettura e l’archivio ricette restano separati; nessuna scrittura diretta viene usata come alternativa."],
  RECIPE_APPLY_INPUT: [400, "Richiesta di applicazione non valida", "Rileggi la ricetta e conferma una sola richiesta con ID univoco e revisione attesa. Non aggiungere valori o tag arbitrari."],
  RECIPE_APPLY_CHANGED: [409, "Ricetta o interfaccia PLC cambiata", "Rileggi la ricetta e confronta i valori. Le richieste esistenti conservano il contratto originale e non vengono adattate automaticamente."],
  RECIPE_APPLY_BUSY: [423, "Canale ricette occupato o con esito da verificare", "Verifica la richiesta precedente. Non inviare una seconda ricetta o cancellare il registro per liberare il canale."],
  RECIPE_APPLY_STORAGE: [503, "Registro dei trasferimenti ricetta non disponibile", "Controlla disco locale, integrità e permessi del servizio. Non cancellare o ricreare il registro: conserva ID e stato del PLC."],
  RECIPE_APPLY_NODE: [503, "Node.js richiede un aggiornamento per i trasferimenti ricetta", "Usa una versione Node LTS con SQLite corretto per WAL-reset, come per il registro attività. Fai aggiornare il Runtime dal responsabile senza cancellare archivi o disattivare i controlli."],
  RECIPE_APPLY_LIMIT: [503, "Registro dei trasferimenti ricetta pieno", "Predisponi manutenzione e backup verificati a servizio fermo. Nessuna ricevuta viene eliminata automaticamente per ripetere un comando."],
  RECIPE_APPLY_MISSING: [404, "Richiesta di applicazione non trovata", "Controlla progetto, ID e schema. Non creare una nuova richiesta finché non hai verificato il PLC e il registro originale."],
  RECIPE_APPLY_OFFLINE: [503, "Interfaccia ricette PLC non pronta", "Controlla connessione, abilitazioni di scrittura e campioni della risposta. Non vengono accodati comandi o usati valori sostitutivi."],
  RECIPE_APPLY_RESPONSE: [502, "Risposta del programma PLC non valida", "Controlla versione, namespace, canale, ID, sequenza, fingerprint e stato del protocollo. Una risposta di trasporto non conferma l’applicazione."],
  RECIPE_APPLY_COUNTER: [409, "Sequenza del servizio e del PLC non coerente", "Fai verificare registro, ripristino e dati ritentivi del PLC. Non azzerare contatori né accettare automaticamente una nuova identità."],
  RECIPE_APPLY_PAYLOAD: [413, "La ricetta supera la capacità del canale PLC", "Verifica la capacità reale del buffer richiesta e del parser PLC. Il messaggio completo non viene troncato o suddiviso in scritture dirette."],
  RECIPE_APPLY_REJECTED: [422, "Il programma PLC ha rifiutato la ricetta", "Controlla il codice di rifiuto del PLC e gli interblocchi macchina. Non riprovare con un nuovo ID senza correggere e verificare la causa."],
  RECIPE_APPLY_NOT_SENT: [409, "Richiesta fermata prima dell’invio al PLC", "Il registro conferma che nessuna preparazione è stata avviata. Controlla la causa e rileggi la ricetta prima di una nuova conferma."],
  RECIPE_APPLY_UNCERTAIN: [503, "Esito della ricetta da verificare", "Conserva l’ID e usa soltanto la verifica di stato. Non ripetere preparazione o applicazione: il programma PLC potrebbe aver ricevuto il comando."],
};
export class RecipeApplyError extends Error {
  constructor(code) { const known = Object.hasOwn(messages, code) ? code : "RECIPE_APPLY_STORAGE", [status, message, remedy] = messages[known]; super(message); this.name = "RecipeApplyError"; this.code = known; this.status = status; this.remedy = remedy; this.outcome = known === "RECIPE_APPLY_UNCERTAIN" ? "uncertain" : "rejected"; }
}
const fail = code => { throw new RecipeApplyError(code); };
const order = (left, right) => left < right ? -1 : left > right ? 1 : 0;
export const recipeApplyHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const recipeApplyId = value => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
export const recipeApplyNamespace = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const recipeApplySequence = value => Number.isInteger(value) && value > 0 && value <= 4294967295;
export const recipeApplyAscii = value => JSON.stringify(value).replace(/[\u007f-\uffff]/g, char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
export const emptyRecipeApplyConfig = () => ({ version: 1, schemas: [] });
export function parseRecipeApplyConfig(input, catalog, variables) {
  let raw; try { const source = typeof input === "string" ? input : JSON.stringify(input); if (!source || recipeByteSize(source) > 1000000) fail("RECIPE_APPLY_CONFIG"); raw = JSON.parse(source.replace(/^\uFEFF/, "")); } catch { fail("RECIPE_APPLY_CONFIG"); }
  if (!recipeKeys(raw, ["version", "schemas"]) || raw.version !== 1 || !Array.isArray(raw.schemas) || raw.schemas.length > 32) fail("RECIPE_APPLY_CONFIG");
  const ids = new Set(), channels = new Map(), tags = new Map();
  let schemas; try { schemas = catalog === undefined ? undefined : parseRecipeCatalog(catalog).schemas; } catch { fail("RECIPE_APPLY_CONFIG"); }
  const profiles = raw.schemas.map(profile => {
    if (!recipeKeys(profile, ["schemaId", "channelId", "requestTag", "responseTag", "maxPayloadBytes", "maxAgeMs", "prepareTimeoutMs", "applyTimeoutMs", "stageLifetimeMs"]) || !recipeId(profile.schemaId) || !recipeId(profile.channelId) || !recipeText(profile.requestTag, 200) || !recipeText(profile.responseTag, 200) || profile.requestTag === profile.responseTag || ids.has(profile.schemaId) || schemas && !schemas.some(schema => schema.id === profile.schemaId)
      || !integer(profile.maxPayloadBytes, 512, 131072) || !integer(profile.maxAgeMs, 250, 10000) || !integer(profile.prepareTimeoutMs, 1000, 20000) || !integer(profile.applyTimeoutMs, 1000, 20000) || !integer(profile.stageLifetimeMs, profile.prepareTimeoutMs + 1000, 120000)) fail("RECIPE_APPLY_CONFIG");
    ids.add(profile.schemaId);
    if (variables) for (const [key, access] of [["requestTag", "write"], ["responseTag", "read"]]) {
      const matches = variables.filter(variable => !variable.detected && variable.name === profile[key]);
      if (matches.length !== 1 || ![access, "read-write"].includes(matches[0].access) || !["string", "wstring"].includes(matches[0].dataType?.toLowerCase())) fail("RECIPE_APPLY_CONFIG");
    }
    const channel = JSON.stringify({ channelId: profile.channelId, requestTag: profile.requestTag, responseTag: profile.responseTag, maxPayloadBytes: profile.maxPayloadBytes, maxAgeMs: profile.maxAgeMs, prepareTimeoutMs: profile.prepareTimeoutMs, applyTimeoutMs: profile.applyTimeoutMs, stageLifetimeMs: profile.stageLifetimeMs });
    if (channels.has(profile.channelId) && channels.get(profile.channelId) !== channel) fail("RECIPE_APPLY_CONFIG"); channels.set(profile.channelId, channel);
    for (const tag of [profile.requestTag, profile.responseTag]) { if (tags.has(tag) && tags.get(tag) !== profile.channelId) fail("RECIPE_APPLY_CONFIG"); tags.set(tag, profile.channelId); }
    return { ...profile };
  });
  return { version: 1, schemas: profiles.sort((a, b) => order(a.schemaId, b.schemaId)) };
}
export function parseRecipeApplyCommand(raw) {
  if (!recipeKeys(raw, ["id", "expectedRevision", "schemaId", "recordId"]) || !recipeApplyId(raw.id) || !recipeApplyHash(raw.expectedRevision) || !recipeId(raw.schemaId) || !recipeId(raw.recordId)) fail("RECIPE_APPLY_INPUT");
  return { id: raw.id, expectedRevision: raw.expectedRevision, schemaId: raw.schemaId, recordId: raw.recordId };
}
export function parseRecipeApplyLookup(raw) {
  if (!recipeKeys(raw, ["id", "schemaId"]) || !recipeApplyId(raw.id) || !recipeId(raw.schemaId)) fail("RECIPE_APPLY_INPUT"); return { id: raw.id, schemaId: raw.schemaId };
}
export function recipeApplySchemaSource(schema) {
  const parsed = parseRecipeCatalog({ version: 1, schemas: [{ ...schema, records: [] }] }).schemas[0];
  return recipeApplyAscii({ id: parsed.id, fields: [...parsed.fields].sort((a, b) => order(a.id, b.id)) });
}
export function recipeApplyValues(schema, record) { return parseRecipeValues(record.values, [...schema.fields].sort((a, b) => order(a.id, b.id))); }
export function parseRecipeApplyAck(input) {
  let raw; try { if (typeof input !== "string" || recipeByteSize(input) > 4096) fail("RECIPE_APPLY_RESPONSE"); raw = JSON.parse(input); } catch { fail("RECIPE_APPLY_RESPONSE"); }
  if (!recipeKeys(raw, ["version", "namespace", "channelId", "sequence", "id", "fingerprint", "state", "code"]) || raw.version !== 1 || !recipeApplyNamespace(raw.namespace) || !recipeId(raw.channelId) || !["idle", "prepared", "applied", "rejected", "uncertain"].includes(raw.state) || !integer(raw.code, 0, 65535)) fail("RECIPE_APPLY_RESPONSE");
  if (raw.state === "idle" ? raw.sequence !== 0 || raw.id !== null || raw.fingerprint !== null || raw.code !== 0 : !recipeApplySequence(raw.sequence) || !recipeApplyId(raw.id) || !recipeApplyHash(raw.fingerprint) || (["prepared", "applied"].includes(raw.state) ? raw.code !== 0 : raw.code === 0)) fail("RECIPE_APPLY_RESPONSE");
  return raw;
}
export function parseRecipeApplyFrame(input, maxBytes = 131072) {
  let raw; try { if (typeof input !== "string" || recipeByteSize(input) > maxBytes) fail("RECIPE_APPLY_PAYLOAD"); raw = JSON.parse(input); } catch (error) { throw error instanceof RecipeApplyError ? error : new RecipeApplyError("RECIPE_APPLY_INPUT"); }
  const keys = ["version", "namespace", "channelId", "sequence", "id", "fingerprint", "phase"];
  if (!raw || !["prepare", "apply", "status"].includes(raw.phase) || !recipeKeys(raw, raw.phase === "prepare" ? [...keys, "schemaId", "recordId", "schemaHash", "ttlMs", "values"] : keys) || raw.version !== 1 || !recipeApplyNamespace(raw.namespace) || !recipeId(raw.channelId) || !recipeApplySequence(raw.sequence) || !recipeApplyId(raw.id) || !recipeApplyHash(raw.fingerprint)) fail("RECIPE_APPLY_INPUT");
  if (raw.phase === "prepare" && (!recipeId(raw.schemaId) || !recipeId(raw.recordId) || !recipeApplyHash(raw.schemaHash) || !integer(raw.ttlMs, 1000, 120000) || !raw.values || typeof raw.values !== "object" || Array.isArray(raw.values) || !Object.keys(raw.values).length || Object.keys(raw.values).length > 64 || Object.entries(raw.values).some(([key, value]) => !recipeId(key) || !["number", "boolean", "string"].includes(typeof value) || typeof value === "number" && !Number.isFinite(value) || typeof value === "string" && (value.length > 1024 || value.includes("\0"))))) fail("RECIPE_APPLY_INPUT");
  return raw;
}
export function recipeApplyFrame(receipt, phase, payload, maxBytes) {
  if (!["prepare", "apply", "status"].includes(phase)) fail("RECIPE_APPLY_INPUT");
  const message = { version: 1, namespace: receipt.namespace, channelId: receipt.channelId, sequence: receipt.sequence, id: receipt.id, fingerprint: receipt.fingerprint, phase,
    ...(phase === "prepare" ? { schemaId: receipt.schemaId, recordId: receipt.recordId, schemaHash: payload.schemaHash, ttlMs: payload.ttlMs, values: payload.values } : {}) };
  const source = recipeApplyAscii(message); if (recipeByteSize(source) > maxBytes) fail("RECIPE_APPLY_PAYLOAD"); return source;
}
