// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readFile: vi.fn(), writeFile: vi.fn() } }));
import { useEditorStore } from "../src/state/editorStore";
import { Inspector } from "../src/inspector/Inspector";
import { PlcVariablesPanel } from "../src/editor/PlcVariablesPanel";
import { parseSource } from "../src/source-parser/parseSource";
import { parseHmiDynamizations, serializeHmiDynamizations } from "../src/core/hmiDynamizations";
import { emptyHmiDataLogCatalog } from "../src/core/hmiDataLogs";
import { emptyHmiScriptCatalog } from "../src/core/hmiScriptModules";
import type { PlcVariableDefinition } from "../src/core/plcVariables";

const before = useEditorStore.getState();
const tag = (name: string, dataType: string): PlcVariableDefinition => ({ name, dataType, access: "read-write", address: "synthetic", description: "" });
const catalog = [tag("Selected", "WSTRING"), tag("Motor1", "REAL"), tag("Motor2", "REAL")];
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
HTMLElement.prototype.scrollTo = vi.fn();
HTMLElement.prototype.scrollIntoView = vi.fn();
afterEach(() => { useEditorStore.setState(before); });

describe("configurazione visuale del tag indiretto", () => {
  it("abilita il collegamento nell’ispettore, mostra la risoluzione e lo salva nello stesso attributo", async () => {
    const source = `<output data-hmi-dynamizations='${serializeHmiDynamizations([{ property: "ProcessValue", kind: "Tag", tag: "Selected" }])}'>0</output>`;
    const document = parseSource("Page.tsx", source); const node = Object.values(document.nodes)[0];
    const update = vi.fn(async (_name: string, value: string) => {
      const current = useEditorStore.getState().document!;
      useEditorStore.setState({ document: { ...current, nodes: { ...current.nodes, [node.id]: { ...current.nodes[node.id], props: { ...current.nodes[node.id].props, "data-hmi-dynamizations": value } } } } });
    });
    useEditorStore.setState({ project: undefined, document, selectedId: node.id, selectionInfo: { instanceIndex: 0, instanceCount: 1 }, multiSelection: [], unresolvedSelection: undefined, plcVariables: catalog, updateAttribute: update as never, simulation: { ...before.simulation, on: true, values: { Selected: "Motor1", Motor1: "21" }, status: {} } });
    const container = window.document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(createElement(Inspector)));
      const tab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) => button.textContent === "PLC e dati")!;
      await act(async () => tab.click());
      const checkbox = container.querySelector<HTMLInputElement>('.indirect-tag-toggle input')!;
      expect(checkbox).toBeTruthy(); expect(checkbox.checked).toBe(false);
      expect(checkbox.getAttribute("aria-describedby")).toBeTruthy();
      await act(async () => checkbox.click());
      expect(update).toHaveBeenCalledWith("data-hmi-dynamizations", expect.any(String));
      expect(parseHmiDynamizations(update.mock.calls.at(-1)![1])[0]).toMatchObject({ indirect: true, indirectDataType: "REAL" });
      expect(container.querySelector(".indirect-tag-resolution")?.textContent).toContain("Selected → Motor1 · valore: 21");
      await act(async () => useEditorStore.setState({ simulation: { ...useEditorStore.getState().simulation, values: { Selected: "Motor2", Motor2: "32" } } }));
      expect(container.querySelector(".indirect-tag-resolution")?.textContent).toContain("Motor2 · valore: 32");
      const select = container.querySelector<HTMLSelectElement>(".indirect-tag-type select")!;
      await act(async () => { select.value = "BOOL"; select.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(container.querySelector(".indirect-tag-resolution")?.textContent).toContain("non è BOOL");
      await act(async () => checkbox.click());
      const saved = parseHmiDynamizations(update.mock.calls.at(-1)![1])[0];
      expect(saved.indirect).toBeUndefined(); expect(saved.indirectDataType).toBeUndefined();
      expect(container.querySelector(".indirect-tag-type")).toBeNull();
    } finally { await act(async () => root.unmount()); }
  });

  it("offre il valore di prova della destinazione dichiarata e cambia campo quando cambia il selettore", async () => {
    const binding = { property: "ProcessValue", kind: "Tag" as const, tag: "Selected", indirect: true, indirectDataType: "REAL" };
    useEditorStore.setState({ project: undefined, document: undefined, plcVariables: catalog, scriptCatalog: emptyHmiScriptCatalog(), dataLogCatalog: emptyHmiDataLogCatalog(), simulation: { ...before.simulation, on: true, elements: [{ instanceId: "field", dynamizations: [binding] }], values: { Selected: "Motor1" }, status: {} } });
    const container = document.createElement("div"), root = createRoot(container);
    const fields = () => [...container.querySelectorAll<HTMLInputElement>('input[aria-label^="Valore simulato"]')].map((input) => input.getAttribute("aria-label"));
    try {
      await act(async () => root.render(createElement(PlcVariablesPanel)));
      expect(fields()).toEqual(["Valore simulato Motor1", "Valore simulato Selected"]);
      await act(async () => useEditorStore.setState({ simulation: { ...useEditorStore.getState().simulation, values: { Selected: "Motor2" } } }));
      expect(fields()).toEqual(["Valore simulato Motor2", "Valore simulato Selected"]);
      await act(async () => useEditorStore.setState({ simulation: { ...useEditorStore.getState().simulation, values: { Selected: "Unknown" } } }));
      expect(fields()).toEqual(["Valore simulato Selected"]);
    } finally { await act(async () => root.unmount()); }
  });
});
