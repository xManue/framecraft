export type ConnectionProtocol = "mqtt" | "opcua" | "gateway";
export interface ConnectionDiagnostic {
  code: string; level: "info" | "warning" | "error"; title: string; message: string; action: string; impact: string;
  protocol: ConnectionProtocol; timestamp: number; connectionId?: string; tag?: string; technicalCode?: string; occurrences?: number; id?: string;
}
export const connectionMessages: Readonly<Record<string, readonly string[]>>;
export function connectionDiagnostic(code: string, context?: Omit<Partial<ConnectionDiagnostic>, "technicalCode"> & { technicalCode?: string | number }): ConnectionDiagnostic;
export function diagnosticText(event: ConnectionDiagnostic): string;
export class ConnectionOperationError extends Error { readonly diagnostic: ConnectionDiagnostic; readonly outcome: "rejected" | "uncertain"; constructor(diagnostic: ConnectionDiagnostic, outcome?: "rejected" | "uncertain") }
export function transportDiagnosticCode(error: unknown): string;
export function safeNotify<T>(callback: ((event: T) => void) | undefined, event: T): void;
export function createDiagnosticReporter(callback?: (event: ConnectionDiagnostic) => void, context?: Partial<ConnectionDiagnostic>, options?: { intervalMs?: number; maxEntries?: number }): (code: string, extra?: Omit<Partial<ConnectionDiagnostic>, "technicalCode"> & { technicalCode?: string | number }) => ConnectionDiagnostic;
