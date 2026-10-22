import { alarmDependencyTags, createAlarmEngine, type AlarmCommand, type AlarmSnapshot } from "../../runtime/alarm-engine.mjs";
import type { AlarmPreviewConfiguration } from "./hmiAlarms";
import type { HmiScriptTagStatus } from "./hmiScript";
import type { StoreApi } from "zustand";
import type { EditorState } from "../state/editorStore";

export interface AlarmPreviewState {
  on: boolean; interactive: boolean; values: Readonly<Record<string, string>>;
  status: Readonly<Record<string, HmiScriptTagStatus>>; routes: readonly string[];
}

type AlarmPreviewOwner = Pick<StoreApi<EditorState>, "getState" | "subscribe">;
type AlarmPreviewSession = { root: string; configuration: AlarmPreviewConfiguration; model: ReturnType<typeof createHmiAlarmPreview> };
const sessions = new WeakMap<AlarmPreviewOwner, AlarmPreviewSession>();
const activeStops = new Set<() => void>();
if (import.meta.hot) import.meta.hot.dispose(() => { for (const stop of [...activeStops]) stop(); });

export function hmiAlarmPreviewSession(owner: AlarmPreviewOwner) {
  const state = owner.getState(), root = state.project?.root, configuration = state.alarmPreviewConfiguration;
  const existing = sessions.get(owner);
  if (existing?.root === root && existing?.configuration === configuration) return existing?.model;
  if (!root || !configuration) return undefined;
  const model = createHmiAlarmPreview(configuration, {
    state: () => { const next = owner.getState(); return { on: next.simulation.on, interactive: next.interactionMode === "navigate", values: next.simulation.values, status: next.simulation.status, routes: next.pages.map(page => page.route) }; },
    current: () => { const next = owner.getState(); return next.project?.root === root && next.alarmPreviewConfiguration === configuration; },
    error: (message) => owner.getState().addPreviewOutput("stderr", message),
  });
  const entry = { root, configuration, model };
  let unsubscribe = () => {};
  const stop = () => {
    unsubscribe(); model.dispose(); activeStops.delete(stop);
    if (sessions.get(owner) === entry) sessions.delete(owner);
  };
  sessions.set(owner, entry); activeStops.add(stop);
  unsubscribe = owner.subscribe((next, previous) => {
    if (next.project?.root !== root || next.alarmPreviewConfiguration !== configuration) { stop(); return; }
    if (next.simulation.on !== previous.simulation.on || next.simulation.values !== previous.simulation.values || next.simulation.status !== previous.simulation.status) model.update();
  });
  model.update();
  return model;
}
export function createHmiAlarmPreview(configuration: AlarmPreviewConfiguration | undefined, options: { state(): AlarmPreviewState; current(): boolean; error(message: string): void }) {
  let disposed = false, wasOn = false, engine: ReturnType<typeof createAlarmEngine> | undefined;
  const tags = configuration ? alarmDependencyTags(configuration.catalog) : [];
  const resetEngine = () => {
    engine = undefined;
    if (!configuration) return;
    try { engine = createAlarmEngine(configuration.catalog, configuration.variables); }
    catch { options.error("Prova allarmi non disponibile: controlla catalogo e segnali in Pannello → Allarmi. Nessun valore viene inventato."); }
  };
  resetEngine();
  const active = () => !disposed && options.current() && options.state().on && options.state().interactive;
  const samples = () => {
    const state = options.state(); if (!state.on || !options.current()) return;
    engine?.updateSamples(tags.map(tag => {
      const explicit = Object.prototype.hasOwnProperty.call(state.values, tag), status = state.status[tag];
      const qualityCode = !explicit || status?.qualityKnown === false ? undefined : status?.qualityCode ?? (status?.qualityKnown === true ? undefined : 192);
      return { tag, value: explicit ? state.values[tag] : undefined, qualityCode, lastError: status?.lastError };
    }));
  };
  const snapshot = (): AlarmSnapshot | undefined => !disposed && options.current() && engine ? { ...engine.snapshot(), actionsEnabled: active() } : undefined;
  return {
    update() {
      if (disposed) return undefined;
      const on = options.current() && options.state().on;
      if (!on && wasOn) resetEngine(); wasOn = on;
      if (on) samples();
      return snapshot();
    },
    action(command: AlarmCommand, instanceId: string) {
      if (!active() || !engine) throw new Error("La prova allarmi non è attiva. Riattiva i valori di prova e Usa il pannello.");
      if (engine.snapshot().instanceId !== instanceId) throw new Error("La prova allarmi è cambiata. Aggiorna la vista prima di agire.");
      samples(); engine.action(command, "Prova locale");
      return snapshot();
    },
    dispose() { disposed = true; engine = undefined; },
  };
}
