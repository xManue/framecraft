import { AlertCircle, FolderOpen, GitBranch, LoaderCircle, Plus, Settings, ShieldCheck, Sparkles, X } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { desktopAvailable } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";
import { MessageNotice } from "./MessageNotice";
import { useEditorShortcuts } from "../state/editorShortcuts";

const StandardProjectWizard = lazy(() => import("./StandardProjectWizard").then(module => ({ default: module.StandardProjectWizard })));

export function WelcomeScreen() {
  const openProject = useEditorStore((state) => state.chooseAndOpenProject);
  const createProject = useEditorStore((state) => state.createProject);
  const openRecent = useEditorStore((state) => state.openProject);
  const removeRecent = useEditorStore((state) => state.removeRecentProject);
  const recent = useEditorStore((state) => state.recentProjects);
  const loading = useEditorStore((state) => state.loading);
  const error = useEditorStore((state) => state.lastError);
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <main className="welcome-shell">
      <header className="welcome-header">
        <div className="brand-mark"><Sparkles size={18} strokeWidth={1.8} /></div>
        <span className="brand-word">Framecraft</span>
        <span className="version-pill">Alpha 0.1</span>
      </header>
      <section className="welcome-content">
        <div className="welcome-copy">
          <span className="eyebrow">EDITOR VISUALE PER PANNELLI REACT</span>
          <h1>Modifica il pannello.<br />Senza cercare nel codice.</h1>
          <p>Apri un progetto, clicca ciò che vedi e correggi testi, dimensioni, colori, azioni e variabili PLC. L’originale rimane protetto.</p>
          <div className="welcome-actions">
            <button className="button primary" onClick={() => setWizardOpen(true)} disabled={!desktopAvailable || loading}>
              <Sparkles size={17} /> Nuovo pannello
            </button>
            <button className="button primary" onClick={() => void openProject()} disabled={!desktopAvailable || loading}>
              {loading ? <LoaderCircle className="spin" size={17} /> : <FolderOpen size={17} />} {loading ? "Preparazione copia sicura…" : "Apri un progetto"}
            </button>
            <button className="button secondary" onClick={() => void createProject()} disabled={!desktopAvailable || loading}>
              <Plus size={17} /> Progetto React vuoto
            </button>
            <button className="button secondary" onClick={() => useEditorShortcuts.getState().setOpen(true)} disabled={loading}><Settings size={17} />Impostazioni</button>
          </div>
          {error && <div className="welcome-error" role="alert"><AlertCircle size={16} /><div><strong>Impossibile completare l’operazione</strong><MessageNotice raw={error} /></div></div>}
          {!desktopAvailable && (
            <div className="desktop-notice" role="status">
              <ShieldCheck size={17} />
              <span>Questa anteprima del browser è in sola lettura. Apri l’app desktop per modificare progetti locali.</span>
            </div>
          )}
        </div>
        <aside className="recent-panel">
          <div className="panel-heading">
            <span>Progetti recenti</span>
            <span className="muted">{recent.length}</span>
          </div>
          <div className="recent-list">
            {recent.length ? recent.map((path) => {
              const name = path.split(/[\\/]/).at(-1) ?? path;
              return (
                <div key={path} className="recent-row">
                  <button className="recent-item" onClick={() => void openRecent(path)} disabled={!desktopAvailable || loading}>
                    <span className="recent-icon"><GitBranch size={15} /></span>
                    <span><strong>{name}</strong><small>{path}</small></span>
                  </button>
                  <button
                    className="recent-remove"
                    disabled={loading}
                    onClick={() => {
                      if (window.confirm(`Rimuovere “${name}” dai progetti recenti?\n\nLa cartella non verrà cancellata.`)) removeRecent(path);
                    }}
                    aria-label={`Rimuovi ${name} dai progetti recenti`}
                    title="Rimuovi dai recenti (non elimina la cartella)"
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            }) : (
              <div className="recent-empty"><FolderOpen size={22} /><span>Nessun progetto recente</span><small>I progetti aperti compariranno qui.</small></div>
            )}
          </div>
          <div className="safety-line"><ShieldCheck size={14} /> Modifichi una copia sicura · l’originale non viene toccato</div>
        </aside>
      </section>
      {wizardOpen && <Suspense fallback={<div className="interface-loading" role="status">Preparazione della procedura…</div>}><StandardProjectWizard loading={loading} onClose={() => setWizardOpen(false)} /></Suspense>}
    </main>
  );
}
