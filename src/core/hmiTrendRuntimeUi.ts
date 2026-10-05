export interface HmiTrendSourceChoice { source: "online" | "log"; tag: string; logId?: string; loggedTagId?: string }
export interface HmiTrendSourceCatalog {
  tags: readonly string[];
  logs: readonly { id: string; name: string; tags: readonly { id: string; name: string; tag: string }[] }[];
}
export interface HmiTrendSourceCurve { id: string; name: string; sources: Record<string, HmiTrendSourceChoice> }
export interface HmiTrendZoomArea {
  id: string; left: number; top: number; width: number; height: number;
  xRange: [number, number]; yRange: [number, number]; rightRange?: [number, number];
}
interface TrendPickerState {
  curves: HmiTrendSourceCurve[]; catalog: HmiTrendSourceCatalog;
  apply: (id: string, sources: Record<string, HmiTrendSourceChoice>) => void; reset: () => void;
  drafts: Map<string, Record<string, HmiTrendSourceChoice>>; selected?: string; catalogSignature: string;
}
interface TrendAreaZoomState {
  active: boolean; areas: HmiTrendZoomArea[]; apply: (area: HmiTrendZoomArea) => void;
  drag?: { pointerId: number; area: HmiTrendZoomArea; start: [number, number]; end: [number, number] };
}
const trendPickerStates = new WeakMap<HTMLElement, TrendPickerState>();
const trendAreaZoomStates = new WeakMap<SVGSVGElement, TrendAreaZoomState>();

function trendUiClone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function trendPickerChoices(select: HTMLSelectElement, choices: readonly [string, string][], value: string) {
  select.replaceChildren();
  for (const [id, text] of choices) { const option = select.ownerDocument.createElement("option"); option.value = id; option.textContent = text; select.append(option); }
  select.value = value;
}
function trendPickerFields(details: HTMLElement, state: TrendPickerState) {
  const doc = details.ownerDocument; const curve = state.curves.find((curve) => curve.id === state.selected); if (!curve) return;
  const fields = details.querySelector<HTMLElement>("[data-trend-source-fields]")!; fields.replaceChildren();
  const draft = state.drafts.get(curve.id) ?? trendUiClone(curve.sources); state.drafts.set(curve.id, draft);
  for (const [coordinate, source] of Object.entries(draft)) {
    const fieldset = doc.createElement("fieldset"); fieldset.dataset.trendSourceCoordinate = coordinate; Object.assign(fieldset.style, { display: "flex", flexWrap: "wrap", gap: "8px", border: "1px solid #b7c0c6", margin: "6px 0", padding: "8px" });
    const legend = doc.createElement("legend"); legend.textContent = coordinate === "value" ? "Valori Y" : `Sorgente ${coordinate.toUpperCase()}`; fieldset.append(legend);
    for (const [field, text] of [["source", "Origine"], ["tag", "Variabile PLC"], ["logId", "Data Log"], ["loggedTagId", "Variabile archiviata"]]) {
      const label = doc.createElement("label"); Object.assign(label.style, { display: "grid", gap: "4px", minWidth: "120px", maxWidth: "100%" }); label.textContent = text;
      const select = doc.createElement("select"); select.dataset.trendSourceField = field; select.style.minHeight = "44px"; select.style.maxWidth = "100%"; label.append(select); fieldset.append(label);
    }
    fields.append(fieldset); trendPickerUpdateFields(fieldset, source, state.catalog);
  }
}
function trendPickerUpdateFields(fieldset: HTMLElement, source: HmiTrendSourceChoice, catalog: HmiTrendSourceCatalog) {
  const origin = fieldset.querySelector<HTMLSelectElement>('[data-trend-source-field="source"]')!;
  const tag = fieldset.querySelector<HTMLSelectElement>('[data-trend-source-field="tag"]')!;
  const log = fieldset.querySelector<HTMLSelectElement>('[data-trend-source-field="logId"]')!;
  const loggedTag = fieldset.querySelector<HTMLSelectElement>('[data-trend-source-field="loggedTagId"]')!;
  trendPickerChoices(origin, [["online", "Online / variabile PLC"], ["log", "Data Log"]], source.source);
  trendPickerChoices(tag, [["", "Scegli variabile"], ...catalog.tags.map((name): [string, string] => [name, name])], source.tag);
  trendPickerChoices(log, [["", "Scegli archivio"], ...catalog.logs.map((log): [string, string] => [log.id, log.name])], source.logId ?? "");
  trendPickerChoices(loggedTag, [["", "Scegli variabile archiviata"], ...(catalog.logs.find((log) => log.id === source.logId)?.tags ?? []).map((tag): [string, string] => [tag.id, `${tag.name} · ${tag.tag}`])], source.loggedTagId ?? "");
  for (const [select, hidden] of [[tag, source.source !== "online"], [log, source.source !== "log"], [loggedTag, source.source !== "log"]] as const) { select.parentElement!.hidden = hidden; select.parentElement!.style.display = hidden ? "none" : "grid"; }
}

export function renderTrendSourcePicker(root: HTMLElement, curves: HmiTrendSourceCurve[], catalog: HmiTrendSourceCatalog, apply: TrendPickerState["apply"], reset: () => void) {
  let details = root.querySelector<HTMLElement>(":scope > [data-trend-source-picker]");
  if (!details) {
    const doc = root.ownerDocument; details = doc.createElement("details"); details.dataset.trendSourcePicker = ""; Object.assign(details.style, { padding: "4px 8px", background: "#f7f8f9" });
    const summary = doc.createElement("summary"); summary.textContent = "Sorgenti delle curve"; Object.assign(summary.style, { cursor: "pointer", minHeight: "44px", lineHeight: "44px" }); details.append(summary);
    const label = doc.createElement("label"); label.textContent = "Curva "; const select = doc.createElement("select"); select.dataset.trendSourceCurve = ""; select.style.minHeight = "44px"; label.append(select); details.append(label);
    const fields = doc.createElement("div"); fields.dataset.trendSourceFields = ""; details.append(fields);
    const actions = doc.createElement("div"); Object.assign(actions.style, { display: "flex", flexWrap: "wrap", gap: "8px" });
    for (const [action, text] of [["apply", "Applica sorgenti"], ["reset", "Ripristina sorgenti del progetto"]]) { const button = doc.createElement("button"); button.type = "button"; button.dataset.trendSourceAction = action; button.textContent = text; Object.assign(button.style, { minHeight: "44px", cursor: "pointer" }); actions.append(button); } details.append(actions);
    const status = doc.createElement("p"); status.dataset.trendSourceStatus = ""; status.setAttribute("aria-live", "polite"); details.append(status); root.append(details);
    details.addEventListener("change", (event) => {
      const current = trendPickerStates.get(details!); const target = event.target as HTMLSelectElement; if (!current || target.nodeType !== 1) return;
      if (target.dataset.trendSourceCurve !== undefined) { current.selected = target.value; trendPickerFields(details!, current); return; }
      const coordinate = target.closest<HTMLElement>("[data-trend-source-coordinate]")?.dataset.trendSourceCoordinate; const field = target.dataset.trendSourceField;
      const draft = current.drafts.get(current.selected ?? ""); if (!draft || !coordinate || !field) return;
      const source = draft[coordinate];
      if (field === "source") source.source = target.value as HmiTrendSourceChoice["source"];
      else if (field === "tag") source.tag = target.value;
      else if (field === "logId") { source.logId = target.value || undefined; source.loggedTagId = undefined; }
      else if (field === "loggedTagId") { source.loggedTagId = target.value || undefined; source.tag = current.catalog.logs.find((log) => log.id === source.logId)?.tags.find((tag) => tag.id === source.loggedTagId)?.tag ?? ""; }
      trendPickerUpdateFields(target.closest<HTMLElement>("fieldset")!, source, current.catalog);
    });
    details.addEventListener("click", (event) => {
      const current = trendPickerStates.get(details!); const target = event.target as Element; if (!current || target.nodeType !== 1) return;
      const action = target.closest<HTMLElement>("[data-trend-source-action]")?.dataset.trendSourceAction; if (!action) return;
      const status = details!.querySelector<HTMLElement>("[data-trend-source-status]")!;
      if (action === "reset") { current.drafts.clear(); current.reset(); trendPickerFields(details!, current); status.setAttribute("role", "status"); status.textContent = "Sorgenti del progetto ripristinate."; return; }
      const sources = current.drafts.get(current.selected ?? ""); if (!sources) return;
      const invalid = Object.entries(sources).find(([, source]) => source.source === "online" ? !current.catalog.tags.includes(source.tag) : !current.catalog.logs.find((log) => log.id === source.logId)?.tags.some((tag) => tag.id === source.loggedTagId));
      if (invalid) { status.setAttribute("role", "alert"); status.textContent = `Scegli una sorgente valida per ${invalid[0] === "value" ? "Y" : invalid[0].toUpperCase()}.`; return; }
      current.apply(current.selected!, trendUiClone(sources)); status.setAttribute("role", "status"); status.textContent = "Sorgenti applicate solo a questa sessione Runtime.";
    });
  }
  const signature = JSON.stringify(catalog); let state = trendPickerStates.get(details);
  if (!state) { state = { curves, catalog, apply, reset, selected: curves[0]?.id, drafts: new Map(), catalogSignature: signature }; trendPickerStates.set(details, state); trendPickerChoices(details.querySelector("select")!, curves.map((curve) => [curve.id, curve.name]), state.selected ?? ""); trendPickerFields(details, state); }
  else { state.curves = curves; state.catalog = catalog; state.apply = apply; state.reset = reset; if (state.catalogSignature !== signature) { state.catalogSignature = signature; for (const fieldset of details.querySelectorAll<HTMLElement>("fieldset")) { const draft = state.drafts.get(state.selected ?? "")?.[fieldset.dataset.trendSourceCoordinate!]; if (draft) trendPickerUpdateFields(fieldset, draft, catalog); } } }
}

export function trendRuntimeZoomRange(range: [number, number], factor: number, shift = 0): [number, number] {
  const width = range[1] - range[0]; const center = (range[0] + range[1]) / 2 + width * shift;
  return [center - width / factor / 2, center + width / factor / 2];
}
function trendZoomPosition(svg: SVGSVGElement, event: PointerEvent): [number, number] | undefined {
  const box = svg.getBoundingClientRect(); if (!box.width || !box.height) return undefined;
  const view = (svg.getAttribute("viewBox") ?? "0 0 640 300").split(/\s+/).map(Number);
  return [view[0] + (event.clientX - box.left) / box.width * view[2], view[1] + (event.clientY - box.top) / box.height * view[3]];
}
function trendZoomSelection(svg: SVGSVGElement, drag: NonNullable<TrendAreaZoomState["drag"]>) {
  let rect = svg.querySelector("[data-trend-zoom-selection]"); if (!rect) { rect = svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect"); rect.setAttribute("data-trend-zoom-selection", ""); rect.setAttribute("fill", "#00a1d133"); rect.setAttribute("stroke", "#00647d"); rect.setAttribute("stroke-dasharray", "5 3"); rect.setAttribute("pointer-events", "none"); svg.append(rect); }
  const [x1, y1] = drag.start; const [x2, y2] = drag.end; for (const [key, value] of Object.entries({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) })) rect.setAttribute(key, String(value));
}
function trendZoomCancel(svg: SVGSVGElement) {
  const state = trendAreaZoomStates.get(svg); const pointerId = state?.drag?.pointerId; if (state) state.drag = undefined;
  svg.querySelector("[data-trend-zoom-selection]")?.remove();
  if (pointerId !== undefined && svg.hasPointerCapture?.(pointerId)) svg.releasePointerCapture(pointerId);
}
export function trendAreaZoomDragging(svg: SVGSVGElement): boolean { return Boolean(trendAreaZoomStates.get(svg)?.drag); }
export function installTrendAreaZoom(svg: SVGSVGElement, active: boolean, areas: HmiTrendZoomArea[], apply: TrendAreaZoomState["apply"]) {
  let state = trendAreaZoomStates.get(svg); if (state) { if (!active) trendZoomCancel(svg); Object.assign(state, { active, areas, apply }); return; }
  state = { active, areas, apply }; trendAreaZoomStates.set(svg, state);
  svg.addEventListener("pointerdown", (event) => {
    const current = trendAreaZoomStates.get(svg)!; if (!current.active || current.drag || event.isPrimary === false || event.button !== 0) return;
    const position = trendZoomPosition(svg, event); if (!position) return;
    const area = current.areas.find((area) => position[0] >= area.left && position[0] <= area.left + area.width && position[1] >= area.top && position[1] <= area.top + area.height); if (!area) return;
    current.drag = { pointerId: event.pointerId, area: trendUiClone(area), start: position, end: position }; svg.focus();
    try { svg.setPointerCapture?.(event.pointerId); } catch { /* Il renderer funziona anche senza pointer capture. */ }
    trendZoomSelection(svg, current.drag); event.preventDefault();
  });
  svg.addEventListener("pointermove", (event) => {
    const drag = trendAreaZoomStates.get(svg)?.drag; if (!drag || drag.pointerId !== event.pointerId) return; const position = trendZoomPosition(svg, event); if (!position) return;
    drag.end = [Math.max(drag.area.left, Math.min(drag.area.left + drag.area.width, position[0])), Math.max(drag.area.top, Math.min(drag.area.top + drag.area.height, position[1]))]; trendZoomSelection(svg, drag);
  });
  svg.addEventListener("pointerup", (event) => {
    const current = trendAreaZoomStates.get(svg)!; const drag = current.drag; if (!drag || drag.pointerId !== event.pointerId) return;
    const position = trendZoomPosition(svg, event); if (position) drag.end = [Math.max(drag.area.left, Math.min(drag.area.left + drag.area.width, position[0])), Math.max(drag.area.top, Math.min(drag.area.top + drag.area.height, position[1]))];
    trendZoomCancel(svg); if (Math.abs(drag.end[0] - drag.start[0]) < 5 || Math.abs(drag.end[1] - drag.start[1]) < 5) return;
    const xr = [Math.min(drag.start[0], drag.end[0]), Math.max(drag.start[0], drag.end[0])].map((x) => (x - drag.area.left) / drag.area.width);
    const yr = [Math.max(drag.start[1], drag.end[1]), Math.min(drag.start[1], drag.end[1])].map((y) => 1 - (y - drag.area.top) / drag.area.height);
    const subrange = (range: [number, number], ratios: number[]): [number, number] => [range[0] + (range[1] - range[0]) * ratios[0], range[0] + (range[1] - range[0]) * ratios[1]];
    current.apply({ ...drag.area, xRange: subrange(drag.area.xRange, xr), yRange: subrange(drag.area.yRange, yr), rightRange: drag.area.rightRange ? subrange(drag.area.rightRange, yr) : undefined });
  });
  for (const name of ["pointercancel", "lostpointercapture"]) svg.addEventListener(name, (event) => { if ((event as PointerEvent).pointerId === trendAreaZoomStates.get(svg)?.drag?.pointerId) trendZoomCancel(svg); });
  svg.addEventListener("keydown", (event) => { if (event.key === "Escape") trendZoomCancel(svg); }); svg.setAttribute("tabindex", "0");
}

export function trendQualityClass(qualityCode?: number): "good" | "uncertain" | "bad" | "unknown" {
  if (qualityCode === undefined) return "unknown"; const quality = qualityCode & 0xc0;
  return quality & 0x80 ? "good" : quality === 64 ? "uncertain" : "bad";
}
export function hmiTrendRuntimeUiModuleSource(): string {
  return `const trendPickerStates = new WeakMap();\nconst trendAreaZoomStates = new WeakMap();\n${[trendUiClone, trendPickerChoices, trendPickerFields, trendPickerUpdateFields, renderTrendSourcePicker, trendRuntimeZoomRange, trendZoomPosition, trendZoomSelection, trendZoomCancel, trendAreaZoomDragging, installTrendAreaZoom, trendQualityClass].map(String).join("\n")}\n`;
}
