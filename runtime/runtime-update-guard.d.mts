export class RuntimeUpdateError extends Error { readonly code: 'RUNTIME_UPDATE_PENDING'; readonly remedy: string; constructor() }
export function assertRuntimeUpdateComplete(root:string):Promise<void>;
