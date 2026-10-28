import { mkdir, mkdtemp, lstat, realpath, readdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const versions = { "node-opcua-client": "2.186.17", "node-opcua-certificate-manager": "2.186.17", "node-opcua-debug": "2.186.7" };
const fail = () => { throw Object.assign(new Error(), { code: "OPC_UA_DESKTOP_SDK" }); };
const hash = data => createHash("sha256").update(data).digest("hex");
const inside = (root, target) => { const relative = path.relative(root, target); return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative); };
function safeFile(value) { return typeof value === "string" && value.startsWith("node_modules/") && value.length <= 1024 && !/[\u0000-\u001f\\:]/.test(value) && value.split("/").every(part => part && part !== "." && part !== ".." && !/[ .]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)); }
async function normalDirectory(folder) { const stat = await lstat(folder); if (!stat.isDirectory() || stat.isSymbolicLink()) fail(); }
async function parallel(items, action) {
  let cursor = 0, failure;
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => {
    while (!failure && cursor < items.length) { const item = items[cursor++]; try { await action(item); } catch (error) { failure ??= error; } }
  }));
  if (failure) throw failure;
}
function directories(expected) {
  const result = new Set();
  for (const file of expected.keys()) { const parts = file.split("/"); parts.pop(); while (parts.length) { const directory = parts.join("/"); if (expected.has(directory)) fail(); result.add(directory); parts.pop(); } }
  return result;
}
async function verify(root, expected) {
  const seen = new Set(), allowedDirectories = directories(expected), pending = [root], files = [];
  while (pending.length) {
    const batch = pending.splice(0, 8);
    await parallel(batch, async folder => {
      await normalDirectory(folder);
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const target = path.join(folder, entry.name), relative = path.relative(root, target).split(path.sep).join("/");
        if (entry.isSymbolicLink()) fail();
        if (entry.isDirectory()) { if (!allowedDirectories.has(relative)) fail(); pending.push(target); }
        else { if (!expected.has(relative)) fail(); files.push({ target, relative }); }
      }
    });
  }
  await parallel(files, async ({ target, relative }) => {
    const stat = await lstat(target), file = expected.get(relative);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== file.size || !inside(root, await realpath(target)) || hash(await readFile(target)) !== file.sha256) fail();
    seen.add(relative);
  });
  if (seen.size !== expected.size) fail();
}
export async function installOpcUaSdk(pack, cacheRoot, signal) {
  if (!Buffer.isBuffer(pack) || pack.length === 0 || pack.length > 32 * 1024 * 1024 || !path.isAbsolute(cacheRoot)) fail();
  let archive;
  try { archive = JSON.parse(gunzipSync(pack, { maxOutputLength: 192 * 1024 * 1024 }).toString("utf8")); } catch { fail(); }
  if (archive?.version !== 1 || JSON.stringify(archive.roots) !== JSON.stringify(versions) || !Array.isArray(archive.files) || !archive.files.length || archive.files.length > 20000) fail();
  const expected = new Map(); let bytes = 0;
  for (const file of archive.files) {
    if (!file || !safeFile(file.path) || expected.has(file.path) || !Number.isInteger(file.size) || file.size < 0 || file.size > 16 * 1024 * 1024 || typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256) || typeof file.data !== "string") fail();
    const data = Buffer.from(file.data, "base64"); if (data.toString("base64") !== file.data || data.length !== file.size || hash(data) !== file.sha256) fail();
    expected.set(file.path, { size: file.size, sha256: file.sha256, data }); bytes += file.size;
    if (bytes > 128 * 1024 * 1024) fail();
  }
  if (archive.bytes !== bytes) fail();
  await mkdir(cacheRoot, { recursive: true }); await normalDirectory(cacheRoot); const base = await realpath(cacheRoot), destination = path.join(base, "sdk-" + hash(pack));
  let exists = false; try { await lstat(destination); exists = true; } catch (error) { if (error.code !== "ENOENT") fail(); }
  if (exists) { await verify(destination, expected); return destination; }
  const temporary = await mkdtemp(path.join(base, "stage-"));
  try {
    await parallel([...directories(expected)], async relative => { signal?.throwIfAborted(); const target = path.join(temporary, ...relative.split("/")); if (!inside(temporary, target)) fail(); await mkdir(target, { recursive: true }); });
    await parallel([...expected], async ([relative, file]) => {
      signal?.throwIfAborted(); const target = path.join(temporary, ...relative.split("/"));
      if (!inside(temporary, target)) fail();
      await writeFile(target, file.data, { flag: "wx", mode: 0o600 });
    });
    await verify(temporary, expected); signal?.throwIfAborted();
    try { await rename(temporary, destination); } catch (error) { if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(error.code)) throw error; await verify(destination, expected); }
    return destination;
  } finally {
    // Only the exact directory created above, never an HMI folder or pre-existing cache.
    if (inside(base, temporary)) { try { await normalDirectory(temporary); await rm(temporary, { recursive: true }); } catch {} }
  }
}
export async function resolveOpcUaSdk(root) {
  const modules = await realpath(path.join(root, "node_modules")), require = createRequire(path.join(root, "package.json")), result = {};
  for (const [name, version] of Object.entries(versions)) {
    const manifest = path.join(modules, name, "package.json");
    if (!inside(modules, await realpath(manifest))) fail();
    const pkg = JSON.parse(await readFile(manifest, "utf8")), entry = await realpath(require.resolve(name));
    if (pkg.name !== name || pkg.version !== version || !inside(modules, entry)) fail();
    result[name] = pathToFileURL(entry).href;
  }
  return result;
}
