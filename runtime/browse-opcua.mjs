import { fileURLToPath } from "node:url";
import { browseConfiguredOpcUa } from "./opcua-browser.mjs";
import { OpcUaBrowseError } from "./opcua-browse-policy.mjs";
import { ConnectionOperationError, diagnosticText } from "./connection-diagnostics.mjs";
const controller = new AbortController(), stop = () => controller.abort();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, stop);
try {
  const args = process.argv.slice(2), values = {}, allowed = ["--connection", "--namespace-uri", "--node-id", "--offset", "--limit", "--revision"];
  for (let index = 0; index < args.length; index++) {
    const key = args[index]; if (!allowed.includes(key) || Object.hasOwn(values, key) || index + 1 >= args.length) throw new OpcUaBrowseError("OPC_UA_BROWSE_INPUT"); values[key] = args[++index];
  }
  const query = {};
  for (const [flag, key] of [["--namespace-uri", "namespaceUri"], ["--node-id", "nodeId"], ["--revision", "revision"], ["--offset", "offset"], ["--limit", "limit"]]) if (Object.hasOwn(values, flag)) { const value = values[flag]; if (["offset", "limit"].includes(key) && !/^(0|[1-9]\d*)$/.test(value)) throw new OpcUaBrowseError("OPC_UA_BROWSE_INPUT"); query[key] = ["offset", "limit"].includes(key) ? Number(value) : value; }
  if (!values["--connection"]) throw new OpcUaBrowseError("OPC_UA_BROWSE_INPUT");
  const result = await browseConfiguredOpcUa({ root: fileURLToPath(new URL("../", import.meta.url)), connectionId: values["--connection"], query, signal: controller.signal });
  process.stdout.write(JSON.stringify({ ok: true, type: "opcua-browse", ...result }) + "\n");
} catch (error) {
  const safe = error instanceof OpcUaBrowseError ? { code: error.code, error: error.message, remedy: error.remedy } : error instanceof ConnectionOperationError ? { code: error.diagnostic.code, error: diagnosticText(error.diagnostic), remedy: error.diagnostic.action } : { code: "OPC_UA_BROWSE_RESPONSE", error: new OpcUaBrowseError("OPC_UA_BROWSE_RESPONSE").message, remedy: new OpcUaBrowseError("OPC_UA_BROWSE_RESPONSE").remedy };
  process.stdout.write(JSON.stringify({ ok: false, type: "opcua-browse", ...safe }) + "\n"); process.exitCode = 1;
} finally { for (const signal of ["SIGINT", "SIGTERM"]) process.removeListener(signal, stop); }
