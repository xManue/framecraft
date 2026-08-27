import { describe, expect, it } from "vitest";
import { stylePatch, transformedRect } from "../src/canvas/transformGeometry";

const rect = { x: 100, y: 80, width: 200, height: 60 };
const geometry = { display: "block", translate: "10px 5px", scale: "none", cssWidth: 200, cssHeight: 60 };

describe("visual canvas transformations", () => {
  it("moves an element while preserving its existing translation", () => {
    const next = transformedRect(rect, "move", 24, -12);
    expect(next).toEqual({ x: 124, y: 68, width: 200, height: 60 });
    expect(stylePatch(rect, next, geometry, "move")).toEqual({ translate: "34px -7px" });
  });

  it("resizes from every edge and keeps a usable minimum size", () => {
    const next = transformedRect(rect, "nw", 40, 20);
    expect(next).toEqual({ x: 140, y: 100, width: 160, height: 40 });
    expect(stylePatch(rect, next, geometry, "nw")).toEqual({ scale: "0.8 0.667", transformOrigin: "right bottom" });
    expect(transformedRect(rect, "se", -999, -999)).toMatchObject({ width: 12, height: 12 });
  });

  it("resizes visually without changing the surrounding layout", () => {
    const next = transformedRect(rect, "e", 30, 0);
    expect(stylePatch(rect, next, { ...geometry, display: "inline" }, "e")).toEqual({ scale: "1.15 1", transformOrigin: "left center" });
  });
});
