import { connectionDiagnostic, connectionMessages, createDiagnosticReporter, diagnosticText, safeNotify, type ConnectionDiagnostic } from "../../runtime/connection-diagnostics.mjs";
import { normalizeMqttTagValue } from "../../runtime/connection-config.mjs";
export type { ConnectionDiagnostic } from "../../runtime/connection-diagnostics.mjs";
export interface HmiGatewaySample {
  tag: string; connectionId: string; value?: string; qualityCode?: number; timestamp?: number; sourceTimestamp?: number;
  receivedAt: number; retained?: boolean; lastError?: string; errorDescription?: string; serverTimestamp?: number; opcUaStatusCode?: number;
}
export interface HmiGatewaySnapshot {
  version: 1; allowWrites: boolean;
  connections: { id: string; state: string; error?: string; diagnostic?: ConnectionDiagnostic }[];
  diagnostics?: ConnectionDiagnostic[];
  tags: { name: string; dataType: string; access: string; connectionId: string; writable: boolean }[];
  samples: HmiGatewaySample[];
}
export interface HmiGatewayWriteResult { id: string; tag: string; outcome: "delivered"; delivery: "broker-ack" | "transport" | "opcua-service"; plcConfirmed: false }
export interface HmiGatewayOptions {
  path?: string; pollMs?: number; timeoutMs?: number; request?: typeof fetch;
  onSnapshot?: (snapshot: HmiGatewaySnapshot) => void;
  onState?: (state: "connecting" | "connected" | "disconnected" | "stopped", error?: string) => void;
  onDiagnostic?: (event: ConnectionDiagnostic) => void;
}
export class HmiGatewayCommandError extends Error {
  constructor(message: string, public readonly outcome: "rejected" | "uncertain", public readonly diagnostic?: ConnectionDiagnostic) { super(message); this.name = "HmiGatewayCommandError"; }
}

export function createHmiGatewayClient(options: HmiGatewayOptions = {}) {
  const path = options.path ?? "/_framecraft/plc/v1", pollMs = options.pollMs ?? 250, timeoutMs = options.timeoutMs ?? 15_000;
  if (!/^\/(?!\/)[A-Za-z0-9_/-]+$/.test(path) || path.endsWith("/") || path.split("/").includes("..")) throw new Error("Il gateway richiede un percorso locale alla stessa origine.");
  if (!Number.isFinite(pollMs) || pollMs < 100 || pollMs > 60_000 || !Number.isFinite(timeoutMs) || timeoutMs < 250 || timeoutMs > 70_000) throw new Error("Intervallo gateway non valido.");
  let running = false, generation = 0, timer: ReturnType<typeof setTimeout> | undefined, last = "", snapshot: HmiGatewaySnapshot | undefined;
  let state = "stopped", stateError: string | undefined;
  const seen = new Set<string>();
  const report = createDiagnosticReporter(options.onDiagnostic, { protocol: "gateway" });
  const commandError = (code: string, outcome: "rejected" | "uncertain" = "rejected", tag?: string) => {
    const event = report(code, { tag }); return new HmiGatewayCommandError(diagnosticText(event), outcome, event);
  };
  const httpCode = (status: number) => status === 401 ? "GATEWAY_AUTH" : status === 403 ? "GATEWAY_ORIGIN" : status === 429 ? "GATEWAY_BUSY" : [400, 404, 413, 415, 422].includes(status) ? "GATEWAY_REQUEST" : "GATEWAY_OFFLINE";
  const parseDiagnostic = (data: unknown): ConnectionDiagnostic => {
    const event = data as ConnectionDiagnostic;
    if (!event || typeof event !== "object" || typeof event.code !== "string" || !Object.hasOwn(connectionMessages, event.code)
      || !["mqtt", "opcua", "gateway"].includes(event.protocol) || !Number.isFinite(event.timestamp) || Math.abs(event.timestamp) > 8640000000000000
      || event.id !== undefined && (typeof event.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(event.id))
      || event.connectionId !== undefined && (typeof event.connectionId !== "string" || event.connectionId.length > 200)
      || event.tag !== undefined && (typeof event.tag !== "string" || event.tag.length > 200)
      || event.occurrences !== undefined && (!Number.isSafeInteger(event.occurrences) || event.occurrences < 1)) throw new Error("Diagnostica gateway non valida.");
    return { ...connectionDiagnostic(event.code, event), ...(event.id ? { id: event.id } : {}), ...(event.occurrences ? { occurrences: event.occurrences } : {}) };
  };
  const pending = new Set<AbortController>();
  const changeState = (next: "connecting" | "connected" | "disconnected" | "stopped", error?: string) => {
    if (state === next && stateError === error) return; state = next; stateError = error; safeNotify(() => options.onState?.(next, error), undefined);
  };
  const json = async (suffix: string, init?: RequestInit, signal?: AbortSignal) => {
    const controller = new AbortController(); pending.add(controller);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (options.request ?? fetch)(path + suffix, { ...init, signal: controller.signal, credentials: "same-origin", cache: "no-store", redirect: "error" });
      const limit = 4_194_304, reader = response.body?.getReader();
      let text = "";
      if (reader) {
        const decoder = new TextDecoder(); let size = 0;
        try {
          while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > limit) { await reader.cancel(); throw new Error("Risposta gateway troppo grande."); }
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
        } finally { reader.releaseLock(); }
      } else { text = await response.text(); if (text.length > limit) throw new Error("Risposta gateway troppo grande."); }
      return { ok: response.ok, status: response.status, data: JSON.parse(text) as unknown };
    } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); pending.delete(controller); }
  };
  const parse = (data: unknown): HmiGatewaySnapshot => {
    if (!data || typeof data !== "object") throw new Error("Snapshot gateway non valido.");
    const value = data as HmiGatewaySnapshot;
    if (value.version !== 1 || typeof value.allowWrites !== "boolean" || !Array.isArray(value.connections) || !Array.isArray(value.tags) || !Array.isArray(value.samples)
      || value.tags.length > 5_000 || value.samples.length > 5_000 || value.connections.length > 1_000) throw new Error("Snapshot gateway non valido.");
    const connectionIds = new Set<string>(), tags = new Map<string, string>();
    for (const connection of value.connections) {
      if (!connection || typeof connection.id !== "string" || !connection.id || connectionIds.has(connection.id) || !["stopped", "connecting", "connected", "reconnecting", "error"].includes(connection.state)) throw new Error("Stato connessione gateway non valido.");
      connectionIds.add(connection.id);
      if (connection.diagnostic !== undefined) { connection.diagnostic = parseDiagnostic(connection.diagnostic); connection.error = diagnosticText(connection.diagnostic); }
      else if (connection.error !== undefined) connection.error = diagnosticText(connectionDiagnostic("NETWORK_ERROR"));
    }
    for (const tag of value.tags) {
      if (!tag || typeof tag.name !== "string" || !tag.name || tag.name.length > 200 || tags.has(tag.name) || !connectionIds.has(tag.connectionId)
        || typeof tag.dataType !== "string" || !["read", "write", "read-write"].includes(tag.access) || typeof tag.writable !== "boolean") throw new Error("Catalogo gateway non valido.");
      tags.set(tag.name, tag.connectionId);
    }
    const samples = new Set<string>();
    for (const sample of value.samples) {
      if (!sample || tags.get(sample.tag) !== sample.connectionId || samples.has(sample.tag) || !Number.isFinite(sample.receivedAt)
        || sample.value !== undefined && typeof sample.value !== "string" || sample.qualityCode !== undefined && (!Number.isInteger(sample.qualityCode) || sample.qualityCode < 0 || sample.qualityCode > 65_535)
        || sample.timestamp !== undefined && !Number.isFinite(sample.timestamp) || sample.sourceTimestamp !== undefined && !Number.isFinite(sample.sourceTimestamp)
        || sample.serverTimestamp !== undefined && !Number.isFinite(sample.serverTimestamp)
        || sample.opcUaStatusCode !== undefined && (!Number.isInteger(sample.opcUaStatusCode) || sample.opcUaStatusCode < 0 || sample.opcUaStatusCode > 0xffffffff)
        || sample.lastError !== undefined && typeof sample.lastError !== "string" || sample.errorDescription !== undefined && typeof sample.errorDescription !== "string") throw new Error("Campione gateway non valido.");
      samples.add(sample.tag);
    }
    if (value.diagnostics !== undefined) {
      if (!Array.isArray(value.diagnostics) || value.diagnostics.length > 100) throw new Error("Registro gateway non valido.");
      value.diagnostics = value.diagnostics.map(parseDiagnostic);
    }
    return value;
  };
  const poll = async (token: number) => {
    if (!running || token !== generation) return;
    try {
      const result = await json("/snapshot"); if (!running || token !== generation) return;
      if (!result.ok) throw commandError(httpCode(result.status));
      const next = parse(result.data); snapshot = next; changeState("connected");
      if (!running || token !== generation) return;
      for (const event of next.diagnostics ?? []) {
        if (!event.id || seen.has(event.id)) continue;
        seen.add(event.id); if (seen.size > 200) seen.delete(seen.values().next().value!);
        safeNotify(options.onDiagnostic, { ...event });
        if (!running || token !== generation) return;
      }
      const signature = JSON.stringify(next); if (signature !== last) { last = signature; safeNotify(options.onSnapshot, structuredClone(next)); }
    } catch (error) {
      if (!running || token !== generation) return;
      const event = error instanceof HmiGatewayCommandError && error.diagnostic ? error.diagnostic : report("GATEWAY_OFFLINE");
      if (!running || token !== generation) return;
      snapshot = undefined; last = ""; changeState("disconnected", diagnosticText(event));
    } finally { if (running && token === generation) timer = setTimeout(() => { void poll(token); }, pollMs); }
  };
  return {
    get state() { return state; },
    start() { if (running) return; running = true; const token = ++generation; changeState("connecting"); void poll(token); },
    stop() { running = false; generation++; clearTimeout(timer); for (const controller of pending) controller.abort(); snapshot = undefined; last = ""; changeState("stopped"); },
    async read(tag: string, options: { mode?: number; maxAge?: number; signal?: AbortSignal } = {}): Promise<HmiGatewaySample> {
      if (options.signal?.aborted || !running || state !== "connected" || !snapshot) throw new HmiGatewayCommandError("Gateway non disponibile per la lettura.", "rejected");
      if (options.mode === 1 || options.maxAge === 0) throw new HmiGatewayCommandError("MQTT non supporta la lettura forzata dalla CPU: sono disponibili soltanto i campioni ricevuti.", "rejected");
      if (options.mode !== undefined && options.mode !== 0 || options.maxAge !== undefined && (!Number.isInteger(options.maxAge) || options.maxAge < 0 || options.maxAge > 0xffffffff)) throw new HmiGatewayCommandError("Parametri di lettura non validi.", "rejected");
      const definition = snapshot.tags.find((item) => item.name === tag);
      if (!definition || definition.access === "write" || !snapshot.connections.some((item) => item.id === definition.connectionId && item.state === "connected")) throw new HmiGatewayCommandError("Tag non leggibile o connessione PLC non disponibile.", "rejected");
      const sample = snapshot.samples.find((item) => item.tag === tag);
      if (!sample || sample.value === undefined || sample.lastError || sample.qualityCode !== undefined && (sample.qualityCode & 0xc0) === 0) throw new HmiGatewayCommandError(sample?.errorDescription ?? "Nessun campione PLC valido disponibile per questo tag. Controlla sorgente, mapping e qualità nella diagnostica PLC.", "rejected");
      const sourceAge = sample.opcUaStatusCode !== undefined ? 0 : Date.now() - (sample.sourceTimestamp ?? sample.receivedAt);
      if (options.maxAge !== undefined && Math.max(Date.now() - sample.receivedAt, sourceAge) > options.maxAge) throw new HmiGatewayCommandError("Il campione PLC e' piu' vecchio del limite richiesto; nessuna lettura CPU simulata.", "rejected");
      return { ...sample };
    },
    async write(tag: string, value: string | number | boolean, signal?: AbortSignal): Promise<HmiGatewayWriteResult> {
      if (signal?.aborted) throw commandError("WRITE_OFFLINE", "rejected", tag);
      if (!running || state !== "connected" || !snapshot) throw commandError("WRITE_OFFLINE", "rejected", tag);
      const definition = snapshot.tags.find((item) => item.name === tag);
      if (!snapshot.allowWrites || !definition?.writable || definition.access === "read") throw commandError("WRITE_DENIED", "rejected", tag);
      if (!snapshot.connections.some((connection) => connection.id === definition.connectionId && connection.state === "connected")) throw commandError("WRITE_OFFLINE", "rejected", tag);
      try { value = normalizeMqttTagValue(value, definition.dataType); } catch { throw commandError("WRITE_INVALID", "rejected", tag); }
      const id = crypto.randomUUID().replaceAll("-", ""), token = generation;
      try {
        const result = await json("/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, tag, value }) }, signal);
        if (!running || token !== generation) throw new Error("Sessione interrotta.");
        const data = result.data as Record<string, unknown>;
        if (!data || typeof data !== "object") throw new Error("Risposta comando non valida.");
        if (!result.ok) {
          const outcome = data.outcome === "rejected" ? "rejected" : "uncertain";
          const event = data.diagnostic !== undefined ? parseDiagnostic(data.diagnostic) : connectionDiagnostic(outcome === "uncertain" ? "WRITE_UNCERTAIN" : httpCode(result.status), { protocol: "gateway", tag });
          safeNotify(options.onDiagnostic, event);
          throw new HmiGatewayCommandError(diagnosticText(event), outcome, event);
        }
        if (data.id !== id || data.tag !== tag || data.outcome !== "delivered" || data.plcConfirmed !== false || typeof data.delivery !== "string" || !["broker-ack", "transport", "opcua-service"].includes(data.delivery)) throw new Error("Conferma gateway non valida.");
        return data as unknown as HmiGatewayWriteResult;
      } catch (error) {
        if (error instanceof HmiGatewayCommandError) throw error;
        throw commandError("WRITE_UNCERTAIN", "uncertain", tag);
      }
    },
  };
}
