import { readFile } from "node:fs/promises";
import { createMqttGateway } from "./gateway.mjs";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("framecraft.connections.json", root), "utf8"));
const plc = JSON.parse(await readFile(new URL("framecraft.plc.json", root), "utf8"));
if (catalog.gateway?.enabled !== true) {
  process.stdout.write("Gateway disabilitato; nessuna connessione PLC avviata.\n");
} else {
  const gateway = createMqttGateway(catalog, plc.variables, { onError: (message) => process.stderr.write(message + "\n"),
    onState: (state) => process.stdout.write(JSON.stringify({ type: "connection", ...state }) + "\n") });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void gateway.stop(); });
  try { await gateway.start(); process.stdout.write(JSON.stringify({ type: "gateway", address: gateway.address }) + "\n"); }
  catch { await gateway.stop(); process.stderr.write("Avvio gateway non riuscito.\n"); process.exitCode = 1; }
}
