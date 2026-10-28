import { describe, expect, it } from "vitest";
import { opcUaStandardNamespace, type OpcUaBrowseNode } from "../runtime/opcua-browse-policy.mjs";
import { opcUaBrowseUnavailable, opcUaNodeAccepts, prepareOpcUaMapping } from "../src/core/opcUaBrowser";
import { defaultConnectionCatalog, newOpcUaConnection, parseConnectionConfiguration, serializeConnectionConfiguration, type ConnectionConfigurationSnapshot } from "../src/core/plcConnections";

const ns = "urn:framecraft:synthetic-mapping";
function fixture() {
  const profile = { ...newOpcUaConnection([]), enabled: true, url: "opc.tcp://synthetic.invalid:4840", securityMode: "None", securityPolicy: "None", allowInsecure: true, allowWrites: true };
  const variables = [{ name: "Old.Speed", dataType: "Real", access: "read-write", address: "%existing", description: "Keep", vendorMetadata: { scale: 0.1 } }];
  const snapshot: ConnectionConfigurationSnapshot = { generation: 7, files: {
    connections: JSON.stringify({ ...defaultConnectionCatalog(), custom: { keep: true }, connections: [profile] }),
    runtime: null, plc: JSON.stringify({ version: 1, locale: "it", custom: { keep: true }, variables }),
  } };
  const node: OpcUaBrowseNode = { target: { namespaceUri: ns, nodeId: "s=Speed" }, browseName: "Speed", displayName: "Speed", nodeClass: "Variable",
    dataType: { namespaceUri: opcUaStandardNamespace, nodeId: "i=10" }, valueRank: -1, arrayDimensions: [], readable: true, writable: true, supportedDataType: "Real", issues: [] };
  return { snapshot, node, model: parseConnectionConfiguration(snapshot) };
}
describe("reviewable OPC UA mapping draft", () => {
  it("adds an explicitly named variable, preserving all existing definitions and root metadata", () => {
    const { model, snapshot, node } = fixture(), before = structuredClone(model);
    const result = prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name: "  Motor.Speed  ", dataType: "Real", access: "read" });
    expect(model).toEqual(before); expect(result.created).toBe(true);
    expect(result.variable).toEqual({ name: "Motor.Speed", dataType: "Real", access: "read", address: "", description: "", connection: "opcua-1" });
    expect(result.binding).toEqual({ tag: "Motor.Speed", namespaceUri: ns, nodeId: "s=Speed", writeEnabled: false, staleAfterMs: 5000 });
    const files = serializeConnectionConfiguration(result.model), plc = JSON.parse(files.plc!);
    expect(plc.variables[0]).toEqual(model.variables[0]); expect(plc.custom).toEqual({ keep: true }); expect(plc.locale).toBe("it");
    expect(JSON.parse(files.connections).custom).toEqual({ keep: true });
    expect(result.model.catalog.connections[0].allowWrites).toBe(true); expect(result.model.catalog.gateway.allowWrites).toBe(false);
    expect(result.model.runtime.gateway.enabled).toBe(false);
    expect(parseConnectionConfiguration({ generation: 7, files: { ...snapshot.files, ...files } }).variables).toEqual(plc.variables);
  });
  it("accumulates several imports before a single explicit save, without mutating prior reviews", () => {
    const { model, snapshot, node } = fixture();
    const first = prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name: "A", dataType: "Real", access: "read" });
    node.target!.nodeId = "s=Other";
    const second = prepareOpcUaMapping(first.model, snapshot, 0, node, { mode: "create", name: "B", dataType: "Real", access: "read-write" });
    expect(first.model.variables).toHaveLength(2); expect(second.model.variables).toHaveLength(3);
    second.model.catalog.connections[0].bindings[0].tag = "Mutated only second";
    expect(first.model.catalog.connections[0].bindings[0].tag).toBe("A");
    expect(JSON.parse(second.model.plcSource!).variables.map((v: { name: string }) => v.name)).toEqual(["Old.Speed", "A", "B"]);
  });
  it("creates a missing catalog but leaves an existing catalog untouched for mapping-only changes", () => {
    const { model, snapshot, node } = fixture();
    const mapped = prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "Old.Speed" });
    expect(mapped.model.variables).toEqual(model.variables); expect(serializeConnectionConfiguration(mapped.model)).not.toHaveProperty("plc");
    snapshot.files.plc = null; const empty = parseConnectionConfiguration(snapshot);
    const created = prepareOpcUaMapping(empty, snapshot, 0, node, { mode: "create", name: "First", dataType: "Real", access: "read" });
    expect(JSON.parse(serializeConnectionConfiguration(created.model).plc!)).toMatchObject({ version: 1, variables: [{ name: "First" }] });
  });
  it("preserves a legacy existing Unicode name rather than applying the stricter new-name rule", () => {
    const { model, snapshot, node } = fixture(); model.variables[0].name = "Velocità motore";
    expect(prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "Velocità motore" }).binding.tag).toBe("Velocità motore");
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name: "Nuova velocità", dataType: "Real", access: "read" })).toThrow(/nome locale/);
  });
  it("reviews replacement metadata, keeps staleness/extensions and explicitly turns off commands", () => {
    const { model, snapshot, node } = fixture(); const connection = model.catalog.connections[0];
    if (connection.protocol !== "opcua") throw Error("fixture");
    const old = { tag: "Old.Speed", namespaceUri: ns, nodeId: "s=Old", staleAfterMs: 1700, writeEnabled: true, custom: { keep: true } };
    connection.bindings.push(old);
    const result = prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "Old.Speed" });
    expect(result.previous).toEqual(old); expect(result.binding).toMatchObject({ nodeId: "s=Speed", staleAfterMs: 1700, writeEnabled: false, custom: { keep: true } });
    expect(connection.bindings[0].writeEnabled).toBe(true); expect(result.model.catalog.connections[0].bindings).toHaveLength(1);
    expect(() => prepareOpcUaMapping(result.model, snapshot, 0, node, { mode: "existing", name: "Old.Speed" })).toThrow(/già nella bozza/);
  });
  it("compares saved connection settings independent of JSON property order but excludes mapping drafts", () => {
    const { model, snapshot, node } = fixture(); const original = model.catalog.connections[0];
    model.catalog.connections[0] = Object.fromEntries(Object.entries(original).reverse()) as typeof original;
    expect(opcUaBrowseUnavailable(model, snapshot, 0)).toBeUndefined();
    expect(prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "Old.Speed" })).toBeDefined();
  });
  it.each(["url", "enabled", "allowWrites", "allowInsecure", "securityMode", "pkiDirectory", "timeoutMs"])("requires saving a changed profile field: %s", key => {
    const { model, snapshot, node } = fixture(); Object.assign(model.catalog.connections[0], { [key]: key === "enabled" ? false : "changed" });
    expect(opcUaBrowseUnavailable(model, snapshot, 0)).toBeTruthy();
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "Old.Speed" })).toThrow();
  });
  it("rejects a new/unknown profile, invalid snapshot and out-of-range selection", () => {
    const { model, snapshot } = fixture(); model.catalog.connections[0].id = "unsaved";
    expect(opcUaBrowseUnavailable(model, snapshot, 0)).toMatch(/nuova connessione/);
    expect(opcUaBrowseUnavailable(model, snapshot, 9)).toBeTruthy(); snapshot.files.connections = "broken";
    expect(opcUaBrowseUnavailable(model, snapshot, 0)).toMatch(/Ricarica/);
  });
  it.each(["", "1Wrong", "bad\nname", "x".repeat(201)])("rejects new name %j without changing the draft", name => {
    const { model, snapshot, node } = fixture(), before = JSON.stringify(model);
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name, dataType: "Real", access: "read" })).toThrow(/nome locale/);
    expect(JSON.stringify(model)).toBe(before);
  });
  it("does not invent suffixes, addresses, types or permission conversions", () => {
    const { model, snapshot, node } = fixture();
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name: "Old.Speed", dataType: "Real", access: "read" })).toThrow(/nome esiste/);
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name: "X", dataType: "LReal", access: "read" })).toThrow(/tipo scalare/);
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "Missing" })).toThrow(/compatibili/);
    node.writable = false;
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "Old.Speed" })).toThrow(/compatibili/);
    expect(prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name: "X", dataType: "Real", access: "read" }).variable.access).toBe("read");
  });
  it("allows an explicit write-only variable only with known write access; it still disables commands", () => {
    const { model, snapshot, node } = fixture(); node.readable = false;
    const result = prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name: "Command", dataType: "Real", access: "write" });
    expect(result.variable.access).toBe("write"); expect(result.binding.writeEnabled).toBe(false);
    expect(opcUaNodeAccepts(node, { dataType: "Real", access: "read-write" })).toBe(false);
  });
  it.each(["Bool", "SInt", "USInt", "Int", "UInt", "DInt", "UDInt", "Real", "LReal", "String", "WString"])("creates only the detected built-in scalar %s", dataType => {
    const { model, snapshot, node } = fixture();
    const id: Record<string, string> = { Bool: "i=1", SInt: "i=2", USInt: "i=3", Int: "i=4", UInt: "i=5", DInt: "i=6", UDInt: "i=7", Real: "i=10", LReal: "i=11", String: "i=12", WString: "i=12" };
    node.dataType!.nodeId = id[dataType]; node.supportedDataType = (dataType === "WString" ? "String" : dataType) as typeof node.supportedDataType;
    expect(prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name: "New", dataType, access: "read" }).variable.dataType).toBe(dataType);
  });
  it.each([
    { target: null }, { nodeClass: "Method" }, { valueRank: 1 }, { arrayDimensions: [2] }, { issues: ["metadata"] },
    { readable: null }, { writable: null }, { supportedDataType: null }, { dataType: { namespaceUri: ns, nodeId: "i=10" } },
    { dataType: { namespaceUri: opcUaStandardNamespace, nodeId: "i=11" } },
  ])("refuses ambiguous, remote, complex or incompatible node metadata %j", patch => {
    const { model, snapshot, node } = fixture(); Object.assign(node, patch);
    expect(opcUaNodeAccepts(node, model.variables[0])).toBe(false);
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "Old.Speed" })).toThrow();
  });
  it("keeps an active foreign source until explicitly removed, while allowing disabled standby", () => {
    const { model, snapshot, node } = fixture(); const other = { ...structuredClone(model.catalog.connections[0]), id: "Other", bindings: [{ tag: "Old.Speed", namespaceUri: ns, nodeId: "s=Other" }] };
    model.catalog.connections.push(other);
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "Old.Speed" })).toThrow(/sorgente attiva/);
    other.enabled = false;
    expect(prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "Old.Speed" }).binding.writeEnabled).toBe(false);
  });
  it("rejects mismatched catalog draft and serialization rather than silently losing definitions", () => {
    const { model, snapshot, node } = fixture(); model.plcSource = '{"version":1,"variables":[]}';
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name: "New", dataType: "Real", access: "read" })).toThrow(/non è coerente/);
    expect(() => serializeConnectionConfiguration(model)).toThrow(/non corrisponde/);
  });
  it("rejects oversized catalog import without changing the original", () => {
    const { model, snapshot, node } = fixture(), root = { version: 1, variables: model.variables, large: "" };
    root.large = "x".repeat(4 * 1024 * 1024 - JSON.stringify(root).length - 10); snapshot.files.plc = JSON.stringify(root);
    expect(opcUaBrowseUnavailable(model, snapshot, 0)).toBeUndefined(); const before = JSON.stringify(model);
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name: "New", dataType: "Real", access: "read" })).toThrow(/oltre 4 MiB/);
    expect(JSON.stringify(model)).toBe(before);
  });
  it("caps new mappings at 5000 while still allowing explicit replacement", () => {
    const { model, snapshot, node } = fixture(), profile = model.catalog.connections[0];
    if (profile.protocol !== "opcua") throw Error("fixture");
    model.variables = Array.from({ length: 5001 }, (_, index) => ({ name: "T" + index, dataType: "Real", access: "read", address: "", description: "" }));
    profile.bindings = model.variables.slice(0, 5000).map(v => ({ tag: v.name, namespaceUri: ns, nodeId: "s=" + v.name }));
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "T5000" })).toThrow(/5000 mapping/);
    expect(prepareOpcUaMapping(model, snapshot, 0, node, { mode: "existing", name: "T0" }).model.catalog.connections[0].bindings).toHaveLength(5000);
  });
  it("caps new variables at 50000 without deleting existing definitions", () => {
    const { model, snapshot, node } = fixture();
    model.variables = Array.from({ length: 50000 }, (_, index) => ({ name: "T" + index, dataType: "Real", access: "read", address: "", description: "" }));
    expect(() => prepareOpcUaMapping(model, snapshot, 0, node, { mode: "create", name: "Extra", dataType: "Real", access: "read" })).toThrow(/50000 variabili/);
    expect(model.variables).toHaveLength(50000);
  });
});
