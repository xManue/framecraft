// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { guidedItemLimit, guidedPageKinds, guidedPageSource, guidedProjectIssues, guidedProjectPending } from "../src/core/guidedProject";
import { guidedReadBindingIssues, guidedReadBindings, guidedReadBindingTags } from "../src/core/guidedReadBindings";
import { defaultHmiFunctionTrendConfig, hmiFunctionTrendIssues, parseHmiFunctionTrendConfig } from "../src/core/hmiFunctionTrend";
import { newAiInterview, newGuidedPage, interviewConfig, interviewContext, interviewPrompt, interviewSteps, interviewStepIssues } from "../src/ai/aiInterview";
import { parseAiInterviewDraft, serializeAiInterviewDraft } from "../src/ai/aiInterviewDraft";
import { resolveInterviewDelegation, toggleInterviewDelegation } from "../src/ai/aiDelegation";
import { standardProjectFiles } from "../src/core/standardProject";
import { planPageNumber } from "../src/core/hmiPages";
import { guidedTemplateBehavior } from "../src/core/templateBehavior";
import { withGuidedItemLabels } from "../src/core/guidedCommands";
import { parseSource } from "../src/source-parser/parseSource";
import { GuidedReadBindingFields, GuidedReadBindingsReview } from "../src/editor/GuidedReadBindings";
import { AiProjectInterview } from "../src/editor/AiProjectInterview";
import { useEditorAi } from "../src/state/editorAi";
import { useEditorStore } from "../src/state/editorStore";
import type { PlcVariableDefinition } from "../src/core/plcVariables";

const tag = (name: string, dataType = "REAL", access: PlcVariableDefinition["access"] = "read"): PlcVariableDefinition => ({ name, dataType, access, address: "SYNTHETIC_ADDRESS", description: "" });
function fixture() {
  const interview = newAiInterview(); interview.machineName = "Macchina sintetica"; interview.step = "page-1"; interview.spec.purpose = "Correlare due misure scelte";
  interview.spec.tagsMode = "import"; interview.spec.tags = [tag("MeasureX"), tag("MeasureY", "INT"), tag("Text", "STRING"), tag("Flag", "BOOL"), tag("WriteOnly", "REAL", "write")];
  interview.spec.pages = [{ ...newGuidedPage(0), title: "Correlazione", kind: "function-trend", section: "statistics", imageNeed: "none", items: [{ label: "Misure", xTag: "MeasureX", tag: "MeasureY" }] }];
  return interview;
}
function generated(interview = fixture()) {
  const files = standardProjectFiles(interviewConfig(interview)), source = files.find(file => file.path === "src/pages/GuidedPage1.tsx")!.content;
  const document = parseSource("GuidedPage1.tsx", source), control = Object.values(document.nodes).find(node => node.props["data-hmi-type"] === "HmiFunctionTrendControl")!;
  return { files, source, config: parseHmiFunctionTrendConfig(control.props["data-hmi-function-trend"])! };
}
const initialAi = useEditorAi.getState(), initialEditor = useEditorStore.getState();
let host: HTMLDivElement | undefined, root: Root | undefined;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); useEditorAi.setState(initialAi, true); useEditorStore.setState({ ...initialEditor, loading: false }, true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host?.remove(); host = undefined; vi.restoreAllMocks(); useEditorAi.setState(initialAi, true); useEditorStore.setState(initialEditor, true); });
async function mount(component: Parameters<Root["render"]>[0]) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(component)); }

it("offre una base X/Y distinta dal trend temporale e ne conosce limiti e domande", () => {
  expect(guidedPageKinds.find(kind => kind.id === "function-trend")).toMatchObject({ section: "statistics", image: "" }); expect(guidedItemLimit("function-trend")).toBe(9);
  const interview = fixture(); expect(interviewSteps(interview).some(step => step.id === "req-trends")).toBe(true);
  const behavior = guidedTemplateBehavior("function-trend")!; expect(behavior.implementation).toBe("configured-inputs");
  expect(behavior.purpose).toContain("non del tempo"); expect(behavior.limits.join(" ")).toContain("collaudati");
  expect(interviewConfig(interview).guided!.requirements!.answers).toMatchObject({ "trends.range": "60000", "trends.sample": "1000", "trends.source": "online" });
});
it("genera un controllo reale con X e Y separati, senza scale, dati o comandi inventati", () => {
  const { files, source, config } = generated(), base = defaultHmiFunctionTrendConfig();
  expect(config.caption).toBe("Correlazione"); expect(config.trends).toHaveLength(1);
  expect(config.trends[0]).toMatchObject({ name: "Misure", x: { source: "online", tag: "MeasureX" }, y: { source: "online", tag: "MeasureY" }, pairToleranceMs: base.trends[0].pairToleranceMs });
  expect(config.areas).toEqual(base.areas); expect(hmiFunctionTrendIssues(config, fixture().spec.tags).filter(issue => issue.severity === "error")).toEqual([]);
  expect(source).toContain('data-hmi-template-id="guided:function-trend"'); expect(source).not.toMatch(/HmiTrendControl|<img|requestRuntimeTagWrite|writeTag/);
  expect(JSON.parse(files.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
  expect(JSON.parse(files.find(file => file.path === "framecraft.plc.json")!.content).variables).toEqual(fixture().spec.tags);
  expect(JSON.parse(files.find(file => file.path === "framecraft.requirements.json")!.content).pages[0].items[0]).toMatchObject({ xTag: "MeasureX", tag: "MeasureY" });
});
it("applica intervallo e campionamento a tutte le curve senza cambiare la geometria degli assi", () => {
  const interview = fixture(); interview.spec.requirements!.answers = { "trends.range": "3600000", "trends.sample": "5000" };
  interview.spec.pages[0].items.push({ label: "Altra curva", xTag: "MeasureY", tag: "MeasureX" });
  const { config } = generated(interview); expect(config.sampleIntervalMs).toBe(5000);
  expect(config.trends.map(curve => curve.range.durationMs)).toEqual([3600000, 3600000]); expect(config.trends.map(curve => curve.id)).toEqual(["curve-1", "curve-2"]);
  expect(config.areas[0].xAxis).toEqual({ scale: "linear" }); expect(config.trends[0].range.kind).toBe("rolling");
});
it.each(["xTag", "tag"] as const)("rifiuta il tipo non numerico sul lato %s anche senza passare dalla UI", field => {
  const interview = fixture(); interview.spec.pages[0].items[0][field] = "Text";
  expect(interviewStepIssues(interview, "page-1")[0]).toContain(field === "xTag" ? "asse X" : "asse Y");
  expect(() => interviewConfig(interview)).toThrow("tag numerico");
  expect(() => guidedPageSource(interview.spec.pages[0], planPageNumber("statistics", [])!, "XY", undefined, interview.spec.tags)).toThrow("tag numerico");
  const config = interviewConfig(fixture()); config.guided!.pages[0].items[0][field] = "WriteOnly"; expect(() => standardProjectFiles(config)).toThrow("sola scrittura");
});
it("controlla separatamente entrambi gli assi ed esclude array, BOOL, testi, tag rilevati e duplicati", () => {
  const interview = fixture(), page = interview.spec.pages[0]; expect(guidedReadBindingTags(page.kind, interview.spec.tags).map(tag => tag.name)).toEqual(["MeasureX", "MeasureY"]);
  const catalog = [tag("Array", "ARRAY[0..3] OF REAL"), { ...tag("Detected"), detected: true }, tag("Duplicate"), tag("Duplicate")];
  expect(guidedReadBindingTags(page.kind, catalog)).toEqual([]); page.items[0] = { label: "Due errori", xTag: "Text", tag: "Flag" };
  expect(guidedReadBindingIssues(page, interview.spec.tags)).toHaveLength(2);
});
it("lascia esplicitamente incompleto ogni asse mancante senza collegamenti automatici", () => {
  const interview = fixture(); interview.spec.pages[0].items[0].xTag = "";
  expect(guidedProjectIssues(interview.spec)).toEqual([]); expect(guidedReadBindings(interview.spec).map(row => [row.axis, row.state])).toEqual([["X", "unmapped"], ["Y", "configured"]]);
  expect(guidedProjectPending(interview.spec).some(item => item.includes("asse X non collegato"))).toBe(true);
  expect(generated(interview).config.trends[0].x.tag).toBe("");
  interview.spec.pages[0].items[0].tag = ""; expect(guidedProjectPending(interview.spec).some(item => item.includes("asse Y non collegato"))).toBe(true);
});
it("la pagina senza curve crea soltanto la configurazione vuota del controllo", () => {
  const interview = fixture(); interview.spec.pages[0].items = []; interview.spec.pages[0].itemsDeferred = true; interview.spec.requirements!.answers["trends.range"] = "600000";
  const { config } = generated(interview); expect(config.trends[0].x.tag).toBe(""); expect(config.trends[0].y.tag).toBe(""); expect(config.trends[0].range.durationMs).toBe(600000);
});
it("blocca più di nove curve e i campi X su pagine che non sono X/Y", () => {
  const interview = fixture(); interview.spec.pages[0].items = Array.from({ length: 10 }, (_, index) => ({ label: String(index), tag: "MeasureY", xTag: "MeasureX" }));
  expect(() => interviewConfig(interview)).toThrow("massimo 9");
  const page = fixture().spec.pages[0]; page.kind = "values"; expect(guidedReadBindingIssues(page, fixture().spec.tags)[0]).toContain("pagina X/Y");
  expect(() => guidedPageSource(page, planPageNumber("statistics", [])!, "Bad", undefined, fixture().spec.tags)).toThrow("pagina X/Y");
});
it("recupera entrambi i mapping nella bozza locale, senza aggiungere autorità AI o rete", () => {
  const interview = fixture(), restored = parseAiInterviewDraft(serializeAiInterviewDraft(interview)).interview;
  expect(restored.spec.pages[0]).toEqual(interview.spec.pages[0]); expect(interviewConfig(restored).guided!.pages[0].items[0].xTag).toBe("MeasureX");
  const bad = JSON.parse(serializeAiInterviewDraft(interview)); bad.interview.spec.pages[0].items[0].xTag = { value: "MeasureX" }; expect(() => parseAiInterviewDraft(JSON.stringify(bad))).toThrow("non supportati");
});
it("l’AI conosce i due collegamenti, ma non riceve nomi tag o indirizzi", () => {
  const interview = fixture(), context = interviewContext(interview); expect(context.pages[0].elements[0].xy).toEqual({ xLinked: true, yLinked: true });
  expect(context.templates[0].id).toBe("guided:function-trend"); expect(interviewPrompt(interview)).not.toMatch(/MeasureX|MeasureY|SYNTHETIC_ADDRESS/);
  interview.spec.pages[0].items[0].xTag = ""; expect(interviewContext(interview).pages[0].elements[0].xy).toEqual({ xLinked: false, yLinked: true });
});
it("le etichette delegate o rinominate non ereditano mapping dalle vecchie righe", () => {
  const interview = toggleInterviewDelegation(fixture(), "page.page-1.items"), resolved = resolveInterviewDelegation(interview, [{ key: "page.page-1.items", value: '["Curva proposta"]' }]);
  expect(generated(resolved).config.trends[0]).toMatchObject({ x: { tag: "" }, y: { tag: "" } });
  const items = [...fixture().spec.pages[0].items, { label: "Seconda", tag: "MeasureX", xTag: "MeasureY" }];
  expect(withGuidedItemLabels(items, ["Seconda", "Misure"])).toEqual([items[1], items[0]]);
  expect(withGuidedItemLabels(items, ["Nuova"])).toEqual([{ label: "Nuova", tag: "" }]);
});
it("l’AI può proporre la nuova base in un piano delegato senza inventare sorgenti", () => {
  const interview = toggleInterviewDelegation(newAiInterview(), "pages"); interview.machineName = "Scelto"; interview.spec.purpose = "Correlare";
  const resolved = resolveInterviewDelegation(interview, [{ key: "pages", value: JSON.stringify([{ title: "Curva", kind: "function-trend", section: "statistics" }]) }]);
  expect(interviewConfig(resolved).guided!.pages[0]).toMatchObject({ kind: "function-trend", items: [], itemsDeferred: true });
  expect(generated(resolved).config.trends[0].x.tag).toBe("");
});
it("i campi X e Y hanno etichette, errori indipendenti e non modificano l’altro lato", async () => {
  const interview = fixture(), page = interview.spec.pages[0]; page.items[0].xTag = "Text"; const onChange = vi.fn();
  await mount(createElement(GuidedReadBindingFields, { page, tags: interview.spec.tags, onChange }));
  const x = host!.querySelector<HTMLSelectElement>("#ai-read-x-tag-page-1-0")!, y = host!.querySelector<HTMLSelectElement>("#ai-read-tag-page-1-0")!; expect(x.value).toBe("Text"); expect(y.value).toBe("MeasureY"); expect(x.getAttribute("aria-invalid")).toBe("true"); expect(y.getAttribute("aria-invalid")).toBe("false");
  expect(host!.querySelector(`#${x.getAttribute("aria-describedby")}`)?.textContent).toContain("asse X");
  expect(host!.querySelector(`label[for="${x.id}"]`)?.textContent).toContain("Asse X"); expect(host!.querySelector(`label[for="${y.id}"]`)?.textContent).toContain("Asse Y");
  expect(x.querySelector('option[value="Text"]')?.hasAttribute("disabled")).toBe(true); expect(y.querySelector('option[value="Flag"]')).toBeNull();
  await act(async () => { x.value = "MeasureX"; x.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(onChange).toHaveBeenCalledExactlyOnceWith([{ label: "Misure", xTag: "MeasureX", tag: "MeasureY" }]); expect(page.items[0].xTag).toBe("Text");
});
it("rivede due righe distinte per curva, senza nascondere un asse da completare", async () => {
  const interview = fixture(); interview.spec.pages[0].items[0].xTag = ""; const onEdit = vi.fn();
  await mount(createElement(GuidedReadBindingsReview, { spec: interview.spec, onEdit }));
  expect(host!.querySelectorAll("li")).toHaveLength(2); expect(host!.querySelector("summary")?.textContent).toContain("1 impostate · 1 da collegare");
  expect(host!.textContent).toContain("asse X"); expect(host!.textContent).toContain("asse Y"); expect(host!.textContent).not.toContain("SYNTHETIC_ADDRESS");
  await act(async () => host!.querySelector("button")!.click()); expect(onEdit).toHaveBeenCalledWith("page-1");
});
it("un tipo X cambiato invalida la proposta e la correzione avviene senza inferenza", async () => {
  const interview = fixture(), config = interviewConfig(interview), propose = vi.fn();
  useEditorAi.setState({ mode: "create", interview, propose, busy: false, proposal: { version: 1, mode: "create", summary: "Scelto", project: config, questions: [], warnings: [], operations: [], provenance: [], decisions: [] }, resolvedInterview: interview });
  useEditorAi.getState().updateInterview({ ...interview, spec: { ...interview.spec, tags: interview.spec.tags.map(tag => tag.name === "MeasureX" ? { ...tag, dataType: "STRING" } : tag) } });
  expect(useEditorAi.getState().proposal).toBeUndefined(); await mount(createElement(AiProjectInterview));
  const x = host!.querySelector<HTMLSelectElement>("#ai-read-x-tag-page-1-0")!, next = [...host!.querySelectorAll("button")].find(button => button.textContent?.includes("Avanti"))!;
  expect(next.disabled).toBe(true); await act(async () => { x.value = "MeasureY"; x.dispatchEvent(new Event("change", { bubbles: true })); }); expect(next.disabled).toBe(false); expect(propose).not.toHaveBeenCalled();
});
it("rinviare il catalogo rimuove entrambi i mapping senza lasciare un asse fantasma", async () => {
  const interview = fixture(); interview.step = "data"; const propose = vi.fn(); useEditorAi.setState({ interview, mode: "create", propose });
  await mount(createElement(AiProjectInterview)); const mode = host!.querySelector("select")!;
  await act(async () => { mode.value = "later"; mode.dispatchEvent(new Event("change", { bubbles: true })); });
  const spec = useEditorAi.getState().interview.spec; expect(spec.tags).toEqual([]); expect(spec.pages[0].items[0]).toMatchObject({ tag: "", xTag: "" }); expect(propose).not.toHaveBeenCalled();
});
it.each([true, false])("reimportando i tag conserva solo gli assi ancora dichiarati (X presente: %s)", async keepX => {
  const interview = fixture(); interview.step = "data"; const propose = vi.fn(); useEditorAi.setState({ interview, mode: "create", propose });
  await mount(createElement(AiProjectInterview)); const input = host!.querySelector<HTMLInputElement>('input[type="file"]')!;
  const variables = [tag("MeasureY"), ...(keepX ? [tag("MeasureX")] : [])], file = { name: "synthetic.json", size: 100, text: async () => JSON.stringify({ version: 1, variables }) };
  Object.defineProperty(input, "files", { value: [file] }); await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(useEditorAi.getState().interview.spec.pages[0].items[0]).toMatchObject({ tag: "MeasureY", xTag: keepX ? "MeasureX" : "" }); expect(propose).not.toHaveBeenCalled();
  expect(interview.spec.pages[0].items[0].xTag).toBe("MeasureX");
});
it("il modulo Runtime realmente generato acquisisce le coppie e le esporta senza collegarsi al PLC", () => {
  const { files, config } = generated(), source = files.find(file => file.path === "src/framecraftHmiFunctionTrend.ts")!.content;
  const exports: { renderHmiFunctionTrendControls?: (root: Document, values: Record<string, string>, options: unknown) => number } = {};
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  new Function("exports", javascript)(exports);
  host = document.createElement("div"); host.setAttribute("data-hmi-function-trend", JSON.stringify(config)); document.body.append(host); const exportCsv = vi.fn(), render = exports.renderHmiFunctionTrendControls!;
  render(document, { MeasureX: "10", MeasureY: "30" }, { now: 1000, exportCsv }); render(document, { MeasureX: "20", MeasureY: "50" }, { now: 2000, exportCsv });
  expect(host.querySelector('[data-hmi-fx-series="curve-1"]')).not.toBeNull(); expect(host.textContent).toContain("2 punti");
  host.querySelector<HTMLButtonElement>('[data-hmi-fx-action="export"]')!.click(); expect(exportCsv.mock.calls[0][1]).toContain("MeasureX;MeasureY;10;30"); expect(exportCsv.mock.calls[0][1]).toContain("MeasureX;MeasureY;20;50");
  expect(config.areas[0].xAxis.minimum).toBeUndefined();
});
