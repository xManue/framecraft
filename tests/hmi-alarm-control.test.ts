// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAlarmEngine, emptyAlarmCatalog, type AlarmCatalog } from "../runtime/alarm-engine.mjs";
import { createHmiAlarmControl } from "../src/core/hmiAlarmControl";
const catalog: AlarmCatalog = { ...emptyAlarmCatalog(), alarms: [{ id: "a", name: "Motor", text: "<script>fault</script>", tag: "Signal", className: "Alarm_CTH", priority: 1, area: "Zona 1", enabled: true, trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] };
const variables = [{ name: "Signal", dataType: "Bool", access: "read" }];
const button = (host: HTMLElement, name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === name)!;
afterEach(() => { document.body.replaceChildren(); });
describe("vista allarmi operativi", () => {
  it("i blocchi dell'elemento valgono anche per i comandi interni", () => {
    const parent = document.createElement("div"), host = document.createElement("div"); parent.append(host); document.body.append(parent); const engine = createAlarmEngine(catalog, variables), action = vi.fn(), control = createHmiAlarmControl(host, action);
    engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); control.update({ ...engine.snapshot(), actionsEnabled: true }); button(host, "Motor").click(); expect(button(host, "Prendi in visione").disabled).toBe(false);
    parent.setAttribute("inert", ""); button(host, "Prendi in visione").click(); expect(action).not.toHaveBeenCalled(); control.update({ ...engine.snapshot(), actionsEnabled: true }); expect(button(host, "Prendi in visione").disabled).toBe(true); control.dispose();
  });
  it("testi non eseguibili, comandi bloccati finché il server non autorizza", () => {
    const host = document.createElement("div"); document.body.append(host); const engine = createAlarmEngine(catalog, variables), action = vi.fn(); const control = createHmiAlarmControl(host, action);
    control.update({ ...engine.snapshot(), actionsEnabled: false }); expect(host.textContent).toContain("segnale non valido"); expect(host.querySelector("script")).toBeNull();
    engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); control.update({ ...engine.snapshot(), actionsEnabled: false }); button(host, "Motor").click();
    expect(button(host, "Prendi in visione").disabled).toBe(true); expect(host.textContent).toContain("servizio non autorizza"); expect(action).not.toHaveBeenCalled(); control.dispose();
  });
  it("presa visione locale lascia il guasto attivo, con valori e revisione esatti", async () => {
    const host = document.createElement("div"); document.body.append(host); const engine = createAlarmEngine(catalog, variables);
    engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); const action = vi.fn(async (command) => { engine.action(command, "Operatore"); control.update({ ...engine.snapshot(), actionsEnabled: true }); }); const control = createHmiAlarmControl(host, action);
    control.update({ ...engine.snapshot(), actionsEnabled: true }); button(host, "Motor").focus(); button(host, "Motor").click(); expect(document.activeElement).toBe(button(host, "Motor"));
    button(host, "Prendi in visione").click(); await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(engine.snapshot().rows[0]).toMatchObject({ active: true, acknowledged: true, pending: true }); expect(host.textContent).toContain("non è stato modificato"); control.dispose();
  });
  it("campione nuovo invalida la selezione; perdita servizio non permette comandi", () => {
    const host = document.createElement("div"); document.body.append(host); const engine = createAlarmEngine(catalog, variables), action = vi.fn(); const control = createHmiAlarmControl(host, action);
    engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); control.update({ ...engine.snapshot(), actionsEnabled: true }); button(host, "Motor").click(); expect(button(host, "Prendi in visione").disabled).toBe(false);
    engine.updateSample({ tag: "Signal", value: "0", qualityCode: 0 }); control.update({ ...engine.snapshot(), actionsEnabled: true }); expect(host.textContent).toContain("selezionalo di nuovo"); expect(button(host, "Prendi in visione").disabled).toBe(true);
    button(host, "Motor").click(); control.update(undefined, false); expect(host.textContent).toContain("non sono aggiornati"); expect(button(host, "Prendi in visione").disabled).toBe(true); expect(action).not.toHaveBeenCalled(); control.dispose();
  });
  it("filtri, storico e ripristino della bozza non usano innerHTML", () => {
    const host = document.createElement("div"); host.style.color = "red"; host.setAttribute("role", "grid"); host.dataset.hmiAlarmSource = "history"; host.dataset.hmiFilter = "AlarmClassName = 'Alarm_CTH'"; const original = document.createElement("span"); original.textContent = "bozza"; host.append(original); document.body.append(host);
    const engine = createAlarmEngine(catalog, variables); engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); const control = createHmiAlarmControl(host, vi.fn()); control.update({ ...engine.snapshot(), actionsEnabled: true });
    expect(host.textContent).toContain("Attivato"); expect(host.textContent).toContain("Storico della sessione"); expect(button(host, "Prendi in visione").hidden).toBe(true);
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!; search.value = "missing"; search.dispatchEvent(new Event("input")); expect(host.textContent).toContain("Nessun allarme corrispondente");
    control.dispose(); expect(host.firstChild).toBe(original); expect(host.style.color).toBe("red"); expect(host.getAttribute("role")).toBe("grid"); expect(host.hasAttribute("data-hmi-alarm-root")).toBe(false);
  });
  it("un filtro non supportato non viene ignorato silenziosamente", () => {
    const host = document.createElement("div"); host.dataset.hmiFilter = "malformed OR true"; const engine = createAlarmEngine(catalog, variables), control = createHmiAlarmControl(host, vi.fn());
    engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); control.update({ ...engine.snapshot(), actionsEnabled: true }); expect(host.textContent).toContain("Filtro non supportato"); expect(host.textContent).not.toContain("<script>fault"); control.dispose();
  });
});
