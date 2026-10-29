export function createAlarmViewsLibrary() {
const activeAlarmViewDefaults = Object.freeze({ search: "", area: "", alarmClass: "", state: "all", quality: "all", minimumPriority: "", order: "priority-desc" });
const keys = (value, names) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const safeText = (value, maximum, empty = true) => typeof value === "string" && value.length <= maximum && (empty || value.trim() === value && !!value) && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value);
const alarmColumnsAttribute = "data-hmi-alarm-columns";
const alarmColumnDefinitions = Object.freeze([
    ["name", "Allarme", 180, true], ["state", "Stato", 150, true], ["message", "Messaggio", 400, true], ["area", "Zona", 140, true], ["time", "Ora", 180, true],
    ["id", "ID", 120, false], ["alarmClass", "Classe", 160, false], ["priority", "Priorità", 90, false], ["quality", "Qualità", 160, false], ["acknowledged", "Presa visione", 170, false], ["confirmed", "Conferma rientro", 180, false], ["clearedAt", "Ultimo rientro", 180, false], ["occurrence", "Occorrenza", 220, false],
].map(([key, label, width, visible]) => Object.freeze({ key, label, width, visible })));
function defaultAlarmColumns() { return { version: 1, timeZone: "local", columns: alarmColumnDefinitions.map(item => ({ ...item })) }; }
function parseAlarmColumns(input) {
    if (input === null || input === undefined) return defaultAlarmColumns();
    const invalid = () => { throw new Error("Colonne allarmi non valide. Servono nome e stato visibili, campi unici, titoli di 1–60 caratteri, larghezze intere 64–1200 px e orario locale o UTC. Correggi Colonne allarmi nell’editor; la configurazione esistente è conservata."); };
    let value = input;
    try { if (typeof input === "string") { if (input.length > 12000) invalid(); value = JSON.parse(input); } } catch { invalid(); }
    if (!keys(value, ["version", "timeZone", "columns"]) || value.version !== 1 || !["local", "UTC"].includes(value.timeZone) || !Array.isArray(value.columns) || value.columns.length !== alarmColumnDefinitions.length) invalid();
    const seen = new Set();
    for (const column of value.columns) {
        if (!keys(column, ["key", "label", "width", "visible"]) || !alarmColumnDefinitions.some(item => item.key === column.key) || seen.has(column.key) || !safeText(column.label, 60, false) || !Number.isInteger(column.width) || column.width < 64 || column.width > 1200 || typeof column.visible !== "boolean" || ["name", "state"].includes(column.key) && !column.visible) invalid();
        seen.add(column.key);
    }
    return { version: 1, timeZone: value.timeZone, columns: value.columns.map(item => ({ ...item })) };
}
function serializeAlarmColumns(value) { const checked = parseAlarmColumns(value); return JSON.stringify({ version: 1, timeZone: checked.timeZone, columns: checked.columns.map(({ key, label, width, visible }) => ({ key, label, width, visible })) }); }
function alarmColumnValue(key, item, history, state, timeZone) {
    const date = value => !Number.isFinite(value) || !Number.isFinite(new Date(value).getTime()) ? "—" : timeZone === "UTC" ? new Date(value).toISOString().replace("T", " ").replace("Z", " UTC") : new Date(value).toLocaleString();
    switch (key) {
        case "name": return item.name;
        case "state": return state;
        case "message": return item.text;
        case "area": return item.area ?? "";
        case "time": return date(history ? item.time : item.activatedAt);
        case "id": return item.id;
        case "alarmClass": return history ? item.alarmClass : item.className;
        case "priority": return String(item.priority);
        case "quality": return history ? "Non registrata" : ({ good: "Valida", bad: "Non valida", unknown: "Sconosciuta" }[item.quality] ?? "Sconosciuta");
        case "acknowledged": return history ? "Non registrata come stato" : item.acknowledgment === "none" ? "Non richiesta" : !item.occurrence ? "Nessuna occorrenza" : item.acknowledged ? "Registrata" : "Non registrata";
        case "confirmed": return history ? "Non registrata come stato" : item.acknowledgment !== "reset" ? "Non richiesta" : !item.occurrence ? "Nessuna occorrenza" : item.confirmed ? "Registrata" : "Non registrata";
        case "clearedAt": return history ? "Non registrato come stato" : date(item.clearedAt);
        case "occurrence": return item.occurrence ?? "—";
        default: return "—";
    }
}
class AlarmViewError extends Error {
    constructor(code) { const messages = {
        invalid: "Vista non valida. Controlla nome e filtri: non vengono usati valori predefiniti al posto di quelli errati.",
        corrupt: "Viste salvate non leggibili o di una versione diversa. I dati esistenti non sono stati sostituiti. I filtri temporanei restano utilizzabili.",
        storage: "Il browser non consente di salvare le viste. Verifica spazio e impostazioni del browser; puoi continuare con filtri temporanei.",
        scope: "Le viste salvate richiedono l’identificativo del progetto. Nella prova locale puoi usare i filtri temporanei.",
        duplicate: "Esiste già una vista con questo nome. Scegline un altro o aggiorna la vista selezionata.",
        missing: "Questa vista è stata rimossa da un’altra finestra. Rileggi l’elenco e scegli di nuovo.",
        limit: "Puoi conservare al massimo 25 viste per utente, progetto e tipo di lista. Rimuovi una vista prima di aggiungerne un’altra.",
    }; super(messages[code] ?? messages.invalid); this.name = "AlarmViewError"; this.code = Object.hasOwn(messages, code) ? code : "invalid"; }
}
const fail = code => { throw new AlarmViewError(code); };
function parseAlarmViewFilters(kind, value) {
    if (kind === "active") {
        if (!keys(value, Object.keys(activeAlarmViewDefaults)) || ["search", "area", "alarmClass"].some(key => !safeText(value[key], 200)) || !["all", "active", "unacknowledged", "awaiting-confirmation"].includes(value.state) || !["all", "good", "invalid"].includes(value.quality) || !["priority-desc", "priority-asc", "latest-desc", "oldest-asc", "name-asc", "name-desc"].includes(value.order) || typeof value.minimumPriority !== "string" || value.minimumPriority !== "" && (!/^(?:0|[1-9]\d{0,2})$/.test(value.minimumPriority) || Number(value.minimumPriority) > 255)) fail("invalid");
    } else if (kind === "history") {
        if (!keys(value, ["alarmId", "alarmClass", "area", "state", "from", "to"]) || Object.values(value).some(item => typeof item !== "string")) fail("invalid");
        if (!["alarmId", "alarmClass", "area"].every(key => safeText(value[key], key === "alarmId" ? 80 : 200) && (value[key] === "" || !!value[key].trim())) || !["", "Incoming", "Outgoing", "Acknowledged", "Confirmed", "Shelved", "Unshelved", "Commented"].includes(value.state)) fail("invalid");
        for (const key of ["from", "to"]) if (value[key] !== "" && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value[key]) || !Number.isFinite(Date.parse(value[key])) || new Date(value[key]).toISOString() !== value[key])) fail("invalid");
        if (value.from && value.to && value.from > value.to) fail("invalid");
    } else fail("invalid");
    return { ...value };
}
function alarmRowMatchesView(row, filters) {
    return (!filters.alarmClass || row.className === filters.alarmClass) && (!filters.area || (row.area ?? "") === filters.area)
        && [row.name, row.text, row.id].join(" ").toLocaleLowerCase().includes(filters.search.toLocaleLowerCase())
        && (filters.minimumPriority === "" || row.priority >= Number(filters.minimumPriority))
        && (filters.quality === "all" || (row.quality === "good") === (filters.quality === "good"))
        && (filters.state === "all" || filters.state === "active" && row.active === true || filters.state === "unacknowledged" && row.pending && !row.acknowledged && row.acknowledgment !== "none" || filters.state === "awaiting-confirmation" && row.pending && row.acknowledgment === "reset" && row.active === false && row.acknowledged && !row.confirmed);
}
function compareAlarmViewRows(a, b, order) {
    let result = order === "priority-asc" ? a.priority - b.priority : order === "latest-desc" ? (b.activatedAt ?? 0) - (a.activatedAt ?? 0) : order === "oldest-asc" ? (a.activatedAt ?? 0) - (b.activatedAt ?? 0) : order === "name-asc" ? a.name.localeCompare(b.name) : order === "name-desc" ? b.name.localeCompare(a.name) : b.priority - a.priority;
    if (!result && ["priority-desc", "priority-asc"].includes(order)) result = (b.activatedAt ?? 0) - (a.activatedAt ?? 0);
    return result || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const nameKey = value => value.normalize("NFC").toLocaleLowerCase("en-US");
function alarmViewsStorageKey(context, kind) {
    if (!context || !idPattern.test(context.namespace) || !["active", "history"].includes(kind)) fail("scope");
    const profile = context.operator?.(), actor = profile == null ? null : profile.id;
    if (actor !== null && !safeText(actor, 80, false)) fail("scope");
    try { return `framecraft.alarm-views.v1:${context.namespace}:${actor === null ? "guest" : "user:" + encodeURIComponent(actor)}:${kind}`; } catch { fail("scope"); }
}
function parseAlarmViews(text, kind) {
    if (text === null) return { version: 1, views: [] };
    try {
        if (typeof text !== "string" || new TextEncoder().encode(text).length > 65536) fail("corrupt");
        const value = JSON.parse(text);
        if (!keys(value, ["version", "views"]) || value.version !== 1 || !Array.isArray(value.views) || value.views.length > 25) fail("corrupt");
        const ids = new Set(), names = new Set();
        for (const view of value.views) {
            if (!keys(view, ["id", "name", "filters"]) || !idPattern.test(view.id) || !safeText(view.name, 64, false) || ids.has(view.id) || names.has(nameKey(view.name))) fail("corrupt");
            parseAlarmViewFilters(kind, view.filters); ids.add(view.id); names.add(nameKey(view.name));
        }
        return value;
    } catch { fail("corrupt"); }
}

const alarmColumnProfileAttribute = "data-hmi-alarm-column-profile";
class AlarmColumnProfileError extends Error {
    constructor(code) { const messages = { config: "Salvataggio colonne non configurato correttamente. Verifica identificativo e modalità nell’editor; le modifiche temporanee restano disponibili.", scope: "Il profilo richiede l’identificativo del progetto e della pagina. Nella prova incorporata usa le colonne temporanee.", duplicate: "Due liste nella pagina hanno lo stesso identificativo del profilo. Assegna identificativi diversi nell’editor; nessun profilo viene letto o sovrascritto.", corrupt: "Il profilo colonne è illeggibile o di una versione diversa. È conservato: puoi usare colonne temporanee, rileggere o rimuovere esplicitamente solo questo profilo.", storage: "Il browser non consente di leggere o salvare le colonne. Controlla spazio e impostazioni del browser; le modifiche restano temporanee.", changed: "Il progetto ha modificato le colonne. Il profilo precedente è conservato e non applicato: controlla il progetto, poi scegli se caricarlo o salvare la nuova disposizione." }; super(messages[code] ?? messages.config); this.name = "AlarmColumnProfileError"; this.code = Object.hasOwn(messages, code) ? code : "config"; }
}
function parseAlarmColumnProfileConfig(input) {
    if (input === null || input === undefined || input === "") return undefined;
    let value = input; try { if (typeof input === "string") { if (input.length > 1000) throw 0; value = JSON.parse(input); } } catch { throw new AlarmColumnProfileError("config"); }
    if (!keys(value, ["version", "id", "save"]) || value.version !== 1 || typeof value.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value.id) || !["manual", "automatic"].includes(value.save)) throw new AlarmColumnProfileError("config");
    return { version: 1, id: value.id, save: value.save };
}
function alarmColumnProfileStorageKey(context, profileId, pathname) {
    parseAlarmColumnProfileConfig({ version: 1, id: profileId, save: "manual" });
    if (!safeText(pathname, 500, false) || !pathname.startsWith("/")) throw new AlarmColumnProfileError("scope");
    try { return alarmViewsStorageKey(context, "active").replace("framecraft.alarm-views.v1:", "framecraft.alarm-columns.v1:").slice(0, -7) + ":" + encodeURIComponent(pathname) + ":" + profileId; } catch { throw new AlarmColumnProfileError("scope"); }
}
function parseAlarmColumnProfileRecord(raw) {
    if (raw === null) return undefined;
    try {
        if (typeof raw !== "string" || raw.length > 32000) throw 0;
        const value = JSON.parse(raw);
        if (!keys(value, ["version", "baseline", "columns"]) || value.version !== 1 || typeof value.baseline !== "string" || serializeAlarmColumns(parseAlarmColumns(value.baseline)) !== value.baseline || !keys(value.columns, ["version", "timeZone", "columns"])) throw 0;
        return { version: 1, baseline: value.baseline, columns: parseAlarmColumns(value.columns) };
    } catch { throw new AlarmColumnProfileError("corrupt"); }
}
function createAlarmColumnsProfile(options) {
    const { document, host } = options, window = document.defaultView;
    let disposed = false, lastScope, scope, saved, code = "", status = "", revision = 0, removeAsked = false;
    const source = () => {
        const raw = host.getAttribute(alarmColumnProfileAttribute), baseline = serializeAlarmColumns(options.project());
        let config, key, error = ""; try {
            config = parseAlarmColumnProfileConfig(raw);
            if (config) {
                if ([...document.querySelectorAll('[' + alarmColumnProfileAttribute + ']')].some(node => { if (node === host) return false; try { return parseAlarmColumnProfileConfig(node.getAttribute(alarmColumnProfileAttribute))?.id === config.id; } catch { return false; } })) throw new AlarmColumnProfileError("duplicate");
                key = alarmColumnProfileStorageKey(options.context, config.id, window.location.pathname);
            }
        } catch (failure) { error = failure instanceof AlarmColumnProfileError ? failure.code : "config"; }
        return { config, key, baseline, error, signature: JSON.stringify([raw, baseline, key, error]) };
    };
    const read = current => { try { saved = parseAlarmColumnProfileRecord(window.localStorage.getItem(current.key)); code = saved && saved.baseline !== current.baseline ? "changed" : ""; status = code ? new AlarmColumnProfileError(code).message : saved ? "Colonne conservate disponibili. Nessuna modifica al progetto o ai comandi." : "Nessuna disposizione conservata per questo operatore e questa lista."; } catch (error) { saved = undefined; code = error instanceof AlarmColumnProfileError ? error.code : "storage"; status = new AlarmColumnProfileError(code).message; } revision++; };
    function sync() {
        if (disposed || options.disabled()) return false;
        const current = source(); if (current.signature === lastScope) return false;
        lastScope = current.signature; scope = current; saved = undefined; removeAsked = false; code = current.error; revision++; options.apply(parseAlarmColumns(options.project()));
        if (current.error) { status = new AlarmColumnProfileError(current.error).message; return true; }
        if (!current.config) { status = "Per conservare le colonne, abilita Salvataggio per operatore nell’editor. Qui restano temporanee."; return true; }
        read(current);
        if (saved && !code) { options.apply(parseAlarmColumns(saved.columns)); status = "Ripristinate le colonne conservate per questo operatore e questa lista. Nessun comando eseguito."; }
        return true;
    }
    function save() {
        const existing = window.localStorage.getItem(scope.key); parseAlarmColumnProfileRecord(existing);
        const record = { version: 1, baseline: scope.baseline, columns: parseAlarmColumns(options.current()) }, raw = JSON.stringify(record); if (raw.length > 32000) throw new AlarmColumnProfileError("corrupt");
        window.localStorage.setItem(scope.key, raw); saved = record; code = ""; removeAsked = false; status = "Colonne conservate per questo operatore, progetto, pagina e lista su questo browser."; revision++;
    }
    function automatic() {
        if (disposed || options.disabled()) return;
        const previous = lastScope; sync(); if (previous !== lastScope || !scope?.key || scope.error || scope.config?.save !== "automatic" || code === "corrupt" || code === "storage") return;
        try { save(); } catch (error) { code = error instanceof AlarmColumnProfileError ? error.code : "storage"; status = new AlarmColumnProfileError(code).message; revision++; }
    }
    function render() {
        const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }, root = make("section"); root.setAttribute("aria-label", "Colonne personali conservate"); root.style.gridColumn = "1 / -1";
        const message = make("p", status); message.setAttribute("role", code ? "alert" : "status"); root.append(message);
        if (!scope?.config || !scope.key || scope.error) return root;
        const controls = make("div"); Object.assign(controls.style, { display: "flex", flexWrap: "wrap", gap: "8px" });
        const command = (title, action, disabled = false, focus = title) => { const expectedScope = lastScope, button = make("button", title); button.type = "button"; button.disabled = options.disabled() || disabled; button.dataset.columnProfileFocus = focus;
            Object.assign(button.style, { minHeight: "44px", padding: "6px 12px", border: "1px solid #8894a4", borderRadius: "4px", background: "#252d39", color: "#fff", cursor: "pointer" });
            button.onclick = () => { if (disposed || button.disabled || options.disabled()) return; sync(); if (lastScope !== expectedScope) { options.changed(); return; } try { action(); } catch (error) { code = error instanceof AlarmColumnProfileError ? error.code : "storage"; status = new AlarmColumnProfileError(code).message; revision++; } options.changed(); }; controls.append(button); return button; };
        command("Salva le mie colonne", save, code === "corrupt" || code === "storage");
        command("Carica le mie colonne", () => { read(scope); if (saved && !["corrupt", "storage"].includes(code)) { options.apply(parseAlarmColumns(saved.columns)); status = saved.baseline === scope.baseline ? "Colonne conservate caricate. Nessun comando eseguito." : "Caricate colonne di una configurazione precedente. Verificale prima di applicare o salvare la disposizione."; revision++; } }, !saved);
        command("Rileggi profilo colonne", () => { removeAsked = false; read(scope); });
        command(removeAsked ? "Conferma rimozione profilo colonne" : "Dimentica le mie colonne", () => { if (!removeAsked) { removeAsked = true; status = "Conferma la rimozione del solo profilo di questa lista e operatore. Gli altri dati restano conservati."; revision++; return; } window.localStorage.removeItem(scope.key); saved = undefined; removeAsked = false; code = ""; status = "Profilo rimosso. Ripristinate le colonne del progetto per questa lista."; options.apply(parseAlarmColumns(options.project())); revision++; }, !saved && code !== "corrupt", "remove");
        root.append(controls, make("p", scope.config.save === "automatic" ? "Salvataggio automatico quando premi Applica visualizzazione o Ripristina colonne del progetto. Le bozze dei campi non vengono salvate." : "Salvataggio manuale: premi Salva le mie colonne. All’apertura vengono ripristinate solo se il progetto è ancora compatibile."), make("p", "Preferenze locali: nessun filtro, dato PLC, selezione, credenziale o comando conservato. Non sono un backup né autorizzazioni. Con più finestre prevale l’ultimo salvataggio.")); return root;
    }
    const storageChanged = event => { if (disposed || !scope?.key || event.key !== null && event.key !== scope.key) return; const current = source(); if (current.signature !== lastScope) { options.changed(); return; } removeAsked = false; read(current); if (!code) status = "Profilo aggiornato da un’altra finestra. La visualizzazione attuale non è cambiata; scegli Carica le mie colonne se serve."; revision++; options.changed(); };
    window.addEventListener("storage", storageChanged);
    return { sync, render, automatic, signature: () => revision, reset() { lastScope = undefined; scope = saved = undefined; removeAsked = false; code = ""; status = ""; revision++; }, dispose() { disposed = true; window.removeEventListener("storage", storageChanged); } };
}
function createAlarmSavedViews(options) {
    const { document, kind } = options, window = document.defaultView;
    let disposed = false, opened = false, selected = "", name = "", status = "Viste locali a questo browser, progetto e utente. Non concedono permessi e non eseguono comandi.", error = false, resetAsked = false, lastKey, rendered;
    const node = (tag, text) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element; };
    const notify = () => { if (disposed) return; const focused = rendered?.contains(document.activeElement) ? document.activeElement?.dataset.alarmViewFocus : undefined; options.changed(); if (focused) [...rendered.querySelectorAll("[data-alarm-view-focus]")].find(node => node.dataset.alarmViewFocus === focused)?.focus({ preventScroll: true }); };
    const storageKey = () => alarmViewsStorageKey(options.context, kind);
    const read = () => { try { const key = storageKey(); return parseAlarmViews(window.localStorage.getItem(key), kind); } catch (reason) { if (reason instanceof AlarmViewError) throw reason; fail("storage"); } };
    const write = value => { const source = JSON.stringify(value); if (new TextEncoder().encode(source).length > 65536) fail("limit"); try { window.localStorage.setItem(storageKey(), source); } catch { fail("storage"); } };
    const failed = reason => { error = true; status = reason instanceof AlarmViewError ? reason.message : new AlarmViewError("invalid").message; notify(); };
    const command = (title, action, disabled) => {
        const button = node("button", title); button.type = "button"; button.disabled = options.disabled() || disabled; button.dataset.alarmViewFocus = title;
        Object.assign(button.style, { minHeight: "48px", maxWidth: "100%", whiteSpace: "normal", font: "inherit", cursor: "pointer", padding: "8px 10px", border: "1px solid #8894a4", borderRadius: "4px", color: options.dark ? "#fff" : "#172331", background: options.dark ? "#252d39" : "#fff" });
        button.onclick = () => { if (!disposed && !button.disabled && !options.disabled()) { try { action(); } catch (reason) { failed(reason); } } }; return button;
    };
    function render() {
        const root = node("details"), summary = node("summary", "Viste salvate"); rendered = root; root.dataset.alarmSavedViews = ""; root.open = opened;
        Object.assign(root.style, { width: "100%", minWidth: "0", overflowWrap: "anywhere" }); Object.assign(summary.style, { minHeight: "48px", boxSizing: "border-box", padding: "10px 0", cursor: "pointer" });
        root.ontoggle = () => { if (root.isConnected) opened = root.open; }; root.append(summary);
        let catalog, available = false, loadCode;
        try { const key = storageKey(); if (lastKey !== key) { lastKey = key; selected = ""; name = ""; resetAsked = false; } catalog = read(); available = true; }
        catch (reason) { error = true; loadCode = reason instanceof AlarmViewError ? reason.code : "storage"; status = reason instanceof AlarmViewError ? reason.message : new AlarmViewError("storage").message; }
        const message = node("p", status); message.setAttribute("role", error ? "alert" : "status"); root.append(message);
        const fields = node("div"); Object.assign(fields.style, { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))", gap: "12px", alignItems: "start" });
        const pickerLabel = node("label", "Vista salvata"), picker = node("select"), nameLabel = node("label", "Nome della vista"), input = node("input");
        for (const label of [pickerLabel, nameLabel]) Object.assign(label.style, { display: "grid", gap: "4px", minWidth: "0" });
        for (const control of [picker, input]) Object.assign(control.style, { minHeight: "48px", minWidth: "0", maxWidth: "100%", width: "100%", boxSizing: "border-box", font: "inherit", padding: "8px", border: "1px solid #8894a4", borderRadius: "4px", color: options.dark ? "#fff" : "#172331", background: options.dark ? "#181e28" : "#fff" });
        const none = node("option", "Scegli una vista…"); none.value = ""; picker.append(none);
        for (const view of catalog?.views ?? []) { const option = node("option", view.name); option.value = view.id; picker.append(option); }
        if (selected && !catalog?.views.some(view => view.id === selected)) selected = "";
        picker.value = selected; picker.disabled = input.disabled = options.disabled() || !available; picker.setAttribute("aria-label", "Vista salvata"); picker.dataset.alarmViewFocus = "picker";
        picker.onchange = () => { selected = picker.value; name = catalog.views.find(view => view.id === selected)?.name ?? ""; resetAsked = false; notify(); };
        input.type = "text"; input.maxLength = 64; input.value = name; input.setAttribute("aria-label", "Nome della vista"); input.dataset.alarmViewFocus = "name"; input.oninput = () => { name = input.value; };
        input.onkeydown = event => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); event.stopPropagation(); } };
        pickerLabel.append(picker); nameLabel.append(input); fields.append(pickerLabel, nameLabel); root.append(fields);
        const buttons = node("div"); Object.assign(buttons.style, { display: "flex", flexWrap: "wrap", gap: "8px", margin: "12px 0" });
        if (loadCode !== "scope") buttons.append(command("Rileggi elenco delle viste", () => { read(); error = false; status = "Elenco riletto. Nessuna vista applicata automaticamente."; notify(); }, false));
        buttons.append(command(kind === "history" ? "Usa filtri della vista" : "Applica vista", () => { const item = read().views.find(view => view.id === selected); if (!item) fail("missing"); options.apply(parseAlarmViewFilters(kind, item.filters)); error = false; status = kind === "history" ? "Filtri caricati nella bozza. Controllali e premi Carica storico o Aggiorna dalla prima pagina. Nessuna lettura automatica." : "Vista applicata. Selezione degli allarmi azzerata; nessun comando eseguito."; notify(); }, !available || !selected));
        function save(replace) {
            if (!safeText(name, 64, false)) fail("invalid"); const current = read(), filters = parseAlarmViewFilters(kind, options.current());
            if (replace && !current.views.some(view => view.id === selected)) fail("missing");
            if (current.views.some(view => (!replace || view.id !== selected) && nameKey(view.name) === nameKey(name))) fail("duplicate");
            if (!replace && current.views.length >= 25) fail("limit");
            const id = replace ? selected : window.crypto.randomUUID(), entry = { id, name, filters }; write({ version: 1, views: replace ? current.views.map(view => view.id === id ? entry : view) : [...current.views, entry] });
            selected = id; error = false; status = "Vista salvata in questo browser. Filtri e ordinamento, senza campioni PLC, selezioni o comandi."; notify();
        }
        buttons.append(command("Salva come nuova vista", () => save(false), !available), command("Aggiorna vista selezionata", () => save(true), !available || !selected), command("Elimina vista selezionata", () => { const current = read(); if (!current.views.some(view => view.id === selected)) fail("missing"); write({ version: 1, views: current.views.filter(view => view.id !== selected) }); selected = ""; name = ""; error = false; status = "Vista eliminata. I filtri attuali non sono cambiati."; notify(); }, !available || !selected));
        if (loadCode === "corrupt") buttons.append(command(resetAsked ? "Conferma azzeramento delle sole viste salvate" : "Reimposta elenco delle viste", () => { if (!resetAsked) { storageKey(); resetAsked = true; notify(); return; } try { window.localStorage.removeItem(storageKey()); } catch { fail("storage"); } resetAsked = false; selected = ""; name = ""; error = false; status = "Elenco delle viste azzerato per questo utente e progetto. Archivio e filtri temporanei invariati."; notify(); }, false));
        root.append(buttons, node("p", "Nessun ripristino automatico all’apertura. Non sono un backup o un’impostazione di sicurezza e non vengono sincronizzate tra dispositivi. Con più finestre, l’ultimo salvataggio locale prevale."));
        return root;
    }
    const changed = event => { if (disposed) return; let key; try { key = storageKey(); } catch { return; } if (event.key === key || event.key === null) { status = "Elenco aggiornato da un’altra finestra. Nessuna vista applicata automaticamente."; resetAsked = false; error = false; notify(); } };
    window.addEventListener("storage", changed);
    return { render, reset() { selected = ""; name = ""; lastKey = undefined; resetAsked = false; error = false; status = "Accesso cambiato. Le viste di questo utente non vengono applicate automaticamente."; }, dispose() { disposed = true; window.removeEventListener("storage", changed); } };
}
return { activeAlarmViewDefaults, AlarmViewError, parseAlarmViewFilters, alarmRowMatchesView, compareAlarmViewRows, alarmViewsStorageKey, parseAlarmViews, createAlarmSavedViews, alarmColumnsAttribute, alarmColumnDefinitions, defaultAlarmColumns, parseAlarmColumns, serializeAlarmColumns, alarmColumnValue, alarmColumnProfileAttribute, AlarmColumnProfileError, parseAlarmColumnProfileConfig, alarmColumnProfileStorageKey, parseAlarmColumnProfileRecord, createAlarmColumnsProfile };
}
export const { activeAlarmViewDefaults, AlarmViewError, parseAlarmViewFilters, alarmRowMatchesView, compareAlarmViewRows, alarmViewsStorageKey, parseAlarmViews, createAlarmSavedViews, alarmColumnsAttribute, alarmColumnDefinitions, defaultAlarmColumns, parseAlarmColumns, serializeAlarmColumns, alarmColumnValue, alarmColumnProfileAttribute, AlarmColumnProfileError, parseAlarmColumnProfileConfig, alarmColumnProfileStorageKey, parseAlarmColumnProfileRecord, createAlarmColumnsProfile } = createAlarmViewsLibrary();
export function alarmViewsRuntimeModuleSource() { return `const { activeAlarmViewDefaults, AlarmViewError, parseAlarmViewFilters, alarmRowMatchesView, compareAlarmViewRows, alarmViewsStorageKey, parseAlarmViews, createAlarmSavedViews, alarmColumnsAttribute, alarmColumnDefinitions, defaultAlarmColumns, parseAlarmColumns, serializeAlarmColumns, alarmColumnValue, alarmColumnProfileAttribute, AlarmColumnProfileError, parseAlarmColumnProfileConfig, alarmColumnProfileStorageKey, parseAlarmColumnProfileRecord, createAlarmColumnsProfile } = (${String(createAlarmViewsLibrary)})();`; }
