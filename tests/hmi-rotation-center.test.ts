// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createHmiPropertyFlashing,createHmiPropertyFlashingDomSurface} from '../scripts/hmi-property-flashing.mjs';
import {executeHmiScript,inspectHmiScript,type HmiScriptExecutionOptions} from '../src/core/hmiScript';
const cleanups:(()=>void)[]=[];
afterEach(()=>{cleanups.splice(0).forEach(fn=>fn());document.body.innerHTML='';vi.restoreAllMocks();});
function scene(){
 document.body.innerHTML='<main data-hmi-screen="Main" style="display:block;width:800px;height:600px;border:0;padding:0;box-sizing:border-box"><div data-hmi-name="Group"><button data-hmi-name="A" style="display:block;position:absolute;left:100px;top:50px;width:100px;height:40px;border:0;padding:0;box-sizing:border-box;transform-origin:50% 50%">A</button></div></main>';
 const target=document.querySelector<HTMLElement>('button')!,main=document.querySelector<HTMLElement>('main')!,group=target.parentElement!,fault=vi.fn();
 vi.spyOn(main,'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);vi.spyOn(main,'getBoundingClientRect').mockReturnValue(new DOMRect(10,20,800,600));
 vi.spyOn(target,'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);
 const rect=vi.spyOn(target,'getBoundingClientRect').mockImplementation(()=>new DOMRect(10+Number.parseFloat(target.style.left),20+Number.parseFloat(target.style.top),100,40));
 const surface=createHmiPropertyFlashingDomSurface(document,undefined,undefined,fault),controller=createHmiPropertyFlashing(surface);cleanups.push(()=>surface.dispose());
 const owner=surface.items().find(item=>item.name==='A')!,manager=controller.context(owner.itemId);
 const run=(source:string,options:HmiScriptExecutionOptions={})=>{const inspected=inspectHmiScript(source);expect(inspected.error).toBeUndefined();return executeHmiScript(inspected.program!,{},{screenItems:manager,...options});};
 return{target,main,group,rect,surface,controller,manager,owner,run,fault};
}
it('reads the initial CSS pivot as absolute offsets from the border-box center',()=>{
 const{target,run}=scene();target.style.transformOrigin='25px 12px';expect(run('return JSON.stringify([item.RotationCenterPlacement,item.RotationCenterX,item.RotationCenterY]);').returned).toBe('[0,-25,-8]');
});
it('writes fractional and negative offsets from the center without replacing DOM nodes',()=>{
 const{target,run}=scene(),click=vi.fn();target.addEventListener('click',click);
 expect(run('item.RotationCenterX=12.5;item.RotationCenterY=-5.25;return JSON.stringify([item.RotationCenterPlacement,item.RotationCenterX,item.RotationCenterY]);').returned).toBe('[0,12.5,-5.25]');
 expect(target.style.transformOrigin).toContain('12.5px');expect(target.style.transformOrigin).toContain('5.25px');target.click();expect(click).toHaveBeenCalledOnce();
});
it('maps normalized values to the edges and permits centers outside the object',()=>{
 const{target,run,controller}=scene();
 expect(run('item.RotationCenterPlacement=1;item.RotationCenterX=-1;item.RotationCenterY=2;return item.RotationCenterY;').returned).toBe(2);
 expect(target.style.transformOrigin).toContain('0% 150%');expect(controller.propertyCommands().filter(command=>command.property.startsWith('RotationCenter'))).toHaveLength(3);
});
it('uses the screen origin for absolute coordinates and follows position changes synchronously',()=>{
 const{target,run,surface}=scene();
 expect(run('item.RotationCenterPlacement=2;item.RotationCenterX=200;item.RotationCenterY=100;return item.RotationCenterX;').returned).toBe(200);
 expect(target.style.transformOrigin).toContain('100px 50px');
 target.style.left='150px';surface.items();expect(target.style.transformOrigin).toContain('50px 50px');
});
it('inverts scaled and rotated groups for a screen-absolute pivot',()=>{
 const{target,group,rect,run}=scene();group.style.transform='matrix(0,2,-3,0,0,0)';rect.mockReturnValue(new DOMRect(-10,70,120,200));
 expect(run('item.RotationCenterPlacement=2;item.RotationCenterX=200;item.RotationCenterY=100;').error).toBeUndefined();
 const origin=target.style.transformOrigin.split(' ').map(Number.parseFloat);expect(origin[0]).toBeCloseTo(25,6);expect(origin[1]).toBeCloseTo(-100/3,6);
});
it.each([-1,3,1.5,'1',null,true])('rejects invalid placement enum values before changing the layer: %s',value=>{
 const{manager,surface,controller}=scene(),apply=vi.spyOn(surface,'applyProperties');expect(()=>manager.set(manager.resolve('item'),'RotationCenterPlacement',value as never)).toThrow('RotationCenterPlacement');expect(apply).not.toHaveBeenCalled();expect(controller.propertyCommands()).toEqual([]);
});
it.each([NaN,Infinity,-Infinity,1e39,'2',true,null])('rejects non-Float coordinates before changing the layer: %s',value=>{
 const{manager,surface,controller}=scene(),apply=vi.spyOn(surface,'applyProperties');expect(()=>manager.set(manager.resolve('item'),'RotationCenterX',value as never)).toThrow('Float');expect(apply).not.toHaveBeenCalled();expect(controller.propertyCommands()).toEqual([]);
});
it('publishes a complete pivot tuple once per setter and rolls back an already applied failure',()=>{
 const{run,surface,target,controller}=scene();const publish=surface.applyProperties.bind(surface),spy=vi.spyOn(surface,'applyProperties');run('item.RotationCenterX=5;');expect(spy).toHaveBeenCalledOnce();const commands=controller.propertyCommands(),origin=target.style.transformOrigin;
 spy.mockImplementationOnce(commands=>{publish(commands);throw Error('synthetic failure');});expect(run('item.RotationCenterY=6;').error).toContain('synthetic failure');expect(controller.propertyCommands()).toEqual(commands);expect(target.style.transformOrigin).toBe(origin);
});
it('rejects an uninvertible absolute layout and restores partial style changes',()=>{
 const{run,group,target,controller}=scene();group.style.scale='0';const original=target.style.cssText;
 expect(run('item.RotationCenterPlacement=2;').error).toContain('non invertibile');expect(controller.propertyCommands()).toEqual([]);expect(target.style.cssText).toBe(original);
});
it('reports layout faults once, refuses the faulty measurement, and recovers when the group is fixed',()=>{
 const{run,group,surface,fault}=scene();run('item.RotationCenterPlacement=2;');group.style.scale='0';surface.items();surface.items();expect(fault).toHaveBeenCalledOnce();expect(run('return item.GetBoundingBoxInScreenCoordinates();').error).toContain('non invertibile');
 group.style.scale='1';surface.items();expect(run('return item.GetBoundingBoxInScreenCoordinates().Width;').returned).toBe(100);
});
it('retains CSS priorities and later external changes through suspend/resume/reset',()=>{
 const{run,target,surface,controller}=scene();target.style.setProperty('transform-origin','20px 10px','important');run('item.RotationCenterPlacement=1;item.RotationCenterX=-1;');surface.suspend();expect(target.style.transformOrigin).toBe('20px 10px');surface.resume();expect(target.style.transformOrigin).toContain('0%');target.style.setProperty('transform-origin','4px 7px','important');controller.reset();expect(target.style.transformOrigin).toBe('4px 7px');expect(target.style.getPropertyPriority('transform-origin')).toBe('important');
});
it('rejects incomplete raw pivot groups and invalidated script contexts',()=>{
 const{surface,owner,target,run,controller}=scene();surface.applyProperties([{itemId:owner.itemId,property:'RotationCenterX',value:5}]);expect(target.style.transformOrigin).toBe('50% 50%');controller.reset();expect(run('item.RotationCenterY=8;').error).toContain('non e\' piu\' attivo');
});

it('keeps module-held pivot references and rejects them after context reset', async()=>{
 const{createHmiScriptContextManager,parseHmiScriptCatalog}=await import('../src/core/hmiScriptModules');
 const{run,manager,controller}=scene(),catalog=parseHmiScriptCatalog({globalModules:[{name:'Shared',alias:'Shared',globalDefinition:{source:'let owner;'},functions:[{name:'Capture',parameters:[],source:'owner=item;return true;'},{name:'Move',parameters:[],source:'owner.RotationCenterPlacement=1;owner.RotationCenterX=1.25;return owner.RotationCenterX;'}]}]}),contexts=createHmiScriptContextManager(),options=contexts.options(catalog,undefined,'events');
 expect(run('return Modules.Shared.Capture();',{...options,screenItems:manager}).error).toBeUndefined();expect(run('return Modules.Shared.Move();',{...options,screenItems:manager}).returned).toBe(1.25);controller.reset();expect(run('return Modules.Shared.Move();',{...options,screenItems:manager}).error).toContain('non e\' piu\' attivo');contexts.dispose();
});

it('stops scheduling frame measurements when the last absolute-pivot element is removed',()=>{
 const{target,run}=scene();let callback:FrameRequestCallback|undefined;
 const frames=vi.spyOn(window,'requestAnimationFrame').mockImplementation(next=>{callback=next;return 77;});
 run('item.RotationCenterPlacement=2;');expect(frames).toHaveBeenCalledOnce();target.remove();callback!(0);expect(frames).toHaveBeenCalledOnce();expect(target.style.transformOrigin).toBe('50% 50%');
});
