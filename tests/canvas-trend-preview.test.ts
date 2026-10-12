// @vitest-environment jsdom
import { createRequire } from "node:module";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "../src/canvas/Canvas";
import { defaultHmiTrendConfig, serializeHmiTrendConfig } from "../src/core/hmiTrend";
import { defaultHmiFunctionTrendConfig, serializeHmiFunctionTrendConfig } from "../src/core/hmiFunctionTrend";
import { useEditorStore } from "../src/state/editorStore";
import { defaultHmiDataLog, defaultHmiLoggingTag, emptyHmiDataLogCatalog } from "../src/core/hmiDataLogs";
// @ts-expect-error Real project plugin is plain ESM.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, options: { url: string; runScripts: string }) => { window: Window & typeof globalThis & { close(): void } } };
const initial = useEditorStore.getState(), panelOrigin = "http://127.0.0.1:4173", parentOrigin = "http://localhost:1420";
let root: Root, host: HTMLDivElement, browser: InstanceType<typeof JSDOM>, frame: Window & typeof globalThis;
let sent: Record<string, any>[], received: Record<string, any>[], network: ReturnType<typeof vi.fn>;
async function flush(ms = 50) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function usePanel() { await act(async () => useEditorStore.getState().setInteractionMode("navigate")); await flush(); }
const owner = (id = "time") => frame.document.getElementById(id)!;
const deliver = (data: Record<string, unknown>, origin = panelOrigin) => window.dispatchEvent(new MessageEvent("message", { data, source: frame, origin }));
async function configureArchive() {
  const log = defaultHmiDataLog(); log.id = "archive"; log.storage = "memory";
  log.tags = ["X", "Y"].map((tag, index) => ({ ...defaultHmiLoggingTag(index), id: tag.toLowerCase(), tag, mode: "on-change" }));
  await act(async () => useEditorStore.setState({ dataLogCatalog: { ...emptyHmiDataLogCatalog(), projectKey: "test", logs: [log] } }));
  const time = defaultHmiTrendConfig(); time.online = false; time.trends[0] = { ...time.trends[0], source: "log", logId: "archive", loggedTagId: "y" }; owner().setAttribute("data-hmi-trend", serializeHmiTrendConfig(time));
}
beforeEach(async () => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); network = vi.fn(); vi.stubGlobal("fetch", network); localStorage.clear();
  useEditorStore.setState({ ...initial, project: { root: "C:/trend-test", files: [] } as never, document: undefined, selectedId: undefined, multiSelection: [], selectionRect: undefined,
    highlightPicker: undefined, zonePicking: undefined, interactionMode: "edit", pages: [], loading: false, reloadRecovery: undefined, previewUrl: panelOrigin, previewPath: "/", previewStatus: "ready", previewProcessExited: false,
    consoleEntries: [], simulation: { on: true, values: { X: "10", Y: "42" }, status: { Y: { qualityCode: 192 } }, elements: [], unresolved: [] } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(StrictMode, null, createElement(Canvas))));
  browser = new JSDOM('<!doctype html><html><body><div id="time" data-hmi-type="HmiTrendControl" data-hmi-trend>Bozza tempo</div><div id="xy" data-hmi-type="HmiFunctionTrendControl" data-hmi-function-trend>Bozza XY</div></body></html>', { url: panelOrigin, runScripts: "outside-only" }); frame = browser.window; sent = []; received = [];
  const time = defaultHmiTrendConfig(); time.trends[0].tag = "Y"; owner().setAttribute("data-hmi-trend", serializeHmiTrendConfig(time));
  const xy = defaultHmiFunctionTrendConfig(); xy.trends[0].x.tag = "X"; xy.trends[0].y.tag = "Y"; owner("xy").setAttribute("data-hmi-function-trend", serializeHmiFunctionTrendConfig(xy));
  const iframe = host.querySelector("iframe")!;
  Object.defineProperty(iframe, "contentWindow", { configurable: true, value: frame });
  Object.defineProperty(iframe, "contentDocument", { configurable: true, get() { throw new DOMException("Cross origin", "SecurityError"); } });
  Object.defineProperty(frame, "parent", { configurable: true, value: window });
  Object.assign(frame, { fetch: network, ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16), cancelAnimationFrame: (id: number) => window.clearTimeout(id) });
  vi.spyOn(window, "postMessage").mockImplementation((data: Record<string, any>) => { received.push(data); queueMicrotask(() => deliver(data)); });
  frame.postMessage = ((data: Record<string, any>, origin: string) => { sent.push({ ...data, targetOrigin: origin }); if (origin !== "*" && origin !== panelOrigin) return; queueMicrotask(() => frame.dispatchEvent(new frame.MessageEvent("message", { data, source: window, origin: parentOrigin }))); }) as typeof frame.postMessage;
  await act(async () => frame.eval(framecraftPlugin().transformIndexHtml("<main></main>").tags[0].children)); await flush();
});
afterEach(async () => { await act(async () => root.unmount()); browser?.window.close(); host.remove(); useEditorStore.setState(initial, true); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("curve nel canvas cross-origin con ponte reale", () => {
  it("mantiene fuso e aggregazione di sessione passando tra Modifica e Usa", async () => {
    owner().setAttribute("data-hmi-events", JSON.stringify([{ event: "Tapped", script: 'Tags("Unexpected").Write(1);' }]));
    const designed = owner().getAttribute("data-hmi-trend"); await usePanel();
    const zone = owner().querySelector<HTMLSelectElement>("[data-hmi-trend-time-zone]")!, aggregation = owner().querySelector<HTMLSelectElement>("[data-hmi-trend-aggregation]")!;
    await act(async () => { zone.click(); zone.value = "Europe/Rome"; zone.dispatchEvent(new frame.Event("change", { bubbles: true })); aggregation.click(); aggregation.value = "min-max"; aggregation.dispatchEvent(new frame.Event("change", { bubbles: true })); });
    await flush(); expect(received.some(message => message.type === "framecraft:hmi-event")).toBe(false);
    await act(async () => useEditorStore.getState().setInteractionMode("edit")); await flush();
    expect(owner().textContent).toBe("Bozza tempo"); await usePanel();
    expect(owner().querySelector<HTMLSelectElement>("[data-hmi-trend-time-zone]")!.value).toBe("Europe/Rome");
    expect(owner().querySelector<HTMLSelectElement>("[data-hmi-trend-aggregation]")!.value).toBe("min-max");
    expect(owner().getAttribute("data-hmi-trend")).toBe(designed); expect(network).not.toHaveBeenCalled();
  });
  it("la media temporale nel ponte usa il campione precedente alla finestra, anche dalla cache", async () => {
    vi.setSystemTime(new Date("2026-10-12T12:00:00Z")); await configureArchive();
    const config = defaultHmiTrendConfig(); config.online = false; config.timeRangeMs = 1000; config.trends[0] = { ...config.trends[0], source: "log", logId: "archive", loggedTagId: "y", mode: "values" };
    owner().setAttribute("data-hmi-trend", serializeHmiTrendConfig(config));
    vi.spyOn(frame.SVGElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 1, height: 260, top: 0, left: 0 } as DOMRect);
    await usePanel(); await flush(2100);
    for (const value of [100, 200, 300]) { await act(async () => useEditorStore.getState().setSimulationValue("Y", String(value))); await flush(100); }
    await flush(300);
    const snapshot = sent.filter(message => message.type === "framecraft:trend-preview").at(-1)!;
    const result = sent.filter(message => message.type === "framecraft:trend-history-result").at(-1)!.results.find((item: { key: string }) => item.key === '["archive","y"]');
    const samples = result.samples as { time: number; value: string }[], end = snapshot.now as number, start = end - 1000;
    expect(samples.some(sample => sample.time < start)).toBe(true);
    expect(samples.filter(sample => sample.time >= start && sample.time <= end).length).toBeGreaterThan(1);
    let weighted = 0;
    for (const [index, sample] of samples.entries()) weighted += Number(sample.value) * Math.max(0, Math.min(end, samples[index + 1]?.time ?? end) - Math.max(start, sample.time));
    const title = owner().querySelector('[data-hmi-trend-quality] title')!.textContent!;
    expect(title).toContain("punto aggregato"); expect(Number(title.split(";")[0].split(": ")[1])).toBeCloseTo(weighted / 1000);
    expect(network).not.toHaveBeenCalled();
  });
  it("disegna tempo e XY con valori manuali senza accedere al DOM dal parent", async () => {
    expect(owner().textContent).toBe("Bozza tempo"); await usePanel();
    expect(owner().querySelector('[data-hmi-trend-root]')).not.toBeNull();
    expect(owner("xy").querySelector('[data-hmi-function-trend-root]')).not.toBeNull();
    expect(owner("xy").querySelector('[data-hmi-fx-visibility]')?.nextElementSibling?.textContent).toContain("1 punti");
    expect(network).not.toHaveBeenCalled();
  });

  it("pausa e cambio Modifica/Usa conservano la vista e ripristinano la bozza esatta", async () => {
    const original = owner().firstChild; await usePanel();
    await act(async () => owner("xy").querySelector<HTMLButtonElement>('[data-hmi-fx-action="pause"]')!.click());
    await act(async () => useEditorStore.getState().setSimulationValue("Y", "99")); await flush(1100);
    expect(owner("xy").querySelector('[data-hmi-fx-visibility]')?.nextElementSibling?.textContent).toContain("1 punti");
    await act(async () => useEditorStore.getState().setInteractionMode("edit")); await flush();
    expect(owner().firstChild).toBe(original); expect(owner("xy").textContent).toBe("Bozza XY"); expect(owner().getAttribute("title")).toBeNull();
    await usePanel(); expect(owner("xy").querySelector('[data-hmi-fx-action="pause"]')?.textContent).toBe("Avvia");
  });

  it("legge lo storico locale per tempo e XY, anche dopo aggiornamenti dei valori", async () => {
    const log = defaultHmiDataLog(); log.id = "archive"; log.storage = "memory";
    log.tags = ["X", "Y"].map((tag, index) => ({ ...defaultHmiLoggingTag(index), id: tag.toLowerCase(), tag, mode: "on-change" }));
    await act(async () => useEditorStore.setState({ dataLogCatalog: { ...emptyHmiDataLogCatalog(), projectKey: "test", logs: [log] } }));
    const time = defaultHmiTrendConfig(); time.online = false; time.trends[0] = { ...time.trends[0], source: "log", logId: "archive", loggedTagId: "y" }; owner().setAttribute("data-hmi-trend", serializeHmiTrendConfig(time));
    const xy = defaultHmiFunctionTrendConfig(); xy.online = false; xy.trends[0].x = { source: "log", tag: "X", logId: "archive", loggedTagId: "x" }; xy.trends[0].y = { source: "log", tag: "Y", logId: "archive", loggedTagId: "y" }; owner("xy").setAttribute("data-hmi-function-trend", serializeHmiFunctionTrendConfig(xy));
    await usePanel(); await flush();
    expect(received.some(message => message.type === "framecraft:trend-history")).toBe(true);
    expect(owner().querySelector('[data-hmi-trend-series]')?.getAttribute("d")).toMatch(/^M/);
    expect(owner("xy").querySelector('[data-hmi-fx-visibility]')?.nextElementSibling?.textContent).toContain("1 punti");
    await flush(1100); await act(async () => useEditorStore.setState({ simulation: { ...useEditorStore.getState().simulation, values: { X: "20", Y: "84" } } })); await flush();
    expect(owner("xy").querySelector('[data-hmi-fx-visibility]')?.nextElementSibling?.textContent).toContain("2 punti");
    const before = received.filter(message => message.type === "framecraft:trend-history").length; await flush(350);
    expect(received.filter(message => message.type === "framecraft:trend-history").length - before).toBeLessThan(3);
    expect(network).not.toHaveBeenCalled();
  });

  it("i pulsanti interni non duplicano gli eventi del contenitore e rispettano il blocco del controllo", async () => {
    owner().setAttribute("data-hmi-events", JSON.stringify([{ event: "Tapped", script: 'Tags("Unexpected").Write(1);' }])); await usePanel();
    await act(async () => owner().querySelector<HTMLButtonElement>('[data-hmi-trend-action="pause"]')!.click()); await flush();
    expect(useEditorStore.getState().simulation.values.Unexpected).toBeUndefined();
    expect(received.some(message => message.type === "framecraft:hmi-event")).toBe(false);
    owner().setAttribute("aria-disabled", "true");
    await act(async () => owner().querySelector<HTMLButtonElement>('[data-hmi-trend-action="pause"]')!.click()); await flush();
    expect(owner().querySelector('[data-hmi-trend-action="pause"]')?.textContent).toBe("Avvia");
  });

  it("HMR conserva la nuova bozza e non crea un ciclo di ridisegni", async () => {
    await usePanel(); owner().replaceChildren(frame.document.createTextNode("Bozza aggiornata")); await flush();
    expect(owner().querySelector('[data-hmi-trend-root]')).not.toBeNull();
    const before = sent.length; await flush(500); expect(sent.length - before).toBeLessThan(10);
    await act(async () => useEditorStore.getState().setInteractionMode("edit")); await flush(); expect(owner().textContent).toBe("Bozza aggiornata");
  });

  it("non sovrascrive HTML/SVG personalizzati e rifiuta snapshot estranei", async () => {
    const svg = frame.document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.append(frame.document.createElementNS(svg.namespaceURI, "path")); owner().replaceChildren(svg);
    await usePanel(); expect(owner().firstChild).toBe(svg); expect(owner().querySelector('[data-hmi-trend-root]')).toBeNull();
    const packet = sent.filter(message => message.type === "framecraft:trend-preview").at(-1)!;
    await act(async () => frame.dispatchEvent(new frame.MessageEvent("message", { data: { ...packet, values: { X: "500", Y: "500" } }, source: window, origin: "https://untrusted.invalid" })));
    expect(owner("xy").querySelector('[data-hmi-fx-visibility]')?.nextElementSibling?.textContent).toContain("1 punti");
  });

  it("rotazione del token pagina e cambio catalogo respingono le vecchie query", async () => {
    await usePanel(); const packet = sent.filter(message => message.type === "framecraft:trend-preview").at(-1)!;
    const old = { type: "framecraft:trend-history", pageId: packet.pageId, lease: packet.lease, historyRevision: packet.historyRevision, requestId: "old", queries: [{ key: '["missing","missing"]', logId: "missing", loggedTagId: "missing", from: 0, to: Date.now() }] };
    await act(async () => Object.assign(frame, { __framecraftCurrentPage: "another" })); await flush(160);
    const before = sent.filter(message => message.type === "framecraft:trend-history-result").length;
    await act(async () => deliver(old)); await flush(); expect(sent.filter(message => message.type === "framecraft:trend-history-result")).toHaveLength(before);
    await act(async () => useEditorStore.setState({ dataLogCatalog: emptyHmiDataLogCatalog() })); await flush();
    expect(sent.filter(message => message.type === "framecraft:trend-preview").at(-1)!.lease).not.toBe(packet.lease);
  });

  it("prepara il CSV nel parent senza download nel sandbox o scritture al PLC", async () => {
    const createUrl = vi.fn(() => "blob:http://localhost:1420/preview-csv"), revoke = vi.fn(), links: string[] = [];
    const oldCreate = Object.getOwnPropertyDescriptor(window.URL, "createObjectURL"), oldRevoke = Object.getOwnPropertyDescriptor(window.URL, "revokeObjectURL");
    Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: createUrl }); Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { links.push(this.download); });
    try {
      await usePanel(); await act(async () => owner("xy").querySelector<HTMLButtonElement>('[data-hmi-fx-action="export"]')!.click()); await flush();
      const csv = received.find(message => message.type === "framecraft:trend-csv")!; expect(csv.content).toContain(";10;42;");
      expect(createUrl).toHaveBeenCalledOnce(); expect(links[0]).toMatch(/\.csv$/); expect(network).not.toHaveBeenCalled();
      expect(owner("xy").textContent).toContain("CSV preparato"); await flush(1100); expect(revoke).toHaveBeenCalledOnce();
    } finally { if (oldCreate) Object.defineProperty(window.URL, "createObjectURL", oldCreate); else Reflect.deleteProperty(window.URL, "createObjectURL"); if (oldRevoke) Object.defineProperty(window.URL, "revokeObjectURL", oldRevoke); else Reflect.deleteProperty(window.URL, "revokeObjectURL"); }
  });

  it("cambia sorgente nella sessione e la mostra correttamente dopo il ritorno da Modifica", async () => {
    const designed = owner().getAttribute("data-hmi-trend"); await usePanel();
    const tag = owner().querySelector<HTMLSelectElement>('[data-trend-source-field="tag"]')!;
    await act(async () => { tag.value = "X"; tag.dispatchEvent(new frame.Event("change", { bubbles: true })); });
    await act(async () => owner().querySelector<HTMLButtonElement>('[data-trend-source-action="apply"]')!.click()); await flush(300);
    await act(async () => owner().querySelector<HTMLButtonElement>('[data-hmi-trend-action="ruler"]')!.click());
    expect(owner().querySelector('svg')?.textContent).toContain("Curva 1: 10");
    expect(owner().getAttribute("data-hmi-trend")).toBe(designed);
    await act(async () => useEditorStore.getState().setInteractionMode("edit")); await flush(); await usePanel();
    expect(owner().querySelector<HTMLSelectElement>('[data-trend-source-field="tag"]')!.value).toBe("X");
  });

  it("se lo storico non risponde spiega come riprovare senza un ciclo di richieste automatiche", async () => {
    await configureArchive();
    vi.mocked(window.postMessage).mockImplementation((data: Record<string, any>) => { received.push(data); if (data.type !== "framecraft:trend-history") queueMicrotask(() => deliver(data)); });
    await usePanel(); await flush(3200);
    expect(owner().textContent).toContain("Lo storico locale non risponde");
    const requests = received.filter(message => message.type === "framecraft:trend-history").length; await flush(1200);
    expect(received.filter(message => message.type === "framecraft:trend-history")).toHaveLength(requests);
    await act(async () => owner().querySelector<HTMLButtonElement>('[data-hmi-trend-action="original"]')!.click()); await flush();
    expect(received.filter(message => message.type === "framecraft:trend-history").length).toBeGreaterThan(requests);
  });
});
