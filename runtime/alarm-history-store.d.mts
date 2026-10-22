import type { AlarmEvent } from "./alarm-engine.mjs";
import type { AlarmHistoryData, AlarmHistoryQuery } from "./alarm-history.mjs";
export interface AlarmHistoryStore { begin(instanceId: string): void; append(events: AlarmEvent[]): { sequence: number }; read(query?: AlarmHistoryQuery): AlarmHistoryData; finish(sourceSequence: number, missed: number): void; close(): void }
export function openAlarmHistory(options: { root: string; namespace: string; recordLimit?: number; readOnly?: boolean }): AlarmHistoryStore;
