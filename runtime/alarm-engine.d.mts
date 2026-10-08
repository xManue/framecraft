export interface AlarmVariable { name: string; dataType: string; access: string; detected?: boolean }
export interface AlarmClass { name: string; acknowledgment: "none" | "single" | "reset" }
export type AlarmTrigger = { kind: "bit"; bit: number; activeWhen: "set" | "clear" } | { kind: "high" | "low"; limit: number; hysteresis: number };
export interface AlarmDefinition { id: string; name: string; text: string; tag: string; className: string; priority: number; area?: string; enabled: boolean; trigger: AlarmTrigger }
export interface AlarmCatalog { version: 1; classes: AlarmClass[]; alarms: AlarmDefinition[]; maxHistory: number }
export interface AlarmRow extends AlarmDefinition { acknowledgment: AlarmClass["acknowledgment"]; active: boolean | null; acknowledged: boolean; confirmed: boolean; pending: boolean; quality: "unknown" | "bad" | "good"; diagnostic?: string; occurrence?: string; revision: number; activatedAt?: number; clearedAt?: number }
export interface AlarmEvent { sequence: number; id: string; occurrence: string; name: string; text: string; alarmClass: string; priority: number; area: string; state: "Incoming" | "Outgoing" | "Acknowledged" | "Confirmed"; time: number; actor?: string }
export interface AlarmSnapshot { version: 1; instanceId: string; revision: number; sequence: number; rows: AlarmRow[]; history: AlarmEvent[]; historyDropped: number; actionsEnabled?: boolean }
export interface AlarmCommand { alarmId: string; occurrence: string; revision: number; action: "acknowledge" | "confirm" }
export function emptyAlarmCatalog(): AlarmCatalog;
export function alarmCatalogIssues(catalog: unknown, variables?: readonly AlarmVariable[]): { path: string; message: string }[];
export function parseAlarmCatalog(value: unknown, variables?: readonly AlarmVariable[]): AlarmCatalog;
export function alarmStateLabel(row: AlarmRow): string;
export function parseAlarmSnapshot(value: unknown): AlarmSnapshot;
export function createAlarmEngine(catalog: AlarmCatalog, variables: readonly AlarmVariable[], options?: { now?: () => number; occurrenceId?: () => string; onEvent?: (event: AlarmEvent) => void }): {
  snapshot(): AlarmSnapshot;
  subscribe(listener: (snapshot: AlarmSnapshot) => void): () => void;
  updateSample(sample: { tag: string; value?: string | number | boolean; qualityCode?: number; lastError?: string | number }): void;
  action(command: AlarmCommand, actor: string): AlarmSnapshot;
};
