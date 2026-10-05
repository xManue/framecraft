// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEditorReloadCheckpoint, editorReloadKey, readEditorReloadCheckpoint, saveEditorReloadCheckpoint } from "../src/state/editorRecovery";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
import { useEditorStore } from "../src/state/editorStore";
const project = { root: "C:/panel", name: "Linea", framework: "vite" as const, language: "javascript" as const,
  packageManager: "npm" as const, entryFiles: [], files: [], scripts: {}, dependencies: ["react"], hasNodeModules: true, missingDependencies: [] };
const draft = { file: "C:/panel/App.jsx", source: "bozza", version: 1, nodes: {}, roots: [] };

beforeEach(() => {
  vi.restoreAllMocks(); bridge.readFile.mockReset(); bridge.writeFile.mockReset(); sessionStorage.clear();
  useEditorStore.setState({ project, document: draft, dirty: true, history: [], future: [], pages: [], routerEditable: false,
    previewPath: "/", viewMode: "code", zoom: 1, fitCanvas: true, reloadRecovery: undefined });
});

describe("checkpoint temporaneo dell'editor", () => {
  it("non conserva AST, azioni, credenziali, valori PLC o autorizzazioni del backend", () => {
    saveEditorReloadCheckpoint(useEditorStore.getState());
    const saved = JSON.parse(sessionStorage.getItem(editorReloadKey)!);
    saved.simulation = { on: true, values: { Run: "1" } }; saved.userAccessConfig = { accounts: ["secret"] };
    saved.externalRoots = ["C:/unapproved"]; saved.document.nodes = { stale: {} }; saved.document.extra = "ignore";
    sessionStorage.setItem(editorReloadKey, JSON.stringify(saved));
    const recovery = readEditorReloadCheckpoint()!;
    expect(recovery.status).toBe("checking");
    expect(recovery.checkpoint?.document).toEqual({ file: draft.file, source: "bozza", version: 1 });
    for (const key of ["simulation", "userAccessConfig", "externalRoots", "save", "previewSessionId"]) expect(recovery.checkpoint).not.toHaveProperty(key);
  });

  it("non scarta automaticamente una bozza scaduta", () => {
    saveEditorReloadCheckpoint(useEditorStore.getState());
    const savedAt = Date.now(); vi.spyOn(Date, "now").mockReturnValue(savedAt + 11 * 60_000);
    const recovery = readEditorReloadCheckpoint()!;
    expect(recovery).toMatchObject({ status: "failed", checkpoint: { document: { source: "bozza" } } });
    expect(recovery.error).toContain("scaduta"); expect(sessionStorage.getItem(editorReloadKey)).not.toBeNull();
  });

  it.each(["{invalid", '{"version":99}', '{"version":1,"savedAt":null}'])("segnala un checkpoint corrotto senza aprire progetti: %s", (text) => {
    sessionStorage.setItem(editorReloadKey, text);
    const recovery = readEditorReloadCheckpoint()!;
    expect(recovery.status).toBe("failed"); expect(recovery.checkpoint).toBeUndefined();
    expect(sessionStorage.getItem(editorReloadKey)).toBe(text); expect(bridge.readFile).not.toHaveBeenCalled();
  });

  it("non blocca un avvio ordinario quando lo storage è vietato", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    expect(readEditorReloadCheckpoint()).toBeUndefined(); expect(bridge.readFile).not.toHaveBeenCalled();
  });

  it("non risuscita un progetto chiuso e rimuove soltanto il checkpoint dell'editor", () => {
    sessionStorage.setItem("altro", "conserva"); saveEditorReloadCheckpoint(useEditorStore.getState());
    useEditorStore.setState({ project: undefined }); saveEditorReloadCheckpoint(useEditorStore.getState());
    expect(readEditorReloadCheckpoint()).toBeUndefined(); expect(sessionStorage.getItem("altro")).toBe("conserva");
    expect(() => clearEditorReloadCheckpoint()).not.toThrow();
  });

  it.each([
    ["refreshPlcVariables", "plcVariables"], ["refreshResourceCatalog", "resourceCatalog"], ["refreshScriptCatalog", "scriptCatalog"],
    ["refreshFaceplateCatalog", "faceplateCatalog"], ["refreshDataLogCatalog", "dataLogCatalog"],
  ] as const)("ignora il risultato tardivo di %s dopo il cambio di progetto", async (action, field) => {
    let release!: (source: string) => void;
    bridge.readFile.mockReturnValue(new Promise<string>((resolve) => { release = resolve; }));
    const pending = useEditorStore.getState()[action]();
    const catalog = useEditorStore.getState()[field]; const next = { ...project, root: "C:/other" };
    useEditorStore.setState({ project: next, [field]: catalog });
    release("{}"); await pending;
    expect(useEditorStore.getState().project).toBe(next); expect(useEditorStore.getState()[field]).toBe(catalog);
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it.each(["file", "revision"])("non riporta un vecchio documento nell'editor dopo il cambio di %s", async (change) => {
    let release!: (source: string) => void;
    bridge.readFile.mockReturnValue(new Promise<string>((resolve) => { release = resolve; }));
    useEditorStore.setState({ dirty: false });
    const pending = useEditorStore.getState().handleExternalFileChange(draft.file);
    const next = { ...draft, file: change === "file" ? "C:/panel/Next.jsx" : draft.file, source: "nuova revisione", version: 2 };
    useEditorStore.setState({ document: next, selectedId: "nuova selezione" });
    release("export default function Old(){return <p>Vecchio</p>}"); await pending;
    expect(useEditorStore.getState().document).toBe(next); expect(useEditorStore.getState().selectedId).toBe("nuova selezione");
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });
});
