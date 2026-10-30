import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { lstatSync, realpathSync, mkdirSync, openSync, closeSync, fstatSync, readSync, writeFileSync, fsyncSync, unlinkSync } from "node:fs";
import path from "node:path";
import { auditSqliteSupported } from "./audit-store.mjs";
import { DataLogError, parseServiceDataLogs, dataLogDefinitionKey, parseDataLogQuery, dataLogSampleValid } from "./data-log.mjs";

const maximumBytes = 256 * 1024 * 1024, fail = code => { throw new DataLogError(code); };
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
function regular(file, maximum = maximumBytes, optional = false) {
  let stat; try { stat = lstatSync(file); } catch (error) { if (optional && error.code === "ENOENT") return; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maximum) fail("DATA_LOG_STORAGE"); return stat;
}
function folder(file, create = false) {
  if (create) try { mkdirSync(file, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  const stat = lstatSync(file), normalize = v => process.platform === "win32" ? v.toLowerCase() : v;
  if (!stat.isDirectory() || stat.isSymbolicLink() || normalize(realpathSync(file)) !== normalize(path.resolve(file))) fail("DATA_LOG_STORAGE");
}
function markerText(file) {
  const before = regular(file, 2048); let fd;
  try { fd = openSync(file, "r"); if (!same(before, fstatSync(fd))) fail("DATA_LOG_STORAGE"); const bytes = Buffer.alloc(2049); let size = 0; while (size < bytes.length) { const n = readSync(fd, bytes, size, bytes.length - size, size); if (!n) break; size += n; } const after = regular(file, 2048); if (!same(before, after) || before.size !== size || before.mtimeMs !== after.mtimeMs || size > 2048) fail("DATA_LOG_STORAGE"); return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)); }
  finally { if (fd !== undefined) closeSync(fd); }
}
const safe = error => error instanceof DataLogError ? error : new DataLogError([5, 6].includes(error?.errcode) ? "DATA_LOG_BUSY" : error?.errcode === 13 ? "DATA_LOG_LIMIT" : "DATA_LOG_STORAGE");

/** One local writer. Retention is explicit catalog policy, never a storage-error recovery. */
export function openDataLogStore({ root, namespace, catalog: input, readOnly = false, now = () => Date.now() }) {
  let db, initFd, initStat, initFile, closed = false, failed = false;
  try {
    const catalog = parseServiceDataLogs(input), entries = new Map(catalog.logs.flatMap(log => log.tags.map(tag => [log.id + ":" + tag.id, { log, tag, definition: dataLogDefinitionKey(log, tag), hash: createHash("sha256").update(dataLogDefinitionKey(log, tag)).digest("hex") }])));
    if (typeof root !== "string" || !path.isAbsolute(root) || root.startsWith("\\\\") || root.startsWith("//") || typeof namespace !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(namespace) || typeof readOnly !== "boolean") fail("DATA_LOG_CONFIG");
    folder(root); const parent = path.join(root, ".framecraft-runtime"), directory = path.join(parent, "data-logs");
    if (readOnly && !regularOptionalFolder(directory)) fail("DATA_LOG_DISABLED"); folder(parent, !readOnly); folder(directory, !readOnly);
    const file = path.join(directory, "samples.sqlite"), marker = path.join(directory, "identity.json"); initFile = path.join(directory, "initialize.lock");
    const markerExists = regular(marker, 2048, true), dbExists = regular(file, maximumBytes, true);
    if (!markerExists && !dbExists && readOnly) fail("DATA_LOG_DISABLED"); if (!!markerExists !== !!dbExists) fail("DATA_LOG_STORAGE");
    if (!dbExists) {
      initFd = openSync(initFile, "wx", 0o600); initStat = fstatSync(initFd); if (regular(marker, 2048, true) || regular(file, maximumBytes, true)) fail("DATA_LOG_STORAGE");
      const fd = openSync(marker, "wx", 0o600); try { writeFileSync(fd, JSON.stringify({ version: 1, id: randomUUID(), namespace }) + "\n"); fsyncSync(fd); } finally { closeSync(fd); } const out = openSync(file, "wx", 0o600); closeSync(out);
    }
    const identityText = markerText(marker), identity = JSON.parse(identityText), original = regular(file);
    if (!identity || Object.keys(identity).sort().join(",") !== "id,namespace,version" || identity.version !== 1 || identity.namespace !== namespace || typeof identity.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(identity.id)) fail("DATA_LOG_CONFIG");
    if (dbExists) { const fd = openSync(file, "r"); try { const header = Buffer.alloc(16); if (!same(original, fstatSync(fd)) || original.size < 4096 || readSync(fd, header, 0, 16, 0) !== 16 || header.toString("binary") !== "SQLite format 3\u0000") fail("DATA_LOG_STORAGE"); } finally { closeSync(fd); } }
    const sidecars = () => { for (const suffix of ["-wal", "-shm", "-journal"]) regular(file + suffix, maximumBytes + 16 * 1024 * 1024, true); };
    sidecars(); db = new DatabaseSync(file, { readOnly, allowExtension: false }); if (!auditSqliteSupported(db.prepare("SELECT sqlite_version() v").get().v)) fail("DATA_LOG_NODE");
    db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=0;");
    const validate = () => { if (db.prepare("PRAGMA user_version").get().user_version !== 1 || db.prepare("PRAGMA page_size").get().page_size !== 4096 || db.prepare("PRAGMA quick_check").get().quick_check !== "ok" || db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type IN ('trigger','view') OR type='table' AND name NOT IN ('data_meta','data_samples','data_requests')").get().n) fail("DATA_LOG_STORAGE"); const meta = db.prepare("SELECT * FROM data_meta").all(); if (meta.length !== 1 || meta[0].id !== identity.id || meta[0].namespace !== namespace || meta[0].singleton !== 1 || !Number.isSafeInteger(meta[0].sequence) || meta[0].sequence < 0 || !Number.isSafeInteger(meta[0].floor) || meta[0].floor < 0 || meta[0].floor > meta[0].sequence) fail("DATA_LOG_STORAGE"); };
    if (dbExists) validate(); else db.exec("PRAGMA page_size=4096;");
    if (!readOnly) { if (db.prepare("PRAGMA locking_mode=EXCLUSIVE").get().locking_mode !== "exclusive" || db.prepare("PRAGMA journal_mode=WAL").get().journal_mode !== "wal") fail("DATA_LOG_STORAGE"); db.exec("PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=256; PRAGMA journal_size_limit=16777216; PRAGMA max_page_count=65536;"); }
    if (!dbExists) { db.exec("BEGIN IMMEDIATE; PRAGMA user_version=1; CREATE TABLE data_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1),id TEXT NOT NULL,namespace TEXT NOT NULL,sequence INTEGER NOT NULL CHECK(sequence>=0),floor INTEGER NOT NULL CHECK(floor>=0)); CREATE TABLE data_samples(seq INTEGER PRIMARY KEY CHECK(seq>0),log_id TEXT NOT NULL,tag_id TEXT NOT NULL,definition TEXT NOT NULL,tag TEXT NOT NULL,time REAL NOT NULL,value TEXT,quality INTEGER NOT NULL,source_time REAL,partial INTEGER NOT NULL); CREATE TABLE data_requests(id TEXT PRIMARY KEY,actor TEXT NOT NULL,fingerprint TEXT NOT NULL,count INTEGER NOT NULL); CREATE INDEX data_log_sequence ON data_samples(log_id,seq); CREATE INDEX data_time ON data_samples(log_id,tag_id,definition,time,seq); CREATE INDEX data_retention ON data_samples(log_id,time,seq)"); db.prepare("INSERT INTO data_meta VALUES(1,?,?,0,0)").run(identity.id, namespace); db.exec("COMMIT"); if (process.platform !== "win32") { const fd = openSync(directory, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } } validate(); }
    const check = () => { if (closed || !same(original, regular(file)) || markerText(marker) !== identityText) fail("DATA_LOG_STORAGE"); folder(root); folder(parent); folder(directory); sidecars(); validateMeta(); };
    const validateMeta = () => { const m = db.prepare("SELECT * FROM data_meta").get(); if (!m || m.id !== identity.id || m.namespace !== namespace || m.singleton !== 1 || !Number.isSafeInteger(m.sequence) || m.sequence < 0 || !Number.isSafeInteger(m.floor) || m.floor < 0 || m.floor > m.sequence) fail("DATA_LOG_STORAGE"); return m; };
    const transaction = fn => { check(); db.exec("BEGIN IMMEDIATE"); try { const result = fn(); db.exec("COMMIT"); return result; } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; } };
    const rowSample = row => { const point = { seq: row.seq, logId: row.log_id, loggedTagId: row.tag_id, tag: row.tag, time: row.time, value: row.value, qualityCode: row.quality, sourceTimestamp: row.source_time, partial: row.partial === 1 }; if (![0, 1].includes(row.partial) || !dataLogSampleValid(point)) fail("DATA_LOG_STORAGE"); return point; };
    const counts = new Map(db.prepare("SELECT log_id,count(*) n FROM data_samples GROUP BY log_id").all().map(row => [row.log_id, row.n]));
    const prune = log => {
      const at = now(); if (!Number.isFinite(at)) fail("DATA_LOG_STORAGE");
      // Age and total capacity share the same transaction as new samples; old definitions count too.
      const aged = db.prepare("SELECT coalesce(max(seq),0) seq FROM data_samples WHERE log_id=? AND time<?").get(log.id, at - log.retentionMs).seq;
      const removed = db.prepare("DELETE FROM data_samples WHERE log_id=? AND time<?").run(log.id, at - log.retentionMs).changes;
      counts.set(log.id, (counts.get(log.id) ?? 0) - Number(removed));
      const excess = (counts.get(log.id) ?? 0) - log.maxEntries;
      const overflow = excess > 0 ? db.prepare("SELECT seq FROM data_samples WHERE log_id=? ORDER BY seq LIMIT 1 OFFSET ?").get(log.id, excess - 1) : undefined;
      if (overflow) { const deleted = db.prepare("DELETE FROM data_samples WHERE log_id=? AND seq<=?").run(log.id, overflow.seq).changes; counts.set(log.id, (counts.get(log.id) ?? 0) - Number(deleted)); }
      const floor = Math.max(aged, overflow?.seq ?? 0); if (floor) db.prepare("UPDATE data_meta SET floor=max(floor,?) WHERE singleton=1").run(floor);
    };
    check(); const maximum = db.prepare("SELECT coalesce(max(seq),0) seq FROM data_samples").get().seq; if (maximum > validateMeta().sequence) fail("DATA_LOG_STORAGE");
    return {
      lookup(id, actor, fingerprint) {
        check(); if (typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id) || typeof actor !== "string" || !actor || actor.length > 200 || typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(fingerprint)) fail("DATA_LOG_QUERY");
        const row = db.prepare("SELECT * FROM data_requests WHERE id=?").get(id); if (!row) return; if (row.actor !== actor || row.fingerprint !== fingerprint || !Number.isInteger(row.count) || row.count < 0 || row.count > 512) fail("DATA_LOG_CHANGED"); return { id, count: row.count };
      },
      append(rows, receipt) {
        if (readOnly || failed) fail("DATA_LOG_DISABLED"); if (!Array.isArray(rows) || !rows.length && !receipt || rows.length > 1024) fail("DATA_LOG_CONFIG");
        const checked = rows.map(row => { if (!row || Object.keys(row).sort().join(",") !== "definition,logId,loggedTagId,partial,qualityCode,sourceTimestamp,tag,time,value") fail("DATA_LOG_CONFIG"); const e = entries.get(row.logId + ":" + row.loggedTagId); const { definition, ...point } = row; if (!e?.log.enabled || definition !== e.definition || point.tag !== e.tag.tag || !dataLogSampleValid({ seq: 1, ...point })) fail("DATA_LOG_CONFIG"); return row; });
        try { return transaction(() => { const m = validateMeta(); if (receipt) { if (!receipt || Object.keys(receipt).sort().join(",") !== "actor,fingerprint,id" || this.lookup(receipt.id, receipt.actor, receipt.fingerprint)) fail("DATA_LOG_CHANGED"); if (db.prepare("SELECT count(*) n FROM data_requests").get().n >= 100000) fail("DATA_LOG_LIMIT"); } if (!Number.isSafeInteger(m.sequence + checked.length)) fail("DATA_LOG_LIMIT"); const insert = db.prepare("INSERT INTO data_samples VALUES(?,?,?,?,?,?,?,?,?,?)"); checked.forEach((r, i) => insert.run(m.sequence + i + 1, r.logId, r.loggedTagId, entries.get(r.logId + ":" + r.loggedTagId).hash, r.tag, r.time, r.value, r.qualityCode, r.sourceTimestamp, r.partial ? 1 : 0)); db.prepare("UPDATE data_meta SET sequence=? WHERE singleton=1").run(m.sequence + checked.length); for (const log of catalog.logs.filter(log => checked.some(r => r.logId === log.id))) { counts.set(log.id, (counts.get(log.id) ?? 0) + checked.filter(r => r.logId === log.id).length); prune(log); } if (receipt) db.prepare("INSERT INTO data_requests VALUES(?,?,?,?)").run(receipt.id, receipt.actor, receipt.fingerprint, checked.length); return checked.length; }); } catch (error) { failed = true; throw safe(error); }
      },
      maintain() { if (readOnly || failed) return; try { transaction(() => { for (const log of catalog.logs) prune(log); }); } catch (error) { failed = true; throw safe(error); } },
      query(input) {
        try {
          check(); const q = parseDataLogQuery(input), e = entries.get(q.logId + ":" + q.loggedTagId); if (!e || e.definition !== q.definition) fail("DATA_LOG_CHANGED"); db.exec("BEGIN"); const m = validateMeta(), through = q.through ?? m.sequence;
          if (q.archiveId !== undefined && q.archiveId !== identity.id || through > m.sequence) fail("DATA_LOG_CHANGED"); if (q.floor !== undefined && q.floor !== m.floor) fail("DATA_LOG_EXPIRED");
          const args = [q.logId, q.loggedTagId, e.hash, through], base = "log_id=? AND tag_id=? AND definition=? AND seq<=?";
          const rows = db.prepare("SELECT * FROM data_samples INDEXED BY data_time WHERE " + base + " AND seq>? AND time>=? AND time<=? ORDER BY seq LIMIT ?").all(...args, q.after ?? 0, q.from, q.to, q.limit + 1);
          const samples = rows.slice(0, q.limit).map(rowSample), previous = q.includePrevious && q.after === undefined ? db.prepare("SELECT * FROM data_samples WHERE " + base + " AND time<? ORDER BY time DESC,seq DESC LIMIT 1").get(...args, q.from) : undefined;
          db.exec("COMMIT"); return { version: 1, id: identity.id, namespace, through, floor: m.floor, definition: q.definition, samples, previous: previous ? rowSample(previous) : null, nextAfter: rows.length > q.limit ? samples.at(-1).seq : null };
        } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw safe(error); }
      },
      close() { if (!closed) { closed = true; db.close(); } },
    };
  } catch (error) { try { db?.close(); } catch {} throw safe(error); }
  finally { if (initFd !== undefined) { closeSync(initFd); try { if (same(initStat, lstatSync(initFile))) unlinkSync(initFile); } catch {} } }
}
function regularOptionalFolder(file) { try { return lstatSync(file); } catch (error) { if (error.code === "ENOENT") return; throw error; } }
