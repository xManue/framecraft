// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmiDataLogRuntime, defaultHmiDataLog, defaultHmiLoggingTag, emptyHmiDataLogCatalog } from "../src/core/hmiDataLogs";
import { createHmiTrendPreviewModel } from "../src/core/hmiTrendPreview";
import { trendCsvCell, hmiTrendRuntimeModuleSource } from "../src/core/hmiTrend";
import { clearHmiFunctionTrendHistory, defaultHmiFunctionTrendConfig, hmiFunctionTrendRuntimeModuleSource, renderHmiFunctionTrendControl, serializeHmiFunctionTrendConfig } from "../src/core/hmiFunctionTrend";

afterEach(() => { vi.restoreAllMocks(); });
function model() {
  const log = defaultHmiDataLog(); log.id = "history"; log.storage = "memory"; log.tags = [{ ...defaultHmiLoggingTag(), id: "value", tag: "Signal", mode: "on-change" }];
  const catalog = { ...emptyHmiDataLogCatalog(), logs: [log] }, runtime = createHmiDataLogRuntime(catalog);
  runtime.updateTag("Signal", "42", { qualityCode: 64, timeStamp: 5000 });
  return { model: createHmiTrendPreviewModel(runtime, catalog), runtime };
}
describe("modello e renderer condivisi della prova curve", () => {
  it("invia un solo predecessore, conservando l’intervallo delle query ordinarie", () => {
    const test = model(); test.runtime.updateTag("Signal", "7", { qualityCode: 192, timeStamp: 6000 }); test.runtime.updateTag("Signal", "8", { qualityCode: 192, timeStamp: 7000 });
    const message = { type: "framecraft:trend-history" as const, pageId: "page", lease: test.model.lease, historyRevision: 0, requestId: "previous", queries: [{ key: '["history","value"]', logId: "history", loggedTagId: "value", from: 6500, to: 7500 }] };
    const result = test.model.history(message)!.results[0].samples!;
    expect(result.map(sample => sample.time)).toEqual([6000, 7000]);
    expect(test.runtime.query("history", "value", 6500, 7500).map(sample => sample.time)).toEqual([7000]);
    result[0].value = "changed"; expect(test.runtime.query("history", "value", 6000, 6000)[0].value).toBe("7");
  });
  it("restituisce solo lo storico dichiarato con qualità, intervallo e lease verificati", () => {
    const test = model(), query = vi.spyOn(test.runtime, "query");
    const message = { type: "framecraft:trend-history" as const, pageId: "page", lease: test.model.lease, historyRevision: test.model.revision, requestId: "history-1", queries: [{ key: '["history","value"]', logId: "history", loggedTagId: "value", from: 4000, to: 6000 }] };
    expect(test.model.history(message)?.results[0]).toMatchObject({ samples: [{ time: 5000, value: "42", qualityCode: 64 }] });
    expect(query).toHaveBeenCalledOnce();
    expect(test.model.history({ ...message, lease: "old" })).toBeUndefined(); test.model.changed(); expect(test.model.history(message)).toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
  });
  it("rifiuta batch fuori limite, intervalli invalidi e archivi sconosciuti senza consultarli", () => {
    const test = model(), query = vi.spyOn(test.runtime, "query"), message = { type: "framecraft:trend-history" as const, pageId: "page", lease: test.model.lease, historyRevision: 0, requestId: "query", queries: [{ key: '["missing","value"]', logId: "missing", loggedTagId: "value", from: 0, to: 6000 }] };
    expect(test.model.history(message)?.results[0].error).toContain("Data Log");
    expect(test.model.history({ ...message, queries: Array(129).fill(message.queries[0]) })).toBeUndefined();
    expect(test.model.history({ ...message, queries: [{ ...message.queries[0], from: Infinity }] })?.results[0].error).toContain("validi");
    expect(query).not.toHaveBeenCalled();
  });
  it("la simulazione spenta non pubblica valori o qualità residui e non inventa campioni", () => {
    const test = model(), packet = test.model.snapshot({ on: false, values: { Signal: "42" }, status: { Signal: { qualityCode: 192 } } }, ["Signal"]);
    expect(packet).toMatchObject({ sample: false, values: {}, status: {}, sources: { tags: ["Signal"] } });
    expect(packet.sources.logs[0]).toEqual({ id: "history", name: "Data log 1", tags: [{ id: "value", name: "Variabile 1", tag: "Signal" }] });
  });
  it("quota CSV con separatori/newline e tratta i nomi formula come testo, non i numeri negativi", () => {
    expect(trendCsvCell("a;b\nc")).toBe('"a;b\nc"');
    expect(trendCsvCell('=RUN("x")')).toBe('"\'=RUN(""x"")"');
    expect(trendCsvCell(" +1")).toBe("' +1"); expect(trendCsvCell(-42)).toBe("-42");
  });
  it("clear/ripristino dell’XY non duplica i listener sullo stesso host", () => {
    const host = document.createElement("div"), config = defaultHmiFunctionTrendConfig(); config.trends[0].x.tag = "X"; config.trends[0].y.tag = "Y";
    host.dataset.hmiFunctionTrend = serializeHmiFunctionTrendConfig(config);
    renderHmiFunctionTrendControl(host, { X: "1", Y: "2" }); clearHmiFunctionTrendHistory(host); renderHmiFunctionTrendControl(host, { X: "1", Y: "2" });
    host.querySelector<HTMLButtonElement>('[data-hmi-fx-action="pause"]')!.click(); expect(host.querySelector('[data-hmi-fx-action="pause"]')!.textContent).toBe("Avvia");
  });
  it("il generatore Runtime contiene lo stesso CSV e la pulizia idempotente dopo bundling", () => {
    const time = hmiTrendRuntimeModuleSource(), xy = hmiFunctionTrendRuntimeModuleSource();
    expect(time).not.toContain("__vite_ssr_import"); expect(xy).not.toContain("__vite_ssr_import");
    const csv = new Function(time.replace(/^export /gm, "") + '\nreturn trendCsvCell;')() as typeof trendCsvCell;
    expect(csv('=RUN("x")')).toBe(trendCsvCell('=RUN("x")'));
    const clear = new Function(xy.replace(/^export /gm, "") + '\nreturn clearHmiFunctionTrendHistory;')() as typeof clearHmiFunctionTrendHistory;
    expect(typeof clear).toBe("function");
  });
});
