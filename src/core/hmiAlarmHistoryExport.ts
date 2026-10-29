import { AlarmHistoryError, parseAlarmHistoryQuery, parseAlarmHistorySnapshot, parseAlarmStatisticsSnapshot, type AlarmHistoryQuery, type AlarmHistorySnapshot, type AlarmStatisticsQuery, type AlarmStatisticsSnapshot } from "../../runtime/alarm-history.mjs";

const maxBytes = 64 * 1024 * 1024, maxRows = 500000;
export class AlarmHistoryExportError extends Error {
  readonly remedy = "Nessun file parziale è disponibile. Restringi le date o gli altri filtri, ricarica lo storico e riprova.";
}
const cell = (value: string | number) => {
  const text = String(value), safe = /^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
};
const line = (values: (string | number)[]) => values.map(cell).join(";") + "\r\n";
export function alarmStatisticsCsv(value: AlarmStatisticsSnapshot, query: AlarmStatisticsQuery) {
  const data = parseAlarmStatisticsSnapshot(value, query);
  let csv = "\uFEFF" + line(["archive_id", "namespace", "through", "order", "matched_events", "all_alarms", "alarm_id", "name", "text", "class", "area", "events", "activations", "outgoing", "acknowledged", "confirmed", "shelved", "unshelved", "commented", "first_event_utc", "last_event_utc", ...["active", "ack", "interval"].flatMap(key => [key + "_pairs", key + "_total_ms", key + "_average_ms", key + "_invalid_pairs", key + "_unpaired", key + "_unmatched_transitions"])]);
  for (const row of data.rows) csv += line([data.id, data.namespace, data.through, data.order, data.matchedEvents, data.alarms, row.id, row.name, row.text, row.alarmClass, row.area, row.events, row.incoming, row.outgoing, row.acknowledged, row.confirmed, row.shelved ?? 0, row.unshelved ?? 0, row.commented ?? 0, new Date(row.firstTime).toISOString(), new Date(row.lastTime).toISOString(), ...(["active", "ack", "interval"] as const).flatMap(key => { const m = row[key]; return [m.pairs, m.totalMs, m.averageMs ?? "", m.invalidPairs, m.unpaired, m.unmatchedTransitions]; })]);
  return csv;
}
function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 250);
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  });
}
export interface AlarmHistoryExportOptions {
  snapshot: AlarmHistorySnapshot; applied: AlarmHistoryQuery; signal: AbortSignal;
  read(query: AlarmHistoryQuery, signal: AbortSignal): Promise<unknown>;
  progress?(rows: number): void; pause?(signal: AbortSignal): Promise<void>;
}
export async function collectAlarmHistoryCsv(options: AlarmHistoryExportOptions) {
  const seed = parseAlarmHistorySnapshot(options.snapshot, options.applied), through = options.applied.through ?? seed.sequence;
  const { limit: _limit, before: _before, through: _through, archiveId: _archiveId, ...filters } = parseAlarmHistoryQuery(options.applied);
  const query = parseAlarmHistoryQuery({ ...filters, archiveId: seed.id, through, limit: 500 });
  const exportedAt = new Date().toISOString(), parts = ["\uFEFF" + line(["archive_id", "namespace", "snapshot_through", "sequence", "instance_id", "event_sequence", "occurrence", "alarm_id", "name", "text", "class", "priority", "area", "state", "event_time_utc", "recorded_at_utc", "actor", "shelving_mode", "shelved_until_utc", "unshelve_cause", "shelving_reason", "comment_id", "comment_text", "comment_author", "reference_archive", "reference_sequence", "reference_instance", "reference_occurrence"])];
  const encoder = new TextEncoder(); let bytes = encoder.encode(parts[0]).byteLength, rows = 0, previous = through + 1, before: number | undefined;
  let final = seed, incompleteRunsMax = seed.incompleteRuns, unconfirmedMax = seed.capture.unconfirmedInThisRun;
  const states = new Set([seed.capture.state]), codes = new Set(seed.capture.code ? [seed.capture.code] : []);
  do {
    options.signal.throwIfAborted(); await (options.pause ?? pause)(options.signal); options.signal.throwIfAborted();
    const input = { ...query, ...(before !== undefined ? { before } : {}) };
    const next = parseAlarmHistorySnapshot(await options.read(input, options.signal), input); options.signal.throwIfAborted();
    if (next.id !== seed.id || next.namespace !== seed.namespace || next.sequence < final.sequence) throw new AlarmHistoryError("ALARM_HISTORY_CHANGED");
    let chunk = "";
    for (const row of next.events) {
      if (row.seq >= previous) throw new AlarmHistoryError("ALARM_HISTORY_RESPONSE"); previous = row.seq;
      const event = row.event;
      chunk += line([seed.id, seed.namespace, through, row.seq, row.instanceId, event.sequence, event.occurrence, event.id, event.name, event.text, event.alarmClass, event.priority, event.area, event.state, new Date(event.time).toISOString(), row.recordedAt, event.actor ?? "", event.shelving && "mode" in event.shelving ? event.shelving.mode : "", event.shelving && "until" in event.shelving ? new Date(event.shelving.until).toISOString() : "", event.shelving && "cause" in event.shelving ? event.shelving.cause : "", event.shelving?.reason ?? "", event.note?.id ?? "", event.note?.text ?? "", event.note?.authorName ?? "", event.note?.reference.archiveId ?? "", event.note?.reference.seq ?? "", event.note?.reference.instanceId ?? "", event.note?.reference.occurrence ?? ""]);
    }
    bytes += encoder.encode(chunk).byteLength; rows += next.events.length;
    if (bytes > maxBytes || rows > maxRows) throw new AlarmHistoryExportError("L’esportazione supera 64 MiB o 500.000 eventi");
    parts.push(chunk); final = next; incompleteRunsMax = Math.max(incompleteRunsMax, next.incompleteRuns); unconfirmedMax = Math.max(unconfirmedMax, next.capture.unconfirmedInThisRun);
    states.add(next.capture.state); if (next.capture.code) codes.add(next.capture.code);
    before = next.nextBefore ?? undefined; options.progress?.(rows);
  } while (before !== undefined);
  options.signal.throwIfAborted();
  const manifest = { format: "framecraft-alarm-history-export", version: 1, exportedAt, archiveId: seed.id, namespace: seed.namespace, through, filters, rows, csvBytes: bytes, order: "registration-desc", timeZone: "UTC", sourceTime: "service-evaluation-not-plc", spreadsheetTextProtection: "apostrophe-prefix", captureAtStart: seed.capture, captureAtFinish: final.capture, captureStatesSeen: [...states], captureCodesSeen: [...codes], incompleteRunsMax, unconfirmedInThisRunMax: unconfirmedMax, warning: "Non è un backup o una prova di completezza della registrazione. Stop, perdita di qualità ed errori possono lasciare lacune, anche con contatori a zero. Nessuno stato attivo o comando è ricostruito." };
  return { parts, manifest, basename: "allarmi-" + seed.id + "-fino-" + through };
}
