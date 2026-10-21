import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createMqttPlcConnection, normalizeMqttTagValue } from "./mqtt-driver.mjs";
import { createOpcUaPlcConnection } from "./opcua-driver.mjs";
import { validateConnectionCatalog } from "./connection-config.mjs";
import { createAlarmEngine } from "./alarm-engine.mjs";
import { ConnectionOperationError, connectionDiagnostic, createDiagnosticReporter, diagnosticText, safeNotify } from "./connection-diagnostics.mjs";
import { RecipeStoreError, parseRecipeCommand, recipeActor } from "./recipe-catalog.mjs";
import { OperatorAuthError, operatorText } from "./operator-policy.mjs";
import { auditContext, appendAudit as persistAuditEvent, runAudited as auditOperation } from "./audit-operation.mjs";
import { parseAuditQuery, parseAuditSnapshot } from "./audit-query.mjs";

const api = "/_framecraft/plc/v1";
function failure(status, code = "GATEWAY_REQUEST") { return Object.assign(new ConnectionOperationError(connectionDiagnostic(code, { protocol: "gateway" })), { status }); }
function body(request, maxBytes = 16_384) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    const timeout = setTimeout(() => { cleanup(); request.resume(); reject(failure(408)); }, 5000);
    const cleanup = () => { clearTimeout(timeout); request.off("data", data); request.off("end", end); request.off("error", error); request.off("aborted", aborted); };
    const error = () => { cleanup(); reject(failure(400)); };
    const aborted = () => error();
    const data = (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { cleanup(); request.resume(); reject(failure(413)); }
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
  const owners = new Map(), states = new Map(), commands = new Map(), diagnostics = [], recipeTasks = new Set(), auditTasks = new Set(); let stopping = false, port, active = 0, startTask, stopTask;
  const trackAudit = task => { auditTasks.add(task); task.then(() => auditTasks.delete(task), () => auditTasks.delete(task)); return task; };
  const appendAudit = (...args) => trackAudit(persistAuditEvent(...args));
  const runAudited = (...args) => trackAudit(auditOperation(...args));
  const record = (event) => {
    const diagnostic = { ...event, id: randomUUID().replaceAll("-", "") };
    diagnostics.push(diagnostic); if (diagnostics.length > 100) diagnostics.shift();
    safeNotify(options.onDiagnostic, { ...diagnostic });
  };
  const report = createDiagnosticReporter(record, { protocol: "gateway" });
  let nextAuditRead = 0;
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
    ...(alarms ? { alarms: { ...alarms.snapshot(), actionsEnabled: !!options.operatorAuth || typeof options.authorizeAlarmAction === "function" } } : {}),
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
    let accepted = false, auditScope, auditStarted = false;
    try {
      if (stopping) throw failure(503, "GATEWAY_OFFLINE");
      if (!["127.0.0.1:" + port, "localhost:" + port].includes(request.headers.host)) throw failure(403, "GATEWAY_ORIGIN");
      if (request.headers.origin !== undefined && !config.allowedOrigins.includes(request.headers.origin)) throw failure(403, "GATEWAY_ORIGIN");
      const actual = Buffer.from(typeof request.headers.authorization === "string" ? request.headers.authorization : ""); const expected = Buffer.from("Bearer " + token);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw failure(401, "GATEWAY_AUTH");
      if (request.url === api + "/snapshot" && request.method === "GET") { respond(response, 200, snapshot()); return; }
      if (request.url === api + "/audit" || request.url?.startsWith(api + "/audit?")) {
        if (request.method !== "GET") throw new OperatorAuthError("AUTH_INPUT");
        if (!options.operatorAuth) throw options.operatorUnavailable ?? new OperatorAuthError("AUTH_REQUIRED");
        if (active >= 32) throw new OperatorAuthError("AUTH_BUSY"); active++; accepted = true;
        let timer;
        try {
          const actor = await Promise.race([options.operatorAuth.authorize(request, "audit.read", false), new Promise((_, reject) => { timer = setTimeout(() => reject(new OperatorAuthError("AUTH_BUSY")), 5000); })]);
          if (!operatorText(actor, 200) || actor === token || actor === "Bearer " + token) throw new OperatorAuthError("AUTH_REQUIRED");
        }
        finally { clearTimeout(timer); }
        if (stopping || request.aborted || response.destroyed) throw new OperatorAuthError("AUTH_CONFIG");
        if (!options.audit || typeof options.audit.read !== "function") throw new OperatorAuthError("AUTH_AUDIT");
        if (request.url.length > 4096) throw new OperatorAuthError("AUTH_INPUT");
        const params = new URL(request.url, "http://localhost").searchParams;
        if ([...params.keys()].length > 9 || new Set(params.keys()).size !== [...params.keys()].length) throw new OperatorAuthError("AUTH_INPUT");
        const query = parseAuditQuery(Object.fromEntries(params));
        if (performance.now() < nextAuditRead) throw new OperatorAuthError("AUTH_BUSY");
        nextAuditRead = performance.now() + 200;
        respond(response, 200, parseAuditSnapshot(await options.audit.read(query), query)); return;
      }
      if ([api + "/session", api + "/session/login", api + "/session/logout"].includes(request.url)) {
        if (!options.operatorAuth) throw options.operatorUnavailable ?? new OperatorAuthError("AUTH_CONFIG");
        if (active >= 32) throw new OperatorAuthError("AUTH_BUSY"); active++; accepted = true;
        if (request.url === api + "/session" && request.method === "GET") { respond(response, 200, await options.operatorAuth.status(request)); return; }
        if (request.method !== "POST" || request.url === api + "/session" || (request.headers["content-type"] ?? "").split(";")[0].trim() !== "application/json") throw new OperatorAuthError("AUTH_INPUT");
        const input = await body(request, 4096);
        auditScope = auditContext(request.url.endsWith("/login") ? "session.login" : "session.logout", null);
        if (request.url.endsWith("/logout") && (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length)) throw new OperatorAuthError("AUTH_INPUT");
        const result = request.url.endsWith("/login") ? await options.operatorAuth.login(request, input) : await options.operatorAuth.logout(request);
        if (stopping || request.aborted || response.destroyed) throw new OperatorAuthError("AUTH_CONFIG");
        response.setHeader("Set-Cookie", result.cookie); respond(response, 200, result.body); return;
      }
      if (request.url === api + "/recipes") {
        if (!options.recipeStore) throw options.recipeUnavailable instanceof RecipeStoreError ? options.recipeUnavailable : new RecipeStoreError("RECIPE_STORAGE");
        if (!options.operatorAuth && typeof options.authorizeRecipeAction !== "function") throw options.operatorUnavailable ?? new RecipeStoreError("RECIPE_AUTH");
        if (!["GET", "POST"].includes(request.method)) throw Object.assign(new RecipeStoreError("RECIPE_COMMAND"), { status: 405 });
        if (active >= 32) throw failure(429, "GATEWAY_BUSY");
        active++; accepted = true;
        if (request.method === "POST" && (request.headers["content-type"] ?? "").split(";")[0].trim() !== "application/json") throw Object.assign(new RecipeStoreError("RECIPE_COMMAND"), { status: 415 });
        const command = request.method === "GET" ? { action: "read" } : parseRecipeCommand(await body(request, 2_100_000));
        if (request.method === "POST") auditScope = auditContext("recipes." + command.action, { kind: "recipe-schema", id: command.schemaId, recordId: command.recordId, targetId: command.targetId ?? null }, command.id);
        let actor, authorizationTimer;
        try { actor = await Promise.race([options.operatorAuth ? options.operatorAuth.authorize(request, "recipes." + command.action, request.method === "POST", request.method === "POST" ? { schemaId: command.schemaId } : undefined) : options.authorizeRecipeAction(request, structuredClone(command)), new Promise(resolve => { authorizationTimer = setTimeout(() => resolve(undefined), 5000); })]); } catch (error) { if (error instanceof OperatorAuthError) throw error; }
        finally { clearTimeout(authorizationTimer); }
        if (!recipeActor(actor) || actor === token || actor === "Bearer " + token) throw new RecipeStoreError("RECIPE_AUTH");
        if (auditScope) auditScope.actor = actor;
        if (stopping || request.aborted || response.destroyed) throw new RecipeStoreError("RECIPE_STORAGE");
        let task;
        try {
          if (request.method === "POST") auditStarted = true;
          task = request.method === "GET" ? Promise.resolve(options.recipeStore.snapshot()) : runAudited(options.audit, auditScope, () => options.recipeStore.mutate(command, actor), result => ({ outcome: result.duplicate ? "duplicate" : "applied", code: result.duplicate ? "RECIPE_DUPLICATE" : "RECIPE_APPLIED" }), () => !stopping && !request.aborted && !response.destroyed);
          recipeTasks.add(task); respond(response, 200, await task);
        } catch (error) { throw error instanceof RecipeStoreError || error instanceof OperatorAuthError ? error : new RecipeStoreError(request.method === "POST" ? "RECIPE_UNCERTAIN" : "RECIPE_STORAGE"); }
        finally { if (task) recipeTasks.delete(task); }
        return;
      }
      if (request.url === api + "/alarm-action" && request.method === "POST") {
        if (!alarms || !options.operatorAuth && typeof options.authorizeAlarmAction !== "function") { if (options.operatorUnavailable) throw options.operatorUnavailable; respond(response, 403, { error: "Presa visione non abilitata: configura autenticazione e autorizzazioni nel servizio. Il PIN del browser non basta." }); return; }
        if ((request.headers["content-type"] ?? "").split(";")[0].trim() !== "application/json") throw failure(415);
        if (active >= 32) throw failure(429, "GATEWAY_BUSY");
        active++; accepted = true;
        const command = await body(request);
        if (!command || !operatorText(command.alarmId, 200) || typeof command.occurrence !== "string" || !Number.isSafeInteger(command.revision) || !["acknowledge", "confirm"].includes(command.action)
          || Object.keys(command).some((key) => !["alarmId", "occurrence", "revision", "action"].includes(key))) throw failure(400);
        auditScope = auditContext("alarms." + command.action, { kind: "alarm", id: command.alarmId });
        let actor, authorizationTimer;
        try { actor = await Promise.race([options.operatorAuth ? options.operatorAuth.authorize(request, "alarms." + command.action, true, { alarmId: command.alarmId }) : options.authorizeAlarmAction(request, { ...command }), new Promise((resolve) => { authorizationTimer = setTimeout(() => resolve(undefined), 5000); })]); } catch (error) { if (error instanceof OperatorAuthError) throw error; }
        finally { clearTimeout(authorizationTimer); }
        if (stopping) throw failure(503, "GATEWAY_OFFLINE");
        if (!recipeActor(actor) || actor === token || actor === "Bearer " + token) throw new OperatorAuthError("AUTH_PERMISSION");
        auditScope.actor = actor; auditStarted = true;
        const result = await runAudited(options.audit, auditScope, () => {
          try { return { status: 200, body: { alarms: { ...alarms.action(command, actor), actionsEnabled: true } } }; }
          catch (error) { return { status: 409, body: { error: error.message } }; }
        }, result => ({ outcome: result.status === 200 ? "applied" : "rejected", code: result.status === 200 ? "ALARM_APPLIED" : "ALARM_CONFLICT" }), () => !stopping && !request.aborted && !response.destroyed);
        respond(response, result.status, result.body);
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
      if (!operatorText(command.tag, 200)) throw failure(400);
      auditScope = auditContext("tags.write", { kind: "tag", id: command.tag }, command.id);
      const owner = owners.get(command.tag); if (!owner?.writable) throw failure(403, "WRITE_DENIED");
      try { normalizeMqttTagValue(command.value, owner.dataType); } catch { throw failure(400, "WRITE_INVALID"); }
      let actor, authorizationTimer;
      try { actor = await Promise.race([options.operatorAuth ? options.operatorAuth.authorize(request, "tags.write", true, { tag: command.tag }) : options.authorizeTagWrite?.(request, { ...command }), new Promise(resolve => { authorizationTimer = setTimeout(() => resolve(undefined), 5000); })]); }
      catch (error) { if (error instanceof OperatorAuthError) throw error; }
      finally { clearTimeout(authorizationTimer); }
      if (!recipeActor(actor) || actor === token || actor === "Bearer " + token) throw options.operatorUnavailable ?? new OperatorAuthError("AUTH_REQUIRED");
      auditScope.actor = actor;
      if (stopping || request.aborted || response.destroyed) throw failure(503, "GATEWAY_OFFLINE");
      const fingerprint = JSON.stringify([actor, command.tag, command.value]); const known = commands.get(command.id);
      if (known) {
        if (known.fingerprint !== fingerprint) throw failure(409, "GATEWAY_CONFLICT");
        auditStarted = true;
        const result = await runAudited(options.audit, auditScope, () => known.result, result => ({ outcome: "duplicate", code: result.body.outcome === "delivered" ? "WRITE_DUPLICATE" : "WRITE_DUPLICATE_UNCERTAIN" }), () => !stopping && !request.aborted && !response.destroyed); respond(response, result.status, result.body); return;
      }
      if (owner.driver.state !== "connected") throw failure(503, "WRITE_OFFLINE");
      const now = Date.now(); for (const [id, entry] of commands) if (entry.expires <= now && entry.finished) commands.delete(id);
      if (commands.size >= 1_000) throw failure(429, "GATEWAY_BUSY");
      const entry = { fingerprint, expires: now + 300_000, finished: false, result: undefined };
      // L'id resta registrato anche se il chiamante interrompe HTTP: nessun replay del comando.
      auditStarted = true;
      entry.result = runAudited(options.audit, auditScope, async () => {
        try { const delivery = await owner.driver.write(command.tag, command.value); return { status: 200, body: { id: command.id, outcome: "delivered", ...delivery } }; } catch (error) {
        const rejected = error instanceof ConnectionOperationError && error.outcome === "rejected";
        const diagnostic = error instanceof ConnectionOperationError ? error.diagnostic : connectionDiagnostic("WRITE_UNCERTAIN", { protocol: owner.protocol, connectionId: owner.connectionId, tag: command.tag });
        return { status: rejected ? diagnostic.code === "WRITE_OFFLINE" ? 503 : 422 : 502, body: { id: command.id, tag: command.tag, outcome: rejected ? "rejected" : "uncertain", plcConfirmed: false, error: diagnosticText(diagnostic), diagnostic } };
        }
      }, result => ({ outcome: result.body.outcome, code: result.body.outcome === "delivered" ? result.body.delivery === "broker-ack" ? "WRITE_BROKER_ACK" : result.body.delivery === "opcua-service" ? "WRITE_OPCUA_SERVICE" : "WRITE_TRANSPORT" : result.body.diagnostic.code }), () => !stopping && !request.aborted && !response.destroyed).finally(() => { entry.finished = true; });
      commands.set(command.id, entry); const result = await entry.result; respond(response, result.status, result.body);
    } catch (error) {
      if (!stopping && auditScope && !auditStarted && !(error instanceof OperatorAuthError && error.code.startsWith("AUTH_AUDIT"))) {
        if (error instanceof OperatorAuthError && recipeActor(error.actor)) auditScope.actor = error.actor;
        const code = error instanceof OperatorAuthError || error instanceof RecipeStoreError ? error.code : error instanceof ConnectionOperationError ? error.diagnostic.code : "REQUEST_REJECTED";
        try { await appendAudit(options.audit, auditScope, "rejected", code); } catch (auditError) { error = auditError; }
      }
      if (error instanceof OperatorAuthError) { respond(response, error.status, { type: "operator", code: error.code, error: error.message, remedy: error.remedy, outcome: error.outcome, plcConfirmed: false }); return; }
      if (error instanceof RecipeStoreError) {
        const diagnostic = { type: "recipe", code: error.code, error: error.message, remedy: error.remedy, ...(error.fieldId ? { fieldId: error.fieldId } : {}) };
        safeNotify(options.onRecipeDiagnostic, diagnostic);
        respond(response, error.status, { ...diagnostic, outcome: error.code === "RECIPE_UNCERTAIN" ? "uncertain" : "rejected", effect: "recipe-storage-only", plcConfirmed: false }); return;
      }
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
      if (stopTask) return stopTask; stopping = true; options.operatorAuth?.close();
      stopTask = (async () => {
        server.closeAllConnections();
        await Promise.allSettled(connections.map((driver) => driver.stop()));
        await Promise.allSettled([...recipeTasks]);
        await Promise.allSettled([...commands.values()].map(entry => entry.result));
        await Promise.allSettled([...auditTasks]);
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
