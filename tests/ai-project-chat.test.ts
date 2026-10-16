// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AiProjectCodeReview } from "../src/editor/AiProjectCodeReview";
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
