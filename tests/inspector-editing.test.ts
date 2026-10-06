// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/inspector/Inspector";
import { parseSource } from "../src/source-parser/parseSource";
import { clearModuleCache } from "../src/core/moduleResolver";
import { emptyHmiResourceCatalog } from "../src/core/hmiResources";

const desktop = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: desktop }));
import { useEditorStore } from "../src/state/editorStore";

const initial = useEditorStore.getState();
const file = "C:/panel/Editing.jsx";
const original = 'export default function Page(){return <main><button style={{ width: "50%", height: "40px", color: "#123456", opacity: 0.55, border: "2px solid #123456", left: "12px" }}>Avvia</button><button>Ferma</button></main>}';
let root: Root, host: HTMLDivElement;
let files: Map<string, string>;
let labelFixtureSequence = 0;

beforeEach(async () => {
  vi.clearAllMocks(); clearModuleCache();
  files = new Map([[file, original]]);
  desktop.readFile.mockImplementation(async (path: string) => {
    const content = files.get(path);
    if (content === undefined) throw Error("ENOENT: test fixture " + path);
    return content;
  });
  desktop.writeFile.mockImplementation(async (path: string, content: string) => { files.set(path, content); });
  const document = parseSource(file, original);
  useEditorStore.setState({ ...initial,
    project: { root: "C:/panel", files: [] } as never,
    document, selectedId: Object.values(document.nodes).find((node) => node.type === "button")!.id,
    selectionInfo: undefined, selectionStyles: {}, selectionRect: { x: 10.25, y: 20, width: 120, height: 40 },
    multiSelection: [], unresolvedSelection: undefined, listBinding: undefined, callSites: undefined,
    propertiesExpandedAt: 0, textFocusRequestedAt: undefined, editScope: "instance", interactionMode: "edit",
    resourceCatalog: emptyHmiResourceCatalog(), panelManifest: undefined, pages: [],
    history: [], future: [], dirty: false, consoleEntries: [], lastError: undefined,
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn();
  host = window.document.createElement("div"); window.document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(Inspector)));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); useEditorStore.setState(initial, true); vi.restoreAllMocks();
});

function tab(name: string) { return [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) => button.textContent === name)!; }
async function choose(name: string) { await act(async () => tab(name).click()); }
function section(name: string) { return [...host.querySelectorAll<HTMLButtonElement>(".inspector-section-title")].find((button) => button.querySelector("span")?.textContent === name)!; }
function field(name: string) {
  const label = [...host.querySelectorAll<HTMLLabelElement>(".property-field")].find((item) => item.querySelector(":scope > span")?.textContent === name)!;
  return label.querySelector<HTMLInputElement>('input:not([type="color"])')!;
}
const textField = () => host.querySelector<HTMLTextAreaElement>("textarea[aria-label=\"Testo dell'elemento\"]")!;
const source = () => useEditorStore.getState().document!.source;
async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    input.focus();
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(input: HTMLElement, key: string, ctrlKey = false) {
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey, bubbles: true, cancelable: true })));
}
async function saved(check: () => void) { await act(async () => { await vi.waitFor(check); }); }

async function labels(label = "M2401") {
  const suffix = ++labelFixtureSequence;
  const labelFile = `C:/panel/Labels${suffix}.jsx`, dataFile = `C:/panel/LabelsData${suffix}.js`;
  const page = `import { parts } from "./LabelsData${suffix}.js"; export default function Page(){return <main>{parts.map(part => <button key={part.id}>{part.label}</button>)}</main>}`;
  const data = 'export const parts = [{ id: "one", label: "M2400" }, { id: "two", label: ' + JSON.stringify(label) + ' }];';
  files.set(labelFile, page); files.set(dataFile, data);
  const document = parseSource(labelFile, page), button = Object.values(document.nodes).find((node) => node.type === "button")!;
  await act(async () => {
    useEditorStore.setState({ document, selectedId: button.id, selectionInfo: { instanceIndex: 1, instanceCount: 2, listIndex: 1, text: label }, listBinding: undefined });
    await useEditorStore.getState().selectSource(button.source);
  });
  await saved(() => expect(useEditorStore.getState().listBinding?.textProperty).toBe("label"));
  desktop.writeFile.mockClear();
  return { page, data, dataFile, button };
}

describe("modifica degli elementi per attività", () => {
  it("parte dall'aspetto e tiene azioni, dati e codice in schede separate senza cambiare il progetto", async () => {
    expect([...host.querySelectorAll('[role="tab"]')].map((button) => button.textContent)).toEqual(["Aspetto", "Azioni", "PLC e dati", "Altro"]);
    expect(tab("Aspetto").getAttribute("aria-selected")).toBe("true");
    expect(textField().closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(false);
    expect(host.querySelector<HTMLDetailsElement>(".multilingual-options")!.open).toBe(false);
    expect(field("Larghezza").parentElement!.textContent).toContain("%");
    expect(host.querySelector('[aria-label="Apri il codice dell\'elemento"]')!.closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(true);
    for (const name of ["Azioni", "PLC e dati", "Altro", "Aspetto"]) {
      await choose(name);
      expect(host.querySelectorAll('[role="tabpanel"]:not([hidden])')).toHaveLength(1);
      expect(tab(name).tabIndex).toBe(0);
      expect([...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].filter((button) => button.tabIndex === 0)).toHaveLength(1);
    }
    expect(source()).toBe(original); expect(useEditorStore.getState().history).toEqual([]);
    expect(desktop.writeFile).not.toHaveBeenCalled();
  });

  it("si naviga con frecce, Home e End mantenendo il focus sulla scheda attiva", async () => {
    tab("Aspetto").focus();
    for (const [pressed, expected] of [["ArrowRight", "Azioni"], ["ArrowRight", "PLC e dati"], ["End", "Altro"], ["ArrowRight", "Aspetto"], ["ArrowLeft", "Altro"], ["Home", "Aspetto"]]) {
      await key(document.activeElement as HTMLElement, pressed);
      expect(document.activeElement).toBe(tab(expected)); expect(tab(expected).getAttribute("aria-selected")).toBe("true");
    }
  });

  it("conserva scheda e scroll dopo una modifica reale allo stesso elemento", async () => {
    await choose("Azioni"); const inspector = host.querySelector<HTMLElement>(".inspector")!; inspector.scrollTop = 460;
    const id = useEditorStore.getState().selectedId;
    vi.mocked(HTMLElement.prototype.scrollTo).mockClear();
    await act(async () => { await useEditorStore.getState().updateStyle("width", "75.5%"); });
    expect(source()).toContain('width: "75.5%"'); expect(useEditorStore.getState().selectedId).not.toBe(id);
    expect(tab("Azioni").getAttribute("aria-selected")).toBe("true"); expect(inspector.scrollTop).toBe(460);
    expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled(); expect(useEditorStore.getState().history).toHaveLength(1);
    const other = Object.values(useEditorStore.getState().document!.nodes).filter((node) => node.type === "button")[1];
    await act(async () => useEditorStore.setState({ selectedId: other.id }));
    expect(tab("Aspetto").getAttribute("aria-selected")).toBe("true"); expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledOnce();
  });

  it("il doppio clic riapre e seleziona il testo senza espandere tutti i dettagli né ripetere il focus", async () => {
    await act(async () => section("Contenuto").click()); await choose("PLC e dati");
    const selected = useEditorStore.getState().document!.nodes[useEditorStore.getState().selectedId!]!;
    await act(async () => { await useEditorStore.getState().inspectSource(selected.source, "button", true); });
    expect(tab("Aspetto").getAttribute("aria-selected")).toBe("true"); expect(section("Contenuto").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(textField()); expect(textField().selectionEnd).toBe(textField().value.length);
    expect(section("Avanzate").getAttribute("aria-expanded")).toBe("false"); expect(useEditorStore.getState().propertiesExpandedAt).toBe(0);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledOnce();
    await choose("Azioni"); await choose("Aspetto");
    await act(async () => { await useEditorStore.getState().updateStyle("color", "#654321"); });
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledOnce();
  });
});

describe("applicazione e annullamento dei campi", () => {
  it.each([["Larghezza", "80"], ["Altezza", "60"], ["X", "240"], ["Y", "400"], ["Colore testo", "#654321"], ["Opacità", "0.75"]])("Esc annulla %s senza scrivere", async (name, value) => {
    const input = field(name), before = input.value;
    await type(input, value); await key(input, "Escape");
    expect(input.value).toBe(before); expect(source()).toBe(original);
    expect(useEditorStore.getState().history).toEqual([]); expect(desktop.writeFile).not.toHaveBeenCalled();
  });

  it("Esc annulla anche lo spessore del bordo e le proprietà CSS testuali", async () => {
    const border = host.querySelector<HTMLInputElement>('[aria-label="Bordo: spessore"]')!;
    await type(border, "8"); expect(desktop.writeFile).not.toHaveBeenCalled(); await key(border, "Escape"); expect(border.value).toBe("2");
    await choose("Altro"); await act(async () => section("Posizione CSS").click());
    await type(field("Left"), "240px"); await key(field("Left"), "Escape");
    expect(field("Left").value).toBe("12px"); expect(source()).toBe(original); expect(desktop.writeFile).not.toHaveBeenCalled();
  });

  it("non scrive valori arrotondati se un campo non è stato modificato e non interpreta X vuoto come zero", async () => {
    expect(field("Opacità").value).toBe("0.55");
    for (const name of ["X", "Opacità"]) await act(async () => { field(name).focus(); field(name).blur(); });
    await type(field("X"), ""); await act(async () => field("X").blur());
    expect(source()).toBe(original); expect(desktop.writeFile).not.toHaveBeenCalled();
  });

  it("Invio applica una misura conservando le percentuali invece di convertirle in pixel", async () => {
    await type(field("Larghezza"), "75"); expect(source()).toBe(original); await key(field("Larghezza"), "Enter");
    await saved(() => expect(source()).toContain('width: "75%"'));
    expect(field("Larghezza").value).toBe("75"); expect(field("Larghezza").parentElement!.textContent).toContain("%");
    expect(useEditorStore.getState().history).toHaveLength(1); expect(desktop.writeFile).toHaveBeenCalledOnce();
  });

  it("Ctrl+Invio applica il testo su più righe mentre Esc ripristina la scritta", async () => {
    await type(textField(), "Da annullare"); await key(textField(), "Escape");
    expect(textField().value).toBe("Avvia"); expect(desktop.writeFile).not.toHaveBeenCalled();
    await type(textField(), "Avvia\nMotore"); await key(textField(), "Enter", true);
    await saved(() => expect(source()).toContain("Avvia\nMotore"));
    expect(useEditorStore.getState().history).toHaveLength(1); expect(tab("Aspetto").getAttribute("aria-selected")).toBe("true");
  });

  it.each([["Dimensione testo", "fontSize", "1.25rem", "2.5", "2.5rem"], ["Opacità", "opacity", "50%", "75", "75%"]])("conserva anche l'unità già presente in %s", async (name, property, current, next, expected) => {
    await act(async () => { await useEditorStore.getState().updateStyle(property, current); });
    desktop.writeFile.mockClear(); useEditorStore.setState({ history: [] });
    await type(field(name), next); await key(field(name), "Enter");
    await saved(() => expect(Object.values(useEditorStore.getState().document!.nodes).find((node) => node.type === "button")!.styles[property]).toBe(expected));
    expect(desktop.writeFile).toHaveBeenCalledOnce(); expect(useEditorStore.getState().history).toHaveLength(1);
  });

  it.each(['title="Motore"', 'title={motorTitle}'])("Esc annulla l'attributo %s senza sovrascriverlo", async (attribute) => {
    const next = original.replace("<button style", `<button ${attribute} style`), document = parseSource(file, next);
    files.set(file, next);
    await act(async () => useEditorStore.setState({ document, selectedId: Object.values(document.nodes).find((node) => node.type === "button")!.id }));
    await choose("Altro"); await act(async () => section("Attributi").click());
    const input = field("title"), before = input.value;
    await type(input, "Nuova descrizione"); await key(input, "Escape");
    expect(input.value).toBe(before); expect(source()).toBe(next); expect(desktop.writeFile).not.toHaveBeenCalled();
  });

  it("Esc annulla il tag della dinamica senza cambiare il mapping", async () => {
    const dynamics = JSON.stringify([{ property: "Visible", kind: "Tag", tag: "Machine.Ready" }]);
    const next = original.replace("<button style", `<button data-hmi-dynamizations='${dynamics}' style`), document = parseSource(file, next);
    files.set(file, next);
    await act(async () => useEditorStore.setState({ document, selectedId: Object.values(document.nodes).find((node) => node.type === "button")!.id }));
    await choose("PLC e dati");
    if (section("Dinamica PLC · 1").getAttribute("aria-expanded") !== "true") await act(async () => section("Dinamica PLC · 1").click());
    const input = host.querySelector<HTMLInputElement>('.dynamization-field input[list="hmi-dynamization-tags"]')!;
    expect(input.value).toBe("Machine.Ready"); await type(input, "Machine.Alarm"); await key(input, "Escape");
    expect(input.value).toBe("Machine.Ready"); expect(source()).toBe(next); expect(desktop.writeFile).not.toHaveBeenCalled();
  });

  it("Esc non collega involontariamente un tag PLC", async () => {
    await choose("PLC e dati");
    const input = host.querySelector<HTMLInputElement>('[aria-label="Variabile PLC da collegare"]')!;
    await type(input, "Machine.Speed"); await key(input, "Escape");
    expect(input.value).toBe(""); expect(source()).toBe(original); expect(desktop.writeFile).not.toHaveBeenCalled();
  });
});

describe("testo delle targhette collegato ai dati", () => {
  it("trasferisce il focus al testo della voce quando i suoi dati arrivano dopo il doppio clic", async () => {
    const slowFile = "C:/panel/SlowLabels.jsx", slowData = "C:/panel/SlowLabelsData.js";
    const page = 'import { parts } from "./SlowLabelsData.js"; export default function Page(){return <main>{parts.map(part => <button>{part.label}</button>)}</main>}';
    const document = parseSource(slowFile, page), node = Object.values(document.nodes).find((item) => item.type === "button")!;
    files.set(slowFile, page); files.set(slowData, 'export const parts = [{ label: "M2400" }, { label: "M2401" }];');
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    desktop.readFile.mockImplementation(async (path: string) => {
      if (path === slowData) await pending;
      const content = files.get(path); if (content === undefined) throw Error("ENOENT: test fixture"); return content;
    });
    try {
      await act(async () => {
        useEditorStore.setState({ document, selectedId: node.id, listBinding: undefined, selectionInfo: { instanceIndex: 1, instanceCount: 2, listIndex: 1, text: "M2401" } });
        await useEditorStore.getState().inspectSource(node.source, "button", true);
      });
      expect(window.document.activeElement).toBe(textField());
      await act(async () => { release(); await vi.waitFor(() => expect(useEditorStore.getState().listBinding?.textProperty).toBe("label")); });
      expect(textField()).toBeNull(); expect(window.document.activeElement).toBe(field("Testo"));
      expect(field("Testo").value).toBe("M2401"); expect(desktop.writeFile).not.toHaveBeenCalled();
    } finally { release(); }
  });

  it("mostra un solo campo Testo, lo seleziona al doppio clic e lascia l'importazione PLC nella sua scheda", async () => {
    const { button } = await labels();
    expect(field("Testo").value).toBe("M2401"); expect(textField()).toBeNull();
    const dataSection = section("Dati della lista"); expect(dataSection.closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(true);
    await choose("Azioni");
    await act(async () => { await useEditorStore.getState().inspectSource(button.source, "button", true); });
    expect(document.activeElement).toBe(field("Testo")); expect(field("Testo").selectionEnd).toBe(5);
    await type(field("Testo"), "Da annullare"); await key(field("Testo"), "Escape");
    expect(field("Testo").value).toBe("M2401"); expect(desktop.writeFile).not.toHaveBeenCalled();
    await choose("PLC e dati"); await act(async () => dataSection.click());
    expect(host.querySelector(".plc-list-fill")!.closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(false);
  });

  it("Invio rinomina soltanto la voce selezionata nel file dati e lascia il JSX collegato", async () => {
    const { page, dataFile } = await labels();
    await type(field("Testo"), "M2501"); await key(field("Testo"), "Enter");
    await saved(() => expect(files.get(dataFile)).toContain('label: "M2501"'));
    expect(files.get(dataFile)).toContain('label: "M2400"'); expect(source()).toBe(page);
    expect(desktop.writeFile.mock.calls.every(([path]) => path === dataFile)).toBe(true);
    expect(useEditorStore.getState().history).toHaveLength(1);
    await saved(() => expect(field("Testo").value).toBe("M2501"));
  });

  it("annulla e applica anche un testo lungo nella voce reale", async () => {
    const longText = "Descrizione della parte della macchina abbastanza lunga da usare più righe";
    const { data, dataFile } = await labels(longText);
    const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Testo"]')!;
    await type(input, "Non salvare"); await key(input, "Escape"); expect(files.get(dataFile)).toBe(data); expect(input.value).toBe(longText);
    await type(input, "Nuova descrizione\nsu due righe"); await key(input, "Enter", true);
    await saved(() => expect(files.get(dataFile)).toContain(JSON.stringify("Nuova descrizione\nsu due righe")));
    expect(useEditorStore.getState().history).toHaveLength(1);
  });

  it("non ripete il focus quando la scritta modificata diventa un campo su più righe", async () => {
    const { button, dataFile } = await labels();
    await act(async () => { await useEditorStore.getState().inspectSource(button.source, "button", true); });
    expect(document.activeElement).toBe(field("Testo"));
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear();
    const longText = "Descrizione della parte della macchina abbastanza lunga da usare più righe";
    await type(field("Testo"), longText); await key(field("Testo"), "Enter");
    await saved(() => expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Testo"]')?.value).toBe(longText));
    expect(files.get(dataFile)).toContain(JSON.stringify(longText));
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(host.querySelector('textarea[aria-label="Testo"]'));
  });
});
