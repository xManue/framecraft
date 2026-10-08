// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
import { Inspector } from "../src/inspector/Inspector";
import { FaceplateMigrationDialog } from "../src/inspector/FaceplateMigrationDialog";
import { serializeHmiFaceplateBinding } from "../src/core/hmiFaceplates";
import { useEditorStore } from "../src/state/editorStore";
import { parseSource } from "../src/source-parser/parseSource";
import { migrationFixture } from "./fixtures/faceplateMigration";
import { selectedFaceplateBinding } from "../src/core/hmiFaceplateMigration";

const initial = useEditorStore.getState();
let fixture: ReturnType<typeof migrationFixture>;
let root: Root | undefined;
let container: HTMLDivElement;
let disk: string;
let file: string;
let sequence = 0;
beforeEach(() => {
  fixture = migrationFixture(); vi.clearAllMocks();
  file = `C:/synthetic-migration-${++sequence}/src/Page.tsx`;
  disk = `export function Page(){\r\nreturn <main><div data-hmi-type="HmiFaceplateContainer" style={{width:320,left:15,transform:"rotate(20deg)"}} data-hmi-faceplate='${serializeHmiFaceplateBinding(fixture.binding)}' /><button>Other</button></main>;\r\n}\r\n`;
  const document = parseSource(file, disk), node = Object.values(document.nodes).find((item) => item.type === "div")!;
  bridge.readFile.mockImplementation(async (path: string) => { if (path === file) return disk; throw Error("No fixture"); });
  bridge.writeFile.mockImplementation(async (path: string, value: string) => { if (path !== file) throw Error("Unexpected file"); disk = value; });
  useEditorStore.setState({ ...initial, project: { root: file.slice(0, file.indexOf("/src")), files: [] } as never,
    document, selectedId: node.id, selectionInfo: undefined, selectionStyles: {}, unresolvedSelection: undefined,
    interactionMode: "edit", editScope: "instance", history: [], future: [], pages: [], panelManifest: undefined,
    externalRoots: [], unlockedFiles: [], unlockedPages: [], multiSelection: [], faceplateCatalog: fixture.catalog, plcVariables: fixture.variables,
    dirty: false, lastError: undefined, consoleEntries: [] });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn();
  container = window.document.createElement("div");
  window.document.body.appendChild(container);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount()); root = undefined; container.remove();
  useEditorStore.setState(initial); vi.restoreAllMocks();
});
async function renderDialog() {
  const onClose = vi.fn(); root = createRoot(container);
  await act(async () => root!.render(createElement(FaceplateMigrationDialog, { expected: useEditorStore.getState(), targetKey: fixture.targetKey, onClose })));
  return onClose;
}
function dialog() { return document.querySelector<HTMLElement>('[role="dialog"]')!; }
function button(text: string) { return [...dialog().querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === text)!; }
async function choose(label: string, value: string) {
  const field = dialog().querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  await act(async () => { field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); });
}
function currentBinding() { const state = useEditorStore.getState(); return selectedFaceplateBinding(state.document, state.document!.nodes[state.selectedId!], state.selectionInfo)!; }

function repeatedFixture() {
  disk = `export function Page({items}){return <main>{items.map(item => <div data-hmi-type="HmiFaceplateContainer" data-hmi-faceplate='${serializeHmiFaceplateBinding(fixture.binding)}' />)}</main>}`;
  const parsed = parseSource(file, disk), node = Object.values(parsed.nodes).find((item) => item.type === "div")!;
  useEditorStore.setState({ document: parsed, selectedId: node.id, selectionInfo: { instanceIndex: 1, instanceCount: 3 } });
}

describe("confronto e aggiornamento faceplate nell’editor", () => {
  it("non sostituisce un collegamento dinamico arbitrario con configurazioni vuote", async () => {
    const parsed = parseSource(file, 'export function Page(){return <div data-hmi-type="HmiFaceplateContainer" data-hmi-faceplate={resolveBinding()} />}');
    const node = Object.values(parsed.nodes).find((item) => item.type === "div")!;
    useEditorStore.setState({ document: parsed, selectedId: node.id }); root = createRoot(container);
    await act(async () => root!.render(createElement(Inspector)));
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((item) => item.textContent === "PLC e dati")!.click());
    const select = [...container.querySelectorAll<HTMLSelectElement>("select")].find((item) => [...item.options].some((option) => option.value === fixture.targetKey))!;
    expect(select.disabled).toBe(true); expect(container.textContent).toContain("Non la sostituisco con valori vuoti");
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });
  it("la scelta della versione apre il confronto e non azzera subito l’istanza", async () => {
    const source = disk; root = createRoot(container);
    await act(async () => root!.render(createElement(Inspector)));
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((item) => item.textContent === "PLC e dati")!.click());
    const select = [...container.querySelectorAll<HTMLSelectElement>("select")].find((item) => [...item.options].some((option) => option.value === fixture.targetKey))!;
    select.focus();
    await act(async () => { select.value = fixture.targetKey; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(dialog().textContent).toContain("Aggiorna istanza faceplate");
    expect(dialog().querySelector<HTMLInputElement>('[aria-label="Variabile PLC Running"]')?.value).toBe("Motor.Running");
    expect(disk).toBe(source); expect(bridge.writeFile).not.toHaveBeenCalled();
    await act(async () => button("Annulla").click());
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(select);
    expect(currentBinding()).toMatchObject(fixture.binding);
  });
  it("applica attraverso il vero store, conserva geometria e CRLF e permette annulla/ripeti", async () => {
    const source = disk; const close = await renderDialog();
    await act(async () => { button("Applica all’istanza").click(); await vi.waitFor(() => expect(close).toHaveBeenCalledOnce()); });
    expect(currentBinding()).toEqual({ ...fixture.binding, version: "1.0.1", eventBindings: expect.objectContaining({ Start: expect.objectContaining({ script: "HMIRuntime.Trace(speed);" }) }) });
    const next = disk; expect(next).toContain('style={{width:320,left:15,transform:"rotate(20deg)"}}');
    expect(next.replaceAll("\r\n", "")).not.toContain("\n");
    expect(useEditorStore.getState().history).toHaveLength(1); expect(useEditorStore.getState().lastError).toBeUndefined();
    expect(bridge.writeFile).toHaveBeenCalledOnce();
    await act(async () => { await useEditorStore.getState().undo(); }); expect(disk).toBe(source);
    await act(async () => { await useEditorStore.getState().redo(); }); expect(disk).toBe(next);
  });
  it("rimappa tag, proprietà ed eventi rinominati prima di confermare", async () => {
    fixture.after.interfaceTags[0].name = "Ready"; fixture.after.interfaceProperties[0].name = "Label"; fixture.after.interfaceEvents[0].name = "Run";
    const close = await renderDialog(); expect(button("Applica all’istanza").disabled).toBe(true);
    await choose("Origine Tag Ready", "Running"); await choose("Origine Proprietà Label", "Caption"); await choose("Origine Script evento Run", "Start");
    expect(dialog().querySelector('input[type="checkbox"]')).toBeNull(); expect(button("Applica all’istanza").disabled).toBe(false);
    await act(async () => { button("Applica all’istanza").click(); await vi.waitFor(() => expect(close).toHaveBeenCalledOnce()); });
    expect(currentBinding()).toMatchObject({ tagBindings: { Ready: "Motor.Running" }, propertyValues: { Label: "M2400" }, eventBindings: { Run: { script: "HMIRuntime.Trace(speed);" } } });
  });
  it("impedisce scarti non confermati e script con parametri incompatibili", async () => {
    fixture.after.interfaceEvents[0].parameters[0].name = "velocity";
    const close = await renderDialog();
    const source = dialog().querySelector<HTMLSelectElement>('[aria-label="Origine Script evento Start"]')!;
    expect([...source.options].map((option) => option.value)).toEqual([""]);
    expect(button("Applica all’istanza").disabled).toBe(true); expect(dialog().textContent).toContain("Script evento · Start");
    await act(async () => dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(button("Applica all’istanza").disabled).toBe(false);
    await act(async () => { button("Applica all’istanza").click(); await vi.waitFor(() => expect(close).toHaveBeenCalledOnce()); });
    expect(currentBinding().eventBindings).toEqual({});
  });
  it("mantiene il focus nel dialogo e gestisce Escape", async () => {
    const close = await renderDialog(); const first = dialog().querySelector<HTMLButtonElement>("button")!;
    expect(document.activeElement).toBe(first);
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })); });
    expect(document.activeElement).toBe(button("Applica all’istanza"));
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(first);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(close).toHaveBeenCalledOnce(); expect(bridge.writeFile).not.toHaveBeenCalled();
  });
  it("disabilita il confronto se cambia la pagina", async () => {
    await renderDialog();
    await act(async () => useEditorStore.setState({ document: parseSource("C:/other/Page.tsx", "export default () => <p>Other</p>") }));
    expect(button("Applica all’istanza").disabled).toBe(true); expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("sono cambiati");
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });
  it("rende esplicita la modifica a tutte le copie del template", async () => {
    useEditorStore.setState({ editScope: "all", selectionInfo: { instanceIndex: 0, instanceCount: 3 } });
    await renderDialog(); expect(dialog().textContent).toContain("tutte le 3 copie"); expect(button("Applica a tutte le copie")).toBeTruthy();
  });
  it("blocca il doppio invio mentre il file è in scrittura", async () => {
    let finish!: () => void; const pending = new Promise<void>((resolve) => { finish = resolve; });
    bridge.writeFile.mockImplementation(async (_file: string, value: string) => { disk = value; await pending; });
    const close = await renderDialog();
    await act(async () => { const apply = button("Applica all’istanza"); apply.click(); apply.click(); await vi.waitFor(() => expect(bridge.writeFile).toHaveBeenCalledOnce()); });
    expect(button("Applicazione…").disabled).toBe(true);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(close).not.toHaveBeenCalled();
    await act(async () => { finish(); await vi.waitFor(() => expect(close).toHaveBeenCalledOnce()); });
    expect(bridge.writeFile).toHaveBeenCalledOnce();
  });
});

describe("comando di migrazione con selezione protetta", () => {
  it("aggiorna una copia ripetuta e permette una seconda migrazione della stessa copia", async () => {
    repeatedFixture(); const expected = useEditorStore.getState();
    expect(await expected.migrateFaceplate(expected, fixture.targetKey, {}, false)).toBe(true);
    expect(currentBinding().version).toBe("1.0.1");
    expect(disk).toContain("__framecraftIndex === 1");
    const state = useEditorStore.getState(), node = state.document!.nodes[state.selectedId!];
    expect(selectedFaceplateBinding(state.document, node, { instanceIndex: 0, instanceCount: 3 })?.version).toBe("1.0.0");
    expect(selectedFaceplateBinding(state.document, node, { instanceIndex: 2, instanceCount: 3 })?.version).toBe("1.0.0");
    expect(await state.migrateFaceplate(state, "motor@1.0.0", {}, false)).toBe(true);
    expect(currentBinding().version).toBe("1.0.0");
    expect(useEditorStore.getState().history).toHaveLength(2);
  });
  it("non sovrascrive copie configurate diversamente mediante Tutte", async () => {
    repeatedFixture(); const expected = useEditorStore.getState();
    expect(await expected.migrateFaceplate(expected, fixture.targetKey, {}, false)).toBe(true);
    useEditorStore.setState({ editScope: "all" }); const state = useEditorStore.getState(); const unchanged = disk;
    await renderDialog(); expect(button("Applica a tutte le copie").disabled).toBe(true); expect(dialog().textContent).toContain("configurazioni separate");
    expect(await state.migrateFaceplate(state, "motor@1.0.0", {}, true)).toBe(false);
    expect(disk).toBe(unchanged); expect(bridge.writeFile).toHaveBeenCalledOnce();
  });
  it("richiede una copia identificata oppure la scelta esplicita Tutte", async () => {
    repeatedFixture(); useEditorStore.setState({ selectionInfo: { instanceCount: 3 } });
    const state = useEditorStore.getState(); await renderDialog();
    expect(button("Applica all’istanza").disabled).toBe(true); expect(dialog().textContent).toContain("identificare la copia");
    expect(await state.migrateFaceplate(state, fixture.targetKey, {}, true)).toBe(false); expect(bridge.writeFile).not.toHaveBeenCalled();
  });
  it.each(["document", "selection", "copy", "scope", "catalog", "variables", "project", "mode"])("rifiuta un confronto obsoleto: %s", async (change) => {
    const expected = useEditorStore.getState();
    if (change === "document") useEditorStore.setState({ document: { ...expected.document! } });
    if (change === "selection") useEditorStore.setState({ selectedId: Object.values(expected.document!.nodes).find((node) => node.type === "button")!.id });
    if (change === "copy") useEditorStore.setState({ selectionInfo: { instanceIndex: 1, instanceCount: 2 } });
    if (change === "scope") useEditorStore.setState({ editScope: "all" });
    if (change === "catalog") useEditorStore.setState({ faceplateCatalog: structuredClone(fixture.catalog) });
    if (change === "variables") useEditorStore.setState({ plcVariables: structuredClone(fixture.variables) });
    if (change === "project") useEditorStore.setState({ project: { ...expected.project! } });
    if (change === "mode") useEditorStore.setState({ interactionMode: "navigate" });
    expect(await useEditorStore.getState().migrateFaceplate(expected, fixture.targetKey, {}, true)).toBe(false);
    expect(bridge.writeFile).not.toHaveBeenCalled(); expect(useEditorStore.getState().history).toEqual([]);
  });
  it("ricontrolla la selezione dopo il caricamento asincrono del trasformatore", async () => {
    const expected = useEditorStore.getState(); const pending = expected.migrateFaceplate(expected, fixture.targetKey, {}, true);
    useEditorStore.setState({ selectionInfo: { instanceIndex: 1, instanceCount: 2 } });
    expect(await pending).toBe(false); expect(bridge.writeFile).not.toHaveBeenCalled();
  });
  it("rifiuta un piano con scarti non confermati o tag obbligatori non collegati", async () => {
    fixture.after.interfaceEvents = []; const expected = useEditorStore.getState();
    expect(await expected.migrateFaceplate(expected, fixture.targetKey, {}, false)).toBe(false);
    fixture.after.interfaceTags[0].name = "Ready";
    expect(await expected.migrateFaceplate(expected, fixture.targetKey, {}, true)).toBe(false);
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });
});
