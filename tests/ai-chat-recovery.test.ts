// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { aiChatRecoveryKey, parseAiChatRecovery, serializeAiChatRecovery, type AiChatRecovery } from "../src/ai/aiChatRecovery";
import { useEditorAiChat } from "../src/state/editorAiChat";
import { installAiChatRecovery } from "../src/state/editorAiChatRecovery";
import { useEditorAi } from "../src/state/editorAi";
import { useEditorStore } from "../src/state/editorStore";
import { pendingAiQuestions } from "../src/ai/aiChatQuestions";
import type { AiProvider } from "../src/ai/aiProvider";

const initialChat = useEditorAiChat.getState(), initialAi = useEditorAi.getState(), initialEditor = useEditorStore.getState();
const root = "C:/synthetic-panel", account = { connected: true, email: "synthetic@example.invalid", plan: null };
let cleanup: (() => void) | undefined, provider: AiProvider;
const record = (): AiChatRecovery => ({ version: 1, root, account: JSON.stringify(["test", account.email]), open: true,
  draft: "Bozza non inviata\ncon accenti è e 界", contextNotes: "Italiano, conserva gli allarmi", references: ["Sinottico", "Motore acceso"], messages: [
    { id: "u1", role: "user", text: "Migliora il pulsante" },
    { id: "a1", role: "assistant", text: "Mi serve un dettaglio", originalRequest: "Migliora il pulsante", answers: [{ text: "Avvia il motore", deferred: false }, { text: "Valore ancora in bozza", deferred: true }],
      proposal: { version: 1, mode: "edit", summary: "Mi serve un dettaglio", questions: ["Quale testo?", "Quale colore?"], warnings: [], provenance: [], project: null, operations: [{ id: "op1", type: "text", property: null, value: "Non applicare al refresh" }] } },
  ] });
const saveRecord = (value = record()) => sessionStorage.setItem(aiChatRecoveryKey, serializeAiChatRecovery(value));
const install = () => { cleanup = installAiChatRecovery(useEditorAiChat); };
const flush = () => window.dispatchEvent(new Event("pagehide"));
const saved = () => parseAiChatRecovery(sessionStorage.getItem(aiChatRecoveryKey)!);

beforeEach(() => {
  sessionStorage.clear(); vi.useFakeTimers();
  provider = { id: "test", connect: vi.fn(async () => account), models: vi.fn(async () => []), login: vi.fn(), logout: vi.fn(), subscribe: vi.fn(), cancel: vi.fn(), propose: vi.fn() };
  useEditorAi.setState({ ...initialAi, provider, account, mode: "edit", open: true }, true);
  useEditorStore.setState({ ...initialEditor, project: { root } as never }, true);
  useEditorAiChat.setState(initialChat, true);
});
afterEach(() => {
  cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); vi.useRealTimers(); sessionStorage.clear();
  useEditorAiChat.setState(initialChat, true); useEditorAi.setState(initialAi, true); useEditorStore.setState(initialEditor, true);
});
it("conserva bozza, messaggi, note e risposte, mai sorgenti, tag PLC, consensi o operazioni", () => {
  const value = record();
  Object.assign(value, { authorizedFor: "PRIVATE_CONSENT", prepared: "PRIVATE_PROMPT", dataReferences: [{ tag: "PRIVATE_TAG" }] });
  Object.assign(value.messages[1], { snapshot: { document: { source: "PRIVATE_SOURCE" } }, questionAttachments: [{ context: "PRIVATE_CONTEXT" }] });
  const source = serializeAiChatRecovery(value), parsed = parseAiChatRecovery(source);
  expect(source).not.toMatch(/PRIVATE_|Non applicare al refresh/);
  expect(parsed.draft).toBe(value.draft); expect(parsed.messages[1].answers).toEqual(value.messages[1].answers);
  expect(parsed.messages[1].proposal?.operations).toEqual([]); expect(parsed.messages[1].snapshot).toBeUndefined(); expect(parsed.messages[1].recovered).toBe(true);
  expect(pendingAiQuestions(parsed.messages)).toBeUndefined();
});
it("salva dopo la digitazione e svuota il timer prima di un refresh immediato", () => {
  install(); useEditorAiChat.getState().setDraft("Prima"); vi.advanceTimersByTime(150); expect(saved().draft).toBe("Prima");
  useEditorAiChat.getState().setDraft("Ultimo carattere!"); flush(); expect(saved().draft).toBe("Ultimo carattere!");
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
});
it("ripristina anche apertura chat e risposte non inviate, senza inference o consenso", async () => {
  saveRecord(); useEditorAi.setState({ open: false }); install();
  expect(useEditorAiChat.getState()).toMatchObject({ draft: record().draft, contextNotes: record().contextNotes, recovered: true, sending: false, applying: false });
  expect(useEditorAiChat.getState().allowed()).toBe(false); expect(useEditorAi.getState().open).toBe(true);
  expect(useEditorAiChat.getState().messages[1].answers?.[1].text).toBe("Valore ancora in bozza");
  const apply = vi.spyOn(useEditorStore.getState(), "applyAiProposal");
  await useEditorAiChat.getState().apply("a1", ["op1"]); expect(apply).not.toHaveBeenCalled();
  expect(provider.propose).not.toHaveBeenCalled(); expect(provider.login).not.toHaveBeenCalled();
});
it("attende il progetto durante il recupero editor senza cancellare la copia", () => {
  saveRecord(); useEditorStore.setState({ project: undefined }); install(); flush();
  expect(sessionStorage.getItem(aiChatRecoveryKey)).not.toBeNull(); expect(useEditorAiChat.getState().draft).toBe("");
  useEditorStore.setState({ project: { root } as never }); expect(useEditorAiChat.getState().draft).toBe(record().draft);
});
it("verifica localmente l’account dopo reload prima di mostrare testi privati", async () => {
  saveRecord(); useEditorAi.setState({ account: undefined }); install();
  expect(useEditorAiChat.getState().recovering).toBe(true); expect(useEditorAiChat.getState().draft).toBe("");
  await vi.waitFor(() => expect(useEditorAiChat.getState().recovered).toBe(true));
  expect(provider.connect).toHaveBeenCalledTimes(1); expect(provider.login).not.toHaveBeenCalled(); expect(provider.propose).not.toHaveBeenCalled();
});
it("non mostra la cronologia a un altro account o a un altro progetto", () => {
  saveRecord(); useEditorAi.setState({ account: { ...account, email: "other@example.invalid" } }); install();
  expect(useEditorAiChat.getState().messages).toEqual([]); expect(sessionStorage.getItem(aiChatRecoveryKey)).toBeNull();
  cleanup!(); saveRecord(); useEditorStore.setState({ project: { root: "C:/other" } as never }); install();
  expect(useEditorAiChat.getState().draft).toBe(""); expect(sessionStorage.getItem(aiChatRecoveryKey)).toBeNull();
});
it("i comandi dal canvas non sovrascrivono la copia mentre verifica l’account", () => {
  saveRecord(); useEditorAi.setState({ account: undefined, checking: true }); install();
  const chat = useEditorAiChat.getState(); chat.setDraft("Non sostituire la copia"); chat.attachSelection(); chat.addData("Other", "Other");
  expect(useEditorAiChat.getState().draft).toBe(""); expect(useEditorAiChat.getState().attachments).toEqual([]);
  useEditorAi.setState({ account, checking: false }); expect(useEditorAiChat.getState().draft).toBe(record().draft);
});
it("non perde una chat viva per un errore temporaneo nel controllo account", () => {
  install(); useEditorAiChat.getState().setDraft("Testo da tenere");
  useEditorAi.setState({ account: undefined, accountError: "CLI temporaneamente non disponibile" }); flush();
  expect(useEditorAiChat.getState().draft).toBe("Testo da tenere"); expect(saved().draft).toBe("Testo da tenere");
  useEditorAi.setState({ account, accountError: undefined }); expect(useEditorAiChat.getState().draft).toBe("Testo da tenere");
});
it("logout o cambio account cancellano testo e copia di recupero", () => {
  install(); useEditorAiChat.getState().setDraft("Privato"); flush();
  useEditorAi.setState({ account: undefined }); expect(useEditorAiChat.getState().draft).toBe(""); expect(sessionStorage.getItem(aiChatRecoveryKey)).toBeNull();
});
it("il cambio progetto esplicito non trasferisce testi al progetto successivo", () => {
  install(); useEditorAiChat.getState().setDraft("Solo progetto A"); flush();
  useEditorStore.setState({ project: { root: "C:/different" } as never });
  expect(useEditorAiChat.getState().draft).toBe(""); expect(sessionStorage.getItem(aiChatRecoveryKey)).toBeNull();
});
it("StrictMode/HMR non rimpiazzano lo stato vivo con un archivio non applicabile", () => {
  install(); useEditorAiChat.setState({ messages: record().messages, draft: "Bozza viva", authorizedFor: "session" });
  const messages = useEditorAiChat.getState().messages; cleanup!(); install();
  expect(useEditorAiChat.getState().messages).toBe(messages); expect(useEditorAiChat.getState().authorizedFor).toBe("session"); expect(useEditorAiChat.getState().recovered).not.toBe(true);
});
it("una copia corrotta non viene sovrascritta e avvisa prima di ricaricare", () => {
  sessionStorage.setItem(aiChatRecoveryKey, "{broken"); install(); useEditorAiChat.getState().setDraft("Nuovo testo"); flush();
  expect(sessionStorage.getItem(aiChatRecoveryKey)).toBe("{broken"); expect(useEditorAiChat.getState().recoveryError).toContain("Non ricaricare");
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  useEditorAiChat.getState().clear(); expect(useEditorAiChat.getState().recoveryError).toBeUndefined(); expect(sessionStorage.getItem(aiChatRecoveryKey)).toBeNull();
});
it("quota esaurita conserva lo stato vivo e non finge un backup riuscito", () => {
  install(); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
  useEditorAiChat.getState().setDraft("Testo ancora qui"); flush();
  expect(useEditorAiChat.getState().draft).toBe("Testo ancora qui"); expect(useEditorAiChat.getState().recoveryError).toContain("QuotaExceededError");
});
it("il refresh dell’iframe HMI non azzera bozza, allegati o consenso del genitore", () => {
  install(); useEditorAiChat.getState().setDraft("Bozza del genitore"); useEditorAiChat.getState().setAllowed(true);
  const frame = document.createElement("iframe"); document.body.append(frame); frame.dispatchEvent(new Event("load")); frame.remove();
  expect(useEditorAiChat.getState().draft).toBe("Bozza del genitore"); expect(useEditorAiChat.getState().allowed()).toBe(true);
});
it("segna la richiesta interrotta senza ripartire né lasciare la UI occupata", () => {
  install(); useEditorAiChat.setState({ draft: "Domanda interrotta", sending: true, messages: [{ id: "pending", role: "user", text: "Domanda interrotta" }] }); flush();
  expect(saved().messages[0].status).toBe("cancelled");
  cleanup!(); useEditorAiChat.setState(initialChat, true); install();
  expect(useEditorAiChat.getState().sending).toBe(false); expect(useEditorAiChat.getState().draft).toBe("Domanda interrotta"); expect(provider.propose).not.toHaveBeenCalled();
});
it("le risposte di un vecchio listener smontato non sovrascrivono la chat corrente", () => {
  install(); useEditorAiChat.getState().setDraft("Vecchia"); cleanup!(); install();
  useEditorAiChat.getState().setDraft("Corrente"); flush(); vi.advanceTimersByTime(300);
  expect(saved().draft).toBe("Corrente");
});
it.each(["{invalid", '{"version":99}', JSON.stringify({ ...record(), draft: "x".repeat(8001) })])("rifiuta copie non valide senza eseguire dati: %s", source => {
  expect(() => parseAiChatRecovery(source)).toThrow();
});
it("mantiene bozze senza account e non salva richieste preparate o stati occupati", () => {
  useEditorAi.setState({ account: undefined }); install();
  useEditorAiChat.getState().setDraft("Da decidere prima dell’accesso"); flush(); const source = sessionStorage.getItem(aiChatRecoveryKey)!;
  expect(saved().account).toBeNull(); expect(source).not.toMatch(/sending|applying|authorizedFor|prepared/);
});
