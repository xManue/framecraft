import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { beforeAll, expect, it } from "vitest";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { createLocalOperatorAuth } from "../runtime/operator-auth.mjs";
import { defaultOperatorResources, type OperatorCapability } from "../runtime/operator-policy.mjs";
import { hashOperatorPassword, writeOperatorStore, type OperatorPassword } from "../runtime/operator-store.mjs";
import { openRuntimeAudit } from "../runtime/audit-store.mjs";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import type { RecipeCatalog } from "../runtime/recipe-catalog.mjs";
const token = "synthetic_import_token_012345678901234567890", origin = "http://127.0.0.1:4173", password = "SYNTHETIC-import-password-012345";
const catalog: RecipeCatalog = { version: 1, schemas: [{ id: "s", name: "Schema", fields: [{ id: "v", name: "Valore", type: "integer", minimum: 0, maximum: 10 }], records: [{ id: "r", name: "Originale", values: { v: 1 } }] }] };
let hash: OperatorPassword;
beforeAll(async () => { hash = await hashOperatorPassword(password); }, 15000);
async function fixture(allowed = true, schemaAllowed = true) {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "recipe-import-http-")), file = path.join(root, "operators.json"), id = randomUUID();
  const capabilities: OperatorCapability[] = ["recipes.read", "recipes.create", "recipes.update", "audit.read", ...(allowed ? ["recipes.import" as const] : [])];
  await writeOperatorStore(file, { version: 2, id: randomUUID(), accounts: [{ id, username: "operator", name: "Operatore sintetico", role: "Admin", disabled: false, permissions: [], capabilities, password: hash }], resourceRules: [{ accountId: id, limits: { ...defaultOperatorResources(), recipeChanges: { mode: "selected", ids: schemaAllowed ? ["s"] : ["other"] } } }] }, undefined);
  const namespace = randomUUID(), audit = openRuntimeAudit({ root, namespace }), store = await openRecipeStore({ directory: path.join(root, "recipes"), catalog });
  const auth = createLocalOperatorAuth({ file, config: { version: 1, enabled: true, namespace, allowHttpLoopback: true, idleMinutes: 1, absoluteMinutes: 2 }, allowedOrigins: [origin], audit });
  const gateway = createPlcGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "SYNTHETIC_IMPORT", allowedOrigins: [origin], allowWrites: false }, connections: [] }, [], { resolveSecret: () => token, operatorAuth: auth, audit, recipeStore: store }); await gateway.start();
  const request = (route: string, input?: unknown, headers: Record<string, string> = {}) => fetch(gateway.address + "/_framecraft/plc/v1/" + route, { method: input === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + token, Origin: origin, ...(input === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const login = async () => { const result = await request("session/login", { username: "operator", password }); expect(result.status).toBe(200); const body = await result.json(); return { Cookie: result.headers.get("set-cookie")!.split(";")[0], "X-Framecraft-CSRF": body.csrfToken as string }; };
  const command = async () => ({ id: "import_http_request_00001", expectedRevision: (await store.snapshot()).revision, action: "import", schemaId: "s", recordId: "batch", fields: catalog.schemas[0].fields, records: [{ id: "r", name: "Originale", values: { v: 0 } }, { id: "new", name: "Nuova", values: { v: 2 } }] });
  return { store, audit, gateway, request, login, command, close: async () => { await gateway.stop(); audit.close(); } };
}
it("requires login and CSRF even with the transport token", async () => {
  const test = await fixture(); try {
    const command = await test.command(); expect((await test.request("recipes", command)).status).toBe(401);
    const headers = await test.login(); expect((await test.request("recipes", command, { Cookie: headers.Cookie })).status).toBe(403); expect((await test.store.snapshot()).sequence).toBe(0);
  } finally { await test.close(); }
});
it.each([[false, true], [true, false]])("requires the dedicated import capability and exact schema ACL (%s/%s)", async (allowed, scope) => {
  const test = await fixture(allowed, scope); try { const result = await test.request("recipes", await test.command(), await test.login()); expect(result.status).toBe(403); expect((await test.store.snapshot()).sequence).toBe(0); expect(test.audit.read().events.find(item => item.operation === "recipes.import")?.outcome).toBe("rejected"); } finally { await test.close(); }
});
it("imports one atomic batch through HTTP, deduplicates it and logs no values", async () => {
  const test = await fixture(); try {
    const headers = await test.login(), command = await test.command(), result = await test.request("recipes", command, headers); expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ effect: "recipe-storage-only", plcConfirmed: false, snapshot: { sequence: 1 } });
    const replay = await test.request("recipes", command, headers); expect(replay.status).toBe(200); expect((await replay.json()).duplicate).toBe(true);
    expect((await test.store.snapshot()).sequence).toBe(1); expect(test.gateway.snapshot().connections).toEqual([]);
    const events = test.audit.read({ operation: "recipes.import" }).events; expect(events.map(item => item.outcome)).toEqual(["duplicate", "requested", "applied", "requested"]);
    const json = JSON.stringify(events); expect(json).not.toMatch(/"(?:value|values|records|fields|password|csrfToken)":/); for (const secret of [token, password, headers.Cookie]) expect(json).not.toContain(secret);
  } finally { await test.close(); }
});
