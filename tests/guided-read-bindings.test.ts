// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { guidedReadBindings, guidedReadBindingIssues, guidedReadBindingTags } from "../src/core/guidedReadBindings";
import { guidedPageSource, guidedProjectIssues, type GuidedPageKind } from "../src/core/guidedProject";
import { newAiInterview, newGuidedPage, interviewConfig, interviewContext, interviewStepIssues } from "../src/ai/aiInterview";
import { standardProjectFiles } from "../src/core/standardProject";
import { planPageNumber } from "../src/core/hmiPages";
import { parseSource } from "../src/source-parser/parseSource";
import { GuidedReadBindingFields, GuidedReadBindingsReview } from "../src/editor/GuidedReadBindings";
import { AiProjectInterview } from "../src/editor/AiProjectInterview";
import { useEditorAi } from "../src/state/editorAi";
import { useEditorStore } from "../src/state/editorStore";
import type { PlcVariableDefinition } from "../src/core/plcVariables";

const tag = (name: string, dataType = "REAL", access: PlcVariableDefinition["access"] = "read"): PlcVariableDefinition => ({ name, dataType, access, address: "SYNTHETIC_ADDRESS", description: "Dato sintetico" });
const tags = [tag("Speed"), tag("Name", "STRING"), tag("Running", "BOOL"), tag("Command", "INT", "write"), tag("Structure", "UDT"), { ...tag("Detected"), detected: true }];
function fixture(kind: GuidedPageKind = "trend", binding = "Speed") {
  const interview = newAiInterview(); interview.machineName = "Macchina sintetica"; interview.step = "page-1";
  interview.spec.purpose = "Verificare i collegamenti dei controlli"; interview.spec.tagsMode = "import"; interview.spec.tags = tags.map(tag => ({ ...tag }));
  // Detected/unsupported tags are local fixtures, not a catalogue sent to a driver.
  interview.spec.pages = [{ ...newGuidedPage(0), kind, title: "Valori macchina", section: kind === "trend" ? "statistics" : "settings", imageNeed: "none", items: [{ label: "Velocità", tag: binding }] }];
  return interview;
}
const initialAi = useEditorAi.getState(), initialEditor = useEditorStore.getState();
let host: HTMLDivElement | undefined, root: Root | undefined;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); useEditorAi.setState(initialAi, true); useEditorStore.setState({ ...initialEditor, loading: false }, true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host?.remove(); host = undefined; vi.restoreAllMocks(); useEditorAi.setState(initialAi, true); useEditorStore.setState(initialEditor, true); });
async function mount(component: Parameters<Root["render"]>[0]) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(component)); }

it.each(["SINT", "USINT", "BYTE", "INT", "UINT", "WORD", "DINT", "UDINT", "DWORD", "REAL", "LREAL", "Float", "Double"])("una curva accetta il tipo numerico scalare supportato %s", dataType => {
  expect(guidedReadBindingTags("trend", [tag("Value", dataType)])).toHaveLength(1);
  expect(guidedReadBindingIssues({ kind: "trend", items: [{ label: "Curva", tag: "Value" }] }, [tag("Value", dataType)])).toEqual([]);
});
it.each(["BOOL", "Boolean", "STRING", "WSTRING", "ARRAY[0..2] OF REAL", "UDT", "LINT", "NUMBER", "", " REAL "])("una curva rifiuta il tipo incompatibile %s senza convertirlo", dataType => {
  const catalog = [tag("Value", dataType)]; expect(guidedReadBindingTags("trend", catalog)).toEqual([]);
  expect(guidedReadBindingIssues({ kind: "trend", items: [{ label: "Curva", tag: "Value" }] }, catalog)[0]).toContain("tag numerico scalare");
  expect(catalog[0].dataType).toBe(dataType);
});
it("valori e targhette accettano testo/BOOL scalari, ma non tag solo scrivibili, strutture o rilevati", () => {
  expect(guidedReadBindingTags("values", tags).map(tag => tag.name)).toEqual(["Speed", "Name", "Running"]);
  expect(guidedReadBindingTags("synoptic", tags).map(tag => tag.name)).toEqual(["Speed", "Name", "Running"]);
  expect(guidedReadBindingTags("trend", tags).map(tag => tag.name)).toEqual(["Speed"]);
  expect(guidedReadBindingTags("commands", tags)).toEqual([]); expect(guidedReadBindingTags("alarms", tags)).toEqual([]);
});
it("i duplicati dichiarati sono ambigui, mentre un rilevato non sostituisce una dichiarazione", () => {
  expect(guidedReadBindingTags("values", [tag("Same"), tag("Same", "INT")])).toEqual([]);
  expect(guidedReadBindingTags("values", [tag("Same"), { ...tag("Same"), detected: true }])).toHaveLength(1);
  expect(guidedReadBindingIssues({ kind: "values", items: [{ label: "Dato", tag: "Missing" }] }, tags)[0]).toContain("dichiarato una sola volta");
});
it("un elemento scollegato resta incompleto, senza scegliere un tag automaticamente", () => {
  const interview = fixture("trend", ""); expect(guidedProjectIssues(interview.spec)).toEqual([]);
  expect(guidedReadBindings(interview.spec)[0]).toMatchObject({ state: "unmapped", tag: "", issue: undefined });
  expect(interview.spec.pages[0].items[0].tag).toBe("");
});
it("blocca il piano e la generazione se il tipo non è compatibile con la curva", () => {
  const interview = fixture("trend", "Name"); expect(interviewStepIssues(interview, "page-1")[0]).toContain("tag numerico");
  expect(() => interviewConfig(interview)).toThrow("tag numerico");
  const config = interviewConfig(fixture()); config.guided!.pages[0].items[0].tag = "Name";
  expect(() => standardProjectFiles(config)).toThrow("tag numerico");
  expect(() => guidedPageSource(interview.spec.pages[0], planPageNumber("statistics", [])!, "GuidedTest", undefined, tags)).toThrow("tag numerico");
});
it("il generatore non attiva un driver e conserva il mapping numerico e il catalogo scelti", () => {
  const config = interviewConfig(fixture()), generated = standardProjectFiles(config);
  const source = generated.find(file => file.path === "src/pages/GuidedPage1.tsx")!.content;
  const document = parseSource("GuidedPage1.tsx", source), trend = Object.values(document.nodes).find(node => node.props["data-hmi-type"] === "HmiTrendControl")!;
  expect(JSON.parse(trend.props["data-hmi-trend"] as string).trends[0].tag).toBe("Speed");
  expect(source).not.toMatch(/writeTag|requestRuntimeTagWrite/);
  expect(JSON.parse(generated.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
  expect(JSON.parse(generated.find(file => file.path === "framecraft.plc.json")!.content).variables[0].address).toBe("SYNTHETIC_ADDRESS");
  expect(JSON.stringify(interviewContext(fixture()))).not.toMatch(/SYNTHETIC_ADDRESS|"Speed"|"Name"|"Running"/);
});
it("il riepilogo distingue configurato, non collegato e invalido e non include i comandi", () => {
  const interview = fixture(); interview.spec.pages[0].items.push({ label: "Nome non numerico", tag: "Name" }, { label: "Da scegliere", tag: "" });
  interview.spec.pages.push({ ...newGuidedPage(1), title: "Comando", kind: "commands", section: "manuals", imageNeed: "none", items: [{ label: "Avvia", tag: "Command" }] });
  expect(guidedReadBindings(interview.spec).map(row => row.state)).toEqual(["configured", "invalid", "unmapped"]);
});
it("tiene visibile un collegamento invalido e mostra solo alternative compatibili", async () => {
  const page = fixture("trend", "Name").spec.pages[0], onChange = vi.fn(); await mount(createElement(GuidedReadBindingFields, { page, tags, onChange }));
  const select = host!.querySelector<HTMLSelectElement>("#ai-read-tag-page-1-0")!; expect(select.value).toBe("Name"); expect(select.getAttribute("aria-invalid")).toBe("true");
  expect(host!.querySelector('option[value="Name"]')?.hasAttribute("disabled")).toBe(true); expect(host!.querySelector('option[value="Running"]')).toBeNull();
  expect(host!.querySelector(`#${select.getAttribute("aria-describedby")}`)?.textContent).toContain("tag numerico"); expect(host!.querySelector<HTMLLabelElement>(`label[for="${select.id}"]`)?.htmlFor).toBe(select.id);
  await act(async () => { select.value = "Speed"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(onChange).toHaveBeenCalledExactlyOnceWith([{ label: "Velocità", tag: "Speed" }]); expect(page.items[0].tag).toBe("Name");
});
it("il riepilogo mostra i tag reali locali e permette di rivedere la pagina giusta", async () => {
  const interview = fixture(), onEdit = vi.fn(); await mount(createElement(GuidedReadBindingsReview, { spec: interview.spec, onEdit }));
  expect(host!.querySelector("summary")?.textContent).toContain("1 impostate"); expect(host!.textContent).toContain("Speed"); expect(host!.textContent).not.toContain("SYNTHETIC_ADDRESS");
  expect(host!.textContent).toContain("collaudo macchina restano separati"); await act(async () => host!.querySelector("button")!.click()); expect(onEdit).toHaveBeenCalledWith("page-1");
});
it("la procedura corregge il mapping senza inviare richieste AI o alterare altri tag", async () => {
  const interview = fixture("trend", "Name"), propose = vi.fn(); useEditorAi.setState({ interview, mode: "create", open: true, propose, busy: false, connecting: false, checking: false, account: undefined, proposal: undefined });
  await mount(createElement(AiProjectInterview)); const select = host!.querySelector<HTMLSelectElement>('#ai-read-tag-page-1-0')!;
  expect(select.value).toBe("Name"); const next = [...host!.querySelectorAll("button")].find(button => button.textContent?.includes("Avanti"))!; expect(next.disabled).toBe(true);
  await act(async () => { select.value = "Speed"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(useEditorAi.getState().interview.spec.pages[0].items[0].tag).toBe("Speed"); expect(next.disabled).toBe(false); expect(propose).not.toHaveBeenCalled();
  expect(useEditorAi.getState().interview.spec.tags).toEqual(interview.spec.tags);
});
it("un tipo diventato incompatibile invalida anche una proposta AI già pronta", () => {
  const interview = fixture(), config = interviewConfig(interview), propose = vi.fn();
  useEditorAi.setState({ mode: "create", interview, propose, busy: false, resolvedInterview: interview, proposal: { version: 1, mode: "create", summary: "Piano", project: config, questions: [], warnings: [], operations: [], provenance: [], decisions: [] } });
  useEditorAi.getState().updateInterview({ ...interview, spec: { ...interview.spec, tags: interview.spec.tags.map(tag => tag.name === "Speed" ? { ...tag, dataType: "STRING" } : tag) } });
  expect(useEditorAi.getState().proposal).toBeUndefined(); expect(interviewStepIssues(useEditorAi.getState().interview, "review")[0]).toContain("tag numerico"); expect(propose).not.toHaveBeenCalled();
});
it("i tipi anomali non producono messaggi enormi e il catalogo originale resta intatto", () => {
  const interview = fixture(); interview.spec.tags[0].dataType = "X".repeat(20_000);
  const row = guidedReadBindings(interview.spec)[0]; expect(row.state).toBe("invalid"); expect(row.dataType).toHaveLength(80); expect(row.issue!.length).toBeLessThan(400);
  expect(interview.spec.tags[0].dataType).toHaveLength(20_000);
});
