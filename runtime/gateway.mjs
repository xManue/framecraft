import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createMqttPlcConnection, normalizeMqttTagValue } from "./mqtt-driver.mjs";
import { createOpcUaPlcConnection } from "./opcua-driver.mjs";
import { validateConnectionCatalog } from "./connection-config.mjs";
import { createAlarmEngine } from "./alarm-engine.mjs";
import { ConnectionOperationError, connectionDiagnostic, createDiagnosticReporter, diagnosticText, safeNotify } from "./connection-diagnostics.mjs";

const api = "/_framecraft/plc/v1";
function failure(status, code = "GATEWAY_REQUEST") { return Object.assign(new ConnectionOperationError(connectionDiagnostic(code, { protocol: "gateway" })), { status }); }
function body(request) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    const timeout = setTimeout(() => { cleanup(); request.resume(); reject(failure(408)); }, 5000);
    const cleanup = () => { clearTimeout(timeout); request.off("data", data); request.off("end", end); request.off("error", error); request.off("aborted", aborted); };
    const error = () => { cleanup(); reject(failure(400)); };
    const aborted = () => error();
    const data = (chunk) => {
      size += chunk.length;
      if (size > 16_384) { cleanup(); request.resume(); reject(failure(413)); }
      else chunks.push(chunk);
    };
    const end = () => { cleanup(); try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(failure(400)); } };
    request.on("data", data); request.once("end", end); request.once("error", error); request.once("aborted", aborted);
  });
}

export function createPlcGateway(catalog, variables, options = {}) {
  catalog = JSON.parse(JSON.stringify(catalog));
  const config = catalog?.gateway;
  if (config?.enabled !== true) throw new Error("Gateway non abilitato o catalogo non valido.");
  validateConnectionCatalog(catalog, variables, { allowEphemeralPort: true });
  let token;
  try { token = (options.resolveSecret ?? ((name) => process.env[name]))(config.tokenEnv); } catch { throw new ConnectionOperationError(connectionDiagnostic("SECRET_MISSING", { protocol: "gateway" })); }
  if (typeof token !== "string" || !/^[A-Za-z0-9_\-+/=]{32,512}$/.test(token)) throw new ConnectionOperationError(connectionDiagnostic("SECRET_MISSING", { protocol: "gateway" }));
  const enabled = catalog.connections.filter((connection) => connection.enabled === true);
  const owners = new Map(), states = new Map(), commands = new Map(), diagnostics = []; let stopping = false, port, active = 0, startTask, stopTask;
  const record = (event) => {
    const diagnostic = { ...event, id: randomUUID().replaceAll("-", "") };
    diagnostics.push(diagnostic); if (diagnostics.length > 100) diagnostics.shift();
    safeNotify(options.onDiagnostic, { ...diagnostic });
  };
  const report = createDiagnosticReporter(record, { protocol: "gateway" });
  const alarms = options.alarmCatalog !== undefined ? createAlarmEngine(options.alarmCatalog, variables, { onEvent: options.onAlarmEvent }) : undefined;
  const connections = enabled.map((connection) => {
    const driver = (connection.protocol === "opcua" ? createOpcUaPlcConnection : createMqttPlcConnection)(connection, variables, {
      resolveSecret: options.resolveSecret,
      onError: options.onError,
      onDiagnostic: record,
      onSample: (sample) => alarms?.updateSample(sample),
      onState: (state) => { states.set(connection.id, { ...state, ...(state.diagnostic ? { diagnostic: { ...state.diagnostic } } : {}) }); safeNotify(options.onState, state); },
    });
    for (const binding of connection.bindings) {
      if (owners.has(binding.tag)) throw new Error("Un tag non può avere due sorgenti PLC attive.");
      const variable = variables.find((item) => item.name === binding.tag);
      owners.set(binding.tag, { driver, protocol: connection.protocol, connectionId: connection.id, name: binding.tag, dataType: variable.dataType, access: variable.access,
        writable: config.allowWrites === true && connection.allowWrites === true && variable.access !== "read" && (connection.protocol === "opcua" ? binding.writeEnabled === true : Boolean(binding.writeTopic)) });
    }
    states.set(connection.id, { id: connection.id, state: "stopped" }); return driver;
  });
  const snapshot = () => ({ version: 1, allowWrites: config.allowWrites === true,
    ...(alarms ? { alarms: { ...alarms.snapshot(), actionsEnabled: typeof options.authorizeAlarmAction === "function" } } : {}),
    diagnostics: diagnostics.map((event) => ({ ...event })),
    connections: [...states.values()].map((state) => ({ ...state, ...(state.diagnostic ? { diagnostic: { ...state.diagnostic } } : {}) })),
    tags: [...owners.values()].map(({ name, dataType, access, connectionId, writable }) => ({ name, dataType, access, connectionId, writable })),
    samples: [...owners.values()].flatMap(({ name, driver, connectionId }) => { const sample = driver.read(name); return sample ? [{ ...sample, connectionId }] : []; }),
  });
  const respond = (response, status, value) => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(JSON.stringify(value));
  };
  const server = createServer({ requestTimeout: 5_000, headersTimeout: 5_000, maxHeaderSize: 8_192 }, async (request, response) => {
    request.on("error", () => {});
    let accepted = false;
    try {
      if (stopping) throw failure(503, "GATEWAY_OFFLINE");
      if (!["127.0.0.1:" + port, "localhost:" + port].includes(request.headers.host)) throw failure(403, "GATEWAY_ORIGIN");
      if (request.headers.origin !== undefined && !config.allowedOrigins.includes(request.headers.origin)) throw failure(403, "GATEWAY_ORIGIN");
      const actual = Buffer.from(typeof request.headers.authorization === "string" ? request.headers.authorization : ""); const expected = Buffer.from("Bearer " + token);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw failure(401, "GATEWAY_AUTH");
      if (request.url === api + "/snapshot" && request.method === "GET") { respond(response, 200, snapshot()); return; }
      if (request.url === api + "/alarm-action" && request.method === "POST") {
        if (!alarms || typeof options.authorizeAlarmAction !== "function") { respond(response, 403, { error: "Presa visione non abilitata: configura autenticazione e autorizzazioni nel servizio. Il PIN del browser non basta." }); return; }
        if ((request.headers["content-type"] ?? "").split(";")[0].trim() !== "application/json") throw failure(415);
        if (active >= 32) throw failure(429, "GATEWAY_BUSY");
        active++; accepted = true;
        const command = await body(request);
        if (!command || typeof command.alarmId !== "string" || typeof command.occurrence !== "string" || !Number.isSafeInteger(command.revision) || !["acknowledge", "confirm"].includes(command.action)
          || Object.keys(command).some((key) => !["alarmId", "occurrence", "revision", "action"].includes(key))) throw failure(400);
        let actor, authorizationTimer;
        try { actor = await Promise.race([options.authorizeAlarmAction(request, { ...command }), new Promise((resolve) => { authorizationTimer = setTimeout(() => resolve(undefined), 5000); })]); } catch { /* Identity failures never authorize an alarm action. */ }
        finally { clearTimeout(authorizationTimer); }
        if (stopping) throw failure(503, "GATEWAY_OFFLINE");
        if (typeof actor !== "string" || !actor.trim() || actor.length > 200 || /[\x00-\x1f]/.test(actor)) { respond(response, 403, { error: "Operatore non autorizzato alla presa visione o alla conferma di questo allarme." }); return; }
        try { respond(response, 200, { alarms: { ...alarms.action(command, actor), actionsEnabled: true } }); }
        catch (error) { respond(response, 409, { error: error.message }); }
        return;
      }
      if (request.url !== api + "/write" || request.method !== "POST") throw failure(404);
      if ((request.headers["content-type"] ?? "").split(";")[0].trim() !== "application/json") throw failure(415);
      if (active >= 32) throw failure(429, "GATEWAY_BUSY");
      active++; accepted = true;
      const command = await body(request);
      if (!command || typeof command !== "object" || Array.isArray(command) || typeof command.id !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(command.id)
        || typeof command.tag !== "string" || !["string", "number", "boolean"].includes(typeof command.value) || typeof command.value === "number" && !Number.isFinite(command.value)
        || Object.keys(command).some((key) => !["id", "tag", "value"].includes(key))) throw failure(400);
      const owner = owners.get(command.tag); if (!owner?.writable) throw failure(403, "WRITE_DENIED");
      try { normalizeMqttTagValue(command.value, owner.dataType); } catch { throw failure(400, "WRITE_INVALID"); }
      const fingerprint = JSON.stringify([command.tag, command.value]); const known = commands.get(command.id);
      if (known) {
        if (known.fingerprint !== fingerprint) throw failure(409, "GATEWAY_CONFLICT");
        const result = await known.result; respond(response, result.status, result.body); return;
      }
      if (owner.driver.state !== "connected") throw failure(503, "WRITE_OFFLINE");
      const now = Date.now(); for (const [id, entry] of commands) if (entry.expires <= now && entry.finished) commands.delete(id);
      if (commands.size >= 1_000) throw failure(429, "GATEWAY_BUSY");
      const entry = { fingerprint, expires: now + 300_000, finished: false, result: undefined };
      // L'id resta registrato anche se il chiamante interrompe HTTP: nessun replay del comando.
      entry.result = owner.driver.write(command.tag, command.value).then((delivery) => ({ status: 200, body: { id: command.id, outcome: "delivered", ...delivery } }), (error) => {
        const rejected = error instanceof ConnectionOperationError && error.outcome === "rejected";
        const diagnostic = error instanceof ConnectionOperationError ? error.diagnostic : connectionDiagnostic("WRITE_UNCERTAIN", { protocol: owner.protocol, connectionId: owner.connectionId, tag: command.tag });
        return { status: rejected ? diagnostic.code === "WRITE_OFFLINE" ? 503 : 422 : 502, body: { id: command.id, tag: command.tag, outcome: rejected ? "rejected" : "uncertain", plcConfirmed: false, error: diagnosticText(diagnostic), diagnostic } };
      }).finally(() => { entry.finished = true; });
      commands.set(command.id, entry); const result = await entry.result; respond(response, result.status, result.body);
    } catch (error) {
      const diagnostic = report(error instanceof ConnectionOperationError ? error.diagnostic.code : "GATEWAY_REQUEST");
      respond(response, error.status ?? 500, { outcome: "rejected", error: diagnosticText(diagnostic), diagnostic });
    }
    finally { if (accepted) active--; }
  });
  server.maxConnections = 64; server.setTimeout(70_000, (socket) => socket.destroy());
  return {
    snapshot,
    get address() { return port === undefined ? undefined : "http://127.0.0.1:" + port; },
    start() {
      if (stopping) return Promise.reject(new Error("Il gateway arrestato non può essere riavviato."));
      if (startTask) return startTask;
      startTask = (async () => {
        await new Promise((resolve, reject) => { const error = (cause) => reject(new ConnectionOperationError(report("GATEWAY_LISTEN", { technicalCode: cause.code }))); server.once("error", error); server.listen(config.port, "127.0.0.1", () => { server.off("error", error); port = server.address().port; resolve(); }); });
        if (!stopping) await Promise.allSettled(connections.map((driver) => driver.start()));
      })();
      return startTask;
    },
    stop() {
      if (stopTask) return stopTask; stopping = true;
      stopTask = (async () => {
        server.closeAllConnections();
        await Promise.allSettled(connections.map((driver) => driver.stop()));
        await startTask?.catch(() => {});
        const closed = server.listening ? new Promise((resolve) => server.close(resolve)) : Promise.resolve(); server.closeAllConnections();
        await closed; commands.clear();
      })();
      return stopTask;
    },
  };
}

// Compatibility for existing integrations; the gateway now accepts both protocols.
export const createMqttGateway = createPlcGateway;
