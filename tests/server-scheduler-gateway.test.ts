// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { Aedes } from 'aedes';
import { connectAsync } from 'mqtt';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createPlcGateway } from '../runtime/gateway.mjs';
import { openSchedulerStore } from '../runtime/scheduler-store.mjs';
import { createLocalOperatorAuth } from '../runtime/operator-auth.mjs';
import { defaultOperatorResources, type OperatorCapability } from '../runtime/operator-policy.mjs';
import { hashOperatorPassword, readOperatorStore, writeOperatorStore, type OperatorPassword } from '../runtime/operator-store.mjs';
import { openRuntimeAudit } from '../runtime/audit-store.mjs';
import { parseHmiScriptCatalog, createHmiScriptContextManager } from '../src/core/hmiScriptModules';
import { executeHmiScriptAsync } from '../src/core/hmiScript';
import { nextHmiCalendarDue, hmiAlarmMatches } from '../src/core/hmiSchedule';
import { createHmiTimerManager } from '../src/core/hmiTimers';
const runtime={executeHmiScriptAsync,createHmiScriptContextManager,nextHmiCalendarDue,hmiAlarmMatches,createHmiTimerManager};
const token='synthetic_scheduler_token_01234567890123456789',origin='http://localhost:1420';
let password:OperatorPassword;
beforeAll(async()=>{password=await hashOperatorPassword('SYNTHETIC-scheduler-password-012345');},15000);
async function fixture(script='Tags("Out").Write(7);',allowed=true){
  await mkdir(path.resolve('.hmi-preview'),{recursive:true});const root=await mkdtemp(path.resolve('.hmi-preview/scheduler-gateway-')),namespace=randomUUID(),account=randomUUID(),security=path.join(root,'.framecraft-runtime/security');await mkdir(security,{recursive:true});const file=path.join(security,'operators.json');
  const limits=defaultOperatorResources();limits.tagWrites={mode:'selected',ids:allowed?['Out']:[]};
  await writeOperatorStore(file,{version:2,id:randomUUID(),accounts:[{id:account,username:'scheduler',name:'Scheduler QA',role:'Service',disabled:false,capabilities:['scheduler.execute','tags.write'],permissions:[],password}],resourceRules:[{accountId:account,limits}]},undefined);
  const broker=await Aedes.createBroker(),tcp=createServer(broker.handle);await new Promise<void>(r=>tcp.listen(0,'127.0.0.1',r));const address=tcp.address();if(!address||typeof address==='string')throw Error();const publisher=await connectAsync('mqtt://127.0.0.1:'+address.port,{reconnectPeriod:0});
  const audit=openRuntimeAudit({root,namespace}),auth=createLocalOperatorAuth({file,config:{version:1,enabled:true,namespace,allowHttpLoopback:true,idleMinutes:5,absoluteMinutes:60},allowedOrigins:[origin],audit});
  const catalog=parseHmiScriptCatalog({schedulerService:{enabled:true,accountId:account},scheduledTasks:[{id:'on-input',name:'Input changed',enabled:true,trigger:{kind:'tag',tag:'Input',condition:'changed'},script}]});
  const variables=[{name:'Input',dataType:'Real',access:'read' as const},{name:'Out',dataType:'Real',access:'read-write' as const}];
  const config={version:1 as const,gateway:{enabled:true,port:0,tokenEnv:'SYNTHETIC_SCHEDULER_TOKEN',allowedOrigins:[origin],allowWrites:true},connections:[{id:'mqtt-qa',protocol:'mqtt' as const,enabled:true,url:'mqtt://127.0.0.1:'+address.port,clientId:'scheduler-qa',allowInsecure:true,allowWrites:true,timeoutMs:1000,bindings:[{tag:'Input',topic:'signal/Input',valuePath:'/value',qualityPath:'/quality'},{tag:'Out',topic:'signal/Out',writeTopic:'command/Out',writeQos:1 as const}]}]};
  const commands:string[]=[],diagnostics:unknown[]=[];broker.on('publish',packet=>{if(packet.topic==='command/Out')commands.push(packet.payload.toString());});
  const store=openSchedulerStore({root,namespace}),gateway=createPlcGateway(config,variables,{resolveSecret:()=>token,schedulerCatalog:catalog,schedulerStore:store,schedulerRuntime:runtime,operatorAuth:auth,audit,onSchedulerDiagnostic:e=>diagnostics.push(e)});await gateway.start();
  const sample=async(value:number)=>{await publisher.publishAsync('signal/Input',JSON.stringify({value,quality:192}),{qos:1});await vi.waitFor(()=>expect(gateway.snapshot().samples.find(s=>s.tag==='Input')?.value).toBe(String(value)));};
  const revoke=async()=>{const current=(await readOperatorStore(file))!;current.store.accounts[0].disabled=true;await writeOperatorStore(file,current.store,current.revision);};
  const capabilities=async(values:OperatorCapability[])=>{const current=(await readOperatorStore(file))!;current.store.accounts[0].capabilities=values;await writeOperatorStore(file,current.store,current.revision);};
  return{gateway,store,auth,commands,diagnostics,audit,revoke,sample,account,file,capabilities,readClient:()=>fetch(gateway.address+'/_framecraft/plc/v1/snapshot',{headers:{Authorization:'Bearer '+token,Origin:origin}}),close:async()=>{await gateway.stop();audit.close();await publisher.endAsync(true);await new Promise<void>(r=>broker.close(r));await new Promise<void>(r=>tcp.close(()=>r()));}};
}
it('executes one shared operation for two clients, with no operator login and audited restricted writes',async()=>{const f=await fixture();try{
  expect(f.gateway.snapshot().scheduler?.state).toBe('running');await f.sample(0);expect(f.commands).toHaveLength(0);
  const clients=await Promise.all([f.readClient(),f.readClient()]);expect(clients.map(r=>r.status)).toEqual([200,200]);await f.sample(1);await vi.waitFor(()=>expect(f.commands).toHaveLength(1));
  await Promise.all([f.readClient(),f.readClient()]);await f.sample(1);expect(f.commands).toHaveLength(1);
  expect(f.store.history()[0]).toMatchObject({state:'completed',cause:'tag'});const writes=f.audit.read().events.filter(e=>e.operation==='tags.write');expect(writes.map(e=>e.outcome).sort()).toEqual(['delivered','requested']);expect(writes.every(e=>e.actor?.endsWith(':'+f.account))).toBe(true);
}finally{await f.close();}},20000);
it('rechecks service-account revocation without waiting for a browser logout',async()=>{const f=await fixture();try{await f.sample(0);await f.revoke();await f.sample(1);await vi.waitFor(()=>expect(f.store.history()).toHaveLength(1));expect(f.commands).toHaveLength(0);expect(f.store.history()[0].state).toBe('uncertain');expect(f.gateway.snapshot().scheduler?.diagnostic?.code).toBe('SCHEDULER_FAILED');}finally{await f.close();}},20000);
it('honors resource restrictions even when the service account has tags.write',async()=>{const f=await fixture(undefined,false);try{await f.sample(0);await f.sample(1);await vi.waitFor(()=>expect(f.store.history()[0]?.state).toBe('uncertain'));expect(f.commands).toHaveLength(0);}finally{await f.close();}},20000);
it('blocks unaudited commands and keeps uncertain outcomes distinct from PLC confirmation',async()=>{const f=await fixture();let restore=()=>{};try{await f.sample(0);const spy=vi.spyOn(f.audit,'append').mockImplementation(()=>{throw Error('storage failure');});restore=()=>spy.mockRestore();await f.sample(1);await vi.waitFor(()=>expect(f.store.history()[0]?.state).toBe('uncertain'));expect(f.commands).toHaveLength(0);}finally{restore();await f.close();}},20000);
it('does not write after revocation while the requested audit event is suspended',async()=>{const f=await fixture();let release=()=>{},restore=()=>{};try{await f.sample(0);let arrived=false;const held=new Promise<void>(r=>{release=r;}),original=f.audit.append.bind(f.audit);const spy=vi.spyOn(f.audit,'append').mockImplementation(e=>{const result=original(e) as {sequence:number;id:string};if(e.operation==='tags.write'&&e.outcome==='requested'){arrived=true;return held as never;}return result;});restore=()=>spy.mockRestore();await f.sample(1);await vi.waitFor(()=>expect(arrived).toBe(true));await f.revoke();release();await vi.waitFor(()=>expect(f.store.history()[0]?.state).toBe('uncertain'));expect(f.commands).toHaveLength(0);}finally{release();restore();await f.close();}},20000);

it.each([{grants:[]},{grants:['scheduler.execute']}] as {grants:OperatorCapability[]}[])('rejects revoked service/write grants before driver access ($grants)',async({grants})=>{const f=await fixture();try{await f.sample(0);await f.capabilities(grants);await f.sample(1);await vi.waitFor(()=>expect(f.store.history()[0]?.state).toBe('uncertain'));expect(f.commands).toHaveLength(0);expect(f.gateway.snapshot().scheduler?.state).toBe('error');}finally{await f.close();}},20000);
it('validates a scheduled command against the declared PLC type before transport',async()=>{const f=await fixture('Tags("Out").Write("invalid-number");');try{await f.sample(0);await f.sample(1);await vi.waitFor(()=>expect(f.store.history()[0]?.state).toBe('uncertain'));expect(f.commands).toHaveLength(0);expect(f.audit.read().events.some(e=>e.operation==='tags.write'&&e.outcome==='rejected')).toBe(true);}finally{await f.close();}},20000);
