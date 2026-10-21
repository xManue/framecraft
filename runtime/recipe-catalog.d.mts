export type RecipeScalar = boolean | number | string;
export interface RecipeField { id: string; name: string; type: "boolean" | "integer" | "number" | "string"; unit?: string; minimum?: number; maximum?: number; maxLength?: number }
export interface RecipeRecord { id: string; name: string; values: Record<string, RecipeScalar> }
export interface RecipeSchema { id: string; name: string; fields: RecipeField[]; records: RecipeRecord[] }
export interface RecipeCatalog { version: 1; schemas: RecipeSchema[] }
export type RecipeAction = "create" | "update" | "rename" | "delete" | "copy" | "import";
export interface RecipeCommand { id: string; expectedRevision: string; action: RecipeAction; schemaId: string; recordId: string; name?: string; values?: Record<string, RecipeScalar>; targetId?: string; fields?: RecipeField[]; records?: RecipeRecord[] }
export class RecipeStoreError extends Error { readonly code: string; readonly status: number; readonly remedy: string; readonly fieldId?: string; constructor(code: string, fieldId?: string) }
export function recipeObject(value: unknown): value is Record<string, unknown>;
export function recipeKeys(value: unknown, required: string[], optional?: string[]): boolean;
export function recipeId(value: unknown): value is string;
export function recipeText(value: unknown, max?: number): value is string;
export function recipeActor(value: unknown): value is string;
export function recipeNameKey(value: string): string;
export function recipeByteSize(value: string): number;
export function emptyRecipeCatalog(): RecipeCatalog;
export function parseRecipeValues(raw: unknown, fields: readonly RecipeField[]): Record<string, RecipeScalar>;
export function parseRecipeRecords(raw: unknown, fields: readonly RecipeField[]): RecipeRecord[];
export function parseRecipeCatalog(input: unknown): RecipeCatalog;
export function parseRecipeCommand(input: unknown): RecipeCommand;
