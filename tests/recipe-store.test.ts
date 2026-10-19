import { mkdir, mkdtemp, readFile, writeFile, unlink, link, symlink, utimes } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecipeStoreError, parseRecipeCatalog, parseRecipeCommand, type RecipeCatalog, type RecipeCommand } from "../runtime/recipe-catalog.mjs";
import { openRecipeStore, type RecipeStore } from "../runtime/recipe-store.mjs";

const faults = vi.hoisted(() => ({ rename: "" }));
vi.mock("node:fs/promises", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return { ...fs, rename: async (...args: Parameters<typeof fs.rename>) => {
    if (faults.rename === "before") throw Object.assign(new Error("PRIVATE_STORAGE_DETAIL"), { code: "EIO" });
    const result = await fs.rename(...args); if (faults.rename === "after") throw Object.assign(new Error("PRIVATE_STORAGE_DETAIL"), { code: "EIO" }); return result;
  } };
});
afterEach(() => { faults.rename = ""; });
export function catalog(): RecipeCatalog { return { version: 1, schemas: [{ id: "format", name: "Formati sintetici", fields: [
  { id: "speed", name: "Velocità", type: "number", minimum: 0, maximum: 120, unit: "rpm" },
  { id: "count", name: "Numero", type: "integer", minimum: 0, maximum: 100 }, { id: "enabled", name: "Abilitato", type: "boolean" }, { id: "label", name: "Etichetta", type: "string", maxLength: 32 },
], records: [{ id: "r1", name: "Formato A", values: { speed: 10.5, count: 3, enabled: false, label: "lotto sintetico" } }] }] }; }
let serial = 0;
const actor = "subject:test-operator";
function command(revision: string, action: RecipeCommand["action"] = "update", extra: Partial<RecipeCommand> = {}): RecipeCommand { return { id: "recipe_" + String(++serial).padStart(16, "0"), expectedRevision: revision, action, schemaId: "format", recordId: "r1", ...(["create", "update"].includes(action) ? { name: "Formato A", values: { speed: 15, count: 4, enabled: true, label: "lotto" } } : {}), ...extra }; }
async function fixture() { const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "recipe-store-")), directory = path.join(root, "data"), seed = catalog(); const store = await openRecipeStore({ directory, catalog: seed }); return { root, directory, seed, store }; }

describe("contratto ricette tipizzato", () => {
  it("valida senza creare dati o convertire tipi e conserva solo campi previsti", () => {
    const seed = catalog(); expect(parseRecipeCatalog(JSON.stringify(seed))).toEqual(seed);
    expect(parseRecipeCatalog({ version: 1, schemas: [] })).toEqual({ version: 1, schemas: [] });
    expect(parseRecipeCatalog(seed).schemas[0].records[0].values.enabled).toBe(false);
  });
  it.each([
    ["numero testuale", { speed: "15" }], ["booleano numerico", { enabled: 1 }], ["intero decimale", { count: 2.5 }], ["limite superiore", { speed: 121 }], ["limite inferiore", { speed: -1 }], ["intero non sicuro", { count: Number.MAX_SAFE_INTEGER + 1 }], ["testo troppo lungo", { label: "x".repeat(33) }], ["campo mancante", { enabled: undefined }], ["campo extra", { extra: 3 }],
  ])("rifiuta %s senza valori predefiniti", (_name, change) => {
    const seed = catalog(); Object.assign(seed.schemas[0].records[0].values, change); expect(() => parseRecipeCatalog(seed)).toThrow();
  });
  it("rifiuta schema sconosciuto, campi duplicati, prototipi, nomi equivalenti e limiti incoerenti", () => {
    for (const change of [(seed: RecipeCatalog) => { seed.version = 2 as 1; }, (seed: RecipeCatalog) => { seed.schemas[0].fields.push(seed.schemas[0].fields[0]); }, (seed: RecipeCatalog) => { seed.schemas[0].fields[0].id = "constructor"; }, (seed: RecipeCatalog) => { seed.schemas[0].records.push({ ...seed.schemas[0].records[0], id: "r2", name: "formato a" }); }, (seed: RecipeCatalog) => { seed.schemas[0].fields[0].maximum = -1; }]) { const seed = catalog(); change(seed); expect(() => parseRecipeCatalog(seed)).toThrow(); }
    expect(() => parseRecipeCatalog({ ...catalog(), endpoint: "PRIVATE" })).toThrow(); expect(() => parseRecipeCatalog("PRIVATE_BROKEN_JSON")).toThrow();
  });
  it("rifiuta azioni/chiavi inattese e proprietà richieste con valore undefined", () => {
    const valid = command("a".repeat(64));
    for (const changed of [{ action: ["update"] }, { expectedRevision: "old" }, { path: "../../private" }, { actor: "admin" }, { plcConfirmed: true }, { name: undefined }, { values: undefined }]) expect(() => parseRecipeCommand({ ...valid, ...changed })).toThrow();
    expect(() => parseRecipeCommand(command("a".repeat(64), "copy", { name: "Copia", targetId: undefined }))).toThrow();
    expect(() => parseRecipeCommand(command("a".repeat(64), "delete", { values: {} }))).toThrow();
    expect(() => parseRecipeCatalog(" ".repeat(2_000_001))).toThrow();
  });
  it("codici errore inattesi non ereditano proprietà o espongono dati tecnici", () => {
    for (const code of ["constructor", "__proto__", "PRIVATE_UNKNOWN"]) expect(new RecipeStoreError(code)).toMatchObject({ code: "RECIPE_STORAGE", status: 503 });
  });
});

describe("archivio ricette persistente su disco locale", () => {
  it("carica solo i valori iniziali reali e separa copia, rinomina, modifica, creazione ed eliminazione", async () => {
    const { store } = await fixture(); let snapshot = await store.snapshot(); expect(snapshot.schemas[0].records).toHaveLength(1);
    const run = async (action: RecipeCommand["action"], extra: Partial<RecipeCommand>) => { const result = await store.mutate(command(snapshot.revision, action, extra), actor); expect(result).toMatchObject({ duplicate: false, effect: "recipe-storage-only", plcConfirmed: false }); snapshot = result.snapshot; };
    await run("copy", { name: "Copia B", targetId: "r2" }); expect(snapshot.schemas[0].records[1].values).toEqual(snapshot.schemas[0].records[0].values);
    await run("rename", { recordId: "r2", name: "Formato B" });
    await run("update", { recordId: "r2", name: "Formato B", values: { speed: 20, count: 8, enabled: false, label: "B" } });
    await run("create", { recordId: "r3", name: "Formato C" });
    await run("delete", { recordId: "r1" });
    expect(snapshot.sequence).toBe(5); expect(snapshot.schemas[0].records.map(record => record.id)).toEqual(["r2", "r3"]); expect(snapshot.schemas[0].records[0].values.speed).toBe(20);
  });
  it("rifiuta modifiche concorrenti obsolete senza perdere i valori scritti dall’altro operatore", async () => {
    const { store } = await fixture(), original = await store.snapshot();
    await store.mutate(command(original.revision), actor);
    await expect(store.mutate(command(original.revision, "rename", { name: "Obsoleto" }), "subject:other")).rejects.toMatchObject({ code: "RECIPE_CONFLICT" });
    expect((await store.snapshot()).schemas[0].records[0].values.speed).toBe(15);
  });
  it("un solo writer avanza e non accoda/riprova automaticamente le altre operazioni", async () => {
    const { store } = await fixture(), original = await store.snapshot();
    const result = await Promise.allSettled([store.mutate(command(original.revision), actor), store.mutate(command(original.revision), actor)]);
    expect(result.filter(item => item.status === "fulfilled")).toHaveLength(1); expect(result.find(item => item.status === "rejected")).toMatchObject({ reason: { code: "RECIPE_BUSY" } }); expect((await store.snapshot()).sequence).toBe(1);
  });
  it("due istanze indipendenti sullo stesso archivio non possono entrambe applicare la stessa revisione", async () => {
    const { store, directory, seed } = await fixture(), other = await openRecipeStore({ directory, catalog: seed }), snapshot = await store.snapshot();
    const results = await Promise.allSettled([store.mutate(command(snapshot.revision), actor), other.mutate(command(snapshot.revision), "subject:other")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find(result => result.status === "rejected") as PromiseRejectedResult; expect(["RECIPE_BUSY", "RECIPE_CONFLICT"]).toContain(failure.reason.code);
    expect((await store.snapshot()).sequence).toBe(1);
  });
  it("deduplica la stessa operazione anche dopo riapertura e la vincola al soggetto autenticato", async () => {
    const { store, directory, seed } = await fixture(), initial = await store.snapshot(), request = command(initial.revision);
    await store.mutate(request, actor); const reopened = await openRecipeStore({ directory, catalog: seed });
    const replay = await reopened.mutate(request, actor); expect(replay.duplicate).toBe(true); expect(replay.appliedSequence).toBe(1); expect(replay.snapshot.sequence).toBe(1);
    await expect(reopened.mutate(request, "subject:other")).rejects.toMatchObject({ code: "RECIPE_CONFLICT" }); await expect(reopened.mutate({ ...request, name: "Diverso" }, actor)).rejects.toMatchObject({ code: "RECIPE_CONFLICT" });
  });
  it("non sovrascrive file corrotti, mancanti o schemi cambiati con i valori iniziali", async () => {
    const { store, directory, seed } = await fixture(), file = path.join(directory, "recipes.json");
    const changed = catalog(); changed.schemas[0].fields[0].maximum = 200;
    await expect(openRecipeStore({ directory, catalog: changed })).rejects.toMatchObject({ code: "RECIPE_SCHEMA" });
    await writeFile(file, "PRIVATE_CORRUPT_CONTENT"); await expect(store.snapshot()).rejects.toMatchObject({ code: "RECIPE_CORRUPT" }); await expect(openRecipeStore({ directory, catalog: seed })).rejects.toMatchObject({ code: "RECIPE_CORRUPT" }); expect(await readFile(file, "utf8")).toBe("PRIVATE_CORRUPT_CONTENT");
    await unlink(file); await expect(openRecipeStore({ directory, catalog: seed })).rejects.toMatchObject({ code: "RECIPE_CORRUPT" });
  });
  it("rifiuta lock abbandonati senza inferire che il processo sia morto dall’età del file", async () => {
    const { directory, seed } = await fixture(), lock = path.join(directory, "recipes.lock");
    await writeFile(lock, "LOCK_SYNTHETIC"); await utimes(lock, new Date(0), new Date(0));
    await expect(openRecipeStore({ directory, catalog: seed })).rejects.toMatchObject({ code: "RECIPE_BUSY" }); expect(await readFile(lock, "utf8")).toBe("LOCK_SYNTHETIC");
  });
  it("non reinizializza dati senza identificativo o cartelle non vuote", async () => {
    const { root, directory, seed } = await fixture(), file = path.join(directory, "recipes.json"), before = await readFile(file, "utf8");
    await unlink(path.join(directory, "store.id"));
    await expect(openRecipeStore({ directory, catalog: seed })).rejects.toMatchObject({ code: "RECIPE_CORRUPT" });
    expect(await readFile(file, "utf8")).toBe(before); await expect(readFile(path.join(directory, "store.id"))).rejects.toMatchObject({ code: "ENOENT" });
    const occupied = path.join(root, "occupied"); await mkdir(occupied); await writeFile(path.join(occupied, "retain.txt"), "SYNTHETIC_EXISTING_DATA");
    await expect(openRecipeStore({ directory: occupied, catalog: seed })).rejects.toMatchObject({ code: "RECIPE_CORRUPT" });
    expect(await readFile(path.join(occupied, "retain.txt"), "utf8")).toBe("SYNTHETIC_EXISTING_DATA");
    await expect(readFile(path.join(occupied, "recipes.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rifiuta junction/symlink della directory e hard link dei dati", async () => {
    const { root, directory, seed, store } = await fixture(), alias = path.join(root, "alias");
    await symlink(directory, alias, process.platform === "win32" ? "junction" : "dir");
    await expect(openRecipeStore({ directory: alias, catalog: seed })).rejects.toMatchObject({ code: "RECIPE_STORAGE" });
    await link(path.join(directory, "recipes.json"), path.join(root, "linked-data.json"));
    await expect(store.snapshot()).rejects.toMatchObject({ code: "RECIPE_STORAGE" });
  });
  it("non crea sottocartelle attraverso un genitore che è una junction/symlink", async () => {
    const { root, directory, seed } = await fixture(), alias = path.join(root, "parent-alias");
    await symlink(directory, alias, process.platform === "win32" ? "junction" : "dir");
    await expect(openRecipeStore({ directory: path.join(alias, "must-not-create"), catalog: seed })).rejects.toMatchObject({ code: "RECIPE_STORAGE" });
    await expect(readFile(path.join(directory, "must-not-create/recipes.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it.each(["before", "after"])("gestisce errore %s rename senza ripetere il salvataggio o perdere ricevute persistite", async stage => {
    const { store, directory, seed } = await fixture(), original = await store.snapshot(), request = command(original.revision);
    faults.rename = stage; await expect(store.mutate(request, actor)).rejects.toMatchObject({ code: "RECIPE_UNCERTAIN" }); faults.rename = "";
    const reopened = await openRecipeStore({ directory, catalog: seed }), snapshot = await reopened.snapshot();
    expect(snapshot.sequence).toBe(stage === "after" ? 1 : 0);
    const result = await reopened.mutate(request, actor); expect(result.duplicate).toBe(stage === "after"); expect(result.snapshot.sequence).toBe(1);
  });
  it("valori, identità, nomi duplicati e destinazioni errate non modificano il file", async () => {
    const { store, directory } = await fixture(), original = await store.snapshot(), before = await readFile(path.join(directory, "recipes.json"), "utf8");
    await expect(store.mutate(command(original.revision), "")).rejects.toMatchObject({ code: "RECIPE_AUTH" });
    await expect(store.mutate(command(original.revision, "copy", { name: "FORMATO A", targetId: "r2" }), actor)).rejects.toMatchObject({ code: "RECIPE_EXISTS" });
    await expect(store.mutate(command(original.revision, "delete", { recordId: "missing" }), actor)).rejects.toMatchObject({ code: "RECIPE_MISSING" });
    await expect(store.mutate(command(original.revision, "update", { values: { speed: 121, count: 1, enabled: true, label: "PRIVATE_VALUE" } }), actor)).rejects.toMatchObject({ code: "RECIPE_VALUE", fieldId: "speed" });
    expect(await readFile(path.join(directory, "recipes.json"), "utf8")).toBe(before);
  });
  it("risultati e callback non espongono valori nei log e non possono mutare l’archivio", async () => {
    const { directory, seed } = await fixture(), events: unknown[] = []; let observedPid: number | undefined;
    const store: RecipeStore = await openRecipeStore({ directory, catalog: seed, onChange: event => { observedPid = JSON.parse(readFileSync(path.join(directory, "recipes.lock"), "utf8")).pid; events.push(event); throw new Error("PRIVATE_LOG_ERROR"); } });
    const initial = await store.snapshot(); initial.schemas[0].records[0].values.speed = 999; initial.schemas[0].fields[0].maximum = 999;
    const result = await store.mutate(command(initial.revision), actor); expect(observedPid).toBe(process.pid); expect(result.snapshot.schemas[0].fields[0].maximum).toBe(120); expect(events).toHaveLength(1); expect(JSON.stringify(events)).not.toContain("values");
    result.snapshot.schemas[0].records.length = 0; expect((await store.snapshot()).schemas[0].records).toHaveLength(1);
  });
});
