import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import type {HmiScriptCatalog} from '../core/hmiScriptModules';
import {applyScriptLibraryPlan,scriptLibraryAliases,scriptLibraryMaxBytes,serializeScriptLibrary,type ScriptLibrary,type ScriptLibraryMetadata,type ScriptLibraryPlan,type ScriptLibraryReview} from '../core/scriptLibrary';
import type {ScriptLibraryJob} from '../core/scriptLibraryWorker';
import './script-library.css';
export function ScriptLibraryDialog({catalog,selectedAlias,onApply,onClose,onMigrate,migrationBlocked}:{catalog:HmiScriptCatalog;selectedAlias?:string;onApply(catalog:HmiScriptCatalog):void;onClose():void;onMigrate?(plan:ScriptLibraryPlan,review:ScriptLibraryReview):void;migrationBlocked?:string}){
 const [initial]=useState(catalog),[tab,setTab]=useState<'use'|'release'>('use'),[library,setLibrary]=useState<ScriptLibrary>(),[selected,setSelected]=useState(''),[mode,setMode]=useState<'type'|'copy'>('type'),[aliases,setAliases]=useState<Record<string,string>>({}),[plan,setPlan]=useState<ScriptLibraryPlan>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 const [details,setDetails]=useState<ScriptLibraryMetadata>({id:'',name:'',license:'',notice:''}),[root,setRoot]=useState(selectedAlias??catalog.globalModules[0]?.alias??''),[releaseVersion,setReleaseVersion]=useState('1.0.0'),[notes,setNotes]=useState(''),[extend,setExtend]=useState(false),[codeReview,setCodeReview]=useState(false),[customReview,setCustomReview]=useState(false),[downReview,setDownReview]=useState(false),[selectedChange,setSelectedChange]=useState(''),[download,setDownload]=useState<{url:string;name:string}>(),[closeWarning,setCloseWarning]=useState(false),[downloaded,setDownloaded]=useState(false);
 const title=useId(),dialog=useRef<HTMLElement>(null),mounted=useRef(true),sequence=useRef(0),active=useRef<{worker:Worker;reject(error:Error):void}|undefined>(undefined),closeRequest=useRef<()=>void>(()=>{}),close=useRef(onClose);close.current=onClose;
 const liveCatalog=useRef(catalog);liveCatalog.current=catalog;
 const migrate=!!plan&&(plan.projectUpdate||!!plan.interfaceChanges?.length),migrationError=migrate?(migrationBlocked??(!onMigrate?'Apri la libreria dal progetto per aggiornare anche le pagine.':'')):'';
 const stale=catalog!==initial,release=library?.versions.find(item=>item.version===selected),changed=plan?.changes.find(item=>item.alias===selectedChange)??plan?.changes[0];
 const cancel=()=>{sequence.current++;const operation=active.current;active.current=undefined;operation?.reject(new Error('Operazione annullata.'));};
 useEffect(()=>{
  mounted.current=true;const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeRequest.current();}else if(event.key==='Tab'&&!dialog.current?.contains(document.activeElement)){event.preventDefault();dialog.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();}};
  document.addEventListener('keydown',key,true);
  return()=>{mounted.current=false;cancel();document.removeEventListener('keydown',key,true);previous?.focus();};
 },[]);
 useEffect(()=>{if(stale){cancel();setBusy(false);setPlan(undefined);setError('Il catalogo è cambiato. Chiudi e riapri la libreria per confrontare la bozza corrente.');}},[stale]);
 useEffect(()=>()=>{if(download)URL.revokeObjectURL(download.url);},[download]);
 const invalidate=()=>{setPlan(undefined);setCodeReview(false);setCustomReview(false);setDownReview(false);setError('');setInfo('');};
 const run=async<T,>(request:ScriptLibraryJob):Promise<T|undefined>=>{
  cancel();const current=sequence.current;setBusy(true);setError('');setInfo('');
  try{
   const result=await new Promise<T>((resolve,reject)=>{
    const worker=new Worker(new URL('../core/scriptLibraryWorker.ts',import.meta.url),{type:'module'});
    const timeout=setTimeout(()=>{finish();reject(new Error('Il controllo della libreria ha superato 15 secondi. Separa i moduli o riduci il codice; la bozza resta invariata.'));},15000);
    const finish=()=>{clearTimeout(timeout);worker.terminate();if(active.current?.worker===worker)active.current=undefined;};
    active.current={worker,reject:error=>{finish();reject(error);}};
    worker.onmessage=event=>{finish();if(event.data?.ok)resolve(event.data.value as T);else reject(new Error(event.data?.error??'Il controllo della libreria non è riuscito.'));};
    worker.onerror=()=>{finish();reject(new Error('Non è stato possibile avviare il controllo della libreria. Attendi gli aggiornamenti dell’editor e riprova.'));};
    worker.postMessage(request);
   });if(mounted.current&&sequence.current===current)return result;
  }catch(error){if(mounted.current&&sequence.current===current)setError(error instanceof Error?error.message:'Libreria non disponibile.');}
  finally{if(mounted.current&&sequence.current===current)setBusy(false);}
 };
 const openFile=async(file:File|undefined)=>{
  if(!file)return;invalidate();clearDownload();if(file.size>scriptLibraryMaxBytes){setError('La libreria supera 2 MB. Scegli un file più piccolo.');return;}
  setBusy(true);let token=++sequence.current;
  try{const source=await file.text();if(!mounted.current||sequence.current!==token||stale)return;const parsed=await run<ScriptLibrary>({kind:'read',source});if(!parsed)return;token=sequence.current;
   setLibrary(parsed);const latest=parsed.versions.at(-1)!;setSelected(latest.version);setMode('type');setAliases(scriptLibraryAliases(initial,parsed,latest,'type'));setExtend(false);setDetails({id:parsed.id,name:parsed.name,license:parsed.license,notice:parsed.notice});setInfo('Libreria controllata. Scegli la versione e prepara il confronto. L’integrità non certifica l’autore del file.');
  }catch(error){if(mounted.current&&sequence.current===token){setError(error instanceof Error?error.message:'Non riesco a leggere il file. Scegli nuovamente la libreria JSON.');setBusy(false);}}
 };
 const chooseVersion=(value:string,nextMode=mode)=>{invalidate();setSelected(value);setMode(nextMode);const found=library?.versions.find(item=>item.version===value);if(library&&found)setAliases(scriptLibraryAliases(initial,library,found,nextMode));};
 const prepare=async()=>{if(!library)return;invalidate();const result=await run<ScriptLibraryPlan>({kind:'plan',library,version:selected,catalog:initial,mode,aliases,allowMigration:true});if(result){setPlan(result);setSelectedChange(result.changes.find(item=>item.kind==='customized')?.alias??result.changes.find(item=>item.kind==='update')?.alias??result.changes[0]?.alias??'');}};
 const apply=async()=>{if(!plan||stale||busy||migrationError)return;if(migrate){onMigrate?.(plan,{code:codeReview,customized:customReview,downgrade:downReview});return;}setBusy(true);setError('');try{const next=await applyScriptLibraryPlan(catalog,plan,{code:codeReview,customized:customReview,downgrade:downReview});if(mounted.current&&liveCatalog.current===initial){onApply(next);onClose();}}catch(error){if(mounted.current)setError(error instanceof Error?error.message:'La bozza non è stata cambiata.');}finally{if(mounted.current)setBusy(false);}};
 const publish=async()=>{
  const result=await run<ScriptLibrary>({kind:'release',library:extend?library:undefined,details:extend&&library?library:details,catalog:initial,roots:[root],version:releaseVersion,notes});if(!result)return;
  setDownload({url:URL.createObjectURL(new Blob([serializeScriptLibrary(result)],{type:'application/json;charset=utf-8'})),name:result.id+'.framecraft-script-library.json'});setDownloaded(false);setInfo('Versione preparata con le dipendenze e le attribuzioni. Scarica il file per conservarla; il progetto non è stato modificato.');
 };
 const requestClose=()=>{if(download&&!downloaded){setCloseWarning(true);return;}close.current();};
 closeRequest.current=requestClose;
 const keyDown=(event:React.KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();requestClose();}if(event.key==='Tab'){
  const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')??[]).filter(element=>element.offsetParent!==null),first=elements[0],last=elements.at(-1);if(!first){event.preventDefault();return;}if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }};
 const clearDownload=()=>{setDownload(undefined);setDownloaded(false);setInfo('');};
 const currentDetails=extend&&library?library:details;
 const counts=useMemo(()=>({custom:plan?.changes.filter(item=>item.kind==='customized').length??0,down:plan?.changes.filter(item=>item.downgrade).length??0}),[plan]);
 return createPortal(<div className="script-library-overlay" onKeyDown={keyDown}><section ref={dialog} className="script-library-dialog" role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1}>
  <header><div><h2 id={title}>Librerie di script</h2><p>Riusa moduli tra progetti e scegli quando aggiornarli.</p></div><button aria-label="Chiudi libreria script" onClick={requestClose}><X size={18}/></button></header>
  <nav aria-label="Operazione libreria"><button aria-pressed={tab==='use'} onClick={()=>setTab('use')}>Usa una libreria</button><button aria-pressed={tab==='release'} onClick={()=>setTab('release')}>Crea una versione</button></nav>
  <main aria-busy={busy}>
   <label className="script-library-file">Apri una libreria Framecraft<input type="file" accept=".json" disabled={busy||stale} onChange={event=>{void openFile(event.target.files?.[0]);event.target.value='';}}/></label>
   {error&&<p role="alert" className="script-library-error">{error}</p>}{info&&<p role="status">{info}</p>}{busy&&<p role="status">Controllo sorgenti e dipendenze… Nessuno script viene eseguito.</p>}
   {tab==='use'&&<>
    {!library?<p>Apri il file della libreria. Vedrai versioni, licenza, codice e tag prima di aggiungere i moduli alla bozza.</p>:<details open={!plan} className="script-library-origin"><summary>{library.name} · versione {selected} · {mode==='type'?'tipo collegato':'copia indipendente'}</summary>
     <section className="script-library-summary"><strong>{library.name}</strong><span>{library.id} · {library.license}</span>{library.notice&&<details><summary>Autore e condizioni d’uso dichiarate</summary><pre>{library.notice}</pre></details>}<small>Controlla di avere i diritti per usare e distribuire questo codice. Il file dichiara la licenza, non ne certifica la provenienza.</small></section>
     <fieldset disabled={busy||stale} className="script-library-fields"><label>Versione<select aria-label="Versione libreria" value={selected} onChange={event=>chooseVersion(event.target.value)}>{library.versions.map(item=><option key={item.version} value={item.version}>{item.version}</option>)}</select></label><label>Come inserirla<select aria-label="Modalità importazione libreria" value={mode} onChange={event=>chooseVersion(selected,event.target.value as typeof mode)}><option value="type">Tipo collegato · versione fissata</option><option value="copy">Copia indipendente · senza aggiornamenti collegati</option></select></label></fieldset>
     <p>{release?.notes}</p><p>Gli alias sono i nomi usati in <code>Modules.Alias.Funzione()</code>. I riferimenti interni alla libreria seguono gli alias scelti.</p>
     <fieldset disabled={busy||stale} className="script-library-aliases">{release?.modules.map(module=><label key={module.alias}>{module.name}<input aria-label={'Alias per '+module.alias} value={aliases[module.alias]??''} onChange={event=>{invalidate();setAliases({...aliases,[module.alias]:event.target.value});}}/></label>)}</fieldset>
     {release?.modules.some(module=>module.attributions.length>0)&&<details><summary>Attribuzioni incluse nei moduli</summary>{release.modules.map(module=>module.attributions.length>0&&<section key={module.alias}><strong>{module.name}</strong>{module.attributions.map((item,index)=><pre key={index}>{item.name+' '+item.version+' · '+item.license+'\n'+item.notice}</pre>)}</section>)}</details>}
     <button disabled={busy||stale} onClick={()=>void prepare()}>Confronta con la bozza</button>
    </details>}
    {plan&&<section className="script-library-comparison" aria-label="Confronto della libreria"><label>Modulo da confrontare<select value={selectedChange} onChange={event=>setSelectedChange(event.target.value)}>{plan.changes.map(item=><option key={item.alias} value={item.alias}>{item.alias} · {{add:'nuovo',adopt:'collega codice identico',same:'stesso codice',update:'aggiornamento',customized:'personalizzato'}[item.kind]}</option>)}</select></label>
     {changed&&<><p>{changed.fromVersion?'Versione '+changed.fromVersion+' → ':''}{changed.toVersion}{changed.downgrade?' · ripristino di una versione precedente':''}</p><div className="script-library-diff"><label>Codice attuale<textarea aria-label="Codice attuale del modulo" readOnly value={changed.before||'Modulo assente dal progetto.'}/></label><label>Codice proposto<textarea aria-label="Codice proposto dalla libreria" readOnly value={changed.after}/></label></div><p>Tag letti: {changed.tagsRead.join(', ')||'nessuno rilevato'}. Tag scritti: {changed.tagsWritten.join(', ')||'nessuno rilevato'}. Collega e verifica i tag del progetto prima di usare il modulo.</p></>}
     <p>{migrate?'Questo aggiornamento richiede il confronto del progetto. Nel passaggio successivo colleghi le interfacce cambiate e controlli pagine, eventi, dinamizzazioni e moduli prima del salvataggio con backup.':'Viene aggiornata la bozza del catalogo. Premi poi Salva moduli per usarla nel pannello.'}</p>{migrationError&&<p role="alert" className="script-library-error">{migrationError}</p>}
    </section>}
   </>}
   {tab==='release'&&<fieldset disabled={busy||stale} className="script-library-publish">
    <label>Modulo da rilasciare<select aria-label="Modulo da rilasciare" value={root} onChange={event=>{clearDownload();setRoot(event.target.value);}}>{initial.globalModules.map(module=><option key={module.alias} value={module.alias}>{module.name} · {module.alias}</option>)}</select></label>
    <p>Il file include il modulo e le dipendenze <code>Modules</code> presenti nel progetto. Le attribuzioni importate sono conservate. Non aggiunge pagine, configurazioni di connessione o programmi compilati. Controlla i valori presenti nei sorgenti prima di condividere il file.</p>
    {library&&<label><input type="checkbox" checked={extend} onChange={event=>{clearDownload();setExtend(event.target.checked);if(event.target.checked){const last=library.versions.at(-1)!.version.split('.').map(Number);setReleaseVersion(last[0]+'.'+last[1]+'.'+(last[2]+1));}}}/>Aggiungi una versione alla libreria aperta: {library.name}</label>}
    <div className="script-library-fields">{(['id','name','license'] as const).map(key=><label key={key}>{{id:'Identità stabile della libreria',name:'Nome',license:'Licenza dichiarata'}[key]}<input aria-label={{id:'Identità libreria',name:'Nome libreria',license:'Licenza libreria'}[key]} disabled={extend||busy||stale} value={currentDetails[key]} placeholder={key==='license'?'MIT, Apache-2.0 o licenza proprietaria':key==='id'?'azienda.utilita':''} onChange={event=>{clearDownload();setDetails({...details,[key]:event.target.value});}}/></label>)}<label>Nuova versione<input aria-label="Nuova versione libreria" value={releaseVersion} onChange={event=>{clearDownload();setReleaseVersion(event.target.value);}} placeholder="1.0.0"/></label></div>
    <label>Autore, copyright e condizioni d’uso<textarea aria-label="Note legali libreria" disabled={extend||busy||stale} value={currentDetails.notice} onChange={event=>{clearDownload();setDetails({...details,notice:event.target.value});}}/></label>
    <label>Cosa cambia in questa versione<textarea aria-label="Note nuova versione" value={notes} onChange={event=>{clearDownload();setNotes(event.target.value);}}/></label>
    <button disabled={!root||busy||stale} onClick={()=>void publish()}>Prepara file della versione</button>
    {download&&<a href={download.url} download={download.name} onClick={()=>setDownloaded(true)}>Scarica {download.name}</a>}
   </fieldset>}
  </main>
  <footer>{closeWarning?<><p>La versione preparata non è ancora stata scaricata. Vuoi chiudere e perderla?</p><button onClick={()=>setCloseWarning(false)}>Torna alla libreria</button><button onClick={()=>close.current()}>Chiudi senza scaricare</button></>:<>{tab==='use'&&plan&&<div className="script-library-review-options">     <label><input type="checkbox" checked={codeReview} onChange={event=>setCodeReview(event.target.checked)}/>Ho confrontato codice, tag e attribuzioni di tutti i moduli proposti.</label>
     {counts.custom>0&&<label><input type="checkbox" checked={customReview} onChange={event=>setCustomReview(event.target.checked)}/>Sostituisci le personalizzazioni nei {counts.custom} moduli segnalati. Il codice attuale è mostrato nel confronto.</label>}
     {counts.down>0&&<label><input type="checkbox" checked={downReview} onChange={event=>setDownReview(event.target.checked)}/>Confermo il ripristino della versione precedente.</label>}
</div>}<span>{stale?'Bozza cambiata':busy?'Controllo in corso':'Importazione in bozza · nessuna esecuzione automatica'}</span><button onClick={requestClose}>Chiudi</button>{tab==='use'&&<button disabled={!plan||busy||stale||!!migrationError||!codeReview||counts.custom>0&&!customReview||counts.down>0&&!downReview} onClick={()=>void apply()}>{migrate?'Continua con il progetto':'Applica alla bozza'}</button>}</>}</footer>
 </section></div>,document.body);
}
