import { RecipeApplyError, parseRecipeApplyCommand, recipeApplyHash, recipeApplyId, recipeApplyNamespace, recipeApplySequence, type RecipeApplyCommand } from "../../runtime/recipe-apply.mjs";
import { recipeId, recipeKeys } from "../../runtime/recipe-catalog.mjs";
import type { RecipeApplyResult } from "../../runtime/recipe-apply-engine.mjs";
import { OperatorAuthError } from "../../runtime/operator-policy.mjs";
import { operatorSessionHeaders } from "./hmiOperatorSession";
export class HmiRecipeApplyError extends Error {
  constructor(public readonly code: string, message: string, public readonly remedy: string, public readonly uncertain = false, public readonly verifiedRejection = false) { super(message); this.name = "HmiRecipeApplyError"; }
}
const local = (kind: "network" | "response" | "journal" | "pending" | "busy", uncertain = false) => {
  const texts = {
    network: ["Servizio di applicazione ricette non raggiungibile", "Controlla servizio e rete. Se hai già confermato, usa solo Verifica esito: nessun comando viene ripetuto automaticamente."],
    response: ["Risposta di applicazione ricette non valida", "Non considerare la ricetta applicata. Conserva l’ID e verifica il servizio; nessun reinvio automatico."],
    journal: ["Protezione della richiesta non disponibile", "Abilita l’archiviazione della sessione del browser. Non cancellare il checkpoint per ripetere una richiesta incerta."],
    pending: ["C’è una richiesta ricetta da verificare", "Verifica l’esito precedente prima di inviare una nuova ricetta. Non cancellare l’avviso e non usare un nuovo ID per riprovare."],
    busy: ["Operazione ricette già in corso", "Attendi il termine della richiesta. Non vengono accodati altri comandi."],
  }; return new HmiRecipeApplyError("RECIPE_APPLY_CLIENT_" + kind.toUpperCase(), texts[kind][0], texts[kind][1], uncertain);
};
const date = (value: unknown) => { try { return typeof value === "string" && value.length === 24 && new Date(value).toISOString() === value; } catch { return false; } };
export function parseHmiRecipeApplyResult(raw: unknown): RecipeApplyResult {
  if (!recipeKeys(raw, ["type", "version", "ledgerId", "id", "channelId", "sequence", "schemaId", "recordId", "recipeRevision", "mappingRevision", "phase", "writePhase", "outcome", "code", "plcCode", "createdAt", "updatedAt", "duplicate", "effect", "plcConfirmed"])) throw local("response");
  const value = raw as RecipeApplyResult;
  if (!recipeApplyNamespace(value.ledgerId)) throw local("response");
  if (value.type !== "recipe-apply" || value.version !== 1 || value.effect !== "plc-recipe" || !recipeApplyId(value.id) || !recipeApplySequence(value.sequence) || ![value.channelId, value.schemaId, value.recordId].every(recipeId) || ![value.recipeRevision, value.mappingRevision].every(recipeApplyHash) || !date(value.createdAt) || !date(value.updatedAt) || value.updatedAt < value.createdAt || typeof value.duplicate !== "boolean" || typeof value.plcConfirmed !== "boolean" || !["reserved", "preparing", "committing", "finished"].includes(value.phase) || !["none", "prepare", "apply"].includes(value.writePhase) || !["pending", "applied", "rejected", "uncertain"].includes(value.outcome) || typeof value.code !== "string" || !/^[A-Z][A-Z0-9_]{0,63}$/.test(value.code) || value.plcCode !== null && (!Number.isInteger(value.plcCode) || value.plcCode < 0 || value.plcCode > 65535)) throw local("response");
  if ((value.phase === "finished") !== ["applied", "rejected"].includes(value.outcome) || value.phase === "reserved" && value.writePhase !== "none" || value.phase === "preparing" && value.writePhase !== "prepare" || value.phase === "committing" && value.writePhase !== "apply" || value.plcConfirmed !== (value.outcome === "applied") || value.outcome === "applied" && (value.writePhase !== "apply" || value.plcCode !== 0 || value.code !== "RECIPE_APPLY_CONFIRMED")) throw local("response");
  return value;
}
interface Options {
  path: string; scope: string; request?: typeof fetch; journal?: Pick<Storage, "getItem" | "setItem" | "removeItem">; timeoutMs?: number;
  blocked?(): boolean; canStart?(): boolean; report?(event: { code: string; requestId?: string; uncertain: boolean }): void;
}
export function createHmiRecipeApplyClient(options: Options) {
  if (typeof options.path !== "string" || typeof options.scope !== "string" || !/^\/(?!\/)[A-Za-z0-9_/-]+$/.test(options.path) || options.path.endsWith("/") || options.path.split("/").includes("..") || !/^[A-Za-z0-9_-]{1,100}$/.test(options.scope)) throw local("response");
  const timeoutMs = options.timeoutMs ?? 70000; if (!Number.isFinite(timeoutMs) || timeoutMs < 250 || timeoutMs > 70000) throw local("response");
  const key = "framecraft:recipe-apply:" + options.scope + ":" + options.path;
  let journal = options.journal; try { journal ??= window.sessionStorage; } catch { /* Read-only status remains available. */ }
  let pending: RecipeApplyCommand | undefined, damaged = false, busy = false, disposed = false, epoch = 0, latest: RecipeApplyResult | undefined, identity: string | undefined;
  try { const raw = journal?.getItem(key); if (raw !== undefined && raw !== null) { if (raw.length > 1024) throw Error(); pending = parseRecipeApplyCommand(JSON.parse(raw)); if (!recipeApplyNamespace(pending.ledgerId)) throw Error(); } } catch { damaged = true; }
  const listeners = new Set<() => void>(), controllers = new Set<AbortController>();
  const notify = () => { for (const listener of listeners) try { listener(); } catch { /* Observers cannot repeat a command. */ } };
  function remember(command: RecipeApplyCommand) {
    pending = { ...command }; const text = JSON.stringify(command);
    try { if (!journal) throw Error(); journal.setItem(key, text); if (journal.getItem(key) !== text) throw Error(); } catch { throw local("journal"); }
  }
  function forget() {
    try { if (!journal) throw Error(); journal.removeItem(key); if (journal.getItem(key) !== null) throw Error(); } catch { throw local("journal", true); }
    pending = undefined;
  }
  function accept(result: RecipeApplyResult, expected?: RecipeApplyCommand) {
    if (expected && (result.ledgerId !== expected.ledgerId || result.id !== expected.id || result.schemaId !== expected.schemaId || result.recordId !== expected.recordId || result.recipeRevision !== expected.expectedRevision)) throw local("response", true);
    latest = result;
    if (result.phase === "finished") { if (pending?.id === result.id) forget(); }
    else if (!pending) remember({ id: result.id, schemaId: result.schemaId, recordId: result.recordId, expectedRevision: result.recipeRevision, ledgerId: result.ledgerId });
    return result;
  }
  async function json(route: string, command?: object) {
    const controller = new AbortController(); controllers.add(controller); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (options.request ?? fetch)(options.path + route, { method: command ? "POST" : "GET", credentials: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal, ...(command ? { headers: { "Content-Type": "application/json", ...operatorSessionHeaders() }, body: JSON.stringify(command) } : {}) });
      let text = ""; const reader = response.body?.getReader();
      if (reader) { const decoder = new TextDecoder("utf-8", { fatal: true }); let bytes = 0; try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 16384) { await reader.cancel(); throw local("response"); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); } }
      else { text = await response.text(); if (text.length > 16384) throw local("response"); }
      if (controller.signal.aborted) throw local("network"); let raw: unknown; try { raw = JSON.parse(text); } catch { throw local("response"); }
      const value = raw as Record<string, unknown>;
      if (value?.type === "recipe-apply" && value.id !== undefined) {
        const receipt = parseHmiRecipeApplyResult(raw), status = { applied: 200, rejected: 422, pending: 202, uncertain: 503 }[receipt.outcome];
        if (response.status !== status && !(response.status === 200 && !command)) throw local("response"); return receipt;
      }
      if (!response.ok) {
        const error = value?.type === "operator" && typeof value.code === "string" ? new OperatorAuthError(value.code) : value?.type === "recipe-apply" && typeof value.code === "string" ? new RecipeApplyError(value.code) : undefined;
        if (error && error.code === value.code && error.outcome === value.outcome && value.plcConfirmed === false && (value.type === "operator" || value.effect === "plc-recipe")) throw new HmiRecipeApplyError(error.code, error.message, error.remedy, error.outcome === "uncertain", error.outcome === "rejected");
        throw local("network");
      }
      return raw;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  async function run<T>(task: () => Promise<T>, sending = false): Promise<T> {
    if (busy || disposed || options.blocked?.()) throw local("busy"); const generation = epoch; busy = true; notify();
    try { return await task(); }
    catch (reason) {
      let error = reason instanceof HmiRecipeApplyError ? reason : local("network", sending);
      if (sending && pending && error.verifiedRejection && generation === epoch) { try { forget(); } catch (reason) { error = reason as HmiRecipeApplyError; } }
      else if (pending || generation !== epoch) error = new HmiRecipeApplyError(error.code, error.message, error.remedy, true);
      try { options.report?.({ code: error.code, requestId: pending?.id, uncertain: error.uncertain }); } catch { /* Metadata only. */ } throw error;
    } finally { busy = false; notify(); }
  }
  const ensureEpoch = (generation: number) => { if (generation !== epoch || disposed) throw local("pending", true); };
  return {
    async current(schemaId: string) { return run(async () => {
      if (!recipeId(schemaId)) throw local("response"); const generation = epoch, raw = await json("/recipe-apply/current?" + new URLSearchParams({ schemaId })); ensureEpoch(generation);
      if (!recipeKeys(raw, ["type", "version", "ledgerId", "current"]) || (raw as { type: unknown }).type !== "recipe-apply-current" || (raw as { version: unknown }).version !== 1 || !recipeApplyNamespace((raw as { ledgerId: unknown }).ledgerId)) throw local("response");
      const ledgerId = (raw as { ledgerId: string }).ledgerId; if (pending && pending.ledgerId !== ledgerId) throw local("pending", true); identity = ledgerId;
      const value = (raw as { current: unknown }).current; if (value === null) { latest = undefined; return null; }
      const result = parseHmiRecipeApplyResult(value); if (result.schemaId !== schemaId || result.ledgerId !== ledgerId) throw local("response"); return accept(result);
    }); },
    async send(raw: RecipeApplyCommand) {
      if (pending || damaged || options.canStart?.() === false) throw local("pending"); const command = parseRecipeApplyCommand(raw);
      if (!recipeApplyNamespace(command.ledgerId)) throw local("response");
      return run(async () => { const generation = epoch; latest = undefined; remember(command); notify(); const result = parseHmiRecipeApplyResult(await json("/recipe-apply", command)); ensureEpoch(generation); return accept(result, command); }, true);
    },
    async verify() { return run(async () => {
      if (!pending || damaged) throw local("pending"); const command = { ...pending }, generation = epoch;
      let result = parseHmiRecipeApplyResult(await json("/recipe-apply?" + new URLSearchParams({ id: command.id, schemaId: command.schemaId }))); ensureEpoch(generation);
      if (result.ledgerId !== command.ledgerId || result.id !== command.id || result.schemaId !== command.schemaId || result.recordId !== command.recordId || result.recipeRevision !== command.expectedRevision) throw local("response", true);
      if (result.phase !== "finished") { result = parseHmiRecipeApplyResult(await json("/recipe-apply/check", { id: command.id, schemaId: command.schemaId })); ensureEpoch(generation); }
      return accept(result, command);
    }); },
    async fence() { return run(async () => { if (!pending || damaged) throw local("pending"); const command = { ...pending }, generation = epoch; const result = parseHmiRecipeApplyResult(await json("/recipe-apply/fence", command)); ensureEpoch(generation); return accept(result, command); }); },
    get pending() { return pending ? { ...pending } : undefined; }, get damaged() { return damaged; }, get latest() { return latest; }, get busy() { return busy; }, get identity() { return identity; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reset() { epoch++; latest = undefined; identity = undefined; for (const controller of controllers) controller.abort(); notify(); },
    dispose() { disposed = true; epoch++; for (const controller of controllers) controller.abort(); listeners.clear(); },
  };
}
export type HmiRecipeApplyClient = ReturnType<typeof createHmiRecipeApplyClient>;
