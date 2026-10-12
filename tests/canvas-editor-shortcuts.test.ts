// @vitest-environment jsdom
import { createRequire } from "node:module";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultEditorShortcuts } from "../scripts/editor-shortcuts.mjs";
// @ts-expect-error The real plugin is plain ESM.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";
import { Canvas } from "../src/canvas/Canvas";
import { useEditorStore } from "../src/state/editorStore";
import { useEditorShortcuts } from "../src/state/editorShortcuts";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, options: { url: string; runScripts: string }) => { window: Window & typeof globalThis & { close(): void } } };
const initial = useEditorStore.getState(), panelOrigin = "http://127.0.0.1:4173", parentOrigin = "http://localhost:1420";
let root: Root, host: HTMLDivElement, browser: InstanceType<typeof JSDOM>, frame: Window & typeof globalThis, sent: Record<string, any>[], save: ReturnType<typeof vi.fn<() => Promise<void>>>;
async function flush() { await act(async () => { await vi.advanceTimersByTimeAsync(40); }); }
const pageId = () => sent.find(message => message.type === "framecraft:set-shortcuts")!.pageId;
const deliver = (data: Record<string, unknown>, origin = panelOrigin) => window.dispatchEvent(new MessageEvent("message", { data, source: frame, origin }));
beforeEach(async () => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  useEditorShortcuts.setState({ bindings: defaultEditorShortcuts(), open: false });
  save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  useEditorStore.setState({ ...initial, project: { root: "C:/panel" } as never, document: { file: "C:/panel/Page.jsx", source: "draft", roots: [], nodes: {}, version: 1 }, save,
    loading: false, exporting: false, reloadRecovery: undefined, interactionMode: "edit", selectedId: undefined, selectionRect: undefined, multiSelection: [], highlightPicker: undefined, zonePicking: undefined, pages: [],
    previewUrl: panelOrigin, previewPath: "/", previewStatus: "ready", previewProcessExited: false, simulation: { on: false, values: {}, status: {}, elements: [], unresolved: [] } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(StrictMode, null, createElement(Canvas))));
  browser = new JSDOM("<!doctype html><html><body>Page</body></html>", { url: panelOrigin, runScripts: "outside-only" }); frame = browser.window; sent = [];
  const iframe = host.querySelector("iframe")!;
  Object.defineProperty(iframe, "contentWindow", { configurable: true, value: frame });
  Object.defineProperty(iframe, "contentDocument", { configurable: true, get() { throw new DOMException("Cross origin", "SecurityError"); } });
  Object.defineProperty(frame, "parent", { configurable: true, value: window });
  Object.assign(frame, { ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
  vi.spyOn(window, "postMessage").mockImplementation((data: Record<string, unknown>) => queueMicrotask(() => deliver(data)));
  frame.postMessage = ((data: Record<string, any>, origin: string) => {
    sent.push({ ...data, targetOrigin: origin }); if (origin !== "*" && origin !== panelOrigin) return;
    queueMicrotask(() => frame.dispatchEvent(new frame.MessageEvent("message", { data, source: window, origin: parentOrigin })));
  }) as typeof frame.postMessage;
  await act(async () => frame.eval(framecraftPlugin().transformIndexHtml("<main></main>").tags[0].children)); await flush();
});
afterEach(async () => { await act(async () => root.unmount()); browser?.window.close(); host.remove(); useEditorStore.setState(initial, true); useEditorShortcuts.setState({ bindings: defaultEditorShortcuts(), open: false }); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("scorciatoie dal canvas con ponte reale cross-origin", () => {
  it("sincronizza le preferenze a ready e le applica senza riavviare la pagina", async () => {
    expect(sent.find(message => message.type === "framecraft:set-shortcuts")).toMatchObject({ bindings: defaultEditorShortcuts(), targetOrigin: panelOrigin });
    await act(async () => { useEditorShortcuts.getState().apply({ ...defaultEditorShortcuts(), save: ["Mod+Alt+S"] }); }); await flush();
    await act(async () => frame.document.body.dispatchEvent(new frame.KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }))); await flush(); expect(save).not.toHaveBeenCalled();
    await act(async () => frame.document.body.dispatchEvent(new frame.KeyboardEvent("keydown", { key: "s", ctrlKey: true, altKey: true, bubbles: true, cancelable: true }))); await flush(); expect(save).toHaveBeenCalledOnce();
  });
  it("rifiuta comandi obsoleti o contraffatti e non agisce dietro una finestra aperta", async () => {
    const command = { type: "framecraft:shortcut", key: "s", shift: false, command: "save", shortcut: "Mod+S", pageId: pageId() };
    await act(async () => { deliver(command, "https://untrusted.invalid"); deliver({ ...command, pageId: "old-page" }); deliver({ ...command, shortcut: "Mod+D" }); deliver({ type: "framecraft:shortcut", key: "s", shift: false }); deliver({ type: "framecraft:shortcut", key: 42, shift: false }); }); await flush(); expect(save).not.toHaveBeenCalled();
    const modal = document.createElement("div"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); document.body.append(modal);
    await act(async () => deliver(command)); await flush(); expect(save).not.toHaveBeenCalled(); modal.remove();
    await act(async () => deliver(command)); await flush(); expect(save).toHaveBeenCalledOnce();
  });
  it("conserva le preferenze quando il ponte ruota il token al cambio pagina", async () => {
    await act(async () => { useEditorShortcuts.getState().apply({ ...defaultEditorShortcuts(), diagnostics: ["Mod+Alt+L"] }); }); await flush();
    const old = pageId(); await act(async () => Object.assign(frame, { __framecraftCurrentPage: "settings" })); await act(async () => { await vi.advanceTimersByTimeAsync(160); });
    const newest = sent.filter(message => message.type === "framecraft:set-shortcuts").at(-1)!;
    expect(newest.pageId).not.toBe(old); expect(newest.bindings.diagnostics).toEqual(["Mod+Alt+L"]);
    await act(async () => frame.document.body.dispatchEvent(new frame.KeyboardEvent("keydown", { key: "l", ctrlKey: true, altKey: true, bubbles: true, cancelable: true }))); await flush();
    expect(useEditorStore.getState().consoleOpen).toBe(true);
  });
});
