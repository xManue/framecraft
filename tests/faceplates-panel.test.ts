// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/filesystem/desktopBridge", () => ({ desktopBridge: { readFile: vi.fn(), writeFile: vi.fn() }, desktopAvailable: true }));

import { standardHmiFaceplateCatalog } from "../src/core/hmiFaceplates";
import { FaceplatesPanel } from "../src/editor/FaceplatesPanel";
import { useEditorStore } from "../src/state/editorStore";

describe("pannello tipi faceplate", () => {
  it("mantiene immutabile una versione rilasciata e crea la bozza successiva", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useEditorStore.setState({ faceplateCatalog: standardHmiFaceplateCatalog() });
    const container = document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(FaceplatesPanel)));
    expect(container.innerHTML).toContain("Versione rilasciata e immutabile");
    expect(container.querySelector<HTMLInputElement>('input[value="Pack"]')?.matches(":disabled")).toBe(true);
    const createVersion = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Crea nuova versione"))!;
    await act(async () => createVersion.click());
    expect(container.innerHTML).toContain("V0.0.9 · bozza");
    expect(container.querySelector<HTMLInputElement>('input[value="Pack"]')?.matches(":disabled")).toBe(false);
    expect(container.innerHTML).toContain("Rilascia versione");
    const visualization = container.querySelector<HTMLElement>(".faceplate-visual-section")!;
    expect(visualization.textContent).toContain("Trascina gli oggetti");
    const addText = [...visualization.querySelectorAll("button")].find((button) => button.textContent?.includes("Testo"))!;
    await act(async () => addText.click());
    expect(container.querySelectorAll(".faceplate-visual-object").length).toBe(3);
    expect(container.innerHTML).toContain("Dinamizzazioni");
    const nestedSection = [...container.querySelectorAll("section.faceplate-section")].find((section) => section.textContent?.includes("Faceplate annidati"))!;
    const addNested = [...nestedSection.querySelectorAll("button")].find((button) => button.textContent?.includes("Aggiungi"))!;
    await act(async () => addNested.click());
    expect(container.innerHTML).toContain("Nested_1");
    expect(container.innerHTML).toContain("Collega l'interfaccia interna");
    await act(async () => root.unmount());
    useEditorStore.setState({ faceplateCatalog: { version: 1, types: [] } });
  });
});
