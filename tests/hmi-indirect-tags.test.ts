import { describe, expect, it } from "vitest";
import { hmiIndirectBindingIssue, resolveHmiTagDynamization, resolveHmiTagReference } from "../src/core/hmiTagBinding";
import { parseHmiDynamizations, serializeHmiDynamizations } from "../src/core/hmiDynamizations";
import { simulationCommands } from "../src/core/plcSimulation";
import { validateHmiProject } from "../src/core/hmiValidation";
import type { PlcVariableDefinition } from "../src/core/plcVariables";
import { detectPlcVariables, plcTagsInSource, renamePlcVariableUsage } from "../src/core/plcVariables";

const definition = (name: string, dataType = "REAL", access: PlcVariableDefinition["access"] = "read"): PlcVariableDefinition => ({ name, dataType, access, address: "test", description: "" });
const selector = definition("Selected", "WSTRING", "read-write"), first = definition("Motor1.Temperature"), second = definition("Motor2.Temperature");
const catalog = [selector, first, second];
const binding = { property: "ProcessValue", kind: "Tag" as const, tag: "Selected", indirect: true, indirectDataType: "REAL", conditionType: "None" as const };
const values = { Selected: first.name, [first.name]: "21", [second.name]: "32" };

describe("indirizzamento indiretto Unified", () => {
  it("rileva e rinomina il selettore nelle dinamiche senza sostituire il testo di script o condizioni", () => {
    const source = `<output data-hmi-dynamizations='${serializeHmiDynamizations([binding, { property: "Text", kind: "Script", source: 'return "Selected";' }])}'/>`;
    expect(detectPlcVariables({ "Page.tsx": source }).map((tag) => tag.name)).toEqual(["Selected"]);
    expect(plcTagsInSource(source)).toEqual(["Selected"]);
    const renamed = renamePlcVariableUsage(source, "Selected", "Selected&Next");
    expect(plcTagsInSource(renamed)).toEqual(["Selected&Next"]);
    expect(renamed).toContain('return \\"Selected\\";');
    expect(renamed).toContain('"indirect":true');
    expect(detectPlcVariables({ "Bad.tsx": `<div data-hmi-dynamizations='bad'/>` })).toEqual([]);
  });
  it("conserva flag e tipo in JSX e rimuove flag non booleani o su altre sorgenti", () => {
    expect(parseHmiDynamizations(serializeHmiDynamizations([binding]))).toEqual([binding]);
    expect(parseHmiDynamizations([{ ...binding, indirect: "true" }])[0].indirect).toBeUndefined();
    expect(parseHmiDynamizations([{ ...binding, kind: "Expression" }])[0].indirect).toBeUndefined();
  });
  it("risolve un nome dichiarato e mantiene separate letture dirette e indirette dello stesso selettore", () => {
    expect(resolveHmiTagReference(binding, values, catalog)).toEqual({ tag: first.name, value: "21", dependencies: ["Selected", first.name] });
    expect(resolveHmiTagReference({ ...binding, indirect: false }, values, catalog)).toMatchObject({ tag: "Selected", value: first.name });
    expect(resolveHmiTagReference(binding, { ...values, Selected: second.name }, catalog)).toMatchObject({ tag: second.name, value: "32" });
  });
  it.each([
    ["catalogo assente", [], binding, values, "dichiarato"],
    ["duplicato", [...catalog, selector], binding, values, "una sola volta"],
    ["rilevato non dichiarato", [{ ...selector, detected: true }, first], binding, values, "dichiarato"],
    ["tipo selettore", [{ ...selector, dataType: "STRING" }, first], binding, values, "WSTRING"],
    ["accesso selettore", [{ ...selector, access: "write" }, first], binding, values, "sola scrittura"],
    ["tipo richiesto mancante", catalog, { ...binding, indirectDataType: "" }, values, "Scegli il tipo"],
    ["vuoto", catalog, binding, { ...values, Selected: "" }, "vuoto"],
    ["nome troppo lungo", catalog, binding, { ...values, Selected: "a".repeat(201) }, "troppo lungo"],
    ["nome non dichiarato", catalog, binding, { ...values, Selected: "Unknown" }, "unico tag dichiarato"],
    ["maiuscole diverse", catalog, binding, { ...values, Selected: "motor1.Temperature" }, "unico tag dichiarato"],
    ["autoreferenziale", catalog, binding, { ...values, Selected: "Selected" }, "sé stesso"],
    ["duplicata destinazione", [...catalog, first], binding, values, "unico tag dichiarato"],
    ["tipo diverso", [selector, { ...first, dataType: "DINT" }], binding, values, "non è REAL"],
    ["destinazione non leggibile", [selector, { ...first, access: "write" }], binding, values, "sola scrittura"],
    ["valore assente", catalog, binding, { Selected: first.name }, "non ha ancora"],
  ])("blocca %s con una spiegazione utilizzabile", (_name, tags, config, input, message) => {
    expect(resolveHmiTagReference(config, input, tags as PlcVariableDefinition[])).toMatchObject({ reason: expect.stringContaining(message) });
  });
  it.each([0, 64, -1, 65_728])("blocca qualità %s di selettore e destinazione senza riprendere il vecchio valore", (qualityCode) => {
    for (const tag of ["Selected", first.name]) expect(resolveHmiTagReference(binding, values, catalog, { [tag]: { qualityCode } })).toHaveProperty("reason");
  });
  it("richiede qualità conosciuta in modalità PLC reale e accetta Good 128/192", () => {
    expect(resolveHmiTagReference(binding, values, catalog, {}, true)).toHaveProperty("reason");
    for (const qualityCode of [128, 192]) expect(resolveHmiTagReference(binding, values, catalog, { Selected: { qualityCode }, [first.name]: { qualityCode } }, true)).toMatchObject({ value: "21" });
    expect(resolveHmiTagReference(binding, values, catalog, { Selected: { qualityCode: 192, qualityKnown: false } })).toHaveProperty("reason");
    expect(resolveHmiTagReference(binding, values, catalog, { Selected: { qualityCode: 192, lastError: 1 } })).toHaveProperty("reason");
  });
  it("non insegue catene o interpreta proprietà di oggetti JavaScript", () => {
    const textBinding = { ...binding, indirectDataType: "WSTRING" };
    expect(resolveHmiTagReference(textBinding, { Selected: "Other", Other: "Selected" }, [selector, definition("Other", "WSTRING")])).toMatchObject({ tag: "Other", value: "Selected" });
    expect(resolveHmiTagReference(binding, { Selected: "constructor" }, [selector, definition("constructor")])).toMatchObject({ reason: expect.stringContaining("non ha ancora") });
    const own = Object.assign(Object.create(null), { Selected: "__proto__", __proto__: "wrong" });
    Object.defineProperty(own, "__proto__", { value: "42", enumerable: true });
    expect(resolveHmiTagReference(binding, own, [selector, definition("__proto__")])).toMatchObject({ value: "42" });
    expect(resolveHmiTagReference(binding, { Selected: "window.location" }, catalog)).toHaveProperty("reason");
  });
  it("applica la stessa conversione dopo la risoluzione in prova e nel Runtime", () => {
    const config = { ...binding, property: "BackColor", conditionType: "Range" as const, entries: [{ from: 0, to: 25, value: "#ff0000" }, { from: 26, to: 40, value: "#00ff00" }] };
    expect(resolveHmiTagDynamization(config, values, catalog)).toMatchObject({ value: "#ff0000" });
    const result = simulationCommands([{ instanceId: "field", dynamizations: [binding, config] }], values, undefined, undefined, undefined, undefined, undefined, undefined, undefined, catalog);
    expect(result).toMatchObject({ commands: [{ instanceId: "field", text: "21", style: { backgroundColor: "#ff0000" } }], unresolved: [] });
    expect(simulationCommands([{ instanceId: "field", dynamizations: [binding] }], { ...values, Selected: "Unknown" }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, catalog).commands).toEqual([{ instanceId: "field", style: {}, text: "—", readOnly: true }]);
    expect(resolveHmiTagDynamization({ ...binding, conditionType: "Expression", entries: [{ condition: "value > 20", value: "caldo" }] }, values, catalog)).toMatchObject({ value: "caldo" });
  });
  it("il controllo progetto segnala un selettore non WSTRING anche senza valori live", () => {
    const sources = { "Page.tsx": `<span data-hmi-dynamizations='${serializeHmiDynamizations([binding])}' />` };
    expect(validateHmiProject({ sources, variables: catalog })).toEqual([]);
    expect(validateHmiProject({ sources, variables: [{ ...selector, dataType: "INT" }] })).toEqual(expect.arrayContaining([expect.objectContaining({ severity: "error", message: expect.stringContaining("WSTRING") })]));
    expect(hmiIndirectBindingIssue({ ...binding, indirect: false }, [])).toBeUndefined();
  });
});
