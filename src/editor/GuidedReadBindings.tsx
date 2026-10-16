import { guidedReadBindings, guidedReadBindingIssues, guidedReadBindingTags, guidedReadBindingFields } from "../core/guidedReadBindings";
import { guidedDataLogSources } from "../core/guidedDataLogs";
import type { HmiDataLogCatalog } from "../core/hmiDataLogs";
import type { GuidedItem, GuidedPage, GuidedProjectSpec } from "../core/guidedProject";
import type { PlcVariableDefinition } from "../core/plcVariables";

export function GuidedReadBindingFields({ page, tags, dataLogs, onChange, onGoData }: { page: GuidedPage; tags: readonly PlcVariableDefinition[]; dataLogs?: HmiDataLogCatalog; onChange(items: GuidedItem[]): void; onGoData?(): void }) {
  const choices = guidedReadBindingTags(page.kind, tags), allowed = new Set(choices.map(tag => tag.name));
  const trend = ["trend", "function-trend"].includes(page.kind), archived = guidedDataLogSources(dataLogs).filter(source => allowed.has(source.tag));
  return <div>
    <p className="ai-hint">{trend ? "Le curve leggono solo tag numerici scalari supportati. Testi, BOOL, array, strutture e tag di sola scrittura non sono selezionabili." : "Questi collegamenti mostrano i dati, non scrivono parametri nel PLC. Sono disponibili i tag scalari leggibili supportati."} Puoi lasciare un elemento da collegare dopo; non verrà associato a un segnale inventato.</p>
    {page.kind === "function-trend" && <p className="ai-hint">Scegli due misure per ogni curva: X sull’asse orizzontale, Y sull’asse verticale. È un valore in funzione dell’altro, non un grafico nel tempo. Gli assi si adattano ai dati; unità, scale e tolleranza temporale si configurano nell’Inspector. Il campionamento nel Runtime non garantisce misure sincrone nel PLC.</p>}
    {trend && <p className="ai-hint">Online legge il valore corrente. Archivio legge i campioni del Data Log importato: non importa uno storico precedente, non è un database industriale e acquisisce solo mentre il pannello è aperto. {onGoData && <button type="button" onClick={onGoData}>Importa o rivedi i Data Log</button>}</p>}
    {page.items.map((item, index) => {
      if (!item.label.trim()) return null;
      const fields = guidedReadBindingFields(page.kind, item);
      const issues = fields.some(binding => binding.logged !== undefined || binding.tag && !allowed.has(binding.tag)) ? guidedReadBindingIssues({ kind: page.kind, items: [item] }, tags, dataLogs) : [];
      return fields.map(binding => {
        const meta = binding.field === "xTag" ? "xLogged" : "logged", id = `ai-read-${binding.field === "xTag" ? "x-tag" : "tag"}-${page.id}-${index}`;
        const label = binding.axis ? `Asse ${binding.axis} di “${item.label}”` : `“${item.label}”`;
        const issue = issues.find(issue => !binding.axis || issue.includes(` · asse ${binding.axis}:`));
        const change = (tag: string, logged: typeof binding.logged) => onChange(page.items.map((item, at) => {
          if (at !== index) return item;
          const next = { ...item, [binding.field]: tag }; if (logged === undefined) delete next[meta]; else next[meta] = logged; return next;
        }));
        const value = binding.logged?.logId || binding.logged?.loggedTagId ? JSON.stringify([binding.logged.logId, binding.logged.loggedTagId]) : "";
        const selected = archived.find(source => JSON.stringify([source.logId, source.loggedTagId]) === value && source.tag === binding.tag);
        const valid = !!selected;
        return <div key={`${index}-${binding.field}`}>
          {trend && <><label htmlFor={`${id}-source`}>Sorgente di {label}</label><select id={`${id}-source`} value={binding.logged ? "log" : "online"} onChange={event => change("", event.target.value === "log" ? { logId: "", loggedTagId: "" } : undefined)}><option value="online">Online · valore corrente</option><option value="log" disabled={!dataLogs?.logs.length}>Archivio · Data Log importato</option></select></>}
          <label htmlFor={id}>{binding.axis ? `${label} · quale tag?` : `Quale tag mostra ${label}?`}</label>
          {binding.logged ? <select id={id} value={value} aria-invalid={!!issue} aria-describedby={issue ? `${id}-issue` : undefined} onChange={event => {
            const source = archived.find(source => JSON.stringify([source.logId, source.loggedTagId]) === event.target.value);
            change(source?.tag ?? "", { logId: source?.logId ?? "", loggedTagId: source?.loggedTagId ?? "" });
          }}><option value="">Lo collegherò dopo</option>
            {!!value && !valid && <option value={value} disabled>{binding.tag || "Sorgente mancante"} · archivio da correggere</option>}
            {archived.map(source => <option key={JSON.stringify([source.logId, source.loggedTagId])} value={JSON.stringify([source.logId, source.loggedTagId])}>{source.logName} · {source.name} · {source.tag}</option>)}
          </select> : <select id={id} value={binding.tag} aria-invalid={!!issue} aria-describedby={issue ? `${id}-issue` : undefined} onChange={event => change(event.target.value, undefined)}>
            <option value="">Lo collegherò dopo</option>
            {!!binding.tag && !allowed.has(binding.tag) && <option value={binding.tag} disabled>{binding.tag} · collegamento da correggere</option>}
            {choices.map(tag => <option key={tag.name} value={tag.name}>{tag.name} · {tag.dataType}</option>)}
          </select>}
          {selected && <p className="ai-hint" style={{ overflowWrap: "anywhere" }}>Archivio: {selected.logName} · {selected.name} · tag {selected.tag}</p>}
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
    <ul>{rows.map(row => <li key={`${row.pageId}-${row.index}-${row.axis ?? "value"}`}><strong>{row.pageTitle} · {row.label}{row.axis ? ` · asse ${row.axis}` : ""}</strong><p>{row.tag ? <><code>{row.tag}</code> · {row.dataType || "tipo non disponibile"} · {row.state === "configured" ? "lettura impostata" : "da correggere"}</> : "Nessun tag: da collegare dopo"} · {row.source === "log" ? `Archivio: ${row.logName || "da scegliere"}` : "Online"}</p>
      {row.issue && <p className="ai-error">{row.issue}</p>}<button type="button" disabled={disabled} onClick={() => onEdit(row.pageId)}>Rivedi: {row.pageTitle} · {row.label}{row.axis ? ` · asse ${row.axis}` : ""}</button>
    </li>)}</ul>
  </details>;
}
