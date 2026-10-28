// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createHmiAlarmArchive } from "../src/core/hmiAlarmArchive";
import { createAlarmStatisticsAccumulator } from "../runtime/alarm-history.mjs";
const user = vi.hoisted(() => ({ id: "synthetic", permitted: true }));
const open = vi.hoisted(() => vi.fn());
vi.mock("../src/core/hmiOperatorSession", () => ({ operatorSessionProfile: () => ({ id: user.id, capabilities: user.permitted ? ["alarms.history.read"] : [] }), openOperatorSession: open }));
const id = "7618fc24-79c4-4657-9139-56ad520cb1fa", instance = "6618fc24-79c4-4657-9139-56ad520cb1fa";
const data = () => ({ version: 1, id, namespace: id, sequence: 3, count: 3, incompleteRuns: 0, nextBefore: 2, capture: { state: "recording", unconfirmedInThisRun: 0 }, events: [3, 2].map(seq => ({ seq, instanceId: instance, recordedAt: "2026-10-21T10:00:00.000Z", event: { sequence: seq, id: "a", occurrence: "occurrence", name: "Motor", text: "<img src=x onerror=alert(1)>", alarmClass: "Guasto", area: "Linea", priority: 1, state: "Incoming", time: Date.parse("2026-10-21T10:00:00.000Z") } })) });
const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); document.body.replaceChildren(); user.id = "synthetic"; user.permitted = true; vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); open.mockClear(); });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
function fixture(request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(data()))), enabled = true, timeoutMs = 10000) { const host = document.createElement("div"); host.textContent = "Segnaposto"; document.body.append(host); const control = createHmiAlarmArchive(host, { enabled, request, timeoutMs }); cleanup.push(() => control.dispose()); return { host, request, control }; }
const load = async (test: ReturnType<typeof fixture>) => { button(test.host, "Carica storico").click(); await vi.waitFor(() => expect(test.host.querySelector('[aria-label="Eventi storici degli allarmi"]')).not.toBeNull()); };
function statisticsData() {
  const accumulator = createAlarmStatisticsAccumulator();
  for (const [i, state] of (["Incoming", "Acknowledged", "Outgoing"] as const).entries()) accumulator.push({ ...data().events[0], seq: i + 1, event: { ...data().events[0].event, sequence: i + 1, state, time: Date.parse("2026-10-21T10:00:00.000Z") + i * 1000, ...(state === "Acknowledged" ? { actor: "synthetic" } : {}) } });
  return { version: 1, id, namespace: id, sequence: 3, through: 3, incompleteRuns: 0, order: "frequency", limit: 50, capture: data().capture, ...accumulator.finish() };
}
const calculated = async (test: ReturnType<typeof fixture>) => { button(test.host, "Calcola statistiche dei risultati").click(); await vi.waitFor(() => expect(test.host.querySelector('[data-archive-statistics-result]')).not.toBeNull()); };
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
it("calculates all filtered history only on demand, pins the snapshot and keeps same-user refreshes", async () => {
  const request = vi.fn<typeof fetch>(async url => new Response(JSON.stringify(String(url).includes("/alarm-statistics?") ? statisticsData() : data()))), test = fixture(request);
  expect(button(test.host, "Calcola statistiche dei risultati").disabled).toBe(true); await load(test); expect(request).toHaveBeenCalledOnce(); await calculated(test);
  const [url, options] = request.mock.calls[1], query = Object.fromEntries(new URL(String(url), "http://localhost").searchParams);
  expect(query).toEqual({ archiveId: id, through: "3", order: "frequency", limit: "50" }); expect(options).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error" });
  const result = test.host.querySelector('[data-archive-statistics-result]')!; expect(result.textContent).toContain("3 eventi · 1 attivazioni"); expect(result.textContent).toContain("Media: 2 s"); expect(result.textContent).toContain("Media: 1 s"); expect(result.textContent).toContain("Media non disponibile"); expect(result.querySelector("img")).toBeNull();
  window.dispatchEvent(new CustomEvent("framecraft:user-changed")); expect(test.host.querySelector('[data-archive-statistics-result]')).not.toBeNull(); expect(request).toHaveBeenCalledTimes(2);
});
it("invalidates statistics and their CSV on filter, order, user and disposal changes", async () => {
  const files = downloadSupport(), test = fixture(vi.fn(async url => new Response(JSON.stringify(String(url).includes("/alarm-statistics?") ? statisticsData() : data())))); await load(test); await calculated(test);
  button(test.host, "Prepara CSV delle statistiche mostrate").click(); expect(test.request).toHaveBeenCalledTimes(2); const link = test.host.querySelector<HTMLAnchorElement>('a[download^="statistiche-allarmi-"]')!; expect(link).not.toBeNull();
  user.id = "another"; const click = new MouseEvent("click", { cancelable: true }); link.dispatchEvent(click); expect(click.defaultPrevented).toBe(true); window.dispatchEvent(new CustomEvent("framecraft:user-changed")); expect(test.host.querySelector('[data-archive-statistics-result]')).toBeNull(); expect(files.revoke).toHaveBeenCalledTimes(1);
  await load(test); await calculated(test); button(test.host, "Prepara CSV delle statistiche mostrate").click();
  const order = test.host.querySelector<HTMLSelectElement>('[aria-label="Ordina statistiche"]')!; order.value = "active-total"; order.dispatchEvent(new Event("change")); expect(test.host.querySelector('[data-archive-statistics-result]')).toBeNull(); expect(files.revoke).toHaveBeenCalledTimes(2);
  order.value = "frequency"; const current = test.host.querySelector<HTMLSelectElement>('[aria-label="Ordina statistiche"]')!; current.value = "frequency"; current.dispatchEvent(new Event("change")); await calculated(test);
  const field = test.host.querySelector<HTMLInputElement>('[aria-label="Zona (nome esatto)"]')!; field.value = "Other"; field.dispatchEvent(new Event("input")); expect(test.host.querySelector('[data-archive-statistics-result]')).toBeNull(); expect(button(test.host, "Calcola statistiche dei risultati").disabled).toBe(true);
  test.control.dispose(); expect(test.host.textContent).toBe("Segnaposto");
});
it("does not show forged or denied statistics and leaves no server text in the interface", async () => {
  const test = fixture(); await load(test); test.request.mockResolvedValueOnce(new Response(JSON.stringify({ ...statisticsData(), activations: 99 }))); button(test.host, "Calcola statistiche dei risultati").click(); await vi.waitFor(() => expect(test.host.textContent).toContain("Risposta dello storico non valida")); expect(test.host.querySelector('[data-archive-statistics-result]')).toBeNull();
  test.request.mockResolvedValueOnce(new Response(JSON.stringify({ type: "operator", code: "AUTH_PERMISSION", error: "PRIVATE_STACK" }), { status: 403 })); button(test.host, "Calcola statistiche dei risultati").click(); await vi.waitFor(() => expect(test.request).toHaveBeenCalledTimes(3)); await vi.waitFor(() => expect(test.host.getAttribute("aria-busy")).toBe("false")); expect(test.host.textContent).not.toContain("PRIVATE_STACK"); expect(test.host.querySelector('[data-archive-statistics-result]')).toBeNull();
});
it("cancels a calculation without retry and discards a late answer after logout", async () => {
  const test = fixture(); await load(test); test.request.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("cancelled")))));
  button(test.host, "Calcola statistiche dei risultati").click(); button(test.host, "Annulla calcolo statistiche").click(); await vi.waitFor(() => expect(test.host.textContent).toContain("Calcolo statistiche annullato")); expect(test.host.getAttribute("aria-busy")).toBe("false"); expect(test.request).toHaveBeenCalledTimes(2);
  let resolve!: (response: Response) => void; test.request.mockImplementationOnce(() => new Promise(done => { resolve = done; })); button(test.host, "Calcola statistiche dei risultati").click(); user.permitted = false; window.dispatchEvent(new CustomEvent("framecraft:user-changed")); resolve(new Response(JSON.stringify(statisticsData()))); await Promise.resolve(); await Promise.resolve(); expect(test.host.querySelector('[data-archive-statistics-result]')).toBeNull(); expect(test.host.getAttribute("aria-busy")).toBe("false"); expect(button(test.host, "Calcola statistiche dei risultati").disabled).toBe(true);
});
function downloadSupport() { const blobs: Blob[] = [], create = vi.fn((blob: Blob) => { blobs.push(blob); return "blob:archive-" + blobs.length; }), revoke = vi.fn(); Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke }); return { blobs, create, revoke }; }
const prepared = async (test: ReturnType<typeof fixture>) => { button(test.host, "Prepara CSV dei risultati filtrati").click(); await vi.waitFor(() => expect(test.host.querySelector('a[download$=".csv"]')).not.toBeNull(), { timeout: 10000 }); };
it("prepares all pages only on demand, exposes explicit downloads and releases URLs", async () => {
  const files = downloadSupport(), test = fixture(); expect(button(test.host, "Prepara CSV dei risultati filtrati").disabled).toBe(true); await load(test);
  test.request.mockResolvedValueOnce(new Response(JSON.stringify(data()))).mockResolvedValueOnce(new Response(JSON.stringify({ ...data(), nextBefore: null, events: [{ ...data().events[0], seq: 1, event: { ...data().events[0].event, sequence: 1 } }] })));
  await prepared(test); expect(test.request).toHaveBeenCalledTimes(3); expect(test.host.textContent).toContain("CSV pronto: 3 eventi"); expect(files.blobs.map(blob => blob.type)).toEqual(["text/csv;charset=utf-8", "application/json;charset=utf-8"]); expect(files.create).toHaveBeenCalledTimes(2);
  expect(test.host.querySelector('a[download$=".csv"]')?.getAttribute("href")).toBe("blob:archive-1"); for (const [, options] of test.request.mock.calls) expect(options?.method).toBe("GET");
  button(test.host, "Scarta file preparati").click(); expect(files.revoke.mock.calls).toEqual([["blob:archive-1"], ["blob:archive-2"]]); expect(test.host.querySelector("a[download]")).toBeNull();
});
it("invalidates exports and blocks stale links when filters or user identity change", async () => {
  const files = downloadSupport(), test = fixture(); await load(test); test.request.mockImplementation(async () => new Response(JSON.stringify({ ...data(), nextBefore: null }))); await prepared(test);
  const link = test.host.querySelector<HTMLAnchorElement>("a[download]")!, event = new MouseEvent("click", { cancelable: true }); user.id = "different"; link.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); window.dispatchEvent(new CustomEvent("framecraft:user-changed")); expect(test.host.querySelector("a[download]")).toBeNull(); expect(files.revoke).toHaveBeenCalledTimes(2);
  await load(test); await prepared(test); const field = test.host.querySelector<HTMLInputElement>('[aria-label="Zona (nome esatto)"]')!; field.value = "Other"; field.dispatchEvent(new Event("input")); expect(test.host.querySelector("a[download]")).toBeNull(); expect(button(test.host, "Prepara CSV dei risultati filtrati").disabled).toBe(true); expect(files.revoke).toHaveBeenCalledTimes(4);
});
it("allows cancellation while busy and never exposes a partial export after denial", async () => {
  downloadSupport(); const test = fixture(); await load(test); button(test.host, "Prepara CSV dei risultati filtrati").click(); expect(button(test.host, "Annulla preparazione CSV").disabled).toBe(false); button(test.host, "Annulla preparazione CSV").click(); await vi.waitFor(() => expect(test.host.textContent).toContain("Preparazione CSV annullata")); expect(test.request).toHaveBeenCalledTimes(1); expect(test.host.querySelector("a[download]")).toBeNull();
  test.request.mockResolvedValue(new Response(JSON.stringify({ type: "operator", code: "AUTH_PERMISSION", error: "PRIVATE_ERROR" }), { status: 403 })); button(test.host, "Prepara CSV dei risultati filtrati").click(); await vi.waitFor(() => expect(test.host.textContent).toContain("permess")); expect(test.host.textContent).not.toContain("PRIVATE_ERROR"); expect(test.host.querySelector("a[download]")).toBeNull(); expect(test.host.getAttribute("aria-busy")).toBe("false");
});
it("releases prepared files on disposal and preserves the placeholder", async () => {
  const files = downloadSupport(), test = fixture(); await load(test); test.request.mockImplementation(async () => new Response(JSON.stringify({ ...data(), nextBefore: null }))); await prepared(test); test.control.dispose(); expect(files.revoke).toHaveBeenCalledTimes(2); expect(test.host.textContent).toBe("Segnaposto");
});
it("ignores a completed export page from the previous operator", async () => {
  const files = downloadSupport(), test = fixture(); await load(test); let release!: (response: Response) => void;
  test.request.mockImplementation(() => new Promise(resolve => { release = resolve; })); button(test.host, "Prepara CSV dei risultati filtrati").click(); await vi.waitFor(() => expect(test.request).toHaveBeenCalledTimes(2));
  user.id = "another"; window.dispatchEvent(new CustomEvent("framecraft:user-changed")); release(new Response(JSON.stringify({ ...data(), nextBefore: null }))); await vi.waitFor(() => expect(test.host.getAttribute("aria-busy")).toBe("false")); await new Promise(resolve => setTimeout(resolve, 0));
  expect(files.create).not.toHaveBeenCalled(); expect(test.host.querySelectorAll("li")).toHaveLength(0); expect(test.host.querySelector("a[download]")).toBeNull();
});
it("times out a CSV page without retrying or exposing temporary files", async () => {
  const files = downloadSupport(), test = fixture(undefined, true, 250); await load(test); vi.useFakeTimers();
  test.request.mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Error("timeout")))));
  button(test.host, "Prepara CSV dei risultati filtrati").click(); await vi.advanceTimersByTimeAsync(501); expect(test.host.textContent).toContain("Preparazione CSV scaduta"); expect(test.host.getAttribute("aria-busy")).toBe("false"); expect(test.request).toHaveBeenCalledTimes(2); expect(files.create).not.toHaveBeenCalled();
});
