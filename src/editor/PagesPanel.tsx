import { FilePlus2, Plus, Route, Search, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { standardPageTemplate, standardPageTemplates, type StandardPageTemplateId } from "../core/hmiPages";
import { sections } from "../core/hmiStandard";
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
  const [section, setSection] = useState("");
  const [templateId, setTemplateId] = useState<StandardPageTemplateId>("blank");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [templateQuery, setTemplateQuery] = useState("");
  const [error, setError] = useState("");
  const deferredTemplateQuery = useDeferredValue(templateQuery.trim().toLocaleLowerCase("it"));
  const selectedTemplate = standardPageTemplate(templateId);
  const templateSections = sections.filter((item) => standardPageTemplates.some((template) => template.recommendedSection === item.id));
  const sectionTemplates = templateFilter === "all"
    ? standardPageTemplates
    : standardPageTemplates.filter((template) => template.recommendedSection === templateFilter);
  const visibleTemplates = deferredTemplateQuery
    ? sectionTemplates.filter((template) => `${template.name} ${template.description} ${template.sourceScreen}`.toLocaleLowerCase("it").includes(deferredTemplateQuery))
    : sectionTemplates;

  function chooseTemplate(id: StandardPageTemplateId) {
    const template = standardPageTemplate(id);
    setTemplateId(id);
    if (template.recommendedSection) setSection(template.recommendedSection);
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createPage(name, path || `/${name.trim().toLowerCase().replace(/\s+/g, "-")}`, section || undefined, templateId);
      setName(""); setPath(""); setTemplateId("blank"); setCreating(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  return <div className="panel-content pages-panel">
    <div className="panel-title"><span>PAGINE</span><button onClick={() => setCreating(!creating)} disabled={!routerEditable} title={routerEditable ? "Crea una nuova pagina" : "Questo progetto non permette ancora di creare pagine dall’editor"}>{creating ? <X size={14} /> : <Plus size={14} />}</button></div>
    <p className="panel-help">Scegli una pagina senza cercarla nelle cartelle. In modalità Naviga puoi anche usare menu e link direttamente nel canvas.</p>
    <div className="page-list">
      {pages.map((page) => <button key={page.id} className={activePageId === page.id ? "active" : ""} onClick={() => void openPage(page)} title={page.file}>
        <Route size={15} /><span><strong>{page.name}</strong><small>{page.stateValue ? `schermata: ${page.stateValue}` : page.route}</small></span>
      </button>)}
      {!pages.length && <div className="page-empty"><FilePlus2 size={20} /><strong>Nessuna pagina rilevata</strong><span>Puoi comunque scegliere il contenuto dal pannello File.</span></div>}
    </div>
    {creating && <form className="new-page-form" onSubmit={submit}>
      <strong>Nuova pagina</strong>
      <label>Nome<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Contatti" /></label>
      <label>Percorso<input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/contatti" /></label>
      <fieldset className="new-page-template-field">
        <legend>Da quale base vuoi partire? · {standardPageTemplates.length} disponibili</legend>
        <div className="new-page-template-filters" aria-label="Filtra i template">
          <button type="button" className={templateFilter === "all" ? "active" : ""} aria-pressed={templateFilter === "all"} onClick={() => setTemplateFilter("all")}>Tutti</button>
          {templateSections.map((item) => <button key={item.id} type="button" className={templateFilter === item.id ? "active" : ""} aria-pressed={templateFilter === item.id} onClick={() => setTemplateFilter(item.id)}>{item.label}</button>)}
        </div>
        <label className="new-page-template-search">
          <Search size={14} aria-hidden="true" />
          <input value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} type="search" placeholder="Cerca per nome o schermata standard" />
        </label>
        <div className="new-page-templates" role="radiogroup" aria-label="Template pagina">
          {visibleTemplates.map((template) => <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={templateId === template.id}
            className={templateId === template.id ? "active" : ""}
            onClick={() => chooseTemplate(template.id)}
          >
            <span className="template-miniature" data-template={template.id} aria-hidden="true"><i /><i /><i /></span>
            <span><strong>{template.name}</strong><small>{template.description}</small><em>Da {template.sourceScreen}</em></span>
          </button>)}
          {!visibleTemplates.length && <div className="new-page-template-empty">Nessun template corrisponde alla ricerca.</div>}
        </div>
      </fieldset>
      {selectedTemplate.setupHint && <aside className="new-page-setup-hint" aria-label="Come completare il template"><strong>DOPO AVERLA CREATA</strong><span>{selectedTemplate.setupHint}</span></aside>}
      <label>Sezione dello standard
        <select value={section} onChange={(event) => setSection(event.target.value)}>
          <option value="">Nessuna — pagina libera</option>
          {sections.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.label}</option>)}
        </select>
      </label>
      {selectedTemplate.recommendedSection && <small className="new-page-hint">Sezione consigliata impostata automaticamente. Puoi cambiarla se questa pagina appartiene a un'altra area del pannello.</small>}
      {section && <small className="new-page-hint">Prende il primo numero libero della sezione ({section === "main" ? "1001, 1041, …" : `${sections.find((item) => item.id === section)?.number}001, …`}) e nasce con cornice, intestazione e numero gia’ al posto giusto.</small>}
      {error && <p>{error}</p>}
      <button className="button primary" type="submit">Crea e apri</button>
    </form>}
  </div>;
}
