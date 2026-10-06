// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { translatedCoordinate } from "../src/inspector/coordinates";
import { formatBorder, parseBorder } from "../src/inspector/borderValue";
import { vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { readFile: vi.fn(), writeFile: vi.fn() },
}));
import { useEditorStore } from "../src/state/editorStore";
import { Inspector } from "../src/inspector/Inspector";
import { parseSource } from "../src/source-parser/parseSource";
import { emptyHmiResourceCatalog } from "../src/core/hmiResources";
import { serializeHmiFaceplateBinding, standardHmiFaceplateCatalog } from "../src/core/hmiFaceplates";
import { defaultHmiTrendConfig, serializeHmiTrendConfig } from "../src/core/hmiTrend";
import { defaultHmiFunctionTrendConfig, parseHmiFunctionTrendConfig, serializeHmiFunctionTrendConfig } from "../src/core/hmiFunctionTrend";

describe("inspector coordinates", () => {
  it("moves one visual axis while preserving the existing translation on the other", () => {
    expect(translatedCoordinate(120, 155, "10px -4px", "x")).toBe("45px -4px");
    expect(translatedCoordinate(80, 62, "10px -4px", "y")).toBe("10px -22px");
  });

  it("starts from zero when the selected element has no translation", () => {
    expect(translatedCoordinate(24.5, 40, "none", "x")).toBe("15.5px 0px");
  });
});

describe("scheda unica dell'elemento", () => {
  it("conserva scroll e focus modificando lo stesso elemento, anche dopo un doppio clic", async () => {
    const initialState = useEditorStore.getState();
    const file = "C:/panel/Page.tsx";
    const source = 'export function Page(){return <main><button>Avvia</button><button>Ferma</button></main>}';
    const parsed = parseSource(file, source);
    const button = Object.values(parsed.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({
      project: { root: "C:/panel", files: [] } as never,
      document: parsed, selectedId: button.id, propertiesExpandedAt: 0, textFocusRequestedAt: 100,
      selectionInfo: { instanceIndex: 0, instanceCount: 2 }, selectionStyles: {},
      unresolvedSelection: undefined, multiSelection: [], resourceCatalog: emptyHmiResourceCatalog(),
    });
    const scroll = vi.fn();
    const focusScroll = vi.fn();
    HTMLElement.prototype.scrollTo = scroll;
    HTMLElement.prototype.scrollIntoView = focusScroll;
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = window.document.createElement("div");
    window.document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(Inspector)));
      expect(focusScroll).toHaveBeenCalledTimes(1);
      scroll.mockClear(); focusScroll.mockClear();
      const inspector = container.querySelector<HTMLElement>(".inspector")!;
      inspector.scrollTop = 620;
      for (const replacement of ['<button style={{ color: "red" }}>Avvia</button>', '<button title="Motore M2400">Avvia motore</button>']) {
        const next = parseSource(file, source.replace("<button>Avvia</button>", replacement), 2);
        const selected = Object.values(next.nodes).find((node) => node.type === "button")!;
        expect(selected.id).not.toBe(button.id);
        await act(async () => useEditorStore.setState({ document: next, selectedId: selected.id }));
        expect(scroll).not.toHaveBeenCalled();
        expect(focusScroll).not.toHaveBeenCalled();
        expect(inspector.scrollTop).toBe(620);
      }
      await act(async () => useEditorStore.setState({ textFocusRequestedAt: 200 }));
      expect(focusScroll).toHaveBeenCalledTimes(1);
      await act(async () => useEditorStore.setState({ selectionInfo: { instanceIndex: 1, instanceCount: 2 } }));
      expect(scroll).toHaveBeenCalledTimes(1);
      scroll.mockClear();
      const other = Object.values(useEditorStore.getState().document!.nodes).filter((node) => node.type === "button")[1];
      await act(async () => useEditorStore.setState({ selectedId: other.id }));
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(focusScroll).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount()); container.remove();
      useEditorStore.setState(initialState);
    }
  });

  it.each(["disegno", "plc", "sviluppo"] as const)("mostra le proprietà comuni e i dettagli espandibili nella disposizione %s", async (workLayout) => {
    const source = `export function Page(){return <button style={{ width: "120px", height: "40px" }} data-hmi-dynamizations='[{"property":"Visible","kind":"Tag","tag":"Machine.Ready"}]'>Avvia</button>}`;
    const document = parseSource("C:/panel/Page.tsx", source);
    const node = Object.values(document.nodes).find((item) => item.type === "button")!;
    const initialState = useEditorStore.getState();
    useEditorStore.setState({
      project: { root: "C:/panel", name: "Linea prova", files: [] } as never,
      document, selectedId: node.id, propertiesExpandedAt: 0,
      selectionInfo: undefined, unresolvedSelection: undefined, multiSelection: [],
      selectionRect: { x: 10, y: 20, width: 120, height: 40 }, selectionStyles: {},
      dirty: true, history: [], future: [], plcVariables: [], resourceCatalog: emptyHmiResourceCatalog(),
    });
    useEditorStore.getState().applyWorkLayout(workLayout);
    HTMLElement.prototype.scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = window.document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(Inspector)));
      const section = (title: string) => [...container.querySelectorAll<HTMLButtonElement>(".inspector-section-title")].find((button) => button.querySelector("span")?.textContent === title)!;
      for (const title of ["Posizione e dimensioni", "Livelli e rotazione", "Aspetto"]) expect(section(title).getAttribute("aria-expanded")).toBe("true");
      for (const title of ["Attributi", "Posizione CSS", "Vincoli dimensionali", "Effetti e sfondo", "Layout", "Testo e font", "Avanzate", "Informazioni"]) {
        expect(section(title).getAttribute("aria-expanded")).toBe("false");
      }
      expect(container.querySelector('[aria-label="Apri il codice dell\'elemento"]')).not.toBeNull();
      await act(async () => section("Eventi WinCC").dispatchEvent(new MouseEvent("click", { bubbles: true })));
      const objectHelp = [...container.querySelectorAll("details")].find((details) => details.querySelector("summary")?.textContent === "Leggere e modificare un oggetto · Unified");
      expect(objectHelp).toBeDefined();
      expect(objectHelp!.open).toBe(false);
      expect(objectHelp!.textContent).toContain("non scrivono tag PLC");
      const fontHelp = [...container.querySelectorAll("details")].find((details) => details.querySelector("summary")?.textContent === "Carattere da script · Unified");
      expect(fontHelp).toBeDefined(); expect(fontHelp!.open).toBe(false);
      expect(fontHelp!.textContent).toContain("font.Size = 18.5"); expect(fontHelp!.textContent).toContain("non true/false");
      expect(fontHelp!.textContent).toContain("non vengono scaricati font");
      const dynamicsSource = [...container.querySelectorAll(".dynamization-field")].find((label) => label.querySelector("span")?.textContent === "Sorgente")?.querySelector("select");
      expect(dynamicsSource).toBeDefined();
      expect(dynamicsSource?.textContent).toContain("Funzione");
      await act(async () => section("Layout").dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(container.textContent).toContain("Display");
      await act(async () => section("Attributi").dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(container.textContent).toContain("Aggiungi attributo");
      expect(useEditorStore.getState()).toMatchObject({ document, selectedId: node.id, dirty: true, history: [], future: [] });
      expect(useEditorStore.getState().document).toBe(document);
    } finally {
      await act(async () => root.unmount());
      useEditorStore.setState(initialState);
    }
  });
});

describe("the border control", () => {
  it("reads the three decisions out of one CSS border, and writes them back", () => {
    expect(parseBorder("2px dashed #ff0000")).toEqual({ width: 2, style: "dashed", color: "#ff0000" });
    expect(parseBorder("4px solid #8b8b8b")).toEqual({ width: 4, style: "solid", color: "#8b8b8b" });
    // Nothing written is a border of no thickness, not a broken control.
    expect(parseBorder(undefined)).toEqual({ width: 0, style: "none", color: "#8b8b8b" });
    expect(parseBorder("none").style).toBe("none");
    // A colour with no style still counts as a line: that is what the browser draws.
    expect(parseBorder("1px #123456")).toEqual({ width: 1, style: "solid", color: "#123456" });

    expect(formatBorder({ width: 3, style: "solid", color: "#000000" })).toBe("3px solid #000000");
    // Taking the thickness to zero removes the line instead of leaving "0px solid" behind.
    expect(formatBorder({ width: 0, style: "solid", color: "#000000" })).toBe("none");
    expect(formatBorder({ width: 5, style: "none", color: "#000000" })).toBe("none");
  });
});

describe("expression feedback", () => {
  it("shows dependencies and syntax help next to a dynamic expression", async () => {
    const source = `export function Page(){return <div data-hmi-dynamizations='[{"property":"Visible","kind":"Expression","source":"Machine.Ready AND NOT Machine.Alarm"}]' />}`;
    const document = parseSource("src/Page.tsx", source);
    const node = Object.values(document.nodes).find((item) => item.type === "div")!;
    useEditorStore.setState({ document, selectedId: node.id });
    HTMLElement.prototype.scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = window.document.createElement("div");
    const root = createRoot(container);

    await act(async () => root.render(createElement(Inspector)));
    const html = container.innerHTML;
    expect(html).toContain("2 tag: Machine.Ready, Machine.Alarm");
    expect(html).toContain("Operatori: AND, OR, NOT");
    expect(html).toContain('tag("Nome tag")');

    await act(async () => root.unmount());
    useEditorStore.setState({ document: undefined, selectedId: undefined });
  });
});

describe("script ed eventi WinCC", () => {
  it("mostra codice, trigger, ciclo ed eventi modificabili nell'Inspector", async () => {
    const dynamics = JSON.stringify([{ property: "BackColor", kind: "Script", source: 'return Tags("State").Read();', triggers: ["State"], cycleMs: 250 }]);
    const events = JSON.stringify([{ event: "Tapped", script: 'Tags("Command").Write(1);' }]);
    const source = `export function Page(){return <button data-hmi-dynamizations='${dynamics}' data-hmi-events='${events}'>Avvia</button>}`;
    const document = parseSource("src/Page.tsx", source);
    const node = Object.values(document.nodes).find((item) => item.type === "button")!;
    useEditorStore.setState({ document, selectedId: node.id });
    HTMLElement.prototype.scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = window.document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(Inspector)));
    expect(container.innerHTML).toContain("Codice JavaScript sicuro");
    expect(container.innerHTML).toContain("Tag trigger");
    expect(container.innerHTML).toContain("Ciclo ms");
    expect(container.innerHTML).toContain("Eventi WinCC · 1");
    expect(container.innerHTML).toContain("Script locale");
    expect(container.innerHTML).toContain("Click destro / tocco lungo");
    expect(container.innerHTML).toContain("Pressione");
    expect(container.innerHTML).not.toContain("Caricamento");
    await act(async () => root.unmount());
    useEditorStore.setState({ document: undefined, selectedId: undefined });
  });
});

describe("lampeggio WinCC", () => {
  it("mostra colori, condizione, frequenze e alternativa accessibile", async () => {
    const dynamics = JSON.stringify([{
      property: "BackColor", kind: "Flashing", conditionType: "None",
      color: "#FF000000", alternateColor: "#FFFFFFFF",
      flashingCondition: "RangeViolation", flashingRate: "Fast", tag: "Temperature", minimum: 10, maximum: 80,
    }]);
    const source = `export function Page(){return <div data-hmi-dynamizations='${dynamics}' />}`;
    const document = parseSource("src/Page.tsx", source);
    const node = Object.values(document.nodes).find((item) => item.type === "div")!;
    useEditorStore.setState({ document, selectedId: node.id });
    HTMLElement.prototype.scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = window.document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(Inspector)));
    const html = container.innerHTML;
    expect(html).toContain("Lampeggio WinCC");
    expect(html).toContain("Colore principale");
    expect(html).toContain("Fuori dai limiti");
    expect(html).toContain("Veloce · 500 ms");
    expect(html).toContain("Variabile controllata");
    expect(html).toContain("Contrasto fra i colori: 21.00:1");
    expect(html).toContain("Riduci movimento");
    await act(async () => root.unmount());
    useEditorStore.setState({ document: undefined, selectedId: undefined });
  });
});

describe("istanza faceplate Unified", () => {
  it("mostra tipo rilasciato, tag e proprietà dell'interfaccia", async () => {
    const catalog = standardHmiFaceplateCatalog();
    catalog.types[0].interfaceEvents = [{ name: "Selected", parameters: [{ name: "index", dataType: "Int" }] }];
    const binding = serializeHmiFaceplateBinding({
      typeId: "pack", version: "0.0.8",
      tagBindings: { Width: "Pack.Size_X", Height: "Pack.Size_Y", Group_Nr: "Pack.Group", Group_Selected: "Pack.Selected" },
      propertyValues: { color_Pack: "#FF00A1D1" },
      eventBindings: { Selected: { script: "HMIRuntime.Trace(index);" } },
    });
    const source = `export function Page(){return <div data-hmi-type="HmiFaceplateContainer" data-hmi-faceplate='${binding}' />}`;
    const document = parseSource("src/Page.tsx", source);
    const node = Object.values(document.nodes).find((item) => item.type === "div")!;
    useEditorStore.setState({
      document, selectedId: node.id, faceplateCatalog: catalog,
      plcVariables: [
        { name: "Pack.Size_X", dataType: "Int", access: "read", address: "%DB1.DBW0", description: "" },
        { name: "Pack.Size_Y", dataType: "Int", access: "read", address: "%DB1.DBW2", description: "" },
        { name: "Pack.Group", dataType: "Int", access: "read", address: "%DB1.DBW4", description: "" },
        { name: "Pack.Selected", dataType: "Int", access: "read", address: "%DB1.DBW6", description: "" },
      ],
    });
    HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = window.document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(Inspector)));
    expect(container.innerHTML).toContain("Istanza faceplate");
    expect(container.innerHTML).toContain("Pack · V0.0.8");
    expect(container.innerHTML).toContain("Width · Int *");
    expect(container.innerHTML).toContain("Group_Selected · Int *");
    expect(container.innerHTML).toContain("color_Pack · Color");
    expect(container.innerHTML).toContain("Pack.Size_X");
    expect(container.innerHTML).toContain("Eventi di interfaccia");
    expect(container.innerHTML).toContain("Selected(index: Int)");
    expect(container.innerHTML).toContain("HMIRuntime.Trace(index);");
    expect(container.innerHTML).toContain("Faceplate.RaiseEvent");
    await act(async () => root.unmount());
    useEditorStore.setState({ document: undefined, selectedId: undefined, faceplateCatalog: { version: 1, types: [] }, plcVariables: [] });
  });
});

describe("Trend Control Unified", () => {
  it("configura curve, tag, assi, soglie e comandi Runtime dall'Inspector", async () => {
    const config = defaultHmiTrendConfig();
    config.trends[0] = { ...config.trends[0], name: "Temperatura", tag: "Oven.Temperature", lowThreshold: 20, highThreshold: 80 };
    const source = `export function Page(){return <div data-hmi-type="HmiTrendControl" data-hmi-trend='${serializeHmiTrendConfig(config)}' />}`;
    const document = parseSource("src/Page.tsx", source);
    const node = Object.values(document.nodes).find((item) => item.type === "div")!;
    useEditorStore.setState({ document, selectedId: node.id, plcVariables: [{ name: "Oven.Temperature", dataType: "Real", access: "read", address: "%MD0", description: "" }] });
    HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = window.document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(Inspector)));
    const html = container.innerHTML;
    expect(html).toContain("Trend Control");
    expect(html).toContain("Campioni online reali in memoria");
    expect(html).toContain("Temperatura");
    expect(html).toContain("Oven.Temperature");
    expect(html).toContain("Interpolata");
    expect(html).toContain("Soglia bassa");
    expect(html).toContain("Asse destro");
    await act(async () => root.unmount());
    useEditorStore.setState({ document: undefined, selectedId: undefined, plcVariables: [] });
  });
});

describe("Function Trend X/Y Unified", () => {
  it("configura separatamente X e Y e conserva il mapping quando cambia sorgente", async () => {
    const config = defaultHmiFunctionTrendConfig(); config.trends[0].x.tag = "Motor.Speed"; config.trends[0].y.tag = "Motor.Temperature";
    const document = parseSource("src/Page.tsx", `export function Page(){return <div data-hmi-type="HmiFunctionTrendControl" data-hmi-function-trend='${serializeHmiFunctionTrendConfig(config)}' />}`);
    const node = Object.values(document.nodes).find((item) => item.type === "div")!;
    const originalUpdate = useEditorStore.getState().updateAttribute; const update = vi.fn();
    useEditorStore.setState({ document, selectedId: node.id, updateAttribute: update });
    HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = window.document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(Inspector)));
    expect(container.textContent).toContain("Function Trend X/Y"); expect(container.textContent).toContain("stesso numero di valori");
    expect(container.textContent).toContain("Asse X (orizzontale)"); expect(container.textContent).toContain("Asse Y (verticale)");
    expect(container.textContent).toContain("Tolleranza X/Y (ms)"); expect(container.textContent).toContain("Soglia Y alta");
    const xSource = container.querySelector<HTMLSelectElement>("fieldset.function-trend-source select")!;
    await act(async () => { xSource.value = "log"; xSource.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(update).toHaveBeenCalledWith("data-hmi-function-trend", expect.any(String));
    const changed = parseHmiFunctionTrendConfig(update.mock.calls[0][1])!; expect(changed.trends[0].x.source).toBe("log"); expect(changed.trends[0].y.tag).toBe("Motor.Temperature");
    await act(async () => root.unmount()); useEditorStore.setState({ document: undefined, selectedId: undefined, updateAttribute: originalUpdate });
  });
});

describe("multilingual object text", () => {
  it("offers the real project keys and shows the live Runtime language", async () => {
    const source = `export function Page(){return <h1 data-hmi-text="Page.Title">Titolo</h1>}`;
    const document = parseSource("src/Page.tsx", source);
    const node = Object.values(document.nodes).find((item) => item.type === "h1")!;
    useEditorStore.setState({
      document,
      selectedId: node.id,
      resourceCatalog: {
        ...emptyHmiResourceCatalog(),
        activeLanguage: "en-US",
        multilingualTexts: [{ key: "Page.Title", texts: { "it-IT": "Titolo", "en-US": "Title" } }],
      },
    });
    HTMLElement.prototype.scrollTo = vi.fn();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = window.document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(Inspector)));
    expect(container.innerHTML).toContain("Testo multilingua");
    expect(container.innerHTML).toContain("Page.Title");
    expect(container.innerHTML).toContain("anteprima en-US");
    await act(async () => root.unmount());
    useEditorStore.setState({ document: undefined, selectedId: undefined, resourceCatalog: emptyHmiResourceCatalog() });
  });
});
