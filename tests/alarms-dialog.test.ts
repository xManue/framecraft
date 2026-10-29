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
const field = (name: string) => [...document.querySelectorAll<HTMLLabelElement>("label")].find(node => node.textContent === name)?.control as HTMLInputElement | HTMLSelectElement;
async function click(node: HTMLElement) { await act(async () => node.click()); }
async function change(name: string, value: string) { const node = field(name); expect(node).toBeTruthy(); await act(async () => { Object.getOwnPropertyDescriptor(node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }
async function mount(component = createElement(AlarmsDialog, { onClose: close })) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(component)); }
async function createAlarm() { await click(button("Nuovo allarme")); await change("Nome", "Motor"); await change("Messaggio operatore", "Controlla motore"); await change("Segnale PLC", "Signal"); }
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks(); useEditorStore.setState({ project, loading: false, dirty: false, previewRestarting: false, previewUrl: undefined, consoleEntries: [], history: [], future: [], multiSelection: [] }); vi.mocked(desktopBridge.readAlarmConfiguration).mockResolvedValue(initial()); vi.mocked(desktopBridge.saveAlarmConfiguration).mockImplementation(async (_root, expected, source) => ({ ...expected, source })); });
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); vi.restoreAllMocks(); });
describe("Allarmi: configurazione e prova guidata", () => {
  it("abilita la sospensione con un limite esplicito e prova revisione/conferma senza PLC", async () => {
    await mount(); await createAlarm(); await change("Eventi conservati nello storico di sessione", "100");
    const enable = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(node => node.closest("label")?.textContent?.includes("Consenti sospensione e ripristino"))!; expect(enable.checked).toBe(false); await click(enable);
    await change("Durata massima della sospensione (minuti)", "0"); expect(button("Salva allarmi").disabled).toBe(true); await change("Durata massima della sospensione (minuti)", "5");
    await change("Valore del segnale selezionato", "1"); await click(button("Applica segnale di prova")); await click(button("Motor")); await change("Durata massima (minuti)", "2"); await change("Motivo della sospensione o del ripristino", "Prova manutenzione"); await click(button("Rivedi sospensione")); expect(document.body.textContent).toContain("Conferma sospensione di Motor"); expect(document.body.textContent).toContain("Segnalazioni sospese: 0");
    await click(button("Conferma operazione allarme")); expect(document.body.textContent).toContain("Segnalazioni sospese: 1"); expect(desktopBridge.saveAlarmConfiguration).not.toHaveBeenCalled(); await click(button("Salva allarmi"));
    expect(JSON.parse(vi.mocked(desktopBridge.saveAlarmConfiguration).mock.calls[0][2]).shelving).toEqual({ enabled: true, maxMinutes: 5 });
  });
  it("configura e prova una soglia PLC senza salvare, collegarsi o inventare un campione", async () => {
    const analog = ["Pressure", "Limit"].map(name => ({ ...variables[0], name, dataType: "Real" }));
    vi.mocked(desktopBridge.readAlarmConfiguration).mockResolvedValue({ ...initial(), plc: JSON.stringify({ version: 1, variables: [...analog, ...variables] }) });
    const network = vi.spyOn(globalThis, "fetch"); await mount(); await click(button("Nuovo allarme")); await change("Nome", "Pressione"); await change("Messaggio operatore", "Controlla pressione"); await change("Segnale PLC", "Pressure"); await change("Attivazione", "high-equal"); await change("Origine della soglia", "tag");
    expect(button("Salva allarmi").disabled).toBe(true); expect([...field("Segnale PLC della soglia").querySelectorAll("option")].some(option => option.value === "Signal")).toBe(false);
    await change("Segnale PLC della soglia", "Limit"); await change("Isteresi di rientro", "2"); await change("Valore del segnale selezionato", "10"); await click(button("Applica segnale di prova"));
    expect(document.querySelector('[data-hmi-type="HmiAlarmIndicator"]')!.textContent).toContain("sconosciuti");
    await change("Valore della soglia PLC di prova", "10"); await click(button("Applica soglia di prova")); expect(document.body.textContent).toContain("Attivo");
    await change("Qualità della soglia", "0"); await change("Valore della soglia PLC di prova", "100"); await click(button("Applica soglia di prova")); expect(document.body.textContent).toContain("Soglia PLC non disponibile"); expect(document.body.textContent).toContain("Attivo");
    expect(network).not.toHaveBeenCalled(); expect(desktopBridge.saveAlarmConfiguration).not.toHaveBeenCalled(); await click(button("Salva allarmi"));
    expect(JSON.parse(vi.mocked(desktopBridge.saveAlarmConfiguration).mock.calls[0][2]).alarms[0].trigger).toEqual({ kind: "high-equal", limit: { tag: "Limit" }, hysteresis: 2 });
  });
  it("uguaglianza mostra il confronto esatto e azzera esplicitamente l’isteresi", async () => {
    vi.mocked(desktopBridge.readAlarmConfiguration).mockResolvedValue({ ...initial(), plc: JSON.stringify({ version: 1, variables: [{ ...variables[0], dataType: "Real" }] }) });
    await mount(); await createAlarm(); await change("Attivazione", "high"); await change("Isteresi di rientro", "3"); await change("Attivazione", "equal");
    expect(field("Isteresi di rientro")).toBeUndefined(); expect(document.body.textContent).toContain("Confronto numerico esatto"); await click(button("Salva allarmi")); expect(JSON.parse(vi.mocked(desktopBridge.saveAlarmConfiguration).mock.calls[0][2]).alarms[0].trigger).toEqual({ kind: "equal", limit: 0, hysteresis: 0 });
    await change("Origine della soglia", "tag"); await change("Origine della soglia", "fixed"); expect(field("Soglia").value).toBe(""); expect(button("Salva allarmi").disabled).toBe(true);
  });
  it("abilita l’archivio su disco solo su scelta esplicita e salva insieme ai limiti", async () => {
    await mount(); const checkbox = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(node => node.closest("label")?.textContent?.includes("Conserva gli eventi anche dopo il riavvio"))!; expect(checkbox.checked).toBe(false);
    await click(checkbox); await change("Limite eventi nell’archivio su disco", "999"); expect(button("Salva allarmi").disabled).toBe(true); await change("Limite eventi nell’archivio su disco", "12000"); await click(button("Salva allarmi"));
    expect(JSON.parse(vi.mocked(desktopBridge.saveAlarmConfiguration).mock.calls[0][2]).archive).toEqual({ enabled: true, maxRecords: 12000 }); expect(document.body.textContent).toContain("La prova locale qui sotto non scrive nell’archivio");
  });
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
    for (const input of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type="checkbox"]), select')) expect(input.labels?.length).toBeGreaterThan(0);
  });
  it("prova locale del motore senza rete, rientro distinto dalla presa visione", async () => {
    await mount(); await createAlarm();
    const indicator = document.querySelector<HTMLElement>('[data-hmi-type="HmiAlarmIndicator"]')!, line = document.querySelector<HTMLElement>('[data-hmi-type="HmiAlarmLine"]')!;
    expect(indicator.textContent).toContain("sconosciuti"); expect(indicator.querySelector('[data-hmi-alarm-summary-state="normal"]')).toBeNull();
    await change("Valore del segnale selezionato", "1"); await click(button("Applica segnale di prova"));
    expect(indicator.textContent).toContain("1 · pendenti"); expect(line.textContent).toContain("Controlla motore"); expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull();
    expect(document.body.textContent).toContain("Attivo"); await click(button("Motor")); await click(button("Prendi in visione")); expect(document.body.textContent).toContain("preso in visione");
    expect(indicator.textContent).toContain("0 da prendere in visione");
    await change("Valore del segnale selezionato", "0"); await change("Qualità del segnale", "0"); await click(button("Applica segnale di prova")); expect(document.body.textContent).toContain("segnale non valido"); expect(document.body.textContent).toContain("Attivo"); expect(line.textContent).toContain("Controlla motore");
    await change("Qualità del segnale", "192"); await click(button("Applica segnale di prova")); expect(document.body.textContent).toContain("Nessun allarme corrispondente"); expect(indicator.textContent).toContain("segnali validi"); expect(indicator.textContent).toContain("0 · pendenti"); expect(line.textContent).not.toContain("Controlla motore"); expect(desktopBridge.saveAlarmConfiguration).not.toHaveBeenCalled();
  });
  it("JSON invalido non si mostra grezzo né si sovrascrive", async () => {
    vi.mocked(desktopBridge.readAlarmConfiguration).mockResolvedValue({ ...initial(), source: '{"secret":"NEVER_PRINT_ME' }); await mount();
    expect(document.body.textContent).toContain("JSON allarmi non valido"); expect(document.body.textContent).not.toContain("NEVER_PRINT_ME"); expect(desktopBridge.saveAlarmConfiguration).not.toHaveBeenCalled();
  });
  it("un file PLC vuoto blocca la prova e non conserva una configurazione precedente", async () => {
    useEditorStore.getState().installAlarmPreviewConfiguration(project, initial());
    expect(useEditorStore.getState().alarmPreviewConfiguration).toBeDefined();
    vi.mocked(desktopBridge.readAlarmConfiguration).mockResolvedValue({ ...initial(), plc: "" }); await mount();
    expect(button("Riprova lettura")).toBeDefined();
    expect(useEditorStore.getState().alarmPreviewConfiguration).toBeUndefined();
    expect(desktopBridge.saveAlarmConfiguration).not.toHaveBeenCalled();
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
