// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultEditorShortcuts, editorCommandForShortcut, editorShortcutFromEvent, editorShortcutIssue, editorShortcutsIssue, formatEditorShortcut, normalizeEditorShortcut, parseEditorShortcuts } from "../scripts/editor-shortcuts.mjs";
import { installEditorKeyboardShortcuts, runEditorCommand } from "../src/core/editorCommands";
import { useEditorStore } from "../src/state/editorStore";
import { editorShortcutsStorageKey, useEditorShortcuts } from "../src/state/editorShortcuts";

const initial = useEditorStore.getState();
let dispose: (() => void) | undefined;
beforeEach(() => {
  localStorage.clear(); document.body.innerHTML = "";
  useEditorShortcuts.setState({ bindings: defaultEditorShortcuts(), open: false });
  useEditorStore.setState({ ...initial, project: { root: "C:/panel" } as never, document: { file: "C:/panel/Page.jsx", source: "draft", roots: [], nodes: {}, version: 1 },
    loading: false, exporting: false, reloadRecovery: undefined, interactionMode: "edit", history: [{ file: "Page.jsx", source: "before" }], selectedId: "button", future: [], dirty: false });
});
afterEach(() => { dispose?.(); dispose = undefined; vi.restoreAllMocks(); useEditorStore.setState(initial, true); useEditorShortcuts.setState({ bindings: defaultEditorShortcuts(), open: false }); document.body.innerHTML = ""; });
function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }); target.dispatchEvent(event); return event;
}

describe("configurazione delle scorciatoie", () => {
  it("normalizza Ctrl/Cmd e l’ordine dei modificatori senza alias ambigui", () => {
    expect(normalizeEditorShortcut("shift+ctrl+s")).toBe("Mod+Shift+S");
    expect(normalizeEditorShortcut("Cmd+alt+k")).toBe("Mod+Alt+K");
    expect(normalizeEditorShortcut("Ctrl+Ctrl+S")).toBeUndefined();
    expect(formatEditorShortcut("Mod+Shift+S")).toBe("Ctrl + Shift + S");
    expect(formatEditorShortcut("Mod+S", true)).toBe("⌘ + S");
    expect(editorShortcutsIssue(defaultEditorShortcuts())).toBeUndefined();
  });
  it("rifiuta conflitti, tasti di scrittura e combinazioni di sistema", () => {
    expect(editorShortcutIssue("S")).toContain("Aggiungi Ctrl");
    expect(editorShortcutIssue("Mod+W")).toContain("riservata");
    expect(editorShortcutIssue("Alt+F4")).toContain("riservata");
    expect(editorShortcutIssue("Mod+C")).toContain("riservata");
    expect(editorShortcutIssue("Mod+Enter")).toContain("riservata");
    expect(editorShortcutIssue("ArrowLeft")).toContain("Aggiungi Ctrl");
    expect(editorShortcutsIssue({ ...defaultEditorShortcuts(), save: ["Mod+D"] })).toContain("già assegnata");
  });
  it("conserva la disattivazione e recupera predefiniti da preferenze corrotte", () => {
    const bindings = { ...defaultEditorShortcuts(), undo: [], save: ["Ctrl+Alt+S"] };
    const parsed = parseEditorShortcuts(JSON.stringify({ version: 1, bindings, obsolete: "ignored" }));
    expect(parsed.undo).toEqual([]); expect(parsed.save).toEqual(["Mod+Alt+S"]);
    expect(parseEditorShortcuts("{broken")).toEqual(defaultEditorShortcuts());
    expect(parseEditorShortcuts({ version: 1, bindings: { ...bindings, delete: ["Mod+D"] } })).toEqual(defaultEditorShortcuts());
    expect(parseEditorShortcuts({ version: 2, bindings })).toEqual(defaultEditorShortcuts());
  });
  it("salva solo preferenze e non applica un salvataggio fallito o una collisione", () => {
    const bindings = { ...defaultEditorShortcuts(), save: ["Mod+Alt+S"] };
    expect(useEditorShortcuts.getState().apply(bindings)).toBeUndefined();
    expect(parseEditorShortcuts(localStorage.getItem(editorShortcutsStorageKey))).toEqual(bindings);
    const previous = useEditorShortcuts.getState().bindings;
    expect(useEditorShortcuts.getState().apply({ ...bindings, save: ["Mod+D"] })).toContain("già assegnata");
    expect(useEditorShortcuts.getState().bindings).toBe(previous);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota exceeded"); });
    expect(useEditorShortcuts.getState().apply(defaultEditorShortcuts())).toContain("precedenti restano attive");
    expect(useEditorShortcuts.getState().bindings).toBe(previous);
  });
  it("ignora ripetizione, composizione e AltGr e limita i comandi durante la scrittura", () => {
    expect(editorShortcutFromEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, repeat: true }))).toBeUndefined();
    expect(editorShortcutFromEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, isComposing: true }))).toBeUndefined();
    const altGr = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, altKey: true });
    Object.defineProperty(altGr, "getModifierState", { value: (key: string) => key === "AltGraph" });
    expect(editorShortcutFromEvent(altGr)).toBeUndefined();
    expect(editorCommandForShortcut(defaultEditorShortcuts(), "Mod+Z", { editing: true })).toBeUndefined();
    expect(editorCommandForShortcut(defaultEditorShortcuts(), "Mod+S", { editing: true })).toBe("save");
    expect(editorCommandForShortcut(defaultEditorShortcuts(), "Delete", { mode: "navigate" })).toBeUndefined();
  });
});

describe("comandi reali dell’editor", () => {
  it("usa subito la nuova combinazione e disattiva quella precedente, anche dopo una rimonta", async () => {
    const save = vi.spyOn(useEditorStore.getState(), "save").mockResolvedValue(undefined);
    dispose = installEditorKeyboardShortcuts();
    useEditorShortcuts.getState().apply({ ...defaultEditorShortcuts(), save: ["Mod+Alt+S"] });
    expect(press("s", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press("s", { ctrlKey: true, altKey: true }).defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledOnce(); dispose(); dispose = installEditorKeyboardShortcuts();
    press("s", { metaKey: true, altKey: true }); expect(save).toHaveBeenCalledTimes(2);
  });
  it("lascia l’undo nativo nei campi e non intercetta scorciatoie in finestre aperte", () => {
    const undo = vi.spyOn(useEditorStore.getState(), "undo").mockResolvedValue(undefined);
    const save = vi.spyOn(useEditorStore.getState(), "save").mockResolvedValue(undefined);
    dispose = installEditorKeyboardShortcuts();
    const field = document.createElement("textarea"); document.body.append(field);
    expect(press("z", { ctrlKey: true }, field).defaultPrevented).toBe(false); expect(undo).not.toHaveBeenCalled();
    press("s", { ctrlKey: true }, field); expect(save).toHaveBeenCalledOnce();
    const modal = document.createElement("section"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); document.body.append(modal);
    expect(press("s", { ctrlKey: true }, field).defaultPrevented).toBe(false); expect(save).toHaveBeenCalledOnce();
  });
  it("non esegue comandi distruttivi in Usa e gestisce viste, strumenti e zoom", async () => {
    const remove = vi.spyOn(useEditorStore.getState(), "deleteSelection").mockResolvedValue(undefined);
    useEditorStore.setState({ interactionMode: "navigate" }); await runEditorCommand("delete"); expect(remove).not.toHaveBeenCalled();
    await runEditorCommand("visual"); expect(useEditorStore.getState().viewMode).toBe("visual");
    await runEditorCommand("plc"); expect(useEditorStore.getState().leftPanel).toBe("plc");
    await runEditorCommand("zoom-reset"); expect(useEditorStore.getState()).toMatchObject({ zoom: 1, fitCanvas: false });
    await runEditorCommand("zoom-fit"); expect(useEditorStore.getState().fitCanvas).toBe(true);
    await runEditorCommand("settings"); expect(useEditorShortcuts.getState()).toMatchObject({ open: true, section: "shortcuts" });
  });
  it("non perde la tastiera quando il target è il documento e rilascia il listener", () => {
    const undo = vi.spyOn(useEditorStore.getState(), "undo").mockResolvedValue(undefined);
    dispose = installEditorKeyboardShortcuts(); press("z", { ctrlKey: true }); expect(undo).toHaveBeenCalledOnce();
    dispose(); dispose = undefined; press("z", { ctrlKey: true }); expect(undo).toHaveBeenCalledOnce();
  });
});
