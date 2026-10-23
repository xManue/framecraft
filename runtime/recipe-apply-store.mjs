import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { lstatSync, realpathSync, mkdirSync, openSync, closeSync, fstatSync, readSync, writeFileSync, fsyncSync, unlinkSync } from "node:fs";
import path from "node:path";
import { auditSqliteSupported } from "./audit-store.mjs";
import { recipeActor, recipeId, recipeKeys } from "./recipe-catalog.mjs";
import { RecipeApplyError, recipeApplyHash, recipeApplyId, recipeApplyNamespace, recipeApplySequence } from "./recipe-apply.mjs";

const limit = 64 * 1024 * 1024, fingerprint = text => createHash("sha256").update(text).digest("hex");
const fail = code => { throw new RecipeApplyError(code); };
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const date = value => { try { return typeof value === "string" && value.length === 24 && new Date(value).toISOString() === value; } catch { return false; } };
function regular(file, maximum = limit, optional = false) {
  let stat; try { stat = lstatSync(file); } catch (error) { if (optional && error.code === "ENOENT") return; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maximum) fail("RECIPE_APPLY_STORAGE"); return stat;
}
function folder(file, create = false) {
  if (create) try { mkdirSync(file, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  const stat = lstatSync(file), key = value => process.platform === "win32" ? value.toLowerCase() : value;
  if (!stat.isDirectory() || stat.isSymbolicLink() || key(realpathSync(file)) !== key(path.resolve(file))) fail("RECIPE_APPLY_STORAGE");
}
function readIdentity(file) {
  const before = regular(file, 1024); let fd;
  try {
    fd = openSync(file, "r"); if (!same(before, fstatSync(fd))) fail("RECIPE_APPLY_STORAGE"); const bytes = Buffer.alloc(1025); let count = 0;
    while (count < bytes.length) { const size = readSync(fd, bytes, count, bytes.length - count, count); if (!size) break; count += size; }
    const after = regular(file, 1024); if (!same(before, after) || count !== before.size || before.mtimeMs !== after.mtimeMs || count > 1024) fail("RECIPE_APPLY_STORAGE");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, count));
  } finally { if (fd !== undefined) closeSync(fd); }
}
const receiptFields = ["id", "namespace", "channelId", "sequence", "schemaId", "recordId", "recipeRevision", "mappingRevision", "fingerprint", "actor", "createdAt", "updatedAt", "phase", "writePhase", "outcome", "code", "plcCode"];
export function parseRecipeApplyReceipt(value) {
  if (!recipeKeys(value, receiptFields) || !recipeApplyId(value.id) || !recipeApplyNamespace(value.namespace) || !recipeId(value.channelId) || !recipeApplySequence(value.sequence) || !recipeId(value.schemaId) || !recipeId(value.recordId) || ![value.recipeRevision, value.mappingRevision, value.fingerprint].every(recipeApplyHash) || !recipeActor(value.actor) || !date(value.createdAt) || !date(value.updatedAt) || value.updatedAt < value.createdAt || !["reserved", "preparing", "committing", "finished"].includes(value.phase) || !["pending", "applied", "rejected", "uncertain"].includes(value.outcome) || typeof value.code !== "string" || !/^[A-Z][A-Z0-9_]{0,63}$/.test(value.code) || value.plcCode !== null && (!Number.isInteger(value.plcCode) || value.plcCode < 0 || value.plcCode > 65535)) fail("RECIPE_APPLY_STORAGE");
  if (!["none", "prepare", "apply"].includes(value.writePhase) || value.phase === "reserved" && value.writePhase !== "none" || value.phase === "preparing" && value.writePhase !== "prepare" || value.phase === "committing" && value.writePhase !== "apply" || (value.phase === "finished") !== ["applied", "rejected"].includes(value.outcome) || value.outcome === "applied" && (value.plcCode !== 0 || value.writePhase !== "apply") || value.outcome === "pending" && value.plcCode !== null) fail("RECIPE_APPLY_STORAGE");
  return { ...value };
}
const safe = error => error instanceof RecipeApplyError ? error : new RecipeApplyError([5, 6].includes(error?.errcode) ? "RECIPE_APPLY_BUSY" : error?.errcode === 13 ? "RECIPE_APPLY_LIMIT" : "RECIPE_APPLY_STORAGE");
let sqliteReady = false;
function ensureSqlite() { if (sqliteReady) return; const probe = new DatabaseSync(":memory:", { allowExtension: false }); try { if (!auditSqliteSupported(probe.prepare("SELECT sqlite_version() v").get().v)) fail("RECIPE_APPLY_NODE"); sqliteReady = true; } finally { probe.close(); } }

/** Durable intent before every PLC write. Opening the ledger never resumes a transfer. */
export function openRecipeApplyStore({ root, namespace, recordLimit = 10000 }) {
  let db, initFile, initFd, initStat, closed = false;
  try {
    if (typeof root !== "string" || !path.isAbsolute(root) || root.startsWith("\\\\") || root.startsWith("//") || !recipeApplyNamespace(namespace) || !Number.isInteger(recordLimit) || recordLimit < 1 || recordLimit > 100000) fail("RECIPE_APPLY_STORAGE");
    ensureSqlite();
    folder(root); const parent = path.join(root, ".framecraft-runtime"), directory = path.join(parent, "recipe-apply"); folder(parent, true); folder(directory, true);
    const file = path.join(directory, "requests.sqlite"), marker = path.join(directory, "identity.json"); initFile = path.join(directory, "initialize.lock");
    const exists = regular(file, limit, true), marked = regular(marker, 1024, true); if (!!exists !== !!marked) fail("RECIPE_APPLY_STORAGE");
    let identity;
    if (!exists) {
      initFd = openSync(initFile, "wx", 0o600); initStat = fstatSync(initFd); if (regular(file, limit, true) || regular(marker, 1024, true)) fail("RECIPE_APPLY_STORAGE");
      identity = { version: 1, id: randomUUID(), namespace }; const output = openSync(marker, "wx", 0o600);
      try { writeFileSync(output, JSON.stringify(identity) + "\n"); fsyncSync(output); } finally { closeSync(output); }
      const target = openSync(file, "wx", 0o600); closeSync(target);
    } else identity = JSON.parse(readIdentity(marker));
    if (!recipeKeys(identity, ["version", "id", "namespace"]) || identity.version !== 1 || !recipeApplyNamespace(identity.id) || identity.namespace !== namespace) fail("RECIPE_APPLY_STORAGE");
    const sidecars = () => { for (const suffix of ["-journal", "-wal", "-shm"]) regular(file + suffix, limit + 1048576, true); };
    sidecars(); db = new DatabaseSync(file, { allowExtension: false });
    db.exec("PRAGMA page_size=4096; PRAGMA max_page_count=16384; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA locking_mode=EXCLUSIVE; PRAGMA busy_timeout=0; BEGIN EXCLUSIVE; COMMIT");
    if (!exists) {
      db.exec("BEGIN IMMEDIATE; CREATE TABLE apply_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL,id TEXT NOT NULL,namespace TEXT NOT NULL,sequence INTEGER NOT NULL); CREATE TABLE apply_requests (id TEXT PRIMARY KEY,seq INTEGER NOT NULL UNIQUE,channel TEXT NOT NULL,terminal INTEGER NOT NULL CHECK(terminal IN(0,1)),payload TEXT NOT NULL,hash TEXT NOT NULL); CREATE INDEX apply_channel ON apply_requests(channel,terminal)");
      db.prepare("INSERT INTO apply_meta VALUES(1,1,?,?,0)").run(identity.id, namespace); db.exec("COMMIT");
      if (process.platform !== "win32") { const fd = openSync(directory, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } }
    }
    const original = regular(file), markerIdentity = readIdentity(marker);
    const check = () => {
      if (closed) fail("RECIPE_APPLY_STORAGE"); folder(root); folder(parent); folder(directory); sidecars(); if (!same(original, regular(file)) || readIdentity(marker) !== markerIdentity) fail("RECIPE_APPLY_STORAGE");
      const meta = db.prepare("SELECT * FROM apply_meta").all(); if (meta.length !== 1 || meta[0].singleton !== 1 || meta[0].version !== 1 || meta[0].id !== identity.id || meta[0].namespace !== namespace || !Number.isInteger(meta[0].sequence) || meta[0].sequence < 0 || meta[0].sequence > 4294967295) fail("RECIPE_APPLY_STORAGE"); return meta[0].sequence;
    };
    const fromRow = row => {
      if (!row) return; if (typeof row.payload !== "string" || row.hash !== fingerprint(row.payload)) fail("RECIPE_APPLY_STORAGE");
      const value = parseRecipeApplyReceipt(JSON.parse(row.payload)); if (value.namespace !== namespace || value.id !== row.id || value.sequence !== row.seq || value.channelId !== row.channel || Number(value.phase === "finished") !== row.terminal) fail("RECIPE_APPLY_STORAGE"); return value;
    };
    const put = value => { const text = JSON.stringify(parseRecipeApplyReceipt(value)); db.prepare("UPDATE apply_requests SET terminal=?,payload=?,hash=? WHERE id=?").run(Number(value.phase === "finished"), text, fingerprint(text), value.id); };
    const transaction = action => { check(); db.exec("BEGIN IMMEDIATE"); try { const result = action(); db.exec("COMMIT"); return result; } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; } };
    const count = check(), rows = db.prepare("SELECT * FROM apply_requests ORDER BY seq").all(); if (rows.length !== count || rows.some((row, i) => fromRow(row).sequence !== i + 1) || db.prepare("PRAGMA quick_check").get().quick_check !== "ok") fail("RECIPE_APPLY_STORAGE");
    return {
      get(id) { try { check(); if (!recipeApplyId(id)) fail("RECIPE_APPLY_INPUT"); return fromRow(db.prepare("SELECT * FROM apply_requests WHERE id=?").get(id)); } catch (error) { throw safe(error); } },
      channel(channelId, sentOnly = false) { try { check(); if (!recipeId(channelId)) fail("RECIPE_APPLY_INPUT"); return db.prepare("SELECT * FROM apply_requests WHERE channel=? ORDER BY seq DESC").all(channelId).map(fromRow).find(row => !sentOnly || row.writePhase !== "none"); } catch (error) { throw safe(error); } },
      reserve(input) {
        try { return transaction(() => {
          const sequence = check(), known = fromRow(db.prepare("SELECT * FROM apply_requests WHERE id=?").get(input.id));
          if (known) { if (known.fingerprint !== input.fingerprint || known.actor !== input.actor) fail("RECIPE_APPLY_CHANGED"); return { receipt: known, duplicate: true }; }
          if (!recipeId(input.channelId)) fail("RECIPE_APPLY_INPUT"); if (db.prepare("SELECT id FROM apply_requests WHERE channel=? AND terminal=0 LIMIT 1").get(input.channelId)) fail("RECIPE_APPLY_BUSY");
          if (sequence >= recordLimit || sequence >= 4294967295) fail("RECIPE_APPLY_LIMIT"); const at = new Date().toISOString();
          const value = parseRecipeApplyReceipt({ ...input, namespace, sequence: sequence + 1, createdAt: at, updatedAt: at, phase: "reserved", writePhase: "none", outcome: "pending", code: "RECIPE_APPLY_RESERVED", plcCode: null }), text = JSON.stringify(value);
          db.prepare("INSERT INTO apply_requests VALUES(?,?,?,0,?,?)").run(value.id, value.sequence, value.channelId, text, fingerprint(text)); db.prepare("UPDATE apply_meta SET sequence=? WHERE singleton=1").run(value.sequence); return { receipt: value, duplicate: false };
        }); } catch (error) { throw safe(error); }
      },
      change(id, phase, outcome, code, plcCode = null) {
        try { return transaction(() => {
          const current = fromRow(db.prepare("SELECT * FROM apply_requests WHERE id=?").get(id)); if (!current) fail("RECIPE_APPLY_MISSING");
          const nextPhase = current.phase === "reserved" ? "preparing" : current.phase === "preparing" ? "committing" : undefined;
          if (current.phase === "finished" || phase !== current.phase && phase !== "finished" && !(phase === nextPhase && current.outcome === "pending") || outcome === "applied" && current.phase !== "committing" || phase !== "finished" && !["pending", "uncertain"].includes(outcome) || current.outcome === "uncertain" && outcome === "pending") fail("RECIPE_APPLY_STORAGE");
          const value = parseRecipeApplyReceipt({ ...current, phase, writePhase: phase === "preparing" ? "prepare" : phase === "committing" ? "apply" : current.writePhase, outcome, code, plcCode, updatedAt: new Date(Math.max(Date.now(), Date.parse(current.updatedAt))).toISOString() }); put(value); return value;
        }); } catch (error) { throw safe(error); }
      },
      close() { if (!closed) { closed = true; db.close(); } },
    };
  } catch (error) { try { db?.close(); } catch {} throw safe(error); }
  finally { if (initFd !== undefined) { closeSync(initFd); try { if (same(initStat, lstatSync(initFile))) unlinkSync(initFile); } catch {} } }
}
