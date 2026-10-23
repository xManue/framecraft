import { createHash } from "node:crypto";
import { parseRecipeCatalog, parseRecipeValues, recipeId, recipeKeys } from "./recipe-catalog.mjs";
import { RecipeApplyError, parseRecipeApplyAck, parseRecipeApplyFrame, recipeApplyAscii, recipeApplyNamespace, recipeApplySchemaSource } from "./recipe-apply.mjs";

export const recipePlcCodes = Object.freeze({ INTERLOCK: 1, SCHEMA: 2, VALUES: 3, BUSY: 4, EXPIRED: 5, RESTART: 6, NOT_SEEN: 7, OLD_SEQUENCE: 8, EXECUTION: 9, STORAGE: 10 });
const clone = value => JSON.parse(JSON.stringify(value)), hash = source => createHash("sha256").update(source).digest("hex");
const fail = () => { throw new RecipeApplyError("RECIPE_APPLY_CONFIG"); };
export function newRecipePlcState(namespace, channelId) {
  if (!recipeApplyNamespace(namespace) || !recipeId(channelId)) fail(); return { version: 1, namespace, channelId, highWater: 0, last: null, active: null };
}

/** Protocol reference, not a PLC driver. Retentive persistence and atomic machine apply are required adapters. */
export function createRecipePlcReference(options) {
  const { namespace, channelId, maxPayloadBytes = 8192 } = options;
  if (!recipeApplyNamespace(namespace) || !recipeId(channelId) || !Number.isInteger(maxPayloadBytes) || maxPayloadBytes < 512 || maxPayloadBytes > 131072 || [options.persist, options.canApply, options.apply].some(value => typeof value !== "function")) fail();
  const catalog = parseRecipeCatalog(options.catalog); let state = clone(options.retained), storageFault = false, lastTime = 0;
  if (!recipeKeys(state, ["version", "namespace", "channelId", "highWater", "last", "active"]) || state.version !== 1 || state.namespace !== namespace || state.channelId !== channelId || !Number.isInteger(state.highWater) || state.highWater < 0 || state.highWater > 4294967295) fail();
  const same = (ack, request) => ack && ack.namespace === request.namespace && ack.channelId === request.channelId && ack.sequence === request.sequence && ack.id === request.id && ack.fingerprint === request.fingerprint;
  const acknowledgement = (request, status, code = 0) => ({ version: 1, namespace, channelId, sequence: request.sequence, id: request.id, fingerprint: request.fingerprint, state: status, code });
  if (state.last !== null) { const last = parseRecipeApplyAck(recipeApplyAscii(state.last)); if (last.namespace !== namespace || last.channelId !== channelId || last.sequence > state.highWater || !["applied", "rejected", "uncertain"].includes(last.state)) fail(); }
  if (state.active !== null) {
    if (!recipeKeys(state.active, ["request", "expires", "committing"]) || !Number.isFinite(state.active.expires) || typeof state.active.committing !== "boolean") fail();
    const request = parseRecipeApplyFrame(recipeApplyAscii(state.active.request), maxPayloadBytes); if (request.phase !== "prepare" || request.namespace !== namespace || request.channelId !== channelId || request.sequence > state.highWater) fail();
  }
  if (state.highWater === 0 && (state.last || state.active) || state.highWater > 0 && !state.last && !state.active) fail();
  function save(next) {
    try { const response = options.persist(clone(next)); if (response && typeof response.then === "function") throw new Error("Persistence must be synchronous"); state = clone(next); }
    catch { storageFault = true; throw new RecipeApplyError("RECIPE_APPLY_STORAGE"); }
  }
  if (state.active) { const active = state.active; save({ ...state, last: acknowledgement(active.request, active.committing ? "uncertain" : "rejected", recipePlcCodes.RESTART), active: null }); }
  function current() {
    if (state.active) return acknowledgement(state.active.request, state.active.committing || storageFault ? "uncertain" : "prepared", state.active.committing || storageFault ? recipePlcCodes.STORAGE : 0);
    return state.last ? clone(state.last) : { version: 1, namespace, channelId, sequence: 0, id: null, fingerprint: null, state: "idle", code: 0 };
  }
  function tick(now = performance.now()) {
    if (!Number.isFinite(now) || now < lastTime || now < 0) { storageFault = true; throw new RecipeApplyError("RECIPE_APPLY_RESPONSE"); } lastTime = now;
    if (!storageFault && state.active && !state.active.committing && now >= state.active.expires) save({ ...state, last: acknowledgement(state.active.request, "rejected", recipePlcCodes.EXPIRED), active: null });
    return current();
  }
  function finish(request, status, code) { const ack = acknowledgement(request, status, code); save({ ...state, last: ack, active: null }); return ack; }
  function receive(source, now = performance.now()) {
    const request = parseRecipeApplyFrame(source, maxPayloadBytes); if (request.namespace !== namespace || request.channelId !== channelId) throw new RecipeApplyError("RECIPE_APPLY_RESPONSE");
    tick(now); if (storageFault) return acknowledgement(request, "uncertain", recipePlcCodes.STORAGE);
    if (state.last?.state === "uncertain") return same(state.last, request) ? clone(state.last) : acknowledgement(request, "rejected", recipePlcCodes.BUSY);
    if (same(state.last, request) && !(state.active && same(state.active.request, request))) return clone(state.last);
    if (request.phase === "status") {
      if (state.active && same(state.active.request, request)) return current();
      if (request.sequence > state.highWater) { const ack = acknowledgement(request, "rejected", recipePlcCodes.NOT_SEEN); save({ ...state, highWater: request.sequence, last: ack }); return ack; }
      return acknowledgement(request, "uncertain", recipePlcCodes.OLD_SEQUENCE);
    }
    if (request.phase === "prepare") {
      if (state.active && same(state.active.request, request)) return recipeApplyAscii(state.active.request) === recipeApplyAscii(request) ? current() : acknowledgement(request, "uncertain", recipePlcCodes.VALUES);
      if (request.sequence <= state.highWater) return acknowledgement(request, "rejected", recipePlcCodes.OLD_SEQUENCE);
      const highWater = request.sequence; save({ ...state, highWater, last: acknowledgement(request, "rejected", recipePlcCodes.NOT_SEEN) });
      if (state.active) return acknowledgement(request, "rejected", recipePlcCodes.BUSY);
      const schema = catalog.schemas.find(item => item.id === request.schemaId);
      if (!schema || hash(recipeApplySchemaSource(schema)) !== request.schemaHash) return finish(request, "rejected", recipePlcCodes.SCHEMA);
      try { parseRecipeValues(request.values, schema.fields); } catch { return finish(request, "rejected", recipePlcCodes.VALUES); }
      if (options.canApply(clone(request)) !== true) return finish(request, "rejected", recipePlcCodes.INTERLOCK);
      save({ ...state, active: { request: clone(request), expires: now + request.ttlMs, committing: false } }); return current();
    }
    if (!state.active || !same(state.active.request, request)) return acknowledgement(request, "rejected", recipePlcCodes.NOT_SEEN);
    if (state.active.committing) return acknowledgement(request, "uncertain", recipePlcCodes.EXECUTION);
    if (options.canApply(clone(state.active.request)) !== true) return finish(request, "rejected", recipePlcCodes.INTERLOCK);
    save({ ...state, active: { ...state.active, committing: true } });
    try {
      const completed = options.apply(clone(state.active.request.values), clone(state.active.request));
      if (completed && typeof completed.then === "function") throw new Error("Machine apply must be synchronous and atomic");
    } catch { return finish(request, "uncertain", recipePlcCodes.EXECUTION); }
    try { return finish(request, "applied", 0); } catch { return acknowledgement(request, "uncertain", recipePlcCodes.STORAGE); }
  }
  return { receive, tick, response: () => current(), retained: () => clone(state) };
}
