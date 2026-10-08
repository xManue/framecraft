// @vitest-environment node
import { describe, expect, it } from "vitest";
import { alarmCatalogIssues, alarmStateLabel, createAlarmEngine, emptyAlarmCatalog, parseAlarmCatalog, parseAlarmSnapshot, type AlarmCatalog, type AlarmCommand } from "../runtime/alarm-engine.mjs";

const variable = (dataType = "Bool") => [{ name: "Signal", dataType, access: "read" }];
function catalog(acknowledgment: "none" | "single" | "reset" = "single"): AlarmCatalog {
  return { ...emptyAlarmCatalog(), classes: [{ name: "Alarm_CTH", acknowledgment }], alarms: [{ id: "a1", name: "Motor", text: "Controlla il motore", area: "Zona 1", tag: "Signal", className: "Alarm_CTH", enabled: true, priority: 10, trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] };
}
function fixture(model: "none" | "single" | "reset" = "single") {
  let time = 1000, occurrence = 0; const engine = createAlarmEngine(catalog(model), variable(), { now: () => ++time, occurrenceId: () => "occ-" + ++occurrence });
  return { engine, row: () => engine.snapshot().rows[0], sample: (value: string | boolean, qualityCode?: number) => engine.updateSample({ tag: "Signal", value, qualityCode }),
    action: (action: AlarmCommand["action"]) => { const row = engine.snapshot().rows[0]; return engine.action({ alarmId: row.id, occurrence: row.occurrence!, revision: row.revision, action }, "Operatore"); } };
}
describe("motore allarmi condiviso", () => {
  it("parte sconosciuto, non inventa un guasto né un rientro", () => {
    const f = fixture(); expect(f.row()).toMatchObject({ active: null, pending: false, quality: "unknown" });
    f.sample("1"); expect(f.row().active).toBeNull(); expect(f.engine.snapshot().history).toEqual([]);
    f.sample("0", 192); expect(f.row()).toMatchObject({ active: false, pending: false, quality: "good" }); expect(f.engine.snapshot().history).toEqual([]);
  });
  it("prima lettura attiva, nessun evento duplicato per campioni uguali", () => {
    const f = fixture(); f.sample("1", 192); const first = f.row(); f.sample("1", 192);
    expect(f.row()).toEqual(first); expect(f.engine.snapshot().history.map((e) => e.state)).toEqual(["Incoming"]);
  });
  it.each([undefined, 0, 64, 255.5, 65536])("qualità %s non chiude un allarme e non assegna Good", (quality) => {
    const f = fixture(); f.sample("1", 192); f.sample("0", quality);
    expect(f.row()).toMatchObject({ active: true, pending: true }); expect(f.row().quality).not.toBe("good"); expect(f.engine.snapshot().history).toHaveLength(1);
    f.sample("0", 192); expect(f.row()).toMatchObject({ active: false, pending: true, quality: "good" });
  });
  it("lastError e valore Bool improprio conservano lo stato attivo", () => {
    const f = fixture(); f.sample("1", 192); f.engine.updateSample({ tag: "Signal", value: "0", qualityCode: 192, lastError: "OFFLINE" });
    f.sample("banana", 192); expect(f.row()).toMatchObject({ active: true, quality: "bad" }); expect(f.row().diagnostic).toContain("incompatibile");
  });
  it.each(["none", "single", "reset"] as const)("modello %s: la presa visione non spegne il guasto", (model) => {
    const f = fixture(model); f.sample("1", 192);
    if (model === "none") expect(() => f.action("acknowledge")).toThrow("non richiede"); else f.action("acknowledge");
    expect(f.row().active).toBe(true); f.sample("0", 192); expect(f.row().pending).toBe(model === "reset");
    if (model === "reset") { f.action("confirm"); expect(f.row().pending).toBe(false); }
  });
  it("rientro prima della presa visione resta pendente", () => {
    const f = fixture(); f.sample("1", 192); f.sample("0", 192); expect(alarmStateLabel(f.row())).toContain("da prendere");
    f.action("acknowledge"); expect(f.row().pending).toBe(false); expect(f.engine.snapshot().history.map((e) => e.state)).toEqual(["Incoming", "Outgoing", "Acknowledged"]);
  });
  it("la conferma richiede rientro, qualità buona e presa visione", () => {
    const f = fixture("reset"); f.sample("1", 192); expect(() => f.action("confirm")).toThrow("solo dopo"); f.action("acknowledge");
    expect(() => f.action("confirm")).toThrow("solo dopo"); f.sample("0", 192); f.sample("0", 0); expect(() => f.action("confirm")).toThrow("solo dopo");
    f.sample("0", 192); f.action("confirm"); expect(f.row()).toMatchObject({ confirmed: true, pending: false });
  });
  it("nuovo fronte pendente azzera la presa visione, senza perdere la condizione", () => {
    const f = fixture("reset"); f.sample("1", 192); f.action("acknowledge"); f.sample("0", 192); const occurrence = f.row().occurrence;
    f.sample("1", 192); expect(f.row()).toMatchObject({ acknowledged: false, pending: true, occurrence });
    f.action("acknowledge"); f.sample("0", 192); f.action("confirm"); f.sample("1", 192); expect(f.row().occurrence).not.toBe(occurrence);
  });
  it("revisioni e occorrenze impediscono il comando su un allarme cambiato o il replay", () => {
    const f = fixture(); f.sample("1", 192); const row = f.row(), command = { alarmId: row.id, occurrence: row.occurrence!, revision: row.revision, action: "acknowledge" as const };
    f.sample("0", 0); expect(() => f.engine.action(command, "Operatore")).toThrow("cambiato");
    f.action("acknowledge"); expect(() => f.action("acknowledge")).toThrow("non richiede");
    expect(() => f.engine.action({ ...command, revision: f.row().revision, occurrence: "wrong" }, "Operatore")).toThrow("cambiato");
  });
  it.each([["DWORD", 31, "2147483648"], ["LWORD", 63, "9223372036854775808"], ["LINT", 63, "-1"], ["INT", 15, "-32768"]])("bit alto di %s resta esatto", (type, bit, value) => {
    const c = catalog(); c.alarms[0].trigger = { kind: "bit", bit: bit as number, activeWhen: "set" }; const engine = createAlarmEngine(c, variable(type as string));
    engine.updateSample({ tag: "Signal", value: value as string, qualityCode: 192 }); expect(engine.snapshot().rows[0].active).toBe(true);
    engine.updateSample({ tag: "Signal", value: "0", qualityCode: 192 }); expect(engine.snapshot().rows[0].active).toBe(false);
  });
  it("rifiuta interi 64 bit già arrotondati e fuori range", () => {
    const engine = createAlarmEngine(catalog(), variable("LWORD"));
    for (const value of [9007199254740992, "18446744073709551616", "1.5"]) { engine.updateSample({ tag: "Signal", value, qualityCode: 192 }); expect(engine.snapshot().rows[0]).toMatchObject({ active: null, quality: "bad" }); }
  });
  it("bit a zero attiva il modello invertito", () => {
    const c = catalog(); c.alarms[0].trigger = { kind: "bit", bit: 0, activeWhen: "clear" }; const engine = createAlarmEngine(c, variable());
    engine.updateSample({ tag: "Signal", value: "0", qualityCode: 192 }); expect(engine.snapshot().rows[0].active).toBe(true);
  });
  it.each(["high", "low"] as const)("soglia %s e isteresi applicate anche dopo la perdita qualità", (kind) => {
    const c = catalog(); c.alarms[0].trigger = { kind, limit: 10, hysteresis: 2 }; const engine = createAlarmEngine(c, variable("Real"));
    const sample = (value: number, qualityCode = 192) => engine.updateSample({ tag: "Signal", value, qualityCode });
    sample(10); expect(engine.snapshot().rows[0].active).toBe(false);
    sample(kind === "high" ? 11 : 9); expect(engine.snapshot().rows[0].active).toBe(true);
    sample(kind === "high" ? 9 : 11); expect(engine.snapshot().rows[0].active).toBe(true);
    sample(0, 0); expect(engine.snapshot().rows[0].active).toBe(true);
    sample(kind === "high" ? 8 : 12); expect(engine.snapshot().rows[0].active).toBe(false);
  });
  it("lettori e listener non condividono oggetti mutabili con il motore", () => {
    const f = fixture(); f.engine.subscribe((value) => { value.rows[0].text = "wrong"; throw new Error("Viewer"); });
    const snapshot = f.engine.snapshot(); snapshot.rows[0].trigger = { kind: "bit", bit: 9, activeWhen: "set" }; f.sample("1", 192); expect(f.row().text).toBe("Controlla il motore");
    expect(f.row().active).toBe(true);
  });
  it("storico limitato esplicito e parser del confine HTTP", () => {
    const c = catalog("none"); c.maxHistory = 100; const engine = createAlarmEngine(c, variable());
    for (let i = 0; i < 250; i++) engine.updateSample({ tag: "Signal", value: i % 2, qualityCode: 192 });
    const value = { ...engine.snapshot(), actionsEnabled: false }; expect(value.history).toHaveLength(100); expect(value.historyDropped).toBe(149);
    expect(parseAlarmSnapshot(value)).toEqual(value); expect(() => parseAlarmSnapshot({ ...value, historyDropped: 0 })).toThrow("non valido");
    value.rows[0].revision = NaN; expect(() => parseAlarmSnapshot(value)).toThrow("non valido");
  });
  it("catalogo vuoto è valido, JSON invalido non viene sostituito con default", () => {
    expect(alarmCatalogIssues(emptyAlarmCatalog(), [])).toEqual([]); expect(() => parseAlarmCatalog("broken")).toThrow();
    expect(() => createAlarmEngine(catalog(), [])).toThrow("dichiarato");
  });
  it("il confine HTTP rifiuta stati incoerenti e testi di eventi non appartenenti al catalogo", () => {
    const f = fixture(); f.sample("1", 192); const first = { ...f.engine.snapshot(), actionsEnabled: false }; first.rows[0].pending = false;
    expect(() => parseAlarmSnapshot(first)).toThrow("incoerente"); const second = { ...f.engine.snapshot(), actionsEnabled: false }; second.history[0].text = "OTHER"; expect(() => parseAlarmSnapshot(second)).toThrow("incoerente");
  });
  it("proprietà estranee e budget della risposta gateway sono bloccati senza esporre dati", () => {
    const c = catalog(); expect(alarmCatalogIssues({ ...c, password: "PRIVATE" })[0].message).not.toContain("PRIVATE");
    c.maxHistory = 10000; c.alarms[0].text = "x".repeat(1000); expect(alarmCatalogIssues(c).some((i) => i.path === "maxHistory")).toBe(true);
  });
  it("valida collisioni, tipo/accesso, soglie, classe, ID e limite memoria", () => {
    const c = catalog(); c.alarms.push({ ...c.alarms[0] }); c.maxHistory = 20000;
    expect(alarmCatalogIssues(c, variable("Real")).map((i) => i.path)).toEqual(expect.arrayContaining(["maxHistory", "alarms.1.id", "alarms.0.trigger.bit", "alarms.1.trigger.bit"]));
    c.alarms[0].className = "missing"; c.alarms[0].trigger = { kind: "high", limit: Infinity, hysteresis: -1 };
    expect(alarmCatalogIssues(c, [{ ...variable()[0], access: "write" }]).map((i) => i.path)).toEqual(expect.arrayContaining(["alarms.0.tag", "alarms.0.className", "alarms.0.trigger.limit"]));
  });
  it("un allarme disabilitato non viene acquisito e non scrive nel PLC", () => {
    const c = catalog(); c.alarms[0].enabled = false; const engine = createAlarmEngine(c, variable()); engine.updateSample({ tag: "Signal", value: "1", qualityCode: 192 }); expect(engine.snapshot().rows).toEqual([]); expect(engine.snapshot().history).toEqual([]);
  });
});
