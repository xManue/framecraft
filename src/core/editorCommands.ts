import { editorCommands, editorShortcutFromEvent, editorCommandForShortcut, type EditorCommandId } from "../../scripts/editor-shortcuts.mjs";
import { useEditorStore, type EditorState } from "../state/editorStore";
import { useEditorShortcuts } from "../state/editorShortcuts";

export function editorCommandEnabled(id: EditorCommandId, state: EditorState) {
  if (state.reloadRecovery || state.loading || state.exporting) return false;
  if (["commands", "settings", "open"].includes(id)) return true;
  if (!state.project) return false;
  if (editorCommands.find(command => command.id === id)?.edit && state.interactionMode !== "edit") return false;
  if (id === "save") return !!state.document;
  if (id === "undo") return !!state.history.length;
  if (id === "redo") return !!state.future.length;
  if (id === "duplicate") return !!state.document && !!state.selectedId;
  if (id === "delete") return !!state.document && (!!state.selectedId || !!state.multiSelection.length);
  if (id === "preview") return !!state.previewUrl;
  return true;
}

export function editorModalOpen() {
  return !!document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]');
}

export async function runEditorCommand(id: EditorCommandId) {
  const state = useEditorStore.getState();
  if (!editorCommandEnabled(id, state)) return;
  try {
    switch (id) {
      case "commands": state.setPaletteOpen(true); break;
      case "settings": useEditorShortcuts.getState().setOpen(true, "shortcuts"); break;
      case "open": await state.chooseAndOpenProject(); break;
      case "save": await state.save(); break;
      case "export": await state.saveProjectAs(); break;
      case "undo": await state.undo(); break;
      case "redo": await state.redo(); break;
      case "duplicate": await state.duplicateSelection(); break;
      case "delete": await state.deleteSelection(); break;
      case "visual": state.setViewMode("visual"); break;
      case "split": state.setViewMode("split"); break;
      case "code": state.setViewMode("code"); break;
      case "edit": state.setInteractionMode("edit"); break;
      case "use": state.setInteractionMode("navigate"); break;
      case "pages": state.setLeftPanel("pages"); break;
      case "components": state.setLeftPanel("components"); break;
      case "plc": state.setLeftPanel("plc"); break;
      case "diagnostics": state.setConsoleOpen(!state.consoleOpen); break;
      case "check": await state.checkHmiProject(); break;
      case "preview": await state.openStandalonePreview(); break;
      case "zoom-in": state.setFitCanvas(false); state.setZoom(state.zoom + .1); break;
      case "zoom-out": state.setFitCanvas(false); state.setZoom(state.zoom - .1); break;
      case "zoom-reset": state.setFitCanvas(false); state.setZoom(1); break;
      case "zoom-fit": state.setFitCanvas(true); break;
      case "snap": state.setSnap({ enabled: !state.snap.enabled }); break;
    }
  } catch (error) { state.addPreviewOutput("stderr", `Il comando «${editorCommands.find(command => command.id === id)?.label ?? id}» non è riuscito: ${error instanceof Error ? error.message : String(error)}`); }
}

export function installEditorKeyboardShortcuts(view: Window = window) {
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || editorModalOpen()) return;
    const state = useEditorStore.getState();
    if (state.standalonePreviewOpen) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('[data-editor-shortcuts="off"]')) return;
    const editing = !!target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
    const shortcut = editorShortcutFromEvent(event);
    const command = editorCommandForShortcut(useEditorShortcuts.getState().bindings, shortcut, { editing, mode: state.interactionMode });
    if (!command) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (editorCommandEnabled(command, state)) void runEditorCommand(command);
  };
  view.addEventListener("keydown", keydown, true);
  return () => view.removeEventListener("keydown", keydown, true);
}
