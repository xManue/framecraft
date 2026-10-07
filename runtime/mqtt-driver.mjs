import { connect } from "mqtt";
import { readFile } from "node:fs/promises";
import { normalizeMqttTagValue, validateMqttConnection } from "./connection-config.mjs";
import { ConnectionOperationError, connectionDiagnostic, createDiagnosticReporter, diagnosticText, safeNotify, transportDiagnosticCode } from "./connection-diagnostics.mjs";
export { normalizeMqttTagValue } from "./connection-config.mjs";

function pointerValue(value, path) {
  if (!path) return value;
  for (const key of path.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) throw Object.assign(new Error("Mapping non valido."), { diagnosticCode: "BAD_MAPPING" });
    value = value[key];
  }
  return value;
}
const permanent = new Set(["AUTH_DENIED", "CLIENT_ID_CONFLICT", "CLIENT_ID_INVALID", "MQTT_VERSION", "TLS_UNTRUSTED", "TLS_EXPIRED", "TLS_HOSTNAME", "TLS_CONFIGURATION"]);

export function createMqttPlcConnection(configuration, variables, callbacks = {}) {
  const config = JSON.parse(JSON.stringify(configuration)), tags = validateMqttConnection(config, variables);
  const bindings = new Map(config.bindings.map((binding) => [binding.tag, binding])), byTopic = new Map(), samples = new Map(), pendingWrites = new Set();
  for (const binding of bindings.values()) if (tags.get(binding.tag).access !== "write") byTopic.set(binding.topic, [...(byTopic.get(binding.topic) ?? []), binding]);
  const reconnectMs = config.reconnectMs ?? 1000, timeoutMs = config.timeoutMs ?? 10000;
  const context = { protocol: "mqtt", connectionId: config.id };
  const report = createDiagnosticReporter((event) => { safeNotify(callbacks.onDiagnostic, { ...event }); if (event.level !== "info") safeNotify(callbacks.onError, [event.connectionId, event.tag].filter(Boolean).join(" / ") + ": " + diagnosticText(event)); }, context);
  const diagnostic = (code, extra) => connectionDiagnostic(code, { ...context, ...extra });
  let client, desired = false, generation = 0, retry, freshnessTimer, attemptTimer, certificateRead, state = "stopped", startPromise, startResolve, startReject, connectedAt = 0, lastDiagnostic;
  const stateChanged = (next, event) => {
    state = next;
    if (["connected", "stopped", "connecting"].includes(next)) lastDiagnostic = undefined;
    if (event) lastDiagnostic = event;
    safeNotify(callbacks.onState, { id: config.id, state: next, ...(lastDiagnostic ? { error: diagnosticText(lastDiagnostic), diagnostic: { ...lastDiagnostic } } : {}) });
  };
  const emit = (sample) => { samples.set(sample.tag, sample); safeNotify(callbacks.onSample, { ...sample }); };
  const markBad = (lastError, event) => { for (const sample of samples.values()) emit({ ...sample, qualityCode: 0, lastError, errorDescription: diagnosticText(event) }); };
  const failWrites = () => { const event = diagnostic("WRITE_UNCERTAIN"); for (const reject of pendingWrites) reject(new ConnectionOperationError(event, "uncertain")); pendingWrites.clear(); };
  const finishError = (event) => {
    desired = false; generation++; clearTimeout(retry); clearTimeout(attemptTimer); clearInterval(freshnessTimer); certificateRead?.abort();
    failWrites(); const current = client; client = undefined; current?.end(true);
    markBad("BadNoCommunication", event); stateChanged("error", event);
    const reject = startReject; startResolve = startReject = undefined; reject?.(new ConnectionOperationError(event));
  };
  const retryConnection = (event, token) => {
    if (!desired || token !== generation) return;
    if (startReject || permanent.has(event.code)) { finishError(event); return; }
    generation++; clearTimeout(attemptTimer); certificateRead?.abort(); failWrites();
    const current = client; client = undefined; current?.end(true);
    markBad("BadNoCommunication", event); stateChanged("reconnecting", event);
    clearTimeout(retry); retry = setTimeout(() => { if (desired) void open(); }, reconnectMs);
  };
  const secret = (name) => {
    if (!name) return undefined;
    let value;
    try { value = callbacks.resolveSecret ? callbacks.resolveSecret(name) : process.env[name]; }
    catch { throw new ConnectionOperationError(diagnostic("SECRET_MISSING")); }
    if (typeof value !== "string" || !value.length) throw new ConnectionOperationError(diagnostic("SECRET_MISSING"));
    return value;
  };
  async function open() {
    const token = ++generation; stateChanged(startResolve ? "connecting" : "reconnecting");
    if (startResolve) report("CONNECTING");
    certificateRead?.abort(); const loading = new AbortController(); certificateRead = loading;
    clearTimeout(attemptTimer); attemptTimer = setTimeout(() => { if (desired && generation === token) retryConnection(report("NETWORK_TIMEOUT"), token); }, timeoutMs);
    let preparingTls = true;
    try {
      const tls = {};
      for (const [key, path] of [["ca", config.tls?.caFile], ["cert", config.tls?.certificateFile], ["key", config.tls?.privateKeyFile]]) if (path) tls[key] = await readFile(path, { signal: loading.signal });
      preparingTls = false;
      const username = secret(config.usernameEnv), password = secret(config.passwordEnv);
      if (!desired || generation !== token) return;
      const current = connect(config.url, { ...tls, username, password, ...(config.clientId ? { clientId: config.clientId } : {}), protocolVersion: config.protocolVersion ?? 4, connectTimeout: timeoutMs, reconnectPeriod: 0, resubscribe: false, clean: true, queueQoSZero: false, rejectUnauthorized: true });
      client = current;
      current.on("error", (error) => {
        if (!desired || token !== generation) return;
        retryConnection(report(transportDiagnosticCode(error), { technicalCode: error.code }), token);
      });
      current.on("disconnect", (packet) => {
        if (!desired || token !== generation) return;
        const code = packet.reasonCode;
        if (code >= 128) retryConnection(report(transportDiagnosticCode({ code }), { technicalCode: code }), token);
      });
      current.on("packetreceive", (packet) => {
        if (desired && token === generation && ["puback", "pubrec"].includes(packet.cmd) && packet.reasonCode === 16) report("NO_RECEIVERS");
      });
      current.on("connect", async () => {
        if (!desired || token !== generation) return;
        try {
          const topics = Object.create(null);
          for (const binding of bindings.values()) if (tags.get(binding.tag).access !== "write") topics[binding.topic] = { qos: Math.max(topics[binding.topic]?.qos ?? 0, binding.qos ?? 0) };
          if (Object.keys(topics).length) {
            const grants = await current.subscribeAsync(topics);
            if (grants.length !== Object.keys(topics).length || grants.some((grant) => ![0, 1, 2].includes(grant.qos))) throw new Error("Sottoscrizione incompleta.");
          }
          if (!desired || token !== generation) return;
          clearTimeout(attemptTimer); connectedAt = Date.now(); stateChanged("connected");
          if (!desired || token !== generation) return;
          report("CONNECTED");
          const resolve = startResolve; startResolve = startReject = undefined; resolve?.();
        } catch (error) {
          if (!desired || token !== generation) return;
          finishError(report("SUBSCRIPTION_DENIED", { technicalCode: error.code }));
        }
      });
      current.on("message", (topic, payload, packet) => {
        if (!desired || token !== generation) return;
        const receivedAt = Date.now();
        for (const binding of byTopic.get(topic) ?? []) {
          let failureCode = "BAD_PAYLOAD";
          const previous = samples.get(binding.tag);
          try {
            if (payload.length > (config.maxPayloadBytes ?? 65536)) { failureCode = "PAYLOAD_TOO_LARGE"; throw new Error(); }
            const text = new TextDecoder("utf-8", { fatal: true }).decode(payload);
            const content = (binding.encoding ?? "json") === "json" ? JSON.parse(text) : text;
            const value = normalizeMqttTagValue(pointerValue(content, binding.valuePath), tags.get(binding.tag).dataType);
            const qualityCode = binding.qualityPath !== undefined ? pointerValue(content, binding.qualityPath) : undefined;
            if (qualityCode !== undefined && (!Number.isInteger(qualityCode) || qualityCode < 0 || qualityCode > 65535)) { failureCode = "BAD_QUALITY"; throw new Error(); }
            let sourceTimestamp;
            if (binding.timestampPath !== undefined) {
              const raw = pointerValue(content, binding.timestampPath); sourceTimestamp = typeof raw === "number" ? raw * (binding.timestampUnit === "s" ? 1000 : 1) : typeof raw === "string" ? Date.parse(raw) : NaN;
              if (!Number.isFinite(sourceTimestamp) || Math.abs(sourceTimestamp) > 8640000000000000) { failureCode = "BAD_TIMESTAMP"; throw new Error(); }
              if (sourceTimestamp < (previous?.sourceTimestamp ?? -Infinity)) { report("OLD_SAMPLE", { tag: binding.tag }); continue; }
            }
            if (qualityCode !== undefined && (qualityCode & 0xc0) === 0) {
              const event = report("SOURCE_BAD", { tag: binding.tag });
              emit({ ...previous, tag: binding.tag, qualityCode, timestamp: sourceTimestamp ?? receivedAt, sourceTimestamp, receivedAt, retained: Boolean(packet.retain), lastError: "BadSourceQuality", errorDescription: diagnosticText(event) });
            } else {
              emit({ tag: binding.tag, value: String(value), qualityCode, timestamp: sourceTimestamp ?? receivedAt, sourceTimestamp, receivedAt, retained: Boolean(packet.retain) });
              if (previous?.lastError) report("SAMPLE_RECOVERED", { tag: binding.tag });
            }
          } catch (error) {
            const event = report(error.diagnosticCode ?? failureCode, { tag: binding.tag });
            emit({ ...previous, tag: binding.tag, qualityCode: 0, receivedAt, lastError: "BadPayload", errorDescription: diagnosticText(event) });
          }
        }
      });
      current.on("close", () => { if (desired && token === generation) retryConnection(report("CONNECTION_LOST"), token); });
    } catch (error) {
      if (!desired || token !== generation) return;
      const code = error instanceof ConnectionOperationError ? error.diagnostic.code : preparingTls ? "TLS_FILE" : transportDiagnosticCode(error);
      finishError(report(code, { technicalCode: error.code }));
    }
  }
  return {
    get state() { return state; },
    read(tag) { const sample = samples.get(tag); return sample ? { ...sample } : undefined; },
    start() {
      if (desired) return startPromise;
      desired = true; startPromise = new Promise((resolve, reject) => { startResolve = resolve; startReject = reject; });
      if (["mqtt:", "ws:"].includes(new URL(config.url).protocol)) report("INSECURE_TRANSPORT");
      freshnessTimer = setInterval(() => {
        if (state !== "connected") return;
        const now = Date.now();
        for (const binding of bindings.values()) {
          if (tags.get(binding.tag).access === "write") continue;
          const sample = samples.get(binding.tag);
          if (binding.staleAfterMs && now - (sample?.receivedAt || connectedAt) > binding.staleAfterMs && !sample?.lastError) {
            const event = report("STALE_SAMPLE", { tag: binding.tag });
            emit({ ...sample, tag: binding.tag, receivedAt: sample?.receivedAt ?? 0, qualityCode: 0, lastError: "BadStaleReading", errorDescription: diagnosticText(event) });
          }
        }
      }, 250); freshnessTimer.unref?.(); void open(); return startPromise;
    },
    async stop() {
      desired = false; generation++; clearTimeout(retry); clearInterval(freshnessTimer); clearTimeout(attemptTimer); certificateRead?.abort();
      const reject = startReject; startResolve = startReject = undefined; reject?.(new ConnectionOperationError(diagnostic("STOPPED")));
      failWrites(); const current = client; client = undefined;
      if (current) await current.endAsync(true);
      const event = report("STOPPED"); markBad("BadNotConnected", event); stateChanged("stopped");
    },
    async write(tag, value) {
      const binding = bindings.get(tag), variable = tags.get(tag);
      if (config.allowWrites !== true || !binding?.writeTopic || !variable || variable.access === "read") throw new ConnectionOperationError(report("WRITE_DENIED", { tag }));
      if (state !== "connected" || !client?.connected || client.disconnecting) throw new ConnectionOperationError(report("WRITE_OFFLINE", { tag }));
      if (pendingWrites.size >= 32) throw new ConnectionOperationError(report("GATEWAY_BUSY", { tag }));
      let payload;
      try {
        const typed = normalizeMqttTagValue(value, variable.dataType); payload = (binding.writeEncoding ?? "json") === "text" ? String(typed) : JSON.stringify(typed);
        if (Buffer.byteLength(payload) > (config.maxPayloadBytes ?? 65536)) throw new Error();
      } catch { throw new ConnectionOperationError(report("WRITE_INVALID", { tag })); }
      const current = client; let rejectWrite, timer;
      const interrupted = new Promise((_, reject) => { rejectWrite = reject; pendingWrites.add(reject); timer = setTimeout(() => { reject(new ConnectionOperationError(diagnostic("WRITE_UNCERTAIN", { tag }), "uncertain")); current.end(true); }, timeoutMs); });
      try {
        const publishing = new Promise((resolve, reject) => current.publish(binding.writeTopic, payload, { qos: binding.writeQos ?? 1, retain: false }, (error, packet) => {
          if (error) reject(Object.assign(error, { brokerRejected: ["puback", "pubrec"].includes(packet?.cmd) && [135, 144, 149, 151, 153].includes(packet.reasonCode) }));
          else resolve();
        }));
        await Promise.race([publishing, interrupted]);
        return { tag, delivery: (binding.writeQos ?? 1) === 0 ? "transport" : "broker-ack", plcConfirmed: false };
      } catch (error) {
        const rejected = error.brokerRejected === true;
        const outcome = error instanceof ConnectionOperationError ? error.outcome : rejected ? "rejected" : "uncertain";
        throw new ConnectionOperationError(report(outcome === "rejected" ? "WRITE_REJECTED" : "WRITE_UNCERTAIN", { tag, technicalCode: error.code }), outcome);
      } finally { clearTimeout(timer); pendingWrites.delete(rejectWrite); }
    },
  };
}
