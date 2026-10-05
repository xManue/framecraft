// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: {} }));
import { ActionToast } from "../src/editor/AppShell";
import { useEditorStore } from "../src/state/editorStore";

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  useEditorStore.setState({ consoleOpen: false, history: [], consoleEntries: [{ id: "error", time: "12:00", level: "error", source: "preview", message: "Vite non si è avviato" }] });
});
afterEach(() => vi.useRealTimers());

describe("avvisi utilizzabili senza conoscere il codice", () => {
  it("non fa sparire un errore prima che l'utente apra i dettagli o lo chiuda", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div"); const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(ActionToast)));
      expect(host.querySelector('[role="alert"]')?.textContent).toContain("L’anteprima non è stata avviata");
      expect(host.textContent).not.toContain("Vite non si è avviato");
      await act(async () => vi.advanceTimersByTimeAsync(30_000));
      expect(host.querySelector('[role="alert"]')).not.toBeNull();
      await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Apri diagnostica")!.click());
      expect(useEditorStore.getState().consoleOpen).toBe(true);
      expect(useEditorStore.getState().consoleEntries[0].message).toBe("Vite non si è avviato");
      expect(host.querySelector('[role="alert"]')).toBeNull();
    } finally { await act(async () => root.unmount()); }
  });

  it("consente di chiudere l'avviso senza eliminare il problema dalla diagnostica", async () => {
    const host = document.createElement("div"); const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(ActionToast)));
      await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Chiudi messaggio"]')!.click());
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(useEditorStore.getState().consoleEntries).toHaveLength(1);
    } finally { await act(async () => root.unmount()); }
  });
});
