// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataLogError, createServiceDataLogEngine, dataLogDefinitionKey, parseServiceDataLogs, parseDataLogSnapshot, type DataLogPoint, type ServiceDataLogs, type DataLogInput } from "../runtime/data-log.mjs";
import { openDataLogStore } from "../runtime/data-log-store.mjs";

const definition = (): ServiceDataLogs => ({ version: 1, projectKey: "synthetic", logs: [{ id: "temperatures", name: "Temperature", enabled: true, storage: "runtime", retentionMs: 60000, maxEntries: 100, segmentDurationMs: 60000, tags: [{ id: "motor", name: "Motore", tag: "Temperature", mode: "on-change", cycleMs: 500, includeUnchanged: false, smoothingSamples: 1, aggregation: "none", aggregationWindowMs: 1000 }] }] });
const variables = [{ name: "Temperature", dataType: "Real", access: "read" }, { name: "Trigger", dataType: "Bool", access: "read" }];
const cleanup: (() => void)[] = []; afterEach(() => { for (const f of cleanup.splice(0)) f(); });
function engine(catalog = definition()) {
  let at = Date.parse("2026-10-29T12:00:00Z"), clock = 0; const rows: DataLogPoint[] = [], errors: DataLogError[] = [], latest = new Map<string, DataLogInput>();
  const logger = createServiceDataLogEngine({ catalog, now: () => at, monotonic: () => clock, write: batch => rows.push(...batch), onError: e => errors.push(e), read: tag => latest.get(tag) }); logger.start(); cleanup.push(() => logger.stop());
  return { logger, rows, errors, advance(ms: number) { at += ms; clock += ms; }, civil(ms: number) { at += ms; }, update(value?: string, qualityCode = 192, patch = {}) { const sample = { tag: "Temperature", value, qualityCode, ...patch }; latest.set(sample.tag, sample); logger.update(sample); } };
}
async function store() { await mkdir(path.resolve(".hmi-preview"), { recursive: true }); const root = await mkdtemp(path.resolve(".hmi-preview/service-log-")), namespace = randomUUID(), catalog = definition(); let at = Date.parse("2026-10-29T12:00:00Z"); const options = { root, namespace, catalog, now: () => at }, writer = openDataLogStore(options), tag = catalog.logs[0].tags[0], key = dataLogDefinitionKey(catalog.logs[0], tag), query = { logId: "temperatures", loggedTagId: "motor", definition: key, from: at - 1000, to: at + 1000000 };
  const point = (index: number): DataLogPoint => ({ logId: "temperatures", loggedTagId: "motor", definition: key, tag: "Temperature", time: at + index, value: String(index), qualityCode: 192, sourceTimestamp: at - 100, partial: false });
  return { writer, options, key, query, point, advance(ms: number) { at += ms; }, file: path.join(root, ".framecraft-runtime/data-logs/samples.sqlite") };
}
describe("Data Log sul servizio", () => {
  it("valida i tag reali e rifiuta tipi, ID e impostazioni sconosciute senza cambiare il catalogo", () => {
    const c = definition(); expect(parseServiceDataLogs(c, variables)).toEqual(c); expect(c.logs[0].storage).toBe("runtime");
    for (const patch of [{ tag: "Unknown" }, { cycleMs: 1 }, { aggregation: "guess" }, { maximum: -2, minimum: 5 }]) { const bad = definition(); Object.assign(bad.logs[0].tags[0], patch); expect(() => parseServiceDataLogs(bad, variables)).toThrow(); }
    const bad = definition(); bad.logs[0].tags.push({ ...bad.logs[0].tags[0] }); expect(() => parseServiceDataLogs(bad, variables)).toThrow();
  });
  it("registra cambi di qualità e recupero anche a valore invariato, senza trasformare dati Bad in valori validi", () => {
    const f = engine(); f.update("10", 192, { sourceTimestamp: 1234 }); f.update("10"); f.update("10", 0); f.update("10", 0); f.update("10", 192); expect(f.rows.map(r => [r.value, r.qualityCode])).toEqual([["10", 192], ["10", 0], ["10", 192]]); expect(f.rows[0].sourceTimestamp).toBe(1234); expect(f.logger.status()).toMatchObject({ state: "recording", written: 3 });
  });
  it("usa il clock monotono per i cicli e non recupera campioni mai acquisiti dopo una pausa", () => {
    const c = definition(); Object.assign(c.logs[0].tags[0], { mode: "cyclic", includeUnchanged: true }); const f = engine(c); f.update("12"); f.advance(500); f.logger.tick(); f.advance(10000); f.civil(-30000); f.logger.tick(); expect(f.rows).toHaveLength(2); expect(f.rows[1].time).toBeLessThan(f.rows[0].time); f.logger.tick(); expect(f.rows).toHaveLength(2);
  });
  it("arma il trigger senza inventare un fronte all’avvio e legge solo il valore corrente", () => {
    const c = definition(); Object.assign(c.logs[0].tags[0], { mode: "on-demand", triggerTag: "Trigger", triggerCondition: "rising", includeUnchanged: true }); const f = engine(c); f.update("8"); const trigger = (value: string) => f.logger.update({ tag: "Trigger", value, qualityCode: 192 }); trigger("1"); trigger("0"); f.update("9"); trigger("1"); expect(f.rows.map(r => r.value)).toEqual(["9"]); f.logger.request("temperatures", "motor"); expect(f.rows).toHaveLength(2); expect(() => f.logger.request("other")).toThrow();
  });
  it("elabora medie con memoria limitata, marca le finestre parziali e separa la qualità invalida", () => {
    const c = definition(); Object.assign(c.logs[0].tags[0], { aggregation: "average", smoothingSamples: 2 }); const f = engine(c); f.update("2"); f.update("4"); f.advance(1000); f.logger.tick(); expect(f.rows[0]).toMatchObject({ value: "2.5", partial: false }); f.update("6"); f.logger.stop(); expect(f.rows[1]).toMatchObject({ value: "5", partial: true });
  });
  it("conserva come parziale la finestra valida interrotta da qualità Bad", () => {
    const c = definition(); c.logs[0].tags[0].aggregation = "average"; const f = engine(c); f.update("2"); f.update("4"); f.advance(200); f.update("4", 0); expect(f.rows.map(r => [r.value, r.qualityCode, r.partial])).toEqual([["3", 192, true], ["4", 0, false]]); f.update("8", 192); f.advance(1000); f.logger.tick(); expect(f.rows.at(-1)).toMatchObject({ value: "8", qualityCode: 192, partial: false });
  });
  it("calcola medie finite anche vicino ai limiti LReal e con segni opposti", () => {
    const c = definition(); Object.assign(c.logs[0].tags[0], { mode: "cyclic", includeUnchanged: true, aggregation: "average", smoothingSamples: 2 }); const f = engine(c); f.update("1e308"); f.advance(500); f.logger.tick(); f.advance(500); f.logger.tick(); expect(f.rows[0].value).toBe("1e+308"); f.update("-1e308"); f.advance(500); f.logger.tick(); f.advance(500); f.logger.tick(); expect(f.rows.every(row => Number.isFinite(Number(row.value)))).toBe(true);
    const opposite = definition(); opposite.logs[0].tags[0].aggregation = "average"; const g = engine(opposite); g.update("-1e308"); g.update("1e308"); g.advance(1000); g.logger.tick(); expect(g.rows[0].value).toBe("0");
  });
  it("un errore del disco ferma la registrazione senza propagarsi ai callback PLC", () => {
    const onError = vi.fn(), logger = createServiceDataLogEngine({ catalog: definition(), write: () => { throw new Error("PRIVATE_DISK_DETAIL"); }, onError }); logger.start(); cleanup.push(() => logger.stop()); expect(() => logger.update({ tag: "Temperature", value: "1", qualityCode: 192 })).not.toThrow(); logger.update({ tag: "Temperature", value: "2", qualityCode: 192 }); expect(onError).toHaveBeenCalledTimes(1); expect(logger.status()).toMatchObject({ state: "error", written: 0, code: "DATA_LOG_STORAGE" }); expect(onError.mock.calls[0][0].message).not.toContain("PRIVATE");
  });
  it("persiste e rilegge campioni con paginazione ancorata, predecessore e timestamp distinti", async () => {
    const f = await store(); f.writer.append([f.point(0), f.point(10), f.point(20)]); const first = f.writer.query({ ...f.query, from: f.point(5).time, includePrevious: true, limit: 1 }); expect(parseDataLogSnapshot(first, { ...f.query, from: f.point(5).time, includePrevious: true, limit: 1 })).toEqual(first); expect(first.previous?.value).toBe("0"); expect(first.samples[0].value).toBe("10");
    f.writer.append([f.point(30)]); const next = f.writer.query({ ...f.query, limit: 1, after: first.nextAfter!, archiveId: first.id, through: first.through, floor: first.floor }); expect(next.samples.map(r => r.value)).toEqual(["20"]); f.writer.close(); const reader = openDataLogStore({ ...f.options, readOnly: true }); try { expect(reader.query(f.query).samples).toHaveLength(4); expect(reader.query(f.query).samples[0].sourceTimestamp).not.toBe(reader.query(f.query).samples[0].time); } finally { reader.close(); }
  });
  it("applica la capacità e la conservazione nel disco, invalidando una lettura incompleta", async () => {
    const f = await store(); try { f.writer.append(Array.from({ length: 100 }, (_, i) => f.point(i))); const first = f.writer.query({ ...f.query, limit: 1 }); f.writer.append([f.point(100)]); expect(f.writer.query(f.query).samples).toHaveLength(100); expect(() => f.writer.query({ ...f.query, after: first.nextAfter!, archiveId: first.id, through: first.through, floor: first.floor })).toThrow(expect.objectContaining({ code: "DATA_LOG_EXPIRED" })); f.advance(61000); f.writer.maintain(); expect(f.writer.query(f.query).samples).toHaveLength(0); } finally { f.writer.close(); }
  });
  it("non mescola campioni di configurazioni diverse e non modifica il disco in sola lettura", async () => {
    const f = await store(); f.writer.append([f.point(0)]); f.writer.close(); const before = await readFile(f.file), reader = openDataLogStore({ ...f.options, readOnly: true }); try { expect(() => reader.append([f.point(1)])).toThrow(); reader.maintain(); expect(() => reader.query({ ...f.query, definition: "other" })).toThrow(expect.objectContaining({ code: "DATA_LOG_CHANGED" })); expect(reader.query(f.query).samples).toHaveLength(1); } finally { reader.close(); } expect(await readFile(f.file)).toEqual(before);
  });
  it("conserva la ricevuta del campionamento nella stessa transazione anche dopo riapertura", async () => {
    const f = await store(), receipt = { id: randomUUID(), actor: "local:synthetic", fingerprint: "a".repeat(64) }; f.writer.append([f.point(0)], receipt); expect(f.writer.lookup(receipt.id, receipt.actor, receipt.fingerprint)).toEqual({ id: receipt.id, count: 1 }); expect(() => f.writer.lookup(receipt.id, "other", receipt.fingerprint)).toThrow(); f.writer.close(); const reader = openDataLogStore({ ...f.options, readOnly: true }); try { expect(reader.lookup(receipt.id, receipt.actor, receipt.fingerprint)?.count).toBe(1); expect(reader.query(f.query).samples).toHaveLength(1); } finally { reader.close(); }
  });
  it("rifiuta un database occupato o un namespace diverso senza cancellare o riparare l’archivio", async () => {
    const f = await store(); try { expect(() => openDataLogStore(f.options)).toThrow(); expect(() => openDataLogStore({ ...f.options, namespace: randomUUID() })).toThrow(); f.writer.append([f.point(0)]); expect(f.writer.query(f.query).samples).toHaveLength(1); } finally { f.writer.close(); }
  });
});
