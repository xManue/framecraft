export interface HmiGatewaySample {
  tag: string; connectionId: string; value?: string; qualityCode?: number; timestamp?: number; sourceTimestamp?: number;
  receivedAt: number; retained?: boolean; lastError?: string; errorDescription?: string;
}
export interface HmiGatewaySnapshot {
  version: 1; allowWrites: boolean;
  connections: { id: string; state: string; error?: string }[];
  tags: { name: string; dataType: string; access: string; connectionId: string; writable: boolean }[];
  samples: HmiGatewaySample[];
}
export interface HmiGatewayWriteResult { id: string; tag: string; outcome: "delivered"; delivery: "broker-ack" | "transport"; plcConfirmed: false }
export interface HmiGatewayOptions {
  path?: string; pollMs?: number; timeoutMs?: number; request?: typeof fetch;
  onSnapshot?: (snapshot: HmiGatewaySnapshot) => void;
  onState?: (state: "connecting" | "connected" | "disconnected" | "stopped", error?: string) => void;
}
export class HmiGatewayCommandError extends Error {
  constructor(message: string, public readonly outcome: "rejected" | "uncertain") { super(message); this.name = "HmiGatewayCommandError"; }
}

export function createHmiGatewayClient(options: HmiGatewayOptions = {}) {
  const path = options.path ?? "/_framecraft/plc/v1", pollMs = options.pollMs ?? 250, timeoutMs = options.timeoutMs ?? 15_000;
  if (!/^\/(?!\/)[A-Za-z0-9_/-]+$/.test(path) || path.endsWith("/") || path.split("/").includes("..")) throw new Error("Il gateway richiede un percorso locale alla stessa origine.");
  if (!Number.isFinite(pollMs) || pollMs < 100 || pollMs > 60_000 || !Number.isFinite(timeoutMs) || timeoutMs < 250 || timeoutMs > 70_000) throw new Error("Intervallo gateway non valido.");
  let running = false, generation = 0, timer: ReturnType<typeof setTimeout> | undefined, last = "", snapshot: HmiGatewaySnapshot | undefined;
  let state = "stopped", stateError: string | undefined;
  const pending = new Set<AbortController>();
  const changeState = (next: "connecting" | "connected" | "disconnected" | "stopped", error?: string) => {
    if (state === next && stateError === error) return; state = next; stateError = error; options.onState?.(next, error);
  };
  const json = async (suffix: string, init?: RequestInit) => {
    const controller = new AbortController(); pending.add(controller);
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
      return { ok: response.ok, data: JSON.parse(text) as unknown };
    } finally { clearTimeout(timeout); pending.delete(controller); }
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
        || sample.lastError !== undefined && typeof sample.lastError !== "string" || sample.errorDescription !== undefined && typeof sample.errorDescription !== "string") throw new Error("Campione gateway non valido.");
      samples.add(sample.tag);
    }
    return value;
  };
  const poll = async (token: number) => {
    try {
      const result = await json("/snapshot"); if (!running || token !== generation) return;
      if (!result.ok) throw new Error("Gateway non disponibile o non autorizzato.");
      const next = parse(result.data); snapshot = next; changeState("connected");
      const signature = JSON.stringify(next); if (signature !== last) { last = signature; options.onSnapshot?.(next); }
    } catch {
      if (!running || token !== generation) return;
      snapshot = undefined; last = ""; changeState("disconnected", "Gateway non disponibile; le scritture non vengono accodate.");
    } finally { if (running && token === generation) timer = setTimeout(() => { void poll(token); }, pollMs); }
  };
  return {
    get state() { return state; },
    start() { if (running) return; running = true; const token = ++generation; changeState("connecting"); void poll(token); },
    stop() { running = false; generation++; clearTimeout(timer); for (const controller of pending) controller.abort(); snapshot = undefined; last = ""; changeState("stopped"); },
    async write(tag: string, value: string | number | boolean): Promise<HmiGatewayWriteResult> {
      if (!running || state !== "connected" || !snapshot) throw new HmiGatewayCommandError("Gateway non disponibile; comando non accodato.", "rejected");
      const definition = snapshot.tags.find((item) => item.name === tag);
      if (!snapshot.allowWrites || !definition?.writable || definition.access === "read") throw new HmiGatewayCommandError("Scrittura gateway non autorizzata per questo tag.", "rejected");
      if (!snapshot.connections.some((connection) => connection.id === definition.connectionId && connection.state === "connected")) throw new HmiGatewayCommandError("MQTT non disponibile; comando non accodato.", "rejected");
      if (!["string", "number", "boolean"].includes(typeof value) || typeof value === "number" && !Number.isFinite(value)) throw new HmiGatewayCommandError("Valore comando non valido.", "rejected");
      const id = crypto.randomUUID().replaceAll("-", ""), token = generation;
      try {
        const result = await json("/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, tag, value }) });
        if (!running || token !== generation) throw new Error("Sessione interrotta.");
        const data = result.data as Record<string, unknown>;
        if (!data || typeof data !== "object") throw new Error("Risposta comando non valida.");
        if (!result.ok) throw new HmiGatewayCommandError(typeof data.error === "string" ? data.error : "Comando gateway non confermato.", data.outcome === "rejected" ? "rejected" : "uncertain");
        if (data.id !== id || data.tag !== tag || data.outcome !== "delivered" || data.plcConfirmed !== false || typeof data.delivery !== "string" || !["broker-ack", "transport"].includes(data.delivery)) throw new Error("Conferma gateway non valida.");
        return data as unknown as HmiGatewayWriteResult;
      } catch (error) {
        if (error instanceof HmiGatewayCommandError) throw error;
        throw new HmiGatewayCommandError("Esito del comando incerto; non ritentare automaticamente.", "uncertain");
      }
    },
  };
}
