import { lazy } from "react";

// Both React and the browser cache rejected imports. On an explicit dev retry,
// use a fresh module URL without reloading the window or changing project state.
export function createEditorComponents(retry = false) {
  const token = retry && import.meta.env.DEV ? crypto.randomUUID() : undefined;
  function load<T>(file: string, original: () => Promise<T>): Promise<T> {
    return token ? import(/* @vite-ignore */ `/src/editor/${file}.tsx?framecraft-retry=${token}`) : original();
  }
  return {
    AppShell: lazy(() => load("AppShell", () => import("../editor/AppShell")).then(module => ({ default: module.AppShell }))),
    CommandPalette: lazy(() => load("CommandPalette", () => import("../editor/CommandPalette")).then(module => ({ default: module.CommandPalette }))),
    UserAccessWindow: lazy(() => load("UserAccessWindow", () => import("../editor/UserAccessWindow")).then(module => ({ default: module.UserAccessWindow }))),
    EditorSettings: lazy(() => load("EditorSettings", () => import("../editor/EditorSettings")).then(module => ({ default: module.EditorSettings }))),
    EditorHelp: lazy(() => load("EditorHelp", () => import("../editor/EditorHelp")).then(module => ({ default: module.EditorHelp }))),
    AiAssistant: lazy(() => load("AiAssistant", () => import("../editor/AiAssistant")).then(module => ({ default: module.AiAssistant }))),
  };
}
