// @vitest-environment jsdom
import * as React from "react";
import { act, Children, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { parseGuidedResources, guidedResourceCatalog, guidedPageTextIssues, guidedTextChoices, guidedTextRows } from "../src/core/guidedTexts";
import { emptyHmiResourceCatalog } from "../src/core/hmiResources";
import { newAiInterview, newGuidedPage, interviewConfig, interviewPrompt } from "../src/ai/aiInterview";
import { parseAiInterviewDraft, serializeAiInterviewDraft } from "../src/ai/aiInterviewDraft";
import { resolveInterviewDelegation, toggleInterviewDelegation } from "../src/ai/aiDelegation";
import { guidedPageSource, guidedProjectPending } from "../src/core/guidedProject";
import { standardProjectFiles, type GeneratedProjectFile } from "../src/core/standardProject";
import { planPageNumber } from "../src/core/hmiPages";
import { parseSource } from "../src/source-parser/parseSource";
import { readPageCategories, withPageCategories, newPageCategory } from "../src/core/pageNavigation";
import { GuidedPageTextFields, GuidedTextsReview } from "../src/editor/GuidedTexts";
import { AiProjectInterview } from "../src/editor/AiProjectInterview";
import { newPanelHeader, panelHeaderIssues, panelClockText } from "../src/core/panelHeader";
import { useEditorAi } from "../src/state/editorAi";
import { useEditorStore } from "../src/state/editorStore";

function catalog() { return { ...emptyHmiResourceCatalog(), languages: ["it-IT", "en-US"], multilingualTexts: [
  { key: "SYNTHETIC_TITLE", texts: { "it-IT": "Parametri", "en-US": "UNIQUE_ENGLISH_TRANSLATION" } },
  { key: "SYNTHETIC_LABEL", texts: { "it-IT": "Contatore", "en-US": "Counter" } },
  { key: "SECOND_TITLE", texts: { "it-IT": "Seconda pagina", "en-US": "Second page" } },
] }; }
function fixture() {
  const interview = newAiInterview(); interview.machineName = "Macchina sintetica"; interview.layout = "desktop"; interview.step = "page-1";
  interview.spec.purpose = "Mostrare i dati scelti"; interview.spec.language = "en"; interview.spec.resources = catalog(); interview.spec.resourcesFile = "synthetic.resources.json";
  interview.spec.tagsMode = "import"; interview.spec.tags = [{ name: "Machine.Value", dataType: "INT", access: "read", address: "SYNTHETIC_ADDRESS", description: "" }];
  interview.spec.pages = [{ ...newGuidedPage(0), title: "Parametri", titleTextKey: "SYNTHETIC_TITLE", kind: "values", section: "settings", imageNeed: "none", items: [{ label: "Contatore", textKey: "SYNTHETIC_LABEL", tag: "Machine.Value" }] }];
  return interview;
}
const initialAi = useEditorAi.getState(), initialEditor = useEditorStore.getState(), initialLanguage = document.documentElement.lang;
let host: HTMLDivElement | undefined, root: Root | undefined;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); useEditorAi.setState(initialAi, true); useEditorStore.setState({ ...initialEditor, loading: false }, true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host?.remove(); host = undefined; vi.restoreAllMocks(); useEditorAi.setState(initialAi, true); useEditorStore.setState(initialEditor, true); document.documentElement.lang = initialLanguage; });
async function mount(component: Parameters<Root["render"]>[0]) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(component)); }

it("imposta la lingua scelta anche senza catalogo, senza dichiarare ogni testo tradotto", () => {
  const interview = fixture(); delete interview.spec.resources; delete interview.spec.resourcesFile; delete interview.spec.pages[0].titleTextKey; delete interview.spec.pages[0].items[0].textKey;
  const files = standardProjectFiles(interviewConfig(interview)), resources = JSON.parse(files.find(file => file.path === "framecraft.resources.json")!.content);
  expect(resources.activeLanguage).toBe("en-US"); expect(resources.multilingualTexts).toEqual([]); expect(guidedProjectPending(interview.spec).join(" ")).toContain("non è inventata");
  expect(guidedResourceCatalog()).toEqual(emptyHmiResourceCatalog());
});
it("preferisce una variante inglese effettiva e conserva lingua di ripiego e liste", () => {
  const interview = fixture(); const value = catalog(); value.languages = ["it-IT", "en-GB"]; value.multilingualTexts = [{ key: "GB", texts: { "it-IT": "Parametri", "en-GB": "Settings" } }] as never;
  interview.spec.resources = value; const resources = guidedResourceCatalog(interview.spec);
  expect(resources.activeLanguage).toBe("en-GB"); expect(resources.defaultLanguage).toBe("it-IT"); expect(value.activeLanguage).toBe("it-IT");
  const imported = catalog(); imported.textLists = [{ name: "Stati", rangeType: "Decimal", entries: [{ id: "ready", type: "SingleValue", fromValue: 1, texts: { "it-IT": "Pronto", "en-US": "Ready" } }] }] as never;
  expect(parseGuidedResources(imported).textLists).toEqual(imported.textLists);
});
it.each(["version", "locale", "duplicate-locale", "foreign-language", "script", "duplicate-key", "text-type", "entry-value"])("rifiuta un catalogo ambiguo o non supportato: %s", change => {
  const value = JSON.parse(JSON.stringify(catalog())); if (change === "version") value.version = 2;
  if (change === "locale") value.languages.push("not_a_locale"); if (change === "duplicate-locale") value.languages.push("en-us");
  if (change === "foreign-language") value.multilingualTexts[0].texts["fr-FR"] = "Non dichiarata";
  if (change === "script") value.execute = "never"; if (change === "duplicate-key") value.multilingualTexts.push({ ...value.multilingualTexts[0] });
  if (change === "text-type") value.multilingualTexts[0].texts["en-US"] = { script: "never" };
  if (change === "entry-value") value.textLists = [{ name: "Bad", rangeType: "Decimal", entries: [{ id: "one", type: "SingleValue", fromValue: "1", texts: {} }] }];
  expect(() => parseGuidedResources(value)).toThrow("Catalogo testi");
});
it("genera chiavi solo sulle scritte statiche, non sul valore PLC o sugli identificativi", () => {
  const interview = fixture(), files = standardProjectFiles(interviewConfig(interview)), page = files.find(file => file.path === "src/pages/GuidedPage1.tsx")!.content;
  const parsed = parseSource("GuidedPage1.tsx", page), nodes = Object.values(parsed.nodes);
  expect(nodes.find(node => node.type === "h1")?.props["data-hmi-text"]).toBe("SYNTHETIC_TITLE");
  expect(nodes.find(node => node.text === "Contatore")?.props["data-hmi-text"]).toBe("SYNTHETIC_LABEL");
  const value = nodes.find(node => node.props["data-plc-variable"] === "Machine.Value")!; expect(value.props["data-hmi-text"]).toBeUndefined();
  expect(page).toContain("Parametri"); expect(JSON.parse(files.find(file => file.path === "panel.json")!.content).editor.pages[0].name).toContain("Parametri");
  expect(JSON.parse(files.find(file => file.path === "framecraft.plc.json")!.content).variables).toEqual(interview.spec.tags);
  expect(JSON.parse(files.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
});
it("la navigazione conserva le chiavi delle pagine senza tradurre rotte e numerazione", () => {
  const files = standardProjectFiles(interviewConfig(fixture())), source = files.find(file => file.path === "src/App.tsx")!.content, categories = readPageCategories(source);
  expect(categories[0].entries[0]).toMatchObject({ label: "Parametri", textKey: "SYNTHETIC_TITLE", route: "/page-2001" });
  const updated = readPageCategories(withPageCategories(source, [...categories, newPageCategory(categories, "Nuova")]));
  expect(updated[0].entries[0].textKey).toBe("SYNTHETIC_TITLE"); expect(updated[0].number).toBe(2);
});
it("conserva le liste grafiche incomplete senza inventare o importare un’immagine", () => {
  const value = catalog(); value.graphicLists = [{ name: "Grafica da completare", rangeType: "Bool", entries: [{ id: "empty", type: "SingleValue", fromValue: 0, graphic: "" }] }] as never;
  expect(parseGuidedResources(value).graphicLists[0].entries[0].graphic).toBe("");
});
it("un catalogo malformato diretto produce l’errore del catalogo, non un errore JavaScript", () => {
  const interview = fixture(); interview.spec.resources = { version: 2 } as never;
  expect(() => interviewConfig(interview)).toThrow("Catalogo testi");
});
it("una chiave o un testo cambiati bloccano il generatore, anche invocato direttamente", () => {
  const interview = fixture(); interview.spec.pages[0].items[0].label = "Altra misura";
  expect(guidedPageTextIssues(interview.spec.pages[0], interview.spec.resources)[0]).toContain("non corrisponde");
  expect(() => interviewConfig(interview)).toThrow("non corrisponde");
  expect(() => guidedPageSource(interview.spec.pages[0], planPageNumber("settings", [])!, "Test", undefined, interview.spec.tags, undefined, undefined, interview.spec.resources)).toThrow("non corrisponde");
  interview.spec.pages[0].items[0].label = "Contatore"; interview.spec.resources!.multilingualTexts = []; expect(() => interviewConfig(interview)).toThrow("chiave");
});
it("nessuna corrispondenza assegna automaticamente una chiave e i ripieghi restano espliciti", () => {
  const interview = fixture(); delete interview.spec.resources!.multilingualTexts[0].texts["en-US"];
  expect(guidedTextRows(interview.spec)[0]).toMatchObject({ value: "Parametri", language: "it-IT", fallback: true });
  expect(guidedTextChoices("Contatore", interview.spec.resources)).toHaveLength(1);
  delete interview.spec.pages[0].items[0].textKey; expect(guidedTextRows(interview.spec)[1]).toMatchObject({ key: undefined, value: "Contatore", fallback: false });
});
it("non trasferisce la traduzione vecchia a un titolo delegato cambiato", () => {
  const interview = toggleInterviewDelegation(fixture(), "page.page-1.title"), resolved = resolveInterviewDelegation(interview, [{ key: "page.page-1.title", value: "Altro titolo" }]);
  expect(resolved.spec.pages[0].titleTextKey).toBeUndefined(); expect(interview.spec.pages[0].titleTextKey).toBe("SYNTHETIC_TITLE");
});
it("conserva catalogo e riferimenti nella bozza senza inviarli al provider", () => {
  const interview = fixture(), recovered = parseAiInterviewDraft(serializeAiInterviewDraft(interview)).interview;
  expect(recovered.spec.resources).toEqual(interview.spec.resources); expect(recovered.spec.pages[0].titleTextKey).toBe("SYNTHETIC_TITLE");
  expect(interviewPrompt(interview)).not.toMatch(/SYNTHETIC_TITLE|SYNTHETIC_LABEL|UNIQUE_ENGLISH_TRANSLATION|synthetic.resources.json|SYNTHETIC_ADDRESS/);
});
it("mostra errore vicino alla chiave invalida e corregge solo il collegamento richiesto", async () => {
  const interview = fixture(); interview.spec.pages[0].items[0].textKey = "Missing"; const onChange = vi.fn();
  await mount(createElement(GuidedPageTextFields, { page: interview.spec.pages[0], spec: interview.spec, onChange }));
  const select = host!.querySelector<HTMLSelectElement>("#ai-text-page-1-0")!; expect(select.value).toBe("Missing"); expect(select.getAttribute("aria-invalid")).toBe("true");
  expect(host!.querySelector(`#${select.getAttribute("aria-describedby")}`)?.textContent).toContain("chiave");
  await act(async () => { select.value = "SYNTHETIC_LABEL"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(onChange.mock.calls[0][0].items[0]).toEqual({ label: "Contatore", tag: "Machine.Value", textKey: "SYNTHETIC_LABEL" }); expect(interview.spec.pages[0].items[0].textKey).toBe("Missing");
});
it("rivede testo originale, risultato e lingua di ripiego senza proclamare tutta l’HMI tradotta", async () => {
  const interview = fixture(); delete interview.spec.resources!.multilingualTexts[0].texts["en-US"]; const onEdit = vi.fn();
  await mount(createElement(GuidedTextsReview, { spec: interview.spec, onEdit }));
  expect(host!.textContent).toContain("en-US"); expect(host!.textContent).toContain("ripiego it-IT"); expect(host!.textContent).toContain("Non traduce automaticamente");
  await act(async () => host!.querySelector("button")!.click()); expect(onEdit).toHaveBeenCalledWith("page-1");
});
it("l’importazione invalida non cancella il catalogo precedente né chiama l’AI", async () => {
  const interview = fixture(); interview.step = "data"; const propose = vi.fn(); useEditorAi.setState({ interview, mode: "create", propose }); await mount(createElement(AiProjectInterview));
  const input = host!.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
  Object.defineProperty(input, "files", { value: [{ name: "bad.resources.json", size: 10, text: async () => '{"execute":true}' }] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(useEditorAi.getState().interview.spec.resources).toEqual(interview.spec.resources); expect(host!.textContent).toContain("Catalogo testi"); expect(propose).not.toHaveBeenCalled();
});
it("Rivedi testo dei titoli allarmi apre il piano pagine, non il primo passo della procedura", async () => {
  const interview = fixture(); interview.step = "review"; interview.spec.pages[0].kind = "alarms"; interview.spec.pages[0].items = [];
  useEditorAi.setState({ interview, mode: "create", proposal: undefined, resolvedInterview: undefined }); await mount(createElement(AiProjectInterview));
  const button = [...host!.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Rivedi testo: Parametri")!;
  await act(async () => button.click()); expect(host!.querySelector(".ai-interview")?.getAttribute("data-step")).toBe("pages");
  expect(host!.querySelector("#ai-text-page-1-title")).not.toBeNull();
});
it("le chiavi con virgolette e le traduzioni HTML restano dati, non nuovi nodi o script", () => {
  const interview = fixture(), key = 'KEY"quoted<value>'; interview.spec.resources!.multilingualTexts[1].key = key; interview.spec.pages[0].items[0].textKey = key;
  interview.spec.resources!.multilingualTexts[1].texts["en-US"] = '<img id="never-execute" src=x onerror="bad()">';
  const files = standardProjectFiles(interviewConfig(interview)), source = files.find(file => file.path === "src/pages/GuidedPage1.tsx")!.content;
  const document = parseSource("GuidedPage1.tsx", source); expect(Object.values(document.nodes).find(node => node.text === "Contatore")?.props["data-hmi-text"]).toBe(key);
  expect(Object.values(document.nodes).some(node => node.type === "img")).toBe(false);
});
it("tradurre la scritta di un comando non ne modifica evento, valore, tag o permesso", () => {
  const interview = fixture(); interview.spec.tags.push({ name: "Command", dataType: "BOOL", access: "read-write", address: "", description: "" });
  interview.spec.pages[0].kind = "commands"; interview.spec.pages[0].items[0].command = { event: "Tapped", value: "true", reviewed: true, permission: "comandi" }; interview.spec.pages[0].items[0].tag = "Command";
  const create = () => parseSource("Test.tsx", standardProjectFiles(interviewConfig(interview)).find(file => file.path === "src/pages/GuidedPage1.tsx")!.content);
  const before = Object.values(create().nodes).find(node => node.type === "button")!; delete interview.spec.pages[0].items[0].textKey;
  const after = Object.values(create().nodes).find(node => node.type === "button")!;
  for (const key of ["data-hmi-events", "data-plc-variable", "data-fc-user-requires"]) expect(after.props[key]).toEqual(before.props[key]);
});
it("non attribuisce al dizionario funzioni di traduzione dei nomi curva non implementate", () => {
  const interview = fixture(); interview.spec.pages[0].kind = "trend";
  expect(() => interviewConfig(interview)).toThrow("non ai nomi delle curve");
});
function loadApp(files: GeneratedProjectFile[]) {
  const sources = new Map(files.map(file => [file.path, file.content])), resources = JSON.parse(sources.get("framecraft.resources.json")!);
  let route = readPageCategories(sources.get("src/App.tsx")!)[0].route;
  const evaluate = (source: string, require: (id: string) => unknown) => {
    const output: Record<string, unknown> = {}, javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, jsx: JsxEmit.React } }).outputText;
    new Function("exports", "require", "React", javascript)(output, require, React); return output;
  };
  let App: React.ComponentType;
  const navigate = (next: string) => { route = next; root?.render(createElement(App)); };
  const require = (id: string): unknown => {
    if (id === "react") return React;
    if (id === "react-router-dom") return { useNavigate: () => navigate, useLocation: () => ({ pathname: route }), Route: () => null, Navigate: () => null, Routes: ({ children }: { children: React.ReactNode }) => (Children.toArray(children) as React.ReactElement<{ path: string; element: React.ReactNode }>[]).find(child => child.props.path === route)?.props.element };
    if (id === "../framecraft.resources.json") return { default: resources };
    if (id === "../framecraft.header.json") return { default: JSON.parse(sources.get("framecraft.header.json")!) };
    if (id === "../framecraft.plc.json") return { default: JSON.parse(sources.get("framecraft.plc.json")!) };
    if (id === "./framecraftHmiRuntime") return { installFramecraftHmiRuntime: () => () => {} };
    if (id === "./framecraftPanelHeader") return { newPanelHeader, panelHeaderIssues, panelClockText };
    if (id === "./framecraftPanelHeaderUi") return { HeaderValue: () => createElement("span", null, "—"), HeaderGauge: () => null, HeaderUser: () => null };
    if (id.startsWith("./pages/")) return evaluate(sources.get("src/pages/" + id.split("/").at(-1) + ".tsx")!, require);
    throw Error("Dipendenza inattesa: " + id);
  };
  App = evaluate(sources.get("src/App.tsx")!, require).App as React.ComponentType; return App;
}
it("l’App generata traduce pagina e menu, conserva la lingua navigando e cambia lingua senza cambiare tag", async () => {
  const interview = fixture(); interview.spec.pages.push({ ...newGuidedPage(1), title: "Seconda pagina", titleTextKey: "SECOND_TITLE", kind: "empty", section: "settings", imageNeed: "none" });
  await mount(createElement(loadApp(standardProjectFiles(interviewConfig(interview)))));
  expect(host!.querySelector("h1")?.textContent).toBe("UNIQUE_ENGLISH_TRANSLATION"); expect(host!.querySelector('[data-hmi-text="SYNTHETIC_LABEL"]')?.textContent).toBe("Counter");
  expect(document.documentElement.lang).toBe("en-US"); expect(host!.querySelector('[data-plc-variable="Machine.Value"]')?.textContent).toBe("—");
  await act(async () => host!.querySelector<HTMLButtonElement>(".hmi-section")!.click());
  expect(host!.querySelector('#hmi-section-menu [data-hmi-text="SECOND_TITLE"]')?.textContent).toBe("Second page");
  const button = host!.querySelector<HTMLButtonElement>('#hmi-section-menu [data-hmi-text="SECOND_TITLE"]')!.closest("button")!;
  await act(async () => button.click()); expect(host!.querySelector("h1")?.textContent).toBe("Second page");
  await act(async () => window.dispatchEvent(new CustomEvent("framecraft:set-language", { detail: "it-IT" })));
  expect(host!.querySelector("h1")?.textContent).toBe("Seconda pagina"); expect(document.documentElement.lang).toBe("it-IT");
});
it("il Runtime generato mostra una traduzione HTML come testo, senza eseguirla", async () => {
  const interview = fixture(); interview.spec.resources!.multilingualTexts[1].texts["en-US"] = '<img id="never-execute" src=x onerror="bad()">';
  await mount(createElement(loadApp(standardProjectFiles(interviewConfig(interview)))));
  expect(host!.querySelector('[data-hmi-text="SYNTHETIC_LABEL"]')?.textContent).toBe('<img id="never-execute" src=x onerror="bad()">');
  expect(host!.querySelector("#never-execute")).toBeNull();
});
