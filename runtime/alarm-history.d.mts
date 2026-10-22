import type { AlarmEvent } from "./alarm-engine.mjs";
export class AlarmHistoryError extends Error { readonly code: string; readonly status: number; readonly remedy: string; constructor(code: string) }
export interface AlarmHistoryQuery { limit?: number; before?: number; through?: number; archiveId?: string; alarmId?: string; alarmClass?: string; area?: string; state?: AlarmEvent["state"]; from?: string; to?: string }
export interface AlarmHistoryEntry { seq: number; instanceId: string; recordedAt: string; event: AlarmEvent }
export interface AlarmHistoryCapture { state: "recording" | "disabled" | "error" | "stopped"; unconfirmedInThisRun: number; code?: string }
export interface AlarmHistoryData { version: 1; id: string; namespace: string; sequence: number; count: number; incompleteRuns: number; events: AlarmHistoryEntry[]; nextBefore: number | null }
export interface AlarmHistorySnapshot extends AlarmHistoryData { capture: AlarmHistoryCapture }
export const alarmHistoryStates: readonly AlarmEvent["state"][];
export function historyObject(value: unknown): value is Record<string, unknown>;
export function historyKeys(value: unknown, required: string[], optional?: string[]): boolean;
export function historyUuid(value: unknown): boolean;
export function parseHistoryEvent(value: unknown): AlarmEvent;
export function parseAlarmHistoryQuery(value?: unknown): AlarmHistoryQuery & { limit: number };
export function matchesAlarmHistory(row: AlarmHistoryEntry, query: AlarmHistoryQuery): boolean;
export function parseAlarmHistoryCapture(value: unknown): AlarmHistoryCapture;
export function parseAlarmHistorySnapshot(value: unknown, query?: AlarmHistoryQuery): AlarmHistorySnapshot;
