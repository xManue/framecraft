import { alarmStateLabel } from "../runtime/alarm-labels.mjs";
import { activeAlarmViewDefaults, alarmRowMatchesView, compareAlarmViewRows, createAlarmSavedViews, parseAlarmViewFilters, alarmColumnsAttribute, defaultAlarmColumns, parseAlarmColumns, alarmColumnValue, alarmColumnProfileAttribute, createAlarmColumnsProfile } from "./hmi-alarm-views.mjs";
export function hmiAlarmElementBlocked(host) {
    if (!host.isConnected || host.closest('[disabled], [hidden], [inert], [aria-disabled="true"]'))
        return true;
    for (let node = host; node; node = node.parentElement) {
        if (node.getAttribute("data-fc-reacts") === "false" || node.getAttribute("data-fc-user-requires") && node.getAttribute("data-fc-user-granted") !== "true" || node.getAttribute("data-fc-user-visible-requires") && node.getAttribute("data-fc-user-visible-granted") !== "true")
            return true;
        const style = host.ownerDocument.defaultView?.getComputedStyle(node);
        if (style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse" || style?.pointerEvents === "none")
            return true;
    }
    return false;
}
export function createHmiAlarmControlWith(host, action, rowFilter, runtime, viewContext) {
    const { alarmStateLabel, hmiAlarmElementBlocked, activeAlarmViewDefaults, alarmRowMatchesView, compareAlarmViewRows, createAlarmSavedViews, parseAlarmViewFilters, alarmColumnsAttribute, defaultAlarmColumns, parseAlarmColumns, alarmColumnValue, alarmColumnProfileAttribute, createAlarmColumnsProfile } = runtime;
    const original = [...host.childNodes], oldStyle = host.getAttribute("style"), oldRole = host.getAttribute("role"), oldLabel = host.getAttribute("aria-label");
    host.dataset.hmiAlarmRoot = "";
    host.setAttribute("role", "region");
    host.setAttribute("aria-label", "Allarmi operativi");
    Object.assign(host.style, { background: "#333333", color: "#ffffff", display: "flex", flexDirection: "column", overflow: "auto", fontSize: "16px", containerType: "inline-size", containerName: "framecraft-alarms" });
    const make = (tag, value) => { const node = host.ownerDocument.createElement(tag); if (value !== undefined)
        node.textContent = value; return node; };
    const responsive = make("style"); responsive.textContent = '[data-hmi-alarm-root] [hidden]{display:none!important}[data-hmi-alarm-root] td[data-alarm-key="name"]{min-width:180px}[data-hmi-alarm-root] :focus-visible{outline:2px solid #93c5fd;outline-offset:2px}[data-hmi-alarm-root] :disabled{opacity:.55;cursor:default}';
    if (host.ownerDocument.defaultView?.CSS?.supports?.("container-type", "inline-size")) responsive.textContent += `@container framecraft-alarms (max-width:600px){
      [data-hmi-alarm-root] table,[data-hmi-alarm-root] tbody,[data-hmi-alarm-root] tr,[data-hmi-alarm-root] td{display:block;box-sizing:border-box;width:100%;min-width:0!important}[data-hmi-alarm-root] colgroup{display:none}
      [data-hmi-alarm-root] thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
      [data-hmi-alarm-root] tbody{padding:8px}[data-hmi-alarm-root] tbody tr{border:1px solid #8894a4;margin-bottom:12px}
      [data-hmi-alarm-root] td[data-alarm-column]:not([data-alarm-key="name"])::before{content:attr(data-alarm-column);display:block;font-size:14px;font-weight:600;color:#d1d9e4}
      [data-hmi-alarm-root] td button{max-width:100%;white-space:normal;overflow-wrap:anywhere}
    }`; host.ownerDocument.head.append(responsive);
    const notice = make("p"), toolbar = make("div"), status = make("p"), scroller = make("div"), table = make("table"), head = make("thead"), body = make("tbody");
    notice.setAttribute("role", "status");
    status.setAttribute("role", "status");
    Object.assign(notice.style, { margin: "0", padding: "8px", background: "#20252e", lineHeight: "1.4" });
    Object.assign(status.style, { margin: "0", padding: "4px 8px", minHeight: "28px" });
    Object.assign(toolbar.style, { display: "flex", flexWrap: "wrap", gap: "8px", padding: "8px" });
    Object.assign(scroller.style, { overflow: "auto", flex: "1", minHeight: "0", minWidth: "0", maxWidth: "100%" });
    Object.assign(table.style, { borderCollapse: "collapse", width: "100%", textAlign: "left", tableLayout: "fixed" });
    const searchLabel = make("label", "Cerca "), search = make("input"), areaLabel = make("label", "Zona "), area = make("select");
    search.type = "search";
    search.setAttribute("aria-label", "Cerca allarmi"); area.setAttribute("aria-label", "Zona");
    search.maxLength = 200;
    search.placeholder = "Nome o messaggio";
    searchLabel.append(search);
    areaLabel.append(area);
    const button = (label) => { const node = make("button", label); node.type = "button"; Object.assign(node.style, { minHeight: "44px", padding: "6px 12px", cursor: "pointer", border: "1px solid #8894a4", borderRadius: "4px", background: "#252d39", color: "#fff" }); return node; };
    for (const input of [search, area])
        Object.assign(input.style, { minHeight: "44px", maxWidth: "100%", background: "#181e28", color: "#fff", border: "1px solid #8894a4", borderRadius: "4px", padding: "6px" });
    const ack = button("Prendi in visione"), confirm = button("Conferma rientro"), previous = button("Precedenti"), next = button("Successivi");
    const multiple = button("Più allarmi"), groupTools = make("div"), groupStatus = make("p"), groupReview = make("section");
    const choosePage = button("Scegli solo questa pagina"), clearChoices = button("Svuota selezione"), reviewAck = button("Rivedi presa visione"), reviewConfirm = button("Rivedi conferma rientro");
    Object.assign(groupTools.style, { display: "flex", flexWrap: "wrap", gap: "8px", padding: "8px", background: "#20252e" });
    Object.assign(groupReview.style, { padding: "12px", border: "1px solid #8894a4", margin: "8px", overflowWrap: "anywhere", overflow: "auto", maxHeight: "min(55vh,480px)" });
    groupStatus.style.margin = "0"; groupStatus.style.width = "100%"; groupStatus.setAttribute("role", "status");
    groupReview.setAttribute("role", "region"); groupReview.setAttribute("aria-label", "Operazione su più allarmi"); groupReview.tabIndex = -1;
    groupTools.append(groupStatus, choosePage, clearChoices, reviewAck, reviewConfirm);
    const filters = make("details"), filtersTitle = make("summary", "Filtra allarmi"), filterFields = make("div");
    Object.assign(filters.style, { maxWidth: "100%", minWidth: "0", padding: "0", border: "1px solid #8894a4", borderRadius: "4px", margin: "0", background: "#252d39" });
    Object.assign(filters.style, { maxHeight: "min(60vh,560px)", overflow: "auto" });
    Object.assign(filtersTitle.style, { minHeight: "44px", padding: "6px 12px", boxSizing: "border-box", cursor: "pointer" });
    Object.assign(filtersTitle.style, { position: "sticky", top: "0", zIndex: "1", background: "#252d39" });
    Object.assign(filterFields.style, { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))", alignItems: "start", gap: "8px", padding: "8px" });
    filters.addEventListener("toggle", () => { filters.style.width = filters.open ? "100%" : ""; });
    filterFields.append(searchLabel, areaLabel); filters.append(filtersTitle, filterFields); toolbar.append(filters, ack, confirm, multiple, previous, next);
    const extra = {}, savedHost = make("div"); savedHost.style.gridColumn = "1 / -1";
    for (const [key, title, values] of [
        ["alarmClass", "Classe", [["", "Tutte"]]],
        ["state", "Stato", [["all", "Tutti gli stati"], ["active", "Attivi"], ["unacknowledged", "Da prendere in visione"], ["awaiting-confirmation", "Rientri da confermare"]]],
        ["quality", "Qualità del segnale", [["all", "Tutte le qualità"], ["good", "Valida"], ["invalid", "Non valida o sconosciuta"]]],
        ["minimumPriority", "Priorità minima", undefined],
        ["order", "Ordina allarmi", [["priority-desc", "Priorità più alta"], ["priority-asc", "Priorità più bassa"], ["latest-desc", "Attivazione più recente"], ["oldest-asc", "Attivazione meno recente"], ["name-asc", "Nome A–Z"], ["name-desc", "Nome Z–A"]]],
    ]) {
        const label = make("label", title + " "), control = make(values ? "select" : "input"); extra[key] = control; control.setAttribute("aria-label", title);
        if (values) for (const [value, caption] of values) { const option = make("option", caption); option.value = value; control.append(option); }
        else { control.type = "number"; control.min = "0"; control.max = "255"; control.step = "1"; }
        control.value = activeAlarmViewDefaults[key]; Object.assign(label.style, { display: "grid", gap: "4px", minWidth: "0" }); Object.assign(control.style, { minHeight: "44px", maxWidth: "100%", width: "100%", boxSizing: "border-box", font: "inherit", background: "#181e28", color: "#fff", border: "1px solid #8894a4", borderRadius: "4px", padding: "6px" }); label.append(control); filterFields.append(label);
    }
    filterFields.append(savedHost);
    const headers = make("tr"), colgroup = make("colgroup");
    head.append(headers);
    table.append(colgroup, head, body);
    scroller.append(table);
    host.replaceChildren(notice, toolbar, groupTools, status, groupReview, scroller);
    let snapshot, connected = false, busy = false, disposed = false, signature = "", page = 0;
    let selected, actionMessage, actionMessageKey;
    let multi = false, review, stopRequested = false, stopReason = "", generation = 0, visibleRows = [];
    const choices = new Map(), view = host.ownerDocument.defaultView;
    let userIdentity = viewContext?.operator ? JSON.stringify(viewContext.operator()) : undefined, savedSignature = "", validFilters = true;
    let columnsRaw, columnProfileRaw, columnsRead = false, projectColumns = defaultAlarmColumns(), columns = defaultAlarmColumns(), columnsError = "", columnsUiSignature = "", columnProfileUiSignature = "", profileObserverActive = false;
    const syncColumns = () => {
        const raw = host.getAttribute(alarmColumnsAttribute), profileRaw = host.getAttribute(alarmColumnProfileAttribute); if (columnsRead && raw === columnsRaw && profileRaw === columnProfileRaw) return;
        if (columnsRead) { stopRequested = true; choices.clear(); selected = undefined; actionMessage = undefined; if (review?.phase === "running") stopReason = "Colonne aggiornate dal progetto: fermati gli invii successivi. Verifica gli esiti già ricevuti."; else review = undefined; }
        columnsRead = true; columnsRaw = raw; columnProfileRaw = profileRaw;
        try { projectColumns = parseAlarmColumns(raw); columnsError = ""; } catch (error) { projectColumns = defaultAlarmColumns(); columnsError = error.message; }
        columns = parseAlarmColumns(projectColumns); columnsUiSignature = ""; columnProfiles.reset(); columnProfileUiSignature = "";
    };
    const snapshotKey = () => snapshot && snapshot.instanceId + ":" + snapshot.revision;
    const rememberAction = (message) => { actionMessage = message; actionMessageKey = snapshotKey(); status.textContent = message; };
    const source = host.dataset.hmiAlarmSource === "history" ? "history" : "active";
    const filter = host.dataset.hmiFilter?.trim(), match = filter?.match(/^AlarmClassName\s*=\s*'([^']+)'$/);
    const invalidFilter = !!filter && !match;
    const filterValues = () => ({ search: search.value, area: area.value, ...Object.fromEntries(Object.entries(extra).map(([key, input]) => [key, input.value])) });
    const matches = (className, zone, values, row) => (!match || className === match[1]) && (!area.value || zone === area.value) && values.join(" ").toLocaleLowerCase().includes(search.value.toLocaleLowerCase()) && (source === "history" || validFilters && !!row && alarmRowMatchesView(row, filterValues()));
    const eligible = (row, kind) => !!row?.occurrence && row.pending && (kind === "acknowledge" ? row.acknowledgment !== "none" && !row.acknowledged : row.acknowledgment === "reset" && row.active === false && row.acknowledged && row.quality === "good" && !row.confirmed);
    const allowed = () => !disposed && connected && snapshot?.actionsEnabled && source !== "history" && !invalidFilter && !columnsError && !hmiAlarmElementBlocked(host);
    const checkedRow = (item, kind) => {
        const current = snapshot?.rows.find(row => row.id === item.row.id);
        return item.instanceId === snapshot?.instanceId && current?.occurrence === item.row.occurrence && current.revision === item.row.revision && (!rowFilter || rowFilter(current)) && matches(current.className, current.area ?? "", [current.name, current.text, current.id], current) && eligible(current, kind);
    };
    const selectValue = (select, value) => { if (![...select.options].some(option => option.value === value)) { const option = make("option", value + " · non presente"); option.value = value; select.append(option); } select.value = value; };
    const savedViews = createAlarmSavedViews({ document: host.ownerDocument, kind: "active", context: viewContext, dark: true,
        disabled: () => disposed || busy || !!review || hmiAlarmElementBlocked(host), current: filterValues,
        apply: value => { const checked = parseAlarmViewFilters("active", value); search.value = checked.search; selectValue(area, checked.area); for (const [key, input] of Object.entries(extra)) { if (input.tagName === "SELECT") selectValue(input, checked[key]); else input.value = checked[key]; } selected = undefined; choices.clear(); page = 0; actionMessage = undefined; },
        changed: () => { savedSignature = ""; render(); },
    });
    const columnPanel = make("details"), columnTitle = make("summary", "Colonne e orario"), columnFields = make("div"), columnStatus = make("p"), columnPicker = make("select"), columnLabel = make("input"), columnWidth = make("input"), columnVisible = make("input"), columnPosition = make("select"), columnTimeZone = make("select"), applyColumns = button("Applica visualizzazione"), resetColumns = button("Ripristina colonne del progetto");
    Object.assign(columnPanel.style, { maxWidth: "100%", minWidth: "0", border: "1px solid #8894a4", borderRadius: "4px", background: "#252d39", maxHeight: "min(60vh,560px)", overflow: "auto" });
    Object.assign(columnTitle.style, { minHeight: "44px", padding: "6px 12px", boxSizing: "border-box", cursor: "pointer", position: "sticky", top: "0", background: "#252d39", zIndex: "1" });
    Object.assign(columnFields.style, { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))", gap: "8px", padding: "8px" });
    columnPanel.addEventListener("toggle", () => { columnPanel.style.width = columnPanel.open ? "100%" : ""; });
    columnLabel.maxLength = 60; columnWidth.type = "number"; columnWidth.min = "64"; columnWidth.max = "1200"; columnWidth.step = "1"; columnVisible.type = "checkbox";
    for (const definition of defaultAlarmColumns().columns) { const option = make("option", definition.label); option.value = definition.key; columnPicker.append(option); }
    for (let i = 0; i < projectColumns.columns.length; i++) { const option = make("option", String(i + 1)); option.value = String(i); columnPosition.append(option); }
    for (const [value, text] of [["local", "Locale del dispositivo"], ["UTC", "UTC"]]) { const option = make("option", text); option.value = value; columnTimeZone.append(option); }
    for (const [title, control] of [["Colonna da configurare", columnPicker], ["Titolo della colonna", columnLabel], ["Larghezza colonna (px)", columnWidth], ["Mostra colonna", columnVisible], ["Posizione della colonna", columnPosition], ["Orario della lista", columnTimeZone]]) {
        const label = make("label", title); label.append(control); Object.assign(label.style, { display: "grid", gap: "4px", minHeight: "44px", minWidth: "0" }); control.setAttribute("aria-label", title);
        Object.assign(control.style, { maxWidth: "100%", boxSizing: "border-box", minHeight: "44px", font: "inherit", background: "#181e28", color: "#fff", border: "1px solid #8894a4", borderRadius: "4px", padding: "6px" }); columnFields.append(label);
    }
    Object.assign(columnVisible.style, { minHeight: "22px", height: "22px", width: "22px", justifySelf: "start", accentColor: "#8894a4" });
    const fillColumnFields = () => { const item = columns.columns.find(item => item.key === columnPicker.value) ?? columns.columns[0]; columnPicker.value = item.key; columnLabel.value = item.label; columnWidth.value = String(item.width); columnVisible.checked = item.visible; columnVisible.disabled = busy || !!review || !!columnsError || hmiAlarmElementBlocked(host) || ["name", "state"].includes(item.key); columnPosition.value = String(columns.columns.indexOf(item)); columnTimeZone.value = columns.timeZone; };
    columnPicker.onchange = fillColumnFields;
    columnStatus.setAttribute("role", "status"); columnStatus.style.gridColumn = "1 / -1";
    const columnHelp = make("p", "Nome e stato restano visibili. Le modifiche sono temporanee salvo salvataggio personale abilitato dal progetto. Le viste salvate conservano i filtri, non le colonne."); columnHelp.style.gridColumn = "1 / -1";
    const profileHost = make("div"); profileHost.style.gridColumn = "1 / -1";
    const columnProfiles = createAlarmColumnsProfile({ document: host.ownerDocument, host, context: viewContext, project: () => projectColumns, current: () => columns, apply: value => { columns = parseAlarmColumns(value); columnsUiSignature = ""; }, disabled: () => disposed || busy || !!review || !!columnsError || hmiAlarmElementBlocked(host), changed: () => { columnProfileUiSignature = ""; render(); } });
    columnFields.append(applyColumns, resetColumns, columnStatus, columnHelp, profileHost); columnPanel.append(columnTitle, columnFields); toolbar.prepend(columnPanel);
    applyColumns.onclick = () => {
        if (host.getAttribute(alarmColumnsAttribute) !== columnsRaw || host.getAttribute(alarmColumnProfileAttribute) !== columnProfileRaw) { syncColumns(); render(); return; }
        if (busy || review || columnsError || hmiAlarmElementBlocked(host)) return;
        try {
            const position = Number(columnPosition.value), next = parseAlarmColumns(columns), index = next.columns.findIndex(item => item.key === columnPicker.value);
            if (!Number.isInteger(position) || position < 0 || position >= next.columns.length || index < 0) throw new Error("Posizione della colonna non valida.");
            next.columns[index] = { ...next.columns[index], label: columnLabel.value, width: Number(columnWidth.value), visible: columnVisible.checked }; next.timeZone = columnTimeZone.value;
            const [item] = next.columns.splice(index, 1); next.columns.splice(position, 0, item); columns = parseAlarmColumns(next); columnsUiSignature = ""; columnProfiles.automatic(); columnStatus.textContent = "Visualizzazione applicata. Controlla qui sotto il salvataggio personale; nessun comando eseguito."; render();
        } catch (error) { columnStatus.textContent = error.message; }
    };
    resetColumns.onclick = () => { if (busy || review || columnsError || hmiAlarmElementBlocked(host)) return; syncColumns(); columns = parseAlarmColumns(projectColumns); columnsUiSignature = ""; columnProfiles.automatic(); columnStatus.textContent = "Ripristinate le colonne del progetto. Nessun comando eseguito."; render(); };
    const rememberChoice = row => ({ instanceId: snapshot.instanceId, row: JSON.parse(JSON.stringify(row)) });
    const renderReview = () => {
        groupReview.hidden = !review;
        if (!review) { groupReview.replaceChildren(); return; }
        const current = review, heading = make("h3", current.phase === "review" ? "Prima di inviare" : current.phase === "running" ? "Operazione in corso" : "Risultati dell’operazione");
        heading.style.margin = "0 0 8px";
        const description = make("p", `${current.items.length} allarmi · ${current.kind === "acknowledge" ? "presa visione" : "conferma rientro"}. Operazioni separate, con permesso e revisione verificati dal server per ogni allarme. Il guasto PLC non viene modificato.`);
        const list = make("ol"); list.style.paddingLeft = "24px";
        const labels = { waiting: "Da inviare", sending: "Inviato: attesa esito", applied: "Registrato", "not-sent": "Non inviato", rejected: "Rifiutato", uncertain: "Esito da verificare" };
        for (const item of current.items) {
            const entry = make("li"), title = make("strong", `${item.row.name} · ${item.row.id}`), message = make("p");
            message.textContent = current.phase === "review" ? checkedRow(item, current.kind) ? "Pronto · " + item.row.text : "Non più valido per questa azione. Rivedi la selezione e lo stato attuale." : labels[item.status] + (item.detail ? ". " + item.detail : "");
            entry.append(title, message); list.append(entry);
        }
        const controls = make("div"); Object.assign(controls.style, { display: "flex", flexWrap: "wrap", gap: "8px" });
        if (current.phase === "review") {
            const send = button("Conferma invio agli allarmi scelti"), back = button("Torna alla selezione");
            send.disabled = !allowed() || busy || !current.items.every(item => checkedRow(item, current.kind));
            send.onclick = () => { if (!send.disabled) void runGroup(); };
            back.onclick = () => { if (busy) return; review = undefined; render(); reviewAck.focus(); };
            controls.append(send, back);
        } else if (current.phase === "running") {
            const stop = button("Interrompi i prossimi invii"); stop.disabled = stopRequested;
            stop.onclick = () => { stopRequested = true; stopReason = "Interrotto dall’operatore."; renderReview(); };
            controls.append(make("p", "L’invio già iniziato può completarsi. Interrompere ferma solo quelli successivi; gli esiti già registrati restano validi."), stop);
        } else {
            const close = button("Chiudi risultati"); close.onclick = () => { review = undefined; choices.clear(); render(); multiple.focus(); };
            controls.append(make("p", "Nessun invio viene ripetuto. Se un esito è da verificare, confronta lo stato aggiornato e il registro attività prima di una nuova selezione."), close);
        }
        const focusedText = groupReview.contains(host.ownerDocument.activeElement) ? host.ownerDocument.activeElement?.textContent : undefined;
        groupReview.replaceChildren(heading, description, ...(current.phase === "running" ? [controls, list] : [list, controls]));
        if (focusedText) [...controls.querySelectorAll("button")].find(node => node.textContent === focusedText)?.focus({ preventScroll: true });
    };
    const prepareGroup = kind => {
        syncColumns();
        if (!allowed() || busy || review || !choices.size) return;
        review = { kind, phase: "review", items: [...choices.values()].map(item => ({ ...item, status: "waiting" })) };
        render(); groupReview.focus();
    };
    const runGroup = async () => {
        syncColumns();
        if (!review || review.phase !== "review" || busy || !allowed() || !review.items.every(item => checkedRow(item, review.kind))) return;
        const current = review, epoch = generation;
        current.phase = "running"; busy = true; stopRequested = false; stopReason = ""; render(); groupReview.focus();
        try {
            for (const item of current.items) {
                syncColumns();
                if (disposed || epoch !== generation) return;
                if (stopRequested || !allowed() || !checkedRow(item, current.kind)) {
                    stopReason ||= "Stato, connessione, filtri o permessi cambiati. Rivedi la selezione.";
                    item.status = "not-sent"; item.detail = stopReason;
                    stopRequested = true; continue;
                }
                item.status = "sending"; renderReview();
                try {
                    await action({ alarmId: item.row.id, occurrence: item.row.occurrence, revision: item.row.revision, action: current.kind });
                    if (disposed || epoch !== generation) return;
                    item.status = "applied";
                } catch (error) {
                    if (disposed || epoch !== generation) return;
                    const known = error instanceof Error && error.name === "HmiGatewayCommandError";
                    item.status = known && error.outcome === "rejected" ? "rejected" : "uncertain";
                    item.detail = known ? error.message.slice(0, 1000) : "Il servizio non ha confermato l’esito. Controlla stato e registro; nessuna ripetizione automatica.";
                    stopReason = "Invii successivi fermati dopo un errore. Rivedi stato e autorizzazioni."; stopRequested = true;
                }
                renderReview();
            }
        } finally {
            busy = false;
            if (!disposed && epoch === generation) { current.phase = "done"; choices.clear(); render(); groupReview.focus(); }
            else if (!disposed) render();
        }
    };
    const render = () => {
        if (disposed)
            return;
        syncColumns();
        columnProfiles.sync();
        const watchProfiles = !!host.getAttribute(alarmColumnProfileAttribute); if (watchProfiles !== profileObserverActive) { profileObserverActive = watchProfiles; if (watchProfiles) profileObserver?.observe(host.ownerDocument.documentElement, { attributes: true, attributeFilter: [alarmColumnProfileAttribute], childList: true, subtree: true }); else profileObserver?.disconnect(); }
        const profileSignature = JSON.stringify([columnProfiles.signature(), busy, !!review, !!columnsError, hmiAlarmElementBlocked(host)]);
        if (profileSignature !== columnProfileUiSignature) { const focused = profileHost.contains(host.ownerDocument.activeElement) ? host.ownerDocument.activeElement?.getAttribute("data-column-profile-focus") : undefined; columnProfileUiSignature = profileSignature; profileHost.replaceChildren(columnProfiles.render()); if (focused) { const buttons = [...profileHost.querySelectorAll("button")], target = buttons.find(button => button.dataset.columnProfileFocus === focused && !button.disabled) ?? buttons.find(button => !button.disabled); target?.focus({ preventScroll: true }); } }
        const columnDisabled = busy || !!review || !!columnsError || hmiAlarmElementBlocked(host);
        for (const control of [columnPicker, columnLabel, columnWidth, columnPosition, columnTimeZone, applyColumns, resetColumns]) control.disabled = columnDisabled;
        columnVisible.disabled = columnDisabled || ["name", "state"].includes(columnPicker.value);
        const columnSignature = JSON.stringify(columns); if (columnSignature !== columnsUiSignature) { columnsUiSignature = columnSignature; fillColumnFields(); }
        try { parseAlarmViewFilters("active", filterValues()); validFilters = true; } catch { validFilters = false; }
        const definitions = (snapshot?.rows ?? []).filter(row => (!rowFilter || rowFilter(row)) && (!match || row.className === match[1]));
        const zones = [...new Set(definitions.map(row => row.area ?? "").filter(Boolean))].sort();
        const zoneSignature = JSON.stringify([zones, area.value]);
        if (area.dataset.zones !== zoneSignature) {
            const value = area.value;
            area.replaceChildren(make("option", "Tutte"), ...zones.map((zone) => { const item = make("option", zone); item.value = zone; return item; }));
            area.options[0].value = "";
            selectValue(area, value);
            area.dataset.zones = zoneSignature;
        }
        const classes = [...new Set(definitions.map(row => row.className))].sort(), classSignature = JSON.stringify([classes, extra.alarmClass.value]);
        if (extra.alarmClass.dataset.classes !== classSignature) { const value = extra.alarmClass.value; const all = make("option", "Tutte"); all.value = ""; extra.alarmClass.replaceChildren(all, ...classes.map(name => { const option = make("option", name); option.value = name; return option; })); selectValue(extra.alarmClass, value); extra.alarmClass.dataset.classes = classSignature; }
        for (const input of Object.values(extra)) { input.parentElement.hidden = source === "history"; input.disabled = busy || !!review; }
        savedHost.hidden = source === "history";
        const currentSavedSignature = JSON.stringify([busy, !!review, hmiAlarmElementBlocked(host), userIdentity]);
        if (source !== "history" && savedSignature !== currentSavedSignature) { savedSignature = currentSavedSignature; savedHost.replaceChildren(savedViews.render()); }
        notice.setAttribute("role", columnsError ? "alert" : "status");
        notice.textContent = columnsError ? columnsError + " Mostrate le colonne iniziali; i comandi sono bloccati." : !connected ? "Servizio non disponibile: gli stati mostrati non sono aggiornati. Controlla la diagnostica PLC." : !snapshot?.rows.length ? "Nessun allarme configurato. Nell'editor apri Pannello → Allarmi." : source === "history" ? "Storico della sessione del servizio, non archivio industriale. Eventi usciti dal limite: " + snapshot.historyDropped : "Presa visione ≠ guasto risolto. Il rientro dipende dal segnale PLC.";
        const rows = invalidFilter ? [] : source === "history"
            ? [...(snapshot?.history ?? [])].reverse().filter((row) => matches(row.alarmClass, row.area, [row.name, row.text, row.id]))
            : [...(snapshot?.rows ?? [])].filter((row) => (row.pending || row.quality !== "good") && (!rowFilter || rowFilter(row)) && matches(row.className, row.area ?? "", [row.name, row.text, row.id], row)).sort((a, b) => compareAlarmViewRows(a, b, extra.order.value));
        page = Math.min(page, Math.max(0, Math.ceil(rows.length / 100) - 1));
        previous.disabled = busy || !!review || page === 0;
        next.disabled = busy || !!review || (page + 1) * 100 >= rows.length;
        previous.hidden = next.hidden = rows.length <= 100;
        const current = snapshot?.rows.find((row) => row.id === selected?.id), unchanged = current && current.occurrence === selected?.occurrence && current.revision === selected?.revision;
        const canAct = connected && snapshot?.actionsEnabled && source !== "history" && !invalidFilter && !columnsError && unchanged && current?.pending && (!rowFilter || rowFilter(current)) && matches(current.className, current.area ?? "", [current.name, current.text, current.id], current) && !busy && !review && !multi && !hmiAlarmElementBlocked(host);
        ack.disabled = !canAct || current.acknowledged || current.acknowledgment === "none";
        confirm.disabled = !canAct || current.active !== false || !current.acknowledged || current.acknowledgment !== "reset" || current.quality !== "good";
        ack.hidden = source === "history";
        confirm.hidden = source === "history" || !rows.some(row => row.acknowledgment === "reset");
        multiple.hidden = source === "history"; multiple.disabled = busy || !!review || !allowed(); multiple.setAttribute("aria-pressed", String(multi));
        groupTools.hidden = !multi || source === "history";
        groupStatus.textContent = `${choices.size} allarmi scelti · massimo 100. Sono inclusi solo quelli selezionati esplicitamente, anche su più pagine.`;
        choosePage.disabled = busy || !!review || !allowed(); clearChoices.disabled = busy || !!review;
        reviewAck.disabled = reviewConfirm.disabled = busy || !!review || !allowed() || !choices.size;
        search.disabled = area.disabled = busy || !!review;
        renderReview();
        if (!busy)
            status.textContent = actionMessage && connected && actionMessageKey === snapshotKey() ? actionMessage : !validFilters && source !== "history" ? "Filtri non validi: controlla la priorità (intero 0–255) e i testi. Nessun allarme viene mostrato con filtri ambigui." : invalidFilter ? "Filtro non supportato: usa AlarmClassName = 'nome classe'. Nessun allarme viene mostrato con un filtro ambiguo." : selected && !unchanged ? "L'allarme è cambiato: selezionalo di nuovo prima di agire." : connected && snapshot && !snapshot.actionsEnabled && source !== "history" ? "Presa visione bloccata finché il servizio non autorizza l'operatore." : rows.length + " risultati · pagina " + (page + 1);
        const visible = rows.slice(page * 100, (page + 1) * 100), visibleColumns = columns.columns.filter(item => item.visible), nextSignature = JSON.stringify([visible, selected, page, multi, [...choices.keys()], !!review, busy, columns]);
        visibleRows = source === "history" ? [] : visible;
        if (signature === nextSignature)
            return;
        signature = nextSignature;
        headers.replaceChildren(...visibleColumns.map(column => { const th = make("th", column.label); th.scope = "col"; th.style.padding = "8px"; th.dataset.alarmKey = column.key; return th; }));
        colgroup.replaceChildren(...visibleColumns.map(column => { const col = make("col"); col.style.width = column.width + "px"; return col; }));
        table.style.minWidth = visibleColumns.reduce((sum, column) => sum + column.width, 0) + "px";
        const focusedLabel = body.contains(host.ownerDocument.activeElement) ? host.ownerDocument.activeElement?.getAttribute("aria-label") : undefined;
        body.replaceChildren(...visible.map((item) => {
            const tr = make("tr"), history = "state" in item, row = item;
            Object.assign(tr.style, { background: !history && selected?.id === item.id ? "#23466a" : "#333333", borderBottom: "1px solid #596372" });
            const cell = make("td");
            cell.dataset.alarmColumn = visibleColumns.find(column => column.key === "name").label; cell.dataset.alarmKey = "name";
            cell.style.padding = "6px 8px";
            if (history)
                cell.textContent = item.name;
            else {
                const select = button(item.name);
                select.setAttribute("aria-label", "Seleziona " + item.name);
                select.setAttribute("aria-pressed", String(selected?.id === item.id));
                select.disabled = multi || busy || !!review;
                select.onclick = () => { actionMessage = undefined; selected = { id: row.id, occurrence: row.occurrence, revision: row.revision }; render(); };
                cell.append(select);
                if (multi) {
                    const label = make("label"), check = make("input"); check.type = "checkbox"; check.checked = choices.has(row.id); check.disabled = busy || !!review || !allowed() || !eligible(row, "acknowledge") && !eligible(row, "confirm");
                    check.setAttribute("aria-label", "Includi " + row.name); Object.assign(label.style, { display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", cursor: "pointer", overflowWrap: "anywhere" });
                    Object.assign(check.style, { width: "22px", height: "22px", flexShrink: "0" });
                    check.onchange = () => { if (check.disabled || busy || review || !allowed()) return; if (!check.checked) choices.delete(row.id); else if (choices.size < 100) choices.set(row.id, rememberChoice(row)); else rememberAction("Massimo 100 allarmi per operazione. Riduci la selezione."); render(); };
                    label.append(check, make("span", "Includi")); cell.append(label);
                }
            }
            const state = history ? ({ Incoming: "Attivato", Outgoing: "Rientrato", Acknowledged: "Presa visione", Confirmed: "Rientro confermato" }[item.state]) + (item.actor ? " · " + item.actor : "") : alarmStateLabel(row) + (row.quality !== "good" ? " · segnale non valido" : "");
            for (const column of visibleColumns) {
                if (column.key === "name") { tr.append(cell); continue; }
                const td = make("td", alarmColumnValue(column.key, item, history, state, columns.timeZone));
                td.dataset.alarmColumn = column.label; td.dataset.alarmKey = column.key;
                Object.assign(td.style, { padding: "8px", overflowWrap: "anywhere" });
                tr.append(td);
            }
            if (!history && row.diagnostic) {
                tr.title = row.diagnostic;
                const detail = make("details"), summary = make("summary", "Problema del segnale / della soglia");
                Object.assign(summary.style, { cursor: "pointer", minHeight: "44px", padding: "8px 0" });
                detail.append(summary, make("p", row.diagnostic)); (tr.querySelector('[data-alarm-key="message"]') ?? tr.querySelector('[data-alarm-key="state"]')).append(detail);
            }
            return tr;
        }));
        if (!visible.length) {
            const tr = make("tr"), td = make("td", "Nessun allarme corrispondente ai filtri.");
            td.colSpan = visibleColumns.length;
            td.style.padding = "12px";
            tr.append(td);
            body.append(tr);
        }
        if (focusedLabel)
            ([...body.querySelectorAll("button,input")].find((node) => node.getAttribute("aria-label") === focusedLabel) ?? search).focus({ preventScroll: true });
    };
    const act = async (kind) => {
        syncColumns();
        if (!selected?.occurrence || columnsError || busy || !connected || !snapshot?.actionsEnabled || hmiAlarmElementBlocked(host) || (kind === "acknowledge" ? ack.disabled : confirm.disabled))
            return;
        const command = { alarmId: selected.id, occurrence: selected.occurrence, revision: selected.revision, action: kind };
        const epoch = generation;
        busy = true;
        actionMessage = undefined;
        render();
        status.textContent = "Operazione in corso…";
        try {
            await action(command);
            if (!disposed && epoch === generation) {
                selected = undefined;
                rememberAction(kind === "acknowledge" ? "Presa visione registrata. Il segnale di guasto non è stato modificato." : "Rientro confermato.");
            }
        }
        catch (error) {
            if (!disposed && epoch === generation)
                rememberAction(error instanceof Error ? error.message : "Operazione non completata. Aggiorna la vista e controlla il servizio.");
        }
        finally {
            busy = false;
            if (!disposed) {
                render();
                ack.disabled = true;
                confirm.disabled = true;
            }
        }
    };
    ack.onclick = () => { void act("acknowledge"); };
    confirm.onclick = () => { void act("confirm"); };
    multiple.onclick = () => { if (busy || review || !allowed()) return; multi = !multi; choices.clear(); selected = undefined; render(); };
    choosePage.onclick = () => { if (busy || review || !allowed()) return; choices.clear(); for (const row of visibleRows) if (eligible(row, "acknowledge") || eligible(row, "confirm")) choices.set(row.id, rememberChoice(row)); render(); };
    clearChoices.onclick = () => { if (busy || review) return; choices.clear(); render(); };
    reviewAck.onclick = () => prepareGroup("acknowledge"); reviewConfirm.onclick = () => prepareGroup("confirm");
    const userChanged = () => { const who = viewContext?.operator ? JSON.stringify(viewContext.operator()) : undefined; if (viewContext?.operator && who === userIdentity) return; userIdentity = who; generation++; stopRequested = true; choices.clear(); review = undefined; selected = undefined; actionMessage = undefined; multi = false; search.value = ""; area.value = ""; for (const [key, input] of Object.entries(extra)) input.value = activeAlarmViewDefaults[key]; columns = parseAlarmColumns(projectColumns); columnsUiSignature = ""; columnProfiles.reset(); columnProfileUiSignature = ""; columnStatus.textContent = "Accesso cambiato: verificate le colonne del progetto e il profilo personale."; savedViews.reset(); savedSignature = ""; page = 0; render(); };
    view?.addEventListener("framecraft:user-changed", userChanged);
    search.oninput = area.onchange = () => { actionMessage = undefined; page = 0; render(); };
    for (const input of Object.values(extra)) input.onchange = () => { actionMessage = undefined; selected = undefined; choices.clear(); page = 0; render(); };
    extra.minimumPriority.oninput = extra.minimumPriority.onchange;
    previous.onclick = () => { actionMessage = undefined; page--; render(); };
    next.onclick = () => { actionMessage = undefined; page++; render(); };
    const columnObserver = view?.MutationObserver ? new view.MutationObserver(() => render()) : undefined; columnObserver?.observe(host, { attributes: true, attributeFilter: [alarmColumnsAttribute, alarmColumnProfileAttribute] });
    const profileObserver = view?.MutationObserver ? new view.MutationObserver(records => { if (records.some(record => record.type === "attributes" ? record.target !== host : [...record.addedNodes, ...record.removedNodes].some(node => node.matches?.('[' + alarmColumnProfileAttribute + ']') || node.querySelector?.('[' + alarmColumnProfileAttribute + ']')))) render(); }) : undefined;
    return {
        update(value, available = true) { if (value)
            snapshot = value; connected = available && !!value; render(); },
        dispose() { if (disposed) return; disposed = true; generation++; choices.clear(); review = undefined; savedViews.dispose(); columnProfiles.dispose(); columnObserver?.disconnect(); profileObserver?.disconnect(); view?.removeEventListener("framecraft:user-changed", userChanged); responsive.remove(); delete host.dataset.hmiAlarmRoot; host.replaceChildren(...original); for (const [name, value] of [["style", oldStyle], ["role", oldRole], ["aria-label", oldLabel]]) {
            if (value === null)
                host.removeAttribute(name);
            else
                host.setAttribute(name, value);
        } },
    };
}

export function createHmiAlarmControl(host, action, rowFilter, viewContext) {
    return createHmiAlarmControlWith(host, action, rowFilter, { alarmStateLabel, hmiAlarmElementBlocked, activeAlarmViewDefaults, alarmRowMatchesView, compareAlarmViewRows, createAlarmSavedViews, parseAlarmViewFilters, alarmColumnsAttribute, defaultAlarmColumns, parseAlarmColumns, alarmColumnValue, alarmColumnProfileAttribute, createAlarmColumnsProfile }, viewContext);
}
