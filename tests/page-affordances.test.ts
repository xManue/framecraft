import { beforeEach, describe, expect, it, vi } from "vitest";
import { fieldValue, pageAffordances, parsePanelManifest, withFieldValue } from "../src/core/panelManifest";
import { readDataList, writeDataList } from "../src/source-parser/dataList";
import { parseSource } from "../src/source-parser/parseSource";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn(), createFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { readFile: bridge.readFile, writeFile: bridge.writeFile, createFile: bridge.createFile },
}));
import { useEditorStore } from "../src/state/editorStore";

const manifestJson = JSON.stringify({
  id: "can-line-operator",
  pages: ["machine-view"],
  editor: {
    version: 1,
    pages: [{
      id: "machine-view",
      locked: true,
      affordances: [{
        id: "machine-zones",
        type: "image-zones",
        label: "Zone sulla foto della macchina",
        can: ["add", "remove", "rename", "move", "outline"],
        data: { file: "src/machineZones.js", list: "machineZones", filter: { pageId: "machine-view" } },
        stage: { file: "src/machineZones.js", object: "machineStage", selector: ".machine-zone-map" },
        references: { parts: { file: "src/parts.js", list: "machineParts", id: "id", label: "label" } },
        fields: [
          { path: "label", label: "Nome della zona", type: "text" },
          { path: "partId", label: "Parte", type: "reference", source: "parts" },
          { path: "hotspot", label: "Posizione", type: "point", pickOn: "stage" },
          { path: "outline", label: "Contorno", type: "path", drawOn: "stage" },
        ],
        defaults: { id: "{pageId}-{partId}", pageId: "machine-view", style: "line" },
      }],
    }],
  },
});

const zonesFile = `export const machineStage = { image: "/machine-line.png", viewBox: "0 0 1926 1088" };

export const machineZones = [
  {
    id: "machine-view-unscramblers-conveyor",
    pageId: "machine-view",
    partId: "unscramblers-conveyor",
    label: "Unscramblers Conveyor",
    hotspot: { x: 120, y: 653 },
    style: "line",
    outline: "M154 592 L158 486",
  },
  {
    id: "manual-general-unscramblers-area",
    pageId: "manual-general",
    partId: "unscramblers-conveyor",
    label: "Unscramblers Conveyor",
    hotspot: { x: 220, y: 565 },
    style: "area",
  },
];

export const zonesOfPage = (pageId) => machineZones.filter((zone) => zone.pageId === pageId);
`;

const partsFile = `export const machineParts = [
  { id: "unscramblers-conveyor", label: "Unscramblers Conveyor" },
  { id: "cans-filled-conveyor-2", label: "Cans Filled Conveyor #2" },
];
`;

const affordanceOf = () => pageAffordances(parsePanelManifest(manifestJson), "machine-view")[0];

describe("what a page declares the editor may change", () => {
  it("reads the manifest and drops what it does not understand", () => {
    const manifest = parsePanelManifest(manifestJson)!;
    const affordance = pageAffordances(manifest, "machine-view")[0];
    expect(affordance.data).toEqual({ file: "src/machineZones.js", list: "machineZones", filter: { pageId: "machine-view" } });
    expect(affordance.fields.map((field) => field.type)).toEqual(["text", "reference", "point", "path"]);
    expect(affordance.fields[2].pickOnStage).toBe(true);
    expect(affordance.references?.parts.list).toBe("machineParts");
    // Una pagina che non dichiara niente non offre niente, e un pannello senza manifesto nemmeno.
    expect(pageAffordances(manifest, "consumption")).toEqual([]);
    expect(parsePanelManifest('{"pages":["machine-view"]}')).toBeUndefined();
    expect(parsePanelManifest("non json")).toBeUndefined();
  });

  it("ignores an affordance of a kind it cannot offer", () => {
    const manifest = parsePanelManifest(JSON.stringify({
      editor: { pages: [{ id: "machine-view", affordances: [{ id: "futuro", type: "3d-scene", data: { file: "a.js", list: "b" }, fields: [{ path: "x", type: "text" }] }] }] },
    }));
    expect(pageAffordances(manifest, "machine-view")).toEqual([]);
  });

  it("reads a data list and writes it back leaving the rest of the file alone", () => {
    const list = readDataList(zonesFile, "machineZones")!;
    expect(list.items).toHaveLength(2);
    expect(list.items[0].hotspot).toEqual({ x: 120, y: 653 });

    const next = writeDataList(zonesFile, list, [
      { ...list.items[0], hotspot: { x: 300, y: 200 } },
      list.items[1],
    ]);
    expect(next).toContain('export const machineStage = { image: "/machine-line.png", viewBox: "0 0 1926 1088" };');
    expect(next).toContain("export const zonesOfPage = (pageId) => machineZones");
    expect(readDataList(next, "machineZones")!.items[0].hotspot).toEqual({ x: 300, y: 200 });
  });

  it("refuses a list that is not made of plain values, instead of throwing it away", () => {
    expect(readDataList("const zones = [{ id: buildId(), x: 1 }];", "zones")).toBeUndefined();
    expect(readDataList("const zones = [...others];", "zones")).toBeUndefined();
    expect(readDataList(zonesFile, "assente")).toBeUndefined();
  });

  it("reads and writes a nested field by its declared path", () => {
    const item = { id: "a", hotspot: { x: 1, y: 2 } };
    expect(fieldValue(item, "hotspot.x")).toBe(1);
    expect(withFieldValue(item, "hotspot.y", 9)).toEqual({ id: "a", hotspot: { x: 1, y: 9 } });
    expect(withFieldValue(item, "label", "Nuova")).toEqual({ id: "a", hotspot: { x: 1, y: 2 }, label: "Nuova" });
  });
});

const settingsManifest = JSON.stringify({
  editor: { pages: [{ id: "special-function", locked: true, affordances: [{
    id: "special-functions", type: "settings-list", label: "Impostazioni della macchina",
    can: ["add", "remove", "rename"],
    data: { file: "src/specialFunctions.js", list: "specialFunctions" },
    fields: [
      { path: "label", label: "Nome", type: "text" },
      { path: "control", label: "Comando", type: "choice", options: [{ value: "toggle", label: "ON/OFF" }] },
      { path: "tag", label: "Variabile PLC", type: "tag" },
    ],
    defaults: { id: "{name}", control: "toggle", value: false },
  }] }] },
});

const settingsFile = `export const specialFunctions = [
  { id: "enable-metal-detector", label: "Enable Metal Detector", control: "toggle", tag: "Machine.EnableMetalDetector", value: false },
];
`;

describe("the settings of a machine, which change from machine to machine", () => {
  beforeEach(() => {
    bridge.readFile.mockReset().mockResolvedValue(settingsFile);
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    useEditorStore.setState({
      project: { root: "C:/panel", name: "panel", framework: "vite", language: "javascript", packageManager: "npm", entryFiles: [], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] },
      panelManifest: parsePanelManifest(settingsManifest),
      pages: [{ id: "page-9", name: "Special Functions", route: "/", file: "C:/panel/src/App.jsx", stateValue: "special-function" }],
      activePageId: "page-9", document: undefined, history: [], future: [], consoleEntries: [], lastError: undefined, zonePicking: undefined, unlockedPages: [],
    });
  });

  it("declares a list of rows with a PLC variable, and keeps the values the manifest gives them", async () => {
    const affordance = useEditorStore.getState().activeAffordances()[0];
    expect(affordance.type).toBe("settings-list");
    expect(affordance.fields.map((field) => field.type)).toEqual(["text", "choice", "tag"]);
    // Un valore di partenza non è per forza una stringa: un interruttore parte spento.
    expect(affordance.defaults).toEqual({ id: "{name}", control: "toggle", value: false });

    await useEditorStore.getState().addAffordanceItem(affordance, {
      id: "enable-unscrambler-cans", label: "Enable Unscrambler Cans", control: "toggle", value: false, tag: "Machine.EnableUnscramblerCans",
    });

    const written = bridge.writeFile.mock.calls.at(-1)![1] as string;
    const rows = readDataList(written, "specialFunctions")!.items;
    expect(rows.map((row) => row.id)).toEqual(["enable-metal-detector", "enable-unscrambler-cans"]);
    expect(rows[1]).toMatchObject({ control: "toggle", value: false, tag: "Machine.EnableUnscramblerCans" });
  });

  it("changes the variable a row is wired to", async () => {
    const affordance = useEditorStore.getState().activeAffordances()[0];
    await useEditorStore.getState().updateAffordanceItem(affordance, "enable-metal-detector", "tag", "Machine.MetalDetectorOn");
    const written = bridge.writeFile.mock.calls.at(-1)![1] as string;
    expect(readDataList(written, "specialFunctions")!.items[0].tag).toBe("Machine.MetalDetectorOn");
  });
});

describe("adding a zone to the page", () => {
  beforeEach(() => {
    bridge.readFile.mockReset().mockImplementation(async (file: string) =>
      file.includes("machineZones") ? zonesFile : file.includes("parts") ? partsFile : manifestJson);
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    useEditorStore.setState({
      project: { root: "C:/panel", name: "panel", framework: "vite", language: "javascript", packageManager: "npm", entryFiles: [], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] },
      panelManifest: parsePanelManifest(manifestJson),
      pages: [{ id: "page-1", name: "Machine View", route: "/", file: "C:/panel/src/MachineView.jsx", stateValue: "machine-view" }],
      activePageId: "page-1", document: undefined, history: [], future: [], consoleEntries: [], lastError: undefined, zonePicking: undefined, unlockedPages: [],
    });
  });

  it("offers only what the open page declares", () => {
    expect(useEditorStore.getState().activeAffordances().map((item) => item.id)).toEqual(["machine-zones"]);
    useEditorStore.setState({ activePageId: "assente" });
    expect(useEditorStore.getState().activeAffordances()).toEqual([]);
  });

  it("shows the zones of this page only, and the parts that can still get one", async () => {
    const affordance = affordanceOf();
    const items = await useEditorStore.getState().readAffordanceItems(affordance);
    expect(items.map((item) => item.id)).toEqual(["machine-view-unscramblers-conveyor"]);
    expect(await useEditorStore.getState().readAffordanceReference(affordance, "parts"))
      .toEqual([{ id: "unscramblers-conveyor", label: "Unscramblers Conveyor" }, { id: "cans-filled-conveyor-2", label: "Cans Filled Conveyor #2" }]);
  });

  it("writes a new zone without touching the zone of the other page", async () => {
    const affordance = affordanceOf();
    await useEditorStore.getState().addAffordanceItem(affordance, {
      id: "machine-view-cans-filled-conveyor-2", pageId: "machine-view", style: "line",
      partId: "cans-filled-conveyor-2", label: "Cans Filled Conveyor #2", hotspot: { x: 960, y: 544 },
    });

    const written = bridge.writeFile.mock.calls.at(-1)![1] as string;
    const zones = readDataList(written, "machineZones")!.items;
    expect(zones.map((zone) => zone.id)).toEqual([
      "manual-general-unscramblers-area",
      "machine-view-unscramblers-conveyor",
      "machine-view-cans-filled-conveyor-2",
    ]);
    expect(zones.at(-1)).toMatchObject({ partId: "cans-filled-conveyor-2", hotspot: { x: 960, y: 544 } });
    expect(useEditorStore.getState().lastError).toBeUndefined();
  });

  it("moves the button where the user pointed on the picture", async () => {
    const affordance = affordanceOf();
    const store = useEditorStore.getState();
    store.beginZonePicking(affordance.id, "machine-view-unscramblers-conveyor", "hotspot", "point");
    expect(useEditorStore.getState().zonePicking?.mode).toBe("point");

    await useEditorStore.getState().addPickedPoint(412.6, 288.2);

    expect(useEditorStore.getState().zonePicking).toBeUndefined();
    const written = bridge.writeFile.mock.calls.at(-1)![1] as string;
    expect(readDataList(written, "machineZones")!.items.find((zone) => zone.pageId === "machine-view")?.hotspot).toEqual({ x: 413, y: 288 });
  });

  it("draws an outline from the corners that were clicked", async () => {
    const affordance = affordanceOf();
    useEditorStore.getState().beginZonePicking(affordance.id, "machine-view-unscramblers-conveyor", "outline", "path");
    await useEditorStore.getState().addPickedPoint(10, 20);
    await useEditorStore.getState().addPickedPoint(30, 40);
    await useEditorStore.getState().addPickedPoint(50, 60);
    expect(useEditorStore.getState().zonePicking?.points).toHaveLength(3);

    await useEditorStore.getState().finishZonePicking();

    const written = bridge.writeFile.mock.calls.at(-1)![1] as string;
    expect(readDataList(written, "machineZones")!.items[1].outline).toBe("M10 20 L30 40 L50 60");
    expect(useEditorStore.getState().zonePicking).toBeUndefined();
  });

  it("refuses a free edit on a guided page, and says where the change is made instead", async () => {
    const page = "export default function View(){ return <main><h1>Machine View</h1></main>; }";
    const document = parseSource("C:/panel/src/MachineView.jsx", page);
    const heading = Object.values(document.nodes).find((node) => node.type === "h1")!;
    useEditorStore.setState({ document, selectedId: heading.id, lastError: undefined });
    expect(useEditorStore.getState().guidedPage()?.id).toBe("machine-view");

    await useEditorStore.getState().updateText("Altro titolo");

    expect(useEditorStore.getState().lastError).toContain("pagina guidata");
    expect(useEditorStore.getState().lastError).toContain("Questa pagina");
    expect(bridge.writeFile).not.toHaveBeenCalled();

    // Quello che la pagina dichiara passa lo stesso: il divieto vale per tutto il resto.
    await useEditorStore.getState().updateAffordanceItem(affordanceOf(), "machine-view-unscramblers-conveyor", "label", "Nuovo nome");
    expect(bridge.writeFile).toHaveBeenCalled();
  });

  it("lets the page be opened up on purpose, and then everything is allowed again", async () => {
    const page = "export default function View(){ return <main><h1>Machine View</h1></main>; }";
    const document = parseSource("C:/panel/src/MachineView.jsx", page);
    const heading = Object.values(document.nodes).find((node) => node.type === "h1")!;
    useEditorStore.setState({ document, selectedId: heading.id, lastError: undefined });

    useEditorStore.getState().unlockPage();

    expect(useEditorStore.getState().guidedPage()).toBeUndefined();
    await useEditorStore.getState().updateText("Altro titolo");
    expect(useEditorStore.getState().lastError).toBeUndefined();
  });

  it("takes a zone off the page and leaves the other one there", async () => {
    const affordance = affordanceOf();
    await useEditorStore.getState().removeAffordanceItem(affordance, "machine-view-unscramblers-conveyor");
    const written = bridge.writeFile.mock.calls.at(-1)![1] as string;
    expect(readDataList(written, "machineZones")!.items.map((zone) => zone.id)).toEqual(["manual-general-unscramblers-area"]);
  });
});
