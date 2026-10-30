import { hmiDataLogCatalogIssues, parseHmiDataLogCatalog, type HmiDataLogCatalog } from "./hmiDataLogs";
import type { PlcVariableDefinition } from "./plcVariables";
import { dataLogDeadbandValid } from "../../runtime/data-log-deadband.mjs";

export interface GuidedLogBinding { logId: string; loggedTagId: string }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 200) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min: number, max: number) => number(value, min, max) && Number.isSafeInteger(value);
const keys = (value: Record<string, unknown>, required: string[], optional: string[] = []) => required.every(key => key in value) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
function fail(part: string): never { throw new Error(`Catalogo Data Log: ${part}. Importa un framecraft.logs.json esportato dall’editor, senza campioni storici o campi aggiunti; nessun dato importato.`); }

export function parseGuidedDataLogs(value: unknown, variables?: readonly PlcVariableDefinition[]): HmiDataLogCatalog {
  let raw = value;
  if (typeof raw === "string") {
    if (new TextEncoder().encode(raw).byteLength > 2_000_000) fail("massimo 2 MB");
    try { raw = JSON.parse(raw.replace(/^\uFEFF/, "")); } catch { fail("JSON non leggibile"); }
  }
  if (!record(raw) || !keys(raw, ["version", "projectKey", "logs"]) || raw.version !== 1 || !text(raw.projectKey) || !Array.isArray(raw.logs) || raw.logs.length > 32) fail("versione, identificativo progetto o lista archivi non validi");
  let count = 0;
  for (const log of raw.logs) {
    if (!record(log) || !keys(log, ["id", "name", "enabled", "storage", "retentionMs", "maxEntries", "segmentDurationMs", "tags"], ["deadband"]) || log.deadband !== undefined && !dataLogDeadbandValid(log.deadband) || !text(log.id, 80) || !text(log.name) || typeof log.enabled !== "boolean" || !["memory", "browser-local", "runtime"].includes(String(log.storage)) || !integer(log.retentionMs, 60_000, (log.storage === "runtime" ? 3660 : 365) * 86_400_000) || !integer(log.maxEntries, 100, log.storage === "runtime" ? 500_000 : 100_000) || !integer(log.segmentDurationMs, 60_000, (log.storage === "runtime" ? 3660 : 365) * 86_400_000) || !Array.isArray(log.tags)) fail("configurazione archivio non valida (servizio: massimo 500000 campioni e dieci anni; browser: 100000 campioni e un anno)");
    count += log.tags.length; if (count > 5000) fail("massimo 5000 variabili archiviate complessive");
    for (const tag of log.tags) {
      if (!record(tag) || !keys(tag, ["id", "name", "tag", "mode", "cycleMs", "includeUnchanged", "smoothingSamples", "aggregation", "aggregationWindowMs"], ["triggerTag", "triggerCondition", "triggerValue", "minimum", "maximum", "deadband"]) || tag.deadband !== undefined && !dataLogDeadbandValid(tag.deadband) || !text(tag.id, 80) || !text(tag.name) || !text(tag.tag) || !["cyclic", "on-change", "on-demand"].includes(String(tag.mode)) || !integer(tag.cycleMs, 500, 86_400_000) || typeof tag.includeUnchanged !== "boolean" || !integer(tag.smoothingSamples, 1, 64) || !["none", "average", "minimum", "maximum"].includes(String(tag.aggregation)) || !integer(tag.aggregationWindowMs, 500, 365 * 86_400_000)) fail("configurazione variabile archiviata non valida");
      if (tag.triggerTag !== undefined && !text(tag.triggerTag) || tag.triggerCondition !== undefined && !["changed", "rising", "falling", "equals"].includes(String(tag.triggerCondition)) || tag.triggerValue !== undefined && (typeof tag.triggerValue !== "string" || tag.triggerValue.length > 512 || /[\u0000-\u001f]/.test(tag.triggerValue)) || ["minimum", "maximum"].some(key => tag[key] !== undefined && !number(tag[key], -Number.MAX_VALUE, Number.MAX_VALUE))) fail("trigger o limiti non validi");
      if (tag.triggerCondition === "equals" && (tag.triggerValue === undefined || tag.triggerValue === "")) fail("un trigger di uguaglianza richiede un valore esplicito, anche quando si vuole confrontare con 0 o false");
    }
  }
  const catalog = parseHmiDataLogCatalog(raw), errors = hmiDataLogCatalogIssues(catalog, variables).filter(issue => issue.severity === "error");
  if (errors.length) fail(errors[0].message);
  if (variables) {
    const declared = new Map<string, PlcVariableDefinition[]>();
    for (const tag of variables) if (!tag.detected) { const entries = declared.get(tag.name); if (entries) entries.push(tag); else declared.set(tag.name, [tag]); }
    const readable = (name: string) => { const matches = declared.get(name) ?? []; return matches.length === 1 && ["read", "read-write"].includes(matches[0].access); };
    for (const log of catalog.logs) for (const tag of log.tags) if (!readable(tag.tag) || tag.triggerTag && !readable(tag.triggerTag)) fail("ogni variabile e trigger deve essere dichiarato una sola volta e leggibile nel catalogo tag importato");
  }
  return catalog;
}
export function guidedDataLogSources(catalog?: HmiDataLogCatalog) {
  return (catalog?.logs ?? []).filter(log => log.enabled).flatMap(log => log.tags.map(tag => ({ logId: log.id, loggedTagId: tag.id, logName: log.name, name: tag.name, tag: tag.tag })));
}
export function guidedLogBindingIssue(binding: GuidedLogBinding, tag: string, catalog?: HmiDataLogCatalog) {
  if (!record(binding) || !keys(binding, ["logId", "loggedTagId"]) || typeof binding.logId !== "string" || typeof binding.loggedTagId !== "string" || binding.logId.length > 80 || binding.loggedTagId.length > 80 || /[\u0000-\u001f]/.test(binding.logId + binding.loggedTagId)) return "Riferimento all’archivio non valido.";
  if (!binding.logId && !binding.loggedTagId && !tag) return;
  const logs = catalog?.logs.filter(log => log.id === binding.logId) ?? [], log = logs.length === 1 ? logs[0] : undefined;
  const matches = log?.tags.filter(item => item.id === binding.loggedTagId) ?? [];
  if (!log?.enabled || matches.length !== 1) return "Scegli una variabile di un archivio importato e abilitato, oppure lascia la sorgente da completare.";
  if (matches[0].tag !== tag) return "Il tag non corrisponde alla variabile archiviata scelta. Rivedi la sorgente: non viene sostituita automaticamente.";
}
export function guidedTrendSource(tag: string, logged?: GuidedLogBinding) {
  return logged ? { source: "log" as const, tag, logId: logged.logId, loggedTagId: logged.loggedTagId } : { source: "online" as const, tag };
}
