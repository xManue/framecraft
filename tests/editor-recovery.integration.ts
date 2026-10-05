import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { build } from "vite";
import { readFileSync } from "node:fs";
import editorConfig from "../vite.config";
import type { useEditorStore as editorStore } from "../src/state/editorStore";
import type { EditorNativeSession } from "../src/core/types";
import type { EditorDraftRecord, EditorReloadCheckpoint } from "../src/state/editorRecovery";
import type * as recoveryEntry from "./fixtures/editor-recovery-entry";

type Store = typeof editorStore;
type Hot = { data: Record<string, unknown>; on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; prune: ReturnType<typeof vi.fn> };
const hot = (): Hot => ({ data: {}, on: vi.fn(), off: vi.fn(), dispose: vi.fn(), prune: vi.fn() });
const project = {
  root: "C:/panel", name: "Linea", framework: "vite" as const, language: "javascript" as const,
  packageManager: "npm" as const, entryFiles: ["C:/panel/src/App.jsx"], files: [], scripts: {},
  dependencies: ["react"], hasNodeModules: true, missingDependencies: [],
};
const draft = { file: project.entryFiles[0], source: "export default function App(){return <button>Bozza</button>}", nodes: {}, roots: [], version: 3 };
let code = "";

function compiled(context?: Hot): typeof recoveryEntry {
  const module = { exports: {} as typeof recoveryEntry };
  new Function("exports", "module", "__FRAMECRAFT_TEST_HOT__", code)(module.exports, module, context);
  return module.exports;
}
function load(context: Hot): Store { return compiled(context).useEditorStore; }

beforeAll(async () => {
  const result = await build({
    ...editorConfig, configFile: false, logLevel: "silent",
    define: { ...editorConfig.define, "import.meta.hot": "__FRAMECRAFT_TEST_HOT__" },
    build: { ...editorConfig.build, write: false, lib: { entry: "tests/fixtures/editor-recovery-entry.ts", formats: ["cjs"] }, rollupOptions: { output: { inlineDynamicImports: true } } },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output)) throw new Error("Store compilato non trovato.");
  const entry = output.output.find((chunk) => chunk.type === "chunk" && chunk.isEntry);
  if (!entry || entry.type !== "chunk") throw new Error("Store compilato non trovato.");
  code = entry.code;
}, 120_000);

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() };
}

beforeEach(() => {
  const localStorage = storage(); const sessionStorage = storage();
  vi.stubGlobal("localStorage", localStorage); vi.stubGlobal("sessionStorage", sessionStorage);
  vi.stubGlobal("window", { localStorage, sessionStorage, addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: vi.fn(() => true) });
});
afterEach(() => vi.unstubAllGlobals());

function nativeSession(overrides: Partial<EditorNativeSession> = {}): EditorNativeSession {
  return { project, preview: { url: "http://127.0.0.1:4173", port: 4173, sessionId: "live" }, externalRoots: [], authorizedRoot: project.root, generation: 1, ...overrides };
}
function native(session = nativeSession()) {
  vi.stubGlobal("isTauri", true);
  const invoke = vi.fn(async (command: string, args?: { path: string }): Promise<unknown> => {
    if (command === "get_editor_session") return session;
    if (command === "list_project_source_files") return [];
    if (command === "read_text_file" && args?.path === draft.file) return "export default function App(){return <p>Disco aggiornato</p>}";
    if (command === "read_text_file") throw new Error("Catalogo facoltativo non presente");
    throw new Error(`Comando non consentito nel recupero: ${command}`);
  });
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke };
  return invoke;
}
function save(context: Hot) {
  const callback = [...context.on.mock.calls].reverse().find(([name]) => name === "vite:beforeFullReload")?.[1] as () => void;
  if (!callback) throw new Error("Hook di recupero non registrato.");
  callback();
}
async function restored(context: Hot) { await context.data.recoveryTask; }

describe("aggiornamenti del vero store compilato", () => {
  it("mantiene progetto, bozza, cronologia e sottoscrizioni aggiornando le azioni", () => {
    const context = hot(); const first = load(context);
    const history = [{ file: draft.file, source: "prima" }];
    first.setState({ project, document: draft, dirty: true, history, previewPath: "/settings", viewMode: "code" });
    const previousAction = first.getState().setZoom;
    const listener = vi.fn(); const unsubscribe = first.subscribe(listener);
    const next = load(context);
    expect(next).toBe(first);
    expect(next.getState().project).toBe(project);
    expect(next.getState().document).toBe(draft);
    expect(next.getState().history).toBe(history);
    expect(next.getState()).toMatchObject({ dirty: true, previewPath: "/settings", viewMode: "code" });
    expect(next.getState().setZoom).not.toBe(previousAction);
    listener.mockClear(); next.getState().setZoom(1);
    expect(listener).toHaveBeenCalledOnce(); unsubscribe();
  });

  it("non ricrea un progetto chiuso quando il modulo viene aggiornato", () => {
    const context = hot(); const first = load(context);
    first.setState({ project, document: draft });
    first.setState({ project: undefined, document: undefined });
    const next = load(context);
    expect(next).toBe(first);
    expect(next.getState().project).toBeUndefined();
    expect(next.getState().document).toBeUndefined();
  });

  it("invalida una lettura iniziata prima di HMR quando viene selezionato un altro file", async () => {
    let release!: (value: string) => void;
    const invoke = native();
    invoke.mockImplementation(async (command, args) => {
      if (command === "read_text_file" && args?.path.endsWith("Old.jsx")) return new Promise<string>((resolve) => { release = resolve; });
      if (command === "read_text_file") return "export default function New(){return <p>Nuovo</p>}";
      throw new Error(command);
    });
    const context = hot(); const first = load(context); first.setState({ project, document: draft, dirty: false });
    const pending = first.getState().openFile("C:/panel/src/Old.jsx");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const next = load(context);
    await next.getState().openFile("C:/panel/src/New.jsx");
    release("export default function Old(){return <p>Vecchio</p>}"); await pending;
    expect(next.getState().document?.file).toBe("C:/panel/src/New.jsx");
    expect(next.getState().document?.source).toContain("Nuovo");
    expect(invoke.mock.calls.every(([command]) => command === "read_text_file")).toBe(true);
  });

  it("recupera il reload completo senza perdere la bozza o riavviare/scrivere file", async () => {
    const invoke = native(); const context = hot(); const first = load(context);
    const history = [{ file: draft.file, source: "prima" }]; const future = [{ file: draft.file, source: "dopo" }];
    first.setState({ project, document: draft, dirty: true, history, future, previewPath: "/settings", viewMode: "code",
      interactionMode: "navigate", simulation: { on: true, values: { Run: "1" }, status: {}, elements: [], unresolved: [] },
      userAccessConfig: { accounts: [], permissions: [], autoLogoutMinutes: 15 }, previewUrl: "http://stale.invalid", previewSessionId: "stale" });
    save(context);
    const saved = JSON.parse(sessionStorage.getItem("framecraft.editor-reload.v1")!);
    for (const field of ["previewUrl", "previewSessionId", "simulation", "userAccessConfig", "externalRoots"]) expect(saved).not.toHaveProperty(field);
    const reload = hot(); const next = load(reload); await restored(reload);
    expect(next).not.toBe(first);
    expect(next.getState()).toMatchObject({ project, dirty: true, history, future, previewPath: "/settings", viewMode: "code",
      interactionMode: "edit", simulation: { on: false, values: {} }, previewSessionId: "live", previewUrl: "http://127.0.0.1:4173" });
    expect(next.getState().document?.source).toBe(draft.source);
    expect(next.getState().document?.roots.length).toBeGreaterThan(0);
    expect(sessionStorage.getItem("framecraft.editor-reload.v1")).toBeNull();
    expect(invoke.mock.calls.every(([command]) => ["get_editor_session", "read_text_file", "list_project_source_files"].includes(command))).toBe(true);
  });

  it("rilegge il file pulito dal disco ma conserva una bozza con sintassi errata", async () => {
    native(); const context = hot(); const first = load(context);
    first.setState({ project, document: draft, dirty: false }); save(context);
    const cleanContext = hot(); const clean = load(cleanContext); await restored(cleanContext);
    expect(clean.getState().document?.source).toContain("Disco aggiornato");
    clean.setState({ document: { ...draft, source: "export function Broken(){return <p>" }, dirty: true, viewMode: "visual" }); save(cleanContext);
    const dirtyContext = hot(); const dirty = load(dirtyContext); await restored(dirtyContext);
    expect(dirty.getState()).toMatchObject({ dirty: true, viewMode: "code" });
    expect(dirty.getState().document?.source).toBe("export function Broken(){return <p>");
    expect(dirty.getState().document?.roots).toEqual([]);
  });

  it.each(["closed", "different", "unsupported"])("conserva la bozza senza riaprire cartelle quando il backend è %s", async (kind) => {
    const invoke = native(); const context = hot(); const first = load(context);
    first.setState({ project, document: draft, dirty: true }); save(context);
    invoke.mockClear();
    invoke.mockImplementation(async () => {
      if (kind === "unsupported") throw new Error("Command get_editor_session not found");
      return nativeSession({ project: kind === "closed" ? null : { ...project, root: "C:/other" } });
    });
    const reload = hot(); const next = load(reload); await restored(reload);
    expect(next.getState().project).toBeUndefined();
    expect(next.getState().reloadRecovery).toMatchObject({ status: "failed", checkpoint: { document: { source: draft.source } } });
    expect(sessionStorage.getItem("framecraft.editor-reload.v1")).not.toBeNull();
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(["get_editor_session"]);
  });

  it("rifiuta path non autorizzati anche se inseriti nel checkpoint", async () => {
    const invoke = native(); const context = hot(); const first = load(context);
    first.setState({ project, document: { ...draft, file: "C:/outside/App.jsx" }, dirty: true }); save(context); invoke.mockClear();
    const reload = hot(); const next = load(reload); await restored(reload);
    expect(next.getState().reloadRecovery?.error).toContain("non più autorizzati");
    expect(next.getState().project).toBeUndefined();
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(["get_editor_session"]);
  });

  it("non applica il recupero se la sessione cambia durante le letture", async () => {
    const invoke = native(); const context = hot(); const first = load(context);
    first.setState({ project, document: draft, dirty: true }); save(context);
    const base = invoke.getMockImplementation()!; let reads = 0;
    invoke.mockImplementation(async (command, args) => command === "get_editor_session" ? nativeSession({ generation: ++reads }) : base(command, args));
    const reload = hot(); const next = load(reload); await restored(reload);
    expect(next.getState().project).toBeUndefined();
    expect(next.getState().reloadRecovery?.error).toContain("sessione è cambiata");
  });

  it("non ripristina una URL se l'uscita del processo arriva prima della risposta di recupero", async () => {
    const invoke = native(); const context = hot(); const first = load(context);
    first.setState({ project, document: draft, dirty: true }); save(context);
    const base = invoke.getMockImplementation()!; let reads = 0; let next!: Store;
    invoke.mockImplementation(async (command, args) => {
      if (command === "get_editor_session") {
        if (++reads === 2) next.getState().handlePreviewExit({ sessionId: "live", code: 7, message: "Uscita durante il recupero" });
        return nativeSession();
      }
      return base(command, args);
    });
    const reload = hot(); next = load(reload); await restored(reload);
    expect(next.getState().project?.root).toBe(project.root); expect(next.getState().document?.source).toBe(draft.source);
    expect(next.getState()).toMatchObject({ previewUrl: undefined, previewStatus: "error", previewProcessExited: true, previewError: "Uscita durante il recupero", dirty: true });
  });

  it("può lasciare il recupero durante una query senza applicare la sua risposta tardiva", async () => {
    const invoke = native(); const context = hot(); const first = load(context);
    first.setState({ project, document: draft, dirty: true }); save(context);
    let release!: (session: EditorNativeSession) => void;
    invoke.mockImplementation(async () => new Promise<EditorNativeSession>((resolve) => { release = resolve; }));
    const reload = hot(); const next = load(reload);
    expect(next.getState().reloadRecovery?.status).toBe("checking");
    next.getState().discardReloadRecovery(); release(nativeSession()); await restored(reload);
    expect(next.getState().project).toBeUndefined(); expect(next.getState().reloadRecovery).toBeUndefined();
    expect(sessionStorage.getItem("framecraft.editor-reload.v1")).toBeNull();
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(["get_editor_session"]);
  });

  it("richiede conferma per scartare una bozza e non la ripristina al prossimo HMR", async () => {
    native(nativeSession({ project: null })); const context = hot(); const first = load(context);
    first.setState({ project, document: draft, dirty: true }); save(context);
    const reload = hot(); const next = load(reload); await restored(reload);
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await next.getState().discardReloadRecovery(); expect(next.getState().reloadRecovery).toBeDefined();
    await next.getState().discardReloadRecovery(); expect(next.getState().reloadRecovery).toBeUndefined();
    expect(sessionStorage.getItem("framecraft.editor-reload.v1")).toBeNull();
    expect(load(reload).getState().project).toBeUndefined();
  });

  it("recupera nel bundle senza HMR anche con memoria della finestra e sessione nativa nuove", async () => {
    vi.stubGlobal("isTauri", true);
    let backend = nativeSession({ preview: null });
    let processId = "1-111";
    const records = new Map<string, EditorDraftRecord>();
    const disk = "export default function App(){return <p>Disco</p>}";
    const invoke = vi.fn(async (command: string, args?: { checkpoint?: EditorReloadCheckpoint; path?: string; id?: string | null; savedAt?: number }): Promise<unknown> => {
      if (command === "read_editor_draft") return [...records.values()].sort((a, b) => b.checkpoint.savedAt - a.checkpoint.savedAt)[0] ?? null;
      if (command === "write_editor_draft") {
        const record = JSON.parse(JSON.stringify({ id: processId, checkpoint: args!.checkpoint, baseSource: disk })) as EditorDraftRecord;
        records.set(record.id, record); return record;
      }
      if (command === "clear_editor_draft") { records.delete(args!.id ?? processId); return; }
      if (command === "get_editor_session") return backend;
      if (command === "analyze_project") { backend = nativeSession({ preview: null, generation: 2 }); return project; }
      if (command === "list_project_source_files") return [];
      if (command === "read_text_file" && args?.path === draft.file) return disk;
      if (command === "read_text_file") throw new Error("Catalogo facoltativo assente");
      throw new Error(`Azione non consentita nel recupero: ${command}`);
    });
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke };
    const first = compiled(); const store = first.useEditorStore;
    store.setState({ project, document: draft, dirty: true, history: [{ file: draft.file, source: disk }], previewPath: "/settings", viewMode: "code" });
    const disposeFirst = first.installEditorDraftRecovery(store);
    await first.flushEditorDraft(store); disposeFirst();
    const saved = records.get(processId)!;
    expect(saved.checkpoint.document?.source).toBe(draft.source);
    for (const key of ["simulation", "externalRoots", "userAccessConfig", "previewUrl", "previewSessionId"]) expect(saved.checkpoint).not.toHaveProperty(key);
    sessionStorage.clear(); localStorage.clear(); processId = "2-222";
    backend = nativeSession({ project: null, preview: null, authorizedRoot: null, generation: 0 });
    invoke.mockClear();
    const restarted = compiled(); const next = restarted.useEditorStore;
    const dispose = restarted.installEditorDraftRecovery(next);
    try {
      await vi.waitFor(() => expect(next.getState().reloadRecovery?.status).toBe("available"));
      expect(next.getState().project).toBeUndefined();
      expect(invoke.mock.calls.map(([command]) => command)).toEqual(["read_editor_draft"]);
      await next.getState().resumePersistentRecovery();
      expect(next.getState().document?.source).toBe(draft.source); expect(next.getState().dirty).toBe(true);
      expect(next.getState().history).toEqual(saved.checkpoint.history); expect(next.getState().previewPath).toBe("/settings");
      expect(next.getState().simulation.on).toBe(false); expect(next.getState().previewUrl).toBeUndefined();
      expect(records.has("2-222")).toBe(true); expect(records.has("1-111")).toBe(false);
      expect(invoke.mock.calls.some(([command]) => ["start_preview", "stop_preview", "write_text_file", "create_working_copy"].includes(command))).toBe(false);
    } finally { dispose(); }
  });

  it("ferma il full reload del client Vite installato se non può conservare il buffer", async () => {
    const context = hot(); const store = load(context); store.setState({ project, document: draft, dirty: true });
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const source = readFileSync("node_modules/vite/dist/client/client.mjs", "utf8");
    const start = source.indexOf("\tasync notifyListeners(event, data) {"); const end = source.indexOf("\n\tsend(payload)", start);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    const client = new Function(`return ({${source.slice(start, end)}});`)() as { notifyListeners: (name: string, payload: unknown) => Promise<void> };
    const callbacks = context.on.mock.calls.filter(([name]) => name === "vite:beforeFullReload").map(([, callback]) => callback);
    const navigate = vi.fn();
    await expect((async () => {
      await client.notifyListeners.call({ customListenersMap: new Map([["vite:beforeFullReload", callbacks]]) }, "vite:beforeFullReload", {});
      navigate();
    })()).rejects.toThrow("Aggiornamento fermato");
    expect(navigate).not.toHaveBeenCalled(); expect(store.getState().document).toBe(draft);
    expect(store.getState().lastError).toContain("Salva o copia");
  });

  it("conserva il checkpoint e la guardia unload al dispose, sostituendola alla nuova installazione", () => {
    const context = hot(); const store = load(context); store.setState({ project, document: draft, dirty: true });
    const callback = vi.mocked(window.addEventListener).mock.calls.find(([name]) => name === "beforeunload")![1] as EventListener;
    callback({ preventDefault: vi.fn(), returnValue: "" } as unknown as Event);
    expect(sessionStorage.getItem("framecraft.editor-reload.v1")).not.toBeNull();
    for (const [dispose] of context.dispose.mock.calls) dispose();
    expect(context.off).toHaveBeenCalledWith("vite:beforeFullReload", expect.any(Function));
    expect(window.removeEventListener).not.toHaveBeenCalled();
    const saved = sessionStorage.getItem("framecraft.editor-reload.v1"); expect(saved).not.toBeNull();
    load(context);
    expect(window.removeEventListener).toHaveBeenCalledWith("beforeunload", callback);
    for (const [prune] of context.prune.mock.calls) prune();
    expect(context.data.editorReloadCleanup).toBeUndefined();
  });
});
