import { normalizeMqttTagValue } from "./connection-config.mjs";
const integerTypes = new Map(Object.entries({ byte: [8, false], usint: [8, false], sint: [8, true], word: [16, false], uint: [16, false], int: [16, true], dword: [32, false], udint: [32, false], dint: [32, true], lword: [64, false], ulint: [64, false], lint: [64, true] }));
const text = (value, max = 200) => typeof value === "string" && !!value.trim() && value.length <= max && !/[\x00-\x1f]/.test(value);
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const copy = (value) => JSON.parse(JSON.stringify(value));

export function emptyAlarmCatalog() {
  return { version: 1, classes: [{ name: "Alarm_CTH", acknowledgment: "single" }, { name: "Alarm_History", acknowledgment: "none" }], alarms: [], maxHistory: 2000 };
}

export function alarmCatalogIssues(catalog, variables) {
  const issues = [], add = (path, message) => issues.push({ path, message });
  if (!object(catalog) || catalog.version !== 1 || !Array.isArray(catalog.classes) || !Array.isArray(catalog.alarms)) return [{ path: "catalog", message: "Catalogo allarmi non valido: servono versione 1, classi e allarmi." }];
  const fields = (item, allowed, path) => { if (object(item) && Object.keys(item).some((key) => !allowed.includes(key))) add(path, "Proprietà non supportate nel catalogo allarmi. Non inserire credenziali o altri dati in questo file."); };
  fields(catalog, ["version", "classes", "alarms", "maxHistory"], "catalog");
  if (catalog.classes.length > 100 || catalog.alarms.length > 2000) add("catalog", "Superato il limite Framecraft di 100 classi o 2000 allarmi.");
  if (!Number.isInteger(catalog.maxHistory) || catalog.maxHistory < 100 || catalog.maxHistory > 10000) add("maxHistory", "Lo storico di sessione deve contenere da 100 a 10000 eventi.");
  const classes = new Map(), ids = new Set(), bits = new Set(), modes = new Map();
  catalog.classes.forEach((item, index) => {
    const path = `classes.${index}`;
    fields(item, ["name", "acknowledgment"], path);
    if (!object(item) || !text(item.name) || classes.has(item.name)) add(path + ".name", "Ogni classe deve avere un nome non vuoto e unico.");
    else classes.set(item.name, item);
    if (!object(item) || !["none", "single", "reset"].includes(item.acknowledgment)) add(path + ".acknowledgment", "Scegli nessuna presa visione, presa visione o presa visione con conferma del rientro.");
  });
  catalog.alarms.forEach((item, index) => {
    const path = `alarms.${index}`;
    if (!object(item)) { add(path, "Definizione allarme non valida."); return; }
    fields(item, ["id", "name", "text", "tag", "className", "priority", "area", "enabled", "trigger"], path);
    if (!text(item.id, 80) || !/^[A-Za-z0-9_-]+$/.test(item.id) || ids.has(item.id)) add(path + ".id", "L'identificativo deve essere unico: usa lettere, numeri, trattini o underscore.");
    ids.add(item.id);
    for (const [key, max] of [["name", 200], ["text", 1000], ["tag", 200]]) if (!text(item[key], max)) add(path + "." + key, "Compila " + ({ name: "il nome", text: "il messaggio per l'operatore", tag: "il segnale PLC" }[key]) + ".");
    if (item.area !== undefined && (typeof item.area !== "string" || item.area.length > 200 || /[\x00-\x1f]/.test(item.area))) add(path + ".area", "La zona deve essere un testo di massimo 200 caratteri.");
    if (!classes.has(item.className)) add(path + ".className", "Scegli una classe presente nel catalogo.");
    if (typeof item.enabled !== "boolean") add(path + ".enabled", "L'abilitazione deve essere esplicita.");
    if (!Number.isInteger(item.priority) || item.priority < 0 || item.priority > 255) add(path + ".priority", "La priorità Framecraft deve essere un intero da 0 a 255; i numeri più alti vengono prima.");
    const found = variables?.filter((variable) => variable.name === item.tag && !variable.detected);
    const variable = found?.length === 1 ? found[0] : undefined;
    if (variables && (!variable || !["read", "read-write"].includes(variable.access))) add(path + ".tag", "Il segnale deve essere dichiarato una sola volta e leggibile nel catalogo PLC.");
    const type = variable?.dataType?.toLowerCase(), trigger = item.trigger;
    if (!object(trigger)) { add(path + ".trigger", "Scegli il tipo di attivazione."); return; }
    fields(trigger, trigger.kind === "bit" ? ["kind", "bit", "activeWhen"] : ["kind", "limit", "hysteresis"], path + ".trigger");
    if (trigger.kind === "bit") {
      const width = type === "bool" || type === "boolean" ? 1 : integerTypes.get(type)?.[0];
      if (!Number.isInteger(trigger.bit) || trigger.bit < 0 || trigger.bit > 63 || variables && (!width || trigger.bit >= width)) add(path + ".trigger.bit", "Scegli un bit valido per un segnale Bool o intero scalare (0 per Bool).");
      if (!["set", "clear"].includes(trigger.activeWhen)) add(path + ".trigger.activeWhen", "Scegli se il bit attiva l'allarme quando vale 1 oppure 0.");
      const key = JSON.stringify([item.tag, trigger.bit]);
      if (bits.has(key)) add(path + ".trigger.bit", "Questo bit è già usato da un altro allarme: scegli un bit diverso.");
      bits.add(key);
    } else if (["high", "low"].includes(trigger.kind)) {
      if (variables && !["real", "lreal", "float", "double", "sint", "usint", "int", "uint", "dint", "udint"].includes(type)) add(path + ".tag", "Una soglia richiede un numero scalare fino a 32 bit o Real/LReal; i 64 bit esatti non si convertono in Number.");
      if (!Number.isFinite(trigger.limit) || !Number.isFinite(trigger.hysteresis) || trigger.hysteresis < 0 || !Number.isFinite(trigger.limit + trigger.hysteresis) || !Number.isFinite(trigger.limit - trigger.hysteresis)) add(path + ".trigger.limit", "Compila una soglia finita e un'isteresi finita, non negativa.");
    } else add(path + ".trigger", "Attivazione non supportata.");
    const mode = trigger.kind === "bit" ? "bit" : "analog";
    if (modes.has(item.tag) && modes.get(item.tag) !== mode) add(path + ".tag", "Non mescolare allarmi a bit e analogici sullo stesso segnale.");
    modes.set(item.tag, mode);
  });
  if (!issues.length) {
    const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
    const rowBytes = bytes(catalog.alarms) + catalog.alarms.length * 600;
    const eventBytes = Math.max(200, ...catalog.alarms.map((item) => bytes({ id: item.id, occurrence: "0".repeat(80), name: item.name, text: item.text, alarmClass: item.className, priority: item.priority, area: item.area ?? "", actor: "\u0800".repeat(200), state: "Acknowledged", time: 8640000000000000, sequence: Number.MAX_SAFE_INTEGER })));
    if (rowBytes + eventBytes * catalog.maxHistory > 3_500_000) add("maxHistory", "Catalogo e storico supererebbero la risposta massima del gateway. Riduci numero di eventi conservati o lunghezza dei messaggi.");
  }
  return issues;
}

export function parseAlarmCatalog(value, variables) {
  let catalog;
  try { catalog = typeof value === "string" ? JSON.parse(value) : value; } catch { throw new Error("JSON allarmi non valido. Ripristina il catalogo prima di salvare; il file non viene sostituito con valori predefiniti."); }
  const issues = alarmCatalogIssues(catalog, variables);
  if (issues.length) throw new Error(issues[0].message);
  return copy(catalog);
}

function bitValue(value, type, bit) {
  if (["bool", "boolean"].includes(type)) {
    if ([true, 1, "1", "true"].includes(value)) return true;
    if ([false, 0, "0", "false"].includes(value)) return false;
    throw new Error("Boolean non valido.");
  }
  const spec = integerTypes.get(type);
  if (!spec || typeof value === "number" && !Number.isSafeInteger(value) || !/^-?\d+$/.test(String(value))) throw new Error("Intero non valido.");
  const [width, signed] = spec, number = BigInt(value), min = signed ? -(1n << BigInt(width - 1)) : 0n, max = (1n << BigInt(signed ? width - 1 : width)) - 1n;
  if (number < min || number > max) throw new Error("Intero fuori intervallo.");
  return (BigInt.asUintN(width, number) & (1n << BigInt(bit))) !== 0n;
}

export function alarmStateLabel(row) {
  if (row.active === null) return "In attesa del segnale";
  if (row.active) return row.acknowledged ? "Attivo · preso in visione" : "Attivo";
  if (row.pending) return row.acknowledged ? "Rientrato · da confermare" : "Rientrato · da prendere in visione";
  return "Normale";
}

export function parseAlarmSnapshot(value) {
  if (!object(value) || value.version !== 1 || !text(value.instanceId, 80) || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || !Array.isArray(value.rows) || value.rows.length > 2000 || !Array.isArray(value.history) || value.history.length > 10000
    || !Number.isSafeInteger(value.historyDropped) || value.historyDropped !== value.sequence - value.history.length || typeof value.actionsEnabled !== "boolean") throw new Error("Stato allarmi del servizio non valido.");
  const classes = new Map(), ids = new Set();
  for (const row of value.rows) {
    if (!object(row) || !["none", "single", "reset"].includes(row.acknowledgment) || classes.has(row.className) && classes.get(row.className) !== row.acknowledgment) throw new Error("Classe allarmi del servizio non valida.");
    classes.set(row.className, row.acknowledgment); ids.add(row.id);
    if (![true, false, null].includes(row.active) || typeof row.acknowledged !== "boolean" || typeof row.confirmed !== "boolean" || typeof row.pending !== "boolean" || !["unknown", "good", "bad"].includes(row.quality) || !Number.isSafeInteger(row.revision) || row.revision < 0
      || row.occurrence !== undefined && !text(row.occurrence, 80) || row.diagnostic !== undefined && (typeof row.diagnostic !== "string" || row.diagnostic.length > 1000)
      || [row.activatedAt, row.clearedAt].some((time) => time !== undefined && (!Number.isFinite(time) || Math.abs(time) > 8640000000000000))) throw new Error("Stato allarme del servizio non valido.");
    const pending = row.active === true || !!row.occurrence && (row.acknowledgment !== "none" && !row.acknowledged || row.acknowledgment === "reset" && !row.confirmed);
    if (!row.enabled || row.pending !== pending || row.active === true && !row.occurrence || (row.acknowledged || row.confirmed) && !row.occurrence || row.acknowledgment === "none" && row.acknowledged || row.confirmed && (row.acknowledgment !== "reset" || !row.acknowledged || row.active !== false)) throw new Error("Stato allarme incoerente nel servizio.");
  }
  const definitions = value.rows.map(({ id, name, text, tag, className, priority, area, enabled, trigger }) => ({ id, name, text, tag, className, priority, area, enabled, trigger }));
  if (alarmCatalogIssues({ version: 1, maxHistory: 100, classes: [...classes].map(([name, acknowledgment]) => ({ name, acknowledgment })), alarms: definitions }).length) throw new Error("Catalogo allarmi del servizio non valido.");
  let previous = value.historyDropped;
  const definitionsById = new Map(value.rows.map((row) => [row.id, row]));
  for (const entry of value.history) {
    if (!object(entry) || entry.sequence !== previous + 1 || !ids.has(entry.id) || !text(entry.occurrence, 80) || !text(entry.name) || !text(entry.text, 1000) || !text(entry.alarmClass) || typeof entry.area !== "string" || entry.area.length > 200 || !Number.isInteger(entry.priority) || entry.priority < 0 || entry.priority > 255
      || !["Incoming", "Outgoing", "Acknowledged", "Confirmed"].includes(entry.state) || !Number.isFinite(entry.time) || Math.abs(entry.time) > 8640000000000000 || entry.actor !== undefined && !text(entry.actor)) throw new Error("Storico allarmi del servizio non valido.");
    previous = entry.sequence;
    const definition = definitionsById.get(entry.id);
    if (entry.name !== definition.name || entry.text !== definition.text || entry.alarmClass !== definition.className || entry.priority !== definition.priority || entry.area !== (definition.area ?? "")) throw new Error("Storico allarmi incoerente nel servizio.");
  }
  return copy(value);
}

export function createAlarmEngine(value, variables, options = {}) {
  const catalog = parseAlarmCatalog(value, variables), now = options.now ?? Date.now;
  const definitions = new Map(catalog.alarms.filter((item) => item.enabled).map((item) => [item.id, item]));
  const tags = new Map(variables.map((item) => [item.name, item])), classes = new Map(catalog.classes.map((item) => [item.name, item.acknowledgment]));
  const rows = new Map(), byTag = new Map(), history = [], listeners = new Set(), instanceId = crypto.randomUUID(); let sequence = 0, revision = 0;
  for (const item of definitions.values()) {
    rows.set(item.id, { ...item, acknowledgment: classes.get(item.className), active: null, acknowledged: false, confirmed: false, pending: false, quality: "unknown", revision: 0 });
    if (!byTag.has(item.tag)) byTag.set(item.tag, []);
    byTag.get(item.tag).push(item.id);
  }
  const snapshot = () => copy({ version: 1, instanceId, revision, sequence, rows: [...rows.values()], history, historyDropped: Math.max(0, sequence - history.length) });
  const notify = () => { for (const listener of listeners) try { listener(snapshot()); } catch { /* A viewer cannot alter alarm acquisition. */ } };
  const event = (row, state, actor) => {
    const entry = { sequence: ++sequence, id: row.id, occurrence: row.occurrence, name: row.name, text: row.text, alarmClass: row.className, priority: row.priority, area: row.area ?? "", state, time: now(), ...(actor ? { actor } : {}) };
    history.push(entry); if (history.length > catalog.maxHistory) history.shift();
    try { options.onEvent?.(copy(entry)); } catch { /* Diagnostics must not stop state transitions. */ }
  };
  const pending = (row) => row.active === true || !!row.occurrence && (classes.get(row.className) !== "none" && !row.acknowledged || classes.get(row.className) === "reset" && !row.confirmed);
  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    updateSample(sample) {
      if (!object(sample)) return;
      let changed = false;
      for (const id of byTag.get(sample.tag) ?? []) {
        const row = rows.get(id), before = JSON.stringify(row);
        const good = Number.isInteger(sample.qualityCode) && sample.qualityCode >= 0 && sample.qualityCode <= 65535 && [128, 192].includes(sample.qualityCode & 192) && !sample.lastError;
        if (!good || sample.value === undefined) {
          row.quality = sample.qualityCode === undefined ? "unknown" : "bad";
          row.diagnostic = "Segnale non valido o qualità sconosciuta. Controlla connessione e mapping: l'ultimo stato allarme non viene cancellato.";
        } else {
          try {
            const trigger = row.trigger, type = tags.get(row.tag).dataType.toLowerCase();
            let active;
            if (trigger.kind === "bit") active = bitValue(sample.value, type, trigger.bit) === (trigger.activeWhen === "set");
            else {
              if (typeof sample.value === "boolean" || String(sample.value).trim() === "") throw new Error("Numero mancante.");
              const number = normalizeMqttTagValue(sample.value, type); if (typeof number !== "number" || !Number.isFinite(number)) throw new Error("Numero non valido.");
              active = trigger.kind === "high" ? number > (row.active ? trigger.limit - trigger.hysteresis : trigger.limit) : number < (row.active ? trigger.limit + trigger.hysteresis : trigger.limit);
            }
            row.quality = "good"; delete row.diagnostic;
            if (active !== row.active) {
              row.active = active;
              if (active) {
                if (!row.pending) row.occurrence = (options.occurrenceId ?? (() => crypto.randomUUID()))();
                row.acknowledged = false; row.confirmed = false; delete row.clearedAt; row.activatedAt = now(); event(row, "Incoming");
              } else if (row.occurrence) { row.clearedAt = now(); event(row, "Outgoing"); }
              row.pending = pending(row);
            }
          } catch {
            row.quality = "bad"; row.diagnostic = "Valore incompatibile con il tipo o la soglia. Controlla catalogo e formato del campione PLC.";
          }
        }
        if (JSON.stringify(row) !== before) { row.revision++; changed = true; }
      }
      if (changed) { revision++; notify(); }
    },
    action(command, actor) {
      if (!object(command) || Object.keys(command).some((key) => !["alarmId", "occurrence", "revision", "action"].includes(key)) || !text(actor)) throw new Error("Operatore o comando allarme non valido.");
      const row = rows.get(command.alarmId);
      if (!row || !row.pending || row.occurrence !== command.occurrence || row.revision !== command.revision) throw new Error("L'allarme è cambiato. Aggiorna la vista e selezionalo di nuovo.");
      const model = classes.get(row.className);
      if (command.action === "acknowledge") {
        if (model === "none" || row.acknowledged) throw new Error("Questo allarme non richiede una nuova presa visione.");
        row.acknowledged = true; event(row, "Acknowledged", actor);
      } else if (command.action === "confirm") {
        if (model !== "reset" || row.active !== false || !row.acknowledged || row.quality !== "good") throw new Error("Conferma disponibile solo dopo il rientro valido e la presa visione.");
        row.confirmed = true; event(row, "Confirmed", actor);
      } else throw new Error("Azione allarme non supportata.");
      row.pending = pending(row); row.revision++; revision++; notify(); return snapshot();
    },
  };
}
