import { describe, expect, it } from "vitest";
import { fitWorkspacePanes, workspaceActivityWidth, workspaceCanvasMinimum } from "../src/core/workspaceLayout";
import { densityScale } from "../src/state/editorStore";

describe("spazio di lavoro e dimensione degli strumenti", () => {
  it("la densità normale lascia più spazio senza cambiare la dimensione del pannello HMI", () => {
    expect(densityScale).toEqual({ compatta: 1, normale: 1.1, grande: 1.3 });
  });
  it("conserva le larghezze richieste quando c’è spazio", () => {
    expect(fitWorkspacePanes({ left: 320, inspector: 400 }, 1400, false)).toEqual({ left: 320, inspector: 400 });
  });
  it.each([640, 768, 900, 1024, 1440, 1920])("riduce solo la larghezza visibile a %i pixel, lasciando il canvas utilizzabile", width => {
    const saved = { left: 620, inspector: 620 };
    const fitted = fitWorkspacePanes(saved, width, false);
    expect(fitted.left + fitted.inspector + workspaceActivityWidth + workspaceCanvasMinimum).toBeLessThanOrEqual(width);
    expect(saved).toEqual({ left: 620, inspector: 620 });
    expect(fitWorkspacePanes(saved, 1800, false)).toEqual(saved);
  });
  it("restituisce al canvas lo spazio della barra laterale chiusa", () => {
    const fitted = fitWorkspacePanes({ left: 620, inspector: 360 }, 1000, true);
    expect(fitted).toEqual({ left: 0, inspector: 360 });
  });
  it("non riserva una colonna per le proprietà quando non sono richieste", () => {
    expect(fitWorkspacePanes({ left: 220, inspector: 620 }, 1000, false, false)).toEqual({ left: 220, inspector: 0 });
    expect(fitWorkspacePanes({ left: 220, inspector: 620 }, 1000, true, false)).toEqual({ left: 0, inspector: 0 });
  });
  it("non produce dimensioni negative durante una riduzione transitoria della finestra", () => {
    expect(fitWorkspacePanes({ left: 300, inspector: 400 }, 0, false)).toEqual({ left: 0, inspector: 0 });
  });
});
