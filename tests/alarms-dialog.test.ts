// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readAlarmConfiguration: vi.fn(), saveAlarmConfiguration: vi.fn() } }));
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { AlarmsDialog } from "../src/editor/AlarmsDialog";
import { TopBar } from "../src/editor/TopBar";
import { useEditorStore } from "../src/state/editorStore";
import { emptyAlarmCatalog, type AlarmConfigurationSnapshot } from "../src/core/hmiAlarms";

const project = { root: "C:/alarms-panel", name: "Allarmi", framework: "vite" as const, language: "typescript" as const, packageManager: "npm" as const, entryFiles: [], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] };
const variables = [{ name: "Signal", dataType: "Bool", access: "read", address: "PLC.Signal", description: "" }];
const initial = (): AlarmConfigurationSnapshot => ({ generation: 2, source: JSON.stringify(emptyAlarmCatalog()), plc: JSON.stringify({ version: 1, variables }) });
let root: Root, host: HTMLElement; const close = vi.fn();
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === name)!;
const field = (name: string) => [...document.querySelectorAll<HTMLLabelElement>("label")].find((node) => node.childNodes[0]?.textContent === name)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select")!;
async function click(node: HTMLElement) { await act(async () => node.click()); }
async function change(name: string, value: string) { const node = field(name); expect(node).toBeTruthy(); await act(async () => { Object.getOwnPropertyDescriptor(node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }
async function mount(component = createElement(AlarmsDialog, { onClose: close })) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(component)); }
async function createAlarm() { await click(button("Nuovo allarme")); await change("Nome", "Motor"); await change("Messaggio operatore", "Controlla motore"); await change("Segnale PLC", "Signal"); }
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks(); useEditorStore.setState({ project, loading: false, dirty: false, previewRestarting: false, previewUrl: undefined, consoleEntries: [], history: [], future: [], multiSelection: [] }); vi.mocked(desktopBridge.readAlarmConfiguration).mockResolvedValue(initial()); vi.mocked(desktopBridge.saveAlarmConfiguration).mockImplementation(async (_root, expected, source) => ({ ...expected, source })); });
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); vi.restoreAllMocks(); });
describe("Allarmi: configurazione e prova guidata", () => {
  it("si apre dal menu superiore, non salva né avvia l'anteprima", async () => {
    const restart = vi.spyOn(useEditorStore.getState(), "restartPreview").mockResolvedValue(); await mount(createElement(TopBar));
    expect(document.querySelector('[role="dialog"]')).toBeNull(); await click(button("Pannello"));
    const entry = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((node) => node.querySelector("strong")?.textContent === "Allarmi")!; await click(entry);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Allarmi"); expect(restart).not.toHaveBeenCalled(); expect(desktopBridge.saveAlarmConfiguration).not.toHaveBeenCalled();
  });
  it("campi dichiarati, controllo bit e salvataggio protetto da snapshot", async () => {
    await mount(); await createAlarm(); await change("Numero bit (Bool = 0)", "1"); expect(button("Salva allarmi").disabled).toBe(true); expect(document.body.textContent).toContain("bit valido");
    await change("Numero bit (Bool = 0)", "0"); await click(button("Salva allarmi"));
    expect(desktopBridge.saveAlarmConfiguration).toHaveBeenCalledOnce(); const [savedRoot, expected, source] = vi.mocked(desktopBridge.saveAlarmConfiguration).mock.calls[0]; expect(savedRoot).toBe(project.root); expect(expected).toEqual(initial()); expect(JSON.parse(source).alarms[0]).toMatchObject({ tag: "Signal", text: "Controlla motore" });
    expect(document.body.textContent).toContain("Nessun comando o collegamento PLC avviato"); expect(button("Salva allarmi").disabled).toBe(true);
    for (const input of document.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"]), select')) expect(input.closest("label")).toBeTruthy();
  });
  it("prova locale del motore senza rete, rientro distinto dalla presa visione", async () => {
    await mount(); await createAlarm(); await change("Valore del segnale selezionato", "1"); await click(button("Applica segnale di prova"));
    expect(document.body.textContent).toContain("Attivo"); await click(button("Motor")); await click(button("Prendi in visione")); expect(document.body.textContent).toContain("preso in visione");
    await change("Valore del segnale selezionato", "0"); await change("Qualità del segnale", "0"); await click(button("Applica segnale di prova")); expect(document.body.textContent).toContain("segnale non valido"); expect(document.body.textContent).toContain("Attivo");
    await change("Qualità del segnale", "192"); await click(button("Applica segnale di prova")); expect(document.body.textContent).toContain("Nessun allarme corrispondente"); expect(desktopBridge.saveAlarmConfiguration).not.toHaveBeenCalled();
  });
  it("JSON invalido non si mostra grezzo né si sovrascrive", async () => {
    vi.mocked(desktopBridge.readAlarmConfiguration).mockResolvedValue({ ...initial(), source: '{"secret":"NEVER_PRINT_ME' }); await mount();
    expect(document.body.textContent).toContain("JSON allarmi non valido"); expect(document.body.textContent).not.toContain("NEVER_PRINT_ME"); expect(desktopBridge.saveAlarmConfiguration).not.toHaveBeenCalled();
  });
  it("conflitto conserva la bozza; Escape chiede di scartare e focus torna al chiamante", async () => {
    const opener = document.createElement("button"); document.body.append(opener); opener.focus(); await mount(); await createAlarm();
    vi.mocked(desktopBridge.saveAlarmConfiguration).mockRejectedValue(new Error("Catalogo cambiato. Ricarica.")); await click(button("Salva allarmi")); expect(field("Nome").value).toBe("Motor"); expect(document.body.textContent).toContain("Ricarica");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))); expect(close).not.toHaveBeenCalled(); expect(document.body.textContent).toContain("Vuoi scartarle"); await click(button("Continua modifica"));
    await act(async () => root.unmount()); expect(document.activeElement).toBe(opener); opener.remove();
  });
  it("cambio progetto durante la lettura non installa dati vecchi", async () => {
    let resolve!: (snapshot: AlarmConfigurationSnapshot) => void; vi.mocked(desktopBridge.readAlarmConfiguration).mockReturnValue(new Promise((r) => { resolve = r; })); await mount();
    await act(async () => useEditorStore.setState({ project: { ...project, root: "C:/other" } })); await act(async () => resolve(initial())); expect(close).toHaveBeenCalled(); expect(desktopBridge.saveAlarmConfiguration).not.toHaveBeenCalled();
  });
});
