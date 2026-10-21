import { Component, Suspense, useEffect, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { WelcomeScreen } from "../editor/WelcomeScreen";
import { useEditorStore } from "../state/editorStore";
import { desktopAvailable } from "../filesystem/desktopBridge";
import type { PreviewExit, PreviewOutput } from "../core/types";
import { editorCheckpointFresh } from "../state/editorRecovery";
import { installEditorDraftRecovery } from "../state/editorDraft";
import { MessageNotice } from "../editor/MessageNotice";
import { describeEditorMessage, isModuleLoadError } from "../core/editorMessages";
import { installEditorKeyboardShortcuts } from "../core/editorCommands";
import { useEditorShortcuts } from "../state/editorShortcuts";
import { useEditorGuidance } from "../state/editorGuidance";
import { useEditorAi } from "../state/editorAi";
import { useAiAccountEvents } from "../ai/useAiAccountEvents";
import { installAiInterviewDraftRecovery } from "../state/editorAiDraft";
import { installAiChatProjectScope } from "../state/editorAiChat";
import { createEditorComponents } from "./editorComponents";

function InterfaceLoading() {
  return <div className="interface-loading" role="status" aria-live="polite"><LoaderCircle className="spin" size={18} /> Caricamento dell’interfaccia…</div>;
}

export function App() {
  const [components, setComponents] = useState(() => createEditorComponents());
  return <EditorErrorBoundary onRetry={() => setComponents(createEditorComponents(true))}><EditorApp components={components} /></EditorErrorBoundary>;
}

class EditorErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { error?: Error; componentStack?: string }> {
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
      <MessageNotice context="interface" raw={[this.state.error.message, this.state.componentStack].filter(Boolean).join("\n")} />
      {isModuleLoadError(this.state.error.message) && <button onClick={() => {
        this.props.onRetry();
        this.setState({ error: undefined, componentStack: undefined });
      }}><RotateCcw size={15} /> Riprova caricamento</button>}
      <button onClick={() => {
        void useEditorStore.getState().closeProject().then(() => {
          if (!useEditorStore.getState().project && !useEditorStore.getState().reloadRecovery) {
            this.props.onRetry();
            this.setState({ error: undefined, componentStack: undefined });
          }
        });
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
      ? describeEditorMessage(previewOutput, "preview", "info").text.slice(0, 300)
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
  const checkpoint = recovery.checkpoint;
  const page = checkpoint?.pages.find((item) => item.id === checkpoint.activePageId || item.file === draft?.file);
  const projectName = checkpoint?.root.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1);
  return <main className="editor-recovery reload-recovery" role={checking ? "status" : "alert"} aria-live={checking ? "polite" : "assertive"}>
    <span>{checking ? <LoaderCircle className="spin" size={26} /> : <AlertTriangle size={26} />}</span>
    <h1>{recovery.status === "opening" ? "Apertura della copia per il recupero…" : checking ? "Recupero del progetto dopo l’aggiornamento…" : available ? "C’è una bozza locale da recuperare" : conflict ? "Il file su disco è cambiato" : "Il progetto non è ancora stato recuperato"}</h1>
    {checking ? <p>{recovery.status === "opening" ? "Riapro la cartella della bozza. Il recupero non salva la pagina e non avvia il pannello." : "Controllo la copia automatica del lavoro precedente. Non vengono salvati file né avviato il pannello."}</p>
      : available ? <p>Framecraft ha conservato una copia automatica della pagina su cui lavoravi. Usa “Recupera bozza e riprendi il lavoro” per ritrovarla nell’editor: non occorre leggere il codice.</p>
      : conflict ? <p>La pagina salvata è stata modificata dopo la creazione della bozza. Scegli quale versione aprire: il recupero non sovrascrive il file su disco.</p>
      : <MessageNotice context="recovery" raw={recovery.error ?? "Verifica del recupero non riuscita."} />}
    {checkpoint && <section className="draft-recovery-summary" aria-label="Riepilogo della bozza">
      <dl><div><dt>Progetto</dt><dd>{projectName}</dd></div><div><dt>Pagina</dt><dd>{page?.name ?? draft?.file.split(/[\\/]/).at(-1) ?? "Ultima sessione di lavoro"}</dd></div>
        <div><dt>Copia automatica del</dt><dd>{new Date(checkpoint.savedAt).toLocaleString("it-IT")}</dd></div>
        <div><dt>Stato della pagina</dt><dd>{checkpoint.dirty ? "Contiene modifiche non salvate" : "Non risultavano modifiche non salvate"}</dd></div></dl>
      <p className="draft-recovery-location">Cartella di lavoro: {checkpoint.root}</p>
    </section>}
    {conflict && <div className="recovery-choices"><section><strong>Bozza recuperata</strong><p>Riprende le modifiche conservate nell’editor. Dovrai salvarle per aggiornare la pagina su disco.</p></section><section><strong>Pagina salvata su disco</strong><p>Apre la versione attuale del file. Le modifiche non salvate della bozza e la sua cronologia non verranno riprese.</p></section></div>}
    <div className="recovery-actions">
      {available && <button className="recovery-primary" onClick={() => void resume()}><RotateCcw size={15} /> Recupera bozza e riprendi il lavoro</button>}
      {conflict && <><button className="recovery-primary" onClick={() => void resume("draft")}>Recupera le modifiche della bozza</button><button onClick={() => void resume("disk")}>Apri la pagina salvata su disco</button></>}
      {recovery.status === "failed" && recovery.checkpoint && (recovery.persistent || editorCheckpointFresh(recovery.checkpoint)) && <button onClick={() => void retry()}><RotateCcw size={15} /> Riprova il recupero</button>}
      <button disabled={recovery.status === "opening"} onClick={() => void discard()}>{checkpoint ? "Scarta bozza e torna ai progetti" : "Torna ai progetti"}</button>
    </div>
    {checkpoint && <p className="recovery-help">Il recupero non salva né avvia l’anteprima. L’anteprima legge la pagina su disco: per mostrarvi le modifiche non salvate della bozza, usa Salva nell’editor.</p>}
    {draft && <details className="recovery-details"><summary>Codice della bozza (per assistenza)</summary>
      <p>Questo è il testo tecnico della pagina, non un’immagine del pannello. Serve per controllare o copiare le modifiche con chi ti assiste; non devi usarlo per recuperare il lavoro.</p>
      <p>{draft.file}</p><textarea readOnly value={draft.source} spellCheck={false} aria-label="Bozza conservata del file" />
    </details>}
    {conflict && <details className="recovery-details"><summary>Codice della pagina su disco (per assistenza)</summary>
      <p>Versione attualmente salvata, in sola lettura. Aprire questi dettagli non modifica alcun file.</p>
      <textarea readOnly value={recovery.diskSource ?? ""} spellCheck={false} aria-label="Versione attuale del file su disco" />
    </details>}
  </main>;
}

function EditorApp({ components }: { components: ReturnType<typeof createEditorComponents> }) {
  const { AppShell, CommandPalette, UserAccessWindow, EditorSettings, EditorHelp, AiAssistant } = components;
  useAiAccountEvents();
  const aiOpen = useEditorAi(state => state.open);
  const aiMode = useEditorAi(state => state.mode);
  useEffect(() => installEditorDraftRecovery(useEditorStore), []);
  useEffect(() => installAiInterviewDraftRecovery(), []);
  useEffect(() => installAiChatProjectScope(), []);
  const project = useEditorStore((state) => state.project);
  const loading = useEditorStore((state) => state.loading);
  const aiProjectBusy = useEditorStore((state) => state.aiProjectBusy);
  const reloadRecovery = useEditorStore((state) => state.reloadRecovery);
  const backupError = useEditorStore((state) => state.draftBackup?.error);
  const retryBackup = useEditorStore((state) => state.retryDraftBackup);
  const paletteOpen = useEditorStore((state) => state.paletteOpen);
  const userAccessOpen = useEditorStore((state) => state.userAccessOpen);
  const settingsOpen = useEditorShortcuts((state) => state.open);
  const helpOpen = useEditorGuidance((state) => state.helpOpen);

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

  useEffect(() => installEditorKeyboardShortcuts(), []);

  return (
    <>
      <div inert={aiProjectBusy} style={{ display: "contents" }}>{reloadRecovery ? <ReloadRecoveryScreen /> : loading ? <ProjectLoadingScreen /> : project ? <Suspense fallback={<InterfaceLoading />}><AppShell /></Suspense> : <WelcomeScreen />}</div>
      {aiProjectBusy && <div className="ai-project-busy-overlay" role="status" aria-live="polite"><LoaderCircle className="spin" size={22} /><strong>Aggiornamento protetto del progetto…</strong><p>Attendi il completamento del salvataggio o del ripristino. Non chiudere questa finestra.</p></div>}
      {!reloadRecovery && project && backupError && <aside className="draft-backup-warning" role="alert"><MessageNotice context="backup" raw={backupError} /><button onClick={() => void retryBackup()}>Riprova il backup</button></aside>}
      {paletteOpen && <Suspense fallback={<InterfaceLoading />}><CommandPalette /></Suspense>}
      {userAccessOpen && <Suspense fallback={<InterfaceLoading />}><UserAccessWindow /></Suspense>}
      {settingsOpen && <Suspense fallback={<InterfaceLoading />}><EditorSettings /></Suspense>}
      {helpOpen && <Suspense fallback={<InterfaceLoading />}><EditorHelp /></Suspense>}
      {aiOpen && aiMode === "create" && <Suspense fallback={<InterfaceLoading />}><AiAssistant /></Suspense>}
    </>
  );
}
