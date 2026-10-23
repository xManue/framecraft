export interface RecipeApplyReceipt { id: string; namespace: string; channelId: string; sequence: number; schemaId: string; recordId: string; recipeRevision: string; mappingRevision: string; fingerprint: string; actor: string; createdAt: string; updatedAt: string; phase: "reserved" | "preparing" | "committing" | "finished"; writePhase: "none" | "prepare" | "apply"; outcome: "pending" | "applied" | "rejected" | "uncertain"; code: string; plcCode: number | null }
export type RecipeApplyReservation = Pick<RecipeApplyReceipt, "id" | "channelId" | "schemaId" | "recordId" | "recipeRevision" | "mappingRevision" | "fingerprint" | "actor">;
export function parseRecipeApplyReceipt(value: unknown): RecipeApplyReceipt;
export function openRecipeApplyStore(options: { root: string; namespace: string; recordLimit?: number }): {
  get(id: string): RecipeApplyReceipt | undefined;
  channel(channelId: string, sentOnly?: boolean): RecipeApplyReceipt | undefined;
  reserve(input: RecipeApplyReservation): { receipt: RecipeApplyReceipt; duplicate: boolean };
  change(id: string, phase: RecipeApplyReceipt["phase"], outcome: RecipeApplyReceipt["outcome"], code: string, plcCode?: number | null): RecipeApplyReceipt;
  close(): void;
};
export type RecipeApplyStore = ReturnType<typeof openRecipeApplyStore>;
