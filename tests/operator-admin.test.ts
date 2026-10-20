import { mkdir, mkdtemp, readFile, stat, symlink } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { manageLocalOperators } from "../runtime/operator-admin.mjs";
import { readOperatorStore, verifyOperatorPassword } from "../runtime/operator-store.mjs";
const password = "SYNTHETIC-admin-password-012345";
async function fixture() { const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); return mkdtemp(path.join(base, "operator-admin-")); }
const add = (root: string) => ({ root, action: "add" as const, expectedRevision: null, username: "synthetic", name: "Operatore sintetico", role: "Etichetta", capabilities: ["recipes.read" as const], permissions: [], password });
describe("amministrazione locale account", () => {
  it("lettura senza provisioning, creazione esplicita e nessuna credenziale nelle risposte", async () => {
    const root = await fixture(); expect(await manageLocalOperators({ root, action: "read" })).toEqual({ revision: null, storeId: null, accounts: [] }); await expect(stat(path.join(root, ".framecraft-runtime"))).rejects.toMatchObject({ code: "ENOENT" });
    const result = await manageLocalOperators(add(root)); expect(result.accounts).toMatchObject([{ username: "synthetic", capabilities: ["recipes.read"], permissions: [] }]);
    const text = JSON.stringify(result); expect(text).not.toMatch(/password|scrypt|salt|key/); expect(text).not.toContain(password);
    const current = await readOperatorStore(path.join(root, ".framecraft-runtime/security/operators.json")); expect(await verifyOperatorPassword(password, current!.store.accounts[0].password)).toBe(true);
  }, 15000);
  it("modifiche, disabilitazione e password usano revisioni senza sovrascrivere cambiamenti concorrenti", async () => {
    const root = await fixture(), initial = await manageLocalOperators(add(root)), id = initial.accounts[0].id;
    const changed = await manageLocalOperators({ root, action: "update", expectedRevision: initial.revision, id, name: "Nuovo nome", role: "Manutenzione", capabilities: [], permissions: ["parametri"] });
    await expect(manageLocalOperators({ root, action: "disable", expectedRevision: initial.revision, id, disabled: true })).rejects.toMatchObject({ code: "AUTH_CONFLICT" });
    const disabled = await manageLocalOperators({ root, action: "disable", expectedRevision: changed.revision, id, disabled: true }); expect(disabled.accounts[0].disabled).toBe(true);
    const next = await manageLocalOperators({ root, action: "password", expectedRevision: disabled.revision, id, password: password + "-new" }); expect(next.accounts[0]).toEqual(disabled.accounts[0]); expect(next.revision).not.toBe(disabled.revision);
    const current = await readOperatorStore(path.join(root, ".framecraft-runtime/security/operators.json")); expect(await verifyOperatorPassword(password, current!.store.accounts[0].password)).toBe(false);
  }, 15000);
  it("rifiuta campi extra, capacità inventate, nomi duplicati e percorsi non regolari", async () => {
    const root = await fixture(); await expect(manageLocalOperators({ ...add(root), capabilities: ["admin" as never] })).rejects.toMatchObject({ code: "AUTH_INPUT" }); await expect(stat(path.join(root, ".framecraft-runtime"))).rejects.toMatchObject({ code: "ENOENT" });
    const initial = await manageLocalOperators(add(root)), file = path.join(root, ".framecraft-runtime/security/operators.json"), before = await readFile(file, "utf8");
    await expect(manageLocalOperators({ ...add(root), expectedRevision: initial.revision })).rejects.toMatchObject({ code: "AUTH_INPUT" });
    await expect(manageLocalOperators({ ...add(root), expectedRevision: initial.revision, actor: "admin" } as never)).rejects.toMatchObject({ code: "AUTH_INPUT" }); expect(await readFile(file, "utf8")).toBe(before);
    const linked = path.join(root, "linked"); await symlink(root, linked, process.platform === "win32" ? "junction" : "dir"); await expect(manageLocalOperators({ root: linked, action: "read" })).rejects.toMatchObject({ code: "AUTH_STORE" });
  }, 15000);
});
