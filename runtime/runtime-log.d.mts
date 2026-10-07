import type { ConnectionDiagnostic } from "./connection-diagnostics.mjs";
export function createRuntimeLogger(options: {
  directory: string; maxBytes?: number; maxFiles?: number; queueLimit?: number; json?: boolean;
  output?: (text: string, error: boolean, event: ConnectionDiagnostic) => void; onFailure?: (event: ConnectionDiagnostic) => void;
}): { write(event: ConnectionDiagnostic): void; flush(): Promise<void>; close(): Promise<void> };
