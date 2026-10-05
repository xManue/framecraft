// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { readFile: vi.fn(), writeFile: vi.fn() },
}));

import { ConsolePanel } from "../src/editor/ConsolePanel";
import { useEditorStore } from "../src/state/editorStore";

beforeEach(() => {
  useEditorStore.setState({ consoleEntries: [], lastError: undefined, consoleOpen: true });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

describe("TraceViewer HMI", () => {
  it("distingue output HMI, preview e problemi e permette di cercarli", async () => {
    useEditorStore.getState().addPreviewOutput("stdout", "[HMI Tapped] Command.Start=1");
    useEditorStore.getState().addPreviewOutput("stdout", "vite connected");
    useEditorStore.getState().addPreviewOutput("stderr", "warning dal server");
    const entries = useEditorStore.getState().consoleEntries;
    expect(entries.map((item) => item.source)).toEqual(["hmi", "preview", "preview"]);

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(ConsolePanel)));
    expect(container.textContent).toContain("Command.Start=1");
    expect(container.textContent).toContain("vite connected");

    const hmi = [...container.querySelectorAll("button")].find((button) => button.textContent === "HMI")!;
    await act(async () => hmi.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Command.Start=1");
    expect(container.textContent).not.toContain("vite connected");

    const all = [...container.querySelectorAll("button")].find((button) => button.textContent === "Tutti")!;
    await act(async () => all.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const search = container.querySelector('input[aria-label="Cerca nella diagnostica"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "warning");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("warning dal server");
    expect(container.textContent).not.toContain("Command.Start=1");
    await act(async () => root.unmount());
  });

  it("pulisce i messaggi senza chiudere la diagnostica", async () => {
    useEditorStore.getState().addPreviewOutput("stdout", "[HMI Loaded] pronto");
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(ConsolePanel)));
    const clear = container.querySelector('button[aria-label="Pulisci diagnostica"]')!;
    await act(async () => clear.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(useEditorStore.getState()).toMatchObject({ consoleEntries: [], consoleOpen: true, lastError: undefined });
    expect(container.textContent).toContain("Nessun messaggio");
    await act(async () => root.unmount());
  });
});
