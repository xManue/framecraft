import { OperatorAuthError, operatorKeys, operatorText } from "./operator-policy.mjs";

export const auditOperations = Object.freeze(["tags.write", "alarms.acknowledge", "alarms.confirm", "recipes.create", "recipes.update", "recipes.copy", "recipes.rename", "recipes.delete", "recipes.import", "recipes.apply", "recipes.check", "session.login", "session.logout"]);
export const auditOutcomes = Object.freeze(["requested", "applied", "delivered", "duplicate", "rejected", "uncertain", "authenticated", "logged-out"]);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const date = value => { try { return typeof value === "string" && value.length === 24 && new Date(value).toISOString() === value; } catch { return false; } };
const fields = ["limit", "before", "through", "journalId", "operation", "outcome", "actor", "from", "to"];
export function parseAuditQuery(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new OperatorAuthError("AUTH_INPUT");
  const result = { limit: 50 };
  for (const key of fields) {
    const input = value[key]; if (input === undefined) continue;
    if (["limit", "before", "through"].includes(key)) {
      if (typeof input !== "number" && (typeof input !== "string" || !/^(?:0|[1-9][0-9]{0,15})$/.test(input))) throw new OperatorAuthError("AUTH_INPUT");
      const number = Number(input);
      if (!Number.isSafeInteger(number) || number < (key === "through" ? 0 : 1) || key === "limit" && number > 500) throw new OperatorAuthError("AUTH_INPUT");
      result[key] = number;
    } else {
      const valid = key === "journalId" ? uuid(input) : key === "operation" ? auditOperations.includes(input) : key === "outcome" ? auditOutcomes.includes(input) : key === "actor" ? operatorText(input, 200) : date(input);
      if (!valid) throw new OperatorAuthError("AUTH_INPUT"); result[key] = input;
    }
  }
  if (result.from && result.to && result.from > result.to || result.before !== undefined && result.through !== undefined && result.before > result.through + 1) throw new OperatorAuthError("AUTH_INPUT");
  return result;
}
export function matchesAuditQuery(event, query) {
  return (query.before === undefined || event.seq < query.before) && (query.through === undefined || event.seq <= query.through)
    && (query.operation === undefined || event.operation === query.operation) && (query.outcome === undefined || event.outcome === query.outcome)
    && (query.actor === undefined || event.actor === query.actor) && (query.from === undefined || event.timestamp >= query.from) && (query.to === undefined || event.timestamp <= query.to);
}
export function parseAuditSnapshot(value, input = {}) {
  const query = parseAuditQuery(input), fail = () => { throw new OperatorAuthError("AUTH_AUDIT_RESPONSE"); };
  if (!operatorKeys(value, ["version", "id", "namespace", "sequence", "verified", "uncertainCount", "unresolvedCount", "events", "nextBefore"]) || value.version !== 1 || !uuid(value.id) || !uuid(value.namespace) || value.verified !== true
    || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || query.journalId !== undefined && value.id !== query.journalId || query.through !== undefined && value.sequence < query.through
    || !Number.isSafeInteger(value.uncertainCount) || value.uncertainCount < 0 || value.uncertainCount > value.sequence || !Number.isSafeInteger(value.unresolvedCount) || value.unresolvedCount < 0 || value.unresolvedCount > value.sequence
    || !Array.isArray(value.events) || value.events.length > query.limit) fail();
  let previous = value.sequence + 1;
  for (const event of value.events) {
    if (!operatorKeys(event, ["seq", "timestamp", "traceId", "actor", "operation", "resource", "commandId", "outcome", "code"]) || !Number.isSafeInteger(event.seq) || event.seq < 1 || event.seq >= previous
      || !date(event.timestamp) || !uuid(event.traceId) || event.actor !== null && !operatorText(event.actor, 200) || !auditOperations.includes(event.operation) || !auditOutcomes.includes(event.outcome)
      || event.commandId !== null && (typeof event.commandId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(event.commandId)) || typeof event.code !== "string" || !/^[A-Z][A-Z0-9_]{0,63}$/.test(event.code)) fail();
    const kind = event.operation.startsWith("tags.") ? "tag" : event.operation.startsWith("alarms.") ? "alarm" : event.operation.startsWith("recipes.") ? "recipe-schema" : undefined;
    if (!kind ? event.resource !== null : !operatorKeys(event.resource, kind === "recipe-schema" ? ["kind", "id", "recordId", "targetId"] : ["kind", "id"]) || event.resource.kind !== kind || !operatorText(event.resource.id, 200)
      || kind === "recipe-schema" && (!operatorText(event.resource.recordId, 80) || event.resource.targetId !== null && !operatorText(event.resource.targetId, 80))) fail();
    if (!matchesAuditQuery(event, query)) fail(); previous = event.seq;
  }
  if (value.nextBefore !== null && (!value.events.length || value.nextBefore !== value.events.at(-1).seq)) fail();
  return structuredClone(value);
}
