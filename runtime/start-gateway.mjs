import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPlcGateway } from "./gateway.mjs";
import { ConnectionOperationError, connectionDiagnostic } from "./connection-diagnostics.mjs";
import { createRuntimeLogger } from "./runtime-log.mjs";
import { emptyRecipeCatalog, parseRecipeCatalog, RecipeStoreError } from "./recipe-catalog.mjs";
import { openRecipeStore } from "./recipe-store.mjs";

const root = new URL("../", import.meta.url);
const json = process.argv.includes("--json");
const logger = createRuntimeLogger({ directory: fileURLToPath(new URL(".framecraft-runtime/logs/gateway/", root)), json });
let gateway, stopping = false;
function reportRecipe(error) {
  const safe = error instanceof RecipeStoreError ? error : new RecipeStoreError("RECIPE_STORAGE");
  process.stderr.write((json ? JSON.stringify({ type: "recipe", code: safe.code, error: safe.message, remedy: safe.remedy }) : safe.message + ". " + safe.remedy) + "\n"); return safe;
}
async function stop() { if (stopping) return; stopping = true; await gateway?.stop(); await logger.close(); }
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
    let recipeStore;
    if (recipes.schemas.length) {
      try {
        await mkdir(new URL(".framecraft-runtime/", root), { recursive: true, mode: 0o700 });
        recipeStore = await openRecipeStore({ directory: fileURLToPath(new URL(".framecraft-runtime/recipes/", root)), catalog: recipes });
      } catch (error) { recipeUnavailable = reportRecipe(error); }
    }
    if (recipeUnavailable) recipeUnavailable.status = 503;
    gateway = createPlcGateway(catalog, plc.variables, { alarmCatalog, recipeStore, recipeUnavailable, onDiagnostic: (event) => logger.write(event),
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
} finally { if (!gateway) await logger.close(); else await logger.flush(); }
