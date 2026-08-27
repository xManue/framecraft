import { FilePlus2, Plus, Route, X } from "lucide-react";
import { useState } from "react";
import { useEditorStore } from "../state/editorStore";

export function PagesPanel() {
  const pages = useEditorStore((state) => state.pages);
  const activePageId = useEditorStore((state) => state.activePageId);
  const routerEditable = useEditorStore((state) => state.routerEditable);
  const openPage = useEditorStore((state) => state.openPage);
  const createPage = useEditorStore((state) => state.createPage);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createPage(name, path || `/${name.trim().toLowerCase().replace(/\s+/g, "-")}`);
      setName(""); setPath(""); setCreating(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  return <div className="panel-content pages-panel">
    <div className="panel-title"><span>PAGES</span><button onClick={() => setCreating(!creating)} disabled={!routerEditable} title={routerEditable ? "Create page" : "React Router <Routes> not detected"}>{creating ? <X size={14} /> : <Plus size={14} />}</button></div>
    <p className="panel-help">Scegli una pagina senza cercarla nelle cartelle. In modalità Naviga puoi anche usare menu e link direttamente nel canvas.</p>
    <div className="page-list">
      {pages.map((page) => <button key={page.id} className={activePageId === page.id ? "active" : ""} onClick={() => void openPage(page)} title={page.file}>
        <Route size={15} /><span><strong>{page.name}</strong><small>{page.stateValue ? `schermata: ${page.stateValue}` : page.route}</small></span>
      </button>)}
      {!pages.length && <div className="page-empty"><FilePlus2 size={20} /><strong>Nessuna pagina rilevata</strong><span>Puoi ancora modificare i file dal pannello Project.</span></div>}
    </div>
    {creating && <form className="new-page-form" onSubmit={submit}>
      <strong>Nuova pagina</strong>
      <label>Nome<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Contatti" /></label>
      <label>Percorso<input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/contatti" /></label>
      {error && <p>{error}</p>}
      <button className="button primary" type="submit">Crea e apri</button>
    </form>}
  </div>;
}
