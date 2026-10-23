import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { Aedes } from "aedes";
import { connectAsync } from "mqtt";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { createLocalOperatorAuth } from "../runtime/operator-auth.mjs";
import { defaultOperatorResources, type OperatorCapability } from "../runtime/operator-policy.mjs";
import { hashOperatorPassword, readOperatorStore, writeOperatorStore, type OperatorPassword } from "../runtime/operator-store.mjs";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import type { PlcConnectionConfig } from "../runtime/connection-config.mjs";
const token = "synthetic_recipe_capture_token_0123456789", password = "SYNTHETIC-recipe-capture-password-012345", origin = "http://127.0.0.1:4173";
let hash: OperatorPassword; beforeAll(async () => { hash = await hashOperatorPassword(password); }, 15000);
const variables = [{ name: "N", dataType: "Real", access: "read-write" as const }];
const recipeCatalog = { version: 1 as const, schemas: ["s", "other"].map(id => ({ id, name: id, fields: [{ id: "n", name: "Numero", type: "number" as const, minimum: 0, maximum: 100 }], records: [] })) };
const mapping = { version: 1 as const, schemas: recipeCatalog.schemas.map(item => ({ schemaId: item.id, maxAgeMs: 10000, maxSkewMs: 2000, fields: [{ fieldId: "n", tag: "N" }] })) };
async function fixture(connections: PlcConnectionConfig[] = [], capabilities: OperatorCapability[] = ["recipes.read", "recipes.capture", "recipes.create"]) {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, "recipe-capture-")), file = path.join(directory, "operators.json"), id = randomUUID();
  await writeOperatorStore(file, { version: 2, id: randomUUID(), accounts: [{ id, username: "operator", name: "Operatore", role: "Admin", disabled: false, capabilities, permissions: [], password: hash }], resourceRules: [{ accountId: id, limits: { ...defaultOperatorResources(), recipeChanges: { mode: "selected", ids: ["s"] } } }] }, undefined);
  const auth = createLocalOperatorAuth({ file, config: { version: 1, enabled: true, namespace: randomUUID(), allowHttpLoopback: true, idleMinutes: 1, absoluteMinutes: 2 }, allowedOrigins: [origin], audit: { append: () => {} } });
  const store = await openRecipeStore({ directory: path.join(directory, "recipes"), catalog: recipeCatalog }), diagnostics: unknown[] = [];
  const gateway = createPlcGateway({ version: 1, connections, gateway: { enabled: true, port: 0, tokenEnv: "SYNTHETIC_TOKEN", allowedOrigins: [origin], allowWrites: false } }, variables, { resolveSecret: () => token, recipeStore: store, recipePlcCatalog: mapping, operatorAuth: auth, audit: { append: () => {} }, onRecipePlcDiagnostic: event => diagnostics.push(event) });
  await gateway.start(); const revision = (await store.snapshot()).revision;
  const request = (route: string, input?: unknown, headers = {}) => fetch(gateway.address + "/_framecraft/plc/v1/" + route, { method: input === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + token, Origin: origin, ...(input === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const login = await request("session/login", { username: "operator", password }); expect(login.status).toBe(200); const session = await login.json(), headers = { Cookie: login.headers.get("set-cookie")!.split(";")[0], "X-Framecraft-CSRF": session.csrfToken };
  const route = (schemaId = "s", expectedRevision = revision) => "recipe-plc?" + new URLSearchParams({ schemaId, expectedRevision });
  return { gateway, auth, store, diagnostics, request, route, headers, revision, async revoke() { const current = await readOperatorStore(file); if (!current) throw new Error("Fixture account mancante"); await writeOperatorStore(file, { ...current.store, accounts: current.store.accounts.map(item => ({ ...item, disabled: true })) }, current.revision); }, async close() { await gateway.stop(); } };
}
describe("recipe capture authorization and real drivers", () => {
  it("requires a server session, explicit capture capability and schema ACL before reading", async () => {
    const test = await fixture(); try {
      expect((await test.request(test.route())).status).toBe(401); expect((await test.request(test.route(), undefined, { ...test.headers, Authorization: "Bearer wrong" })).status).toBe(401);
      expect((await test.request(test.route(), undefined, { ...test.headers, Origin: "https://untrusted.invalid" })).status).toBe(403);
      expect((await test.request(test.route("other"), undefined, test.headers)).status).toBe(403);
      const read = await test.request(test.route(), undefined, test.headers); expect(read.status).toBe(200); expect(await read.json()).toMatchObject({ complete: false, entries: [{ code: "RECIPE_PLC_UNBOUND" }], plcConfirmed: false });
      expect((await test.store.snapshot()).sequence).toBe(0);
    } finally { await test.close(); }
    const denied = await fixture([], ["recipes.read", "recipes.create", "tags.write"]); try { expect((await denied.request(denied.route(), undefined, denied.headers)).status).toBe(403); } finally { await denied.close(); }
  }, 20000);
  it("rejects stale revisions, extra parameters and late results after account revocation", async () => {
    const test = await fixture(); try {
      expect((await test.request(test.route() + "&tag=N", undefined, test.headers)).status).toBe(400);
      expect((await test.request(test.route("s", "b".repeat(64)), undefined, test.headers)).status).toBe(409);
      await new Promise(resolve => setTimeout(resolve, 210)); const original = test.store.snapshot.bind(test.store); let release!: () => void, started!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { started = resolve; });
      const spy = vi.spyOn(test.store, "snapshot").mockImplementation(async () => { started(); await gate; return original(); });
      const pending = test.request(test.route(), undefined, test.headers); await ready; await test.revoke(); release(); const response = await pending; expect([401, 403]).toContain(response.status); expect(await response.text()).not.toContain('"entries"'); spy.mockRestore();
    } finally { await test.close(); }
  }, 20000);
  it("reads real MQTT live values, rejects retained samples and saves a new archive record without publishing commands", async () => {
    const broker = await Aedes.createBroker(), tcp = createServer(broker.handle); await new Promise<void>(resolve => tcp.listen(0, "127.0.0.1", resolve)); const url = "mqtt://127.0.0.1:" + (tcp.address() as { port: number }).port, publisher = await connectAsync(url, { reconnectPeriod: 0 });
    let writes = 0; broker.on("publish", packet => { if (packet.topic === "command") writes++; }); await publisher.publishAsync("value", JSON.stringify({ value: 9, quality: 192 }), { retain: true, qos: 1 });
    const test = await fixture([{ id: "mqtt", protocol: "mqtt", enabled: true, url, allowInsecure: true, allowWrites: false, bindings: [{ tag: "N", topic: "value", valuePath: "/value", qualityPath: "/quality", writeTopic: "command" }] }]);
    try {
      await vi.waitFor(() => expect(test.gateway.snapshot().samples[0]?.value).toBe("9")); const retained = await (await test.request(test.route(), undefined, test.headers)).json(); expect(retained.entries[0].code).toBe("RECIPE_PLC_RETAINED");
      await publisher.publishAsync("value", JSON.stringify({ value: 0, quality: 192 }), { qos: 1 }); await vi.waitFor(() => expect(test.gateway.snapshot().samples[0]?.value).toBe("0")); await new Promise(resolve => setTimeout(resolve, 210));
      const response = await test.request(test.route(), undefined, test.headers); expect(response.status).toBe(200); const captured = await response.json(); expect(captured).toMatchObject({ complete: true, values: { n: 0 }, effect: "plc-read-only", simultaneous: false, plcConfirmed: false });
      const saved = await test.request("recipes", { id: "synthetic_capture_create_01", action: "create", schemaId: "s", recordId: "new", name: "Acquisita", expectedRevision: test.revision, values: captured.values }, test.headers); expect(saved.status).toBe(200); expect((await test.store.snapshot()).schemas[0].records[0].values).toEqual({ n: 0 }); expect(writes).toBe(0); expect(JSON.stringify(test.diagnostics)).not.toContain(password);
    } finally { await test.close(); await publisher.endAsync(true); await new Promise<void>(resolve => broker.close(resolve)); await new Promise<void>(resolve => tcp.close(() => resolve())); }
  }, 20000);
  it("reads a real OPC UA cache and preserves bad quality without any Write", async () => {
    const { OPCUAServer } = await import("node-opcua-server"), { DataType, DataValue, Variant, StatusCodes, MessageSecurityMode, SecurityPolicy } = await import("node-opcua-client"), { OPCUACertificateManager } = await import("node-opcua-certificate-manager");
    const base = path.resolve(".hmi-preview"), root = await mkdtemp(path.join(base, "recipe-ua-")); const manager = new OPCUACertificateManager({ rootFolder: path.join(root, "pki"), disableFileWatchers: true });
    const server = new OPCUAServer({ port: 0, hostname: "127.0.0.1", host: "127.0.0.1", serverCertificateManager: manager, securityModes: [MessageSecurityMode.None], securityPolicies: [SecurityPolicy.None], allowAnonymous: true }); let writes = 0, bad = false;
    await server.initialize(); const space = server.engine.addressSpace!, namespace = space.registerNamespace("urn:framecraft:recipe-test"); namespace.addVariable({ organizedBy: space.rootFolder.objects, browseName: "N", nodeId: "s=N", dataType: "Float", minimumSamplingInterval: 100, value: { timestamped_get: () => new DataValue({ value: new Variant({ dataType: DataType.Float, value: 12 }), statusCode: bad ? StatusCodes.BadOutOfService : StatusCodes.Good, sourceTimestamp: new Date() }), timestamped_set: (_data, callback) => { writes++; callback(null, StatusCodes.Good); } } }); await server.start();
    const url = server.endpoints[0].endpointDescriptions().find(item => item.securityMode === MessageSecurityMode.None)!.endpointUrl!;
    const test = await fixture([{ id: "ua", protocol: "opcua", enabled: true, url, securityMode: "None", securityPolicy: "None", allowInsecure: true, allowWrites: false, pkiDirectory: path.join(root, "client-pki"), readIntervalMs: 250, samplingIntervalMs: 250, bindings: [{ tag: "N", namespaceUri: "urn:framecraft:recipe-test", nodeId: "s=N" }] }]);
    try {
      await vi.waitFor(() => expect(test.gateway.snapshot().samples[0]?.qualityCode).toBe(192), { timeout: 5000 }); const good = await (await test.request(test.route(), undefined, test.headers)).json(); expect(good).toMatchObject({ complete: true, values: { n: 12 } });
      bad = true; await vi.waitFor(() => expect(test.gateway.snapshot().samples[0]?.qualityCode).toBe(0), { timeout: 5000 }); await new Promise(resolve => setTimeout(resolve, 210)); const rejected = await (await test.request(test.route(), undefined, test.headers)).json(); expect(rejected.complete).toBe(false); expect(rejected.entries[0].code).toBe("RECIPE_PLC_QUALITY"); expect(rejected).not.toHaveProperty("values"); expect(writes).toBe(0);
    } finally { await test.close(); await server.shutdown(0); await manager.dispose(); }
  }, 30000);
});
