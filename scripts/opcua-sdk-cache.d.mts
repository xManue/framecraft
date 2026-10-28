export function installOpcUaSdk(pack: Buffer, cacheRoot: string, signal?: AbortSignal): Promise<string>;
export function resolveOpcUaSdk(root: string): Promise<Record<string, string>>;
