import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,build,preview} from 'vite';
const {chromium}=await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));let editor,server,browser;let external=0;const errors=[];
try {
 await mkdir(path.join(root,'.hmi-preview'),{recursive:true});const generated=await mkdtemp(path.join(root,'.hmi-preview/trend-quality-browser-'));
 editor=await createServer({root,configLoader:'runner',cacheDir:path.join(generated,'editor-cache'),server:{watch:null,warmup:{clientFiles:[]}},logLevel:'error'});
 const {standardProjectFiles}=await editor.ssrLoadModule('/src/core/standardProject.ts'),scripts=await editor.ssrLoadModule('/src/core/hmiScript.ts');
 const q=scripts.inspectHmiScript('return Screen.Items("Chart").CurrentQuality;');assert.equal(q.error,undefined);
 for(const file of standardProjectFiles({machineName:'Trend quality synthetic',layout:'desktop',sections:['main']})){const target=path.join(generated,file.path);assert.ok(target.startsWith(generated+path.sep));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.content);}
 const scenario=`
 import {createHmiPropertyFlashing,createHmiPropertyFlashingDomSurface} from '/src/framecraftHmiFlashing.ts';
 import {resolveHmiCurrentQuality} from '/src/framecraftHmiCurrentQuality.ts';
 import {executeHmiScript} from '/src/framecraftScriptRuntime.ts';
 import {renderHmiTrendControl,clearHmiTrendHistory} from '/src/framecraftHmiTrend.ts';
 import {renderHmiFunctionTrendControl,clearHmiFunctionTrendHistory} from '/src/framecraftHmiFunctionTrend.ts';
 const chart=document.querySelector('#Chart'),definitions=[{name:'A',dataType:'Array of Real',access:'read'},{name:'B',dataType:'Array of Real',access:'read'}];
 let values={A:'[1,2]',B:'[3,4]'},status={A:{qualityCode:192},B:{qualityCode:192}},connected=true;
 const surface=createHmiPropertyFlashingDomSurface(document),controller=createHmiPropertyFlashing(Object.assign(surface,{resolveCurrentQuality:(sources,ctx)=>resolveHmiCurrentQuality(sources,ctx,definitions,()=>connected)}));
 const manager=controller.context(surface.items().find(item=>item.name==='Chart').itemId);
 window.qa={chart,surface,controller,manager,q:()=>{const result=executeHmiScript(${JSON.stringify(q.program)},values,{screenItems:manager,tagStatus:status,requireQuality:true});if(result.error)throw Error(result.error);if(Object.keys(result.writes).length)throw Error('Unexpected write');return result.returned;},update:(v,s,c=true)=>{values=v;status=s;connected=c;},time:(config,options={})=>{chart.dataset.hmiTrend=JSON.stringify(config);chart.removeAttribute('data-hmi-function-trend');renderHmiTrendControl(chart,values,{now:1000,status,...options});},xy:(config,options={})=>{chart.dataset.hmiFunctionTrend=JSON.stringify(config);chart.removeAttribute('data-hmi-trend');renderHmiFunctionTrendControl(chart,values,{now:1000,status,...options});},clear:()=>{clearHmiTrendHistory(chart);clearHmiFunctionTrendHistory(chart);}};
 `;
 await writeFile(path.join(generated,'qa.ts'),scenario);await writeFile(path.join(generated,'index.html'),'<!doctype html><html><head><link rel="icon" href="data:,"></head><body><main data-hmi-screen="Main"><div id="Chart" data-hmi-name="Chart"></div></main><script type="module" src="/qa.ts"></script></body></html>');
 await symlink(process.env.FRAMECRAFT_RUNTIME_UPDATE_NODE_MODULES||path.join(root,'node_modules'),path.join(generated,'node_modules'),'junction');await build({root:generated,configLoader:'runner',logLevel:'error'});server=await preview({root:generated,configLoader:'runner',logLevel:'error',preview:{host:'127.0.0.1',port:0,strictPort:false}});
 const origin='http://127.0.0.1:'+server.httpServer.address().port;browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext();await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin||url.protocol==='data:')return route.continue();external++;return route.abort();});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>window.qa);
 const {defaultHmiTrendConfig}=await import('../../scripts/hmi-trend.mjs'),{defaultHmiFunctionTrendConfig}=await import('../../scripts/hmi-function-trend.mjs');const time=defaultHmiTrendConfig(),xy=defaultHmiFunctionTrendConfig();time.timeRangeMs=1000;time.trends=[{...time.trends[0],tag:'A'}];xy.trends[0].x.tag='A';xy.trends[0].y.tag='B';
 const query=()=>page.evaluate(()=>window.qa.q());
 await page.evaluate(config=>window.qa.xy(config),xy);assert.equal(await query(),4);
 await page.evaluate(config=>{window.qa.update({A:'[1,2]',B:'[3,4]'},{A:{qualityCode:192},B:{qualityCode:66}});window.qa.xy(config,{now:2000});},xy);assert.equal(await query(),66);
 await page.locator('[data-hmi-fx-action="pause"]').click();await page.evaluate(config=>{window.qa.update({A:'invalid',B:'invalid'},{A:{qualityCode:0},B:{qualityCode:0}},false);window.qa.xy(config,{now:3000});},xy);assert.equal(await query(),66);
 await page.evaluate(()=>window.qa.clear());assert.equal(await query(),0);
 await page.evaluate(config=>{window.qa.update({A:'1',B:'2'},{A:{qualityCode:192},B:{qualityCode:192}});window.qa.time(config);},time);assert.equal(await query(),4);
 time.trends[0].source='log';time.trends[0].logId='history';time.trends[0].loggedTagId='value';await page.evaluate(config=>{window.qa.update({}, {},false);window.qa.time(config,{history:()=>[{time:1000,value:5,qualityCode:194}],historyState:()=> 'ready'});},time);assert.equal(await query(),68);
 await page.evaluate(config=>window.qa.time(config,{history:()=>[],historyState:()=> 'loading'}),time);assert.equal(await query(),0);await page.evaluate(config=>window.qa.time(config,{history:()=>[],historyState:()=> 'error'}),time);assert.equal(await query(),1);await page.evaluate(config=>window.qa.time(config,{history:()=>[],historyState:()=> 'ready'}),time);assert.equal(await query(),0);
 await page.evaluate(()=>window.qa.surface.dispose());assert.deepEqual(errors,[]);assert.equal(external,0);console.log(JSON.stringify({passed:true,generated,compiledStandardPanel:true,arrayQuality:true,uncertainLimits:true,paused:true,cleared:true,onlineScalar:true,historicalQuality:true,historyLoading:true,historyError:true,emptyHistory:true,realPlcWrites:0,external}));
}finally {await browser?.close();await server?.close();await editor?.close();}
