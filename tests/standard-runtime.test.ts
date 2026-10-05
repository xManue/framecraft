// @vitest-environment jsdom

import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import { createHmiGatewayClient } from "../src/core/hmiGateway";

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

function loadGeneratedScriptRuntime(): typeof import("../src/core/hmiScript") {
  const source = standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] })
    .find((file) => file.path === "src/framecraftScriptRuntime.ts")!.content;
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as typeof import("../src/core/hmiScript");
}

function loadGeneratedScriptModules(): { hmiScriptFunctions: typeof hmiScriptFunctions; createHmiScriptContextManager: typeof createHmiScriptContextManager } {
  const source = standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] })
    .find((file) => file.path === "src/framecraftScriptModules.ts")!.content;
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", "require", javascript)(exports, module, (id: string) => {
    if (id === "./framecraftScriptRuntime") return loadGeneratedScriptRuntime();
    throw new Error(`Dipendenza generata non prevista: ${id}`);
  });
  return module.exports as ReturnType<typeof loadGeneratedScriptModules>;
}

function loadGeneratedTimers(): typeof createHmiTimerManager {
  const source = standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] })
    .find((file) => file.path === "src/framecraftHmiTimers.ts")!.content;
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return (module.exports as { createHmiTimerManager: typeof createHmiTimerManager }).createHmiTimerManager;
}

function loadGeneratedPopups(): { createHmiFaceplatePopupDomSurface: typeof createHmiFaceplatePopupDomSurface; createHmiFaceplatePopupManager: typeof createHmiFaceplatePopupManager } {
  const source = standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] })
    .find((file) => file.path === "src/framecraftHmiPopups.ts")!.content;
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as ReturnType<typeof loadGeneratedPopups>;
}

function loadGeneratedFaceplateVisuals(): { renderHmiFaceplates: typeof renderHmiFaceplates } {
  const source = standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] })
    .find((file) => file.path === "src/framecraftHmiFaceplateVisuals.ts")!.content;
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { renderHmiFaceplates: typeof renderHmiFaceplates };
}

function loadGeneratedTrend(): { renderHmiTrendControls: typeof renderHmiTrendControls } {
  const source = standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] })
    .find((file) => file.path === "src/framecraftHmiTrend.ts")!.content;
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { renderHmiTrendControls: typeof renderHmiTrendControls };
}

function loadGeneratedFunctionTrend(): { renderHmiFunctionTrendControls: typeof renderHmiFunctionTrendControls } {
  const source = standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] }).find((file) => file.path === "src/framecraftHmiFunctionTrend.ts")!.content;
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {}; const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { renderHmiFunctionTrendControls: typeof renderHmiFunctionTrendControls };
}

function loadGeneratedDataLogs(): { createHmiDataLogRuntime: typeof createHmiDataLogRuntime } {
  const source = standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] })
    .find((file) => file.path === "src/framecraftHmiDataLogs.ts")!.content;
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { createHmiDataLogRuntime: typeof createHmiDataLogRuntime };
}

function loadGeneratedSchedule(): { hmiAlarmMatches: typeof hmiAlarmMatches; nextHmiCalendarDue: typeof nextHmiCalendarDue } {
  const source = standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] })
    .find((file) => file.path === "src/framecraftHmiSchedule.ts")!.content;
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { hmiAlarmMatches: typeof hmiAlarmMatches; nextHmiCalendarDue: typeof nextHmiCalendarDue };
}

function loadGeneratedFlashing(): { hmiFlashingCss: typeof hmiFlashingCss; hmiFlashingInlineStyle: typeof hmiFlashingInlineStyle; resolveHmiFlashing: typeof resolveHmiFlashing } {
  const source = standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] })
    .find((file) => file.path === "src/framecraftHmiFlashing.ts")!.content;
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {};
  const module = { exports };
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as { hmiFlashingCss: typeof hmiFlashingCss; hmiFlashingInlineStyle: typeof hmiFlashingInlineStyle; resolveHmiFlashing: typeof resolveHmiFlashing };
}

function loadGeneratedRuntime(scriptCatalog: HmiScriptCatalog = emptyHmiScriptCatalog(), dataLogCatalog: HmiDataLogCatalog = emptyHmiDataLogCatalog("runtime-test"), gatewayEnabled = false): GeneratedRuntime {
  const source = standardProjectFiles({ machineName: "Runtime", layout: "desktop", sections: ["main"] })
    .find((file) => file.path === "src/framecraftHmiRuntime.ts")!.content
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
    .replace('import plcCatalogJson from "../framecraft.plc.json";', 'const plcCatalogJson = { variables: [{ name: "Runtime.Alternative" }, { name: "Motor.Speed" }] };')
    .replace('import runtimeCatalogJson from "../framecraft.runtime.json";', 'const runtimeCatalogJson = { gateway: { enabled: ' + gatewayEnabled + ', pollMs: 100 } };')
    .replace('import { createHmiGatewayClient, type HmiGatewaySample, type HmiGatewaySnapshot } from "./framecraftGateway";', "const createHmiGatewayClient = globalThis.__framecraftTestGateway;");
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
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
  new Function("exports", "module", javascript)(exports, module);
  return module.exports as unknown as GeneratedRuntime;
}

const touchPointer = (type: string, x: number, y: number) => {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerType: { value: "touch" }, pointerId: { value: 11 }, isPrimary: { value: true } });
  return event;
};
const settleEvents = () => new Promise((resolve) => setTimeout(resolve, 0));

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
  delete (window as Window & { __framecraftEditorPreview?: boolean }).__framecraftEditorPreview;
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Runtime del pannello standard generato", () => {
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
    const runtime = loadGeneratedRuntime(undefined, undefined, true), errors = vi.fn();
    const dispose = runtime.installFramecraftHmiRuntime({ navigate: () => undefined, trace: () => undefined, error: errors });
    try {
      await vi.waitFor(() => expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("10"));
      expect(document.querySelector("[data-framecraft-gateway-status]")!.textContent).toBe("MQTT 1/1");
      expect(await runtime.requestRuntimeTagWrite("Motor.Speed", 30)).toMatchObject({ outcome: "delivered", plcConfirmed: false });
      expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("10"); expect(runtime.runtimeTagStatus()["Motor.Speed"].qualityCode).toBe(192);
      expect(document.querySelector("[data-framecraft-command-status]")!.textContent).toContain("non confermato dal PLC"); expect(errors).not.toHaveBeenCalled();
      await expect(runtime.requestRuntimeTagWrite("Unknown.Tag", 1)).rejects.toThrow("non autorizzata");
      expect(document.querySelector("[data-framecraft-command-status]")!.textContent).toContain("non autorizzata");
      const button = document.createElement("button");
      button.setAttribute("data-hmi-events", serializeHmiEvents([{ event: "Tapped", script: 'const tags = Tags.CreateTagSet(["Motor.Speed"]); tags("Motor.Speed").Value = 99; await tags.WriteAsync(); HMIRuntime.Trace("PLC_ACK");' }])); document.body.append(button);
      const before = request.mock.calls.filter(([input]) => String(input).endsWith("/write")).length;
      button.click(); await vi.waitFor(() => expect(errors).toHaveBeenCalledWith(expect.stringContaining("non ancora integrata")));
      expect(request.mock.calls.filter(([input]) => String(input).endsWith("/write"))).toHaveLength(before);
      expect(runtime.runtimeTagValues()["Motor.Speed"]).toBe("10");
    } finally { dispose(); }
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
