import { describe, expect, it } from "vitest";
import { fitCanvasZoom, normalizeContentHeight, normalizeContentWidth, settledContentSize } from "../src/canvas/sizing";

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

describe("a page that reports its own overflow", () => {
  it("never lets the canvas follow a report that only repeats the box it was given", () => {
    // The real case: a panel whose shell fills its box and is then translated 3.6px to the right
    // reports four pixels more than it was handed, every time it is measured.
    let width = 1440;
    for (let step = 0; step < 200; step += 1) {
      width = settledContentSize(width, normalizeContentWidth(width + 4, 1440));
    }
    expect(width).toBe(1440);
  });

  it("still takes the size of a page that really is bigger", () => {
    expect(settledContentSize(1440, 1920)).toBe(1920);
    expect(settledContentSize(760, 1166)).toBe(1166);
    // And settles there instead of creeping on.
    expect(settledContentSize(1166, 1170)).toBe(1166);
  });

  it("keeps a small canvas from creeping by a few pixels at a time", () => {
    // The tolerance is relative, so it never becomes meaningless on a phone-sized viewport.
    expect(settledContentSize(390, 396)).toBe(390);
    expect(settledContentSize(390, 640)).toBe(640);
  });
});
