import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { createAlarmStatisticsAccumulator, parseAlarmStatisticsQuery, parseAlarmStatisticsSnapshot, type AlarmHistoryEntry, type AlarmStatisticsSnapshot } from "../runtime/alarm-history.mjs";
import { openAlarmHistory } from "../runtime/alarm-history-store.mjs";
import { alarmStatisticsCsv } from "../src/core/hmiAlarmHistoryExport";
const archive = randomUUID(), instance = randomUUID(), time = Date.parse("2026-10-28T10:00:00.000Z");
function row(seq: number, state: AlarmHistoryEntry["event"]["state"] = "Incoming", offset = seq * 1000, patch: Partial<AlarmHistoryEntry["event"]> = {}, run = instance): AlarmHistoryEntry {
  return { seq, instanceId: run, recordedAt: new Date(time).toISOString(), event: { sequence: seq, id: "motor", occurrence: "same-pending-occurrence", name: "=Motore", text: 'Testo; con "virgolette" <img src=x>', alarmClass: "Guasto", area: "Linea", priority: 3, state, time: time + offset, ...(["Acknowledged", "Confirmed"].includes(state) ? { actor: "synthetic-operator" } : {}), ...patch } };
}
function snapshot(rows: AlarmHistoryEntry[], order: NonNullable<Parameters<typeof parseAlarmStatisticsQuery>[0]> = {}): AlarmStatisticsSnapshot {
  const input = parseAlarmStatisticsQuery(order), accumulator = createAlarmStatisticsAccumulator(); rows.forEach(value => accumulator.push(value));
  const sequence = rows.at(-1)?.seq ?? 0;
  return { version: 1, id: archive, namespace: archive, sequence, through: sequence, incompleteRuns: 0, capture: { state: "recording", unconfirmedInThisRun: 0 }, order: input.order, limit: input.limit, ...accumulator.finish(input.order, input.limit) };
}
async function fixture() { await mkdir(path.resolve(".hmi-preview"), { recursive: true }); const root = await mkdtemp(path.resolve(".hmi-preview/alarm-statistics-")), namespace = randomUUID(); return { root, namespace, file: path.join(root, ".framecraft-runtime/alarm-history/alarms.sqlite") }; }
it("pairs the latest activation when a pending occurrence reactivates, without counting a second acknowledgment twice", () => {
  const result = snapshot([row(1), row(2, "Outgoing"), row(3), row(4, "Acknowledged", 3500), row(5, "Outgoing", 4000), row(6, "Acknowledged", 5000), row(7, "Confirmed", 6000)]);
  expect(parseAlarmStatisticsSnapshot(result)).toEqual(result); expect(result).toMatchObject({ matchedEvents: 7, activations: 2, alarms: 1 });
  expect(result.rows[0]).toMatchObject({ incoming: 2, outgoing: 2, acknowledged: 2, confirmed: 1, active: { pairs: 2, totalMs: 2000, averageMs: 1000, unpaired: 0 }, ack: { pairs: 1, averageMs: 500, unpaired: 1, unmatchedTransitions: 1 }, interval: { pairs: 1, averageMs: 2000, unpaired: 1 } });
});
it("does not pair across restarts even if the alarm and occurrence identifiers coincide", () => {
  const next = randomUUID(), result = snapshot([row(1), row(2, "Outgoing", 2000, {}, next), row(3, "Incoming", 3000, {}, next), row(4, "Acknowledged", 4000, {}, next)]);
  expect(result.rows[0]).toMatchObject({ active: { pairs: 0, averageMs: null, unmatchedTransitions: 1, unpaired: 2 }, ack: { pairs: 1, averageMs: 1000 }, interval: { pairs: 0, averageMs: null } });
});
it("reports missing starts and clock reversals separately from real zero duration", () => {
  const result = snapshot([row(1, "Outgoing", 0), row(2, "Incoming", 2000), row(3, "Outgoing", 1000), row(4, "Acknowledged", 2000), row(5, "Incoming", 0)]);
  expect(parseAlarmStatisticsSnapshot(result).rows[0]).toMatchObject({ active: { pairs: 0, invalidPairs: 1, totalMs: 0, averageMs: null, unmatchedTransitions: 1 }, ack: { pairs: 1, totalMs: 0, averageMs: 0 }, interval: { invalidPairs: 1, averageMs: null } });
});
it("sorts the complete set before limiting and keeps explicit totals for hidden groups", () => {
  const result = snapshot([row(1, "Incoming", 0, { id: "a" }), row(2, "Incoming", 0, { id: "z" }), row(3, "Incoming", 1000, { id: "z" })], { limit: 1 });
  expect(result).toMatchObject({ matchedEvents: 3, activations: 3, alarms: 2 }); expect(result.rows.map(value => value.id)).toEqual(["z"]); expect(parseAlarmStatisticsSnapshot(result, { limit: 1 })).toEqual(result);
  const names = snapshot([row(1, "Incoming", 0, { id: "a", name: "Zeta" }), row(2, "Incoming", 0, { id: "z", name: "Alfa" })], { order: "name" }); expect(names.rows.map(value => value.id)).toEqual(["z", "a"]);
});
it("validates query fields, canonical times, cursor exclusion and order names", () => {
  for (const query of [{ before: 1 }, { sql: "SELECT" }, { order: "random" }, { limit: "50" }, { limit: 501 }, { archiveId: "x" }, { from: "2026-02-30T00:00:00.000Z" }, { from: "2026-10-29T00:00:00.000Z", to: "2026-10-28T00:00:00.000Z" }]) expect(() => parseAlarmStatisticsQuery(query)).toThrow(expect.objectContaining({ code: "ALARM_HISTORY_QUERY" }));
});
it("uses a deterministic name order across service and browser locales", () => {
  const result = snapshot([row(1, "Incoming", 0, { id: "z", name: "Zèta" }), row(2, "Incoming", 0, { id: "a", name: "Àlfa" }), row(3, "Incoming", 0, { id: "b", name: "beta" })], { order: "name" }); expect(result.rows.map(value => value.name)).toEqual(["Àlfa", "beta", "Zèta"]); expect(parseAlarmStatisticsSnapshot(result, { order: "name" })).toEqual(result);
});
it("rejects forged statistics, unknown fields, duplicate rows, incorrect sums and foreign filters", () => {
  const valid = snapshot([row(1), row(2, "Outgoing")]);
  for (const patch of [{ namespace: "bad" }, { sequence: 0 }, { through: 3 }, { matchedEvents: 1 }, { activations: 0 }, { alarms: 0 }, { order: "ack-total" }, { rows: [...valid.rows, ...valid.rows] }, { token: "secret" }, { rows: [{ ...valid.rows[0], active: { ...valid.rows[0].active, averageMs: 12 } }] }]) expect(() => parseAlarmStatisticsSnapshot({ ...valid, ...patch })).toThrow(expect.objectContaining({ code: "ALARM_HISTORY_RESPONSE" }));
  for (const query of [{ alarmId: "different" }, { state: "Incoming" as const }, { archiveId: randomUUID() }, { through: 1 }]) expect(() => parseAlarmStatisticsSnapshot(valid, query)).toThrow();
});
it("uses bounded batches, yields to acquisition, pins sequence and supports read-only archives", async () => {
  const test = await fixture(), store = openAlarmHistory({ ...test, recordLimit: 5000 });
  try {
    store.begin(instance); const events = Array.from({ length: 2000 }, (_, i) => row(i + 1, i % 2 ? "Outgoing" : "Incoming", i, { occurrence: "cycle-" + Math.floor(i / 2) }).event); store.append(events);
    let ticks = 0; const timer = setInterval(() => ticks++, 0); const pending = store.statistics(); store.append([row(2001).event]); const result = await pending; clearInterval(timer);
    expect(result).toMatchObject({ sequence: 2000, through: 2000, matchedEvents: 2000, activations: 1000 }); expect(result.rows[0].active).toMatchObject({ pairs: 1000, totalMs: 1000 }); expect(ticks).toBeGreaterThan(0); expect(store.read().sequence).toBe(2001); store.finish(2001, 0);
  } finally { store.close(); }
  const readOnly = openAlarmHistory({ ...test, readOnly: true }); try { expect(await readOnly.statistics()).toMatchObject({ matchedEvents: 2001, incompleteRuns: 0 }); } finally { readOnly.close(); }
});
it("applies exact filters to all events and never borrows a start outside the selected dates or state", async () => {
  const test = await fixture(), store = openAlarmHistory(test); try {
    store.begin(instance); store.append([row(1).event, row(2, "Outgoing").event, row(3, "Incoming", 3000, { id: "other", area: "Other" }).event]);
    const result = await store.statistics({ from: new Date(time + 1500).toISOString(), area: "Linea", state: "Outgoing" });
    expect(parseAlarmStatisticsSnapshot({ ...result, capture: { state: "recording", unconfirmedInThisRun: 0 } }, { from: new Date(time + 1500).toISOString(), area: "Linea", state: "Outgoing" }).rows[0]).toMatchObject({ events: 1, incoming: 0, active: { pairs: 0, averageMs: null, unmatchedTransitions: 1 } });
    expect((await store.statistics({ alarmId: "a' OR 1=1 --" })).matchedEvents).toBe(0);
    await expect(store.statistics({ archiveId: randomUUID() })).rejects.toMatchObject({ code: "ALARM_HISTORY_CHANGED" }); store.finish(3, 0);
  } finally { store.close(); }
});
it("cancels without a partial result, rejects overlapping calculations and remains readable", async () => {
  const test = await fixture(), store = openAlarmHistory(test), abort = new AbortController(); try {
    store.begin(instance); store.append([row(1).event]); const pending = store.statistics({}, { signal: abort.signal }); await expect(store.statistics()).rejects.toMatchObject({ code: "ALARM_HISTORY_STATISTICS_BUSY", status: 429 }); abort.abort(); await expect(pending).rejects.toMatchObject({ code: "ALARM_HISTORY_STATISTICS_CANCELLED" }); expect((await store.statistics()).matchedEvents).toBe(1); store.finish(1, 0);
  } finally { store.close(); }
});
it("enforces the calculation deadline without changing recording state or publishing partial totals", async () => {
  const test = await fixture(), store = openAlarmHistory(test); store.begin(instance); store.append([row(1).event]);
  const clock = vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(30001);
  try { await expect(store.statistics()).rejects.toMatchObject({ code: "ALARM_HISTORY_STATISTICS_LIMIT" }); }
  finally { clock.mockRestore(); }
  try { store.append([row(2, "Outgoing").event]); expect((await store.statistics()).matchedEvents).toBe(2); store.finish(2, 0); } finally { store.close(); }
});
it("does not return a partial aggregate when a later stored payload is corrupt", async () => {
  const test = await fixture(), store = openAlarmHistory(test); store.begin(instance); store.append(Array.from({ length: 700 }, (_, i) => row(i + 1).event)); store.finish(700, 0); store.close();
  const db = new DatabaseSync(test.file); db.prepare("UPDATE history_events SET payload=? WHERE seq=650").run('{}'); db.close(); const before = await readFile(test.file);
  const reader = openAlarmHistory({ ...test, readOnly: true }); try { await expect(reader.statistics()).rejects.toMatchObject({ code: "ALARM_HISTORY_RESPONSE" }); } finally { reader.close(); } expect(await readFile(test.file)).toEqual(before);
});
it("bounds memory and numeric totals instead of returning approximations", () => {
  const groups = createAlarmStatisticsAccumulator(); for (let i = 1; i <= 10000; i++) groups.push(row(i, "Incoming", 0, { id: "alarm_" + i })); expect(() => groups.push(row(10001, "Incoming", 0, { id: "overflow" }))).toThrow(expect.objectContaining({ code: "ALARM_HISTORY_STATISTICS_LIMIT" }));
  const duration = createAlarmStatisticsAccumulator(); duration.push(row(1, "Incoming", 0, { time: -8640000000000000 })); expect(() => duration.push(row(2, "Outgoing", 0, { time: 8640000000000000 }))).toThrow(expect.objectContaining({ code: "ALARM_HISTORY_STATISTICS_LIMIT" }));
});
it("exports the displayed rows with formula protection, UTC times, exact milliseconds and empty unknown averages", () => {
  const result = snapshot([row(1), row(2, "Outgoing")]), csv = alarmStatisticsCsv(result, {});
  expect(csv.startsWith('\uFEFF"archive_id";')).toBe(true); expect(csv.split('\r\n')).toHaveLength(3); expect(csv).toContain('"\'=Motore"'); expect(csv).toContain('"Testo; con ""virgolette"" <img src=x>"'); expect(csv).toContain('"2026-10-28T10:00:01.000Z"'); expect(csv).toContain('"active_total_ms"'); expect(csv).toContain(';"1000";"1000";'); expect(csv).toContain(';"0";"0";"";');
});
