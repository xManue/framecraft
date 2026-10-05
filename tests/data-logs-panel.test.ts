// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/filesystem/desktopBridge", () => ({ desktopBridge: { readFile: vi.fn(), writeFile: vi.fn(), createFile: vi.fn() }, desktopAvailable: true }));

import { emptyHmiDataLogCatalog } from "../src/core/hmiDataLogs";
import { DataLogsPanel } from "../src/editor/DataLogsPanel";
import { useEditorStore } from "../src/state/editorStore";

describe("pannello Data Log", () => {
  it("guida la creazione di un archivio e mostra le opzioni della modalità ciclica", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useEditorStore.setState({ project: undefined, dataLogCatalog: emptyHmiDataLogCatalog(), plcVariables: [] });
    const container = document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(DataLogsPanel)));
    const addLog = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Nuovo Data Log"))!;
    await act(async () => addLog.click());
    expect(container.textContent).toContain("Configurazione archivio");
    expect(container.textContent).toContain("Locale e persistente");
    const addTag = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Aggiungi"))!;
    await act(async () => addTag.click());
    expect(container.textContent).toContain("timestamp e quality code");
    const mode = [...container.querySelectorAll("select")].find((select) => [...select.options].some((option) => option.value === "cyclic"))!;
    await act(async () => { mode.value = "cyclic"; mode.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.textContent).toContain("Ciclo logging (ms)");
    expect(container.querySelector<HTMLInputElement>('input[type="number"][min="500"]')?.value).toBe("1000");
    expect(container.querySelector<HTMLButtonElement>("button.resource-save")?.disabled).toBe(true);
    await act(async () => root.unmount());
  });
});
