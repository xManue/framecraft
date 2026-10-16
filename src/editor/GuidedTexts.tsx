import { guidedResourceCatalog, guidedStaticTextItems, guidedTextChoices, guidedTextIssue, guidedTextRows } from "../core/guidedTexts";
import { resolveHmiText } from "../core/hmiResources";
import type { GuidedPage, GuidedProjectSpec } from "../core/guidedProject";

export function GuidedPageTextFields({ page, spec, onChange }: { page: GuidedPage; spec: GuidedProjectSpec; onChange(page: GuidedPage): void }) {
  if (!spec.resources && !page.titleTextKey && !page.items.some(item => item.textKey)) return null;
  const catalog = guidedResourceCatalog(spec);
  const fields = [{ id: "title", label: "Titolo pagina", source: page.title, key: page.titleTextKey, change: (key: string) => onChange({ ...page, titleTextKey: key }) },
    ...(guidedStaticTextItems(page.kind) ? page.items.map((item, index) => ({ id: String(index), label: item.label, source: item.label, key: item.textKey, change: (key: string) => onChange({ ...page, items: page.items.map((item, at) => at === index ? { ...item, textKey: key } : item) }) })) : [])];
  return <details className="ai-command-review" aria-label="Testi dal dizionario di questa pagina">
    <summary>Testi multilingua · scegli cosa collegare</summary>
    <p>Nessuna chiave è scelta automaticamente. Sono proposte solo voci che contengono il testo originale in almeno una lingua. Il collegamento riguarda il testo visibile, non il nome pagina, le rotte o i tag PLC. Nomi curve e messaggi dei controlli Runtime restano separati.</p>
    {fields.map(field => {
      const id = `ai-text-${page.id}-${field.id}`, choices = guidedTextChoices(field.source, spec.resources), issue = guidedTextIssue(field.key, field.source, spec.resources);
      const selected = field.key && !issue ? resolveHmiText(catalog, field.key) : undefined;
      return <div key={field.id}><label htmlFor={id}>{field.label} · testo dal dizionario</label>
        <select id={id} value={field.key || ""} aria-invalid={!!issue} aria-describedby={`${id}-preview`} onChange={event => field.change(event.target.value)}><option value="">Testo originale · nessuna traduzione automatica</option>
          {field.key && !choices.some(choice => choice.key === field.key) && <option value={field.key} disabled>{field.key} · collegamento da correggere</option>}
          {choices.map(choice => <option key={choice.key} value={choice.key}>{choice.key}</option>)}
        </select>
        <p id={`${id}-preview`} className={issue ? "ai-error" : "ai-hint"} style={{ overflowWrap: "anywhere" }}>{issue || (selected && "value" in selected ? `${catalog.activeLanguage}: ${selected.value}${selected.fallback ? ` · ripiego in ${selected.language}, traduzione da completare` : ""}` : `Resta: ${field.source}`)}</p>
      </div>;
    })}
  </details>;
}
export function GuidedTextsReview({ spec, onEdit, disabled = false }: { spec: GuidedProjectSpec; onEdit(id: string): void; disabled?: boolean }) {
  const catalog = guidedResourceCatalog(spec), rows = guidedTextRows(spec), configured = rows.filter(row => row.key && !row.issue).length;
  return <details className="ai-command-review" aria-label="Lingua e testi da controllare">
    <summary>Lingua Runtime: {catalog.activeLanguage} · {configured} testi collegati al dizionario</summary>
    <p>La lingua viene impostata nel pannello generato. Non traduce automaticamente ogni scritta: testi senza chiave, nomi curve, allarmi e controlli di sistema possono restare nella lingua originale. Controlla traduzioni, ripieghi e ingombri prima dell’uso reale. Il catalogo resta locale, non viene inviato all’AI.</p>
    {spec.resourcesFile && <p>{spec.resourcesFile} · {catalog.multilingualTexts.length} testi · lingue: {catalog.languages.join(", ")}</p>}
    {!!catalog.graphicLists.length && <p>Le liste grafiche sono conservate, ma le immagini riferite non vengono importate da questo file.</p>}
    <ul>{rows.map((row, index) => <li key={index} style={{ overflowWrap: "anywhere" }}><strong>{row.source}</strong> → {row.value} · {row.issue ? "da correggere" : !row.key ? "originale, non tradotto automaticamente" : row.fallback ? `ripiego ${row.language}, traduzione da completare` : row.language}
      {row.issue && <p className="ai-error">{row.issue}</p>}<button type="button" disabled={disabled} onClick={() => onEdit(row.pageId)}>Rivedi testo: {row.source}</button>
    </li>)}</ul>
  </details>;
}
