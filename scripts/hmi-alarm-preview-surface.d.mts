import type { AlarmCommand, AlarmSnapshot } from "../runtime/alarm-engine.mjs";
export function createHmiAlarmPreviewSurface(root: Document, options: { active(): boolean; action(command: AlarmCommand, instanceId: string): Promise<void>; navigate(route: string): void }): {
  update(snapshot: AlarmSnapshot | undefined, on: boolean, routes?: readonly string[]): void;
  refresh(): void;
  dispose(): void;
};
export function createHmiAlarmPreviewBridge(view: Window, options: { active(): boolean; navigate(route: string): void }): { readonly pageId: string; newPage(): void; receive(event: MessageEvent): void; refresh(): void; suspend(): void; dispose(): void };
export function createHmiAlarmPreviewSurfaceWith(root: Document, options: Parameters<typeof createHmiAlarmPreviewSurface>[1], runtime: { createHmiAlarmControl: typeof import("./hmi-alarm-control.mjs").createHmiAlarmControl; createHmiAlarmSummary: typeof import("./hmi-alarm-summary.mjs").createHmiAlarmSummary }): ReturnType<typeof createHmiAlarmPreviewSurface>;
export function createHmiAlarmPreviewBridgeWith(view: Window, options: Parameters<typeof createHmiAlarmPreviewBridge>[1], surface: typeof createHmiAlarmPreviewSurface): ReturnType<typeof createHmiAlarmPreviewBridge>;
