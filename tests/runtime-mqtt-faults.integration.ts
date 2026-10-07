// @vitest-environment node
import { Aedes } from "aedes";
import { connectAsync } from "mqtt";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { createConnection, createServer, type Socket } from "node:net";
import { createServer as createTlsServer } from "node:tls";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMqttPlcConnection, type MqttConnectionConfig } from "../runtime/mqtt-driver.mjs";
import type { ConnectionDiagnostic } from "../runtime/connection-diagnostics.mjs";
import { createMqttGateway } from "../runtime/gateway.mjs";

const require = createRequire(import.meta.url), wire = require("mqtt-packet");
const variables = [{ name: "Motor.Speed", dataType: "Real", access: "read-write" as const }];
const binding = { tag: "Motor.Speed", topic: "safe/value", valuePath: "/value", qualityPath: "/quality", writeTopic: "safe/command" };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// TCP peers exercise real MQTT.js packet handling, including negative MQTT 5 replies.
async function mqtt5Peer() {
  const sockets = new Set<Socket>(), events: ConnectionDiagnostic[] = [], drivers: ReturnType<typeof createMqttPlcConnection>[] = [];
  let mode = "normal", connects = 0, publishes = 0, latest: Socket | undefined;
  const server = createServer((socket) => {
    latest = socket; sockets.add(socket); socket.on("error", () => {}); socket.on("close", () => sockets.delete(socket));
    const parser = wire.parser({ protocolVersion: 5 }); parser.on("error", () => socket.destroy());
    const send = (packet: unknown) => { if (!socket.destroyed) socket.write(wire.generate(packet, { protocolVersion: 5 })); };
    parser.on("packet", (packet: { cmd: string; messageId: number; qos: number; subscriptions: unknown[] }) => {
      if (packet.cmd === "connect") { connects++; send({ cmd: "connack", sessionPresent: false, reasonCode: mode === "auth" ? 135 : 0, properties: { reasonString: "PRIVATE_SERVER_REASON" } }); }
      if (packet.cmd === "subscribe" && mode !== "hold-subscribe") send({ cmd: "suback", messageId: packet.messageId, granted: packet.subscriptions.map(() => mode === "deny-subscribe" ? 135 : 0) });
      if (packet.cmd === "publish") {
        publishes++;
        if (mode !== "hold-write" && packet.qos) send({ cmd: packet.qos === 2 ? "pubrec" : "puback", messageId: packet.messageId, reasonCode: mode === "deny-write" ? 135 : mode === "no-receivers" ? 16 : 0, properties: { reasonString: "PRIVATE_SERVER_REASON" } });
      }
      if (packet.cmd === "pubrel" && mode !== "hold-pubcomp") send({ cmd: "pubcomp", messageId: packet.messageId, reasonCode: mode === "bad-pubcomp" ? 135 : 0 });
      if (packet.cmd === "pingreq") send({ cmd: "pingresp" });
    });
    socket.on("data", (data) => parser.parse(data));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Porta non disponibile.");
  const config: MqttConnectionConfig = { id: "wire-test", url: "mqtt://127.0.0.1:" + address.port, protocolVersion: 5, allowInsecure: true, allowWrites: true, timeoutMs: 500, reconnectMs: 250, bindings: [binding] };
  return { config, events, get connects() { return connects; }, get publishes() { return publishes; }, set mode(value: string) { mode = value; },
    disconnect(reasonCode?: number) { if (reasonCode !== undefined) latest?.write(wire.generate({ cmd: "disconnect", reasonCode, properties: { reasonString: "PRIVATE_SERVER_REASON" } }, { protocolVersion: 5 })); else latest?.destroy(); },
    driver(patch: Partial<MqttConnectionConfig> = {}) { const driver = createMqttPlcConnection({ ...config, ...patch }, variables, { onDiagnostic: (event) => events.push(event) }); drivers.push(driver); return driver; },
    async close() { await Promise.allSettled(drivers.map((driver) => driver.stop())); for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => server.close(() => resolve())); },
  };
}

describe("MQTT 5: esiti reali di protocollo, timeout e nessun replay", () => {
  it("l'accesso rifiutato arresta la connessione e non espone la reasonString del server", async () => {
    const test = await mqtt5Peer(); test.mode = "auth"; const driver = test.driver();
    try {
      await expect(driver.start()).rejects.toMatchObject({ diagnostic: { code: "AUTH_DENIED", action: expect.stringContaining("permessi") } });
      await wait(650); expect(driver.state).toBe("error"); expect(test.connects).toBe(1); expect(JSON.stringify(test.events)).not.toContain("PRIVATE_SERVER_REASON");
      await expect(driver.write("Motor.Speed", 1)).rejects.toMatchObject({ outcome: "rejected", diagnostic: { code: "WRITE_OFFLINE" } }); expect(test.publishes).toBe(0);
    } finally { await test.close(); }
  });
  it("non dichiara pronta una connessione con SUBACK negativo", async () => {
    const test = await mqtt5Peer(); test.mode = "deny-subscribe"; const driver = test.driver();
    try {
      await expect(driver.start()).rejects.toMatchObject({ diagnostic: { code: "SUBSCRIPTION_DENIED" } }); expect(driver.state).toBe("error"); expect(test.events.some((event) => event.code === "CONNECTED")).toBe(false);
      await wait(350); expect(test.connects).toBe(1);
    } finally { await test.close(); }
  });
  it("limita anche l'attesa della sottoscrizione al primo avvio", async () => {
    const test = await mqtt5Peer(); test.mode = "hold-subscribe"; const driver = test.driver();
    try {
      await expect(driver.start()).rejects.toMatchObject({ diagnostic: { code: "NETWORK_TIMEOUT" } });
      expect(driver.state).toBe("error"); await wait(350); expect(test.connects).toBe(1);
    } finally { await test.close(); }
  });
  it("limita ogni tentativo dopo perdita di connessione, anche se il nuovo broker non invia SUBACK", async () => {
    const test = await mqtt5Peer(), driver = test.driver();
    try {
      await driver.start(); test.mode = "hold-subscribe"; test.disconnect();
      await vi.waitFor(() => expect(test.events.some((event) => event.code === "NETWORK_TIMEOUT")).toBe(true), { timeout: 2500 });
      await vi.waitFor(() => expect(test.connects).toBeGreaterThanOrEqual(3), { timeout: 2500 }); expect(driver.state).toBe("reconnecting");
      test.mode = "normal"; await vi.waitFor(() => expect(driver.state).toBe("connected"), { timeout: 2500 });
      expect(test.publishes).toBe(0);
    } finally { await test.close(); }
  });
  it("non contende una sessione presa da un altro client MQTT 5", async () => {
    const test = await mqtt5Peer(), driver = test.driver();
    try {
      await driver.start(); test.disconnect(142); await vi.waitFor(() => expect(driver.state).toBe("error")); await wait(350);
      expect(test.events.some((event) => event.code === "CLIENT_ID_CONFLICT")).toBe(true); expect(test.connects).toBe(1); expect(JSON.stringify(test.events)).not.toContain("PRIVATE_SERVER_REASON");
    } finally { await test.close(); }
  });
  it.each([1, 2] as const)("un rifiuto esplicito di PUBLISH QoS %s non diventa consegnato né viene ritentato", async (qos) => {
    const test = await mqtt5Peer(); test.mode = "deny-write"; const driver = test.driver({ bindings: [{ ...binding, writeQos: qos }] });
    try {
      await driver.start(); await expect(driver.write("Motor.Speed", 42)).rejects.toMatchObject({ outcome: "rejected", diagnostic: { code: "WRITE_REJECTED" } });
      expect(test.publishes).toBe(1); expect(driver.read("Motor.Speed")).toBeUndefined(); expect(JSON.stringify(test.events)).not.toContain("PRIVATE_SERVER_REASON");
    } finally { await test.close(); }
  });
  it("un ACK anomalo dopo PUBREC resta incerto, non è un rifiuto certo prima della consegna", async () => {
    const test = await mqtt5Peer(); test.mode = "bad-pubcomp"; const driver = test.driver({ bindings: [{ ...binding, writeQos: 2 }] });
    try {
      await driver.start(); await expect(driver.write("Motor.Speed", 42)).rejects.toMatchObject({ outcome: "uncertain", diagnostic: { code: "WRITE_UNCERTAIN" } }); expect(test.publishes).toBe(1);
    } finally { await test.close(); }
  });
  it.each(["hold-write", "hold-pubcomp"])("il timeout %s termina il comando senza replay alla riconnessione", async (mode) => {
    const test = await mqtt5Peer(); test.mode = mode; const driver = test.driver({ bindings: [{ ...binding, writeQos: mode === "hold-pubcomp" ? 2 : 1 }] });
    try {
      await driver.start(); await expect(driver.write("Motor.Speed", 42)).rejects.toMatchObject({ outcome: "uncertain", diagnostic: { code: "WRITE_UNCERTAIN" } });
      await vi.waitFor(() => expect(driver.state).toBe("connected"), { timeout: 2500 }); expect(test.publishes).toBe(1);
      expect(driver.read("Motor.Speed")).toBeUndefined();
    } finally { await test.close(); }
  });
  it("segnala assenza di destinatari senza trasformare l'ACK broker in conferma PLC", async () => {
    const test = await mqtt5Peer(); test.mode = "no-receivers"; const driver = test.driver();
    try { await driver.start(); expect(await driver.write("Motor.Speed", 42)).toMatchObject({ delivery: "broker-ack", plcConfirmed: false }); expect(test.events.some((event) => event.code === "NO_RECEIVERS")).toBe(true); }
    finally { await test.close(); }
  });
  it("stop durante un avvio in attesa non lascia riconnessioni attive", async () => {
    const test = await mqtt5Peer(); test.mode = "hold-subscribe"; const driver = test.driver();
    try {
      const result = expect(driver.start()).rejects.toMatchObject({ diagnostic: { code: "STOPPED" } });
      await vi.waitFor(() => expect(test.connects).toBe(1)); await driver.stop(); await result; await wait(650);
      expect(driver.state).toBe("stopped"); expect(test.connects).toBe(1);
    } finally { await test.close(); }
  });
  it("un observer che arresta al connect non genera un falso evento Connesso", async () => {
    const test = await mqtt5Peer();
    const driver = createMqttPlcConnection(test.config, variables, { onDiagnostic: (event) => test.events.push(event), onState: (state) => { if (state.state === "connected") void driver.stop(); } });
    try { await expect(driver.start()).rejects.toMatchObject({ diagnostic: { code: "STOPPED" } }); await vi.waitFor(() => expect(driver.state).toBe("stopped")); expect(test.events.some((event) => event.code === "CONNECTED")).toBe(false); }
    finally { await driver.stop(); await test.close(); }
  });
  it("stop concorrente al listen del gateway non lascia porte o driver attivi", async () => {
    const test = await mqtt5Peer();
    const gateway = createMqttGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "TEST", allowedOrigins: [], allowWrites: false }, connections: [{ ...test.config, enabled: true, protocol: "mqtt" }] }, variables, { resolveSecret: () => "synthetic_gateway_token_01234567890123456789" });
    try {
      const first = gateway.start(), second = gateway.start(); expect(first).toBe(second);
      const stopping = gateway.stop(); expect(gateway.stop()).toBe(stopping); await stopping; await first;
      expect(gateway.snapshot().connections.every((connection) => connection.state === "stopped")).toBe(true);
      expect(test.connects).toBe(0); await expect(fetch(gateway.address + "/_framecraft/plc/v1/snapshot")).rejects.toThrow();
      await expect(gateway.start()).rejects.toThrow("arrestato");
    } finally { await gateway.stop(); await test.close(); }
  });
  it("body HTTP interrotto o senza fine non blocca il gateway e non pubblica comandi", async () => {
    const test = await mqtt5Peer(), sockets: Socket[] = [];
    const token = "synthetic_gateway_token_01234567890123456789";
    const gateway = createMqttGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "TEST", allowedOrigins: [], allowWrites: true }, connections: [{ ...test.config, enabled: true, protocol: "mqtt" }] }, variables, { resolveSecret: () => token });
    try {
      await gateway.start(); const address = new URL(gateway.address!);
      const partial = async () => {
        const socket = createConnection({ host: address.hostname, port: Number(address.port) }); sockets.push(socket); socket.on("error", () => {});
        await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
        socket.write("POST /_framecraft/plc/v1/write HTTP/1.1\r\nHost: " + address.host + "\r\nAuthorization: Bearer " + token + "\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{");
        return socket;
      };
      const aborted = await partial(); await wait(50); aborted.destroy(); await wait(50);
      const delayed = await partial(); let output = ""; delayed.on("data", (chunk) => { output += String(chunk); });
      await vi.waitFor(() => expect(output).toContain("408"), { timeout: 8000 }); delayed.destroy();
      const response = await fetch(gateway.address + "/_framecraft/plc/v1/snapshot", { headers: { Authorization: "Bearer " + token } });
      expect(response.status).toBe(200); expect(gateway.snapshot().diagnostics?.some((event) => event.code === "GATEWAY_REQUEST")).toBe(true);
      expect(test.publishes).toBe(0); expect(JSON.stringify(gateway.snapshot())).not.toContain(token);
    } finally { for (const socket of sockets) socket.destroy(); await gateway.stop(); await test.close(); }
  }, 15000);
  it("il gateway restituisce rifiutato con rimedio per un NACK e conserva l'ID senza replay", async () => {
    const test = await mqtt5Peer(); test.mode = "deny-write";
    const token = "synthetic_gateway_token_01234567890123456789";
    const gateway = createMqttGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "TEST", allowedOrigins: [], allowWrites: true }, connections: [{ ...test.config, enabled: true, protocol: "mqtt" }] }, variables, { resolveSecret: () => token });
    try {
      await gateway.start(); const request = () => fetch(gateway.address + "/_framecraft/plc/v1/write", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ id: "nack_command_0123456789", tag: "Motor.Speed", value: 42 }) });
      const response = await request(); expect(response.status).toBe(422); expect(await response.json()).toMatchObject({ outcome: "rejected", plcConfirmed: false, diagnostic: { code: "WRITE_REJECTED", action: expect.stringContaining("autorizzazioni") } });
      expect((await request()).status).toBe(422); expect(test.publishes).toBe(1); expect(JSON.stringify(gateway.snapshot())).not.toContain(token);
    } finally { await gateway.stop(); await test.close(); }
  });
});

async function aedesFixture() {
  const broker = await Aedes.createBroker(), sockets = new Set<Socket>(), server = createServer((socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); broker.handle(socket); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw new Error("Porta non disponibile.");
  const publisher = await connectAsync("mqtt://127.0.0.1:" + address.port, { reconnectPeriod: 0 });
  const config: MqttConnectionConfig = { id: "sample-test", url: "mqtt://127.0.0.1:" + address.port, allowInsecure: true, allowWrites: true, timeoutMs: 1000, bindings: [binding] };
  return { broker, config, publisher, async close() { await publisher.endAsync(true); for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => broker.close(resolve)); await new Promise<void>((resolve) => server.close(() => resolve())); } };
}

describe("MQTT: dati, observer e rifiuti prima dell'invio", () => {
  it("Bad sorgente, UTF-8 errato, campi mancanti e recupero non inventano valori o qualità", async () => {
    const test = await aedesFixture(), events: ConnectionDiagnostic[] = [];
    const driver = createMqttPlcConnection(test.config, variables, { onDiagnostic: (event) => events.push(event), onSample: () => { throw new Error("observer fault"); } });
    try {
      await driver.start(); await test.publisher.publishAsync("safe/value", JSON.stringify({ value: 42, quality: 192 }), { qos: 1 }); await vi.waitFor(() => expect(driver.read("Motor.Speed")?.value).toBe("42"));
      await test.publisher.publishAsync("safe/value", JSON.stringify({ value: 99, quality: 0 }), { qos: 1 }); await vi.waitFor(() => expect(driver.read("Motor.Speed")?.lastError).toBe("BadSourceQuality")); expect(driver.read("Motor.Speed")?.value).toBe("42");
      await test.publisher.publishAsync("safe/value", Buffer.from([0xc3, 0x28]), { qos: 1 }); await vi.waitFor(() => expect(events.some((event) => event.code === "BAD_PAYLOAD")).toBe(true));
      await test.publisher.publishAsync("safe/value", '{"wrong":"PRIVATE_PAYLOAD"}', { qos: 1 }); await vi.waitFor(() => expect(events.some((event) => event.code === "BAD_MAPPING")).toBe(true));
      expect(driver.read("Motor.Speed")).toMatchObject({ value: "42", qualityCode: 0 }); expect(JSON.stringify(events)).not.toContain("PRIVATE_PAYLOAD");
      await test.publisher.publishAsync("safe/value", JSON.stringify({ value: 43, quality: 192 }), { qos: 1 }); await vi.waitFor(() => expect(driver.read("Motor.Speed")?.value).toBe("43"));
      expect(driver.read("Motor.Speed")?.lastError).toBeUndefined(); expect(events.some((event) => event.code === "SAMPLE_RECOVERED")).toBe(true); expect(driver.state).toBe("connected");
    } finally { await driver.stop(); await test.close(); }
  });
  it("segnala anche un tag che non ha mai ricevuto un campione", async () => {
    const test = await aedesFixture(), events: ConnectionDiagnostic[] = [], driver = createMqttPlcConnection({ ...test.config, bindings: [{ ...binding, staleAfterMs: 250 }] }, variables, { onDiagnostic: (event) => events.push(event) });
    try { await driver.start(); await vi.waitFor(() => expect(driver.read("Motor.Speed")?.lastError).toBe("BadStaleReading"), { timeout: 2000 }); expect(driver.read("Motor.Speed")).toMatchObject({ qualityCode: 0, receivedAt: 0 }); expect(driver.read("Motor.Speed")?.value).toBeUndefined(); expect(events.some((event) => event.code === "STALE_SAMPLE")).toBe(true); }
    finally { await driver.stop(); await test.close(); }
  });
  it("overflow Float32 e comando troppo grande sono rifiutati prima di PUBLISH", async () => {
    const test = await aedesFixture(); let publishes = 0; test.broker.on("publish", (_packet, client) => { if (client?.id === "command-test") publishes++; });
    const driver = createMqttPlcConnection({ ...test.config, clientId: "command-test", maxPayloadBytes: 4 }, variables);
    try { await driver.start(); await expect(driver.write("Motor.Speed", 1e39)).rejects.toMatchObject({ outcome: "rejected", diagnostic: { code: "WRITE_INVALID" } }); await expect(driver.write("Motor.Speed", 12345)).rejects.toMatchObject({ outcome: "rejected", diagnostic: { code: "WRITE_INVALID" } }); expect(publishes).toBe(0); }
    finally { await driver.stop(); await test.close(); }
  });
});

describe("MQTT su TLS reale con certificati effimeri, mai installati nel trust di sistema", () => {
  let root: string | undefined;
  const cert = (name: string) => path.join(root!, name);
  beforeAll(async () => {
    const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); root = await mkdtemp(path.join(base, "mqtt-tls-faults-"));
    const gitOpenSsl = "C:/Program Files/Git/usr/bin/openssl.exe";
    const executable = process.platform === "win32" && existsSync(gitOpenSsl) ? gitOpenSsl : "openssl";
    const run = async (...args: string[]) => { await promisify(execFile)(executable, args, { cwd: root, windowsHide: true, timeout: 10000 }); };
    await run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=Framecraft Synthetic CA", "-keyout", "ca.key", "-out", "ca.pem");
    await run("req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost", "-keyout", "server.key", "-out", "server.csr");
    await writeFile(cert("server.ext"), "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1,DNS:localhost\n");
    await writeFile(cert("wrong.ext"), "basicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:wrong.synthetic.invalid\n");
    for (const [name, extension] of [["server", "server.ext"], ["wrong", "wrong.ext"]]) await run("x509", "-req", "-in", "server.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-days", "2", "-out", name + ".pem", "-extfile", extension);
    await writeFile(cert("expired-index.txt"), ""); await writeFile(cert("expired-serial.txt"), "1000\n");
    await writeFile(cert("expired-ca.cnf"), "[ca]\ndefault_ca=test\n[test]\ndatabase=expired-index.txt\nserial=expired-serial.txt\nnew_certs_dir=.\ncertificate=ca.pem\nprivate_key=ca.key\ndefault_md=sha256\npolicy=names\n[names]\ncommonName=supplied\n");
    await run("ca", "-batch", "-config", "expired-ca.cnf", "-in", "server.csr", "-out", "expired.pem", "-startdate", "20010101000000Z", "-enddate", "20010102000000Z", "-extfile", "server.ext", "-notext");
    await run("req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=Framecraft Synthetic Client", "-keyout", "client.key", "-out", "client.csr");
    await writeFile(cert("client.ext"), "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=clientAuth\n");
    await run("x509", "-req", "-in", "client.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-days", "2", "-out", "client.pem", "-extfile", "client.ext");
  }, 40000);
  afterAll(async () => {
    if (!root) return; const resolved = await realpath(root), base = await realpath(path.resolve(".hmi-preview"));
    if (path.dirname(resolved) !== base || !path.basename(resolved).startsWith("mqtt-tls-faults-")) throw new Error("Cleanup TLS fuori fixture.");
    await rm(resolved, { recursive: true, force: true });
  });
  async function fixture(name = "server", mutual = false) {
    const broker = await Aedes.createBroker(), sockets = new Set<Socket>();
    const server = createTlsServer({ cert: await readFile(cert(name + ".pem")), key: await readFile(cert("server.key")), ca: await readFile(cert("ca.pem")), requestCert: mutual, rejectUnauthorized: true }, broker.handle);
    server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); }); server.on("tlsClientError", () => {});
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Porta TLS non disponibile.");
    const config: MqttConnectionConfig = { id: "tls-test", url: "mqtts://127.0.0.1:" + address.port, timeoutMs: 3000, reconnectMs: 250, bindings: [binding], tls: { caFile: cert("ca.pem") } };
    return { config, broker, async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => broker.close(resolve)); await new Promise<void>((resolve) => server.close(() => resolve())); } };
  }
  it.each([["server", "TLS_UNTRUSTED"], ["wrong", "TLS_HOSTNAME"], ["expired", "TLS_EXPIRED"]])("blocca certificato %s con rimedio preciso, anche se allowInsecure è true", async (name, code) => {
    const test = await fixture(name), events: ConnectionDiagnostic[] = [];
    const driver = createMqttPlcConnection({ ...test.config, allowInsecure: true, ...(code === "TLS_UNTRUSTED" ? { tls: undefined } : {}) }, variables, { onDiagnostic: (event) => events.push(event) });
    try {
      await expect(driver.start()).rejects.toMatchObject({ diagnostic: { code } }); expect(driver.state).toBe("error");
      expect(events.some((event) => event.code === "CONNECTED")).toBe(false); expect(JSON.stringify(events)).not.toContain(cert("server.key"));
      expect(events.find((event) => event.code === code)?.action).toBeTruthy();
    } finally { await driver.stop(); await test.close(); }
  });
  it("accetta solo CA approvata e certificato client valido per un broker mTLS, poi acquisisce dati veri", async () => {
    const test = await fixture("server", true);
    const tls = { caFile: cert("ca.pem"), certificateFile: cert("client.pem"), privateKeyFile: cert("client.key") };
    const driver = createMqttPlcConnection({ ...test.config, tls }, variables);
    let publisher: Awaited<ReturnType<typeof connectAsync>> | undefined;
    try {
      await driver.start(); publisher = await connectAsync(test.config.url, { reconnectPeriod: 0, ca: await readFile(cert("ca.pem")), cert: await readFile(cert("client.pem")), key: await readFile(cert("client.key")), rejectUnauthorized: true });
      await publisher.publishAsync("safe/value", JSON.stringify({ value: 42, quality: 192 }), { qos: 1 });
      await vi.waitFor(() => expect(driver.read("Motor.Speed")).toMatchObject({ value: "42", qualityCode: 192 })); expect(driver.state).toBe("connected");
    } finally { await driver.stop(); await publisher?.endAsync(true); await test.close(); }
  });
  it("un broker mTLS non accetta un client senza certificato", async () => {
    const test = await fixture("server", true), driver = createMqttPlcConnection(test.config, variables);
    try { await expect(driver.start()).rejects.toMatchObject({ diagnostic: { code: "TLS_CONFIGURATION" } }); expect(driver.state).toBe("error"); }
    finally { await driver.stop(); await test.close(); }
  });
  it("un file TLS mancante è distinto da credenziali o rete e non mostra il percorso privato", async () => {
    const test = await fixture(), events: ConnectionDiagnostic[] = [];
    const privatePath = cert("PRIVATE_MISSING_CA.pem"), driver = createMqttPlcConnection({ ...test.config, tls: { caFile: privatePath } }, variables, { onDiagnostic: (event) => events.push(event) });
    try { await expect(driver.start()).rejects.toMatchObject({ diagnostic: { code: "TLS_FILE", technicalCode: "ENOENT" } }); expect(JSON.stringify(events)).not.toContain("PRIVATE_MISSING_CA"); }
    finally { await driver.stop(); await test.close(); }
  });
});
