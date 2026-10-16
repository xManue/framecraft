import { aiChatContext, prepareAiChat, type AiChatAttachment, type AiChatClarification, type AiChatMessage } from "./aiChat";
import { aiChatScope } from "./aiPageContext";
import { extendsAiDataReferences, type AiDataReference } from "./aiBindings";

export const aiMessageQuestions = (message: AiChatMessage) => message.projectReview?.plan.questions ?? message.projectQuestions ?? message.proposal?.questions ?? [];
const projectQuestions = (message: AiChatMessage) => !!message.projectReview || !!message.projectQuestions;
export function pendingAiQuestions(messages: AiChatMessage[], projectAccess?: boolean) {
  const latest = [...messages].reverse().find(message => message.role === "assistant");
  return latest && aiMessageQuestions(latest).length && !latest.status && !latest.recovered
    && (projectAccess === undefined || projectAccess === projectQuestions(latest)) ? latest : undefined;
}
function questionReply(id: string, attachments: AiChatAttachment[], messages: AiChatMessage[], projectAccess: boolean, dataReferences: readonly AiDataReference[]) {
  const target = pendingAiQuestions(messages, projectAccess);
  if (!target || target.id !== id || !target.originalRequest) throw new Error("Questi chiarimenti appartengono a una richiesta precedente. Usa le domande più recenti o invia una nuova richiesta.");
  if (target.questionAttachments !== attachments) throw new Error("Gli allegati sono cambiati. Invia una nuova richiesta con il contesto attuale; le risposte restano conservate nella chat.");
  if (!projectAccess && !extendsAiDataReferences(target.questionData, dataReferences)) throw new Error("I dati scelti sono cambiati: invia una nuova richiesta, senza trasferire le risposte sui nuovi collegamenti.");
  const answers: AiChatClarification["answers"] = aiMessageQuestions(target).map((question, index) => {
    const value = target.answers?.[index];
    if (value?.deferred) return { question, status: "deferred" };
    if (!value?.text.trim()) throw new Error(`Completa la domanda ${index + 1} oppure scegli di lasciare invariata quella parte.`);
    return { question, status: "answered", answer: value.text.trim() };
  });
  const merged = new Map((target.clarification?.answers ?? []).map(answer => [answer.question, answer]));
  answers.forEach(answer => merged.set(answer.question, answer));
  const clarification: AiChatClarification = { request: target.originalRequest, answers: [...merged.values()] };
  const displayText = "Risposte ai chiarimenti\n\n" + answers.map((answer, index) => `${index + 1}. ${answer.question}\n${answer.status === "answered" ? answer.answer : "Dato non disponibile: lascia invariata questa parte."}`).join("\n\n");
  return { target, clarification, displayText };
}
export function prepareAiProjectQuestionReply(id: string, attachments: AiChatAttachment[], messages: AiChatMessage[]) {
  const reply = questionReply(id, attachments, messages, true, []);
  if (!reply.target.questionSelections) throw new Error("Il contesto iniziale di questa domanda non è disponibile. Invia una nuova richiesta; le risposte restano conservate.");
  return { ...reply, selections: reply.target.questionSelections };
}
export function prepareAiQuestionReply(id: string, attachments: AiChatAttachment[], messages: AiChatMessage[], notes: string, dataReferences: readonly AiDataReference[] = []) {
  const { clarification, displayText } = questionReply(id, attachments, messages, false, dataReferences);
  const context = { ...aiChatContext(attachments, messages, notes, dataReferences), clarification }, snapshot = aiChatScope(attachments, dataReferences);
  const prompt = "Prosegui la richiesta originale usando le risposte ai chiarimenti. Conserva le parti rinviate.";
  const prepared = prepareAiChat(prompt, snapshot, context);
  return { prompt, context, snapshot, prepared, displayText, clarification };
}
