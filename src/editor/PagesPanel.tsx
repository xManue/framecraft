import { FilePlus2, FolderPlus, LoaderCircle, Plus, Route, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { standardPageTemplate, standardPageTemplates, type StandardPageTemplateId } from "../core/hmiPages";
import { sections } from "../core/hmiStandard";
import { useEditorStore } from "../state/editorStore";
import { PageTemplateIcon, pageCatalogCount, pageTemplateGroups } from "./PageTemplateIcon";

function PageCreationDialog({ initialTab, onClose }: { initialTab: "page" | "category"; onClose(): void }) {
  const createPage = useEditorStore((state) => state.createPage);
  const createCategory = useEditorStore((state) => state.createCategory);
  const categories = useEditorStore((state) => state.pageCategories);
  const project = useEditorStore((state) => state.project);
  const [tab, setTab] = useState(initialTab);
  const [name, setName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [path, setPath] = useState("");
  const [section, setSection] = useState("");
  const [sectionChosen, setSectionChosen] = useState(false);
  const [templateId, setTemplateId] = useState<StandardPageTemplateId>("blank");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const queryDeferred = useDeferredValue(query.trim().toLocaleLowerCase("it"));
  const selectedTemplate = standardPageTemplate(templateId);
  const options = categories.length ? categories : sections;
  const visibleTemplates = standardPageTemplates.filter((template) => (filter === "all" || template.recommendedSection === filter)
    && `${template.name} ${template.description} ${template.sourceScreen}`.toLocaleLowerCase("it").includes(queryDeferred));
  const groups = pageTemplateGroups(visibleTemplates);
  const previousProject = useRef(project);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); if (!busyRef.current) onClose(); }
      if (event.key !== "Tab") return;
      const targets = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);
  useEffect(() => { if (project?.root !== previousProject.current?.root) onClose(); }, [project, onClose]);

  function chooseTemplate(id: StandardPageTemplateId) {
    const template = standardPageTemplate(id);
    setTemplateId(id);
    if (!sectionChosen && template.recommendedSection && options.some((item) => item.id === template.recommendedSection)) setSection(template.recommendedSection);
    setError("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setStatus("");
    try {
      if (tab === "category") {
        const category = await createCategory(categoryName);
        setSection(category.id); setSectionChosen(true); setCategoryName(""); setTab("page");
        setStatus(`Categoria «${category.label}» creata. Ora aggiungi la prima pagina.`);
      } else {
        await createPage(name, path || `/${name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, section || undefined, templateId);
        onClose();
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Non riesco a completare la creazione. Controlla la diagnostica e riprova."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return createPortal(<div className="page-creation-backdrop"><div className="page-creation-dialog" role="dialog" aria-modal="true" aria-labelledby="page-creation-title" ref={panel}>
    <header><div><h2 id="page-creation-title">Aggiungi al pannello</h2><p>Pagine e categorie, senza duplicare i componenti.</p></div><button type="button" aria-label="Chiudi creazione" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    <div className="page-creation-tabs" role="group" aria-label="Cosa vuoi creare?">
      <button type="button" aria-pressed={tab === "page"} disabled={busy} onClick={() => { setTab("page"); setError(""); }}><FilePlus2 size={18} />Nuova pagina</button>
      <button type="button" aria-pressed={tab === "category"} disabled={busy} onClick={() => { setTab("category"); setError(""); }}><FolderPlus size={18} />Nuova categoria</button>
    </div>
    <form onSubmit={submit}>
      <div className="page-creation-body"><fieldset disabled={busy}>
        {tab === "category" ? <section className="page-category-create"><h3>Organizza il menu del tuo pannello</h3><p>Una categoria raggruppa più pagine, come Main, Settings e Alarms. Appare nel menu del pannello; diventa navigabile quando aggiungi la prima pagina.</p>
          <label>Nome della categoria<input value={categoryName} maxLength={60} onChange={(event) => setCategoryName(event.target.value)} placeholder="Es. Manutenzione" required /></label>
          {!categories.length && <p className="page-creation-notice">Questo progetto non usa la navigazione standard Framecraft. Puoi creare pagine libere; le categorie richiedono un pannello standard.</p>}
        </section> : <>
          <div className="page-creation-fields"><label>Nome pagina<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Es. Stato motori" required /></label>
            <label>Percorso<input value={path} onChange={(event) => setPath(event.target.value)} placeholder="Automatico dal nome" /></label>
            <label>Categoria<select value={section} onChange={(event) => { setSection(event.target.value); setSectionChosen(true); }}><option value="">Pagina libera</option>{options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          </div>
          <section className="page-template-catalog"><h3>Scegli la base · {pageCatalogCount} modelli</h3><p>Le basi vuote simili sono raggruppate. Le varianti conservano i loro eventi e collegamenti originali.</p>
            <div className="new-page-template-filters" aria-label="Filtra i template"><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tutti</button>{sections.map((item) => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
            <label className="search-field"><Search size={16} /><input type="search" aria-label="Cerca template" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, contenuto o schermata standard" /></label>
            <div className="page-template-grid" role="group" aria-label="Template pagina">{groups.map(({ template, variants, name: groupName }) => {
              const active = variants.some((item) => item.id === templateId);
              return <div className={active ? "page-template-choice active" : "page-template-choice"} key={template.id}><button type="button" aria-pressed={active} onClick={() => chooseTemplate(template.id)}><PageTemplateIcon template={template} /><span><strong>{groupName}</strong><small>{variants.length > 1 ? "Cornice vuota: scegli la variante, senza modelli ripetuti." : template.description}</small><em>{template.sourceScreen}</em></span></button>
                {variants.length > 1 && active && <label>Variante standard<select value={templateId} onChange={(event) => chooseTemplate(event.target.value as StandardPageTemplateId)}>{variants.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sourceScreen}</option>)}</select></label>}
              </div>;
            })}</div>{!groups.length && <p>Nessun modello corrisponde alla ricerca.</p>}
          </section>
          {selectedTemplate.setupHint && <aside className="new-page-setup-hint"><strong>Da configurare sulla tua macchina</strong><span>{selectedTemplate.setupHint}</span></aside>}
        </>}
      </fieldset></div>
      <footer><div aria-live="polite">{error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}</div><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Annulla</button><button type="submit" className="button primary" disabled={busy || (tab === "category" && !categories.length)}>{busy && <LoaderCircle size={16} className="spin" />}{busy ? "Creazione…" : tab === "category" ? "Crea categoria" : "Crea e apri pagina"}</button></footer>
    </form>
  </div></div>, document.body);
}

export function PagesPanel() {
  const pages = useEditorStore((state) => state.pages);
  const categories = useEditorStore((state) => state.pageCategories);
  const activePageId = useEditorStore((state) => state.activePageId);
  const routerEditable = useEditorStore((state) => state.routerEditable);
  const openPage = useEditorStore((state) => state.openPage);
  const project = useEditorStore((state) => state.project);
  const routerFile = useEditorStore((state) => state.routerFile);
  const refreshCategories = useEditorStore((state) => state.refreshPageCategories);
  useEffect(() => { if (project && routerFile) void refreshCategories(); }, [project, routerFile, refreshCategories]);
  const [creating, setCreating] = useState<"page" | "category">();
  const pageButton = (page: typeof pages[number]) => <button key={page.id} className={activePageId === page.id ? "active" : ""} onClick={() => void openPage(page)} title={page.file}><Route size={15} /><span><strong>{page.name}</strong><small>{page.stateValue ? `schermata: ${page.stateValue}` : page.route}</small></span></button>;
  const freePages = pages.filter((page) => !categories.some((category) => category.pages.includes(page.route)));
  return <div className="panel-content pages-panel"><div className="panel-title"><span>PAGINE</span><button aria-label="Nuova pagina" onClick={() => setCreating("page")} disabled={!routerEditable}><Plus size={16} /></button></div>
    <p className="panel-help">Le categorie organizzano anche il menu del pannello. Qui crei pagine; in Aggiungi elementi trovi soltanto componenti.</p>
    <div className="page-panel-actions"><button type="button" disabled={!routerEditable} onClick={() => setCreating("page")}><FilePlus2 size={15} />Nuova pagina</button><button type="button" disabled={!categories.length} onClick={() => setCreating("category")} title={categories.length ? "Aggiungi una categoria al menu" : "Richiede la navigazione standard Framecraft"}><FolderPlus size={15} />Nuova categoria</button></div>
    <div className="page-list">{categories.map((category) => <section key={category.id} className="page-category-group"><h3>{category.label}</h3>{pages.filter((page) => category.pages.includes(page.route)).map(pageButton)}{!category.pages.length && <small>Vuota · aggiungi la prima pagina</small>}</section>)}{freePages.length > 0 && <section className="page-category-group">{categories.length > 0 && <h3>Pagine libere</h3>}{freePages.map(pageButton)}</section>}{!pages.length && <div className="page-empty"><FilePlus2 size={20} /><strong>Nessuna pagina rilevata</strong><span>Puoi scegliere il contenuto dal pannello File.</span></div>}</div>
    {creating && <PageCreationDialog initialTab={creating} onClose={() => setCreating(undefined)} />}
  </div>;
}
