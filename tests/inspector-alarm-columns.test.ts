// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readFile: vi.fn(), writeFile: vi.fn() } }));
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { Inspector } from "../src/inspector/Inspector";
import { useEditorStore } from "../src/state/editorStore";
import { parseSource } from "../src/source-parser/parseSource";
import { alarmColumnsAttribute, parseAlarmColumns } from "../scripts/hmi-alarm-views.mjs";
const initial = useEditorStore.getState(), file = "C:/alarm-columns/Page.jsx";
let host: HTMLDivElement, root: Root;
const field = (label: string) => [...host.querySelectorAll(".alarm-columns-fields label")].find(node => node.querySelector("span")?.textContent === label)!.querySelector<HTMLInputElement | HTMLSelectElement>("input,select")!;
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label)!;
const current = () => { const state = useEditorStore.getState(); return parseAlarmColumns(state.document!.nodes[state.selectedId!].props[alarmColumnsAttribute]); };
async function mount(attributes = "") {
  const source = 'const unrelated = "preserve me"; export default function Page(){return <main><div data-hmi-type="HmiAlarmControl" ' + attributes + '>Bozza</div><button>Altro</button></main>}', parsed = parseSource(file, source), selected = Object.values(parsed.nodes).find(node => node.props["data-hmi-type"] === "HmiAlarmControl")!;
  const files = new Map([[file, source]]); vi.mocked(desktopBridge.readFile).mockImplementation(async path => files.get(path)!); vi.mocked(desktopBridge.writeFile).mockImplementation(async (path, value) => { files.set(path, value); });
  useEditorStore.setState({ ...initial, project: { root: "C:/alarm-columns", files: [] } as never, document: parsed, selectedId: selected.id, selectionInfo: undefined, selectionStyles: {}, selectionRect: undefined, multiSelection: [], unresolvedSelection: undefined, listBinding: undefined, callSites: undefined, propertiesExpandedAt: 0, textFocusRequestedAt: undefined, editScope: "instance", interactionMode: "edit", panelManifest: undefined, pages: [], history: [], future: [], dirty: false, consoleEntries: [], lastError: undefined });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(createElement(Inspector))); await act(async () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(node => node.textContent === "PLC e dati")!.click());
}
async function change(label: string, value: string) { const node = field(label); await act(async () => { Object.getOwnPropertyDescriptor(node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }
async function apply() { await act(async () => host.querySelector<HTMLFormElement>("form.alarm-columns-fields")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
beforeEach(() => { vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); useEditorStore.setState(initial, true); vi.restoreAllMocks(); });
it("saves complete display configuration only on Apply, with undo and unrelated JSX preserved", async () => {
  await mount(); const before = useEditorStore.getState(), selectedStart = before.document!.nodes[before.selectedId!].source.start; await change("Titolo della colonna", "Nome macchina"); await change("Larghezza colonna (px)", "240"); await change("Posizione della colonna", "2"); await change("Orario della lista", "UTC"); expect(desktopBridge.writeFile).not.toHaveBeenCalled(); await apply();
  const state = useEditorStore.getState(); expect(current()).toMatchObject({ timeZone: "UTC" }); expect(current().columns[2]).toMatchObject({ key: "name", label: "Nome macchina", width: 240 }); expect(state.document!.nodes[state.selectedId!].source.start).toBe(selectedStart); expect(state.document!.nodes[state.selectedId!].props["data-hmi-type"]).toBe("HmiAlarmControl"); expect(state.document!.source).toContain('const unrelated = "preserve me";'); expect(state.document!.source).toContain("<button>Altro</button>"); expect(vi.mocked(desktopBridge.writeFile).mock.calls.map(([path]) => path)).toEqual([file]);
  await act(async () => useEditorStore.getState().undo()); expect(current().timeZone).toBe("local"); await act(async () => useEditorStore.getState().redo()); expect(current().columns[2].label).toBe("Nome macchina");
});
it("keeps invalid width as a field draft and requires identity/state visibility", async () => {
  await mount(); expect(field("Mostra colonna").disabled).toBe(true); const source = useEditorStore.getState().document!.source; await change("Larghezza colonna (px)", "63"); await apply(); expect(host.textContent).toContain("Il valore precedente è conservato"); expect(useEditorStore.getState().document!.source).toBe(source); expect(desktopBridge.writeFile).not.toHaveBeenCalled();
  await change("Colonna da configurare", "message"); expect(field("Mostra colonna").disabled).toBe(false); await act(async () => (field("Mostra colonna") as HTMLInputElement).click()); await apply(); expect(current().columns.find(item => item.key === "message")!.visible).toBe(false);
});
it.each(['data-hmi-alarm-columns={getColumns()}', 'data-hmi-alarm-columns="PRIVATE_BROKEN_JSON"'])("requires explicit replacement for calculated or corrupt configuration: %s", async attributes => {
  await mount(attributes); const source = useEditorStore.getState().document!.source; expect(button("Usa colonne iniziali").disabled).toBe(true); expect(desktopBridge.writeFile).not.toHaveBeenCalled(); expect(useEditorStore.getState().document!.source).toBe(source); expect(host.querySelector(".alarm-columns-fields")!.textContent).not.toContain("PRIVATE_BROKEN_JSON");
  const checkbox = [...host.querySelectorAll<HTMLLabelElement>("label")].find(node => node.textContent?.includes("Sostituisci la configurazione colonne attuale"))!.querySelector<HTMLInputElement>("input")!; await act(async () => checkbox.click()); await act(async () => button("Usa colonne iniziali").click()); expect(current().columns).toHaveLength(13); await act(async () => useEditorStore.getState().undo()); expect(useEditorStore.getState().document!.source).toBe(source);
});
