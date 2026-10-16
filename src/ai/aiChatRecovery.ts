import type { AiChatMessage } from "./aiChat";
import { parseAiProjectReceipt } from "./aiProjectEdits";

export const aiChatRecoveryKey = "framecraft.ai-chat-reload.v1";
const maxLength = 2_000_000;
export interface AiChatRecovery {
  version: 1;
  root: string;
  account: string | null;
  open: boolean;
  draft: string;
  contextNotes: string;
  messages: AiChatMessage[];
  references: string[];
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || value.length > limit) throw new Error("La copia della chat contiene un testo non valido.");
  return value;
}
function strings(value: unknown, count: number, limit: number): string[] {
  if (!Array.isArray(value) || value.length > count) throw new Error("La copia della chat contiene un elenco non valido.");
  return value.map(item => text(item, limit));
}
function history(value: unknown): AiChatMessage {
  if (!object(value) || !["user", "assistant"].includes(value.role as string)) throw new Error("Messaggio della chat non valido.");
  const item: AiChatMessage = { id: text(value.id, 200), role: value.role as AiChatMessage["role"], text: text(value.text, 200_000), recovered: true };
  if (value.attachments !== undefined) item.attachments = strings(value.attachments, 6, 300);
  if (value.status !== undefined) {
    if (!["applied", "cancelled", "error"].includes(value.status as string)) throw new Error("Stato del messaggio non valido.");
    item.status = value.status as AiChatMessage["status"];
  }
  if (value.originalRequest !== undefined) item.originalRequest = text(value.originalRequest, 8000);
  if (value.replyTo !== undefined) item.replyTo = text(value.replyTo, 200);
  if (value.projectReceipt !== undefined) item.projectReceipt = parseAiProjectReceipt(value.projectReceipt);
  if (value.proposal !== undefined) {
    if (!object(value.proposal)) throw new Error("Riepilogo della chat non valido.");
    item.proposal = { version: 1, mode: "edit", summary: text(value.proposal.summary, 100_000), questions: strings(value.proposal.questions, 100, 100_000), warnings: strings(value.proposal.warnings, 100, 100_000), provenance: [], project: null, operations: [] };
  }
  if (value.answers !== undefined) {
    if (!Array.isArray(value.answers) || value.answers.length > 100) throw new Error("Risposte della chat non valide.");
    item.answers = value.answers.map(answer => {
      if (!object(answer) || typeof answer.deferred !== "boolean") throw new Error("Risposta della chat non valida.");
      return { text: text(answer.text, 1000), deferred: answer.deferred };
    });
  }
  return item;
}
export function serializeAiChatRecovery(value: AiChatRecovery) {
  // Only user-visible text. Never serialize documents, ASTs, PLC catalogues, requests or consent.
  const source = JSON.stringify({ version: 1, root: value.root, account: value.account, open: value.open, draft: value.draft, contextNotes: value.contextNotes,
    references: value.references,
    messages: value.messages.map(item => ({ id: item.id, role: item.role, text: item.text, attachments: item.attachments, status: item.status,
      originalRequest: item.originalRequest, replyTo: item.replyTo, answers: item.answers, projectReceipt: item.projectReceipt && parseAiProjectReceipt(item.projectReceipt),
      proposal: item.proposal && { summary: item.proposal.summary, questions: item.proposal.questions, warnings: item.proposal.warnings } })) });
  if (source.length > maxLength) throw new Error("La chat supera lo spazio previsto per il recupero. Copia i testi importanti prima di ricaricare.");
  parseAiChatRecovery(source);
  return source;
}
export function parseAiChatRecovery(source: string): AiChatRecovery {
  if (source.length > maxLength) throw new Error("La copia della chat è troppo grande.");
  const value: unknown = JSON.parse(source);
  if (!object(value) || value.version !== 1 || typeof value.open !== "boolean" || !Array.isArray(value.messages) || value.messages.length > 40) throw new Error("La copia della chat non è valida.");
  for (const message of value.messages) if (object(message) && message.projectReceipt !== undefined && parseAiProjectReceipt(message.projectReceipt).root !== value.root) throw new Error("Il backup della chat appartiene a un altro progetto.");
  return { version: 1, root: text(value.root, 8000), account: value.account === null ? null : text(value.account, 2000), open: value.open,
    draft: text(value.draft, 8000), contextNotes: text(value.contextNotes, 2000), messages: value.messages.map(history), references: strings(value.references, 14, 300) };
}
