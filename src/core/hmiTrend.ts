import type { PlcVariableDefinition } from "./plcVariables";
import type { HmiDataLogCatalog } from "./hmiDataLogs";
import { hmiTrendRuntimeUiModuleSource, installTrendAreaZoom, renderTrendSourcePicker, trendAreaZoomDragging, trendQualityClass, trendRuntimeZoomRange, type HmiTrendSourceCatalog, type HmiTrendSourceChoice, type HmiTrendZoomArea } from "./hmiTrendRuntimeUi";

const timeSourcePicker = renderTrendSourcePicker;
const timeAreaZoom = installTrendAreaZoom;
const timeZoomDragging = trendAreaZoomDragging;
const timeZoomRange = trendRuntimeZoomRange;
const timeQualityClass = trendQualityClass;

export const hmiTrendAttribute = "data-hmi-trend";
export const hmiTrendModes = ["points", "interpolated", "stepped", "values"] as const;
export type HmiTrendMode = (typeof hmiTrendModes)[number];
export type HmiTrendAxisSide = "left" | "right";
export type HmiTrendScale = "linear" | "logarithmic" | "negative-logarithmic";
export type HmiTrendSource = "online" | "log";

export interface HmiTrendAxis {
  minimum?: number;
  maximum?: number;
  scale: HmiTrendScale;
  unit?: string;
}

export interface HmiTrendSeries {
  id: string;
  name: string;
  tag: string;
  source: HmiTrendSource;
  logId?: string;
  loggedTagId?: string;
  areaId: string;
  color: string;
  mode: HmiTrendMode;
  axis: HmiTrendAxisSide;
  visible: boolean;
  lowThreshold?: number;
  highThreshold?: number;
}

export interface HmiTrendArea {
  id: string;
  name: string;
  weight: number;
  leftAxis?: HmiTrendAxis;
  rightAxis?: HmiTrendAxis;
}

export interface HmiTrendConfig {
  version: 1;
  caption: string;
  timeRangeMs: number;
  sampleIntervalMs: number;
  online: boolean;
  showToolbar: boolean;
  showLegend: boolean;
  showGrid: boolean;
  showRuler: boolean;
  backColor: string;
  plotColor: string;
  leftAxis: HmiTrendAxis;
  rightAxis: HmiTrendAxis;
  areas: HmiTrendArea[];
  trends: HmiTrendSeries[];
}

export interface HmiTrendIssue {
  severity: "error" | "warning";
  message: string;
}

export interface HmiTrendSample {
  time: number;
  value: number;
  qualityCode?: number;
}

export interface HmiTrendRenderOptions {
  now?: number;
  sample?: boolean;
  status?: Readonly<Record<string, { qualityCode?: number }>>;
  sources?: HmiTrendSourceCatalog;
  exportCsv?: (fileName: string, content: string) => void;
  history?: (trend: HmiTrendSeries, from: number, to: number) => readonly HmiTrendSample[];
}

interface HmiTrendState {
  signature: string;
  config: HmiTrendConfig;
  samples: Map<string, HmiTrendSample[]>;
  displayedSamples: Map<string, HmiTrendSample[]>;
  lastSampleAt?: number;
  paused: boolean;
  frozenAt?: number;
  zoom: number;
  panMs: number;
  rulerRatio?: number;
  hidden: Set<string>;
  windowOverrideMs?: number;
  values: Readonly<Record<string, string>>;
  options: HmiTrendRenderOptions;
  sources: Map<string, HmiTrendSourceChoice>;
  views: Map<string, { left: [number, number]; right: [number, number] }>;
  viewTime?: [number, number];
  plots: HmiTrendZoomArea[];
  zoomArea: boolean;
}

const trendStates = new WeakMap<HTMLElement, HmiTrendState>();
const trendListenerHosts = new WeakSet<HTMLElement>();

const trendString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const trendNumber = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const trendOptionalNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const trendBool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;

function normalizeTrendAxis(value: unknown): HmiTrendAxis {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const scale = ["linear", "logarithmic", "negative-logarithmic"].includes(String(item.scale)) ? item.scale as HmiTrendScale : "linear";
  return { minimum: trendOptionalNumber(item.minimum), maximum: trendOptionalNumber(item.maximum), scale, unit: trendString(item.unit) || undefined };
}

function normalizeTrendArea(value: unknown, index: number): HmiTrendArea {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    id: trendString(item.id, `area-${index + 1}`).trim() || `area-${index + 1}`,
    name: trendString(item.name, `Area ${index + 1}`).trim() || `Area ${index + 1}`,
    weight: Math.max(.25, Math.min(4, trendNumber(item.weight, 1))),
    leftAxis: item.leftAxis && typeof item.leftAxis === "object" ? normalizeTrendAxis(item.leftAxis) : undefined,
    rightAxis: item.rightAxis && typeof item.rightAxis === "object" ? normalizeTrendAxis(item.rightAxis) : undefined,
  };
}

function normalizeTrendSeries(value: unknown, index: number, fallbackAreaId = "area-1"): HmiTrendSeries {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const mode = hmiTrendModes.includes(item.mode as HmiTrendMode) ? item.mode as HmiTrendMode : "interpolated";
  return {
    id: trendString(item.id, `trend-${index + 1}`).trim() || `trend-${index + 1}`,
    name: trendString(item.name, `Curva ${index + 1}`).trim() || `Curva ${index + 1}`,
    tag: trendString(item.tag).trim(),
    source: item.source === "log" ? "log" : "online",
    logId: trendString(item.logId).trim() || undefined,
    loggedTagId: trendString(item.loggedTagId).trim() || undefined,
    areaId: trendString(item.areaId, fallbackAreaId).trim() || fallbackAreaId,
    color: trendString(item.color, ["#00A1D1", "#87BE32", "#F3A712", "#D43D51"][index % 4]),
    mode,
    axis: item.axis === "right" ? "right" : "left",
    visible: trendBool(item.visible, true),
    lowThreshold: trendOptionalNumber(item.lowThreshold),
    highThreshold: trendOptionalNumber(item.highThreshold),
  };
}

export function defaultHmiTrendConfig(): HmiTrendConfig {
  return {
    version: 1,
    caption: "Andamento processo",
    timeRangeMs: 60_000,
    sampleIntervalMs: 1_000,
    online: true,
    showToolbar: true,
    showLegend: true,
    showGrid: true,
    showRuler: true,
    backColor: "#FFF7F8F9",
    plotColor: "#FFFFFFFF",
    leftAxis: { scale: "linear" },
    rightAxis: { scale: "linear" },
    areas: [normalizeTrendArea({}, 0)],
    trends: [normalizeTrendSeries({}, 0, "area-1")],
  };
}

export function parseHmiTrendConfig(value: unknown): HmiTrendConfig | undefined {
  let raw = value;
  if (typeof value === "string") {
    if (!value.trim()) return undefined;
    try { raw = JSON.parse(value); } catch { return undefined; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const item = raw as Record<string, unknown>;
  const fallback = defaultHmiTrendConfig();
  const areas = Array.isArray(item.areas) && item.areas.length ? item.areas.map(normalizeTrendArea).slice(0, 4) : fallback.areas;
  return {
    version: 1,
    caption: trendString(item.caption, fallback.caption),
    timeRangeMs: Math.round(trendNumber(item.timeRangeMs, fallback.timeRangeMs)),
    sampleIntervalMs: Math.round(trendNumber(item.sampleIntervalMs, fallback.sampleIntervalMs)),
    online: trendBool(item.online, fallback.online),
    showToolbar: trendBool(item.showToolbar, fallback.showToolbar),
    showLegend: trendBool(item.showLegend, fallback.showLegend),
    showGrid: trendBool(item.showGrid, fallback.showGrid),
    showRuler: trendBool(item.showRuler, fallback.showRuler),
    backColor: trendString(item.backColor, fallback.backColor),
    plotColor: trendString(item.plotColor, fallback.plotColor),
    leftAxis: normalizeTrendAxis(item.leftAxis),
    rightAxis: normalizeTrendAxis(item.rightAxis),
    areas,
    trends: Array.isArray(item.trends) ? item.trends.map((trend, index) => normalizeTrendSeries(trend, index, areas[0].id)) : fallback.trends,
  };
}

export function serializeHmiTrendConfig(config: HmiTrendConfig): string {
  return JSON.stringify(parseHmiTrendConfig(config) ?? defaultHmiTrendConfig());
}

export function hmiTrendIssues(config: HmiTrendConfig, variables?: readonly PlcVariableDefinition[], dataLogs?: HmiDataLogCatalog): HmiTrendIssue[] {
  const issues: HmiTrendIssue[] = [];
  if (config.timeRangeMs < 1_000) issues.push({ severity: "error", message: "L'intervallo visualizzato deve essere almeno 1 secondo." });
  if (config.sampleIntervalMs < 100) issues.push({ severity: "error", message: "Il campionamento deve essere almeno 100 ms." });
  if (config.sampleIntervalMs > config.timeRangeMs) issues.push({ severity: "warning", message: "Il campionamento è più lento dell'intervallo: la curva avrà al massimo un punto." });
  if (!config.trends.length) issues.push({ severity: "error", message: "Il Trend Control deve avere almeno una curva." });
  if (config.trends.length > 9) issues.push({ severity: "error", message: "WinCC Unified consente al massimo nove curve per controllo." });
  if (!config.areas.length) issues.push({ severity: "error", message: "Il Trend Control deve avere almeno un'area." });
  if (config.areas.length > 4) issues.push({ severity: "error", message: "Framecraft supporta al massimo quattro aree per mantenere il grafico leggibile." });
  const areaIds = new Set<string>();
  for (const area of config.areas) {
    if (areaIds.has(area.id)) issues.push({ severity: "error", message: `L'identificatore area "${area.id}" è duplicato.` });
    areaIds.add(area.id);
    if (area.weight <= 0) issues.push({ severity: "error", message: `${area.name}: l'altezza relativa deve essere positiva.` });
  }
  const ids = new Set<string>();
  const declared = variables?.length ? new Set(variables.filter((variable) => !variable.detected).map((variable) => variable.name)) : undefined;
  for (const trend of config.trends) {
    if (ids.has(trend.id)) issues.push({ severity: "error", message: `L'identificatore curva "${trend.id}" è duplicato.` });
    ids.add(trend.id);
    if (!areaIds.has(trend.areaId)) issues.push({ severity: "error", message: `${trend.name}: l'area "${trend.areaId}" non esiste.` });
    if (trend.source === "online") {
      if (!trend.tag) issues.push({ severity: "warning", message: `${trend.name}: collega un tag per raccogliere valori reali.` });
      else if (declared && !declared.has(trend.tag)) issues.push({ severity: "warning", message: `${trend.name}: il tag "${trend.tag}" non è dichiarato nel catalogo PLC.` });
    } else {
      const log = dataLogs?.logs.find((candidate) => candidate.id === trend.logId);
      const loggedTag = log?.tags.find((candidate) => candidate.id === trend.loggedTagId);
      if (!trend.logId || !trend.loggedTagId) issues.push({ severity: "error", message: `${trend.name}: scegli Data Log e variabile archiviata.` });
      else if (dataLogs && (!log || !loggedTag)) issues.push({ severity: "error", message: `${trend.name}: la sorgente archivio ${trend.logId}/${trend.loggedTagId} non esiste.` });
    }
    if (trend.lowThreshold !== undefined && trend.highThreshold !== undefined && trend.lowThreshold >= trend.highThreshold) issues.push({ severity: "error", message: `${trend.name}: la soglia bassa deve essere minore di quella alta.` });
  }
  const axes: Array<readonly [string, HmiTrendAxis]> = [["sinistro", config.leftAxis], ["destro", config.rightAxis]];
  for (const area of config.areas) {
    if (area.leftAxis) axes.push([`${area.name} sinistro`, area.leftAxis]);
    if (area.rightAxis) axes.push([`${area.name} destro`, area.rightAxis]);
  }
  for (const [label, axis] of axes) {
    if (axis.minimum !== undefined && axis.maximum !== undefined && axis.minimum >= axis.maximum) issues.push({ severity: "error", message: `Asse ${label}: il minimo deve essere minore del massimo.` });
    if (axis.scale === "logarithmic" && (axis.minimum ?? 1) <= 0) issues.push({ severity: "error", message: `Asse ${label}: la scala logaritmica accetta soltanto valori positivi.` });
    if (axis.scale === "negative-logarithmic" && (axis.maximum ?? -1) >= 0) issues.push({ severity: "error", message: `Asse ${label}: la scala logaritmica negativa accetta soltanto valori negativi.` });
  }
  return issues;
}

export function trendArgb(value: string): string {
  const hex = value.replace("#", "");
  if (!/^[0-9a-f]{8}$/i.test(hex)) return value;
  const alpha = Number.parseInt(hex.slice(0, 2), 16);
  const red = Number.parseInt(hex.slice(2, 4), 16);
  const green = Number.parseInt(hex.slice(4, 6), 16);
  const blue = Number.parseInt(hex.slice(6, 8), 16);
  return alpha === 255 ? `#${hex.slice(2)}` : `rgba(${red}, ${green}, ${blue}, ${Number((alpha / 255).toFixed(3))})`;
}

export function trendAxisValue(value: number, scale: HmiTrendScale): number | undefined {
  if (scale === "logarithmic") return value > 0 ? Math.log10(value) : undefined;
  if (scale === "negative-logarithmic") return value < 0 ? -Math.log10(-value) : undefined;
  return value;
}

export function trendAxisLabel(value: number, scale: HmiTrendScale): string {
  const restored = scale === "logarithmic" ? 10 ** value : scale === "negative-logarithmic" ? -(10 ** -value) : value;
  return Number(restored.toPrecision(4)).toString();
}

export function trendAxisRange(config: HmiTrendAxis, samples: readonly number[]): [number, number] {
  const converted = samples.map((value) => trendAxisValue(value, config.scale)).filter((value): value is number => value !== undefined && Number.isFinite(value));
  let minimum = config.minimum === undefined ? converted.reduce((smallest, value) => Math.min(smallest, value), Infinity) : trendAxisValue(config.minimum, config.scale) ?? 0;
  let maximum = config.maximum === undefined ? converted.reduce((largest, value) => Math.max(largest, value), -Infinity) : trendAxisValue(config.maximum, config.scale) ?? 1;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) { minimum = 0; maximum = 100; }
  if (minimum === maximum) { const margin = Math.max(1, Math.abs(minimum) * .1); minimum -= margin; maximum += margin; }
  if (config.minimum === undefined || config.maximum === undefined) {
    const margin = (maximum - minimum) * .08;
    if (config.minimum === undefined) minimum -= margin;
    if (config.maximum === undefined) maximum += margin;
  }
  return [minimum, maximum];
}

export function trendPath(mode: HmiTrendMode, points: readonly [number, number][]): string {
  if (!points.length) return "";
  if (mode !== "stepped") return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  return points.slice(1).reduce((path, [x, y], index) => `${path} H${x.toFixed(2)} V${y.toFixed(2)}`, `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`);
}

function trendCsv(config: HmiTrendConfig, state: HmiTrendState): string {
  const rows = ["timestamp;trend;tag;value;source;qualityCode"];
  for (const trend of config.trends) for (const sample of state.displayedSamples.get(trend.id) ?? state.samples.get(trend.id) ?? []) rows.push(`${new Date(sample.time).toISOString()};${trend.name.replaceAll(";", ",")};${trend.tag.replaceAll(";", ",")};${sample.value};${trend.source};${sample.qualityCode ?? ""}`);
  return `${rows.join("\n")}\n`;
}

function downloadTrendCsv(config: HmiTrendConfig, state: HmiTrendState, options: HmiTrendRenderOptions) {
  const fileName = `${config.caption.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "trend"}.csv`;
  const content = trendCsv(config, state);
  if (options.exportCsv) { options.exportCsv(fileName, content); return; }
  if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url);
}

export function appendTrendText(parent: Element, name: string, text: string, attributes: Record<string, string | number> = {}) {
  const element = parent.ownerDocument.createElementNS("http://www.w3.org/2000/svg", name);
  element.textContent = text;
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  parent.append(element);
  return element;
}

function trendState(host: HTMLElement, config: HmiTrendConfig): HmiTrendState {
  const signature = JSON.stringify(config);
  const current = trendStates.get(host);
  if (current?.signature === signature) return current;
  host.querySelector(":scope > [data-hmi-trend-root]")?.replaceChildren();
  const state: HmiTrendState = { signature, config, samples: new Map(), displayedSamples: new Map(), paused: false, zoom: 1, panMs: 0, hidden: new Set(config.trends.filter((trend) => !trend.visible).map((trend) => trend.id)), values: {}, options: {}, sources: new Map(), views: new Map(), plots: [], zoomArea: false };
  trendStates.set(host, state);
  return state;
}

function installTrendListeners(host: HTMLElement) {
  if (trendListenerHosts.has(host)) return;
  trendListenerHosts.add(host);
  host.addEventListener("click", (event) => {
    const state = trendStates.get(host); const target = event.target as Element | null;
    if (!state || target?.nodeType !== 1) return;
    const config = state.config; const action = target.closest<HTMLElement>("[data-hmi-trend-action]")?.dataset.hmiTrendAction;
    const now = state.options.now ?? Date.now();
    if (action === "pause") { state.paused = !state.paused; state.frozenAt = state.paused ? now : undefined; }
    else if (action === "zoom-in" || action === "zoom-out") {
      if (state.viewTime) state.viewTime = timeZoomRange(state.viewTime, action === "zoom-in" ? 2 : .5);
      else state.zoom = Math.max(.25, Math.min(16, state.zoom * (action === "zoom-in" ? 2 : .5)));
    } else if (action === "previous" || action === "next") {
      if (state.viewTime) state.viewTime = timeZoomRange(state.viewTime, 1, action === "previous" ? -.5 : .5);
      else state.panMs = Math.max(0, state.panMs + (action === "previous" ? 1 : -1) * (state.windowOverrideMs ?? config.timeRangeMs) / state.zoom / 2);
    } else if (action === "original") { state.zoom = 1; state.panMs = 0; state.windowOverrideMs = undefined; state.viewTime = undefined; state.views.clear(); state.zoomArea = false; }
    else if (action === "zoom-area") state.zoomArea = !state.zoomArea;
    else if (action === "ruler") state.rulerRatio = state.rulerRatio === undefined ? .5 : undefined;
    else if (action === "export") downloadTrendCsv(config, state, state.options);
    else if (target.closest("[data-hmi-trend-plot]") && config.showRuler && !state.zoomArea) {
      const plot = target.closest<SVGSVGElement>("[data-hmi-trend-plot]")!; const box = plot.getBoundingClientRect();
      state.rulerRatio = box.width ? Math.max(0, Math.min(1, ((event.clientX - box.left) / box.width * 640 - 54) / 532)) : .5;
    }
    if (action || target.closest("[data-hmi-trend-plot]")) renderHmiTrendControl(host, state.values, { ...state.options, sample: false });
  });
  host.addEventListener("change", (event) => {
    const state = trendStates.get(host); const target = event.target as HTMLInputElement | HTMLSelectElement | null;
    if (!state || target?.nodeType !== 1) return;
    if (target.dataset.hmiTrendRange !== undefined) { state.windowOverrideMs = Number(target.value) || undefined; state.viewTime = undefined; state.views.clear(); state.zoom = 1; state.panMs = 0; }
    else if (target.dataset.hmiTrendVisibility) {
      if ((target as HTMLInputElement).checked) state.hidden.delete(target.dataset.hmiTrendVisibility); else state.hidden.add(target.dataset.hmiTrendVisibility);
    } else return;
    renderHmiTrendControl(host, state.values, { ...state.options, sample: false });
  });
}

function trendChrome(root: HTMLElement, config: HmiTrendConfig) {
  const doc = root.ownerDocument;
  const style = doc.createElement("style"); style.textContent = "[data-hmi-trend-root] :is(button,input,select,summary):focus-visible{outline:2px solid #00647d;outline-offset:2px}[data-hmi-trend-root] button:hover{background:#e2f3f7!important}"; root.append(style);
  const caption = doc.createElement("header"); Object.assign(caption.style, { padding: "7px 10px", background: "#3f464c", color: "#fff", fontWeight: "700" }); root.append(caption);
  if (config.showToolbar) {
    const toolbar = doc.createElement("div"); toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", "Comandi Trend Control"); Object.assign(toolbar.style, { display: "flex", gap: "4px", alignItems: "center", padding: "5px 7px", borderBottom: "1px solid #c8cdd0", background: "#eef1f2", flexWrap: "wrap" });
    for (const [action, label] of [["pause", "Arresta"], ["zoom-in", "Zoom +"], ["zoom-out", "Zoom −"], ["zoom-area", "Zoom area"], ["previous", "Precedente"], ["next", "Successivo"], ["original", "Vista originale"], ["ruler", "Righello"], ["export", "CSV"]]) {
      const button = doc.createElement("button"); button.type = "button"; button.dataset.hmiTrendAction = action; button.textContent = label; button.title = label;
      Object.assign(button.style, { minHeight: "44px", border: "1px solid #8a949b", borderRadius: "3px", background: "#fff", color: "#20262b", padding: "3px 7px", cursor: "pointer" }); toolbar.append(button);
    }
    const range = doc.createElement("select"); range.dataset.hmiTrendRange = ""; range.setAttribute("aria-label", "Intervallo visualizzato"); range.style.minHeight = "44px";
    const ranges = new Map<number, string>([[30_000, "30 s"], [60_000, "1 min"], [300_000, "5 min"], [900_000, "15 min"]]); if (!ranges.has(config.timeRangeMs)) ranges.set(config.timeRangeMs, String(config.timeRangeMs / 1000) + " s (progetto)");
    for (const [value, label] of [...ranges].sort((a, b) => a[0] - b[0])) { const option = doc.createElement("option"); option.value = String(value); option.textContent = label; range.append(option); } toolbar.append(range); root.append(toolbar);
    const sources = doc.createElement("div"); sources.dataset.hmiTrendSourcesRoot = ""; root.append(sources);
  }
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.dataset.hmiTrendPlot = ""; svg.setAttribute("role", "img"); svg.setAttribute("viewBox", "0 0 640 260"); svg.setAttribute("preserveAspectRatio", "none"); Object.assign(svg.style, { width: "100%", minHeight: "160px", flex: "1 0 160px", background: trendArgb(config.plotColor), touchAction: "none" }); root.append(svg);
  if (config.showLegend) {
    const legend = doc.createElement("div"); legend.dataset.hmiTrendLegend = ""; Object.assign(legend.style, { display: "flex", gap: "12px", alignItems: "center", padding: "5px 9px", borderTop: "1px solid #c8cdd0", flexWrap: "wrap", background: "#f7f8f9" });
    for (const trend of config.trends) {
      const label = doc.createElement("label"); Object.assign(label.style, { display: "inline-flex", gap: "5px", alignItems: "center", minHeight: "44px", cursor: "pointer" });
      const input = doc.createElement("input"); input.type = "checkbox"; input.dataset.hmiTrendVisibility = trend.id;
      const mark = doc.createElement("i"); Object.assign(mark.style, { width: "18px", borderTop: "3px solid " + trendArgb(trend.color) });
      const text = doc.createElement("span"); label.append(input, mark, text); legend.append(label);
    } root.append(legend);
  }
  const quality = doc.createElement("p"); quality.dataset.hmiTrendQualityNote = ""; Object.assign(quality.style, { margin: "0", padding: "4px 9px", background: "#fff3dd", color: "#7a4200" }); root.append(quality);
}

export function renderHmiTrendControl(host: HTMLElement, values: Readonly<Record<string, string>>, options: HmiTrendRenderOptions = {}): boolean {
  const designed = parseHmiTrendConfig(host.dataset.hmiTrend); if (!designed) return false;
  const doc = host.ownerDocument; let root = host.querySelector<HTMLElement>(":scope > [data-hmi-trend-root]");
  if (!root && host.children.length) return false;
  if (!root) { root = doc.createElement("section"); root.dataset.hmiTrendRoot = ""; host.replaceChildren(root); }
  const state = trendState(host, designed);
  const config = { ...designed, trends: designed.trends.map((trend) => ({ ...trend, ...state.sources.get(trend.id) })) };
  state.config = config; state.values = values; state.options = options;
  installTrendListeners(host);
  const now = options.now ?? Date.now();
  if (config.online && options.sample !== false && (state.lastSampleAt === undefined || now - state.lastSampleAt >= Math.max(100, config.sampleIntervalMs))) {
    state.lastSampleAt = now;
    for (const trend of config.trends.filter((item) => item.source === "online")) {
      const rawValue = values[trend.tag]; const value = rawValue?.trim() ? Number(rawValue) : NaN;
      if (!trend.tag || !Number.isFinite(value)) continue;
      const samples = state.samples.get(trend.id) ?? [];
      samples.push({ time: now, value, qualityCode: options.status?.[trend.tag]?.qualityCode });
      const keepAfter = now - Math.max(config.timeRangeMs * 16, 60_000);
      let first = 0; while (first < samples.length - 1 && samples[first].time < keepAfter) first++;
      if (first) samples.splice(0, first); if (samples.length > 100_000) samples.splice(0, samples.length - 100_000);
      state.samples.set(trend.id, samples);
    }
  }
  const existingPlot = root.querySelector<SVGSVGElement>(":scope > svg");
  if (existingPlot && !state.zoomArea) timeAreaZoom(existingPlot, false, state.plots, () => {});
  if (existingPlot && timeZoomDragging(existingPlot)) return true;
  if (!root.querySelector(":scope > header")) trendChrome(root, config);
  root.setAttribute("aria-label", config.caption || "Trend Control");
  Object.assign(root.style, { display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: "240px", overflow: "auto", border: "1px solid #70777c", background: trendArgb(config.backColor), color: "#20262b", font: "12px/1.25 system-ui,sans-serif" });
  root.querySelector("header")!.textContent = config.caption + (state.paused ? " · vista ferma" : "");
  const pause = root.querySelector<HTMLButtonElement>('[data-hmi-trend-action="pause"]'); if (pause) { pause.textContent = state.paused ? "Avvia" : "Arresta"; pause.setAttribute("aria-pressed", String(state.paused)); }
  root.querySelector('[data-hmi-trend-action="ruler"]')?.setAttribute("aria-pressed", String(state.rulerRatio !== undefined));
  root.querySelector('[data-hmi-trend-action="zoom-area"]')?.setAttribute("aria-pressed", String(state.zoomArea));
  const rangeSelect = root.querySelector<HTMLSelectElement>("[data-hmi-trend-range]"); if (rangeSelect) rangeSelect.value = String(state.windowOverrideMs ?? config.timeRangeMs);
  const sourceRoot = root.querySelector<HTMLElement>("[data-hmi-trend-sources-root]");
  if (sourceRoot) timeSourcePicker(sourceRoot, designed.trends.map((trend) => ({ id: trend.id, name: trend.name, sources: { value: { source: trend.source, tag: trend.tag, logId: trend.logId, loggedTagId: trend.loggedTagId } } })), { tags: [...new Set([...(options.sources?.tags ?? []), ...Object.keys(values), ...designed.trends.filter((trend) => trend.source === "online").map((trend) => trend.tag).filter(Boolean)])].sort(), logs: options.sources?.logs ?? [] }, (id, sources) => {
    state.sources.set(id, sources.value); state.samples.delete(id); state.displayedSamples.delete(id); state.lastSampleAt = undefined; state.views.clear(); state.viewTime = undefined;
    renderHmiTrendControl(host, state.values, { ...state.options, sample: false });
  }, () => { state.sources.clear(); state.samples.clear(); state.displayedSamples.clear(); state.lastSampleAt = undefined; state.views.clear(); state.viewTime = undefined; renderHmiTrendControl(host, state.values, { ...state.options, sample: false }); });
  const svg = root.querySelector<SVGSVGElement>(":scope > svg")!; svg.replaceChildren(); svg.setAttribute("aria-label", config.caption + ": " + config.trends.length + " curve in " + config.areas.length + " aree"); svg.style.cursor = state.zoomArea ? "crosshair" : "default";
  state.plots = [];
  const baseEnd = state.paused ? state.frozenAt ?? now : now;
  const end = state.viewTime?.[1] ?? baseEnd - state.panMs;
  const start = state.viewTime?.[0] ?? end - (state.windowOverrideMs ?? config.timeRangeMs) / state.zoom;
  const windowMs = end - start;
  const shown = config.trends.filter((trend) => !state.hidden.has(trend.id));
  const visibleSamples = new Map<string, HmiTrendSample[]>();
  for (const trend of shown) {
    const source = state.paused ? state.displayedSamples.get(trend.id) ?? [] : trend.source === "log" && options.history ? options.history(trend, start, end) : state.samples.get(trend.id) ?? [];
    visibleSamples.set(trend.id, source.filter((sample) => sample.time >= start && sample.time <= end).map((sample) => ({ ...sample })));
  }
  state.displayedSamples = visibleSamples;
  const qualityCounts = [...visibleSamples.values()].flat().reduce((counts, sample) => { const quality = timeQualityClass(sample.qualityCode); if (quality === "bad" || quality === "uncertain") counts[quality]++; return counts; }, { bad: 0, uncertain: 0 });
  const qualityNote = root.querySelector<HTMLElement>("[data-hmi-trend-quality-note]")!; qualityNote.hidden = !qualityCounts.bad && !qualityCounts.uncertain;
  qualityNote.textContent = "Qualità campioni: " + qualityCounts.uncertain + " incerti (cerchio vuoto), " + qualityCounts.bad + " non validi (croce; linea interrotta).";
  const plotLeft = 54; const plotWidth = 532; const plotTop = 14; const plotBottom = 222; const areaGap = config.areas.length > 1 ? 7 : 0;
  const totalWeight = config.areas.reduce((sum, area) => sum + area.weight, 0) || 1;
  let nextTop = plotTop;
  const plots = config.areas.map((area, index) => {
    const available = plotBottom - plotTop - areaGap * (config.areas.length - 1);
    const height = index === config.areas.length - 1 ? plotBottom - nextTop : available * area.weight / totalWeight;
    const plot = { area, left: plotLeft, top: nextTop, width: plotWidth, height };
    nextTop += height + areaGap;
    return plot;
  });
  for (const [areaIndex, plot] of plots.entries()) {
    const areaGroup = doc.createElementNS("http://www.w3.org/2000/svg", "g"); areaGroup.setAttribute("data-hmi-trend-area", plot.area.id); svg.append(areaGroup);
    const areaTrends = shown.filter((trend) => trend.areaId === plot.area.id);
    const leftAxis = plot.area.leftAxis ?? config.leftAxis; const rightAxis = plot.area.rightAxis ?? config.rightAxis;
    const leftRange = state.views.get(plot.area.id)?.left ?? trendAxisRange(leftAxis, areaTrends.filter((trend) => trend.axis === "left").flatMap((trend) => (visibleSamples.get(trend.id) ?? []).map((sample) => sample.value)));
    const rightRange = state.views.get(plot.area.id)?.right ?? trendAxisRange(rightAxis, areaTrends.filter((trend) => trend.axis === "right").flatMap((trend) => (visibleSamples.get(trend.id) ?? []).map((sample) => sample.value)));
    state.plots.push({ id: plot.area.id, left: plot.left, top: plot.top, width: plot.width, height: plot.height, xRange: [start, end], yRange: leftRange, rightRange });
    const grid = doc.createElementNS("http://www.w3.org/2000/svg", "g"); grid.setAttribute("stroke", "#d7dcdf"); grid.setAttribute("stroke-width", "1"); areaGroup.append(grid);
    for (let index = 0; index <= 4; index += 1) {
      const y = plot.top + plot.height * index / 4;
      if (config.showGrid) appendTrendText(grid, "line", "", { x1: plot.left, y1: y, x2: plot.left + plot.width, y2: y });
      const leftValue = leftRange[1] - (leftRange[1] - leftRange[0]) * index / 4;
      appendTrendText(areaGroup, "text", trendAxisLabel(leftValue, leftAxis.scale), { x: 49, y: y + 3, "text-anchor": "end", fill: "#465057", "font-size": 9 });
      if (areaTrends.some((trend) => trend.axis === "right")) { const rightValue = rightRange[1] - (rightRange[1] - rightRange[0]) * index / 4; appendTrendText(areaGroup, "text", trendAxisLabel(rightValue, rightAxis.scale), { x: 591, y: y + 3, "text-anchor": "start", fill: "#465057", "font-size": 9 }); }
    }
    for (let index = 0; index <= 5; index += 1) {
      const x = plot.left + plot.width * index / 5;
      if (config.showGrid) appendTrendText(grid, "line", "", { x1: x, y1: plot.top, x2: x, y2: plot.top + plot.height });
      if (areaIndex === plots.length - 1) appendTrendText(svg, "text", new Date(start + windowMs * index / 5).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), { x, y: 244, "text-anchor": "middle", fill: "#465057", "font-size": 10 });
    }
    appendTrendText(areaGroup, "rect", "", { x: plot.left, y: plot.top, width: plot.width, height: plot.height, fill: "none", stroke: "#70777c" });
    appendTrendText(areaGroup, "text", plot.area.name, { x: plot.left + 5, y: plot.top + 11, fill: "#59636a", "font-size": 8, "font-weight": 700 });
    if (leftAxis.unit) appendTrendText(areaGroup, "text", leftAxis.unit, { x: 8, y: plot.top + 9, fill: "#465057", "font-size": 9, "font-weight": 700 });
    if (rightAxis.unit && areaTrends.some((trend) => trend.axis === "right")) appendTrendText(areaGroup, "text", rightAxis.unit, { x: 632, y: plot.top + 9, "text-anchor": "end", fill: "#465057", "font-size": 9, "font-weight": 700 });
    const clip = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); clip.setAttribute("x", String(plot.left)); clip.setAttribute("y", String(plot.top)); clip.setAttribute("width", String(plot.width)); clip.setAttribute("height", String(plot.height)); clip.setAttribute("viewBox", [plot.left, plot.top, plot.width, plot.height].join(" ")); clip.setAttribute("overflow", "hidden"); areaGroup.append(clip);
    for (const trend of areaTrends) {
      const samples = visibleSamples.get(trend.id) ?? [];
      const axis = trend.axis === "right" ? rightAxis : leftAxis;
      const range = trend.axis === "right" ? rightRange : leftRange;
      const points = samples.flatMap((sample): { sample: HmiTrendSample; xy: [number, number] }[] => {
        const scaled = trendAxisValue(sample.value, axis.scale); return scaled === undefined ? [] : [{ sample, xy: [plot.left + (sample.time - start) / windowMs * plot.width, plot.top + (1 - (scaled - range[0]) / (range[1] - range[0])) * plot.height] }];
      });
      const segments: [number, number][][] = []; let segment: [number, number][] = [];
      for (const point of points) { if (timeQualityClass(point.sample.qualityCode) === "bad") { if (segment.length) segments.push(segment); segment = []; } else segment.push(point.xy); } if (segment.length) segments.push(segment);
      const path = appendTrendText(clip, "path", "", { d: trend.mode === "points" ? "" : segments.map((segment) => trendPath(trend.mode, segment)).join(" "), fill: "none", stroke: trendArgb(trend.color), "stroke-width": 2, "vector-effect": "non-scaling-stroke" }); path.setAttribute("data-hmi-trend-series", trend.id);
      for (const { sample, xy: [x, y] } of points) {
        const quality = timeQualityClass(sample.qualityCode); const invalid = quality === "bad" || quality === "uncertain";
        if (trend.mode === "points" || trend.mode === "values" || invalid) {
          const marker = quality === "bad"
            ? appendTrendText(clip, "path", "", { d: "M" + (x - 4) + " " + (y - 4) + "L" + (x + 4) + " " + (y + 4) + "M" + (x - 4) + " " + (y + 4) + "L" + (x + 4) + " " + (y - 4), fill: "none", stroke: trendArgb(trend.color), "stroke-width": 2 })
            : appendTrendText(clip, "circle", "", { cx: x, cy: y, r: invalid ? 4 : 3, fill: invalid ? "#fff" : trendArgb(trend.color), stroke: trendArgb(trend.color), "stroke-width": invalid ? 2 : 1 });
          marker.setAttribute("data-hmi-trend-quality", quality);
          appendTrendText(marker, "title", trend.name + ": " + sample.value + "; qualità " + quality + " (" + (sample.qualityCode ?? "non disponibile") + ")");
        }
        if (trend.mode === "values") appendTrendText(clip, "text", String(sample.value), { x: x + 4, y: y - 4, fill: trendArgb(trend.color), "font-size": 9 });
      }
      for (const [kind, threshold] of [["low", trend.lowThreshold], ["high", trend.highThreshold]] as const) {
        if (threshold === undefined) continue; const scaled = trendAxisValue(threshold, axis.scale); if (scaled === undefined) continue;
        const y = plot.top + (1 - (scaled - range[0]) / (range[1] - range[0])) * plot.height;
        appendTrendText(clip, "line", "", { x1: plot.left, y1: y, x2: plot.left + plot.width, y2: y, stroke: trendArgb(trend.color), "stroke-dasharray": kind === "low" ? "4 4" : "8 4", opacity: .65 });
      }
    }
  }
  if (state.rulerRatio !== undefined) {
    const x = plotLeft + plotWidth * state.rulerRatio; const at = start + windowMs * state.rulerRatio;
    appendTrendText(svg, "line", "", { x1: x, y1: plotTop, x2: x, y2: plotBottom, stroke: "#20262b", "stroke-width": 1.5 });
    const readings = shown.flatMap((trend) => { const samples = visibleSamples.get(trend.id) ?? []; const closest = samples.reduce<HmiTrendSample | undefined>((best, sample) => !best || Math.abs(sample.time - at) < Math.abs(best.time - at) ? sample : best, undefined); return closest ? [`${trend.name}: ${closest.value}`] : []; });
    appendTrendText(svg, "text", readings.join("  ·  ") || "Nessun campione", { x: Math.min(x + 5, 420), y: plotTop + 13, fill: "#20262b", "font-size": 10, "font-weight": 700 });
  }
  if (!config.trends.some((trend) => trend.source === "online" ? trend.tag : trend.logId && trend.loggedTagId)) appendTrendText(svg, "text", "Collega una sorgente dall'Inspector", { x: 320, y: 128, "text-anchor": "middle", fill: "#677178", "font-size": 14 });
  for (const input of root.querySelectorAll<HTMLInputElement>("[data-hmi-trend-visibility]")) {
    const trend = config.trends.find((trend) => trend.id === input.dataset.hmiTrendVisibility)!; input.checked = !state.hidden.has(trend.id);
    input.parentElement!.querySelector("span")!.textContent = trend.name + (trend.source === "log" ? " · storico" : "") + (trend.axis === "right" ? " (dx)" : "");
  }
  timeAreaZoom(svg, state.zoomArea, state.plots, (area) => {
    state.viewTime = area.xRange; state.views.set(area.id, { left: area.yRange, right: area.rightRange! }); state.zoomArea = false;
    renderHmiTrendControl(host, state.values, { ...state.options, sample: false });
  });
  return true;
}

export function renderHmiTrendControls(root: ParentNode, values: Readonly<Record<string, string>>, options: HmiTrendRenderOptions = {}): number {
  let rendered = 0;
  for (const host of root.querySelectorAll<HTMLElement>(`[${hmiTrendAttribute}]`)) if (renderHmiTrendControl(host, values, options)) rendered += 1;
  return rendered;
}

export function clearHmiTrendHistory(host: HTMLElement) {
  trendStates.delete(host);
  host.querySelector(":scope > [data-hmi-trend-root]")?.remove();
}

export function hmiTrendJsx(): string {
  return `      <div data-hmi-type="HmiTrendControl" data-hmi-trend='${serializeHmiTrendConfig(defaultHmiTrendConfig())}' style={{ width: 640, height: 320, background: "#F7F8F9" }}>Configura il Trend Control dall'Inspector</div>\n`;
}

export function hmiTrendRuntimeModuleSource(): string {
  return `// @ts-nocheck\nconst hmiTrendAttribute = ${JSON.stringify(hmiTrendAttribute)};\nconst hmiTrendModes = ${JSON.stringify(hmiTrendModes)};\nconst trendStates = new WeakMap();\nconst trendListenerHosts = new WeakSet();\n${hmiTrendRuntimeUiModuleSource()}\nconst timeSourcePicker = renderTrendSourcePicker;\nconst timeAreaZoom = installTrendAreaZoom;\nconst timeZoomDragging = trendAreaZoomDragging;\nconst timeZoomRange = trendRuntimeZoomRange;\nconst timeQualityClass = trendQualityClass;\nconst trendString = ${String(trendString)};\nconst trendNumber = ${String(trendNumber)};\nconst trendOptionalNumber = ${String(trendOptionalNumber)};\nconst trendBool = ${String(trendBool)};\n${String(normalizeTrendAxis)}\n${String(normalizeTrendArea)}\n${String(normalizeTrendSeries)}\n${String(defaultHmiTrendConfig)}\nexport ${String(parseHmiTrendConfig)}\n${String(trendArgb)}\n${String(trendAxisValue)}\n${String(trendAxisLabel)}\n${String(trendAxisRange)}\n${String(trendPath)}\n${String(trendCsv)}\n${String(downloadTrendCsv)}\n${String(appendTrendText)}\n${String(trendState)}\n${String(installTrendListeners)}\n${String(trendChrome)}\nexport ${String(renderHmiTrendControl)}\nexport ${String(renderHmiTrendControls)}\nexport ${String(clearHmiTrendHistory)}\n`;
}
