import { emptyRecipeCatalog, parseRecipeCatalog, recipeConfigurationFile } from "../core/recipeConfiguration";
export const aiRecipeDiscovery = " Eccezione esplicita ai file fuori src: puoi proporre modifiche al solo catalogo iniziale framecraft.recipes.json. Prima leggilo con reads: restituisce formato e stato operativo. Nessun accesso all’archivio operativo o scrittura PLC.";
export const aiRecipeRules = " Eccezione esplicita ai file fuori src: puoi leggere e modificare framecraft.recipes.json, solo configurazione iniziale Framecraft v1. Leggilo prima con reads; se manca verifica l’assenza. Il contratto recipes compare solo dopo questa lettura. Se recipes.editable è false non modificarlo: il servizio ha già un archivio operativo. Nessun accesso a .framecraft-runtime, ricevute o valori operativi; niente migrazioni automatiche o comandi PLC. Non inventare valori, limiti o unità macchina: puoi definire uno schema con records vuoto se mancano dati espliciti. Il confronto e il backend verificano nuovamente i file prima del salvataggio.";
export function aiRecipeContext(source: string | null, editable?: boolean) {
  const catalog = source === null ? emptyRecipeCatalog() : parseRecipeCatalog(source);
  return { file: recipeConfigurationFile, purpose: "initial-configuration-only", exists: source !== null, editable: editable ?? null,
    schemaCount: catalog.schemas.length, schemas: catalog.schemas.slice(0, 12).map(schema => ({ id: schema.id, name: schema.name, fields: schema.fields.length, recipes: schema.records.length })), schemasLimited: catalog.schemas.length > 12,
    contract: { version: 1, rootKeys: ["version", "schemas"], schemaKeys: ["id", "name", "fields", "records"], fieldRequired: ["id", "name", "type"], fieldOptional: ["unit", "minimum", "maximum", "maxLength"], types: ["boolean", "integer", "number", "string"], recordKeys: ["id", "name", "values"], allFieldsRequired: true, extraKeys: false, uniqueIdsAndNames: true, maxSchemas: 32, maxFields: 64, maxRecords: 500, maxStringLength: 1024 },
  };
}
export function aiRecipeSummary(before: string | null, after: string) {
  const old = before === null ? emptyRecipeCatalog() : parseRecipeCatalog(before), next = parseRecipeCatalog(after);
  const lines: string[] = []; let omitted = 0, abbreviated = false;
  const add = (line: string) => { if (lines.length < 16) lines.push(line); else omitted++; };
  const text = (value: unknown) => { const result = value === undefined ? "non presente" : JSON.stringify(value); if (result.length > 100) { abbreviated = true; return result.slice(0, 100) + "…"; } return result; };
  for (const previous of old.schemas) if (!next.schemas.some(schema => schema.id === previous.id)) add(`Rimuove lo schema «${previous.name}» e ${previous.records.length} ricette iniziali.`);
  for (const schema of next.schemas) {
    const previous = old.schemas.find(item => item.id === schema.id);
    if (!previous) add(`Crea lo schema «${schema.name}».`); else if (previous.name !== schema.name) add(`Rinomina schema «${previous.name}» in «${schema.name}».`);
    for (const field of previous?.fields ?? []) if (!schema.fields.some(item => item.id === field.id)) add(`${schema.name}: rimuove il campo «${field.name}» e i suoi valori iniziali.`);
    for (const field of schema.fields) {
      const oldField = previous?.fields.find(item => item.id === field.id);
      if (JSON.stringify(oldField) !== JSON.stringify(field)) add(`${schema.name}: ${oldField ? "modifica" : "crea"} campo «${field.name}» · ${field.type}${field.unit ? " · " + field.unit : ""}${field.minimum !== undefined ? " · minimo " + field.minimum : ""}${field.maximum !== undefined ? " · massimo " + field.maximum : ""}${field.maxLength !== undefined ? " · lunghezza massima " + field.maxLength : ""}.`);
    }
    for (const record of previous?.records ?? []) if (!schema.records.some(item => item.id === record.id)) add(`${schema.name}: rimuove la ricetta iniziale «${record.name}».`);
    for (const record of schema.records) {
      const oldRecord = previous?.records.find(item => item.id === record.id);
      if (!oldRecord) add(`${schema.name}: crea la ricetta iniziale «${record.name}».`); else if (oldRecord.name !== record.name) add(`${schema.name}: rinomina «${oldRecord.name}» in «${record.name}».`);
      for (const field of schema.fields) if (oldRecord?.values[field.id] !== record.values[field.id]) add(`${schema.name} / ${record.name} / ${field.name}: ${text(oldRecord?.values[field.id])} → ${text(record.values[field.id])}.`);
    }
  }
  return { schemas: next.schemas.length, records: next.schemas.reduce((total, schema) => total + schema.records.length, 0), lines, omitted, abbreviated };
}
