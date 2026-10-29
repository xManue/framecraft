import { afterEach, expect, it, vi } from "vitest";
import { collectAlarmHistoryCsv, type AlarmHistoryExportOptions } from "../src/core/hmiAlarmHistoryExport";
import type { AlarmHistorySnapshot } from "../runtime/alarm-history.mjs";
const id = "7618fc24-79c4-4657-9139-56ad520cb1fa", other = "6618fc24-79c4-4657-9139-56ad520cb1fa";
const row = (seq: number) => ({ seq, instanceId: other, recordedAt: "2026-10-23T10:00:00.000Z", event: { sequence: seq, id: "alarm", occurrence: "occurrence", name: "Motore", text: "Testo; con \"virgolette\" è corretto", alarmClass: "Guasto", area: "Linea", priority: 0, state: "Incoming" as const, time: Date.parse("2026-10-23T09:00:00.000Z") } });
const page = (sequences = [3, 2], nextBefore: number | null = 2): AlarmHistorySnapshot => ({ version: 1, id, namespace: id, sequence: 3, count: 3, incompleteRuns: 0, nextBefore, capture: { state: "recording", unconfirmedInThisRun: 0 }, events: sequences.map(row) });
const fixture = () => ({ snapshot: page(), applied: {}, signal: new AbortController().signal, pause: async () => {}, read: vi.fn<AlarmHistoryExportOptions["read"]>(async () => page([3, 2, 1], null)) });
afterEach(() => vi.unstubAllGlobals());
it("exports suspension metadata with UTC, separate restore cause and formula-safe reason", async () => {
  const event = { ...row(1).event, state: "Shelved" as const, actor: "operator", shelving: { mode: "one-shot" as const, until: Date.parse("2026-10-23T09:01:00.000Z"), reason: "=Manutenzione" } }, data = { ...page([1], null), sequence: 1, count: 1, events: [{ ...row(1), event }] };
  const result = await collectAlarmHistoryCsv({ ...fixture(), snapshot: data, read: async () => data }); const csv = result.parts.join("");
  expect(csv).toContain('"shelving_mode";"shelved_until_utc";"unshelve_cause";"shelving_reason"'); expect(csv).toContain('"one-shot";"2026-10-23T09:01:00.000Z";"";"\'=Manutenzione"');
});
it("exports every anchored page, not only the visible older page, excluding new arrivals", async () => {
  const test = { ...fixture(), snapshot: page([1], null), applied: { before: 2, through: 3, archiveId: id, alarmClass: "Guasto" } };
  test.read.mockResolvedValueOnce(page()).mockResolvedValueOnce({ ...page([1], null), sequence: 4, count: 4 }); const progress = vi.fn();
  const result = await collectAlarmHistoryCsv({ ...test, progress });
  expect(test.read.mock.calls.map(([query]) => query)).toEqual([{ alarmClass: "Guasto", archiveId: id, through: 3, limit: 500 }, { alarmClass: "Guasto", archiveId: id, through: 3, limit: 500, before: 2 }]);
  expect(result.manifest).toMatchObject({ rows: 3, through: 3, filters: { alarmClass: "Guasto" }, archiveId: id, timeZone: "UTC", order: "registration-desc" });
  const csv = result.parts.join(""); expect(csv.startsWith("\uFEFF")).toBe(true); expect(csv.split("\r\n")).toHaveLength(5); expect(csv).toContain('"Testo; con ""virgolette"" è corretto"'); expect(csv).toContain('"2026-10-23T09:00:00.000Z"'); expect(result.manifest.csvBytes).toBe(new TextEncoder().encode(csv).length); expect(progress.mock.calls).toEqual([[2], [3]]);
});
it.each(["=SUM(1)", "+SUM(1)", "-SUM(1)", "@SUM(1)", "  =SUM(1)"])("neutralizes spreadsheet formulas in every text field: %s", async text => {
  const test = fixture(), source = page([1], null); source.events[0].event.text = text; source.events[0].event.name = text; source.events[0].event.area = text; source.events[0].event.alarmClass = text; test.read.mockResolvedValue(source);
  const result = await collectAlarmHistoryCsv(test); expect(result.parts.join("")).toContain('"\'' + text + '"'); expect(result.manifest.spreadsheetTextProtection).toBe("apostrophe-prefix"); expect(source.events[0].event.text).toBe(text);
});
it("returns an explicit empty export and metadata without inventing events or completeness", async () => {
  const test = fixture(); test.read.mockResolvedValue(page([], null)); const result = await collectAlarmHistoryCsv(test);
  expect(result.manifest.rows).toBe(0); expect(result.parts.join("").split("\r\n")).toHaveLength(2); expect(result.manifest.warning).toContain("Non è un backup");
});
it("keeps capture faults and uncertainty seen anywhere during collection", async () => {
  const test = fixture(); test.read.mockResolvedValueOnce({ ...page(), incompleteRuns: 2, capture: { state: "error", code: "ALARM_HISTORY_LIMIT", unconfirmedInThisRun: 4 } }).mockResolvedValueOnce(page([1], null));
  const result = await collectAlarmHistoryCsv(test); expect(result.manifest).toMatchObject({ incompleteRunsMax: 2, unconfirmedInThisRunMax: 4, captureStatesSeen: ["recording", "error"], captureCodesSeen: ["ALARM_HISTORY_LIMIT"] });
});
it.each(["archive", "namespace", "rollback", "cursor", "filter"])("rejects %s inconsistency without returning a partial file", async kind => {
  const test = fixture(); test.read.mockResolvedValueOnce(page()); let next = page([1], null);
  if (kind === "archive") next.id = other; else if (kind === "namespace") next.namespace = other; else if (kind === "rollback") next = { ...next, count: 2, sequence: 2 }; else if (kind === "cursor") next = page([2], null); else { next.events[0].event.alarmClass = "Other"; test.applied = { alarmClass: "Guasto" }; }
  test.read.mockResolvedValueOnce(next); await expect(collectAlarmHistoryCsv(test)).rejects.toMatchObject({ code: kind === "namespace" ? "ALARM_HISTORY_CHANGED" : "ALARM_HISTORY_RESPONSE" });
});
it("discards collection after a denied page or an abort, never retrying", async () => {
  const test = fixture(); test.read.mockResolvedValueOnce(page()).mockRejectedValueOnce(Error("denied")); await expect(collectAlarmHistoryCsv(test)).rejects.toThrow("denied"); expect(test.read).toHaveBeenCalledTimes(2);
  const stop = new AbortController(), cancelled = fixture(); stop.abort(); await expect(collectAlarmHistoryCsv({ ...cancelled, signal: stop.signal })).rejects.toThrow(); expect(cancelled.read).not.toHaveBeenCalled();
});
it("stops a budget overflow with no truncated success", async () => {
  vi.stubGlobal("TextEncoder", class { encode(text: string) { return { byteLength: text.startsWith("\uFEFF") ? 1 : 64 * 1024 * 1024 }; } });
  await expect(collectAlarmHistoryCsv(fixture())).rejects.toMatchObject({ message: expect.stringContaining("64 MiB"), remedy: expect.stringContaining("Nessun file parziale") });
});
