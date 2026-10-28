import { parseRecipeCatalog, parseRecipeRecords, recipeByteSize, recipeKeys, RecipeStoreError } from "./recipe-catalog.mjs";

export const recipeFileMaxBytes = 2_000_000;
const fail = code => { throw new RecipeStoreError(code); };
const normalized = schema => parseRecipeCatalog({ version: 1, schemas: [schema] }).schemas[0];
const fieldsKey = fields => JSON.stringify(fields);
const recordKey = (record, fields) => JSON.stringify([record.name, ...fields.map(field => record.values[field.id])]);

/** Portable Framecraft data, not a vendor project or a controller transfer. */
export function exportRecipeFile(schema, source) {
  const checked = normalized(schema);
  if (!recipeKeys(source, ["revision", "sequence", "exportedAt"]) || !/^[a-f0-9]{64}$/.test(source.revision) || !Number.isSafeInteger(source.sequence) || source.sequence < 0 || typeof source.exportedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(source.exportedAt) || new Date(source.exportedAt).toISOString() !== source.exportedAt) fail("RECIPE_FILE");
  const text = JSON.stringify({ format: "framecraft.recipes", version: 1, source, schema: checked }, null, 2) + "\n";
  if (recipeByteSize(text) > recipeFileMaxBytes) fail("RECIPE_LIMIT");
  return text;
}
export function parseRecipeFile(input) {
  try {
    if (typeof input !== "string" || recipeByteSize(input) > recipeFileMaxBytes) fail("RECIPE_FILE");
    const value = JSON.parse(input.replace(/^\uFEFF/, ""));
    if (!recipeKeys(value, ["format", "version", "source", "schema"]) || value.format !== "framecraft.recipes" || value.version !== 1) fail("RECIPE_FILE");
    const schema = normalized(value.schema);
    // Reuse the same metadata checks without trusting the source revision as the target revision.
    exportRecipeFile({ ...schema, records: [] }, value.source);
    return { format: value.format, version: value.version, source: { ...value.source }, schema };
  } catch (error) { if (error instanceof RecipeStoreError && ["RECIPE_VALUE", "RECIPE_EXISTS", "RECIPE_LIMIT"].includes(error.code)) throw error; fail("RECIPE_FILE"); }
}
/** Merge by immutable record ID. Omitted records are kept; nothing is deleted. */
export function mergeRecipeRecords(schema, fields, records) {
  const current = normalized(schema), incoming = normalized({ ...current, fields, records });
  if (fieldsKey(current.fields) !== fieldsKey(incoming.fields)) fail("RECIPE_FILE_SCHEMA");
  const byId = new Map(incoming.records.map(record => [record.id, record]));
  return parseRecipeRecords([...current.records.map(record => byId.get(record.id) ?? record), ...incoming.records.filter(record => !current.records.some(item => item.id === record.id))], current.fields);
}
export function previewRecipeImport(schema, file) {
  const current = normalized(schema);
  if (file.schema.id !== current.id) fail("RECIPE_FILE_SCHEMA");
  return previewRecipeRecords(current, file.schema.fields, file.schema.records);
}
export function previewRecipeRecords(schema, fields, records) {
  const current = normalized(schema), merged = mergeRecipeRecords(current, fields, records);
  const changes = records.map(after => {
    const before = current.records.find(record => record.id === after.id);
    return { id: after.id, kind: !before ? "create" : recordKey(before, current.fields) === recordKey(after, current.fields) ? "unchanged" : "update", before, after };
  });
  return { records: structuredClone(records), changes: structuredClone(changes), kept: current.records.filter(record => !changes.some(change => change.id === record.id)).length, total: merged.length };
}
