import { DatabaseSync } from "node:sqlite";
import { mkdir, mkdtemp, readFile, stat, link, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openRuntimeAudit, auditSqliteSupported, type RuntimeAuditEvent } from "../runtime/audit-store.mjs";

async function fixture() { const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "audit-store-")); return { root, namespace: randomUUID(), file: path.join(root, ".framecraft-runtime/audit/audit.sqlite") }; }
const entry = (patch: Partial<RuntimeAuditEvent> = {}): RuntimeAuditEvent => ({ traceId: randomUUID(), actor: "local:" + randomUUID() + ":" + randomUUID(), operation: "tags.write", resource: { kind: "tag", id: "Speed" }, commandId: "synthetic_command_00001", outcome: "requested", code: "OPERATION_REQUESTED", ...patch });
describe("registro audit SQLite privato", () => {
  it("esclude le versioni WAL-reset vulnerabili, accetta solo release corrette o backport dichiarati", () => {
    for (const version of ["3.51.3", "3.53.3", "3.50.7", "3.44.6"]) expect(auditSqliteSupported(version)).toBe(true);
    for (const version of ["3.51.2", "3.50.6", "3.44.5", "3.47.2", "3.49.1", "3.51.3-dev", "bad", undefined]) expect(auditSqliteSupported(version)).toBe(false);
  });
  it("un lettore WAL con snapshot aperto non blocca le scritture del servizio", async () => {
    const test = await fixture(), audit = openRuntimeAudit(test), reader = new DatabaseSync(test.file, { readOnly: true }); try {
      audit.append(entry()); reader.exec("BEGIN"); expect(reader.prepare("SELECT count(*) count FROM audit_events").get()!.count).toBe(1);
      audit.append(entry()); expect(reader.prepare("SELECT count(*) count FROM audit_events").get()!.count).toBe(1); reader.exec("COMMIT"); expect(audit.read().sequence).toBe(2);
    } finally { reader.close(); audit.close(); }
  });
  it("limite esplicito senza rotazione distruttiva o troncamento dei record esistenti", async () => {
    const test = await fixture(), audit = openRuntimeAudit({ ...test, recordLimit: 2 }); try { audit.append(entry()); audit.append(entry()); expect(() => audit.append(entry())).toThrow(expect.objectContaining({ code: "AUTH_AUDIT_LIMIT" })); } finally { audit.close(); }
    const reader = openRuntimeAudit({ ...test, readOnly: true }); try { expect(reader.read().sequence).toBe(2); } finally { reader.close(); }
  });
  it("lettura assente non crea archivi; salvataggi persistenti, pagine e richieste senza esito", async () => {
    const test = await fixture(); expect(() => openRuntimeAudit({ ...test, readOnly: true })).toThrow(); await expect(stat(path.join(test.root, ".framecraft-runtime"))).rejects.toMatchObject({ code: "ENOENT" });
    const writer = openRuntimeAudit(test), request = entry(); writer.append(request); writer.append({ ...request, outcome: "uncertain", code: "WRITE_UNCERTAIN" }); const interrupted = entry(); writer.append(interrupted); writer.close();
    const reader = openRuntimeAudit({ ...test, readOnly: true }); try { const page = reader.read({ limit: 2 }); expect(page).toMatchObject({ sequence: 3, verified: true, unresolvedCount: 1, uncertainCount: 1, nextBefore: 2 }); expect(page.events.map(item => item.seq)).toEqual([3, 2]); expect(reader.read({ before: 2 }).events.map(item => item.seq)).toEqual([1]); expect(() => reader.append(entry())).toThrow(); } finally { reader.close(); }
  });
  it("rifiuta campi payload/credenziali, risorsa incoerente e testo arbitrario senza registrarli", async () => {
    const audit = openRuntimeAudit(await fixture()); try {
      for (const bad of [{ ...entry(), password: "SYNTHETIC_PRIVATE" }, { ...entry(), value: 123 }, entry({ resource: { kind: "alarm", id: "a" } }), entry({ resource: null }), entry({ actor: "\nsecret" }), entry({ code: "SYNTHETIC raw error with secret" })]) expect(() => audit.append(bad)).toThrow();
      expect(audit.read().sequence).toBe(0);
    } finally { audit.close(); }
  });
  it("più writer verificano la coda sotto transazione, il lettore non modifica il file", async () => {
    const test = await fixture(), a = openRuntimeAudit(test), b = openRuntimeAudit(test); try {
      a.append(entry()); b.append(entry()); a.append(entry()); const before = await readFile(test.file);
      const reader = openRuntimeAudit({ ...test, readOnly: true }); try { expect(reader.read().events.map(item => item.seq)).toEqual([3, 2, 1]); } finally { reader.close(); }
      expect(await readFile(test.file)).toEqual(before);
    } finally { a.close(); b.close(); }
  });
  it("rileva alterazioni della catena e non ripara o sovrascrive il database", async () => {
    const test = await fixture(), audit = openRuntimeAudit(test); audit.append(entry()); audit.append(entry());
    const db = new DatabaseSync(test.file); db.prepare("UPDATE audit_events SET payload=? WHERE seq=1").run("SYNTHETIC_ALTERED_RECORD"); db.close();
    expect(() => audit.append(entry())).toThrow(); audit.close(); const before = await readFile(test.file); expect(() => openRuntimeAudit(test)).toThrow(); expect(await readFile(test.file)).toEqual(before);
  });
  it("file mancanti, hard link, namespace errato e database sostituito non ricreano il registro", async () => {
    const test = await fixture(), audit = openRuntimeAudit(test); audit.append(entry()); audit.close();
    expect(() => openRuntimeAudit({ ...test, namespace: randomUUID() })).toThrow();
    await link(test.file, test.file + ".linked"); expect(() => openRuntimeAudit(test)).toThrow();
    const missing = await fixture(), other = openRuntimeAudit(missing); other.close(); await rename(missing.file, missing.file + ".conserved"); expect(() => openRuntimeAudit(missing)).toThrow(); await expect(stat(missing.file)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("database occupato blocca la scrittura e non ripete richieste automaticamente", async () => {
    const test = await fixture(), audit = openRuntimeAudit(test), db = new DatabaseSync(test.file); try { db.exec("BEGIN IMMEDIATE"); expect(() => audit.append(entry())).toThrow(); db.exec("ROLLBACK"); expect(() => audit.append(entry())).toThrow(); expect(audit.read.bind(audit)).toThrow(); } finally { audit.close(); db.close(); }
    const reader = openRuntimeAudit({ ...test, readOnly: true }); try { expect(reader.read().sequence).toBe(0); } finally { reader.close(); }
  });
});
