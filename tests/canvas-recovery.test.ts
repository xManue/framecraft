// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "../src/canvas/Canvas";
import { useEditorStore } from "../src/state/editorStore";

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  useEditorStore.setState({ project: undefined, document: undefined, previewUrl: undefined, previewStatus: "error", previewError: "Vite non si è avviato", previewRestarting: false, previewSessionId: undefined, previewProcessExited: false, loading: false,
    selectedId: undefined, multiSelection: [], selectionRect: undefined, highlightPicker: undefined, zonePicking: undefined, consoleOpen: false, simulation: { on: false, values: {}, status: {}, elements: [], unresolved: [] } });
});
afterEach(() => vi.unstubAllGlobals());

describe("recupero del canvas senza cambiare lo zoom del pannello", () => {
  it("removes only a dead iframe and shows recovery instead of allowing a false resume", async () => {
    useEditorStore.setState({ project: { root: "C:/panel" } as never, previewSessionId: "current", previewUrl: "http://127.0.0.1:4173", previewStatus: "ready" });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(Canvas)));
      expect(host.querySelector("iframe")).not.toBeNull();
      await act(async () => useEditorStore.getState().handlePreviewExit({ sessionId: "current", code: 7, message: "Vite si è chiuso inaspettatamente" }));
      expect(host.querySelector("iframe")).toBeNull();
      const alert = host.querySelector('[role="alert"]')!;
      expect(alert.textContent).toContain("Vite si è chiuso");
      expect(alert.textContent).toContain("Riavvia Vite");
      expect(alert.textContent).not.toContain("Continua comunque");
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
  it("mantiene errore e azioni fuori dalla superficie scalata e rende accessibili i log", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(Canvas)));
      const alert = host.querySelector('[role="alert"]')!;
      expect(alert.textContent).toContain("Vite non si è avviato");
      expect(host.querySelector(".canvas-area")?.contains(alert)).toBe(true);
      expect(host.querySelector(".canvas-frame-wrap")?.contains(alert)).toBe(false);
      const logs = [...alert.querySelectorAll("button")].find((button) => button.textContent?.includes("Log di avvio"))!;
      await act(async () => logs.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(useEditorStore.getState().consoleOpen).toBe(true);
    } finally { await act(async () => root.unmount()); host.remove(); }
  });

  it("non smonta l'iframe esistente quando segnala un errore", async () => {
    useEditorStore.setState({ previewUrl: "http://127.0.0.1:4173", previewStatus: "ready" });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(Canvas)));
      const frame = host.querySelector("iframe")!;
      expect(frame).not.toBeNull();
      await act(async () => useEditorStore.setState({ previewStatus: "error", previewError: "Errore del modulo" }));
      expect(host.querySelector("iframe")).toBe(frame);
      const alert = host.querySelector('[role="alert"]')!;
      expect(host.querySelector(".canvas-frame-wrap")?.contains(alert)).toBe(false);
      const resume = [...alert.querySelectorAll("button")].find((button) => button.textContent?.includes("Continua comunque"))!;
      await act(async () => resume.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(host.querySelector("iframe")).toBe(frame);
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
});
