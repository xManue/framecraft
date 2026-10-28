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
  ALARM_HISTORY_STATISTICS_LIMIT: [422, "Statistiche troppo estese", "Restringi date, classe, zona o ID e riprova. Il calcolo supera 10.000 allarmi, i limiti numerici o 30 secondi: nessun risultato parziale."],
  ALARM_HISTORY_STATISTICS_CANCELLED: [408, "Calcolo statistiche interrotto", "Il calcolo è stato annullato o il collegamento è terminato. Riprova manualmente se serve; nessun risultato parziale e nessun comando PLC."],
  ALARM_HISTORY_STATISTICS_BUSY: [429, "Statistiche già in calcolo", "Attendi il termine del calcolo in corso, poi riprova manualmente. Le richieste troppo ravvicinate non vengono accodate; non occorre riavviare il servizio."],
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

export const alarmStatisticsOrders = Object.freeze(["frequency", "active-total", "ack-total", "interval-average", "name"]);
export function parseAlarmStatisticsQuery(value = {}) {
  if (!historyKeys(value, [], ["limit", "through", "archiveId", "alarmId", "alarmClass", "area", "state", "from", "to", "order"])) fail("ALARM_HISTORY_QUERY");
  const { order = "frequency", ...filters } = value;
  if (!alarmStatisticsOrders.includes(order)) fail("ALARM_HISTORY_QUERY");
  return { ...parseAlarmHistoryQuery(filters), order };
}
const metric = () => ({ pairs: 0, totalMs: 0, averageMs: null, invalidPairs: 0, unpaired: 0, unmatchedTransitions: 0 });
function addDuration(target, start, end) {
  const duration = end - start;
  if (duration < 0) { target.invalidPairs++; return; }
  if (!Number.isFinite(duration) || duration > Number.MAX_SAFE_INTEGER || target.totalMs + duration > Number.MAX_SAFE_INTEGER) fail("ALARM_HISTORY_STATISTICS_LIMIT");
  target.pairs++; target.totalMs += duration;
}
export function compareAlarmStatisticsRows(a, b, order) {
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0, name = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const delta = order === "name" ? compare(name(a.name), name(b.name)) : order === "frequency" ? b.incoming - a.incoming : order === "active-total" ? b.active.totalMs - a.active.totalMs : order === "ack-total" ? b.ack.totalMs - a.ack.totalMs : (b.interval.averageMs ?? -1) - (a.interval.averageMs ?? -1);
  return delta || compare(a.id, b.id);
}
// The store feeds validated rows in registration order; pairing never crosses service runs.
export function createAlarmStatisticsAccumulator() {
  const groups = new Map(); let events = 0, incoming = 0, previous = 0;
  return {
    push(row) {
      if (!integer(row.seq, 1) || row.seq <= previous || ++events > 500000) fail("ALARM_HISTORY_RESPONSE"); previous = row.seq;
      const e = row.event;
      let group = groups.get(e.id);
      if (!group) {
        if (groups.size >= 10000) fail("ALARM_HISTORY_STATISTICS_LIMIT");
        group = { id: e.id, name: e.name, text: e.text, alarmClass: e.alarmClass, area: e.area, priority: e.priority, events: 0, incoming: 0, outgoing: 0, acknowledged: 0, confirmed: 0, firstTime: e.time, lastTime: e.time, active: metric(), ack: metric(), interval: metric(), last: undefined };
        groups.set(e.id, group);
      }
      Object.assign(group, { name: e.name, text: e.text, alarmClass: e.alarmClass, area: e.area, priority: e.priority });
      group.events++; group.firstTime = Math.min(group.firstTime, e.time); group.lastTime = Math.max(group.lastTime, e.time);
      if (e.state === "Incoming") {
        incoming++; group.incoming++;
        if (group.last?.instance === row.instanceId) addDuration(group.interval, group.last.time, e.time);
        group.last = { instance: row.instanceId, occurrence: e.occurrence, time: e.time, active: false, ack: false };
      } else if (e.state === "Confirmed") group.confirmed++;
      else {
        const kind = e.state === "Outgoing" ? "active" : "ack"; group[e.state === "Outgoing" ? "outgoing" : "acknowledged"]++;
        const start = group.last;
        if (start?.instance === row.instanceId && start.occurrence === e.occurrence && !start[kind]) { addDuration(group[kind], start.time, e.time); start[kind] = true; }
        else group[kind].unmatchedTransitions++;
      }
    },
    finish(order = "frequency", limit = 50) {
      parseAlarmStatisticsQuery({ order, limit });
      const rows = [...groups.values()].map(({ last: _last, ...group }) => {
        for (const key of ["active", "ack", "interval"]) { const value = { ...group[key] }; value.averageMs = value.pairs ? value.totalMs / value.pairs : null; value.unpaired = group.incoming - value.pairs - value.invalidPairs; group[key] = value; }
        return group;
      }).sort((a, b) => compareAlarmStatisticsRows(a, b, order));
      return { matchedEvents: events, activations: incoming, alarms: groups.size, rows: rows.slice(0, limit) };
    },
  };
}
export function parseAlarmStatisticsSnapshot(value, input = {}) {
  const query = parseAlarmStatisticsQuery(input);
  if (!historyKeys(value, ["version", "id", "namespace", "sequence", "through", "matchedEvents", "activations", "alarms", "incompleteRuns", "capture", "order", "limit", "rows"]) || value.version !== 1 || !historyUuid(value.id) || !historyUuid(value.namespace) || !integer(value.sequence, 0, 500000) || !integer(value.through, 0, value.sequence) || query.archiveId !== undefined && query.archiveId !== value.id || query.through !== undefined && query.through !== value.through || value.order !== query.order || value.limit !== query.limit || !integer(value.matchedEvents, 0, value.through) || !integer(value.activations, 0, value.matchedEvents) || !integer(value.alarms, 0, Math.min(10000, value.matchedEvents)) || !integer(value.incompleteRuns) || !Array.isArray(value.rows) || value.rows.length !== Math.min(value.alarms, query.limit)) fail("ALARM_HISTORY_RESPONSE");
  parseAlarmHistoryCapture(value.capture);
  const ids = new Set(); let events = 0, incoming = 0;
  for (let i = 0; i < value.rows.length; i++) {
    const row = value.rows[i];
    if (!historyKeys(row, ["id", "name", "text", "alarmClass", "area", "priority", "events", "incoming", "outgoing", "acknowledged", "confirmed", "firstTime", "lastTime", "active", "ack", "interval"]) || ids.has(row.id) || !text(row.id, 80) || !/^[A-Za-z0-9_-]+$/.test(row.id) || !text(row.name, 200) || !text(row.text, 1000) || !text(row.alarmClass, 200) || !text(row.area, 200, true) || !integer(row.priority, 0, 255) || !integer(row.events, 1, value.matchedEvents) || ["incoming", "outgoing", "acknowledged", "confirmed"].some(key => !integer(row[key], 0, row.events)) || row.incoming + row.outgoing + row.acknowledged + row.confirmed !== row.events || !Number.isFinite(row.firstTime) || !Number.isFinite(row.lastTime) || Math.abs(row.firstTime) > 8640000000000000 || Math.abs(row.lastTime) > 8640000000000000 || row.firstTime > row.lastTime || query.alarmId !== undefined && row.id !== query.alarmId || query.alarmClass !== undefined && row.alarmClass !== query.alarmClass || query.area !== undefined && row.area !== query.area || query.from !== undefined && row.firstTime < Date.parse(query.from) || query.to !== undefined && row.lastTime > Date.parse(query.to) || i > 0 && compareAlarmStatisticsRows(value.rows[i - 1], row, query.order) >= 0) fail("ALARM_HISTORY_RESPONSE");
    for (const key of ["active", "ack", "interval"]) {
      const m = row[key], transitions = key === "active" ? row.outgoing : key === "ack" ? row.acknowledged : row.incoming;
      if (!historyKeys(m, ["pairs", "totalMs", "averageMs", "invalidPairs", "unpaired", "unmatchedTransitions"]) || ["pairs", "invalidPairs", "unpaired", "unmatchedTransitions"].some(field => !integer(m[field], 0, value.matchedEvents)) || m.pairs + m.invalidPairs + m.unpaired !== row.incoming || m.pairs + m.invalidPairs + m.unmatchedTransitions > transitions || !Number.isFinite(m.totalMs) || m.totalMs < 0 || m.totalMs > Number.MAX_SAFE_INTEGER || (m.pairs === 0 ? m.totalMs !== 0 || m.averageMs !== null : m.averageMs !== m.totalMs / m.pairs)) fail("ALARM_HISTORY_RESPONSE");
    }
    if (query.state && row[{ Incoming: "incoming", Outgoing: "outgoing", Acknowledged: "acknowledged", Confirmed: "confirmed" }[query.state]] !== row.events) fail("ALARM_HISTORY_RESPONSE");
    ids.add(row.id); events += row.events; incoming += row.incoming;
  }
  if (events > value.matchedEvents || incoming > value.activations || value.rows.length === value.alarms && (events !== value.matchedEvents || incoming !== value.activations)) fail("ALARM_HISTORY_RESPONSE");
  return structuredClone(value);
}
