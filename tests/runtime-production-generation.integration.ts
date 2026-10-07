// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { build } from "vite";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import editorConfig from "../vite.config";
import type { GeneratedProjectFile } from "../src/core/standardProject";
import { inspectHmiScript } from "../src/core/hmiScript";
import { parseHmiScriptCatalog } from "../src/core/hmiScriptModules";

function evaluateModule(source: string, requireModule?: (id: string) => unknown): Record<string, unknown> {
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {}; const module = { exports };
  new Function("exports", "module", "require", javascript)(exports, module, requireModule ?? ((id: string) => { throw new Error(`Dipendenza inattesa: ${id}`); }));
  return module.exports;
}

describe("collaudo separato della generazione Runtime di produzione", () => {
  it("mantiene eseguibili i moduli dopo il bundling del generatore", async () => {
    const result = await build({ ...editorConfig, configFile: false, logLevel: "silent", build: { ...editorConfig.build, write: false, lib: { entry: "src/core/standardProject.ts", formats: ["es"] } } });
    const output = Array.isArray(result) ? result[0] : result;
    if (!("output" in output)) throw new Error("Il bundler non ha restituito i moduli.");
    const entry = output.output.find((chunk) => chunk.type === "chunk" && chunk.isEntry);
    if (!entry || entry.type !== "chunk") throw new Error("Generatore compilato non trovato.");
    const compiled = evaluateModule(entry.code);
    const files = (compiled.standardProjectFiles as (config: unknown) => GeneratedProjectFile[])({ machineName: "Runtime", layout: "desktop", sections: ["main"] });
    expect(files.find((file) => file.path === "runtime/mqtt-driver.mjs")?.content).toContain("export function createMqttPlcConnection");
    expect(JSON.parse(files.find((file) => file.path === "framecraft.connections.json")!.content)).toEqual({ version: 1, connections: [] });
    expect(files.find((file) => file.path === "runtime/gateway.mjs")?.content).toContain("export function createMqttGateway");
    expect(JSON.parse(files.find((file) => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
    const modules = new Map<string, Record<string, unknown>>();
    expect(evaluateModule(files.find((file) => file.path === "src/framecraftGateway.ts")!.content).createHmiGatewayClient).toBeTypeOf("function");
    for (const file of files.filter((file) => /^src\/framecraft.+\.ts$/.test(file.path) && file.path !== "src/framecraftHmiRuntime.ts")) {
      expect(() => modules.set(file.path, evaluateModule(file.content, (id) => {
        const dependency = modules.get(`src/${id.replace(/^\.\//, "")}.ts`);
        if (!dependency) throw new Error(`Dipendenza generata mancante: ${file.path} -> ${id}`);
        return dependency;
      })), file.path).not.toThrow();
    }
    const contexts = modules.get("src/framecraftScriptModules.ts")!.createHmiScriptContextManager as typeof import("../src/core/hmiScriptModules").createHmiScriptContextManager;
    const execute = modules.get("src/framecraftScriptRuntime.ts")!.executeHmiScript as typeof import("../src/core/hmiScript").executeHmiScript;
    const executeAsync = modules.get("src/framecraftScriptRuntime.ts")!.executeHmiScriptAsync as typeof import("../src/core/hmiScript").executeHmiScriptAsync;
    let writes = 0;
    const transported = await executeAsync(inspectHmiScript('const set = Tags.CreateTagSet([["Speed", 55]]); await set.WriteAsync(); await set.ReadAsync(); return set("Speed").Value;').program!, { Speed: "1" }, { transport: {
      async write(request) { writes++; return { tag: request.tag, outcome: "delivered", delivery: "broker-ack", plcConfirmed: false }; },
      async read() { return { value: "10", status: { qualityKnown: false, timeStamp: 123 } }; },
    } });
    expect(transported).toMatchObject({ returned: 10, writes: {}, reads: { Speed: "10" }, commands: [{ outcome: "delivered", plcConfirmed: false }] }); expect(transported.error).toBeUndefined(); expect(writes).toBe(1);
    const catalog = parseHmiScriptCatalog({ globalModules: [
      { name: "Counter", alias: "Counter", globalDefinition: { source: "export let count = 0; let privateValue = 42;" }, functions: [{ name: "Next", parameters: [], source: "count = count + 1; return count;" }] },
      { name: "Values", alias: "Values", globalDefinition: { source: "export const source = Tags('Speed');" }, functions: [] },
      { name: "Reader", alias: "Reader", globalDefinition: { source: "const privateTag = Modules.Values.source;" }, functions: [{ name: "Read", parameters: [], source: "return privateTag.Read();" }] },
      { name: "Data", alias: "Data", globalDefinition: { source: "export const cfg = { values: [10, 20], sources: [Tags('Speed'), Tags('Backup')] };" }, functions: [
        { name: "Get", parameters: [], source: "return cfg;" },
        { name: "Update", parameters: ["data"], source: "data.values[0] = data.values[0] + 1; data.values.push(30); return data;" },
      ] },
    ] });
    const manager = contexts();
    const program = inspectHmiScript("return Modules.Counter.Next();").program!;
    expect(execute(program, {}, manager.options(catalog, "/", "events")).returned).toBe(1);
    expect(execute(program, {}, manager.options(catalog, "/", "events")).returned).toBe(2);
    expect(execute(program, {}, manager.options(catalog, "/", "dynamizations")).returned).toBe(1);
    const publicValue = inspectHmiScript("return Modules.Counter.count;").program!;
    expect(execute(publicValue, {}, manager.options(catalog, "/", "events")).returned).toBe(2);
    expect(execute(publicValue, {}, manager.options(catalog, "/", "dynamizations")).returned).toBe(1);
    const exportedTag = inspectHmiScript("return Modules.Values.source.Read();").program!;
    const inspect = modules.get("src/framecraftScriptRuntime.ts")!.inspectHmiScriptProgram as typeof import("../src/core/hmiScript").inspectHmiScriptProgram;
    const context = manager.options(catalog, "/", "dynamizations");
    expect(inspect(exportedTag, context.functions, undefined, [], context.variables).tagsRead).toEqual(["Speed"]);
    expect(execute(exportedTag, { Speed: "120" }, context).returned).toBe(120);
    const indirectTag = inspectHmiScript("return Modules.Reader.Read();").program!;
    expect(inspect(indirectTag, context.functions, undefined, [], context.variables).tagsRead).toEqual(["Speed"]);
    expect(execute(indirectTag, { Speed: "140" }, context).returned).toBe(140);
    const structured = inspectHmiScript("const cfg = Modules.Data.Update(Modules.Data.Get()); return cfg.sources[Tags('Index').Read()].Read() + cfg.values[0];").program!;
    expect(inspect(structured, context.functions, undefined, [], context.variables).tagsRead).toEqual(expect.arrayContaining(["Speed", "Backup", "Index"]));
    expect(execute(structured, { Speed: "5", Backup: "140", Index: "1" }, context)).toMatchObject({ returned: 151 });
    expect(execute(inspectHmiScript("return JSON.stringify(Modules.Data.cfg.values);").program!, {}, context).returned).toBe("[11,20,30]");
    expect(execute(inspectHmiScript("return Object.entries({ Value: 7 })[0][1];").program!, {}, context).returned).toBe(7);
    expect(execute(inspectHmiScript("return Modules.Data.cfg.values[0];").program!, {}, manager.options(catalog, "/", "events")).returned).toBe(10);
    expect(execute(inspectHmiScript("const cfg = JSON.parse(Tags('Config').Read()); return cfg.speed;").program!, { Config: '{"speed":120}' }, context).returned).toBe(120);
    const changedArray = inspectHmiScript("const refs = ['Speed']; refs.push('Backup'); return refs[1].Read();").program!;
    expect(inspect(changedArray).tagsRead).toContain("Backup");
    expect(execute(changedArray, { Backup: "140" })).toMatchObject({ returned: 140 });
    const changedSets = inspectHmiScript("const sets = [Tags.CreateTagSet(['Speed']), Tags.CreateTagSet(['Backup'])]; const selected = sets[Tags('Index').Read()]; selected.Add(['Extra']); selected.Read(); return selected.Count;").program!;
    expect(inspect(changedSets).tagsRead).toEqual(expect.arrayContaining(["Speed", "Backup", "Extra", "Index"]));
    expect(execute(changedSets, { Speed: "10", Backup: "20", Extra: "30", Index: "1" })).toMatchObject({ returned: 2 });
    const privateValue = inspectHmiScript("return Modules.Counter.privateValue;").program!;
    expect(execute(privateValue, {}, context).error).toContain("non esportata");
    manager.releaseScreen("/");
    expect(execute(publicValue, {}, context).error).toContain("non e' piu' attivo");
    expect(execute(publicValue, {}, manager.options(catalog, "/", "events")).returned).toBe(0);
    manager.dispose();
    const fx = modules.get("src/framecraftHmiFunctionTrend.ts")!;
    const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new () => { window: { document: Document; close(): void } } };
    const browser = new JSDOM();
    const host = browser.window.document.createElement("div"); host.setAttribute("data-hmi-function-trend", JSON.stringify({ caption: "Produzione", trends: [{ x: { tag: "X" }, y: { tag: "Y" } }] }));
    const render = fx.renderHmiFunctionTrendControl as (host: HTMLElement, values: Record<string, string>, options: { now: number }) => boolean;
    expect(render(host, { X: "10", Y: "20" }, { now: 1_000 })).toBe(true); expect(host.textContent).toContain("1 punti");
    const apply = host.querySelector<HTMLButtonElement>('[data-trend-source-action="apply"]')!; apply.click(); expect(host.querySelector('[data-trend-source-status]')!.textContent).toContain("sessione Runtime");
    host.querySelector<HTMLButtonElement>('[data-hmi-fx-action="zoom-in"]')!.click();
    const time = modules.get("src/framecraftHmiTrend.ts")!;
    const timeHost = browser.window.document.createElement("div"); timeHost.setAttribute("data-hmi-trend", JSON.stringify({ trends: [{ tag: "Temperature" }] }));
    const renderTime = time.renderHmiTrendControl as (host: HTMLElement, values: Record<string, string>, options: { now: number; status: Record<string, { qualityCode: number }> }) => boolean;
    expect(renderTime(timeHost, { Temperature: "25" }, { now: 1_000, status: { Temperature: { qualityCode: 64 } } })).toBe(true);
    expect(timeHost.querySelector('[data-hmi-trend-quality="uncertain"]')).not.toBeNull();
    timeHost.querySelector<HTMLButtonElement>('[data-trend-source-action="apply"]')!.click(); expect(timeHost.querySelector('[data-trend-source-status]')!.textContent).toContain("sessione Runtime");
    const flashing = modules.get("src/framecraftHmiFlashing.ts")!;
    const surface = (flashing.createHmiPropertyFlashingDomSurface as typeof import("../scripts/hmi-property-flashing.mjs").createHmiPropertyFlashingDomSurface)(browser.window.document);
    const controller = (flashing.createHmiPropertyFlashing as typeof import("../scripts/hmi-property-flashing.mjs").createHmiPropertyFlashing)(surface);
    const lamp = browser.window.document.createElement("button"); lamp.dataset.hmiName = "M2400"; lamp.style.backgroundColor = "rgb(12, 34, 56)"; lamp.style.width = "80px"; lamp.style.fontSize = "16px"; lamp.style.fontFamily = "Arial"; lamp.textContent = "Motore";
    browser.window.document.body.append(lamp);
    const flash = inspectHmiScript('return Screen.Items("M2400").PropertyFlashing("BackColor", true, HMIRuntime.Math.RGB(255,0,0), HMIRuntime.Math.RGB(0,0,0), UI.Enums.HmiFlashingRate.Fast);').program!;
    expect(execute(flash, {}, { screenItems: controller.context() })).toMatchObject({ returned: true });
    expect(lamp.style.animation).toContain("framecraft-hmi-flash-background 500ms");
    expect(lamp.style.backgroundColor).toBe("rgb(12, 34, 56)");
    const properties = inspectHmiScript('const motor = Screen.Items("M2400"); motor.Text = "Pronto"; motor.Width = motor.Width + 10; motor.BackColor = HMIRuntime.Math.RGB(0,128,0); motor.Enabled = false; return motor.Name + ":" + motor.Width + ":" + motor.Text;').program!;
    expect(execute(properties, {}, { screenItems: controller.context() })).toMatchObject({ returned: "M2400:90:Pronto", writes: {} });
    expect(lamp.textContent).toBe("Pronto"); expect(lamp.style.width).toBe("90px");
    expect(lamp.style.backgroundColor).toBe("rgb(0, 128, 0)"); expect(lamp.disabled).toBe(true);
    expect(lamp.style.animation).toContain("framecraft-hmi-flash-background");
    const font = inspectHmiScript('const font = Screen.Items("M2400").Font; font.Name = "Courier New"; font.Size = 18.5; font.Weight = 700; font.Italic = true; font.Underline = true; font.StrikeOut = 1; return JSON.stringify([font.Name, font.Size, font.Weight, font.Italic, font.Underline, font.StrikeOut]);').program!;
    const fontResult = execute(font, {}, { screenItems: controller.context() });
    expect(fontResult.error).toBeUndefined(); expect(fontResult.writes).toEqual({});
    expect(JSON.parse(String(fontResult.returned))).toEqual(["Courier New", 18.5, 700, true, true, 1]);
    expect(lamp.style.fontFamily).toBe('"Courier New"'); expect(lamp.style.fontSize).toBe("18.5px"); expect(lamp.style.fontWeight).toBe("700"); expect(lamp.style.fontStyle).toBe("italic");
    expect(lamp.style.textDecorationLine).toBe("underline line-through");
    controller.reset();
    expect(lamp.style.animation).toBe("");
    expect(lamp.textContent).toBe("Motore"); expect(lamp.style.width).toBe("80px");
    expect(lamp.style.backgroundColor).toBe("rgb(12, 34, 56)"); expect(lamp.disabled).toBe(false);
    expect(lamp.style.fontFamily).toBe("Arial"); expect(lamp.style.fontSize).toBe("16px"); expect(lamp.style.fontWeight).toBe(""); expect(lamp.style.fontStyle).toBe("");
    expect(lamp.style.textDecorationLine).toBe("");
    surface.dispose();
    browser.window.close();
  }, 60_000);
});
