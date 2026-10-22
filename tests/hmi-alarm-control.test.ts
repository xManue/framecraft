// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAlarmEngine, emptyAlarmCatalog, type AlarmCatalog } from "../runtime/alarm-engine.mjs";
import { createHmiAlarmControl } from "../src/core/hmiAlarmControl";
const catalog: AlarmCatalog = { ...emptyAlarmCatalog(), alarms: [{ id: "a", name: "Motor", text: "<script>fault</script>", tag: "Signal", className: "Alarm_CTH", priority: 1, area: "Zona 1", enabled: true, trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] };
const variables = [{ name: "Signal", dataType: "Bool", access: "read" }];
const button = (host: HTMLElement, name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === name)!;
afterEach(() => { document.body.replaceChildren(); });
describe("vista allarmi operativi", () => {
  it("filtri richiudibili, azioni pertinenti e paginazione solo quando necessaria", () => {
    const host = document.createElement("div"); document.body.append(host); const c = emptyAlarmCatalog(); c.alarms = Array.from({ length: 101 }, (_, index) => ({ ...catalog.alarms[0], id: "a" + index, tag: "Signal" + index }));
    const engine = createAlarmEngine(c, c.alarms.map(item => ({ ...variables[0], name: item.tag }))); engine.updateSamples(c.alarms.map(item => ({ tag: item.tag, value: "1", qualityCode: 192 })));
    const styles = document.head.querySelectorAll("style").length, control = createHmiAlarmControl(host, vi.fn()); control.update({ ...engine.snapshot(), actionsEnabled: true });
    const filters = [...host.querySelectorAll("details")].find(node => node.querySelector("summary")?.textContent === "Filtra allarmi")!; expect(filters.open).toBe(false); expect(button(host, "Successivi").hidden).toBe(false); expect(button(host, "Conferma rientro").hidden).toBe(true);
    filters.open = true; button(host, "Successivi").click(); expect(host.querySelectorAll("tbody tr")).toHaveLength(1); expect(filters.open).toBe(true);
    host.querySelector<HTMLInputElement>('input[type="search"]')!.value = "a100"; host.querySelector<HTMLInputElement>('input[type="search"]')!.dispatchEvent(new Event("input")); expect(button(host, "Successivi").hidden).toBe(true); expect(host.querySelector('td[data-alarm-column="Messaggio"]')).not.toBeNull();
    control.dispose(); control.dispose(); expect(document.head.querySelectorAll("style")).toHaveLength(styles); expect(host.style.containerType).toBe("");
  });
  it("rende la causa del segnale non valido consultabile anche senza mouse o tooltip", () => {
    const host = document.createElement("div"); document.body.append(host); const engine = createAlarmEngine(catalog, variables), control = createHmiAlarmControl(host, vi.fn());
    engine.updateSample({ tag: "Signal", value: "0", qualityCode: 0 }); control.update({ ...engine.snapshot(), actionsEnabled: false });
    const detail = host.querySelector<HTMLDetailsElement>("tbody details")!; expect(detail).not.toBeNull(); expect(detail.querySelector("summary")?.textContent).toContain("Problema del segnale"); expect(detail.querySelector("p")?.textContent).toContain("Controlla connessione"); expect(host.querySelector("script")).toBeNull();
    engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); control.update({ ...engine.snapshot(), actionsEnabled: false }); expect(host.querySelector("tbody details")).toBeNull(); control.dispose();
  });
  it("la selezione nascosta da ricerca o filtro esterno non autorizza azioni", () => {
    const host = document.createElement("div"); document.body.append(host); const engine = createAlarmEngine(catalog, variables), action = vi.fn(); let included = true;
    const control = createHmiAlarmControl(host, action, () => included);
    engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); control.update({ ...engine.snapshot(), actionsEnabled: true }); button(host, "Motor").click();
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!; search.value = "missing"; search.dispatchEvent(new Event("input"));
    expect(button(host, "Prendi in visione").disabled).toBe(true); button(host, "Prendi in visione").click(); expect(action).not.toHaveBeenCalled();
    search.value = ""; search.dispatchEvent(new Event("input")); expect(button(host, "Prendi in visione").disabled).toBe(false);
    included = false; control.update({ ...engine.snapshot(), actionsEnabled: true }); expect(button(host, "Prendi in visione").disabled).toBe(true); expect(host.querySelectorAll("select option")).toHaveLength(1); control.dispose();
  });
  it.each(["visibility", "display", "pointerEvents"])("il blocco CSS %s del contenitore impedisce anche azioni programmatiche", (property) => {
    const parent = document.createElement("div"), host = document.createElement("div"); parent.append(host); document.body.append(parent); const engine = createAlarmEngine(catalog, variables), action = vi.fn(), control = createHmiAlarmControl(host, action);
    engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); control.update({ ...engine.snapshot(), actionsEnabled: true }); button(host, "Motor").click();
    Object.assign(parent.style, { [property]: property === "visibility" ? "hidden" : "none" }); button(host, "Prendi in visione").click(); expect(action).not.toHaveBeenCalled(); control.update({ ...engine.snapshot(), actionsEnabled: true }); expect(button(host, "Prendi in visione").disabled).toBe(true); control.dispose();
  });
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
    expect(engine.snapshot().rows[0]).toMatchObject({ active: true, acknowledged: true, pending: true }); expect(host.textContent).toContain("non è stato modificato");
    control.update({ ...engine.snapshot(), actionsEnabled: true }); expect(host.textContent).toContain("Presa visione registrata");
    button(host, "Motor").click(); expect(host.textContent).not.toContain("Presa visione registrata"); control.dispose();
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
