import type { RecipeCatalog, RecipeScalar } from "./recipe-catalog.mjs";
import type { RecipeApplyAck, RecipeApplyFrame } from "./recipe-apply.mjs";
export const recipePlcCodes: Readonly<Record<"INTERLOCK" | "SCHEMA" | "VALUES" | "BUSY" | "EXPIRED" | "RESTART" | "NOT_SEEN" | "OLD_SEQUENCE" | "EXECUTION" | "STORAGE", number>>;
export interface RecipePlcRetainedState { version: 1; namespace: string; channelId: string; highWater: number; last: RecipeApplyAck | null; active: { request: RecipeApplyFrame; expires: number; committing: boolean } | null }
export function newRecipePlcState(namespace: string, channelId: string): RecipePlcRetainedState;
export function createRecipePlcReference(options: { namespace: string; channelId: string; catalog: RecipeCatalog; maxPayloadBytes?: number; retained: RecipePlcRetainedState; persist(state: RecipePlcRetainedState): void; canApply(request: RecipeApplyFrame): boolean; apply(values: Record<string, RecipeScalar>, request: RecipeApplyFrame): void }): {
  receive(source: string, now?: number): RecipeApplyAck;
  tick(now?: number): RecipeApplyAck;
  response(): RecipeApplyAck;
  retained(): RecipePlcRetainedState;
};
