import { AlarmHistoryError, alarmHistoryStates, parseAlarmHistoryQuery, parseAlarmHistorySnapshot, type AlarmHistoryQuery, type AlarmHistorySnapshot } from "../../runtime/alarm-history.mjs";
import { OperatorAuthError } from "../../runtime/operator-policy.mjs";
import { hmiAlarmElementBlocked } from "./hmiAlarmControl";
import { operatorSessionProfile, openOperatorSession } from "./hmiOperatorSession";

const names: Record<string, string> = { Incoming: "Attivato", Outgoing: "Rientrato", Acknowledged: "Presa visione registrata", Confirmed: "Rientro confermato" };
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
`;
export function createHmiAlarmArchive(host: HTMLElement, options: { enabled: boolean; path?: string; timeoutMs?: number; request?: typeof fetch }) {
  const path = options.path ?? "/_framecraft/plc/v1", timeout = options.timeoutMs ?? 10000;
  if (path !== "/_framecraft/plc/v1" || !Number.isFinite(timeout) || timeout < 250 || timeout > 70000) throw new Error("Configurazione storico allarmi non valida.");
  const document = host.ownerDocument, view = document.defaultView!, original = [...host.childNodes], role = host.getAttribute("role"), label = host.getAttribute("aria-label");
  const style = document.createElement("style"); style.textContent = css; document.head.append(style);
  host.dataset.hmiAlarmArchiveRoot = ""; host.setAttribute("role", "region"); host.setAttribute("aria-label", "Storico allarmi su disco");
  let active = true, busy = false, epoch = 0, filtersOpen = false, helpOpen = false, changed = false, failed = false;
  let snapshot: AlarmHistorySnapshot | undefined, applied: AlarmHistoryQuery = {}, draft: Record<string, string> = {}, controller: AbortController | undefined, focusKey: string | undefined;
  let notice = "Carica lo storico per consultare gli eventi salvati dal servizio. Nessuna lettura automatica.";
  const identity = () => { const user = operatorSessionProfile(); return user ? JSON.stringify([user.id, user.capabilities]) : ""; }; let userKey = identity();
  const permitted = () => !!operatorSessionProfile()?.capabilities.includes("alarms.history.read");
  const blocked = () => !active || !options.enabled || !permitted() || hmiAlarmElementBlocked(host);
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  function resetUser() { const who = identity(); if (who === userKey) return; userKey = who; epoch++; controller?.abort(); snapshot = undefined; draft = {}; applied = {}; changed = false; busy = false; failed = false; notice = "Utente cambiato: i dati precedenti sono stati rimossi. Carica lo storico con il nuovo accesso."; }
  function button(text: string, action: () => void, disabled = false) { const node = make("button", text); node.type = "button"; node.disabled = busy || blocked() || disabled; node.addEventListener("click", () => { if (!node.disabled && !busy && !blocked()) action(); }); return node; }
  function query() {
    const raw: Record<string, unknown> = { limit: 50 }; for (const [key, value] of Object.entries(draft)) if (value) { if (key === "from" || key === "to") { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new AlarmHistoryError("ALARM_HISTORY_QUERY"); raw[key] = date.toISOString(); } else raw[key] = value; }
    return parseAlarmHistoryQuery(raw);
  }
  function change(key: string, value: string) { draft[key] = value; changed = true; const status = host.querySelector('[data-archive-status]'); if (status) status.textContent = "Filtri modificati: carica dalla prima pagina. Le eventuali righe mostrate usano ancora i filtri precedenti."; const older = host.querySelector<HTMLButtonElement>('[data-archive-older]'); if (older) older.disabled = true; }
  async function load(older = false) {
    resetUser(); if (busy || blocked() || older && changed) return;
    let input: AlarmHistoryQuery;
    try { input = older && snapshot?.nextBefore ? { ...applied, archiveId: snapshot.id, through: applied.through ?? snapshot.sequence, before: snapshot.nextBefore } : query(); }
    catch (error) { const safe = error instanceof AlarmHistoryError ? error : new AlarmHistoryError("ALARM_HISTORY_QUERY"); failed = true; notice = safe.message + ". " + safe.remedy; render(); return; }
    const current = epoch, who = userKey, abort = new AbortController(); controller = abort; busy = true; failed = false; render();
    const timer = view.setTimeout(() => abort.abort(), timeout);
    try {
      const params = new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)]));
      const response = await (options.request ?? fetch)(path + "/alarm-history?" + params, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: abort.signal });
      let text = ""; const reader = response.body?.getReader();
      if (reader) { const decoder = new TextDecoder("utf-8", { fatal: true }); let bytes = 0; try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 4_500_000) { await reader.cancel(); throw new AlarmHistoryError("ALARM_HISTORY_RESPONSE"); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); } }
      else { text = await response.text(); if (text.length > 4_500_000) throw new AlarmHistoryError("ALARM_HISTORY_RESPONSE"); }
      if (abort.signal.aborted) throw new Error("timeout");
      let raw; try { raw = JSON.parse(text); } catch { throw new AlarmHistoryError("ALARM_HISTORY_RESPONSE"); }
      if (!response.ok) {
        if (raw?.type === "operator" && typeof raw.code === "string" && new OperatorAuthError(raw.code).code === raw.code) throw new OperatorAuthError(raw.code);
        throw new AlarmHistoryError(raw?.type === "alarm-history" && typeof raw.code === "string" && new AlarmHistoryError(raw.code).code === raw.code ? raw.code : "ALARM_HISTORY_RESPONSE");
      }
      const next = parseAlarmHistorySnapshot(raw, input); if (!active || current !== epoch || who !== identity() || abort.signal.aborted) return;
      snapshot = next; applied = input; changed = false; notice = next.events.length ? "Eventi storici letti dal servizio. Nessun comando eseguito." : "Nessun evento per questi filtri.";
    } catch (error) {
      if (!active || current !== epoch || who !== identity()) return; snapshot = undefined; failed = true;
      notice = error instanceof AlarmHistoryError || error instanceof OperatorAuthError ? error.message + ". " + error.remedy : "Storico non raggiungibile o lettura scaduta. Controlla servizio, rete e proxy, poi riprova manualmente. Nessun comando viene inviato.";
    } finally { view.clearTimeout(timer); if (controller === abort) controller = undefined; if (active && current === epoch) { busy = false; render(); } }
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
      else { input.type = type; input.maxLength = key === "alarmId" ? 80 : 200; } input.value = draft[key] ?? ""; input.disabled = busy || blocked(); input.addEventListener(type === "select" ? "change" : "input", () => change(key, input.value)); label.append(input); fields.append(label);
    }
    const toolbar = make("div"); toolbar.className = "archive-toolbar";
    const read = button(snapshot ? "Aggiorna dalla prima pagina" : "Carica storico", () => {}); read.type = "submit"; read.dataset.archiveFocus = "read";
    const older = button("Eventi precedenti", () => void load(true), !snapshot?.nextBefore || changed); older.dataset.archiveOlder = ""; older.dataset.archiveFocus = "older"; toolbar.append(read, older); form.append(filters, toolbar); form.addEventListener("submit", event => { event.preventDefault(); void load(); }); host.append(form);
    const status = make("p", busy ? "Lettura dello storico…" : notice); status.dataset.archiveStatus = ""; status.setAttribute("role", failed ? "alert" : "status"); host.append(status);
    if (snapshot) {
      const capture = snapshot.capture, state = capture.state === "recording" ? "Registrazione su disco attiva" : capture.state === "disabled" ? "Registrazione disattivata · dati esistenti in sola lettura" : capture.state === "stopped" ? "Servizio di registrazione arrestato" : "Registrazione non disponibile: storico potenzialmente incompleto";
      const message = make("p", "Stato del servizio all’ultima lettura: " + state + (capture.unconfirmedInThisRun ? `. Eventi senza conferma di registrazione in questo avvio: ${capture.unconfirmedInThisRun}.` : ".")); if (capture.state === "error") message.setAttribute("role", "alert"); host.append(message);
      if (capture.code) { const error = new AlarmHistoryError(capture.code); host.append(make("p", error.message + ". " + error.remedy)); }
      host.append(make("p", `${snapshot.count} eventi totali nell’archivio. Avvii precedenti incompleti: ${snapshot.incompleteRuns}.`));
      const help = make("details"); help.open = helpOpen; help.append(make("summary", "Come leggere lo storico"), make("p", "I totali riguardano tutto l’archivio, non soltanto il filtro. Durante uno stop o una perdita di qualità gli eventi possono mancare, anche con zero avvii incompleti; non vengono ricostruiti."), make("p", "Ordine di registrazione; data evento = valutazione del segnale sul servizio, non timestamp del PLC. Testo e classe sono quelli salvati all’epoca. Orari nel fuso di questo dispositivo; UTC e identificativi nei dettagli."), make("p", "Qui non si prendono visione o confermano allarmi: usa la lista degli allarmi attuali. Gli eventi senza conferma di registrazione potrebbero essere arrivati su disco prima di un errore; il contatore non certifica perdite esatte.")); help.addEventListener("toggle", () => { if (help.isConnected) helpOpen = help.open; }); host.append(help);
      const list = make("ol"); list.setAttribute("aria-label", "Eventi storici degli allarmi");
      for (const row of snapshot.events) {
        const item = make("li"); item.append(make("h3", names[row.event.state] + " · " + row.event.name), make("p", row.event.text));
        const dl = make("dl"); for (const [title, value] of [["Data evento", new Date(row.event.time).toLocaleString()], ["Classe / zona", row.event.alarmClass + (row.event.area ? " / " + row.event.area : "")], ["Priorità / ID allarme", row.event.priority + " / " + row.event.id], ["Operatore (ID)", row.event.actor ?? "Nessuno: evento del segnale"]]) { const group = make("div"); group.append(make("dt", title), make("dd", value)); dl.append(group); } item.append(dl);
        const detail = make("details"); detail.append(make("summary", "Identificativi e date UTC"), make("p", `Archivio #${row.seq} · evento nell’avvio #${row.event.sequence} · avvio ${row.instanceId} · occorrenza ${row.event.occurrence}`), make("p", "Evento: " + new Date(row.event.time).toISOString() + " · registrazione: " + row.recordedAt)); item.append(detail); list.append(item);
      }
      host.append(list);
    }
    host.scrollTop = scroll; if (focusKey) { const node = [...host.querySelectorAll<HTMLElement>("[data-archive-focus]")].find(node => node.dataset.archiveFocus === focusKey); if (node && !node.hasAttribute("disabled")) node.focus({ preventScroll: true }); }
  }
  const changedUser = () => { resetUser(); render(); }; view.addEventListener("framecraft:user-changed", changedUser); render();
  return { refresh: render, dispose() { if (!active) return; active = false; epoch++; controller?.abort(); view.removeEventListener("framecraft:user-changed", changedUser); style.remove(); delete host.dataset.hmiAlarmArchiveRoot; host.removeAttribute("aria-busy"); if (role === null) host.removeAttribute("role"); else host.setAttribute("role", role); if (label === null) host.removeAttribute("aria-label"); else host.setAttribute("aria-label", label); host.replaceChildren(...original); } };
}
