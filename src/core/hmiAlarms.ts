export { alarmCatalogIssues, alarmStateLabel, createAlarmEngine, emptyAlarmCatalog, parseAlarmCatalog } from "../../runtime/alarm-engine.mjs";
export type { AlarmCatalog, AlarmDefinition, AlarmRow, AlarmSnapshot, AlarmCommand, AlarmClass, AlarmTrigger, AlarmEvent } from "../../runtime/alarm-engine.mjs";
export const alarmCatalogFile = "framecraft.alarms.json";
export interface AlarmConfigurationSnapshot { generation: number; source: string | null; plc: string | null }
