import type { RecipeRecord, RecipeSchema } from "./recipe-catalog.mjs";
export interface RecipeTable { format: "framecraft" | "table"; schemaId?: string; columns: string[]; rows: string[][] }
export interface RecipeTableMapping { idColumn: number; nameColumn: number; fields: Record<string, number>; decimal: "." | ","; ignoreExtraColumns: boolean }
export class RecipeTableError extends Error { code: string; remedy: string; row?: number; column?: string; constructor(code: string, row?: number, column?: string) }
export function parseRecipeTable(source: string): RecipeTable;
export function suggestRecipeTableMapping(schema: RecipeSchema, table: RecipeTable): RecipeTableMapping;
export function mapRecipeTable(schema: RecipeSchema, table: RecipeTable, mapping: RecipeTableMapping): RecipeRecord[];
export function exportRecipeTable(schema: RecipeSchema): string;
