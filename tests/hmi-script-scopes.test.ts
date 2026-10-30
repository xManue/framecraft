import { describe, expect, it, vi } from "vitest";
import { executeHmiScript, executeHmiScriptAsync, inspectHmiScript, hmiScriptRuntimeModuleSource, type HmiScriptTimerCallback, type HmiScriptTimerContext } from "../src/core/hmiScript";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { createHmiScriptContextManager, parseHmiScriptCatalog } from "../src/core/hmiScriptModules";

const compile = (source: string) => { const result = inspectHmiScript(source); expect(result.error).toBeUndefined(); return result.program!; };
const run = (source: string, options: Parameters<typeof executeHmiScript>[2] = {}) => executeHmiScript(compile(source), {}, options);

describe("scope lessicali degli script Unified", () => {
  it.each([
    "let value=1; if(true){let value=2;} return value;",
    "const value=1; if(true){let value=2;} return value;",
    "let value=1; {const value=2; {let value=3;}} return value;",
    "let value=1; if(false){let value=2;} else {const value=3;} return value;",
  ])("isola le dichiarazioni di blocco: %s", source => { const result=run(source); expect(result.returned).toBe(1); expect(result.error).toBeUndefined(); });

  it("assegna alle variabili esterne senza copiarle e preserva i vincoli const", () => {
    expect(run("let value=1; {value=3;} return value;").returned).toBe(3);
    expect(run("const value=1; {const value=2;} value=3;").error).toContain("costante value");
    expect(run("let value=1; {const value=2; value=3;}").error).toContain("costante value");
  });

  it.each(["{let hidden=2;} return hidden;", "if(true){let hidden=2;} return hidden;", "try{let hidden=2;}finally{} return hidden;"])("non espone variabili fuori blocco: %s", source => expect(run(source).error).toContain("hidden non definita"));

  it.each(["let value=1; {return value; let value=2;}", "{value=3; let value=2;}", "let value=value;", "const value=value;"])("applica la TDZ prima di leggere o assegnare: %s", source => {
    const result = run(source); expect(result.error).toContain("non e' ancora inizializzata"); expect(result.writes).toEqual({});
  });

  it("conserva var nello scope della funzione e non sovrascrive i parametri senza initializer", () => {
    expect(run("if(true){var value=3;} return value;").returned).toBe(3);
    expect(run("var value; return value;", {locals:{value:7}}).returned).toBe(7);
    expect(run("var value=1; if(true){var value=3;} var value; return value;").returned).toBe(3);
  });

  it.each(["Tags('Command').Write(value);var value=1;", "let value;Tags('Command').Write(value);"])("non trasforma un valore non assegnato in un comando zero: %s", source => {
    const result=run(source);expect(result.error).toContain("non ha ancora un valore");expect(result.writes).toEqual({});
  });

  it("consente l’assegnazione successiva di var e let e protegge anche gli export senza valore", () => {
    expect(run("var value;value=4;return value;").returned).toBe(4);expect(run("let value;value=5;return value;").returned).toBe(5);
    const catalog=parseHmiScriptCatalog({globalModules:[{name:"State",alias:"State",globalDefinition:{source:"export let value;"},functions:[{name:"Set",parameters:[],source:"value=5;"}]}]});
    const manager=createHmiScriptContextManager();try{const options=manager.options(catalog,"/");expect(run("return Modules.State.value;",options).error).toContain("non ha ancora un valore");expect(run("Modules.State.Set();return Modules.State.value;",options).returned).toBe(5);}finally{manager.dispose();}
  });

  it("ferma un comando prima di chiamare il trasporto se il valore non è assegnato", async () => {
    const read=vi.fn(async()=>{throw Error("Unexpected read");}),write=vi.fn(async()=>{throw Error("Unexpected write");});
    const result=await executeHmiScriptAsync(compile("Tags('Command').Write(value);var value=1;"),{}, {transport:{read,write}});
    expect(result.error).toContain("non ha ancora un valore");expect(result.commands).toEqual([]);expect(write).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
  });

  it("isola il parametro catch e ripristina le variabili dopo eccezioni", () => {
    const result = run("const error='outer'; try{return missing;} catch(error){let hidden=2; Tags('Fault').Write(error);} finally{Tags('Finally').Write(1);} return error;");
    expect(result.error).toBeUndefined(); expect(result.returned).toBe("outer"); expect(result.writes.Finally).toBe("1"); expect(result.writes.Fault).toContain("missing non definita");
    expect(run("try{return missing;}catch(error){} return error;").error).toContain("error non definita");
  });

  it("rispetta return e finally senza perdere lo scope esterno", () => {
    expect(run("let value=1; try{let value=2; return value;} finally{let value=3;}").returned).toBe(2);
    expect(run("try{return 1;} finally{return 3;}").returned).toBe(3);
  });

  it("esegue fall-through e break nel solo switch corrente", () => {
    expect(run("let result=0; switch(1){case 1:result=1; case 2:result=result+2; break; default:result=99;} return result;").returned).toBe(3);
    expect(run("let result=0; switch(1){case 1:switch(2){case 2:result=2;break;} result=result+3; break;default:result=99;} return result;").returned).toBe(5);
    expect(run("let result=0; switch(1){case 1:try{if(true)break;}finally{result=7;}default:result=99;} return result;").returned).toBe(7);
  });

  it("condivide lo scope dei case e applica la TDZ anche alle condizioni del case", () => {
    expect(run("let value=1; switch(1){case 1:let value=3;break;default:value=4;} return value;").returned).toBe(1);
    expect(run("let value=1; switch(1){case 1:return value;case 2:let value=3;}").error).toContain("non e' ancora inizializzata");
    expect(run("let value=1; switch(1){case value:return 2;case 2:let value=3;}").error).toContain("non e' ancora inizializzata");
  });

  it("cattura lo scope del blocco nei timer dopo che il blocco è terminato", () => {
    let callback: HmiScriptTimerCallback | undefined, context: HmiScriptTimerContext | undefined;
    const timerManager = {set: (_mode:string, cb:HmiScriptTimerCallback, _delay:number, ctx?:HmiScriptTimerContext) => {callback=cb;context=ctx;return 1;}, clear:()=>true};
    expect(run("let count=1; if(true){const step=2; HMIRuntime.Timers.SetTimeout(()=>{count=count+step; Tags('Result').Write(count);},100);} count=5;", {timerManager}).error).toBeUndefined();
    expect(callback?.kind).toBe("inline"); if(callback?.kind !== "inline") throw Error("No inline callback");
    expect(executeHmiScript(callback.program, {}, {...context,timerManager}).writes).toEqual({Result:"7"});
  });

  it("isola i parametri e var dei callback Promise", async () => {
    const source = "const result=9; const tags=Tags.CreateTagSet(['A']); tags.ReadAsync().then(result=>{var inside=result.Count;Tags('Out').Write(inside);}); return result;";
    const result = await executeHmiScriptAsync(compile(source), {A:"1"}); expect(result.error).toBeUndefined(); expect(result.returned).toBe(9); expect(result.writes.Out).toBe("1");
    const hidden = await executeHmiScriptAsync(compile(source.replace("return result;", "return inside;")), {A:"1"}); expect(hidden.error).toContain("inside non definita");
  });

  it("rileva tag e scritture anche nei blocchi espliciti e nei timer", () => {
    const inspected = inspectHmiScript("{let tag=Tags('A'); Tags('Out').Write(tag.Read()); HMIRuntime.Timers.SetTimeout(()=>{Tags('Later').Write(Tags('B').Read());},100);}");
    expect(inspected.tagsRead.sort()).toEqual(["A","B"]); expect(inspected.tagsWritten.sort()).toEqual(["Later","Out"]);
  });

  it("rileva i tag catturati per riferimento dal solo callback di un blocco", () => {
    const inspected=inspectHmiScript("if(true){const tag=Tags('Captured'); HMIRuntime.Timers.SetTimeout(()=>{Tags('Out').Write(tag.Read());},100);}");
    expect(inspected.tagsRead).toEqual(["Captured"]); expect(inspected.tagsWritten).toEqual(["Out"]);
  });

  it.each([
    ["const tag=Tags('Outer'); {HMIRuntime.Timers.SetTimeout(()=>{Tags('Out').Write(tag.Read());},100); const tag=Tags('Inner');}", ["Inner"]],
    ["let tag=Tags('Before'); HMIRuntime.Timers.SetTimeout(()=>{Tags('Out').Write(tag.Read());},100); tag=Tags('After');", ["After","Before"]],
  ])("conserva dipendenze tardive e mutazioni senza usare binding nascosti: %s", (source, expected) => {
    expect(inspectHmiScript(source as string).tagsRead.sort()).toEqual(expected);
  });

  it.each([
    "if(true){var tag=Tags('Across');} return tag.Read();",
    "let tag=Tags('Before'); {tag=Tags('Across');} return tag.Read();",
    "switch(1){case 1:var tag=Tags('Across'); case 2:Tags('Out').Write(tag.Read());break;}",
  ])("conserva le dipendenze che attraversano uno scope: %s", source => expect(inspectHmiScript(source).tagsRead).toContain("Across"));

  it("non confonde return del callback con return dello script e non propaga variabili nascoste", () => {
    expect(inspectHmiScript("const tags=Tags.CreateTagSet(['A']);tags.ReadAsync().then(()=>{return 3;});").hasReturn).toBe(false);
    expect(inspectHmiScript("const tag=Tags('Outer'); {const tag=Tags('Inner');} return tag.Read();").tagsRead).toEqual(["Outer"]);
  });

  it("mantiene lo stesso comportamento nel modulo Runtime generato", () => {
    const exported: Record<string, typeof executeHmiScript> = {};
    new Function("exports", transpileModule(hmiScriptRuntimeModuleSource(), {compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(exported);
    expect(exported.executeHmiScript(compile("let value=1; if(true){let value=2;} return value;"), {}).returned).toBe(1);
    expect(exported.executeHmiScript(compile("{return value;let value=2;}"), {}).error).toContain("non e' ancora inizializzata");
    const unavailable=exported.executeHmiScript(compile("let value;Tags('Command').Write(value);"),{});expect(unavailable.error).toContain("non ha ancora un valore");expect(unavailable.writes).toEqual({});
  });

  it("distingue la vecchia IR piatta e rifiuta versioni sconosciute prima dei comandi", () => {
    const program=compile("let value=1; if(true){let value=2;} return value;"); expect(program.version).toBe(2);
    const legacy={...program,version:1 as const}; expect(executeHmiScript(legacy,{}).returned).toBe(2); expect(executeHmiScript(program,{}).returned).toBe(1);
    const catchProgram={...compile("const error='outer';try{return missing;}catch(error){}return error;"),version:1 as const}; expect(executeHmiScript(catchProgram,{}).returned).toBe("outer");
    const emptyCatch={...compile("let error;try{return missing;}catch(error){HMIRuntime.Trace(error);}return error;"),version:1 as const}, caught=executeHmiScript(emptyCatch,{}); expect(caught.traces[0]).toContain("missing non definita");expect(caught.error).toContain("non ha ancora un valore");
    const rejected=executeHmiScript({...compile("Tags('Command').Write(1);"),version:99} as never,{}); expect(rejected.writes).toEqual({}); expect(rejected.error).toContain("Versione dello script non supportata");
  });
});
