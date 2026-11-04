// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openSchedulerStore } from "../runtime/scheduler-store.mjs";
import { createServerScheduler } from "../runtime/scheduler-service.mjs";
import { parseHmiScriptCatalog, serializeHmiScriptCatalog, createHmiScriptContextManager, hmiScriptCatalogIssues } from "../src/core/hmiScriptModules";
import { executeHmiScriptAsync } from "../src/core/hmiScript";
import { nextHmiCalendarDue, hmiAlarmMatches } from "../src/core/hmiSchedule";
import { createHmiTimerManager } from "../src/core/hmiTimers";
const runtime={executeHmiScriptAsync,createHmiScriptContextManager,nextHmiCalendarDue,hmiAlarmMatches,createHmiTimerManager};
const dispose:(()=>unknown|Promise<unknown>)[]=[];
afterEach(async()=>{for(const f of dispose.splice(0).reverse())await f();});
function storeFixture(){mkdirSync('.hmi-preview',{recursive:true});const root=mkdtempSync(path.resolve('.hmi-preview/scheduler-unit-')),namespace=randomUUID();return{root,namespace};}
function setup(trigger:any={kind:'interval',intervalMs:1000},script='Tags("Out").Write(7);',extra:any={}){
  const location=storeFixture(),store=openSchedulerStore(location);dispose.push(()=>store.close());let wall=new Date(2026,0,1,12).getTime(),mono=0;
  const catalog=parseHmiScriptCatalog({schedulerService:{enabled:true,accountId:randomUUID()},scheduledTasks:[{id:'task',name:'Task',enabled:true,trigger,script}],...extra});
  const writes:any[]=[],diagnostics:any[]=[],traces:any[]=[],authorize=vi.fn(async()=>"synthetic-actor"),transport={read:vi.fn(async()=>({value:'3',status:{qualityCode:192}})),write:vi.fn(async(request:any)=>{writes.push({...request});return{tag:request.tag,outcome:'delivered',delivery:'broker-ack',plcConfirmed:false};})};
  const sample={tag:'Input',value:'0',qualityCode:192};
  const engine=createServerScheduler({catalog,runtime,store,authorize,transport,samples:()=>[{...sample}],onDiagnostic:e=>diagnostics.push(e),onTrace:e=>traces.push(e),now:()=>wall,monotonic:()=>mono,automatic:false});dispose.push(()=>engine.stop());
  return{engine,catalog,store,writes,diagnostics,traces,authorize,transport,location,sample,wall:()=>wall,setWall:(v:number)=>{wall=v;},advance:async(ms:number)=>{wall+=ms;mono+=ms;engine.tick();await engine.idle();}};
}
describe('central Scheduler',()=>{
  it('preserves an explicit service account through save and compilation',()=>{const id=randomUUID(),c=parseHmiScriptCatalog({schedulerService:{enabled:true,accountId:id}});expect(JSON.parse(serializeHmiScriptCatalog(c)).schedulerService).toEqual({enabled:true,accountId:id});});
  it('holds an OS lock until close; a second service cannot take over',()=>{const f=storeFixture(),s=openSchedulerStore(f);try{expect(()=>openSchedulerStore(f)).toThrow();}finally{s.close();}const second=openSchedulerStore(f);second.close();expect(()=>openSchedulerStore({...f,namespace:randomUUID()})).toThrow();});
  it('releases ownership on process death and retains uncertain claims',async()=>{
    const f=storeFixture(),module=pathToFileURL(path.resolve('runtime/scheduler-store.mjs')).href;
    const child=spawn(process.execPath,['--input-type=module','-e',`import {openSchedulerStore} from ${JSON.stringify(module)};const s=openSchedulerStore(${JSON.stringify(f)});s.claim({id:'interrupted',task:'task',cause:'once',scheduledAt:42,key:'key'});process.stdout.write('ready');setInterval(()=>{},1000);`],{stdio:['ignore','pipe','pipe'],windowsHide:true});
    try{await new Promise<void>((resolve,reject)=>{child.stdout.on('data',()=>resolve());child.once('error',reject);child.once('exit',code=>reject(new Error('Early exit '+code)));});expect(()=>openSchedulerStore(f)).toThrow();}
    finally{const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill();await exited;}
    const s=openSchedulerStore(f);try{expect(s.history()[0]).toMatchObject({state:'uncertain',code:'SCHEDULER_INTERRUPTED'});expect(s.claim({id:'retry',task:'task',cause:'once',scheduledAt:42,key:'key'})).toBe(false);}finally{s.close();}
  },15000);
  it('runs compiled IR 7 bindings/defaults in the central service with one authorized write',async()=>{
    const f=setup({kind:'interval',intervalMs:1000},'function sum({values=[3,4]}={}){const [first,...rest]=values;return first+rest.reduce((total,value)=>total+value,0);}Tags("Out").Write(sum());');
    expect(f.catalog.scheduledTasks[0].program?.version).toBe(7);
    await f.engine.start();await f.advance(1000);
    expect(f.writes).toHaveLength(1);expect(f.writes[0]).toMatchObject({tag:'Out',value:7});
    expect(f.store.history()[0].state).toBe('completed');expect(f.authorize).toHaveBeenCalled();
  });
  it('runs intervals once after a delay, without catch-up bursts or browser ownership',async()=>{const f=setup();await f.engine.start();await f.advance(1000);expect(f.writes).toHaveLength(1);await f.advance(10000);expect(f.writes).toHaveLength(2);expect(f.engine.snapshot()).toMatchObject({owner:'server',state:'running'});expect(f.store.history()).toHaveLength(2);});
  it('uses monotonic interval time when wall-clock time moves backwards',async()=>{const f=setup();await f.engine.start();f.setWall(f.wall()-3600000);await f.advance(1000);expect(f.writes).toHaveLength(1);});
  it('does not replay an expired once trigger or claim it again after restart',async()=>{
    const f=setup({kind:'once',at:new Date(2025,0,1).toISOString()});await f.engine.start();await f.engine.idle();expect(f.writes).toHaveLength(0);expect(f.store.history()[0]).toMatchObject({state:'skipped',code:'SCHEDULER_SKIPPED'});await f.engine.stop();f.store.close();
    const s=openSchedulerStore(f.location);dispose.push(()=>s.close());const e=createServerScheduler({catalog:f.catalog,runtime,store:s,authorize:f.authorize,transport:f.transport,samples:()=>[],automatic:false,now:f.wall});dispose.push(()=>e.stop());await e.start();await e.idle();expect(s.history()).toHaveLength(1);expect(f.writes).toHaveLength(0);
  });
  it('runs a future once trigger exactly once',async()=>{const at=new Date(2026,0,1,12,0,1).toISOString(),f=setup({kind:'once',at});await f.engine.start();await f.advance(1000);await f.advance(1000);expect(f.writes).toHaveLength(1);expect(f.store.history()[0].state).toBe('completed');});
  it('runs calendar triggers and suppresses wall-clock rollback duplicates',async()=>{const f=setup({kind:'calendar',frequency:'daily',time:'12:00:01'});await f.engine.start();await f.advance(1000);expect(f.writes).toHaveLength(1);f.setWall(f.wall()-2000);await f.advance(2000);expect(f.writes).toHaveLength(1);});
  it('baselines initial and reconnect samples and ignores duplicate/bad-quality events',async()=>{const f=setup({kind:'tag',tag:'Input',condition:'rising'});await f.engine.start();f.engine.sample({tag:'Input',value:'1',qualityCode:192});await f.engine.idle();expect(f.writes).toHaveLength(1);f.engine.sample({tag:'Input',value:'1',qualityCode:192});f.engine.disconnect(['Input']);f.engine.sample({tag:'Input',value:'1',qualityCode:192});await f.engine.idle();expect(f.writes).toHaveLength(1);f.engine.sample({tag:'Input',value:'0',qualityCode:0});f.engine.sample({tag:'Input',value:'1',qualityCode:192});await f.engine.idle();expect(f.writes).toHaveLength(1);f.engine.sample({tag:'Input',value:'0',qualityCode:192});f.engine.sample({tag:'Input',value:'1',qualityCode:192});await f.engine.idle();expect(f.writes).toHaveLength(2);});
  it('uses actual alarm notifications and passes alarm locals',async()=>{const f=setup({kind:'alarm',criterion:'priority',condition:'greater-or-equal',operand:'8'},'Tags("Out").Write(alarmPriority);');await f.engine.start();f.engine.alarm({alarmClass:'Warning',state:'Incoming',priority:7});await f.engine.idle();expect(f.writes).toHaveLength(0);f.engine.alarm({alarmClass:'Warning',state:'Incoming',priority:8});await f.engine.idle();expect(f.writes[0].value).toBe(8);});
  it('blocks scripts without service authorization and rechecks revocations',async()=>{const f=setup();f.authorize.mockRejectedValueOnce(new Error('denied'));await expect(f.engine.start()).rejects.toThrow();expect(f.writes).toHaveLength(0);expect(f.engine.snapshot().state).toBe('error');});
  it('does not execute queued or later writes when stopping a suspended script',async()=>{const f=setup(undefined,'Tags("In").Read(); Tags("Out").Write(1);');let release!:(v:any)=>void;f.transport.read.mockImplementation(()=>new Promise(r=>{release=r;}));await f.engine.start();const tick=f.advance(1000);await vi.waitFor(()=>expect(f.transport.read).toHaveBeenCalled());const stop=f.engine.stop();release({value:'1',status:{qualityCode:192}});await Promise.all([tick,stop]);expect(f.writes).toHaveLength(0);expect(f.engine.snapshot().pending).toBe(0);});
  it('coalesces repeated pending triggers instead of building an unbounded command queue',async()=>{const f=setup({kind:'tag',tag:'Input',condition:'changed'});let release!:(v:any)=>void;f.transport.write.mockImplementation(()=>new Promise(r=>{release=r;}));await f.engine.start();f.engine.sample({tag:'Input',value:'1',qualityCode:192});await vi.waitFor(()=>expect(f.transport.write).toHaveBeenCalled());for(let i=2;i<200;i++)f.engine.sample({tag:'Input',value:String(i),qualityCode:192});expect(f.engine.snapshot().pending).toBe(1);expect(f.engine.snapshot().dropped).toBe(198);release({tag:'Out',outcome:'delivered',delivery:'broker-ack',plcConfirmed:false});await f.engine.idle();expect(f.transport.write).toHaveBeenCalledTimes(1);});
  it('marks an undelivered command as uncertain without retrying the occurrence',async()=>{const f=setup();f.transport.write.mockRejectedValue(new Error('lost delivery'));await f.engine.start();await f.advance(1000);expect(f.store.history()[0]).toMatchObject({state:'uncertain',code:'SCHEDULER_FAILED'});expect(f.transport.write).toHaveBeenCalledTimes(1);await f.advance(10000);expect(f.transport.write).toHaveBeenCalledTimes(1);expect(f.engine.snapshot().state).toBe('error');});
  it('retains lexical closures in centrally owned timer callbacks, then disposes them',async()=>{const f=setup({kind:'once',at:new Date(2026,0,1,12,0,1).toISOString()},'let n=4; HMIRuntime.Timers.SetTimeout(()=>Tags("Out").Write(n+1),100);');await f.engine.start();await f.advance(1000);await vi.waitFor(()=>expect(f.writes).toHaveLength(1));expect(f.writes[0].value).toBe(5);await f.engine.stop();expect(f.engine.snapshot().state).toBe('stopped');});
  it('refuses graphics operations before a preceding PLC write can run',()=>{expect(()=>setup(undefined,'Tags("Out").Write(1); HMIRuntime.UI.SysFct.ChangeScreen("Home");')).toThrow();});
  it('requires an explicit review after an uncertain run, even across process restarts',async()=>{
    const f=setup();f.transport.write.mockRejectedValue(new Error('unknown outcome'));await f.engine.start();await f.advance(1000);await f.engine.stop();f.store.close();
    const s=openSchedulerStore(f.location);dispose.push(()=>s.close());expect(s.needsReview()).toBe(true);
    const e=createServerScheduler({catalog:f.catalog,runtime,store:s,authorize:f.authorize,transport:f.transport,samples:()=>[],automatic:false});dispose.push(()=>e.stop());await expect(e.start()).rejects.toMatchObject({code:'SCHEDULER_REVIEW'});expect(f.transport.write).toHaveBeenCalledTimes(1);
    const id=s.history()[0].id;expect(s.review(id)).toBe(true);expect(s.review(id)).toBe(false);expect(s.needsReview()).toBe(false);expect(s.history()[0]).toMatchObject({state:'reviewed',code:'SCHEDULER_FAILED'});
  });
  it('explains the minimum service interval in the editor before saving',()=>{const catalog=parseHmiScriptCatalog({schedulerService:{enabled:true,accountId:randomUUID()},scheduledTasks:[{id:'too-fast',name:'Troppo rapido',enabled:true,trigger:{kind:'interval',intervalMs:10},script:'HMIRuntime.Trace("x");'}]});expect(hmiScriptCatalogIssues(catalog)).toContain('Troppo rapido: sul servizio usa un intervallo di almeno 100 ms.');});
  it('limits script traces without blocking the task or exposing host objects',async()=>{const source='['+Array.from({length:25},(_,i)=>i).join(',')+'].forEach(v=>HMIRuntime.Trace(v));';const f=setup({kind:'interval',intervalMs:100},source);await f.engine.start();await f.advance(100);expect(f.traces).toHaveLength(20);await f.advance(100);await f.advance(100);expect(f.traces).toHaveLength(50);expect(f.engine.snapshot().state).toBe('running');await f.advance(60000);expect(f.traces).toHaveLength(70);expect(f.traces[0]).toMatchObject({type:'scheduler-trace',task:'task',message:'0'});});
  it.each(['false',1,null,{},[]])('refuses malformed service enabling values (%j)',value=>{const f=setup();const catalog=JSON.parse(serializeHmiScriptCatalog(f.catalog));catalog.schedulerService.enabled=value;expect(()=>createServerScheduler({catalog,runtime,store:f.store,authorize:f.authorize,transport:f.transport,samples:()=>[]})).toThrow();expect(f.transport.write).not.toHaveBeenCalled();});
  it('never enables server execution by default in old catalogs',()=>{expect(parseHmiScriptCatalog({scheduledTasks:[]}).schedulerService).toBeUndefined();});
});
