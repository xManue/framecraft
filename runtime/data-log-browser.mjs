import { dataLogDeadbandValid, effectiveDataLogDeadband, dataLogDeadbandAllows } from "./data-log-deadband.mjs";
export const hmiLoggingModes = ["on-change", "on-demand", "cyclic"];
export const hmiLogAggregations = ["none", "average", "minimum", "maximum"];
const dataLogString = (value, fallback = "") => typeof value === "string" ? value : fallback;
const dataLogNumber = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const dataLogOptionalNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const dataLogBool = (value, fallback) => typeof value === "boolean" ? value : fallback;
function normalizeDataLogDeadband(value) {
    if (!dataLogDeadbandValid(value))
        throw new Error("Filtro variazioni: scegli Nessuno, Assoluto o Percentuale e una soglia finita maggiore o uguale a zero.");
    return { mode: value.mode, value: value.value };
}
function normalizeLoggingTag(value, index) {
    const item = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const mode = hmiLoggingModes.includes(item.mode) ? item.mode : "on-change";
    const aggregation = hmiLogAggregations.includes(item.aggregation) ? item.aggregation : "none";
    const condition = ["changed", "rising", "falling", "equals"].includes(String(item.triggerCondition)) ? item.triggerCondition : "changed";
    return {
        id: dataLogString(item.id, `logged-tag-${index + 1}`).trim() || `logged-tag-${index + 1}`,
        name: dataLogString(item.name, `Variabile ${index + 1}`).trim() || `Variabile ${index + 1}`,
        tag: dataLogString(item.tag).trim(),
        mode,
        cycleMs: Math.max(500, Math.round(dataLogNumber(item.cycleMs, 1_000))),
        triggerTag: dataLogString(item.triggerTag).trim() || undefined,
        triggerCondition: condition,
        triggerValue: dataLogString(item.triggerValue) || undefined,
        includeUnchanged: dataLogBool(item.includeUnchanged, mode === "cyclic"),
        smoothingSamples: Math.max(1, Math.min(64, Math.round(dataLogNumber(item.smoothingSamples, 1)))),
        aggregation,
        aggregationWindowMs: Math.max(500, Math.round(dataLogNumber(item.aggregationWindowMs, 60_000))),
        minimum: dataLogOptionalNumber(item.minimum),
        maximum: dataLogOptionalNumber(item.maximum),
        ...(item.deadband !== undefined ? { deadband: normalizeDataLogDeadband(item.deadband) } : {}),
    };
}
function normalizeDataLog(value, index) {
    const item = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
        id: dataLogString(item.id, `data-log-${index + 1}`).trim() || `data-log-${index + 1}`,
        name: dataLogString(item.name, `Data log ${index + 1}`).trim() || `Data log ${index + 1}`,
        enabled: dataLogBool(item.enabled, true),
        storage: item.storage === "runtime" ? "runtime" : item.storage === "memory" ? "memory" : "browser-local",
        retentionMs: Math.max(60_000, Math.round(dataLogNumber(item.retentionMs, 7 * 86_400_000))),
        maxEntries: Math.max(100, Math.round(dataLogNumber(item.maxEntries, 100_000))),
        segmentDurationMs: Math.max(60_000, Math.round(dataLogNumber(item.segmentDurationMs, 86_400_000))),
        tags: Array.isArray(item.tags) ? item.tags.map(normalizeLoggingTag) : [],
        ...(item.deadband !== undefined ? { deadband: normalizeDataLogDeadband(item.deadband) } : {}),
    };
}
export function emptyHmiDataLogCatalog(projectKey = "framecraft-panel") {
    return { version: 1, projectKey, logs: [] };
}
export function defaultHmiDataLog(index = 0) {
    return normalizeDataLog({}, index);
}
export function defaultHmiLoggingTag(index = 0) {
    return normalizeLoggingTag({}, index);
}
export function parseHmiDataLogCatalog(value) {
    let raw = value;
    if (typeof value === "string") {
        if (!value.trim())
            return emptyHmiDataLogCatalog();
        raw = JSON.parse(value);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Il catalogo Data Log deve essere un oggetto JSON.");
    const item = raw;
    return {
        version: 1,
        projectKey: dataLogString(item.projectKey, "framecraft-panel").trim() || "framecraft-panel",
        logs: Array.isArray(item.logs) ? item.logs.map(normalizeDataLog) : [],
    };
}
function hmiDataLogStorageKey(catalog, explicit) {
    return explicit || `framecraft:data-logs:${catalog.projectKey}`;
}
function hmiDataLogTime(status, fallback) {
    if (typeof status?.timeStamp === "number" && Number.isFinite(status.timeStamp))
        return status.timeStamp;
    if (typeof status?.timeStamp === "string") {
        const parsed = Date.parse(status.timeStamp);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return fallback;
}
function hmiLogTriggerMatches(condition, previous, current, operand) {
    if (condition === "changed")
        return previous !== current;
    const before = !/^(?:|0|false|off|no)$/i.test(previous ?? "");
    const after = !/^(?:|0|false|off|no)$/i.test(current);
    if (condition === "rising")
        return !before && after;
    if (condition === "falling")
        return before && !after;
    return current === (operand ?? "1");
}
function hmiAggregateValue(kind, values) {
    if (kind === "minimum")
        return Math.min(...values);
    if (kind === "maximum")
        return Math.max(...values);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
export function createHmiDataLogRuntime(input, options = {}) {
    const catalog = parseHmiDataLogCatalog(input);
    catalog.logs = catalog.logs.flatMap(log => log.storage !== "runtime" ? [log] : options.servicePreview ? [{ ...log, storage: "memory" }] : []);
    const now = options.now ?? (() => Date.now());
    const storage = options.storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    const storageKey = hmiDataLogStorageKey(catalog, options.storageKey);
    const samples = new Map();
    const previousValues = new Map();
    const previousQualities = new Map();
    const deadbandReferences = new Map();
    const smoothValues = new Map();
    const aggregates = new Map();
    const listeners = new Set();
    const intervals = new Set();
    let reader;
    let persistTimer;
    const keyOf = (logId, tagId) => `${logId}\u0000${tagId}`;
    const report = (message) => (options.onError ?? console.warn)(message);
    const notify = () => { for (const listener of listeners)
        listener(); };
    const load = () => {
        if (!storage)
            return;
        try {
            const raw = storage.getItem(storageKey);
            if (!raw)
                return;
            const parsed = JSON.parse(raw);
            for (const sample of Array.isArray(parsed.samples) ? parsed.samples : []) {
                if (!sample || typeof sample !== "object" || !Number.isFinite(sample.time) || typeof sample.value !== "string")
                    continue;
                const log = catalog.logs.find((candidate) => candidate.id === sample.logId && candidate.tags.some((tag) => tag.id === sample.loggedTagId));
                if (!log || log.storage !== "browser-local")
                    continue;
                const key = keyOf(sample.logId, sample.loggedTagId);
                const list = samples.get(key) ?? [];
                list.push(sample);
                samples.set(key, list);
            }
        }
        catch (error) {
            report(`Data Log: archivio locale non leggibile (${error instanceof Error ? error.message : String(error)}).`);
        }
    };
    const persist = () => {
        if (!storage || !catalog.logs.some((log) => log.storage === "browser-local"))
            return;
        try {
            const kept = [...samples.values()].flat().filter((sample) => catalog.logs.find((log) => log.id === sample.logId)?.storage === "browser-local");
            storage.setItem(storageKey, JSON.stringify({ version: 1, savedAt: now(), samples: kept }));
        }
        catch (error) {
            report(`Data Log: impossibile salvare l'archivio locale (${error instanceof Error ? error.message : String(error)}).`);
        }
    };
    const schedulePersist = () => {
        if (persistTimer !== undefined)
            return;
        persistTimer = setTimeout(() => { persistTimer = undefined; persist(); }, 50);
    };
    const trimLog = (log, at) => {
        const keys = log.tags.map((tag) => keyOf(log.id, tag.id));
        const cutoff = at - log.retentionMs;
        for (const key of keys) {
            const list = samples.get(key);
            if (!list)
                continue;
            while (list.length && list[0].time < cutoff)
                list.shift();
        }
        const combined = keys.flatMap((key) => (samples.get(key) ?? []).map((sample) => ({ key, sample }))).sort((a, b) => a.sample.time - b.sample.time);
        for (const item of combined.slice(0, Math.max(0, combined.length - log.maxEntries)))
            samples.get(item.key)?.shift();
    };
    const append = (log, tag, value, status, at) => {
        const key = keyOf(log.id, tag.id);
        const list = samples.get(key) ?? [];
        if (!tag.includeUnchanged && list.at(-1)?.value === value && list.at(-1)?.qualityCode === status?.qualityCode)
            return 0;
        list.push({ logId: log.id, loggedTagId: tag.id, tag: tag.tag, time: at, value, qualityCode: status?.qualityCode, segmentStart: Math.floor(at / log.segmentDurationMs) * log.segmentDurationMs });
        samples.set(key, list);
        trimLog(log, at);
        schedulePersist();
        notify();
        return 1;
    };
    const process = (log, tag, raw, status, at) => {
        const key = keyOf(log.id, tag.id);
        if (status?.qualityCode !== undefined && status.qualityCode !== 192) {
            const pending = aggregates.get(key);
            let written = 0;
            if (pending?.values.length)
                written += append(log, tag, String(hmiAggregateValue(tag.aggregation, pending.values)), pending.status, at);
            aggregates.delete(key);
            smoothValues.delete(key);
            deadbandReferences.delete(key);
            return written + append(log, tag, raw, status, at);
        }
        const numeric = Number(raw);
        if ((tag.minimum !== undefined || tag.maximum !== undefined || tag.smoothingSamples > 1 || tag.aggregation !== "none") && !Number.isFinite(numeric))
            return 0;
        if (tag.minimum !== undefined && numeric < tag.minimum)
            return 0;
        if (tag.maximum !== undefined && numeric > tag.maximum)
            return 0;
        const policy = effectiveDataLogDeadband(log, tag), reference = deadbandReferences.get(key);
        if (policy && !dataLogDeadbandAllows(reference?.qualityCode === status?.qualityCode ? reference?.value : undefined, raw, policy))
            return 0;
        if (policy)
            deadbandReferences.set(key, { value: raw, qualityCode: status?.qualityCode });
        let value = raw;
        if (Number.isFinite(numeric) && tag.smoothingSamples > 1) {
            const history = smoothValues.get(key) ?? [];
            history.push(numeric);
            while (history.length > tag.smoothingSamples)
                history.shift();
            smoothValues.set(key, history);
            value = String(history.reduce((sum, item) => sum + item, 0) / history.length);
        }
        if (tag.aggregation === "none")
            return append(log, tag, value, status, at);
        const bucketStart = Math.floor(at / tag.aggregationWindowMs) * tag.aggregationWindowMs;
        const pending = aggregates.get(key);
        let written = 0;
        if (pending && pending.start !== bucketStart && pending.values.length)
            written += append(log, tag, String(hmiAggregateValue(tag.aggregation, pending.values)), pending.status, pending.start + tag.aggregationWindowMs);
        const bucket = !pending || pending.start !== bucketStart ? { start: bucketStart, values: [], status, rawTag: tag.tag } : pending;
        bucket.values.push(Number(value));
        bucket.status = status;
        aggregates.set(key, bucket);
        return written;
    };
    const sampleDefinition = (log, tag, at = now()) => {
        const snapshot = reader?.();
        const raw = snapshot?.values[tag.tag];
        if (raw === undefined)
            return 0;
        return process(log, tag, raw, snapshot?.status?.[tag.tag], hmiDataLogTime(snapshot?.status?.[tag.tag], at));
    };
    const flushAggregates = (at = now(), includePartial = false) => {
        let written = 0;
        for (const log of catalog.logs.filter((item) => item.enabled))
            for (const tag of log.tags.filter((item) => item.aggregation !== "none")) {
                const key = keyOf(log.id, tag.id);
                const pending = aggregates.get(key);
                if (!pending || (!includePartial && at < pending.start + tag.aggregationWindowMs) || !pending.values.length)
                    continue;
                written += append(log, tag, String(hmiAggregateValue(tag.aggregation, pending.values)), pending.status, includePartial ? at : pending.start + tag.aggregationWindowMs);
                aggregates.delete(key);
            }
        return written;
    };
    const tick = (at = now()) => flushAggregates(at);
    const updateTag = (tagName, value, status) => {
        const current = String(value);
        const previous = previousValues.get(tagName);
        previousValues.set(tagName, current);
        const qualityChanged = !previousQualities.has(tagName) || previousQualities.get(tagName) !== status?.qualityCode;
        previousQualities.set(tagName, status?.qualityCode);
        let written = 0;
        for (const log of catalog.logs.filter((item) => item.enabled))
            for (const tag of log.tags) {
                if (tag.mode === "on-change" && tag.tag === tagName && (previous !== current || qualityChanged))
                    written += process(log, tag, current, status, hmiDataLogTime(status, now()));
                if (tag.mode === "on-demand" && tag.triggerTag === tagName && hmiLogTriggerMatches(tag.triggerCondition ?? "changed", previous, current, tag.triggerValue))
                    written += sampleDefinition(log, tag);
            }
        return written;
    };
    load();
    return {
        start(read) {
            reader = read;
            for (const log of catalog.logs.filter((item) => item.enabled))
                for (const tag of log.tags.filter((item) => item.mode === "cyclic")) {
                    intervals.add(setInterval(() => { sampleDefinition(log, tag); tick(); }, Math.max(500, tag.cycleMs)));
                }
            intervals.add(setInterval(() => tick(), 500));
        },
        stop() {
            for (const timer of intervals)
                clearInterval(timer);
            intervals.clear();
            flushAggregates(now(), true);
            if (persistTimer !== undefined) {
                clearTimeout(persistTimer);
                persistTimer = undefined;
            }
            persist();
            reader = undefined;
        },
        updateTag,
        updateSnapshot(values, status = {}) {
            let written = 0;
            for (const [tag, value] of Object.entries(values))
                if (previousValues.get(tag) !== value || !previousQualities.has(tag) || previousQualities.get(tag) !== status[tag]?.qualityCode)
                    written += updateTag(tag, value, status[tag]);
            return written;
        },
        request(logId, loggedTagId) {
            let written = 0;
            for (const log of catalog.logs.filter((item) => item.enabled && (!logId || item.id === logId)))
                for (const tag of log.tags.filter((item) => item.mode === "on-demand" && (!loggedTagId || item.id === loggedTagId)))
                    written += sampleDefinition(log, tag);
            return written;
        },
        tick,
        query(logId, loggedTagId, from = Number.NEGATIVE_INFINITY, to = Number.POSITIVE_INFINITY, includePrevious = false) {
            const result = [];
            let previous;
            for (const sample of samples.get(keyOf(logId, loggedTagId)) ?? []) {
                if (sample.time >= from && sample.time <= to)
                    result.push({ ...sample });
                else if (includePrevious && sample.time < from && (!previous || sample.time >= previous.time))
                    previous = sample;
            }
            if (previous && from <= to)
                result.unshift({ ...previous });
            return result;
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        flush() { flushAggregates(now(), true); if (persistTimer !== undefined) {
            clearTimeout(persistTimer);
            persistTimer = undefined;
        } persist(); },
        clear(logId) {
            for (const log of catalog.logs.filter(item => !logId || item.id === logId))
                for (const tag of log.tags)
                    deadbandReferences.delete(keyOf(log.id, tag.id));
            if (logId)
                for (const log of catalog.logs.filter((item) => item.id === logId))
                    for (const tag of log.tags)
                        samples.delete(keyOf(log.id, tag.id));
            else
                samples.clear();
            schedulePersist();
            notify();
        },
        sampleCount(logId) { return [...samples.values()].flat().filter((sample) => !logId || sample.logId === logId).length; },
    };
}
