export { alarmCatalogIssues, alarmDependencyTags, alarmStateLabel, createAlarmEngine, emptyAlarmCatalog, parseAlarmCatalog } from "../../runtime/alarm-engine.mjs";
export type { AlarmCatalog, AlarmDefinition, AlarmRow, AlarmSnapshot, AlarmCommand, AlarmClass, AlarmTrigger, AlarmAnalogKind, AlarmVariable, AlarmEvent } from "../../runtime/alarm-engine.mjs";
export const alarmCatalogFile = "framecraft.alarms.json";
export interface AlarmConfigurationSnapshot { generation: number; source: string | null; plc: string | null }
export interface AlarmPreviewConfiguration { catalog: import("../../runtime/alarm-engine.mjs").AlarmCatalog; variables: import("../../runtime/alarm-engine.mjs").AlarmVariable[] }
