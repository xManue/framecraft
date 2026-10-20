import { mkdir, mkdtemp } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { createLocalOperatorAuth } from "../runtime/operator-auth.mjs";
import { hashOperatorPassword, readOperatorStore, writeOperatorStore, type OperatorStore, type OperatorPassword } from "../runtime/operator-store.mjs";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import { defaultOperatorResources } from "../runtime/operator-policy.mjs";

const writes = vi.hoisted(() => vi.fn(async (tag: string) => ({ tag, delivery: "broker-ack", plcConfirmed: false })));
vi.mock("../runtime/mqtt-driver.mjs", async importOriginal => ({ ...await importOriginal<typeof import("../runtime/mqtt-driver.mjs")>(), createMqttPlcConnection: () => ({ state: "connected", start: async () => {}, stop: async () => {}, read: () => undefined, write: writes }) }));
const origin = "http://127.0.0.1:4173", token = "synthetic_transport_token_01234567890123456789", password = "SYNTHETIC-password-012345";
let hash: OperatorPassword;
beforeAll(async () => { hash = await hashOperatorPassword(password); }, 15000);
async function fixture(enabled = true) {
  writes.mockClear(); const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, "operator-gateway-")), file = path.join(directory, "operators.json");
  const store: OperatorStore = { version: 1, id: randomUUID(), accounts: [{ id: randomUUID(), username: "operator", name: "Operatore sintetico", role: "Operatore", disabled: false, capabilities: ["recipes.read", "recipes.update", "tags.write", "alarms.acknowledge"], permissions: ["parametri"], password: hash }] };
  await writeOperatorStore(file, store, undefined);
  const auth = createLocalOperatorAuth({ file, config: { version: 1, enabled: true, namespace: randomUUID(), allowHttpLoopback: true, idleMinutes: 1, absoluteMinutes: 2 }, allowedOrigins: [origin] });
  const recipes = await openRecipeStore({ directory: path.join(directory, "recipes"), catalog: { version: 1, schemas: [{ id: "s", name: "Schema", fields: [{ id: "speed", name: "Velocità", type: "number" }], records: [{ id: "r", name: "Ricetta", values: { speed: 1 } }] }] } });
  const gateway = createPlcGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "SYNTHETIC_TOKEN", allowedOrigins: [origin], allowWrites: true }, connections: [{ id: "synthetic", protocol: "mqtt", url: "mqtt://127.0.0.1:1883", enabled: true, allowInsecure: true, allowWrites: true, bindings: [{ tag: "Speed", topic: "speed", writeTopic: "speed-command" }] }] }, [{ name: "Speed", dataType: "Real", access: "read-write" }], { resolveSecret: () => token, recipeStore: recipes, alarmCatalog: { version: 1, classes: [], alarms: [], maxHistory: 100 }, ...(enabled ? { operatorAuth: auth } : {}) });
  await gateway.start();
  const request = (route: string, input?: unknown, headers: Record<string, string> = {}) => fetch(gateway.address + "/_framecraft/plc/v1/" + route, { method: input === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + token, Origin: origin, ...(input === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const login = async () => { const response = await request("session/login", { username: "operator", password }); expect(response.status).toBe(200); const body = await response.json(); return { Cookie: response.headers.get("set-cookie")!.split(";")[0], "X-Framecraft-CSRF": body.csrfToken as string }; };
  return { request, login, file, store, recipes, async close() { await gateway.stop(); auth.close(); } };
}
describe("sessioni locali nel gateway HTTP, nessun PLC reale", () => {
  it("limiti HTTP prima di driver, archivio ricette e deduplicazione; revoca immediata", async () => {
    const test = await fixture(); try {
      const old = (await readOperatorStore(test.file))!, store: OperatorStore = { ...test.store, version: 2, resourceRules: [{ accountId: test.store.accounts[0].id, limits: defaultOperatorResources() }] };
      let saved = await writeOperatorStore(test.file, store, old.revision), headers = await test.login();
      const write = { id: "synthetic_resource_00001", tag: "Speed", value: 2 }, recipe = { id: "synthetic_recipe_scope01", action: "update", expectedRevision: (await test.recipes.snapshot()).revision, schemaId: "s", recordId: "r", name: "Ricetta", values: { speed: 3 } };
      for (const [route, command] of [["write", write], ["recipes", recipe]] as const) { const response = await test.request(route, command, headers); expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ code: "AUTH_RESOURCE", outcome: "rejected", plcConfirmed: false }); }
      expect(writes).not.toHaveBeenCalled(); expect((await test.recipes.snapshot()).sequence).toBe(0);
      const alarm = await test.request("alarm-action", { alarmId: "synthetic-alarm", occurrence: "synthetic-occurrence", revision: 1, action: "acknowledge" }, headers); expect(alarm.status).toBe(403); expect(await alarm.json()).toMatchObject({ code: "AUTH_RESOURCE" });
      store.resourceRules[0].limits = { ...defaultOperatorResources(), tagWrites: { mode: "selected", ids: ["Speed"] }, recipeChanges: { mode: "selected", ids: ["s"] } }; saved = await writeOperatorStore(test.file, store, saved.revision); headers = await test.login();
      expect((await test.request("write", write, headers)).status).toBe(200); expect((await test.request("recipes", recipe, headers)).status).toBe(200); expect(writes).toHaveBeenCalledTimes(1);
      store.resourceRules[0].limits = defaultOperatorResources(); await writeOperatorStore(test.file, store, saved.revision); headers = await test.login();
      const replay = await test.request("write", write, headers); expect(replay.status).toBe(403); expect(await replay.json()).toMatchObject({ code: "AUTH_RESOURCE" }); expect(writes).toHaveBeenCalledTimes(1);
    } finally { await test.close(); }
  }, 15000);
  it("token di trasporto non basta per scrivere, anche con tutti i consensi PLC abilitati", async () => {
    const test = await fixture(false); try {
      expect((await test.request("snapshot")).status).toBe(200);
      const response = await test.request("write", { id: "synthetic_command_000001", tag: "Speed", value: 2 }, { "X-Operator": "admin" }); expect(response.status).toBe(401); expect(await response.json()).toMatchObject({ type: "operator", code: "AUTH_REQUIRED", plcConfirmed: false }); expect(writes).not.toHaveBeenCalled();
    } finally { await test.close(); }
  });
  it("login reale, cookie, CSRF e autorizzazione prima di ogni write, anche i duplicati", async () => {
    const test = await fixture(); try {
      expect((await test.request("session")).status).toBe(200); const headers = await test.login(), command = { id: "synthetic_command_000001", tag: "Speed", value: 2 };
      const denied = await test.request("write", command, { Cookie: headers.Cookie }); expect(denied.status).toBe(403); expect(await denied.json()).toMatchObject({ code: "AUTH_CSRF" }); expect(writes).not.toHaveBeenCalled();
      const result = await test.request("write", command, headers); expect(result.status).toBe(200); expect(await result.json()).toMatchObject({ outcome: "delivered", plcConfirmed: false });
      expect((await test.request("write", command, headers)).status).toBe(200); expect(writes).toHaveBeenCalledTimes(1);
      expect((await test.request("session/logout", {}, headers)).status).toBe(200); expect((await test.request("write", command, headers)).status).toBe(401); expect(writes).toHaveBeenCalledTimes(1);
    } finally { await test.close(); }
  });
  it("ricette con attore server e revoca dei permessi immediata; niente fiducia nel browser", async () => {
    const test = await fixture(); try {
      expect((await test.request("recipes")).status).toBe(401); const headers = await test.login();
      const read = await test.request("recipes", undefined, headers); expect(read.status).toBe(200); const snapshot = await read.json();
      const command = { id: "synthetic_recipe_0000001", action: "update", expectedRevision: snapshot.revision, schemaId: "s", recordId: "r", name: "Ricetta", values: { speed: 3 } };
      expect((await test.request("recipes", command, { Cookie: headers.Cookie })).status).toBe(403); expect((await test.recipes.snapshot()).sequence).toBe(0);
      expect((await test.request("recipes", command, headers)).status).toBe(200); expect((await test.recipes.snapshot()).sequence).toBe(1);
      const current = await readOperatorStore(test.file); test.store.accounts[0].capabilities = ["recipes.read"]; await writeOperatorStore(test.file, test.store, current!.revision);
      expect((await test.request("write", { id: "synthetic_command_000002", tag: "Speed", value: 2 }, headers)).status).toBe(401);
      const fresh = await test.login(); expect((await test.request("write", { id: "synthetic_command_000003", tag: "Speed", value: 2 }, fresh)).status).toBe(403); expect(writes).not.toHaveBeenCalled();
    } finally { await test.close(); }
  });
  it("rifiuta origini non consentite e logout senza CSRF, senza echo di password o header", async () => {
    const test = await fixture(); try {
      const bad = await test.request("session/login", { username: "operator", password }, { Origin: "http://evil.invalid" }); expect(bad.status).toBe(403); expect(await bad.text()).not.toContain(password);
      const headers = await test.login(), response = await test.request("session/logout", {}, { Cookie: headers.Cookie }); expect(response.status).toBe(403); expect((await test.request("recipes", undefined, headers)).status).toBe(200);
      const fake = await test.request("session/login", { username: "operator", password, actor: "admin" }); expect(fake.status).toBe(400); expect(await fake.text()).not.toContain(password);
    } finally { await test.close(); }
  });
});
