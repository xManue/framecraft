import { normalizeMqttTagValue } from "./connection-config.mjs";
import { parseRecipeCatalog, parseRecipeValues, recipeId, recipeKeys, recipeText, recipeByteSize } from "./recipe-catalog.mjs";

const messages = {
  RECIPE_PLC_CONFIG: [400, "Collegamenti ricetta-PLC non validi", "Controlla schemi, campi, tag dichiarati e tempi in Pannello → Ricette → Collegamenti PLC. Nessun collegamento viene inventato."],
  RECIPE_PLC_QUERY: [400, "Richiesta di lettura ricetta non valida", "Rileggi l’archivio e seleziona lo schema. Sono richiesti identificativo e revisione attesa, senza parametri aggiuntivi."],
  RECIPE_PLC_MAPPING: [409, "Questo schema non ha collegamenti PLC completi", "Configura un tag leggibile per ciascun campo in Pannello → Ricette → Collegamenti PLC e riavvia manualmente il servizio."],
  RECIPE_PLC_SCHEMA: [409, "Lo schema o l’archivio ricette è cambiato", "Rileggi l’archivio prima di acquisire i valori. Non sostituire una bozza o modificare i collegamenti automaticamente."],
  RECIPE_PLC_UNAVAILABLE: [503, "Lettura dei valori PLC non disponibile", "Controlla configurazione e diagnostica del servizio. I file esistenti non vengono sostituiti e nessun comando PLC viene inviato."],
  RECIPE_PLC_UNBOUND: [503, "Tag non collegato a una sorgente PLC attiva", "Apri Connessioni PLC e configura il binding del tag indicato. Dichiarare una variabile non crea una connessione."],
  RECIPE_PLC_OFFLINE: [503, "Sorgente PLC non connessa", "Controlla servizio, rete e diagnostica della connessione, poi ripeti manualmente la lettura."],
  RECIPE_PLC_MISSING: [503, "Nessun campione PLC disponibile", "Attendi un aggiornamento reale del segnale e ripeti la lettura. Non viene usato zero o un valore iniziale."],
  RECIPE_PLC_QUALITY: [503, "Qualità del segnale non buona o sconosciuta", "Controlla qualità, errori e mapping del segnale. Un valore non valido non può essere copiato nella ricetta."],
  RECIPE_PLC_RETAINED: [503, "Il broker ha fornito un valore conservato", "Attendi una pubblicazione live del PLC. Un messaggio MQTT retained non dimostra il valore attuale della macchina."],
  RECIPE_PLC_AGE: [503, "Campione troppo vecchio o data di ricezione non valida", "Controlla il ciclo di aggiornamento e l’orologio del servizio. Rileggi dopo nuovi campioni, senza aumentare i tempi solo per nascondere il problema."],
  RECIPE_PLC_VALUE: [422, "Valore PLC incompatibile con il campo ricetta", "Controlla tipo, formato, limiti e lunghezza del campo. Non vengono applicate conversioni di unità o approssimazioni di interi a 64 bit."],
  RECIPE_PLC_SKEW: [409, "I campioni sono stati ricevuti troppo distanti nel tempo", "Attendi aggiornamenti dei segnali e rileggi. Sono gli ultimi campioni della cache, non una lettura atomica dello stesso ciclo PLC."],
  RECIPE_PLC_VALUES: [409, "Non tutti i valori PLC sono utilizzabili", "Controlla le cause campo per campo. Puoi confrontare i dati disponibili, ma non creare una ricetta con valori mancanti o sostitutivi."],
  RECIPE_PLC_RESPONSE: [502, "Risposta della lettura PLC non valida", "Non usare questi dati. Verifica versione di pannello, servizio e proxy con chi ti assiste."],
};
export class RecipePlcError extends Error {
  constructor(code, fieldId) {
    const known = Object.hasOwn(messages, code) ? code : "RECIPE_PLC_UNAVAILABLE", [status, message, remedy] = messages[known];
    super(message); this.name = "RecipePlcError"; this.code = known; this.status = status; this.remedy = remedy;
    if (recipeId(fieldId)) this.fieldId = fieldId;
  }
}
const fail = (code, fieldId) => { throw new RecipePlcError(code, fieldId); };
const ints = ["byte", "sint", "usint", "word", "int", "uint", "dword", "dint", "udint"];
const numbers = [...ints, "real", "lreal", "float", "double"];
export function recipePlcTypeCompatible(fieldType, dataType) {
  const type = typeof dataType === "string" ? dataType.toLowerCase() : "";
  return fieldType === "boolean" ? ["bool", "boolean"].includes(type) : fieldType === "string" ? ["string", "wstring"].includes(type) : fieldType === "integer" ? ints.includes(type) : fieldType === "number" && numbers.includes(type);
}
export const emptyRecipePlcConfig = () => ({ version: 1, schemas: [] });
const timing = value => Number.isInteger(value.maxAgeMs) && value.maxAgeMs >= 250 && value.maxAgeMs <= 600000 && Number.isInteger(value.maxSkewMs) && value.maxSkewMs >= 0 && value.maxSkewMs <= value.maxAgeMs;
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const time = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const unique = (items, key) => items.every(item => item !== null && typeof item === "object") && new Set(items.map(item => item[key])).size === items.length;

export function parseRecipePlcConfig(input, catalog, variables) {
  let raw;
  try { const source = typeof input === "string" ? input : JSON.stringify(input); if (typeof source !== "string" || recipeByteSize(source) > 1_000_000) fail("RECIPE_PLC_CONFIG"); raw = JSON.parse(source.replace(/^\uFEFF/, "")); }
  catch { fail("RECIPE_PLC_CONFIG"); }
  if (!recipeKeys(raw, ["version", "schemas"]) || raw.version !== 1 || !Array.isArray(raw.schemas) || raw.schemas.length > 32 || !unique(raw.schemas, "schemaId")) fail("RECIPE_PLC_CONFIG");
  const parsedCatalog = catalog === undefined ? undefined : parseRecipeCatalog(catalog);
  const schemas = raw.schemas.map(item => {
    if (!recipeKeys(item, ["schemaId", "maxAgeMs", "maxSkewMs", "fields"]) || !recipeId(item.schemaId) || !timing(item) || !Array.isArray(item.fields) || !item.fields.length || item.fields.length > 64) fail("RECIPE_PLC_CONFIG");
    const schema = parsedCatalog?.schemas.find(schema => schema.id === item.schemaId);
    if (parsedCatalog && (!schema || schema.fields.length !== item.fields.length)) fail("RECIPE_PLC_MAPPING");
    const fields = item.fields.map(binding => {
      if (!recipeKeys(binding, ["fieldId", "tag"]) || !recipeId(binding.fieldId) || !recipeText(binding.tag, 200)) fail("RECIPE_PLC_CONFIG");
      const field = schema?.fields.find(field => field.id === binding.fieldId), matches = variables?.filter(variable => !variable.detected && variable.name === binding.tag);
      if (schema && !field) fail("RECIPE_PLC_MAPPING", binding.fieldId);
      if (variables) {
        const variable = matches.length === 1 ? matches[0] : undefined;
        if (!variable || !["read", "read-write"].includes(variable.access) || !(field ? recipePlcTypeCompatible(field.type, variable.dataType) : ["number", "boolean", "string"].some(type => recipePlcTypeCompatible(type, variable.dataType)))) fail("RECIPE_PLC_CONFIG", binding.fieldId);
      }
      return { fieldId: binding.fieldId, tag: binding.tag };
    });
    if (!unique(fields, "fieldId") || !unique(fields, "tag")) fail("RECIPE_PLC_CONFIG");
    return { schemaId: item.schemaId, maxAgeMs: item.maxAgeMs, maxSkewMs: item.maxSkewMs, fields: fields.sort((a, b) => a.fieldId.localeCompare(b.fieldId, "en")) };
  });
  return { version: 1, schemas: schemas.sort((a, b) => a.schemaId.localeCompare(b.schemaId, "en")) };
}
export function parseRecipePlcQuery(value) {
  if (!recipeKeys(value, ["schemaId", "expectedRevision"]) || !recipeId(value.schemaId) || !hash(value.expectedRevision)) fail("RECIPE_PLC_QUERY");
  return { schemaId: value.schemaId, expectedRevision: value.expectedRevision };
}

export function captureRecipePlc(mapping, schema, revision, mappingRevision, variables, read, now = Date.now()) {
  if (!hash(revision) || !hash(mappingRevision) || !time(now) || mapping.schemaId !== schema.id) fail("RECIPE_PLC_SCHEMA");
  const tags = new Map(variables.filter(variable => !variable.detected).map(variable => [variable.name, variable]));
  const entries = schema.fields.map(field => {
    const binding = mapping.fields.find(binding => binding.fieldId === field.id), variable = tags.get(binding?.tag);
    if (!variable || !recipePlcTypeCompatible(field.type, variable.dataType)) fail("RECIPE_PLC_CONFIG", field.id);
    const source = read(binding.tag), sample = source?.sample;
    const entry = { fieldId: field.id, tag: binding.tag, dataType: variable.dataType, ok: false };
    if (source) { entry.connectionId = source.connectionId; entry.protocol = source.protocol; }
    if (sample && time(sample.receivedAt)) entry.receivedAt = sample.receivedAt;
    if (sample && time(sample.sourceTimestamp)) entry.sourceTimestamp = sample.sourceTimestamp;
    if (Number.isInteger(sample?.qualityCode) && sample.qualityCode >= 0 && sample.qualityCode <= 65535) entry.qualityCode = sample.qualityCode;
    if (!source) entry.code = "RECIPE_PLC_UNBOUND";
    else if (source.state !== "connected") entry.code = "RECIPE_PLC_OFFLINE";
    else if (!sample || sample.value === undefined) entry.code = "RECIPE_PLC_MISSING";
    else if (sample.lastError || entry.qualityCode === undefined || ![128, 192].includes(entry.qualityCode & 192)) entry.code = "RECIPE_PLC_QUALITY";
    else if (sample.retained === true) entry.code = "RECIPE_PLC_RETAINED";
    else if (!time(sample.receivedAt) || sample.receivedAt > now || now - sample.receivedAt > mapping.maxAgeMs) entry.code = "RECIPE_PLC_AGE";
    else {
      try { entry.value = parseRecipeValues({ [field.id]: normalizeMqttTagValue(sample.value, variable.dataType) }, [field])[field.id]; entry.ok = true; }
      catch { entry.code = "RECIPE_PLC_VALUE"; }
    }
    return entry;
  });
  const good = entries.every(entry => entry.ok), skew = good && Math.max(...entries.map(entry => entry.receivedAt)) - Math.min(...entries.map(entry => entry.receivedAt)) > mapping.maxSkewMs;
  const complete = good && !skew;
  return { version: 1, schemaId: schema.id, revision, mappingRevision, capturedAt: now, maxAgeMs: mapping.maxAgeMs, maxSkewMs: mapping.maxSkewMs, effect: "plc-read-only", simultaneous: false, plcConfirmed: false, entries, complete,
    ...(complete ? { values: Object.fromEntries(entries.map(entry => [entry.fieldId, entry.value])) } : { code: skew ? "RECIPE_PLC_SKEW" : "RECIPE_PLC_VALUES" }) };
}

export function parseRecipePlcCapture(raw, schema, revision) {
  const required = ["version", "schemaId", "revision", "mappingRevision", "capturedAt", "maxAgeMs", "maxSkewMs", "effect", "simultaneous", "plcConfirmed", "entries", "complete"];
  if (!recipeKeys(raw, required, ["values", "code"]) || raw.version !== 1 || raw.schemaId !== schema.id || raw.revision !== revision || !hash(raw.revision) || !hash(raw.mappingRevision) || !time(raw.capturedAt) || !timing(raw) || raw.effect !== "plc-read-only" || raw.simultaneous !== false || raw.plcConfirmed !== false || typeof raw.complete !== "boolean" || !Array.isArray(raw.entries) || raw.entries.length !== schema.fields.length || raw.entries.length > 64 || !unique(raw.entries, "fieldId") || !unique(raw.entries, "tag")) fail("RECIPE_PLC_RESPONSE");
  const codes = ["RECIPE_PLC_UNBOUND", "RECIPE_PLC_OFFLINE", "RECIPE_PLC_MISSING", "RECIPE_PLC_QUALITY", "RECIPE_PLC_RETAINED", "RECIPE_PLC_AGE", "RECIPE_PLC_VALUE"];
  for (const entry of raw.entries) {
    const field = schema.fields.find(field => field.id === entry?.fieldId);
    if (!recipeKeys(entry, ["fieldId", "tag", "dataType", "ok"], ["value", "code", "receivedAt", "sourceTimestamp", "qualityCode", "connectionId", "protocol"]) || !field || !recipeText(entry.tag, 200) || !recipePlcTypeCompatible(field.type, entry.dataType) || typeof entry.ok !== "boolean" || entry.connectionId !== undefined && !recipeText(entry.connectionId, 200) || entry.protocol !== undefined && !["mqtt", "opcua"].includes(entry.protocol) || (entry.connectionId === undefined) !== (entry.protocol === undefined) || entry.sourceTimestamp !== undefined && !time(entry.sourceTimestamp) || entry.receivedAt !== undefined && !time(entry.receivedAt) || entry.qualityCode !== undefined && (!Number.isInteger(entry.qualityCode) || entry.qualityCode < 0 || entry.qualityCode > 65535)) fail("RECIPE_PLC_RESPONSE");
    if (entry.ok) {
      if (entry.code !== undefined || !entry.connectionId || !time(entry.receivedAt) || entry.receivedAt > raw.capturedAt || raw.capturedAt - entry.receivedAt > raw.maxAgeMs || ![128, 192].includes(entry.qualityCode & 192)) fail("RECIPE_PLC_RESPONSE");
      try { parseRecipeValues({ [field.id]: entry.value }, [field]); } catch { fail("RECIPE_PLC_RESPONSE"); }
    } else if (!codes.includes(entry.code) || Object.hasOwn(entry, "value")) fail("RECIPE_PLC_RESPONSE");
  }
  const good = raw.entries.every(entry => entry.ok), skew = good && Math.max(...raw.entries.map(entry => entry.receivedAt)) - Math.min(...raw.entries.map(entry => entry.receivedAt)) > raw.maxSkewMs;
  if (raw.complete !== (good && !skew)) fail("RECIPE_PLC_RESPONSE");
  if (raw.complete) {
    if (raw.code !== undefined) fail("RECIPE_PLC_RESPONSE");
    let values; try { values = parseRecipeValues(raw.values, schema.fields); } catch { fail("RECIPE_PLC_RESPONSE"); }
    if (raw.entries.some(entry => values[entry.fieldId] !== entry.value)) fail("RECIPE_PLC_RESPONSE");
  } else if (Object.hasOwn(raw, "values") || raw.code !== (skew ? "RECIPE_PLC_SKEW" : "RECIPE_PLC_VALUES")) fail("RECIPE_PLC_RESPONSE");
  return JSON.parse(JSON.stringify(raw));
}
