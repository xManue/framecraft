import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAuditQuery, parseAuditSnapshot } from "../runtime/audit-query.mjs";
import { openRuntimeAudit, type RuntimeAuditEvent } from "../runtime/audit-store.mjs";
const event = (patch: Partial<RuntimeAuditEvent> = {}): RuntimeAuditEvent => ({ traceId: randomUUID(), actor: "local:synthetic", operation: "tags.write", resource: { kind: "tag", id: "Speed" }, commandId: "synthetic_command_00001", outcome: "delivered", code: "WRITE_BROKER_ACK", ...patch });
async function fixture() { const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); return openRuntimeAudit({ root: await mkdtemp(path.join(base, "audit-query-")), namespace: randomUUID() }); }
describe("letture verificate del registro", () => {
  it("filtra prima della paginazione e non modifica il registro", async () => {
    const audit = await fixture(); try {
      for (let i = 0; i < 8; i++) audit.append(event({ outcome: i % 2 ? "uncertain" : "delivered", code: i % 2 ? "WRITE_UNCERTAIN" : "WRITE_BROKER_ACK" }));
      const query = { limit: 2, outcome: "delivered" }, first = parseAuditSnapshot(audit.read(query), query);
      expect(first.events.map(item => item.seq)).toEqual([7, 5]); expect(first.nextBefore).toBe(5);
      const secondQuery = { ...query, before: 5, through: first.sequence, journalId: first.id };
      audit.append(event());
      const second = parseAuditSnapshot(audit.read(secondQuery), secondQuery);
      expect(second.events.map(item => item.seq)).toEqual([3, 1]); expect(second.nextBefore).toBeNull(); expect(audit.read().sequence).toBe(9);
      expect(first).toMatchObject({ uncertainCount: 4, unresolvedCount: 0 });
    } finally { audit.close(); }
  });
  it("filtra operazione, ID operatore e intervallo UTC con confini inclusivi", async () => {
    const audit = await fixture(); try {
      audit.append(event()); audit.append(event({ actor: "local:other" }));
      const rows = audit.read(), time = rows.events.find(item => item.seq === 1)!.timestamp;
      const filtered = audit.read({ actor: "local:synthetic", operation: "tags.write", from: time, to: time });
      expect(filtered.events.map(item => item.seq)).toEqual([1]); expect(audit.read({ operation: "session.login" }).events).toEqual([]);
    } finally { audit.close(); }
  });
  it("non mescola archivi diversi o una sequenza di riferimento non più presente", async () => {
    const audit = await fixture(); try {
      expect(() => audit.read({ journalId: randomUUID() })).toThrow(expect.objectContaining({ code: "AUTH_AUDIT_CHANGED" }));
      expect(() => audit.read({ through: 1 })).toThrow(expect.objectContaining({ code: "AUTH_AUDIT_CHANGED" }));
    } finally { audit.close(); }
  });
  it.each([{ limit: 501 }, { limit: "1e2" }, { before: -1 }, { through: Number.MAX_SAFE_INTEGER + 1 }, { actor: " user " }, { operation: "unknown" }, { outcome: "unknown" }, { from: "2026-10-20" }, { from: "2026-10-21T00:00:00.000Z", to: "2026-10-20T00:00:00.000Z" }, { journalId: "bad" }, { password: "not-permitted" }])("rifiuta filtri ambigui o sconosciuti: %j", query => expect(() => parseAuditQuery(query)).toThrow());
  it("valida il payload, i tipi, l’ordine e la corrispondenza ai filtri", async () => {
    const audit = await fixture(); try {
      audit.append(event()); const value = audit.read(); expect(parseAuditSnapshot(value)).toEqual(value);
      for (const invalid of [{ ...value, verified: false }, { ...value, password: "secret" }, { ...value, events: [value.events[0], value.events[0]] }, { ...value, nextBefore: 7 }, { ...value, events: [{ ...value.events[0], resource: null }] }, { ...value, events: [{ ...value.events[0], timestamp: "bad" }] }]) expect(() => parseAuditSnapshot(invalid)).toThrow();
      expect(() => parseAuditSnapshot(value, { actor: "another" })).toThrow();
      expect(() => parseAuditSnapshot(value, { journalId: randomUUID() })).toThrow();
    } finally { audit.close(); }
  });
});
