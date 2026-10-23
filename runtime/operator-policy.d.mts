export type OperatorCapability = "recipes.read" | "recipes.capture" | "recipes.apply" | "recipes.create" | "recipes.update" | "recipes.copy" | "recipes.rename" | "recipes.delete" | "recipes.import" | "alarms.acknowledge" | "alarms.confirm" | "alarms.history.read" | "tags.write" | "audit.read";
export interface OperatorAuthConfig { version: 1; enabled: boolean; namespace: string; allowHttpLoopback: boolean; idleMinutes: number; absoluteMinutes: number }
export interface OperatorProfile { id: string; name: string; role: string; permissions: string[]; capabilities: OperatorCapability[] }
export interface OperatorSession { user: OperatorProfile | null; csrfToken: string | null; expiresInMs: number }
export const operatorCapabilities: readonly OperatorCapability[];
export class OperatorAuthError extends Error { readonly code: string; readonly status: number; readonly remedy: string; readonly outcome: "rejected" | "uncertain"; readonly actor?: string; constructor(code: string) }
export function operatorObject(value: unknown): value is Record<string, unknown>;
export function operatorKeys(value: unknown, keys: string[]): boolean;
export function operatorText(value: unknown, max?: number): value is string;
export function operatorUsername(value: unknown): value is string;
export function parseOperatorAuthConfig(value: unknown): OperatorAuthConfig;
export type OperatorResourceKind = "tagWrites" | "alarmActions" | "recipeChanges";
export type OperatorResourceFilter = { mode: "all" } | { mode: "selected"; ids: string[] };
export type OperatorResources = Record<OperatorResourceKind, OperatorResourceFilter>;
export interface OperatorResourceRule { accountId: string; limits: OperatorResources }
export type OperatorResourceContext = { tag: string } | { alarmId: string } | { schemaId: string };
export const operatorResourceKinds: readonly OperatorResourceKind[];
export function defaultOperatorResources(all?: boolean): OperatorResources;
export function parseOperatorResources(value: unknown): OperatorResources;
export function operatorResourceAllowed(store: { version: 1 } | { version: 2; resourceRules: OperatorResourceRule[] }, accountId: string, capability: OperatorCapability, context?: OperatorResourceContext): boolean;
