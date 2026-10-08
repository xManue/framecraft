import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const permissive = new Set(["MIT", "MIT-0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "Apache-2.0"]);
export function licenseChoice(expression) {
  if (typeof expression !== "string") return undefined;
  const tokens = expression.match(/[A-Za-z0-9.+-]+|[()]/g) ?? [];
  if (tokens.join("") !== expression.replace(/\s+/g, "")) return undefined;
  let index = 0;
  const atom = () => {
    const value = tokens[index++];
    if (value === "(") { const result = or(); if (tokens[index++] !== ")") throw new Error("SPDX non valido"); return result; }
    if (!value || ["AND", "OR", "WITH", ")"].includes(value)) throw new Error("SPDX non valido");
    return permissive.has(value) ? [value] : undefined;
  };
  const and = () => { let result = atom(); while (tokens[index] === "AND") { index++; const right = atom(); result = result && right ? [...new Set([...result, ...right])] : undefined; } return result; };
  const or = () => { let result = and(); while (tokens[index] === "OR") { index++; const right = and(); result = result ?? right; } return result; };
  try { const choice = or(); return index === tokens.length ? choice : undefined; } catch { return undefined; }
}

export function npmLicenseInventory(lock, scopeRoots) {
  if (!lock?.packages || typeof lock.packages !== "object") throw new Error("Il controllo richiede package-lock con packages.");
  const inventory = new Map(), missing = [];
  const resolve = (name, from) => {
    let current = from;
    while (true) {
      const candidate = (current ? current + "/" : "") + "node_modules/" + name;
      if (lock.packages[candidate]) return candidate;
      if (!current) return undefined;
      const parent = current.lastIndexOf("/node_modules/"); current = parent >= 0 ? current.slice(0, parent) : "";
    }
  };
  const visit = (name, from, scope, optional = false) => {
    const key = resolve(name, from); if (!key) { if (!optional) missing.push({ name, from, scope }); return; }
    const entry = lock.packages[key], old = inventory.get(key);
    if (old?.scopes.includes(scope)) return;
    const choice = licenseChoice(entry.license);
    const item = old ?? { path: key, name: entry.name ?? key.slice(key.lastIndexOf("node_modules/") + 13), version: entry.version,
      license: entry.license ?? "UNKNOWN", selectedLicenses: choice ?? [], decision: choice ? "permissive-with-notices" : "review-required", scopes: [] };
    item.scopes.push(scope); inventory.set(key, item);
    for (const dependency of Object.keys(entry.dependencies ?? {})) visit(dependency, key, scope);
    for (const dependency of Object.keys(entry.optionalDependencies ?? {})) visit(dependency, key, scope, true);
    for (const dependency of Object.keys(entry.peerDependencies ?? {})) visit(dependency, key, scope, Boolean(entry.peerDependenciesMeta?.[dependency]?.optional));
  };
  for (const [scope, dependencies] of Object.entries(scopeRoots)) for (const name of Object.keys(dependencies)) visit(name, "", scope);
  return { packages: [...inventory.values()].sort((a, b) => a.path.localeCompare(b.path)), missing };
}

export async function licenseAudit(root) {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")), lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  const npm = npmLicenseInventory(lock, { editor: manifest.dependencies ?? {}, tooling: manifest.devDependencies ?? {}, "mqtt-runtime": { mqtt: "5.16.0" }, "opcua-runtime": { "node-opcua-client": "2.186.17", "node-opcua-certificate-manager": "2.186.17", "node-opcua-debug": "2.186.7" } });
  let cargo;
  try {
    const execution = { encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: 16_777_216, stdio: ["ignore", "pipe", "pipe"] };
    const target = execFileSync("rustc", ["-vV"], execution).match(/^host: ([A-Za-z0-9_-]+)$/m)?.[1];
    if (!target) throw new Error("Target Rust non disponibile.");
    const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--format-version", "1", "--offline", "--locked", "--filter-platform", target, "--manifest-path", path.join(root, "src-tauri/Cargo.toml")], execution));
    if (!Array.isArray(metadata.resolve?.nodes)) throw new Error("Grafo Cargo non disponibile.");
    const resolved = new Set(metadata.resolve.nodes.map((entry) => entry.id));
    cargo = { status: "inspected", target, packages: metadata.packages.filter((entry) => entry.source !== null && resolved.has(entry.id)).map((entry) => {
      const choice = licenseChoice(entry.license); return { name: entry.name, version: entry.version, license: entry.license ?? "UNKNOWN", selectedLicenses: choice ?? [], decision: choice ? "permissive-with-notices" : "review-required" };
    }).sort((a, b) => a.name.localeCompare(b.name)) };
  } catch (error) { cargo = { status: "unverified", reason: "Inventario Cargo offline del target host non completato; non vengono scaricate dipendenze.", errorCode: String(error.code ?? error.status ?? "unknown") }; }
  return { version: 1, generatedAt: new Date().toISOString(), npm, cargo,
    productLicense: manifest.license ?? "Da definire dal titolare del prodotto, non assegnata automaticamente.",
    releaseApproved: false,
    limitations: ["I metadati SPDX non sostituiscono la lettura delle licenze e la raccolta dei notice della distribuzione reale.", "Font, immagini, screenshot, export vendor e asset macchina richiedono diritti verificati separatamente.", "Questo inventario non è una scansione delle vulnerabilità né un'approvazione legale al rilascio."] };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const root = path.resolve(fileURLToPath(new URL("../", import.meta.url))), report = await licenseAudit(root);
  const target = path.join(root, ".hmi-preview", "license-audit.json"); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, JSON.stringify(report, null, 2) + "\n");
  const review = report.npm.packages.filter((entry) => entry.decision === "review-required"), cargoReview = report.cargo.packages?.filter((entry) => entry.decision === "review-required") ?? [];
  process.stdout.write(JSON.stringify({ report: target, npmPackages: report.npm.packages.length, mqttRuntimePackages: report.npm.packages.filter((entry) => entry.scopes.includes("mqtt-runtime")).length,
    npmReview: review.map(({ name, version, license, scopes }) => ({ name, version, license, scopes })), missing: report.npm.missing, cargoStatus: report.cargo.status, cargoPackages: report.cargo.packages?.length,
    cargoTarget: report.cargo.target, cargoReview, releaseApproved: false }, null, 2) + "\n");
  if (review.length || report.npm.missing.length || cargoReview.length || report.cargo.status !== "inspected") process.exitCode = 1;
}
