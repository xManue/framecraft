// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { defaultAlarmColumns, parseAlarmColumns, serializeAlarmColumns, alarmColumnValue, alarmColumnsAttribute } from "../scripts/hmi-alarm-views.mjs";
import { createHmiAlarmControl } from "../src/core/hmiAlarmControl";
import { createAlarmEngine, emptyAlarmCatalog } from "../runtime/alarm-engine.mjs";
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(close => close()); document.body.replaceChildren(); localStorage.clear(); });
const button = (host: HTMLElement, label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label)!;
const field = <T extends HTMLElement = HTMLInputElement>(host: HTMLElement, label: string) => host.querySelector<T>('[aria-label="' + label + '"]')!;
function fixture(raw?: string) {
  const host = document.createElement("div"); host.textContent = "Bozza"; if (raw !== undefined) host.setAttribute(alarmColumnsAttribute, raw); document.body.append(host);
  const engine = createAlarmEngine({ ...emptyAlarmCatalog(), classes: [{ name: "Guasto", acknowledgment: "reset" }], alarms: [{ id: "motor", name: "Motore", text: "<img src=x onerror=alert(1)>", className: "Guasto", priority: 4, area: "Linea", enabled: true, tag: "Signal", trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] }, [{ name: "Signal", access: "read", dataType: "Bool" }], { now: () => 1760000000000 });
  engine.updateSample({ tag: "Signal", value: true, qualityCode: 192 }); const action = vi.fn(async () => {}); let operator = "one";
  const control = createHmiAlarmControl(host, action, undefined, { namespace: "7618fc24-79c4-4657-9139-56ad520cb1fa", operator: () => ({ id: operator }) }); control.update({ ...engine.snapshot(), actionsEnabled: true }); cleanup.push(() => control.dispose());
  return { host, engine, action, control, user(id: string) { operator = id; window.dispatchEvent(new CustomEvent("framecraft:user-changed")); } };
}
it("validates a complete schema and preserves the five default visible columns", () => {
  const initial = defaultAlarmColumns(); expect(parseAlarmColumns(serializeAlarmColumns(initial))).toEqual(initial); expect(initial.columns.filter(item => item.visible).map(item => item.key)).toEqual(["name", "state", "message", "area", "time"]); initial.columns[0].label = "Changed"; expect(defaultAlarmColumns().columns[0].label).toBe("Allarme");
});
it("rejects hidden identity/state, duplicate fields, unsafe headers, excessive widths and future versions", () => {
  const changes: ((c: ReturnType<typeof defaultAlarmColumns>) => void)[] = [c => { c.columns[0].visible = false; }, c => { c.columns[1].visible = false; }, c => { c.columns[1].key = "name"; }, c => { c.columns[0].label = "\u202eHidden"; }, c => { c.columns[0].label = " "; }, c => { c.columns[0].width = 63; }, c => { c.columns[0].width = 64.5; }, c => { c.columns[0].width = 1201; }];
  for (const change of changes) { const value = defaultAlarmColumns(); change(value); expect(() => parseAlarmColumns(value)).toThrow("Colonne allarmi non valide"); }
  for (const raw of ['{"version":2}', 'PRIVATE_BROKEN_JSON', ' '.repeat(12001), { ...defaultAlarmColumns(), sql: "select" }]) { try { parseAlarmColumns(raw); throw new Error("accepted"); } catch (error) { expect(String(error)).not.toContain("PRIVATE_BROKEN_JSON"); expect(String(error)).toContain("Colonne allarmi non valide"); } }
});
it("renders configured order, labels, widths and data without turning headers into HTML", () => {
  const config = defaultAlarmColumns(); config.timeZone = "UTC"; config.columns.find(item => item.key === "priority")!.visible = true; config.columns.find(item => item.key === "message")!.visible = false; const [state] = config.columns.splice(1, 1); state.label = "<b>Condizione</b>"; config.columns.unshift(state);
  const { host } = fixture(serializeAlarmColumns(config)); expect([...host.querySelectorAll('thead th')].map(node => node.textContent)).toEqual(["<b>Condizione</b>", "Allarme", "Zona", "Ora", "Priorità"]); expect(host.querySelector("b,img")).toBeNull(); expect(host.querySelector('[data-alarm-key="priority"]')!.textContent).toBe("Priorità"); expect(host.querySelector('tbody [data-alarm-key="priority"]')!.textContent).toBe("4"); expect(host.querySelector('tbody [data-alarm-key="time"]')!.textContent).toContain(" UTC"); expect((host.querySelector("col") as HTMLElement).style.width).toBe("150px");
});
it("keeps diagnostics accessible when the message is hidden or moved", () => {
  const config = defaultAlarmColumns(); config.columns.find(item => item.key === "message")!.visible = false; const test = fixture(serializeAlarmColumns(config)); test.engine.updateSample({ tag: "Signal", value: true, qualityCode: 0 }); test.control.update({ ...test.engine.snapshot(), actionsEnabled: true }); expect(test.host.querySelector('tbody [data-alarm-key="state"] details')).not.toBeNull();
});
it("changes runtime columns only after Apply, keeps row selection tied to its ID and leaves source intact", async () => {
  const test = fixture(); button(test.host, "Motore").click(); const picker = field<HTMLSelectElement>(test.host, "Colonna da configurare"); picker.value = "name"; picker.dispatchEvent(new Event("change")); field<HTMLInputElement>(test.host, "Titolo della colonna").value = "Motore scelto"; field<HTMLSelectElement>(test.host, "Posizione della colonna").value = "2";
  expect(test.host.querySelector("thead th")!.textContent).toBe("Allarme"); button(test.host, "Applica visualizzazione").click(); expect(test.host.querySelectorAll("thead th")[2].textContent).toBe("Motore scelto"); expect(test.host.getAttribute(alarmColumnsAttribute)).toBeNull(); expect(test.action).not.toHaveBeenCalled(); button(test.host, "Prendi in visione").click(); await Promise.resolve(); expect(test.action).toHaveBeenCalledWith(expect.objectContaining({ alarmId: "motor", action: "acknowledge" }));
});
it("preserves an invalid runtime draft instead of changing the current columns", () => {
  const test = fixture(); field<HTMLInputElement>(test.host, "Larghezza colonna (px)").value = "63"; button(test.host, "Applica visualizzazione").click(); expect(test.host.textContent).toContain("Colonne allarmi non valide"); expect((test.host.querySelector('col') as HTMLElement).style.width).toBe("180px");
});
it("restores project columns on reset and actual user changes, but not on the same user's refresh", () => {
  const test = fixture(); field<HTMLInputElement>(test.host, "Titolo della colonna").value = "Personalizzato"; button(test.host, "Applica visualizzazione").click(); test.user("one"); expect(test.host.querySelector("thead th")!.textContent).toBe("Personalizzato"); test.user("two"); expect(test.host.querySelector("thead th")!.textContent).toBe("Allarme");
  field<HTMLInputElement>(test.host, "Titolo della colonna").value = "Altro"; button(test.host, "Applica visualizzazione").click(); button(test.host, "Ripristina colonne del progetto").click(); expect(test.host.querySelector("thead th")!.textContent).toBe("Allarme");
});
it("shows corrupt source configuration explicitly and prevents commands even from an old button", async () => {
  const test = fixture(); button(test.host, "Motore").click(); const ack = button(test.host, "Prendi in visione"); test.host.setAttribute(alarmColumnsAttribute, "PRIVATE_BROKEN_JSON"); ack.click(); expect(test.action).not.toHaveBeenCalled(); await Promise.resolve(); expect(test.host.textContent).toContain("comandi sono bloccati"); expect(test.host.textContent).not.toContain("PRIVATE_BROKEN_JSON"); expect(button(test.host, "Prendi in visione").disabled).toBe(true); expect(test.host.getAttribute(alarmColumnsAttribute)).toBe("PRIVATE_BROKEN_JSON");
});
it("observes source edits without a new sample and disconnects the observer on disposal", async () => {
  const test = fixture(), config = defaultAlarmColumns(); config.columns[0].label = "Dal progetto"; test.host.setAttribute(alarmColumnsAttribute, serializeAlarmColumns(config)); await Promise.resolve(); expect(test.host.querySelector("thead th")!.textContent).toBe("Dal progetto"); test.control.dispose(); test.host.removeAttribute(alarmColumnsAttribute); await Promise.resolve(); expect(test.host.textContent).toBe("Bozza"); expect(test.host.hasAttribute("data-hmi-alarm-root")).toBe(false);
});
it("blocks runtime layout changes during command review and respects inherited interaction gates", () => {
  const test = fixture(); button(test.host, "Più allarmi").click(); button(test.host, "Scegli solo questa pagina").click(); button(test.host, "Rivedi presa visione").click(); expect(button(test.host, "Applica visualizzazione").disabled).toBe(true); expect(field<HTMLInputElement>(test.host, "Titolo della colonna").disabled).toBe(true);
  button(test.host, "Torna alla selezione").click(); field<HTMLInputElement>(test.host, "Titolo della colonna").value = "Blocked"; test.host.setAttribute("aria-disabled", "true"); button(test.host, "Applica visualizzazione").click(); expect(test.host.querySelector("thead th")!.textContent).toBe("Allarme"); expect(test.action).not.toHaveBeenCalled();
});
it("does not fabricate live quality and acknowledgment states for historical events", () => {
  const test = fixture(), event = test.engine.snapshot().history[0]; expect(alarmColumnValue("quality", event, true, "Attivato", "UTC")).toBe("Non registrata"); expect(alarmColumnValue("acknowledged", event, true, "Attivato", "UTC")).toContain("Non registrata"); expect(alarmColumnValue("clearedAt", event, true, "Attivato", "UTC")).toContain("Non registrato"); expect(alarmColumnValue("time", event, true, "Attivato", "UTC")).toContain(" UTC");
  const pending = test.engine.snapshot().rows[0]; expect(alarmColumnValue("acknowledged", pending, false, "Attivo", "UTC")).toBe("Non registrata"); expect(alarmColumnValue("confirmed", { ...pending, occurrence: undefined }, false, "Sconosciuto", "UTC")).toBe("Nessuna occorrenza");
});
it.each([false, true])("retains results and stops later sends when source columns change during an in-flight batch (invalid=%s)", async invalid => {
  const test = fixture(), snapshot = test.engine.snapshot(), config = defaultAlarmColumns(); test.control.update({ ...snapshot, actionsEnabled: true, rows: [...snapshot.rows, { ...snapshot.rows[0], id: "second", name: "Secondo" }] });
  let resolve!: () => void; test.action.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; })); button(test.host, "Più allarmi").click(); button(test.host, "Scegli solo questa pagina").click(); button(test.host, "Rivedi presa visione").click(); button(test.host, "Conferma invio agli allarmi scelti").click(); expect(test.action).toHaveBeenCalledTimes(1);
  config.columns[0].label = "Aggiornato"; test.host.setAttribute(alarmColumnsAttribute, invalid ? "INVALID" : serializeAlarmColumns(config)); await Promise.resolve(); resolve(); await vi.waitFor(() => expect(test.host.querySelector('[aria-label="Operazione su più allarmi"]')!.textContent).toContain("Risultati dell’operazione")); expect(test.action).toHaveBeenCalledTimes(1); expect(test.host.querySelector('[aria-label="Operazione su più allarmi"]')!.textContent).toContain("Registrato"); expect(test.host.querySelector('[aria-label="Operazione su più allarmi"]')!.textContent).toContain("Non inviato");
});
