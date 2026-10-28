import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync, mkdirSync, openSync, closeSync, fstatSync, readSync, writeFileSync, fsyncSync, unlinkSync } from "node:fs";
import path from "node:path";
import { auditSqliteSupported } from "./audit-store.mjs";
import { AlarmHistoryError, historyKeys, historyUuid, parseHistoryEvent, parseAlarmHistoryQuery, parseAlarmStatisticsQuery, createAlarmStatisticsAccumulator } from "./alarm-history.mjs";

const bytesLimit = 256 * 1024 * 1024, maximumRecords = 500000;
const fail = code => { throw new AlarmHistoryError(code); };
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
function regular(file, max = bytesLimit, optional = false) {
  let stat; try { stat = lstatSync(file); } catch (error) { if (optional && error.code === "ENOENT") return; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > max) fail("ALARM_HISTORY_STORAGE"); return stat;
}
function folder(file, create = false) {
  if (create) try { mkdirSync(file, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  const stat = lstatSync(file), key = value => process.platform === "win32" ? value.toLowerCase() : value;
  if (!stat.isDirectory() || stat.isSymbolicLink() || key(realpathSync(file)) !== key(path.resolve(file))) fail("ALARM_HISTORY_STORAGE");
}
function readMarker(file) {
  const before = regular(file, 1024); let fd;
  try { fd = openSync(file, "r"); if (!same(before, fstatSync(fd))) fail("ALARM_HISTORY_STORAGE"); const bytes = Buffer.alloc(1025); let size = 0; while (size < bytes.length) { const count = readSync(fd, bytes, size, bytes.length - size, size); if (!count) break; size += count; } const after = regular(file, 1024); if (!same(before, after) || before.size !== size || before.mtimeMs !== after.mtimeMs || size > 1024) fail("ALARM_HISTORY_STORAGE"); return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)); }
  finally { if (fd !== undefined) closeSync(fd); }
}
const safe = error => error instanceof AlarmHistoryError ? error : new AlarmHistoryError([5, 6].includes(error?.errcode) ? "ALARM_HISTORY_BUSY" : error?.errcode === 13 ? "ALARM_HISTORY_LIMIT" : "ALARM_HISTORY_STORAGE");

/** One local service owns the SQLite handle; no replay, pruning or live-state restoration. */
export function openAlarmHistory({ root, namespace, recordLimit = 100000, readOnly = false }) {
  let db, initFd, initStat, initFile, currentRun, failed = false, closed = false, statisticsBusy = false;
  try {
    if (typeof root !== "string" || !path.isAbsolute(root) || root.startsWith("\\\\") || root.startsWith("//") || !historyUuid(namespace) || !Number.isSafeInteger(recordLimit) || recordLimit < 1 || recordLimit > maximumRecords || typeof readOnly !== "boolean") fail("ALARM_HISTORY_CONFIG");
    folder(root); const parent = path.join(root, ".framecraft-runtime"), directory = path.join(parent, "alarm-history");
    if (readOnly && !lstatOptional(directory)) fail("ALARM_HISTORY_DISABLED"); folder(parent, !readOnly); folder(directory, !readOnly);
    const file = path.join(directory, "alarms.sqlite"), marker = path.join(directory, "identity.json"); initFile = path.join(directory, "initialize.lock");
    const markerExists = regular(marker, 1024, true), dbExists = regular(file, bytesLimit, true);
    if (!markerExists && !dbExists && readOnly) fail("ALARM_HISTORY_DISABLED"); if (!!markerExists !== !!dbExists) fail("ALARM_HISTORY_STORAGE");
    if (!dbExists) {
      initFd = openSync(initFile, "wx", 0o600); initStat = fstatSync(initFd);
      if (regular(marker, 1024, true) || regular(file, bytesLimit, true)) fail("ALARM_HISTORY_STORAGE");
      const fd = openSync(marker, "wx", 0o600); try { writeFileSync(fd, JSON.stringify({ version: 1, id: randomUUID(), namespace }) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
      const out = openSync(file, "wx", 0o600); closeSync(out);
    }
    const markerSource = readMarker(marker), identity = JSON.parse(markerSource), original = regular(file);
    if (!historyKeys(identity, ["version", "id", "namespace"]) || identity.version !== 1 || !historyUuid(identity.id) || identity.namespace !== namespace) fail("ALARM_HISTORY_CONFIG");
    if (dbExists) { const fd = openSync(file, "r"); try { const header = Buffer.alloc(16); if (!same(original, fstatSync(fd)) || original.size < 4096 || readSync(fd, header, 0, 16, 0) !== 16 || header.toString("binary") !== "SQLite format 3\u0000") fail("ALARM_HISTORY_STORAGE"); } finally { closeSync(fd); } }
    const sidecars = () => { for (const suffix of ["-wal", "-shm", "-journal"]) regular(file + suffix, bytesLimit + 16 * 1024 * 1024, true); };
    sidecars(); db = new DatabaseSync(file, { readOnly, allowExtension: false });
    if (!auditSqliteSupported(db.prepare("SELECT sqlite_version() v").get().v)) fail("ALARM_HISTORY_NODE");
    db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=0;");
    const validateSchema = () => {
      if (db.prepare("PRAGMA user_version").get().user_version !== 1 || db.prepare("PRAGMA page_size").get().page_size !== 4096 || db.prepare("PRAGMA quick_check").get().quick_check !== "ok") fail("ALARM_HISTORY_STORAGE");
      if (db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type IN ('trigger','view') OR type='table' AND name NOT IN ('history_meta','history_runs','history_events')").get().n) fail("ALARM_HISTORY_STORAGE");
      const meta = db.prepare("SELECT * FROM history_meta").all(); if (meta.length !== 1 || meta[0].singleton !== 1 || meta[0].id !== identity.id || meta[0].namespace !== namespace) fail("ALARM_HISTORY_STORAGE");
    };
    if (dbExists) validateSchema(); else db.exec("PRAGMA page_size=4096;");
    if (!readOnly) {
      if (db.prepare("PRAGMA locking_mode=EXCLUSIVE").get().locking_mode !== "exclusive") fail("ALARM_HISTORY_STORAGE");
      if (db.prepare("PRAGMA journal_mode=WAL").get().journal_mode !== "wal") fail("ALARM_HISTORY_STORAGE");
      db.exec("PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=256; PRAGMA journal_size_limit=16777216; PRAGMA max_page_count=65536;");
    }
    if (!dbExists) {
      db.exec("BEGIN IMMEDIATE; PRAGMA user_version=1; CREATE TABLE history_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL, namespace TEXT NOT NULL, sequence INTEGER NOT NULL CHECK(sequence>=0)); CREATE TABLE history_runs (id TEXT PRIMARY KEY, started TEXT NOT NULL, ended TEXT, last_sequence INTEGER NOT NULL CHECK(last_sequence>=0), missed INTEGER NOT NULL CHECK(missed>=0)); CREATE TABLE history_events (seq INTEGER PRIMARY KEY CHECK(seq>0), instance TEXT NOT NULL REFERENCES history_runs(id), source_sequence INTEGER NOT NULL CHECK(source_sequence>0), recorded TEXT NOT NULL, alarm_id TEXT NOT NULL, alarm_class TEXT NOT NULL, area TEXT NOT NULL, state TEXT NOT NULL, time REAL NOT NULL, payload TEXT NOT NULL, UNIQUE(instance,source_sequence)); CREATE INDEX history_time ON history_events(time,seq); CREATE INDEX history_alarm ON history_events(alarm_id,seq); CREATE INDEX history_class ON history_events(alarm_class,seq)");
      db.prepare("INSERT INTO history_meta VALUES (1,?,?,0)").run(identity.id, namespace); db.exec("COMMIT");
      if (process.platform !== "win32") { const fd = openSync(directory, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } }
    }
    if (!dbExists) validateSchema();
    const check = () => {
      if (closed || !same(original, regular(file)) || readMarker(marker) !== markerSource) fail("ALARM_HISTORY_STORAGE"); folder(root); folder(parent); folder(directory); sidecars();
      const meta = db.prepare("SELECT * FROM history_meta").all(); if (meta.length !== 1 || meta[0].singleton !== 1 || meta[0].id !== identity.id || meta[0].namespace !== namespace) fail("ALARM_HISTORY_STORAGE");
    };
    const tip = () => { const sequence = db.prepare("SELECT sequence FROM history_meta WHERE singleton=1").get().sequence; if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > maximumRecords || db.prepare("SELECT coalesce(max(seq),0) seq FROM history_events").get().seq !== sequence) fail("ALARM_HISTORY_STORAGE"); return sequence; };
    check(); if (db.prepare("SELECT count(*) n FROM history_events").get().n !== tip()) fail("ALARM_HISTORY_STORAGE");
    const transaction = operation => {
      check(); db.exec("BEGIN IMMEDIATE"); try { const result = operation(); db.exec("COMMIT"); return result; } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
    };
    const payloadRow = row => {
      const event = parseHistoryEvent(JSON.parse(row.payload));
      if (event.sequence !== row.source_sequence || event.id !== row.alarm_id || event.alarmClass !== row.alarm_class || event.area !== row.area || event.state !== row.state || event.time !== row.time || !historyUuid(row.instance) || typeof row.recorded !== "string" || new Date(row.recorded).toISOString() !== row.recorded) fail("ALARM_HISTORY_STORAGE");
      return { seq: row.seq, instanceId: row.instance, recordedAt: row.recorded, event };
    };
    return {
      begin(instanceId) {
        try { if (readOnly || failed || currentRun || !historyUuid(instanceId)) fail("ALARM_HISTORY_STORAGE"); transaction(() => { if (tip() >= recordLimit) fail("ALARM_HISTORY_LIMIT"); db.prepare("INSERT INTO history_runs VALUES (?,?,NULL,0,0)").run(instanceId, new Date().toISOString()); }); currentRun = instanceId; }
        catch (error) { failed = true; throw safe(error); }
      },
      append(events) {
        try {
          if (readOnly || failed || !currentRun || !Array.isArray(events) || !events.length || events.length > 2000) fail("ALARM_HISTORY_STORAGE");
          const checked = events.map(parseHistoryEvent);
          return transaction(() => {
            const run = db.prepare("SELECT * FROM history_runs WHERE id=?").get(currentRun), sequence = tip();
            if (!run || run.ended !== null || checked.some((event, index) => event.sequence !== run.last_sequence + index + 1)) fail("ALARM_HISTORY_STORAGE");
            if (sequence + checked.length > recordLimit) fail("ALARM_HISTORY_LIMIT");
            const insert = db.prepare("INSERT INTO history_events VALUES (?,?,?,?,?,?,?,?,?,?)"), recorded = new Date().toISOString();
            checked.forEach((event, i) => insert.run(sequence + i + 1, currentRun, event.sequence, recorded, event.id, event.alarmClass, event.area, event.state, event.time, JSON.stringify(event)));
            db.prepare("UPDATE history_runs SET last_sequence=? WHERE id=?").run(checked.at(-1).sequence, currentRun); db.prepare("UPDATE history_meta SET sequence=? WHERE singleton=1").run(sequence + checked.length); return { sequence: sequence + checked.length };
          });
        } catch (error) { failed = true; throw safe(error); }
      },
      read(input = {}) {
        try {
          check(); const query = parseAlarmHistoryQuery(input); db.exec("BEGIN"); const sequence = tip();
          if (query.archiveId !== undefined && query.archiveId !== identity.id || query.through !== undefined && query.through > sequence) fail("ALARM_HISTORY_CHANGED");
          const where = ["seq<=?"], params = [query.through ?? sequence];
          for (const [key, column] of [["before", "seq"], ["alarmId", "alarm_id"], ["alarmClass", "alarm_class"], ["area", "area"], ["state", "state"], ["from", "time"], ["to", "time"]]) if (query[key] !== undefined) { where.push(column + (key === "before" ? "<?" : key === "from" ? ">=?" : key === "to" ? "<=?" : "=?")); params.push(["from", "to"].includes(key) ? Date.parse(query[key]) : query[key]); }
          const rows = db.prepare("SELECT * FROM history_events WHERE " + where.join(" AND ") + " ORDER BY seq DESC LIMIT ?").all(...params, query.limit + 1), events = rows.slice(0, query.limit).map(payloadRow);
          const incompleteRuns = db.prepare("SELECT count(*) n FROM history_runs WHERE (ended IS NULL AND id<>?) OR missed>0").get(currentRun ?? "").n;
          db.exec("COMMIT"); return { version: 1, id: identity.id, namespace, sequence, count: sequence, incompleteRuns, events, nextBefore: rows.length > query.limit ? events.at(-1).seq : null };
        } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw safe(error); }
      },
      async statistics(input = {}, options = {}) {
        if (statisticsBusy) fail("ALARM_HISTORY_STATISTICS_BUSY"); statisticsBusy = true;
        try {
          check(); const query = parseAlarmStatisticsQuery(input), sequence = tip(), through = query.through ?? sequence;
          if (query.archiveId !== undefined && query.archiveId !== identity.id || through > sequence) fail("ALARM_HISTORY_CHANGED");
          const where = ["seq<=?", "seq>?"], params = [];
          for (const [key, column] of [["alarmId", "alarm_id"], ["alarmClass", "alarm_class"], ["area", "area"], ["state", "state"], ["from", "time"], ["to", "time"]]) if (query[key] !== undefined) { where.push(column + (key === "from" ? ">=?" : key === "to" ? "<=?" : "=?")); params.push(["from", "to"].includes(key) ? Date.parse(query[key]) : query[key]); }
          const statement = db.prepare("SELECT * FROM history_events WHERE " + where.join(" AND ") + " ORDER BY seq ASC LIMIT 500"), accumulator = createAlarmStatisticsAccumulator(), started = performance.now(); let after = 0;
          while (true) {
            await new Promise(resolve => setImmediate(resolve));
            if (options.signal?.aborted) fail("ALARM_HISTORY_STATISTICS_CANCELLED");
            if (performance.now() - started > 30000) fail("ALARM_HISTORY_STATISTICS_LIMIT");
            check(); const rows = statement.all(through, after, ...params);
            for (const row of rows) accumulator.push(payloadRow(row));
            if (rows.length < 500) break; after = rows.at(-1).seq;
          }
          const incompleteRuns = db.prepare("SELECT count(*) n FROM history_runs WHERE (ended IS NULL AND id<>?) OR missed>0").get(currentRun ?? "").n;
          return { version: 1, id: identity.id, namespace, sequence, through, incompleteRuns, order: query.order, limit: query.limit, ...accumulator.finish(query.order, query.limit) };
        } catch (error) { throw safe(error); }
        finally { statisticsBusy = false; }
      },
      finish(sourceSequence, missed) {
        if (!currentRun || readOnly) return;
        try { transaction(() => { const run = db.prepare("SELECT * FROM history_runs WHERE id=?").get(currentRun); if (!Number.isSafeInteger(missed) || missed < 0 || !Number.isSafeInteger(sourceSequence) || sourceSequence < run.last_sequence || sourceSequence - run.last_sequence > missed) fail("ALARM_HISTORY_STORAGE"); db.prepare("UPDATE history_runs SET ended=?,missed=? WHERE id=?").run(new Date().toISOString(), missed, currentRun); }); currentRun = undefined; }
        catch (error) { throw safe(error); }
      },
      close() { if (!closed) { closed = true; db.close(); } },
    };
  } catch (error) { try { db?.close(); } catch {} throw safe(error); }
  finally { if (initFd !== undefined) { closeSync(initFd); try { if (same(initStat, lstatSync(initFile))) unlinkSync(initFile); } catch {} } }
}
function lstatOptional(file) { try { return lstatSync(file); } catch (error) { if (error.code === "ENOENT") return; throw error; } }
