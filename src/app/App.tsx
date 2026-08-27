import { Component, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { AppShell } from "../editor/AppShell";
import { WelcomeScreen } from "../editor/WelcomeScreen";
import { CommandPalette } from "../editor/CommandPalette";
import { useEditorStore } from "../state/editorStore";
import { desktopAvailable } from "../filesystem/desktopBridge";

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
  return <main className="project-loading" role="status" aria-live="polite">
    <span className="brand-mark">F</span>
    <LoaderCircle className="spin" size={24} />
    <strong>Apertura del progetto…</strong>
    <p>Preparo la copia sicura, analizzo le pagine e avvio l’anteprima.</p>
  </main>;
}

function EditorApp() {
  const project = useEditorStore((state) => state.project);
  const loading = useEditorStore((state) => state.loading);
  const paletteOpen = useEditorStore((state) => state.paletteOpen);
  const setPaletteOpen = useEditorStore((state) => state.setPaletteOpen);
  const save = useEditorStore((state) => state.save);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const remove = useEditorStore((state) => state.deleteSelection);
  const duplicate = useEditorStore((state) => state.duplicateSelection);

  useEffect(() => {
    if (!desktopAvailable) return;
    let disposes: (() => void)[] = [];
    void import("@tauri-apps/api/event").then(({ listen }) => Promise.all([
      listen<string>("project-file-changed", (event) => {
        window.setTimeout(() => void useEditorStore.getState().handleExternalFileChange(event.payload), 180);
      }),
      listen<{ stream: string; line: string }>("preview-output", (event) => {
        useEditorStore.getState().addPreviewOutput(event.payload.stream, event.payload.line);
      }),
    ])).then((listeners) => { disposes = listeners; });
    return () => disposes.forEach((dispose) => dispose());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = target.matches("input, textarea, [contenteditable=true]");
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      } else if (mod && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void useEditorStore.getState().chooseAndOpenProject();
      } else if (!editing && mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void (event.shiftKey ? redo() : undo());
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
  }, [duplicate, redo, remove, save, setPaletteOpen, undo]);

  return (
    <>
      {loading ? <ProjectLoadingScreen /> : project ? <AppShell /> : <WelcomeScreen />}
      {paletteOpen && <CommandPalette />}
    </>
  );
}
