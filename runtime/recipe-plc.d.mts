import type { RecipeCatalog, RecipeSchema, RecipeScalar } from "./recipe-catalog.mjs";
export interface RecipePlcVariable { name: string; dataType: string; access: string; detected?: boolean }
export interface RecipePlcMapping { schemaId: string; maxAgeMs: number; maxSkewMs: number; fields: { fieldId: string; tag: string }[] }
export interface RecipePlcConfig { version: 1; schemas: RecipePlcMapping[] }
export interface RecipePlcEntry { fieldId: string; tag: string; dataType: string; ok: boolean; code?: string; value?: RecipeScalar; receivedAt?: number; sourceTimestamp?: number; qualityCode?: number; connectionId?: string; protocol?: "mqtt" | "opcua" }
export interface RecipePlcCapture { version: 1; schemaId: string; revision: string; mappingRevision: string; capturedAt: number; maxAgeMs: number; maxSkewMs: number; effect: "plc-read-only"; simultaneous: false; plcConfirmed: false; entries: RecipePlcEntry[]; complete: boolean; values?: Record<string, RecipeScalar>; code?: "RECIPE_PLC_SKEW" | "RECIPE_PLC_VALUES" }
export class RecipePlcError extends Error { readonly code: string; readonly status: number; readonly remedy: string; readonly fieldId?: string; constructor(code: string, fieldId?: string) }
export function recipePlcTypeCompatible(fieldType: string, dataType: string): boolean;
export function emptyRecipePlcConfig(): RecipePlcConfig;
export function parseRecipePlcConfig(input: unknown, catalog?: RecipeCatalog, variables?: readonly RecipePlcVariable[]): RecipePlcConfig;
export function parseRecipePlcQuery(value: unknown): { schemaId: string; expectedRevision: string };
export function captureRecipePlc(mapping: RecipePlcMapping, schema: RecipeSchema, revision: string, mappingRevision: string, variables: readonly RecipePlcVariable[], read: (tag: string) => { connectionId: string; protocol: "mqtt" | "opcua"; state: string; sample?: { value?: string | number | boolean; qualityCode?: number; receivedAt: number; sourceTimestamp?: number; lastError?: string | number; retained?: boolean } } | undefined, now?: number): RecipePlcCapture;
export function parseRecipePlcCapture(value: unknown, schema: RecipeSchema, revision: string): RecipePlcCapture;
