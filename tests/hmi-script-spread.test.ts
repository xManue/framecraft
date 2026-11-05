import { describe, expect, it, vi } from 'vitest';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { executeHmiScript, executeHmiScriptAsync, hmiScriptRuntimeModuleSource, inspectHmiScript, type HmiScriptTransport } from '../src/core/hmiScript';
import { createHmiScriptContextManager, parseHmiScriptCatalog } from '../src/core/hmiScriptModules';
const compile = (source: string, options: Parameters<typeof executeHmiScript>[2] = {}) => {
  const inspected = inspectHmiScript(source, options.functions, undefined, [], options.variables);
  expect(inspected.error).toBeUndefined();
  return inspected.program!;
};
const parity = [
  'return JSON.stringify([0,...[1,2],3,...[],4]);',
  'return JSON.stringify([..."A😀B"]);',
  'return JSON.stringify([...[,,1]].map(value=>typeof value));',
  'const source=[1,2];const copy=[...source];copy[0]=9;return JSON.stringify([source,copy]);',
  'const nested={value:1};const copy=[...[nested]];copy[0].value=7;return nested.value;',
  'return JSON.stringify({...{a:1,b:2},a:3,...{c:4,b:5}});',
  'return JSON.stringify({...null,...undefined,...true,...4,...function(){}});',
  'return JSON.stringify({..."A😀B"});',
  'return JSON.stringify({...[,1,undefined]});',
  'const source={value:1};const copy={...source};copy.value=4;return source.value;',
  'const nested={value:1};const copy={...{nested:nested}};copy.nested.value=7;return nested.value;',
  'function add(a,b,c){return a+b+c;}return add(1,...[2],...[3]);',
  'function read(a,b){return JSON.stringify([typeof a,b]);}return read(...[,4]);',
  'function read(a,b){return a+b;}return read(..."ab");',
  'const obj={base:4,read(a,b){return this.base+a+b;}};return obj.read(...[2,3]);',
  'function read(a,b){return this.base+a+b;}return read.call(...[{base:4},2,3]);',
  'function read(a,b){return this.base+a+b;}return read.bind(...[{base:4},2])(...[3]);',
  'const values=[3];values.unshift(...[1,2]);values.push(...[4,5]);return values.join(",");',
  'return [1,2].map(...[function(value){return value*this.factor;},{factor:3}]).join(",");',
  'return Math.max(...[1,7,3]);',
  'return JSON.stringify(...[{value:4}]);',
  'return Object.values(...[{a:1,b:2}]).join();',
  'return String(...[]);',
  'return JSON.stringify([Boolean(...[]),Number(...[])]);',
  'function sum(start,...values){return values.reduce((sum,value)=>sum+value,start);}return sum(...[1,2,3]);',
  'function read(...values){return values.join(",");}return read(..."ab",3);',
  'const read=(...values)=>values.length;return read();',
  'function read(a,...values){return JSON.stringify([read.length,values]);}return read(1,2,3);',
  'const obj={base:4,read(...values){return this.base+values.reduce((sum,value)=>sum+value,0);}};return obj.read(...[2,3]);',
  'function factory(...values){return ()=>values.join(",");}return factory(...[1,2])();',
  'const fn=(value,...rest)=>JSON.stringify(rest);return [1].map(fn).join();',
  'let sequence="";function value(n){sequence=sequence+n;return [n];}function collect(...values){return values.join(",");}const result=collect(...value(1),...value(2));return sequence+":"+result;',
];
describe('IR 6 spread and rest', () => {
  it.each(parity)('matches JavaScript: %s', source => {
    const expected = Function('"use strict";'+source)();
    const result = executeHmiScript(compile(source), {});
    expect(result.error).toBeUndefined();
    expect(result.returned).toEqual(expected);
  });
  it.each(['return [...null];','return [...undefined];','return [...4];','return [...{length:1,0:4}];','function read(){}read(...{});'])('rejects non-iterable spreads: %s', source => {
    expect(executeHmiScript(compile(source), {}).error).toContain('array o una stringa');
  });
  it('keeps all read/write dependencies through copies, rest, closures and callable methods', () => {
    const source = "function use(...tags){const copy=[...tags];copy[0].Write(copy[1].Read());}const values={...{tags:[Tags('Output'),Tags('Input')]}};use(...values.tags);";
    const inspected = inspectHmiScript(source);
    expect(inspected.error).toBeUndefined();
    expect(inspected.tagsRead).toContain('Input');
    expect(inspected.tagsWritten).toContain('Output');
    const result = executeHmiScript(inspected.program!, {Input:'7',Output:'0'});
    expect(result.error).toBeUndefined();expect(result.writes).toEqual({Output:'7'});
  });
  it('keeps nested aliases visible to dependency analysis after object copying', () => {
    const inspected = inspectHmiScript("const source={nested:{tag:Tags('Before')}};const copy={...source};copy.nested.tag=Tags('After');source.nested.tag.Write(1);");
    expect(inspected.error).toBeUndefined();expect(inspected.tagsWritten).toContain('After');
  });
  it('retains dependencies through uncertain copy overrides and mutated spread arrays', () => {
    const branches=inspectHmiScript("const old={tag:Tags('Original')};const value=Tags('Choice').Read()?{tag:Tags('First')}:{other:1};const copy={...old,...value};copy.tag.Write(1);");
    expect(branches.error).toBeUndefined();expect(branches.tagsWritten).toEqual(expect.arrayContaining(['Original','First']));
    const mutations=inspectHmiScript("const values=[Tags('Old')];values.push(...[Tags('New')]);function use(...tags){tags[Tags('Index').Read()].Write(1);}use(...values);");
    expect(mutations.error).toBeUndefined();expect(mutations.tagsWritten).toEqual(expect.arrayContaining(['Old','New']));expect(mutations.tagsRead).toContain('Index');
  });
  it('keeps tag dependencies when copied array properties or TagSet arguments expand', () => {
    const copied=inspectHmiScript("const values=[Tags('Old')];values.push(Tags('New'));const copy={...values};copy[1].Write(1);Object.values(copy)[Tags('Index').Read()].Read();");
    expect(copied.error).toBeUndefined();expect(copied.tagsWritten).toContain('New');expect(copied.tagsRead).toEqual(expect.arrayContaining(['Old','New','Index']));
    const set=inspectHmiScript("const set=Tags.CreateTagSet(['Speed','Other']);set(...[], 'Speed').Write(4);");
    expect(set.error).toBeUndefined();expect(set.tagsWritten).toContain('Speed');
    const result=executeHmiScript(set.program!,{Speed:'0',Other:'0'});expect(result.error).toBeUndefined();expect(result.writes).toEqual({Speed:'4'});
  });
  it('enforces expansion limits and rejects host objects without copying capabilities', () => {
    const limits = "const values=JSON.parse('["+Array.from({length:700},()=>1).join(',')+"]');return [...values,...values];";
    expect(executeHmiScript(compile(limits), {}, {maxSteps:20000}).error).toContain('1024');
    expect(executeHmiScript(compile("return {...Tags('Value')};"), {}).error).toContain('API HMI');
    expect(inspectHmiScript('return {...process};').error).toContain('API host');
    expect(inspectHmiScript('return {...{constructor:1}};').error).toBeDefined();
  });
  it('suspends transport exactly once without repeating spread arguments', async () => {
    let complete!: (value: {value:string;status:{qualityKnown:boolean;timeStamp:number}}) => void;
    const read = vi.fn<HmiScriptTransport['read']>(() => new Promise(resolve => { complete = resolve; }));
    const driver: HmiScriptTransport = { read, write: vi.fn<HmiScriptTransport['write']>(async request => ({tag:request.tag,outcome:'delivered',delivery:'broker-ack',plcConfirmed:false})) };
    const program=compile("let count=0;function argumentsForRead(){count=count+1;return [Tags('Value')];}function read(...tags){return tags[0].Read();}const value=read(...argumentsForRead());return value+count;");
    const pending=executeHmiScriptAsync(program,{Value:'0'},{transport:driver});
    await vi.waitFor(()=>expect(read).toHaveBeenCalledOnce());
    complete({value:'7',status:{qualityKnown:false,timeStamp:1}});
    const result=await pending;
    expect(result.error).toBeUndefined();expect(result.returned).toBe(8);expect(read).toHaveBeenCalledOnce();
  });
  it('works in persisted modules and the server Scheduler context', () => {
    const catalog = parseHmiScriptCatalog({globalModules:[{name:'Data',alias:'Data',globalDefinition:{source:'const options={base:2};'},functions:[{name:'Sum',parameters:['values'],source:'const copy=[...values];return copy.reduce((total,value)=>total+value,options.base);'}]}]});
    const manager=createHmiScriptContextManager();const options=manager.options(catalog,undefined,'scheduler');
    const result=executeHmiScript(compile('return Modules.Data.Sum(...[[3,4]]);',options),{},options);
    expect(result.error).toBeUndefined();expect(result.returned).toBe(9);manager.dispose();
  });
  it('exports a self-contained VM with IR 1 through 6 readers', () => {
    const source=hmiScriptRuntimeModuleSource();const exports: Record<string, any>={};
    Function('exports',transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(exports);
    const program=compile('function read(...values){return [...values].join(",");}return read(...[1,2]);');
    expect(program.version).toBe(9);expect(exports.executeHmiScript(program,{}).returned).toBe('1,2');
    for(const version of [1,2,3,4,5,6]) expect(exports.executeHmiScript({version,statements:[{kind:'return',value:{kind:'literal',value:7}}]},{}).returned).toBe(7);
    expect(exports.inspectHmiScriptProgram(program).error).toBeUndefined();
  });
});
