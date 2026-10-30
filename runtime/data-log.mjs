import { normalizeMqttTagValue } from "./connection-config.mjs";

const messages = {
  DATA_LOG_CONFIG: [422, "Configurazione Data Log del servizio non valida", "Apri Pannello → Data Log e storico: verifica ID, variabili dichiarate, limiti e modalità, poi salva e riavvia manualmente il servizio."],
  DATA_LOG_DISABLED: [503, "Storico del servizio non attivo", "Scegli Disco del servizio nei Data Log e avvia il gateway HMI. Gli archivi del browser restano separati."],
  DATA_LOG_STORAGE: [503, "Archivio delle variabili non disponibile", "Verifica spazio, permessi e integrità del disco con il responsabile. Non cancellare file o lock. Il PLC continua; la registrazione può essere incompleta."],
  DATA_LOG_BUSY: [503, "Archivio delle variabili già in uso", "Verifica che un solo servizio usi questo progetto. Non eliminare lock o file; riavvia manualmente solo dopo la verifica."],
  DATA_LOG_NODE: [503, "Runtime da aggiornare per lo storico delle variabili", "Usa Node LTS con SQLite almeno 3.51.3 o i backport supportati 3.50.7/3.44.6. Non disattivare i controlli di integrità."],
  DATA_LOG_LIMIT: [503, "Archivio delle variabili pieno", "Predisponi un backup verificato e manutenzione a servizio fermo. Nessun file viene eliminato per aggirare il limite del disco."],
  DATA_LOG_QUERY: [400, "Intervallo o sorgente dello storico non validi", "Seleziona un Data Log e una variabile esistenti; controlla l’intervallo e aggiorna il Runtime se necessario."],
  DATA_LOG_CHANGED: [409, "La configurazione o l’archivio dello storico sono cambiati", "Ricarica la pagina e seleziona la sorgente aggiornata. I campioni di configurazioni diverse non vengono mescolati."],
  DATA_LOG_EXPIRED: [409, "Parte dell’intervallo è stata rimossa dalla conservazione", "Ricarica lo storico. Le pagine appartengono a un’unica lettura; non viene mostrato un risultato parziale come completo."],
  DATA_LOG_RESPONSE: [502, "Risposta dello storico delle variabili non valida", "Verifica versione del servizio e proxy. I dati ricevuti non vengono usati nel grafico."],
  DATA_LOG_VOLUME: [422, "Troppi campioni per questa lettura", "Restringi l’intervallo del grafico o aumenta il ciclo di acquisizione. Nessun risultato viene troncato silenziosamente."],
};
export class DataLogError extends Error {
  constructor(code) { const known = Object.hasOwn(messages, code) ? code : "DATA_LOG_STORAGE", [status, message, remedy] = messages[known]; super(message); this.name = "DataLogError"; this.code = known; this.status = status; this.remedy = remedy; this.outcome = ["DATA_LOG_STORAGE", "DATA_LOG_LIMIT"].includes(known) ? "uncertain" : "rejected"; }
}
const fail = code => { throw new DataLogError(code); };
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, required, optional = []) => object(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
const text = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max && v === v.trim() && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(v);
const id = v => typeof v === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(v);
const integer = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max;
const time = v => Number.isFinite(v) && Math.abs(v) <= 8640000000000000;
const uuid = v => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function dataLogDefinitionKey(log, tag) {
  return JSON.stringify([log.id, tag.id, tag.tag, tag.mode, tag.cycleMs, tag.triggerTag ?? null, tag.triggerCondition ?? "changed", tag.triggerValue ?? null, tag.includeUnchanged, tag.smoothingSamples, tag.aggregation, tag.aggregationWindowMs, tag.minimum ?? null, tag.maximum ?? null]);
}
export function parseServiceDataLogs(input, variables) {
  if (typeof input === "string") try { input = JSON.parse(input); } catch { fail("DATA_LOG_CONFIG"); }
  if (!keys(input, ["version", "projectKey", "logs"]) || input.version !== 1 || !text(input.projectKey, 200) || !Array.isArray(input.logs) || input.logs.length > 5000) fail("DATA_LOG_CONFIG");
  const ids = new Set(), service = [], declared = variables && new Map(variables.map(v => [v.name, v])); let tags = 0;
  for (const log of input.logs) {
    if (!object(log) || !["memory", "browser-local", "runtime"].includes(log.storage)) fail("DATA_LOG_CONFIG");
    if (log.storage !== "runtime") continue;
    if (!id(log.id) || ids.has(log.id.toLowerCase())) fail("DATA_LOG_CONFIG"); ids.add(log.id.toLowerCase());
    if (!keys(log, ["id", "name", "enabled", "storage", "retentionMs", "maxEntries", "segmentDurationMs", "tags"]) || !text(log.name, 200) || typeof log.enabled !== "boolean" || !integer(log.retentionMs, 60000, 10 * 366 * 86400000) || !integer(log.maxEntries, 100, 500000) || !integer(log.segmentDurationMs, 60000, 10 * 366 * 86400000) || !Array.isArray(log.tags) || log.tags.length > 256) fail("DATA_LOG_CONFIG");
    const tagIds = new Set();
    for (const tag of log.tags) {
      if (!keys(tag, ["id", "name", "tag", "mode", "cycleMs", "includeUnchanged", "smoothingSamples", "aggregation", "aggregationWindowMs"], ["triggerTag", "triggerCondition", "triggerValue", "minimum", "maximum"]) || !id(tag.id) || tagIds.has(tag.id.toLowerCase()) || !text(tag.name, 200) || !text(tag.tag, 200) || !["on-change", "on-demand", "cyclic"].includes(tag.mode) || !integer(tag.cycleMs, 500, 86400000) || typeof tag.includeUnchanged !== "boolean" || !integer(tag.smoothingSamples, 1, 64) || !["none", "average", "minimum", "maximum"].includes(tag.aggregation) || !integer(tag.aggregationWindowMs, 500, 86400000)) fail("DATA_LOG_CONFIG");
      tagIds.add(tag.id.toLowerCase());
      if (tag.triggerTag !== undefined && !text(tag.triggerTag, 200) || tag.triggerCondition !== undefined && !["changed", "rising", "falling", "equals"].includes(tag.triggerCondition) || tag.triggerValue !== undefined && (typeof tag.triggerValue !== "string" || tag.triggerValue.length > 1000) || [tag.minimum, tag.maximum].some(v => v !== undefined && !Number.isFinite(v)) || tag.minimum !== undefined && tag.maximum !== undefined && tag.minimum > tag.maximum) fail("DATA_LOG_CONFIG");
      if (declared) for (const name of [tag.tag, tag.triggerTag].filter(Boolean)) { const variable = declared.get(name); if (!variable || variable.access === "write" || typeof variable.dataType !== "string") fail("DATA_LOG_CONFIG"); try { normalizeMqttTagValue(["bool", "boolean"].includes(variable.dataType.toLowerCase()) ? false : ["string", "wstring"].includes(variable.dataType.toLowerCase()) ? "" : 0, variable.dataType); } catch { fail("DATA_LOG_CONFIG"); } }
      if (declared && (tag.smoothingSamples > 1 || tag.aggregation !== "none" || tag.minimum !== undefined || tag.maximum !== undefined) && ["bool", "boolean", "string", "wstring"].includes(declared.get(tag.tag).dataType.toLowerCase())) fail("DATA_LOG_CONFIG");
    }
    tags += log.tags.length; service.push(structuredClone(log));
  }
  if (tags > 512 || service.length > 64) fail("DATA_LOG_CONFIG"); return { version: 1, projectKey: input.projectKey, logs: service };
}
export function parseDataLogQuery(v) {
  if (!keys(v, ["logId", "loggedTagId", "definition", "from", "to"], ["archiveId", "through", "after", "floor", "limit", "includePrevious"]) || !id(v.logId) || !id(v.loggedTagId) || typeof v.definition !== "string" || !v.definition || v.definition.length > 4096 || !time(v.from) || !time(v.to) || v.from > v.to || !integer(v.limit ?? 2000, 1, 5000) || v.includePrevious !== undefined && typeof v.includePrevious !== "boolean") fail("DATA_LOG_QUERY");
  if (["through", "after", "floor"].some(k => v[k] !== undefined && !integer(v[k])) || v.archiveId !== undefined && !uuid(v.archiveId) || v.after !== undefined && (v.through === undefined || v.archiveId === undefined || v.floor === undefined || v.after > v.through)) fail("DATA_LOG_QUERY");
  return { ...v, limit: v.limit ?? 2000 };
}
export function parseDataLogCapture(v) {
  if (!keys(v, ["state", "written", "instanceId"], ["code"]) || !["recording", "stopped", "error"].includes(v.state) || !integer(v.written) || !uuid(v.instanceId) || (v.state === "error" ? typeof v.code !== "string" || new DataLogError(v.code).code !== v.code : v.code !== undefined)) fail("DATA_LOG_RESPONSE"); return { ...v };
}
export function dataLogSampleValid(v) {
  return keys(v, ["seq", "logId", "loggedTagId", "tag", "time", "value", "qualityCode", "sourceTimestamp", "partial"]) && integer(v.seq, 1) && id(v.logId) && id(v.loggedTagId) && text(v.tag, 200) && time(v.time) && (v.value === null || typeof v.value === "string" && v.value.length <= 4096) && integer(v.qualityCode, 0, 255) && (v.sourceTimestamp === null || time(v.sourceTimestamp)) && typeof v.partial === "boolean" && (v.qualityCode !== 192 || v.value !== null);
}
export function parseDataLogSnapshot(v, input) {
  const q = parseDataLogQuery(input);
  if (!keys(v, ["version", "id", "namespace", "through", "floor", "definition", "samples", "previous", "nextAfter"]) || v.version !== 1 || !uuid(v.id) || !uuid(v.namespace) || !integer(v.through) || !integer(v.floor, 0, v.through) || v.definition !== q.definition || q.archiveId !== undefined && q.archiveId !== v.id || q.through !== undefined && q.through !== v.through || q.floor !== undefined && q.floor !== v.floor || !Array.isArray(v.samples) || v.samples.length > q.limit) fail("DATA_LOG_RESPONSE");
  let previous = q.after ?? 0;
  for (const sample of v.samples) { if (!dataLogSampleValid(sample) || sample.logId !== q.logId || sample.loggedTagId !== q.loggedTagId || sample.time < q.from || sample.time > q.to || sample.seq <= previous || sample.seq > v.through) fail("DATA_LOG_RESPONSE"); previous = sample.seq; }
  if (v.previous !== null && (!q.includePrevious || q.after !== undefined || !dataLogSampleValid(v.previous) || v.previous.logId !== q.logId || v.previous.loggedTagId !== q.loggedTagId || v.previous.time >= q.from || v.previous.seq > v.through)) fail("DATA_LOG_RESPONSE");
  if (v.nextAfter !== null && (!integer(v.nextAfter, 1, v.through) || v.nextAfter !== v.samples.at(-1)?.seq)) fail("DATA_LOG_RESPONSE"); return structuredClone(v);
}

const meanStep = (mean, value, count) => count === 1 ? value : Math.sign(mean) === Math.sign(value) ? mean + (value - mean) / count : mean * (1 - 1 / count) + value / count;

/** Single service sampler. Driver data only; no timer catch-up or restored current values. */
export function createServiceDataLogEngine({ catalog, write, read, now = () => Date.now(), monotonic = () => performance.now(), onError = () => {} }) {
  const logs = parseServiceDataLogs(catalog).logs.filter(log => log.enabled), latest = new Map(), pipelines = new Map(), due = new Map(); let running = false, fault, written = 0, timer;
  const entries = logs.flatMap(log => log.tags.map(tag => ({ log, tag, key: log.id + ":" + tag.id, definition: dataLogDefinitionKey(log, tag) })));
  const report = error => { if (!fault) { fault = error instanceof DataLogError ? error : new DataLogError("DATA_LOG_STORAGE"); try { onError(fault); } catch {} } };
  const commit = (rows, receipt) => { if (!rows.length && !receipt || fault) return 0; try { write(rows, receipt); written += rows.length; return rows.length; } catch (error) { report(error); if (receipt) throw fault; return 0; } };
  const point = (entry, value, sample, at, partial = false) => ({ logId: entry.log.id, loggedTagId: entry.tag.id, definition: entry.definition, tag: entry.tag.tag, time: at, value, qualityCode: sample?.lastError || !integer(sample?.qualityCode, 0, 255) ? 0 : sample.qualityCode, sourceTimestamp: time(sample?.sourceTimestamp) ? sample.sourceTimestamp : time(sample?.timestamp) ? sample.timestamp : null, partial });
  const flush = (entry, pipeline, at, partial = false) => { const b = pipeline.bucket; if (!b || !b.count) return []; pipeline.bucket = undefined; const value = entry.tag.aggregation === "minimum" ? b.min : entry.tag.aggregation === "maximum" ? b.max : b.mean; return [point(entry, String(value), b.sample, partial ? at : b.end, partial)]; };
  const process = (entry, sample, at) => {
    const p = pipelines.get(entry.key) ?? { smooth: [], last: undefined, bucket: undefined }; pipelines.set(entry.key, p); const rows = [];
    if (p.bucket && at >= p.bucket.end) rows.push(...flush(entry, p, at));
    if (!sample || sample.value === undefined || sample.qualityCode !== 192 || sample.lastError) { if (p.bucket) rows.push(...flush(entry, p, at, true)); p.smooth = []; p.bucket = undefined; const signature = "bad:" + (sample?.qualityCode ?? 0); if (p.last !== signature || entry.tag.includeUnchanged) rows.push(point(entry, sample?.value === undefined ? null : String(sample.value), sample, at)); p.last = signature; return rows; }
    let value = String(sample.value); if (value.length > 4096) { report(new DataLogError("DATA_LOG_CONFIG")); return rows; }
    const numeric = Number(value), transformed = entry.tag.smoothingSamples > 1 || entry.tag.aggregation !== "none" || entry.tag.minimum !== undefined || entry.tag.maximum !== undefined;
    if (transformed && (!Number.isFinite(numeric) || entry.tag.minimum !== undefined && numeric < entry.tag.minimum || entry.tag.maximum !== undefined && numeric > entry.tag.maximum)) return rows;
    if (entry.tag.smoothingSamples > 1) { p.smooth.push(numeric); if (p.smooth.length > entry.tag.smoothingSamples) p.smooth.shift(); value = String(p.smooth.reduce((mean, value, index) => meanStep(mean, value, index + 1), 0)); }
    if (entry.tag.aggregation !== "none") { const end = (Math.floor(at / entry.tag.aggregationWindowMs) + 1) * entry.tag.aggregationWindowMs; if (p.bucket && p.bucket.end !== end) rows.push(...flush(entry, p, at, true)); const b = p.bucket ?? { end, count: 0, mean: 0, min: Infinity, max: -Infinity }; b.count++; b.mean = meanStep(b.mean, Number(value), b.count); b.min = Math.min(b.min, Number(value)); b.max = Math.max(b.max, Number(value)); b.sample = sample; p.bucket = b; return rows; }
    if (entry.tag.includeUnchanged || p.last !== value) rows.push(point(entry, value, sample, at)); p.last = value; return rows;
  };
  const current = name => read?.(name) ?? latest.get(name);
  const trigger = (tag, before, sample) => { if (!before || before.qualityCode !== 192 || before.value === undefined || sample.qualityCode !== 192 || sample.lastError || sample.value === undefined) return false; const a = String(before.value), b = String(sample.value), bit = v => !/^(?:|0|false|off|no)$/i.test(v); return tag.triggerCondition === "rising" ? !bit(a) && bit(b) : tag.triggerCondition === "falling" ? bit(a) && !bit(b) : tag.triggerCondition === "equals" ? a !== b && b === (tag.triggerValue ?? "1") : a !== b; };
  const tick = () => { if (!running || fault) return; const at = now(), clock = monotonic(), rows = []; for (const e of entries) { if (e.tag.mode === "cyclic" && clock >= (due.get(e.key) ?? 0)) { due.set(e.key, clock + e.tag.cycleMs); rows.push(...process(e, current(e.tag.tag), at)); } else { const p = pipelines.get(e.key); if (p?.bucket && at >= p.bucket.end) rows.push(...flush(e, p, at)); } } commit(rows); };
  return {
    start() { if (running || fault) return; running = true; const clock = monotonic(); for (const e of entries) due.set(e.key, clock + e.tag.cycleMs); timer = setInterval(tick, 100); timer.unref?.(); },
    update(sample) { if (!running || fault || !sample || !text(sample.tag, 200)) return; const before = latest.get(sample.tag); latest.set(sample.tag, { ...sample }); const rows = [], at = now(); for (const e of entries) { if (e.tag.mode === "on-change" && e.tag.tag === sample.tag && (!before || before.value !== sample.value || before.qualityCode !== sample.qualityCode || before.lastError !== sample.lastError)) rows.push(...process(e, sample, at)); if (e.tag.mode === "on-demand" && e.tag.triggerTag === sample.tag && trigger(e.tag, before, sample)) rows.push(...process(e, current(e.tag.tag), at)); } commit(rows); },
    request(logId, loggedTagId, receipt) { if (!running || fault) throw fault ?? new DataLogError("DATA_LOG_DISABLED"); const selected = entries.filter(e => e.log.id === logId && (!loggedTagId || e.tag.id === loggedTagId) && e.tag.mode === "on-demand"); if (!selected.length) fail("DATA_LOG_QUERY"); return commit(selected.flatMap(e => process(e, current(e.tag.tag), now())), receipt); },
    tick,
    status() { return { state: fault ? "error" : running && entries.length ? "recording" : "stopped", written, ...(fault ? { code: fault.code } : {}) }; },
    stop() { if (!running) return; clearInterval(timer); running = false; const rows = []; for (const e of entries) { const p = pipelines.get(e.key); if (p?.bucket) rows.push(...flush(e, p, now(), true)); } commit(rows); latest.clear(); pipelines.clear(); due.clear(); },
  };
}
