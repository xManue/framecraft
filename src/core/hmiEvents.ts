import { executeHmiScript, executeHmiScriptAsync, inspectHmiScript, type HmiScriptExecution, type HmiScriptPopupManager, type HmiScriptProgram, type HmiScriptRuntimeFunction, type HmiScriptRuntimeVariable, type HmiScriptScalar, type HmiScriptScope, type HmiScriptScreenItemManager, type HmiScriptTagStatus, type HmiScriptTimerManager } from "./hmiScript";

export const hmiEventsAttribute = "data-hmi-events";

export const hmiEventTypes = [
  "Activated", "ContextTapped", "Deactivated", "Down", "KeyDown", "KeyUp", "Loaded",
  "Tapped", "Up", "Change", "GestureDetected", "Unloaded", "HotKey", "InterfaceEvent",
  "Initialized", "CommandFired",
] as const;
export type HmiEventType = typeof hmiEventTypes[number];
export const hmiGestures = ["Unknown", "SwipeRight", "SwipeLeft", "SwipeUp", "SwipeDown"] as const;
export type HmiGesture = typeof hmiGestures[number];

export interface HmiEventBinding {
  event: HmiEventType;
  script: string;
  /** Programma controllato prodotto dall'editor: il Runtime lo esegue senza eval e senza parser JS. */
  program?: HmiScriptProgram;
}

export interface HmiEventContext {
  gesture?: HmiGesture;
  key?: string;
  command?: string;
  interfaceEvent?: string;
  /** Parametri dichiarati dall'evento del faceplate, disponibili nello script con il loro nome. */
  parameters?: Readonly<Record<string, HmiScriptScalar>>;
  tagStatus?: Readonly<Record<string, HmiScriptTagStatus>>;
  functions?: Readonly<Record<string, HmiScriptRuntimeFunction>>;
  variables?: Readonly<Record<string, HmiScriptRuntimeVariable>>;
  globalScope?: HmiScriptScope;
  timerManager?: HmiScriptTimerManager;
  popupManager?: HmiScriptPopupManager;
  screenItems?: HmiScriptScreenItemManager;
}

function eventLocals(context: HmiEventContext) {
  const locals: Record<string, HmiScriptScalar> = { ...(context.parameters ?? {}) };
  if (context.gesture) locals.gesture = context.gesture;
  if (context.key) locals.key = context.key;
  if (context.command) locals.command = context.command;
  if (context.interfaceEvent) locals.interfaceEvent = context.interfaceEvent;
  return Object.keys(locals).length ? locals : undefined;
}

const knownEvents = new Set<string>(hmiEventTypes);

export const hmiEventLabels: Record<HmiEventType, string> = {
  Activated: "Focus ricevuto",
  ContextTapped: "Click destro / tocco lungo",
  Deactivated: "Focus perso",
  Down: "Pressione",
  KeyDown: "Tasto premuto",
  KeyUp: "Tasto rilasciato",
  Loaded: "Caricamento",
  Tapped: "Click / tocco",
  Up: "Rilascio",
  Change: "Valore cambiato",
  GestureDetected: "Gesture",
  Unloaded: "Chiusura pagina",
  HotKey: "Tasto rapido",
  InterfaceEvent: "Evento interfaccia",
  Initialized: "Controllo inizializzato",
  CommandFired: "Comando controllo",
};

/** Catalogo conservativo per tipo: gli eventi comuni derivano dagli ScreenItem WinCC; pulsanti,
 * pagine e controlli aggiungono soltanto quelli documentati per quella famiglia. */
export function hmiEventTypesFor(target: { type: string; props: Readonly<Record<string, unknown>> }): HmiEventType[] {
  const element = target.type.toLowerCase();
  const hmiType = String(target.props["data-hmi-type"] ?? "");
  if (hmiType === "HmiScreen" || target.props["data-hmi-screen"] !== undefined) {
    return ["ContextTapped", "HotKey", "Loaded", "Tapped", "Unloaded", "GestureDetected"];
  }
  if (/CustomWebControl|Faceplate/i.test(hmiType)) return ["Activated", "Deactivated", "InterfaceEvent"];
  if (/Control|Trend|Alarm/i.test(hmiType)) return ["Activated", "Deactivated", "Initialized", "CommandFired", "InterfaceEvent"];
  const common: HmiEventType[] = ["Activated", "ContextTapped", "Deactivated", "KeyDown", "KeyUp", "Tapped", "GestureDetected"];
  if (element === "button" || hmiType === "HmiButton") return [...common.slice(0, 3), "Down", "KeyDown", "KeyUp", "Tapped", "Up", "GestureDetected"];
  if (["input", "select", "textarea"].includes(element) || /IOField|Slider|Switch|ComboBox|ListBox|RadioButton/i.test(hmiType)) return [...common, "Change"];
  return common;
}

function normalized(value: unknown): HmiEventBinding | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (!knownEvents.has(String(item.event)) || typeof item.script !== "string") return undefined;
  const script = item.script.trim();
  const compiled = inspectHmiScript(script);
  const serialized = item.program as HmiScriptProgram | undefined;
  const program = serialized?.version === 1 && Array.isArray(serialized.statements) ? serialized : compiled.program;
  return { event: item.event as HmiEventType, script, ...(program ? { program } : {}) };
}

export function parseHmiEvents(value: unknown): HmiEventBinding[] {
  let raw = value;
  if (typeof value === "string") {
    try { raw = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map(normalized).filter((item): item is HmiEventBinding => Boolean(item));
}

export function serializeHmiEvents(items: readonly HmiEventBinding[]): string {
  return JSON.stringify(items.map((item) => {
    const inspection = inspectHmiScript(item.script);
    return normalized({ ...item, program: inspection.program });
  }).filter((item): item is HmiEventBinding => Boolean(item)));
}

export function newHmiEvent(event: HmiEventType = "Tapped"): HmiEventBinding {
  return {
    event,
    script: 'HMIRuntime.Trace("Evento eseguito");',
  };
}

export function executeHmiEvent(binding: HmiEventBinding, values: Readonly<Record<string, string>>, context: HmiEventContext = {}): HmiScriptExecution {
  const inspection = inspectHmiScript(binding.script, context.functions, context.globalScope?.initializer, [], context.variables);
  const program = inspection.program ?? binding.program;
  if (inspection.error || !program) {
    return { writes: {}, traces: [], navigation: [], operatorMessages: [], faceplateEvents: [], tagStatus: {}, steps: 0, error: inspection.error ?? "Script evento non compilato." };
  }
  return executeHmiScript(program, values, { locals: eventLocals(context), tagStatus: context.tagStatus, functions: context.functions, variables: context.variables, globalScope: context.globalScope, timerManager: context.timerManager, popupManager: context.popupManager, screenItems: context.screenItems });
}

export async function executeHmiEventAsync(binding: HmiEventBinding, values: Readonly<Record<string, string>>, context: HmiEventContext = {}): Promise<HmiScriptExecution> {
  const inspection = inspectHmiScript(binding.script, context.functions, context.globalScope?.initializer, [], context.variables);
  const program = inspection.program ?? binding.program;
  if (inspection.error || !program) {
    return { writes: {}, traces: [], navigation: [], operatorMessages: [], faceplateEvents: [], tagStatus: {}, steps: 0, error: inspection.error ?? "Script evento non compilato." };
  }
  return executeHmiScriptAsync(program, values, { locals: eventLocals(context), tagStatus: context.tagStatus, functions: context.functions, variables: context.variables, globalScope: context.globalScope, timerManager: context.timerManager, popupManager: context.popupManager, screenItems: context.screenItems });
}
