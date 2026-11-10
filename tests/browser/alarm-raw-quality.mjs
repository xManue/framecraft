import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,symlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,build,preview} from 'vite';
import {captureRecipePlc} from '../../runtime/recipe-plc.mjs';
const {chromium}=await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));let editor,server,browser;const errors=[];let external=0,commands=0,failRecipe=false,failAudit=false,failCapture=false,failArchive=false,legacyArchive=false;
const recipe={version:1,revision:'a'.repeat(64),sequence:0,persistence:'server-file',schemas:[{id:'s',name:'Schema',fields:[{id:'speed',name:'Speed',type:'number'}],records:[{id:'r',name:'Record',values:{speed:12}}]}]};
const session={user:{id:'synthetic',name:'Synthetic operator',role:'Operator',permissions:[],capabilities:['audit.read','recipes.read','recipes.capture','alarms.history.read']},csrfToken:'A'.repeat(43),expiresInMs:300000};
try {
 await mkdir(path.join(root,'.hmi-preview'),{recursive:true});const generated=await mkdtemp(path.join(root,'.hmi-preview/alarm-raw-quality-browser-'));
 editor=await createServer({root,configLoader:'runner',cacheDir:path.join(generated,'editor-cache'),server:{watch:null,warmup:{clientFiles:[]}},logLevel:'error'});
 const {standardProjectFiles}=await editor.ssrLoadModule('/src/core/standardProject.ts'),scripts=await editor.ssrLoadModule('/src/core/hmiScript.ts');
 const programs=Object.fromEntries(['Alarm','Recipe','Audit','History','Archive'].map(name=>{const result=scripts.inspectHmiScript('return Screen.Items("'+name+'").CurrentQuality;');assert.equal(result.error,undefined);return[name,result.program];}));
 for(const file of standardProjectFiles({machineName:'Service quality synthetic',layout:'desktop',sections:['main']})){const target=path.join(generated,file.path);assert.ok(target.startsWith(generated+path.sep));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.content);}
 await writeFile(path.join(generated,'qa.ts'),`
 import {createHmiPropertyFlashing,createHmiPropertyFlashingDomSurface} from '/src/framecraftHmiFlashing.ts';
 import {resolveHmiCurrentQuality} from '/src/framecraftHmiCurrentQuality.ts';
 import {executeHmiScript} from '/src/framecraftScriptRuntime.ts';
 import {createHmiAlarmControl} from '/src/framecraftHmiAlarmControl.mjs';
 import {createHmiRecipeControl} from '/src/framecraftHmiRecipeControl.ts';
 import {createHmiRecipeClient} from '/src/framecraftHmiRecipeClient.ts';
 import {createHmiAlarmArchive} from '/src/framecraftHmiAlarmArchive.ts';
 import {createHmiAuditControl} from '/src/framecraftHmiAuditControl.ts';
 import {installHmiOperatorSession,operatorSessionProfile} from '/src/framecraftOperatorSession.ts';
 import {createAlarmEngine,emptyAlarmCatalog} from '/runtime/alarm-engine.mjs';
 const operator=installHmiOperatorSession({enabled:true}),surface=createHmiPropertyFlashingDomSurface(document),controller=createHmiPropertyFlashing(Object.assign(surface,{resolveCurrentQuality:(sources,ctx)=>resolveHmiCurrentQuality(sources,ctx,[])}));
 const context=controller.context(surface.items().find(item=>item.name==='Alarm').itemId),programs=${JSON.stringify(programs)};
 const engine=createAlarmEngine({...emptyAlarmCatalog(),alarms:[{id:'a',name:'Alarm',text:'Synthetic alarm',tag:'Signal',className:'Alarm_CTH',priority:1,enabled:true,trigger:{kind:'bit',bit:0,activeWhen:'set'}}]},[{name:'Signal',dataType:'Bool',access:'read'}]);
 const history=createHmiAlarmControl(document.querySelector('#History'),async()=>{throw Error('Unexpected history command');});
 const alarm=createHmiAlarmControl(document.querySelector('#Alarm'),async()=>{throw Error('Unexpected command');});
 engine.updateSample({tag:'Signal',value:false,qualityCode:192});alarm.update(engine.snapshot());
 const archive=createHmiAlarmArchive(document.querySelector('#Archive'),{enabled:true});
 history.update(engine.snapshot());
 const client=createHmiRecipeClient({scope:'synthetic-service-quality'}),recipe=createHmiRecipeControl(document.querySelector('#Recipe'),{client,confirm:()=>true}),audit=createHmiAuditControl(document.querySelector('#Audit'),{enabled:true});
 window.qa={sample:(wire,value)=>{engine.updateSample({tag:'Signal',value,qualityCode:wire});alarm.update(engine.snapshot());history.update(engine.snapshot());},transitions:()=>engine.snapshot().history.length,active:()=>engine.snapshot().rows[0].active,ready:()=>operatorSessionProfile()?.id==='synthetic',q:name=>{const result=executeHmiScript(programs[name],{}, {screenItems:context});if(result.error)throw Error(result.error);if(Object.keys(result.writes).length)throw Error('Unexpected PLC write');return result.returned;},alarm:available=>alarm.update(available?engine.snapshot():undefined,available),dispose:()=>{alarm.dispose();history.dispose();archive.dispose();recipe.dispose();audit.dispose();client.dispose();operator.dispose();surface.dispose();}};
 `);
 await writeFile(path.join(generated,'index.html'),'<!doctype html><html><head><link rel="icon" href="data:,"></head><body><main data-hmi-screen="Main"><div id="Alarm" data-hmi-type="HmiAlarmControl" data-hmi-name="Alarm"></div><div id="Recipe" data-hmi-type="HmiRecipeControl" data-hmi-name="Recipe"></div><div id="Audit" data-hmi-type="HmiAuditControl" data-hmi-name="Audit"></div><div id="History" data-hmi-type="HmiAlarmControl" data-hmi-alarm-source="history" data-hmi-name="History"></div><div id="Archive" data-hmi-type="HmiAlarmArchive" data-hmi-name="Archive"></div></main><script type="module" src="/qa.ts"></script></body></html>');
 await symlink(process.env.FRAMECRAFT_RUNTIME_UPDATE_NODE_MODULES||path.join(root,'node_modules'),path.join(generated,'node_modules'),'junction');await build({root:generated,configLoader:'runner',logLevel:'error'});server=await preview({root:generated,configLoader:'runner',logLevel:'error',preview:{host:'127.0.0.1',port:0,strictPort:false}});
 const origin='http://127.0.0.1:'+server.httpServer.address().port;browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext();
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.protocol==='data:')return route.continue();if(url.origin!==origin){external++;return route.abort();}if(!url.pathname.startsWith('/_framecraft/'))return route.continue();if(route.request().method()!=='GET'){commands++;return route.abort();}
 if(url.pathname.includes('/session'))return route.fulfill({json:session});
 if(url.pathname.includes('/recipe-plc')){if(failCapture)return route.fulfill({status:503,body:'synthetic'});const now=Date.now(),capture=captureRecipePlc({schemaId:'s',maxAgeMs:1000,maxSkewMs:100,fields:[{fieldId:'speed',tag:'Speed'}]},recipe.schemas[0],recipe.revision,'b'.repeat(64),[{name:'Speed',dataType:'Real',access:'read'}],()=>({connectionId:'synthetic',protocol:'opcua',state:'connected',sample:{value:12,qualityCode:193,receivedAt:now}}),now);return route.fulfill({json:capture});}
 if(url.pathname.endsWith('/recipes'))return route.fulfill(failRecipe?{status:503,body:'synthetic'}:{json:recipe});
 if(url.pathname.endsWith('/alarm-history')){if(failArchive)return route.fulfill({status:503,body:'synthetic'});const event={sequence:1,id:'a',occurrence:'synthetic',name:'Alarm',text:'Synthetic',alarmClass:'Alarm_CTH',priority:1,area:'',state:'Incoming',time:Date.now(),...(legacyArchive?{}:{qualityDetails:{version:1,sources:[{tag:'Signal',state:'valid',qualityCode:193}]}})};return route.fulfill({json:{version:1,id:randomUUID(),namespace:randomUUID(),sequence:1,count:1,incompleteRuns:0,nextBefore:null,capture:{state:'recording',unconfirmedInThisRun:0},events:[{seq:1,instanceId:randomUUID(),recordedAt:new Date().toISOString(),event}]}});}
 if(url.pathname.endsWith('/audit'))return route.fulfill(failAudit?{status:503,body:'synthetic'}:{json:{version:1,id:randomUUID(),namespace:randomUUID(),verified:true,sequence:0,uncertainCount:0,unresolvedCount:0,events:[],nextBefore:null}});
 throw Error('Unexpected service route '+url.pathname);
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.waitForFunction(()=>window.qa?.ready());
 const q=name=>page.evaluate(name=>window.qa.q(name),name),wait=(name,quality)=>page.waitForFunction(({name,quality})=>window.qa.q(name)===quality,{name,quality});
 assert.equal(await q('Alarm'),4);await page.evaluate(()=>window.qa.alarm(false));assert.equal(await q('Alarm'),1);await page.evaluate(()=>window.qa.alarm(true));assert.equal(await q('Alarm'),4);
 assert.equal(await q('History'),0);await page.evaluate(()=>window.qa.sample(193,true));assert.equal(await q('Alarm'),132);assert.equal(await q('History'),132);await page.evaluate(()=>window.qa.sample(64,false));assert.equal(await q('Alarm'),2);assert.equal(await q('History'),132);assert.equal(await page.evaluate(()=>window.qa.transitions()),1);assert.equal(await page.evaluate(()=>window.qa.active()),true);await page.evaluate(()=>window.qa.sample(194,false));assert.equal(await q('Alarm'),68);assert.equal(await q('History'),196);
 assert.equal(await q('Archive'),0);await page.locator('#Archive').getByRole('button',{name:'Carica storico',exact:true}).click();await wait('Archive',132);failArchive=true;await page.locator('#Archive').getByRole('button',{name:'Aggiorna dalla prima pagina',exact:true}).click();await wait('Archive',1);failArchive=false;legacyArchive=true;await page.locator('#Archive').getByRole('button',{name:'Carica storico',exact:true}).click();await wait('Archive',0);legacyArchive=false;await page.locator('#Archive').getByRole('button',{name:'Aggiorna dalla prima pagina',exact:true}).click();await wait('Archive',132);
 assert.equal(await q('Recipe'),0);assert.equal(await q('Audit'),0);
 await page.locator('#Recipe').getByRole('button',{name:'Rileggi archivio',exact:true}).click();await wait('Recipe',4);
 await page.locator('#Recipe').getByRole('button',{name:'Leggi valori PLC',exact:true}).click();await wait('Recipe',132);failCapture=true;await page.locator('#Recipe').getByRole('button',{name:'Leggi valori PLC',exact:true}).click();await wait('Recipe',1);failCapture=false;await page.locator('#Recipe').getByRole('button',{name:'Leggi valori PLC',exact:true}).click();await wait('Recipe',132);
 failRecipe=true;await page.locator('#Recipe').getByRole('button',{name:'Rileggi archivio',exact:true}).click();await wait('Recipe',129);failRecipe=false;await page.locator('#Recipe').getByRole('button',{name:'Rileggi archivio',exact:true}).click();await wait('Recipe',132);
 await page.locator('#Audit').getByRole('button',{name:'Carica registro',exact:true}).click();await wait('Audit',4);failAudit=true;await page.locator('#Audit').getByRole('button',{name:'Aggiorna dalla prima pagina',exact:true}).click();await wait('Audit',1);failAudit=false;await page.locator('#Audit').getByRole('button',{name:'Carica registro',exact:true}).click();await wait('Audit',4);
 await page.evaluate(()=>window.qa.dispose());for(const name of ['Alarm','Recipe','Audit','History','Archive'])assert.equal(await q(name),0);
 assert.equal(external,0);assert.equal(commands,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,generated,compiledStandardPanel:true,rawAlarmQuality:true,uncertainDoesNotClearAlarm:true,historicalQualityFrozen:true,persistentViewQuality:true,legacyQualityNone:true,alarmDisconnectRecovery:true,recipeReadErrorRecovery:true,recipeCaptureLimits:true,auditReadErrorRecovery:true,emptyAuditGood:true,disposedNone:true,syntheticHttpOnly:true,realPlcWrites:0,commands,external}));
}finally{await browser?.close();await server?.close();await editor?.close();}
