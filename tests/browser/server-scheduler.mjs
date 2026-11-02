import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,copyFile,symlink} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {createServer as createTcp} from 'node:net';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer as createVite,build,preview} from 'vite';
import {Aedes} from 'aedes';
import {connectAsync} from 'mqtt';
const {chromium}=await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),base=path.join(root,'.hmi-preview'),token='synthetic_scheduler_browser_token_0123456789';
let editor,server,browser,broker,tcp,publisher,child,exitTask,generated,gatewayUrl;const commands=[],errors=[],serviceErrors=[],traces=[];
const until=async(check,message)=>{const end=Date.now()+15000;while(!await check()){if(Date.now()>end)throw Error(message+' '+JSON.stringify({errors,serviceErrors,commands}));await new Promise(r=>setTimeout(r,25));}};
const endChild=async()=>{if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([exitTask,new Promise((_,reject)=>setTimeout(()=>reject(Error('Service did not stop')),10000))]);}};
try{
  await mkdir(base,{recursive:true});generated=await mkdtemp(path.join(base,'server-scheduler-browser-'));
  editor=await createVite({root,configLoader:'runner',cacheDir:path.join(base,'scheduler-qa-editor/node_modules/.vite'),server:{watch:{ignored:()=>true},warmup:{clientFiles:[]}},logLevel:'error'});
  const {standardProjectFiles}=await editor.ssrLoadModule('/src/core/standardProject.ts');
  for(const file of standardProjectFiles({machineName:'Scheduler QA sintetico',layout:'desktop',sections:['main']})){const target=path.resolve(generated,file.path);assert.ok(target.startsWith(generated+path.sep));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.content);}
  await symlink(path.join(root,'node_modules'),path.join(generated,'node_modules'),process.platform==='win32'?'junction':'dir');
  const {parseHmiScriptCatalog,serializeHmiScriptCatalog}=await editor.ssrLoadModule('/src/core/hmiScriptModules.ts');
  const accountId=randomUUID(),namespace=randomUUID();
  const catalog=parseHmiScriptCatalog({schedulerService:{enabled:true,accountId},scheduledTasks:[{id:'once-per-change',name:'Una volta per variazione',enabled:true,trigger:{kind:'tag',tag:'Input',condition:'changed'},script:'HMIRuntime.Trace("SCHEDULER_QA");Tags("Out").Write(Number(Tags("Input").Read())+1);'}]});
  assert.ok(catalog.scheduledTasks[0].program);await writeFile(path.join(generated,'framecraft.scripts.json'),serializeHmiScriptCatalog(catalog));
  await writeFile(path.join(generated,'framecraft.runtime.json'),JSON.stringify({version:1,gateway:{enabled:true,path:'/_framecraft/plc/v1',pollMs:250}}));
  await writeFile(path.join(generated,'index.html'),'<!doctype html><html lang="it"><head><link rel="icon" href="data:,"></head><body><button data-framecraft-gateway-status>PLC</button><p data-framecraft-plc-summary></p><script type="module">import {installFramecraftHmiRuntime} from "/src/framecraftHmiRuntime.ts";window.disposeFixture=installFramecraftHmiRuntime({navigate:()=>{},routes:[]});</script></body></html>');
  await copyFile(new URL('../fixtures/audit-runtime-tsconfig.json',import.meta.url),path.join(generated,'tsconfig.scheduler-qa.json'));
  execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.scheduler-qa.json'],{cwd:generated,encoding:'utf8',windowsHide:true});
  await build({root:generated,configLoader:'runner',logLevel:'error'});
  server=await preview({root:generated,configFile:false,preview:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});const origin='http://127.0.0.1:'+server.httpServer.address().port;
  broker=await Aedes.createBroker();tcp=createTcp(broker.handle);await new Promise(r=>tcp.listen(0,'127.0.0.1',r));const url='mqtt://127.0.0.1:'+tcp.address().port;publisher=await connectAsync(url,{reconnectPeriod:0});broker.on('publish',packet=>{if(packet.topic==='command/Out')commands.push(packet.payload.toString());});
  await writeFile(path.join(generated,'framecraft.connections.json'),JSON.stringify({version:1,gateway:{enabled:true,port:0,tokenEnv:'SYNTHETIC_SCHEDULER_TOKEN',allowedOrigins:[origin],allowWrites:true},connections:[{id:'scheduler-qa',protocol:'mqtt',enabled:true,url,clientId:'scheduler-browser-qa',allowInsecure:true,allowWrites:true,timeoutMs:1000,bindings:[{tag:'Input',topic:'signal/Input',valuePath:'/value',qualityPath:'/quality'},{tag:'Out',topic:'signal/Out',writeTopic:'command/Out',writeQos:1}]}]}));
  await writeFile(path.join(generated,'framecraft.plc.json'),JSON.stringify({version:1,variables:[{id:'input',name:'Input',dataType:'Real',access:'read'},{id:'out',name:'Out',dataType:'Real',access:'read-write'}]}));
  await writeFile(path.join(generated,'framecraft.auth.json'),JSON.stringify({version:1,enabled:true,namespace,allowHttpLoopback:true,idleMinutes:5,absoluteMinutes:60}));
  const {hashOperatorPassword,writeOperatorStore}=await import(pathToUrl('runtime/operator-store.mjs'));const {defaultOperatorResources}=await import(pathToUrl('runtime/operator-policy.mjs'));
  const security=path.join(generated,'.framecraft-runtime/security');await mkdir(security,{recursive:true});const limits=defaultOperatorResources();limits.tagWrites={mode:'selected',ids:['Out']};await writeOperatorStore(path.join(security,'operators.json'),{version:2,id:randomUUID(),accounts:[{id:accountId,username:'scheduler',name:'Scheduler QA',role:'Service',disabled:false,capabilities:['scheduler.execute','tags.write'],permissions:[],password:await hashOperatorPassword('SYNTHETIC-scheduler-password-012345')}],resourceRules:[{accountId,limits}]},undefined);
  const start=()=>{child=spawn(process.execPath,['runtime/start-gateway.mjs','--json'],{cwd:generated,env:{...process.env,SYNTHETIC_SCHEDULER_TOKEN:token},stdio:['ignore','pipe','pipe'],windowsHide:true});exitTask=new Promise(resolve=>child.once('exit',resolve));let buffer='';child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{const event=JSON.parse(line);if(event.type==='gateway'&&event.address)gatewayUrl=event.address;if(event.type==='scheduler-trace')traces.push(event);}catch{}}});child.stderr.on('data',chunk=>serviceErrors.push(chunk.toString()));};
  const snapshot=async()=>{const response=await fetch(gatewayUrl+'/_framecraft/plc/v1/snapshot',{headers:{Authorization:'Bearer '+token,Origin:origin}});assert.equal(response.status,200);return response.json();};
  start();await until(()=>gatewayUrl,'Missing gateway startup');assert.equal((await snapshot()).scheduler.state,'running');
  const sample=async value=>{await publisher.publishAsync('signal/Input',JSON.stringify({value,quality:192}),{qos:1});await until(async()=>(await snapshot()).samples.some(s=>s.tag==='Input'&&s.value===String(value)),'Missing sample');};
  await sample(0);assert.equal(commands.length,0);
  browser=await chromium.launch({channel:'msedge',headless:true});let external=0;const pages=[];
  for(let i=0;i<2;i++){const context=await browser.newContext();await context.route('**/*',async route=>{const request=route.request(),requestUrl=new URL(request.url());if(request.url().startsWith(origin+'/')){if(requestUrl.pathname.startsWith('/_framecraft/')){const response=await route.fetch({url:gatewayUrl+requestUrl.pathname+requestUrl.search,headers:{...request.headers(),authorization:'Bearer '+token,origin}});return route.fulfill({response});}return route.continue();}if(request.url().startsWith('data:'))return route.continue();external++;return route.abort();});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>typeof window.disposeFixture==='function');pages.push(page);}
  await sample(4);await until(()=>commands.length>=1,'Missing scheduled write');assert.equal(commands.length,1);assert.equal(JSON.parse(commands[0]),5);
  await Promise.all(pages.map(page=>page.reload()));await Promise.all(pages.map(page=>page.waitForFunction(()=>typeof window.disposeFixture==='function')));assert.equal(commands.length,1);await sample(9);await until(()=>commands.length>=2,'Missing next event');assert.equal(commands.length,2);assert.equal(JSON.parse(commands[1]),10);
  assert.ok((await snapshot()).scheduler.history.every(row=>row.state==='completed'));
  await browser.close();browser=undefined;await endChild();gatewayUrl=undefined;start();await until(()=>gatewayUrl,'Missing restart');assert.equal((await snapshot()).scheduler.state,'running');await sample(9);assert.equal(commands.length,2);assert.equal(errors.length,0);assert.equal(external,0);
  await endChild();
  const {openSchedulerStore}=await import(pathToFileURL(path.join(generated,'runtime/scheduler-store.mjs')).href);
  const store=openSchedulerStore({root:generated,namespace}),runId=randomUUID();store.claim({id:runId,task:'synthetic-interruption',cause:'once',scheduledAt:Date.now(),key:'synthetic-key'});store.close();
  const cli=(...args)=>JSON.parse(execFileSync(process.execPath,['runtime/review-scheduler.mjs',...args],{cwd:generated,encoding:'utf8',windowsHide:true}));
  assert.equal(cli('status').needsReview,true);gatewayUrl=undefined;start();await until(()=>gatewayUrl,'Missing gated startup');await until(async()=>(await snapshot()).scheduler.state==='error','Scheduler did not block after interruption');assert.equal((await snapshot()).scheduler.diagnostic.code,'SCHEDULER_REVIEW');await sample(14);assert.equal(commands.length,2);await endChild();
  assert.equal(cli('review',runId).needsReview,false);gatewayUrl=undefined;start();await until(()=>gatewayUrl,'Missing reviewed startup');await until(async()=>(await snapshot()).scheduler.state==='running','Scheduler did not resume after review');await sample(14);assert.equal(commands.length,2);await sample(15);await until(()=>commands.length===3,'Missing reviewed execution');
  assert.ok(traces.some(event=>event.task === "once-per-change" && event.message === "SCHEDULER_QA"));
  console.log(JSON.stringify({passed:true,generated,scriptTrace:true,generatedTypecheck:true,generatedBuild:true,nodeServiceBootstrap:true,twoBrowserClients:true,oneCommandPerChange:true,reloadDoesNotReplay:true,restartDoesNotReplay:true,recoveryGate:true,reviewCli:true,commands:commands.length,external}));
}finally{await browser?.close();await endChild();await publisher?.endAsync(true);if(broker)await new Promise(r=>broker.close(r));if(tcp)await new Promise(r=>tcp.close(()=>r()));if(server)await new Promise(r=>server.httpServer.close(r));await editor?.close();}
function pathToUrl(file){return new URL(file,new URL('../../',import.meta.url)).href;}
