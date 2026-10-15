import { useMemo, useState } from "react";
import { aiProposalGroups } from "../ai/aiPageEdits";
import { reviewAiEdits } from "../ai/aiEditReview";
import type { AiChatMessage } from "../ai/aiChat";
import { useEditorAiChat } from "../state/editorAiChat";
import { useEditorStore } from "../state/editorStore";
import { AiEditReview } from "./AiEditReview";

export function AiPageReview({ message, latest }: { message: AiChatMessage; latest: boolean }) {
  const chat = useEditorAiChat(), project = useEditorStore(state => state.project), document = useEditorStore(state => state.document), loading = useEditorStore(state => state.loading);
  const groups = useMemo(() => {
    try { return { groups: aiProposalGroups(message.snapshot!, message.proposal!).map(group => ({ ...group, review: reviewAiEdits(group.snapshot, group.proposal) })) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [message.snapshot, message.proposal]);
  const [choice, setChoice] = useState<string[]>();
  if (groups.error) return <p className="ai-error" role="alert">{groups.error}</p>;
  if (message.status === "applied") return <p className="ai-chat-applied">Modifiche applicate · Annulla disponibile per ciascun file.</p>;
  if (!latest) return <p className="ai-hint">Proposta precedente, non più applicabile.</p>;
  const values = groups.groups ?? [], accepted = choice ?? values.flatMap(group => group.review.defaults);
  const files = [...new Set(values.map(group => group.snapshot.document.file))];
  return <section className="ai-proposal" aria-label="Revisione pagine"><h3>Modifiche alle pagine allegate</h3><p>Testi, stili e layout reali. Eventi, binding e tag vengono preservati. Una conferma e un Annulla per file; non è un salvataggio atomico multi-file.</p>
    {files.map(file => {
      const items = values.filter(group => group.snapshot.document.file === file), applied = message.reviewedFiles?.includes(file), ids = items.flatMap(group => group.proposal.operations.map(operation => operation.id));
      const picked = accepted.filter(id => ids.includes(id));
      const stale = project?.root !== message.snapshot?.root || document?.file === file && document.source !== items[0].snapshot.document.source;
      const disabled = chat.sending || chat.applying || loading || !!applied || stale;
      return <section className="ai-page-review-file" key={file}><h4>{items[0].snapshot.label?.split(" · ")[0] ?? file.split(/[\\/]/).at(-1)}</h4>
        {applied ? <p>Modifiche approvate per questo file.</p> : items.map(group => <div key={group.key}><strong>{group.snapshot.document.nodes[group.snapshot.selectedId]?.label}</strong>
          <AiEditReview snapshot={group.snapshot} proposal={group.proposal} review={group.review} accepted={accepted.filter(id => group.proposal.operations.some(operation => operation.id === id))} disabled={disabled} onAccepted={next => setChoice([...accepted.filter(id => !group.proposal.operations.some(operation => operation.id === id)), ...next])} />
        </div>)}
        {!applied && <>{stale && <p className="ai-error">La pagina è cambiata: allegala di nuovo e richiedi una nuova proposta.</p>}
          <button type="button" className="button primary" disabled={disabled || !picked.length || !!message.proposal?.questions.length || items.some(group => group.review.error)} onClick={() => void chat.apply(message.id, picked)}>{files.length === 1 ? "Applica le modifiche selezionate" : `Applica ${items[0].snapshot.label?.split(" · ")[0] ?? "pagina"}`}</button></>}
      </section>;
    })}
  </section>;
}
