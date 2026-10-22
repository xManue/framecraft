import { normalizeMqttTagValue } from "./connection-config.mjs";
const integerTypes = new Map(Object.entries({ byte: [8, false], usint: [8, false], sint: [8, true], word: [16, false], uint: [16, false], int: [16, true], dword: [32, false], udint: [32, false], dint: [32, true], lword: [64, false], ulint: [64, false], lint: [64, true] }));
const analogTypes = ["real", "lreal", "float", "double", "sint", "usint", "int", "uint", "dint", "udint"];
const analogKinds = ["high", "low", "high-equal", "low-equal", "equal", "not-equal"];
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
  fields(catalog, ["version", "classes", "alarms", "maxHistory", "archive"], "catalog");
  if (catalog.archive !== undefined && (!object(catalog.archive) || Object.keys(catalog.archive).some(key => !["enabled", "maxRecords"].includes(key)) || typeof catalog.archive.enabled !== "boolean" || !Number.isInteger(catalog.archive.maxRecords) || catalog.archive.maxRecords < 1000 || catalog.archive.maxRecords > 500000)) add("archive", "Archivio su disco: scegli abilitazione e limite da 1000 a 500000 eventi. Nessuna cancellazione automatica.");
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
    } else if (analogKinds.includes(trigger.kind)) {
      if (variables && !analogTypes.includes(type)) add(path + ".tag", "Una soglia richiede un numero scalare fino a 32 bit o Real/LReal; i 64 bit esatti non si convertono in Number.");
      if (object(trigger.limit)) {
        if (Object.keys(trigger.limit).length !== 1 || !text(trigger.limit.tag)) add(path + ".trigger.limit", "Scegli un solo segnale dichiarato come soglia. Non è previsto un valore sostitutivo.");
        const limits = variables?.filter(variable => variable.name === trigger.limit.tag && !variable.detected);
        if (variables && (limits.length !== 1 || !["read", "read-write"].includes(limits[0].access) || !analogTypes.includes(limits[0].dataType?.toLowerCase()))) add(path + ".trigger.limit", "La soglia deve essere un segnale numerico dichiarato una sola volta e leggibile, fino a 32 bit o Real/LReal.");
      } else if (!Number.isFinite(trigger.limit) || !Number.isFinite(trigger.limit + trigger.hysteresis) || !Number.isFinite(trigger.limit - trigger.hysteresis)) add(path + ".trigger.limit", "Compila una soglia finita e un'isteresi finita, non negativa.");
      if (!Number.isFinite(trigger.hysteresis) || trigger.hysteresis < 0) add(path + ".trigger.hysteresis", "L'isteresi deve essere un numero finito, non negativo.");
      if (["equal", "not-equal"].includes(trigger.kind) && trigger.hysteresis !== 0) add(path + ".trigger.hysteresis", "Uguale e diverso richiedono isteresi zero: il confronto è esatto, senza tolleranza implicita.");
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

const dependencyTags = alarm => alarm.trigger.kind !== "bit" && object(alarm.trigger.limit) ? [...new Set([alarm.tag, alarm.trigger.limit.tag])] : [alarm.tag];
export function alarmDependencyTags(catalog) { return [...new Set(catalog.alarms.filter(alarm => alarm.enabled).flatMap(dependencyTags))]; }

function sampleQuality(sample) {
  if (!sample) return "unknown";
  const valid = Number.isInteger(sample.qualityCode) && sample.qualityCode >= 0 && sample.qualityCode <= 65535 && [128, 192].includes(sample.qualityCode & 192) && !sample.lastError && ["string", "number", "boolean"].includes(typeof sample.value);
  return valid ? "good" : sample.qualityCode === undefined && !sample.lastError ? "unknown" : "bad";
}
function numericValue(value, type) {
  if (!["number", "string"].includes(typeof value) || String(value).trim() === "") throw new Error("Numero mancante.");
  const number = normalizeMqttTagValue(value, type);
  if (typeof number !== "number" || !Number.isFinite(number)) throw new Error("Numero non valido.");
  return number;
}
function analogActive(number, limit, trigger, wasActive) {
  if (!Number.isFinite(limit + trigger.hysteresis) || !Number.isFinite(limit - trigger.hysteresis)) throw new Error("Soglia fuori intervallo.");
  const high = wasActive ? limit - trigger.hysteresis : limit, low = wasActive ? limit + trigger.hysteresis : limit;
  switch (trigger.kind) {
    case "high": return number > high;
    case "low": return number < low;
    case "high-equal": return number >= high;
    case "low-equal": return number <= low;
    case "equal": return number === limit;
    case "not-equal": return number !== limit;
    default: throw new Error("Confronto non supportato.");
  }
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

export { alarmStateLabel } from "./alarm-labels.mjs";

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
  const tags = new Map(variables.filter(item => !item.detected).map((item) => [item.name, item])), classes = new Map(catalog.classes.map((item) => [item.name, item.acknowledgment]));
  const rows = new Map(), byTag = new Map(), samples = new Map(), history = [], pendingEvents = [], listeners = new Set(), instanceId = crypto.randomUUID(); let sequence = 0, revision = 0;
  for (const item of definitions.values()) {
    rows.set(item.id, { ...item, acknowledgment: classes.get(item.className), active: null, acknowledged: false, confirmed: false, pending: false, quality: "unknown", revision: 0 });
    for (const tag of dependencyTags(item)) { if (!byTag.has(tag)) byTag.set(tag, []); byTag.get(tag).push(item.id); }
  }
  const snapshot = () => copy({ version: 1, instanceId, revision, sequence, rows: [...rows.values()], history, historyDropped: Math.max(0, sequence - history.length) });
  const notify = () => { if (pendingEvents.length) { const events = pendingEvents.splice(0); try { options.onEvents?.(copy(events)); } catch { /* Archive failure cannot stop alarm acquisition. */ } } for (const listener of listeners) try { listener(snapshot()); } catch { /* A viewer cannot alter alarm acquisition. */ } };
  const event = (row, state, actor) => {
    const entry = { sequence: ++sequence, id: row.id, occurrence: row.occurrence, name: row.name, text: row.text, alarmClass: row.className, priority: row.priority, area: row.area ?? "", state, time: now(), ...(actor ? { actor } : {}) };
    history.push(entry); pendingEvents.push(entry); if (history.length > catalog.maxHistory) history.shift();
    try { options.onEvent?.(copy(entry)); } catch { /* Diagnostics must not stop state transitions. */ }
  };
  const pending = (row) => row.active === true || !!row.occurrence && (classes.get(row.className) !== "none" && !row.acknowledged || classes.get(row.className) === "reset" && !row.confirmed);
  function updateSamples(batch) {
    if (!Array.isArray(batch) || batch.length > 4000) throw new Error("Gruppo campioni allarmi non valido: massimo 4000 segnali.");
    const affected = new Set();
    for (const sample of batch) {
      if (!object(sample) || !byTag.has(sample.tag)) continue;
      samples.set(sample.tag, { value: sample.value, qualityCode: sample.qualityCode, lastError: sample.lastError });
      for (const id of byTag.get(sample.tag)) affected.add(id);
    }
    let changed = false;
    for (const id of affected) {
      const row = rows.get(id), before = JSON.stringify(row), trigger = row.trigger, sample = samples.get(row.tag);
      const dynamic = trigger.kind !== "bit" && object(trigger.limit), limitSample = dynamic ? samples.get(trigger.limit.tag) : undefined;
      const signalQuality = sampleQuality(sample), limitQuality = dynamic ? sampleQuality(limitSample) : "good";
      if (signalQuality !== "good" || limitQuality !== "good") {
        row.quality = [signalQuality, limitQuality].includes("bad") ? "bad" : "unknown";
        row.diagnostic = signalQuality !== "good" ? "Segnale non valido o qualità sconosciuta. Controlla connessione e mapping: l'ultimo stato allarme non viene cancellato." : "Soglia PLC non disponibile o qualità non valida. Controlla il segnale usato come soglia: l'ultimo stato allarme non viene cancellato, senza valori sostitutivi.";
      } else {
        let active;
        try {
          const type = tags.get(row.tag).dataType.toLowerCase();
          if (trigger.kind === "bit") active = bitValue(sample.value, type, trigger.bit) === (trigger.activeWhen === "set");
          else {
            const number = numericValue(sample.value, type);
            let limit = trigger.limit;
            if (dynamic) {
              try { limit = numericValue(limitSample.value, tags.get(trigger.limit.tag).dataType.toLowerCase()); }
              catch { row.diagnostic = "Valore della soglia PLC incompatibile con il tipo dichiarato. Correggi il mapping o il campione; l'ultimo stato allarme non viene cancellato."; }
            }
            if (!dynamic || typeof limit === "number") active = analogActive(number, limit, trigger, row.active === true);
          }
          if (active === undefined) row.quality = "bad";
          else { row.quality = "good"; delete row.diagnostic; }
        } catch {
          row.quality = "bad"; row.diagnostic = "Valore incompatibile con il tipo o la soglia. Controlla catalogo e formato del campione PLC.";
        }
        if (row.quality === "good" && active !== row.active) {
          row.active = active;
          if (active) {
            if (!row.pending) row.occurrence = (options.occurrenceId ?? (() => crypto.randomUUID()))();
            row.acknowledged = false; row.confirmed = false; delete row.clearedAt; row.activatedAt = now(); event(row, "Incoming");
          } else if (row.occurrence) { row.clearedAt = now(); event(row, "Outgoing"); }
          row.pending = pending(row);
        }
      }
      if (JSON.stringify(row) !== before) { row.revision++; changed = true; }
    }
    if (changed) { revision++; notify(); }
  }
  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    updateSample(sample) { updateSamples([sample]); },
    updateSamples,
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
