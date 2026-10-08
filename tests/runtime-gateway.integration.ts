// @vitest-environment node
import { Aedes, type Client } from "aedes";
import { connectAsync } from "mqtt";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { createMqttGateway } from "../runtime/gateway.mjs";
import { createHmiGatewayClient, type HmiGatewaySnapshot } from "../src/core/hmiGateway";
import { standardProjectFiles } from "../src/core/standardProject";
import { parseConnectionConfiguration, serializeConnectionConfiguration } from "../src/core/plcConnections";
import { inspectHmiScript, type HmiScriptTransport } from "../src/core/hmiScript";

const api = "/_framecraft/plc/v1", token = "test_gateway_token_not_a_real_secret_0123456789", origin = "http://127.0.0.1:4173";
const variables = [{ name: "Motor.Speed", dataType: "Real", access: "read-write" as const }, { name: "Motor.On", dataType: "Bool", access: "read" as const }];
async function fixture(allowWrites = true) {
  const broker = await Aedes.createBroker(), tcp = createServer(broker.handle), clients = new Map<string, Client>();
  broker.on("client", (client) => clients.set(client.id, client));
  await new Promise<void>((resolve, reject) => { tcp.once("error", reject); tcp.listen(0, "127.0.0.1", resolve); });
  const address = tcp.address(); if (!address || typeof address === "string") throw new Error("Broker non avviato.");
  const url = "mqtt://127.0.0.1:" + address.port, publisher = await connectAsync(url, { reconnectPeriod: 0 });
  const catalog = { version: 1 as const, gateway: { enabled: true, port: 0, tokenEnv: "GATEWAY_TEST_TOKEN", allowedOrigins: [origin], allowWrites }, connections: [{
    id: "mqtt-test", protocol: "mqtt" as const, enabled: true, url, clientId: "gateway-test", allowInsecure: true, allowWrites: true, reconnectMs: 250, timeoutMs: 3_000,
    bindings: [{ tag: "Motor.Speed", topic: "speed", valuePath: "/value", qualityPath: "/quality", timestampPath: "/time", writeTopic: "command" }, { tag: "Motor.On", topic: "on", encoding: "text" as const }],
  }] };
  const gateway = createMqttGateway(catalog, variables, { resolveSecret: () => token }); await gateway.start();
  const request = (route: string, init: RequestInit = {}) => fetch(gateway.address + api + route, { ...init, headers: { Authorization: "Bearer " + token, Origin: origin, ...init.headers } });
  return { broker, publisher, clients, gateway, request, catalog, async close() {
    await gateway.stop(); await publisher.endAsync(true); await new Promise<void>((resolve) => broker.close(resolve)); await new Promise<void>((resolve) => tcp.close(() => resolve()));
  } };
}
function command(id = "command_0123456789", value = 55) { return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, tag: "Motor.Speed", value }) }; }

function generatedScriptRuntime() {
  const source = standardProjectFiles({ machineName: "Script MQTT", layout: "desktop", sections: ["main"] }).find((file) => file.path === "src/framecraftScriptRuntime.ts")!.content;
  const exports = {}, module = { exports };
  new Function("exports", "module", transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText)(exports, module);
  return module.exports as typeof import("../src/core/hmiScript");
}
function scriptClient(test: Awaited<ReturnType<typeof fixture>>) {
  const client = createHmiGatewayClient({ pollMs: 100, request: (input, init) => fetch(test.gateway.address + String(input), { ...init, headers: { ...init?.headers, Authorization: "Bearer " + token, Origin: origin } }) });
  const transport: HmiScriptTransport = {
    async read(request, signal) {
      const sample = await client.read(request.tag, { mode: request.mode, maxAge: request.maxAge, signal });
      return { value: sample.value!, status: { qualityCode: sample.qualityCode, qualityKnown: sample.qualityCode !== undefined, timeStamp: sample.timestamp } };
    },
    async write(request, signal) { return client.write(request.tag, request.value as string | number | boolean, signal); },
  };
  client.start(); return { client, transport };
}
const scriptProgram = (source: string) => { const inspected = inspectHmiScript(source); expect(inspected.error).toBeUndefined(); return inspected.program!; };

describe("bridge MQTT HTTP reale", () => {
  it("sospende l'interprete distribuito fino all'ack reale, senza rigiocare effetti o anticipare il valore PLC", async () => {
    const test = await fixture(), { client, transport } = scriptClient(test), runtime = generatedScriptRuntime();
    const blocked: Array<(error?: Error | null) => void> = []; let attempts = 0;
    test.broker.authorizePublish = (source, packet, callback) => { if (source?.id === "gateway-test" && packet.topic === "command") { attempts++; blocked.push(callback); } else callback(null); };
    try {
      await test.publisher.publishAsync("speed", JSON.stringify({ value: 10, quality: 192, time: 1_000 }), { qos: 1 });
      await vi.waitFor(async () => expect((await client.read("Motor.Speed")).value).toBe("10"));
      const scope = runtime.createHmiScriptScope(scriptProgram("let counter = 0;"));
      const pending = runtime.executeHmiScriptAsync(scriptProgram('counter = counter + 1; const set = Tags.CreateTagSet([["Motor.Speed", 55]]); await set.WriteAsync(); counter = counter + 1; await set.ReadAsync(); return set("Motor.Speed").Value;'), {}, { transport, globalScope: scope });
      await vi.waitFor(() => expect(attempts).toBe(1)); expect(scope.values.get("counter")).toBe(1);
      expect(test.gateway.snapshot().samples[0]?.value).toBe("10"); blocked.shift()!(null);
      const result = await pending;
      expect(result).toMatchObject({ returned: 10, reads: { "Motor.Speed": "10" }, writes: {}, commands: [{ tag: "Motor.Speed", outcome: "delivered", delivery: "broker-ack", plcConfirmed: false }] });
      expect(result.error).toBeUndefined(); expect(scope.values.get("counter")).toBe(2); expect(attempts).toBe(1);
      expect((await client.read("Motor.Speed")).value).toBe("10");
    } finally { for (const callback of blocked) callback(new Error("Fine fixture.")); client.stop(); await test.close(); }
  });

  it("mantiene fulfilled un batch reale parziale, per-tag error e nessun hmiWriteWait simulato", async () => {
    const test = await fixture(), { client, transport } = scriptClient(test), runtime = generatedScriptRuntime(); let attempts = 0;
    test.broker.authorizePublish = (source, packet, callback) => { if (source?.id === "gateway-test" && packet.topic === "command") attempts++; callback(null); };
    try {
      await vi.waitFor(() => expect(client.state).toBe("connected"));
      const result = await runtime.executeHmiScriptAsync(scriptProgram('const set = Tags.CreateTagSet([["Motor.Speed", 44], ["Motor.On", true]]); await set.WriteAsync(); return JSON.stringify([set.LastError, set("Motor.On").LastError]);'), {}, { transport });
      expect(result.error).toBeUndefined(); expect(JSON.parse(String(result.returned))).toEqual([0x80040004, 0x80040002]);
      expect(result.commands?.map((item) => item.outcome)).toEqual(["delivered", "rejected"]); expect(result.writes).toEqual({}); expect(attempts).toBe(1);
      const wait = await runtime.executeHmiScriptAsync(scriptProgram('const set = Tags.CreateTagSet([["Motor.Speed", 99]]); await set.WriteAsync(1);'), {}, { transport });
      expect(wait.error).toContain("conferma PLC"); expect(wait.commands?.[0].outcome).toBe("rejected"); expect(attempts).toBe(1);
    } finally { client.stop(); await test.close(); }
  });

  it("legge i soli campioni ricevuti, conserva qualità sconosciuta e rifiuta letture CPU o troppo vecchie", async () => {
    const test = await fixture(), { client, transport } = scriptClient(test), runtime = generatedScriptRuntime();
    try {
      await test.publisher.publishAsync("on", "true", { qos: 1 });
      await test.publisher.publishAsync("speed", JSON.stringify({ value: 12, quality: 192, time: Date.now() - 60_000 }), { qos: 1 });
      await vi.waitFor(async () => expect((await client.read("Motor.On")).value).toBe("true"));
      await vi.waitFor(async () => expect((await client.read("Motor.Speed")).value).toBe("12"));
      const result = await runtime.executeHmiScriptAsync(scriptProgram('const set = Tags.CreateTagSet(["Motor.On", "Missing"]); await set.ReadAsync(); return set("Motor.On").Value;'), {}, { transport });
      expect(result.error).toBeUndefined(); expect(result.returned).toBe(true); expect(result.tagStatus["Motor.On"]).toMatchObject({ qualityCode: 0, qualityKnown: false }); expect(result.tagStatus.Missing.lastError).toBe(0x80040002);
      expect((await runtime.executeHmiScriptAsync(scriptProgram('const set = Tags.CreateTagSet(["Motor.Speed"]); await set.ReadAsync(1);'), {}, { transport })).error).toContain("forzata");
      expect((await runtime.executeHmiScriptAsync(scriptProgram('const set = Tags.CreateTagSet(["Motor.Speed"]); set.ReadMaxAge(50);'), {}, { transport })).error).toContain("vecchio");
      expect((await client.read("Motor.Speed")).value).toBe("12");
    } finally { client.stop(); await test.close(); }
  });

  it("interrompe una scrittura HTTP in volo senza eseguire il comando seguente o ripubblicare alla riapertura", async () => {
    const test = await fixture(), { client, transport } = scriptClient(test), runtime = generatedScriptRuntime(), abort = new AbortController();
    const blocked: Array<(error?: Error | null) => void> = []; let attempts = 0;
    test.broker.authorizePublish = (source, packet, callback) => { if (source?.id === "gateway-test" && packet.topic === "command") { attempts++; blocked.push(callback); } else callback(null); };
    try {
      await vi.waitFor(() => expect(client.state).toBe("connected"));
      const pending = runtime.executeHmiScriptAsync(scriptProgram('Tags("Motor.Speed").Write(1); Tags("Motor.Speed").Write(2);'), {}, { transport, signal: abort.signal });
      await vi.waitFor(() => expect(attempts).toBe(1)); abort.abort(); client.stop();
      const result = await pending; expect(result.commands?.[0].outcome).toBe("uncertain"); expect(result.error).toBeTruthy(); expect(result.commands).toHaveLength(1);
      test.clients.get("gateway-test")!.conn.destroy(); for (const callback of blocked.splice(0)) callback(new Error("Comando di collaudo scartato."));
      await vi.waitFor(() => expect(test.gateway.snapshot().connections[0].state).toBe("connected"), { timeout: 3_000 });
      client.start(); await vi.waitFor(() => expect(client.state).toBe("connected")); expect(attempts).toBe(1);
    } finally { for (const callback of blocked) callback(new Error("Fine fixture.")); client.stop(); await test.close(); }
  });

  it("esegue il mapping serializzato dall’editor connessioni sul broker e gateway reali", async () => {
    const test = await fixture(); const reservation = createServer();
    await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
    const reserved = reservation.address(); if (!reserved || typeof reserved === "string") throw new Error("Porta locale non disponibile.");
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const catalog = { ...test.catalog, gateway: { ...test.catalog.gateway, port: reserved.port }, connections: test.catalog.connections.map((c) => ({ ...c, clientId: "editor-config-test" })) };
    const model = parseConnectionConfiguration({ generation: 1, files: { connections: JSON.stringify(catalog), runtime: null, plc: JSON.stringify({ version: 1, variables }) } });
    const connection = model.catalog.connections[0]; if (connection.protocol !== "mqtt") throw new Error("Fixture MQTT richiesta");
    connection.bindings[0].timestampUnit = "s"; model.runtime.gateway.enabled = true;
    const serialized = serializeConnectionConfiguration(model);
    const gateway = createMqttGateway(JSON.parse(serialized.connections), variables, { resolveSecret: () => token });
    try {
      await gateway.start(); await test.publisher.publishAsync("speed", JSON.stringify({ value: 78, quality: 192, time: 123 }), { qos: 1 });
      await vi.waitFor(() => expect(gateway.snapshot().samples.find((sample) => sample.tag === "Motor.Speed")).toMatchObject({ value: "78", qualityCode: 192, timestamp: 123000 }));
      const response = await fetch(gateway.address + api + "/snapshot", { headers: { Authorization: "Bearer " + token, Origin: origin } });
      expect(response.status).toBe(200); expect((await response.json()).tags[0]).toMatchObject({ dataType: "Real", access: "read-write", writable: true });
      expect(serialized.connections).not.toContain(token);
    } finally { await gateway.stop(); await test.close(); }
  });
  it("avvia il gateway distribuito dal pannello generato e serve un campione reale su HTTP", async () => {
    const test = await fixture(), base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "generated-gateway-"));
    let child: ReturnType<typeof spawn> | undefined, exited: Promise<void> | undefined;
    try {
      const files = standardProjectFiles({ machineName: "Gateway", layout: "desktop", sections: ["main"] }).filter((file) => file.path.startsWith("runtime/") || ["framecraft.connections.json", "framecraft.plc.json"].includes(file.path));
      for (const file of files) { const target = path.resolve(root, file.path); if (path.relative(root, target).startsWith("..")) throw new Error("Fixture fuori dal progetto."); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content); }
      const catalog = { ...test.catalog, connections: test.catalog.connections.map((connection) => ({ ...connection, clientId: "generated-gateway-test" })) };
      await writeFile(path.join(root, "framecraft.connections.json"), JSON.stringify(catalog)); await writeFile(path.join(root, "framecraft.plc.json"), JSON.stringify({ version: 1, variables }));
      child = spawn(process.execPath, [path.join(root, "runtime/start-gateway.mjs"), "--json"], { cwd: root, env: { ...process.env, GATEWAY_TEST_TOKEN: token }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      let output = "", errors = ""; child.stdout!.on("data", (chunk) => { output += String(chunk); }); child.stderr!.on("data", (chunk) => { errors += String(chunk); });
      exited = new Promise<void>((resolve, reject) => { child!.once("exit", () => resolve()); child!.once("error", reject); });
      await vi.waitFor(() => expect(output).toContain('"type":"gateway"'), { timeout: 8_000 });
      const event = output.split("\n").filter(Boolean).map((line) => JSON.parse(line)).find((item) => item.type === "gateway");
      expect(event.address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      await test.publisher.publishAsync("speed", JSON.stringify({ value: 123, quality: 192, time: 2_000 }), { qos: 1 });
      await vi.waitFor(async () => { const response = await fetch(event.address + api + "/snapshot", { headers: { Authorization: "Bearer " + token, Origin: origin } }); expect((await response.json()).samples[0]?.value).toBe("123"); });
      expect(errors).toContain('"code":"INSECURE_TRANSPORT"'); expect(errors).not.toContain('"level":"error"'); expect(output).not.toContain(token);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); if (exited) await exited; await test.close();
      const resolved = await realpath(root), intended = await realpath(base); if (path.dirname(resolved) !== intended || !path.basename(resolved).startsWith("generated-gateway-")) throw new Error("Cleanup fixture non valido."); await rm(resolved, { recursive: true, force: true });
    }
  }, 15_000);
  it("porta campioni e metadati dal broker al client HMI senza esporre endpoint o segreti", async () => {
    const test = await fixture(); const snapshots: HmiGatewaySnapshot[] = [];
    const address = test.gateway.address!;
    const client = createHmiGatewayClient({ pollMs: 100, onSnapshot: (snapshot) => snapshots.push(snapshot), request: (input, init) => fetch(address + String(input), { ...init, headers: { ...init?.headers, Authorization: "Bearer " + token, Origin: origin } }) });
    try {
      client.start(); await test.publisher.publishAsync("speed", JSON.stringify({ value: 42, quality: 0x2080, time: 1_000 }), { qos: 1 }); await test.publisher.publishAsync("on", "true", { qos: 1 });
      await vi.waitFor(() => expect(snapshots.at(-1)?.samples.find((sample) => sample.tag === "Motor.Speed")?.value).toBe("42"));
      const snapshot = snapshots.at(-1)!; expect(snapshot.samples.find((sample) => sample.tag === "Motor.Speed")).toMatchObject({ qualityCode: 0x2080, timestamp: 1_000, sourceTimestamp: 1_000 });
      expect(snapshot.samples.find((sample) => sample.tag === "Motor.On")?.qualityCode).toBeUndefined();
      expect(JSON.stringify(snapshot)).not.toContain(token); expect(JSON.stringify(snapshot)).not.toContain("mqtt://"); expect(client.state).toBe("connected");
    } finally { client.stop(); await test.close(); }
  });
  it("richiede token, origine esatta e autorizzazione di scrittura sul servizio, non solo sul browser", async () => {
    const test = await fixture(false);
    try {
      expect((await fetch(test.gateway.address + api + "/snapshot")).status).toBe(401);
      expect((await test.request("/snapshot", { headers: { Origin: "https://attacker.invalid" } })).status).toBe(403);
      expect((await test.request("/write", command())).status).toBe(403);
      expect((await test.request("/write", { ...command(), headers: { "Content-Type": "text/plain" } })).status).toBe(415);
      const response = await test.request("/snapshot"); expect(response.headers.get("access-control-allow-origin")).toBeNull(); expect(response.headers.get("cache-control")).toBe("no-store");
      expect((await test.request("/write", { ...command(), body: "x".repeat(20_000) })).status).toBe(413);
    } finally { await test.close(); }
  });
  it("consegna un comando una sola volta, non aggiorna il valore letto e riconosce id ripetuti o in conflitto", async () => {
    const test = await fixture(); let attempts = 0;
    test.broker.authorizePublish = (client, packet, callback) => { if (client?.id === "gateway-test" && packet.topic === "command") attempts++; callback(null); };
    try {
      await test.publisher.publishAsync("speed", JSON.stringify({ value: 10, quality: 192, time: 1_000 }), { qos: 1 });
      await vi.waitFor(() => expect(test.gateway.snapshot().samples[0]?.value).toBe("10"));
      const response = await test.request("/write", command()); expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ outcome: "delivered", delivery: "broker-ack", plcConfirmed: false });
      expect((await test.request("/write", command())).status).toBe(200); expect(attempts).toBe(1);
      expect((await test.request("/write", command("command_0123456789", 99))).status).toBe(409); expect(attempts).toBe(1);
      expect(test.gateway.snapshot().samples[0]?.value).toBe("10");
      expect((await test.request("/write", { ...command(), body: JSON.stringify({ id: "unknown_0123456789", tag: "Not.Declared", value: 1 }) })).status).toBe(403);
      expect((await test.request("/write", { ...command(), body: JSON.stringify({ id: "readonly_0123456789", tag: "Motor.On", value: true }) })).status).toBe(403);
      expect((await test.request("/write", command("invalid_0123456789", "invalid" as unknown as number))).status).toBe(400);
      expect(attempts).toBe(1);
    } finally { await test.close(); }
  });
  it("mantiene incerto un comando senza ack e non lo ripubblica dopo perdita di connessione", async () => {
    const test = await fixture(); let attempts = 0; const blocked: Array<(error?: Error | null) => void> = [];
    test.broker.authorizePublish = (client, packet, callback) => { if (client?.id === "gateway-test" && packet.topic === "command") { attempts++; blocked.push(callback); } else callback(null); };
    try {
      const pending = test.request("/write", command()); await vi.waitFor(() => expect(attempts).toBe(1)); test.clients.get("gateway-test")!.conn.destroy();
      const response = await pending; expect(response.status).toBe(502); expect(await response.json()).toMatchObject({ outcome: "uncertain", plcConfirmed: false });
      await vi.waitFor(() => expect(test.gateway.snapshot().connections[0].state).toBe("connected"), { timeout: 3_000 });
      const repeated = await test.request("/write", command()); expect(repeated.status).toBe(502); expect(attempts).toBe(1);
    } finally { for (const callback of blocked) callback(new Error("Comando di collaudo scartato.")); await test.close(); }
  });
  it("rifiuta gateway esposto, token in chiaro o mancante e origini ambigue", () => {
    const base = { version: 1 as const, connections: [], gateway: { enabled: true, port: 0, tokenEnv: "TEST", allowedOrigins: [origin] } };
    expect(() => createMqttGateway(base, variables, { resolveSecret: () => "short" })).toThrow("Credenziale del servizio mancante");
    expect(() => createMqttGateway({ ...base, gateway: { ...base.gateway, tokenEnv: "VITE_GATEWAY_TOKEN" } }, variables, { resolveSecret: () => token })).toThrow("mai VITE_");
    expect(() => createMqttGateway({ ...base, gateway: { ...base.gateway, host: "0.0.0.0" as "127.0.0.1" } }, variables, { resolveSecret: () => token })).toThrow("loopback");
    expect(() => createMqttGateway({ ...base, gateway: { ...base.gateway, allowedOrigins: [origin + "/path"] } }, variables, { resolveSecret: () => token })).toThrow("origini");
    const plaintextToken = { ...base, gateway: { ...base.gateway, token } };
    expect(() => createMqttGateway(plaintextToken, variables, { resolveSecret: () => token })).toThrow("riferimento ambiente");
    expect(() => createMqttGateway({ ...base, connections: Array.from({ length: 1_001 }, (_, index) => ({ enabled: true, protocol: "mqtt" as const, id: String(index), url: "mqtt://127.0.0.1:1883", bindings: [] })) }, variables, { resolveSecret: () => token })).toThrow("Catalogo gateway troppo grande");
  });
});
