// @vitest-environment node
import { mkdir, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { OPCUAServer } from "node-opcua-server";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import { DataType, Variant, DataValue, StatusCodes, MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { openDataLogStore } from "../runtime/data-log-store.mjs";
import { dataLogDefinitionKey, type ServiceDataLogs } from "../runtime/data-log.mjs";

it("archivia un nodo OPC UA reale e le sue transizioni di qualità senza scriverlo", async () => {
  await mkdir(path.resolve(".hmi-preview"), { recursive: true }); const root = await mkdtemp(path.resolve(".hmi-preview/data-log-opcua-")), probe = createServer(); await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const manager = new OPCUACertificateManager({ rootFolder: path.join(root, "server-pki"), automaticallyAcceptUnknownCertificate: false, disableFileWatchers: true }); await manager.initialize();
  const server = new OPCUAServer({ host: "127.0.0.1", hostname: "127.0.0.1", port, serverCertificateManager: manager, securityModes: [MessageSecurityMode.None], securityPolicies: [SecurityPolicy.None], allowAnonymous: true, serverInfo: { applicationUri: "urn:framecraft:data-log-synthetic-server" } });
  const catalog: ServiceDataLogs = { version: 1, projectKey: "synthetic", logs: [{ id: "process", name: "Processo", enabled: true, storage: "runtime", retentionMs: 60000, maxEntries: 1000, segmentDurationMs: 60000, tags: [{ id: "value", name: "Valore", tag: "Value", mode: "on-change", cycleMs: 500, includeUnchanged: false, smoothingSamples: 1, aggregation: "none", aggregationWindowMs: 1000 }] }] };
  let value = 10, quality = StatusCodes.Good, writes = 0, gateway: ReturnType<typeof createPlcGateway> | undefined, store: ReturnType<typeof openDataLogStore> | undefined;
  try {
    await server.initialize(); const space = server.engine.addressSpace!, ns = space.registerNamespace("urn:framecraft:data-log-qa"); ns.addVariable({ organizedBy: space.rootFolder.objects, browseName: "Value", nodeId: "s=Value", dataType: "Double", valueRank: -1, minimumSamplingInterval: 100, accessLevel: "CurrentRead | CurrentWrite", value: { timestamped_get: () => new DataValue({ value: new Variant({ dataType: DataType.Double, value }), statusCode: quality, sourceTimestamp: new Date(Date.now() - 10000) }), timestamped_set: (_data, callback) => { writes++; callback(null, StatusCodes.BadNotWritable); } } }); await server.start();
    const url = server.endpoints[0].endpointDescriptions().find(endpoint => endpoint.securityMode === MessageSecurityMode.None)!.endpointUrl!; store = openDataLogStore({ root, namespace: randomUUID(), catalog });
    gateway = createPlcGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "SYNTHETIC_DATA_LOG_UA_TOKEN", allowedOrigins: ["http://localhost:1420"], allowWrites: false }, connections: [{ id: "opcua-qa", protocol: "opcua", enabled: true, url, allowInsecure: true, allowWrites: false, securityMode: "None", securityPolicy: "None", pkiDirectory: path.join(root, "client-pki"), readIntervalMs: 250, samplingIntervalMs: 250, bindings: [{ tag: "Value", namespaceUri: "urn:framecraft:data-log-qa", nodeId: "s=Value", staleAfterMs: 2000 }] }] }, [{ name: "Value", dataType: "LREAL", access: "read" }], { resolveSecret: () => "synthetic_data_log_opcua_token_01234567890123456789", dataLogCatalog: catalog, dataLogStore: store });
    const query = { logId: "process", loggedTagId: "value", definition: dataLogDefinitionKey(catalog.logs[0], catalog.logs[0].tags[0]), from: Date.now() - 60000, to: Date.now() + 60000 }; await gateway.start(); await vi.waitFor(() => expect(store!.query(query).samples.some(s => s.value === "10" && s.qualityCode === 192)).toBe(true), { timeout: 5000 });
    value = 20; await vi.waitFor(() => expect(store!.query(query).samples.at(-1)).toMatchObject({ value: "20", qualityCode: 192 })); quality = StatusCodes.BadOutOfService; await vi.waitFor(() => expect(store!.query(query).samples.at(-1)?.qualityCode).toBe(0)); const sample = store.query(query).samples[0]; expect(sample.sourceTimestamp).toBeLessThan(sample.time - 5000); expect(gateway.snapshot().dataLogs?.state).toBe("recording"); expect(writes).toBe(0);
  } finally { await gateway?.stop(); store?.close(); await server.shutdown(0); await manager.dispose(); }
}, 30000);
