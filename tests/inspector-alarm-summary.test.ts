// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readFile: vi.fn(), writeFile: vi.fn() } }));
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { Inspector } from "../src/inspector/Inspector";
import { useEditorStore } from "../src/state/editorStore";
import { parseSource } from "../src/source-parser/parseSource";
import { defaultHmiAlarmSummaryConfig, hmiAlarmSummaryAttribute, hmiAlarmSummaryJsx, parseHmiAlarmSummaryConfig } from "../src/core/hmiAlarmSummary";

const initial = useEditorStore.getState(), file = "C:/alarm-summary/Page.jsx";
let host: HTMLDivElement, root: Root;
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === label)!;
const field = (label: string) => [...host.querySelectorAll(".alarm-summary-fields label")].find((node) => node.querySelector("span")?.textContent === label)!.querySelector<HTMLInputElement | HTMLSelectElement>("input,select")!;
const current = () => { const state = useEditorStore.getState(); return parseHmiAlarmSummaryConfig(state.document!.nodes[state.selectedId!].props[hmiAlarmSummaryAttribute]); };
async function mount(jsx = hmiAlarmSummaryJsx("indicator")) {
  const source = 'const unrelated = "preserve me"; export default function Page(){return <main>' + jsx + "<button>Altro</button></main>}";
  const parsed = parseSource(file, source), node = Object.values(parsed.nodes).find((item) => item.props["data-hmi-type"]?.toString().startsWith("HmiAlarm"))!;
  const files = new Map([[file, source]]); vi.mocked(desktopBridge.readFile).mockImplementation(async (path) => { const value = files.get(path); if (value === undefined) throw new Error("ENOENT: fixture " + path); return value; }); vi.mocked(desktopBridge.writeFile).mockImplementation(async (path, value) => { files.set(path, value); });
  useEditorStore.setState({ ...initial, project: { root: "C:/alarm-summary", files: [] } as never, document: parsed, selectedId: node.id, selectionInfo: undefined, selectionStyles: {}, selectionRect: undefined, multiSelection: [], unresolvedSelection: undefined, listBinding: undefined, callSites: undefined, propertiesExpandedAt: 0, textFocusRequestedAt: undefined, editScope: "instance", interactionMode: "edit", panelManifest: undefined,
    pages: [{ id: "alarms", name: "Allarmi", route: "/alarms", file, componentName: "Page" }] as never, history: [], future: [], dirty: false, consoleEntries: [], lastError: undefined });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(Inspector)));
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((node) => node.textContent === "PLC e dati")!.click());
}
async function change(label: string, value: string) {
  const node = field(label);
  await act(async () => { node.focus(); Object.getOwnPropertyDescriptor(node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  if (node.tagName !== "SELECT") await act(async () => node.blur());
}
beforeEach(() => { vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); useEditorStore.setState(initial, true); vi.restoreAllMocks(); });

describe("Inspector dei riepiloghi allarmi", () => {
  it("persiste filtri e destinazione con undo, senza cambiare selezione o file estranei", async () => {
    await mount(); const initialState = useEditorStore.getState(), selected = initialState.document!.nodes[initialState.selectedId!];
    await change("Classi (separate da virgola)", "Alarm_CTH, Alarm_History"); await change("Zone (separate da virgola)", "Linea 1, Linea 2"); await change("Priorità minima", "20"); await change("Quali allarmi", "unacknowledged"); await change("Pagina collegata al dettaglio", "/alarms");
    expect(current()).toMatchObject({ classes: ["Alarm_CTH", "Alarm_History"], areas: ["Linea 1", "Linea 2"], minPriority: 20, mode: "unacknowledged", pageRoute: "/alarms" }); const state = useEditorStore.getState(), next = state.document!.nodes[state.selectedId!]; expect(next.source.start).toBe(selected.source.start); expect(next.props["data-hmi-type"]).toBe("HmiAlarmIndicator"); expect(state.document!.source).toContain('const unrelated = "preserve me";'); expect(state.document!.source).toContain("<button>Altro</button>"); expect(vi.mocked(desktopBridge.writeFile).mock.calls.map(([path]) => path)).toEqual([file, file, file, file, file]);
    await act(async () => useEditorStore.getState().undo()); expect(current()?.pageRoute).toBeUndefined(); expect(current()?.minPriority).toBe(20);
    await act(async () => useEditorStore.getState().redo()); expect(current()?.pageRoute).toBe("/alarms");
  });
  it("un numero o filtro errato resta una bozza del campo, non distrugge il contratto valido", async () => {
    await mount(); const before = useEditorStore.getState().document!.source;
    await change("Priorità minima", "NaN"); expect(host.textContent).toContain("Il valore precedente è conservato"); expect(current()?.minPriority).toBe(0); expect(useEditorStore.getState().document!.source).toBe(before);
    await change("Classi (separate da virgola)", "Alarm_CTH, Alarm_CTH"); expect(host.textContent).toContain("nomi unici"); expect(current()?.classes).toEqual([]);
    await change("Priorità minima", "42"); expect(current()?.minPriority).toBe(42); expect(host.querySelector(".alarm-summary-fields")).not.toBeNull();
  });
  it("riga mostra ordine, righe e orario, non impostazioni icona; i controlli sono etichettati", async () => {
    await mount(hmiAlarmSummaryJsx("line")); await change("Numero di messaggi", "3"); await change("Ordine dei messaggi", "priority"); await change("Orario dei messaggi", "UTC");
    expect(current()).toMatchObject({ rows: 3, order: "priority", timeZone: "UTC", openDetails: false }); expect(host.querySelector(".alarm-summary-fields")!.textContent).not.toContain("Contenuto indicatore");
    for (const input of host.querySelectorAll(".alarm-summary-fields input, .alarm-summary-fields select")) expect(input.closest("label")).toBeTruthy();
    const ordinary = Object.values(useEditorStore.getState().document!.nodes).find((item) => item.type === "button")!; await act(async () => useEditorStore.setState({ selectedId: ordinary.id })); expect(host.querySelector(".alarm-summary-fields")).toBeNull();
  });
  it("JSON errato richiede sostituzione esplicita senza stampare il contenuto privato", async () => {
    await mount('<div data-hmi-type="HmiAlarmIndicator" data-hmi-alarm-summary="PRIVATE_BROKEN_JSON">Bozza</div>'); expect(host.textContent).toContain("Non viene sostituita automaticamente"); expect(host.textContent).not.toContain("PRIVATE_BROKEN_JSON"); expect(button("Usa configurazione iniziale").disabled).toBe(true);
    const consent = [...host.querySelectorAll("label")].find((node) => node.textContent?.includes("Sostituisci la configurazione attuale"))!.querySelector<HTMLInputElement>("input")!;
    await act(async () => consent.click()); await act(async () => button("Usa configurazione iniziale").click()); expect(current()).toEqual(defaultHmiAlarmSummaryConfig());
  });
  it("una configurazione calcolata non viene rimpiazzata silenziosamente con i valori iniziali", async () => {
    await mount('<div data-hmi-type="HmiAlarmIndicator" data-hmi-alarm-summary={getAlarmConfig()}>Bozza</div>'); expect(host.textContent).toContain("Configurazione calcolata nel codice"); expect(host.querySelector(".alarm-summary-fields")).toBeNull(); expect(button("Usa configurazione iniziale").disabled).toBe(true); expect(useEditorStore.getState().document!.source).toContain("getAlarmConfig()"); expect(desktopBridge.writeFile).not.toHaveBeenCalled();
  });
});
