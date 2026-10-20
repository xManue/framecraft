import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultOperatorResources, parseOperatorResources, operatorResourceAllowed } from "../runtime/operator-policy.mjs";
import { parseOperatorStore, readOperatorStore, writeOperatorStore, type OperatorStore } from "../runtime/operator-store.mjs";
import { manageLocalOperators } from "../runtime/operator-admin.mjs";

const hash = { algorithm: "scrypt" as const, N: 131072 as const, r: 8 as const, p: 1 as const, salt: "A".repeat(43), key: "A".repeat(86) };
const account = () => ({ id: randomUUID(), username: "synthetic", name: "Sintetico", role: "Etichetta", disabled: false, capabilities: ["tags.write" as const], permissions: ["comandi"], password: hash });
async function fixture() { const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "operator-resources-")), directory = path.join(root, ".framecraft-runtime/security"); await mkdir(directory, { recursive: true }); const file = path.join(directory, "operators.json"), store: OperatorStore = { version: 1, id: randomUUID(), accounts: [account(), { ...account(), username: "other" }] }; const current = await writeOperatorStore(file, store, undefined); return { root, directory, file, ...current }; }
describe("limiti risorse operatore", () => {
  it("ID esatti, nessun jolly, prefisso o normalizzazione; contesto server obbligatorio nel formato 2", () => {
    const id = randomUUID(), limits = { ...defaultOperatorResources(), tagWrites: { mode: "selected" as const, ids: ["Line.Speed", "*"] } }, store = { version: 2 as const, resourceRules: [{ accountId: id, limits }] };
    expect(operatorResourceAllowed(store, id, "tags.write", { tag: "Line.Speed" })).toBe(true);
    for (const tag of ["line.speed", "Line.Speed2", "Line", "Other"]) expect(operatorResourceAllowed(store, id, "tags.write", { tag })).toBe(false);
    expect(operatorResourceAllowed(store, id, "tags.write")).toBe(false); expect(operatorResourceAllowed(store, "other", "tags.write", { tag: "Line.Speed" })).toBe(false);
    expect(operatorResourceAllowed(store, id, "alarms.confirm", { alarmId: "Line.Speed" })).toBe(false);
    expect(operatorResourceAllowed(store, id, "recipes.read")).toBe(true);
    limits.tagWrites = { mode: "all" } as never; expect(operatorResourceAllowed(store, id, "tags.write")).toBe(false); expect(operatorResourceAllowed(store, id, "tags.write", { tag: "Other" })).toBe(true);
    expect(operatorResourceAllowed({ version: 1 }, id, "tags.write")).toBe(true);
  });
  it("parser chiuso per regole mancanti, duplicate, orfane, campi extra e liste non valide", () => {
    const a = account(), base = { version: 2, id: randomUUID(), accounts: [a], resourceRules: [{ accountId: a.id, limits: defaultOperatorResources() }] };
    expect(parseOperatorStore(base)).toEqual(base);
    for (const input of [null, { ...base, resourceRules: [] }, { ...base, resourceRules: [...base.resourceRules, base.resourceRules[0]] }, { ...base, resourceRules: [{ ...base.resourceRules[0], accountId: randomUUID() }] }, { ...base, extra: true }]) expect(() => parseOperatorStore(input)).toThrow();
    for (const filter of [{ mode: "selected", ids: ["A", "A"] }, { mode: "selected", ids: [" A"] }, { mode: "selected", ids: ["\n"] }, { mode: "all", ids: [] }, { mode: "selected", ids: Array.from({ length: 257 }, (_, i) => String(i)) }]) expect(() => parseOperatorResources({ ...defaultOperatorResources(), tagWrites: filter })).toThrow();
  });
  it("migrazione solo esplicita, backup privato, conserva password/ID e limiti degli altri utenti", async () => {
    const test = await fixture(), id = test.store.accounts[0].id, before = await readFile(test.file, "utf8");
    const read = await manageLocalOperators({ root: test.root, action: "read" }); expect(read.version).toBe(1); expect(await readFile(test.file, "utf8")).toBe(before);
    const limits = { ...defaultOperatorResources(), tagWrites: { mode: "selected" as const, ids: ["Speed"] } };
    const result = await manageLocalOperators({ root: test.root, action: "resources", expectedRevision: test.revision, id, limits }); expect(result.version).toBe(2);
    const current = (await readOperatorStore(test.file))!; expect(current.store.accounts).toEqual(test.store.accounts); expect(current.store.id).toBe(test.store.id);
    expect(result.resourceRules).toEqual([{ accountId: id, limits }, { accountId: test.store.accounts[1].id, limits: defaultOperatorResources(true) }]);
    const backup = path.join(test.directory, "operators-v1-" + test.revision + ".json"); expect(JSON.parse(await readFile(backup, "utf8"))).toEqual(test.store);
    await expect(writeOperatorStore(test.file, test.store, current.revision)).rejects.toMatchObject({ code: "AUTH_INPUT" });
    await expect(manageLocalOperators({ root: test.root, action: "resources", expectedRevision: test.revision, id, limits: defaultOperatorResources(true) })).rejects.toMatchObject({ code: "AUTH_CONFLICT" });
    const updated = await manageLocalOperators({ root: test.root, action: "resources", expectedRevision: result.revision, id, limits: defaultOperatorResources() }); expect(updated.resourceRules[0].limits).toEqual(defaultOperatorResources()); expect((await readdir(test.directory)).filter(name => name.startsWith("operators-v1-")).length).toBe(1);
    const added = await manageLocalOperators({ root: test.root, action: "add", expectedRevision: updated.revision, username: "new", name: "Nuovo", role: "Etichetta", capabilities: ["tags.write"], permissions: [], password: "SYNTHETIC-new-password-012345" }); expect(added.resourceRules.find(rule => rule.accountId === added.accounts[2].id)?.limits).toEqual(defaultOperatorResources());
  }, 15000);
  it("non sovrascrive backup preesistenti diversi e non cambia l’archivio se il backup fallisce", async () => {
    const test = await fixture(), backup = path.join(test.directory, "operators-v1-" + test.revision + ".json"), before = await readFile(test.file, "utf8"); await writeFile(backup, "SYNTHETIC_DIFFERENT_BACKUP");
    await expect(manageLocalOperators({ root: test.root, action: "resources", expectedRevision: test.revision, id: test.store.accounts[0].id, limits: defaultOperatorResources() })).rejects.toMatchObject({ code: "AUTH_STORE" });
    expect(await readFile(test.file, "utf8")).toBe(before); expect(await readFile(backup, "utf8")).toBe("SYNTHETIC_DIFFERENT_BACKUP");
  });
});
