// @vitest-environment jsdom
import { act, createElement, Fragment, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiAssistant } from "../src/editor/AiAssistant";
import { useEditorAi } from "../src/state/editorAi";
import { useEditorStore } from "../src/state/editorStore";
import { parseSource } from "../src/source-parser/parseSource";
import type { AiProvider } from "../src/ai/aiProvider";
import { newAiInterview, newGuidedPage, interviewConfig } from "../src/ai/aiInterview";
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { EditorSettings } from "../src/editor/EditorSettings";
import { useEditorShortcuts } from "../src/state/editorShortcuts";
import { useAiAccountEvents } from "../src/ai/useAiAccountEvents";
import { EditorHelp } from "../src/editor/EditorHelp";
import { useEditorGuidance } from "../src/state/editorGuidance";

const initialAi = useEditorAi.getState(), initialEditor = useEditorStore.getState();
const initialSettings = useEditorShortcuts.getState();
const initialGuidance = useEditorGuidance.getState();
let container: HTMLDivElement, root: Root, fake: AiProvider;
const plan = { version: 1, mode: "create", summary: "Pannello di test", project: { machineName: "Linea test", layout: "desktop-mobile", sections: ["main"], settingsProgram: "robot" }, operations: [], questions: [], warnings: [], provenance: ["approved-request", "framecraft-standard"] };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fake = { id: "test", connect: vi.fn().mockResolvedValue({ connected: true, email: "test@example.invalid", plan: "test" }), login: vi.fn(), logout: vi.fn(), models: vi.fn().mockResolvedValue([{ id: "test-model", name: "Modello di test", default: true }]), propose: vi.fn(async request => ({ requestId: request.requestId, text: JSON.stringify({ ...plan, project: JSON.parse(request.prompt).exactProject ?? plan.project }) })), cancel: vi.fn(), subscribe: vi.fn().mockResolvedValue(() => {}) };
  useEditorAi.setState({ ...initialAi, interview: newAiInterview(), provider: fake, open: true, mode: "create", proposal: undefined, busy: false, connecting: false, error: undefined, account: undefined, models: [], model: "" }, true);
  useEditorStore.setState({ ...initialEditor, project: undefined, document: undefined, selectedId: undefined, loading: false }, true);
  useEditorShortcuts.setState({ ...initialSettings, open: false, section: "workspace" }, true);
  useEditorGuidance.setState({ ...initialGuidance, helpOpen: false }, true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); useEditorAi.setState(initialAi, true); useEditorStore.setState(initialEditor, true); useEditorShortcuts.setState(initialSettings, true); useEditorGuidance.setState(initialGuidance, true); });
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes(text))!;
function Frame() { useAiAccountEvents(); const open = useEditorShortcuts(state => state.open), helpOpen = useEditorGuidance(state => state.helpOpen); return createElement(Fragment, null, open && createElement(EditorSettings), helpOpen && createElement(EditorHelp), createElement(AiAssistant)); }
async function mount() { await act(async () => root.render(createElement(StrictMode, null, createElement(Frame)))); }
const settingsButton = (text: string) => [...document.querySelectorAll<HTMLButtonElement>(".editor-settings button")].find(button => button.textContent?.includes(text))!;
async function connectInSettings() { await act(async () => button("Apri impostazioni AI").click()); await act(async () => settingsButton("Collega ChatGPT").click()); await act(async () => settingsButton("Torna alla schermata AI").click()); }
function field(label: string) { return [...container.querySelectorAll("label")].find(node => node.textContent?.includes(label))!.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")!; }
function change(label: string, value: string) { const element = field(label), prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }

describe("flusso AI nell’interfaccia", () => {
  it("eredita il funzionamento del trend e chiede solo personalizzazioni, senza perdere i rinvii", async () => {
    const interview = requirementsInterview("req-trends"); interview.spec.pages[0].kind = "trend";
    useEditorAi.setState({ interview }); await mount();
    expect(container.querySelector('.ai-inherited-settings')?.textContent).toContain("Online");
    expect([...container.querySelectorAll("label")].some(label => label.textContent?.startsWith("Quale intervallo mostra"))).toBe(false);
    await act(async () => button("Personalizza: Quale intervallo").click());
    await act(async () => change("Quale intervallo mostra", "3600000"));
    expect(useEditorAi.getState().interview.spec.requirements!.answers["trends.range"]).toBe("3600000");
    await act(async () => change("Quale intervallo mostra", "later"));
    expect(useEditorAi.getState().interview.spec.requirements!.answers["trends.range"]).toBe("later");
    await act(async () => button("Usa impostazione del template: Quale intervallo").click());
    expect(useEditorAi.getState().interview.spec.requirements!.answers["trends.range"]).toBeUndefined();
    expect(container.querySelector('.ai-inherited-settings')?.textContent).toContain("1 minuto");
    expect(fake.propose).not.toHaveBeenCalled();
  });
  it("spiega la funzione della base senza chiedere tag o azioni dal nome del motore", async () => {
    const interview = requirementsInterview("page-1"); interview.spec.pages[0] = { ...interview.spec.pages[0], kind: "synoptic", items: [{ label: "M2400", tag: "" }] };
    useEditorAi.setState({ interview }); await mount();
    expect(container.querySelector('.template-behavior-info')?.textContent).toContain("Le targhette non fanno parte della foto");
    expect(container.querySelector('.template-behavior-info')?.textContent).toContain("Nessuna azione");
    expect(useEditorAi.getState().interview.spec.pages[0].items[0].command).toBeUndefined();
    expect(fake.propose).not.toHaveBeenCalled();
  });
  function requirementsInterview(step: string) {
    const interview = newAiInterview(); interview.machineName = "Test"; interview.spec.purpose = "Verificare i requisiti"; interview.step = step;
    interview.spec.pages = [{ ...newGuidedPage(0), title: "Home", imageNeed: "none", itemsDeferred: true }];
    return interview;
  }
  it("le nuove funzioni aprono domande mirate e conservano i dettagli se vengono rimandate", async () => {
    useEditorAi.setState({ interview: requirementsInterview("features") }); await mount();
    await act(async () => change("Ricette e formati", "yes"));
    await act(async () => useEditorAi.setState(state => ({ interview: { ...state.interview, step: "req-recipes" } })));
    expect(container.textContent).toContain("non ricette operative generate");
    await act(async () => { change("Da dove arrivano le ricette", "csv"); change("Quali parametri compongono", "PRIVATE_RECIPE_DETAILS"); });
    await act(async () => useEditorAi.setState(state => ({ interview: { ...state.interview, step: "features" } })));
    await act(async () => change("Ricette e formati", "no"));
    expect(useEditorAi.getState().interview.spec.requirements!.answers["recipes.fields"]).toBe("PRIVATE_RECIPE_DETAILS");
    expect(fake.propose).not.toHaveBeenCalled();
  });
  it("mostra i dettagli condizionali solo quando necessari senza perderli né inviarli", async () => {
    useEditorAi.setState({ interview: requirementsInterview("req-operations") }); await mount();
    expect(container.textContent).not.toContain("Quali movimenti e quale contratto");
    await act(async () => change("Ci sono comandi attivi", "yes"));
    await act(async () => change("Quali movimenti e quale contratto", "Contratto PLC locale"));
    await act(async () => change("Ci sono comandi attivi", "no"));
    expect(container.textContent).not.toContain("Quali movimenti e quale contratto");
    expect(useEditorAi.getState().interview.spec.requirements!.answers["operations.holdDetails"]).toBe("Contratto PLC locale");
    expect(fake.propose).not.toHaveBeenCalled();
  });
  it("sceglie la pagina iniziale e permette di correggere i requisiti dal riepilogo", async () => {
    const interview = requirementsInterview("req-navigation"); interview.spec.pages.push({ ...newGuidedPage(1), title: "Allarmi", kind: "alarms", section: "alarms", imageNeed: "none", itemsDeferred: true });
    useEditorAi.setState({ interview }); await mount();
    await act(async () => change("Quale pagina si apre", "page-2"));
    expect(useEditorAi.getState().interview.spec.requirements!.startPageId).toBe("page-2");
    await act(async () => useEditorAi.setState(state => ({ interview: { ...state.interview, step: "review" } })));
    expect(container.textContent).toContain("Pagina iniziale: Allarmi");
    await act(async () => button("Modifica: Navigazione").click());
    expect(useEditorAi.getState().interview.step).toBe("req-navigation");
    expect((field("Quale pagina si apre") as HTMLSelectElement).value).toBe("page-2");
    expect(fake.propose).not.toHaveBeenCalled();
  });
  function commandInterview(step = "page-1") {
    const interview = newAiInterview(); interview.machineName = "Linea"; interview.spec.purpose = "Comando manuale stazione"; interview.step = step;
    interview.spec.tagsMode = "import"; interview.spec.tags = [{ name: "Command.Start", dataType: "Bool", access: "write", address: "", description: "" }];
    interview.spec.pages = [{ ...newGuidedPage(0), title: "Manuali", kind: "commands", section: "manuals", imageNeed: "none", items: [{ label: "Avvia", tag: "" }] }];
    return interview;
  }
  it("raccoglie evento, tag scrivibile e valore del comando e richiede conferma prima di continuare", async () => {
    useEditorAi.setState({ interview: commandInterview() }); await mount();
    await act(async () => change("Cosa deve fare “Avvia”", "write")); expect(button("Avanti").disabled).toBe(true);
    expect(container.querySelectorAll("datalist")).toHaveLength(1); expect((field("Tag da scrivere per “Avvia”") as HTMLInputElement).list?.id).toBe("ai-write-tags-page-1");
    await act(async () => { change("Tag da scrivere per “Avvia”", "Command.Start"); change("Valore da scrivere per “Avvia”", "true"); change("Quando parte “Avvia”", "DoubleTapped"); change("Chi può usare “Avvia”", "comandi"); });
    expect(button("Avanti").disabled).toBe(true); await act(async () => field("Confermo il mapping di “Avvia”").click());
    expect(button("Avanti").disabled).toBe(false); expect(useEditorAi.getState().interview.spec.pages[0].items[0]).toMatchObject({ tag: "Command.Start", command: { event: "DoubleTapped", value: "true", permission: "comandi", reviewed: true } });
    await act(async () => change("Valore da scrivere per “Avvia”", "false")); expect((field("Confermo il mapping di “Avvia”") as HTMLInputElement).checked).toBe(false); expect(button("Avanti").disabled).toBe(true);
    await act(async () => change("Cosa deve fare “Avvia”", "later")); expect(useEditorAi.getState().interview.spec.pages[0].items[0].command).toBeUndefined(); expect(button("Avanti").disabled).toBe(false);
    expect(fake.propose).not.toHaveBeenCalled();
  });
  it("rinominare il comando non trasferisce la vecchia azione al nuovo nome", async () => {
    const interview = commandInterview(); interview.spec.pages[0].items[0] = { label: "Avvia", tag: "Command.Start", command: { event: "Tapped", value: "true", permission: "", reviewed: true } };
    useEditorAi.setState({ interview }); await mount(); await act(async () => change("Comandi necessari", "Arresta"));
    expect(useEditorAi.getState().interview.spec.pages[0].items[0]).toEqual({ label: "Arresta", tag: "" });
    expect(container.textContent).toContain("Rinominare un comando richiede un nuovo controllo");
  });
  it("reimportare il catalogo revoca la conferma dei comandi, conservando i tag solo se ancora scrivibili", async () => {
    const interview = commandInterview("data"); interview.spec.pages[0].items[0] = { label: "Avvia", tag: "Command.Start", command: { event: "Tapped", value: "true", permission: "", reviewed: true } };
    useEditorAi.setState({ interview }); await mount();
    const file = new File(["synthetic"], "tags.json", { type: "application/json" }); Object.defineProperty(file, "text", { value: async () => JSON.stringify({ version: 1, variables: interview.spec.tags }) });
    const input = field("Inserisci la lista tag") as HTMLInputElement; Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(useEditorAi.getState().interview.spec.pages[0].items[0]).toMatchObject({ tag: "Command.Start", command: { value: "true", reviewed: false } }); expect(fake.propose).not.toHaveBeenCalled();
  });
  it("attraversa la procedura con due pagine precise, domande per il sinottico e approvazione finale", async () => {
    const create = vi.spyOn(useEditorStore.getState(), "createStandardProject").mockResolvedValue(undefined);
    await mount();
    await act(async () => { change("Come si chiama", "Trasportatori"); change("Che processo", "Controllo linea ingresso"); });
    await act(async () => button("Avanti").click()); expect(container.querySelector(".ai-interview")?.getAttribute("data-step")).toBe("pages");
    await act(async () => change("Quante pagine", "2"));
    await act(async () => { change("Nome pagina 1", "Sinottico"); change("Funzione pagina 1", "synoptic"); change("Nome pagina 2", "Allarmi"); change("Funzione pagina 2", "alarms"); });
    await act(async () => button("Avanti").click()); expect(container.textContent).toContain("lista allarmi");
    await act(async () => button("Avanti").click()); expect(container.textContent).toContain("Screen della parte macchina"); expect(button("Avanti").disabled).toBe(true);
    await act(async () => { field("Non l’ho ancora").click(); change("Targhette dei motori", "M2400\nM2401"); });
    await act(async () => button("Avanti").click()); expect(container.querySelector(".ai-interview")?.getAttribute("data-step")).toBe("use");
    await act(async () => button("Indietro").click()); expect((field("Targhette dei motori") as HTMLTextAreaElement).value).toBe("M2400\nM2401");
    await act(async () => button("Avanti").click());
    for (let n = 0; n < 20 && useEditorAi.getState().interview.step !== "review"; n++) await act(async () => button("Avanti").click());
    expect(container.textContent).toContain("2 pagine"); expect(fake.propose).not.toHaveBeenCalled();
    await connectInSettings(); await act(async () => container.querySelector<HTMLInputElement>(".ai-consent input")!.click());
    await act(async () => button("Prepara proposta").click()); expect(create).not.toHaveBeenCalled();
    await act(async () => button("Approva, scegli cartella e crea 2 pagine").click());
    expect(create).toHaveBeenCalledTimes(1); expect(vi.mocked(create).mock.calls[0][0].guided?.pages.map(page => page.title)).toEqual(["Sinottico", "Allarmi"]);
  });
  it("annullare la scelta immagine conserva la pagina e non avvia l’AI", async () => {
    const interview = newAiInterview(); interview.machineName = "Linea"; interview.spec.purpose = "Sinottico"; interview.step = "page-1";
    interview.spec.pages = [{ ...newGuidedPage(0), title: "Zona 1", kind: "synoptic", section: "diagnostic", itemsDeferred: true }]; useEditorAi.setState({ interview });
    const image = vi.spyOn(desktopBridge, "chooseImage").mockResolvedValue(null); await mount();
    await act(async () => button("Scegli immagine per questa pagina").click());
    expect(image).toHaveBeenCalledTimes(1); expect(useEditorAi.getState().interview.spec.pages[0].image).toBeUndefined(); expect(button("Avanti").disabled).toBe(true); expect(fake.propose).not.toHaveBeenCalled();
  });
  it("presenta una domanda aggiuntiva come campo separato e invalida il vecchio piano", async () => {
    const interview = newAiInterview(); interview.machineName = "Linea test"; interview.spec.purpose = "Macchina"; interview.step = "review";
    interview.spec.pages = [{ ...newGuidedPage(0), title: "Home", imageDeferred: true, itemsDeferred: true }];
    useEditorAi.setState({ interview, proposal: { ...plan, project: interviewConfig(interview), questions: ["Quale stazione viene prima?"] } as never });
    await mount(); await act(async () => button("Rispondi alle domande aggiuntive").click());
    expect(useEditorAi.getState().proposal).toBeUndefined(); expect(field("Quale stazione viene prima?")).toBeTruthy();
    await act(async () => change("Quale stazione viene prima?", "Ingresso"));
    expect(useEditorAi.getState().interview.followups[0].answer).toBe("Ingresso");
  });
  it("aprire l’UI non collega account, non invia richieste e lascia il percorso manuale visibile", async () => {
    await mount(); expect(fake.connect).not.toHaveBeenCalled(); expect(fake.propose).not.toHaveBeenCalled();
    expect(button("Chiudi e continua a mano")).toBeTruthy(); expect(button("Avanti").disabled).toBe(true);
    expect(container.querySelector("textarea")).toBeNull(); expect(container.textContent).toContain("Come si chiama la macchina");
    expect(container.textContent).toContain("Collega il tuo account ChatGPT in Impostazioni");
    expect(container.querySelector(".ai-account")).toBeNull(); expect(button("Collega ChatGPT")).toBeUndefined();
    expect(container.querySelector("#editor-ai-model")).toBeNull();
  });
  it("richiede account, modello e consenso prima della proposta, e non crea il progetto da sola", async () => {
    const interview = newAiInterview(); interview.machineName = "Linea test"; interview.spec.purpose = "Controllare trasportatori"; interview.step = "review";
    interview.spec.pages = [{ ...newGuidedPage(0), title: "Vista linea", imageDeferred: true, itemsDeferred: true }]; useEditorAi.setState({ interview });
    const create = vi.spyOn(useEditorStore.getState(), "createStandardProject").mockResolvedValue(undefined); await mount();
    await connectInSettings();
    expect(button("Prepara proposta").disabled).toBe(true);
    await act(async () => container.querySelector<HTMLInputElement>('.ai-consent input')!.click());
    await act(async () => button("Prepara proposta").click());
    expect(fake.propose).toHaveBeenCalledTimes(1); expect(create).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Vista linea");
    await act(async () => button("Approva, scegli cartella e crea").click());
    expect(create).toHaveBeenCalledExactlyOnceWith(interviewConfig(interview));
  });
  it("apre direttamente AI e account senza collegare nulla e torna al questionario invariato", async () => {
    await mount(); await act(async () => change("Come si chiama", "Macchina conservata"));
    const interview = useEditorAi.getState().interview;
    await act(async () => button("Apri impostazioni AI").click());
    expect(useEditorShortcuts.getState()).toMatchObject({ open: true, section: "ai" });
    expect(container.querySelector<HTMLDivElement>(".ai-backdrop")!.hidden).toBe(true);
    expect(document.activeElement?.closest(".editor-settings")).not.toBeNull();
    expect(fake.connect).not.toHaveBeenCalled(); expect(fake.login).not.toHaveBeenCalled(); expect(fake.propose).not.toHaveBeenCalled();
    await act(async () => settingsButton("Torna alla schermata AI").click());
    expect(useEditorAi.getState().interview).toBe(interview); expect((field("Come si chiama") as HTMLInputElement).value).toBe("Macchina conservata");
    expect(container.querySelector<HTMLDivElement>(".ai-backdrop")!.hidden).toBe(false); expect(document.activeElement?.closest(".ai-assistant")).not.toBeNull();
  });
  it("Esc nelle impostazioni non chiude l’AI e conserva la richiesta di modifica", async () => {
    useEditorAi.setState({ mode: "edit" }); await mount(); await act(async () => change("La tua richiesta", "Rendi il pulsante blu"));
    await act(async () => button("Apri impostazioni AI").click());
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(useEditorShortcuts.getState().open).toBe(false); expect(useEditorAi.getState().open).toBe(true);
    expect(container.querySelector("textarea")!.value).toBe("Rendi il pulsante blu");
  });
  it("scollegare dalle impostazioni disabilita la proposta ma non cancella le risposte", async () => {
    await mount(); await connectInSettings(); const interview = useEditorAi.getState().interview;
    await act(async () => button("Apri impostazioni AI").click()); await act(async () => settingsButton("Scollega account").click()); await act(async () => settingsButton("Torna alla schermata AI").click());
    expect(fake.logout).toHaveBeenCalledTimes(1); expect(useEditorAi.getState().account).toBeUndefined(); expect(useEditorAi.getState().model).toBe("");
    expect(useEditorAi.getState().interview).toBe(interview); expect(container.textContent).toContain("Collega il tuo account ChatGPT in Impostazioni");
  });
  it("non copre la guida aperta dalle impostazioni e torna all’AI con Esc", async () => {
    await mount(); await act(async () => button("Apri impostazioni AI").click());
    await act(async () => settingsButton("Aiuto e suggerimenti").click()); await act(async () => settingsButton("Apri guida rapida").click());
    expect(document.querySelector("#quick-help-title")).not.toBeNull(); expect(container.querySelector<HTMLDivElement>(".ai-backdrop")!.hidden).toBe(true);
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(useEditorAi.getState().open).toBe(true); expect(container.querySelector<HTMLDivElement>(".ai-backdrop")!.hidden).toBe(false);
  });
  it("mostra il contesto senza sorgente o tag PLC e revoca il consenso quando cambia la selezione", async () => {
    const document = parseSource("C:/private/src/Page.jsx", 'export default function Page(){return <button data-plc-variable="PRIVATE_TAG">Motore</button>}');
    const selectedId = Object.values(document.nodes).find(node => node.type === "button")!.id;
    useEditorStore.setState({ project: { root: "C:/private" } as never, document, selectedId }); useEditorAi.setState({ mode: "edit" });
    await mount(); expect(container.querySelector(".ai-context pre")?.textContent).toContain("Motore");
    expect(container.querySelector(".ai-context pre")?.textContent).not.toContain("PRIVATE_TAG");
    await act(async () => container.querySelector<HTMLInputElement>('.ai-consent input')!.click());
    await act(async () => useEditorStore.setState({ selectedId: undefined }));
    expect(container.querySelector<HTMLInputElement>('.ai-consent input')!.checked).toBe(false); expect(button("Prepara proposta").disabled).toBe(true);
    expect(container.textContent).toContain("Seleziona prima un elemento");
  });
  it("non applica una proposta quando cambia il documento e conserva il messaggio esplicito", async () => {
    const document = parseSource("C:/test/Page.jsx", 'export default function Page(){return <button>Prima</button>}');
    const selectedId = Object.values(document.nodes).find(node => node.type === "button")!.id;
    useEditorStore.setState({ project: { root: "C:/test" } as never, document, selectedId });
    useEditorAi.setState({ mode: "edit", snapshot: { root: "C:/test", document, selectedId }, proposal: { ...plan, mode: "edit", project: null, operations: [{ id: "text", type: "text", property: null, value: "Dopo" }] } as never });
    await mount(); await act(async () => useEditorStore.setState({ document: parseSource(document.file, document.source.replace("Prima", "Altro")) }));
    expect(button("Applica le modifiche selezionate").disabled).toBe(true); expect(container.textContent).toContain("Questa proposta non può essere applicata");
  });
});
