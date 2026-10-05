import { readFile } from "node:fs/promises";
import { createMqttPlcConnection } from "./mqtt-driver.mjs";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("framecraft.connections.json", root), "utf8"));
const plc = JSON.parse(await readFile(new URL("framecraft.plc.json", root), "utf8"));
if (catalog.version !== 1 || !Array.isArray(catalog.connections) || !Array.isArray(plc.variables)) throw new Error("Cataloghi connessioni/PLC non validi.");
const enabled = catalog.connections.filter((connection) => connection.enabled === true);
if (enabled.some((connection) => connection.protocol !== "mqtt")) throw new Error("Questo avvio supporta MQTT; il driver OPC UA non è ancora disponibile.");
if (new Set(enabled.map((connection) => connection.id)).size !== enabled.length) throw new Error("Id di connessione duplicati.");
if (new Set(enabled.flatMap((connection) => connection.bindings.map((binding) => binding.tag))).size !== enabled.reduce((sum, connection) => sum + connection.bindings.length, 0)) throw new Error("Un tag non può avere due sorgenti MQTT attive.");

const connections = enabled.map((connection) => createMqttPlcConnection(connection, plc.variables, {
  onState: (state) => process.stdout.write(JSON.stringify({ type: "connection", ...state }) + "\n"),
  onSample: (sample) => process.stdout.write(JSON.stringify({ type: "sample", connectionId: connection.id, ...sample }) + "\n"),
  onError: (message) => process.stderr.write(message + "\n"),
}));
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await Promise.allSettled(connections.map((connection) => connection.stop())); }
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void stop(); });
if (!connections.length) process.stdout.write("Nessuna connessione MQTT abilitata; nessun dato PLC simulato.\n");
try { await Promise.all(connections.map((connection) => connection.start())); }
catch { await stop(); process.exitCode = 1; }
