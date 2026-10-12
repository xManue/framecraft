import type { HmiDataLogCatalog, HmiDataLogRuntime } from "./hmiDataLogs";
import type { HmiScriptTagStatus } from "./hmiScript";

export interface HmiTrendHistoryQuery { key: string; logId: string; loggedTagId: string; from: number; to: number }
export interface HmiTrendHistoryMessage { type: "framecraft:trend-history"; pageId: string; lease: string; historyRevision: number; requestId: string; queries: HmiTrendHistoryQuery[] }
export interface HmiTrendCsvMessage { type: "framecraft:trend-csv"; pageId: string; lease: string; historyRevision: number; requestId: string; instanceId: string; fileName: string; content: string }

export function createHmiTrendPreviewModel(runtime: HmiDataLogRuntime, catalog: HmiDataLogCatalog) {
  const lease = crypto.randomUUID(); let revision = 0;
  const sources = { tags: [] as string[], logs: catalog.logs.map(log => ({ id: log.id, name: log.name, tags: log.tags.map(tag => ({ id: tag.id, name: tag.name, tag: tag.tag })) })) };
  return {
    runtime, catalog, lease,
    get revision() { return revision; },
    changed() { revision++; },
    snapshot(simulation: { on: boolean; values: Record<string, string>; status: Record<string, HmiScriptTagStatus> }, tags: readonly string[]) {
      return { type: "framecraft:trend-preview", lease, historyRevision: revision, now: Date.now(), sample: simulation.on,
        values: simulation.on ? simulation.values : {}, status: simulation.on ? simulation.status : {}, sources: { ...sources, tags } };
    },
    history(message: HmiTrendHistoryMessage) {
      if (message.lease !== lease || message.historyRevision !== revision || typeof message.requestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(message.requestId)
        || !Array.isArray(message.queries) || !message.queries.length || message.queries.length > 128) return undefined;
      const results = message.queries.map(query => {
        const valid = query && typeof query.key === "string" && query.key === JSON.stringify([query.logId, query.loggedTagId]) && typeof query.logId === "string" && typeof query.loggedTagId === "string"
          && Number.isFinite(query.from) && Number.isFinite(query.to) && Math.abs(query.from) <= 8.64e15 && Math.abs(query.to) <= 8.64e15 && query.from <= query.to
          && catalog.logs.some(log => log.id === query.logId && log.tags.some(tag => tag.id === query.loggedTagId));
        if (!valid) return { key: query?.key, error: "Scegli un Data Log e una variabile archiviata validi per la curva." };
        return { key: query.key, samples: runtime.query(query.logId, query.loggedTagId, query.from, query.to, true).map(sample => ({ time: sample.time, value: sample.value, qualityCode: sample.qualityCode })) };
      });
      return { type: "framecraft:trend-history-result", lease, historyRevision: revision, requestId: message.requestId, results };
    },
  };
}

export function downloadHmiTrendPreviewCsv(fileName: string, content: string, view: Window = window) {
  if (typeof content !== "string" || content.length > 64 * 1024 * 1024) throw new Error("Il CSV di prova è troppo grande. Riduci l’intervallo visualizzato e riprova.");
  const name = typeof fileName === "string" ? fileName.replace(/\.csv$/i, "").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 120) : "trend";
  const urlApi = (view as Window & typeof globalThis).URL;
  if (typeof urlApi?.createObjectURL !== "function") throw new Error("La finestra non può preparare il download del CSV. Prova dall’app desktop o apri la diagnostica.");
  const url = urlApi.createObjectURL(new (view as Window & typeof globalThis).Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = view.document.createElement("a"); link.href = url; link.download = `${name || "trend"}.csv`;
  try { view.document.body.append(link); link.click(); }
  finally { link.remove(); view.setTimeout(() => urlApi.revokeObjectURL(url), 1000); }
}
