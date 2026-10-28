import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { browseConfiguredOpcUa } from "../runtime/opcua-browser.mjs";
import { opcUaStandardNamespace } from "../runtime/opcua-browse-policy.mjs";

const driver = vi.hoisted(() => {
  const start = vi.fn(), browse = vi.fn(), stop = vi.fn();
  return { start, browse, stop, create: vi.fn((..._args: unknown[]) => ({ start, browse, stop })) };
});
vi.mock("../runtime/opcua-driver.mjs", () => ({ createOpcUaPlcConnection: driver.create }));
let root: string;
const profile = { id: "synthetic-browser", protocol: "opcua", enabled: true, url: "opc.tcp://synthetic.invalid:4840", securityMode: "None", securityPolicy: "None", allowInsecure: true, allowWrites: true, bindings: [{ tag: "NeverRead", namespaceUri: "urn:test", nodeId: "s=ProcessValue", writeEnabled: true }] };
async function save(patch = {}) { const source = JSON.stringify({ version: 1, connections: [{ ...profile, ...patch }] }); await writeFile(path.join(root, "framecraft.connections.json"), source); return source; }
const options = () => ({ root, connectionId: profile.id });
beforeEach(async () => {
  vi.resetAllMocks(); driver.create.mockImplementation(() => driver);
  driver.start.mockResolvedValue(undefined); driver.stop.mockResolvedValue(undefined);
  driver.browse.mockResolvedValue({ version: 1, target: { namespaceUri: opcUaStandardNamespace, nodeId: "i=85" }, revision: "a".repeat(64), offset: 0, limit: 100, total: 0, nextOffset: null, nodes: [] });
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); root = await mkdtemp(path.join(base, "opcua-config-cas-")); await save();
});

it("rejects a changed expected config before constructing any network client", async () => {
  const expectedConfiguration = await readFile(path.join(root, "framecraft.connections.json"), "utf8");
  await save({ url: "opc.tcp://different.invalid:4840" });
  await expect(browseConfiguredOpcUa({ ...options(), expectedConfiguration })).rejects.toMatchObject({ code: "OPC_UA_BROWSE_CHANGED" });
  expect(driver.create).not.toHaveBeenCalled(); expect(driver.start).not.toHaveBeenCalled();
});
it("requires exact source equality, not only an equivalent parsed endpoint", async () => {
  const expectedConfiguration = await save(); await writeFile(path.join(root, "framecraft.connections.json"), expectedConfiguration + "\n");
  await expect(browseConfiguredOpcUa({ ...options(), expectedConfiguration })).rejects.toMatchObject({ code: "OPC_UA_BROWSE_CHANGED" }); expect(driver.create).not.toHaveBeenCalled();
});
it.each([null, 42, {}, "x".repeat(4 * 1024 * 1024 + 1)])("rejects malformed or oversized expected configuration without networking", async expectedConfiguration => {
  await expect(browseConfiguredOpcUa({ ...options(), expectedConfiguration: expectedConfiguration as string })).rejects.toMatchObject({ code: "OPC_UA_BROWSE_CONFIG" }); expect(driver.create).not.toHaveBeenCalled();
});
it("accepts exact expected config, strips bindings/commands, and derives PKI from project root", async () => {
  const expectedConfiguration = await save(); const result = await browseConfiguredOpcUa({ ...options(), expectedConfiguration });
  const config = driver.create.mock.calls[0][0] as unknown as Record<string, unknown>;
  expect(config).toMatchObject({ bindings: [], allowWrites: false, pkiDirectory: path.join(root, ".framecraft-runtime", "opcua", createHash("sha256").update(profile.id).digest("hex").slice(0, 24)) });
  expect(driver.start).toHaveBeenCalledOnce(); expect(driver.browse).toHaveBeenCalledOnce(); expect(driver.stop).toHaveBeenCalledOnce();
  expect(result.configurationRevision).toBe(createHash("sha256").update(expectedConfiguration).digest("hex")); expect(await readFile(path.join(root, "framecraft.connections.json"), "utf8")).toBe(expectedConfiguration);
});
it("resolves explicitly relative certificate/key/PKI paths against the opened project, not worker cwd", async () => {
  await save({ securityMode: "SignAndEncrypt", securityPolicy: "Basic256Sha256", allowInsecure: false, certificateFile: "certs/client.pem", privateKeyFile: "certs/private.key", pkiDirectory: "security/pki", applicationUri: "urn:framecraft:synthetic-client" });
  await browseConfiguredOpcUa(options()); const config = driver.create.mock.calls[0][0] as unknown as Record<string, unknown>;
  expect(config).toMatchObject({ certificateFile: path.join(root, "certs", "client.pem"), privateKeyFile: path.join(root, "certs", "private.key"), pkiDirectory: path.join(root, "security", "pki") });
});
it("keeps absolute paths and does not invent PKI for an incomplete secure profile", async () => {
  await save({ pkiDirectory: path.join(root, "absolute-pki") }); await browseConfiguredOpcUa(options());
  expect(driver.create.mock.calls[0][0]).toMatchObject({ pkiDirectory: path.join(root, "absolute-pki") });
  driver.create.mockClear(); await save({ securityMode: "SignAndEncrypt", securityPolicy: "Basic256Sha256", applicationUri: "urn:framecraft:synthetic-client" });
  await expect(browseConfiguredOpcUa(options())).rejects.toMatchObject({ code: "OPC_UA_BROWSE_CONFIG" }); expect(driver.create).not.toHaveBeenCalled();
});
it("still rejects an on-disk change after browsing and closes the dedicated session", async () => {
  const expectedConfiguration = await save(); driver.start.mockImplementation(async () => { await writeFile(path.join(root, "framecraft.connections.json"), expectedConfiguration + "\n"); });
  await expect(browseConfiguredOpcUa({ ...options(), expectedConfiguration })).rejects.toMatchObject({ code: "OPC_UA_BROWSE_CHANGED" }); expect(driver.stop).toHaveBeenCalledOnce();
});
it("does not start or create a PKI/session for a cancelled request", async () => {
  const abort = new AbortController(); abort.abort();
  await expect(browseConfiguredOpcUa({ ...options(), signal: abort.signal })).rejects.toMatchObject({ code: "OPC_UA_BROWSE_CANCELLED" }); expect(driver.create).not.toHaveBeenCalled();
});
