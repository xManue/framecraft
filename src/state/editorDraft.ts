import type { StoreApi } from "zustand";
import type { EditorState } from "./editorStore";
import { desktopAvailable, desktopBridge } from "../filesystem/desktopBridge";
import { createEditorReloadCheckpoint, parseEditorReloadCheckpoint, recoverEditorReload, sameEditorRoot, type EditorDraftRecord } from "./editorRecovery";

type Controller = { flush: () => Promise<EditorDraftRecord | undefined>; pause: () => Promise<void>; dispose: () => void };
const controllers: WeakMap<StoreApi<EditorState>, Controller> = import.meta.hot?.data?.draftControllers ?? new WeakMap();
if (import.meta.hot?.data) import.meta.hot.data.draftControllers = controllers;

function backupError(store: StoreApi<EditorState>, error: unknown) {
  const message = `Bozza locale non conservata: ${error instanceof Error ? error.message : String(error)}. Salva o copia le modifiche prima di chiudere.`;
  if (store.getState().draftBackup?.error === message) return;
  store.setState((state) => ({ draftBackup: { status: "error", error: message }, consoleOpen: true,
    consoleEntries: [...state.consoleEntries, { id: crypto.randomUUID(), level: "error", source: "editor", message, time: new Date().toLocaleTimeString() }] }));
}

export function installEditorDraftRecovery(store: StoreApi<EditorState>): () => void {
  if (!desktopAvailable || typeof desktopBridge.readEditorDraft !== "function") return () => {};
  controllers.get(store)?.dispose();
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstChange = 0;
  let pending = false;
  let paused = false;
  let work: Promise<void> | undefined;
  let lastSavedAt = 0;
  let lastRecord: EditorDraftRecord | undefined;
  let bootstrap: EditorState["reloadRecovery"];
  const cancelTimer = () => { clearTimeout(timer); timer = undefined; firstChange = 0; };
  const flush = async () => {
    cancelTimer();
    if (paused || !active) return;
    pending = true;
    if (!work) {
      work = (async () => {
        while (active && !paused && pending) {
          pending = false;
          const state = store.getState();
          if (!state.project || state.loading || state.reloadRecovery) break;
          const checkpoint = createEditorReloadCheckpoint(state)!;
          checkpoint.savedAt = Math.max(checkpoint.savedAt, lastSavedAt + 1);
          lastSavedAt = checkpoint.savedAt;
          store.setState({ draftBackup: { status: "saving" } });
          try {
            const record = await desktopBridge.writeEditorDraft(checkpoint);
            if (active && !paused && store.getState().project === state.project) {
              lastRecord = record;
              store.setState({ draftBackup: { status: "saved", savedAt: record.checkpoint.savedAt } });
            }
          } catch (error) {
            if (active && !paused && store.getState().project === state.project) backupError(store, error);
            throw error;
          }
        }
      })().finally(() => { work = undefined; });
    }
    await work;
    return lastRecord;
  };
  const schedule = () => {
    if (paused || !active) return;
    pending = true;
    if (!firstChange) firstChange = Date.now();
    clearTimeout(timer);
    timer = setTimeout(() => { void flush().catch(() => {}); }, Math.max(0, Math.min(500, 3000 - (Date.now() - firstChange))));
  };
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.project && state.project !== previous.project) paused = false;
    if (!state.project || state.reloadRecovery || state.loading) return;
    if (state.project !== previous.project || state.document !== previous.document || state.dirty !== previous.dirty
      || state.history !== previous.history || state.future !== previous.future || state.pages !== previous.pages
      || state.previewPath !== previous.previewPath || state.requestedStatePage !== previous.requestedStatePage
      || state.viewMode !== previous.viewMode || (previous.loading && !state.loading)) schedule();
  });
  const beforeUnload = () => { void flush().catch(() => {}); };
  window.addEventListener("beforeunload", beforeUnload);
  const controller: Controller = {
    flush,
    pause: async () => { paused = true; pending = false; cancelTimer(); try { await work; } catch { /* The last good record is retained. */ } },
    dispose: () => {
      active = false; cancelTimer(); unsubscribe(); window.removeEventListener("beforeunload", beforeUnload);
      if (controllers.get(store) === controller) controllers.delete(store);
      if (bootstrap && store.getState().reloadRecovery === bootstrap) store.setState({ reloadRecovery: undefined });
    },
  };
  controllers.set(store, controller);
  if (store.getState().project) schedule();
  else if (!store.getState().reloadRecovery) {
    const loading = { status: "checking" as const };
    bootstrap = loading;
    store.setState({ reloadRecovery: loading });
    void desktopBridge.readEditorDraft().then((record) => {
      if (!active || store.getState().reloadRecovery !== loading || store.getState().project) return;
      if (!record) { store.setState({ reloadRecovery: undefined }); return; }
      if (!/^\d+-\d+$/.test(record.id) || (record.baseSource !== undefined && typeof record.baseSource !== "string")) throw new Error("La bozza locale non ha un formato valido.");
      const parsed = parseEditorReloadCheckpoint(record.checkpoint, true);
      if (!parsed.checkpoint) throw new Error(parsed.error);
      store.setState({ reloadRecovery: { ...parsed, persistent: { ...record, checkpoint: parsed.checkpoint } } });
    }).catch((error) => {
      if (active && store.getState().reloadRecovery === loading) store.setState({ reloadRecovery: { status: "failed", error: `Non posso leggere le bozze locali: ${String(error)}. Nessun progetto è stato riaperto.` } });
    });
  }
  return controller.dispose;
}

export async function clearDurableEditorDraft(store: StoreApi<EditorState>, record?: EditorDraftRecord) {
  const controller = controllers.get(store);
  await controller?.pause();
  try {
    if (typeof desktopBridge.clearEditorDraft === "function" && (record || store.getState().project)) await desktopBridge.clearEditorDraft(record);
    store.setState({ draftBackup: undefined });
  } catch (error) {
    controller?.dispose();
    installEditorDraftRecovery(store);
    throw error;
  }
  // Keep the subscription paused until a new project object is installed.
}

export async function resumeEditorDraft(store: StoreApi<EditorState>, choice?: "draft" | "disk") {
  const pending = store.getState().reloadRecovery;
  const record = pending?.persistent;
  if (!pending?.checkpoint || !record || ["opening", "checking"].includes(pending.status)) return;
  const checkpoint = choice === "disk" ? { ...pending.checkpoint, dirty: false, history: [], future: [] } : pending.checkpoint;
  const opening = { ...pending, checkpoint, status: "opening" as const, reviewedDiskSource: choice === "draft" ? pending.diskSource : pending.reviewedDiskSource };
  store.setState({ reloadRecovery: opening });
  try {
    const session = await desktopBridge.getEditorSession();
    if (store.getState().reloadRecovery !== opening) return;
    if (session.project && !sameEditorRoot(session.project.root, checkpoint.root)) throw new Error("Un altro progetto è già aperto: nessuna cartella è stata cambiata.");
    if (!session.project) await desktopBridge.analyzeProject(checkpoint.root);
    if (store.getState().reloadRecovery !== opening) return;
    await recoverEditorReload(store);
    if (!store.getState().project) return;
    try {
      // Save the recovered state before removing the previous process's record.
      const saved = await controllers.get(store)?.flush();
      if (saved && saved.id !== record.id) await desktopBridge.clearEditorDraft(record);
    } catch (error) { backupError(store, error); }
  } catch (error) {
    if (store.getState().reloadRecovery === opening) store.setState({ reloadRecovery: { ...opening, status: "failed", error: error instanceof Error ? error.message : String(error) } });
  }
}

export async function flushEditorDraft(store: StoreApi<EditorState>) { await controllers.get(store)?.flush(); }
