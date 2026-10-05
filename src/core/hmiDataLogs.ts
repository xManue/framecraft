import type { PlcVariableDefinition } from "./plcVariables";

export const hmiDataLogCatalogName = "framecraft.logs.json";
export const hmiLoggingModes = ["on-change", "on-demand", "cyclic"] as const;
export const hmiLogAggregations = ["none", "average", "minimum", "maximum"] as const;
export type HmiLoggingMode = (typeof hmiLoggingModes)[number];
export type HmiLogAggregation = (typeof hmiLogAggregations)[number];
export type HmiLogTriggerCondition = "changed" | "rising" | "falling" | "equals";

export interface HmiLoggingTagDefinition {
  id: string;
  name: string;
  tag: string;
  mode: HmiLoggingMode;
  cycleMs: number;
  triggerTag?: string;
  triggerCondition?: HmiLogTriggerCondition;
  triggerValue?: string;
  includeUnchanged: boolean;
  smoothingSamples: number;
  aggregation: HmiLogAggregation;
  aggregationWindowMs: number;
  minimum?: number;
  maximum?: number;
}

export interface HmiDataLogDefinition {
  id: string;
  name: string;
  enabled: boolean;
  storage: "browser-local" | "memory";
  retentionMs: number;
  maxEntries: number;
  segmentDurationMs: number;
  tags: HmiLoggingTagDefinition[];
}

export interface HmiDataLogCatalog {
  version: 1;
  projectKey: string;
  logs: HmiDataLogDefinition[];
}

export interface HmiDataLogIssue {
  severity: "error" | "warning";
  message: string;
  logId?: string;
  loggedTagId?: string;
}

export interface HmiDataLogSample {
  logId: string;
  loggedTagId: string;
  tag: string;
  time: number;
  value: string;
  qualityCode?: number;
  segmentStart: number;
}

export interface HmiDataLogTagStatus {
  qualityCode?: number;
  timeStamp?: string | number;
}

export interface HmiDataLogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface HmiDataLogRuntimeOptions {
  storageKey?: string;
  storage?: HmiDataLogStorage;
  now?: () => number;
  onError?: (message: string) => void;
}

export interface HmiDataLogRuntime {
  start(read: () => { values: Readonly<Record<string, string>>; status?: Readonly<Record<string, HmiDataLogTagStatus>> }): void;
  stop(): void;
  updateTag(tag: string, value: string | number | boolean, status?: HmiDataLogTagStatus): number;
  updateSnapshot(values: Readonly<Record<string, string>>, status?: Readonly<Record<string, HmiDataLogTagStatus>>): number;
  request(logId?: string, loggedTagId?: string): number;
  tick(at?: number): number;
  query(logId: string, loggedTagId: string, from?: number, to?: number): HmiDataLogSample[];
  subscribe(listener: () => void): () => void;
  flush(): void;
  clear(logId?: string): void;
  sampleCount(logId?: string): number;
}

const dataLogString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const dataLogNumber = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const dataLogOptionalNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const dataLogBool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;

function normalizeLoggingTag(value: unknown, index: number): HmiLoggingTagDefinition {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const mode = hmiLoggingModes.includes(item.mode as HmiLoggingMode) ? item.mode as HmiLoggingMode : "on-change";
  const aggregation = hmiLogAggregations.includes(item.aggregation as HmiLogAggregation) ? item.aggregation as HmiLogAggregation : "none";
  const condition = ["changed", "rising", "falling", "equals"].includes(String(item.triggerCondition)) ? item.triggerCondition as HmiLogTriggerCondition : "changed";
  return {
    id: dataLogString(item.id, `logged-tag-${index + 1}`).trim() || `logged-tag-${index + 1}`,
    name: dataLogString(item.name, `Variabile ${index + 1}`).trim() || `Variabile ${index + 1}`,
    tag: dataLogString(item.tag).trim(),
    mode,
    cycleMs: Math.max(500, Math.round(dataLogNumber(item.cycleMs, 1_000))),
    triggerTag: dataLogString(item.triggerTag).trim() || undefined,
    triggerCondition: condition,
    triggerValue: dataLogString(item.triggerValue) || undefined,
    includeUnchanged: dataLogBool(item.includeUnchanged, mode === "cyclic"),
    smoothingSamples: Math.max(1, Math.min(64, Math.round(dataLogNumber(item.smoothingSamples, 1)))),
    aggregation,
    aggregationWindowMs: Math.max(500, Math.round(dataLogNumber(item.aggregationWindowMs, 60_000))),
    minimum: dataLogOptionalNumber(item.minimum),
    maximum: dataLogOptionalNumber(item.maximum),
  };
}

function normalizeDataLog(value: unknown, index: number): HmiDataLogDefinition {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    id: dataLogString(item.id, `data-log-${index + 1}`).trim() || `data-log-${index + 1}`,
    name: dataLogString(item.name, `Data log ${index + 1}`).trim() || `Data log ${index + 1}`,
    enabled: dataLogBool(item.enabled, true),
    storage: item.storage === "memory" ? "memory" : "browser-local",
    retentionMs: Math.max(60_000, Math.round(dataLogNumber(item.retentionMs, 7 * 86_400_000))),
    maxEntries: Math.max(100, Math.round(dataLogNumber(item.maxEntries, 100_000))),
    segmentDurationMs: Math.max(60_000, Math.round(dataLogNumber(item.segmentDurationMs, 86_400_000))),
    tags: Array.isArray(item.tags) ? item.tags.map(normalizeLoggingTag) : [],
  };
}

export function emptyHmiDataLogCatalog(projectKey = "framecraft-panel"): HmiDataLogCatalog {
  return { version: 1, projectKey, logs: [] };
}

export function defaultHmiDataLog(index = 0): HmiDataLogDefinition {
  return normalizeDataLog({}, index);
}

export function defaultHmiLoggingTag(index = 0): HmiLoggingTagDefinition {
  return normalizeLoggingTag({}, index);
}

export function parseHmiDataLogCatalog(value: unknown): HmiDataLogCatalog {
  let raw = value;
  if (typeof value === "string") {
    if (!value.trim()) return emptyHmiDataLogCatalog();
    raw = JSON.parse(value);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Il catalogo Data Log deve essere un oggetto JSON.");
  const item = raw as Record<string, unknown>;
  return {
    version: 1,
    projectKey: dataLogString(item.projectKey, "framecraft-panel").trim() || "framecraft-panel",
    logs: Array.isArray(item.logs) ? item.logs.map(normalizeDataLog) : [],
  };
}

export function serializeHmiDataLogCatalog(catalog: HmiDataLogCatalog): string {
  return `${JSON.stringify(parseHmiDataLogCatalog(catalog), null, 2)}\n`;
}

export function hmiDataLogCatalogIssues(catalog: HmiDataLogCatalog, variables?: readonly PlcVariableDefinition[]): HmiDataLogIssue[] {
  const issues: HmiDataLogIssue[] = [];
  const logIds = new Set<string>();
  const logNames = new Set<string>();
  const declared = variables?.length ? new Set(variables.filter((variable) => !variable.detected).map((variable) => variable.name)) : undefined;
  for (const log of catalog.logs) {
    const logId = log.id.toLocaleLowerCase();
    const logName = log.name.toLocaleLowerCase();
    if (logIds.has(logId)) issues.push({ severity: "error", logId: log.id, message: `Data log: identificatore duplicato “${log.id}”.` });
    if (logNames.has(logName)) issues.push({ severity: "error", logId: log.id, message: `Data log: nome duplicato “${log.name}”.` });
    logIds.add(logId); logNames.add(logName);
    if (log.segmentDurationMs > log.retentionMs) issues.push({ severity: "warning", logId: log.id, message: `${log.name}: un segmento dura più del periodo di conservazione.` });
    const tagIds = new Set<string>();
    for (const tag of log.tags) {
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
  return log.maxEntries * 112;
}

function hmiDataLogStorageKey(catalog: HmiDataLogCatalog, explicit?: string): string {
  return explicit || `framecraft:data-logs:${catalog.projectKey}`;
}

function hmiDataLogTime(status: HmiDataLogTagStatus | undefined, fallback: number): number {
  if (typeof status?.timeStamp === "number" && Number.isFinite(status.timeStamp)) return status.timeStamp;
  if (typeof status?.timeStamp === "string") {
    const parsed = Date.parse(status.timeStamp);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function hmiLogTriggerMatches(condition: HmiLogTriggerCondition, previous: string | undefined, current: string, operand?: string): boolean {
  if (condition === "changed") return previous !== current;
  const before = !/^(?:|0|false|off|no)$/i.test(previous ?? "");
  const after = !/^(?:|0|false|off|no)$/i.test(current);
  if (condition === "rising") return !before && after;
  if (condition === "falling") return before && !after;
  return current === (operand ?? "1");
}

function hmiAggregateValue(kind: HmiLogAggregation, values: readonly number[]): number {
  if (kind === "minimum") return Math.min(...values);
  if (kind === "maximum") return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function createHmiDataLogRuntime(input: HmiDataLogCatalog | unknown, options: HmiDataLogRuntimeOptions = {}): HmiDataLogRuntime {
  const catalog = parseHmiDataLogCatalog(input);
  const now = options.now ?? (() => Date.now());
  const storage = options.storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  const storageKey = hmiDataLogStorageKey(catalog, options.storageKey);
  const samples = new Map<string, HmiDataLogSample[]>();
  const previousValues = new Map<string, string>();
  const smoothValues = new Map<string, number[]>();
  const aggregates = new Map<string, { start: number; values: number[]; status?: HmiDataLogTagStatus; rawTag: string }>();
  const listeners = new Set<() => void>();
  const intervals = new Set<ReturnType<typeof setInterval>>();
  let reader: (() => { values: Readonly<Record<string, string>>; status?: Readonly<Record<string, HmiDataLogTagStatus>> }) | undefined;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;

  const keyOf = (logId: string, tagId: string) => `${logId}\u0000${tagId}`;
  const report = (message: string) => (options.onError ?? console.warn)(message);
  const notify = () => { for (const listener of listeners) listener(); };
  const load = () => {
    if (!storage) return;
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { version?: number; samples?: HmiDataLogSample[] };
      for (const sample of Array.isArray(parsed.samples) ? parsed.samples : []) {
        if (!sample || typeof sample !== "object" || !Number.isFinite(sample.time) || typeof sample.value !== "string") continue;
        const log = catalog.logs.find((candidate) => candidate.id === sample.logId && candidate.tags.some((tag) => tag.id === sample.loggedTagId));
        if (!log || log.storage !== "browser-local") continue;
        const key = keyOf(sample.logId, sample.loggedTagId);
        const list = samples.get(key) ?? [];
        list.push(sample); samples.set(key, list);
      }
    } catch (error) { report(`Data Log: archivio locale non leggibile (${error instanceof Error ? error.message : String(error)}).`); }
  };
  const persist = () => {
    if (!storage || !catalog.logs.some((log) => log.storage === "browser-local")) return;
    try {
      const kept = [...samples.values()].flat().filter((sample) => catalog.logs.find((log) => log.id === sample.logId)?.storage === "browser-local");
      storage.setItem(storageKey, JSON.stringify({ version: 1, savedAt: now(), samples: kept }));
    } catch (error) { report(`Data Log: impossibile salvare l'archivio locale (${error instanceof Error ? error.message : String(error)}).`); }
  };
  const schedulePersist = () => {
    if (persistTimer !== undefined) return;
    persistTimer = setTimeout(() => { persistTimer = undefined; persist(); }, 50);
  };
  const trimLog = (log: HmiDataLogDefinition, at: number) => {
    const keys = log.tags.map((tag) => keyOf(log.id, tag.id));
    const cutoff = at - log.retentionMs;
    for (const key of keys) {
      const list = samples.get(key);
      if (!list) continue;
      while (list.length && list[0].time < cutoff) list.shift();
    }
    const combined = keys.flatMap((key) => (samples.get(key) ?? []).map((sample) => ({ key, sample }))).sort((a, b) => a.sample.time - b.sample.time);
    for (const item of combined.slice(0, Math.max(0, combined.length - log.maxEntries))) samples.get(item.key)?.shift();
  };
  const append = (log: HmiDataLogDefinition, tag: HmiLoggingTagDefinition, value: string, status: HmiDataLogTagStatus | undefined, at: number) => {
    const key = keyOf(log.id, tag.id);
    const list = samples.get(key) ?? [];
    if (!tag.includeUnchanged && list.at(-1)?.value === value) return 0;
    list.push({ logId: log.id, loggedTagId: tag.id, tag: tag.tag, time: at, value, qualityCode: status?.qualityCode, segmentStart: Math.floor(at / log.segmentDurationMs) * log.segmentDurationMs });
    samples.set(key, list); trimLog(log, at); schedulePersist(); notify(); return 1;
  };
  const process = (log: HmiDataLogDefinition, tag: HmiLoggingTagDefinition, raw: string, status: HmiDataLogTagStatus | undefined, at: number) => {
    const numeric = Number(raw);
    if ((tag.minimum !== undefined || tag.maximum !== undefined || tag.smoothingSamples > 1 || tag.aggregation !== "none") && !Number.isFinite(numeric)) return 0;
    if (tag.minimum !== undefined && numeric < tag.minimum) return 0;
    if (tag.maximum !== undefined && numeric > tag.maximum) return 0;
    let value = raw;
    const key = keyOf(log.id, tag.id);
    if (Number.isFinite(numeric) && tag.smoothingSamples > 1) {
      const history = smoothValues.get(key) ?? [];
      history.push(numeric);
      while (history.length > tag.smoothingSamples) history.shift();
      smoothValues.set(key, history);
      value = String(history.reduce((sum, item) => sum + item, 0) / history.length);
    }
    if (tag.aggregation === "none") return append(log, tag, value, status, at);
    const bucketStart = Math.floor(at / tag.aggregationWindowMs) * tag.aggregationWindowMs;
    const pending = aggregates.get(key);
    let written = 0;
    if (pending && pending.start !== bucketStart && pending.values.length) written += append(log, tag, String(hmiAggregateValue(tag.aggregation, pending.values)), pending.status, pending.start + tag.aggregationWindowMs);
    const bucket = !pending || pending.start !== bucketStart ? { start: bucketStart, values: [] as number[], status, rawTag: tag.tag } : pending;
    bucket.values.push(Number(value)); bucket.status = status; aggregates.set(key, bucket);
    return written;
  };
  const sampleDefinition = (log: HmiDataLogDefinition, tag: HmiLoggingTagDefinition, at = now()) => {
    const snapshot = reader?.();
    const raw = snapshot?.values[tag.tag];
    if (raw === undefined) return 0;
    return process(log, tag, raw, snapshot?.status?.[tag.tag], hmiDataLogTime(snapshot?.status?.[tag.tag], at));
  };
  const flushAggregates = (at = now(), includePartial = false) => {
    let written = 0;
    for (const log of catalog.logs.filter((item) => item.enabled)) for (const tag of log.tags.filter((item) => item.aggregation !== "none")) {
      const key = keyOf(log.id, tag.id);
      const pending = aggregates.get(key);
      if (!pending || (!includePartial && at < pending.start + tag.aggregationWindowMs) || !pending.values.length) continue;
      written += append(log, tag, String(hmiAggregateValue(tag.aggregation, pending.values)), pending.status, includePartial ? at : pending.start + tag.aggregationWindowMs);
      aggregates.delete(key);
    }
    return written;
  };
  const tick = (at = now()) => flushAggregates(at);
  const updateTag = (tagName: string, value: string | number | boolean, status?: HmiDataLogTagStatus) => {
    const current = String(value); const previous = previousValues.get(tagName); previousValues.set(tagName, current);
    let written = 0;
    for (const log of catalog.logs.filter((item) => item.enabled)) for (const tag of log.tags) {
      if (tag.mode === "on-change" && tag.tag === tagName && previous !== current) written += process(log, tag, current, status, hmiDataLogTime(status, now()));
      if (tag.mode === "on-demand" && tag.triggerTag === tagName && hmiLogTriggerMatches(tag.triggerCondition ?? "changed", previous, current, tag.triggerValue)) written += sampleDefinition(log, tag);
    }
    return written;
  };
  load();
  return {
    start(read) {
      reader = read;
      for (const log of catalog.logs.filter((item) => item.enabled)) for (const tag of log.tags.filter((item) => item.mode === "cyclic")) {
        intervals.add(setInterval(() => { sampleDefinition(log, tag); tick(); }, Math.max(500, tag.cycleMs)));
      }
      intervals.add(setInterval(() => tick(), 500));
    },
    stop() {
      for (const timer of intervals) clearInterval(timer);
      intervals.clear(); flushAggregates(now(), true);
      if (persistTimer !== undefined) { clearTimeout(persistTimer); persistTimer = undefined; }
      persist(); reader = undefined;
    },
    updateTag,
    updateSnapshot(values, status = {}) {
      let written = 0;
      for (const [tag, value] of Object.entries(values)) if (previousValues.get(tag) !== value) written += updateTag(tag, value, status[tag]);
      return written;
    },
    request(logId, loggedTagId) {
      let written = 0;
      for (const log of catalog.logs.filter((item) => item.enabled && (!logId || item.id === logId))) for (const tag of log.tags.filter((item) => item.mode === "on-demand" && (!loggedTagId || item.id === loggedTagId))) written += sampleDefinition(log, tag);
      return written;
    },
    tick,
    query(logId, loggedTagId, from = Number.NEGATIVE_INFINITY, to = Number.POSITIVE_INFINITY) {
      return (samples.get(keyOf(logId, loggedTagId)) ?? []).filter((sample) => sample.time >= from && sample.time <= to).map((sample) => ({ ...sample }));
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    flush() { flushAggregates(now(), true); if (persistTimer !== undefined) { clearTimeout(persistTimer); persistTimer = undefined; } persist(); },
    clear(logId) {
      if (logId) for (const log of catalog.logs.filter((item) => item.id === logId)) for (const tag of log.tags) samples.delete(keyOf(log.id, tag.id));
      else samples.clear();
      schedulePersist(); notify();
    },
    sampleCount(logId) { return [...samples.values()].flat().filter((sample) => !logId || sample.logId === logId).length; },
  };
}

export function hmiDataLogRuntimeModuleSource(): string {
  return `// @ts-nocheck\nconst hmiLoggingModes = ${JSON.stringify(hmiLoggingModes)};\nconst hmiLogAggregations = ${JSON.stringify(hmiLogAggregations)};\nconst dataLogString = ${String(dataLogString)};\nconst dataLogNumber = ${String(dataLogNumber)};\nconst dataLogOptionalNumber = ${String(dataLogOptionalNumber)};\nconst dataLogBool = ${String(dataLogBool)};\n${String(normalizeLoggingTag)}\n${String(normalizeDataLog)}\nexport ${String(emptyHmiDataLogCatalog)}\nexport ${String(defaultHmiDataLog)}\nexport ${String(defaultHmiLoggingTag)}\nexport ${String(parseHmiDataLogCatalog)}\n${String(hmiDataLogStorageKey)}\n${String(hmiDataLogTime)}\n${String(hmiLogTriggerMatches)}\n${String(hmiAggregateValue)}\nexport ${String(createHmiDataLogRuntime)}\n`;
}
