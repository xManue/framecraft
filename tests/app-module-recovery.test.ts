// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({ fail: true, imports: 0, factories: 0, renderError: false }));
const bridge = vi.hoisted(() => ({ closeProject: vi.fn(), startPreview: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: false, desktopBridge: bridge }));
vi.mock("../src/editor/WelcomeScreen", async () => {
  const { createElement } = await import("react");
  return { WelcomeScreen: () => createElement("div", null, "Project list") };
});
vi.mock("../src/app/editorComponents", async () => {
  const { createElement, lazy } = await import("react");
  return { createEditorComponents: () => {
    control.factories++;
    const Empty = () => null;
    return {
      AppShell: lazy(async () => {
        control.imports++;
        if (control.fail) throw new TypeError("Failed to fetch dynamically imported module: http://localhost:1420/src/editor/AppShell.tsx");
        return { default: () => {
          if (control.renderError) throw new Error("Unexpected render failure");
          return createElement("div", { "data-testid": "editor" }, "Project editor");
        } };
      }),
      CommandPalette: Empty, UserAccessWindow: Empty, EditorSettings: Empty, EditorHelp: Empty, AiAssistant: Empty,
    };
  } };
});
import { App } from "../src/app/App";
import { useEditorStore } from "../src/state/editorStore";

const initial = useEditorStore.getState();
let root: Root;
let host: HTMLDivElement;
const button = (text: string) => [...host.querySelectorAll("button")].find(item => item.textContent?.includes(text))!;
async function mount() { await act(async () => root.render(createElement(App))); }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  control.fail = true; control.imports = 0; control.factories = 0; control.renderError = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.clearAllMocks();
  useEditorStore.setState({ ...initial, project: { root: "C:/synthetic-project", name: "Synthetic" } as never,
    document: { file: "C:/synthetic-project/App.jsx", source: "unsaved draft", nodes: {}, roots: [], version: 3 },
    dirty: true, history: [{ file: "C:/synthetic-project/App.jsx", source: "previous version" }],
    loading: false, reloadRecovery: undefined, draftBackup: undefined, previewSessionId: "existing-preview",
    previewStatus: "ready", previewUrl: "http://localhost:4173", paletteOpen: false, userAccessOpen: false }, true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});

afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it("retries a rejected lazy import only on request, preserving project, draft, undo and preview", async () => {
  const before = useEditorStore.getState();
  await mount();
  expect(host.textContent).toContain("Riprova caricamento");
  expect(control.imports).toBe(1);
  control.fail = false;
  await act(async () => root.render(createElement(App)));
  expect(control.imports).toBe(1);
  await act(async () => button("Riprova caricamento").click());
  expect(host.querySelector('[data-testid="editor"]')).not.toBeNull();
  expect(control.imports).toBe(2);
  const after = useEditorStore.getState();
  expect(after.project).toBe(before.project); expect(after.document).toBe(before.document);
  expect(after.dirty).toBe(true); expect(after.history).toBe(before.history);
  expect(after.previewSessionId).toBe("existing-preview");
  expect(bridge.closeProject).not.toHaveBeenCalled(); expect(bridge.startPreview).not.toHaveBeenCalled();
  expect(bridge.writeFile).not.toHaveBeenCalled();
});

it("keeps technical details and the draft if a manual retry fails again, without a retry loop", async () => {
  await mount();
  await act(async () => button("Riprova caricamento").click());
  expect(control.imports).toBe(2);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.textContent).toContain("http://localhost:1420/src/editor/AppShell.tsx");
  expect(useEditorStore.getState().document?.source).toBe("unsaved draft");
  await act(async () => root.render(createElement(App)));
  expect(control.imports).toBe(2);
});

it("keeps the recovery screen when leaving a dirty project is cancelled", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  await mount();
  await act(async () => button("Torna ai progetti").click());
  expect(host.textContent).toContain("Riprova caricamento");
  expect(useEditorStore.getState().dirty).toBe(true);
  expect(control.factories).toBe(1); expect(bridge.closeProject).not.toHaveBeenCalled();
});

it("does not treat an ordinary rendering defect as a failed module download", async () => {
  control.fail = false; control.renderError = true;
  await mount();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.textContent).toContain("Unexpected render failure");
  expect(button("Riprova caricamento")).toBeUndefined();
});
