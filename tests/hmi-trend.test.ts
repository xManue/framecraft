// @vitest-environment jsdom

import { parse } from "@babel/parser";
import { describe, expect, it, vi } from "vitest";
import {
  defaultHmiTrendConfig,
  hmiTrendIssues,
  hmiTrendRuntimeModuleSource,
  parseHmiTrendConfig,
  renderHmiTrendControls,
  clearHmiTrendHistory,
  serializeHmiTrendConfig,
} from "../src/core/hmiTrend";

function configuredTrend() {
  const config = defaultHmiTrendConfig();
  config.caption = "Temperatura forno";
  config.timeRangeMs = 10_000;
  config.sampleIntervalMs = 1_000;
  config.trends = [{ id: "temperature", name: "Temperatura", tag: "Oven.Temperature", source: "online", areaId: "area-1", color: "#D43D51", mode: "interpolated", axis: "left", visible: true, lowThreshold: 20, highThreshold: 80 }];
  return config;
}

describe("Trend Control Unified", () => {
  it("mantiene i campi Runtime e funziona anche nel documento iframe dell'editor", () => {
    const frame = document.createElement("iframe"); document.body.replaceChildren(frame); const doc = frame.contentDocument!;
    const host = doc.createElement("div"); host.dataset.hmiTrend = serializeHmiTrendConfig(configuredTrend()); doc.body.append(host);
    renderHmiTrendControls(doc, { "Oven.Temperature": "25" }, { now: 1_000 });
    const range = host.querySelector<HTMLSelectElement>("[data-hmi-trend-range]")!; range.focus();
    expect(range.value).toBe("10000");
    const details = host.querySelector<HTMLDetailsElement>("[data-trend-source-picker]")!; details.open = true;
    renderHmiTrendControls(doc, { "Oven.Temperature": "30" }, { now: 2_000 });
    expect(doc.activeElement).toBe(range); expect(host.querySelector("[data-hmi-trend-range]")).toBe(range); expect(details.open).toBe(true);
    clearHmiTrendHistory(host); renderHmiTrendControls(doc, { "Oven.Temperature": "40" }, { now: 3_000 });
    const pause = host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="pause"]')!; pause.click(); expect(pause.textContent).toBe("Avvia"); pause.click(); expect(pause.textContent).toBe("Arresta");
  });
  it("segnala qualità incerta e non valida, interrompe la linea ed esporta i codici originali", () => {
    const host = document.createElement("div"); host.dataset.hmiTrend = serializeHmiTrendConfig(configuredTrend()); document.body.replaceChildren(host); const exportCsv = vi.fn();
    for (const [time, qualityCode] of [[1_000, 128], [2_000, 0x2040], [3_000, 0], [4_000, 192]]) renderHmiTrendControls(document, { "Oven.Temperature": String(time / 100) }, { now: time, exportCsv, status: { "Oven.Temperature": { qualityCode } } });
    expect(host.querySelectorAll('[data-hmi-trend-quality="uncertain"]')).toHaveLength(1); expect(host.querySelectorAll('[data-hmi-trend-quality="bad"]')).toHaveLength(1);
    expect(host.querySelector('[data-hmi-trend-series="temperature"]')!.getAttribute("d")!.match(/M/g)).toHaveLength(2);
    host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="export"]')!.click(); expect(exportCsv.mock.calls[0][1]).toContain("Oven.Temperature;20;online;8256");
    renderHmiTrendControls(document, { "Oven.Temperature": " " }, { now: 5_000, exportCsv }); host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="export"]')!.click(); expect(exportCsv.mock.calls[1][1]).not.toContain("1970-01-01T00:00:05");
  });
  it("cambia sorgente solo nel Runtime, svuota il buffer e ripristina la sorgente progettata", () => {
    const host = document.createElement("div"); host.dataset.hmiTrend = serializeHmiTrendConfig(configuredTrend()); document.body.replaceChildren(host); const original = host.dataset.hmiTrend, exportCsv = vi.fn();
    const values = { "Oven.Temperature": "25", "Oven.Alternative": "90" };
    renderHmiTrendControls(document, values, { now: 1_000, exportCsv });
    const field = host.querySelector<HTMLSelectElement>('[data-trend-source-field="tag"]')!; field.value = "Oven.Alternative"; field.dispatchEvent(new Event("change", { bubbles: true }));
    host.querySelector<HTMLButtonElement>('[data-trend-source-action="apply"]')!.click();
    expect(host.querySelector("[data-hmi-trend-series]")!.getAttribute("d")).toBe("");
    renderHmiTrendControls(document, values, { now: 2_000, exportCsv }); host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="export"]')!.click();
    expect(exportCsv.mock.calls[0][1]).toContain("Oven.Alternative;90"); expect(exportCsv.mock.calls[0][1]).not.toContain("Oven.Temperature;25"); expect(host.dataset.hmiTrend).toBe(original);
    host.querySelector<HTMLButtonElement>('[data-trend-source-action="reset"]')!.click(); renderHmiTrendControls(document, values, { now: 3_000, exportCsv }); host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="export"]')!.click();
    expect(exportCsv.mock.calls[1][1]).toContain("Oven.Temperature;25"); expect(exportCsv.mock.calls[1][1]).not.toContain("Oven.Alternative");
  });
  it("applica uno zoom rettangolare agli assi sinistro e destro e mantiene la selezione durante un campionamento", () => {
    const config = configuredTrend(); config.leftAxis = { scale: "linear", minimum: 0, maximum: 100 }; config.rightAxis = { scale: "linear", minimum: 100, maximum: 300 };
    config.trends.push({ ...config.trends[0], id: "right", name: "Destra", tag: "Right", axis: "right" });
    const host = document.createElement("div"); host.dataset.hmiTrend = serializeHmiTrendConfig(config); document.body.replaceChildren(host);
    renderHmiTrendControls(document, { "Oven.Temperature": "25", Right: "150" }, { now: 10_000 });
    const svg = host.querySelector<SVGSVGElement>("[data-hmi-trend-plot]")!; vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 640, height: 260 } as DOMRect);
    const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } }); svg.dispatchEvent(event); };
    host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="zoom-area"]')!.click(); pointer("pointerdown", 320, 118); pointer("pointermove", 586, 222);
    const selection = svg.querySelector("[data-trend-zoom-selection]"); renderHmiTrendControls(document, { "Oven.Temperature": "35", Right: "170" }, { now: 11_000 });
    expect(svg.querySelector("[data-trend-zoom-selection]")).toBe(selection);
    pointer("pointerup", 586, 222); const area = svg.querySelector("[data-hmi-trend-area]")!;
    expect(area.textContent).toContain("50"); expect(area.textContent).toContain("200"); expect(host.querySelector('[data-hmi-trend-action="zoom-area"]')!.getAttribute("aria-pressed")).toBe("false");
    host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="original"]')!.click(); expect(area.isConnected).toBe(false); expect(svg.textContent).toContain("300");
  });
  it("normalizza e valida intervallo, assi, soglie, tag e limite di nove curve", () => {
    const config = parseHmiTrendConfig(JSON.stringify({ ...configuredTrend(), leftAxis: { minimum: 100, maximum: 10, scale: "linear" }, trends: [
      ...configuredTrend().trends,
      ...Array.from({ length: 9 }, (_, index) => ({ id: `extra-${index}`, name: `Extra ${index}`, tag: `Missing.${index}`, mode: "stepped", axis: "right", visible: true, color: "#00A1D1" })),
    ] }))!;
    expect(config.trends).toHaveLength(10);
    const issues = hmiTrendIssues(config, [{ name: "Oven.Temperature", dataType: "Real", access: "read", address: "%MD0", description: "" }]);
    expect(issues.some((issue) => issue.message.includes("nove curve"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("Asse sinistro"))).toBe(true);
    expect(issues.filter((issue) => issue.message.includes("non è dichiarato"))).toHaveLength(9);
  });

  it("campiona valori reali, disegna soglie e modalità, congela la vista ma conserva i nuovi campioni", () => {
    const host = document.createElement("div");
    host.dataset.hmiTrend = serializeHmiTrendConfig(configuredTrend());
    document.body.replaceChildren(host);
    expect(renderHmiTrendControls(document, { "Oven.Temperature": "25" }, { now: 1_000 })).toBe(1);
    renderHmiTrendControls(document, { "Oven.Temperature": "40" }, { now: 2_000 });
    const path = host.querySelector<SVGPathElement>('[data-hmi-trend-series="temperature"]')!;
    expect(path.getAttribute("d")).toContain("L");
    expect(host.querySelectorAll('line[stroke-dasharray]')).toHaveLength(2);

    host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="pause"]')!.click();
    const frozen = host.querySelector<SVGPathElement>('[data-hmi-trend-series="temperature"]')!.getAttribute("d");
    renderHmiTrendControls(document, { "Oven.Temperature": "75" }, { now: 3_000 });
    expect(host.querySelector<SVGPathElement>('[data-hmi-trend-series="temperature"]')!.getAttribute("d")).toBe(frozen);
    host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="pause"]')!.click();
    expect(host.querySelector<SVGPathElement>('[data-hmi-trend-series="temperature"]')!.getAttribute("d")).not.toBe(frozen);
  });

  it("rende operativi righello, selezione curve, zoom ed export CSV", () => {
    const host = document.createElement("div");
    const config = configuredTrend();
    config.trends.push({ id: "pressure", name: "Pressione", tag: "Oven.Pressure", source: "online", areaId: "area-1", color: "#00A1D1", mode: "points", axis: "right", visible: true });
    host.dataset.hmiTrend = serializeHmiTrendConfig(config);
    document.body.replaceChildren(host);
    const exportCsv = vi.fn();
    renderHmiTrendControls(document, { "Oven.Temperature": "25", "Oven.Pressure": "1.2" }, { now: 1_000, exportCsv });
    renderHmiTrendControls(document, { "Oven.Temperature": "30", "Oven.Pressure": "1.4" }, { now: 2_000, exportCsv });
    host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="ruler"]')!.click();
    expect(host.querySelector("svg")?.textContent).toContain("Temperatura:");
    host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="zoom-in"]')!.click();
    host.querySelector<HTMLInputElement>('[data-hmi-trend-visibility="pressure"]')!.click();
    expect(host.querySelector('[data-hmi-trend-series="pressure"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('[data-hmi-trend-action="export"]')!.click();
    expect(exportCsv).toHaveBeenCalledOnce();
    expect(exportCsv.mock.calls[0][1]).toContain("timestamp;trend;tag;value");
    expect(exportCsv.mock.calls[0][1]).toContain("Oven.Temperature;30");
  });

  it("separa più aree e legge curve storiche dai Data Log con timestamp e qualità", () => {
    const host = document.createElement("div");
    const config = configuredTrend();
    config.areas = [{ id: "area-1", name: "Temperature", weight: 2 }, { id: "area-2", name: "Pressioni", weight: 1 }];
    config.trends[0].areaId = "area-1";
    config.trends.push({ id: "pressure-history", name: "Pressione storica", tag: "", source: "log", logId: "process", loggedTagId: "pressure", areaId: "area-2", color: "#00A1D1", mode: "stepped", axis: "right", visible: true });
    host.dataset.hmiTrend = serializeHmiTrendConfig(config);
    document.body.replaceChildren(host);
    renderHmiTrendControls(document, { "Oven.Temperature": "25" }, { now: 2_000, history: (trend) => trend.loggedTagId === "pressure" ? [{ time: 1_000, value: 1.1, qualityCode: 192 }, { time: 2_000, value: 1.4, qualityCode: 128 }] : [] });
    expect(host.querySelectorAll("[data-hmi-trend-area]")).toHaveLength(2);
    expect(host.querySelector('[data-hmi-trend-area="area-2"]')?.textContent).toContain("Pressioni");
    expect(host.querySelector('[data-hmi-trend-series="pressure-history"]')?.getAttribute("d")).toContain("H");
    expect(host.textContent).toContain("Pressione storica · storico");
  });

  it("non sostituisce un controllo già implementato dal progetto e genera un modulo Runtime autonomo", () => {
    document.body.innerHTML = `<div data-hmi-trend='${serializeHmiTrendConfig(configuredTrend())}'><canvas></canvas></div>`;
    expect(renderHmiTrendControls(document, { "Oven.Temperature": "25" }, { now: 1_000 })).toBe(0);
    expect(document.querySelector("canvas")).not.toBeNull();
    const source = hmiTrendRuntimeModuleSource();
    expect(() => parse(source, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(source).not.toMatch(/\beval\s*\(/);
  });
});
