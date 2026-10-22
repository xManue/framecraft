// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmiAlarmPreview, type AlarmPreviewState } from "../src/core/hmiAlarmPreview";
import { emptyAlarmCatalog, type AlarmPreviewConfiguration } from "../src/core/hmiAlarms";
import { defaultHmiAlarmSummaryConfig, serializeHmiAlarmSummaryConfig } from "../src/core/hmiAlarmSummary";
import { createHmiAlarmPreviewSurface } from "../scripts/hmi-alarm-preview-surface.mjs";

const configuration: AlarmPreviewConfiguration = { catalog: { ...emptyAlarmCatalog(), classes: [{ name: "R", acknowledgment: "reset" }], alarms: [{ id: "alarm", name: "Motor", text: "Controlla motore", tag: "Signal", className: "R", priority: 10, area: "Linea", enabled: true, trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] }, variables: [{ name: "Signal", dataType: "Bool", access: "read" }] };
const controls: { dispose(): void }[] = [];
afterEach(() => { for (const control of controls.splice(0)) control.dispose(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function setup(config: AlarmPreviewConfiguration | null = configuration) {
  let state: AlarmPreviewState = { on: true, interactive: true, values: {}, status: {}, routes: ["/alarms"] }, current = true;
  const error = vi.fn(), navigate = vi.fn(), network = vi.fn(); vi.stubGlobal("fetch", network);
  document.body.innerHTML = '<div data-hmi-type="HmiAlarmIndicator" style="color:red"><span>Bozza indicatore</span></div><div data-hmi-type="HmiAlarmLine"><span>Bozza riga</span></div><div data-hmi-type="HmiAlarmControl" style="height:300px"><span>Bozza lista</span></div><button data-hmi-action="clear-alarm-log" title="Originale">Pulisci</button>';
  const host = document.querySelector<HTMLElement>('[data-hmi-type="HmiAlarmIndicator"]')!, original = host.firstChild;
  host.setAttribute("data-hmi-alarm-summary", serializeHmiAlarmSummaryConfig({ ...defaultHmiAlarmSummaryConfig(), pageRoute: "/alarms" }));
  const model = createHmiAlarmPreview(config ?? undefined, { state: () => state, current: () => current, error });
  const surface = createHmiAlarmPreviewSurface(document, { active: () => current && state.on && state.interactive, navigate, action: async (command, instanceId) => {
    try { model.action(command, instanceId); } finally { control.update(); }
  } });
  const control = { update() { surface.update(model.update(), state.on && current, state.routes); }, dispose() { model.dispose(); surface.dispose(); } };
  controls.push(control);
  return { control, model, host, original, error, navigate, network, state: () => state, set: (next: Partial<AlarmPreviewState>) => { state = { ...state, ...next }; }, retire: () => { current = false; control.update(); } };
}
const button = (text: string, scope: ParentNode = document) => [...scope.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === text)!;
describe("allarmi nella prova locale del pannello", () => {
  it("include la soglia PLC e valuta insieme la mappa di prova senza eventi intermedi", () => {
    const config: AlarmPreviewConfiguration = { catalog: { ...emptyAlarmCatalog(), alarms: [{ ...configuration.catalog.alarms[0], className: "Alarm_CTH", tag: "Value", trigger: { kind: "high", limit: { tag: "Limit" }, hysteresis: 0 } }] }, variables: ["Value", "Limit"].map(name => ({ name, dataType: "Real", access: "read" })) };
    const test = setup(config); test.set({ values: { Value: "10" } }); test.control.update(); expect(test.model.update()!.rows[0]).toMatchObject({ active: null, quality: "unknown" });
    test.set({ values: { Value: "10", Limit: "15" } }); test.control.update(); expect(test.model.update()!.rows[0]).toMatchObject({ active: false, quality: "good" });
    test.set({ values: { Value: "20", Limit: "25" } }); test.control.update(); expect(test.model.update()!.history).toEqual([]);
    test.set({ values: { Value: "20", Limit: "10" } }); test.control.update(); expect(test.model.update()!.rows[0].active).toBe(true);
    test.set({ values: { Value: "0" } }); test.control.update(); expect(test.model.update()!.rows[0]).toMatchObject({ active: true, quality: "unknown" }); expect(test.model.update()!.history).toHaveLength(1);
    expect(test.network).not.toHaveBeenCalled();
  });
  it("non monta in Modifica e non interpreta un valore mancante come Good o zero", () => {
    const test = setup(); test.set({ interactive: false, values: {} }); test.control.update(); expect(test.host.firstChild).toBe(test.original); expect(document.querySelector('[data-hmi-alarm-preview-note]')).toBeNull();
    test.set({ interactive: true }); test.control.update(); expect(test.host.textContent).toContain("sconosciuti"); expect(test.host.querySelector('[data-hmi-alarm-summary-state="normal"]')).toBeNull(); expect(test.host.textContent).toContain("SIMULAZIONE"); expect(button("Pulisci").disabled).toBe(true); expect(test.network).not.toHaveBeenCalled();
  });
  it("presa visione, rientro e conferma sono locali e non cambiano il valore del segnale", async () => {
    const test = setup(); test.set({ values: { Signal: "1" } }); test.control.update(); expect(test.host.textContent).toContain("1 · pendenti"); button("Mostra allarmi").click(); const popup = document.querySelector<HTMLElement>('[data-hmi-alarm-popup]')!;
    button("Motor", popup).click(); button("Prendi in visione", popup).click(); await vi.waitFor(() => expect(popup.textContent).toContain("Presa visione registrata")); expect(test.host.textContent).toContain("0 da prendere in visione"); expect(test.state().values.Signal).toBe("1");
    test.set({ values: { Signal: "0" }, status: { Signal: { qualityCode: 0 } } }); test.control.update(); expect(test.host.textContent).toContain("1 attivi"); expect(test.host.textContent).toContain("segnali non validi");
    test.set({ status: { Signal: { qualityCode: 192 } } }); test.control.update(); expect(test.host.textContent).toContain("1 da confermare"); button("Motor", popup).click(); button("Conferma rientro", popup).click(); await vi.waitFor(() => expect(test.host.textContent).toContain("0 · pendenti")); expect(test.network).not.toHaveBeenCalled();
  });
  it("ricontrolla gli ultimi valori anche quando il click arriva prima del prossimo render", async () => {
    const test = setup(); test.set({ values: { Signal: "1" } }); test.control.update(); const list = document.querySelector<HTMLElement>('[data-hmi-type="HmiAlarmControl"]')!; button("Motor", list).click();
    test.set({ values: { Signal: "0" } }); button("Prendi in visione", list).click(); await vi.waitFor(() => expect(list.textContent).toContain("L'allarme è cambiato")); expect(list.textContent).not.toContain("Presa visione registrata"); test.control.update(); expect(test.host.textContent).toContain("1 da prendere in visione");
  });
  it("tornare a Modifica ripristina i nodi e chiude il popup; lo stato resta finché la prova non viene fermata", async () => {
    const test = setup(); test.set({ values: { Signal: "1" } }); test.control.update(); button("Mostra allarmi").click(); const popup = document.querySelector<HTMLElement>('[data-hmi-alarm-popup]')!; button("Motor", popup).click(); button("Prendi in visione", popup).click(); await vi.waitFor(() => expect(test.host.textContent).toContain("0 da prendere in visione"));
    test.set({ interactive: false }); test.control.update(); expect(test.host.firstChild).toBe(test.original); expect(test.host.style.color).toBe("red"); expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull(); expect(button("Pulisci").disabled).toBe(false); expect(button("Pulisci").title).toBe("Originale");
    test.set({ interactive: true }); test.control.update(); expect(test.host.textContent).toContain("0 da prendere in visione"); test.set({ on: false }); test.control.update(); test.set({ on: true }); test.control.update(); expect(test.host.textContent).toContain("1 da prendere in visione");
  });
  it("HMR e nuove istanze ricevono lo stato senza perdere la bozza; i filtri cambiano senza loop", async () => {
    const test = setup(); test.set({ values: { Signal: "1" } }); test.control.update(); button("Mostra allarmi").click(); test.host.remove(); const replacement = document.createElement("div"); replacement.dataset.hmiType = "HmiAlarmIndicator"; replacement.textContent = "Nuova bozza"; document.body.append(replacement);
    await vi.waitFor(() => expect(replacement.textContent).toContain("1 · pendenti")); expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull(); replacement.setAttribute("data-hmi-alarm-summary", serializeHmiAlarmSummaryConfig({ ...defaultHmiAlarmSummaryConfig(), areas: ["Missing"] })); await vi.waitFor(() => expect(replacement.textContent).toContain("Nessun allarme configurato per questi filtri"));
    replacement.replaceChildren(document.createTextNode("Bozza aggiornata sullo stesso nodo")); replacement.style.color = "cyan";
    await vi.waitFor(() => expect(replacement.textContent).toContain("Nessun allarme configurato per questi filtri"));
    test.control.dispose(); expect(replacement.textContent).toBe("Bozza aggiornata sullo stesso nodo"); expect(replacement.style.color).toBe("cyan");
  });
  it("permessi e sessione cessata impediscono azioni e chiudono il dettaglio", async () => {
    const test = setup(); test.set({ values: { Signal: "1" } }); test.control.update(); button("Mostra allarmi").click(); test.host.setAttribute("data-fc-user-requires", "maintenance"); await vi.waitFor(() => expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull()); expect(button("Mostra allarmi").disabled).toBe(true);
    test.host.setAttribute("data-fc-user-granted", "true"); await vi.waitFor(() => expect(button("Mostra allarmi").disabled).toBe(false)); button("Mostra allarmi").click(); const popup = document.querySelector<HTMLElement>('[data-hmi-alarm-popup]')!; button("Motor", popup).click(); const command = button("Prendi in visione", popup); test.retire(); command.click(); expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull(); expect(test.network).not.toHaveBeenCalled(); expect(test.model.update()).toBeUndefined(); expect(test.host.firstChild).toBe(test.original);
  });
  it("navigazione verificata non esegue prese visione o comandi", () => {
    const test = setup(); test.set({ values: { Signal: "1" } }); test.control.update(); button("Mostra allarmi").click(); button("Apri pagina collegata").click(); expect(test.navigate).toHaveBeenCalledWith("/alarms"); expect(test.host.textContent).toContain("1 da prendere in visione"); expect(test.network).not.toHaveBeenCalled();
  });
  it("catalogo non disponibile non finge valori normali", () => {
    const test = setup(null); test.control.update(); expect(test.host.textContent).toContain("non disponibile"); expect(test.host.querySelector('[data-hmi-alarm-summary-state="normal"]')).toBeNull();
  });
});
