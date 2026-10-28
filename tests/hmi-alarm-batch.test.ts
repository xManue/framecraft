// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createAlarmEngine, emptyAlarmCatalog, type AlarmCommand, type AlarmCatalog } from "../runtime/alarm-engine.mjs";
import { createHmiAlarmControl } from "../src/core/hmiAlarmControl";
import { HmiGatewayCommandError } from "../src/core/hmiGateway";
const cleanup: (() => void)[] = [];
afterEach(() => { for (const stop of cleanup.splice(0)) stop(); document.body.replaceChildren(); });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
function fixture(count = 3, before?: (command: AlarmCommand) => Promise<void>, reset = false, after?: () => void) {
  const host = document.createElement("div"); document.body.append(host);
  const catalog: AlarmCatalog = { ...emptyAlarmCatalog(), classes: [{ name: "Test", acknowledgment: reset ? "reset" : "single" }], alarms: Array.from({ length: count }, (_, i) => ({ id: "a" + i, name: "Allarme " + i, text: "<img src=x>" + "x".repeat(100), tag: "Signal" + i, className: "Test", priority: count - i, enabled: true, area: i % 2 ? "Zona B" : "Zona A", trigger: { kind: "bit", bit: 0, activeWhen: "set" } })) };
  const engine = createAlarmEngine(catalog, catalog.alarms.map(row => ({ name: row.tag, dataType: "Bool", access: "read" })));
  engine.updateSamples(catalog.alarms.map(row => ({ tag: row.tag, value: true, qualityCode: 192 })));
  const action = vi.fn(async (command: AlarmCommand) => { await before?.(command); engine.action(command, "Operatore test"); control.update({ ...engine.snapshot(), actionsEnabled: true }); after?.(); });
  const control = createHmiAlarmControl(host, action); cleanup.push(() => control.dispose());
  const update = (available = true) => control.update({ ...engine.snapshot(), actionsEnabled: true }, available); update();
  const include = (index: number) => host.querySelector<HTMLInputElement>(`input[aria-label="Includi Allarme ${index}"]`)!.click();
  const prepare = (kind = "Rivedi presa visione") => button(host, kind).click();
  const send = () => button(host, "Conferma invio agli allarmi scelti").click();
  const review = () => host.querySelector<HTMLElement>('[aria-label="Operazione su più allarmi"]')!;
  button(host, "Più allarmi").click(); return { host, engine, action, control, update, include, prepare, send, review };
}
it("requires an explicit bounded selection, review and second confirmation, with per-row exact revisions", async () => {
  const test = fixture(); test.include(0); test.include(2); const before = test.engine.snapshot(); test.prepare();
  expect(test.action).not.toHaveBeenCalled(); expect(document.activeElement).toBe(test.review()); expect(test.review().textContent).toContain("2 allarmi"); expect(test.host.querySelector("img")).toBeNull();
  test.send(); await vi.waitFor(() => expect(test.review().textContent).toContain("Risultati dell’operazione"));
  expect(test.action.mock.calls.map(([command]) => command)).toEqual([0, 2].map(i => ({ alarmId: "a" + i, occurrence: before.rows[i].occurrence, revision: before.rows[i].revision, action: "acknowledge" })));
  expect(test.engine.snapshot().rows.map(row => [row.active, row.acknowledged])).toEqual([[true, true], [true, false], [true, true]]);
  expect(test.review().querySelectorAll("li")).toHaveLength(2); expect(test.review().textContent).not.toContain("Esito da verificare");
});
it("picks only the current filtered page and never assumes an empty selection means all", () => {
  const test = fixture(101); expect(button(test.host, "Rivedi presa visione").disabled).toBe(true);
  button(test.host, "Scegli solo questa pagina").click(); expect(test.host.textContent).toContain("100 allarmi scelti");
  button(test.host, "Successivi").click(); test.include(100); expect(test.host.textContent).toContain("Massimo 100 allarmi");
  button(test.host, "Scegli solo questa pagina").click(); expect(test.host.textContent).toContain("1 allarmi scelti"); test.prepare(); expect(test.review().textContent).toContain("a100"); expect(test.action).not.toHaveBeenCalled();
});
it("rejects a changed occurrence or revision before sending and keeps filters locked during review", () => {
  const test = fixture(); test.include(0); test.prepare(); expect(test.host.querySelector<HTMLInputElement>('input[type="search"]')!.disabled).toBe(true);
  test.engine.updateSample({ tag: "Signal0", value: false, qualityCode: 0 }); test.update(); expect(button(test.host, "Conferma invio agli allarmi scelti").disabled).toBe(true);
  test.send(); expect(test.action).not.toHaveBeenCalled(); expect(test.review().textContent).toContain("Non più valido");
});
it("does not act on selected rows hidden by a filter, disconnection or host access rules", () => {
  const test = fixture(); test.include(0); const search = test.host.querySelector<HTMLInputElement>('input[type="search"]')!; search.value = "Allarme 2"; search.dispatchEvent(new Event("input")); test.prepare();
  expect(button(test.host, "Conferma invio agli allarmi scelti").disabled).toBe(true); test.send(); expect(test.action).not.toHaveBeenCalled();
  button(test.host, "Torna alla selezione").click(); search.value = ""; search.dispatchEvent(new Event("input")); test.prepare(); test.update(false); test.send(); expect(test.action).not.toHaveBeenCalled();
  test.update(); test.host.setAttribute("inert", ""); test.send(); expect(test.action).not.toHaveBeenCalled();
});
it("stops after the in-flight request on cancellation and retains completed results", async () => {
  let finish!: () => void; const test = fixture(3, async command => { if (command.alarmId === "a0") await new Promise<void>(resolve => { finish = resolve; }); });
  button(test.host, "Scegli solo questa pagina").click(); test.prepare(); test.send(); expect(test.action).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(test.review());
  button(test.host, "Interrompi i prossimi invii").click(); finish(); await vi.waitFor(() => expect(test.review().textContent).toContain("Risultati dell’operazione"));
  expect(test.action).toHaveBeenCalledOnce(); expect(test.review().querySelectorAll("li")[0].textContent).toContain("Registrato"); expect(test.review().querySelectorAll("li")[1].textContent).toContain("Non inviato. Interrotto dall’operatore");
});
it.each(["disconnect", "new-instance", "changed-row", "host-blocked"])("rechecks the remaining targets after await: %s", async reason => {
  let finish!: () => void; const test = fixture(3, async command => { if (command.alarmId === "a0") await new Promise<void>(resolve => { finish = resolve; }); }, false, () => {
    if (reason === "disconnect") test.update(false);
    if (reason === "new-instance") test.control.update({ ...test.engine.snapshot(), instanceId: "another-service", actionsEnabled: true });
    if (reason === "host-blocked") test.host.setAttribute("inert", "");
  });
  button(test.host, "Scegli solo questa pagina").click(); test.prepare(); test.send();
  if (reason === "changed-row") test.engine.updateSample({ tag: "Signal1", value: false, qualityCode: 192 });
  finish();
  await vi.waitFor(() => expect(test.review().textContent).toContain("Risultati dell’operazione")); expect(test.action).toHaveBeenCalledOnce(); expect(test.review().textContent).toContain("Non inviato");
});
it.each(["uncertain", "rejected"])("distinguishes %s and never automatically retries or starts later commands", async outcome => {
  const test = fixture(3, async command => { if (command.alarmId === "a1") throw new HmiGatewayCommandError("Controlla i permessi dello schema allarmi.", outcome as "uncertain" | "rejected"); });
  button(test.host, "Scegli solo questa pagina").click(); test.prepare(); test.send(); await vi.waitFor(() => expect(test.review().textContent).toContain("Risultati dell’operazione"));
  expect(test.action).toHaveBeenCalledTimes(2); const rows = test.review().querySelectorAll("li"); expect(rows[0].textContent).toContain("Registrato"); expect(rows[1].textContent).toContain(outcome === "uncertain" ? "Esito da verificare" : "Rifiutato"); expect(rows[1].textContent).toContain("Controlla i permessi"); expect(rows[2].textContent).toContain("Non inviato");
  test.update(); expect(test.action).toHaveBeenCalledTimes(2); expect(test.review().textContent).toContain("Nessun invio viene ripetuto");
});
it("hides unknown exception text and stops on an uncertain result", async () => {
  const test = fixture(2, async () => { throw new Error("PRIVATE_STACK_OR_SECRET"); }); button(test.host, "Scegli solo questa pagina").click(); test.prepare(); test.send(); await vi.waitFor(() => expect(test.review().textContent).toContain("Esito da verificare"));
  expect(test.review().textContent).not.toContain("PRIVATE_STACK"); expect(test.action).toHaveBeenCalledOnce();
});
it("confirms only valid returned and acknowledged reset alarms, preserving other rows", async () => {
  const test = fixture(2, undefined, true); const initial = test.engine.snapshot().rows[0]; test.engine.action({ alarmId: initial.id, occurrence: initial.occurrence!, revision: initial.revision, action: "acknowledge" }, "operator");
  test.engine.updateSample({ tag: "Signal0", value: false, qualityCode: 192 }); test.update(); test.include(0); test.prepare("Rivedi conferma rientro"); test.send();
  await vi.waitFor(() => expect(test.review().textContent).toContain("Risultati dell’operazione")); expect(test.engine.snapshot().rows[0].confirmed).toBe(true); expect(test.engine.snapshot().rows[1].confirmed).toBe(false);
});
it.each(["logout", "dispose"])("does not continue or reveal a late response after %s", async kind => {
  let finish!: () => void; const test = fixture(3, async () => new Promise<void>(resolve => { finish = resolve; })); button(test.host, "Scegli solo questa pagina").click(); test.prepare(); test.send();
  if (kind === "logout") window.dispatchEvent(new CustomEvent("framecraft:user-changed")); else test.control.dispose();
  finish(); await vi.waitFor(() => expect(test.engine.snapshot().rows[0].acknowledged).toBe(true)); expect(test.action).toHaveBeenCalledOnce(); expect(test.host.textContent).not.toContain("Risultati dell’operazione");
});
