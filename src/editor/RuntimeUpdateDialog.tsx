import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, RefreshCw, RotateCcw, X } from 'lucide-react';
import { parse } from '@babel/parser';
import { runtimeManifestPath, runtimeUpdateBundle, planRuntimeUpdate, type RuntimeUpdateFile, type RuntimeUpdatePlan, type RuntimeUpdateSnapshot } from '../core/runtimeUpdate';
import { desktopBridge } from '../filesystem/desktopBridge';
import { useEditorStore } from '../state/editorStore';
import './runtime-update.css';

export function RuntimeUpdateDialog({onClose}:{onClose():void}) {
  const project=useEditorStore(state=>state.project),dirty=useEditorStore(state=>state.dirty),previewBusy=useEditorStore(state=>state.loading||state.previewRestarting);
  const [initial]=useState(project),[phase,setPhase]=useState<'loading'|'ready'|'saving'|'done'|'error'>('loading'),[snapshot,setSnapshot]=useState<RuntimeUpdateSnapshot>(),[plan,setPlan]=useState<RuntimeUpdatePlan>(),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false),[stopped,setStopped]=useState(false),[selected,setSelected]=useState(''),[receipt,setReceipt]=useState<string>();
  const sequence=useRef(0),mounted=useRef(true),dialog=useRef<HTMLElement>(null),closeRef=useRef(onClose),phaseRef=useRef(phase);closeRef.current=onClose;phaseRef.current=phase;
  const title=useId(),busy=phase==='saving';
  const current=(request:number)=>mounted.current&&sequence.current===request&&useEditorStore.getState().project?.root===initial?.root;
  const refresh=async()=>{
    if(!initial)return;const request=++sequence.current;setPhase('loading');setError('');setReviewed(false);setStopped(false);setReceipt(undefined);setPlan(undefined);
    try {
      const {standardProjectFiles}=await import('../core/standardProject');
      const bundle=runtimeUpdateBundle(standardProjectFiles({machineName:initial.name,layout:'desktop',sections:['main']}));
      const next=await desktopBridge.readRuntimeUpdate(initial.root,[...bundle.map(file=>file.path),runtimeManifestPath]);
      if(!current(request))return;setSnapshot(next);
      const proposed=await planRuntimeUpdate(bundle,next);if(!current(request))return;
      setSnapshot(next);setPlan(proposed);setSelected(proposed.changes.find(file=>file.kind==='review')?.path??proposed.changes[0]?.path??'');setPhase('ready');
    }catch(cause){if(current(request)){setError(cause instanceof Error?cause.message:String(cause));setPhase('error');}}
  };
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;mounted.current=true;void refresh();dialog.current?.focus();
    const keyboard=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(phaseRef.current!=='saving')closeRef.current();}else if(event.key==='Tab'){
      const items=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')??[])].filter(item=>item.getClientRects().length>0);if(!items.length){event.preventDefault();dialog.current?.focus();return;}const first=items[0],last=items.at(-1)!;if(event.shiftKey&&(document.activeElement===first||!dialog.current?.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }};window.addEventListener('keydown',keyboard,true);return()=>{mounted.current=false;sequence.current++;window.removeEventListener('keydown',keyboard,true);previous?.focus();};
    // The proposal belongs to this opening/project; fresh native generations protect writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{if(project?.root!==initial?.root)onClose();},[project?.root,initial?.root,onClose]);
  const quiesce=async()=>{
    if(useEditorStore.getState().dirty)throw Error('Salva o conserva la bozza prima di aggiornare i componenti del progetto.');
    if(useEditorStore.getState().loading||useEditorStore.getState().previewRestarting)throw Error('Attendi che l’avvio dell’anteprima finisca, poi ricarica il confronto.');
    useEditorStore.getState().closeStandalonePreview();
    useEditorStore.setState({previewSessionId:undefined,previewUrl:undefined,previewProcessExited:true,previewStatus:'idle',previewError:undefined});
    await desktopBridge.stopPreview();
  };
  const apply=async()=>{
    if(!initial||!plan||!stopped||plan.reviewCount&&!reviewed||!plan.changes.length)return;const request=++sequence.current;setPhase('saving');setError('');
    try {
      for(const file of plan.changes){if(/\.(?:ts|tsx|mts|mjs)$/.test(file.path)){try{if(file.path.endsWith('.mjs'))parse(file.after,{sourceType:'module'});else if(file.path.endsWith('.tsx'))parse(file.after,{sourceType:'module',plugins:['typescript','jsx']});else parse(file.after,{sourceType:'module',plugins:[['typescript',{dts:/\.d\.(?:ts|mts)$/.test(file.path),disallowAmbiguousJSXLike:file.path.endsWith('.mts')}]]});}catch{throw Error(`${file.path}: il codice da applicare contiene un errore di sintassi. Correggi il confronto prima di continuare.`);}}}
      await quiesce();if(!current(request))return;
      const backup=await desktopBridge.applyRuntimeUpdate(initial.root,plan.generation,plan.changes.map(({path,before,after})=>({path,before,after})));
      if(!current(request))return;setReceipt(backup);setStopped(false);setPhase('done');
      await useEditorStore.getState().refreshAiProjectFiles(initial.root,plan.changes.map(file=>file.path),{label:"Runtime",read:async(root,path)=>(await desktopBridge.readRuntimeUpdate(root,[path],false)).files[path]});
    }catch(cause){if(current(request)){setError(cause instanceof Error?cause.message:String(cause));setPhase('error');}}
  };
  const restore=async(backup:string)=>{
    if(!initial||!snapshot||!stopped)return;const request=++sequence.current;setPhase('saving');setError('');
    try{await quiesce();if(!current(request))return;await desktopBridge.restoreRuntimeUpdate(initial.root,snapshot.generation,backup);if(!current(request))return;setReceipt(backup);setStopped(false);setPhase('done');await useEditorStore.getState().refreshAiProjectFiles(initial.root,Object.keys(snapshot.files),{label:"Runtime",read:async(root,path)=>(await desktopBridge.readRuntimeUpdate(root,[path],false)).files[path]});}
    catch(cause){if(current(request)){setError(cause instanceof Error?cause.message:String(cause));setPhase('error');}}
  };
  const editAfter=(file:RuntimeUpdateFile,value:string)=>{if(!plan)return;const changes=plan.changes.map(item=>item.path===file.path?{...item,after:value,kind:'review' as const}:item);setPlan({...plan,changes,reviewCount:changes.filter(item=>item.kind==='review').length});setReviewed(false);};
  const pending=snapshot?.backups.some(backup=>!['completed','restored','rolled-back'].includes(backup.state));
  const file=plan?.changes.find(file=>file.path===selected),codeEditable=file&&(file.group==='browser'||file.group==='service')&&file.path!=='runtime/package.json'&&file.path!=='runtime/README.md';
  return createPortal(<div className="runtime-update-overlay"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title} className="runtime-update-dialog">
    <header><div><h2 id={title}>Aggiorna i componenti del pannello</h2><p>Allinea servizio PLC e Runtime browser alla versione inclusa in questo editor.</p></div><button aria-label="Chiudi aggiornamento Runtime" disabled={busy} onClick={onClose}><X size={18}/></button></header>
    <main>
      <p>Il confronto riguarda il codice dei componenti. Pagine, immagini, cataloghi esistenti, utenti e archivio operativo restano conservati. I file richiesti che mancano vengono proposti vuoti o disabilitati.</p>
      {phase==='loading'&&<p role="status">Confronto dei componenti in corso…</p>}
      {phase==='done'&&<div className="runtime-update-success" role="status"><Check size={18}/><div><strong>Operazione completata.</strong><p>Backup locale: {receipt}. L’anteprima resta ferma; puoi riavviarla quando sei pronto. Il servizio PLC va riavviato separatamente dopo le verifiche.</p><button onClick={()=>void refresh()}>Rileggi componenti e backup</button></div></div>}
      {error&&<p className="runtime-update-error" role="alert">{error}</p>}
      {dirty&&<p className="runtime-update-error">Hai una bozza non salvata: salvala o conservala prima di applicare o ripristinare file.</p>}
      {phase==='ready'&&plan&&<>
        <p className="runtime-update-count"><strong>{plan.changes.filter(file=>file.group!=='metadata').length} file da aggiornare</strong><span>{plan.reviewCount} da confrontare · il pacchetto si applica insieme</span></p>
        {!plan.changes.length&&<p role="status">I componenti inclusi nell’editor sono già presenti in questa versione.</p>}
        {plan.warnings.map(warning=><p className="runtime-update-warning" key={warning}><AlertTriangle size={14}/>{warning}</p>)}
        {!!plan.changes.length&&<details className="runtime-update-details"><summary>Confronta i file e integra eventuali personalizzazioni</summary><div className="runtime-update-workspace">
          <nav aria-label="File dell’aggiornamento">{plan.changes.map(file=><button className={selected===file.path?'selected':''} key={file.path} onClick={()=>setSelected(file.path)}><span>{file.path}</span><small>{file.kind==='create'?'Nuovo file':file.kind==='review'?'Da confrontare':'Componente riconosciuto'}</small></button>)}</nav>
          {file&&<section className="runtime-update-diff" aria-label={`Confronto ${file.path}`}><h3>{file.path}</h3><p>{codeEditable?'Puoi integrare le personalizzazioni nel codice da applicare. La sintassi verrà controllata prima delle scritture.':'Questa parte del pacchetto non è modificabile dal confronto.'}</p><div><label>Prima<pre tabIndex={0}>{file.before??'File non presente nel progetto.'}</pre></label><label>Dopo{codeEditable?<textarea aria-label={`Codice da applicare: ${file.path}`} value={file.after} spellCheck={false} onChange={event=>editAfter(file,event.target.value)}/>:<pre tabIndex={0}>{file.after}</pre>}</label></div></section>}
        </div></details>}
        {plan.reviewCount>0&&<label className="runtime-update-confirm"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>Ho confrontato i file da verificare e integrato le personalizzazioni da conservare.</label>}
      </>}
      {snapshot&&snapshot.backups.length>0&&<details className="runtime-update-backups" open={pending}><summary>Backup e ripristino ({snapshot.backups.length})</summary>{pending&&<p className="runtime-update-error">Un aggiornamento precedente è rimasto incompleto. Ripristinalo prima di applicare un nuovo pacchetto.</p>}{snapshot.backups.slice(0,8).map(backup=><div key={backup.id}><span>{new Date(backup.createdAt).toLocaleString('it-IT')} · {backup.fileCount} file<small>{backup.state==='completed'?'Aggiornamento completato':backup.state==='restored'?'Ripristinato':backup.state==='rolled-back'?'Annullato dopo un errore':'Da recuperare'} · {backup.id}</small></span><button disabled={busy||dirty||!stopped||backup.state==='restored'||backup.state==='rolled-back'} onClick={()=>void restore(backup.id)}><RotateCcw size={13}/>Ripristina</button></div>)}</details>}
      {(phase==='ready'||phase==='error')&&<label className="runtime-update-confirm"><input type="checkbox" checked={stopped} disabled={busy} onChange={event=>setStopped(event.target.checked)}/>Ho arrestato il servizio PLC di questo progetto. L’app fermerà anche l’anteprima prima delle scritture.</label>}
    </main>
    <footer><span>{busy?'Scrittura e backup in corso: attendi il completamento.':'Il backup conserva i file originali. Non vengono installate dipendenze né inviati comandi al PLC.'}</span><button disabled={busy} onClick={()=>void refresh()}><RefreshCw size={14}/>Ricarica confronto</button><button className="runtime-update-apply" disabled={busy||phase!=='ready'||!plan?.changes.length||!stopped||dirty||previewBusy||pending||!!plan?.reviewCount&&!reviewed} onClick={()=>void apply()}>{busy?'Operazione in corso…':'Crea backup e aggiorna'}</button></footer>
  </section></div>,document.body);
}
