import type { DataLogDeadband } from "./data-log-deadband.mjs";
export class DataLogError extends Error { readonly code: string; readonly status: number; readonly remedy: string; readonly outcome: "rejected" | "uncertain"; constructor(code: string) }
export interface ServiceLoggingTag { id: string; name: string; tag: string; mode: "on-change" | "on-demand" | "cyclic"; cycleMs: number; includeUnchanged: boolean; smoothingSamples: number; aggregation: "none" | "average" | "minimum" | "maximum"; aggregationWindowMs: number; triggerTag?: string; triggerCondition?: "changed" | "rising" | "falling" | "equals"; triggerValue?: string; minimum?: number; maximum?: number; deadband?: DataLogDeadband }
export interface ServiceDataLog { id: string; name: string; enabled: boolean; storage: "runtime"; retentionMs: number; maxEntries: number; segmentDurationMs: number; tags: ServiceLoggingTag[]; deadband?: DataLogDeadband }
export interface ServiceDataLogs { version: 1; projectKey: string; logs: ServiceDataLog[] }
export interface DataLogQuery { logId: string; loggedTagId: string; definition: string; from: number; to: number; archiveId?: string; through?: number; after?: number; floor?: number; limit?: number; includePrevious?: boolean }
export interface DataLogPoint { logId: string; loggedTagId: string; definition: string; tag: string; time: number; value: string | null; qualityCode: number; sourceTimestamp: number | null; partial: boolean }
export interface DataLogSample extends Omit<DataLogPoint, "definition"> { seq: number }
export interface DataLogSnapshot { version: 1; id: string; namespace: string; through: number; floor: number; definition: string; samples: DataLogSample[]; previous: DataLogSample | null; nextAfter: number | null }
export interface DataLogCapture { state: "recording" | "stopped" | "error"; written: number; code?: string }
export interface DataLogInput { tag: string; value?: string; qualityCode?: number; timestamp?: number; sourceTimestamp?: number; receivedAt?: number; lastError?: string }
export function dataLogDefinitionKey(log: { id: string; deadband?: DataLogDeadband }, tag: ServiceLoggingTag): string;
export function parseServiceDataLogs(input: unknown, variables?: readonly { name: string; access: string; dataType: string }[]): ServiceDataLogs;
export function parseDataLogQuery(input: unknown): DataLogQuery & { limit: number };
export function parseDataLogCapture(input: unknown): DataLogCapture & { instanceId: string };
export function dataLogSampleValid(input: unknown): input is DataLogSample;
export function parseDataLogSnapshot(input: unknown, query: DataLogQuery): DataLogSnapshot;
export function createServiceDataLogEngine(options: { catalog: unknown; write: (rows: DataLogPoint[], receipt?: {id: string; actor: string; fingerprint: string}) => unknown; read?: (tag: string) => DataLogInput | undefined; now?: () => number; monotonic?: () => number; onError?: (error: DataLogError) => void }): { start(): void; stop(): void; update(sample: DataLogInput): void; request(logId: string, loggedTagId?: string, receipt?: {id: string; actor: string; fingerprint: string}): number; tick(): void; status(): DataLogCapture };
