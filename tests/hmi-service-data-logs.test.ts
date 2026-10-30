// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmiDataLogClient } from "../src/core/hmiDataLogClient";
import { dataLogDefinitionKey, type DataLogSample, type ServiceDataLogs } from "../runtime/data-log.mjs";
const user = vi.hoisted(() => ({ id: "operator", capabilities: ["dataLogs.read", "dataLogs.sample"] }));
vi.mock("../src/core/hmiOperatorSession", () => ({ operatorSessionProfile: () => user.id ? user : undefined, operatorSessionHeaders: () => ({ "X-Framecraft-CSRF": "synthetic" }), openOperatorSession: vi.fn() }));
const namespace = "7618fc24-79c4-4657-9139-56ad520cb1fa", archive = "6618fc24-79c4-4657-9139-56ad520cb1fa";
const catalog: ServiceDataLogs = { version: 1, projectKey: "synthetic", logs: [{ id: "process", name: "Processo", storage: "runtime", enabled: true, maxEntries: 1000, retentionMs: 60000, segmentDurationMs: 60000, tags: [{ id: "temperature", name: "Temperatura", tag: "Temperature", mode: "on-change", cycleMs: 1000, includeUnchanged: false, smoothingSamples: 1, aggregation: "none", aggregationWindowMs: 1000 }] }] };
const row = (seq: number, at = seq * 100): DataLogSample => ({ seq, logId: "process", loggedTagId: "temperature", tag: "Temperature", time: at, value: String(seq), qualityCode: 192, sourceTimestamp: at - 10, partial: false });
const response = (samples = [row(1), row(2), row(3)], patch = {}) => new Response(JSON.stringify({ version: 1, id: archive, namespace, through: 5000, floor: 0, definition: dataLogDefinitionKey(catalog.logs[0], catalog.logs[0].tags[0]), samples, previous: null, nextAfter: null, ...patch }), { headers: { "Content-Type": "application/json" } });
const cleanup: (() => void)[] = [];
function fixture(request = vi.fn<typeof fetch>(async () => response())) { const onChange = vi.fn(), client = createHmiDataLogClient({ catalog, namespace, request, onChange }); cleanup.push(() => client.dispose()); const query = (previous = false) => client.query("process", "temperature", 150, 250, previous); return { client, request, onChange, query }; }
beforeEach(() => { user.id = "operator"; user.capabilities = ["dataLogs.read", "dataLogs.sample"]; });
afterEach(() => { for (const f of cleanup.splice(0)) f(); document.body.replaceChildren(); vi.restoreAllMocks(); });
describe("storico del servizio nei trend", () => {
  it("legge solo la sorgente richiesta e riusa la lettura fra ridisegni, filtrando intervallo e predecessore", async () => {
    const f = fixture(); expect(f.request).not.toHaveBeenCalled(); expect(f.query(true)).toEqual([]); f.query(true); await vi.waitFor(() => expect(f.query(true).map(r => r.seq)).toEqual([1, 2])); expect(f.request).toHaveBeenCalledTimes(1); const url = String(f.request.mock.calls[0][0]); expect(url).toContain("/data-log-history?"); expect(url).toContain("includePrevious=true");
  });
  it("accumula tutte le pagine dello stesso snapshot senza mostrare campioni parziali", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response([row(1)], { nextAfter: 1 })).mockResolvedValueOnce(response([row(2), row(3)])), f = fixture(request); f.query(); await vi.waitFor(() => expect(f.query().map(r => r.seq)).toEqual([2])); expect(request).toHaveBeenCalledTimes(2); expect(String(request.mock.calls[1][0])).toContain("archiveId=" + archive); expect(String(request.mock.calls[1][0])).toContain("through=5000");
  });
  it("un problema nella pagina successiva lascia il grafico vuoto e offre una rilettura esplicita", async () => {
    const root = document.createElement("div"); root.dataset.hmiTrendRoot = ""; root.dataset.hmiActiveDataLogs = JSON.stringify([["process", "temperature"]]); root.textContent = "Data Log"; document.body.append(root);
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response([row(1)], { nextAfter: 1 })).mockResolvedValueOnce(new Response("PRIVATE_SERVER_ERROR", { status: 503 })), f = fixture(request); f.query(); await vi.waitFor(() => expect(f.onChange).toHaveBeenCalled()); f.client.renderStatus(); expect(f.query()).toEqual([]); expect(root.textContent).toContain("Risposta dello storico"); expect(root.textContent).not.toContain("PRIVATE_SERVER_ERROR"); expect(root.querySelector("button")?.textContent).toBe("Riprova lettura storico");
  });
  it("scarta una risposta tardiva quando cambia l’operatore e non conserva i suoi campioni", async () => {
    let release!: (value: Response) => void; const request = vi.fn<typeof fetch>(() => new Promise(resolve => { release = resolve; })), f = fixture(request); f.query(); await vi.waitFor(() => expect(request).toHaveBeenCalledOnce()); user.id = "other"; user.capabilities = []; window.dispatchEvent(new Event("framecraft:user-changed")); release(response()); await new Promise(resolve => setTimeout(resolve, 0)); expect(f.query()).toEqual([]); expect(request).toHaveBeenCalledOnce();
  });
  it("una sessione scaduta pulisce anche la vista congelata e non crea un ciclo di tentativi", async () => {
    const onReset = vi.fn(), request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ type: "operator", code: "AUTH_REQUIRED", error: "PRIVATE_DETAIL" }), { status: 401 })), client = createHmiDataLogClient({ catalog, namespace, request, onReset }); cleanup.push(client.dispose); client.query("process", "temperature", 0, 1000); await vi.waitFor(() => expect(onReset).toHaveBeenCalledOnce()); for (let i = 0; i < 5; i++) expect(client.query("process", "temperature", 0, 1000)).toEqual([]); expect(request).toHaveBeenCalledOnce();
  });
  it("non usa uno storico appartenente a un altro progetto", async () => {
    const f = fixture(vi.fn<typeof fetch>(async () => response([row(1)], { namespace: archive }))); f.query(); await vi.waitFor(() => expect(f.onChange).toHaveBeenCalled()); expect(f.query()).toEqual([]);
  });
  it("permessi mancanti o servizio disabilitato non aprono richieste", async () => {
    user.capabilities = []; const f = fixture(); expect(f.query()).toEqual([]); expect(f.request).not.toHaveBeenCalled(); const request = vi.fn<typeof fetch>(), client = createHmiDataLogClient({ enabled: false, catalog, namespace, request }); cleanup.push(client.dispose); user.capabilities = ["dataLogs.read"]; expect(client.query("process", "temperature", 0, 100)).toEqual([]); expect(request).not.toHaveBeenCalled();
  });
  it("i grafici online restano puliti anche quando un altro grafico legge un Data Log", async () => {
    const online = document.createElement("div"), historical = document.createElement("div"); online.dataset.hmiTrendRoot = ""; online.dataset.hmiActiveDataLogs = "[]"; historical.dataset.hmiTrendRoot = ""; historical.dataset.hmiActiveDataLogs = JSON.stringify([["process", "temperature"]]); document.body.append(online, historical); const f = fixture(); f.query(); f.client.renderStatus(); expect(online.querySelector<HTMLElement>("[data-hmi-data-log-status]")?.hidden).toBe(true); expect(historical.querySelector<HTMLElement>("[data-hmi-data-log-status]")?.hidden).toBe(false);
  });
  it("le definizioni lunghe viaggiano in JSON senza superare i limiti degli URL", async () => {
    const c = structuredClone(catalog); c.logs[0].tags[0].triggerValue = "界".repeat(1000); const key = dataLogDefinitionKey(c.logs[0], c.logs[0].tags[0]), request = vi.fn<typeof fetch>(async () => response([row(1)], { definition: key })), client = createHmiDataLogClient({ catalog: c, namespace, request }); cleanup.push(client.dispose); client.query("process", "temperature", 0, 1000); await vi.waitFor(() => expect(client.query("process", "temperature", 0, 1000)).toHaveLength(1)); expect(String(request.mock.calls[0][0])).toContain("/data-log-query"); expect(request.mock.calls[0][1]?.method).toBe("POST"); expect(JSON.parse(String(request.mock.calls[0][1]?.body)).definition).toBe(key);
  });
  it("non ripete un campionamento dal risultato incerto e conserva l’ID nel messaggio", async () => {
    const request = vi.fn<typeof fetch>(async () => { throw new Error("PRIVATE_TRANSPORT_DETAIL"); }), f = fixture(request); f.client.observe({ state: "recording", written: 0, instanceId: archive }); await expect(f.client.sample("process")).rejects.toThrow(/ID richiesta: [a-f0-9-]{36}/); expect(request).toHaveBeenCalledOnce(); expect(request.mock.calls[0][1]?.method).toBe("POST");
  });
  it("rilegge dopo il cambio di istanza senza riusare campioni del servizio precedente", async () => {
    const f = fixture(); f.client.observe({ state: "recording", written: 1, instanceId: archive }); f.query(); await vi.waitFor(() => expect(f.query()).toHaveLength(1)); f.client.observe({ state: "recording", written: 0, instanceId: namespace }); expect(f.query()).toEqual([]); await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
  });
});
