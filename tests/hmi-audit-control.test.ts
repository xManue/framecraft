// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OperatorProfile } from "../runtime/operator-policy.mjs";
import type { RuntimeAuditSnapshot } from "../runtime/audit-store.mjs";
const auth = vi.hoisted(() => ({ user: null as OperatorProfile | null, open: vi.fn() }));
vi.mock("../src/core/hmiOperatorSession", () => ({ operatorSessionProfile: () => auth.user, operatorSessionHeaders: () => ({}), openOperatorSession: auth.open }));
import { createHmiAuditControl } from "../src/core/hmiAuditControl";
let host: HTMLDivElement, control: ReturnType<typeof createHmiAuditControl> | undefined;
const user = (): OperatorProfile => ({ id: "auditor", name: "Audit sintetico", role: "Supervisore", capabilities: ["audit.read"], permissions: [] });
const event = (seq = 1): RuntimeAuditSnapshot["events"][number] => ({ seq, timestamp: "2026-10-21T10:00:00.000Z", traceId: randomUUID(), actor: "local:synthetic", operation: "tags.write", resource: { kind: "tag", id: "Speed" }, commandId: "synthetic_command_00001", outcome: "delivered", code: "WRITE_BROKER_ACK" });
const snapshot = (): RuntimeAuditSnapshot => ({ version: 1, id: randomUUID(), namespace: randomUUID(), verified: true, sequence: 1, uncertainCount: 0, unresolvedCount: 0, events: [event()], nextBefore: null });
const button = (name: string) => [...host.querySelectorAll("button")].find(node => node.textContent === name)!;
const input = (name: string) => [...host.querySelectorAll("label")].find(node => node.firstChild?.textContent === name)!.querySelector("input,select") as HTMLInputElement | HTMLSelectElement;
beforeEach(() => { auth.user = user(); auth.open.mockReset(); host = document.createElement("div"); host.textContent = "Segnaposto originale"; document.body.append(host); });
afterEach(() => { control?.dispose(); control = undefined; host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
function mount(request: typeof fetch, enabled = true, timeoutMs = 1000) { control = createHmiAuditControl(host, { request, enabled, timeoutMs }); }
async function loaded() { await vi.waitFor(() => expect(host.textContent).toContain("Catena verificata dal servizio")); }

it("non legge automaticamente e non invia token o comandi quando si consulta il registro", async () => {
  const value = snapshot(), request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value)));
  const storage = vi.spyOn(Storage.prototype, "setItem"); mount(request); expect(request).not.toHaveBeenCalled();
  button("Carica registro").click(); await loaded();
  expect(request).toHaveBeenCalledOnce(); expect(request.mock.calls[0][0]).toBe("/_framecraft/plc/v1/audit?limit=50");
  expect(request.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error", cache: "no-store", headers: {} });
  expect(storage).not.toHaveBeenCalled(); expect(host.textContent).toContain("non confermato dal PLC"); expect(host.querySelector("ol")!.children).toHaveLength(1);
});
it("richiede il permesso server dedicato e offre il normale accesso operatore", () => {
  auth.user = { ...user(), capabilities: [] }; const request = vi.fn<typeof fetch>(); mount(request);
  expect(button("Carica registro").disabled).toBe(true); button("Apri accesso operatore").click(); expect(auth.open).toHaveBeenCalledOnce(); expect(request).not.toHaveBeenCalled();
});
it("distingue conferma PLC delle ricette da modifica dell’archivio e da consegna driver", async () => {
  const value = snapshot(); value.events[0] = { ...value.events[0], operation: "recipes.apply", resource: { kind: "recipe-schema", id: "s", recordId: "r", targetId: null }, outcome: "applied", code: "RECIPE_APPLY_CONFIRMED" };
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value))); mount(request); button("Carica registro").click(); await loaded(); expect(host.textContent).toContain("Applicazione confermata dal programma PLC"); expect(host.querySelector("ol")?.textContent).not.toContain("Applicato al servizio");
});
it("rispetta configurazione disabilitata e blocchi ereditati senza leggere dati", () => {
  const request = vi.fn<typeof fetch>(); mount(request, false); button("Carica registro").click(); expect(request).not.toHaveBeenCalled();
  control!.dispose(); mount(request); host.dataset.fcUserRequires = "maintenance"; button("Carica registro").click(); expect(request).not.toHaveBeenCalled();
  control!.refresh(); expect(button("Carica registro").disabled).toBe(true);
});
it("applica filtri al servizio solo su richiesta e rifiuta date invertite", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(snapshot()))); mount(request);
  const operation = input("Operazione"); operation.value = "tags.write"; operation.dispatchEvent(new Event("change"));
  const actor = input("Operatore (ID esatto del registro)"); actor.value = "local:synthetic"; actor.dispatchEvent(new Event("input"));
  expect(request).not.toHaveBeenCalled(); button("Carica registro").click(); await loaded();
  expect(String(request.mock.calls[0][0])).toContain("operation=tags.write"); expect(String(request.mock.calls[0][0])).toContain("actor=local%3Asynthetic");
  const from = input("Da (ora di questo dispositivo)"), to = input("A (ora di questo dispositivo)");
  from.value = "2026-10-22T10:00"; to.value = "2026-10-21T10:00"; from.dispatchEvent(new Event("input")); to.dispatchEvent(new Event("input"));
  expect(host.textContent).toContain("Filtri modificati");
  button("Aggiorna dalla prima pagina").click(); expect(request).toHaveBeenCalledOnce(); expect(host.textContent).toContain("Filtri non validi");
});
it("pagina sullo stesso registro e sulla stessa sequenza senza mescolare eventi nuovi", async () => {
  const first = { ...snapshot(), sequence: 60, events: Array.from({ length: 50 }, (_, index) => event(60 - index)), nextBefore: 11 };
  const second = { ...first, sequence: 62, events: Array.from({ length: 10 }, (_, index) => event(10 - index)), nextBefore: null };
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify(first))).mockResolvedValueOnce(new Response(JSON.stringify(second)));
  mount(request); button("Carica registro").click(); await loaded(); button("Eventi precedenti").click(); await vi.waitFor(() => expect(host.querySelector("ol")?.children).toHaveLength(10));
  const url = new URL(String(request.mock.calls[1][0]), "http://localhost"); expect(url.searchParams.get("journalId")).toBe(first.id); expect(url.searchParams.get("through")).toBe("60"); expect(url.searchParams.get("before")).toBe("11");
  expect(button("Eventi precedenti").disabled).toBe(true); expect(host.textContent).toContain("sequenza di riferimento 60");
});
it("non avanza con filtri appena modificati prima di applicarli", async () => {
  const value = { ...snapshot(), sequence: 60, events: Array.from({ length: 50 }, (_, index) => event(60 - index)), nextBefore: 11 };
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value))); mount(request); button("Carica registro").click(); await loaded();
  expect(button("Eventi precedenti").disabled).toBe(false);
  const field = input("Operazione"); field.value = "session.login"; field.dispatchEvent(new Event("change"));
  expect(button("Eventi precedenti").disabled).toBe(true); expect(host.textContent).toContain("filtri precedenti"); button("Eventi precedenti").click(); expect(request).toHaveBeenCalledOnce();
});
it("rimuove subito i dati al cambio utente e ignora una risposta tardiva", async () => {
  let release!: (value: Response) => void; const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { release = resolve; }));
  mount(request); button("Carica registro").click(); expect(request).toHaveBeenCalledOnce();
  auth.user = null; window.dispatchEvent(new Event("framecraft:user-changed")); release(new Response(JSON.stringify(snapshot())));
  await new Promise(resolve => setTimeout(resolve, 0)); expect(host.querySelector("ol")).toBeNull(); expect(host.textContent).not.toContain("local:synthetic"); expect(button("Carica registro").disabled).toBe(true);
});
it("non interpreta come HTML i dati letti e non conserva risultati dopo logout", async () => {
  const value = snapshot(); value.events[0].resource = { kind: "tag", id: '<img src=x onerror="alert(1)">' };
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value))); mount(request); button("Carica registro").click(); await loaded();
  expect(host.querySelector("img")).toBeNull(); expect(host.textContent).toContain('<img src=x');
  auth.user = null; window.dispatchEvent(new Event("framecraft:user-changed")); expect(host.querySelector("ol")).toBeNull(); expect(host.textContent).not.toContain('<img src=x');
});
it("rifiuta risposte non valide senza mostrare un registro verde o riprovare automaticamente", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"verified":true,"events":[]}')); mount(request); button("Carica registro").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Risposta del registro non valida")); expect(host.querySelector("ol")).toBeNull(); expect(request).toHaveBeenCalledOnce();
});
it("non presenta come riuscita una richiesta duplicata il cui esito è incerto", async () => {
  const value = snapshot(); value.events[0].outcome = "duplicate"; value.events[0].code = "WRITE_DUPLICATE_UNCERTAIN"; value.uncertainCount = 1;
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value))); mount(request); button("Carica registro").click(); await loaded();
  expect(host.textContent).toContain("già gestita con esito incerto"); expect(host.textContent).toContain("non sono due comandi");
});
it("annulla alla scadenza, non ripete la richiesta e ripristina il segnaposto alla chiusura", async () => {
  vi.useFakeTimers(); const request = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => options!.signal!.addEventListener("abort", () => reject(new Error("timeout")))));
  mount(request, true, 250); button("Carica registro").click(); await vi.advanceTimersByTimeAsync(251);
  expect(host.textContent).toContain("lettura scaduta"); await vi.advanceTimersByTimeAsync(3000); expect(request).toHaveBeenCalledOnce();
  control!.dispose(); expect(host.textContent).toBe("Segnaposto originale"); expect(host.hasAttribute("data-hmi-audit-root")).toBe(false); expect(host.getAttribute("role")).toBeNull();
});
