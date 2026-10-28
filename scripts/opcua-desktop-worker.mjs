import { installOpcUaSdk, resolveOpcUaSdk } from "./opcua-sdk-cache.mjs";
import { createHash } from "node:crypto";

const url = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
export async function runDesktopOpcUa(input, signal) {
  signal.throwIfAborted();
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || major === 22 && minor < 13) throw Object.assign(new Error(), { code: "OPC_UA_DESKTOP_NODE" });
  const sdkRoot = input.devSdkRoot ?? await installOpcUaSdk(input.sdkPack, input.sdkCache, signal);
  const sdk = await resolveOpcUaSdk(sdkRoot), modules = new Map(), visiting = new Set();
  function module(name) {
    if (modules.has(name)) return modules.get(name);
    if (visiting.has(name) || !Object.hasOwn(input.sources, name)) throw Object.assign(new Error(), { code: "OPC_UA_DESKTOP_SDK" });
    visiting.add(name);
    const source = input.sources[name].replace(/(["'])(\.\/[\w-]+\.mjs|node-opcua-[\w-]+)\1/g, (_match, _quote, target) => JSON.stringify(target.startsWith("./") ? module(target.slice(2)) : sdk[target] ?? (() => { throw Error("SDK_IMPORT"); })()));
    const result = url(source); visiting.delete(name); modules.set(name, result); return result;
  }
  signal.throwIfAborted();
  const browser = await import(module("opcua-browser.mjs")); signal.throwIfAborted();
  const result = await browser.browseConfiguredOpcUa({ root: input.root, connectionId: input.connectionId, query: input.query, expectedConfiguration: input.expectedConfiguration, signal });
  if (result.configurationRevision !== createHash("sha256").update(input.expectedConfiguration).digest("hex")) throw Object.assign(new Error(), { code: "OPC_UA_BROWSE_CHANGED" });
  return result;
}
