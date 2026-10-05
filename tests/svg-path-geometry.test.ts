import { describe, expect, it } from "vitest";
import { highlightShapePath, insertPathAnchor, movePathAnchor, pathAnchors, pathBounds, pathClosed, removePathAnchor, setPathClosed, transformPathToBounds } from "../src/core/svgPathGeometry";

describe("SVG highlight geometry", () => {
  it("reads the visible bounds of a machine outline", () => {
    expect(pathBounds("M10 20 L30 20 L30 50 Z")).toEqual({ x: 10, y: 20, width: 20, height: 30 });
  });

  it("moves and resizes an outline without replacing its curves", () => {
    const transformed = transformPathToBounds("M10 20 C15 10 25 60 30 50", { x: 100, y: 200, width: 80, height: 40 });
    expect(transformed).toContain("C");
    expect(pathBounds(transformed)).toEqual({ x: 100, y: 200, width: 80, height: 40 });
  });

  it("normalises relative paths before transforming them", () => {
    const transformed = transformPathToBounds("m10 10 l20 0 l0 20 z", { x: 5, y: 6, width: 40, height: 50 });
    expect(pathBounds(transformed)).toEqual({ x: 5, y: 6, width: 40, height: 50 });
  });

  it("turns the same area into a line, rectangle, square or ellipse", () => {
    const bounds = { x: 10, y: 20, width: 80, height: 40 };
    expect(highlightShapePath("line", bounds)).toBe("M10 40 L90 40");
    expect(highlightShapePath("rectangle", bounds)).toContain("L90 60");
    expect(pathBounds(highlightShapePath("square", bounds))).toEqual({ x: 30, y: 20, width: 40, height: 40 });
    expect(highlightShapePath("ellipse", bounds)).toContain("C");
    expect(pathBounds(highlightShapePath("ellipse", bounds))).toEqual(bounds);
  });

  it("moves every corner independently without replacing the whole shape", () => {
    const path = "M10 10 L90 10 L90 60 L10 60 Z";
    const moved = movePathAnchor(path, 1, 120, 25);
    expect(pathAnchors(moved)).toEqual([
      { index: 0, x: 10, y: 10 }, { index: 1, x: 120, y: 25 },
      { index: 2, x: 90, y: 60 }, { index: 3, x: 10, y: 60 },
    ]);
    expect(pathClosed(moved)).toBe(true);
  });

  it("adds a new draggable corner to a side and can open or close the outline", () => {
    const withCorner = insertPathAnchor("M0 0 L100 0 L100 80 Z", 0, { x: 40, y: 20 });
    expect(pathAnchors(withCorner)).toHaveLength(4);
    expect(pathAnchors(withCorner)[1]).toMatchObject({ x: 40, y: 20 });
    const open = setPathClosed(withCorner, false);
    expect(pathClosed(open)).toBe(false);
    expect(pathClosed(setPathClosed(open, true))).toBe(true);
  });

  it("takes a corner away, and says why the last ones cannot go", () => {
    const square = "M10 10 L90 10 L90 60 L10 60 Z";
    const triangle = removePathAnchor(square, 2);

    expect(pathAnchors(triangle).map((anchor) => [anchor.x, anchor.y])).toEqual([[10, 10], [90, 10], [10, 60]]);
    expect(pathClosed(triangle)).toBe(true);
    expect(() => removePathAnchor(triangle, 0)).toThrow(/almeno tre angoli/);
    expect(() => removePathAnchor(square, 9)).toThrow(/non trovato/);

    const line = removePathAnchor("M0 0 L10 0 L20 0", 1);
    expect(line).toBe("M0 0 L20 0");
    expect(() => removePathAnchor(line, 1)).toThrow(/almeno due punti/);
  });
});
