import { FileText, LoaderCircle, MessageSquare, Paperclip, Plus, Send, Settings, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { aiSelectionKey } from "../ai/aiProposal";
import { reviewAiEdits } from "../ai/aiEditReview";
import { useEditorAi } from "../state/editorAi";
import { useEditorAiChat } from "../state/editorAiChat";
import { useEditorStore } from "../state/editorStore";
import { useEditorShortcuts } from "../state/editorShortcuts";
import type { AiChatMessage } from "../ai/aiChat";
import { aiChatContext, aiChatInputBudget, prepareAiChat } from "../ai/aiChat";
import { AiEditReview } from "./AiEditReview";
import { AiModelControls } from "./AiModelControls";
import { AiPageReview } from "./AiPageReview";
import { aiChatScope } from "../ai/aiPageContext";
import { AiChatQuestions } from "./AiChatQuestions";
import { pendingAiQuestions } from "../ai/aiChatQuestions";
import { AiChatDataSources } from "./AiChatDataSources";
import { sameAiDataReferences } from "../ai/aiBindings";

function ChatProposal({ message, latest }: { message: AiChatMessage; latest: boolean }) {
  const data = useEditorAiChat(state => state.dataReferences);
  if (!message.status && message.proposal?.operations.some(operation => operation.type === "binding") && !sameAiDataReferences(message.snapshot?.dataReferences, data)) return <p className="ai-error">I dati nel contesto sono cambiati: richiedi una nuova proposta prima di applicare collegamenti.</p>;
  return message.snapshot?.targets ? <AiPageReview message={message} latest={latest} /> : <ElementChatProposal message={message} latest={latest} />;
}
function ElementChatProposal({ message, latest }: { message: AiChatMessage; latest: boolean }) {
  const { proposal, snapshot } = message;
  const document = useEditorStore(state => state.document), selectedId = useEditorStore(state => state.selectedId), root = useEditorStore(state => state.project?.root);
  const info = useEditorStore(state => state.selectionInfo), scope = useEditorStore(state => state.editScope), loading = useEditorStore(state => state.loading);
  const interactionMode = useEditorStore(state => state.interactionMode);
  const sending = useEditorAiChat(state => state.sending), applying = useEditorAiChat(state => state.applying);
  const review = useMemo(() => proposal && snapshot ? reviewAiEdits(snapshot, proposal) : undefined, [proposal, snapshot]);
  const [choice, setChoice] = useState<{ review: typeof review; ids: string[] }>();
  if (!proposal?.operations.length || !snapshot || !review) return null;
  if (message.status === "applied") return <p className="ai-chat-applied" role="status">Modifiche applicate · puoi usare Annulla nell’editor.</p>;
  if (!latest) return <p className="ai-hint">Proposta precedente, non più applicabile.</p>;
  const stale = snapshot.root !== root || snapshot.document !== document || snapshot.selectedId !== selectedId || snapshot.selectionKey !== aiSelectionKey(info, scope);
  const shared = (info?.instanceCount ?? 1) > 1;
  const accepted = choice?.review === review ? choice.ids : review.defaults;
  const disabled = sending || applying || loading || stale || shared || interactionMode !== "edit";
  return <section className="ai-proposal" aria-label="Revisione proposta">
    <h3>Controlla prima di applicare</h3>
    <p>Destinazione: {snapshot.document.file.split(/[\\/]/).at(-1)} · {snapshot.document.nodes[snapshot.selectedId]?.label}</p>
    <AiEditReview snapshot={snapshot} proposal={proposal} review={review} accepted={accepted} onAccepted={ids => setChoice({ review, ids })} disabled={disabled} />
    {stale && <p className="ai-error">La pagina o la selezione sono cambiate. Riseleziona la destinazione originale; se il file è cambiato, allega di nuovo l’elemento e richiedi una nuova proposta.</p>}
    {shared && <p className="ai-error">Elemento con più copie: scegli la copia da modificare nei campi dell’Inspector.</p>}
    <button type="button" className="button primary" disabled={disabled || !!proposal.questions.length || !!review.error || !accepted.length} onClick={() => void useEditorAiChat.getState().apply(message.id, accepted)}>{applying && <LoaderCircle size={16} className="spin" />}Applica le modifiche selezionate</button>
  </section>;
}

export function AiProjectChat() {
  const chat = useEditorAiChat(), ai = useEditorAi();
  const project = useEditorStore(state => state.project), pages = useEditorStore(state => state.pages), activePage = useEditorStore(state => state.activePageId);
  const selectedId = useEditorStore(state => state.selectedId), mode = useEditorStore(state => state.interactionMode);
  const [reset, setReset] = useState(false);
  const [writingNew, setWritingNew] = useState<string>();
  const pendingQuestion = pendingAiQuestions(chat.messages)?.id, last = chat.messages.at(-1);
  const pendingProposal = last?.role === "assistant" && last.proposal?.operations.length && !last.status ? last.id : undefined;
  const pendingWork = pendingQuestion ?? pendingProposal, showComposer = !pendingWork || writingNew === pendingWork;
  const consent = chat.allowed();
  const textarea = useRef<HTMLTextAreaElement>(null), log = useRef<HTMLDivElement>(null);
  const busy = chat.sending || chat.applying || ai.busy;
  useEffect(() => { (log.current?.querySelector<HTMLTextAreaElement>(".ai-chat-questions textarea:not(:disabled)") ?? textarea.current)?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const node = log.current; if (!node) return;
    const review = !chat.sending && (node.querySelector(".ai-chat-questions") || node.querySelector(".ai-chat-message.assistant:last-child .ai-proposal"));
    node.scrollTop = review ? Math.max(0, node.scrollTop + review.getBoundingClientRect().top - node.getBoundingClientRect().top - 8) : node.scrollHeight;
  }, [chat.messages.length, chat.sending]);
  const page = pages.find(item => item.id === activePage);
  const preview = useMemo(() => {
    try {
      const snapshot = aiChatScope(chat.attachments, chat.dataReferences);
      return { prepared: chat.sending && chat.prepared ? chat.prepared : prepareAiChat(chat.draft.trim(), snapshot, aiChatContext(chat.attachments, chat.messages, chat.contextNotes, chat.dataReferences)) };
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [chat.draft, chat.contextNotes, chat.attachments, chat.messages, chat.sending, chat.prepared, chat.dataReferences]);
  const prepared = preview.prepared;
  const send = () => { if (consent) void chat.send(); };
  return <aside className="ai-assistant ai-chat" aria-label="Chat AI del progetto" data-editor-shortcuts="off" onKeyDown={event => {
    if (event.key === "Escape" && !busy) { event.stopPropagation(); ai.close(); }
  }}>
    <header><div><small>CODEX CLI · {project?.name ?? "PROGETTO"}</small><h2><MessageSquare size={18} />Chat AI</h2></div>
      <div className="ai-chat-tools"><button type="button" title="Nuova chat" aria-label="Nuova chat" disabled={busy} onClick={() => setReset(true)}><Plus size={18} /></button><button type="button" aria-label="Impostazioni AI" onClick={() => useEditorShortcuts.getState().setOpen(true, "ai")}><Settings size={18} /></button><button type="button" aria-label="Chiudi chat AI" disabled={chat.applying} onClick={ai.close}><X size={18} /></button></div>
    </header>
    <AiModelControls />
    {!ai.account?.connected || !ai.model ? <div className="ai-chat-account"><p>Collega l’account ChatGPT e scegli il modello in Impostazioni → AI e account.</p><button type="button" onClick={() => useEditorShortcuts.getState().setOpen(true, "ai")}>Apri impostazioni AI</button></div> : <p className="ai-chat-model">{ai.model} · conversazione solo per questa sessione del progetto</p>}
    {reset && <div className="ai-chat-reset" role="alert"><p>Vuoi svuotare messaggi, allegati e richiesta? Il pannello non viene modificato; le indicazioni fissate restano.</p><button type="button" disabled={busy} onClick={() => { chat.clear(); setReset(false); }}>Svuota e ricomincia</button><button type="button" onClick={() => setReset(false)}>Conserva chat</button></div>}
    <div className="ai-chat-log" role="log" aria-label="Messaggi della chat" ref={log} aria-busy={chat.sending}>
      {!chat.messages.length && <div className="ai-chat-empty"><MessageSquare size={28} /><h3>Parliamo del tuo pannello</h3><p>Allega una pagina o un elemento, poi scrivi cosa vuoi cambiare. Puoi anche usare il tasto destro nell’editor.</p><p>La pagina allegata include struttura, testi e stili modificabili: l’AI può proporre un restyling senza chiederti di selezionare ogni oggetto. Controlli tu cosa applicare.</p></div>}
      {chat.messages.map((message, index) => <article className={`ai-chat-message ${message.role}`} key={message.id} aria-label={message.role === "user" ? "Tu" : "Assistente"}>
        <strong>{message.role === "user" ? "Tu" : "Assistente"}</strong>
        {!!message.attachments?.length && <p className="ai-chat-references">{message.attachments.join(" · ")}</p>}
        <p className="ai-chat-text">{message.role === "assistant" && message.proposal?.questions.length ? [message.proposal.summary, ...message.proposal.warnings].join("\n\n") : message.text}</p>
        {(message.status === "error" || message.status === "cancelled") && <small>{message.replyTo ? "Invio non completato · risposte conservate nei chiarimenti" : "Richiesta non completata · testo conservato qui sotto"}</small>}
        {message.role === "assistant" && <><AiChatQuestions message={message} /><ChatProposal message={message} latest={index === chat.messages.length - 1} /></>}
      </article>)}
      {chat.sending && <p role="status"><LoaderCircle size={16} className="spin" /> Codex sta rispondendo. Nessun file viene modificato.</p>}
    </div>
    <form className="ai-chat-composer" onSubmit={event => { event.preventDefault(); if (showComposer) send(); }}>
      {pendingWork && <div className="ai-chat-compose-mode"><button type="button" disabled={busy} aria-expanded={showComposer} onClick={() => setWritingNew(showComposer ? undefined : pendingWork)}>{showComposer ? pendingQuestion ? "Torna ai chiarimenti" : "Torna alla proposta" : "Scrivi una nuova richiesta"}</button>{!showComposer && <small>{chat.draft ? "Bozza conservata. " : ""}{pendingQuestion ? "Completa i dettagli sopra per continuare." : "Controlla la proposta sopra e scegli le modifiche da applicare."}</small>}</div>}
      <div hidden={!showComposer} className="ai-chat-compose-fields">
      <div className="ai-chat-attach"><button type="button" disabled={busy || !selectedId || mode !== "edit"} onClick={chat.attachSelection}><Paperclip size={15} />Elemento selezionato</button><button type="button" disabled={busy || !page} onClick={() => page && chat.attachPage(page)}><FileText size={15} />Pagina aperta</button></div>
      <div className="ai-chat-attachments" aria-label="Allegati della richiesta">{chat.attachments.map(item => <span key={item.id}><span>{item.kind === "element" ? "Elemento" : "Pagina"}: {item.label}{item.snapshot?.targets && ` · ${Object.keys(item.snapshot.targets).length} oggetti modificabili`}</span><button type="button" aria-label={`Rimuovi allegato ${item.label}`} disabled={busy} onClick={() => chat.removeAttachment(item.id)}><X size={14} /></button></span>)}</div>
      <label>La tua richiesta<textarea ref={textarea} rows={3} maxLength={8000} value={chat.draft} disabled={busy} onChange={event => chat.setDraft(event.target.value)} placeholder="Chiedi qualcosa sul pannello…" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} /></label>
      <p className="ai-context-stats" aria-label="Peso del contesto">{prepared ? `~${prepared.estimatedTokens.toLocaleString("it-IT")} token stimati · ${(prepared.inputBytes / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} / ${aiChatInputBudget / 1000} kB locali` : "Contesto da ridurre prima dell’invio"}</p>
      <details className="ai-context"><summary>Cosa invierai a Codex</summary>
        <p>Richiesta corrente e destinazione una sola volta, indicazioni fissate, scambi recenti e richiami pertinenti. Nessun sorgente completo, valore PLC o credenziale raccolto automaticamente. Non inserire segreti.</p>
        <label>Indicazioni da ricordare<textarea rows={2} maxLength={2000} value={chat.contextNotes} disabled={busy} onChange={event => chat.setContextNotes(event.target.value)} placeholder="Es. testi in italiano, conserva i colori degli allarmi…" /></label>
        <p className="ai-hint">Restano nella sessione del progetto anche con Nuova chat. Vengono inviate integralmente; non vengono riscritte dall’AI.</p>
        {prepared && <><p>{prepared.recentTurns} scambi recenti · {prepared.recalledTurns} richiami da messaggi precedenti · {prepared.omittedTurns} scambi esclusi · {prepared.abbreviatedMessages} messaggi abbreviati. La chat originale resta visibile.</p>
          <p>Scheda template: {prepared.template === "full" ? "contratto completo" : prepared.template === "reference" ? "riferimento compatto per questa modifica grafica" : "nessuna"}. La stima include prompt e schema, non token interni o risposta di Codex; non è un conteggio esatto né la quota dell’account.</p>
          <details><summary>Richiesta tecnica completa</summary><pre>{JSON.stringify(prepared.payload, null, 2)}</pre></details></>}
      </details>
      {preview.error && <p className="ai-error" role="alert">{preview.error}</p>}
      </div>
      <AiChatDataSources />
      <label className="ai-consent"><input type="checkbox" checked={consent} disabled={!ai.account?.connected} onChange={event => chat.setAllowed(event.target.checked)} /><span>{consent && !showComposer ? "Invio autorizzato per questa sessione. Togli la spunta per revocare." : "Consenti l’invio di richieste e contesto scelto per questa sessione del progetto. Non serve confermare ogni messaggio; togli la spunta per revocare. Le modifiche richiedono comunque approvazione."}</span></label>
      {chat.error && <p className="ai-error" role="alert">{chat.error}</p>}
      <div className="ai-chat-send">{showComposer && <small>Invio: invia · Maiusc+Invio: a capo</small>}{chat.sending ? <button type="button" onClick={() => void chat.cancel()}>Annulla richiesta</button> : showComposer && <button type="submit" className="button primary" disabled={!!preview.error || !consent || !chat.draft.trim() || !project || !ai.account?.connected || !ai.model || busy || ai.checking || ai.connecting}><Send size={16} />Invia</button>}</div>
    </form>
  </aside>;
}
