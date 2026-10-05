import { isPlcVariableName, type PlcVariableDefinition } from "./plcVariables";
import type { WorkbookSheet } from "./workbook";

/** A TIA export writes this where a column has nothing to say. Carrying it into the catalog would
 * turn "unknown" into a value the panel would then try to use. */
const empty = new Set(["", "<no value>", "<nessun valore>", "-"]);

function cell(value: string | undefined) {
  const text = (value ?? "").trim();
  return empty.has(text.toLowerCase()) ? "" : text;
}

/** Which column holds what, by the titles the exports actually use. The Italian names are there
 * because the same table is regularly re-saved by hand before it reaches the editor. */
const columns: Record<string, string[]> = {
  name: ["name", "hmi tag name", "tag name", "tag", "nome", "variabile", "nome variabile"],
  dataType: ["hmi datatype", "hmi data type", "datatype", "data type", "tipo", "tipo dato"],
  // Read on its own as well as through `address`: a tag with nothing here is not connected to the
  // PLC at all, and that is the line between what belongs in the catalog and what does not.
  plcTag: ["plc tag", "plc address"],
  address: ["plc tag", "address", "indirizzo", "plc address"],
  description: ["comment [en-us]", "comment", "comments", "commento", "descrizione", "description"],
  table: ["path", "tag table", "tabella", "gruppo", "folder"],
  connection: ["connection", "connessione"],
  cycle: ["acquisition cycle", "cycle", "ciclo", "ciclo di acquisizione"],
};

export interface TagImportResult {
  variables: PlcVariableDefinition[];
  /** Rows the file had but the editor could not use, so an import never silently drops half a file. */
  skipped: string[];
  /** Rows left out because no PLC tag is written against them: an internal HMI tag the panel keeps
   * to itself, which the catalog of the signals exchanged with the PLC has no reason to carry. */
  withoutPlcTag: number;
}

/** Every column that could hold a field, best first. An export carries both «PLC tag» and «Address»
 * and fills whichever suits the tag, so keeping only the first of them left half the file empty. */
function headerMap(header: string[]): Map<string, number[]> {
  const found = new Map<string, number[]>();
  for (const [field, titles] of Object.entries(columns)) {
    const indexes = header
      .map((title, index) => ({ rank: titles.indexOf(title.trim().toLowerCase()), index }))
      .filter((entry) => entry.rank >= 0)
      .sort((left, right) => left.rank - right.rank)
      .map((entry) => entry.index);
    if (indexes.length) found.set(field, indexes);
  }
  return found;
}

/** The sheet that holds the tags. A TIA export puts a second sheet beside it — substitute values,
 * usage lists — and reading the first one blindly would import that instead. */
export function tagSheetOf(sheets: WorkbookSheet[]): WorkbookSheet | undefined {
  let best: { sheet: WorkbookSheet; score: number } | undefined;
  for (const sheet of sheets) {
    const map = headerMap(sheet.rows[0] ?? []);
    if (!map.has("name") || sheet.rows.length < 2) continue;
    const score = map.size * 1000 + sheet.rows.length;
    if (!best || score > best.score) best = { sheet, score };
  }
  return best?.sheet;
}

/** Turns the rows of a tag export into catalog entries. */
export function plcVariablesFromSheet(sheet: WorkbookSheet): TagImportResult {
  const map = headerMap(sheet.rows[0] ?? []);
  const nameColumns = map.get("name");
  if (!nameColumns) throw new Error("Il foglio non ha una colonna «Name» con i nomi delle variabili.");
  const at = (row: string[], field: string) => {
    for (const index of map.get(field) ?? []) {
      const value = cell(row[index]);
      if (value) return value;
    }
    return "";
  };
  const variables: PlcVariableDefinition[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  // A sheet without that column says nothing about which tags are connected, so there every row is
  // taken: the rule is "no PLC tag written", not "no such column".
  const hasPlcTagColumn = Boolean(map.get("plcTag"));
  let withoutPlcTag = 0;
  for (const row of sheet.rows.slice(1)) {
    const name = at(row, "name");
    if (!name) continue;
    if (hasPlcTagColumn && !at(row, "plcTag")) { withoutPlcTag += 1; continue; }
    if (!isPlcVariableName(name)) { skipped.push(name); continue; }
    if (seen.has(name)) continue;
    seen.add(name);
    variables.push({
      name,
      dataType: at(row, "dataType"),
      // The export says how a tag is reached, never in which direction it is used: an HMI tag is
      // readable and writable, and narrowing that here would be the editor's guess, not the file's.
      access: "read-write",
      address: at(row, "address"),
      description: at(row, "description"),
      ...(at(row, "table") ? { table: at(row, "table") } : {}),
      ...(at(row, "connection") ? { connection: at(row, "connection") } : {}),
      ...(at(row, "cycle") ? { cycle: at(row, "cycle") } : {}),
    });
  }
  return { variables, skipped, withoutPlcTag };
}

export interface CatalogMerge {
  variables: PlcVariableDefinition[];
  added: number;
  updated: number;
}

/** Puts an import on top of the catalog that is already there. What the file knows wins, what only
 * the project knows — a description written by hand, an access the user narrowed — is kept. */
export function mergeImportedVariables(catalog: PlcVariableDefinition[], imported: PlcVariableDefinition[]): CatalogMerge {
  const merged = new Map(catalog.map((variable) => [variable.name, { ...variable }]));
  let added = 0;
  let updated = 0;
  for (const variable of imported) {
    const current = merged.get(variable.name);
    if (!current) {
      merged.set(variable.name, variable);
      added += 1;
      continue;
    }
    const next: PlcVariableDefinition = {
      ...current,
      dataType: variable.dataType || current.dataType,
      address: variable.address || current.address,
      description: current.description || variable.description,
      ...(variable.table ? { table: variable.table } : {}),
      ...(variable.connection ? { connection: variable.connection } : {}),
      ...(variable.cycle ? { cycle: variable.cycle } : {}),
      detected: false,
    };
    if (JSON.stringify(next) !== JSON.stringify(current)) updated += 1;
    merged.set(variable.name, next);
  }
  return { variables: [...merged.values()].sort((left, right) => left.name.localeCompare(right.name)), added, updated };
}

/** The signals a table is asking for: the ones whose name — or whose tag table — carries the word
 * the user typed. "Alarm" is the one that matters on these panels, and it is only a default. */
export function plcVariablesMatching(variables: PlcVariableDefinition[], filter: string): PlcVariableDefinition[] {
  const needle = filter.trim().toLowerCase();
  if (!needle) return [];
  return variables.filter((variable) => variable.name.toLowerCase().includes(needle) || (variable.table ?? "").toLowerCase().includes(needle));
}

/** Which value of a signal belongs under a column of the table, by the name that column has in the
 * data. Only what the export really contains is written: the time an alarm went off and its
 * category arrive from the PLC while the panel runs, so they are left for it to fill. */
const rowFields: { keys: string[]; of: (variable: PlcVariableDefinition) => string }[] = [
  { keys: ["id", "tag", "name", "key", "variable", "variabile", "signal", "segnale", "plcvariable", "plctag"], of: (variable) => variable.name },
  { keys: ["text", "testo", "label", "etichetta", "message", "messaggio", "description", "descrizione", "title", "titolo"], of: (variable) => variable.description || variable.name },
  { keys: ["unit", "unitname", "group", "gruppo", "table", "tabella", "area", "zone", "zona"], of: (variable) => variable.table ?? "" },
  { keys: ["address", "indirizzo"], of: (variable) => variable.address },
  { keys: ["type", "datatype", "tipo"], of: (variable) => variable.dataType },
];

const tagKeys = new Set(rowFields[0].keys);

/** Builds the rows of a data-driven table from the catalog, keeping the shape the table already
 * has: the same keys, in the same order, so the panel keeps rendering exactly as it did. */
export function listRowsFromVariables(variables: PlcVariableDefinition[], keys: string[]): Record<string, string>[] {
  const normalized = keys.map((key) => key.toLowerCase().replace(/[^a-z]/g, ""));
  const carriesTag = normalized.some((key) => tagKeys.has(key));
  return variables.map((variable) => {
    const row: Record<string, string> = {};
    keys.forEach((key, index) => {
      const field = rowFields.find((candidate) => candidate.keys.includes(normalized[index]));
      row[key] = field ? field.of(variable) : "";
    });
    // A table whose columns say nothing about which signal a row is would lose the binding entirely.
    if (!carriesTag) row.plcVariable = variable.name;
    return row;
  });
}
