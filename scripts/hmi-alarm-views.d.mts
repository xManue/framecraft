import type { AlarmRow, AlarmEvent } from "../runtime/alarm-engine.mjs";
export type AlarmColumnKey = "name" | "state" | "message" | "area" | "time" | "id" | "alarmClass" | "priority" | "quality" | "acknowledged" | "confirmed" | "clearedAt" | "occurrence";
export interface AlarmColumn { key: AlarmColumnKey; label: string; width: number; visible: boolean }
export interface AlarmColumnsConfig { version: 1; timeZone: "local" | "UTC"; columns: AlarmColumn[] }
export const alarmColumnsAttribute: "data-hmi-alarm-columns";
export const alarmColumnDefinitions: readonly Readonly<AlarmColumn>[];
export function defaultAlarmColumns(): AlarmColumnsConfig;
export function parseAlarmColumns(value: unknown): AlarmColumnsConfig;
export function serializeAlarmColumns(value: AlarmColumnsConfig): string;
export function alarmColumnValue(key: AlarmColumnKey, item: AlarmRow | AlarmEvent, history: boolean, state: string, timeZone: AlarmColumnsConfig["timeZone"]): string;
export interface AlarmViewContext { namespace: string; operator?: () => { id: string; capabilities?: readonly string[]; permissions?: readonly string[] } | null }
export interface ActiveAlarmViewFilters { search: string; area: string; alarmClass: string; state: "all" | "active" | "unacknowledged" | "awaiting-confirmation"; quality: "all" | "good" | "invalid"; minimumPriority: string; order: "priority-desc" | "priority-asc" | "latest-desc" | "oldest-asc" | "name-asc" | "name-desc" }
export interface HistoryAlarmViewFilters { alarmId: string; alarmClass: string; area: string; state: string; from: string; to: string }
export type AlarmViewKind = "active" | "history";
export type AlarmViewFilters = ActiveAlarmViewFilters | HistoryAlarmViewFilters;
export class AlarmViewError extends Error { code: string; constructor(code: string) }
export function alarmViewsRuntimeModuleSource(): string;
export const activeAlarmViewDefaults: Readonly<ActiveAlarmViewFilters>;
export function parseAlarmViewFilters(kind: "active", value: unknown): ActiveAlarmViewFilters;
export function parseAlarmViewFilters(kind: "history", value: unknown): HistoryAlarmViewFilters;
export function parseAlarmViewFilters(kind: AlarmViewKind, value: unknown): AlarmViewFilters;
export function alarmRowMatchesView(row: AlarmRow, filters: ActiveAlarmViewFilters): boolean;
export function compareAlarmViewRows(a: AlarmRow, b: AlarmRow, order: ActiveAlarmViewFilters["order"]): number;
export function alarmViewsStorageKey(context: AlarmViewContext | undefined, kind: AlarmViewKind): string;
export function parseAlarmViews(text: string | null, kind: AlarmViewKind): { version: 1; views: { id: string; name: string; filters: AlarmViewFilters }[] };
export function createAlarmSavedViews(options: { document: Document; kind: AlarmViewKind; context?: AlarmViewContext; dark?: boolean; disabled(): boolean; current(): AlarmViewFilters; apply(filters: AlarmViewFilters): void; changed(): void }): { render(): HTMLDetailsElement; reset(): void; dispose(): void };
