import { connect } from "mqtt";
import { readFile } from "node:fs/promises";
import { normalizeMqttTagValue, validateMqttConnection } from "./connection-config.mjs";
export { normalizeMqttTagValue } from "./connection-config.mjs";

function pointerValue(value, path) {
  if (!path) return value;
  for (const key of path.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) throw new Error("Percorso JSON non presente nel payload.");
    value = value[key];
  }
  return value;
}

export function createMqttPlcConnection(configuration, variables, callbacks = {}) {
  const config = JSON.parse(JSON.stringify(configuration)); const tags = validateMqttConnection(config, variables);
  const bindings = new Map(config.bindings.map((binding) => [binding.tag, binding])); const samples = new Map(); const pendingWrites = new Set();
  const reconnectMs = Math.max(250, Math.min(60_000, config.reconnectMs ?? 1_000)); const timeoutMs = Math.max(250, Math.min(60_000, config.timeoutMs ?? 10_000));
  let client, desired = false, generation = 0, retry, freshnessTimer, startTimer, certificateRead, state = "stopped", startPromise, startResolve, startReject;
  const stateChanged = (next, error) => { state = next; callbacks.onState?.({ id: config.id, state: next, ...(error ? { error } : {}) }); };
  const emit = (sample) => { samples.set(sample.tag, sample); callbacks.onSample?.({ ...sample }); };
  const markBad = (lastError, errorDescription) => {
    for (const sample of samples.values()) emit({ ...sample, qualityCode: 0, lastError, errorDescription });
  };
  const failWrites = (message) => { for (const reject of pendingWrites) reject(new Error(message)); pendingWrites.clear(); };
  const secret = (name) => { if (!name) return undefined; const value = callbacks.resolveSecret ? callbacks.resolveSecret(name) : process.env[name]; if (value === undefined) throw new Error("Credenziale ambiente non disponibile: " + name); return value; };
  async function open() {
    const token = ++generation; stateChanged(startResolve ? "connecting" : "reconnecting");
    certificateRead?.abort(); const loading = new AbortController(); certificateRead = loading;
    try {
      const tls = {};
      for (const [key, path] of [["ca", config.tls?.caFile], ["cert", config.tls?.certificateFile], ["key", config.tls?.privateKeyFile]]) if (path) tls[key] = await readFile(path, { signal: loading.signal });
      const username = secret(config.usernameEnv), password = secret(config.passwordEnv);
      if (!desired || generation !== token) return;
      const current = connect(config.url, { ...tls, username, password, ...(config.clientId ? { clientId: config.clientId } : {}), protocolVersion: config.protocolVersion ?? 4, connectTimeout: timeoutMs, reconnectPeriod: 0, resubscribe: false, clean: true, queueQoSZero: false, rejectUnauthorized: true });
      client = current;
      current.on("error", (error) => {
        if (token !== generation || !desired) return;
        const code = /^[A-Z0-9_]{1,40}$/.test(String(error.code)) ? " (" + error.code + ")" : "";
        const message = "Connessione MQTT non disponibile" + code + ".";
        callbacks.onError?.(message);
        if (startReject) { const reject = startReject; startResolve = startReject = undefined; desired = false; generation++; clearTimeout(startTimer); clearInterval(freshnessTimer); current.end(true); stateChanged("error", message); reject(new Error(message)); }
      });
      current.on("connect", async () => {
        if (!desired || token !== generation) return;
        try {
          const topics = Object.create(null);
          for (const binding of bindings.values()) if (tags.get(binding.tag).access !== "write") topics[binding.topic] = { qos: Math.max(topics[binding.topic]?.qos ?? 0, binding.qos ?? 0) };
          if (Object.keys(topics).length) {
            const grants = await current.subscribeAsync(topics);
            if (grants.some((grant) => ![0, 1, 2].includes(grant.qos))) throw new Error("Il broker ha rifiutato una sottoscrizione.");
          }
          if (!desired || token !== generation) return;
          stateChanged("connected"); clearTimeout(startTimer); const resolve = startResolve; startResolve = startReject = undefined; resolve?.();
        } catch {
          if (!desired || token !== generation) return;
          const message = "Sottoscrizione MQTT non riuscita."; callbacks.onError?.(message);
          if (startReject) { const reject = startReject; startResolve = startReject = undefined; desired = false; generation++; clearTimeout(startTimer); clearInterval(freshnessTimer); stateChanged("error", message); reject(new Error(message)); }
          current.end(true);
        }
      });
      current.on("message", (topic, payload, packet) => {
        if (!desired || token !== generation) return;
        const receivedAt = Date.now();
        for (const binding of bindings.values()) if (binding.topic === topic && tags.get(binding.tag).access !== "write") {
          try {
            if (payload.length > (config.maxPayloadBytes ?? 65_536)) throw new Error("Payload MQTT troppo grande.");
            const content = (binding.encoding ?? "json") === "json" ? JSON.parse(payload.toString("utf8")) : payload.toString("utf8");
            const value = normalizeMqttTagValue(pointerValue(content, binding.valuePath), tags.get(binding.tag).dataType);
            const qualityCode = binding.qualityPath !== undefined ? pointerValue(content, binding.qualityPath) : undefined;
            if (qualityCode !== undefined && (!Number.isInteger(qualityCode) || qualityCode < 0 || qualityCode > 65_535)) throw new Error("QualityCode MQTT non valido.");
            let sourceTimestamp;
            if (binding.timestampPath !== undefined) {
              const raw = pointerValue(content, binding.timestampPath); sourceTimestamp = typeof raw === "number" ? raw * (binding.timestampUnit === "s" ? 1000 : 1) : typeof raw === "string" ? Date.parse(raw) : NaN;
              if (!Number.isFinite(sourceTimestamp)) throw new Error("Timestamp MQTT non valido.");
              if (sourceTimestamp < (samples.get(binding.tag)?.sourceTimestamp ?? -Infinity)) { callbacks.onError?.(binding.tag + ": campione MQTT precedente ignorato."); continue; }
            }
            emit({ tag: binding.tag, value: String(value), qualityCode, timestamp: sourceTimestamp ?? receivedAt, sourceTimestamp, receivedAt, retained: Boolean(packet.retain) });
          } catch (error) {
            const message = error instanceof SyntaxError ? "Payload JSON MQTT non valido." : error.message;
            callbacks.onError?.(binding.tag + ": " + message);
            emit({ ...samples.get(binding.tag), tag: binding.tag, qualityCode: 0, receivedAt, lastError: "BadPayload", errorDescription: message });
          }
        }
      });
      current.on("close", () => {
        if (!desired || token !== generation) return;
        generation++; failWrites("Connessione persa; esito del comando non confermato."); current.end(true);
        markBad("BadNoCommunication", "Connessione MQTT interrotta."); stateChanged("reconnecting");
        clearTimeout(retry); retry = setTimeout(() => { if (desired) void open(); }, reconnectMs);
      });
    } catch (error) {
      if (!desired || token !== generation) return;
      desired = false; clearTimeout(startTimer); clearInterval(freshnessTimer); const message = "Configurazione o certificati MQTT non disponibili."; stateChanged("error", message); callbacks.onError?.(message);
      const reject = startReject; startResolve = startReject = undefined; reject?.(new Error(message));
    }
  }
  return {
    get state() { return state; },
    read(tag) { const sample = samples.get(tag); return sample ? { ...sample } : undefined; },
    start() {
      if (desired) return startPromise;
      desired = true; startPromise = new Promise((resolve, reject) => { startResolve = resolve; startReject = reject; });
      startTimer = setTimeout(() => {
        if (!startReject) return; const reject = startReject; startResolve = startReject = undefined; desired = false; generation++;
        clearTimeout(retry); clearInterval(freshnessTimer); certificateRead?.abort(); client?.end(true); stateChanged("error", "Timeout di avvio MQTT."); reject(new Error("Timeout di avvio MQTT."));
      }, timeoutMs);
      freshnessTimer = setInterval(() => {
        const now = Date.now();
        for (const binding of bindings.values()) {
          const sample = samples.get(binding.tag);
          if (sample && binding.staleAfterMs && now - sample.receivedAt > binding.staleAfterMs && !sample.lastError) emit({ ...sample, qualityCode: 0, lastError: "BadStaleReading", errorDescription: "Nessun nuovo campione entro il limite configurato." });
        }
      }, 250); freshnessTimer.unref?.(); void open(); return startPromise;
    },
    async stop() {
      desired = false; generation++; clearTimeout(retry); clearInterval(freshnessTimer); clearTimeout(startTimer); certificateRead?.abort();
      const reject = startReject; startResolve = startReject = undefined; reject?.(new Error("Connessione arrestata."));
      failWrites("Connessione arrestata; esito del comando non confermato."); const current = client; client = undefined;
      if (current) await current.endAsync(true); markBad("BadNotConnected", "Connessione MQTT arrestata."); stateChanged("stopped");
    },
    async write(tag, value) {
      const binding = bindings.get(tag), variable = tags.get(tag);
      if (config.allowWrites !== true || !binding?.writeTopic || !variable || variable.access === "read") throw new Error("Scrittura MQTT non autorizzata per " + tag + ".");
      if (state !== "connected" || !client?.connected) throw new Error("Connessione MQTT non disponibile; comando non accodato.");
      const typed = normalizeMqttTagValue(value, variable.dataType); const payload = (binding.writeEncoding ?? "json") === "text" ? String(typed) : JSON.stringify(typed);
      const current = client; let rejectWrite, timer;
      const interrupted = new Promise((_, reject) => { rejectWrite = reject; pendingWrites.add(reject); timer = setTimeout(() => { reject(new Error("Timeout MQTT; esito del comando non confermato.")); current.end(true); }, timeoutMs); });
      try {
        await Promise.race([current.publishAsync(binding.writeTopic, payload, { qos: binding.writeQos ?? 1, retain: false }), interrupted]);
        return { tag, delivery: (binding.writeQos ?? 1) === 0 ? "transport" : "broker-ack", plcConfirmed: false };
      } finally { clearTimeout(timer); pendingWrites.delete(rejectWrite); }
    },
  };
}
