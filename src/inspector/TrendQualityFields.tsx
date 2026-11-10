import type {HmiTrendQuality} from '../../scripts/hmi-trend-quality.mjs';
import {parseTrendQuality} from '../../scripts/hmi-trend-quality.mjs';
export function TrendQualityFields({value,onChange}:{value?:HmiTrendQuality;onChange(value:HmiTrendQuality):void}){
 const config=value??parseTrendQuality({})!;
 const hex=(number:number,fallback:string)=>Number.isInteger(number)&&number>=0&&number<=0xffffffff?'#'+number.toString(16).padStart(8,'0').slice(2):fallback;
 const color=(key:'badColor'|'uncertainColor',text:string)=>{const previous=config[key],alpha=Number.isInteger(previous)&&previous>=0&&previous<=0xffffffff?Math.floor(previous/0x1000000):255;onChange({...config,invalid:undefined,[key]:alpha*0x1000000+parseInt(text.slice(1),16)});};
 return <details className="trend-axis-editor"><summary>Qualità dei campioni</summary>
  <label className="trend-visible"><input type="checkbox" checked={value?.visible===true} onChange={event=>onChange({...config,invalid:undefined,visible:event.target.checked})}/> Colora i campioni in base alla qualità</label>
  {value?.visible===true&&<div className="property-pair"><label className="dynamization-field"><span>Non validi</span><input aria-label="Colore dati non validi" type="color" value={hex(config.badColor,'#f87171')} onChange={event=>color('badColor',event.target.value)}/></label><label className="dynamization-field"><span>Incerti</span><input aria-label="Colore dati incerti" type="color" value={hex(config.uncertainColor,'#fbbf24')} onChange={event=>color('uncertainColor',event.target.value)}/></label></div>}
  <p className="inspector-note">I campioni non validi interrompono sempre la linea e non entrano nella scala o nel righello. I loro valori non vengono sostituiti o inviati al PLC.</p>
 </details>;
}
