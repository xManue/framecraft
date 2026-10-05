import { describe, expect, it, vi } from "vitest";
import { executeHmiScript, inspectHmiScript, inspectHmiScriptProgram, type HmiScriptExecution, type HmiScriptProgram } from "../src/core/hmiScript";
import { createHmiScriptContextManager, hmiScriptCatalogIssues, parseHmiScriptCatalog, serializeHmiScriptCatalog } from "../src/core/hmiScriptModules";
import { createHmiTimerManager } from "../src/core/hmiTimers";

function run(source: string, values: Record<string, string> = {}) {
  const inspected = inspectHmiScript(source);
  if (!inspected.program) throw new Error(inspected.error);
  return executeHmiScript(inspected.program, values);
}

describe("dati strutturati negli script HMI", () => {
  it("legge array e oggetti annidati, chiavi calcolate e proprietà shorthand", () => {
    expect(run("const limit = 100; const cfg = { limit, rows: [{ speed: 10 }, { speed: 20 }] }; const index = 1; return cfg.rows[index].speed + cfg['limit'];").returned).toBe(120);
  });

  it("tratta Value, Count, Visible e tag come normali chiavi di configurazione", () => {
    expect(run("const cfg = { Value: 2, Count: 3, Visible: true, tag: 'Speed' }; return cfg.Value + cfg.Count + (cfg.Visible ? 1 : 0);").returned).toBe(6);
    expect(run('const cfg = JSON.parse(Tags("Config").Read()); return cfg.data.Value;', { Config: '{"data":{"Value":7},"tag":"not-runtime","popupId":"not-runtime"}' }).returned).toBe(7);
  });

  it("conserva l'identità e la copia superficiale degli elementi strutturati", () => {
    expect(run("const item = { speed: 10 }; const a = [item]; const copy = a.slice(); copy[0].speed = 20; return item === copy[0] && a[0].speed === 20;").returned).toBe(true);
    expect(run("const cfg = {}; return cfg !== {} && cfg !== null && typeof cfg === 'object';").returned).toBe(true);
    expect(run("const a = [1, 2]; return a.reverse() === a && a.sort() === a;").returned).toBe(true);
  });

  it("converte i separatori null e gli elementi annidati senza confonderli", () => {
    expect(run("return [1, 2].join(null);").returned).toBe("1null2");
    expect(run("return [[1, null], [2, 3]].join(';');").returned).toBe("1,;2,3");
    expect(run("const a = [null, 0, 'null', 2]; a.sort(); return JSON.stringify(a);").returned).toBe('[0,2,null,"null"]');
  });

  it("aggiorna i membri per riferimento senza riassegnare un binding const", () => {
    expect(run("const cfg = { speed: 10, rows: [1, 2] }; const alias = cfg; alias.speed = 20; cfg.rows[0] = 3; return cfg.speed + alias.rows[0];").returned).toBe(23);
    expect(run("const cfg = {}; cfg = {};").error).toContain("costante");
  });

  it("mantiene i valori strutturati nei moduli e li passa alle funzioni per riferimento", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Config", alias: "Config", globalDefinition: { source: "export const cfg = { speed: 10, limits: [100, 200] };" }, functions: [
      { name: "Get", parameters: [], source: "return cfg;" },
      { name: "Set", parameters: ["value"], source: "value.speed = value.speed + 1; return value.speed;" },
    ] }] });
    expect(hmiScriptCatalogIssues(catalog)).toEqual([]);
    const manager = createHmiScriptContextManager(), context = manager.options(catalog, "/");
    const execute = (source: string) => executeHmiScript(inspectHmiScript(source, context.functions, undefined, [], context.variables).program!, {}, context);
    expect(execute("const data = Modules.Config.Get(); Modules.Config.Set(data); return Modules.Config.cfg.speed;").returned).toBe(11);
    expect(execute("Modules.Config.cfg.limits[0] = 150; return Modules.Config.cfg.limits[0];").returned).toBe(150);
    expect(inspectHmiScript("Modules.Config.cfg = {};" ).error).toContain("sola lettura");
    const persisted = serializeHmiScriptCatalog(catalog);
    expect(persisted).not.toContain('"speed":11');
    expect(executeHmiScript(inspectHmiScript("return Modules.Config.cfg.speed;").program!, {}, manager.options(catalog, "/other")).returned).toBe(10);
    manager.dispose();
  });

  it.each([
    ["const a = [1, 2]; a.push(3); return a.length;", 3],
    ["const a = [1, 2]; return a.pop();", 2],
    ["const a = [1, 2]; return a.shift();", 1],
    ["const a = [1, 2]; a.unshift(0); return a[0];", 0],
    ["const a = [1, 2, 3]; return a.indexOf(2);", 1],
    ["const a = [1, 2, 3]; return a.includes(8);", false],
    ["const a = [1, 2, 3]; return a.slice(1).join('-');", "2-3"],
    ["const a = [2, 10, 1]; a.sort(); return a.join(',');", "1,10,2"],
    ["const a = [1, 2]; a.reverse(); return a.join(',');", "2,1"],
    ["const a = [1, 2, 3]; const old = a.splice(1, 1, 8, 9); return old[0] + a.length;", 6],
    ["const a = [1, 2]; return a.splice().length + a.length;", 2],
  ])("esegue il metodo Array supportato: %s", (source, expected) => {
    expect(run(source as string).returned).toBe(expected);
  });

  it("legge length e gestisce estensione e troncamento senza allocazioni illimitate", () => {
    expect(run("const a = [1, 2]; a[4] = 5; a.length = 3; return a.length + (a[2] === undefined ? 1 : 0);").returned).toBe(4);
    expect(run("return 'WinCC'.length;").returned).toBe(5);
    expect(run("const a = []; a.length = 1000000;").error).toContain("1024");
    expect(run("const a = []; a[1000000] = 1;").error).toContain("1024");
  });

  it("usa JSON e Object senza esporre oggetti host o getter", () => {
    expect(run('const cfg = JSON.parse(Tags("Config").Read()); cfg.speed = 20; return JSON.stringify(cfg);', { Config: '{"speed":10,"limits":[1,2]}' }).returned).toBe('{"speed":20,"limits":[1,2]}');
    expect(run("const cfg = { a: 1, b: 2 }; return Object.keys(cfg).join(',') + ':' + Object.values(cfg).join(',');").returned).toBe("a,b:1,2");
    expect(run("return Object.entries({ a: 1 })[0][1];").returned).toBe(1);
  });

  it("ispeziona tag in membri annidati e indici scelti da un tag", () => {
    const source = "const cfg = { sources: [Tags('A'), Tags('B')], limit: Tags('Limit').Read() }; const index = Tags('Index').Read(); return cfg.sources[index].Read() + cfg.limit;";
    expect(inspectHmiScript(source).tagsRead).toEqual(expect.arrayContaining(["A", "B", "Index", "Limit"]));
    expect(run(source, { A: "1", B: "2", Index: "1", Limit: "10" }).returned).toBe(12);
  });

  it("ispeziona anche scritture, cambi di membro e metodi Array senza modificare la IR", () => {
    const source = "const cfg = { names: [Tags('A'), Tags('B')], source: 'C' }; const alias = cfg; alias.source = 'D'; cfg.names[Tags('Index').Read()].Write(1); return cfg.source.Read();";
    const first = inspectHmiScript(source), serialized = JSON.stringify(first.program);
    expect(first.tagsWritten).toEqual(["A", "B"]);
    expect(first.tagsRead).toEqual(expect.arrayContaining(["Index", "C", "D"]));
    expect(inspectHmiScriptProgram(first.program!).tagsRead).toEqual(first.tagsRead);
    expect(JSON.stringify(first.program)).toBe(serialized);
    expect(inspectHmiScript(source).tagsRead).toEqual(first.tagsRead);
    expect(run(source, { Index: "1", D: "12" })).toMatchObject({ returned: 12, writes: { B: "1" } });
    expect(inspectHmiScript("const refs = [Tags('A')]; refs.push(Tags('B')); return refs[1].Read();").tagsRead).toContain("B");
    expect(inspectHmiScript("const cfg = { unused: 'not-a-tag', value: 1 }; cfg.value = 2; return cfg.value;").tagsRead).toEqual([]);
  });

  it.each([
    ["const refs = ['A']; refs.push('B'); return refs[1].Read();", "B", 20],
    ["const refs = ['A']; refs.unshift('B'); return refs[0].Read();", "B", 20],
    ["const refs = ['A', 'B']; refs.reverse(); return refs[0].Read();", "B", 20],
    ["const refs = ['B', 'A']; refs.sort(); return refs[0].Read();", "A", 10],
    ["const refs = ['A', 'B']; refs.shift(); return refs[0].Read();", "B", 20],
    ["const refs = ['A']; refs.splice(0, 1, 'B'); return refs[0].Read();", "B", 20],
    ["const cfg = { refs: ['A'] }; const alias = cfg.refs; alias.push('B'); return cfg.refs[1].Read();", "B", 20],
    ["const refs = ['A']; const size = refs.push('B'); return refs[1].Read();", "B", 20],
    ["const refs = Tags('Index').Read() ? ['A'] : ['B']; refs.push('C'); return refs[1].Read();", "C", 30],
    ["const refs = Object.values({ first: 'A' }); refs.push('B'); return refs[1].Read();", "B", 20],
    ["const refs = ['A']; const copy = refs.slice(); copy.push('B'); return copy[1].Read();", "B", 20],
    ["const refs = ['A', 'B']; const name = refs.pop(); return name.Read();", "B", 20],
    ["const refs = ['A']; refs.push('B'); const alias = refs; alias[1] = 'C'; return refs[1].Read();", "C", 30],
    ["const refs = ['A']; refs.push('B'); return Object.values(refs)[1].Read();", "B", 20],
    ["const refs = ['A', 'B'].reverse(); return refs[0].Read();", "B", 20],
    ["const refs = ['A', 'B']; const alias = refs.reverse(); alias.push('C'); return refs[2].Read();", "C", 30],
  ] as const)("conserva le dipendenze dopo la mutazione: %s", (source, tag, returned) => {
    const inspected = inspectHmiScript(source), serialized = JSON.stringify(inspected.program);
    expect(inspected.error).toBeUndefined();
    expect(inspected.tagsRead).toContain(tag);
    expect(run(source, { A: "10", B: "20", C: "30", Index: "1" }).returned).toBe(returned);
    expect(inspectHmiScriptProgram(inspected.program!).tagsRead).toEqual(inspected.tagsRead);
    expect(JSON.stringify(inspected.program)).toBe(serialized);
  });

  it("segue le scritture attraverso un array modificato senza inventare tag dai dati", () => {
    const source = "const refs = ['A']; refs.push('B'); refs[1].Write(25);";
    expect(inspectHmiScript(source).tagsWritten).toContain("B");
    expect(run(source)).toMatchObject({ writes: { B: "25" } });
    expect(inspectHmiScript("const labels = ['not-a-tag']; labels.push('also-not-a-tag'); return labels.join(',');").tagsRead).toEqual([]);
  });

  it("non modifica la IR neppure alla prima ispezione di un array condizionale", () => {
    const program: HmiScriptProgram = { version: 1, statements: [
      { kind: "declare", name: "refs", value: { kind: "conditional", test: { kind: "tag-read", tag: { kind: "tag-ref", name: "Index" } }, consequent: { kind: "array", items: [{ kind: "literal", value: "A" }] }, alternate: { kind: "array", items: [{ kind: "literal", value: "B" }] } } },
      { kind: "expression", value: { kind: "array-method", object: { kind: "local", name: "refs" }, method: "push", arguments: [{ kind: "literal", value: "C" }] } },
      { kind: "return", value: { kind: "tag-read", tag: { kind: "member", object: { kind: "local", name: "refs" }, key: { kind: "literal", value: 1 } } } },
    ] };
    const serialized = JSON.stringify(program);
    expect(inspectHmiScriptProgram(program).tagsRead).toContain("C");
    expect(JSON.stringify(program)).toBe(serialized);
    expect(executeHmiScript(program, { Index: "1", C: "30" }).returned).toBe(30);
  });

  it("aggiorna le dipendenze di tutti i TagSet selezionabili con un indice dinamico", () => {
    const source = "const sets = [HMIRuntime.Tags.CreateTagSet(['A']), HMIRuntime.Tags.CreateTagSet(['B'])]; const selected = sets[Tags('Index').Read()]; selected.Add(['C']); selected.Read(); return sets[1].Count;";
    const inspected = inspectHmiScript(source), serialized = JSON.stringify(inspected.program);
    expect(inspected.error).toBeUndefined();
    expect(inspected.tagsRead).toEqual(expect.arrayContaining(["A", "B", "C", "Index"]));
    const execution = run(source, { A: "10", B: "20", C: "30", Index: "1" });
    expect(execution.error).toBeUndefined();
    expect(execution.returned).toBe(2);
    expect(inspectHmiScriptProgram(inspected.program!).tagsRead).toEqual(inspected.tagsRead);
    expect(JSON.stringify(inspected.program)).toBe(serialized);
    const write = "const sets = [Tags.CreateTagSet(['A']), Tags.CreateTagSet(['B'])]; const selected = sets[Tags('Index').Read()]; selected.Add([['C', 30]]); selected.Write();";
    expect(inspectHmiScript(write).tagsWritten).toContain("C");
    expect(run(write, { Index: "1" }).writes).toEqual({ C: "30" });
  });

  it("segue i riferimenti strutturati passati e restituiti dalle funzioni di modulo", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{
      name: "Reader", alias: "Reader", globalDefinition: { source: "const cfg = { source: Tags('Speed') }; const unused = Tags('Unused');" },
      functions: [
        { name: "Get", parameters: [], source: "return cfg;" },
        { name: "Read", parameters: ["data"], source: "Tags('Output').Write(data.source.Read());" },
      ],
    }] });
    const manager = createHmiScriptContextManager(), context = manager.options(catalog, "/");
    try {
      const source = "const cfg = Modules.Reader.Get(); Modules.Reader.Read(cfg); return cfg.source.Read();";
      const inspected = inspectHmiScript(source, context.functions, undefined, [], context.variables);
      expect(inspected.tagsRead).toContain("Speed");
      expect(inspected.tagsRead).not.toContain("Unused");
      expect(inspected.tagsWritten).toContain("Output");
      expect(executeHmiScript(inspected.program!, { Speed: "125" }, context)).toMatchObject({ returned: 125, writes: { Output: "125" } });
    } finally { manager.dispose(); }
  });

  it("ispeziona copie e dati temporanei senza alterare il programma o gli array originali", () => {
    const source = "const refs = [{ name: 'A' }].slice(); refs[0].name = 'B'; return refs[0].name.Read();";
    const inspected = inspectHmiScript(source), serialized = JSON.stringify(inspected.program);
    expect(inspected.tagsRead).toContain("B");
    expect(run(source, { B: "20" }).returned).toBe(20);
    expect(inspectHmiScriptProgram(inspected.program!).tagsRead).toEqual(inspected.tagsRead);
    expect(JSON.stringify(inspected.program)).toBe(serialized);
    const copy = "const refs = ['A']; const copy = refs.slice(); copy.push('B'); return refs[0].Read();";
    expect(inspectHmiScript(copy).tagsRead).toEqual(["A"]);
    expect(run(copy, { A: "10" }).returned).toBe(10);
  });

  it("gestisce TagSet dentro i dati strutturati e nei parametri", () => {
    const source = "const cfg = { tags: HMIRuntime.Tags.CreateTagSet(['Speed']) }; cfg.tags.Read(); cfg.tags.Item('Speed').Value = 30; cfg.tags.Write(); return cfg.tags.Item('Speed').Value;";
    expect(inspectHmiScript(source)).toMatchObject({ tagsRead: ["Speed"], tagsWritten: ["Speed"] });
    expect(run(source, { Speed: "20" })).toMatchObject({ returned: 30, writes: { Speed: "30" } });
    const selected = "const sets = [HMIRuntime.Tags.CreateTagSet(['A']), HMIRuntime.Tags.CreateTagSet(['B'])]; sets[Tags('Index').Read()].Read(); return sets[1].Count;";
    expect(inspectHmiScript(selected).tagsRead).toEqual(expect.arrayContaining(["A", "B", "Index"]));
    expect(run(selected, { Index: "1", B: "20" }).returned).toBe(1);
  });

  it("rifiuta API host ma permette oggetti locali con gli stessi nomi", () => {
    for (const host of ["document", "window", "globalThis", "process", "localStorage"]) expect(inspectHmiScript("return " + host + ".Value;").error).toContain("API host");
    expect(run("const document = { cookie: 'local-data' }; return document.cookie;").returned).toBe("local-data");
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "LocalData", alias: "LocalData", functions: [{ name: "Read", parameters: ["document"], source: "return document.Value;" }] }] });
    expect(hmiScriptCatalogIssues(catalog)).toEqual([]);
  });

  it("non confonde i dati con riferimenti Runtime e conserva i tag negli oggetti", () => {
    expect(run("const cfg = { source: Tags('Speed'), tag: 'Other', tagSet: 1, popupId: 'not-runtime' }; return cfg.source.Value;", { Speed: "125" }).returned).toBe(125);
    expect(run("const cfg = { tag: 'Speed' }; return cfg.Read();", { Speed: "125" }).error).toBeDefined();
    expect(run("const cfg = { speed: 10 }; Tags('Output').Write(cfg);").error).toContain("strutturato");
    expect(run("return { speed: 10 };").error).toContain("strutturato");
  });

  it("conserva il riferimento strutturato catturato dal timer", () => {
    vi.useFakeTimers();
    const executions: HmiScriptExecution[] = [];
    const timers = createHmiTimerManager((callback, _timer, context) => {
      if (callback.kind === "inline") executions.push(executeHmiScript(callback.program, {}, context));
    });
    try {
      const source = "const cfg = { speed: 10 }; HMIRuntime.Timers.SetTimeout(() => { Tags('Output').Write(cfg.speed); }, 1); cfg.speed = 20;";
      const program = inspectHmiScript(source).program!;
      expect(executeHmiScript(program, {}, { timerManager: timers }).error).toBeUndefined();
      vi.advanceTimersByTime(1);
      expect(executions[0].writes).toEqual({ Output: "20" });
    } finally { timers.dispose(); vi.useRealTimers(); }
  });

  it.each(["return ({ constructor: 1 });", "return ({ __proto__: {} });", "const a = []; return a.constructor;", "const a = {}; return a['prototype'];", "const a = { get speed() { return 1; } };", "return Object.getPrototypeOf({});", "return new Array(1000000);"])("rifiuta accesso a prototipi o codice non supportato: %s", (source) => {
    expect(inspectHmiScript(source).error).toBeDefined();
  });

  it("blocca anche chiavi pericolose calcolate o decodificate da JSON", () => {
    expect(run("const cfg = {}; const key = '__' + 'proto__'; cfg[key] = {};").error).toContain("non ammessa");
    expect(run('return JSON.parse(Tags("Config").Read()).speed;', { Config: '{"speed":1,"nested":{"constructor":{}}}' }).error).toContain("non ammessa");
    expect(run('return JSON.parse(Tags("Config").Read()).speed;', { Config: " ".repeat(20001) + "{}" }).error).toContain("20000");
    expect(run("const cfg = {}; cfg.self = cfg;").error).toContain("ciclic");
    expect(run("const a = []; a.push(a);").error).toContain("ciclic");
  });

  it("applica i limiti anche a profondità, dimensione e budget delle operazioni", () => {
    const deep = inspectHmiScript("return JSON.stringify(" + "{ a: ".repeat(33) + "1" + " }".repeat(33) + ");").program!;
    expect(executeHmiScript(deep, {}, { maxSteps: 10000 }).error).toContain("32 livelli");
    expect(run("const cfg = {}; cfg.speed = 10 ** 400;").error).toContain("finiti");
    const program = inspectHmiScript("return JSON.parse(Tags('Config').Read()).length;").program!;
    expect(executeHmiScript(program, { Config: JSON.stringify(Array(1025).fill(1)) }, { maxSteps: 10000 }).error).toContain("1024");
    expect(executeHmiScript(program, { Config: "[1,2,3,4,5]" }, { maxSteps: 5 }).error).toContain("5 operazioni");
    expect(inspectHmiScript("const a = [2, 1]; a.sort((a, b) => a - b);").error).toBeDefined();
  });

  it("mantiene non operativi gli inizializzatori, anche con metodi su array", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Config", alias: "Config", functions: [], globalDefinition: { source: "const list = [1]; const size = list.push(2);" } }] });
    expect(hmiScriptCatalogIssues(catalog).join(" ")).toContain("definizione globale");
  });
});
