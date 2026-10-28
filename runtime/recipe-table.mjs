import { parseRecipeCatalog, parseRecipeRecords, parseRecipeValues, recipeByteSize, recipeId, recipeKeys, recipeNameKey, recipeText, RecipeStoreError } from "./recipe-catalog.mjs";
import { recipeFileMaxBytes } from "./recipe-exchange.mjs";

const marker = "framecraft.recipes.tsv";
const messages = {
  RECIPE_TABLE_FORMAT: ["Tabella ricette non valida", "Usa un TSV UTF-8 entro 2 MB: prima riga con intestazioni uniche, fino a 500 ricette e 128 colonne. Virgolette interne doppie; nessuna riga o colonna viene troncata."],
  RECIPE_TABLE_MAPPING: ["Abbinamento colonne incompleto o ambiguo", "Abbina una colonna diversa a ID, nome e ogni campo. Per escludere colonne aggiuntive conferma esplicitamente di ignorarle."],
  RECIPE_TABLE_VALUE: ["Valore della tabella non valido", "Correggi la riga e la colonna indicate. Servono tutti i valori: booleani true/false, interi esatti, numeri senza separatori delle migliaia e testi entro i limiti. Nessun valore viene inventato."],
};
export class RecipeTableError extends Error {
  constructor(code, row, column) {
    const [message, remedy] = messages[code]; super(message); this.name = "RecipeTableError"; this.code = code; this.remedy = remedy;
    if (row !== undefined) this.row = row;
    if (column !== undefined) this.column = column;
  }
}
const fail = (code, row, column) => { throw new RecipeTableError(code, row, column); };
const normalized = schema => parseRecipeCatalog({ version: 1, schemas: [schema] }).schemas[0];

function readRows(source) {
  if (typeof source !== "string" || recipeByteSize(source) > recipeFileMaxBytes || source.includes("\0")) fail("RECIPE_TABLE_FORMAT");
  source = source.replace(/^\uFEFF/, "");
  const rows = []; let row = [], cell = "", quoted = false, closed = false;
  const pushCell = () => { if (cell.length > 8192 || row.length >= 128) fail("RECIPE_TABLE_FORMAT"); row.push(cell); cell = ""; closed = false; };
  const pushRow = () => { pushCell(); if (rows.length >= 502) fail("RECIPE_TABLE_FORMAT"); rows.push(row); row = []; };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') { if (source[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += char;
    } else if (char === "\t") pushCell();
    else if (char === "\r" || char === "\n") { if (char === "\r" && source[i + 1] === "\n") i++; pushRow(); }
    else if (char === '"' && !cell && !closed) quoted = true;
    else { if (closed || char === '"') fail("RECIPE_TABLE_FORMAT"); cell += char; }
    if (cell.length > 8192) fail("RECIPE_TABLE_FORMAT");
  }
  if (quoted) fail("RECIPE_TABLE_FORMAT");
  if (cell || row.length || closed) pushRow();
  return rows;
}
export function parseRecipeTable(source) {
  const rows = readRows(source); let schemaId;
  if (rows[0]?.[0] === marker) {
    const metadata = rows.shift();
    if (metadata.length !== 3 || metadata[1] !== "1" || !recipeId(metadata[2])) fail("RECIPE_TABLE_FORMAT");
    schemaId = metadata[2];
  }
  const columns = rows.shift();
  if (!columns?.length || columns.some(column => !recipeText(column)) || new Set(columns.map(recipeNameKey)).size !== columns.length || rows.length > 500 || rows.some(row => row.length !== columns.length)) fail("RECIPE_TABLE_FORMAT");
  return { format: schemaId ? "framecraft" : "table", ...(schemaId ? { schemaId } : {}), columns, rows };
}
export function suggestRecipeTableMapping(schema, table) {
  const checked = normalized(schema), index = name => table.columns.indexOf(name);
  const idColumn = index("recipe.id") >= 0 ? index("recipe.id") : index("id"), nameColumn = index("recipe.name") >= 0 ? index("recipe.name") : index("name");
  return { idColumn, nameColumn, fields: Object.fromEntries(checked.fields.map(field => [field.id, index("value." + field.id) >= 0 ? index("value." + field.id) : ["id", "name"].includes(field.id) ? -1 : index(field.id)])), decimal: ".", ignoreExtraColumns: false };
}
export function mapRecipeTable(schema, table, mapping) {
  const checked = normalized(schema);
  if (table.schemaId !== undefined && table.schemaId !== checked.id) throw new RecipeStoreError("RECIPE_FILE_SCHEMA");
  if (!recipeKeys(mapping, ["idColumn", "nameColumn", "fields", "decimal", "ignoreExtraColumns"]) || !recipeKeys(mapping.fields, checked.fields.map(field => field.id)) || ![".", ","].includes(mapping.decimal) || typeof mapping.ignoreExtraColumns !== "boolean" || table.format === "framecraft" && mapping.decimal !== ".") fail("RECIPE_TABLE_MAPPING");
  const indexes = [mapping.idColumn, mapping.nameColumn, ...checked.fields.map(field => mapping.fields[field.id])];
  if (indexes.some(index => !Number.isSafeInteger(index) || index < 0 || index >= table.columns.length) || new Set(indexes).size !== indexes.length || !mapping.ignoreExtraColumns && indexes.length !== table.columns.length) fail("RECIPE_TABLE_MAPPING");
  const ids = new Set(), names = new Set();
  const text = (raw, row, index) => {
    if (table.format === "table") return raw;
    try { const value = JSON.parse(raw.slice(5)); if (!raw.startsWith("text:") || typeof value !== "string") throw new Error(); return value; }
    catch { fail("RECIPE_TABLE_VALUE", row, table.columns[index]); }
  };
  const records = table.rows.map((row, index) => {
    const position = index + 1, id = row[mapping.idColumn], name = text(row[mapping.nameColumn], position, mapping.nameColumn);
    if (!recipeId(id) || ids.has(id)) fail("RECIPE_TABLE_VALUE", position, table.columns[mapping.idColumn]);
    if (!recipeText(name) || names.has(recipeNameKey(name))) fail("RECIPE_TABLE_VALUE", position, table.columns[mapping.nameColumn]);
    ids.add(id); names.add(recipeNameKey(name));
    const values = Object.fromEntries(checked.fields.map(field => {
      const column = mapping.fields[field.id], raw = row[column]; let value;
      if (field.type === "string") value = text(raw, position, column);
      else if (field.type === "boolean") { if (!["true", "false"].includes(raw)) fail("RECIPE_TABLE_VALUE", position, table.columns[column]); value = raw === "true"; }
      else {
        const numeric = mapping.decimal === "," ? raw.replace(",", ".") : raw;
        if (mapping.decimal === "," && raw.includes(".") || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(numeric)) fail("RECIPE_TABLE_VALUE", position, table.columns[column]);
        value = Number(numeric);
        if (value === 0 && /[1-9]/.test(numeric.split(/[eE]/)[0])) fail("RECIPE_TABLE_VALUE", position, table.columns[column]);
        if (field.type === "integer") {
          // An integer token must not lose low bits or hide a fractional part when converted to Number.
          if (!/^-?(?:0|[1-9]\d*)$/.test(numeric) || !Number.isSafeInteger(value)) fail("RECIPE_TABLE_VALUE", position, table.columns[column]);
        }
      }
      try { return [field.id, parseRecipeValues({ [field.id]: value }, [field])[field.id]]; }
      catch { fail("RECIPE_TABLE_VALUE", position, table.columns[column]); }
    }));
    return { id, name, values };
  });
  return parseRecipeRecords(records, checked.fields);
}
const cell = value => /[\t\r\n"]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
export function exportRecipeTable(schema) {
  const checked = normalized(schema), text = value => "text:" + JSON.stringify(value);
  const rows = [[marker, "1", checked.id], ["recipe.id", "recipe.name", ...checked.fields.map(field => "value." + field.id)], ...checked.records.map(record => [record.id, text(record.name), ...checked.fields.map(field => field.type === "string" ? text(record.values[field.id]) : String(record.values[field.id]))])];
  const source = "\uFEFF" + rows.map(row => row.map(cell).join("\t")).join("\r\n") + "\r\n";
  if (recipeByteSize(source) > recipeFileMaxBytes) throw new RecipeStoreError("RECIPE_LIMIT");
  return source;
}
