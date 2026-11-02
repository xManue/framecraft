import {describe,expect,it,vi} from "vitest";
import {ModuleKind,ScriptTarget,transpileModule} from "typescript";
import {createHmiScriptScope,executeHmiScript,executeHmiScriptAsync,hmiScriptRuntimeModuleSource,inspectHmiScript,type HmiScriptExecutionOptions} from "../src/core/hmiScript";
import {createHmiScriptContextManager,parseHmiScriptCatalog} from "../src/core/hmiScriptModules";
const compile=(source:string)=>{const inspected=inspectHmiScript(source);expect(inspected.error).toBeUndefined();return inspected.program!;};
const run=(source:string,options:HmiScriptExecutionOptions={})=>executeHmiScript(compile(source),{},options);
const parity=[
  "return JSON.stringify([1,2,3].map((value,index,array)=>value+index+array.length));",
  "return JSON.stringify([{v:1},{v:2}].filter(item=>item.v>1));",
  "let sum=0;[1,2,3].forEach(value=>{sum=sum+value;});return sum;",
  "return [1,2,3].find(value=>value>1);",
  "return [1,2,3].findIndex(value=>value>1);",
  "return [1,2,3].findLast(value=>value>1);",
  "return [1,2,3].findLastIndex(value=>value>1);",
  "return [1].some(value=>'false');",
  "return [].every(value=>false);",
  "return [].some(value=>true);",
  "return [1,2,3].reduce((sum,value)=>sum+value,0);",
  "return [1,2,3].reduce((sum,value)=>sum+value);",
  "return [1,2,3].reduceRight((sum,value)=>sum+value,'');",
  "return JSON.stringify([1,2].flatMap(value=>[value,value*2]));",
  "return JSON.stringify([1,2].flatMap(value=>[value,,value]));",
  "const a=[3,1,2];const sorted=a.sort((a,b)=>a-b);return JSON.stringify({a,same:sorted===a});",
  "const a=[{k:1,id:'a'},{k:0,id:'b'},{k:1,id:'c'}];a.sort((a,b)=>a.k-b.k);return JSON.stringify(a);",
  "const a=[undefined,2,,1];a.sort();return JSON.stringify({a,keys:Object.keys(a)});",
  "const a=[3,1,2];a.sort((a,b)=>undefined);return JSON.stringify(a);",
  "const a=[3,1,2];a.sort((a,b)=>'invalid');return JSON.stringify(a);",
  "const functions=[1,2].map(value=>()=>value);return functions[0]()+functions[1]();",
  "const a=[1,2,3];const b=a.map((value,index)=>{if(index===0)a.pop();return value;});return JSON.stringify({a,b,keys:Object.keys(b)});",
  "const a=[1,2,3];let calls=0;a.forEach(value=>{calls=calls+1;if(value===1)a.push(4);});return JSON.stringify({a,calls});",
  "const a=[1,2,3];const b=a.filter((value,index)=>{a[index]=9;return true;});return JSON.stringify({a,b});",
  "return [,,1].findIndex(value=>value===undefined);",
  "return [1,,].findLastIndex(value=>value===undefined);",
  "return [,,1,,].reduce((a,b)=>a+b);",
  "return JSON.stringify([1,2].reduce((acc,value)=>{acc.items.push(value);return acc;},{items:[]}));",
  "let value;return typeof value;",
  "return JSON.stringify([undefined===null,undefined==null,undefined!==null,undefined!=null]);",
  "return JSON.stringify({missing:undefined,items:[undefined,null,,]});",
  "return JSON.stringify(['0'&&5,'false'||7,undefined??8]);",
  "return typeof neverDeclared;",
  "const a=[1];a.length=3;return JSON.stringify({a,keys:Object.keys(a)});",
  "const a=[];a[3]=4;return JSON.stringify({a,keys:Object.keys(a)});",
  "return JSON.stringify([[,,].includes(undefined),[,,].indexOf(undefined),[undefined].indexOf(undefined),[undefined].lastIndexOf(undefined)]);",
  "return JSON.stringify([String([undefined,null,,]),[undefined].join('-'),typeof [].pop(),typeof [].shift()]);",
  "return JSON.stringify([({}).missing===undefined,({value:null}).value===null]);",
  "return [1].reduce((a,b,index,array,missing)=>typeof missing,0);",
  "return JSON.stringify([2,1].sort((a,b,missing)=>typeof missing==='undefined'?a-b:0));",
  "return JSON.stringify([1,2].map((value,index,array,missing)=>typeof missing));",
  "return typeof JSON.stringify(undefined);",
  "return Boolean();",
  "return String();",
  "return Number();",
  "return 'missing='+undefined;",
  "return JSON.stringify([1,2].slice(undefined,undefined));",
  "return JSON.stringify([[1,2].join(undefined),[undefined,1,undefined].lastIndexOf(undefined,undefined)]);",
  "const a=[1,2];a.splice(undefined,undefined,3);return JSON.stringify(a);",
  "const a=[3,1,2];a.sort((x,y)=>{if(a.length===3)a.push(9);return x-y;});return JSON.stringify(a);",
  "let calls=0;const b=[,1,].map(value=>{calls=calls+1;return value;});return JSON.stringify({b,calls,keys:Object.keys(b)});",
  "const a=[1,2,3];const b=a.map((value,index)=>{if(index===0)a.length=0;return value;});return JSON.stringify({b,keys:Object.keys(b)});",
  "const a=[3,1,2];try{a.sort((x,y)=>neverDeclared);}catch(error){}return JSON.stringify(a);",
  "return JSON.stringify([,1,,2].filter(value=>true));",
];
describe('callback Array e valori assenti nella IR 4',()=>{
  it.each(parity)('corrisponde a JavaScript per %s',source=>{const expected=new Function(source)();const result=run(source,{maxSteps:20000});expect(result.error).toBeUndefined();expect(result.returned).toEqual(expected);});
  it('rileva letture e scritture tramite callback e risultati di map/filter/reduce',()=>{
    for(const source of ["return [Tags('A'),Tags('B')].filter(tag=>true).map(tag=>tag.Read()).join(',');","const tags=[Tags('A'),Tags('B')].map(tag=>tag);return tags[0].Read();","const tag=[Tags('A'),Tags('B')].reduce((acc,tag)=>tag);return tag.Read();"]){const result=inspectHmiScript(source);expect(result.error).toBeUndefined();expect(result.tagsRead).toEqual(expect.arrayContaining(['A','B']));}
    const written=inspectHmiScript("[Tags('A'),Tags('B')].forEach(tag=>tag.Write(1));");expect(written.error).toBeUndefined();expect(written.tagsWritten).toEqual(expect.arrayContaining(['A','B']));
  });
  it('non invia valori assenti al PLC e non accetta sentinelle costruite dall’utente',async()=>{
    const write=vi.fn(async()=>{throw Error('Unexpected write');});
    for(const source of ["Tags('Command').Write([1].find(value=>false));","const a=[];a.length=2;Tags('Command').Write(a[0]);","const a={};Tags('Command').Write(a.missing);","Tags('Command').Write(undefined);","Tags('Command').Write(Number(undefined));"]){const result=await executeHmiScriptAsync(compile(source),{},{transport:{write,read:vi.fn()}});expect(result.error).toContain('Valore assente');expect(result.commands).toEqual([]);}
    expect(write).not.toHaveBeenCalled();expect(run("return ({undefinedValue:true})===undefined;").returned).toBe(false);
  });
  it('usa il trasporto nelle callback in sequenza e rispetta abort',async()=>{
    const read=vi.fn(async(request:{tag:string})=>({value:request.tag==='A'?'2':'4',status:{qualityCode:192}})),write=vi.fn();
    const program=compile("return JSON.stringify([Tags('A'),Tags('B')].map(tag=>tag.Read()));");const result=await executeHmiScriptAsync(program,{},{transport:{read,write}});expect(result.error).toBeUndefined();expect(result.returned).toBe('[2,4]');expect(read.mock.calls.map(([request])=>request.tag)).toEqual(['A','B']);expect(write).not.toHaveBeenCalled();
    const controller=new AbortController();const abortedRead=vi.fn(async()=>{controller.abort();return {value:'2',status:{qualityCode:192}};});const aborted=await executeHmiScriptAsync(program,{},{transport:{read:abortedRead,write},signal:controller.signal});expect(aborted.error).toBeTruthy();expect(abortedRead).toHaveBeenCalledTimes(1);expect(write).not.toHaveBeenCalled();
  });
  it('invia le scritture della callback una volta e in ordine, con ricevute separate',async()=>{
    const write=vi.fn(async(request:{tag:string;value:unknown})=>({tag:request.tag,outcome:'delivered' as const,delivery:'transport' as const,plcConfirmed:false as const}));
    const result=await executeHmiScriptAsync(compile("[1,2,3].forEach(value=>Tags('Command').Write(value));"),{},{transport:{write,read:vi.fn()}});expect(result.error).toBeUndefined();expect(write.mock.calls.map(([request])=>request.value)).toEqual([1,2,3]);expect(result.commands).toHaveLength(3);expect(result.writes).toEqual({});expect(result.commands?.every(command=>command.outcome==='delivered'&&command.plcConfirmed===false)).toBe(true);
  });
  it('permette letture di trasporto anche nel comparatore e preserva i cicli',async()=>{
    const read=vi.fn(async()=>({value:'1',status:{qualityCode:192}}));const result=await executeHmiScriptAsync(compile("const values=[3,1,2];values.sort((a,b)=>{Tags('Probe').Read();return a-b;});return JSON.stringify(values);"),{},{transport:{read,write:vi.fn()}});expect(result.error).toBeUndefined();expect(result.returned).toBe('[1,2,3]');expect(read).toHaveBeenCalled();
    expect(run('const values=[1];values.map(value=>{values.push(values);return value;});').error).toContain('ciclic');
  });
  it('controlla firme, callback, array vuoti, capacità e budget',()=>{
    expect(run('return [].reduce((a,b)=>a+b);').error).toContain('valore iniziale');
    expect(run('return [].map(null);').error).toContain('funzione HMI');
    expect(run('return [].map(value=>value,{});').error).toContain('thisArg');
    expect(run("[1,2,3].forEach(value=>{Tags('Command').Write(value);});",{maxSteps:5}).error).toContain('operazioni');
    const program=compile("const a=JSON.parse(Tags('Config').Read());a.flatMap(value=>[value,value]);Tags('Command').Write(1);");const result=executeHmiScript(program,{Config:JSON.stringify(Array(600).fill(1))},{maxSteps:100000,timeoutMs:5000});expect(result.error).toContain('1024');expect(result.writes).toEqual({});
  });
  it('mantiene gli inizializzatori privi di chiamate ed esegue callback di modulo',()=>{
    const bad=parseHmiScriptCatalog({globalModules:[{name:'Bad',alias:'Bad',globalDefinition:{source:"const x=[1].map(value=>Tags('Command').Write(value));"},functions:[]}]});expect(bad.globalModules[0].globalDefinition?.error).toContain('negli eventi');
    const catalog=parseHmiScriptCatalog({globalModules:[{name:'Calc',alias:'Calc',functions:[{name:'Double',parameters:['value'],source:'return value*2;'}]}]});const manager=createHmiScriptContextManager();try{const options=manager.options(catalog,'/');const inspected=inspectHmiScript('return [1,2].map(Modules.Calc.Double).join(",");',options.functions,undefined,[],options.variables);expect(inspected.error).toBeUndefined();const result=executeHmiScript(inspected.program!,{},options);expect(result.error).toBeUndefined();expect(result.returned).toBe('2,4');}finally{manager.dispose();}
  });
  it('conserva la semantica precedente per programmi IR 3 e rifiuta callback dichiarate IR 3',()=>{
    const legacy={...compile('let value;return value;'),version:3 as const};expect(executeHmiScript(legacy,{}).error).toContain('non ha ancora un valore');
    const nullLegacy={version:3 as const,statements:[{kind:'return' as const,value:{kind:'literal' as const,value:null}}]};expect(executeHmiScript(nullLegacy,{}).returned).toBe(null);
    const program={...compile("[1].map(value=>Tags('Command').Write(value));"),version:3 as const};const rejected=executeHmiScript(program,{});expect(rejected.error).toContain('IR 4');expect(rejected.writes).toEqual({});
    const scope=createHmiScriptScope();scope.active=false;expect(run('return [1].map(value=>value);',{globalScope:scope}).error).toContain("non e' piu' attivo");
  });
  it('limita anche l’ispezione di callback molto annidate e ripristina il budget dopo un errore',()=>{
    const source='return [1]'+'.map(value=>value)'.repeat(80)+';';expect(inspectHmiScript(source).error).toContain('Ispezione dello script interrotta');expect(run('return [1].map(value=>value+1).join(",");').returned).toBe('2');
  });
  it('esegue le stesse callback nel modulo Runtime generato',()=>{
    const exported:Record<string,any>={};new Function('exports',transpileModule(hmiScriptRuntimeModuleSource(),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(exported);
    for(const source of parity){const result=exported.executeHmiScript(compile(source),{},{maxSteps:20000});expect(result.error,source).toBeUndefined();expect(result.returned,source).toEqual(new Function(source)());}
  });
});
