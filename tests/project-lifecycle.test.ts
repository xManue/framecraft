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
      pages: [], history: [], future: [], previewUrl: undefined, previewStatus: "idle", previewError: undefined, consoleEntries: [],
    });
  });

  it("opens a newly created project instead of leaving the loading screen up", async () => {
    await useEditorStore.getState().createProject();

    expect(bridge.createProject).toHaveBeenCalledWith(root);
    expect(bridge.createWorkingCopy).toHaveBeenCalledWith(root);
    expect(useEditorStore.getState().project?.name).toBe("panel");
    expect(useEditorStore.getState().loading).toBe(false);
  });

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
