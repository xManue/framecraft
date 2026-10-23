import { createHash } from "node:crypto";
import { recipeActor, recipeId } from "./recipe-catalog.mjs";
import { RecipeApplyError, parseRecipeApplyCommand, parseRecipeApplyLookup, parseRecipeApplyConfig, parseRecipeApplyAck, recipeApplyAscii, recipeApplyFrame, recipeApplyNamespace, recipeApplySchemaSource, recipeApplyValues } from "./recipe-apply.mjs";

const hash = value => createHash("sha256").update(value).digest("hex"), fail = code => { throw new RecipeApplyError(code); };
export function createRecipeApplyEngine(options) {
  if (!recipeApplyNamespace(options.namespace) || !recipeApplyNamespace(options.store?.identity)) fail("RECIPE_APPLY_CONFIG");
  const config = parseRecipeApplyConfig(options.config), mappingRevision = hash(recipeApplyAscii(config)), running = new Map(), channels = new Set(); let stopped = false;
  const profileFor = schemaId => { const profile = config.schemas.find(item => item.schemaId === schemaId); if (!profile) fail("RECIPE_APPLY_DISABLED"); return profile; };
  const allowed = async context => { if (stopped || context.alive?.() === false) fail("RECIPE_APPLY_UNCERTAIN"); const actor = await context.authorize(); if (!recipeActor(actor) || actor !== context.actor) fail("RECIPE_APPLY_CHANGED"); if (stopped || context.alive?.() === false) fail("RECIPE_APPLY_UNCERTAIN"); };
  function result(receipt, duplicate = false) {
    const outcome = receipt.outcome === "pending" && !running.has(receipt.id) ? "uncertain" : receipt.outcome;
    const { id, channelId, sequence, schemaId, recordId, recipeRevision, mappingRevision, phase, writePhase, code, plcCode, createdAt, updatedAt } = receipt;
    return { type: "recipe-apply", version: 1, ledgerId: options.store.identity, id, channelId, sequence, schemaId, recordId, recipeRevision, mappingRevision, phase, writePhase, outcome, code: outcome === "uncertain" && receipt.outcome === "pending" ? "RECIPE_APPLY_UNCERTAIN" : code, plcCode, createdAt, updatedAt, duplicate, effect: "plc-recipe", plcConfirmed: outcome === "applied" };
  }
  function readAck(profile) {
    const source = options.channel(profile), sample = source?.read();
    if (!source || source.connected() !== true || !sample || sample.lastError || !Number.isInteger(sample.qualityCode) || sample.qualityCode < 0 || sample.qualityCode > 65535 || ![128, 192].includes(sample.qualityCode & 192) || sample.retained === true || !Number.isSafeInteger(sample.receivedAt) || sample.receivedAt > Date.now() || Date.now() - sample.receivedAt > profile.maxAgeMs) fail("RECIPE_APPLY_OFFLINE");
    const ack = parseRecipeApplyAck(sample.value); if (ack.namespace !== options.namespace || ack.channelId !== profile.channelId) fail("RECIPE_APPLY_RESPONSE"); return { ack, sample, source };
  }
  async function waitAck(receipt, profile, started, timeoutMs, context, stage) {
    const end = performance.now() + timeoutMs;
    while (true) {
      if (stopped || context.alive?.() === false) fail("RECIPE_APPLY_UNCERTAIN");
      const { ack, sample } = readAck(profile);
      if (ack.sequence > receipt.sequence) fail("RECIPE_APPLY_COUNTER");
      if (sample.receivedAt >= started && ack.sequence === receipt.sequence) {
        if (ack.id !== receipt.id || ack.fingerprint !== receipt.fingerprint) fail("RECIPE_APPLY_RESPONSE");
        if (ack.state === "rejected" || ack.state === "uncertain") return ack;
        if (ack.state === "applied") { if (stage === "prepare" || receipt.writePhase !== "apply") fail("RECIPE_APPLY_RESPONSE"); return ack; }
        if (ack.state === "prepared" && stage === "prepare") return ack;
        if (ack.state === "prepared" && stage === "status") return ack;
      }
      if (performance.now() >= end) fail("RECIPE_APPLY_UNCERTAIN"); await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  function terminal(receipt, ack) {
    if (ack.state === "applied" && receipt.writePhase === "apply") return options.store.change(receipt.id, "finished", "applied", "RECIPE_APPLY_CONFIRMED", 0);
    if (ack.state === "rejected") return options.store.change(receipt.id, "finished", "rejected", "RECIPE_APPLY_REJECTED", ack.code);
    return options.store.change(receipt.id, receipt.phase, "uncertain", "RECIPE_APPLY_UNCERTAIN", ack.state === "uncertain" ? ack.code : null);
  }
  function uncertain(id, error) {
    try {
      const current = options.store.get(id); if (!current) fail("RECIPE_APPLY_STORAGE"); if (current.phase === "finished") return current;
      const code = typeof error?.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : "RECIPE_APPLY_UNCERTAIN";
      return current.writePhase === "none" ? options.store.change(id, "finished", "rejected", code === "RECIPE_APPLY_UNCERTAIN" ? "RECIPE_APPLY_NOT_SENT" : code) : options.store.change(id, current.phase, "uncertain", code);
    } catch { throw new RecipeApplyError("RECIPE_APPLY_UNCERTAIN"); }
  }
  function knownFor(command, actor) {
    const known = options.store.get(command.id); if (!known) return;
    if (known.schemaId !== command.schemaId || known.recordId !== command.recordId || known.recipeRevision !== command.expectedRevision || known.actor !== actor) fail("RECIPE_APPLY_CHANGED"); return known;
  }
  return {
    async apply(raw, context) {
      const command = parseRecipeApplyCommand(raw); await allowed(context);
      if (command.ledgerId !== undefined && command.ledgerId !== options.store.identity) fail("RECIPE_APPLY_CHANGED");
      const known = knownFor(command, context.actor); if (known) return result(running.has(known.id) ? await running.get(known.id) : known, true);
      const profile = profileFor(command.schemaId); if (channels.has(profile.channelId)) fail("RECIPE_APPLY_BUSY");
      const last = options.store.channel(profile.channelId), sent = options.store.channel(profile.channelId, true);
      if (last && last.phase !== "finished") fail("RECIPE_APPLY_BUSY");
      const snapshot = await options.recipes.snapshot(); await allowed(context);
      const raced = knownFor(command, context.actor); if (raced) return result(running.has(raced.id) ? await running.get(raced.id) : raced, true);
      if (snapshot.revision !== command.expectedRevision) fail("RECIPE_APPLY_CHANGED"); const schema = snapshot.schemas.find(item => item.id === command.schemaId), record = schema?.records.find(item => item.id === command.recordId);
      if (!schema || !record) fail("RECIPE_APPLY_CHANGED");
      const values = recipeApplyValues(schema, record), schemaHash = hash(recipeApplySchemaSource(schema));
      const fingerprint = hash(recipeApplyAscii({ namespace: options.namespace, actor: context.actor, command, mappingRevision, schemaHash, values }));
      const initial = readAck(profile); if (initial.ack.state === "prepared" || initial.ack.state === "uncertain") fail("RECIPE_APPLY_BUSY");
      if (sent ? initial.ack.sequence !== sent.sequence || initial.ack.id !== sent.id || initial.ack.fingerprint !== sent.fingerprint : initial.ack.sequence !== 0) fail("RECIPE_APPLY_COUNTER");
      const seed = { id: command.id, channelId: profile.channelId, schemaId: command.schemaId, recordId: command.recordId, recipeRevision: snapshot.revision, mappingRevision, fingerprint, actor: context.actor };
      const payload = { schemaHash, ttlMs: profile.stageLifetimeMs, values };
      recipeApplyFrame({ ...seed, namespace: options.namespace, sequence: 4294967295 }, "prepare", payload, profile.maxPayloadBytes);
      const reserved = options.store.reserve(seed); if (reserved.duplicate) return result(reserved.receipt, true);
      let receipt = reserved.receipt;
      if (initial.ack.sequence >= receipt.sequence) return result(options.store.change(receipt.id, "finished", "rejected", "RECIPE_APPLY_COUNTER"));
      channels.add(profile.channelId);
      const task = (async () => {
        try {
          await allowed(context); receipt = options.store.change(receipt.id, "preparing", "pending", "RECIPE_APPLY_PREPARING"); const begin = Date.now();
          await options.channel(profile).write(recipeApplyFrame(receipt, "prepare", payload, profile.maxPayloadBytes));
          const prepared = await waitAck(receipt, profile, begin, profile.prepareTimeoutMs, context, "prepare");
          if (prepared.state !== "prepared") return terminal(receipt, prepared);
          await allowed(context); const latest = await options.recipes.snapshot(); await allowed(context); if (latest.revision !== receipt.recipeRevision) fail("RECIPE_APPLY_CHANGED");
          const ready = readAck(profile).ack; if (ready.id !== receipt.id || ready.sequence !== receipt.sequence || ready.fingerprint !== receipt.fingerprint || ready.state !== "prepared") fail("RECIPE_APPLY_RESPONSE");
          receipt = options.store.change(receipt.id, "committing", "pending", "RECIPE_APPLY_COMMITTING"); const commit = Date.now();
          await options.channel(profile).write(recipeApplyFrame(receipt, "apply", undefined, profile.maxPayloadBytes));
          return terminal(receipt, await waitAck(receipt, profile, commit, profile.applyTimeoutMs, context, "apply"));
        } catch (error) { return uncertain(receipt.id, error); }
        finally { running.delete(receipt.id); channels.delete(profile.channelId); }
      })(); running.set(receipt.id, task); return result(await task);
    },
    async fence(raw, context) {
      const command = parseRecipeApplyCommand(raw); await allowed(context);
      if (command.ledgerId !== options.store.identity) fail("RECIPE_APPLY_CHANGED");
      const known = options.store.get(command.id);
      if (known) { if (known.schemaId !== command.schemaId || known.recordId !== command.recordId || known.recipeRevision !== command.expectedRevision) fail("RECIPE_APPLY_CHANGED"); return result(known, true); }
      const profile = profileFor(command.schemaId);
      const sent = options.store.channel(profile.channelId, true), initial = readAck(profile).ack;
      if (initial.state === "prepared" || initial.state === "uncertain") fail("RECIPE_APPLY_BUSY");
      if (sent ? initial.sequence !== sent.sequence || initial.id !== sent.id || initial.fingerprint !== sent.fingerprint : initial.sequence !== 0) fail("RECIPE_APPLY_COUNTER");
      const fingerprint = hash(recipeApplyAscii({ purpose: "not-sent-fence", namespace: options.namespace, actor: context.actor, command, mappingRevision }));
      const reserved = options.store.reserve({ id: command.id, channelId: profile.channelId, schemaId: command.schemaId, recordId: command.recordId, recipeRevision: command.expectedRevision, mappingRevision, fingerprint, actor: context.actor });
      if (reserved.duplicate) return result(reserved.receipt, true);
      try { return result(options.store.change(command.id, "finished", "rejected", "RECIPE_APPLY_NOT_SENT")); }
      catch { throw new RecipeApplyError("RECIPE_APPLY_UNCERTAIN"); }
    },
    status(raw) { const query = parseRecipeApplyLookup(raw), receipt = options.store.get(query.id); if (!receipt || receipt.schemaId !== query.schemaId) fail("RECIPE_APPLY_MISSING"); return result(receipt); },
    current(schemaId) { if (!recipeId(schemaId)) fail("RECIPE_APPLY_INPUT"); const profile = profileFor(schemaId), receipt = options.store.channel(profile.channelId); if (receipt && receipt.schemaId !== schemaId && receipt.phase !== "finished") fail("RECIPE_APPLY_BUSY"); return { type: "recipe-apply-current", version: 1, ledgerId: options.store.identity, current: receipt?.schemaId === schemaId ? result(receipt) : null }; },
    async check(raw, context) {
      const query = parseRecipeApplyLookup(raw); await allowed(context); const receipt = options.store.get(query.id); if (!receipt || receipt.schemaId !== query.schemaId) fail("RECIPE_APPLY_MISSING");
      if (running.has(receipt.id)) return result(await running.get(receipt.id), true); if (receipt.phase === "finished") return result(receipt, true);
      const profile = profileFor(receipt.schemaId); if (receipt.mappingRevision !== mappingRevision || channels.has(profile.channelId)) fail("RECIPE_APPLY_CHANGED");
      if (receipt.writePhase === "none") return result(options.store.change(receipt.id, "finished", "rejected", "RECIPE_APPLY_NOT_SENT"));
      channels.add(profile.channelId);
      const task = (async () => {
        try { await allowed(context); readAck(profile); const begin = Date.now(); await options.channel(profile).write(recipeApplyFrame(receipt, "status", undefined, profile.maxPayloadBytes)); return terminal(receipt, await waitAck(receipt, profile, begin, profile.prepareTimeoutMs, context, "status")); }
        catch (error) { return uncertain(receipt.id, error); }
        finally { running.delete(receipt.id); channels.delete(profile.channelId); }
      })(); running.set(receipt.id, task); return result(await task);
    },
    async stop() { stopped = true; await Promise.allSettled([...running.values()]); },
  };
}
