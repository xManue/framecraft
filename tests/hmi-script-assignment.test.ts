import {describe,expect,it,vi} from 'vitest';
import {ModuleKind,ScriptTarget,transpileModule} from 'typescript';
import {executeHmiScript,executeHmiScriptAsync,hmiScriptRuntimeModuleSource,inspectHmiScript,type HmiScriptTransport,type HmiScriptExecutionOptions,type HmiScriptScreenItemManager} from '../src/core/hmiScript';
import {createHmiScriptContextManager,parseHmiScriptCatalog} from '../src/core/hmiScriptModules';
const compile=(source:string,options:HmiScriptExecutionOptions={})=>{const inspected=inspectHmiScript(source,options.functions,undefined,[],options.variables);expect(inspected.error).toBeUndefined();return inspected.program!;};
const parity=[
 'let first,second;[first,second]=[1,2];return first+second;',
 'let first=1,second=2;[first,second]=[second,first];return JSON.stringify([first,second]);',
 'let value,rest;({value,...rest}={value:1,other:2});return JSON.stringify([value,rest]);',
 'let value;({data:[value=4]=[]}={});return value;',
 'const target={};[target.value=4]=[];return target.value;',
 'let value,rest;[value,...rest]="😀xy";return JSON.stringify([value,rest]);',
 'const target={};[...target.values]=[1,2,3];return target.values.join(",");',
 'const target={};({...target.value}={a:1,b:2});return JSON.stringify(target.value);',
 'let value;const source=[1,2];const result=([value]=source);return result===source;',
 'let value;const source={a:1};const result=({a:value}=source);return result===source;',
 'let first,second;return first=second=4;',
 'const object={};return object.value=4;',
 'let value;return JSON.stringify([value=1,value=2,value]);',
 'let value;const source={nested:{value:1}};({nested:value}=source);value.value=4;return source.nested.value;',
 'const source=[1],target={};function get(){source[0]=2;return target;}[get().value]=source;return target.value;',
 'const source={value:1},target={};function get(){source.value=2;return target;}({value:get().value}=source);return target.value;',
 'const source={a:1},target={};function get(){source.b=2;return target;}({...get().rest}=source);return JSON.stringify(target.rest);',
 'const source=[1],target={};function get(){source.push(2);return target;}[...get().rest]=source;return target.rest.join(",");',
 'let order="";const object={};function get(){order=order+"T";return object;}function key(){order=order+"K";return "value";}function rhs(){order=order+"R";return 4;}get()[key()]=rhs();return order+object.value;',
 'let order="";const object={};function get(){order=order+"T";return object;}function fallback(){order=order+"F";return 4;}({value:get().value=fallback()}={});return order+object.value;',
 'let count=0;function input(){count=count+1;return [4];}let value;[value]=input();return count+value;',
 'let value;const result=(()=>[value]=[4])();return JSON.stringify([value,result]);',
 'let value;const name=()=>4;value=name;return value();',
 'let read;read=()=>4;return read.name;',
 'let count=0;const value=1;function rhs(){count=count+1;return 4;}try{value=rhs();}catch(error){}return count;',
 'try{throw 4;}catch(value){return value;}',
 'try{throw 0;}catch(value){return value;}',
 'try{throw false;}catch(value){return value;}',
 'try{throw null;}catch(value){return value;}',
 'try{throw undefined;}catch(value){return typeof value;}',
 'try{throw "";}catch(value){return value;}',
 'try{throw {value:4,other:2};}catch({value,...rest}){return value+rest.other;}',
 'try{throw [,2,3];}catch([first=4,...rest]){return first+rest.length;}',
 'try{throw "😀xy";}catch([first,...rest]){return JSON.stringify([first,rest]);}',
 'const nested={value:1};try{throw {nested};}catch({nested:alias}){alias.value=4;}return nested.value;',
 'function fail(){throw {value:4};}try{fail();}catch({value}){return value;}',
 'function inner(){throw [1,2];}function outer(){inner();}try{outer();}catch([first,second]){return first+second;}',
 'try{try{throw {value:4};}catch(value){throw value;}}catch({value}){return value;}',
 'try{throw 1;}finally{return 4;}',
 'function fail(){try{return 1;}finally{throw 4;}}try{fail();}catch(value){return value;}',
 'let result=0;try{throw {value:4};}catch({value}){result=value;}finally{result=result+1;}return result;',
 'function fail(){throw ()=>4;}try{fail();}catch(read){return read();}',
 'let value=1;try{throw {value:4};}catch({value}){}return value;',
 'try{throw {};}catch({value=4}){return value;}',
 'try{throw 1;}catch{ return 4; }',
];
describe('IR 8 assignment and caught values',()=>{
 it.each(parity)('matches native JavaScript: %s',source=>{const expected=Function('"use strict";'+source)();const result=executeHmiScript(compile(source),{});expect(result.error).toBeUndefined();expect(result.returned).toEqual(expected);});
 it.each(['const value=1;[value]=[2];','let value;[value]=null;','let value;({value}=null);','try{throw null;}catch({value}){}','try{throw [undefined];}catch([value=value]){}'])('keeps assignment/catch errors: %s',source=>{expect(()=>Function('"use strict";'+source)()).toThrow();expect(executeHmiScript(compile(source),{}).error).toBeTruthy();});
 it('keeps aliases and read/write dependencies through assignment and thrown references',()=>{
  const source="let tag;({tag}={tag:Tags('Output')});function fail(){throw {tag:tag,input:Tags('Input')};}try{fail();}catch({tag:destination,input}){destination.Write(input.Read());}";
  const inspected=inspectHmiScript(source);expect(inspected.error).toBeUndefined();expect(inspected.tagsWritten).toContain('Output');expect(inspected.tagsRead).toContain('Input');const result=executeHmiScript(inspected.program!,{Input:'7',Output:'0'});expect(result.error).toBeUndefined();expect(result.writes).toEqual({Output:'7'});
 });
 it('shares the RHS reference after assignment expressions',()=>{
  const inspected=inspectHmiScript("let first,second;first=(second={nested:{tag:Tags('Old')}});second.nested.tag=Tags('New');first.nested.tag.Write(1);");expect(inspected.error).toBeUndefined();expect(inspected.tagsWritten).toContain('New');
 });
 it('preserves thrown payloads through imported module calls',()=>{
  const catalog=parseHmiScriptCatalog({globalModules:[{name:'Faults',alias:'Faults',functions:[{name:'Fail',parameters:[],source:"throw {tag:Tags('Output')};"}]}]});const manager=createHmiScriptContextManager(),options=manager.options(catalog,undefined,'scheduler');
  const source="try{Modules.Faults.Fail();}catch({tag}){tag.Write(4);}";const inspected=inspectHmiScript(source,options.functions,undefined,[],options.variables);expect(inspected.error).toBeUndefined();expect(inspected.tagsWritten).toContain('Output');expect(executeHmiScript(inspected.program!,{Output:'0'},options).writes).toEqual({Output:'4'});manager.dispose();
 });
 it('keeps reference dependencies across a returning module and a throwing module',()=>{
  const catalog=parseHmiScriptCatalog({globalModules:[{name:'Values',alias:'Values',functions:[{name:'Tag',parameters:[],source:"return Tags('Output');"}]},{name:'Faults',alias:'Faults',functions:[{name:'Fail',parameters:[],source:'throw {tag:Modules.Values.Tag()};'}]}]});const manager=createHmiScriptContextManager(),options=manager.options(catalog,undefined,'scheduler');
  const source="try{Modules.Faults.Fail();}catch({tag}){tag.Write(4);}";const inspected=inspectHmiScript(source,options.functions,undefined,[],options.variables);expect(inspected.error).toBeUndefined();expect(inspected.tagsWritten).toContain('Output');expect(executeHmiScript(inspected.program!,{Output:'0'},options).writes).toEqual({Output:'4'});manager.dispose();
 });
 it('checks legacy numeric/string HMI error contracts',async()=>{
  const stringError=executeHmiScript(compile('try{return missing;}catch(error){return typeof error;}'),{});expect(stringError.returned).toBe('string');
  const transport:HmiScriptTransport={read:vi.fn(async()=>({value:'0',status:{qualityCode:192}})),write:vi.fn<HmiScriptTransport['write']>(async request=>({tag:request.tag,outcome:'rejected',plcConfirmed:false,error:'Denied'}))};
  const numeric=await executeHmiScriptAsync(compile("const set=Tags.CreateTagSet(['Output']);set('Output').Value=4;try{await set.WriteAsync(0);}catch(error){return typeof error;}"),{Output:'0'},{transport});expect(numeric.error).toBeUndefined();expect(numeric.returned).toBe('number');expect(transport.write).toHaveBeenCalledOnce();
 });
 it('evaluates assignment targets and transport reads once across suspension',async()=>{
  let finish!:(value:{value:string;status:{qualityCode:number}})=>void;const read=vi.fn<HmiScriptTransport['read']>(()=>new Promise(resolve=>{finish=resolve;}));const transport:HmiScriptTransport={read,write:vi.fn<HmiScriptTransport['write']>(async request=>({tag:request.tag,outcome:'delivered',delivery:'broker-ack',plcConfirmed:false}))};
  const source="let count=0;const target={};function get(){count=count+1;return target;}[get().value=Tags('Input').Read()]=[];return target.value+count;";
  const pending=executeHmiScriptAsync(compile(source),{}, {transport});await vi.waitFor(()=>expect(read).toHaveBeenCalledOnce());finish({value:'7',status:{qualityCode:192}});const result=await pending;expect(result.error).toBeUndefined();expect(result.returned).toBe(8);expect(read).toHaveBeenCalledOnce();
 });
 it('delegates graphical targets to their guarded setter and stops on denial',()=>{
  const set=vi.fn();const screenItems:HmiScriptScreenItemManager={resolve:(_scope,name)=>({screenItemId:name??'screen'}),get:()=>null,set,propertyFlashing:()=>false};
  const program=compile("const element=Screen.Items('Label');[element.Text,element.Left]=['Ready',12];",{screenItems});const result=executeHmiScript(program,{}, {screenItems});expect(result.error).toBeUndefined();expect(set.mock.calls.map(call=>call.slice(1))).toEqual([['Text','Ready'],['Left',12]]);
  set.mockClear();set.mockImplementation(()=>{throw new Error('Accesso negato');});const denied=executeHmiScript(program,{}, {screenItems});expect(denied.error).toContain('Accesso negato');expect(set).toHaveBeenCalledOnce();expect(denied.writes).toEqual({});
 });
 it('retains TagSet scalar/range validation during patterned staging',()=>{
  const program=compile("const set=Tags.CreateTagSet(['Output']);[set('Output').Value,set('Output').QualityCode]=[4,-1];");const result=executeHmiScript(program,{Output:'0'});expect(result.error).toContain('UInt32');expect(result.writes).toEqual({});
 });
 it('keeps global definitions passive and protects imported bindings and prototypes',()=>{
  const catalog=parseHmiScriptCatalog({globalModules:[{name:'State',alias:'State',globalDefinition:{source:'let target;const value=(target=4);'},functions:[]}]});expect(catalog.globalModules[0].globalDefinition?.error).toBeTruthy();
  expect(inspectHmiScript('({value:Modules.State.value}={value:4});').error).toContain('sola lettura');expect(inspectHmiScript('const value={};({field:value.constructor}={field:4});').error).toBeTruthy();
 });
 it.each(['throw 0;','throw null;','throw false;','throw undefined;',"throw '';","throw {secret:'PRIVATE_MARKER'};"])('reports uncaught values without exposing internal payloads: %s',source=>{const result=executeHmiScript(compile(source),{});expect(result.error).toBeTruthy();expect(result.error).not.toContain('PRIVATE_MARKER');expect(result).not.toHaveProperty('thrownReference');});
 it('exports assignment and catch semantics to the standalone VM',()=>{
  const exports:Record<string,any>={};Function('exports',transpileModule(hmiScriptRuntimeModuleSource(),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(exports);const program=compile('let value;try{[value]=[4];throw {value};}catch({value:result}){return result;}');expect(program.version).toBe(8);expect(exports.executeHmiScript(program,{}).returned).toBe(4);expect(exports.inspectHmiScriptProgram(program).error).toBeUndefined();
 });
});
