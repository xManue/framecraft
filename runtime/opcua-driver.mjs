import { createHash, X509Certificate, createPrivateKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import {
  OPCUAClient, AttributeIds, DataType, TimestampsToReturn, MessageSecurityMode, SecurityPolicy,
  UserTokenType, VariantArrayType, StatusCodes, coerceNodeId, extractFirstCertificateInChain,
} from "node-opcua-client";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import { LogLevel, setLogLevel, setDebugLogger, setTraceLogger } from "node-opcua-debug";
import { normalizeMqttTagValue, validateOpcUaConnection } from "./connection-config.mjs";
import { ConnectionOperationError, connectionDiagnostic, createDiagnosticReporter, diagnosticText, safeNotify, transportDiagnosticCode } from "./connection-diagnostics.mjs";

const types = { bool: DataType.Boolean, boolean: DataType.Boolean, sint: DataType.SByte, usint: DataType.Byte, byte: DataType.Byte,
  int: DataType.Int16, uint: DataType.UInt16, word: DataType.UInt16, dint: DataType.Int32, udint: DataType.UInt32, dword: DataType.UInt32,
  real: DataType.Float, float: DataType.Float, lreal: DataType.Double, double: DataType.Double, string: DataType.String, wstring: DataType.String };
const statusHex = (status) => Number.isInteger(status?.value) ? "0x" + (status.value >>> 0).toString(16).toUpperCase().padStart(8, "0") : undefined;
const timestamp = (value) => value instanceof Date && Number.isFinite(value.getTime()) ? value.getTime() : undefined;
function causeCode(error) {
  if (error instanceof ConnectionOperationError) return error.diagnostic.code;
  const message = typeof error?.message === "string" ? error.message : "";
  if (/BadCertificateTimeInvalid|BadCertificateIssuerTimeInvalid/.test(message)) return "OPC_UA_CERTIFICATE_TIME";
  if (/BadCertificateHostNameInvalid|BadCertificateUriInvalid/.test(message)) return "OPC_UA_CERTIFICATE_NAME";
  if (/BadCertificate|BadSecurityChecksFailed/.test(message)) return "OPC_UA_CERTIFICATE";
  if (/BadIdentityToken|BadUserAccessDenied/.test(message)) return "OPC_UA_AUTH";
  if (/BadSecurityMode|BadSecurityPolicy|cannot find endpoint/.test(message)) return "OPC_UA_SECURITY";
  if (/BadNodeId|BadAttributeIdInvalid|BadNotReadable|BadNotWritable/.test(message)) return "OPC_UA_NODE";
  if (/BadTypeMismatch|BadOutOfRange/.test(message)) return "OPC_UA_TYPE";
  if (/timed? ?out|Timeout/.test(message)) return "NETWORK_TIMEOUT";
  return transportDiagnosticCode(error);
}

export function createOpcUaPlcConnection(config, variables, callbacks = {}) {
  // The dedicated PLC process uses sanitized diagnostics, not SDK certificate/endpoint dumps.
  setLogLevel(LogLevel.Emergency); setDebugLogger(() => {}); setTraceLogger(() => {});
  config = JSON.parse(JSON.stringify(config));
  const tags = validateOpcUaConnection(config, variables), bindings = new Map(config.bindings.map((b) => [b.tag, b]));
  const samples = new Map(), pendingWrites = new Set();
  const report = createDiagnosticReporter(callbacks.onDiagnostic, { protocol: "opcua", connectionId: config.id });
  const timeoutMs = config.timeoutMs ?? 10000, readIntervalMs = config.readIntervalMs ?? 1000;
  let state = "stopped", stopped = false, active, startTask, stopTask, retryTimer;
  const failure = (code, tag, extra = {}, outcome = "rejected") => new ConnectionOperationError(report(code, { tag, ...extra }), outcome);
  const stateChanged = (next, code, error) => {
    state = next; const diagnostic = report(code, { technicalCode: error?.code });
    safeNotify(callbacks.onState, { id: config.id, state, ...(next === "error" ? { error: diagnosticText(diagnostic) } : {}), diagnostic });
  };
  const live = (attempt) => !stopped && active === attempt && !attempt.controller.signal.aborted;
  const bounded = async (task, ms) => {
    let timer;
    try { return await Promise.race([task, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" })), ms); })]); }
    finally { clearTimeout(timer); }
  };
  const wait = async (attempt, task) => {
    const signal = attempt.controller.signal; let aborted;
    // A late create/connect must not leave a session owned by a retired attempt.
    const guarded = Promise.resolve(task).then((value) => {
      if (!live(attempt)) { void attempt.client?.disconnect().catch(() => {}); throw new Error("Attempt retired"); }
      return value;
    });
    try {
      if (!live(attempt)) throw new Error("Attempt retired");
      return await bounded(Promise.race([guarded, new Promise((_, reject) => { aborted = () => reject(new Error("Attempt retired")); signal.addEventListener("abort", aborted, { once: true }); })]), timeoutMs);
    } finally { if (aborted) signal.removeEventListener("abort", aborted); }
  };
  const publish = (sample) => { samples.set(sample.tag, sample); safeNotify(callbacks.onSample, { ...sample }); };
  const invalidate = (code) => {
    for (const binding of bindings.values()) {
      if (tags.get(binding.tag).access === "write") continue;
      const diagnostic = connectionDiagnostic(code, { protocol: "opcua", connectionId: config.id, tag: binding.tag });
      const previous = samples.get(binding.tag);
      publish({ tag: binding.tag, ...previous, receivedAt: previous?.receivedAt ?? Date.now(), qualityCode: 0, lastError: code, errorDescription: diagnosticText(diagnostic) });
    }
  };
  const accept = (attempt, binding, data) => {
    if (!live(attempt)) return;
    const previous = samples.get(binding.tag), receivedAt = Date.now(), status = data?.statusCode;
    const actualTime = { timestamp: timestamp(data?.sourceTimestamp) ?? timestamp(data?.serverTimestamp),
      sourceTimestamp: timestamp(data?.sourceTimestamp), serverTimestamp: timestamp(data?.serverTimestamp) };
    const severity = Number.isInteger(status?.value) ? status.value >>> 30 : 3;
    const qualityCode = severity === 0 ? 192 : severity === 1 ? 64 : 0;
    let value, code;
    if (qualityCode === 192) {
      try {
        if (data.value?.arrayType !== VariantArrayType.Scalar || data.value?.dataType !== types[tags.get(binding.tag).dataType.toLowerCase()]) throw new Error("Type");
        value = String(normalizeMqttTagValue(data.value.value, tags.get(binding.tag).dataType));
        if (Buffer.byteLength(value) > 1048576) throw new Error("Size");
      } catch { value = undefined; code = "OPC_UA_TYPE"; }
    } else code = "OPC_UA_READ";
    const diagnostic = code && report(code, { tag: binding.tag, technicalCode: statusHex(status) });
    publish({ tag: binding.tag, ...(value !== undefined ? { value } : previous?.value !== undefined ? { value: previous.value } : {}),
      receivedAt, ...actualTime, qualityCode: code === "OPC_UA_TYPE" ? 0 : qualityCode, opcUaStatusCode: status?.value,
      ...(diagnostic ? { lastError: code, errorDescription: diagnosticText(diagnostic) } : {}) });
  };
  const cleanup = async (attempt) => {
    if (!attempt) return;
    if (attempt.cleanup) return attempt.cleanup;
    attempt.controller.abort(); clearInterval(attempt.pollTimer);
    if (active === attempt) active = undefined;
    for (const reject of pendingWrites) reject();
    attempt.cleanup = (async () => {
      if (attempt.session) await bounded(attempt.session.close(true).catch(() => {}), Math.min(timeoutMs, 1000)).catch(() => {});
      if (attempt.client) await bounded(attempt.client.disconnect().catch(() => {}), Math.min(timeoutMs, 1000)).catch(() => {});
      else await bounded(attempt.manager?.dispose() ?? Promise.resolve(), 1000).catch(() => {});
    })();
    return attempt.cleanup;
  };
  const retryable = (code) => ["NETWORK_ERROR", "NETWORK_REFUSED", "NETWORK_DNS", "NETWORK_TIMEOUT", "OPC_UA_CONNECTION_LOST"].includes(code);
  const lost = (attempt, error) => {
    if (!live(attempt)) return;
    const code = error ? causeCode(error) : "OPC_UA_CONNECTION_LOST";
    invalidate(code); safeNotify(callbacks.onError, diagnosticText(report(code, { technicalCode: error?.code })));
    stateChanged(retryable(code) ? "reconnecting" : "error", code, error);
    void cleanup(attempt).then(() => {
      if (stopped || !retryable(code) || retryTimer) return;
      retryTimer = setTimeout(() => { retryTimer = undefined; void connect().catch(() => {}); }, config.reconnectMs ?? 1000);
    });
  };
  const metadata = async (attempt, batch, writing = false) => {
    const attributes = [AttributeIds.DataType, AttributeIds.ValueRank, AttributeIds.UserAccessLevel];
    const requests = batch.flatMap((binding) => attributes.map((attributeId) => ({ nodeId: attempt.nodes.get(binding.tag), attributeId })));
    const results = await wait(attempt, attempt.session.read(requests, 0));
    for (let index = 0; index < batch.length; index++) {
      const binding = batch[index], [type, rank, access] = results.slice(index * 3, index * 3 + 3);
      if (![type, rank, access].every((item) => item?.statusCode?.isGood())) throw failure("OPC_UA_NODE", binding.tag);
      const expected = types[tags.get(binding.tag).dataType.toLowerCase()];
      if (rank.value.value !== -1 || type.value.value?.namespace !== 0 || type.value.value?.value !== expected) throw failure("OPC_UA_TYPE", binding.tag);
      if ((writing || binding.writeEnabled === true) && !(access.value.value & 2) || !writing && tags.get(binding.tag).access !== "write" && !(access.value.value & 1)) throw failure("OPC_UA_NODE", binding.tag);
    }
  };
  const readValues = async (attempt, readable) => {
    for (let index = 0; index < readable.length; index += 64) {
      const batch = readable.slice(index, index + 64);
      const values = await wait(attempt, attempt.session.read(batch.map((b) => ({ nodeId: attempt.nodes.get(b.tag), attributeId: AttributeIds.Value })), 0));
      batch.forEach((binding, i) => accept(attempt, binding, values[i]));
    }
  };
  async function connect() {
    if (stopped) throw failure("WRITE_OFFLINE");
    const attempt = { controller: new AbortController(), nodes: new Map() }; active = attempt;
    stateChanged("connecting", "CONNECTING");
    try {
      const id = createHash("sha256").update(config.id).digest("hex").slice(0, 24);
      const manager = new OPCUACertificateManager({ rootFolder: config.pkiDirectory || fileURLToPath(new URL("../.framecraft-runtime/opcua/" + id + "/", import.meta.url)), automaticallyAcceptUnknownCertificate: false, disableFileWatchers: true });
      attempt.manager = manager;
      const check = manager.checkCertificate.bind(manager), host = new URL(config.url).hostname.replace(/^\[|\]$/g, "");
      manager.checkCertificate = (certificate, callback) => {
        const result = (async () => {
          const status = await check(certificate);
          if (!status.isGood() || config.securityMode === "None") return status;
          try {
            const cert = new X509Certificate(extractFirstCertificateInChain(certificate));
            if (!(isIP(host) ? cert.checkIP(host) : cert.checkHost(host, { subject: "never" }))) return StatusCodes.BadCertificateHostNameInvalid;
          } catch { return StatusCodes.BadCertificateInvalid; }
          return status;
        })();
        if (callback) { result.then((value) => callback(null, value), callback); return; }
        return result;
      };
      await wait(attempt, manager.initialize());
      if (config.certificateFile) {
        try {
          const [certificate, privateKey] = await wait(attempt, Promise.all([readFile(config.certificateFile), readFile(config.privateKeyFile)]));
          const cert = new X509Certificate(certificate);
          if (!cert.checkPrivateKey(createPrivateKey(privateKey))) throw failure("OPC_UA_CONFIGURATION");
          if (Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) < Date.now()) throw failure("OPC_UA_CERTIFICATE_TIME");
          if (config.applicationUri && !cert.subjectAltName?.split(", ").includes("URI:" + config.applicationUri)) throw failure("OPC_UA_CERTIFICATE_NAME");
        } catch (error) { if (error instanceof ConnectionOperationError) throw error; throw failure("OPC_UA_CONFIGURATION"); }
      }
      const client = OPCUAClient.create({ applicationName: "Framecraft", applicationUri: config.applicationUri,
        securityMode: MessageSecurityMode[config.securityMode], securityPolicy: SecurityPolicy[config.securityPolicy], clientCertificateManager: manager,
        ...(config.certificateFile ? { certificateFile: config.certificateFile, privateKeyFile: config.privateKeyFile } : {}),
        connectionStrategy: { maxRetry: 0 }, endpointMustExist: true, keepSessionAlive: true,
        requestedSessionTimeout: Math.max(10000, timeoutMs * 2), defaultTransactionTimeout: timeoutMs, transportTimeout: timeoutMs });
      attempt.client = client;
      client.on("connection_lost", () => lost(attempt)); client.on("close", (error) => { if (error) lost(attempt, error); });
      if (config.securityMode === "None") report("OPC_UA_INSECURE");
      await wait(attempt, client.connect(config.url));
      if (config.securityMode !== "None") {
        const endpoints = await wait(attempt, client.getEndpoints());
        const endpoint = endpoints.find((e) => e.endpointUrl === config.url && e.securityMode === MessageSecurityMode[config.securityMode] && e.securityPolicyUri === SecurityPolicy[config.securityPolicy]);
        if (!endpoint) throw failure("OPC_UA_SECURITY");
        try {
          const certificate = new X509Certificate(extractFirstCertificateInChain(endpoint.serverCertificate));
          const actual = client.serverCertificate;
          const channelCertificate = new X509Certificate(extractFirstCertificateInChain(Array.isArray(actual) ? Buffer.concat(actual) : actual));
          if (certificate.fingerprint256 !== channelCertificate.fingerprint256) throw failure("OPC_UA_CERTIFICATE");
          if (!endpoint.server?.applicationUri || !certificate.subjectAltName?.split(", ").includes("URI:" + endpoint.server.applicationUri)) throw failure("OPC_UA_CERTIFICATE_NAME");
        } catch (error) { if (error instanceof ConnectionOperationError) throw error; throw failure("OPC_UA_CERTIFICATE"); }
      }
      let identity = { type: UserTokenType.Anonymous };
      if (config.usernameEnv) {
        let userName, password;
        try { const secret = callbacks.resolveSecret ?? ((name) => process.env[name]); userName = secret(config.usernameEnv); password = secret(config.passwordEnv); } catch { throw failure("SECRET_MISSING"); }
        if (typeof userName !== "string" || !userName || typeof password !== "string" || !password) throw failure("SECRET_MISSING");
        identity = { type: UserTokenType.UserName, userName, password };
      }
      attempt.session = await wait(attempt, client.createSession(identity));
      attempt.session.on("session_closed", () => lost(attempt));
      const namespaces = await wait(attempt, attempt.session.readNamespaceArray());
      for (const binding of bindings.values()) {
        const ns = namespaces.indexOf(binding.namespaceUri);
        if (ns < 0 || namespaces.lastIndexOf(binding.namespaceUri) !== ns) throw failure("OPC_UA_NAMESPACE", binding.tag);
        attempt.nodes.set(binding.tag, coerceNodeId("ns=" + ns + ";" + binding.nodeId));
      }
      const all = [...bindings.values()], readable = all.filter((binding) => tags.get(binding.tag).access !== "write");
      for (let index = 0; index < all.length; index += 64) await metadata(attempt, all.slice(index, index + 64));
      if (readable.length) {
        const subscription = await wait(attempt, attempt.session.createSubscription2({ requestedPublishingInterval: config.samplingIntervalMs ?? 250, requestedLifetimeCount: 120, requestedMaxKeepAliveCount: 10, maxNotificationsPerPublish: 1000, publishingEnabled: true, priority: 0 }));
        attempt.subscription = subscription;
        subscription.on("error", (error) => lost(attempt, error)); subscription.on("terminated", () => lost(attempt));
        for (let index = 0; index < readable.length; index += 64) {
          const batch = readable.slice(index, index + 64);
          const group = await wait(attempt, subscription.monitorItems(batch.map((b) => ({ nodeId: attempt.nodes.get(b.tag), attributeId: AttributeIds.Value })), { samplingInterval: config.samplingIntervalMs ?? 250, discardOldest: true, queueSize: 1 }, TimestampsToReturn.Both));
          if (group.monitoredItems.length !== batch.length || group.monitoredItems.some((item) => !item.statusCode?.isGood())) throw failure("OPC_UA_SUBSCRIPTION");
          group.on("changed", (_, data, offset) => { if (batch[offset]) accept(attempt, batch[offset], data); });
          group.on("err", () => lost(attempt, failure("OPC_UA_SUBSCRIPTION")));
        }
        await readValues(attempt, readable);
        let reading = false;
        attempt.pollTimer = setInterval(() => {
          if (!live(attempt) || reading) return; reading = true;
          void readValues(attempt, readable).catch((error) => lost(attempt, error)).finally(() => { reading = false; });
        }, readIntervalMs);
      }
      if (!live(attempt)) throw failure("WRITE_OFFLINE");
      stateChanged("connected", "CONNECTED");
    } catch (error) {
      if (live(attempt)) lost(attempt, error);
      await cleanup(attempt);
      throw error instanceof ConnectionOperationError ? error : failure(causeCode(error), undefined, { technicalCode: error?.code });
    }
  }
  return {
    get state() { return state; },
    read(tag) {
      const sample = samples.get(tag); if (!sample) return undefined;
      if (state !== "connected" || Date.now() - sample.receivedAt > (bindings.get(tag)?.staleAfterMs ?? 5000)) {
        const code = state === "connected" ? "STALE_SAMPLE" : "OPC_UA_CONNECTION_LOST";
        return { ...sample, qualityCode: 0, lastError: code, errorDescription: diagnosticText(report(code, { tag })) };
      }
      return { ...sample };
    },
    start() { if (stopped) return Promise.reject(failure("WRITE_OFFLINE")); return startTask ??= connect(); },
    stop() {
      if (stopTask) return stopTask; stopped = true; clearTimeout(retryTimer); retryTimer = undefined;
      invalidate("STOPPED"); stateChanged("stopped", "STOPPED");
      return stopTask = cleanup(active);
    },
    async write(tag, value) {
      const binding = bindings.get(tag), variable = tags.get(tag), attempt = active;
      if (!binding || config.allowWrites !== true || binding.writeEnabled !== true || variable.access === "read") throw failure("WRITE_DENIED", tag);
      if (!attempt || state !== "connected" || !live(attempt)) throw failure("WRITE_OFFLINE", tag);
      let normalized;
      try { normalized = normalizeMqttTagValue(value, variable.dataType); if (typeof normalized === "string" && Buffer.byteLength(normalized) > 1048576) throw new Error("Size"); }
      catch { throw failure("WRITE_INVALID", tag); }
      try { await metadata(attempt, [binding], true); } catch (error) { if (error instanceof ConnectionOperationError) throw error; throw failure("WRITE_OFFLINE", tag); }
      if (!live(attempt) || state !== "connected") throw failure("WRITE_OFFLINE", tag);
      let interrupt, timer;
      try {
        const interrupted = new Promise((_, reject) => { interrupt = () => reject(failure("WRITE_UNCERTAIN", tag, {}, "uncertain")); pendingWrites.add(interrupt); });
        const operation = attempt.session.write([{ nodeId: attempt.nodes.get(tag), attributeId: AttributeIds.Value,
          value: { value: { dataType: types[variable.dataType.toLowerCase()], value: normalized } } }]);
        const result = await Promise.race([operation, interrupted, new Promise((_, reject) => { timer = setTimeout(() => reject(failure("WRITE_UNCERTAIN", tag, {}, "uncertain")), timeoutMs); })]);
        if (!live(attempt)) throw failure("WRITE_UNCERTAIN", tag, {}, "uncertain");
        const status = result?.[0];
        if (status?.isBad()) throw failure("OPC_UA_WRITE_REJECTED", tag, { technicalCode: statusHex(status) });
        if (!status?.isGood()) throw failure("WRITE_UNCERTAIN", tag, { technicalCode: statusHex(status) }, "uncertain");
        return { tag, delivery: "opcua-service", plcConfirmed: false };
      } catch (error) {
        if (error instanceof ConnectionOperationError) throw error;
        lost(attempt, error); throw failure("WRITE_UNCERTAIN", tag, { technicalCode: error?.code }, "uncertain");
      } finally { clearTimeout(timer); pendingWrites.delete(interrupt); }
    },
  };
}
