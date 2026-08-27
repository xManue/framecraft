import { describe, expect, it } from "vitest";
import { translatedCoordinate } from "../src/inspector/coordinates";

describe("inspector coordinates", () => {
  it("moves one visual axis while preserving the existing translation on the other", () => {
    expect(translatedCoordinate(120, 155, "10px -4px", "x")).toBe("45px -4px");
    expect(translatedCoordinate(80, 62, "10px -4px", "y")).toBe("10px -22px");
  });

  it("starts from zero when the selected element has no translation", () => {
    expect(translatedCoordinate(24.5, 40, "none", "x")).toBe("15.5px 0px");
  });
});
