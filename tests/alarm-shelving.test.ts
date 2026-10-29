// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAlarmEngine, emptyAlarmCatalog, parseAlarmCatalog, parseAlarmCommand, parseAlarmSnapshot, type AlarmCatalog, type AlarmCommand } from "../runtime/alarm-engine.mjs";
import { parseHistoryEvent, createAlarmStatisticsAccumulator } from "../runtime/alarm-history.mjs";
import { operatorResourceAllowed, defaultOperatorResources } from "../runtime/operator-policy.mjs";

const variables = [{ name: "Signal", dataType: "Bool", access: "read" }];
function fixture(model: "none" | "single" = "single") {
  let wall = 1000000, mono = 0;
  const catalog: AlarmCatalog = { ...emptyAlarmCatalog(), maxHistory: 100, classes: [{ name: "Fault", acknowledgment: model }], shelving: { enabled: true, maxMinutes: 10 }, alarms: [{ id: "motor", name: "Motore", text: "Controlla il motore", tag: "Signal", className: "Fault", priority: 1, enabled: true, trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] };
  const engine = createAlarmEngine(catalog, variables, { now: () => wall, monotonicNow: () => mono });
  const sample = (value: boolean, qualityCode = 192) => engine.updateSample({ tag: "Signal", value, qualityCode });
  const command = (action: "shelve" | "unshelve" = "shelve", extra = {}): AlarmCommand => { const row = engine.snapshot().rows[0]; return { alarmId: row.id, occurrence: row.occurrence!, revision: row.revision, action, reason: "Manutenzione programmata", ...(action === "shelve" ? { mode: "timed", minutes: 1 } : {}), ...extra } as AlarmCommand; };
  const advance = (ms: number, wallMs = ms) => { mono += ms; wall += wallMs; };
  return { engine, sample, command, advance, catalog };
}
describe("sospensione allarmi nel servizio", () => {
  it("è facoltativa e richiede durata esplicita, versione e soli campi noti", () => {
    const f = fixture(); const { shelving: _ignored, ...catalog } = f.catalog;
    expect(parseAlarmCatalog(catalog).shelving).toBeUndefined();
    for (const shelving of [null, { enabled: true }, { enabled: true, maxMinutes: 0 }, { enabled: true, maxMinutes: 1441 }, { enabled: true, maxMinutes: 1, token: "secret" }]) expect(() => parseAlarmCatalog({ ...catalog, shelving })).toThrow(/Sospensione/);
    const engine = createAlarmEngine(catalog, variables); engine.updateSample({ tag: "Signal", value: true, qualityCode: 192 }); const row = engine.snapshot().rows[0];
    expect(() => engine.action({ ...f.command(), occurrence: row.occurrence!, revision: row.revision }, "operator")).toThrow(/non disponibile/);
    f.sample(true); for (const extra of [{ minutes: 0 }, { minutes: 1.5 }, { reason: "" }, { reason: "a\nb" }, { reason: "a\u202eb" }, { mode: "permanent" }, { actor: "forged" }, { revision: -1 }]) expect(() => parseAlarmCommand(f.command("shelve", extra))).toThrow(/non valido/);
  });
  it("sospende solo la segnalazione e preserva attivazione, qualità e presa visione", () => {
    const f = fixture(); f.sample(true); const before = f.engine.snapshot().rows[0]; f.engine.action(f.command(), "operator");
    expect(f.engine.snapshot().rows[0]).toMatchObject({ active: true, pending: true, acknowledged: false, occurrence: before.occurrence, shelving: { reason: "Manutenzione programmata", actor: "operator", until: 1060000 } });
    f.engine.action({ alarmId: before.id, occurrence: before.occurrence!, revision: f.engine.snapshot().rows[0].revision, action: "acknowledge" }, "operator"); f.sample(false);
    expect(f.engine.snapshot().rows[0]).toMatchObject({ active: false, pending: false, acknowledged: true, shelving: { mode: "timed" } });
    f.engine.action(f.command("unshelve"), "other"); expect(f.engine.snapshot().rows[0].shelving).toBeUndefined();
    expect(f.engine.snapshot().history.map(e => e.state)).toEqual(["Incoming", "Shelved", "Acknowledged", "Outgoing", "Unshelved"]);
  });
  it("scade senza nuovi campioni anche se l'orologio civile torna indietro", () => {
    const f = fixture(); f.sample(true); f.engine.action(f.command(), "operator"); f.advance(59999, -200000); f.engine.tick(); expect(f.engine.snapshot().rows[0].shelving).toBeDefined();
    f.advance(1); f.engine.tick(); f.engine.tick(); expect(f.engine.snapshot().rows[0]).toMatchObject({ active: true, acknowledged: false, pending: true }); expect(f.engine.snapshot().rows[0].shelving).toBeUndefined();
    expect(f.engine.snapshot().history.at(-1)).toMatchObject({ state: "Unshelved", shelving: { cause: "elapsed" } }); expect(f.engine.snapshot().history.at(-1)?.actor).toBeUndefined();
    expect(f.engine.snapshot().history.filter(e => e.state === "Unshelved")).toHaveLength(1);
  });
  it("one-shot termina al rientro valido, senza usare un campione di cattiva qualità", () => {
    const f = fixture(); f.sample(true); f.engine.action(f.command("shelve", { mode: "one-shot" }), "operator"); f.sample(false, 0);
    expect(f.engine.snapshot().rows[0]).toMatchObject({ active: true, quality: "bad", shelving: { mode: "one-shot" } });
    f.sample(false); expect(f.engine.snapshot().rows[0].shelving).toBeUndefined(); expect(f.engine.snapshot().history.slice(-2).map(e => e.state)).toEqual(["Outgoing", "Unshelved"]);
    expect(f.engine.snapshot().history.at(-1)?.shelving).toMatchObject({ cause: "returned" });
  });
  it("one-shot ha comunque una scadenza e il riavvio non ripristina allarmi sospesi", () => {
    const f = fixture(); f.sample(true); f.engine.action(f.command("shelve", { mode: "one-shot" }), "operator"); f.advance(60000); f.engine.tick(); expect(f.engine.snapshot().rows[0].shelving).toBeUndefined();
    f.engine.action(f.command(), "operator"); const restarted = createAlarmEngine(f.catalog, variables); expect(restarted.snapshot().rows[0]).toMatchObject({ active: null, quality: "unknown" }); expect(restarted.snapshot().rows[0].shelving).toBeUndefined();
  });
  it("rifiuta revisioni vecchie, doppia sospensione, limiti e allarmi non attivi o invalidi", () => {
    const f = fixture(); f.sample(true); const stale = f.command(); f.engine.action(stale, "operator"); expect(() => f.engine.action(stale, "operator")).toThrow(/cambiato/); expect(() => f.engine.action(f.command(), "operator")).toThrow(/non disponibile/);
    f.engine.action(f.command("unshelve"), "operator"); expect(() => f.engine.action(f.command("shelve", { minutes: 11 }), "operator")).toThrow(/non disponibile/);
    f.sample(false); expect(() => f.engine.action(f.command(), "operator")).toThrow(/non disponibile/); f.sample(true, 0); expect(() => f.engine.action(f.command(), "operator")).toThrow(/non disponibile/);
  });
  it("rifiuta un ripristino ritardato dopo la scadenza invece di applicarlo a una nuova sospensione", () => {
    const f = fixture(); f.sample(true); f.engine.action(f.command(), "operator"); const stale = f.command("unshelve"); f.advance(60000); expect(() => f.engine.action(stale, "operator")).toThrow(/cambiato/);
    f.engine.action(f.command(), "operator"); expect(() => f.engine.action(stale, "operator")).toThrow(/cambiato/);
  });
  it("valida snapshot e storico con motivi e scadenze, senza inventare un autore per gli automatismi", () => {
    const f = fixture(); f.sample(true); f.engine.action(f.command(), "operator"); const snapshot = { ...f.engine.snapshot(), actionsEnabled: true };
    expect(parseAlarmSnapshot(snapshot)).toEqual(snapshot); const event = snapshot.history.at(-1)!; expect(parseHistoryEvent(event)).toEqual(event);
    for (const shelving of [{ ...event.shelving, reason: "" }, { ...event.shelving, until: event.time - 1 }, { ...event.shelving, credential: "secret" }]) expect(() => parseHistoryEvent({ ...event, shelving })).toThrow();
    f.advance(60000); f.engine.tick(); expect(parseHistoryEvent(f.engine.snapshot().history.at(-1)!)).toMatchObject({ shelving: { cause: "elapsed" } }); expect(() => parseHistoryEvent({ ...f.engine.snapshot().history.at(-1), actor: "forged" })).toThrow();
  });
  it("statistiche contano gli eventi di sospensione senza contarli come prese visione", () => {
    const f = fixture(); f.sample(true); f.engine.action(f.command(), "operator"); f.advance(1000); f.engine.action(f.command("unshelve"), "operator"); f.advance(1000); f.sample(false);
    const accumulator = createAlarmStatisticsAccumulator(); for (const event of f.engine.snapshot().history) accumulator.push({ seq: event.sequence, instanceId: f.engine.snapshot().instanceId, recordedAt: new Date(event.time).toISOString(), event });
    const result = accumulator.finish("frequency", 50); expect(result.rows[0]).toMatchObject({ events: 4, incoming: 1, outgoing: 1, acknowledged: 0, active: { totalMs: 2000 }, ack: { pairs: 0 } });
  });
  it("le capacità di sospensione rispettano anche l'ACL per singolo allarme", () => {
    const limits = defaultOperatorResources(); limits.alarmActions = { mode: "selected", ids: ["motor"] }; const store = { version: 2 as const, resourceRules: [{ accountId: "operator", limits }] };
    for (const capability of ["alarms.shelve", "alarms.unshelve"] as const) { expect(operatorResourceAllowed(store, "operator", capability, { alarmId: "motor" })).toBe(true); expect(operatorResourceAllowed(store, "operator", capability, { alarmId: "other" })).toBe(false); expect(operatorResourceAllowed(store, "operator", capability)).toBe(false); }
  });
});
