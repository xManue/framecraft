import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createMqttPlcConnection } from "./mqtt-driver.mjs";
import { validateMqttConnection } from "./connection-config.mjs";
import { ConnectionOperationError, connectionDiagnostic } from "./connection-diagnostics.mjs";
import { createRuntimeLogger } from "./runtime-log.mjs";

const root = new URL("../", import.meta.url), connections = [];
const json = process.argv.includes("--json");
const logger = createRuntimeLogger({ directory: fileURLToPath(new URL(".framecraft-runtime/logs/mqtt/", root)), json });
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await Promise.allSettled(connections.map((connection) => connection.stop())); await logger.close(); }
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void stop(); });
try {
  const catalog = JSON.parse(await readFile(new URL("framecraft.connections.json", root), "utf8"));
  const plc = JSON.parse(await readFile(new URL("framecraft.plc.json", root), "utf8"));
  if (catalog.version !== 1 || !Array.isArray(catalog.connections) || !Array.isArray(plc.variables)) throw new Error("Cataloghi non validi.");
  const enabled = catalog.connections.filter((connection) => connection.enabled === true);
  if (enabled.some((connection) => connection.protocol !== "mqtt")) throw new ConnectionOperationError(connectionDiagnostic("OPC_UA_UNAVAILABLE", { protocol: "opcua" }));
  if (enabled.length > 1000 || enabled.reduce((count, connection) => count + (connection.bindings?.length ?? 0), 0) > 5000) throw new Error("Catalogo troppo grande.");
  for (const config of enabled) validateMqttConnection(config, plc.variables);
  if (new Set(enabled.map((connection) => connection.id)).size !== enabled.length || new Set(enabled.flatMap((connection) => connection.bindings.map((binding) => binding.tag))).size !== enabled.reduce((sum, connection) => sum + connection.bindings.length, 0)) throw new Error("Catalogo duplicato.");
  for (const config of enabled) connections.push(createMqttPlcConnection(config, plc.variables, {
    onState: (state) => process.stdout.write(JSON.stringify({ type: "connection", ...state }) + "\n"),
    onDiagnostic: (event) => logger.write(event),
    ...(process.argv.includes("--samples") ? { onSample: (sample) => process.stdout.write(JSON.stringify({ type: "sample", connectionId: config.id, ...sample }) + "\n") } : {}),
  }));
  if (!connections.length) process.stdout.write((json ? JSON.stringify({ type: "mqtt", state: "disabled" }) : "Nessuna connessione MQTT abilitata; nessun dato PLC simulato.") + "\n");
  if (!stopping) await Promise.all(connections.map((connection) => connection.start()));
} catch (error) {
  logger.write(error instanceof ConnectionOperationError ? error.diagnostic : connectionDiagnostic("CONFIGURATION", { protocol: "mqtt", technicalCode: error.code }));
  await stop(); process.exitCode = 1;
} finally { if (!connections.length) await logger.close(); else await logger.flush(); }
