// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readAlarmConfiguration: vi.fn() } }));
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { useEditorStore } from "../src/state/editorStore";
import { emptyAlarmCatalog, type AlarmConfigurationSnapshot } from "../src/core/hmiAlarms";
const initial = useEditorStore.getState(), project = { root: "C:/local-panel", files: [] } as never;
const snapshot = (name = "Motor"): AlarmConfigurationSnapshot => ({ generation: 1, plc: JSON.stringify({ version: 1, variables: [{ name: "Signal", dataType: "Bool", access: "read", address: "PRIVATE_LOCAL_ADDRESS" }] }), source: JSON.stringify({ ...emptyAlarmCatalog(), alarms: [{ id: "a", name, text: "Controlla", tag: "Signal", className: "Alarm_CTH", priority: 1, enabled: true, trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] }) });
beforeEach(() => { vi.clearAllMocks(); useEditorStore.setState({ project, alarmPreviewConfiguration: undefined, consoleEntries: [] }); });
afterEach(() => useEditorStore.setState(initial, true));
describe("catalogo protetto della prova allarmi", () => {
  it("un file PLC vuoto non equivale a un file assente", () => {
    useEditorStore.getState().installAlarmPreviewConfiguration(project, { generation: 1, plc: "", source: null });
    expect(useEditorStore.getState().alarmPreviewConfiguration).toBeUndefined();
    expect(JSON.stringify(useEditorStore.getState().consoleEntries)).toContain("Pannello → Allarmi");
  });
  it("carica allarmi e tipi dalla stessa coppia di file, senza conservare indirizzi macchina nel modello", async () => {
    vi.mocked(desktopBridge.readAlarmConfiguration).mockResolvedValue(snapshot()); await useEditorStore.getState().refreshAlarmPreviewConfiguration(); const config = useEditorStore.getState().alarmPreviewConfiguration!;
    expect(config.catalog.alarms[0].name).toBe("Motor"); expect(config.variables).toEqual([{ name: "Signal", dataType: "Bool", access: "read" }]); expect(JSON.stringify(config)).not.toContain("PRIVATE_LOCAL_ADDRESS");
  });
  it("non applica una lettura del progetto precedente, anche se la cartella ha lo stesso nome", async () => {
    let resolve!: (value: AlarmConfigurationSnapshot) => void; vi.mocked(desktopBridge.readAlarmConfiguration).mockReturnValue(new Promise((r) => { resolve = r; })); const pending = useEditorStore.getState().refreshAlarmPreviewConfiguration();
    useEditorStore.setState({ project: { root: "C:/local-panel", files: [] } as never }); resolve(snapshot()); await pending; expect(useEditorStore.getState().alarmPreviewConfiguration).toBeUndefined(); expect(useEditorStore.getState().consoleEntries).toEqual([]);
  });
  it("l'ultima richiesta vince; un salvataggio invalida le letture pendenti", async () => {
    const resolve: ((value: AlarmConfigurationSnapshot) => void)[] = []; vi.mocked(desktopBridge.readAlarmConfiguration).mockImplementation(() => new Promise((r) => resolve.push(r)));
    const first = useEditorStore.getState().refreshAlarmPreviewConfiguration(), second = useEditorStore.getState().refreshAlarmPreviewConfiguration(); resolve[1](snapshot("Nuovo")); await second; resolve[0](snapshot("Vecchio")); await first; expect(useEditorStore.getState().alarmPreviewConfiguration?.catalog.alarms[0].name).toBe("Nuovo");
    const late = useEditorStore.getState().refreshAlarmPreviewConfiguration(); useEditorStore.getState().installAlarmPreviewConfiguration(project, snapshot("Salvato")); resolve[2](snapshot("Prima del salvataggio")); await late; expect(useEditorStore.getState().alarmPreviewConfiguration?.catalog.alarms[0].name).toBe("Salvato");
  });
  it("JSON invalido disabilita la prova senza fallback o log del contenuto privato", async () => {
    vi.mocked(desktopBridge.readAlarmConfiguration).mockResolvedValue({ ...snapshot(), source: '{"password":"PRIVATE_JSON' }); await useEditorStore.getState().refreshAlarmPreviewConfiguration(); expect(useEditorStore.getState().alarmPreviewConfiguration).toBeUndefined(); expect(JSON.stringify(useEditorStore.getState().consoleEntries)).toContain("Pannello → Allarmi"); expect(JSON.stringify(useEditorStore.getState().consoleEntries)).not.toContain("PRIVATE_JSON");
  });
  it("nessun file usa catalogo vuoto; lettura uguale non resetta il motore; errori nativi danno un rimedio", async () => {
    const empty = { generation: 1, source: null, plc: null }; vi.mocked(desktopBridge.readAlarmConfiguration).mockResolvedValue(empty); await useEditorStore.getState().refreshAlarmPreviewConfiguration(); const old = useEditorStore.getState().alarmPreviewConfiguration; await useEditorStore.getState().refreshAlarmPreviewConfiguration(); expect(useEditorStore.getState().alarmPreviewConfiguration).toBe(old); expect(old?.catalog.alarms).toEqual([]);
    vi.mocked(desktopBridge.readAlarmConfiguration).mockRejectedValue(new Error("PRIVATE_NATIVE_ERROR")); await useEditorStore.getState().refreshAlarmPreviewConfiguration(); expect(useEditorStore.getState().alarmPreviewConfiguration).toBeUndefined(); expect(JSON.stringify(useEditorStore.getState().consoleEntries)).toContain("app desktop aggiornata"); expect(JSON.stringify(useEditorStore.getState().consoleEntries)).not.toContain("PRIVATE_NATIVE_ERROR");
  });
});
