// @vitest-environment jsdom
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "../src/canvas/Canvas";
import type { SourceRef } from "../src/core/types";
import { parseSource } from "../src/source-parser/parseSource";
import { useEditorStore } from "../src/state/editorStore";
// @ts-expect-error the preview plugin is intentionally shipped as plain ESM.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

const desktop = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: desktop }));

const label = parseSource("C:/panel/src/Label.tsx", "export default function Label(){ return <span>Targhetta</span>; }");
const button = parseSource("C:/panel/src/Button.tsx", "export default function Button(){ return <button>Pulsante</button>; }");
const labelNode = Object.values(label.nodes)[0];
const buttonNode = Object.values(button.nodes)[0];
const initialStore = useEditorStore.getState();
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: { url: string; runScripts: string; pretendToBeVisual: boolean }) => {
    window: Window & typeof globalThis & { close(): void };
  };
};
let host: HTMLDivElement;
let root: Root;
let preview: InstanceType<typeof JSDOM> | undefined;
let unsubscribe: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  desktop.writeFile.mockResolvedValue(undefined);
  desktop.readFile.mockImplementation((file: string) => new Promise<string>((resolve, reject) => {
    const source = file === label.file ? label.source : file === button.file ? button.source : undefined;
    window.setTimeout(() => source ? resolve(source) : reject(new Error(`Unexpected file: ${file}`)), file === label.file ? 120 : 35);
  }));
  useEditorStore.setState({ ...initialStore, project: { root: "C:/panel", files: [] } as never,
    document: undefined, selectedId: undefined,
    selectionInfo: undefined, selectionStyles: {}, selectionRect: undefined, unresolvedSelection: undefined,
    listBinding: undefined, highlightPicker: undefined, zonePicking: undefined, multiSelection: [],
    previewUrl: "http://127.0.0.1:4173", previewPath: "/", previewStatus: "ready", previewError: undefined,
    interactionMode: "edit", loading: false, dirty: false, history: [], future: [], consoleEntries: [],
    panelManifest: undefined, pages: [], activePageId: undefined, requestedStatePage: undefined,
    simulation: { on: false, values: {}, status: {}, elements: [], unresolved: [] } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  unsubscribe?.(); unsubscribe = undefined;
  await act(async () => root.unmount());
  preview?.window.close(); preview = undefined;
  host.remove();
  useEditorStore.setState(initialStore, true);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount() {
  await act(async () => root.render(createElement(Canvas)));
  const iframe = host.querySelector("iframe")!;
  expect(iframe).not.toBeNull();
  return iframe;
}

async function tick(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

function deliver(frame: Window, data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent("message", { data, source: frame }));
}

function selection(source: SourceRef, instanceId: string, version: number, index = 0, x = 20) {
  return { type: "framecraft:select", source, instanceId, selectionVersion: version,
    rect: { x, y: 40, width: 120, height: 44 }, styles: { color: index ? "blue" : "red" },
    info: { text: index ? "Seconda copia" : "Prima copia", instanceIndex: index, instanceCount: 2, listIndex: index } };
}

describe("canvas selection protocol races", () => {
  it("aggiorna le proprietà live senza rivalutare in ciclo uno script che modifica la geometria", async () => {
    useEditorStore.setState({ interactionMode: "navigate", simulation: { on: true, values: {}, status: {}, elements: [], unresolved: [] } });
    const iframe = await mount();
    preview = new JSDOM('<!doctype html><html><body><main data-hmi-screen="Main"><span data-hmi-name="M2400" style="width:80px;font-size:16px">Motore</span></main></body></html>', { url: "http://127.0.0.1:4173/", runScripts: "outside-only", pretendToBeVisual: true });
    const frame = preview.window, replies: Record<string, unknown>[] = [], commands: Record<string, unknown>[] = [];
    Object.defineProperty(iframe, "contentWindow", { configurable: true, value: frame });
    Object.assign(frame, { ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, requestAnimationFrame: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16), cancelAnimationFrame: (id: number) => window.clearTimeout(id) });
    Object.defineProperty(frame, "parent", { configurable: true, value: { postMessage: (data: Record<string, unknown>) => { replies.push(data); deliver(frame, data); } } });
    frame.postMessage = ((data: Record<string, unknown>) => { commands.push(data); frame.dispatchEvent(new frame.MessageEvent("message", { data, source: window })); }) as typeof frame.postMessage;
    const motor = frame.document.querySelector<HTMLElement>('[data-hmi-name="M2400"]')!;
    motor.setAttribute("data-hmi-dynamizations", JSON.stringify([{ property: "ForeColor", kind: "Script", source: 'item.Width = item.Width + 1; item.Font.Size = item.Font.Size + 0.5; return "#008000";' }]));
    await act(async () => frame.eval(framecraftPlugin().transformIndexHtml("<div></div>").tags[0].children)); await tick(64);
    const width = motor.style.width, configurationCount = replies.filter((reply) => reply.type === "framecraft:dynamizations").length;
    const propertyCount = commands.filter((command) => command.type === "framecraft:screen-properties").length;
    const fontSize = motor.style.fontSize;
    expect(Number.parseInt(width)).toBeGreaterThan(80);
    expect(Number.parseFloat(fontSize)).toBeGreaterThan(16);
    await act(async () => { motor.style.backgroundColor = "rgb(1, 2, 3)"; }); await tick(64);
    expect(motor.style.width).toBe(width);
    expect(motor.style.fontSize).toBe(fontSize);
    expect(replies.filter((reply) => reply.type === "framecraft:dynamizations")).toHaveLength(configurationCount);
    expect(commands.filter((command) => command.type === "framecraft:screen-properties")).toHaveLength(propertyCount);
    const latest = replies.filter((reply) => reply.type === "framecraft:screen-items").at(-1);
    expect(latest?.screenItems).toEqual(expect.arrayContaining([expect.objectContaining({ name: "M2400", properties: expect.objectContaining({ BackColor: 0xff010203, "Font.Size": Number.parseFloat(fontSize) }) })]));
    expect(desktop.writeFile).not.toHaveBeenCalled();
  });

  it("legge e scrive proprietà attraverso Canvas e ponte reali, compone le dinamiche e ripristina la grafica", async () => {
    useEditorStore.setState({ interactionMode: "navigate" });
    const iframe = await mount();
    preview = new JSDOM('<!doctype html><html><body><main data-hmi-screen="Main"><button data-hmi-name="M2400" style="width:80px;background-color:rgb(12,34,56)"><span data-hmi-text="Motor.Label" style="font-size:16px;font-family:Arial;font-weight:400;font-style:normal">Motore</span><svg /></button><button data-hmi-name="Start">Configura</button></main></body></html>', { url: "http://127.0.0.1:4173/", runScripts: "outside-only", pretendToBeVisual: true });
    const frame = preview.window;
    Object.defineProperty(iframe, "contentWindow", { configurable: true, value: frame });
    Object.assign(frame, { ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
    Object.defineProperty(frame, "parent", { configurable: true, value: { postMessage: (data: Record<string, unknown>) => deliver(frame, data) } });
    const commands: Record<string, unknown>[] = [];
    frame.postMessage = ((data: Record<string, unknown>) => { commands.push(data); frame.dispatchEvent(new frame.MessageEvent("message", { data, source: window })); }) as typeof frame.postMessage;
    const motor = frame.document.querySelector<HTMLButtonElement>('[data-hmi-name="M2400"]')!;
    const start = frame.document.querySelector<HTMLButtonElement>('[data-hmi-name="Start"]')!;
    const icon = motor.querySelector("svg");
    motor.setAttribute("data-hmi-events", JSON.stringify([{ event: "Tapped", script: 'Tags("Command").Write(1);' }, { event: "KeyDown", script: 'Tags("Command").Write(1);' }]));
    motor.setAttribute("data-hmi-dynamizations", JSON.stringify([{ property: "BackColor", kind: "Script", source: 'return "#0000ff";' }]));
    start.setAttribute("data-hmi-events", JSON.stringify([{ event: "Tapped", script: 'const motor = Screen.Items("M2400"); motor.Text = "Pronto"; motor.Width = motor.Width + 10; motor.BackColor = HMIRuntime.Math.RGB(0,128,0); motor.Font.Size = 18.5; motor.Font.Weight = 700; motor.Font.Italic = true; motor.Font.Underline = true; motor.Font.StrikeOut = 1; motor.Enabled = false; HMIRuntime.Trace(motor.Name + ":" + motor.Width + ":" + motor.Text);' }]));
    await act(async () => frame.eval(framecraftPlugin().transformIndexHtml("<div></div>").tags[0].children));
    await act(async () => start.click()); await tick(0);
    expect(motor.textContent).toBe("Pronto"); expect(motor.querySelector("svg")).toBe(icon);
    expect(motor.style.width).toBe("90px"); expect(motor.style.backgroundColor).toBe("rgb(0, 128, 0)");
    const label = motor.querySelector<HTMLElement>("span")!;
    expect(label.style.fontSize).toBe("18.5px"); expect(label.style.fontWeight).toBe("700"); expect(label.style.fontStyle).toBe("italic");
    expect(label.style.textDecorationLine).toBe("underline line-through");
    expect(motor.disabled).toBe(true); expect(useEditorStore.getState().simulation.on).toBe(false);
    expect(commands.some((command) => command.type === "framecraft:screen-properties")).toBe(true);
    expect(useEditorStore.getState().consoleEntries.some((entry) => entry.message.includes("M2400:90:Pronto"))).toBe(true);
    await act(async () => frame.postMessage({ type: "framecraft:set-language", translations: { "Motor.Label": "Motor" } }, "*"));
    expect(motor.textContent).toBe("Pronto"); expect(motor.querySelector("svg")).toBe(icon);
    await act(async () => {
      motor.dispatchEvent(new frame.MouseEvent("click", { bubbles: true }));
      motor.dispatchEvent(new frame.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }); await tick(0);
    expect(useEditorStore.getState().simulation.values).toEqual({});
    await act(async () => useEditorStore.getState().setSimulationOn(true)); await tick(0);
    expect(motor.style.backgroundColor).toBe("rgb(0, 128, 0)"); expect(motor.textContent).toBe("Pronto");
    expect(label.style.fontSize).toBe("18.5px");
    await act(async () => useEditorStore.getState().setInteractionMode("edit")); await tick(0);
    expect(motor.textContent).toBe("Motor"); expect(motor.querySelector("svg")).toBe(icon);
    expect(motor.style.width).toBe("80px"); expect(motor.style.backgroundColor).toBe("rgb(0, 0, 255)"); expect(motor.disabled).toBe(false);
    expect(label.style.fontSize).toBe("16px"); expect(label.style.fontWeight).toBe("400"); expect(label.style.fontStyle).toBe("normal");
    expect(label.style.textDecorationLine).toBe("");
    await act(async () => useEditorStore.getState().setSimulationOn(false)); await tick(0);
    expect(motor.style.backgroundColor).toBe("rgb(12, 34, 56)");
    expect(useEditorStore.getState().consoleEntries.filter((entry) => entry.level === "error")).toEqual([]);
    expect(desktop.writeFile).not.toHaveBeenCalled(); expect(useEditorStore.getState().dirty).toBe(false);
  });

  it("esegue PropertyFlashing tramite il ponte reale anche senza simulazione tag accesa", async () => {
    useEditorStore.setState({ interactionMode: "navigate" });
    const iframe = await mount();
    preview = new JSDOM('<!doctype html><html><body><main data-hmi-screen="Main"><span data-hmi-name="M2400" style="background-color:rgb(12,34,56)">Motore</span><button data-hmi-name="Start">Lampeggia</button><button data-hmi-name="Stop">Ferma</button></main></body></html>', { url: "http://127.0.0.1:4173/", runScripts: "outside-only", pretendToBeVisual: true });
    const frame = preview.window;
    Object.defineProperty(iframe, "contentWindow", { configurable: true, value: frame });
    Object.assign(frame, { ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
    Object.defineProperty(frame, "parent", { configurable: true, value: { postMessage: (data: Record<string, unknown>) => deliver(frame, data) } });
    const commands: Record<string, unknown>[] = [];
    frame.postMessage = ((data: Record<string, unknown>) => { commands.push(data); frame.dispatchEvent(new frame.MessageEvent("message", { data, source: window })); }) as typeof frame.postMessage;
    const start = frame.document.querySelector<HTMLButtonElement>('[data-hmi-name="Start"]')!;
    const stop = frame.document.querySelector<HTMLButtonElement>('[data-hmi-name="Stop"]')!;
    start.setAttribute("data-hmi-events", JSON.stringify([{ event: "Tapped", script: 'Screen.Items("M2400").PropertyFlashing("BackColor", true, HMIRuntime.Math.RGB(255,0,0), HMIRuntime.Math.RGB(0,0,0), UI.Enums.HmiFlashingRate.Fast);' }]));
    stop.setAttribute("data-hmi-events", JSON.stringify([{ event: "Tapped", script: 'Screen.Items("M2400").PropertyFlashing("BackColor", false);' }]));
    await act(async () => frame.eval(framecraftPlugin().transformIndexHtml("<div></div>").tags[0].children));
    await act(async () => start.click());
    await tick(0);
    const lamp = frame.document.querySelector<HTMLElement>('[data-hmi-name="M2400"]')!;
    expect(lamp.style.animation).toContain("framecraft-hmi-flash-background 500ms");
    expect(lamp.style.backgroundColor).toBe("rgb(12, 34, 56)");
    expect(useEditorStore.getState().simulation.on).toBe(false);
    expect(commands.some((command) => command.type === "framecraft:property-flashing")).toBe(true);
    await act(async () => stop.click());
    await tick(0);
    expect(lamp.style.animation).toBe("");
    expect(lamp.style.backgroundColor).toBe("rgb(12, 34, 56)");
    expect(useEditorStore.getState().consoleEntries.filter((entry) => entry.level === "error")).toEqual([]);
    expect(desktop.writeFile).not.toHaveBeenCalled();
  });

  it("risolve gli oggetti di un faceplate aggiunto dopo ready senza coinvolgere le altre istanze", async () => {
    useEditorStore.setState({ interactionMode: "navigate", faceplateCatalog: { version: 1, types: [{
      id: "motor", name: "Motor", version: "1.0.0", status: "released", width: 80, height: 80,
      interfaceTags: [], interfaceProperties: [], interfaceEvents: [{ name: "Alarm", parameters: [] }],
      localTags: [], visualization: [], nestedInstances: [],
    }] } });
    const iframe = await mount();
    preview = new JSDOM('<!doctype html><html><body><main data-hmi-screen="Main"></main></body></html>', { url: "http://127.0.0.1:4173/", runScripts: "outside-only", pretendToBeVisual: true });
    const frame = preview.window;
    Object.defineProperty(iframe, "contentWindow", { configurable: true, value: frame });
    Object.assign(frame, { ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
    Object.defineProperty(frame, "parent", { configurable: true, value: { postMessage: (data: Record<string, unknown>) => deliver(frame, data) } });
    frame.postMessage = ((data: Record<string, unknown>) => frame.dispatchEvent(new frame.MessageEvent("message", { data, source: window }))) as typeof frame.postMessage;
    await act(async () => frame.eval(framecraftPlugin().transformIndexHtml("<div></div>").tags[0].children));
    const makeMotor = (name: string) => {
      const motor = frame.document.createElement("section"); motor.dataset.hmiName = name;
      motor.setAttribute("data-hmi-faceplate", JSON.stringify({ typeId: "motor", version: "1.0.0", tagBindings: {}, propertyValues: {}, eventBindings: {
        Alarm: { script: 'Faceplate.Items("Lamp").PropertyFlashing("ForeColor", true, HMIRuntime.Math.RGB(255,0,0), HMIRuntime.Math.RGB(0,0,0));' },
      } }));
      const lamp = frame.document.createElement("span"); lamp.dataset.hmiName = "Lamp"; lamp.style.color = "rgb(12, 34, 56)";
      motor.append(lamp); frame.document.querySelector("main")!.append(motor);
      return { motor, lamp };
    };
    const first = makeMotor("M2400"); const second = makeMotor("M2401");
    await act(async () => first.motor.dispatchEvent(new frame.CustomEvent("framecraft:faceplate-event", { bubbles: true, detail: { name: "Alarm" } })));
    await tick(0);
    expect(first.lamp.style.animation).toContain("framecraft-hmi-flash-foreground 1000ms");
    expect(first.lamp.style.color).toBe("rgb(12, 34, 56)");
    expect(second.lamp.style.animation).toBe("");
    expect(useEditorStore.getState().consoleEntries.filter((entry) => entry.level === "error")).toEqual([]);
    expect(desktop.writeFile).not.toHaveBeenCalled();
  });

  it("keeps the last button selected after two real bridge clicks and delayed filesystem/replies", async () => {
    const iframe = await mount();
    preview = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://127.0.0.1:4173/", runScripts: "outside-only", pretendToBeVisual: true,
    });
    const frame = preview.window;
    Object.defineProperty(iframe, "contentWindow", { configurable: true, value: frame });
    Object.defineProperty(iframe, "contentDocument", { configurable: true, value: frame.document });
    Object.assign(frame, { ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
      requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
    const replies: Record<string, unknown>[] = [];
    const requests: Record<string, unknown>[] = [];
    const states: string[] = [];
    unsubscribe = useEditorStore.subscribe((state) => {
      const current = state.selectedId ? state.document?.nodes[state.selectedId]?.source.file : undefined;
      if (current && current !== states.at(-1)) states.push(current);
    });
    Object.defineProperty(frame, "parent", { configurable: true, value: {
      postMessage(data: Record<string, unknown>) {
        replies.push(data);
        // Browser deliveries are FIFO; only automatic confirmations are delayed.
        if (data.type === "framecraft:selection-response") window.setTimeout(() => deliver(frame, data), 70);
        else deliver(frame, data);
      },
    } });
    frame.postMessage = ((data: Record<string, unknown>) => {
      requests.push(data);
      frame.dispatchEvent(new frame.MessageEvent("message", { data, source: window }));
    }) as typeof frame.postMessage;
    const target = (tag: string, source: SourceRef, text: string, x: number) => {
      const element = frame.document.createElement(tag);
      element.setAttribute("data-fc-source", JSON.stringify(source));
      element.textContent = text;
      element.getBoundingClientRect = () => ({ x, y: 40, left: x, top: 40, right: x + 120,
        bottom: 84, width: 120, height: 44, toJSON: () => ({}) });
      frame.document.body.append(element);
      return element;
    };
    const labelElement = target("span", labelNode.source, "Targhetta", 20);
    const buttonElement = target("button", buttonNode.source, "Pulsante", 220);
    await act(async () => frame.eval(framecraftPlugin().transformIndexHtml("<div></div>").tags[0].children));
    expect(replies.find((message) => message.type === "framecraft:ready")).toMatchObject({ selectionProtocol: 2 });
    await act(async () => labelElement.dispatchEvent(new frame.MouseEvent("click", { bubbles: true, cancelable: true })));
    await tick(10);
    await act(async () => buttonElement.dispatchEvent(new frame.MouseEvent("click", { bubbles: true, cancelable: true })));
    await tick(150);
    await tick(1000);
    const current = useEditorStore.getState();
    expect(current.document?.file).toBe(button.file);
    expect(current.selectedId).toBe(buttonNode.id);
    expect(current.selectionInfo?.text).toBe("Pulsante");
    expect(states).toEqual([button.file]);
    expect(replies.filter((message) => message.type === "framecraft:select")).toHaveLength(2);
    expect(replies.filter((message) => message.type === "framecraft:selection-response")).toHaveLength(1);
    expect(requests.filter((message) => message.type === "framecraft:request-selection")).toHaveLength(1);
    expect(host.querySelector<HTMLDivElement>(".selection-box")?.style.left).toBe("220px");
    const count = replies.length;
    await tick(3000);
    expect(replies).toHaveLength(count);
    expect(desktop.writeFile).not.toHaveBeenCalled();
  });

  it("ignores an old acknowledgement for the first copy after clicking another copy of the same JSX", async () => {
    useEditorStore.setState({ document: button });
    const iframe = await mount();
    const frame = iframe.contentWindow!;
    const requests: Record<string, unknown>[] = [];
    vi.spyOn(frame, "postMessage").mockImplementation((data: Record<string, unknown>) => { requests.push(data); });
    await act(async () => deliver(frame, { type: "framecraft:ready", path: "/", selectionProtocol: 2, selectionVersion: 0 }));
    await act(async () => deliver(frame, selection(buttonNode.source, "copy-0", 1)));
    const request = requests.find((message) => message.type === "framecraft:request-selection")!;
    expect(request).toBeDefined();
    await act(async () => deliver(frame, selection(buttonNode.source, "copy-1", 2, 1, 250)));
    await act(async () => deliver(frame, { ...selection(buttonNode.source, "copy-0", 1),
      type: "framecraft:selection-response", requestId: request.requestId }));
    expect(useEditorStore.getState().selectionInfo).toMatchObject({ instanceIndex: 1, listIndex: 1, text: "Seconda copia" });
    expect(host.querySelector<HTMLDivElement>(".selection-box")?.style.left).toBe("250px");
    expect(useEditorStore.getState().selectionStyles.color).toBe("blue");
    await tick(1000);
    expect(useEditorStore.getState().selectionInfo?.instanceIndex).toBe(1);
  });

  it("accepts only the latest retry acknowledgement, even when source and click version match", async () => {
    useEditorStore.setState({ document: button });
    const iframe = await mount();
    const frame = iframe.contentWindow!;
    const requests: Record<string, unknown>[] = [];
    vi.spyOn(frame, "postMessage").mockImplementation((data: Record<string, unknown>) => { requests.push(data); });
    await act(async () => deliver(frame, { type: "framecraft:ready", path: "/", selectionProtocol: 2, selectionVersion: 0 }));
    await act(async () => deliver(frame, selection(buttonNode.source, "copy-0", 1)));
    await tick(80);
    const attempts = requests.filter((message) => message.type === "framecraft:request-selection");
    expect(attempts).toHaveLength(2);
    await act(async () => deliver(frame, { ...selection(buttonNode.source, "copy-1", 1, 1, 250),
      type: "framecraft:selection-response", requestId: attempts[0].requestId }));
    expect(useEditorStore.getState().selectionInfo?.instanceIndex).toBe(0);
    expect(host.querySelector<HTMLDivElement>(".selection-box")?.style.left).toBe("20px");
    await act(async () => deliver(frame, { ...selection(buttonNode.source, "copy-0", 1),
      type: "framecraft:selection-response", requestId: attempts[1].requestId }));
    await tick(1000);
    expect(requests.filter((message) => message.type === "framecraft:request-selection")).toHaveLength(2);
    expect(useEditorStore.getState().selectionInfo?.instanceIndex).toBe(0);
  });

  it.each(["framecraft:edit-text", "framecraft:delete"])("cancels %s when a new button click supersedes its file read", async (type) => {
    const updateText = vi.fn().mockResolvedValue(undefined);
    const deleteSelection = vi.fn().mockResolvedValue(undefined);
    useEditorStore.setState({ updateText, deleteSelection });
    const iframe = await mount();
    const frame = iframe.contentWindow!;
    await act(async () => deliver(frame, { type, source: labelNode.source, value: "Non applicare al pulsante",
      instanceId: "label", info: { text: "Targhetta", instanceIndex: 0 } }));
    await tick(10);
    await act(async () => deliver(frame, selection(buttonNode.source, "button", 1)));
    await tick(150);
    await tick(1000);
    expect(useEditorStore.getState().document?.file).toBe(button.file);
    expect(useEditorStore.getState().selectedId).toBe(buttonNode.id);
    expect(updateText).not.toHaveBeenCalled();
    expect(deleteSelection).not.toHaveBeenCalled();
    expect(desktop.writeFile).not.toHaveBeenCalled();
  });

  it.each([false, true])("ignores a delayed movement after another click (same JSX: %s)", async (sameJsx) => {
    const selectSource = vi.fn(initialStore.selectSource);
    const updateStyles = vi.fn().mockResolvedValue(undefined);
    const oldDocument = sameJsx ? button : label;
    const oldSource = sameJsx ? buttonNode.source : labelNode.source;
    useEditorStore.setState({ document: oldDocument, selectSource, updateStyles });
    const iframe = await mount();
    const frame = iframe.contentWindow!;
    await act(async () => deliver(frame, selection(oldSource, "old-instance", 1)));
    await act(async () => deliver(frame, selection(buttonNode.source, "new-instance", 2, 1, 250)));
    await tick(100);
    expect(useEditorStore.getState().selectedId).toBe(buttonNode.id);
    selectSource.mockClear();
    await act(async () => deliver(frame, { type: "framecraft:drag-end", source: oldSource,
      instanceId: "old-instance", selectionVersion: 1, rect: { x: 800, y: 40, width: 120, height: 44 }, translate: "780px 0px" }));
    await tick(500);
    expect(selectSource).not.toHaveBeenCalled();
    expect(updateStyles).not.toHaveBeenCalled();
    expect(useEditorStore.getState().selectedId).toBe(buttonNode.id);
    expect(useEditorStore.getState().selectionInfo?.instanceIndex).toBe(1);
    expect(host.querySelector<HTMLDivElement>(".selection-box")?.style.left).toBe("250px");
  });
});
