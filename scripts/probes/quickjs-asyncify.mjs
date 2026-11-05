// Deliberately outside the application and normal tests. Uses synthetic data only.
// Install the pinned candidates in an ignored directory as documented in ADR-JS-001.
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync,mkdtempSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dependencies=path.resolve(process.argv[2]??'.hmi-preview/javascript-engine-probe/node_modules');
const pinned=['quickjs-emscripten-core','@jitl/quickjs-wasmfile-release-asyncify'];
for(const name of pinned){const pkg=JSON.parse(readFileSync(path.join(dependencies,name,'package.json'),'utf8'));if(pkg.version!=='0.32.0')throw Error('This reproduction requires '+name+' 0.32.0');}
const root=path.resolve('.hmi-preview');mkdirSync(root,{recursive:true});const output=mkdtempSync(path.join(root,'quickjs-asyncify-repro-'));
const core=pathToFileURL(path.join(dependencies,pinned[0],'dist/index.mjs')).href;
const variant=pathToFileURL(path.join(dependencies,pinned[1],'dist/index.mjs')).href;
const child=path.join(output,'probe.mjs');
writeFileSync(child,`
import {newQuickJSAsyncWASMModuleFromVariant} from ${JSON.stringify(core)};
import variant from ${JSON.stringify(variant)};
const module=await newQuickJSAsyncWASMModuleFromVariant(variant),vm=module.newContext();
vm.runtime.setMemoryLimit(8*1024*1024);vm.runtime.setMaxStackSize(256*1024);
let calls=0,ticks=0;vm.runtime.setInterruptHandler(()=>++ticks>100);
const read=vm.newAsyncifiedFunction('read',async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return vm.newNumber(7);});
vm.setProp(vm.global,'read',read);read.dispose();
const mode=process.argv[2];
const code=mode==='promise'?'(async()=>{await Promise.resolve();return read();})()':'class Motor{#speed;constructor(speed){this.#speed=speed;}*values(){yield this.#speed;}};new Motor(read()).values().next().value';
try{
 const handle=vm.unwrapResult(await vm.evalCodeAsync(code));let value;
 if(mode==='promise'){vm.unwrapResult(vm.runtime.executePendingJobs(10));const result=vm.unwrapResult(await vm.resolvePromise(handle));value=vm.dump(result);result.dispose();}
 else value=vm.dump(handle);
 handle.dispose();vm.dispose();console.log(JSON.stringify({mode,value,calls}));
}catch(error){console.log(JSON.stringify({mode,calls,error:String(error)}));process.exitCode=1;}
`);
const reports=[];
for(const mode of ['direct','promise']){
 const run=spawnSync(process.execPath,[child,mode],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:128*1024});
 writeFileSync(path.join(output,mode+'.log'),(run.stdout??'')+'\n'+(run.stderr??''));
 const result=(run.stdout??'').split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>{try{return JSON.parse(line);}catch{return undefined;}}).find(Boolean);
 reports.push({mode,exit:run.status,timeout:run.error?.code==='ETIMEDOUT',value:result?.value,calls:result?.calls,passed:run.status===0&&result?.value===7&&result?.calls===1,hostRefInvalid:(run.stderr??'').includes('QuickJSHostRefInvalid'),error:result?.error});
}
console.log(JSON.stringify({candidate:'quickjs-emscripten 0.32.0 asyncify',output,results:reports,productionEligible:reports.every(result=>result.passed)}));
if(!reports.every(result=>result.passed))process.exitCode=1;
