import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import { openRecipeApplyStore } from "../runtime/recipe-apply-store.mjs";
import { createRecipeApplyEngine, type RecipeApplyContext } from "../runtime/recipe-apply-engine.mjs";
import { createRecipePlcReference, newRecipePlcState, type RecipePlcRetainedState } from "../runtime/recipe-plc-reference.mjs";
import { recipeApplyAscii, type RecipeApplyFrame } from "../runtime/recipe-apply.mjs";
import { OperatorAuthError } from "../runtime/operator-policy.mjs";
import type { RecipeCatalog, RecipeScalar } from "../runtime/recipe-catalog.mjs";
const catalog: RecipeCatalog = { version: 1, schemas: [{ id: "s", name: "Formato", fields: [{ id: "n", name: "Numero", type: "number", minimum: 0, maximum: 100 }, { id: "b", name: "Bool", type: "boolean" }, { id: "s", name: "Testo", type: "string" }], records: [{ id: "r", name: "Ricetta", values: { n: 0, b: false, s: "caffè" } }] }] };
const profile = { schemaId: "s", channelId: "line1", requestTag: "Request", responseTag: "Response", maxPayloadBytes: 8192, maxAgeMs: 10000, prepareTimeoutMs: 1000, applyTimeoutMs: 1000, stageLifetimeMs: 3000 };
async function fixture() {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "recipe-apply-engine-")), namespace = randomUUID();
  const recipes = await openRecipeStore({ directory: path.join(root, "recipes"), catalog }), ledger = openRecipeApplyStore({ root, namespace });
  let retained: RecipePlcRetainedState = newRecipePlcState(namespace, "line1"), machine: Record<string, RecipeScalar> = {}, permitted = true, interlock = true, clock = 0;
  const applied = vi.fn((values: Record<string, RecipeScalar>) => { machine = structuredClone(values); });
  const plc = createRecipePlcReference({ namespace, channelId: "line1", catalog, retained, persist: next => { retained = next; }, canApply: () => interlock, apply: applied });
  let sample = { value: recipeApplyAscii(plc.response()), receivedAt: Date.now(), qualityCode: 192, retained: false };
  const update = (value: unknown) => { sample = { value: recipeApplyAscii(value), receivedAt: Date.now(), qualityCode: 192, retained: false }; };
  const frames: RecipeApplyFrame[] = []; const write = vi.fn(async (source: string) => { frames.push(JSON.parse(source)); update(plc.receive(source, clock)); return { delivery: "broker-ack", plcConfirmed: false }; });
  const channel = { connected: () => true, read: () => sample, write }, engine = createRecipeApplyEngine({ namespace, config: { version: 1, schemas: [profile] }, store: ledger, recipes, channel: () => channel });
  const context: RecipeApplyContext = { actor: "operator:test", async authorize() { if (!permitted) throw new OperatorAuthError("AUTH_PERMISSION"); return "operator:test"; }, alive: () => true };
  const command = { id: randomUUID().replaceAll("-", ""), expectedRevision: (await recipes.snapshot()).revision, schemaId: "s", recordId: "r", ledgerId: ledger.identity };
  return { root, namespace, recipes, ledger, plc, channel, frames, write, applied, engine, context, command, update, get sample() { return sample; }, set sample(next: typeof sample) { sample = next; }, get machine() { return machine; }, get retained() { return retained; }, set permitted(next: boolean) { permitted = next; }, set interlock(next: boolean) { interlock = next; }, advance(ms: number) { clock += ms; update(plc.tick(clock)); }, async close() { await engine.stop(); ledger.close(); } };
}
describe("two-phase recipe apply, durable service and reference PLC", () => {
  it("requires the original ledger identity and a coherent fresh PLC cache before fencing unseen work", async () => {
    const test = await fixture(); try {
      await expect(test.engine.fence({ ...test.command, ledgerId: randomUUID() }, test.context)).rejects.toMatchObject({ code: "RECIPE_APPLY_CHANGED" });
      test.sample = { ...test.sample, retained: true }; await expect(test.engine.fence(test.command, test.context)).rejects.toMatchObject({ code: "RECIPE_APPLY_OFFLINE" }); expect(test.ledger.get(test.command.id)).toBeUndefined(); expect(test.frames).toHaveLength(0);
    } finally { await test.close(); }
  });
  it("does not cancel or certify an original already inside the sending boundary", async () => {
    const test = await fixture(), original = test.write.getMockImplementation()!; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    test.write.mockImplementation(async source => { if (JSON.parse(source).phase === "prepare") await gate; return original(source); }); const sending = test.engine.apply(test.command, test.context);
    try { await vi.waitFor(() => expect(test.write).toHaveBeenCalledTimes(1), { timeout: 10000 }); expect(await test.engine.fence(test.command, test.context)).toMatchObject({ outcome: "pending", writePhase: "prepare", plcConfirmed: false }); release(); expect(await sending).toMatchObject({ outcome: "applied" }); expect(test.applied).toHaveBeenCalledTimes(1); }
    finally { release(); await sending; await test.close(); }
  });
  it("durably fences an unseen ID without PLC I/O and rejects its delayed original across restart", async () => {
    const test = await fixture(); try {
      expect(await test.engine.fence(test.command, test.context)).toMatchObject({ outcome: "rejected", code: "RECIPE_APPLY_NOT_SENT", writePhase: "none", plcConfirmed: false });
      expect(await test.engine.apply(test.command, test.context)).toMatchObject({ duplicate: true, outcome: "rejected" }); expect(test.frames).toHaveLength(0); expect(test.applied).not.toHaveBeenCalled();
      await test.engine.stop(); test.ledger.close(); const store = openRecipeApplyStore({ root: test.root, namespace: test.namespace });
      const restarted = createRecipeApplyEngine({ namespace: test.namespace, config: { version: 1, schemas: [profile] }, store, recipes: test.recipes, channel: () => test.channel });
      try { expect(await restarted.apply(test.command, test.context)).toMatchObject({ duplicate: true, outcome: "rejected" }); expect(await restarted.apply({ ...test.command, id: randomUUID().replaceAll("-", "") }, test.context)).toMatchObject({ outcome: "applied", sequence: 2 }); expect(test.applied).toHaveBeenCalledTimes(1); } finally { await restarted.stop(); store.close(); }
    } finally { await test.close(); }
  }, 15000);
  it("fences an original waiting for the archive before it can reserve or write", async () => {
    const test = await fixture(), original = test.recipes.snapshot.bind(test.recipes); let release!: (snapshot: Awaited<ReturnType<typeof original>>) => void;
    const reading = vi.spyOn(test.recipes, "snapshot").mockImplementationOnce(() => new Promise(resolve => { release = resolve; })); const pending = test.engine.apply(test.command, test.context);
    try { await vi.waitFor(() => expect(reading).toHaveBeenCalledTimes(1), { timeout: 10000 }); expect(await test.engine.fence(test.command, test.context)).toMatchObject({ code: "RECIPE_APPLY_NOT_SENT" }); release(await original()); expect(await pending).toMatchObject({ outcome: "rejected", duplicate: true }); expect(test.frames).toHaveLength(0); }
    finally { release(await original()); await pending; reading.mockRestore(); await test.close(); }
  });
  it("confirms only after prepare + explicit apply + matching PLC result, and deduplicates across restart", async () => {
    const test = await fixture(); try {
      const result = await test.engine.apply(test.command, test.context); expect(result).toMatchObject({ outcome: "applied", plcConfirmed: true, writePhase: "apply", phase: "finished" }); expect(test.frames.map(frame => frame.phase)).toEqual(["prepare", "apply"]); expect(test.machine).toEqual({ n: 0, b: false, s: "caffè" }); expect(test.applied).toHaveBeenCalledTimes(1);
      const duplicate = await test.engine.apply(test.command, test.context); expect(duplicate).toMatchObject({ duplicate: true, plcConfirmed: true }); expect(test.frames).toHaveLength(2);
      await test.engine.stop(); const next = createRecipeApplyEngine({ namespace: test.namespace, config: { version: 1, schemas: [profile] }, store: test.ledger, recipes: test.recipes, channel: () => test.channel });
      try { expect(await next.apply(test.command, test.context)).toMatchObject({ duplicate: true, plcConfirmed: true }); expect(test.applied).toHaveBeenCalledTimes(1); } finally { await next.stop(); }
    } finally { await test.close(); }
  }, 15000);
  it("never treats broker delivery as PLC confirmation or starts apply after missing preparation", async () => {
    const test = await fixture(); test.write.mockImplementation(async source => { test.frames.push(JSON.parse(source)); return { delivery: "broker-ack", plcConfirmed: false }; });
    try { const result = await test.engine.apply(test.command, test.context); expect(result).toMatchObject({ outcome: "uncertain", plcConfirmed: false, writePhase: "prepare" }); expect(test.frames.map(frame => frame.phase)).toEqual(["prepare"]); expect(test.applied).not.toHaveBeenCalled(); await expect(test.engine.apply({ ...test.command, id: randomUUID().replaceAll("-", "") }, test.context)).rejects.toMatchObject({ code: "RECIPE_APPLY_BUSY" }); }
    finally { await test.close(); }
  }, 10000);
  it("fences an unseen preparation during explicit status check, so a delayed original cannot apply", async () => {
    const test = await fixture(); test.write.mockImplementationOnce(async source => { test.frames.push(JSON.parse(source)); return { delivery: "broker-ack", plcConfirmed: false }; });
    try {
      await test.engine.apply(test.command, test.context); const status = await test.engine.check({ id: test.command.id, schemaId: "s" }, test.context); expect(status).toMatchObject({ outcome: "rejected", plcCode: 7, plcConfirmed: false });
      expect(test.plc.receive(recipeApplyAscii(test.frames[0]), 0)).toMatchObject({ state: "rejected" }); expect(test.applied).not.toHaveBeenCalled(); expect(test.frames.map(frame => frame.phase)).toEqual(["prepare", "status"]);
    } finally { await test.close(); }
  }, 10000);
  it("resolves a lost application response by status only, never by sending apply again", async () => {
    const test = await fixture(); const original = test.write.getMockImplementation()!; test.write.mockImplementation(async source => { const frame = JSON.parse(source); if (frame.phase === "apply") { test.frames.push(frame); test.plc.receive(source, 0); return { delivery: "broker-ack", plcConfirmed: false }; } return original(source); });
    try {
      expect(await test.engine.apply(test.command, test.context)).toMatchObject({ outcome: "uncertain", writePhase: "apply", plcConfirmed: false }); expect(test.applied).toHaveBeenCalledTimes(1);
      expect(await test.engine.check({ id: test.command.id, schemaId: "s" }, test.context)).toMatchObject({ outcome: "applied", plcConfirmed: true }); expect(test.frames.map(frame => frame.phase)).toEqual(["prepare", "apply", "status"]); expect(test.applied).toHaveBeenCalledTimes(1);
    } finally { await test.close(); }
  }, 10000);
  it("does not commit when authorization is revoked after preparation; expired staging is rejected", async () => {
    const test = await fixture(); const original = test.write.getMockImplementation()!; test.write.mockImplementation(async source => { const result = await original(source); if (JSON.parse(source).phase === "prepare") test.permitted = false; return result; });
    try {
      expect(await test.engine.apply(test.command, test.context)).toMatchObject({ outcome: "uncertain", writePhase: "prepare", code: "AUTH_PERMISSION", plcConfirmed: false }); expect(test.frames.map(frame => frame.phase)).toEqual(["prepare"]); expect(test.applied).not.toHaveBeenCalled();
      test.advance(4000); test.permitted = true; expect(await test.engine.check({ id: test.command.id, schemaId: "s" }, test.context)).toMatchObject({ outcome: "rejected", plcCode: 5 });
    } finally { await test.close(); }
  });
  it("rechecks the actual archive after PLC preparation, preserving machine values on a conflict", async () => {
    const test = await fixture(), original = test.write.getMockImplementation()!;
    test.write.mockImplementation(async source => { const result = await original(source); if (JSON.parse(source).phase === "prepare") await test.recipes.mutate({ id: "synthetic_archive_update_01", expectedRevision: test.command.expectedRevision, action: "update", schemaId: "s", recordId: "r", name: "Nuova", values: { n: 4, b: true, s: "altro" } }, "other:operator"); return result; });
    try { expect(await test.engine.apply(test.command, test.context)).toMatchObject({ outcome: "uncertain", writePhase: "prepare", code: "RECIPE_APPLY_CHANGED" }); expect(test.applied).not.toHaveBeenCalled(); }
    finally { await test.close(); }
  });
  it("checks interlocks again at commit and never converts a PLC rejection into success", async () => {
    const test = await fixture(), original = test.write.getMockImplementation()!;
    test.write.mockImplementation(async source => { const result = await original(source); if (JSON.parse(source).phase === "prepare") test.interlock = false; return result; });
    try { expect(await test.engine.apply(test.command, test.context)).toMatchObject({ outcome: "rejected", plcCode: 1, plcConfirmed: false }); expect(test.applied).not.toHaveBeenCalled(); }
    finally { await test.close(); }
  });
  it.each(["retained", "bad", "old", "future", "counter"])("blocks %s response before reserving or writing", async kind => {
    const test = await fixture(); if (kind === "retained") test.sample = { ...test.sample, retained: true }; else if (kind === "bad") test.sample = { ...test.sample, qualityCode: 0 }; else if (kind === "old") test.sample = { ...test.sample, receivedAt: 0 }; else if (kind === "future") test.sample = { ...test.sample, receivedAt: Date.now() + 10000 }; else test.update({ ...test.plc.response(), sequence: 99, state: "applied", id: "a".repeat(32), fingerprint: "a".repeat(64) });
    try { await expect(test.engine.apply(test.command, test.context)).rejects.toBeDefined(); expect(test.ledger.get(test.command.id)).toBeUndefined(); expect(test.frames).toHaveLength(0); }
    finally { await test.close(); }
  });
  it("does not accept an applied acknowledgement before its own commit boundary", async () => {
    const test = await fixture(), original = test.write.getMockImplementation()!;
    test.write.mockImplementation(async source => { const result = await original(source); test.update({ ...test.plc.response(), state: "applied", code: 0 }); return result; });
    try { expect(await test.engine.apply(test.command, test.context)).toMatchObject({ outcome: "uncertain", plcConfirmed: false, code: "RECIPE_APPLY_RESPONSE", writePhase: "prepare" }); expect(test.frames.map(frame => frame.phase)).toEqual(["prepare"]); expect(test.applied).not.toHaveBeenCalled(); }
    finally { await test.close(); }
  });
  it("keeps a post-write ledger failure uncertain and recovers only by status after reopening", async () => {
    const test = await fixture(), original = test.write.getMockImplementation()!;
    test.write.mockImplementation(async source => { const result = await original(source); if (JSON.parse(source).phase === "apply") test.ledger.close(); return result; });
    try {
      await expect(test.engine.apply(test.command, test.context)).rejects.toMatchObject({ code: "RECIPE_APPLY_UNCERTAIN", outcome: "uncertain" }); expect(test.applied).toHaveBeenCalledTimes(1);
      await test.engine.stop(); const store = openRecipeApplyStore({ root: test.root, namespace: test.namespace });
      const restarted = createRecipeApplyEngine({ namespace: test.namespace, config: { version: 1, schemas: [profile] }, store, recipes: test.recipes, channel: () => test.channel });
      try {
        expect(restarted.current("s").current).toMatchObject({ outcome: "uncertain", writePhase: "apply", plcConfirmed: false });
        expect(await restarted.check({ id: test.command.id, schemaId: "s" }, test.context)).toMatchObject({ outcome: "applied", plcConfirmed: true });
        expect(test.frames.map(frame => frame.phase)).toEqual(["prepare", "apply", "status"]); expect(test.applied).toHaveBeenCalledTimes(1);
      } finally { await restarted.stop(); store.close(); }
    } finally { await test.close(); }
  });
  it("serializes simultaneous requests on one channel before either can commit", async () => {
    const test = await fixture(), original = test.write.getMockImplementation()!; let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    test.write.mockImplementation(async source => { if (JSON.parse(source).phase === "prepare") await gate; return original(source); });
    const first = test.engine.apply(test.command, test.context);
    try {
      await vi.waitFor(() => expect(test.write).toHaveBeenCalledTimes(1), { timeout: 10000 });
      await expect(test.engine.apply({ ...test.command, id: randomUUID().replaceAll("-", "") }, test.context)).rejects.toMatchObject({ code: "RECIPE_APPLY_BUSY" });
      release(); expect(await first).toMatchObject({ outcome: "applied", plcConfirmed: true }); expect(test.applied).toHaveBeenCalledTimes(1);
    } finally { release(); await first; await test.close(); }
  });
  it("stops an in-flight preparation without replaying it", async () => {
    const test = await fixture(); test.write.mockImplementation(async source => { test.frames.push(JSON.parse(source)); return { delivery: "broker-ack", plcConfirmed: false }; });
    try { const pending = test.engine.apply(test.command, test.context); await vi.waitFor(() => expect(test.frames).toHaveLength(1), { timeout: 10000 }); await test.engine.stop(); expect(await pending).toMatchObject({ outcome: "uncertain", plcConfirmed: false }); expect(test.frames.map(frame => frame.phase)).toEqual(["prepare"]); }
    finally { await test.close(); }
  });
});
