import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createMqttPlcConnection, normalizeMqttTagValue } from "./mqtt-driver.mjs";
import { validateConnectionCatalog } from "./connection-config.mjs";

const api = "/_framecraft/plc/v1";
function failure(status, message) { return Object.assign(new Error(message), { status }); }
function body(request) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    const cleanup = () => { request.off("data", data); request.off("end", end); request.off("error", error); request.off("aborted", aborted); };
    const error = () => { cleanup(); reject(failure(400, "Richiesta interrotta.")); };
    const aborted = () => error();
    const data = (chunk) => {
      size += chunk.length;
      if (size > 16_384) { cleanup(); request.resume(); reject(failure(413, "Comando troppo grande.")); }
      else chunks.push(chunk);
    };
    const end = () => { cleanup(); try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(failure(400, "JSON del comando non valido.")); } };
    request.on("data", data); request.once("end", end); request.once("error", error); request.once("aborted", aborted);
  });
}

export function createMqttGateway(catalog, variables, options = {}) {
  catalog = JSON.parse(JSON.stringify(catalog));
  const config = catalog?.gateway;
  if (config?.enabled !== true) throw new Error("Gateway non abilitato o catalogo non valido.");
  validateConnectionCatalog(catalog, variables, { allowEphemeralPort: true });
  const token = (options.resolveSecret ?? ((name) => process.env[name]))(config.tokenEnv);
  if (typeof token !== "string" || !/^[A-Za-z0-9_\-+/=]{32,512}$/.test(token)) throw new Error("Token gateway non disponibile o troppo corto.");
  const enabled = catalog.connections.filter((connection) => connection.enabled === true);
  const owners = new Map(), states = new Map(), commands = new Map(); let stopping = false, port, active = 0;
  const connections = enabled.map((connection) => {
    const driver = createMqttPlcConnection(connection, variables, {
      resolveSecret: options.resolveSecret,
      onError: options.onError,
      onState: (state) => { states.set(connection.id, state); options.onState?.(state); },
    });
    for (const binding of connection.bindings) {
      if (owners.has(binding.tag)) throw new Error("Un tag non può avere due sorgenti MQTT attive.");
      const variable = variables.find((item) => item.name === binding.tag);
      owners.set(binding.tag, { driver, connectionId: connection.id, name: binding.tag, dataType: variable.dataType, access: variable.access,
        writable: config.allowWrites === true && connection.allowWrites === true && variable.access !== "read" && Boolean(binding.writeTopic) });
    }
    states.set(connection.id, { id: connection.id, state: "stopped" }); return driver;
  });
  const snapshot = () => ({ version: 1, allowWrites: config.allowWrites === true,
    connections: [...states.values()].map((state) => ({ ...state })),
    tags: [...owners.values()].map(({ name, dataType, access, connectionId, writable }) => ({ name, dataType, access, connectionId, writable })),
    samples: [...owners.values()].flatMap(({ name, driver, connectionId }) => { const sample = driver.read(name); return sample ? [{ ...sample, connectionId }] : []; }),
  });
  const respond = (response, status, value) => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(JSON.stringify(value));
  };
  const server = createServer({ requestTimeout: 5_000, headersTimeout: 5_000, maxHeaderSize: 8_192 }, async (request, response) => {
    let accepted = false;
    try {
      if (stopping) throw failure(503, "Gateway in arresto.");
      if (!["127.0.0.1:" + port, "localhost:" + port].includes(request.headers.host)) throw failure(403, "Host non autorizzato.");
      if (request.headers.origin !== undefined && !config.allowedOrigins.includes(request.headers.origin)) throw failure(403, "Origine non autorizzata.");
      const actual = Buffer.from(typeof request.headers.authorization === "string" ? request.headers.authorization : ""); const expected = Buffer.from("Bearer " + token);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw failure(401, "Gateway non autorizzato.");
      if (request.url === api + "/snapshot" && request.method === "GET") { respond(response, 200, snapshot()); return; }
      if (request.url !== api + "/write" || request.method !== "POST") throw failure(404, "Operazione gateway non disponibile.");
      if ((request.headers["content-type"] ?? "").split(";")[0].trim() !== "application/json") throw failure(415, "Il comando richiede application/json.");
      if (active >= 32) throw failure(429, "Troppi comandi in corso.");
      active++; accepted = true;
      const command = await body(request);
      if (!command || typeof command !== "object" || Array.isArray(command) || typeof command.id !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(command.id)
        || typeof command.tag !== "string" || !["string", "number", "boolean"].includes(typeof command.value) || typeof command.value === "number" && !Number.isFinite(command.value)
        || Object.keys(command).some((key) => !["id", "tag", "value"].includes(key))) throw failure(400, "Comando gateway non valido.");
      const owner = owners.get(command.tag); if (!owner?.writable) throw failure(403, "Scrittura non autorizzata per questo tag.");
      try { normalizeMqttTagValue(command.value, owner.dataType); } catch { throw failure(400, "Valore fuori dal tipo PLC dichiarato."); }
      const fingerprint = JSON.stringify([command.tag, command.value]); const known = commands.get(command.id);
      if (known) {
        if (known.fingerprint !== fingerprint) throw failure(409, "Id comando già usato per un'altra richiesta.");
        const result = await known.result; respond(response, result.status, result.body); return;
      }
      if (owner.driver.state !== "connected") throw failure(503, "MQTT non disponibile; comando non accodato.");
      const now = Date.now(); for (const [id, entry] of commands) if (entry.expires <= now && entry.finished) commands.delete(id);
      if (commands.size >= 1_000) throw failure(429, "Registro comandi pieno; riprova dopo la scadenza, senza ritentare comandi incerti.");
      const entry = { fingerprint, expires: now + 300_000, finished: false, result: undefined };
      // L'id resta registrato anche se il chiamante interrompe HTTP: nessun replay del comando.
      entry.result = owner.driver.write(command.tag, command.value).then((delivery) => ({ status: 200, body: { id: command.id, outcome: "delivered", ...delivery } }), () => ({ status: 502, body: { id: command.id, tag: command.tag, outcome: "uncertain", plcConfirmed: false, error: "Comando non confermato; non ritentare automaticamente." } })).finally(() => { entry.finished = true; });
      commands.set(command.id, entry); const result = await entry.result; respond(response, result.status, result.body);
    } catch (error) { respond(response, error.status ?? 500, { outcome: "rejected", error: error.status ? error.message : "Errore gateway." }); }
    finally { if (accepted) active--; }
  });
  server.maxConnections = 64; server.setTimeout(70_000, (socket) => socket.destroy());
  return {
    snapshot,
    get address() { return port === undefined ? undefined : "http://127.0.0.1:" + port; },
    async start() {
      if (server.listening) return;
      if (stopping) throw new Error("Il gateway arrestato non può essere riavviato.");
      await new Promise((resolve, reject) => { const error = (cause) => reject(cause); server.once("error", error); server.listen(config.port, "127.0.0.1", () => { server.off("error", error); port = server.address().port; resolve(); }); });
      await Promise.allSettled(connections.map((driver) => driver.start()));
    },
    async stop() {
      if (stopping) return; stopping = true;
      const closed = server.listening ? new Promise((resolve) => server.close(resolve)) : Promise.resolve(); server.closeAllConnections();
      await Promise.allSettled(connections.map((driver) => driver.stop())); await closed; commands.clear();
    },
  };
}
