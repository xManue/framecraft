import { normalizeMqttTagValue } from '../../runtime/connection-config.mjs';
import { inspectHmiScriptProgram } from './hmiScript';
import type { HmiTagBinding, HmiTagDefinition, HmiTagStatus } from './hmiTagBinding';
import type { HmiScriptProcessValueContext } from './hmiProcessValue';

export interface HmiQualityBinding extends HmiTagBinding {
  local?: boolean; dataType?: string; value?: unknown; currentContext?: boolean;
}
export interface HmiQualitySource {
  bindings?: HmiQualityBinding[];
  /** Renderer-validated sample quality and live acquisition health (also array tags). */
  qualities?: number[]; statusTags?: string[];
  locals?: { value?: unknown; dataType: string }[];
  programs?: Parameters<typeof inspectHmiScriptProgram>[0][];
  invalid?: boolean; unknown?: boolean;
}
export interface HmiScriptQualityContext extends HmiScriptProcessValueContext {
  functions?: Parameters<typeof inspectHmiScriptProgram>[1];
  variables?: Parameters<typeof inspectHmiScriptProgram>[4];
}
/** Native HmiQuality bits, distinct from the wire QualityCode. No I/O or commands. */
export function resolveHmiCurrentQuality(
  sources: readonly HmiQualitySource[], context: HmiScriptQualityContext,
  catalog: readonly HmiTagDefinition[], available?: (tag: string) => boolean | undefined,
): number {
  const codes: number[] = [];
  const own = <T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined => record && Object.hasOwn(record,key) ? record[key] : undefined;
  if(!Array.isArray(catalog))return 1;
  const definitions=new Map<string,HmiTagDefinition|undefined>();
  for(const item of catalog)if(item&&typeof item.name==='string'&&!item.detected)definitions.set(item.name,definitions.has(item.name)?undefined:item);
  const defined = (tag: string) => definitions.get(tag);
  const cache=new Map<string,number>(),statusCache=new Map<string,number>();
  const valid = (value: unknown, type: string) => { try { normalizeMqttTagValue(value,type);return true; } catch { return false; } };
  const codeFor = (tag: string, statusOnly = false): number => {
    const definition=defined(tag),status=own(context.tagStatus,tag),value=own(context.values,tag);
    if(!definition||!['read','read-write'].includes(definition.access)||typeof definition.dataType!=='string'||!definition.dataType.trim())return 1;
    if(context.requireQuality&&available?.(tag)===false)return 1;
    if(status&&(status.qualityKnown!==undefined&&typeof status.qualityKnown!=='boolean'||status.localValue!==undefined&&typeof status.localValue!=='boolean'||status.lastError!==undefined&&!Number.isFinite(status.lastError)))return 1;
    if(status?.lastError)return 1;
    if(status?.qualityKnown===false||context.requireQuality&&status?.localValue)return 0;
    const raw=status?.qualityCode;
    if(raw!==undefined&&(!Number.isInteger(raw)||raw<0||raw>65535))return 1;
    if(raw!==undefined&&(raw&0xc0)===0)return 1;
    if(value===undefined)return 0;
    if(!statusOnly&&!valid(value,definition.dataType))return 1;
    if(raw===undefined)return context.requireQuality?0:4;
    const base=(raw&0xc0)===64?2:4;
    const limits=raw&3;
    return base|(limits===1?128:limits===2?64:0);
  };
  const addTag = (tag: string) => { let code=cache.get(tag);if(code===undefined){code=codeFor(tag);cache.set(tag,code);}codes.push(code);return code; };
  const addLocal = (value:unknown,dataType:string) => codes.push(value===undefined||value===null?0:valid(value,dataType)?4:1);
  let inspected=0;
  for(const source of sources){
    if(++inspected>4096)throw new Error('CurrentQuality supera 4096 sorgenti: riduci i collegamenti del gruppo o leggi i singoli controlli.');
    const count=(source.locals?.length??0)+(source.bindings?.length??0)+(source.programs?.length??0)+(source.qualities?.length??0)+(source.statusTags?.length??0);
    if(inspected+count>4096)throw new Error('CurrentQuality supera 4096 collegamenti/sorgenti: leggi i singoli controlli.');
    for(const quality of source.qualities??[]){inspected++;codes.push(Number.isInteger(quality)&&quality>=0&&quality<=199&&(quality&~199)===0&&[0,1,2,4].includes(quality&7)?quality:1);}
    for(const tag of source.statusTags??[]){inspected++;let code=statusCache.get(tag);if(code===undefined){code=typeof tag==='string'?codeFor(tag,true):1;statusCache.set(tag,code);}codes.push(code);}
    if(source.invalid)codes.push(1);
    if(source.unknown)codes.push(0);
    for(const local of source.locals??[]){inspected++;addLocal(local.value,local.dataType);}
    for(const binding of source.bindings??[]){
      if(++inspected>4096)throw new Error('CurrentQuality supera 4096 collegamenti: leggi i singoli controlli.');
      const selector=binding.tag??'';
      if(binding.local){
        const value=binding.currentContext&&context.localTags?.has(selector)?own(context.values,selector):binding.value;
        if(!binding.dataType)codes.push(1);else addLocal(value,binding.dataType);
        continue;
      }
      if(!selector){codes.push(1);continue;}
      const selectorCode=addTag(selector);
      if(!binding.indirect)continue;
      const variable=defined(selector),raw=own(context.values,selector);
      if((selectorCode&7)===0||(selectorCode&7)===1)continue;
      if(variable?.dataType.trim().toUpperCase()!=='WSTRING'||typeof raw!=='string'||!raw.trim()||raw.length>200||raw.trim()===selector||typeof binding.indirectDataType!=='string'||!binding.indirectDataType.trim()){codes.push(1);continue;}
      const target=raw.trim(),destination=defined(target);
      if(!destination||typeof destination.dataType!=='string'||destination.dataType.trim().toUpperCase()!==binding.indirectDataType.trim().toUpperCase()){codes.push(1);continue;}
      addTag(target);
    }
    for(const program of source.programs??[]){
      if(++inspected>4096)throw new Error('CurrentQuality supera 4096 programmi/sorgenti.');
      const inspection=inspectHmiScriptProgram(program,context.functions,undefined,[],context.variables);
      if(inspection.error){codes.push(1);continue;}
      for(const tag of inspection.tagsRead){if(++inspected>4096)throw new Error('CurrentQuality supera 4096 dipendenze degli script.');addTag(tag);}
    }
  }
  if(!codes.length)return 0;
  // A proven unusable value wins; otherwise an uninitialized source prevents a good result.
  const bases=codes.map(code=>code&7),base=bases.includes(1)?1:bases.includes(0)?0:bases.includes(2)?2:4;
  return base|codes.reduce((flags,code)=>flags|(code&192),0);
}
