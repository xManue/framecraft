import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { lstatSync, fstatSync, realpathSync, mkdirSync, openSync, closeSync, readSync, writeFileSync, fsyncSync, unlinkSync } from "node:fs";
import path from "node:path";
import { operatorKeys, operatorText, OperatorAuthError } from "./operator-policy.mjs";
import { parseAuditQuery, matchesAuditQuery } from "./audit-query.mjs";

const maxBytes = 64 * 1024 * 1024, maxRecords = 100000, zero = "0".repeat(64);
const fail = (code = "AUTH_AUDIT") => { throw new OperatorAuthError(code); };
const hash = value => createHash("sha256").update(value).digest("hex");
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const operations = ["tags.write", "alarms.acknowledge", "alarms.confirm", "recipes.create", "recipes.update", "recipes.copy", "recipes.rename", "recipes.delete", "recipes.import", "recipes.apply", "recipes.check", "recipes.fence", "session.login", "session.logout"];
const outcomes = ["requested", "applied", "delivered", "duplicate", "rejected", "uncertain", "authenticated", "logged-out"];
export function auditSqliteSupported(value) {
  if (typeof value !== "string" || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return false;
  const [major, minor, patch] = value.split(".").map(Number);
  return major > 3 || major === 3 && (minor > 51 || minor === 51 && patch >= 3 || minor === 50 && patch >= 7 || minor === 44 && patch >= 6);
}
let sqliteReady = false;
function ensureSqlite() {
  if (sqliteReady) return; const probe = new DatabaseSync(":memory:", { allowExtension: false });
  try { if (!auditSqliteSupported(probe.prepare("SELECT sqlite_version() version").get().version)) fail("AUTH_AUDIT_NODE"); sqliteReady = true; } finally { probe.close(); }
}
function event(input) {
  if (!operatorKeys(input, ["traceId", "actor", "operation", "resource", "commandId", "outcome", "code"]) || !uuid(input.traceId) || input.actor !== null && !operatorText(input.actor, 200) || !operations.includes(input.operation) || !outcomes.includes(input.outcome) || typeof input.code !== "string" || !/^[A-Z][A-Z0-9_]{0,63}$/.test(input.code)) fail();
  if (input.commandId !== null && (typeof input.commandId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(input.commandId))) fail();
  if (input.resource !== null && (!operatorKeys(input.resource, input.resource.kind === "recipe-schema" ? ["kind", "id", "recordId", "targetId"] : ["kind", "id"]) || !["tag", "alarm", "recipe-schema"].includes(input.resource.kind) || !operatorText(input.resource.id, 200))) fail();
  if (input.resource?.kind === "recipe-schema" && (!operatorText(input.resource.recordId, 80) || input.resource.targetId !== null && !operatorText(input.resource.targetId, 80))) fail();
  const kind = input.operation.startsWith("tags.") ? "tag" : input.operation.startsWith("alarms.") ? "alarm" : input.operation.startsWith("recipes.") ? "recipe-schema" : undefined;
  if (kind ? input.resource?.kind !== kind : input.resource !== null) fail();
  return { traceId: input.traceId, actor: input.actor, operation: input.operation, resource: input.resource === null ? null : { ...input.resource }, commandId: input.commandId, outcome: input.outcome, code: input.code };
}
function regular(file, limit, optional = false) {
  let stat; try { stat = lstatSync(file); } catch (error) { if (optional && error.code === "ENOENT") return; fail(); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > limit) fail(); return stat;
}
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const sidecars = file => { for (const suffix of ["-journal", "-wal", "-shm"]) regular(file + suffix, maxBytes + 1048576, true); };
function markerSource(file) {
  const before = regular(file, 512); let fd;
  try {
    fd = openSync(file, "r"); if (!same(before, fstatSync(fd))) fail(); const bytes = Buffer.alloc(513); let size = 0;
    while (size < bytes.length) { const count = readSync(fd, bytes, size, bytes.length - size, size); if (!count) break; size += count; }
    const after = regular(file, 512); if (size !== before.size || !same(before, after) || before.mtimeMs !== after.mtimeMs) fail();
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size));
  } finally { if (fd !== undefined) closeSync(fd); }
}
function directory(file, create) {
  let created = false;
  if (create) { try { mkdirSync(file, { mode: 0o700 }); created = true; } catch (error) { if (error.code !== "EEXIST") fail(); } }
  const stat = lstatSync(file), normalize = value => process.platform === "win32" ? value.toLowerCase() : value;
  if (!stat.isDirectory() || stat.isSymbolicLink() || normalize(realpathSync(file)) !== normalize(path.resolve(file))) fail();
  if (created && process.platform !== "win32") { const fd = openSync(path.dirname(file), "r"); try { fsyncSync(fd); } finally { closeSync(fd); } }
}
/** Private Runtime journal. No reset, automatic deletion, replay or remote administration. */
export function openRuntimeAudit({ root, namespace, readOnly = false, recordLimit = maxRecords }) {
  let db, lock, lockFile, lockStat, createdLock = false, closed = false, poisoned = false;
  try {
    if (typeof root !== "string" || !path.isAbsolute(root) || !uuid(namespace) || typeof readOnly !== "boolean" || !Number.isInteger(recordLimit) || recordLimit < 1 || recordLimit > maxRecords) fail();
    if (root.startsWith("\\\\") || root.startsWith("//")) fail("AUTH_AUDIT_PATH"); ensureSqlite(); directory(root, false);
    const parent = path.join(root, ".framecraft-runtime"), folder = path.join(parent, "audit"); directory(parent, !readOnly); directory(folder, !readOnly);
    const file = path.join(folder, "audit.sqlite"), marker = path.join(folder, "identity.json"); lockFile = path.join(folder, "initialize.lock");
    const existingMarker = regular(marker, 512, true), existingDb = regular(file, maxBytes, true);
    if (!!existingMarker !== !!existingDb || readOnly && !existingDb) fail();
    let identity;
    if (!existingDb) {
      lock = openSync(lockFile, "wx", 0o600); lockStat = fstatSync(lock); createdLock = true;
      if (regular(marker, 512, true) || regular(file, maxBytes, true)) fail();
      identity = { version: 1, id: randomUUID(), namespace }; const fd = openSync(marker, "wx", 0o600);
      try { writeFileSync(fd, JSON.stringify(identity) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
      const output = openSync(file, "wx", 0o600); closeSync(output);
      sidecars(file); db = new DatabaseSync(file, { allowExtension: false });
      db.exec("PRAGMA page_size=4096; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE; CREATE TABLE audit_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version=1), id TEXT NOT NULL); CREATE TABLE audit_events (seq INTEGER PRIMARY KEY CHECK(seq>0), payload TEXT NOT NULL, previous TEXT NOT NULL, hash TEXT NOT NULL)");
      db.prepare("INSERT INTO audit_meta VALUES (1,1,?)").run(identity.id); db.exec("COMMIT");
      if (process.platform !== "win32") { const folderFd = openSync(folder, "r"); try { fsyncSync(folderFd); } finally { closeSync(folderFd); } }
    } else { identity = JSON.parse(markerSource(marker)); sidecars(file); db = new DatabaseSync(file, { readOnly, allowExtension: false }); }
    if (!operatorKeys(identity, ["version", "id", "namespace"]) || identity.version !== 1 || !uuid(identity.id) || identity.namespace !== namespace) fail();
    const expectedMarker = markerSource(marker), original = regular(file, maxBytes);
    db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=0;"); if (db.prepare("PRAGMA page_size").get().page_size !== 4096) fail();
    if (!readOnly) { if (db.prepare("PRAGMA journal_mode=WAL").get().journal_mode !== "wal") fail(); db.exec("PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=1000; PRAGMA journal_size_limit=8388608; PRAGMA max_page_count=16384;"); }
    const check = () => {
      directory(root, false); directory(parent, false); directory(folder, false);
      if (closed || poisoned || !same(original, regular(file, maxBytes)) || markerSource(marker) !== expectedMarker) fail();
      sidecars(file);
      const meta = db.prepare("SELECT singleton,version,id FROM audit_meta").all(); if (meta.length !== 1 || meta[0].singleton !== 1 || meta[0].version !== 1 || meta[0].id !== identity.id) fail();
    };
    const verify = () => {
      check(); const rows = db.prepare("SELECT seq,payload,previous,hash FROM audit_events ORDER BY seq LIMIT 100001").all(); if (rows.length > recordLimit) fail("AUTH_AUDIT_LIMIT");
      let previous = zero, seq = 0; const events = [];
      for (const row of rows) {
        if (row.seq !== ++seq || row.previous !== previous || typeof row.payload !== "string" || Buffer.byteLength(row.payload) > 4096 || row.hash !== hash(identity.id + "\n" + seq + "\n" + previous + "\n" + row.payload)) fail();
        const parsed = JSON.parse(row.payload); if (!operatorKeys(parsed, ["timestamp", "traceId", "actor", "operation", "resource", "commandId", "outcome", "code"]) || typeof parsed.timestamp !== "string" || new Date(parsed.timestamp).toISOString() !== parsed.timestamp) fail();
        const { timestamp, ...data } = parsed; event(data); events.push({ seq, timestamp, ...data }); previous = row.hash;
      }
      return { head: previous, sequence: seq, events };
    };
    let cached = verify(), observed = regular(file, maxBytes), dataVersion = db.prepare("PRAGMA data_version").get().data_version;
    return {
      append(input) {
        if (readOnly) fail(); const data = event(input); check();
        try {
          db.exec("BEGIN IMMEDIATE"); const tip = db.prepare("SELECT seq FROM audit_events ORDER BY seq DESC LIMIT 1").get()?.seq ?? 0, current = regular(file, maxBytes), version = db.prepare("PRAGMA data_version").get().data_version;
          if (tip < cached.sequence) fail();
          if (cached.sequence && db.prepare("SELECT hash FROM audit_events WHERE seq=?").get(cached.sequence)?.hash !== cached.head) fail();
          if (tip !== cached.sequence || version !== dataVersion || current.size !== observed.size || current.mtimeMs !== observed.mtimeMs) cached = verify();
          if (cached.sequence >= recordLimit) fail("AUTH_AUDIT_LIMIT");
          const sequence = cached.sequence + 1, payload = JSON.stringify({ timestamp: new Date().toISOString(), ...data }), next = hash(identity.id + "\n" + sequence + "\n" + cached.head + "\n" + payload);
          db.prepare("INSERT INTO audit_events VALUES (?,?,?,?)").run(sequence, payload, cached.head, next); db.exec("COMMIT"); cached = { head: next, sequence, events: [] }; observed = regular(file, maxBytes); dataVersion = db.prepare("PRAGMA data_version").get().data_version;
          return { sequence, id: identity.id };
        } catch (error) { try { db.exec("ROLLBACK"); } catch { /* A commit may already have reached disk. Never retry. */ } poisoned = true; fail(error instanceof OperatorAuthError ? error.code : error.errcode === 13 ? "AUTH_AUDIT_LIMIT" : error.errcode === 5 || error.errcode === 6 ? "AUTH_AUDIT_BUSY" : "AUTH_AUDIT"); }
      },
      read(input = {}) {
        const query = parseAuditQuery({ limit: 100, ...input });
        db.exec("BEGIN");
        try {
          const verified = verify();
          if (query.journalId !== undefined && query.journalId !== identity.id || query.through !== undefined && query.through > verified.sequence) fail("AUTH_AUDIT_CHANGED");
          const matching = verified.events.filter(item => matchesAuditQuery(item, query)), events = matching.slice(-query.limit).reverse();
          db.exec("COMMIT");
          return { version: 1, id: identity.id, namespace, sequence: verified.sequence, verified: true, events,
            uncertainCount: verified.events.filter(item => item.outcome === "uncertain" || item.code.endsWith("UNCERTAIN")).length,
            unresolvedCount: (() => { const pending = new Set(); for (const item of verified.events) { if (item.outcome === "requested") pending.add(item.traceId); else pending.delete(item.traceId); } return pending.size; })(),
            nextBefore: matching.length > events.length ? events.at(-1).seq : null };
        } catch (error) { try { db.exec("ROLLBACK"); } catch {} fail(error instanceof OperatorAuthError ? error.code : undefined); }
      },
      close() { if (!closed) { closed = true; db.close(); } },
    };
  } catch (error) { try { db?.close(); } catch {} if (error instanceof OperatorAuthError) throw error; fail(); }
  finally { if (lock !== undefined) { closeSync(lock); if (createdLock) { try { if (same(lockStat, lstatSync(lockFile))) unlinkSync(lockFile); } catch { /* Never remove a lock no longer owned by this operation. */ } } } }
}
