import type { AlarmCommand, AlarmRow, AlarmSnapshot } from "../runtime/alarm-engine.mjs";
export function hmiAlarmElementBlocked(host: HTMLElement): boolean;
export function createHmiAlarmControl(host: HTMLElement, action: (command: AlarmCommand) => Promise<void>, rowFilter?: (row: AlarmRow) => boolean): {
  update(value: AlarmSnapshot | undefined, available?: boolean): void;
  dispose(): void;
};
export function createHmiAlarmControlWith(host: HTMLElement, action: (command: AlarmCommand) => Promise<void>, rowFilter: ((row: AlarmRow) => boolean) | undefined, runtime: { alarmStateLabel(row: AlarmRow): string; hmiAlarmElementBlocked(host: HTMLElement): boolean }): ReturnType<typeof createHmiAlarmControl>;
