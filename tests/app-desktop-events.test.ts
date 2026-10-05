// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewOutput } from "../src/core/types";

const bridge = vi.hoisted(() => ({ stopPreview: vi.fn(), readFile: vi.fn(), getEditorSession: vi.fn() }));
const events = vi.hoisted(() => ({ listen: vi.fn(), callbacks: new Map<string, (event: { payload: unknown }) => void>() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
vi.mock("@tauri-apps/api/event", () => ({ listen: events.listen }));
vi.mock("../src/editor/AppShell", () => ({ AppShell: () => createElement("div", { "data-testid": "editor" }) }));
vi.mock("../src/editor/WelcomeScreen", () => ({ WelcomeScreen: () => null }));
vi.mock("../src/editor/CommandPalette", () => ({ CommandPalette: () => null }));
vi.mock("../src/editor/UserAccessWindow", () => ({ UserAccessWindow: () => null }));
import { App } from "../src/app/App";
import { useEditorStore } from "../src/state/editorStore";
import { createEditorReloadCheckpoint } from "../src/state/editorRecovery";

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  bridge.stopPreview.mockReset().mockResolvedValue(undefined);
  bridge.readFile.mockReset().mockResolvedValue("");
  bridge.getEditorSession.mockReset().mockResolvedValue({ project: null, externalRoots: [], generation: 1 });
  events.callbacks.clear();
  events.listen.mockReset().mockImplementation(async (name, callback) => { events.callbacks.set(name, callback); return vi.fn(); });
  useEditorStore.setState({ project: { root: "C:/panel" } as never,
    document: { file: "C:/panel/App.jsx", source: "draft", nodes: {}, roots: [], version: 1 },
    loading: false, previewRestarting: false, previewStatus: "starting", previewSessionId: "startup", previewProcessExited: false,
    previewError: undefined, previewUrl: undefined, consoleEntries: [], paletteOpen: false, userAccessOpen: false, draftBackup: undefined,
    reloadRecovery: undefined, history: [], future: [], dirty: false });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("desktop event lifecycle and loading screen", () => {
  it("shows real startup progress without a stop control and opens the editor when ready", async () => {
    useEditorStore.setState({ loading: true });
    useEditorStore.getState().addPreviewOutput("stdout", "\x1b[33mVite si sta ancora avviando…\x1b[39m", "startup");
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(App)));
      expect(host.textContent).toContain("Vite si sta ancora avviando…");
      expect(host.textContent).not.toContain("\x1b");
      expect(host.textContent).toContain("Avvio dell’anteprima…");
      expect(host.textContent).not.toContain("Interrompi avvio");
      expect(host.querySelector('[role="status"] button')).toBeNull();
      await act(async () => useEditorStore.setState({ loading: false, previewStatus: "ready", previewUrl: "http://localhost:4173" }));
      expect(host.querySelector('[data-testid="editor"]')).not.toBeNull();
      expect(useEditorStore.getState().document?.source).toBe("draft");
      expect(bridge.stopPreview).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); host.remove(); }
  });

  it("passes the native output identifier to the store and filters stale logs", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(App)));
      await vi.waitFor(() => expect(events.callbacks.has("preview-output")).toBe(true));
      const emit = (payload: PreviewOutput) => events.callbacks.get("preview-output")!({ payload });
      await act(async () => emit({ sessionId: "old", stream: "stderr", line: "Error: listen EADDRINUSE" }));
      expect(useEditorStore.getState().consoleEntries).toEqual([]);
      await act(async () => emit({ sessionId: "startup", stream: "stdout", line: "Current startup log" }));
      expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toBe("Current startup log");
    } finally { await act(async () => root.unmount()); host.remove(); }
  });

  it("disposes late registrations and ignores their events after unmount", async () => {
    const registrations: { resolve: (dispose: () => void) => void; dispose: ReturnType<typeof vi.fn> }[] = [];
    events.listen.mockImplementation((name, callback) => {
      events.callbacks.set(name, callback);
      return new Promise<() => void>((resolve) => registrations.push({ resolve, dispose: vi.fn() }));
    });
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(createElement(App)));
      await vi.waitFor(() => expect(registrations).toHaveLength(3));
    await act(async () => root.unmount()); host.remove();
    await act(async () => registrations.forEach(({ resolve, dispose }) => resolve(dispose)));
    registrations.forEach(({ dispose }) => expect(dispose).toHaveBeenCalledOnce());
    events.callbacks.get("preview-output")!({ payload: { sessionId: "startup", stream: "stderr", line: "Late log" } });
    expect(useEditorStore.getState().consoleEntries).toEqual([]);
  });

  it("cleans successful subscriptions even when another registration fails", async () => {
    const dispose = vi.fn();
    events.listen.mockImplementation(async (name) => {
      if (name === "preview-output") throw new Error("Listener unavailable");
      return dispose;
    });
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(App)));
      await vi.waitFor(() => expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("Listener unavailable"));
    } finally { await act(async () => root.unmount()); host.remove(); }
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("riceve l'uscita globale dopo un reload senza duplicare gli errori o perdere la bozza", async () => {
    const document = useEditorStore.getState().document; const history = [{ file: document!.file, source: "prima" }];
    useEditorStore.setState({ dirty: true, history });
    const host = window.document.createElement("div"); window.document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(App)));
      await vi.waitFor(() => expect(events.callbacks.has("preview-exit")).toBe(true));
      const emit = (sessionId: string) => events.callbacks.get("preview-exit")!({ payload: { sessionId, code: 7, message: "Vite terminato" } });
      await act(async () => emit("stale")); expect(useEditorStore.getState().consoleEntries).toEqual([]);
      await act(async () => { emit("startup"); emit("startup"); });
      expect(useEditorStore.getState().previewStatus).toBe("error");
      expect(useEditorStore.getState().consoleEntries.filter((item) => item.message === "Vite terminato")).toHaveLength(1);
      expect(useEditorStore.getState().document).toBe(document); expect(useEditorStore.getState().history).toBe(history);
      expect(useEditorStore.getState().dirty).toBe(true); expect(host.querySelector('[data-testid="editor"]')).not.toBeNull();
      expect(bridge.stopPreview).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); host.remove(); }
  });

  it("mostra recupero persistente, confronto e scelte esplicite senza toolbar permanenti", async () => {
    const checkpoint = createEditorReloadCheckpoint(useEditorStore.getState())!;
    const record = { id: "1-123", checkpoint, baseSource: "prima" };
    const originalResume = useEditorStore.getState().resumePersistentRecovery; const resume = vi.fn(async () => {});
    useEditorStore.setState({ project: undefined, reloadRecovery: { checkpoint, persistent: record, status: "available" }, resumePersistentRecovery: resume });
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(App)));
      expect(host.textContent).toContain("C’è una bozza locale da recuperare"); expect(host.textContent).toContain("C:/panel");
      const recover = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Riapri questa copia"))!;
      await act(async () => recover.click()); expect(resume).toHaveBeenCalledWith();
      await act(async () => useEditorStore.setState({ reloadRecovery: { checkpoint, persistent: record, status: "opening" } }));
      expect([...host.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
      await act(async () => useEditorStore.setState({ reloadRecovery: { checkpoint, persistent: record, status: "conflict", diskSource: "disco modificato" } }));
      const fields = [...host.querySelectorAll("textarea")]; expect(fields).toHaveLength(2); expect(fields.every((field) => field.readOnly)).toBe(true);
      expect(fields[1].getAttribute("aria-label")).toBe("Versione attuale del file su disco");
      await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Usa la bozza nell’editor")!.click());
      await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Usa il file da disco")!.click());
      expect(resume.mock.calls).toEqual([[], ["draft"], ["disk"]]);
      expect(bridge.readFile).not.toHaveBeenCalled(); expect(bridge.stopPreview).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); host.remove(); useEditorStore.setState({ resumePersistentRecovery: originalResume }); }
  });

  it("rende visibile un backup fallito con retry e rimuove l'avviso quando torna riuscito", async () => {
    const originalRetry = useEditorStore.getState().retryDraftBackup; const retry = vi.fn(async () => {});
    useEditorStore.setState({ draftBackup: { status: "error", error: "Spazio insufficiente: copia la bozza" }, retryDraftBackup: retry });
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(App)));
      expect(host.querySelector('[role="alert"]')?.textContent).toContain("Spazio insufficiente");
      await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Riprova il backup")!.click());
      expect(retry).toHaveBeenCalledOnce();
      await act(async () => useEditorStore.setState({ draftBackup: { status: "saved", savedAt: Date.now() } }));
      expect(host.querySelector(".draft-backup-warning")).toBeNull();
    } finally { await act(async () => root.unmount()); host.remove(); useEditorStore.setState({ retryDraftBackup: originalRetry }); }
  });

  it("mostra la bozza durante il recupero e consente il retry senza scorciatoie mutanti", async () => {
    const checkpoint = {
      version: 1 as const, savedAt: Date.now(), root: "C:/panel", document: { file: "C:/panel/App.jsx", source: "bozza non salvata", version: 1 },
      dirty: true, history: [], future: [], pages: [], routerEditable: false, previewPath: "/", viewMode: "code" as const, zoom: 1, fitCanvas: true,
    };
    useEditorStore.setState({ project: undefined, document: undefined, reloadRecovery: { checkpoint, status: "checking" } });
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(App)));
      expect(host.querySelector('[role="status"]')).not.toBeNull();
      expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("bozza non salvata");
      expect(host.querySelector<HTMLTextAreaElement>("textarea")?.readOnly).toBe(true);
      expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Torna ai progetti"]);
      await act(async () => useEditorStore.setState({ reloadRecovery: { checkpoint, status: "failed", error: "Verifica non riuscita" } }));
      expect(host.textContent).toContain("Verifica non riuscita");
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true }));
      });
      expect(bridge.readFile).not.toHaveBeenCalled(); expect(bridge.getEditorSession).not.toHaveBeenCalled();
      const retry = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Riprova"))!;
      await act(async () => retry.click());
      expect(bridge.getEditorSession).toHaveBeenCalledOnce();
      expect(host.textContent).toContain("Il backend non ha più aperto");
      const discard = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Torna ai progetti"))!;
      vi.spyOn(window, "confirm").mockReturnValue(false);
      await act(async () => discard.click()); expect(useEditorStore.getState().reloadRecovery).toBeDefined();
      vi.mocked(window.confirm).mockReturnValue(true);
      await act(async () => discard.click()); expect(useEditorStore.getState().reloadRecovery).toBeUndefined();
      expect(bridge.stopPreview).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
});
