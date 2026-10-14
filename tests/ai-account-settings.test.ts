// @vitest-environment jsdom
import { act, createElement, Fragment, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorSettings } from "../src/editor/EditorSettings";
import { WelcomeScreen } from "../src/editor/WelcomeScreen";
import { useAiAccountEvents } from "../src/ai/useAiAccountEvents";
import { useEditorAi } from "../src/state/editorAi";
import { useEditorShortcuts } from "../src/state/editorShortcuts";
import { useEditorStore } from "../src/state/editorStore";
import type { AiAccount, AiEvent, AiProvider } from "../src/ai/aiProvider";

const initialAi = useEditorAi.getState(), initialSettings = useEditorShortcuts.getState(), initialEditor = useEditorStore.getState();
let root: Root, host: HTMLDivElement, fake: AiProvider, listeners: Set<(event: AiEvent) => void>;
const account: AiAccount = { connected: true, email: "operator@example.invalid", plan: "test" };
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes(text))!;
function Frame({ welcome = false }: { welcome?: boolean }) { useAiAccountEvents(); const open = useEditorShortcuts(state => state.open); return createElement(Fragment, null, welcome && createElement(WelcomeScreen), open && createElement(EditorSettings)); }
async function mount(welcome = false) { await act(async () => root.render(createElement(StrictMode, null, createElement(Frame, { welcome })))); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); listeners = new Set();
  fake = { id: "fake", connect: vi.fn().mockResolvedValue(account), models: vi.fn().mockResolvedValue([{ id: "default-model", name: "Modello di test", default: true }]), login: vi.fn(), logout: vi.fn(), propose: vi.fn(), cancel: vi.fn(), subscribe: vi.fn(async callback => { listeners.add(callback); return () => listeners.delete(callback); }) };
  useEditorAi.setState({ ...initialAi, provider: fake, open: false, busy: false, connecting: false, checking: false, account: undefined, accountError: undefined, error: undefined, models: [], model: "" }, true);
  useEditorShortcuts.setState({ ...initialSettings, open: true, section: "ai" }, true);
  useEditorStore.setState({ ...initialEditor, project: undefined, document: undefined, loading: false, lastError: undefined, recentProjects: [] }, true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); useEditorAi.setState(initialAi, true); useEditorShortcuts.setState(initialSettings, true); useEditorStore.setState(initialEditor, true); vi.restoreAllMocks(); });

describe("account AI soltanto nelle impostazioni", () => {
  it("aprire la sezione non avvia collegamenti, login o inferenze", async () => {
    await mount(); expect(document.body.textContent).toContain("Nessun account ChatGPT collegato");
    expect(fake.connect).not.toHaveBeenCalled(); expect(fake.login).not.toHaveBeenCalled(); expect(fake.propose).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLSelectElement>("#editor-ai-model")!.disabled).toBe(true);
  });
  it("avvia il login solo dal pulsante e non perde un errore della proposta", async () => {
    vi.mocked(fake.connect).mockResolvedValue({ connected: false, email: null, plan: null });
    useEditorAi.setState({ error: "Errore della proposta precedente" }); await mount();
    await act(async () => button("Collega ChatGPT").click());
    expect(fake.login).toHaveBeenCalledTimes(1); expect(fake.propose).not.toHaveBeenCalled();
    expect(useEditorAi.getState().error).toBe("Errore della proposta precedente"); expect(useEditorAi.getState().accountError).toBeUndefined();
  });
  it("verifica l’account salvato e permette la scelta del modello senza inferenza", async () => {
    await mount(); await act(async () => button("Ho completato l’accesso").click());
    expect(useEditorAi.getState().account).toEqual(account); expect(useEditorAi.getState().model).toBe("default-model");
    expect(fake.login).not.toHaveBeenCalled(); expect(fake.propose).not.toHaveBeenCalled();
    expect(button("Scollega account")).toBeTruthy(); expect(document.querySelector<HTMLSelectElement>("#editor-ai-model")!.disabled).toBe(false);
  });
  it("mostra gli errori account qui e mantiene disabilitata l’AI", async () => {
    vi.mocked(fake.connect).mockRejectedValue(new Error("Codex non è installato. Installa la CLI e riprova."));
    await mount(); await act(async () => button("Collega ChatGPT").click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Codex non è installato");
    expect(useEditorAi.getState().checking).toBe(false); expect(useEditorAi.getState().connecting).toBe(false);
    expect(fake.login).not.toHaveBeenCalled(); expect(useEditorAi.getState().model).toBe("");
  });
  it("riceve la fine login anche se l’utente ha già chiuso le impostazioni", async () => {
    await mount(); await act(async () => button("Chiudi").click());
    expect(document.querySelector(".editor-settings")).toBeNull();
    await act(async () => { for (const callback of listeners) callback({ type: "account", success: true }); });
    expect(useEditorAi.getState().account).toEqual(account); expect(useEditorAi.getState().model).toBe("default-model");
    expect(fake.propose).not.toHaveBeenCalled();
  });
  it("ignora risposte account vecchie arrivate dopo una verifica più recente", async () => {
    let finishOld!: (value: AiAccount) => void;
    vi.mocked(fake.connect).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const old = useEditorAi.getState().refresh(); await useEditorAi.getState().refresh();
    finishOld({ connected: false, email: null, plan: null }); await old;
    expect(useEditorAi.getState().account).toEqual(account); expect(useEditorAi.getState().checking).toBe(false);
  });
  it("una notifica durante lo scollegamento non ripristina il vecchio account", async () => {
    let finishLogout!: () => void, finishRefresh!: (value: AiAccount) => void;
    useEditorAi.setState({ account }); vi.mocked(fake.logout).mockImplementation(() => new Promise(resolve => { finishLogout = resolve; }));
    vi.mocked(fake.connect).mockImplementation(() => new Promise(resolve => { finishRefresh = resolve; }));
    const logout = useEditorAi.getState().logout(), refresh = useEditorAi.getState().refresh();
    finishLogout(); await logout; finishRefresh(account); await refresh;
    expect(useEditorAi.getState().account).toBeUndefined(); expect(useEditorAi.getState().model).toBe(""); expect(useEditorAi.getState().checking).toBe(false);
  });
  it("le impostazioni sono accessibili anche prima di aprire un progetto", async () => {
    useEditorShortcuts.setState({ open: false }); await mount(true);
    await act(async () => button("Impostazioni").click()); expect(document.querySelector(".editor-settings")).not.toBeNull();
    await act(async () => button("AI e account").click()); expect(button("Collega ChatGPT")).toBeTruthy();
    expect(fake.connect).not.toHaveBeenCalled(); expect(fake.propose).not.toHaveBeenCalled();
  });
});
