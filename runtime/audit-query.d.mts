import type { RuntimeAuditSnapshot } from "./audit-store.mjs";
export interface AuditQuery { limit?: number; before?: number; through?: number; journalId?: string; operation?: string; outcome?: string; actor?: string; from?: string; to?: string }
export const auditOperations: readonly string[];
export const auditOutcomes: readonly string[];
export function parseAuditQuery(value?: unknown): AuditQuery & { limit: number };
export function matchesAuditQuery(event: RuntimeAuditSnapshot["events"][number], query: AuditQuery): boolean;
export function parseAuditSnapshot(value: unknown, query?: AuditQuery): RuntimeAuditSnapshot;
