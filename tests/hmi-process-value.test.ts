// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createHmiPropertyFlashing,createHmiPropertyFlashingDomSurface} from '../scripts/hmi-property-flashing.mjs';
import {resolveHmiProcessValue} from '../src/core/hmiProcessValue';
import {executeHmiScript,executeHmiScriptAsync,inspectHmiScript,type HmiScriptExecutionOptions,type HmiScriptTimerCallback,type HmiScriptTimerContext} from '../src/core/hmiScript';
import type {HmiTagDefinition} from '../src/core/hmiTagBinding';
const cleanups:(()=>void)[]=[];
afterEach(()=>{cleanups.splice(0).forEach(fn=>fn());document.body.innerHTML='';vi.restoreAllMocks();});
function scene(markup='<input id="Field" data-hmi-name="Field" type="number" value="3">',variables:HmiTagDefinition[]=[],values:Record<string,string>={},defaults:HmiScriptExecutionOptions={}){
  document.body.innerHTML='<main data-hmi-screen="Main">'+markup+'</main>';
  const surface=createHmiPropertyFlashingDomSurface(document),controller=createHmiPropertyFlashing(Object.assign(surface,{resolveProcessValue:(source:Parameters<typeof resolveHmiProcessValue>[0],context:Parameters<typeof resolveHmiProcessValue>[1],writing?:boolean)=>resolveHmiProcessValue(source,context,variables,writing)}));
  cleanups.push(()=>surface.dispose());const owner=surface.items().find(item=>item.name==='Field')!,manager=controller.context(owner.itemId);
  const program=(source:string)=>{const parsed=inspectHmiScript(source);expect(parsed.error).toBeUndefined();return parsed.program!;};
  const options=(extra:HmiScriptExecutionOptions={})=>({screenItems:manager,...defaults,...extra});
  return {surface,controller,manager,target:document.getElementById('Field') as HTMLInputElement,program,run:(source:string,extra:HmiScriptExecutionOptions={})=>executeHmiScript(program(source),values,options(extra)),asyncRun:(source:string,extra:HmiScriptExecutionOptions={})=>executeHmiScriptAsync(program(source),values,options(extra))};
}
const field=(tag:string,extra={})=>'<input id="Field" data-hmi-name="Field" value="not the sample" data-hmi-dynamizations=\''+JSON.stringify([{kind:'Tag',property:'ProcessValue',tag,...extra}])+'\'>';
const variable=(name='Speed',dataType='DInt',access='read-write'):HmiTagDefinition=>({name,dataType,access});
it.each([['<input id="Field" type="text" value="0012">','0012','string'],['<input id="Field" type="number" value="12.5">',12.5,'number'],['<input id="Field" type="checkbox" checked>',true,'boolean'],['<textarea id="Field">0012</textarea>','0012','string']])('reads the local control type without guessing from text: %s',(markup,value,type)=>{
  const {run}=scene(markup);expect(run('return item.ProcessValue;')).toMatchObject({returned:value,writes:{}});expect(run('return typeof item.ProcessValue;').returned).toBe(type);
});
it('writes a local field immediately and restores its property rather than its HTML attribute',()=>{
  const {run,target,surface,controller}=scene();const input=vi.fn();target.addEventListener('change',input);expect(run('item.ProcessValue=7.25;return item.ProcessValue;')).toMatchObject({returned:7.25,writes:{}});expect(target.value).toBe('7.25');expect(target.getAttribute('value')).toBe('3');expect(input).not.toHaveBeenCalled();surface.suspend();expect(target.value).toBe('3');surface.resume();expect(target.value).toBe('7.25');controller.reset();expect(target.value).toBe('3');
});
it('preserves child nodes and listeners in a local output',()=>{
  const {run,target,controller}=scene('<output id="Field"><span>0012</span><svg/></output>'),span=target.firstElementChild,svg=target.lastElementChild;expect(run('item.ProcessValue="0050";return item.ProcessValue;').returned).toBe('0050');expect(target.firstElementChild).toBe(span);expect(target.lastElementChild).toBe(svg);controller.reset();expect(span!.textContent).toBe('0012');
});
it('keeps later native field edits during reset',()=>{const {run,target,controller}=scene();run('item.ProcessValue=7;');target.value='9';controller.reset();expect(target.value).toBe('9');});
it.each(['-1','101','NaN','null','"invalid"'])('rejects invalid local range values without clamping them: %s',value=>{
  const {run,target,controller}=scene('<input id="Field" type="range" value="25">');expect(run('item.ProcessValue='+value+';').error).toBeDefined();expect(target.value).toBe('25');expect(controller.propertyCommands()).toEqual([]);
});
it('writes checkbox booleans and selects only an existing choice',()=>{
  const {run,target}=scene('<input id="Field" type="checkbox">');expect(run('item.ProcessValue=true;return item.ProcessValue;').returned).toBe(true);expect(target.checked).toBe(true);
  const next=scene('<select id="Field"><option value="001">One</option><option value="002">Two</option></select>');expect(next.run('item.ProcessValue="002";return item.ProcessValue;').returned).toBe('002');expect(next.run('item.ProcessValue="missing";').error).toContain('scelte');expect(next.target.value).toBe('002');
});
it.each([['DInt','12',12],['Real','12.5',12.5],['Bool','true',true],['WString','0012','0012'],['String','','']])('reads declared %s samples, not the rendered input',(dataType,sample,value)=>{
  const {run}=scene(field('Speed'),[variable('Speed',dataType)],{Speed:sample});expect(run('return item.ProcessValue;')).toMatchObject({returned:value,writes:{}});
});
it('writes a bound local/offline tag through result writes and does not create a visual override',()=>{
  const {run,controller,target}=scene(field('Speed'),[variable()],{Speed:'12'});expect(run('item.ProcessValue=25;return item.ProcessValue;')).toMatchObject({returned:25,writes:{Speed:'25'}});expect(controller.propertyCommands()).toEqual([]);expect(target.value).toBe('not the sample');
});
it.each(['128','-129','1.5','true','null'])('validates the PLC type before attempting a write: %s',value=>{
  const {run,controller}=scene(field('Speed'),[variable('Speed','SInt')],{Speed:'12'});const result=run('item.ProcessValue='+value+';');expect(result.error).toBeDefined();expect(result.writes).toEqual({});expect(controller.propertyCommands()).toEqual([]);
});
it.each([[variable('Speed','DInt','read')],[variable(),variable()],[],[{...variable(),detected:true}]].map(variables=>({variables})))('rejects undeclared, ambiguous or readonly tags: %j',({variables})=>{
  const {run}=scene(field('Speed'),variables,{Speed:'12'});expect(run('item.ProcessValue=25;').error).toContain('ProcessValue');
});
it('allows write-only commands but rejects reads of the tag',()=>{const {run}=scene(field('Speed'),[variable('Speed','DInt','write')]);expect(run('item.ProcessValue=5;')).toMatchObject({writes:{Speed:'5'}});expect(run('return item.ProcessValue;').error).toContain('non è leggibile');});
it('never reuses a sample with bad or unknown quality',async()=>{
  const {asyncRun}=scene(field('Speed'),[variable()],{Speed:'12'});for(const status of [{qualityCode:0},{qualityKnown:false}])expect((await asyncRun('return item.ProcessValue;',{tagStatus:{Speed:status},transport:{read:vi.fn(async()=>({value:'12',status})),write:vi.fn()}})).error).toContain('campione valido');
});
it('waits for the transport receipt without optimistic acquisition or duplicate writes',async()=>{
  const write=vi.fn(async(_request:unknown,_signal?:AbortSignal)=>({tag:'Speed',outcome:'delivered' as const,delivery:'opcua-service' as const,plcConfirmed:false as const}));
  const {asyncRun,target,controller}=scene(field('Speed'),[variable()],{Speed:'12'},{tagStatus:{Speed:{qualityCode:192,qualityKnown:true}},transport:{read:vi.fn(async()=>({value:'12',status:{qualityCode:192,qualityKnown:true}})),write}});
  const result=await asyncRun('item.ProcessValue=25;return item.ProcessValue;');expect(result.error).toBeUndefined();expect(result.returned).toBe(12);expect(result.writes).toEqual({});expect(result.commands).toMatchObject([{outcome:'delivered',plcConfirmed:false}]);expect(write).toHaveBeenCalledTimes(1);expect(write.mock.calls[0][0]).toMatchObject({tag:'Speed',value:25,mode:0});expect(target.value).toBe('not the sample');expect(controller.propertyCommands()).toEqual([]);
});
it.each(['rejected','uncertain'] as const)('surfaces %s transport outcomes and never retries',async outcome=>{
  const write=vi.fn(async(_request:unknown,_signal?:AbortSignal)=>({tag:'Speed',outcome,plcConfirmed:false as const,error:'synthetic '+outcome}));const {asyncRun}=scene(field('Speed'),[variable()],{Speed:'12'},{transport:{read:vi.fn(),write}});const result=await asyncRun('item.ProcessValue=25;');expect(result.error).toContain('synthetic '+outcome);expect(result.writes).toEqual({});expect(result.commands?.[0]?.outcome).toBe(outcome);expect(write).toHaveBeenCalledTimes(1);
});
it('honours synchronous host write failures before opening a transport operation',async()=>{
  const write=vi.fn();const {asyncRun}=scene(field('Speed'),[variable()],{Speed:'12'});const result=await asyncRun('item.ProcessValue=25;',{transport:{read:vi.fn(),write},writeFailures:{Speed:{code:1,description:'Use an asynchronous event'}}});expect(result.error).toContain('asynchronous');expect(write).not.toHaveBeenCalled();
});
it('dereferences the current indirect selector, including earlier local writes in the same script',()=>{
  const vars=[variable('Selector','WString'),variable('Speed'),variable('Other')],values={Selector:'Speed',Speed:'12',Other:'18'};
  const {run}=scene(field('Selector',{indirect:true,indirectDataType:'DInt'}),vars,values);expect(run('Tags("Selector").Write("Other");item.ProcessValue=25;return item.ProcessValue;')).toMatchObject({returned:25,writes:{Selector:'Other',Other:'25'}});
});
it('rejects an invalid indirect target or conversion table',()=>{
  const {run}=scene(field('Selector',{indirect:true,indirectDataType:'Bool'}),[variable('Selector','WString'),variable()],{Selector:'Speed',Speed:'12'});expect(run('item.ProcessValue=true;').error).toContain('tipo');
  const next=scene(field('Speed',{conditionType:'Range'}),[variable()],{Speed:'12'});expect(next.run('item.ProcessValue=5;').error).toContain('conversione');
});
it('keeps faceplate local tags out of the transport and refuses a missing local context',async()=>{
  const write=vi.fn(),markup='<output id="Field" data-hmi-process-value=\''+JSON.stringify({binding:{property:'ProcessValue',tag:'Counter',local:true,dataType:'UInt'},minimum:0,maximum:20})+'\'>5</output>';
  const {asyncRun,run}=scene(markup,[],{Counter:'5'},{localTags:new Set(['Counter']),transport:{read:vi.fn(),write}});expect(await asyncRun('item.ProcessValue=17;return item.ProcessValue;')).toMatchObject({returned:17,writes:{Counter:'17'}});expect(write).not.toHaveBeenCalled();expect(run('item.ProcessValue=21;').error).toContain('limiti');expect(run('item.ProcessValue=1;',{localTags:undefined}).error).toContain('contesto');
});
it('retains typed references in timers and invalidates them when the page context ends',()=>{
  const {run,controller}=scene(field('Speed'),[variable()],{Speed:'12'});let callback:HmiScriptTimerCallback|undefined,captured:HmiScriptTimerContext|undefined;
  const timerManager={set:(_mode:unknown,next:HmiScriptTimerCallback,_delay:unknown,context?:HmiScriptTimerContext)=>{callback=next;captured=context;return 1;},clear:()=>true};expect(run('const field=item;HMIRuntime.Timers.SetTimeout(()=>{field.ProcessValue=30;},5);',{timerManager}).error).toBeUndefined();if(callback?.kind!=='inline')throw Error('Missing timer');expect(executeHmiScript(callback.program,{Speed:'12'},{...captured}).writes).toEqual({Speed:'30'});controller.reset();expect(executeHmiScript(callback.program,{Speed:'12'},{...captured}).error).toContain('non e\' piu\' attivo');
});
it('refuses graphic-only objects and raw bridge commands aimed at linked values',()=>{
  const {run}=scene('<button id="Field">Start</button>');expect(run('return item.ProcessValue;').error).toContain('non espone');
  const next=scene(field('Speed'),[variable()],{Speed:'12'}),id=next.surface.items().find(item=>item.name==='Field')!.itemId;expect(()=>next.surface.applyProperties([{itemId:id,property:'ProcessValue',value:7}])).toThrow('collegamento tag');expect(next.target.value).toBe('not the sample');
});
it('follows later native input without reapplying a previous script value on an unrelated style change',()=>{
  const {run,target,controller}=scene();run('item.ProcessValue=7;');expect(run('return item.ProcessValue;').returned).toBe(7);target.value='9';expect(run('return item.ProcessValue;').returned).toBe(9);run('item.BackColor=4294901760;');expect(target.value).toBe('9');controller.reset();expect(target.value).toBe('9');
});
it('keeps a newly empty number field empty rather than replaying its previous script value',()=>{
  const {run,target}=scene();run('item.ProcessValue=7;');target.value='';expect(run('return item.ProcessValue;').error).toBeDefined();run('item.BackColor=4294901760;');expect(target.value).toBe('');
});
it('restores the previous local value after a partial failed host publication',()=>{
  const {run,target,surface}=scene();run('item.ProcessValue=11;');const apply=surface.applyProperties.bind(surface);vi.spyOn(surface,'applyProperties').mockImplementationOnce(commands=>{apply(commands);throw Error('partial failure');});expect(run('item.ProcessValue=7;').error).toContain('partial failure');expect(target.value).toBe('11');expect(run('return item.ProcessValue;').returned).toBe(11);
});
it('explains unsupported scalar types without labelling an OPC UA value as an MQTT failure',()=>{const {run}=scene(field('Speed'),[variable('Speed','LInt')],{Speed:'12'});const result=run('return item.ProcessValue;');expect(result.error).toContain('ProcessValue (LInt)');expect(result.error).not.toContain('driver MQTT');});
it('discards an old frame value after newer native input, but accepts a new explicit script command',()=>{
  const {run,target,surface}=scene();run('item.ProcessValue=7;');const item=surface.items().find(item=>item.name==='Field')!,version=item.processValue!.revision!;target.value='9';surface.applyProperties([{itemId:item.itemId,property:'ProcessValue',value:7,valueRevision:version}]);expect(target.value).toBe('9');expect(run('return item.ProcessValue;').returned).toBe(9);run('item.ProcessValue=7;');expect(target.value).toBe('7');
});
it('checks live transport availability rather than returning an old good sample after disconnection',async()=>{
  const read=vi.fn(async()=>{throw Error('Synthetic connection offline');});const {asyncRun}=scene(field('Speed'),[variable()],{Speed:'12'},{tagStatus:{Speed:{qualityCode:192}},transport:{read,write:vi.fn()}});const result=await asyncRun('return item.ProcessValue;');expect(result.error).toContain('offline');expect(read).toHaveBeenCalledTimes(1);
});
