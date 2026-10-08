import { describe, expect, it } from "vitest";
import { diffHmiFaceplateTypes, faceplateMigrationSources, planHmiFaceplateMigration, selectedFaceplateBinding } from "../src/core/hmiFaceplateMigration";
import { parseHmiFaceplateBinding, serializeHmiFaceplateBinding } from "../src/core/hmiFaceplates";
import { migrationFixture } from "./fixtures/faceplateMigration";
import { parseSource } from "../src/source-parser/parseSource";

describe("migrazione assistita faceplate", () => {
  it("legge solo literal e guardie sull’indice, senza eseguire espressioni arbitrarie", () => {
    const f = migrationFixture();
    const source = `export const Page=({items})=><main>{items.map((item,index)=><div data-hmi-faceplate={index === 1 ? ${JSON.stringify(serializeHmiFaceplateBinding(f.binding))} : dangerous()} />)}</main>`;
    const document = parseSource("Page.tsx", source), node = Object.values(document.nodes).find((item) => item.type === "div")!;
    expect(selectedFaceplateBinding(document, node, { instanceIndex: 1 })).toMatchObject(f.binding);
    expect(selectedFaceplateBinding(document, node, { instanceIndex: 0 })).toBeUndefined();
    expect(selectedFaceplateBinding(document, node, { instanceIndex: Number.NaN })).toBeUndefined();
    expect(selectedFaceplateBinding(document, node)).toBeUndefined();
  });
  it("conserva tag, proprietà e script compatibili senza mutare i dati originari", () => {
    const fixture = migrationFixture(); const original = structuredClone(fixture);
    fixture.after.interfaceProperties[0].defaultValue = "New default";
    const plan = planHmiFaceplateMigration(fixture.binding, fixture.catalog, fixture.targetKey, fixture.variables);
    expect(plan.binding).toEqual({ ...fixture.binding, version: "1.0.1" });
    expect(plan.losses).toEqual([]); expect(plan.issues).toEqual([]);
    expect(fixture.binding).toEqual(original.binding); expect(fixture.before).toEqual(original.before);
    expect(parseHmiFaceplateBinding(serializeHmiFaceplateBinding(plan.binding!))).toMatchObject(plan.binding!);
  });
  it("mostra aggiunte, rimozioni, tipi, grafica, locali, annidamenti e dimensioni", () => {
    const { before, after } = migrationFixture();
    after.interfaceTags = [{ name: "Ready", dataType: "Bool" }];
    after.interfaceEvents[0].parameters[0].dataType = "Real";
    after.localTags[0].startValue = "true"; after.width = 300;
    after.visualization = [{ id: "Label", type: "text", left: 0, top: 0, width: 100, height: 20, text: "Motor", bindings: [] }];
    after.nestedInstances = [{ id: "Child", typeId: "inner", version: "1.0.0", left: 0, top: 0, width: 80, height: 80, tagBindings: {}, propertyBindings: {} }];
    expect(diffHmiFaceplateTypes(before, after)).toEqual(expect.arrayContaining([
      { section: "Tag", name: "Running", kind: "removed" }, { section: "Tag", name: "Ready", kind: "added" },
      { section: "Eventi", name: "Start", kind: "changed" }, { section: "Tag locali", name: "Selected", kind: "changed" },
      { section: "Oggetti visuali", name: "Label", kind: "added" }, { section: "Faceplate annidati", name: "Child", kind: "added" },
      { section: "Dimensioni", name: "240 × 120 → 300 × 120", kind: "changed" },
    ].map((change) => expect.objectContaining(change))));
    expect(diffHmiFaceplateTypes(before, after).find((change) => change.section === "Eventi")).toMatchObject({ before: "Start(speed: Int)", after: "Start(speed: Real)" });
  });
  it("rimappa campi rinominati soltanto con scelta esplicita compatibile", () => {
    const f = migrationFixture(); f.after.interfaceTags[0].name = "Ready"; f.after.interfaceProperties[0].name = "Label"; f.after.interfaceEvents[0].name = "Run";
    const automatic = planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey, f.variables);
    expect(automatic.losses.map((item) => item.name)).toEqual(["Running", "Caption", "Start"]);
    expect(automatic.issues).toContainEqual({ severity: "error", message: "Collega il tag obbligatorio «Ready»." });
    const remapped = planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey, f.variables, { tagSources: { Ready: "Running" }, propertySources: { Label: "Caption" }, eventSources: { Run: "Start" } });
    expect(remapped.binding).toMatchObject({ tagBindings: { Ready: "Motor.Running" }, propertyValues: { Label: "M2400" }, eventBindings: { Run: { script: "HMIRuntime.Trace(speed);" } } });
    expect(remapped.losses).toEqual([]); expect(remapped.issues).toEqual([]);
  });
  it("non trasferisce automaticamente dati a un tipo diverso con nomi coincidenti", () => {
    const f = migrationFixture(); f.after.id = "other"; f.after.name = "Other";
    const plan = planHmiFaceplateMigration(f.binding, f.catalog, "other@1.0.1", f.variables);
    expect(plan.binding?.tagBindings).toEqual({}); expect(plan.binding?.propertyValues.Caption).toBe("Motor");
    expect(plan.binding?.eventBindings).toEqual({}); expect(plan.losses).toHaveLength(4);
    expect(plan.issues.some((issue) => issue.message.includes("sostituendo il tipo"))).toBe(true);
  });
  it.each(["name", "dataType"] as const)("non riutilizza uno script se cambia %s di un parametro", (field) => {
    const f = migrationFixture(); if (field === "name") f.after.interfaceEvents[0].parameters[0].name = "velocity"; else f.after.interfaceEvents[0].parameters[0].dataType = "Real";
    expect(faceplateMigrationSources(f.before, f.after, "event", "Start")).toEqual([]);
    const plan = planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey);
    expect(plan.binding?.eventBindings).toEqual({}); expect(plan.losses).toEqual([{ kind: "event", name: "Start" }]);
    expect(planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey, [], { eventSources: { Start: "Start" } }).issues.some((issue) => issue.severity === "error")).toBe(true);
  });
  it("rifiuta mapping tra tipi diversi, tag PLC incompatibili e obbligatori mancanti", () => {
    const f = migrationFixture(); f.after.interfaceTags[0].dataType = "Int";
    expect(planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey, f.variables, { tagSources: { Running: "Running" } }).issues.some((issue) => issue.severity === "error")).toBe(true);
    const invalid = planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey, f.variables, { tagValues: { Running: "Motor.Running" } });
    expect(invalid.issues.some((issue) => issue.message.includes("richiede Int"))).toBe(true);
    expect(planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey).binding?.tagBindings).toEqual({});
  });
  it("elenca campi rimossi o sostituiti, anche configurazioni orfane", () => {
    const f = migrationFixture(); f.binding.tagBindings.Orphan = "Old.Tag"; f.after.interfaceProperties = [];
    const plan = planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey, [], { tagValues: { Running: "Other.Running" } });
    expect(plan.losses).toEqual([{ kind: "tag", name: "Running" }, { kind: "tag", name: "Orphan" }, { kind: "property", name: "Caption" }, { kind: "property", name: "Enabled" }]);
    expect(plan.binding?.propertyValues).toEqual({});
  });
  it("usa nuovi default senza trasformare 64 bit in Number", () => {
    const f = migrationFixture(); f.after.interfaceProperties.push({ name: "Counter", dataType: "UInt64", defaultValue: "18446744073709551615" });
    const plan = planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey);
    expect(plan.binding?.propertyValues.Counter).toBe("18446744073709551615"); expect(plan.issues).toEqual([]);
    for (const value of ["18446744073709551616", -1, Number.MAX_SAFE_INTEGER + 1, "9".repeat(5000)]) expect(planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey, [], { propertyValues: { Counter: value } }).issues.some((issue) => issue.severity === "error")).toBe(true);
  });
  it("controlla Bool e numeri finiti", () => {
    const f = migrationFixture(); f.after.interfaceProperties.push({ name: "Speed", dataType: "LReal" });
    const plan = planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey, [], { propertyValues: { Enabled: "false", Speed: "NaN" } });
    expect(plan.issues.filter((issue) => issue.severity === "error")).toHaveLength(2);
  });
  it("non applica release mancanti, bozze, versioni già attive o cataloghi invalidi", () => {
    const f = migrationFixture();
    for (const key of ["unknown@1.0.0", "motor@1.0.0"]) expect(planHmiFaceplateMigration(f.binding, f.catalog, key).binding).toBeUndefined();
    f.after.status = "draft"; expect(planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey).binding).toBeUndefined();
    f.after.status = "released"; f.after.interfaceProperties[0].name = "Running";
    expect(planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey).issues.some((issue) => issue.message.includes("usato più volte"))).toBe(true);
    expect(planHmiFaceplateMigration({ ...f.binding, version: "missing" }, f.catalog, f.targetKey).binding).toBeUndefined();
  });
  it("gestisce nomi speciali senza leggere o cambiare il prototipo", () => {
    const f = migrationFixture(); f.before.interfaceProperties.push({ name: "__proto__", dataType: "ConfigurationString" }, { name: "constructor", dataType: "ConfigurationString" });
    f.after.interfaceProperties = structuredClone(f.before.interfaceProperties);
    f.binding.propertyValues = JSON.parse('{"__proto__":"safe","constructor":"own"}');
    const plan = planHmiFaceplateMigration(f.binding, f.catalog, f.targetKey);
    expect(Object.getPrototypeOf(plan.binding!.propertyValues)).toBeNull();
    expect(JSON.parse(serializeHmiFaceplateBinding(plan.binding!)).propertyValues).toMatchObject({ ["__proto__"]: "safe", constructor: "own" });
    expect(plan.losses).toEqual([]);
  });
});
