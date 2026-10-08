import { describe, expect, it } from "vitest";
import { validateOpcUaConnection, validateConnectionCatalog } from "../runtime/connection-config.mjs";
import { newOpcUaConnection, defaultConnectionCatalog, parseConnectionConfiguration, serializeConnectionConfiguration } from "../src/core/plcConnections";

const variables = [{ name: "Motor.Speed", dataType: "Real", access: "read-write" as const }];
function config() { return { ...newOpcUaConnection([]), url: "opc.tcp://server.invalid:4840", securityMode: "None" as const, securityPolicy: "None" as const, allowInsecure: true,
  bindings: [{ tag: "Motor.Speed", namespaceUri: "urn:synthetic", nodeId: "s=Speed", writeEnabled: false }] }; }
describe("configurazione OPC UA condivisa e offline", () => {
  it("non inventa endpoint o nodi e parte sicura, disabilitata, senza comandi", () => {
    expect(newOpcUaConnection([])).toMatchObject({ protocol: "opcua", url: "", enabled: false, allowWrites: false, allowInsecure: false, securityMode: "SignAndEncrypt", securityPolicy: "Basic256Sha256", bindings: [] });
    expect(newOpcUaConnection([newOpcUaConnection([])]).id).not.toBe(newOpcUaConnection([]).id);
  });
  it.each([
    [{ url: "opc.tcp://server.invalid:0" }, "url"], [{ url: "opc.tcp://server.invalid" }, "url"], [{ url: "opc.tcp://user:password@server.invalid:4840" }, "url"],
    [{ allowInsecure: false }, "allowInsecure"], [{ usernameEnv: "USER", passwordEnv: "PASSWORD" }, "securityMode"], [{ usernameEnv: "VITE_USER" }, "usernameEnv"],
    [{ securityPolicy: "Basic128Rsa15" }, "securityPolicy"], [{ securityPolicy: "Basic256Sha256" }, "securityPolicy"], [{ readIntervalMs: 249 }, "readIntervalMs"],
    [{ timeoutMs: 60001 }, "timeoutMs"], [{ password: "SYNTHETIC_SECRET" }, "usernameEnv"], [{ pkiDirectory: "-----BEGIN CERTIFICATE-----" }, "pkiDirectory"],
  ])("rifiuta profilo invalido %j nel campo corretto", (patch, path) => {
    try { validateOpcUaConnection({ ...config(), ...patch }, variables, "connections.0."); throw new Error("Expected rejection"); }
    catch (error) { expect(error).toMatchObject({ path: "connections.0." + path }); expect(String(error)).not.toContain("SYNTHETIC_SECRET"); }
  });
  it.each(["ns=2;s=Speed", "i=4294967296", "i=-1", "g=invalid", "b=!", "s=", "s=bad\nname"])("rifiuta NodeId invalido %s", (nodeId) => {
    const c = config(); c.bindings[0].nodeId = nodeId; expect(() => validateOpcUaConnection(c, variables)).toThrow(/Identificatore nodo/);
  });
  it.each(["i=42", "s=Motor.Speed", "g=12345678-1234-1234-abcd-123456789012", "b=YWJj"])("accetta identificatore %s con namespace separato", (nodeId) => {
    const c = config(); c.bindings[0].nodeId = nodeId; expect(() => validateOpcUaConnection(c, variables)).not.toThrow();
  });
  it("il profilo sicuro richiede chiave, trust e URI senza auto downgrade", () => {
    const c = { ...config(), securityMode: "SignAndEncrypt", securityPolicy: "Basic256Sha256" };
    expect(() => validateOpcUaConnection(c, variables)).toThrow(/certificato/);
    expect(() => validateOpcUaConnection({ ...c, certificateFile: "client.der", privateKeyFile: "key.pem", pkiDirectory: "pki", applicationUri: "urn:framecraft:synthetic" }, variables)).not.toThrow();
  });
  it("blocca array, UDT e comandi su tag di sola lettura", () => {
    expect(() => validateOpcUaConnection(config(), [{ ...variables[0], dataType: "UDT" }])).toThrow(/scalare/);
    const c = config(); c.bindings[0].writeEnabled = true;
    expect(() => validateOpcUaConnection(c, [{ ...variables[0], access: "read" }])).toThrow(/lettura/);
  });
  it("non ammette due sorgenti attive sullo stesso tag tra MQTT e OPC UA", () => {
    const catalog = { ...defaultConnectionCatalog(), connections: [{ ...config(), enabled: true }, { id: "mqtt", protocol: "mqtt", enabled: true, url: "mqtts://broker.invalid", bindings: [{ tag: "Motor.Speed", topic: "speed" }] }] };
    expect(() => validateConnectionCatalog(catalog, variables)).toThrow(/due sorgenti/);
  });
  it("salva e riapre entrambi i profili senza rete né conversione del protocollo", () => {
    const catalog = { ...defaultConnectionCatalog(), connections: [config()] };
    const model = parseConnectionConfiguration({ generation: 1, files: { plc: JSON.stringify({ version: 1, variables }), runtime: null, connections: JSON.stringify(catalog) } });
    expect(JSON.parse(serializeConnectionConfiguration(model).connections).connections[0]).toEqual(config());
  });
});
