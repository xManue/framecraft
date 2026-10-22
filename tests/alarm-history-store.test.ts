import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, link, symlink } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { openAlarmHistory } from "../runtime/alarm-history-store.mjs";
import { parseAlarmHistoryQuery, parseAlarmHistorySnapshot, parseHistoryEvent } from "../runtime/alarm-history.mjs";
import { createAlarmEngine, emptyAlarmCatalog, alarmCatalogIssues } from "../runtime/alarm-engine.mjs";
const event = (sequence = 1, id = "a") => ({ sequence, id, occurrence: "occurrence-1", name: "Motore <b>x</b>", text: "Controlla il motore", alarmClass: "Guasto", priority: 3, area: "Linea", state: "Incoming" as const, time: Date.parse("2026-10-21T10:00:00.000Z") });
async function fixture() { const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "alarm-history-test-")); return { root, namespace: randomUUID(), file: path.join(root, ".framecraft-runtime/alarm-history/alarms.sqlite") }; }
it("commits a complete sample batch, preserves historical text after restart and reads disabled", async () => {
  const test = await fixture(), store = openAlarmHistory(test), instance = randomUUID(); store.begin(instance); store.append([event(), { ...event(2), state: "Outgoing" }]); store.finish(2, 0); store.close();
  const reader = openAlarmHistory({ ...test, readOnly: true }); try { const result = reader.read(); expect(result).toMatchObject({ sequence: 2, incompleteRuns: 0 }); expect(result.events.map(row => row.event.state)).toEqual(["Outgoing", "Incoming"]); expect(result.events[0].event.name).toContain("<b>x</b>"); expect(() => reader.append([event(3)])).toThrow(); } finally { reader.close(); }
});
it("keeps incomplete runs visible without restoring live alarm state", async () => {
  const test = await fixture(), store = openAlarmHistory(test); store.begin(randomUUID()); store.append([event()]); store.close();
  const next = openAlarmHistory(test); try { next.begin(randomUUID()); next.append([event()]); expect(next.read()).toMatchObject({ sequence: 2, incompleteRuns: 1 }); next.finish(1, 0); } finally { next.close(); }
  const engine = createAlarmEngine({ ...emptyAlarmCatalog(), alarms: [{ id: "a", name: "Nuovo testo", text: "Messaggio aggiornato", tag: "Signal", className: "Alarm_CTH", priority: 1, enabled: true, trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] }, [{ name: "Signal", dataType: "Bool", access: "read" }]); expect(engine.snapshot().rows[0]).toMatchObject({ active: null, quality: "unknown" }); expect(engine.snapshot().sequence).toBe(0);
});
it("refuses concurrent writers and releases the real SQLite lock after process termination", async () => {
  const test = await fixture(), module = pathToFileURL(path.resolve("runtime/alarm-history-store.mjs")).href;
  const source = `import {openAlarmHistory} from ${JSON.stringify(module)};const s=openAlarmHistory(${JSON.stringify(test)});s.begin(${JSON.stringify(randomUUID())});s.append([${JSON.stringify(event())}]);process.stdout.write('READY');setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); let output = "", errors = ""; child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { errors += chunk; }); const exited = once(child, "exit");
  try { await vi.waitFor(() => { if (child.exitCode !== null) throw new Error(errors); expect(output).toContain("READY"); }); expect(() => openAlarmHistory(test)).toThrow(expect.objectContaining({ code: "ALARM_HISTORY_BUSY" })); }
  finally { if (child.exitCode === null) child.kill("SIGKILL"); await exited; }
  const restarted = openAlarmHistory(test); try { expect(restarted.read()).toMatchObject({ sequence: 1, incompleteRuns: 1 }); } finally { restarted.close(); }
});
it("does not publish a valid first row if a later row or capacity check fails", async () => {
  for (const capacity of [false, true]) { const test = await fixture(), store = openAlarmHistory({ ...test, recordLimit: 1 }); try { store.begin(randomUUID()); expect(() => store.append([event(), { ...event(2), ...(capacity ? {} : { time: NaN }) }])).toThrow(); expect(store.read().sequence).toBe(0); expect(() => store.append([event()])).toThrow(); store.finish(2, 2); expect(store.read().incompleteRuns).toBe(1); } finally { store.close(); } }
});
it("filters before pagination and pins older pages while new events arrive", async () => {
  const test = await fixture(), store = openAlarmHistory(test); try { store.begin(randomUUID()); store.append(Array.from({ length: 6 }, (_, i) => event(i + 1, i % 2 ? "b" : "a"))); const first = store.read({ limit: 1, alarmId: "a" }); expect(first.events[0].seq).toBe(5); store.append([event(7)]); const older = store.read({ limit: 2, alarmId: "a", before: first.nextBefore!, through: first.sequence, archiveId: first.id }); expect(older.events.map(row => row.seq)).toEqual([3, 1]); expect(older.nextBefore).toBeNull(); expect(store.read({ alarmId: "a' OR 1=1 --" }).events).toEqual([]); expect(() => store.read({ archiveId: randomUUID() })).toThrow(expect.objectContaining({ code: "ALARM_HISTORY_CHANGED" })); store.finish(7, 0); } finally { store.close(); }
});
it("detects a known full archive before arming a new recording session and keeps it readable", async () => {
  const test = await fixture(), store = openAlarmHistory({ ...test, recordLimit: 1 }); store.begin(randomUUID()); store.append([event()]); store.finish(1, 0); store.close(); const next = openAlarmHistory({ ...test, recordLimit: 1 });
  try { expect(() => next.begin(randomUUID())).toThrow(expect.objectContaining({ code: "ALARM_HISTORY_LIMIT" })); expect(next.read().sequence).toBe(1); } finally { next.close(); }
});
it("preserves files for a wrong namespace, malformed identity, DB corruption or links", async () => {
  const test = await fixture(), store = openAlarmHistory(test); store.close(); const before = await readFile(test.file);
  expect(() => openAlarmHistory({ ...test, namespace: randomUUID() })).toThrow(); expect(await readFile(test.file)).toEqual(before);
  const marker = path.join(path.dirname(test.file), "identity.json"), source = await readFile(marker, "utf8"); await writeFile(marker, "{}"); expect(() => openAlarmHistory(test)).toThrow(); expect(await readFile(marker, "utf8")).toBe("{}"); await writeFile(marker, source);
  const extra = path.join(test.root, "hard-link.sqlite"); await link(test.file, extra); expect(() => openAlarmHistory(test)).toThrow();
  const corrupt = await fixture(), db = openAlarmHistory(corrupt); db.close(); await writeFile(corrupt.file, "BROKEN_DATABASE"); expect(() => openAlarmHistory(corrupt)).toThrow(); expect(await readFile(corrupt.file, "utf8")).toBe("BROKEN_DATABASE");
  const alias = path.join(test.root, "alias"); await symlink(path.dirname(test.file), alias, process.platform === "win32" ? "junction" : "dir"); expect(() => openAlarmHistory({ ...test, root: alias })).toThrow();
});
it("detects inconsistent stored payloads instead of returning them as valid history", async () => {
  const test = await fixture(), store = openAlarmHistory(test); store.begin(randomUUID()); store.append([event()]); store.finish(1, 0); store.close();
  const db = new DatabaseSync(test.file); db.prepare("UPDATE history_events SET payload=? WHERE seq=1").run(JSON.stringify({ ...event(), id: "different" })); db.close();
  const reader = openAlarmHistory({ ...test, readOnly: true }); try { expect(() => reader.read()).toThrow(); } finally { reader.close(); }
});
it("never initializes an existing empty database and refuses future schema versions before journal changes", async () => {
  const test = await fixture(), store = openAlarmHistory(test); store.close(); await writeFile(test.file, ""); expect(() => openAlarmHistory(test)).toThrow(); expect((await readFile(test.file)).byteLength).toBe(0);
  const future = await fixture(), existing = openAlarmHistory(future); existing.close(); const db = new DatabaseSync(future.file); db.exec("PRAGMA user_version=99; PRAGMA journal_mode=DELETE;"); db.close(); const before = await readFile(future.file); expect(() => openAlarmHistory(future)).toThrow(); expect(await readFile(future.file)).toEqual(before);
});
it("does not create an archive in read-only mode and validates query/response boundaries", async () => {
  const test = await fixture(); expect(() => openAlarmHistory({ ...test, readOnly: true })).toThrow(expect.objectContaining({ code: "ALARM_HISTORY_DISABLED" })); await expect(readFile(test.file)).rejects.toMatchObject({ code: "ENOENT" });
  for (const query of [{ limit: 0 }, { before: -1 }, { through: Infinity }, { from: "2026-02-30T00:00:00.000Z" }, { sql: "select" }, { state: "bad" }, { from: "2026-10-22T00:00:00.000Z", to: "2026-10-21T00:00:00.000Z" }]) expect(() => parseAlarmHistoryQuery(query)).toThrow();
  expect(() => parseHistoryEvent({ ...event(), actor: "injected" })).toThrow();
  const store = openAlarmHistory(test); try { store.begin(randomUUID()); store.append([event()]); const data = { ...store.read(), capture: { state: "recording", unconfirmedInThisRun: 0 } }; expect(parseAlarmHistorySnapshot(data).events).toHaveLength(1); for (const patch of [{ count: 9 }, { nextBefore: 9 }, { capture: { state: "error", unconfirmedInThisRun: 0 } }, { events: [...data.events, ...data.events] }]) expect(() => parseAlarmHistorySnapshot({ ...data, ...patch })).toThrow(); } finally { store.close(); }
});
it("batches transitions per evaluation even when optional observers fail", () => {
  const batches: unknown[] = [], catalog = { ...emptyAlarmCatalog(), archive: { enabled: true, maxRecords: 1000 }, alarms: [0, 1].map(bit => ({ id: "a" + bit, name: "Motore " + bit, text: "Guasto " + bit, tag: "Signal", className: "Alarm_CTH", priority: 1, enabled: true, trigger: { kind: "bit" as const, bit, activeWhen: "set" as const } })) };
  expect(alarmCatalogIssues({ ...catalog, archive: { enabled: true, maxRecords: 10 } })).not.toEqual([]);
  const engine = createAlarmEngine(catalog, [{ name: "Signal", dataType: "Byte", access: "read" }], { onEvent: () => { throw new Error(); }, onEvents: events => { batches.push(events); throw new Error(); } }); engine.updateSample({ tag: "Signal", value: 3, qualityCode: 192 }); expect(batches).toHaveLength(1); expect(batches[0]).toMatchObject([{ sequence: 1 }, { sequence: 2 }]); expect(engine.snapshot().rows.every(row => row.active)).toBe(true);
});
