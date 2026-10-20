export type OperatorCapability = "recipes.read" | "recipes.create" | "recipes.update" | "recipes.copy" | "recipes.rename" | "recipes.delete" | "alarms.acknowledge" | "alarms.confirm" | "tags.write";
export interface OperatorAuthConfig { version: 1; enabled: boolean; namespace: string; allowHttpLoopback: boolean; idleMinutes: number; absoluteMinutes: number }
export interface OperatorProfile { id: string; name: string; role: string; permissions: string[]; capabilities: OperatorCapability[] }
export interface OperatorSession { user: OperatorProfile | null; csrfToken: string | null; expiresInMs: number }
export const operatorCapabilities: readonly OperatorCapability[];
export class OperatorAuthError extends Error { readonly code: string; readonly status: number; readonly remedy: string; constructor(code: string) }
export function operatorObject(value: unknown): value is Record<string, unknown>;
export function operatorKeys(value: unknown, keys: string[]): boolean;
export function operatorText(value: unknown, max?: number): value is string;
export function operatorUsername(value: unknown): value is string;
export function parseOperatorAuthConfig(value: unknown): OperatorAuthConfig;
