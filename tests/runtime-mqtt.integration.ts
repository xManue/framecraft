// @vitest-environment node
import { Aedes, type Client } from "aedes";
import { connectAsync } from "mqtt";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMqttPlcConnection, type MqttConnectionConfig, type MqttTagSample } from "../runtime/mqtt-driver.mjs";
import { standardProjectFiles } from "../src/core/standardProject";

const variables = [
  { name: "Motor.Speed", dataType: "Real", access: "read-write" as const },
  { name: "Motor.Enabled", dataType: "Bool", access: "read" as const },
];
async function fixture() {
  const broker = await Aedes.createBroker(); const server = createServer(broker.handle);
  const clients = new Map<string, Client>(); broker.on("client", (client) => clients.set(client.id, client));
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Porta broker non assegnata.");
  const url = "mqtt://127.0.0.1:" + address.port; const publisher = await connectAsync(url, { reconnectPeriod: 0 });
  const config: MqttConnectionConfig = { id: "test", url, clientId: "framecraft-test", allowInsecure: true, reconnectMs: 250, timeoutMs: 3_000, bindings: [
    { tag: "Motor.Speed", topic: "test/motor/speed", encoding: "json", valuePath: "/value", qualityPath: "/quality", timestampPath: "/time", writeTopic: "test/motor/command", writeQos: 1 },
    { tag: "Motor.Enabled", topic: "test/motor/enabled", encoding: "text" },
  ] };
  const samples: MqttTagSample[] = []; const onError = vi.fn(), onState = vi.fn();
  const driver = createMqttPlcConnection(config, variables, { onSample: (sample) => samples.push(sample), onError, onState });
  return { broker, clients, server, publisher, config, driver, samples, onError, onState, async close() {
    await driver.stop(); await publisher.endAsync(true);
    await new Promise<void>((resolve) => broker.close(resolve)); await new Promise<void>((resolve) => server.close(() => resolve()));
  } };
}

describe("driver MQTT reale su broker TCP locale", () => {
  it("avvia i sorgenti del pannello generato e legge un tag dal broker in un processo Node reale", async () => {
    const test = await fixture(); const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true });
    const root = await mkdtemp(path.join(base, "generated-mqtt-"));
    let child: ReturnType<typeof spawn> | undefined, exited: Promise<void> | undefined;
    try {
      const files = standardProjectFiles({ machineName: "Gateway check", layout: "desktop", sections: ["main"] }).filter((file) => file.path.startsWith("runtime/") || ["framecraft.connections.json", "framecraft.plc.json"].includes(file.path));
      for (const file of files) {
        const target = path.resolve(root, file.path); if (path.relative(root, target).startsWith("..")) throw new Error("Sorgente generata fuori dalla fixture.");
        await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content, "utf8");
      }
      await writeFile(path.join(root, "framecraft.connections.json"), JSON.stringify({ version: 1, connections: [{ ...test.config, protocol: "mqtt", enabled: true }] }));
      await writeFile(path.join(root, "framecraft.plc.json"), JSON.stringify({ version: 1, variables }));
      child = spawn(process.execPath, [path.join(root, "runtime/start-mqtt.mjs")], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
      let output = "", errors = ""; child.stdout!.on("data", (chunk) => { output += String(chunk); }); child.stderr!.on("data", (chunk) => { errors += String(chunk); });
      exited = new Promise<void>((resolve, reject) => { child!.once("exit", () => resolve()); child!.once("error", reject); });
      await vi.waitFor(() => expect(output).toContain('"state":"connected"'), { timeout: 8_000 });
      await test.publisher.publishAsync("test/motor/speed", JSON.stringify({ value: 42, quality: 192, time: 1_000 }), { qos: 1 });
      await vi.waitFor(() => expect(output).toContain('"value":"42"'));
      expect(output).toContain('"type":"sample"'); expect(output).toContain('"qualityCode":192'); expect(errors).toBe("");
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); if (exited) await exited;
      await test.close(); const resolved = await realpath(root), intendedBase = await realpath(base);
      if (path.dirname(resolved) !== intendedBase || !path.basename(resolved).startsWith("generated-mqtt-")) throw new Error("Directory di cleanup non valida.");
      await rm(resolved, { recursive: true, force: true });
    }
  }, 15_000);
  it("riceve valori tipizzati, qualità e timestamp senza inventare la qualità del PLC", async () => {
    const test = await fixture();
    try {
      expect(test.driver.read("Motor.Speed")).toBeUndefined(); await test.driver.start();
      await test.publisher.publishAsync("test/motor/speed", JSON.stringify({ value: 42.5, quality: 0x2080, time: 1_000 }), { qos: 1 });
      await test.publisher.publishAsync("test/motor/enabled", "true", { qos: 1 });
      await vi.waitFor(() => expect(test.driver.read("Motor.Enabled")?.value).toBe("true"));
      expect(test.driver.read("Motor.Speed")).toMatchObject({ value: "42.5", qualityCode: 0x2080, timestamp: 1_000, sourceTimestamp: 1_000, retained: false });
      expect(test.driver.read("Motor.Enabled")?.qualityCode).toBeUndefined(); expect(test.driver.state).toBe("connected");
      await test.publisher.publishAsync("test/motor/speed", JSON.stringify({ value: 5, quality: 192, time: 500 }), { qos: 1 });
      await vi.waitFor(() => expect(test.onError).toHaveBeenCalledWith(expect.stringContaining("precedente ignorato")));
      expect(test.driver.read("Motor.Speed")?.value).toBe("42.5"); expect(test.driver.read("Motor.Speed")?.qualityCode).toBe(0x2080);
    } finally { await test.close(); }
  });
  it("rifiuta payload errati, conserva l'ultimo valore e rende visibile la qualità Bad", async () => {
    const test = await fixture();
    try {
      await test.driver.start(); await test.publisher.publishAsync("test/motor/speed", JSON.stringify({ value: 10, quality: 192, time: 1_000 }), { qos: 1 });
      await vi.waitFor(() => expect(test.driver.read("Motor.Speed")?.value).toBe("10"));
      await test.publisher.publishAsync("test/motor/speed", "{not-json", { qos: 1 });
      await vi.waitFor(() => expect(test.driver.read("Motor.Speed")?.lastError).toBe("BadPayload"));
      expect(test.driver.read("Motor.Speed")).toMatchObject({ value: "10", qualityCode: 0 }); expect(test.onError).toHaveBeenCalledWith("Motor.Speed: Payload JSON MQTT non valido.");
      await test.publisher.publishAsync("test/motor/speed", JSON.stringify({ value: "", quality: 192, time: 2_000 }), { qos: 1 });
      await vi.waitFor(() => expect(test.onError).toHaveBeenCalledWith("Motor.Speed: Valore numerico non valido."));
      expect(test.driver.read("Motor.Speed")?.value).toBe("10");
    } finally { await test.close(); }
  });
  it("pubblica solo comandi autorizzati e distingue il broker dall'esecuzione PLC", async () => {
    const test = await fixture(); const driver = createMqttPlcConnection({ ...test.config, allowWrites: true }, variables);
    try {
      await expect(test.driver.write("Motor.Speed", 50)).rejects.toThrow("non autorizzata");
      await driver.start(); await test.publisher.subscribeAsync("test/motor/command", { qos: 1 });
      const received = new Promise<{ content: string; retained: boolean }>((resolve) => test.publisher.once("message", (_, payload, packet) => resolve({ content: payload.toString(), retained: packet.retain })));
      expect(await driver.write("Motor.Speed", 50)).toEqual({ tag: "Motor.Speed", delivery: "broker-ack", plcConfirmed: false });
      expect(await received).toEqual({ content: "50", retained: false }); expect(driver.read("Motor.Speed")).toBeUndefined();
      await expect(driver.write("Motor.Enabled", true)).rejects.toThrow("non autorizzata");
      await driver.stop(); await expect(driver.write("Motor.Speed", 70)).rejects.toThrow("non accodato");
    } finally { await driver.stop(); await test.close(); }
  });
  it("rileva dati scaduti e recupera una connessione spezzata con una nuova sottoscrizione", async () => {
    const test = await fixture(); const driver = createMqttPlcConnection({ ...test.config, bindings: [{ ...test.config.bindings[1], staleAfterMs: 250 }] }, variables);
    try {
      await driver.start(); await test.publisher.publishAsync("test/motor/enabled", "1", { qos: 1 });
      await vi.waitFor(() => expect(driver.read("Motor.Enabled")?.value).toBe("true"));
      await vi.waitFor(() => expect(driver.read("Motor.Enabled")?.lastError).toBe("BadStaleReading"), { timeout: 2_000 });
      test.clients.get("framecraft-test")!.conn.destroy();
      await vi.waitFor(() => expect(driver.state).toBe("reconnecting"));
      expect(driver.read("Motor.Enabled")?.lastError).toBe("BadNoCommunication");
      await vi.waitFor(() => expect(driver.state).toBe("connected"), { timeout: 3_000 });
      await test.publisher.publishAsync("test/motor/enabled", "0", { qos: 1 }); await vi.waitFor(() => expect(driver.read("Motor.Enabled")?.value).toBe("false"));
      expect(driver.read("Motor.Enabled")?.lastError).toBeUndefined();
    } finally { await driver.stop(); await test.close(); }
  });
  it("non ripubblica un comando dall'esito incerto dopo la riconnessione", async () => {
    const test = await fixture(); const driver = createMqttPlcConnection({ ...test.config, allowWrites: true }, variables);
    let attempts = 0; const blocked: Array<(error?: Error | null) => void> = [];
    test.broker.authorizePublish = (client, packet, callback) => {
      if (client?.id === "framecraft-test" && packet.topic === "test/motor/command") { attempts++; blocked.push(callback); } else callback(null);
    };
    try {
      await driver.start(); const assertion = expect(driver.write("Motor.Speed", 80)).rejects.toThrow("esito del comando non confermato");
      await vi.waitFor(() => expect(attempts).toBe(1)); test.clients.get("framecraft-test")!.conn.destroy(); await assertion;
      await vi.waitFor(() => expect(driver.state).toBe("connected"), { timeout: 3_000 }); expect(attempts).toBe(1);
    } finally { for (const callback of blocked) callback(new Error("Comando di collaudo scartato.")); await driver.stop(); await test.close(); }
  });
  it("termina l'avvio fallito senza esporre segreti o lasciare riconnessioni attive", async () => {
    const test = await fixture(); const onError = vi.fn();
    const driver = createMqttPlcConnection({ ...test.config, passwordEnv: "MISSING_SECRET" }, variables, { onError, resolveSecret: () => undefined });
    try {
      await expect(driver.start()).rejects.toThrow("Configurazione o certificati"); expect(driver.state).toBe("error");
      expect(onError).toHaveBeenCalledWith("Configurazione o certificati MQTT non disponibili.");
    } finally { await driver.stop(); await test.close(); }
  });
  it("blocca endpoint con segreti, TLS implicito disattivato, mapping sconosciuti e comandi retained", () => {
    const config: MqttConnectionConfig = { id: "test", url: "mqtt://127.0.0.1:1883", allowInsecure: true, bindings: [{ tag: "Motor.Speed", topic: "motor/speed" }] };
    expect(() => createMqttPlcConnection({ ...config, allowInsecure: false }, variables)).toThrow("senza TLS");
    expect(() => createMqttPlcConnection({ ...config, passwordEnv: "VITE_MQTT_PASSWORD" }, variables)).toThrow("mai VITE_");
    expect(() => createMqttPlcConnection({ ...config, passwordEnv: ["PLC_PASSWORD"] as unknown as string }, variables)).toThrow("variabili ambiente del servizio");
    expect(() => createMqttPlcConnection({ ...config, url: "mqtts://user:password@example.test" }, variables)).toThrow("credenziali");
    try { createMqttPlcConnection({ ...config, url: "mqtts://user:VERY_SECRET@invalid host" }, variables); throw new Error("URL accettato per errore"); }
    catch (error) { expect(String(error)).toContain("URL MQTT non valido"); expect(String(error)).not.toContain("VERY_SECRET"); }
    expect(() => createMqttPlcConnection({ ...config, bindings: [{ tag: "Unknown", topic: "test" }] }, variables)).toThrow("non dichiarato");
    expect(() => createMqttPlcConnection({ ...config, bindings: [{ ...config.bindings[0], topic: "motor/+" }] }, variables)).toThrow("senza wildcard");
    expect(() => createMqttPlcConnection({ ...config, reconnectMs: "wrong" as unknown as number }, variables)).toThrow("Intervallo MQTT");
    expect(() => createMqttPlcConnection({ ...config, timeoutMs: 1 }, variables)).toThrow("Intervallo MQTT");
    expect(() => createMqttPlcConnection({ ...config, bindings: [{ ...config.bindings[0], writeRetain: true } as unknown as MqttConnectionConfig["bindings"][number]] }, variables)).toThrow("retained");
  });
});
