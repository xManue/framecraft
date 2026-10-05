// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewExit } from "../src/core/types";

const bridge = vi.hoisted(() => ({
  createWorkingCopy: vi.fn(), analyzeProject: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(),
  listProjectSourceFiles: vi.fn(), startPreview: vi.fn(), stopPreview: vi.fn(), closeProject: vi.fn(),
}));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
import { useEditorStore } from "../src/state/editorStore";

const project = {
  root: "C:/work/panel", name: "panel", framework: "vite", language: "javascript",
  packageManager: "npm", entryFiles: ["C:/work/panel/src/App.jsx"], files: [],
  scripts: { dev: "vite" }, dependencies: ["react", "vite"], hasNodeModules: true, missingDependencies: [],
};
const document = { file: project.entryFiles[0], source: "export default function App() { return <main>Panel</main>; }", roots: [], nodes: {}, version: 1 };
const failure = (sessionId = "active"): PreviewExit => ({ sessionId, code: 7, message: "Vite si è chiuso inaspettatamente (codice 7)." });

beforeEach(() => {
  bridge.createWorkingCopy.mockReset().mockResolvedValue({ root: project.root, workspaceRoot: "C:/work", created: false, warnings: [] });
  bridge.analyzeProject.mockReset().mockResolvedValue(project);
  bridge.readFile.mockReset().mockResolvedValue(document.source);
  bridge.writeFile.mockReset().mockResolvedValue(undefined);
  bridge.listProjectSourceFiles.mockReset().mockResolvedValue([]);
  bridge.stopPreview.mockReset().mockResolvedValue(undefined);
  bridge.closeProject.mockReset().mockResolvedValue(undefined);
  bridge.startPreview.mockReset().mockImplementation(async (_root, _force, sessionId) => ({ sessionId, url: "http://127.0.0.1:61999", port: 61999 }));
  useEditorStore.setState({ project: project as never, document, dirty: false, loading: false, history: [], future: [],
    previewUrl: "http://127.0.0.1:4173", previewPath: "/settings", previewStatus: "ready", previewError: undefined,
    previewSessionId: "active", previewProcessExited: false, previewRestarting: false, consoleEntries: [],
    selectedId: "button", selectionRect: undefined, pages: [], externalRoots: [], recentProjects: [] });
});

describe("Vite process lifecycle after readiness", () => {
  it("reports a real exit without discarding the document, dirty buffer, selection or history", () => {
    const history = [{ file: document.file, source: "before" }];
    const future = [{ file: document.file, source: "after" }];
    useEditorStore.setState({ dirty: true, history, future });
    useEditorStore.getState().handlePreviewExit(failure());
    const state = useEditorStore.getState();
    expect(state).toMatchObject({ previewUrl: undefined, previewStatus: "error", previewProcessExited: true,
      previewError: failure().message, previewPath: "/settings", dirty: true, selectedId: "button" });
    expect(state.document).toBe(document);
    expect(state.history).toBe(history);
    expect(state.future).toBe(future);
    expect(state.consoleEntries.at(-1)).toMatchObject({ level: "error", source: "preview", message: failure().message });
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("ignores delayed exits belonging to another managed server", () => {
    const before = useEditorStore.getState();
    before.handlePreviewExit(failure("old"));
    expect(useEditorStore.getState()).toBe(before);
  });

  it("does not let late ready/navigation messages hide a process exit", async () => {
    useEditorStore.getState().handlePreviewExit(failure());
    useEditorStore.getState().markPreviewReady();
    await useEditorStore.getState().syncPreviewPath("/late-navigation");
    expect(useEditorStore.getState()).toMatchObject({ previewStatus: "error", previewError: failure().message, previewPath: "/settings" });
  });

  it("records a terminal notification once even when it is delivered twice", () => {
    useEditorStore.getState().handlePreviewExit(failure());
    useEditorStore.getState().handlePreviewExit(failure());
    expect(useEditorStore.getState().consoleEntries).toHaveLength(1);
  });

  it("keeps fatal logs from the old server out of a new startup", () => {
    useEditorStore.setState({ previewStatus: "starting" });
    useEditorStore.getState().addPreviewOutput("stderr", "Error: listen EADDRINUSE", "old");
    expect(useEditorStore.getState()).toMatchObject({ previewStatus: "starting", consoleEntries: [], previewError: undefined });
    useEditorStore.getState().addPreviewOutput("stderr", "Error: listen EADDRINUSE", "active");
    expect(useEditorStore.getState()).toMatchObject({ previewStatus: "error", previewProcessExited: false });
  });

  it("retains the terminal reason when the last stderr line arrives late", () => {
    useEditorStore.getState().handlePreviewExit(failure());
    useEditorStore.getState().addPreviewOutput("stderr", "Error: listen EADDRINUSE", "active");
    expect(useEditorStore.getState().previewError).toBe(failure().message);
    expect(useEditorStore.getState().consoleEntries).toHaveLength(2);
  });

  it("keeps an early exit even if the restart command resolves afterwards", async () => {
    bridge.startPreview.mockImplementationOnce(async (_root, _force, sessionId, onExit) => {
      onExit(failure(sessionId));
      return { sessionId, url: "http://127.0.0.1:61999", port: 61999 };
    });
    await useEditorStore.getState().restartPreview();
    expect(useEditorStore.getState()).toMatchObject({ previewStatus: "error", previewProcessExited: true, previewUrl: undefined, previewRestarting: false });
    expect(useEditorStore.getState().consoleEntries.some((item) => item.message.includes("Preview riavviata"))).toBe(false);
  });

  it("keeps an early exit even if the initial open command resolves afterwards", async () => {
    useEditorStore.setState({ project: undefined, document: undefined, previewSessionId: undefined });
    bridge.startPreview.mockImplementationOnce(async (_root, _force, sessionId, onExit) => {
      onExit(failure(sessionId));
      return { sessionId, url: "http://127.0.0.1:61999", port: 61999 };
    });
    await useEditorStore.getState().openProject(project.root);
    expect(useEditorStore.getState()).toMatchObject({ previewStatus: "error", previewProcessExited: true, previewUrl: undefined, loading: false });
    expect(useEditorStore.getState().project?.root).toBe(project.root);
    expect(useEditorStore.getState().document?.source).toBe(document.source);
  }, 15_000);

  it("refreshes a dead server by starting a new session, without saving or reopening the document", async () => {
    useEditorStore.setState({ dirty: true });
    useEditorStore.getState().handlePreviewExit(failure());
    useEditorStore.getState().refreshPreview();
    await vi.waitFor(() => expect(bridge.startPreview).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(useEditorStore.getState().previewRestarting).toBe(false));
    const state = useEditorStore.getState();
    expect(state).toMatchObject({ previewStatus: "starting", previewProcessExited: false, previewUrl: "http://127.0.0.1:61999", dirty: true });
    expect(state.previewSessionId).not.toBe("active");
    expect(state.document).toBe(document);
    expect(bridge.createWorkingCopy).not.toHaveBeenCalled();
    expect(bridge.writeFile).not.toHaveBeenCalled();
    state.markPreviewReady();
    expect(useEditorStore.getState().previewStatus).toBe("ready");
  });

  it("ignores old exits and output while a forced restart is pending", async () => {
    let release!: () => void;
    bridge.stopPreview.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const pending = useEditorStore.getState().restartPreview(true);
    useEditorStore.getState().handlePreviewExit(failure());
    useEditorStore.getState().addPreviewOutput("stderr", "Error: listen EADDRINUSE", "active");
    expect(useEditorStore.getState()).toMatchObject({ previewStatus: "starting", previewProcessExited: false, previewRestarting: true });
    release(); await pending;
    expect(bridge.startPreview).toHaveBeenCalledWith(project.root, true, useEditorStore.getState().previewSessionId, useEditorStore.getState().handlePreviewExit);
    useEditorStore.getState().handlePreviewExit(failure());
    expect(useEditorStore.getState().previewProcessExited).toBe(false);
  });

  it("invalidates the session before closing so delayed callbacks cannot reopen an error screen", async () => {
    await useEditorStore.getState().closeProject();
    useEditorStore.getState().handlePreviewExit(failure());
    expect(useEditorStore.getState()).toMatchObject({ project: undefined, previewStatus: "idle", previewSessionId: undefined, previewError: undefined, previewProcessExited: false });
  });

  it("cancels a pending restart without waiting for the old start promise or losing a dirty buffer", async () => {
    let reject!: (error: Error) => void;
    bridge.startPreview.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure; }));
    useEditorStore.setState({ dirty: true });
    const pending = useEditorStore.getState().restartPreview();
    await vi.waitFor(() => expect(bridge.startPreview).toHaveBeenCalledOnce());
    const canceledId = useEditorStore.getState().previewSessionId!;
    await useEditorStore.getState().cancelPreviewStartup();
    expect(useEditorStore.getState()).toMatchObject({ previewStatus: "error", previewSessionId: undefined, previewRestarting: false, loading: false, dirty: true });
    expect(useEditorStore.getState().previewError).toContain("interrotto");
    useEditorStore.getState().handlePreviewExit(failure(canceledId));
    reject(new Error("Avvio Vite annullato.")); await pending;
    expect(useEditorStore.getState().previewError).toContain("interrotto");
    expect(useEditorStore.getState().document).toBe(document);
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("cancels an initial open and keeps the already analysed project available", async () => {
    let reject!: (error: Error) => void;
    bridge.startPreview.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure; }));
    useEditorStore.setState({ project: undefined, document: undefined, previewSessionId: undefined });
    const opening = useEditorStore.getState().openProject(project.root);
    await vi.waitFor(() => expect(bridge.startPreview).toHaveBeenCalledOnce(), { timeout: 8_000 });
    await useEditorStore.getState().cancelPreviewStartup();
    expect(useEditorStore.getState()).toMatchObject({ loading: false, previewSessionId: undefined, previewStatus: "error" });
    expect(useEditorStore.getState().project?.root).toBe(project.root);
    reject(new Error("Avvio Vite annullato.")); await opening;
    expect(useEditorStore.getState().document?.source).toBe(document.source);
    expect(useEditorStore.getState().previewError).toContain("interrotto");
  }, 15_000);

  it("does not cancel a server that is already running normally", async () => {
    await useEditorStore.getState().cancelPreviewStartup();
    expect(bridge.stopPreview).not.toHaveBeenCalled();
    expect(useEditorStore.getState().previewStatus).toBe("ready");
  });

  it("does not execute a second native stop for duplicate cancel clicks", async () => {
    useEditorStore.setState({ previewRestarting: true });
    await useEditorStore.getState().cancelPreviewStartup();
    await useEditorStore.getState().cancelPreviewStartup();
    expect(bridge.stopPreview).toHaveBeenCalledOnce();
  });

  it("does not let completion of a canceled restart unlock a newer pending restart", async () => {
    let rejectOld!: (error: Error) => void;
    let resolveNew!: (value: { sessionId: string; url: string; port: number }) => void;
    bridge.startPreview.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const old = useEditorStore.getState().restartPreview();
    await vi.waitFor(() => expect(bridge.startPreview).toHaveBeenCalledOnce());
    await useEditorStore.getState().cancelPreviewStartup();
    bridge.startPreview.mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
    const next = useEditorStore.getState().restartPreview();
    await vi.waitFor(() => expect(bridge.startPreview).toHaveBeenCalledTimes(2));
    const nextId = useEditorStore.getState().previewSessionId!;
    rejectOld(new Error("Avvio Vite annullato.")); await old;
    expect(useEditorStore.getState()).toMatchObject({ previewSessionId: nextId, previewRestarting: true, previewStatus: "starting" });
    resolveNew({ sessionId: nextId, url: "http://127.0.0.1:61999", port: 61999 }); await next;
    expect(useEditorStore.getState().previewRestarting).toBe(false);
  });

  it("handles a refreshed analysis of the same project instead of staying busy forever", async () => {
    let reject!: (error: Error) => void;
    bridge.startPreview.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure; }));
    const pending = useEditorStore.getState().restartPreview();
    await vi.waitFor(() => expect(bridge.startPreview).toHaveBeenCalledOnce());
    useEditorStore.setState({ project: { ...project, name: "Updated analysis" } as never });
    reject(new Error("Avvio Vite annullato.")); await pending;
    expect(useEditorStore.getState()).toMatchObject({ previewRestarting: false, previewStatus: "error", previewError: "Avvio Vite annullato." });
  });
});
