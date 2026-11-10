import {createHmiPropertyFlashing,type HmiScreenItemSnapshot} from '../../scripts/hmi-property-flashing.mjs';
import {resolveHmiCurrentQuality,type HmiScriptQualityContext} from './hmiCurrentQuality';
import type {HmiTagDefinition} from './hmiTagBinding';
/** Data only: never evaluates a script or sends a tag command. */
export function qualityPreviewCommands(input:unknown,context:HmiScriptQualityContext,catalog:readonly HmiTagDefinition[]){
  try{
    if(!Array.isArray(input)||input.length>4096||JSON.stringify(input).length>2000000)return;
    const ids=new Set<string>();
    for(const item of input){
      if(!item||typeof item!=='object'||Array.isArray(item)||!['itemId','screenId','name'].every(key=>typeof item[key]==='string'&&item[key].length<=500)||!item.itemId||ids.has(item.itemId)||typeof item.visualizeQuality!=='boolean'||['parentItemId','faceplateId','parentFaceplateId'].some(key=>item[key]!==undefined&&(typeof item[key]!=='string'||item[key].length>500))||!item.quality||typeof item.quality!=='object'||Array.isArray(item.quality))return;
      ids.add(item.itemId);
    }
    const items=input as HmiScreenItemSnapshot[];
    const manager=createHmiPropertyFlashing({items:()=>items,apply:()=>{},resolveCurrentQuality:(sources,ctx)=>resolveHmiCurrentQuality(sources,ctx,catalog)});
    return manager.qualityCommands(context,items);
  }catch{return;}
}
