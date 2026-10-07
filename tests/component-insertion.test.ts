// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
import { projectComponentJsx } from "../src/core/projectIndex";

const bridge = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: {
    readFile: bridge.readFile,
    writeFile: bridge.writeFile,
  },
}));

import { useEditorStore } from "../src/state/editorStore";

const overlay = `export function Overlay() {
  return (
    <svg viewBox="0 0 100 100">
      <rect x="1" y="1" width="8" height="8" />
    </svg>
  );
}
`;

const page = `export function Page() {
  return (
    <main className="page">
      <p>Contenuto</p>
    </main>
  );
}
`;

function nodeOfType(file: string, source: string, type: string) {
  const document = parseSource(file, source);
  const node = Object.values(document.nodes).find((item) => item.type === type);
  if (!node) throw new Error(`nessun <${type}> in ${file}`);
  return node;
}

describe("inserting a component", () => {
  beforeEach(() => {
    bridge.readFile.mockReset();
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    useEditorStore.setState({
      history: [], future: [], consoleEntries: [], lastError: undefined, consoleOpen: false,
      selectedId: undefined, unresolvedSelection: undefined, selectionStyles: {}, document: undefined,
    });
  });

  it("writes into the file the component was dropped on, not the file that happens to be open", async () => {
    // The canvas shows a page assembled from several components: the drop target regularly belongs to
    // a file other than the one the editor has open.
    useEditorStore.setState({ document: parseSource("Overlay.jsx", overlay) });
    const container = nodeOfType("Page.jsx", page, "main");
    bridge.readFile.mockResolvedValue(page);

    await useEditorStore.getState().insertComponent("  <span>Nuovo</span>", {
      source: container.source, x: 40, y: 25, positionContainer: true,
    });

    const state = useEditorStore.getState();
    expect(state.lastError).toBeUndefined();
    expect(state.document?.file).toBe("Page.jsx");
    expect(state.document?.source).toContain("<span");
    expect(bridge.writeFile).toHaveBeenCalledWith("Page.jsx", expect.stringContaining("Nuovo"));
    expect(useEditorStore.getState().document?.source).not.toContain("<svg");
  });

  it("selects what it just inserted so the user can see the insert landed", async () => {
    useEditorStore.setState({ document: parseSource("Page.jsx", page) });

    await useEditorStore.getState().insertComponent('  <button type="button">Premi</button>');

    const state = useEditorStore.getState();
    const selected = state.selectedId ? state.document?.nodes[state.selectedId] : undefined;
    expect(selected?.type).toBe("button");
    expect(state.history).toHaveLength(1);
  });

  it("inserisce nella pagina visibile anche se il file aperto è rimasto sul guscio", async () => {
    useEditorStore.setState({ document: parseSource("Overlay.jsx", overlay), pages: [{ id: "visible", name: "Pagina", route: "/pagina", file: "Page.jsx" }], activePageId: "visible", dirty: false });
    bridge.readFile.mockResolvedValue(page);
    try {
      await useEditorStore.getState().insertComponent('<button type="button">Nuovo</button>');
      expect(useEditorStore.getState().lastError).toBeUndefined();
      expect(bridge.writeFile).toHaveBeenCalledWith("Page.jsx", expect.stringContaining("Nuovo"));
      expect(useEditorStore.getState().document?.file).toBe("Page.jsx");
    } finally { useEditorStore.setState({ pages: [], activePageId: undefined }); }
  });

  it("imports a component taken from the project palette and removes its transport marker", async () => {
    const file = "C:/panel/pages/Page.jsx";
    useEditorStore.setState({ document: parseSource(file, page) });
    const jsx = projectComponentJsx({
      name: "MachineCommand", file: "C:/panel/MachineCommand.jsx", exported: "default", isDefault: true,
      usageCount: 2, exampleProps: { label: '"AVVIA"', size: "140", onClick: "startMachine" },
      carriedProps: { label: '"AVVIA"', size: "140" }, carriedImports: [], missingProps: [], droppedHandlers: ["onClick"],
    });

    await useEditorStore.getState().insertComponent(jsx);

    const source = useEditorStore.getState().document?.source ?? "";
    expect(source).toContain('import MachineCommand from "../MachineCommand";');
    expect(source).toContain('<MachineCommand label="AVVIA" size={140} />');
    expect(source).not.toContain("framecraft-project:");
    expect(source).not.toContain("onClick");
  });

  it("refuses an SVG drawing instead of silently writing a component nothing will render", async () => {
    useEditorStore.setState({ document: parseSource("Overlay.jsx", overlay) });

    await useEditorStore.getState().insertComponent("  <span>Nuovo</span>");

    const state = useEditorStore.getState();
    expect(state.document?.source).toBe(overlay);
    expect(state.lastError).toMatch(/Overlay\.jsx/);
    expect(state.lastError).toMatch(/Trascina il componente/);
  });

  it("non inserisce in un altro contenitore se i riferimenti del drop sono scaduti", async () => {
    useEditorStore.setState({ document: parseSource("Page.jsx", page), dirty: false });
    const container = nodeOfType("Page.jsx", page, "main");
    await useEditorStore.getState().insertComponent("<span>Non inserire</span>", { source: { ...container.source, start: container.source.start + 10 }, x: 10, y: 20, positionContainer: true });
    expect(bridge.writeFile).not.toHaveBeenCalled(); expect(useEditorStore.getState().document?.source).toBe(page); expect(useEditorStore.getState().lastError).toContain("pagina è cambiata");
  });
});

describe("selecting an element the preview describes with stale offsets", () => {
  beforeEach(() => {
    bridge.readFile.mockReset();
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    useEditorStore.setState({
      project: undefined, externalRoots: [], selectedId: undefined, unresolvedSelection: undefined,
      highlightPicker: undefined, consoleEntries: [],
    });
  });

  it("re-reads the file before declaring the element gone", async () => {
    // The open document is one edit behind what the preview was built from, so the reported range
    // does not exist in memory even though it exists perfectly well on disk.
    const stale = `export const Page = () => <main><p>Vecchio</p></main>;`;
    const current = `export const Page = () => <main className="page"><p>Vecchio</p></main>;`;
    useEditorStore.setState({ document: parseSource("Page.jsx", stale) });
    const paragraph = nodeOfType("Page.jsx", current, "p");
    bridge.readFile.mockResolvedValue(current);

    await useEditorStore.getState().selectSource(paragraph.source, "p");

    const state = useEditorStore.getState();
    expect(state.unresolvedSelection).toBeUndefined();
    expect(state.document?.source).toBe(current);
    expect(state.selectedId && state.document?.nodes[state.selectedId]?.type).toBe("p");
  });

  it("says the element is gone once the file on disk no longer contains it", async () => {
    const stale = `export const Page = () => <main><p>Rimosso</p></main>;`;
    const paragraph = nodeOfType("Page.jsx", stale, "p");
    const current = `export const Page = () => <main></main>;`;
    useEditorStore.setState({ document: parseSource("Page.jsx", current) });
    bridge.readFile.mockResolvedValue(current);

    await useEditorStore.getState().selectSource(paragraph.source, "p");

    expect(useEditorStore.getState().unresolvedSelection?.reason).toBe("missing");
    expect(useEditorStore.getState().selectedId).toBeUndefined();
  });

  it("deletes an element rendered by a .map() instead of dying on a parser error", async () => {
    // The user's panels are built out of lists, so most buttons on screen are the body of a map
    // callback. Cutting one out would leave an arrow function with no body, and the edit used to
    // come back as "Unexpected token" with nothing deleted.
    const list = `export const Bar = ({ parts }) => (
  <div className="shortcuts">
    {parts.map((part) => (
      <button type="button" key={part.id}>{part.label}</button>
    ))}
  </div>
);
`;
    const document = parseSource("Bar.jsx", list);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    bridge.readFile.mockResolvedValue(list);
    useEditorStore.setState({ document, selectedId: button.id, consoleEntries: [], lastError: undefined, history: [], future: [] });

    await useEditorStore.getState().deleteSelection();

    const state = useEditorStore.getState();
    expect(state.lastError).toBeUndefined();
    expect(state.document?.source).not.toContain("<button");
    expect(bridge.writeFile).toHaveBeenCalledWith("Bar.jsx", expect.not.stringContaining("<button"));
    // Undo has to be able to bring it back.
    expect(state.history).toHaveLength(1);
    expect(state.consoleEntries.map((item) => item.message).join(" ")).toMatch(/Ctrl\+Z/);
  });

  it("keeps the file untouched and says so when a change would not compile", async () => {
    const page = `export const Page = () => <main><p>Testo</p></main>;`;
    const document = parseSource("Page.jsx", page);
    useEditorStore.setState({ document, selectedId: undefined, consoleEntries: [], lastError: undefined, history: [] });
    bridge.writeFile.mockClear();

    // replaceCode is the code view: it can hold anything the user typed, including a broken buffer.
    useEditorStore.getState().replaceCode("export const Page = () => <main><p>Testo</main>;");
    await useEditorStore.getState().save();

    expect(bridge.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().lastError).toMatch(/Page\.jsx/);
  });

  it("explains why the Delete key did nothing instead of staying silent", async () => {
    useEditorStore.setState({
      document: parseSource("Page.jsx", page),
      selectedId: undefined,
      unresolvedSelection: { file: "Page.jsx", source: { file: "Page.jsx", start: 1, end: 2, line: 1, column: 1 }, reason: "missing" },
      consoleEntries: [],
    });

    await useEditorStore.getState().deleteSelection();

    const messages = useEditorStore.getState().consoleEntries.map((item) => item.message);
    expect(messages.join(" ")).toMatch(/Page\.jsx/);
    expect(messages.join(" ")).toMatch(/Aggiorna l'anteprima/);
  });
});
