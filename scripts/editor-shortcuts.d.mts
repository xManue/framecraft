export type EditorCommandId = "commands" | "settings" | "open" | "save" | "export" | "undo" | "redo" | "duplicate" | "delete" | "visual" | "split" | "code" | "edit" | "use" | "pages" | "components" | "plc" | "diagnostics" | "check" | "preview" | "zoom-in" | "zoom-out" | "zoom-reset" | "zoom-fit" | "snap";
export interface EditorCommand { id: EditorCommandId; label: string; group: string; description: string; defaults: readonly string[]; typing?: boolean; edit?: boolean }
export type EditorShortcutBindings = Record<EditorCommandId, string[]>;
export const editorCommands: readonly EditorCommand[];
export function defaultEditorShortcuts(): EditorShortcutBindings;
export function normalizeEditorShortcut(value: unknown): string | undefined;
export function editorShortcutIssue(value: unknown): string | undefined;
export function editorShortcutsIssue(bindings: unknown): string | undefined;
export function parseEditorShortcuts(raw: unknown): EditorShortcutBindings;
export function editorShortcutFromEvent(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing" | "repeat"> & { getModifierState?(key: string): boolean }): string | undefined;
export function editorCommandForShortcut(bindings: EditorShortcutBindings, shortcut: unknown, context?: { editing?: boolean; mode?: "edit" | "navigate" }): EditorCommandId | undefined;
export function formatEditorShortcut(shortcut?: string, mac?: boolean): string;
