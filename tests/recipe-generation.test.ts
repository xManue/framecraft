import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { standardProjectFiles } from "../src/core/standardProject";
import { interviewConfig, newAiInterview, newGuidedPage } from "../src/ai/aiInterview";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import { hashOperatorPassword, writeOperatorStore } from "../runtime/operator-store.mjs";
import { openRuntimeAudit } from "../runtime/audit-store.mjs";
import { execFileSync } from "node:child_process";
import type { RecipeCatalog } from "../runtime/recipe-catalog.mjs";
import { componentRegistry } from "../src/components/registry";
import { parseSource } from "../src/source-parser/parseSource";
const token = "recipe_generated_test_token_01234567890123456789", origin = "http://127.0.0.1:4173", marker = "SYNTHETIC_PRIVATE_RECIPE_VALUE";
const catalog: RecipeCatalog = { version: 1, schemas: [{ id: "s1", name: "Schema test", fields: [{ id: "label", name: "Etichetta", type: "string" }], records: [{ id: "r1", name: "Ricetta test", values: { label: marker } }] }] };
async function generated(mode: "valid" | "invalid" | "corrupt" | "invalid-mapping", localAccount = false) {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "recipe-generated-"));
  if (path.dirname(await realpath(root)) !== await realpath(base)) throw new Error("Fixture fuori directory");
  const interview = newAiInterview(); interview.machineName = "Ricette sintetiche"; interview.spec.purpose = "Catalogo iniziale approvato";
  interview.spec.pages = [{ ...newGuidedPage(0), title: "Ricette", kind: "recipes", section: "formats", imageNeed: "none" }]; interview.spec.recipes = catalog;
  const files = standardProjectFiles(interviewConfig(interview));
  for (const file of files.filter(file => file.path.startsWith("runtime/") || ["framecraft.auth.json", "framecraft.connections.json", "framecraft.plc.json", "framecraft.alarms.json", "framecraft.recipes.json", "framecraft.recipe-plc.json"].includes(file.path))) {
    const target = path.resolve(root, file.path); if (path.relative(root, target).startsWith("..")) throw new Error("File fixture esterno");
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content);
  }
  await symlink(path.resolve("node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(root, "framecraft.connections.json"), JSON.stringify({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "FRAMECRAFT_RECIPE_TEST_TOKEN", allowedOrigins: [origin], allowWrites: false }, connections: [] }));
  if (localAccount) {
    const config = JSON.parse(files.find(file => file.path === "framecraft.auth.json")!.content); await writeFile(path.join(root, "framecraft.auth.json"), JSON.stringify({ ...config, enabled: true, allowHttpLoopback: true }));
    const directory = path.join(root, ".framecraft-runtime/security"); await mkdir(directory, { recursive: true });
    await writeOperatorStore(path.join(directory, "operators.json"), { version: 1, id: crypto.randomUUID(), accounts: [{ id: crypto.randomUUID(), username: "synthetic", name: "Operatore sintetico", role: "Operatore", disabled: false, permissions: ["parametri"], capabilities: ["recipes.read", "recipes.update", "recipes.capture"], password: await hashOperatorPassword("SYNTHETIC-launcher-password-012345") }] }, undefined);
  }
  if (mode === "invalid") await writeFile(path.join(root, "framecraft.recipes.json"), JSON.stringify({ ...catalog, version: 99 }));
  if (mode === "invalid-mapping") await writeFile(path.join(root, "framecraft.recipe-plc.json"), "SYNTHETIC_PRIVATE_INVALID_MAPPING");
  if (mode === "corrupt") { await mkdir(path.join(root, ".framecraft-runtime")); await openRecipeStore({ directory: path.join(root, ".framecraft-runtime/recipes"), catalog }); await writeFile(path.join(root, ".framecraft-runtime/recipes/recipes.json"), "PRIVATE_BROKEN_STORE"); }
  let output = "", errors = ""; const child: ChildProcess = spawn(process.execPath, [path.join(root, "runtime/start-gateway.mjs"), "--json"], { cwd: root, windowsHide: true, env: { ...process.env, FRAMECRAFT_RECIPE_TEST_TOKEN: token }, stdio: ["pipe", "pipe", "pipe"] });
  child.stdout!.on("data", chunk => { output += String(chunk); }); child.stderr!.on("data", chunk => { errors += String(chunk); });
  const exited = new Promise<void>((resolve, reject) => { child.once("exit", () => resolve()); child.once("error", reject); });
  const close = async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); await exited; };
  try { await vi.waitFor(() => expect(output, errors).toContain('"type":"gateway"'), { timeout: 25_000 }); }
  catch (error) { await close(); throw error; }
  const address = output.split("\n").filter(Boolean).map(line => JSON.parse(line)).find(item => item.type === "gateway")?.address as string;
  const request = (route: string, init: RequestInit = {}) => fetch(address + "/_framecraft/plc/v1/" + route, { ...init, headers: { Authorization: "Bearer " + token, Origin: origin, ...init.headers } });
  return { root, request, close, output: () => output, errors: () => errors };
}
describe("ricette nel servizio realmente esportato", () => {
  it("un mapping PLC corrotto blocca solo l’acquisizione senza cambiare ricette o loggare il file", async () => {
    const test = await generated("invalid-mapping", true); try {
      const login = await test.request("session/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "synthetic", password: "SYNTHETIC-launcher-password-012345" }) }); expect(login.status).toBe(200);
      const headers = { Cookie: login.headers.get("set-cookie")!.split(";")[0] }, snapshot = await (await test.request("recipes", { headers })).json(); expect(snapshot.sequence).toBe(0);
      const response = await test.request("recipe-plc?" + new URLSearchParams({ schemaId: "s1", expectedRevision: snapshot.revision }), { headers }); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: "RECIPE_PLC_CONFIG", effect: "plc-read-only", plcConfirmed: false });
      expect((await test.request("snapshot")).status).toBe(200); expect(test.errors()).not.toContain("SYNTHETIC_PRIVATE_INVALID_MAPPING"); expect(await readFile(path.join(test.root, "framecraft.recipe-plc.json"), "utf8")).toBe("SYNTHETIC_PRIVATE_INVALID_MAPPING");
    } finally { await test.close(); }
  }, 60000);
  it("genera il controllo della pagina, il client e una chiave di recupero distinta per progetto, senza avviare il servizio", () => {
    const interview = newAiInterview(); interview.machineName = "Form ricette"; interview.spec.purpose = "Archivio"; interview.spec.pages = [{ ...newGuidedPage(0), title: "Ricette", kind: "recipes", section: "formats", imageNeed: "none" }]; interview.spec.recipes = catalog;
    const files = standardProjectFiles(interviewConfig(interview)), read = (path: string) => files.find(file => file.path === path)!.content;
    expect(read("src/pages/GuidedPage1.tsx")).toContain('data-hmi-type="HmiRecipeControl"'); expect(read("src/pages/GuidedPage1.tsx")).toContain('data-hmi-template-version={2}');
    expect(read("src/framecraftHmiRecipeClient.ts")).toContain('"../runtime/recipe-catalog.mjs"'); expect(read("src/framecraftHmiRecipeControl.ts")).toContain('"./framecraftHmiRecipeClient"');
    const runtime = read("src/framecraftHmiRuntime.ts"); expect(runtime.indexOf("__framecraftEditorPreview")).toBeLessThan(runtime.indexOf("recipeClient = createHmiRecipeClient")); expect(runtime).toContain("recipeClient?.dispose()"); expect(runtime).toContain('[data-hmi-recipe-root], [data-hmi-alarm-root]'); expect(runtime).toContain("RECIPE_CLIENT_CONFIG: controlla percorso");
    expect(read("src/App.tsx")).toContain("if (!allowHmiRecipeNavigation()) return;"); expect(JSON.parse(read("framecraft.runtime.json")).gateway.enabled).toBe(false);
    const namespace = JSON.parse(read("framecraft.recipes-ui.json")).namespace; expect(namespace).toMatch(/^[a-f0-9-]{36}$/); expect(JSON.parse(standardProjectFiles(interviewConfig(interview)).find(file => file.path === "framecraft.recipes-ui.json")!.content).namespace).not.toBe(namespace);
    const jsx = componentRegistry.get("hmi-recipe-control")!.createJsx(); const document = parseSource("Recipe.tsx", `export function Recipe(){return (${jsx});}`); expect(Object.values(document.nodes).some(node => node.props["data-hmi-type"] === "HmiRecipeControl")).toBe(true); expect(jsx).not.toContain("data-plc-variable");
    interview.spec.pages[0].imageNeed = "optional"; interview.spec.pages[0].image = "C:/synthetic/part.svg";
    const illustrated = standardProjectFiles(interviewConfig(interview)).find(file => file.path === "src/pages/GuidedPage1.tsx")!.content;
    const nodes = Object.values(parseSource("GuidedPage1.tsx", illustrated).nodes);
    expect(nodes.find(node => node.props["data-hmi-type"] === "HmiRecipeControl")?.styles).toMatchObject({ left: 850, width: 320 }); expect(nodes.some(node => node.type === "img")).toBe(true);
  });
  it("distribuisce i moduli e un catalogo vuoto, mai ricette o connessioni inventate", () => {
    const files = standardProjectFiles({ machineName: "Nuovo", layout: "desktop", sections: ["main"] }), byPath = new Map(files.map(file => [file.path, file.content]));
    for (const name of ["recipe-catalog.mjs", "recipe-catalog.d.mts", "recipe-store.mjs", "recipe-store.d.mts", "recipe-plc.mjs", "recipe-plc.d.mts", "recipe-apply.mjs", "recipe-apply-store.mjs", "recipe-apply-engine.mjs", "recipe-plc-reference.mjs", "print-recipe-interface.mjs"]) expect(byPath.has("runtime/" + name)).toBe(true);
    expect(JSON.parse(byPath.get("framecraft.recipe-apply.json")!)).toEqual({ version: 1, schemas: [] }); expect(JSON.parse(byPath.get("runtime/package.json")!).scripts["recipe-interface"]).toBe("node print-recipe-interface.mjs");
    expect(byPath.get("runtime/RECIPE-APPLY-PROTOCOL.md")).toContain("Framecraft Recipe Apply v1");
    expect(byPath.get("src/framecraftHmiRecipeApplyClient.ts")).toContain('"../runtime/recipe-apply.mjs"'); expect(byPath.get("src/framecraftHmiRecipeApply.ts")).toContain('"./framecraftHmiRecipeApplyClient"');
    expect(byPath.get("src/framecraftHmiRecipeControl.ts")).toContain('"./framecraftHmiRecipeApply"'); expect(byPath.get("src/framecraftHmiRecipeClient.ts")).toContain('"./framecraftHmiRecipeApplyClient"');
    expect(JSON.parse(byPath.get("framecraft.recipe-plc.json")!)).toEqual({ version: 1, schemas: [] });
    expect(byPath.get("src/framecraftHmiRecipeControl.ts")).toContain('"./framecraftHmiRecipePlc"'); expect(byPath.get("src/framecraftHmiRecipePlc.ts")).toContain('"../runtime/recipe-plc.mjs"'); expect(byPath.get("runtime/start-gateway.mjs")).toContain("framecraft.recipe-plc.json");
    expect(JSON.parse(byPath.get("framecraft.recipes.json")!)).toEqual({ version: 1, schemas: [] }); expect(files.some(file => file.path.startsWith(".framecraft-runtime/"))).toBe(false);
  });
  it("avvia il servizio distribuito, conserva i dati reali importati e nega accesso senza identità server", async () => {
    const test = await generated("valid"); try {
      const response = await test.request("recipes"); expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ code: "RECIPE_AUTH" });
      const stored = JSON.parse(await readFile(path.join(test.root, ".framecraft-runtime/recipes/recipes.json"), "utf8")); expect(stored.schemas[0].records[0].values.label).toBe(marker); expect(stored.sequence).toBe(0);
      expect((await test.request("snapshot")).status).toBe(200); expect(test.output()).not.toContain(marker); expect(test.errors()).not.toContain(marker); expect(test.output() + test.errors()).not.toContain(token);
    } finally { await test.close(); }
  }, 60000);
  it("il launcher distribuito autentica account locali e autorizza le ricette senza callback esterni", async () => {
    const test = await generated("valid", true); try {
      expect((await test.request("recipes")).status).toBe(401);
      const login = await test.request("session/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "synthetic", password: "SYNTHETIC-launcher-password-012345" }) });
      expect(login.status).toBe(200); const session = await login.json(), headers = { Cookie: login.headers.get("set-cookie")!.split(";")[0], "X-Framecraft-CSRF": session.csrfToken, "Content-Type": "application/json" };
      const current = await test.request("recipes", { headers }); expect(current.status).toBe(200); const snapshot = await current.json();
      const saved = await test.request("recipes", { method: "POST", headers, body: JSON.stringify({ id: "synthetic_launcher_recipe_01", expectedRevision: snapshot.revision, action: "update", schemaId: "s1", recordId: "r1", name: "Ricetta test", values: { label: "SYNTHETIC_CHANGED" } }) });
      expect(saved.status).toBe(200); expect(await saved.json()).toMatchObject({ effect: "recipe-storage-only", plcConfirmed: false, snapshot: { sequence: 1 } });
      expect((await test.request("session/logout", { method: "POST", headers, body: "{}" })).status).toBe(200); expect((await test.request("recipes", { headers })).status).toBe(401);
      const output = test.output() + test.errors(); for (const value of [token, "SYNTHETIC-launcher-password-012345", marker, session.csrfToken]) expect(output).not.toContain(value);
      expect(output).toContain("AUTH_LOGIN"); expect(output).toContain("AUTH_LOGOUT");
      const auth = JSON.parse(await readFile(path.join(test.root, "framecraft.auth.json"), "utf8")), audit = openRuntimeAudit({ root: test.root, namespace: auth.namespace, readOnly: true });
      try { const rows = audit.read().events; expect(rows.some(row => row.operation === "recipes.update" && row.outcome === "applied" && row.resource?.kind === "recipe-schema" && row.resource.recordId === "r1")).toBe(true); expect(rows.some(row => row.code === "AUTH_LOGIN")).toBe(true); expect(rows.some(row => row.code === "AUTH_LOGOUT")).toBe(true); for (const secret of [token, "SYNTHETIC-launcher-password-012345", marker, "SYNTHETIC_CHANGED", session.csrfToken]) expect(JSON.stringify(rows)).not.toContain(secret); } finally { audit.close(); }
      const report = JSON.parse(execFileSync(process.execPath, [path.join(test.root, "runtime/read-audit.mjs"), "--json", "--limit=3"], { cwd: test.root, encoding: "utf8", windowsHide: true })); expect(report).toMatchObject({ verified: true, unresolvedCount: 0 }); expect(report.events).toHaveLength(3);
    } finally { await test.close(); }
  }, 60000);
  it.each(["invalid", "corrupt"] as const)("un archivio %s non ferma il monitoraggio o cancella dati per ripartire", async mode => {
    const test = await generated(mode); try {
      const plc = await test.request("snapshot"); expect(plc.status).toBe(200); expect((await plc.json()).connections).toEqual([]);
      const response = await test.request("recipes"); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: mode === "invalid" ? "RECIPE_CONFIG" : "RECIPE_CORRUPT" });
      expect(test.errors()).not.toContain("PRIVATE"); expect(test.errors()).not.toContain(token);
      if (mode === "corrupt") expect(await readFile(path.join(test.root, ".framecraft-runtime/recipes/recipes.json"), "utf8")).toBe("PRIVATE_BROKEN_STORE");
    } finally { await test.close(); }
  }, 60000);
});
