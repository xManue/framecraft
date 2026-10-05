// @vitest-environment jsdom
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "../src/canvas/Canvas";
import { parseSource } from "../src/source-parser/parseSource";
const desktop = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: desktop }));
import { useEditorStore } from "../src/state/editorStore";
// @ts-expect-error the preview plugin is shipped as plain ESM.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: object) => { window: Window & typeof globalThis & { close(): void } };
};
const initial = useEditorStore.getState();
const original = 'export function Page(){return <button style={{ width: "110px", height: "44px", rotate: "30deg" }}>Avvia</button>}';
const file = "C:/panel/Page.tsx";
let host: HTMLDivElement, root: Root, preview: InstanceType<typeof JSDOM> | undefined;
let frames: Map<number, FrameRequestCallback>, commands: Array<Record<string, unknown>>;
let motor: HTMLButtonElement;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  desktop.readFile.mockReset().mockResolvedValue(original); desktop.writeFile.mockReset().mockResolvedValue(undefined);
  const parsed = parseSource(file, original), node = Object.values(parsed.nodes)[0];
  useEditorStore.setState({ ...initial, document: parsed, selectedId: node.id, project: { root: "C:/panel", files: [] } as never,
    panelManifest: undefined, pages: [], activePageId: undefined, previewUrl: "http://127.0.0.1:4173", previewPath: "/",
    previewStatus: "ready", previewError: undefined, interactionMode: "edit", selectionInfo: undefined, selectionRect: undefined,
    selectionStyles: {}, multiSelection: [], history: [], future: [], dirty: false, fitCanvas: false, zoom: 1,
    snap: { enabled: false, grid: 8 } });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  frames = new Map(); let frameId = 0;
  const request = (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; };
  const cancel = (id: number) => { frames.delete(id); };
  vi.stubGlobal("requestAnimationFrame", request); vi.stubGlobal("cancelAnimationFrame", cancel);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(Canvas)));
  const iframe = host.querySelector("iframe")!;
  preview = new JSDOM('<!doctype html><html><body><button style="display:inline-block;width:110px;height:44px;rotate:30deg;transition:all 1s ease">Avvia</button></body></html>', {
    url: "http://127.0.0.1:4173/", runScripts: "outside-only", pretendToBeVisual: true,
  });
  const frame = preview.window;
  Object.defineProperty(iframe, "contentWindow", { configurable: true, value: frame });
  Object.defineProperty(iframe, "contentDocument", { configurable: true, value: frame.document });
  Object.assign(frame, { ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: request, cancelAnimationFrame: cancel });
  Object.defineProperty(frame, "parent", { configurable: true, value: { postMessage: (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data, source: frame })) } });
  commands = [];
  frame.postMessage = ((data: Record<string, unknown>) => { commands.push(data); frame.dispatchEvent(new frame.MessageEvent("message", { data, source: window })); }) as typeof frame.postMessage;
  motor = frame.document.querySelector("button")!;
  motor.setAttribute("data-fc-source", JSON.stringify(node.source));
  Object.defineProperty(motor, "getBoundingClientRect", { value: () => {
    const [dx = 0, dy = 0] = (motor.style.translate || "0px 0px").split(/\s+/).map(Number.parseFloat);
    return { x: 30 + dx, y: 40 + dy, left: 30 + dx, top: 40 + dy, right: 140 + dx, bottom: 84 + dy, width: 110, height: 44 };
  } });
  await act(async () => {
    frame.eval(framecraftPlugin().transformIndexHtml("<main></main>").tags[0].children);
    motor.click();
  });
  await flush();
  commands.length = 0;
});
afterEach(async () => { await act(async () => root.unmount()); preview?.window.close(); host.remove(); useEditorStore.setState(initial, true); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function flush() { await act(async () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); }); }
function pointer(target: EventTarget, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 }); target.dispatchEvent(event);
}
const styles = () => commands.filter((command) => command.type === "framecraft:preview-style");
const handle = () => host.querySelector<HTMLButtonElement>('[aria-label="Sposta elemento"]')!;
describe("canvas handles with the real preview bridge", () => {
  it("coalesces handle movement and commits the exact release position as one undo entry", async () => {
    await act(async () => pointer(handle(), "pointerdown", 40, 50));
    expect(motor.style.getPropertyValue("transition-property")).toBe("none");
    await act(async () => { for (let x = 45; x <= 140; x++) pointer(window, "pointermove", x, 70); });
    expect(styles()).toHaveLength(0); expect(desktop.writeFile).not.toHaveBeenCalled();
    await flush();
    expect(styles()).toHaveLength(1); expect(motor.style.translate).toBe("100px 20px");
    await act(async () => pointer(window, "pointerup", 150, 100));
    await act(async () => { await vi.waitFor(() => expect(useEditorStore.getState().document?.source).toContain('translate: "110px 50px"')); });
    expect(motor.style.translate).toBe("110px 50px"); expect(motor.style.rotate).toBe("30deg");
    expect(motor.style.getPropertyValue("transition-property")).toBe("");
    expect(useEditorStore.getState().history).toHaveLength(1);
    const count = styles().length; await flush(); expect(styles()).toHaveLength(count);
    await act(async () => { await useEditorStore.getState().undo(); });
    expect(useEditorStore.getState().document?.source).toBe(original);
  });
  it.each(["pointercancel", "Escape", "blur", "navigate"])("cancels a handle gesture on %s without writing the source", async (reason) => {
    await act(async () => { pointer(handle(), "pointerdown", 40, 50); pointer(window, "pointermove", 90, 80); });
    await flush(); expect(motor.style.translate).toBe("50px 30px");
    await act(async () => {
      if (reason === "pointercancel") pointer(window, reason, 90, 80);
      else if (reason === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      else if (reason === "navigate") useEditorStore.getState().setInteractionMode("navigate");
      else window.dispatchEvent(new Event("blur"));
    });
    await flush();
    expect(motor.style.translate).toBe(""); expect(motor.style.rotate).toBe("30deg");
    expect(motor.style.getPropertyValue("transition-property")).toBe("");
    expect(useEditorStore.getState().document?.source).toBe(original);
    expect(useEditorStore.getState().history).toEqual([]); expect(desktop.writeFile).not.toHaveBeenCalled();
  });
  it("also batches resizing and keeps the existing angle", async () => {
    const resize = host.querySelector<HTMLButtonElement>('[aria-label="Ridimensiona e"]')!;
    await act(async () => { pointer(resize, "pointerdown", 140, 50); for (let x = 141; x <= 162; x++) pointer(window, "pointermove", x, 50); });
    expect(styles()).toHaveLength(0);
    await flush(); expect(styles()).toHaveLength(1); expect(motor.style.scale).toBe("1.2 1");
    await act(async () => pointer(window, "pointerup", 162, 50));
    await act(async () => { await vi.waitFor(() => expect(useEditorStore.getState().document?.source).toContain('scale: "1.2 1"')); });
    expect(motor.style.rotate).toBe("30deg"); expect(useEditorStore.getState().history).toHaveLength(1);
  });
  it("keeps drag distance correct at half-size canvas zoom", async () => {
    await act(async () => useEditorStore.getState().setZoom(0.5));
    await act(async () => { pointer(handle(), "pointerdown", 40, 50); pointer(window, "pointermove", 80, 60); });
    await flush();
    expect(motor.style.translate).toBe("80px 20px");
    await act(async () => pointer(window, "pointerup", 80, 60));
    await act(async () => { await vi.waitFor(() => expect(useEditorStore.getState().document?.source).toContain('translate: "80px 20px"')); });
  });
  it("stops an old handle session when another component is selected", async () => {
    await act(async () => { pointer(handle(), "pointerdown", 40, 50); pointer(window, "pointermove", 90, 80); });
    await flush();
    const frame = preview!.window;
    const label = frame.document.createElement("span");
    label.textContent = "M2400";
    label.setAttribute("data-fc-source", JSON.stringify({ file: "C:/panel/Label.tsx", start: 0, end: 10, line: 1, column: 0 }));
    frame.document.body.append(label);
    desktop.readFile.mockResolvedValue('export const Label = () => <span>M2400</span>;');
    await act(async () => { label.click(); pointer(window, "pointerup", 150, 100); });
    await flush();
    expect(motor.style.translate).toBe("");
    expect(desktop.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().history).toEqual([]);
  });
});
