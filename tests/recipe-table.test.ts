import { describe, expect, it } from "vitest";
import { exportRecipeTable, mapRecipeTable, parseRecipeTable, suggestRecipeTableMapping } from "../runtime/recipe-table.mjs";
import { previewRecipeRecords } from "../runtime/recipe-exchange.mjs";
import type { RecipeSchema } from "../runtime/recipe-catalog.mjs";

const schema: RecipeSchema = { id: "format", name: "Formato", fields: [{ id: "i", name: "Intero", type: "integer", minimum: -10, maximum: 10 }, { id: "n", name: "Numero", type: "number" }, { id: "b", name: "Booleano", type: "boolean" }, { id: "t", name: "Testo", type: "string", maxLength: 200 }], records: [{ id: "r", name: "Originale", values: { i: 1, n: 2.5, b: true, t: "prima" } }] };
const generic = (row = 'new\tNuova\t0\t12.5\tfalse\t') => parseRecipeTable("id\tname\ti\tn\tb\tt\r\n" + row + "\r\n");
const mapped = (row: string) => { const table = generic(row); return mapRecipeTable(schema, table, suggestRecipeTableMapping(schema, table)); };

describe("recipe TSV parsing and mapping", () => {
  it("round trips exact scalars, empty text, Unicode, quotes, tabs, CR/LF, backslashes and formula-like strings", () => {
    const special = { ...schema, records: ["", '=IMPORTXML("url")', "+SUM(1)", "-2+1", "@command", "\t=CMD()", "\r=CMD()", "é 漢字\t\r\n\"\\text:\""].map((t, index) => ({ id: "r" + index, name: "=Nome " + index, values: { i: 0, n: 1e-20, b: false, t } })) };
    const source = exportRecipeTable(special), table = parseRecipeTable(source);
    expect(table).toMatchObject({ format: "framecraft", schemaId: "format" });
    expect(mapRecipeTable(schema, table, suggestRecipeTableMapping(schema, table))).toEqual(special.records);
    // Even after standard spreadsheet quote removal, text cells start with text:, never a formula prefix.
    expect(table.rows.every(row => row[1].startsWith('text:"') && row[5].startsWith('text:"'))).toBe(true);
    expect(source.startsWith("\uFEFFframecraft.recipes.tsv\t1\tformat\r\n")).toBe(true);
  });
  it("reads BOM, CRLF/LF, doubled quotes, embedded newlines and trailing empty cells without trimming", () => {
    const table = parseRecipeTable('\uFEFFid\tname\ti\tn\tb\tt\nnew\tNuova\t0\t0\tfalse\t" \"\"test\"\"\r\n "\n');
    expect(mapRecipeTable(schema, table, suggestRecipeTableMapping(schema, table))[0].values.t).toBe(' "test"\r\n ');
    expect(mapRecipeTable(schema, generic(), suggestRecipeTableMapping(schema, generic()))[0].values).toEqual({ i: 0, n: 12.5, b: false, t: "" });
  });
  it("maps reordered/custom columns explicitly, including ID/name field collisions", () => {
    const table = parseRecipeTable("Testo\tCodice\tDecimale\tNome formato\tBooleano\tIntero\nabc\tx\t12,5\tNuova\ttrue\t2");
    const mapping = { idColumn: 1, nameColumn: 3, fields: { i: 5, n: 2, b: 4, t: 0 }, decimal: "," as const, ignoreExtraColumns: false };
    expect(mapRecipeTable(schema, table, mapping)[0]).toEqual({ id: "x", name: "Nuova", values: { i: 2, n: 12.5, b: true, t: "abc" } });
    const colliding: RecipeSchema = { ...schema, fields: [{ id: "id", name: "Campo ID", type: "string" }, { id: "name", name: "Campo nome", type: "string" }], records: [{ id: "r", name: "Originale", values: { id: "valore", name: "altro" } }] };
    const exported = parseRecipeTable(exportRecipeTable(colliding)); expect(mapRecipeTable(colliding, exported, suggestRecipeTableMapping(colliding, exported))).toEqual(colliding.records);
  });
  it("requires explicit permission to ignore unused columns and unique complete assignments", () => {
    const table = parseRecipeTable("id\tname\ti\tn\tb\tt\textra\nnew\tNuova\t0\t0\tfalse\t\tignored"), mapping = suggestRecipeTableMapping(schema, table);
    expect(() => mapRecipeTable(schema, table, mapping)).toThrowError(expect.objectContaining({ code: "RECIPE_TABLE_MAPPING" }));
    expect(mapRecipeTable(schema, table, { ...mapping, ignoreExtraColumns: true })).toHaveLength(1);
    for (const bad of [{ ...mapping, idColumn: -1 }, { ...mapping, nameColumn: 0 }, { ...mapping, fields: { ...mapping.fields, t: 99 } }, { ...mapping, fields: { i: 2, n: 3, b: 4 } }, { ...mapping, decimal: "auto" }]) expect(() => mapRecipeTable(schema, table, bad as any)).toThrow();
  });
  it.each(["", "id\tid\nx\ty", "ID\tid\nx\ty", "é\te\u0301\nx\ty", " id\tname\nx\ty", "a\tb\nx", "a\nb\tc", 'a\nb"c', 'a\n"b"x', 'a\n"b', "a\n\0", "a\n" + "x".repeat(8193), "a".repeat(2_000_001)])("rejects malformed/ambiguous/oversized tables", source => {
    expect(() => parseRecipeTable(source)).toThrowError(expect.objectContaining({ code: "RECIPE_TABLE_FORMAT" }));
  });
  it("bounds rows/columns without silently dropping records and permits empty export for an empty archive", () => {
    const headers = Array.from({ length: 128 }, (_, i) => "c" + i).join("\t"); expect(parseRecipeTable(headers).columns).toHaveLength(128);
    expect(() => parseRecipeTable(headers + "\textra")).toThrow();
    expect(parseRecipeTable("a\n" + Array.from({ length: 500 }, () => "x\n").join("")).rows).toHaveLength(500);
    expect(() => parseRecipeTable("a\n" + Array.from({ length: 501 }, () => "x\n").join(""))).toThrow();
    const table = parseRecipeTable(exportRecipeTable({ ...schema, records: [] })); expect(mapRecipeTable(schema, table, suggestRecipeTableMapping(schema, table))).toEqual([]);
  });
  it("checks the declared schema/version and refuses to remove text encoding or change decimal mode", () => {
    expect(() => parseRecipeTable("framecraft.recipes.tsv\t2\tformat\nid")).toThrow();
    const table = parseRecipeTable(exportRecipeTable(schema)), mapping = suggestRecipeTableMapping(schema, table);
    expect(() => mapRecipeTable({ ...schema, id: "different" }, table, mapping)).toThrowError(expect.objectContaining({ code: "RECIPE_FILE_SCHEMA" }));
    expect(() => mapRecipeTable(schema, table, { ...mapping, decimal: "," })).toThrow();
    table.rows[0][5] = "unencoded"; expect(() => mapRecipeTable(schema, table, mapping)).toThrowError(expect.objectContaining({ row: 1, column: "value.t" }));
  });
  it.each(["new\tNuova\t1.1\t0\tfalse\t", "new\tNuova\t1e0\t0\tfalse\t", "new\tNuova\t11\t0\tfalse\t", "new\tNuova\t0\t1e309\tfalse\t", "new\tNuova\t0\t1e-999\tfalse\t", "new\tNuova\t0\tNaN\tfalse\t", "new\tNuova\t0\t\tfalse\t", "new\tNuova\t0\t 1 \tfalse\t", "new\tNuova\t0\t1,000\tfalse\t", "new\tNuova\t0\t0\t1\t", "new\tNuova\t0\t0\tTRUE\t", "new\tNuova\t0\t0\tfalse\t" + "x".repeat(201)])("rejects invalid scalar values with a row/column, without including the value in the error", row => {
    expect(() => mapped(row)).toThrowError(expect.objectContaining({ code: "RECIPE_TABLE_VALUE", row: 1, column: expect.any(String) }));
  });
  it("rejects unsafe integers, duplicate IDs/names and names with hidden controls", () => {
    const loose = { ...schema, fields: schema.fields.map(field => field.id === "i" ? { id: "i", name: "Intero", type: "integer" as const } : field) }, table = generic("new\tNuova\t9007199254740993\t0\tfalse\t");
    expect(() => mapRecipeTable(loose, table, suggestRecipeTableMapping(loose, table))).toThrow();
    for (const row of ["new\tSeconda", "other\tNuova", "other\tNuov\u202ea"]) {
      const value = generic("new\tNuova\t0\t0\tfalse\t\n" + row + "\t0\t0\tfalse\t"); expect(() => mapRecipeTable(schema, value, suggestRecipeTableMapping(schema, value))).toThrowError(expect.objectContaining({ row: 2 }));
    }
  });
  it("feeds the same merge preview, preserving omitted records and detecting collisions before any mutation", () => {
    const table = generic(), records = mapRecipeTable(schema, table, suggestRecipeTableMapping(schema, table)), before = structuredClone(schema);
    expect(previewRecipeRecords(schema, schema.fields, records)).toMatchObject({ kept: 1, total: 2, changes: [{ kind: "create" }] });
    expect(schema).toEqual(before); records[0].name = "Originale";
    expect(() => previewRecipeRecords(schema, schema.fields, records)).toThrowError(expect.objectContaining({ code: "RECIPE_EXISTS" }));
  });
});
