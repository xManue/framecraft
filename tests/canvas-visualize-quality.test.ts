// @vitest-environment jsdom
import { createRequire } from "node:module";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "../src/canvas/Canvas";
import { useEditorStore } from "../src/state/editorStore";
// @ts-expect-error Real project plugin is plain ESM.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, options: { url: string; runScripts: string }) => { window: Window & typeof globalThis & { close(): void } } };
const initial = useEditorStore.getState(), panelOrigin = "http://127.0.0.1:4173", parentOrigin = "http://localhost:1420";
let root: Root, host: HTMLDivElement, browser: InstanceType<typeof JSDOM>, frame: Window & typeof globalThis;
let sent: Record<string, any>[], received: Record<string, any>[], network: ReturnType<typeof vi.fn>;
async function flush(ms = 50) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function usePanel() { await act(async () => useEditorStore.getState().setInteractionMode("navigate")); await flush(); }
const deliver = (data: Record<string, unknown>, origin = panelOrigin) => window.dispatchEvent(new MessageEvent("message", { data, source: frame, origin }));
beforeEach(async () => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); network = vi.fn(); vi.stubGlobal("fetch", network); localStorage.clear();
  useEditorStore.setState({ ...initial, project: { root: "C:/trend-test", files: [] } as never, document: undefined, selectedId: undefined, multiSelection: [], selectionRect: undefined,
    highlightPicker: undefined, zonePicking: undefined, interactionMode: "edit", pages: [], loading: false, reloadRecovery: undefined, previewUrl: panelOrigin, previewPath: "/", previewStatus: "ready", previewProcessExited: false,
    plcVariables: [{name:'Y',dataType:'DInt',access:'read',address:'',description:''}], consoleEntries: [], simulation: { on: true, values: { X: "10", Y: "42" }, status: { Y: { qualityCode: 192 } }, elements: [], unresolved: [] } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(StrictMode, null, createElement(Canvas))));
  browser = new JSDOM('<!doctype html><html><body></body></html>', { url: panelOrigin, runScripts: "outside-only" }); frame = browser.window; sent = []; received = [];
  frame.document.body.innerHTML='<main data-hmi-screen="Main"><input id="Speed" data-hmi-name="Speed" data-plc-variable="Y" data-hmi-visualize-quality="true" value="42"></main>';
  const field=frame.document.querySelector('#Speed')!;
  Object.assign(field,{getBoundingClientRect:()=>({left:30,top:40,width:200,height:40,right:230,bottom:80}),getClientRects:()=>[{left:30,top:40,width:200,height:40}]});
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

it('draws current quality through the real cross-origin Canvas/preview bridge and clears in edit mode',async()=>{
 expect(frame.document.querySelector('[data-framecraft-quality-layer]')).toBeNull();
 await usePanel();await flush(450);
 expect(received.some(message=>message.type==='framecraft:quality-request')).toBe(true);
 expect(frame.document.querySelector('[data-framecraft-quality-layer]')).toBeNull();
 await act(async()=>useEditorStore.getState().setSimulationStatus('Y',{qualityCode:64}));await flush(450);
 expect(frame.document.querySelector('[data-framecraft-quality-layer] [role="img"]')?.getAttribute('aria-label')).toContain('incerti');
 const reply=[...sent].reverse().find(message=>message.type==='framecraft:quality-result');expect(reply?.targetOrigin).toBe(panelOrigin);
 expect(received.filter(message=>message.type==='framecraft:quality-request').length).toBeLessThan(10);
 const last=received.filter(message=>message.type==='framecraft:quality-request').at(-1)!,before=sent.filter(message=>message.type==='framecraft:quality-result').length;
 deliver({...last,sequence:999},'https://untrusted.invalid');deliver({...last,sequence:999,pageId:'old-page'});deliver(last);await flush(1);
 expect(sent.filter(message=>message.type==='framecraft:quality-result')).toHaveLength(before);
 await act(async()=>useEditorStore.getState().setInteractionMode('edit'));await flush(450);expect(frame.document.querySelector('[data-framecraft-quality-layer]')).toBeNull();
 expect(network).not.toHaveBeenCalled();
});
