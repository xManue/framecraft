export function createHmiTrendPreview(view, options, renderers) {
  const doc = view.document, hosts = new Map(), cache = new Map(), queued = new Map(), pending = new Map(), pendingKeys = new Set(), failed = new Map(), exports = new Map();
  let packet, origin, disposed = false, sequence = 0, scheduled = false;
  const active = () => !disposed && options.active() && packet?.pageId === options.pageId();
  const epoch = () => packet ? `${packet.lease}:${packet.historyRevision}` : "";
  const accepts = event => !disposed && event.source === view.parent && !!event.origin && event.origin !== "null" && (!origin || origin === event.origin) && event.data?.pageId === options.pageId();
  const send = data => { if (active() && origin) view.parent.postMessage({ ...data, pageId: options.pageId(), lease: packet.lease, historyRevision: packet.historyRevision }, origin); };
  const clearRequests = (includeExports = true) => {
    for (const request of pending.values()) view.clearTimeout(request.timer);
    if (includeExports) { for (const request of exports.values()) view.clearTimeout(request.timer); exports.clear(); }
    pending.clear(); pendingKeys.clear(); queued.clear(); scheduled = false;
  };
  const capture = host => ({ nodes: [...host.childNodes], title: host.getAttribute("title"), description: host.getAttribute("aria-description"), owned: undefined, renderedTitle: undefined, renderedDescription: undefined });
  const restoreHost = (host, before, clearState) => {
    const replaced = before.owned && !host.contains(before.owned);
    const replacement = replaced ? [...host.childNodes] : undefined;
    if (clearState) { renderers.time.clear(host); renderers.xy.clear(host); }
    if (replacement) host.replaceChildren(...replacement);
    if (!replaced && before.owned) host.replaceChildren(...before.nodes);
    for (const [name, initial, rendered] of [["title", before.title, before.renderedTitle], ["aria-description", before.description, before.renderedDescription]]) {
      if (rendered !== undefined && host.getAttribute(name) !== rendered) continue;
      if (initial === null) host.removeAttribute(name); else host.setAttribute(name, initial);
    }
  };
  const restore = (clearState = false) => { for (const [host, before] of hosts) restoreHost(host, before, clearState); hosts.clear(); };
  const status = (host, text) => {
    const root = host.querySelector(':scope > [data-hmi-trend-root], :scope > [data-hmi-function-trend-root]'); if (!root) return;
    let note = root.querySelector(':scope > [data-framecraft-trend-preview-note]');
    if (!note) { note = doc.createElement("p"); note.dataset.framecraftTrendPreviewNote = ""; note.setAttribute("role", "status"); Object.assign(note.style, { margin: "0", padding: "4px 8px", font: "inherit" }); root.append(note); }
    const next = text || "PROVA LOCALE · nessun PLC collegato"; if (note.textContent !== next) note.textContent = next;
  };
  const flush = () => {
    scheduled = false; if (!active()) { queued.clear(); return; }
    const queries = [...queued.values()].filter(query => {
      const found = cache.get(query.key);
      if (found && found.from <= query.from && found.to >= query.to) { queued.delete(query.key); return false; }
      return !pendingKeys.has(query.key);
    });
    for (let index = 0; index < queries.length; index += 128) {
      const batch = queries.slice(index, index + 128), requestId = `h${++sequence}`;
      if (pending.size >= 8) { for (const query of batch) { failed.set(query.key, "Troppe richieste di storico. Riduci i controlli sulla pagina o riprova con Vista originale."); queued.delete(query.key); } continue; }
      for (const query of batch) { pendingKeys.add(query.key); queued.delete(query.key); }
      const timer = view.setTimeout(() => {
        if (!pending.has(requestId)) return;
        pending.delete(requestId); for (const query of batch) { pendingKeys.delete(query.key); queued.delete(query.key); failed.set(query.key, "Lo storico locale non risponde. Usa Vista originale per riprovare oppure apri la diagnostica."); }
        render(false);
      }, 3000);
      pending.set(requestId, { queries: batch, timer }); send({ type: "framecraft:trend-history", requestId, queries: batch });
    }
  };
  const schedule = () => { if (!scheduled) { scheduled = true; const current = epoch(); view.queueMicrotask(() => { if (current === epoch()) flush(); }); } };
  const history = (source, from, to, host) => {
    if (!active() || !source.logId || !source.loggedTagId || !Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];
    const key = JSON.stringify([source.logId, source.loggedTagId]), found = cache.get(key);
    if (failed.has(key)) { status(host, failed.get(key)); return []; }
    if (found && found.from <= from && found.to >= to) return found.samples.filter(sample => sample.time >= from && sample.time <= to);
    const old = queued.get(key), query = { key, logId: source.logId, loggedTagId: source.loggedTagId,
      from: Math.min(found?.from ?? from, old?.from ?? from, Math.floor(from / 1000) * 1000),
      to: Math.max(found?.to ?? to, old?.to ?? to, Math.ceil(to / 1000) * 1000 + 1000) };
    queued.set(key, query); schedule(); status(host, "Caricamento dello storico locale… nessun PLC collegato.");
    return found?.samples.filter(sample => sample.time >= from && sample.time <= to) ?? [];
  };
  const exportCsv = (host, fileName, content) => {
    if (!active()) return; const requestId = `c${++sequence}`;
    status(host, "Preparazione del CSV dei dati di prova…");
    const timer = view.setTimeout(() => { exports.delete(requestId); status(host, "Il CSV non è stato preparato. Riprova oppure apri la diagnostica."); }, 3000);
    exports.set(requestId, { host, timer }); send({ type: "framecraft:trend-csv", requestId, instanceId: options.instanceId(host), fileName, content });
  };
  function render(sample = packet?.sample, onlyChanged = false) {
    if (!active()) { clearRequests(); restore(); return; }
    for (const [host, before] of hosts) {
      if (!host.isConnected || before.owned && !host.contains(before.owned)) { restoreHost(host, before, true); hosts.delete(host); }
    }
    for (const host of doc.querySelectorAll('[data-hmi-trend], [data-hmi-function-trend]')) {
      if (!hosts.has(host)) hosts.set(host, capture(host));
      const before = hosts.get(host), signature = host.getAttribute("data-hmi-trend") ?? host.getAttribute("data-hmi-function-trend");
      if (onlyChanged && before.owned && host.contains(before.owned) && before.signature === signature) continue;
      const common = { now: packet.now, sample, status: packet.status, sources: packet.sources, exportCsv: (name, content) => exportCsv(host, name, content) };
      if (host.hasAttribute("data-hmi-trend")) renderers.time.render(host, packet.values, { ...common, history: (source, from, to) => history(source, from, to, host).flatMap(sample => {
        const value = Number(sample.value); return sample.value.trim() && Number.isFinite(value) ? [{ time: sample.time, value, qualityCode: sample.qualityCode }] : [];
      }) });
      else renderers.xy.render(host, packet.values, { ...common, history: (source, from, to) => history(source, from, to, host) });
      const root = host.querySelector(':scope > [data-hmi-trend-root], :scope > [data-hmi-function-trend-root]');
      if (!root) continue; before.owned = root; before.signature = signature;
      const hint = [before.title, "PROVA LOCALE · nessun PLC collegato"].filter(Boolean).join("\n");
      if (host.title !== hint) host.title = hint; if (host.getAttribute("aria-description") !== hint) host.setAttribute("aria-description", hint);
      before.renderedTitle = hint; before.renderedDescription = hint;
      if (!queued.size && !pending.size && !failed.size && !exports.size) status(host);
    }
  }
  const guard = event => {
    const root = event.target?.closest?.('[data-hmi-trend-root], [data-hmi-function-trend-root]'), host = root?.parentElement;
    if (!host || hosts.get(host)?.owned !== root) return;
    if (!active() || options.allowed && !options.allowed(host)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (event.type === "click" && event.target?.closest?.('[data-hmi-trend-action="original"], [data-hmi-fx-action="original"]')) { failed.clear(); queued.clear(); cache.clear(); }
  };
  for (const type of ["click", "change", "pointerdown", "keydown"]) doc.addEventListener(type, guard, true);
  return {
    accepts,
    receive(event) {
      if (!accepts(event)) return; const data = event.data;
      if (data.type === "framecraft:trend-preview") {
        if (!data.values || typeof data.values !== "object" || Array.isArray(data.values) || !Number.isFinite(data.now) || typeof data.lease !== "string" || !Number.isSafeInteger(data.historyRevision) || !Array.isArray(data.sources?.logs) || !Array.isArray(data.sources?.tags)) return;
        origin = event.origin; const changed = packet?.lease !== data.lease || packet?.historyRevision !== data.historyRevision;
        const newLease = packet?.lease !== data.lease;
        packet = data; if (changed) { clearRequests(newLease); cache.clear(); failed.clear(); } render();
      } else if (data.type === "framecraft:trend-history-result" && active() && data.lease === packet.lease && data.historyRevision === packet.historyRevision) {
        const request = pending.get(data.requestId); if (!request) return;
        view.clearTimeout(request.timer); pending.delete(data.requestId);
        for (const query of request.queries) {
          pendingKeys.delete(query.key); const answer = Array.isArray(data.results) ? data.results.find(item => item?.key === query.key) : undefined;
          if (!answer || answer.error || !Array.isArray(answer.samples) || answer.samples.some(sample => !sample || !Number.isFinite(sample.time) || typeof sample.value !== "string")) failed.set(query.key, answer?.error || "Lo storico locale non è disponibile. Controlla Data Log e variabile archiviata.");
          else cache.set(query.key, { from: query.from, to: query.to, samples: answer.samples });
        }
        render(false); if (queued.size) schedule();
      } else if (data.type === "framecraft:trend-csv-result" && active() && data.lease === packet.lease) {
        const request = exports.get(data.requestId); if (!request) return;
        view.clearTimeout(request.timer); exports.delete(data.requestId); status(request.host, data.error || "CSV preparato: la finestra dell’app gestisce il salvataggio dei dati di prova.");
      }
    },
    refresh() { render(false, true); },
    reset() { packet = undefined; clearRequests(); cache.clear(); failed.clear(); restore(true); },
    dispose() { disposed = true; packet = undefined; clearRequests(); cache.clear(); failed.clear(); restore(true); for (const type of ["click", "change", "pointerdown", "keydown"]) doc.removeEventListener(type, guard, true); },
  };
}
