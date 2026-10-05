// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "@babel/parser";
import { readHighlightRegion, type HighlightRegion } from "../src/core/highlightRegion";
import { parseSource } from "../src/source-parser/parseSource";
import { addHighlightInteraction, removeHighlightTrigger, updateHighlightTrigger } from "../src/source-parser/transformSource";
const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
import { useEditorStore } from "../src/state/editorStore";
const initial = useEditorStore.getState();
const file = "C:/panel/Page.tsx";
const original = 'export function Page(){return <main><button onClick={() => window.__highlightCalls++}>Mostra M2400</button><img src="/macchina.png" alt="Macchina" /></main>}';
const region: HighlightRegion = { space: "box", points: [{ x: .1, y: .2 }, { x: .6, y: .2 }, { x: .6, y: .7 }, { x: .1, y: .7 }] };
let frames: Map<number, FrameRequestCallback>;
let files: Map<string, string>;
beforeEach(() => {
  document.body.innerHTML = "";
  files = new Map([[file, original]]);
  bridge.readFile.mockReset().mockImplementation(async (path: string) => files.get(path) ?? "");
  bridge.writeFile.mockReset().mockImplementation(async (path: string, source: string) => { files.set(path, source); });
  useEditorStore.setState({ ...initial, project: { root: "C:/panel", files: [] } as never, panelManifest: undefined, pages: [],
    document: parseSource(file, original), selectedId: undefined, selectionInfo: undefined, selectionRect: undefined,
    interactionMode: "edit", dirty: false, previewPath: "/", history: [], future: [], consoleEntries: [],
    lastError: undefined, highlightPicker: undefined, externalRoots: [], unlockedFiles: [], unlockedPages: [], multiSelection: [] });
  frames = new Map(); let id = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++id, callback); return id; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((key) => { frames.delete(key); });
  Object.assign(window, { __highlightCalls: 0 });
});
afterEach(() => { for (const element of document.querySelectorAll<HTMLElement>("[data-fc-highlight-id]")) (element as HTMLElement & { __framecraftRegionCleanup?: () => void }).__framecraftRegionCleanup?.(); useEditorStore.setState(initial, true); vi.restoreAllMocks(); });
function flush() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); }
function generated(input = original, zone = region) {
  const nodes = Object.values(parseSource(file, input).nodes);
  const trigger = nodes.find((node) => node.type === "button")!, target = nodes.find((node) => node.type === "img")!;
  return addHighlightInteraction(input, trigger.source.start, trigger.source.end, target.source.start, target.source.end, { targetId: "region-test", color: "#22c55e", width: 5, region: zone });
}
function clickHandler(source: string) {
  const stack: unknown[] = [parse(source, { sourceType: "module", plugins: ["jsx"] })];
  while (stack.length) {
    const node = stack.pop() as Record<string, any>;
    if (!node || typeof node !== "object") continue;
    if (node.type === "JSXAttribute" && node.name?.name === "onClick") return new Function("return (" + source.slice(node.value.expression.start, node.value.expression.end) + ");")() as (event: unknown) => void;
    for (const value of Object.values(node)) { if (Array.isArray(value)) stack.push(...value); else if (value && typeof value === "object") stack.push(value); }
  }
  throw new Error("onClick non trovato");
}
function target() {
  const image = document.createElement("img"); image.dataset.fcHighlightId = "region-test";
  image.style.outline = "2px dotted red";
  const box = { left: 100, top: 50, width: 400, height: 200 };
  Object.defineProperty(image, "getBoundingClientRect", { value: () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height }) });
  document.body.append(image);
  return { image, box };
}
function choose() {
  const parsed = useEditorStore.getState().document!;
  const trigger = Object.values(parsed.nodes).find((node) => node.type === "button")!;
  useEditorStore.setState({ selectedId: trigger.id });
  return Object.values(parsed.nodes).find((node) => node.type === "img")!;
}

describe("zone serializzate e Runtime esportabile", () => {
  it("valida e copia una zona senza conservare campi estranei", () => {
    expect(readHighlightRegion(JSON.stringify({ ...region, unexpected: "ignore" }))).toEqual(region);
    expect(readHighlightRegion(region)?.points).not.toBe(region.points);
  });
  it.each([null, "{", { space: "other", points: region.points }, { space: "box", points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] },
    { space: "box", points: [{ x: -1, y: 0 }, { x: .5, y: 0 }, { x: 0, y: 1 }] }, { space: "box", points: [{ x: NaN, y: 0 }, { x: .5, y: 0 }, { x: 0, y: 1 }] },
    { space: "svg", points: Array.from({ length: 129 }, (_, x) => ({ x, y: x % 3 })) }])("rifiuta coordinate o contorni non validi: %j", (value) => expect(readHighlightRegion(value)).toBeUndefined());

  it("il click JSX crea una zona e la spegne senza alterare lo stile della foto", () => {
    const { image } = target();
    const click = clickHandler(generated());
    click({});
    const layer = document.querySelector("[data-fc-highlight-region-layer]")!;
    expect(layer.querySelector("path")?.getAttribute("d")).toBe("M140 90 L340 90 L340 190 L140 190 Z");
    expect(layer.querySelector("path")?.getAttribute("stroke")).toBe("#22c55e");
    expect(image.style.outline).toBe("2px dotted red");
    expect((layer as SVGElement).style.pointerEvents).toBe("none");
    expect(image.dataset.fcHighlightRegionActive).toBe("true");
    click({});
    expect(document.querySelector("[data-fc-highlight-region-layer]")).toBeNull();
    expect(image.dataset.fcHighlightRegionActive).toBe("false");
    expect(image.style.outline).toBe("2px dotted red");
    expect((window as any).__highlightCalls).toBe(2);
    expect(frames.size).toBe(0);
  });
  it("la zona e l'evidenziazione dell'elemento intero non si corrompono reciprocamente", () => {
    const { image } = target(); image.scrollIntoView = vi.fn();
    const nodes = Object.values(parseSource(file, original).nodes), button = nodes.find((node) => node.type === "button")!, drawing = nodes.find((node) => node.type === "img")!;
    const whole = clickHandler(addHighlightInteraction(original, button.source.start, button.source.end, drawing.source.start, drawing.source.end, { targetId: "region-test", color: "#22c55e", width: 5 }));
    const area = clickHandler(generated());
    whole({}); expect(image.dataset.fcHighlightActive).toBe("true");
    area({}); expect(image.dataset.fcHighlightActive).toBe("true"); expect(image.dataset.fcHighlightRegionActive).toBe("true");
    area({}); expect(image.dataset.fcHighlightActive).toBe("true"); expect(image.style.outline).toBe("5px solid #22c55e");
    area({}); whole({});
    expect(image.dataset.fcHighlightActive).toBe("false"); expect(image.dataset.fcHighlightRegionActive).toBe("true");
    expect(image.style.outline).toBe("2px dotted red");
    area({}); expect(document.querySelector("[data-fc-highlight-region-layer]")).toBeNull();
    expect(image.style.outline).toBe("2px dotted red"); expect((window as any).__highlightCalls).toBe(6);
  });
  it("due pulsanti con zone diverse sulla stessa foto passano subito da un motore all'altro", () => {
    target();
    const first = clickHandler(generated());
    const second = clickHandler(generated(original, { space: "box", points: [{ x: .6, y: .2 }, { x: .9, y: .2 }, { x: .9, y: .7 }, { x: .6, y: .7 }] }));
    first({}); second({});
    expect(document.querySelectorAll("[data-fc-highlight-region-layer]")).toHaveLength(1);
    expect(document.querySelector("[data-fc-highlight-region-layer] path")?.getAttribute("d")).toBe("M340 90 L460 90 L460 190 L340 190 Z");
    expect((window as any).__highlightCalls).toBe(2);
    second({});
    expect(document.querySelector("[data-fc-highlight-region-layer]")).toBeNull(); expect(frames.size).toBe(0);
  });
  it("l'overlay neutralizza le regole SVG generali senza ereditare margini e sfondo opaco", () => {
    const style = document.createElement("style");
    style.textContent = "svg{margin:30px;background:red;border:10px solid blue}svg path{fill:blue;stroke:blue;display:none;opacity:.1}";
    document.head.append(style);
    try {
      target(); clickHandler(generated())({});
      const layer = document.querySelector<SVGElement>("[data-fc-highlight-region-layer]")!;
      const path = layer.querySelector<SVGElement>("path")!;
      expect(layer.style.all).toBe("initial"); expect(layer.style.margin).toBe("0px");
      expect(getComputedStyle(layer).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(path.style.fill).toBe("#22c55e"); expect(path.style.stroke).toBe("#22c55e");
      expect(getComputedStyle(path).display).toBe("inline"); expect(path.style.opacity).toBe("1");
    } finally { style.remove(); }
  });
  it("la zona segue scroll, posizione e ridimensionamento della foto", () => {
    const { box } = target(); clickHandler(generated())({});
    box.left = 20; box.top = -10; box.width = 800; box.height = 400; flush();
    expect(document.querySelector("[data-fc-highlight-region-layer] path")?.getAttribute("d")).toBe("M100 70 L500 70 L500 270 L100 270 Z");
  });
  it("usa il sistema di coordinate e la matrice reali di uno SVG", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.dataset.fcHighlightId = "region-test";
    Object.assign(svg, { getScreenCTM: () => ({ a: 2, b: 0, c: 0, d: 3, e: 40, f: 10 }), getBoundingClientRect: () => ({ width: 200, height: 300 }) });
    document.body.append(svg);
    const svgRegion: HighlightRegion = { space: "svg", points: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 30 }] };
    clickHandler(generated(original, svgRegion))({});
    expect(document.querySelector("[data-fc-highlight-region-layer] path")?.getAttribute("d")).toBe("M60 40 L80 40 L80 100 Z");
    (svg as SVGElement & { __framecraftRegionCleanup?: () => void }).__framecraftRegionCleanup?.();
  });
  it.each(["remove", "pagehide"])("pulisce overlay e frame quando la pagina o la foto sparisce: %s", (reason) => {
    const { image } = target(); clickHandler(generated())({});
    if (reason === "remove") { image.remove(); flush(); } else window.dispatchEvent(new Event("pagehide"));
    expect(document.querySelector("[data-fc-highlight-region-layer]")).toBeNull(); expect(frames.size).toBe(0);
  });
  it("colore e spessore modificabili conservano la zona e il click originale", () => {
    const source = generated(), node = Object.values(parseSource(file, source).nodes).find((item) => item.type === "button")!;
    const updated = updateHighlightTrigger(source, node.source.start, node.source.end, { targetId: "region-test", color: "#f59e0b", width: 7 });
    expect(readHighlightRegion(Object.values(parseSource(file, updated).nodes).find((item) => item.type === "button")!.props["data-fc-highlight-region"])).toEqual(region);
    target(); clickHandler(updated)({});
    expect(document.querySelector("[data-fc-highlight-region-layer] path")?.getAttribute("stroke-width")).toBe("7");
    expect((window as any).__highlightCalls).toBe(1);
  });
  it("ridisegnare non annida il vecchio handler né esegue due volte il click originale", () => {
    const twice = generated(generated()); target(); clickHandler(twice)({});
    expect((window as any).__highlightCalls).toBe(1);
    expect(document.querySelectorAll("[data-fc-highlight-region-layer]")).toHaveLength(1);
    const node = Object.values(parseSource(file, twice).nodes).find((item) => item.type === "button")!;
    const removed = removeHighlightTrigger(twice, node.source.start, node.source.end);
    expect(removed).not.toContain("data-fc-highlight-region=");
    expect(removed).toContain("onClick={() => window.__highlightCalls++}");
  });
});

describe("salvataggio della zona nel vero store", () => {
  it("salva foto e pulsante nello stesso file con un solo annulla/ripeti", async () => {
    const image = choose(); useEditorStore.getState().beginHighlightSelection({ color: "#22c55e", width: 5 }, "rectangle");
    await useEditorStore.getState().selectSource(image.source, "img", region);
    expect(useEditorStore.getState().lastError).toBeUndefined();
    expect(useEditorStore.getState().highlightPicker).toBeUndefined();
    const written = files.get(file)!;
    expect(written).toContain("data-fc-highlight-region=");
    expect(useEditorStore.getState().history).toHaveLength(1);
    await useEditorStore.getState().undo(); expect(files.get(file)).toBe(original);
    await useEditorStore.getState().redo(); expect(files.get(file)).toBe(written);
  });
  it("due targhette riusano la foto e la seconda resta selezionata dopo aver disegnato", async () => {
    const source = original.replace("</button>", "</button><button>Mostra M2500</button>");
    files.set(file, source); useEditorStore.setState({ document: parseSource(file, source) });
    let nodes = Object.values(useEditorStore.getState().document!.nodes);
    useEditorStore.setState({ selectedId: nodes.find((node) => node.type === "button")!.id });
    useEditorStore.getState().beginHighlightSelection({ color: "#22c55e", width: 5 }, "rectangle");
    await useEditorStore.getState().selectSource(nodes.find((node) => node.type === "img")!.source, "img", region);
    nodes = Object.values(useEditorStore.getState().document!.nodes);
    const second = nodes.find((node) => node.text === "Mostra M2500")!;
    useEditorStore.setState({ selectedId: second.id });
    useEditorStore.getState().beginHighlightSelection({ color: "#f59e0b", width: 3 }, "polygon");
    await useEditorStore.getState().selectSource(nodes.find((node) => node.type === "img")!.source, "img", { space: "box", points: [{ x: .6, y: .2 }, { x: .9, y: .2 }, { x: .9, y: .7 }] });
    const state = useEditorStore.getState(); nodes = Object.values(state.document!.nodes);
    expect(state.lastError).toBeUndefined(); expect(state.document!.nodes[state.selectedId!].text).toBe("Mostra M2500");
    const buttons = nodes.filter((node) => node.type === "button"), image = nodes.find((node) => node.type === "img")!;
    expect(buttons.map((node) => node.props["data-fc-highlight-target"])).toEqual([image.props["data-fc-highlight-id"], image.props["data-fc-highlight-id"]]);
    expect(buttons[0].props["data-fc-highlight-region"]).not.toBe(buttons[1].props["data-fc-highlight-region"]);
  });
  it("un normale click selezione non conclude la modalità disegno", async () => {
    const image = choose(); useEditorStore.getState().beginHighlightSelection({ color: "#22c55e", width: 5 }, "polygon");
    const picker = useEditorStore.getState().highlightPicker;
    await useEditorStore.getState().selectSource(image.source, "img");
    expect(useEditorStore.getState().highlightPicker).toBe(picker); expect(bridge.writeFile).not.toHaveBeenCalled();
  });
  it("non sovrascrive il codice non salvato con il vecchio sorgente su disco", async () => {
    const draft = original.replace("Mostra M2400", "Bozza non salvata");
    useEditorStore.setState({ document: parseSource(file, draft), dirty: true });
    const image = choose(); useEditorStore.getState().beginHighlightSelection({ color: "#22c55e", width: 5 }, "rectangle");
    await useEditorStore.getState().selectSource(image.source, "img", region);
    expect(useEditorStore.getState().document?.source).toBe(draft); expect(bridge.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().lastError).toContain("Salva prima");
  });
  it("annulla anche una risposta asincrona già in corso", async () => {
    const image = choose(); useEditorStore.getState().beginHighlightSelection({ color: "#22c55e", width: 5 }, "rectangle");
    let resolveRead!: (value: string) => void;
    bridge.readFile.mockImplementationOnce(() => new Promise<string>((resolve) => { resolveRead = resolve; }));
    const pending = useEditorStore.getState().selectSource(image.source, "img", region);
    await vi.waitFor(() => expect(resolveRead).toBeDefined());
    useEditorStore.getState().cancelHighlightSelection(); resolveRead(original); await pending;
    expect(bridge.writeFile).not.toHaveBeenCalled(); expect(useEditorStore.getState().document?.source).toBe(original);
  });
  it("rifiuta file non autorizzati senza scrivere nulla", async () => {
    const image = choose(); useEditorStore.getState().beginHighlightSelection({ color: "#22c55e", width: 5 }, "rectangle");
    await useEditorStore.getState().selectSource({ ...image.source, file: "C:/outside/Page.tsx" }, "img", region);
    expect(bridge.writeFile).not.toHaveBeenCalled(); expect(useEditorStore.getState().lastError).toContain("cartelle autorizzate");
  });
  it("registrando due file conserva anche la cronologia della foto", async () => {
    choose(); const targetFile = "C:/panel/Drawing.tsx", drawing = 'export function Drawing(){return <img src="/macchina.png" />}';
    files.set(targetFile, drawing);
    const image = Object.values(parseSource(targetFile, drawing).nodes)[0];
    useEditorStore.getState().beginHighlightSelection({ color: "#22c55e", width: 5 }, "rectangle");
    await useEditorStore.getState().selectSource(image.source, "img", region);
    expect(useEditorStore.getState().history.map((snapshot) => snapshot.file)).toEqual([targetFile, file]);
    await useEditorStore.getState().undo(); expect(files.get(file)).toBe(original);
    await useEditorStore.getState().undo(); expect(files.get(targetFile)).toBe(drawing);
  });
});
