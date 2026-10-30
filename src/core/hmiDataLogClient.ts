import { DataLogError, dataLogDefinitionKey, parseServiceDataLogs, parseDataLogQuery, parseDataLogSnapshot, type DataLogSample, type DataLogQuery, type DataLogCapture } from "../../runtime/data-log.mjs";
import { OperatorAuthError, type OperatorCapability } from "../../runtime/operator-policy.mjs";
import { operatorSessionProfile, operatorSessionHeaders, openOperatorSession } from "./hmiOperatorSession";


interface CachedRead { query: DataLogQuery; expectedTag: string; usedAt: number; rows: DataLogSample[]; state: "loading" | "ready" | "error"; at: number; controller: AbortController; error?: string }
/** Read-only cache bridging the existing synchronous chart API to bounded server queries. */
export function createHmiDataLogClient(options: { enabled?: boolean; catalog: unknown; namespace: string; path?: string; timeoutMs?: number; request?: typeof fetch; onChange?: () => void; onReset?: () => void; document?: Document }) {
  const base = options.path ?? "/_framecraft/plc/v1", timeout = options.timeoutMs ?? 15000, doc = options.document ?? document, view = doc.defaultView!;
  if (!/^\/(?!\/)[A-Za-z0-9_/-]+$/.test(base) || base.endsWith("/") || base.split("/").includes("..") || !Number.isFinite(timeout) || timeout < 250 || timeout > 70000) throw new DataLogError("DATA_LOG_CONFIG");
  let catalog = { version: 1 as const, projectKey: "framecraft-panel", logs: [] } as ReturnType<typeof parseServiceDataLogs>, configurationError: DataLogError | undefined;
  try { catalog = parseServiceDataLogs(options.catalog); } catch { configurationError = new DataLogError("DATA_LOG_CONFIG"); }
  const entries = new Map(catalog.logs.filter(log => log.storage === "runtime").flatMap(log => log.tags.map(tag => [log.id + ":" + tag.id, { log, tag, definition: dataLogDefinitionKey(log, tag) }]))), cache = new Map<string, CachedRead>();
  let active = true, generation = 0, scheduled = false, capture: (DataLogCapture & { instanceId: string }) | undefined, tail = Promise.resolve(), lastRequest = 0, accessFault: OperatorAuthError | undefined;
  const identity = () => operatorSessionProfile()?.id ?? "", can = (cap: OperatorCapability) => !!operatorSessionProfile()?.capabilities.includes(cap);
  const notify = () => { if (!scheduled && active) { scheduled = true; queueMicrotask(() => { scheduled = false; if (active) options.onChange?.(); }); } };
  const clear = (reset = false) => { generation++; for (const item of cache.values()) item.controller.abort(); cache.clear(); if (reset) options.onReset?.(); notify(); };
  const changed = () => { accessFault = undefined; clear(true); }; view.addEventListener("framecraft:user-changed", changed);
  const sourceObserver = new MutationObserver(notify); sourceObserver.observe(doc, { subtree: true, attributes: true, attributeFilter: ["data-hmi-active-data-logs"] });
  const denied = (error: unknown) => { if (error instanceof OperatorAuthError && ["AUTH_REQUIRED", "AUTH_PERMISSION", "AUTH_RESOURCE", "AUTH_CSRF", "AUTH_CONFIG"].includes(error.code)) { accessFault = error; clear(true); return true; } return false; };
  async function json(suffix: string, init: RequestInit, signal: AbortSignal) {
    const response = await (options.request ?? fetch)(base + suffix, { ...init, credentials: "same-origin", cache: "no-store", redirect: "error", signal });
    const reader = response.body?.getReader(); let source = "", bytes = 0; const decoder = new TextDecoder("utf-8", { fatal: true });
    if (!reader) throw new DataLogError("DATA_LOG_RESPONSE");
    try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4500000) { await reader.cancel(); throw new DataLogError("DATA_LOG_VOLUME"); } source += decoder.decode(part.value, { stream: true }); } source += decoder.decode(); } finally { reader.releaseLock(); }
    let data; try { data = JSON.parse(source); } catch { throw new DataLogError("DATA_LOG_RESPONSE"); }
    if (!response.ok) {
      if (data?.type === "operator" && new OperatorAuthError(data.code).code === data.code) throw new OperatorAuthError(data.code);
      if (data?.type === "data-log" && new DataLogError(data.code).code === data.code) throw new DataLogError(data.code);
      throw new DataLogError("DATA_LOG_RESPONSE");
    }
    return data;
  }
  function load(item: CachedRead) {
    const token = generation, who = identity();
    tail = tail.catch(() => {}).then(async () => {
      if (!active || item.controller.signal.aborted || generation !== token || identity() !== who) return;
      const timer = setTimeout(() => item.controller.abort(), timeout); let count = 0, bytes = 0;
      try {
        let query = item.query; const rows: DataLogSample[] = [];
        while (true) {
          if (generation !== token || identity() !== who || !active || !can("dataLogs.read")) return;
          const wait = Math.max(0, lastRequest + 35 - Date.now()); if (wait) await new Promise(resolve => setTimeout(resolve, wait)); if (item.controller.signal.aborted) throw new DataLogError("DATA_LOG_RESPONSE"); lastRequest = Date.now();
          const search = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
          const value = await json(search.length > 6000 ? "/data-log-query" : "/data-log-history?" + search, search.length > 6000 ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) } : { method: "GET" }, item.controller.signal), data = parseDataLogSnapshot(value, query);
          if (data.namespace !== options.namespace) throw new DataLogError("DATA_LOG_CHANGED");
          if ([...data.samples, ...(data.previous ? [data.previous] : [])].some(row => row.tag !== item.expectedTag)) throw new DataLogError("DATA_LOG_RESPONSE");
          if (data.previous) rows.push(data.previous); rows.push(...data.samples); count += data.samples.length; bytes += JSON.stringify(data.samples).length;
          if (count > 50000 || bytes > 4500000) throw new DataLogError("DATA_LOG_VOLUME");
          if (data.nextAfter === null) break;
          query = parseDataLogQuery({ ...item.query, archiveId: data.id, through: data.through, floor: data.floor, after: data.nextAfter, includePrevious: false });
        }
        if (!active || generation !== token || identity() !== who) return;
        item.rows = rows.sort((a, b) => a.time - b.time || a.seq - b.seq); item.state = "ready"; item.at = Date.now();
      } catch (error) {
        if (!active || generation !== token || identity() !== who) return;
        const safe = error instanceof DataLogError || error instanceof OperatorAuthError ? error : new DataLogError("DATA_LOG_RESPONSE"); if (denied(safe)) return; item.error = safe.message + ". " + safe.remedy; item.rows = []; item.state = "error";
      } finally { clearTimeout(timer); if (active && generation === token && identity() === who) notify(); }
    });
  }
  return {
    isService(logId: string) { return catalog.logs.some(log => log.id === logId && log.storage === "runtime"); },
    observe(next?: DataLogCapture & { instanceId: string }) { if (capture?.instanceId && next?.instanceId !== capture.instanceId) clear(true); capture = next; },
    query(logId: string, loggedTagId: string, from: number, to: number, includePrevious = false) {
      const entry = entries.get(logId + ":" + loggedTagId); if (!active || options.enabled === false || !entry || accessFault || !can("dataLogs.read")) return [];
      const lower = Math.max(-8640000000000000, Math.floor(from / 10000) * 10000), upper = Math.min(8640000000000000, Math.ceil(to / 10000) * 10000);
      const key = JSON.stringify([logId, loggedTagId, lower, upper, includePrevious]); let item = cache.get(key);
      if (!item && [...cache.values()].filter(value => value.state === "loading").length >= 8) return [];
      if (!item || item.state === "ready" && Date.now() - item.at > 2000) {
        if (!item && cache.size >= 32) { const first = [...cache].filter(([, value]) => value.state !== "loading").sort((a, b) => a[1].usedAt - b[1].usedAt)[0]; if (!first) return []; first[1].controller.abort(); cache.delete(first[0]); }
        try { const query = parseDataLogQuery({ logId, loggedTagId, definition: entry.definition, from: lower, to: upper, includePrevious, limit: 1000 }); item = { query, expectedTag: entry.tag.tag, usedAt: Date.now(), rows: [], state: "loading", at: Date.now(), controller: new AbortController() }; cache.set(key, item); load(item); } catch { return []; }
      }
      item.usedAt = Date.now();
      let previous: DataLogSample | undefined; const rows = item.rows.filter(row => { if (row.time < from) previous = row; return row.time >= from && row.time <= to; });
      return includePrevious && previous ? [previous, ...rows] : rows;
    },
    renderStatus() {
      for (const root of doc.querySelectorAll<HTMLElement>("[data-hmi-trend-root],[data-hmi-function-trend-root]")) {
        let box = root.querySelector<HTMLElement>("[data-hmi-data-log-status]"); if (!box) { box = doc.createElement("div"); box.dataset.hmiDataLogStatus = ""; box.setAttribute("role", "status"); Object.assign(box.style, { font: "14px/1.5 system-ui", padding: "8px", overflowWrap: "anywhere" }); root.append(box); }
        let pairs: string[] = []; try { const raw = root.closest("[data-hmi-active-data-logs]")?.getAttribute("data-hmi-active-data-logs"); const values = raw && raw.length < 10000 ? JSON.parse(raw) : []; if (Array.isArray(values)) pairs = [...new Set(values.filter(pair => Array.isArray(pair) && pair.length === 2 && pair.every(value => typeof value === "string")).map(pair => pair[0] + ":" + pair[1]))].filter(key => entries.has(key)); } catch { /* Invalid metadata does not initiate any read. */ }
        const requested = pairs.flatMap(key => [...cache.values()].reverse().sort((a, b) => b.usedAt - a.usedAt).filter(item => item.query.logId + ":" + item.query.loggedTagId === key).slice(0, 1)), failure = requested.find(item => item.state === "error"), loading = requested.some(item => item.state === "loading"), usesService = !!configurationError || pairs.length > 0;
        box.hidden = !usesService; if (!usesService) continue;
        box.replaceChildren(doc.createTextNode(configurationError ? configurationError.message + ". " + configurationError.remedy : options.enabled === false ? "Storico del servizio: abilita gateway e account del pannello, poi avvia il servizio." : accessFault ? accessFault.message + ". " + accessFault.remedy : !can("dataLogs.read") ? "Storico del servizio: accedi con il permesso di consultazione Data Log." : failure?.error ?? (capture?.state === "error" ? new DataLogError(capture.code ?? "DATA_LOG_STORAGE").message + ". " + new DataLogError(capture.code ?? "DATA_LOG_STORAGE").remedy : loading ? "Storico del servizio: lettura dei campioni…" : "Storico del servizio condiviso. Timestamp dei campioni in UTC; una qualità non valida non significa valore zero.")));
        if (failure) { const retry = doc.createElement("button"); retry.type = "button"; retry.textContent = "Riprova lettura storico"; retry.style.minHeight = "44px"; retry.onclick = () => { for (const [key, item] of cache) if (pairs.includes(item.query.logId + ":" + item.query.loggedTagId)) { item.controller.abort(); cache.delete(key); } notify(); }; box.append(retry); }
        if (options.enabled !== false && (accessFault || !can("dataLogs.read"))) { const login = doc.createElement("button"); login.type = "button"; login.textContent = "Apri accesso operatore"; login.style.minHeight = "44px"; login.onclick = () => openOperatorSession(login); box.append(login); }
      }
    },
    async sample(logId: string, loggedTagId?: string) {
      if (!active || options.enabled === false || !capture?.instanceId) throw new DataLogError("DATA_LOG_DISABLED");
      if (!identity()) throw new OperatorAuthError("AUTH_REQUIRED");
      if (!can("dataLogs.sample")) throw new OperatorAuthError("AUTH_PERMISSION");
      const command = { version: 1, id: view.crypto.randomUUID(), serviceInstanceId: capture.instanceId, logId, ...(loggedTagId ? { loggedTagId } : {}) }, who = identity(), token = generation, controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
      try { const data = await json("/data-log-sample", { method: "POST", headers: { "Content-Type": "application/json", ...operatorSessionHeaders() }, body: JSON.stringify(command) }, controller.signal); if (!active || token !== generation || who !== identity()) throw new DataLogError("DATA_LOG_CHANGED"); if (!data || data.version !== 1 || data.id !== command.id || !Number.isInteger(data.count) || data.count < 0 || data.count > 512 || typeof data.duplicate !== "boolean") throw new DataLogError("DATA_LOG_RESPONSE"); clear(); return data.count as number; }
      catch (error) { const safe = error instanceof DataLogError || error instanceof OperatorAuthError ? error : new DataLogError("DATA_LOG_RESPONSE"); if (active && token === generation && who === identity()) denied(safe); throw new Error(safe.message + ". " + safe.remedy + " ID richiesta: " + command.id + ". Nessun invio ripetuto automaticamente."); }
      finally { clearTimeout(timer); }
    },
    dispose() { sourceObserver.disconnect(); active = false; clear(); view.removeEventListener("framecraft:user-changed", changed); },
  };
}
