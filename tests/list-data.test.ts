// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
import { duplicateListItem, findArrayLiteral, listReference, removeListItem, resolveListArray, setListItemHighlight } from "../src/source-parser/listData";
import { buildProjectIndex } from "../src/core/projectIndex";
import { clearModuleCache, loadModule } from "../src/core/moduleResolver";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { readFile: bridge.readFile, writeFile: bridge.writeFile },
}));
import { useEditorStore } from "../src/state/editorStore";

const dataFile = "C:/p/src/panelData.js";
const pageFile = "C:/p/src/Page.jsx";
const overlayFile = "C:/p/src/Overlay.jsx";

const data = `export const parts = [
  { id: "infeed", label: "Ingresso", pdfPage: 12 },
  { id: "capper", label: "Tappatrice", pdfPage: 40 },
  {
    id: "palletizer",
    label: "Pallettizzatore",
    pdfPage: 88,
    marker: { x: 90, y: 690, width: 190 },
    highlight: { type: "route", d: "M154 592 L158 486" },
  },
];
`;

const page = `import { parts } from "./panelData";
import Overlay from "./Overlay";

export default function Page() {
  return (
    <main>
      <Overlay parts={parts} onSelect={openPart} />
      {parts.map((part) => (
        <button key={part.id}>{part.label}</button>
      ))}
    </main>
  );
}
`;

const manualFile = "C:/p/src/Manual.jsx";

const manual = `import Overlay from "./Overlay";

export default function Manual() {
  return <Overlay parts={parts} onSelect={openManual} />;
}
`;

const overlay = `export default function Overlay({ parts, onSelect }) {
  return (
    <svg>
      {parts.map((part, index) => (
        <text key={part.id} onClick={() => onSelect(part.id)}>{part.label}</text>
      ))}
    </svg>
  );
}
`;

function nodeOf(file: string, source: string, type: string) {
  const node = Object.values(parseSource(file, source).nodes).find((item) => item.type === type);
  if (!node) throw new Error(`nessun <${type}>`);
  return node;
}

describe("the data behind a list", () => {
  it("follows a list to the array that feeds it, and to the property shown", () => {
    const button = nodeOf(pageFile, page, "button");
    const reference = listReference(page, button.source.start, button.source.end)!;

    expect(reference.name).toBe("parts");
    expect(reference.from).toEqual({ specifier: "./panelData", exported: "parts" });
    expect(reference.textProperty).toBe("label");

    const array = findArrayLiteral(data, "parts")!;
    expect(array.items).toHaveLength(3);
    expect(array.items[1].properties.map((property) => `${property.name}=${property.value}`))
      .toEqual(["id=capper", "label=Tappatrice", "pdfPage=40"]);
  });

  it("removes and duplicates a row without leaving the array broken", () => {
    const array = findArrayLiteral(data, "parts")!;

    const withoutMiddle = removeListItem(data, array.start, array.end, 1);
    expect(findArrayLiteral(withoutMiddle, "parts")!.items).toHaveLength(2);
    expect(withoutMiddle).not.toContain("Tappatrice");
    expect(withoutMiddle).toContain("Pallettizzatore");

    const withoutLast = removeListItem(data, array.start, array.end, 2);
    expect(findArrayLiteral(withoutLast, "parts")!.items).toHaveLength(2);

    const duplicated = duplicateListItem(data, array.start, array.end, 0);
    const items = findArrayLiteral(duplicated, "parts")!.items;
    expect(items).toHaveLength(4);
    expect(items[1].properties[0].value).toBe("infeed");
  });

  it("finds every panel that renders a component, not only the first", () => {
    // The same overlay is rendered by the machine view and by the manual, with a different handler
    // each: keeping only one call site is what made "cosa fa" fall back to a vague answer.
    const index = buildProjectIndex({ [pageFile]: page, [manualFile]: manual, [overlayFile]: overlay });
    const uses = index.usesOf(overlayFile);

    expect(uses).toHaveLength(2);
    expect(uses.map((use) => use.file)).toEqual([pageFile, manualFile]);
    expect(uses.map((use) => use.props.onSelect)).toEqual(["openPart", "openManual"]);
  });

  it("says where each value of the row is drawn, so a name like highlight.d can be recognised", () => {
    const index = buildProjectIndex({ [pageFile]: page, [overlayFile]: overlay });

    expect(index.whereUsed("label").map((use) => `${use.attribute || "(testo)"} di <${use.tag}>`))
      .toEqual(["(testo) di <button>", "(testo) di <text>"]);
    // `key={part.id}` is React bookkeeping: it says nothing about what the panel shows.
    expect(index.whereUsed("id")).toEqual([]);
  });

  it("reads the values nested inside a row, which is where a highlight lives", () => {
    const array = findArrayLiteral(data, "parts")!;
    const names = array.items[2].properties.map((property) => `${property.name}=${property.value}`);

    expect(names).toContain("marker.x=90");
    expect(names).toContain("highlight.type=route");
    expect(names).toContain("highlight.d=M154 592 L158 486");
  });
});

describe("the editor writes the data, not a guard in the JSX", () => {
  beforeEach(() => {
    clearModuleCache();
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    bridge.readFile.mockReset().mockImplementation(async (file: string) => {
      if (file === dataFile) return data;
      if (file === pageFile) return page;
      if (file === overlayFile) return overlay;
      throw new Error(`nessun file ${file}`);
    });
    const document = parseSource(pageFile, page);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({
      document, selectedId: button.id, history: [], future: [], consoleEntries: [], lastError: undefined,
      project: undefined, editScope: "instance", listBinding: undefined, callSites: undefined,
      selectionInfo: { instanceIndex: 1, instanceCount: 3, listIndex: 1 },
    });
  });

  function written(file: string) {
    return bridge.writeFile.mock.calls.filter((call) => call[0] === file).at(-1)?.[1] as string | undefined;
  }

  it("renames the row in its own file instead of writing a ternary into the page", async () => {
    await useEditorStore.getState().updateText("Tappatrice A");

    expect(useEditorStore.getState().lastError).toBeUndefined();
    expect(written(dataFile)).toContain('label: "Tappatrice A"');
    // The page keeps the clean `{part.label}` it always had.
    expect(written(pageFile)).toBeUndefined();
    expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("panelData.js");
  });

  it("changes any value of the row from the panel", async () => {
    await useEditorStore.getState().updateListItemProperty("pdfPage", "41");

    expect(written(dataFile)).toContain("pdfPage: 41");
    expect(useEditorStore.getState().lastError).toBeUndefined();
  });

  it("writes a nested value, so what a part highlights can be changed", async () => {
    useEditorStore.setState({ selectionInfo: { instanceIndex: 2, instanceCount: 3, listIndex: 2 } });

    await useEditorStore.getState().updateListItemProperty("highlight.d", "M1 2 L3 4");

    expect(useEditorStore.getState().lastError).toBeUndefined();
    expect(written(dataFile)).toContain('d: "M1 2 L3 4"');
    expect(written(dataFile)).toContain('type: "route"');
  });

  it("changes or removes the highlight without touching the other rows", async () => {
    useEditorStore.setState({ selectionInfo: { instanceIndex: 2, instanceCount: 3, listIndex: 2 } });
    await useEditorStore.getState().setListItemHighlight({ type: "area", d: "M1 1 L9 1 L9 9 Z" });
    const changed = written(dataFile)!;
    expect(changed).toContain('type: "area"');
    const array = findArrayLiteral(changed, "parts")!;
    const removed = setListItemHighlight(changed, array.start, array.end, 2);
    expect(removed).toContain('type: "none"');
    expect(removed).toContain('d: ""');
    expect(removed).toContain('label: "Ingresso"');
  });

  it("creates a highlight object when the row does not have one", () => {
    const array = findArrayLiteral(data, "parts")!;
    const created = setListItemHighlight(data, array.start, array.end, 0, { type: "area", d: "M1 1 L9 1 L9 9 Z" });
    expect(created).toContain('highlight: { type: "area", d: "M1 1 L9 1 L9 9 Z" }');
  });

  it("refuses a number that is not one", async () => {
    await useEditorStore.getState().updateListItemProperty("pdfPage", "quaranta");

    expect(useEditorStore.getState().lastError).toContain("non e' un numero");
    expect(written(dataFile)).toBeUndefined();
  });

  it("deletes the row itself when that is what the user asks for", async () => {
    await useEditorStore.getState().removeListItem();

    const next = written(dataFile)!;
    expect(next).not.toContain("Tappatrice");
    expect(findArrayLiteral(next, "parts")!.items).toHaveLength(2);
    expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("sparisce ovunque");
  });

  it("keeps the JSX guard for a list whose data it cannot reach", async () => {
    // The overlay reads its list from a prop and no project index is available here, so the editor
    // falls back to the edit it can make safely.
    const document = parseSource(overlayFile, overlay);
    const text = Object.values(document.nodes).find((node) => node.type === "text")!;
    useEditorStore.setState({ document, selectedId: text.id, listBinding: undefined, selectionInfo: { instanceIndex: 0, instanceCount: 3, listIndex: 0 } });

    await useEditorStore.getState().updateText("Ingresso A");

    expect(written(overlayFile)).toContain('index === 0 ? "Ingresso A" : part.label');
  });
});

describe("PLC signals", () => {
  beforeEach(() => {
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    bridge.readFile.mockReset().mockResolvedValue(page);
    const document = parseSource(pageFile, page);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({
      document, selectedId: button.id, history: [], future: [], consoleEntries: [], lastError: undefined,
      selectionInfo: undefined, listBinding: undefined, editScope: "instance",
      plcVariables: [{ name: "Machine.Speed", dataType: "REAL", access: "read", address: "%MD10", description: "" }],
      project: { root: "C:/p", name: "p", framework: "vite", language: "javascript", packageManager: "npm", entryFiles: [], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] },
    });
  });

  it("writes the binding into the element the running panel reads", async () => {
    await useEditorStore.getState().bindPlcVariable("Machine.Speed");

    expect(bridge.writeFile.mock.calls.at(-1)?.[1]).toContain('data-plc-variable="Machine.Speed"');
  });

  it("warns when the signal is not described anywhere, and can add it to the catalog", async () => {
    await useEditorStore.getState().bindPlcVariable("Line.Counter");
    expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("non è nel catalogo");

    await useEditorStore.getState().addPlcVariable("Line.Counter");

    const catalog = bridge.writeFile.mock.calls.find((call) => String(call[0]).endsWith("framecraft.plc.json"))?.[1] as string;
    expect(JSON.parse(catalog).variables.map((variable: { name: string }) => variable.name)).toEqual(["Line.Counter", "Machine.Speed"]);
    expect(useEditorStore.getState().plcVariables).toHaveLength(2);
  });
});

/** The menu of an HMI panel is three components away from the file that lists its pages: the popup
 * draws `items`, the shell fills it with `mainMenuItems`, and only the panel imports the data. */
const menuDataFile = "C:/p/src/menuData.js";
const popupFile = "C:/p/src/MenuPopup.jsx";
const shellFile = "C:/p/src/Shell.jsx";
const panelFile = "C:/p/src/Panel.jsx";

const menuData = `export const mainMenuItems = [
  { id: "machine-view", label: "Machine View" },
  { id: "consumption", label: "Consumption" },
];
`;

const popup = `export default function MenuPopup({ items = [], onSelect }) {
  return (
    <nav>
      {items.map((item) => (
        <button key={item.id} onClick={() => onSelect?.(item)}>{item.label}</button>
      ))}
    </nav>
  );
}
`;

const shell = `import MenuPopup from "./MenuPopup";

export default function Shell({ mainMenuItems = [], onMainMenuItemSelect }) {
  function selectMainMenuItem(item) {
    onMainMenuItemSelect?.(item.id);
  }
  return <MenuPopup items={mainMenuItems} onSelect={selectMainMenuItem} />;
}
`;

const panel = `import Shell from "./Shell";
import { mainMenuItems } from "./menuData";

export default function Panel() {
  const [currentPage, setCurrentPage] = useState("machine-view");
  return <Shell mainMenuItems={mainMenuItems} onMainMenuItemSelect={setCurrentPage} />;
}
`;

const menuSources = { [popupFile]: popup, [shellFile]: shell, [panelFile]: panel, [menuDataFile]: menuData };

describe("a list handed down through several components", () => {
  beforeEach(() => {
    clearModuleCache();
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    bridge.readFile.mockReset().mockImplementation(async (file: string) => {
      const source = menuSources[file as keyof typeof menuSources];
      if (source == null) throw new Error(`nessun file ${file}`);
      return source;
    });
  });

  it("follows the prop from the popup to the shell and on to the panel that owns the data", async () => {
    const index = buildProjectIndex(menuSources);
    const resolved = await resolveListArray(popupFile, popup, "items", {
      usesOf: (file) => index.usesOf(file),
      load: (from, specifier) => loadModule(from, specifier, (file) => bridge.readFile(file)),
    });

    expect(resolved?.file).toBe(menuDataFile);
    expect(resolved?.array.items).toHaveLength(2);
    expect(resolved?.array.items[1].properties.map((property) => property.value)).toEqual(["consumption", "Consumption"]);
  });

  it("gives the menu button its data row, which is where the page it opens is written", async () => {
    const files = Object.keys(menuSources).map((path) => ({ name: path.split("/").at(-1)!, path, kind: "file" as const }));
    const document = parseSource(popupFile, popup);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({
      document, selectedId: button.id, history: [], future: [], consoleEntries: [], lastError: undefined,
      listBinding: undefined, callSites: undefined, editScope: "instance",
      selectionInfo: { instanceIndex: 1, instanceCount: 2, listIndex: 1 },
      project: { root: "C:/p", name: "p", framework: "vite", language: "javascript", packageManager: "npm", entryFiles: [], files, scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] },
    });

    await useEditorStore.getState().updateListItemProperty("id", "counter-machine");

    expect(useEditorStore.getState().lastError).toBeUndefined();
    const written = bridge.writeFile.mock.calls.filter((call) => call[0] === menuDataFile).at(-1)?.[1] as string;
    expect(written).toContain('id: "counter-machine"');
    expect(written).toContain('id: "machine-view"');
  });
});

describe("shaping the highlight straight on the panel", () => {
  const files: Record<string, string> = {};

  beforeEach(() => {
    clearModuleCache();
    files[dataFile] = data.replace('d: "M154 592 L158 486"', 'd: "M0 0 L10 0 L10 10 L0 10 Z"');
    files[pageFile] = page;
    bridge.readFile.mockReset().mockImplementation(async (file: string) => {
      if (files[file] == null) throw new Error(`nessun file ${file}`);
      return files[file];
    });
    bridge.writeFile.mockReset().mockImplementation(async (file: string, content: string) => { files[file] = content; });
    const document = parseSource(pageFile, page);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({
      document, selectedId: button.id, history: [], future: [], consoleEntries: [], lastError: undefined,
      project: undefined, editScope: "instance", listBinding: undefined, callSites: undefined, highlightPreview: undefined,
      selectionInfo: { instanceIndex: 2, instanceCount: 3, listIndex: 2 },
    });
  });

  it("follows the dragged corner live and writes it only when the pointer is released", async () => {
    await useEditorStore.getState().moveHighlightAnchor(1, 40, -5, false);

    expect(useEditorStore.getState().highlightPreview?.path).toBe("M0 0 L40 -5 L10 10 L0 10 Z");
    // Every corner and every side travels with the outline: it is what the panel draws handles from.
    expect(useEditorStore.getState().highlightPreview?.anchors).toHaveLength(4);
    expect(useEditorStore.getState().highlightPreview?.sides).toHaveLength(4);
    expect(files[dataFile]).toContain('d: "M0 0 L10 0 L10 10 L0 10 Z"');

    await useEditorStore.getState().moveHighlightAnchor(1, 42, -6, true);

    expect(useEditorStore.getState().lastError).toBeUndefined();
    expect(files[dataFile]).toContain('d: "M0 0 L42 -6 L10 10 L0 10 Z"');
  });

  it("adds a corner on a side and takes one away again", async () => {
    await useEditorStore.getState().insertHighlightAnchor(0, 5, -20);
    expect(files[dataFile]).toContain('d: "M0 0 L5 -20 L10 0 L10 10 L0 10 Z"');

    await useEditorStore.getState().removeHighlightAnchor(1);

    expect(useEditorStore.getState().lastError).toBeUndefined();
    expect(files[dataFile]).toContain('d: "M0 0 L10 0 L10 10 L0 10 Z"');
  });
});
