import type { AlarmCommand, AlarmRow, AlarmSnapshot } from "../runtime/alarm-engine.mjs";
import type { AlarmViewContext } from "./hmi-alarm-views.mjs";
export function hmiAlarmElementBlocked(host: HTMLElement): boolean;
export function createHmiAlarmControl(host: HTMLElement, action: (command: AlarmCommand) => Promise<void>, rowFilter?: (row: AlarmRow) => boolean, viewContext?: AlarmViewContext): {
  update(value: AlarmSnapshot | undefined, available?: boolean): void;
  dispose(): void;
};
export function createHmiAlarmControlWith(host: HTMLElement, action: (command: AlarmCommand) => Promise<void>, rowFilter: ((row: AlarmRow) => boolean) | undefined, runtime: { alarmStateLabel(row: AlarmRow): string; hmiAlarmElementBlocked(host: HTMLElement): boolean } & Pick<typeof import("./hmi-alarm-views.mjs"), "activeAlarmViewDefaults" | "alarmRowMatchesView" | "compareAlarmViewRows" | "createAlarmSavedViews" | "parseAlarmViewFilters">, viewContext?: AlarmViewContext): ReturnType<typeof createHmiAlarmControl>;
