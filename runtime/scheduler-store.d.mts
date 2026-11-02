export class SchedulerError extends Error { readonly code: string; readonly remedy: string; constructor(code?: string) }
export interface SchedulerRun { id: string; task: string; cause: string; scheduledAt: number; state: string; code: string }
export interface SchedulerStore { claim(input: { id:string;task:string;cause:string;scheduledAt:number;key?:string }): boolean; finish(id:string,state:string,code:string):void; history():SchedulerRun[]; needsReview():boolean; review(id:string):boolean; close():void }
export function openSchedulerStore(options:{root:string;namespace:string}):SchedulerStore;
