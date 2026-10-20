// @vitest-environment node
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmiRecipeClient, parseHmiRecipeSnapshot } from "../src/core/hmiRecipeClient";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import { parseRecipeCommand, type RecipeCatalog, type RecipeCommand } from "../runtime/recipe-catalog.mjs";
const catalog: RecipeCatalog = { version: 1, schemas: [{ id: "s", name: "Schema sintetico", fields: [{ id: "n", name: "Numero", type: "number", minimum: 0, maximum: 100 }, { id: "b", name: "Booleano", type: "boolean" }, { id: "t", name: "Testo", type: "string" }], records: [{ id: "r", name: "Ricetta A", values: { n: 1, b: true, t: "SYNTHETIC_VALUE" } }] }] };
function journal() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); }, values }; }
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const stop of cleanup.splice(0).reverse()) await stop(); });
async function fixture(authorized = true) {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, "recipe-client-")), store = await openRecipeStore({ directory, catalog });
  const token = "recipe_client_test_token_01234567890123456789", origin = "http://127.0.0.1:4173";
  const gateway = createPlcGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "RECIPE_TEST_TOKEN", allowedOrigins: [origin], allowWrites: false }, connections: [] }, [], { resolveSecret: () => token, recipeStore: store, ...(authorized ? { authorizeRecipeAction: () => "synthetic:verified-actor" } : {}) });
  await gateway.start(); cleanup.push(() => gateway.stop());
  const transport = vi.fn<typeof fetch>((url, init) => fetch(gateway.address! + url, { ...init, headers: { ...init?.headers, Authorization: "Bearer " + token, Origin: origin } }));
  const recovery = journal(), report = vi.fn(), client = createHmiRecipeClient({ scope: "test", request: transport, journal: recovery, report }); cleanup.push(() => client.dispose());
  const command = async (overrides: Partial<RecipeCommand> = {}): Promise<RecipeCommand> => ({ id: crypto.randomUUID().replaceAll("-", ""), expectedRevision: (await store.snapshot()).revision, action: "update", schemaId: "s", recordId: "r", name: "Ricetta A", values: { n: 0, b: false, t: "" }, ...overrides });
  return { client, store, recovery, transport, command, report };
}
describe("browser recipe client with real loopback gateway and filesystem", () => {
  it("performs no implicit request; reads and saves exact typed values without a PLC connection", async () => {
    const test = await fixture(); expect(test.transport).not.toHaveBeenCalled(); expect((await test.client.read()).sequence).toBe(0);
    const result = await test.client.send(await test.command()); expect(result).toMatchObject({ effect: "recipe-storage-only", plcConfirmed: false, duplicate: false });
    expect((await test.store.snapshot()).schemas[0].records[0].values).toEqual({ n: 0, b: false, t: "" }); expect(test.client.pending).toBeUndefined(); expect(test.recovery.values.size).toBe(0);
    const [url, init] = test.transport.mock.calls.at(-1)!; expect(url).toBe("/_framecraft/plc/v1/recipes"); expect(init).toMatchObject({ credentials: "same-origin", redirect: "error", cache: "no-store" }); expect(init?.headers).not.toHaveProperty("Authorization");
  });
  it("denies default server authorization, sanitizes details and never infers an operator", async () => {
    const test = await fixture(false); await expect(test.client.read()).rejects.toMatchObject({ code: "RECIPE_AUTH", uncertain: false });
    await expect(test.client.send(await test.command())).rejects.toMatchObject({ code: "RECIPE_AUTH", uncertain: false }); expect((await test.store.snapshot()).sequence).toBe(0); expect(test.client.pending).toBeUndefined();
    expect(JSON.stringify(test.report.mock.calls)).not.toContain("SYNTHETIC_VALUE");
  });
  it("keeps an uncertain request and retries exactly its original ID and body without duplicating the save", async () => {
    const test = await fixture(), command = await test.command(); const request = vi.fn<typeof fetch>(async (url, init) => { const response = await test.transport(url, init); if (init?.method === "POST" && request.mock.calls.filter(([, options]) => options?.method === "POST").length === 1) throw new Error("PRIVATE_NETWORK_DETAIL"); return response; });
    const client = createHmiRecipeClient({ scope: "loss", journal: test.recovery, request }); cleanup.push(() => client.dispose());
    await expect(client.send(command)).rejects.toMatchObject({ uncertain: true }); expect((await test.store.snapshot()).sequence).toBe(1);
    await expect(client.send(await test.command({ id: "new_request_id_000001" }))).rejects.toMatchObject({ code: "RECIPE_CLIENT_PENDING" });
    const result = await client.retry(); expect(result).toMatchObject({ duplicate: true, appliedSequence: 1 }); expect((await test.store.snapshot()).sequence).toBe(1);
    const bodies = request.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => init?.body); expect(bodies).toEqual([JSON.stringify(parseRecipeCommand(command)), JSON.stringify(parseRecipeCommand(command))]); expect(client.pending).toBeUndefined();
  });
  it("preserves only the request ID across reload; no values or automatic retry; requires read and explicit review", async () => {
    const test = await fixture(), command = await test.command(); const client = createHmiRecipeClient({ scope: "reload", journal: test.recovery, request: async () => { throw new Error("offline"); } }); cleanup.push(() => client.dispose());
    await expect(client.send(command)).rejects.toMatchObject({ uncertain: true }); expect([...test.recovery.values.values()]).toEqual([command.id]);
    const restored = createHmiRecipeClient({ scope: "reload", journal: test.recovery, request: test.transport }); cleanup.push(() => restored.dispose());
    expect(restored.pending).toMatchObject({ id: command.id, canRetry: false, reviewed: false }); expect(() => restored.acknowledgeReviewed()).toThrow(); await expect(restored.retry()).rejects.toMatchObject({ code: "RECIPE_CLIENT_PENDING" });
    await restored.read(); restored.acknowledgeReviewed(); expect(restored.pending).toBeUndefined(); expect((await test.store.snapshot()).sequence).toBe(0);
  });
  it("does not erase an earlier uncertain outcome when the retry is denied", async () => {
    const test = await fixture(), command = await test.command(); let attempts = 0;
    const client = createHmiRecipeClient({ scope: "denied", journal: test.recovery, request: async () => { if (++attempts === 1) throw new Error("offline"); return new Response(JSON.stringify({ type: "recipe", code: "RECIPE_AUTH", error: "PRIVATE_DETAIL", remedy: "PRIVATE_DETAIL", outcome: "rejected", effect: "recipe-storage-only", plcConfirmed: false }), { status: 403 }); } }); cleanup.push(() => client.dispose());
    await expect(client.send(command)).rejects.toMatchObject({ uncertain: true }); await expect(client.retry()).rejects.toMatchObject({ code: "RECIPE_AUTH", uncertain: true }); expect(client.pending?.id).toBe(command.id);
  });
  it("rejects stale revisions and field limits without overwriting or queueing", async () => {
    const test = await fixture(), stale = await test.command(); await test.store.mutate(await test.command({ values: { n: 3, b: true, t: "new" } }), "synthetic:second-actor");
    await expect(test.client.send(stale)).rejects.toMatchObject({ code: "RECIPE_CONFLICT", uncertain: false }); expect((await test.store.snapshot()).sequence).toBe(1);
    await expect(test.client.send(await test.command({ values: { n: 101, b: false, t: "" } }))).rejects.toMatchObject({ code: "RECIPE_VALUE", fieldId: "n" }); expect(test.client.pending).toBeUndefined();
  });
  it("does not POST when the request-ID journal is unavailable or its signal was already aborted", async () => {
    const test = await fixture(), request = vi.fn<typeof fetch>();
    const client = createHmiRecipeClient({ scope: "blocked", request, journal: { getItem: () => null, removeItem() {}, setItem() { throw new Error("quota"); } } }); cleanup.push(() => client.dispose());
    await expect(client.send(await test.command())).rejects.toMatchObject({ code: "RECIPE_CLIENT_JOURNAL" });
    await expect(test.client.send(await test.command(), AbortSignal.abort())).rejects.toMatchObject({ uncertain: false }); expect(request).not.toHaveBeenCalled(); expect(test.transport).not.toHaveBeenCalled();
  });
  it.each(["wrong-id", "plc-confirmed", "bad-snapshot", "broken-json"])("treats %s after POST as uncertain, retaining the request ID", async kind => {
    const test = await fixture(), command = await test.command();
    const client = createHmiRecipeClient({ scope: kind, journal: test.recovery, request: async () => {
      const result = await test.store.mutate(command, "synthetic:verified-actor");
      const raw = kind === "wrong-id" ? { ...result, id: "wrong_request_id_0001" } : kind === "plc-confirmed" ? { ...result, plcConfirmed: true } : kind === "bad-snapshot" ? { ...result, snapshot: { ...result.snapshot, revision: "bad" } } : result;
      return new Response(kind === "broken-json" ? "{" : JSON.stringify(raw));
    } }); cleanup.push(() => client.dispose());
    await expect(client.send(command)).rejects.toMatchObject({ uncertain: true }); expect(client.pending?.id).toBe(command.id);
  });
  it("rejects malformed snapshots, external endpoints and invalid namespaces", async () => {
    const test = await fixture(), snapshot = await test.store.snapshot();
    for (const raw of [{ ...snapshot, sequence: -1 }, { ...snapshot, persistence: "browser" }, { ...snapshot, extra: true }, { ...snapshot, revision: "bad" }]) expect(() => parseHmiRecipeSnapshot(raw)).toThrow();
    for (const path of ["https://external.invalid", "//external.invalid", "/api/../recipes", "/api/"]) expect(() => createHmiRecipeClient({ scope: "test", path })).toThrow();
  });
  it("fails closed on a damaged recovery marker and never stores recipe payloads", async () => {
    const test = await fixture(), key = "framecraft:recipe-request:damaged:/_framecraft/plc/v1"; test.recovery.setItem(key, "PRIVATE_DAMAGED_MARKER");
    const client = createHmiRecipeClient({ scope: "damaged", journal: test.recovery, request: test.transport }); cleanup.push(() => client.dispose());
    expect(client.pending).toBeDefined(); await expect(client.send(await test.command())).rejects.toMatchObject({ code: "RECIPE_CLIENT_PENDING" }); expect(test.transport).not.toHaveBeenCalled();
    await client.read(); client.acknowledgeReviewed(); expect(test.recovery.getItem(key)).toBeNull(); expect((await test.store.snapshot()).sequence).toBe(0);
  });
  it("limits response bytes and does not expose transport details", async () => {
    const test = await fixture(); const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("x".repeat(2_100_001)));
    const client = createHmiRecipeClient({ scope: "limit", journal: test.recovery, request }); cleanup.push(() => client.dispose());
    await expect(client.read()).rejects.toMatchObject({ code: "RECIPE_CLIENT_RESPONSE" }); expect((await test.store.snapshot()).sequence).toBe(0);
  });
  it("times out and aborts an in-flight POST without allowing another operation to be queued", async () => {
    const test = await fixture(), command = await test.command();
    const client = createHmiRecipeClient({ scope: "timeout", journal: test.recovery, timeoutMs: 250, request: (_url, init) => new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); }) }); cleanup.push(() => client.dispose());
    const pending = client.send(command); await expect(client.send(command)).rejects.toMatchObject({ code: "RECIPE_CLIENT_BUSY" }); await expect(pending).rejects.toMatchObject({ uncertain: true }); expect(client.busy).toBe(false); expect(client.pending?.id).toBe(command.id);
  });
});
