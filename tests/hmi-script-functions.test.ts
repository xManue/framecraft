import { describe, expect, it, vi } from "vitest";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { createHmiScriptScope, executeHmiScript, executeHmiScriptAsync, hmiScriptRuntimeModuleSource, inspectHmiScript, type HmiScriptTimerCallback, type HmiScriptTimerContext } from "../src/core/hmiScript";
import { createHmiScriptContextManager, parseHmiScriptCatalog } from "../src/core/hmiScriptModules";
const compile=(source:string)=>{const result=inspectHmiScript(source);expect(result.error).toBeUndefined();return result.program!;};
const run=(source:string,options:Parameters<typeof executeHmiScript>[2]={})=>executeHmiScript(compile(source),{},options);

describe("funzioni valore e closure Unified",()=>{
  it.each([
    ["return add(2,3); function add(a,b){return a+b;}",5],
    ["const add=(a,b)=>a+b; const f=add; return f(2,3);",5],
    ["const values=[x=>x+1]; return values[0](4);",5],
    ["const box={f:function(x){return x+1;}};return box.f(4);",5],
    ["return ((x)=>x+1)(4);",5],
    ["function apply(fn,x){return fn(x);}return apply(x=>x+1,4);",5],
    ["const factorial=function inner(n){if(n===0)return 1;return n*inner(n-1);};return factorial(5);",120],
    ["function factorial(n){if(n===0)return 1;return n*factorial(n-1);}return factorial(5);",120],
  ])("esegue funzioni e riferimenti: %s",(source,expected)=>{const result=run(source as string);expect(result.error).toBeUndefined();expect(result.returned).toBe(expected);});
  it("conserva closure indipendenti dopo il ritorno e mutazioni per riferimento",()=>{
    const result=run("function counter(start){let value=start;return ()=>{value=value+1;return value;};}const a=counter(1);const b=counter(10);a();b();return a()+b();");expect(result.error).toBeUndefined();expect(result.returned).toBe(15);
    expect(run("let value=1;const f=()=>value;value=4;return f();").returned).toBe(4);
  });
  it("mantiene lo scope di blocco e le regole const/TDZ dentro le closure",()=>{
    expect(run("let f;{let value=7;f=()=>value;}return f();").returned).toBe(7);
    expect(run("const value=1;const f=()=>{value=2;};f();").error).toContain("costante value");
    expect(run("const f=()=>value;f();let value=1;").error).toContain("non e' ancora inizializzata");
    expect(run("{function hidden(){return 1;}}return hidden();").error).toContain("hidden non definita");
    expect(run("const f=function hidden(){return 1;};return hidden();").error).toContain("hidden non definita");
  });
  it("distingue dichiarazioni anticipate ed espressioni non ancora inizializzate",()=>{
    expect(run("return f();function f(){return 7;}").returned).toBe(7);
    expect(run("return f();const f=()=>7;").error).toContain("non e' ancora inizializzata");
    expect(run("let f=()=>1;f=()=>7;return f();").returned).toBe(7);
    expect(run("return typeof (()=>1);").returned).toBe("function");
  });
  it("cattura la funzione del timer al momento della registrazione",()=>{
    let pending:{callback:HmiScriptTimerCallback;context?:HmiScriptTimerContext}|undefined;
    const timerManager={set:(_mode:unknown,callback:HmiScriptTimerCallback,_delay:number,context?:HmiScriptTimerContext)=>{pending={callback,context};return 1;},clear:()=>true};
    const result=run("let value=1;let f=()=>{Tags('Result').Write(value);};HMIRuntime.Timers.SetTimeout(f,10);f=()=>{Tags('Wrong').Write(1);};value=7;",{timerManager});
    expect(result.error).toBeUndefined();expect(pending?.callback.kind).toBe("inline");
    if(pending?.callback.kind!=="inline")throw Error("Missing callback");
    const fired=executeHmiScript(pending.callback.program,{},pending.context);expect(fired.error).toBeUndefined();expect(fired.writes).toEqual({Result:"7"});
  });
  it("valuta la factory della callback prima del ritardo e serializza soltanto la IR",()=>{
    const set=vi.fn((_mode:unknown,_callback:unknown,_delay:number)=>1),timerManager={set,clear:()=>true};
    const program=compile("let delay=1;function make(){delay=3;return ()=>1;}HMIRuntime.Timers.SetTimeout(make(),delay);");const result=executeHmiScript(program,{},{timerManager});expect(result.error).toBeUndefined();expect(set.mock.calls[0]?.[2]).toBe(3);expect(JSON.stringify(program)).not.toMatch(/bindings|inspecting/);
  });
  it("invalida callback e closure alla chiusura del contesto",()=>{
    const scope=createHmiScriptScope();let pending:{callback:HmiScriptTimerCallback;context?:HmiScriptTimerContext}|undefined;
    const timerManager={set:(_mode:unknown,callback:HmiScriptTimerCallback,_delay:number,context?:HmiScriptTimerContext)=>{pending={callback,context};return 1;},clear:()=>true};
    expect(run("function f(){Tags('Command').Write(1);}HMIRuntime.Timers.SetTimeout(f,10);",{globalScope:scope,timerManager}).error).toBeUndefined();scope.active=false;
    if(pending?.callback.kind!=="inline")throw Error("Missing callback");const result=executeHmiScript(pending.callback.program,{},pending.context);expect(result.error).toContain("non e' piu' attivo");expect(result.writes).toEqual({});
  });
  it("rifiuta callback non valide prima di creare timer",()=>{
    const set=vi.fn(()=>1),timerManager={set,clear:()=>true};
    expect(run("HMIRuntime.Timers.SetTimeout(7,10);",{timerManager}).error).toContain("callback");
    expect(run("HMIRuntime.Timers.SetTimeout(x=>x,10);",{timerManager}).error).toContain("senza parametri");expect(set).not.toHaveBeenCalled();
  });
  it("non trasforma funzioni in valori PLC o JSON e non espone prototipi",async()=>{
    const write=vi.fn(async()=>{throw Error("Unexpected transport");});
    const result=await executeHmiScriptAsync(compile("const fn=()=>1;Tags('Command').Write(fn);"),{},{transport:{write,read:vi.fn()}});expect(result.error).toContain("Una funzione");expect(write).not.toHaveBeenCalled();
    expect(run("const fn=()=>1;return JSON.stringify({fn});").error).toContain("Una funzione");
    expect(inspectHmiScript("const fn=()=>1;return fn.constructor('return globalThis')();").error).toContain("non ammessa");
    expect(run("const fake={scriptFunction:{parameters:[],program:{}}};return fake();").error).toContain("non e' una funzione");
  });
  it("applica budget e limite di profondità anche a ricorsione e callback",()=>{
    const recursive=run("function f(){return f();}return f();");expect(recursive.error).toContain("Troppi livelli");expect(recursive.writes).toEqual({});
    const limited=run("const f=()=>1;f();f();Tags('Command').Write(1);",{maxSteps:6});expect(limited.error).toContain("operazioni");expect(limited.writes).toEqual({});
    expect(run("const f=x=>x;f();Tags('Command').Write(1);").error).toContain("argomenti");
  });
  it.each(["const f=async()=>1;","const f=function*(){return 1;};","const f=(x=1)=>x;","const f=({...x})=>x;","const f=(...x)=>x;","const f=()=>this;"])("segnala sintassi ancora non disponibile: %s",source=>expect(inspectHmiScript(source).error).toBeTruthy());
  it("mantiene TagSet callable e funzioni in lettura/scrittura con trasporto reale asincrono",async()=>{
    const callable=executeHmiScript(compile("const set=Tags.CreateTagSet(['Speed']);return set('Speed').Read();"),{Speed:"4"});expect(callable.error).toBeUndefined();expect(callable.returned).toBe(4);
    const read=vi.fn(async()=>({value:"4",status:{qualityCode:192}})),write=vi.fn(async(_request:unknown)=>({tag:"Command",outcome:"delivered" as const,delivery:"transport" as const,plcConfirmed:false as const}));
    const result=await executeHmiScriptAsync(compile("function copy(tag){Tags('Command').Write(tag.Read()+1);}copy(Tags('Speed'));"),{},{transport:{read,write}});expect(result.error).toBeUndefined();expect(write).toHaveBeenCalledTimes(1);expect(write.mock.calls[0]?.[0]).toMatchObject({tag:"Command",value:5});expect(read).toHaveBeenCalledTimes(1);
  });
  it("rileva dipendenze tag dirette, parametriche, annidate e catturate dai timer",()=>{
    for(const source of ["const read=tag=>tag.Read();return read(Tags('Speed'));","function factory(tag){return ()=>tag.Read();}const read=factory(Tags('Speed'));return read();","let tag=Tags('Old');const f=()=>tag.Read();tag=Tags('Speed');HMIRuntime.Timers.SetTimeout(f,10);"]){const inspected=inspectHmiScript(source);expect(inspected.error).toBeUndefined();expect(inspected.tagsRead).toContain("Speed");}
    const inspected=inspectHmiScript("function write(tag,value){tag.Write(value);}write(Tags('Command'),1);");expect(inspected.error).toBeUndefined();expect(inspected.tagsWritten).toContain("Command");
  });
  it("usa funzioni dei moduli come valori senza importare i locali del chiamante",()=>{
    const catalog=parseHmiScriptCatalog({globalModules:[{name:"State",alias:"State",globalDefinition:{source:"let value=4;"},functions:[{name:"Read",parameters:[],source:"return value;"},{name:"Create",parameters:["start"],source:"let value=start;return ()=>{value=value+1;return value;};"}]}]});
    const manager=createHmiScriptContextManager();try{const options=manager.options(catalog,"/");const source="let value=99;const read=Modules.State.Read;const create=Modules.State.Create;const next=create(6);return read()+next();";const inspected=inspectHmiScript(source,options.functions,undefined,[],options.variables);expect(inspected.error).toBeUndefined();const result=executeHmiScript(inspected.program!,{},options);expect(result.error).toBeUndefined();expect(result.returned).toBe(11);}finally{manager.dispose();}
  });
  it("inizializza i moduli con funzioni private e permette closure pubbliche",()=>{
    const catalog=parseHmiScriptCatalog({globalModules:[{name:"State",alias:"State",globalDefinition:{source:"function initial(){return 4;}let value=4;export const read=()=>initial()+value;"},functions:[{name:"Create",parameters:[],source:"return ()=>value;"}]}]});
    expect(catalog.globalModules[0].globalDefinition?.error).toBeUndefined();const manager=createHmiScriptContextManager();try{const options=manager.options(catalog,"/");const inspected=inspectHmiScript("const f=Modules.State.Create();return Modules.State.read()+f();",options.functions,undefined,[],options.variables);expect(inspected.error).toBeUndefined();const result=executeHmiScript(inspected.program!,{},options);expect(result.error).toBeUndefined();expect(result.returned).toBe(12);}finally{manager.dispose();}
  });
  it("supporta azioni nelle arrow concise e mantiene gli inizializzatori senza effetti collaterali",()=>{
    const result=run("const write=value=>Tags('Command').Write(value);write(7);");expect(result.error).toBeUndefined();expect(result.writes).toEqual({Command:"7"});
    const catalog=parseHmiScriptCatalog({globalModules:[{name:"State",alias:"State",globalDefinition:{source:"function write(){Tags('Command').Write(1);}const result=write();"},functions:[]}]});expect(catalog.globalModules[0].globalDefinition?.error).toContain("negli eventi");
  });
  it("non legge tag esterni al TagSet attraverso la notazione callable",()=>{
    const result=run("const set=Tags.CreateTagSet(['Speed']);return set('Command').Read();");expect(result.error).toContain("non appartiene al TagSet");expect(result.writes).toEqual({});
  });
  it("rifiuta una callback IR 3 dichiarata come IR 2 prima di eseguirne la factory",()=>{
    const functions={"Modules.QA.Factory":{parameters:[],program:compile("Tags('Command').Write(1);return ()=>1;")}};
    const inspected=inspectHmiScript("HMIRuntime.Timers.SetTimeout(Modules.QA.Factory(),10);",functions);expect(inspected.error).toBeUndefined();const set=vi.fn(()=>1);const result=executeHmiScript({...inspected.program!,version:2},{},{functions,timerManager:{set,clear:()=>true}});expect(result.error).toContain("IR 3");expect(result.writes).toEqual({});expect(set).not.toHaveBeenCalled();
  });
  it("rifiuta nomi di funzioni o parametri che mascherano API HMI riservate",()=>{
    for(const source of ["const f=Tags=>Tags('Speed').Read();","function Tags(){return 1;}","const f=Number=>Number('4');"]){expect(inspectHmiScript(source).error).toContain("riservati");}
  });
  it("esegue e ispeziona la stessa IR nel Runtime esportato, conservando IR 1/2",()=>{
    const exported:Record<string,any>={};new Function("exports",transpileModule(hmiScriptRuntimeModuleSource(),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(exported);
    const program=compile("function factory(tag){return ()=>tag.Read();}const read=factory(Tags('Speed'));return read();");expect(program.version).toBe(3);expect(exported.executeHmiScript(program,{Speed:"7"}).returned).toBe(7);expect(exported.inspectHmiScriptProgram(program).tagsRead).toContain("Speed");
    for(const version of [1,2])expect(exported.executeHmiScript({version,statements:[{kind:"return",value:{kind:"literal",value:7}}]},{}).returned).toBe(7);
  });
});
