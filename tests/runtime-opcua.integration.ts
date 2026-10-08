// @vitest-environment node
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { X509Certificate } from "node:crypto";
import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { OPCUAServer } from "node-opcua-server";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import { DataType, Variant, DataValue, StatusCodes, MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { createOpcUaPlcConnection, type OpcUaConnectionConfig } from "../runtime/opcua-driver.mjs";
import { createPlcGateway } from "../runtime/gateway.mjs";
import type { ConnectionDiagnostic } from "../runtime/connection-diagnostics.mjs";
import { standardProjectFiles } from "../src/core/standardProject";

const variables = [{ name: "Motor.Speed", dataType: "Real", access: "read-write" as const }];
const namespaceUri = "urn:framecraft:synthetic-test";
async function fixture(secure = false, wrongHostname = false) {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "opcua-test-"));
  const socket = createServer(); await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port; await new Promise<void>((resolve) => socket.close(() => resolve()));
  const serverManager = new OPCUACertificateManager({ rootFolder: path.join(root, "server-pki"), automaticallyAcceptUnknownCertificate: false, disableFileWatchers: true });
  await serverManager.initialize();
  const serverCert = path.join(root, "server.pem");
  if (secure) await serverManager.createSelfSignedCertificate({ outputFile: serverCert, subject: "/CN=Framecraft Synthetic", applicationUri: "urn:framecraft:synthetic-server", dns: ["localhost"], ip: wrongHostname ? [] : ["127.0.0.1"], startDate: new Date(Date.now() - 60000), validity: 1 });
  const server = new OPCUAServer({ host: "127.0.0.1", hostname: "127.0.0.1", port, serverCertificateManager: serverManager,
    ...(secure ? { certificateFile: serverCert, privateKeyFile: serverManager.privateKey } : {}),
    securityPolicies: [secure ? SecurityPolicy.Basic256Sha256 : SecurityPolicy.None], securityModes: [secure ? MessageSecurityMode.SignAndEncrypt : MessageSecurityMode.None], allowAnonymous: true,
    userManager: { isValidUser: (user: string, password: string) => user === "synthetic_user" && password === "synthetic_correct_password" },
    serverInfo: { applicationUri: "urn:framecraft:synthetic-server" } });
  let value = 10, writes = 0, status = StatusCodes.Good, writeStatus = StatusCodes.Good, paused = false;
  const held: Array<() => void> = [];
  const sourceTime = new Date(Date.now() - 1000);
  await server.initialize();
  const space = server.engine.addressSpace!, ns = space.registerNamespace(namespaceUri);
  ns.addVariable({ organizedBy: space.rootFolder.objects, browseName: "Speed", nodeId: "s=Speed", dataType: "Float", valueRank: -1,
    accessLevel: "CurrentRead | CurrentWrite", userAccessLevel: "CurrentRead | CurrentWrite", minimumSamplingInterval: 100,
    value: { timestamped_get: () => new DataValue({ value: new Variant({ dataType: DataType.Float, value }), statusCode: status, sourceTimestamp: sourceTime }),
      timestamped_set: (data, callback) => { writes++; const finish = () => { if (writeStatus.isGood()) value = data.value.value; callback(null, writeStatus); }; if (paused) held.push(finish); else finish(); } } });
  await server.start();
  const url = server.endpoints[0].endpointDescriptions().find((e) => e.securityMode === (secure ? MessageSecurityMode.SignAndEncrypt : MessageSecurityMode.None))!.endpointUrl!;
  const config: OpcUaConnectionConfig = { id: "synthetic", url, allowInsecure: !secure, securityMode: secure ? "SignAndEncrypt" : "None", securityPolicy: secure ? "Basic256Sha256" : "None", allowWrites: true,
    pkiDirectory: path.join(root, "client-pki"), reconnectMs: 250, timeoutMs: 2000, readIntervalMs: 250, samplingIntervalMs: 250,
    bindings: [{ tag: "Motor.Speed", namespaceUri, nodeId: "s=Speed", writeEnabled: true, staleAfterMs: 1000 }] };
  if (secure) {
    const clientManager = new OPCUACertificateManager({ rootFolder: config.pkiDirectory!, automaticallyAcceptUnknownCertificate: false, disableFileWatchers: true });
    await clientManager.initialize(); config.certificateFile = path.join(root, "client.pem"); config.privateKeyFile = clientManager.privateKey; config.applicationUri = "urn:framecraft:synthetic-client";
    await clientManager.createSelfSignedCertificate({ outputFile: config.certificateFile, subject: "/CN=Framecraft Synthetic Client", applicationUri: config.applicationUri, dns: ["localhost"], startDate: new Date(Date.now() - 60000), validity: 1 });
    await serverManager.trustCertificate(new X509Certificate(await readFile(config.certificateFile)).raw); await clientManager.dispose();
  }
  let shut = false;
  return { config, server, root, get writes() { return writes; }, get value() { return value; }, sourceTime,
    set status(next: typeof status) { status = next; }, set writeStatus(next: typeof writeStatus) { writeStatus = next; },
    set pausedWrites(next: boolean) { paused = next; }, releaseWrites() { for (const finish of held.splice(0)) finish(); },
    async trustServer() { const manager = new OPCUACertificateManager({ rootFolder: config.pkiDirectory!, automaticallyAcceptUnknownCertificate: false, disableFileWatchers: true }); await manager.initialize(); await manager.trustCertificate(server.getCertificate()); await manager.dispose(); },
    async expiredClientCertificate() { const manager = new OPCUACertificateManager({ rootFolder: config.pkiDirectory!, automaticallyAcceptUnknownCertificate: false, disableFileWatchers: true });
      try { await manager.initialize(); const outputFile = path.join(root, "expired-client.pem");
        await manager.createSelfSignedCertificate({ outputFile, subject: "/CN=Expired Synthetic Client", applicationUri: config.applicationUri!, dns: ["localhost"], startDate: new Date(Date.now() - 2 * 86400000), validity: 1 }); return outputFile;
      } finally { await manager.dispose(); } },
    async shutdown() { if (!shut) { shut = true; await server.shutdown(0); } },
    async close() { this.releaseWrites(); await this.shutdown(); await serverManager.dispose();
      const target = await realpath(root), parent = await realpath(base);
      if (path.dirname(target) !== parent || !path.basename(target).startsWith("opcua-test-")) throw new Error("Fixture non sicura");
      await rm(target, { recursive: true, force: true }); } };
}

describe("OPC UA reale su server sintetico loopback", () => {
  it("acquisisce tipo, qualità e timestamp originali; una ricevuta Write non è conferma PLC", async () => {
    const test = await fixture(), driver = createOpcUaPlcConnection(test.config, variables);
    try {
      await driver.start(); expect(driver.state).toBe("connected");
      expect(driver.read("Motor.Speed")).toMatchObject({ value: "10", qualityCode: 192, opcUaStatusCode: 0, sourceTimestamp: test.sourceTime.getTime() });
      const first = driver.read("Motor.Speed")!;
      await vi.waitFor(() => expect(driver.read("Motor.Speed")!.receivedAt).toBeGreaterThan(first.receivedAt), { timeout: 2000 });
      expect(driver.read("Motor.Speed")!.sourceTimestamp).toBe(first.sourceTimestamp);
      expect(await driver.write("Motor.Speed", 22)).toEqual({ tag: "Motor.Speed", delivery: "opcua-service", plcConfirmed: false });
      expect(test.writes).toBe(1); expect(test.value).toBe(22);
      await vi.waitFor(() => expect(driver.read("Motor.Speed")!.value).toBe("22"));
      await expect(driver.write("Motor.Speed", "not-a-number")).rejects.toThrow(); expect(test.writes).toBe(1);
    } finally { await driver.stop(); await test.close(); }
  }, 20000);

  it("conserva l'ultimo valore con qualità Bad e il vero StatusCode, senza rendere il dato valido", async () => {
    const test = await fixture(), events: unknown[] = [], driver = createOpcUaPlcConnection(test.config, variables, { onState: (event) => events.push(event) });
    try {
      await driver.start(); test.status = StatusCodes.BadOutOfService;
      await vi.waitFor(() => expect(driver.read("Motor.Speed")!.opcUaStatusCode, JSON.stringify(events)).toBe(StatusCodes.BadOutOfService.value), { timeout: 3000 });
      expect(driver.read("Motor.Speed")).toMatchObject({ value: "10", opcUaStatusCode: StatusCodes.BadOutOfService.value, lastError: "OPC_UA_READ" });
      expect(driver.state).toBe("connected"); test.status = StatusCodes.UncertainInitialValue;
      await vi.waitFor(() => expect(driver.read("Motor.Speed")!.qualityCode).toBe(64));
      test.status = StatusCodes.GoodClamped;
      await vi.waitFor(() => expect(driver.read("Motor.Speed")!.qualityCode).toBe(192));
    } finally { await driver.stop(); await test.close(); }
  }, 20000);

  it("blocca namespace, nodi e tipi errati prima di dichiarare pronta la connessione", async () => {
    const test = await fixture();
    try {
      for (const [patch, expected, tags] of [
        [{ namespaceUri: "urn:missing" }, "OPC_UA_NAMESPACE", variables],
        [{ nodeId: "s=Missing" }, "OPC_UA_NODE", variables],
        [{}, "OPC_UA_TYPE", [{ ...variables[0], dataType: "Int" }]],
      ] as const) {
        const diagnostics: ConnectionDiagnostic[] = [];
        const driver = createOpcUaPlcConnection({ ...test.config, bindings: [{ ...test.config.bindings[0], ...patch }] }, tags, { onDiagnostic: (d) => diagnostics.push(d) });
        try { await expect(driver.start()).rejects.toThrow(); expect(driver.state).toBe("error"); expect(diagnostics.some((d) => d.code === expected)).toBe(true); }
        finally { await driver.stop(); }
      }
      expect(test.writes).toBe(0);
    } finally { await test.close(); }
  }, 20000);

  it("rifiuta una scrittura Bad una sola volta e non accoda comandi quando il server sparisce", async () => {
    const test = await fixture(), driver = createOpcUaPlcConnection(test.config, variables);
    try {
      await driver.start(); test.writeStatus = StatusCodes.BadUserAccessDenied;
      await expect(driver.write("Motor.Speed", 44)).rejects.toMatchObject({ outcome: "rejected", diagnostic: { code: "OPC_UA_WRITE_REJECTED", technicalCode: "0x801F0000" } });
      expect(test.writes).toBe(1); expect(test.value).toBe(10);
      await test.shutdown(); await vi.waitFor(() => expect(driver.state).not.toBe("connected"));
      expect(driver.read("Motor.Speed")!.qualityCode).toBe(0);
      await expect(driver.write("Motor.Speed", 55)).rejects.toThrow(); expect(test.writes).toBe(1);
    } finally { await driver.stop(); await test.close(); }
  }, 20000);

  it("un comando senza risposta è incerto e non viene ripetuto", async () => {
    const test = await fixture(), driver = createOpcUaPlcConnection({ ...test.config, timeoutMs: 3000 }, variables);
    try {
      await driver.start(); test.pausedWrites = true;
      await expect(driver.write("Motor.Speed", 88)).rejects.toMatchObject({ outcome: "uncertain", diagnostic: { code: "WRITE_UNCERTAIN" } });
      expect(test.writes).toBe(1); test.releaseWrites();
      await vi.waitFor(() => expect(driver.read("Motor.Speed")!.value).toBe("88")); expect(test.writes).toBe(1);
    } finally { await driver.stop(); await test.close(); }
  }, 20000);

  it("arrestare il driver durante Write non trasforma una risposta tardiva in conferma", async () => {
    const test = await fixture(), driver = createOpcUaPlcConnection(test.config, variables);
    try {
      await driver.start(); test.pausedWrites = true; const pending = driver.write("Motor.Speed", 66);
      const result = expect(pending).rejects.toMatchObject({ outcome: "uncertain" });
      await vi.waitFor(() => expect(test.writes).toBe(1)); await driver.stop(); await result;
      test.releaseWrites(); expect(driver.state).toBe("stopped"); expect(driver.read("Motor.Speed")!.qualityCode).toBe(0);
      await expect(driver.start()).rejects.toThrow(); expect(test.writes).toBe(1);
    } finally { await driver.stop(); await test.close(); }
  }, 20000);

  it("rifiuta un certificato sconosciuto e collega solo dopo trust esplicito e identità corrispondenti", async () => {
    const test = await fixture(true), diagnostics: ConnectionDiagnostic[] = [];
    const rejected = createOpcUaPlcConnection(test.config, variables, { onDiagnostic: (d) => diagnostics.push(d) });
    try {
      await expect(rejected.start()).rejects.toThrow(); expect(rejected.state).toBe("error");
      expect(diagnostics.some((d) => d.code === "OPC_UA_CERTIFICATE")).toBe(true); expect(test.writes).toBe(0);
      await rejected.stop(); await test.trustServer();
      const connected = createOpcUaPlcConnection(test.config, variables);
      try { await connected.start(); expect(connected.read("Motor.Speed")!.value).toBe("10"); }
      finally { await connected.stop(); }
    } finally { await rejected.stop(); await test.close(); }
  }, 30000);

  it("trust non aggira hostname, URI, scadenza o credenziali rifiutate; i log non contengono segreti", async () => {
    const test = await fixture(true), diagnostics: ConnectionDiagnostic[] = [];
    try {
      await test.trustServer();
      const expiredCertificate = await test.expiredClientCertificate();
      for (const [patch, code] of [[{ certificateFile: expiredCertificate }, "OPC_UA_CERTIFICATE_TIME"], [{ applicationUri: "urn:wrong-client" }, "OPC_UA_CERTIFICATE_NAME"], [{ usernameEnv: "TEST_USER", passwordEnv: "TEST_PASSWORD" }, "OPC_UA_AUTH"]] as const) {
        const driver = createOpcUaPlcConnection({ ...test.config, ...patch }, variables, { onDiagnostic: (d) => diagnostics.push(d), resolveSecret: (name) => name === "TEST_USER" ? "synthetic_user" : "synthetic_wrong_password" });
        try { await expect(driver.start()).rejects.toThrow(); expect(driver.state).toBe("error"); expect(diagnostics.some((d) => d.code === code)).toBe(true); }
        finally { await driver.stop(); }
      }
      expect(JSON.stringify(diagnostics)).not.toContain("synthetic_wrong_password"); expect(test.writes).toBe(0);
    } finally { await test.close(); }
    const wrong = await fixture(true, true); await wrong.trustServer();
    const driver = createOpcUaPlcConnection(wrong.config, variables, { onDiagnostic: (d) => diagnostics.push(d) });
    try { await expect(driver.start()).rejects.toThrow(); expect(driver.state).toBe("error"); expect(diagnostics.some((d) => d.code === "OPC_UA_CERTIFICATE_NAME")).toBe(true); }
    finally { await driver.stop(); await wrong.close(); }
  }, 30000);

  it("avvia il servizio realmente copiato dalla pipeline e mantiene stdout JSON senza dump SDK", async () => {
    const test = await fixture(), project = path.join(test.root, "generated"); await mkdir(project);
    let child: ReturnType<typeof spawn> | undefined, exited: Promise<void> | undefined;
    try {
      const files = standardProjectFiles({ machineName: "OPC UA Synthetic", layout: "desktop", sections: ["main"] }).filter((f) => f.path.startsWith("runtime/"));
      for (const file of files) { const target = path.resolve(project, file.path); if (path.relative(project, target).startsWith("..")) throw new Error("Fixture fuori dal progetto"); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content); }
      const token = "synthetic_generated_token_01234567890123456789", origin = "http://127.0.0.1:4173";
      await writeFile(path.join(project, "framecraft.plc.json"), JSON.stringify({ version: 1, variables }));
      await writeFile(path.join(project, "framecraft.connections.json"), JSON.stringify({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "TEST_GENERATED_TOKEN", allowedOrigins: [origin], allowWrites: false }, connections: [{ ...test.config, protocol: "opcua", enabled: true }] }));
      child = spawn(process.execPath, [path.join(project, "runtime/start-gateway.mjs"), "--json"], { cwd: project, env: { ...process.env, TEST_GENERATED_TOKEN: token }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      let output = "", errors = ""; child.stdout!.on("data", (chunk) => output += String(chunk)); child.stderr!.on("data", (chunk) => errors += String(chunk));
      exited = new Promise<void>((resolve, reject) => { child!.once("exit", () => resolve()); child!.once("error", reject); });
      let address = "";
      await vi.waitFor(() => { const rows = output.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); address = rows.find((row) => row.type === "gateway")?.address ?? ""; expect(address, errors).toBeTruthy(); }, { timeout: 10000 });
      const response = await fetch(address + "/_framecraft/plc/v1/snapshot", { headers: { Authorization: "Bearer " + token, Origin: origin } });
      expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ samples: [expect.objectContaining({ value: "10", opcUaStatusCode: 0 })] });
      expect(output).not.toContain("Creating default certificate"); expect(output + errors).not.toContain(token);
    } finally { if (child && child.exitCode === null) child.kill(); await exited; await test.close(); }
  }, 30000);

  it("il gateway HTTP autentica e deduplica il comando OPC UA, senza conferme o valori ottimistici", async () => {
    const test = await fixture(), token = "synthetic_gateway_token_01234567890123456789", origin = "http://127.0.0.1:4173";
    const gateway = createPlcGateway({ version: 1, gateway: { enabled: true, port: 0, allowWrites: true, tokenEnv: "TEST_GATEWAY_TOKEN", allowedOrigins: [origin] },
      connections: [{ ...test.config, protocol: "opcua", enabled: true }] }, variables, { resolveSecret: () => token });
    try {
      await gateway.start(); await vi.waitFor(() => expect(gateway.snapshot().connections[0].state).toBe("connected"));
      const url = gateway.address + "/_framecraft/plc/v1/write", body = JSON.stringify({ id: "opcua_command_0123456789", tag: "Motor.Speed", value: 77 });
      expect((await fetch(url, { method: "POST", body })).status).toBe(401);
      const request = () => fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, Origin: origin } });
      const [one, two] = await Promise.all([request(), request()]);
      expect(one.status).toBe(200); expect(await one.json()).toMatchObject({ delivery: "opcua-service", plcConfirmed: false });
      expect(await two.json()).toMatchObject({ delivery: "opcua-service", plcConfirmed: false }); expect(test.writes).toBe(1);
    } finally { await gateway.stop(); await test.close(); }
  }, 20000);
});
