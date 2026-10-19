// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiAccountSettings } from "../src/editor/AiAccountSettings";
import { useAiAccountEvents } from "../src/ai/useAiAccountEvents";
import { useEditorAi } from "../src/state/editorAi";
import type { AiEvent, AiProvider, AiSandboxStatus } from "../src/ai/aiProvider";

const initial = useEditorAi.getState();
const missing: AiSandboxStatus = { status: "notConfigured", phase: "idle" };
const running: AiSandboxStatus = { status: "unknown", phase: "running" };
const ready: AiSandboxStatus = { status: "ready", phase: "completed" };
let root: Root, host: HTMLDivElement, provider: AiProvider, listeners: Set<(event: AiEvent) => void>;
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent?.includes(text))!;
const checkbox = () => host.querySelector<HTMLInputElement>('.ai-sandbox-confirm input[type="checkbox"]')!;
function Frame({ visible = true }: { visible?: boolean }) { useAiAccountEvents(); return visible ? createElement(AiAccountSettings) : null; }
async function render(visible = true) { await act(async () => root.render(createElement(StrictMode, null, createElement(Frame, { visible })))); }
async function check() { await act(async () => button("Verifica isolamento").click()); }
async function confirm() { await check(); await act(async () => button("Configura Windows").click()); }
async function start() { await confirm(); await act(async () => checkbox().click()); await act(async () => button("Autorizza e avvia").click()); }
async function notify() { await act(async () => { for (const listener of listeners) listener({ type: "sandbox" }); }); }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); listeners = new Set();
  provider = { id: "synthetic", connect: vi.fn(), login: vi.fn(), logout: vi.fn(), models: vi.fn(), propose: vi.fn(), cancel: vi.fn(), sandboxStatus: vi.fn().mockResolvedValue(missing), setupSandbox: vi.fn().mockResolvedValue(running), subscribe: vi.fn(async callback => { listeners.add(callback); return () => listeners.delete(callback); }) };
  useEditorAi.setState({ ...initial, provider, account: { connected: true, email: "operator@example.invalid", plan: "synthetic" }, models: [{ id: "model", name: "Synthetic", default: true }], model: "model", busy: false, connecting: false, checking: false }, true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); useEditorAi.setState(initial, true); vi.restoreAllMocks(); });

describe("configurazione Windows esplicita nelle impostazioni AI", () => {
  it("aprire non verifica, non configura, non collega e non invia richieste", async () => {
    await render(); expect(host.textContent).toContain("Isolamento non verificato");
    for (const method of [provider.sandboxStatus, provider.setupSandbox, provider.connect, provider.login, provider.propose]) expect(method).not.toHaveBeenCalled();
    expect(button("Configura Windows")).toBeUndefined();
  });
  it("il controllo richiesto è separato dal setup e non tocca errori della proposta", async () => {
    useEditorAi.setState({ error: "proposta precedente" }); await render(); await check();
    expect(provider.sandboxStatus).toHaveBeenCalledTimes(1); expect(provider.setupSandbox).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Manca la configurazione Windows"); expect(useEditorAi.getState().error).toBe("proposta precedente");
  });
  it("richiede una conferma nuova, mostra gli effetti e ripristina il focus quando si rinvia", async () => {
    await render(); await confirm();
    expect(checkbox().checked).toBe(false); expect(document.activeElement).toBe(checkbox());
    expect(button("Autorizza e avvia").disabled).toBe(true); expect(host.textContent).toContain("regole firewall"); expect(host.textContent).toContain("criteri di accesso");
    await act(async () => checkbox().click()); await act(async () => button("Non adesso").click());
    expect(document.activeElement).toBe(button("Configura Windows")); expect(provider.setupSandbox).not.toHaveBeenCalled();
    await act(async () => button("Configura Windows").click()); expect(checkbox().checked).toBe(false);
  });
  it("il controllo di stato rifiuta di configurare senza consenso anche fuori dalla UI", async () => {
    await useEditorAi.getState().checkSandbox(); await useEditorAi.getState().setupSandbox(false);
    expect(provider.setupSandbox).not.toHaveBeenCalled(); expect(useEditorAi.getState().sandboxError).toContain("autorizza esplicitamente");
  });
  it("un avvio accettato non è un completamento e non avvia login, AI o PLC", async () => {
    await render(); await start();
    expect(provider.setupSandbox).toHaveBeenCalledExactlyOnceWith(true); expect(host.textContent).toContain("Configurazione Windows in corso");
    expect(host.textContent).not.toContain("Protezione dei file pronta"); expect(button("Scollega account").disabled).toBe(true);
    await act(async () => { await useEditorAi.getState().setupSandbox(true); await useEditorAi.getState().logout(); await useEditorAi.getState().propose("test"); });
    expect(provider.setupSandbox).toHaveBeenCalledTimes(1); expect(provider.logout).not.toHaveBeenCalled(); expect(provider.propose).not.toHaveBeenCalled(); expect(provider.login).not.toHaveBeenCalled();
  });
  it("riceve il completamento anche a impostazioni chiuse e verifica la readiness senza inferenza", async () => {
    await render(); await start(); await render(false);
    vi.mocked(provider.sandboxStatus!).mockResolvedValue(ready); await notify(); await render();
    expect(host.textContent).toContain("Protezione dei file pronta"); expect(provider.setupSandbox).toHaveBeenCalledTimes(1);
    expect(provider.sandboxStatus).toHaveBeenCalledTimes(2); expect(provider.propose).not.toHaveBeenCalled();
  });
  it("un completamento con readiness ancora da aggiornare non viene presentato come pronto", async () => {
    await render(); await start(); vi.mocked(provider.sandboxStatus!).mockResolvedValue({ status: "updateRequired", phase: "completed" }); await notify();
    expect(host.textContent).toContain("deve essere aggiornata"); expect(host.textContent).not.toContain("Protezione dei file pronta");
    expect(provider.setupSandbox).toHaveBeenCalledTimes(1);
  });
  it("non perde una notifica di completamento arrivata durante una verifica già in corso", async () => {
    await render(); await start();
    let finish!: (value: AiSandboxStatus) => void;
    vi.mocked(provider.sandboxStatus!).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(ready);
    let request!: Promise<void>;
    await act(async () => { request = useEditorAi.getState().checkSandbox(); }); await notify();
    await act(async () => { finish(running); await request; });
    expect(host.textContent).toContain("Protezione dei file pronta"); expect(provider.sandboxStatus).toHaveBeenCalledTimes(3); expect(provider.setupSandbox).toHaveBeenCalledTimes(1);
  });
  it("con esito incerto non ripete il setup, nemmeno richiudendo le impostazioni", async () => {
    vi.mocked(provider.setupSandbox!).mockRejectedValue(new Error("Esito non confermato"));
    await render(); await start(); expect(useEditorAi.getState().sandbox?.phase).toBe("uncertain");
    await render(false); await render(); expect(host.textContent).toContain("Non avviare un altro setup"); expect(button("Configura Windows")).toBeUndefined();
    vi.mocked(provider.sandboxStatus!).mockResolvedValue({ status: "unknown", phase: "uncertain" }); await check();
    expect(provider.setupSandbox).toHaveBeenCalledTimes(1); expect(button("Configura Windows")).toBeUndefined();
  });
  it("dopo un fallimento definitivo un eventuale nuovo avvio richiede di nuovo il consenso", async () => {
    await render(); await start(); vi.mocked(provider.sandboxStatus!).mockResolvedValue({ status: "updateRequired", phase: "failed" }); await notify();
    expect(host.textContent).toContain("Windows non ha completato"); await act(async () => button("Configura Windows").click());
    expect(checkbox().checked).toBe(false); expect(button("Autorizza e avvia").disabled).toBe(true); expect(provider.setupSandbox).toHaveBeenCalledTimes(1);
  });
  it("l’esito letto prima del cambio account viene ignorato e la conferma non sopravvive", async () => {
    await render(); await confirm(); await act(async () => checkbox().click());
    let finish!: (value: AiSandboxStatus) => void;
    vi.mocked(provider.sandboxStatus!).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    let request!: Promise<void>;
    await act(async () => { request = useEditorAi.getState().checkSandbox(); });
    await act(async () => useEditorAi.setState({ account: { connected: true, email: "other@example.invalid", plan: "synthetic" } }));
    await act(async () => { finish(ready); await request; });
    expect(useEditorAi.getState().sandbox).toBeUndefined(); expect(useEditorAi.getState().sandboxChecking).toBe(false); expect(checkbox()).toBeNull(); expect(provider.setupSandbox).not.toHaveBeenCalled();
  });
  it("un provider senza funzioni Windows non riceve chiamate a Codex", async () => {
    provider.sandboxStatus = undefined; provider.setupSandbox = undefined;
    await render(); expect(button("Verifica isolamento").disabled).toBe(true); expect(host.textContent).toContain("non offre la configurazione Windows");
    await useEditorAi.getState().checkSandbox(); expect(useEditorAi.getState().sandboxError).toContain("non offre il controllo locale"); expect(provider.propose).not.toHaveBeenCalled();
  });
  it("stati sconosciuti, altri sistemi e controllo fallito non offrono setup alla cieca", async () => {
    await render();
    for (const status of ["unknown", "notRequired"] as const) {
      vi.mocked(provider.sandboxStatus!).mockResolvedValue({ status, phase: "idle" }); await check(); expect(button("Configura Windows")).toBeUndefined();
    }
    vi.mocked(provider.sandboxStatus!).mockRejectedValue(new Error("Questa build non include il comando")); await check();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Questa build"); expect(provider.setupSandbox).not.toHaveBeenCalled();
  });
  it("due click veloci durante l’avvio producono una sola richiesta, anche con notifica anticipata", async () => {
    let finish!: (value: AiSandboxStatus) => void;
    vi.mocked(provider.setupSandbox!).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await render(); await start(); await act(async () => useEditorAi.getState().setupSandbox(true)); await notify();
    expect(provider.setupSandbox).toHaveBeenCalledTimes(1); expect(provider.sandboxStatus).toHaveBeenCalledTimes(1);
    await act(async () => finish(ready)); expect(host.textContent).toContain("Protezione dei file pronta");
  });
});
