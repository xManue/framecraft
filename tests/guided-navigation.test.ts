// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { guidedCommandAttributes, guidedCommandBinding, guidedCommandIssues, newGuidedCommand, withGuidedItemLabels, type GuidedCommandItem, type GuidedCommandTarget } from "../src/core/guidedCommands";
import { executeHmiEvent, executeHmiEventAsync, parseHmiEvents, serializeHmiEvents } from "../src/core/hmiEvents";
import { guidedPageSource, guidedProjectIssues, guidedProjectPending } from "../src/core/guidedProject";
import { guidedTemplateBehavior } from "../src/core/templateBehavior";
import { planPageNumber } from "../src/core/hmiPages";
import { standardProjectFiles } from "../src/core/standardProject";
import { parseSource } from "../src/source-parser/parseSource";
import { interviewConfig, interviewContext, newAiInterview, newGuidedPage } from "../src/ai/aiInterview";
import { parseAiInterviewDraft, serializeAiInterviewDraft } from "../src/ai/aiInterviewDraft";
import { aiEditContext } from "../src/ai/aiProposal";
import { useEditorAi } from "../src/state/editorAi";
import { GuidedCommandFields, GuidedCommandsReview } from "../src/editor/GuidedCommandFields";

const target: GuidedCommandTarget = { id: "page-2", title: "Diagnostica", route: "/page-6001" };
const button = (): GuidedCommandItem => ({ label: "Apri diagnostica", tag: "", command: { ...newGuidedCommand("navigate"), targetPageId: target.id, reviewed: true } });
function fixture() {
  const interview = newAiInterview(); interview.machineName = "Macchina sintetica"; interview.spec.purpose = "Navigare fra le pagine scelte";
  interview.spec.pages = [{ ...newGuidedPage(0), kind: "commands", section: "manuals", title: "Pulsanti", imageNeed: "none", items: [button()] }, { ...newGuidedPage(1), kind: "empty", section: "diagnostic", title: target.title, imageNeed: "none", itemsDeferred: true }];
  return interview;
}
let root: Root | undefined, host: HTMLDivElement;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); document.body.append(host); useEditorAi.setState({ interview: newAiInterview(), busy: false, proposal: undefined, resolvedInterview: undefined, mode: "create" }); });
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; host.remove(); vi.restoreAllMocks(); });
function render(component: React.ReactNode) { root = createRoot(host); act(() => root!.render(component)); }
function select(index: number, value: string) { act(() => { const node = host.querySelectorAll("select")[index]; node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); }); }

it.each(["Tapped", "DoubleTapped", "ContextTapped"] as const)("compila soltanto una navigazione con evento %s, senza tag PLC", async event => {
  const item = button(); item.command!.event = event;
  const binding = parseHmiEvents(serializeHmiEvents([guidedCommandBinding(item, [], [target])!]))[0];
  const transport = { read: vi.fn(), write: vi.fn() };
  const result = await executeHmiEventAsync(binding, {}, { transport });
  expect(result.error).toBeUndefined(); expect(result.navigation).toEqual([target.route]); expect(result.writes).toEqual({}); expect(transport.read).not.toHaveBeenCalled(); expect(transport.write).not.toHaveBeenCalled(); expect(binding.event).toBe(event);
  expect(guidedCommandAttributes(item, [], [target])).not.toContain("data-plc-variable");
});
it.each(["", "page-99", "https://example.invalid", "javascript:alert(1)"])("rifiuta la destinazione assente o esterna %s", targetPageId => {
  const item = button(); item.command!.targetPageId = targetPageId;
  expect(guidedCommandIssues(item, [], true, [target])[0]).toContain("Scegli una pagina"); expect(() => guidedCommandBinding(item, [], [target])).toThrow();
});
it("non risolve destinazioni duplicate né rotte arbitrarie o ambigue", () => {
  expect(() => guidedCommandBinding(button(), [], [target, target])).toThrow();
  for (const route of ["https://example.invalid", "/mobile/page-6001", "/page-6001?x=1", "/../settings", "javascript:alert(1)"]) expect(() => guidedCommandBinding(button(), [], [{ ...target, route }])).toThrow("rotta interna");
  expect(() => guidedCommandBinding(button(), [], [target, { ...target, id: "page-3" }])).toThrow("ambigua");
});
it("rifiuta mapping misti, eventi automatici, script arbitrari e azioni non dichiarate", () => {
  const base = button();
  for (const item of [{ ...base, tag: "Command.Start" }, { ...base, command: { ...base.command!, value: "true" } }, { ...base, command: { ...base.command!, event: "Loaded" } }, { ...base, command: { ...base.command!, kind: "script" } }, { ...base, command: { ...base.command!, script: "Tags(1).Write(1)" } }, { ...base, command: { ...base.command!, reviewed: false } }]) expect(() => guidedCommandBinding(item as GuidedCommandItem, [], [target])).toThrow();
  expect(guidedCommandIssues({ ...base, command: { ...base.command!, kind: "write" } }, [], true, [target]).join(" ")).toContain("non può contenere una destinazione");
});
it("conserva il permesso esplicito senza richiedere un catalogo PLC", () => {
  const item = button(); item.command!.permission = "manutenzione";
  expect(guidedCommandIssues(item, [], true, [target])).toEqual([]); expect(guidedCommandAttributes(item, [], [target])).toContain('data-fc-user-requires="manutenzione"');
});
it("permette navigazione nel monitoraggio, ma continua a bloccare le scritture", () => {
  const interview = fixture(); interview.spec.requirements!.answers["operations.mode"] = "monitor";
  expect(guidedProjectIssues(interview.spec)).toEqual([]);
  interview.spec.pages[0].items[0].command = { ...newGuidedCommand(), value: "true", reviewed: true };
  expect(guidedProjectIssues(interview.spec).some(issue => issue.includes("solo monitoraggio"))).toBe(true);
});
it("risolve la destinazione dal piano effettivo anche dopo riordino e cambio categoria", () => {
  const interview = fixture(); interview.spec.pages[1].section = "manuals"; interview.spec.pages.reverse();
  const files = standardProjectFiles(interviewConfig(interview));
  const manifest = JSON.parse(files.find(file => file.path === "panel.json")!.content);
  const route = manifest.editor.pages.find((page: { name: string }) => page.name.endsWith(target.title)).id;
  const file = files.find(file => file.path === "src/pages/GuidedPage1.tsx")!;
  const parsed = parseSource(file.path, file.content), node = Object.values(parsed.nodes).find(node => node.type === "button")!;
  expect(executeHmiEvent(parseHmiEvents(node.props["data-hmi-events"])[0], {}).navigation).toEqual([route]); expect(route).not.toBe(target.route);
  expect(node.props["data-plc-variable"]).toBeUndefined(); expect(node.props.disabled).not.toBe(true); expect(node.capabilities.style).toBe(true);
  expect(JSON.parse(files.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
});
it("blocca anche il generatore diretto se manca il contesto delle destinazioni", () => {
  const page = fixture().spec.pages[0];
  expect(() => guidedPageSource(page, planPageNumber("manuals", [])!, "Test")).toThrow("Scegli una pagina");
  const interview = fixture(); interview.spec.pages.pop(); expect(() => standardProjectFiles(interviewConfig(interview))).toThrow();
});
it("revoca la conferma dopo rimozione senza trasferirla alla pagina ricreata", () => {
  const original = fixture(); useEditorAi.setState({ interview: original });
  useEditorAi.getState().updateInterview({ ...original, spec: { ...original.spec, pages: original.spec.pages.slice(0, 1) } });
  const changed = useEditorAi.getState().interview;
  expect(changed.spec.pages[0].items[0].command).toMatchObject({ targetPageId: target.id, reviewed: false }); expect(original.spec.pages[0].items[0].command!.reviewed).toBe(true);
  useEditorAi.getState().updateInterview({ ...changed, spec: { ...changed.spec, pages: [...changed.spec.pages, original.spec.pages[1]] } });
  expect(useEditorAi.getState().interview.spec.pages[0].items[0].command!.reviewed).toBe(false);
});
it("recupera destinazione ed evento nella bozza ma non l’approvazione", () => {
  const interview = fixture(); interview.spec.pages[0].items[0].command!.event = "DoubleTapped";
  const recovered = parseAiInterviewDraft(serializeAiInterviewDraft(interview)).interview;
  expect(recovered.spec.pages[0].items[0].command).toMatchObject({ kind: "navigate", targetPageId: target.id, event: "DoubleTapped", reviewed: false });
});
it("il contesto AI conosce navigazione e contratto v2 senza ricevere rotte o inventare mapping", () => {
  const interview = fixture(), context = interviewContext(interview);
  expect(context.pages[0].elements[0].command).toMatchObject({ kind: "navigate", targetPageId: target.id, configured: true });
  expect(context.pages[0].template.version).toBe(2); expect(JSON.stringify(context)).not.toContain(target.route);
  const pending = guidedProjectPending(interview.spec).find(item => item.includes("Apri diagnostica"))!;
  expect(pending).toContain("nessuna scrittura PLC"); expect(pending).not.toContain("interlock");
});
it.each([1, 2, 99])("non attribuisce a una pagina vecchia/sconosciuta il contratto nuovo (%s)", version => {
  const source = `export function Test(){return <main data-hmi-template-id="guided:commands" data-hmi-template-version={${version}}><span>Test</span></main>}`;
  const document = parseSource("Test.tsx", source), selectedId = Object.values(document.nodes).find(node => node.type === "span")!.id;
  const behavior = aiEditContext({ root: "C:/synthetic", document, selectedId }).template;
  if (version === 99) expect(behavior).toBeUndefined(); else { expect(behavior?.version).toBe(version); expect(behavior!.known.some(line => line.includes("Aprire una pagina"))).toBe(version === 2); }
  expect(guidedTemplateBehavior("values", 2)).toBeUndefined();
});
it("genera i metadati v2 ma conserva navigazione, traduzioni e mapping su riordino etichette", () => {
  const interview = fixture(), files = standardProjectFiles(interviewConfig(interview));
  expect(files.find(file => file.path === "src/pages/GuidedPage1.tsx")!.content).toContain("data-hmi-template-version={2}");
  const linked = { ...button(), textKey: "KEY" }, other = { label: "Altro", tag: "" };
  expect(withGuidedItemLabels([linked, other], ["Altro", linked.label])).toEqual([other, linked]);
});
it("la UI non preseleziona pagine e separa navigazione da tag e valori", () => {
  function Fields() { const [item, setItem] = useState<GuidedCommandItem>({ label: "Apri", tag: "", textKey: "KEY" } as GuidedCommandItem); return createElement(GuidedCommandFields, { item, pages: [target], tags: [], tagListId: "tags", onChange: setItem, onGoData: vi.fn() }); }
  render(createElement(Fields)); select(0, "navigate");
  expect(host.querySelectorAll("select")[2].value).toBe(""); expect(host.textContent).not.toContain("Tag da scrivere"); expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);
  select(2, target.id); expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(false);
  act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()); expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
  select(1, "DoubleTapped"); expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  select(0, "write"); expect(host.textContent).toContain("Tag da scrivere"); expect(host.textContent).not.toContain("Pagina da aprire");
});
it("destinazione rimossa resta visibile con errore e può essere corretta", () => {
  const item = button(); item.command!.targetPageId = "page-99";
  render(createElement(GuidedCommandFields, { item, pages: [target], tags: [], tagListId: "tags", onChange: vi.fn(), onGoData: vi.fn() }));
  const select = host.querySelectorAll("select")[2]; expect(select.getAttribute("aria-invalid")).toBe("true"); expect(select.selectedOptions[0].textContent).toContain("Pagina rimossa"); expect(document.getElementById(select.getAttribute("aria-describedby")!)?.textContent).toContain("non viene sostituita");
});
it("il riepilogo mostra la pagina reale e permette di rivedere il pulsante", () => {
  const onEdit = vi.fn(); render(createElement(GuidedCommandsReview, { pages: fixture().spec.pages, onEdit }));
  expect(host.textContent).toContain("apri Diagnostica · nessuna scrittura PLC"); expect(host.textContent).not.toContain("tag da scegliere"); act(() => host.querySelector("button")!.click()); expect(onEdit).toHaveBeenCalledWith("page-1");
});
