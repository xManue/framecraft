// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { parseGuidedDataLogs, guidedDataLogSources, guidedLogBindingIssue } from "../src/core/guidedDataLogs";
import { defaultHmiDataLog, defaultHmiLoggingTag, type HmiDataLogCatalog, type HmiDataLogRuntime } from "../src/core/hmiDataLogs";
import * as deadbandFunctions from "../runtime/data-log-deadband.mjs";
import { newAiInterview, newGuidedPage, interviewConfig, interviewContext, interviewPrompt } from "../src/ai/aiInterview";
import { parseAiInterviewDraft, serializeAiInterviewDraft } from "../src/ai/aiInterviewDraft";
import { guidedPageSource, guidedProjectIssues } from "../src/core/guidedProject";
import { guidedReadBindings, guidedReadBindingIssues } from "../src/core/guidedReadBindings";
import { standardProjectFiles } from "../src/core/standardProject";
import { planPageNumber } from "../src/core/hmiPages";
import { parseSource } from "../src/source-parser/parseSource";
import { GuidedReadBindingFields, GuidedReadBindingsReview } from "../src/editor/GuidedReadBindings";
import { GuidedDataLogsReview } from "../src/editor/GuidedDataLogs";
import { AiProjectInterview } from "../src/editor/AiProjectInterview";
import { useEditorAi } from "../src/state/editorAi";
import { useEditorStore } from "../src/state/editorStore";
import type { PlcVariableDefinition } from "../src/core/plcVariables";

const tag = (name: string, dataType = "REAL"): PlcVariableDefinition => ({ name, dataType, access: "read", address: "SYNTHETIC_ADDRESS", description: "" });
function catalog(): HmiDataLogCatalog {
  return { version: 1, projectKey: "ORIGINAL_PROJECT_KEY", logs: [{ ...defaultHmiDataLog(), id: "process", name: "Archivio sintetico", storage: "memory", maxEntries: 1000,
    tags: [{ ...defaultHmiLoggingTag(), id: "x", name: "Misura X archiviata", tag: "MeasureX" }, { ...defaultHmiLoggingTag(), id: "y", name: "Misura Y archiviata", tag: "MeasureY" }, { ...defaultHmiLoggingTag(), id: "text", name: "Testo archiviato", tag: "Text" }] }] };
}
function fixture(kind: "trend" | "function-trend" = "trend") {
  const interview = newAiInterview(); interview.machineName = "Macchina sintetica"; interview.step = "page-1"; interview.spec.purpose = "Mostrare misure scelte";
  interview.spec.tagsMode = "import"; interview.spec.tags = [tag("MeasureX"), tag("MeasureY"), tag("Text", "STRING")]; interview.spec.dataLogs = catalog(); interview.spec.dataLogsFile = "synthetic.logs.json";
  interview.spec.pages = [{ ...newGuidedPage(0), title: "Andamento", kind, section: "statistics", imageNeed: "none", items: [{ label: "Misura", tag: "MeasureY", logged: { logId: "process", loggedTagId: "y" }, ...(kind === "function-trend" ? { xTag: "MeasureX", xLogged: { logId: "process", loggedTagId: "x" } } : {}) }] }];
  return interview;
}
function generated(interview = fixture()) {
  const files = standardProjectFiles(interviewConfig(interview)), source = files.find(file => file.path === "src/pages/GuidedPage1.tsx")!.content, document = parseSource("GuidedPage1.tsx", source);
  const control = Object.values(document.nodes).find(node => node.props["data-hmi-trend"] || node.props["data-hmi-function-trend"])!;
  return { files, source, config: JSON.parse(String(control.props["data-hmi-trend"] || control.props["data-hmi-function-trend"])) };
}
const initialAi = useEditorAi.getState(), initialEditor = useEditorStore.getState();
let host: HTMLDivElement | undefined, root: Root | undefined;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); useEditorAi.setState(initialAi, true); useEditorStore.setState({ ...initialEditor, loading: false }, true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host?.remove(); host = undefined; vi.restoreAllMocks(); vi.useRealTimers(); useEditorAi.setState(initialAi, true); useEditorStore.setState(initialEditor, true); });
async function mount(component: Parameters<Root["render"]>[0]) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(component)); }

it("importa configurazioni vere senza campioni o normalizzazioni silenziose", () => {
  const value = catalog(); expect(parseGuidedDataLogs(JSON.stringify(value), fixture().spec.tags)).toEqual(value);
  expect(guidedDataLogSources(value).map(source => source.loggedTagId)).toEqual(["x", "y", "text"]);
  expect(value.projectKey).toBe("ORIGINAL_PROJECT_KEY");
});

it("importa filtri e override nella pipeline del pannello e include la loro implementazione", () => {
  const interview = fixture(), c = interview.spec.dataLogs!; c.logs[0].deadband = { mode: "percentage", value: 20 }; c.logs[0].tags[2].deadband = { mode: "none", value: 0 };
  expect(parseGuidedDataLogs(JSON.stringify(c), interview.spec.tags)).toEqual(c);
  const { files } = generated(interview), exported = JSON.parse(files.find(file => file.path === "framecraft.logs.json")!.content);
  expect(exported.logs[0].deadband).toEqual(c.logs[0].deadband); expect(exported.logs[0].tags[2].deadband).toEqual({ mode: "none", value: 0 });
  expect(files.some(file => file.path === "runtime/data-log-deadband.mjs")).toBe(true); expect(files.some(file => file.path === "runtime/data-log-deadband.d.mts")).toBe(true);
  delete c.logs[0].tags[2].deadband; expect(() => parseGuidedDataLogs(c, interview.spec.tags)).toThrow(/numerico/);
});

it("il nuovo pannello include Data Log del servizio importati e i moduli necessari a leggerli", () => {
  const interview = fixture(); interview.spec.dataLogs!.logs[0].storage = "runtime"; expect(parseGuidedDataLogs(interview.spec.dataLogs, interview.spec.tags).logs[0].storage).toBe("runtime"); const { files } = generated(interview); expect(JSON.parse(files.find(file => file.path === "framecraft.logs.json")!.content).logs[0].storage).toBe("runtime"); expect(files.some(file => file.path === "runtime/data-log-store.mjs")).toBe(true); expect(files.some(file => file.path === "src/framecraftHmiDataLogClient.ts")).toBe(true);
});
it.each(["version", "extra", "samples", "storage", "cycle", "entries", "missing", "duplicate", "duplicate-tag"])("rifiuta un catalogo non supportato: %s", change => {
  const value = JSON.parse(JSON.stringify(catalog()));
  if (change === "version") value.version = 2;
  if (change === "extra") value.endpoint = "never-invent.invalid";
  if (change === "samples") value.logs[0].samples = [{ value: 42 }];
  if (change === "storage") value.logs[0].storage = "database";
  if (change === "cycle") value.logs[0].tags[0].cycleMs = 100;
  if (change === "entries") value.logs[0].maxEntries = 1_000_000_000;
  if (change === "missing") delete value.logs[0].tags[0].mode;
  if (change === "duplicate") value.logs.push({ ...value.logs[0] });
  if (change === "duplicate-tag") value.logs[0].tags.push({ ...value.logs[0].tags[0] });
  expect(() => parseGuidedDataLogs(value, fixture().spec.tags)).toThrow("Catalogo Data Log"); expect(() => parseGuidedDataLogs("{bad")).toThrow("JSON non leggibile");
});
it("verifica tag e trigger leggibili e dichiarati, senza sostituirli con variabili rilevate", () => {
  const value = catalog(), tags = fixture().spec.tags;
  expect(() => parseGuidedDataLogs(value, [])).toThrow("catalogo tag importato");
  expect(() => parseGuidedDataLogs(value, tags.map(tag => ({ ...tag, detected: true })))).toThrow("dichiarato");
  expect(() => parseGuidedDataLogs(value, tags.map(tag => ({ ...tag, access: "write" })))).toThrow("leggibile");
  value.logs[0].tags[0].triggerTag = "Missing"; expect(() => parseGuidedDataLogs(value, tags)).toThrow("trigger");
});
it.each([undefined, ""])("non sostituisce un operando di trigger mancante con un valore predefinito (%s)", operand => {
  const value = catalog(); value.logs[0].tags[0].triggerCondition = "equals"; value.logs[0].tags[0].triggerValue = operand;
  expect(() => parseGuidedDataLogs(value)).toThrow("valore esplicito");
  value.logs[0].tags[0].triggerValue = "0"; expect(parseGuidedDataLogs(value).logs[0].tags[0].triggerValue).toBe("0");
});
it("genera la sorgente log e conserva le impostazioni, con spazio di archiviazione nuovo", () => {
  const interview = fixture(), first = generated(interview), second = generated(interview);
  expect(first.config.trends[0]).toMatchObject({ source: "log", tag: "MeasureY", logId: "process", loggedTagId: "y" });
  const logs = JSON.parse(first.files.find(file => file.path === "framecraft.logs.json")!.content), next = JSON.parse(second.files.find(file => file.path === "framecraft.logs.json")!.content);
  expect(logs.logs).toEqual(JSON.parse(JSON.stringify(interview.spec.dataLogs!.logs))); expect(logs.projectKey).not.toBe("ORIGINAL_PROJECT_KEY"); expect(logs.projectKey).not.toBe(next.projectKey);
  expect(interview.spec.dataLogs!.projectKey).toBe("ORIGINAL_PROJECT_KEY");
  expect(JSON.parse(first.files.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false); expect(first.source).not.toMatch(/requestRuntimeTagWrite|writeTag/);
});
it("permette una sorgente diversa per ogni asse X/Y senza forzare entrambi all’online", () => {
  const interview = fixture("function-trend"); delete interview.spec.pages[0].items[0].xLogged;
  const { config } = generated(interview); expect(config.trends[0].x).toEqual({ source: "online", tag: "MeasureX" }); expect(config.trends[0].y).toMatchObject({ source: "log", tag: "MeasureY", logId: "process", loggedTagId: "y" });
});
it.each(["disabled", "missing", "remapped", "wrong-type"])("blocca un riferimento archivio obsoleto o incompatibile: %s", change => {
  const interview = fixture(); if (change === "disabled") interview.spec.dataLogs!.logs[0].enabled = false;
  if (change === "missing") interview.spec.dataLogs!.logs[0].tags = [];
  if (change === "remapped") interview.spec.dataLogs!.logs[0].tags[1].tag = "MeasureX";
  if (change === "wrong-type") interview.spec.tags[1].dataType = "STRING";
  expect(guidedProjectIssues(interview.spec).length).toBeGreaterThan(0); expect(() => interviewConfig(interview)).toThrow();
  expect(() => guidedPageSource(interview.spec.pages[0], planPageNumber("statistics", [])!, "Test", undefined, interview.spec.tags, interview.spec.requirements, interview.spec.dataLogs)).toThrow();
});
it("riferimenti vuoti restano da completare e metadati malformati non diventano sorgenti online", () => {
  const interview = fixture(); interview.spec.pages[0].items[0] = { label: "Dopo", tag: "", logged: { logId: "", loggedTagId: "" } };
  expect(guidedReadBindingIssues(interview.spec.pages[0], interview.spec.tags, interview.spec.dataLogs)).toEqual([]); expect(generated(interview).config.trends[0].tag).toBe("");
  expect(guidedLogBindingIssue(null as never, "MeasureY", catalog())).toContain("non valido");
  interview.spec.pages[0].items[0].logged = null as never; expect(() => interviewConfig(interview)).toThrow("non valido");
});
it("conserva catalogo e riferimenti nella bozza, ma non accetta campioni o campi extra recuperati", () => {
  const interview = fixture("function-trend"), restored = parseAiInterviewDraft(serializeAiInterviewDraft(interview)).interview;
  expect(restored.spec.dataLogs).toEqual(interview.spec.dataLogs); expect(restored.spec.pages[0].items).toEqual(interview.spec.pages[0].items);
  const value = JSON.parse(serializeAiInterviewDraft(interview)); value.interview.spec.dataLogs.samples = [1]; expect(() => parseAiInterviewDraft(JSON.stringify(value))).toThrow("non supportati");
});
it("non trasmette all’AI catalogo, nomi tag, indirizzi o chiave di archiviazione", () => {
  const interview = fixture("function-trend"), context = interviewContext(interview);
  expect(context.data).toMatchObject({ dataLogCount: 1, loggedTagCount: 3 }); expect(context.pages[0].elements[0]).toMatchObject({ source: "log", xSource: "log" });
  expect(interviewPrompt(interview)).not.toMatch(/MeasureX|MeasureY|SYNTHETIC_ADDRESS|ORIGINAL_PROJECT_KEY|Archivio sintetico|Misura X archiviata/);
});
it("scegliere Archivio non seleziona da solo una variabile; tornare Online elimina il riferimento", async () => {
  const interview = fixture(); delete interview.spec.pages[0].items[0].logged; const page = interview.spec.pages[0], onChange = vi.fn();
  await mount(createElement(GuidedReadBindingFields, { page, tags: interview.spec.tags, dataLogs: interview.spec.dataLogs, onChange }));
  const source = host!.querySelector<HTMLSelectElement>("#ai-read-tag-page-1-0-source")!; await act(async () => { source.value = "log"; source.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(onChange.mock.calls[0][0][0]).toEqual({ label: "Misura", tag: "", logged: { logId: "", loggedTagId: "" } });
  await act(async () => root!.render(createElement(GuidedReadBindingFields, { page: fixture().spec.pages[0], tags: interview.spec.tags, dataLogs: interview.spec.dataLogs, onChange })));
  const choice = host!.querySelector<HTMLSelectElement>("#ai-read-tag-page-1-0")!; expect(choice.querySelectorAll("option")).toHaveLength(3);
  await act(async () => { source.value = "online"; source.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(onChange.mock.calls.at(-1)![0][0]).toEqual({ label: "Misura", tag: "" });
});
it("mantiene visibile la sorgente obsoleta e permette una correzione esplicita", async () => {
  const interview = fixture(); interview.spec.dataLogs!.logs[0].tags[1].tag = "MeasureX"; const onChange = vi.fn();
  await mount(createElement(GuidedReadBindingFields, { page: interview.spec.pages[0], tags: interview.spec.tags, dataLogs: interview.spec.dataLogs, onChange }));
  const select = host!.querySelector<HTMLSelectElement>("#ai-read-tag-page-1-0")!; expect(select.getAttribute("aria-invalid")).toBe("true"); expect(host!.textContent).toContain("non corrisponde");
  await act(async () => { select.value = JSON.stringify(["process", "x"]); select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(onChange).toHaveBeenCalledWith([{ label: "Misura", tag: "MeasureX", logged: { logId: "process", loggedTagId: "x" } }]);
});
it("mostra modalità e limiti reali e distingue lettura configurata da storico disponibile", async () => {
  const interview = fixture(), onEdit = vi.fn(); await mount(createElement("div", null, createElement(GuidedDataLogsReview, { catalog: interview.spec.dataLogs }), createElement(GuidedReadBindingsReview, { spec: interview.spec, onEdit })));
  expect(host!.textContent).toContain("solo memoria di sessione"); expect(host!.textContent).toContain("massimo 1000"); expect(host!.textContent).toContain("7 giorni"); expect(host!.textContent).toContain("non campioni precedenti"); expect(host!.textContent).toContain("Archivio: Archivio sintetico");
  expect(guidedReadBindings(interview.spec)[0]).toMatchObject({ source: "log", state: "configured" });
});
it("il questionario importa solo un catalogo valido e conserva quello precedente su errore", async () => {
  const interview = fixture(); interview.step = "data"; const propose = vi.fn(); useEditorAi.setState({ interview, mode: "create", propose }); await mount(createElement(AiProjectInterview));
  const input = host!.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
  Object.defineProperty(input, "files", { configurable: true, value: [{ name: "bad.logs.json", size: 10, text: async () => '{"samples":[42]}' }] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true }))); expect(useEditorAi.getState().interview.spec.dataLogs).toEqual(interview.spec.dataLogs); expect(host!.textContent).toContain("Catalogo Data Log");
  const value = catalog(); value.logs[0].maxEntries = 200;
  Object.defineProperty(input, "files", { value: [{ name: "new.logs.json", size: 100, text: async () => JSON.stringify(value) }] }); await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(useEditorAi.getState().interview.spec.dataLogs!.logs[0].maxEntries).toBe(200); expect(propose).not.toHaveBeenCalled();
});
it("cambiare catalogo non rimappa la curva; un tipo o riferimento incompatibile revoca la proposta", () => {
  const interview = fixture(), config = interviewConfig(interview); useEditorAi.setState({ interview, mode: "create", proposal: { version: 1, mode: "create", summary: "Piano", project: config, questions: [], warnings: [], operations: [], provenance: [], decisions: [] }, resolvedInterview: interview });
  const next = structuredClone(interview); next.spec.dataLogs!.logs[0].tags[1].tag = "MeasureX"; useEditorAi.getState().updateInterview(next);
  expect(useEditorAi.getState().proposal).toBeUndefined(); expect(next.spec.pages[0].items[0].tag).toBe("MeasureY");
});
it("il Runtime generato acquisisce e disegna campioni reali dall’archivio scelto", () => {
  vi.useFakeTimers(); const { files, config } = generated(), load = (path: string) => {
    const output: Record<string, unknown> = {}, source = files.find(file => file.path === path)!.content;
    new Function("exports", "require", transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText)(output, (name: string) => { if (name === "../runtime/data-log-deadband.mjs") return deadbandFunctions; throw Error(`Unexpected generated dependency: ${name}`); }); return output;
  };
  let at = 1000; const logCatalog = JSON.parse(files.find(file => file.path === "framecraft.logs.json")!.content);
  const create = load("src/framecraftHmiDataLogs.ts").createHmiDataLogRuntime as (catalog: HmiDataLogCatalog, options: unknown) => HmiDataLogRuntime;
  const runtime = create(logCatalog, { now: () => at }), values = { MeasureY: "10" }; runtime.start(() => ({ values })); runtime.updateSnapshot(values); at = 2000; values.MeasureY = "20"; runtime.updateSnapshot(values);
  host = document.createElement("div"); host.setAttribute("data-hmi-trend", JSON.stringify(config)); document.body.append(host);
  const render = load("src/framecraftHmiTrend.ts").renderHmiTrendControls as (root: Document, values: unknown, options: unknown) => number;
  const main = files.find(file => file.path === "src/framecraftHmiRuntime.ts")!.content, start = main.indexOf("function renderTrendControls()"), end = main.indexOf("\nfunction dynamizations(", start);
  expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
  const code = transpileModule(main.slice(start, end), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const draw = new Function("document", "values", "tagStatus", "plcCatalogJson", "dataLogCatalogJson", "dataLogRuntime", "renderHmiTrendControls", "renderHmiFunctionTrendControls", "viewProfileConfig", "viewProfileStore", "queryRuntimeDataLogs", "serviceDataLogs", code + "\nreturn renderTrendControls;")(document, {}, {}, { variables: fixture().spec.tags }, logCatalog, runtime, (doc: Document, values: unknown, options: Record<string, unknown>) => render(doc, values, { ...options, now: at }), () => {}, { namespace: "synthetic" }, {}, (logId: string, tagId: string, from: number, to: number, previous: boolean) => runtime.query(logId, tagId, from, to, previous), undefined);
  draw(); expect(runtime.query("process", "y")).toHaveLength(2); expect(host.querySelector('[data-hmi-trend-series="curve-1"]')?.getAttribute("d")).toMatch(/^M.+L/); runtime.stop();
});
