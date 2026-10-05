// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { readFile: vi.fn(), writeFile: vi.fn() },
}));

import { TopBar } from "../src/editor/TopBar";
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { useEditorStore } from "../src/state/editorStore";
import { parseSource } from "../src/source-parser/parseSource";

const project = {
  root: "C:/panel",
  name: "Linea prova",
  framework: "vite" as const,
  language: "typescript" as const,
  packageManager: "npm" as const,
  entryFiles: [],
  files: [],
  scripts: {},
  dependencies: [],
  hasNodeModules: true,
  missingDependencies: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  useEditorStore.setState({
    project,
    viewMode: "visual",
    interactionMode: "edit", document: undefined, selectedId: undefined,
    selectionRect: undefined, selectionStyles: {}, highlightPicker: undefined, multiSelection: [],
    viewport: "panel-1280",
    leftPanel: "pages",
    leftPanelCollapsed: false,
    history: [],
    future: [],
    dirty: false,
    exporting: false,
    fitCanvas: true,
    previewUrl: "http://localhost:4173",
    previewStatus: "ready", previewRestarting: false, previewSessionId: undefined, previewProcessExited: false, loading: false,
  });
});

afterEach(() => vi.restoreAllMocks());

describe("barra comandi principale", () => {
  it.each(["visual", "split", "code"] as const)("mostra subito lo switch Modifica/Usa nella vista %s fuori dai menu", async (viewMode) => {
    useEditorStore.setState({ viewMode });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TopBar)));
      const group = container.querySelector('[role="group"][aria-label="Interazione con il pannello"]')!;
      expect(group).not.toBeNull();
      expect(group.closest(".topbar")).not.toBeNull();
      expect(group.closest("nav, [role='menu']")).toBeNull();
      const buttons = [...group.querySelectorAll<HTMLButtonElement>("button")];
      expect(buttons.map((button) => button.textContent)).toEqual(["Modifica", "Usa il pannello"]);
      expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
      for (const button of buttons) {
        expect(button.type).toBe("button");
        expect(button.disabled).toBe(false);
        expect(button.tabIndex).toBe(0);
        button.focus();
        expect(document.activeElement).toBe(button);
        expect(button.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
      }
      expect(container.querySelector('[role="menu"]')).toBeNull();
      expect(container.textContent).not.toContain("Prova pannello");
    } finally { await act(async () => root.unmount()); container.remove(); }
  });

  it("cambia interazione e chiude il menu senza salvare, riavviare o perdere il documento", async () => {
    const source = 'export default function Page(){ return <button>Non salvato</button>; }';
    const page = parseSource("C:/panel/src/Page.tsx", source);
    const selectedId = Object.values(page.nodes).find((node) => node.type === "button")!.id;
    const history = [{ file: page.file, source: source.replace("Non salvato", "Prima") }];
    const future = [{ file: page.file, source: source.replace("Non salvato", "Dopo") }];
    useEditorStore.setState({
      document: page, selectedId, selectionRect: { x: 10, y: 20, width: 80, height: 40 },
      selectionStyles: { color: "red" }, dirty: true, history, future, previewPath: "/settings.html",
    });
    const save = vi.spyOn(useEditorStore.getState(), "save").mockResolvedValue(undefined);
    const restart = vi.spyOn(useEditorStore.getState(), "restartPreview").mockResolvedValue(undefined);
    const refresh = vi.spyOn(useEditorStore.getState(), "refreshPreview").mockImplementation(() => {});
    const openPreview = vi.spyOn(useEditorStore.getState(), "openStandalonePreview").mockResolvedValue(undefined);
    const close = vi.spyOn(useEditorStore.getState(), "closeProject").mockResolvedValue(undefined);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TopBar)));
      const group = container.querySelector(".topbar-interaction-switch")!;
      const [edit, use] = [...group.querySelectorAll<HTMLButtonElement>("button")];
      const editMenu = [...container.querySelectorAll<HTMLButtonElement>(".topbar-menu > button")].find((button) => button.textContent?.includes("Modifica"))!;
      await act(async () => editMenu.click());
      expect(container.querySelector('[role="menu"][aria-label="Modifica"]')).not.toBeNull();
      expect(container.querySelectorAll('[role="menu"] [role="menuitemradio"]')).toHaveLength(0);
      await act(async () => use.click());
      expect(useEditorStore.getState()).toMatchObject({ interactionMode: "navigate", selectedId: undefined, selectionRect: undefined, selectionStyles: {} });
      expect(edit.getAttribute("aria-pressed")).toBe("false");
      expect(use.getAttribute("aria-pressed")).toBe("true");
      expect(container.querySelector('[role="menu"]')).toBeNull();
      await act(async () => edit.click());
      const state = useEditorStore.getState();
      expect(state.interactionMode).toBe("edit");
      expect(edit.getAttribute("aria-pressed")).toBe("true");
      expect(use.getAttribute("aria-pressed")).toBe("false");
      expect(state.document).toBe(page);
      expect(state.project).toBe(project);
      expect(state.history).toBe(history);
      expect(state.future).toBe(future);
      expect(state.dirty).toBe(true);
      expect(state.viewMode).toBe("visual");
      expect(state.previewUrl).toBe("http://localhost:4173");
      expect(state.previewPath).toBe("/settings.html");
      for (const command of [save, restart, refresh, openPreview, close, desktopBridge.readFile, desktopBridge.writeFile]) expect(command).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); container.remove(); }
  });

  it("riflette anche i cambi di modalità provenienti dal resto dell'editor", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TopBar)));
      const [edit, use] = [...container.querySelectorAll(".topbar-interaction-switch button")];
      await act(async () => useEditorStore.getState().setInteractionMode("navigate"));
      expect(edit.getAttribute("aria-pressed")).toBe("false");
      expect(use.getAttribute("aria-pressed")).toBe("true");
      await act(async () => useEditorStore.getState().setInteractionMode("edit"));
      expect(edit.getAttribute("aria-pressed")).toBe("true");
      expect(use.getAttribute("aria-pressed")).toBe("false");
    } finally { await act(async () => root.unmount()); }
  });

  it("tiene Prova pannello distinto dallo switch e solo nella tendina Pannello", async () => {
    useEditorStore.setState({ interactionMode: "navigate" });
    const openPreview = vi.spyOn(useEditorStore.getState(), "openStandalonePreview").mockResolvedValue(undefined);
    const container = document.createElement("div"); const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TopBar)));
      expect(container.textContent).not.toContain("Prova pannello");
      const panelMenu = [...container.querySelectorAll<HTMLButtonElement>(".topbar-menu > button")].find((button) => button.textContent?.includes("Pannello"))!;
      await act(async () => panelMenu.click());
      const preview = [...container.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.querySelector("strong")?.textContent === "Prova pannello");
      expect(preview).toHaveLength(1);
      expect(preview[0].closest('[role="menu"][aria-label="Pannello"]')).not.toBeNull();
      await act(async () => preview[0].click());
      expect(openPreview).toHaveBeenCalledOnce();
      expect(useEditorStore.getState().interactionMode).toBe("navigate");
      expect(container.querySelector('[role="menu"]')).toBeNull();
    } finally { await act(async () => root.unmount()); }
  });

  it("spiega lo switch visibile nella guida senza rimandare alla vecchia tendina", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TopBar)));
      const help = [...container.querySelectorAll<HTMLButtonElement>(".topbar-menu > button")].find((button) => button.textContent?.includes("Aiuto"))!;
      await act(async () => help.click());
      const guide = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.querySelector("strong")?.textContent === "Guida rapida")!;
      await act(async () => guide.click());
      const dialog = container.querySelector('[role="dialog"]')!;
      expect(dialog.textContent).toContain("switch della barra superiore");
      expect(dialog.textContent).toContain("Usa il pannello");
      expect(dialog.textContent).not.toContain("Modifica → Modifica pagina");
      expect(dialog.textContent).toContain("Pannello → Prova pannello");
    } finally { await act(async () => root.unmount()); }
  });

  it.each(["code", "split"] as const)("torna alla grafica dalla vista %s senza perdere il codice non salvato", async (viewMode) => {
    const original = 'export default function Page(){ return <button>Prima</button>; }';
    const draft = original.replace("Prima", "Modifica non salvata");
    const document = parseSource("C:/panel/src/Page.tsx", draft);
    const selectedId = Object.values(document.nodes).find((node) => node.type === "button")!.id;
    const history = [{ file: document.file, source: original }];
    const future = [{ file: document.file, source: draft.replace("Modifica non salvata", "Dopo") }];
    useEditorStore.setState({ viewMode, document, selectedId, dirty: true, history, future });
    const save = vi.spyOn(useEditorStore.getState(), "save").mockResolvedValue(undefined);
    const restart = vi.spyOn(useEditorStore.getState(), "restartPreview").mockResolvedValue(undefined);
    const close = vi.spyOn(useEditorStore.getState(), "closeProject").mockResolvedValue(undefined);
    const container = window.document.createElement("div"); window.document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TopBar)));
      const back = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Torna alla grafica")!;
      expect(back).toBeDefined();
      expect(back.closest('[role="menu"]')).toBeNull();
      expect(back.disabled).toBe(false);
      const file = [...container.querySelectorAll(".topbar-menu > button")].find((button) => button.textContent?.includes("File"))!;
      await act(async () => file.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      await act(async () => back.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      const state = useEditorStore.getState();
      expect(state.viewMode).toBe("visual");
      expect(state.document).toBe(document);
      expect(state.dirty).toBe(true);
      expect(state.selectedId).toBe(selectedId);
      expect(state.history).toBe(history);
      expect(state.future).toBe(future);
      expect(state.project).toBe(project);
      expect(save).not.toHaveBeenCalled();
      expect(restart).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      expect(container.querySelector('[role="menu"]')).toBeNull();
      expect(container.querySelector(".topbar-visual-return")).toBeNull();
    } finally { await act(async () => root.unmount()); container.remove(); useEditorStore.setState({ document: undefined, selectedId: undefined }); }
  });

  it("non aggiunge un comando di ritorno permanente mentre mostra già la grafica", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TopBar)));
      expect(container.textContent).not.toContain("Torna alla grafica");
    } finally { await act(async () => root.unmount()); }
  });

  it("consente di uscire dal codice anche quando non è stato aperto un documento", async () => {
    useEditorStore.setState({ viewMode: "code", document: undefined });
    const container = document.createElement("div"); const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TopBar)));
      const back = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Torna alla grafica")!;
      expect(back).toBeDefined();
      await act(async () => back.click());
      expect(useEditorStore.getState().viewMode).toBe("visual");
    } finally { await act(async () => root.unmount()); }
  });

  it.each([
    { label: "ready", loading: false, restarting: false },
    { label: "opening", loading: true, restarting: false },
    { label: "restarting", loading: false, restarting: true },
  ])("keeps startup cancellation out of the menus while $label", async ({ loading, restarting }) => {
    useEditorStore.setState({ loading, previewRestarting: restarting, previewSessionId: loading || restarting ? "starting" : undefined, consoleOpen: false });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TopBar)));
      expect(container.textContent).not.toContain("Interrompi avvio");
      const modeButtons = container.querySelectorAll<HTMLButtonElement>(".topbar-interaction-switch button");
      expect(modeButtons).toHaveLength(2);
      expect([...modeButtons].every((button) => !button.disabled)).toBe(true);
      const view = [...container.querySelectorAll(".topbar-menu > button")].find((button) => button.textContent?.includes("Visualizza"))!;
      await act(async () => view.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(container.textContent).not.toContain("Interrompi avvio");
      const logs = [...container.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')].find((button) => button.textContent?.includes("Apri diagnostica"))!;
      expect(logs.disabled).toBe(false);
      await act(async () => logs.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(useEditorStore.getState().consoleOpen).toBe(true);
      expect(container.querySelector('[role="menu"]')).toBeNull();
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
  it("offers recovery only inside the dropdown, even when Vite has no URL", async () => {
    useEditorStore.setState({ previewUrl: undefined, previewStatus: "error", previewError: "Avvio fallito" });
    const restart = vi.spyOn(useEditorStore.getState(), "restartPreview").mockResolvedValue(undefined);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(TopBar)));
    expect(container.querySelectorAll(".topbar-interaction-switch button")).toHaveLength(2);
    expect(container.textContent).not.toContain("Ricompila anteprima");
    const open = () => [...container.querySelectorAll(".topbar-menu > button")].find((button) => button.textContent?.includes("Visualizza"))!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await act(async () => open());
    expect(container.textContent).toContain("Tenta l’avvio");
    const force = [...container.querySelectorAll('button[role="menuitem"]')].find((button) => button.textContent?.includes("Ricompila anteprima"))!;
    await act(async () => force.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(restart).toHaveBeenCalledExactlyOnceWith(true);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await act(async () => open());
    const logs = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Apri diagnostica"))!;
    await act(async () => logs.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(useEditorStore.getState().consoleOpen).toBe(true);
    await act(async () => root.unmount());
    container.remove();
  });

  it("disables repeated restarts while keeping startup logs accessible", async () => {
    useEditorStore.setState({ previewRestarting: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(TopBar)));
    const view = [...container.querySelectorAll(".topbar-menu > button")].find((button) => button.textContent?.includes("Visualizza"))!;
    await act(async () => view.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    for (const label of ["Aggiorna anteprima", "Avvio dell’anteprima", "Ricompila anteprima"]) {
      const button = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(label))!;
      expect(button.disabled).toBe(true);
    }
    expect([...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Apri diagnostica"))!.disabled).toBe(false);
    await act(async () => root.unmount());
    container.remove();
  });
  it("raggruppa le azioni File e chiude il menu con Escape", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(TopBar)));

    const file = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "File")!;
    await act(async () => file.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Apri o cambia progetto");
    expect(container.textContent).toContain("Esporta copia");

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.textContent).not.toContain("Apri o cambia progetto");
    await act(async () => root.unmount());
    container.remove();
  });

  it.each(["disegno", "plc", "sviluppo"] as const)("rende disponibili tutte le viste e lo switch nella disposizione %s senza profili semplice/completa", async (workLayout) => {
    useEditorStore.setState({ viewMode: "code" });
    useEditorStore.getState().applyWorkLayout(workLayout);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TopBar)));
      expect(useEditorStore.getState().viewMode).toBe("code");
      expect(container.querySelectorAll(".topbar-interaction-switch button")).toHaveLength(2);
      const openView = () => [...container.querySelectorAll(".topbar-menu > button")].find((button) => button.textContent?.includes("Visualizza"))!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await act(async () => openView());
      expect(container.textContent).not.toContain("Modalità semplice");
      expect(container.textContent).not.toContain("Modalità completa");
      expect(container.textContent).not.toContain("Modalità avanzata");
      expect(container.querySelector(".editor-level-switch")).toBeNull();
      for (const label of ["Disegno", "Affiancati", "Codice"]) {
        const button = [...container.querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]')].find((item) => item.querySelector("strong")?.textContent === label)!;
        expect(button.disabled).toBe(false);
      }
      const split = [...container.querySelectorAll("button")].find((button) => button.querySelector("strong")?.textContent === "Affiancati")!;
      await act(async () => split.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(useEditorStore.getState().viewMode).toBe("split");
      await act(async () => openView());
      const code = [...container.querySelectorAll("button")].find((button) => button.querySelector("strong")?.textContent === "Codice")!;
      await act(async () => code.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(useEditorStore.getState().viewMode).toBe("code");
    } finally { await act(async () => root.unmount()); container.remove(); }
  });

  it("rende disponibili viste, formato e pannelli tecnici dai menu", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(TopBar)));

    const menu = (label: string) => [...container.querySelectorAll(".topbar-menu > button")].find((button) => button.textContent?.includes(label))!;
    await act(async () => menu("Visualizza").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const code = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Sorgente della pagina"))!;
    expect(code.disabled).toBe(false);
    await act(async () => code.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(useEditorStore.getState().viewMode).toBe("code");

    await act(async () => menu("Pannello").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const plc = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Variabili PLC"))!;
    await act(async () => plc.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(useEditorStore.getState()).toMatchObject({ leftPanel: "plc", leftPanelCollapsed: false });

    await act(async () => root.unmount());
    container.remove();
  });

  it("lascia visibile lo switch e tiene gli altri comandi dentro le tendine", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(TopBar)));

    expect(container.textContent).not.toContain("Prova pannello");
    expect(container.textContent).not.toContain("Diagnostica HMI");
    expect(container.querySelector('[aria-label="Salva"]')).toBeNull();

    const menu = (label: string) => [...container.querySelectorAll(".topbar-menu > button")].find((button) => button.textContent?.includes(label))!;
    await act(async () => menu("Modifica").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Annulla");
    expect(container.textContent).toContain("Guide intelligenti");

    await act(async () => menu("Visualizza").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('[aria-label="Riduci zoom"]')).not.toBeNull();
    expect(container.textContent).toContain("Dimensione interfaccia");

    await act(async () => menu("Pannello").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Prova pannello");
    expect(container.textContent).toContain("Diagnostica HMI");
    expect(container.textContent).toContain("Moduli JavaScript");
    expect(container.textContent).toContain("Tipi faceplate");
    expect(container.textContent).toContain("Data Log e storico");

    await act(async () => root.unmount());
    container.remove();
  });
});
