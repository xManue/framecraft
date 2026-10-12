// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// The preview plugin is shipped as plain ESM so imported projects do not need TypeScript.
// @ts-expect-error no declaration is required for the runtime plugin.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";
import { defaultEditorShortcuts } from "../scripts/editor-shortcuts.mjs";

const posted: Record<string, unknown>[] = [];
let pageId: string;

/** The bridge attaches its listeners to the document and never detaches them, exactly as it does in
 * a real preview, so it is installed once for the whole file rather than per test. */
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // jsdom makes window.parent the window itself, so the bridge's own channel is the one to watch.
  window.postMessage = ((message: Record<string, unknown>) => { posted.push(message); }) as typeof window.postMessage;
  const source = framecraftPlugin().transformIndexHtml("<div id=\"root\"></div>").tags[0].children;
  new Function(source)();
  pageId = posted.find(message => message.type === "framecraft:ready")!.alarmPreviewPageId as string;
});

function shortcuts() {
  return posted.filter((message) => message.type === "framecraft:shortcut").map(({ type, key, shift }) => ({ type, key, shift }));
}
function configure(bindings = defaultEditorShortcuts(), origin = "http://localhost:1420", source: Window = window, token = pageId) {
  window.dispatchEvent(new MessageEvent("message", { data: { type: "framecraft:set-shortcuts", bindings, pageId: token }, origin, source }));
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
}

describe("shortcuts pressed inside the preview", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    posted.length = 0;
    configure(); window.dispatchEvent(new MessageEvent("message", { data: { type: "framecraft:set-mode", mode: "edit" } }));
    posted.length = 0;
  });

  it("forwards undo, redo, save and duplicate to the editor shell", () => {
    // A key pressed in the preview iframe never reaches the editor window, so without forwarding
    // undo, redo and save are dead for as long as the canvas has focus.
    press(document.body, "z", { ctrlKey: true });
    press(document.body, "z", { ctrlKey: true, shiftKey: true });
    press(document.body, "y", { ctrlKey: true });
    press(document.body, "s", { ctrlKey: true });
    press(document.body, "d", { ctrlKey: true });

    expect(shortcuts()).toEqual([
      { type: "framecraft:shortcut", key: "z", shift: false },
      { type: "framecraft:shortcut", key: "z", shift: true },
      { type: "framecraft:shortcut", key: "y", shift: false },
      { type: "framecraft:shortcut", key: "s", shift: false },
      { type: "framecraft:shortcut", key: "d", shift: false },
    ]);
  });

  it("leaves undo alone while the user is typing in the previewed app", () => {
    const input = document.createElement("input");
    document.body.append(input);

    press(input, "z", { ctrlKey: true });
    // Saving is still worth forwarding: it is what the user means everywhere in the editor.
    press(input, "s", { ctrlKey: true });

    expect(shortcuts()).toEqual([{ type: "framecraft:shortcut", key: "s", shift: false }]);
  });

  it("names the element Delete is meant for instead of sending a bare command", () => {
    // A bare command deletes whatever the editor believes is selected, which is a step behind after
    // a click. Naming the element is what makes Canc land on the copy the user is looking at.
    const source = { file: "Page.jsx", start: 10, end: 40, line: 2, column: 3 };
    const element = document.createElement("div");
    element.setAttribute("data-fc-source", JSON.stringify(source));
    element.setAttribute("data-fc-index", "3");
    document.body.append(element);

    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    press(document.body, "Delete");

    expect(shortcuts()).toEqual([]);
    const deletion = posted.find((message) => message.type === "framecraft:delete");
    expect(deletion).toMatchObject({ source, info: { listIndex: 3, instanceCount: 1 } });
  });

  it("falls back to the plain command when the preview has no selection of its own", () => {
    press(document.body, "Delete");

    expect(shortcuts()).toEqual([{ type: "framecraft:shortcut", key: "delete", shift: false }]);
    expect(posted.some((message) => message.type === "framecraft:delete")).toBe(false);
  });

  it("usa combinazioni personalizzate e disattiva subito i vecchi tasti", () => {
    configure({ ...defaultEditorShortcuts(), save: ["Mod+Alt+S"], undo: [] });
    press(document.body, "s", { ctrlKey: true }); press(document.body, "z", { ctrlKey: true });
    expect(shortcuts()).toEqual([]);
    press(document.body, "s", { ctrlKey: true, altKey: true });
    expect(posted.find(message => message.type === "framecraft:shortcut")).toMatchObject({ command: "save", shortcut: "Mod+Alt+S", pageId, editing: false });
  });

  it("la cancellazione personalizzata nomina ancora la copia selezionata", () => {
    configure({ ...defaultEditorShortcuts(), delete: ["Mod+Alt+D"] });
    const source = { file: "Page.jsx", start: 10, end: 40, line: 2, column: 3 };
    const element = document.createElement("button"); element.dataset.fcSource = JSON.stringify(source); document.body.append(element);
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    press(document.body, "Delete"); expect(posted.some(message => message.type === "framecraft:delete")).toBe(false);
    press(document.body, "d", { ctrlKey: true, altKey: true });
    expect(posted.find(message => message.type === "framecraft:delete")).toMatchObject({ source, shortcut: "Mod+Alt+D", pageId });
  });

  it("rifiuta preferenze da origini, finestre e pagine estranee", () => {
    const custom = { ...defaultEditorShortcuts(), save: [] };
    configure(custom, "https://untrusted.invalid"); configure(custom, "http://localhost:1420", window, "old-page");
    window.dispatchEvent(new MessageEvent("message", { data: { type: "framecraft:set-shortcuts", bindings: custom, pageId }, source: null, origin: "http://localhost:1420" }));
    press(document.body, "s", { ctrlKey: true }); expect(shortcuts()).toHaveLength(1);
  });

  it("non invia eliminazione/undo in Usa e lascia i campi, la composizione e i tasti ripetuti", () => {
    window.dispatchEvent(new MessageEvent("message", { data: { type: "framecraft:set-mode", mode: "navigate" } }));
    press(document.body, "Delete"); press(document.body, "z", { ctrlKey: true }); expect(shortcuts()).toEqual([]);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "framecraft:set-mode", mode: "edit" } }));
    const select = document.createElement("select"); document.body.append(select); press(select, "Delete"); press(select, "z", { ctrlKey: true });
    press(document.body, "s", { ctrlKey: true, isComposing: true }); press(document.body, "s", { ctrlKey: true, repeat: true });
    expect(shortcuts()).toEqual([]);
  });
});
