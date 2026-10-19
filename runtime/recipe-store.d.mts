import type { RecipeCatalog, RecipeCommand } from "./recipe-catalog.mjs";
export interface RecipeSnapshot extends RecipeCatalog { revision: string; sequence: number; persistence: "server-file" }
export interface RecipeMutationResult { id: string; duplicate: boolean; appliedSequence: number; effect: "recipe-storage-only"; plcConfirmed: false; snapshot: RecipeSnapshot }
export interface RecipeStore { snapshot(): Promise<RecipeSnapshot>; mutate(command: RecipeCommand, actor: string): Promise<RecipeMutationResult> }
export function openRecipeStore(options: { directory: string; catalog: RecipeCatalog; onChange?: (event: { id: string; sequence: number; action: RecipeCommand["action"]; at: string }) => unknown }): Promise<RecipeStore>;
