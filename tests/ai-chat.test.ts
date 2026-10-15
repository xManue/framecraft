// @vitest-environment jsdom
import { act, createElement, StrictMode, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AiProjectChat } from "../src/editor/AiProjectChat";
import { AiContextMenu } from "../src/editor/AiContextMenu";
import { aiChatContext, aiChatPrompt, aiElementAttachment, aiPageAttachment } from "../src/ai/aiChat";
import { useEditorAi } from "../src/state/editorAi";
import { installAiChatProjectScope, useEditorAiChat } from "../src/state/editorAiChat";
import { useEditorStore } from "../src/state/editorStore";
import { parseSource } from "../src/source-parser/parseSource";
import type { AiProposal } from "../src/ai/aiProposal";
import type { AiProvider } from "../src/ai/aiProvider";
import type { PageDefinition } from "../src/core/types";
import { installEditorKeyboardShortcuts } from "../src/core/editorCommands";

const initialAi = useEditorAi.getState(), initialChat = useEditorAiChat.getState(), initialEditor = useEditorStore.getState();
let provider: AiProvider, cleanup: (() => void) | undefined, root: Root | undefined, host: HTMLDivElement | undefined;
const plan = (operations: AiProposal["operations"] = []): AiProposal => ({ version: 1, mode: "edit", summary: "Risposta di test", questions: [], warnings: [], provenance: ["approved-request"], project: null, operations, decisions: [] });
const page: PageDefinition = { id: "overview", name: "Sinottico", file: "C:/private-machine/src/Overview.tsx", route: "/overview" };
function seed() {
  const document = parseSource("C:/private-machine/src/Overview.tsx", 'const PRIVATE_TAG="secret";export const Page=()=> <main><button onClick={()=>privatePlcWrite(PRIVATE_TAG)} style={{color:"#000000"}}>Prima</button><button>Altro</button></main>');
  const selectedId = Object.values(document.nodes).find(node => node.text === "Prima")!.id;
  useEditorStore.setState({ ...initialEditor, project: { root: "C:/private-machine", name: "Progetto" } as never, document, selectedId, pages: [page], activePageId: page.id, interactionMode: "edit", editScope: "instance", selectionInfo: undefined, loading: false });
  useEditorAiChat.getState().syncRoot("C:/private-machine");
  return { root: "C:/private-machine", document, selectedId };
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  provider = { id: "test", connect: vi.fn(), models: vi.fn(), login: vi.fn(), logout: vi.fn(), subscribe: vi.fn(), cancel: vi.fn(), propose: vi.fn(async request => ({ requestId: request.requestId, text: JSON.stringify(plan()) })) };
  useEditorAi.setState({ ...initialAi, mode: "edit", open: true, provider, account: { connected: true, email: "synthetic@example.invalid", plan: null }, model: "synthetic-model", busy: false, checking: false }, true);
  useEditorAiChat.setState(initialChat, true); seed();
});
afterEach(async () => { cleanup?.(); cleanup = undefined; await act(async () => root?.unmount()); root = undefined; host?.remove(); host = undefined; document.querySelectorAll("iframe").forEach(frame => frame.remove()); vi.restoreAllMocks(); useEditorAi.setState(initialAi, true); useEditorAiChat.setState(initialChat, true); useEditorStore.setState(initialEditor, true); });
async function mount(component: ComponentType = AiProjectChat) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(createElement(StrictMode, null, createElement(component)))); }
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent?.includes(name) || node.getAttribute("aria-label") === name)!;
async function type(value: string) { await act(async () => { const area = document.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, value); area.dispatchEvent(new Event("input", { bubbles: true })); }); }
it("allega pagine solo come metadati e non invia percorsi locali, sorgente, tag o handler", () => {
  const selected = seed(), element = aiElementAttachment(selected), attachedPage = aiPageAttachment(selected.root, page);
  const prompt = aiChatPrompt("Migliora il testo", selected, aiChatContext([element, attachedPage], []));
  expect(prompt).toContain("Overview.tsx"); expect(prompt).toContain("Prima"); expect(prompt).not.toMatch(/private-machine|PRIVATE_TAG|privatePlcWrite|secret/);
  expect(JSON.parse(prompt).attachments[1].context).toEqual({ name: "Sinottico", route: "/overview", file: "Overview.tsx" });
});
it("mantiene un solo elemento destinazione e la selezione del canvas non cambia gli allegati", () => {
  const state = useEditorAiChat.getState(); state.attachSelection(); state.attachPage(page);
  const first = useEditorAiChat.getState().attachments[0];
  const document = useEditorStore.getState().document!;
  useEditorStore.setState({ selectedId: Object.values(document.nodes).find(node => node.text === "Altro")!.id });
  expect(useEditorAiChat.getState().attachments[0]).toBe(first);
  state.attachSelection(); expect(useEditorAiChat.getState().attachments).toHaveLength(2);
  expect(useEditorAiChat.getState().attachments.find(item => item.kind === "element")?.label).toContain("Altro");
});
it("conserva conversazione e bozza alla chiusura, invia la cronologia nella richiesta successiva", async () => {
  const chat = useEditorAiChat.getState(); chat.setDraft("Come posso organizzare il sinottico?"); await chat.send();
  expect(useEditorAiChat.getState().messages).toHaveLength(2);
  chat.setDraft("E su mobile?"); useEditorAi.getState().close(); useEditorAi.getState().show("edit");
  expect(useEditorAiChat.getState().draft).toBe("E su mobile?"); await chat.send();
  const input = JSON.parse(vi.mocked(provider.propose).mock.calls[1][0].prompt);
  expect(input.conversation).toEqual([{ role: "user", text: "Come posso organizzare il sinottico?" }, { role: "assistant", text: "Risposta di test" }]);
  expect(useEditorAiChat.getState().messages).toHaveLength(4);
});
it("non accetta modifiche senza un elemento destinazione allegato", async () => {
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(plan([{ id: "text", type: "text", property: null, value: "Inatteso" }])) }));
  useEditorAiChat.getState().setDraft("Aiutami"); await useEditorAiChat.getState().send();
  expect(useEditorAiChat.getState().error).toContain("senza un elemento allegato");
  expect(useEditorAiChat.getState().draft).toBe("Aiutami"); expect(useEditorAiChat.getState().messages).toHaveLength(1);
  expect(useEditorStore.getState().document?.source).toContain(">Prima</button>");
});
it("non invia senza account collegato e conserva la richiesta per riprovare", async () => {
  useEditorAi.setState({ account: undefined }); useEditorAiChat.getState().setDraft("Richiesta"); await useEditorAiChat.getState().send();
  expect(provider.propose).not.toHaveBeenCalled(); expect(useEditorAiChat.getState().draft).toBe("Richiesta"); expect(useEditorAiChat.getState().error).toContain("Impostazioni");
});
it("isola il cambio progetto anche quando arriva dopo una risposta lenta", async () => {
  let finish!: (value: { requestId: string; text: string }) => void;
  vi.mocked(provider.propose).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  cleanup = installAiChatProjectScope(); useEditorAiChat.getState().attachSelection(); useEditorAiChat.getState().setDraft("Domanda privata");
  const pending = useEditorAiChat.getState().send(), requestId = useEditorAi.getState().requestId!;
  useEditorStore.setState({ project: { root: "C:/different-project" } as never });
  finish({ requestId, text: JSON.stringify(plan()) }); await pending;
  expect(useEditorAiChat.getState().messages).toEqual([]); expect(useEditorAiChat.getState().attachments).toEqual([]); expect(useEditorAiChat.getState().draft).toBe(""); expect(useEditorAi.getState().proposal).toBeUndefined();
});
it("annulla senza accettare un risultato tardivo e conserva la bozza", async () => {
  let finish!: (value: { requestId: string; text: string }) => void;
  vi.mocked(provider.propose).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  useEditorAiChat.getState().setDraft("Ancora da decidere"); const pending = useEditorAiChat.getState().send(), requestId = useEditorAi.getState().requestId!;
  await useEditorAiChat.getState().cancel(); finish({ requestId, text: JSON.stringify(plan()) }); await pending;
  expect(provider.cancel).toHaveBeenCalledWith(requestId); expect(useEditorAiChat.getState().messages).toHaveLength(1); expect(useEditorAiChat.getState().messages[0].status).toBe("cancelled");
  expect(useEditorAiChat.getState().draft).toBe("Ancora da decidere"); expect(useEditorAiChat.getState().sending).toBe(false); expect(useEditorAi.getState().busy).toBe(false);
});
it("svuota la chat al cambio account e non la svuota per il refresh dello stesso account", () => {
  cleanup = installAiChatProjectScope(); useEditorAiChat.getState().setDraft("Bozza privata");
  useEditorAi.setState({ account: { connected: true, email: "synthetic@example.invalid", plan: "changed" } }); expect(useEditorAiChat.getState().draft).toBe("Bozza privata");
  useEditorAi.setState({ account: { connected: true, email: "different@example.invalid", plan: null } }); expect(useEditorAiChat.getState().draft).toBe("");
});
it("limita pagine e cronologia, escludendo i tentativi falliti", async () => {
  const pages = Array.from({ length: 6 }, (_, index) => ({ ...page, id: `page-${index}` })); useEditorStore.setState({ pages });
  pages.forEach(page => useEditorAiChat.getState().attachPage(page)); expect(useEditorAiChat.getState().attachments).toHaveLength(5); expect(useEditorAiChat.getState().error).toContain("fino a 5");
  const messages = Array.from({ length: 15 }, (_, index) => ({ id: String(index), role: "user" as const, text: String(index) }));
  expect(aiChatContext([], [...messages, { id: "failed", role: "user", text: "non inviare ancora", status: "error" }]).history).toHaveLength(12);
  expect(aiChatContext([], [...messages, { id: "failed", role: "user", text: "non inviare ancora", status: "error" }]).history.at(-1)?.text).toBe("14");
  useEditorAiChat.setState({ messages: Array.from({ length: 39 }, (_, index) => ({ id: String(index), role: "user", text: "tentativo" })), draft: "Una domanda" });
  await useEditorAiChat.getState().send(); expect(provider.propose).not.toHaveBeenCalled(); expect(useEditorAiChat.getState().messages).toHaveLength(39);
});
it("limita la cronologia anche in byte UTF-8 e non invia allegati eccessivi", () => {
  const messages = Array.from({ length: 12 }, (_, index) => ({ id: String(index), role: "user" as const, text: "界".repeat(8000) }));
  const context = aiChatContext([], messages);
  expect(new TextEncoder().encode(JSON.stringify(context.history)).length).toBeLessThanOrEqual(32_000);
  expect(() => aiChatPrompt("x", undefined, { history: [], attachments: [{ kind: "page", label: "x", context: "x".repeat(100_000) }] })).toThrow("troppo grande");
  const selected = seed(); selected.document = parseSource(selected.document.file, `export const Page=()=> <button>${"x".repeat(33_000)}</button>`); selected.selectedId = Object.keys(selected.document.nodes)[0];
  expect(() => aiElementAttachment(selected)).toThrow("troppo testo");
});
it("propone senza scrivere e applica soltanto dopo conferma, una proposta precedente non è riutilizzabile", async () => {
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(plan([{ id: "text", type: "text", property: null, value: "Dopo" }])) }));
  const apply = vi.spyOn(useEditorStore.getState(), "applyAiProposal").mockResolvedValue(true);
  useEditorAiChat.getState().attachSelection(); useEditorAiChat.getState().setDraft("Cambia testo"); await useEditorAiChat.getState().send();
  expect(apply).not.toHaveBeenCalled(); const first = useEditorAiChat.getState().messages.at(-1)!;
  useEditorAiChat.getState().setDraft("Ripensaci"); await useEditorAiChat.getState().send(); await useEditorAiChat.getState().apply(first.id, ["text"]);
  expect(apply).not.toHaveBeenCalled(); const latest = useEditorAiChat.getState().messages.at(-1)!;
  await useEditorAiChat.getState().apply(latest.id, ["text"]); expect(apply).toHaveBeenCalledExactlyOnceWith(latest.snapshot, latest.proposal, ["text"]);
  expect(useEditorAiChat.getState().messages.at(-1)?.status).toBe("applied");
});
it("mostra una chat non modale e revoca il consenso se cambiano testo o allegati", async () => {
  await mount(); expect(document.querySelector('[aria-modal="true"]')).toBeNull(); expect(document.querySelector('[role="log"]')).not.toBeNull();
  await type("Ciao"); const checkbox = document.querySelector<HTMLInputElement>(".ai-consent input")!;
  await act(async () => checkbox.click()); expect(button("Invia").disabled).toBe(false);
  await act(async () => button("Pagina aperta").click()); expect(checkbox.checked).toBe(false);
  await act(async () => checkbox.click()); await type("Ciao ancora"); expect(checkbox.checked).toBe(false);
  expect(provider.propose).not.toHaveBeenCalled();
});
it("invia dalla chat con consenso, visualizza risposta e mantiene il focus libero", async () => {
  await mount(); await type("Come organizzo le pagine?");
  await act(async () => document.querySelector<HTMLInputElement>(".ai-consent input")!.click()); await act(async () => button("Invia").click());
  expect(document.querySelector('[role="log"]')?.textContent).toContain("Risposta di test"); expect(document.querySelector("textarea")?.value).toBe("");
  const outside = document.createElement("button"); document.body.append(outside); outside.focus();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); expect(document.activeElement).toBe(outside); outside.remove();
});
it("nuova chat richiede conferma e non modifica il pannello", async () => {
  useEditorAiChat.getState().setDraft("Da non perdere"); await mount(); await act(async () => button("Nuova chat").click());
  expect(useEditorAiChat.getState().draft).toBe("Da non perdere"); await act(async () => button("Conserva chat").click()); expect(useEditorAiChat.getState().draft).toBe("Da non perdere");
  await act(async () => button("Nuova chat").click()); await act(async () => button("Svuota e ricomincia").click()); expect(useEditorAiChat.getState().draft).toBe(""); expect(useEditorStore.getState().document?.source).toContain(">Prima</button>");
});
it("Canc nella chat non elimina il componente, ma le scorciatoie restano attive fuori dalla chat", async () => {
  const remove = vi.spyOn(useEditorStore.getState(), "deleteSelection").mockResolvedValue(undefined);
  cleanup = installEditorKeyboardShortcuts(); await mount();
  button("Pagina aperta").dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", code: "Delete", bubbles: true, cancelable: true }));
  expect(remove).not.toHaveBeenCalled();
  const outside = document.createElement("button"); document.body.append(outside);
  await act(async () => outside.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", code: "Delete", bubbles: true, cancelable: true })));
  expect(remove).toHaveBeenCalledTimes(1); outside.remove();
});
it("il menu di pagina allega la pagina senza aprirla né inviare una richiesta", async () => {
  await mount(AiContextMenu);
  await act(async () => window.dispatchEvent(new CustomEvent("framecraft:page-chat-menu", { detail: { page, x: 20, y: 30 } })));
  expect(document.querySelector('[role="menu"]')).not.toBeNull(); await act(async () => button("Aggiungi pagina alla chat").click());
  expect(useEditorAiChat.getState().attachments[0].kind).toBe("page"); expect(provider.propose).not.toHaveBeenCalled();
});
it("il menu ignora messaggi di altre finestre e origini diverse dall’iframe", async () => {
  const frame = document.createElement("iframe"); frame.title = "Project preview"; frame.src = "http://localhost:4173/panel"; document.body.append(frame);
  await mount(AiContextMenu);
  const source = Object.values(useEditorStore.getState().document!.nodes)[0].source;
  for (const data of [{ source: window, origin: "http://localhost:4173" }, { source: frame.contentWindow!, origin: "https://foreign.invalid" }]) {
    await act(async () => window.dispatchEvent(new MessageEvent("message", { ...data, data: { type: "framecraft:ai-context-menu", source, x: 20, y: 30 } })));
    expect(document.querySelector('[role="menu"]')).toBeNull();
  }
  await act(async () => window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin: "http://localhost:4173", data: { type: "framecraft:ai-context-menu", source, x: 20, y: 30 } })));
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  await act(async () => window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin: "http://localhost:4173", data: { type: "framecraft:select", source } })));
  expect(document.querySelector('[role="menu"]')).toBeNull(); expect(useEditorAiChat.getState().attachments).toEqual([]);
});
