import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error jsdom is provided by the test environment.
import { JSDOM } from "jsdom";
// @ts-expect-error the plugin is plain ESM shipped with the editor.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";
const windows: Array<{ close(): void }> = [];
afterEach(() => { for (const view of windows.splice(0)) view.close(); });
function preview(svg = false) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main><button>M2400</button>' + (svg ? '<svg viewBox="0 0 200 100"></svg>' : '<img src="macchina.png">') + '</main></body></html>', { url: "http://localhost:4173/synoptic.html", runScripts: "dangerously", pretendToBeVisual: true });
  const view = dom.window as Window & typeof globalThis;
  windows.push(dom.window);
  Object.assign(view, { ResizeObserver: class { observe() {} disconnect() {} } });
  let id = 0; const frames = new Map<number, FrameRequestCallback>();
  view.requestAnimationFrame = (callback) => { frames.set(++id, callback); return id; };
  view.cancelAnimationFrame = (key) => { frames.delete(key); };
  const messages: Array<Record<string, any>> = [];
  Object.defineProperty(view, "parent", { configurable: true, value: { postMessage: (message: Record<string, any>) => messages.push(message) } });
  const drawing = view.document.querySelector<HTMLElement>(svg ? "svg" : "img")!;
  const source = { file: "C:/panel/Page.tsx", start: 20, end: 70, line: 1, column: 20 };
  drawing.setAttribute("data-fc-source", JSON.stringify(source));
  const box = { left: 100, top: 50, width: 400, height: 200 };
  Object.assign(drawing, { getBoundingClientRect: vi.fn(() => ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height })), setPointerCapture: vi.fn(), hasPointerCapture: () => false });
  if (svg) Object.assign(drawing, {
    getScreenCTM: () => ({ a: 2, b: 0, c: 0, d: 2, e: 100, f: 50, inverse: () => ({ a: .5, d: .5, e: -50, f: -25 }) }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform(matrix: Record<string, number>) { return { x: this.x * matrix.a + matrix.e, y: this.y * matrix.d + matrix.f }; } }),
  });
  view.eval(framecraftPlugin().transformIndexHtml("<main></main>").tags[0].children);
  const send = (data: Record<string, unknown>) => view.dispatchEvent(new view.MessageEvent("message", { data }));
  const pointer = (type: string, x: number, y: number, pointerId = 1) => {
    const event = new view.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, "pointerId", { value: pointerId }); (drawing.isConnected ? drawing : view.document).dispatchEvent(event);
  };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); };
  const begin = (mode = "rectangle", requestId = "pick-1") => send({ type: "framecraft:begin-region-pick", requestId, mode, color: "#f59e0b", width: 3 });
  const picked = () => messages.filter((message) => message.type === "framecraft:region-picked");
  flush(); messages.length = 0;
  return { view, drawing, box, source, frames, messages, send, pointer, flush, begin, picked };
}

describe("disegno zona nel ponte reale serializzato", () => {
  it("trascina un rettangolo e usa esattamente le coordinate del rilascio", () => {
    const p = preview(); p.begin(); p.pointer("pointerdown", 140, 90);
    p.pointer("pointermove", 250, 130); p.pointer("pointerup", 340, 190);
    expect(p.picked()).toHaveLength(1);
    expect(p.picked()[0]).toMatchObject({ requestId: "pick-1", source: p.source, region: { space: "box", points: [{ x: .1, y: .2 }, { x: .6, y: .2 }, { x: .6, y: .7 }, { x: .1, y: .7 }] } });
    p.pointer("click", 340, 190); p.pointer("dblclick", 340, 190);
    expect(p.messages.some((message) => ["framecraft:select", "framecraft:drag-end", "framecraft:inspect"].includes(message.type))).toBe(false);
  });
  it("coalesca il movimento senza disegnare ogni pointermove", () => {
    const p = preview(); p.begin(); p.pointer("pointerdown", 140, 90); p.flush();
    const path = p.view.document.querySelector("[data-framecraft-region-preview] path")!;
    const set = vi.spyOn(path, "setAttribute");
    for (let x = 150; x <= 340; x++) p.pointer("pointermove", x, 190);
    expect(set).not.toHaveBeenCalled(); p.flush();
    expect(set).toHaveBeenCalledTimes(1); expect(path.getAttribute("d")).toBe("M140 90 L340 90 L340 190 L140 190 Z");
  });
  it("mantiene le coordinate relative anche con una foto mostrata al 50%", () => {
    const p = preview(); p.box.width = 200; p.box.height = 100; p.begin();
    p.pointer("pointerdown", 120, 70); p.pointer("pointerup", 220, 120);
    expect(p.picked()[0].region.points).toEqual([{ x: .1, y: .2 }, { x: .6, y: .2 }, { x: .6, y: .7 }, { x: .1, y: .7 }]);
  });
  it("convertisce i pixel nelle unità dello SVG reale", () => {
    const p = preview(true); p.begin(); p.pointer("pointerdown", 120, 70); p.pointer("pointerup", 200, 130);
    expect(p.picked()[0].region).toEqual({ space: "svg", points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 40 }, { x: 10, y: 40 }] });
  });
  it("disegna un contorno a punti, toglie l'ultimo punto e chiude con Invio", () => {
    const p = preview(); p.begin("polygon");
    p.pointer("pointerdown", 140, 90); p.pointer("pointerdown", 340, 90); p.pointer("pointerdown", 300, 110);
    p.view.document.dispatchEvent(new p.view.KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }));
    p.pointer("pointerdown", 340, 190);
    p.view.document.dispatchEvent(new p.view.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(p.picked()).toHaveLength(1);
    expect(p.picked()[0].region.points).toEqual([{ x: .1, y: .2 }, { x: .6, y: .2 }, { x: .6, y: .7 }]);
  });
  it("il comando Fine è protetto dall'identificatore della scelta attuale", () => {
    const p = preview(); p.begin("polygon"); p.pointer("pointerdown", 140, 90); p.pointer("pointerdown", 340, 90); p.pointer("pointerdown", 340, 190);
    p.send({ type: "framecraft:finish-region-pick", requestId: "old" }); expect(p.picked()).toHaveLength(0);
    p.send({ type: "framecraft:finish-region-pick", requestId: "pick-1" }); expect(p.picked()).toHaveLength(1);
  });
  it.each(["Escape", "pointercancel", "lostpointercapture", "blur", "pagehide", "navigate", "remove"])("annulla su %s senza selezionare o salvare un oggetto", (reason) => {
    const p = preview(); p.begin(); p.pointer("pointerdown", 140, 90); p.pointer("pointermove", 340, 190); p.flush();
    if (reason === "Escape") p.view.document.dispatchEvent(new p.view.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    else if (reason === "navigate") p.send({ type: "framecraft:set-mode", mode: "navigate" });
    else if (reason === "remove") { p.drawing.remove(); p.pointer("pointermove", 350, 190); p.flush(); }
    else if (["blur", "pagehide"].includes(reason)) p.view.dispatchEvent(new p.view.Event(reason));
    else p.pointer(reason, 340, 190);
    expect(p.picked()).toHaveLength(0);
    expect(p.messages.some((message) => message.type === "framecraft:region-cancelled")).toBe(true);
    expect(p.view.document.querySelector("[data-framecraft-region-preview]")).toBeNull();
  });
  it("non usa il rilascio di un altro puntatore", () => {
    const p = preview(); p.begin(); p.pointer("pointerdown", 140, 90); p.pointer("pointerup", 340, 190, 2);
    expect(p.picked()).toHaveLength(0); p.pointer("pointerup", 340, 190); expect(p.picked()).toHaveLength(1);
  });
  it("un rettangolo nullo non salva e permette di riprovare", () => {
    const p = preview(); p.begin(); p.pointer("pointerdown", 140, 90); p.pointer("pointerup", 140, 90);
    expect(p.picked()).toHaveLength(0); expect(p.messages.some((message) => message.type === "framecraft:region-missed")).toBe(true);
    p.pointer("pointerdown", 150, 100); p.pointer("pointerup", 250, 160); expect(p.picked()).toHaveLength(1);
  });
});
