// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAlarmEngine, emptyAlarmCatalog, type AlarmCommand } from "../runtime/alarm-engine.mjs";
import { createHmiAlarmControl } from "../src/core/hmiAlarmControl";
import { defaultHmiAlarmSummaryConfig, hmiAlarmSummaryView } from "../src/core/hmiAlarmSummary";

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose(); document.body.replaceChildren(); vi.restoreAllMocks(); });
const button = (host: HTMLElement, title: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === title)!;
const field = (host: HTMLElement, title: string) => host.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[aria-label="' + title + '"]')!;
function fixture() {
  const host = document.createElement("div"); document.body.append(host);
  const catalog = { ...emptyAlarmCatalog(), maxHistory: 100, shelving: { enabled: true, maxMinutes: 10 }, alarms: [{ id: "motor", name: "Motore", text: "Controlla il motore", tag: "Signal", className: "Alarm_CTH", priority: 1, enabled: true, trigger: { kind: "bit" as const, bit: 0, activeWhen: "set" as const } }] };
  const engine = createAlarmEngine(catalog, [{ name: "Signal", dataType: "Bool", access: "read" }]); engine.updateSample({ tag: "Signal", value: true, qualityCode: 192 });
  let user = "operator"; const action = vi.fn(async (command: AlarmCommand) => { engine.action(command, user); });
  const control = createHmiAlarmControl(host, action, undefined, { namespace: "00000000-0000-4000-8000-000000000001", operator: () => ({ id: user }) });
  const publish = () => control.update({ ...engine.snapshot(), actionsEnabled: true }); const unsubscribe = engine.subscribe(publish); publish(); cleanup.push(() => { unsubscribe(); control.dispose(); });
  const select = () => button(host, "Motore").click();
  const prepare = () => { select(); field(host, "Durata massima (minuti)").value = "2"; field(host, "Motivo della sospensione o del ripristino").value = "Intervento <img src=x>"; button(host, "Rivedi sospensione").click(); };
  return { host, engine, control, action, publish, select, prepare, setUser: (value: string) => { user = value; window.dispatchEvent(new Event("framecraft:user-changed")); } };
}
describe("sospensione e ripristino nel pannello HMI", () => {
  it("richiede selezione, motivo, durata, revisione e conferma senza invii anticipati", async () => {
    const f = fixture(); expect(button(f.host, "Rivedi sospensione").disabled).toBe(true); f.select(); button(f.host, "Rivedi sospensione").click(); expect(f.host.textContent).toContain("Compila un motivo"); expect(f.action).not.toHaveBeenCalled();
    f.prepare(); expect(f.action).not.toHaveBeenCalled(); expect(f.host.textContent).toContain("2 minuti massimi"); expect(document.activeElement?.getAttribute("aria-label")).toBe("Revisione sospensione allarme"); expect(f.host.querySelector("img")).toBeNull(); expect(button(f.host, "Prendi in visione").disabled).toBe(true);
    button(f.host, "Conferma operazione allarme").click(); await vi.waitFor(() => expect(f.action).toHaveBeenCalledTimes(1)); expect(f.action.mock.calls[0][0]).toMatchObject({ action: "shelve", mode: "timed", minutes: 2, reason: "Intervento <img src=x>" }); expect(f.engine.snapshot().rows[0].active).toBe(true); expect(f.host.textContent).toContain("Segnalazioni sospese: 1"); expect(f.host.querySelector('tbody button[aria-pressed]')).toBeNull();
    field(f.host, "Segnalazioni sospese").value = "only"; field(f.host, "Segnalazioni sospese").dispatchEvent(new Event("change")); f.select(); field(f.host, "Motivo della sospensione o del ripristino").value = "Intervento terminato"; button(f.host, "Rivedi ripristino").click(); expect(f.action).toHaveBeenCalledTimes(1); button(f.host, "Conferma operazione allarme").click(); await vi.waitFor(() => expect(f.action).toHaveBeenCalledTimes(2)); expect(f.engine.snapshot().rows[0].shelving).toBeUndefined();
  });
  it("non esegue una revisione dopo un cambio del segnale, del servizio o dell’utente", () => {
    const f = fixture(); f.prepare(); f.engine.updateSample({ tag: "Signal", value: false, qualityCode: 192 }); expect(button(f.host, "Conferma operazione allarme").disabled).toBe(true); button(f.host, "Conferma operazione allarme").click(); expect(f.action).not.toHaveBeenCalled();
    button(f.host, "Annulla operazione allarme").click(); f.engine.updateSample({ tag: "Signal", value: true, qualityCode: 192 }); f.prepare(); f.setUser("other"); expect(f.host.textContent).not.toContain("Conferma sospensione di Motore"); expect(field(f.host, "Motivo della sospensione o del ripristino").value).toBe(""); expect(f.action).not.toHaveBeenCalled();
  });
  it("annulla la revisione quando il progetto cambia e non invia da un elemento bloccato", async () => {
    const f = fixture(); f.prepare(); f.host.setAttribute("data-hmi-alarm-columns", '{"version":99}'); await vi.waitFor(() => expect(f.host.textContent).not.toContain("Conferma sospensione di Motore")); expect(f.action).not.toHaveBeenCalled();
    f.host.removeAttribute("data-hmi-alarm-columns"); await vi.waitFor(() => expect(f.host.textContent).not.toContain("Mostrate le colonne iniziali")); f.prepare(); f.host.setAttribute("aria-disabled", "true"); button(f.host, "Conferma operazione allarme").click(); expect(f.action).not.toHaveBeenCalled();
  });
  it("disconnessione e risposta incerta non avviano tentativi automatici", async () => {
    const f = fixture(); f.prepare(); f.control.update(undefined, false); button(f.host, "Conferma operazione allarme").click(); expect(f.action).not.toHaveBeenCalled(); f.publish();
    f.action.mockImplementationOnce(async () => { throw new Error("Esito incerto: controlla il servizio"); }); button(f.host, "Conferma operazione allarme").click(); await vi.waitFor(() => expect(f.host.textContent).toContain("Esito incerto")); f.publish(); expect(f.action).toHaveBeenCalledTimes(1); expect(button(f.host, "Rivedi sospensione").disabled).toBe(true);
  });
  it("indicatori e righe escludono le segnalazioni sospese ma non mostrano un falso tutto normale", () => {
    const f = fixture(); const row = f.engine.snapshot().rows[0]; f.engine.action({ alarmId: row.id, occurrence: row.occurrence!, revision: row.revision, action: "shelve", mode: "timed", minutes: 1, reason: "Manutenzione" }, "operator");
    const view = hmiAlarmSummaryView(f.engine.snapshot(), { ...defaultHmiAlarmSummaryConfig(), showAlways: false }); expect(view).toMatchObject({ count: 0, pending: 0, shelved: 1, state: "unknown", hidden: false, selected: [] }); expect(view.message).toContain("segnalazioni sospese");
    f.engine.updateSample({ tag: "Signal", value: false, qualityCode: 0 }); expect(hmiAlarmSummaryView(f.engine.snapshot(), defaultHmiAlarmSummaryConfig()).invalid).toBe(1);
  });
});
