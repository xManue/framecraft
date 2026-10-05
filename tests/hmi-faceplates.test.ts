import { describe, expect, it } from "vitest";
import {
  hmiFaceplateBindingIssues,
  hmiFaceplateTagCompatible,
  hmiFaceplateTypeIssues,
  parseHmiFaceplateBinding,
  parseHmiFaceplateCatalog,
  serializeHmiFaceplateBinding,
  serializeHmiFaceplateCatalog,
  standardHmiFaceplateCatalog,
} from "../src/core/hmiFaceplates";

describe("catalogo faceplate Unified", () => {
  it("parte dai tipi e dalle interfacce realmente istanziati nello standard", () => {
    const catalog = standardHmiFaceplateCatalog();
    expect(catalog.types.map((type) => [type.name, type.version, type.width, type.height])).toEqual([
      ["Pack", "0.0.8", 80, 80],
      ["Slider V1", "0.0.28", 485, 84],
      ["Slider V2", "0.0.5", 476, 84],
    ]);
    expect(catalog.types[0].interfaceTags.map((tag) => tag.name)).toEqual(["Width", "Height", "Group_Nr", "Group_Selected"]);
    expect(catalog.types[1].interfaceProperties.map((property) => property.name)).toEqual(["Color", "floor"]);
    expect(catalog.types.every((type) => type.visualization.length > 0)).toBe(true);
    expect(parseHmiFaceplateCatalog(serializeHmiFaceplateCatalog(catalog))).toEqual(catalog);
  });

  it("mantiene versione e mapping dell'istanza", () => {
    const binding = {
      typeId: "pack", version: "0.0.8",
      tagBindings: { Width: "Pack[1].Size_X", Height: "Pack[1].Size_Y" },
      propertyValues: { color_Pack: "#FF00A1D1" },
      eventBindings: { Selected: { script: 'Tags("Pack.Selected").Write(index);' } },
    };
    expect(parseHmiFaceplateBinding(serializeHmiFaceplateBinding(binding))).toMatchObject(binding);
    expect(JSON.parse(serializeHmiFaceplateBinding(binding)).eventBindings.Selected.program.version).toBe(1);
    expect(parseHmiFaceplateBinding("non-json")).toBeUndefined();
  });

  it("impedisce collisioni fra tag, proprietà e tag locali", () => {
    const catalog = standardHmiFaceplateCatalog();
    const broken = {
      ...catalog.types[0], version: "V1", status: "draft" as const,
      localTags: [{ name: "Width", dataType: "Int", minimum: 10, maximum: 2 }],
    };
    expect(hmiFaceplateTypeIssues(broken, catalog).map((issue) => issue.message)).toEqual(expect.arrayContaining([
      expect.stringContaining("formato 0.0.1"),
      expect.stringContaining("usato più volte"),
      expect.stringContaining("minimo maggiore"),
    ]));
  });

  it("controlla versione rilasciata, tag mancanti e compatibilità PLC", () => {
    const catalog = standardHmiFaceplateCatalog();
    const binding = { typeId: "pack", version: "0.0.8", tagBindings: { Width: "Pack.Width", Height: "Pack.Height", Group_Nr: "Pack.Group", Group_Selected: "Missing" }, propertyValues: {} };
    const issues = hmiFaceplateBindingIssues(binding, catalog, [
      { name: "Pack.Width", dataType: "Int", access: "read", address: "", description: "" },
      { name: "Pack.Height", dataType: "Bool", access: "read", address: "", description: "" },
      { name: "Pack.Group", dataType: "Int", access: "read", address: "", description: "" },
    ]);
    expect(issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      expect.stringContaining("Pack.Height"),
      expect.stringContaining("Missing"),
    ]));
    expect(hmiFaceplateTagCompatible("LReal", "DInt")).toBe(true);
    expect(hmiFaceplateTagCompatible("Int", "Bool")).toBe(false);
  });

  it("consente più versioni dello stesso tipo ma rifiuta duplicati e rinominazioni", () => {
    const catalog = standardHmiFaceplateCatalog();
    const pack = catalog.types[0];
    const next = { ...pack, version: "0.0.9", status: "draft" as const };
    const versioned = { ...catalog, types: [...catalog.types, next] };
    expect(hmiFaceplateTypeIssues(next, versioned)).toEqual([]);

    const duplicated = { ...versioned, types: [...versioned.types, { ...next }] };
    expect(hmiFaceplateTypeIssues(next, duplicated).map((issue) => issue.message)).toContain("La versione V0.0.9 è duplicata per lo stesso tipo.");

    const renamed = { ...catalog, types: [...catalog.types, { ...next, name: "Pack nuovo" }] };
    expect(hmiFaceplateTypeIssues(renamed.types.at(-1)!, renamed).map((issue) => issue.message)).toContain("Le versioni dello stesso tipo devono mantenere lo stesso nome.");
  });

  it("valida mapping e cicli indiretti dei faceplate annidati", () => {
    const catalog = standardHmiFaceplateCatalog();
    const outer = { ...catalog.types[0], id: "outer", name: "Outer", version: "1.0.0", interfaceTags: [{ name: "Width", dataType: "Int", required: true }], interfaceProperties: [], nestedInstances: [{ id: "Inner", typeId: "inner", version: "1.0.0", tagBindings: { Value: "Width" }, propertyBindings: {}, left: 0, top: 0, width: 80, height: 80 }] };
    const inner = { ...catalog.types[0], id: "inner", name: "Inner", version: "1.0.0", interfaceTags: [{ name: "Value", dataType: "Int", required: true }], interfaceProperties: [], nestedInstances: [{ id: "Back", typeId: "outer", version: "1.0.0", tagBindings: { Width: "Value" }, propertyBindings: {}, left: 0, top: 0, width: 80, height: 80 }] };
    const nestedCatalog = { version: 1 as const, types: [outer, inner] };
    expect(hmiFaceplateTypeIssues(outer, nestedCatalog).map((issue) => issue.message)).toContain("La composizione di Outer V1.0.0 contiene un ciclo di faceplate annidati.");

    const invalid = { ...outer, nestedInstances: [{ ...outer.nestedInstances[0], tagBindings: { Missing: "Unknown" } }] };
    const invalidCatalog = { version: 1 as const, types: [invalid, { ...inner, nestedInstances: [] }] };
    expect(hmiFaceplateTypeIssues(invalid, invalidCatalog).map((issue) => issue.message)).toEqual(expect.arrayContaining([
      expect.stringContaining("tag interno inesistente"),
      expect.stringContaining("tag esterno inesistente"),
      expect.stringContaining("obbligatorio"),
    ]));
  });

  it("valida oggetti visuali, sorgenti ed eventi del tipo", () => {
    const catalog = standardHmiFaceplateCatalog();
    const broken = {
      ...catalog.types[0], status: "draft" as const,
      visualization: [
        { ...catalog.types[0].visualization[0], id: "Bad name", bindings: [{ property: "Text" as const, source: "local" as const, name: "Missing" }] },
        { ...catalog.types[0].visualization[0], id: "Bad name", left: 1000, event: { name: "MissingEvent", parameters: {} } },
      ],
    };
    const messages = hmiFaceplateTypeIssues(broken, { ...catalog, types: [broken, ...catalog.types.slice(1)] }).map((issue) => issue.message);
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining("nome valido per un oggetto visuale"),
      expect.stringContaining("duplicato"),
      expect.stringContaining("sorgente local"),
      expect.stringContaining("esce dai limiti"),
      expect.stringContaining("evento inesistente"),
    ]));
  });
});
