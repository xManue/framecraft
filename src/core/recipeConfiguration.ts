import { parseRecipeCatalog, parseRecipeValues, RecipeStoreError, recipeNameKey, type RecipeCatalog } from "../../runtime/recipe-catalog.mjs";
export { emptyRecipeCatalog, parseRecipeCatalog } from "../../runtime/recipe-catalog.mjs";
export type { RecipeCatalog, RecipeField, RecipeRecord, RecipeSchema, RecipeScalar } from "../../runtime/recipe-catalog.mjs";
export interface RecipeConfigurationSnapshot { generation: number; source: string | null; initialized: boolean }
export const recipeConfigurationFile = "framecraft.recipes.json";
export function recipeConfigurationError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/command.+not found|unknown command/i.test(message)) return "Questa build desktop non include ancora la configurazione ricette. Apri una nuova build di Framecraft quando hai salvato il lavoro; nessun riavvio automatico.";
  return message || "Operazione ricette non completata. La bozza e i file esistenti non vengono sostituiti.";
}
export function recipeConfigurationIssues(catalog: RecipeCatalog): string[] {
  try { parseRecipeCatalog(catalog); return []; } catch { /* Locate invalid drafts below; valid catalogs take a single parser pass. */ }
  const issues: string[] = [];
  const check = (name: string, run: () => unknown) => { try { run(); } catch (error) { issues.push(`${name}: ${error instanceof RecipeStoreError ? error.message : "configurazione non valida"}.`); } };
  for (const schema of catalog.schemas) {
    if (!schema.fields.length) issues.push(`${schema.name}: aggiungi almeno un campo.`);
    check(schema.name, () => parseRecipeCatalog({ version: 1, schemas: [{ ...schema, records: [] }] }));
    for (const record of schema.records) for (const field of schema.fields) check(`${schema.name} / ${record.name} / ${field.name}`, () => parseRecipeValues({ [field.id]: record.values[field.id] }, [field]));
    if (new Set(schema.records.map(record => recipeNameKey(record.name))).size !== schema.records.length) issues.push(`${schema.name}: due ricette hanno lo stesso nome.`);
  }
  if (!issues.length) check("Catalogo", () => parseRecipeCatalog(catalog));
  return issues;
}
export function recipeDraftNumber(text: string): number | string {
  return text.trim() && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) && Number.isFinite(Number(text)) ? Number(text) : text;
}
export function recipeNewId(used: readonly string[], prefix: string): string { let n = 1; while (used.includes(`${prefix}-${n}`)) n++; return `${prefix}-${n}`; }
