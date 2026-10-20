import type { OperatorCapability } from "./operator-policy.mjs";
export interface OperatorAccountSummary { id: string; username: string; name: string; role: string; disabled: boolean; capabilities: OperatorCapability[]; permissions: string[] }
export interface OperatorAdminSnapshot { revision: string | null; storeId: string | null; accounts: OperatorAccountSummary[] }
export type OperatorAdminCommand =
  | { action: "add"; username: string; name: string; role: string; capabilities: OperatorCapability[]; permissions: string[]; password: string }
  | { action: "update"; id: string; name: string; role: string; capabilities: OperatorCapability[]; permissions: string[] }
  | { action: "password"; id: string; password: string }
  | { action: "disable"; id: string; disabled: boolean };
export function manageLocalOperators(input: { root: string; action: "read" } | (OperatorAdminCommand & { root: string; expectedRevision: string | null })): Promise<OperatorAdminSnapshot>;
