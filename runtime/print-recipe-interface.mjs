import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseRecipeCatalog } from "./recipe-catalog.mjs";
import { parseOperatorAuthConfig } from "./operator-policy.mjs";
import { RecipeApplyError, emptyRecipeApplyConfig, parseRecipeApplyConfig, recipeApplySchemaSource } from "./recipe-apply.mjs";
const root = new URL("../", import.meta.url);
try {
  if (process.argv.slice(2).some(arg => arg !== "--json")) throw new RecipeApplyError("RECIPE_APPLY_INPUT");
  const auth = parseOperatorAuthConfig(JSON.parse(await readFile(new URL("framecraft.auth.json", root), "utf8")));
  const recipes = parseRecipeCatalog(await readFile(new URL("framecraft.recipes.json", root), "utf8"));
  const plc = JSON.parse(await readFile(new URL("framecraft.plc.json", root), "utf8")); let config = emptyRecipeApplyConfig();
  try { config = parseRecipeApplyConfig(await readFile(new URL("framecraft.recipe-apply.json", root), "utf8"), recipes, plc.variables); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const descriptor = { protocol: "framecraft-recipe-apply", version: 1, namespace: auth.namespace, configurationEnabled: config.schemas.length > 0, schemas: config.schemas.map(profile => {
    const schema = recipes.schemas.find(item => item.id === profile.schemaId), source = recipeApplySchemaSource(schema);
    return { ...profile, schemaHash: createHash("sha256").update(source).digest("hex"), fields: JSON.parse(source).fields };
  }) };
  process.stdout.write(JSON.stringify(descriptor, null, 2) + "\n");
} catch (error) {
  const safe = error instanceof RecipeApplyError ? error : new RecipeApplyError("RECIPE_APPLY_CONFIG"); process.stderr.write(JSON.stringify({ type: "recipe-apply", code: safe.code, error: safe.message, remedy: safe.remedy }) + "\n"); process.exitCode = 1;
}
