import { parseRecipeCatalog, parseRecipeCommand, recipeKeys, RecipeStoreError, type RecipeCommand } from "../../runtime/recipe-catalog.mjs";
import type { RecipeMutationResult, RecipeSnapshot } from "../../runtime/recipe-store.mjs";

export class HmiRecipeError extends Error {
  constructor(public readonly code: string, message: string, public readonly remedy: string, public readonly uncertain = false, public readonly fieldId?: string) { super(message); this.name = "HmiRecipeError"; }
}
export interface HmiRecipeClientOptions {
  path?: string; timeoutMs?: number; scope: string; request?: typeof fetch;
  journal?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  report?: (event: { code: string; requestId?: string; uncertain: boolean }) => void;
}
const localError = (code: "network" | "response" | "journal" | "pending" | "busy" | "access", uncertain = false) => {
  const texts = {
    network: ["Servizio ricette non raggiungibile", "Controlla servizio, rete e proxy; poi riprova la lettura. Nessun comando viene accodato."],
    access: ["Accesso al servizio ricette negato", "Controlla autenticazione, origine consentita e configurazione del proxy con chi ti assiste. Non inserire il token del gateway nel codice del browser."],
    response: ["Risposta del servizio ricette non valida", "Non fidarti dei dati ricevuti. Verifica versione e diagnostica del servizio con chi ti assiste."],
    journal: ["Protezione del salvataggio non disponibile", "Abilita l’archiviazione della sessione nel browser. Non è stata inviata una nuova modifica."],
    pending: ["Prima verifica il salvataggio precedente", "Rileggi l’archivio e confrontalo con la bozza. Non ripetere l’operazione con un nuovo ID."],
    busy: ["Operazione ricette già in corso", "Attendi il termine della richiesta. Non vengono accodate altre operazioni."],
  };
  const [message, remedy] = texts[code];
  return new HmiRecipeError("RECIPE_CLIENT_" + code.toUpperCase(), uncertain ? "Salvataggio ricetta con esito incerto" : message, uncertain ? "La richiesta potrebbe essere stata registrata. Conserva l’ID, rileggi l’archivio o ripeti soltanto la stessa richiesta; nessuna conferma PLC è prevista." : remedy, uncertain);
};
export function parseHmiRecipeSnapshot(raw: unknown): RecipeSnapshot {
  if (!recipeKeys(raw, ["version", "schemas", "revision", "sequence", "persistence"])) throw localError("response");
  const value = raw as Record<string, unknown>;
  if (typeof value.revision !== "string" || !/^[a-f0-9]{64}$/.test(value.revision) || !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0 || value.persistence !== "server-file") throw localError("response");
  let catalog; try { catalog = parseRecipeCatalog({ version: value.version, schemas: value.schemas }); } catch { throw localError("response"); }
  return { ...catalog, revision: value.revision, sequence: value.sequence as number, persistence: "server-file" };
}

/** Only same-origin HTTP. The service, never this client, establishes operator identity. */
export function createHmiRecipeClient(options: HmiRecipeClientOptions) {
  const path = options.path ?? "/_framecraft/plc/v1", timeoutMs = options.timeoutMs ?? 15_000;
  if (!/^\/(?!\/)[A-Za-z0-9_/-]+$/.test(path) || path.endsWith("/") || path.split("/").includes("..") || !/^[A-Za-z0-9_-]{1,100}$/.test(options.scope) || !Number.isFinite(timeoutMs) || timeoutMs < 250 || timeoutMs > 70_000) throw new Error("Configurazione client ricette non valida.");
  const key = "framecraft:recipe-request:" + options.scope + ":" + path;
  let journal = options.journal;
  try { journal ??= window.sessionStorage; } catch { /* Read is still available; mutations fail closed. */ }
  let pending: { id?: string; command?: RecipeCommand } | undefined, reviewed = false, busy = false, disposed = false;
  try {
    const saved = journal?.getItem(key);
    if (saved !== undefined && saved !== null) pending = /^[A-Za-z0-9_-]{16,80}$/.test(saved) ? { id: saved } : {};
  } catch { journal = undefined; }
  const listeners = new Set<() => void>(), controllers = new Set<AbortController>();
  const notify = () => { for (const listener of listeners) try { listener(); } catch { /* An observer cannot replay an operation. */ } };
  const report = (error: HmiRecipeError) => { try { options.report?.({ code: error.code, requestId: pending?.id, uncertain: error.uncertain }); } catch { /* No payload is logged. */ } };
  function forget() {
    try { if (!journal) throw new Error(); journal.removeItem(key); if (journal.getItem(key) !== null) throw new Error(); }
    catch { throw localError("journal"); }
    pending = undefined; reviewed = false;
  }
  async function json(command: RecipeCommand | undefined, signal?: AbortSignal) {
    const controller = new AbortController(); controllers.add(controller);
    const abort = () => controller.abort(); signal?.addEventListener("abort", abort, { once: true });
    if (disposed || signal?.aborted) controller.abort();
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await (options.request ?? fetch)(path + "/recipes", {
        method: command ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
        ...(command ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) } : {}),
      });
      const reader = response.body?.getReader(); let text = "";
      if (reader) {
        const decoder = new TextDecoder("utf-8", { fatal: true }); let size = 0;
        try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 2_100_000) { await reader.cancel(); throw localError("response"); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); }
        finally { reader.releaseLock(); }
      } else { text = await response.text(); if (text.length > 2_100_000) throw localError("response"); }
      if (controller.signal.aborted) throw localError("network");
      let raw: unknown; try { raw = JSON.parse(text); } catch { throw localError("response"); }
      if (!response.ok) {
        const value = raw as Record<string, unknown>;
        if (value && value.type === "recipe" && typeof value.code === "string" && new RecipeStoreError(value.code).code === value.code && ["uncertain", "rejected"].includes(value.outcome as string) && value.effect === "recipe-storage-only" && value.plcConfirmed === false) {
          const error = new RecipeStoreError(value.code, typeof value.fieldId === "string" ? value.fieldId : undefined);
          throw new HmiRecipeError(error.code, error.message, error.remedy, value.outcome === "uncertain", error.fieldId);
        }
        throw localError([401, 403].includes(response.status) ? "access" : response.status === 429 ? "busy" : "network", !!command);
      }
      return raw;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); controllers.delete(controller); }
  }
  async function read(signal?: AbortSignal): Promise<RecipeSnapshot> {
    if (busy || disposed) throw localError("busy"); busy = true; notify();
    try { const snapshot = parseHmiRecipeSnapshot(await json(undefined, signal)); if (pending) reviewed = true; return snapshot; }
    catch (error) { const safe = error instanceof HmiRecipeError ? error : localError("network"); report(safe); throw safe; }
    finally { busy = false; notify(); }
  }
  async function perform(command: RecipeCommand, signal?: AbortSignal, retry = false): Promise<RecipeMutationResult> {
    if (busy || disposed) throw localError("busy");
    if (signal?.aborted) throw localError("network");
    if (pending && !retry) throw localError("pending");
    const checked = parseRecipeCommand(command);
    if (!retry) {
      try { if (!journal) throw new Error(); journal.setItem(key, checked.id); if (journal.getItem(key) !== checked.id) throw new Error(); }
      catch { throw localError("journal"); }
      pending = { id: checked.id, command: checked }; reviewed = false;
    }
    busy = true; notify();
    try {
      const raw = await json(checked, signal);
      if (!recipeKeys(raw, ["id", "duplicate", "appliedSequence", "effect", "plcConfirmed", "snapshot"])) throw localError("response");
      const value = raw as RecipeMutationResult, snapshot = parseHmiRecipeSnapshot(value.snapshot);
      if (value.id !== checked.id || typeof value.duplicate !== "boolean" || !Number.isSafeInteger(value.appliedSequence) || value.appliedSequence < 1 || value.appliedSequence > snapshot.sequence || value.effect !== "recipe-storage-only" || value.plcConfirmed !== false) throw localError("response");
      forget(); return { ...value, snapshot };
    } catch (error) {
      let safe = error instanceof HmiRecipeError ? error : localError("network", true);
      if (!safe.uncertain && !safe.code.startsWith("RECIPE_CLIENT_") && !retry) {
        try { forget(); } catch { safe = localError("journal", true); }
      } else safe = new HmiRecipeError(safe.code, "Salvataggio ricetta con esito incerto", safe.remedy, true, safe.fieldId);
      report(safe); throw safe;
    } finally { busy = false; notify(); }
  }
  return {
    read,
    send: (command: RecipeCommand, signal?: AbortSignal) => perform(command, signal),
    retry: (signal?: AbortSignal) => pending?.command ? perform(pending.command, signal, true) : Promise.reject(localError("pending")),
    acknowledgeReviewed() { if (busy || !pending || !reviewed) throw localError("pending"); forget(); notify(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get pending() { return pending ? { id: pending.id, canRetry: !!pending.command, reviewed } : undefined; },
    get busy() { return busy; },
    dispose() { disposed = true; for (const controller of controllers) controller.abort(); listeners.clear(); },
  };
}
export type HmiRecipeClient = ReturnType<typeof createHmiRecipeClient>;
