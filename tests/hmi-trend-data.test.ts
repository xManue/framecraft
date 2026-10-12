// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { aggregateTrendSamples, defaultHmiTrendConfig, hmiTrendIssues, hmiTrendRuntimeModuleSource, parseHmiTrendConfig, renderHmiTrendControl, serializeHmiTrendConfig, trendFormatTime, trendTimeZoneValid, type HmiTrendSample } from "../src/core/hmiTrend";

const point = (time: number, value: number, qualityCode?: number): HmiTrendSample => ({ time, value, qualityCode });
describe("fusi orari e aggregazione dei Trend Control", () => {
  it("aggiunge predefiniti compatibili ai progetti precedenti e segnala fusi invalidi", () => {
    expect(parseHmiTrendConfig({ trends: [] })).toMatchObject({ timeZone: "local", aggregation: "time-average-stepped" });
    expect(trendTimeZoneValid("local")).toBe(true); expect(trendTimeZoneValid("Europe/Rome")).toBe(true);
    expect(trendTimeZoneValid("Invalid/City")).toBe(false);
    const config = { ...defaultHmiTrendConfig(), timeZone: "Invalid/City" };
    expect(hmiTrendIssues(config).some(issue => issue.severity === "error" && issue.message.includes("UTC"))).toBe(true);
    expect(trendFormatTime(0, config.timeZone)).toBe(trendFormatTime(0, "UTC"));
  });
  it("gestisce ora legale e ore ripetute senza cambiare i timestamp", () => {
    expect(trendFormatTime(Date.parse("2026-01-12T12:00:00Z"), "Europe/Rome")).toContain("13:00:00 GMT+01:00");
    expect(trendFormatTime(Date.parse("2026-07-12T12:00:00Z"), "Europe/Rome")).toContain("14:00:00 GMT+02:00");
    expect(trendFormatTime(Date.parse("2026-10-25T00:30:00Z"), "Europe/Rome")).toContain("02:30:00 GMT+02:00");
    expect(trendFormatTime(Date.parse("2026-10-25T01:30:00Z"), "Europe/Rome")).toContain("02:30:00 GMT+01:00");
  });
  it("calcola una media temporale a gradini, non la media aritmetica", () => {
    const result = aggregateTrendSamples([point(0, 0, 192), point(900, 100, 192), point(990, 0, 192)], 0, 1000, 1);
    expect(result).toMatchObject({ aggregated: true, rawCount: 3, buckets: 1 });
    expect(result.samples).toHaveLength(1); expect(result.samples[0].value).toBeCloseTo(9);
  });
  it("usa il predecessore al bordo sinistro, non inventa dati prima del primo valore e non muta i campioni", () => {
    const original = [point(0, 10, 192), point(1000, 30, 192), point(1050, 50, 192), point(1100, 90, 192)], before = structuredClone(original);
    expect(aggregateTrendSamples(original, 100, 1100, 1).samples[0].value).toBeCloseTo(13);
    expect(aggregateTrendSamples(original.slice(1), 100, 1100, 1).samples[0].value).toBeCloseTo(40);
    expect(original).toEqual(before);
  });
  it("ordina campioni fuori sequenza e usa l’ultimo valore quando il timestamp è uguale", () => {
    const samples = [point(1000, 40, 192), point(0, 20, 192), point(0, 60, 192), point(500, 10, 192)];
    expect(aggregateTrendSamples(samples, 0, 1000, 1).samples[0].value).toBeCloseTo(35);
    expect(samples[0].time).toBe(1000);
  });
  it.each([1, 7, 53, 532])("copre tutti i pixel anche con bordi frazionari (%i)", pixels => {
    const samples = Array.from({ length: 10_001 }, (_, time) => point(time, 5, 192));
    const result = aggregateTrendSamples(samples, 0, 10_000, pixels);
    expect(result.samples).toHaveLength(pixels);
    for (const sample of result.samples) expect(sample.value).toBeCloseTo(5);
  });
  it("min/max conserva picchi e limiti, con al massimo quattro punti per pixel", () => {
    const samples = Array.from({ length: 10_001 }, (_, time) => point(time, time === 4576 ? 1234 : time === 1234 ? -999 : 5, 192));
    const result = aggregateTrendSamples(samples, 0, 10_000, 100, "min-max");
    expect(result.samples.length).toBeLessThanOrEqual(400);
    expect(result.samples.map(sample => sample.value)).toEqual(expect.arrayContaining([1234, -999]));
    expect(result.samples[0].time).toBe(0); expect(result.samples.at(-1)?.time).toBe(10_000);
  });
  it.each(["time-average-stepped", "min-max"] as const)("preserva Bad, Uncertain e qualità sconosciuta in %s", mode => {
    const samples = Array.from({ length: 100 }, (_, time) => point(time, time, time === 40 ? 0 : time === 70 ? 64 : time === 90 ? undefined : 192));
    const result = aggregateTrendSamples(samples, 0, 100, 5, mode);
    expect(result.samples.some(sample => sample.qualityCode === 0)).toBe(true);
    expect(result.samples.some(sample => sample.qualityCode === 64)).toBe(true);
    expect(result.samples.some(sample => sample.qualityCode === undefined)).toBe(true);
    expect(result.samples.every(sample => sample.aggregated)).toBe(true);
  });
  it("lascia i dati radi/tutti i campioni originali e non produce medie infinite", () => {
    const samples = [point(0, 1e308), point(500, -1e308), point(1000, 0)];
    expect(aggregateTrendSamples(samples, 0, 1000, 10).samples).toEqual(samples);
    expect(aggregateTrendSamples(samples, 0, 1000, 1, "none")).toMatchObject({ samples, aggregated: false });
    expect(aggregateTrendSamples(samples, 0, 1000, 1).samples[0].value).toBe(0);
    expect(aggregateTrendSamples([point(NaN, 1), point(10, Infinity)], 0, 1000, 0).samples).toEqual([]);
  });
  it("limita il disegno di centomila campioni e non collega un pixel contenente Bad", () => {
    const samples = Array.from({ length: 100_001 }, (_, time) => point(time, time === 50001 ? 100 : 5, time === 50000 ? 0 : 192));
    const mean = aggregateTrendSamples(samples, 0, 100_000, 700);
    expect(mean.samples).toHaveLength(700); expect(mean.rawCount).toBe(100001);
    const peaks = aggregateTrendSamples(samples, 0, 100_000, 700, "min-max");
    expect(peaks.samples.length).toBeLessThanOrEqual(2800);
    expect(peaks.samples.filter(sample => sample.time >= 50_000 && sample.time < 50_142).every(sample => sample.qualityCode === 0)).toBe(true);
  });
  it("rende dati densi per pixel, cambia modalità/fuso a Runtime e conserva CSV e righello originali", () => {
    const config = defaultHmiTrendConfig(); config.trends[0] = { ...config.trends[0], source: "log", logId: "log", loggedTagId: "tag", mode: "values" };
    const host = document.createElement("div"), raw = serializeHmiTrendConfig(config); host.dataset.hmiTrend = raw; document.body.replaceChildren(host);
    const samples = Array.from({ length: 6001 }, (_, index) => point(index * 10, index === 3000 ? 9999 : 10, index === 1500 ? 0 : 192));
    const exportCsv = vi.fn(), history = () => [point(-1000, 12, 192), ...samples], options = { now: 60_000, sample: false, history, exportCsv };
    renderHmiTrendControl(host, {}, options);
    const svg = host.querySelector<SVGSVGElement>("[data-hmi-trend-plot]")!;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ width: 120 } as DOMRect); renderHmiTrendControl(host, {}, options);
    expect(host.querySelectorAll("circle").length).toBeLessThanOrEqual(100);
    expect(host.querySelector("[data-hmi-trend-display-info]")?.textContent).toContain("6001 campioni");
    host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="ruler"]')!.click(); expect(svg.textContent).toContain("Curva 1: 9999");
    const aggregation = host.querySelector<HTMLSelectElement>("[data-hmi-trend-aggregation]")!; aggregation.value = "min-max"; aggregation.dispatchEvent(new Event("change", { bubbles: true }));
    expect(svg.textContent).toContain("9999"); expect(host.querySelectorAll("circle").length).toBeLessThanOrEqual(4 * 100);
    const zone = host.querySelector<HTMLSelectElement>("[data-hmi-trend-time-zone]")!; zone.value = "Europe/Rome"; zone.dispatchEvent(new Event("change", { bubbles: true }));
    expect(host.querySelector("[data-hmi-trend-display-info]")?.textContent).toContain("Europe/Rome");
    host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="export"]')!.click();
    expect(exportCsv.mock.calls[0][1].trim().split("\n")).toHaveLength(6002);
    expect(exportCsv.mock.calls[0][1]).toContain("1970-01-01T00:00:30.000Z;Curva 1;;9999;log;192");
    expect(exportCsv.mock.calls[0][1]).not.toContain("1969"); expect(host.dataset.hmiTrend).toBe(raw);
    host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="original"]')!.click(); expect(zone.value).toBe("local"); expect(aggregation.value).toBe("time-average-stepped");
  });
  it("mostra l’errore del fuso e ripiega esplicitamente su UTC", () => {
    const host = document.createElement("div"); host.dataset.hmiTrend = serializeHmiTrendConfig({ ...defaultHmiTrendConfig(), timeZone: "Invalid/City" });
    renderHmiTrendControl(host, {}, { now: 1000 });
    expect(host.querySelector('[data-hmi-trend-display-info][role="alert"]')?.textContent).toContain("visualizzazione in UTC");
  });
  it("porta gli stessi helper nel modulo generato senza dipendere dall’editor", () => {
    const generated = new Function(hmiTrendRuntimeModuleSource().replace(/^export /gm, "") + "\nreturn {aggregateTrendSamples,trendFormatTime};")() as { aggregateTrendSamples: typeof aggregateTrendSamples; trendFormatTime: typeof trendFormatTime };
    expect(generated.aggregateTrendSamples([point(0, 0), point(900, 100), point(990, 0)], 0, 1000, 1).samples[0].value).toBeCloseTo(9);
    expect(generated.trendFormatTime(0, "Europe/Rome")).toBe(trendFormatTime(0, "Europe/Rome"));
  });
});
