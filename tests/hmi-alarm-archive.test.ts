// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createHmiAlarmArchive } from "../src/core/hmiAlarmArchive";
const user = vi.hoisted(() => ({ id: "synthetic", permitted: true }));
const open = vi.hoisted(() => vi.fn());
vi.mock("../src/core/hmiOperatorSession", () => ({ operatorSessionProfile: () => ({ id: user.id, capabilities: user.permitted ? ["alarms.history.read"] : [] }), openOperatorSession: open }));
const id = "7618fc24-79c4-4657-9139-56ad520cb1fa", instance = "6618fc24-79c4-4657-9139-56ad520cb1fa";
const data = () => ({ version: 1, id, namespace: id, sequence: 3, count: 3, incompleteRuns: 0, nextBefore: 2, capture: { state: "recording", unconfirmedInThisRun: 0 }, events: [3, 2].map(seq => ({ seq, instanceId: instance, recordedAt: "2026-10-21T10:00:00.000Z", event: { sequence: seq, id: "a", occurrence: "occurrence", name: "Motor", text: "<img src=x onerror=alert(1)>", alarmClass: "Guasto", area: "Linea", priority: 1, state: "Incoming", time: Date.parse("2026-10-21T10:00:00.000Z") } })) });
const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); document.body.replaceChildren(); user.id = "synthetic"; user.permitted = true; vi.restoreAllMocks(); vi.useRealTimers(); open.mockClear(); });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
function fixture(request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(data()))), enabled = true, timeoutMs = 10000) { const host = document.createElement("div"); host.textContent = "Segnaposto"; document.body.append(host); const control = createHmiAlarmArchive(host, { enabled, request, timeoutMs }); cleanup.push(() => control.dispose()); return { host, request, control }; }
const load = async (test: ReturnType<typeof fixture>) => { button(test.host, "Carica storico").click(); await vi.waitFor(() => expect(test.host.querySelector('[aria-label="Eventi storici degli allarmi"]')).not.toBeNull()); };
it("makes no automatic calls, renders only safe text and never offers alarm commands", async () => {
  const test = fixture(); expect(test.request).not.toHaveBeenCalled(); await load(test); expect(test.host.querySelector("img")).toBeNull(); expect(test.host.textContent).toContain("<img src=x"); expect(test.host.textContent).toContain("Non è lo stato attuale");
  expect(test.host.querySelectorAll("li")).toHaveLength(2); expect(button(test.host, "Prendi in visione")).toBeUndefined(); expect(test.host.textContent).toContain("Stato del servizio all’ultima lettura");
  const [url, options] = test.request.mock.calls[0]; expect(String(url)).toContain("alarm-history?limit=50"); expect(options).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error" }); expect(options?.body).toBeUndefined(); expect(options?.headers).toBeUndefined();
});
it("requires the dedicated read permission and configured runtime, with an accessible login", () => {
  user.permitted = false; const test = fixture(); expect(button(test.host, "Carica storico").disabled).toBe(true); button(test.host, "Apri accesso operatore").click(); expect(open).toHaveBeenCalledOnce(); expect(test.request).not.toHaveBeenCalled();
  const disabled = fixture(undefined, false); expect(disabled.host.textContent).toContain("Gateway disabilitato"); expect(button(disabled.host, "Carica storico").disabled).toBe(true);
});
it("pins older pages and refuses to mix changed filters with the old cursor", async () => {
  const test = fixture(); await load(test); test.request.mockResolvedValueOnce(new Response(JSON.stringify({ ...data(), nextBefore: null, events: [{ ...data().events[0], seq: 1, event: { ...data().events[0].event, sequence: 1 } }] })));
  button(test.host, "Eventi precedenti").click(); await vi.waitFor(() => expect(test.request).toHaveBeenCalledTimes(2)); await vi.waitFor(() => expect(test.host.querySelectorAll("li")).toHaveLength(1));
  const url = new URL(String(test.request.mock.calls[1][0]), "http://localhost"); expect(Object.fromEntries(url.searchParams)).toMatchObject({ archiveId: id, through: "3", before: "2" });
  const input = test.host.querySelector<HTMLInputElement>('[aria-label="Allarme (ID esatto)"]')!; input.value = "other"; input.dispatchEvent(new Event("input")); expect(button(test.host, "Eventi precedenti").disabled).toBe(true); expect(test.request).toHaveBeenCalledTimes(2);
});
it("does not show malformed responses or HTML error text from the server", async () => {
  const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ...data(), count: 99 }))), test = fixture(request); button(test.host, "Carica storico").click(); await vi.waitFor(() => expect(test.host.textContent).toContain("Risposta dello storico non valida")); expect(test.host.querySelectorAll("li")).toHaveLength(0);
  request.mockResolvedValueOnce(new Response(JSON.stringify({ type: "alarm-history", code: "INVENTED", error: "PRIVATE_STACK" }), { status: 500 })); button(test.host, "Carica storico").click(); await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2)); expect(test.host.textContent).not.toContain("PRIVATE_STACK");
});
it("clears rows on logout and ignores a late read from the previous user", async () => {
  let resolve!: (response: Response) => void; const request = vi.fn<typeof fetch>(() => new Promise(done => { resolve = done; })), test = fixture(request); button(test.host, "Carica storico").click(); user.id = "new"; user.permitted = false; window.dispatchEvent(new CustomEvent("framecraft:user-changed")); resolve(new Response(JSON.stringify(data()))); await Promise.resolve(); await Promise.resolve(); expect(test.host.querySelectorAll("li")).toHaveLength(0); expect(test.host.textContent).toContain("Utente cambiato"); expect(button(test.host, "Carica storico").disabled).toBe(true);
});
it("labels incomplete capture while allowing the already stored rows to be consulted", async () => {
  const test = fixture(vi.fn(async () => new Response(JSON.stringify({ ...data(), incompleteRuns: 2, capture: { state: "error", code: "ALARM_HISTORY_LIMIT", unconfirmedInThisRun: 4 } })))); await load(test); expect(test.host.textContent).toContain("senza conferma di registrazione in questo avvio: 4"); expect(test.host.textContent).toContain("Avvii precedenti incompleti: 2"); expect(test.host.textContent).toContain("Archivio allarmi pieno"); expect(test.host.querySelectorAll("li")).toHaveLength(2);
});
it("honors inherited interaction gates even for an already rendered button and restores on disposal", () => {
  const test = fixture(), read = button(test.host, "Carica storico"); test.host.setAttribute("aria-disabled", "true"); read.click(); expect(test.request).not.toHaveBeenCalled(); test.control.dispose(); expect(test.host.textContent).toBe("Segnaposto"); expect(test.host.hasAttribute("data-hmi-alarm-archive-root")).toBe(false);
});
it("times out without retrying or keeping the view busy forever", async () => {
  vi.useFakeTimers(); const request = vi.fn<typeof fetch>((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("timeout"))))), test = fixture(request, true, 250);
  button(test.host, "Carica storico").click(); await vi.advanceTimersByTimeAsync(251); expect(test.host.textContent).toContain("lettura scaduta"); expect(test.host.getAttribute("aria-busy")).toBe("false"); expect(request).toHaveBeenCalledOnce();
});
