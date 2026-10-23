export { emptyRecipePlcConfig, parseRecipePlcConfig, recipePlcTypeCompatible, RecipePlcError } from "../../runtime/recipe-plc.mjs";
export type { RecipePlcConfig, RecipePlcMapping } from "../../runtime/recipe-plc.mjs";
export interface RecipePlcConfigurationSnapshot { generation: number; source: string | null; recipes: string | null; plc: string | null }
export function recipePlcVariables(source: string | null): import("../../runtime/recipe-plc.mjs").RecipePlcVariable[] {
  if (source === null) return [];
  let raw;
  try { raw = JSON.parse(source); } catch { throw new Error("Catalogo variabili PLC non valido. Correggilo in Variabili PLC prima di configurare i collegamenti."); }
  if (raw?.version !== 1 || !Array.isArray(raw.variables) || raw.variables.some((item: unknown) => !item || typeof item !== "object" || typeof (item as Record<string, unknown>).name !== "string" || typeof (item as Record<string, unknown>).dataType !== "string" || !["read", "write", "read-write"].includes(String((item as Record<string, unknown>).access))) || new Set(raw.variables.map((item: { name: string }) => item.name)).size !== raw.variables.length) throw new Error("Catalogo variabili PLC non valido o con nomi duplicati. Salvalo da Variabili PLC e riprova.");
  return raw.variables;
}
export function recipePlcConfigurationError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/command.+not found|unknown command/i.test(message)) return "Questa build desktop non include i collegamenti ricette-PLC. Salva il lavoro e apri una build aggiornata di Framecraft; nessun riavvio automatico.";
  return message || "Collegamenti ricette-PLC non disponibili. La bozza e i file esistenti restano invariati.";
}
