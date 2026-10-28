import type { OpcUaBrowseQuery, OpcUaBrowsePage } from "../runtime/opcua-browse-policy.mjs";
export interface DesktopOpcUaInput { root: string; connectionId: string; query: OpcUaBrowseQuery; expectedConfiguration: string; sources: Record<string, string>; devSdkRoot?: string; sdkPack?: Buffer; sdkCache?: string }
export function runDesktopOpcUa(input: DesktopOpcUaInput, signal: AbortSignal): Promise<{ version: 1; connectionId: string; configurationRevision: string; page: OpcUaBrowsePage }>;
