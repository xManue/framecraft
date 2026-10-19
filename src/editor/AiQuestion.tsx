import type { ReactNode } from "react";
import type { AiInterview } from "../ai/aiInterview";
import { delegatedQuestions } from "../ai/aiDelegation";
import { panelRequirementGroups } from "../core/panelRequirements";
import { guidedPageKinds } from "../core/guidedProject";
import { standardProjectSectionChoices } from "../core/standardProjectChoices";

export function AiQuestion({ label, delegated, pending, onToggle, children }: { label: string; delegated: boolean; pending?: boolean; onToggle(): void; children: ReactNode }) {
  return <div className="ai-question" data-delegated={delegated}>
    <fieldset disabled={delegated} className="ai-question-input" aria-label={label}>{children}</fieldset>
    <button type="button" className="ai-delegate-button" aria-label={`${delegated ? "Rispondo io" : "Lascia scegliere all’AI"}: ${label}`} aria-pressed={delegated} onClick={onToggle}>{delegated ? "Rispondo io" : "Lascia scegliere all’AI"}</button>
    {delegated && <p className="ai-hint" role="status">{pending ? "Domanda saltata. Dati reali già forniti conservati; quelli mancanti restano da configurare, senza inventare collegamenti o autorizzazioni." : "Sceglierà l’AI, senza usare la risposta precedente. Controllerai la scelta nel riepilogo prima di creare."}</p>}
  </div>;
}
export function AiDelegationReview({ interview, decisions }: { interview: AiInterview; decisions?: readonly { key: string; value: string }[] }) {
  const questions = delegatedQuestions(interview);
  if (!questions.length && !interview.followups.some(item => item.skipped)) return null;
  const readable = (key: string, value: string) => {
    if (key === "pages") { try { return `${JSON.parse(value).length} pagine proposte · dettagli nel piano qui sotto`; } catch { return "Piano da controllare"; } }
    if (key.endsWith(".items")) { try { return JSON.parse(value).join(" · ") || "Nessun elemento per ora"; } catch { return "Elementi da controllare"; } }
    if (key === "layout") return value === "desktop-mobile" ? "Desktop e mobile" : "Desktop";
    if (key === "language") return value === "it" ? "Italiano" : "Inglese · traduzioni da completare";
    if (key.endsWith(".kind")) return guidedPageKinds.find(kind => kind.id === value)?.label ?? value;
    if (key.endsWith(".section")) return standardProjectSectionChoices.find(section => section.id === value)?.label ?? value;
    if (key.startsWith("req.")) { const [, groupId, questionId] = key.split("."); return panelRequirementGroups.find(group => group.id === groupId)?.questions.find(question => question.id === questionId)?.options?.find(option => option[0] === value)?.[1] ?? value; }
    if (key.startsWith("feature.")) return value === "yes" ? "Richiesta · dettagli da completare" : "Non richiesta";
    if (key.endsWith(".image")) return value === "none" ? "Nessuna immagine" : value === "required" ? "Immagine necessaria · inserisci quella reale" : "Immagine facoltativa";
    return value || "Prima pagina del menu";
  };
  return <section className="ai-delegation-review" aria-label="Domande lasciate all’AI"><h4>Scelte lasciate all’AI</h4><dl>{questions.map(question => {
    const decision = decisions?.find(decision => decision.key === question.key);
    return <div key={question.key}><dt>{question.label}</dt><dd>{question.type === "pending" ? "Da configurare con dati reali, nessuna scelta macchina inventata" : decision ? `${readable(decision.key, decision.value)} · proposta AI` : "Sceglierà l’AI nella proposta"}</dd></div>;
  })}</dl>{interview.followups.some(item => item.skipped) && <p>Le domande aggiuntive saltate non verranno richieste di nuovo. Le proposte non operative compaiono nella descrizione e nei limiti.</p>}</section>;
}
