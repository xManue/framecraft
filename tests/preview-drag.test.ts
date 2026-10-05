import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error jsdom is provided by the test environment.
import { JSDOM } from "jsdom";
// @ts-expect-error the preview plugin is shipped as plain ESM.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

const windows: Array<{ close(): void }> = [];
afterEach(() => { for (const current of windows.splice(0)) current.close(); vi.restoreAllMocks(); });

function createPreview() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:4173/synoptic.html", runScripts: "dangerously", pretendToBeVisual: true });
  const current = dom.window as Window & typeof globalThis;
  windows.push(dom.window);
  Object.assign(current, { ResizeObserver: class { observe() {} disconnect() {} } });
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  current.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  current.cancelAnimationFrame = (id) => { frames.delete(id); };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); };
  const messages: Array<Record<string, any>> = [];
  Object.defineProperty(current, "parent", { configurable: true, value: { postMessage: (message: Record<string, any>) => messages.push(message) } });
  const elements = ["M2400", "Avvia", "Arresta"].map((text, index) => {
    const element = current.document.createElement(index ? "button" : "span");
    element.textContent = text;
    element.style.cssText = "display:inline-block;transition:all 1s ease;will-change:opacity;rotate:30deg";
    element.setAttribute("data-fc-source", JSON.stringify({ file: "C:/panel/Page.tsx", start: 10 + index * 30, end: 30 + index * 30, line: 1, column: 0 }));
    const rect = vi.fn(() => {
      const [dx = 0, dy = 0] = (element.style.translate || "0px 0px").split(/\s+/).map(Number.parseFloat);
      const x = 30 + index * 150 + dx, y = 40 + dy;
      return { x, y, left: x, top: y, right: x + 110, bottom: y + 44, width: 110, height: 44, toJSON() {} };
    });
    Object.defineProperty(element, "getBoundingClientRect", { value: rect });
    Object.assign(element, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    current.document.body.append(element);
    return element;
  });
  current.eval(framecraftPlugin().transformIndexHtml("<main></main>").tags[0].children);
  const send = (data: Record<string, unknown>) => current.dispatchEvent(new current.MessageEvent("message", { data }));
  const pointer = (type: string, x: number, y: number, index = 0, extra: Record<string, unknown> = {}) => {
    const event = new current.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, ...extra });
    Object.defineProperty(event, "pointerId", { value: extra.pointerId ?? 1 });
    elements[index].dispatchEvent(event);
  };
  const latest = (type: string) => messages.filter((message) => message.type === type).at(-1);
  send({ type: "framecraft:set-snap", enabled: false, grid: 8, threshold: 6 });
  flush(); messages.length = 0;
  return { current, elements, frames, messages, flush, send, pointer, latest };
}

describe("preview drag responsiveness", () => {
  it("coalesces a burst of pointer events to the latest position once per animation frame", () => {
    const preview = createPreview();
    preview.pointer("pointerdown", 40, 50);
    const rect = preview.elements[0].getBoundingClientRect as ReturnType<typeof vi.fn>;
    rect.mockClear();
    for (let x = 44; x <= 140; x++) preview.pointer("pointermove", x, 70);
    expect(preview.messages.filter((message) => message.type === "framecraft:drag-move")).toHaveLength(0);
    expect(rect).not.toHaveBeenCalled();
    preview.flush();
    expect(preview.elements[0].style.translate).toBe("100px 20px");
    expect(preview.messages.filter((message) => message.type === "framecraft:drag-move")).toHaveLength(1);
    expect(preview.latest("framecraft:drag-move")?.rect).toMatchObject({ x: 130, y: 60 });
    expect(rect).toHaveBeenCalledTimes(1);
  });

  it("flushes the release position before the frame, commits once and leaves no queued move", () => {
    const preview = createPreview();
    preview.pointer("pointerdown", 40, 50);
    preview.pointer("pointermove", 80, 70);
    preview.pointer("pointerup", 150, 100);
    expect(preview.latest("framecraft:drag-end")).toMatchObject({ translate: "110px 50px", rect: { x: 140, y: 90 } });
    const moves = preview.messages.filter((message) => message.type === "framecraft:drag-move").length;
    preview.flush();
    expect(preview.messages.filter((message) => message.type === "framecraft:drag-end")).toHaveLength(1);
    expect(preview.messages.filter((message) => message.type === "framecraft:drag-move")).toHaveLength(moves);
  });

  it("suspends transition easing only during a drag and restores authored CSS and priorities", () => {
    const preview = createPreview(), element = preview.elements[0];
    element.style.setProperty("transition-property", "all", "important");
    element.style.setProperty("will-change", "opacity", "important");
    preview.pointer("pointerdown", 40, 50);
    preview.pointer("pointermove", 80, 70);
    preview.flush();
    expect(element.style.getPropertyValue("transition-property")).toBe("none");
    expect(element.style.getPropertyPriority("transition-property")).toBe("important");
    expect(element.style.willChange).toContain("translate");
    expect(element.style.rotate).toBe("30deg");
    preview.pointer("pointerup", 80, 70);
    expect(element.style.getPropertyValue("transition-property")).toBe("all");
    expect(element.style.getPropertyPriority("transition-property")).toBe("important");
    expect(element.style.willChange).toBe("opacity");
    expect(element.style.getPropertyPriority("will-change")).toBe("important");
    expect(element.style.transition).toBe("all 1s ease");
  });

  it.each(["pointercancel", "lostpointercapture", "blur", "escape", "navigate", "pagehide"])("cancels %s without committing and restores the original translation", (reason) => {
    const preview = createPreview(), element = preview.elements[0];
    element.style.translate = "10px -5px";
    preview.pointer("pointerdown", 40, 50);
    preview.pointer("pointermove", 80, 70);
    preview.flush();
    expect(element.style.translate).toBe("50px 15px");
    if (reason === "pointercancel" || reason === "lostpointercapture") preview.pointer(reason, 80, 70);
    else if (reason === "escape") element.dispatchEvent(new preview.current.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    else if (reason === "navigate") preview.send({ type: "framecraft:set-mode", mode: "navigate" });
    else preview.current.dispatchEvent(new preview.current.Event(reason));
    preview.flush();
    expect(element.style.translate).toBe("10px -5px");
    expect(element.style.getPropertyValue("transition-property")).toBe("");
    expect(element.style.willChange).toBe("opacity");
    expect(preview.messages.some((message) => message.type === "framecraft:drag-end")).toBe(false);
  });

  it("retains Shift axis lock and Alt snap bypass in the final frame", () => {
    const preview = createPreview();
    preview.send({ type: "framecraft:set-snap", enabled: true, grid: 8, threshold: 6 });
    preview.pointer("pointerdown", 40, 50);
    preview.pointer("pointermove", 77, 59, 0, { shiftKey: true, altKey: true });
    preview.flush();
    expect(preview.elements[0].style.translate).toBe("37px 0px");
    preview.pointer("pointerup", 77, 59, 0, { shiftKey: true, altKey: true });
    expect(preview.latest("framecraft:drag-end")?.translate).toBe("37px 0px");
  });

  it("does not rescan source nodes or computed styles for every group movement", () => {
    const preview = createPreview();
    preview.pointer("pointerdown", 40, 50, 0, { ctrlKey: true });
    preview.pointer("pointerdown", 190, 50, 1, { ctrlKey: true });
    preview.pointer("pointerdown", 40, 50);
    const query = vi.spyOn(preview.current.document, "querySelectorAll");
    const styles = vi.spyOn(preview.current, "getComputedStyle");
    for (let x = 45; x <= 85; x++) preview.pointer("pointermove", x, 65);
    preview.flush(); query.mockClear(); styles.mockClear();
    for (let x = 86; x <= 135; x++) preview.pointer("pointermove", x, 75);
    preview.flush();
    expect(query).not.toHaveBeenCalled();
    expect(styles).not.toHaveBeenCalled();
    expect(preview.latest("framecraft:group-drag-move")?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ translate: { x: 95, y: 25 }, styles: expect.objectContaining({ rotate: "30deg" }) }),
    ]));
    preview.pointer("pointercancel", 135, 75);
    expect(preview.elements.slice(0, 2).map((element) => element.style.translate)).toEqual(["", ""]);
    expect(preview.messages.some((message) => message.type === "framecraft:group-drag-end")).toBe(false);
  });
  it("cancels an unpainted gesture and drops its queued frame", () => {
    const preview = createPreview();
    preview.pointer("pointerdown", 40, 50);
    preview.pointer("pointermove", 80, 70);
    preview.pointer("pointercancel", 80, 70);
    preview.flush();
    expect(preview.elements[0].style.translate).toBe("");
    expect(preview.messages.some((message) => message.type === "framecraft:drag-end" || message.type === "framecraft:drag-move")).toBe(false);
  });
  it("ignores another pointer and aborts if the dragged node is removed", () => {
    const preview = createPreview();
    preview.pointer("pointerdown", 40, 50);
    preview.pointer("pointermove", 100, 100, 0, { pointerId: 2 });
    preview.flush();
    expect(preview.elements[0].style.translate).toBe("");
    preview.pointer("pointermove", 80, 70);
    preview.elements[0].remove();
    preview.flush();
    expect(preview.elements[0].style.getPropertyValue("transition-property")).toBe("");
    expect(preview.messages.some((message) => message.type === "framecraft:drag-end")).toBe(false);
  });
});
