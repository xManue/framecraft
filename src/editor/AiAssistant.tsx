import { LoaderCircle, Settings, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { aiEditContext, type AiEditSnapshot } from "../ai/aiProposal";
import { useEditorAi } from "../state/editorAi";
import { useEditorStore } from "../state/editorStore";
import { AiProjectInterview } from "./AiProjectInterview";
import { AiInterviewDraft } from "./AiInterviewDraft";
import { useEditorShortcuts } from "../state/editorShortcuts";
import { useEditorGuidance } from "../state/editorGuidance";

export function AiAssistant() {
  const ai = useEditorAi();
  const settingsOpen = useEditorShortcuts(state => state.open);
  const helpOpen = useEditorGuidance(state => state.helpOpen), suspended = settingsOpen || helpOpen;
  const project = useEditorStore(state => state.project), document = useEditorStore(state => state.document), selectedId = useEditorStore(state => state.selectedId);
  const loading = useEditorStore(state => state.loading);
  const panel = useRef<HTMLElement>(null);
  const [prompt, setPrompt] = useState(""), [consent, setConsent] = useState(false), [accepted, setAccepted] = useState<string[]>([]);
  const [applying, setApplying] = useState(false), [notice, setNotice] = useState<string>();
  const snapshot: AiEditSnapshot | undefined = project && document && selectedId && document.nodes[selectedId] ? { root: project.root, document, selectedId } : undefined;
  const context = ai.mode === "edit" && snapshot ? aiEditContext(snapshot) : undefined;
  const stale = ai.snapshot && (ai.snapshot.document !== document || ai.snapshot.selectedId !== selectedId || ai.snapshot.root !== project?.root);

  useEffect(() => { setConsent(false); }, [ai.mode, project?.root, document?.version, selectedId, ai.model, ai.account?.email]);
  useEffect(() => { setAccepted(ai.proposal?.operations.map(operation => operation.id) ?? []); }, [ai.proposal]);
  useEffect(() => {
    if (suspended) return;
    const previous = globalThis.document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); useEditorAi.getState().close(); }
      if (event.key !== "Tab") return;
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), details > summary') ?? [])]
        .filter(node => !node.closest("fieldset:disabled") && (!node.closest('details:not([open])') || node.tagName === "SUMMARY"));
      const index = nodes.indexOf(globalThis.document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === nodes.length - 1)) { event.preventDefault(); nodes[0]?.focus(); }
    };
    globalThis.document.addEventListener("keydown", keydown, true);
    return () => { globalThis.document.removeEventListener("keydown", keydown, true); if (!useEditorShortcuts.getState().open && !useEditorGuidance.getState().helpOpen && previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [suspended]);

  const apply = async () => {
    setApplying(true); setNotice(undefined);
    try {
      if (!ai.proposal || ai.proposal.questions.length) throw new Error("Completa le informazioni richieste prima di applicare il piano.");
      if (!ai.snapshot) throw new Error("La proposta non ha un elemento di destinazione.");
      await useEditorStore.getState().applyAiProposal(ai.snapshot, ai.proposal, accepted);
      useEditorAi.setState({ proposal: undefined, snapshot: undefined }); setNotice("Modifiche applicate. Puoi annullarle insieme dall’editor.");
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setApplying(false); }
  };
  return <div className="ai-backdrop" hidden={suspended}>
    <section className="ai-assistant" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ai-title">
      <header><div><small>AI FACOLTATIVA · CODEX CLI</small><h2 id="ai-title">{ai.mode === "create" ? "Costruiamo il tuo pannello, una domanda alla volta" : "Modifica con l’assistente AI"}</h2><p>{ai.mode === "create" ? "Definisci pagine, immagini e dati reali. L’AI verifica il piano; tu approvi la creazione." : "L’AI propone. Tu controlli e approvi. Puoi continuare a mano in qualsiasi momento."}</p></div><button type="button" aria-label="Chiudi assistente AI" onClick={ai.close} disabled={applying || loading}><X size={20} /></button></header>
      <div className="ai-assistant-body">
        <aside className="ai-account-notice" aria-label="Stato account AI">
          <p role="status">{!ai.account?.connected ? "Collega il tuo account ChatGPT in Impostazioni → AI e account per usare l’AI." : !ai.model ? "Account collegato. Scegli un modello in Impostazioni → AI e account." : "AI pronta. Account e modello si gestiscono nelle Impostazioni."}</p>
          {!ai.account?.connected && <p className="ai-hint">Puoi già rispondere alle domande; l’invio all’AI sarà disponibile dopo il collegamento.</p>}
          <button type="button" disabled={applying || loading} onClick={() => useEditorShortcuts.getState().setOpen(true, "ai")}><Settings size={16} />Apri impostazioni AI</button>
        </aside>
        <section className="ai-work" aria-label="Richiesta e proposta AI">{ai.mode === "create" ? <AiInterviewDraft><AiProjectInterview /></AiInterviewDraft> : <>
          <h3>Cosa vuoi cambiare nell’elemento selezionato?</h3>
          <label>La tua richiesta<textarea rows={4} maxLength={8000} value={prompt} disabled={ai.busy} onChange={event => { setPrompt(event.target.value); setConsent(false); }} placeholder="Per esempio: cambia il testo del pulsante e rendilo più grande…" /></label>
          {!context && <p role="status">Seleziona prima un elemento nel canvas. Chiudi questa finestra per sceglierlo.</p>}
          <details className="ai-context"><summary>Contesto che verrà inviato</summary><pre>{context ? JSON.stringify(context, null, 2) : "Seleziona prima un elemento. Nessun sorgente, export macchina, token o valore PLC inviato automaticamente."}</pre></details>
          <label className="ai-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={ai.busy} /><span>Invia la richiesta e questo contesto a Codex usando il mio account. Nessuna modifica viene applicata senza la mia conferma.</span></label>
          <div className="ai-buttons"><button type="button" className="button primary" disabled={!consent || !prompt.trim() || !ai.account?.connected || !ai.model || ai.busy || ai.connecting || ai.checking || !context} onClick={() => { setNotice(undefined); void ai.propose(prompt, snapshot); }}><Sparkles size={16} /> Prepara proposta</button>
            {ai.busy && <button type="button" onClick={() => void ai.cancel()}>Annulla richiesta</button>}</div>
          {ai.busy && <p role="status"><LoaderCircle size={15} className="spin" /> Codex sta preparando la proposta. L’editor non viene modificato.</p>}
          {ai.error && <p className="ai-error" role="alert">{ai.error}</p>}
          {ai.proposal && <section className="ai-proposal" aria-label="Revisione proposta"><h3>Controlla prima di applicare</h3><p>{ai.proposal.summary}</p>
            {ai.proposal.questions.length > 0 && <div role="status"><strong>Informazioni da completare</strong><ul>{ai.proposal.questions.map((question, index) => <li key={index}>{question}</li>)}</ul><p>Aggiungi le risposte alla richiesta e prepara una nuova proposta.</p></div>}
            {ai.proposal.warnings.length > 0 && <ul>{ai.proposal.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
            <p>Destinazione: {ai.snapshot?.document.file.split(/[\\/]/).at(-1)} · {ai.snapshot?.document.nodes[ai.snapshot.selectedId]?.label}</p>
            {ai.proposal.operations.map(operation => <label className="ai-operation" key={operation.id}><input type="checkbox" checked={accepted.includes(operation.id)} onChange={event => setAccepted(event.target.checked ? [...accepted, operation.id] : accepted.filter(id => id !== operation.id))} /><span><strong>{operation.type === "text" ? "Testo" : operation.property}</strong><code>{operation.value}</code></span></label>)}
            {stale && <p className="ai-error" role="alert">La selezione o la pagina sono cambiate. Questa proposta non può essere applicata: richiedine una nuova.</p>}
            <button type="button" className="button primary" disabled={applying || loading || ai.busy || !!stale || !!ai.proposal.questions.length || !accepted.length} onClick={() => void apply()}>{applying ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}Applica le modifiche selezionate</button>
          </section>}
          {notice && <p role="status">{notice}</p>}
        </>}</section>
      </div>
      <footer><span>Nessuna scrittura PLC, nessun deploy. Le risposte incomplete non vengono applicate.</span><button type="button" onClick={ai.close} disabled={applying || loading}>Chiudi e continua a mano</button></footer>
    </section>
  </div>;
}
