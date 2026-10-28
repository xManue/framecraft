// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createHmiAlarmControl } from "../src/core/hmiAlarmControl";
import { createHmiAlarmArchive } from "../src/core/hmiAlarmArchive";
import { createAlarmEngine, emptyAlarmCatalog, type AlarmRow } from "../runtime/alarm-engine.mjs";
import { activeAlarmViewDefaults, alarmViewsStorageKey } from "../scripts/hmi-alarm-views.mjs";
const operator = vi.hoisted(() => ({ id: "operator-a", capabilities: ["alarms.history.read"] }));
vi.mock("../src/core/hmiOperatorSession", () => ({ operatorSessionProfile: () => operator, openOperatorSession: () => {} }));
const namespace = "11111111-1111-4111-8111-111111111111", context = { namespace, operator: () => operator }, cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(stop => stop()); document.body.replaceChildren(); localStorage.clear(); operator.id = "operator-a"; });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
const input = (host: HTMLElement, label: string) => host.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!;
const change = (host: HTMLElement, label: string, value: string) => { const node = input(host, label); node.value = value; node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input")); };
function active(filter?: (row: AlarmRow) => boolean) {
  const host = document.createElement("div"); document.body.append(host); const catalog = { ...emptyAlarmCatalog(), classes: [{ name: "A", acknowledgment: "single" as const }, { name: "B", acknowledgment: "single" as const }], alarms: ["a", "b"].map((id, i) => ({ id, name: i ? "Beta" : "Alpha", text: "Check", tag: "Signal" + i, className: i ? "B" : "A", area: i ? "Zone B" : "Zone A", priority: i + 1, enabled: true, trigger: { kind: "bit" as const, bit: 0, activeWhen: "set" as const } })) };
  const engine = createAlarmEngine(catalog, catalog.alarms.map(row => ({ name: row.tag, dataType: "Bool", access: "read" })));
  engine.updateSamples(catalog.alarms.map(row => ({ tag: row.tag, value: true, qualityCode: 192 })));
  const action = vi.fn(async () => {}), control = createHmiAlarmControl(host, action, filter, context), update = () => control.update({ ...engine.snapshot(), actionsEnabled: true }); cleanup.push(() => control.dispose()); update();
  const names = () => [...host.querySelectorAll('tbody button[aria-pressed]')].map(node => node.textContent);
  return { host, engine, action, control, update, names };
}
function seed(kind: "active" | "history", filters: Record<string, string>) {
  localStorage.setItem(alarmViewsStorageKey(context, kind), JSON.stringify({ version: 1, views: [{ id: "22222222-2222-4222-8222-222222222222", name: "Preset", filters }] }));
}
it("supports combined class/state/quality/priority filters and explicit sorting without changing samples", () => {
  const test = active(); expect(test.names()).toEqual(["Beta", "Alpha"]); change(test.host, "Ordina allarmi", "name-asc"); expect(test.names()).toEqual(["Alpha", "Beta"]);
  change(test.host, "Classe", "A"); expect(test.names()).toEqual(["Alpha"]); change(test.host, "Priorità minima", "2"); expect(test.names()).toEqual([]); change(test.host, "Priorità minima", "");
  change(test.host, "Qualità del segnale", "invalid"); expect(test.names()).toEqual([]); test.engine.updateSample({ tag: "Signal0", value: true, qualityCode: 0 }); test.update(); expect(test.names()).toEqual(["Alpha"]); expect(test.action).not.toHaveBeenCalled();
});
it("applying a saved view clears selections and preserves fixed project/summary filters", () => {
  seed("active", { ...activeAlarmViewDefaults, alarmClass: "B" }); const test = active(row => row.id === "a"); button(test.host, "Alpha").click(); expect(button(test.host, "Prendi in visione").disabled).toBe(false);
  const picker = input(test.host, "Vista salvata") as HTMLSelectElement; change(test.host, "Vista salvata", picker.options[1].value); button(test.host, "Applica vista").click(); expect(test.names()).toEqual([]); expect(button(test.host, "Prendi in visione").disabled).toBe(true); expect(test.action).not.toHaveBeenCalled();
});
it("keeps a saved missing area/class as an empty result instead of silently broadening it", () => {
  seed("active", { ...activeAlarmViewDefaults, area: "Missing area", alarmClass: "Missing class" }); const test = active(); const picker = input(test.host, "Vista salvata") as HTMLSelectElement; change(test.host, "Vista salvata", picker.options[1].value); button(test.host, "Applica vista").click();
  expect(input(test.host, "Zona").value).toBe("Missing area"); expect(input(test.host, "Classe").value).toBe("Missing class"); test.update(); expect(test.names()).toEqual([]); expect(input(test.host, "Zona").value).toBe("Missing area");
});
it("a renewal of the same identity preserves the current view and review, a real user change clears them", () => {
  const test = active(); change(test.host, "Ordina allarmi", "name-asc"); button(test.host, "Più allarmi").click(); button(test.host, "Scegli solo questa pagina").click(); button(test.host, "Rivedi presa visione").click(); window.dispatchEvent(new CustomEvent("framecraft:user-changed"));
  expect(test.host.querySelector<HTMLElement>('[aria-label="Operazione su più allarmi"]')!.hidden).toBe(false); expect(input(test.host, "Ordina allarmi").value).toBe("name-asc");
  operator.id = "new-operator"; window.dispatchEvent(new CustomEvent("framecraft:user-changed")); expect(input(test.host, "Ordina allarmi").value).toBe("priority-desc"); expect(test.host.querySelector<HTMLElement>('[aria-label="Operazione su più allarmi"]')!.hidden).toBe(true); expect(test.action).not.toHaveBeenCalled();
});
it("does not overwrite a name being typed or steal its focus during live polling", () => {
  const test = active(); change(test.host, "Nome della vista", "Typing"); input(test.host, "Nome della vista").focus(); test.update(); test.update(); expect(input(test.host, "Nome della vista").value).toBe("Typing"); expect(document.activeElement).toBe(input(test.host, "Nome della vista"));
});
it("loads historical presets into a draft without fetching and preserves the saved UTC instant through a DST fold", async () => {
  const previous = process.env.TZ; process.env.TZ = "Europe/Rome";
  try {
    const filters = { alarmId: "a", alarmClass: "", area: "", state: "", from: "2026-10-25T01:30:00.123Z", to: "2026-10-25T02:30:00.123Z" }; seed("history", filters);
    const host = document.createElement("div"); document.body.append(host); const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ version: 1, id: namespace, namespace, sequence: 0, count: 0, incompleteRuns: 0, events: [], nextBefore: null, capture: { state: "recording", unconfirmedInThisRun: 0 } })));
    const control = createHmiAlarmArchive(host, { enabled: true, request, views: context }); cleanup.push(() => control.dispose()); const picker = input(host, "Vista salvata") as HTMLSelectElement; change(host, "Vista salvata", picker.options[1].value); button(host, "Usa filtri della vista").click(); expect(request).not.toHaveBeenCalled(); expect(input(host, "Da (ora di questo dispositivo)").value).toContain("02:30:00.123");
    button(host, "Carica storico").click(); await vi.waitFor(() => expect(request).toHaveBeenCalledOnce()); const query = new URL(String(request.mock.calls[0][0]), "http://localhost").searchParams; expect(query.get("from")).toBe(filters.from); expect(query.get("to")).toBe(filters.to); expect(query.has("before")).toBe(false); expect(host.textContent).toContain("Istante UTC salvato");
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
