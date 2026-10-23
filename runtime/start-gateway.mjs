import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPlcGateway } from "./gateway.mjs";
import { ConnectionOperationError, connectionDiagnostic } from "./connection-diagnostics.mjs";
import { createRuntimeLogger } from "./runtime-log.mjs";
import { emptyRecipeCatalog, parseRecipeCatalog, RecipeStoreError } from "./recipe-catalog.mjs";
import { openRecipeStore } from "./recipe-store.mjs";
import { createLocalOperatorAuth } from "./operator-auth.mjs";
import { OperatorAuthError, parseOperatorAuthConfig } from "./operator-policy.mjs";
import { openRuntimeAudit } from "./audit-store.mjs";
import { openAlarmHistory } from "./alarm-history-store.mjs";
import { AlarmHistoryError } from "./alarm-history.mjs";
import { parseAlarmCatalog } from "./alarm-engine.mjs";
import { RecipePlcError, emptyRecipePlcConfig, parseRecipePlcConfig } from "./recipe-plc.mjs";

const root = new URL("../", import.meta.url);
const json = process.argv.includes("--json");
const logger = createRuntimeLogger({ directory: fileURLToPath(new URL(".framecraft-runtime/logs/gateway/", root)), json });
let gateway, runtimeAudit, alarmHistory, stopping = false;
function reportRecipe(error) {
  const safe = error instanceof RecipeStoreError ? error : new RecipeStoreError("RECIPE_STORAGE");
  process.stderr.write((json ? JSON.stringify({ type: "recipe", code: safe.code, error: safe.message, remedy: safe.remedy }) : safe.message + ". " + safe.remedy) + "\n"); return safe;
}
async function stop() { if (stopping) return; stopping = true; await gateway?.stop(); alarmHistory?.close(); runtimeAudit?.close(); await logger.close(); }
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void stop(); });
try {
  const catalog = JSON.parse(await readFile(new URL("framecraft.connections.json", root), "utf8"));
  const plc = JSON.parse(await readFile(new URL("framecraft.plc.json", root), "utf8"));
  let alarmCatalog;
  try { alarmCatalog = JSON.parse(await readFile(new URL("framecraft.alarms.json", root), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  let recipes = emptyRecipeCatalog(), recipeUnavailable;
  try { recipes = parseRecipeCatalog(await readFile(new URL("framecraft.recipes.json", root), "utf8")); } catch (error) { if (error.code !== "ENOENT") recipeUnavailable = reportRecipe(error); }
  if (catalog.gateway?.enabled !== true) process.stdout.write((json ? JSON.stringify({ type: "gateway", state: "disabled" }) : "Gateway disabilitato; nessuna connessione PLC avviata.") + "\n");
  else {
    let recipeStore, operatorAuth, operatorUnavailable, authConfig, historyUnavailable, recipePlcUnavailable;
    let recipePlcCatalog = emptyRecipePlcConfig();
    const reportRecipePlc = event => process.stderr.write(JSON.stringify(event) + "\n");
    try { recipePlcCatalog = parseRecipePlcConfig(await readFile(new URL("framecraft.recipe-plc.json", root), "utf8"), recipes, plc.variables); }
    catch (error) { if (error.code !== "ENOENT") { recipePlcUnavailable = error instanceof RecipePlcError ? error : new RecipePlcError("RECIPE_PLC_CONFIG"); reportRecipePlc({ type: "recipe-plc", code: recipePlcUnavailable.code, error: recipePlcUnavailable.message, remedy: recipePlcUnavailable.remedy }); } }
    try {
      const auth = parseOperatorAuthConfig(JSON.parse(await readFile(new URL("framecraft.auth.json", root), "utf8")));
      authConfig = auth;
      if (auth.enabled) {
        runtimeAudit = openRuntimeAudit({ root: fileURLToPath(root), namespace: auth.namespace });
        operatorAuth = createLocalOperatorAuth({ file: fileURLToPath(new URL(".framecraft-runtime/security/operators.json", root)), config: auth, allowedOrigins: catalog.gateway.allowedOrigins, audit: runtimeAudit,
          onEvent: event => process.stdout.write(JSON.stringify(event) + "\n") });
      }
    } catch (error) {
      operatorUnavailable = error instanceof OperatorAuthError ? error : new OperatorAuthError("AUTH_CONFIG");
      process.stderr.write(JSON.stringify({ type: "operator", code: operatorUnavailable.code, error: operatorUnavailable.message, remedy: operatorUnavailable.remedy }) + "\n");
    }
    if (alarmCatalog !== undefined) {
      alarmCatalog = parseAlarmCatalog(alarmCatalog, plc.variables);
      try { if (!authConfig) { if (alarmCatalog.archive?.enabled) throw new AlarmHistoryError("ALARM_HISTORY_CONFIG"); }
        else alarmHistory = openAlarmHistory({ root: fileURLToPath(root), namespace: authConfig.namespace, recordLimit: alarmCatalog.archive?.maxRecords ?? 100000, readOnly: alarmCatalog.archive?.enabled !== true });
      } catch (error) { const safe = error instanceof AlarmHistoryError ? error : new AlarmHistoryError("ALARM_HISTORY_STORAGE"); if (safe.code !== "ALARM_HISTORY_DISABLED") { historyUnavailable = safe; process.stderr.write(JSON.stringify({ type: "alarm-history", code: safe.code, error: safe.message, remedy: safe.remedy }) + "\n"); } }
    }
    if (recipes.schemas.length) {
      try {
        await mkdir(new URL(".framecraft-runtime/", root), { recursive: true, mode: 0o700 });
        recipeStore = await openRecipeStore({ directory: fileURLToPath(new URL(".framecraft-runtime/recipes/", root)), catalog: recipes });
      } catch (error) { recipeUnavailable = reportRecipe(error); }
    }
    if (recipeUnavailable) recipeUnavailable.status = 503;
    gateway = createPlcGateway(catalog, plc.variables, { alarmCatalog, alarmHistory, historyUnavailable, onHistoryDiagnostic: event => process.stderr.write(JSON.stringify(event) + "\n"), recipeStore, recipeUnavailable, recipePlcCatalog, recipePlcUnavailable, onRecipePlcDiagnostic: reportRecipePlc, operatorAuth, operatorUnavailable, audit: runtimeAudit, onDiagnostic: (event) => logger.write(event),
      onRecipeDiagnostic: event => process.stderr.write((json ? JSON.stringify(event) : event.error + ". " + event.remedy) + "\n"),
      onState: (state) => process.stdout.write(JSON.stringify({ type: "connection", ...state }) + "\n") });
    if (!stopping) {
      await gateway.start();
      process.stdout.write(JSON.stringify({ type: "gateway", address: gateway.address }) + "\n");
      if (gateway.snapshot().connections.some((connection) => connection.state === "error")) process.stderr.write((json ? JSON.stringify({ type: "gateway", state: "degraded" }) : "Gateway disponibile, ma una o più connessioni PLC non sono pronte. Consulta la diagnostica prima di usare la macchina.") + "\n");
    }
  }
} catch (error) {
  if (error instanceof RecipeStoreError) reportRecipe(error);
  else logger.write(error instanceof ConnectionOperationError ? error.diagnostic : connectionDiagnostic("CONFIGURATION", { protocol: "gateway", technicalCode: error.code }));
  await stop(); process.exitCode = 1;
} finally { if (!gateway || stopping) { runtimeAudit?.close(); alarmHistory?.close(); } if (!gateway) await logger.close(); else await logger.flush(); }
