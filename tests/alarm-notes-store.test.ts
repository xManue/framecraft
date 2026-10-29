// @vitest-environment node
import type { AlarmEvent } from "../runtime/alarm-engine.mjs";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openAlarmHistory } from "../runtime/alarm-history-store.mjs";
import { parseAlarmNoteCommand, parseAlarmNoteQuery, parseAlarmNotesSnapshot, parseAlarmNoteResult, parseAlarmHistorySnapshot, type AlarmNoteCommand } from "../runtime/alarm-history.mjs";

const instance = randomUUID(), actor = "local:synthetic-operator";
const event = (sequence = 1, occurrence = "occ-1", patch: Partial<AlarmEvent> = {}): AlarmEvent => ({ sequence, occurrence, id: "motor", name: "Motore", text: "Controlla il motore", alarmClass: "Guasto", area: "Linea", priority: 2, state: "Incoming", time: Date.parse("2026-10-29T10:00:00Z"), ...patch });
async function fixture(recordLimit = 1000) {
  await mkdir(path.resolve(".hmi-preview"), { recursive: true }); const root = await mkdtemp(path.resolve(".hmi-preview/alarm-notes-")), namespace = randomUUID();
  const store = openAlarmHistory({ root, namespace, recordLimit }); store.begin(instance); store.append([event()]);
  const id = store.read().id, query = { archiveId: id, seq: 1, alarmId: "motor" }, command = (text = "Sensore verificato", reference = query): AlarmNoteCommand => ({ version: 1, id: randomUUID(), serviceInstanceId: instance, reference, text });
  return { root, namespace, recordLimit, store, id, query, command, file: path.join(root, ".framecraft-runtime/alarm-history/alarms.sqlite") };
}
describe("note persistenti degli allarmi", () => {
  it("conserva il nome verificato senza cambiare l’identità stabile o riscriverlo al duplicato", async () => {
    const f = await fixture(), command = f.command(); try { const result = f.store.addComment(command, actor, "Mario Rossi"); expect(result.entry.event).toMatchObject({ actor, note: { authorName: "Mario Rossi" } }); expect(f.store.addComment(command, actor, "Nome aggiornato").entry.event.note?.authorName).toBe("Mario Rossi"); expect(() => f.store.addComment(f.command(), actor, "Nome\nnon valido")).toThrow(expect.objectContaining({ code: "ALARM_NOTE_INPUT" })); } finally { f.store.close(); }
  });
  it("valida comandi, riferimenti e testo semplice senza autori o campi inventati", async () => {
    const f = await fixture(); try {
      expect(parseAlarmNoteCommand(f.command("Testo <img src=x>\nSeconda riga"))).toMatchObject({ text: "Testo <img src=x>\nSeconda riga" });
      for (const text of ["", " ", "a".repeat(1001), "a\tb", "a\rb", "a\u202eb"]) expect(() => parseAlarmNoteCommand(f.command(text))).toThrow(expect.objectContaining({ code: "ALARM_NOTE_INPUT" }));
      for (const input of [{ ...f.command(), actor: "Admin" }, { ...f.command(), serviceInstanceId: "fake" }, { ...f.command(), reference: { ...f.query, seq: 0 } }]) expect(() => parseAlarmNoteCommand(input)).toThrow();
      expect(() => parseAlarmNoteQuery({ ...f.query, occurrence: "forged" })).toThrow(); expect(() => parseAlarmNoteQuery({ ...f.query, before: 2, through: 0 })).toThrow();
    } finally { f.store.close(); }
  });
  it("aggiunge una nota senza cambiare gli eventi precedenti o il contatore del motore", async () => {
    const f = await fixture(); try {
      const before = f.store.read().events[0], command = f.command("=Verifica\nNessun comando PLC"), result = f.store.addComment(command, actor);
      expect(parseAlarmNoteResult(result, command)).toEqual(result); expect(result).toMatchObject({ duplicate: false, entry: { seq: 2, instanceId: command.id, event: { sequence: 1, state: "Commented", actor, occurrence: "occ-1" } } });
      f.store.append([event(2, "occ-1", { state: "Outgoing" })]); expect(f.store.read().events.at(-1)).toEqual(before); f.store.finish(2, 0);
      const data = f.store.notes(f.query); expect(parseAlarmNotesSnapshot({ ...data, writable: true, serviceInstanceId: instance }, f.query).comments).toHaveLength(1); expect(f.store.read().incompleteRuns).toBe(0);
      expect(parseAlarmHistorySnapshot({ ...f.store.read(), capture: { state: "recording", unconfirmedInThisRun: 0 } }).events[1].event.note?.text).toBe(command.text);
    } finally { f.store.close(); }
  });
  it("rende idempotente lo stesso ID anche dopo riapertura e rifiuta il riuso con un altro testo o autore", async () => {
    const f = await fixture(), command = f.command(); f.store.addComment(command, actor); f.store.finish(1, 0); f.store.close(); const store = openAlarmHistory(f);
    try {
      store.begin(randomUUID()); expect(store.addComment(command, actor).duplicate).toBe(true); expect(store.read().count).toBe(2);
      for (const [input, who] of [[{ ...command, text: "Altro" }, actor], [command, "other"]] as const) expect(() => store.addComment(input, who)).toThrow(expect.objectContaining({ code: "ALARM_NOTE_CONFLICT" }));
      expect(store.addComment(f.command("Nota successiva"), actor).duplicate).toBe(false);
    } finally { store.finish(0, 0); store.close(); }
  });
  it("lega le note alla vera occorrenza anche se si aprono da eventi diversi della stessa occorrenza", async () => {
    const f = await fixture(); try {
      f.store.append([event(2, "occ-1", { state: "Outgoing" })]); f.store.addComment(f.command(), actor); f.store.addComment(f.command("Dopo il rientro", { ...f.query, seq: 2 }), actor);
      expect(f.store.notes({ instanceId: instance, occurrence: "occ-1", alarmId: "motor" }).comments).toHaveLength(2); f.store.append([event(3, "occ-2")]);
      expect(f.store.notes({ instanceId: instance, occurrence: "occ-2", alarmId: "motor" }).comments).toHaveLength(0); expect(f.store.notes(f.query).comments).toHaveLength(2);
      expect(() => f.store.notes({ instanceId: instance, occurrence: "occ-1", alarmId: "motor" })).toThrow(expect.objectContaining({ code: "ALARM_NOTE_CHANGED" }));
    } finally { f.store.close(); }
  });
  it("risolve un evento della sessione precedente alla nuova occorrenza senza cambiarne il riferimento", async () => {
    const f = await fixture(); try {
      f.store.append([event(2, "occ-1", { state: "Outgoing" }), event(3, "occ-2")]);
      const query = { instanceId: instance, occurrence: "occ-1", alarmId: "motor", sourceSequence: 2 }, data = f.store.notes(query);
      expect(data.reference).toMatchObject({ seq: 2, event: { sequence: 2, occurrence: "occ-1", state: "Outgoing" } });
      expect(parseAlarmNotesSnapshot({ ...data, writable: true, serviceInstanceId: instance }, query).reference.seq).toBe(2);
      expect(() => f.store.notes({ ...query, sourceSequence: 3 })).toThrow(expect.objectContaining({ code: "ALARM_NOTE_CHANGED" }));
      expect(() => parseAlarmNoteQuery({ ...query, sourceSequence: 0 })).toThrow();
    } finally { f.store.close(); }
  });
  it("non scrive con archivio, evento o ID allarme sbagliato e non avvelena l’archivio", async () => {
    const f = await fixture(); try {
      for (const reference of [{ ...f.query, archiveId: randomUUID() }, { ...f.query, seq: 999 }, { ...f.query, alarmId: "other" }]) expect(() => f.store.addComment(f.command("Verifica", reference), actor)).toThrow();
      expect(f.store.read().count).toBe(1); expect(f.store.addComment(f.command(), actor).duplicate).toBe(false);
    } finally { f.store.close(); }
  });
  it("rispetta il limite eventi senza cancellazioni e riconosce un duplicato anche a registro pieno", async () => {
    const f = await fixture(2), command = f.command(); try { f.store.addComment(command, actor); expect(() => f.store.addComment(f.command(), actor)).toThrow(expect.objectContaining({ code: "ALARM_HISTORY_LIMIT" })); expect(f.store.addComment(command, actor).duplicate).toBe(true); expect(f.store.read().count).toBe(2); } finally { f.store.close(); }
  });
  it("pagina le note su una sequenza fissata senza includere quelle aggiunte dopo", async () => {
    const f = await fixture(); try {
      for (let i = 0; i < 52; i++) f.store.addComment(f.command("Nota " + i), actor); const first = f.store.notes(f.query); expect(first.comments).toHaveLength(50); expect(first.nextBefore).toBe(first.comments.at(-1)?.seq);
      f.store.addComment(f.command("Arrivata dopo"), actor); const next = f.store.notes({ ...f.query, through: first.through, before: first.nextBefore! }); expect(next.comments).toHaveLength(2); expect(next.nextBefore).toBeNull(); expect(new Set([...first.comments, ...next.comments].map(e => e.seq)).size).toBe(52);
    } finally { f.store.close(); }
  });
  it("rilegge dopo il riavvio anche in sola lettura e non modifica il file", async () => {
    const f = await fixture(); f.store.addComment(f.command(), actor); f.store.finish(1, 0); f.store.close(); const before = await readFile(f.file), store = openAlarmHistory({ ...f, readOnly: true });
    try { expect(store.notes(f.query).comments).toHaveLength(1); expect(() => store.addComment(f.command(), actor)).toThrow(expect.objectContaining({ code: "ALARM_NOTE_DISABLED" })); } finally { store.close(); } expect(await readFile(f.file)).toEqual(before);
  });
  it("usa l’indice di occorrenza e non riscrive una nota corrotta", async () => {
    const f = await fixture(); f.store.addComment(f.command(), actor); f.store.finish(1, 0); f.store.close(); const db = new DatabaseSync(f.file);
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM history_events WHERE state='Commented' AND alarm_id=? AND json_extract(payload,'$.note.reference.instanceId')=? AND json_extract(payload,'$.note.reference.occurrence')=? AND seq<=? ORDER BY seq DESC LIMIT 51").all("motor", instance, "occ-1", 100); expect(plan.some(row => String(row.detail).includes("history_notes"))).toBe(true);
    const row = db.prepare("SELECT payload FROM history_events WHERE seq=2").get()!; const payload = JSON.parse(String(row.payload)); payload.note.text = ""; db.prepare("UPDATE history_events SET payload=? WHERE seq=2").run(JSON.stringify(payload)); db.close(); const before = await readFile(f.file), reader = openAlarmHistory({ ...f, readOnly: true });
    try { expect(() => reader.notes(f.query)).toThrow(); } finally { reader.close(); } expect(await readFile(f.file)).toEqual(before);
  });
});
