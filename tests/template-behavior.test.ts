// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { guidedTemplateBehavior, guidedTemplateBehaviors, inheritedTemplateAnswers } from "../src/core/templateBehavior";
import { guidedPageKinds } from "../src/core/guidedProject";
import { standardPageTemplate, standardPageTemplates, standardPageSource, planPageNumber } from "../src/core/hmiPages";
import { interviewConfig, interviewContext, interviewPrompt, newAiInterview, newGuidedPage } from "../src/ai/aiInterview";
import { panelRequirementsIssues, panelRequirementsSummary } from "../src/core/panelRequirements";
import { defaultHmiTrendConfig } from "../src/core/hmiTrend";
import { panelSize } from "../src/core/hmiStandard";
import { standardProjectFiles } from "../src/core/standardProject";
import { aiEditContext } from "../src/ai/aiProposal";
import { parseSource } from "../src/source-parser/parseSource";

function filled(kind = "synoptic" as typeof guidedPageKinds[number]["id"]) {
  const interview = newAiInterview(); interview.machineName = "Test"; interview.spec.purpose = "Verificare la base";
  interview.spec.pages = [{ ...newGuidedPage(0), title: "Pagina test", kind, imageNeed: "none", itemsDeferred: true }];
  return interview;
}
describe("funzionamento dichiarato dei template", () => {
  it("ogni template standard ha una scheda versionata senza confondere verifica visiva e collaudo", () => {
    expect(standardPageTemplates.length).toBeGreaterThan(60);
    for (const template of standardPageTemplates) {
      expect(template.behavior.id).toBe(`standard:${template.id}`); expect(template.behavior.version).toBe(1);
      expect(template.behavior.known.length).toBeGreaterThan(0); expect(template.behavior.inputs.length).toBeGreaterThan(0);
      expect(template.behavior.limits.join(" ")).toContain("non un collaudo");
      expect(JSON.stringify(template.behavior)).not.toContain("FotoStandardManu");
    }
    expect(standardPageTemplate("manual-station").behavior.id).toBe("standard:manual-infeed");
  });
  it("le basi veramente vuote non vengono descritte come funzioni operative", () => {
    for (const id of ["blank", "main-counters", "main-maintenance", "diagnostic-profinet"]) expect(standardPageTemplate(id).behavior.implementation).toBe("structure-only");
    expect(standardPageTemplate("statistics-production").behavior.known.join(" ")).toContain("servizio esterno");
    expect(standardPageTemplate("production-overview").behavior.known.join(" ")).toContain("non esecuzione");
  });
  it("copre tutte le basi guidate con fatti e input distinti", () => {
    expect(Object.keys(guidedTemplateBehaviors()).sort()).toEqual(guidedPageKinds.map(kind => kind.id).sort());
    expect(guidedTemplateBehavior("synoptic")!.known.join(" ")).toContain("non fanno parte della foto");
    expect(guidedTemplateBehavior("values")!.known.join(" ")).toContain("non campi che scrivono");
    expect(guidedTemplateBehavior("commands")!.known.join(" ")).toContain("disabilitati");
    expect(guidedTemplateBehavior("commands")!.limits.join(" ")).toContain("non significa conferma PLC");
    expect(guidedTemplateBehavior("recipes")!.implementation).toBe("structure-only");
    expect(guidedTemplateBehavior("__proto__")).toBeUndefined(); expect(guidedTemplateBehavior("not-known")).toBeUndefined();
  });
  it("invia all’AI solo le schede scelte una volta, con regole contro le domande ridondanti", () => {
    const interview = filled(); interview.spec.pages.push({ ...interview.spec.pages[0], id: "page-2", title: "Seconda zona" });
    const context = interviewContext(interview), prompt = interviewPrompt(interview);
    expect(context.templates).toHaveLength(1); expect(context.templates[0].id).toBe("guided:synoptic");
    expect(context.pages.map(page => page.template.id)).toEqual(["guided:synoptic", "guided:synoptic"]);
    expect(prompt).toContain("Non chiedere di rispiegarlo"); expect(prompt).not.toContain("standard:format-copy");
  });
  it("eredita solo impostazioni realmente presenti nella base, senza inventare dati macchina", () => {
    const defaults = inheritedTemplateAnswers(["trend", "history"]), trend = defaultHmiTrendConfig();
    expect(defaults).toMatchObject({ "device.resolution": `${panelSize.width}x${panelSize.height}`, "navigation.menu": "categories", "trends.range": String(trend.timeRangeMs), "trends.sample": String(trend.sampleIntervalMs), "trends.source": "online", "alarms.history": "session" });
    const interview = filled("trend"); interview.spec.requirements!.answers = defaults;
    expect(panelRequirementsIssues(interview.spec.requirements!, interview.spec.pages)).toEqual([]);
    expect(inheritedTemplateAnswers([])).toEqual({}); expect(Object.keys(defaults)).not.toContain("connections.equipment");
  });
  it("personalizzazioni e rinvii prevalgono sui defaults senza mutare il questionario", () => {
    const interview = filled("trend"), original = interview.spec.requirements!;
    original.answers["trends.range"] = "3600000"; original.answers["trends.sample"] = "later";
    const config = interviewConfig(interview);
    expect(config.guided!.requirements!.answers).toMatchObject({ "trends.range": "3600000", "trends.sample": "later", "trends.source": "online" });
    expect(original.answers).toEqual({ "trends.range": "3600000", "trends.sample": "later" });
    const summary = panelRequirementsSummary(original, ["trend"]).find(group => group.id === "trends")!;
    expect(summary.answers.find(answer => answer.key === "trends.range")?.inherited).toBe(false);
    expect(summary.answers.find(answer => answer.key === "trends.source")?.inherited).toBe(true);
  });
  it("salva i contratti nel progetto e identifica correttamente le pagine guidate", () => {
    const files = standardProjectFiles(interviewConfig(filled())), catalog = JSON.parse(files.find(file => file.path === "framecraft.templates.json")!.content);
    expect(catalog.scope).toBe("bundled-template-base-contracts");
    expect(catalog.templates).toHaveLength(standardPageTemplates.length + guidedPageKinds.length);
    expect(new Set(catalog.templates.map((item: { id: string }) => item.id)).size).toBe(catalog.templates.length);
    const page = files.find(file => file.path === "src/pages/GuidedPage1.tsx")!.content;
    expect(page).toContain('data-hmi-template-id="guided:synoptic"'); expect(page).not.toContain('data-hmi-template-id="standard:blank"');
    expect(JSON.parse(files.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
  });
  it("l’assistente sugli elementi conosce la base standard dal genitore senza inviare il sorgente", () => {
    const source = standardPageSource({ componentName: "TestPage", title: "Test", templateId: "data-board", plan: planPageNumber("main", [])! });
    const document = parseSource("C:/private/TestPage.tsx", source), selectedId = Object.values(document.nodes).find(node => node.type === "div" && node.parentId)!.id;
    const context = aiEditContext({ root: "C:/private", document, selectedId });
    expect(context.template?.id).toBe("standard:data-board"); expect(JSON.stringify(context)).not.toContain("C:/private");
    expect(JSON.stringify(context)).not.toContain("PV_ActualPageNumber_For_PLC");
  });
  it("non finge di conoscere una base sconosciuta o una versione diversa", () => {
    for (const source of ['<main data-hmi-template-id="guided:unknown" data-hmi-template-version={1}><span>Test</span></main>', '<main data-hmi-template-id="guided:values" data-hmi-template-version={99}><span>Test</span></main>']) {
      const document = parseSource("Test.tsx", `export function Test(){return ${source};}`), selectedId = Object.values(document.nodes).find(node => node.type === "span")!.id;
      expect(aiEditContext({ root: "C:/test", document, selectedId }).template).toBeUndefined();
    }
  });
});
