// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { delegatedQuestions, resolveInterviewDelegation, toggleInterviewDelegation } from "../src/ai/aiDelegation";
import { interviewConfig, interviewContext, interviewPrompt, interviewStepIssues, newAiInterview, newGuidedPage } from "../src/ai/aiInterview";
import { aiProposalSchema, parseAiProposal } from "../src/ai/aiProposal";
import { useEditorAi } from "../src/state/editorAi";
import { standardProjectFiles } from "../src/core/standardProject";
import type { AiProvider } from "../src/ai/aiProvider";

function filled() {
  const interview = newAiInterview(); interview.machineName = "Nome scelto"; interview.spec.purpose = "Scopo scelto";
  interview.spec.pages = [{ ...newGuidedPage(0), title: "Home scelta", imageNeed: "none", itemsDeferred: true }];
  return interview;
}
const initial = useEditorAi.getState();
afterEach(() => { useEditorAi.setState(initial, true); vi.restoreAllMocks(); });
describe("domande delegate esplicitamente all’AI", () => {
  it("permette di avanzare senza risposte delegate ma non genera con segnaposto di validazione", () => {
    let interview = newAiInterview(); for (const key of ["machineName", "purpose", "pages"]) interview = toggleInterviewDelegation(interview, key);
    expect(interviewStepIssues(interview, "machine")).toEqual([]); expect(interviewStepIssues(interview, "pages")).toEqual([]);
    expect(() => interviewConfig(interview)).toThrow("controlla prima");
    const prompt = JSON.parse(interviewPrompt(interview)); expect(prompt.approvedInterview.machineName).toBeNull(); expect(prompt.approvedInterview.purpose).toBeNull(); expect(prompt.exactProject.sections).toBeNull();
    expect(interview.spec.pages).toEqual([]); expect(interview.machineName).toBe("");
    const resolved = resolveInterviewDelegation(interview, [{ key: "machineName", value: "Bozza proposta" }, { key: "purpose", value: "Pannello generico da adattare alla macchina" }, { key: "pages", value: JSON.stringify([{ title: "Vista", kind: "overview", section: "main" }, { title: "Allarmi", kind: "alarms", section: "alarms" }]) }]);
    const files = standardProjectFiles(interviewConfig(resolved)); expect(files.filter(file => file.path.startsWith("src/pages/"))).toHaveLength(2);
    expect(JSON.parse(files.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
    expect(resolved.spec.pages[0]).toMatchObject({ imageDeferred: true, itemsDeferred: true, items: [] });
  });
  it("non invia una risposta precedente alla domanda saltata e la recupera tornando a Rispondo io", () => {
    const raw = filled(); raw.machineName = "OLD_PRIVATE_NAME"; raw.spec.requirements!.answers["device.theme"] = "dark";
    let skipped = toggleInterviewDelegation(toggleInterviewDelegation(raw, "machineName"), "req.device.theme");
    const prompt = interviewPrompt(skipped); expect(prompt).not.toContain("OLD_PRIVATE_NAME");
    expect(interviewContext(skipped).requirements!.groups.find(group => group.id === "device")!.answers["device.theme"]).toBeUndefined();
    const resolved = resolveInterviewDelegation(skipped, [{ key: "machineName", value: "Nuova proposta" }, { key: "req.device.theme", value: "light" }]);
    expect(resolved.spec.requirements!.answers["device.theme"]).toBe("light"); expect(raw.spec.requirements!.answers["device.theme"]).toBe("dark");
    skipped = toggleInterviewDelegation(skipped, "machineName"); expect(interviewContext(skipped).machineName).toBe("OLD_PRIVATE_NAME");
  });
  it("non scambia later, campo vuoto e impostazione del template con una delega", () => {
    const interview = filled(); interview.spec.requirements!.answers["device.theme"] = "later";
    expect(delegatedQuestions(interview)).toEqual([]); expect(interviewContext(interview).requirements!.groups.find(group => group.id === "device")!.answers["device.theme"]).toBe("later");
    expect(() => resolveInterviewDelegation(interview, [{ key: "req.device.theme", value: "dark" }])).toThrow("non delegata");
  });
  it("non fa rientrare il titolo saltato attraverso le etichette delle altre domande", () => {
    let interview = filled(); interview.spec.pages[0].title = "OLD_PRIVATE_PAGE_TITLE";
    for (const key of ["page.page-1.title", "page.page-1.image", "page.page-1.items"]) interview = toggleInterviewDelegation(interview, key);
    expect(interviewPrompt(interview)).not.toContain("OLD_PRIVATE_PAGE_TITLE");
  });
  it("conserva tag, foto e mapping reali già forniti senza mandarli all’AI", () => {
    let interview = filled(); interview.spec.tagsMode = "import"; interview.spec.tags = [{ name: "PRIVATE_TAG", address: "PRIVATE_ADDRESS", dataType: "Real", access: "read", description: "" }];
    interview.spec.pages[0].image = "C:/private/PRIVATE_IMAGE.png"; interview.spec.pages[0].items = [{ label: "Peso", tag: "PRIVATE_TAG" }];
    interview = toggleInterviewDelegation(interview, "tags");
    const resolved = resolveInterviewDelegation(interview, []); expect(resolved.spec.tags).toEqual(interview.spec.tags); expect(resolved.spec.pages[0].items[0].tag).toBe("PRIVATE_TAG");
    expect(interviewPrompt(interview)).not.toMatch(/PRIVATE_TAG|PRIVATE_ADDRESS|PRIVATE_IMAGE/);
  });
  it("lascia dati PLC, interblocchi e permessi sconosciuti da configurare, mai scelti dal modello", () => {
    let interview = filled(); for (const key of ["tags", "alarms", "protocol", "users", "req.operations.interlocks", "req.users.identity"]) interview = toggleInterviewDelegation(interview, key);
    const resolved = resolveInterviewDelegation(interview, []); expect(resolved.spec.tags).toEqual([]); expect(resolved.spec.protocol).toBe("later"); expect(resolved.spec.users).toBe("later");
    for (const question of delegatedQuestions(interview)) expect(() => resolveInterviewDelegation(interview, [{ key: question.key, value: "invented" }])).toThrow("dati macchina");
  });
  it("rifiuta risposte mancanti, duplicate, arbitrarie o a domande non delegate", () => {
    const interview = toggleInterviewDelegation(filled(), "layout");
    expect(() => resolveInterviewDelegation(interview, [])).toThrow("Manca la scelta");
    expect(() => resolveInterviewDelegation(interview, [{ key: "layout", value: "watch" }])).toThrow("non valida");
    expect(() => resolveInterviewDelegation(interview, [{ key: "machineName", value: "Other" }])).toThrow("non delegata");
    expect(() => resolveInterviewDelegation(interview, [{ key: "layout", value: "desktop" }, { key: "layout", value: "desktop" }])).toThrow();
    expect(() => toggleInterviewDelegation(interview, "__proto__")).toThrow();
  });
  it("il numero delegato può aggiungere pagine ma non cancellare o sostituire quelle scelte", () => {
    const interview = toggleInterviewDelegation(filled(), "pages"), original = { title: "Home scelta", kind: "overview", section: "main" };
    const decide = (plan: unknown) => resolveInterviewDelegation(interview, [{ key: "pages", value: JSON.stringify(plan) }]);
    expect(decide([original, { title: "Trend", kind: "trend", section: "statistics" }]).spec.pages.map(page => page.title)).toEqual(["Home scelta", "Trend"]);
    expect(() => decide([])).toThrow(); expect(() => decide([{ ...original, title: "Sostituita" }])).toThrow("già scelta");
    expect(() => decide([{ ...original, tag: "Inventato" }])).toThrow("non supportata"); expect(() => decide(Array.from({ length: 29 }, () => original))).toThrow("28");
  });
  it("completa i nomi vuoti nel piano delegato e non invia nomi segnaposto come indicazioni", () => {
    let interview = filled(); interview.spec.pages[0].title = ""; interview = toggleInterviewDelegation(interview, "pages");
    expect(interviewStepIssues(interview, "pages")).toEqual([]); expect(interviewContext(interview).pages[0].title).toBeNull();
    const resolved = resolveInterviewDelegation(interview, [{ key: "pages", value: '[{"title":"Home proposta","kind":"overview","section":"main"}]' }]);
    expect(interviewConfig(resolved).guided!.pages[0].title).toBe("Home proposta");
  });
  it("le etichette delegate sono scollegate e i comandi proposti restano disabilitati", () => {
    let interview = filled(); interview.spec.pages[0].kind = "commands"; interview.spec.pages[0].section = "manuals";
    interview = toggleInterviewDelegation(interview, "page.page-1.items");
    const resolved = resolveInterviewDelegation(interview, [{ key: "page.page-1.items", value: '["Comando da configurare"]' }]);
    expect(resolved.spec.pages[0].items).toEqual([{ label: "Comando da configurare", tag: "" }]);
    expect(standardProjectFiles(interviewConfig(resolved)).find(file => file.path === "src/pages/GuidedPage1.tsx")!.content).toContain('type="button" disabled');
    expect(() => resolveInterviewDelegation(interview, [{ key: "page.page-1.items", value: '[{"label":"Bad","tag":"Invented"}]' }])).toThrow();
  });
  it("una funzione pagina delegata non trasferisce mapping reali ad altri tipi di pagina", () => {
    let interview = filled(); interview.spec.pages[0].items = [{ label: "Peso", tag: "Existing" }];
    interview = toggleInterviewDelegation(interview, "page.page-1.kind");
    expect(() => resolveInterviewDelegation(interview, [{ key: "page.page-1.kind", value: "commands" }])).toThrow("non valida");
  });
  it("può scegliere la pagina iniziale tra quelle proposte e non accetta ID inesistenti", () => {
    let interview = filled(); interview.spec.pages = []; interview = toggleInterviewDelegation(toggleInterviewDelegation(interview, "pages"), "startPageId");
    const decisions = [{ key: "pages", value: '[{"title":"Vista","kind":"overview","section":"main"},{"title":"Allarmi","kind":"alarms","section":"alarms"}]' }, { key: "startPageId", value: "page-2" }];
    expect(interviewConfig(resolveInterviewDelegation(interview, decisions)).guided!.requirements!.startPageId).toBe("page-2");
    expect(() => interviewConfig(resolveInterviewDelegation(interview, [decisions[0], { key: "startPageId", value: "page-28" }]))).toThrow("pagina iniziale");
  });
  it("saltare l’accesso non concede permessi e disabilita i comandi privi di autorizzazione reale", () => {
    let interview = filled(); interview.spec.tagsMode = "import"; interview.spec.tags = [{ name: "Start", dataType: "Bool", access: "write", address: "", description: "" }];
    interview.spec.pages[0] = { ...interview.spec.pages[0], kind: "commands", section: "manuals", items: [{ label: "Avvia", tag: "Start", command: { event: "Tapped", value: "true", reviewed: true, permission: "" } }] };
    interview.spec.requirements!.answers["users.identity"] = "none"; interview = toggleInterviewDelegation(interview, "users");
    const resolved = resolveInterviewDelegation(interview, []); expect(interviewConfig(resolved).guided!.users).toBe("later"); expect(resolved.spec.pages[0].items[0].command).toBeUndefined();
    expect(interview.spec.pages[0].items[0].command!.reviewed).toBe(true);
    expect(standardProjectFiles(interviewConfig(resolved)).find(file => file.path === "src/pages/GuidedPage1.tsx")!.content).toContain('type="button" disabled');
  });
  it("le nuove pagine hanno ID univoci anche con ID esistenti non consecutivi", () => {
    let interview = filled(); interview.spec.pages[0].id = "page-2"; interview = toggleInterviewDelegation(interview, "pages");
    const resolved = resolveInterviewDelegation(interview, [{ key: "pages", value: '[{"title":"Home scelta","kind":"overview","section":"main"},{"title":"Nuova","kind":"empty","section":"main"}]' }]);
    expect(resolved.spec.pages.map(page => page.id)).toEqual(["page-2", "page-1"]); expect(() => interviewConfig(resolved)).not.toThrow();
  });
  it("non accetta immagini o elementi incompatibili con la funzione pagina proposta", () => {
    let interview = filled(); interview = toggleInterviewDelegation(toggleInterviewDelegation(interview, "page.page-1.kind"), "page.page-1.image");
    expect(() => resolveInterviewDelegation(interview, [{ key: "page.page-1.kind", value: "alarms" }, { key: "page.page-1.image", value: "required" }])).toThrow("non prevede");
  });
  it("saltare domande aggiuntive conserva le risposte ma non le invia o le richiede di nuovo", () => {
    const interview = filled(); interview.followups = [{ question: "Quale disposizione?", answer: "OLD_ANSWER", skipped: true }];
    expect(interviewStepIssues(interview, "review")).toEqual([]); expect(interviewPrompt(interview)).not.toContain("OLD_ANSWER");
    expect(interviewContext(interview).followups[0]).toEqual({ question: "Quale disposizione?", delegated: true });
    interview.followups[0].skipped = false; expect(interviewContext(interview).followups[0]).toEqual({ question: "Quale disposizione?", answer: "OLD_ANSWER" });
  });
  it("lo schema è chiuso e non accetta decisioni nella modifica degli elementi", () => {
    const base = { version: 1, mode: "create", summary: "Bozza", questions: [], warnings: [], provenance: ["approved-request"], project: { machineName: "Bozza", layout: "desktop", sections: ["main"], settingsProgram: "robot" }, operations: [] };
    expect(aiProposalSchema.required).toContain("decisions"); expect(aiProposalSchema.additionalProperties).toBe(false);
    expect(parseAiProposal({ ...base, decisions: [{ key: "layout", value: "desktop" }] }, "create").decisions).toHaveLength(1);
    expect(() => parseAiProposal({ ...base, decisions: [{ key: "layout", value: "desktop", execute: "code" }] }, "create")).toThrow();
    expect(() => parseAiProposal({ ...base, decisions: null }, "create")).toThrow();
    expect(() => parseAiProposal({ ...base, mode: "edit", project: null, decisions: [{ key: "layout", value: "desktop" }] }, "edit")).toThrow();
  });
  it("la pipeline controlla il piano risolto e invalida anche le scelte AI cambiando una risposta", async () => {
    const interview = toggleInterviewDelegation(filled(), "layout"), decisions = [{ key: "layout", value: "desktop" }];
    const { guided: _guided, ...project } = interviewConfig(resolveInterviewDelegation(interview, decisions));
    const fake: AiProvider = { id: "test", connect: vi.fn(), login: vi.fn(), logout: vi.fn(), models: vi.fn(), cancel: vi.fn(), subscribe: vi.fn(), propose: vi.fn(async request => ({ requestId: request.requestId, text: JSON.stringify({ version: 1, mode: "create", summary: "Test", questions: [], warnings: [], provenance: ["approved-request"], project, decisions, operations: [] }) })) };
    useEditorAi.setState({ interview, mode: "create", provider: fake, account: { connected: true, email: null, plan: null }, model: "test" });
    await useEditorAi.getState().propose(""); expect(useEditorAi.getState().proposal!.project!.layout).toBe("desktop"); expect(useEditorAi.getState().resolvedInterview!.layout).toBe("desktop");
    expect(useEditorAi.getState().interview.layout).toBe("desktop-mobile");
    useEditorAi.getState().updateInterview({ ...interview, machineName: "Corretto" }); expect(useEditorAi.getState().proposal).toBeUndefined(); expect(useEditorAi.getState().resolvedInterview).toBeUndefined();
  });
});
