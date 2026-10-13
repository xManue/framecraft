// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ desktop: true, isFullscreen: vi.fn(), setFullscreen: vi.fn() }));
vi.mock("@tauri-apps/api/core", async importOriginal => ({
  ...await importOriginal<typeof import("@tauri-apps/api/core")>(), isTauri: () => native.desktop,
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => native }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: {} }));
import { createPreviewFullscreenController, previewFullscreenController } from "../src/preview/previewFullscreen";
import { StandalonePreview } from "../src/preview/StandalonePreview";
import { useEditorStore } from "../src/state/editorStore";
import { installEditorKeyboardShortcuts } from "../src/core/editorCommands";

const initial = useEditorStore.getState();
let root: Root | undefined;
let container: HTMLDivElement;
const next = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(async () => {
  useEditorStore.getState().closeStandalonePreview(); await next();
  native.desktop = true; native.isFullscreen.mockReset().mockResolvedValue(false); native.setFullscreen.mockReset().mockResolvedValue(undefined);
  useEditorStore.setState({ ...initial, previewUrl: "http://localhost:4173", previewPath: "/main", loading: false, consoleEntries: [] }, true);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  container = document.createElement("div"); document.body.append(container);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount()); root = undefined;
  useEditorStore.getState().closeStandalonePreview(); await next();
  useEditorStore.setState(initial, true); container.remove(); vi.restoreAllMocks();
});
async function mount() {
  root = createRoot(container);
  await act(async () => { await useEditorStore.getState().openStandalonePreview(); root!.render(createElement(StrictMode, null, createElement(StandalonePreview))); });
  return container.querySelector("iframe")!;
}

describe("schermo intero della prova", () => {
  it("richiede lo schermo intero browser nel click, prima di qualsiasi await", async () => {
    const enter = vi.fn().mockResolvedValue(undefined), exit = vi.fn().mockResolvedValue(undefined);
    const controller = createPreviewFullscreenController({ isFullscreen: () => false, enter, exit });
    const session = controller.begin();
    expect(enter).toHaveBeenCalledTimes(1);
    await session.ready; await session.release(); await session.release();
    expect(exit).toHaveBeenCalledTimes(1);
  });
  it("ripristina soltanto lo schermo intero che ha attivato lei", async () => {
    const enter = vi.fn(), exit = vi.fn();
    const controller = createPreviewFullscreenController({ isFullscreen: async () => true, enter, exit });
    const session = controller.begin(); await session.ready; await session.release();
    expect(enter).not.toHaveBeenCalled(); expect(exit).not.toHaveBeenCalled();
  });
  it("annulla un ingresso ancora in verifica senza attivare la finestra dopo la chiusura", async () => {
    const pending = deferred(), enter = vi.fn(), exit = vi.fn();
    const controller = createPreviewFullscreenController({ isFullscreen: () => pending.promise.then(() => false), enter, exit });
    const session = controller.begin(), released = session.release(); pending.resolve();
    await session.ready; await released; expect(enter).not.toHaveBeenCalled(); expect(exit).not.toHaveBeenCalled();
  });
  it("serializza una riapertura mentre l’ingresso precedente è ancora pendente", async () => {
    const first = deferred(); let active = false, count = 0;
    const events: string[] = [];
    const controller = createPreviewFullscreenController({ isFullscreen: () => active,
      enter: async () => { events.push("enter"); if (++count === 1) await first.promise; active = true; },
      exit: () => { events.push("exit"); active = false; },
    });
    const a = controller.begin(), released = a.release(), b = controller.begin(); first.resolve();
    await a.ready; await released; await b.ready; expect(events).toEqual(["enter", "exit", "enter"]); expect(active).toBe(true);
    await b.release(); expect(active).toBe(false);
  });
  it("un errore d’ingresso non blocca il tentativo successivo", async () => {
    const enter = vi.fn().mockRejectedValueOnce(new Error("not allowed")).mockResolvedValue(undefined), exit = vi.fn();
    const controller = createPreviewFullscreenController({ isFullscreen: () => false, enter, exit });
    const a = controller.begin(); await expect(a.ready).rejects.toThrow("not allowed"); await a.release();
    const b = controller.begin(); await b.ready; await b.release(); expect(exit).toHaveBeenCalledTimes(1);
  });
  it("sceglie la API browser e non esce da uno schermo intero di un altro elemento", async () => {
    native.desktop = false;
    const request = vi.fn().mockResolvedValue(undefined), exit = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: request });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    const session = previewFullscreenController().begin(); expect(request).toHaveBeenCalledTimes(1); await session.ready;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.createElement("div") });
    await session.release(); expect(exit).not.toHaveBeenCalled();
    delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
    delete (document as unknown as Record<string, unknown>).exitFullscreen;
  });
  it("apre la finestra desktop in schermo intero e la ripristina al ritorno", async () => {
    await useEditorStore.getState().openStandalonePreview(); expect(native.setFullscreen).toHaveBeenCalledExactlyOnceWith(true);
    expect(useEditorStore.getState().standalonePreviewOpen).toBe(true);
    useEditorStore.getState().closeStandalonePreview(); await next(); expect(native.setFullscreen.mock.calls).toEqual([[true], [false]]);
  });
  it("non duplica l’ingresso e ripristina anche se il progetto viene chiuso", async () => {
    await useEditorStore.getState().openStandalonePreview(); await useEditorStore.getState().openStandalonePreview();
    expect(native.setFullscreen).toHaveBeenCalledTimes(1);
    useEditorStore.setState({ standalonePreviewOpen: false, project: undefined }); await next();
    expect(native.setFullscreen.mock.calls).toEqual([[true], [false]]);
  });
  it("non apre o modifica la finestra senza un’anteprima disponibile", async () => {
    useEditorStore.setState({ previewUrl: undefined }); await useEditorStore.getState().openStandalonePreview();
    expect(native.isFullscreen).not.toHaveBeenCalled(); expect(useEditorStore.getState().standalonePreviewOpen).toBe(false);
  });
  it("lascia la prova disponibile se lo schermo intero fallisce e offre Riprova senza ricaricare il pannello", async () => {
    native.setFullscreen.mockRejectedValueOnce(new Error("set_fullscreen not allowed"));
    const iframe = await mount();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Schermo intero");
    expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("not allowed");
    const retry = [...container.querySelectorAll("button")].find(button => button.textContent === " Schermo intero")!;
    await act(async () => { retry.click(); await next(); });
    expect(container.querySelector("iframe")).toBe(iframe); expect(container.querySelector('[role="status"]')).toBeNull();
    expect(native.setFullscreen.mock.calls).toEqual([[true], [true]]);
  });
  it("collega l’iframe solo alla sua origine e accetta Esc solo dalla prova attiva", async () => {
    const iframe = await mount(), token = iframe.name.split(":").at(-1)!;
    const post = vi.spyOn(iframe.contentWindow!, "postMessage");
    await act(async () => iframe.dispatchEvent(new Event("load")));
    expect(post).toHaveBeenCalledExactlyOnceWith({ type: "framecraft:standalone-connect", token }, "http://localhost:4173");
    const send = (source: Window | null, origin: string, value = token) => window.dispatchEvent(new MessageEvent("message", { source, origin,
      data: { type: "framecraft:standalone-close", token: value } }));
    await act(async () => { send(window, "http://localhost:4173"); send(iframe.contentWindow, "https://untrusted.invalid"); send(iframe.contentWindow, "http://localhost:4173", "old-session"); });
    expect(useEditorStore.getState().standalonePreviewOpen).toBe(true);
    await act(async () => send(iframe.contentWindow, "http://localhost:4173")); await next();
    expect(useEditorStore.getState().standalonePreviewOpen).toBe(false); expect(native.setFullscreen).toHaveBeenLastCalledWith(false);
  });
  it("Esc nella finestra dell’editor e il pulsante di ritorno chiudono la prova", async () => {
    await mount();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(useEditorStore.getState().standalonePreviewOpen).toBe(false);
    await act(async () => useEditorStore.getState().openStandalonePreview());
    await act(async () => container.querySelector("button")!.click()); expect(useEditorStore.getState().standalonePreviewOpen).toBe(false);
  });
  it("Esc del browser chiude la prova quando termina il vero schermo intero", async () => {
    await mount();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement });
    await act(async () => document.dispatchEvent(new Event("fullscreenchange")));
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    await act(async () => document.dispatchEvent(new Event("fullscreenchange")));
    expect(useEditorStore.getState().standalonePreviewOpen).toBe(false);
  });
  it("non chiude una riapertura per l’evento fullscreenchange della vecchia prova", async () => {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement }); await mount();
    useEditorStore.setState({ standalonePreviewFullscreenReady: false });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    await act(async () => document.dispatchEvent(new Event("fullscreenchange")));
    expect(useEditorStore.getState().standalonePreviewOpen).toBe(true);
  });
  it("non invia le scorciatoie di modifica mentre si prova il pannello", async () => {
    await useEditorStore.getState().openStandalonePreview(); const save = vi.spyOn(useEditorStore.getState(), "save").mockResolvedValue(undefined), dispose = installEditorKeyboardShortcuts();
    try { window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true })); expect(save).not.toHaveBeenCalled(); }
    finally { dispose(); }
  });
  it("mantiene il focus nella prova e lo restituisce al comando originale alla chiusura", async () => {
    const opener = document.createElement("button"); document.body.append(opener); opener.focus();
    await mount(); expect(document.activeElement).toBe(container.querySelector("button"));
    await act(async () => opener.focus()); expect(document.activeElement).toBe(container.querySelector("button"));
    await act(async () => root!.unmount()); root = undefined;
    expect(document.activeElement).toBe(opener); opener.remove();
  });
  it("autorizza soltanto lo schermo intero della finestra locale main, non il pannello remoto", () => {
    const capability = JSON.parse(readFileSync(resolve("src-tauri/capabilities/default.json"), "utf8"));
    expect(capability.windows).toEqual(["main"]); expect(capability.remote).toBeUndefined();
    expect(capability.permissions).toEqual(["core:default", "core:window:allow-set-fullscreen", "dialog:allow-open"]);
  });
});
