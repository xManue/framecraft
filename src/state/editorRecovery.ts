import type { StoreApi } from "zustand";
import type { EditorState } from "./editorStore";
import type { EditorDocument, PageDefinition } from "../core/types";
import { desktopAvailable, desktopBridge } from "../filesystem/desktopBridge";
import { joinProjectPath } from "../core/paths";
import { parsePanelManifest } from "../core/panelManifest";

export const editorReloadKey = "framecraft.editor-reload.v1";
const checkpointLifetime = 10 * 60_000;
type Snapshot = { file: string; source: string };
export interface EditorReloadCheckpoint {
  version: 1;
  savedAt: number;
  root: string;
  originalRoot?: string;
  workspaceRoot?: string;
  isWorkingCopy?: boolean;
  document?: Snapshot & { version: number };
  dirty: boolean;
  history: Snapshot[];
  future: Snapshot[];
  pages: PageDefinition[];
  routerFile?: string;
  routerEditable: boolean;
  activePageId?: string;
  requestedStatePage?: string;
  previewPath: string;
  viewMode: EditorState["viewMode"];
  zoom: number;
  fitCanvas: boolean;
}

export interface EditorReloadRecovery {
  checkpoint?: EditorReloadCheckpoint;
  status: "checking" | "failed" | "available" | "opening" | "conflict";
  error?: string;
  persistent?: EditorDraftRecord;
  diskSource?: string;
  reviewedDiskSource?: string;
}

export interface EditorDraftRecord {
  id: string;
  checkpoint: EditorReloadCheckpoint;
  baseSource?: string;
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const optionalString = (value: unknown) => value === undefined || typeof value === "string";
const snapshot = (value: unknown): value is Snapshot => object(value) && typeof value.file === "string" && typeof value.source === "string";
const pathKey = (value: string) => {
  const path = value.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[a-z]:/i.test(path) || path.startsWith("//") ? path.toLowerCase() : path;
};
export const sameEditorRoot = (left: string, right: string) => pathKey(left) === pathKey(right);

export function editorCheckpointFresh(checkpoint: EditorReloadCheckpoint) {
  return Date.now() - checkpoint.savedAt <= checkpointLifetime && checkpoint.savedAt <= Date.now() + 60_000;
}

export function clearEditorReloadCheckpoint() {
  try { window.sessionStorage.removeItem(editorReloadKey); } catch { /* Storage may be blocked. */ }
}

export function createEditorReloadCheckpoint(state: EditorState): EditorReloadCheckpoint | undefined {
  if (!state.project) return;
  const checkpoint: EditorReloadCheckpoint = {
    version: 1, savedAt: Date.now(), root: state.project.root,
    originalRoot: state.project.originalRoot, workspaceRoot: state.project.workspaceRoot, isWorkingCopy: state.project.isWorkingCopy,
    document: state.document && { file: state.document.file, source: state.document.source, version: state.document.version },
    dirty: state.dirty, history: state.history, future: state.future, pages: state.pages,
    routerFile: state.routerFile, routerEditable: state.routerEditable, activePageId: state.activePageId,
    requestedStatePage: state.requestedStatePage, previewPath: state.previewPath,
    viewMode: state.viewMode, zoom: state.zoom, fitCanvas: state.fitCanvas,
  };
  return checkpoint;
}

export function saveEditorReloadCheckpoint(state: EditorState) {
  const checkpoint = createEditorReloadCheckpoint(state);
  if (checkpoint) window.sessionStorage.setItem(editorReloadKey, JSON.stringify(checkpoint));
  else if (!state.reloadRecovery) clearEditorReloadCheckpoint();
}

export function readEditorReloadCheckpoint(): EditorReloadRecovery | undefined {
  let text: string | null;
  try { text = window.sessionStorage.getItem(editorReloadKey); } catch { return undefined; }
  if (!text) return undefined;
  try { return parseEditorReloadCheckpoint(JSON.parse(text)); }
  catch (error) { return { status: "failed", error: error instanceof Error ? error.message : String(error) }; }
}

export function parseEditorReloadCheckpoint(value: unknown, persistent = false): EditorReloadRecovery {
  try {
    if (!object(value) || value.version !== 1 || typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt)
      || typeof value.root !== "string" || !value.root || typeof value.dirty !== "boolean"
      || !Array.isArray(value.history) || !value.history.every(snapshot) || !Array.isArray(value.future) || !value.future.every(snapshot)
      || !Array.isArray(value.pages) || !value.pages.every((page) => object(page) && [page.id, page.name, page.route, page.file].every((part) => typeof part === "string")
        && [page.routerFile, page.componentName, page.stateValue].every(optionalString))
      || (value.document !== undefined && (!object(value.document) || !Number.isInteger(value.document.version) || !snapshot(value.document)))
      || ![value.originalRoot, value.workspaceRoot, value.routerFile, value.activePageId, value.requestedStatePage].every(optionalString)
      || (value.isWorkingCopy !== undefined && typeof value.isWorkingCopy !== "boolean")
      || typeof value.routerEditable !== "boolean" || typeof value.previewPath !== "string" || !/^\/(?![\/\\])/.test(value.previewPath)
      || !["visual", "split", "code"].includes(value.viewMode as string)
      || typeof value.zoom !== "number" || !Number.isFinite(value.zoom) || typeof value.fitCanvas !== "boolean") {
      throw new Error("La copia temporanea dell’editor non è valida. Non è stato aperto alcun progetto.");
    }
    // Reconstruct a whitelist: no cached methods, PLC values, credentials or native grants.
    const documentValue = value.document as EditorReloadCheckpoint["document"];
    const checkpoint: EditorReloadCheckpoint = {
      version: 1, savedAt: value.savedAt, root: value.root, originalRoot: value.originalRoot as string | undefined,
      workspaceRoot: value.workspaceRoot as string | undefined, isWorkingCopy: value.isWorkingCopy as boolean | undefined,
      document: documentValue && { file: documentValue.file, source: documentValue.source, version: documentValue.version }, dirty: value.dirty,
      history: value.history.map((item) => ({ file: item.file, source: item.source })),
      future: value.future.map((item) => ({ file: item.file, source: item.source })),
      pages: (value.pages as PageDefinition[]).map((page) => ({ id: page.id, name: page.name, route: page.route, file: page.file,
        routerFile: page.routerFile, componentName: page.componentName, stateValue: page.stateValue })),
      routerFile: value.routerFile as string | undefined, routerEditable: value.routerEditable,
      activePageId: value.activePageId as string | undefined, requestedStatePage: value.requestedStatePage as string | undefined,
      previewPath: value.previewPath, viewMode: value.viewMode as EditorState["viewMode"], zoom: Math.min(1.5, Math.max(0.25, value.zoom)), fitCanvas: value.fitCanvas,
    };
    if (persistent) return { checkpoint, status: "available" };
    if (!editorCheckpointFresh(checkpoint)) {
      return { checkpoint, status: "failed", error: "La copia temporanea è scaduta. Puoi consultare la bozza, ma non verrà riaperta automaticamente." };
    }
    return { checkpoint, status: "checking" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

function authorizedFiles(checkpoint: EditorReloadCheckpoint, roots: string[]) {
  const files = [checkpoint.document?.file, checkpoint.routerFile, ...checkpoint.history.map((item) => item.file), ...checkpoint.future.map((item) => item.file),
    ...checkpoint.pages.flatMap((page) => [page.file, page.routerFile])].filter((file): file is string => !!file);
  return files.every((file) => !file.includes("\0") && !file.split(/[\\/]/).some((part) => part === "." || part === "..")
    && roots.some((root) => pathKey(file).startsWith(`${pathKey(root)}/`)));
}

export async function recoverEditorReload(store: StoreApi<EditorState>) {
  const pending = store.getState().reloadRecovery;
  const checkpoint = pending?.checkpoint;
  if (!checkpoint || store.getState().project) return;
  if (!pending.persistent && !editorCheckpointFresh(checkpoint)) return;
  const recovery: EditorReloadRecovery = { ...pending, checkpoint, status: "checking" };
  store.setState({ reloadRecovery: recovery });
  const current = () => store.getState().reloadRecovery === recovery && !store.getState().project;
  try {
    if (!desktopAvailable) throw new Error("Il recupero del progetto richiede l’app desktop.");
    const session = await desktopBridge.getEditorSession();
    if (!current()) return;
    if (!session.project || !sameEditorRoot(checkpoint.root, session.project.root)) throw new Error("Il backend non ha più aperto questo progetto. La bozza è conservata; nessuna cartella è stata riaperta o autorizzata.");
    const roots = [session.project.root, ...(session.authorizedRoot ? [session.authorizedRoot] : []), ...session.externalRoots];
    if (!authorizedFiles(checkpoint, roots)) throw new Error("La bozza contiene file non più autorizzati. Nessun permesso è stato aggiunto.");
    const savedDocument = checkpoint.document;
    const { parseSource } = await import("../source-parser/parseSource");
    let document: EditorDocument | undefined;
    let invalidDraft = false;
    if (savedDocument) {
      if (checkpoint.dirty && pending.persistent) {
        const diskSource = await desktopBridge.readFile(savedDocument.file);
        if (!current()) return;
        if (diskSource !== pending.persistent.baseSource && diskSource !== pending.reviewedDiskSource) {
          store.setState({ reloadRecovery: { ...recovery, status: "conflict", diskSource, error: "Il file su disco è cambiato dopo il backup. Scegli quale versione aprire nell’editor: nessun file verrà sovrascritto automaticamente." } });
          return;
        }
      }
      const source = checkpoint.dirty ? savedDocument.source : await desktopBridge.readFile(savedDocument.file);
      try { document = parseSource(savedDocument.file, source, savedDocument.version + 1); }
      catch { document = { file: savedDocument.file, source, version: savedDocument.version + 1, nodes: {}, roots: [] }; invalidDraft = true; }
    }
    const panelManifest = await desktopBridge.readFile(joinProjectPath(session.project.root, "panel.json")).then(parsePanelManifest).catch(() => undefined);
    const verified = await desktopBridge.getEditorSession();
    if (!current()) return;
    if (!verified.project || !sameEditorRoot(checkpoint.root, verified.project.root) || verified.generation !== session.generation
      || !authorizedFiles(checkpoint, [verified.project.root, ...(verified.authorizedRoot ? [verified.authorizedRoot] : []), ...verified.externalRoots])) throw new Error("La sessione è cambiata durante il recupero. Riprova: la bozza è ancora conservata.");
    const preview = verified.preview;
    store.setState({
      project: { ...verified.project, originalRoot: checkpoint.originalRoot, workspaceRoot: checkpoint.workspaceRoot, isWorkingCopy: checkpoint.isWorkingCopy },
      document, dirty: checkpoint.dirty, history: checkpoint.history, future: checkpoint.future, pages: checkpoint.pages,
      routerFile: checkpoint.routerFile, routerEditable: checkpoint.routerEditable, activePageId: checkpoint.activePageId,
      requestedStatePage: checkpoint.requestedStatePage, previewPath: checkpoint.previewPath,
      viewMode: invalidDraft ? "code" : checkpoint.viewMode, zoom: checkpoint.zoom, fitCanvas: checkpoint.fitCanvas,
      previewUrl: preview?.url, previewSessionId: preview?.sessionId, previewStatus: preview ? "starting" : "error", previewProcessExited: false,
      previewError: preview ? undefined : "Vite non risulta attivo. Usa le opzioni nel menu Visualizza per avviare l’anteprima.",
      externalRoots: verified.externalRoots, panelManifest, reloadRecovery: undefined, loading: false,
      interactionMode: "edit", simulation: { on: false, values: {}, status: {}, elements: [], unresolved: [] },
    });
    const reportedExit = preview && store.getState().reportedPreviewExit(preview.sessionId);
    if (reportedExit) store.getState().handlePreviewExit(reportedExit);
    clearEditorReloadCheckpoint();
    const state = store.getState();
    await Promise.all([state.refreshPlcVariables(), state.refreshResourceCatalog(), state.refreshScriptCatalog(), state.refreshFaceplateCatalog(), state.refreshDataLogCatalog()]);
  } catch (error) {
    if (current()) store.setState({ reloadRecovery: { ...recovery, status: "failed", error: error instanceof Error ? error.message : String(error) } });
  }
}

export function installEditorReloadRecovery(store: StoreApi<EditorState>, hot: NonNullable<ImportMeta["hot"]>) {
  if (typeof hot.data.editorReloadCleanup === "function") hot.data.editorReloadCleanup();
  const save = () => {
    try { saveEditorReloadCheckpoint(store.getState()); }
    catch (error) {
      const message = `Aggiornamento fermato: non posso conservare la bozza (${String(error)}). Salva o copia le modifiche prima di ricaricare.`;
      store.setState((state) => ({ lastError: message, consoleOpen: true, consoleEntries: [...state.consoleEntries, {
        id: crypto.randomUUID(), level: "error", source: "editor", message, time: new Date().toLocaleTimeString(),
      }] }));
      // The installed Vite client awaits beforeFullReload listeners before navigating.
      throw new Error(message);
    }
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    try { save(); }
    catch {
      event.preventDefault();
      event.returnValue = "Salva o copia la bozza prima di uscire.";
    }
  };
  hot.on("vite:beforeFullReload", save);
  window.addEventListener("beforeunload", beforeUnload);
  const cleanup = () => {
    hot.off("vite:beforeFullReload", save);
    window.removeEventListener("beforeunload", beforeUnload);
  };
  hot.data.editorReloadCleanup = cleanup;
  hot.dispose(() => {
    try { save(); } catch { /* Keep the unload guard if the replacement module cannot load. */ }
    hot.off("vite:beforeFullReload", save);
  });
  hot.prune(() => {
    cleanup();
    if (hot.data.editorReloadCleanup === cleanup) delete hot.data.editorReloadCleanup;
  });
}
