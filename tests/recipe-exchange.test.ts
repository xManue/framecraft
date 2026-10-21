import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exportRecipeFile, parseRecipeFile, previewRecipeImport, mergeRecipeRecords } from "../runtime/recipe-exchange.mjs";
import { parseRecipeCommand, type RecipeSchema } from "../runtime/recipe-catalog.mjs";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
const schema: RecipeSchema = { id: "format", name: "Formato sintetico", fields: [{ id: "n", name: "Numero", type: "integer", minimum: 0, maximum: 10 }, { id: "b", name: "Booleano", type: "boolean" }, { id: "t", name: "Testo", type: "string", maxLength: 100 }], records: [{ id: "r1", name: "Primo", values: { n: 1, b: true, t: "iniziale" } }, { id: "r2", name: "Conservato", values: { n: 2, b: false, t: "" } }] };
const source = { revision: "a".repeat(64), sequence: 20, exportedAt: "2026-10-21T10:00:00.000Z" };
const incoming = () => ({ ...structuredClone(schema), records: [{ id: "r1", name: "Primo rinominato", values: { n: 0, b: false, t: "" } }, { id: "r3", name: "Nuovo", values: { n: 3, b: true, t: '=IMPORTXML("x")\t\né <b>test</b>' } }] });
describe("portable recipe files", () => {
  it("round trips exact types, Unicode, empty/false/zero and strings without evaluating formulas or HTML", () => {
    const value = incoming(), text = exportRecipeFile(value, source), parsed = parseRecipeFile("\uFEFF" + text);
    expect(parsed.schema).toEqual(value); expect(parsed.source).toEqual(source);
    expect(Object.keys(parsed)).toEqual(["format", "version", "source", "schema"]); expect(text).not.toContain("password");
  });
  it.each(["{}", '{"format":"framecraft.recipes","version":2}', "not JSON", "x".repeat(2_000_001)])("rejects malformed/unsupported/oversized data", text => { expect(() => parseRecipeFile(text)).toThrow(); });
  it("does not allow hidden metadata, missing fields, duplicate IDs/names or unsafe numbers", () => {
    const base = JSON.parse(exportRecipeFile(incoming(), source));
    for (const mutate of [
      (v: any) => { v.secret = "hidden"; }, (v: any) => { v.schema.fields[0].tag = "hidden"; },
      (v: any) => { delete v.schema.records[0].values.b; }, (v: any) => { v.schema.records[0].values.n = "0"; },
      (v: any) => { v.schema.records.push(v.schema.records[0]); }, (v: any) => { v.schema.records[1].name = v.schema.records[0].name; },
      (v: any) => { v.source.exportedAt = "bad"; }, (v: any) => { v.source.sequence = -1; },
    ]) { const value = structuredClone(base); mutate(value); expect(() => parseRecipeFile(JSON.stringify(value))).toThrow(); }
  });
  it("previews ID-based updates and creates without removing omitted records", () => {
    const before = JSON.stringify(schema), preview = previewRecipeImport(schema, parseRecipeFile(exportRecipeFile(incoming(), source)));
    expect(preview).toMatchObject({ kept: 1, total: 3, changes: [{ kind: "update", id: "r1" }, { kind: "create", id: "r3" }] });
    expect(JSON.stringify(schema)).toBe(before); expect(preview.changes[0].before!.values.n).toBe(1);
    expect(mergeRecipeRecords(schema, schema.fields, incoming().records).find(record => record.id === "r2")).toEqual(schema.records[1]);
  });
  it("detects unchanged records independent of value object key order", () => {
    const unchanged = { ...schema, records: [{ ...schema.records[0], values: { t: "iniziale", b: true, n: 1 } }] };
    expect(previewRecipeImport(schema, parseRecipeFile(exportRecipeFile(unchanged, source))).changes[0].kind).toBe("unchanged");
  });
  it("rejects schema ID/type/unit/limits/order changes and name collisions with kept records", () => {
    const file = parseRecipeFile(exportRecipeFile(incoming(), source));
    for (const mutate of [(v: any) => { v.schema.id = "other"; }, (v: any) => { v.schema.fields[0].maximum = 11; }, (v: any) => { v.schema.fields.reverse(); }, (v: any) => { v.schema.fields[0].unit = "rpm"; }, (v: any) => { v.schema.records[0].name = "Conservato"; }]) { const value = structuredClone(file); mutate(value); expect(() => previewRecipeImport(schema, value)).toThrow(); }
  });
  it("rejects an import command disguised as an ordinary mutation or with no records", () => {
    const command = { id: "import_command_000001", expectedRevision: source.revision, action: "import", schemaId: schema.id, recordId: "batch", fields: schema.fields, records: incoming().records };
    expect(parseRecipeCommand(command).records).toEqual(incoming().records);
    for (const patch of [{ recordId: "r1" }, { records: [] }, { actor: "admin" }, { name: "hidden" }, { action: "update" }]) expect(() => parseRecipeCommand({ ...command, ...patch })).toThrow();
  });
});
describe("atomic archive import", () => {
  it("rejects a valid individual batch if the merged archive would become unreadable", async () => {
    const fields = Array.from({ length: 64 }, (_, i) => ({ id: "f" + i, name: "Campo " + i, type: "string" as const })), values = Object.fromEntries(fields.map(field => [field.id, "界".repeat(1000)]));
    const records = Array.from({ length: 12 }, (_, i) => ({ id: "r" + i, name: "Ricetta " + i, values }));
    const catalog = { version: 1 as const, schemas: [{ id: "s", name: "Schema", fields, records: records.slice(0, 4) }] };
    const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, "recipe-import-size-")), store = await openRecipeStore({ directory, catalog }), before = await store.snapshot();
    await expect(store.mutate({ id: "import_oversized_archive_001", expectedRevision: before.revision, action: "import", schemaId: "s", recordId: "batch", fields, records: records.slice(4) }, "synthetic:operator")).rejects.toMatchObject({ code: "RECIPE_LIMIT" });
    expect((await store.snapshot()).sequence).toBe(0); expect((await store.snapshot()).schemas[0].records).toHaveLength(4);
  });
  async function fixture() { const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, "recipe-import-")), catalog = { version: 1 as const, schemas: [schema] }, store = await openRecipeStore({ directory, catalog }), snapshot = await store.snapshot(); const command = { id: "import_atomic_command_00001", expectedRevision: snapshot.revision, action: "import" as const, schemaId: schema.id, recordId: "batch", fields: schema.fields, records: incoming().records }; return { directory, catalog, store, command }; }
  it("commits all records once, survives reopen and deduplicates the exact request", async () => {
    const test = await fixture(), result = await test.store.mutate(test.command, "synthetic:operator"); expect(result.snapshot.sequence).toBe(1); expect(result.snapshot.schemas[0].records).toHaveLength(3);
    const reopened = await openRecipeStore({ directory: test.directory, catalog: test.catalog });
    expect((await reopened.mutate(test.command, "synthetic:operator")).duplicate).toBe(true); expect((await reopened.snapshot()).sequence).toBe(1);
    await expect(reopened.mutate(test.command, "different:operator")).rejects.toMatchObject({ code: "RECIPE_CONFLICT" });
  });
  it("does not partially change even the first record when a later record is invalid", async () => {
    const test = await fixture(), before = await readFile(path.join(test.directory, "recipes.json"), "utf8");
    const invalid = structuredClone(test.command); invalid.records[1].values.n = 11;
    await expect(test.store.mutate(invalid, "synthetic:operator")).rejects.toMatchObject({ code: "RECIPE_VALUE" });
    expect(await readFile(path.join(test.directory, "recipes.json"), "utf8")).toBe(before);
  });
  it("rejects stale revision, mismatched fields and merge name collisions without losing records", async () => {
    const test = await fixture();
    await expect(test.store.mutate({ ...test.command, expectedRevision: "0".repeat(64) }, "synthetic:operator")).rejects.toMatchObject({ code: "RECIPE_CONFLICT" });
    await expect(test.store.mutate({ ...test.command, fields: test.command.fields.map(field => field.id === "n" ? { ...field, maximum: 11 } : field) }, "synthetic:operator")).rejects.toMatchObject({ code: "RECIPE_FILE_SCHEMA" });
    const records = incoming().records; records[1].name = "Conservato";
    await expect(test.store.mutate({ ...test.command, records }, "synthetic:operator")).rejects.toMatchObject({ code: "RECIPE_EXISTS" });
    expect((await test.store.snapshot()).sequence).toBe(0);
  });
});
