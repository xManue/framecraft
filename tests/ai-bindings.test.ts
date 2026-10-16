// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
import { aiEditContext, parseAiProposal, prepareAiEdits, type AiEditSnapshot, type AiOperation, type AiProposal } from "../src/ai/aiProposal";
import { aiReadableData, parseAiBinding, publicAiData, resolveAiBinding, type AiDataReference } from "../src/ai/aiBindings";
import { reviewAiEdits } from "../src/ai/aiEditReview";
import { aiChatContext, aiElementAttachment, aiPageAttachment, prepareAiChat } from "../src/ai/aiChat";
import { aiChatScope } from "../src/ai/aiPageContext";
import { prepareAiPageFiles } from "../src/ai/aiPageEdits";
import { prepareAiQuestionReply } from "../src/ai/aiChatQuestions";
import { parseHmiDynamizations } from "../src/core/hmiDynamizations";
import { simulationPatch } from "../src/core/plcSimulation";
import { resolveHmiTagDynamization } from "../src/core/hmiTagBinding";
import type { PlcVariableDefinition } from "../src/core/plcVariables";
import { AiProjectChat } from "../src/editor/AiProjectChat";
import { useEditorAi } from "../src/state/editorAi";
import { installAiChatProjectScope, useEditorAiChat } from "../src/state/editorAiChat";
import type { AiProvider } from "../src/ai/aiProvider";
const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
import { useEditorStore } from "../src/state/editorStore";

const rootPath = "C:/synthetic-panel", file = `${rootPath}/src/Page.tsx`;
const tag: PlcVariableDefinition = { name: "PRIVATE_ALARM", dataType: "BOOL", access: "read", address: "ns=4;s=PRIVATE_NODE", description: "PRIVATE_DESCRIPTION", connection: "PRIVATE_CONNECTION" };
const count: PlcVariableDefinition = { ...tag, name: "PRIVATE_COUNTER", dataType: "LINT", address: "ns=4;s=COUNTER_NODE" };
const references: AiDataReference[] = [{ id: "data_alarm", label: "Allarme motore", tag }, { id: "data_count", label: "Contatore pezzi", tag: count }];
const page = { id: "page", name: "Sinottico", route: "/synoptic", file };
const source = 'export default ()=> <main><button onClick={()=>manualAction()} style={{backgroundColor:"#eeeeee"}}>Avvia</button><span>Contatore</span></main>';
const initialEditor = useEditorStore.getState(), initialChat = { ...useEditorAiChat.getState(), projectAccess: false }, initialAi = useEditorAi.getState();
let provider: AiProvider, root: Root | undefined, host: HTMLDivElement | undefined, cleanup: (() => void) | undefined;
const proposal = (operations: AiOperation[]): AiProposal => ({ version: 1, mode: "edit", summary: "Regola colore di lettura", questions: [], warnings: [], project: null, operations, provenance: ["approved-selection"], decisions: [] });
const operation = (property = "BackColor", spec: unknown = { source: "data_alarm", mode: "boolean", falseValue: "#eeeeee", trueValue: "#ff0000" }): AiOperation => ({ id: property, type: "binding", property, value: JSON.stringify(spec) });
function snapshot(text = source, type = "button"): AiEditSnapshot { const document = parseSource(file, text); return { root: rootPath, document, selectedId: Object.values(document.nodes).find(node => node.type === type)!.id, dataReferences: references }; }
function opened() { const selected = snapshot(); useEditorStore.setState({ ...initialEditor, project: { root: rootPath, name: "Prova" } as never, document: selected.document, selectedId: selected.selectedId, selectionInfo: undefined, editScope: "instance", interactionMode: "edit", pages: [page], activePageId: page.id, loading: false, dirty: false, reloadRecovery: undefined, panelManifest: undefined, history: [], future: [], plcVariables: [tag, count] }, true); useEditorAiChat.getState().syncRoot(rootPath); useEditorAiChat.getState().setAllowed(true); return selected; }
beforeEach(() => { vi.clearAllMocks(); bridge.readFile.mockResolvedValue(source); bridge.writeFile.mockResolvedValue(undefined); useEditorStore.setState(initialEditor, true); useEditorAiChat.setState(initialChat, true); provider = { id: "synthetic", connect: vi.fn(), models: vi.fn(), login: vi.fn(), logout: vi.fn(), cancel: vi.fn(), subscribe: vi.fn(), propose: vi.fn(async request => ({ requestId: request.requestId, text: JSON.stringify(proposal([])) })) }; useEditorAi.setState({ ...initialAi, mode: "edit", provider, account: { connected: true, email: "test@example.invalid", plan: null }, model: "synthetic" }, true); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
afterEach(async () => { cleanup?.(); cleanup = undefined; await act(async () => root?.unmount()); root = undefined; host?.remove(); host = undefined; vi.restoreAllMocks(); useEditorStore.setState(initialEditor, true); useEditorAiChat.setState(initialChat, true); useEditorAi.setState(initialAi, true); });

it("invia solo alias, nome scelto e tipo, senza tag, indirizzi, valori o credenziali locali", () => {
  const selected = snapshot(), attachments = [aiElementAttachment(selected)], prepared = prepareAiChat("Rosso quando Allarme motore è vero", selected, aiChatContext(attachments, [], "", references));
  expect(prepared.payload.dataSources).toEqual(publicAiData(references)); expect(prepared.prompt).toContain("Allarme motore"); expect(prepared.prompt).not.toMatch(/PRIVATE_|COUNTER_NODE|synthetic-panel|manualAction/);
});
it.each([{ access: "write" as const }, { detected: true }, { dataType: "UDT" }, { dataType: "BOOL[]" }, { name: "../bad" }])("esclude dati non validi %j", patch => { expect(aiReadableData({ ...tag, ...patch })).toBe(false); });
it.each([{}, { mode: "write", source: "data_alarm" }, { mode: "direct", source: "PRIVATE_ALARM" }, { source: "data_alarm", mode: "boolean", falseValue: "#eee", trueValue: "url(https://evil.invalid)" }, { source: "data_alarm", mode: "direct", script: "writePLC()" }])("rifiuta regole non tipizzate %j", spec => { expect(() => parseAiProposal(proposal([operation("BackColor", spec)]), "edit")).toThrow(); });
it("rifiuta proprietà con scritture implicite, script e due regole per lo stesso campo", () => {
  expect(() => parseAiBinding("ProcessValue", JSON.stringify({ source: "data_count", mode: "direct" }))).toThrow(); expect(() => parseAiBinding("Enabled", operation().value)).toThrow();
  expect(() => parseAiProposal(proposal([operation(), { ...operation(), id: "second" }]), "edit")).toThrow("più volte");
});
it("mostra il vero tag nel confronto locale ma non preseleziona la regola", () => {
  const review = reviewAiEdits(snapshot(), proposal([operation()])); expect(review.error).toBeUndefined(); expect(review.defaults).toEqual([]); expect(review.changes[0].afterText).toContain(tag.name); expect(review.changes[0].afterText).toContain("Falso: #eeeeee"); expect(review.changes[0].afterText).toContain("Vero: #ff0000"); expect(review.changes[0].requiresConfirmation).toBe(true);
});
it("collega il colore conservando handler e altri elementi, senza cambiare il catalogo", () => {
  const selected = snapshot(), next = prepareAiEdits(selected, proposal([operation()]), ["BackColor"]), parsed = parseSource(file, next), node = Object.values(parsed.nodes).find(node => node.type === "button")!;
  const bindings = parseHmiDynamizations(node.props["data-hmi-dynamizations"]); expect(bindings).toEqual([resolveAiBinding(selected, operation()).binding]); expect(next).toContain("manualAction()"); expect(next).toContain(">Contatore</span>"); expect(selected.document.source).toBe(source); expect(tag.access).toBe("read");
  for (const [value, color] of [["false", "#eeeeee"], ["true", "#ff0000"], ["0", "#eeeeee"], ["1", "#ff0000"]]) expect(simulationPatch(bindings, { [tag.name]: value }).style.backgroundColor).toBe(color);
});
it("permette testo letto scalare senza perdere precisione e visibilità BOOL", () => {
  const selected = snapshot(), direct = operation("Text", { source: "data_count", mode: "direct" }), visible = operation("Visible", { source: "data_alarm", mode: "direct" });
  expect(simulationPatch([resolveAiBinding(selected, direct).binding], { [count.name]: "9223372036854775807" }).text).toBe("9223372036854775807"); expect(simulationPatch([resolveAiBinding(selected, visible).binding], { [tag.name]: "false" }).style.visibility).toBe("hidden");
});
it("non riutilizza dati assenti o con qualità non valida", () => {
  const binding = resolveAiBinding(snapshot(), operation()).binding;
  expect(simulationPatch([binding], {}).unresolved).toHaveLength(1); expect(resolveHmiTagDynamization(binding, { [tag.name]: "true" }, [tag], { [tag.name]: { qualityKnown: true, qualityCode: 0 } }, true)).toHaveProperty("reason");
});
it("non inserisce tag del progetto in una definizione condivisa esterna", () => {
  const selected = snapshot(); selected.document = parseSource("C:/shared-template/Button.tsx", source); selected.selectedId = Object.values(selected.document.nodes).find(node => node.type === "button")!.id;
  expect(reviewAiEdits(selected, proposal([operation()])).changes[0].blocked).toContain("file esterni"); expect(() => prepareAiEdits(selected, proposal([operation()]), ["BackColor"])).toThrow("file esterni");
});
it("preserva le altre dinamiche e rende esplicita la sostituzione della sola proprietà scelta", () => {
  const existing = [{ property: "Opacity", kind: "Script", source: 'return Tags("PRIVATE_PREVIOUS").Read();', conditionType: "None" }, { property: "BackColor", kind: "Tag", tag: "OLD_ALARM", conditionType: "None" }];
  const selected = snapshot(source.replace('<button ', `<button data-hmi-dynamizations='${JSON.stringify(existing)}' `)), next = prepareAiEdits(selected, proposal([operation()]), ["BackColor"]), node = Object.values(parseSource(file, next).nodes).find(node => node.type === "button")!;
  expect(JSON.parse(String(node.props["data-hmi-dynamizations"]))[0]).toEqual(existing[0]); const review = reviewAiEdits(selected, proposal([operation()])); expect(review.defaults).toEqual([]); expect(review.changes[0].beforeText).toContain("OLD_ALARM"); expect(review.changes[0].warnings.join(" ")).toContain("Sostituisce");
});
it.each(['<button {...props}>Avvia</button>', '<button data-hmi-dynamizations={dynamic}>Avvia</button>', '<button data-hmi-dynamizations="bad-json">Avvia</button>', '<button><span>Figlio</span></button>', '<input value="x"/>', '{items.map(item => <button>Avvia</button>)}', '{Array.from(items, item => <button>Avvia</button>)}'])("non sostituisce attributi, figli o ripetizioni non gestibili %s", body => {
  const selected = snapshot(`export default ()=> <main>${body}</main>`, body.startsWith("<input") ? "input" : "button"); const op = body.includes("Figlio") ? operation("Text", { source: "data_count", mode: "direct" }) : operation();
  expect(reviewAiEdits(selected, proposal([op])).changes[0].blocked).toBeTruthy(); expect(() => prepareAiEdits(selected, proposal([op]), [op.id])).toThrow();
});
it("blocca alias sconosciuti o tipo non compatibile, lasciando applicabili le modifiche grafiche", () => {
  const selected = snapshot(), wrong = operation("BackColor", { source: "data_count", mode: "boolean", falseValue: "#000", trueValue: "#fff" }), unknown = operation("ForeColor", { source: "data_unknown", mode: "boolean", falseValue: "#000", trueValue: "#fff" });
  const review = reviewAiEdits(selected, proposal([wrong, unknown, { id: "style", type: "style", property: "width", value: "140" }])); expect(review.defaults).toEqual(["style"]); expect(review.changes.slice(0, 2).every(change => change.blocked)).toBe(true);
});
it("propaga i riferimenti ai target pagina e applica più regole in un solo file", () => {
  const selected = snapshot(), attached = aiPageAttachment(rootPath, page, selected.document), scope = aiChatScope([attached], references)!;
  const first = Object.entries(scope.targets!).find(([, value]) => value.document.nodes[value.selectedId].type === "button")![0], second = Object.entries(scope.targets!).find(([, value]) => value.document.nodes[value.selectedId].type === "span")![0];
  const plan = proposal([{ ...operation(), target: first }, { ...operation("Text", { source: "data_count", mode: "direct" }), target: second }]); const files = prepareAiPageFiles(scope, plan, ["BackColor", "Text"]);
  expect(files).toHaveLength(1); expect(files[0].source.match(/data-hmi-dynamizations/g)).toHaveLength(2);
});
it.each(["address", "access", "type", "duplicate", "removed"])("rivalida il catalogo e blocca il cambiamento %s prima di scrivere", async kind => {
  const selected = opened(); const changed = { ...tag }; if (kind === "address") changed.address = "other"; if (kind === "access") changed.access = "write"; if (kind === "type") changed.dataType = "INT";
  useEditorStore.setState({ plcVariables: kind === "removed" ? [count] : kind === "duplicate" ? [tag, tag, count] : [changed, count] });
  await expect(useEditorStore.getState().applyAiProposal(selected, proposal([operation()]), ["BackColor"])).rejects.toThrow("catalogo PLC"); expect(bridge.writeFile).not.toHaveBeenCalled();
});
it("rivalida anche un cambiamento avvenuto durante la lettura del file", async () => {
  const selected = opened(); bridge.readFile.mockImplementationOnce(async () => { useEditorStore.setState({ plcVariables: [{ ...tag, access: "write" }, count] }); return source; });
  await expect(useEditorStore.getState().applyAiProposal(selected, proposal([operation()]), ["BackColor"])).rejects.toThrow("catalogo PLC"); expect(bridge.writeFile).not.toHaveBeenCalled();
});
it("salva una sola volta e rende il binding annullabile insieme alla modifica grafica", async () => {
  const selected = opened(), plan = proposal([operation(), { id: "width", type: "style", property: "width", value: "140" }]);
  await useEditorStore.getState().applyAiProposal(selected, plan, ["BackColor", "width"]); expect(bridge.writeFile).toHaveBeenCalledTimes(1); expect(useEditorStore.getState().history).toEqual([{ file, source }]);
  await useEditorStore.getState().undo(); expect(useEditorStore.getState().document!.source).toBe(source);
});
it("la chat revoca una proposta binding se rimuovi il dato dal contesto", async () => {
  opened(); const chat = useEditorAiChat.getState(); chat.addData(tag.name, "Allarme motore"); chat.attachSelection(); const id = useEditorAiChat.getState().dataReferences[0].id;
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(proposal([operation("BackColor", { source: id, mode: "boolean", falseValue: "#eee", trueValue: "#f00" })])) }));
  chat.setDraft("Rosso quando Allarme motore è attivo"); await chat.send(); const answer = useEditorAiChat.getState().messages.at(-1)!; chat.removeData(id); await chat.apply(answer.id, ["BackColor"]);
  expect(useEditorAiChat.getState().error).toContain("dati nel contesto sono cambiati"); expect(bridge.writeFile).not.toHaveBeenCalled();
});
it("consente di aggiungere il dato chiesto dall’AI, ma non di riassegnare quelli precedenti", async () => {
  opened(); const chat = useEditorAiChat.getState(); await chat.attachPage(page);
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify({ ...proposal([]), questions: ["Quale dato devo usare?"] }) }));
  chat.setDraft("Mostra il colore dell’allarme"); await chat.send(); const answer = useEditorAiChat.getState().messages.at(-1)!; chat.addData(tag.name, "Allarme motore"); chat.setAnswer(answer.id, 0, { text: "Allarme motore" });
  const current = useEditorAiChat.getState(), reply = prepareAiQuestionReply(answer.id, current.attachments, current.messages, current.contextNotes, current.dataReferences); expect(reply.context.dataSources?.[0].label).toBe("Allarme motore"); expect(reply.prepared.prompt).not.toContain(tag.name);
});
it("dopo una modifica singola la chat aggiorna l’allegato, senza inviare il nome tag nella cronologia", async () => {
  opened(); const chat = useEditorAiChat.getState(); chat.addData(tag.name, "Allarme motore"); chat.attachSelection(); const id = useEditorAiChat.getState().dataReferences[0].id;
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(proposal([operation("BackColor", { source: id, mode: "boolean", falseValue: "#eee", trueValue: "#f00" })])) }));
  chat.setDraft("Rosso quando Allarme motore è attivo"); await chat.send(); await chat.apply(useEditorAiChat.getState().messages.at(-1)!.id, ["BackColor"]);
  expect(useEditorAiChat.getState().error).toBeUndefined(); expect(useEditorAiChat.getState().attachments[0].snapshot?.document).toBe(useEditorStore.getState().document);
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(proposal([])) })); chat.setDraft("Spiega la modifica"); await chat.send();
  expect(vi.mocked(provider.propose).mock.calls[1][0].prompt).not.toMatch(/PRIVATE_|manualAction/);
  const saved = useEditorStore.getState().document!.source; chat.removeData(id); chat.clear(); expect(useEditorStore.getState().document!.source).toBe(saved); expect(saved).toContain("data-hmi-dynamizations"); expect(bridge.writeFile).toHaveBeenCalledTimes(1);
});
it("cambio progetto/account e Nuova chat eliminano i riferimenti, senza scollegare regole salvate", () => {
  opened(); cleanup = installAiChatProjectScope(); const chat = useEditorAiChat.getState(); chat.addData(tag.name, "Allarme"); chat.clear(); expect(useEditorAiChat.getState().dataReferences).toEqual([]);
  chat.addData(tag.name, "Allarme"); useEditorAi.setState({ account: undefined }); expect(useEditorAiChat.getState().dataReferences).toEqual([]); expect(bridge.writeFile).not.toHaveBeenCalled();
});
it("non riutilizza i chiarimenti dopo la riassegnazione di un riferimento dati", async () => {
  opened(); const chat = useEditorAiChat.getState(); await chat.attachPage(page); chat.addData(tag.name, "Allarme motore");
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify({ ...proposal([]), questions: ["Quale colore vuoi?"] }) }));
  chat.setDraft("Rosso quando Allarme motore è attivo"); await chat.send(); const answer = useEditorAiChat.getState().messages.at(-1)!;
  chat.setAnswer(answer.id, 0, { text: "Rosso" }); chat.removeData(useEditorAiChat.getState().dataReferences[0].id); chat.addData(count.name, "Altro segnale"); await chat.send(answer.id);
  expect(provider.propose).toHaveBeenCalledTimes(1); expect(useEditorAiChat.getState().error).toContain("dati scelti sono cambiati");
});
it("i nomi dati devono essere distinti e il catalogo non viene modificato per accettare un input", () => {
  opened(); const chat = useEditorAiChat.getState(); chat.addData(tag.name, "Allarme"); chat.addData(count.name, "allarme"); expect(useEditorAiChat.getState().dataReferences).toHaveLength(1); expect(useEditorAiChat.getState().error).toContain("nomi distinti");
  chat.addData("TAG_NON_DICHIARATO", "Nuovo"); expect(useEditorAiChat.getState().dataReferences).toHaveLength(1); expect(useEditorStore.getState().plcVariables).toEqual([tag, count]); expect(bridge.writeFile).not.toHaveBeenCalled();
});
it("seleziona un dato dalla UI locale senza avviare una richiesta AI", async () => {
  opened(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(createElement(StrictMode, null, createElement(AiProjectChat))));
  const tagInput = document.querySelector<HTMLInputElement>('input[list]')!, labelInput = document.querySelector<HTMLInputElement>('[id$="-label"]')!;
  const fill = async (node: HTMLInputElement, value: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); });
  await fill(tagInput, tag.name); await fill(labelInput, "Allarme motore"); await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Usa questo dato"))!.click());
  expect(useEditorAiChat.getState().dataReferences).toHaveLength(1); expect(document.querySelector(".ai-chat-data-item")?.textContent).toContain(tag.name); expect(provider.propose).not.toHaveBeenCalled(); expect(bridge.writeFile).not.toHaveBeenCalled();
});
it("apre la revisione con la regola non selezionata e il compositore compatto", async () => {
  opened(); const chat = useEditorAiChat.getState(); chat.addData(tag.name, "Allarme motore"); chat.attachSelection(); const id = useEditorAiChat.getState().dataReferences[0].id;
  vi.mocked(provider.propose).mockImplementation(async request => ({ requestId: request.requestId, text: JSON.stringify(proposal([operation("BackColor", { source: id, mode: "boolean", falseValue: "#eee", trueValue: "#f00" })])) })); chat.setDraft("Rosso quando Allarme motore è attivo"); await chat.send();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(createElement(StrictMode, null, createElement(AiProjectChat))));
  expect(document.querySelector<HTMLDivElement>(".ai-chat-compose-fields")?.hidden).toBe(true); expect(document.querySelector<HTMLInputElement>('[aria-label="Applica: Sfondo da un dato"]')?.checked).toBe(false);
  const apply = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Applica le modifiche selezionate"))!; expect(apply.disabled).toBe(true);
  await act(async () => document.querySelector<HTMLElement>(".ai-chat-compose-mode button")!.click()); expect(document.querySelector<HTMLDivElement>(".ai-chat-compose-fields")?.hidden).toBe(false); expect(provider.propose).toHaveBeenCalledTimes(1);
});
