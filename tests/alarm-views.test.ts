// @vitest-environment jsdom
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { activeAlarmViewDefaults, alarmRowMatchesView, alarmViewsRuntimeModuleSource, alarmViewsStorageKey, compareAlarmViewRows, createAlarmSavedViews, parseAlarmViewFilters, parseAlarmViews } from "../scripts/hmi-alarm-views.mjs";
import { parseAlarmHistoryQuery } from "../runtime/alarm-history.mjs";
import type { AlarmRow } from "../runtime/alarm-engine.mjs";
const namespace = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); localStorage.clear(); document.body.replaceChildren(); vi.restoreAllMocks(); });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
function fixture(options: { actor?: string; namespace?: string; current?: () => any; disabled?: () => boolean } = {}) {
  let actor: string | null = options.actor ?? "operator-a"; const context = { namespace: options.namespace ?? namespace, operator: () => actor === null ? null : { id: actor } }, host = document.createElement("div"); document.body.append(host);
  const apply = vi.fn(), control = createAlarmSavedViews({ document, kind: "active", context, current: options.current ?? (() => ({ ...activeAlarmViewDefaults, search: "Motor" })), apply, disabled: options.disabled ?? (() => false), changed: () => host.replaceChildren(control.render()) }); host.replaceChildren(control.render()); cleanups.push(() => control.dispose());
  const name = (value: string) => { const input = host.querySelector<HTMLInputElement>('[aria-label="Nome della vista"]')!; input.value = value; input.dispatchEvent(new Event("input")); };
  return { host, control, context, apply, name, setActor: (value: string | null) => { actor = value; control.reset(); host.replaceChildren(control.render()); } };
}
it("namespaces preferences by project, operator, guest and list kind without sharing actor guest", () => {
  const key = alarmViewsStorageKey({ namespace, operator: () => ({ id: "a" }) }, "active");
  for (const value of [alarmViewsStorageKey({ namespace: other, operator: () => ({ id: "a" }) }, "active"), alarmViewsStorageKey({ namespace, operator: () => ({ id: "b" }) }, "active"), alarmViewsStorageKey({ namespace, operator: () => null }, "active"), alarmViewsStorageKey({ namespace, operator: () => ({ id: "a" }) }, "history")]) expect(value).not.toBe(key);
  expect(alarmViewsStorageKey({ namespace, operator: () => null }, "active")).not.toBe(alarmViewsStorageKey({ namespace, operator: () => ({ id: "guest" }) }, "active"));
  expect(() => alarmViewsStorageKey({ namespace: "guessed" }, "active")).toThrow();
});
it.each([{ action: "acknowledge" }, { state: "arbitrary" }, { quality: "zero" }, { order: "SQL desc" }, { minimumPriority: "-1" }, { minimumPriority: "256" }, { minimumPriority: "1.5" }, { minimumPriority: "1e2" }, { search: "\u202ehidden" }, { search: "x".repeat(201) }])("rejects unsupported active filters %j", patch => {
  expect(() => parseAlarmViewFilters("active", { ...activeAlarmViewDefaults, ...patch })).toThrow();
});
it("validates historical filters against the actual query contract without retaining cursors or limits", () => {
  const value = { alarmId: "a", alarmClass: "Guasto", area: "Linea A", state: "Incoming", from: "2026-10-25T00:30:00.123Z", to: "2026-10-25T01:30:00.123Z" };
  expect(parseAlarmHistoryQuery(parseAlarmViewFilters("history", value))).toMatchObject({ ...value, limit: 50 });
  for (const patch of [{ before: 10 }, { through: 100 }, { archiveId: namespace }, { limit: 50 }, { from: "2026-02-30T00:00:00.000Z" }, { state: "all" }, { alarmClass: " " }, { from: value.to, to: value.from }]) expect(() => parseAlarmViewFilters("history", { ...value, ...patch })).toThrow();
});
it.each(["{", '{"version":2,"views":[]}', '{"version":1,"views":[],"commands":[]}', "x".repeat(65537)])("does not accept corrupt or unsupported catalogs", text => { expect(() => parseAlarmViews(text, "active")).toThrow(); });
it("round trips saved filters, scopes and names, without auto applying on reload", () => {
  const test = fixture(); test.name("Motori"); button(test.host, "Salva come nuova vista").focus(); button(test.host, "Salva come nuova vista").click();
  expect(test.host.textContent).toContain("Vista salvata"); expect(test.apply).not.toHaveBeenCalled(); expect(document.activeElement?.textContent).toBe("Salva come nuova vista");
  const raw = localStorage.getItem(alarmViewsStorageKey(test.context, "active"))!; expect(JSON.parse(raw).views[0].filters.search).toBe("Motor"); expect(raw).not.toContain("occurrence");
  const again = fixture(); expect(again.host.textContent).toContain("Motori"); expect(again.apply).not.toHaveBeenCalled();
  const select = again.host.querySelector<HTMLSelectElement>("select")!; select.value = JSON.parse(raw).views[0].id; select.dispatchEvent(new Event("change")); expect(again.apply).not.toHaveBeenCalled(); button(again.host, "Applica vista").click(); expect(again.apply).toHaveBeenCalledWith(expect.objectContaining({ search: "Motor" }));
});
it("updates, renames and deletes only the selected view without altering current filters", () => {
  const test = fixture(); test.name("Prima"); button(test.host, "Salva come nuova vista").click(); test.name("Rinominata"); button(test.host, "Aggiorna vista selezionata").click(); expect(test.host.textContent).toContain("Rinominata");
  button(test.host, "Elimina vista selezionata").click(); expect(parseAlarmViews(localStorage.getItem(alarmViewsStorageKey(test.context, "active")), "active").views).toEqual([]); expect(test.apply).not.toHaveBeenCalled();
});
it("rejects canonical duplicate names and safely displays text that resembles markup", () => {
  const test = fixture(); test.name("é"); button(test.host, "Salva come nuova vista").click(); test.name("e\u0301"); button(test.host, "Salva come nuova vista").click(); expect(test.host.textContent).toContain("Esiste già");
  test.name("<img src=x>"); button(test.host, "Salva come nuova vista").click(); expect(test.host.querySelector("img")).toBeNull(); expect(test.host.textContent).toContain("<img src=x>");
});
it("preserves corruption until a scoped explicit reset and leaves other projects intact", () => {
  const test = fixture(), key = alarmViewsStorageKey(test.context, "active"), foreign = alarmViewsStorageKey({ namespace: other }, "active"); localStorage.setItem(key, "PRIVATE_BROKEN_DATA"); localStorage.setItem(foreign, "other project"); test.host.replaceChildren(test.control.render());
  expect(test.host.textContent).toContain("non leggibili"); expect(test.host.textContent).not.toContain("PRIVATE_BROKEN"); expect(localStorage.getItem(key)).toBe("PRIVATE_BROKEN_DATA");
  button(test.host, "Reimposta elenco delle viste").click(); expect(localStorage.getItem(key)).toBe("PRIVATE_BROKEN_DATA"); button(test.host, "Conferma azzeramento delle sole viste salvate").click(); expect(localStorage.getItem(key)).toBeNull(); expect(localStorage.getItem(foreign)).toBe("other project");
});
it("does not erase preferences when storage is unavailable and keeps filters temporary", () => {
  const unavailable = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("PRIVATE", "SecurityError"); }); const test = fixture(); expect(test.host.textContent).toContain("filtri temporanei"); expect(button(test.host, "Salva come nuova vista").disabled).toBe(true); expect(test.host.textContent).not.toContain("PRIVATE"); unavailable.mockRestore(); button(test.host, "Rileggi elenco delle viste").click(); expect(button(test.host, "Salva come nuova vista").disabled).toBe(false); expect(test.apply).not.toHaveBeenCalled();
});
it("checks the current user and avoids auto applying a cross-tab edit or user switch", () => {
  const test = fixture(); test.name("Riservata a utente A"); button(test.host, "Salva come nuova vista").click(); window.dispatchEvent(new StorageEvent("storage", { key: alarmViewsStorageKey(test.context, "active") })); expect(test.apply).not.toHaveBeenCalled();
  test.setActor("operator-b"); expect(test.host.textContent).not.toContain("Riservata a utente A"); test.setActor(null); expect(test.host.textContent).not.toContain("Riservata a utente A"); test.setActor("operator-a"); expect(test.host.textContent).toContain("Riservata a utente A"); expect(test.apply).not.toHaveBeenCalled();
});
it("does not overwrite a view deleted by another tab and respects a blocked element", () => {
  let blocked = false; const test = fixture({ disabled: () => blocked }); test.name("Locale"); button(test.host, "Salva come nuova vista").click(); const update = button(test.host, "Aggiorna vista selezionata"); blocked = true; update.click(); expect(test.apply).not.toHaveBeenCalled(); blocked = false;
  localStorage.removeItem(alarmViewsStorageKey(test.context, "active")); update.click(); expect(test.host.textContent).toContain("rimossa da un’altra finestra"); expect(localStorage.getItem(alarmViewsStorageKey(test.context, "active"))).toBeNull();
});
it("caps the number of saved views without replacing earlier entries", () => {
  const test = fixture(); for (let i = 0; i < 25; i++) { test.name("Vista " + i); button(test.host, "Salva come nuova vista").click(); } test.name("Extra"); button(test.host, "Salva come nuova vista").click(); expect(test.host.textContent).toContain("massimo 25"); expect(parseAlarmViews(localStorage.getItem(alarmViewsStorageKey(test.context, "active")), "active").views).toHaveLength(25);
});
it("filters exact class/area, state, quality and minimum priority and sorts with deterministic ties", () => {
  const row = { id: "a", name: "Motor", text: "High", className: "Guasto", area: "Linea", priority: 5, quality: "good", active: false, pending: true, acknowledged: true, confirmed: false, acknowledgment: "reset", activatedAt: 100 } as AlarmRow;
  expect(alarmRowMatchesView(row, { ...activeAlarmViewDefaults, state: "awaiting-confirmation", minimumPriority: "5", area: "Linea" })).toBe(true);
  for (const patch of [{ area: "Missing" }, { alarmClass: "Other" }, { state: "active" }, { state: "unacknowledged" }, { quality: "invalid" }, { minimumPriority: "6" }]) expect(alarmRowMatchesView(row, { ...activeAlarmViewDefaults, ...patch } as any)).toBe(false);
  const newer = { ...row, id: "b", activatedAt: 200 }; expect(compareAlarmViewRows(row, newer, "priority-desc")).toBeGreaterThan(0); expect(compareAlarmViewRows(row, newer, "latest-desc")).toBeGreaterThan(0); expect(compareAlarmViewRows(row, newer, "oldest-asc")).toBeLessThan(0);
  expect(compareAlarmViewRows(row, { ...row, id: "b" }, "name-asc")).toBeLessThan(0);
});
it("ships the same self-contained functions into the preview bridge", () => {
  const value = runInNewContext(alarmViewsRuntimeModuleSource() + ';parseAlarmViewFilters("active",{...activeAlarmViewDefaults,search:"Motor"})'); expect(value.search).toBe("Motor"); expect(value.order).toBe("priority-desc");
});
