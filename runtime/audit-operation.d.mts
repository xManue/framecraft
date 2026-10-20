import type { RuntimeAudit, RuntimeAuditEvent } from "./audit-store.mjs";
export type AuditContext = Omit<RuntimeAuditEvent, "outcome" | "code">;
export function auditContext(operation: RuntimeAuditEvent["operation"], resource: RuntimeAuditEvent["resource"], commandId?: string | null, actor?: string | null): AuditContext;
export function appendAudit(audit: RuntimeAudit | undefined, context: AuditContext, outcome: RuntimeAuditEvent["outcome"], code: string): Promise<void>;
export function runAudited<T>(audit: RuntimeAudit | undefined, context: AuditContext, execute: () => T | Promise<T>, describe: (result: T) => Pick<RuntimeAuditEvent, "outcome" | "code">, allowed?: () => boolean): Promise<T>;
