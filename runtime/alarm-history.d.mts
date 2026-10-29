import type { AlarmEvent } from "./alarm-engine.mjs";
export class AlarmHistoryError extends Error { readonly code: string; readonly status: number; readonly remedy: string; readonly outcome: "rejected" | "uncertain"; constructor(code: string) }
export interface AlarmHistoryQuery { limit?: number; before?: number; through?: number; archiveId?: string; alarmId?: string; alarmClass?: string; area?: string; state?: AlarmEvent["state"]; from?: string; to?: string }
export interface AlarmHistoryEntry { seq: number; instanceId: string; recordedAt: string; event: AlarmEvent }
export interface AlarmHistoryCapture { state: "recording" | "disabled" | "error" | "stopped"; unconfirmedInThisRun: number; code?: string }
export interface AlarmHistoryData { version: 1; id: string; namespace: string; sequence: number; count: number; incompleteRuns: number; events: AlarmHistoryEntry[]; nextBefore: number | null }
export interface AlarmHistorySnapshot extends AlarmHistoryData { capture: AlarmHistoryCapture }
export type AlarmNoteTarget = { alarmId: string } & ({ archiveId: string; seq: number } | { instanceId: string; occurrence: string; sourceSequence?: number });
export type AlarmNotesQuery = AlarmNoteTarget & { before?: number; through?: number };
export interface AlarmNoteCommand { version: 1; id: string; serviceInstanceId: string; reference: { archiveId: string; seq: number; alarmId: string }; text: string }
export interface AlarmNotesData { version: 1; id: string; namespace: string; sequence: number; through: number; reference: AlarmHistoryEntry; comments: AlarmHistoryEntry[]; nextBefore: number | null }
export interface AlarmNotesSnapshot extends AlarmNotesData { writable: boolean; serviceInstanceId: string }
export interface AlarmNoteResult { version: 1; id: string; namespace: string; commandId: string; duplicate: boolean; entry: AlarmHistoryEntry }
export function alarmNoteTextValid(value: unknown): boolean;
export function alarmNoteEntryValid(row: AlarmHistoryEntry, archiveId: string): boolean;
export function parseAlarmNoteQuery(value: unknown): AlarmNotesQuery;
export function parseAlarmNoteCommand(value: unknown): AlarmNoteCommand;
export function parseAlarmNotesSnapshot(value: unknown, query: AlarmNotesQuery): AlarmNotesSnapshot;
export function parseAlarmNoteResult(value: unknown, command: AlarmNoteCommand): AlarmNoteResult;
export const alarmHistoryStates: readonly AlarmEvent["state"][];
export function historyObject(value: unknown): value is Record<string, unknown>;
export function historyKeys(value: unknown, required: string[], optional?: string[]): boolean;
export function historyUuid(value: unknown): boolean;
export function parseHistoryEvent(value: unknown): AlarmEvent;
export function parseAlarmHistoryQuery(value?: unknown): AlarmHistoryQuery & { limit: number };
export function matchesAlarmHistory(row: AlarmHistoryEntry, query: AlarmHistoryQuery): boolean;
export function parseAlarmHistoryCapture(value: unknown): AlarmHistoryCapture;
export function parseAlarmHistorySnapshot(value: unknown, query?: AlarmHistoryQuery): AlarmHistorySnapshot;
export type AlarmStatisticsOrder = "frequency" | "active-total" | "ack-total" | "interval-average" | "name";
export interface AlarmStatisticsQuery extends Omit<AlarmHistoryQuery, "before"> { order?: AlarmStatisticsOrder }
export interface AlarmStatisticsMetric { pairs: number; totalMs: number; averageMs: number | null; invalidPairs: number; unpaired: number; unmatchedTransitions: number }
export interface AlarmStatisticsRow { id: string; name: string; text: string; alarmClass: string; area: string; priority: number; events: number; incoming: number; outgoing: number; acknowledged: number; confirmed: number; shelved?: number; unshelved?: number; commented?: number; firstTime: number; lastTime: number; active: AlarmStatisticsMetric; ack: AlarmStatisticsMetric; interval: AlarmStatisticsMetric }
export interface AlarmStatisticsData { version: 1; id: string; namespace: string; sequence: number; through: number; matchedEvents: number; activations: number; alarms: number; incompleteRuns: number; order: AlarmStatisticsOrder; limit: number; rows: AlarmStatisticsRow[] }
export interface AlarmStatisticsSnapshot extends AlarmStatisticsData { capture: AlarmHistoryCapture }
export const alarmStatisticsOrders: readonly AlarmStatisticsOrder[];
export function parseAlarmStatisticsQuery(value?: unknown): AlarmStatisticsQuery & { limit: number; order: AlarmStatisticsOrder };
export function compareAlarmStatisticsRows(a: AlarmStatisticsRow, b: AlarmStatisticsRow, order: AlarmStatisticsOrder): number;
export function createAlarmStatisticsAccumulator(): { push(row: AlarmHistoryEntry): void; finish(order?: AlarmStatisticsOrder, limit?: number): Pick<AlarmStatisticsData, "matchedEvents" | "activations" | "alarms" | "rows"> };
export function parseAlarmStatisticsSnapshot(value: unknown, query?: AlarmStatisticsQuery): AlarmStatisticsSnapshot;
