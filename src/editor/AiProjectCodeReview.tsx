import { useMemo, useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import type { AiChatMessage } from "../ai/aiChat";
import { validateAiProjectReview } from "../ai/aiProjectEdits";
import { useEditorAiChat } from "../state/editorAiChat";
import { useEditorAi } from "../state/editorAi";
import { useEditorStore } from "../state/editorStore";

function changedLines(before: string | null, after: string) {
  const oldLines = (before ?? "").split(/\r?\n/), newLines = after.split(/\r?\n/);
  let start = 0, end = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;
  while (end < oldLines.length - start && end < newLines.length - start && oldLines[oldLines.length - 1 - end] === newLines[newLines.length - 1 - end]) end++;
  return { line: start + 1, before: oldLines.slice(start, oldLines.length - end).join("\n"), after: newLines.slice(start, newLines.length - end).join("\n") };
}
export function AiProjectCodeReview({ message, latest }: { message: AiChatMessage; latest: boolean }) {
  const chat = useEditorAiChat(), aiBusy = useEditorAi(state => state.busy), editor = useEditorStore();
  const parsed = useMemo(() => {
    try { return { review: message.projectReview && validateAiProjectReview(message.projectReview) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [message.projectReview]);
  const [choice, setChoice] = useState<{ target: unknown; value: boolean }>();
  const receipt = message.projectReceipt, expected = receipt ?? message.projectReview;
  const confirmed = choice?.target === expected && !!choice?.value;
  const busy = chat.applying || chat.sending || chat.recovering || aiBusy || editor.loading || !!editor.reloadRecovery;
  if (!receipt && !parsed.review && !parsed.error) return null;
  if (parsed.error && !receipt) return <p className="ai-error" role="alert">{parsed.error}</p>;
  const root = receipt?.root ?? parsed.review?.root, stale = editor.project?.root !== root;
  const blocked = busy || stale || editor.dirty || editor.interactionMode !== "edit";
  if (receipt) {
    const lastReceipt = [...chat.messages].reverse().find(item => item.projectReceipt && !item.projectReceipt.restored);
    return <section className="ai-proposal ai-project-code-review" aria-label="Modifiche progetto applicate">
      <h3>{receipt.restored ? "Versione precedente ripristinata" : "Modifiche di progetto applicate"}</h3>
      <ul>{receipt.files.map(file => <li key={file}>{file}</li>)}</ul>
      {!receipt.restored && <><p>Il backup conserva le versioni precedenti di tutti questi file. Il ripristino si ferma se trova modifiche successive. Usa questo comando per l’intera proposta: Annulla dell’editor riguarda i singoli file.</p>
        <label className="ai-check"><input type="checkbox" checked={!!confirmed} disabled={blocked || lastReceipt !== message} onChange={event => setChoice({ target: expected, value: event.target.checked })} /><span>Voglio ripristinare i file elencati alla versione precedente a questa proposta.</span></label>
        <button type="button" disabled={blocked || !confirmed || lastReceipt !== message} onClick={() => void chat.restoreProject(message.id, receipt)}><RotateCcw size={15} />Ripristina questa proposta</button>
        {lastReceipt !== message && <p className="ai-hint">Ripristina prima la modifica di progetto più recente.</p>}</>}
      {stale && <p className="ai-error">Apri il progetto originale prima di ripristinare.</p>}
      {editor.dirty && <p className="ai-error">Salva o scarta la bozza aperta prima di ripristinare: non verrà sovrascritta.</p>}
      <details><summary>Riferimento del backup locale</summary><p>{receipt.backup}</p></details>
    </section>;
  }
  const review = parsed.review;
  if (!review?.changes.length) return null;
  if (!latest || message.recovered) return <p className="ai-hint">Proposta precedente o recuperata: richiedi una nuova revisione prima di applicare.</p>;
  return <section className="ai-proposal ai-project-code-review" aria-label="Revisione modifiche progetto">
    <h3>Controlla le modifiche al progetto</h3>
    <p>{review.changes.length} file · {review.plan.variables.length} nuove variabili. Un’approvazione per l’insieme; backup prima del salvataggio. Non è una transazione atomica multi-file.</p>
    {!!review.plan.variables.length && <div className="ai-project-new-variables"><strong>Variabili nuove da collegare</strong><ul>{review.plan.variables.map(tag => <li key={tag.name}><strong>{tag.name}</strong> · {tag.dataType}<br />{tag.description}</li>)}</ul><p>Sola lettura, senza indirizzo PLC né connessione inventati. La dichiarazione non rende disponibile un segnale macchina: configura il mapping e collaudalo.</p></div>}
    {review.changes.map(change => { const diff = changedLines(change.before, change.after); return <details className="ai-project-file-diff" key={change.path}>
      <summary>{change.before === null ? "Crea" : "Aggiorna"} {change.path}</summary>
      <p>Parte modificata dalla riga {diff.line}. Il codice è mostrato come testo, non viene eseguito qui.</p>
      <strong>Prima</strong><pre aria-label={`Prima: ${change.path}`}>{change.before === null ? "File non presente" : diff.before || "Nessuna riga precedente"}</pre>
      <strong>Dopo</strong><pre aria-label={`Dopo: ${change.path}`}>{diff.after || "Righe rimosse"}</pre>
    </details>; })}
    <p className="ai-hint">Controllati sintassi, percorsi e import noti. Non sostituisce la compilazione completa del tuo pannello né il collaudo macchina.</p>
    <label className="ai-check"><input type="checkbox" checked={!!confirmed} disabled={blocked} onChange={event => setChoice({ target: expected, value: event.target.checked })} /><span>Ho controllato file e variabili e approvo queste modifiche al progetto.</span></label>
    {stale && <p className="ai-error">Il progetto è cambiato: questa proposta non viene applicata.</p>}
    {editor.dirty && <p className="ai-error">Salva o scarta la bozza prima di applicare. La bozza non verrà sovrascritta.</p>}
    <button type="button" className="button primary" disabled={blocked || !confirmed || !message.projectReview} onClick={() => message.projectReview && void chat.applyProject(message.id, message.projectReview)}>{chat.applying && <LoaderCircle size={15} className="spin" />}Applica le modifiche al progetto</button>
  </section>;
}
