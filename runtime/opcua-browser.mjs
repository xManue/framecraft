import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { createOpcUaPlcConnection } from "./opcua-driver.mjs";
import { validateOpcUaConnection } from "./connection-config.mjs";
import { OpcUaBrowseError, parseOpcUaBrowseQuery } from "./opcua-browse-policy.mjs";
const fail = () => { throw new OpcUaBrowseError("OPC_UA_BROWSE_CONFIG"); };
async function configuration(root) {
  let file;
  try {
    const target = path.join(root, "framecraft.connections.json"), before = await lstat(target);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 4 * 1024 * 1024) fail();
    file = await open(target, "r"); const source = await file.readFile("utf8"), after = await lstat(target), opened = await file.stat();
    if (Buffer.byteLength(source) > 4 * 1024 * 1024 || [after, opened].some(s => !s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.dev !== before.dev || s.ino !== before.ino || s.size !== before.size || s.mtimeMs !== before.mtimeMs)) fail();
    return source;
  } catch { fail(); } finally { await file?.close(); }
}
export async function browseConfiguredOpcUa(options) {
  if (!options || typeof options.root !== "string" || !path.isAbsolute(options.root) || typeof options.connectionId !== "string" || !options.connectionId.trim() || options.connectionId.length > 200 || /[\u0000-\u001f\u007f]/.test(options.connectionId)) fail();
  const query = parseOpcUaBrowseQuery(options.query); if (options.signal?.aborted) throw new OpcUaBrowseError("OPC_UA_BROWSE_CANCELLED");
  let root; try { root = await realpath(options.root); } catch { fail(); }
  const source = await configuration(root); let catalog;
  try { catalog = JSON.parse(source); } catch { fail(); }
  if (catalog?.version !== 1 || !Array.isArray(catalog.connections) || catalog.connections.length > 1000) fail();
  const profiles = catalog.connections.filter(profile => profile?.id === options.connectionId);
  if (profiles.length !== 1 || profiles[0].protocol !== "opcua" || profiles[0].enabled !== true) fail();
  const config = { ...profiles[0], bindings: [], allowWrites: false };
  try { validateOpcUaConnection(config, []); } catch { fail(); }
  const connection = createOpcUaPlcConnection(config, [], { resolveSecret: options.resolveSecret });
  const abort = () => { void connection.stop().catch(() => {}); };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    if (options.signal?.aborted) throw new OpcUaBrowseError("OPC_UA_BROWSE_CANCELLED");
    await connection.start(); const page = await connection.browse(query, options.signal);
    if (options.signal?.aborted) throw new OpcUaBrowseError("OPC_UA_BROWSE_CANCELLED");
    if (await configuration(root) !== source) throw new OpcUaBrowseError("OPC_UA_BROWSE_CHANGED");
    return { version: 1, connectionId: options.connectionId, configurationRevision: createHash("sha256").update(source).digest("hex"), page };
  } catch (error) { if (options.signal?.aborted) throw new OpcUaBrowseError("OPC_UA_BROWSE_CANCELLED"); throw error; }
  finally { options.signal?.removeEventListener("abort", abort); await connection.stop(); }
}
