// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readFile: vi.fn(), writeFile: vi.fn() } }));

import { defaultHmiFunctionTrendConfig, serializeHmiFunctionTrendConfig } from "../src/core/hmiFunctionTrend";
import { defaultHmiTrendConfig, serializeHmiTrendConfig } from "../src/core/hmiTrend";
import { defaultHmiDataLog, defaultHmiLoggingTag, emptyHmiDataLogCatalog } from "../src/core/hmiDataLogs";
import { PlcVariablesPanel } from "../src/editor/PlcVariablesPanel";
import { parseSource } from "../src/source-parser/parseSource";
import { useEditorStore } from "../src/state/editorStore";
import { parseHmiScriptCatalog } from "../src/core/hmiScriptModules";

describe("simulazione PLC dei trend", () => {
  it("spiega la prova locale anche quando è spenta, senza promettere un simulatore del programma PLC", async () => {
    const before = useEditorStore.getState(); const container = document.createElement("div"); const root = createRoot(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    try {
      useEditorStore.setState({ project: undefined, document: undefined, simulation: { ...before.simulation, on: false } });
      await act(async () => root.render(createElement(PlcVariablesPanel)));
      expect(container.textContent).toContain("Non esegue il programma PLC");
      expect(container.textContent).toContain("non legge né invia comandi alla macchina");
      expect(container.querySelector(".plc-sim-run")?.textContent).toContain("Attiva valori di prova");
      expect(container.querySelector<HTMLButtonElement>(".plc-sim-run")?.disabled).toBe(true);
    } finally { await act(async () => root.unmount()); useEditorStore.setState(before); }
  });

  it("offre i tag nei membri annidati e nelle funzioni che restituiscono dati", async () => {
    const scripts = parseHmiScriptCatalog({ globalModules: [{
      name: "Data", alias: "Data",
      globalDefinition: { source: "const cfg = { sources: [Tags('Speed'), Tags('Backup')] }; const unused = Tags('Unused');" },
      functions: [{ name: "Get", parameters: [], source: "return cfg;" }],
    }] });
    const before = useEditorStore.getState(), container = document.createElement("div"), root = createRoot(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    try {
      useEditorStore.setState({ project: undefined, document: undefined, previewPath: "/", scriptCatalog: scripts, dataLogCatalog: emptyHmiDataLogCatalog(), simulation: { ...before.simulation, on: true, elements: [{ instanceId: "label", dynamizations: [{ property: "Text", kind: "Script", source: "const cfg = Modules.Data.Get(); return cfg.sources[Tags('Index').Read()].Read();" }] }], values: {}, status: {}, unresolved: [] } });
      await act(async () => root.render(createElement(PlcVariablesPanel)));
      const tags = [...container.querySelectorAll<HTMLInputElement>('input[aria-label^="Valore simulato"]')].map((field) => field.getAttribute("aria-label")?.replace("Valore simulato ", ""));
      expect(tags).toEqual(["Backup", "Index", "Speed"]);
      expect(tags).not.toContain("Unused");
    } finally { await act(async () => root.unmount()); useEditorStore.setState(before); }
  });
  it("offre i tag di moduli pubblici, contesti locali, inizializzatori e Scheduler attivo", async () => {
    const scripts = parseHmiScriptCatalog({
      globalModules: [{ name: "Values", alias: "Values", globalDefinition: { source: "export const speed = Tags('Speed'); export const initial = Tags('Startup.Module').Read(); let secret = 42; const unused = Tags('Unused');" }, functions: [] }],
      localDefinitions: [
        { scope: "/settings", context: "events", globalDefinition: { source: "const start = Tags('Startup.Events').Read();" }, functions: [] },
        { scope: "/settings", context: "dynamizations", globalDefinition: { source: "const start = Tags('Startup.Dynamics').Read();" }, functions: [{ name: "Read", parameters: [], source: "return Modules.Values.speed.Read() + start;" }] },
        { scope: "/other", context: "events", globalDefinition: { source: "const start = Tags('Other.Page').Read();" }, functions: [] },
      ],
      schedulerDefinition: { source: "const start = Tags('Startup.Scheduler').Read();" },
      scheduledTasks: [
        { id: "active", name: "Active", trigger: { kind: "tag", tag: "Schedule.Trigger", condition: "changed" }, script: 'Tags("Scheduled.Output").Write(Modules.Values.speed.Read());' },
        { id: "disabled", name: "Disabled", enabled: false, trigger: { kind: "tag", tag: "Disabled.Trigger", condition: "changed" }, script: 'Tags("Disabled.Output").Write(1);' },
      ],
    });
    const event = JSON.stringify([{ event: "Tapped", script: 'Tags("Command").Write(Modules.Values.speed.Read());' }]);
    const source = `export function Page(){return <button data-hmi-events='${event}'/>}`;
    const before = useEditorStore.getState();
    const container = document.createElement("div"), root = createRoot(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    try {
      useEditorStore.setState({ project: undefined, document: parseSource("src/Page.tsx", source), previewPath: "/settings", scriptCatalog: scripts, dataLogCatalog: emptyHmiDataLogCatalog(), simulation: { ...before.simulation, on: true, elements: [{ instanceId: "label", dynamizations: [{ property: "Text", kind: "Script", source: "return Local.Read();" }] }], values: {}, status: {}, unresolved: [] } });
      await act(async () => root.render(createElement(PlcVariablesPanel)));
      const tags = [...container.querySelectorAll<HTMLInputElement>('input[aria-label^="Valore simulato"]')].map((field) => field.getAttribute("aria-label")?.replace("Valore simulato ", ""));
      expect(tags).toEqual(["Command", "Schedule.Trigger", "Scheduled.Output", "Speed", "Startup.Dynamics", "Startup.Events", "Startup.Module", "Startup.Scheduler"]);
      for (const unused of ["Other.Page", "Unused", "secret", "Disabled.Trigger", "Disabled.Output"]) expect(tags).not.toContain(unused);
    } finally { await act(async () => root.unmount()); useEditorStore.setState(before); }
  });

  it("offre sorgenti X/Y, trend temporali e tag/trigger dei log senza inventare segnali", async () => {
    const fx = defaultHmiFunctionTrendConfig(); fx.trends[0].x.tag = "Motor.X"; fx.trends[0].y.tag = "Motor.Y";
    const time = defaultHmiTrendConfig(); time.trends[0].tag = "Motor.Temperature";
    const source = `export function Page(){return <><div data-hmi-function-trend='${serializeHmiFunctionTrendConfig(fx)}'/><div data-hmi-trend='${serializeHmiTrendConfig(time)}'/></>}`;
    const logs = emptyHmiDataLogCatalog(); const log = defaultHmiDataLog(); const tag = defaultHmiLoggingTag();
    log.id = "process"; tag.id = "speed"; tag.tag = "Motor.Speed"; tag.mode = "on-demand"; tag.triggerTag = "Motor.Capture"; log.tags = [tag]; logs.logs = [log, { ...log, id: "disabled", enabled: false, tags: [{ ...tag, tag: "Disabled.Signal", triggerTag: "Disabled.Trigger" }] }];
    const before = useEditorStore.getState();
    useEditorStore.setState({ project: undefined, document: parseSource("src/Page.tsx", source), dataLogCatalog: logs, simulation: { ...before.simulation, on: true, elements: [], values: {}, status: {}, unresolved: [] } });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); const container = document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(PlcVariablesPanel)));
    const fields = [...container.querySelectorAll<HTMLInputElement>('input[aria-label^="Valore simulato"]')];
    expect(fields.map((field) => field.getAttribute("aria-label"))).toEqual(["Motor.Capture", "Motor.Speed", "Motor.Temperature", "Motor.X", "Motor.Y"].map((tag) => `Valore simulato ${tag}`));
    expect(container.textContent).toContain("array JSON come [10,20,30]");
    await act(async () => root.unmount()); useEditorStore.setState({ project: before.project, document: before.document, dataLogCatalog: before.dataLogCatalog, simulation: before.simulation });
  });
});
