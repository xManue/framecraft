// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultEditorShortcuts, parseEditorShortcuts } from "../scripts/editor-shortcuts.mjs";
import { installEditorKeyboardShortcuts } from "../src/core/editorCommands";
import { EditorSettings } from "../src/editor/EditorSettings";
import { TopBar } from "../src/editor/TopBar";
import { CommandPalette } from "../src/editor/CommandPalette";
import { useEditorStore } from "../src/state/editorStore";
import { editorShortcutsStorageKey, useEditorShortcuts } from "../src/state/editorShortcuts";

const initial = useEditorStore.getState();
let root: Root, host: HTMLDivElement, dispose: (() => void) | undefined;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.getAttribute("aria-label") === label || node.textContent === label)!;
const press = (key: string, init: KeyboardEventInit = {}) => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
function Frame() { const open = useEditorShortcuts(state => state.open); return createElement("div", null, createElement(TopBar), open && createElement(EditorSettings)); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear();
  useEditorStore.setState({ ...initial, project: { root: "C:/panel", name: "Panel" } as never, loading: false, exporting: false, reloadRecovery: undefined, interactionMode: "edit", history: [], future: [], multiSelection: [], paletteOpen: false,
    document: { file: "C:/panel/Page.jsx", source: "draft", roots: [], nodes: {}, version: 1 }, uiDensity: "normale", snap: { enabled: true, grid: 8 } });
  useEditorShortcuts.setState({ bindings: defaultEditorShortcuts(), open: false, section: "workspace" });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { dispose?.(); dispose = undefined; await act(async () => root.unmount()); host.remove(); useEditorStore.setState(initial, true); useEditorShortcuts.setState({ bindings: defaultEditorShortcuts(), open: false }); vi.restoreAllMocks(); });

describe("pagina impostazioni e comandi rapidi", () => {
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
});
