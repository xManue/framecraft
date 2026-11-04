import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,copyFile,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
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
  const catalog=parseHmiScriptCatalog({globalModules:[{name:'Counter',alias:'Counter',globalDefinition:{source:'let offset=0;'},functions:[{name:'Create',parameters:['start'],source:'let value=start+offset;return ()=>{value=value+1;return value;};'},{name:'Join',parameters:['values'],source:'function join(...items){return [...items].join(",");}return join(...values);'}]}]});
  await writeFile(path.join(generated,'framecraft.scripts.json'),serializeHmiScriptCatalog(catalog));
  const functions=hmiScriptFunctions(catalog),attrs=(source,version)=>{const inspected=inspectHmiScript(source,functions);assert.equal(inspected.error,undefined);const program=JSON.parse(JSON.stringify(inspected.program));if(version){const downgrade=value=>{if(!value||typeof value!=="object")return;if(Array.isArray(value.statements))value.version=version;if(version<5&&(value.kind==="function-value"||Array.isArray(value.statements))){delete value.arrow;delete value.displayName;}for(const child of Object.values(value))downgrade(child);};downgrade(program);}return JSON.stringify([{event:'Tapped',script:source,program}]).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');};
  let html=await readFile(new URL('../fixtures/script-functions-panel.html',import.meta.url),'utf8');
  html=html.replace('__FUNCTIONS__',attrs("const create=Modules.Counter.Create;const next=create(4);HMIRuntime.Trace('FUNCTION_VALUE='+next());HMIRuntime.Timers.SetTimeout(()=>HMIRuntime.Trace('FUNCTION_TIMER='+next()),30);"))
    .replace('__LEGACY_ONE__',attrs("let value=1;if(true){let value=2;}HMIRuntime.Trace('LEGACY_ONE='+value);",1))
    .replace('__LEGACY_TWO__',attrs("let value=1;if(true){let value=2;}HMIRuntime.Trace('LEGACY_TWO='+value);",2))
    .replace('__LEGACY_THREE__',attrs("function make(value){return ()=>value;}const read=make(7);HMIRuntime.Trace('LEGACY_THREE='+read());",3))
    .replace('__ARRAYS__',attrs("const values=[3,1,2].map(value=>value*2).filter(value=>value>2);values.sort((a,b)=>a-b);HMIRuntime.Trace('ARRAYS='+JSON.stringify(values));HMIRuntime.Trace('REDUCE='+values.reduce((sum,value)=>sum+value,0));HMIRuntime.Trace('MISSING='+String(values.find(value=>false)));HMIRuntime.Trace('SPARSE='+JSON.stringify([,1].map(value=>value*2)));"))
    .replace('__LEGACY_FOUR__',attrs("const values=[3,1,2].map(value=>value*2);values.sort((a,b)=>a-b);HMIRuntime.Trace('LEGACY_FOUR='+values.join(','));",4))
    .replace('__THIS__',attrs("function label(prefix){this.Text=prefix+this.Name;}const target=this.Items('ReceiverTarget');label.call(target,'Updated ');HMIRuntime.Trace('THIS_SCREEN='+(this===Screen));HMIRuntime.Trace('THIS_ITEM='+target.Text);HMIRuntime.Trace('THIS_ARRAY='+[1,2].map(function(value){return value*this.factor;},{factor:3}).join(','));const bound=(function(value){return this.base+value;}).bind({base:4},3);HMIRuntime.Trace('THIS_BOUND='+bound());HMIRuntime.Timers.SetTimeout(()=>{HMIRuntime.Trace('THIS_TIMER='+(this===Screen));},10);HMIRuntime.Timers.SetTimeout(function(){HMIRuntime.Trace('THIS_NORMAL='+typeof this);},10);"))
    .replace('__SPREAD__',attrs("const source={nested:{value:2}};const copy={...source};copy.nested.value=3;function sum(start,...values){return values.reduce((total,value)=>total+value,start);}HMIRuntime.Trace('REST='+sum(...[1,2,3]));HMIRuntime.Trace('SPREAD='+JSON.stringify([...[,1],'😀']));HMIRuntime.Trace('SPREAD_ALIAS='+source.nested.value);HMIRuntime.Trace('SPREAD_MODULE='+Modules.Counter.Join(...[[4,5]]));HMIRuntime.Timers.SetTimeout((...args)=>HMIRuntime.Trace('REST_TIMER='+args.length),10);"))
    .replace('__LEGACY_FIVE__',attrs("function read(){return this.value;}HMIRuntime.Trace('LEGACY_FIVE='+read.call({value:5}));",5))
    .replace('__PATTERNS__',attrs("const {speed=4,...copy}={other:2};function sum([first=1,...tail]=[]){return first+tail.reduce((total,value)=>total+value,0);}HMIRuntime.Trace('PATTERN='+speed+':'+copy.other);HMIRuntime.Trace('PARAMETER='+sum([1,2,3]));try{const [value=value]=[];}catch(error){HMIRuntime.Trace('PATTERN_TDZ');}HMIRuntime.Timers.SetTimeout((value=7)=>HMIRuntime.Trace('DEFAULT_TIMER='+value),10);"))
    .replace('__LEGACY_SIX__',attrs("function read(value){return [...value].join(',');}HMIRuntime.Trace('LEGACY_SIX='+read(...[[1,2]]));",6))
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
  await page.locator('#legacy-three').click();await page.locator('#arrays').click();await until(()=>['LEGACY_THREE=7','ARRAYS=[4,6]','REDUCE=10','MISSING=undefined','SPARSE=[null,2]'].every(expected=>traces.some(text=>text.includes(expected))));
  await page.locator('#legacy-four').click();await page.locator('#this').click();await until(()=>['LEGACY_FOUR=2,4,6','THIS_SCREEN=true','THIS_ITEM=Updated ReceiverTarget','THIS_ARRAY=3,6','THIS_BOUND=7','THIS_TIMER=true','THIS_NORMAL=undefined'].every(expected=>traces.some(text=>text.includes(expected))));assert.equal(await page.locator('#this-target').textContent(),'Updated ReceiverTarget');
  await page.locator('#spread').click();await page.locator('#legacy-five').click();await until(()=>['REST=6','SPREAD=[null,1,"😀"]','SPREAD_ALIAS=3','SPREAD_MODULE=4,5','REST_TIMER=0','LEGACY_FIVE=5'].every(expected=>traces.some(text=>text.includes(expected))));
  const vm=await import(pathToFileURL(path.join(generated,'runtime/scheduler-program.mjs')).href);const spreadProgram=inspectHmiScript('function sum(...values){return [...values].reduce((total,value)=>total+value,0);}return sum(...[1,2,3]);').program;assert.equal(vm.executeHmiScript(spreadProgram,{}).returned,6);
  await page.locator('#patterns').click();await page.locator('#legacy-six').click();await until(()=>['PATTERN=4:2','PARAMETER=6','DEFAULT_TIMER=7','PATTERN_TDZ','LEGACY_SIX=1,2'].every(expected=>traces.some(text=>text.includes(expected))));
  const parameterProgram=inspectHmiScript('function read({value=4}={}){const [first=1]=[];return value+first;}return read();').program;assert.equal(vm.executeHmiScript(parameterProgram,{}).returned,5);
  await page.locator('#cancel').click();await until(()=>traces.some(text=>text.includes('CANCEL_SCHEDULED')));await page.evaluate(()=>window.disposeScriptFixture());await new Promise(resolve=>setTimeout(resolve,1200));
  assert.ok(!traces.some(text=>text.includes('CANCEL_MUST_NOT_FIRE')));assert.deepEqual(errors,[]);assert.equal(external,0);assert.equal(tagWrites,0);
  console.log(JSON.stringify({passed:true,generated,builtPanel:true,runtimeTypecheck:true,generatedBuild:true,moduleFunctionReference:true,returnedClosure:true,conciseTimerCallback:true,ir1:true,ir2:true,ir3:true,ir4:true,ir5:true,ir6:true,ir7:true,bindingPatterns:true,parameterDefaults:true,parameterTdz:true,dataSpreads:true,argumentSpreads:true,restParameters:true,nodeVm:true,screenThis:true,thisArg:true,boundFunction:true,graphicalThisItem:true,arrayCallbacks:true,undefinedValues:true,sparseArrays:true,disposeClearsTimers:true,external,tagWrites}));
}finally{
  await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));await editor?.close();
}
