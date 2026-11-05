import {describe,expect,it,vi} from 'vitest';
import {ModuleKind,ScriptTarget,transpileModule} from 'typescript';
import {executeHmiScript,executeHmiScriptAsync,hmiScriptRuntimeModuleSource,inspectHmiScript,type HmiScriptExecutionOptions,type HmiScriptTransport} from '../src/core/hmiScript';
import {createHmiScriptContextManager,parseHmiScriptCatalog} from '../src/core/hmiScriptModules';
const compile=(source:string,options:HmiScriptExecutionOptions={})=>{const result=inspectHmiScript(source,options.functions,undefined,[],options.variables);expect(result.error).toBeUndefined();return result.program!;};
const parity=[
 'return new Error("m")+"!";',
 'return "Error: m"==new Error("m");',
 'return new Error("m")!=null;',
 'const error=new Error("m");error.toString=()=>"custom";return String(error);',
 'const error=new Error("m");error.valueOf=()=>4;return error+1;',
 'const error=new Error("m");error.toString=()=>4;return new Error(error).message;',
 'const error=new Error("m");error.toString=()=>({});error.valueOf=()=>7;return String(error);',
 'return new Error("Motor").message;',
 'return Error("Motor").name;',
 'return new TypeError("Motor").toString();',
 'return String(new RangeError("Speed"));',
 'return new Error().message;',
 'return new Error(undefined).message;',
 'return new Error(null).message;',
 'return new Error(42).message;',
 'return new Error(false).message;',
 'return new Error("m",{cause:{value:4}}).cause.value;',
 'return new Error("m",{cause:0}).cause;',
 'return typeof new Error("m",{cause:undefined}).cause;',
 'return JSON.stringify(new Error("m",{cause:{value:4}}));',
 'const error=new Error("m");error.code=7;return JSON.stringify(error);',
 'const error=new Error("m");error.name="MotorFault";return JSON.stringify([String(error),Object.keys(error)]);',
 'const error=new Error();error.message="m";return JSON.stringify(Object.keys(error));',
 'const error=new Error("m");error.message="changed";return JSON.stringify(Object.keys(error));',
 'const error=new Error("m");error.name="";return error.toString();',
 'const error=new Error("");error.name="MotorFault";return error.toString();',
 'const error=new Error("m");error.name=undefined;error.message=undefined;return error.toString();',
 'const error=new Error("m");error.name=null;error.message=0;return error.toString();',
 'const error=new Error("m",{cause:4});return JSON.stringify({...error});',
 'const error=new Error("m",{cause:4});const {cause,...rest}=error;return JSON.stringify([cause,rest]);',
 'const error=new TypeError("m");return JSON.stringify([error instanceof Error,error instanceof TypeError,error instanceof RangeError]);',
 'return JSON.stringify([({name:"TypeError"}) instanceof TypeError,null instanceof Error,4 instanceof Error]);',
 'return JSON.stringify([Error===Error,Error===TypeError,typeof Error,Error.name,Error.length,AggregateError.length]);',
 'const E=TypeError;return new E("m") instanceof Error;',
 'const E=TypeError.bind(null,"m");return JSON.stringify([new E().message,new E() instanceof E]);',
 'const E=TypeError;return E.call(null,"m").toString();',
 'return RangeError.apply(null,["m"]).toString();',
 'const stringify=new Error().toString;return stringify.call({name:"MotorFault",message:"Stopped"});',
 'const stringify=new Error().toString;return JSON.stringify([stringify.length,stringify.name]);',
 'try{throw new TypeError("Motor",{cause:4});}catch(error){return JSON.stringify([error.name,error.message,error.cause,error instanceof Error]);}',
 'function fail(){throw new RangeError("Motor");}try{fail();}catch(error){return error instanceof RangeError;}',
 'try{try{throw new Error("m");}catch(error){error.code=4;throw error;}}catch({message,code}){return message+code;}',
 'try{throw new Error("m");}finally{return 4;}',
 'return JSON.stringify(new AggregateError([new Error("a"),4],"combined").errors);',
 'return new AggregateError([1,2],"combined",{cause:4}).cause;',
 'return new AggregateError("😀x").errors.length;',
 'return JSON.stringify(Object.keys(new AggregateError([1],"m",{cause:4})));',
 'const error=new AggregateError([1,2]);return JSON.stringify([error instanceof Error,error instanceof AggregateError,error instanceof TypeError]);',
 'const original=[1,2];const error=new AggregateError(original);original.push(3);return error.errors.length;',
 'try{JSON.parse("[");}catch(error){return JSON.stringify([error instanceof Error,error instanceof SyntaxError,typeof error.message]);}',
 'try{const value=unavailable;}catch(error){return error instanceof ReferenceError;}',
 'try{const error=error;}catch(error){return error instanceof ReferenceError;}',
 'function fail(){JSON.parse("[");}try{fail();}catch(error){return error instanceof SyntaxError;}',
];
describe('IR 9 Error objects in the isolated runtime',()=>{
 it.each(parity)('matches native JavaScript: %s',source=>{const expected=Function('"use strict";'+source)();const result=executeHmiScript(compile(source),{});expect(result.error).toBeUndefined();expect(result.returned).toEqual(expected);});
 it.each(['Error','TypeError','RangeError','ReferenceError','SyntaxError','EvalError','URIError','AggregateError'])('supports the %s constructor',name=>{const argument=name==='AggregateError'?'[],"m"':'"m"';expect(executeHmiScript(compile(`try{throw new ${name}(${argument});}catch(error){return error.name+":"+error.message;}`),{}).returned).toBe(name+':m');});
 it.each(['return new Error().constructor;','return Error.prototype;','return new Error()["__proto__"];','return new Error().toString.constructor;','return new Error().stack.constructor;'])('does not expose host constructors: %s',source=>{const inspected=inspectHmiScript(source);expect(inspected.error??executeHmiScript(inspected.program!,{}).error).toBeTruthy();});
 it.each(['return new Error();','Tags("Output").Write(new Error("m"));','item.Text=new Error("m");','const error=new Error();error.cause=error;','const error=new Error();error.cause={nested:error};'])('preserves scalar and graph boundaries: %s',source=>{const result=executeHmiScript(compile(source),{Output:'0'});expect(result.error).toBeTruthy();expect(result.writes).toEqual({});});
 it('retains cause references and tag dependencies through constructors and imported throws',()=>{
  const catalog=parseHmiScriptCatalog({globalModules:[{name:'Faults',alias:'Faults',functions:[{name:'Fail',parameters:[],source:"throw new Error('Motor',{cause:{input:Tags('Input'),output:Tags('Output')}});"}]}]});const manager=createHmiScriptContextManager(),options=manager.options(catalog,undefined,'scheduler');
  const source="try{Modules.Faults.Fail();}catch(error){if(error instanceof Error){error.cause.output.Write(error.cause.input.Read());}}";
  const inspected=inspectHmiScript(source,options.functions,undefined,[],options.variables);expect(inspected.error).toBeUndefined();expect(inspected.tagsRead).toContain('Input');expect(inspected.tagsWritten).toContain('Output');expect(executeHmiScript(inspected.program!,{Input:'7',Output:'0'},options).writes).toEqual({Output:'7'});manager.dispose();
 });
 it('shares a cause object by reference after construction',()=>{const program=compile("const cause={value:1};const error=new Error('m',{cause});cause.value=4;return error.cause.value;");expect(executeHmiScript(program,{}).returned).toBe(4);});
 it('does not convert HMI numeric faults into JavaScript Error objects',()=>{const program=compile("const set=Tags.CreateTagSet(['Missing']);try{set.Read();}catch(error){return typeof error;}");expect(executeHmiScript(program,{}).returned).toBe('number');});
 it('retains Error objects across asynchronous transport suspension without replay',async()=>{const read=vi.fn(async()=>({value:'7',status:{qualityCode:192}}));const transport={read,write:vi.fn()} as unknown as HmiScriptTransport;const program=compile("const error=new Error('m',{cause:{input:Tags('Input')}});try{throw error;}catch({cause}){return cause.input.Read();}");const result=await executeHmiScriptAsync(program,{}, {transport});expect(result.error).toBeUndefined();expect(result.returned).toBe(7);expect(read).toHaveBeenCalledTimes(1);expect(transport.write).not.toHaveBeenCalled();});
 it('keeps root diagnostics bounded and does not serialize arbitrary causes',()=>{const result=executeHmiScript(compile("throw new TypeError('Motor',{cause:{password:'private-fixture'}});"),{});expect(result.error).toBe('TypeError: Motor');expect(JSON.stringify(result)).not.toContain('private-fixture');expect(result).not.toHaveProperty('thrownReference');});
 it('creates a synthetic script stack without host filesystem paths',()=>{const result=executeHmiScript(compile("return new Error('Motor').stack;"),{});expect(result.returned).toBe('Error: Motor\n    at <hmi-script>');});
 it('honors local constructor shadowing and does not allow arbitrary new functions',()=>{expect(executeHmiScript(compile('function Error(value){return {message:value};}return Error("local").message;'),{}).returned).toBe('local');expect(executeHmiScript(compile('function Error(){}return new Error();'),{}).error).toContain('costruttori Error');});
 it('requires IR 9 for new nodes while retaining legacy caught strings',()=>{const program=compile('return new Error("m").message;');expect(program.version).toBe(9);expect(executeHmiScript({...program,version:8},{}).error).toContain('IR 9');const old=compile('try{JSON.parse("[");}catch(error){return typeof error;}');expect(executeHmiScript({...old,version:8},{}).returned).toBe('string');});
 it.each(["String(error);","const text=error+'!';","const second=new Error(error);","error.toString();"])("keeps dependencies inside custom Error conversions: %s",operation=>{
  const inspected=inspectHmiScript("const error=new Error('m',{cause:{input:Tags('Input'),output:Tags('Output')}});error.toString=function(){this.cause.output.Write(this.cause.input.Read());return 'Motor';};"+operation);
  expect(inspected.error).toBeUndefined();expect(inspected.tagsRead).toContain('Input');expect(inspected.tagsWritten).toContain('Output');expect(executeHmiScript(inspected.program!,{Input:'7',Output:'0'}).writes).toEqual({Output:'7'});
 });
 it('keeps aliases and mutations of Error causes in dependency analysis',()=>{
  const inspected=inspectHmiScript("const cause={tag:Tags('Old')};const error=new Error('m',{cause});cause.tag=Tags('New');error.cause.tag.Write(4);");expect(inspected.error).toBeUndefined();expect(inspected.tagsWritten).toContain('New');expect(executeHmiScript(inspected.program!,{New:'0',Old:'0'}).writes).toEqual({New:'4'});
 });
 it('does not allow a custom Error conversion to become a PLC reference',()=>{
  const result=executeHmiScript(compile("const error=new Error('m');error.toString=()=>Tags('Output');return String(error);"),{Output:'0'});expect(result.error).toBeTruthy();expect(result.writes).toEqual({});
 });
 it('bounds host exceptions before importing them into a nested Error catch',async()=>{
  const transport={read:vi.fn(async()=>{throw new Error('x'.repeat(25000));}),write:vi.fn()} as unknown as HmiScriptTransport;
  const result=await executeHmiScriptAsync(compile("function read(){return Tags('Input').Read();}try{read();}catch(error){return error.message.length;}"),{}, {transport});expect(result.error).toBeUndefined();expect(result.returned).toBe(1000);expect(transport.read).toHaveBeenCalledTimes(1);
 });
 it('does not let data properties forge the private Error type',()=>{expect(executeHmiScript(compile("return ({errorType:'TypeError',data:{message:'fake'}}) instanceof Error;"),{}).returned).toBe(false);});
 it('keeps constructor calls deferred outside passive module initializers',()=>{
  const catalog=parseHmiScriptCatalog({globalModules:[{name:'Faults',alias:'Faults',globalDefinition:{source:"const fault=new Error('Motor');"},functions:[{name:'Create',parameters:[],source:"return new Error('Motor');"}]}]});expect(catalog.globalModules[0].globalDefinition?.error).toContain('definizione globale');expect(catalog.globalModules[0].functions[0].program).toBeDefined();
 });
 it.each([1,2,3,4,5,6,7,8] as const)('retains legacy host-error strings when an IR %s caller uses a new module',version=>{
  const catalog=parseHmiScriptCatalog({globalModules:[{name:'Faults',alias:'Faults',functions:[{name:'Fail',parameters:[],source:'function fail(){JSON.parse("[");}fail();'}]}]});const manager=createHmiScriptContextManager(),options=manager.options(catalog,undefined,'scheduler');
  const program=compile('try{return Modules.Faults.Fail();}catch(error){return typeof error;}',options);expect(executeHmiScript({...program,version},{},options).returned).toBe('string');expect(executeHmiScript(program,{},options).returned).toBe('object');manager.dispose();
 });
 it('preserves explicit thrown payloads from a new module into an IR 8 caller',()=>{
  const catalog=parseHmiScriptCatalog({globalModules:[{name:'Faults',alias:'Faults',functions:[{name:'Fail',parameters:[],source:'throw 0;'}]}]});const manager=createHmiScriptContextManager(),options=manager.options(catalog,undefined,'scheduler');const program=compile('try{Modules.Faults.Fail();}catch(error){return error;}',options);expect(executeHmiScript({...program,version:8},{},options).returned).toBe(0);manager.dispose();
 });
 it('includes Error support in the self-contained generated runtime',()=>{const exports:Record<string,any>={};Function('exports',transpileModule(hmiScriptRuntimeModuleSource(),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(exports);const program=compile('try{throw new TypeError("m",{cause:4});}catch(error){return error.toString()+error.cause;}');expect(exports.executeHmiScript(program,{}).returned).toBe('TypeError: m4');expect(exports.inspectHmiScriptProgram(program).error).toBeUndefined();});
});
