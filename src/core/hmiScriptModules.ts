import { createHmiScriptScope, executeHmiScript, inspectHmiScript, inspectHmiScriptDefinition, inspectHmiScriptProgram, type HmiScriptExecutionOptions, type HmiScriptProgram, type HmiScriptRuntimeFunction, type HmiScriptRuntimeVariable, type HmiScriptScope } from "./hmiScript";
import { hmiCalendarTriggerIssue, type HmiAlarmTrigger, type HmiCalendarTrigger } from "./hmiSchedule";

export type HmiLocalScriptContext = "events" | "dynamizations";
export type HmiRuntimeScriptContext = HmiLocalScriptContext | "scheduler";

export interface HmiScriptGlobalDefinition {
  source: string;
  program?: HmiScriptProgram;
  error?: string;
}

export interface HmiScriptFunctionDefinition {
  name: string;
  parameters: string[];
  source: string;
  program?: HmiScriptProgram;
  tagsRead?: string[];
  tagsWritten?: string[];
  hasAsync?: boolean;
  error?: string;
}

export interface HmiGlobalScriptModule {
  name: string;
  alias: string;
  functions: HmiScriptFunctionDefinition[];
  globalDefinition?: HmiScriptGlobalDefinition;
}

export interface HmiLocalScriptDefinition {
  scope: string;
  context: HmiLocalScriptContext;
  functions: HmiScriptFunctionDefinition[];
  globalDefinition?: HmiScriptGlobalDefinition;
}

export type HmiScheduledTaskTrigger =
  | { kind: "interval"; intervalMs: number; startDelayMs?: number }
  | { kind: "once"; at: string }
  | { kind: "tag"; tag: string; condition: "changed" | "rising" | "falling" | "equals"; value?: string }
  | HmiCalendarTrigger
  | HmiAlarmTrigger;

export interface HmiScheduledTask {
  id: string;
  name: string;
  enabled: boolean;
  trigger: HmiScheduledTaskTrigger;
  script: string;
  program?: HmiScriptProgram;
  tagsRead?: string[];
  tagsWritten?: string[];
  hasAsync?: boolean;
  error?: string;
}

export interface HmiScriptCatalog {
  version: 1;
  globalModules: HmiGlobalScriptModule[];
  localDefinitions: HmiLocalScriptDefinition[];
  scheduledTasks: HmiScheduledTask[];
  schedulerDefinition?: HmiScriptGlobalDefinition;
}

const identifier = /^[A-Za-z_$][\w$]*$/;

export function emptyHmiScriptCatalog(): HmiScriptCatalog {
  return { version: 1, globalModules: [], localDefinitions: [], scheduledTasks: [] };
}

function parametersOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFunction(value: unknown, definition?: HmiScriptGlobalDefinition): HmiScriptFunctionDefinition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const name = String(raw.name ?? "").trim();
  const source = typeof raw.source === "string" ? raw.source : "";
  const parameters = parametersOf(raw.parameters);
  const inspection = inspectHmiScript(source, undefined, definition?.program, parameters);
  return {
    name,
    parameters,
    source,
    ...(inspection.program ? { program: inspection.program } : {}),
    ...(inspection.tagsRead.length ? { tagsRead: inspection.tagsRead } : {}),
    ...(inspection.tagsWritten.length ? { tagsWritten: inspection.tagsWritten } : {}),
    ...(inspection.hasAsync ? { hasAsync: true } : {}),
    ...(inspection.error ? { error: inspection.error } : {}),
  };
}

function functionsOf(value: unknown, definition?: HmiScriptGlobalDefinition): HmiScriptFunctionDefinition[] {
  return Array.isArray(value) ? value.map((item) => normalizeFunction(item, definition)).filter((item): item is HmiScriptFunctionDefinition => Boolean(item)) : [];
}

function globalDefinitionOf(value: unknown, allowExports = false): HmiScriptGlobalDefinition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = (value as Record<string, unknown>).source;
  if (typeof source !== "string" || !source.trim()) return undefined;
  const inspection = inspectHmiScriptDefinition(source, allowExports);
  let error = inspection.error;
  if (inspection.program) {
    const reserved = new Set(["Tags", "Tag", "HMIRuntime", "Modules", "Local", "UI", "Screen", "Faceplate", "item", "Math", "Number", "String", "Boolean", "undefined"]);
    const unsafe = (value: unknown): boolean => {
      if (!value || typeof value !== "object") return false;
      const item = value as Record<string, unknown>;
      if (item.kind === "local" && ["Screen", "Faceplate", "item"].includes(String(item.name))) return true;
      if (["module-call", "timer-set", "popup-open", "popup-property", "screen-item", "property-flashing"].includes(String(item.kind))) return true;
      if (item.kind === "array-method" && ["push", "pop", "shift", "unshift", "sort", "reverse", "splice"].includes(String(item.method))) return true;
      return Object.values(item).some(unsafe);
    };
    if (inspection.program.statements.some((statement) => statement.kind !== "declare" || unsafe(statement))) {
      error = "La definizione globale ammette dichiarazioni let/const/var con valori, calcoli o letture tag. Azioni, timer e chiamate di moduli appartengono alle funzioni.";
    } else {
      const invalid = inspection.program.statements.find((statement) => statement.kind === "declare" && reserved.has(statement.name));
      if (invalid?.kind === "declare") error = `Il nome ${invalid.name} e' riservato al Runtime HMI.`;
    }
  }
  return { source, ...(error ? { error } : { program: inspection.program }) };
}

function normalizeTask(value: unknown, index: number, definition?: HmiScriptGlobalDefinition): HmiScheduledTask | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const rawTrigger = item.trigger && typeof item.trigger === "object" ? item.trigger as Record<string, unknown> : {};
  const kind = ["once", "tag", "calendar", "alarm"].includes(String(rawTrigger.kind)) ? rawTrigger.kind as "once" | "tag" | "calendar" | "alarm" : "interval";
  const trigger: HmiScheduledTaskTrigger = kind === "once"
    ? { kind, at: String(rawTrigger.at ?? "") }
    : kind === "tag"
      ? {
          kind,
          tag: String(rawTrigger.tag ?? "").trim(),
          condition: ["rising", "falling", "equals"].includes(String(rawTrigger.condition)) ? rawTrigger.condition as "rising" | "falling" | "equals" : "changed",
          ...(rawTrigger.value !== undefined ? { value: String(rawTrigger.value) } : {}),
        }
      : kind === "calendar"
        ? {
            kind,
            frequency: ["weekly", "monthly", "yearly"].includes(String(rawTrigger.frequency)) ? rawTrigger.frequency as "weekly" | "monthly" | "yearly" : "daily",
            time: String(rawTrigger.time ?? "00:00:00"),
            ...(rawTrigger.weekDay !== undefined ? { weekDay: Number(rawTrigger.weekDay) } : {}),
            ...(rawTrigger.day !== undefined ? { day: Number(rawTrigger.day) } : {}),
            ...(rawTrigger.month !== undefined ? { month: Number(rawTrigger.month) } : {}),
          }
        : kind === "alarm"
          ? {
              kind,
              criterion: ["state", "priority"].includes(String(rawTrigger.criterion)) ? rawTrigger.criterion as "state" | "priority" : "class",
              condition: ["not-equals", "greater", "greater-or-equal", "less", "less-or-equal"].includes(String(rawTrigger.condition))
                ? rawTrigger.condition as "not-equals" | "greater" | "greater-or-equal" | "less" | "less-or-equal"
                : "equals",
              operand: String(rawTrigger.operand ?? ""),
            }
      : {
          kind,
          intervalMs: Number(rawTrigger.intervalMs ?? 1000),
          ...(rawTrigger.startDelayMs !== undefined ? { startDelayMs: Number(rawTrigger.startDelayMs) } : {}),
        };
  const script = typeof item.script === "string" ? item.script : "";
  const inspection = inspectHmiScript(script, undefined, definition?.program);
  return {
    id: String(item.id ?? `task-${index + 1}`).trim(),
    name: String(item.name ?? "").trim(),
    enabled: item.enabled !== false,
    trigger,
    script,
    ...(inspection.program ? { program: inspection.program } : {}),
    ...(inspection.tagsRead.length ? { tagsRead: inspection.tagsRead } : {}),
    ...(inspection.tagsWritten.length ? { tagsWritten: inspection.tagsWritten } : {}),
    ...(inspection.hasAsync ? { hasAsync: true } : {}),
    ...(inspection.error ? { error: inspection.error } : {}),
  };
}

export function parseHmiScriptCatalog(value: unknown): HmiScriptCatalog {
  let raw = value;
  if (typeof value === "string") {
    try { raw = JSON.parse(value); } catch { return emptyHmiScriptCatalog(); }
  }
  if (!raw || typeof raw !== "object") return emptyHmiScriptCatalog();
  const catalog = raw as Record<string, unknown>;
  const globalModules = Array.isArray(catalog.globalModules) ? catalog.globalModules.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const name = String(item.name ?? "").trim();
    const alias = String(item.alias ?? name).trim();
    const globalDefinition = globalDefinitionOf(item.globalDefinition, true);
    return [{ name, alias, functions: functionsOf(item.functions, globalDefinition), ...(globalDefinition ? { globalDefinition } : {}) }];
  }) : [];
  const localDefinitions = Array.isArray(catalog.localDefinitions) ? catalog.localDefinitions.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const scope = String(item.scope ?? "").trim();
    const context: HmiLocalScriptContext = item.context === "dynamizations" ? "dynamizations" : "events";
    const globalDefinition = globalDefinitionOf(item.globalDefinition);
    return [{ scope, context, functions: functionsOf(item.functions, globalDefinition), ...(globalDefinition ? { globalDefinition } : {}) }];
  }) : [];
  const schedulerDefinition = globalDefinitionOf(catalog.schedulerDefinition);
  const scheduledTasks = Array.isArray(catalog.scheduledTasks)
    ? catalog.scheduledTasks.map((item, index) => normalizeTask(item, index, schedulerDefinition)).filter((item): item is HmiScheduledTask => Boolean(item))
    : [];
  return { version: 1, globalModules, localDefinitions, scheduledTasks, ...(schedulerDefinition ? { schedulerDefinition } : {}) };
}

export function serializeHmiScriptCatalog(value: HmiScriptCatalog): string {
  const catalog = parseHmiScriptCatalog(value);
  const cleanFunction = (item: HmiScriptFunctionDefinition) => ({
    name: item.name,
    parameters: item.parameters,
    source: item.source,
    ...(item.program ? { program: item.program } : {}),
    ...(item.tagsRead?.length ? { tagsRead: item.tagsRead } : {}),
    ...(item.tagsWritten?.length ? { tagsWritten: item.tagsWritten } : {}),
    ...(item.hasAsync ? { hasAsync: true } : {}),
  });
  return `${JSON.stringify({
    version: 1,
    ...(catalog.schedulerDefinition ? { schedulerDefinition: catalog.schedulerDefinition } : {}),
    globalModules: catalog.globalModules.map((module) => ({ ...module, functions: module.functions.map(cleanFunction) })),
    localDefinitions: catalog.localDefinitions.map((definition) => ({ ...definition, functions: definition.functions.map(cleanFunction) })),
    scheduledTasks: catalog.scheduledTasks.map((task) => ({
      id: task.id,
      name: task.name,
      enabled: task.enabled,
      trigger: task.trigger,
      script: task.script,
      ...(task.program ? { program: task.program } : {}),
      ...(task.tagsRead?.length ? { tagsRead: task.tagsRead } : {}),
      ...(task.tagsWritten?.length ? { tagsWritten: task.tagsWritten } : {}),
      ...(task.hasAsync ? { hasAsync: true } : {}),
    })),
  }, null, 2)}\n`;
}

export function hmiScriptCatalogIssues(catalog: HmiScriptCatalog): string[] {
  const issues: string[] = [];
  const variables = hmiScriptVariables(catalog);
  const aliases = new Set<string>();
  for (const module of catalog.globalModules) {
    if (module.globalDefinition?.error) issues.push(`Modules.${module.alias}, definizione globale: ${module.globalDefinition.error}`);
    if (!module.name.trim()) issues.push("Il nome del modulo globale e' obbligatorio.");
    if (!identifier.test(module.alias)) issues.push(`Alias globale non valido: ${module.alias}. Usa un identificatore JavaScript.`);
    if (aliases.has(module.alias)) issues.push(`Alias globale duplicato: ${module.alias}.`);
    aliases.add(module.alias);
    if (module.globalDefinition?.program) {
      const linked = inspectHmiScriptProgram(module.globalDefinition.program, undefined, undefined, [], variables);
      if (linked.error) issues.push(`Modules.${module.alias}, definizione globale: ${linked.error}`);
    }
    const names = new Set(module.globalDefinition?.program?.exports?.map((entry) => entry.name));
    for (const fn of module.functions) {
      if (!identifier.test(fn.name)) issues.push(`Nome funzione non valido in ${module.alias}: ${fn.name}.`);
      const invalidParameters = fn.parameters.filter((parameter, index, all) => !identifier.test(parameter) || all.indexOf(parameter) !== index);
      if (invalidParameters.length) issues.push(`Parametri non validi in Modules.${module.alias}.${fn.name}: ${invalidParameters.join(", ")}.`);
      if (names.has(fn.name)) issues.push(`Funzione duplicata: Modules.${module.alias}.${fn.name}.`);
      names.add(fn.name);
      if (fn.error || !fn.program) issues.push(`Modules.${module.alias}.${fn.name}: ${fn.error ?? "programma non compilato"}`);
      else {
        const linked = inspectHmiScript(fn.source, hmiScriptFunctions(catalog), module.globalDefinition?.program, fn.parameters, variables);
        if (linked.error) issues.push(`Modules.${module.alias}.${fn.name}: ${linked.error}`);
      }
    }
  }
  const localKeys = new Set<string>();
  for (const definition of catalog.localDefinitions) {
    if (definition.globalDefinition?.error) issues.push(`${definition.scope}/${definition.context}, definizione globale: ${definition.globalDefinition.error}`);
    if (definition.globalDefinition?.program) {
      const linked = inspectHmiScriptProgram(definition.globalDefinition.program, undefined, undefined, [], variables);
      if (linked.error) issues.push(`${definition.scope}/${definition.context}, definizione globale: ${linked.error}`);
    }
    if (!definition.scope.trim()) issues.push("La pagina / route della definizione locale e' obbligatoria.");
    const key = `${definition.scope}|${definition.context}`;
    if (localKeys.has(key)) issues.push(`Definizione locale duplicata: ${definition.scope} (${definition.context}).`);
    localKeys.add(key);
    const names = new Set<string>();
    for (const fn of definition.functions) {
      if (!identifier.test(fn.name)) issues.push(`Nome funzione locale non valido in ${definition.scope}: ${fn.name}.`);
      const invalidParameters = fn.parameters.filter((parameter, index, all) => !identifier.test(parameter) || all.indexOf(parameter) !== index);
      if (invalidParameters.length) issues.push(`Parametri non validi in ${definition.scope}/${definition.context}/Local.${fn.name}: ${invalidParameters.join(", ")}.`);
      if (names.has(fn.name)) issues.push(`Funzione locale duplicata: ${definition.scope}/${definition.context}/${fn.name}.`);
      names.add(fn.name);
      if (fn.error || !fn.program) issues.push(`Local.${fn.name} (${definition.scope}/${definition.context}): ${fn.error ?? "programma non compilato"}`);
      else {
        const linked = inspectHmiScript(fn.source, hmiScriptFunctions(catalog, definition.scope, definition.context), definition.globalDefinition?.program, fn.parameters, variables);
        if (linked.error) issues.push(`Local.${fn.name} (${definition.scope}/${definition.context}): ${linked.error}`);
      }
    }
  }
  const taskIds = new Set<string>();
  const taskNames = new Set<string>();
  if (catalog.schedulerDefinition?.error) issues.push(`Scheduler, definizione globale: ${catalog.schedulerDefinition.error}`);
  if (catalog.schedulerDefinition?.program) {
    const linked = inspectHmiScriptProgram(catalog.schedulerDefinition.program, undefined, undefined, [], variables);
    if (linked.error) issues.push(`Scheduler, definizione globale: ${linked.error}`);
  }
  const globalFunctions = hmiScriptFunctions(catalog);
  for (const task of catalog.scheduledTasks) {
    if (!task.id) issues.push("L'ID dell'operazione pianificata e' obbligatorio.");
    else if (taskIds.has(task.id)) issues.push(`ID operazione pianificata duplicato: ${task.id}.`);
    taskIds.add(task.id);
    if (!task.name) issues.push(`Il nome dell'operazione pianificata ${task.id || "senza ID"} e' obbligatorio.`);
    else if (taskNames.has(task.name)) issues.push(`Nome operazione pianificata duplicato: ${task.name}.`);
    taskNames.add(task.name);
    if (task.trigger.kind === "interval") {
      if (!Number.isInteger(task.trigger.intervalMs) || task.trigger.intervalMs < 1 || task.trigger.intervalMs > 0xffffffff) issues.push(`${task.name || task.id}: l'intervallo deve essere un UInt32 maggiore di zero.`);
      if (task.trigger.startDelayMs !== undefined && (!Number.isInteger(task.trigger.startDelayMs) || task.trigger.startDelayMs < 0 || task.trigger.startDelayMs > 0xffffffff)) issues.push(`${task.name || task.id}: il ritardo iniziale deve essere un UInt32.`);
    } else if (task.trigger.kind === "once") {
      if (!task.trigger.at || !Number.isFinite(Date.parse(task.trigger.at))) issues.push(`${task.name || task.id}: data e ora di esecuzione non valide.`);
    } else if (task.trigger.kind === "tag") {
      if (!task.trigger.tag) issues.push(`${task.name || task.id}: il trigger richiede un tag.`);
      if (["@UserName", "@LocalMachineName"].includes(task.trigger.tag)) issues.push(`${task.name || task.id}: il tag di sistema ${task.trigger.tag} non puo' essere usato come trigger.`);
      if (task.trigger.condition === "equals" && task.trigger.value === undefined) issues.push(`${task.name || task.id}: il confronto richiede un valore.`);
    } else if (task.trigger.kind === "calendar") {
      const problem = hmiCalendarTriggerIssue(task.trigger);
      if (problem) issues.push(`${task.name || task.id}: ${problem}`);
    } else {
      if (!task.trigger.operand.trim()) issues.push(`${task.name || task.id}: il trigger allarme richiede un operando.`);
      if (task.trigger.criterion === "priority") {
        const priority = Number(task.trigger.operand);
        if (!Number.isInteger(priority) || priority < 0 || priority > 16) issues.push(`${task.name || task.id}: la priorita' allarme deve essere un intero tra 0 e 16.`);
      }
    }
    const linked = inspectHmiScript(task.script, globalFunctions, catalog.schedulerDefinition?.program, [], variables);
    if (linked.error) issues.push(`${task.name || task.id}: ${linked.error}`);
  }
  return issues;
}

export function hmiScriptFunctions(catalog: HmiScriptCatalog, scope?: string | number, context: HmiLocalScriptContext = "events", getScope?: (name: string, definition?: HmiScriptGlobalDefinition) => HmiScriptScope): Record<string, HmiScriptRuntimeFunction> {
  const result: Record<string, HmiScriptRuntimeFunction> = {};
  const add = (key: string, fn: HmiScriptFunctionDefinition, globalScope?: HmiScriptScope, globalDefinition?: HmiScriptProgram) => {
    if (!fn.program || !identifier.test(fn.name) || fn.parameters.some((parameter, index, all) => !identifier.test(parameter) || all.indexOf(parameter) !== index)) return;
    result[key] = { parameters: fn.parameters, program: fn.program, tagsRead: fn.tagsRead, tagsWritten: fn.tagsWritten, hasAsync: fn.hasAsync, ...(globalDefinition ? { globalDefinition } : {}), ...(globalScope ? { globalScope } : {}) };
  };
  for (const module of catalog.globalModules) if (identifier.test(module.alias)) {
    const globalScope = getScope?.(`Modules.${module.alias}`, module.globalDefinition);
    for (const fn of module.functions) add(`Modules.${module.alias}.${fn.name}`, fn, globalScope, module.globalDefinition?.program);
  }
  if (scope !== undefined) {
    const wanted = String(scope);
    for (const definition of catalog.localDefinitions.filter((item) => item.scope === wanted && item.context === context)) {
      const globalScope = getScope?.("Local", definition.globalDefinition);
      for (const fn of definition.functions) add(`Local.${fn.name}`, fn, globalScope, definition.globalDefinition?.program);
    }
  }
  return result;
}

export function hmiScriptVariables(catalog: HmiScriptCatalog, getScope?: (name: string, definition?: HmiScriptGlobalDefinition) => HmiScriptScope): Record<string, HmiScriptRuntimeVariable> {
  const result: Record<string, HmiScriptRuntimeVariable> = {};
  for (const module of catalog.globalModules) if (identifier.test(module.alias)) {
    const globalScope = getScope?.(`Modules.${module.alias}`, module.globalDefinition);
    const definition = module.globalDefinition?.program;
    if (!definition) continue;
    for (const entry of definition.exports ?? []) if (identifier.test(entry.name) && identifier.test(entry.local)) {
      result[`Modules.${module.alias}.${entry.name}`] = { name: entry.local, definition, ...(globalScope ? { globalScope } : {}) };
    }
  }
  return result;
}

export function hmiScriptGlobalDefinition(catalog: HmiScriptCatalog, scope?: string | number, context: HmiRuntimeScriptContext = "events"): HmiScriptGlobalDefinition | undefined {
  if (context === "scheduler") return catalog.schedulerDefinition;
  return catalog.localDefinitions.find((item) => item.scope === String(scope) && item.context === context)?.globalDefinition;
}

function scriptContextManagerRuntime(createScope: typeof createHmiScriptScope, execute: typeof executeHmiScript, functionsFor: typeof hmiScriptFunctions, definitionFor: typeof hmiScriptGlobalDefinition, variablesFor: typeof hmiScriptVariables) {
  let currentCatalog: HmiScriptCatalog | undefined;
  const contexts = new Map<string, { scope?: string; context: HmiRuntimeScriptContext; namespaces: Map<string, HmiScriptScope>; options: Pick<HmiScriptExecutionOptions, "functions" | "variables" | "globalScope"> }>();
  const deactivate = (namespaces: Map<string, HmiScriptScope>) => { for (const scope of namespaces.values()) scope.active = false; };
  const manager = {
    options(catalog: HmiScriptCatalog, scope?: string | number, context: HmiRuntimeScriptContext = "events"): Pick<HmiScriptExecutionOptions, "functions" | "variables" | "globalScope"> {
      if (catalog !== currentCatalog) { manager.dispose(); currentCatalog = catalog; }
      const wanted = scope === undefined ? undefined : String(scope);
      const key = JSON.stringify([context, context === "scheduler" ? null : wanted]);
      const existing = contexts.get(key);
      if (existing) return existing.options;
      const namespaces = new Map<string, HmiScriptScope>();
      const getScope = (name: string, definition?: HmiScriptGlobalDefinition) => {
        let value = namespaces.get(name);
        if (!value) {
          value = createScope(definition?.program);
          if (definition && (definition.error || !definition.program)) { value.status = "failed"; value.error = definition.error ?? "Definizione globale non compilata: salvala da Framecraft."; }
          namespaces.set(name, value);
        }
        return value;
      };
      const local = definitionFor(catalog, wanted, context);
      const globalScope = getScope("Local", local);
      const functions = functionsFor(catalog, context === "scheduler" ? undefined : wanted, context === "dynamizations" ? context : "events", getScope);
      const variables = variablesFor(catalog, getScope);
      const options = { functions, variables, globalScope };
      contexts.set(key, { scope: wanted, context, namespaces, options });
      return options;
    },
    initialize(catalog: HmiScriptCatalog, scope: string | number | undefined, context: HmiRuntimeScriptContext, values: Readonly<Record<string, string>>, executionOptions: HmiScriptExecutionOptions = {}): string[] {
      const options = manager.options(catalog, scope, context);
      const scopes = contexts.get(JSON.stringify([context, context === "scheduler" ? null : scope === undefined ? undefined : String(scope)]))!.namespaces.values();
      const errors: string[] = [];
      for (const globalScope of scopes) if (globalScope) {
        const result = execute({ version: 1, statements: [] }, values, { ...executionOptions, ...options, globalScope });
        if (result.error) errors.push(result.error);
      }
      return [...new Set(errors)];
    },
    detachScreen(scope: string | number): () => void {
      const retired: Map<string, HmiScriptScope>[] = [];
      for (const [key, value] of contexts) if (value.context !== "scheduler" && value.scope === String(scope)) { retired.push(value.namespaces); contexts.delete(key); }
      return () => { for (const namespaces of retired) deactivate(namespaces); };
    },
    releaseScreen(scope: string | number) {
      manager.detachScreen(scope)();
    },
    dispose() {
      for (const value of contexts.values()) deactivate(value.namespaces);
      contexts.clear();
    },
  };
  return manager;
}

export function createHmiScriptContextManager() {
  return scriptContextManagerRuntime(createHmiScriptScope, executeHmiScript, hmiScriptFunctions, hmiScriptGlobalDefinition, hmiScriptVariables);
}

/** Helper minuscolo copiato nel progetto esportato: il catalogo contiene già la IR compilata. */
export function hmiScriptModulesRuntimeSource(): string {
  return `// @ts-nocheck\nimport { createHmiScriptScope, executeHmiScript } from "./framecraftScriptRuntime";\nconst identifier = ${String(identifier)};\nexport ${String(hmiScriptFunctions)}\nexport ${String(hmiScriptVariables)}\nexport ${String(hmiScriptGlobalDefinition)}\n${String(scriptContextManagerRuntime)}\nexport function createHmiScriptContextManager() { return scriptContextManagerRuntime(createHmiScriptScope, executeHmiScript, hmiScriptFunctions, hmiScriptGlobalDefinition, hmiScriptVariables); }\n`;
}
