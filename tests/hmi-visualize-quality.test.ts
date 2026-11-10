// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createHmiPropertyFlashing,createHmiPropertyFlashingDomSurface} from '../scripts/hmi-property-flashing.mjs';
import {createHmiQualityVisuals,createHmiQualityPreview} from '../scripts/hmi-quality-visuals.mjs';
import {qualityPreviewCommands} from '../src/core/hmiQualityPreview';
import {resolveHmiCurrentQuality} from '../src/core/hmiCurrentQuality';
import {inspectHmiScript,executeHmiScript} from '../src/core/hmiScript';
const cleanups:(()=>void)[]=[];
afterEach(()=>{cleanups.splice(0).forEach(fn=>fn());document.querySelector('[data-framecraft-quality-layer]')?.remove();document.body.innerHTML='';vi.restoreAllMocks();vi.useRealTimers();});
const catalog=[{name:'Speed',dataType:'DInt',access:'read'}],ctx={values:{Speed:'12'},tagStatus:{Speed:{qualityCode:64}},requireQuality:true};
function setup(){
 document.body.innerHTML='<main data-hmi-screen="Main"><input id="Speed" data-hmi-name="Speed" data-plc-variable="Speed" data-hmi-visualize-quality="true" value="12" style="color:red"><span id="Static">Static</span></main>';
 const dom=createHmiPropertyFlashingDomSurface(document,element=>element.id||'main');cleanups.push(()=>dom.dispose());
 const manager=createHmiPropertyFlashing({items:()=>dom.items(),apply:commands=>dom.apply(commands),applyProperties:commands=>dom.applyProperties(commands),applyQuality:commands=>dom.applyQuality(commands),resolveCurrentQuality:(sources,context)=>resolveHmiCurrentQuality(sources,context,catalog)});
 return {dom,manager,field:document.querySelector<HTMLInputElement>('#Speed')!};
}
it('reads and writes the boolean through script IR without touching source or values',()=>{
 const {manager,field}=setup(),raw=field.outerHTML,program=inspectHmiScript('const f=Screen.Items("Speed");f.VisualizeQuality=false;return f.VisualizeQuality;').program!;
 const result=executeHmiScript(program,{}, {screenItems:manager.context('Speed')});expect(result.error).toBeUndefined();expect(result.returned).toBe(false);expect(field.outerHTML).toBe(raw);expect(manager.qualityCommands(ctx)).toEqual([]);manager.reset();expect(manager.context('Speed').get({screenItemId:'Speed'},'VisualizeQuality')).toBe(true);expect(manager.qualityCommands(ctx)).toEqual([{itemId:'Speed',quality:2}]);
});
it('defaults off and rejects non-boolean writes and nested parts',()=>{
 const {manager}=setup(),context=manager.context('Static');expect(context.get({screenItemId:'Static'},'VisualizeQuality')).toBe(false);
 for(const value of [0,1,'true',null])expect(()=>context.set({screenItemId:'Static'},'VisualizeQuality',value)).toThrow('Boolean');expect(()=>context.set({screenItemId:'Static',screenPropertyPath:'Font'},'VisualizeQuality',true)).toThrow();
});
it('uses lean snapshots and aggregates current children',()=>{
 const {dom,manager}=setup(),items=dom.qualityItems();expect(items.every(item=>!Object.hasOwn(item,'properties')&&!Object.hasOwn(item,'boundingBox'))).toBe(true);expect(manager.qualityCommands(ctx,items)).toEqual([{itemId:'Speed',quality:2}]);manager.context('main').set({screenItemId:'main'},'VisualizeQuality',true);expect(manager.qualityCommands(ctx,dom.qualityItems())).toEqual([{itemId:'main',quality:2},{itemId:'Speed',quality:2}]);
});
it('fails closed on malformed sources and removes deleted targets',()=>{const {dom,manager,field}=setup();field.setAttribute('data-hmi-dynamizations','invalid');expect(manager.qualityCommands(ctx)[0].quality).toBe(1);field.remove();expect(manager.qualityCommands(ctx,dom.qualityItems())).toEqual([]);});
function renderer(){
 const {field}=setup();let enabled=true,active=true;
 vi.spyOn(window,'getComputedStyle').mockImplementation(()=>({getPropertyValue:()=>'',opacity:'1',overflowX:'visible',overflowY:'visible',display:'block',visibility:'visible'}) as unknown as CSSStyleDeclaration);
 vi.spyOn(field,'getBoundingClientRect').mockReturnValue({left:30,top:40,right:230,bottom:80,width:200,height:40,x:30,y:40,toJSON:()=>({})});vi.spyOn(field,'getClientRects').mockReturnValue([field.getBoundingClientRect()] as unknown as DOMRectList);
 const visuals=createHmiQualityVisuals(document,id=>id==='Speed'?{element:field,enabled,name:'Speed'}:undefined,()=>active);cleanups.push(()=>visuals.dispose());return {field,visuals,disable:()=>{enabled=false;},deactivate:()=>{active=false;}};
}
it.each([[0,'non disponibili'],[1,'non validi'],[2,'incerti'],[68,'limite superiore'],[132,'limite inferiore']])('renders quality %s accessibly without mutating the control',(quality,label)=>{
 const {field,visuals}=renderer(),before=field.outerHTML;field.focus();visuals.apply([{itemId:'Speed',quality}]);expect(document.querySelector('[data-framecraft-quality-layer] [role="img"]')?.getAttribute('aria-label')).toContain(label);expect(field.outerHTML).toBe(before);expect(document.activeElement).toBe(field);expect(document.querySelector('[data-framecraft-quality-layer]')?.getAttribute('style')).toContain('pointer-events: none');
});
it('clears good, disabled, suspended and disposed annotations',()=>{
 const {visuals,disable,deactivate}=renderer(),bad=[{itemId:'Speed',quality:1}];visuals.apply(bad);expect(document.querySelector('[data-framecraft-quality-layer]')).toBeTruthy();visuals.apply([{itemId:'Speed',quality:4}]);expect(document.querySelector('[data-framecraft-quality-layer]')).toBeNull();visuals.apply(bad);visuals.hide();expect(document.querySelector('[data-framecraft-quality-layer]')).toBeNull();visuals.apply(bad);disable();visuals.apply(bad);expect(document.querySelector('[data-framecraft-quality-layer]')).toBeNull();deactivate();visuals.apply(bad);visuals.dispose();expect(document.querySelector('[data-framecraft-quality-layer]')).toBeNull();
});
it.each([-1,12,200,4294967300,NaN,1.5])('rejects invalid code %s before changing the layer',quality=>{const {visuals}=renderer();visuals.apply([{itemId:'Speed',quality:1}]);const before=document.querySelector('[data-framecraft-quality-layer]')?.outerHTML;expect(()=>visuals.apply([{itemId:'Speed',quality}])).toThrow();expect(document.querySelector('[data-framecraft-quality-layer]')?.outerHTML).toBe(before);});
it('validates unique and bounded data-only requests',()=>{
 const {dom}=setup(),items=dom.qualityItems();expect(qualityPreviewCommands(items,ctx,catalog)).toEqual([{itemId:'Speed',quality:2}]);for(const invalid of [null,[...items,items[0]],Array(4097).fill(items[0]),[{...items[0],itemId:4}],[{...items[0],visualizeQuality:'true'}]])expect(qualityPreviewCommands(invalid,ctx,catalog)).toBeUndefined();const cycle:any={};cycle.self=cycle;expect(qualityPreviewCommands([cycle],ctx,catalog)).toBeUndefined();
});
it('pins replies to parent/origin/page/sequence and clears on edit/disposal',()=>{
 vi.useFakeTimers();let active=true;const applyQuality=vi.fn(),send=vi.spyOn(window.parent,'postMessage').mockImplementation(()=>{});const bridge=createHmiQualityPreview(window,{hasQualityTargets:()=>true,qualityItems:()=>[],applyQuality},{active:()=>active,origin:()=>location.origin,pageId:()=>'page'});cleanups.push(()=>bridge.dispose());bridge.tick();expect(send).toHaveBeenCalledWith(expect.objectContaining({sequence:1}),location.origin);
 const reply=(change:Record<string,unknown>={})=>window.dispatchEvent(new MessageEvent('message',{source:window.parent,origin:location.origin,data:{type:'framecraft:quality-result',pageId:'page',sequence:1,commands:[{itemId:'Speed',quality:2}],...change}}));window.dispatchEvent(new MessageEvent('message',{source:window.parent,origin:'https://wrong.invalid',data:{type:'framecraft:quality-result',pageId:'page',sequence:1,commands:[]}}));reply({pageId:'stale'});reply({sequence:2});expect(applyQuality).not.toHaveBeenCalled();reply();expect(applyQuality).toHaveBeenCalledTimes(1);reply();expect(applyQuality).toHaveBeenCalledTimes(1);bridge.tick();active=false;bridge.tick();expect(applyQuality).toHaveBeenLastCalledWith([]);reply({sequence:2});expect(applyQuality).toHaveBeenCalledTimes(2);bridge.dispose();expect(vi.getTimerCount()).toBe(0);
});

it('expires a lost response and never waits forever for old quality',()=>{
 vi.useFakeTimers();const applyQuality=vi.fn(),send=vi.spyOn(window.parent,'postMessage').mockImplementation(()=>{});
 const bridge=createHmiQualityPreview(window,{hasQualityTargets:()=>true,qualityItems:()=>[{itemId:'A',name:'A',screenId:'A',flashing:[],visualizeQuality:true,quality:{}}],applyQuality},{active:()=>true,origin:()=>location.origin,pageId:()=>'page'});cleanups.push(()=>bridge.dispose());
 bridge.tick();vi.advanceTimersByTime(1250);expect(send).toHaveBeenCalledTimes(1);vi.advanceTimersByTime(250);expect(applyQuality).toHaveBeenLastCalledWith([{itemId:'A',quality:0}]);expect(send).toHaveBeenCalledTimes(2);
});

it('hides annotations for hidden and unauthorized ancestors',()=>{
 const {field,visuals}=renderer(),parent=field.parentElement!,bad=[{itemId:'Speed',quality:1}];parent.hidden=true;visuals.apply(bad);expect(document.querySelector('[data-framecraft-quality-layer]')).toBeNull();parent.hidden=false;parent.setAttribute('data-fc-user-visible-requires','maintenance');visuals.apply(bad);expect(document.querySelector('[data-framecraft-quality-layer]')).toBeNull();parent.setAttribute('data-fc-user-visible-granted','true');visuals.apply(bad);expect(document.querySelector('[data-framecraft-quality-layer]')).toBeTruthy();
});
it('clips the viewport annotation to its scroll container',()=>{
 const {field,visuals}=renderer(),parent=field.parentElement!;
 vi.mocked(window.getComputedStyle).mockImplementation(element=>({getPropertyValue:()=>'',opacity:'1',overflowX:element===parent?'hidden':'visible',overflowY:'visible',display:'block',visibility:'visible'}) as unknown as CSSStyleDeclaration);
 vi.spyOn(parent,'getBoundingClientRect').mockReturnValue({left:60,top:30,right:150,bottom:90,width:90,height:60,x:60,y:30,toJSON:()=>({})});Object.defineProperty(parent,'clientWidth',{configurable:true,value:90});visuals.apply([{itemId:'Speed',quality:1}]);const outline=document.querySelector('[data-framecraft-quality-layer] rect')!;expect(outline.getAttribute('x')).toBe('61');expect(outline.getAttribute('width')).toBe('88');
});

it('keeps the preview alive after a cached page return and disposes a normal unload',()=>{
 vi.useFakeTimers();const applyQuality=vi.fn(),send=vi.spyOn(window.parent,'postMessage').mockImplementation(()=>{});
 const bridge=createHmiQualityPreview(window,{hasQualityTargets:()=>true,qualityItems:()=>[],applyQuality},{active:()=>true,origin:()=>location.origin,pageId:()=>'page'});cleanups.push(()=>bridge.dispose());
 bridge.tick();window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));expect(applyQuality).toHaveBeenLastCalledWith([]);vi.advanceTimersByTime(250);expect(send).toHaveBeenCalledTimes(2);window.dispatchEvent(new PageTransitionEvent('pagehide'));expect(vi.getTimerCount()).toBe(0);
});
