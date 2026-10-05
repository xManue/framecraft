import { describe, expect, it, vi } from "vitest";
import { executeHmiScript, inspectHmiScript } from "../src/core/hmiScript";
import { createHmiScriptContextManager, hmiScriptCatalogIssues, hmiScriptFunctions, parseHmiScriptCatalog, serializeHmiScriptCatalog } from "../src/core/hmiScriptModules";
import { createHmiTimerManager } from "../src/core/hmiTimers";
import { executeHmiEvent, executeHmiEventAsync } from "../src/core/hmiEvents";
import { simulationPatch } from "../src/core/plcSimulation";

function counter() {
  return {
    name: "Counter", alias: "Counter", globalDefinition: { source: "export let count = 0; export const step = 1; let secret = 42;" },
    functions: [{ name: "Next", parameters: [], source: "count = count + step; return count;" }],
  };
}

function run(source: string, context: ReturnType<ReturnType<typeof createHmiScriptContextManager>["options"]>, values: Record<string, string> = {}) {
  const inspection = inspectHmiScript(source, context.functions, context.globalScope?.initializer, [], context.variables);
  if (!inspection.program) throw new Error(inspection.error);
  return executeHmiScript(inspection.program, values, context);
}

describe("variabili pubbliche dei moduli HMI", () => {
  it("usa gli export negli eventi sincroni e asincroni senza aggirare la privacy", async () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Values", alias: "Values", functions: [], globalDefinition: { source: "export const limit = 20; let secret = 42;" } }] });
    const context = createHmiScriptContextManager().options(catalog, "/");
    const result = executeHmiEvent({ event: "Tapped", script: "Tags('Output').Write(Modules.Values.limit);" }, {}, context);
    expect(result.error).toBeUndefined();
    expect(result.writes).toEqual({ Output: "20" });
    const asynchronous = await executeHmiEventAsync({ event: "Tapped", script: "const output = Tags.CreateTagSet([['Output', Modules.Values.limit]]); await output.WriteAsync();" }, {}, context);
    expect(asynchronous.error).toBeUndefined();
    expect(asynchronous.writes).toEqual({ Output: "20" });
    const rejected = executeHmiEvent({ event: "Tapped", script: "Tags('Output').Write(1); Tags('Output').Write(Modules.Values.secret);" }, {}, context);
    expect(rejected.error).toContain("non esportata");
    expect(rejected.writes).toEqual({});
  });

  it("risolve le variabili pubbliche nell'anteprima delle dinamizzazioni", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Values", alias: "Values", functions: [], globalDefinition: { source: "export const source = Tags('Speed'); let secret = 42;" } }] });
    const context = createHmiScriptContextManager().options(catalog, "/", "dynamizations");
    const patch = simulationPatch([{ property: "Text", kind: "Script", source: "return Modules.Values.source.Read();" }], { Speed: "125" }, undefined, undefined, context.functions, undefined, context.globalScope, context.variables);
    expect(patch.text).toBe("125");
    expect(patch.unresolved).toEqual([]);
    const rejected = simulationPatch([{ property: "Text", kind: "Script", source: "return Modules.Values.secret;" }], {}, undefined, undefined, context.functions, undefined, context.globalScope, context.variables);
    expect(rejected.text).toBeUndefined();
    expect(rejected.unresolved[0].reason).toContain("non esportata");
  });

  it("compila export let/const/var senza esporre le dichiarazioni private", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ ...counter(), globalDefinition: { source: "export let count = 0; export const step = 1; export var enabled = true; let secret = 42;" } }] });
    expect(hmiScriptCatalogIssues(catalog)).toEqual([]);
    expect(catalog.globalModules[0].globalDefinition?.program?.exports).toEqual([
      { name: "count", local: "count" }, { name: "step", local: "step" }, { name: "enabled", local: "enabled" },
    ]);
    const context = createHmiScriptContextManager().options(catalog, "/");
    expect(Object.keys(context.variables ?? {})).toEqual(["Modules.Counter.count", "Modules.Counter.step", "Modules.Counter.enabled"]);
  });

  it("legge binding live e aggiorna la variabile soltanto dalla funzione proprietaria", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [counter()] });
    const context = createHmiScriptContextManager().options(catalog, "/");
    expect(run("return Modules.Counter.count;", context).returned).toBe(0);
    expect(run("return Modules.Counter.Next();", context).returned).toBe(1);
    expect(run("return Modules.Counter['count'];", context).returned).toBe(1);
    expect(run("Modules.Counter.Next(); return Modules.Counter.count;", context).returned).toBe(2);
  });

  it("supporta export nominati con alias e protegge il nome originale privato", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ ...counter(), globalDefinition: { source: "let count = 3; const step = 2; export { count as current, step };" } }] });
    expect(hmiScriptCatalogIssues(catalog)).toEqual([]);
    const context = createHmiScriptContextManager().options(catalog, "/");
    expect(run("Modules.Counter.Next(); return Modules.Counter.current;", context).returned).toBe(5);
    expect(inspectHmiScript("return Modules.Counter.count;", context.functions, undefined, [], context.variables).error).toContain("non esportata");
  });

  it("non confonde i nomi delle variabili con le proprietà degli oggetti Runtime", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Values", alias: "Values", functions: [], globalDefinition: { source: "export const Value = 3, Visible = 4, Count = 5;" } }] });
    const context = createHmiScriptContextManager().options(catalog, "/");
    expect(run("return Modules.Values.Value + Modules.Values.Visible + Modules.Values.Count;", context).returned).toBe(12);
  });

  it.each(["Modules.Counter.count = 4;", "Modules.Counter['count'] = 4;", "Modules.Counter.count += 1;", "Modules.Counter.count++;"])("rifiuta le scritture al namespace importato: %s", (source) => {
    expect(inspectHmiScript(source).error).toContain("sola lettura");
  });

  it("segnala variabili private o assenti prima di eseguire lo script", () => {
    const context = createHmiScriptContextManager().options(parseHmiScriptCatalog({ globalModules: [counter()] }), "/");
    for (const name of ["Modules.Counter.secret", "Modules.Counter.missing", "Modules.Missing.count"]) {
      expect(inspectHmiScript(`return ${name};`, context.functions, undefined, [], context.variables).error).toContain("non esportata");
      const program = inspectHmiScript(`return ${name};`).program!;
      expect(executeHmiScript(program, {}, context).error).toContain("non esportata");
    }
  });

  it("mantiene isolate pagine ed eventi/dinamizzazioni, ma condivide lo Scheduler", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [counter()] });
    const manager = createHmiScriptContextManager();
    const events = manager.options(catalog, "/a", "events");
    run("Modules.Counter.Next();", events);
    expect(run("return Modules.Counter.count;", events).returned).toBe(1);
    expect(run("return Modules.Counter.count;", manager.options(catalog, "/a", "dynamizations")).returned).toBe(0);
    expect(run("return Modules.Counter.count;", manager.options(catalog, "/b", "events")).returned).toBe(0);
    run("Modules.Counter.Next();", manager.options(catalog, "/a", "scheduler"));
    expect(run("return Modules.Counter.count;", manager.options(catalog, "/b", "scheduler")).returned).toBe(1);
    manager.releaseScreen("/a");
    expect(run("return Modules.Counter.count;", events).error).toContain("non e' piu' attivo");
    expect(run("return Modules.Counter.count;", manager.options(catalog, "/a", "events")).returned).toBe(0);
    manager.dispose();
  });

  it("inizializza anche i moduli senza funzioni una sola volta per contesto", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Start", alias: "Start", functions: [], globalDefinition: { source: "export let initial = Tags('Speed').Read();" } }] });
    const manager = createHmiScriptContextManager();
    expect(manager.initialize(catalog, "/", "events", { Speed: "120" })).toEqual([]);
    const context = manager.options(catalog, "/");
    expect(run("return Modules.Start.initial;", context, { Speed: "999" }).returned).toBe(120);
    manager.releaseScreen("/");
    expect(run("return Modules.Start.initial;", manager.options(catalog, "/"), { Speed: "999" }).returned).toBe(999);
  });

  it("analizza tag e riferimenti condivisi anche nelle funzioni e nei timer", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{
      name: "Values", alias: "Values", globalDefinition: { source: "const privateTag = Tags('Speed'); export const source = privateTag; export const initial = Tags('Start').Read();" },
      functions: [{ name: "Read", parameters: [], source: "return Modules.Values.source.Read();" }],
    }] });
    const context = createHmiScriptContextManager().options(catalog, "/");
    for (const source of ["return Modules.Values.source.Read();", "return Modules.Values.Read();", "HMIRuntime.Timers.SetTimeout(() => { Tags('Output').Write(Modules.Values.source.Read()); }, 1);"]) {
      const result = inspectHmiScript(source, context.functions, undefined, [], context.variables);
      expect(result.error).toBeUndefined();
      expect(result.tagsRead).toEqual(expect.arrayContaining(["Speed", "Start"]));
    }
    expect(run("return Modules.Values.source.Value;", context, { Start: "1", Speed: "150" }).returned).toBe(150);
  });

  it("segue i riferimenti pubblici attraverso gli inizializzatori privati delle funzioni", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [
      { name: "Source", alias: "Source", functions: [], globalDefinition: { source: "export const speed = Tags('Speed');" } },
      { name: "Reader", alias: "Reader", globalDefinition: { source: "const privateTag = Modules.Source.speed;" }, functions: [
        { name: "Read", parameters: [], source: "return privateTag.Read();" },
        { name: "ReadLater", parameters: [], source: "HMIRuntime.Timers.SetTimeout(() => { Tags('Output').Write(privateTag.Read()); }, 1);" },
        { name: "Write", parameters: [], source: "privateTag.Write(200);" },
      ] },
    ] });
    const context = createHmiScriptContextManager().options(catalog, "/");
    for (const functions of [context.functions, hmiScriptFunctions(catalog)]) for (const source of ["return Modules.Reader.Read();", "Modules.Reader.ReadLater();"]) {
      const inspection = inspectHmiScript(source, functions, undefined, [], context.variables);
      expect(inspection.error).toBeUndefined();
      expect(inspection.tagsRead).toContain("Speed");
    }
    expect(inspectHmiScript("Modules.Reader.Write();", context.functions, undefined, [], context.variables).tagsWritten).toContain("Speed");
    expect(run("return Modules.Reader.Read();", context, { Speed: "130" }).returned).toBe(130);
  });

  it("propaga le dipendenze tra moduli e segnala i cicli di inizializzazione", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [
      { name: "A", alias: "A", functions: [], globalDefinition: { source: "export const value = Tags('Speed').Read();" } },
      { name: "B", alias: "B", functions: [], globalDefinition: { source: "export const value = Modules.A.value * 2;" } },
    ] });
    const manager = createHmiScriptContextManager();
    const context = manager.options(catalog, "/");
    expect(run("return Modules.B.value;", context, { Speed: "12" }).returned).toBe(24);
    expect(inspectHmiScript("return Modules.B.value;", context.functions, undefined, [], context.variables).tagsRead).toContain("Speed");
    const cyclic = parseHmiScriptCatalog({ globalModules: [
      { name: "A", alias: "A", functions: [], globalDefinition: { source: "export const value = Modules.B.value;" } },
      { name: "B", alias: "B", functions: [], globalDefinition: { source: "export const value = Modules.A.value;" } },
    ] });
    expect(hmiScriptCatalogIssues(cyclic).join(" ")).toContain("ciclica");
    expect(manager.initialize(cyclic, "/", "events", {}).join(" ")).toContain("ricorsiva");
  });

  it("non accetta export in eventi, definizioni di pagina o Scheduler", () => {
    expect(inspectHmiScript("export let count = 0;").program).toBeUndefined();
    const catalog = parseHmiScriptCatalog({ localDefinitions: [{ scope: "/", context: "events", functions: [], globalDefinition: { source: "export let count = 0;" } }], schedulerDefinition: { source: "export let count = 0;" } });
    expect(hmiScriptCatalogIssues(catalog).join(" ")).toContain("solo nei moduli globali");
  });

  it("ricompila gli export dal sorgente e non salva o importa lo stato Runtime", () => {
    const raw = { globalModules: [{ ...counter(), globalDefinition: { source: "let secret = 42;", program: { version: 1, statements: [], exports: [{ name: "stolen", local: "secret" }] } } }] };
    const forged = parseHmiScriptCatalog(raw);
    const privateContext = createHmiScriptContextManager().options(forged, "/");
    expect(Object.keys(privateContext.variables ?? {})).toEqual([]);
    const catalog = parseHmiScriptCatalog({ globalModules: [counter()] });
    run("Modules.Counter.Next();", createHmiScriptContextManager().options(catalog, "/"));
    const saved = serializeHmiScriptCatalog(catalog);
    const restored = parseHmiScriptCatalog(saved);
    expect(restored.globalModules[0].globalDefinition?.program?.exports?.length).toBe(2);
    expect(run("return Modules.Counter.count;", createHmiScriptContextManager().options(restored, "/")).returned).toBe(0);
  });

  it("segnala collisioni tra nomi pubblici e funzioni e mantiene le costanti protette", () => {
    const colliding = parseHmiScriptCatalog({ globalModules: [{ ...counter(), globalDefinition: { source: "export let Next = 0;" } }] });
    expect(hmiScriptCatalogIssues(colliding).join(" ")).toContain("duplicat");
    const catalog = parseHmiScriptCatalog({ globalModules: [{ ...counter(), functions: [{ name: "ChangeStep", parameters: [], source: "step = 2;" }] }] });
    expect(run("Modules.Counter.ChangeStep();", createHmiScriptContextManager().options(catalog, "/")).error).toContain("costante step");
  });

  it("blocca le inizializzazioni fallite e i timer di contesti non più attivi", async () => {
    const failed = parseHmiScriptCatalog({ globalModules: [{ name: "A", alias: "A", functions: [], globalDefinition: { source: "export let count = missing;" } }] });
    const manager = createHmiScriptContextManager();
    expect(manager.initialize(failed, "/", "events", {})).toEqual(["Variabile locale missing non definita."]);
    const failedProgram = inspectHmiScript("Tags('Command').Write(1); return Modules.A.count;").program!;
    const result = executeHmiScript(failedProgram, {}, manager.options(failed, "/"));
    expect(result.error).toContain("missing");
    const catalog = parseHmiScriptCatalog({ globalModules: [counter()] });
    const context = manager.options(catalog, "/");
    const callback = vi.fn();
    let fire: () => void = () => undefined;
    const timers = createHmiTimerManager(async (item, _timer, timerContext) => {
      const program = item.kind === "inline" ? item.program : { version: 1 as const, statements: [{ kind: "module-call" as const, call: item.call }] };
      callback(executeHmiScript(program, {}, timerContext));
    }, undefined, { now: () => 0, setTimeout: (next) => { fire = next; return 1; }, clearTimeout: vi.fn(), setInterval: vi.fn(), clearInterval: vi.fn() });
    executeHmiScript(inspectHmiScript("HMIRuntime.Timers.SetTimeout(() => { HMIRuntime.Trace(Modules.Counter.count); }, 1);").program!, {}, { ...context, timerManager: timers });
    run("Modules.Counter.Next();", context);
    fire();
    await Promise.resolve();
    expect(callback.mock.calls[0][0].traces).toEqual(["1"]);
    executeHmiScript(inspectHmiScript("HMIRuntime.Timers.SetTimeout(() => { HMIRuntime.Trace(Modules.Counter.count); }, 1);").program!, {}, { ...context, timerManager: timers });
    manager.releaseScreen("/");
    fire();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(1);
    timers.dispose();
  });
});
