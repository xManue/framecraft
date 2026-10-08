// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
const loading = vi.hoisted(() => ({ editorReady: false }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
vi.mock("../src/source-parser/lineEndings", async (importOriginal) => {
  if (loading.editorReady) throw new TypeError("Failed to fetch dynamically imported module: http://localhost:1420/src/source-parser/lineEndings.ts");
  return importOriginal<typeof import("../src/source-parser/lineEndings")>();
});
import { Inspector } from "../src/inspector/Inspector";
import { useEditorStore } from "../src/state/editorStore";
import { parseSource } from "../src/source-parser/parseSource";
import { parseHmiEvents } from "../src/core/hmiEvents";
import { readGuidedAction } from "../src/core/hmiActions";

const initial = useEditorStore.getState();
const file = "C:/synthetic-panel/src/App.tsx";
const native = "onChange={(event) => setLayoutMode(event.target.value as typeof layoutMode)}";
const source = `export function App() {\r\n  const [layoutMode, setLayoutMode] = useState("auto");\r\n  return <select data-fc-reacts="true" value={layoutMode} ${native}><option value="auto">Automatico</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select>;\r\n}\r\n`;
beforeEach(() => {
  loading.editorReady = true;
  vi.clearAllMocks(); let disk = source;
  bridge.readFile.mockImplementation(async (path: string) => { if (path === file) return disk; throw Error("No synthetic file: " + path); });
  bridge.writeFile.mockImplementation(async (path: string, next: string) => { if (path !== file) throw Error("Unexpected write"); disk = next; });
  const document = parseSource(file, source), node = Object.values(document.nodes).find((item) => item.type === "select")!;
  useEditorStore.setState({ ...initial, project: { root: "C:/synthetic-panel", files: [] } as never,
    document, selectedId: node.id, selectionInfo: undefined, selectionStyles: {}, selectionRect: undefined,
    unresolvedSelection: undefined, multiSelection: [], listBinding: undefined, panelManifest: undefined,
    userAccessConfig: { permissions: [], accounts: [], autoLogoutMinutes: 0 }, externalRoots: [], unlockedFiles: [], unlockedPages: [],
    interactionMode: "edit", editScope: "instance", previewPath: "/", history: [], future: [], consoleEntries: [], lastError: undefined, dirty: false });
  HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterEach(() => { useEditorStore.setState(initial); vi.restoreAllMocks(); });
describe("Aggiungi azione attraverso il vero store", () => {
  it("aggiunge l'azione a un select con onChange, conserva CRLF e gestore nativo e permette annulla/ripeti", async () => {
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(createElement(Inspector)));
      await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent === "Azioni")!.click());
      await act(async () => {
        container.querySelector<HTMLButtonElement>(".hmi-event-add")!.click();
        await vi.waitFor(() => expect(useEditorStore.getState().document!.source).toContain("data-hmi-events="));
      });
      const updated = useEditorStore.getState(), node = updated.document!.nodes[updated.selectedId!];
      const actions = parseHmiEvents(node.props["data-hmi-events"]);
      expect(actions).toHaveLength(1); expect(readGuidedAction(actions[0].script)).toEqual({ kind: "trace", target: "Evento eseguito" });
      const next = updated.document!.source;
      expect(next).toContain(native); expect(next.replaceAll("\r\n", "")).not.toContain("\n");
      expect(updated.history).toHaveLength(1); expect(updated.lastError).toBeUndefined(); expect(updated.dirty).toBe(false);
      expect(bridge.writeFile).toHaveBeenLastCalledWith(file, next);
      await act(async () => { await useEditorStore.getState().undo(); }); expect(useEditorStore.getState().document!.source).toBe(source);
      await act(async () => { await useEditorStore.getState().redo(); }); expect(useEditorStore.getState().document!.source).toBe(next);
      expect(bridge.writeFile).toHaveBeenCalledTimes(3);
    } finally { await act(async () => root.unmount()); }
  });
});
