export interface HmiTrendQuality {badColor:number;uncertainColor:number;visible:boolean;invalid?:boolean}
export function parseTrendQuality(value:unknown):HmiTrendQuality|undefined;
export function trendQualityIssues(config:HmiTrendQuality|undefined):string[];
export function trendSampleQuality(...codes:(number|undefined)[]):'bad'|'uncertain'|'unknown'|'good';
export function trendQualityColor(config:HmiTrendQuality|undefined,quality:string,fallback:string):string;
export function trendPointQuality(point:{value?:number;x?:number;y?:number;qualityCode?:number;xQualityCode?:number;yQualityCode?:number;gap?:'missing'|'invalid'}):'bad'|'uncertain'|'unknown'|'good';
export function trendPointUsable(point:Parameters<typeof trendPointQuality>[0]):boolean;
export function trendQualityRuntimeModuleSource():string;
