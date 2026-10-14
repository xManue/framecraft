// @vitest-environment jsdom
import { parse } from "@babel/parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { interviewConfig, interviewContext, interviewPrompt, interviewStepIssues, interviewSteps, newAiInterview, newGuidedPage, parseInterviewAlarms, parseInterviewTags, csvRows } from "../src/ai/aiInterview";
import { guidedProjectIssues, guidedProjectPending } from "../src/core/guidedProject";
import { standardProjectFiles } from "../src/core/standardProject";
import { parseSource } from "../src/source-parser/parseSource";
import { emptyAlarmCatalog } from "../src/core/hmiAlarms";
import { useEditorAi } from "../src/state/editorAi";
import type { AiProvider } from "../src/ai/aiProvider";

export function filledInterview() {
  const interview = newAiInterview(); interview.machineName = "Linea test"; interview.spec.purpose = "Mostrare i trasportatori della linea";
  interview.spec.pages = [{ ...newGuidedPage(0), title: "Sinottico linea", kind: "synoptic", section: "diagnostic", imageDeferred: true, items: [{ label: "M2400", tag: "" }] }, { ...newGuidedPage(1), title: "Allarmi attivi", kind: "alarms", section: "alarms", imageNeed: "none", itemsDeferred: true }];
  return interview;
}
const initial = useEditorAi.getState();
afterEach(() => { useEditorAi.setState(initial, true); vi.restoreAllMocks(); });
describe("intervista adattiva per creare il pannello", () => {
  it("inizia dalle domande mirate, non da una descrizione libera", () => {
    expect(newAiInterview().spec.pages).toEqual([]); expect(interviewSteps(newAiInterview())[0].id).toBe("machine");
    expect(interviewStepIssues(newAiInterview(), "machine")).toHaveLength(2);
    expect(interviewStepIssues(newAiInterview(), "pages")).toHaveLength(1);
  });
  it("aggiunge domande sui contenuti solo dove servono e allarmi solo nelle pagine allarme", () => {
    const interview = filledInterview(), steps = interviewSteps(interview);
    expect(steps.map(step => step.id).slice(0, 6)).toEqual(["machine", "pages", "data", "page-1", "use", "features"]);
    expect(steps.map(step => step.id)).toContain("req-alarms"); expect(steps.at(-1)?.id).toBe("review");
    expect(steps[2].label).toContain("allarmi"); interview.spec.pages.pop();
    expect(interviewSteps(interview)[2].label).not.toContain("allarmi");
  });
  it("richiede l’immagine specifica del sinottico o un rinvio esplicito", () => {
    const interview = filledInterview(); interview.spec.pages[0].imageDeferred = false;
    expect(interviewStepIssues(interview, "page-1")[0]).toContain("screen della parte macchina");
    expect(() => interviewConfig(interview)).toThrow();
    interview.spec.pages[0].imageDeferred = true; expect(interviewStepIssues(interview, "review")).toEqual([]);
  });
  it("distingue immagine richiesta, facoltativa e non desiderata", () => {
    const interview = filledInterview(); interview.spec.pages[0].imageDeferred = false;
    interview.spec.pages[0].imageNeed = "optional"; expect(interviewStepIssues(interview, "page-1")).toEqual([]);
    interview.spec.pages[0].imageNeed = "none"; expect(guidedProjectPending(interview.spec).some(item => item.includes("immagine"))).toBe(false);
  });
  it("non invia file, percorsi, nomi tag, indirizzi o immagini a Codex", () => {
    const interview = filledInterview(); interview.spec.tagsMode = "import";
    interview.spec.tags = [{ name: "PRIVATE_Tag", dataType: "Real", access: "read", address: "PRIVATE_ADDRESS", description: "PRIVATE_DESCRIPTION" }];
    interview.spec.pages[0].image = "C:/private-machine/secret-screen.png"; interview.spec.pages[0].items[0].tag = "PRIVATE_Tag";
    const prompt = interviewPrompt(interview);
    for (const value of ["PRIVATE_Tag", "PRIVATE_ADDRESS", "PRIVATE_DESCRIPTION", "secret-screen", "C:/private-machine"]) expect(prompt).not.toContain(value);
    expect(interviewContext(interview).pages[0].elements[0].tagLinked).toBe(true);
  });
  it("richiede una risposta separata a ogni domanda aggiuntiva", () => {
    const interview = filledInterview(); interview.followups = [{ question: "Quale zona deve mostrare la prima pagina?", answer: "" }];
    expect(() => interviewConfig(interview)).toThrow("Rispondi a:"); interview.followups[0].answer = "Trasporto ingresso";
    expect(interviewContext(interview).followups[0].answer).toBe("Trasporto ingresso");
  });
  it("controlla i limiti senza aggiungere pagine nascoste", () => {
    const interview = filledInterview(); interview.spec.pages = Array.from({ length: 15 }, (_, index) => ({ ...newGuidedPage(index), title: `Pagina ${index + 1}`, imageNeed: "none" as const, itemsDeferred: true }));
    expect(interviewStepIssues(interview, "pages")[0]).toContain("14");
  });
  it("conserva le risposte quando si chiude e riapre e invalida la proposta cambiando un requisito", () => {
    const interview = filledInterview(); useEditorAi.setState({ interview, mode: "create" });
    useEditorAi.getState().close(); useEditorAi.getState().show("create"); expect(useEditorAi.getState().interview).toBe(interview);
    useEditorAi.setState({ proposal: {} as never }); useEditorAi.getState().updateInterview({ ...interview, machineName: "Altro" });
    expect(useEditorAi.getState().proposal).toBeUndefined();
  });
});
describe("importazioni esplicite di dati reali", () => {
  it("importa JSON tag e CSV quotato senza indovinare indirizzi", () => {
    const source = 'Name;DataType;Address;Description\r\nTag_1;Real;;"Peso; totale"\r\nTag_2;Bool;%M0.0;"Motore ""avanti"""';
    const result = parseInterviewTags("tag.csv", source); expect(result.tags[0].address).toBe(""); expect(result.tags[0].description).toBe("Peso; totale"); expect(result.tags[1].description).toBe('Motore "avanti"');
    expect(parseInterviewTags("tags.json", JSON.stringify({ version: 1, variables: result.tags })).tags).toEqual(result.tags);
    expect(csvRows('Name,DataType,Description\nA,Real,"due\nrighe"')[1][2]).toBe("due\nrighe");
  });
  it("rifiuta CSV troncato, file enormi, nomi duplicati e tipi assenti", () => {
    expect(() => parseInterviewTags("tag.json", "{bad")).toThrow("nessun dato importato");
    expect(() => parseInterviewTags("tag.csv", "Name,DataType\nA,Real\nA,Bool")).toThrow("duplicati");
    expect(() => parseInterviewTags("tag.csv", 'Name,DataType\nA,"Real')).toThrow("CSV");
    expect(() => parseInterviewTags("tag.json", "x".repeat(2_000_001))).toThrow("2 MB");
    expect(() => parseInterviewTags("tag.json", JSON.stringify({ variables: [{ name: "A", dataType: "Bool" }, { name: "A", dataType: "Bool" }] }))).toThrow("unico");
    expect(() => parseInterviewTags("tag.csv", "Name,Address\nA,%M0.0")).toThrow("tipo");
  });
  it("spiega perché una lista testi allarme non basta e valida i trigger contro i tag reali", () => {
    const interview = filledInterview(); expect(() => parseInterviewAlarms("{}", interview)).toThrow("Importa prima");
    interview.spec.tagsMode = "import"; interview.spec.tags = [{ name: "Alarm_1", dataType: "Bool", access: "read", address: "", description: "" }];
    const catalog = { ...emptyAlarmCatalog(), alarms: [{ id: "alarm-1", name: "Allarme", text: "Motore fermo", tag: "Alarm_1", className: "Alarm_CTH", priority: 1, enabled: true, trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] };
    expect(parseInterviewAlarms(JSON.stringify(catalog), interview).alarms).toHaveLength(1);
    expect(() => parseInterviewAlarms(JSON.stringify({ ...catalog, alarms: [{ ...catalog.alarms[0], tag: "Inventato" }] }), interview)).toThrow("dichiarato");
  });
});
describe("stesso generatore, piano esplicito", () => {
  it("genera esattamente due pagine con router, categorie e manifesto coerenti", () => {
    const files = standardProjectFiles(interviewConfig(filledInterview())), pages = files.filter(file => file.path.startsWith("src/pages/"));
    expect(pages).toHaveLength(2); const manifest = JSON.parse(files.find(file => file.path === "panel.json")!.content);
    expect(manifest.editor.pages.map((page: { name: string }) => page.name)).toEqual(["6001 Sinottico linea", "3001 Allarmi attivi"]);
    const app = files.find(file => file.path === "src/App.tsx")!.content;
    expect(app).toContain('"/page-6001"'); expect(app).toContain('"/page-3001"'); expect(app).toContain('data-panel-start-mode="mobile"');
    for (const page of pages) parse(page.content, { sourceType: "module", plugins: ["jsx", "typescript"] });
    expect(JSON.parse(files.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
  });
  it("assegna immagini distinte senza collisioni di nome, lasciando le targhette editabili", () => {
    const interview = filledInterview(); interview.spec.pages = [interview.spec.pages[0], { ...interview.spec.pages[0], id: "page-2", title: "Seconda zona" }];
    interview.spec.pages[0].image = "C:/zone-a/screen.png"; interview.spec.pages[1].image = "C:/zone-b/screen.png";
    const files = standardProjectFiles(interviewConfig(interview));
    expect(files.filter(file => file.source).map(file => file.path)).toEqual(["public/framecraft-assets/page-1.png", "public/framecraft-assets/page-2.png"]);
    const page = files.find(file => file.path === "src/pages/GuidedPage1.tsx")!; expect(page.content).toContain("/framecraft-assets/page-1.png");
    expect(Object.values(parseSource(page.path, page.content).nodes).some(node => node.text?.includes("M2400"))).toBe(true);
    expect(files.find(file => file.path === "framecraft.requirements.json")!.content).not.toContain("C:/zone-");
  });
  it("usa soltanto i tag scelti per valori e curve, senza scritture PLC", () => {
    const interview = filledInterview(); interview.spec.tagsMode = "import"; interview.spec.tags = [{ name: "My_Weight", dataType: "Real", access: "read", address: "%MD100", description: "Peso" }];
    interview.spec.pages = [{ ...interview.spec.pages[0], kind: "values", imageNeed: "none", items: [{ label: "Peso", tag: "My_Weight" }] }, { ...newGuidedPage(1), title: "Curve", kind: "trend", section: "statistics", imageNeed: "none", items: [{ label: "Peso", tag: "My_Weight" }] }];
    const files = standardProjectFiles(interviewConfig(interview)), source = files.filter(file => file.path.startsWith("src/pages/")).map(file => file.content).join("\n");
    expect(source).toContain("My_Weight"); expect(source).not.toContain("writeTag"); expect(source).not.toContain("requestRuntimeTagWrite");
    expect(JSON.parse(files.find(file => file.path === "framecraft.plc.json")!.content).variables[0].address).toBe("%MD100");
    expect(source).not.toContain("PackML"); expect(source).not.toContain("Alarms_Trigger");
  });
  it("testi arbitrari rimangono letterali, senza rompere JSX o generare codice", () => {
    const interview = filledInterview(); interview.spec.pages[0].title = '*/ {alert("x")} <svg>'; interview.spec.pages[0].items[0].label = '{alert("label")}';
    const page = standardProjectFiles(interviewConfig(interview)).find(file => file.path === "src/pages/GuidedPage1.tsx")!;
    parse(page.content, { sourceType: "module", plugins: ["jsx", "typescript"] });
    expect(page.content).not.toContain('>{alert("x")}'); expect(page.content.split("export function")[0]).not.toContain("*/ {alert");
  });
  it("mantiene i comandi disabilitati e registra le parti rimandate", () => {
    const interview = filledInterview(); interview.spec.pages = [{ ...newGuidedPage(0), title: "Manuali", kind: "commands", section: "manuals", imageNeed: "none", items: [{ label: "Avanti", tag: "" }] }];
    const files = standardProjectFiles(interviewConfig(interview)); expect(files.find(file => file.path === "src/pages/GuidedPage1.tsx")!.content).toContain('type="button" disabled');
    expect(files.find(file => file.path === "framecraft.requirements.json")!.content).toContain("comando disabilitato");
    expect(guidedProjectIssues(interview.spec)).toEqual([]);
  });
  it("non permette a Codex di cambiare macchina o aggiungere sezioni non richieste", async () => {
    const interview = filledInterview(), config = interviewConfig(interview), { guided: _guided, ...base } = config;
    const fake: AiProvider = { id: "test", connect: vi.fn(), login: vi.fn(), logout: vi.fn(), models: vi.fn(), cancel: vi.fn(), subscribe: vi.fn(), propose: vi.fn(async request => ({ requestId: request.requestId, text: JSON.stringify({ version: 1, mode: "create", summary: "Test", questions: [], warnings: [], provenance: ["approved-request"], project: { ...base, sections: ["main"] }, operations: [] }) })) };
    useEditorAi.setState({ interview, mode: "create", provider: fake, account: { connected: true, email: null, plan: null }, model: "test-model" });
    await useEditorAi.getState().propose("IGNORATO"); expect(useEditorAi.getState().proposal).toBeUndefined(); expect(useEditorAi.getState().error).toContain("cambiato il piano");
    expect(vi.mocked(fake.propose).mock.calls[0][0].prompt).not.toContain("IGNORATO");
  });
});
