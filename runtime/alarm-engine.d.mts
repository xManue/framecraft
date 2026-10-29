export interface AlarmVariable { name: string; dataType: string; access: string; detected?: boolean }
export interface AlarmClass { name: string; acknowledgment: "none" | "single" | "reset" }
export type AlarmAnalogKind = "high" | "low" | "high-equal" | "low-equal" | "equal" | "not-equal";
export type AlarmTrigger = { kind: "bit"; bit: number; activeWhen: "set" | "clear" } | { kind: AlarmAnalogKind; limit: number | { tag: string }; hysteresis: number };
export interface AlarmDefinition { id: string; name: string; text: string; tag: string; className: string; priority: number; area?: string; enabled: boolean; trigger: AlarmTrigger }
export interface AlarmShelvingConfig { enabled: boolean; maxMinutes: number }
export interface AlarmShelving { mode: "timed" | "one-shot"; startedAt: number; until: number; actor: string; reason: string }
export type AlarmShelvingEvent = { mode: "timed" | "one-shot"; until: number; reason: string } | { cause: "operator" | "elapsed" | "returned"; reason: string };
export interface AlarmCatalog { version: 1; classes: AlarmClass[]; alarms: AlarmDefinition[]; maxHistory: number; archive?: { enabled: boolean; maxRecords: number }; shelving?: AlarmShelvingConfig }
export interface AlarmRow extends AlarmDefinition { acknowledgment: AlarmClass["acknowledgment"]; active: boolean | null; acknowledged: boolean; confirmed: boolean; pending: boolean; quality: "unknown" | "bad" | "good"; diagnostic?: string; occurrence?: string; revision: number; activatedAt?: number; clearedAt?: number; shelving?: AlarmShelving }
export interface AlarmEvent { sequence: number; id: string; occurrence: string; name: string; text: string; alarmClass: string; priority: number; area: string; state: "Incoming" | "Outgoing" | "Acknowledged" | "Confirmed" | "Shelved" | "Unshelved"; time: number; actor?: string; shelving?: AlarmShelvingEvent }
export interface AlarmSnapshot { version: 1; instanceId: string; revision: number; sequence: number; rows: AlarmRow[]; history: AlarmEvent[]; historyDropped: number; actionsEnabled?: boolean; shelving?: AlarmShelvingConfig }
export type AlarmCommand = { alarmId: string; occurrence: string; revision: number } & ({ action: "acknowledge" | "confirm" } | { action: "shelve"; mode: "timed" | "one-shot"; minutes: number; reason: string } | { action: "unshelve"; reason: string });
export function alarmShelvingConfigValid(value: unknown): boolean;
export function alarmShelvingEventValid(value: AlarmEvent): boolean;
export function parseAlarmCommand(value: unknown): AlarmCommand;
export interface AlarmSample { tag: string; value?: string | number | boolean; qualityCode?: number; lastError?: string | number }
export function alarmDependencyTags(catalog: AlarmCatalog): string[];
export function emptyAlarmCatalog(): AlarmCatalog;
export function alarmCatalogIssues(catalog: unknown, variables?: readonly AlarmVariable[]): { path: string; message: string }[];
export function parseAlarmCatalog(value: unknown, variables?: readonly AlarmVariable[]): AlarmCatalog;
export function alarmStateLabel(row: AlarmRow): string;
export function parseAlarmSnapshot(value: unknown): AlarmSnapshot;
export function createAlarmEngine(catalog: AlarmCatalog, variables: readonly AlarmVariable[], options?: { now?: () => number; monotonicNow?: () => number; occurrenceId?: () => string; onEvent?: (event: AlarmEvent) => void; onEvents?: (events: AlarmEvent[]) => void }): {
  snapshot(): AlarmSnapshot;
  subscribe(listener: (snapshot: AlarmSnapshot) => void): () => void;
  updateSample(sample: AlarmSample): void;
  updateSamples(samples: readonly AlarmSample[]): void;
  tick(): boolean;
  action(command: AlarmCommand, actor: string): AlarmSnapshot;
};
