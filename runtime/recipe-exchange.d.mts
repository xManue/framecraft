import type { RecipeSchema, RecipeRecord, RecipeField } from "./recipe-catalog.mjs";
export const recipeFileMaxBytes: number;
export interface RecipeFile { format: "framecraft.recipes"; version: 1; source: { revision: string; sequence: number; exportedAt: string }; schema: RecipeSchema }
export interface RecipeImportPreview { records: RecipeRecord[]; changes: { id: string; kind: "create" | "update" | "unchanged"; before?: RecipeRecord; after: RecipeRecord }[]; kept: number; total: number }
export function exportRecipeFile(schema: RecipeSchema, source: RecipeFile["source"]): string;
export function parseRecipeFile(input: string): RecipeFile;
export function mergeRecipeRecords(schema: RecipeSchema, fields: RecipeField[], records: RecipeRecord[]): RecipeRecord[];
export function previewRecipeImport(schema: RecipeSchema, file: RecipeFile): RecipeImportPreview;
