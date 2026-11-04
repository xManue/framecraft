import {describe,expect,it,vi} from 'vitest';
import {ModuleKind,ScriptTarget,transpileModule} from 'typescript';
import {executeHmiScript,executeHmiScriptAsync,hmiScriptRuntimeModuleSource,inspectHmiScript,type HmiScriptTransport,type HmiScriptProgram} from '../src/core/hmiScript';
import {createHmiScriptContextManager,parseHmiScriptCatalog,serializeHmiScriptCatalog} from '../src/core/hmiScriptModules';
const compile=(source:string,options:Parameters<typeof executeHmiScript>[2]={})=>{const inspected=inspectHmiScript(source,options.functions,undefined,[],options.variables);expect(inspected.error).toBeUndefined();return inspected.program!;};
const parity=[
 'const [first,,third]=[1,2,3];return first+third;',
 'const [first=3,second=4]=[,undefined];return first+second;',
 'const [first=3]=[null];return first;',
 'const [first,...rest]=[1,2,3];return JSON.stringify([first,rest]);',
 'const [first,...[second,third]]=[1,2,3];return first+second+third;',
 'const [...{length}]=[1,2,3];return length;',
 'const [first,{second,...rest}]=[1,{second:2,third:3}];return JSON.stringify([first,second,rest]);',
 'const [first,second,...rest]="😀xy";return JSON.stringify([first,second,rest]);',
 'const {a:first,b:second=4}={a:1};return first+second;',
 'const {a:{b=4}={}}={};return b;',
 'const {a,...rest}={a:1,b:2,c:3};return JSON.stringify(rest);',
 'const nested={value:1};const {skip,...rest}={skip:0,nested:nested};rest.nested.value=4;return nested.value;',
 'const {["a"]:value}={a:4};return value;',
 'const {length,0:first,...rest}="😀x";return JSON.stringify([length,first,rest]);',
 'const {value=3}=4;return value;',
 'const {}=true;return 1;',
 'const [first=1,second=first+1]=[];return second;',
 'let value=1;{const [value]=[4];}return value;',
 'function read(){if(true){var [value]=[4];}return value;}return read();',
 'var [value]=[1];var [value]=[4];return value;',
 'let count=0;function source(){count=count+1;return {value:4};}const {value}=source();return count+value;',
 'let order="";function key(){order=order+"K";return "value";}function fallback(){order=order+"F";return 4;}const {[key()]:value=fallback()}={};return order+value;',
 'const values=[undefined];const [first=values.push(2),second]=values;return JSON.stringify([first,second]);',
 'const values=[];const [first=values.push(2,3),second]=values;return JSON.stringify([first,typeof second]);',
 'function read(value=4){return value;}return JSON.stringify([read(),read(undefined),read(null),read(0)]);',
 'function read(first=1,second=first+1){return second;}return read();',
 'function read({value=4}={}){return value;}return read();',
 'function read([first,...rest]=[1,2,3]){return JSON.stringify([first,rest]);}return read();',
 'const read=({value},...rest)=>value+rest.length;return read({value:4},5,6);',
 'function read(...{length}){return length;}return read(1,2,3);',
 'const object={base:4,read({value=2}={}){return this.base+value;}};return object.read();',
 'function read(value=this.base){return value;}return read.call({base:4});',
 'function read(value=()=>this.base){return value();}return read.call({base:4});',
 'const outer=4;function read(value=outer){var outer=99;return value;}return read();',
 'function read(value=1,get=()=>value){var value=2;return JSON.stringify([value,get()]);}return read();',
 'function read(value=1,get=()=>value){value=2;return get();}return read();',
 'function read(value=1){var value;return value;}return read();',
 'function read(value=1,get=()=>value){var [value]=[2];return get();}return read();',
 'const helper=()=>4;function read(value=helper()){function helper(){return 99;}return value;}return read();',
 'function read(first,{value}= {},last=1,...rest){return JSON.stringify([read.length,value,last,rest]);}return read(0,{value:2},undefined,3);',
 'function read(first=1,second){return first;}const bound=read.bind(null);return JSON.stringify([read.length,bound.length,bound()]);',
 'function read(first,second=1){return first+second;}const bound=read.bind(null,2);return JSON.stringify([bound.length,bound()]);',
 'let count=0;function fallback(){count=count+1;return 4;}function read(value=fallback()){return value;}read(null);read(0);return count;',
 'function make({value}= {value:4}){return ()=>value;}return make()();',
 'const {read=()=>7}={};return JSON.stringify([read.name,read()]);',
 'return [undefined,2].map((value=4)=>value).join(",");',
];
describe('IR 7 binding patterns and parameter initialization',()=>{
 it.each(parity)('matches native JavaScript: %s',source=>{const expected=Function('"use strict";'+source)();const result=executeHmiScript(compile(source),{});expect(result.error).toBeUndefined();expect(result.returned).toEqual(expected);});
 it.each(['const [value]=null;','const []=4;','const {}=null;','const {}=undefined;','const [value=value]=[];','const [first=second,second=1]=[];','function read(first=second,second=1){return first;}return read();','function read({value}){return value;}return read();','const [value]=[1];value=2;'])('preserves errors and TDZ: %s',source=>{expect(()=>Function('"use strict";'+source)()).toThrow();expect(executeHmiScript(compile(source),{}).error).toBeTruthy();});
 it('retains tag dependencies through defaults, nested binding/rest and aliases',()=>{
  const source="const nested={tag:Tags('Old')};const {skip,...copy}={skip:0,nested:nested};copy.nested.tag=Tags('New');function write({tag=Tags('Default')}={},...values){tag.Write(values[0]);}const [value=Tags('Input').Read()]=[];write({tag:nested.tag},value);";
  const inspected=inspectHmiScript(source);expect(inspected.error).toBeUndefined();expect(inspected.tagsWritten).toContain('New');expect(inspected.tagsRead).toContain('Input');
  const result=executeHmiScript(inspected.program!,{Input:'7',Old:'0',New:'0'});expect(result.error).toBeUndefined();expect(result.writes).toEqual({New:'7'});
 });
 it('evaluates a transport-backed default once across suspension',async()=>{
  let resolveRead!:(value:{value:string;status:{qualityCode:number}})=>void;
  const read=vi.fn<HmiScriptTransport['read']>(()=>new Promise(resolve=>{resolveRead=resolve;}));
  const driver:HmiScriptTransport={read,write:vi.fn<HmiScriptTransport['write']>(async request=>({tag:request.tag,outcome:'delivered',delivery:'broker-ack',plcConfirmed:false}))};
  const program=compile("let count=0;function load(){count=count+1;return Tags('Input').Read();}function value(first=load()){return first+count;}return value();");
  const pending=executeHmiScriptAsync(program,{}, {transport:driver});await vi.waitFor(()=>expect(read).toHaveBeenCalledOnce());resolveRead({value:'7',status:{qualityCode:192}});const result=await pending;expect(result.error).toBeUndefined();expect(result.returned).toBe(8);expect(read).toHaveBeenCalledOnce();
 });
 it('persists exported pattern bindings and shares their values with module functions',()=>{
  const catalog=parseHmiScriptCatalog({globalModules:[{name:'Values',alias:'Values',globalDefinition:{source:'export const {value=4,...rest}={other:7};'},functions:[{name:'Read',parameters:[],source:'function get({input=value}={}){return input+rest.other;}return get();'}]}]});
  const saved=parseHmiScriptCatalog(JSON.parse(serializeHmiScriptCatalog(catalog)));const manager=createHmiScriptContextManager(),options=manager.options(saved,undefined,'scheduler');const result=executeHmiScript(compile('return Modules.Values.Read();',options),{},options);expect(result.error).toBeUndefined();expect(result.returned).toBe(11);manager.dispose();
 });
 it('keeps global declarations passive and rejects reserved binding names',()=>{
  for(const source of ['const {value=call()}={};','const {alias:Tags}={alias:1};']){
   const catalog=parseHmiScriptCatalog({globalModules:[{name:'Unsafe',alias:'Unsafe',globalDefinition:{source},functions:[]}]});expect(catalog.globalModules[0].globalDefinition?.error).toBeTruthy();
  }
 });
 it('bounds rest copies and prevents host objects from providing binding data',()=>{
  expect(executeHmiScript(compile('const [...rest]="'+ 'x'.repeat(1100) +'";return rest.length;'),{}, {maxSteps:20000}).error).toContain('1024');
  expect(executeHmiScript(compile("const {value}=Tags('Value');return value;"),{}).error).toContain('API HMI');
  expect(inspectHmiScript('const {constructor}= {constructor:1};').error).toBeTruthy();
 });
 it('reports unsupported assignment and catch patterns before execution',()=>{
  expect(inspectHmiScript('let value;[value]=[1];').error).toBeTruthy();
  expect(inspectHmiScript('try{return missing;}catch({message}){return message;}').error).toContain('catch');
 });
 it('keeps an authentic IR 6 rest function executable',()=>{
  const legacy:HmiScriptProgram={version:6,statements:[{kind:'function-declare',name:'read',value:{kind:'function-value',parameters:[],rest:'values',program:{version:6,statements:[{kind:'return',value:{kind:'member',object:{kind:'local',name:'values'},key:{kind:'literal',value:'length'}}}]}}},{kind:'return',value:{kind:'invoke',callee:{kind:'local',name:'read'},arguments:[{kind:'spread',value:{kind:'array',items:[{kind:'literal',value:1},{kind:'literal',value:2}]}}]}}]};
  expect(executeHmiScript(legacy,{})).toMatchObject({returned:2});
 });
 it('exports self-contained parameter and pattern semantics for browser and Node',()=>{
  const exports:Record<string,any>={};Function('exports',transpileModule(hmiScriptRuntimeModuleSource(),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(exports);
  const program=compile('function read({value=4}={},...rest){const [first=1]=rest;return value+first;}return read();');expect(program.version).toBe(7);expect(exports.executeHmiScript(program,{}).returned).toBe(5);expect(exports.inspectHmiScriptProgram(program).error).toBeUndefined();
 });
});
