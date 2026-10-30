import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,copyFile,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer as createVite,build,preview} from 'vite';
const {chromium}=await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE || 'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),base=path.join(root,'.hmi-preview');
let editor,server,browser;
try{
  await mkdir(base,{recursive:true});const generated=await mkdtemp(path.join(base,'script-functions-browser-'));
  editor=await createVite({root,configLoader:'runner',cacheDir:path.join(base,'script-functions-editor/node_modules/.vite'),server:{watch:{ignored:()=>true},warmup:{clientFiles:[]}},logLevel:'error'});
  const {standardProjectFiles}=await editor.ssrLoadModule('/src/core/standardProject.ts');
  const files=standardProjectFiles({machineName:'Script QA sintetico',layout:'desktop',sections:['main']});
  for(const file of files){const target=path.resolve(generated,file.path);assert.ok(target.startsWith(generated+path.sep));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.content);}
  await symlink(path.join(root,'node_modules'),path.join(generated,'node_modules'),process.platform==='win32'?'junction':'dir');
  const {inspectHmiScript}=await editor.ssrLoadModule('/src/core/hmiScript.ts');
  const {parseHmiScriptCatalog,serializeHmiScriptCatalog,hmiScriptFunctions}=await editor.ssrLoadModule('/src/core/hmiScriptModules.ts');
  const catalog=parseHmiScriptCatalog({globalModules:[{name:'Counter',alias:'Counter',globalDefinition:{source:'let offset=0;'},functions:[{name:'Create',parameters:['start'],source:'let value=start+offset;return ()=>{value=value+1;return value;};'}]}]});
  await writeFile(path.join(generated,'framecraft.scripts.json'),serializeHmiScriptCatalog(catalog));
  const functions=hmiScriptFunctions(catalog),attrs=(source,version)=>{const inspected=inspectHmiScript(source,functions);assert.equal(inspected.error,undefined);const program=version?{...inspected.program,version}:inspected.program;return JSON.stringify([{event:'Tapped',script:source,program}]).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');};
  let html=await readFile(new URL('../fixtures/script-functions-panel.html',import.meta.url),'utf8');
  html=html.replace('__FUNCTIONS__',attrs("const create=Modules.Counter.Create;const next=create(4);HMIRuntime.Trace('FUNCTION_VALUE='+next());HMIRuntime.Timers.SetTimeout(()=>HMIRuntime.Trace('FUNCTION_TIMER='+next()),30);"))
    .replace('__LEGACY_ONE__',attrs("let value=1;if(true){let value=2;}HMIRuntime.Trace('LEGACY_ONE='+value);",1))
    .replace('__LEGACY_TWO__',attrs("let value=1;if(true){let value=2;}HMIRuntime.Trace('LEGACY_TWO='+value);",2))
    .replace('__CANCEL__',attrs("const fn=()=>HMIRuntime.Trace('CANCEL_MUST_NOT_FIRE');HMIRuntime.Timers.SetTimeout(fn,1000);HMIRuntime.Trace('CANCEL_SCHEDULED');"));
  await writeFile(path.join(generated,'index.html'),html);await copyFile(new URL('../fixtures/audit-runtime-tsconfig.json',import.meta.url),path.join(generated,'tsconfig.script-qa.json'));
  execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.script-qa.json'],{cwd:generated,encoding:'utf8',windowsHide:true});
  await build({root:generated,configLoader:'runner',logLevel:'error'});
  server=await preview({root:generated,configLoader:'runner',preview:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
  const origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext();let external=0,tagWrites=0;const errors=[],traces=[];
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/')||url.startsWith('data:')){if(url.includes('/tags/write'))tagWrites++;return route.continue();}external++;return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{traces.push(message.text());if(message.type()==='error')errors.push(message.text());});
  await page.goto(origin);await page.waitForFunction(()=>typeof window.disposeScriptFixture==='function');
  await page.locator('#functions').click();
  const until=async check=>{const limit=Date.now()+10000;while(!check()){if(Date.now()>limit)throw Error('Missing script trace: '+JSON.stringify({traces,errors}));await new Promise(resolve=>setTimeout(resolve,25));}};
  await until(()=>traces.some(text=>text.includes('FUNCTION_VALUE=5'))&&traces.some(text=>text.includes('FUNCTION_TIMER=6')));
  await page.locator('#legacy-one').click();await page.locator('#legacy-two').click();await until(()=>traces.some(text=>text.includes('LEGACY_ONE=2'))&&traces.some(text=>text.includes('LEGACY_TWO=1')));
  await page.locator('#cancel').click();await until(()=>traces.some(text=>text.includes('CANCEL_SCHEDULED')));await page.evaluate(()=>window.disposeScriptFixture());await new Promise(resolve=>setTimeout(resolve,1200));
  assert.ok(!traces.some(text=>text.includes('CANCEL_MUST_NOT_FIRE')));assert.deepEqual(errors,[]);assert.equal(external,0);assert.equal(tagWrites,0);
  console.log(JSON.stringify({passed:true,generated,builtPanel:true,runtimeTypecheck:true,generatedBuild:true,moduleFunctionReference:true,returnedClosure:true,conciseTimerCallback:true,ir1:true,ir2:true,ir3:true,disposeClearsTimers:true,external,tagWrites}));
}finally{
  await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));await editor?.close();
}
