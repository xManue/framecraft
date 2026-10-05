// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  chooseDirectory: vi.fn(),
  createProject: vi.fn(),
  createWorkingCopy: vi.fn(),
  analyzeProject: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  startPreview: vi.fn(),
  stopPreview: vi.fn(),
  closeProject: vi.fn(),
}));

vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));

import { useEditorStore } from "../src/state/editorStore";

const root = "C:\\work\\panel";

function analysis() {
  return {
    root,
    name: "panel",
    framework: "vite",
    language: "javascript",
    packageManager: "npm",
    entryFiles: [`${root}\\src\\App.jsx`],
    files: [],
    scripts: { dev: "vite" },
    dependencies: ["react", "vite"],
    hasNodeModules: true,
    missingDependencies: [],
  };
}

describe("project lifecycle", () => {
  beforeEach(() => {
    bridge.chooseDirectory.mockReset().mockResolvedValue(root);
    bridge.createProject.mockReset().mockResolvedValue(analysis());
    bridge.createWorkingCopy.mockReset().mockResolvedValue({ root, workspaceRoot: "C:\\work", created: false, warnings: [] });
    bridge.analyzeProject.mockReset().mockResolvedValue(analysis());
    bridge.readFile.mockReset().mockResolvedValue("export default function App() { return <main>Panel</main>; }");
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    bridge.startPreview.mockReset().mockResolvedValue({ url: "http://127.0.0.1:61234", port: 61234 });
    bridge.stopPreview.mockReset().mockResolvedValue(undefined);
    bridge.closeProject.mockReset().mockResolvedValue(undefined);
    useEditorStore.setState({
      project: undefined, document: undefined, loading: false, dirty: false, recentProjects: [],
      pages: [], history: [], future: [], previewUrl: undefined, previewStatus: "idle", previewError: undefined, previewRestarting: false, previewSessionId: undefined, previewProcessExited: false, consoleEntries: [],
    });
  });

  it("opens a newly created project instead of leaving the loading screen up", async () => {
    await useEditorStore.getState().createProject();

    expect(bridge.createProject).toHaveBeenCalledWith(root);
    expect(bridge.createWorkingCopy).toHaveBeenCalledWith(root);
    expect(useEditorStore.getState().project?.name).toBe("panel");
    expect(useEditorStore.getState().loading).toBe(false);
  }, 15_000);

  it("creates the standard preset with all generated files before opening it", async () => {
    await useEditorStore.getState().createStandardProject({ machineName: "Linea 1", layout: "desktop-mobile", sections: ["main", "alarms"] });

    expect(bridge.createProject).toHaveBeenCalledOnce();
    const [createdRoot, files] = bridge.createProject.mock.calls[0];
    expect(createdRoot).toBe(root);
    expect(files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "src/App.tsx", content: expect.stringContaining("Linea 1") }),
      expect.objectContaining({ path: "src/pages/UpstairPage.tsx" }),
      expect.objectContaining({ path: "src/pages/AlarmsPage.tsx" }),
      expect.objectContaining({ path: "panel.json" }),
    ]));
    expect(useEditorStore.getState().project?.name).toBe("panel");
  }, 90_000);

  it("passes the selected Settings session through the real new-panel pipeline", async () => {
    await useEditorStore.getState().createStandardProject({
      machineName: "Pallettizzatore Classic",
      layout: "desktop-mobile",
      sections: ["settings"],
      settingsProgram: "classic",
    });

    const [, files] = bridge.createProject.mock.calls[0];
    const paths = files.map((file: { path: string }) => file.path);
    expect(paths).toContain("src/pages/Classic1Page.tsx");
    expect(paths).toContain("src/pages/Classic10Page.tsx");
    expect(paths).not.toContain("src/pages/SettingsPage.tsx");
    const manifest = JSON.parse(files.find((file: { path: string }) => file.path === "panel.json").content);
    expect(manifest.standard.settingsProgram).toBe("classic");
    expect(manifest.editor.pages.slice(0, 10).map((page: { pageNumber: number }) => page.pageNumber)).toEqual([2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]);
  }, 90_000);

  it("releases the loading screen when opening fails", async () => {
    bridge.createWorkingCopy.mockRejectedValue(new Error("Cartella non accessibile"));

    await useEditorStore.getState().openProject(root);
    expect(useEditorStore.getState().loading).toBe(false);
    expect(useEditorStore.getState().previewStatus).toBe("error");

    // The editor must still accept the next attempt rather than staying wedged.
    bridge.createWorkingCopy.mockResolvedValue({ root, workspaceRoot: "C:\\work", created: false, warnings: [] });
    await useEditorStore.getState().openProject(root);
    expect(useEditorStore.getState().project?.name).toBe("panel");
    expect(useEditorStore.getState().loading).toBe(false);
  });

  it("opens a project whose entry file does not parse, as a code-only document", async () => {
    // An unterminated JSX tag is past what Babel's error recovery can model.
    bridge.readFile.mockResolvedValue("export default function App() { return <main>Broken");

    await useEditorStore.getState().openProject(root);
    const state = useEditorStore.getState();
    expect(state.project?.name).toBe("panel");
    expect(state.document?.source).toContain("Broken");
    expect(state.document?.roots).toEqual([]);
    expect(state.consoleEntries.some((item) => item.message.includes("errore di sintassi"))).toBe(true);
    expect(state.loading).toBe(false);
  });

  it("keeps a running preview when an output line merely mentions an error", () => {
    useEditorStore.setState({ previewStatus: "ready", previewError: undefined });

    useEditorStore.getState().addPreviewOutput("stdout", "hmr update /src/App.jsx (0 errors)");
    expect(useEditorStore.getState().previewStatus).toBe("ready");

    useEditorStore.getState().addPreviewOutput("stderr", "Failed to fetch dynamically imported module");
    expect(useEditorStore.getState().previewStatus).toBe("ready");
  });

  it("reports a fatal startup line as a preview failure", () => {
    useEditorStore.setState({ previewStatus: "starting", previewError: undefined });

    useEditorStore.getState().addPreviewOutput("stderr", "Error: listen EADDRINUSE: address already in use 127.0.0.1:5173");
    expect(useEditorStore.getState().previewStatus).toBe("error");
  });

  it("restarts the preview without reopening the project", async () => {
    await useEditorStore.getState().openProject(root);
    const document = useEditorStore.getState().document;
    bridge.createWorkingCopy.mockClear();
    bridge.startPreview.mockResolvedValue({ url: "http://127.0.0.1:61999", port: 61999 });

    await useEditorStore.getState().restartPreview();

    expect(bridge.stopPreview).toHaveBeenCalled();
    expect(bridge.createWorkingCopy).not.toHaveBeenCalled();
    expect(useEditorStore.getState().document).toBe(document);
    expect(useEditorStore.getState().previewUrl).toBe("http://127.0.0.1:61999");
  });

  it("reloads the page while preserving URL parameters, the route and unsaved edits", () => {
    const document = { file: "App.jsx", source: "unsaved", nodes: {}, roots: [], version: 1 };
    const history = [{ file: "App.jsx", source: "before" }];
    useEditorStore.setState({ project: analysis() as never, document, dirty: true, history, previewPath: "/settings", previewUrl: "http://127.0.0.1:4173/?custom=yes#screen", previewStatus: "error", previewError: "old error" });
    useEditorStore.getState().refreshPreview();
    const first = useEditorStore.getState().previewUrl!;
    useEditorStore.getState().refreshPreview();
    const state = useEditorStore.getState();
    expect(state.previewUrl).not.toBe(first);
    expect(new URL(state.previewUrl!).searchParams.get("custom")).toBe("yes");
    expect(new URL(state.previewUrl!).hash).toBe("#screen");
    expect(state).toMatchObject({ dirty: true, previewPath: "/settings", previewStatus: "starting", previewError: undefined });
    expect(state.document).toBe(document);
    expect(state.history).toBe(history);
    expect(bridge.startPreview).not.toHaveBeenCalled();
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("starts Vite when refresh is requested without an available server", async () => {
    useEditorStore.setState({ project: analysis() as never, previewUrl: undefined, previewStatus: "error" });
    useEditorStore.getState().refreshPreview();
    await vi.waitFor(() => expect(useEditorStore.getState().previewRestarting).toBe(false));
    expect(bridge.startPreview).toHaveBeenCalledExactlyOnceWith(root, false, useEditorStore.getState().previewSessionId, useEditorStore.getState().handlePreviewExit);
    expect(useEditorStore.getState().previewUrl).toBe("http://127.0.0.1:61234");
  });

  it("does not start duplicate servers for repeated recovery requests", async () => {
    let release!: () => void;
    bridge.stopPreview.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    useEditorStore.setState({ project: analysis() as never });
    const pending = useEditorStore.getState().restartPreview();
    await useEditorStore.getState().restartPreview(true);
    useEditorStore.getState().refreshPreview();
    expect(useEditorStore.getState().previewRestarting).toBe(true);
    expect(bridge.stopPreview).toHaveBeenCalledOnce();
    expect(bridge.startPreview).not.toHaveBeenCalled();
    release();
    await pending;
    expect(bridge.startPreview).toHaveBeenCalledExactlyOnceWith(root, false, useEditorStore.getState().previewSessionId, useEditorStore.getState().handlePreviewExit);
    expect(useEditorStore.getState().previewRestarting).toBe(false);
  });

  it("can retry a failed start without losing a dirty document or undo history", async () => {
    const document = { file: "App.jsx", source: "unsaved", nodes: {}, roots: [], version: 1 };
    const history = [{ file: "App.jsx", source: "before" }];
    useEditorStore.setState({ project: analysis() as never, document, dirty: true, history, selectedId: "button-1" });
    bridge.startPreview.mockRejectedValueOnce(new Error("Vite non si è avviato: config non valida"));
    await useEditorStore.getState().restartPreview();
    expect(useEditorStore.getState()).toMatchObject({ previewStatus: "error", previewRestarting: false, previewError: "Vite non si è avviato: config non valida", dirty: true, selectedId: "button-1" });
    await useEditorStore.getState().restartPreview(true);
    expect(bridge.startPreview).toHaveBeenLastCalledWith(root, true, useEditorStore.getState().previewSessionId, useEditorStore.getState().handlePreviewExit);
    expect(useEditorStore.getState()).toMatchObject({ previewStatus: "starting", previewRestarting: false, previewError: undefined, dirty: true, selectedId: "button-1" });
    expect(useEditorStore.getState().document).toBe(document);
    expect(useEditorStore.getState().history).toBe(history);
    expect(bridge.createWorkingCopy).not.toHaveBeenCalled();
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("does not start recovery while a project is opening", async () => {
    useEditorStore.setState({ project: analysis() as never, loading: true });
    await useEditorStore.getState().restartPreview(true);
    useEditorStore.getState().refreshPreview();
    expect(bridge.startPreview).not.toHaveBeenCalled();
    expect(bridge.stopPreview).not.toHaveBeenCalled();
  });

  it("waits for an in-flight restart before closing the managed project", async () => {
    let release!: (session: { url: string; port: number }) => void;
    bridge.startPreview.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    useEditorStore.setState({ project: analysis() as never });
    const pending = useEditorStore.getState().restartPreview();
    await vi.waitFor(() => expect(bridge.startPreview).toHaveBeenCalledOnce());
    const closing = useEditorStore.getState().closeProject();
    expect(bridge.closeProject).not.toHaveBeenCalled();
    release({ url: "http://127.0.0.1:61999", port: 61999 });
    await Promise.all([pending, closing]);
    expect(bridge.closeProject).toHaveBeenCalledOnce();
    expect(useEditorStore.getState()).toMatchObject({ project: undefined, previewUrl: undefined, previewRestarting: false, previewStatus: "idle", loading: false });
  });

  it("waits for an in-flight restart before opening another project", async () => {
    let release!: (session: { url: string; port: number }) => void;
    bridge.startPreview.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    useEditorStore.setState({ project: analysis() as never });
    const pending = useEditorStore.getState().restartPreview();
    await vi.waitFor(() => expect(bridge.startPreview).toHaveBeenCalledOnce());
    const opening = useEditorStore.getState().openProject(root);
    expect(bridge.createWorkingCopy).not.toHaveBeenCalled();
    release({ url: "http://127.0.0.1:61999", port: 61999 });
    await Promise.all([pending, opening]);
    expect(bridge.createWorkingCopy).toHaveBeenCalledOnce();
    expect(bridge.startPreview).toHaveBeenCalledTimes(2);
    expect(useEditorStore.getState().previewRestarting).toBe(false);
  });

  it("opens the full property sheet when the canvas asks to inspect an element", async () => {
    const { parseSource } = await import("../src/source-parser/parseSource");
    const document = parseSource("App.jsx", "export default function App() { return <main><button>Vai</button></main>; }");
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({ document, selectedId: undefined, propertiesExpandedAt: undefined });

    await useEditorStore.getState().inspectSource(button.source);

    expect(useEditorStore.getState().selectedId).toBe(button.id);
    expect(useEditorStore.getState().propertiesExpandedAt).toBeTypeOf("number");
  });

  it("shows an element rendered from outside the project instead of selecting nothing", async () => {
    // A shared template catalog reached through a Vite alias renders inside the preview but is not
    // part of the working copy, so it must be reported rather than silently ignored.
    useEditorStore.setState({
      project: { ...analysis(), root } as never,
      document: undefined, selectedId: undefined, unresolvedSelection: undefined, externalRoots: [],
    });
    const external = { file: "C:/shared/templates/operator-shell/src/Shell.jsx", start: 10, end: 40, line: 2, column: 3 };

    await useEditorStore.getState().inspectSource(external, "button");

    const state = useEditorStore.getState();
    expect(state.selectedId).toBeUndefined();
    expect(state.unresolvedSelection).toEqual({ file: external.file, tag: "button", source: external, reason: "outside", detail: undefined });
    expect(bridge.readFile).not.toHaveBeenCalledWith(external.file);
  });

  it("clears the outside-the-project notice once a real source node is selected", async () => {
    const { parseSource } = await import("../src/source-parser/parseSource");
    // Vite reports forward slashes while the host reports native ones: both must resolve alike.
    const file = `${root}/src/App.jsx`;
    const document = parseSource(file, "export default function App() { return <main><button>Vai</button></main>; }");
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({ project: { ...analysis(), root } as never, document, unresolvedSelection: { file: "C:/altrove/X.jsx", reason: "outside", source: { file: "C:/altrove/X.jsx", start: 0, end: 1, line: 1, column: 1 } } });

    await useEditorStore.getState().inspectSource(button.source, "button");

    expect(useEditorStore.getState().selectedId).toBe(button.id);
    expect(useEditorStore.getState().unresolvedSelection).toBeUndefined();
  });

  it("edits a shared file the project declares as source, with no unlock step", async () => {
    const { parseSource } = await import("../src/source-parser/parseSource");
    const shared = "C:/shared/templates/operator-shell/src/Shell.jsx";
    const code = "export default function Shell() { return <main><button>Vai</button></main>; }";
    const button = Object.values(parseSource(shared, code).nodes).find((node) => node.type === "button")!;
    bridge.readFile.mockResolvedValue(code);
    useEditorStore.setState({
      project: { ...analysis(), root } as never,
      document: undefined, selectedId: undefined, unresolvedSelection: undefined,
      // What the preview reports on start: the catalog the project reaches through its alias.
      externalRoots: ["C:/shared/templates"],
    });

    await useEditorStore.getState().inspectSource(button.source, "button");

    const state = useEditorStore.getState();
    expect(state.selectedId).toBe(button.id);
    expect(state.unresolvedSelection).toBeUndefined();
    expect(state.document?.file).toBe(shared);
    expect(state.propertiesExpandedAt).toBeTypeOf("number");
  });

  it("adopts the source roots the preview reports when the project opens", async () => {
    bridge.startPreview.mockResolvedValue({
      url: "http://127.0.0.1:61234", port: 61234,
      sourceRoots: ["C:\\work\\panel", "C:\\shared\\templates"],
    });

    await useEditorStore.getState().openProject(root);
    expect(useEditorStore.getState().externalRoots).toEqual(["C:\\work\\panel", "C:\\shared\\templates"]);
  });

  it("reports the files the working copy had to skip", async () => {
    bridge.createWorkingCopy.mockResolvedValue({
      root, workspaceRoot: "C:\\work", created: true, originalRoot: root,
      warnings: ["File saltato C:\\work\\panel\\locked.bin: accesso negato"],
    });

    await useEditorStore.getState().openProject(root);
    expect(useEditorStore.getState().project?.name).toBe("panel");
    expect(useEditorStore.getState().consoleEntries.some((item) => item.message.includes("locked.bin"))).toBe(true);
  });
});
