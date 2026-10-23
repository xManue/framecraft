import { describe, expect, it } from "vitest";
import { captureRecipePlc, emptyRecipePlcConfig, parseRecipePlcCapture, parseRecipePlcConfig, parseRecipePlcQuery, recipePlcTypeCompatible, type RecipePlcConfig } from "../runtime/recipe-plc.mjs";
import type { RecipeCatalog } from "../runtime/recipe-catalog.mjs";
const revision = "a".repeat(64), mappingRevision = "b".repeat(64), now = 10000;
const catalog: RecipeCatalog = { version: 1, schemas: [{ id: "s", name: "Test", fields: [{ id: "n", name: "Numero", type: "number", minimum: 0, maximum: 10 }, { id: "b", name: "Booleano", type: "boolean" }, { id: "t", name: "Testo", type: "string", maxLength: 12 }], records: [] }] };
const variables = [{ name: "N", dataType: "Real", access: "read" }, { name: "B", dataType: "Bool", access: "read-write" }, { name: "T", dataType: "WString", access: "read" }];
const config: RecipePlcConfig = { version: 1, schemas: [{ schemaId: "s", maxAgeMs: 2000, maxSkewMs: 100, fields: [{ fieldId: "n", tag: "N" }, { fieldId: "b", tag: "B" }, { fieldId: "t", tag: "T" }] }] };
function capture(patch = {}, tag = "N") {
  return captureRecipePlc(config.schemas[0], catalog.schemas[0], revision, mappingRevision, variables, name => ({ connectionId: "c", protocol: "mqtt", state: "connected", sample: { value: name === "N" ? 0 : name === "B" ? false : "", qualityCode: 192, receivedAt: now - 20, ...(tag === name ? patch : {}) } }), now);
}
describe("recipe PLC mapping and cache capture", () => {
  it("defaults off and canonicalizes mapping without mutating recipes", () => {
    expect(emptyRecipePlcConfig()).toEqual({ version: 1, schemas: [] });
    const original = JSON.stringify(catalog), parsed = parseRecipePlcConfig(config, catalog, variables);
    expect(parsed.schemas[0].fields.map(item => item.fieldId)).toEqual(["b", "n", "t"]); expect(JSON.stringify(catalog)).toBe(original);
  });
  it.each([null, { version: 1, schemas: [null] }, { ...config, unknown: true }, { version: 1, schemas: [...config.schemas, ...config.schemas] }, { version: 1, schemas: [{ ...config.schemas[0], maxSkewMs: 2001 }] }, { version: 1, schemas: [{ ...config.schemas[0], maxAgeMs: 0 }] }, { version: 1, schemas: [{ ...config.schemas[0], fields: [{ fieldId: "n", tag: "N" }] }] }])("rejects malformed, partial and unsafe configuration %#", raw => {
    expect(() => parseRecipePlcConfig(raw, catalog, variables)).toThrow();
  });
  it("requires unique, declared, readable, compatible tags and exact fields", () => {
    for (const tags of [variables.slice(1), [...variables, variables[0]], variables.map(item => ({ ...item, detected: true })), variables.map(item => ({ ...item, access: "write" })), variables.map(item => ({ ...item, dataType: "LInt" }))]) expect(() => parseRecipePlcConfig(config, catalog, tags)).toThrow();
    for (const fields of [[{ fieldId: "n", tag: "N" }, { fieldId: "b", tag: "B" }, { fieldId: "n", tag: "T" }], config.schemas[0].fields.map(item => ({ ...item, tag: "N" }))]) expect(() => parseRecipePlcConfig({ ...config, schemas: [{ ...config.schemas[0], fields }] }, catalog, variables)).toThrow();
    expect(recipePlcTypeCompatible("integer", "Real")).toBe(false); expect(recipePlcTypeCompatible("number", "LInt")).toBe(false); expect(recipePlcTypeCompatible("integer", "UDInt")).toBe(true);
  });
  it("preserves explicit zero, false and empty text; validates its own wire response", () => {
    const value = capture(); expect(value.complete).toBe(true); expect(value.values).toEqual({ n: 0, b: false, t: "" }); expect(parseRecipePlcCapture(value, catalog.schemas[0], revision)).toEqual(value);
    expect(value).toMatchObject({ effect: "plc-read-only", simultaneous: false, plcConfirmed: false });
  });
  it.each([
    [{ qualityCode: undefined }, "RECIPE_PLC_QUALITY"], [{ qualityCode: 64 }, "RECIPE_PLC_QUALITY"], [{ lastError: "driver failure" }, "RECIPE_PLC_QUALITY"], [{ retained: true }, "RECIPE_PLC_RETAINED"], [{ value: undefined }, "RECIPE_PLC_MISSING"], [{ receivedAt: 7999 }, "RECIPE_PLC_AGE"], [{ receivedAt: now + 1 }, "RECIPE_PLC_AGE"], [{ receivedAt: NaN }, "RECIPE_PLC_AGE"], [{ value: 11 }, "RECIPE_PLC_VALUE"], [{ value: "not-a-number" }, "RECIPE_PLC_VALUE"],
  ])("blocks incomplete samples without substituting a value %#", (patch, code) => {
    const value = capture(patch); expect(value.complete).toBe(false); expect(value).not.toHaveProperty("values"); expect(value.entries[0].code).toBe(code); expect(value.entries[0]).not.toHaveProperty("value"); expect(parseRecipePlcCapture(value, catalog.schemas[0], revision)).toEqual(value);
  });
  it("reports missing owner, disconnected source and cross-tag skew distinctly", () => {
    for (const source of [undefined, { connectionId: "c", protocol: "opcua" as const, state: "error" }]) {
      const value = captureRecipePlc(config.schemas[0], catalog.schemas[0], revision, mappingRevision, variables, () => source, now);
      expect(value.entries[0].code).toBe(source ? "RECIPE_PLC_OFFLINE" : "RECIPE_PLC_UNBOUND"); expect(parseRecipePlcCapture(value, catalog.schemas[0], revision)).toEqual(value);
    }
    const value = capture({ receivedAt: now - 500 }); expect(value.entries.every(item => item.ok)).toBe(true); expect(value.complete).toBe(false); expect(value.code).toBe("RECIPE_PLC_SKEW"); expect(value).not.toHaveProperty("values");
  });
  it("rejects forged completeness, timestamps, schema/revision and aggregate values", () => {
    const good = capture();
    for (const value of [{ ...good, revision: mappingRevision }, { ...good, plcConfirmed: true }, { ...good, simultaneous: true }, { ...good, values: { n: 1, b: false, t: "" } }, { ...good, unknown: 1 }, { ...good, entries: good.entries.map(item => ({ ...item, receivedAt: now + 1 })) }, { ...good, entries: [good.entries[0], good.entries[0], good.entries[2]] }, { ...capture({ retained: true }), complete: true, values: good.values }]) expect(() => parseRecipePlcCapture(value, catalog.schemas[0], revision)).toThrow();
  });
  it("accepts only schema-scoped revision-bound queries", () => {
    expect(parseRecipePlcQuery({ schemaId: "s", expectedRevision: revision })).toEqual({ schemaId: "s", expectedRevision: revision });
    for (const value of [{ schemaId: "s" }, { schemaId: "s", expectedRevision: revision, tag: "N" }, { schemaId: "../x", expectedRevision: revision }]) expect(() => parseRecipePlcQuery(value)).toThrow();
  });
});
