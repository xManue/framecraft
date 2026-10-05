// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { alignItems, type AlignItem } from "../src/canvas/alignment";
import { panelFormat, panelFormats } from "../src/canvas/panels";
import { normalizeContentHeight } from "../src/canvas/sizing";
import { parseSource } from "../src/source-parser/parseSource";
// The snapping maths is shipped to the previewed page as source text, so it lives in plain ESM.
// @ts-expect-error no declaration is required for the runtime helper.
import { equalGapOffset, gridOffset, snapOffset } from "../scripts/framecraft-snap.mjs";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { readFile: bridge.readFile, writeFile: bridge.writeFile },
}));
import { useEditorStore } from "../src/state/editorStore";

const item = (instanceId: string, x: number, y: number, width: number, height: number, translate = { x: 0, y: 0 }): AlignItem =>
  ({ instanceId, rect: { x, y, width, height }, translate });

describe("lining up a group of elements", () => {
  it("takes the leftmost edge as the line everything moves to", () => {
    const changes = alignItems([item("a", 100, 10, 60, 30), item("b", 140, 60, 60, 30)], "left");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ instanceId: "b", dx: -40, dy: 0, translate: "-40px 0px" });
  });

  it("adds the movement to the nudge the element already carries", () => {
    const changes = alignItems([item("a", 100, 10, 60, 30), item("b", 140, 60, 60, 30, { x: 12.5, y: -4 })], "left");
    expect(changes[0].translate).toBe("-27.5px -4px");
  });

  it("aligns right edges rather than left ones when asked to", () => {
    const changes = alignItems([item("a", 100, 10, 60, 30), item("b", 140, 60, 40, 30)], "right");
    // The group ends at 180 (b), so only a has to move, and by the difference of the two right edges.
    expect(changes).toEqual([expect.objectContaining({ instanceId: "a", dx: 20 })]);
  });

  it("centres on the middle of the whole group", () => {
    const changes = alignItems([item("a", 100, 0, 100, 30), item("b", 200, 0, 40, 30)], "center-x");
    expect(changes).toEqual([
      expect.objectContaining({ instanceId: "a", dx: 20 }),
      expect.objectContaining({ instanceId: "b", dx: -50 }),
    ]);
  });

  it("never moves an element on the axis it was not asked about", () => {
    for (const mode of ["left", "center-x", "right", "spread-x"] as const) {
      expect(alignItems([item("a", 0, 0, 40, 40), item("b", 90, 55, 40, 40), item("c", 200, 130, 40, 40)], mode)
        .every((change) => change.dy === 0)).toBe(true);
    }
    for (const mode of ["top", "center-y", "bottom", "spread-y"] as const) {
      expect(alignItems([item("a", 0, 0, 40, 40), item("b", 90, 55, 40, 40), item("c", 200, 130, 40, 40)], mode)
        .every((change) => change.dx === 0)).toBe(true);
    }
  });

  it("leaves equal gaps between the ends of the group", () => {
    // Three buttons of the same width between 0 and 300: the middle one belongs at 130.
    const changes = alignItems([item("a", 0, 0, 40, 30), item("b", 100, 0, 40, 30), item("c", 260, 0, 40, 30)], "spread-x");
    expect(changes).toEqual([expect.objectContaining({ instanceId: "b", dx: 30 })]);
  });

  it("has nothing to spread out with only two elements", () => {
    expect(alignItems([item("a", 0, 0, 40, 30), item("c", 260, 0, 40, 30)], "spread-x")).toEqual([]);
  });

  it("reports nothing when the elements already line up", () => {
    expect(alignItems([item("a", 100, 10, 60, 30), item("b", 100, 60, 20, 30)], "left")).toEqual([]);
    // And ignores a difference too small to be anything but a measurement.
    expect(alignItems([item("a", 100, 10, 60, 30), item("b", 100.2, 60, 20, 30)], "left")).toEqual([]);
  });

  it("refuses to work on a single element", () => {
    expect(alignItems([item("a", 100, 10, 60, 30)], "left")).toEqual([]);
  });
});

describe("the magnet that holds a drag to its neighbours", () => {
  it("pulls the nearest of the three positions an element offers", () => {
    // A box 40 wide starting at 98: its left edge is 2 from the column at 100.
    expect(snapOffset(98, 40, [100], 6)).toEqual({ distance: 2, at: 100 });
    // Its middle is what reaches a centre line, and its right edge what reaches a right edge.
    expect(snapOffset(98, 40, [120], 6)).toEqual({ distance: 2, at: 120 });
    expect(snapOffset(98, 40, [141], 6)).toEqual({ distance: 3, at: 141 });
  });

  it("chooses the alignment that needs the smallest correction", () => {
    expect(snapOffset(98, 40, [100, 96], 6)).toEqual({ distance: 2, at: 100 });
    expect(snapOffset(98, 40, [104, 100], 6)).toEqual({ distance: 2, at: 100 });
  });

  it("lets go of anything further away than the threshold", () => {
    expect(snapOffset(98, 40, [120], 1)).toBeNull();
    expect(snapOffset(98, 40, [], 6)).toBeNull();
  });

  it("rounds onto the grid only when there is a grid", () => {
    expect(gridOffset(23, 8)).toBe(1);
    expect(gridOffset(19, 8)).toBe(-3);
    // Exactly halfway goes up, which is what rounding does everywhere else in the editor.
    expect(gridOffset(20, 8)).toBe(4);
    expect(gridOffset(23, 0)).toBe(0);
    expect(gridOffset(23, 1)).toBe(0);
  });

  it("centres an object between its nearest neighbours and reports equal spacing", () => {
    const boxes = [
      { left: 0, right: 50, top: 0, bottom: 40, width: 50, height: 40 },
      { left: 250, right: 300, top: 0, bottom: 40, width: 50, height: 40 },
    ];
    expect(equalGapOffset(103, 100, 5, 30, boxes, "x", 6)).toEqual({ distance: -3, gap: 50, before: 50, after: 250 });
    expect(equalGapOffset(115, 100, 5, 30, boxes, "x", 6)).toBeNull();
  });

  it("does not use objects on another row as spacing neighbours", () => {
    const boxes = [
      { left: 0, right: 50, top: 100, bottom: 140, width: 50, height: 40 },
      { left: 250, right: 300, top: 100, bottom: 140, width: 50, height: 40 },
    ];
    expect(equalGapOffset(103, 100, 0, 30, boxes, "x", 6)).toBeNull();
  });

  it("applies the same equal-spacing guide vertically", () => {
    const boxes = [
      { left: 0, right: 40, top: 10, bottom: 50, width: 40, height: 40 },
      { left: 0, right: 40, top: 250, bottom: 290, width: 40, height: 40 },
    ];
    expect(equalGapOffset(101, 100, 5, 30, boxes, "y", 6)).toEqual({ distance: -1, gap: 50, before: 50, after: 250 });
  });
});

describe("the screen a panel will run on", () => {
  it("offers real panel sizes and falls back to the free format", () => {
    expect(panelFormat("panel-800")).toMatchObject({ width: 800, height: 480 });
    expect(panelFormat("nonesiste" as never).id).toBe("libero");
    expect(panelFormats.every((format) => format.width > 0 && format.height > 0)).toBe(true);
  });

  it("draws the page at least as tall as the panel, however short its content is", () => {
    // A page with 200px of content on a 7" panel must show the 280px of empty glass below it.
    expect(normalizeContentHeight(200, 480)).toBe(480);
    expect(normalizeContentHeight(900, 480)).toBe(900);
  });
});

const panel = `export default function Panel() {
  return (
    <section>
      <button type="button" style={{ translate: "0px 0px" }}>Avvia</button>
      <button type="button" style={{ translate: "0px 0px" }}>Arresta</button>
    </section>
  );
}`;

describe("aligning what the running panel shows", () => {
  beforeEach(() => {
    bridge.readFile.mockReset().mockResolvedValue(panel);
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    const document = parseSource("C:/project/Panel.jsx", panel);
    const buttons = Object.values(document.nodes).filter((node) => node.type === "button");
    useEditorStore.setState({
      document, selectedId: undefined, externalRoots: ["C:/project"], selectionInfo: undefined,
      history: [], future: [], consoleEntries: [], lastError: undefined, editScope: "instance",
      multiSelection: buttons.map((node, index) => ({
        source: node.source,
        instanceId: `fc-instance-${index}`,
        rect: { x: index ? 200 : 100, y: 0, width: index ? 40 : 100, height: 30 },
        translate: { x: 0, y: 0 },
      })),
    });
  });

  it("writes the new position of every element that has to move", async () => {
    await useEditorStore.getState().alignSelection("center-x");
    const written = bridge.writeFile.mock.calls.map(([, source]) => source as string);
    expect(written).toHaveLength(2);
    // The middle of the group is 170: the wide button moves right by 20, the narrow one left by 50.
    expect(written.at(-1)).toContain('translate: "20px 0px"');
    expect(written.at(-1)).toContain('translate: "-50px 0px"');
  });

  it("writes from the end of the file back, so the earlier ranges stay where they were", async () => {
    await useEditorStore.getState().alignSelection("center-x");
    // Both buttons really moved: rewriting front to back would have left the second one mangled or
    // untouched, because the first rewrite shifts every offset after it.
    const final = bridge.writeFile.mock.calls.at(-1)?.[1] as string;
    expect(final.match(/translate: "(-?[\d.]+)px 0px"/g)).toEqual(['translate: "20px 0px"', 'translate: "-50px 0px"']);
    expect(() => parseSource("C:/project/Panel.jsx", final)).not.toThrow();
  });

  it("is one step to undo, not one per element", async () => {
    await useEditorStore.getState().alignSelection("center-x");
    expect(useEditorStore.getState().history).toHaveLength(1);
    expect(useEditorStore.getState().history[0].source).toBe(panel);
  });

  it("applies one Inspector property to every selected element", async () => {
    await useEditorStore.getState().updateMultiSelectionStyles({ backgroundColor: "#cc3344" });

    const final = bridge.writeFile.mock.calls.at(-1)?.[1] as string;
    expect(final.match(/backgroundColor: "#cc3344"/g)).toHaveLength(2);
    expect(useEditorStore.getState().history).toHaveLength(1);
    expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("2 elementi");
  });

  it("commits the final position of a dragged group as one action", async () => {
    const moved = useEditorStore.getState().multiSelection.map((entry, index) => ({
      ...entry,
      rect: { ...entry.rect, x: entry.rect.x + 35, y: entry.rect.y + 12 },
      translate: { x: index ? 35 : 43, y: 12 },
    }));

    await useEditorStore.getState().commitMultiSelection(moved);

    const final = bridge.writeFile.mock.calls.at(-1)?.[1] as string;
    expect(final).toContain('translate: "43px 12px"');
    expect(final).toContain('translate: "35px 12px"');
    expect(useEditorStore.getState().history).toHaveLength(1);
    expect(useEditorStore.getState().multiSelection[0].rect.x).toBe(135);
  });

  it("says so instead of writing when the elements are already aligned", async () => {
    useEditorStore.setState({
      multiSelection: useEditorStore.getState().multiSelection.map((entry) => ({ ...entry, rect: { ...entry.rect, x: 100, width: 100 } })),
    });
    await useEditorStore.getState().alignSelection("left");
    expect(bridge.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("già a posto");
  });

  it("refuses a group of one", async () => {
    useEditorStore.setState({ multiSelection: useEditorStore.getState().multiSelection.slice(0, 1) });
    await useEditorStore.getState().alignSelection("left");
    expect(bridge.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("almeno due");
  });
});
