import { auditOperations, auditOutcomes, parseAuditQuery, parseAuditSnapshot, type AuditQuery } from "../../runtime/audit-query.mjs";
import type { RuntimeAuditSnapshot } from "../../runtime/audit-store.mjs";
import { OperatorAuthError } from "../../runtime/operator-policy.mjs";
import { operatorSessionHeaders, operatorSessionProfile, openOperatorSession } from "./hmiOperatorSession";
import { hmiAlarmElementBlocked } from "./hmiAlarmControl";

const operations: Record<string, string> = {
  "tags.write": "Scrittura variabile", "alarms.acknowledge": "Presa visione allarme", "alarms.confirm": "Conferma allarme",
  "recipes.create": "Creazione ricetta", "recipes.update": "Modifica ricetta", "recipes.copy": "Copia ricetta", "recipes.rename": "Rinomina ricetta", "recipes.delete": "Eliminazione ricetta", "session.login": "Accesso operatore", "session.logout": "Uscita operatore",
  "recipes.import": "Importazione ricette · gruppo di record",
  "recipes.apply": "Applicazione ricetta al PLC", "recipes.check": "Verifica esito ricetta sul PLC",
};
const outcomes: Record<string, string> = { requested: "Richiesta registrata", applied: "Applicato al servizio", delivered: "Consegnato al trasporto, non confermato dal PLC", duplicate: "Richiesta già gestita", rejected: "Rifiutato", uncertain: "Esito incerto: da verificare", authenticated: "Accesso riuscito", "logged-out": "Accesso chiuso" };
const css = `
[data-hmi-audit-root]{box-sizing:border-box;background:#f7f8fa;color:#172331;font:16px/1.5 "Segoe UI",sans-serif;padding:16px;overflow:auto;overflow-wrap:anywhere}
[data-hmi-audit-root] *{box-sizing:border-box;min-width:0}
[data-hmi-audit-root] h2{font-size:20px;margin:0 0 12px}[data-hmi-audit-root] p{margin:0 0 12px}
[data-hmi-audit-root] input,[data-hmi-audit-root] select,[data-hmi-audit-root] button{min-height:48px;max-width:100%;font:inherit;padding:8px 10px;border:1px solid #66788b;border-radius:4px;background:#fff;color:#172331}
[data-hmi-audit-root] button,[data-hmi-audit-root] summary{cursor:pointer}[data-hmi-audit-root] :focus-visible{outline:3px solid #1261a0;outline-offset:2px}
[data-hmi-audit-root] :disabled{opacity:.6;cursor:default}[data-hmi-audit-root] label{display:grid;gap:4px}
[data-hmi-audit-root] .audit-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px;margin-bottom:12px}
[data-hmi-audit-root] .audit-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
[data-hmi-audit-root] ol{list-style:none;padding:0;margin:12px 0}[data-hmi-audit-root] li{border:1px solid #bbc5cf;background:#fff;padding:12px;margin-bottom:12px;border-radius:4px}
[data-hmi-audit-root] dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:8px;margin:8px 0}
[data-hmi-audit-root] dt{font-size:14px;color:#445566}[data-hmi-audit-root] dd{margin:0;white-space:pre-wrap}
[data-hmi-audit-root] summary{min-height:48px;padding:10px 0;display:list-item;list-style-position:inside}[data-hmi-audit-root] code{display:block;white-space:pre-wrap;overflow-wrap:anywhere}
`;
export interface HmiAuditControlOptions { enabled: boolean; path?: string; timeoutMs?: number; request?: typeof fetch }

/** Explicit read only. No polling, stored history, exports or operation replay. */
export function createHmiAuditControl(host: HTMLElement, options: HmiAuditControlOptions) {
  const path = options.path ?? "/_framecraft/plc/v1", timeout = options.timeoutMs ?? 10000;
  if (path !== "/_framecraft/plc/v1" || !Number.isFinite(timeout) || timeout < 250 || timeout > 70000) throw new Error("Configurazione registro attività non valida.");
  const document = host.ownerDocument, view = document.defaultView!;
  const original = [...host.childNodes], role = host.getAttribute("role"), label = host.getAttribute("aria-label");
  const style = document.createElement("style"); style.textContent = css; document.head.append(style);
  host.dataset.hmiAuditRoot = ""; host.setAttribute("role", "region"); host.setAttribute("aria-label", "Registro attività del servizio");
  let snapshot: RuntimeAuditSnapshot | undefined, applied: AuditQuery = {}, draft: Record<string, string> = {}, busy = false, active = true, epoch = 0;
  let notice = "Premi Carica registro per leggere gli eventi del servizio.", controller: AbortController | undefined, draftChanged = false, filtersOpen = false;
  const identity = () => { const user = operatorSessionProfile(); return user ? JSON.stringify([user.id, user.capabilities]) : ""; };
  let userKey = identity();
  let focusKey: string | undefined;
  const permitted = () => !!operatorSessionProfile()?.capabilities.includes("audit.read");
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const blocked = () => !active || !options.enabled || !permitted() || hmiAlarmElementBlocked(host);
  function button(text: string, action: () => void, disabled = false) {
    const node = make("button", text); node.type = "button"; node.disabled = busy || disabled || blocked();
    node.addEventListener("click", () => { if (!node.disabled && !busy && !blocked()) action(); }); return node;
  }
  function resetUser() {
    const next = identity(); if (next === userKey) return false;
    userKey = next; epoch++; controller?.abort(); snapshot = undefined; applied = {}; draft = {}; busy = false; draftChanged = false;
    notice = "Utente cambiato: i dati precedenti sono stati rimossi. Carica il registro con il nuovo accesso."; return true;
  }
  function query() {
    const value: Record<string, unknown> = { limit: 50 };
    for (const key of ["operation", "outcome", "actor", "from", "to"]) if (draft[key]) {
      if (key === "from" || key === "to") { const date = new Date(draft[key]); if (!Number.isFinite(date.getTime())) throw new OperatorAuthError("AUTH_INPUT"); value[key] = date.toISOString(); }
      else value[key] = draft[key];
    }
    return parseAuditQuery(value);
  }
  function changeFilter(key: string, value: string) {
    draft[key] = value; draftChanged = true; notice = "Filtri modificati: premi Carica registro o Aggiorna dalla prima pagina. Gli eventuali eventi sotto appartengono ai filtri precedenti.";
    const status = host.querySelector<HTMLElement>("[data-audit-status]");
    if (status) status.textContent = notice;
    const older = host.querySelector<HTMLButtonElement>("[data-audit-older]"); if (older) older.disabled = true;
  }
  async function load(older = false) {
    if (resetUser()) render();
    if (busy || blocked() || older && draftChanged) return;
    let input: AuditQuery;
    try { input = older && snapshot?.nextBefore ? { ...applied, limit: 50, journalId: snapshot.id, through: applied.through ?? snapshot.sequence, before: snapshot.nextBefore } : query(); }
    catch { notice = "Filtri non validi. Controlla l’intervallo delle date e l’identificativo operatore."; render(); return; }
    const current = ++epoch, who = userKey, abort = new AbortController(); controller = abort; busy = true; draftChanged = false; snapshot = undefined; notice = "Lettura del registro…"; render();
    const timer = setTimeout(() => abort.abort(), timeout);
    try {
      const params = new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)]));
      const response = await (options.request ?? fetch)(path + "/audit?" + params, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", headers: operatorSessionHeaders(), signal: abort.signal });
      const text = await response.text(); if (text.length > 1_048_576) throw new OperatorAuthError("AUTH_AUDIT_RESPONSE");
      let value; try { value = JSON.parse(text); } catch { throw new OperatorAuthError("AUTH_AUDIT_RESPONSE"); }
      if (!response.ok) throw new OperatorAuthError(value?.type === "operator" && typeof value.code === "string" ? value.code : "AUTH_AUDIT_RESPONSE");
      const next = parseAuditSnapshot(value, input);
      if (!active || current !== epoch || identity() !== who || abort.signal.aborted) return;
      snapshot = next; applied = input; notice = next.events.length ? "Eventi letti dal servizio. Nessun comando eseguito." : "Nessun evento per questi filtri.";
    } catch (error) {
      if (!active || current !== epoch || identity() !== who) return;
      snapshot = undefined;
      notice = error instanceof OperatorAuthError ? `${error.message}. ${error.remedy}` : "Registro non raggiungibile o lettura scaduta. Controlla servizio, rete e proxy, poi riprova. Nessun invio automatico.";
    } finally {
      clearTimeout(timer); if (controller === abort) controller = undefined;
      if (active && current === epoch) { busy = false; render(); }
    }
  }
  function render() {
    if (!active) return;
    const focused = document.activeElement, scroll = host.scrollTop;
    if (focused && host.contains(focused)) focusKey = focused.getAttribute("data-audit-focus") ?? undefined;
    else if (focused && focused !== document.body) focusKey = undefined;
    const restore = () => { host.scrollTop = scroll; if (focusKey) { const node = [...host.querySelectorAll<HTMLElement>("[data-audit-focus]")].find(node => node.dataset.auditFocus === focusKey); if (node && !node.hasAttribute("disabled")) node.focus({ preventScroll: true }); } };
    resetUser(); host.replaceChildren(); host.setAttribute("aria-busy", String(busy));
    host.append(make("h2", "Registro attività"), make("p", "Accessi, richieste ed esiti registrati dal servizio. Sola lettura: non modifica allarmi, ricette o PLC."));
    if (!options.enabled) host.append(make("p", "Registro non collegato. Abilita gateway e account server nella configurazione del progetto; il PIN browser non basta."));
    else if (!permitted()) {
      host.append(make("p", "Accedi con un account del pannello autorizzato a consultare il registro (audit.read). Nessun dato viene mostrato senza questo permesso."));
      const login = make("button", "Apri accesso operatore"); login.type = "button"; login.dataset.auditFocus = "login"; login.disabled = hmiAlarmElementBlocked(host); login.addEventListener("click", () => { if (!login.disabled && active && !hmiAlarmElementBlocked(host)) openOperatorSession(login); }); host.append(login);
    }
    const form = make("form"), filters = make("div"), filterPanel = make("details"); filters.className = "audit-filters";
    filterPanel.open = filtersOpen; filterPanel.append(make("summary", "Filtri del registro (facoltativi)"), filters);
    filterPanel.addEventListener("toggle", () => { if (active && filterPanel.isConnected) filtersOpen = filterPanel.open; });
    function select(key: string, title: string, values: readonly string[], labels: Record<string, string>) {
      const label = make("label", title), node = make("select"); node.setAttribute("aria-label", title); node.append(make("option", "Tutti")); node.options[0].value = "";
      for (const value of values) { const option = make("option", labels[value]); option.value = value; node.append(option); }
      node.value = draft[key] ?? ""; node.dataset.auditFocus = key; node.disabled = busy || blocked(); node.addEventListener("change", () => changeFilter(key, node.value)); label.append(node); filters.append(label);
    }
    select("operation", "Operazione", auditOperations, operations); select("outcome", "Esito", auditOutcomes, outcomes);
    for (const [key, title, type] of [["actor", "Operatore (ID esatto del registro)", "text"], ["from", "Da (ora di questo dispositivo)", "datetime-local"], ["to", "A (ora di questo dispositivo)", "datetime-local"]]) {
      const label = make("label", title), node = make("input"); node.type = type; node.setAttribute("aria-label", title); node.dataset.auditFocus = key; node.value = draft[key] ?? ""; node.maxLength = 200; node.disabled = busy || blocked(); node.addEventListener("input", () => changeFilter(key, node.value)); label.append(node); filters.append(label);
    }
    const toolbar = make("div"); toolbar.className = "audit-toolbar";
    const read = button(snapshot ? "Aggiorna dalla prima pagina" : "Carica registro", () => {}); read.type = "submit"; read.dataset.auditFocus = "read";
    const older = button("Eventi precedenti", () => void load(true), !snapshot?.nextBefore || draftChanged); older.dataset.auditOlder = ""; older.dataset.auditFocus = "older"; toolbar.append(read, older);
    form.append(filterPanel, toolbar); form.addEventListener("submit", event => { event.preventDefault(); void load(); }); host.append(form);
    const status = make("p", notice); status.dataset.auditStatus = ""; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); host.append(status);
    if (!snapshot) { restore(); return; }
    host.append(make("p", `Catena verificata dal servizio, non firma digitale. Nel registro completo: ${snapshot.uncertainCount} eventi con esito incerto; ${snapshot.unresolvedCount} richieste senza esito terminale. Da verificare, non da ripetere automaticamente.`));
    host.append(make("p", `${snapshot.events.length} eventi in questa pagina (massimo 50). Filtri applicati sul server; sequenza di riferimento ${applied.through ?? snapshot.sequence}.`));
    host.append(make("p", "Una stessa operazione può avere una riga di richiesta e una di esito: la traccia nei dettagli le collega, non sono due comandi."));
    const list = make("ol"); list.setAttribute("aria-label", "Eventi del registro");
    for (const event of snapshot.events) {
      const row = make("li"); row.append(make("strong", `#${event.seq} · ${new Date(event.timestamp).toLocaleString()}`)); const values = make("dl");
      const resource = event.resource ? event.resource.id + (event.resource.kind === "recipe-schema" ? "/" + event.resource.recordId + (event.resource.targetId ? " → " + event.resource.targetId : "") : "") : "Sessione";
      const plcOperation = ["recipes.apply", "recipes.check"].includes(event.operation);
      const outcome = event.outcome === "applied" && plcOperation ? "Applicazione confermata dal programma PLC" : event.outcome === "duplicate" && event.code === "RECIPE_APPLY_DUPLICATE_CONFIRMED" ? "Esito PLC già confermato; nessuna nuova applicazione" : event.outcome === "duplicate" && event.code === "RECIPE_APPLY_DUPLICATE_REJECTED" ? "Richiesta già rifiutata; nessuna nuova applicazione" : event.outcome === "duplicate" && event.code.endsWith("UNCERTAIN") ? "Richiesta già gestita con esito incerto: verifica, non ripetere" : outcomes[event.outcome];
      for (const [label, value] of [["Operazione", operations[event.operation]], ["Esito", outcome], ["ID operatore registrato", event.actor ?? "Identità non verificata"], ["Risorsa", resource]]) { const group = make("div"); group.append(make("dt", label), make("dd", value)); values.append(group); }
      if (["rejected", "uncertain"].includes(event.outcome) && event.code.startsWith("AUTH_")) { const reason = new OperatorAuthError(event.code); if (reason.code === event.code) row.append(make("p", `${reason.message}. ${reason.remedy}`)); }
      row.append(values); const details = make("details"); details.append(make("summary", `Dettagli evento #${event.seq}`), make("code", `UTC: ${event.timestamp}\nCodice: ${event.code}\nTraccia: ${event.traceId}\nRichiesta: ${event.commandId ?? "Non presente"}`)); row.append(details); list.append(row);
    }
    host.append(list);
    restore();
  }
  const changed = () => { if (resetUser()) render(); };
  view.addEventListener("framecraft:user-changed", changed); render();
  return { refresh: render, dispose() {
    if (!active) return; active = false; epoch++; controller?.abort(); snapshot = undefined; view.removeEventListener("framecraft:user-changed", changed); style.remove();
    delete host.dataset.hmiAuditRoot; host.removeAttribute("aria-busy"); if (role === null) host.removeAttribute("role"); else host.setAttribute("role", role);
    if (label === null) host.removeAttribute("aria-label"); else host.setAttribute("aria-label", label); host.replaceChildren(...original);
  } };
}
