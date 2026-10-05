// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// The preview plugin is shipped as plain ESM so imported projects do not need TypeScript.
// @ts-expect-error no declaration is required for the runtime plugin.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

const posted: Record<string, unknown>[] = [];

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
});

function shortcuts() {
  return posted.filter((message) => message.type === "framecraft:shortcut");
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
}

describe("shortcuts pressed inside the preview", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
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
});
