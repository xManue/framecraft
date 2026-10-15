import { FileText, LoaderCircle, MessageSquare, Paperclip, Plus, Send, Settings, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { aiSelectionKey } from "../ai/aiProposal";
import { reviewAiEdits } from "../ai/aiEditReview";
import { useEditorAi } from "../state/editorAi";
import { useEditorAiChat } from "../state/editorAiChat";
import { useEditorStore } from "../state/editorStore";
import { useEditorShortcuts } from "../state/editorShortcuts";
import type { AiChatMessage } from "../ai/aiChat";
import { AiEditReview } from "./AiEditReview";

function ChatProposal({ message, latest }: { message: AiChatMessage; latest: boolean }) {
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
  const [consent, setConsent] = useState(false), [reset, setReset] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null), log = useRef<HTMLDivElement>(null);
  const busy = chat.sending || chat.applying || ai.busy;
  useEffect(() => { setConsent(false); }, [chat.draft, chat.attachments, chat.generation, ai.account?.email, ai.account?.connected, ai.model]);
  useEffect(() => { textarea.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { const node = log.current; if (node) node.scrollTop = node.scrollHeight; }, [chat.messages.length, chat.sending]);
  const page = pages.find(item => item.id === activePage);
  const context = chat.attachments.map(({ kind, label, context }) => ({ kind, label, context }));
  const send = () => { if (consent) { setConsent(false); void chat.send(); } };
  return <aside className="ai-assistant ai-chat" aria-label="Chat AI del progetto" data-editor-shortcuts="off" onKeyDown={event => {
    if (event.key === "Escape" && !busy) { event.stopPropagation(); ai.close(); }
  }}>
    <header><div><small>CODEX CLI · {project?.name ?? "PROGETTO"}</small><h2><MessageSquare size={18} />Chat AI</h2></div>
      <div className="ai-chat-tools"><button type="button" title="Nuova chat" aria-label="Nuova chat" disabled={busy} onClick={() => setReset(true)}><Plus size={18} /></button><button type="button" aria-label="Impostazioni AI" onClick={() => useEditorShortcuts.getState().setOpen(true, "ai")}><Settings size={18} /></button><button type="button" aria-label="Chiudi chat AI" disabled={chat.applying} onClick={ai.close}><X size={18} /></button></div>
    </header>
    {!ai.account?.connected || !ai.model ? <div className="ai-chat-account"><p>Collega l’account ChatGPT e scegli il modello in Impostazioni → AI e account.</p><button type="button" onClick={() => useEditorShortcuts.getState().setOpen(true, "ai")}>Apri impostazioni AI</button></div> : <p className="ai-chat-model">{ai.model} · conversazione solo per questa sessione del progetto</p>}
    {reset && <div className="ai-chat-reset" role="alert"><p>Vuoi svuotare messaggi, allegati e richiesta? Il pannello non viene modificato.</p><button type="button" disabled={busy} onClick={() => { chat.clear(); setReset(false); }}>Svuota e ricomincia</button><button type="button" onClick={() => setReset(false)}>Conserva chat</button></div>}
    <div className="ai-chat-log" role="log" aria-label="Messaggi della chat" ref={log} aria-busy={chat.sending}>
      {!chat.messages.length && <div className="ai-chat-empty"><MessageSquare size={28} /><h3>Parliamo del tuo pannello</h3><p>Fai una domanda o allega un riferimento. Puoi usare il tasto destro su una pagina o su un elemento.</p><p>Le pagine sono riferimenti di nome e percorso. Per modificare testo e aspetto allega l’elemento: un solo destinatario alla volta.</p></div>}
      {chat.messages.map((message, index) => <article className={`ai-chat-message ${message.role}`} key={message.id} aria-label={message.role === "user" ? "Tu" : "Assistente"}>
        <strong>{message.role === "user" ? "Tu" : "Assistente"}</strong>
        {!!message.attachments?.length && <p className="ai-chat-references">{message.attachments.join(" · ")}</p>}
        <p className="ai-chat-text">{message.text}</p>
        {(message.status === "error" || message.status === "cancelled") && <small>Richiesta non completata · testo conservato qui sotto</small>}
        {message.role === "assistant" && <ChatProposal message={message} latest={index === chat.messages.length - 1} />}
      </article>)}
      {chat.sending && <p role="status"><LoaderCircle size={16} className="spin" /> Codex sta rispondendo. Nessun file viene modificato.</p>}
    </div>
    <form className="ai-chat-composer" onSubmit={event => { event.preventDefault(); send(); }}>
      <div className="ai-chat-attach"><button type="button" disabled={busy || !selectedId || mode !== "edit"} onClick={chat.attachSelection}><Paperclip size={15} />Elemento selezionato</button><button type="button" disabled={busy || !page} onClick={() => page && chat.attachPage(page)}><FileText size={15} />Pagina aperta</button></div>
      <div className="ai-chat-attachments" aria-label="Allegati della richiesta">{chat.attachments.map(item => <span key={item.id}><span>{item.kind === "element" ? "Destinazione" : "Pagina"}: {item.label}</span><button type="button" aria-label={`Rimuovi allegato ${item.label}`} disabled={busy} onClick={() => chat.removeAttachment(item.id)}><X size={14} /></button></span>)}</div>
      <label>La tua richiesta<textarea ref={textarea} rows={3} maxLength={8000} value={chat.draft} disabled={busy} onChange={event => chat.setDraft(event.target.value)} placeholder="Chiedi qualcosa sul pannello…" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} /></label>
      <details className="ai-context"><summary>Cosa invierai a Codex</summary><p>La richiesta, gli ultimi 12 messaggi completati e gli allegati elencati. Nessun sorgente completo, valore PLC o credenziale raccolto automaticamente. Non inserire segreti nei messaggi.</p><pre>{JSON.stringify(context, null, 2)}</pre></details>
      <label className="ai-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>Invia richiesta, cronologia recente e questi allegati usando il mio account. Le modifiche richiedono la mia conferma.</span></label>
      {chat.error && <p className="ai-error" role="alert">{chat.error}</p>}
      <div className="ai-chat-send"><small>Invio: invia · Maiusc+Invio: a capo</small>{chat.sending ? <button type="button" onClick={() => void chat.cancel()}>Annulla richiesta</button> : <button type="submit" className="button primary" disabled={!consent || !chat.draft.trim() || !project || !ai.account?.connected || !ai.model || busy || ai.checking || ai.connecting}><Send size={16} />Invia</button>}</div>
    </form>
  </aside>;
}
