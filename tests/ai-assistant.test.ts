// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiAssistant } from "../src/editor/AiAssistant";
import { useEditorAi } from "../src/state/editorAi";
import { useEditorStore } from "../src/state/editorStore";
import { parseSource } from "../src/source-parser/parseSource";
import type { AiProvider } from "../src/ai/aiProvider";
import { newAiInterview, newGuidedPage, interviewConfig } from "../src/ai/aiInterview";
import { desktopBridge } from "../src/filesystem/desktopBridge";

const initialAi = useEditorAi.getState(), initialEditor = useEditorStore.getState();
let container: HTMLDivElement, root: Root, fake: AiProvider;
const plan = { version: 1, mode: "create", summary: "Pannello di test", project: { machineName: "Linea test", layout: "desktop-mobile", sections: ["main"], settingsProgram: "robot" }, operations: [], questions: [], warnings: [], provenance: ["approved-request", "framecraft-standard"] };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fake = { id: "test", connect: vi.fn().mockResolvedValue({ connected: true, email: "test@example.invalid", plan: "test" }), login: vi.fn(), logout: vi.fn(), models: vi.fn().mockResolvedValue([{ id: "test-model", name: "Modello di test", default: true }]), propose: vi.fn(async request => ({ requestId: request.requestId, text: JSON.stringify({ ...plan, project: JSON.parse(request.prompt).exactProject ?? plan.project }) })), cancel: vi.fn(), subscribe: vi.fn().mockResolvedValue(() => {}) };
  useEditorAi.setState({ ...initialAi, interview: newAiInterview(), provider: fake, open: true, mode: "create", proposal: undefined, busy: false, connecting: false, error: undefined, account: undefined, models: [], model: "" }, true);
  useEditorStore.setState({ ...initialEditor, project: undefined, document: undefined, selectedId: undefined, loading: false }, true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); useEditorAi.setState(initialAi, true); useEditorStore.setState(initialEditor, true); });
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes(text))!;
async function mount() { await act(async () => root.render(createElement(StrictMode, null, createElement(AiAssistant)))); }
function field(label: string) { return [...container.querySelectorAll("label")].find(node => node.textContent?.includes(label))!.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")!; }
function change(label: string, value: string) { const element = field(label), prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }

describe("flusso AI nell’interfaccia", () => {
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
    await act(async () => button("Avanti").click()); await act(async () => button("Avanti").click());
    expect(container.textContent).toContain("2 pagine"); expect(fake.propose).not.toHaveBeenCalled();
    await act(async () => button("Collega ChatGPT").click()); await act(async () => container.querySelector<HTMLInputElement>(".ai-consent input")!.click());
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
  });
  it("richiede account, modello e consenso prima della proposta, e non crea il progetto da sola", async () => {
    const interview = newAiInterview(); interview.machineName = "Linea test"; interview.spec.purpose = "Controllare trasportatori"; interview.step = "review";
    interview.spec.pages = [{ ...newGuidedPage(0), title: "Vista linea", imageDeferred: true, itemsDeferred: true }]; useEditorAi.setState({ interview });
    const create = vi.spyOn(useEditorStore.getState(), "createStandardProject").mockResolvedValue(undefined); await mount();
    await act(async () => button("Collega ChatGPT").click());
    expect(button("Prepara proposta").disabled).toBe(true);
    await act(async () => container.querySelector<HTMLInputElement>('.ai-consent input')!.click());
    await act(async () => button("Prepara proposta").click());
    expect(fake.propose).toHaveBeenCalledTimes(1); expect(create).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Vista linea");
    await act(async () => button("Approva, scegli cartella e crea").click());
    expect(create).toHaveBeenCalledExactlyOnceWith(interviewConfig(interview));
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
