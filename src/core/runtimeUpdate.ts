import type { GeneratedProjectFile } from './standardProject';

export const runtimeManifestPath = 'framecraft.runtime-components.json';
export const runtimeBundleVersion = '2026.11.02.1';
export interface RuntimeUpdateChange { path:string; before:string|null; after:string }
export interface RuntimeBackup { id:string; state:string; createdAt:number; fileCount:number; failure?:string }
export interface RuntimeUpdateSnapshot { generation:number; files:Record<string,string|null>; backups:RuntimeBackup[] }
export interface RuntimeUpdateFile extends RuntimeUpdateChange { kind:'create'|'known'|'review'; group:'service'|'browser'|'config'|'metadata' }
export interface RuntimeUpdatePlan { generation:number; changes:RuntimeUpdateFile[]; reviewCount:number; dependenciesChanged:boolean; warnings:string[]; totalBytes:number }
interface RuntimeManifest { version:1; bundleVersion:string; files:Record<string,string> }
const requiredConfigs=new Set(['framecraft.runtime.json','framecraft.connections.json','framecraft.plc.json','framecraft.scripts.json','framecraft.auth.json','framecraft.alarms.json','framecraft.recipes.json','framecraft.recipe-plc.json','framecraft.recipe-apply.json','framecraft.logs.json','framecraft.resources.json','framecraft.profiles.json','framecraft.faceplates.json','framecraft.recipes-ui.json','framecraft.header.json']);
export function isRuntimeUpdatePath(path:string):boolean {
  if (path===runtimeManifestPath||requiredConfigs.has(path)) return true;
  if (!/^[A-Za-z0-9_./-]+$/.test(path)||path.includes('..')||path.split('/').some(p=>!p||p.startsWith('.'))) return false;
  return /^runtime\/[A-Za-z0-9_.-]+\.(?:mjs|mts)$/.test(path)||path==='runtime/package.json'||path==='runtime/README.md'||/^src\/framecraft[A-Za-z0-9_-]+\.(?:ts|tsx|mjs|mts|css)$/.test(path)||/^src\/framecraft[A-Za-z0-9_-]+\.d\.(?:ts|mts)$/.test(path);
}
export function runtimeUpdateBundle(files:GeneratedProjectFile[]):GeneratedProjectFile[] {
  const picked=files.filter(file=>isRuntimeUpdatePath(file.path)&&file.path!==runtimeManifestPath).sort((a,b)=>a.path.localeCompare(b.path));
  if (!picked.some(f=>f.path==='runtime/scheduler-service.mjs')||!picked.some(f=>f.path==='src/framecraftHmiRuntime.ts')||new Set(picked.map(f=>f.path.toLowerCase())).size!==picked.length) throw Error('Il pacchetto Runtime dell’editor non è completo. Non è stato modificato il progetto.');
  return picked;
}
async function fingerprint(source:string):Promise<string> {
  const bytes=new TextEncoder().encode(source);const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function manifest(source:string|null|undefined):RuntimeManifest|undefined {
  if (!source) return;
  try {const value=JSON.parse(source);if(value.version!==1||typeof value.bundleVersion!=='string'||!value.files||typeof value.files!=='object'||Array.isArray(value.files)||Object.entries(value.files).some(([path,hash])=>!isRuntimeUpdatePath(path)||path===runtimeManifestPath||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)))return;return value;}catch{return;}
}
function mergedPackage(before:string,after:string):{source:string;dependenciesChanged:boolean} {
  let current:Record<string,any>,next:Record<string,any>;
  try { current=JSON.parse(before);next=JSON.parse(after); } catch { throw Error("runtime/package.json non è leggibile come JSON. Correggilo prima di aggiornare i componenti."); }
  if(!current||Array.isArray(current)||typeof current!=='object'||current.type!==undefined&&current.type!=='module'||current.scripts!==undefined&&(!current.scripts||typeof current.scripts!=='object'||Array.isArray(current.scripts))||current.dependencies!==undefined&&(!current.dependencies||typeof current.dependencies!=='object'||Array.isArray(current.dependencies))||current.engines!==undefined&&(!current.engines||typeof current.engines!=='object'||Array.isArray(current.engines)))throw Error('runtime/package.json non è un pacchetto ES module riconoscibile. Confrontalo prima di aggiornarlo.');
  const dependenciesChanged=Object.entries(next.dependencies??{}).some(([key,value])=>current.dependencies?.[key]!==value);
  return{source:JSON.stringify({...current,type:'module',engines:{...(current.engines??{}),node:next.engines.node},scripts:{...(current.scripts??{}),...next.scripts},dependencies:{...(current.dependencies??{}),...next.dependencies}},null,2)+'\n',dependenciesChanged};
}
export async function planRuntimeUpdate(bundle:GeneratedProjectFile[],snapshot:RuntimeUpdateSnapshot):Promise<RuntimeUpdatePlan> {
  const old=manifest(snapshot.files[runtimeManifestPath]),warnings:string[]=[],changes:RuntimeUpdateFile[]=[],hashes:Record<string,string>={};let dependenciesChanged=false,totalBytes=0;
  if(old&&/^\d{4}\.\d{1,2}\.\d{1,2}\.\d+$/.test(old.bundleVersion)){const previous=old.bundleVersion.split(".").map(Number),current=runtimeBundleVersion.split(".").map(Number);const index=previous.findIndex((value,index)=>value!==current[index]);if(index>=0&&previous[index]>current[index])throw Error("Questo progetto usa componenti più recenti di questo editor. Aggiorna Framecraft prima di modificarli.");}
  if(snapshot.files[runtimeManifestPath]&&!old)warnings.push('I metadati del Runtime precedente non sono leggibili: i file diversi richiedono confronto esplicito.');
  for(const file of bundle){
    if(!isRuntimeUpdatePath(file.path)||!Object.hasOwn(snapshot.files,file.path))throw Error('Il confronto dei file non è completo. Ricarica la proposta.');
    const before=snapshot.files[file.path];
    if(requiredConfigs.has(file.path)&&before!==null) continue; // Existing machine catalogs are never replaced.
    let after=file.content;
    if(file.path==='runtime/package.json'&&before===null)dependenciesChanged=true;
    if(file.path==='runtime/package.json'&&before!==null){const merged=mergedPackage(before,after);after=merged.source;dependenciesChanged=merged.dependenciesChanged;}
    const hash=await fingerprint(after);hashes[file.path]=hash;
    if(before===after)continue;
    if(before!==null&&old?.files[file.path]===hash&&file.path!=="runtime/package.json"){warnings.push(`${file.path}: base già aggiornata, personalizzazioni conservate.`);continue;}
    totalBytes+=new TextEncoder().encode((before??'')+after).length;
    const kind=before===null?'create':old?.files[file.path]===await fingerprint(before)?'known':'review';
    changes.push({path:file.path,before,after,kind,group:requiredConfigs.has(file.path)?'config':file.path.startsWith('runtime/')?'service':'browser'});
  }
  if(!changes.length)return{generation:snapshot.generation,changes:[],reviewCount:0,dependenciesChanged:false,warnings,totalBytes:0};
  const content=JSON.stringify({version:1,bundleVersion:runtimeBundleVersion,files:hashes},null,2)+'\n';
  const priority=(path:string)=>path==="runtime/runtime-update-guard.mjs"?0:["runtime/start-gateway.mjs","runtime/start-mqtt.mjs"].includes(path)?1:2;
  changes.sort((a,b)=>priority(a.path)-priority(b.path));
  changes.push({path:runtimeManifestPath,before:snapshot.files[runtimeManifestPath]??null,after:content,kind:'known',group:'metadata'});
  if(changes.length>384||totalBytes>24*1024*1024)throw Error('Aggiornamento troppo grande per una singola operazione. Nessun file è stato modificato.');
  const reviewCount=changes.filter(c=>c.kind==='review').length;
  if(changes.some(file=>file.path==="runtime/scheduler-service.mjs"))warnings.push("Dopo l’aggiornamento scegli in Script l’account del servizio per le operazioni pianificate. Con il gateway attivo, i browser non le eseguono più localmente.");
  if(reviewCount)warnings.push('Alcuni file hanno personalizzazioni oppure appartengono a una versione senza metadati. Confronta prima e dopo: il pacchetto va applicato insieme.');
  if(dependenciesChanged)warnings.push('Cambiano le dipendenze del servizio. Dopo l’aggiornamento esegui npm install nella cartella runtime e controlla il lockfile prima di riavviare il PLC.');
  return{generation:snapshot.generation,changes,reviewCount,dependenciesChanged,warnings,totalBytes};
}
