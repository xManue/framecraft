const owners=new Set<symbol>();
const listeners=new Set<()=>void>();
export function hasUnsavedScriptModules():boolean{return owners.size>0;}
export function setScriptDraftDirty(owner:symbol,dirty:boolean):void{const previous=hasUnsavedScriptModules();if(dirty)owners.add(owner);else owners.delete(owner);if(previous!==hasUnsavedScriptModules())for(const listener of [...listeners])listener();}
export function subscribeScriptDrafts(listener:()=>void):()=>void{listeners.add(listener);return()=>listeners.delete(listener);}
