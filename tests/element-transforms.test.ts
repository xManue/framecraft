// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementTransformStyles, rotationDegrees } from "../src/canvas/elementTransforms";
import { Inspector } from "../src/inspector/Inspector";
import { parseSource } from "../src/source-parser/parseSource";

const desktop = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: desktop }));
import { useEditorStore } from "../src/state/editorStore";

describe("rotation values and effective stacking", () => {
  it.each([
    [undefined, 0], ["none", 0], [0, 0], ["-45deg", -45], ["0.25turn", 90],
    ["100grad", 90], [Math.PI + "rad", 180], ["z 30deg", 30], ["0 0 1 -30deg", -30],
    ["x 30deg", undefined], ["1 0 0 30deg", undefined], ["45", undefined], ["NaNdeg", undefined],
  ])("reads %s in degrees without silently converting a 3D axis", (written, expected) => {
    expect(rotationDegrees(written)).toBe(expected);
  });
  it("makes a numeric layer effective without switching the element to absolute positioning", () => {
    expect(elementTransformStyles({ zIndex: 7 }, { position: "static" })).toEqual({ zIndex: 7, position: "relative" });
    expect(elementTransformStyles({ zIndex: -2 }, { position: "absolute" })).toEqual({ zIndex: -2 });
    expect(elementTransformStyles({ zIndex: "auto" }, { position: "static" })).toEqual({ zIndex: "auto" });
    expect(elementTransformStyles({ zIndex: 9, position: "fixed" }, { position: "static" })).toEqual({ zIndex: 9, position: "fixed" });
  });
  it("allows inline labels to transform without overwriting existing transforms", () => {
    expect(elementTransformStyles({ rotate: "45deg" }, { display: "inline", transform: "skewX(10deg)" })).toEqual({ rotate: "45deg", display: "inline-block" });
    expect(elementTransformStyles({ translate: "30px 10px" }, { display: "inline" })).toEqual({ translate: "30px 10px", display: "inline-block" });
    expect(elementTransformStyles({ color: "red" }, { display: "inline" })).toEqual({ color: "red" });
  });
});

describe("element layer and rotation controls", () => {
  const initial = useEditorStore.getState();
  let root: Root;
  let host: HTMLDivElement;
  const file = "C:/panel/Page.tsx";
  const original = 'export function Page(){return <button style={{ translate: "8px 4px", scale: "1.2", transform: "skewX(10deg)" }}>Avvia</button>}';

  beforeEach(async () => {
    vi.clearAllMocks();
    desktop.writeFile.mockResolvedValue(undefined);
    desktop.readFile.mockResolvedValue(original);
    const parsed = parseSource(file, original);
    useEditorStore.setState({ ...initial, project: { root: "C:/panel", files: [] } as never, document: parsed,
      selectedId: Object.values(parsed.nodes)[0].id, selectionStyles: { display: "inline", position: "static", rotate: "none", zIndex: "auto" },
      selectionInfo: undefined, selectionRect: { x: 10, y: 20, width: 120, height: 40 }, multiSelection: [], history: [], future: [],
      panelManifest: undefined, dirty: false, interactionMode: "edit" });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn();
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root.render(createElement(Inspector)));
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); useEditorStore.setState(initial, true); vi.restoreAllMocks(); });
  const source = () => useEditorStore.getState().document?.source ?? "";
  const input = (label: string) => host.querySelector<HTMLInputElement>('input[aria-label="' + label + '"]')!;
  const click = async (label: string) => {
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="' + label + '"]')!;
    expect(button.disabled).toBe(false);
    await act(async () => { button.click(); });
  };
  const change = async (label: string, value: string) => {
    const field = input(label);
    await act(async () => {
      field.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const flush = async (check: () => void) => { await act(async () => { await vi.waitFor(check); }); };

  it("shows accessible layer and degree inputs in a section that is already open", () => {
    const section = input("Z-index").closest(".inspector-section")!;
    expect(section.querySelector("button")!.getAttribute("aria-expanded")).toBe("true");
    expect(section.textContent).toContain("Livelli e rotazione");
    expect(input("Z-index").placeholder).toBe("Auto");
    expect(input("Rotazione").value).toBe("0");
    expect(input("Z-index").step).toBe("1");
    expect(input("Rotazione").step).toBe("any");
    expect(input("Rotazione").parentElement!.textContent).toContain("°");
    expect(useEditorStore.getState().history).toEqual([]);
  });
  it("writes a stacking level, retains existing transforms and supports undo/redo", async () => {
    await change("Z-index", "7"); await act(async () => input("Z-index").blur());
    await flush(() => expect(source()).toContain("zIndex: 7"));
    expect(source()).toContain('position: "relative"');
    expect(source()).toContain('transform: "skewX(10deg)"');
    expect(useEditorStore.getState().history).toHaveLength(1);
    await act(async () => { await useEditorStore.getState().undo(); });
    expect(source()).toBe(original);
    await act(async () => { await useEditorStore.getState().redo(); });
    expect(source()).toContain("zIndex: 7");
    expect(desktop.writeFile).toHaveBeenCalled();
  });
  it("rotates with the preset and then an exact degree input without losing translate or scale", async () => {
    await click("Ruota di 90 gradi a destra");
    await flush(() => expect(source()).toContain('rotate: "90deg"'));
    expect(source()).toContain('display: "inline-block"');
    await change("Rotazione", "-35.5"); await act(async () => input("Rotazione").blur());
    await flush(() => expect(source()).toContain('rotate: "-35.5deg"'));
    expect(source()).toContain('translate: "8px 4px"'); expect(source()).toContain('scale: "1.2"');
    expect(source()).toContain('transform: "skewX(10deg)"');
    expect(useEditorStore.getState().history).toHaveLength(2);
    await click("Azzera rotazione"); await flush(() => expect(source()).toContain('rotate: "0deg"'));
  });
  it("cancels an angle draft with Escape and rejects fractional stacking levels", async () => {
    await change("Rotazione", "45");
    await act(async () => input("Rotazione").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(input("Rotazione").value).toBe("0");
    await change("Z-index", "1.5"); await act(async () => input("Z-index").blur());
    expect(source()).toBe(original); expect(useEditorStore.getState().history).toEqual([]);
    expect(desktop.writeFile).not.toHaveBeenCalled();
  });
  it("keeps non-planar rotations untouched and points to the CSS control", async () => {
    await act(async () => useEditorStore.setState({ selectionStyles: { rotate: "x 30deg" } }));
    expect(input("Rotazione").disabled).toBe(true);
    expect(host.textContent).toContain("La rotazione 3D si modifica nel campo Rotazione CSS");
    expect(source()).toBe(original);
  });
  it("applies layers and rotation to a mixed group without changing absolute positioning", async () => {
    const groupSource = 'export const Page = () => <main><button style={{ position: "absolute", zIndex: 1 }}>Avvia</button><span style={{ rotate: "30deg" }}>M2400</span></main>;';
    const parsed = parseSource(file, groupSource);
    const nodes = Object.values(parsed.nodes).filter((node) => node.type !== "main");
    const items = nodes.map((node, index) => ({ source: node.source, instanceId: "fc-" + index,
      rect: { x: index * 120, y: 20, width: 100, height: 40 }, translate: { x: 0, y: 0 },
      styles: { position: index ? "static" : "absolute", display: index ? "inline" : "block", zIndex: index ? "auto" : "1", rotate: index ? "30deg" : "none" } }));
    await act(async () => useEditorStore.setState({ document: parsed, selectedId: nodes[0].id, multiSelection: items, history: [], future: [], dirty: false }));
    expect(input("Z-index").placeholder).toBe("Valori diversi");
    expect(input("Rotazione").value).toBe("");
    await change("Z-index", "5"); await act(async () => input("Z-index").blur());
    await flush(() => expect(useEditorStore.getState().multiSelection.every((item) => item.styles?.zIndex === "5")).toBe(true));
    const afterLayer = source();
    const layerNodes = Object.values(useEditorStore.getState().document!.nodes);
    expect(layerNodes.find((node) => node.type === "button")!.styles).toMatchObject({ position: "absolute", zIndex: 5 });
    expect(layerNodes.find((node) => node.type === "span")!.styles).toMatchObject({ position: "relative", zIndex: 5 });
    expect(useEditorStore.getState().history).toHaveLength(1);
    await change("Rotazione", "22.5"); await act(async () => input("Rotazione").blur());
    await flush(() => expect(useEditorStore.getState().multiSelection.every((item) => item.styles?.rotate === "22.5deg")).toBe(true));
    expect(source().match(/rotate: "22.5deg"/g)).toHaveLength(2);
    expect(Object.values(useEditorStore.getState().document!.nodes).find((node) => node.type === "span")!.styles.display).toBe("inline-block");
    expect(useEditorStore.getState().history).toHaveLength(2);
    await act(async () => { await useEditorStore.getState().undo(); });
    expect(source()).toBe(afterLayer);
  });
  it("keeps both selected instances of the same JSX node editable across consecutive group commands", async () => {
    const repeated = 'export const Page = ({ names }) => <main>{names.map((name) => <button>{name}</button>)}</main>;';
    const parsed = parseSource(file, repeated);
    const node = Object.values(parsed.nodes).find((node) => node.type === "button")!;
    const items = [0, 1].map((index) => ({ source: node.source, instanceId: "fc-" + index,
      info: { instanceIndex: index, instanceCount: 2, listIndex: index },
      rect: { x: index * 120, y: 20, width: 100, height: 40 }, translate: { x: 0, y: 0 },
      styles: { position: "static", display: "inline-block", zIndex: "auto", rotate: "none" } }));
    await act(async () => useEditorStore.setState({ document: parsed, selectedId: node.id, multiSelection: items, history: [], future: [], dirty: false }));
    await act(async () => { await useEditorStore.getState().updateMultiSelectionStyles({ zIndex: 6 }); });
    expect(source()).toContain("__framecraftIndex === 0"); expect(source()).toContain("__framecraftIndex === 1");
    const selected = Object.values(useEditorStore.getState().document!.nodes).find((node) => node.type === "button")!;
    expect(useEditorStore.getState().multiSelection.every((item) => item.source.end === selected.source.end)).toBe(true);
    await act(async () => { await useEditorStore.getState().updateMultiSelectionStyles({ rotate: "15deg" }); });
    expect(useEditorStore.getState().multiSelection.every((item) => item.styles?.rotate === "15deg")).toBe(true);
    expect(source().match(/rotate: "15deg"/g)).toHaveLength(2);
    expect(useEditorStore.getState().history).toHaveLength(2);
  });
});
