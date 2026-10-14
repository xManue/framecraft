import { create } from "zustand";
import { defaultEditorShortcuts, editorShortcutsIssue, parseEditorShortcuts, type EditorShortcutBindings } from "../../scripts/editor-shortcuts.mjs";

export const editorShortcutsStorageKey = "framecraft.shortcuts.v1";
function load() {
  try { return parseEditorShortcuts(localStorage.getItem(editorShortcutsStorageKey)); }
  catch { return defaultEditorShortcuts(); }
}
export const useEditorShortcuts = create<{
  bindings: EditorShortcutBindings;
  open: boolean;
  section: "shortcuts" | "workspace" | "assistance" | "ai";
  setOpen(open: boolean, section?: "shortcuts" | "workspace" | "assistance" | "ai"): void;
  apply(bindings: EditorShortcutBindings): string | undefined;
}>((set) => ({
  bindings: load(), open: false, section: "workspace",
  setOpen: (open, section = "workspace") => set({ open, section }),
  apply(bindings) {
    const issue = editorShortcutsIssue(bindings); if (issue) return issue;
    const next = parseEditorShortcuts({ version: 1, bindings });
    try { localStorage.setItem(editorShortcutsStorageKey, JSON.stringify({ version: 1, bindings: next })); }
    catch { return "Non riesco a conservare le scorciatoie. Controlla lo spazio e l’accesso alle preferenze dell’app, poi riprova. Le impostazioni precedenti restano attive."; }
    set({ bindings: next }); return undefined;
  },
}));
