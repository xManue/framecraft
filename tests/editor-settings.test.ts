// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultEditorShortcuts, parseEditorShortcuts } from "../scripts/editor-shortcuts.mjs";
import { installEditorKeyboardShortcuts } from "../src/core/editorCommands";
import { EditorSettings } from "../src/editor/EditorSettings";
import { TopBar } from "../src/editor/TopBar";
import { CommandPalette } from "../src/editor/CommandPalette";
import { EditorHelp } from "../src/editor/EditorHelp";
import { useEditorStore } from "../src/state/editorStore";
import { editorShortcutsStorageKey, useEditorShortcuts } from "../src/state/editorShortcuts";
import { editorGuidanceStorageKey, useEditorGuidance } from "../src/state/editorGuidance";

const initial = useEditorStore.getState();
let root: Root, host: HTMLDivElement, dispose: (() => void) | undefined;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.getAttribute("aria-label") === label || node.textContent === label)!;
const press = (key: string, init: KeyboardEventInit = {}) => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
function Frame() { const open = useEditorShortcuts(state => state.open), helpOpen = useEditorGuidance(state => state.helpOpen); return createElement("div", null, createElement(TopBar), open && createElement(EditorSettings), helpOpen && createElement(EditorHelp)); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear();
  useEditorStore.setState({ ...initial, project: { root: "C:/panel", name: "Panel" } as never, loading: false, exporting: false, reloadRecovery: undefined, interactionMode: "edit", history: [], future: [], multiSelection: [], paletteOpen: false,
    document: { file: "C:/panel/Page.jsx", source: "draft", roots: [], nodes: {}, version: 1 }, uiDensity: "normale", snap: { enabled: true, grid: 8 } });
  useEditorShortcuts.setState({ bindings: defaultEditorShortcuts(), open: false, section: "workspace" });
  useEditorGuidance.setState({ enabled: true, seen: false, replayVersion: 0, helpOpen: false });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { dispose?.(); dispose = undefined; await act(async () => root.unmount()); host.remove(); useEditorStore.setState(initial, true); useEditorShortcuts.setState({ bindings: defaultEditorShortcuts(), open: false }); vi.restoreAllMocks(); });

describe("pagina impostazioni e comandi rapidi", () => {
  it("collega le schede al contenuto, le cambia da tastiera e non include azioni nascoste nel focus", async () => {
    useEditorShortcuts.setState({ open: true, section: "workspace" });
    await act(async () => root.render(createElement(Frame)));
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs).toHaveLength(4);
    expect(tabs.filter(tab => tab.tabIndex === 0)).toHaveLength(1);
    tabs[0].focus();
    await act(async () => press("End"));
    expect(useEditorShortcuts.getState().section).toBe("ai");
    expect(document.activeElement).toBe(tabs[3]);
    const content = document.querySelector<HTMLElement>('#editor-settings-content')!;
    expect(content.getAttribute("aria-labelledby")).toBe(tabs[3].id);
    expect(tabs[3].getAttribute("aria-controls")).toBe(content.id);
    content.scrollTop = 500;
    await act(async () => press("ArrowRight"));
    expect(document.activeElement).toBe(tabs[0]);
    expect(content.scrollTop).toBe(0);
    await act(async () => press("ArrowLeft"));
    expect(document.activeElement).toBe(tabs[3]);
    await act(async () => press("Home"));
    expect(document.activeElement).toBe(tabs[0]);
    expect(document.querySelector('.editor-settings-shortcut-actions')?.hasAttribute("hidden")).toBe(true);
    button("Chiudi impostazioni").focus();
    await act(async () => press("Tab", { shiftKey: true }));
    expect(document.activeElement).toBe(button("Chiudi"));
    expect(useEditorStore.getState().document?.source).toBe("draft");
  });
  it("mantiene la stessa struttura tra contenuti brevi, elenchi lunghi e ricerche vuote", async () => {
    useEditorShortcuts.setState({ open: true, section: "workspace" });
    await act(async () => root.render(createElement(Frame)));
    const dialog = document.querySelector('.editor-settings'), content = document.querySelector('.editor-settings-body'), footer = dialog?.querySelector('footer');
    for (const label of ["Scorciatoie e comandi", "Aiuto e suggerimenti", "AI e account", "Area di lavoro"]) {
      await act(async () => button(label).click());
      expect(document.querySelector('.editor-settings')).toBe(dialog);
      expect(document.querySelector('.editor-settings-body')).toBe(content);
      expect(dialog?.querySelector('footer')).toBe(footer);
    }
    await act(async () => button("Scorciatoie e comandi").click());
    const input = document.querySelector<HTMLInputElement>('.editor-settings-search input')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "no-such-command"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(document.body.textContent).toContain("Nessun comando trovato");
    expect(dialog?.querySelector('footer')).toBe(footer);
  });
  it("si apre da File con preferenze reali e non modifica il documento", async () => {
    await act(async () => root.render(createElement(Frame)));
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("nav > div > button")].find(node => node.textContent?.startsWith("File"))!.click());
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(node => node.textContent?.includes("Impostazioni dell’editor"))!.click());
    expect(document.querySelector('[aria-labelledby="editor-settings-title"]')).not.toBeNull();
    expect(document.body.textContent).toContain("pannello HMI finale non viene modificato");
    const density = document.querySelector<HTMLSelectElement>("#editor-density")!;
    await act(async () => { density.value = "grande"; density.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(useEditorStore.getState().uiDensity).toBe("grande");
    expect(JSON.parse(localStorage.getItem("framecraft.view")!).uiDensity).toBe("grande");
    expect(useEditorStore.getState().document?.source).toBe("draft");
  });
  it("registra, salva e aggiorna gli hint, senza eseguire il comando durante la registrazione", async () => {
    const save = vi.spyOn(useEditorStore.getState(), "save").mockResolvedValue(undefined); dispose = installEditorKeyboardShortcuts();
    useEditorShortcuts.setState({ open: true, section: "shortcuts" }); await act(async () => root.render(createElement(Frame)));
    await act(async () => button("Cambia Ctrl + S per Salva la modifica corrente").click());
    await act(async () => press("s", { ctrlKey: true, altKey: true }));
    expect(save).not.toHaveBeenCalled(); expect(useEditorShortcuts.getState().bindings.save).toEqual(["Mod+S"]);
    await act(async () => button("Salva scorciatoie").click());
    expect(useEditorShortcuts.getState().bindings.save).toEqual(["Mod+Alt+S"]);
    expect(parseEditorShortcuts(localStorage.getItem(editorShortcutsStorageKey)).save).toEqual(["Mod+Alt+S"]);
    await act(async () => button("Chiudi").click());
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("nav > div > button")].find(node => node.textContent?.startsWith("File"))!.click());
    expect(host.querySelector('[role="menuitem"] kbd')?.textContent).toBe("Ctrl + Alt + S");
  });
  it("spiega collisioni e tasti riservati, e Chiudi senza salvare conserva le preferenze", async () => {
    useEditorShortcuts.setState({ open: true, section: "shortcuts" }); await act(async () => root.render(createElement(Frame)));
    await act(async () => button("Cambia Ctrl + S per Salva la modifica corrente").click());
    await act(async () => press("d", { ctrlKey: true })); expect(document.querySelector('[role="alert"]')?.textContent).toContain("Duplica elemento");
    await act(async () => press("w", { ctrlKey: true })); expect(document.querySelector('[role="alert"]')?.textContent).toContain("riservata");
    await act(async () => press("s", { ctrlKey: true, altKey: true }));
    await act(async () => button("Chiudi senza salvare").click()); expect(useEditorShortcuts.getState().bindings.save).toEqual(["Mod+S"]);
    expect(localStorage.getItem(editorShortcutsStorageKey)).toBeNull();
  });
  it("rimuove combinazioni, ripristina predefiniti e mantiene focus/Esc nella pagina", async () => {
    const previous = document.createElement("button"); document.body.append(previous); previous.focus();
    useEditorShortcuts.setState({ open: true, section: "shortcuts" }); await act(async () => root.render(createElement(Frame)));
    await act(async () => button("Rimuovi Ctrl + S da Salva la modifica corrente").click());
    await act(async () => button("Salva scorciatoie").click()); expect(useEditorShortcuts.getState().bindings.save).toEqual([]);
    await act(async () => button("Ripristina predefiniti").click()); await act(async () => button("Salva scorciatoie").click());
    expect(useEditorShortcuts.getState().bindings.save).toEqual(["Mod+S"]);
    await act(async () => button("Cambia Ctrl + S per Salva la modifica corrente").click()); await act(async () => press("Escape"));
    expect(useEditorShortcuts.getState().open).toBe(true);
    button("Chiudi").focus(); await act(async () => press("Tab")); expect(document.activeElement).toBe(button("Chiudi impostazioni"));
    await act(async () => press("Escape")); expect(useEditorShortcuts.getState().open).toBe(false); expect(document.activeElement).toBe(previous); previous.remove();
  });
  it("cerca un comando e lo esegue con Invio mostrando la combinazione personalizzata", async () => {
    useEditorShortcuts.setState({ bindings: { ...defaultEditorShortcuts(), diagnostics: ["Mod+Alt+L"] } });
    await act(async () => root.render(createElement(CommandPalette)));
    const input = document.querySelector<HTMLInputElement>('[aria-label="Cerca un comando"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "diagnostica"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(host.querySelector("kbd")?.textContent).toBe("Ctrl + Alt + L");
    await act(async () => press("Enter")); expect(useEditorStore.getState().consoleOpen).toBe(true);
  });
  it("raccoglie aiuti e suggerimenti senza modificare il pannello", async () => {
    useEditorShortcuts.setState({ open: true }); await act(async () => root.render(createElement(Frame)));
    await act(async () => button("Aiuto e suggerimenti").click());
    const toggle = document.querySelector<HTMLInputElement>('.editor-settings-toggle input')!;
    await act(async () => toggle.click());
    expect(useEditorGuidance.getState().enabled).toBe(false);
    expect(localStorage.getItem(editorGuidanceStorageKey)).toBe("0");
    await act(async () => button("Rivedi il suggerimento").click());
    expect(useEditorGuidance.getState()).toMatchObject({ enabled: true, seen: false, replayVersion: 1 });
    expect(document.querySelector('[role="status"]')?.textContent).toContain("Comparirà una sola volta");
    expect(useEditorStore.getState().document?.source).toBe("draft");
    await act(async () => button("Apri guida rapida").click());
    expect(useEditorShortcuts.getState().open).toBe(false);
    expect(useEditorGuidance.getState().helpOpen).toBe(true);
    expect(document.querySelector("#quick-help-title")?.textContent).toBe("Come modificare un pannello");
    expect(document.querySelector("#editor-help-plc-guide")).not.toBeNull();
  });
  it("mantiene la bozza delle scorciatoie e permette di salvarla anche nelle altre sezioni", async () => {
    useEditorShortcuts.setState({ open: true, section: "shortcuts" }); await act(async () => root.render(createElement(Frame)));
    await act(async () => button("Cambia Ctrl + S per Salva la modifica corrente").click());
    await act(async () => press("s", { ctrlKey: true, altKey: true }));
    await act(async () => button("Aiuto e suggerimenti").click());
    expect(button("Apri guida rapida").disabled).toBe(true);
    await act(async () => button("Salva scorciatoie").click());
    expect(useEditorShortcuts.getState().bindings.save).toEqual(["Mod+Alt+S"]);
    expect(button("Apri guida rapida").disabled).toBe(false);
  });
  it("mantiene Tab ed Esc nella guida, lasciando accessibili anche i dettagli PLC", async () => {
    useEditorGuidance.setState({ helpOpen: true }); await act(async () => root.render(createElement(Frame)));
    const guide = document.querySelector<HTMLDetailsElement>("#editor-help-plc-guide")!;
    await act(async () => press("Tab", { shiftKey: true }));
    expect(document.activeElement).toBe(guide.querySelector("summary"));
    await act(async () => { guide.open = true; });
    button("Chiudi guida").focus();
    await act(async () => press("Tab", { shiftKey: true }));
    expect(document.activeElement?.textContent).toBe("OPC UA e messa in produzione");
    await act(async () => press("Escape"));
    expect(useEditorGuidance.getState().helpOpen).toBe(false);
    expect(document.querySelector("#quick-help-title")).toBeNull();
    expect(document.activeElement?.textContent).toContain("Aiuto");
  });
});
