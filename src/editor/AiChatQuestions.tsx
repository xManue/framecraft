import { useMemo } from "react";
import { Send } from "lucide-react";
import type { AiChatMessage } from "../ai/aiChat";
import { pendingAiQuestions, prepareAiQuestionReply } from "../ai/aiChatQuestions";
import { useEditorAi } from "../state/editorAi";
import { useEditorAiChat } from "../state/editorAiChat";

export function AiChatQuestions({ message }: { message: AiChatMessage }) {
  const chat = useEditorAiChat(), ai = useEditorAi();
  const active = pendingAiQuestions(chat.messages)?.id === message.id;
  const questions = message.proposal?.questions ?? [];
  const complete = questions.every((_, index) => message.answers?.[index]?.deferred || message.answers?.[index]?.text.trim());
  const preview = useMemo(() => {
    if (!active || !complete) return {};
    try { return { reply: prepareAiQuestionReply(message.id, chat.attachments, chat.messages, chat.contextNotes, chat.dataReferences) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [active, complete, message.id, chat.attachments, chat.messages, chat.contextNotes, chat.dataReferences]);
  if (!questions.length) return null;
  if (!active) return <details className="ai-chat-questions-previous" open={message.recovered && message.answers?.some(answer => !!answer.text || answer.deferred) ? true : undefined}><summary>Chiarimenti di questa proposta{message.recovered ? " · risposte recuperate" : ""}</summary><ul>{questions.map((question, index) => <li key={index}>{question}{message.answers?.[index]?.deferred ? ` — Rinviato, parte invariata${message.recovered && message.answers[index].text ? ` · Testo conservato: ${message.answers[index].text}` : ""}` : message.answers?.[index]?.text ? ` — ${message.answers[index].text}` : ""}</li>)}</ul></details>;
  const busy = chat.sending || chat.applying || ai.busy || ai.checking || ai.connecting;
  return <form className="ai-chat-questions" aria-label="Chiarimenti richiesti dall’AI" onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (preview.reply && chat.allowed()) void chat.send(message.id); }}>
    <h3>Completa questi dettagli</h3><p>Rispondi qui: riprenderò la stessa richiesta sugli stessi allegati. Se manca un dato, quella parte resta invariata. Non inserire password o credenziali.</p>
    <details><summary>Richiesta che riprendi</summary><p className="ai-chat-text">{message.originalRequest}</p></details>
    {questions.map((question, index) => {
      const answer = message.answers?.[index] ?? { text: "", deferred: false }, id = `ai-question-${message.id}-${index}`;
      return <fieldset key={index} disabled={busy}><legend>Domanda {index + 1}</legend><label htmlFor={id}>{question}</label>
        <textarea id={id} rows={2} maxLength={1000} value={answer.text} disabled={busy || answer.deferred} onChange={event => chat.setAnswer(message.id, index, { text: event.target.value })} placeholder="Scrivi la risposta…" />
        <label className="ai-check ai-question-defer"><input type="checkbox" checked={answer.deferred} onChange={event => chat.setAnswer(message.id, index, { deferred: event.target.checked })} /><span>Non ho questo dato: lascia invariata questa parte</span></label>
      </fieldset>;
    })}
    {!complete && <p className="ai-hint">Rispondi a ogni domanda oppure scegli di lasciare invariata la parte interessata.</p>}
    {preview.reply && <details><summary>Contesto con queste risposte · ~{preview.reply.prepared.estimatedTokens.toLocaleString("it-IT")} token stimati</summary><pre>{JSON.stringify(preview.reply.prepared.payload, null, 2)}</pre></details>}
    {preview.error && <p className="ai-error" role="alert">{preview.error}</p>}
    {!chat.allowed() && <p className="ai-hint">Autorizza l’invio della sessione nel compositore qui sotto.</p>}
    <button type="submit" className="button primary" disabled={busy || !preview.reply || !chat.allowed() || !ai.account?.connected || !ai.model}><Send size={16} />Invia risposte e continua</button>
    <p className="ai-hint">Le risposte non salvano né applicano modifiche. La bozza sotto resta conservata.</p>
  </form>;
}
