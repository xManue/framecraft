// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  createWorkingCopy: vi.fn(),
  analyzeProject: vi.fn(),
  readFile: vi.fn(),
  startPreview: vi.fn(),
}));

vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: {
    ...bridge,
    writeFile: vi.fn(),
    stopPreview: vi.fn(),
  },
}));

import { useEditorStore } from "../src/state/editorStore";

describe("recent project opening", () => {
  beforeEach(() => {
    const root = "C:\\work\\panel";
    bridge.createWorkingCopy.mockReset().mockResolvedValue({ root, workspaceRoot: "C:\\work", created: false });
    bridge.analyzeProject.mockReset().mockResolvedValue({
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
    });
    bridge.readFile.mockReset().mockResolvedValue("export default function App() { return <main>Panel</main>; }");
    bridge.startPreview.mockReset();
    useEditorStore.setState({ project: undefined, document: undefined, loading: false, recentProjects: [root], pages: [], history: [], future: [] });
  });

  it("keeps the loading screen active until the preview is ready", async () => {
    let finishPreview!: (value: { url: string; port: number }) => void;
    bridge.startPreview.mockReturnValue(new Promise((resolve) => { finishPreview = resolve; }));

    const opening = useEditorStore.getState().openProject("C:\\work\\panel");
    await vi.waitFor(() => expect(bridge.startPreview).toHaveBeenCalledOnce());
    expect(useEditorStore.getState().loading).toBe(true);

    finishPreview({ url: "http://127.0.0.1:61234", port: 61234 });
    await opening;
    expect(useEditorStore.getState().loading).toBe(false);
    expect(useEditorStore.getState().previewUrl).toBe("http://127.0.0.1:61234");
  });

  it("ignores a second recent-project click while opening", async () => {
    let finishPreview!: (value: { url: string; port: number }) => void;
    bridge.startPreview.mockReturnValue(new Promise((resolve) => { finishPreview = resolve; }));

    const first = useEditorStore.getState().openProject("C:\\work\\panel");
    await vi.waitFor(() => expect(bridge.startPreview).toHaveBeenCalledOnce());
    await useEditorStore.getState().openProject("C:\\work\\panel");
    expect(bridge.createWorkingCopy).toHaveBeenCalledOnce();

    finishPreview({ url: "http://127.0.0.1:61234", port: 61234 });
    await first;
  });
});
