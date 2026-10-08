// @vitest-environment jsdom

import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { serializeHmiDynamizations } from "../src/core/hmiDynamizations";
import { serializeHmiEvents } from "../src/core/hmiEvents";
import { serializeHmiFaceplateBinding } from "../src/core/hmiFaceplates";
import { hmiFlashingCss, hmiFlashingInlineStyle, resolveHmiFlashing } from "../src/core/hmiFlashing";
import { executeHmiScript, executeHmiScriptAsync, inspectHmiScript, inspectHmiScriptProgram } from "../src/core/hmiScript";
import { hmiAlarmMatches, nextHmiCalendarDue } from "../src/core/hmiSchedule";
import { createHmiScriptContextManager, emptyHmiScriptCatalog, hmiScriptFunctions, parseHmiScriptCatalog, type HmiScriptCatalog } from "../src/core/hmiScriptModules";
import { createHmiTimerManager } from "../src/core/hmiTimers";
import { createHmiFaceplatePopupDomSurface, createHmiFaceplatePopupManager } from "../src/core/hmiPopupManager";
import { renderHmiFaceplates } from "../src/core/hmiFaceplateVisuals";
import { defaultHmiTrendConfig, renderHmiTrendControls, serializeHmiTrendConfig } from "../src/core/hmiTrend";
import { createHmiDataLogRuntime, emptyHmiDataLogCatalog, type HmiDataLogCatalog } from "../src/core/hmiDataLogs";
import { defaultHmiFunctionTrendConfig, renderHmiFunctionTrendControls, serializeHmiFunctionTrendConfig } from "../src/core/hmiFunctionTrend";
import { standardProjectFiles } from "../src/core/standardProject";
import { createHmiGatewayClient, HmiGatewayCommandError } from "../src/core/hmiGateway";
import { connectionDiagnostic } from "../runtime/connection-diagnostics.mjs";
import * as alarmEngine from "../runtime/alarm-engine.mjs";
import { createHmiAlarmControl } from "../src/core/hmiAlarmControl";

interface GeneratedRuntime {
  installFramecraftHmiRuntime(options: { navigate: (target: string) => void; trace: (message: string) => void; error: (message: string) => void }): () => void;
  runtimeTagValues(): Readonly<Record<string, string>>;
  setRuntimeTagValue(tag: string, value: string | number | boolean): void;
  runtimeTagStatus(): Readonly<Record<string, { qualityCode?: number; qualityKnown?: boolean; timeStamp?: number; lastError?: number }>>;
  applyRuntimeTagSample(sample: { tag: string; connectionId: string; value?: string; qualityCode?: number; timestamp?: number; receivedAt: number }): void;
  requestRuntimeTagWrite(tag: string, value: string | number | boolean): Promise<{ outcome: string; plcConfirmed: false }>;
  notifyRuntimeAlarm(alarm: { alarmClass: string; state: string; priority: number; name?: string; text?: string }): void;
  requestRuntimeDataLog(logId?: string, loggedTagId?: string): number;
}

const generatedSources = new Map(standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] }).map((file) => [file.path, file.content]));
const compiledSources = new Map<string, string>();
function compileSource(source: string): string {
  const cached = compiledSources.get(source);
  if (cached !== undefined) return cached;
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  compiledSources.set(source, javascript);
  return javascript;
}

// Il pannello riceve JavaScript già compilato: prepariamo solo il testo, mai istanze o stato Runtime.
beforeAll(() => {
  for (const path of ["src/framecraftScriptRuntime.ts", "src/framecraftHmiExpression.ts", "src/framecraftHmiTagBinding.ts"]) compileSource(generatedSources.get(path)!);
});

function loadGeneratedScriptRuntime(): typeof import("../src/core/hmiScript") {
  const source = generatedSources.get("src/framecraftScriptRuntime.ts")!;
  const javascript = compileSource(source);
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as typeof import("../src/core/hmiScript");
}

function loadGeneratedScriptModules(): { hmiScriptFunctions: typeof hmiScriptFunctions; createHmiScriptContextManager: typeof createHmiScriptContextManager } {
  const source = generatedSources.get("src/framecraftScriptModules.ts")!;
  const javascript = compileSource(source);
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", "require", javascript)(exports, module, (id: string) => {
    if (id === "./framecraftScriptRuntime") return loadGeneratedScriptRuntime();
    throw new Error(`Dipendenza generata non prevista: ${id}`);
  });
  return module.exports as ReturnType<typeof loadGeneratedScriptModules>;
}

function loadGeneratedTimers(): typeof createHmiTimerManager {
  const source = generatedSources.get("src/framecraftHmiTimers.ts")!;
  const javascript = compileSource(source);
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return (module.exports as { createHmiTimerManager: typeof createHmiTimerManager }).createHmiTimerManager;
}

function loadGeneratedPopups(): { createHmiFaceplatePopupDomSurface: typeof createHmiFaceplatePopupDomSurface; createHmiFaceplatePopupManager: typeof createHmiFaceplatePopupManager } {
  const source = generatedSources.get("src/framecraftHmiPopups.ts")!;
  const javascript = compileSource(source);
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as ReturnType<typeof loadGeneratedPopups>;
}

function loadGeneratedFaceplateVisuals(): { renderHmiFaceplates: typeof renderHmiFaceplates } {
  const source = generatedSources.get("src/framecraftHmiFaceplateVisuals.ts")!;
  const javascript = compileSource(source);
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { renderHmiFaceplates: typeof renderHmiFaceplates };
}

function loadGeneratedTrend(): { renderHmiTrendControls: typeof renderHmiTrendControls } {
  const source = generatedSources.get("src/framecraftHmiTrend.ts")!;
  const javascript = compileSource(source);
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { renderHmiTrendControls: typeof renderHmiTrendControls };
}

function loadGeneratedFunctionTrend(): { renderHmiFunctionTrendControls: typeof renderHmiFunctionTrendControls } {
  const source = generatedSources.get("src/framecraftHmiFunctionTrend.ts")!;
  const javascript = compileSource(source);
  const exports: Record<string, unknown> = {}; const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { renderHmiFunctionTrendControls: typeof renderHmiFunctionTrendControls };
}

function loadGeneratedDataLogs(): { createHmiDataLogRuntime: typeof createHmiDataLogRuntime } {
  const source = generatedSources.get("src/framecraftHmiDataLogs.ts")!;
  const javascript = compileSource(source);
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { createHmiDataLogRuntime: typeof createHmiDataLogRuntime };
}

function loadGeneratedSchedule(): { hmiAlarmMatches: typeof hmiAlarmMatches; nextHmiCalendarDue: typeof nextHmiCalendarDue } {
  const source = generatedSources.get("src/framecraftHmiSchedule.ts")!;
  const javascript = compileSource(source);
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { hmiAlarmMatches: typeof hmiAlarmMatches; nextHmiCalendarDue: typeof nextHmiCalendarDue };
}

function loadGeneratedFlashing(): { hmiFlashingCss: typeof hmiFlashingCss; hmiFlashingInlineStyle: typeof hmiFlashingInlineStyle; resolveHmiFlashing: typeof resolveHmiFlashing } {
  const source = generatedSources.get("src/framecraftHmiFlashing.ts")!;
  const javascript = compileSource(source);
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { hmiFlashingCss: typeof hmiFlashingCss; hmiFlashingInlineStyle: typeof hmiFlashingInlineStyle; resolveHmiFlashing: typeof resolveHmiFlashing };
}

function loadGeneratedTagBindings(): typeof import("../src/core/hmiTagBinding") {
  const expression = { exports: {} };
  new Function("exports", "module", compileSource(generatedSources.get("src/framecraftHmiExpression.ts")!))(expression.exports, expression);
  const binding = { exports: {} };
  new Function("exports", "module", "require", compileSource(generatedSources.get("src/framecraftHmiTagBinding.ts")!))(binding.exports, binding, (id: string) => {
    if (id === "./framecraftHmiExpression") return expression.exports;
    throw new Error(`Dipendenza generata non prevista: ${id}`);
  });
  return binding.exports as typeof import("../src/core/hmiTagBinding");
}

function loadGeneratedRuntime(scriptCatalog: HmiScriptCatalog = emptyHmiScriptCatalog(), dataLogCatalog: HmiDataLogCatalog = emptyHmiDataLogCatalog("runtime-test"), gatewayEnabled = false, tagCatalog = [{ name: "Runtime.Alternative", dataType: "REAL", access: "read" }, { name: "Motor.Speed", dataType: "REAL", access: "read-write" }], alarmCatalog = alarmEngine.emptyAlarmCatalog()): GeneratedRuntime {
  const source = generatedSources.get("src/framecraftHmiRuntime.ts")!
    .replace('import { executeHmiScript, executeHmiScriptAsync, inspectHmiScriptProgram } from "./framecraftScriptRuntime";', "const executeHmiScript = globalThis.__framecraftTestExecuteHmiScript; const executeHmiScriptAsync = globalThis.__framecraftTestExecuteHmiScriptAsync; const inspectHmiScriptProgram = globalThis.__framecraftTestInspectHmiScriptProgram;")
    .replace('import { hmiFlashingCss, hmiFlashingInlineStyle, resolveHmiFlashing, createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface } from "./framecraftHmiFlashing";', "const { hmiFlashingCss, hmiFlashingInlineStyle, resolveHmiFlashing, createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface } = globalThis.__framecraftTestHmiFlashing;")
    .replace('import { createHmiScriptContextManager } from "./framecraftScriptModules";', "const { createHmiScriptContextManager } = globalThis.__framecraftTestHmiScriptModules;")
    .replace('import { hmiAlarmMatches, nextHmiCalendarDue } from "./framecraftHmiSchedule";', "const { hmiAlarmMatches, nextHmiCalendarDue } = globalThis.__framecraftTestHmiSchedule;")
    .replace('import { createHmiTimerManager } from "./framecraftHmiTimers";', "const createHmiTimerManager = globalThis.__framecraftTestCreateHmiTimerManager;")
    .replace('import { createHmiFaceplatePopupDomSurface, createHmiFaceplatePopupManager } from "./framecraftHmiPopups";', "const { createHmiFaceplatePopupDomSurface, createHmiFaceplatePopupManager } = globalThis.__framecraftTestHmiPopups;")
    .replace('import { renderHmiFaceplates } from "./framecraftHmiFaceplateVisuals";', "const { renderHmiFaceplates } = globalThis.__framecraftTestHmiFaceplateVisuals;")
    .replace('import { renderHmiTrendControls } from "./framecraftHmiTrend";', "const { renderHmiTrendControls } = globalThis.__framecraftTestHmiTrend;")
    .replace('import { renderHmiFunctionTrendControls } from "./framecraftHmiFunctionTrend";', "const { renderHmiFunctionTrendControls } = globalThis.__framecraftTestHmiFunctionTrend;")
    .replace('import { createHmiDataLogRuntime } from "./framecraftHmiDataLogs";', "const { createHmiDataLogRuntime } = globalThis.__framecraftTestHmiDataLogs;")
    .replace('import scriptCatalogJson from "../framecraft.scripts.json";', "const scriptCatalogJson = globalThis.__framecraftTestScriptCatalog;")
    .replace('import faceplateCatalogJson from "../framecraft.faceplates.json";', "const faceplateCatalogJson = globalThis.__framecraftTestFaceplateCatalog;")
    .replace('import dataLogCatalogJson from "../framecraft.logs.json";', "const dataLogCatalogJson = globalThis.__framecraftTestDataLogCatalog;")
    .replace('import alarmCatalogJson from "../framecraft.alarms.json";', 'const alarmCatalogJson = ' + JSON.stringify(alarmCatalog) + ';')
    .replace('import plcCatalogJson from "../framecraft.plc.json";', 'const plcCatalogJson = ' + JSON.stringify({ variables: tagCatalog }) + ';')
    .replace('import runtimeCatalogJson from "../framecraft.runtime.json";', 'const runtimeCatalogJson = { gateway: { enabled: ' + gatewayEnabled + ', pollMs: 100 } };')
    .replace('import { createHmiGatewayClient, HmiGatewayCommandError, type HmiGatewaySample, type HmiGatewaySnapshot } from "./framecraftGateway";', "const createHmiGatewayClient = globalThis.__framecraftTestGateway; const HmiGatewayCommandError = globalThis.__framecraftTestGatewayError;");
  const javascript = compileSource(source);
  const exports: Record<string, unknown> = {};
  const module = { exports };
  (globalThis as typeof globalThis & { __framecraftTestExecuteHmiScript?: typeof executeHmiScript }).__framecraftTestExecuteHmiScript = executeHmiScript;
  (globalThis as typeof globalThis & { __framecraftTestExecuteHmiScriptAsync?: typeof executeHmiScriptAsync }).__framecraftTestExecuteHmiScriptAsync = executeHmiScriptAsync;
  (globalThis as typeof globalThis & { __framecraftTestInspectHmiScriptProgram?: typeof inspectHmiScriptProgram }).__framecraftTestInspectHmiScriptProgram = loadGeneratedScriptRuntime().inspectHmiScriptProgram;
  (globalThis as typeof globalThis & { __framecraftTestHmiFlashing?: ReturnType<typeof loadGeneratedFlashing> }).__framecraftTestHmiFlashing = loadGeneratedFlashing();
  (globalThis as typeof globalThis & { __framecraftTestHmiScriptModules?: ReturnType<typeof loadGeneratedScriptModules> }).__framecraftTestHmiScriptModules = loadGeneratedScriptModules();
  (globalThis as typeof globalThis & { __framecraftTestHmiSchedule?: ReturnType<typeof loadGeneratedSchedule> }).__framecraftTestHmiSchedule = loadGeneratedSchedule();
  (globalThis as typeof globalThis & { __framecraftTestCreateHmiTimerManager?: typeof createHmiTimerManager }).__framecraftTestCreateHmiTimerManager = loadGeneratedTimers();
  (globalThis as typeof globalThis & { __framecraftTestHmiPopups?: ReturnType<typeof loadGeneratedPopups> }).__framecraftTestHmiPopups = loadGeneratedPopups();
  (globalThis as typeof globalThis & { __framecraftTestHmiFaceplateVisuals?: ReturnType<typeof loadGeneratedFaceplateVisuals> }).__framecraftTestHmiFaceplateVisuals = loadGeneratedFaceplateVisuals();
  (globalThis as typeof globalThis & { __framecraftTestHmiTrend?: ReturnType<typeof loadGeneratedTrend> }).__framecraftTestHmiTrend = loadGeneratedTrend();
  (globalThis as typeof globalThis & { __framecraftTestHmiFunctionTrend?: ReturnType<typeof loadGeneratedFunctionTrend> }).__framecraftTestHmiFunctionTrend = loadGeneratedFunctionTrend();
  (globalThis as typeof globalThis & { __framecraftTestHmiDataLogs?: ReturnType<typeof loadGeneratedDataLogs> }).__framecraftTestHmiDataLogs = loadGeneratedDataLogs();
  (globalThis as typeof globalThis & { __framecraftTestScriptCatalog?: HmiScriptCatalog }).__framecraftTestScriptCatalog = scriptCatalog;
  (globalThis as typeof globalThis & { __framecraftTestFaceplateCatalog?: unknown }).__framecraftTestFaceplateCatalog = {
    types: [{
      id: "motor", name: "Motor", version: "1.0.0", status: "released", width: 180, height: 80,
      interfaceTags: [{ name: "Speed", dataType: "Int", required: false }], interfaceProperties: [{ name: "Enabled", dataType: "Bool", defaultValue: false }], interfaceEvents: [],
      localTags: [{ name: "LocalCounter", dataType: "Int", startValue: "0" }], nestedInstances: [],
      visualization: [{ id: "SpeedValue", type: "io-field", left: 0, top: 0, width: 180, height: 40, bindings: [{ property: "ProcessValue", source: "tag", name: "Speed" }] }],
    }],
  };
  (globalThis as typeof globalThis & { __framecraftTestDataLogCatalog?: unknown }).__framecraftTestDataLogCatalog = dataLogCatalog;
  (globalThis as typeof globalThis & { __framecraftTestGateway?: typeof createHmiGatewayClient }).__framecraftTestGateway = createHmiGatewayClient;
  (globalThis as typeof globalThis & { __framecraftTestGatewayError?: typeof HmiGatewayCommandError }).__framecraftTestGatewayError = HmiGatewayCommandError;
  new Function("exports", "module", "require", javascript)(exports, module, (id: string) => {
    if (id === "./framecraftHmiTagBinding") return loadGeneratedTagBindings();
    if (id === "../runtime/alarm-engine.mjs") return alarmEngine;
    if (id === "./framecraftHmiAlarmControl") return { createHmiAlarmControl };
    throw new Error(`Dipendenza generata non prevista: ${id}`);
  });
  return module.exports as unknown as GeneratedRuntime;
}

const touchPointer = (type: string, x: number, y: number) => {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerType: { value: "touch" }, pointerId: { value: 11 }, isPrimary: { value: true } });
  return event;
};
const settleEvents = () => new Promise((resolve) => setTimeout(resolve, 0));

function connectedGateway(write?: (init: RequestInit) => Promise<Response>) {
  const snapshot = { version: 1, allowWrites: true, connections: [{ id: "mqtt", state: "connected" }], tags: [{ name: "Motor.Speed", dataType: "Real", access: "read-write", writable: true, connectionId: "mqtt" }], samples: [{ tag: "Motor.Speed", connectionId: "mqtt", value: "10", qualityCode: 192, timestamp: Date.now(), receivedAt: Date.now() }] };
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/snapshot")) return new Response(JSON.stringify(snapshot));
    if (write) return write(init!);
    return new Response(JSON.stringify({ ...JSON.parse(String(init?.body)), outcome: "delivered", delivery: "broker-ack", plcConfirmed: false }));
  });
  vi.stubGlobal("fetch", request);
  return request;
}

afterEach(() => {
  delete (globalThis as typeof globalThis & { __framecraftTestExecuteHmiScript?: unknown }).__framecraftTestExecuteHmiScript;
  delete (globalThis as typeof globalThis & { __framecraftTestExecuteHmiScriptAsync?: unknown }).__framecraftTestExecuteHmiScriptAsync;
  delete (globalThis as typeof globalThis & { __framecraftTestInspectHmiScriptProgram?: unknown }).__framecraftTestInspectHmiScriptProgram;
  delete (globalThis as typeof globalThis & { __framecraftTestHmiFlashing?: unknown }).__framecraftTestHmiFlashing;
  delete (globalThis as typeof globalThis & { __framecraftTestHmiScriptModules?: unknown }).__framecraftTestHmiScriptModules;
  delete (globalThis as typeof globalThis & { __framecraftTestHmiSchedule?: unknown }).__framecraftTestHmiSchedule;
  delete (globalThis as typeof globalThis & { __framecraftTestCreateHmiTimerManager?: unknown }).__framecraftTestCreateHmiTimerManager;
  delete (globalThis as typeof globalThis & { __framecraftTestHmiPopups?: unknown }).__framecraftTestHmiPopups;
  delete (globalThis as typeof globalThis & { __framecraftTestHmiFaceplateVisuals?: unknown }).__framecraftTestHmiFaceplateVisuals;
  delete (globalThis as typeof globalThis & { __framecraftTestHmiTrend?: unknown }).__framecraftTestHmiTrend;
  delete (globalThis as typeof globalThis & { __framecraftTestHmiDataLogs?: unknown }).__framecraftTestHmiDataLogs;
  delete (globalThis as typeof globalThis & { __framecraftTestScriptCatalog?: unknown }).__framecraftTestScriptCatalog;
  delete (globalThis as typeof globalThis & { __framecraftTestFaceplateCatalog?: unknown }).__framecraftTestFaceplateCatalog;
  delete (globalThis as typeof globalThis & { __framecraftTestDataLogCatalog?: unknown }).__framecraftTestDataLogCatalog;
  delete (globalThis as typeof globalThis & { __framecraftTestGateway?: unknown }).__framecraftTestGateway;
  delete (globalThis as typeof globalThis & { __framecraftTestGatewayError?: unknown }).__framecraftTestGatewayError;
  delete (window as Window & { __framecraftEditorPreview?: boolean }).__framecraftEditorPreview;
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Runtime del pannello standard generato", () => {
  it("Scheduler allarmi del servizio non riproduce storico, polling vecchi o eventi dopo il riavvio", async () => {
    const tags = [{ name: "Signal", dataType: "Bool", access: "read" }];
    const catalog = { ...alarmEngine.emptyAlarmCatalog(), alarms: [{ id: "alarm", name: "Motor alarm", text: "Controlla motore", tag: "Signal", className: "Alarm_CTH", enabled: true, priority: 1, trigger: { kind: "bit" as const, bit: 0, activeWhen: "set" as const } }] };
    let engine = alarmEngine.createAlarmEngine(catalog, tags);
    engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 });
    let serviceState = { ...engine.snapshot(), actionsEnabled: false };
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ version: 1, allowWrites: false, connections: [{ id: "mqtt", state: "connected" }], tags: tags.map((tag) => ({ ...tag, connectionId: "mqtt", writable: false })), samples: [], alarms: serviceState })));
    vi.stubGlobal("fetch", request);
    const scripts = parseHmiScriptCatalog({ scheduledTasks: [{ id: "alarm-task", name: "Evento allarme", trigger: { kind: "alarm", criterion: "state", condition: "equals", operand: "Incoming" }, script: 'HMIRuntime.Trace("service-alarm");' }] });
    const runtime = loadGeneratedRuntime(scripts, undefined, true, tags, catalog);
    document.body.innerHTML = '<div data-hmi-type="HmiAlarmControl" style="height:300px"></div>';
    const error = vi.fn(), trace = vi.fn(), stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace, error });
    try {
      await vi.waitFor(() => expect(document.body.textContent).toContain("Attivo"));
      expect(trace).not.toHaveBeenCalled();
      engine.updateSample({ tag: "Signal", value: "0", qualityCode: 192 }); serviceState = { ...engine.snapshot(), actionsEnabled: false };
      await vi.waitFor(() => expect(document.body.textContent).toContain("Rientrato"));
      engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); serviceState = { ...engine.snapshot(), actionsEnabled: false };
      await vi.waitFor(() => expect(trace).toHaveBeenCalledTimes(1));
      const previous = serviceState;
      engine.updateSample({ tag: "Signal", value: "0", qualityCode: 0 }); serviceState = { ...engine.snapshot(), actionsEnabled: false };
      await vi.waitFor(() => expect(document.body.textContent).toContain("segnale non valido"));
      serviceState = previous; const polls = request.mock.calls.length;
      await vi.waitFor(() => expect(request.mock.calls.length).toBeGreaterThan(polls + 1));
      expect(document.body.textContent).toContain("segnale non valido"); expect(trace).toHaveBeenCalledTimes(1);
      engine = alarmEngine.createAlarmEngine(catalog, tags); engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); serviceState = { ...engine.snapshot(), actionsEnabled: false };
      await vi.waitFor(() => expect(document.body.textContent).not.toContain("segnale non valido")); expect(trace).toHaveBeenCalledTimes(1);
      engine.updateSample({ tag: "Signal", value: "0", qualityCode: 192 }); serviceState = { ...engine.snapshot(), actionsEnabled: false };
      await vi.waitFor(() => expect(document.body.textContent).toContain("Rientrato"));
      engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); serviceState = { ...engine.snapshot(), actionsEnabled: false };
      await vi.waitFor(() => expect(trace).toHaveBeenCalledTimes(2)); expect(error).not.toHaveBeenCalled();
      expect(request.mock.calls.every(([url, init]) => String(url).endsWith("/snapshot") && init?.method !== "POST")).toBe(true);
    } finally { stop(); }
  });
  it("allarmi locali usano segnali, qualità e presa visione senza rimbalzi o scritture PLC", async () => {
    const catalog = { ...alarmEngine.emptyAlarmCatalog(), alarms: [{ id: "alarm", name: "Motor alarm", text: "Controlla motore", tag: "Signal", className: "Alarm_CTH", enabled: true, priority: 1, trigger: { kind: "bit" as const, bit: 0, activeWhen: "set" as const } }] };
    const scripts = parseHmiScriptCatalog({ scheduledTasks: [{ id: "alarm-task", name: "Evento allarme", trigger: { kind: "alarm", criterion: "state", condition: "equals", operand: "Incoming" }, script: 'HMIRuntime.Trace("automatic-alarm");' }] });
    const runtime = loadGeneratedRuntime(scripts, undefined, false, [{ name: "Signal", dataType: "Bool", access: "read" }], catalog);
    document.body.innerHTML = '<div data-hmi-type="HmiAlarmControl" data-hmi-filter="AlarmClassName = \'Alarm_CTH\'" style="height:300px"></div>';
    document.querySelector("[data-hmi-type]")!.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'HMIRuntime.Trace("unexpected-parent-click");' }]));
    const error = vi.fn(), trace = vi.fn(), dispose = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace, error });
    try {
      expect(document.body.textContent).toContain("In attesa del segnale"); runtime.setRuntimeTagValue("Signal", "1"); expect(document.body.textContent).toContain("Attivo");
      await vi.waitFor(() => expect(trace).toHaveBeenCalledWith("[HMI TASK Evento allarme] automatic-alarm")); runtime.setRuntimeTagValue("Signal", "1"); expect(trace.mock.calls.filter(([message]) => message.includes("automatic-alarm"))).toHaveLength(1);
      const select = document.querySelector<HTMLButtonElement>('[aria-label="Seleziona Motor alarm"]')!; select.click(); [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Prendi in visione")!.click();
      await vi.waitFor(() => expect(document.body.textContent).toContain("preso in visione")); expect(runtime.runtimeTagValues().Signal).toBe("1");
      runtime.applyRuntimeTagSample({ tag: "Signal", connectionId: "local", value: "0", qualityCode: 0, receivedAt: 1000 }); expect(document.body.textContent).toContain("Attivo"); expect(document.body.textContent).toContain("segnale non valido");
      runtime.applyRuntimeTagSample({ tag: "Signal", connectionId: "local", value: "0", qualityCode: 192, receivedAt: 1001 }); expect(document.body.textContent).toContain("Nessun allarme corrispondente"); expect(error).not.toHaveBeenCalled();
      expect(trace.mock.calls.some(([message]) => message.includes("unexpected-parent-click"))).toBe(false);
    } finally { dispose(); }
    expect(document.querySelector("[data-hmi-alarm-root]")).toBeNull();
  });
  it("aggiorna il valore dei veri campi IO input in sola lettura indiretta e ripristina la modificabilità alla chiusura", () => {
    const runtime = loadGeneratedRuntime(undefined, undefined, false, [{ name: "Selected", dataType: "WSTRING", access: "read" }, { name: "Motor1", dataType: "REAL", access: "read" }]);
    runtime.setRuntimeTagValue("Selected", "Motor1"); runtime.setRuntimeTagValue("Motor1", 21);
    const input = document.createElement("input"); input.type = "number"; input.value = "7";
    input.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "ProcessValue", kind: "Tag", tag: "Selected", indirect: true, indirectDataType: "REAL" }])); document.body.append(input);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: vi.fn() });
    try {
      expect(input.value).toBe("21"); expect(input.readOnly).toBe(true);
      runtime.setRuntimeTagValue("Motor1", 32); expect(input.value).toBe("32");
      runtime.setRuntimeTagValue("Selected", "Unknown"); expect(input.value).toBe(""); expect(input.title).toContain("catalogo");
      runtime.setRuntimeTagValue("Selected", "Motor1"); expect(input.value).toBe("32");
    } finally { stop(); }
    expect(input.readOnly).toBe(false);
  });
  it("rifiuta proprietà sconosciute e non trasforma un tag in un URL eseguibile", () => {
    const runtime = loadGeneratedRuntime(); runtime.setRuntimeTagValue("Source", "javascript:alert(1)");
    const frame = document.createElement("iframe"), unknown = document.createElement("div");
    frame.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "Url", kind: "Tag", tag: "Source" }]));
    unknown.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "constructor", kind: "Tag", tag: "Source" }])); document.body.append(frame, unknown);
    const error = vi.fn(), stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error });
    try { expect(frame.getAttribute("src")).toBeNull(); expect(unknown.hasAttribute("data-framecraft-dynamic-error")).toBe(true); expect(error).toHaveBeenCalledTimes(2); }
    finally { stop(); }
  });
  it("riceve selettore e destinazione dal gateway e non invia comandi impliciti", async () => {
    const tags = [{ name: "Selected", dataType: "WSTRING", access: "read" }, { name: "Motor1", dataType: "REAL", access: "read" }];
    const snapshot = { version: 1, allowWrites: false, connections: [{ id: "opcua", state: "connected" }], tags: tags.map((tag) => ({ ...tag, connectionId: "opcua", writable: false })), samples: [{ tag: "Selected", connectionId: "opcua", value: "Motor1", qualityCode: 192, receivedAt: Date.now() }, { tag: "Motor1", connectionId: "opcua", value: "28", qualityCode: 128, receivedAt: Date.now() }] };
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(snapshot))); vi.stubGlobal("fetch", request);
    const runtime = loadGeneratedRuntime(undefined, undefined, true, tags);
    const output = document.createElement("output"); output.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "ProcessValue", kind: "Tag", tag: "Selected", indirect: true, indirectDataType: "REAL" }])); document.body.append(output);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: vi.fn() });
    try {
      expect(output.textContent).toBe("—");
      await vi.waitFor(() => expect(output.textContent).toBe("28"));
      expect(request.mock.calls.every((call) => String(call[0]).endsWith("/snapshot") && (call[1] as RequestInit).method !== "POST")).toBe(true);
    } finally { stop(); }
  });

  it("ripristina lo stile statico e disabilita visibilità/comandi quando la destinazione diventa invalida", () => {
    const tags = [{ name: "Selected", dataType: "WSTRING", access: "read" }, { name: "Motor1", dataType: "REAL", access: "read" }];
    const runtime = loadGeneratedRuntime(undefined, undefined, false, tags); runtime.setRuntimeTagValue("Selected", "Motor1"); runtime.setRuntimeTagValue("Motor1", 1);
    const block = document.createElement("div"); block.style.backgroundColor = "#808080";
    const config = { property: "BackColor", kind: "Tag" as const, tag: "Selected", indirect: true, indirectDataType: "REAL", conditionType: "Range" as const, entries: [{ from: 1, to: 1, value: "#00ff00" }] };
    block.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([config, { ...config, property: "Enabled", conditionType: "None", entries: [] }, { ...config, property: "Visible", conditionType: "None", entries: [] }])); document.body.append(block);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: vi.fn() });
    try {
      expect(block.style.backgroundColor).toBe("rgb(0, 255, 0)");
      runtime.setRuntimeTagValue("Selected", "Unknown"); expect(block.style.backgroundColor).toBe("rgb(128, 128, 128)"); expect(block.style.visibility).toBe("hidden"); expect(block.style.pointerEvents).toBe("none");
      runtime.setRuntimeTagValue("Selected", "Motor1"); expect(block.style.backgroundColor).toBe("rgb(0, 255, 0)"); expect(block.style.visibility).toBe("visible"); expect(block.style.pointerEvents).toBe("auto");
    } finally { stop(); }
  });

  it("legge il tag scelto dal selettore, segue entrambe le variazioni e non effettua scritture", () => {
    const tags = [{ name: "Selected", dataType: "WSTRING", access: "read-write" }, { name: "Motor1", dataType: "REAL", access: "read" }, { name: "Motor2", dataType: "REAL", access: "read" }];
    const runtime = loadGeneratedRuntime(undefined, undefined, false, tags), errors = vi.fn(), writes = vi.fn();
    runtime.setRuntimeTagValue("Selected", "Motor1"); runtime.setRuntimeTagValue("Motor1", 21); runtime.setRuntimeTagValue("Motor2", 32);
    const label = document.createElement("output"), direct = document.createElement("span");
    const config = { property: "ProcessValue", kind: "Tag" as const, tag: "Selected", indirect: true, indirectDataType: "REAL" };
    label.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([config])); label.title = "Temperatura";
    direct.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ ...config, indirect: false }])); document.body.append(label, direct);
    window.addEventListener("framecraft:tag-write", writes);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: errors });
    try {
      expect(label.textContent).toBe("21"); expect(direct.textContent).toBe("Motor1"); expect(writes).not.toHaveBeenCalled();
      runtime.setRuntimeTagValue("Motor1", 25); expect(label.textContent).toBe("25");
      runtime.setRuntimeTagValue("Selected", "Motor2"); expect(label.textContent).toBe("32");
      runtime.setRuntimeTagValue("Motor1", 99); expect(label.textContent).toBe("32");
      runtime.setRuntimeTagValue("Motor2", 33); expect(label.textContent).toBe("33");
      runtime.setRuntimeTagValue("Selected", "Unknown"); expect(label.textContent).toBe("—"); expect(label.title).toContain("catalogo");
      runtime.setRuntimeTagValue("Selected", "Selected"); expect(label.textContent).toBe("—"); expect(label.title).toContain("sé stesso");
      runtime.setRuntimeTagValue("Selected", "Motor1"); expect(label.textContent).toBe("99"); expect(label.title).toBe("Temperatura"); expect(label.hasAttribute("data-framecraft-dynamic-error")).toBe(false);
      expect(errors).toHaveBeenCalledTimes(2);
    } finally { stop(); window.removeEventListener("framecraft:tag-write", writes); }
  });

  it("non conserva una lettura indiretta quando cambia solo la qualità e recupera al campione Good", () => {
    const runtime = loadGeneratedRuntime(undefined, undefined, false, [{ name: "Selected", dataType: "WSTRING", access: "read" }, { name: "Motor1", dataType: "REAL", access: "read" }]);
    const label = document.createElement("output"); label.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "ProcessValue", kind: "Tag", tag: "Selected", indirect: true, indirectDataType: "REAL" }])); document.body.append(label);
    runtime.setRuntimeTagValue("Selected", "Motor1"); runtime.setRuntimeTagValue("Motor1", 21);
    const error = vi.fn(), stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error });
    const sample = (tag: string, qualityCode: number, value?: string) => runtime.applyRuntimeTagSample({ tag, qualityCode, value, connectionId: "synthetic", receivedAt: Date.now() });
    try {
      expect(label.textContent).toBe("21");
      sample("Motor1", 0); expect(label.textContent).toBe("—");
      sample("Motor1", 192, "25"); expect(label.textContent).toBe("25");
      sample("Selected", 64); expect(label.textContent).toBe("—");
      sample("Selected", 128, "Motor1"); expect(label.textContent).toBe("25");
      expect(error).toHaveBeenCalledTimes(2);
    } finally { stop(); }
  });

  it("consegna conversioni Range ed Expression al vero Runtime generato", () => {
    const runtime = loadGeneratedRuntime(); runtime.setRuntimeTagValue("State", 2);
    const label = document.createElement("span"), block = document.createElement("div");
    label.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "Text", kind: "Tag", tag: "State", conditionType: "Expression", entries: [{ condition: "value > 1", value: "Pronto" }] }]));
    block.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "BackColor", kind: "Tag", tag: "State", conditionType: "Range", entries: [{ from: 0, to: 2, value: "#ff0000" }, { from: 3, to: 9, value: "#00ff00" }] }])); document.body.append(label, block);
    const error = vi.fn(), stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error });
    try {
      expect(label.textContent).toBe("Pronto"); expect(block.style.backgroundColor).toBe("rgb(255, 0, 0)");
      runtime.setRuntimeTagValue("State", 3); expect(block.style.backgroundColor).toBe("rgb(0, 255, 0)"); expect(error).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it("aggiorna tag dentro array restituiti dai moduli senza trigger manuali", () => {
    window.history.replaceState({}, "", "/");
    const catalog = parseHmiScriptCatalog({ globalModules: [{
      name: "Data", alias: "Data", globalDefinition: { source: "export const cfg = { sources: [Tags('Speed'), Tags('Backup')], count: 0 };" },
      functions: [{ name: "Get", parameters: [], source: "return cfg;" }],
    }] });
    const runtime = loadGeneratedRuntime(catalog), errors = vi.fn();
    runtime.setRuntimeTagValue("Speed", 10); runtime.setRuntimeTagValue("Backup", 20); runtime.setRuntimeTagValue("Selected", 0);
    const label = document.createElement("span");
    label.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "Text", kind: "Script", source: "const cfg = Modules.Data.Get(); return cfg.sources[Tags('Selected').Read()].Read();" }]));
    document.body.append(label);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: errors });
    try {
      expect(label.textContent).toBe("10");
      runtime.setRuntimeTagValue("Speed", 15); expect(label.textContent).toBe("15");
      runtime.setRuntimeTagValue("Selected", 1); expect(label.textContent).toBe("20");
      runtime.setRuntimeTagValue("Backup", 30); expect(label.textContent).toBe("30");
      expect(errors).not.toHaveBeenCalled();
    } finally { stop(); }
  });
  it("rivaluta le letture di tag esportati dai moduli senza trigger manuali", () => {
    window.history.replaceState({}, "", "/");
    const catalog = parseHmiScriptCatalog({ globalModules: [{
      name: "Values", alias: "Values", globalDefinition: { source: "const privateTag = Tags('Speed'); export const source = privateTag;" },
      functions: [{ name: "Read", parameters: [], source: "return Modules.Values.source.Read();" }],
    }, {
      name: "Reader", alias: "Reader", globalDefinition: { source: "const privateTag = Modules.Values.source;" },
      functions: [{ name: "Read", parameters: [], source: "return privateTag.Read();" }],
    }] });
    const runtime = loadGeneratedRuntime(catalog), errors = vi.fn();
    runtime.setRuntimeTagValue("Speed", 10);
    const direct = document.createElement("span"), throughFunction = document.createElement("span"), throughInitializer = document.createElement("span");
    direct.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "Text", kind: "Script", source: "return Modules.Values.source.Read();" }]));
    throughFunction.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "Text", kind: "Script", source: "return Modules.Values.Read();" }]));
    throughInitializer.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "Text", kind: "Script", source: "return Modules.Reader.Read();" }]));
    document.body.append(direct, throughFunction, throughInitializer);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: errors });
    try {
      expect(direct.textContent).toBe("10"); expect(throughFunction.textContent).toBe("10"); expect(throughInitializer.textContent).toBe("10");
      runtime.setRuntimeTagValue("Speed", 25);
      expect(direct.textContent).toBe("25"); expect(throughFunction.textContent).toBe("25"); expect(throughInitializer.textContent).toBe("25");
      expect(errors).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it("usa i binding pubblici live negli eventi senza contaminare le dinamizzazioni", async () => {
    window.history.replaceState({}, "", "/");
    const catalog = parseHmiScriptCatalog({ globalModules: [{
      name: "Counter", alias: "Counter", globalDefinition: { source: "export let count = 0;" },
      functions: [{ name: "Next", parameters: [], source: "count = count + 1;" }],
    }] });
    const runtime = loadGeneratedRuntime(catalog), errors = vi.fn();
    const button = document.createElement("button"), label = document.createElement("span");
    button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: "Modules.Counter.Next(); Tags('Event').Write(Modules.Counter.count);" }]));
    label.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "Text", kind: "Script", source: "return Modules.Counter.count;", triggers: ["Event"] }]));
    document.body.append(button, label);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: errors });
    try {
      button.click(); await settleEvents(); button.click(); await settleEvents();
      expect(runtime.runtimeTagValues().Event).toBe("2");
      expect(label.textContent).toBe("0"); expect(errors).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it("rivaluta i tag letti tramite globali di pagina e moduli senza trigger manuali", () => {
    window.history.replaceState({}, "", "/");
    const catalog = parseHmiScriptCatalog({
      globalModules: [{ name: "Values", alias: "Values", globalDefinition: { source: "const speed = Tags('Speed');" }, functions: [{ name: "Read", parameters: [], source: "return speed.Read();" }] }],
      localDefinitions: [{ scope: "/", context: "dynamizations", globalDefinition: { source: "const speed = Tags('Speed');" }, functions: [] }],
    });
    const runtime = loadGeneratedRuntime(catalog), errors = vi.fn();
    runtime.setRuntimeTagValue("Speed", 10);
    const direct = document.createElement("span"), throughModule = document.createElement("span");
    direct.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "Text", kind: "Script", source: "return speed.Read();" }]));
    throughModule.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "Text", kind: "Script", source: "return Modules.Values.Read();" }]));
    document.body.append(direct, throughModule);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: errors });
    try {
      expect(direct.textContent).toBe("10"); expect(throughModule.textContent).toBe("10");
      runtime.setRuntimeTagValue("Speed", 25);
      expect(direct.textContent).toBe("25"); expect(throughModule.textContent).toBe("25");
      expect(errors).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it("mantiene variabili condivise nel Runtime generato senza mescolare eventi e dinamizzazioni", async () => {
    window.history.replaceState({}, "", "/");
    const catalog = parseHmiScriptCatalog({
      globalModules: [{ name: "Counter", alias: "Counter", globalDefinition: { source: "let count = 0;" }, functions: [{ name: "Next", parameters: [], source: "count = count + 1; return count;" }] }],
      localDefinitions: [
        { scope: "/", context: "events", globalDefinition: { source: "let selected = 0;" }, functions: [] },
        { scope: "/", context: "dynamizations", globalDefinition: { source: "let selected = 100;" }, functions: [] },
      ],
    });
    const runtime = loadGeneratedRuntime(catalog), errors = vi.fn();
    const button = document.createElement("button"), label = document.createElement("span");
    button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: "selected = selected + 1; Tags('Event').Write(selected); Tags('Module').Write(Modules.Counter.Next());" }]));
    label.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "Text", kind: "Script", source: "return selected;", triggers: ["Event"] }]));
    document.body.append(button, label);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: errors });
    try {
      button.click(); await settleEvents(); button.click(); await settleEvents();
      expect(runtime.runtimeTagValues()).toMatchObject({ Event: "2", Module: "2" });
      expect(label.textContent).toBe("100"); expect(errors).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it("esegue Unloaded con il vecchio contesto e azzera la pagina ricaricata senza timer residui", async () => {
    window.history.replaceState({}, "", "/a");
    const catalog = parseHmiScriptCatalog({ localDefinitions: [
      { scope: "/a", context: "events", globalDefinition: { source: "let selected = 0;" }, functions: [] },
      { scope: "/b", context: "events", globalDefinition: { source: "let selected = 7;" }, functions: [] },
    ] });
    const runtime = loadGeneratedRuntime(catalog), trace = vi.fn(), errors = vi.fn();
    const first = document.createElement("button");
    first.setAttribute("data-hmi-events", serializeHmiEvents([
      { event: "Tapped", script: "selected = selected + 1; Tags('Page').Write(selected); HMIRuntime.Timers.SetTimeout(() => { Tags('Stale').Write(selected); }, 50);" },
      { event: "Unloaded", script: "HMIRuntime.Trace('unload=' + selected);" },
    ]));
    document.body.append(first);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace, error: errors });
    try {
      first.click(); await settleEvents(); expect(runtime.runtimeTagValues().Page).toBe("1");
      const next = document.createElement("button"); next.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Loaded", script: "Tags('NewPage').Write(selected);" }]));
      window.history.replaceState({}, "", "/b"); first.replaceWith(next); await settleEvents();
      expect(trace.mock.calls.flat().join(" ")).toContain("unload=1");
      expect(runtime.runtimeTagValues().NewPage).toBe("7");
      await new Promise((resolve) => setTimeout(resolve, 70)); expect(runtime.runtimeTagValues().Stale).toBeUndefined();
      window.history.replaceState({}, "", "/a"); next.replaceWith(first); await settleEvents();
      first.click(); await settleEvents(); expect(runtime.runtimeTagValues().Page).toBe("1");
      expect(errors).not.toHaveBeenCalled();
    } finally { stop(); window.history.replaceState({}, "", "/"); }
  });

  it("condivide lo Scheduler tra task ma non con le variabili degli eventi", async () => {
    vi.useFakeTimers(); window.history.replaceState({}, "", "/");
    const catalog = parseHmiScriptCatalog({
      schedulerDefinition: { source: "let shared = 0;" },
      localDefinitions: [{ scope: "/", context: "events", globalDefinition: { source: "let shared = 100;" }, functions: [] }],
      scheduledTasks: [
        { id: "first", name: "First", trigger: { kind: "interval", intervalMs: 50 }, script: "shared = shared + 1; Tags('First').Write(shared);" },
        { id: "second", name: "Second", trigger: { kind: "interval", intervalMs: 50 }, script: "shared = shared + 1; Tags('Second').Write(shared);" },
      ],
    });
    const runtime = loadGeneratedRuntime(catalog), errors = vi.fn();
    const button = document.createElement("button"); button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: "shared = shared + 1; Tags('Event').Write(shared);" }])); document.body.append(button);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: errors });
    try {
      button.click(); await vi.advanceTimersByTimeAsync(100);
      expect(runtime.runtimeTagValues()).toMatchObject({ First: "3", Second: "4", Event: "101" });
      expect(errors).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it("mantiene le closure inline e non esegue eventi in coda dopo lo stop", async () => {
    vi.useFakeTimers(); window.history.replaceState({}, "", "/");
    const runtime = loadGeneratedRuntime(), errors = vi.fn();
    const button = document.createElement("button"); button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: "let count = 1; HMIRuntime.Timers.SetInterval(() => { count = count + 1; Tags('Ticks').Write(count); }, 50); count = 7;" }])); document.body.append(button);
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: errors });
    button.click(); await vi.advanceTimersByTimeAsync(100);
    expect(runtime.runtimeTagValues().Ticks).toBe("9");
    button.click(); stop(); await vi.advanceTimersByTimeAsync(100);
    expect(runtime.runtimeTagValues().Ticks).toBe("9"); expect(vi.getTimerCount()).toBe(0);
    expect(errors).not.toHaveBeenCalled();
  });

  it("applica campioni reali con qualità sconosciuta senza emettere una scrittura", () => {
    const runtime = loadGeneratedRuntime(), write = vi.fn(); window.addEventListener("framecraft:tag-write", write);
    try {
      runtime.applyRuntimeTagSample({ tag: "Motor.Speed", connectionId: "mqtt", value: "42", timestamp: 100, receivedAt: 200 });
      expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("42");
      expect(runtime.runtimeTagStatus()["Motor.Speed"]).toMatchObject({ qualityKnown: false, timeStamp: 100 });
      expect(runtime.runtimeTagStatus()["Motor.Speed"].qualityCode).toBeUndefined(); expect(write).not.toHaveBeenCalled();
      const program = inspectHmiScript('return Tags("Motor.Speed").QualityCode;').program!;
      const result = executeHmiScript(program, runtime.runtimeTagValues(), { tagStatus: runtime.runtimeTagStatus() });
      expect(result.error).toBeUndefined(); expect(result.returned).toBe(0);
    } finally { window.removeEventListener("framecraft:tag-write", write); }
  });
  it("collega il gateway, mantiene il dato letto dopo il comando e rende visibile l'esito senza conferma PLC", async () => {
    const snapshot = { version: 1, allowWrites: true, connections: [{ id: "mqtt", state: "connected" }], tags: [{ name: "Motor.Speed", dataType: "Real", access: "read-write", writable: true, connectionId: "mqtt" }], samples: [{ tag: "Motor.Speed", connectionId: "mqtt", value: "10", qualityCode: 192, timestamp: 100, receivedAt: 200 }] };
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const result = String(input).endsWith("/snapshot") ? snapshot : { ...JSON.parse(String(init?.body)), outcome: "delivered", delivery: "broker-ack", plcConfirmed: false };
      return new Response(JSON.stringify(result));
    });
    vi.stubGlobal("fetch", request);
    document.body.innerHTML = '<span data-framecraft-gateway-status></span><div class="hmi-plc-bar"><i></i></div><aside data-framecraft-command-status hidden><span></span></aside>';
    const runtime = loadGeneratedRuntime(undefined, undefined, true), errors = vi.fn(), trace = vi.fn();
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace, error: errors });
    try {
      await vi.waitFor(() => expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("10"));
      expect(document.querySelector("[data-framecraft-gateway-status]")!.textContent).toBe("PLC 1/1");
      expect(await runtime.requestRuntimeTagWrite("Motor.Speed", 30)).toMatchObject({ outcome: "delivered", plcConfirmed: false });
      expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("10"); expect(runtime.runtimeTagStatus()["Motor.Speed"].qualityCode).toBe(192);
      expect(document.querySelector("[data-framecraft-command-status]")!.textContent).toContain("non confermato dal PLC"); expect(errors).not.toHaveBeenCalled();
      await expect(runtime.requestRuntimeTagWrite("Unknown.Tag", 1)).rejects.toThrow("non autorizzata");
      expect(document.querySelector("[data-framecraft-command-status]")!.textContent).toContain("non autorizzata");
      const button = document.createElement("button");
      button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'const tags = Tags.CreateTagSet(["Motor.Speed"]); tags("Motor.Speed").Value = 99; await tags.WriteAsync(); HMIRuntime.Trace("TRANSPORT_RECEIPT");' }])); document.body.append(button);
      const before = request.mock.calls.filter(([input]) => String(input).endsWith("/write")).length;
      button.click(); await vi.waitFor(() => expect(trace).toHaveBeenCalledWith("[HMI Tapped] TRANSPORT_RECEIPT"));
      expect(request.mock.calls.filter(([input]) => String(input).endsWith("/write"))).toHaveLength(before + 1);
      expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("10");
    } finally { dispose(); }
  });
  it("mostra diagnostica e rimedi nel pannello generato senza HTML attivo o errori per ogni poll", async () => {
    const connectionId = '<img src=x onerror="alert(1)">';
    const diagnostic = { ...connectionDiagnostic("AUTH_DENIED", { connectionId, timestamp: 1000 }), id: "runtime_event_0123456789" };
    const snapshot = { version: 1, allowWrites: false, connections: [{ id: connectionId, state: "error", diagnostic }], tags: [], samples: [], diagnostics: [diagnostic] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(snapshot))));
    document.body.innerHTML = '<span data-framecraft-gateway-status></span><p data-framecraft-plc-summary></p><div data-framecraft-plc-connections></div><ol data-framecraft-plc-events></ol>';
    const runtime = loadGeneratedRuntime(undefined, undefined, true), errors = vi.fn(), dispose = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: errors });
    try {
      await vi.waitFor(() => expect(document.querySelector("[data-framecraft-plc-events]")!.textContent).toContain("Come risolvere:"));
      expect(document.querySelector("[data-framecraft-plc-connections]")!.textContent).toContain("Da controllare"); expect(document.querySelector("[data-framecraft-plc-events]")!.textContent).toContain("permessi");
      expect(document.querySelector("[data-framecraft-plc-events] img")).toBeNull(); expect(document.querySelector("[data-framecraft-plc-events]")!.textContent).toContain(connectionId);
      await new Promise((resolve) => setTimeout(resolve, 300)); expect(document.querySelectorAll("[data-framecraft-plc-events] li")).toHaveLength(1); expect(errors).toHaveBeenCalledOnce();
      expect(document.querySelector("[data-framecraft-plc-summary]")!.textContent).toContain("0/1 connessioni");
    } finally { dispose(); }
  });
  it("propaga il gateway a moduli, timer e Scheduler senza modificare il valore acquisito", async () => {
    const request = connectedGateway(), catalog = parseHmiScriptCatalog({
      globalModules: [{ name: "IO", alias: "IO", globalDefinition: { source: 'let initial = Tags("Motor.Speed").Read(); let count = 0;' }, functions: [{ name: "Send", parameters: [], source: 'count = count + 1; Tags("Motor.Speed").Write(initial + count); HMIRuntime.Trace("module-sent");' }] }],
      scheduledTasks: [{ id: "alarm-send", name: "Invio allarme", trigger: { kind: "alarm", criterion: "priority", condition: "greater-or-equal", operand: "12" }, script: 'Tags("Motor.Speed").Write(44); HMIRuntime.Trace("task-sent");' }],
    });
    const button = document.createElement("button");
    button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'Modules.IO.Send(); HMIRuntime.Timers.SetTimeout(function() { Tags("Motor.Speed").Write(33); HMIRuntime.Trace("timer-sent"); }, 5);' }])); document.body.append(button);
    const runtime = loadGeneratedRuntime(catalog, undefined, true), trace = vi.fn(), error = vi.fn();
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace, error });
    try {
      await vi.waitFor(() => expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("10")); button.click();
      await vi.waitFor(() => expect(trace).toHaveBeenCalledWith("[HMI TIMER 1] timer-sent"));
      expect(trace).toHaveBeenCalledWith("[HMI Tapped] module-sent");
      runtime.notifyRuntimeAlarm({ alarmClass: "Alarm", state: "Incoming", priority: 16 });
      await vi.waitFor(() => expect(trace).toHaveBeenCalledWith("[HMI TASK Invio allarme] task-sent"));
      expect(request.mock.calls.filter(([input]) => String(input).endsWith("/write")).map(([, init]) => JSON.parse(String(init?.body)).value)).toEqual([11, 33, 44]);
      expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("10"); expect(runtime.runtimeTagStatus()["Motor.Speed"].qualityCode).toBe(192); expect(error).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it("mantiene i tag faceplate e le closure timer locali anche con il gateway attivo", async () => {
    const request = connectedGateway(), owner = document.createElement("div"), button = document.createElement("button");
    owner.setAttribute("data-hmi-faceplate", serializeHmiFaceplateBinding({ typeId: "motor", version: "1.0.0", tagBindings: {}, propertyValues: {} }));
    button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'Tags("LocalCounter").Write(Tags("LocalCounter").Read() + 1); HMIRuntime.Trace("local=" + Tags("LocalCounter").Read()); HMIRuntime.Timers.SetTimeout(function() { Tags("LocalCounter").Write(Tags("LocalCounter").Read() + 1); HMIRuntime.Trace("timer-local=" + Tags("LocalCounter").Read()); }, 5);' }]));
    owner.append(button); document.body.append(owner);
    const runtime = loadGeneratedRuntime(undefined, undefined, true), trace = vi.fn(), error = vi.fn();
    const stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace, error });
    try {
      await vi.waitFor(() => expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("10")); button.click();
      await vi.waitFor(() => expect(trace).toHaveBeenCalledWith("[HMI TIMER 1] timer-local=2")); expect(trace).toHaveBeenCalledWith("[HMI Tapped] local=1");
      expect(runtime.runtimeTagValues()).not.toHaveProperty("LocalCounter"); expect(request.mock.calls.filter(([input]) => String(input).endsWith("/write"))).toHaveLength(0); expect(error).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it("non applica navigazioni accumulate da un elemento rimosso durante l'attesa HTTP", async () => {
    let release!: () => void;
    const request = connectedGateway((init) => new Promise<Response>((resolve) => { release = () => resolve(new Response(JSON.stringify({ ...JSON.parse(String(init.body)), outcome: "delivered", delivery: "broker-ack", plcConfirmed: false }))); }));
    const button = document.createElement("button"); button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'HMIRuntime.UI.SysFct.ChangeScreen("/stale"); Tags("Motor.Speed").Write(20); Tags("Motor.Speed").Write(30);' }])); document.body.append(button);
    const runtime = loadGeneratedRuntime(undefined, undefined, true), trace = vi.fn(), navigate = vi.fn();
    const stop = runtime.installFramecraftHmiRuntime({ navigate, trace, error: vi.fn() });
    try {
      await vi.waitFor(() => expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("10")); button.click(); await vi.waitFor(() => expect(release).toBeTypeOf("function"));
      button.remove(); release();
      const fresh = document.createElement("button"); fresh.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'HMIRuntime.Trace("fresh-page");' }])); document.body.append(fresh); fresh.click();
      await vi.waitFor(() => expect(trace).toHaveBeenCalledWith("[HMI Tapped] fresh-page"));
      expect(navigate).not.toHaveBeenCalled(); expect(request.mock.calls.filter(([input]) => String(input).endsWith("/write"))).toHaveLength(1); expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("10");
    } finally { stop(); }
  });

  it("non avvia gateway o script connessi quando il pannello è dentro l'editor", async () => {
    const request = connectedGateway(); (window as Window & { __framecraftEditorPreview?: boolean }).__framecraftEditorPreview = true;
    const button = document.createElement("button"); button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'Tags("Motor.Speed").Write(20);' }, { event: "Loaded", script: 'Tags("Motor.Speed").Write(30);' }])); document.body.append(button);
    const runtime = loadGeneratedRuntime(undefined, undefined, true), stop = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: vi.fn() });
    try { button.click(); await settleEvents(); expect(request).not.toHaveBeenCalled(); } finally { stop(); }
  });

  it("applica il lampeggio nel pannello esportato e ripristina lo stile allo smontaggio", () => {
    const lamp = document.createElement("div");
    lamp.style.animation = "pulse 3s infinite";
    lamp.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{
      property: "BackColor", kind: "Flashing", conditionType: "None",
      color: "#FFFF0000", alternateColor: "#FF000000", flashingCondition: "Always", flashingRate: "Fast",
    }]));
    document.body.append(lamp);
    const runtime = loadGeneratedRuntime();
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: () => undefined, error: (message) => errors.push(message) });
    expect(lamp.style.animation).toContain("framecraft-hmi-flash-background 500ms");
    expect(lamp.style.getPropertyValue("--framecraft-hmi-flash-background-color")).toBe("#FF0000");
    expect(document.head.querySelector("style[data-framecraft-hmi-flashing]")?.textContent).toContain("prefers-reduced-motion: reduce");
    expect(errors).toEqual([]);
    dispose();
    expect(lamp.style.animation).toBe("pulse 3s infinite");
    expect(lamp.style.getPropertyValue("--framecraft-hmi-flash-background-color")).toBe("");
    expect(document.head.querySelector("style[data-framecraft-hmi-flashing]")).toBeNull();
  });

  it("rivaluta il lampeggio fuori limite quando cambia il tag Runtime", () => {
    const lamp = document.createElement("div");
    lamp.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{
      property: "BorderColor", kind: "Flashing", conditionType: "None",
      color: "#FFFFD60A", alternateColor: "#FFFF0000", flashingCondition: "RangeViolation", flashingRate: "Medium",
      tag: "Temperature", minimum: 10, maximum: 80,
    }]));
    document.body.append(lamp);
    const runtime = loadGeneratedRuntime();
    runtime.setRuntimeTagValue("Temperature", 42);
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: () => undefined, error: (message) => errors.push(message) });
    expect(lamp.style.animation).toBe("");
    runtime.setRuntimeTagValue("Temperature", 90);
    expect(lamp.style.animation).toContain("framecraft-hmi-flash-border 1000ms");
    expect(errors).toEqual([]);
    dispose();
  });

  it("esegue un evento, scrive il tag, rivaluta la dinamica e naviga", async () => {
    const lamp = document.createElement("div");
    lamp.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{
      property: "BackColor", kind: "Script", conditionType: "None",
      source: 'return Tags("Machine.State").Read() === 1 ? "#FF00A1D1" : "#FF808080";',
    }]));
    const button = document.createElement("button");
    button.setAttribute("data-hmi-events", serializeHmiEvents([{
      event: "Tapped",
      script: 'HMIRuntime.Tags.SysFct.SetTagValue("Machine.State", 1); HMIRuntime.Trace("avviato"); HMIRuntime.UI.SysFct.ChangeScreen("/settings");',
    }]));
    document.body.append(lamp, button);

    const runtime = loadGeneratedRuntime();
    const navigation: string[] = [];
    const traces: string[] = [];
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: (target) => navigation.push(target), trace: (message) => traces.push(message), error: (message) => errors.push(message) });
    button.click();
    await settleEvents();

    expect(runtime.runtimeTagValues()).toMatchObject({ "Machine.State": "1" });
    expect(lamp.style.backgroundColor).toBe("rgb(0, 161, 209)");
    expect(navigation).toEqual(["/settings"]);
    expect(traces).toContain("[HMI Tapped] avviato");
    expect(errors.filter((message) => !message.includes("non ha un valore di prova"))).toEqual([]);
    dispose();
  });

  it("esegue il doppio click e ferma reazioni native, lifecycle e azioni già accodate quando disabilitate", async () => {
    const owner = document.createElement("div");
    const button = document.createElement("button");
    button.setAttribute("data-hmi-events", serializeHmiEvents([
      { event: "DoubleTapped", script: 'HMIRuntime.Trace("doppio");' },
      { event: "Tapped", script: 'HMIRuntime.Trace("singolo");' },
      { event: "Loaded", script: 'HMIRuntime.Trace("caricato");' },
    ]));
    owner.dataset.fcReacts = "false"; owner.append(button); document.body.append(owner);
    const traces: string[] = []; const native = vi.fn();
    const runtime = loadGeneratedRuntime(); const dispose = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), error: vi.fn(), trace: (value) => { traces.push(value); } });
    button.addEventListener("click", native);
    button.click(); button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await settleEvents();
    expect(traces).toEqual([]); expect(native).not.toHaveBeenCalled();
    owner.dataset.fcReacts = "true";
    button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await settleEvents();
    expect(traces).toEqual(["[HMI DoubleTapped] doppio"]);
    button.click(); owner.dataset.fcReacts = "false"; await settleEvents();
    expect(traces).toEqual(["[HMI DoubleTapped] doppio"]);
    owner.dataset.fcReacts = "true"; owner.dataset.fcUserRequires = "parametri";
    button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await settleEvents(); expect(traces).toHaveLength(1);
    owner.dataset.fcUserGranted = "true"; button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await settleEvents(); expect(traces).toHaveLength(2);
    dispose(); button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await settleEvents(); expect(traces).toHaveLength(2);
  });

  it("esegue PropertyFlashing da eventi e dinamiche del Runtime senza modificare i colori base", async () => {
    const lamp = document.createElement("span"); lamp.dataset.hmiName = "M2400";
    lamp.style.backgroundColor = "rgb(12, 34, 56)"; lamp.style.animation = "pulse 3s infinite";
    lamp.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([
      { property: "BackColor", kind: "Flashing", color: "#FFFF0000", alternateColor: "#FF000000", flashingCondition: "Always" },
      { property: "BorderColor", kind: "Flashing", color: "#FFFF0000", alternateColor: "#FF000000", flashingCondition: "RangeViolation", tag: "Temperature", maximum: 80 },
      { property: "ForeColor", kind: "Script", source: 'item.PropertyFlashing("ForeColor", Tags("Fault").Read(), "#ffffff", "#000000"); return "#008000";' },
    ]));
    const start = document.createElement("button");
    start.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'Screen.Items("M2400").PropertyFlashing("BackColor", true, HMIRuntime.Math.RGB(255,0,0), HMIRuntime.Math.RGB(0,0,0), UI.Enums.HmiFlashingRate.Fast);' }]));
    const stop = document.createElement("button");
    stop.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'UI.ActiveScreen.Items("M2400").PropertyFlashing("BackColor", false);' }]));
    document.body.append(lamp, start, stop);
    const runtime = loadGeneratedRuntime(); runtime.setRuntimeTagValue("Temperature", 40); runtime.setRuntimeTagValue("Fault", false);
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: () => undefined, error: (message) => errors.push(message) });
    try {
      start.click(); await settleEvents();
      expect(lamp.style.animation).toContain("flash-background 500ms");
      expect(lamp.style.backgroundColor).toBe("rgb(12, 34, 56)");
      runtime.setRuntimeTagValue("Temperature", 90); runtime.setRuntimeTagValue("Fault", true);
      expect(lamp.style.animation).toContain("flash-border");
      expect(lamp.style.animation).toContain("flash-foreground");
      expect(lamp.style.color).toBe("rgb(0, 128, 0)");
      stop.click(); await settleEvents();
      expect(lamp.style.animation).not.toContain("flash-background");
      expect(lamp.style.animation).toContain("flash-border");
      runtime.setRuntimeTagValue("Temperature", 100);
      expect(lamp.style.animation).not.toContain("flash-background");
      expect(errors).toEqual([]);
    } finally { dispose(); }
    expect(lamp.style.animation).toBe("pulse 3s infinite");
    expect(lamp.style.backgroundColor).toBe("rgb(12, 34, 56)");
  });

  it("esegue get/set grafici reali negli eventi generati senza scritture PLC e compone le dinamiche", async () => {
    document.body.innerHTML = '<main data-hmi-screen="Main"><button data-hmi-name="M2400" style="width:80px;background-color:rgb(12,34,56);font-size:16px;font-family:Arial;font-weight:400;font-style:normal">Motore<svg /></button><button data-hmi-name="Start">Configura</button></main>';
    const motor = document.querySelector<HTMLButtonElement>('[data-hmi-name="M2400"]')!;
    const start = document.querySelector<HTMLButtonElement>('[data-hmi-name="Start"]')!;
    const icon = motor.querySelector("svg");
    motor.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'Tags("Command").Write(1);' }, { event: "KeyDown", script: 'Tags("Command").Write(1);' }]));
    motor.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{ property: "BackColor", kind: "Script", source: 'if (Tags("Temperature").Read() > 80) return "#0000ff"; return "#0c2238";' }]));
    start.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'const motor = Screen.Items("M2400"); motor.Text = "Pronto"; motor.Width = motor.Width + 10; motor.BackColor = HMIRuntime.Math.RGB(0,128,0); motor.Font.Name = "Courier New"; motor.Font.Size = 18.5; motor.Font.Weight = 700; motor.Font.Underline = true; motor.Enabled = false; HMIRuntime.Trace(motor.Name + ":" + motor.Width + ":" + motor.Text);' }]));
    const runtime = loadGeneratedRuntime(); runtime.setRuntimeTagValue("Temperature", 40); runtime.setRuntimeTagValue("Command", 0);
    const errors: string[] = [], traces: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: (message) => traces.push(message), error: (message) => errors.push(message) });
    try {
      start.click(); await settleEvents();
      expect(traces).toContain("[HMI Tapped] M2400:90:Pronto");
      expect(motor.style.fontFamily).toBe('"Courier New"'); expect(motor.style.fontSize).toBe("18.5px"); expect(motor.style.fontWeight).toBe("700");
      expect(motor.style.textDecorationLine).toBe("underline");
      expect(motor.style.width).toBe("90px"); expect(motor.style.backgroundColor).toBe("rgb(0, 128, 0)");
      expect(motor.textContent).toBe("Pronto"); expect(motor.querySelector("svg")).toBe(icon); expect(motor.disabled).toBe(true);
      motor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      motor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await settleEvents();
      expect(runtime.runtimeTagValues().Command).toBe("0");
      runtime.setRuntimeTagValue("Temperature", 90); await settleEvents();
      expect(motor.style.backgroundColor).toBe("rgb(0, 128, 0)");
      expect(errors).toEqual([]);
    } finally { dispose(); }
    expect(motor.textContent).toBe("Motore"); expect(motor.style.width).toBe("80px");
    expect(motor.style.fontFamily).toBe("Arial"); expect(motor.style.fontSize).toBe("16px"); expect(motor.style.fontWeight).toBe("400");
    expect(motor.style.textDecorationLine).toBe("");
    expect(motor.style.backgroundColor).toBe("rgb(0, 0, 255)"); expect(motor.disabled).toBe(false);
    expect(motor.querySelector("svg")).toBe(icon);
  });

  it("apre e chiude un popup faceplate nel Runtime esportato", async () => {
    const button = document.createElement("button");
    button.setAttribute("data-hmi-events", serializeHmiEvents([{
      event: "Tapped",
      script: [
        'let popup = UI.OpenFaceplateInPopup("Motor_V_1_0_0", "Motore M2400", { Speed: { Tag: "Motor.Speed" }, Enabled: true }, UI.ActiveScreen, false, "MotorPopup", false, 20, 30, 400, 260);',
        "popup.WindowFlags = popup.WindowFlags | UI.Enums.HmiWindowFlag.AlwaysInParent;",
      ].join("\n"),
    }]));
    document.body.append(button);
    const runtime = loadGeneratedRuntime();
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: () => undefined, error: (message) => errors.push(message) });
    button.click();
    await settleEvents();

    const popup = document.querySelector<HTMLElement>('[data-framecraft-runtime-popup-id="faceplate-popup-1"]')!;
    expect(popup).not.toBeNull();
    expect(popup.getAttribute("role")).toBe("dialog");
    expect(popup.style.left).toBe("20px");
    expect(popup.textContent).toContain("Motore M2400");
    expect(popup.textContent).toContain("Tag: Motor.Speed");
    expect(popup.querySelector('[data-hmi-faceplate-object="SpeedValue"]')).not.toBeNull();
    popup.querySelector<HTMLButtonElement>('button[aria-label="Chiudi popup"]')!.click();
    expect(document.querySelector('[data-framecraft-runtime-popup-id="faceplate-popup-1"]')).toBeNull();
    expect(errors).toEqual([]);
    dispose();
  });

  it("campiona e aggiorna un Trend Control anche nel Runtime esportato", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const config = defaultHmiTrendConfig();
    config.sampleIntervalMs = 100;
    config.timeRangeMs = 10_000;
    config.trends = [{ id: "temperature", name: "Temperatura", tag: "Oven.Temperature", source: "online", areaId: "area-1", color: "#D43D51", mode: "interpolated", axis: "left", visible: true }];
    const trend = document.createElement("div");
    trend.dataset.hmiTrend = serializeHmiTrendConfig(config);
    document.body.append(trend);
    const runtime = loadGeneratedRuntime();
    runtime.setRuntimeTagValue("Oven.Temperature", 20);
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: () => undefined, error: (message) => errors.push(message) });
    expect(trend.querySelector('[data-hmi-trend-series="temperature"]')).not.toBeNull();
    expect(trend.querySelector('[data-trend-source-field="tag"]')!.textContent).toContain("Runtime.Alternative");
    runtime.setRuntimeTagValue("Oven.Temperature", 35);
    vi.advanceTimersByTime(250);
    expect(trend.querySelector('[data-hmi-trend-series="temperature"]')?.getAttribute("d")).toContain("L");
    expect(errors).toEqual([]);
    dispose();
  });

  it("esegue il Function Trend X/Y generato usando i due tag Runtime", () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    const config = defaultHmiFunctionTrendConfig(); config.sampleIntervalMs = 100;
    config.trends[0].x.tag = "Motor.Speed"; config.trends[0].y.tag = "Motor.Temperature";
    const host = document.createElement("div"); host.dataset.hmiFunctionTrend = serializeHmiFunctionTrendConfig(config); document.body.append(host);
    const runtime = loadGeneratedRuntime(); runtime.setRuntimeTagValue("Motor.Speed", 20); runtime.setRuntimeTagValue("Motor.Temperature", 30);
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: () => undefined, error: (message) => errors.push(message) });
    runtime.setRuntimeTagValue("Motor.Speed", 50); runtime.setRuntimeTagValue("Motor.Temperature", 60); vi.advanceTimersByTime(250);
    expect(host.querySelector("[data-hmi-fx-series]")?.getAttribute("d")).toContain("L");
    expect(host.querySelector('[data-trend-source-coordinate="x"] [data-trend-source-field="tag"]')!.textContent).toContain("Runtime.Alternative");
    expect(host.textContent).toContain("2 punti"); expect(errors).toEqual([]); dispose();
  });

  it("archivia una variabile e alimenta una curva storica nel Runtime esportato", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const catalog: HmiDataLogCatalog = { version: 1, projectKey: "runtime-history", logs: [{
      id: "process", name: "Processo", enabled: true, storage: "memory", retentionMs: 60_000, maxEntries: 100, segmentDurationMs: 60_000,
      tags: [{ id: "temperature", name: "Temperatura", tag: "Oven.Temperature", mode: "on-change", cycleMs: 1_000, includeUnchanged: false, smoothingSamples: 1, aggregation: "none", aggregationWindowMs: 60_000 }],
    }] };
    const config = defaultHmiTrendConfig();
    config.online = false;
    config.timeRangeMs = 10_000;
    config.trends = [{ id: "history", name: "Temperatura storica", tag: "", source: "log", logId: "process", loggedTagId: "temperature", areaId: "area-1", color: "#D43D51", mode: "interpolated", axis: "left", visible: true }];
    const trend = document.createElement("div");
    trend.dataset.hmiTrend = serializeHmiTrendConfig(config);
    document.body.append(trend);
    const runtime = loadGeneratedRuntime(emptyHmiScriptCatalog(), catalog);
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: vi.fn(), trace: vi.fn(), error: vi.fn() });
    runtime.setRuntimeTagValue("Oven.Temperature", 20);
    vi.setSystemTime(2_000);
    runtime.setRuntimeTagValue("Oven.Temperature", 25);
    expect(trend.querySelector('[data-hmi-trend-series="history"]')?.getAttribute("d")).toContain("L");
    expect(trend.textContent).toContain("Temperatura storica · storico");
    expect(trend.querySelector('[data-trend-source-field="logId"]')!.textContent).toContain("Processo");
    dispose();
  });

  it("propaga Faceplate.RaiseEvent allo script dell'istanza con i parametri dichiarati", async () => {
    const faceplate = document.createElement("div");
    faceplate.setAttribute("data-hmi-faceplate", serializeHmiFaceplateBinding({
      typeId: "motor", version: "1.0.0", tagBindings: {}, propertyValues: {},
      eventBindings: { MotorSelected: { script: 'Tags("Faceplate.Selected").Write(index); HMIRuntime.Trace(interfaceEvent + ":" + motor);' } },
    }));
    const internalButton = document.createElement("button");
    internalButton.setAttribute("data-hmi-events", serializeHmiEvents([{
      event: "Tapped", script: 'Faceplate.RaiseEvent("MotorSelected", { index: 3, motor: "M2400" });',
    }]));
    faceplate.append(internalButton);
    document.body.append(faceplate);

    const runtime = loadGeneratedRuntime();
    const traces: string[] = [];
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: (message) => traces.push(message), error: (message) => errors.push(message) });
    internalButton.click();
    await settleEvents();
    await settleEvents();

    expect(runtime.runtimeTagValues()).toMatchObject({ "Faceplate.Selected": "3" });
    expect(traces).toContain("[HMI FACEPLATE MotorSelected] MotorSelected:M2400");
    expect(errors).toEqual([]);
    dispose();
  });

  it("mantiene i tag locali separati per ogni istanza faceplate", async () => {
    const createInstance = (target: string) => {
      const faceplate = document.createElement("div");
      faceplate.setAttribute("data-hmi-faceplate", serializeHmiFaceplateBinding({
        typeId: "motor", version: "1.0.0", tagBindings: {}, propertyValues: {},
        eventBindings: { Changed: { script: `Tags("${target}").Write(value);` } },
      }));
      const button = document.createElement("button");
      button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: [
        'const current = Tags("LocalCounter").Read();',
        'Tags("LocalCounter").Write(current + 1);',
        'Faceplate.RaiseEvent("Changed", { value: current + 1 });',
      ].join("\n") }]));
      faceplate.append(button);
      return { faceplate, button };
    };
    const first = createInstance("Instance.One");
    const second = createInstance("Instance.Two");
    document.body.append(first.faceplate, second.faceplate);
    const runtime = loadGeneratedRuntime();
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: () => undefined, error: (message) => errors.push(message) });

    first.button.click(); await settleEvents(); await settleEvents();
    first.button.click(); await settleEvents(); await settleEvents();
    second.button.click(); await settleEvents(); await settleEvents();

    expect(runtime.runtimeTagValues()).toMatchObject({ "Instance.One": "2", "Instance.Two": "1" });
    expect(runtime.runtimeTagValues()).not.toHaveProperty("LocalCounter");
    expect(errors).toEqual([]);
    dispose();
  });

  it("esegue una scrittura TagSet asincrona e rivaluta soltanto le dinamiche coinvolte", async () => {
    const speed = document.createElement("div");
    speed.setAttribute("data-hmi-dynamizations", serializeHmiDynamizations([{
      property: "Text", kind: "Script", conditionType: "None",
      source: 'return String(Tags("Machine.Speed").Read());',
    }]));
    const button = document.createElement("button");
    button.setAttribute("data-hmi-events", serializeHmiEvents([{
      event: "Tapped",
      script: 'let tags = Tags.CreateTagSet([["Machine.Speed", 1450], ["Machine.Running", true]]); tags.WriteAsync().then(function(result) { HMIRuntime.Trace("async=" + result.Count); });',
    }]));
    document.body.append(speed, button);

    const runtime = loadGeneratedRuntime();
    const errors: string[] = [];
    const traces: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: (message) => traces.push(message), error: (message) => errors.push(message) });
    button.click();
    await settleEvents();

    expect(runtime.runtimeTagValues()).toMatchObject({ "Machine.Speed": "1450", "Machine.Running": "true" });
    expect(speed.textContent).toBe("1450");
    expect(traces).toContain("[HMI Tapped] async=2");
    expect(errors.filter((message) => !message.includes("non ha un valore di prova"))).toEqual([]);
    dispose();
  });

  it("mantiene QCD fra eventi e mostra i messaggi operatore nella diagnostica Runtime", async () => {
    const write = document.createElement("button");
    write.setAttribute("data-hmi-events", serializeHmiEvents([{
      event: "Tapped",
      script: [
        'let tags = Tags.CreateTagSet([["Archive.Speed", 1500]]);',
        'tags.Item("Archive.Speed").QualityCode = 64;',
        'tags.Item("Archive.Speed").TimeStamp = "2026-09-25T14:00:00Z";',
        'tags.WriteQCD();',
        'Tags("Command.Format").WriteWithOperatorMessage(3, "Cambio formato");',
      ].join("\n"),
    }]));
    const inspect = document.createElement("button");
    inspect.setAttribute("data-hmi-events", serializeHmiEvents([{
      event: "Tapped",
      script: 'let tags = Tags.CreateTagSet(["Archive.Speed"]); tags.Read(); HMIRuntime.Trace(String(tags.Item("Archive.Speed").QualityCode) + "@" + String(tags.Item("Archive.Speed").TimeStamp));',
    }]));
    document.body.append(write, inspect);

    const runtime = loadGeneratedRuntime();
    const traces: string[] = [];
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: (message) => traces.push(message), error: (message) => errors.push(message) });
    write.click();
    await settleEvents();
    inspect.click();
    await settleEvents();

    expect(runtime.runtimeTagValues()).toMatchObject({ "Archive.Speed": "1500", "Command.Format": "3" });
    expect(traces).toContain("[HMI OPERATORE] Command.Format:  -> 3 · Cambio formato");
    expect(traces).toContain("[HMI Tapped] 64@2026-09-25T14:00:00Z");
    expect(errors).toEqual([]);
    dispose();
  });

  it("non si installa una seconda volta dentro l'anteprima Framecraft", () => {
    (window as Window & { __framecraftEditorPreview?: boolean }).__framecraftEditorPreview = true;
    const runtime = loadGeneratedRuntime();
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: () => undefined, error: () => undefined });
    expect(runtime.runtimeTagValues()).toEqual({});
    expect(dispose()).toBeUndefined();
  });

  it("riconosce GestureDetected e gli swipe legacy anche fuori dall'editor", async () => {
    const area = document.createElement("div");
    area.setAttribute("data-hmi-swipe-down", "1002_Downstair");
    area.setAttribute("data-hmi-events", serializeHmiEvents([{
      event: "GestureDetected",
      script: 'if (gesture == UI.Enums.HmiGesture.SwipeDown) Tags("Gesture.Code").Write(4);',
    }]));
    document.body.append(area);
    const runtime = loadGeneratedRuntime();
    const navigation: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: (target) => navigation.push(target), trace: () => undefined, error: () => undefined });
    area.dispatchEvent(touchPointer("pointerdown", 50, 40));
    area.dispatchEvent(touchPointer("pointerup", 54, 130));
    await settleEvents();
    expect(runtime.runtimeTagValues()).toMatchObject({ "Gesture.Code": "4" });
    expect(navigation).toEqual(["1002_Downstair"]);
    dispose();
  });

  it("esegue focus, tastiera, menu contestuale e comandi dei controlli", async () => {
    const control = document.createElement("button");
    control.setAttribute("data-hmi-events", serializeHmiEvents([
      { event: "Activated", script: 'Tags("Event.Activated").Write(true);' },
      { event: "Deactivated", script: 'Tags("Event.Deactivated").Write(true);' },
      { event: "ContextTapped", script: 'Tags("Event.Context").Write(true);' },
      { event: "KeyDown", script: 'if (key === "Enter") Tags("Event.KeyDown").Write(true);' },
      { event: "KeyUp", script: 'if (key === "Enter") Tags("Event.KeyUp").Write(true);' },
      { event: "HotKey", script: 'HMIRuntime.Trace("hotkey=" + key);' },
      { event: "InterfaceEvent", script: 'HMIRuntime.Trace("interface=" + interfaceEvent);' },
      { event: "CommandFired", script: 'HMIRuntime.Trace("command=" + command);' },
    ]));
    document.body.append(control);

    const runtime = loadGeneratedRuntime();
    const traces: string[] = [];
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: (message) => traces.push(message), error: (message) => errors.push(message) });
    control.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    control.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    control.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
    control.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    control.dispatchEvent(new CustomEvent("framecraft:interface-event", { bubbles: true, detail: "RecipeLoaded" }));
    control.dispatchEvent(new CustomEvent("framecraft:command-fired", { bubbles: true, detail: "Export" }));
    control.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await settleEvents();

    expect(runtime.runtimeTagValues()).toMatchObject({
      "Event.Activated": "true",
      "Event.Deactivated": "true",
      "Event.Context": "true",
      "Event.KeyDown": "true",
      "Event.KeyUp": "true",
    });
    expect(traces).toEqual(expect.arrayContaining([
      "[HMI HotKey] hotkey=Enter",
      "[HMI InterfaceEvent] interface=RecipeLoaded",
      "[HMI CommandFired] command=Export",
    ]));
    expect(errors).toEqual([]);
    dispose();
  });

  it("esegue Initialized, Loaded e Unloaded seguendo il ciclo DOM", async () => {
    const screen = document.createElement("section");
    screen.setAttribute("data-hmi-events", serializeHmiEvents([
      { event: "Initialized", script: 'HMIRuntime.Trace("initialized");' },
      { event: "Loaded", script: 'HMIRuntime.Trace("loaded");' },
      { event: "Unloaded", script: 'HMIRuntime.Trace("unloaded");' },
    ]));
    document.body.append(screen);
    const runtime = loadGeneratedRuntime();
    const traces: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: (message) => traces.push(message), error: () => undefined });
    await settleEvents();
    expect(traces).toEqual(expect.arrayContaining(["[HMI Initialized] initialized", "[HMI Loaded] loaded"]));

    screen.remove();
    await settleEvents();
    await settleEvents();
    expect(traces).toContain("[HMI Unloaded] unloaded");
    dispose();
  });

  it("esegue moduli globali e definizioni locali anche nel pannello esportato", async () => {
    window.history.replaceState({}, "", "/main");
    const catalog = parseHmiScriptCatalog({
      globalModules: [{ name: "Math", alias: "MathTools", functions: [{ name: "Double", parameters: ["value"], source: "return value * 2;" }] }],
      localDefinitions: [{ scope: "/main", context: "events", functions: [{ name: "Apply", parameters: ["value"], source: 'Tags("Module.Result").Write(value);' }] }],
    });
    const button = document.createElement("button");
    button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: "Local.Apply(Modules.MathTools.Double(21));" }]));
    document.body.append(button);
    const runtime = loadGeneratedRuntime(catalog);
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: () => undefined, error: (message) => errors.push(message) });
    button.click();
    await settleEvents();
    expect(runtime.runtimeTagValues()).toMatchObject({ "Module.Result": "42" });
    expect(errors).toEqual([]);
    dispose();
  });

  it("esegue nel pannello esportato un'operazione pianificata dal fronte di un tag", async () => {
    const catalog = parseHmiScriptCatalog({
      globalModules: [{ name: "Math", alias: "MathTools", functions: [{ name: "Double", parameters: ["value"], source: "return value * 2;" }] }],
      scheduledTasks: [{ id: "start", name: "Avvio linea", trigger: { kind: "tag", tag: "Command.Start", condition: "rising" }, script: 'Tags("Scheduler.Result").Write(Modules.MathTools.Double(6)); HMIRuntime.Trace("task");' }],
    });
    const runtime = loadGeneratedRuntime(catalog);
    const traces: string[] = [];
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: (message) => traces.push(message), error: (message) => errors.push(message) });
    runtime.setRuntimeTagValue("Command.Start", 0);
    runtime.setRuntimeTagValue("Command.Start", 1);
    await settleEvents();
    await settleEvents();
    expect(runtime.runtimeTagValues()).toMatchObject({ "Command.Start": "1", "Scheduler.Result": "12" });
    expect(traces).toContain("[HMI TASK Avvio linea] task");
    expect(errors).toEqual([]);
    dispose();
  });

  it("esegue nel pannello esportato una ricorrenza di calendario", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28, 8, 59, 59));
    const catalog = parseHmiScriptCatalog({ scheduledTasks: [
      { id: "daily", name: "Cambio turno", trigger: { kind: "calendar", frequency: "daily", time: "09:00:00" }, script: 'Tags("Scheduler.Shift").Write("day"); HMIRuntime.Trace(trigger);' },
    ] });
    const runtime = loadGeneratedRuntime(catalog);
    const traces: string[] = [];
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: (message) => traces.push(message), error: (message) => errors.push(message) });
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    expect(runtime.runtimeTagValues()).toMatchObject({ "Scheduler.Shift": "day" });
    expect(traces).toContain("[HMI TASK Cambio turno] calendar");
    expect(errors).toEqual([]);
    dispose();
  });

  it("riceve un cambio allarme nel Runtime esportato e applica il filtro Scheduler", async () => {
    const catalog = parseHmiScriptCatalog({ scheduledTasks: [
      { id: "critical", name: "Allarme critico", trigger: { kind: "alarm", criterion: "priority", condition: "greater-or-equal", operand: "12" }, script: 'Tags("Alarm.LastClass").Write(alarmClass); Tags("Alarm.LastPriority").Write(alarmPriority);' },
      { id: "outgoing", name: "Uscente", trigger: { kind: "alarm", criterion: "state", condition: "equals", operand: "Outgoing" }, script: 'Tags("Alarm.Outgoing").Write(true);' },
    ] });
    const runtime = loadGeneratedRuntime(catalog);
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: () => undefined, error: (message) => errors.push(message) });
    runtime.notifyRuntimeAlarm({ alarmClass: "Alarm", state: "Incoming", priority: 16, name: "M2400" });
    await settleEvents();
    await settleEvents();
    expect(runtime.runtimeTagValues()).toMatchObject({ "Alarm.LastClass": "Alarm", "Alarm.LastPriority": "16" });
    expect(runtime.runtimeTagValues()).not.toHaveProperty("Alarm.Outgoing");
    expect(errors).toEqual([]);
    dispose();
  });

  it("mantiene SetTimeout nel Runtime esportato e ne esegue la callback", async () => {
    vi.useFakeTimers();
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Clock", alias: "Clock", functions: [{ name: "Tick", parameters: [], source: 'Tags("Timer.Done").Write(true); HMIRuntime.Trace("scaduto");' }] }] });
    const button = document.createElement("button");
    button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'Tags("Timer.Id").Write(HMIRuntime.Timers.SetTimeout(Modules.Clock.Tick, 1000));' }]));
    document.body.append(button);
    const runtime = loadGeneratedRuntime(catalog);
    const traces: string[] = [];
    const errors: string[] = [];
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: (message) => traces.push(message), error: (message) => errors.push(message) });
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.runtimeTagValues()).toMatchObject({ "Timer.Id": "1" });
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    expect(runtime.runtimeTagValues()).toMatchObject({ "Timer.Done": "true" });
    expect(traces).toContain("[HMI TIMER 1] scaduto");
    expect(errors).toEqual([]);
    dispose();
  });
});
