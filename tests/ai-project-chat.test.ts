// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AiProjectCodeReview } from "../src/editor/AiProjectCodeReview";
import { AiProjectChat } from "../src/editor/AiProjectChat";
import { pendingAiQuestions, prepareAiProjectQuestionReply, prepareAiQuestionReply } from "../src/ai/aiChatQuestions";
import { aiProjectSchema, prepareAiProjectChanges, type AiProjectPlan, type AiProjectReview } from "../src/ai/aiProjectEdits";
import { aiChatRecoveryKey, parseAiChatRecovery, serializeAiChatRecovery } from "../src/ai/aiChatRecovery";
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { useEditorAiChat, installAiChatProjectScope } from "../src/state/editorAiChat";
import { useEditorAi } from "../src/state/editorAi";
import { useEditorStore } from "../src/state/editorStore";
import { parseSource } from "../src/source-parser/parseSource";
import { applyAiProjectFiles } from "../src/state/editorAiProject";
import { editorCommandEnabled } from "../src/core/editorCommands";
import type { AiProvider } from "../src/ai/aiProvider";

const initialChat = useEditorAiChat.getState(), initialAi = useEditorAi.getState(), initialEditor = useEditorStore.getState();
const projectRoot = "C:/synthetic-project", file = `${projectRoot}/src/App.tsx`;
const source = 'export const App=()=> <button>Prima</button>';
const plan = (change: Partial<AiProjectPlan> = {}): AiProjectPlan => ({ summary: "Collegamenti pronti", questions: [], warnings: [], reads: [], edits: [{ path: "src/App.tsx", before: "Prima", after: "Dopo" }], variables: [{ name: "Panel_Speed", dataType: "REAL", description: "Velocità da collegare" }], ...change });
let files: Map<string, string | null>, provider: AiProvider, cleanup: (() => void) | undefined, reactRoot: Root | undefined, host: HTMLDivElement | undefined;
function review(value = plan()): AiProjectReview {
  const snapshots = new Map(files);
  return { root: projectRoot, changes: prepareAiProjectChanges(value, snapshots, new Map([["src/App.tsx", [source]]]), [...files.keys()]), plan: value, bytes: 1000, rounds: 1, knownFiles: [...files.keys()] };
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); sessionStorage.clear();
  files = new Map([["src/App.tsx", source], ["framecraft.plc.json", null]]);
  provider = { id: "test", connect: vi.fn(), login: vi.fn(), logout: vi.fn(), models: vi.fn(), subscribe: vi.fn(), cancel: vi.fn(), propose: vi.fn(async request => ({ requestId: request.requestId, text: JSON.stringify(plan()) })) };
  useEditorAiChat.setState(initialChat, true);
  useEditorAi.setState({ ...initialAi, provider, model: "synthetic-model", reasoningEffort: "high", models: [{ id: "synthetic-model", name: "Test", default: true, supportedReasoningEfforts: [{ reasoningEffort: "high", description: "Test" }] }], account: { connected: true, email: "synthetic@example.invalid", plan: null }, open: true, mode: "edit", busy: false, checking: false }, true);
  const document = parseSource(file, source);
  useEditorStore.setState({ ...initialEditor, project: { root: projectRoot, name: "Sintetico", files: [], entryFiles: [] } as never, document, selectedId: document.roots[0], interactionMode: "edit", loading: false, dirty: false, aiProjectBusy: false, reloadRecovery: undefined }, true);
  useEditorAiChat.getState().syncRoot(projectRoot); useEditorAiChat.getState().setAllowed(true);
  vi.spyOn(desktopBridge, "listProjectSourceFiles").mockResolvedValue([file]);
  vi.spyOn(desktopBridge, "readAiProjectFile").mockImplementation(async (_root, path) => files.get(path) ?? null);
  vi.spyOn(desktopBridge, "readRecipeConfiguration").mockImplementation(async () => ({ generation: 1, source: files.get("framecraft.recipes.json") ?? null, initialized: false }));
  vi.spyOn(desktopBridge, "applyAiProjectChanges").mockImplementation(async (_root, changes) => { changes.forEach(change => files.set(change.path, change.after)); return "123-456"; });
  vi.spyOn(desktopBridge, "restoreAiProjectChanges").mockImplementation(async () => { files.set("src/App.tsx", source); files.set("framecraft.plc.json", null); });
  vi.spyOn(useEditorStore.getState(), "refreshAiProjectFiles").mockResolvedValue(undefined);
});
afterEach(async () => {
  cleanup?.(); cleanup = undefined; await act(async () => reactRoot?.unmount()); reactRoot = undefined; host?.remove(); host = undefined;
  vi.restoreAllMocks(); sessionStorage.clear(); useEditorAiChat.setState(initialChat, true); useEditorAi.setState(initialAi, true); useEditorStore.setState(initialEditor, true);
});
async function send() { useEditorAiChat.getState().setDraft("Collega gli elementi e crea le variabili mancanti"); await useEditorAiChat.getState().send(); }
const latest = () => useEditorAiChat.getState().messages.at(-1)!;

it("usa per default il progetto reale e lo stesso modello/ragionamento, senza applicare automaticamente", async () => {
  expect(useEditorAiChat.getState().projectAccess).toBe(true); await send();
  expect(useEditorAiChat.getState().error).toBeUndefined(); expect(latest().projectReview?.changes).toHaveLength(2);
  const request = vi.mocked(provider.propose).mock.calls[0][0];
  expect(request).toMatchObject({ model: "synthetic-model", reasoningEffort: "high", schema: aiProjectSchema }); expect(request.prompt).toContain(source);
  expect(request.prompt).toBe(useEditorAiChat.getState().prepared?.prompt);
  expect(desktopBridge.applyAiProjectChanges).not.toHaveBeenCalled(); expect(files.get("src/App.tsx")).toBe(source);
});
it("la chat legge ricette su richiesta, mostra valori leggibili e salva solo la proposta approvata", async () => {
  const path = "framecraft.recipes.json", before = '{"version":1,"schemas":[{"id":"s","name":"Formati","fields":[{"id":"p","name":"Parametro","type":"number"}],"records":[{"id":"r","name":"Formato A","values":{"p":10}}]}]}'; files.set(path, before);
  let round = 0; vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(plan(++round === 1 ? { reads: [{ path, find: "" }], edits: [], variables: [] } : { edits: [{ path, before: '"p":10', after: '"p":20' }], variables: [] })) }));
  useEditorAiChat.getState().setDraft("Cambia da 10 a 20 il parametro iniziale della ricetta"); await useEditorAiChat.getState().send();
  expect(useEditorAiChat.getState().error).toBeUndefined(); expect(desktopBridge.readRecipeConfiguration).toHaveBeenCalledOnce(); expect(desktopBridge.applyAiProjectChanges).not.toHaveBeenCalled();
  const message = latest(), review = message.projectReview!; host = document.createElement("div"); document.body.append(host); reactRoot = createRoot(host);
  await act(async () => reactRoot!.render(createElement(AiProjectCodeReview, { message, latest: true })));
  expect(document.querySelector('[aria-label="Riepilogo ricette iniziali"]')?.textContent).toContain("Parametro: 10 → 20"); expect(document.body.textContent).toContain("non invia valori al PLC");
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
  await act(async () => useEditorAiChat.getState().applyProject(message.id, review)); expect(files.get(path)).toContain('"p":20'); expect(latest().projectReceipt?.files).toContain(path);
  vi.mocked(desktopBridge.readRecipeConfiguration).mockResolvedValue({ generation: 1, source: files.get(path)!, initialized: true });
  await act(async () => useEditorAiChat.getState().restoreProject(latest().id, latest().projectReceipt!)); expect(desktopBridge.restoreAiProjectChanges).not.toHaveBeenCalled(); expect(useEditorAiChat.getState().error).toContain("operativo"); expect(files.get(path)).toContain('"p":20');
});
it("una ricetta diventa non applicabile se l’archivio è inizializzato dopo la proposta", async () => {
  const path = "framecraft.recipes.json", before = '{"version":1,"schemas":[]}'; files.set(path, before);
  const value = plan({ edits: [{ path, before, after: '{"version":1,"schemas":[{"id":"s","name":"Schema","fields":[{"id":"p","name":"Parametro","type":"number"}],"records":[]}]}' }], variables: [] });
  const input = { root: projectRoot, plan: value, changes: prepareAiProjectChanges(value, files, new Map([[path, [before]]]), [path]), bytes: 1000, rounds: 1 };
  vi.mocked(desktopBridge.readRecipeConfiguration).mockResolvedValue({ generation: 1, source: before, initialized: true });
  await expect(applyAiProjectFiles(input, () => true)).rejects.toThrow("operativo"); expect(desktopBridge.applyAiProjectChanges).not.toHaveBeenCalled(); expect(files.get(path)).toBe(before);
});
it.each(["account", "consent", "dirty"])("non legge o invia file senza precondizione: %s", async reason => {
  if (reason === "account") useEditorAi.setState({ account: undefined });
  if (reason === "consent") useEditorAiChat.getState().setAllowed(false);
  if (reason === "dirty") useEditorStore.setState({ dirty: true });
  await send(); expect(desktopBridge.readAiProjectFile).not.toHaveBeenCalled(); expect(provider.propose).not.toHaveBeenCalled(); expect(useEditorAiChat.getState().draft).not.toBe("");
});
it("cambiare ambito revoca il consenso, non la bozza", () => {
  useEditorAiChat.getState().setDraft("Da conservare"); useEditorAiChat.getState().setProjectAccess(false);
  expect(useEditorAiChat.getState().allowed()).toBe(false); expect(useEditorAiChat.getState().draft).toBe("Da conservare");
});
it("il consenso precedente al catalogo ricette non abilita la nuova capacità né cancella la bozza", () => { useEditorAiChat.setState({ authorizedFor: JSON.stringify([projectRoot, provider.id, "synthetic@example.invalid", "project"]), draft: "Da conservare" }); expect(useEditorAiChat.getState().allowed()).toBe(false); useEditorAiChat.getState().setAllowed(true); expect(useEditorAiChat.getState().allowed()).toBe(true); expect(useEditorAiChat.getState().draft).toBe("Da conservare"); });
it("cancella una richiesta lenta senza accettare il risultato tardivo", async () => {
  let finish!: (value: { requestId: string; text: string }) => void;
  vi.mocked(provider.propose).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = send(); await vi.waitFor(() => expect(provider.propose).toHaveBeenCalledTimes(1)); const request = vi.mocked(provider.propose).mock.calls[0][0];
  await useEditorAiChat.getState().cancel(); finish({ requestId: request.requestId, text: JSON.stringify(plan()) }); await pending;
  expect(provider.cancel).toHaveBeenCalledWith(request.requestId); expect(latest().status).toBe("cancelled"); expect(latest().projectReview).toBeUndefined();
  expect(useEditorAiChat.getState().draft).not.toBe(""); expect(useEditorAi.getState().busy).toBe(false);
});
it("rifiuta una risposta con identificatore diverso e conserva la richiesta", async () => {
  vi.mocked(provider.propose).mockResolvedValue({ requestId: "wrong-id", text: JSON.stringify(plan()) }); await send();
  expect(latest().projectReview).toBeUndefined(); expect(useEditorAiChat.getState().error).toContain("superata"); expect(useEditorAiChat.getState().draft).not.toBe("");
});
it("cambiare progetto durante l’inferenza non trasferisce proposta e sorgente", async () => {
  let finish!: (value: { requestId: string; text: string }) => void; cleanup = installAiChatProjectScope();
  vi.mocked(provider.propose).mockImplementation(() => new Promise(resolve => { finish = resolve; })); const pending = send();
  await vi.waitFor(() => expect(provider.propose).toHaveBeenCalledTimes(1)); const request = vi.mocked(provider.propose).mock.calls[0][0];
  useEditorStore.setState({ project: { root: "C:/other" } as never }); finish({ requestId: request.requestId, text: JSON.stringify(plan()) }); await pending;
  expect(useEditorAiChat.getState().messages).toEqual([]); expect(desktopBridge.applyAiProjectChanges).not.toHaveBeenCalled(); expect(useEditorAi.getState().busy).toBe(false);
});
it("applica e ripristina l’insieme solo su richiesta, mantenendo indirizzi nuovi vuoti", async () => {
  await send(); const proposal = latest(); await useEditorAiChat.getState().applyProject(proposal.id, proposal.projectReview!);
  expect(useEditorAiChat.getState().error).toBeUndefined(); expect(latest().projectReceipt).toEqual({ root: projectRoot, backup: "123-456", files: ["src/App.tsx", "framecraft.plc.json"], restored: false });
  expect(files.get("src/App.tsx")).toContain("Dopo"); expect(JSON.parse(files.get("framecraft.plc.json")!).variables[0]).toMatchObject({ name: "Panel_Speed", access: "read", address: "" });
  expect(useEditorStore.getState().history.at(-1)).toEqual({ file, source }); expect(useEditorStore.getState().aiProjectBusy).toBe(false);
  expect(desktopBridge.restoreAiProjectChanges).not.toHaveBeenCalled(); await useEditorAiChat.getState().restoreProject(proposal.id, latest().projectReceipt!);
  expect(latest().projectReceipt?.restored).toBe(true); expect(files.get("src/App.tsx")).toBe(source);
});
it("non scrive se un file o la bozza sono cambiati dopo la proposta", async () => {
  await send(); const proposal = latest(); files.set("src/App.tsx", source.replace("Prima", "Manuale"));
  await useEditorAiChat.getState().applyProject(proposal.id, proposal.projectReview!); expect(useEditorAiChat.getState().error).toContain("cambiato"); expect(desktopBridge.applyAiProjectChanges).not.toHaveBeenCalled();
  files.set("src/App.tsx", source); useEditorStore.setState({ dirty: true }); await useEditorAiChat.getState().applyProject(proposal.id, proposal.projectReview!);
  expect(useEditorAiChat.getState().error).toContain("bozza"); expect(desktopBridge.applyAiProjectChanges).not.toHaveBeenCalled(); expect(useEditorStore.getState().aiProjectBusy).toBe(false);
});
it("rifiuta una vecchia revisione anche se il chiamante usa lo stesso id", async () => {
  await send(); const first = latest(); useEditorAiChat.getState().stageProjectReview(review());
  await useEditorAiChat.getState().applyProject(first.id, first.projectReview!); expect(desktopBridge.applyAiProjectChanges).not.toHaveBeenCalled();
  await useEditorAiChat.getState().applyProject(latest().id, { ...latest().projectReview! }); expect(desktopBridge.applyAiProjectChanges).not.toHaveBeenCalled();
});
it("controlla che le nuove dipendenze esistano ancora prima di scrivere", async () => {
  const value = plan({ variables: [], edits: [{ path: "src/App.tsx", before: source, after: 'import { Extra } from "./Extra";export const App=()=> <Extra/>' }] });
  files.set("src/Extra.tsx", "export const Extra=()=>null"); const proposal = review(value); files.delete("src/Extra.tsx");
  await expect(applyAiProjectFiles(proposal, () => true)).rejects.toThrow("non esiste più"); expect(desktopBridge.applyAiProjectChanges).not.toHaveBeenCalled();
});
it("spiega la necessità della build desktop aggiornata e rilascia l’interfaccia dopo un errore", async () => {
  await send(); vi.mocked(desktopBridge.applyAiProjectChanges).mockRejectedValue(new Error("unknown command apply_ai_project_changes"));
  await useEditorAiChat.getState().applyProject(latest().id, latest().projectReview!);
  expect(useEditorAiChat.getState().error).toContain("build aggiornata"); expect(useEditorAiChat.getState().applying).toBe(false); expect(useEditorStore.getState().aiProjectBusy).toBe(false);
});
it("blocca comandi e refresh durante la scrittura e conserva la ricevuta dopo un reload", async () => {
  cleanup = installAiChatProjectScope(); await send(); let complete!: (backup: string) => void;
  vi.mocked(desktopBridge.applyAiProjectChanges).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const pending = useEditorAiChat.getState().applyProject(latest().id, latest().projectReview!); await vi.waitFor(() => expect(desktopBridge.applyAiProjectChanges).toHaveBeenCalledTimes(1));
  expect(useEditorStore.getState().aiProjectBusy).toBe(true); expect(editorCommandEnabled("save", useEditorStore.getState())).toBe(false);
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  complete("123-456"); await pending; window.dispatchEvent(new Event("pagehide"));
  const saved = sessionStorage.getItem(aiChatRecoveryKey)!; expect(saved).not.toContain(source); expect(saved).not.toMatch(/projectReview|knownFiles|"changes"/);
  cleanup(); useEditorAiChat.setState(initialChat, true); cleanup = installAiChatProjectScope();
  expect(latest().projectReceipt?.backup).toBe("123-456"); expect(latest().projectReview).toBeUndefined(); expect(useEditorAiChat.getState().allowed()).toBe(false);
  expect(desktopBridge.restoreAiProjectChanges).not.toHaveBeenCalled(); await useEditorAiChat.getState().restoreProject(latest().id, latest().projectReceipt!); expect(latest().projectReceipt?.restored).toBe(true);
});
it("richiede due conferme UI separate per applicazione e ripristino, senza eseguire il codice mostrato", async () => {
  useEditorAiChat.getState().stageProjectReview(review()); host = document.createElement("div"); document.body.append(host); reactRoot = createRoot(host);
  function Fixture() { const item = useEditorAiChat(state => state.messages.at(-1)!); return createElement(AiProjectCodeReview, { message: item, latest: true }); }
  await act(async () => reactRoot!.render(createElement(Fixture)));
  let button = host.querySelector("button")!; expect(button.disabled).toBe(true); expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  await act(async () => host!.querySelector<HTMLInputElement>("input")!.click()); await act(async () => button.click());
  expect(desktopBridge.applyAiProjectChanges).toHaveBeenCalledTimes(1); button = host.querySelector("button")!; expect(button.textContent).toContain("Ripristina"); expect(button.disabled).toBe(true);
  await act(async () => host!.querySelector<HTMLInputElement>("input")!.click()); await act(async () => button.click()); expect(desktopBridge.restoreAiProjectChanges).toHaveBeenCalledTimes(1);
});
it("la copia chat conserva solo la ricevuta whitelisted e rifiuta un backup di altro progetto", () => {
  const receipt = { root: projectRoot, backup: "123-456", files: ["src/App.tsx"], restored: false };
  const value = { version: 1 as const, root: projectRoot, account: null, open: true, draft: "", contextNotes: "", references: [], messages: [{ id: "a", role: "assistant" as const, text: "Approvato", projectReceipt: receipt, projectReview: review() }] };
  const saved = serializeAiChatRecovery(value); expect(saved).not.toContain(source); expect(parseAiChatRecovery(saved).messages[0].projectReceipt).toEqual(receipt);
  expect(() => parseAiChatRecovery(JSON.stringify({ ...value, root: "C:/other" }))).toThrow("altro progetto");
});
it.each([false, true])("il refresh effettivo aggiorna il documento senza perdere la bozza: dirty=%s", async dirty => {
  vi.mocked(useEditorStore.getState().refreshAiProjectFiles).mockRestore(); vi.spyOn(useEditorStore.getState(), "refreshPlcVariables").mockResolvedValue(undefined);
  files.set("src/App.tsx", source.replace("Prima", "Dopo")); useEditorStore.setState({ dirty });
  await useEditorStore.getState().refreshAiProjectFiles(projectRoot, ["src/App.tsx"]);
  expect(useEditorStore.getState().document?.source).toContain(dirty ? "Prima" : "Dopo"); expect(useEditorStore.getState().dirty).toBe(dirty);
  expect(useEditorStore.getState().refreshPlcVariables).toHaveBeenCalledTimes(1);
});

async function askProject(questions = ["Quale nome deve avere la variabile?", "Quale unità vuoi mostrare?"]) {
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(plan({ questions, edits: [], variables: [] })) }));
  await send(); return latest();
}
function answerProject(id: string) {
  const chat = useEditorAiChat.getState(); chat.setAnswer(id, 0, { text: "Panel_Speed" }); chat.setAnswer(id, 1, { deferred: true });
}
async function mountChat() {
  host = document.createElement("div"); document.body.append(host); reactRoot = createRoot(host);
  await act(async () => reactRoot!.render(createElement(AiProjectChat)));
}
it("riprende i chiarimenti di progetto con dati strutturati, obiettivo iniziale e bozza separata", async () => {
  const target = await askProject(), chat = useEditorAiChat.getState(); answerProject(target.id); chat.setAnswer(target.id, 1, { text: "LOCAL_DEFERRED_TEXT" }); chat.setDraft("Una richiesta ancora da inviare");
  const original = target.originalRequest; vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(plan()) }));
  await chat.send(target.id); const payload = JSON.parse(vi.mocked(provider.propose).mock.calls[1][0].prompt);
  expect(payload.request).toBe(original); expect(payload.clarification).toEqual([{ question: "Quale nome deve avere la variabile?", status: "answered", answer: "Panel_Speed" }, { question: "Quale unità vuoi mostrare?", status: "deferred" }]);
  expect(JSON.stringify(payload)).not.toContain("LOCAL_DEFERRED_TEXT"); expect(payload.rules).toContain("non inventare dati macchina");
  expect(latest().originalRequest).toBe(original); expect(useEditorAiChat.getState().draft).toBe("Una richiesta ancora da inviare");
  expect(useEditorAiChat.getState().messages[2].replyTo).toBe(target.id); expect(desktopBridge.applyAiProjectChanges).not.toHaveBeenCalled();
});
it("i chiarimenti restano ancorati alla pagina iniziale quando si naviga su un’altra pagina", async () => {
  const target = await askProject(); answerProject(target.id);
  const other = `${projectRoot}/src/Other.tsx`; files.set("src/Other.tsx", "export const Other=()=> <div>Altra pagina</div>");
  const document = parseSource(other, files.get("src/Other.tsx")!); useEditorStore.setState({ document, selectedId: document.roots[0] });
  vi.mocked(desktopBridge.readAiProjectFile).mockClear(); await useEditorAiChat.getState().send(target.id);
  const payload = JSON.parse(vi.mocked(provider.propose).mock.calls[1][0].prompt);
  expect(payload.selected[0].path).toBe("src/App.tsx"); expect(payload.files.some((file: { path: string }) => file.path === "src/Other.tsx")).toBe(false);
  expect(desktopBridge.readAiProjectFile).not.toHaveBeenCalledWith(projectRoot, "src/Other.tsx");
});
it("accumula le risposte esplicite fra più giri senza duplicare la richiesta originale", async () => {
  const first = await askProject(), chat = useEditorAiChat.getState(); answerProject(first.id);
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(plan({ questions: ["Quale nome deve avere la variabile?", "Quale colore vuoi?"], edits: [], variables: [] })) }));
  await chat.send(first.id); const second = latest(); chat.setAnswer(second.id, 0, { text: "Line_Speed" }); chat.setAnswer(second.id, 1, { text: "Blu" }); await chat.send(second.id);
  const payload = JSON.parse(vi.mocked(provider.propose).mock.calls[2][0].prompt);
  expect(payload.request).toBe(first.originalRequest); expect(payload.clarification).toEqual([{ question: "Quale nome deve avere la variabile?", status: "answered", answer: "Line_Speed" }, { question: "Quale unità vuoi mostrare?", status: "deferred" }, { question: "Quale colore vuoi?", status: "answered", answer: "Blu" }]);
  expect(latest().originalRequest).not.toContain("Risposte ai chiarimenti");
});
it("non invia risposte incomplete o appartenenti ad allegati cambiati", async () => {
  const target = await askProject(), chat = useEditorAiChat.getState(); chat.setAnswer(target.id, 0, { text: "Panel_Speed" }); await chat.send(target.id);
  expect(provider.propose).toHaveBeenCalledTimes(1); expect(chat.messages).toHaveLength(2); expect(useEditorAiChat.getState().error).toContain("domanda 2");
  chat.setAnswer(target.id, 1, { deferred: true }); chat.attachSelection(); await chat.send(target.id);
  expect(provider.propose).toHaveBeenCalledTimes(1); expect(useEditorAiChat.getState().error).toContain("allegati sono cambiati"); expect(latest().answers?.[0].text).toBe("Panel_Speed");
});
it("cambiare ambito rende i vecchi chiarimenti di sola consultazione", async () => {
  const target = await askProject(); answerProject(target.id); const chat = useEditorAiChat.getState(); chat.setProjectAccess(false); chat.setAllowed(true);
  expect(pendingAiQuestions(useEditorAiChat.getState().messages, false)).toBeUndefined();
  await chat.send(target.id); expect(provider.propose).toHaveBeenCalledTimes(1); expect(useEditorAiChat.getState().error).toContain("precedente");
  expect(() => prepareAiQuestionReply(target.id, chat.attachments, useEditorAiChat.getState().messages, "")).toThrow("precedente");
  chat.setAnswer(target.id, 0, { text: "Non trasferire" }); expect(latest().answers?.[0].text).toBe("Panel_Speed");
});
it.each(["account", "consent", "dirty"])("le risposte progetto non aggirano il controllo: %s", async reason => {
  const target = await askProject(); answerProject(target.id); vi.mocked(desktopBridge.readAiProjectFile).mockClear();
  if (reason === "account") useEditorAi.setState({ account: undefined });
  if (reason === "consent") useEditorAiChat.getState().setAllowed(false);
  if (reason === "dirty") useEditorStore.setState({ dirty: true });
  await useEditorAiChat.getState().send(target.id); expect(provider.propose).toHaveBeenCalledTimes(1); expect(desktopBridge.readAiProjectFile).not.toHaveBeenCalled();
  expect(latest().answers?.[0].text).toBe("Panel_Speed");
});
it("risposte oltre 8.000 caratteri usano il budget progetto, non il limite del messaggio", async () => {
  const target = await askProject(Array.from({ length: 10 }, (_, index) => `Dettaglio ${index + 1}?`)), chat = useEditorAiChat.getState();
  for (let index = 0; index < 10; index++) chat.setAnswer(target.id, index, { text: "x".repeat(1000) });
  await chat.send(target.id); expect(useEditorAiChat.getState().error).toBeUndefined(); expect(provider.propose).toHaveBeenCalledTimes(2);
  expect(JSON.parse(vi.mocked(provider.propose).mock.calls[1][0].prompt).clarification).toHaveLength(10);
});
it("un contesto troppo grande conserva risposte e bozza senza effettuare altre richieste", async () => {
  const target = await askProject(Array.from({ length: 24 }, (_, index) => `Dettaglio ${index + 1}?`)), chat = useEditorAiChat.getState();
  for (let index = 0; index < 24; index++) chat.setAnswer(target.id, index, { text: "界".repeat(1000) });
  chat.setContextNotes("界".repeat(2000)); chat.setDraft("Bozza separata"); await chat.send(target.id);
  expect(provider.propose).toHaveBeenCalledTimes(1); expect(useEditorAiChat.getState().error).toContain("limite locale");
  expect(useEditorAiChat.getState().messages[1].answers?.[23].text).toHaveLength(1000); expect(useEditorAiChat.getState().draft).toBe("Bozza separata");
});
it("annullare un seguito conserva risposte e obiettivo e ignora la risposta tardiva", async () => {
  const target = await askProject(); answerProject(target.id); const chat = useEditorAiChat.getState(); chat.setDraft("Non inviare questa bozza");
  let finish!: (value: { requestId: string; text: string }) => void;
  vi.mocked(provider.propose).mockImplementation(() => new Promise(resolve => { finish = resolve; })); const pending = chat.send(target.id);
  await vi.waitFor(() => expect(provider.propose).toHaveBeenCalledTimes(2)); const request = vi.mocked(provider.propose).mock.calls[1][0];
  await chat.cancel(); finish({ requestId: request.requestId, text: JSON.stringify(plan()) }); await pending;
  const fresh = useEditorAiChat.getState(); expect(pendingAiQuestions(fresh.messages)?.id).toBe(target.id); expect(fresh.messages.at(-1)?.status).toBe("cancelled");
  expect(fresh.draft).toBe("Non inviare questa bozza"); expect(prepareAiProjectQuestionReply(target.id, fresh.attachments, fresh.messages).clarification.request).toBe(target.originalRequest);
});
it("mostra domande progetto accessibili e non applica modifiche quando si inviano le risposte", async () => {
  await askProject(); await mountChat(); const form = host!.querySelector<HTMLFormElement>('[aria-label="Chiarimenti richiesti dall’AI"]')!;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!, [first, second] = [...form.querySelectorAll("textarea")];
  expect(button.disabled).toBe(true); expect(form.querySelector("label")?.htmlFor).toBe(first.id);
  expect(host!.querySelector(".ai-chat-message.assistant > .ai-chat-text")?.textContent).not.toContain("Quale nome deve avere la variabile?");
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(first, "Panel_Speed"); first.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click()); expect(second.disabled).toBe(true); expect(button.disabled).toBe(false);
  expect(form.querySelector("pre")?.textContent).toContain('"status": "deferred"'); expect(form.textContent).toContain("sorgenti preparati all’invio");
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(plan()) }));
  await act(async () => button.click()); expect(provider.propose).toHaveBeenCalledTimes(2); expect(desktopBridge.applyAiProjectChanges).not.toHaveBeenCalled();
  expect(host!.querySelector('[aria-label="Revisione modifiche progetto"]')).not.toBeNull();
});
it("il refresh conserva domande e risposte progetto come testi, non sorgenti o invii riattivabili", async () => {
  cleanup = installAiChatProjectScope(); const target = await askProject(); answerProject(target.id); useEditorAiChat.getState().setAnswer(target.id, 1, { text: "Testo locale rinviato" });
  window.dispatchEvent(new Event("pagehide")); const saved = sessionStorage.getItem(aiChatRecoveryKey)!;
  expect(saved).not.toMatch(/questionSelections|projectReview|"changes"|export const App/); expect(parseAiChatRecovery(saved).messages[1].projectQuestions).toHaveLength(2);
  cleanup(); useEditorAiChat.setState(initialChat, true); cleanup = installAiChatProjectScope();
  const fresh = useEditorAiChat.getState(); expect(fresh.messages[1].answers?.[1].text).toBe("Testo locale rinviato"); expect(pendingAiQuestions(fresh.messages)).toBeUndefined();
  await mountChat(); expect(host!.querySelector('[aria-label="Chiarimenti richiesti dall’AI"]')).toBeNull(); expect(host!.querySelector(".ai-chat-questions-previous")?.textContent).toContain("Testo locale rinviato");
  expect(provider.propose).toHaveBeenCalledTimes(1); expect(() => prepareAiProjectQuestionReply(target.id, fresh.attachments, fresh.messages)).toThrow("precedente");
});
it("rifiuta liste di domande recuperate corrotte o troppo grandi", () => {
  const record = { version: 1, root: projectRoot, account: null, open: true, draft: "", contextNotes: "", references: [], messages: [{ id: "a", role: "assistant", text: "Domande", projectQuestions: [42] }] };
  expect(() => parseAiChatRecovery(JSON.stringify(record))).toThrow();
  record.messages[0].projectQuestions = Array(25).fill("Domanda?") as never; expect(() => parseAiChatRecovery(JSON.stringify(record))).toThrow();
});
it("il refresh di una proposta non sposta la pagina aperta quando cambia un altro file", async () => {
  vi.mocked(useEditorStore.getState().refreshAiProjectFiles).mockRestore(); vi.spyOn(useEditorStore.getState(), "refreshPlcVariables").mockResolvedValue(undefined);
  const document = parseSource(`${projectRoot}/src/Other.tsx`, "export const Other=()=> <div>Altra pagina</div>"); useEditorStore.setState({ document, selectedId: document.roots[0] });
  files.set("src/App.tsx", source.replace("Prima", "Dopo")); await useEditorStore.getState().refreshAiProjectFiles(projectRoot, ["src/App.tsx"]);
  expect(useEditorStore.getState().document).toBe(document); expect(useEditorStore.getState().selectedId).toBe(document.roots[0]);
});
