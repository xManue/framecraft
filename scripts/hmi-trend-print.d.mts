export interface HmiTrendPrintMetadata {kind:'time'|'xy';caption:string;paused:boolean;details:string[];series:{name:string;color:string;source:string;area:string;sampleRange?:string}[]}
export interface HmiTrendPrintSnapshot extends HmiTrendPrintMetadata {version:1;pageTitle:string;capturedAt:number;svg:string}
export function canPrintTrendHost(host:Element):boolean;
export function captureTrendPrintSvg(svg:SVGSVGElement):string;
export function buildTrendPrintDocument(snapshot:HmiTrendPrintSnapshot,sourceDocument:Document):Document;
export function createTrendPrintPreview(host:Element,snapshot:HmiTrendPrintSnapshot):{close():void;document:Document};
export function closeTrendPrintPreview(document:Document):void;
export function setTrendPrintFeedback(host:Element,message:string,error?:boolean):void;
export function requestTrendPrint(host:Element,metadata:HmiTrendPrintMetadata,hook?:(snapshot:HmiTrendPrintSnapshot)=>void|Promise<void>):boolean;
export function trendPrintRuntimeModuleSource():string;
