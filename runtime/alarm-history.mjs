const messages = {
  ALARM_HISTORY_DISABLED: [503, "Archivio allarmi non attivo", "In Framecraft apri Pannello → Allarmi e abilita l’archivio su disco, salva e riavvia manualmente il servizio. Lo storico di sessione resta separato."],
  ALARM_HISTORY_STORAGE: [503, "Archivio allarmi non disponibile", "Fai verificare disco locale, spazio, permessi e integrità dal responsabile. Non eliminare o sostituire i file. Gli allarmi attivi continuano, ma lo storico può essere incompleto."],
  ALARM_HISTORY_BUSY: [503, "Archivio allarmi occupato", "Controlla che un solo servizio usi questo progetto. Non eliminare lock o file; dopo la verifica riavvia manualmente il servizio."],
  ALARM_HISTORY_LIMIT: [503, "Archivio allarmi pieno", "Fai predisporre backup verificato e manutenzione a servizio fermo. Puoi aumentare il limite eventi entro i limiti previsti, ma nessun evento viene cancellato automaticamente."],
  ALARM_HISTORY_CONFIG: [503, "Configurazione archivio allarmi non valida", "Controlla l’abilitazione, il limite e l’identificativo del progetto in framecraft.auth.json. L’archivio non richiede l’accesso ChatGPT e non viene riparato automaticamente."],
  ALARM_HISTORY_NODE: [503, "Aggiorna il Runtime per l’archivio allarmi", "Usa Node LTS con SQLite corretto: almeno 3.51.3 o backport 3.50.7/3.44.6. Qui è collaudato Node 24.19. Non disattivare le verifiche di integrità."],
  ALARM_HISTORY_QUERY: [400, "Filtri dello storico non validi", "Controlla identificativi, intervallo date e pagina. Usa i filtri del controllo; nessuna query SQL libera è accettata."],
  ALARM_HISTORY_CHANGED: [409, "L’archivio allarmi è cambiato", "Ricarica la prima pagina. Non mescolare pagine appartenenti ad archivi differenti."],
  ALARM_HISTORY_RESPONSE: [502, "Risposta dello storico non valida", "Non fidarti dei dati ricevuti. Fai verificare versione del servizio e proxy; nessun comando viene ripetuto."],
};
export class AlarmHistoryError extends Error {
  constructor(code) { const known = Object.hasOwn(messages, code) ? code : "ALARM_HISTORY_STORAGE", [status, message, remedy] = messages[known]; super(message); this.name = "AlarmHistoryError"; this.code = known; this.status = status; this.remedy = remedy; }
}
export const historyObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const historyKeys = (value, required, optional = []) => historyObject(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
export const historyUuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const text = (value, max, empty = false) => typeof value === "string" && (empty || value.trim().length > 0) && value.length <= max && !/[\u0000-\u001f]/.test(value);
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const iso = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fail = code => { throw new AlarmHistoryError(code); };
export const alarmHistoryStates = Object.freeze(["Incoming", "Outgoing", "Acknowledged", "Confirmed"]);
export function parseHistoryEvent(value) {
  if (!historyKeys(value, ["sequence", "id", "occurrence", "name", "text", "alarmClass", "priority", "area", "state", "time"], ["actor"]) || !integer(value.sequence, 1) || !text(value.id, 80) || !/^[A-Za-z0-9_-]+$/.test(value.id) || !text(value.occurrence, 80) || !text(value.name, 200) || !text(value.text, 1000) || !text(value.alarmClass, 200) || !text(value.area, 200, true) || !integer(value.priority, 0, 255) || !alarmHistoryStates.includes(value.state) || !Number.isFinite(value.time) || Math.abs(value.time) > 8640000000000000 || value.actor !== undefined && !text(value.actor, 200)) fail("ALARM_HISTORY_RESPONSE");
  if (["Acknowledged", "Confirmed"].includes(value.state) !== (value.actor !== undefined)) fail("ALARM_HISTORY_RESPONSE");
  return structuredClone(value);
}
export function parseAlarmHistoryQuery(value = {}) {
  const allowed = ["limit", "before", "through", "archiveId", "alarmId", "alarmClass", "area", "state", "from", "to"];
  if (!historyKeys(value, [], allowed)) fail("ALARM_HISTORY_QUERY");
  const query = { ...value, limit: value.limit ?? 50 };
  if (!integer(query.limit, 1, 500)) fail("ALARM_HISTORY_QUERY");
  for (const key of ["before", "through"]) if (query[key] !== undefined && !integer(query[key], key === "before" ? 1 : 0)) fail("ALARM_HISTORY_QUERY");
  if (query.archiveId !== undefined && !historyUuid(query.archiveId)) fail("ALARM_HISTORY_QUERY");
  for (const key of ["alarmId", "alarmClass", "area"]) if (query[key] !== undefined && !text(query[key], key === "alarmId" ? 80 : 200)) fail("ALARM_HISTORY_QUERY");
  if (query.state !== undefined && !alarmHistoryStates.includes(query.state)) fail("ALARM_HISTORY_QUERY");
  for (const key of ["from", "to"]) if (query[key] !== undefined && !iso(query[key])) fail("ALARM_HISTORY_QUERY");
  if (query.from && query.to && query.from > query.to) fail("ALARM_HISTORY_QUERY");
  return query;
}
export function matchesAlarmHistory(row, query) {
  const e = row.event;
  return !(query.before !== undefined && row.seq >= query.before || query.through !== undefined && row.seq > query.through || query.alarmId !== undefined && e.id !== query.alarmId || query.alarmClass !== undefined && e.alarmClass !== query.alarmClass || query.area !== undefined && e.area !== query.area || query.state !== undefined && e.state !== query.state || query.from !== undefined && e.time < Date.parse(query.from) || query.to !== undefined && e.time > Date.parse(query.to));
}
export function parseAlarmHistoryCapture(value) {
  if (!historyKeys(value, ["state", "unconfirmedInThisRun"], ["code"]) || !["recording", "disabled", "error", "stopped"].includes(value.state) || !integer(value.unconfirmedInThisRun) || value.code !== undefined && new AlarmHistoryError(value.code).code !== value.code || value.state === "error" && !value.code) fail("ALARM_HISTORY_RESPONSE");
  return { ...value };
}
export function parseAlarmHistorySnapshot(value, query = {}) {
  const q = parseAlarmHistoryQuery(query);
  if (!historyKeys(value, ["version", "id", "namespace", "sequence", "count", "incompleteRuns", "events", "nextBefore", "capture"]) || value.version !== 1 || !historyUuid(value.id) || !historyUuid(value.namespace) || !integer(value.sequence) || value.count !== value.sequence || !integer(value.incompleteRuns) || !Array.isArray(value.events) || value.events.length > q.limit || value.nextBefore !== null && !integer(value.nextBefore, 1, value.sequence) || q.archiveId !== undefined && q.archiveId !== value.id || q.through !== undefined && q.through > value.sequence) fail("ALARM_HISTORY_RESPONSE");
  parseAlarmHistoryCapture(value.capture);
  let last = Math.min(value.sequence, q.through ?? value.sequence) + 1;
  for (const row of value.events) {
    if (!historyKeys(row, ["seq", "instanceId", "recordedAt", "event"]) || !integer(row.seq, 1, value.sequence) || row.seq >= last || !historyUuid(row.instanceId) || !iso(row.recordedAt)) fail("ALARM_HISTORY_RESPONSE");
    parseHistoryEvent(row.event); if (!matchesAlarmHistory(row, q)) fail("ALARM_HISTORY_RESPONSE"); last = row.seq;
  }
  if (value.nextBefore !== null && value.nextBefore !== value.events.at(-1)?.seq) fail("ALARM_HISTORY_RESPONSE");
  return structuredClone(value);
}
