import { DatabaseSync } from "node:sqlite";
import { auditSqliteSupported } from "./audit-store.mjs";
import { mkdirSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";

export class SchedulerError extends Error {
  constructor(code = "SCHEDULER_STORAGE") {
    const messages = {
      SCHEDULER_STORAGE: ["Lo Scheduler non può conservare lo stato o è già in uso da un altro servizio.", "Controlla che sia avviato un solo servizio per questo progetto e che la cartella .framecraft-runtime sia scrivibile. Nessuna operazione viene ripetuta automaticamente."],
      SCHEDULER_REVIEW: ["Lo Scheduler attende la verifica di un’operazione interrotta o incerta.", "Controlla lo stato reale della macchina. Arresta il servizio e usa npm run scheduler -- status, poi review con l’ID dell’esecuzione verificata. La verifica non ripete il comando."],
      SCHEDULER_CONFIG: ["Lo Scheduler del servizio non è configurato correttamente.", "Salva e compila gli script nell’editor. Scegli un account locale abilitato con scheduler.execute e i permessi necessari sui tag; riavvia il servizio."],
      SCHEDULER_SKIPPED: ["Un’esecuzione scaduta è stata saltata.", "Controlla l’orologio del server e lo storico. Le operazioni perse o interrotte non vengono ripetute automaticamente."],
      SCHEDULER_BUSY: ["Lo Scheduler non riesce a seguire la frequenza richiesta.", "Riduci la frequenza o la durata degli script. La coda è limitata e le occorrenze in eccesso vengono saltate."],
      SCHEDULER_FAILED: ["Un’operazione pianificata si è fermata.", "Controlla account, permessi, qualità dei tag e diagnostica PLC. Una scrittura già consegnata potrebbe essere stata eseguita: verifica la macchina prima di riprovare."],
    };
    const key = Object.hasOwn(messages, code) ? code : "SCHEDULER_STORAGE";
    super(messages[key][0]); this.name = "SchedulerError"; this.code = key; this.remedy = messages[key][1];
  }
}
const fail = () => { throw new SchedulerError(); };
const comparable = value => process.platform === "win32" ? value.toLowerCase() : value;
/** SQLite keeps the OS lock even when the process is paused, and releases it on crash. No lease takeover. */
export function openSchedulerStore({ root, namespace }) {
  if (!/^[a-f0-9-]{36}$/.test(namespace)) throw new SchedulerError("SCHEDULER_CONFIG");
  root = path.resolve(root); let db;
  try {
    for (const folder of [root, path.join(root, ".framecraft-runtime"), path.join(root, ".framecraft-runtime", "scheduler")]) {
      if (folder !== root) try { mkdirSync(folder, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
      const stat = lstatSync(folder); if (!stat.isDirectory() || stat.isSymbolicLink() || comparable(realpathSync(folder)) !== comparable(folder)) fail();
    }
    const file = path.join(root, ".framecraft-runtime", "scheduler", "state.sqlite");
    const regular = name => { try { const s = lstatSync(name); if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.size > 32 * 1024 * 1024) fail(); return s; } catch (error) { if (error.code !== "ENOENT") throw error; } };
    regular(file); regular(file + "-journal"); regular(file + "-wal"); regular(file + "-shm");
    db = new DatabaseSync(file, { allowExtension: false });
    if (!auditSqliteSupported(db.prepare("SELECT sqlite_version() v").get().v)) throw new SchedulerError("SCHEDULER_CONFIG");
    db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA max_page_count=8192; BEGIN EXCLUSIVE;");
    db.exec("CREATE TABLE IF NOT EXISTS identity(namespace TEXT NOT NULL); CREATE TABLE IF NOT EXISTS occurrences(task_key TEXT PRIMARY KEY,highwater REAL NOT NULL); CREATE TABLE IF NOT EXISTS runs(seq INTEGER PRIMARY KEY,id TEXT NOT NULL,task TEXT NOT NULL,cause TEXT NOT NULL,scheduled_at REAL NOT NULL,state TEXT NOT NULL,code TEXT NOT NULL);");
    if (db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type IN ('trigger','view') OR type='table' AND name NOT IN ('identity','occurrences','runs')").get().n || db.prepare("PRAGMA quick_check").get().quick_check !== "ok") fail();
    const identity = db.prepare("SELECT namespace FROM identity").all();
    if (!identity.length) db.prepare("INSERT INTO identity VALUES(?)").run(namespace); else if (identity.length !== 1 || identity[0].namespace !== namespace) fail();
    db.exec("COMMIT"); // locking_mode=EXCLUSIVE retains ownership between durable transactions.
    const original = lstatSync(file); let closed = false;
    const check = () => { const stat = regular(file); if (closed || !stat || stat.dev !== original.dev || stat.ino !== original.ino) fail(); };
    db.exec("UPDATE runs SET state='uncertain',code='SCHEDULER_INTERRUPTED' WHERE state='running'");
    return {
      claim({ id, task, cause, scheduledAt, key }) {
        check(); db.exec("BEGIN IMMEDIATE");
        try {
          if (key) { const row = db.prepare("SELECT highwater FROM occurrences WHERE task_key=?").get(key); if (row && row.highwater >= scheduledAt) { db.exec("ROLLBACK"); return false; }
            if (!row && db.prepare("SELECT count(*) n FROM occurrences").get().n >= 4096) fail();
            db.prepare("INSERT INTO occurrences VALUES(?,?) ON CONFLICT(task_key) DO UPDATE SET highwater=excluded.highwater").run(key, scheduledAt); }
          db.prepare("INSERT INTO runs(id,task,cause,scheduled_at,state,code) VALUES(?,?,?,?,'running','SCHEDULER_STARTED')").run(id, task, cause, scheduledAt);
          db.exec("DELETE FROM runs WHERE state != 'uncertain' AND seq NOT IN (SELECT seq FROM runs ORDER BY seq DESC LIMIT 1000); COMMIT"); return true;
        } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
      },
      finish(id, state, code) { check(); db.prepare("UPDATE runs SET state=?,code=? WHERE id=?").run(state, code, id); },
      needsReview() { check(); return db.prepare("SELECT count(*) n FROM runs WHERE state='uncertain'").get().n > 0; },
      review(id) { check(); if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) throw new SchedulerError("SCHEDULER_CONFIG"); return Number(db.prepare("UPDATE runs SET state='reviewed' WHERE id=? AND state='uncertain'").run(id).changes) === 1; },
      history() { check(); return db.prepare("SELECT id,task,cause,scheduled_at AS scheduledAt,state,code FROM runs ORDER BY seq DESC LIMIT 50").all().map(row => ({ ...row })); },
      close() { if (!closed) { closed = true; db.close(); } },
    };
  } catch { try { db?.close(); } catch {} throw new SchedulerError(); }
}
