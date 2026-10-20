import { randomUUID } from "node:crypto";
import { OperatorAuthError } from "./operator-policy.mjs";
import { RecipeStoreError } from "./recipe-catalog.mjs";
import { ConnectionOperationError } from "./connection-diagnostics.mjs";

export const auditContext = (operation, resource, commandId = null, actor = null) => ({ traceId: randomUUID(), actor, operation, resource, commandId });
export async function appendAudit(audit, context, outcome, code) {
  try { if (!audit || typeof audit.append !== "function") throw new Error(); await audit.append({ ...context, outcome, code }); }
  catch (error) { throw error instanceof OperatorAuthError && error.code.startsWith("AUTH_AUDIT") ? error : new OperatorAuthError("AUTH_AUDIT"); }
}
export async function runAudited(audit, context, execute, describe, allowed = () => true) {
  await appendAudit(audit, context, "requested", "OPERATION_REQUESTED");
  let result, outcome, code;
  try {
    if (!allowed()) throw new OperatorAuthError("AUTH_CONFIG");
    result = await execute(); ({ outcome, code } = describe(result));
  } catch (error) {
    const known = error instanceof OperatorAuthError || error instanceof RecipeStoreError || error instanceof ConnectionOperationError;
    outcome = known && error.code !== "RECIPE_UNCERTAIN" && error.outcome !== "uncertain" ? "rejected" : "uncertain";
    code = known ? error.code ?? error.diagnostic?.code ?? "OPERATION_UNCERTAIN" : "OPERATION_UNCERTAIN";
    try { await appendAudit(audit, context, outcome, code); } catch { throw new OperatorAuthError("AUTH_AUDIT_UNCERTAIN"); } throw error;
  }
  try { await appendAudit(audit, context, outcome, code); } catch { throw new OperatorAuthError("AUTH_AUDIT_UNCERTAIN"); }
  return result;
}
