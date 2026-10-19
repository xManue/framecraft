import { describe, expect, it } from "vitest";
import { emptyRecipeCatalog, parseRecipeCatalog, recipeConfigurationError, recipeConfigurationIssues, recipeDraftNumber, recipeNewId } from "../src/core/recipeConfiguration";
describe("configurazione iniziale ricette", () => {
  it("è vuota, non inserisce parametri macchina e assegna ID nuovi senza collisioni", () => { expect(emptyRecipeCatalog()).toEqual({ version: 1, schemas: [] }); expect(recipeConfigurationIssues(emptyRecipeCatalog())).toEqual([]); expect(recipeNewId(["field-1", "field-3"], "field")).toBe("field-2"); });
  it("conserva il rimedio degli errori nativi e spiega una build desktop precedente", () => { expect(recipeConfigurationError("Catalogo cambiato: rileggi prima di salvare.")).toContain("rileggi"); expect(recipeConfigurationError(new Error("Command read_recipe_configuration not found"))).toContain("nuova build"); expect(recipeConfigurationError(null)).toContain("non vengono sostituiti"); });
  it("segnala ricetta e campo da compilare, senza inventare false o zero", () => {
    const catalog = { version: 1 as const, schemas: [{ id: "s", name: "Formato", fields: [{ id: "p", name: "Pressione", type: "number" as const }], records: [{ id: "r", name: "Ricetta A", values: {} }] }] };
    expect(recipeConfigurationIssues(catalog)).toEqual(["Formato / Ricetta A / Pressione: Valori ricetta non validi."]); expect(() => parseRecipeCatalog(catalog)).toThrow();
  });
  it("non interpreta espressioni, esadecimali, Infinity, virgole o valori vuoti come numeri", () => {
    for (const text of ["", " ", "1,5", "0x10", "Infinity", "1/2", "--2", "1e999"]) expect(recipeDraftNumber(text)).toBe(text);
    expect(recipeDraftNumber("-1.25")).toBe(-1.25); expect(recipeDraftNumber("2e3")).toBe(2000); expect(recipeDraftNumber("0")).toBe(0);
  });
});
