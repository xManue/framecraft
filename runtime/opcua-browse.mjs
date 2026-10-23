import { createHash } from "node:crypto";
import { AttributeIds, BrowseDirection, NodeClass, NodeId, DataType, VariantArrayType, coerceNodeId } from "node-opcua-client";
import { OpcUaBrowseError, opcUaStandardNamespace, opcUaBrowseScalarTypes, parseOpcUaBrowseQuery, parseOpcUaBrowsePage, parseOpcUaBrowseTarget } from "./opcua-browse-policy.mjs";
const fail = code => { throw new OpcUaBrowseError(code); };
const good = value => value?.statusCode?.isGood() === true;
const scalar = (value, type) => good(value) && value.value?.dataType === type && value.value.arrayType === VariantArrayType.Scalar;
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export async function browseOpcUaSession(session, raw = {}, options = {}) {
  const query = parseOpcUaBrowseQuery(raw), abort = new AbortController(); let point, retired = false, calls = 0, bytes = 0;
  const stop = () => abort.abort(new OpcUaBrowseError("OPC_UA_BROWSE_CANCELLED"));
  const timeout = setTimeout(() => abort.abort(Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" })), 60000);
  options.signal?.addEventListener("abort", stop, { once: true }); if (options.signal?.aborted) stop();
  const release = async value => { if (!Buffer.isBuffer(value) || !value.length) return; let timer; try { await Promise.race([session.browseNext(value, true), new Promise(resolve => { timer = setTimeout(resolve, 1000); })]); } catch {} finally { clearTimeout(timer); } };
  async function call(operation, continuation = false) {
    abort.signal.throwIfAborted(); if (++calls > 120) fail("OPC_UA_BROWSE_LIMIT");
    let cancelled; const task = Promise.resolve().then(operation);
    task.then(value => { if (continuation && (retired || abort.signal.aborted)) void release(value?.continuationPoint); }, () => {});
    try { return await Promise.race([options.wait ? options.wait(task) : task, new Promise((_, reject) => { cancelled = () => reject(abort.signal.reason); abort.signal.addEventListener("abort", cancelled, { once: true }); if (abort.signal.aborted) cancelled(); })]); }
    finally { if (cancelled) abort.signal.removeEventListener("abort", cancelled); }
  }
  const originalLimit = session.requestedMaxReferencesPerNode;
  try {
    const namespaces = await call(() => session.readNamespaceArray());
    if (!Array.isArray(namespaces) || namespaces.length > 65536 || namespaces[0] !== opcUaStandardNamespace || Buffer.byteLength(JSON.stringify(namespaces)) > 4 * 1024 * 1024 || namespaces.some(uri => typeof uri !== "string" || !uri.trim() || uri.length > 2048 || /[\u0000-\u001f\u007f]/.test(uri))) fail("OPC_UA_BROWSE_RESPONSE");
    const unique = uri => namespaces.indexOf(uri) === namespaces.lastIndexOf(uri);
    const ns = namespaces.indexOf(query.namespaceUri); if (ns < 0 || !unique(query.namespaceUri)) fail("OPC_UA_BROWSE_NAMESPACE");
    const portable = node => {
      try {
        if (!node || node.serverIndex || node.namespaceUri && !unique(node.namespaceUri)) return null;
        const namespaceUri = node.namespaceUri || namespaces[node.namespace]; if (!namespaceUri || namespaces.indexOf(namespaceUri) < 0 || !unique(namespaceUri)) return null;
        return parseOpcUaBrowseTarget({ namespaceUri, nodeId: new NodeId(node.identifierType, node.value, 0).toString().replace(/^ns=0;/, "") });
      } catch { return null; }
    };
    const normalize = ref => {
      if (!ref || typeof ref !== "object") fail("OPC_UA_BROWSE_RESPONSE");
      const target = portable(ref.nodeId), name = NodeClass[ref.nodeClass], nodeClass = ["Object", "Variable", "Method", "ObjectType", "VariableType", "ReferenceType", "DataType", "View"].includes(name) ? name : "Unknown";
      const node = { target, browseName: ref.browseName?.name ?? "", displayName: ref.displayName?.text ?? "", nodeClass, dataType: null, valueRank: null, arrayDimensions: null, readable: null, writable: null, supportedDataType: null, issues: target ? [] : [ref.nodeId?.serverIndex ? "remote" : "identity"] };
      if (typeof node.browseName !== "string" || typeof node.displayName !== "string" || node.browseName.length > 4096 || node.displayName.length > 4096) fail("OPC_UA_BROWSE_LIMIT");
      return node;
    };
    session.requestedMaxReferencesPerNode = 100; const nodes = new Map(); let references = 0;
    let result = await call(() => session.browse({ nodeId: coerceNodeId("ns=" + ns + ";" + query.nodeId), browseDirection: BrowseDirection.Forward, referenceTypeId: "HierarchicalReferences", includeSubtypes: true, nodeClassMask: 0, resultMask: 63 }), true);
    while (true) {
      point = result?.continuationPoint;
      if (point !== null && point !== undefined && (!Buffer.isBuffer(point) || point.length > 4096) || result?.statusCode?.isGood() !== true || !Array.isArray(result.references) || result.references.length > 100) fail("OPC_UA_BROWSE_RESPONSE");
      if ((references += result.references.length) > 5000) fail("OPC_UA_BROWSE_LIMIT");
      for (const ref of result.references) { const node = normalize(ref), key = JSON.stringify([node.target, node.browseName, node.displayName, node.nodeClass, node.issues]); bytes += Buffer.byteLength(key); if (bytes > 4 * 1024 * 1024) fail("OPC_UA_BROWSE_LIMIT"); nodes.set(key, node); }
      if (!point?.length) break;
      result = await call(() => session.browseNext(point, false), true);
    }
    const entries = [...nodes.entries()].sort(([a], [b]) => order(a, b)).map(([, value]) => value), target = { namespaceUri: query.namespaceUri, nodeId: query.nodeId };
    const revision = createHash("sha256").update(JSON.stringify({ target, nodes: entries })).digest("hex");
    if (query.revision !== undefined && query.revision !== revision) fail("OPC_UA_BROWSE_CHANGED"); if (query.offset && query.offset >= entries.length) fail("OPC_UA_BROWSE_CHANGED");
    const page = entries.slice(query.offset, query.offset + query.limit), variables = page.filter(node => node.nodeClass === "Variable" && node.target);
    const attributes = [AttributeIds.DataType, AttributeIds.ValueRank, AttributeIds.ArrayDimensions, AttributeIds.UserAccessLevel], requests = variables.flatMap(node => attributes.map(attributeId => ({ nodeId: coerceNodeId("ns=" + namespaces.indexOf(node.target.namespaceUri) + ";" + node.target.nodeId), attributeId })));
    const metadata = [];
    for (let index = 0; index < requests.length; index += 64) { const batch = requests.slice(index, index + 64), reply = await call(() => session.read(batch, 0)); if (!Array.isArray(reply) || reply.length !== batch.length) fail("OPC_UA_BROWSE_RESPONSE"); metadata.push(...reply); }
    variables.forEach((node, index) => {
      const [type, rank, dimensions, access] = metadata.slice(index * 4, index * 4 + 4);
      if (scalar(type, DataType.NodeId)) node.dataType = portable(type.value.value);
      if (scalar(rank, DataType.Int32) && Number.isInteger(rank.value.value) && rank.value.value >= -3) node.valueRank = rank.value.value;
      const dims = dimensions?.value?.value;
      if (good(dimensions) && dimensions.value?.dataType === DataType.UInt32 && dimensions.value.arrayType === VariantArrayType.Array && (Array.isArray(dims) || dims instanceof Uint32Array) && dims.length <= 32 && [...dims].every(n => Number.isInteger(n) && n >= 0 && n <= 4294967295)) node.arrayDimensions = [...dims];
      if (scalar(access, DataType.Byte) && Number.isInteger(access.value.value) && access.value.value >= 0 && access.value.value <= 255) { node.readable = !!(access.value.value & 1); node.writable = !!(access.value.value & 2); }
      if (!node.dataType || node.valueRank === null || node.readable === null) node.issues.push("metadata");
      if (node.arrayDimensions?.length && (node.valueRank === -1 || node.valueRank > 0 && node.valueRank !== node.arrayDimensions.length) && !node.issues.includes("metadata")) node.issues.push("metadata");
      if (node.valueRank !== null && node.valueRank !== -1) node.issues.push("array");
      const supported = node.dataType?.namespaceUri === opcUaStandardNamespace ? opcUaBrowseScalarTypes[node.dataType.nodeId] : undefined;
      if (node.dataType && !supported) node.issues.push("unsupported-type");
      if (!node.issues.length) node.supportedDataType = supported;
    });
    abort.signal.throwIfAborted();
    return parseOpcUaBrowsePage({ version: 1, target, revision, offset: query.offset, limit: query.limit, total: entries.length, nextOffset: query.offset + page.length < entries.length ? query.offset + page.length : null, nodes: page }, query);
  } finally { retired = true; clearTimeout(timeout); options.signal?.removeEventListener("abort", stop); session.requestedMaxReferencesPerNode = originalLimit; await release(point); }
}
