import { describe, expect, it } from "vitest";
import { ConnectionConfigurationError, validateConnectionCatalog, validateMqttConnection } from "../runtime/connection-config.mjs";
import { connectionConfigurationIssues, defaultConnectionCatalog, newMqttConnection, parseConnectionConfiguration, serializeConnectionConfiguration, type ConnectionConfigurationSnapshot } from "../src/core/plcConnections";

const variables = [{ name: "Motor.Speed", dataType: "Real", access: "read-write" as const, address: "", description: "" }];
function snapshot(): ConnectionConfigurationSnapshot {
  return { generation: 1, files: { connections: JSON.stringify({ ...defaultConnectionCatalog(), custom: { machine: "A" }, connections: [{ ...newMqttConnection([]), url: "mqtts://broker.invalid", bindings: [{ tag: variables[0].name, topic: "machine/speed", valuePath: "/value" }] }] }), runtime: JSON.stringify({ version: 1, custom: { keep: true }, gateway: { enabled: false, path: "/_framecraft/plc/v1", pollMs: 250 } }), plc: JSON.stringify({ version: 1, variables }) } };
}
describe("configurazione PLC condivisa editor/Runtime", () => {
  it("parte disabilitata e non inventa broker, origini o tag", () => {
    const model = parseConnectionConfiguration({ generation: 1, files: { connections: null, runtime: null, plc: null } });
    expect(model.catalog.gateway.enabled).toBe(false); expect(model.catalog.connections).toEqual([]); expect(model.catalog.gateway.allowedOrigins).toEqual([]); expect(model.variables).toEqual([]);
    expect(model.runtime.gateway.enabled).toBe(false); expect(connectionConfigurationIssues(model)).toEqual([]);
    expect(newMqttConnection([])).toMatchObject({ url: "", enabled: false, allowWrites: false, allowInsecure: false });
  });
  it("preserva metadati sconosciuti senza alterare il catalogo tag", () => {
    const input = snapshot(); const model = parseConnectionConfiguration(input); const serialized = serializeConnectionConfiguration(model);
    expect(JSON.parse(serialized.connections).custom).toEqual({ machine: "A" }); expect(JSON.parse(serialized.runtime).custom).toEqual({ keep: true }); expect(input.files.plc).toBe(JSON.stringify({ version: 1, variables }));
    expect(() => validateConnectionCatalog(JSON.parse(serialized.connections), variables, { includeDisabled: true })).not.toThrow();
  });
  it("carica il vecchio catalogo senza gateway con default espliciti", () => {
    const input = snapshot(); input.files.connections = '{"version":1,"connections":[]}'; expect(parseConnectionConfiguration(input).catalog.gateway).toEqual(defaultConnectionCatalog().gateway);
  });
  it.each([
    [{ url: "mqtt://broker.invalid" }, "allowInsecure"], [{ url: "https://broker.invalid" }, "url"], [{ url: "mqtts://user:secret@broker.invalid" }, "url"],
    [{ url: "mqtts://broker.invalid?token=secret" }, "url"], [{ usernameEnv: "VITE_USER" }, "usernameEnv"], [{ passwordEnv: "BAD NAME" }, "passwordEnv"],
    [{ reconnectMs: 249 }, "reconnectMs"], [{ timeoutMs: 60001 }, "timeoutMs"], [{ maxPayloadBytes: 0 }, "maxPayloadBytes"], [{ protocolVersion: 3 }, "protocolVersion"],
    [{ tls: { certificateFile: "client.pem" } }, "tls.privateKeyFile"], [{ tls: { caFile: "-----BEGIN CERTIFICATE-----" } }, "tls.caFile"],
  ])("segnala lo stesso campo invalido anche per connessioni disabilitate: %j", (patch, path) => {
    const model = parseConnectionConfiguration(snapshot()); Object.assign(model.catalog.connections[0], patch);
    expect(connectionConfigurationIssues(model)).toContainEqual(expect.objectContaining({ path: "connections.0." + path }));
    try { validateMqttConnection(model.catalog.connections[0], variables, "connections.0."); throw new Error("Expected rejection"); } catch (error) { expect(error).toBeInstanceOf(ConnectionConfigurationError); expect((error as ConnectionConfigurationError).path).toBe("connections.0." + path); }
    expect(() => serializeConnectionConfiguration(model)).toThrow();
  });
  it.each([
    [{ topic: "speed/+" }, "topic"], [{ writeTopic: "command/#" }, "writeTopic"], [{ valuePath: "value" }, "valuePath"], [{ valuePath: "/bad~escape" }, "valuePath"],
    [{ staleAfterMs: 249 }, "staleAfterMs"], [{ qos: 3 }, "qos"], [{ writeRetain: true }, "writeRetain"], [{ timestampUnit: "minutes" }, "timestampUnit"],
    [{ tag: "undeclared" }, "tag"], [{ encoding: "binary" }, "encoding"],
  ])("valida mapping e indirizzo del campo: %j", (patch, path) => {
    const model = parseConnectionConfiguration(snapshot()); Object.assign(model.catalog.connections[0].bindings[0], patch);
    expect(connectionConfigurationIssues(model)).toContainEqual(expect.objectContaining({ path: "connections.0.bindings.0." + path }));
  });
  it("rifiuta topic Unicode oltre il limite UTF-8 senza usare Buffer nel browser", () => {
    const model = parseConnectionConfiguration(snapshot()); model.catalog.connections[0].bindings[0].topic = "é".repeat(32768);
    expect(connectionConfigurationIssues(model)[0].path).toBe("connections.0.bindings.0.topic");
  });
  it("porta 0 è ammessa solo nel collaudo gateway, non nella configurazione UI", () => {
    const model = parseConnectionConfiguration(snapshot()); model.catalog.gateway.port = 0;
    expect(() => validateConnectionCatalog(model.catalog, variables, { allowEphemeralPort: true })).not.toThrow(); expect(connectionConfigurationIssues(model)[0].path).toBe("gateway.port");
  });
  it("rifiuta sorgenti duplicate attive ma permette standby disabilitati", () => {
    const model = parseConnectionConfiguration(snapshot()); const first = model.catalog.connections[0]; first.enabled = true;
    model.catalog.connections.push({ ...structuredClone(first), id: "standby", enabled: false }); expect(connectionConfigurationIssues(model)).toEqual([]);
    model.catalog.connections[1].enabled = true; expect(connectionConfigurationIssues(model).some((issue) => /due sorgenti/.test(issue.message))).toBe(true);
  });
  it("il client richiede gateway e mapping attivi; le scritture restano gate separati", () => {
    const model = parseConnectionConfiguration(snapshot()); model.runtime.gateway.enabled = true;
    expect(connectionConfigurationIssues(model).some((issue) => issue.path === "runtime.gateway.enabled")).toBe(true);
    model.catalog.gateway.enabled = true; model.catalog.connections[0].enabled = true; expect(connectionConfigurationIssues(model)).toEqual([]);
    const output = JSON.parse(serializeConnectionConfiguration(model).connections); expect(output.gateway.allowWrites).toBe(false); expect(output.connections[0].allowWrites).toBe(false);
  });
  it.each(["password", "username", "token", "privateKey", "credentials"])("rifiuta segreti inline prima che entrino nel form: %s", (key) => {
    const input = snapshot(); const raw = JSON.parse(input.files.connections!); raw.connections[0][key] = "NEVER_RENDER_SECRET"; input.files.connections = JSON.stringify(raw);
    expect(() => parseConnectionConfiguration(input)).toThrow(/inline/); try { parseConnectionConfiguration(input); } catch (error) { expect(String(error)).not.toContain("NEVER_RENDER_SECRET"); }
  });
  it("non mostra segreti neppure dentro un errore di sintassi JSON", () => {
    const input = snapshot(); input.files.connections = '{"password":"NEVER_RENDER_SECRET';
    try { parseConnectionConfiguration(input); throw new Error("Expected rejection"); } catch (error) { expect(String(error)).toContain("JSON non valido"); expect(String(error)).not.toContain("NEVER_RENDER_SECRET"); }
  });
  it.each([null, 9, {}, [9], "a"].map((origins) => ({ origins })))("rifiuta allowedOrigins di forma sbagliata senza crash nel rendering: %j", ({ origins }) => {
    const input = snapshot(); const raw = JSON.parse(input.files.connections!); raw.gateway.allowedOrigins = origins; input.files.connections = JSON.stringify(raw); expect(() => parseConnectionConfiguration(input)).toThrow(/gateway/);
  });
  it("non modifica profili OPC UA o versioni non supportate", () => {
    const input = snapshot(); const raw = JSON.parse(input.files.connections!); raw.connections[0].protocol = "opcua"; input.files.connections = JSON.stringify(raw);
    expect(() => parseConnectionConfiguration(input)).toThrow(/OPC UA/); input.files.connections = '{"version":2,"connections":[]}'; expect(() => parseConnectionConfiguration(input)).toThrow(/versione/);
  });
  it("normalizza solo spazi/righe vuote nelle origini, mantenendo origini esatte", () => {
    const model = parseConnectionConfiguration(snapshot()); model.catalog.gateway.allowedOrigins = [" https://hmi.invalid ", ""];
    expect(JSON.parse(serializeConnectionConfiguration(model).connections).gateway.allowedOrigins).toEqual(["https://hmi.invalid"]);
    model.catalog.gateway.allowedOrigins = ["https://hmi.invalid/path"]; expect(connectionConfigurationIssues(model)[0].path).toBe("gateway.allowedOrigins");
  });
});
