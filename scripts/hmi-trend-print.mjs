// A print view is an immutable, local copy. It has no scripts, transports or live bindings.
export function canPrintTrendHost(host){
  if(!host?.isConnected||!host.ownerDocument?.defaultView)return false;
  for(let element=host;element;element=element.parentElement){
    if(element.hidden||element.hasAttribute('inert')||element.hasAttribute('disabled')||element.getAttribute('aria-disabled')==='true'||element.getAttribute('data-fc-reacts')==='false')return false;
    for(const prefix of ['data-fc-user-requires','data-fc-user-visible-requires'])if(element.getAttribute(prefix)&&element.getAttribute(prefix.replace('requires','granted'))!=='true')return false;
    const style=host.ownerDocument.defaultView?.getComputedStyle(element);
    if(style&&(style.display==='none'||style.pointerEvents==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity!==''&&Number(style.opacity)===0))return false;
  }
  return true;
}
export function captureTrendPrintSvg(svg){
  if(!svg||svg.localName!=='svg')throw Error('Il grafico non è ancora pronto. Attendi il caricamento e riprova.');
  const document=svg.ownerDocument,view=document.defaultView,ns='http://www.w3.org/2000/svg';
  const output=document.implementation.createDocument(ns,'svg',null),allowed=new Set(['svg','g','path','rect','line','polyline','polygon','circle','ellipse','text','tspan','title','desc','defs','clippath','mask','lineargradient','radialgradient','stop']);
  const attributes=new Set(('viewBox x y x1 x2 y1 y2 width height d points cx cy r rx ry fill stroke stroke-width stroke-dasharray stroke-linecap stroke-linejoin stroke-opacity fill-opacity opacity font-size font-family font-weight font-style text-anchor dominant-baseline transform clip-path id vector-effect overflow preserveAspectRatio gradientUnits gradientTransform offset stop-color stop-opacity role aria-label data-framecraft-print-note').split(' '));
  const properties=['fill','stroke','stroke-width','stroke-dasharray','stroke-linecap','stroke-linejoin','stroke-opacity','fill-opacity','opacity','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','text-decoration','visibility','display','vector-effect'];
  let nodes=0,bytes=0;const started=view?.performance.now()??0;
  const safe=value=>{
    if(!/url\(/i.test(value))return value;
    const match=/^url\(["']?(#[a-zA-Z_][\w.:-]{0,127})["']?\)$/.exec(value.trim());
    if(match)return 'url('+match[1]+')';
    throw Error('Il grafico contiene riferimenti esterni non stampabili. Usa il controllo grafico aggiornato.');
  };
  const check=value=>{bytes+=value.length;if(bytes>8000000)throw Error('Il grafico è troppo dettagliato per la stampa. Riduci l’intervallo o il numero di punti della vista.');return value;};
  const clone=(node,depth=0)=>{
    if(++nodes>50000||depth>128||nodes%256===0&&view&&view.performance.now()-started>200)throw Error('Il grafico è troppo dettagliato per la stampa. Riduci l’intervallo o il numero di punti della vista.');
    if(node.nodeType===3){if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(node.textContent))throw Error('Un’etichetta contiene caratteri non stampabili. Rinominala e riprova.');return output.createTextNode(check(node.textContent));}
    if(node.nodeType!==1)return null;
    if(!allowed.has(node.localName.toLowerCase()))throw Error('Il grafico contiene elementi non stampabili. Usa il controllo grafico aggiornato.');
    const target=output.createElementNS(ns,node.localName);
    for(const attribute of node.attributes)if(attributes.has(attribute.name))target.setAttribute(attribute.name,check(safe(attribute.value)));
    const computed=view?.getComputedStyle(node)??node.style;
    for(const property of properties){const value=computed?.getPropertyValue(property);if(value)target.style.setProperty(property,check(safe(value)));}
    for(const child of node.childNodes){const copy=clone(child,depth+1);if(copy)target.appendChild(copy);}
    return target;
  };
  const result=clone(svg);
  const box=(result.getAttribute('viewBox')??'').trim().split(/[ ,]+/).map(Number);
  if(box.length!==4||!box.every(Number.isFinite)||box[2]<=0||box[3]<=0||box.some(value=>Math.abs(value)>1000000))throw Error('Le dimensioni del grafico non sono valide per la stampa. Riprova dopo aver aggiornato il controllo.');
  result.removeAttribute('width');result.removeAttribute('height');result.style.removeProperty('display');
  if(view){const backgrounds=[];let depth=0;for(let element=svg;element&&depth++<64;element=element.parentElement){const color=view.getComputedStyle(element).backgroundColor;if(color&&color!=='transparent'&&color!=='rgba(0, 0, 0, 0)')backgrounds.push(color);}for(const color of backgrounds){const background=output.createElementNS(ns,'rect');for(const[key,value]of Object.entries({x:box[0],y:box[1],width:box[2],height:box[3],fill:safe(color)}))background.setAttribute(key,String(value));result.insertBefore(background,result.firstChild);}}
  const Serializer=view?.XMLSerializer??globalThis.XMLSerializer;
  return new Serializer().serializeToString(result);
}
export function buildTrendPrintDocument(snapshot,sourceDocument){
  const text=(value,limit=4000)=>{if(typeof value!=='string'||value.length>limit||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw Error('Un’etichetta della stampa è troppo lunga o non valida. Riducila e riprova.');return value;};
  if(!snapshot||snapshot.version!==1||!['time','xy'].includes(snapshot.kind)||!Number.isFinite(snapshot.capturedAt)||!Array.isArray(snapshot.series)||snapshot.series.length>9||!Array.isArray(snapshot.details)||snapshot.details.length>20||typeof snapshot.svg!=='string'||snapshot.svg.length>8000000)throw Error('La vista da stampare non è valida. Chiudi l’anteprima e riprova dal grafico.');
  const document=sourceDocument.implementation.createHTMLDocument('Stampa - '+text(snapshot.caption,2000));
  const csp=document.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'";document.head.prepend(csp);
  const style=document.createElement('style');style.textContent='@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;padding:0;color:#202124;background:#fff;font:9pt/1.4 "Segoe UI",Arial,sans-serif}h1{font-size:16pt;line-height:1.2;margin:0 0 5mm}p{margin:2mm 0;overflow-wrap:anywhere}.meta{color:#454950}.chart{width:100%;margin:4mm 0;break-inside:avoid}.chart>svg{display:block;width:100%;height:auto;max-height:125mm}table{break-inside:avoid;width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5pt}th,td{padding:1.5mm;text-align:left;vertical-align:top;border-bottom:1px solid #d5d7da;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.swatch{display:inline-block;width:9mm;margin-right:2mm;border-top:2px solid;vertical-align:middle}footer{margin-top:4mm;padding-top:2mm;border-top:1px solid #d5d7da;color:#454950;font-size:8pt}.notes{padding:2mm 3mm;border-left:2px solid #a46b00;background:#fff8e5}@media screen{body{padding:24px;max-width:1122px;margin:auto}html{background:#d8dadd}body{background:white;min-height:794px}}';document.head.append(style);
  const add=(tag,value,parent=document.body)=>{const node=document.createElement(tag);node.textContent=text(value);parent.append(node);return node;};
  add('h1',snapshot.caption||'Grafico di processo');
  const meta=add('p',text(snapshot.pageTitle,1000)+' - '+(snapshot.kind==='time'?'Andamento nel tempo':'Curva X/Y')+' - '+(snapshot.paused?'Vista ferma':'Vista corrente'));meta.className='meta';
  add('p','Vista acquisita (ora del dispositivo): '+new Date(snapshot.capturedAt).toLocaleString('it-IT')).className='meta';
  const parser=new (sourceDocument.defaultView?.DOMParser??globalThis.DOMParser)();const parsed=parser.parseFromString(snapshot.svg,'image/svg+xml');
  if(parsed.querySelector('parsererror'))throw Error('Non è stato possibile preparare il grafico. Chiudi l’anteprima e riprova.');
  const sanitized=captureTrendPrintSvg(parsed.documentElement);const safeSvg=parser.parseFromString(sanitized,'image/svg+xml').documentElement;
  const rulerNotes=Array.from(safeSvg.querySelectorAll('[data-framecraft-print-note]')).map(label=>{const value=text(label.getAttribute('data-framecraft-print-note')+': '+label.textContent,6000);label.remove();return value;});
  safeSvg.setAttribute('preserveAspectRatio','xMidYMid meet');
  const chart=document.createElement('div');chart.className='chart';chart.append(document.importNode(safeSvg,true));document.body.append(chart);
  const table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody');table.append(head,body);const labels=document.createElement('tr');const hasRanges=snapshot.series.some(series=>series.sampleRange!==undefined);for(const label of ['Curva','Sorgente','Area / asse',...(hasRanges?['Intervallo campioni']:[])])add('th',label,labels);head.append(labels);
  for(const series of snapshot.series){const row=document.createElement('tr'),name=add('td',text(series.name,2000),row),swatch=document.createElement('span');swatch.className='swatch';if(typeof series.color==='string'&&!/url\(/i.test(series.color))swatch.style.borderColor=series.color;name.prepend(swatch);add('td',text(series.source,4000),row);add('td',text(series.area,2000),row);if(hasRanges)add('td',text(series.sampleRange??'',2000),row);body.append(row);}
  if(snapshot.series.length)document.body.append(table);else add('p','Nessuna curva visibile nella vista acquisita.');
  for(const line of [...rulerNotes,...snapshot.details])add('p',text(line,6000)).className='notes';
  add('footer','Copia della vista acquisita: curve, intervallo, legenda e segnalazioni restano fermi durante la stampa.');
  return document;
}
export function closeTrendPrintPreview(document){document.defaultView?.[Symbol.for('framecraft.trend-print.v1')]?.close();}
export function setTrendPrintFeedback(host,message,error=false){
  const root=host.querySelector(':scope > [data-hmi-trend-root], :scope > [data-hmi-function-trend-root]');if(!root)return;
  let feedback=root.querySelector('[data-framecraft-trend-print-feedback]');if(!feedback){feedback=root.ownerDocument.createElement('p');feedback.setAttribute('data-framecraft-trend-print-feedback','');Object.assign(feedback.style,{margin:'0',padding:'5px 9px',fontSize:'12px'});root.append(feedback);}
  feedback.textContent=String(message).slice(0,1000);feedback.setAttribute('role',error?'alert':'status');feedback.style.color=error?'#b42318':'#454950';
}
export function createTrendPrintPreview(host,snapshot){
  if(!canPrintTrendHost(host))throw Error('L’elemento non è utilizzabile con l’utente attivo.');
  const document=host.ownerDocument,view=document.defaultView,report=buildTrendPrintDocument(snapshot,document);
  closeTrendPrintPreview(document);const previous=document.activeElement;
  const dialog=document.createElement('dialog');dialog.setAttribute('data-framecraft-trend-print-preview','');dialog.setAttribute('aria-label','Anteprima di stampa del grafico');
  dialog.style.cssText='position:fixed;inset:0;margin:auto;width:min(1180px,94vw);height:min(780px,90vh);max-width:94vw;max-height:90vh;padding:14px;border:1px solid #555;border-radius:5px;background:#202020;color:#e5e5e5;font:13px/1.4 system-ui,sans-serif;box-sizing:border-box;z-index:2147483647;overflow:hidden';
  const shell=document.createElement('div');shell.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;gap:10px';dialog.append(shell);
  const bar=document.createElement('div');bar.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap';shell.append(bar);
  const title=document.createElement('strong');title.textContent='Stampa grafico';title.style.marginRight='auto';bar.append(title);
  const print=document.createElement('button');print.type='button';print.textContent='Stampa / Salva PDF';print.disabled=true;print.style.cssText='font:inherit;padding:7px 12px;border:1px solid #777;border-radius:3px;background:#e5e5e5;color:#202020;cursor:pointer';bar.append(print);
  const close=document.createElement('button');close.type='button';close.textContent='Chiudi';close.style.cssText='font:inherit;padding:7px 12px;border:1px solid #777;border-radius:3px;background:#303030;color:#e5e5e5;cursor:pointer';bar.append(close);
  const status=document.createElement('p');status.textContent='Preparazione della vista di stampa…';status.setAttribute('role','status');status.style.margin='0';shell.append(status);
  const frame=document.createElement('iframe');frame.title='Vista del grafico da stampare';frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.style.cssText='width:100%;min-height:0;flex:1;border:0;background:white';shell.append(frame);
  let closed=false,observer;const key=Symbol.for('framecraft.trend-print.v1');
  const cleanup=()=>{if(closed)return;closed=true;observer?.disconnect();view.removeEventListener('pagehide',cleanup);if(view[key]?.close===cleanup)delete view[key];try{if(dialog.open&&dialog.close)dialog.close();}catch{}dialog.remove();if(previous?.isConnected)previous.focus?.();};
  view[key]={close:cleanup};close.addEventListener('click',cleanup);dialog.addEventListener('cancel',event=>{event.preventDefault();cleanup();});view.addEventListener('pagehide',cleanup);
  document.documentElement.append(dialog);
  try{if(dialog.showModal)dialog.showModal();else{dialog.setAttribute('open','');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');}}
  catch{cleanup();throw Error('Non è stato possibile aprire l’anteprima di stampa. Riprova dal grafico.');}
  const target=frame.contentDocument;
  if(!target){cleanup();throw Error('Non è stato possibile aprire l’anteprima di stampa. Apri il pannello nel browser e riprova.');}
  target.open();target.write('<!doctype html>'+report.documentElement.outerHTML);target.close();
  const perform=()=>{if(closed||print.disabled)return;try{frame.contentWindow.focus();frame.contentWindow.print();}catch{status.textContent='Non è stato possibile aprire la stampa. Riprova oppure apri il pannello nel browser.';status.setAttribute('role','alert');}};
  print.addEventListener('click',perform);
  const keyboard=event=>{if(event.key==='Escape'){event.preventDefault();cleanup();}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();perform();}};
  dialog.addEventListener('keydown',keyboard);target.addEventListener('keydown',keyboard);
  Promise.resolve(target.fonts?.ready).then(()=>{if(closed)return;print.disabled=false;status.textContent='Vista pronta. Conferma la stampante o scegli Salva come PDF.';print.focus();},()=>{if(!closed){status.textContent='Non è stato possibile preparare i caratteri. Chiudi l’anteprima e riprova.';status.setAttribute('role','alert');}});
  observer=new view.MutationObserver(()=>{if(!canPrintTrendHost(host))cleanup();});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','inert','disabled','aria-disabled','style','class','data-fc-reacts','data-fc-user-requires','data-fc-user-granted','data-fc-user-visible-requires','data-fc-user-visible-granted']});
  return {close:cleanup,document:target};
}
export function requestTrendPrint(host,metadata,hook){
  try{
    if(!canPrintTrendHost(host))throw Error('L’elemento non è utilizzabile con l’utente attivo.');
    const svg=host.querySelector(':scope > [data-hmi-trend-root] > svg, :scope > [data-hmi-function-trend-root] > svg');
    const snapshot={...metadata,version:1,pageTitle:host.ownerDocument.title||'Pannello HMI',capturedAt:Date.now(),series:metadata.series.map(series=>({...series})),details:[...metadata.details],svg:captureTrendPrintSvg(svg)};
    // Validate before handing data to a desktop adapter; no source objects cross this boundary.
    if(hook){buildTrendPrintDocument(snapshot,host.ownerDocument);Promise.resolve(hook(snapshot)).catch(error=>setTrendPrintFeedback(host,error instanceof Error?error.message:String(error),true));}
    else createTrendPrintPreview(host,snapshot);
    setTrendPrintFeedback(host,'Vista di stampa preparata. Puoi scegliere la stampante o Salva come PDF.');return true;
  }catch(error){setTrendPrintFeedback(host,error instanceof Error?error.message:String(error),true);return false;}
}
export function trendPrintRuntimeModuleSource(){return [canPrintTrendHost,captureTrendPrintSvg,buildTrendPrintDocument,closeTrendPrintPreview,setTrendPrintFeedback,createTrendPrintPreview,requestTrendPrint].map(String).join('\n')+'\n';}
