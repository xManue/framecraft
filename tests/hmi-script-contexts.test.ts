import { describe, expect, it } from "vitest";
import { executeHmiScript, inspectHmiScript, type HmiScriptTimerCallback, type HmiScriptTimerContext } from "../src/core/hmiScript";
import { createHmiScriptContextManager, hmiScriptCatalogIssues, parseHmiScriptCatalog, serializeHmiScriptCatalog, type HmiGlobalScriptModule } from "../src/core/hmiScriptModules";

const counter = (alias = "Counter", initial = 0): HmiGlobalScriptModule => ({
  name: alias, alias, globalDefinition: { source: `let count = ${initial}; const step = 1;` },
  functions: [
    { name: "Next", parameters: [], source: "count = count + step; return count;" },
    { name: "Read", parameters: [], source: "return count;" },
  ],
});
const run = (source: string, options: Parameters<typeof executeHmiScript>[2], values: Record<string, string> = {}) => {
  const inspected = inspectHmiScript(source);
  expect(inspected.error).toBeUndefined();
  return executeHmiScript(inspected.program!, values, options);
};

describe("contesti script persistenti e isolati", () => {
  it("controlla entrambe le diramazioni delle dipendenze, anche dopo un return", () => {
    expect(inspectHmiScript("if (Tags('Ready').Read()) return Tags('A').Read(); else return Tags('B').Read();").tagsRead).toEqual(["Ready", "A", "B"]);
  });

  it("una chiusura differita non invalida un nuovo caricamento della stessa route", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [counter()] });
    const manager = createHmiScriptContextManager();
    const old = manager.options(catalog, "/"); run("return Modules.Counter.Next();", old);
    const finishUnloaded = manager.detachScreen("/");
    const fresh = manager.options(catalog, "/");
    expect(run("return Modules.Counter.Read();", old).returned).toBe(1);
    expect(run("return Modules.Counter.Read();", fresh).returned).toBe(0);
    finishUnloaded();
    expect(run("return 1;", old).error).toContain("non e' piu' attivo");
    expect(run("return Modules.Counter.Next();", fresh).returned).toBe(1);
  });

  it("rileva le dipendenze dei tag referenziati nella definizione globale", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Values", alias: "Values", globalDefinition: { source: "const speedTag = Tags('Speed');" }, functions: [{ name: "Read", parameters: [], source: "return speedTag.Read();" }] }] });
    expect(catalog.globalModules[0].functions[0].tagsRead).toEqual(["Speed"]);
    expect(inspectHmiScript("return Modules.Values.Read();", createHmiScriptContextManager().options(catalog, "/").functions).tagsRead).toEqual(["Speed"]);
  });
  it("compila e conserva le definizioni di modulo, pagina e Scheduler", () => {
    const catalog = parseHmiScriptCatalog({
      globalModules: [counter()],
      localDefinitions: [{ scope: "/settings", context: "events", globalDefinition: { source: "let selected = 0;" }, functions: [] }],
      schedulerDefinition: { source: "let executions = 0;" },
    });
    expect(hmiScriptCatalogIssues(catalog)).toEqual([]);
    const saved = JSON.parse(serializeHmiScriptCatalog(catalog));
    expect(saved.globalModules[0].globalDefinition.program.statements[1]).toMatchObject({ name: "step", constant: true });
    expect(saved.localDefinitions[0].globalDefinition.program.version).toBe(1);
    expect(saved.schedulerDefinition.program.version).toBe(1);
    expect(parseHmiScriptCatalog(saved)).toEqual(catalog);
  });

  it.each(["Tags('Command').Write(1);", "let timer = HMIRuntime.Timers.SetTimeout(() => {}, 1);", "let x = Modules.Counter.Next();", "let Tags = 1;", "let x = fetch('https://example.com');"])("blocca inizializzatori non ammessi: %s", (source) => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ ...counter(), globalDefinition: { source } }] });
    expect(hmiScriptCatalogIssues(catalog).join(" ")).toContain("definizione globale");
    expect(catalog.globalModules[0].globalDefinition?.program).toBeUndefined();
  });

  it("mantiene valori tra funzioni senza mescolare i namespace dei moduli", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [counter(), counter("Other", 10)] });
    const manager = createHmiScriptContextManager();
    const options = manager.options(catalog, "/settings");
    expect(run("return Modules.Counter.Next();", options).returned).toBe(1);
    expect(run("return Modules.Counter.Next();", options).returned).toBe(2);
    expect(run("return Modules.Other.Next();", options).returned).toBe(11);
    expect(run("return Modules.Counter.Read();", options).returned).toBe(2);
  });

  it("separa copie del modulo tra eventi, dinamizzazioni, pagine e Scheduler", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [counter()] });
    const manager = createHmiScriptContextManager();
    const event = manager.options(catalog, "/settings", "events");
    expect(run("return Modules.Counter.Next();", event).returned).toBe(1);
    for (const options of [manager.options(catalog, "/settings", "dynamizations"), manager.options(catalog, "/main"), manager.options(catalog, undefined, "scheduler")]) {
      expect(run("return Modules.Counter.Read();", options).returned).toBe(0);
      expect(run("return Modules.Counter.Next();", options).returned).toBe(1);
    }
    expect(run("return Modules.Counter.Next();", event).returned).toBe(2);
  });

  it("condivide la definizione di pagina tra eventi e funzioni locali", () => {
    const catalog = parseHmiScriptCatalog({ localDefinitions: [{ scope: "/settings", context: "events", globalDefinition: { source: "let selected = 0;" }, functions: [{ name: "Read", parameters: [], source: "return selected;" }] }] });
    const manager = createHmiScriptContextManager();
    const options = manager.options(catalog, "/settings");
    expect(run("selected = 7; return Local.Read();", options).returned).toBe(7);
    expect(run("return selected;", options).returned).toBe(7);
    expect(run("return selected;", manager.options(catalog, "/settings", "dynamizations")).error).toContain("non definita");
  });

  it("parametri e dichiarazioni della chiamata non modificano variabili omonime del modulo", () => {
    const module = counter();
    module.functions.push({ name: "Echo", parameters: ["count"], source: "count = count + 4; return count;" });
    module.functions.push({ name: "Shadow", parameters: [], source: "let count = 9; return count;" });
    const catalog = parseHmiScriptCatalog({ globalModules: [module] });
    const options = createHmiScriptContextManager().options(catalog, "/");
    expect(run("return Modules.Counter.Echo(2);", options).returned).toBe(6);
    expect(run("return Modules.Counter.Shadow();", options).returned).toBe(9);
    expect(run("return Modules.Counter.Read();", options).returned).toBe(0);
    expect(run("return count;", options).error).toContain("non definita");
  });

  it("impedisce riassegnazioni const anche nel contesto persistente", () => {
    const catalog = parseHmiScriptCatalog({ localDefinitions: [{ scope: "/", context: "events", globalDefinition: { source: "const limit = 10;" }, functions: [] }] });
    const options = createHmiScriptContextManager().options(catalog, "/");
    expect(run("limit = 20;", options).error).toContain("costante limit");
    expect(run("return limit;", options).returned).toBe(10);
    expect(run("const local = 1; local = 2;", {}).error).toContain("costante local");
  });

  it("inizializza i valori tag al caricamento e non a ogni chiamata", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Start", alias: "Start", globalDefinition: { source: "let initial = Tags('Speed').Read();" }, functions: [{ name: "Read", parameters: [], source: "return initial;" }] }] });
    const manager = createHmiScriptContextManager();
    expect(manager.initialize(catalog, "/", "events", { Speed: "120" })).toEqual([]);
    expect(run("return Modules.Start.Read();", manager.options(catalog, "/"), { Speed: "900" }).returned).toBe(120);
  });

  it("conserva gli errori di inizializzazione fino al nuovo contesto", () => {
    const catalog = parseHmiScriptCatalog({ localDefinitions: [{ scope: "/", context: "events", globalDefinition: { source: "let value = missing;" }, functions: [] }] });
    const manager = createHmiScriptContextManager();
    const options = manager.options(catalog, "/");
    expect(manager.initialize(catalog, "/", "events", {})).toEqual(["Variabile locale missing non definita."]);
    expect(run("Tags('Command').Write(1);", options).writes).toEqual({});
    expect(run("return 2;", options).error).toContain("missing");
  });

  it("azzera la pagina quando viene ricaricata, ma conserva lo Scheduler", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [counter()], schedulerDefinition: { source: "let completed = 0;" } });
    const manager = createHmiScriptContextManager();
    const page = manager.options(catalog, "/settings");
    const scheduler = manager.options(catalog, undefined, "scheduler");
    run("return Modules.Counter.Next();", page);
    run("completed = 3;", scheduler);
    manager.releaseScreen("/settings");
    expect(run("Tags('Command').Write(1);", page)).toMatchObject({ writes: {}, error: expect.stringContaining("non e' piu' attivo") });
    expect(run("return Modules.Counter.Read();", manager.options(catalog, "/settings")).returned).toBe(0);
    expect(run("return completed;", scheduler).returned).toBe(3);
  });

  it("invalida i contesti precedenti quando cambia il catalogo o termina il Runtime", () => {
    const manager = createHmiScriptContextManager();
    const old = manager.options(parseHmiScriptCatalog({ globalModules: [counter()] }), "/");
    run("return Modules.Counter.Next();", old);
    const fresh = manager.options(parseHmiScriptCatalog({ globalModules: [counter("Counter", 10)] }), "/");
    expect(run("return Modules.Counter.Next();", fresh).returned).toBe(11);
    expect(run("Tags('Command').Write(1);", old).writes).toEqual({});
    manager.dispose();
    expect(run("return 1;", fresh).error).toContain("non e' piu' attivo");
  });

  it("cattura per riferimento le variabili esterne dei timer inline", () => {
    let callback: HmiScriptTimerCallback | undefined;
    let context: HmiScriptTimerContext | undefined;
    const timerManager = { set: (_mode: string, cb: HmiScriptTimerCallback, _delay: number, captured?: HmiScriptTimerContext) => { callback = cb; context = captured; return 1; }, clear: () => true };
    const setup = run("let count = 1; HMIRuntime.Timers.SetInterval(() => { let invocation = 0; invocation = invocation + 1; count = count + invocation; Tags('Result').Write(count); }, 100); count = 5;", { timerManager });
    expect(setup.error).toBeUndefined();
    expect(callback?.kind).toBe("inline");
    const program = callback!.kind === "inline" ? callback!.program : undefined;
    expect(executeHmiScript(program!, {}, { ...context, timerManager }).writes).toEqual({ Result: "6" });
    expect(executeHmiScript(program!, {}, { ...context, timerManager }).writes).toEqual({ Result: "7" });
  });
});
