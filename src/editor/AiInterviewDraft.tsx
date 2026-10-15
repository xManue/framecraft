import { useState, type ReactNode } from "react";
import { LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { useEditorAiDraft } from "../state/editorAiDraft";
import { useEditorAi } from "../state/editorAi";

export function AiInterviewDraft({ children }: { children: ReactNode }) {
  const draft = useEditorAiDraft(), aiBusy = useEditorAi(state => state.busy);
  const [confirm, setConfirm] = useState(false);
  if (!draft.enabled) return children;
  const busy = draft.checking || draft.saving || draft.resetting || aiBusy;
  return <>
    <aside className="ai-account-notice ai-draft-notice" aria-label="Bozza locale del questionario">
      {draft.resetting ? <p role="status"><LoaderCircle size={16} className="spin" />Eliminazione della sola bozza del questionario…</p> : draft.checking ? <p role="status"><LoaderCircle size={16} className="spin" />Controllo se ci sono risposte da recuperare…</p> : draft.pending ? <>
        <h3>Vuoi riprendere il pannello che stavi preparando?</h3>
        <p><strong>{draft.pending.interview.machineName || "Nuovo pannello"}</strong> · {draft.pending.interview.spec.pages.length} pagine · salvato il {new Date(draft.pending.savedAt).toLocaleString("it-IT")}</p>
        <p>Riprendi le risposte conservate su questo PC, sostituendo eventuali risposte già aperte in questa sessione. Immagini e cataloghi restano locali; controlla che siano ancora disponibili. Consensi AI e conferme dei comandi non vengono recuperati.</p>
        <button type="button" className="button primary" disabled={busy} onClick={draft.resume}><RotateCcw size={16} />Riprendi il questionario</button>
      </> : draft.recovered ? <p role="status">Risposte recuperate. Ricontrolla immagini, tag e ogni comando: i mapping di scrittura richiedono una nuova conferma. Nessuna richiesta AI o connessione PLC è partita.</p> : <p>{draft.saving ? "Conservazione delle risposte in corso…" : draft.savedAt ? "Bozza conservata su questo PC, disponibile anche dopo il riavvio dell’app." : "Le risposte verranno conservate su questo PC. Non inserire password, token o PIN."}</p>}
      {draft.error && <p className="ai-error" role="alert">{draft.error}</p>}
      {draft.error && <button type="button" disabled={busy} onClick={() => void draft.retry()}>Rileggi la bozza e riprova</button>}
      {draft.needsChoice && <button type="button" disabled={busy} onClick={draft.sessionOnly}>Continua senza recupero locale</button>}
      {draft.canClear && !confirm && <button type="button" disabled={busy} onClick={() => setConfirm(true)}><Trash2 size={16} />Ricomincia da zero</button>}
      {confirm && <div role="group" aria-label="Conferma eliminazione bozza questionario"><p>Eliminare le risposte conservate e ricominciare? I progetti, le immagini e i cataloghi originali non vengono eliminati.</p><button type="button" disabled={busy} onClick={() => { void draft.restart().then(() => setConfirm(false)); }}>Elimina bozza e ricomincia</button><button type="button" disabled={busy} onClick={() => setConfirm(false)}>Conserva le risposte</button></div>}
    </aside>
    {!draft.checking && !draft.resetting && !draft.needsChoice && children}
  </>;
}
