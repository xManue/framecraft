// @vitest-environment node
import { describe, expect, it } from "vitest";
import { alarmCatalogIssues, alarmDependencyTags, createAlarmEngine, emptyAlarmCatalog, parseAlarmCatalog, parseAlarmSnapshot, type AlarmAnalogKind, type AlarmCatalog, type AlarmSample, type AlarmTrigger } from "../runtime/alarm-engine.mjs";

const variables = [{ name: "Value", dataType: "LReal", access: "read" }, { name: "Limit", dataType: "LReal", access: "read" }];
function catalog(trigger: AlarmTrigger): AlarmCatalog { return { ...emptyAlarmCatalog(), alarms: [{ id: "analog", name: "Pressione", text: "Controlla pressione", tag: "Value", className: "Alarm_CTH", priority: 1, enabled: true, trigger }] }; }
const sample = (tag: string, value?: AlarmSample["value"], qualityCode: number | undefined = 192): AlarmSample => ({ tag, value, qualityCode });
const comparisons: [AlarmAnalogKind, boolean[]][] = [["high", [false, false, true]], ["low", [true, false, false]], ["high-equal", [false, true, true]], ["low-equal", [true, true, false]], ["equal", [false, true, false]], ["not-equal", [true, false, true]]];

describe("confronti analogici e soglie PLC", () => {
  for (const [kind, states] of comparisons) it.each([false, true])(`${kind}: confini con soglia PLC=%s`, dynamic => {
    for (const [index, value] of [9, 10, 11].entries()) {
      const engine = createAlarmEngine(catalog({ kind, limit: dynamic ? { tag: "Limit" } : 10, hysteresis: 0 }), variables);
      engine.updateSamples([sample("Value", value), ...(dynamic ? [sample("Limit", 10)] : [])]);
      expect(engine.snapshot().rows[0]).toMatchObject({ active: states[index], quality: "good" });
      expect(parseAlarmSnapshot({ ...engine.snapshot(), actionsEnabled: false }).rows[0].active).toBe(states[index]);
    }
  });
  it.each(["high", "low", "high-equal", "low-equal"] as const)("%s: confine di rientro e isteresi invariati dopo qualità persa", kind => {
    const high = kind.startsWith("high"), inclusive = kind.endsWith("equal"), engine = createAlarmEngine(catalog({ kind, limit: { tag: "Limit" }, hysteresis: 2 }), variables);
    engine.updateSamples([sample("Value", high ? 12 : 8), sample("Limit", 10)]); expect(engine.snapshot().rows[0].active).toBe(true);
    engine.updateSample(sample("Value", high ? 9 : 11)); expect(engine.snapshot().rows[0].active).toBe(true);
    engine.updateSample(sample("Limit", high ? 30 : -30, 0)); expect(engine.snapshot().rows[0]).toMatchObject({ active: true, quality: "bad" });
    engine.updateSample(sample("Limit", 10)); engine.updateSample(sample("Value", high ? 8 : 12)); expect(engine.snapshot().rows[0].active).toBe(inclusive);
    engine.updateSample(sample("Value", high ? 7.9 : 12.1)); expect(engine.snapshot().rows[0]).toMatchObject({ active: false, quality: "good" });
    expect(engine.snapshot().history.map(event => event.state)).toEqual(["Incoming", "Outgoing"]);
  });
  it.each([true, false])("attende entrambi i campioni, ordine soglia prima=%s, senza inventare zero", limitFirst => {
    const engine = createAlarmEngine(catalog({ kind: "high", limit: { tag: "Limit" }, hysteresis: 0 }), variables);
    engine.updateSample(sample(limitFirst ? "Limit" : "Value", limitFirst ? 10 : 20)); expect(engine.snapshot().rows[0]).toMatchObject({ active: null, quality: "unknown" }); expect(engine.snapshot().history).toEqual([]);
    engine.updateSample(sample(limitFirst ? "Value" : "Limit", limitFirst ? 20 : 10)); expect(engine.snapshot().rows[0]).toMatchObject({ active: true, quality: "good" });
    engine.updateSample(sample("Limit", 25)); expect(engine.snapshot().rows[0]).toMatchObject({ active: false, pending: true });
  });
  it.each([sample("Limit", undefined), { tag: "Limit" }, sample("Limit", 100, 0), sample("Limit", 100, 64), sample("Limit", "broken"), sample("Limit", true), sample("Limit", ""), { ...sample("Limit", 100), lastError: "OFFLINE" }])("soglia non valida conserva l’occorrenza (%j)", bad => {
    const engine = createAlarmEngine(catalog({ kind: "high", limit: { tag: "Limit" }, hysteresis: 1 }), variables);
    engine.updateSamples([sample("Value", 20), sample("Limit", 10)]); const occurrence = engine.snapshot().rows[0].occurrence;
    engine.updateSample(bad); engine.updateSample(sample("Value", 0)); expect(engine.snapshot().rows[0]).toMatchObject({ active: true, occurrence, pending: true }); expect(engine.snapshot().rows[0].quality).not.toBe("good"); expect(engine.snapshot().rows[0].diagnostic).toMatch(/soglia/i);
    expect(engine.snapshot().history).toHaveLength(1); engine.updateSample(sample("Limit", 10)); expect(engine.snapshot().history.map(event => event.state)).toEqual(["Incoming", "Outgoing"]);
  });
  it("segnale non valido non viene sanato dall’aggiornamento della sola soglia", () => {
    const engine = createAlarmEngine(catalog({ kind: "high", limit: { tag: "Limit" }, hysteresis: 0 }), variables);
    engine.updateSamples([sample("Value", 20), sample("Limit", 10)]); engine.updateSample(sample("Value", 0, 0)); engine.updateSample(sample("Limit", 100));
    expect(engine.snapshot().rows[0]).toMatchObject({ active: true, quality: "bad" }); expect(engine.snapshot().history).toHaveLength(1);
  });
  it("un gruppo di campioni valuta ogni allarme una volta, senza eventi transitori dall’ordine della mappa", () => {
    const engine = createAlarmEngine(catalog({ kind: "high", limit: { tag: "Limit" }, hysteresis: 0 }), variables), batches: unknown[] = [];
    engine.subscribe(snapshot => batches.push(snapshot)); engine.updateSamples([sample("Value", 10), sample("Limit", 15)]);
    engine.updateSamples([sample("Value", 20), sample("Limit", 25)]); expect(engine.snapshot().history).toEqual([]);
    engine.updateSamples([sample("Limit", 5), sample("Limit", 30), sample("Value", 20)]); expect(engine.snapshot().history).toEqual([]);
    const count = batches.length; engine.updateSamples([sample("Unknown", 9)]); expect(batches).toHaveLength(count);
    const before = engine.snapshot(); expect(() => engine.updateSamples(Array.from({ length: 4001 }, () => sample("Value", 50)))).toThrow("4000"); expect(engine.snapshot()).toEqual(before);
  });
  it("soglie condivise aggiornano e archiviano tutti gli allarmi coinvolti in un solo gruppo", () => {
    const c = catalog({ kind: "high", limit: { tag: "Limit" }, hysteresis: 0 }); c.alarms.push({ ...c.alarms[0], id: "other" }); const groups: unknown[][] = [];
    const engine = createAlarmEngine(c, variables, { onEvents: events => groups.push(events) }); engine.updateSamples([sample("Value", 20), sample("Limit", 30)]); engine.updateSample(sample("Limit", 10));
    expect(engine.snapshot().rows.every(row => row.active)).toBe(true); expect(groups).toHaveLength(1); expect(groups[0]).toHaveLength(2);
    const same = catalog({ kind: "equal", limit: { tag: "Value" }, hysteresis: 0 }), self = createAlarmEngine(same, variables); self.updateSample(sample("Value", 10)); expect(self.snapshot().history).toHaveLength(1); expect(alarmDependencyTags(same)).toEqual(["Value"]);
    c.alarms[1].enabled = false; expect(alarmDependencyTags(c)).toEqual(["Value", "Limit"]);
  });
  it("overflow della soglia mobile invalida la qualità, non genera un falso rientro", () => {
    const engine = createAlarmEngine(catalog({ kind: "high", limit: { tag: "Limit" }, hysteresis: Number.MAX_VALUE }), variables);
    engine.updateSamples([sample("Value", 20), sample("Limit", -1)]); expect(engine.snapshot().rows[0].active).toBe(true);
    engine.updateSample(sample("Limit", Number.MAX_VALUE)); expect(engine.snapshot().rows[0]).toMatchObject({ active: true, quality: "bad" }); expect(engine.snapshot().history).toHaveLength(1);
  });
  it("uguaglianza numerica è esatta: nessuna tolleranza, conversione di Bool o arrotondamento nascosto", () => {
    const engine = createAlarmEngine(catalog({ kind: "equal", limit: 0.3, hysteresis: 0 }), variables);
    engine.updateSample(sample("Value", 0.1 + 0.2)); expect(engine.snapshot().rows[0].active).toBe(false); engine.updateSample(sample("Value", "0.3")); expect(engine.snapshot().rows[0].active).toBe(true);
    engine.updateSample(sample("Value", false)); expect(engine.snapshot().rows[0]).toMatchObject({ active: true, quality: "bad" });
  });
  it("nessun oggetto o array diventa implicitamente un campione numerico valido, neanche per i bit", () => {
    const engine = createAlarmEngine(catalog({ kind: "bit", bit: 0, activeWhen: "set" }), [{ ...variables[0], dataType: "Int" }]);
    for (const value of [[1], { value: 1 }, null]) { engine.updateSample(sample("Value", value as unknown as string)); expect(engine.snapshot().rows[0]).toMatchObject({ active: null, quality: "bad" }); }
    expect(engine.snapshot().history).toEqual([]);
  });
  it.each(["Bool", "String", "LInt", "ULInt", "Date_and_time"])("non converte una soglia %s in un numero approssimato", dataType => {
    expect(alarmCatalogIssues(catalog({ kind: "high", limit: { tag: "Limit" }, hysteresis: 0 }), [variables[0], { ...variables[1], dataType }]).some(issue => issue.path.endsWith("trigger.limit"))).toBe(true);
  });
  it("un tag soltanto rilevato non può sovrascrivere il tipo di quello dichiarato", () => {
    const engine = createAlarmEngine(catalog({ kind: "high", limit: { tag: "Limit" }, hysteresis: 0 }), [...variables, ...variables.map(variable => ({ ...variable, dataType: "Bool", detected: true }))]);
    engine.updateSamples([sample("Value", 20), sample("Limit", 10)]); expect(engine.snapshot().rows[0]).toMatchObject({ active: true, quality: "good" });
  });
  it("rifiuta soglie mancanti, scrivibili soltanto, rilevate/duplicate o con proprietà nascoste", () => {
    const c = catalog({ kind: "high", limit: { tag: "Limit" }, hysteresis: 0 });
    for (const tags of [[variables[0]], [variables[0], { ...variables[1], access: "write" }], [variables[0], { ...variables[1], detected: true }], [...variables, variables[1]]]) expect(() => parseAlarmCatalog(c, tags)).toThrow("soglia");
    for (const limit of [null, [], "10", { tag: "" }, { tag: "Limit", fallback: 0 }]) { c.alarms[0].trigger = { kind: "high", limit, hysteresis: 0 } as AlarmTrigger; expect(alarmCatalogIssues(c).length).toBeGreaterThan(0); }
    for (const kind of ["equal", "not-equal"] as const) expect(alarmCatalogIssues(catalog({ kind, limit: 10, hysteresis: 1 })).some(issue => issue.path.endsWith("hysteresis"))).toBe(true);
  });
});
