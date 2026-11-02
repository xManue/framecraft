import {describe,expect,it,vi} from 'vitest';
import {ModuleKind,ScriptTarget,transpileModule} from 'typescript';
import {createHmiScriptScope,executeHmiScript,executeHmiScriptAsync,hmiScriptRuntimeModuleSource,inspectHmiScript,type HmiScriptExecutionOptions,type HmiScriptScreenItemManager,type HmiScriptTimerCallback,type HmiScriptTimerContext} from '../src/core/hmiScript';
import {createHmiScriptContextManager,parseHmiScriptCatalog} from '../src/core/hmiScriptModules';
const compile=(source:string,options:HmiScriptExecutionOptions={})=>{const result=inspectHmiScript(source,options.functions,undefined,[],options.variables);expect(result.error).toBeUndefined();return result.program!;};
const run=(source:string,options:HmiScriptExecutionOptions={})=>executeHmiScript(compile(source,options),{},options);
const parity=[
 'const obj={value:4,read:function(){return this.value;}};return obj.read();',
 'const obj={value:4,add(value){this.value=this.value+value;return this.value;}};return obj.add(3);',
 'const obj={read(){return typeof this;}};const read=obj.read;return read();',
 'function read(value){return this.value+value;}return read.call({value:4},3);',
 'function read(value){return this.value+value;}return read.apply({value:4},[3]);',
 'function read(value){return typeof value;}return read.apply(null,null);',
 'function read(a,b){return a+b;}return read.apply(null,{length:2,0:3,1:4});',
 'function read(a,b){return JSON.stringify([typeof a,b]);}return read.apply(null,[,4]);',
 'function add(a,b){return this.value+a+b;}const bound=add.bind({value:4},2);return JSON.stringify([bound(3),bound.length,bound.name]);',
 'function add(a,b){return this.value+a+b;}const bound=add.bind({value:4},2).bind({value:99},3);return bound();',
 'const obj={value:4,make(){return ()=>this.value;}};const read=obj.make();return read.call({value:99});',
 'const obj={value:4,read:()=>typeof this};return obj.read();',
 'return JSON.stringify([1,2].map(function(value){return value*this.factor;},{factor:3}));',
 'return JSON.stringify([1,2].map(value=>typeof this,{factor:3}));',
 'const ctx={sum:0};[1,2].forEach(function(value){this.sum=this.sum+value;},ctx);return ctx.sum;',
 'return JSON.stringify([1,2,3].filter(function(value){return value>this.limit;},{limit:1}));',
 'return [1,2].some(function(value){return value===this.value;},{value:2});',
 'return [1,2].every(function(value){return value<this.limit;},{limit:3});',
 'return [1,2,3].find(function(value){return value===this.value;},{value:2});',
 'return [1,2,3].findIndex(function(value){return value===this.value;},{value:2});',
 'return [1,2,3].findLast(function(value){return value<this.limit;},{limit:3});',
 'return [1,2,3].findLastIndex(function(value){return value<this.limit;},{limit:3});',
 'return [1].reduce(function(acc,value){return typeof this;},0);',
 'let value;[2,1].sort(function(a,b){value=typeof this;return a-b;});return value;',
 'function read(value){return this.base+value;}const call=read.call;return call.call(read,{base:4},3);',
 'function read(value){return this.base+value;}return read["call"]({base:4},3);',
 'function read(value){return this.base+value;}const call=read.call.bind(read,{base:4});return call(3);',
 'function add(a){return a;}return add.bind(null,2,3)(4);',
 'function read(value){return typeof value;}return read();',
 'let calls=0;function next(){calls=calls+1;return 0;}function read(){return 4;}read(next());return calls;',
 'function read(){return typeof this;}return JSON.stringify([read.call(0),read.call(false),read.call(null),read.call("x")]);',
 'const ctx={value:4};const arrow=(function(){return ()=>this.value;}).call(ctx);ctx.value=7;return arrow.bind({value:99})();',
 'let calls=0;const ctx={value:7,read(){return this.value;}};function get(){calls=calls+1;return ctx;}const result=get().read();return JSON.stringify([calls,result]);',
 'const f=()=>1;return JSON.stringify([f.call===f.apply,f.call===(()=>1).call,f.length,f.name]);',
 'const ctx={value:4,map(value){return this.value+value;}};return ctx.map(3);',
 'const ctx={value:4,call(value){return this.value+value;}};return ctx.call(3);',
 'return JSON.stringify([1,2].flatMap(function(value){return [value,value*this.factor];},{factor:3}));',
 'function read(index){return this.value+index;}return [{value:4},{value:8}].map(read.call,read).join(",");',
 'const log=[];const ctx={read(value){log.push("method");return value;}};function get(){log.push("receiver");return ctx;}function key(){log.push("key");return "read";}function arg(){log.push("argument");return 3;}get()[key()](arg());return log.join(",");',
 'function read(){return this.value;}const ctx={value:4};const bound=read.bind(ctx);ctx.value=7;return bound();',
 'function read(value){return this.value+value;}return read.call.call(read,{value:4},3);',
 'function read(value){return this.value+value;}return read.apply.call(read,{value:4},[3]);',
];
const screens=():HmiScriptScreenItemManager=>({resolve:(scope,name)=>({screenItemId:scope==='screen'&&name?name:scope}),get:(ref,key)=>key==='Font'?{screenItemId:ref.screenItemId,screenPropertyPath:'Font' as const}:key==='Name'?ref.screenItemId:key==='Text'?'initial':1,set:vi.fn(),propertyFlashing:vi.fn(()=>true)});
describe('this, metodi e function intrinsics Unified',()=>{
 it.each(parity)('corrisponde al contesto JavaScript strict: %s',source=>{const native=new Function('"use strict";'+source)();const result=run(source,{maxSteps:20000});expect(result.error).toBeUndefined();expect(result.returned).toEqual(native);});
 it('lega this alla schermata negli script grafici, senza risolvere il DOM per closure che non lo usano',()=>{
   const screenItems=screens();expect(run('return this===Screen;',{screenItems}).returned).toBe(true);expect(run('return this.Items("Motor").Name;',{screenItems}).returned).toBe('Motor');
   const graphical=run('function label(){this.Text="updated";}const target=this.Items("Motor");label.call(target);const bound=label.bind(this.Items("Motor"));bound();',{screenItems});expect(graphical.error).toBeUndefined();expect(screenItems.set).toHaveBeenCalledWith({screenItemId:'Motor'},'Text','updated');expect(screenItems.set).toHaveBeenCalledTimes(2);
   expect(run('const items=Screen.Items;return items.call(Screen.Font,"Motor").Name;',{screenItems}).error).toContain('Items richiede la schermata');
   const context=run('return typeof this;',{screenItems,scriptContext:'scheduler'});expect(context.returned).toBe('undefined');
   const manager=createHmiScriptContextManager();try{const options=manager.options(parseHmiScriptCatalog({}),undefined,'scheduler');expect(options.scriptContext).toBe('scheduler');expect(run('return typeof this;',{...options,screenItems}).returned).toBe('undefined');}finally{manager.dispose();}
   const resolve=vi.fn(()=>{throw Error('No DOM');});expect(run('const read=()=>4;return read();',{screenItems:{...screenItems,resolve}}).returned).toBe(4);expect(resolve).not.toHaveBeenCalled();
 });
 it('mantiene l’arrow sul contesto grafico, ma non le funzioni normali o i moduli',()=>{
   const screenItems=screens();expect(run('const f=()=>this===Screen;return f.call(null);',{screenItems}).returned).toBe(true);expect(run('function f(){return typeof this;}return f();',{screenItems}).returned).toBe('undefined');
   const catalog=parseHmiScriptCatalog({globalModules:[{name:'Test',alias:'Test',functions:[{name:'Read',parameters:[],source:'return typeof this;'}]}]});const manager=createHmiScriptContextManager();try{expect(run('return Modules.Test.Read();',{...manager.options(catalog,'/'),screenItems}).returned).toBe('undefined');}finally{manager.dispose();}
 });
 it('preserva this nei timer arrow e lo lascia undefined nei timer normali',()=>{
   const pending:{callback:HmiScriptTimerCallback;context?:HmiScriptTimerContext}[]=[];const timerManager={set:(_mode:unknown,callback:HmiScriptTimerCallback,_delay:number,context?:HmiScriptTimerContext)=>{pending.push({callback,context});return pending.length;},clear:()=>true};
   const result=run('HMIRuntime.Timers.SetTimeout(()=>{HMIRuntime.Trace(this===Screen);},1);HMIRuntime.Timers.SetTimeout(function(){HMIRuntime.Trace(typeof this);},1);',{screenItems:screens(),timerManager});expect(result.error).toBeUndefined();
   const fired=pending.map(item=>{if(item.callback.kind!=='inline')throw Error('Expected inline VM wrapper');return executeHmiScript(item.callback.program,{},item.context);});expect(fired.map(item=>item.error)).toEqual([undefined,undefined]);expect(fired.map(item=>item.traces)).toEqual([['true'],['undefined']]);
 });
 it('isola this delle callback Promise e ripristina il chiamante',async()=>{
   const source='let arrow;let regular;const set=Tags.CreateTagSet(["Signal"]);set.ReadAsync().then(()=>{arrow=this===Screen;});set.ReadAsync().then(function(){regular=typeof this;});return JSON.stringify([arrow,regular,this===Screen]);';const result=await executeHmiScriptAsync(compile(source),{Signal:'1'},{screenItems:screens()});expect(result.error).toBeUndefined();expect(result.returned).toBe('[true,"undefined",true]');
 });
 it('rileva tag da thisArg, receiver, bind e apply senza perdere i riferimenti',()=>{
   for(const source of ['const ctx={tag:Tags("A"),read(){return this.tag.Read();}};return ctx.read();','function read(){return this.tag.Read();}return read.call({tag:Tags("A")});','function read(){return this.tag.Read();}const bound=read.bind({tag:Tags("A")});return bound();','return [1].map(function(){return this.tag.Read();},{tag:Tags("A")}).join(",");','function read(tag){return tag.Read();}return read.apply(null,[Tags("A")]);']){const result=inspectHmiScript(source);expect(result.error,source).toBeUndefined();expect(result.tagsRead,source).toContain('A');}
   const result=inspectHmiScript('function write(value){this.tag.Write(value);}write.call({tag:Tags("Command")},1);');expect(result.error).toBeUndefined();expect(result.tagsWritten).toContain('Command');
 });
 it('mantiene ricevute di trasporto, blocca valori mancanti e non espone host o prototipi',async()=>{
   const write=vi.fn(async(request:{tag:string;value:unknown})=>({tag:request.tag,outcome:'delivered' as const,delivery:'transport' as const,plcConfirmed:false as const}));const source='function send(value){this.tag.Write(value);}send.call({tag:Tags("Command")},7);';const result=await executeHmiScriptAsync(compile(source),{},{transport:{write,read:vi.fn()}});expect(result.error).toBeUndefined();expect(write).toHaveBeenCalledTimes(1);expect(write.mock.calls[0][0].value).toBe(7);expect(result.commands?.[0].plcConfirmed).toBe(false);
   write.mockClear();const missing=await executeHmiScriptAsync(compile('function send(value){Tags("Command").Write(value);}send.call(null);'),{},{transport:{write,read:vi.fn()}});expect(missing.error).toContain('Valore assente');expect(write).not.toHaveBeenCalled();
   for(const source of ['function f(){return this.constructor;}return f.call({});','const f=()=>1;return f.bind(null).constructor;','function f(){return this;}return f.call(window);'])expect(inspectHmiScript(source).error).toBeTruthy();
   expect(run('function f(){return this.ownerDocument;}return f();',{screenItems:screens()}).error).toBeTruthy();
 });
 it('invalida i bind nel contesto chiuso e applica i limiti di argomenti e wrapper',()=>{
   const scope=createHmiScriptScope();const result=run('function f(){Tags("Command").Write(1);}return f.bind(null);',{globalScope:scope,returnByReference:true});expect(result.error).toBeUndefined();scope.active=false;const late=run('bound();',{locals:{bound:result.returnedReference!}});expect(late.error).toContain("non e' piu' attivo");expect(late.writes).toEqual({});
   expect(run('function f(){}f.apply(null,{length:1025});').error).toContain('1024');
   expect(run('function f(){}let b=f;'+Array(33).fill('b=b.bind(null);').join('')).error).toContain('32');
 });
 it('conserva l’arità esatta delle funzioni IR 4',()=>{
   const program=compile('const f=x=>x;f();Tags("Command").Write(1);');const downgrade=(value:any)=>{if(!value||typeof value!=='object')return;if(Array.isArray(value.statements))value.version=4;if(value.kind==='function-value'){delete value.arrow;delete value.displayName;}for(const child of Object.values(value))downgrade(child);};downgrade(program);const result=executeHmiScript(program,{});expect(result.error).toContain('argomenti');expect(result.writes).toEqual({});
 });
 it('mantiene this globale dei moduli separato dalla prima schermata e il contesto della catch',async()=>{
   const catalog=parseHmiScriptCatalog({globalModules:[{name:'Global',alias:'Global',globalDefinition:{source:'export const read=()=>typeof this;'},functions:[]}]});const manager=createHmiScriptContextManager();try{const options={...manager.options(catalog,'/'),screenItems:screens()};expect(run('return Modules.Global.read();',options).returned).toBe('undefined');}finally{manager.dispose();}
   const source='let value;const set=Tags.CreateTagSet(["Bad"]);set.ReadAsync().catch(function(error){value=typeof this;});return JSON.stringify([value,this===Screen]);';const result=await executeHmiScriptAsync(compile(source),{Bad:'1'},{screenItems:screens(),readFailures:{Bad:{code:5,description:'offline'}}});expect(result.error).toBeUndefined();expect(result.returned).toBe('["undefined",true]');
 });
 it('rifiuta this dichiarato IR 4 e non serializza binding o intrinsics interni',()=>{
   const program=compile('return this;');const resolve=vi.fn(()=>({screenItemId:'screen'}));const result=executeHmiScript({...program,version:4},{},{screenItems:{...screens(),resolve}});expect(result.error).toContain('IR 5');expect(resolve).not.toHaveBeenCalled();
   const serialized=JSON.stringify(compile('function read(){return this.value;}const ctx={value:4};const bound=read.bind(ctx);return bound();'));expect(serialized).not.toMatch(/"lexicalThis"|"bindings"|"intrinsic"|"bound"\s*:/);
 });
 it('esporta la stessa semantica nel modulo autonomo',()=>{
   const exported:Record<string,any>={};new Function('exports',transpileModule(hmiScriptRuntimeModuleSource(),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(exported);for(const source of parity){const result=exported.executeHmiScript(compile(source),{},{maxSteps:20000});expect(result.error,source).toBeUndefined();expect(result.returned,source).toEqual(new Function('"use strict";'+source)());}
   expect(exported.executeHmiScript(compile('return this===Screen;'),{},{screenItems:screens()}).returned).toBe(true);
 });
});
