// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
import type { SelectionItem } from "../src/core/types";
import { useEditorStore } from "../src/state/editorStore";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));

const label = parseSource("C:/panel/src/Label.tsx", "export default function Label(){ return <main><span>Targhetta</span></main>; }");
const button = parseSource("C:/panel/src/Button.tsx", "export default function Button(){ return <main><button>Pulsante</button></main>; }");
const repeated = parseSource("C:/panel/src/Labels.tsx", "export default function Labels({ items }) { return <main>{items.map(item => <span>{item.label}</span>)}</main>; }");
const labelNode = Object.values(label.nodes).find(node => node.type === "span")!;
const buttonNode = Object.values(button.nodes).find(node => node.type === "button")!;
const repeatedNode = Object.values(repeated.nodes).find(node => node.type === "span")!;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

const edits = {
  style: () => useEditorStore.getState().updateStyles({ color: "red" }),
  text: () => useEditorStore.getState().updateText("Nuova targhetta"),
  delete: () => useEditorStore.getState().deleteSelection(),
};
const editNames = Object.keys(edits) as (keyof typeof edits)[];

beforeEach(() => {
  vi.clearAllMocks();
  bridge.readFile.mockImplementation(async (file: string) => {
    if (file === label.file) return label.source;
    if (file === button.file) return button.source;
    if (file === repeated.file) return repeated.source;
    throw new Error(`No fixture for ${file}`);
  });
  bridge.writeFile.mockResolvedValue(undefined);
  useEditorStore.setState({
    project: { root: "C:/panel", files: [] } as never,
    document: label, selectedId: labelNode.id,
    selectionInfo: { text: "Targhetta" }, selectionStyles: { color: "black" },
    selectionRect: undefined, unresolvedSelection: undefined, listBinding: undefined,
    externalRoots: [], unlockedFiles: [], unlockedPages: [], highlightPicker: undefined,
    panelManifest: undefined, pages: [], activePageId: undefined,
    interactionMode: "edit", editScope: "instance", loading: false, dirty: false,
    previewPath: "/", multiSelection: [], history: [], future: [], consoleEntries: [], lastError: undefined,
  });
});

describe("an asynchronous selection edit keeps its original target", () => {
  it.each(editNames)("cancels an old %s edit when another component is clicked before the source transform resumes", async name => {
    const changing = edits[name]();
    useEditorStore.setState({ selectionInfo: { text: "Pulsante" }, selectionStyles: { color: "blue" } });
    expect(await useEditorStore.getState().selectSource(buttonNode.source)).toBe(true);
    const latest = useEditorStore.getState().document;
    await changing;

    expect(bridge.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState()).toMatchObject({
      document: latest, selectedId: buttonNode.id,
      selectionInfo: { text: "Pulsante" }, selectionStyles: { color: "blue" }, dirty: false,
      history: [], lastError: undefined,
    });
    expect(useEditorStore.getState().consoleEntries.some(entry => entry.level === "success")).toBe(false);
  });

  it.each(editNames)("cancels an old %s edit when a different rendered copy of the same JSX is selected", async name => {
    useEditorStore.setState({ document: repeated, selectedId: repeatedNode.id,
      selectionInfo: { text: "M2400", instanceIndex: 0, listIndex: 0, instanceCount: 3 } });
    const changing = edits[name]();
    const copy = { text: "M2401", instanceIndex: 1, listIndex: 1, instanceCount: 3 };
    useEditorStore.setState({ selectionInfo: copy, selectionStyles: { color: "blue" } });
    expect(await useEditorStore.getState().selectSource(repeatedNode.source)).toBe(true);
    await changing;

    expect(bridge.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().document).toBe(repeated);
    expect(useEditorStore.getState()).toMatchObject({ selectedId: repeatedNode.id,
      selectionInfo: copy, selectionStyles: { color: "blue" }, history: [], dirty: false });
  });

  it.each(editNames)("rechecks the target after a delayed template ownership lookup for a %s edit", async name => {
    const file = `C:/shared/stalled-${name}/Labels.tsx`;
    const external = parseSource(file, label.source);
    const node = Object.values(external.nodes).find(item => item.type === "span")!;
    const lookupEntered = deferred<void>();
    const contract = deferred<string>();
    const templateFile = `C:/shared/stalled-${name}/template.json`;
    bridge.readFile.mockImplementation(async (requested: string) => {
      if (requested === templateFile) {
        lookupEntered.resolve();
        return contract.promise;
      }
      if (requested === button.file) return button.source;
      throw new Error(`No fixture for ${requested}`);
    });
    useEditorStore.setState({ document: external, selectedId: node.id, externalRoots: ["C:/shared"] });
    const changing = edits[name]();
    await lookupEntered.promise;
    useEditorStore.setState({ selectionInfo: { text: "Pulsante" }, selectionStyles: { color: "blue" } });
    expect(await useEditorStore.getState().selectSource(buttonNode.source)).toBe(true);
    const latest = useEditorStore.getState().document;
    contract.resolve(JSON.stringify({ id: `stalled-${name}`, name: "Shared labels", editableFiles: ["Labels.tsx"] }));
    await changing;

    expect(bridge.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState()).toMatchObject({ document: latest, selectedId: buttonNode.id,
      selectionStyles: { color: "blue" }, dirty: false, history: [], lastError: undefined });
  });

  it.each(editNames)("does not alter a newer selection after an earlier %s source write finishes", async name => {
    const shared = parseSource("C:/panel/src/Shared.tsx", "export default function Shared(){ return <main><span>Targhetta</span><button>Pulsante</button></main>; }");
    const span = Object.values(shared.nodes).find(item => item.type === "span")!;
    useEditorStore.setState({ document: shared, selectedId: span.id });
    const writeEntered = deferred<void>();
    const write = deferred<void>();
    bridge.writeFile.mockImplementation(() => {
      writeEntered.resolve();
      return write.promise;
    });
    const changing = edits[name]();
    await writeEntered.promise;
    const saved = useEditorStore.getState().document!;
    const next = Object.values(saved.nodes).find(item => item.type === "button")!;
    useEditorStore.setState({ selectionInfo: { text: "Pulsante" }, selectionStyles: { color: "blue" } });
    expect(await useEditorStore.getState().selectSource(next.source)).toBe(true);
    write.resolve();
    await changing;

    expect(bridge.writeFile).toHaveBeenCalledTimes(1);
    expect(bridge.writeFile.mock.calls[0][0]).toBe(shared.file);
    expect(useEditorStore.getState().document).toBe(saved);
    expect(useEditorStore.getState()).toMatchObject({ selectedId: next.id,
      selectionInfo: { text: "Pulsante" }, selectionStyles: { color: "blue" } });
  });

  it.each(["same file", "another file"])("does not mark a newer buffer in the %s saved when an older source write finishes", async destination => {
    const writeEntered = deferred<void>();
    const write = deferred<void>();
    bridge.writeFile.mockImplementation(() => {
      writeEntered.resolve();
      return write.promise;
    });
    const changing = edits.style();
    await writeEntered.promise;
    const base = destination === "same file" ? label : button;
    const buffer = parseSource(base.file, base.source.replace(destination === "same file" ? "Targhetta" : "Pulsante", "Modifica non salvata"));
    const node = Object.values(buffer.nodes).find(item => item.type === (destination === "same file" ? "span" : "button"))!;
    useEditorStore.setState({ document: buffer, selectedId: node.id, dirty: true,
      selectionInfo: { text: "Modifica non salvata" }, selectionStyles: { color: "blue" } });
    write.resolve();
    await changing;

    expect(bridge.writeFile).toHaveBeenCalledTimes(1);
    expect(bridge.writeFile.mock.calls[0][0]).toBe(label.file);
    expect(bridge.writeFile.mock.calls[0][1]).toContain("red");
    expect(useEditorStore.getState().document).toBe(buffer);
    expect(useEditorStore.getState()).toMatchObject({ selectedId: node.id, dirty: true,
      selectionInfo: { text: "Modifica non salvata" }, selectionStyles: { color: "blue" } });
  });

  it.each(["styles", "move", "align"])("stops the remaining %s batch edits after the user selects another component", async operation => {
    const group = parseSource("C:/panel/src/Group.tsx", "export default function Group(){ return <main><span>Primo</span><span>Secondo</span><span>Terzo</span></main>; }");
    const nodes = Object.values(group.nodes).filter(item => item.type === "span");
    const items: SelectionItem[] = nodes.map((node, index) => ({ source: node.source, instanceId: `group-${index}`,
      info: { text: node.text }, styles: { color: "black" }, translate: { x: 0, y: 0 },
      rect: { x: index * 30, y: 0, width: 20, height: 20 } }));
    useEditorStore.setState({ document: group, selectedId: nodes[0].id, multiSelection: items,
      selectionInfo: { text: "Old group" } });
    const firstWriteEntered = deferred<void>();
    const firstWrite = deferred<void>();
    bridge.writeFile.mockImplementationOnce(() => {
      firstWriteEntered.resolve();
      return firstWrite.promise;
    });
    const changing = operation === "styles" ? useEditorStore.getState().updateMultiSelectionStyles({ color: "red" })
      : operation === "move" ? useEditorStore.getState().commitMultiSelection(items.map(item => ({ ...item, translate: { x: 5, y: 3 } })))
        : useEditorStore.getState().alignSelection("left");
    await firstWriteEntered.promise;
    const latestInfo = { text: "Pulsante" };
    useEditorStore.setState({ selectionInfo: latestInfo, selectionStyles: { color: "blue" }, multiSelection: [] });
    expect(await useEditorStore.getState().selectSource(buttonNode.source)).toBe(true);
    const latest = useEditorStore.getState().document;
    firstWrite.resolve();
    await changing;

    expect(bridge.writeFile.mock.calls.every(call => call[0] === group.file)).toBe(true);
    const committedSources = bridge.writeFile.mock.calls.map(call => call[1] as string);
    expect(new Set(committedSources).size).toBe(1);
    expect(useEditorStore.getState().document).toBe(latest);
    expect(useEditorStore.getState()).toMatchObject({ selectedId: buttonNode.id,
      selectionInfo: latestInfo, selectionStyles: { color: "blue" }, multiSelection: [] });
    expect(useEditorStore.getState().consoleEntries.some(entry => /Proprietà applicata a|Gruppo spostato:|Allinea a sinistra:/.test(entry.message))).toBe(false);
  });

  it.each(["undo", "redo"] as const)("does not restore an old project's history after a delayed %s write", async operation => {
    const prior = { file: label.file, source: label.source.replace("Targhetta", "Prima") };
    const next = { file: label.file, source: label.source.replace("Targhetta", "Dopo") };
    useEditorStore.setState({ history: operation === "undo" ? [prior] : [], future: operation === "redo" ? [next] : [] });
    const writeEntered = deferred<void>();
    const write = deferred<void>();
    bridge.writeFile.mockImplementationOnce(() => {
      writeEntered.resolve();
      return write.promise;
    });
    const changing = useEditorStore.getState()[operation]();
    await writeEntered.promise;
    const newer = parseSource("C:/new-panel/src/Button.tsx", button.source);
    const selected = Object.values(newer.nodes).find(item => item.type === "button")!;
    const history = [{ file: newer.file, source: newer.source.replace("Pulsante", "Nuovo prima") }];
    const future = [{ file: newer.file, source: newer.source.replace("Pulsante", "Nuovo dopo") }];
    const project = { root: "C:/new-panel", files: [] } as never;
    useEditorStore.setState({ project, document: newer, selectedId: selected.id,
      dirty: true, history, future, selectionInfo: { text: "Pulsante" }, selectionStyles: { color: "blue" } });
    write.resolve();
    await changing;

    expect(bridge.writeFile).toHaveBeenCalledTimes(1);
    expect(bridge.writeFile.mock.calls[0][0]).toBe(label.file);
    expect(useEditorStore.getState().project).toBe(project);
    expect(useEditorStore.getState().document).toBe(newer);
    expect(useEditorStore.getState().history).toBe(history);
    expect(useEditorStore.getState().future).toBe(future);
    expect(useEditorStore.getState()).toMatchObject({ selectedId: selected.id, dirty: true,
      selectionInfo: { text: "Pulsante" }, selectionStyles: { color: "blue" } });
    expect(useEditorStore.getState().consoleEntries.some(entry => /Azione annullata|Azione ripristinata/.test(entry.message))).toBe(false);
  });
});
