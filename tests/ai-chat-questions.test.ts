// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AiProjectChat } from "../src/editor/AiProjectChat";
import { pendingAiQuestions, prepareAiQuestionReply } from "../src/ai/aiChatQuestions";
import { prepareAiChat, type AiChatClarification } from "../src/ai/aiChat";
import { useEditorAi } from "../src/state/editorAi";
import { installAiChatProjectScope, useEditorAiChat } from "../src/state/editorAiChat";
import type { AiProvider } from "../src/ai/aiProvider";
import type { AiProposal } from "../src/ai/aiProposal";
import { parseSource } from "../src/source-parser/parseSource";
import type { PageDefinition } from "../src/core/types";
const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
import { useEditorStore } from "../src/state/editorStore";

const rootPath = "C:/synthetic-panel", file = `${rootPath}/src/Page.tsx`;
const source = 'export default ()=> <main><button onClick={()=>privatePlcCall()}>Prima</button></main>';
const page: PageDefinition = { id: "page", name: "Sinottico", file, route: "/synoptic" };
const initialAi = useEditorAi.getState(), initialChat = useEditorAiChat.getState(), initialEditor = useEditorStore.getState();
let provider: AiProvider, root: Root | undefined, host: HTMLDivElement | undefined, cleanup: (() => void) | undefined;
const plan = (questions: string[] = ["Quale testo preferisci?", "Quale dimensione vuoi?"], operations: AiProposal["operations"] = []): AiProposal => ({ version: 1, mode: "edit", summary: "Mi servono alcuni dettagli", questions, warnings: [], project: null, operations, provenance: ["approved-request"], decisions: [] });
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  provider = { id: "synthetic", connect: vi.fn(), models: vi.fn(), login: vi.fn(), logout: vi.fn(), cancel: vi.fn(), subscribe: vi.fn(), propose: vi.fn(async request => ({ requestId: request.requestId, text: JSON.stringify(plan()) })) };
  useEditorAi.setState({ ...initialAi, mode: "edit", provider, account: { connected: true, email: "test@example.invalid", plan: null }, model: "synthetic-model" }, true);
  useEditorStore.setState({ ...initialEditor, project: { root: rootPath, name: "Prova" } as never, document: parseSource(file, source), pages: [page], activePageId: page.id, selectedId: undefined, loading: false, interactionMode: "edit", dirty: false, history: [], future: [], panelManifest: undefined, unlockedPages: [], reloadRecovery: undefined }, true);
  useEditorAiChat.setState({ ...initialChat, projectAccess: false }, true); useEditorAiChat.getState().syncRoot(rootPath); useEditorAiChat.getState().setAllowed(true);
  bridge.readFile.mockResolvedValue(source); bridge.writeFile.mockResolvedValue(undefined);
});
afterEach(async () => { cleanup?.(); cleanup = undefined; await act(async () => root?.unmount()); root = undefined; host?.remove(); host = undefined; vi.restoreAllMocks(); useEditorAi.setState(initialAi, true); useEditorAiChat.setState(initialChat, true); useEditorStore.setState(initialEditor, true); });
async function questions() {
  const chat = useEditorAiChat.getState(); await chat.attachPage(page); chat.setDraft("Rendi più leggibile il sinottico senza cambiare le azioni"); await chat.send();
  return useEditorAiChat.getState().messages.at(-1)!;
}
function answerAll(id: string) { const chat = useEditorAiChat.getState(); chat.setAnswer(id, 0, { text: "Avvia" }); chat.setAnswer(id, 1, { deferred: true }); }
function preview(id: string) { const chat = useEditorAiChat.getState(); return prepareAiQuestionReply(id, chat.attachments, chat.messages, chat.contextNotes); }
async function mount() { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(createElement(StrictMode, null, createElement(AiProjectChat)))); }
function form() { return document.querySelector<HTMLFormElement>('[aria-label="Chiarimenti richiesti dall’AI"]')!; }
async function input(node: HTMLTextAreaElement, text: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(node, text); node.dispatchEvent(new Event("input", { bubbles: true })); }); }

it("rende esplicite le risposte senza cambiare obiettivo, allegati o bozza corrente", async () => {
  const target = await questions(), chat = useEditorAiChat.getState(); chat.setDraft("Bozza separata"); answerAll(target.id);
  const expected = preview(target.id); await chat.send(target.id);
  const sent = vi.mocked(provider.propose).mock.calls[1][0].prompt, payload = JSON.parse(sent);
  expect(sent).toBe(expected.prepared.prompt); expect(sent).toBe(useEditorAiChat.getState().prepared?.prompt);
  expect(payload.clarification).toEqual({ request: target.originalRequest, answers: [{ question: "Quale testo preferisci?", status: "answered", answer: "Avvia" }, { question: "Quale dimensione vuoi?", status: "deferred" }] });
  expect(payload.approvedContext.pages[0].context.rows).toEqual((JSON.parse(vi.mocked(provider.propose).mock.calls[0][0].prompt)).approvedContext.pages[0].context.rows);
  expect(chat.allowed()).toBe(true); expect(useEditorAiChat.getState().draft).toBe("Bozza separata"); expect(bridge.writeFile).not.toHaveBeenCalled();
});
it("non invia campi vuoti e conserva le risposte parziali", async () => {
  const target = await questions(), chat = useEditorAiChat.getState(); chat.setAnswer(target.id, 0, { text: "Avvia" }); await chat.send(target.id);
  expect(provider.propose).toHaveBeenCalledTimes(1); expect(useEditorAiChat.getState().messages).toHaveLength(2); expect(useEditorAiChat.getState().error).toContain("domanda 2"); expect(useEditorAiChat.getState().messages[1].answers?.[0].text).toBe("Avvia");
});
it("un rinvio non invia la risposta locale disattivata e si può annullare senza perderla", async () => {
  const target = await questions(), chat = useEditorAiChat.getState(); answerAll(target.id); chat.setAnswer(target.id, 1, { text: "RISPOSTA_DISATTIVATA" });
  expect(preview(target.id).prepared.prompt).not.toContain("RISPOSTA_DISATTIVATA"); expect(preview(target.id).prepared.prompt).toContain("non inventare tag, soglie, permessi");
  chat.setAnswer(target.id, 1, { deferred: false }); expect(preview(target.id).prepared.payload.clarification).toMatchObject({ answers: [expect.anything(), { answer: "RISPOSTA_DISATTIVATA", status: "answered" }] });
});
it("non trasferisce chiarimenti su allegati cambiati", async () => {
  const target = await questions(), chat = useEditorAiChat.getState(); answerAll(target.id); chat.removeAttachment(useEditorAiChat.getState().attachments[0].id); await chat.send(target.id);
  expect(provider.propose).toHaveBeenCalledTimes(1); expect(useEditorAiChat.getState().error).toContain("allegati sono cambiati"); expect(useEditorAiChat.getState().messages[1].answers).toHaveLength(2);
});
it("mantiene le risposte esplicite nei giri successivi e sostituisce solo la stessa domanda", async () => {
  const first = await questions(); answerAll(first.id);
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(plan(["Quale testo preferisci?", "Quale colore vuoi?"])) }));
  await useEditorAiChat.getState().send(first.id); const next = useEditorAiChat.getState().messages.at(-1)!;
  useEditorAiChat.getState().setAnswer(next.id, 0, { text: "Avvio linea" }); useEditorAiChat.getState().setAnswer(next.id, 1, { text: "Blu" });
  const clarification = preview(next.id).clarification;
  expect(clarification.request).toBe(first.originalRequest); expect(clarification.answers).toEqual([{ question: "Quale testo preferisci?", status: "answered", answer: "Avvio linea" }, { question: "Quale dimensione vuoi?", status: "deferred" }, { question: "Quale colore vuoi?", status: "answered", answer: "Blu" }]);
  await useEditorAiChat.getState().send(first.id); expect(provider.propose).toHaveBeenCalledTimes(2); expect(useEditorAiChat.getState().error).toContain("richiesta precedente");
});
it("blocca risposte troppo grandi prima dell’inferenza senza perdere i campi", async () => {
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(plan(Array.from({ length: 12 }, (_, index) => `Dettaglio ${index + 1}?`))) }));
  const target = await questions(), chat = useEditorAiChat.getState(); for (let index = 0; index < 12; index++) chat.setAnswer(target.id, index, { text: "界".repeat(1000) });
  await chat.send(target.id); expect(provider.propose).toHaveBeenCalledTimes(1); expect(useEditorAiChat.getState().error).toContain("troppo grande"); expect(useEditorAiChat.getState().messages[1].answers?.[11].text).toHaveLength(1000);
});
it.each(["consent", "account", "project"])("blocca il proseguimento senza %s", async kind => {
  const target = await questions(), chat = useEditorAiChat.getState(); answerAll(target.id);
  if (kind === "consent") chat.setAllowed(false);
  if (kind === "account") useEditorAi.setState({ account: undefined });
  if (kind === "project") useEditorStore.setState({ project: undefined });
  await chat.send(target.id); expect(provider.propose).toHaveBeenCalledTimes(1); expect(bridge.writeFile).not.toHaveBeenCalled();
});
it("annullare conserva i campi, ignora risposte tardive e permette di riprovare", async () => {
  const target = await questions(), chat = useEditorAiChat.getState(); answerAll(target.id); chat.setDraft("Bozza separata");
  let finish!: (value: { requestId: string; text: string }) => void; vi.mocked(provider.propose).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = chat.send(target.id), requestId = useEditorAi.getState().requestId!; await chat.cancel(); finish({ requestId, text: JSON.stringify(plan([])) }); await pending;
  expect(pendingAiQuestions(useEditorAiChat.getState().messages)?.id).toBe(target.id); expect(preview(target.id).clarification.answers).toHaveLength(2); expect(useEditorAiChat.getState().draft).toBe("Bozza separata");
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(plan([])) })); await chat.send(target.id);
  expect(useEditorAiChat.getState().error).toBeUndefined(); expect(useEditorAiChat.getState().messages.at(-1)?.proposal?.questions).toEqual([]);
});
it("un errore tardivo dopo l’annullamento non inquina lo stato AI della sessione", async () => {
  const target = await questions(), chat = useEditorAiChat.getState(); answerAll(target.id);
  let reject!: (error: Error) => void; vi.mocked(provider.propose).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  const pending = chat.send(target.id); await chat.cancel(); reject(new Error("ERRORE_VECCHIO")); await pending;
  expect(useEditorAi.getState().error).not.toBe("ERRORE_VECCHIO"); expect(useEditorAiChat.getState().messages).toHaveLength(3);
});
it("non scrive nulla con i chiarimenti: la nuova proposta si applica solo dopo approvazione", async () => {
  const target = await questions(); answerAll(target.id);
  vi.mocked(provider.propose).mockImplementation(async request => { const rows = JSON.parse(request.prompt).approvedContext.pages[0].context.rows as unknown[][], target = rows.find(row => row[3] === "Prima")![0] as string; return { requestId: request.requestId, text: JSON.stringify(plan([], [{ id: "text", type: "text", property: null, value: "Avvia", target }])) }; });
  await useEditorAiChat.getState().send(target.id); expect(bridge.writeFile).not.toHaveBeenCalled();
  const latest = useEditorAiChat.getState().messages.at(-1)!; await useEditorAiChat.getState().apply(latest.id, ["text"]);
  expect(bridge.writeFile).toHaveBeenCalledTimes(1); expect(useEditorStore.getState().history).toEqual([{ file, source }]); expect(useEditorStore.getState().document!.source).toContain("privatePlcCall()");
});
it("mostra campi accessibili, rinvio, anteprima tecnica e un unico invio senza nuova spunta", async () => {
  await questions(); await mount(); const submit = form().querySelector<HTMLButtonElement>('button[type="submit"]')!; expect(submit.disabled).toBe(true);
  const [first, second] = [...form().querySelectorAll("textarea")]; expect(first.id).toBe(form().querySelector("label")?.htmlFor);
  await input(first, "Avvia");
  await act(async () => form().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click()); expect(second.disabled).toBe(true); expect(submit.disabled).toBe(false);
  expect(form().querySelector("pre")?.textContent).toContain('"status": "deferred"'); await input(document.querySelector<HTMLTextAreaElement>(".ai-chat-composer label textarea")!, "Bozza separata");
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(plan([])) }));
  await act(async () => submit.click()); expect(provider.propose).toHaveBeenCalledTimes(2); expect(document.querySelector<HTMLInputElement>(".ai-consent input")?.checked).toBe(true); expect(useEditorAiChat.getState().draft).toBe("Bozza separata"); expect(form()).toBeNull();
});
it("compatta il compositore durante i chiarimenti e ripristina la bozza solo su richiesta", async () => {
  await questions(); useEditorAiChat.getState().setDraft("Bozza separata"); await mount();
  const fields = document.querySelector<HTMLDivElement>(".ai-chat-compose-fields")!, toggle = document.querySelector<HTMLButtonElement>(".ai-chat-compose-mode button")!;
  expect(fields.hidden).toBe(true); expect(toggle.textContent).toBe("Scrivi una nuova richiesta");
  await act(async () => document.querySelector(".ai-chat-composer")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); expect(provider.propose).toHaveBeenCalledTimes(1);
  await act(async () => toggle.click()); expect(fields.hidden).toBe(false); expect(document.querySelector<HTMLTextAreaElement>(".ai-chat-composer label textarea")?.value).toBe("Bozza separata");
  await act(async () => toggle.click()); expect(fields.hidden).toBe(true); expect(useEditorAiChat.getState().draft).toBe("Bozza separata");
});
it("non riposiziona lo scorrimento mentre si compila un chiarimento", async () => {
  await questions(); await mount(); const log = document.querySelector<HTMLElement>(".ai-chat-log")!; log.scrollTop = 123;
  await input(form().querySelector("textarea")!, "Una risposta"); expect(log.scrollTop).toBe(123);
});
it("conserva i campi alla chiusura e li elimina con Nuova chat, mantenendo il consenso", async () => {
  const target = await questions(); answerAll(target.id); await mount(); await act(async () => useEditorAi.getState().close()); await act(async () => root!.unmount()); root = undefined;
  await mount(); expect(form().querySelector("textarea")?.value).toBe("Avvia");
  await act(async () => useEditorAiChat.getState().clear()); expect(useEditorAiChat.getState().messages).toEqual([]); expect(useEditorAiChat.getState().allowed()).toBe(true);
});
it.each(["account", "project"])("elimina risposte e obiettivo al cambio %s", async kind => {
  const target = await questions(); answerAll(target.id); cleanup = installAiChatProjectScope();
  if (kind === "account") useEditorAi.setState({ account: undefined }); else useEditorStore.setState({ project: { root: "C:/other" } as never });
  expect(useEditorAiChat.getState().messages).toEqual([]); expect(useEditorAiChat.getState().allowed()).toBe(false);
});
it.each(["missing-request", "missing-answer", "too-long"])("rifiuta chiarimenti malformati %s", kind => {
  const clarification: AiChatClarification = { request: "Obiettivo", answers: [{ question: "Domanda?", status: "answered", answer: "Risposta" }] };
  if (kind === "missing-request") clarification.request = "";
  if (kind === "missing-answer") (clarification.answers[0] as { answer: string }).answer = "";
  if (kind === "too-long") (clarification.answers[0] as { answer: string }).answer = "X".repeat(1001);
  expect(() => prepareAiChat("Continua", undefined, { attachments: [], history: [], clarification })).toThrow("risposte ai chiarimenti");
});
