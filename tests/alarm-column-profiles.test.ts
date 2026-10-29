// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { defaultAlarmColumns, serializeAlarmColumns, parseAlarmColumnProfileConfig, parseAlarmColumnProfileRecord, alarmColumnProfileStorageKey, alarmColumnProfileAttribute, alarmColumnsAttribute } from "../scripts/hmi-alarm-views.mjs";
import { createHmiAlarmControl } from "../src/core/hmiAlarmControl";
import { createAlarmEngine, emptyAlarmCatalog } from "../runtime/alarm-engine.mjs";
const namespace = "7618fc24-79c4-4657-9139-56ad520cb1fa", cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(close => close()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });
const button = (host: HTMLElement, name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === name)!;
const field = <T extends HTMLElement = HTMLInputElement>(host: HTMLElement, name: string) => host.querySelector<T>('[aria-label="' + name + '"]')!;
const header = (host: HTMLElement) => host.querySelector("thead th")!.textContent;
function fixture(mode: "manual" | "automatic" | "off" = "manual", rawColumns?: string) {
  const host = document.createElement("div"); host.textContent = "Bozza"; if (mode !== "off") host.setAttribute(alarmColumnProfileAttribute, JSON.stringify({ version: 1, id: "main-alarms", save: mode })); if (rawColumns) host.setAttribute(alarmColumnsAttribute, rawColumns); document.body.append(host);
  let actor: string | null = "one"; const context = { namespace, operator: () => actor === null ? null : { id: actor } }, action = vi.fn(async () => {});
  const engine = createAlarmEngine({ ...emptyAlarmCatalog(), alarms: [{ id: "motor", name: "Motor", text: "Controlla motore", tag: "Signal", className: "Alarm_CTH", enabled: true, priority: 1, trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] }, [{ name: "Signal", dataType: "Bool", access: "read" }]); engine.updateSample({ tag: "Signal", value: true, qualityCode: 192 });
  const control = createHmiAlarmControl(host, action, undefined, context); control.update({ ...engine.snapshot(), actionsEnabled: true });
  const close = () => { control.dispose(); host.remove(); }; cleanup.push(close);
  return { host, control, action, close, key: () => alarmColumnProfileStorageKey(context, "main-alarms", location.pathname), user(id: string | null) { actor = id; window.dispatchEvent(new CustomEvent("framecraft:user-changed")); } };
}
function apply(test: ReturnType<typeof fixture>, title: string) { field<HTMLInputElement>(test.host, "Titolo della colonna").value = title; button(test.host, "Applica visualizzazione").click(); }
const record = (title: string, baseline = serializeAlarmColumns(defaultAlarmColumns())) => { const columns = defaultAlarmColumns(); columns.columns[0].label = title; return JSON.stringify({ version: 1, baseline, columns }); };
it("scopes keys by project, page, list and operator, with guest distinct from an account named guest", () => {
  const context = { namespace, operator: () => ({ id: "guest" }) }, key = alarmColumnProfileStorageKey(context, "main", "/alarms");
  expect(new Set([key, alarmColumnProfileStorageKey({ namespace }, "main", "/alarms"), alarmColumnProfileStorageKey(context, "other", "/alarms"), alarmColumnProfileStorageKey(context, "main", "/other"), alarmColumnProfileStorageKey({ ...context, namespace: "6618fc24-79c4-4657-9139-56ad520cb1fa" }, "main", "/alarms")]).size).toBe(5);
  expect(key).not.toContain("alarm-views"); for (const id of ["", "../other", "a:b", "a b", "x".repeat(81)]) expect(() => alarmColumnProfileStorageKey(context, id, "/alarms")).toThrow();
});
it("validates source configuration, record schema, canonical baseline and mandatory visible columns", () => {
  expect(parseAlarmColumnProfileConfig(null)).toBeUndefined(); expect(parseAlarmColumnProfileConfig({ version: 1, id: "line.1", save: "automatic" })?.save).toBe("automatic");
  for (const raw of ["PRIVATE_BROKEN", { version: 2, id: "a", save: "manual" }, { version: 1, id: "a", save: "manual", token: "x" }, { version: 1, id: "a", save: "invalid" }]) expect(() => parseAlarmColumnProfileConfig(raw)).toThrow(expect.objectContaining({ code: "config" }));
  const data = JSON.parse(record("Mine")); expect(parseAlarmColumnProfileRecord(record("Mine"))!.columns.columns[0].label).toBe("Mine");
  for (const raw of ["PRIVATE_BROKEN", ' '.repeat(32001), JSON.stringify({ ...data, version: 2 }), JSON.stringify({ ...data, token: "x" }), JSON.stringify({ ...data, columns: null }), JSON.stringify({ ...data, baseline: "null" }), JSON.stringify({ ...data, columns: { ...data.columns, columns: data.columns.columns.map((item: { key: string }) => item.key === "state" ? { ...item, visible: false } : item) } })]) expect(() => parseAlarmColumnProfileRecord(raw)).toThrow(expect.objectContaining({ code: "corrupt" }));
});
it("does not persist when disabled or on a manual draft, and restores an explicit save on reopening", () => {
  const off = fixture("off"); apply(off, "Temporary"); expect([...Object.keys(localStorage)].some(key => key.startsWith("framecraft.alarm-columns"))).toBe(false); off.close();
  const test = fixture(); apply(test, "Mine"); expect(localStorage.getItem(test.key())).toBeNull(); button(test.host, "Salva le mie colonne").click(); const saved = JSON.parse(localStorage.getItem(test.key())!); expect(Object.keys(saved).sort()).toEqual(["baseline", "columns", "version"]); expect(saved.columns.columns[0].label).toBe("Mine"); expect(test.action).not.toHaveBeenCalled(); test.close();
  const reopened = fixture(); expect(header(reopened.host)).toBe("Mine"); expect(reopened.action).not.toHaveBeenCalled();
});
it("saves automatic mode only on explicit Apply or project Reset, never while typing", () => {
  const test = fixture("automatic"), set = vi.spyOn(Storage.prototype, "setItem"); field<HTMLInputElement>(test.host, "Titolo della colonna").value = "Auto"; expect(set).not.toHaveBeenCalled(); button(test.host, "Applica visualizzazione").click(); expect(JSON.parse(localStorage.getItem(test.key())!).columns.columns[0].label).toBe("Auto"); expect(set).toHaveBeenCalledTimes(1);
  button(test.host, "Ripristina colonne del progetto").click(); expect(JSON.parse(localStorage.getItem(test.key())!).columns.columns[0].label).toBe("Allarme"); expect(test.action).not.toHaveBeenCalled();
});
it("separates users, restores each saved disposition and preserves an unsaved same-user refresh", () => {
  const test = fixture(); apply(test, "One"); button(test.host, "Salva le mie colonne").click(); test.user("two"); expect(header(test.host)).toBe("Allarme"); apply(test, "Two"); button(test.host, "Salva le mie colonne").click(); test.user("one"); expect(header(test.host)).toBe("One"); apply(test, "Unsaved"); test.user("one"); expect(header(test.host)).toBe("Unsaved"); test.user("two"); expect(header(test.host)).toBe("Two"); test.user(null); expect(header(test.host)).toBe("Allarme");
});
it("preserves a stale profile after project edits, without automatically overriding the new baseline", async () => {
  const test = fixture(); apply(test, "Old preference"); button(test.host, "Salva le mie colonne").click(); const original = localStorage.getItem(test.key()), project = defaultAlarmColumns(); project.columns[0].label = "New project"; test.host.setAttribute(alarmColumnsAttribute, serializeAlarmColumns(project)); await Promise.resolve();
  expect(header(test.host)).toBe("New project"); expect(test.host.textContent).toContain("Il progetto ha modificato le colonne"); expect(localStorage.getItem(test.key())).toBe(original); button(test.host, "Carica le mie colonne").click(); expect(header(test.host)).toBe("Old preference"); expect(localStorage.getItem(test.key())).toBe(original); button(test.host, "Salva le mie colonne").click(); expect(JSON.parse(localStorage.getItem(test.key())!).baseline).toBe(serializeAlarmColumns(project));
});
it("keeps profiles compatible when only the order of JSON properties changes", async () => {
  const test = fixture(); apply(test, "Personal"); button(test.host, "Salva le mie colonne").click(); const config = defaultAlarmColumns(); test.host.setAttribute(alarmColumnsAttribute, JSON.stringify({ columns: config.columns.map(({ key, label, width, visible }) => ({ visible, width, label, key })), timeZone: config.timeZone, version: config.version })); await Promise.resolve(); expect(header(test.host)).toBe("Personal"); expect(test.host.textContent).not.toContain("Il progetto ha modificato le colonne");
});
it("keeps preview changes temporary when no project namespace is supplied", () => {
  const host = document.createElement("div"); host.setAttribute(alarmColumnProfileAttribute, JSON.stringify({ version: 1, id: "preview", save: "manual" })); document.body.append(host); const control = createHmiAlarmControl(host, vi.fn()); cleanup.push(() => control.dispose()); control.update(undefined, false); expect(host.textContent).toContain("Il profilo richiede"); expect(button(host, "Salva le mie colonne")).toBeUndefined(); expect(localStorage.length).toBe(0);
});
it.each(["manual", "automatic"] as const)("preserves corrupt profiles in %s mode and removes only the confirmed scope", mode => {
  const key = alarmColumnProfileStorageKey({ namespace, operator: () => ({ id: "one" }) }, "main-alarms", location.pathname); localStorage.setItem(key, '{"version":2,"private":"PRIVATE_BROKEN"}'); localStorage.setItem("unrelated", "keep"); const test = fixture(mode); expect(test.host.textContent).not.toContain("PRIVATE_BROKEN"); expect(button(test.host, "Salva le mie colonne").disabled).toBe(true); apply(test, "Temporary"); expect(header(test.host)).toBe("Temporary"); expect(localStorage.getItem(key)).toContain("PRIVATE_BROKEN");
  const forget = button(test.host, "Dimentica le mie colonne"); forget.focus(); forget.click(); expect(document.activeElement?.textContent).toBe("Conferma rimozione profilo colonne"); expect(localStorage.getItem(key)).not.toBeNull(); button(test.host, "Conferma rimozione profilo colonne").click(); expect(localStorage.getItem(key)).toBeNull(); expect(localStorage.getItem("unrelated")).toBe("keep"); expect(header(test.host)).toBe("Allarme");
});
it("rejects duplicate list identifiers before sharing stored columns, and recovers after removal", async () => {
  const test = fixture(); apply(test, "Personal"); button(test.host, "Salva le mie colonne").click(); const get = vi.spyOn(Storage.prototype, "getItem"), duplicate = fixture(); await Promise.resolve(); expect(test.host.textContent).toContain("Due liste nella pagina"); expect(duplicate.host.textContent).toContain("Due liste nella pagina"); expect(header(test.host)).toBe("Allarme"); expect(get.mock.calls.some(([key]) => key === test.key())).toBe(false); duplicate.close(); await Promise.resolve(); expect(header(test.host)).toBe("Personal");
});
it("handles read failures without replacing data, with an explicit successful reread", () => {
  const original = Storage.prototype.getItem, get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function(this: Storage, key: string) { if (key.startsWith("framecraft.alarm-columns")) throw new DOMException("PRIVATE_FAILURE"); return original.call(this, key); }); const test = fixture(); expect(test.host.textContent).toContain("Il browser non consente"); expect(test.host.textContent).not.toContain("PRIVATE_FAILURE"); expect(button(test.host, "Salva le mie colonne").disabled).toBe(true); apply(test, "Temporary"); expect(header(test.host)).toBe("Temporary"); get.mockRestore(); button(test.host, "Rileggi profilo colonne").click(); expect(button(test.host, "Salva le mie colonne").disabled).toBe(false);
});
it("keeps temporary changes and the old record when automatic saving exceeds quota", () => {
  const test = fixture("automatic"); apply(test, "Saved"); const before = localStorage.getItem(test.key()); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("PRIVATE_QUOTA"); }); apply(test, "Temporary"); expect(header(test.host)).toBe("Temporary"); expect(localStorage.getItem(test.key())).toBe(before); expect(test.host.textContent).toContain("Il browser non consente"); expect(test.host.textContent).not.toContain("PRIVATE_QUOTA");
});
it("reads actual storage after cross-window events without applying it or trusting event payloads", () => {
  const test = fixture(); apply(test, "Saved"); button(test.host, "Salva le mie colonne").click(); apply(test, "Local draft"); localStorage.setItem(test.key(), record("Other window")); window.dispatchEvent(new StorageEvent("storage", { key: test.key(), newValue: "PRIVATE_FAKE" })); expect(header(test.host)).toBe("Local draft"); expect(test.host.textContent).not.toContain("PRIVATE_FAKE"); button(test.host, "Carica le mie colonne").click(); expect(header(test.host)).toBe("Other window");
});
it("blocks old profile buttons after an actor change or an inherited interaction gate", () => {
  const test = fixture(), save = button(test.host, "Salva le mie colonne"); test.user("two"); save.click(); expect(localStorage.getItem(test.key())).toBeNull(); test.host.setAttribute("aria-disabled", "true"); button(test.host, "Salva le mie colonne").click(); expect(localStorage.getItem(test.key())).toBeNull();
});
it("disables profile operations during command review and cleans observers/listeners on dispose", async () => {
  const test = fixture(); button(test.host, "Più allarmi").click(); button(test.host, "Scegli solo questa pagina").click(); button(test.host, "Rivedi presa visione").click(); expect(button(test.host, "Salva le mie colonne").disabled).toBe(true); expect(button(test.host, "Rileggi profilo colonne").disabled).toBe(true); test.close(); window.dispatchEvent(new StorageEvent("storage", { key: test.key() })); await Promise.resolve(); expect(test.host.textContent).toBe("Bozza"); expect(test.action).not.toHaveBeenCalled();
});
it("reenables profile controls after a single command completes without saving column drafts", async () => {
  const test = fixture("automatic"); field<HTMLInputElement>(test.host, "Titolo della colonna").value = "Unsaved draft"; button(test.host, "Motor").click(); button(test.host, "Prendi in visione").click(); expect(button(test.host, "Salva le mie colonne").disabled).toBe(true); await vi.waitFor(() => expect(button(test.host, "Salva le mie colonne").disabled).toBe(false)); expect(localStorage.getItem(test.key())).toBeNull(); expect(field<HTMLInputElement>(test.host, "Titolo della colonna").value).toBe("Unsaved draft"); expect(test.action).toHaveBeenCalledOnce();
});
