// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface, type HmiScreenItemSnapshot } from '../scripts/hmi-property-flashing.mjs';
import { executeHmiScript, inspectHmiScript, type HmiScriptExecutionOptions, type HmiScriptTimerCallback, type HmiScriptTimerContext } from '../src/core/hmiScript';
import { createHmiScriptContextManager, parseHmiScriptCatalog } from '../src/core/hmiScriptModules';
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); document.body.innerHTML=''; vi.restoreAllMocks(); });
function scene(markup='<button data-hmi-name="A" style="position:absolute;left:20px;top:30px;width:100px;height:60px;padding:2px 4px 6px 8px;margin:3px;box-sizing:border-box">Motor<svg/></button><button data-hmi-name="B" style="padding:10px">Other</button>') {
  document.body.innerHTML='<main data-hmi-screen="Main">'+markup+'</main>';
  const surface=createHmiPropertyFlashingDomSurface(document),controller=createHmiPropertyFlashing(surface);
  cleanups.push(()=>surface.dispose());
  const owner=surface.items().find(item=>item.name==='A')!,manager=controller.context(owner.itemId),target=document.querySelector<HTMLElement>('[data-hmi-name="A"]')!;
  const run=(source:string,options:HmiScriptExecutionOptions={})=>{const parsed=inspectHmiScript(source);expect(parsed.error).toBeUndefined();return executeHmiScript(parsed.program!,{},{screenItems:manager,...options});};
  return {surface,controller,manager,target,run};
}
it('reads four typed sides through opaque references distinct from Margin and Font',()=>{
  const {run}=scene();
  expect(run('const p=Screen.Items("A").Padding;return JSON.stringify([p.Left,p.Top,p.Right,p.Bottom,p===item.Padding,p===item.Margin,p===item.Font]);')).toMatchObject({returned:'[8,2,4,6,true,false,false]',writes:{}});
});
it('writes all sides without replacing children, moving the object, or losing listeners',()=>{
  const {run,target,controller}=scene(),svg=target.querySelector('svg'),click=vi.fn();target.addEventListener('click',click);
  expect(run('const p=item.Padding;p.Left=12;p.Top=5;p.Right=7;p.Bottom=0;return JSON.stringify([p.Left,p.Top,p.Right,p.Bottom]);').returned).toBe('[12,5,7,0]');
  expect(target.style.padding).toBe('5px 7px 0px 12px');expect(target.style.margin).toBe('3px');expect(target.style.left).toBe('20px');expect(target.style.width).toBe('100px');expect(target.querySelector('svg')).toBe(svg);target.click();expect(click).toHaveBeenCalledTimes(1);
  controller.reset();expect(target.style.padding).toBe('2px 4px 6px 8px');
});
it('assigns or copies all sides in one publication with independent values',()=>{
  const {run,surface,controller}=scene(),apply=vi.spyOn(surface,'applyProperties');
  expect(run('item.Padding={Left:1,Top:2,Right:3,Bottom:4};return item.Padding.Top;').returned).toBe(2);expect(apply).toHaveBeenCalledTimes(1);expect(controller.propertyCommands()).toHaveLength(4);apply.mockClear();
  expect(run('item.Padding=Screen.Items("B").Padding;Screen.Items("B").Padding.Left=25;return item.Padding.Left;').returned).toBe(10);expect(apply).toHaveBeenCalledTimes(2);
});
it.each(['1.5','2147483648','-2147483649','"4"','true','null','NaN','Infinity'])('rejects invalid scalar values before publishing: %s',value=>{
  const {run,surface,target}=scene(),apply=vi.spyOn(surface,'applyProperties');const result=run('item.Padding.Left='+value+';');
  expect(result.error).toBeDefined();expect(result.writes).toEqual({});expect(apply).not.toHaveBeenCalled();expect(target.style.paddingLeft).toBe('8px');
});
it.each(['{Left:1,Top:2,Right:3,Bottom:"bad"}','{Left:1,Top:2,Right:3}','{Left:1,Top:2,Right:3,Bottom:4,Width:5}','null','[]','item.Font','item.Margin'])('rejects invalid or cross-part copies atomically: %s',value=>{
  const {run,surface,target,controller}=scene(),apply=vi.spyOn(surface,'applyProperties');
  expect(run('item.Padding='+value+';').error).toBeDefined();expect(apply).not.toHaveBeenCalled();expect(controller.propertyCommands()).toEqual([]);expect(target.style.padding).toBe('2px 4px 6px 8px');
});
it.each(['item.Padding.Left=-1;','item.Padding={Left:1,Top:2,Right:3,Bottom:-1};'])('reports the HTML negative inset limit before changing any side: %s',source=>{
  const {run,surface,target}=scene(),apply=vi.spyOn(surface,'applyProperties');expect(run(source).error).toContain('non negativo');expect(apply).not.toHaveBeenCalled();expect(target.style.padding).toBe('2px 4px 6px 8px');
});
it('supports the complete signed Int32 contract for a host that can render signed insets',()=>{
  const properties=Object.fromEntries(['Left','Top','Right','Bottom'].map(side=>['Padding.'+side,0]));
  const items:HmiScreenItemSnapshot[]=[{itemId:'a',screenId:'s',name:'A',flashing:[],properties,paddingAllowsNegative:true}],apply=vi.fn();
  const controller=createHmiPropertyFlashing({items:()=>items,apply:()=>{},applyProperties:apply}),manager=controller.context('a');
  const result=executeHmiScript(inspectHmiScript('item.Padding={Left:-2147483648,Top:2147483647,Right:-1,Bottom:0};return JSON.stringify([item.Padding.Left,item.Padding.Top,item.Padding.Right,item.Padding.Bottom]);').program!,{},{screenItems:manager});
  expect(result).toMatchObject({returned:'[-2147483648,2147483647,-1,0]',writes:{}});expect(apply).toHaveBeenCalledTimes(1);
  expect(()=>manager.setPadding!(manager.resolve('item'),{Left:0,Top:0,Right:0,Bottom:2147483648})).toThrow('Int32');expect(apply).toHaveBeenCalledTimes(1);
});
it('does not round fractional or unresolved percentage base values',()=>{
  const {run,target}=scene('<button data-hmi-name="A" style="padding:1.5px 10%">Motor</button>');
  expect(run('return item.Padding.Top;').error).toContain('non e\' risolvibile');expect(run('return item.Padding.Left;').error).toContain('non e\' risolvibile');
  expect(run('item.Padding={Left:1,Top:2,Right:3,Bottom:4};return item.Padding.Top;').returned).toBe(2);expect(target.style.padding).toBe('2px 3px 4px 1px');
});
it('validates every copied source side before touching the destination',()=>{
  const {run,target,surface}=scene('<button data-hmi-name="A" style="padding:8px">Target</button><button data-hmi-name="B" style="padding:1.5px">Source</button>'),apply=vi.spyOn(surface,'applyProperties');
  expect(run('item.Padding=Screen.Items("B").Padding;').error).toContain('non e\' risolvibile');expect(apply).not.toHaveBeenCalled();expect(target.style.padding).toBe('8px');
});
it('applies a temporary important layer and restores a later author change after suspension',()=>{
  const {run,target,surface,controller}=scene('<style>button{padding-left:99px!important}</style><button data-hmi-name="A" style="padding:2px 4px!important">Motor</button>');
  expect(run('item.Padding.Left=10;').error).toBeUndefined();expect(target.style.getPropertyPriority('padding-left')).toBe('important');surface.suspend();expect(target.style.paddingLeft).toBe('4px');
  target.style.setProperty('padding-left','44px');surface.resume();expect(target.style.paddingLeft).toBe('10px');controller.reset();expect(target.style.paddingLeft).toBe('44px');
});
it('preserves external edits during reset and restores untouched sides and priorities',()=>{
  const {run,target,controller}=scene('<button data-hmi-name="A" style="padding:2px 4px 6px 8px!important">Motor</button>');
  run('item.Padding={Left:1,Top:2,Right:3,Bottom:4};');target.style.setProperty('padding-left','44px');controller.reset();expect(target.style.paddingLeft).toBe('44px');expect(target.style.paddingRight).toBe('4px');expect(target.style.getPropertyPriority('padding-right')).toBe('important');
});
it.each(['<div data-hmi-name="A" style="display:contents">No box</div>','<table><tbody><tr data-hmi-name="A"><td>Row</td></tr></tbody></table>','<svg data-hmi-name="A"><rect/></svg>'])('rejects unsupported padding surfaces: %s',markup=>{
  const {run,controller}=scene(markup);expect(run('item.Padding.Left=2;').error).toContain('non espone Padding');expect(controller.propertyCommands()).toEqual([]);
});
it('supports table cells where CSS padding is effective',()=>{
  const {run,target}=scene('<table><tbody><tr><td data-hmi-name="A" style="padding:0">Cell</td></tr></tbody></table>');expect(run('item.Padding.Left=7;return item.Padding.Left;').returned).toBe(7);expect(target.style.paddingLeft).toBe('7px');
});
it('keeps lookalike data inert and blocks DOM access, scalar exports and root methods on a part',()=>{
  const {run}=scene();expect(run('const data={screenItemId:"fake",screenPropertyPath:"Padding"};data.Left=4;return data.Left;').returned).toBe(4);
  expect(run('return item.Padding.ownerDocument;').error).toContain('non espone');expect(run('item.Padding.Size=2;').error).toContain('Padding non espone');
  expect(run('item.Font.Left=2;').error).toContain('Font non espone');expect(run('item.Margin=item.Padding;').error).toContain('riferimento Margin');
  const result=run('Tags("Unsafe").Write(item.Padding);');expect(result.error).toContain('riferimento grafico');expect(result.writes).toEqual({});expect(run('return item.Padding.PropertyFlashing("BackColor",true);').error).toContain('richiede un oggetto');
});
it('rolls back state and rendered sides when the host publication fails',()=>{
  const {run,surface,controller,target}=scene();run('item.Padding.Left=11;');const previous=controller.propertyCommands(),apply=surface.applyProperties.bind(surface);
  vi.spyOn(surface,'applyProperties').mockImplementationOnce(commands=>{apply(commands);throw Error('synthetic failure');});
  expect(run('item.Padding={Left:1,Top:2,Right:3,Bottom:4};').error).toContain('synthetic failure');expect(controller.propertyCommands()).toEqual(previous);expect(target.style.padding).toBe('2px 4px 6px 11px');expect(run('return item.Padding.Left;').returned).toBe(11);
});
it('reports the upgrade required for old host adapters',()=>{
  const {manager}=scene();const result=executeHmiScript(inspectHmiScript('item.Padding={Left:1,Top:2,Right:3,Bottom:4};').program!,{},{screenItems:{...manager,setPadding:undefined}});expect(result.error).toContain('Runtime aggiornati');
});
it('retains references through module functions and receivers, then invalidates them',()=>{
  const {manager,controller}=scene(),catalog=parseHmiScriptCatalog({globalModules:[{name:'Shared',alias:'Shared',globalDefinition:{source:'let saved;'},functions:[{name:'Capture',parameters:[],source:'saved=item.Padding;return saved.Left;'},{name:'Change',parameters:[],source:'function change(){this.Left=12;}change.call(saved);return saved.Left;'}]}]}),contexts=createHmiScriptContextManager();cleanups.push(()=>contexts.dispose());
  const options=contexts.options(catalog,undefined,'events'),run=(source:string)=>executeHmiScript(inspectHmiScript(source).program!,{},{...options,screenItems:manager});
  expect(run('return Modules.Shared.Capture();').returned).toBe(8);expect(run('return Modules.Shared.Change();').returned).toBe(12);controller.reset();expect(run('return Modules.Shared.Change();').error).toContain('non e\' piu\' attivo');
});
it('retains parts in timer callbacks and rejects callbacks after context invalidation',()=>{
  const {run,target,controller}=scene();let callback:HmiScriptTimerCallback|undefined,captured:HmiScriptTimerContext|undefined;
  const timerManager={set:(_mode:unknown,next:HmiScriptTimerCallback,_delay:unknown,context?:HmiScriptTimerContext)=>{callback=next;captured=context;return 1;},clear:()=>true};
  expect(run('const p=item.Padding;HMIRuntime.Timers.SetTimeout(()=>{p.Left=17;},5);',{timerManager}).error).toBeUndefined();if(callback?.kind!=='inline')throw Error('Inline timer not captured');
  expect(executeHmiScript(callback.program,{},{...captured,timerManager}).error).toBeUndefined();expect(target.style.paddingLeft).toBe('17px');controller.reset();expect(executeHmiScript(callback.program,{},{...captured,timerManager}).error).toContain('non e\' piu\' attivo');
});
it('rejects invalid direct host groups before any publication',()=>{
  const {manager,surface,controller}=scene(),apply=vi.spyOn(surface,'applyProperties');expect(()=>manager.setPadding!(manager.resolve('item'),{Left:1,Top:2,Right:3,Bottom:-1})).toThrow('non negativo');expect(apply).not.toHaveBeenCalled();expect(controller.propertyCommands()).toEqual([]);
});
it.each([-1,1.5,2147483648])('rejects a malformed iframe command without discarding the prior layer: %s',value=>{
  const {surface,target,run}=scene();run('item.Padding.Left=11;');const id=surface.items().find(item=>item.name==='A')!.itemId;
  expect(()=>surface.applyProperties([{itemId:id,property:'Padding.Top',value:4},{itemId:id,property:'Padding.Bottom',value}])).toThrow('Int32 non negativo');expect(target.style.padding).toBe('2px 4px 6px 11px');
});
it('rejects references after the owner has been removed',()=>{const {run,target}=scene();target.remove();expect(run('item.Padding.Left=3;').error).toContain('non e\' piu\' disponibile');});
it('overrides important stylesheets even when the requested value equals the inline base',()=>{
  const {run,target,controller}=scene('<style>button{padding-left:99px!important}</style><button data-hmi-name="A" style="padding-left:8px">Motor</button>');
  expect(run('item.Padding.Left=8;').error).toBeUndefined();expect(target.style.getPropertyPriority('padding-left')).toBe('important');controller.reset();expect(target.style.paddingLeft).toBe('8px');expect(target.style.getPropertyPriority('padding-left')).toBe('');
});
it('rejects collapsed table padding that CSS would ignore',()=>{const {run}=scene('<table data-hmi-name="A" style="border-collapse:collapse"><tbody><tr><td>Cell</td></tr></tbody></table>');expect(run('item.Padding.Left=5;').error).toContain('non espone Padding');});
