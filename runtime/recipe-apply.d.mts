import type { RecipeCatalog, RecipeRecord, RecipeSchema, RecipeScalar } from "./recipe-catalog.mjs";
import type { RecipePlcVariable } from "./recipe-plc.mjs";
export interface RecipeApplyProfile { schemaId: string; channelId: string; requestTag: string; responseTag: string; maxPayloadBytes: number; maxAgeMs: number; prepareTimeoutMs: number; applyTimeoutMs: number; stageLifetimeMs: number }
export interface RecipeApplyConfig { version: 1; schemas: RecipeApplyProfile[] }
export interface RecipeApplyCommand { id: string; expectedRevision: string; schemaId: string; recordId: string }
export interface RecipeApplyLookup { id: string; schemaId: string }
export interface RecipeApplyAck { version: 1; namespace: string; channelId: string; sequence: number; id: string | null; fingerprint: string | null; state: "idle" | "prepared" | "applied" | "rejected" | "uncertain"; code: number }
export class RecipeApplyError extends Error { readonly code: string; readonly status: number; readonly remedy: string; readonly outcome: "rejected" | "uncertain"; constructor(code: string) }
export function recipeApplyHash(value: unknown): boolean;
export function recipeApplyId(value: unknown): boolean;
export function recipeApplyNamespace(value: unknown): boolean;
export function recipeApplySequence(value: unknown): boolean;
export function recipeApplyAscii(value: unknown): string;
export function emptyRecipeApplyConfig(): RecipeApplyConfig;
export function parseRecipeApplyConfig(value: unknown, catalog?: RecipeCatalog, variables?: readonly RecipePlcVariable[]): RecipeApplyConfig;
export function parseRecipeApplyCommand(value: unknown): RecipeApplyCommand;
export function parseRecipeApplyLookup(value: unknown): RecipeApplyLookup;
export function recipeApplySchemaSource(schema: RecipeSchema): string;
export function recipeApplyValues(schema: RecipeSchema, record: RecipeRecord): Record<string, RecipeScalar>;
export function parseRecipeApplyAck(value: unknown): RecipeApplyAck;
export interface RecipeApplyFrame { version: 1; namespace: string; channelId: string; sequence: number; id: string; fingerprint: string; phase: "prepare" | "apply" | "status"; schemaId?: string; recordId?: string; schemaHash?: string; ttlMs?: number; values?: Record<string, RecipeScalar> }
export function parseRecipeApplyFrame(source: unknown, maxBytes?: number): RecipeApplyFrame;
export function recipeApplyFrame(receipt: { namespace: string; channelId: string; sequence: number; id: string; fingerprint: string; schemaId: string; recordId: string }, phase: "prepare" | "apply" | "status", payload: { schemaHash: string; ttlMs: number; values: Record<string, RecipeScalar> } | undefined, maxBytes: number): string;
