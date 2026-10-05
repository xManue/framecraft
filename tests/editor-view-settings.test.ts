// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";

const bridge = vi.hoisted(() => ({
  readFile: vi.fn(), writeFile: vi.fn(), startPreview: vi.fn(), stopPreview: vi.fn(), closeProject: vi.fn(),
}));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key), clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size; },
  });
  vi.clearAllMocks();
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

describe("preferenze dell'editor unico", () => {
  it.each(["simple", "advanced"])("ignora la vecchia modalità %s senza perdere le altre preferenze", async (inspectorMode) => {
    const settings = {
      uiDensity: "compatta", paneSizes: { left: 245, inspector: 365 }, workLayout: "plc",
      viewport: "panel-1280", snap: { enabled: true, grid: 10 },
    };
    localStorage.setItem("framecraft.view", JSON.stringify({ ...settings, inspectorMode }));
    const { useEditorStore } = await import("../src/state/editorStore");
    const state = useEditorStore.getState();
    expect(state).toMatchObject(settings);
    expect(state).not.toHaveProperty("inspectorMode");
    expect(state).not.toHaveProperty("setInspectorMode");

    state.setUiDensity("grande");
    expect(JSON.parse(localStorage.getItem("framecraft.view")!)).toEqual({ ...settings, uiDensity: "grande" });
  });

  it.each([
    { layout: "disegno", panel: "components", panes: { left: 220, inspector: 300 } },
    { layout: "plc", panel: "plc", panes: { left: 300, inspector: 350 } },
    { layout: "sviluppo", panel: "project", panes: { left: 260, inspector: 380 } },
  ] as const)("la disposizione $layout cambia solo la disposizione, non il progetto o le funzioni", async ({ layout, panel, panes }) => {
    const { useEditorStore } = await import("../src/state/editorStore");
    const source = "export function Page(){return <button>Avvia</button>}";
    const document = parseSource("C:/panel/Page.tsx", source);
    const selectedId = Object.values(document.nodes).find((node) => node.type === "button")!.id;
    const project = {
      root: "C:/panel", name: "Linea prova", framework: "vite" as const, language: "typescript" as const,
      packageManager: "npm" as const, entryFiles: [], files: [], scripts: {}, dependencies: [],
      hasNodeModules: true, missingDependencies: [],
    };
    const history = [{ file: document.file, source }];
    const future = [{ file: document.file, source }];
    useEditorStore.setState({
      project, document, selectedId, dirty: true, history, future, viewMode: "code",
      interactionMode: "edit", previewUrl: "http://localhost:4173", leftPanelCollapsed: true,
    });

    useEditorStore.getState().applyWorkLayout(layout);
    const state = useEditorStore.getState();
    expect(state).toMatchObject({
      workLayout: layout, leftPanel: panel, paneSizes: panes, leftPanelCollapsed: false,
      selectedId, dirty: true, viewMode: "code", interactionMode: "edit", previewUrl: "http://localhost:4173",
    });
    expect(state.project).toBe(project);
    expect(state.document).toBe(document);
    expect(state.history).toBe(history);
    expect(state.future).toBe(future);
    expect(state).not.toHaveProperty("inspectorMode");
    expect(JSON.parse(localStorage.getItem("framecraft.view")!)).not.toHaveProperty("inspectorMode");
    for (const command of Object.values(bridge)) expect(command).not.toHaveBeenCalled();
  });
});
