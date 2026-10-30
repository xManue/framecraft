// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { dataLogDeadbandAllows, dataLogDeadbandValid, type DataLogDeadband } from "../runtime/data-log-deadband.mjs";
import { createServiceDataLogEngine, dataLogDefinitionKey, parseServiceDataLogs, type DataLogPoint, type ServiceDataLogs } from "../runtime/data-log.mjs";

const absolute = (value: number): DataLogDeadband => ({ mode: "absolute", value });
const percent = (value: number): DataLogDeadband => ({ mode: "percentage", value });
const catalog = (): ServiceDataLogs => ({ version: 1, projectKey: "synthetic", logs: [{ id: "process", name: "Processo", enabled: true, storage: "runtime", retentionMs: 60000, maxEntries: 100, segmentDurationMs: 60000, deadband: absolute(5), tags: [{ id: "value", name: "Valore", tag: "Value", mode: "on-change", cycleMs: 500, includeUnchanged: false, smoothingSamples: 1, aggregation: "none", aggregationWindowMs: 1000 }] }] });
const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0)) close(); });
function collector(c = catalog()) {
  const rows: DataLogPoint[] = []; let at = 0;
  const engine = createServiceDataLogEngine({ catalog: c, now: () => at, write: batch => rows.push(...batch) });
  engine.start(); cleanup.push(() => engine.stop());
  return { rows, engine, update(value: string, qualityCode = 192) { at++; engine.update({ tag: "Value", value, qualityCode }); } };
}

describe("filtro variazioni dei Data Log", () => {
  it.each([null, {}, { mode: "absolute", value: -1 }, { mode: "absolute", value: Infinity }, { mode: "absolute", value: "5" }, { mode: "guess", value: 5 }, { mode: "percentage", value: 2, extra: true }])("rifiuta una configurazione ambigua: %j", value => {
    expect(dataLogDeadbandValid(value)).toBe(false);
    const c = catalog(); Object.assign(c.logs[0], { deadband: value }); expect(() => parseServiceDataLogs(c)).toThrow();
  });

  it("include la soglia esatta in entrambe le direzioni, senza arrotondare i decimali", () => {
    expect(dataLogDeadbandAllows("0.3", "0.4", absolute(0.1))).toBe(true);
    expect(dataLogDeadbandAllows("0.3", "0.2", absolute(0.1))).toBe(true);
    expect(dataLogDeadbandAllows("0.3", "0.39999999999999999", absolute(0.1))).toBe(false);
    expect(dataLogDeadbandAllows("1", "1.0", absolute(0))).toBe(false);
    expect(dataLogDeadbandAllows("1", "1.0")).toBe(true); // Existing string-change semantics with no filter.
  });

  it("mantiene la precisione di Int64 e UInt64 oltre il limite Number", () => {
    expect(dataLogDeadbandAllows("9223372036854775806", "9223372036854775807", absolute(1))).toBe(true);
    expect(dataLogDeadbandAllows("18446744073709551614", "18446744073709551615", absolute(2))).toBe(false);
    expect(dataLogDeadbandAllows("-9223372036854775808", "-9223372036854775807", absolute(1))).toBe(true);
  });

  it("usa la percentuale di |precedente| e definisce il passaggio da zero", () => {
    expect(dataLogDeadbandAllows("10", "12", percent(20))).toBe(true);
    expect(dataLogDeadbandAllows("10", "11.99", percent(20))).toBe(false);
    expect(dataLogDeadbandAllows("-10", "-8", percent(20))).toBe(true);
    expect(dataLogDeadbandAllows("-10", "-12", percent(20))).toBe(true);
    expect(dataLogDeadbandAllows("0", "0.000001", percent(99))).toBe(true);
    expect(dataLogDeadbandAllows("0", "-0", percent(0))).toBe(false);
  });

  it("confronta LReal estremi senza overflow o underflow del rapporto", () => {
    expect(dataLogDeadbandAllows("-1e308", "1e308", percent(200))).toBe(true);
    expect(dataLogDeadbandAllows("-1e308", "1e308", percent(201))).toBe(false);
    expect(dataLogDeadbandAllows("5e-324", "1e-323", percent(100))).toBe(true);
    expect(dataLogDeadbandAllows("5e-324", "1e-323", absolute(5e-324))).toBe(true);
    expect(dataLogDeadbandAllows(undefined, "NaN", absolute(0))).toBe(false);
    expect(dataLogDeadbandAllows("1", "1e999", absolute(0))).toBe(false);
  });

  it("conserva la chiave delle serie esistenti e cambia soltanto le serie con filtro effettivo", () => {
    const c = catalog(), log = c.logs[0], tag = log.tags[0]; delete log.deadband;
    const legacy = dataLogDefinitionKey(log, tag); log.deadband = { mode: "none", value: 42 }; expect(dataLogDefinitionKey(log, tag)).toBe(legacy);
    log.deadband = absolute(5); expect(dataLogDefinitionKey(log, tag)).not.toBe(legacy);
    tag.deadband = { mode: "none", value: 0 }; expect(dataLogDefinitionKey(log, tag)).toBe(legacy);
    tag.mode = "cyclic"; delete tag.deadband; const cyclic = dataLogDefinitionKey(log, tag); log.deadband = percent(10); expect(dataLogDefinitionKey(log, tag)).toBe(cyclic);
  });

  it("richiede tipi numerici solo per le variabili filtrate e accetta la disattivazione individuale", () => {
    const c = catalog(), variables = [{ name: "Value", dataType: "STRING", access: "read" }];
    expect(() => parseServiceDataLogs(c, variables)).toThrow(); c.logs[0].tags[0].deadband = { mode: "none", value: 0 };
    expect(parseServiceDataLogs(c, variables)).toEqual(c);
  });

  it("accumula i piccoli cambi rispetto all’ultimo valore ammesso, non all’ultima lettura", () => {
    const f = collector(); for (const value of ["10", "11", "14", "15", "18", "20", "19", "15"]) f.update(value);
    expect(f.rows.map(row => row.value)).toEqual(["10", "15", "20", "15"]);
  });

  it("non nasconde perdita di qualità, recupero o il primo valore dopo il riavvio", () => {
    const f = collector(); f.update("10"); f.update("11"); f.update("11", 0); f.update("11", 128); f.update("11"); f.update("12");
    expect(f.rows.map(row => [row.value, row.qualityCode])).toEqual([["10", 192], ["11", 0], ["11", 128], ["11", 192]]);
    f.engine.stop(); f.engine.start(); f.update("12"); expect(f.rows.at(-1)).toMatchObject({ value: "12", qualityCode: 192 });
  });

  it("isola le soglie per serie, include gli override e lascia invariati i campionamenti manuali", () => {
    const c = catalog(), tag = c.logs[0].tags[0]; c.logs[0].tags.push({ ...tag, id: "raw", deadband: { mode: "none", value: 0 } }, { ...tag, id: "manual", mode: "on-demand", includeUnchanged: true });
    const f = collector(c); f.update("10"); f.update("11"); f.engine.request("process", "manual"); f.engine.request("process", "manual");
    expect(f.rows.filter(r => r.loggedTagId === "value").map(r => r.value)).toEqual(["10"]);
    expect(f.rows.filter(r => r.loggedTagId === "raw").map(r => r.value)).toEqual(["10", "11"]);
    expect(f.rows.filter(r => r.loggedTagId === "manual").map(r => r.value)).toEqual(["11", "11"]);
  });

  it("applica limiti e filtro prima delle elaborazioni senza far avanzare la base sui rifiuti", () => {
    const c = catalog(); Object.assign(c.logs[0].tags[0], { maximum: 20, smoothingSamples: 2, aggregation: "average" });
    const f = collector(c); for (const value of ["10", "12", "100", "15"]) f.update(value); f.engine.stop();
    expect(f.rows).toMatchObject([{ value: "11.25", qualityCode: 192, partial: true }]); // Mean of accepted 10 and smoothed 12.5.
  });
});
