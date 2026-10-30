import type { DataLogDeadband } from "./data-log-deadband.mjs";
export declare const hmiLoggingModes: readonly ["on-change", "on-demand", "cyclic"];
export declare const hmiLogAggregations: readonly ["none", "average", "minimum", "maximum"];
export type HmiDataLogDeadband = DataLogDeadband;

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
  deadband?: HmiDataLogDeadband;
}

export interface HmiDataLogDefinition {
  id: string;
  name: string;
  enabled: boolean;
  storage: "browser-local" | "memory" | "runtime";
  retentionMs: number;
  maxEntries: number;
  segmentDurationMs: number;
  tags: HmiLoggingTagDefinition[];
  deadband?: HmiDataLogDeadband;
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
  servicePreview?: boolean;
}

export interface HmiDataLogRuntime {
  start(read: () => { values: Readonly<Record<string, string>>; status?: Readonly<Record<string, HmiDataLogTagStatus>> }): void;
  stop(): void;
  updateTag(tag: string, value: string | number | boolean, status?: HmiDataLogTagStatus): number;
  updateSnapshot(values: Readonly<Record<string, string>>, status?: Readonly<Record<string, HmiDataLogTagStatus>>): number;
  request(logId?: string, loggedTagId?: string): number;
  tick(at?: number): number;
  query(logId: string, loggedTagId: string, from?: number, to?: number, includePrevious?: boolean): HmiDataLogSample[];
  subscribe(listener: () => void): () => void;
  flush(): void;
  clear(logId?: string): void;
  sampleCount(logId?: string): number;
}
export function emptyHmiDataLogCatalog(projectKey?: string): HmiDataLogCatalog;
export function defaultHmiDataLog(index?: number): HmiDataLogDefinition;
export function defaultHmiLoggingTag(index?: number): HmiLoggingTagDefinition;
export function parseHmiDataLogCatalog(value: unknown): HmiDataLogCatalog;
export function createHmiDataLogRuntime(input: unknown, options?: HmiDataLogRuntimeOptions): HmiDataLogRuntime;
