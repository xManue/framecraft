import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error jsdom is already provided by the test environment without declaration files.
import { JSDOM } from "jsdom";
// @ts-expect-error The preview plugin is shipped as plain ESM to imported projects.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

interface Source {
  file: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

interface BridgeMessage {
  type: string;
  selectionProtocol?: number;
  selectionVersion?: number;
  requestId?: number;
  translate?: string;
  source?: Source;
  instanceId?: string;
  info?: { instanceIndex: number; instanceCount: number; listIndex?: number; text?: string };
  items?: BridgeMessage[];
}

const sourceAt = (start: number): Source => ({ file: "C:/project/src/App.tsx", start, end: start + 15, line: 1, column: start });
const windows: Array<{ close(): void }> = [];

afterEach(async () => {
  await Promise.resolve();
  for (const current of windows.splice(0)) current.close();
});

function createPreview(sources = [sourceAt(10), sourceAt(40), sourceAt(70)]) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "http://localhost:4173/synoptic.html",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const current = dom.window as Window & typeof globalThis;
  windows.push(dom.window);
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  Object.defineProperty(current, "ResizeObserver", { configurable: true, value: ResizeObserverStub });
  const messages: BridgeMessage[] = [];
  Object.defineProperty(current, "parent", {
    configurable: true,
    value: { postMessage: (message: BridgeMessage) => messages.push(message) },
  });
  const elements = sources.map((source, index) => {
    const element = current.document.createElement(index === 0 ? "span" : "button");
    element.textContent = index === 0 ? "M2400" : `Pulsante ${index}`;
    element.setAttribute("data-fc-source", JSON.stringify(source));
    Object.defineProperty(element, "getBoundingClientRect", {
      value: () => ({ x: index * 130, y: 20, left: index * 130, top: 20, right: index * 130 + 110, bottom: 64, width: 110, height: 44 }),
    });
    current.document.body.append(element);
    return element;
  });
  const script = framecraftPlugin().transformIndexHtml('<div id="root"></div>').tags[0].children;
  current.eval(script);
  const send = (data: Record<string, unknown>) => current.dispatchEvent(new current.MessageEvent("message", { data }));
  const click = (index: number) => {
    elements[index].dispatchEvent(new current.MouseEvent("click", { bubbles: true, cancelable: true }));
    return latest("framecraft:select");
  };
  const latest = (type: string) => {
    const message = [...messages].reverse().find((candidate) => candidate.type === type);
    if (!message) throw new Error(`Missing bridge message: ${type}`);
    return message;
  };
  const request = (selection: BridgeMessage, requestId = 1, overrides: Record<string, unknown> = {}) => send({
    type: "framecraft:request-selection",
    source: selection.source,
    instanceId: selection.instanceId,
    info: selection.info,
    selectionVersion: selection.selectionVersion,
    requestId,
    ...overrides,
  });
  const deleteKey = () => current.document.dispatchEvent(new current.KeyboardEvent("keydown", {
    key: "Delete", code: "Delete", bubbles: true, cancelable: true,
  }));
  const groupClick = (index: number) => elements[index].dispatchEvent(new current.MouseEvent("pointerdown", {
    bubbles: true, cancelable: true, button: 0, ctrlKey: true,
  }));
  return { current, messages, elements, send, click, latest, request, deleteKey, groupClick };
}

describe("preview selection protocol", () => {
  it("advertises protocol 2 and separates a real click from repeated selection acknowledgements", async () => {
    const preview = createPreview();
    expect(preview.latest("framecraft:ready")).toMatchObject({ selectionProtocol: 2, selectionVersion: 0 });
    const selected = preview.click(0);
    expect(selected).toMatchObject({ source: sourceAt(10), selectionVersion: 1 });
    for (const requestId of [1, 2, 3]) {
      preview.request(selected, requestId);
      expect(preview.latest("framecraft:selection-response")).toMatchObject({
        requestId, selectionVersion: 1, source: selected.source, instanceId: selected.instanceId,
      });
    }
    expect(preview.messages.filter((message) => message.type === "framecraft:select")).toHaveLength(1);
    expect(preview.messages.filter((message) => message.type === "framecraft:selection-response")).toHaveLength(3);
    preview.current.history.pushState({}, "", "/settings.html");
    await Promise.resolve();
    expect(preview.latest("framecraft:ready")).toMatchObject({ selectionProtocol: 2, selectionVersion: 1 });
  });

  it("ignores an obsolete request after a newer click and keeps Delete on the new component", () => {
    const preview = createPreview();
    const label = preview.click(0);
    const button = preview.click(1);
    expect(button.selectionVersion).toBe(2);
    for (let requestId = 1; requestId <= 20; requestId++) preview.request(label, requestId);
    expect(preview.messages.some((message) => message.type === "framecraft:selection-response")).toBe(false);
    expect(preview.messages.filter((message) => message.type === "framecraft:select")).toHaveLength(2);
    preview.deleteKey();
    expect(preview.latest("framecraft:delete")).toMatchObject({ source: button.source, instanceId: button.instanceId });
  });

  it("requires a positive safe request ID and an exact current selection version", () => {
    const preview = createPreview();
    const selected = preview.click(0);
    for (const requestId of [undefined, 0, -1, 1.25, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1"]) {
      preview.request(selected, 1, { requestId });
    }
    for (const selectionVersion of [undefined, 0, 2, "1", Number.NaN]) {
      preview.request(selected, 1, { selectionVersion });
    }
    expect(preview.messages.some((message) => message.type === "framecraft:selection-response")).toBe(false);
    preview.request(selected, Number.MAX_SAFE_INTEGER);
    expect(preview.latest("framecraft:selection-response")).toMatchObject({ requestId: Number.MAX_SAFE_INTEGER, selectionVersion: 1 });
  });

  it("refreshes the clicked repeated JSX instance rather than selecting the first copy", () => {
    const repeated = sourceAt(10);
    const preview = createPreview([repeated, repeated, repeated]);
    const selected = preview.click(1);
    expect(selected.info).toMatchObject({ instanceIndex: 1, instanceCount: 3, text: "Pulsante 1" });
    preview.request(selected, 11);
    const response = preview.latest("framecraft:selection-response");
    expect(response).toMatchObject({ instanceId: selected.instanceId, requestId: 11, selectionVersion: selected.selectionVersion });
    expect(response.info).toMatchObject({ instanceIndex: 1, instanceCount: 3, text: "Pulsante 1" });
    preview.deleteKey();
    expect(preview.latest("framecraft:delete")).toMatchObject({ instanceId: selected.instanceId, info: { instanceIndex: 1, instanceCount: 3 } });
  });

  it("resolves a repeated instance by its saved instance index when the old instance ID is unavailable", () => {
    const repeated = sourceAt(10);
    const preview = createPreview([repeated, repeated, repeated]);
    const selected = preview.click(2);
    preview.request(selected, 12, { instanceId: "fc-instance-from-old-render" });
    expect(preview.latest("framecraft:selection-response")).toMatchObject({
      instanceId: selected.instanceId, requestId: 12, info: { instanceIndex: 2, instanceCount: 3, text: "Pulsante 2" },
    });
    preview.deleteKey();
    expect(preview.latest("framecraft:delete")).toMatchObject({ instanceId: selected.instanceId, info: { instanceIndex: 2 } });
  });

  it("does not clear a multiple selection when acknowledging its primary component", () => {
    const preview = createPreview();
    const primary = preview.click(0);
    preview.groupClick(1);
    const group = preview.latest("framecraft:select-many");
    expect(group).toMatchObject({ selectionVersion: 2 });
    expect(group.items).toHaveLength(2);
    const groupMessageCount = preview.messages.filter((message) => message.type === "framecraft:select-many").length;
    preview.request(primary, 13, { selectionVersion: group.selectionVersion });
    expect(preview.latest("framecraft:selection-response")).toMatchObject({ instanceId: primary.instanceId, requestId: 13, selectionVersion: 2 });
    expect(preview.messages.filter((message) => message.type === "framecraft:select-many")).toHaveLength(groupMessageCount);
    preview.groupClick(2);
    expect(preview.latest("framecraft:select-many")).toMatchObject({ selectionVersion: 3 });
    expect(preview.latest("framecraft:select-many").items).toHaveLength(3);
  });

  it("invalidates requests created before a group-selection gesture", () => {
    const preview = createPreview();
    const selected = preview.click(0);
    preview.groupClick(1);
    preview.request(selected, 14);
    expect(preview.messages.some((message) => message.type === "framecraft:selection-response")).toBe(false);
    preview.groupClick(2);
    expect(preview.latest("framecraft:select-many").items).toHaveLength(3);
  });

  it("ignores selection requests in navigation mode and accepts them again in edit mode", () => {
    const preview = createPreview();
    const selected = preview.click(0);
    preview.send({ type: "framecraft:set-mode", mode: "navigate" });
    preview.request(selected, 15);
    preview.elements[1].dispatchEvent(new preview.current.MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(preview.messages.some((message) => message.type === "framecraft:selection-response")).toBe(false);
    expect(preview.messages.filter((message) => message.type === "framecraft:select")).toHaveLength(1);
    preview.send({ type: "framecraft:set-mode", mode: "edit" });
    preview.request(selected, 16);
    expect(preview.latest("framecraft:selection-response")).toMatchObject({ requestId: 16, selectionVersion: selected.selectionVersion });
  });

  it("cancels a pending arrow-key movement when the user selects another component", async () => {
    const preview = createPreview();
    preview.elements[0].style.translate = "7px 3px";
    const label = preview.click(0);
    preview.current.document.dispatchEvent(new preview.current.KeyboardEvent("keydown", {
      key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true,
    }));
    expect(preview.elements[0].style.translate).toBe("8px 3px");
    expect(preview.latest("framecraft:drag-move")).toMatchObject({ source: label.source, instanceId: label.instanceId });
    const button = preview.click(1);
    await new Promise((resolve) => preview.current.setTimeout(resolve, 350));
    expect(preview.messages.filter((message) => message.type === "framecraft:drag-end")).toHaveLength(0);
    expect(preview.elements[0].style.translate).toBe("7px 3px");
    preview.deleteKey();
    expect(preview.latest("framecraft:delete")).toMatchObject({ source: button.source, instanceId: button.instanceId });
  });

  it("cancels and rolls back a pending nudge when entering navigation mode", async () => {
    const preview = createPreview();
    preview.elements[0].style.translate = "7px 3px";
    preview.click(0);
    preview.current.document.dispatchEvent(new preview.current.KeyboardEvent("keydown", {
      key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true,
    }));
    expect(preview.elements[0].style.translate).toBe("8px 3px");
    preview.send({ type: "framecraft:set-mode", mode: "navigate" });
    await new Promise((resolve) => preview.current.setTimeout(resolve, 350));
    expect(preview.messages.filter((message) => message.type === "framecraft:drag-end")).toHaveLength(0);
    expect(preview.elements[0].style.translate).toBe("7px 3px");
    expect(preview.current.document.documentElement.dataset.framecraftMode).toBe("navigate");
  });

  it("cancels a pending nudge when the editor requests another component at the current version", async () => {
    const preview = createPreview();
    preview.elements[0].style.translate = "7px 3px";
    const label = preview.click(0);
    preview.current.document.dispatchEvent(new preview.current.KeyboardEvent("keydown", {
      key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true,
    }));
    expect(preview.elements[0].style.translate).toBe("8px 3px");
    preview.request(label, 17, { source: sourceAt(40), instanceId: undefined, info: undefined });
    const response = preview.latest("framecraft:selection-response");
    expect(response).toMatchObject({
      source: sourceAt(40), requestId: 17, selectionVersion: label.selectionVersion,
      info: { text: "Pulsante 1", instanceIndex: 0, instanceCount: 1 },
    });
    expect(preview.messages.filter((message) => message.type === "framecraft:select")).toHaveLength(1);
    await new Promise((resolve) => preview.current.setTimeout(resolve, 350));
    expect(preview.messages.filter((message) => message.type === "framecraft:drag-end")).toHaveLength(0);
    expect(preview.elements[0].style.translate).toBe("7px 3px");
    preview.deleteKey();
    expect(preview.latest("framecraft:delete")).toMatchObject({ source: response.source, instanceId: response.instanceId });
  });

  it("coalesces consecutive nudges on the same instance into one cumulative movement", async () => {
    const preview = createPreview();
    preview.elements[1].style.translate = "7px 3px";
    const selected = preview.click(1);
    preview.current.document.dispatchEvent(new preview.current.KeyboardEvent("keydown", {
      key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true,
    }));
    await new Promise((resolve) => preview.current.setTimeout(resolve, 30));
    preview.current.document.dispatchEvent(new preview.current.KeyboardEvent("keydown", {
      key: "ArrowRight", code: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true,
    }));
    expect(preview.elements[1].style.translate).toBe("18px 3px");
    await new Promise((resolve) => preview.current.setTimeout(resolve, 350));
    expect(preview.messages.filter((message) => message.type === "framecraft:drag-move")).toHaveLength(2);
    expect(preview.messages.filter((message) => message.type === "framecraft:drag-end")).toHaveLength(1);
    expect(preview.latest("framecraft:drag-end")).toMatchObject({ source: selected.source, instanceId: selected.instanceId, translate: "18px 3px" });
    expect(preview.elements[1].style.translate).toBe("18px 3px");
  });
});
