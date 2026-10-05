import { describe, expect, it } from "vitest";
import { emptyHmiResourceCatalog, hmiTextDictionary, parseHmiResourceCatalog, resolveHmiResource, resolveHmiText, serializeHmiResourceCatalog, type HmiResourceCatalog } from "../src/core/hmiResources";

function catalog(): HmiResourceCatalog {
  return {
    ...emptyHmiResourceCatalog(),
    languages: ["it-IT", "en-US"],
    multilingualTexts: [{ key: "Page.Title", texts: { "it-IT": "Impostazioni", "en-US": "Settings" } }],
    textLists: [{
      name: "MachineState",
      rangeType: "Decimal",
      entries: [
        { id: "idle", type: "SingleValue", fromValue: 0, texts: { "it-IT": "Ferma", "en-US": "Idle" } },
        { id: "run", type: "Range", fromValue: 1, toValue: 9, texts: { "it-IT": "Marcia" } },
        { id: "other", type: "SingleValue", fromValue: 99, default: true, texts: { "it-IT": "Altro" } },
      ],
    }],
    graphicLists: [{
      name: "MotorIcon",
      rangeType: "Bool",
      entries: [
        { id: "off", type: "SingleValue", fromValue: 0, graphic: "/motor-off.svg" },
        { id: "on", type: "SingleValue", fromValue: 1, graphic: "/motor-on.svg" },
      ],
    }],
  };
}

describe("HMI resource lists", () => {
  it("risolve valori, intervalli, default e fallback linguistico", () => {
    expect(resolveHmiResource(catalog(), "MachineState", "0", "en-US")).toMatchObject({ kind: "text", value: "Idle", fallback: false });
    expect(resolveHmiResource(catalog(), "MachineState", "4", "en-US")).toMatchObject({ kind: "text", value: "Marcia", language: "it-IT", fallback: true });
    expect(resolveHmiResource(catalog(), "MachineState", "42", "it-IT")).toMatchObject({ kind: "text", value: "Altro" });
    expect(resolveHmiResource(catalog(), "MotorIcon", "true")).toMatchObject({ kind: "graphic", value: "/motor-on.svg" });
  });

  it("applica ExactMatch e LeastSignificantBit alle liste BitNumber", () => {
    const bitCatalog: HmiResourceCatalog = {
      ...emptyHmiResourceCatalog(),
      languages: ["it-IT"],
      textLists: [{ name: "Bits", rangeType: "BitNumber", entries: [
        { id: "bit-2", type: "SingleValue", fromValue: 2, texts: { "it-IT": "Bit due" } },
      ] }],
    };
    expect(resolveHmiResource(bitCatalog, "Bits", "4")).toMatchObject({ value: "Bit due" });
    expect(resolveHmiResource(bitCatalog, "Bits", "12")).toHaveProperty("reason");
    expect(resolveHmiResource({ ...bitCatalog, bitSelection: "LeastSignificantBit" }, "Bits", "12")).toMatchObject({ value: "Bit due" });
  });

  it("rifiuta cataloghi ambigui e conserva il formato", () => {
    expect(() => parseHmiResourceCatalog({ ...catalog(), graphicLists: [{ name: "MachineState", rangeType: "Bool", entries: [] }] })).toThrow(/piu' di una lista/i);
    expect(() => parseHmiResourceCatalog({ ...catalog(), textLists: [{ name: "Bad", rangeType: "Decimal", entries: [{ id: "x", type: "Range", fromValue: 9, toValue: 2, texts: {} }] }] })).toThrow(/invertito/i);
    expect(parseHmiResourceCatalog(serializeHmiResourceCatalog(catalog()))).toEqual(catalog());
  });

  it("risolve anche i testi statici dell'oggetto nella lingua Runtime", () => {
    expect(resolveHmiText(catalog(), "Page.Title", "en-US")).toEqual({ value: "Settings", language: "en-US", fallback: false });
    expect(hmiTextDictionary(catalog(), "it-IT")).toEqual({ "Page.Title": "Impostazioni" });
    expect(resolveHmiText(catalog(), "Missing", "it-IT")).toHaveProperty("reason");
  });
});
