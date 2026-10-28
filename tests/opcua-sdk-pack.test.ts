import { mkdir, mkdtemp, writeFile, readFile, readdir, symlink } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { beforeEach, expect, it } from "vitest";
import { packageOpcUaSdk, opcUaSdkVersions } from "../scripts/package-opcua-sdk.mjs";
import { installOpcUaSdk, resolveOpcUaSdk } from "../scripts/opcua-sdk-cache.mjs";
let root: string;
beforeEach(async () => { const base = path.resolve(".hmi-preview/sdk-pack-unit"); await mkdir(base, { recursive: true }); root = await mkdtemp(path.join(base, "case-")); });
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
function file(name: string, content: string) { const data = Buffer.from(content); return { path: name, size: data.length, sha256: sha(data), data: data.toString("base64") }; }
function archive() { const files = Object.entries(opcUaSdkVersions).flatMap(([name, version]) => [file("node_modules/" + name + "/package.json", JSON.stringify({ name, version, main: "index.js" })), file("node_modules/" + name + "/index.js", "exports.synthetic = true;")]); return { version: 1, roots: opcUaSdkVersions, bytes: files.reduce((sum, item) => sum + item.size, 0), packages: 3, files }; }
const pack = (value = archive()) => gzipSync(Buffer.from(JSON.stringify(value)));
it("extracts a synthetic SDK, verifies cached bytes and resolves only the fixed root modules", async () => {
  const bytes = pack(), target = await installOpcUaSdk(bytes, root), modules = await resolveOpcUaSdk(target);
  expect(Object.keys(modules)).toEqual(Object.keys(opcUaSdkVersions)); expect(await installOpcUaSdk(bytes, root)).toBe(target);
  for (const entry of Object.values(modules)) expect(new URL(entry).pathname).toContain("sdk-" + sha(bytes));
  expect((await readdir(root)).filter(name => name.startsWith("stage-"))).toEqual([]);
});
it.each(["../outside", "node_modules/../../outside", "node_modules/a/../outside", "node_modules/a\\outside", "node_modules/C:/outside", "node_modules/con/file.js", "node_modules/a./file.js"])("rejects unsafe extraction path %s", async target => {
  const value = archive(); value.files[0].path = target;
  await expect(installOpcUaSdk(pack(value), root)).rejects.toMatchObject({ code: "OPC_UA_DESKTOP_SDK" }); expect(await readdir(root)).toEqual([]);
});
it("rejects duplicate paths, inconsistent lengths, corrupt data/hashes and a wrong root version", async () => {
  for (const change of [(v: ReturnType<typeof archive>) => v.files.push(v.files[0]), (v: ReturnType<typeof archive>) => { v.files[0].size++; }, (v: ReturnType<typeof archive>) => { v.files[0].data = "not-base64"; }, (v: ReturnType<typeof archive>) => { v.files[0].sha256 = "a".repeat(64); }, (v: ReturnType<typeof archive>) => { v.bytes++; }, (v: ReturnType<typeof archive>) => { v.roots = { ...v.roots, "node-opcua-client": "wrong" }; }]) {
    const value = archive(); change(value); await expect(installOpcUaSdk(pack(value), root)).rejects.toMatchObject({ code: "OPC_UA_DESKTOP_SDK" });
  }
});
it("does not repair or overwrite a modified or extra cache file", async () => {
  const bytes = pack(), target = await installOpcUaSdk(bytes, root), file = path.join(target, "node_modules/node-opcua-client/index.js");
  await writeFile(file, "external"); await expect(installOpcUaSdk(bytes, root)).rejects.toMatchObject({ code: "OPC_UA_DESKTOP_SDK" }); expect(await readFile(file, "utf8")).toBe("external");
  const other = await mkdtemp(path.join(root, "other-")), second = await installOpcUaSdk(bytes, other); await writeFile(path.join(second, "unexpected.js"), "external");
  await expect(installOpcUaSdk(bytes, other)).rejects.toMatchObject({ code: "OPC_UA_DESKTOP_SDK" });
});
it("rejects a linked cache directory without following or deleting its contents", async () => {
  const bytes = pack(), outside = await mkdtemp(path.join(root, "outside-")); await writeFile(path.join(outside, "keep"), "external");
  await symlink(outside, path.join(root, "sdk-" + sha(bytes)), process.platform === "win32" ? "junction" : "dir");
  await expect(installOpcUaSdk(bytes, root)).rejects.toMatchObject({ code: "OPC_UA_DESKTOP_SDK" }); expect(await readFile(path.join(outside, "keep"), "utf8")).toBe("external");
});
it("cancels extraction and cleans only its own temporary directory", async () => {
  const abort = new AbortController(); abort.abort(); await writeFile(path.join(root, "keep"), "external");
  await expect(installOpcUaSdk(pack(), root, abort.signal)).rejects.toThrow(); expect(await readdir(root)).toEqual(["keep"]);
});
async function app() {
  const lock: Record<string, { version: string }> = {};
  async function pkg(relative: string, name: string, version: string, dependencies = {}, optionalDependencies = {}) {
    const dir = path.join(root, "node_modules", relative); await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ name, version, main: "index.js", dependencies, optionalDependencies })); await writeFile(path.join(dir, "index.js"), "exports.synthetic=true;"); await writeFile(path.join(dir, "LICENSE"), "SYNTHETIC LICENSE"); lock["node_modules/" + relative] = { version };
  }
  await writeFile(path.join(root, "package.json"), '{"name":"synthetic-sdk-app"}');
  for (const [name, version] of Object.entries(opcUaSdkVersions)) await pkg(name, name, version, name === "node-opcua-client" || name === "node-opcua-certificate-manager" ? { "synthetic-dep": "*" } : {}, { "absent-optional": "*" });
  await pkg("synthetic-dep", "synthetic-dep", "1.0.0"); await pkg("node-opcua-certificate-manager/node_modules/synthetic-dep", "synthetic-dep", "2.0.0");
  await writeFile(path.join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: lock }));
}
it("packs the installed dependency graph reproducibly, including nested versions and notices", async () => {
  await app(); const bytes = await packageOpcUaSdk(root), second = await packageOpcUaSdk(root); expect(second.equals(bytes)).toBe(true);
  const result = JSON.parse(gunzipSync(bytes).toString("utf8")); expect(result.packages).toBe(5); expect(result.lockSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.files.some((f: { path: string }) => f.path === "node_modules/node-opcua-certificate-manager/node_modules/synthetic-dep/LICENSE")).toBe(true);
  expect(gunzipSync(bytes).toString()).not.toContain(root); expect(result.files.filter((f: { path: string }) => f.path.endsWith("LICENSE"))).toHaveLength(5);
});
it("rejects installed versions different from the lock and missing required dependencies", async () => {
  await app(); const manifest = path.join(root, "node_modules/synthetic-dep/package.json"); await writeFile(manifest, '{"name":"synthetic-dep","version":"9","main":"index.js"}');
  await expect(packageOpcUaSdk(root)).rejects.toThrow("SDK_LOCK");
  await writeFile(manifest, '{"name":"synthetic-dep","version":"1.0.0","main":"index.js","dependencies":{"absent-required":"*"}}'); await expect(packageOpcUaSdk(root)).rejects.toThrow("SDK_DEPENDENCY");
});
