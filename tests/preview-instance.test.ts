// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
// The preview plugin is shipped as plain ESM so imported projects do not need TypeScript.
// @ts-expect-error no declaration is required for the runtime plugin.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

describe("preview rendered instance targeting", () => {
  it("applies handle preview styles to the clicked instance when JSX source is repeated", () => {
    class ResizeObserverStub {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);

    const messages: unknown[] = [];
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage: (message: unknown) => messages.push(message) },
    });

    const source = { file: "C:/project/src/App.tsx", start: 10, end: 40, line: 1, column: 10 };
    const containerSource = { file: "C:/project/src/App.tsx", start: 1, end: 80, line: 1, column: 1 };
    const main = document.createElement("main");
    const first = document.createElement("button");
    const second = document.createElement("button");
    main.setAttribute("data-fc-source", JSON.stringify(containerSource));
    first.setAttribute("data-fc-source", JSON.stringify(source));
    second.setAttribute("data-fc-source", JSON.stringify(source));
    main.append(first, second);
    document.body.append(main);

    const plugin = framecraftPlugin();
    const transformed = plugin.transformIndexHtml("<div id=\"root\"></div>");
    window.eval(transformed.tags[0].children);

    second.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const selection = messages.find((message): message is { type: string; instanceId: string } =>
      typeof message === "object" && message !== null && "type" in message && message.type === "framecraft:select");

    expect(selection?.instanceId).toBeTruthy();
    window.dispatchEvent(new MessageEvent("message", { data: {
      type: "framecraft:preview-style",
      source,
      instanceId: selection?.instanceId,
      styles: { translate: "24px 12px" },
    } }));

    expect(second.style.translate).toBe("24px 12px");
    expect(first.style.translate).toBe("");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", code: "Delete", bubbles: true, cancelable: true }));
    expect(messages.some((message) => typeof message === "object" && message !== null && "type" in message && message.type === "framecraft:delete")).toBe(true);

    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => second });
    Object.defineProperty(main, "getBoundingClientRect", { configurable: true, value: () => ({ left: 10, top: 20, right: 510, bottom: 420, width: 500, height: 400, x: 10, y: 20, toJSON: () => ({}) }) });
    window.dispatchEvent(new MessageEvent("message", { data: { type: "framecraft:drop-at-point", jsx: "<button>New</button>", x: 250, y: 180 } }));
    const drop = messages.find((message): message is { type: string; source: typeof containerSource; x: number; y: number } =>
      typeof message === "object" && message !== null && "type" in message && message.type === "framecraft:drop");
    expect(drop?.source).toEqual(containerSource);
    expect(drop?.x).toBe(240);
    expect(drop?.y).toBe(160);
  });
});
