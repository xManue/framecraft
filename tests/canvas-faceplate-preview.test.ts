// @vitest-environment jsdom
import { createRequire } from "node:module";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "../src/canvas/Canvas";
import type { HmiFaceplateCatalog } from "../src/core/hmiFaceplates";
import { useEditorStore } from "../src/state/editorStore";
// @ts-expect-error The actual project plugin is plain ESM.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, options: { url: string; runScripts: string; pretendToBeVisual: boolean }) => { window: Window & typeof globalThis & { close(): void } } };
const initial = useEditorStore.getState(), panelOrigin = "http://127.0.0.1:4173", parentOrigin = "http://localhost:1420";
const catalog: HmiFaceplateCatalog = { version: 1, types: [{ id: "unit", name: "Unit", version: "1.0.0", status: "released", width: 240, height: 120,
  interfaceTags: [{ name: "Value", dataType: "Real", required: true }], interfaceProperties: [{ name: "Caption", dataType: "ConfigurationString", defaultValue: "Unit" }],
  interfaceEvents: [{ name: "Selected", parameters: [{ name: "index", dataType: "Int" }] }], localTags: [{ name: "Counter", dataType: "Int", startValue: "5" }], nestedInstances: [],
  visualization: [
    { id: "Caption", type: "text", left: 0, top: 0, width: 100, height: 24, bindings: [{ property: "Text", source: "property", name: "Caption" }] },
    { id: "Value", type: "io-field", left: 0, top: 24, width: 100, height: 24, bindings: [{ property: "ProcessValue", source: "tag", name: "Value" }] },
    { id: "Counter", type: "io-field", left: 0, top: 48, width: 100, height: 24, bindings: [{ property: "ProcessValue", source: "local", name: "Counter" }] },
    { id: "Select", type: "button", left: 110, top: 0, width: 100, height: 32, text: "Imposta", bindings: [], event: { name: "Selected", parameters: { index: 9 } } },
    { id: "Graphic", type: "graphic", left: 110, top: 40, width: 32, height: 32, graphic: "/framecraft-assets/own.svg", bindings: [] },
  ],
}] };
const binding = (caption: string) => JSON.stringify({ typeId: "unit", version: "1.0.0", tagBindings: { Value: "Signal" }, propertyValues: { Caption: caption }, eventBindings: { Selected: { script: 'Tags("Counter").Write(index);' } } });
let root: Root, host: HTMLDivElement, browser: InstanceType<typeof JSDOM>, frame: Window & typeof globalThis;
let sent: { data: Record<string, any>; origin: string }[], received: Record<string, any>[], network: ReturnType<typeof vi.fn>;
const owner = (id = "one") => frame.document.getElementById(id)!;
const latest = () => sent.filter(message => message.data.type === "framecraft:faceplate-preview").at(-1)!.data;
const deliver = (data: Record<string, unknown>, origin = panelOrigin, source: Window = frame) => window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
async function flush(ms = 32) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function usePanel() { await act(async () => useEditorStore.getState().setInteractionMode("navigate")); await flush(); }

beforeEach(async () => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); network = vi.fn(); vi.stubGlobal("fetch", network);
  useEditorStore.setState({ ...initial, project: { root: "C:/panel", files: [] } as never, faceplateCatalog: catalog, document: undefined, selectedId: undefined, multiSelection: [], selectionRect: undefined,
    highlightPicker: undefined, zonePicking: undefined, interactionMode: "edit", pages: [], previewUrl: panelOrigin, previewPath: "/", previewStatus: "ready", previewProcessExited: false,
    consoleEntries: [], simulation: { on: true, values: { Signal: "42" }, status: {}, elements: [], unresolved: [] } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(StrictMode, null, createElement(Canvas))));
  browser = new JSDOM('<!doctype html><html><body><div id="one" style="overflow:auto" data-hmi-faceplate data-hmi-events="[]">Bozza uno</div><div id="two" data-hmi-faceplate>Bozza due</div></body></html>', { url: panelOrigin, runScripts: "outside-only", pretendToBeVisual: true });
  frame = browser.window; owner().setAttribute("data-hmi-faceplate", binding("Uno")); owner("two").setAttribute("data-hmi-faceplate", binding("Due")); sent = []; received = [];
  const iframe = host.querySelector("iframe")!;
  Object.defineProperty(iframe, "contentWindow", { configurable: true, value: frame });
  Object.defineProperty(iframe, "contentDocument", { configurable: true, get: () => { throw new DOMException("Cross origin", "SecurityError"); } });
  Object.defineProperty(frame, "parent", { configurable: true, value: window });
  Object.assign(frame, { fetch: network, ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16), cancelAnimationFrame: (id: number) => window.clearTimeout(id) });
  vi.spyOn(window, "postMessage").mockImplementation((data: Record<string, any>, target: string | WindowPostMessageOptions = "*") => {
    received.push(data); const origin = typeof target === "string" ? target : target.targetOrigin ?? "*";
    if (origin !== "*" && origin !== parentOrigin) throw Error("Origine editor inattesa");
    queueMicrotask(() => deliver(data));
  });
  frame.postMessage = ((data: Record<string, any>, origin: string) => {
    sent.push({ data, origin }); if (origin !== "*" && origin !== panelOrigin) return;
    queueMicrotask(() => frame.dispatchEvent(new frame.MessageEvent("message", { data, source: window, origin: parentOrigin })));
  }) as typeof frame.postMessage;
  await act(async () => frame.eval(framecraftPlugin().transformIndexHtml("<main></main>").tags[0].children)); await flush();
});

afterEach(async () => { await act(async () => root.unmount()); browser?.window.close(); host.remove(); useEditorStore.setState(initial, true); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("faceplate con Canvas e ponte reali su origini diverse", () => {
  it("mostra il tipo nella pagina senza accedere al DOM dell'iframe e risolve le immagini sul progetto", async () => {
    expect(owner().textContent).toBe("Bozza uno"); await usePanel();
    expect(owner().querySelector('[data-hmi-faceplate-object="Caption"]')!.textContent).toBe("Uno");
    expect(owner().querySelector('[data-hmi-faceplate-object="Value"]')!.textContent).toBe("42");
    expect(owner().querySelector<HTMLImageElement>('img')!.src).toBe(panelOrigin + "/framecraft-assets/own.svg");
    expect(owner().getAttribute("aria-description")).toContain("nessun PLC");
    expect(sent.filter(message => message.data.type === "framecraft:faceplate-preview").every(message => message.origin === panelOrigin)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  });

  it("l'evento aggiorna solo il tag locale della propria istanza e non duplica il click del contenitore", async () => {
    await usePanel(); await act(async () => owner().querySelector<HTMLButtonElement>('button')!.click()); await flush();
    expect(owner().querySelector('[data-hmi-faceplate-object="Counter"]')!.textContent).toBe("9");
    expect(owner("two").querySelector('[data-hmi-faceplate-object="Counter"]')!.textContent).toBe("5");
    expect(useEditorStore.getState().simulation.values.Counter).toBeUndefined();
    expect(received.filter(message => message.type === "framecraft:faceplate-event")).toHaveLength(1);
    expect(received.filter(message => message.type === "framecraft:hmi-event")).toHaveLength(0);
    expect(network).not.toHaveBeenCalled();
  });

  it("Modifica ripristina nodi e stile senza perdere i tag locali della pagina", async () => {
    const original = owner().firstChild; await usePanel();
    await act(async () => owner().querySelector<HTMLButtonElement>('button')!.click()); await flush();
    await act(async () => useEditorStore.getState().setInteractionMode("edit")); await flush();
    expect(owner().firstChild).toBe(original); expect(owner().style.overflow).toBe("auto"); expect(owner().getAttribute("title")).toBeNull();
    await usePanel(); expect(owner().querySelector('[data-hmi-faceplate-object="Counter"]')!.textContent).toBe("9");
  });

  it("popup, interfaccia e geometria mantengono il medesimo contenitore", async () => {
    await usePanel(); const state = { popupId: "popup", faceplateType: "Unit_V_1_0_0", title: "Dettaglio", interfaceValues: { Value: { Tag: "Signal" }, Caption: "Popup" }, visible: true, left: 10, top: 20, width: 400, height: 260, windowFlags: 83 };
    const send = (type: string, value: Record<string, unknown>) => frame.dispatchEvent(new frame.MessageEvent("message", { data: { type, state: value, pageId: latest().pageId }, source: window, origin: parentOrigin }));
    await act(async () => send("framecraft:popup-open", state)); await flush();
    const popup = frame.document.querySelector('[data-framecraft-popup-id="popup"]')!, faceplate = popup.querySelector<HTMLElement>('[data-hmi-popup-faceplate-type]')!;
    expect(faceplate.querySelector('[data-hmi-faceplate-object="Caption"]')!.textContent).toBe("Popup");
    await act(async () => send("framecraft:popup-update", { ...state, left: 90, visible: false })); await flush();
    expect(popup.querySelector('[data-hmi-popup-faceplate-type]')).toBe(faceplate); expect((popup as HTMLElement).style.display).toBe("none");
    await act(async () => send("framecraft:popup-update", { ...state, interfaceValues: { ...state.interfaceValues, Caption: "Aggiornato" } })); await flush();
    expect(popup.querySelector('[data-hmi-popup-faceplate-type]')).toBe(faceplate); expect(faceplate.textContent).toContain("Aggiornato");
    await act(async () => send("framecraft:popup-close", state)); await flush(); expect(popup.isConnected).toBe(false);
  });

  it("HMR sullo stesso nodo conserva la nuova bozza e non crea un ciclo di messaggi", async () => {
    await usePanel(); owner().replaceChildren(frame.document.createTextNode("Nuova bozza"));
    await flush(80); expect(owner().querySelector('[data-hmi-faceplate-visual-root]')).not.toBeNull();
    const before = sent.length; await flush(160); expect(sent.length - before).toBeLessThan(3);
    await act(async () => useEditorStore.getState().setInteractionMode("edit")); await flush(); expect(owner().textContent).toBe("Nuova bozza");
  });

  it("rifiuta snapshot esterni e azioni di pagina/istanza non attive", async () => {
    await usePanel(); const packet = latest();
    await act(async () => frame.dispatchEvent(new frame.MessageEvent("message", { data: { ...packet, catalog: { version: 1, types: [] } }, source: frame, origin: parentOrigin })));
    const event = { type: "framecraft:faceplate-event", previewPageId: packet.pageId, instanceId: owner().dataset.framecraftInstanceId, raw: binding("Uno"), eventName: "Selected", parameters: { index: 33 } };
    await act(async () => { deliver(event, "https://untrusted.invalid"); deliver({ ...event, previewPageId: "old-page" }); }); await flush();
    expect(owner().querySelector('[data-hmi-faceplate-object="Counter"]')!.textContent).toBe("5");
    await act(async () => useEditorStore.getState().setInteractionMode("edit")); await flush();
    await act(async () => deliver(event)); await flush(); expect(useEditorStore.getState().simulation.values.Counter).toBeUndefined();
  });

  it("un timer dell'evento usa i tag locali e non scrive nel namespace delle altre istanze", async () => {
    const instance = JSON.parse(binding("Uno")); instance.eventBindings.Selected.script = 'HMIRuntime.Timers.SetTimeout(() => { Tags("Counter").Write(index); }, 30);';
    owner().setAttribute("data-hmi-faceplate", JSON.stringify(instance)); await usePanel();
    await act(async () => owner().querySelector<HTMLButtonElement>('button')!.click()); await flush(80);
    expect(owner().querySelector('[data-hmi-faceplate-object="Counter"]')!.textContent).toBe("9");
    expect(owner("two").querySelector('[data-hmi-faceplate-object="Counter"]')!.textContent).toBe("5");
    expect(useEditorStore.getState().simulation.values.Counter).toBeUndefined();
  });

  it("cambiare pagina scarta un evento differito e chiude i popup legati alla vecchia pagina", async () => {
    const instance = JSON.parse(binding("Uno")); instance.eventBindings.Selected.script = 'let p = UI.OpenFaceplateInPopup("Unit_V_1_0_0", "Dettaglio", { Value: { Tag: "Signal" } }, UI.ActiveScreen, true); p.Visible = true; HMIRuntime.Timers.SetTimeout(() => { Tags("Counter").Write(index); }, 200);';
    owner().setAttribute("data-hmi-faceplate", JSON.stringify(instance)); await usePanel();
    const oldPage = latest().pageId;
    await act(async () => owner().querySelector<HTMLButtonElement>('button')!.click()); await flush(1);
    expect(frame.document.querySelector('[data-framecraft-popup-id]')).not.toBeNull();
    await act(async () => Object.assign(frame, { __framecraftCurrentPage: "another" })); await flush(250);
    expect(latest().pageId).not.toBe(oldPage);
    expect(useEditorStore.getState().simulation.values.Counter).toBeUndefined();
    expect(owner().querySelector('[data-hmi-faceplate-object="Counter"]')!.textContent).toBe("5");
    expect(frame.document.querySelector('[data-framecraft-popup-id]')).toBeNull();
  });
});
