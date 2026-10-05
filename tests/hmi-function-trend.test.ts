// @vitest-environment jsdom
import { parse } from "@babel/parser";
import { describe, expect, it, vi } from "vitest";
import { defaultHmiFunctionTrendConfig, functionTrendNumericValues, hmiFunctionTrendIssues, hmiFunctionTrendRuntimeModuleSource, pairFunctionTrendSamples, parseHmiFunctionTrendConfig, renderHmiFunctionTrendControls, serializeHmiFunctionTrendConfig } from "../src/core/hmiFunctionTrend";
import { validateHmiProject } from "../src/core/hmiValidation";

const config = () => {
  const value = defaultHmiFunctionTrendConfig();
  value.trends[0].x.tag = "Motor.Speed"; value.trends[0].y.tag = "Motor.Temperature";
  value.areas[0].xAxis = { scale: "linear", minimum: 0, maximum: 100, unit: "rpm" };
  value.areas[0].yAxis = { scale: "linear", minimum: 0, maximum: 100, unit: "°C" };
  return value;
};
const hostFor = (value = config()) => { const host = document.createElement("div"); host.dataset.hmiFunctionTrend = serializeHmiFunctionTrendConfig(value); document.body.replaceChildren(host); return host; };

describe("Function Trend X/Y", () => {
  it("sceglie X e Y a Runtime senza riscrivere la configurazione e ripristina i tag originali", () => {
    const host = hostFor(); const original = host.dataset.hmiFunctionTrend; const exportCsv = vi.fn();
    const values = { "Motor.Speed": "10", "Motor.Temperature": "20", "Motor.Alternative": "90" };
    renderHmiFunctionTrendControls(document, values, { now: 1_000, exportCsv });
    const y = host.querySelector<HTMLSelectElement>('[data-trend-source-coordinate="y"] [data-trend-source-field="tag"]')!; y.value = "Motor.Alternative"; y.dispatchEvent(new Event("change", { bubbles: true }));
    host.querySelector<HTMLButtonElement>('[data-trend-source-action="apply"]')!.click(); expect(host.textContent).toContain("0 punti");
    renderHmiFunctionTrendControls(document, values, { now: 2_000, exportCsv }); host.querySelector<HTMLButtonElement>('[data-hmi-fx-action="export"]')!.click();
    expect(exportCsv.mock.calls[0][1]).toContain("Motor.Speed;Motor.Alternative;10;90"); expect(exportCsv.mock.calls[0][1]).not.toContain("Motor.Speed;Motor.Alternative;10;20"); expect(host.dataset.hmiFunctionTrend).toBe(original);
    host.querySelector<HTMLButtonElement>('[data-trend-source-action="reset"]')!.click(); expect(host.querySelector<HTMLSelectElement>('[data-trend-source-coordinate="y"] [data-trend-source-field="tag"]')!.value).toBe("Motor.Temperature");
  });
  it("zooma un rettangolo nella singola area e continua a raccogliere dati durante il trascinamento", () => {
    const value = config(); value.areas.push({ ...value.areas[0], id: "area-2", name: "Altra" }); value.trends.push({ ...value.trends[0], id: "other", areaId: "area-2" });
    const host = hostFor(value); renderHmiFunctionTrendControls(document, { "Motor.Speed": "10", "Motor.Temperature": "20" }, { now: 1_000 });
    const svg = host.querySelector<SVGSVGElement>(":scope > section > svg")!; vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 640, height: 300 } as DOMRect);
    const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } }); svg.dispatchEvent(event); };
    host.querySelector<HTMLButtonElement>('[data-hmi-fx-action="zoom-area"]')!.click(); pointer("pointerdown", 339, 61.75); pointer("pointermove", 620, 113.5);
    const selection = svg.querySelector("[data-trend-zoom-selection]"); renderHmiFunctionTrendControls(document, { "Motor.Speed": "20", "Motor.Temperature": "30" }, { now: 2_000 }); expect(svg.querySelector("[data-trend-zoom-selection]")).toBe(selection);
    pointer("pointerup", 620, 113.5); expect(svg.querySelector('[data-hmi-fx-area="area-1"]')!.textContent).toContain("62.5"); expect(svg.querySelector('[data-hmi-fx-area="area-2"]')!.textContent).toContain("100"); expect(host.textContent).toContain("2 punti");
    host.querySelector<HTMLButtonElement>('[data-hmi-fx-action="original"]')!.click(); expect(svg.querySelector('[data-hmi-fx-area="area-1"]')!.textContent).toContain("25");
  });
  it("valida sorgenti, intervallo fisso e assi anche prima dell'export", () => {
    const value = config(); value.trends[0].x = { source: "log", tag: "" }; value.trends[0].range.kind = "interval"; value.areas[0].xAxis.minimum = 110;
    const issues = hmiFunctionTrendIssues(parseHmiFunctionTrendConfig(serializeHmiFunctionTrendConfig(value))!);
    expect(issues.some((issue) => issue.message.includes("Data Log"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("inizio e fine"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("asse X"))).toBe(true);
    expect(validateHmiProject({ sources: { "Page.tsx": `<div data-hmi-function-trend='${serializeHmiFunctionTrendConfig(value)}' />` } }).filter((issue) => issue.kind === "trend-invalid")).toHaveLength(3);
  });
  it("abbina timestamp entro la tolleranza e rifiuta valori vuoti o array incoerenti", () => {
    expect(functionTrendNumericValues("")).toBeUndefined(); expect(functionTrendNumericValues('[1,"",3]')).toBeUndefined();
    const x = [{ time: 1_010, value: "[10,20]", qualityCode: 192 }, { time: 2_050, value: "30" }];
    const y = [{ time: 1_000, value: "[30,40]", qualityCode: 128 }, { time: 2_000, value: "60" }, { time: 3_000, value: "70" }];
    const paired = pairFunctionTrendSamples(x, y, 50);
    expect(paired.points).toMatchObject([{ x: 10, y: 30, xQualityCode: 192, yQualityCode: 128 }, { x: 20, y: 40 }, { x: 30, y: 60 }]); expect(paired.unmatched).toBe(1);
    expect(pairFunctionTrendSamples(x, y, 0).points).toHaveLength(0);
    expect(pairFunctionTrendSamples([{ time: 0, value: "[1,2]" }], [{ time: 0, value: "[3]" }], 0).unmatched).toBe(1);
  });
  it("disegna Y rispetto a X e recupera i campioni raccolti durante lo stop", () => {
    const host = hostFor();
    renderHmiFunctionTrendControls(document, { "Motor.Speed": "10", "Motor.Temperature": "20" }, { now: 1_000 });
    renderHmiFunctionTrendControls(document, { "Motor.Speed": "40", "Motor.Temperature": "30" }, { now: 2_000 });
    expect(host.querySelector("[data-hmi-fx-series]")!.getAttribute("d")).toBe("M114.20 206.80 L282.80 182.20");
    host.querySelector<HTMLButtonElement>('[data-hmi-fx-action="pause"]')!.click();
    const frozen = host.querySelector("[data-hmi-fx-series]")!.getAttribute("d");
    renderHmiFunctionTrendControls(document, { "Motor.Speed": "60", "Motor.Temperature": "90" }, { now: 3_000 });
    expect(host.querySelector("[data-hmi-fx-series]")!.getAttribute("d")).toBe(frozen);
    host.querySelector<HTMLButtonElement>('[data-hmi-fx-action="pause"]')!.click();
    expect(host.textContent).toContain("3 punti"); expect(host.querySelector("[data-hmi-fx-series]")!.getAttribute("d")).not.toBe(frozen);
  });
  it("confronta snapshot array, mostra qualità incerta, righello e CSV", () => {
    const host = hostFor(); const exportCsv = vi.fn();
    renderHmiFunctionTrendControls(document, { "Motor.Speed": "[10,20,30]", "Motor.Temperature": "[30,40,50]" }, { now: 1_000, status: { "Motor.Temperature": { qualityCode: 64 } }, exportCsv });
    expect(host.querySelectorAll("circle > title")).toHaveLength(3);
    host.querySelector<HTMLButtonElement>('[data-hmi-fx-action="ruler"]')!.click(); expect(host.querySelector("svg")!.textContent).toContain("X 30, Y 50");
    host.querySelector<HTMLButtonElement>('[data-hmi-fx-action="export"]')!.click(); expect(exportCsv.mock.calls[0][1]).toContain("Motor.Speed;Motor.Temperature;20;40;online;online;;64");
    renderHmiFunctionTrendControls(document, { "Motor.Speed": "[1,2]", "Motor.Temperature": "[3]" }, { now: 2_000 });
    expect(host.textContent).toContain("array della stessa lunghezza"); expect(host.textContent).toContain("0 punti");
  });
  it("legge due archivi, seleziona i punti e usa aree indipendenti", () => {
    const value = config(); value.trends[0].x = { source: "log", tag: "Speed", logId: "process", loggedTagId: "speed" }; value.trends[0].y = { source: "log", tag: "Temperature", logId: "process", loggedTagId: "temperature" };
    value.trends[0].range = { kind: "points", durationMs: 60_000, startTime: 0, measuringPoints: 2 };
    value.areas.push({ id: "area-2", name: "Confronto", weight: 1, xAxis: { scale: "linear" }, yAxis: { scale: "linear" } });
    value.trends.push({ ...value.trends[0], id: "setpoint", name: "Setpoint", areaId: "area-2", visible: false });
    const host = hostFor(value);
    renderHmiFunctionTrendControls(document, {}, { now: 3_000, history: (source) => [1_000, 2_000, 3_000].map((time, index) => ({ time, value: String(source.loggedTagId === "speed" ? index * 10 : index * 20) })) });
    expect(host.querySelectorAll("[data-hmi-fx-area]")).toHaveLength(2); expect(host.textContent).toContain("Curva 1 · 2 punti"); expect(host.querySelector('[data-hmi-fx-series="setpoint"]')).toBeNull();
    host.querySelector<HTMLInputElement>('[data-hmi-fx-visibility="setpoint"]')!.click(); expect(host.querySelector('[data-hmi-fx-series="setpoint"]')).not.toBeNull();
  });
  it("conserva contenuto del progetto e genera un modulo autonomo", () => {
    const host = hostFor(); host.append(document.createElement("canvas")); expect(renderHmiFunctionTrendControls(document, {})).toBe(0);
    expect(() => parse(hmiFunctionTrendRuntimeModuleSource(), { sourceType: "module", plugins: ["typescript"] })).not.toThrow(); expect(hmiFunctionTrendRuntimeModuleSource()).not.toMatch(/\beval\s*\(/);
  });
  it("mantiene focus, campi e selezione intervallo durante l'acquisizione", () => {
    const host = hostFor(); renderHmiFunctionTrendControls(document, { "Motor.Speed": "10", "Motor.Temperature": "20" }, { now: 1_000 });
    const form = host.querySelector<HTMLDetailsElement>("[data-hmi-fx-range-form]")!; form.open = true;
    const input = form.querySelector<HTMLInputElement>('[data-hmi-fx-range="start"]')!; input.focus(); input.value = "2026-09-30T12:00";
    renderHmiFunctionTrendControls(document, { "Motor.Speed": "20", "Motor.Temperature": "40" }, { now: 2_000 });
    expect(document.activeElement).toBe(input); expect(form.open).toBe(true); expect(input.value).toBe("2026-09-30T12:00");
    const kind = form.querySelector<HTMLSelectElement>('[data-hmi-fx-range="kind"]')!; kind.value = "interval"; kind.dispatchEvent(new Event("change", { bubbles: true })); expect(form.querySelector('[role="alert"]')!.textContent).toContain("inizio e fine");
    const end = form.querySelector<HTMLInputElement>('[data-hmi-fx-range="end"]')!; end.value = "2026-09-30T13:00"; end.dispatchEvent(new Event("change", { bubbles: true })); expect(form.querySelector('[role="alert"]')!.textContent).toBe("");
  });
  it("tratta come buone entrambe le classi Good anche con flag nel byte alto", () => {
    const host = hostFor();
    renderHmiFunctionTrendControls(document, { "Motor.Speed": "10", "Motor.Temperature": "20" }, { now: 1_000, status: { "Motor.Speed": { qualityCode: 0x2080 }, "Motor.Temperature": { qualityCode: 192 } } });
    expect(host.querySelectorAll("circle > title")).toHaveLength(0);
    renderHmiFunctionTrendControls(document, { "Motor.Speed": "20", "Motor.Temperature": "30" }, { now: 2_000, status: { "Motor.Speed": { qualityCode: 0x2040 } } });
    expect(host.querySelectorAll("circle > title")).toHaveLength(1);
  });
});
