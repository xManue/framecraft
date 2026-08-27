import { describe, expect, it } from "vitest";
import { fitCanvasZoom, normalizeContentHeight, normalizeContentWidth } from "../src/canvas/sizing";

describe("adaptive canvas sizing", () => {
  it("fits a desktop page into the available center panel", () => {
    expect(fitCanvasZoom(900, 1440)).toBeCloseTo(0.5917, 3);
    expect(fitCanvasZoom(1600, 1440)).toBe(1);
  });

  it("uses the full reported page height without unbounded growth", () => {
    expect(normalizeContentHeight(1280.2)).toBe(1281);
    expect(normalizeContentHeight(400)).toBe(760);
    expect(normalizeContentHeight(99999)).toBe(20000);
  });

  it("expands to fixed-width page content instead of clipping it", () => {
    expect(normalizeContentWidth(1920, 1440)).toBe(1920);
    expect(normalizeContentWidth(900, 1440)).toBe(1440);
    expect(normalizeContentWidth(99999, 1440)).toBe(3840);
  });
});
