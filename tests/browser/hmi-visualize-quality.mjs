import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,copyFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer,build,preview} from 'vite';
const {chromium}=await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));let editor,server,browser;const errors=[];
try{
  await mkdir(path.join(root,'.hmi-preview'),{recursive:true});const generated=await mkdtemp(path.join(root,'.hmi-preview/visualize-quality-browser-'));
  editor=await createServer({root,configLoader:'runner',cacheDir:path.join(generated,'editor-cache'),server:{watch:null,warmup:{clientFiles:[]}},logLevel:'error'});
  const {standardProjectFiles}=await editor.ssrLoadModule('/src/core/standardProject.ts'),scripts=await editor.ssrLoadModule('/src/core/hmiScript.ts'),bindings=await editor.ssrLoadModule('/src/core/hmiProcessValue.ts'),qualities=await editor.ssrLoadModule('/src/core/hmiCurrentQuality.ts');
  const program=source=>{const result=scripts.inspectHmiScript(source);assert.equal(result.error,undefined);return result.program;};
  const variables=[['Speed','DInt'],['Code','WString'],['Enabled','Bool']].map(([name,dataType])=>({name,dataType,access:'read-write',address:'',description:''}));
  for(const file of standardProjectFiles({machineName:'CurrentQuality synthetic',layout:'desktop',sections:['main']})){const target=path.join(generated,file.path);assert.ok(target.startsWith(generated+path.sep));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.content);}
  await writeFile(path.join(generated,'framecraft.plc.json'),JSON.stringify({version:1,variables}));
  await writeFile(path.join(generated,'framecraft.runtime.json'),JSON.stringify({version:1,gateway:{enabled:true,path:'/_framecraft/plc/v1',pollMs:250}}));
  const attr=value=>JSON.stringify(value).replaceAll('&','&amp;').replaceAll('"','&quot;');
  const control=(id,type='text')=>'<input id="'+id+'" data-hmi-name="'+id+'" type="'+type+'" data-hmi-visualize-quality="true" style="margin:30px;width:200px" data-hmi-dynamizations="'+attr([{kind:'Tag',property:'ProcessValue',tag:id}])+'">';
  await writeFile(path.join(generated,'index.html'),'<!doctype html><html><head><link rel="icon" href="data:,"></head><body><main data-hmi-screen="Main"><button id="Run" data-hmi-name="Run">Run</button>'+control('Speed','number')+control('Speed','number').replace('id="Speed"','id="Reference"').replace('data-hmi-name="Speed"','data-hmi-name="Reference"').replace('data-hmi-visualize-quality="true"','')+control('Code')+control('Enabled')+'<input id="Local" data-hmi-name="Local" type="number" value="3"><input id="LocalRestore" data-hmi-name="LocalRestore" type="number" value="2"></main><script type="module">import{installFramecraftHmiRuntime,runtimeTagValues,runtimeTagStatus}from"/src/framecraftHmiRuntime.ts";window.qa={traces:[],errors:[],values:runtimeTagValues,status:runtimeTagStatus};window.qa.dispose=installFramecraftHmiRuntime({navigate:()=>{},routes:[],trace:m=>window.qa.traces.push(m),error:m=>window.qa.errors.push(m)});</script></body></html>');
  await symlink(process.env.FRAMECRAFT_RUNTIME_UPDATE_NODE_MODULES||path.join(root,'node_modules'),path.join(generated,'node_modules'),'junction');
  await build({root:generated,configLoader:'runner',logLevel:'error'});server=await preview({root:generated,configLoader:'runner',logLevel:'error',preview:{host:'127.0.0.1',port:0,strictPort:false}});
  const origin='http://127.0.0.1:'+server.httpServer.address().port;browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext();
  let wire=192,state='connected',external=0,writes=0;
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.protocol==='data:')return route.continue();if(url.origin!==origin){external++;return route.abort();}
    if(url.pathname==='/_framecraft/plc/v1/snapshot')return route.fulfill({json:{version:1,allowWrites:true,connections:[{id:'synthetic',state}],tags:variables.map(variable=>({...variable,connectionId:'synthetic',writable:true})),samples:variables.map(variable=>({tag:variable.name,connectionId:'synthetic',value:variable.name==='Speed'?'12':variable.name==='Enabled'?'true':'0012',qualityCode:wire,receivedAt:Date.now(),timestamp:Date.now()}))}});
    if(url.pathname.includes('/write')){writes++;return route.abort();}if(url.pathname.startsWith('/_framecraft/'))throw Error('Unexpected service '+url.pathname);return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.waitForFunction(()=>window.qa?.values().Speed==='12');
  const markers=page.locator('[data-framecraft-quality-layer] [role="img"]');await page.waitForTimeout(350);assert.equal(await markers.count(),0);
  await page.locator('#Speed').focus();const before=await page.locator('#Speed').getAttribute('style');wire=64;await page.waitForFunction(()=>document.querySelector('[data-framecraft-quality-layer] [role="img"]')?.getAttribute('aria-label')?.includes('incerti'));assert.equal(await markers.count(),3);assert.equal(await page.locator('#Speed').inputValue(),await page.locator('#Reference').inputValue());assert.equal(await page.locator('#Speed').getAttribute('style'),before);assert.equal(await page.evaluate(()=>document.activeElement.id),'Speed');
  await page.screenshot({path:path.join(generated,'quality-uncertain.png')});
  const run=async source=>{const count=await page.evaluate(()=>window.qa.traces.length);await page.locator('#Run').evaluate((element,value)=>element.setAttribute('data-hmi-events',value),JSON.stringify([{event:'Tapped',script:source,program:program(source)}]));await page.locator('#Run').click();await page.waitForFunction(count=>window.qa.traces.length>count,count);};
  await run('Screen.Items("Speed").VisualizeQuality=false;HMIRuntime.Trace("disabled="+Screen.Items("Speed").VisualizeQuality);');await page.waitForFunction(()=>document.querySelectorAll('[data-framecraft-quality-layer] [role="img"]').length===2);
  await run('Screen.Items("Speed").VisualizeQuality=true;HMIRuntime.Trace("enabled="+Screen.Items("Speed").VisualizeQuality);');await page.waitForFunction(()=>document.querySelectorAll('[data-framecraft-quality-layer] [role="img"]').length===3);
  wire=193;await page.waitForFunction(()=>document.querySelector('[data-framecraft-quality-layer] [role="img"]')?.getAttribute('aria-label')?.includes('limite inferiore'));
  const leftBefore=await page.locator('[data-framecraft-quality-layer] rect').first().getAttribute('x');
  await page.locator('#Speed').evaluate(element=>{element.style.transform='translateX(20px) rotate(10deg)';});
  await page.waitForFunction(before=>document.querySelector('[data-framecraft-quality-layer] rect')?.getAttribute('x')!==before,leftBefore);
  wire=undefined;await page.waitForFunction(()=>document.querySelector('[data-framecraft-quality-layer] [role="img"]')?.getAttribute('aria-label')?.includes('non disponibili'));
  state='reconnecting';await page.waitForFunction(()=>document.querySelector('[data-framecraft-quality-layer] [role="img"]')?.getAttribute('aria-label')?.includes('non validi'));
  state='connected';wire=192;await page.waitForFunction(()=>!document.querySelector('[data-framecraft-quality-layer]'));
  wire=64;await page.waitForFunction(()=>document.querySelector('[data-framecraft-quality-layer]'));
  await page.locator('#Speed').evaluate(element=>element.hidden=true);await page.waitForFunction(()=>document.querySelectorAll('[data-framecraft-quality-layer] [role="img"]').length===2);
  await page.locator('#Code').evaluate(element=>element.remove());await page.waitForFunction(()=>document.querySelectorAll('[data-framecraft-quality-layer] [role="img"]').length===1);
  await page.evaluate(()=>window.qa.dispose());assert.equal(await markers.count(),0);assert.equal(writes,0);assert.equal(external,0);assert.deepEqual(errors,[]);assert.deepEqual([...new Set(await page.evaluate(()=>window.qa.errors))],['[HMI collegamento ProcessValue] Il segnale non ha una lettura valida. Controlla collegamento PLC, qualità e stato del tag; il vecchio valore non viene riutilizzato.']);
  console.log(JSON.stringify({passed:true,generated,compiledStandardPanel:true,good:true,uncertain:true,missing:true,disconnected:true,limits:true,scriptToggle:true,hidden:true,deleted:true,inputFocusPreserved:true,authoredStylePreserved:true,disposed:true,realPlcWrites:0,writes,external}));
}finally{await browser?.close();await server?.close();await editor?.close();}
