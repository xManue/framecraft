// @vitest-environment jsdom
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "../src/canvas/Canvas";
import { Inspector } from "../src/inspector/Inspector";
import { parseSource } from "../src/source-parser/parseSource";
import { readHighlightRegion } from "../src/core/highlightRegion";
const desktop = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: desktop }));
import { useEditorStore } from "../src/state/editorStore";
// @ts-expect-error the preview plugin is plain ESM.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, options: object) => { window: Window & typeof globalThis & { close(): void } } };
const initial = useEditorStore.getState();
const file = "C:/panel/Page.tsx";
const original = 'export function Page(){return <main><button>Mostra M2400</button><img src="macchina.png" alt="Macchina" /></main>}';
let host: HTMLDivElement, root: Root, preview: InstanceType<typeof JSDOM>;
let drawing: HTMLImageElement;
let frames: Map<number, FrameRequestCallback>;
let commands: Array<Record<string, unknown>>;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  desktop.readFile.mockReset().mockResolvedValue(original); desktop.writeFile.mockReset().mockResolvedValue(undefined);
  const parsed = parseSource(file, original), node = Object.values(parsed.nodes).find((item) => item.type === "button")!;
  useEditorStore.setState({ ...initial, project: { root: "C:/panel", name: "Linea prova", files: [] } as never,
    document: parsed, selectedId: node.id, selectionInfo: undefined, selectionStyles: {}, selectionRect: undefined,
    previewUrl: "http://127.0.0.1:4173", previewPath: "/", previewStatus: "ready", previewError: undefined,
    panelManifest: undefined, pages: [], multiSelection: [], history: [], future: [], dirty: false, loading: false,
    interactionMode: "edit", fitCanvas: false, zoom: .5, highlightPicker: undefined, highlightPreview: undefined, zonePicking: undefined,
    unresolvedSelection: undefined, listBinding: undefined, consoleEntries: [], lastError: undefined });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  frames = new Map(); let id = 0;
  const request = (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; };
  const cancel = (key: number) => { frames.delete(key); };
  vi.stubGlobal("requestAnimationFrame", request); vi.stubGlobal("cancelAnimationFrame", cancel);
  HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement("div", null, createElement(Canvas), createElement(Inspector))));
  const iframe = host.querySelector("iframe")!;
  preview = new JSDOM('<!doctype html><html><body><main><button>Mostra M2400</button><img src="macchina.png" alt="Macchina"></main></body></html>', { url: "http://127.0.0.1:4173/", runScripts: "outside-only", pretendToBeVisual: true });
  const view = preview.window;
  Object.defineProperty(iframe, "contentWindow", { configurable: true, value: view });
  Object.defineProperty(iframe, "contentDocument", { configurable: true, value: view.document });
  Object.assign(view, { ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: request, cancelAnimationFrame: cancel });
  Object.defineProperty(view, "parent", { configurable: true, value: { postMessage: (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data, source: view })) } });
  commands = [];
  view.postMessage = ((data: Record<string, unknown>) => { commands.push(data); view.dispatchEvent(new view.MessageEvent("message", { data, source: window })); }) as typeof view.postMessage;
  for (const element of view.document.querySelectorAll<HTMLElement>("main,button,img")) {
    const source = Object.values(parsed.nodes).find((item) => item.type === element.localName)!.source;
    element.setAttribute("data-fc-source", JSON.stringify(source));
    Object.assign(element, { getBoundingClientRect: () => ({ x: 100, y: 50, left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250 }), setPointerCapture() {}, hasPointerCapture() { return false; } });
  }
  drawing = view.document.querySelector("img")!;
  await act(async () => { view.eval(framecraftPlugin().transformIndexHtml("<main></main>").tags[0].children); view.document.querySelector("button")!.click(); });
  await act(async () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); });
  commands.length = 0; desktop.writeFile.mockClear();
});
afterEach(async () => { await act(async () => root.unmount()); preview.window.close(); host.remove(); useEditorStore.setState(initial, true); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function button(label: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label)!; }
function pointer(type: string, x: number, y: number) {
  const event = new preview.window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 }); drawing.dispatchEvent(event);
}
async function begin(polygon = false) {
  if (polygon) await act(async () => { const shape = host.querySelector<HTMLSelectElement>('[aria-label="Forma della zona da evidenziare"]')!; shape.value = "polygon"; shape.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => button("Disegna zona").click());
}
async function saved() { await act(async () => { await vi.waitFor(() => expect(useEditorStore.getState().document?.source).toContain("data-fc-highlight-region=")); }); }

describe("Inspector e Canvas con il vero ponte del disegno zona", () => {
  it("offre la scelta, manda il protocollo e salva il rettangolo senza spostare la foto", async () => {
    expect(host.querySelector('[aria-label="Forma della zona da evidenziare"]')).not.toBeNull();
    expect(button("Scegli la parte")).toBeDefined(); await begin();
    expect(useEditorStore.getState().highlightPicker?.mode).toBe("rectangle");
    expect(commands.some((message) => message.type === "framecraft:begin-region-pick")).toBe(true);
    expect(host.querySelector('[aria-label="Trascina elemento"]')).toBeNull();
    await act(async () => { pointer("pointerdown", 140, 90); pointer("pointermove", 300, 180); pointer("pointerup", 340, 190); });
    await saved();
    const node = Object.values(useEditorStore.getState().document!.nodes).find((item) => item.type === "button")!;
    expect(readHighlightRegion(node.props["data-fc-highlight-region"])?.points).toEqual([{ x: .1, y: .2 }, { x: .6, y: .2 }, { x: .6, y: .7 }, { x: .1, y: .7 }]);
    expect(useEditorStore.getState().history).toHaveLength(1); expect(drawing.style.translate).toBe("");
    expect(button("Ridisegna zona")).toBeDefined(); expect(useEditorStore.getState().highlightPicker).toBeUndefined();
  });
  it.each(["Fine", "Enter"])("salva un contorno a tre punti con %s", async (finish) => {
    await begin(true);
    await act(async () => {
      pointer("pointerdown", 140, 90); pointer("pointerdown", 340, 90); pointer("pointerdown", 340, 190);
      if (finish === "Fine") button("Fine").click(); else preview.window.document.dispatchEvent(new preview.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await saved();
    const node = Object.values(useEditorStore.getState().document!.nodes).find((item) => item.type === "button")!;
    expect(readHighlightRegion(node.props["data-fc-highlight-region"])?.points).toHaveLength(3);
  });
  it("Esc dentro l'iframe annulla senza scrivere e lascia il pulsante selezionato", async () => {
    const selected = useEditorStore.getState().selectedId; await begin();
    await act(async () => { pointer("pointerdown", 140, 90); pointer("pointermove", 340, 190); preview.window.document.dispatchEvent(new preview.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    expect(useEditorStore.getState().highlightPicker).toBeUndefined(); expect(useEditorStore.getState().selectedId).toBe(selected);
    expect(desktop.writeFile).not.toHaveBeenCalled();
  });
  it.each(["navigate", "page", "reload"])("annulla il disegno quando cambia %s", async (change) => {
    await begin(true); await act(async () => pointer("pointerdown", 140, 90));
    await act(async () => {
      if (change === "navigate") useEditorStore.getState().setInteractionMode("navigate");
      else if (change === "page") useEditorStore.setState({ previewPath: "/settings.html" });
      else window.dispatchEvent(new MessageEvent("message", { data: { type: "framecraft:ready", path: "/", selectionProtocol: 2 }, source: preview.window }));
    });
    expect(useEditorStore.getState().highlightPicker).toBeUndefined(); expect(desktop.writeFile).not.toHaveBeenCalled();
  });
  it("ignora messaggi di una scelta vecchia e di una finestra estranea", async () => {
    await begin(); const picker = useEditorStore.getState().highlightPicker!;
    const source = Object.values(useEditorStore.getState().document!.nodes).find((item) => item.type === "img")!.source;
    const data = { type: "framecraft:region-picked", requestId: picker.requestId, source, region: { space: "box", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] } };
    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", { data, source: window }));
      window.dispatchEvent(new MessageEvent("message", { data: { ...data, requestId: "old" }, source: preview.window }));
    });
    expect(desktop.writeFile).not.toHaveBeenCalled(); expect(useEditorStore.getState().highlightPicker).toBe(picker);
  });
});
