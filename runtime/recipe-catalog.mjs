const messages = {
  RECIPE_CONFIG: [400, "Schema ricette non valido", "Controlla versione, identificativi unici, campi, tipi e valori iniziali del catalogo Framecraft."],
  RECIPE_VALUE: [422, "Valori ricetta non validi", "Completa tutti i campi con il tipo e i limiti dello schema. Nessuna conversione o valore predefinito viene scelto al tuo posto."],
  RECIPE_COMMAND: [400, "Operazione ricetta non valida", "Rileggi lo stato e invia una sola operazione con ID univoco, revisione attesa e campi previsti."],
  RECIPE_AUTH: [403, "Operatore non autorizzato alle ricette", "Configura identità e permessi nel servizio. Il token del gateway o il PIN del browser non identificano da soli l’operatore."],
  RECIPE_CONFLICT: [409, "Le ricette sono cambiate", "Rileggi lo stato e confronta le modifiche. Non sovrascrivere o ripetere automaticamente l’operazione."],
  RECIPE_MISSING: [404, "Schema o ricetta non disponibile", "Rileggi il catalogo: la destinazione potrebbe essere stata rimossa o rinominata."],
  RECIPE_EXISTS: [409, "Nome o identificativo ricetta già presente", "Scegli un nome e un identificativo diversi nello stesso schema."],
  RECIPE_BUSY: [423, "Archivio ricette occupato", "Attendi l’operazione in corso e rileggi lo stato. Un lock rimasto dopo un guasto richiede una verifica del processo da parte dell’IT; non viene eliminato automaticamente."],
  RECIPE_CORRUPT: [503, "Archivio ricette non leggibile", "Conserva il file esistente e verifica il backup con chi ti assiste. L’archivio non viene sostituito con i valori iniziali."],
  RECIPE_SCHEMA: [409, "Lo schema ricette è cambiato", "Serve una migrazione esplicita con backup e revisione dei valori. Non viene eseguito un adattamento automatico."],
  RECIPE_STORAGE: [503, "Archivio ricette non disponibile", "Controlla disco locale, spazio e permessi dell’account servizio. Link e file condivisi tramite hard link non sono accettati."],
  RECIPE_UNCERTAIN: [503, "Salvataggio ricetta con esito incerto", "Non reinviare con un nuovo ID. Verifica il processo e rileggi lo stato; conserva l’ID della richiesta per riconoscere un’operazione già registrata."],
  RECIPE_LIMIT: [413, "Limite dell’archivio ricette raggiunto", "Controlla dimensione del catalogo, numero di ricette e lunghezza dei valori. I dati esistenti non vengono troncati."],
};
export class RecipeStoreError extends Error {
  constructor(code, fieldId) {
    const [status, message, remedy] = Object.hasOwn(messages, code) ? messages[code] : messages.RECIPE_STORAGE;
    super(message); this.name = "RecipeStoreError"; this.code = Object.hasOwn(messages, code) ? code : "RECIPE_STORAGE"; this.status = status; this.remedy = remedy;
    if (recipeId(fieldId)) this.fieldId = fieldId;
  }
}
const fail = (code, field) => { throw new RecipeStoreError(code, field); };
export const recipeObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const recipeKeys = (value, required, optional = []) => recipeObject(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
export const recipeId = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value) && !["__proto__", "prototype", "constructor"].includes(value.toLowerCase());
export const recipeText = (value, max = 160) => typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value);
export const recipeActor = value => recipeText(value, 200);
export const recipeNameKey = value => value.normalize("NFC").toLocaleLowerCase("en-US");
export const recipeByteSize = value => new TextEncoder().encode(value).length;
export const emptyRecipeCatalog = () => ({ version: 1, schemas: [] });
function unique(items, key, code) { if (new Set(items.map(key)).size !== items.length) fail(code); }
function field(value) {
  if (!recipeKeys(value, ["id", "name", "type"], ["unit", "minimum", "maximum", "maxLength"]) || !recipeId(value.id) || !recipeText(value.name) || !["boolean", "integer", "number", "string"].includes(value.type)) fail("RECIPE_CONFIG");
  if (value.unit !== undefined && !recipeText(value.unit, 32)) fail("RECIPE_CONFIG");
  const numeric = ["integer", "number"].includes(value.type);
  for (const key of ["minimum", "maximum"]) if (value[key] !== undefined && (!numeric || typeof value[key] !== "number" || !Number.isFinite(value[key]) || value.type === "integer" && !Number.isSafeInteger(value[key]))) fail("RECIPE_CONFIG");
  if (value.minimum !== undefined && value.maximum !== undefined && value.minimum > value.maximum) fail("RECIPE_CONFIG");
  if (value.maxLength !== undefined && (value.type !== "string" || !Number.isSafeInteger(value.maxLength) || value.maxLength < 1 || value.maxLength > 1024)) fail("RECIPE_CONFIG");
  return Object.fromEntries(["id", "name", "type", "unit", "minimum", "maximum", "maxLength"].filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
export function parseRecipeValues(raw, fields) {
  if (!recipeObject(raw) || Object.keys(raw).length !== fields.length || fields.some(field => !Object.hasOwn(raw, field.id))) fail("RECIPE_VALUE");
  const entries = fields.map(field => {
    const value = raw[field.id];
    if (field.type === "boolean" ? typeof value !== "boolean" : field.type === "string" ? typeof value !== "string" || value.length > (field.maxLength ?? 1024) || /\u0000/.test(value) : typeof value !== "number" || !Number.isFinite(value) || field.type === "integer" && !Number.isSafeInteger(value) || field.minimum !== undefined && value < field.minimum || field.maximum !== undefined && value > field.maximum) fail("RECIPE_VALUE", field.id);
    return [field.id, value];
  });
  return Object.fromEntries(entries);
}
export function parseRecipeRecords(raw, fields) {
  if (!Array.isArray(raw) || raw.length > 500) fail("RECIPE_LIMIT");
  const records = raw.map(value => {
    if (!recipeKeys(value, ["id", "name", "values"]) || !recipeId(value.id) || !recipeText(value.name)) fail("RECIPE_CONFIG");
    return { id: value.id, name: value.name, values: parseRecipeValues(value.values, fields) };
  });
  unique(records, value => value.id, "RECIPE_EXISTS"); unique(records, value => recipeNameKey(value.name), "RECIPE_EXISTS");
  return records;
}
export function parseRecipeCatalog(input) {
  let raw;
  try { const source = typeof input === "string" ? input : JSON.stringify(input); if (typeof source !== "string" || recipeByteSize(source) > 2_000_000) fail("RECIPE_LIMIT"); raw = JSON.parse(source.replace(/^\uFEFF/, "")); }
  catch (error) { if (error instanceof RecipeStoreError) throw error; fail("RECIPE_CONFIG"); }
  if (!recipeKeys(raw, ["version", "schemas"]) || raw.version !== 1 || !Array.isArray(raw.schemas) || raw.schemas.length > 32) fail("RECIPE_CONFIG");
  const schemas = raw.schemas.map(value => {
    if (!recipeKeys(value, ["id", "name", "fields", "records"]) || !recipeId(value.id) || !recipeText(value.name) || !Array.isArray(value.fields) || !value.fields.length || value.fields.length > 64) fail("RECIPE_CONFIG");
    const fields = value.fields.map(field); unique(fields, value => value.id, "RECIPE_CONFIG"); unique(fields, value => recipeNameKey(value.name), "RECIPE_CONFIG");
    return { id: value.id, name: value.name, fields, records: parseRecipeRecords(value.records, fields) };
  });
  unique(schemas, value => value.id, "RECIPE_CONFIG"); unique(schemas, value => recipeNameKey(value.name), "RECIPE_CONFIG");
  return { version: 1, schemas };
}
export function parseRecipeCommand(value) {
  if (!recipeKeys(value, ["id", "expectedRevision", "action", "schemaId", "recordId"], ["name", "values", "targetId"]) || typeof value.id !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(value.id) || typeof value.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(value.expectedRevision) || !recipeId(value.schemaId) || !recipeId(value.recordId)) fail("RECIPE_COMMAND");
  const extras = { create: ["name", "values"], update: ["name", "values"], rename: ["name"], delete: [], copy: ["name", "targetId"] };
  if (typeof value.action !== "string" || !Object.hasOwn(extras, value.action) || !recipeKeys(value, ["id", "expectedRevision", "action", "schemaId", "recordId", ...extras[value.action]])) fail("RECIPE_COMMAND");
  if (extras[value.action].includes("name") && !recipeText(value.name) || extras[value.action].includes("targetId") && !recipeId(value.targetId) || extras[value.action].includes("values") && !recipeObject(value.values)) fail("RECIPE_COMMAND");
  if (value.values !== undefined && (!recipeObject(value.values) || Object.keys(value.values).length > 64 || Object.entries(value.values).some(([key, value]) => !recipeId(key) || !["number", "string", "boolean"].includes(typeof value) || typeof value === "number" && !Number.isFinite(value) || typeof value === "string" && value.length > 1024))) fail("RECIPE_COMMAND");
  return { id: value.id, expectedRevision: value.expectedRevision, action: value.action, schemaId: value.schemaId, recordId: value.recordId, ...(value.name !== undefined ? { name: value.name } : {}), ...(value.targetId !== undefined ? { targetId: value.targetId } : {}), ...(value.values !== undefined ? { values: Object.fromEntries(Object.entries(value.values).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) } : {}) };
}
