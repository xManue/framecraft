// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeFile } = vi.hoisted(() => ({ writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { writeFile, readFile: vi.fn() },
}));

import { emptyHmiScriptCatalog, parseHmiScriptCatalog } from "../src/core/hmiScriptModules";
import { ScriptModulesPanel } from "../src/editor/ScriptModulesPanel";
import { useEditorStore } from "../src/state/editorStore";

const project = {
  root: "C:/panel",
  name: "Panel",
  framework: "vite" as const,
  language: "typescript" as const,
  packageManager: "npm" as const,
  entryFiles: [], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [],
};

beforeEach(() => {
  writeFile.mockReset();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  useEditorStore.setState({
    project,
    pages: [{ id: "settings", name: "Settings", route: "/settings", file: "C:/panel/src/Settings.tsx" }],
    activePageId: "settings",
    previewPath: "/settings",
    scriptCatalog: emptyHmiScriptCatalog(),
    refreshScriptCatalog: vi.fn().mockResolvedValue(undefined),
  });
});

describe("moduli JavaScript HMI", () => {
  it("spiega e salva configurazioni strutturate senza aggiungere selettori o toolbar", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(ScriptModulesPanel)));
      const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes(label))!;
      await act(async () => button("Modulo globale").click());
      const source = container.querySelector<HTMLTextAreaElement>('[aria-label="Definizione globale"]')!;
      const definition = "export const cfg = { speed: 10, steps: [10, 20] };";
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source, definition); source.dispatchEvent(new Event("input", { bubbles: true })); });
      expect(source.getAttribute("aria-describedby")).toContain("script-data-help");
      const help = container.querySelector("#script-data-help")!;
      expect(help.textContent).toContain("per riferimento");
      expect(help.textContent).toContain("non congela i membri");
      expect(help.textContent).toContain("JSON.stringify(cfg)");
      expect(container.querySelector(".editor-level-switch")).toBeNull();
      await act(async () => button("Compila e salva").click());
      const saved = JSON.parse(writeFile.mock.calls[0][1]);
      expect(saved.globalModules[0].globalDefinition.source).toBe(definition);
      expect(saved.globalModules[0].globalDefinition.program.statements[0].value.kind).toBe("object");
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
  it("elenca solo le variabili pubbliche, spiega il binding e salva gli export compilati", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(ScriptModulesPanel)));
      const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes(label))!;
      await act(async () => button("Modulo globale").click());
      const details = [...container.querySelectorAll("details")].find((item) => item.querySelector("summary")?.textContent?.includes("Variabili condivise"))!;
      details.querySelector("summary")!.click();
      expect(details.open).toBe(true);
      const source = container.querySelector<HTMLTextAreaElement>('[aria-label="Definizione globale"]')!;
      const definition = "let internal = 0; export { internal as count }; export const step = 2; let secret = 42;";
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source, definition); source.dispatchEvent(new Event("input", { bubbles: true })); });
      const region = container.querySelector('[aria-label="Variabili pubbliche del modulo"]')!;
      expect([...region.querySelectorAll("code")].map((item) => item.textContent)).toEqual(["Modules.Utilities.count", "Modules.Utilities.step"]);
      expect(region.textContent).not.toContain("secret");
      expect(region.textContent).toContain("Costante");
      expect(region.textContent).toContain("nome interno: internal");
      expect(container.textContent).toContain("per cambiarlo chiama una funzione del modulo");
      await act(async () => button("Compila e salva").click());
      const saved = JSON.parse(writeFile.mock.calls[0][1]);
      expect(saved.globalModules[0].globalDefinition.source).toBe(definition);
      expect(saved.globalModules[0].globalDefinition.program.exports).toEqual([{ name: "count", local: "internal" }, { name: "step", local: "step" }]);
    } finally { await act(async () => root.unmount()); container.remove(); }
  });

  it("impedisce di salvare una funzione che legge una variabile privata di un altro modulo", async () => {
    useEditorStore.setState({ scriptCatalog: parseHmiScriptCatalog({ globalModules: [
      { name: "Private", alias: "Private", functions: [], globalDefinition: { source: "let secret = 42;" } },
      { name: "Reader", alias: "Reader", functions: [{ name: "Read", parameters: [], source: "return Modules.Private.secret;" }] },
    ] }) });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(ScriptModulesPanel)));
      expect(container.textContent).toContain("Modules.Private.secret non esportata");
      const save = container.querySelector<HTMLButtonElement>(".resource-save")!;
      expect(save.disabled).toBe(true);
      await act(async () => save.click());
      expect(writeFile).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); container.remove(); }
  });

  it("salva una definizione globale compilata senza cambiare il corpo delle funzioni", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(ScriptModulesPanel)));
      const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label))!;
      await act(async () => button("Modulo globale").click());
      const source = container.querySelector<HTMLTextAreaElement>('[aria-label="Definizione globale"]')!;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source, "let count = 0; const step = 2;"); source.dispatchEvent(new Event("input", { bubbles: true })); });
      await act(async () => button("Compila e salva").click());
      const saved = JSON.parse(writeFile.mock.calls[0][1]);
      expect(saved.globalModules[0].globalDefinition.program.statements).toHaveLength(2);
      expect(saved.globalModules[0].globalDefinition.program.statements[1].constant).toBe(true);
      expect(saved.globalModules[0].functions).toHaveLength(1);
    } finally { await act(async () => root.unmount()); container.remove(); }
  });

  it("mostra l'errore e impedisce il salvataggio di azioni nella definizione Scheduler", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(ScriptModulesPanel)));
      const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label))!;
      await act(async () => button("Operazione pianificata").click());
      const source = container.querySelector<HTMLTextAreaElement>('[aria-label="Definizione globale Scheduler"]')!;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source, "Tags('Command').Write(1);"); source.dispatchEvent(new Event("input", { bubbles: true })); });
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("ammette dichiarazioni");
      expect(button("Compila e salva").disabled).toBe(true);
      expect(writeFile).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); container.remove(); }
  });

  it("crea e salva un modulo globale già compilato", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(ScriptModulesPanel)));
    const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label))!;
    await act(async () => button("Modulo globale").click());
    expect(container.textContent).toContain("Modules.Utilities");
    await act(async () => button("Compila e salva").click());
    expect(writeFile).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(writeFile.mock.calls[0][1]);
    expect(saved.globalModules[0]).toMatchObject({ alias: "Utilities" });
    expect(saved.globalModules[0].functions[0].program).toMatchObject({ version: 1 });
    await act(async () => root.unmount());
    container.remove();
  });

  it("crea una definizione locale sul percorso della pagina corrente", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(ScriptModulesPanel)));
    const local = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Definizione pagina"))!;
    await act(async () => local.click());
    expect((container.querySelector('input[value="/settings"]') as HTMLInputElement | null)?.value).toBe("/settings");
    expect(container.textContent).toContain("PageFunction");
    await act(async () => root.unmount());
    container.remove();
  });

  it("crea, prova e salva un'operazione pianificata", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(ScriptModulesPanel)));
    const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label))!;
    await act(async () => button("Operazione pianificata").click());
    expect(container.textContent).toContain("Tempo virtuale");
    expect(container.textContent).toContain("Prova ora");
    await act(async () => button("Prova ora").click());
    expect(container.textContent).toContain("ultima: Operazione 1");
    await act(async () => button("Compila e salva").click());
    const saved = JSON.parse(writeFile.mock.calls[0][1]);
    expect(saved.scheduledTasks[0]).toMatchObject({ id: "task-1", name: "Operazione 1", trigger: { kind: "interval", intervalMs: 1000 }, program: { version: 1 } });
    await act(async () => root.unmount());
    container.remove();
  });

  it("configura calendario e allarmi senza uscire dall'editor", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(ScriptModulesPanel)));
    const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label))!;
    await act(async () => button("Operazione pianificata").click());
    const trigger = [...container.querySelectorAll("label")].find((label) => label.querySelector("span")?.textContent === "Trigger")!.querySelector("select")!;
    await act(async () => { trigger.value = "calendar"; trigger.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.textContent).toContain("Ricorrenza");
    expect(container.textContent).toContain("Ogni anno");
    await act(async () => { trigger.value = "alarm"; trigger.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.textContent).toContain("Criterio allarme");
    expect(container.querySelector('[aria-label="Priorità allarme di prova"]')).not.toBeNull();
    await act(async () => button("Simula allarme").click());
    expect(container.textContent).toContain("ultima: Operazione 1");
    await act(async () => root.unmount());
    container.remove();
  });
});
