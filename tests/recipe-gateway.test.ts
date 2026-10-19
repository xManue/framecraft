import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import type { RecipeCatalog, RecipeCommand } from "../runtime/recipe-catalog.mjs";
const api = "/_framecraft/plc/v1/recipes", token = "recipe_gateway_test_token_01234567890123456789", origin = "http://127.0.0.1:4173";
type Authorize = (request: IncomingMessage, command: RecipeCommand | { action: "read" }) => string | undefined | Promise<string | undefined>;
let serial = 0;
async function fixture(authorize: Authorize | null = request => request.headers["x-test-actor"] === "operator" ? "subject:operator" : undefined, customCatalog?: RecipeCatalog) {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, "recipe-http-"));
  const catalog: RecipeCatalog = customCatalog ?? { version: 1, schemas: [{ id: "s1", name: "Schema sintetico", fields: [{ id: "speed", name: "Velocità", type: "number", minimum: 0, maximum: 100 }], records: [{ id: "r1", name: "Formato A", values: { speed: 10 } }] }] };
  const store = await openRecipeStore({ directory, catalog }), diagnostics: unknown[] = [];
  const gateway = createPlcGateway({ version: 1, connections: [], gateway: { enabled: true, port: 0, tokenEnv: "TEST_RECIPE_TOKEN", allowedOrigins: [origin], allowWrites: false } }, [], { resolveSecret: () => token, recipeStore: store, ...(authorize ? { authorizeRecipeAction: authorize } : {}), onRecipeDiagnostic: event => diagnostics.push(event) });
  await gateway.start();
  const request = (init: RequestInit = {}) => fetch(gateway.address + api, { ...init, headers: { Authorization: "Bearer " + token, Origin: origin, "X-Test-Actor": "operator", ...init.headers } });
  const snapshot = () => store.snapshot();
  const update = async (patch: Partial<RecipeCommand> = {}) => ({ id: "recipe_" + String(++serial).padStart(16, "0"), expectedRevision: (await snapshot()).revision, action: "update", schemaId: "s1", recordId: "r1", name: "Formato A", values: { speed: 20 }, ...patch });
  const post = (value: unknown, headers: Record<string, string> = {}) => request({ method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value) });
  return { gateway, store, directory, diagnostics, request, snapshot, update, post };
}
describe("API ricette sul gateway HTTP reale senza PLC", () => {
  it("nega letture e mutazioni senza autorizzazione server anche con token gateway valido", async () => {
    const test = await fixture(null); try {
      for (const response of [await test.request(), await test.post(await test.update())]) { expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ code: "RECIPE_AUTH", effect: "recipe-storage-only", plcConfirmed: false }); }
      expect((await test.snapshot()).sequence).toBe(0);
    } finally { await test.gateway.stop(); }
  });
  it("richiede anche token e origine prima di chiedere l’identità all’applicazione", async () => {
    const authorize = vi.fn<Authorize>().mockReturnValue("subject:operator"), test = await fixture(authorize); try {
      expect((await test.request({ headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
      expect((await test.request({ headers: { Origin: "https://untrusted.invalid" } })).status).toBe(403); expect(authorize).not.toHaveBeenCalled();
    } finally { await test.gateway.stop(); }
  });
  it("separa permessi di lettura e modifica, senza fidarsi di actor o privilegi nel JSON", async () => {
    const test = await fixture((_request, command) => command.action === "read" ? "subject:viewer" : undefined); try {
      expect((await test.request()).status).toBe(200); expect((await test.post(await test.update())).status).toBe(403);
      expect((await test.post({ ...await test.update(), actor: "admin", approved: true })).status).toBe(400); expect((await test.snapshot()).sequence).toBe(0);
    } finally { await test.gateway.stop(); }
  });
  it("modifica sul filesystem, ritorna una revisione nuova e rifiuta una scheda obsoleta", async () => {
    const test = await fixture(); try {
      const before = await (await test.request()).json(), command = await test.update();
      const result = await test.post(command); expect(result.status).toBe(200); const changed = await result.json();
      expect(changed).toMatchObject({ duplicate: false, plcConfirmed: false, effect: "recipe-storage-only", snapshot: { sequence: 1 } }); expect(changed.snapshot.revision).not.toBe(before.revision);
      const conflict = await test.post({ ...command, id: "other_command_0000001" }); expect(conflict.status).toBe(409); expect(await conflict.json()).toMatchObject({ code: "RECIPE_CONFLICT" });
      expect(JSON.parse(await readFile(path.join(test.directory, "recipes.json"), "utf8")).schemas[0].records[0].values.speed).toBe(20);
      const replay = await (await test.post(command)).json(); expect(replay.duplicate).toBe(true); expect(replay.snapshot.sequence).toBe(1); expect(test.gateway.snapshot().connections).toEqual([]);
    } finally { await test.gateway.stop(); }
  });
  it("non espone valori o errori del sistema identità nelle risposte e nei log diagnostici", async () => {
    const test = await fixture(() => { throw new Error("PRIVATE_IDENTITY_TOKEN"); }); try {
      const response = await test.post(await test.update({ name: "PRIVATE_RECIPE_NAME" })); expect(response.status).toBe(403);
      expect(JSON.stringify(await response.json())).not.toContain("PRIVATE"); expect(JSON.stringify(test.diagnostics)).not.toContain("PRIVATE");
    } finally { await test.gateway.stop(); }
  });
  it("non scrive valori fuori limite e restituisce il campo da correggere senza il dato", async () => {
    const test = await fixture(); try {
      const response = await test.post(await test.update({ values: { speed: 101 } })); expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ code: "RECIPE_VALUE", fieldId: "speed", outcome: "rejected" }); expect((await test.snapshot()).sequence).toBe(0);
      expect(JSON.stringify(test.diagnostics)).not.toContain("101");
    } finally { await test.gateway.stop(); }
  });
  it("accetta un aggiornamento Unicode valido oltre 128 KiB senza ereditare il limite dei comandi PLC", async () => {
    const fields = Array.from({ length: 64 }, (_, index) => ({ id: "p" + index, name: "Campo " + index, type: "string" as const }));
    const values = Object.fromEntries(fields.map(field => [field.id, "é".repeat(1024)]));
    const test = await fixture(() => "subject:operator", { version: 1, schemas: [{ id: "s1", name: "Schema", fields, records: [{ id: "r1", name: "Formato A", values }] }] });
    try { const command = await test.update({ values }); expect(Buffer.byteLength(JSON.stringify(command))).toBeGreaterThan(131_072); expect((await test.post(command)).status).toBe(200); expect((await test.snapshot()).sequence).toBe(1); }
    finally { await test.gateway.stop(); }
  });
  it("scarta un’autorizzazione tardiva se il servizio è stato fermato prima del salvataggio", async () => {
    let finish!: (actor: string) => void; const authorize = vi.fn<Authorize>().mockImplementation(() => new Promise(resolve => { finish = resolve; })), test = await fixture(authorize);
    const pending = test.post(await test.update()).catch(() => undefined);
    await vi.waitFor(() => expect(authorize).toHaveBeenCalled()); await test.gateway.stop(); finish("subject:operator"); await pending;
    expect((await test.snapshot()).sequence).toBe(0);
  });
  it("nega soggetti vuoti, invalidi o uguali al segreto di trasporto", async () => {
    for (const actor of ["", " ", "subject\nADMIN", token, "Bearer " + token]) {
      const test = await fixture(() => actor); try { expect((await test.post(await test.update())).status).toBe(403); expect((await test.snapshot()).sequence).toBe(0); } finally { await test.gateway.stop(); }
    }
  });
  it("l’arresto attende una mutazione già accettata e conserva la ricevuta anche senza risposta HTTP", async () => {
    const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, "recipe-stop-"));
    const catalog: RecipeCatalog = { version: 1, schemas: [{ id: "s", name: "Schema", fields: [{ id: "p", name: "Parametro", type: "number" }], records: [{ id: "r", name: "Ricetta", values: { p: 1 } }] }] };
    const store = await openRecipeStore({ directory, catalog }), snapshot = await store.snapshot(); let release!: () => void, started!: () => void, stopped = false;
    const began = new Promise<void>(resolve => { started = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const wrapped = { snapshot: store.snapshot, mutate: async (command: RecipeCommand, actor: string) => { started(); await gate; return store.mutate(command, actor); } };
    const gateway = createPlcGateway({ version: 1, connections: [], gateway: { enabled: true, port: 0, tokenEnv: "TEST_RECIPE_TOKEN", allowedOrigins: [origin] } }, [], { resolveSecret: () => token, recipeStore: wrapped, authorizeRecipeAction: () => "subject:operator" });
    await gateway.start(); const command: RecipeCommand = { id: "stop_recipe_command_001", expectedRevision: snapshot.revision, action: "rename", schemaId: "s", recordId: "r", name: "Nuovo" };
    const request = fetch(gateway.address + api, { method: "POST", headers: { Authorization: "Bearer " + token, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(command) }).catch(() => undefined);
    try {
      await began; const closing = gateway.stop().then(() => { stopped = true; });
      expect(await Promise.race([closing.then(() => "closed"), new Promise(resolve => setTimeout(() => resolve("pending"), 50))])).toBe("pending"); expect(stopped).toBe(false); release(); await closing; await request;
      const reopened = await openRecipeStore({ directory, catalog }); expect((await reopened.snapshot()).sequence).toBe(1); expect((await reopened.mutate(command, "subject:operator")).duplicate).toBe(true);
    } finally { release(); await gateway.stop(); await request; }
  });
});
