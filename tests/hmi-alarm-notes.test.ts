// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmiAlarmNotes } from "../src/core/hmiAlarmArchive";
import type { AlarmNoteCommand, AlarmNoteResult, AlarmNotesSnapshot } from "../runtime/alarm-history.mjs";

const user = vi.hoisted(() => ({ id: "synthetic", read: true, write: true }));
const login = vi.hoisted(() => vi.fn());
vi.mock("../src/core/hmiOperatorSession", () => ({ operatorSessionProfile: () => ({ id: user.id, permissions: [], capabilities: [...(user.read ? ["alarms.comments.read"] : []), ...(user.write ? ["alarms.comment"] : [])] }), operatorSessionHeaders: () => ({ "X-Framecraft-CSRF": "synthetic-csrf" }), openOperatorSession: login }));
const id = "7618fc24-79c4-4657-9139-56ad520cb1fa", instance = "6618fc24-79c4-4657-9139-56ad520cb1fa", epoch = "5618fc24-79c4-4657-9139-56ad520cb1fa", target = { archiveId: id, seq: 1, alarmId: "motor" };
const snapshot = (): AlarmNotesSnapshot => ({ version: 1, id, namespace: id, sequence: 1, through: 1, writable: true, serviceInstanceId: epoch, reference: { seq: 1, instanceId: instance, recordedAt: "2026-10-29T10:00:00.000Z", event: { sequence: 1, id: "motor", occurrence: "occ", name: "Motore <img src=x>", text: "Controlla il motore", alarmClass: "Guasto", area: "Linea", priority: 1, state: "Incoming", time: Date.parse("2026-10-29T10:00:00Z") } }, comments: [], nextBefore: null });
function result(command: AlarmNoteCommand, duplicate = false): AlarmNoteResult { return { version: 1, id, namespace: id, commandId: command.id, duplicate, entry: { seq: 2, instanceId: command.id, recordedAt: "2026-10-29T10:01:00.000Z", event: { ...snapshot().reference.event, sequence: 1, state: "Commented", actor: "local:synthetic", time: Date.parse("2026-10-29T10:01:00Z"), note: { id: command.id, text: command.text, reference: { archiveId: id, seq: 1, instanceId: instance, occurrence: "occ" } } } } }; }
const cleanup: (() => void)[] = [];
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === name)!;
const text = () => document.querySelector<HTMLTextAreaElement>('[aria-label="Nota operatore"]')!;
const input = (value: string) => { text().value = value; text().dispatchEvent(new Event("input", { bubbles: true })); };
function fixture() {
  let alive = true; const data = snapshot(), post = vi.fn<(command: AlarmNoteCommand) => Promise<Response>>(async command => new Response(JSON.stringify(result(command))));
  const request = vi.fn<typeof fetch>(async (_url, init) => init?.method === "POST" ? post(JSON.parse(String(init.body))) : new Response(JSON.stringify(data)));
  const opener = document.createElement("button"); opener.textContent = "Apri note"; document.body.append(opener); const notes = createHmiAlarmNotes({ enabled: true, namespace: id, request }); cleanup.push(() => notes.dispose());
  const open = () => notes.open(target, opener, () => alive); open(); return { data, post, request, opener, notes, open, block: () => { alive = false; } };
}
async function ready() { await vi.waitFor(() => expect(button("Rileggi note").disabled).toBe(false)); await vi.waitFor(() => expect(document.body.textContent).toContain("Note aggiornate")); }
beforeEach(() => { sessionStorage.clear(); user.id = "synthetic"; user.read = true; user.write = true; });
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose(); document.body.replaceChildren(); vi.restoreAllMocks(); login.mockClear(); });
describe("note allarmi nel pannello", () => {
  it("mostra il nome dell’operatore e mantiene l’ID nei dettagli", async () => {
    const f = fixture(); await ready(); f.post.mockImplementationOnce(async command => { const data = result(command); data.entry.event.note!.authorName = "Mario Rossi"; return new Response(JSON.stringify(data)); }); input("Nota verificata"); button("Rivedi nota").click(); button("Conferma registrazione nota").click(); await vi.waitFor(() => expect(document.querySelector('[aria-label="Ultima nota registrata"] strong')?.textContent).toContain("Mario Rossi")); expect(document.querySelector('[aria-label="Ultima nota registrata"] small')?.textContent).toContain("local:synthetic");
  });
  it("una sessione server scaduta lascia disponibile l’accesso e conserva il testo", async () => {
    const f = fixture(); await ready(); f.post.mockResolvedValueOnce(new Response(JSON.stringify({ type: "operator", code: "AUTH_REQUIRED", error: "PRIVATE_DETAIL" }), { status: 401 })); input("Da verificare"); button("Rivedi nota").click(); button("Conferma registrazione nota").click(); await vi.waitFor(() => expect(document.body.textContent).toContain("Accesso operatore richiesto")); expect(button("Apri accesso operatore").hidden).toBe(false); expect(text().value).toBe("Da verificare"); expect(document.body.textContent).not.toContain("PRIVATE_DETAIL"); expect(f.post).toHaveBeenCalledTimes(1);
  });
  it("la memoria bloccata non toglie l’accesso alle note del servizio", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("PRIVATE_BROWSER_DETAIL"); }); const f = fixture(); await vi.waitFor(() => expect(document.body.textContent).toContain("Memoria locale non disponibile")); expect(text().disabled).toBe(false); expect(document.body.textContent).not.toContain("PRIVATE_BROWSER_DETAIL"); expect(f.request).toHaveBeenCalledTimes(1);
  });
  it("non perde la bozza alla chiusura quando la memoria locale è piena", async () => {
    const f = fixture(); await ready(); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("PRIVATE_QUOTA"); }); input("Da conservare"); button("Chiudi note").click(); expect(document.querySelector('[role="dialog"]')).not.toBeNull(); expect(text().value).toBe("Da conservare"); expect(document.body.textContent).toContain("Copia testo e ID richiesta"); expect(document.body.textContent).not.toContain("PRIVATE_QUOTA"); button("Chiudi senza bozza locale").click(); expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(f.post).not.toHaveBeenCalled();
  });
  it("legge solo all’apertura richiesta e richiede revisione/conferma prima del POST", async () => {
    const f = fixture(); await ready(); expect(f.request).toHaveBeenCalledTimes(1); expect(document.querySelector("img")).toBeNull(); input("Sensore <img src=x>\nVerifica effettuata"); button("Rivedi nota").click(); expect(f.post).not.toHaveBeenCalled(); expect(document.activeElement?.getAttribute("aria-label")).toBe("Revisione nota allarme");
    button("Conferma registrazione nota").click(); await vi.waitFor(() => expect(document.body.textContent).toContain("Nota registrata")); expect(f.post).toHaveBeenCalledTimes(1); const command = f.post.mock.calls[0][0]; expect(command).toMatchObject({ serviceInstanceId: epoch, reference: target, text: "Sensore <img src=x>\nVerifica effettuata" }); expect(Object.keys(command)).not.toContain("actor"); expect(text().value).toBe(""); expect(document.querySelector("img")).toBeNull(); expect(Object.keys(sessionStorage)).toHaveLength(0);
  });
  it("conserva la bozza nella scheda ma non la invia alla riapertura", async () => {
    const f = fixture(); await ready(); input("Da controllare"); button("Chiudi note").click(); expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(f.opener); f.open(); await ready(); expect(text().value).toBe("Da controllare"); expect(f.post).not.toHaveBeenCalled();
  });
  it("un esito incerto conserva ID e testo e il tentativo manuale riusa lo stesso ID", async () => {
    const f = fixture(); await ready(); f.post.mockRejectedValueOnce(new Error("PRIVATE_CONNECTION_PASSWORD")); input("Controllo manutenzione"); button("Rivedi nota").click(); button("Conferma registrazione nota").click(); await vi.waitFor(() => expect(document.body.textContent).toContain("ID richiesta conservato")); const first = f.post.mock.calls[0][0]; expect(document.body.textContent).not.toContain("PRIVATE_CONNECTION_PASSWORD");
    button("Chiudi note").click(); f.open(); await vi.waitFor(() => expect(document.body.textContent).toContain("Richiesta da verificare")); expect(f.post).toHaveBeenCalledTimes(1); button("Rivedi la stessa richiesta").click(); expect(f.post).toHaveBeenCalledTimes(1); button("Conferma registrazione nota").click(); await vi.waitFor(() => expect(document.body.textContent).toContain("Nota registrata")); expect(f.post.mock.calls[1][0].id).toBe(first.id); expect(f.post.mock.calls[1][0].reference).toEqual(first.reference);
  });
  it("riconosce una risposta duplicata e non crea una seconda nota", async () => {
    const f = fixture(); await ready(); f.post.mockImplementationOnce(async command => new Response(JSON.stringify(result(command, true)))); input("Nota già inviata"); button("Rivedi nota").click(); button("Conferma registrazione nota").click(); await vi.waitFor(() => expect(document.body.textContent).toContain("Nota già presente nell’archivio")); expect(f.post).toHaveBeenCalledTimes(1);
  });
  it("il cambio utente rimuove dati e risposte tardive e separa le bozze", async () => {
    const f = fixture(); await ready(); let release!: (response: Response) => void; f.post.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })); input("Nota riservata all’operatore"); button("Rivedi nota").click(); button("Conferma registrazione nota").click(); await vi.waitFor(() => expect(f.post).toHaveBeenCalledOnce()); const command = f.post.mock.calls[0][0]; user.id = "other"; window.dispatchEvent(new Event("framecraft:user-changed")); expect(document.querySelector('[role="dialog"]')).toBeNull(); release(new Response(JSON.stringify(result(command)))); await Promise.resolve(); f.open(); await ready(); expect(text().value).toBe(""); expect(document.body.textContent).not.toContain("Nota riservata all’operatore");
  });
  it("non legge senza permesso e non rende scrivibile la sola consultazione", async () => {
    user.read = false; const f = fixture(); expect(f.request).not.toHaveBeenCalled(); expect(button("Rivedi nota").disabled).toBe(true); expect(document.body.textContent).toContain("alarms.comments.read"); button("Apri accesso operatore").click(); expect(login).toHaveBeenCalledOnce(); user.read = true; user.write = false; f.open(); await ready(); expect(text().disabled).toBe(true); expect(button("Rivedi nota").disabled).toBe(true); expect(f.post).not.toHaveBeenCalled();
  });
  it("una bozza sconosciuta resta intatta fino alla rimozione esplicita in due passaggi", async () => {
    const f = fixture(); await ready(); input("Bozza"); button("Chiudi note").click(); const key = Object.keys(sessionStorage)[0], corrupt = '{"version":77,"text":"PRIVATE_LOCAL_VALUE"}'; sessionStorage.setItem(key, corrupt); f.open(); await vi.waitFor(() => expect(document.body.textContent).toContain("Bozza locale non leggibile")); expect(button("Rivedi nota").disabled).toBe(true); expect(sessionStorage.getItem(key)).toBe(corrupt); expect(document.body.textContent).not.toContain("PRIVATE_LOCAL_VALUE"); button("Dimentica bozza locale").click(); expect(sessionStorage.getItem(key)).toBe(corrupt); button("Conferma rimozione bozza locale").click(); expect(sessionStorage.getItem(key)).toBeNull(); expect(text().disabled).toBe(false);
  });
  it("una risposta di un altro progetto è rifiutata e non abilita la scrittura", async () => {
    const f = fixture(); f.notes.dispose(); const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ...snapshot(), namespace: instance }))), notes = createHmiAlarmNotes({ enabled: true, namespace: id, request }); cleanup.push(() => notes.dispose()); notes.open(target); await vi.waitFor(() => expect(document.body.textContent).toContain("Risposta dello storico non valida")); expect(button("Rivedi nota").disabled).toBe(true);
  });
  it("un elemento bloccato non invia e permette comunque di chiudere la finestra", async () => {
    const f = fixture(); await ready(); input("Nota"); button("Rivedi nota").click(); f.block(); button("Conferma registrazione nota").click(); expect(f.post).not.toHaveBeenCalled(); button("Chiudi note").click(); expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
