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
  it("riconosce errori colorati dal terminale senza scambiare un nome tag per un errore", () => {
    useEditorStore.getState().addPreviewOutput("stdout", "\x1b[31mError: failed to load config\x1b[0m");
    useEditorStore.getState().addPreviewOutput("stdout", "\x1b[32m[HMI Tapped] Motor.Error=0\x1b[0m");
    expect(useEditorStore.getState().consoleEntries.map((item) => [item.level, item.source])).toEqual([["error", "preview"], ["info", "hmi"]]);
  });
  it("spiega gli errori, raggruppa ripetizioni consecutive e non cambia i log originali", async () => {
    const raw = "\x1b[31mfailed to load config from C:/panel/vite.config.mjs\x1b[0m";
    for (let index = 0; index < 4; index++) useEditorStore.getState().addPreviewOutput("stderr", raw);
    const entries = useEditorStore.getState().consoleEntries;
    const container = document.createElement("div"); const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(ConsolePanel)));
      expect(container.querySelectorAll("article")).toHaveLength(1);
      expect(container.querySelector("article")?.getAttribute("aria-label")).toBe("Errore");
      expect(container.querySelector(".console-message > p")?.textContent).toContain("configurazione dell’anteprima");
      expect(container.textContent).toContain("Ricevuto 4 volte");
      const details = container.querySelector("details")!;
      expect(details.open).toBe(false);
      expect(details.querySelector("pre")?.textContent).toBe("failed to load config from C:/panel/vite.config.mjs");
      expect(container.textContent).not.toContain("\x1b");
      expect(useEditorStore.getState().consoleEntries).toBe(entries);
      expect(entries.every((entry) => entry.message === raw)).toBe(true);
      const search = container.querySelector("input")!;
      for (const query of ["configurazione", "vite.config.mjs"]) {
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, query);
          search.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(container.querySelectorAll("article")).toHaveLength(1);
      }
    } finally { await act(async () => root.unmount()); }
  });

  it("non raggruppa origini diverse o livelli diversi e conserva il filtro dei problemi", async () => {
    useEditorStore.setState({ consoleEntries: [
      { id: "1", time: "12:00", message: "Messaggio", level: "info", source: "hmi" },
      { id: "2", time: "12:00", message: "Messaggio", level: "error", source: "hmi" },
      { id: "3", time: "12:00", message: "Messaggio", level: "error", source: "preview" },
    ] });
    const container = document.createElement("div"); const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(ConsolePanel)));
      expect(container.querySelectorAll("article")).toHaveLength(3);
      await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Problemi")!.click());
      expect(container.querySelectorAll("article")).toHaveLength(2);
      expect(container.querySelector('[aria-label="Informazione"]')).toBeNull();
    } finally { await act(async () => root.unmount()); }
  });

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
