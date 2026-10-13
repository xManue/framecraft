// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error the plugin is shipped as plain ESM.
import framecraftPlugin, { installStandalonePreviewControls } from "../scripts/framecraft-vite-plugin.mjs";

const token = "01234567-89ab-4cde-8012-34567890abcd";
let iframe: HTMLIFrameElement, view: Window, dispose: (() => void) | undefined;
beforeEach(() => {
  iframe = document.createElement("iframe"); iframe.name = `framecraft:standalone:${token}`; document.body.append(iframe);
  view = iframe.contentWindow!; view.name = iframe.name;
});
afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks(); iframe.remove(); });
function connect(origin = "http://localhost:1420", source: Window | null = view.parent, value = token) {
  view.dispatchEvent(new MessageEvent("message", { source, origin, data: { type: "framecraft:standalone-connect", token: value } }));
}
function escape(init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...init });
  view.document.body.dispatchEvent(event); return event;
}

describe("ritorno all’editor dall’iframe di Prova pannello", () => {
  it("inoltra soltanto Esc alla finestra padre verificata, non i comandi dell’editor", () => {
    const post = vi.spyOn(view.parent, "postMessage").mockImplementation(() => {});
    dispose = installStandalonePreviewControls(view);
    expect(escape().defaultPrevented).toBe(false); expect(post).not.toHaveBeenCalled();
    connect(); expect(escape().defaultPrevented).toBe(true);
    expect(post).toHaveBeenCalledExactlyOnceWith({ type: "framecraft:standalone-close", token }, "http://localhost:1420");
    post.mockClear(); view.document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
    expect(post).not.toHaveBeenCalled(); expect((view as unknown as Record<string, unknown>).__framecraftEditorPreview).toBeUndefined();
  });
  it("rifiuta connessioni di altre finestre, token e origini opache", () => {
    const post = vi.spyOn(view.parent, "postMessage").mockImplementation(() => {}); dispose = installStandalonePreviewControls(view);
    connect("http://localhost:1420", null); connect("http://localhost:1420", view); connect("http://localhost:1420", view.parent, "old-token"); connect("null");
    escape(); expect(post).not.toHaveBeenCalled();
    connect(); connect("https://untrusted.invalid"); escape();
    expect(post).toHaveBeenLastCalledWith({ type: "framecraft:standalone-close", token }, "http://localhost:1420");
  });
  it("non intercetta composizione e ripetizione e rimuove i listener alla chiusura", () => {
    const post = vi.spyOn(view.parent, "postMessage").mockImplementation(() => {}); dispose = installStandalonePreviewControls(view); connect();
    escape({ isComposing: true }); escape({ repeat: true }); expect(post).not.toHaveBeenCalled();
    dispose!(); escape(); expect(post).not.toHaveBeenCalled();
  });
  it("la sorgente realmente iniettata riconosce la prova dopo un cambio pagina senza query", () => {
    const post = vi.spyOn(view.parent, "postMessage").mockImplementation(() => {});
    const source = framecraftPlugin().transformIndexHtml("<main></main>").tags[0].children;
    expect(view.location.search).toBe("");
    vi.stubGlobal("window", view); new Function(source)(); vi.unstubAllGlobals();
    connect(); escape(); expect(post).toHaveBeenCalledExactlyOnceWith({ type: "framecraft:standalone-close", token }, "http://localhost:1420");
    expect((view as unknown as Record<string, unknown>).__framecraftEditorPreview).toBeUndefined();
    view.dispatchEvent(new Event("pagehide")); post.mockClear(); escape(); expect(post).not.toHaveBeenCalled();
  });
});
