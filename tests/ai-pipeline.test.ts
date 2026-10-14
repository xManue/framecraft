// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiEditContext, aiPrompt, parseAiProposal, prepareAiEdits, type AiEditSnapshot, type AiProposal } from "../src/ai/aiProposal";
import { parseSource } from "../src/source-parser/parseSource";
import { standardProjectFiles } from "../src/core/standardProject";
import { useEditorAi } from "../src/state/editorAi";
import type { AiProvider } from "../src/ai/aiProvider";
import { newAiInterview, newGuidedPage } from "../src/ai/aiInterview";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
import { useEditorStore } from "../src/state/editorStore";

const source = 'export default function Page(){return <main><button style={{color:"#000000",width:80}}>Prima</button><button>Altro</button></main>}';
const file = "C:/synthetic-panel/src/Page.jsx";
const original = useEditorStore.getState(), originalAi = useEditorAi.getState();
function snapshot(): AiEditSnapshot { const document = parseSource(file, source); return { root: "C:/synthetic-panel", document, selectedId: Object.values(document.nodes).find(node => node.text === "Prima")!.id }; }
function edit(): AiProposal { return { version: 1, mode: "edit", summary: "Testo e colore del pulsante scelto", questions: [], warnings: [], provenance: ["approved-selection"], project: null, operations: [{ id: "text", type: "text", property: null, value: "Dopo" }, { id: "color", type: "style", property: "color", value: "#ff0000" }] }; }
function create(): AiProposal { return { ...edit(), mode: "create", provenance: ["approved-request", "framecraft-standard"], project: { machineName: "Macchina di test", layout: "desktop-mobile", sections: ["main", "alarms"], settingsProgram: "robot" }, operations: [] }; }
function provider(): AiProvider {
  return { id: "synthetic", connect: vi.fn().mockResolvedValue({ connected: true, email: "test@example.invalid", plan: "test" }), login: vi.fn(), logout: vi.fn(), models: vi.fn().mockResolvedValue([{ id: "from-catalog", name: "Catalogo di test", default: true }]), propose: vi.fn(), cancel: vi.fn(), subscribe: vi.fn().mockResolvedValue(() => {}) };
}
beforeEach(() => { vi.clearAllMocks(); bridge.readFile.mockResolvedValue(source); bridge.writeFile.mockResolvedValue(undefined); useEditorStore.setState(original, true); useEditorAi.setState(originalAi, true); });
afterEach(() => { vi.restoreAllMocks(); useEditorStore.setState(original, true); useEditorAi.setState(originalAi, true); });

describe("proposte AI tipizzate e stesso progetto manuale", () => {
  it("genera il progetto reale con la stessa pipeline standard e gateway ancora disabilitato", () => {
    const plan = parseAiProposal(JSON.stringify(create()), "create"), files = standardProjectFiles(plan.project!);
    expect(files.some(file => /^src\/App\.(jsx|tsx)$/.test(file.path))).toBe(true);
    expect(files.find(file => file.path === "panel.json")?.content).toContain("Macchina di test");
    expect(JSON.parse(files.find(file => file.path === "framecraft.connections.json")!.content)).toEqual({ version: 1, connections: [] });
    expect(JSON.parse(files.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
    expect(files.some(file => file.path.includes("AI"))).toBe(false);
  });
  it("rifiuta campi extra, script, indirizzi e modifiche fuori modalità", () => {
    expect(() => parseAiProposal("{bad", "edit")).toThrow("Nessun file modificato");
    expect(() => parseAiProposal({ ...edit(), token: "secret" }, "edit")).toThrow();
    expect(() => parseAiProposal({ ...create(), project: { ...create().project, endpoint: "mqtt://invented.invalid" } }, "create")).toThrow();
    expect(() => parseAiProposal({ ...edit(), operations: [{ id: "bad", type: "script", property: null, value: "writePLC()" }] }, "edit")).toThrow();
    expect(() => parseAiProposal(create(), "edit")).toThrow();
    expect(() => parseAiProposal({ ...create(), operations: edit().operations }, "create")).toThrow();
  });
  it("rifiuta sezioni inventate e operazioni duplicate", () => {
    expect(() => parseAiProposal({ ...create(), project: { ...create().project, sections: ["invented"] } }, "create")).toThrow();
    expect(() => parseAiProposal({ ...edit(), operations: [edit().operations[0], edit().operations[0]] }, "edit")).toThrow();
    expect(() => parseAiProposal({ ...edit(), provenance: ["documento macchina mai fornito"] }, "edit")).toThrow("fonte");
  });
  it("applica solo le modifiche accettate e conserva il secondo elemento", () => {
    const selected = snapshot(), changed = prepareAiEdits(selected, parseAiProposal(edit(), "edit"), ["text"]);
    const parsed = parseSource(file, changed);
    expect(Object.values(parsed.nodes).find(node => node.text === "Dopo")?.styles.color).toBe("#000000");
    expect(Object.values(parsed.nodes).some(node => node.text === "Altro")).toBe(true);
    expect(selected.document.source).toBe(source);
  });
  it("prepara testo e stile insieme senza creare codice eseguibile dal testo", () => {
    const selected = snapshot(), proposal = edit(); proposal.operations[0].value = '{alert("x")}';
    const changed = prepareAiEdits(selected, parseAiProposal(proposal, "edit"), ["text", "color"]), parsed = parseSource(file, changed);
    const node = Object.values(parsed.nodes).find(node => node.text === '{alert("x")}');
    expect(node?.styles.color).toBe("#ff0000"); expect(node?.dynamicProps).toEqual([]);
  });
  it.each(["url(https://untrusted.invalid)", "expression(alert(1))", "calc(100px + 2px)"])("rifiuta CSS non supportato %s", value => {
    expect(() => parseAiProposal({ ...edit(), operations: [{ id: "unsafe", type: "style", property: "width", value }] }, "edit")).toThrow();
  });
  it("blocca l’applicazione di domande non risolte e indici non presenti", () => {
    expect(() => prepareAiEdits(snapshot(), { ...edit(), questions: ["Quale dato reale?"] }, ["text"])).toThrow("domande");
    expect(() => prepareAiEdits(snapshot(), edit(), ["other"])).toThrow();
  });
  it("invia soltanto contesto approvato, senza sorgente intero o attributi PLC", () => {
    const selected = snapshot(); selected.document.nodes[selected.selectedId].props["data-plc-variable"] = "PRIVATE_TAG";
    const context = aiEditContext(selected), input = aiPrompt("edit", "Cambia il colore", context);
    expect(input).not.toContain(selected.root); expect(input).not.toContain("PRIVATE_TAG"); expect(input).not.toContain(source);
    expect(JSON.parse(input).approvedContext.element.text).toBe("Prima");
    expect(JSON.parse(aiPrompt("create", "Crea un pannello")).standard.sections.map((section: { id: string }) => section.id)).toContain("main");
  });
});

describe("applicazione della proposta nell’editor", () => {
  function opened(selected = snapshot()) {
    useEditorStore.setState({ project: { root: selected.root } as never, document: selected.document, selectedId: selected.selectedId,
      loading: false, reloadRecovery: undefined, interactionMode: "edit", selectionInfo: undefined, dirty: false, panelManifest: undefined, unlockedPages: [], history: [], future: [], consoleEntries: [] });
    return selected;
  }
  it("scrive una volta e crea un’unica operazione Annulla/Ripeti", async () => {
    const selected = opened(); await useEditorStore.getState().applyAiProposal(selected, parseAiProposal(edit(), "edit"), ["text", "color"]);
    expect(bridge.writeFile).toHaveBeenCalledTimes(1); expect(useEditorStore.getState().history).toEqual([{ file, source }]);
    const after = useEditorStore.getState().document!.source;
    expect(after).toContain("Dopo"); expect(after).toContain("#ff0000");
    await useEditorStore.getState().undo(); expect(useEditorStore.getState().document!.source).toBe(source);
    await useEditorStore.getState().redo(); expect(useEditorStore.getState().document!.source).toBe(after);
  });
  it.each(["selection", "document", "project", "mode", "dirty", "external"])("non scrive se è cambiato %s", async change => {
    const selected = opened();
    if (change === "selection") useEditorStore.setState({ selectedId: "other" });
    if (change === "document") useEditorStore.setState({ document: parseSource(file, source.replace("Prima", "Nuovo")) });
    if (change === "project") useEditorStore.setState({ project: { root: "C:/other" } as never });
    if (change === "mode") useEditorStore.setState({ interactionMode: "navigate" });
    if (change === "dirty") useEditorStore.setState({ dirty: true });
    if (change === "external") bridge.readFile.mockResolvedValue(source + "\n// external");
    await expect(useEditorStore.getState().applyAiProposal(selected, edit(), ["text"])).rejects.toThrow(); expect(bridge.writeFile).not.toHaveBeenCalled();
  });
  it("un salvataggio fallito non lascia la proposta come modifica non annullabile nell’editor", async () => {
    const selected = opened(); bridge.writeFile.mockRejectedValue(new Error("EBUSY"));
    await expect(useEditorStore.getState().applyAiProposal(selected, edit(), ["text"])).rejects.toThrow("EBUSY");
    expect(useEditorStore.getState().document).toBe(selected.document); expect(useEditorStore.getState().history).toEqual([]); expect(useEditorStore.getState().dirty).toBe(false);
  });
});

describe("adapter sostituibile e richieste facoltative", () => {
  it("aprire o chiudere l’assistente non avvia provider o richieste", () => {
    const fake = provider(); useEditorAi.setState({ provider: fake }); useEditorAi.getState().show("create"); useEditorAi.getState().close();
    expect(fake.connect).not.toHaveBeenCalled(); expect(fake.propose).not.toHaveBeenCalled();
  });
  it("legge account e modelli, senza inferenza né login se l’account è già collegato", async () => {
    const fake = provider(); useEditorAi.setState({ provider: fake }); await useEditorAi.getState().connect();
    expect(useEditorAi.getState().model).toBe("from-catalog"); expect(fake.login).not.toHaveBeenCalled(); expect(fake.propose).not.toHaveBeenCalled();
  });
  it("blocca le richieste senza account e accetta solo la risposta della richiesta corrente", async () => {
    const fake = provider(), interview = newAiInterview(); interview.machineName = "Macchina di test"; interview.spec.purpose = "Controllare la macchina";
    interview.spec.pages = [{ ...newGuidedPage(0), title: "Main", imageDeferred: true, itemsDeferred: true }, { ...newGuidedPage(1), title: "Allarmi", kind: "alarms", section: "alarms", imageNeed: "none", itemsDeferred: true }];
    useEditorAi.setState({ provider: fake, interview }); await useEditorAi.getState().propose("Crea pannello"); expect(fake.propose).not.toHaveBeenCalled();
    await useEditorAi.getState().connect(); vi.mocked(fake.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(create()) }));
    await useEditorAi.getState().propose("Crea pannello"); expect(useEditorAi.getState().proposal?.project?.machineName).toBe("Macchina di test");
    vi.mocked(fake.propose).mockResolvedValue({ requestId: "foreign", text: JSON.stringify(create()) }); await useEditorAi.getState().propose("Riprova");
    expect(useEditorAi.getState().proposal).toBeUndefined(); expect(useEditorAi.getState().busy).toBe(false);
  });
  it("conserva una proposta quando si chiude e riapre lo stesso percorso", () => {
    useEditorAi.setState({ proposal: create(), mode: "create" }); useEditorAi.getState().close(); useEditorAi.getState().show("create");
    expect(useEditorAi.getState().proposal?.project).toEqual(create().project);
  });
});
