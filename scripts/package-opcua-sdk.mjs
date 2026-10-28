import { createRequire } from "node:module";
import { realpath, lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

export const opcUaSdkVersions = Object.freeze({ "node-opcua-client": "2.186.17", "node-opcua-certificate-manager": "2.186.17", "node-opcua-debug": "2.186.7" });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const within = (root, file) => { const relative = path.relative(root, file); return relative && !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative); };
async function manifest(require, name) {
  let entry;
  try { entry = require.resolve(name + "/package.json"); }
  catch {
    try { entry = require.resolve(name); } catch { return null; }
    let current = path.dirname(entry);
    for (let i = 0; i < 15; i++, current = path.dirname(current)) {
      try { const value = JSON.parse(await readFile(path.join(current, "package.json"), "utf8")); if (value.name === name) return { dir: current, value }; } catch {}
      if (path.dirname(current) === current) break;
    }
    throw Error("SDK_PACKAGE");
  }
  const value = JSON.parse(await readFile(entry, "utf8")); if (value.name !== name) throw Error("SDK_PACKAGE");
  return { dir: path.dirname(entry), value };
}
export async function packageOpcUaSdk(appRoot, versions = opcUaSdkVersions) {
  const modules = await realpath(path.join(appRoot, "node_modules")), appRequire = createRequire(path.join(path.resolve(appRoot), "package.json"));
  const lockSource = await readFile(path.join(appRoot, "package-lock.json")), lock = JSON.parse(lockSource.toString("utf8"));
  if (!lock.packages || typeof lock.packages !== "object") throw Error("SDK_LOCK");
  const queue = [], packages = new Map(), files = []; let bytes = 0;
  for (const [name, version] of Object.entries(versions)) {
    const pkg = await manifest(appRequire, name);
    if (!pkg || pkg.value.version !== version || path.relative(modules, await realpath(pkg.dir)).replaceAll(path.sep, "/") !== name) throw Error("SDK_VERSION");
    queue.push(pkg);
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const pkg = queue[cursor], dir = await realpath(pkg.dir);
    if (!within(modules, dir) || (await lstat(pkg.dir)).isSymbolicLink()) throw Error("SDK_PATH");
    if (packages.has(dir)) continue;
    const lockPath = "node_modules/" + path.relative(modules, dir).split(path.sep).join("/");
    if (lock.packages[lockPath]?.version !== pkg.value.version) throw Error("SDK_LOCK");
    packages.set(dir, pkg.value.version); if (packages.size > 1000) throw Error("SDK_LIMIT");
    const require = createRequire(path.join(dir, "package.json"));
    const names = new Set([...Object.keys(pkg.value.dependencies ?? {}), ...Object.keys(pkg.value.optionalDependencies ?? {}), ...Object.keys(pkg.value.peerDependencies ?? {})]);
    for (const name of [...names].sort()) {
      const dependency = await manifest(require, name), optional = Object.hasOwn(pkg.value.optionalDependencies ?? {}, name) || pkg.value.peerDependenciesMeta?.[name]?.optional === true;
      if (!dependency) { if (optional) continue; throw Error("SDK_DEPENDENCY"); }
      queue.push(dependency);
    }
    async function walk(folder) {
      for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a,b) => a.name < b.name ? -1 : 1)) {
        if (entry.name === "node_modules") continue;
        const target = path.join(folder, entry.name), stat = await lstat(target);
        if (stat.isSymbolicLink() || !within(modules, await realpath(target))) throw Error("SDK_PATH");
        if (stat.isDirectory()) { await walk(target); continue; }
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > 16 * 1024 * 1024) throw Error("SDK_FILE");
        const data = await readFile(target), relative = "node_modules/" + path.relative(modules, target).split(path.sep).join("/");
        bytes += data.length;
        if (bytes > 128 * 1024 * 1024 || files.length >= 20000 || relative.length > 1024 || /[\u0000-\u001f\\:]/.test(relative)) throw Error("SDK_LIMIT");
        files.push({ path: relative, size: data.length, sha256: digest(data), data: data.toString("base64") });
      }
    }
    await walk(dir);
  }
  files.sort((a,b) => a.path < b.path ? -1 : 1);
  const result = gzipSync(Buffer.from(JSON.stringify({ version: 1, roots: versions, lockSha256: digest(lockSource), bytes, packages: packages.size, files })), { level: 9 });
  if (result.length > 10 * 1024 * 1024) throw Error("SDK_LIMIT");
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw Error("SDK_INPUT");
    const pack = await packageOpcUaSdk(path.resolve(process.argv[2]));
    await writeFile(path.resolve(process.argv[3]), pack);
    process.stdout.write(JSON.stringify({ bytes: pack.length, sha256: digest(pack) }) + "\n");
  } catch (error) { process.stderr.write("Framecraft OPC UA SDK: " + (/^SDK_[A-Z]+$/.test(error.message) ? error.message : "SDK_BUILD") + "\n"); process.exitCode = 1; }
}
