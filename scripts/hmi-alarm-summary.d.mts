import type { AlarmCommand, AlarmRow, AlarmSnapshot } from "../runtime/alarm-engine.mjs";
import type { AlarmViewContext } from "./hmi-alarm-views.mjs";
export const hmiAlarmSummaryAttribute: "data-hmi-alarm-summary";
export const hmiAlarmSummaryCss: string;
export type HmiAlarmSummaryKind = "indicator" | "line";
export interface HmiAlarmSummaryConfig {
  version: 1; caption: string; classes: string[]; areas: string[]; minPriority: number;
  mode: "pending" | "active" | "unacknowledged"; order: "latest" | "priority"; rows: number;
  display: "icon-text" | "icon" | "text"; showAlways: boolean; flash: boolean; openDetails: boolean;
  alarmColor: string; normalColor: string; timeZone: "local" | "UTC"; pageRoute?: string;
}
export function defaultHmiAlarmSummaryConfig(kind?: HmiAlarmSummaryKind): HmiAlarmSummaryConfig;
export function hmiAlarmSummaryIssues(value: unknown, routes?: readonly string[]): string[];
export function parseHmiAlarmSummaryConfig(value: unknown): HmiAlarmSummaryConfig | undefined;
export function serializeHmiAlarmSummaryConfig(config: HmiAlarmSummaryConfig): string;
export function alarmSummaryFilter(row: AlarmRow, config: HmiAlarmSummaryConfig): boolean;
export function alarmSummaryMode(row: AlarmRow, config: HmiAlarmSummaryConfig): boolean;
export function hmiAlarmSummaryView(snapshot: AlarmSnapshot | undefined, config: HmiAlarmSummaryConfig, available?: boolean): {
  rows: AlarmRow[]; selected: AlarmRow[]; pending: number; active: number;
  unacknowledged: number; unconfirmed: number; invalid: number; shelved: number; count: number;
  known: boolean; message: string; state: "unknown" | "alarm" | "normal"; hidden: boolean;
};
export function hmiAlarmSummaryJsx(kind: HmiAlarmSummaryKind): string;
export function createHmiAlarmSummary(host: HTMLElement, options: { action(command: AlarmCommand): Promise<void>; navigate?(route: string): void; routes?: readonly string[]; views?: AlarmViewContext }): {
  update(next: AlarmSnapshot | undefined, connected?: boolean): void;
  dispose(): void;
};
export function createHmiAlarmSummaryWith(host: HTMLElement, options: Parameters<typeof createHmiAlarmSummary>[1], runtime: { alarmStateLabel(row: AlarmRow): string; createHmiAlarmControl: typeof import("./hmi-alarm-control.mjs").createHmiAlarmControl; hmiAlarmElementBlocked(host: HTMLElement): boolean }): ReturnType<typeof createHmiAlarmSummary>;
