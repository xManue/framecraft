// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { Aedes } from "aedes";
import { connectAsync } from "mqtt";
import { expect, it, vi } from "vitest";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { createLocalOperatorAuth } from "../runtime/operator-auth.mjs";
import { defaultOperatorResources } from "../runtime/operator-policy.mjs";
import { hashOperatorPassword, writeOperatorStore } from "../runtime/operator-store.mjs";
import { openRuntimeAudit } from "../runtime/audit-store.mjs";
import { dataLogDefinitionKey, parseDataLogSnapshot, type ServiceDataLogs } from "../runtime/data-log.mjs";
import { openDataLogStore } from "../runtime/data-log-store.mjs";

const token = "synthetic_data_log_token_01234567890123456789", password = "SYNTHETIC-data-log-password-012345", origin = "http://localhost:1420";
async function fixture(deadband?: ServiceDataLogs["logs"][number]["deadband"]) {
  await mkdir(path.resolve(".hmi-preview"), { recursive: true }); const root = await mkdtemp(path.resolve(".hmi-preview/data-log-gateway-")), namespace = randomUUID(), account = randomUUID(), viewer = randomUUID(), security = path.join(root, ".framecraft-runtime/security"); await mkdir(security, { recursive: true }); const file = path.join(security, "operators.json"), hash = await hashOperatorPassword(password);
  await writeOperatorStore(file, { version: 2, id: randomUUID(), accounts: [{ id: account, username: "operator", name: "Operatore QA", role: "Operatore", disabled: false, capabilities: ["dataLogs.read", "dataLogs.sample"], permissions: [], password: hash }, { id: viewer, username: "viewer", name: "Utente precedente", role: "Operatore", disabled: false, capabilities: [], permissions: [], password: hash }], resourceRules: [account, viewer].map(accountId => ({ accountId, limits: defaultOperatorResources() })) }, undefined);
  const logs: ServiceDataLogs = { version: 1, projectKey: "synthetic", logs: [{ id: "process", name: "Processo", storage: "runtime", enabled: true, retentionMs: 60000, segmentDurationMs: 60000, maxEntries: 1000, tags: [
    { id: "x", name: "X", tag: "X", mode: "on-change", cycleMs: 500, includeUnchanged: false, smoothingSamples: 1, aggregation: "none", aggregationWindowMs: 1000 },
    { id: "cycle", name: "Ciclo", tag: "Y", mode: "cyclic", cycleMs: 500, includeUnchanged: true, smoothingSamples: 1, aggregation: "none", aggregationWindowMs: 1000 },
    { id: "demand", name: "Trigger", tag: "Y", mode: "on-demand", cycleMs: 500, includeUnchanged: true, smoothingSamples: 1, aggregation: "none", aggregationWindowMs: 1000, triggerTag: "Trigger", triggerCondition: "rising" },
  ] }] };
  if (deadband) logs.logs[0].deadband = deadband;
  const broker = await Aedes.createBroker(), tcp = createServer(broker.handle); await new Promise<void>(resolve => tcp.listen(0, "127.0.0.1", resolve)); const address = tcp.address(); if (!address || typeof address === "string") throw new Error(); const url = "mqtt://127.0.0.1:" + address.port, publisher = await connectAsync(url, { reconnectPeriod: 0 });
  const audit = openRuntimeAudit({ root, namespace }), variables = ["X", "Y", "Trigger"].map(name => ({ name, dataType: name === "Trigger" ? "Bool" : "Real", access: "read" as const })), config = { version: 1 as const, gateway: { enabled: true, port: 0, tokenEnv: "SYNTHETIC_DATA_LOG_TOKEN", allowedOrigins: [origin], allowWrites: false }, connections: [{ id: "mqtt-qa", protocol: "mqtt" as const, enabled: true, url, clientId: "data-log-qa", allowInsecure: true, allowWrites: false, timeoutMs: 3000, bindings: variables.map(v => ({ tag: v.name, topic: "signal/" + v.name, valuePath: "/value", qualityPath: "/quality", timestampPath: "/time", timestampUnit: "ms" as const })) }] };
  let store = openDataLogStore({ root, namespace, catalog: logs }), gateway: ReturnType<typeof createPlcGateway>, commands = 0, clock = 0;
  const make = (readOnly = false) => createPlcGateway(config, variables, { resolveSecret: () => token, dataLogCatalog: readOnly ? { ...logs, logs: logs.logs.map(log => ({ ...log, enabled: false })) } : logs, dataLogStore: store, audit, operatorAuth: createLocalOperatorAuth({ file, config: { version: 1, enabled: true, namespace, allowHttpLoopback: true, idleMinutes: 1, absoluteMinutes: 2 }, allowedOrigins: [origin], audit, now: () => clock }) });
  gateway = make(); await gateway.start(); broker.on("publish", packet => { if (packet.topic.startsWith("command")) commands++; });
  const request = (route: string, input?: unknown, headers: Record<string, string> = {}) => fetch(gateway.address + "/_framecraft/plc/v1/" + route, { method: input === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + token, Origin: origin, ...(input === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const login = async (username = "operator") => { const response = await request("session/login", { username, password }); expect(response.status).toBe(200); const body = await response.json(); return { Cookie: response.headers.get("set-cookie")!.split(";")[0], "X-Framecraft-CSRF": body.csrfToken as string }; };
  const query = (id = "x") => ({ logId: "process", loggedTagId: id, definition: dataLogDefinitionKey(logs.logs[0], logs.logs[0].tags.find(t => t.id === id)!), from: Date.now() - 60000, to: Date.now() + 60000 });
  const sample = async (tag: string, value: number | boolean, quality = 192) => { await publisher.publishAsync("signal/" + tag, JSON.stringify({ value, quality, time: Date.now() - 10000 }), { qos: 1 }); await vi.waitFor(() => expect(gateway.snapshot().samples.find(s => s.tag === tag)).toMatchObject({ qualityCode: quality, ...(quality === 192 ? { value: String(value) } : {}) })); };
  const command = () => ({ version: 1, id: randomUUID(), serviceInstanceId: gateway.snapshot().dataLogs!.instanceId, logId: "process", loggedTagId: "demand" });
  return { advance: (ms: number) => { clock += ms; }, audit, namespace, account, request, login, sample, query, command, snapshot: () => gateway.snapshot(), store: () => store, commands: () => commands, restartReadOnly: async () => { await gateway.stop(); store.close(); store = openDataLogStore({ root, namespace, catalog: logs, readOnly: true }); gateway = make(true); await gateway.start(); }, close: async () => { await gateway.stop(); store.close(); audit.close(); await publisher.endAsync(true); await new Promise<void>(resolve => broker.close(resolve)); await new Promise<void>(resolve => tcp.close(() => resolve())); } };
}
it("filtra il rumore MQTT nel servizio senza bloccare valori correnti o transizioni di qualità", async () => {
  const f = await fixture({ mode: "absolute", value: 5 });
  try {
    for (const value of [10, 11, 14, 15]) await f.sample("X", value);
    expect(f.store().query(f.query()).samples.map(row => row.value)).toEqual(["10", "15"]);
    await f.sample("X", 16, 0); await f.sample("X", 16);
    expect(f.store().query(f.query()).samples.map(row => row.qualityCode)).toEqual([192, 192, 0, 192]);
    expect(f.snapshot().samples.find(row => row.tag === "X")).toMatchObject({ value: "16", qualityCode: 192 }); expect(f.commands()).toBe(0);
  } finally { await f.close(); }
});
it("registra MQTT senza browser, condivide il disco e conserva qualità e timestamp sorgente", async () => {
  const f = await fixture(); try { await f.sample("X", 10); await f.sample("X", 20); await f.sample("X", 20, 0); await f.sample("Y", 5); await f.sample("Trigger", false); await f.sample("Trigger", true); await vi.waitFor(() => expect(f.store().query(f.query("cycle")).samples.length).toBeGreaterThan(0));
    const headers = await f.login(), query = f.query(), response = await f.request("data-log-history?" + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])), undefined, headers); expect(response.status).toBe(200); const data = parseDataLogSnapshot(await response.json(), query); expect(data.samples.map(s => [s.value, s.qualityCode])).toEqual([["10", 192], ["20", 192], ["20", 0]]); expect(data.samples[0].sourceTimestamp).toBeLessThan(data.samples[0].time - 5000); expect(f.store().query(f.query("demand")).samples.map(s => s.value)).toEqual(["5"]); expect(f.commands()).toBe(0);
  } finally { await f.close(); }
});
it("richiede capacità esplicite e valida sorgenti, cursori e campi prima della lettura", async () => {
  const f = await fixture(); try { await f.sample("X", 1); const url = "data-log-history?" + new URLSearchParams(Object.entries(f.query()).map(([k, v]) => [k, String(v)])); expect((await f.request(url)).status).toBe(401); expect((await f.request(url, undefined, await f.login("viewer"))).status).toBe(403); const headers = await f.login(); expect((await f.request(url + "&sql=select", undefined, headers)).status).toBe(400); expect((await f.request(url + "&limit=0", undefined, headers)).status).toBe(400); expect((await f.request(url + "&logId=forged", undefined, headers)).status).toBe(400); expect(f.store().query(f.query()).samples).toHaveLength(1);
  } finally { await f.close(); }
});
it("campiona su richiesta una sola volta per ID con audit e senza scritture PLC", async () => {
  const f = await fixture(); try { await f.sample("Y", 7); const headers = await f.login(), command = f.command(); const first = await f.request("data-log-sample", command, headers); expect(first.status).toBe(200); expect(await first.json()).toMatchObject({ id: command.id, count: 1, duplicate: false }); const again = await f.request("data-log-sample", command, headers); expect(again.status).toBe(200); expect(await again.json()).toMatchObject({ id: command.id, count: 1, duplicate: true }); expect(f.store().query(f.query("demand")).samples).toHaveLength(1); expect(f.audit.read().events.filter(e => e.operation === "dataLogs.sample").map(e => e.outcome)).toEqual(["duplicate", "requested", "applied", "requested"]); expect(f.commands()).toBe(0);
  } finally { await f.close(); }
});
it("nega campionamenti senza CSRF, capacità, istanza corrente o con autore contraffatto", async () => {
  const f = await fixture(); try { await f.sample("Y", 3); const headers = await f.login(), command = f.command(); expect((await f.request("data-log-sample", command, { Cookie: headers.Cookie })).status).toBe(403); expect((await f.request("data-log-sample", command, await f.login("viewer"))).status).toBe(403); const fresh = await f.login(); expect((await f.request("data-log-sample", { ...command, serviceInstanceId: randomUUID() }, fresh)).status).toBe(409); expect((await f.request("data-log-sample", { ...command, actor: "Admin" }, fresh)).status).toBe(400); expect(f.store().query(f.query("demand")).samples).toHaveLength(0);
  } finally { await f.close(); }
});
it("un audit indisponibile impedisce il campionamento manuale", async () => {
  const f = await fixture(); let restore = () => {}; try { await f.sample("Y", 3); const headers = await f.login(), spy = vi.spyOn(f.audit, "append").mockImplementation(() => { throw new Error("PRIVATE_DISK_ERROR"); }); restore = () => spy.mockRestore(); const response = await f.request("data-log-sample", f.command(), headers); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: "AUTH_AUDIT" }); expect(f.store().query(f.query("demand")).samples).toHaveLength(0);
  } finally { restore(); await f.close(); }
});
it("rilegge dopo il riavvio in sola lettura, senza ripristinare valori PLC o vecchie richieste", async () => {
  const f = await fixture(); try { await f.sample("X", 8); const command = f.command(); await f.restartReadOnly(); const headers = await f.login(), query = f.query(), response = await f.request("data-log-history?" + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])), undefined, headers); expect(response.status).toBe(200); const archived = (await response.json()).samples; expect(archived[0]).toMatchObject({ value: "8", qualityCode: 192 }); expect(archived.at(-1)).toMatchObject({ value: "8", qualityCode: 0 }); expect(f.snapshot().samples).toHaveLength(0); expect((await f.request("data-log-sample", command, headers)).status).toBe(409); expect(f.commands()).toBe(0);
  } finally { await f.close(); }
});

it("le query JSON leggono soltanto e non prolungano la sessione dell’operatore", async () => {
  const f = await fixture(); try { await f.sample("X", 8); const headers = await f.login(); f.advance(30000); const response = await f.request("data-log-query", f.query(), headers); expect(response.status).toBe(200); expect((await response.json()).samples).toHaveLength(1); f.advance(30001); expect((await f.request("data-log-query", f.query(), headers)).status).toBe(401); expect(f.audit.read().events.some(e => e.operation === "dataLogs.sample")).toBe(false); expect(f.commands()).toBe(0); } finally { await f.close(); }
});

it("ricontrolla la sessione dopo l’attesa dell’audit prima di campionare", async () => {
  const f = await fixture(); let release = () => {}, restore = () => {}; try {
    await f.sample("Y", 5); const headers = await f.login(), original = f.audit.append.bind(f.audit); let arrived = false; const held = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(f.audit, "append").mockImplementation(event => { const result = original(event) as { sequence: number; id: string }; if (event.operation === "dataLogs.sample" && event.outcome === "requested") { arrived = true; return held as never; } return result; }); restore = () => spy.mockRestore();
    const pending = f.request("data-log-sample", f.command(), headers); await vi.waitFor(() => expect(arrived).toBe(true)); f.advance(61000); release(); expect((await pending).status).toBe(401); expect(f.store().query(f.query("demand")).samples).toHaveLength(0);
  } finally { release(); restore(); await f.close(); }
});
