// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Aedes } from "aedes";
import { connectAsync } from "mqtt";
import { createServer } from "node:net";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { emptyAlarmCatalog, type AlarmCommand } from "../runtime/alarm-engine.mjs";
import { createHmiGatewayClient } from "../src/core/hmiGateway";

const token = "synthetic_alarm_gateway_token_0123456789", api = "/_framecraft/plc/v1", origin = "http://localhost:4173";
async function fixture(authorize?: (command: AlarmCommand) => string | undefined | Promise<string | undefined>) {
  const broker = await Aedes.createBroker(), tcp = createServer(broker.handle); await new Promise<void>((resolve) => tcp.listen(0, "127.0.0.1", resolve));
  const address = tcp.address(); if (!address || typeof address === "string") throw new Error("Broker fixture non disponibile.");
  const url = "mqtt://127.0.0.1:" + address.port, publisher = await connectAsync(url, { reconnectPeriod: 0 });
  const variables = [{ name: "Signal", dataType: "Bool", access: "read" as const }];
  const alarms = { ...emptyAlarmCatalog(), alarms: [{ id: "a", name: "Motor", text: "Controlla motore", tag: "Signal", className: "Alarm_CTH", priority: 3, enabled: true, trigger: { kind: "bit" as const, bit: 0, activeWhen: "set" as const } }] };
  const gateway = createPlcGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "ALARM_TEST_TOKEN", allowedOrigins: [origin], allowWrites: false }, connections: [{ id: "plc", protocol: "mqtt", enabled: true, url, clientId: "alarm-service", allowInsecure: true, allowWrites: false, timeoutMs: 3000, bindings: [{ tag: "Signal", topic: "signal", valuePath: "/value", qualityPath: "/quality" }] }] }, variables,
    { alarmCatalog: alarms, resolveSecret: () => token, ...(authorize ? { authorizeAlarmAction: (_request, command) => authorize(command) } : {}) });
  await gateway.start();
  const request = (suffix: string, init: RequestInit = {}) => fetch(gateway.address + api + suffix, { ...init, headers: { Authorization: "Bearer " + token, Origin: origin, ...init.headers } });
  const sample = async (value: boolean, quality = 192) => { await publisher.publishAsync("signal", JSON.stringify({ value, quality }), { qos: 1 }); await vi.waitFor(() => expect(gateway.snapshot().samples[0]?.qualityCode).toBe(quality)); };
  return { gateway, request, sample, publisher, broker, async close() { await gateway.stop(); await publisher.endAsync(true); await new Promise<void>((resolve) => broker.close(resolve)); await new Promise<void>((resolve) => tcp.close(() => resolve())); } };
}
const command = (test: Awaited<ReturnType<typeof fixture>>): AlarmCommand => { const row = test.gateway.snapshot().alarms!.rows[0]; return { alarmId: row.id, occurrence: row.occurrence!, revision: row.revision, action: "acknowledge" }; };
const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("allarmi nel servizio condiviso MQTT/HTTP", () => {
  it.each([null, false, 0, ""])("rifiuta un catalogo presente ma invalido (%s), senza avviare connessioni", (alarmCatalog) => {
    expect(() => createPlcGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "ALARM_TEST_TOKEN", allowedOrigins: [origin], allowWrites: false }, connections: [] }, [], { resolveSecret: () => token, alarmCatalog: alarmCatalog as never })).toThrow(/allarmi non valido/);
  });
  it("una risposta di presa visione in ritardo non ripristina la qualità precedente al polling", async () => {
    const test = await fixture(() => "Operator"); let release!: () => void, arrived = false, quality: string | undefined;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const client = createHmiGatewayClient({ pollMs: 100, onSnapshot: (snapshot) => { quality = snapshot.alarms?.rows[0].quality; }, request: async (input, init) => {
      const response = await test.request(String(input).slice(api.length), init);
      if (String(input).endsWith("/alarm-action")) { arrived = true; await hold; }
      return response;
    } });
    try {
      await test.sample(true); await vi.waitFor(() => expect(test.gateway.snapshot().alarms!.rows[0].active).toBe(true)); client.start(); await vi.waitFor(() => expect(client.state).toBe("connected"));
      const pending = client.alarmAction(command(test)); await vi.waitFor(() => expect(arrived).toBe(true)); await test.sample(false, 0); await vi.waitFor(() => expect(quality).toBe("bad")); release();
      expect((await pending).rows[0]).toMatchObject({ quality: "bad", active: true, acknowledged: true });
    } finally { release(); client.stop(); await test.close(); }
  });
  it("acquisisce allarmi reali ma nega i comandi senza autorizzazione server", async () => {
    const test = await fixture();
    try {
      await test.sample(true); await vi.waitFor(() => expect(test.gateway.snapshot().alarms!.rows[0].active).toBe(true));
      expect(test.gateway.snapshot().alarms!.actionsEnabled).toBe(false);
      const result = await test.request("/alarm-action", post({ ...command(test), actor: "Browser fake admin" })); expect(result.status).toBe(403); expect((await result.json()).error).toContain("PIN del browser");
      expect(test.gateway.snapshot().alarms!.rows[0].acknowledged).toBe(false);
      await test.sample(false, 0); expect(test.gateway.snapshot().alarms!.rows[0]).toMatchObject({ active: true, quality: "bad" });
      await test.sample(false); await vi.waitFor(() => expect(test.gateway.snapshot().alarms!.rows[0]).toMatchObject({ active: false, pending: true }));
      const snapshot = await (await test.request("/snapshot")).json(); expect(snapshot.alarms.history.map((e: { state: string }) => e.state)).toEqual(["Incoming", "Outgoing"]);
    } finally { await test.close(); }
  });
  it("due client condividono lo stato: una presa visione, nessun comando PLC", async () => {
    const authorize = vi.fn(() => "Authenticated Operator"), test = await fixture(authorize); let commands = 0;
    test.broker.on("publish", (packet) => { if (packet.topic === "command") commands++; });
    try {
      await test.sample(true); await vi.waitFor(() => expect(test.gateway.snapshot().alarms!.rows[0].active).toBe(true));
      const current = command(test), responses = await Promise.all([test.request("/alarm-action", post(current)), test.request("/alarm-action", post(current))]); expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(test.gateway.snapshot().alarms!.rows[0]).toMatchObject({ active: true, acknowledged: true, pending: true });
      expect(test.gateway.snapshot().alarms!.history.filter((e) => e.state === "Acknowledged")).toMatchObject([{ actor: "Authenticated Operator" }]); expect(commands).toBe(0);
      const denied = await test.request("/alarm-action", { ...post(current), headers: { Authorization: "wrong", "Content-Type": "application/json" } }); expect(denied.status).toBe(401);
      const malformed = await test.request("/alarm-action", post({ ...current, actor: "UNTRUSTED" })); expect(malformed.status).toBe(400); expect(authorize).toHaveBeenCalledTimes(2);
    } finally { await test.close(); }
  });
  it("ricontrolla la revisione dopo un'autorizzazione asincrona e non espone errori privati", async () => {
    let release!: (actor: string) => void; const authorize = vi.fn(() => new Promise<string>((resolve) => { release = resolve; })), test = await fixture(authorize);
    try {
      await test.sample(true); await vi.waitFor(() => expect(test.gateway.snapshot().alarms!.rows[0].active).toBe(true));
      const pending = test.request("/alarm-action", post(command(test))); await vi.waitFor(() => expect(authorize).toHaveBeenCalledOnce()); await test.sample(false, 0); release("Operator"); expect((await pending).status).toBe(409); expect(test.gateway.snapshot().alarms!.rows[0].acknowledged).toBe(false);
    } finally { release?.("Operator"); await test.close(); }
    const denied = await fixture(() => { throw new Error("PRIVATE_PASSWORD"); });
    try { await denied.sample(true); await vi.waitFor(() => expect(denied.gateway.snapshot().alarms!.rows[0].active).toBe(true)); const response = await denied.request("/alarm-action", post(command(denied))); expect(response.status).toBe(403); expect(await response.text()).not.toContain("PRIVATE_PASSWORD"); }
    finally { await denied.close(); }
  });
  it("client browser accetta gli stati del servizio e non ritenta automaticamente l'azione", async () => {
    const test = await fixture(() => "Operator"), request = vi.fn((input: RequestInfo | URL, init?: RequestInit) => test.request(String(input).slice(api.length), init)); const client = createHmiGatewayClient({ pollMs: 100, request });
    try {
      await test.sample(true); await vi.waitFor(() => expect(test.gateway.snapshot().alarms!.rows[0].active).toBe(true)); client.start(); await vi.waitFor(() => expect(client.state).toBe("connected"));
      const result = await client.alarmAction(command(test)); expect(result.rows[0]).toMatchObject({ active: true, acknowledged: true });
      expect(request.mock.calls.filter(([url]) => String(url).endsWith("/alarm-action"))).toHaveLength(1);
      client.stop(); await expect(client.alarmAction(command(test))).rejects.toThrow("non disponibile"); expect(request.mock.calls.filter(([url]) => String(url).endsWith("/alarm-action"))).toHaveLength(1);
    } finally { client.stop(); await test.close(); }
  });
});
