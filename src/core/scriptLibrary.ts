import {parse} from '@babel/parser';
import MagicString from 'magic-string';
import {inspectHmiScript,inspectHmiScriptProgram} from './hmiScript';
import {hmiScriptCatalogIssues,parseHmiScriptCatalog,hmiScriptFunctions,hmiScriptVariables,type HmiGlobalScriptModule,type HmiScriptAttribution,type HmiScriptCatalog} from './hmiScriptModules';
export const scriptLibraryMaxBytes=2*1024*1024;
export interface ScriptLibraryModule {name:string;alias:string;globalSource?:string;functions:{name:string;parameters:string[];source:string}[];attributions:HmiScriptAttribution[]}
export interface ScriptLibraryVersion {version:string;notes:string;modules:ScriptLibraryModule[];sha256:string}
export interface ScriptLibraryMetadata {id:string;name:string;license:string;notice:string}
export interface ScriptLibrary extends ScriptLibraryMetadata {format:'framecraft-script-library';schema:1;versions:ScriptLibraryVersion[]}
export interface ScriptLibraryChange {alias:string;kind:'add'|'adopt'|'same'|'update'|'customized';before:string;after:string;tagsRead:string[];tagsWritten:string[];fromVersion?:string;toVersion:string;downgrade:boolean}
export interface ScriptLibraryPlan {base:string;next:HmiScriptCatalog;changes:ScriptLibraryChange[];mode:'type'|'copy';library:string;version:string}
const identifier=/^[A-Za-z_$][\w$]*$/;
const versionPattern=/^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/;
function object(value:unknown,keys:readonly string[],label:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw Error(label+': formato non valido o campi non previsti.');return value as Record<string,unknown>;}
function text(value:unknown,label:string,max:number,empty=false):string{if(typeof value!=='string'||value.length>max||!empty&&!value.trim()||value.includes('\u0000'))throw Error(label+': testo mancante o troppo lungo.');return value.replace(/\r\n?/g,'\n');}
function version(value:unknown):string{const result=text(value,'Versione',32);if(!versionPattern.test(result))throw Error('Usa una versione come 1.0.0, senza prefissi o zeri iniziali.');return result;}
function compare(a:string,b:string):number{const left=a.split('.').map(Number),right=b.split('.').map(Number);for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]-right[i];return 0;}
function sorted<T>(values:T[],key:(item:T)=>string):T[]{return [...values].sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);}
function attribution(value:unknown):HmiScriptAttribution{const raw=object(value,['id','name','version','license','notice'],'Attribuzione');return{id:text(raw.id,'Identità attribuzione',128),name:text(raw.name,'Nome attribuzione',128),version:version(raw.version),license:text(raw.license,'Licenza attribuzione',256),notice:text(raw.notice,'Note legali',8000,true)};}
function notices(values:unknown):HmiScriptAttribution[]{if(!Array.isArray(values)||values.length>32)throw Error('Le attribuzioni devono essere un elenco di massimo 32 voci.');const result=values.map(attribution),unique=new Map(result.map(item=>[JSON.stringify(item),item]));return sorted([...unique.values()],item=>JSON.stringify(item));}
function moduleSource(value:unknown):ScriptLibraryModule{
 const raw=object(value,['name','alias','globalSource','functions','attributions'],'Modulo');const alias=text(raw.alias,'Alias',128);if(!identifier.test(alias))throw Error('Alias non valido: '+alias);
 if(!Array.isArray(raw.functions)||raw.functions.length>128)throw Error('Un modulo può contenere fino a 128 funzioni.');
 const functions=raw.functions.map(value=>{const fn=object(value,['name','parameters','source'],'Funzione'),name=text(fn.name,'Nome funzione',128);if(!identifier.test(name)||!Array.isArray(fn.parameters)||fn.parameters.length>32||fn.parameters.some(item=>typeof item!=='string'||!identifier.test(item))||new Set(fn.parameters).size!==fn.parameters.length)throw Error('Nome o parametri della funzione non validi.');return{name,parameters:fn.parameters as string[],source:text(fn.source,'Sorgente funzione',20000,true)};});
 if(new Set(functions.map(fn=>fn.name)).size!==functions.length)throw Error('La libreria contiene funzioni con lo stesso nome.');
 const globalSource=raw.globalSource===undefined?undefined:text(raw.globalSource,'Definizione globale',20000,true);
 return{name:text(raw.name,'Nome modulo',128).trim(),alias,...(globalSource?.trim()?{globalSource}:{}),functions:sorted(functions,fn=>fn.name),attributions:notices(raw.attributions??[])};
}
function metadata(value:ScriptLibraryMetadata):ScriptLibraryMetadata{const id=text(value.id,'Identità della libreria',128);if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id))throw Error('Identità libreria: usa lettere, numeri, punti o trattini.');return{id,name:text(value.name,'Nome libreria',128),license:text(value.license,'Licenza',256),notice:text(value.notice,'Note legali',8000,true)};}
async function digest(value:unknown):Promise<string>{if(!globalThis.crypto?.subtle)throw Error('Il controllo di integrità non è disponibile: apri Framecraft nell’app desktop o su localhost.');const bytes=new TextEncoder().encode(JSON.stringify(value)),hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');}
function releaseContent(library:ScriptLibraryMetadata,release:Omit<ScriptLibraryVersion,'sha256'>){return{format:'framecraft-script-library',schema:1,...metadata(library),version:release.version,notes:release.notes,modules:release.modules};}
export async function readScriptLibrary(source:string):Promise<ScriptLibrary>{
 if(typeof source!=='string'||new TextEncoder().encode(source).length>scriptLibraryMaxBytes)throw Error('La libreria supera 2 MB. Separa i moduli o le versioni in file più piccoli.');
 let raw:Record<string,unknown>;try{raw=object(JSON.parse(source),['format','schema','id','name','license','notice','versions'],'Libreria');}catch{throw Error('Scegli una libreria Framecraft JSON valida, non un catalogo del progetto o un programma compilato.');}
 if(raw.format!=='framecraft-script-library'||raw.schema!==1||!Array.isArray(raw.versions)||!raw.versions.length||raw.versions.length>16)throw Error('Formato libreria non supportato: sono richiesti schema 1 e da 1 a 16 versioni.');
 const header=metadata(raw as unknown as ScriptLibraryMetadata),releases:ScriptLibraryVersion[]=[];
 for(const item of raw.versions){const r=object(item,['version','notes','modules','sha256'],'Versione');if(!Array.isArray(r.modules)||!r.modules.length||r.modules.length>32)throw Error('Una versione richiede da 1 a 32 moduli.');const modules=sorted(r.modules.map(moduleSource),module=>module.alias);if(new Set(modules.map(module=>module.alias)).size!==modules.length||modules.reduce((count,module)=>count+module.functions.length,0)>256)throw Error('Alias duplicati o più di 256 funzioni nella versione.');const release={version:version(r.version),notes:text(r.notes,'Note versione',4000,true),modules};if(typeof r.sha256!=='string'||r.sha256!==await digest(releaseContent(header,release)))throw Error('L’integrità della versione '+release.version+' non corrisponde. Recupera il file originale; non modificare a mano una versione rilasciata.');releases.push({...release,sha256:r.sha256});}
 if(new Set(releases.map(release=>release.version)).size!==releases.length)throw Error('La libreria contiene versioni duplicate.');
 return{format:'framecraft-script-library',schema:1,...header,versions:releases.sort((a,b)=>compare(a.version,b.version))};
}
export function serializeScriptLibrary(library:ScriptLibrary):string{const source=JSON.stringify(library,null,2)+'\n';if(new TextEncoder().encode(source).length>scriptLibraryMaxBytes)throw Error('La libreria supera 2 MB. Mantieni le versioni precedenti in un file di archivio.');return source;}
function projectSource(module:HmiGlobalScriptModule):ScriptLibraryModule{
 if(module.libraryIssue)throw Error("Risolvi prima i metadati di libreria del modulo "+module.alias+": non verranno scartate le attribuzioni durante l’esportazione.");
 const origin=module.library;
 return moduleSource({name:module.name,alias:module.alias,...(module.globalDefinition?{globalSource:module.globalDefinition.source}:{}),functions:module.functions.map(fn=>({name:fn.name,parameters:fn.parameters,source:fn.source})),attributions:origin?[{id:origin.id,name:origin.name,version:origin.version,license:origin.license,notice:origin.notice},...origin.attributions]:[]});
}
function visits(source:string,visit:(alias:string,start:number,end:number,computed:boolean)=>void):void{
 const ast=parse(source,{sourceType:'module',allowReturnOutsideFunction:true,allowAwaitOutsideFunction:true});
 const walk=(value:unknown)=>{if(!value||typeof value!=='object')return;const node=value as Record<string,any>;
  if(node.type==='MemberExpression'&&node.object?.type==='Identifier'&&node.object.name==='Modules'){
   const name=!node.computed&&node.property?.type==='Identifier'?node.property.name:node.computed&&node.property?.type==='StringLiteral'?node.property.value:undefined;
   if(typeof name!=='string')throw Error('Le dipendenze di libreria richiedono alias Modules statici.');visit(name,node.property.start,node.property.end,Boolean(node.computed));
  }
  for(const [key,child]of Object.entries(node))if(!['loc','extra','comments','tokens','errors'].includes(key)){if(Array.isArray(child))child.forEach(walk);else walk(child);}
 };walk(ast);
}
function dependencies(module:ScriptLibraryModule):string[]{const result=new Set<string>();for(const source of [module.globalSource??'',...module.functions.map(fn=>fn.source)])visits(source,alias=>result.add(alias));return[...result];}
function compile(modules:ScriptLibraryModule[]):HmiScriptCatalog{
 const catalog=parseHmiScriptCatalog({globalModules:modules.map(module=>({name:module.name,alias:module.alias,...(module.globalSource?{globalDefinition:{source:module.globalSource}}:{}),functions:module.functions}))});
 const issues=hmiScriptCatalogIssues(catalog);if(issues.length)throw Error('La libreria non è compilabile: '+issues[0]);return catalog;
}
export async function releaseScriptLibrary(library:ScriptLibrary|undefined,details:ScriptLibraryMetadata,catalog:HmiScriptCatalog,roots:string[],releaseVersion:string,notes:string):Promise<ScriptLibrary>{
 const previous=library?await readScriptLibrary(serializeScriptLibrary(library)):undefined,header=previous?metadata(previous):metadata(details),nextVersion=version(releaseVersion);
 if(previous&&JSON.stringify(metadata(details))!==JSON.stringify(header))throw Error('Identità, licenza e note della libreria rilasciata sono immutabili. Crea una libreria distinta per cambiarli.');
 if(previous&&(previous.versions.some(item=>item.version===nextVersion)||compare(nextVersion,previous.versions.at(-1)!.version)<=0))throw Error('La versione è già rilasciata o non è successiva: scegli un numero più alto.');
 if(!roots.length||new Set(catalog.globalModules.map(module=>module.alias)).size!==catalog.globalModules.length)throw Error('Scegli un modulo e correggi gli alias duplicati prima di esportare.');
 const sources=new Map(catalog.globalModules.map(module=>[module.alias,projectSource(module)])),included=new Map<string,ScriptLibraryModule>(),queue=[...roots];
 while(queue.length){const alias=queue.shift()!;if(included.has(alias))continue;const module=sources.get(alias);if(!module)throw Error('Manca la dipendenza Modules.'+alias+': aggiungila al progetto prima di rilasciare la libreria.');included.set(alias,module);if(included.size>32)throw Error('Il modulo e le sue dipendenze superano 32 moduli.');queue.push(...dependencies(module));}
 const packageAliases:Record<string,string>=Object.create(null);
 for(const alias of included.keys()){const pin=catalog.globalModules.find(module=>module.alias===alias)?.library;packageAliases[alias]=previous&&pin?.id===header.id?pin.alias:alias;}
 if(new Set(Object.values(packageAliases)).size!==included.size)throw Error('Sono presenti più copie dello stesso tipo. Per conservarle con alias diversi crea una libreria distinta.');
 const modules=sorted([...included.values()].map(module=>remap(module,packageAliases)),module=>module.alias);compile(modules);
 const release={version:nextVersion,notes:text(notes,'Note versione',4000,true),modules};const result:ScriptLibrary={format:'framecraft-script-library',schema:1,...header,versions:[...(previous?.versions??[]),{...release,sha256:await digest(releaseContent(header,release))}]};return readScriptLibrary(serializeScriptLibrary(result));
}
export function scriptLibraryAliases(catalog:HmiScriptCatalog,library:ScriptLibrary,release:ScriptLibraryVersion,mode:'type'|'copy'):Record<string,string>{
 const used=new Set(catalog.globalModules.map(module=>module.alias)),result:Record<string,string>=Object.create(null);
 for(const module of release.modules){const linked=mode==='type'?catalog.globalModules.find(item=>item.library?.mode==='type'&&item.library.id===library.id&&item.library.alias===module.alias):undefined;const existing=catalog.globalModules.find(item=>item.alias===module.alias),adopt=mode==='type'&&existing&&!existing.library&&JSON.stringify(content(projectSource(existing)))===JSON.stringify(content(module));let alias=linked?.alias??module.alias;if(!linked&&!adopt){const base=alias;let suffix=2;while(used.has(alias))alias=base+suffix++;}used.add(alias);result[module.alias]=alias;}return result;
}
function remap(module:ScriptLibraryModule,aliases:Record<string,string>):ScriptLibraryModule{
 const source=(value:string)=>{const code=new MagicString(value);visits(value,(alias,start,end,computed)=>{const next=aliases[alias];if(!next)throw Error('La dipendenza Modules.'+alias+' non è inclusa nella libreria.');if(next!==alias)code.overwrite(start,end,computed?JSON.stringify(next):next);});return code.toString();};
 return{...module,alias:aliases[module.alias],...(module.globalSource===undefined?{}:{globalSource:source(module.globalSource)}),functions:module.functions.map(fn=>({...fn,source:source(fn.source)}))};
}
function content(module:ScriptLibraryModule):Omit<ScriptLibraryModule,'attributions'>{const{attributions:_ignored,...result}=module;return result;}
function moduleText(module:ScriptLibraryModule):string{return['// '+module.name+' · alias '+module.alias,module.globalSource??'',...module.functions.map(fn=>'function '+fn.name+'('+fn.parameters.join(', ')+') {\n'+fn.source.split('\n').map(line=>'  '+line).join('\n')+'\n}')].filter(Boolean).join('\n\n');}
function api(module:HmiGlobalScriptModule):Map<string,string>{const result=new Map(module.functions.map(fn=>[fn.name,JSON.stringify(fn.parameters)]));for(const item of module.globalDefinition?.program?.exports??[])result.set(item.name,'export');return result;}
export async function planScriptLibraryImport(catalog:HmiScriptCatalog,library:ScriptLibrary,releaseVersion:string,mode:'type'|'copy',aliases:Record<string,string>):Promise<ScriptLibraryPlan>{
 const checked=await readScriptLibrary(serializeScriptLibrary(library)),release=checked.versions.find(item=>item.version===releaseVersion);if(!release)throw Error('La versione scelta non è disponibile nella libreria.');if(!['type','copy'].includes(mode))throw Error('Scegli tipo collegato o copia indipendente.');
 const mapped=release.modules.map(module=>{const alias=aliases[module.alias];if(typeof alias!=='string'||alias.length>128||!identifier.test(alias))throw Error('Scegli un alias JavaScript valido per '+module.alias+'.');return remap(module,aliases);});
 if(new Set(mapped.map(module=>module.alias)).size!==mapped.length)throw Error('Assegna un alias diverso a ogni modulo della libreria.');
 const compiled=compile(mapped),next=structuredClone(catalog),changes:ScriptLibraryChange[]=[];
 for(let index=0;index<mapped.length;index++){
  const incoming=mapped[index],original=release.modules[index],module=compiled.globalModules.find(module=>module.alias===incoming.alias)!;
  const current=catalog.globalModules.find(item=>item.alias===incoming.alias),linked=catalog.globalModules.find(item=>item.library?.mode==='type'&&item.library.id===checked.id&&item.library.alias===original.alias);
  const moduleDigest=await digest(content(incoming)),before=current?content(projectSource(current)):undefined,previousDigest=before?await digest(before):undefined,adopt=Boolean(current&&!current.library&&mode==='type'&&previousDigest===moduleDigest);
  if(mode==='type'&&linked&&linked.alias!==incoming.alias)throw Error('Mantieni l’alias '+linked.alias+' per aggiornare il tipo; usa una copia indipendente se vuoi un nuovo alias.');
  if(current&&!adopt&&(mode!=='type'||current.library?.mode!=='type'||current.library.id!==checked.id||current.library.alias!==original.alias))throw Error('L’alias '+incoming.alias+' è già usato da un modulo diverso. Scegli un nuovo alias: il modulo esistente non verrà sostituito.');
  if(current?.library&&(current.library.name!==checked.name||current.library.license!==checked.license||current.library.notice!==checked.notice))throw Error('I metadati della libreria sono cambiati: usa una nuova identità per cambiare nome, licenza o condizioni di una libreria rilasciata.');
  if(current?.library&&current.library.version===release.version&&current.library.release!==release.sha256)throw Error('La versione '+release.version+' ha un contenuto diverso da quella già collegata. Recupera l’originale o rilascia una nuova versione.');
  if(current){const beforeApi=api(parseHmiScriptCatalog({globalModules:[current]}).globalModules[0]),afterApi=api(module),broken=[...beforeApi].filter(([name,signature])=>afterApi.get(name)!==signature).map(([name])=>name);if(broken.length)throw Error('Questa versione cambia o rimuove l’interfaccia '+broken.join(', ')+'. Importala come copia indipendente e migra le azioni prima di sostituire il tipo.');}
  const entry:HmiGlobalScriptModule={...module,library:{mode,id:checked.id,name:checked.name,version:release.version,license:checked.license,notice:checked.notice,alias:original.alias,digest:moduleDigest,release:release.sha256,attributions:incoming.attributions}};
  if(current)next.globalModules[next.globalModules.findIndex(item=>item.alias===current.alias)]=entry;else next.globalModules.push(entry);
  const functions=hmiScriptFunctions(compiled),variables=hmiScriptVariables(compiled),inspections=module.functions.map(fn=>inspectHmiScript(fn.source,functions,module.globalDefinition?.program,fn.parameters,variables));
  if(module.globalDefinition?.program)inspections.push(inspectHmiScriptProgram(module.globalDefinition.program,functions,undefined,[],variables));
  changes.push({alias:incoming.alias,kind:!current?'add':adopt?'adopt':previousDigest===moduleDigest?'same':previousDigest!==current.library?.digest?'customized':'update',before:current?moduleText(projectSource(current)):'',after:moduleText(incoming),tagsRead:[...new Set(inspections.flatMap(item=>item.tagsRead))],tagsWritten:[...new Set(inspections.flatMap(item=>item.tagsWritten))],fromVersion:current?.library?.version,toVersion:release.version,downgrade:Boolean(current?.library&&compare(release.version,current.library.version)<0)});
 }
 const issues=hmiScriptCatalogIssues(parseHmiScriptCatalog(next));if(issues.length)throw Error('L’aggiornamento lascia riferimenti non validi nel progetto: '+issues[0]);return{base:await digest(catalog),next,changes,mode,library:checked.name,version:release.version};
}
export async function applyScriptLibraryPlan(catalog:HmiScriptCatalog,plan:ScriptLibraryPlan,review:{code:boolean;customized:boolean;downgrade:boolean}):Promise<HmiScriptCatalog>{
 if(await digest(catalog)!==plan.base)throw Error('Il catalogo è cambiato durante il confronto. Riapri la libreria e prepara una nuova proposta.');
 if(!review.code||plan.changes.some(change=>change.kind==='customized')&&!review.customized||plan.changes.some(change=>change.downgrade)&&!review.downgrade)throw Error('Confronta il codice e conferma le personalizzazioni o il ripristino richiesti prima di applicare.');
 return structuredClone(plan.next);
}
