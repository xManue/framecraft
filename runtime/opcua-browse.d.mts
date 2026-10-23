import type { ClientSession } from "node-opcua-client";
import type { OpcUaBrowseQuery, OpcUaBrowsePage } from "./opcua-browse-policy.mjs";
export function browseOpcUaSession(session: ClientSession, query?: OpcUaBrowseQuery, options?: { signal?: AbortSignal; wait?<T>(task: Promise<T>): Promise<T> }): Promise<OpcUaBrowsePage>;
