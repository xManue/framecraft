// @vitest-environment node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Aedes } from "aedes";
import { connectAsync } from "mqtt";
import { OPCUAServer } from "node-opcua-server";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import { DataType, Variant, DataValue, StatusCodes, MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { standardProjectFiles } from "../src/core/standardProject";
import { emptyAlarmCatalog, parseAlarmSnapshot, type AlarmSnapshot } from "../runtime/alarm-engine.mjs";

const variables = ["Value", "Limit"].map(name => ({ name, dataType: "LReal", access: "read" }));
const origin = "http://127.0.0.1:4173", token = "analog_generated_test_token_01234567890123456789";
async function generated(connection: Record<string, unknown>) {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "analog-generated-"));
  if (path.dirname(await realpath(root)) !== await realpath(base)) throw new Error("Fixture fuori directory");
  const files = standardProjectFiles({ machineName: "Allarmi analogici QA", layout: "desktop", sections: ["main"] });
  for (const file of files.filter(file => file.path.startsWith("runtime/") || /^framecraft\.(auth|alarms|plc|connections|recipes)\.json$/.test(file.path))) {
    const target = path.resolve(root, file.path); if (!target.startsWith(root + path.sep)) throw new Error("Percorso fixture non valido"); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content);
  }
  await symlink(path.resolve("node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(root, "framecraft.plc.json"), JSON.stringify({ version: 1, variables }));
  await writeFile(path.join(root, "framecraft.connections.json"), JSON.stringify({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "FRAMECRAFT_ANALOG_TEST_TOKEN", allowedOrigins: [origin], allowWrites: false }, connections: [connection] }));
  await writeFile(path.join(root, "framecraft.alarms.json"), JSON.stringify({ ...emptyAlarmCatalog(), alarms: [{ id: "analog", name: "Pressione", text: "Controlla pressione", tag: "Value", className: "Alarm_CTH", enabled: true, priority: 1, trigger: { kind: "high-equal", limit: { tag: "Limit" }, hysteresis: 2 } }] }));
  const child = spawn(process.execPath, ["runtime/start-gateway.mjs", "--json"], { cwd: root, windowsHide: true, env: { ...process.env, FRAMECRAFT_ANALOG_TEST_TOKEN: token }, stdio: ["ignore", "pipe", "pipe"] }); let output = "", errors = "";
  child.stdout.on("data", chunk => { output = (output + chunk).slice(-100000); }); child.stderr.on("data", chunk => { errors = (errors + chunk).slice(-8192); });
  const exited = new Promise<void>((resolve, reject) => { child.once("exit", () => resolve()); child.once("error", reject); });
  const close = async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); await exited; };
  let address: string | undefined;
  try { await vi.waitFor(() => { address = output.split("\n").flatMap(line => { try { const entry = JSON.parse(line); return entry.type === "gateway" && entry.address ? [entry.address] : []; } catch { return []; } })[0]; if (child.exitCode !== null) throw new Error("Servizio emesso terminato: " + errors); expect(address).toBeTruthy(); }, { timeout: 15000 }); }
  catch (error) { await close(); throw error; }
  return { close, root, async snapshot(): Promise<AlarmSnapshot> { const response = await fetch(address + "/_framecraft/plc/v1/snapshot", { headers: { Origin: origin, Authorization: "Bearer " + token }, signal: AbortSignal.timeout(5000) }); expect(response.status).toBe(200); return parseAlarmSnapshot((await response.json()).alarms); } };
}

describe("allarmi analogici nel launcher realmente generato", () => {
  it("MQTT: soglia indipendente, qualità conservativa e nessun comando al PLC", async () => {
    const broker = await Aedes.createBroker(), tcp = createServer(broker.handle); await new Promise<void>(resolve => tcp.listen(0, "127.0.0.1", resolve)); const url = "mqtt://127.0.0.1:" + (tcp.address() as { port: number }).port;
    const publisher = await connectAsync(url, { reconnectPeriod: 0 }); let commands = 0; broker.on("publish", packet => { if (packet.topic === "command") commands++; }); let service: Awaited<ReturnType<typeof generated>> | undefined;
    const send = (topic: string, value: number, quality = 192) => publisher.publishAsync(topic, JSON.stringify({ value, quality }), { qos: 1 });
    try {
      service = await generated({ id: "mqtt-analog", protocol: "mqtt", enabled: true, url, clientId: "analog-generated", allowInsecure: true, allowWrites: false, timeoutMs: 3000, bindings: variables.map(variable => ({ tag: variable.name, topic: variable.name, valuePath: "/value", qualityPath: "/quality", staleAfterMs: 10000 })) });
      expect((await service.snapshot()).rows[0]).toMatchObject({ active: null, quality: "unknown" }); await send("Value", 10);
      await vi.waitFor(async () => expect((await service!.snapshot()).rows[0]).toMatchObject({ active: null, quality: "unknown" }));
      await send("Limit", 10); await vi.waitFor(async () => expect((await service!.snapshot()).rows[0]).toMatchObject({ active: true, quality: "good" }));
      await send("Limit", 11); await vi.waitFor(async () => expect((await service!.snapshot()).rows[0]).toMatchObject({ active: true, quality: "good" }));
      await send("Limit", 30, 0); await vi.waitFor(async () => expect((await service!.snapshot()).rows[0]).toMatchObject({ active: true, quality: "bad" })); await send("Value", 0);
      await vi.waitFor(async () => expect((await service!.snapshot()).rows[0]).toMatchObject({ active: true, quality: "bad" }));
      expect((await service.snapshot()).history.map(event => event.state)).toEqual(["Incoming"]);
      await send("Limit", 30); await vi.waitFor(async () => expect((await service!.snapshot()).rows[0]).toMatchObject({ active: false, quality: "good", pending: true }));
      expect((await service.snapshot()).history.map(event => event.state)).toEqual(["Incoming", "Outgoing"]); expect(commands).toBe(0);
    } finally { await service?.close(); await publisher.endAsync(true); await new Promise<void>(resolve => broker.close(resolve)); await new Promise<void>(resolve => tcp.close(() => resolve())); }
  }, 30000);
  it("OPC UA: due nodi reali, variazione della sola soglia e Bad senza falso rientro", async () => {
    const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "analog-ua-"));
    const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
    const manager = new OPCUACertificateManager({ rootFolder: path.join(root, "pki"), automaticallyAcceptUnknownCertificate: false, disableFileWatchers: true }); await manager.initialize();
    const server = new OPCUAServer({ host: "127.0.0.1", hostname: "127.0.0.1", port, serverCertificateManager: manager, securityPolicies: [SecurityPolicy.None], securityModes: [MessageSecurityMode.None], allowAnonymous: true, serverInfo: { applicationUri: "urn:framecraft:analog-synthetic" } });
    const values: Record<string, number> = { Value: 10, Limit: 30 }, qualities: Record<string, typeof StatusCodes.Good> = { Value: StatusCodes.Good, Limit: StatusCodes.Good }; let writes = 0, service: Awaited<ReturnType<typeof generated>> | undefined;
    try {
      await server.initialize(); const space = server.engine.addressSpace!, ns = space.registerNamespace("urn:framecraft:analog-test");
      for (const variable of variables) ns.addVariable({ organizedBy: space.rootFolder.objects, browseName: variable.name, nodeId: "s=" + variable.name, dataType: "Double", valueRank: -1, accessLevel: "CurrentRead | CurrentWrite", minimumSamplingInterval: 100, value: { timestamped_get: () => new DataValue({ value: new Variant({ dataType: DataType.Double, value: values[variable.name] }), statusCode: qualities[variable.name], sourceTimestamp: new Date() }), timestamped_set: (_data, callback) => { writes++; callback(null, StatusCodes.BadNotWritable); } } });
      await server.start(); const url = server.endpoints[0].endpointDescriptions().find(entry => entry.securityMode === MessageSecurityMode.None)!.endpointUrl!;
      service = await generated({ id: "ua-analog", protocol: "opcua", enabled: true, url, allowInsecure: true, allowWrites: false, securityMode: "None", securityPolicy: "None", pkiDirectory: path.join(root, "client-pki"), timeoutMs: 2000, readIntervalMs: 250, samplingIntervalMs: 250, bindings: variables.map(variable => ({ tag: variable.name, namespaceUri: "urn:framecraft:analog-test", nodeId: "s=" + variable.name, writeEnabled: false, staleAfterMs: 2000 })) });
      await vi.waitFor(async () => expect((await service!.snapshot()).rows[0]).toMatchObject({ active: false, quality: "good" }), { timeout: 5000 });
      values.Limit = 10; await vi.waitFor(async () => expect((await service!.snapshot()).rows[0]).toMatchObject({ active: true, quality: "good" }));
      qualities.Limit = StatusCodes.BadOutOfService; values.Limit = 30; await vi.waitFor(async () => expect((await service!.snapshot()).rows[0]).toMatchObject({ active: true, quality: "bad" }));
      values.Value = 0; await vi.waitFor(async () => expect((await service!.snapshot()).rows[0]).toMatchObject({ active: true, quality: "bad" })); expect((await service.snapshot()).history.map(event => event.state)).toEqual(["Incoming"]);
      qualities.Limit = StatusCodes.Good; await vi.waitFor(async () => expect((await service!.snapshot()).rows[0]).toMatchObject({ active: false, quality: "good" })); expect((await service.snapshot()).history.map(event => event.state)).toEqual(["Incoming", "Outgoing"]); expect(writes).toBe(0);
    } finally { await service?.close(); await server.shutdown(0); await manager.dispose(); }
  }, 30000);
});
