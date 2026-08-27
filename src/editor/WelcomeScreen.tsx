import { AlertCircle, FolderOpen, GitBranch, LoaderCircle, Plus, ShieldCheck, Sparkles, X } from "lucide-react";
import { desktopAvailable } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";

export function WelcomeScreen() {
  const openProject = useEditorStore((state) => state.chooseAndOpenProject);
  const createProject = useEditorStore((state) => state.createProject);
  const openRecent = useEditorStore((state) => state.openProject);
  const removeRecent = useEditorStore((state) => state.removeRecentProject);
  const recent = useEditorStore((state) => state.recentProjects);
  const loading = useEditorStore((state) => state.loading);
  const error = useEditorStore((state) => state.lastError);

  return (
    <main className="welcome-shell">
      <header className="welcome-header">
        <div className="brand-mark"><Sparkles size={18} strokeWidth={1.8} /></div>
        <span className="brand-word">Framecraft</span>
        <span className="version-pill">Alpha 0.1</span>
      </header>
      <section className="welcome-content">
        <div className="welcome-copy">
          <span className="eyebrow">VISUAL REACT WORKSPACE</span>
          <h1>Design in the canvas.<br />Keep the code yours.</h1>
          <p>Open a real Vite project, select its rendered interface and make safe, localized changes back to TSX.</p>
          <div className="welcome-actions">
            <button className="button primary" onClick={() => void openProject()} disabled={!desktopAvailable || loading}>
              {loading ? <LoaderCircle className="spin" size={17} /> : <FolderOpen size={17} />} {loading ? "Preparazione copia sicura…" : "Open project"}
            </button>
            <button className="button secondary" onClick={() => void createProject()} disabled={!desktopAvailable || loading}>
              <Plus size={17} /> Create new project
            </button>
          </div>
          {error && <div className="welcome-error" role="alert"><AlertCircle size={16} /><span><strong>Non riesco ad aprire il progetto</strong>{error}</span></div>}
          {!desktopAvailable && (
            <div className="desktop-notice" role="status">
              <ShieldCheck size={17} />
              <span>This browser preview is read-only. Run <code>npm run tauri dev</code> to open local projects.</span>
            </div>
          )}
        </div>
        <aside className="recent-panel">
          <div className="panel-heading">
            <span>Recent projects</span>
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
              <div className="recent-empty"><FolderOpen size={22} /><span>No recent projects</span><small>Your local workspaces will appear here.</small></div>
            )}
          </div>
          <div className="safety-line"><ShieldCheck size={14} /> AST-aware edits · atomic writes · no source regeneration</div>
        </aside>
      </section>
    </main>
  );
}
