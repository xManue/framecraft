import { Component, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { AppShell } from "../editor/AppShell";
import { WelcomeScreen } from "../editor/WelcomeScreen";
import { CommandPalette } from "../editor/CommandPalette";
import { UserAccessWindow } from "../editor/UserAccessWindow";
import { useEditorStore } from "../state/editorStore";
import { desktopAvailable } from "../filesystem/desktopBridge";
import type { PreviewExit, PreviewOutput } from "../core/types";
import { editorCheckpointFresh } from "../state/editorRecovery";
import { installEditorDraftRecovery } from "../state/editorDraft";

export function App() {
  return <EditorErrorBoundary><EditorApp /></EditorErrorBoundary>;
}

class EditorErrorBoundary extends Component<{ children: ReactNode }, { error?: Error; componentStack?: string }> {
  state: { error?: Error; componentStack?: string } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Framecraft render error", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="editor-recovery" role="alert">
      <span><AlertTriangle size={26} /></span>
      <h1>Framecraft non è riuscito a mostrare il progetto</h1>
      <p>{this.state.error.message || "Errore imprevisto dell'interfaccia."}</p>
      {this.state.componentStack && <details className="recovery-details"><summary>Dettagli tecnici</summary><pre>{this.state.componentStack}</pre></details>}
      <button onClick={() => {
        void useEditorStore.getState().closeProject().then(() => this.setState({ error: undefined }));
      }}><RotateCcw size={15} /> Torna ai progetti</button>
    </main>;
  }
}

function ProjectLoadingScreen() {
  const project = useEditorStore((state) => state.project);
  const previewSessionId = useEditorStore((state) => state.previewSessionId);
  const previewOutput = useEditorStore((state) => state.consoleEntries.filter((item) => item.source === "preview").at(-1)?.message);
  return <main className="project-loading" role="status" aria-live="polite">
    <span className="brand-mark">F</span>
    <LoaderCircle className="spin" size={24} />
    <strong>{project ? previewSessionId ? "Avvio dell’anteprima…" : "Preparazione dell’anteprima…" : "Apertura del progetto…"}</strong>
    <p style={{ overflowWrap: "anywhere" }}>{project && previewSessionId && previewOutput
      ? previewOutput.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 300)
      : "Preparo la copia sicura, analizzo le pagine e avvio l’anteprima."}</p>
  </main>;
}

function ReloadRecoveryScreen() {
  const recovery = useEditorStore((state) => state.reloadRecovery)!;
  const retry = useEditorStore((state) => state.retryReloadRecovery);
  const discard = useEditorStore((state) => state.discardReloadRecovery);
  const resume = useEditorStore((state) => state.resumePersistentRecovery);
  const checking = recovery.status === "checking" || recovery.status === "opening";
  const available = recovery.status === "available";
  const conflict = recovery.status === "conflict";
  const draft = recovery.checkpoint?.document;
  return <main className="editor-recovery reload-recovery" role={checking ? "status" : "alert"} aria-live={checking ? "polite" : "assertive"}>
    <span>{checking ? <LoaderCircle className="spin" size={26} /> : <AlertTriangle size={26} />}</span>
    <h1>{recovery.status === "opening" ? "Apertura della copia per il recupero…" : checking ? "Recupero del progetto dopo l’aggiornamento…" : available ? "C’è una bozza locale da recuperare" : conflict ? "Il file su disco è cambiato" : "Il progetto non è ancora stato recuperato"}</h1>
    <p>{recovery.status === "opening" ? "Riapro solo la cartella scelta per il recupero. L’anteprima resta spenta e nessun sorgente viene salvato." : checking ? "Verifico le copie disponibili senza riaprire cartelle, salvare file o riavviare l’anteprima." : available ? "Questa copia è sopravvissuta al riavvio dell’app. Puoi recuperarla oppure scartarla: il recupero non avvia il pannello e non salva i sorgenti." : recovery.error}</p>
    {recovery.persistent && recovery.checkpoint && <p className="draft-recovery-location">{recovery.checkpoint.root}<br />Backup locale del {new Date(recovery.checkpoint.savedAt).toLocaleString()}</p>}
    {draft && <details className="recovery-details"><summary>Mostra la bozza conservata</summary>
      <p>{draft.file}</p><textarea readOnly value={draft.source} spellCheck={false} aria-label="Bozza conservata del file" />
    </details>}
    {conflict && <details className="recovery-details"><summary>Mostra il file attuale su disco</summary>
      <textarea readOnly value={recovery.diskSource ?? ""} spellCheck={false} aria-label="Versione attuale del file su disco" />
    </details>}
    <div className="recovery-actions">
      {available && <button onClick={() => void resume()}><RotateCcw size={15} /> Riapri questa copia e recupera</button>}
      {conflict && <><button onClick={() => void resume("draft")}>Usa la bozza nell’editor</button><button onClick={() => void resume("disk")}>Usa il file da disco</button></>}
      {recovery.status === "failed" && recovery.checkpoint && (recovery.persistent || editorCheckpointFresh(recovery.checkpoint)) && <button onClick={() => void retry()}><RotateCcw size={15} /> Riprova il recupero</button>}
      <button disabled={recovery.status === "opening"} onClick={() => void discard()}>Torna ai progetti</button>
    </div>
  </main>;
}

function EditorApp() {
  useEffect(() => installEditorDraftRecovery(useEditorStore), []);
  const project = useEditorStore((state) => state.project);
  const loading = useEditorStore((state) => state.loading);
  const reloadRecovery = useEditorStore((state) => state.reloadRecovery);
  const backupError = useEditorStore((state) => state.draftBackup?.error);
  const retryBackup = useEditorStore((state) => state.retryDraftBackup);
  const paletteOpen = useEditorStore((state) => state.paletteOpen);
  const userAccessOpen = useEditorStore((state) => state.userAccessOpen);
  const setPaletteOpen = useEditorStore((state) => state.setPaletteOpen);
  const save = useEditorStore((state) => state.save);
  const saveAs = useEditorStore((state) => state.saveProjectAs);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const remove = useEditorStore((state) => state.deleteSelection);
  const duplicate = useEditorStore((state) => state.duplicateSelection);

  useEffect(() => {
    if (!desktopAvailable) return;
    // Subscribing is asynchronous, so a cleanup that runs before it resolves (StrictMode does exactly
    // that) would leave the first listeners attached and every host event would be handled twice.
    let active = true;
    const disposes: (() => void)[] = [];
    const fileTimers = new Set<number>();
    void import("@tauri-apps/api/event").then(({ listen }) => Promise.all([
      listen<string>("project-file-changed", (event) => {
        if (!active) return;
        const timer = window.setTimeout(() => {
          fileTimers.delete(timer);
          if (active) void useEditorStore.getState().handleExternalFileChange(event.payload);
        }, 180);
        fileTimers.add(timer);
      }),
      listen<PreviewOutput>("preview-output", (event) => {
        if (active) useEditorStore.getState().addPreviewOutput(event.payload.stream, event.payload.line, event.payload.sessionId);
      }),
      listen<PreviewExit>("preview-exit", (event) => {
        if (active) useEditorStore.getState().handlePreviewExit(event.payload);
      }),
    ].map((listener) => listener.then((dispose) => {
      if (active) disposes.push(dispose); else dispose();
    })))).catch((error) => {
      if (active) useEditorStore.getState().addPreviewOutput("stderr", `Impossibile ricevere gli eventi desktop: ${String(error)}`);
    });
    return () => { active = false; disposes.forEach((dispose) => dispose()); fileTimers.forEach((timer) => window.clearTimeout(timer)); };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (useEditorStore.getState().reloadRecovery) return;
      const target = event.target as HTMLElement | null;
      // A key can arrive with the document itself as its target, and asking that for `matches` throws
      // inside the listener, which used to kill every shortcut for the rest of the session.
      const editing = Boolean(target?.matches?.("input, textarea, select, [contenteditable=true]"));
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void (event.shiftKey ? saveAs() : save());
      } else if (mod && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void useEditorStore.getState().chooseAndOpenProject();
      } else if (!editing && mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void (event.shiftKey ? redo() : undo());
      } else if (!editing && mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        void redo();
      } else if (!editing && (event.key === "Delete" || event.key === "Del" || event.key === "Backspace" || event.code === "Delete")) {
        event.preventDefault();
        void remove();
      } else if (!editing && mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void duplicate();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [duplicate, redo, remove, save, saveAs, setPaletteOpen, undo]);

  return (
    <>
      {reloadRecovery ? <ReloadRecoveryScreen /> : loading ? <ProjectLoadingScreen /> : project ? <AppShell /> : <WelcomeScreen />}
      {!reloadRecovery && project && backupError && <aside className="draft-backup-warning" role="alert"><p>{backupError}</p><button onClick={() => void retryBackup()}>Riprova il backup</button></aside>}
      {paletteOpen && <CommandPalette />}
      {userAccessOpen && <UserAccessWindow />}
    </>
  );
}
