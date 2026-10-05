// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
import { describeInteractions, handlersNavigate } from "../src/core/interactions";
import { buildProjectIndex } from "../src/core/projectIndex";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { readFile: bridge.readFile, writeFile: bridge.writeFile },
}));
import { useEditorStore } from "../src/state/editorStore";
// The preview plugin is shipped as plain ESM so imported projects do not need TypeScript.
// @ts-expect-error no declaration is required for the runtime plugin.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

const panel = `export default function Panel({ onPartToggle }) {
  const [currentPage, setCurrentPage] = useState("home");
  const [controlsOpen, setControlsOpen] = useState(false);

  function openManual(partId) {
    setControlsOpen(true);
    setCurrentPage("manual-" + partId);
  }

  return (
    <section>
      <button type="button" onClick={() => openManual("mixer")}>Manuale</button>
      <a href="/diagnostica">Diagnostica</a>
      <svg>
        <g role="button" onClick={(event) => onPartToggle("mixer", event.currentTarget)}>
          <rect className="hit" />
          <text className="label">Mixer</text>
        </g>
      </svg>
      <p className="note">Solo scritta</p>
    </section>
  );
}`;

function report(type: string, index = 0) {
  const nodes = Object.values(parseSource("Panel.jsx", panel).nodes).filter((node) => node.type === type);
  const node = nodes[index];
  return describeInteractions(panel, node.source.start, node.source.end);
}

describe("what an element does", () => {
  it("follows the handler into a function of the same file", () => {
    const button = report("button");
    expect(button.owner).toBeUndefined();
    expect(button.actions).toHaveLength(1);
    expect(button.actions[0].trigger).toBe("Al click");
    expect(button.actions[0].summary).toContain("openManual");
    expect(button.actions[0].details).toEqual(["apre controlsOpen", 'porta alla pagina "manual-" + partId']);
    expect(report("a").actions[0].summary).toBe("apre il collegamento /diagnostica");
  });

  it("reads a link as where it leads", () => {
    expect(report("a").actions[0].summary).toBe("apre il collegamento /diagnostica");
  });

  it("says which container owns the action when the element itself has none", () => {
    // The writing drawn over a hotspot carries no handler: answering "nothing" would be useless.
    const label = report("text");
    expect(label.owner).toMatchObject({ type: "g" });
    expect(label.actions[0].summary).toContain("onPartToggle");
    expect(label.actions[0].summary).toContain("chi usa questo componente");
  });

  it("says plainly when an element does nothing", () => {
    expect(report("p").actions).toEqual([]);
  });

  it("offers the values the element passes as fields to change", () => {
    // "Where does this button lead" is only an answer if it can also be changed from here.
    const menu = `export default function Menu({ onPageChange }) {
  return (
    <nav>
      <button onClick={() => onPageChange("manual-general")}>Manuale</button>
      <button onClick={() => plc.write("Commands.Start", 1)}>Avvia</button>
      <button onClick={() => setDrawerOpen(true)}>Apri</button>
    </nav>
  );
}`;
    const buttons = Object.values(parseSource("Menu.jsx", menu).nodes).filter((node) => node.type === "button");
    const values = buttons.map((button) => describeInteractions(menu, button.source.start, button.source.end).actions[0].values);

    expect(values[0]).toEqual([expect.objectContaining({ label: "Pagina", kind: "page", value: "manual-general" })]);
    expect(values[1].map((value) => [value.label, value.kind, value.value])).toEqual([["Variabile PLC", "text", "Commands.Start"], ["Valore", "number", 1].map(String)]);
    expect(values[2]).toEqual([expect.objectContaining({ kind: "boolean", value: "true" })]);

    // The range is what an edit rewrites, so it has to point exactly at the literal.
    const page = values[0][0];
    expect(menu.slice(page.start, page.end)).toBe('"manual-general"');
  });

  it("recognises the destination of a double click as an editable page", () => {
    const source = `export function Tile() {
  return <button onDoubleClick={() => setPage("manual-mixer")}>Apri mixer</button>;
}`;
    const button = Object.values(parseSource("Tile.jsx", source).nodes).find((node) => node.type === "button")!;
    const action = describeInteractions(source, button.source.start, button.source.end).actions[0];
    expect(action.trigger).toBe("Al doppio click");
    expect(action.values).toEqual([expect.objectContaining({ kind: "page", value: "manual-mixer" })]);
  });
});

describe("a component rendered by more than one panel", () => {
  const overlay = `export default function Overlay({ parts, onPartToggle }) {
  return parts.map((part) => (
    <g key={part.id} role="button" onClick={(event) => onPartToggle(part.id, event.currentTarget)}>
      <text>{part.shortLabel}</text>
    </g>
  ));
}`;
  const view = `import Overlay from "./Overlay";
export default function View() {
  function togglePart(partId) {
    setControlsOpen(false);
    setSelectedPartId(partId);
    setControlsOpen(true);
  }
  function closeControls() {
    setControlsOpen(false);
  }
  return <Overlay parts={machineParts} onPartToggle={togglePart} onClose={closeControls} />;
}`;
  const manualPage = `import Overlay from "./Overlay";
export default function Manual() {
  function selectPart(partId) {
    setActivePartId(partId);
  }
  return <Overlay parts={machineParts} onPartToggle={selectPart} />;
}`;

  const overlayFile = "C:/p/src/Overlay.jsx";
  const viewFile = "C:/p/src/MachineView.jsx";
  const manualFile = "C:/p/src/ManualGeneral.jsx";
  // Built the way the editor builds it, so the ranges an edit rewrites are the real ones.
  const callSites = buildProjectIndex({ [overlayFile]: overlay, [viewFile]: view, [manualFile]: manualPage })
    .usesOf(overlayFile)
    .map((use) => ({ file: use.file, source: use.source, props: use.props, propRanges: use.propRanges }));

  function hotspot() {
    const node = Object.values(parseSource(overlayFile, overlay).nodes).find((item) => item.type === "g")!;
    return describeInteractions(overlay, node.source.start, node.source.end, callSites, overlayFile);
  }

  it("names each panel that supplies the handler instead of giving up", () => {
    const action = hotspot().actions[0];

    expect(action.summary).toContain("togglePart in MachineView.jsx");
    expect(action.summary).toContain("selectPart in ManualGeneral.jsx");
    expect(action.details).toContain("MachineView.jsx: imposta selectedPartId = partId");
    expect(action.details).toContain("MachineView.jsx: apre controlsOpen");
    expect(action.details).toContain("ManualGeneral.jsx: imposta activePartId = partId");
  });

  it("opens the wiring of each page: which function, and the values inside it", () => {
    const handlers = hotspot().actions[0].handlers;

    expect(handlers.map((handler) => `${handler.name} in ${handler.file.split("/").at(-1)}`))
      .toEqual(["togglePart in MachineView.jsx", "selectPart in ManualGeneral.jsx"]);
    // The range is what a swap rewrites, so it has to sit exactly on the name at the call site.
    expect(view.slice(handlers[0].start, handlers[0].end)).toBe("togglePart");
    expect(handlers[0].options).toContain("closeControls");
    // Two calls to the same setter are told apart, or the panel would show two identical fields.
    expect(handlers[0].values.map((value) => `${value.label}=${value.value}`)).toEqual(["controlsOpen · 1=false", "controlsOpen · 2=true"]);
    expect(handlers[0].values.every((value) => value.file === viewFile)).toBe(true);
  });

  it("points at the values of the row the action reads", () => {
    // onPartToggle(part.id) carries no literal, but `id` is a value of the data row and editable.
    expect(hotspot().actions[0].dataProperties).toContain("id");
    expect(hotspot().actions[0].values).toEqual([]);
  });
});

describe("changing what an element does", () => {
  it("rewrites the page a button opens without touching anything else", async () => {
    const menu = `export default function Menu({ onPageChange }) {
  return <button onClick={() => onPageChange("manual-general")}>Manuale</button>;
}`;
    bridge.readFile.mockReset().mockResolvedValue(menu);
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    const document = parseSource("Menu.jsx", menu);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({ document, selectedId: button.id, history: [], future: [], consoleEntries: [], lastError: undefined, selectionInfo: undefined });
    const page = describeInteractions(menu, button.source.start, button.source.end).actions[0].values[0];

    await useEditorStore.getState().updateActionValue({ start: page.start, end: page.end }, page.kind, "manual-mixer");

    expect(useEditorStore.getState().lastError).toBeUndefined();
    expect(bridge.writeFile.mock.calls.at(-1)?.[1]).toContain('onPageChange("manual-mixer")');
  });

  it("refuses a value that would break the file", async () => {
    const menu = `export const Menu = () => <button onClick={() => go(3)}>Vai</button>;`;
    bridge.readFile.mockReset().mockResolvedValue(menu);
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    const document = parseSource("Menu.jsx", menu);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({ document, selectedId: button.id, history: [], future: [], consoleEntries: [], lastError: undefined, selectionInfo: undefined });
    const value = describeInteractions(menu, button.source.start, button.source.end).actions[0].values[0];

    await useEditorStore.getState().updateActionValue({ start: value.start, end: value.end }, "number", "non un numero");

    expect(useEditorStore.getState().lastError).toContain("non è un numero");
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });
});

describe("the click that leads somewhere else", () => {
  // The real shape of these panels: the hotspot forwards to the page, the page forwards again to
  // whoever renders it, and only there is the destination written.
  const overlayFile = "C:/p/src/Overlay.jsx";
  const manualFile = "C:/p/src/ManualGeneral.jsx";
  const appFile = "C:/p/src/App.jsx";
  const overlay = `export default function Overlay({ parts, onPartToggle }) {
  return parts.map((part) => <g key={part.id} onClick={() => onPartToggle(part.id)}><text>{part.label}</text></g>);
}`;
  const manualPage = `import Overlay from "./Overlay";
export default function ManualGeneral({ onOpenPart }) {
  const [activePartId, setActivePartId] = useState(null);
  function selectPart(partId) {
    if (activePartId === partId) {
      onOpenPart?.(partId);
      return;
    }
    setActivePartId(partId);
  }
  return <Overlay parts={machineParts} onPartToggle={selectPart} />;
}`;
  const app = `import ManualGeneral from "./ManualGeneral";
export default function App({ onPageChange }) {
  return <ManualGeneral onOpenPart={(partId) => onPageChange(\`manual-\${partId}\`)} />;
}`;

  function destination(appSource = app) {
    const index = buildProjectIndex({ [overlayFile]: overlay, [manualFile]: manualPage, [appFile]: appSource });
    const callSites = index.usesOf(overlayFile).map((use) => ({
      file: use.file, source: use.source, props: use.props, propRanges: use.propRanges,
      callers: index.usesOf(use.file).map((caller) => ({ file: caller.file, source: caller.source, props: caller.props, propRanges: caller.propRanges })),
    }));
    const node = Object.values(parseSource(overlayFile, overlay).nodes).find((item) => item.type === "g")!;
    return describeInteractions(overlay, node.source.start, node.source.end, callSites, overlayFile).actions[0];
  }

  it("follows an optional handler through the pages up to the page it opens", () => {
    const action = destination();
    // `onOpenPart?.(partId)` is a call like any other: reading only plain calls hid the last step.
    expect(action.details).toContain("ManualGeneral.jsx: chiama onOpenPart(partId)");

    const forwarded = action.handlers.find((handler) => handler.file === manualFile)!.next[0];
    expect(forwarded.file).toBe(appFile);
    expect(forwarded.lines).toContain("porta alla pagina manual-${partId}");

    const page = forwarded.values[0];
    expect(page.label).toBe("Pagina");
    expect(page.composed).toBe(true);
    expect(page.value).toBe("manual-${partId}");
    expect(page.parameter).toBe("partId");
    expect(page.defaultRaw).toBe("`manual-${partId}`");
  });

  it("sends everyone to a fixed page when one is written in its place", async () => {
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    bridge.readFile.mockReset().mockImplementation(async (file: string) => (file === appFile ? app : overlay));
    const document = parseSource(overlayFile, overlay);
    useEditorStore.setState({ document, selectedId: Object.values(document.nodes)[0].id, history: [], future: [], consoleEntries: [], lastError: undefined, selectionInfo: undefined, listBinding: undefined });
    const page = destination().handlers.find((handler) => handler.file === manualFile)!.next[0].values[0];

    await useEditorStore.getState().updateActionValue({ start: page.start, end: page.end }, page.kind, "settings", { file: page.file!, raw: page.raw! });

    const call = bridge.writeFile.mock.calls.at(-1)!;
    expect(call[0]).toBe(appFile);
    expect(call[1]).toContain('onPageChange("settings")');
    expect(useEditorStore.getState().lastError).toBeUndefined();
  });

  it("changes the second-click page for one repeated item and reads the override back", async () => {
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    bridge.readFile.mockReset().mockImplementation(async (file: string) => (file === appFile ? app : overlay));
    const document = parseSource(overlayFile, overlay);
    useEditorStore.setState({ document, selectedId: Object.values(document.nodes)[0].id, history: [], future: [], consoleEntries: [], lastError: undefined, selectionInfo: undefined, listBinding: undefined });
    const page = destination().handlers.find((handler) => handler.file === manualFile)!.next[0].values[0];

    await useEditorStore.getState().updateActionValueForItem(page, "mixer", "settings");

    const written = bridge.writeFile.mock.calls.at(-1)?.[1] as string;
    expect(written).toContain('onPageChange(partId === "mixer" ? "settings" : `manual-${partId}`)');
    expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("Le altre voci non cambiano");
    const reread = destination(written).handlers.find((handler) => handler.file === manualFile)!.next[0].values[0];
    expect(reread.parameter).toBe("partId");
    expect(reread.defaultRaw).toBe("`manual-${partId}`");
    expect(reread.itemOverrides).toEqual([{ key: "mixer", value: "settings" }]);
  });
});

describe("a data-driven menu destination", () => {
  const popupFile = "C:/catalog/Popup.jsx";
  const shellFile = "C:/catalog/Shell.jsx";
  const appFile = "C:/panel/App.jsx";
  const popup = `export default function Popup({ items, onSelect }) {
  return items.map((item) => <button key={item.id} onClick={() => onSelect?.(item)}>{item.label}</button>);
}`;
  const shell = `import Popup from "./Popup";
export default function Shell({ items, onMainMenuItemSelect }) {
  function selectMainMenuItem(item) { onMainMenuItemSelect?.(item.id); }
  return <Popup items={items} onSelect={selectMainMenuItem} />;
}`;
  const app = `import Shell from "../catalog/Shell";
export default function App() {
  const [currentPage, setCurrentPage] = useState("home");
  return <Shell items={menuItems} onMainMenuItemSelect={setCurrentPage} />;
}`;

  it("follows a forwarded item id until the page setter", () => {
    const index = buildProjectIndex({ [popupFile]: popup, [shellFile]: shell, [appFile]: app });
    const contexts = (file: string, depth = 4): any[] => index.usesOf(file).map((use) => ({
      file: use.file, source: use.source, props: use.props, propRanges: use.propRanges,
      callers: depth > 0 ? contexts(use.file, depth - 1) : [],
    }));
    const button = Object.values(parseSource(popupFile, popup).nodes).find((node) => node.type === "button")!;
    const action = describeInteractions(popup, button.source.start, button.source.end, contexts(popupFile), popupFile).actions[0];
    const names = (handlers: typeof action.handlers): string[] => handlers.flatMap((handler) => [handler.name, ...names(handler.next)]);

    expect(handlersNavigate(action.handlers)).toBe(true);
    expect(names(action.handlers)).toContain("setCurrentPage");
  });
});

describe("changing the behaviour itself", () => {
  const overlayFile = "C:/p/src/Overlay.jsx";
  const viewFile = "C:/p/src/MachineView.jsx";
  const overlay = `export default function Overlay({ parts, onPartToggle }) {
  return parts.map((part) => <g key={part.id} onClick={() => onPartToggle(part.id)}><text>{part.label}</text></g>);
}`;
  const view = `import Overlay from "./Overlay";
export default function View() {
  function togglePart(partId) {
    setSelectedPartId(partId);
    setControlsOpen(true);
  }
  function closeControls() {
    setControlsOpen(false);
  }
  return <Overlay parts={machineParts} onPartToggle={togglePart} />;
}`;

  function handler() {
    const callSites = buildProjectIndex({ [overlayFile]: overlay, [viewFile]: view })
      .usesOf(overlayFile)
      .map((use) => ({ file: use.file, source: use.source, props: use.props, propRanges: use.propRanges }));
    const node = Object.values(parseSource(overlayFile, overlay).nodes).find((item) => item.type === "g")!;
    return describeInteractions(overlay, node.source.start, node.source.end, callSites, overlayFile).actions[0];
  }

  beforeEach(() => {
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    bridge.readFile.mockReset().mockImplementation(async (file: string) => {
      if (file === viewFile) return view;
      return overlay;
    });
    const document = parseSource(overlayFile, overlay);
    useEditorStore.setState({ document, selectedId: Object.values(document.nodes)[0].id, history: [], future: [], consoleEntries: [], lastError: undefined, selectionInfo: undefined, listBinding: undefined });
  });

  it("hands the element another function, in the page that supplies it", async () => {
    await useEditorStore.getState().updateHandler(handler().handlers[0], "closeControls");

    const call = bridge.writeFile.mock.calls.at(-1)!;
    expect(call[0]).toBe(viewFile);
    expect(call[1]).toContain("onPartToggle={closeControls}");
    expect(call[1]).toContain("function togglePart");
    expect(useEditorStore.getState().lastError).toBeUndefined();
  });

  it("changes a value inside that function, where it is written", async () => {
    const value = handler().handlers[0].values.find((item) => item.value === "true")!;

    await useEditorStore.getState().updateActionValue({ start: value.start, end: value.end }, "boolean", "false", { file: value.file!, raw: value.raw! });

    const call = bridge.writeFile.mock.calls.at(-1)!;
    expect(call[0]).toBe(viewFile);
    expect(call[1]).toContain("setControlsOpen(false);\n    setSelectedPartId(partId);\n    setControlsOpen(false);".slice(-24));
    expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("MachineView.jsx");
  });

  it("refuses to write when that file has moved on since it was read", async () => {
    bridge.readFile.mockImplementation(async () => "// il file è stato riscritto altrove\n" + view);

    await useEditorStore.getState().updateHandler(handler().handlers[0], "closeControls");

    expect(useEditorStore.getState().lastError).toContain("è cambiato");
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });
});

const posted: Record<string, unknown>[] = [];

describe("elements the app makes click-through", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.postMessage = ((message: Record<string, unknown>) => { posted.push(message); }) as typeof window.postMessage;
    new Function(framecraftPlugin().transformIndexHtml("<div id=\"root\"></div>").tags[0].children)();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    posted.length = 0;
  });

  function rect(element: Element, box: { left: number; top: number; width: number; height: number }) {
    Object.defineProperty(element, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) }),
    });
  }

  function panelWithLabel() {
    const button = document.createElement("div");
    const label = document.createElement("span");
    button.setAttribute("data-fc-source", JSON.stringify({ file: "Panel.jsx", start: 10, end: 40, line: 2, column: 3 }));
    label.setAttribute("data-fc-source", JSON.stringify({ file: "Panel.jsx", start: 50, end: 70, line: 3, column: 5 }));
    // Exactly what an SVG label over its own hotspot does: it is visible but never hit by the mouse.
    label.style.pointerEvents = "none";
    button.append(label);
    document.body.append(button);
    rect(button, { left: 0, top: 0, width: 200, height: 60 });
    rect(label, { left: 40, top: 20, width: 80, height: 20 });
    return { button, label };
  }

  it("selects the writing the mouse cannot reach, and marks it as not draggable", () => {
    const { button } = panelWithLabel();

    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 60, clientY: 30 }));

    const selection = posted.find((message) => message.type === "framecraft:select") as { source: { start: number }; info: { locked: boolean } };
    expect(selection.source.start).toBe(50);
    expect(selection.info.locked).toBe(true);
  });

  it("still selects the element under the pointer outside the writing", () => {
    const { button } = panelWithLabel();

    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 180, clientY: 50 }));

    const selection = posted.find((message) => message.type === "framecraft:select") as { source: { start: number }; info: { locked: boolean } };
    expect(selection.source.start).toBe(10);
    expect(selection.info.locked).toBe(false);
  });

  it("never drags the writing, however far the pointer moves", () => {
    const { button } = panelWithLabel();

    button.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 60, clientY: 30 }));
    document.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, cancelable: true, clientX: 140, clientY: 90 }));

    expect(posted.some((message) => message.type === "framecraft:drag-move")).toBe(false);
    expect(posted.some((message) => message.type === "framecraft:select")).toBe(true);
  });
});


const highlightPage = `export default function Page({ parts }) {
  return (
    <main>
      <button type="button">Evidenzia</button>
      <button type="button" onClick={() => openManual("mixer")}>Manuale</button>
      {parts.map((part) => (
        <button key={part.id} type="button">{part.label}</button>
      ))}
      <h2 className="titolo">Impianto</h2>
    </main>
  );
}`;

describe("the highlight the editor itself adds", () => {
  function open(kind: "plain" | "handler" | "copy", info?: { instanceCount: number; listIndex: number }) {
    const document = parseSource("Page.jsx", highlightPage);
    const buttons = Object.values(document.nodes).filter((node) => node.type === "button");
    const node = buttons.find((button) => kind === "handler" ? button.dynamicProps.includes("onClick")
      : kind === "copy" ? button.dynamicProps.includes("key")
        : !button.dynamicProps.length)!;
    useEditorStore.setState({
      document, selectedId: node.id, selectionInfo: info, editScope: "instance",
      history: [], future: [], consoleEntries: [], lastError: undefined, highlightPicker: undefined,
    });
    return node;
  }

  beforeEach(() => {
    bridge.readFile.mockReset().mockResolvedValue(highlightPage);
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
  });

  it("adds and removes a highlight without losing the button's existing click", async () => {
    open("handler");
    useEditorStore.getState().beginHighlightSelection({ color: "#f59e0b", width: 3 });
    expect(useEditorStore.getState().highlightPicker).toBeDefined();
    const heading = Object.values(useEditorStore.getState().document!.nodes).find((node) => node.type === "h2")!;

    await useEditorStore.getState().selectSource(heading.source, "h2");

    const highlighted = bridge.writeFile.mock.calls.at(-1)?.[1] as string;
    expect(highlighted).toContain('data-fc-highlight-original-click={"() => openManual(\\"mixer\\")"}');
    expect(highlighted).toContain('(() => openManual("mixer"))(event)');
    const document = parseSource("Page.jsx", highlighted);
    const trigger = Object.values(document.nodes).find((node) => node.type === "button" && typeof node.props["data-fc-highlight-target"] === "string")!;
    bridge.readFile.mockResolvedValue(highlighted);
    useEditorStore.setState({ document, selectedId: trigger.id });

    await useEditorStore.getState().removeHighlightInteraction();

    const restored = bridge.writeFile.mock.calls.at(-1)?.[1] as string;
    expect(restored).toContain('onClick={() => openManual("mixer")}');
    expect(restored).not.toContain("data-fc-highlight-target");
  });

  it("says no to one copy of a list, which could never point at its own part", () => {
    open("copy", { instanceCount: 3, listIndex: 1 });

    useEditorStore.getState().beginHighlightSelection({ color: "#f59e0b", width: 3 });

    expect(useEditorStore.getState().highlightPicker).toBeUndefined();
    expect(useEditorStore.getState().lastError).toContain("copie della stessa lista");
  });

  it("refuses a part that a list draws, instead of writing a link to the first copy", async () => {
    const trigger = open("plain");
    useEditorStore.getState().beginHighlightSelection({ color: "#f59e0b", width: 3 });
    expect(useEditorStore.getState().highlightPicker?.trigger.start).toBe(trigger.source.start);
    const copy = Object.values(useEditorStore.getState().document!.nodes).find((node) => node.dynamicProps.includes("key"))!;

    await useEditorStore.getState().selectSource(copy.source, "button");

    expect(useEditorStore.getState().lastError).toContain("disegnata da una lista");
    expect(bridge.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().highlightPicker).toBeUndefined();
  });

  it("wires a single button to a single part", async () => {
    open("plain");
    useEditorStore.getState().beginHighlightSelection({ color: "#22c55e", width: 5 });
    const heading = Object.values(useEditorStore.getState().document!.nodes).find((node) => node.type === "h2")!;

    await useEditorStore.getState().selectSource(heading.source, "h2");

    const written = bridge.writeFile.mock.calls.at(-1)?.[1] as string;
    expect(written).toContain('data-fc-highlight-color="#22c55e"');
    expect(written).toMatch(/<h2[^>]*data-fc-highlight-id=/);
    expect(useEditorStore.getState().lastError).toBeUndefined();
  });

  it("says out loud that a value written once belongs to every copy", async () => {
    const menu = `export default function Menu({ items }) {
  return items.map((item) => <button key={item.id} onClick={() => setPage("manual")}>{item.label}</button>);
}`;
    bridge.readFile.mockResolvedValue(menu);
    const document = parseSource("Menu.jsx", menu);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({ document, selectedId: button.id, consoleEntries: [], lastError: undefined, editScope: "instance", selectionInfo: { instanceCount: 4, listIndex: 2 } });
    const value = describeInteractions(menu, button.source.start, button.source.end).actions[0].values[0];

    await useEditorStore.getState().updateActionValue({ start: value.start, end: value.end }, value.kind, "manual-mixer");

    expect(bridge.writeFile.mock.calls.at(-1)?.[1]).toContain('setPage("manual-mixer")');
    expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("tutte le 4 copie");
  });
});
