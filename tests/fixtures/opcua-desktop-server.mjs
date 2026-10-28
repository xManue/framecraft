import readline from "node:readline";
import path from "node:path";
import { createServer } from "node:net";
console.log = console.info = console.warn = console.error = () => {};
const lines = readline.createInterface({ input: process.stdin });
const input = await new Promise(resolve => lines.once("line", line => resolve(JSON.parse(line))));
const { OPCUAServer } = await import("node-opcua-server");
const { OPCUACertificateManager } = await import("node-opcua-certificate-manager");
const { DataType, Variant, VariantArrayType, StatusCodes, MessageSecurityMode, SecurityPolicy } = await import("node-opcua-client");
const portFinder = createServer(); await new Promise(resolve => portFinder.listen(0, "127.0.0.1", resolve)); const port = portFinder.address().port; await new Promise(resolve => portFinder.close(resolve));
const manager = new OPCUACertificateManager({ rootFolder: path.join(input.root, "server-pki"), automaticallyAcceptUnknownCertificate: false, disableFileWatchers: true });
await manager.initialize();
const server = new OPCUAServer({ host: "127.0.0.1", hostname: "127.0.0.1", port, serverCertificateManager: manager, securityModes: [MessageSecurityMode.None], securityPolicies: [SecurityPolicy.None], allowAnonymous: true });
await server.initialize(); const space = server.engine.addressSpace, namespace = space.registerNamespace("urn:framecraft:synthetic-desktop"), folder = namespace.addObject({ organizedBy: space.rootFolder.objects, nodeId: "s=Plant", browseName: "Plant" });
let reads = 0, writes = 0, calls = 0;
for (let index = 0; index < 205; index++) namespace.addVariable({ organizedBy: folder, nodeId: "s=Speed" + index, browseName: "Speed" + index, dataType: "Float", valueRank: -1, minimumSamplingInterval: 100, accessLevel: "CurrentRead | CurrentWrite", userAccessLevel: "CurrentRead | CurrentWrite", value: { get() { reads++; return new Variant({ dataType: DataType.Float, value: index }); }, set() { writes++; return StatusCodes.Good; } } });
namespace.addVariable({ organizedBy: folder, nodeId: "s=Array", browseName: "Array", dataType: "Float", valueRank: 1, arrayDimensions: [2], minimumSamplingInterval: 100, value: { get() { reads++; return new Variant({ dataType: DataType.Float, arrayType: VariantArrayType.Array, value: [1, 2] }); } } });
namespace.addMethod(folder, { nodeId: "s=Method", browseName: "Method", inputArguments: [], outputArguments: [] }).bindMethod((_args, _context, done) => { calls++; done(null, { statusCode: StatusCodes.Good, outputArguments: [] }); });
await server.start(); reads = 0;
const send = value => process.stdout.write(JSON.stringify(value) + "\n");
send({ endpoint: server.endpoints[0].endpointDescriptions()[0].endpointUrl });
lines.on("line", async line => {
  if (line === "stats") send({ reads, writes, calls, sessions: server.engine.currentSessionCount });
  if (line === "stop") { await server.shutdown(0); await manager.dispose(); lines.close(); process.exit(0); }
});
