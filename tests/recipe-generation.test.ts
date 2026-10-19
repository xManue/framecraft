import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { standardProjectFiles } from "../src/core/standardProject";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import type { RecipeCatalog } from "../runtime/recipe-catalog.mjs";
const token = "recipe_generated_test_token_01234567890123456789", origin = "http://127.0.0.1:4173", marker = "SYNTHETIC_PRIVATE_RECIPE_VALUE";
const catalog: RecipeCatalog = { version: 1, schemas: [{ id: "s1", name: "Schema test", fields: [{ id: "label", name: "Etichetta", type: "string" }], records: [{ id: "r1", name: "Ricetta test", values: { label: marker } }] }] };
async function generated(mode: "valid" | "invalid" | "corrupt") {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "recipe-generated-"));
  if (path.dirname(await realpath(root)) !== await realpath(base)) throw new Error("Fixture fuori directory");
  const files = standardProjectFiles({ machineName: "Ricette sintetiche", layout: "desktop", sections: ["main"] });
  for (const file of files.filter(file => file.path.startsWith("runtime/") || ["framecraft.connections.json", "framecraft.plc.json", "framecraft.alarms.json", "framecraft.recipes.json"].includes(file.path))) {
    const target = path.resolve(root, file.path); if (path.relative(root, target).startsWith("..")) throw new Error("File fixture esterno");
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content);
  }
  await symlink(path.resolve("node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(root, "framecraft.connections.json"), JSON.stringify({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "FRAMECRAFT_RECIPE_TEST_TOKEN", allowedOrigins: [origin], allowWrites: false }, connections: [] }));
  await writeFile(path.join(root, "framecraft.recipes.json"), JSON.stringify(mode === "invalid" ? { ...catalog, version: 99 } : catalog));
  if (mode === "corrupt") { await mkdir(path.join(root, ".framecraft-runtime")); await openRecipeStore({ directory: path.join(root, ".framecraft-runtime/recipes"), catalog }); await writeFile(path.join(root, ".framecraft-runtime/recipes/recipes.json"), "PRIVATE_BROKEN_STORE"); }
  let output = "", errors = ""; const child: ChildProcess = spawn(process.execPath, [path.join(root, "runtime/start-gateway.mjs"), "--json"], { cwd: root, windowsHide: true, env: { ...process.env, FRAMECRAFT_RECIPE_TEST_TOKEN: token }, stdio: ["pipe", "pipe", "pipe"] });
  child.stdout!.on("data", chunk => { output += String(chunk); }); child.stderr!.on("data", chunk => { errors += String(chunk); });
  const exited = new Promise<void>((resolve, reject) => { child.once("exit", () => resolve()); child.once("error", reject); });
  const close = async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); await exited; };
  try { await vi.waitFor(() => expect(output).toContain('"type":"gateway"'), { timeout: 10_000 }); }
  catch (error) { await close(); throw error; }
  const address = output.split("\n").filter(Boolean).map(line => JSON.parse(line)).find(item => item.type === "gateway")?.address as string;
  const request = (route: string) => fetch(address + "/_framecraft/plc/v1/" + route, { headers: { Authorization: "Bearer " + token, Origin: origin } });
  return { root, request, close, output: () => output, errors: () => errors };
}
describe("ricette nel servizio realmente esportato", () => {
  it("distribuisce i moduli e un catalogo vuoto, mai ricette o connessioni inventate", () => {
    const files = standardProjectFiles({ machineName: "Nuovo", layout: "desktop", sections: ["main"] }), byPath = new Map(files.map(file => [file.path, file.content]));
    for (const name of ["recipe-catalog.mjs", "recipe-catalog.d.mts", "recipe-store.mjs", "recipe-store.d.mts"]) expect(byPath.has("runtime/" + name)).toBe(true);
    expect(JSON.parse(byPath.get("framecraft.recipes.json")!)).toEqual({ version: 1, schemas: [] }); expect(files.some(file => file.path.startsWith(".framecraft-runtime/"))).toBe(false);
  });
  it("avvia il servizio distribuito, conserva i dati reali importati e nega accesso senza identità server", async () => {
    const test = await generated("valid"); try {
      const response = await test.request("recipes"); expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ code: "RECIPE_AUTH" });
      const stored = JSON.parse(await readFile(path.join(test.root, ".framecraft-runtime/recipes/recipes.json"), "utf8")); expect(stored.schemas[0].records[0].values.label).toBe(marker); expect(stored.sequence).toBe(0);
      expect((await test.request("snapshot")).status).toBe(200); expect(test.output()).not.toContain(marker); expect(test.errors()).not.toContain(marker); expect(test.output() + test.errors()).not.toContain(token);
    } finally { await test.close(); }
  }, 15_000);
  it.each(["invalid", "corrupt"] as const)("un archivio %s non ferma il monitoraggio o cancella dati per ripartire", async mode => {
    const test = await generated(mode); try {
      const plc = await test.request("snapshot"); expect(plc.status).toBe(200); expect((await plc.json()).connections).toEqual([]);
      const response = await test.request("recipes"); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: mode === "invalid" ? "RECIPE_CONFIG" : "RECIPE_CORRUPT" });
      expect(test.errors()).not.toContain("PRIVATE"); expect(test.errors()).not.toContain(token);
      if (mode === "corrupt") expect(await readFile(path.join(test.root, ".framecraft-runtime/recipes/recipes.json"), "utf8")).toBe("PRIVATE_BROKEN_STORE");
    } finally { await test.close(); }
  }, 15_000);
});
