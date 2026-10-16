import { guidedReadBindings, guidedReadBindingIssues, guidedReadBindingTags } from "../core/guidedReadBindings";
import type { GuidedItem, GuidedPage, GuidedProjectSpec } from "../core/guidedProject";
import type { PlcVariableDefinition } from "../core/plcVariables";

export function GuidedReadBindingFields({ page, tags, onChange }: { page: GuidedPage; tags: readonly PlcVariableDefinition[]; onChange(items: GuidedItem[]): void }) {
  const choices = guidedReadBindingTags(page.kind, tags);
  const allowed = new Set(choices.map(tag => tag.name));
  return <div>
    <p className="ai-hint">{page.kind === "trend" ? "Le curve leggono solo tag numerici scalari supportati. Testi, BOOL, array, strutture e tag di sola scrittura non sono selezionabili." : "Questi collegamenti mostrano i dati, non scrivono parametri nel PLC. Sono disponibili i tag scalari leggibili supportati."} Puoi lasciare un elemento da collegare dopo; non verrà associato a un segnale inventato.</p>
    {page.items.map((item, index) => {
      if (!item.label.trim()) return null;
      const issue = item.tag && !allowed.has(item.tag) ? guidedReadBindingIssues({ kind: page.kind, items: [item] }, tags)[0] : undefined, id = `ai-read-tag-${page.id}-${index}`;
      return <div key={index}><label htmlFor={id}>Quale tag mostra “{item.label}”?</label>
        <select id={id} value={item.tag} aria-invalid={!!issue} aria-describedby={issue ? `${id}-issue` : undefined} onChange={event => onChange(page.items.map((item, at) => at === index ? { ...item, tag: event.target.value } : item))}>
          <option value="">Lo collegherò dopo</option>
          {!!item.tag && !allowed.has(item.tag) && <option value={item.tag} disabled>{item.tag} · collegamento da correggere</option>}
          {choices.map(tag => <option key={tag.name} value={tag.name}>{tag.name} · {tag.dataType}</option>)}
        </select>
        {issue && <p id={`${id}-issue`} className="ai-error">{issue}</p>}
      </div>;
    })}
  </div>;
}
export function GuidedReadBindingsReview({ spec, onEdit, disabled = false }: { spec: GuidedProjectSpec; onEdit(pageId: string): void; disabled?: boolean }) {
  const rows = guidedReadBindings(spec); if (!rows.length) return null;
  const configured = rows.filter(row => row.state === "configured").length, invalid = rows.filter(row => row.state === "invalid").length;
  return <details className="ai-command-review" aria-label="Collegamenti in lettura da controllare" open={invalid ? true : undefined}>
    <summary>Letture dati · {configured} impostate · {rows.length - configured - invalid} da collegare{invalid ? ` · ${invalid} da correggere` : ""}</summary>
    <p>Controlla pagina, elemento, tag e tipo. “Impostato” indica soltanto il mapping locale: connessione, qualità dei dati e collaudo macchina restano separati. Nomi e indirizzi dei tag non vengono inviati al servizio AI dalla procedura iniziale.</p>
    <ul>{rows.map(row => <li key={`${row.pageId}-${row.index}`}><strong>{row.pageTitle} · {row.label}</strong><p>{row.tag ? <><code>{row.tag}</code> · {row.dataType || "tipo non disponibile"} · {row.state === "configured" ? "lettura impostata" : "da correggere"}</> : "Nessun tag: da collegare dopo"}</p>
      {row.issue && <p className="ai-error">{row.issue}</p>}<button type="button" disabled={disabled} onClick={() => onEdit(row.pageId)}>Rivedi: {row.pageTitle} · {row.label}</button>
    </li>)}</ul>
  </details>;
}
