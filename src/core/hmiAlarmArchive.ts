import { AlarmHistoryError, alarmHistoryStates, alarmStatisticsOrders, parseAlarmHistoryQuery, parseAlarmHistorySnapshot, parseAlarmStatisticsQuery, parseAlarmStatisticsSnapshot, type AlarmHistoryQuery, type AlarmHistorySnapshot, type AlarmStatisticsQuery, type AlarmStatisticsSnapshot, type AlarmStatisticsOrder } from "../../runtime/alarm-history.mjs";
import { OperatorAuthError } from "../../runtime/operator-policy.mjs";
import { hmiAlarmElementBlocked } from "./hmiAlarmControl";
import { operatorSessionProfile, openOperatorSession } from "./hmiOperatorSession";
import { AlarmHistoryExportError, collectAlarmHistoryCsv, alarmStatisticsCsv } from "./hmiAlarmHistoryExport";
import { createAlarmSavedViews, parseAlarmViewFilters, type AlarmViewContext, type HistoryAlarmViewFilters } from "../../scripts/hmi-alarm-views.mjs";

const names: Record<string, string> = { Incoming: "Attivato", Outgoing: "Rientrato", Acknowledged: "Presa visione registrata", Confirmed: "Rientro confermato", Shelved: "Segnalazione sospesa", Unshelved: "Segnalazione ripristinata" };
const css = `
[data-hmi-alarm-archive-root]{box-sizing:border-box;background:#f7f8fa;color:#172331;font:16px/1.5 "Segoe UI",sans-serif;padding:16px;overflow:auto;overflow-wrap:anywhere}
[data-hmi-alarm-archive-root] *{box-sizing:border-box;min-width:0}
[data-hmi-alarm-archive-root] h2{font-size:20px;margin:0 0 12px}[data-hmi-alarm-archive-root] h3{font-size:18px;margin:0 0 8px}[data-hmi-alarm-archive-root] p{margin:0 0 12px}
[data-hmi-alarm-archive-root] button,[data-hmi-alarm-archive-root] input,[data-hmi-alarm-archive-root] select{min-height:48px;max-width:100%;font:inherit;padding:8px 10px;border:1px solid #66788b;border-radius:4px;background:#fff;color:#172331}
[data-hmi-alarm-archive-root] button,[data-hmi-alarm-archive-root] summary{cursor:pointer}[data-hmi-alarm-archive-root] button:hover:not(:disabled){background:#e2edf7}
[data-hmi-alarm-archive-root] :focus-visible{outline:3px solid #1261a0;outline-offset:2px}[data-hmi-alarm-archive-root] :disabled{opacity:.6;cursor:default}
[data-hmi-alarm-archive-root] label{display:grid;gap:4px}[data-hmi-alarm-archive-root] .archive-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:12px}
[data-hmi-alarm-archive-root] .archive-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}[data-hmi-alarm-archive-root] summary{min-height:48px;padding:10px 0;list-style-position:inside}
[data-hmi-alarm-archive-root] ol{margin:12px 0;padding:0;list-style:none}[data-hmi-alarm-archive-root] li{border:1px solid #8a98a8;padding:12px;margin-bottom:12px;background:#fff}
[data-hmi-alarm-archive-root] dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:12px;margin:8px 0 0}[data-hmi-alarm-archive-root] dd{margin:0;white-space:pre-wrap}[data-hmi-alarm-archive-root] dt{font-size:14px;color:#445566}
[data-hmi-alarm-archive-root] [role=alert]{padding:12px;border-left:4px solid #a32626;background:#fff0f0}
[data-hmi-alarm-archive-root] a[download]{display:inline-flex;align-items:center;min-height:48px;max-width:100%;padding:8px 10px;border:1px solid #66788b;border-radius:4px;background:#fff;color:#172331;text-decoration:none;cursor:pointer}
[data-hmi-alarm-archive-root] a[download]:hover{background:#e2edf7}
[data-hmi-alarm-archive-root] table{border-collapse:collapse;width:100%;margin:12px 0;table-layout:fixed}[data-hmi-alarm-archive-root] th,[data-hmi-alarm-archive-root] td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #8a98a8;overflow-wrap:anywhere}[data-hmi-alarm-archive-root] th:first-child{width:30%}[data-hmi-alarm-archive-root] td small{display:block}[data-hmi-alarm-archive-root] caption{text-align:left;font-weight:600;padding:8px 0}[data-hmi-alarm-archive-root] .archive-statistic-meta{font-size:14px;color:#445566;display:block}
@media(max-width:800px){[data-hmi-alarm-archive-root] table,[data-hmi-alarm-archive-root] caption,[data-hmi-alarm-archive-root] tbody,[data-hmi-alarm-archive-root] tr,[data-hmi-alarm-archive-root] td{display:block;width:100%!important}[data-hmi-alarm-archive-root] thead{position:absolute;clip-path:inset(50%);height:1px;width:1px;overflow:hidden}[data-hmi-alarm-archive-root] tr{border:1px solid #8a98a8;margin-bottom:12px}[data-hmi-alarm-archive-root] td:before{content:attr(data-label);display:block;font-weight:600}}
`;
export function createHmiAlarmArchive(host: HTMLElement, options: { enabled: boolean; path?: string; timeoutMs?: number; request?: typeof fetch; views?: AlarmViewContext }) {
  const path = options.path ?? "/_framecraft/plc/v1", timeout = options.timeoutMs ?? 10000;
  if (path !== "/_framecraft/plc/v1" || !Number.isFinite(timeout) || timeout < 250 || timeout > 70000) throw new Error("Configurazione storico allarmi non valida.");
  const document = host.ownerDocument, view = document.defaultView!, original = [...host.childNodes], role = host.getAttribute("role"), label = host.getAttribute("aria-label");
  const style = document.createElement("style"); style.textContent = css; document.head.append(style);
  host.dataset.hmiAlarmArchiveRoot = ""; host.setAttribute("role", "region"); host.setAttribute("aria-label", "Storico allarmi su disco");
  let active = true, busy = false, epoch = 0, filtersOpen = false, helpOpen = false, changed = false, failed = false;
  let snapshot: AlarmHistorySnapshot | undefined, applied: AlarmHistoryQuery = {}, draft: Record<string, string> = {}, controller: AbortController | undefined, focusKey: string | undefined;
  let fixedDates: Record<string, string> = {};
  let notice = "Carica lo storico per consultare gli eventi salvati dal servizio. Nessuna lettura automatica.";
  let exporting = false, exported: { csv: string; info: string; basename: string; rows: number; through: number } | undefined;
  let statistics: AlarmStatisticsSnapshot | undefined, statisticsInput: AlarmStatisticsQuery | undefined, statisticsFile: string | undefined, statisticsRunning = false, statisticsOpen = false, statisticsOrder: AlarmStatisticsOrder = "frequency", statisticsLimit = 50;
  const releaseExport = () => { if (exported) { view.URL.revokeObjectURL(exported.csv); view.URL.revokeObjectURL(exported.info); exported = undefined; } };
  const releaseStatistics = () => { statistics = undefined; statisticsInput = undefined; if (statisticsFile) view.URL.revokeObjectURL(statisticsFile); statisticsFile = undefined; host.querySelector('[data-archive-statistics-result]')?.remove(); };
  const identity = () => { const user = operatorSessionProfile(); return user ? JSON.stringify([user.id, user.capabilities, user.permissions]) : ""; }; let userKey = identity();
  const permitted = () => !!operatorSessionProfile()?.capabilities.includes("alarms.history.read");
  const blocked = () => !active || !options.enabled || !permitted() || hmiAlarmElementBlocked(host);
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  function resetUser() { const who = identity(); if (who === userKey) return; userKey = who; epoch++; controller?.abort(); releaseExport(); releaseStatistics(); statisticsRunning = false; statisticsOrder = "frequency"; statisticsLimit = 50; exporting = false; snapshot = undefined; draft = {}; fixedDates = {}; savedViews.reset(); applied = {}; changed = false; busy = false; failed = false; notice = "Utente cambiato: i dati precedenti sono stati rimossi. Carica lo storico con il nuovo accesso."; }
  function button(text: string, action: () => void, disabled = false) { const node = make("button", text); node.type = "button"; node.disabled = busy || blocked() || disabled; node.addEventListener("click", () => { if (!node.disabled && !busy && !blocked()) action(); }); return node; }
  function query() {
    const raw: Record<string, unknown> = { limit: 50 }; for (const [key, value] of Object.entries(draft)) if (value) { if (key === "from" || key === "to") { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new AlarmHistoryError("ALARM_HISTORY_QUERY"); raw[key] = fixedDates[key] ?? date.toISOString(); } else raw[key] = value; }
    return parseAlarmHistoryQuery(raw);
  }
  function change(key: string, value: string) { draft[key] = value; delete fixedDates[key]; host.querySelector(`[data-archive-date-anchor="${key}"]`)?.remove(); changed = true; releaseExport(); releaseStatistics(); host.querySelector('[data-archive-export]')?.remove(); notice = "Filtri modificati: carica dalla prima pagina. Le eventuali righe mostrate usano ancora i filtri precedenti."; const status = host.querySelector('[data-archive-status]'); if (status) status.textContent = notice; for (const selector of ['[data-archive-older]', '[data-archive-prepare-export]', '[data-archive-calculate-statistics]']) { const button = host.querySelector<HTMLButtonElement>(selector); if (button) button.disabled = true; } }
  const savedViews = createAlarmSavedViews({ document, kind: "history", context: options.views, disabled: () => busy || blocked(),
    current: () => { const checked = query(); return Object.fromEntries(["alarmId", "alarmClass", "area", "state", "from", "to"].map(key => [key, checked[key as keyof AlarmHistoryQuery] ?? ""])) as unknown as HistoryAlarmViewFilters; },
    apply: value => {
      const checked = parseAlarmViewFilters("history", value), next: Record<string, string> = { ...checked }, dates: Record<string, string> = {};
      for (const key of ["from", "to"] as const) if (checked[key]) { const date = new Date(checked[key]), pad = (value: number, size = 2) => String(value).padStart(size, "0"); if (date.getFullYear() < 1) throw new AlarmHistoryError("ALARM_HISTORY_QUERY"); dates[key] = checked[key]; next[key] = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`; }
      draft = next; fixedDates = dates; changed = true; releaseExport(); releaseStatistics(); filtersOpen = true; failed = false; notice = "Vista caricata nei filtri. Controllali e carica dalla prima pagina; le righe attuali usano ancora la ricerca precedente.";
    }, changed: render,
  });
  async function read(input: AlarmHistoryQuery, signal: AbortSignal): Promise<AlarmHistorySnapshot>;
  async function read(input: AlarmStatisticsQuery, signal: AbortSignal, statistics: true): Promise<AlarmStatisticsSnapshot>;
  async function read(input: AlarmHistoryQuery | AlarmStatisticsQuery, signal: AbortSignal, statistics = false): Promise<AlarmHistorySnapshot | AlarmStatisticsSnapshot> {
    const params = new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)]));
    const response = await (options.request ?? fetch)(path + (statistics ? "/alarm-statistics?" : "/alarm-history?") + params, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal });
    let text = ""; const reader = response.body?.getReader();
    if (reader) { const decoder = new TextDecoder("utf-8", { fatal: true }); let bytes = 0; try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 4_500_000) { await reader.cancel(); throw new AlarmHistoryError("ALARM_HISTORY_RESPONSE"); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); } }
    else { text = await response.text(); if (text.length > 4_500_000) throw new AlarmHistoryError("ALARM_HISTORY_RESPONSE"); }
    signal.throwIfAborted(); let raw; try { raw = JSON.parse(text); } catch { throw new AlarmHistoryError("ALARM_HISTORY_RESPONSE"); }
    if (!response.ok) {
      if (raw?.type === "operator" && typeof raw.code === "string" && new OperatorAuthError(raw.code).code === raw.code) throw new OperatorAuthError(raw.code);
      throw new AlarmHistoryError(raw?.type === "alarm-history" && typeof raw.code === "string" && new AlarmHistoryError(raw.code).code === raw.code ? raw.code : "ALARM_HISTORY_RESPONSE");
    }
    return statistics ? parseAlarmStatisticsSnapshot(raw, input) : parseAlarmHistorySnapshot(raw, input);
  }
  async function load(older = false) {
    resetUser(); if (busy || blocked() || older && changed) return;
    let input: AlarmHistoryQuery;
    try { input = older && snapshot?.nextBefore ? { ...applied, archiveId: snapshot.id, through: applied.through ?? snapshot.sequence, before: snapshot.nextBefore } : query(); }
    catch (error) { const safe = error instanceof AlarmHistoryError ? error : new AlarmHistoryError("ALARM_HISTORY_QUERY"); failed = true; notice = safe.message + ". " + safe.remedy; render(); return; }
    releaseExport(); releaseStatistics(); const current = epoch, who = userKey, abort = new AbortController(); controller = abort; busy = true; failed = false; render();
    const timer = view.setTimeout(() => abort.abort(), timeout);
    try {
      const next = await read(input, abort.signal); if (!active || current !== epoch || who !== identity() || abort.signal.aborted) return;
      snapshot = next; applied = input; changed = false; notice = next.events.length ? "Eventi storici letti dal servizio. Nessun comando eseguito." : "Nessun evento per questi filtri.";
    } catch (error) {
      if (!active || current !== epoch || who !== identity()) return; snapshot = undefined; failed = true;
      notice = error instanceof AlarmHistoryError || error instanceof OperatorAuthError ? error.message + ". " + error.remedy : "Storico non raggiungibile o lettura scaduta. Controlla servizio, rete e proxy, poi riprova manualmente. Nessun comando viene inviato.";
    } finally { view.clearTimeout(timer); if (controller === abort) controller = undefined; if (active && current === epoch) { busy = false; render(); } }
  }
  async function prepareExport() {
    resetUser(); if (busy || blocked() || changed || !snapshot) return;
    releaseExport(); const current = epoch, who = userKey, seed = snapshot, input = { ...applied }, abort = new AbortController();
    controller = abort; busy = true; exporting = true; failed = false; notice = "Preparazione CSV: lettura di tutti gli eventi filtrati, non solo della pagina visibile…"; render();
    let expired = false; const timer = view.setTimeout(() => { expired = true; abort.abort(); }, 300000);
    try {
      const result = await collectAlarmHistoryCsv({ snapshot: seed, applied: input, signal: abort.signal, read: async (query, signal) => {
        if (blocked() || current !== epoch || who !== identity()) { abort.abort(); signal.throwIfAborted(); }
        const deadline = view.setTimeout(() => { expired = true; abort.abort(); }, timeout); try { return await read(query, signal); } finally { view.clearTimeout(deadline); }
      }, progress: rows => { if (active && current === epoch) { notice = `${rows} eventi letti per il CSV. Attendi il completamento o annulla.`; render(); } } });
      if (!active || current !== epoch || who !== identity() || abort.signal.aborted || blocked()) return;
      const csv = view.URL.createObjectURL(new Blob(result.parts, { type: "text/csv;charset=utf-8" }));
      try { exported = { csv, info: view.URL.createObjectURL(new Blob([JSON.stringify(result.manifest, null, 2) + "\n"], { type: "application/json;charset=utf-8" })), basename: result.basename, rows: result.manifest.rows, through: result.manifest.through }; }
      catch (error) { view.URL.revokeObjectURL(csv); throw error; }
      notice = `CSV pronto: ${exported.rows} eventi corrispondenti ai filtri, fino alla sequenza ${exported.through}. Scegli Scarica CSV; il browser gestirà il salvataggio.`;
    } catch (error) {
      if (!active || current !== epoch || who !== identity()) return; releaseExport(); failed = !abort.signal.aborted || expired;
      notice = error instanceof AlarmHistoryError || error instanceof OperatorAuthError || error instanceof AlarmHistoryExportError ? error.message + ". " + error.remedy : abort.signal.aborted ? expired ? "Preparazione CSV scaduta. Restringi il periodo o verifica servizio e rete. Nessun file parziale." : "Preparazione CSV annullata. Nessun file parziale è stato conservato." : "CSV non preparato. Controlla servizio, rete e supporto ai download del browser. Nessun file parziale; riprova manualmente.";
    } finally { view.clearTimeout(timer); if (controller === abort) controller = undefined; if (active && current === epoch) { busy = false; exporting = false; render(); } }
  }
  async function calculateStatistics() {
    resetUser(); if (busy || blocked() || changed || !snapshot) return;
    const { before: _before, limit: _limit, ...filters } = applied, seed = snapshot;
    const input = parseAlarmStatisticsQuery({ ...filters, archiveId: seed.id, through: applied.through ?? seed.sequence, order: statisticsOrder, limit: statisticsLimit });
    releaseStatistics(); const current = epoch, who = userKey, abort = new AbortController(); controller = abort; busy = true; statisticsRunning = true; failed = false;
    notice = "Calcolo sul servizio: tutti gli eventi dei filtri applicati, fino alla sequenza fissata. Nessun comando PLC."; render();
    const timer = view.setTimeout(() => abort.abort(), 60000);
    try {
      const next = await read(input, abort.signal, true);
      if (!active || current !== epoch || who !== identity() || abort.signal.aborted || blocked()) return;
      if (next.namespace !== seed.namespace || next.sequence < seed.sequence) throw new AlarmHistoryError("ALARM_HISTORY_CHANGED");
      statistics = next; statisticsInput = input; notice = `Statistiche pronte: ${next.matchedEvents} eventi, ${next.activations} attivazioni registrate. Nessun comando eseguito.`;
    } catch (error) {
      if (!active || current !== epoch || who !== identity()) return; releaseStatistics(); failed = !abort.signal.aborted;
      notice = error instanceof AlarmHistoryError || error instanceof OperatorAuthError ? error.message + ". " + error.remedy : abort.signal.aborted ? "Calcolo statistiche annullato o scaduto. Nessun risultato parziale; riprova manualmente se serve." : "Statistiche non disponibili. Controlla servizio, rete e versione del Runtime; riprova manualmente. Nessun comando PLC.";
    } finally { view.clearTimeout(timer); if (controller === abort) controller = undefined; if (active && current === epoch) { busy = false; statisticsRunning = false; render(); } }
  }
  function renderStatistics() {
    const section = make("details"); section.open = statisticsOpen; section.append(make("summary", "Statistiche dello storico")); section.addEventListener("toggle", () => { if (section.isConnected) statisticsOpen = section.open; });
    section.append(make("p", "Prima carica lo storico con i filtri desiderati. Il calcolo usa tutti gli eventi filtrati fino alla stessa sequenza, anche oltre la pagina visibile. Nessun aggiornamento automatico."));
    const fields = make("div"); fields.className = "archive-fields";
    for (const [title, key, values] of [["Ordina statistiche", "statistics-order", alarmStatisticsOrders.map(value => [value, ({ frequency: "Più attivazioni", "active-total": "Tempo totale fino al rientro", "ack-total": "Tempo totale fino alla presa visione", "interval-average": "Intervallo medio tra attivazioni", name: "Nome A–Z" })[value]])], ["Allarmi da mostrare", "statistics-limit", [50, 100, 500].map(value => [String(value), String(value)])]] as const) {
      const label = make("label", title), select = make("select"); select.setAttribute("aria-label", title); select.dataset.archiveFocus = key; select.disabled = busy || blocked();
      for (const [value, text] of values) { const option = make("option", text); option.value = value; select.append(option); }
      select.value = key === "statistics-order" ? statisticsOrder : String(statisticsLimit);
      select.addEventListener("change", () => { if (busy || blocked()) return; if (key === "statistics-order") statisticsOrder = select.value as AlarmStatisticsOrder; else statisticsLimit = Number(select.value); releaseStatistics(); render(); }); label.append(select); fields.append(label);
    }
    section.append(fields); const toolbar = make("div"); toolbar.className = "archive-toolbar";
    const calculate = button("Calcola statistiche dei risultati", () => void calculateStatistics(), !snapshot || changed); calculate.dataset.archiveCalculateStatistics = ""; calculate.dataset.archiveFocus = "calculate-statistics"; toolbar.append(calculate);
    if (statisticsRunning) { const cancel = make("button", "Annulla calcolo statistiche"); cancel.type = "button"; cancel.dataset.archiveFocus = "cancel-statistics"; cancel.disabled = blocked(); cancel.addEventListener("click", () => { if (!blocked()) controller?.abort(); }); toolbar.append(cancel); }
    section.append(toolbar, make("p", "Rientro e presa visione usano coppie presenti nei filtri, dello stesso avvio e occorrenza, abbinate all’ultima attivazione. L’intervallo confronta due attivazioni dello stesso allarme e avvio, anche di occorrenze diverse. Per misurare i tempi scegli Tutti nel filtro Evento. Mancanze e orari tornati indietro non diventano tempi zero; nessuna durata viene estesa a ora o fra riavvii."));
    if (statistics) {
      const result = make("section"), data = statistics; result.dataset.archiveStatisticsResult = ""; result.setAttribute("aria-label", "Statistiche calcolate degli allarmi"); result.append(make("h3", "Statistiche dei risultati filtrati"), make("p", `${data.matchedEvents} eventi · ${data.activations} attivazioni · ${data.alarms} allarmi distinti. Mostrati ${data.rows.length} di ${data.alarms}, ordinati prima del limite. Sequenza fissata: ${data.through}.`));
      const capture = data.capture, captureLabel = { recording: "attiva", disabled: "disattivata, archivio in sola lettura", stopped: "arrestata", error: "non disponibile" }[capture.state], warning = make("p", `Registrazione all’ultimo calcolo: ${captureLabel}. Avvii incompleti: ${data.incompleteRuns}; eventi senza conferma: ${capture.unconfirmedInThisRun}. Stop o perdita di qualità possono lasciare altre lacune anche con contatori a zero. Sono tempi osservati dal servizio, non disponibilità della macchina.`); if (capture.state === "error" || data.incompleteRuns || capture.unconfirmedInThisRun) warning.setAttribute("role", "alert"); result.append(warning);
      if (capture.code) { const error = new AlarmHistoryError(capture.code); result.append(make("p", error.message + ". " + error.remedy)); }
      const table = make("table"), caption = make("caption", "Frequenza e tempi registrati"), head = make("thead"), header = make("tr"), body = make("tbody"), titles = ["Allarme", "Attivazioni", "Fino al rientro", "Fino alla presa visione", "Tra attivazioni"];
      for (const title of titles) { const th = make("th", title); th.scope = "col"; header.append(th); } head.append(header);
      for (const row of data.rows) {
        const tr = make("tr"), name = make("td"); name.dataset.label = titles[0]; name.append(make("strong", row.name), make("p", row.text), make("small", row.id + " · " + row.alarmClass + (row.area ? " · " + row.area : ""))); tr.append(name);
        const count = make("td", String(row.incoming)); count.dataset.label = titles[1]; count.append(make("small", `${row.events} eventi · ${row.outgoing} rientri · ${row.acknowledged} prese visioni · ${row.confirmed} conferme` + (row.shelved || row.unshelved ? ` · ${row.shelved ?? 0} sospensioni · ${row.unshelved ?? 0} ripristini` : ""))); tr.append(count);
        for (const [i, key] of (["active", "ack", "interval"] as const).entries()) { const m = row[key], cell = make("td", m.averageMs === null ? "Media non disponibile" : "Media: " + (m.averageMs / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }) + " s"); cell.dataset.label = titles[i + 2]; const details = [`Coppie valide: ${m.pairs}`]; if (m.pairs) details.push(`Totale misurato: ${(m.totalMs / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} s`); if (m.unpaired) details.push(`Attivazioni senza coppia: ${m.unpaired}`); if (m.invalidPairs) details.push(`Orari incoerenti: ${m.invalidPairs}`); if (m.unmatchedTransitions) details.push(`Transizioni senza attivazione: ${m.unmatchedTransitions}`); for (const text of details) { const meta = make("small", text); meta.className = "archive-statistic-meta"; cell.append(meta); } tr.append(cell); }
        body.append(tr);
      }
      table.append(caption, head, body); result.append(table);
      if (data.alarms > data.rows.length) result.append(make("p", "L’elenco è limitato: aumenta Allarmi da mostrare o restringi i filtri. I totali si riferiscono a tutti i risultati, il CSV solo alle righe mostrate."));
      const downloads = make("div"); downloads.className = "archive-toolbar";
      downloads.append(button("Prepara CSV delle statistiche mostrate", () => { try { if (!statistics || !statisticsInput || changed) return; if (statisticsFile) view.URL.revokeObjectURL(statisticsFile); statisticsFile = view.URL.createObjectURL(new Blob([alarmStatisticsCsv(statistics, statisticsInput)], { type: "text/csv;charset=utf-8" })); notice = "CSV statistiche pronto: scarica le righe mostrate. Date UTC, durate in millisecondi, campi senza coppie vuoti."; } catch { notice = "Download statistiche non disponibile. I risultati restano consultabili; verifica il supporto del browser e riprova manualmente."; } render(); }));
      if (statisticsFile) { const link = make("a", "Scarica CSV statistiche"); link.href = statisticsFile; link.download = "statistiche-allarmi-" + data.id + "-fino-" + data.through + ".csv"; link.setAttribute("aria-disabled", String(busy || blocked())); link.tabIndex = busy || blocked() ? -1 : 0; link.addEventListener("click", event => { if (busy || blocked() || changed || !statisticsFile || whoChanged()) event.preventDefault(); }); downloads.append(link); }
      result.append(downloads); section.append(result);
    }
    return section;
  }
  function render() {
    if (!active) return; const focused = document.activeElement, scroll = host.scrollTop;
    if (focused && host.contains(focused)) focusKey = focused.getAttribute("data-archive-focus") ?? undefined; else if (focused && focused !== document.body) focusKey = undefined;
    resetUser(); host.replaceChildren(); host.setAttribute("aria-busy", String(busy));
    host.append(make("h2", "Storico allarmi su disco"), make("p", "Eventi salvati dal servizio, anche da avvii precedenti. Non è lo stato attuale della macchina. Sola lettura, nessun comando PLC."));
    if (!options.enabled) host.append(make("p", "Gateway disabilitato. Configura il servizio del progetto: la prova locale non crea uno storico su disco."));
    else if (!permitted()) { host.append(make("p", "Accedi con un account autorizzato a consultare tutto lo storico (alarms.history.read). Il ruolo, il PIN browser e la presa visione non concedono questo permesso.")); const login = button("Apri accesso operatore", () => {}); login.disabled = hmiAlarmElementBlocked(host); login.dataset.archiveFocus = "login"; login.addEventListener("click", () => { if (active && !login.disabled && !hmiAlarmElementBlocked(host)) openOperatorSession(login); }); host.append(login); }
    const form = make("form"), filters = make("details"), fields = make("div"); filters.open = filtersOpen; filters.append(make("summary", "Filtri dello storico (facoltativi)")); fields.className = "archive-fields"; filters.append(fields); filters.addEventListener("toggle", () => { if (filters.isConnected) filtersOpen = filters.open; });
    for (const [key, title, type] of [["alarmId", "Allarme (ID esatto)", "text"], ["alarmClass", "Classe (nome esatto)", "text"], ["area", "Zona (nome esatto)", "text"], ["state", "Evento", "select"], ["from", "Da (ora di questo dispositivo)", "datetime-local"], ["to", "A (ora di questo dispositivo)", "datetime-local"]]) {
      const label = make("label", title), input = type === "select" ? make("select") : make("input"); input.setAttribute("aria-label", title); input.dataset.archiveFocus = key;
      if (input instanceof view.HTMLSelectElement) { input.append(make("option", "Tutti")); input.options[0].value = ""; for (const state of alarmHistoryStates) { const option = make("option", names[state]); option.value = state; input.append(option); } }
      else { input.type = type; if (type === "datetime-local") input.step = ".001"; input.maxLength = key === "alarmId" ? 80 : 200; } input.value = draft[key] ?? ""; input.disabled = busy || blocked(); input.addEventListener(type === "select" ? "change" : "input", () => change(key, input.value)); label.append(input); if (fixedDates[key]) { const anchor = make("small", "Istante UTC salvato: " + fixedDates[key]); anchor.dataset.archiveDateAnchor = key; label.append(anchor); } fields.append(label);
    }
    const toolbar = make("div"); toolbar.className = "archive-toolbar";
    const read = button(snapshot ? "Aggiorna dalla prima pagina" : "Carica storico", () => {}); read.type = "submit"; read.dataset.archiveFocus = "read";
    const older = button("Eventi precedenti", () => void load(true), !snapshot?.nextBefore || changed); older.dataset.archiveOlder = ""; older.dataset.archiveFocus = "older";
    const prepare = button("Prepara CSV dei risultati filtrati", () => void prepareExport(), !snapshot || changed); prepare.dataset.archivePrepareExport = ""; prepare.dataset.archiveFocus = "prepare-export"; toolbar.append(read, older, prepare);
    if (exporting) { const cancel = make("button", "Annulla preparazione CSV"); cancel.type = "button"; cancel.dataset.archiveFocus = "cancel-export"; cancel.disabled = blocked(); cancel.addEventListener("click", () => { if (!blocked()) controller?.abort(); }); toolbar.append(cancel); }
    filters.append(savedViews.render()); form.append(filters, toolbar); form.addEventListener("submit", event => { event.preventDefault(); void load(); }); host.append(form);
    const status = make("p", busy && !exporting && !statisticsRunning ? "Lettura dello storico…" : notice); status.dataset.archiveStatus = ""; status.setAttribute("role", failed ? "alert" : "status"); host.append(status, renderStatistics());
    if (exported) {
      const section = make("section"), downloads = make("div"); section.dataset.archiveExport = ""; section.setAttribute("aria-label", "File dello storico preparati"); downloads.className = "archive-toolbar";
      section.append(make("p", `${exported.rows} eventi · sequenza massima ${exported.through}. Il CSV comprende tutte le pagine filtrate fino a quel limite, non solo le righe visibili.`));
      for (const [title, url, suffix] of [["Scarica CSV", exported.csv, ".csv"], ["Scarica dettagli dell’esportazione", exported.info, ".json"]]) {
        const link = make("a", title); link.href = url; link.download = exported.basename + suffix; link.dataset.archiveFocus = suffix;
        link.setAttribute("aria-disabled", String(busy || blocked())); link.tabIndex = busy || blocked() ? -1 : 0;
        link.addEventListener("click", event => { if (busy || blocked() || changed || !exported || whoChanged()) event.preventDefault(); }); downloads.append(link);
      }
      downloads.append(button("Scarta file preparati", () => { releaseExport(); notice = "File temporanei scartati. Gli eventuali file già scaricati non sono stati cancellati."; render(); })); section.append(downloads); host.append(section);
    }
    if (snapshot) {
      const capture = snapshot.capture, state = capture.state === "recording" ? "Registrazione su disco attiva" : capture.state === "disabled" ? "Registrazione disattivata · dati esistenti in sola lettura" : capture.state === "stopped" ? "Servizio di registrazione arrestato" : "Registrazione non disponibile: storico potenzialmente incompleto";
      const message = make("p", "Stato del servizio all’ultima lettura: " + state + (capture.unconfirmedInThisRun ? `. Eventi senza conferma di registrazione in questo avvio: ${capture.unconfirmedInThisRun}.` : ".")); if (capture.state === "error") message.setAttribute("role", "alert"); host.append(message);
      if (capture.code) { const error = new AlarmHistoryError(capture.code); host.append(make("p", error.message + ". " + error.remedy)); }
      host.append(make("p", `${snapshot.count} eventi totali nell’archivio. Avvii precedenti incompleti: ${snapshot.incompleteRuns}.`));
      const help = make("details"); help.open = helpOpen; help.append(make("summary", "Come leggere lo storico"), make("p", "I totali riguardano tutto l’archivio, non soltanto il filtro. Durante uno stop o una perdita di qualità gli eventi possono mancare, anche con zero avvii incompleti; non vengono ricostruiti."), make("p", "Ordine di registrazione; data evento = valutazione del segnale sul servizio, non timestamp del PLC. Testo e classe sono quelli salvati all’epoca. Orari nel fuso di questo dispositivo; UTC e identificativi nei dettagli."), make("p", "CSV: tutti i risultati dei filtri applicati, ordine dal più recente, limite di sequenza fissato all’ultima prima pagina letta. Gli eventi nuovi restano fuori fino a un aggiornamento. UTF-8, separatore punto e virgola, date UTC; un apostrofo protegge i testi che potrebbero essere formule nei fogli di calcolo. I dettagli JSON conservano filtri e avvisi: scaricali insieme al CSV. Non è un backup o un formato di importazione vendor. Limite 64 MiB / 500.000 eventi / 5 minuti; se superato, restringi i filtri. Nessun parziale scaricabile."), make("p", "Qui non si prendono visione o confermano allarmi: usa la lista degli allarmi attuali. Gli eventi senza conferma di registrazione potrebbero essere arrivati su disco prima di un errore; il contatore non certifica perdite esatte.")); help.addEventListener("toggle", () => { if (help.isConnected) helpOpen = help.open; }); host.append(help);
      const list = make("ol"); list.setAttribute("aria-label", "Eventi storici degli allarmi");
      for (const row of snapshot.events) {
        const item = make("li"); item.append(make("h3", names[row.event.state] + " · " + row.event.name), make("p", row.event.text));
        const dl = make("dl"); for (const [title, value] of [["Data evento", new Date(row.event.time).toLocaleString()], ["Classe / zona", row.event.alarmClass + (row.event.area ? " / " + row.event.area : "")], ["Priorità / ID allarme", row.event.priority + " / " + row.event.id], ["Operatore (ID)", row.event.actor ?? "Nessuno: evento del segnale"]]) { const group = make("div"); group.append(make("dt", title), make("dd", value)); dl.append(group); } item.append(dl);
        if (row.event.shelving) { const info = row.event.shelving; item.append(make("p", "Motivo: " + info.reason), make("p", "until" in info ? "Termine massimo: " + new Date(info.until).toISOString() + (info.mode === "one-shot" ? " · anche al rientro valido" : "") : "Ripristino: " + ({ operator: "richiesto dall’operatore", elapsed: "durata raggiunta", returned: "rientro valido del segnale" }[info.cause]))); }
        const detail = make("details"); detail.append(make("summary", "Identificativi e date UTC"), make("p", `Archivio #${row.seq} · evento nell’avvio #${row.event.sequence} · avvio ${row.instanceId} · occorrenza ${row.event.occurrence}`), make("p", "Evento: " + new Date(row.event.time).toISOString() + " · registrazione: " + row.recordedAt)); item.append(detail); list.append(item);
      }
      host.append(list);
    }
    host.scrollTop = scroll; if (focusKey) { const node = [...host.querySelectorAll<HTMLElement>("[data-archive-focus]")].find(node => node.dataset.archiveFocus === focusKey); if (node && !node.hasAttribute("disabled")) node.focus({ preventScroll: true }); }
  }
  const whoChanged = () => identity() !== userKey;
  const changedUser = () => { if (identity() === userKey) return; resetUser(); render(); }; view.addEventListener("framecraft:user-changed", changedUser); render();
  return { refresh: render, dispose() { if (!active) return; active = false; epoch++; controller?.abort(); releaseExport(); releaseStatistics(); savedViews.dispose(); view.removeEventListener("framecraft:user-changed", changedUser); style.remove(); delete host.dataset.hmiAlarmArchiveRoot; host.removeAttribute("aria-busy"); if (role === null) host.removeAttribute("role"); else host.setAttribute("role", role); if (label === null) host.removeAttribute("aria-label"); else host.setAttribute("aria-label", label); host.replaceChildren(...original); } };
}
