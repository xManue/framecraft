import { describe, expect, it, vi } from "vitest";
import { createHmiRecipeApplyClient, parseHmiRecipeApplyResult } from "../src/core/hmiRecipeApplyClient";
import { createHmiRecipeClient } from "../src/core/hmiRecipeClient";
import type { RecipeApplyCommand } from "../runtime/recipe-apply.mjs";
const command: RecipeApplyCommand = { id: "a".repeat(32), schemaId: "s", recordId: "r", expectedRevision: "b".repeat(64), ledgerId: "00000000-0000-4000-8000-000000000001" };
const receipt = (overrides = {}) => ({ type: "recipe-apply", version: 1, ...command, recipeRevision: command.expectedRevision, mappingRevision: "c".repeat(64), channelId: "line1", sequence: 1, phase: "finished", writePhase: "apply", outcome: "applied", code: "RECIPE_APPLY_CONFIRMED", plcCode: 0, createdAt: "2026-10-23T00:00:00.000Z", updatedAt: "2026-10-23T00:00:00.000Z", duplicate: false, effect: "plc-recipe", plcConfirmed: true, ...overrides });
function result(overrides = {}) { const raw = receipt(overrides) as Record<string, unknown>; delete raw.expectedRevision; return raw; }
const response = (raw: unknown, status = 200) => new Response(JSON.stringify(raw), { status });
function journal() { const data = new Map<string, string>(); return { data, getItem: (key: string) => data.get(key) ?? null, setItem(key: string, value: string) { data.set(key, value); }, removeItem(key: string) { data.delete(key); } }; }
function fixture(request = vi.fn<typeof fetch>().mockResolvedValue(response(result()))) { const storage = journal(), report = vi.fn(), client = createHmiRecipeApplyClient({ path: "/_framecraft/plc/v1", scope: "test", request, journal: storage, report }); return { client, storage, report, request }; }
describe("HMI recipe apply client, never a replay", () => {
  it("never resolves an old checkpoint against a replacement service ledger", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValueOnce(Error("offline")).mockResolvedValue(response(result({ ledgerId: "00000000-0000-4000-8000-000000000002" }))); const test = fixture(request);
    await expect(test.client.send(command)).rejects.toMatchObject({ uncertain: true }); await expect(test.client.verify()).rejects.toMatchObject({ uncertain: true }); expect(test.client.pending).toEqual(command); expect(request).toHaveBeenCalledTimes(2); test.client.dispose();
  });
  it("does nothing implicitly and sends only reviewed identifiers with same-origin protection", async () => {
    const test = fixture(); expect(test.request).not.toHaveBeenCalled(); expect(await test.client.send(command)).toMatchObject({ plcConfirmed: true }); expect(test.storage.data.size).toBe(0);
    const [url, init] = test.request.mock.calls[0]; expect(url).toBe("/_framecraft/plc/v1/recipe-apply"); expect(init).toMatchObject({ method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store" }); expect(JSON.parse(String(init?.body))).toEqual(command); expect(init?.headers).not.toHaveProperty("Authorization"); test.client.dispose();
  });
  it("preserves only metadata across reload and never treats not-found as permission to resend", async () => {
    const test = fixture(vi.fn<typeof fetch>().mockRejectedValue(Error("SYNTHETIC_PRIVATE_FAILURE"))); await expect(test.client.send(command)).rejects.toMatchObject({ uncertain: true }); expect([...test.storage.data.values()].map(value => JSON.parse(value))).toEqual([command]); test.client.dispose();
    const missing = { type: "recipe-apply", code: "RECIPE_APPLY_MISSING", outcome: "rejected", effect: "plc-recipe", plcConfirmed: false }, transport = vi.fn<typeof fetch>().mockResolvedValue(response(missing, 404));
    const reloaded = createHmiRecipeApplyClient({ path: "/_framecraft/plc/v1", scope: "test", journal: test.storage, request: transport }); expect(transport).not.toHaveBeenCalled(); await expect(reloaded.send(command)).rejects.toMatchObject({ code: "RECIPE_APPLY_CLIENT_PENDING" });
    await expect(reloaded.verify()).rejects.toMatchObject({ code: "RECIPE_APPLY_MISSING", uncertain: true }); expect(reloaded.pending).toEqual(command);
    transport.mockResolvedValueOnce(response(result({ writePhase: "none", outcome: "rejected", code: "RECIPE_APPLY_NOT_SENT", plcCode: null, plcConfirmed: false }), 422)); expect(await reloaded.fence()).toMatchObject({ code: "RECIPE_APPLY_NOT_SENT" }); expect(reloaded.pending).toBeUndefined(); expect(transport.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual(["/_framecraft/plc/v1/recipe-apply", "/_framecraft/plc/v1/recipe-apply/fence"]); reloaded.dispose();
  });
  it("recovers uncertainty through GET + status only, without another apply", async () => {
    const uncertain = result({ phase: "committing", outcome: "uncertain", plcCode: null, code: "RECIPE_APPLY_UNCERTAIN", plcConfirmed: false });
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(response(uncertain, 503)).mockResolvedValueOnce(response(uncertain)).mockResolvedValueOnce(response(result())); const test = fixture(transport);
    expect(await test.client.send(command)).toMatchObject({ outcome: "uncertain" }); expect(await test.client.verify()).toMatchObject({ plcConfirmed: true }); expect(test.client.pending).toBeUndefined(); expect(transport.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual(["/_framecraft/plc/v1/recipe-apply", "/_framecraft/plc/v1/recipe-apply", "/_framecraft/plc/v1/recipe-apply/check"]); test.client.dispose();
  });
  it.each(["id", "confirm", "phase", "keys", "json", "limit"])("rejects malformed %s after sending and retains the checkpoint", async kind => {
    const raw = kind === "id" ? result({ id: "d".repeat(32) }) : kind === "confirm" ? result({ plcConfirmed: false }) : kind === "phase" ? result({ writePhase: "prepare" }) : kind === "keys" ? { ...result(), extra: true } : result();
    const test = fixture(vi.fn<typeof fetch>().mockResolvedValue(kind === "json" ? new Response("{") : kind === "limit" ? new Response("x".repeat(16385)) : response(raw))); await expect(test.client.send(command)).rejects.toMatchObject({ uncertain: true }); expect(test.client.pending).toEqual(command); test.client.dispose();
  });
  it("does not discard a previous unknown result when status access is denied", async () => {
    const test = fixture(vi.fn<typeof fetch>().mockRejectedValueOnce(Error("offline")).mockResolvedValue(response({ type: "operator", code: "AUTH_PERMISSION", outcome: "rejected", plcConfirmed: false, error: "SYNTHETIC_PRIVATE_DETAIL" }, 403)));
    await expect(test.client.send(command)).rejects.toMatchObject({ uncertain: true }); await expect(test.client.verify()).rejects.toMatchObject({ code: "AUTH_PERMISSION", uncertain: true }); expect(test.client.pending).toEqual(command); expect(JSON.stringify(test.report.mock.calls)).not.toContain("SYNTHETIC_PRIVATE"); test.client.dispose();
  });
  it("clears only a verified initial rejection, not a damaged marker", async () => {
    const test = fixture(vi.fn<typeof fetch>().mockResolvedValue(response({ type: "operator", code: "AUTH_PERMISSION", outcome: "rejected", plcConfirmed: false }, 403))); await expect(test.client.send(command)).rejects.toMatchObject({ uncertain: false }); expect(test.client.pending).toBeUndefined(); test.client.dispose();
    test.storage.setItem("framecraft:recipe-apply:test:/_framecraft/plc/v1", "SYNTHETIC_PRIVATE_MARKER"); const damaged = createHmiRecipeApplyClient({ path: "/_framecraft/plc/v1", scope: "test", journal: test.storage, request: test.request }); expect(damaged.damaged).toBe(true); await expect(damaged.send(command)).rejects.toMatchObject({ code: "RECIPE_APPLY_CLIENT_PENDING" }); expect(test.request).toHaveBeenCalledTimes(1); damaged.dispose();
  });
  it("requires durable browser metadata before POST and ignores old-user responses", async () => {
    const request = vi.fn<typeof fetch>(), client = createHmiRecipeApplyClient({ path: "/_framecraft/plc/v1", scope: "blocked", request, journal: { getItem: () => null, setItem() { throw Error(); }, removeItem() {} } }); await expect(client.send(command)).rejects.toMatchObject({ code: "RECIPE_APPLY_CLIENT_JOURNAL" }); expect(request).not.toHaveBeenCalled(); client.dispose();
    let release!: (response: Response) => void; const test = fixture(vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { release = resolve; }))); const sending = test.client.send(command); test.client.reset(); release(response(result())); await expect(sending).rejects.toMatchObject({ uncertain: true }); expect(test.client.latest).toBeUndefined(); expect(test.client.pending).toEqual(command); test.client.dispose();
  });
  it("discovers unfinished work without applying anything and blocks archive mutation while it is unresolved", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response({ type: "recipe-apply-current", version: 1, ledgerId: command.ledgerId, current: result({ phase: "preparing", writePhase: "prepare", outcome: "uncertain", code: "RECIPE_APPLY_UNCERTAIN", plcCode: null, plcConfirmed: false }) })); const storage = journal(), client = createHmiRecipeClient({ scope: "shared", journal: storage, request: transport });
    expect(await client.apply.current("s")).toMatchObject({ outcome: "uncertain" }); await expect(client.send({ id: command.id, schemaId: "s", recordId: "r", expectedRevision: command.expectedRevision, action: "delete" })).rejects.toMatchObject({ code: "RECIPE_CLIENT_PENDING" }); expect(transport).toHaveBeenCalledTimes(1); client.dispose();
  });
  it("validates receipts, paths and the request timeout without executing code or accepting gateway ACKs", () => {
    expect(parseHmiRecipeApplyResult(result())).toMatchObject({ plcConfirmed: true }); for (const raw of [{ delivery: "broker-ack", plcConfirmed: true }, result({ outcome: "uncertain" }), result({ sequence: 0 }), result({ createdAt: "bad" })]) expect(() => parseHmiRecipeApplyResult(raw)).toThrow();
    for (const path of ["https://outside.invalid", "//outside.invalid", "/api/../test", "/api/"]) expect(() => createHmiRecipeApplyClient({ path, scope: "test" })).toThrow();
  });
});
