import type { HmiScriptTimerCallback, HmiScriptTimerContext, HmiScriptTimerManager } from "./hmiScript";

export interface HmiTimerSnapshot {
  id: number;
  mode: "timeout" | "interval";
  delayMs: number;
  createdAt: number;
}

export interface HmiTimerController extends HmiScriptTimerManager {
  dispose(): void;
  snapshot(): HmiTimerSnapshot[];
}

export interface HmiTimerClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const systemClock: HmiTimerClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, delayMs) => globalThis.setInterval(callback, delayMs),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

export function createHmiTimerManager(
  onFire: (callback: HmiScriptTimerCallback, timer: HmiTimerSnapshot, context?: HmiScriptTimerContext) => void | Promise<void>,
  onError: (error: unknown, timer: HmiTimerSnapshot) => void = () => undefined,
  clock: HmiTimerClock = systemClock,
): HmiTimerController {
  let nextId = 1;
  const timers = new Map<number, HmiTimerSnapshot & { callback: HmiScriptTimerCallback; context?: HmiScriptTimerContext; handle: unknown }>();
  const fire = (id: number) => {
    const timer = timers.get(id);
    if (!timer) return;
    if (timer.context?.globalScope?.active === false || timer.context?.closureScope?.active === false) { manager.clear(timer.mode, id); return; }
    if (timer.mode === "timeout") timers.delete(id);
    void Promise.resolve(onFire(timer.callback, timer, timer.context)).catch((error) => onError(error, timer));
  };
  const manager: HmiTimerController = {
    set(mode, callback, delayMs, context) {
      const id = nextId++;
      const timer: HmiTimerSnapshot & { callback: HmiScriptTimerCallback; handle: unknown } = {
        id, mode, delayMs, createdAt: clock.now(), callback, ...(context ? { context } : {}), handle: undefined,
      };
      timer.handle = mode === "timeout"
        ? clock.setTimeout(() => fire(id), delayMs)
        : clock.setInterval(() => fire(id), delayMs);
      timers.set(id, timer);
      return id;
    },
    clear(mode, id) {
      const timer = timers.get(id);
      if (!timer || timer.mode !== mode) return false;
      if (mode === "timeout") clock.clearTimeout(timer.handle);
      else clock.clearInterval(timer.handle);
      timers.delete(id);
      return true;
    },
    dispose() {
      for (const timer of timers.values()) {
        if (timer.mode === "timeout") clock.clearTimeout(timer.handle);
        else clock.clearInterval(timer.handle);
      }
      timers.clear();
    },
    snapshot() {
      return [...timers.values()].map(({ id, mode, delayMs, createdAt }) => ({ id, mode, delayMs, createdAt }));
    },
  };
  return manager;
}

/** Copiato nei pannelli esportati insieme all'esecutore IR, senza dipendenze dall'editor. */
export function hmiTimersRuntimeSource(): string {
  return `// @ts-nocheck\nconst systemClock = {\n  now: () => Date.now(),\n  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),\n  clearTimeout: (handle) => globalThis.clearTimeout(handle),\n  setInterval: (callback, delayMs) => globalThis.setInterval(callback, delayMs),\n  clearInterval: (handle) => globalThis.clearInterval(handle),\n};\nexport ${String(createHmiTimerManager)}\n`;
}
