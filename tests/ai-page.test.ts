// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { aiChatContext, aiElementAttachment, aiPageAttachment, prepareAiChat } from "../src/ai/aiChat";
import { aiChatScope } from "../src/ai/aiPageContext";
import { aiProposalGroups, prepareAiPageFiles } from "../src/ai/aiPageEdits";
import { aiPageProposalSchema, aiStyleValue, type AiEditSnapshot, type AiOperation, type AiProposal } from "../src/ai/aiProposal";
import { parseSource } from "../src/source-parser/parseSource";
import type { PageDefinition } from "../src/core/types";
import { useEditorAiChat } from "../src/state/editorAiChat";
import { useEditorAi } from "../src/state/editorAi";
import type { AiProvider } from "../src/ai/aiProvider";
import { standardPageTemplateBody } from "../src/core/hmiPageTemplates";
const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
import { useEditorStore } from "../src/state/editorStore";

const root = "C:/synthetic-panel", file = `${root}/src/Overview.tsx`;
const source = 'const PRIVATE_TAG="SECRET";export default function Overview(){return <main style={{display:"flex",padding:8}}><h1>Sinottico</h1><button onClick={()=>privatePlcWrite(PRIVATE_TAG)} style={{color:"#000000"}}>Prima</button><button>Altro</button><span>{privateValue}</span></main>}';
const page: PageDefinition = { id: "overview", name: "Sinottico", file, route: "/overview" };
const original = useEditorStore.getState(), originalChat = useEditorAiChat.getState(), originalAi = useEditorAi.getState();
const proposal = (operations: AiOperation[]): AiProposal => ({ version: 1, mode: "edit", summary: "Restyling", questions: [], warnings: [], provenance: ["approved-selection"], project: null, decisions: [], operations });
function attachment(text = source, definition = page) { return aiPageAttachment(root, definition, parseSource(definition.file, text)); }
function target(snapshot: AiEditSnapshot, text: string) { return Object.entries(snapshot.targets!).find(([, value]) => value.document.nodes[value.selectedId].text === text)![0]; }
function changes(snapshot: AiEditSnapshot) { return proposal([{ id: "first", target: target(snapshot, "Prima"), type: "text", property: null, value: "Avvia" }, { id: "second", target: target(snapshot, "Altro"), type: "text", property: null, value: "Arresta" }, { id: "layout", target: Object.keys(snapshot.targets!)[0], type: "style", property: "gap", value: "16" }]); }
function opened() {
  const attached = attachment(), snapshot = aiChatScope([attached])!;
  useEditorStore.setState({ ...original, project: { root, name: "Prova" } as never, document: attached.snapshot!.document, selectedId: undefined, pages: [page], activePageId: page.id, loading: false, reloadRecovery: undefined, interactionMode: "edit", dirty: false, panelManifest: undefined, history: [], future: [], consoleEntries: [] });
  return snapshot;
}
beforeEach(() => { vi.clearAllMocks(); bridge.readFile.mockResolvedValue(source); bridge.writeFile.mockResolvedValue(undefined); useEditorStore.setState(original, true); useEditorAiChat.setState(originalChat, true); useEditorAi.setState(originalAi, true); });
afterEach(() => { vi.restoreAllMocks(); useEditorStore.setState(original, true); useEditorAiChat.setState(originalChat, true); useEditorAi.setState(originalAi, true); });

it("allega contenuto reale e gerarchia senza codice, handler, percorsi assoluti o tag PLC", () => {
  const attached = attachment(), snapshot = aiChatScope([attached])!, prepared = prepareAiChat("Migliora tutta la pagina", snapshot, aiChatContext([attached], []));
  const context = (prepared.payload.approvedContext as { pages: { context: { rows: unknown[][] } }[] }).pages[0].context;
  expect(context.rows).toHaveLength(5); expect(context.rows[0].slice(0, 3)).toEqual(["a0_e0", null, "main"]); expect(context.rows[2][1]).toBe("a0_e0");
  expect(prepared.prompt).toContain("Prima"); expect(prepared.prompt).toContain("Altro"); expect(prepared.prompt).not.toMatch(/PRIVATE_TAG|SECRET|privatePlcWrite|privateValue|synthetic-panel|export default/);
  expect(prepared.inputBytes).toBe(new TextEncoder().encode(prepared.prompt + JSON.stringify(aiPageProposalSchema)).length); expect(prepared.inputBytes).toBeLessThan(24_000);
});
it("non duplica un elemento già contenuto nella pagina allegata", () => {
  const page = attachment(), document = page.snapshot!.document, selectedId = Object.values(document.nodes).find(node => node.text === "Prima")!.id;
  const attachments = [aiElementAttachment({ root, document, selectedId }), page], context = aiChatContext(attachments, []), scope = aiChatScope(attachments)!;
  expect(context.attachments).toHaveLength(1); expect(Object.keys(scope.targets!).every(id => id.startsWith("a1_"))).toBe(true);
  expect(prepareAiChat("Migliora tutto", scope, context).prompt.match(/"Prima"/g)).toHaveLength(1);
});
it.each(["synoptic", "machine-render", "program-modification"] as const)("include il contenuto del template standard %s nel budget", id => {
  const attached = attachment(`export default function Page(){return <main data-hmi-template-id="${id}" data-hmi-template-version={1}>${standardPageTemplateBody(id, "Pagina prova")}</main>}`);
  const scope = aiChatScope([attached])!, prepared = prepareAiChat("Migliora la grafica di questa pagina", scope, aiChatContext([attached], []));
  expect(Object.keys(scope.targets!).length).toBeGreaterThan(3); expect(prepared.inputBytes).toBeLessThanOrEqual(24_000);
});
it("isola il componente della pagina e i componenti locali usati, senza altre schermate", () => {
  const attached = attachment('const Local=()=> <b>Locale</b>;export const Overview=()=> <main><Local/><button>Qui</button></main>;export const Settings=()=> <button>NON_ALLEGATO</button>;', { ...page, componentName: "Overview" });
  const text = JSON.stringify(attached.context); expect(text).toContain("Locale"); expect(text).toContain("Qui"); expect(text).not.toContain("NON_ALLEGATO");
});
it("isola i rami della pagina quando il file usa uno stato di navigazione", () => {
  const attached = attachment('export default function App(){return <main>{page === "main" ? <button>Principale</button> : <button>ALTRO_RAMO</button>}</main>}', { ...page, stateValue: "main" });
  expect(JSON.stringify(attached.context)).toContain("Principale"); expect(JSON.stringify(attached.context)).not.toContain("ALTRO_RAMO");
});
it("un contenitore allegato include i figli ma non i fratelli", () => {
  const document = parseSource(file, 'export default ()=> <main><section><span>Interno</span></section><button>ESTERNO</button></main>');
  const node = Object.values(document.nodes).find(node => node.type === "section")!;
  const attached = aiElementAttachment({ root, document, selectedId: node.id });
  expect(attached.snapshot?.targets).toBeDefined(); expect(JSON.stringify(attached.context)).toContain("Interno"); expect(JSON.stringify(attached.context)).not.toContain("ESTERNO");
});
it("aggiorna più nodi e il genitore senza spostare i riferimenti o alterare binding e handler", () => {
  const snapshot = aiChatScope([attachment()])!, plan = changes(snapshot), files = prepareAiPageFiles(snapshot, plan, plan.operations.map(operation => operation.id));
  expect(files).toHaveLength(1); expect(files[0].source).toContain(">Avvia</button>"); expect(files[0].source).toContain(">Arresta</button>"); expect(files[0].source).toContain("gap: 16"); expect(files[0].source).toContain("privatePlcWrite(PRIVATE_TAG)"); expect(files[0].source).toContain("{privateValue}"); expect(snapshot.document.source).toBe(source);
});
it("rifiuta destinatari inventati, mancanti e duplicati tramite due allegati", () => {
  const attached = attachment(), snapshot = aiChatScope([attached])!;
  expect(() => aiProposalGroups(snapshot, proposal([{ id: "x", type: "text", property: null, value: "X", target: "not_attached" }]))).toThrow("non allegato");
  expect(() => aiProposalGroups(snapshot, proposal([{ id: "x", type: "text", property: null, value: "X" }]))).toThrow("non allegato");
  const duplicate = aiChatScope([attached, attached])!;
  expect(() => aiProposalGroups(duplicate, proposal([{ id: "one", target: target(duplicate, "Prima"), type: "text", property: null, value: "Uno" }, { id: "two", target: target(duplicate, "Prima").replace("a0_", "a1_"), type: "text", property: null, value: "Due" }]))).toThrow("due volte");
});
it("applica solo gli ID approvati", () => {
  const snapshot = aiChatScope([attachment()])!, plan = changes(snapshot), changed = prepareAiPageFiles(snapshot, plan, ["first"])[0].source;
  expect(changed).toContain(">Avvia</button>"); expect(changed).toContain(">Altro</button>"); expect(changed).not.toContain("gap:");
});
it.each(["12px 16px", "0 auto", "4 8 12 16"])("accetta spaziature sicure %s", value => { expect(aiStyleValue("margin", value)).toBe(value); });
it.each(["url(https://evil.invalid)", "1px;display:none", "calc(2px + 1px)", "1 2 3 4 5"])("rifiuta spaziature eseguibili o non supportate %s", value => { expect(() => aiStyleValue("padding", value)).toThrow(); });
it("applica una pagina anche senza selezione e crea un solo Annulla/Ripeti", async () => {
  const snapshot = opened(), plan = changes(snapshot);
  await useEditorStore.getState().applyAiPageProposal(snapshot, plan, ["first", "second", "layout"]);
  expect(bridge.writeFile).toHaveBeenCalledTimes(1); expect(useEditorStore.getState().history).toEqual([{ file, source }]);
  const changed = useEditorStore.getState().document!.source;
  await useEditorStore.getState().undo(); expect(useEditorStore.getState().document!.source).toBe(source);
  await useEditorStore.getState().redo(); expect(useEditorStore.getState().document!.source).toBe(changed);
});
it("modifica una pagina allegata non aperta senza cambiare il canvas", async () => {
  const snapshot = opened(), open = parseSource(`${root}/src/Other.tsx`, 'export default ()=> <button>Aperta</button>');
  useEditorStore.setState({ document: open });
  await useEditorStore.getState().applyAiPageProposal(snapshot, changes(snapshot), ["first", "second"]);
  expect(bridge.writeFile).toHaveBeenCalledExactlyOnceWith(file, expect.stringContaining("Avvia")); expect(useEditorStore.getState().document).toBe(open); expect(useEditorStore.getState().history).toHaveLength(1);
});
it("mantiene i controlli tipizzati anche su una pagina guidata", async () => {
  const snapshot = opened(); vi.spyOn(useEditorStore.getState(), "guidedPage").mockReturnValue({ id: "guided", name: "Guidata", affordances: [] } as never);
  await useEditorStore.getState().applyAiPageProposal(snapshot, changes(snapshot), ["first"]);
  expect(bridge.writeFile).toHaveBeenCalledTimes(1); expect(useEditorStore.getState().document!.source).toContain("privatePlcWrite(PRIVATE_TAG)");
});
it.each(["external", "write-failure", "dirty", "project"])("non perde modifiche o cronologia in caso %s", async kind => {
  const snapshot = opened();
  if (kind === "external") bridge.readFile.mockResolvedValue(source + "// changed");
  if (kind === "write-failure") bridge.writeFile.mockRejectedValue(new Error("EBUSY"));
  if (kind === "dirty") useEditorStore.setState({ dirty: true });
  if (kind === "project") useEditorStore.setState({ project: { root: "C:/other" } as never });
  await expect(useEditorStore.getState().applyAiPageProposal(snapshot, changes(snapshot), ["first"])).rejects.toThrow();
  expect(useEditorStore.getState().document!.source).toBe(source); expect(useEditorStore.getState().history).toEqual([]);
  if (kind !== "write-failure") expect(bridge.writeFile).not.toHaveBeenCalled();
});
it("la chat legge anche una pagina non aperta e invia schema e contenuti reali", async () => {
  opened(); const other = { ...page, id: "other", file: `${root}/src/Other.tsx` }; useEditorStore.setState({ pages: [page, other] });
  bridge.readFile.mockResolvedValue('export default ()=> <button>Pagina remota</button>');
  const provider = { id: "test", propose: vi.fn(async request => ({ requestId: request.requestId, text: JSON.stringify(proposal([])) })) } as unknown as AiProvider;
  useEditorAi.setState({ mode: "edit", provider, account: { connected: true, email: "test@example.invalid", plan: null }, model: "synthetic", busy: false, checking: false, connecting: false });
  const chat = useEditorAiChat.getState(); chat.syncRoot(root); chat.setAllowed(true); await chat.attachPage(other); chat.setDraft("Migliora questa pagina"); await chat.send();
  expect(provider.propose).toHaveBeenCalledWith(expect.objectContaining({ schema: aiPageProposalSchema, prompt: expect.stringContaining("Pagina remota") })); expect(useEditorStore.getState().document!.file).toBe(file);
});
it("richiede un’approvazione per file e mantiene lo stato parziale veritiero", async () => {
  const snapshot = opened(), other = { ...page, id: "other", name: "Altra", file: `${root}/src/Other.tsx` };
  const attached = attachment(), second = attachment(source, other), scope = aiChatScope([attached, second])!;
  const plan = proposal([{ id: "one", target: target(scope, "Prima"), type: "text", property: null, value: "Uno" }, { id: "two", target: target(scope, "Altro").replace("a0_", "a1_"), type: "text", property: null, value: "Due" }]);
  await expect(useEditorStore.getState().applyAiPageProposal(scope, plan, ["one", "two"])).rejects.toThrow("file alla volta"); expect(bridge.writeFile).not.toHaveBeenCalled();
  useEditorStore.setState({ pages: [page, other] });
  const chat = useEditorAiChat.getState(); chat.syncRoot(root); useEditorAiChat.setState({ attachments: [attached, second], messages: [{ id: "answer", role: "assistant", text: "Proposta", proposal: plan, snapshot: scope }] });
  await chat.apply("answer", ["one"]); expect(useEditorAiChat.getState().error).toBeUndefined(); expect(useEditorAiChat.getState().messages[0].status).toBeUndefined(); expect(useEditorAiChat.getState().messages[0].appliedOperations).toEqual(["one"]);
  await chat.apply("answer", ["two"]); expect(useEditorAiChat.getState().error).toBeUndefined(); expect(useEditorAiChat.getState().messages[0].status).toBe("applied"); expect(useEditorStore.getState().history).toHaveLength(2); expect(snapshot.document.source).toBe(source);
});
