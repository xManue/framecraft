// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
import { useEditorStore } from "../src/state/editorStore";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn(), closeProject: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));

const label = parseSource("C:/panel/src/Label.tsx", "export default function Label(){ return <span>Targhetta</span>; }");
const button = parseSource("C:/panel/src/Button.tsx", "export default function Button(){ return <button>Pulsante</button>; }");
const labelNode = Object.values(label.nodes)[0];
const buttonNode = Object.values(button.nodes)[0];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.writeFile.mockResolvedValue(undefined);
  bridge.closeProject.mockResolvedValue(undefined);
  useEditorStore.setState({ project: { root: "C:/panel", files: [] } as never, document: undefined,
    selectedId: undefined, selectionInfo: undefined, selectionStyles: {}, selectionRect: undefined,
    unresolvedSelection: undefined, listBinding: undefined, highlightPicker: undefined,
    interactionMode: "edit", loading: false, dirty: false, previewPath: "/", history: [], future: [], consoleEntries: [] });
});

describe("the most recent selection owns asynchronous file reads", () => {
  it("does not let an older label read replace the latest button or its rendered information", async () => {
    const oldRead = deferred<string>();
    bridge.readFile.mockImplementation((file: string) => file === label.file ? oldRead.promise : Promise.resolve(button.source));
    const oldSelection = useEditorStore.getState().selectSource(labelNode.source);
    useEditorStore.setState({ selectionInfo: { text: "Pulsante" }, selectionStyles: { color: "blue" } });
    expect(await useEditorStore.getState().selectSource(buttonNode.source)).toBe(true);
    const current = useEditorStore.getState().document;
    oldRead.resolve(label.source);
    expect(await oldSelection).toBe(false);
    expect(useEditorStore.getState()).toMatchObject({ document: current, selectedId: buttonNode.id,
      selectionInfo: { text: "Pulsante" }, selectionStyles: { color: "blue" }, unresolvedSelection: undefined });
  });

  it("ignores the failure of an older read after a newer click succeeds", async () => {
    const oldRead = deferred<string>();
    bridge.readFile.mockImplementation((file: string) => file === label.file ? oldRead.promise : Promise.resolve(button.source));
    const oldSelection = useEditorStore.getState().selectSource(labelNode.source);
    await useEditorStore.getState().selectSource(buttonNode.source);
    oldRead.reject(new Error("old file unavailable"));
    expect(await oldSelection).toBe(false);
    expect(useEditorStore.getState().selectedId).toBe(buttonNode.id);
    expect(useEditorStore.getState().unresolvedSelection).toBeUndefined();
    expect(useEditorStore.getState().consoleEntries.some((entry) => entry.message.includes("old file unavailable"))).toBe(false);
  });

  it("keeps an unsaved document changed while the selection read was pending", async () => {
    const oldRead = deferred<string>();
    bridge.readFile.mockReturnValue(oldRead.promise);
    const selecting = useEditorStore.getState().selectSource(labelNode.source);
    const buffer = parseSource(button.file, button.source.replace("Pulsante", "Modifica non salvata"));
    useEditorStore.setState({ document: buffer, dirty: true });
    oldRead.resolve(label.source);
    expect(await selecting).toBe(false);
    expect(useEditorStore.getState().document).toBe(buffer);
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("does not let a slow file opening replace a newer clicked component", async () => {
    const oldRead = deferred<string>();
    bridge.readFile.mockImplementation((file: string) => file === label.file ? oldRead.promise : Promise.resolve(button.source));
    const opening = useEditorStore.getState().openFile(label.file);
    await useEditorStore.getState().selectSource(buttonNode.source);
    oldRead.resolve(label.source);
    await opening;
    expect(useEditorStore.getState().document?.file).toBe(button.file);
    expect(useEditorStore.getState().selectedId).toBe(buttonNode.id);
  });

  it("saves an already dirty buffer before selecting an element from another file", async () => {
    const buffer = parseSource(label.file, label.source.replace("Targhetta", "Targhetta modificata"));
    useEditorStore.setState({ document: buffer, dirty: true });
    bridge.readFile.mockResolvedValue(button.source);
    expect(await useEditorStore.getState().selectSource(buttonNode.source)).toBe(true);
    expect(bridge.writeFile).toHaveBeenCalledWith(label.file, buffer.source);
    expect(bridge.writeFile.mock.invocationCallOrder[0]).toBeLessThan(bridge.readFile.mock.invocationCallOrder[0]);
    expect(useEditorStore.getState()).toMatchObject({ selectedId: buttonNode.id, dirty: false });
  });

  it("keeps the dirty buffer if saving it before a click fails", async () => {
    useEditorStore.setState({ document: label, dirty: true });
    bridge.writeFile.mockRejectedValue(new Error("save denied"));
    expect(await useEditorStore.getState().selectSource(buttonNode.source)).toBe(false);
    expect(useEditorStore.getState().document).toBe(label);
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(bridge.readFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().consoleEntries.some((entry) => entry.message.includes("save denied"))).toBe(true);
  });

  it("does not write or discard invalid unsaved code when another component is clicked", async () => {
    const buffer = { ...label, source: "export default function Label(){ return <span>" };
    useEditorStore.setState({ document: buffer, dirty: true });
    expect(await useEditorStore.getState().selectSource(buttonNode.source)).toBe(false);
    expect(useEditorStore.getState().document).toBe(buffer);
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(bridge.readFile).not.toHaveBeenCalled();
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("does not replace a dirty same-file buffer with a disk reread for stale preview offsets", async () => {
    useEditorStore.setState({ document: label, dirty: true });
    const stale = { ...labelNode.source, start: labelNode.source.start + 10, end: labelNode.source.end + 10 };
    expect(await useEditorStore.getState().selectSource(stale)).toBe(false);
    expect(useEditorStore.getState().document).toBe(label);
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(bridge.readFile).not.toHaveBeenCalled();
    expect(bridge.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().unresolvedSelection?.detail).toContain("non salvate");
  });

  it("keeps a newer buffer modified while an older buffer is being flushed", async () => {
    const saving = deferred<void>();
    const started = deferred<void>();
    bridge.writeFile.mockImplementation(() => { started.resolve(); return saving.promise; });
    useEditorStore.setState({ document: label, dirty: true });
    const selecting = useEditorStore.getState().selectSource(buttonNode.source);
    await started.promise;
    const buffer = parseSource(label.file, label.source.replace("Targhetta", "Nuovo buffer non salvato"));
    useEditorStore.setState({ document: buffer, dirty: true });
    saving.resolve();
    expect(await selecting).toBe(false);
    expect(useEditorStore.getState().document).toBe(buffer);
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(bridge.readFile).not.toHaveBeenCalled();
  });

  it("does not reload the current dirty file when it is opened again", async () => {
    useEditorStore.setState({ document: label, dirty: true });
    await useEditorStore.getState().openFile(label.file);
    expect(useEditorStore.getState().document).toBe(label);
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(bridge.readFile).not.toHaveBeenCalled();
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("does not let a pending file opening discard a newly edited buffer", async () => {
    const reading = deferred<string>();
    bridge.readFile.mockReturnValue(reading.promise);
    const opening = useEditorStore.getState().openFile(label.file);
    useEditorStore.setState({ document: button, dirty: true });
    reading.resolve(label.source);
    await opening;
    expect(useEditorStore.getState().document).toBe(button);
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("cancels a pending click when the user opens another file", async () => {
    const oldRead = deferred<string>();
    bridge.readFile.mockImplementation((file: string) => file === label.file ? oldRead.promise : Promise.resolve(button.source));
    const selecting = useEditorStore.getState().selectSource(labelNode.source);
    await useEditorStore.getState().openFile(button.file);
    oldRead.resolve(label.source);
    expect(await selecting).toBe(false);
    expect(useEditorStore.getState().document?.file).toBe(button.file);
    expect(useEditorStore.getState().selectedId).toBeUndefined();
  });

  it("does not restore a selection after leaving editing mode", async () => {
    const oldRead = deferred<string>();
    bridge.readFile.mockReturnValue(oldRead.promise);
    const selecting = useEditorStore.getState().selectSource(labelNode.source);
    useEditorStore.getState().setInteractionMode("navigate");
    oldRead.resolve(label.source);
    expect(await selecting).toBe(false);
    expect(useEditorStore.getState().selectedId).toBeUndefined();
  });

  it("does not reopen the inspector for a superseded double click", async () => {
    const oldRead = deferred<string>();
    bridge.readFile.mockImplementation((file: string) => file === label.file ? oldRead.promise : Promise.resolve(button.source));
    useEditorStore.setState({ propertiesExpandedAt: undefined, textFocusRequestedAt: undefined });
    const inspecting = useEditorStore.getState().inspectSource(labelNode.source, "span", true);
    await useEditorStore.getState().selectSource(buttonNode.source);
    oldRead.resolve(label.source);
    await inspecting;
    expect(useEditorStore.getState().selectedId).toBe(buttonNode.id);
    expect(useEditorStore.getState().propertiesExpandedAt).toBeUndefined();
    expect(useEditorStore.getState().textFocusRequestedAt).toBeUndefined();
  });

  it("does not commit a pending click after closing the project", async () => {
    const oldRead = deferred<string>();
    bridge.readFile.mockReturnValue(oldRead.promise);
    const selecting = useEditorStore.getState().selectSource(labelNode.source);
    await useEditorStore.getState().closeProject();
    oldRead.resolve(label.source);
    expect(await selecting).toBe(false);
    expect(useEditorStore.getState().project).toBeUndefined();
    expect(useEditorStore.getState().document).toBeUndefined();
    expect(useEditorStore.getState().selectedId).toBeUndefined();
  });
});
