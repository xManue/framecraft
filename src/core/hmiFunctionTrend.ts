import type { PlcVariableDefinition } from "./plcVariables";
import type { HmiDataLogCatalog } from "./hmiDataLogs";
import { appendTrendText, trendArgb, trendAxisLabel, trendAxisRange, trendAxisValue, trendPath, type HmiTrendAxis, type HmiTrendIssue, type HmiTrendMode } from "./hmiTrend";
import { hmiTrendRuntimeUiModuleSource, installTrendAreaZoom, renderTrendSourcePicker, trendAreaZoomDragging, trendQualityClass, trendRuntimeZoomRange, type HmiTrendSourceCatalog, type HmiTrendSourceChoice, type HmiTrendZoomArea } from "./hmiTrendRuntimeUi";

export const hmiFunctionTrendAttribute = "data-hmi-function-trend";
const fxText = appendTrendText;
const fxArgb = trendArgb;
const fxAxisLabel = trendAxisLabel;
const fxAxisRange = trendAxisRange;
const fxAxisValue = trendAxisValue;
const fxPath = trendPath;
const fxSourcePicker = renderTrendSourcePicker;
const fxAreaZoom = installTrendAreaZoom;
const fxZoomDragging = trendAreaZoomDragging;
const fxZoomRange = trendRuntimeZoomRange;
const fxQualityClass = trendQualityClass;
export interface HmiFunctionTrendSource { source: "online" | "log"; tag: string; logId?: string; loggedTagId?: string }
export interface HmiFunctionTrendRange { kind: "rolling" | "interval" | "points"; durationMs: number; startTime?: number; endTime?: number; measuringPoints: number }
export interface HmiFunctionTrendSeries {
  id: string; name: string; areaId: string; color: string; mode: HmiTrendMode; visible: boolean;
  x: HmiFunctionTrendSource; y: HmiFunctionTrendSource; range: HmiFunctionTrendRange;
  pairToleranceMs: number; lowThreshold?: number; highThreshold?: number;
}
export interface HmiFunctionTrendArea { id: string; name: string; weight: number; xAxis: HmiTrendAxis; yAxis: HmiTrendAxis }
export interface HmiFunctionTrendConfig {
  version: 1; caption: string; sampleIntervalMs: number; maxPoints: number; online: boolean;
  showToolbar: boolean; showLegend: boolean; showGrid: boolean; showRuler: boolean;
  backColor: string; plotColor: string; areas: HmiFunctionTrendArea[]; trends: HmiFunctionTrendSeries[];
}
export interface HmiFunctionTrendValue { time: number; value: string; qualityCode?: number }
export interface HmiFunctionTrendPoint { time: number; x: number; y: number; xQualityCode?: number; yQualityCode?: number }
export interface HmiFunctionTrendRenderOptions {
  now?: number; sample?: boolean;
  sources?: HmiTrendSourceCatalog;
  history?: (source: HmiFunctionTrendSource, from: number, to: number) => readonly HmiFunctionTrendValue[];
  status?: Readonly<Record<string, { qualityCode?: number }>>;
  exportCsv?: (fileName: string, content: string) => void;
}
interface FunctionTrendState {
  signature: string; config: HmiFunctionTrendConfig; options: HmiFunctionTrendRenderOptions; values: Readonly<Record<string, string>>;
  onlineValues: Map<string, HmiFunctionTrendValue[]>; displayed: Map<string, HmiFunctionTrendPoint[]>;
  lastSampleAt?: number; paused: boolean; frozenAt?: number; hidden: Set<string>; foreground?: string;
  views: Map<string, { x?: [number, number]; y?: [number, number] }>; plots: HmiTrendZoomArea[]; zoomArea: boolean;
  sources: Map<string, Record<string, HmiTrendSourceChoice>>; ruler?: { areaId: string; ratio: number };
  rangeOverride?: HmiFunctionTrendRange;
}
const functionTrendStates = new WeakMap<HTMLElement, FunctionTrendState>();
const fxString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const fxNumber = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const fxOptional = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const fxBool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
const fxObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function normalizeFxSource(value: unknown): HmiFunctionTrendSource {
  const item = fxObject(value);
  return { source: item.source === "log" ? "log" : "online", tag: fxString(item.tag).trim(), logId: fxString(item.logId).trim() || undefined, loggedTagId: fxString(item.loggedTagId).trim() || undefined };
}
function normalizeFxAxis(value: unknown): HmiTrendAxis {
  const item = fxObject(value);
  return { minimum: fxOptional(item.minimum), maximum: fxOptional(item.maximum), scale: ["logarithmic", "negative-logarithmic"].includes(String(item.scale)) ? item.scale as HmiTrendAxis["scale"] : "linear", unit: fxString(item.unit) || undefined };
}
function normalizeFxRange(value: unknown): HmiFunctionTrendRange {
  const item = fxObject(value);
  return { kind: item.kind === "interval" || item.kind === "points" ? item.kind : "rolling", durationMs: fxNumber(item.durationMs, 60_000), startTime: fxOptional(item.startTime), endTime: fxOptional(item.endTime), measuringPoints: Math.round(fxNumber(item.measuringPoints, 100)) };
}
export function defaultHmiFunctionTrendConfig(): HmiFunctionTrendConfig {
  return {
    version: 1, caption: "Curva X/Y", sampleIntervalMs: 1_000, maxPoints: 5_000, online: true,
    showToolbar: true, showLegend: true, showGrid: true, showRuler: true, backColor: "#F7F8F9", plotColor: "#FFFFFF",
    areas: [{ id: "area-1", name: "Area 1", weight: 1, xAxis: { scale: "linear" }, yAxis: { scale: "linear" } }],
    trends: [{ id: "curve-1", name: "Curva 1", areaId: "area-1", color: "#00A1D1", mode: "interpolated", visible: true, x: { source: "online", tag: "" }, y: { source: "online", tag: "" }, range: normalizeFxRange({}), pairToleranceMs: 500 }],
  };
}
export function parseHmiFunctionTrendConfig(value: unknown): HmiFunctionTrendConfig | undefined {
  let raw = value;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { return undefined; } }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const item = fxObject(raw); const fallback = defaultHmiFunctionTrendConfig();
  const areas = Array.isArray(item.areas) ? item.areas.map((rawArea, index) => {
    const area = fxObject(rawArea);
    return { id: fxString(area.id, `area-${index + 1}`), name: fxString(area.name, `Area ${index + 1}`), weight: fxNumber(area.weight, 1), xAxis: normalizeFxAxis(area.xAxis), yAxis: normalizeFxAxis(area.yAxis) };
  }) : fallback.areas;
  const trends = Array.isArray(item.trends) ? item.trends.map((rawTrend, index): HmiFunctionTrendSeries => {
    const trend = fxObject(rawTrend);
    return { id: fxString(trend.id, `curve-${index + 1}`), name: fxString(trend.name, `Curva ${index + 1}`), areaId: fxString(trend.areaId, areas[0]?.id ?? "area-1"), color: fxString(trend.color, ["#00A1D1", "#87BE32", "#D43D51"][index % 3]), mode: ["points", "stepped", "values"].includes(String(trend.mode)) ? trend.mode as HmiTrendMode : "interpolated", visible: fxBool(trend.visible, true), x: normalizeFxSource(trend.x), y: normalizeFxSource(trend.y), range: normalizeFxRange(trend.range), pairToleranceMs: fxNumber(trend.pairToleranceMs, 500), lowThreshold: fxOptional(trend.lowThreshold), highThreshold: fxOptional(trend.highThreshold) };
  }) : fallback.trends;
  return { version: 1, caption: fxString(item.caption, fallback.caption), sampleIntervalMs: fxNumber(item.sampleIntervalMs, fallback.sampleIntervalMs), maxPoints: Math.round(fxNumber(item.maxPoints, fallback.maxPoints)), online: fxBool(item.online, true), showToolbar: fxBool(item.showToolbar, true), showLegend: fxBool(item.showLegend, true), showGrid: fxBool(item.showGrid, true), showRuler: fxBool(item.showRuler, true), backColor: fxString(item.backColor, fallback.backColor), plotColor: fxString(item.plotColor, fallback.plotColor), areas, trends };
}
export function serializeHmiFunctionTrendConfig(config: HmiFunctionTrendConfig): string { return JSON.stringify(parseHmiFunctionTrendConfig(config) ?? defaultHmiFunctionTrendConfig()); }

export function hmiFunctionTrendIssues(config: HmiFunctionTrendConfig, variables?: readonly PlcVariableDefinition[], dataLogs?: HmiDataLogCatalog): HmiTrendIssue[] {
  const issues: HmiTrendIssue[] = [];
  const error = (message: string) => issues.push({ severity: "error", message });
  if (config.sampleIntervalMs < 100) error("Il campionamento X/Y deve essere almeno 100 ms.");
  if (config.maxPoints < 2 || config.maxPoints > 100_000) error("Il buffer X/Y deve contenere da 2 a 100000 punti.");
  if (!config.trends.length || config.trends.length > 9) error("Il Function Trend Control deve contenere da una a nove curve.");
  if (!config.areas.length || config.areas.length > 4) error("Il Function Trend Control deve contenere da una a quattro aree.");
  for (const [items, label] of [[config.areas, "Area"], [config.trends, "Curva"]] as const) {
    const ids = new Set<string>();
    for (const item of items) { if (!item.id.trim() || ids.has(item.id)) error(`${label}: identificatore vuoto o duplicato "${item.id}".`); ids.add(item.id); }
  }
  const declared = variables?.length ? new Set(variables.filter((variable) => !variable.detected).map((variable) => variable.name)) : undefined;
  for (const area of config.areas) {
    if (area.weight <= 0) error(`${area.name}: l'altezza relativa deve essere positiva.`);
    for (const [name, axis] of [["X", area.xAxis], ["Y", area.yAxis]] as const) {
      if (axis.minimum !== undefined && axis.maximum !== undefined && axis.minimum >= axis.maximum) error(`${area.name}, asse ${name}: il minimo deve essere minore del massimo.`);
      if (axis.scale === "logarithmic" && (axis.minimum ?? 1) <= 0) error(`${area.name}, asse ${name}: la scala logaritmica richiede valori positivi.`);
      if (axis.scale === "negative-logarithmic" && (axis.maximum ?? -1) >= 0) error(`${area.name}, asse ${name}: la scala logaritmica negativa richiede valori negativi.`);
    }
  }
  for (const trend of config.trends) {
    if (!config.areas.some((area) => area.id === trend.areaId)) error(`${trend.name}: l'area "${trend.areaId}" non esiste.`);
    if (trend.pairToleranceMs < 0) error(`${trend.name}: la tolleranza temporale non può essere negativa.`);
    if (trend.lowThreshold !== undefined && trend.highThreshold !== undefined && trend.lowThreshold >= trend.highThreshold) error(`${trend.name}: soglie Y invertite.`);
    const range = trend.range;
    if (range.durationMs < 1_000) error(`${trend.name}: l'intervallo deve essere almeno 1 secondo.`);
    if (range.kind === "interval" && (range.startTime === undefined || range.endTime === undefined || range.startTime >= range.endTime)) error(`${trend.name}: scegli inizio e fine validi per l'intervallo fisso.`);
    if (range.kind === "points" && (range.measuringPoints < 1 || range.measuringPoints > config.maxPoints)) error(`${trend.name}: il numero di punti deve rientrare nel buffer configurato.`);
    for (const [name, source] of [["X", trend.x], ["Y", trend.y]] as const) {
      if (source.source === "online") {
        if (!source.tag) issues.push({ severity: "warning", message: `${trend.name}, ${name}: collega una variabile PLC o un array.` });
        else if (declared && !declared.has(source.tag)) issues.push({ severity: "warning", message: `${trend.name}, ${name}: il tag "${source.tag}" non è dichiarato.` });
      } else {
        const log = dataLogs?.logs.find((item) => item.id === source.logId);
        if (!source.logId || !source.loggedTagId || (dataLogs && !log?.tags.some((tag) => tag.id === source.loggedTagId))) error(`${trend.name}, ${name}: scegli un Data Log e una variabile archiviata esistenti.`);
      }
    }
  }
  return issues;
}

export function functionTrendNumericValues(raw: string | undefined): number[] | undefined {
  if (raw === undefined || !raw.trim()) return undefined;
  let value: unknown = raw;
  if (raw.trim().startsWith("[")) { try { value = JSON.parse(raw); } catch { return undefined; } }
  const values = Array.isArray(value) ? value : [value];
  if (!values.length || values.some((item) => (typeof item !== "number" && typeof item !== "string") || String(item).trim() === "" || !Number.isFinite(Number(item)))) return undefined;
  return values.map(Number);
}

export function pairFunctionTrendSamples(xValues: readonly HmiFunctionTrendValue[], yValues: readonly HmiFunctionTrendValue[], toleranceMs: number): { points: HmiFunctionTrendPoint[]; unmatched: number } {
  const xs = xValues.filter((sample) => Number.isFinite(sample.time)).slice().sort((a, b) => a.time - b.time);
  const ys = yValues.filter((sample) => Number.isFinite(sample.time)).slice().sort((a, b) => a.time - b.time);
  const points: HmiFunctionTrendPoint[] = []; let unmatched = 0; let index = 0;
  for (const ySample of ys) {
    while (index + 1 < xs.length && Math.abs(xs[index + 1].time - ySample.time) < Math.abs(xs[index].time - ySample.time)) index++;
    const xSample = xs[index]; const x = functionTrendNumericValues(xSample?.value); const y = functionTrendNumericValues(ySample.value);
    if (!xSample || Math.abs(xSample.time - ySample.time) > toleranceMs || !x || !y || x.length !== y.length || xSample.value.trim().startsWith("[") !== ySample.value.trim().startsWith("[")) { unmatched++; continue; }
    for (let point = 0; point < x.length; point++) points.push({ time: ySample.time, x: x[point], y: y[point], xQualityCode: xSample.qualityCode, yQualityCode: ySample.qualityCode });
  }
  return { points, unmatched };
}

function fxSourceKey(source: HmiFunctionTrendSource): string { return source.source === "online" ? source.tag : `${source.logId}/${source.loggedTagId}`; }
function fxBounds(range: HmiFunctionTrendRange, now: number): [number, number] {
  if (range.kind === "interval") return [range.startTime ?? now - range.durationMs, range.endTime ?? now];
  if (range.kind === "points") return [range.startTime ?? now - range.durationMs, now];
  return [now - range.durationMs, now];
}
function fxVisibleRange(range: [number, number], zoom: number, pan: number): [number, number] {
  const width = (range[1] - range[0]) / zoom; const center = (range[0] + range[1]) / 2 + pan * (range[1] - range[0]);
  return [center - width / 2, center + width / 2];
}
function fxDownload(config: HmiFunctionTrendConfig, state: FunctionTrendState) {
  const escape = (value: string) => /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  const rows = ["timestamp;curve;xTag;yTag;x;y;xSource;ySource;xQualityCode;yQualityCode"];
  for (const trend of config.trends) for (const point of state.displayed.get(trend.id) ?? []) rows.push([new Date(point.time).toISOString(), trend.name, fxSourceKey(trend.x), fxSourceKey(trend.y), String(point.x), String(point.y), trend.x.source, trend.y.source, String(point.xQualityCode ?? ""), String(point.yQualityCode ?? "")].map(escape).join(";"));
  const content = `${rows.join("\n")}\n`; const fileName = `${config.caption.replace(/[^a-z0-9_-]+/gi, "-") || "function-trend"}.csv`;
  if (state.options.exportCsv) { state.options.exportCsv(fileName, content); return; }
  const urlApi = hostUrlApi();
  if (!urlApi?.createObjectURL) return;
  const url = urlApi.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = fileName; link.click(); urlApi.revokeObjectURL(url);
}
function hostUrlApi() { return typeof URL === "undefined" ? undefined : URL; }

function fxInstallListeners(host: HTMLElement) {
  host.addEventListener("click", (event) => {
    const state = functionTrendStates.get(host); if (!state) return;
    const target = event.target as Element | null; if (target?.nodeType !== 1) return;
    const action = target.closest<HTMLElement>("[data-hmi-fx-action]")?.dataset.hmiFxAction;
    if (!action) return;
    if (action === "pause") { state.paused = !state.paused; state.frozenAt = state.paused ? state.options.now ?? Date.now() : undefined; }
    else if (action === "ruler") state.ruler = state.ruler ? undefined : { areaId: state.config.areas[0]?.id ?? "", ratio: .5 };
    else if (action === "original") { state.views.clear(); state.zoomArea = false; }
    else if (action === "zoom-area") state.zoomArea = !state.zoomArea;
    else if (action === "export") fxDownload(state.config, state);
    else if (action === "previous" || action === "next") {
      const curves = state.config.trends.filter((trend) => !state.hidden.has(trend.id));
      const index = curves.findIndex((trend) => trend.id === state.foreground);
      state.foreground = curves[(index + (action === "next" ? 1 : -1) + curves.length) % curves.length]?.id;
    } else if (action.startsWith("zoom-") || ["left", "right", "up", "down"].includes(action)) {
      const zoom = action.startsWith("zoom-"); const factor = zoom ? action.endsWith("in") ? 2 : .5 : 1;
      const both = action === "zoom-in" || action === "zoom-out";
      for (const plot of state.plots) {
        const view = state.views.get(plot.id) ?? {};
        if (both || action.includes("-x-") || action === "left" || action === "right") view.x = fxZoomRange(plot.xRange, factor, action === "left" ? -.2 : action === "right" ? .2 : 0);
        if (both || action.includes("-y-") || action === "up" || action === "down") view.y = fxZoomRange(plot.yRange, factor, action === "down" ? -.2 : action === "up" ? .2 : 0);
        state.views.set(plot.id, view);
      }
    }
    renderHmiFunctionTrendControl(host, state.values, { ...state.options, sample: false });
  });
  host.addEventListener("change", (event) => {
    const state = functionTrendStates.get(host); if (!state) return;
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const visibility = target.dataset.hmiFxVisibility;
    if (visibility) { if ((target as HTMLInputElement).checked) state.hidden.delete(visibility); else state.hidden.add(visibility); }
    if (target.dataset.hmiFxForeground !== undefined) state.foreground = target.value;
    if (target.dataset.hmiFxRange !== undefined) {
      const form = target.closest("[data-hmi-fx-range-form]")!;
      const kind = form.querySelector<HTMLSelectElement>("[data-hmi-fx-range='kind']")!.value as HmiFunctionTrendRange["kind"];
      const start = form.querySelector<HTMLInputElement>("[data-hmi-fx-range='start']")!.value;
      const end = form.querySelector<HTMLInputElement>("[data-hmi-fx-range='end']")!.value;
      const next: HmiFunctionTrendRange = { kind, durationMs: Math.max(1, Number(form.querySelector<HTMLInputElement>("[data-hmi-fx-range='duration']")!.value)) * 1000, measuringPoints: Math.max(1, Math.min(state.config.maxPoints, Number(form.querySelector<HTMLInputElement>("[data-hmi-fx-range='points']")!.value) || 1)), startTime: start ? Date.parse(start) : undefined, endTime: end ? Date.parse(end) : undefined };
      const error = form.querySelector<HTMLElement>("[role='alert']")!;
      if (kind === "interval" && (next.startTime === undefined || next.endTime === undefined || next.startTime >= next.endTime)) { error.textContent = "Scegli inizio e fine validi."; return; }
      error.textContent = "";
      state.rangeOverride = next;
    }
    renderHmiFunctionTrendControl(host, state.values, { ...state.options, sample: false });
  });
  host.addEventListener("pointerdown", (event) => {
    const state = functionTrendStates.get(host); if (!state?.config.showRuler || state.zoomArea) return;
    const target = event.target as Element | null;
    const area = target?.nodeType === 1 ? target.closest<SVGElement>("[data-hmi-fx-area]") : undefined;
    const svg = area?.closest("svg"); if (!area || !svg) return;
    const box = svg.getBoundingClientRect(); const x = box.width ? (event.clientX - box.left) / box.width * 640 : 320;
    state.ruler = { areaId: area.getAttribute("data-hmi-fx-area")!, ratio: Math.max(0, Math.min(1, (x - 58) / 562)) };
    renderHmiFunctionTrendControl(host, state.values, { ...state.options, sample: false });
  });
}

function fxToolbar(root: HTMLElement, config: HmiFunctionTrendConfig, state: FunctionTrendState) {
  const doc = root.ownerDocument; const toolbar = doc.createElement("div"); toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", "Comandi Function Trend");
  Object.assign(toolbar.style, { display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center", padding: "5px", background: "#eef1f2" });
  const buttons = [["pause", state.paused ? "Avvia" : "Arresta"], ["zoom-x-in", "X +"], ["zoom-x-out", "X −"], ["zoom-y-in", "Y +"], ["zoom-y-out", "Y −"], ["zoom-in", "Zoom +"], ["zoom-out", "Zoom −"], ["zoom-area", "Zoom area"], ["original", "Vista originale"], ["ruler", "Righello"], ["previous", "Curva precedente"], ["next", "Curva successiva"], ["left", "Sposta X −"], ["right", "Sposta X +"], ["down", "Sposta Y −"], ["up", "Sposta Y +"], ["export", "CSV"]];
  for (const [action, label] of buttons) {
    const button = doc.createElement("button"); button.type = "button"; button.dataset.hmiFxAction = action; button.textContent = label;
    Object.assign(button.style, { minHeight: "44px", padding: "3px 7px", border: "1px solid #8a949b", borderRadius: "3px", background: "#fff", color: "#20262b", cursor: "pointer" });
    if (action === "pause" || action === "ruler") button.setAttribute("aria-pressed", String(action === "pause" ? state.paused : Boolean(state.ruler)));
    toolbar.append(button);
  }
  root.append(toolbar);
  const details = doc.createElement("details"); details.dataset.hmiFxRangeForm = ""; Object.assign(details.style, { padding: "4px 8px", background: "#f7f8f9" });
  const summary = doc.createElement("summary"); summary.textContent = "Intervallo dei campioni"; summary.style.cursor = "pointer"; details.append(summary);
  const range = state.rangeOverride ?? config.trends[0]?.range ?? normalizeFxRange({});
  const fields: [string, string, string, string][] = [["kind", "Selezione", "select", range.kind], ["duration", "Durata (s)", "number", String(range.durationMs / 1000)], ["start", "Inizio", "datetime-local", fxLocalDate(range.startTime)], ["end", "Fine", "datetime-local", fxLocalDate(range.endTime)], ["points", "Punti di misura", "number", String(range.measuringPoints)]];
  const group = doc.createElement("div"); Object.assign(group.style, { display: "flex", gap: "8px", flexWrap: "wrap", padding: "6px 0" });
  for (const [name, labelText, type, value] of fields) {
    const label = doc.createElement("label"); label.textContent = labelText; Object.assign(label.style, { display: "grid", gap: "3px" });
    const field = type === "select" ? doc.createElement("select") : doc.createElement("input"); field.dataset.hmiFxRange = name;
    if (field.tagName === "SELECT") for (const [id, text] of [["rolling", "Ultimo intervallo"], ["interval", "Inizio e fine"], ["points", "Numero di punti"]]) { const option = doc.createElement("option"); option.value = id; option.textContent = text; field.append(option); }
    else { (field as HTMLInputElement).type = type; if (type === "number") (field as HTMLInputElement).min = "1"; }
    field.value = value; field.style.minHeight = "44px"; label.append(field); group.append(label);
  }
  const error = doc.createElement("p"); error.setAttribute("role", "alert"); group.append(error); details.append(group); root.append(details);
}
function fxLocalDate(time?: number): string {
  if (time === undefined) return "";
  const date = new Date(time); return new Date(time - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

export function renderHmiFunctionTrendControl(host: HTMLElement, values: Readonly<Record<string, string>>, options: HmiFunctionTrendRenderOptions = {}): boolean {
  const designed = parseHmiFunctionTrendConfig(host.getAttribute(hmiFunctionTrendAttribute)); if (!designed) return false;
  let config = designed;
  const doc = host.ownerDocument; let root = host.querySelector<HTMLElement>(":scope > [data-hmi-function-trend-root]");
  if (!root && host.children.length) return false;
  if (!root) { root = doc.createElement("section"); root.dataset.hmiFunctionTrendRoot = ""; host.replaceChildren(root); }
  let state = functionTrendStates.get(host); const signature = JSON.stringify(designed);
  if (!state) { fxInstallListeners(host); }
  if (!state || state.signature !== signature) {
    root.replaceChildren();
    state = { signature, config, options, values, onlineValues: new Map(), displayed: new Map(), paused: false, hidden: new Set(config.trends.filter((trend) => !trend.visible).map((trend) => trend.id)), foreground: config.trends[0]?.id, views: new Map(), sources: new Map(), plots: [], zoomArea: false };
    functionTrendStates.set(host, state);
  }
  state.values = values; state.options = options;
  config = { ...designed, trends: designed.trends.map((trend) => ({ ...trend, ...state!.sources.get(trend.id) })) }; state.config = config;
  const now = options.now ?? Date.now(); const maximum = Math.max(2, Math.min(100_000, config.maxPoints));
  if (config.online && options.sample !== false && (state.lastSampleAt === undefined || now - state.lastSampleAt >= Math.max(100, config.sampleIntervalMs))) {
    state.lastSampleAt = now;
    const tags = new Set(config.trends.flatMap((trend) => [trend.x, trend.y]).filter((source) => source.source === "online" && source.tag).map((source) => source.tag));
    for (const tag of tags) {
      const raw = values[tag]; if (!functionTrendNumericValues(raw)) { if (raw?.trim().startsWith("[")) state.onlineValues.delete(tag); continue; }
      const list = raw.trim().startsWith("[") ? [] : state.onlineValues.get(tag) ?? [];
      list.push({ time: now, value: raw, qualityCode: options.status?.[tag]?.qualityCode });
      if (list.length > maximum) list.splice(0, list.length - maximum);
      state.onlineValues.set(tag, list);
    }
  }
  const messages: string[] = [];
  const existingPlot = root.querySelector<SVGSVGElement>(":scope > svg");
  if (existingPlot && !state.zoomArea) fxAreaZoom(existingPlot, false, state.plots, () => {});
  if (existingPlot && fxZoomDragging(existingPlot)) return true;
  if (!state.paused) {
    const displayed = new Map<string, HmiFunctionTrendPoint[]>();
    for (const trend of config.trends.slice(0, 9)) {
      const range = state.rangeOverride ?? trend.range; const [from, to] = fxBounds(range, now);
      const tolerance = Math.max(0, trend.pairToleranceMs);
      const sourceValues = (source: HmiFunctionTrendSource, padding = 0) => (source.source === "log" ? options.history?.(source, from - padding, to + padding) ?? [] : state!.onlineValues.get(source.tag) ?? []).filter((sample) => sample.time >= from - padding && sample.time <= to + padding);
      const paired = pairFunctionTrendSamples(sourceValues(trend.x, tolerance), sourceValues(trend.y), tolerance);
      if (paired.unmatched) messages.push(`${trend.name}: ${paired.unmatched} campioni senza coppia X/Y valida (tolleranza ${trend.pairToleranceMs} ms; array della stessa lunghezza).`);
      const points = range.kind === "points" ? paired.points.slice(0, Math.max(1, Math.min(maximum, range.measuringPoints))) : paired.points.slice(-maximum);
      displayed.set(trend.id, points);
    }
    state.displayed = displayed;
  }
  root.setAttribute("aria-label", config.caption || "Function Trend Control");
  Object.assign(root.style, { display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: "280px", overflow: "auto", border: "1px solid #70777c", background: fxArgb(config.backColor), color: "#20262b", font: "12px/1.3 system-ui,sans-serif" });
  let header = root.querySelector<HTMLElement>(":scope > header");
  if (!header) {
    const style = doc.createElement("style"); style.textContent = "[data-hmi-function-trend-root] :is(button,input,select,summary):focus-visible{outline:2px solid #00647d;outline-offset:2px}[data-hmi-function-trend-root] button:hover{background:#e2f3f7!important}"; root.append(style);
    header = doc.createElement("header"); Object.assign(header.style, { padding: "7px 10px", background: "#3f464c", color: "#fff", fontWeight: "700" }); root.append(header);
    if (config.showToolbar) {
      fxToolbar(root, config, state);
      const sourceRoot = doc.createElement("div"); sourceRoot.dataset.hmiFxSourcesRoot = ""; root.append(sourceRoot);
    }
    if (config.trends.length > 1) {
      const label = doc.createElement("label"); label.dataset.hmiFxForegroundLabel = ""; label.textContent = "Curva in primo piano "; const select = doc.createElement("select"); select.dataset.hmiFxForeground = ""; select.style.minHeight = "44px"; label.append(select); Object.assign(label.style, { padding: "4px 8px", background: "#f7f8f9" }); root.append(label);
    }
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 640 300"); svg.setAttribute("role", "img"); svg.setAttribute("preserveAspectRatio", "none"); Object.assign(svg.style, { width: "100%", minHeight: "180px", flex: "1 0 180px", background: fxArgb(config.plotColor), touchAction: "none" }); root.append(svg);
    if (config.showLegend) {
      const legend = doc.createElement("div"); legend.dataset.hmiFxLegend = ""; Object.assign(legend.style, { display: "flex", gap: "10px", flexWrap: "wrap", padding: "5px 8px", background: "#f7f8f9" });
      for (const trend of config.trends.slice(0, 9)) { const label = doc.createElement("label"); Object.assign(label.style, { display: "flex", alignItems: "center", minHeight: "44px", cursor: "pointer" }); const checkbox = doc.createElement("input"); checkbox.type = "checkbox"; checkbox.dataset.hmiFxVisibility = trend.id; const text = doc.createElement("span"); text.style.borderBottom = `2px solid ${fxArgb(trend.color)}`; label.append(checkbox, text); legend.append(label); } root.append(legend);
    }
    const status = doc.createElement("div"); status.dataset.hmiFxStatus = ""; status.setAttribute("role", "status"); Object.assign(status.style, { padding: "4px 8px", color: "#7a4200", background: "#fff3dd" }); root.append(status);
  }
  header.textContent = `${config.caption}${state.paused ? " · vista ferma" : ""}`;
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-hmi-fx-action="pause"]'); if (pauseButton) { pauseButton.textContent = state.paused ? "Avvia" : "Arresta"; pauseButton.setAttribute("aria-pressed", String(state.paused)); }
  root.querySelector('[data-hmi-fx-action="ruler"]')?.setAttribute("aria-pressed", String(Boolean(state.ruler)));
  root.querySelector('[data-hmi-fx-action="zoom-area"]')?.setAttribute("aria-pressed", String(state.zoomArea));
  const sourceRoot = root.querySelector<HTMLElement>("[data-hmi-fx-sources-root]");
  if (sourceRoot) fxSourcePicker(sourceRoot, designed.trends.map((trend) => ({ id: trend.id, name: trend.name, sources: { x: trend.x, y: trend.y } })), { tags: [...new Set([...(options.sources?.tags ?? []), ...Object.keys(values), ...designed.trends.flatMap((trend) => [trend.x, trend.y]).filter((source) => source.source === "online").map((source) => source.tag).filter(Boolean)])].sort(), logs: options.sources?.logs ?? [] }, (id, sources) => {
    state!.sources.set(id, sources); state!.displayed.delete(id); state!.lastSampleAt = undefined; state!.views.clear();
    renderHmiFunctionTrendControl(host, state!.values, { ...state!.options, sample: false });
  }, () => { state!.sources.clear(); state!.displayed.clear(); state!.lastSampleAt = undefined; state!.views.clear(); renderHmiFunctionTrendControl(host, state!.values, { ...state!.options, sample: false }); });
  const shown = config.trends.slice(0, 9).filter((trend) => !state!.hidden.has(trend.id));
  const foregroundLabel = root.querySelector<HTMLElement>("[data-hmi-fx-foreground-label]");
  if (foregroundLabel) {
    foregroundLabel.hidden = shown.length <= 1; const select = foregroundLabel.querySelector("select")!;
    if (JSON.stringify([...select.options].map((option) => option.value)) !== JSON.stringify(shown.map((trend) => trend.id))) { select.replaceChildren(); for (const trend of shown) { const option = doc.createElement("option"); option.value = trend.id; option.textContent = trend.name; select.append(option); } }
    if (!shown.some((trend) => trend.id === state!.foreground)) state.foreground = shown[0]?.id;
    select.value = state.foreground ?? "";
  }
  const svg = root.querySelector<SVGSVGElement>(":scope > svg")!; svg.replaceChildren(); svg.setAttribute("aria-label", `${config.caption}: Y in funzione di X, ${shown.length} curve`);
  state.plots = []; svg.style.cursor = state.zoomArea ? "crosshair" : "default";
  const areas = config.areas.slice(0, 4); const total = areas.reduce((sum, area) => sum + Math.max(.25, area.weight), 0); let top = 10;
  for (const area of areas) {
    const height = (270 - (areas.length - 1) * 15) * Math.max(.25, area.weight) / total; const left = 58; const width = 562;
    const plotHeight = Math.max(15, height - 24); const group = fxText(svg, "g", "", { "data-hmi-fx-area": area.id });
    const curves = shown.filter((trend) => trend.areaId === area.id).sort((a, b) => Number(a.id === state!.foreground) - Number(b.id === state!.foreground));
    const points = curves.flatMap((trend) => state!.displayed.get(trend.id) ?? []);
    const xRange = state.views.get(area.id)?.x ?? fxAxisRange(area.xAxis, points.map((point) => point.x));
    const yRange = state.views.get(area.id)?.y ?? fxAxisRange(area.yAxis, [...points.map((point) => point.y), ...curves.flatMap((trend) => [trend.lowThreshold, trend.highThreshold].filter((value): value is number => value !== undefined))]);
    state.plots.push({ id: area.id, left, top, width, height: plotHeight, xRange, yRange });
    const px = (x: number) => { const value = fxAxisValue(x, area.xAxis.scale); return value === undefined ? undefined : left + (value - xRange[0]) / (xRange[1] - xRange[0]) * width; };
    const py = (y: number) => { const value = fxAxisValue(y, area.yAxis.scale); return value === undefined ? undefined : top + (1 - (value - yRange[0]) / (yRange[1] - yRange[0])) * plotHeight; };
    for (let tick = 0; tick <= 4; tick++) {
      const ratio = tick / 4; const x = left + width * ratio; const y = top + plotHeight * ratio;
      if (config.showGrid) { fxText(group, "line", "", { x1: x, y1: top, x2: x, y2: top + plotHeight, stroke: "#d7dcdf" }); fxText(group, "line", "", { x1: left, y1: y, x2: left + width, y2: y, stroke: "#d7dcdf" }); }
      fxText(group, "text", fxAxisLabel(xRange[0] + (xRange[1] - xRange[0]) * ratio, area.xAxis.scale), { x, y: top + plotHeight + 13, "text-anchor": "middle", "font-size": 9, fill: "#465057" });
      fxText(group, "text", fxAxisLabel(yRange[1] - (yRange[1] - yRange[0]) * ratio, area.yAxis.scale), { x: left - 5, y: y + 3, "text-anchor": "end", "font-size": 9, fill: "#465057" });
    }
    fxText(group, "rect", "", { x: left, y: top, width, height: plotHeight, fill: "none", stroke: "#70777c" });
    fxText(group, "text", `${area.name} · Y ${area.yAxis.unit ?? ""} / X ${area.xAxis.unit ?? ""}`, { x: left + 5, y: top + 11, "font-size": 9, fill: "#59636a" });
    const clip = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); clip.setAttribute("x", String(left)); clip.setAttribute("y", String(top)); clip.setAttribute("width", String(width)); clip.setAttribute("height", String(plotHeight)); clip.setAttribute("viewBox", `${left} ${top} ${width} ${plotHeight}`); clip.setAttribute("overflow", "hidden"); group.append(clip);
    for (const trend of curves) {
      const samples = state.displayed.get(trend.id) ?? []; const coords: [number, number][] = []; const valid: HmiFunctionTrendPoint[] = [];
      for (const point of samples) { const x = px(point.x); const y = py(point.y); if (x !== undefined && y !== undefined) { coords.push([x, y]); valid.push(point); } }
      if (trend.mode !== "points") fxText(clip, "path", "", { "data-hmi-fx-series": trend.id, d: fxPath(trend.mode, coords), fill: "none", stroke: fxArgb(trend.color), "stroke-width": trend.id === state.foreground ? 3 : 2 });
      else fxText(clip, "g", "", { "data-hmi-fx-series": trend.id });
      for (let index = 0; index < coords.length; index++) {
        const [x, y] = coords[index]; const point = valid[index]; const uncertain = [point.xQualityCode, point.yQualityCode].some((quality) => ["bad", "uncertain"].includes(fxQualityClass(quality)));
        if (trend.mode === "points" || trend.mode === "values" || uncertain) {
          const marker = fxText(clip, "circle", "", { cx: x, cy: y, r: uncertain ? 4 : 3, fill: uncertain ? "#fff" : fxArgb(trend.color), stroke: fxArgb(trend.color), "stroke-width": uncertain ? 2 : 1 });
          fxText(marker, "title", `X ${point.x}; Y ${point.y}; qualità X ${point.xQualityCode ?? "non disponibile"}; Y ${point.yQualityCode ?? "non disponibile"}`);
        }
        if (trend.mode === "values") fxText(clip, "text", `${point.x}, ${point.y}`, { x: x + 4, y: y - 4, fill: fxArgb(trend.color), "font-size": 9 });
      }
      for (const threshold of [trend.lowThreshold, trend.highThreshold]) if (threshold !== undefined) { const y = py(threshold); if (y !== undefined) fxText(clip, "line", "", { x1: left, x2: left + width, y1: y, y2: y, stroke: fxArgb(trend.color), "stroke-dasharray": "5 4" }); }
    }
    if (state.ruler?.areaId === area.id) {
      const x = left + width * state.ruler.ratio; const readings = curves.flatMap((trend) => {
        const closest = (state!.displayed.get(trend.id) ?? []).reduce<HmiFunctionTrendPoint | undefined>((best, point) => { const coordinate = px(point.x); return coordinate !== undefined && (!best || Math.abs(coordinate - x) < Math.abs((px(best.x) ?? x) - x)) ? point : best; }, undefined);
        return closest ? [`${trend.name}: X ${closest.x}, Y ${closest.y}`] : [];
      });
      fxText(group, "line", "", { x1: x, x2: x, y1: top, y2: top + plotHeight, stroke: "#20262b" });
      fxText(group, "text", readings.join(" · ") || "Nessuna coppia X/Y", { x: left + 5, y: top + 24, fill: "#20262b", "font-size": 10 });
    }
    top += height + 15;
  }
  if (!shown.some((trend) => state!.displayed.get(trend.id)?.length)) fxText(svg, "text", "Collega X e Y: nessuna coppia valida", { x: 320, y: 150, "text-anchor": "middle", fill: "#59636a", "font-size": 14 });
  if (config.showLegend) {
    for (const checkbox of root.querySelectorAll<HTMLInputElement>("[data-hmi-fx-visibility]")) { const trend = config.trends.find((trend) => trend.id === checkbox.dataset.hmiFxVisibility)!; checkbox.checked = !state.hidden.has(trend.id); checkbox.nextElementSibling!.textContent = `${trend.name} · ${state.displayed.get(trend.id)?.length ?? 0} punti`; }
  }
  const status = root.querySelector<HTMLElement>("[data-hmi-fx-status]")!; status.textContent = messages.join(" "); status.hidden = !messages.length;
  fxAreaZoom(svg, state.zoomArea, state.plots, (area) => { state!.views.set(area.id, { x: area.xRange, y: area.yRange }); state!.zoomArea = false; renderHmiFunctionTrendControl(host, state!.values, { ...state!.options, sample: false }); });
  return true;
}
export function renderHmiFunctionTrendControls(root: ParentNode, values: Readonly<Record<string, string>>, options: HmiFunctionTrendRenderOptions = {}): number {
  let rendered = 0;
  for (const host of root.querySelectorAll<HTMLElement>(`[${hmiFunctionTrendAttribute}]`)) if (renderHmiFunctionTrendControl(host, values, options)) rendered++;
  return rendered;
}
export function hmiFunctionTrendJsx(): string {
  return `<div data-hmi-type="HmiFunctionTrendControl" data-hmi-function-trend='${serializeHmiFunctionTrendConfig(defaultHmiFunctionTrendConfig())}' style={{ width: 640, height: 400, background: "#F7F8F9" }}>Configura le sorgenti X e Y dall'Inspector</div>`;
}
export function hmiFunctionTrendRuntimeModuleSource(): string {
  const helpers = [normalizeFxSource, normalizeFxAxis, normalizeFxRange, defaultHmiFunctionTrendConfig, parseHmiFunctionTrendConfig, functionTrendNumericValues, pairFunctionTrendSamples, fxSourceKey, fxBounds, fxVisibleRange, fxDownload, hostUrlApi, fxInstallListeners, fxToolbar, fxLocalDate, trendArgb, trendAxisValue, trendAxisLabel, trendAxisRange, trendPath, appendTrendText];
  return `// @ts-nocheck\nconst hmiFunctionTrendAttribute = ${JSON.stringify(hmiFunctionTrendAttribute)};\nconst functionTrendStates = new WeakMap();\nconst fxString = ${String(fxString)};\nconst fxNumber = ${String(fxNumber)};\nconst fxOptional = ${String(fxOptional)};\nconst fxBool = ${String(fxBool)};\nconst fxObject = ${String(fxObject)};\n${hmiTrendRuntimeUiModuleSource()}\n${helpers.map(String).join("\n")}\nconst fxText = appendTrendText;\nconst fxArgb = trendArgb;\nconst fxAxisLabel = trendAxisLabel;\nconst fxAxisRange = trendAxisRange;\nconst fxAxisValue = trendAxisValue;\nconst fxPath = trendPath;\nconst fxSourcePicker = renderTrendSourcePicker;\nconst fxAreaZoom = installTrendAreaZoom;\nconst fxZoomDragging = trendAreaZoomDragging;\nconst fxZoomRange = trendRuntimeZoomRange;\nconst fxQualityClass = trendQualityClass;\nexport ${String(renderHmiFunctionTrendControl)}\nexport ${String(renderHmiFunctionTrendControls)}\n`;
}
