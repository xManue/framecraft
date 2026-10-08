import { type HmiFaceplateCatalog, type HmiFaceplateInstanceBinding, type HmiFaceplateTypeDefinition } from "../../src/core/hmiFaceplates";

export function migrationFixture() {
  const before: HmiFaceplateTypeDefinition = {
    id: "motor", name: "Motor", version: "1.0.0", status: "released", width: 240, height: 120,
    interfaceTags: [{ name: "Running", dataType: "Bool", required: true }],
    interfaceProperties: [{ name: "Caption", dataType: "ConfigurationString", defaultValue: "Motor" }, { name: "Enabled", dataType: "Bool", defaultValue: false }],
    interfaceEvents: [{ name: "Start", parameters: [{ name: "speed", dataType: "Int" }] }],
    localTags: [{ name: "Selected", dataType: "Bool", startValue: "false" }], visualization: [], nestedInstances: [],
  };
  const after: HmiFaceplateTypeDefinition = structuredClone({ ...before, version: "1.0.1" });
  const binding: HmiFaceplateInstanceBinding = { typeId: before.id, version: before.version, tagBindings: { Running: "Motor.Running" }, propertyValues: { Caption: "M2400", Enabled: true }, eventBindings: { Start: { script: "HMIRuntime.Trace(speed);" } } };
  const catalog: HmiFaceplateCatalog = { version: 1, types: [before, after] };
  const variables = [{ name: "Motor.Running", dataType: "Bool", address: "", description: "", access: "read" as const }];
  return { before, after, binding, catalog, variables, targetKey: "motor@1.0.1" };
}
