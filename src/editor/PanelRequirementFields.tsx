import { panelRequirementGroups, panelRequirementsSummary, requirementQuestionActive, type PanelRequirements } from "../core/panelRequirements";
import type { GuidedPage } from "../core/guidedProject";

interface Props { step: string; requirements: PanelRequirements; pages: readonly GuidedPage[]; onChange(next: PanelRequirements): void }
export function PanelRequirementFields({ step, requirements, pages, onChange }: Props) {
  const group = panelRequirementGroups.find(group => `req-${group.id}` === step);
  if (step === "features") return <div className="ai-requirement-fields">
    <p>Per ogni funzione scegli se serve, non serve oppure la valuterai dopo. Le domande dettagliate compaiono solo per le funzioni richieste o già presenti nelle pagine. Non vengono aggiunte pagine di nascosto.</p>
    {panelRequirementGroups.filter(group => group.optional).map(group => {
      const required = pages.some(page => group.pageKinds?.includes(page.kind));
      return <label key={group.id}>{group.label}<select value={required ? "yes" : requirements.enabled[group.id] ?? "later"} disabled={required} onChange={event => onChange({ ...requirements, enabled: { ...requirements.enabled, [group.id]: event.target.value as "yes" | "no" | "later" } })}><option value="later">Non so ancora: da valutare</option><option value="yes">Sì, serve</option><option value="no">No, non serve</option></select><small>{required ? "Richiesta dalle pagine scelte. Per escluderla cambia prima la funzione di quelle pagine." : group.hint}</small></label>;
    })}
    <p className="ai-hint">Dispositivo, navigazione, PLC, comandi, utenti, lingue e pubblicazione verranno comunque verificati. Un requisito raccolto non significa che la funzione sia già operativa.</p>
  </div>;
  if (!group) return null;
  return <div className="ai-requirement-fields">
    <p className="ai-hint">{group.hint}</p>
    {group.id === "navigation" && <label>Quale pagina si apre dopo la scelta desktop/mobile?<select value={requirements.startPageId} onChange={event => onChange({ ...requirements, startPageId: event.target.value })}><option value="">Prima pagina del menu</option>{pages.map(page => <option key={page.id} value={page.id}>{page.title || page.id}</option>)}</select><small>Questa scelta configura la destinazione iniziale del pannello. Il ritorno alla scelta del dispositivo rimane disponibile.</small></label>}
    {group.questions.filter(question => requirementQuestionActive(group, question, requirements)).map(question => {
      const key = `${group.id}.${question.id}`, value = requirements.answers[key] ?? "";
      const set = (value: string) => onChange({ ...requirements, answers: { ...requirements.answers, [key]: value } });
      return <label key={key}>{question.label}{question.options
        ? <select value={value || "later"} onChange={event => set(event.target.value)}><option value="later">Non so ancora: da completare</option>{question.options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        : <textarea rows={2} maxLength={1500} value={value} onChange={event => set(event.target.value)} placeholder="Se non serve, scrivi “non serve”; se manca, lascialo da completare." />}
        {(question.hint || question.local) && <small>{question.hint} {question.local && "Dettagli conservati solo nel progetto locale; non inviati a Codex. Non inserire segreti."}</small>}
      </label>;
    })}
  </div>;
}
export function PanelRequirementsReview({ requirements, pages, onEdit }: { requirements: PanelRequirements; pages: readonly GuidedPage[]; onEdit(step: string): void }) {
  return <section className="ai-requirement-review" aria-label="Requisiti raccolti per il pannello"><h4>Funzioni e configurazioni richieste</h4>
    <p>Pagina iniziale: {pages.find(page => page.id === requirements.startPageId)?.title ?? "prima pagina del menu"}. Le risposte guidano il progetto; i requisiti non ancora implementati restano nel piano di completamento.</p>
    <ul>{panelRequirementGroups.filter(group => group.optional && !pages.some(page => group.pageKinds?.includes(page.kind)) && requirements.enabled[group.id] !== "yes").map(group => <li key={group.id}>{group.label}: {requirements.enabled[group.id] === "no" ? "non richiesta" : "da valutare"}</li>)}</ul>
    <button type="button" onClick={() => onEdit("features")}>Rivedi le funzioni richieste</button>
    {panelRequirementsSummary(requirements, pages.map(page => page.kind)).map(group => <details key={group.id}><summary>{group.label} · {group.answers.filter(answer => answer.value !== "later").length} risposte</summary><p>{group.hint}</p><dl>{group.answers.map(answer => {
      const question = panelRequirementGroups.find(item => item.id === group.id)!.questions.find(item => `${group.id}.${item.id}` === answer.key)!;
      return <div key={answer.key}><dt>{answer.label}</dt><dd>{answer.value === "later" ? "Da completare" : question.options?.find(option => option[0] === answer.value)?.[1] ?? answer.value}{answer.local && answer.value !== "later" && " · solo locale"}</dd></div>;
    })}</dl><button type="button" onClick={() => onEdit(`req-${group.id}`)}>Modifica: {group.label}</button></details>)}
  </section>;
}
