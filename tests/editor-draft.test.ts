// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
import { createEditorReloadCheckpoint, type EditorDraftRecord } from "../src/state/editorRecovery";
import { flushEditorDraft, installEditorDraftRecovery } from "../src/state/editorDraft";
import type { EditorNativeSession } from "../src/core/types";

const bridge = vi.hoisted(() => ({ readEditorDraft: vi.fn(), writeEditorDraft: vi.fn(), clearEditorDraft: vi.fn(),
  getEditorSession: vi.fn(), analyzeProject: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), startPreview: vi.fn(), stopPreview: vi.fn(), closeProject: vi.fn(), listProjectSourceFiles: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
import { useEditorStore } from "../src/state/editorStore";

const project = { root: "C:/panel", name: "Linea", framework: "vite" as const, language: "javascript" as const,
  packageManager: "npm" as const, entryFiles: ["C:/panel/App.jsx"], files: [], scripts: {}, dependencies: ["react"], hasNodeModules: true, missingDependencies: [] };
const disk = "export default function App(){return <p>Disco</p>}";
const draft = "export default function App(){return <p>Bozza</p>}";
let session: EditorNativeSession;
let record: EditorDraftRecord;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  vi.restoreAllMocks(); vi.useRealTimers(); sessionStorage.clear();
  for (const command of Object.values(bridge)) command.mockReset();
  useEditorStore.setState({ project, document: parseSource(project.entryFiles[0], draft, 3), dirty: true, loading: false,
    history: [{ file: project.entryFiles[0], source: disk }], future: [], pages: [], routerFile: undefined, routerEditable: false,
    previewPath: "/settings", viewMode: "code", zoom: 1, fitCanvas: true, reloadRecovery: undefined, draftBackup: undefined,
    consoleEntries: [], previewUrl: undefined, previewSessionId: undefined });
  record = { id: "1-123", checkpoint: createEditorReloadCheckpoint(useEditorStore.getState())!, baseSource: disk };
  record.checkpoint.savedAt -= 7 * 24 * 60 * 60_000;
  useEditorStore.setState({ project: undefined, document: undefined, dirty: false, history: [] });
  session = { project: null, preview: null, externalRoots: [], authorizedRoot: null, generation: 1 };
  bridge.readEditorDraft.mockResolvedValue(record);
  bridge.writeEditorDraft.mockImplementation(async (checkpoint) => ({ id: "2-123", checkpoint, baseSource: disk }));
  bridge.clearEditorDraft.mockResolvedValue(undefined); bridge.closeProject.mockResolvedValue(undefined);
  bridge.getEditorSession.mockImplementation(async () => session);
  bridge.analyzeProject.mockImplementation(async () => { session = { ...session, project, authorizedRoot: project.root, generation: 2 }; return project; });
  bridge.listProjectSourceFiles.mockResolvedValue([]);
  bridge.readFile.mockImplementation(async (path) => { if (path === project.entryFiles[0]) return disk; throw new Error("Catalogo facoltativo assente"); });
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers(); vi.restoreAllMocks(); });
async function offered() {
  cleanup = installEditorDraftRecovery(useEditorStore);
  await vi.waitFor(() => expect(useEditorStore.getState().reloadRecovery?.status).toBe("available"));
}

describe("bozze locali persistenti dell'editor", () => {
  it("offre una copia precedente al riavvio senza riaprire cartelle o avviare il pannello", async () => {
    await offered();
    expect(useEditorStore.getState().reloadRecovery?.checkpoint?.document?.source).toBe(draft);
    for (const command of [bridge.analyzeProject, bridge.startPreview, bridge.writeFile, bridge.writeEditorDraft, bridge.getEditorSession]) expect(command).not.toHaveBeenCalled();
    expect(useEditorStore.getState().project).toBeUndefined();
  });

  it("recupera solo su scelta esplicita e salva il nuovo backup prima di eliminare quello vecchio", async () => {
    await offered(); await useEditorStore.getState().resumePersistentRecovery();
    const state = useEditorStore.getState();
    expect(bridge.analyzeProject).toHaveBeenCalledExactlyOnceWith(project.root);
    expect(state.document?.source).toBe(draft); expect(state.dirty).toBe(true);
    expect(state.history).toEqual(record.checkpoint.history); expect(state.previewPath).toBe("/settings");
    expect(state.interactionMode).toBe("edit"); expect(state.simulation.on).toBe(false);
    expect(bridge.writeEditorDraft).toHaveBeenCalled();
    expect(bridge.writeEditorDraft.mock.invocationCallOrder[0]).toBeLessThan(bridge.clearEditorDraft.mock.invocationCallOrder[0]);
    expect(bridge.clearEditorDraft).toHaveBeenCalledWith(record);
    expect(bridge.writeFile).not.toHaveBeenCalled(); expect(bridge.startPreview).not.toHaveBeenCalled(); expect(bridge.stopPreview).not.toHaveBeenCalled();
  });

  it("non elimina la copia precedente se il deposito del recupero fallisce", async () => {
    bridge.writeEditorDraft.mockRejectedValue(new Error("disco pieno"));
    await offered(); await useEditorStore.getState().resumePersistentRecovery();
    expect(useEditorStore.getState().document?.source).toBe(draft);
    expect(useEditorStore.getState().draftBackup?.error).toContain("disco pieno");
    expect(bridge.clearEditorDraft).not.toHaveBeenCalled();
  });

  it.each(["draft", "disk"] as const)("mostra il conflitto e rispetta la scelta %s senza sovrascrivere il disco", async (choice) => {
    const changed = "export default function App(){return <p>Modifica esterna</p>}";
    bridge.readFile.mockImplementation(async (path) => { if (path === project.entryFiles[0]) return changed; throw new Error("Catalogo assente"); });
    await offered(); await useEditorStore.getState().resumePersistentRecovery();
    expect(useEditorStore.getState().reloadRecovery?.status).toBe("conflict");
    expect(useEditorStore.getState().reloadRecovery?.diskSource).toBe(changed);
    expect(useEditorStore.getState().project).toBeUndefined(); expect(bridge.writeEditorDraft).not.toHaveBeenCalled();
    await useEditorStore.getState().resumePersistentRecovery(choice);
    expect(useEditorStore.getState().document?.source).toBe(choice === "draft" ? draft : changed);
    expect(useEditorStore.getState().dirty).toBe(choice === "draft");
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("una nuova modifica esterna dopo il confronto richiede un'altra scelta", async () => {
    let changed = "export default function App(){return <p>Prima modifica</p>}";
    bridge.readFile.mockImplementation(async (path) => { if (path === project.entryFiles[0]) return changed; throw new Error("Catalogo assente"); });
    await offered(); await useEditorStore.getState().resumePersistentRecovery();
    changed = "export default function App(){return <p>Seconda modifica</p>}";
    await useEditorStore.getState().resumePersistentRecovery("draft");
    expect(useEditorStore.getState().reloadRecovery?.status).toBe("conflict");
    expect(useEditorStore.getState().reloadRecovery?.diskSource).toBe(changed);
    expect(bridge.writeFile).not.toHaveBeenCalled(); expect(bridge.clearEditorDraft).not.toHaveBeenCalled();
  });

  it("non cambia un altro progetto già aperto né concede percorsi esterni dalla cache", async () => {
    session = { ...session, project: { ...project, root: "C:/other" } };
    await offered(); await useEditorStore.getState().resumePersistentRecovery();
    expect(useEditorStore.getState().reloadRecovery?.error).toContain("Un altro progetto");
    expect(bridge.analyzeProject).not.toHaveBeenCalled(); expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("conserva una bozza esterna non più autorizzata senza tentare letture di quel file", async () => {
    record.checkpoint.document!.file = "C:/unapproved/Secret.jsx";
    await offered(); await useEditorStore.getState().resumePersistentRecovery();
    expect(useEditorStore.getState().reloadRecovery?.error).toContain("non più autorizzati");
    expect(bridge.readFile).not.toHaveBeenCalledWith("C:/unapproved/Secret.jsx");
    expect(bridge.clearEditorDraft).not.toHaveBeenCalled();
  });

  it("mantiene l'errore e la bozza se il file è scomparso", async () => {
    bridge.readFile.mockRejectedValue(new Error("file non trovato"));
    await offered(); await useEditorStore.getState().resumePersistentRecovery();
    expect(useEditorStore.getState().reloadRecovery?.error).toContain("file non trovato");
    expect(useEditorStore.getState().reloadRecovery?.checkpoint?.document?.source).toBe(draft);
    expect(bridge.clearEditorDraft).not.toHaveBeenCalled();
  });

  it("chiede conferma allo scarto e non ferma o riavvia l'anteprima", async () => {
    await offered(); vi.spyOn(window, "confirm").mockReturnValue(false);
    await useEditorStore.getState().discardReloadRecovery(); expect(bridge.clearEditorDraft).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    await useEditorStore.getState().discardReloadRecovery();
    expect(bridge.clearEditorDraft).toHaveBeenCalledWith(record);
    expect(useEditorStore.getState().reloadRecovery).toBeUndefined();
    expect(bridge.startPreview).not.toHaveBeenCalled(); expect(bridge.stopPreview).not.toHaveBeenCalled();
  });

  it("lo scarto fallito non perde il riferimento recuperabile", async () => {
    bridge.clearEditorDraft.mockRejectedValue(new Error("accesso negato"));
    await offered(); vi.spyOn(window, "confirm").mockReturnValue(true);
    await useEditorStore.getState().discardReloadRecovery();
    expect(useEditorStore.getState().reloadRecovery?.status).toBe("failed");
    expect(useEditorStore.getState().reloadRecovery?.checkpoint?.document?.source).toBe(draft);
  });

  it("StrictMode può disporre e reinstallare il controller durante la lettura iniziale", async () => {
    let release!: (value: EditorDraftRecord) => void;
    bridge.readEditorDraft.mockReturnValueOnce(new Promise<EditorDraftRecord>((resolve) => { release = resolve; }));
    const first = installEditorDraftRecovery(useEditorStore); first();
    await offered(); release({ ...record, id: "9-999" }); await Promise.resolve();
    expect(useEditorStore.getState().reloadRecovery?.persistent?.id).toBe("1-123");
  });

  it("raggruppa le modifiche ma scrive entro tre secondi anche durante digitazione continua", async () => {
    vi.useFakeTimers(); useEditorStore.setState({ project, document: parseSource(project.entryFiles[0], draft), dirty: true });
    cleanup = installEditorDraftRecovery(useEditorStore);
    for (let index = 0; index < 31; index++) {
      useEditorStore.setState((state) => ({ document: { ...state.document!, source: `${draft}\n// ${index}`, version: index + 1 } }));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(bridge.writeEditorDraft).toHaveBeenCalled();
    const checkpoint = bridge.writeEditorDraft.mock.calls[0][0];
    expect(checkpoint.document).not.toHaveProperty("nodes"); expect(checkpoint).not.toHaveProperty("simulation"); expect(checkpoint).not.toHaveProperty("externalRoots");
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("serializza il backup: una risposta lenta è seguita dalla revisione più recente", async () => {
    let release!: (record: EditorDraftRecord) => void;
    bridge.writeEditorDraft.mockReturnValueOnce(new Promise<EditorDraftRecord>((resolve) => { release = resolve; }));
    useEditorStore.setState({ project, document: parseSource(project.entryFiles[0], draft), dirty: true });
    cleanup = installEditorDraftRecovery(useEditorStore);
    const first = flushEditorDraft(useEditorStore);
    useEditorStore.setState((state) => ({ document: { ...state.document!, source: `${draft}\n// nuova revisione` } }));
    const latest = flushEditorDraft(useEditorStore);
    release({ id: "2-123", checkpoint: bridge.writeEditorDraft.mock.calls[0][0] });
    await Promise.all([first, latest]);
    expect(bridge.writeEditorDraft).toHaveBeenCalledTimes(2);
    expect(bridge.writeEditorDraft.mock.calls[1][0].document.source).toContain("nuova revisione");
  });

  it("riprende i backup quando si apre un nuovo progetto dopo la chiusura", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    useEditorStore.setState({ project, document: parseSource(project.entryFiles[0], draft), dirty: true });
    cleanup = installEditorDraftRecovery(useEditorStore);
    await flushEditorDraft(useEditorStore); await useEditorStore.getState().closeProject();
    bridge.writeEditorDraft.mockClear();
    useEditorStore.setState({ project: { ...project }, document: parseSource(project.entryFiles[0], disk), dirty: false });
    await flushEditorDraft(useEditorStore);
    expect(bridge.writeEditorDraft).toHaveBeenCalledOnce();
  });
});
