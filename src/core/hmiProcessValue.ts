import { resolveHmiTagReference, type HmiTagDefinition, type HmiTagBinding, type HmiTagStatus } from './hmiTagBinding';
export interface HmiScriptProcessValue { tag?:string; local?:boolean; dataType:string; access:'read'|'write'|'read-write'; value?:string|number|boolean|null; minimum?:number; maximum?:number; choices?:string[] }
export interface HmiScriptProcessValueContext { values:Readonly<Record<string,string>>; tagStatus?:Readonly<Record<string,HmiTagStatus>>; localTags?:ReadonlySet<string>; requireQuality:boolean }
export interface HmiProcessValueSource {
  binding?: HmiTagBinding & { local?: boolean; dataType?: string };
  dataType?: string; value?: string|number|boolean|null; error?: string; revision?: number;
  minimum?: number; maximum?: number; choices?: string[];
}
/** Resolve against the current script samples, including its own local writes. No transport or DOM. */
export function resolveHmiProcessValue(source:HmiProcessValueSource|undefined,context:HmiScriptProcessValueContext,variables:readonly HmiTagDefinition[],writing=false):HmiScriptProcessValue {
  if(!source)throw new Error("L'oggetto non espone ProcessValue: scegli un campo valore o configura il collegamento della proprietà.");
  if(source.error)throw new Error(source.error);
  const binding=source.binding;
  if(!binding)return {dataType:source.dataType??'WString',access:'read-write',value:source.value,minimum:source.minimum,maximum:source.maximum,choices:source.choices};
  if((binding.conditionType??'None')!=='None')throw new Error('ProcessValue richiede un collegamento diretto al valore; una tabella di conversione non può essere scritta come tag.');
  if(binding.local){
    if(!binding.tag||!context.localTags?.has(binding.tag)||!binding.dataType)throw new Error('ProcessValue locale richiede il contesto e il tipo dichiarato del faceplate attivo.');
    return {tag:binding.tag,dataType:binding.dataType,local:true,access:'read-write',minimum:source.minimum,maximum:source.maximum};
  }
  let tag=binding.tag;
  if(binding.indirect){const result=resolveHmiTagReference(binding,context.values,variables,context.tagStatus,context.requireQuality);if('reason' in result)throw new Error('ProcessValue: '+result.reason);tag=result.tag;}
  const matches=variables.filter(variable=>variable.name===tag&&!variable.detected);
  if(matches.length!==1)throw new Error('ProcessValue: dichiara una sola volta il tag '+(tag??'mancante')+' nel catalogo PLC, con tipo e accesso espliciti.');
  const variable=matches[0];
  if(!variable.dataType?.trim())throw new Error('ProcessValue: specifica il tipo PLC del tag '+variable.name+'.');
  if(!(writing?['write','read-write']:['read','read-write']).includes(variable.access))throw new Error('ProcessValue: il tag '+variable.name+(writing?' non è scrivibile.':' non è leggibile.')+' Controlla gli accessi nel catalogo e nel servizio PLC.');
  return {tag:variable.name,dataType:variable.dataType,access:variable.access as HmiScriptProcessValue['access']};
}
