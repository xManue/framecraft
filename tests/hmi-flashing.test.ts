import { describe, expect, it } from "vitest";
import { hmiFlashingContrast, hmiFlashingCss, hmiFlashingInlineStyle, resolveHmiFlashing } from "../src/core/hmiFlashing";
import type { Dynamization } from "../src/core/hmiStandard";

const flashing = (extra: Partial<Dynamization> = {}): Dynamization => ({
  property: "BackColor",
  kind: "Flashing",
  conditionType: "None",
  color: "#FFFF0000",
  alternateColor: "#FF000000",
  flashingCondition: "Always",
  flashingRate: "Medium",
  ...extra,
});

describe("lampeggio WinCC Unified", () => {
  it("usa le frequenze Unified e converte i colori ARGB senza cambiare il valore base", () => {
    expect(resolveHmiFlashing(flashing(), {})).toEqual({
      active: true,
      visual: { property: "BackColor", color: "#FF0000", alternateColor: "#000000", periodMs: 1000 },
    });
    expect(resolveHmiFlashing(flashing({ flashingRate: "Slow" }), {})).toMatchObject({ visual: { periodMs: 2000 } });
    expect(resolveHmiFlashing(flashing({ flashingRate: "Fast" }), {})).toMatchObject({ visual: { periodMs: 500 } });
  });

  it("rispetta Never e il superamento dei limiti", () => {
    expect(resolveHmiFlashing(flashing({ flashingCondition: "Never" }), {})).toEqual({ active: false });
    const ranged = flashing({ flashingCondition: "RangeViolation", tag: "Temperature", minimum: 10, maximum: 80 });
    expect(resolveHmiFlashing(ranged, { Temperature: "42" })).toEqual({ active: false });
    expect(resolveHmiFlashing(ranged, { Temperature: "81" })).toMatchObject({ active: true });
    expect(resolveHmiFlashing(ranged, { Temperature: "non numerico" })).toEqual({ reason: "Il tag Temperature non ha un valore numerico di prova." });
    expect(resolveHmiFlashing(flashing({ flashingCondition: "RangeViolation", tag: "Temperature" }), { Temperature: "42" })).toEqual({
      reason: "Il superamento limiti richiede almeno un limite minimo o massimo.",
    });
  });

  it("compone più proprietà in un'unica animazione e offre un segnale statico con movimento ridotto", () => {
    const style = hmiFlashingInlineStyle([
      { property: "BackColor", color: "#f00", alternateColor: "#000", periodMs: 500 },
      { property: "BorderColor", color: "#ff0", alternateColor: "#00f", periodMs: 2000 },
    ]);
    expect(style.animation).toBe("framecraft-hmi-flash-background 500ms steps(1, end) infinite, framecraft-hmi-flash-border 2000ms steps(1, end) infinite");
    expect(style["--framecraft-hmi-flash-background-color"]).toBe("#f00");
    expect(style["--framecraft-hmi-flash-border-alternate"]).toBe("#00f");
    expect(hmiFlashingCss).toContain("prefers-reduced-motion: reduce");
    expect(hmiFlashingCss).toContain("repeating-linear-gradient");
    expect(hmiFlashingCss).toContain("outline: 3px double");
  });

  it("rifiuta colori uguali e misura il contrasto", () => {
    expect(resolveHmiFlashing(flashing({ color: "#FF000000", alternateColor: "#FF000000" }), {})).toEqual({
      reason: "I due colori del lampeggio devono essere diversi.",
    });
    expect(hmiFlashingContrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
