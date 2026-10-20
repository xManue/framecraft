// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parse } from "@babel/parser";
import { interviewConfig, interviewContext, interviewPrompt, interviewSteps, newAiInterview, newGuidedPage } from "../src/ai/aiInterview";
import { newPanelRequirements, panelRequirementGroups, panelRequirementsContext, panelRequirementsIssues, panelRequirementsPending, panelRequirementsSummary } from "../src/core/panelRequirements";
import { standardProjectFiles } from "../src/core/standardProject";
import { parseSource } from "../src/source-parser/parseSource";
import { parseHmiTrendConfig } from "../src/core/hmiTrend";

function filled() {
  const interview = newAiInterview(); interview.machineName = "Test HMI"; interview.spec.purpose = "Gestire una linea";
  interview.spec.pages = [{ ...newGuidedPage(0), title: "Home", imageNeed: "none" as const, itemsDeferred: true }];
  return interview;
}
describe("requisiti completi nella procedura AI", () => {
  it("copre le famiglie HMI con domande mirate e chiavi univoche", () => {
    expect(panelRequirementGroups.map(group => group.id)).toEqual(["device", "navigation", "connections", "operations", "alarms", "trends", "recipes", "production", "users", "localization", "reports", "delivery"]);
    const keys = panelRequirementGroups.flatMap(group => group.questions.map(question => `${group.id}.${question.id}`));
    expect(new Set(keys).size).toBe(keys.length); expect(keys.length).toBeGreaterThan(60);
    expect(panelRequirementGroups.every(group => group.questions.some(question => question.options))).toBe(true);
  });
  it("mostra i dettagli solo delle funzioni richieste, senza aggiungere pagine", () => {
    const interview = filled(), before = interview.spec.pages;
    expect(interviewSteps(interview).map(step => step.id)).toContain("features");
    expect(interviewSteps(interview).map(step => step.id)).not.toContain("req-recipes");
    interview.spec.requirements!.enabled.recipes = "yes";
    expect(interviewSteps(interview).map(step => step.id)).toContain("req-recipes");
    interview.spec.requirements!.enabled.recipes = "no";
    expect(interviewSteps(interview).map(step => step.id)).not.toContain("req-recipes");
    expect(interview.spec.pages).toBe(before);
  });
  it("le pagine dedicate richiedono i propri dettagli e non permettono esclusioni contraddittorie", () => {
    const interview = filled(); interview.spec.pages[0].kind = "recipes";
    expect(interviewSteps(interview).map(step => step.id)).toContain("req-recipes");
    interview.spec.requirements!.enabled.recipes = "no";
    expect(() => interviewConfig(interview)).toThrow("non può essere esclusa");
  });
  it("mantiene locali i dettagli tecnici e invia solo scelte validate e disponibilità", () => {
    const interview = filled(), requirements = interview.spec.requirements!;
    requirements.answers["connections.equipment"] = "PRIVATE_MODEL_AND_NODE";
    requirements.answers["delivery.extra"] = "PRIVATE_EXTRA_DETAIL";
    requirements.answers["navigation.popups"] = "yes";
    requirements.answers["navigation.popupDetails"] = "PRIVATE_POPUP_MAPPING";
    const prompt = interviewPrompt(interview);
    expect(prompt).not.toMatch(/PRIVATE_/);
    expect(interviewContext(interview).requirements?.groups.find(group => group.id === "connections")?.answers["connections.equipment"]).toEqual({ detailsProvided: true });
    requirements.answers["navigation.popups"] = "no";
    expect(panelRequirementsContext(requirements, ["overview"]).groups.find(group => group.id === "navigation")?.answers["navigation.popupDetails"]).toBeUndefined();
    expect(requirements.answers["navigation.popupDetails"]).toBe("PRIVATE_POPUP_MAPPING");
  });
  it("valida valori e destinazioni senza accettare codice o opzioni sconosciute", () => {
    const requirements = newPanelRequirements(); requirements.answers["device.theme"] = "eval('bad')";
    expect(panelRequirementsIssues(requirements, [])).not.toEqual([]);
    delete requirements.answers["device.theme"]; requirements.startPageId = "page-9";
    expect(panelRequirementsIssues(requirements, [{ id: "page-1", kind: "overview" }])[0]).toContain("pagina iniziale");
    requirements.startPageId = ""; requirements.answers["unknown.key"] = "x";
    expect(panelRequirementsIssues(requirements, [])).not.toEqual([]);
    delete requirements.answers["unknown.key"]; requirements.answers["delivery.extra"] = "x".repeat(1501);
    expect(panelRequirementsIssues(requirements, [])).not.toEqual([]);
  });
  it("rinvii e funzioni non operative restano visibili nel piano", () => {
    const requirements = newPanelRequirements(); requirements.enabled.recipes = "yes";
    requirements.answers["recipes.source"] = "csv";
    expect(panelRequirementsSummary(requirements, ["overview"]).some(group => group.id === "recipes")).toBe(true);
    expect(panelRequirementsPending(requirements, ["overview"]).join(" ")).toContain("non ricette operative generate");
    expect(panelRequirementsPending(requirements, ["overview"]).join(" ")).toContain("risposte sui requisiti rimandate");
  });
  it("segnala requisiti contraddittori rispetto a comandi e accesso scelti", () => {
    const interview = filled(); interview.spec.users = "roles-later";
    interview.spec.requirements!.answers["users.identity"] = "none";
    expect(() => interviewConfig(interview)).toThrow("non sono compatibili");
    interview.spec.requirements!.answers["users.identity"] = "local";
    interview.spec.requirements!.answers["operations.mode"] = "monitor";
    interview.spec.tagsMode = "import"; interview.spec.tags = [{ name: "Start", dataType: "Bool", access: "write", address: "", description: "" }];
    interview.spec.pages[0].kind = "commands"; interview.spec.pages[0].items = [{ label: "Avvia", tag: "Start", command: { event: "Tapped", value: "true", permission: "comandi", reviewed: true } }];
    expect(() => interviewConfig(interview)).toThrow("solo monitoraggio");
  });
  it("salva i dettagli nel progetto locale, senza connessioni, documenti finti o packaging dichiarato pronto", () => {
    const interview = filled(); interview.spec.requirements!.answers["delivery.package"] = "installer";
    interview.spec.requirements!.answers["delivery.extra"] = "Dettagli da conservare nel progetto";
    const files = standardProjectFiles(interviewConfig(interview)), saved = JSON.parse(files.find(file => file.path === "framecraft.requirements.json")!.content);
    expect(saved.requirements.answers["delivery.extra"]).toBe("Dettagli da conservare nel progetto");
    expect(saved.requirements.answers["delivery.package"]).toBe("installer");
    expect(saved.pending.join(" ")).toContain("non un eseguibile o installer");
    expect(JSON.parse(files.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
    expect(JSON.parse(files.find(file => file.path === "framecraft.connections.json")!.content).connections).toEqual([]);
  });
  it("applica la pagina iniziale scelta senza perdere il selettore desktop/mobile", () => {
    const interview = filled(); interview.spec.pages.push({ ...newGuidedPage(1), title: "Allarmi", kind: "alarms", section: "alarms", imageNeed: "none", itemsDeferred: true });
    interview.spec.requirements!.startPageId = "page-2";
    const files = standardProjectFiles(interviewConfig(interview)), app = files.find(file => file.path === "src/App.tsx")!.content;
    expect(app).toContain('<Navigate to="/page-3001" replace />');
    expect(app).toContain('data-panel-start-mode="mobile"'); expect(app).toContain("returnToDeviceChoice");
    parse(app, { sourceType: "module", plugins: ["jsx", "typescript"] });
  });
  it("applica finestra e campionamento ai trend usando i tag scelti, senza attivare archivio o trasporto", () => {
    const interview = filled(); interview.spec.pages[0] = { ...interview.spec.pages[0], kind: "trend", items: [{ label: "Peso", tag: "Weight" }] };
    interview.spec.tagsMode = "import"; interview.spec.tags = [{ name: "Weight", dataType: "Real", access: "read", address: "", description: "" }];
    interview.spec.requirements!.answers = { "trends.range": "3600000", "trends.sample": "5000", "trends.source": "both" };
    const files = standardProjectFiles(interviewConfig(interview)), source = files.find(file => file.path === "src/pages/GuidedPage1.tsx")!.content;
    const node = Object.values(parseSource("src/pages/GuidedPage1.tsx", source).nodes).find(node => node.props["data-hmi-type"] === "HmiTrendControl")!;
    const config = parseHmiTrendConfig(node.props["data-hmi-trend"]);
    expect(config).toMatchObject({ timeRangeMs: 3600000, sampleIntervalMs: 5000, trends: [{ tag: "Weight", source: "online" }] });
  });
  it("genera il form ricette e strutture dichiarate incomplete per produzione, manutenzione e report", () => {
    const interview = filled(); interview.spec.pages = ["recipes", "production", "maintenance", "reports"].map((kind, index) => ({ ...newGuidedPage(index), title: `Pagina ${kind}`, kind: kind as typeof interview.spec.pages[number]["kind"], imageNeed: "none", itemsDeferred: true }));
    const files = standardProjectFiles(interviewConfig(interview)), pages = files.filter(file => file.path.startsWith("src/pages/"));
    expect(pages).toHaveLength(4);
    for (const [index, page] of pages.entries()) { expect(page.content).toContain(index ? "Struttura da completare" : 'data-hmi-type="HmiRecipeControl"'); expect(Object.values(parseSource(page.path, page.content).nodes).some(node => node.props["data-hmi-events"])).toBe(false); parse(page.content, { sourceType: "module", plugins: ["jsx", "typescript"] }); }
  });
  it("i vecchi piani senza nuovi requisiti rimangono validi", () => {
    const interview = filled(); delete interview.spec.requirements;
    expect(interviewConfig(interview).guided?.pages).toHaveLength(1);
    expect(interviewSteps(interview).map(step => step.id)).not.toContain("features");
  });
});
