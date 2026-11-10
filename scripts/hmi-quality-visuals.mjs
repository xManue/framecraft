// VisualizeQuality is a transient annotation, independent of tag writes and authored styles.
export function createHmiQualityVisuals(root, target, active = () => true) {
  const view=root.defaultView, ns='http://www.w3.org/2000/svg';
  let layer,commands=[],frame,disposed=false;
  const nodes=new Map();
  const valid=code=>Number.isInteger(code)&&code>=0&&code<=199&&(code&~199)===0&&[0,1,2,4].includes(code&7);
  const attribute=(node,key,value)=>{value=String(value);if(node.getAttribute(key)!==value)node.setAttribute(key,value);};
  const remove=()=>{layer?.remove();layer=undefined;nodes.clear();};
  const draw=()=>{
    frame=undefined;if(disposed||!active()){remove();return;}
    const live=new Set();
    for(const {itemId,quality}of commands){
      if(quality===4)continue;
      const host=target(itemId);if(!host?.element?.isConnected||!host.enabled)continue;
      const element=host.element,box=element.getBoundingClientRect();
      let left=Math.max(0,box.left),top=Math.max(0,box.top),right=Math.min(view.innerWidth,box.right),bottom=Math.min(view.innerHeight,box.bottom),hidden=false;
      for(let ancestor=element;ancestor;ancestor=ancestor.parentElement){
        const style=view.getComputedStyle(ancestor);
        if(ancestor.hidden||style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity!==''&&Number(style.opacity)===0||ancestor.getAttribute('data-fc-user-visible-requires')&&ancestor.getAttribute('data-fc-user-visible-granted')!=='true'){hidden=true;break;}
        if(ancestor!==element&&/(auto|scroll|hidden|clip)/.test(style.overflowX+' '+style.overflowY)){
          const clip=ancestor.getBoundingClientRect();
          if(/(auto|scroll|hidden|clip)/.test(style.overflowX)){left=Math.max(left,clip.left+ancestor.clientLeft);right=Math.min(right,clip.left+ancestor.clientLeft+ancestor.clientWidth);}
          if(/(auto|scroll|hidden|clip)/.test(style.overflowY)){top=Math.max(top,clip.top+ancestor.clientTop);bottom=Math.min(bottom,clip.top+ancestor.clientTop+ancestor.clientHeight);}
        }
      }
      if(hidden||right<=left||bottom<=top||!element.getClientRects().length)continue;
      const covering=root.elementFromPoint?.((left+right)/2,(top+bottom)/2)?.closest('dialog[open], [aria-modal="true"], [data-framecraft-runtime-popup-id]');
      if(covering&&!covering.contains(element))continue;
      if(!layer){layer=root.createElementNS(ns,'svg');layer.setAttribute('data-framecraft-quality-layer','');layer.setAttribute('aria-label','Qualità dei dati');layer.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none!important;z-index:2147483646;overflow:hidden';root.documentElement.appendChild(layer);}
      let group=nodes.get(itemId);
      if(!group){group=root.createElementNS(ns,'g');group.setAttribute('role','img');for(const name of ['rect','rect','text'])group.appendChild(root.createElementNS(ns,name));layer.appendChild(group);nodes.set(itemId,group);}
      live.add(itemId);
      const base=quality&7,label=({0:'Dati non disponibili',1:'Dati non validi',2:'Dati incerti',4:'Dati validi'})[base]+(quality&64?' · limite superiore':'')+(quality&128?' · limite inferiore':''),color=base===1?'#f87171':base===2?'#fbbf24':base===0?'#a3a3a3':'#fbbf24';
      attribute(group,'aria-label',(host.name?host.name+': ':'')+label);
      const [outline,badge,text]=group.children,width=right-left,height=bottom-top;
      for(const [key,value]of Object.entries({x:left+1,y:top+1,width:Math.max(0,width-2),height:Math.max(0,height-2),fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':base===1?'2 2':base===2?'6 3':'3 4'}))attribute(outline,key,value);
      const caption=(base===1?'× ':base===2?'! ':base===4?'↕ ':'? ')+label,badgeWidth=Math.min(width,caption.length*7+12),badgeHeight=Math.min(20,height);
      for(const [key,value]of Object.entries({x:left,y:top,width:badgeWidth,height:badgeHeight,fill:'#202020',stroke:color,'stroke-width':1}))attribute(badge,key,value);
      for(const [key,value]of Object.entries({x:left+5,y:top+Math.min(14,height-2),fill:color,'font-size':12,'font-family':'system-ui,sans-serif','textLength':Math.max(1,Math.min(caption.length*7,badgeWidth-10)),lengthAdjust:'spacingAndGlyphs'}))attribute(text,key,value);
      if(text.textContent!==caption)text.textContent=caption;
    }
    for(const [id,node]of nodes)if(!live.has(id)){node.remove();nodes.delete(id);}
    if(!nodes.size)remove();
  };
  const refresh=()=>{if(!disposed&&frame===undefined)frame=view.requestAnimationFrame(draw);};
  view.addEventListener('resize',refresh);root.addEventListener('scroll',refresh,true);
  return {
    apply(next){
      if(!Array.isArray(next)||next.length>4096)throw Error('VisualizeQuality: elenco non valido.');
      const ids=new Set();for(const command of next){if(!command||typeof command.itemId!=='string'||!command.itemId||command.itemId.length>500||ids.has(command.itemId)||!valid(command.quality))throw Error('VisualizeQuality: qualità non valida.');ids.add(command.itemId);}
      commands=next.map(command=>({...command}));draw();
    },
    refresh,hide:remove,
    dispose(){disposed=true;if(frame!==undefined)view.cancelAnimationFrame(frame);view.removeEventListener('resize',refresh);root.removeEventListener('scroll',refresh,true);commands=[];remove();}
  };
}

// Every response is bound to the current page, parent, origin and latest request.
export function createHmiQualityPreview(view,surface,options){
  let sequence=0,pending=0,sentAt=0,disposed=false;
  const clear=()=>{pending=0;surface.applyQuality([]);};
  const tick=()=>{
    if(disposed)return;
    const origin=options.origin();
    if(!options.active()||!origin||origin==='null'||!surface.hasQualityTargets()){clear();return;}
    if(pending&&Date.now()-sentAt<1500)return;
    const items=surface.qualityItems();
    if(pending)surface.applyQuality(items.filter(item=>item.visualizeQuality).map(item=>({itemId:item.itemId,quality:0})));
    if(items.length>4096){clear();return;}
    pending=++sequence;sentAt=Date.now();
    const request={type:'framecraft:quality-request',pageId:options.pageId(),sequence:pending,items};
    if(JSON.stringify(request).length>2000000){clear();return;}
    view.parent.postMessage(request,origin);
  };
  const message=event=>{
    const data=event.data;
    if(disposed||!options.active()||event.source!==view.parent||event.origin!==options.origin()||!event.origin||event.origin==='null'||data?.type!=='framecraft:quality-result'||data.pageId!==options.pageId()||!pending||data.sequence!==pending)return;
    pending=0;try{surface.applyQuality(data.commands);}catch{clear();}
  };
  const timer=view.setInterval(tick,250);
  view.addEventListener('message',message);
  const dispose=()=>{if(disposed)return;disposed=true;view.clearInterval(timer);view.removeEventListener('message',message);view.removeEventListener('pagehide',hide);clear();};
  const hide=event=>{if(event.persisted)clear();else dispose();};
  view.addEventListener('pagehide',hide);
  return {tick,clear,dispose};
}
