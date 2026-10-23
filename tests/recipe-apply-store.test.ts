import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openRecipeApplyStore, parseRecipeApplyReceipt } from "../runtime/recipe-apply-store.mjs";
import { parseRecipeApplyAck, parseRecipeApplyCommand, parseRecipeApplyConfig, recipeApplyAscii, recipeApplyFrame } from "../runtime/recipe-apply.mjs";
const input = { id: "a".repeat(32), channelId: "line1", schemaId: "s", recordId: "r", recipeRevision: "a".repeat(64), mappingRevision: "b".repeat(64), fingerprint: "c".repeat(64), actor: "operator:test" };
async function fixture(recordLimit = 10000) { const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "recipe-apply-store-")), namespace = randomUUID(), store = openRecipeApplyStore({ root, namespace, recordLimit }); return { root, namespace, store }; }
describe("durable recipe apply intent, never a PLC replay", () => {
  it("reserves once, keeps uncertain work locked across reopening and never stores recipe values", async () => {
    const test = await fixture(); let receipt;
    try {
      receipt = test.store.reserve(input).receipt; expect(receipt).toMatchObject({ sequence: 1, phase: "reserved", writePhase: "none", outcome: "pending" }); expect(test.store.reserve(input).duplicate).toBe(true);
      test.store.change(input.id, "preparing", "pending", "RECIPE_APPLY_PREPARING"); test.store.change(input.id, "committing", "pending", "RECIPE_APPLY_COMMITTING"); test.store.change(input.id, "committing", "uncertain", "RECIPE_APPLY_UNCERTAIN");
      expect(() => test.store.reserve({ ...input, id: "b".repeat(32) })).toThrow(); expect(() => test.store.reserve({ ...input, fingerprint: "d".repeat(64) })).toThrow();
    } finally { test.store.close(); }
    const reopened = openRecipeApplyStore({ root: test.root, namespace: test.namespace });
    try { expect(reopened.get(input.id)).toMatchObject({ sequence: 1, outcome: "uncertain", writePhase: "apply" }); expect(() => reopened.reserve({ ...input, id: "b".repeat(32) })).toThrow(); reopened.change(input.id, "finished", "applied", "RECIPE_APPLY_CONFIRMED", 0); const next = reopened.reserve({ ...input, id: "b".repeat(32) }); expect(next.receipt.sequence).toBe(2); expect(reopened.channel("line1", true)?.id).toBe(input.id); }
    finally { reopened.close(); }
    expect(JSON.stringify(receipt)).not.toContain("values");
  });
  it("requires phase order and makes final outcomes immutable", async () => {
    const test = await fixture(); try {
      const receipt = test.store.reserve(input).receipt; expect(() => test.store.change(input.id, "finished", "applied", "RECIPE_APPLY_CONFIRMED", 0)).toThrow(); expect(() => test.store.change(input.id, "committing", "pending", "RECIPE_APPLY_COMMITTING")).toThrow();
      expect(() => parseRecipeApplyReceipt({ ...receipt, values: { n: 1 } })).toThrow(); const final = test.store.change(input.id, "finished", "rejected", "AUTH_PERMISSION"); expect(final.writePhase).toBe("none"); expect(() => test.store.change(input.id, "preparing", "pending", "RECIPE_APPLY_PREPARING")).toThrow();
    } finally { test.store.close(); }
  });
  it("does not evict receipts when full and denies a second writer", async () => {
    const test = await fixture(1); try {
      test.store.reserve(input); test.store.change(input.id, "finished", "rejected", "RECIPE_APPLY_REJECTED", 1); expect(() => test.store.reserve({ ...input, id: "b".repeat(32) })).toThrow(); expect(test.store.get(input.id)?.outcome).toBe("rejected");
      expect(() => openRecipeApplyStore({ root: test.root, namespace: test.namespace })).toThrow();
    } finally { test.store.close(); }
  });
  it("rejects wrong namespace, damaged identity and modified payload without reseeding", async () => {
    const test = await fixture(); test.store.reserve(input); test.store.close(); const directory = path.join(test.root, ".framecraft-runtime/recipe-apply"), marker = path.join(directory, "identity.json"), before = await readFile(marker, "utf8");
    expect(() => openRecipeApplyStore({ root: test.root, namespace: randomUUID() })).toThrow(); expect(await readFile(marker, "utf8")).toBe(before);
    const db = new DatabaseSync(path.join(directory, "requests.sqlite")); db.prepare("UPDATE apply_requests SET payload='SYNTHETIC_BROKEN_PAYLOAD'").run(); db.close(); expect(() => openRecipeApplyStore({ root: test.root, namespace: test.namespace })).toThrow();
    await writeFile(marker, "SYNTHETIC_CORRUPT_IDENTITY"); expect(() => openRecipeApplyStore({ root: test.root, namespace: test.namespace })).toThrow(); expect(await readFile(marker, "utf8")).toBe("SYNTHETIC_CORRUPT_IDENTITY");
  });
});
describe("Framecraft recipe wire contract v1", () => {
  it("requires exact commands and a coherent, correlated PLC acknowledgement", () => {
    expect(parseRecipeApplyCommand({ id: input.id, expectedRevision: input.recipeRevision, schemaId: "s", recordId: "r" })).toHaveProperty("id", input.id);
    expect(() => parseRecipeApplyCommand({ id: input.id, expectedRevision: input.recipeRevision, schemaId: "s", recordId: "r", values: {} })).toThrow();
    const ack = { version: 1, namespace: randomUUID(), channelId: "line1", sequence: 1, id: input.id, fingerprint: input.fingerprint, state: "applied", code: 0 }; expect(parseRecipeApplyAck(JSON.stringify(ack))).toEqual(ack);
    for (const bad of [{ ...ack, code: 1 }, { ...ack, sequence: 0 }, { ...ack, state: "rejected" }, { ...ack, state: "delivered" }, { ...ack, extra: true }]) expect(() => parseRecipeApplyAck(JSON.stringify(bad))).toThrow();
  });
  it("uses one ASCII JSON frame, preserving Unicode/false/zero, with explicit payload budget", () => {
    const receipt = { ...input, namespace: randomUUID(), sequence: 1 }, payload = { schemaHash: "d".repeat(64), ttlMs: 15000, values: { n: 0, b: false, s: "caffè\n🙂" } };
    const source = recipeApplyFrame(receipt, "prepare", payload, 2048); expect(/[^\x00-\x7f]/.test(source)).toBe(false); expect(JSON.parse(source).values).toEqual(payload.values); expect(recipeApplyAscii({ s: "è" })).toContain("\\u00e8"); expect(() => recipeApplyFrame(receipt, "prepare", payload, 100)).toThrow(); expect(JSON.parse(recipeApplyFrame(receipt, "apply", undefined, 2048))).not.toHaveProperty("values");
  });
  it("defaults off and rejects alias channels, partial profiles or read-only request tags", () => {
    expect(parseRecipeApplyConfig({ version: 1, schemas: [] })).toEqual({ version: 1, schemas: [] });
    const p = { schemaId: "s", channelId: "line1", requestTag: "Request", responseTag: "Response", maxPayloadBytes: 8192, maxAgeMs: 2000, prepareTimeoutMs: 5000, applyTimeoutMs: 5000, stageLifetimeMs: 15000 };
    const vars = [{ name: "Request", dataType: "String", access: "write" }, { name: "Response", dataType: "String", access: "read" }]; expect(parseRecipeApplyConfig({ version: 1, schemas: [p] }, undefined, vars).schemas).toHaveLength(1);
    for (const profiles of [[{ ...p, direct: true }], [{ ...p, requestTag: "Response" }], [p, { ...p, schemaId: "s2", channelId: "alias" }], [p, { ...p, schemaId: "s2", maxAgeMs: 1000 }]]) expect(() => parseRecipeApplyConfig({ version: 1, schemas: profiles }, undefined, vars)).toThrow();
  });
});
