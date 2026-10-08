import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPlcGateway } from "./gateway.mjs";
import { ConnectionOperationError, connectionDiagnostic } from "./connection-diagnostics.mjs";
import { createRuntimeLogger } from "./runtime-log.mjs";

const root = new URL("../", import.meta.url);
const json = process.argv.includes("--json");
const logger = createRuntimeLogger({ directory: fileURLToPath(new URL(".framecraft-runtime/logs/gateway/", root)), json });
let gateway, stopping = false;
async function stop() { if (stopping) return; stopping = true; await gateway?.stop(); await logger.close(); }
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void stop(); });
try {
  const catalog = JSON.parse(await readFile(new URL("framecraft.connections.json", root), "utf8"));
  const plc = JSON.parse(await readFile(new URL("framecraft.plc.json", root), "utf8"));
  if (catalog.gateway?.enabled !== true) process.stdout.write((json ? JSON.stringify({ type: "gateway", state: "disabled" }) : "Gateway disabilitato; nessuna connessione PLC avviata.") + "\n");
  else {
    gateway = createPlcGateway(catalog, plc.variables, { onDiagnostic: (event) => logger.write(event),
      onState: (state) => process.stdout.write(JSON.stringify({ type: "connection", ...state }) + "\n") });
    if (!stopping) {
      await gateway.start();
      process.stdout.write(JSON.stringify({ type: "gateway", address: gateway.address }) + "\n");
      if (gateway.snapshot().connections.some((connection) => connection.state === "error")) process.stderr.write((json ? JSON.stringify({ type: "gateway", state: "degraded" }) : "Gateway disponibile, ma una o più connessioni PLC non sono pronte. Consulta la diagnostica prima di usare la macchina.") + "\n");
    }
  }
} catch (error) {
  logger.write(error instanceof ConnectionOperationError ? error.diagnostic : connectionDiagnostic("CONFIGURATION", { protocol: "gateway", technicalCode: error.code }));
  await stop(); process.exitCode = 1;
} finally { if (!gateway) await logger.close(); else await logger.flush(); }
