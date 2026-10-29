import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { Aedes } from "aedes";
import { connectAsync } from "mqtt";
import { beforeAll, expect, it, vi } from "vitest";
import { openAlarmHistory } from "../runtime/alarm-history-store.mjs";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { createLocalOperatorAuth } from "../runtime/operator-auth.mjs";
import { defaultOperatorResources, type OperatorCapability } from "../runtime/operator-policy.mjs";
import { hashOperatorPassword, writeOperatorStore, type OperatorPassword } from "../runtime/operator-store.mjs";
import { openRuntimeAudit } from "../runtime/audit-store.mjs";
import { emptyAlarmCatalog, type AlarmCommand } from "../runtime/alarm-engine.mjs";
import { parseAlarmStatisticsSnapshot } from "../runtime/alarm-history.mjs";
const origin = "http://127.0.0.1:4173", token = "synthetic_history_token_012345678901234567890", password = "SYNTHETIC-history-password-012345";
let hash: OperatorPassword;
beforeAll(async () => { hash = await hashOperatorPassword(password); }, 15000);
async function fixture(recordLimit = 1000, notes = false) {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "alarm-history-http-")), file = path.join(root, "operators.json"), namespace = randomUUID(), operatorId = randomUUID(), viewerId = randomUUID();
  const capabilities: OperatorCapability[] = ["alarms.acknowledge", "alarms.confirm", "alarms.history.read", ...(notes ? ["alarms.comments.read", "alarms.comment"] as const : [])];
  await writeOperatorStore(file, { version: 2, id: randomUUID(), accounts: [{ id: operatorId, username: "operator", name: "Operatore", role: "Operatore", disabled: false, permissions: [], capabilities, password: hash }, { id: viewerId, username: "viewer", name: "Supervisore", role: "Admin", disabled: false, permissions: [], capabilities: ["alarms.acknowledge"], password: hash }], resourceRules: [operatorId, viewerId].map(accountId => ({ accountId, limits: { ...defaultOperatorResources(), alarmActions: { mode: "selected", ids: ["a"] } } })) }, undefined);
  const broker = await Aedes.createBroker(), tcp = createServer(broker.handle); await new Promise<void>(resolve => tcp.listen(0, "127.0.0.1", resolve)); const address = tcp.address(); if (!address || typeof address === "string") throw new Error();
  const url = "mqtt://127.0.0.1:" + address.port, publisher = await connectAsync(url, { reconnectPeriod: 0 }), audit = openRuntimeAudit({ root, namespace }); let now = 0;
  const variables = [{ name: "Signal", dataType: "Bool", access: "read" as const }], alarms = { ...emptyAlarmCatalog(), classes: [{ name: "Guasto", acknowledgment: "reset" as const }], archive: { enabled: true, maxRecords: 1000 }, alarms: [{ id: "a", name: "Motore", text: "Controlla il motore", tag: "Signal", className: "Guasto", priority: 2, enabled: true, trigger: { kind: "bit" as const, bit: 0, activeWhen: "set" as const } }] };
  const config = { version: 1 as const, gateway: { enabled: true, port: 0, tokenEnv: "SYNTHETIC_HISTORY_TOKEN", allowedOrigins: [origin], allowWrites: false }, connections: [{ id: "mqtt-test", protocol: "mqtt" as const, enabled: true, url, clientId: "history-test", allowInsecure: true, allowWrites: false, timeoutMs: 3000, bindings: [{ tag: "Signal", topic: "signal", valuePath: "/value", qualityPath: "/quality" }] }] };
  let history = openAlarmHistory({ root, namespace, recordLimit }), gateway: ReturnType<typeof createPlcGateway>;
  function make(readOnly = false) { const auth = createLocalOperatorAuth({ file, config: { version: 1, enabled: true, namespace, allowHttpLoopback: true, idleMinutes: 1, absoluteMinutes: 2 }, allowedOrigins: [origin], audit, now: () => now }); return createPlcGateway(config, variables, { resolveSecret: () => token, audit, operatorAuth: auth, alarmHistory: history, alarmCatalog: { ...alarms, archive: { ...alarms.archive, enabled: !readOnly } } }); }
  gateway = make(); await gateway.start(); let plcCommands = 0; broker.on("publish", packet => { if (packet.topic === "command") plcCommands++; });
  const request = (route: string, input?: unknown, headers: Record<string, string> = {}) => fetch(gateway.address + "/_framecraft/plc/v1/" + route, { method: input === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + token, Origin: origin, ...(input === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const login = async (username = "operator") => { const response = await request("session/login", { username, password }); expect(response.status).toBe(200); const body = await response.json(); return { Cookie: response.headers.get("set-cookie")!.split(";")[0], "X-Framecraft-CSRF": body.csrfToken as string }; };
  const sample = async (value: boolean, quality = 192) => { await publisher.publishAsync("signal", JSON.stringify({ value, quality }), { qos: 1 }); if ((quality & 0xc0) === 0xc0) await vi.waitFor(() => expect(gateway.snapshot().samples[0]?.value).toBe(String(value))); await vi.waitFor(() => expect(gateway.snapshot().samples[0]?.qualityCode).toBe(quality)); };
  const action = async (kind: AlarmCommand["action"], headers: Record<string, string>) => { const row = gateway.snapshot().alarms!.rows[0]; const response = await request("alarm-action", { alarmId: row.id, occurrence: row.occurrence!, revision: row.revision, action: kind }, headers); expect(response.status).toBe(200); };
  return { root, namespace, audit, request, login, sample, action, operatorId, snapshot: () => gateway.snapshot(), historyStore: () => history, history: () => history.read(), commands: () => plcCommands, advance: (time: number) => { now = time; }, restartReadOnly: async () => { await gateway.stop(); history.close(); history = openAlarmHistory({ root, namespace, readOnly: true }); gateway = make(true); await gateway.start(); }, close: async () => { await gateway.stop(); history.close(); audit.close(); await publisher.endAsync(true); await new Promise<void>(resolve => broker.close(resolve)); await new Promise<void>(resolve => tcp.close(() => resolve())); } };
}
it("notes use real accounts, resource ACL and audit, preserve MQTT state and deduplicate the same ID", async () => {
  const test = await fixture(1000, true); try {
    const headers = await test.login(); await test.sample(true); const source = test.snapshot().alarms!, query = new URLSearchParams({ alarmId: "a", instanceId: source.instanceId, occurrence: source.rows[0].occurrence! });
    const response = await test.request("alarm-notes?" + query, undefined, headers); expect(response.status).toBe(200); const data = await response.json(); expect(data).toMatchObject({ comments: [], writable: true, reference: { seq: 1 } });
    const command = { version: 1, id: randomUUID(), serviceInstanceId: data.serviceInstanceId, reference: { archiveId: data.id, seq: data.reference.seq, alarmId: "a" }, text: "Sensore controllato\n<img src=x>" };
    const posted = await test.request("alarm-comment", command, headers); expect(posted.status).toBe(200); const result = await posted.json(); expect(result.entry.event.actor.endsWith(":" + test.operatorId)).toBe(true); expect(result.entry.event.note.text).toBe(command.text); expect(result.entry.event.note.authorName).toBe("Operatore");
    const again = await test.request("alarm-comment", command, headers); expect(again.status).toBe(200); expect((await again.json()).duplicate).toBe(true); expect(test.snapshot().alarms).toEqual(source); expect(test.history().count).toBe(2); expect(test.commands()).toBe(0);
    const audit = test.audit.read().events.filter(event => event.operation === "alarms.comment"); expect(audit.filter(event => event.outcome === "applied")).toHaveLength(1); expect(audit.filter(event => event.outcome === "duplicate")).toHaveLength(1); expect(audit.every(event => event.commandId === command.id)).toBe(true);
  } finally { await test.close(); }
});
it("notes require explicitly assigned capabilities, CSRF, exact alarm IDs and strict input", async () => {
  const test = await fixture(1000, true); try {
    const headers = await test.login(); await test.sample(true); const query = "alarm-notes?" + new URLSearchParams({ alarmId: "a", archiveId: test.history().id, seq: "1" });
    expect((await test.request(query)).status).toBe(401); expect((await test.request(query, undefined, await test.login("viewer"))).status).toBe(403); const data = await (await test.request(query, undefined, headers)).json();
    const command = { version: 1, id: randomUUID(), serviceInstanceId: data.serviceInstanceId, reference: { archiveId: data.id, seq: 1, alarmId: "a" }, text: "Verifica" };
    expect((await test.request("alarm-comment", command, { Cookie: headers.Cookie })).status).toBe(403); expect((await test.request("alarm-comment", { ...command, reference: { ...command.reference, alarmId: "other" } }, headers)).status).toBe(403);
    expect((await test.request("alarm-comment", { ...command, actor: "Admin" }, headers)).status).toBe(400); expect((await test.request("alarm-comment", { ...command, serviceInstanceId: randomUUID() }, headers)).status).toBe(409); expect((await test.request(query + "&seq=2", undefined, headers)).status).toBe(400); expect(test.history().count).toBe(1);
  } finally { await test.close(); }
  const old = await fixture(); try { const headers = await old.login(); await old.sample(true); expect((await old.request("alarm-notes?" + new URLSearchParams({ alarmId: "a", archiveId: old.history().id, seq: "1" }), undefined, headers)).status).toBe(403); } finally { await old.close(); }
});
it("unavailable audit blocks a note before writing and never exposes storage errors", async () => {
  const test = await fixture(1000, true); let restore = () => {}; try {
    const headers = await test.login(); await test.sample(true); const data = await (await test.request("alarm-notes?" + new URLSearchParams({ alarmId: "a", archiveId: test.history().id, seq: "1" }), undefined, headers)).json();
    const spy = vi.spyOn(test.audit, "append").mockImplementation(() => { throw new Error("PRIVATE_AUDIT_PASSWORD"); }); restore = () => spy.mockRestore(); const response = await test.request("alarm-comment", { version: 1, id: randomUUID(), serviceInstanceId: data.serviceInstanceId, reference: { archiveId: data.id, seq: 1, alarmId: "a" }, text: "Verifica" }, headers);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE_AUDIT_PASSWORD"); expect(test.history().count).toBe(1);
  } finally { restore(); await test.close(); }
});
it("invalid confirmation after commit is uncertain and the same ID recovers the existing note", async () => {
  const test = await fixture(1000, true); let restore = () => {}; try {
    const headers = await test.login(); await test.sample(true); const data = await (await test.request("alarm-notes?" + new URLSearchParams({ alarmId: "a", archiveId: test.history().id, seq: "1" }), undefined, headers)).json();
    const command = { version: 1 as const, id: randomUUID(), serviceInstanceId: data.serviceInstanceId, reference: { archiveId: data.id, seq: 1, alarmId: "a" }, text: "Verifica" }, store = test.historyStore(), original = store.addComment.bind(store), spy = vi.spyOn(store, "addComment").mockImplementation((input, actor) => { const result = original(input, actor); return { ...result, entry: null } as never; }); restore = () => spy.mockRestore();
    const response = await test.request("alarm-comment", command, headers); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: "ALARM_NOTE_UNCERTAIN", outcome: "uncertain" }); expect(test.history().count).toBe(2); restore();
    const duplicate = await test.request("alarm-comment", command, headers); expect(duplicate.status).toBe(200); expect((await duplicate.json()).duplicate).toBe(true); expect(test.history().count).toBe(2); expect(test.audit.read().events.some(event => event.operation === "alarms.comment" && event.outcome === "uncertain")).toBe(true);
  } finally { restore(); await test.close(); }
});
it("revocation while the request audit is pending is checked again before storing the note", async () => {
  const test = await fixture(1000, true); let release = () => {}, restore = () => {}; try {
    const headers = await test.login(); await test.sample(true); const data = await (await test.request("alarm-notes?" + new URLSearchParams({ alarmId: "a", archiveId: test.history().id, seq: "1" }), undefined, headers)).json(), original = test.audit.append.bind(test.audit); let arrived = false;
    const held = new Promise<void>(resolve => { release = resolve; }); const spy = vi.spyOn(test.audit, "append").mockImplementation(event => { const result = original(event); if (event.operation === "alarms.comment" && event.outcome === "requested") { arrived = true; return held as never; } return result as { sequence: number; id: string }; }); restore = () => spy.mockRestore();
    const pending = test.request("alarm-comment", { version: 1, id: randomUUID(), serviceInstanceId: data.serviceInstanceId, reference: { archiveId: data.id, seq: 1, alarmId: "a" }, text: "Verifica" }, headers); await vi.waitFor(() => expect(arrived).toBe(true)); expect((await test.request("session/logout", {}, headers)).status).toBe(200); release(); expect((await pending).status).toBe(401); expect(test.history().count).toBe(1);
  } finally { release(); restore(); await test.close(); }
});
it("notes remain readable after restart but stale requests and read-only archive writes are rejected", async () => {
  const test = await fixture(1000, true); try {
    let headers = await test.login(); await test.sample(true); const query = "alarm-notes?" + new URLSearchParams({ alarmId: "a", archiveId: test.history().id, seq: "1" }), data = await (await test.request(query, undefined, headers)).json();
    const command = { version: 1, id: randomUUID(), serviceInstanceId: data.serviceInstanceId, reference: { archiveId: data.id, seq: 1, alarmId: "a" }, text: "Verifica prima del riavvio" }; expect((await test.request("alarm-comment", command, headers)).status).toBe(200); await test.restartReadOnly(); headers = await test.login(); const next = await (await test.request(query, undefined, headers)).json(); expect(next).toMatchObject({ writable: false, comments: [{ event: { note: { text: command.text } } }] }); expect(next.serviceInstanceId).not.toBe(data.serviceInstanceId);
    expect((await test.request("alarm-comment", command, headers)).status).toBe(409); expect((await test.request("alarm-comment", { ...command, serviceInstanceId: next.serviceInstanceId }, headers)).status).toBe(503); expect(test.history().count).toBe(2); expect(test.commands()).toBe(0);
  } finally { await test.close(); }
});
it("persists actual MQTT transitions and operator actions across a clean restart without restoring live state", async () => {
  const test = await fixture(); try {
    const headers = await test.login(); await test.sample(true); await test.action("acknowledge", headers); await test.sample(false, 0); expect(test.history().sequence).toBe(2); expect(test.snapshot().alarms!.rows[0].active).toBe(true);
    await test.sample(false); await test.action("confirm", headers); expect(test.history().events.map(row => row.event.state)).toEqual(["Confirmed", "Outgoing", "Acknowledged", "Incoming"]); expect(test.history().events[0].event.actor).toMatch(/^local:[a-f0-9-]{36}:/); expect(test.history().events[0].event.actor?.endsWith(":" + test.operatorId)).toBe(true);
    expect((await test.request("alarm-history")).status).toBe(401); expect((await test.request("alarm-history", undefined, await test.login("viewer"))).status).toBe(403);
    for (const suffix of ["alarm-history?limit=1&limit=2", "alarm-history?sql=select", "alarm-history?through="]) expect((await test.request(suffix, undefined, headers)).status).toBe(400);
    const response = await test.request("alarm-history", undefined, headers); expect(response.status).toBe(200); const text = await response.text(); expect(JSON.parse(text)).toMatchObject({ count: 4, incompleteRuns: 0, capture: { state: "recording", unconfirmedInThisRun: 0 } }); for (const secret of [token, password, headers.Cookie]) expect(text).not.toContain(secret);
    await test.restartReadOnly(); expect(test.snapshot().alarms!.rows[0]).toMatchObject({ active: null, quality: "unknown" }); expect(test.snapshot().alarms!.sequence).toBe(0);
    expect((await test.request("alarm-history", undefined, headers)).status).toBe(401); const next = await test.login(), old = await test.request("alarm-history", undefined, next); expect(old.status).toBe(200); expect(await old.json()).toMatchObject({ count: 4, incompleteRuns: 0, capture: { state: "disabled", unconfirmedInThisRun: 0 } }); expect(test.commands()).toBe(0);
  } finally { await test.close(); }
});
it("exposes an archive capacity failure without stopping acquisition or inventing a cleared alarm", async () => {
  const test = await fixture(1); try { await test.sample(true); await test.sample(false); expect(test.snapshot().alarms!.rows[0].active).toBe(false); expect(test.history().sequence).toBe(1); expect(test.snapshot().alarmHistory).toMatchObject({ state: "error", code: "ALARM_HISTORY_LIMIT", unconfirmedInThisRun: 1 }); const response = await test.request("alarm-history", undefined, await test.login()); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ count: 1, capture: { state: "error", unconfirmedInThisRun: 1 } }); expect(test.commands()).toBe(0); } finally { await test.close(); }
});
it("does not renew the operator idle timeout on an archive read", async () => {
  const test = await fixture(); try { const headers = await test.login(); test.advance(30000); expect((await test.request("alarm-history", undefined, headers)).status).toBe(200); test.advance(60001); expect((await test.request("alarm-history", undefined, headers)).status).toBe(401); } finally { await test.close(); }
});
it("protects full-history statistics with the read capability and validates parameters before calculating", async () => {
  const test = await fixture(); try {
    await test.sample(true); const headers = await test.login(); await test.action("acknowledge", headers); await test.sample(false);
    expect((await test.request("alarm-statistics")).status).toBe(401); expect((await test.request("alarm-statistics", undefined, await test.login("viewer"))).status).toBe(403);
    for (const route of ["alarm-statistics?order=sql", "alarm-statistics?before=1", "alarm-statistics?limit=1&limit=2", "alarm-statistics?limit=501", "alarm-statistics?sql=select"]) expect((await test.request(route, undefined, headers)).status).toBe(400);
    const response = await test.request("alarm-statistics", undefined, headers); expect(response.status).toBe(200); const text = await response.text(), result = parseAlarmStatisticsSnapshot(JSON.parse(text));
    expect(result).toMatchObject({ matchedEvents: 3, activations: 1, through: 3, capture: { state: "recording" } }); expect(result.rows[0]).toMatchObject({ active: { pairs: 1 }, ack: { pairs: 1 } }); for (const secret of [token, password, headers.Cookie]) expect(text).not.toContain(secret); expect(test.commands()).toBe(0);
    await test.restartReadOnly(); const historical = await test.request("alarm-statistics", undefined, await test.login()); expect(historical.status).toBe(200); expect(await historical.json()).toMatchObject({ matchedEvents: 3, capture: { state: "disabled" } });
  } finally { await test.close(); }
});
it("reauthorizes after calculation and does not renew the operator idle timeout", async () => {
  const test = await fixture(); try {
    const headers = await test.login(); test.advance(30000); const store = test.historyStore(), calculate = store.statistics.bind(store);
    const pending = vi.spyOn(store, "statistics").mockImplementationOnce(async (...args) => { const result = await calculate(...args); test.advance(60001); return result; });
    const response = await test.request("alarm-statistics", undefined, headers); expect(response.status).toBe(401); expect(await response.json()).toMatchObject({ type: "operator", code: "AUTH_REQUIRED" }); expect(pending).toHaveBeenCalledOnce(); pending.mockRestore(); expect(test.commands()).toBe(0);
  } finally { await test.close(); }
});
