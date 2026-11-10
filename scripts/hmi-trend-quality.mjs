// Per-curve display settings. Raw samples, quality codes and exports are never rewritten.
export function parseTrendQuality(value){
  if(value===undefined)return undefined;
  const object=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return {badColor:object.badColor===undefined?0xfff87171:object.badColor,uncertainColor:object.uncertainColor===undefined?0xfffbbf24:object.uncertainColor,visible:object.visible===undefined?true:object.visible,...(!value||typeof value!=='object'||Array.isArray(value)||object.invalid?{invalid:true}:{})};
}
export function trendQualityIssues(config){
  if(config===undefined)return [];
  const issues=[];if(!config||config.invalid)issues.push('Configurazione qualità non valida: scegli nuovamente colori e visibilità.');
  for(const key of ['badColor','uncertainColor'])if(typeof config?.[key]!=='number'||!Number.isInteger(config[key])||config[key]<0||config[key]>0xffffffff)issues.push((key==='badColor'?'Colore dei dati non validi':'Colore dei dati incerti')+' non valido: sceglilo di nuovo in Qualità dei campioni (ARGB UInt32, da 0 a 4294967295).');
  if(typeof config?.visible!=='boolean')issues.push('Visibilità dei colori non valida: usa l’interruttore in Qualità dei campioni (Visible richiede Boolean).');
  return issues;
}
export function trendSampleQuality(...codes){
  const classes=codes.map(code=>code===undefined?'unknown':!Number.isInteger(code)||code<0||code>65535?'bad':(code&0x80)?'good':(code&0xc0)===64?'uncertain':'bad');
  return classes.includes('bad')?'bad':classes.includes('unknown')?'unknown':classes.includes('uncertain')?'uncertain':'good';
}
export function trendQualityColor(config,quality,fallback){
  if(!config||config.visible!==true)return fallback;
  const color=quality==='bad'?config.badColor:quality==='uncertain'?config.uncertainColor:undefined;
  if(color===undefined)return quality==='unknown'?'#a3a3a3':fallback;
  if(!Number.isInteger(color)||color<0||color>0xffffffff)return fallback;
  const hex=color.toString(16).padStart(8,'0');return '#'+hex.slice(2)+hex.slice(0,2);
}
export function trendPointQuality(point){
  if(point.gap==='missing')return 'unknown';
  if(point.gap||('value' in point?!Number.isFinite(point.value):!Number.isFinite(point.x)||!Number.isFinite(point.y)))return 'bad';
  return 'value' in point?trendSampleQuality(point.qualityCode):trendSampleQuality(point.xQualityCode,point.yQualityCode);
}
export function trendPointUsable(point){return !point.gap&&('value' in point?Number.isFinite(point.value):Number.isFinite(point.x)&&Number.isFinite(point.y))&&trendPointQuality(point)!=='bad';}
export function trendQualityRuntimeModuleSource(){return [parseTrendQuality,trendQualityIssues,trendSampleQuality,trendQualityColor,trendPointQuality,trendPointUsable].map(String).join('\n')+'\n';}
