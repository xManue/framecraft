import { guidedReadBindings, guidedReadBindingIssues, guidedReadBindingTags, guidedReadBindingFields } from "../core/guidedReadBindings";
import type { GuidedItem, GuidedPage, GuidedProjectSpec } from "../core/guidedProject";
import type { PlcVariableDefinition } from "../core/plcVariables";

export function GuidedReadBindingFields({ page, tags, onChange }: { page: GuidedPage; tags: readonly PlcVariableDefinition[]; onChange(items: GuidedItem[]): void }) {
  const choices = guidedReadBindingTags(page.kind, tags);
  const allowed = new Set(choices.map(tag => tag.name));
  return <div>
    <p className="ai-hint">{["trend", "function-trend"].includes(page.kind) ? "Le curve leggono solo tag numerici scalari supportati. Testi, BOOL, array, strutture e tag di sola scrittura non sono selezionabili." : "Questi collegamenti mostrano i dati, non scrivono parametri nel PLC. Sono disponibili i tag scalari leggibili supportati."} Puoi lasciare un elemento da collegare dopo; non verrà associato a un segnale inventato.</p>
    {page.kind === "function-trend" && <p className="ai-hint">Scegli due misure per ogni curva: X sull’asse orizzontale, Y sull’asse verticale. È un valore in funzione dell’altro, non un grafico nel tempo. Gli assi si adattano ai dati; unità, scale e tolleranza temporale si configurano nell’Inspector. Il campionamento nel Runtime non garantisce misure sincrone nel PLC.</p>}
    {page.items.map((item, index) => {
      if (!item.label.trim()) return null;
      const fields = guidedReadBindingFields(page.kind, item);
      const issues = fields.some(binding => binding.tag && !allowed.has(binding.tag)) ? guidedReadBindingIssues({ kind: page.kind, items: [item] }, tags) : [];
      return fields.map(binding => {
        const issue = binding.tag && !allowed.has(binding.tag) ? issues.find(issue => !binding.axis || issue.includes(` · asse ${binding.axis}:`)) : undefined, id = `ai-read-${binding.field === "xTag" ? "x-tag" : "tag"}-${page.id}-${index}`;
        return <div key={`${index}-${binding.field}`}><label htmlFor={id}>{binding.axis ? `Asse ${binding.axis} di “${item.label}” · quale tag?` : `Quale tag mostra “${item.label}”?`}</label>
          <select id={id} value={binding.tag} aria-invalid={!!issue} aria-describedby={issue ? `${id}-issue` : undefined} onChange={event => onChange(page.items.map((item, at) => at === index ? { ...item, [binding.field]: event.target.value } : item))}>
            <option value="">Lo collegherò dopo</option>
            {!!binding.tag && !allowed.has(binding.tag) && <option value={binding.tag} disabled>{binding.tag} · collegamento da correggere</option>}
            {choices.map(tag => <option key={tag.name} value={tag.name}>{tag.name} · {tag.dataType}</option>)}
          </select>
          {issue && <p id={`${id}-issue`} className="ai-error">{issue}</p>}
        </div>;
      });
    })}
  </div>;
}
export function GuidedReadBindingsReview({ spec, onEdit, disabled = false }: { spec: GuidedProjectSpec; onEdit(pageId: string): void; disabled?: boolean }) {
  const rows = guidedReadBindings(spec); if (!rows.length) return null;
  const configured = rows.filter(row => row.state === "configured").length, invalid = rows.filter(row => row.state === "invalid").length;
  return <details className="ai-command-review" aria-label="Collegamenti in lettura da controllare" open={invalid ? true : undefined}>
    <summary>Letture dati · {configured} impostate · {rows.length - configured - invalid} da collegare{invalid ? ` · ${invalid} da correggere` : ""}</summary>
    <p>Controlla pagina, elemento, tag e tipo. “Impostato” indica soltanto il mapping locale: connessione, qualità dei dati e collaudo macchina restano separati. Nomi e indirizzi dei tag non vengono inviati al servizio AI dalla procedura iniziale.</p>
    <ul>{rows.map(row => <li key={`${row.pageId}-${row.index}-${row.axis ?? "value"}`}><strong>{row.pageTitle} · {row.label}{row.axis ? ` · asse ${row.axis}` : ""}</strong><p>{row.tag ? <><code>{row.tag}</code> · {row.dataType || "tipo non disponibile"} · {row.state === "configured" ? "lettura impostata" : "da correggere"}</> : "Nessun tag: da collegare dopo"}</p>
      {row.issue && <p className="ai-error">{row.issue}</p>}<button type="button" disabled={disabled} onClick={() => onEdit(row.pageId)}>Rivedi: {row.pageTitle} · {row.label}{row.axis ? ` · asse ${row.axis}` : ""}</button>
    </li>)}</ul>
  </details>;
}
