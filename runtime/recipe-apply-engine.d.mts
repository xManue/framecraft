import type { RecipeApplyCommand, RecipeApplyConfig, RecipeApplyLookup, RecipeApplyProfile } from "./recipe-apply.mjs";
import type { RecipeApplyReceipt, RecipeApplyStore } from "./recipe-apply-store.mjs";
import type { RecipeStore } from "./recipe-store.mjs";
export interface RecipeApplyResult extends Omit<RecipeApplyReceipt, "namespace" | "fingerprint" | "actor"> { type: "recipe-apply"; version: 1; ledgerId: string; effect: "plc-recipe"; plcConfirmed: boolean; duplicate: boolean }
export interface RecipeApplyContext { actor: string; authorize(): Promise<string>; alive?(): boolean }
export interface RecipeApplyChannel { connected(): boolean; read(): { value?: string | number | boolean; qualityCode?: number; receivedAt: number; lastError?: string | number; retained?: boolean } | undefined; write(frame: string): Promise<unknown> }
export function createRecipeApplyEngine(options: { namespace: string; config: RecipeApplyConfig; store: RecipeApplyStore; recipes: Pick<RecipeStore,"snapshot">; channel(profile: RecipeApplyProfile): RecipeApplyChannel | undefined }): {
  apply(command: RecipeApplyCommand, context: RecipeApplyContext): Promise<RecipeApplyResult>;
  fence(command: RecipeApplyCommand, context: RecipeApplyContext): Promise<RecipeApplyResult>;
  status(query: RecipeApplyLookup): RecipeApplyResult;
  current(schemaId: string): { type: "recipe-apply-current"; version: 1; ledgerId: string; current: RecipeApplyResult | null };
  check(query: RecipeApplyLookup, context: RecipeApplyContext): Promise<RecipeApplyResult>;
  stop(): Promise<void>;
};
