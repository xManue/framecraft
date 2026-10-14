import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, createServer } from "vite";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const option = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const sourceRoot = resolve(option("--source-root") ?? repository);
const nativeRoot = resolve(option("--native-root") ?? resolve(sourceRoot, "src-tauri"));
await mkdir(resolve(repository, ".hmi-preview"), { recursive: true });
const artifacts = await mkdtemp(resolve(repository, ".hmi-preview/generated-smoke-"));
const project = resolve(artifacts, "generated-panel");
const result = { ai: "synthetic proposal; no account request", artifacts, checks: [] };
console.log(`Smoke artifacts: ${artifacts}`);
async function run(command, args, cwd, environment = {}) {
  await new Promise((yes, no) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: "inherit", env: { ...process.env, ...environment } });
    const timer = setTimeout(() => { child.kill(); no(Error(`Timed out: ${command}`)); }, 300000);
    child.once("error", error => { clearTimeout(timer); no(error); });
    child.once("exit", code => { clearTimeout(timer); code === 0 ? yes() : no(Error(`Exit ${code}: ${command}`)); });
  });
}
const entry = resolve(sourceRoot, "framecraft-generated-smoke-entry.js").replaceAll("\\", "/");
const virtualEntry = "\0framecraft:generated-smoke";
const previousNodeEnvironment = process.env.NODE_ENV;
const bundled = await build({ root: sourceRoot, configLoader: "runner", logLevel: "error", plugins: [{ name: "generated-smoke-entry", enforce: "pre", resolveId(id) { if (id.replaceAll("\\", "/").endsWith("/framecraft-generated-smoke-entry.js")) return virtualEntry; }, load(id) {
  if (id !== virtualEntry) return;
  return [
    ["newAiInterview, newGuidedPage, interviewConfig, interviewPrompt", "src/ai/aiInterview.ts"],
    ["resolveInterviewDelegation, toggleInterviewDelegation", "src/ai/aiDelegation.ts"],
    ["parseAiProposal", "src/ai/aiProposal.ts"], ["standardProjectFiles", "src/core/standardProject.ts"],
    ["parseSource", "src/source-parser/parseSource.ts"], ["updateStaticText", "src/source-parser/transformSource.ts"],
  ].map(([names, file]) => `export { ${names} } from ${JSON.stringify(resolve(sourceRoot, file).replaceAll("\\", "/"))};`).join("\n");
} }], build: { write: false, minify: false, lib: { entry, formats: ["es"] }, rollupOptions: { output: { inlineDynamicImports: true } } } });
const bundle = (Array.isArray(bundled) ? bundled[0] : bundled).output.find(item => item.type === "chunk" && item.isEntry);
const helpers = await import("data:text/javascript;base64," + Buffer.from(bundle.code).toString("base64"));
if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnvironment;
const image = resolve(artifacts, "synthetic-machine.svg");
await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><rect width="800" height="400" fill="#e9edf2"/><rect x="180" y="100" width="440" height="170" fill="#7d8792"/><text x="400" y="330" text-anchor="middle" font-family="Arial" font-size="24">Schema di prova — nessun impianto reale</text></svg>');
let interview = helpers.newAiInterview();
interview.machineName = "Nome precedente non da inviare"; interview.spec.purpose = "Pannello sintetico per verificare generazione, navigazione e modifica";
interview.spec.pages = [{ ...helpers.newGuidedPage(0), title: "Vista di prova", kind: "overview", section: "main", imageNeed: "required", image, items: [{ label: "Indicatore di prova", tag: "" }] }];
interview = helpers.toggleInterviewDelegation(interview, "machineName"); interview = helpers.toggleInterviewDelegation(interview, "pages");
const decisions = [{ key: "machineName", value: "HMI di prova" }, { key: "pages", value: JSON.stringify([{ title: "Vista di prova", kind: "overview", section: "main" }, { title: "Valori di prova", kind: "values", section: "settings" }, { title: "Allarmi di prova", kind: "alarms", section: "alarms" }]) }];
assert(!helpers.interviewPrompt(interview).includes("Nome precedente non da inviare"));
const config = helpers.interviewConfig(helpers.resolveInterviewDelegation(interview, decisions)), { guided: _guided, ...base } = config;
const proposal = helpers.parseAiProposal({ version: 1, mode: "create", summary: "Proposta sintetica", project: base, decisions, questions: [], warnings: [], provenance: ["approved-request", "framecraft-standard"], operations: [] }, "create");
const approved = helpers.interviewConfig(helpers.resolveInterviewDelegation(interview, proposal.decisions));
assert.deepEqual(approved, config);
const files = helpers.standardProjectFiles(approved);
assert.equal(files.filter(file => file.path.startsWith("src/pages/")).length, 3);
const fixture = resolve(artifacts, "generated-files.json"); await writeFile(fixture, JSON.stringify(files));
await run(process.env.FRAMECRAFT_SMOKE_CARGO ?? "cargo", ["test", ...(process.argv.includes("--offline") ? ["--offline"] : []), "--lib", "tests::materialize_generated_panel_smoke_fixture", "--", "--ignored", "--exact", "--nocapture"], nativeRoot, { FRAMECRAFT_GENERATED_FIXTURE: fixture });
assert.equal(JSON.parse(await readFile(resolve(project, "framecraft.runtime.json"), "utf8")).gateway.enabled, false);
assert.deepEqual(JSON.parse(await readFile(resolve(project, "framecraft.connections.json"), "utf8")).connections, []);
assert.deepEqual(await readFile(resolve(project, "public/framecraft-assets/page-1.svg")), await readFile(image));
result.checks.push("guided proposal validated; real native create_vite_project; copied asset; no PLC connection");
const npmCli = process.env.FRAMECRAFT_SMOKE_NPM_CLI ?? resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
await access(npmCli).catch(() => { throw Error("Set FRAMECRAFT_SMOKE_NPM_CLI to npm/bin/npm-cli.js for the selected Node runtime"); });
await run(process.execPath, [npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org", ...(process.argv.includes("--offline") ? ["--offline"] : [])], project, { NODE_ENV: "development" });
const packageManifest = JSON.parse(await readFile(resolve(project, "package.json"), "utf8"));
for (const name of [...Object.keys(packageManifest.dependencies), ...Object.keys(packageManifest.devDependencies)]) await access(resolve(project, "node_modules", name, "package.json"));
await run(process.execPath, [npmCli, "run", "build"], project);
result.checks.push("generated package dependencies installed; generated project TypeScript and production build");
if (process.argv.includes("--browser")) {
  const { chromium } = await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE).href : "playwright");
  const vite = await createServer({ root: project, configLoader: "runner", logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await vite.listen(); const url = vite.resolvedUrls.local[0];
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.FRAMECRAFT_SMOKE_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : "chromium") });
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = [], requests = [], consoleErrors = [];
    page.on("pageerror", error => errors.push(error.message)); page.on("request", request => requests.push(request.url()));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.goto(url); await page.locator('[data-panel-start-mode="mobile"]').waitFor();
    const dimensions = await page.evaluate(() => ({ width: innerWidth, viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content") }));
    console.log(JSON.stringify({ mobileDimensions: dimensions }));
    assert.equal(dimensions.width, 375, "Mobile must use the device width, not a desktop viewport");
    assert(dimensions.viewport?.includes("width=device-width"));
    await page.locator('[data-panel-start-mode="mobile"]').click();
    await page.locator('[data-panel-layout="mobile"]').waitFor();
    await page.locator('[data-section="settings"]').click(); await page.getByText("Valori di prova", { exact: true }).click();
    await page.waitForURL(/page-2001/); assert.equal(await page.locator('[data-panel-layout="mobile"]').count(), 1);
    await page.locator('[data-section="alarms"]').click(); await page.getByText("Allarmi di prova", { exact: true }).click();
    await page.waitForURL(/page-3001/); assert.equal(await page.locator('[data-panel-layout="mobile"]').count(), 1);
    await page.locator('[data-panel-return]').click(); await page.locator('[data-panel-start-mode="desktop"]').click();
    await page.locator('[data-panel-layout="desktop"]').waitFor();
    await page.locator('[data-section="main"]').click(); await page.getByText("Vista di prova", { exact: true }).click(); await page.waitForURL(/page-1001/);
    await page.getByText("Indicatore di prova", { exact: true }).waitFor();
    const target = resolve(project, "src/pages/GuidedPage1.tsx"), source = await readFile(target, "utf8"), document = helpers.parseSource(target, source);
    const node = Object.values(document.nodes).find(node => node.text === "Indicatore di prova"); assert(node, "Generated element must remain editable");
    const changed = helpers.updateStaticText(source, node.source.start, node.source.end, "Indicatore modificato");
    helpers.parseSource(target, changed); await writeFile(target, changed);
    await page.getByText("Indicatore modificato", { exact: true }).waitFor();
    assert.equal(await page.locator('[data-panel-layout="desktop"]').count(), 1);
    await page.screenshot({ path: resolve(artifacts, "generated-desktop.png"), fullPage: true });
    await page.locator('[data-panel-return]').click(); await page.locator('[data-panel-start-mode="mobile"]').click();
    await page.locator('[data-panel-layout="mobile"]').waitFor(); await page.screenshot({ path: resolve(artifacts, "generated-mobile.png"), fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert(!requests.some(url => url.includes("/_framecraft/plc/")), "No PLC traffic allowed in this smoke");
    await context.close();
    result.checks.push("real browser and router; mobile viewport; route persistence; return to device selection; actual generated source edit and HMR; no page errors or PLC traffic");
  } finally { await browser?.close(); await vite.close(); }
} else result.checks.push("browser not requested; run with --browser and Playwright available");
await writeFile(resolve(artifacts, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
