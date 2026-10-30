import type { DataLogPoint, DataLogQuery, DataLogSnapshot } from "./data-log.mjs";
export interface DataLogReceipt { id: string; actor: string; fingerprint: string }
export interface DataLogStore { append(rows: DataLogPoint[], receipt?: DataLogReceipt): number; lookup(id: string, actor: string, fingerprint: string): { id: string; count: number } | undefined; maintain(): void; query(input: DataLogQuery): DataLogSnapshot; close(): void }
export function openDataLogStore(options: { root: string; namespace: string; catalog: unknown; readOnly?: boolean; now?: () => number }): DataLogStore;
