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


it('opens a frozen print inside the real cross-origin preview and closes on Edit',async()=>{
 Object.defineProperty(frame.HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});Object.defineProperty(frame.HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
 await usePanel();await flush(350);owner().querySelector<HTMLButtonElement>('[data-hmi-trend-action=print]')!.click();await flush(25);
 const dialog=frame.document.querySelector('[data-framecraft-trend-print-preview]')!;expect(dialog).toBeTruthy();const report=(dialog.querySelector('iframe') as HTMLIFrameElement).contentDocument!;expect(report.querySelector('svg')).toBeTruthy();const before=report.body.innerHTML;
 await act(async()=>useEditorStore.getState().setSimulationValue('Y','80'));await flush(350);expect(report.body.innerHTML).toBe(before);expect(received.filter(message=>message.type==='framecraft:hmi-event')).toHaveLength(0);
 await act(async()=>useEditorStore.getState().setInteractionMode('edit'));await flush(30);expect(frame.document.querySelector('[data-framecraft-trend-print-preview]')).toBeNull();expect(network).not.toHaveBeenCalled();
});
