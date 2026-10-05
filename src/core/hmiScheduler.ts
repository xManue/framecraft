import { executeHmiScriptAsync, type HmiScriptExecution, type HmiScriptTagStatus } from "./hmiScript";
import { hmiAlarmMatches, nextHmiCalendarDue, type HmiAlarmNotification } from "./hmiSchedule";
import { createHmiScriptContextManager, type HmiScheduledTask, type HmiScriptCatalog } from "./hmiScriptModules";

export interface HmiSchedulerState {
  now: number;
  nextDue: Record<string, number>;
  completedOnce: string[];
  lastTagValues: Record<string, string>;
  scriptContexts?: ReturnType<typeof createHmiScriptContextManager>;
}

export interface HmiScheduledExecution {
  taskId: string;
  taskName: string;
  scheduledAt: number;
  cause: "interval" | "once" | "tag" | "calendar" | "alarm" | "manual";
  result: HmiScriptExecution;
}

export interface HmiSchedulerResult {
  state: HmiSchedulerState;
  values: Record<string, string>;
  tagStatus: Record<string, HmiScriptTagStatus>;
  executions: HmiScheduledExecution[];
  error?: string;
}

export interface HmiSchedulerOptions {
  tagStatus?: Readonly<Record<string, HmiScriptTagStatus>>;
  maxExecutions?: number;
}

const truthy = (value: string | undefined) => value !== undefined && !/^(?:|0|false|no|off)$/i.test(value.trim());

function initialDue(task: HmiScheduledTask, now: number): number | undefined {
  if (!task.enabled) return undefined;
  if (task.trigger.kind === "interval") return now + (task.trigger.startDelayMs ?? task.trigger.intervalMs);
  if (task.trigger.kind === "once") {
    const due = Date.parse(task.trigger.at);
    return Number.isFinite(due) ? due : undefined;
  }
  if (task.trigger.kind === "calendar") return nextHmiCalendarDue(task.trigger, now);
  return undefined;
}

export function createHmiSchedulerState(catalog: HmiScriptCatalog, now = Date.now(), values: Readonly<Record<string, string>> = {}): HmiSchedulerState {
  const scriptContexts = createHmiScriptContextManager();
  scriptContexts.initialize(catalog, undefined, "scheduler", values);
  return {
    scriptContexts,
    now,
    nextDue: Object.fromEntries(catalog.scheduledTasks.flatMap((task) => {
      const due = initialDue(task, now);
      return due === undefined ? [] : [[task.id, due]];
    })),
    completedOnce: [],
    lastTagValues: { ...values },
  };
}

function tagMatches(task: HmiScheduledTask, previous: string | undefined, next: string): boolean {
  if (!task.enabled || task.trigger.kind !== "tag" || previous === next) return false;
  if (task.trigger.condition === "changed") return true;
  if (task.trigger.condition === "rising") return !truthy(previous) && truthy(next);
  if (task.trigger.condition === "falling") return truthy(previous) && !truthy(next);
  return next === (task.trigger.value ?? "");
}

function copyState(state: HmiSchedulerState): HmiSchedulerState {
  return { ...state, nextDue: { ...state.nextDue }, completedOnce: [...state.completedOnce], lastTagValues: { ...state.lastTagValues } };
}

async function executeQueue(
  catalog: HmiScriptCatalog,
  state: HmiSchedulerState,
  values: Record<string, string>,
  tagStatus: Record<string, HmiScriptTagStatus>,
  queued: { task: HmiScheduledTask; at: number; cause: HmiScheduledExecution["cause"]; alarm?: HmiAlarmNotification }[],
  maxExecutions: number,
): Promise<{ executions: HmiScheduledExecution[]; error?: string }> {
  const executions: HmiScheduledExecution[] = [];
  const scriptContexts = state.scriptContexts ??= createHmiScriptContextManager();
  const context = scriptContexts.options(catalog, undefined, "scheduler");
  while (queued.length) {
    if (executions.length >= maxExecutions) return { executions, error: `Scheduler interrotto dopo ${maxExecutions} esecuzioni.` };
    const current = queued.shift()!;
    if (!current.task.program) {
      const result: HmiScriptExecution = { writes: {}, traces: [], navigation: [], operatorMessages: [], faceplateEvents: [], tagStatus: {}, steps: 0, error: "Script operazione non compilato." };
      executions.push({ taskId: current.task.id, taskName: current.task.name, scheduledAt: current.at, cause: current.cause, result });
      continue;
    }
    const result = await executeHmiScriptAsync(current.task.program, values, {
      tagStatus,
      ...context,
      locals: {
        taskId: current.task.id,
        scheduledAt: current.at,
        trigger: current.cause,
        ...(current.alarm ? {
          alarmClass: current.alarm.alarmClass,
          alarmState: current.alarm.state,
          alarmPriority: current.alarm.priority,
          alarmName: current.alarm.name ?? "",
          alarmText: current.alarm.text ?? "",
        } : {}),
      },
    });
    executions.push({ taskId: current.task.id, taskName: current.task.name, scheduledAt: current.at, cause: current.cause, result });
    Object.assign(tagStatus, result.tagStatus);
    for (const [tag, value] of Object.entries(result.writes)) {
      const previous = state.lastTagValues[tag] ?? values[tag];
      values[tag] = value;
      state.lastTagValues[tag] = value;
      for (const task of catalog.scheduledTasks) if (task.trigger.kind === "tag" && task.trigger.tag === tag && tagMatches(task, previous, value)) {
        queued.push({ task, at: current.at, cause: "tag" });
      }
    }
  }
  return { executions };
}

export async function advanceHmiScheduler(
  catalog: HmiScriptCatalog,
  inputState: HmiSchedulerState,
  targetTime: number,
  inputValues: Readonly<Record<string, string>>,
  options: HmiSchedulerOptions = {},
): Promise<HmiSchedulerResult> {
  const state = copyState(inputState);
  const values = { ...inputValues };
  const tagStatus = { ...options.tagStatus };
  if (!Number.isFinite(targetTime) || targetTime < state.now) return { state, values, tagStatus, executions: [], error: "Il tempo virtuale non puo' tornare indietro." };
  const executions: HmiScheduledExecution[] = [];
  const maxExecutions = options.maxExecutions ?? 1000;
  while (true) {
    const due = catalog.scheduledTasks
      .map((task, order) => ({ task, order, at: state.nextDue[task.id] }))
      .filter((item) => item.task.enabled && item.task.trigger.kind !== "tag" && item.task.trigger.kind !== "alarm" && Number.isFinite(item.at) && item.at <= targetTime && !state.completedOnce.includes(item.task.id))
      .sort((left, right) => left.at - right.at || left.order - right.order)[0];
    if (!due) break;
    if (executions.length >= maxExecutions) return { state, values, tagStatus, executions, error: `Scheduler interrotto dopo ${maxExecutions} esecuzioni.` };
    state.now = due.at;
    if (due.task.trigger.kind === "interval") state.nextDue[due.task.id] = due.at + due.task.trigger.intervalMs;
    else if (due.task.trigger.kind === "calendar") {
      const next = nextHmiCalendarDue(due.task.trigger, due.at, false);
      if (next !== undefined) state.nextDue[due.task.id] = next;
      else delete state.nextDue[due.task.id];
    } else state.completedOnce.push(due.task.id);
    const batch = await executeQueue(catalog, state, values, tagStatus, [{ task: due.task, at: due.at, cause: due.task.trigger.kind }], maxExecutions - executions.length);
    executions.push(...batch.executions);
    if (batch.error) return { state, values, tagStatus, executions, error: batch.error };
  }
  state.now = targetTime;
  return { state, values, tagStatus, executions };
}

export async function notifyHmiSchedulerTag(
  catalog: HmiScriptCatalog,
  inputState: HmiSchedulerState,
  tag: string,
  value: string | number | boolean,
  inputValues: Readonly<Record<string, string>>,
  options: HmiSchedulerOptions = {},
): Promise<HmiSchedulerResult> {
  const state = copyState(inputState);
  const values = { ...inputValues, [tag]: String(value) };
  const tagStatus = { ...options.tagStatus };
  const previous = state.lastTagValues[tag] ?? inputValues[tag];
  const next = String(value);
  state.lastTagValues[tag] = next;
  const queue = catalog.scheduledTasks
    .filter((task) => task.trigger.kind === "tag" && task.trigger.tag === tag && tagMatches(task, previous, next))
    .map((task) => ({ task, at: state.now, cause: "tag" as const }));
  const batch = await executeQueue(catalog, state, values, tagStatus, queue, options.maxExecutions ?? 1000);
  return { state, values, tagStatus, executions: batch.executions, ...(batch.error ? { error: batch.error } : {}) };
}

export async function notifyHmiSchedulerAlarm(
  catalog: HmiScriptCatalog,
  inputState: HmiSchedulerState,
  alarm: HmiAlarmNotification,
  inputValues: Readonly<Record<string, string>>,
  options: HmiSchedulerOptions = {},
): Promise<HmiSchedulerResult> {
  const state = copyState(inputState);
  const values = { ...inputValues };
  const tagStatus = { ...options.tagStatus };
  const queue = catalog.scheduledTasks
    .filter((task) => task.enabled && task.trigger.kind === "alarm" && hmiAlarmMatches(task.trigger, alarm))
    .map((task) => ({ task, at: state.now, cause: "alarm" as const, alarm }));
  const batch = await executeQueue(catalog, state, values, tagStatus, queue, options.maxExecutions ?? 1000);
  return { state, values, tagStatus, executions: batch.executions, ...(batch.error ? { error: batch.error } : {}) };
}

export async function runHmiScheduledTask(
  catalog: HmiScriptCatalog,
  inputState: HmiSchedulerState,
  taskId: string,
  inputValues: Readonly<Record<string, string>>,
  options: HmiSchedulerOptions = {},
): Promise<HmiSchedulerResult> {
  const state = copyState(inputState);
  const values = { ...inputValues };
  const tagStatus = { ...options.tagStatus };
  const task = catalog.scheduledTasks.find((item) => item.id === taskId);
  if (!task) return { state, values, tagStatus, executions: [], error: `Operazione pianificata ${taskId} non trovata.` };
  const batch = await executeQueue(catalog, state, values, tagStatus, [{ task, at: state.now, cause: "manual" }], options.maxExecutions ?? 1000);
  return { state, values, tagStatus, executions: batch.executions, ...(batch.error ? { error: batch.error } : {}) };
}
