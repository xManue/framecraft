import type { PlcVariableDefinition } from "./plcVariables";
import { parseServiceDataLogs } from "../../runtime/data-log.mjs";
import { normalizeMqttTagValue } from "../../runtime/connection-config.mjs";
import { dataLogDeadbandValid, effectiveDataLogDeadband } from "../../runtime/data-log-deadband.mjs";
import browserRuntimeSource from "../../runtime/data-log-browser.mjs?raw";
import { parseHmiDataLogCatalog } from "../../runtime/data-log-browser.mjs";
import type { HmiDataLogCatalog, HmiDataLogDefinition, HmiDataLogIssue } from "../../runtime/data-log-browser.mjs";

export { hmiLoggingModes, hmiLogAggregations, emptyHmiDataLogCatalog, defaultHmiDataLog, defaultHmiLoggingTag, parseHmiDataLogCatalog, createHmiDataLogRuntime } from "../../runtime/data-log-browser.mjs";
export type { HmiDataLogDeadband, HmiLoggingMode, HmiLogAggregation, HmiLogTriggerCondition, HmiLoggingTagDefinition, HmiDataLogDefinition, HmiDataLogCatalog, HmiDataLogIssue, HmiDataLogSample, HmiDataLogTagStatus, HmiDataLogStorage, HmiDataLogRuntimeOptions, HmiDataLogRuntime } from "../../runtime/data-log-browser.mjs";
export const hmiDataLogCatalogName = "framecraft.logs.json";

export function serializeHmiDataLogCatalog(catalog: HmiDataLogCatalog): string {
  return `${JSON.stringify(parseHmiDataLogCatalog(catalog), null, 2)}\n`;
}

export function hmiDataLogCatalogIssues(catalog: HmiDataLogCatalog, variables?: readonly PlcVariableDefinition[]): HmiDataLogIssue[] {
  const issues: HmiDataLogIssue[] = [];
  if (catalog.logs.filter(log => log.storage === "runtime").reduce((sum, log) => sum + estimateHmiDataLogBytes(log), 0) > 256 * 1024 * 1024) issues.push({ severity: "warning", message: "La stima dei Data Log del servizio supera 256 MiB, il limite complessivo del database. Riduci i campioni o prepara una politica di conservazione e backup adeguata." });
  if (catalog.logs.some(log => log.storage === "runtime")) try { parseServiceDataLogs(catalog, variables?.filter(v => !v.detected)); } catch { issues.push({ severity: "error", message: "Data Log del servizio: verifica variabili scalari leggibili, trigger e limiti. Massimo 64 archivi e 512 variabili del servizio complessive; il minimo ciclo è 500 ms." }); }
  const logIds = new Set<string>();
  const logNames = new Set<string>();
  const declared = variables?.length ? new Set(variables.filter((variable) => !variable.detected).map((variable) => variable.name)) : undefined;
  for (const log of catalog.logs) {
    if (log.deadband !== undefined && !dataLogDeadbandValid(log.deadband)) issues.push({ severity: "error", logId: log.id, message: `${log.name}: il filtro variazioni richiede una modalità valida e una soglia finita maggiore o uguale a zero.` });
    if (log.storage === "runtime" && (log.maxEntries > 500000 || log.tags.length > 256 || !/^[A-Za-z0-9_-]{1,80}$/.test(log.id))) issues.push({ severity: "error", logId: log.id, message: `${log.name}: il servizio accetta fino a 500000 campioni, 256 variabili per archivio e ID con lettere, cifre, trattini o underscore.` });
    const logId = log.id.toLocaleLowerCase();
    const logName = log.name.toLocaleLowerCase();
    if (logIds.has(logId)) issues.push({ severity: "error", logId: log.id, message: `Data log: identificatore duplicato “${log.id}”.` });
    if (logNames.has(logName)) issues.push({ severity: "error", logId: log.id, message: `Data log: nome duplicato “${log.name}”.` });
    logIds.add(logId); logNames.add(logName);
    if (log.segmentDurationMs > log.retentionMs) issues.push({ severity: "warning", logId: log.id, message: `${log.name}: un segmento dura più del periodo di conservazione.` });
    const tagIds = new Set<string>();
    for (const tag of log.tags) {
      if (tag.deadband !== undefined && !dataLogDeadbandValid(tag.deadband)) issues.push({ severity: "error", logId: log.id, loggedTagId: tag.id, message: `${log.name} / ${tag.name}: filtro variazioni non valido. Correggi modalità e soglia.` });
      if (effectiveDataLogDeadband(log, tag) && variables) {
        const variable = variables.find(v => v.name === tag.tag && !v.detected);
        let numeric = false;
        try { numeric = !!variable && !["bool", "boolean", "string", "wstring"].includes(variable.dataType.toLowerCase()); if (numeric) normalizeMqttTagValue(0, variable!.dataType); } catch { numeric = false; }
        if (!numeric) issues.push({ severity: "error", logId: log.id, loggedTagId: tag.id, message: `${log.name} / ${tag.name}: il filtro variazioni richiede un tag numerico scalare dichiarato. Per testi o BOOL scegli Nessuno sulla variabile, anche se l’archivio ha un filtro predefinito.` });
      }
      if (log.storage === "runtime" && (!/^[A-Za-z0-9_-]{1,80}$/.test(tag.id) || variables && !variables.some(v => v.name === tag.tag && v.access !== "write" && !v.detected && !v.dataType.includes("[")))) issues.push({ severity: "error", logId: log.id, loggedTagId: tag.id, message: `${log.name} / ${tag.name}: usa un ID valido e una variabile scalare dichiarata e leggibile dal gateway.` });
      const id = tag.id.toLocaleLowerCase();
      if (tagIds.has(id)) issues.push({ severity: "error", logId: log.id, loggedTagId: tag.id, message: `${log.name}: identificatore variabile duplicato “${tag.id}”.` });
      tagIds.add(id);
      if (!tag.tag) issues.push({ severity: "error", logId: log.id, loggedTagId: tag.id, message: `${log.name} / ${tag.name}: collega una variabile PLC.` });
      else if (declared && !declared.has(tag.tag)) issues.push({ severity: "warning", logId: log.id, loggedTagId: tag.id, message: `${log.name} / ${tag.name}: la variabile “${tag.tag}” non è dichiarata.` });
      if (tag.mode === "cyclic" && tag.cycleMs < 500) issues.push({ severity: "error", logId: log.id, loggedTagId: tag.id, message: `${log.name} / ${tag.name}: WinCC Unified non consente cicli Data Log inferiori a 500 ms.` });
      if (tag.mode === "on-demand" && !tag.triggerTag) issues.push({ severity: "warning", logId: log.id, loggedTagId: tag.id, message: `${log.name} / ${tag.name}: configura un trigger oppure richiama il campionamento da script.` });
      if (tag.minimum !== undefined && tag.maximum !== undefined && tag.minimum > tag.maximum) issues.push({ severity: "error", logId: log.id, loggedTagId: tag.id, message: `${log.name} / ${tag.name}: il limite minimo supera il massimo.` });
      if (tag.aggregation !== "none" && tag.aggregationWindowMs < 500) issues.push({ severity: "error", logId: log.id, loggedTagId: tag.id, message: `${log.name} / ${tag.name}: la finestra di aggregazione deve essere almeno 500 ms.` });
    }
  }
  return issues;
}

export function estimateHmiDataLogBytes(log: HmiDataLogDefinition): number {
  return log.maxEntries * (log.storage === "runtime" ? 512 : 112);
}

export function hmiDataLogRuntimeModuleSource(): string {
  return "// @ts-nocheck\n" + browserRuntimeSource.replaceAll('"./data-log-deadband.mjs"', '"../runtime/data-log-deadband.mjs"');
}
