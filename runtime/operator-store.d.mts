import type { OperatorCapability } from "./operator-policy.mjs";
export * from "./operator-policy.mjs";
export interface OperatorPassword { algorithm: "scrypt"; N: 131072; r: 8; p: 1; salt: string; key: string }
export interface LocalOperator { id: string; username: string; name: string; role: string; disabled: boolean; capabilities: OperatorCapability[]; permissions: string[]; password: OperatorPassword }
export interface OperatorStore { version: 1; id: string; accounts: LocalOperator[] }
export function hashOperatorPassword(password: string): Promise<OperatorPassword>;
export function verifyOperatorPassword(password: string, hash: OperatorPassword): Promise<boolean>;
export function parseOperatorStore(input: unknown): OperatorStore;
export function readOperatorStore(file: string): Promise<{ store: OperatorStore; revision: string } | undefined>;
export function writeOperatorStore(file: string, store: OperatorStore, expectedRevision: string | undefined): Promise<{ store: OperatorStore; revision: string }>;
