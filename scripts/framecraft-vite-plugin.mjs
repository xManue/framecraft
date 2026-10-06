import { transformSync } from "@babel/core";
import * as t from "@babel/types";
import { equalGapOffset, gridOffset, snapOffset } from "./framecraft-snap.mjs";
import { overlayCandidate } from "./framecraft-picking.mjs";
import { createHmiPropertyFlashingDomSurface } from "./hmi-property-flashing.mjs";

// The bridge is shipped to the previewed project as source text, so the maths it needs is not
// imported by it but written into it. Stringifying the real functions keeps one copy: what the
// tests check is exactly what runs inside the page.
const sharedHelpers = [snapOffset, gridOffset, equalGapOffset, overlayCandidate, createHmiPropertyFlashingDomSurface].map((helper) => String(helper)).join("\n");

const bridgeScript = sharedHelpers + String.raw`
(() => {
  if (new URLSearchParams(window.location.search).has("framecraftPreview")) return;
  // Il Runtime generato e il ponte dell'editor vivono nella stessa pagina durante l'anteprima.
  // Questo segnale fa eseguire eventi e dinamiche una volta sola, dal lato editor.
  window.__framecraftEditorPreview = true;
  const attribute = "data-fc-source";
  let inlineTarget = null;
  let selectedSource = null;
  let selectedInstanceId = null;
  let selectionVersion = 0;
  let nudgeTimer = 0;
  let pendingNudge = null;
  const cancelNudge = () => {
    clearTimeout(nudgeTimer);
    if (pendingNudge) pendingNudge.element.style.translate = pendingNudge.original;
    pendingNudge = null;
  };
  let dragTarget = null;
  let dragFrame = 0;
  let controlledTransform = null;
  let suppressClick = false;
  let highlightPreview = null;
  let mode = "edit";
  // Set while the editor is asking the user to point at something on the page: a position for a
  // button, or the corners of an outline. Nothing gets selected or dragged in the meantime.
  let pointPick = null;
  let regionPick = null;
  let regionFrame = 0;
  let regionLayer = null;
  // Su una pagina guidata dal suo template si sceglie per guardare, ma non si sposta niente col
  // mouse: quello che si può cambiare lo dice il pannello «Questa pagina».
  let dragEnabled = true;
  // Everything the editor has told this page about magnetic alignment. Snapping is on by
  // default because a panel is a grid of buttons and lamps: lining them up by eye is the work.
  let snapSettings = { enabled: true, grid: 8, threshold: 6 };
  // The elements picked up alongside the selected one, to be aligned together.
  let extraSelected = [];
  let trackSelection = () => {};
  const dropContainers = new Set(["main", "section", "div", "article", "form", "header", "footer", "aside", "nav", "ul", "ol", "li"]);
  let nextInstanceId = 0;
  const elementInstances = new WeakMap();
  const instanceElements = new Map();
  const propertyFlashingSurface = createHmiPropertyFlashingDomSurface(document, (element) => instanceId(element), () => mode === "navigate");
  // La simulazione degli stati PLC: per ogni elemento toccato si tiene com'era prima, cosi' quando
  // si spegne la pagina torna quella che il progetto disegna davvero.
  const simulated = new Map();
  let simulationOn = false;
  let collectSignature = "";
  let screenItemsSignature = "";
  let collectFrame = 0;
  const hmiFlashingStyle = document.createElement("style");
  hmiFlashingStyle.dataset.framecraftHmiFlashing = "";
  hmiFlashingStyle.textContent = '@keyframes framecraft-hmi-flash-background{0%,49.999%{background-color:var(--framecraft-hmi-flash-background-color)}50%,100%{background-color:var(--framecraft-hmi-flash-background-alternate)}}@keyframes framecraft-hmi-flash-foreground{0%,49.999%{color:var(--framecraft-hmi-flash-foreground-color)}50%,100%{color:var(--framecraft-hmi-flash-foreground-alternate)}}@keyframes framecraft-hmi-flash-border{0%,49.999%{border-color:var(--framecraft-hmi-flash-border-color)}50%,100%{border-color:var(--framecraft-hmi-flash-border-alternate)}}@media(prefers-reduced-motion:reduce){[style*="framecraft-hmi-flash-"]{animation:none!important;outline:3px double var(--framecraft-hmi-flash-background-color,var(--framecraft-hmi-flash-foreground-color,var(--framecraft-hmi-flash-border-color,currentColor)))!important;outline-offset:2px}[style*="framecraft-hmi-flash-background"]{background-color:var(--framecraft-hmi-flash-background-alternate)!important;background-image:repeating-linear-gradient(135deg,var(--framecraft-hmi-flash-background-color) 0 5px,var(--framecraft-hmi-flash-background-alternate) 5px 10px)!important}[style*="framecraft-hmi-flash-foreground"]{color:var(--framecraft-hmi-flash-foreground-alternate)!important;text-decoration:underline double}[style*="framecraft-hmi-flash-border"]{border-color:var(--framecraft-hmi-flash-border-alternate)!important;border-style:double!important}}';
  (document.head || document.documentElement).appendChild(hmiFlashingStyle);
  // I testi statici multilingua sono sempre Runtime, non una modalità di simulazione. Il JSX resta
  // il fallback da ripristinare se una chiave o una traduzione sparisce.
  const localized = new Map();
  let currentTranslations = null;
  let languageFrame = 0;
  const loadedEvents = new Set();
  let hmiGestureStart = null;
  const instanceId = (element) => {
    let id = elementInstances.get(element);
    if (!id) {
      id = "fc-instance-" + (++nextInstanceId);
      elementInstances.set(element, id);
      instanceElements.set(id, element);
      if (element instanceof HTMLElement || element instanceof SVGElement) element.dataset.framecraftInstanceId = id;
    }
    return id;
  };
  // Every read of the source attribute goes through here: a malformed or missing attribute must never
  // throw inside a DOM listener, or the whole bridge stops responding for the rest of the session.
  const readSource = (element) => {
    try {
      const value = element && element.getAttribute(attribute);
      if (!value) return null;
      const parsed = JSON.parse(value);
      return parsed && typeof parsed.file === "string" && typeof parsed.start === "number" ? parsed : null;
    } catch { return null; }
  };
  const matchesSource = (element, source) => {
    const candidate = readSource(element);
    return Boolean(candidate) && candidate.file === source.file && candidate.start === source.start && candidate.end === source.end;
  };
  const sourceElement = (source, requestedInstanceId, requestedInfo) => {
    const instance = requestedInstanceId ? instanceElements.get(requestedInstanceId) : null;
    if (instance?.isConnected && matchesSource(instance, source)) return instance;
    const matches = [...document.querySelectorAll("[" + attribute + "]")].filter((element) => matchesSource(element, source));
    if (Number.isFinite(requestedInfo?.listIndex)) {
      const listed = matches.find((element) => Number(element.getAttribute("data-fc-index")) === requestedInfo.listIndex);
      if (listed) return listed;
    }
    return matches[Number.isFinite(requestedInfo?.instanceIndex) ? requestedInfo.instanceIndex : 0];
  };
  const isClickThrough = (element) => getComputedStyle(element).pointerEvents === "none";
  /** A label an app draws over its own button is regularly made click-through, so the mouse can
   * never reach it and the editor can only ever select the button underneath. When the pointer is
   * over such an element, that is what the user is pointing at. It is selected for inspection only:
   * dragging and inline editing stay on the element the app itself made interactive.
   * Which of the layers under the pointer wins is decided by overlayCandidate. */
  const clickThroughTarget = (element, event) => {
    if (!element || typeof event.clientX !== "number") return null;
    const clicked = element.getBoundingClientRect();
    const candidates = [];
    for (const candidate of document.querySelectorAll("[" + attribute + "]")) {
      if (candidate === element || candidate.contains(element) || !isClickThrough(candidate)) continue;
      const style = getComputedStyle(candidate);
      if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
      const rect = candidate.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) continue;
      candidates.push({ element: candidate, area: rect.width * rect.height, inside: element.contains(candidate) });
    }
    const best = overlayCandidate({ area: clicked.width * clicked.height }, candidates);
    return best ? best.element : null;
  };
  const selectionTarget = (event) => {
    // The corner handles drawn over an outline are the editor's own furniture: pointing at one is
    // shaping the highlight, never selecting whatever the panel draws underneath it.
    if (event.target?.closest?.("[data-framecraft-highlight-handle]")) return null;
    const element = event.target.closest?.("[" + attribute + "]");
    return element ? clickThroughTarget(element, event) || element : null;
  };
  const dropContainer = (target) => {
    let element = target instanceof Element ? target.closest("[" + attribute + "]") : null;
    while (element && !dropContainers.has(element.localName)) element = element.parentElement?.closest("[" + attribute + "]") || null;
    return element || [...document.querySelectorAll("[" + attribute + "]")].find((candidate) => dropContainers.has(candidate.localName));
  };
  const dropPosition = (element, event) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: event.clientX - rect.left - (Number.parseFloat(style.borderLeftWidth) || 0) + element.scrollLeft,
      y: event.clientY - rect.top - (Number.parseFloat(style.borderTopWidth) || 0) + element.scrollTop,
      positionContainer: style.position === "static",
    };
  };
  const dropMarker = document.createElement("div");
  Object.assign(dropMarker.style, {
    position: "fixed", width: "18px", height: "18px", margin: "-9px 0 0 -9px", border: "2px solid #3d9be0",
    borderRadius: "50%", background: "rgba(61,155,224,.28)", boxShadow: "0 0 0 4px rgba(61,155,224,.2)",
    pointerEvents: "none", zIndex: "2147483647", display: "none",
  });
  document.documentElement.append(dropMarker);
  // Everything the editor knows about a rendered element. Delete needs the same description as a
  // selection does, so building it lives here rather than inside the selection message.
  const describeElement = (element, source) => {
    const repeated = [...document.querySelectorAll("[" + attribute + "]")].filter((candidate) => matchesSource(candidate, source));
    const rendered = (element.textContent || "").replace(/\s+/g, " ").trim();
    const declared = element.getAttribute("data-fc-index");
    const listIndex = declared == null || declared === "" ? Number.NaN : Number(declared);
    return {
      text: rendered.length > 300 ? rendered.slice(0, 300) + "…" : rendered,
      plcTag: element.getAttribute("data-plc-variable") || element.getAttribute("data-plc-tag") || undefined,
      id: element.id || undefined,
      className: typeof element.className === "string" ? element.className || undefined : undefined,
      instanceIndex: Math.max(0, repeated.indexOf(element)),
      instanceCount: repeated.length,
      // The app itself made this element ignore the mouse, so the canvas must not offer to drag it.
      locked: isClickThrough(element),
      // The position inside the list survives a copy being removed; the position in the DOM does not.
      listIndex: Number.isFinite(listIndex) ? listIndex : undefined,
    };
  };
  const editableStyleNames = [
    "display", "position", "left", "top", "right", "bottom", "zIndex", "visibility", "cursor", "pointerEvents",
    "flexDirection", "flexWrap", "alignItems", "justifyContent", "gap", "overflow", "translate", "rotate", "scale", "transformOrigin",
    "margin", "padding", "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
    "aspectRatio", "backgroundColor", "backgroundImage", "color", "border", "outline", "boxShadow", "borderRadius", "opacity", "objectFit",
    "fontSize", "fontWeight", "lineHeight", "textAlign", "fontFamily", "letterSpacing", "textTransform", "textDecoration", "whiteSpace",
  ];
  const stylesOf = (element) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(editableStyleNames.map((property) => [property, style[property]]));
  };
  const motionProperties = ["display", "translate", "scale", "transform-origin", "will-change", "transition-property"];
  const prepareMotion = (element) => {
    const before = Object.fromEntries(motionProperties.map((name) => [name, {
      value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name),
    }]));
    const style = getComputedStyle(element);
    element.style.setProperty("transition-property", "none", "important");
    const hints = (style.willChange || "auto").split(",").map((value) => value.trim()).filter((value) => value && value !== "auto");
    element.style.setProperty("will-change", [...new Set([...hints, "translate", "scale"])].join(", "), "important");
    if (style.display === "inline" && element instanceof HTMLElement) element.style.display = "inline-block";
    return before;
  };
  const restoreMotion = (element, before, canceled) => {
    for (const name of motionProperties) {
      if (!canceled && name !== "transition-property" && name !== "will-change") continue;
      if (name === "transition-property") element.getBoundingClientRect();
      const original = before[name];
      if (original.value) element.style.setProperty(name, original.value, original.priority);
      else element.style.removeProperty(name);
    }
  };
  const endControlledTransform = (canceled) => {
    if (!controlledTransform) return;
    const completed = controlledTransform;
    controlledTransform = null;
    restoreMotion(completed.element, completed.before, canceled);
    scheduleTrackedSelection();
    scheduleCollect();
  };
  const sendSelection = (element, request) => {
    const source = readSource(element);
    if (!source) return;
    if (!request) { cancelNudge(); selectionVersion++; }
    // A plain click ends a group: picking one element is how the user says "only this one".
    if (!request && extraSelected.length) {
      extraSelected = [];
      window.parent.postMessage({ type: "framecraft:select-many", items: [] }, "*");
    }
    const currentInstanceId = instanceId(element);
    if (dragTarget && dragTarget.element !== element) cancelDrag();
    if (controlledTransform && controlledTransform.element !== element) endControlledTransform(true);
    if (request && pendingNudge && pendingNudge.element !== element) cancelNudge();
    selectedSource = source;
    selectedInstanceId = currentInstanceId;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const styles = stylesOf(element);
    window.parent.postMessage({
      type: request ? "framecraft:selection-response" : "framecraft:select",
      requestId: request?.requestId,
      selectionVersion,
      source,
      tag: element.localName,
      // Read from the rendered element, so this still describes components whose source is out of reach.
      info: describeElement(element, source),
      instanceId: currentInstanceId,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      geometry: {
        display: style.display,
        translate: style.translate || "none",
        scale: style.scale || "none",
        cssWidth: Number.parseFloat(style.width) || rect.width,
        cssHeight: Number.parseFloat(style.height) || rect.height,
      },
      styles,
    }, "*");
    trackSelection(element, rect);
  };
  // The two lines drawn while an element is being dragged. They are the whole feedback of
  // snapping: without them a box that jumps four pixels reads as the editor misbehaving.
  const guide = (vertical) => {
    const line = document.createElement("div");
    Object.assign(line.style, {
      position: "fixed", background: "#f0577f", pointerEvents: "none", zIndex: "2147483646", display: "none",
      width: vertical ? "1px" : "100%", height: vertical ? "100%" : "1px",
      left: vertical ? "0" : "0", top: "0",
    });
    const label = document.createElement("span");
    Object.assign(label.style, {
      position: "absolute", padding: "2px 5px", borderRadius: "4px", background: "#a82e55", color: "white",
      font: "700 9px/1.35 system-ui, sans-serif", letterSpacing: ".04em", whiteSpace: "nowrap",
      left: vertical ? "6px" : "10px", top: vertical ? "10px" : "6px",
    });
    label.textContent = "ALLINEATO";
    line.append(label);
    document.documentElement.append(line);
    return line;
  };
  const guideX = guide(true);
  const guideY = guide(false);
  const gapGuide = () => {
    const layer = document.createElement("div");
    Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "2147483647", display: "none" });
    const first = document.createElement("i");
    const second = document.createElement("i");
    const label = document.createElement("b");
    for (const line of [first, second]) Object.assign(line.style, { position: "fixed", display: "block", borderColor: "#f0577f", borderStyle: "dashed" });
    Object.assign(label.style, { position: "fixed", padding: "2px 5px", borderRadius: "4px", background: "#a82e55", color: "white", font: "600 10px/1.35 system-ui, sans-serif", boxShadow: "0 2px 8px rgba(0,0,0,.3)" });
    layer.append(first, second, label);
    document.documentElement.append(layer);
    return { layer, first, second, label };
  };
  const gapX = gapGuide();
  const gapY = gapGuide();
  const hideGap = (gap) => { gap.layer.style.display = "none"; };
  const showGap = (gap, axis, hit, box) => {
    gap.layer.style.display = "block";
    const value = Math.round(hit.gap * 10) / 10;
    gap.label.textContent = value + " px = " + value + " px";
    if (axis === "x") {
      const y = box.top + box.height / 2;
      Object.assign(gap.first.style, { left: hit.before + "px", top: y + "px", width: Math.max(0, box.left - hit.before) + "px", height: "0", borderWidth: "1px 0 0" });
      Object.assign(gap.second.style, { left: box.right + "px", top: y + "px", width: Math.max(0, hit.after - box.right) + "px", height: "0", borderWidth: "1px 0 0" });
      Object.assign(gap.label.style, { left: box.left + box.width / 2 + "px", top: y + 8 + "px", transform: "translateX(-50%)" });
    } else {
      const x = box.left + box.width / 2;
      Object.assign(gap.first.style, { left: x + "px", top: hit.before + "px", width: "0", height: Math.max(0, box.top - hit.before) + "px", borderWidth: "0 0 0 1px" });
      Object.assign(gap.second.style, { left: x + "px", top: box.bottom + "px", width: "0", height: Math.max(0, hit.after - box.bottom) + "px", borderWidth: "0 0 0 1px" });
      Object.assign(gap.label.style, { left: x + 8 + "px", top: box.top + box.height / 2 + "px", transform: "translateY(-50%)" });
    }
  };
  const hideGuides = () => { guideX.style.display = "none"; guideY.style.display = "none"; hideGap(gapX); hideGap(gapY); };
  /** The edges an element can line up with: the sides and the middle of everything else on the page,
   * plus the box it sits in. Collected once when the drag starts, because the page does not move
   * while a single element does, and re-measuring it on every pointer event is what makes a drag
   * stutter on a busy panel. */
  const snapCandidates = (selection) => {
    const excluded = Array.isArray(selection) ? selection : [selection];
    const element = excluded[0];
    const xs = [];
    const ys = [];
    const boxes = [];
    const add = (box, forSpacing = true) => {
      xs.push(box.left, box.left + box.width / 2, box.right);
      ys.push(box.top, box.top + box.height / 2, box.bottom);
      if (forSpacing) boxes.push({ left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height });
    };
    if (element.parentElement) add(element.parentElement.getBoundingClientRect(), false);
    for (const candidate of document.querySelectorAll("[" + attribute + "]")) {
      if (excluded.some((picked) => candidate === picked || candidate.contains(picked) || picked.contains(candidate))) continue;
      const style = getComputedStyle(candidate);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const box = candidate.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      if (box.right < 0 || box.bottom < 0 || box.left > window.innerWidth || box.top > window.innerHeight) continue;
      add(box);
    }
    return { xs: xs, ys: ys, boxes: boxes };
  };
  const translateOf = (element) => {
    const written = getComputedStyle(element).translate;
    const parts = (written && written !== "none" ? written : "0px 0px").split(/\s+/).map((value) => Number.parseFloat(value) || 0);
    return { x: parts[0] || 0, y: parts[1] || 0 };
  };
  /** One member of a group selection, described with everything an alignment needs. */
  const describeForGroup = (element) => {
    const source = readSource(element);
    if (!source) return null;
    const rect = element.getBoundingClientRect();
    return {
      source: source,
      instanceId: instanceId(element),
      info: describeElement(element, source),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      translate: translateOf(element),
      styles: stylesOf(element),
    };
  };
  const groupElements = () => {
    const elements = [];
    const primary = selectedSource ? sourceElement(selectedSource, selectedInstanceId) : null;
    if (primary) elements.push(primary);
    for (const element of extraSelected) {
      if (element.isConnected && elements.indexOf(element) < 0) elements.push(element);
    }
    return elements;
  };
  const sendGroupSelection = () => {
    cancelNudge();
    selectionVersion++;
    const elements = groupElements();
    const items = elements.length > 1 ? elements.map(describeForGroup).filter(Boolean) : [];
    window.parent.postMessage({ type: "framecraft:select-many", items: items, selectionVersion }, "*");
  };
  const toggleGroupElement = (element) => {
    const already = extraSelected.indexOf(element);
    if (already >= 0) extraSelected.splice(already, 1);
    else if (!selectedSource || !matchesSource(element, selectedSource) || instanceId(element) !== selectedInstanceId) extraSelected.push(element);
    sendGroupSelection();
  };
  const elementForGroupItem = (item) => {
    const byInstance = item?.instanceId ? instanceElements.get(item.instanceId) : null;
    if (byInstance?.isConnected && matchesSource(byInstance, item.source)) return byInstance;
    const matches = [...document.querySelectorAll("[" + attribute + "]")].filter((element) => matchesSource(element, item.source));
    const index = item?.info?.listIndex ?? item?.info?.instanceIndex ?? 0;
    return matches[index] || matches[0] || null;
  };
  const sendReady = () => window.parent.postMessage({ type: "framecraft:ready", path: window.location.pathname, selectionProtocol: 2, selectionVersion, screenItems: propertyFlashingSurface.items() }, "*");
  // Where a point of the page falls inside the drawing the outline is written in: the corners the
  // user drags are in the coordinates of that <svg>, not in pixels of the window.
  const svgPointOf = (svg, clientX, clientY) => {
    const matrix = svg.getScreenCTM?.();
    if (!matrix) return null;
    const point = svg.createSVGPoint ? svg.createSVGPoint() : new DOMPoint();
    point.x = clientX;
    point.y = clientY;
    const mapped = point.matrixTransform(matrix.inverse());
    return { x: mapped.x, y: mapped.y };
  };
  // How big a handle has to be drawn to stay the same size on screen whatever the drawing's scale.
  const userUnit = (svg) => {
    const matrix = svg.getScreenCTM?.();
    const scale = matrix ? Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)) : 1;
    return scale > 0 ? 1 / scale : 1;
  };
  const svgNode = (name, attributes) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  /** Drags one corner of the outline. The editor owns the geometry: what travels back is where the
   * pointer is, in the coordinates of the drawing, and the new outline arrives redrawn. */
  const dragAnchor = (svg, index, event) => {
    event.preventDefault();
    event.stopPropagation();
    const send = (moveEvent, done) => {
      const point = svgPointOf(svg, moveEvent.clientX, moveEvent.clientY);
      if (point) window.parent.postMessage({ type: "framecraft:highlight-anchor", index, x: point.x, y: point.y, done }, "*");
    };
    const move = (moveEvent) => { if (moveEvent.pointerId === event.pointerId) send(moveEvent, false); };
    const finish = (upEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      send(upEvent, true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };
  const drawHighlightPreview = (preview) => {
    for (const node of document.querySelectorAll("[data-framecraft-highlight-preview]")) node.remove();
    highlightPreview = preview && typeof preview.path === "string" ? preview : null;
    if (!highlightPreview || !selectedSource) return;
    const selected = sourceElement(selectedSource, selectedInstanceId);
    const svg = selected?.localName === "svg" ? selected : selected?.ownerSVGElement;
    if (!svg) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("data-framecraft-highlight-preview", "true");
    path.setAttribute("d", highlightPreview.path);
    path.setAttribute("vector-effect", "non-scaling-stroke");
    path.setAttribute("fill", highlightPreview.kind === "route" ? "none" : "rgba(124, 108, 255, .24)");
    path.setAttribute("stroke", "#ffb84d");
    path.setAttribute("stroke-width", highlightPreview.kind === "route" ? "8" : "5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.style.pointerEvents = "none";
    path.style.filter = "drop-shadow(0 0 5px rgba(255, 184, 77, .85))";
    svg.append(path);
    if (!highlightPreview.editable) return;
    const unit = userUnit(svg);
    const layer = svgNode("g", { "data-framecraft-highlight-preview": "handles" });
    for (const side of highlightPreview.sides ?? []) {
      const plus = svgNode("g", { "data-framecraft-highlight-handle": "side", transform: "translate(" + side.x + " " + side.y + ")" });
      plus.style.cursor = "copy";
      plus.append(svgNode("circle", { r: 6 * unit, fill: "rgba(17, 20, 34, .78)", stroke: "#ffb84d", "stroke-width": 1.5 * unit }));
      const arm = 3 * unit;
      plus.append(svgNode("path", { d: "M" + -arm + " 0H" + arm + "M0 " + -arm + "V" + arm, stroke: "#ffb84d", "stroke-width": 1.5 * unit }));
      plus.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.parent.postMessage({ type: "framecraft:highlight-insert", afterIndex: side.afterIndex, x: side.x, y: side.y }, "*");
      });
      layer.append(plus);
    }
    for (const anchor of highlightPreview.anchors ?? []) {
      const handle = svgNode("rect", {
        "data-framecraft-highlight-handle": "anchor",
        x: anchor.x - 6 * unit, y: anchor.y - 6 * unit, width: 12 * unit, height: 12 * unit, rx: 3 * unit,
        fill: "#ffb84d", stroke: "#111422", "stroke-width": 1.5 * unit,
      });
      handle.style.cursor = "grab";
      handle.addEventListener("pointerdown", (event) => dragAnchor(svg, anchor.index, event));
      // Taking a corner away is the other half of adding one, and a double click is where the hand
      // already is: the alternative was retyping the whole path by hand.
      handle.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.parent.postMessage({ type: "framecraft:highlight-remove", index: anchor.index }, "*");
      });
      layer.append(handle);
    }
    svg.append(layer);
  };
  let sizeFrame = 0;
  let selectionFrame = 0;
  let trackedSelection = null;
  let trackedRect = null;
  let selectionResizeObserver;
  trackSelection = (element, rect) => {
    trackedSelection = element;
    trackedRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    selectionResizeObserver?.disconnect();
    selectionResizeObserver?.observe(element);
  };
  const sendTrackedSelection = () => {
    selectionFrame = 0;
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (dragTarget?.started || controlledTransform) return;
    let element = trackedSelection?.isConnected ? trackedSelection : null;
    if (!element && selectedSource) element = sourceElement(selectedSource, selectedInstanceId);
    if (!element) return;
    const source = readSource(element);
    if (!source) return;
    const rect = element.getBoundingClientRect();
    const next = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    if (trackedRect && next.x === trackedRect.x && next.y === trackedRect.y && next.width === trackedRect.width && next.height === trackedRect.height) return;
    trackedSelection = element;
    trackedRect = next;
    selectedSource = source;
    selectedInstanceId = instanceId(element);
    window.parent.postMessage({ type: "framecraft:selection-rect", source, instanceId: selectedInstanceId, rect: next }, "*");
  };
  const scheduleTrackedSelection = () => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (dragTarget?.started || controlledTransform) return;
    if (!selectedSource || selectionFrame) return;
    if (typeof requestAnimationFrame === "function") selectionFrame = requestAnimationFrame(sendTrackedSelection);
    else sendTrackedSelection();
  };
  selectionResizeObserver = new ResizeObserver(scheduleTrackedSelection);
  const applyLanguage = () => {
    languageFrame = 0;
    if (!currentTranslations || typeof document === "undefined") return;
    propertyFlashingSurface.suspend();
    try {
      const found = new Set();
      for (const element of document.querySelectorAll("[data-hmi-text]")) {
        if (element.childElementCount > 0) continue;
        const key = element.getAttribute("data-hmi-text") || "";
        if (!localized.has(element)) localized.set(element, element.textContent);
        found.add(element);
        const original = localized.get(element);
        const translated = typeof currentTranslations[key] === "string" ? currentTranslations[key] : original;
        if (element.textContent !== translated) element.textContent = translated;
      }
      for (const [element, original] of [...localized]) {
        if (found.has(element)) continue;
        if (element.isConnected && element.textContent !== original) element.textContent = original;
        localized.delete(element);
      }
    } finally { propertyFlashingSurface.resume(); }
  };
  const hmiEventsOf = (element) => {
    try {
      const raw = element?.getAttribute?.("data-hmi-events");
      const parsed = raw ? JSON.parse(raw) : [];
      return { raw, items: Array.isArray(parsed) ? parsed : [] };
    } catch { return { raw: null, items: [] }; }
  };
  const emitHmiEvent = (element, eventType, context = {}) => {
    if (mode !== "navigate" || !element) return;
    if (!["Initialized", "Loaded", "Unloaded"].includes(eventType) && !propertyFlashingSurface.allowsInteraction(element)) return;
    const configured = hmiEventsOf(element);
    if (!configured.raw || !configured.items.some((item) => item?.event === eventType)) return;
    const faceplate = element.closest?.("[data-hmi-faceplate]");
    window.parent.postMessage({
      type: "framecraft:hmi-event", instanceId: instanceId(element), eventType, raw: configured.raw,
      screenItems: propertyFlashingSurface.items(),
      ...(faceplate ? { faceplateInstanceId: instanceId(faceplate), faceplateRaw: faceplate.getAttribute("data-hmi-faceplate") } : {}),
      ...context,
    }, "*");
  };
  const emitFaceplateInterfaceEvent = (event) => {
    if (mode !== "navigate" || !(event.target instanceof Element)) return;
    if (!propertyFlashingSurface.allowsInteraction(event.target)) return;
    const owner = event.target.closest("[data-hmi-faceplate]");
    if (!owner) return;
    const detail = typeof event.detail === "string" ? { name: event.detail, parameters: {} } : event.detail;
    if (!detail || typeof detail !== "object" || typeof detail.name !== "string" || !detail.name.trim()) return;
    const parameters = detail.parameters && typeof detail.parameters === "object" && !Array.isArray(detail.parameters) ? detail.parameters : {};
    const raw = owner.getAttribute("data-hmi-faceplate");
    if (!raw) return;
    try {
      const binding = JSON.parse(raw);
      if (!binding?.eventBindings?.[detail.name]?.script) return;
    } catch { return; }
    window.parent.postMessage({ type: "framecraft:faceplate-event", instanceId: instanceId(owner), raw, eventName: detail.name, parameters, screenItems: propertyFlashingSurface.items() }, "*");
  };
  const navigateHmiTarget = (target) => {
    if (!target) return;
    window.dispatchEvent(new CustomEvent("framecraft:navigate", { detail: target }));
    if (typeof window.__framecraftSetPage === "function") window.__framecraftSetPage(target);
  };
  const gestureFrom = (start, event) => {
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Date.now() - start.time > 1200 || Math.max(Math.abs(dx), Math.abs(dy)) < 40) return null;
    return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "SwipeLeft" : "SwipeRight") : (dy < 0 ? "SwipeUp" : "SwipeDown");
  };
  const finishHmiGesture = (event, cancelled = false) => {
    const start = hmiGestureStart;
    if (!start || start.pointerId !== event.pointerId) return;
    hmiGestureStart = null;
    if (cancelled || mode !== "navigate") return;
    const gesture = gestureFrom(start, event);
    if (!gesture) return;
    const direction = gesture.slice(5).toLowerCase();
    const attribute = "data-hmi-swipe-" + direction;
    const origin = start.target instanceof Element ? start.target : null;
    const navigationOwner = origin?.closest?.("[" + attribute + "]") || document.querySelector("[" + attribute + "]");
    navigateHmiTarget(navigationOwner?.getAttribute?.(attribute));
    const eventOwner = origin?.closest?.("[data-hmi-events]")
      || [...document.querySelectorAll("[data-hmi-events]")].find((element) => hmiEventsOf(element).items.some((item) => item?.event === "GestureDetected"));
    emitHmiEvent(eventOwner, "GestureDetected", { gesture });
  };
  const emitLoadedEvents = () => {
    if (mode !== "navigate" || typeof document === "undefined" || typeof window === "undefined") return;
    for (const element of [...loadedEvents]) {
      if (element.isConnected) continue;
      emitHmiEvent(element, "Unloaded");
      loadedEvents.delete(element);
    }
    for (const element of document.querySelectorAll("[data-hmi-events]")) {
      if (loadedEvents.has(element)) continue;
      loadedEvents.add(element);
      emitHmiEvent(element, "Initialized");
      emitHmiEvent(element, "Loaded");
    }
  };
  const scheduleLanguage = () => {
    if (!currentTranslations || languageFrame || typeof document === "undefined") return;
    const run = () => applyLanguage();
    languageFrame = 1;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else { languageFrame = 1; run(); }
  };
  // La pagina cambia sotto i piedi a ogni salvataggio (l'HMR non ricarica): finche' la simulazione
  // e' accesa si guarda se la lista degli oggetti dinamizzati e' diventata un'altra.
  const selectionMutationObserver = new MutationObserver((records) => {
    scheduleTrackedSelection(); scheduleCollect();
    if (records.some((record) => record.type !== "attributes" || record.attributeName === "data-hmi-text")) scheduleLanguage();
    if (records.some((record) => record.type === "childList" || record.attributeName === "data-hmi-events")) emitLoadedEvents();
  });
  selectionMutationObserver.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
  window.addEventListener("scroll", scheduleTrackedSelection, true);
  const sendSize = () => {
    cancelAnimationFrame(sizeFrame);
    sizeFrame = requestAnimationFrame(() => {
      const body = document.body;
      const root = document.documentElement;
      window.parent.postMessage({
        type: "framecraft:resize",
        width: Math.max(root.scrollWidth, body?.scrollWidth || 0),
        // The panel format decides how short a page may be drawn; the page only says how tall it is.
        height: Math.max(root.scrollHeight, body?.scrollHeight || 0),
      }, "*");
    });
  };
  /** Gli elementi che portano addosso una dinamizzazione: l'editor le legge e dice lui cosa
   * diventano, perche' le regole del ValueConverter stanno nel suo codice, non qui. */
  const collectDynamizations = (force) => {
    // Come il resto del ponte: la raccolta puo' arrivare quando la pagina non c'e' piu'.
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const items = [];
    for (const element of document.querySelectorAll("[data-hmi-dynamizations]")) {
      const raw = element.getAttribute("data-hmi-dynamizations");
      if (raw) items.push({ instanceId: instanceId(element), raw: raw });
    }
    // Mettere addosso gli stili e' anche lui un cambio della pagina: se la lista e' la stessa non si
    // dice niente, o si rimbalzerebbe all'infinito fra editor e anteprima.
    const screenItems = propertyFlashingSurface.items();
    const signature = items.map((item) => item.instanceId + "=" + item.raw).join("|") + JSON.stringify(screenItems.map(({ properties, ...item }) => item));
    const valuesSignature = JSON.stringify(screenItems);
    if (!force && signature === collectSignature) {
      if (valuesSignature !== screenItemsSignature) {
        screenItemsSignature = valuesSignature;
        window.parent.postMessage({ type: "framecraft:screen-items", screenItems }, "*");
      }
      return;
    }
    collectSignature = signature;
    screenItemsSignature = valuesSignature;
    window.parent.postMessage({ type: "framecraft:dynamizations", items: items, screenItems }, "*");
  };
  const scheduleCollect = () => {
    if (dragTarget?.started || controlledTransform) return;
    if ((!simulationOn && mode !== "navigate") || collectFrame) return;
    // Il segno si mette prima di chiedere il frame: chi tiene il posto va alzato anche se il frame
    // arriva subito, o alla seconda modifica si crederebbe di avere gia' una raccolta in coda.
    collectFrame = 1;
    const run = () => { collectFrame = 0; collectDynamizations(false); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else run();
  };
  const clearSimulation = () => {
    propertyFlashingSurface.suspend();
    for (const [element, before] of simulated) {
      element.style.cssText = before.style;
      propertyFlashingSurface.setDeclarative(element, []);
      if (before.text !== null && element.isConnected) element.textContent = before.text;
      if (before.src !== undefined && element.isConnected) {
        if (before.src === null) element.removeAttribute("src");
        else element.setAttribute("src", before.src);
      }
    }
    simulated.clear();
    propertyFlashingSurface.resume();
  };
  /** Mette addosso agli elementi quello che l'editor ha calcolato. Il testo si tocca solo quando
   * dentro non c'e' altro che testo: sostituirlo dove ci sono figli vorrebbe dire cancellarli. */
  const applySimulation = (commands) => {
    propertyFlashingSurface.suspend();
    const wanted = new Set();
    for (const command of Array.isArray(commands) ? commands : []) {
      const element = instanceElements.get(command.instanceId);
      if (!element || !element.isConnected) continue;
      const writesText = typeof command.text === "string" && element.childElementCount === 0;
      const writesGraphic = typeof command.graphic === "string";
      if (!simulated.has(element)) {
        simulated.set(element, { style: element.style.cssText, text: writesText ? element.textContent : null,
          src: element instanceof HTMLImageElement ? element.getAttribute("src") : undefined });
      }
      const before = simulated.get(element);
      if (before) element.style.cssText = before.style;
      wanted.add(element);
      for (const [property, value] of Object.entries(command.style || {})) {
        if (property.startsWith("--framecraft-hmi-flash-") || (property === "animation" && String(value).includes("framecraft-hmi-flash-"))) continue;
        if (property.startsWith("--")) element.style.setProperty(property, value);
        else element.style[property] = value;
      }
      if (writesText) element.textContent = command.text;
      if (writesGraphic) {
        if (element instanceof HTMLImageElement) element.setAttribute("src", command.graphic);
        else element.style.backgroundImage = 'url("' + command.graphic.replaceAll('"', '\\"') + '")';
      }
      propertyFlashingSurface.setDeclarative(element, command.flashing || []);
    }
    // Un elemento che non e' piu' nella lista torna com'era: succede a ogni cambio di valore.
    for (const [element, before] of [...simulated]) {
      if (wanted.has(element)) continue;
      element.style.cssText = before.style;
      propertyFlashingSurface.setDeclarative(element, []);
      if (before.text !== null && element.isConnected) element.textContent = before.text;
      if (before.src !== undefined && element.isConnected) {
        if (before.src === null) element.removeAttribute("src");
        else element.setAttribute("src", before.src);
      }
      simulated.delete(element);
    }
    propertyFlashingSurface.resume();
  };
  const popupWindows = new Map();
  const popupElement = (popupId) => [...document.querySelectorAll("[data-framecraft-popup-id]")]
    .find((element) => element.getAttribute("data-framecraft-popup-id") === popupId);
  const popupText = (value) => value && typeof value === "object" && typeof value.Tag === "string" ? "Tag: " + value.Tag : String(value ?? "");
  const renderPopup = (state) => {
    if (!state || typeof state.popupId !== "string") return;
    let root = popupWindows.get(state.popupId) || popupElement(state.popupId);
    if (!root) {
      root = document.createElement("section");
      root.setAttribute("data-framecraft-popup-id", state.popupId);
      root.setAttribute("data-hmi-type", "HmiFaceplatePopup");
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "false");
      Object.assign(root.style, { position: "fixed", display: "flex", flexDirection: "column", background: "#f7f9fb", color: "#152532", boxShadow: "0 14px 40px rgba(0,0,0,.35)", overflow: "hidden", font: "13px/1.4 system-ui,sans-serif" });
      const header = document.createElement("header");
      header.setAttribute("data-framecraft-popup-caption", "");
      Object.assign(header.style, { display: "flex", alignItems: "center", gap: "10px", minHeight: "38px", padding: "0 8px 0 12px", background: "#12354d", color: "white", userSelect: "none" });
      const title = document.createElement("strong");
      title.setAttribute("data-framecraft-popup-title", "");
      title.style.flex = "1";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "×";
      close.setAttribute("aria-label", "Chiudi popup");
      Object.assign(close.style, { border: "0", background: "transparent", color: "inherit", font: "24px/1 system-ui", cursor: "pointer" });
      close.addEventListener("click", () => {
        root.style.display = "none";
        window.parent.postMessage({ type: "framecraft:popup-user-close", popupId: state.popupId }, "*");
      });
      header.append(title, close);
      let drag = null;
      header.addEventListener("pointerdown", (event) => {
        if (!(Number(root.dataset.windowFlags) & 16) || event.button !== 0) return;
        drag = { x: event.clientX, y: event.clientY, left: Number.parseFloat(root.style.left) || 0, top: Number.parseFloat(root.style.top) || 0 };
        header.setPointerCapture?.(event.pointerId);
      });
      header.addEventListener("pointermove", (event) => {
        if (!drag) return;
        root.style.left = Math.max(0, drag.left + event.clientX - drag.x) + "px";
        root.style.top = Math.max(0, drag.top + event.clientY - drag.y) + "px";
      });
      header.addEventListener("pointerup", () => { drag = null; });
      const body = document.createElement("div");
      body.setAttribute("data-framecraft-popup-body", "");
      Object.assign(body.style, { flex: "1", minHeight: "0", overflow: "auto", padding: "14px" });
      root.append(header, body);
      document.body.append(root);
    }
    popupWindows.set(state.popupId, root);
    root.dataset.windowFlags = String(state.windowFlags ?? 0);
    root.setAttribute("aria-label", String(state.title || state.faceplateType || "Faceplate"));
    const flags = Number(state.windowFlags) || 0;
    const width = Math.max(160, Number(state.width) || 360);
    const height = Math.max(100, Number(state.height) || 220);
    const leftLimit = Math.max(0, window.innerWidth - width);
    const topLimit = Math.max(0, window.innerHeight - height);
    const parentClamp = Boolean(flags & 128);
    const left = parentClamp ? Math.min(leftLimit, Math.max(0, Number(state.left) || 0)) : Number(state.left) || 0;
    const top = parentClamp ? Math.min(topLimit, Math.max(0, Number(state.top) || 0)) : Number(state.top) || 0;
    Object.assign(root.style, {
      display: state.visible === false ? "none" : "flex",
      left: left + "px", top: top + "px",
      width: state.adaptWindow ? "max-content" : width + "px",
      height: state.adaptWindow ? "auto" : height + "px",
      minWidth: "220px", minHeight: "100px",
      border: flags & 2 ? "1px solid #567184" : "0",
      resize: flags & 8 ? "both" : "none",
      zIndex: flags & 4 ? "2147483645" : "2147483600",
    });
    const caption = root.querySelector("[data-framecraft-popup-caption]");
    if (caption) caption.style.display = flags & 1 ? "flex" : "none";
    const title = root.querySelector("[data-framecraft-popup-title]");
    if (title) title.textContent = String(state.title || state.faceplateType || "Faceplate");
    const close = root.querySelector("button[aria-label='Chiudi popup']");
    if (close) close.style.display = flags & 64 ? "block" : "none";
    const body = root.querySelector("[data-framecraft-popup-body]");
    if (body) {
      body.replaceChildren();
      const type = document.createElement("div");
      type.textContent = String(state.faceplateType || "Faceplate");
      Object.assign(type.style, { fontWeight: "700", marginBottom: "10px" });
      const faceplate = document.createElement("div");
      faceplate.setAttribute("data-hmi-popup-faceplate-type", String(state.faceplateType || ""));
      faceplate.setAttribute("data-hmi-popup-interface", JSON.stringify(state.interfaceValues || {}));
      Object.assign(faceplate.style, { position: "relative", maxWidth: "100%", marginBottom: "10px", overflow: "auto" });
      body.append(type, faceplate);
      for (const [name, value] of Object.entries(state.interfaceValues || {})) {
        const row = document.createElement("div");
        row.setAttribute("data-framecraft-popup-interface", name);
        Object.assign(row.style, { display: "grid", gridTemplateColumns: "minmax(80px,1fr) 1.4fr", gap: "10px", padding: "5px 0", borderTop: "1px solid #d9e1e6" });
        const label = document.createElement("span"); label.textContent = name;
        const output = document.createElement("output"); output.textContent = popupText(value);
        row.append(label, output); body.append(row);
      }
    }
  };
  const closePopup = (state) => {
    const root = state?.popupId ? popupWindows.get(state.popupId) || popupElement(state.popupId) : null;
    root?.remove();
    if (state?.popupId) popupWindows.delete(state.popupId);
  };
  const clearRegionPick = () => {
    if (regionFrame) cancelAnimationFrame(regionFrame);
    regionFrame = 0;
    const capture = regionPick?.pointerId;
    const anchor = regionPick?.anchor;
    regionPick = null;
    if (capture != null && anchor?.hasPointerCapture?.(capture)) anchor.releasePointerCapture(capture);
    regionLayer?.remove(); regionLayer = null;
    delete document.documentElement.dataset.framecraftRegionPicking;
  };
  const cancelRegionPick = () => {
    const requestId = regionPick?.requestId;
    clearRegionPick();
    if (requestId) window.parent.postMessage({ type: "framecraft:region-cancelled", requestId }, "*");
  };
  const regionMissed = (message) => {
    if (regionPick) window.parent.postMessage({ type: "framecraft:region-missed", requestId: regionPick.requestId, message }, "*");
  };
  const regionAnchor = (event) => {
    const candidates = document.elementsFromPoint?.(event.clientX, event.clientY) || [];
    const direct = event.target instanceof Element ? event.target.closest("img,svg") : null;
    if (direct) candidates.unshift(direct);
    let anchor = candidates.find((node) => node.matches("img,svg") && !node.closest("button,a,input,select,textarea") && readSource(node));
    if (!anchor) {
      anchor = event.target instanceof Element ? event.target.closest("[" + attribute + "]") : null;
      while (anchor && !["img", "svg", "div", "main", "section", "article", "figure"].includes(anchor.localName)) anchor = anchor.parentElement?.closest("[" + attribute + "]") || null;
    }
    return anchor;
  };
  const regionPoint = (pick, event) => {
    const box = pick.anchor.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const x = Math.max(box.left, Math.min(box.right, event.clientX));
    const y = Math.max(box.top, Math.min(box.bottom, event.clientY));
    return pick.space === "svg" ? svgPointOf(pick.anchor, x, y) : { x: (x - box.left) / box.width, y: (y - box.top) / box.height };
  };
  const regionPoints = (pick) => {
    if (pick.mode === "polygon") return pick.points;
    const from = pick.points[0], to = pick.hover;
    return from && to ? [from, { x: to.x, y: from.y }, to, { x: from.x, y: to.y }] : [];
  };
  const paintRegion = () => {
    regionFrame = 0;
    const pick = regionPick;
    if (!pick?.anchor) return;
    if (!pick.anchor.isConnected) { cancelRegionPick(); return; }
    if (!regionLayer) {
      regionLayer = svgNode("svg", { "data-framecraft-region-preview": "", "aria-hidden": "true" });
      Object.assign(regionLayer.style, { all: "initial", display: "block", margin: "0", padding: "0", border: "0", background: "none", position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "2147483646", overflow: "hidden" });
      const path = svgNode("path", { fill: pick.color, "fill-opacity": ".18", stroke: pick.color, "stroke-width": String(pick.width), "stroke-dasharray": "5 3", "vector-effect": "non-scaling-stroke" });
      Object.assign(path.style, { fill: pick.color, fillOpacity: ".18", stroke: pick.color, strokeWidth: String(pick.width), strokeDasharray: "5 3", vectorEffect: "non-scaling-stroke", display: "inline", visibility: "visible", opacity: "1", filter: "none", transform: "none" });
      regionLayer.append(path);
      document.documentElement.append(regionLayer);
    }
    const box = pick.anchor.getBoundingClientRect();
    const matrix = pick.space === "svg" ? pick.anchor.getScreenCTM?.() : null;
    let points = regionPoints(pick);
    if (pick.mode === "polygon" && pick.hover && !pick.complete) points = [...points, pick.hover];
    const d = points.map((point, index) => {
      const x = matrix ? matrix.a * point.x + matrix.c * point.y + matrix.e : box.left + point.x * box.width;
      const y = matrix ? matrix.b * point.x + matrix.d * point.y + matrix.f : box.top + point.y * box.height;
      return (index ? "L" : "M") + x + " " + y;
    }).join(" ") + (points.length > 2 ? " Z" : "");
    regionLayer.firstElementChild.setAttribute("d", d);
  };
  const queueRegionPaint = () => { if (!regionFrame) regionFrame = requestAnimationFrame(paintRegion); };
  const finishRegion = () => {
    const pick = regionPick;
    if (!pick || pick.complete || !pick.anchor?.isConnected) return;
    const points = regionPoints(pick);
    const area = points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y; }, 0);
    if (points.length < 3 || Math.abs(area) < 1e-10) { regionMissed("Scegli almeno tre punti non allineati o trascina una zona più grande."); return; }
    const source = readSource(pick.anchor);
    if (!source) { cancelRegionPick(); return; }
    pick.complete = true;
    pick.hover = null;
    suppressClick = true;
    window.parent.postMessage({ type: "framecraft:region-picked", requestId: pick.requestId, source, region: { space: pick.space, points } }, "*");
  };
  const regionCursor = document.createElement("style");
  regionCursor.textContent = 'html[data-framecraft-region-picking],html[data-framecraft-region-picking] *{cursor:crosshair!important;user-select:none!important}';
  (document.head || document.documentElement).append(regionCursor);
  window.addEventListener("message", (event) => {
    if (event.data?.type === "framecraft:set-mode") {
      if (event.data.mode === "navigate") { cancelDrag(); endControlledTransform(true); }
      if (event.data.mode === "edit") { propertyFlashingSurface.applyProperties([]); propertyFlashingSurface.apply([]); }
      mode = event.data.mode === "navigate" ? "navigate" : "edit";
      if (mode === "navigate") { cancelNudge(); cancelRegionPick(); }
      document.documentElement.dataset.framecraftMode = mode;
      if (mode === "navigate") queueMicrotask(emitLoadedEvents);
    } else if (event.data?.type === "framecraft:open-state-page" && typeof event.data.value === "string") {
      window.__framecraftRequestedPage = event.data.value;
      if (typeof window.__framecraftSetPage === "function") {
        window.__framecraftSetPage(event.data.value);
        window.__framecraftRequestedPage = undefined;
      }
    } else if (event.data?.type === "framecraft:collect-dynamizations") {
      collectDynamizations(true);
    } else if (event.data?.type === "framecraft:simulate") {
      simulationOn = event.data.on !== false;
      if (!simulationOn) clearSimulation();
      else applySimulation(event.data.commands);
    } else if (event.data?.type === "framecraft:property-flashing") {
      propertyFlashingSurface.items();
      propertyFlashingSurface.apply(Array.isArray(event.data.commands) ? event.data.commands : []);
    } else if (event.data?.type === "framecraft:screen-properties") {
      propertyFlashingSurface.items();
      propertyFlashingSurface.applyProperties(Array.isArray(event.data.commands) ? event.data.commands : []);
    } else if (event.data?.type === "framecraft:set-language") {
      currentTranslations = event.data.translations && typeof event.data.translations === "object" ? event.data.translations : {};
      applyLanguage();
    } else if (event.data?.type === "framecraft:hmi-event-result") {
      for (const target of Array.isArray(event.data.navigation) ? event.data.navigation : []) navigateHmiTarget(target);
      const source = instanceElements.get(event.data.instanceId);
      const origin = event.data.faceplateFromParent ? source?.parentElement : source;
      if (origin) for (const emitted of Array.isArray(event.data.faceplateEvents) ? event.data.faceplateEvents : []) {
        if (!emitted || typeof emitted.name !== "string") continue;
        origin.dispatchEvent(new CustomEvent("framecraft:faceplate-event", { bubbles: true, detail: { name: emitted.name, parameters: emitted.parameters || {} } }));
      }
    } else if (event.data?.type === "framecraft:popup-open" || event.data?.type === "framecraft:popup-update") {
      renderPopup(event.data.state);
    } else if (event.data?.type === "framecraft:popup-close") {
      closePopup(event.data.state);
    } else if (event.data?.type === "framecraft:preview-style") {
      const element = sourceElement(event.data.source, event.data.instanceId);
      if (element) Object.assign(element.style, event.data.styles);
    } else if (event.data?.type === "framecraft:begin-transform") {
      if (mode !== "edit") return;
      const element = sourceElement(event.data.source, event.data.instanceId);
      if (!element) return;
      cancelDrag(); endControlledTransform(true);
      controlledTransform = { element, before: prepareMotion(element) };
    } else if (event.data?.type === "framecraft:end-transform") {
      if (controlledTransform && instanceId(controlledTransform.element) === event.data.instanceId) endControlledTransform(Boolean(event.data.canceled));
    } else if (event.data?.type === "framecraft:set-snap") {
      snapSettings = {
        enabled: Boolean(event.data.enabled),
        grid: Number(event.data.grid) || 0,
        threshold: Number(event.data.threshold) || 6,
      };
      if (!snapSettings.enabled) hideGuides();
    } else if (event.data?.type === "framecraft:set-multi-selection") {
      const elements = Array.isArray(event.data.items) ? event.data.items.map(elementForGroupItem).filter(Boolean) : [];
      if (elements.length > 1) {
        selectedSource = readSource(elements[0]);
        selectedInstanceId = instanceId(elements[0]);
        extraSelected = elements.slice(1);
      } else {
        extraSelected = [];
      }
    } else if (event.data?.type === "framecraft:preview-highlight") {
      drawHighlightPreview(event.data.preview);
    } else if (event.data?.type === "framecraft:request-selection") {
      if (mode !== "edit" || !Number.isSafeInteger(event.data.requestId) || event.data.requestId < 1
        || event.data.selectionVersion !== selectionVersion) return;
      const element = sourceElement(event.data.source, event.data.instanceId, event.data.info);
      if (element) sendSelection(element, event.data);
    } else if (event.data?.type === "framecraft:set-editing") {
      dragEnabled = event.data.drag !== false;
      document.documentElement.dataset.framecraftGuided = dragEnabled ? "" : "true";
    } else if (event.data?.type === "framecraft:begin-region-pick") {
      if (mode !== "edit" || !["rectangle", "polygon"].includes(event.data.mode) || typeof event.data.requestId !== "string") return;
      if (regionPick?.requestId === event.data.requestId) return;
      cancelDrag(); cancelNudge(); clearRegionPick();
      pointPick = null;
      regionPick = { requestId: event.data.requestId, mode: event.data.mode, color: /^#[0-9a-f]{6}$/i.test(event.data.color) ? event.data.color : "#f59e0b", width: Number.isFinite(event.data.width) ? Math.max(1, Math.min(8, event.data.width)) : 3, anchor: null, points: [], hover: null, pointerId: null, complete: false };
      document.documentElement.dataset.framecraftRegionPicking = "true";
    } else if (event.data?.type === "framecraft:end-region-pick") {
      clearRegionPick();
    } else if (event.data?.type === "framecraft:finish-region-pick") {
      if (regionPick?.requestId === event.data.requestId && regionPick.mode === "polygon") finishRegion();
    } else if (event.data?.type === "framecraft:begin-point-pick") {
      cancelRegionPick();
      pointPick = { selector: typeof event.data.selector === "string" ? event.data.selector : null };
      document.documentElement.style.cursor = "crosshair";
    } else if (event.data?.type === "framecraft:end-point-pick") {
      pointPick = null;
      document.documentElement.style.cursor = "";
    } else if (event.data?.type === "framecraft:drop-at-point" && mode === "edit") {
      const x = Number(event.data.x);
      const y = Number(event.data.y);
      const element = Number.isFinite(x) && Number.isFinite(y) ? dropContainer(document.elementFromPoint(x, y)) : null;
      const source = readSource(element);
      if (source && typeof event.data.jsx === "string") {
        window.parent.postMessage({ type: "framecraft:drop", source, jsx: event.data.jsx, ...dropPosition(element, { clientX: x, clientY: y }) }, "*");
      }
    }
  });
  /** Where a click fell inside the drawing the editor is asking about, in that drawing's own
   * coordinates: the same units the panel's data is written in, so what is saved keeps meaning at
   * any size the panel is shown. */
  const pickPoint = (event) => {
    const drawing = pointPick.selector
      ? (event.target instanceof Element ? event.target.closest(pointPick.selector) : null) || document.querySelector(pointPick.selector)
      : (event.target instanceof Element ? event.target.closest("svg") : null);
    const point = drawing && drawing.localName === "svg" ? svgPointOf(drawing, event.clientX, event.clientY) : null;
    if (point) window.parent.postMessage({ type: "framecraft:point-picked", x: point.x, y: point.y }, "*");
    else window.parent.postMessage({ type: "framecraft:point-missed" }, "*");
  };
  document.addEventListener("pointerdown", (event) => {
    if (regionPick) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressClick = true;
      const pick = regionPick;
      if (event.button !== 0 || pick.complete || pick.pointerId != null) return;
      if (!pick.anchor) {
        const anchor = regionAnchor(event), source = readSource(anchor);
        if (!source || !anchor.getBoundingClientRect().width || !anchor.getBoundingClientRect().height) { regionMissed("Inizia sulla foto, sul disegno o su un contenitore della pagina."); return; }
        if ([...document.querySelectorAll("[" + attribute + "]")].filter((node) => matchesSource(node, source)).length > 1) { regionMissed("Questa parte ha più copie. Scegli una foto o un contenitore singolo."); return; }
        pick.anchor = anchor; pick.space = anchor.localName === "svg" ? "svg" : "box";
      }
      const point = regionPoint(pick, event);
      if (!point) { regionMissed("Non riesco a leggere le coordinate del disegno."); return; }
      if (pick.mode === "rectangle") {
        pick.points = [point]; pick.hover = point; pick.pointerId = event.pointerId;
        pick.anchor.setPointerCapture?.(event.pointerId);
      } else {
        if (pick.points.length >= 128) { regionMissed("Il contorno può contenere al massimo 128 punti."); return; }
        const last = pick.points.at(-1);
        if (!last || last.x !== point.x || last.y !== point.y) pick.points.push(point);
        pick.hover = point;
      }
      queueRegionPaint(); return;
    }
    if (!pointPick || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = true;
    pickPoint(event);
  }, true);
  document.addEventListener("click", (event) => {
    if (regionPick) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (pointPick) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (mode !== "edit") return;
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const element = selectionTarget(event);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    sendSelection(element);
  }, true);
  document.addEventListener("pointermove", (event) => {
    const pick = regionPick;
    if (!pick) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!pick.anchor || pick.complete || (pick.pointerId != null && pick.pointerId !== event.pointerId)) return;
    pick.hover = regionPoint(pick, event); queueRegionPaint();
  }, true);
  document.addEventListener("pointerup", (event) => {
    const pick = regionPick;
    if (!pick) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (pick.mode !== "rectangle" || pick.pointerId !== event.pointerId) return;
    pick.hover = regionPoint(pick, event);
    pick.pointerId = null;
    if (pick.anchor?.hasPointerCapture?.(event.pointerId)) pick.anchor.releasePointerCapture(event.pointerId);
    if (regionFrame) cancelAnimationFrame(regionFrame);
    regionFrame = 0; paintRegion(); finishRegion();
    if (!pick.complete) { pick.anchor = null; pick.points = []; pick.hover = null; regionLayer?.remove(); regionLayer = null; }
  }, true);
  document.addEventListener("pointercancel", (event) => {
    if (regionPick && (regionPick.pointerId == null || regionPick.pointerId === event.pointerId)) { event.preventDefault(); event.stopImmediatePropagation(); cancelRegionPick(); }
  }, true);
  document.addEventListener("lostpointercapture", (event) => { if (regionPick?.pointerId === event.pointerId) cancelRegionPick(); }, true);
  document.addEventListener("keydown", (event) => {
    if (!regionPick) return;
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); cancelRegionPick(); }
    else if (event.key === "Enter") { event.preventDefault(); if (regionPick.mode === "polygon") finishRegion(); }
    else if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); if (!regionPick.complete && regionPick.mode === "polygon") { regionPick.points.pop(); queueRegionPaint(); } }
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault();
  }, true);
  window.addEventListener("blur", cancelRegionPick);
  window.addEventListener("pagehide", cancelRegionPick);
  document.addEventListener("pointerdown", (event) => {
    if (mode !== "edit" || event.button !== 0 || inlineTarget) return;
    const element = selectionTarget(event);
    const source = readSource(element);
    if (!source) return;
    // Ctrl adds immediately. Shift is decided on release: a Shift+click adds to the group, while a
    // Shift+drag uses the same gesture to keep the movement horizontal or vertical.
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick = true;
      toggleGroupElement(element);
      return;
    }
    // A guided page is read with the mouse and changed from the panel: selecting still works, so the
    // element can be inspected, but nothing follows the pointer.
    if (!dragEnabled) {
      sendSelection(element);
      return;
    }
    // A click-through element is selected but never dragged: the user asked to reach the writing,
    // not to move it by accident on the way.
    if (isClickThrough(element)) {
      if (event.shiftKey) { suppressClick = true; toggleGroupElement(element); }
      else sendSelection(element);
      return;
    }
    const rect = element.getBoundingClientRect();
    const current = translateOf(element);
    const picked = groupElements();
    cancelDrag();
    const group = picked.length > 1 && picked.includes(element)
      ? picked.map((member) => ({ element: member, description: describeForGroup(member), translate: translateOf(member) }))
      : null;
    const groupRects = group ? group.map((member) => member.element.getBoundingClientRect()) : [rect];
    const groupLeft = Math.min(...groupRects.map((box) => box.left));
    const groupTop = Math.min(...groupRects.map((box) => box.top));
    const groupRight = Math.max(...groupRects.map((box) => box.right));
    const groupBottom = Math.max(...groupRects.map((box) => box.bottom));
    dragTarget = { element, source, instanceId: instanceId(element), pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, translateX: current.x, translateY: current.y, started: false, shiftSelect: event.shiftKey, translate: current.x + "px " + current.y + "px", group: group, originLeft: groupLeft, originTop: groupTop, originWidth: groupRight - groupLeft, originHeight: groupBottom - groupTop, candidates: null, latestPointer: null };
    element.setPointerCapture?.(event.pointerId);
    if (!event.shiftKey && !group) sendSelection(element);
  }, true);
  const describeDraggedGroup = (session) => session.group.map((member) => {
    const rect = member.element.getBoundingClientRect();
    return { ...member.description, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, translate: translateOfInline(member.element) };
  });
  const translateOfInline = (element) => {
    const parts = (element.style.translate || "0px 0px").split(/\s+/).map((value) => Number.parseFloat(value) || 0);
    return { x: parts[0] || 0, y: parts[1] || 0 };
  };
  const applyDragFrame = () => {
    dragFrame = 0;
    if (!dragTarget?.started || !dragTarget.latestPointer) return;
    if (!dragTarget.element.isConnected || dragTarget.group?.some((member) => !member.element.isConnected)) { cancelDrag(); return; }
    const event = dragTarget.latestPointer;
    let deltaX = event.clientX - dragTarget.startX;
    let deltaY = event.clientY - dragTarget.startY;
    // Like a presentation editor, Shift keeps the movement on its original row or column. Alt is the
    // temporary escape hatch from snapping, so every in-between position is still reachable.
    let lockedAxis = null;
    if (event.shiftKey) {
      lockedAxis = Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
      if (lockedAxis === "x") deltaY = 0;
      else deltaX = 0;
    }
    let lineX = null;
    let lineY = null;
    let equalX = null;
    let equalY = null;
    if (snapSettings.enabled && !event.altKey) {
      const hitX = snapOffset(dragTarget.originLeft + deltaX, dragTarget.originWidth, dragTarget.candidates.xs, snapSettings.threshold);
      const hitY = snapOffset(dragTarget.originTop + deltaY, dragTarget.originHeight, dragTarget.candidates.ys, snapSettings.threshold);
      const gapHitX = equalGapOffset(dragTarget.originLeft + deltaX, dragTarget.originWidth, dragTarget.originTop + deltaY, dragTarget.originHeight, dragTarget.candidates.boxes, "x", snapSettings.threshold);
      const gapHitY = equalGapOffset(dragTarget.originTop + deltaY, dragTarget.originHeight, dragTarget.originLeft + deltaX, dragTarget.originWidth, dragTarget.candidates.boxes, "y", snapSettings.threshold);
      // Edge/centre alignment wins a tie; otherwise the guide requiring the smallest correction is
      // the one the pointer is visibly aiming for.
      if (lockedAxis !== "y") {
        if (gapHitX && (!hitX || Math.abs(gapHitX.distance) < Math.abs(hitX.distance))) { deltaX += gapHitX.distance; equalX = gapHitX; }
        else if (hitX) { deltaX += hitX.distance; lineX = hitX.at; }
        else deltaX += gridOffset(dragTarget.translateX + deltaX, snapSettings.grid);
      }
      if (lockedAxis !== "x") {
        if (gapHitY && (!hitY || Math.abs(gapHitY.distance) < Math.abs(hitY.distance))) { deltaY += gapHitY.distance; equalY = gapHitY; }
        else if (hitY) { deltaY += hitY.distance; lineY = hitY.at; }
        else deltaY += gridOffset(dragTarget.translateY + deltaY, snapSettings.grid);
      }
    }
    // A locked axis is itself a smart guide. It stays visible even when the object is not near
    // another edge, making "straight" an explicit state rather than a hidden modifier.
    if (lockedAxis === "x" && lineY === null) lineY = dragTarget.originTop + dragTarget.originHeight / 2;
    if (lockedAxis === "y" && lineX === null) lineX = dragTarget.originLeft + dragTarget.originWidth / 2;
    if (lineX === null) guideX.style.display = "none";
    else { guideX.style.display = "block"; guideX.style.left = lineX + "px"; guideX.firstElementChild.textContent = lockedAxis === "y" ? "MOVIMENTO VERTICALE" : "ALLINEATO"; }
    if (lineY === null) guideY.style.display = "none";
    else { guideY.style.display = "block"; guideY.style.top = lineY + "px"; guideY.firstElementChild.textContent = lockedAxis === "x" ? "MOVIMENTO ORIZZONTALE" : "ALLINEATO"; }
    const guideBox = { left: dragTarget.originLeft + deltaX, right: dragTarget.originLeft + deltaX + dragTarget.originWidth,
      top: dragTarget.originTop + deltaY, bottom: dragTarget.originTop + deltaY + dragTarget.originHeight,
      width: dragTarget.originWidth, height: dragTarget.originHeight };
    if (equalX) showGap(gapX, "x", equalX, guideBox); else hideGap(gapX);
    if (equalY) showGap(gapY, "y", equalY, guideBox); else hideGap(gapY);
    dragTarget.translate = Math.round((dragTarget.translateX + deltaX) * 10) / 10 + "px " + Math.round((dragTarget.translateY + deltaY) * 10) / 10 + "px";
    if (dragTarget.group) {
      for (const member of dragTarget.group) {
        member.element.style.translate = Math.round((member.translate.x + deltaX) * 10) / 10 + "px " + Math.round((member.translate.y + deltaY) * 10) / 10 + "px";
      }
      window.parent.postMessage({ type: "framecraft:group-drag-move", items: describeDraggedGroup(dragTarget) }, "*");
    } else {
      dragTarget.element.style.translate = dragTarget.translate;
      const rect = dragTarget.element.getBoundingClientRect();
      window.parent.postMessage({ type: "framecraft:drag-move", source: dragTarget.source, instanceId: dragTarget.instanceId, selectionVersion, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }, "*");
    }
  };
  document.addEventListener("pointermove", (event) => {
    if (!dragTarget || dragTarget.pointerId !== event.pointerId) return;
    if (!dragTarget.started && Math.hypot(event.clientX - dragTarget.startX, event.clientY - dragTarget.startY) < 3) return;
    if (!dragTarget.started) {
      if (dragTarget.shiftSelect && !dragTarget.group) sendSelection(dragTarget.element);
      dragTarget.started = true;
      dragTarget.candidates = snapCandidates(dragTarget.group ? dragTarget.group.map((member) => member.element) : dragTarget.element);
      if (dragTarget.group) for (const member of dragTarget.group) member.before = prepareMotion(member.element);
      else dragTarget.before = prepareMotion(dragTarget.element);
    }
    suppressClick = true;
    event.preventDefault(); event.stopPropagation();
    dragTarget.latestPointer = { clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey, altKey: event.altKey };
    if (!dragFrame) dragFrame = requestAnimationFrame(applyDragFrame);
  }, true);
  function cancelDrag() {
    cancelAnimationFrame(dragFrame); dragFrame = 0;
    if (!dragTarget) return;
    const completed = dragTarget;
    dragTarget = null;
    hideGuides();
    if (completed.started) {
      if (completed.group) {
        for (const member of completed.group) restoreMotion(member.element, member.before, true);
        window.parent.postMessage({ type: "framecraft:group-drag-move", items: completed.group.map((member) => member.description) }, "*");
      } else {
        restoreMotion(completed.element, completed.before, true);
        scheduleTrackedSelection();
      }
    }
    try { completed.element.releasePointerCapture?.(completed.pointerId); } catch {}
    scheduleCollect();
    setTimeout(() => { suppressClick = false; }, 0);
  }
  const finishDrag = (event) => {
    if (!dragTarget || dragTarget.pointerId !== event.pointerId) return;
    if (event.type === "pointercancel") { event.preventDefault(); event.stopPropagation(); cancelDrag(); return; }
    cancelAnimationFrame(dragFrame); dragFrame = 0;
    if (dragTarget.started) {
      dragTarget.latestPointer = { clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey, altKey: event.altKey };
      applyDragFrame();
      if (!dragTarget) return;
    }
    const completed = dragTarget;
    dragTarget = null;
    hideGuides();
    if (!completed.started) {
      if (completed.shiftSelect) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick = true;
        toggleGroupElement(completed.element);
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (completed.group) {
      const items = describeDraggedGroup(completed);
      for (const member of completed.group) restoreMotion(member.element, member.before, false);
      window.parent.postMessage({ type: "framecraft:group-drag-end", items }, "*");
    } else {
      const rect = completed.element.getBoundingClientRect();
      restoreMotion(completed.element, completed.before, false);
      window.parent.postMessage({ type: "framecraft:drag-end", source: completed.source, instanceId: completed.instanceId, selectionVersion, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, translate: completed.translate }, "*");
    }
    scheduleCollect();
    setTimeout(() => { suppressClick = false; }, 0);
  };
  document.addEventListener("pointerup", finishDrag, true);
  document.addEventListener("pointercancel", finishDrag, true);
  document.addEventListener("lostpointercapture", (event) => { if (dragTarget?.pointerId === event.pointerId) cancelDrag(); }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !dragTarget) return;
    event.preventDefault(); event.stopImmediatePropagation(); cancelDrag();
  }, true);
  window.addEventListener("blur", () => { cancelDrag(); endControlledTransform(true); });
  window.addEventListener("pagehide", () => { cancelDrag(); endControlledTransform(true); });
  document.addEventListener("dblclick", (event) => {
    if (regionPick) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (mode !== "edit") return;
    const element = selectionTarget(event);
    const source = readSource(element);
    if (!source) return;
    const writing = (element.textContent || "").trim();
    // Inline editing needs a real HTML element the app leaves interactive. An SVG label, or a label
    // the app draws click-through, is edited from the property sheet instead — so the double click
    // opens the sheet with the cursor already in the text field rather than doing nothing.
    const inlineEditable = element instanceof HTMLElement && !isClickThrough(element) && !element.children.length && Boolean(writing);
    window.parent.postMessage({ type: "framecraft:inspect", source, tag: element.localName, editText: !inlineEditable && Boolean(writing) }, "*");
    if (!inlineEditable) return;
    event.preventDefault();
    event.stopPropagation();
    inlineTarget = { element, original: element.textContent };
    element.contentEditable = "true";
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, true);
  const arrowSteps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  /** Moves the selection by hand. The page is redrawn on every press so the movement is visible, but
   * the file is written once the user stops: holding an arrow down must not fill the undo history
   * with forty steps of one pixel each. */
  const nudge = (element, dx, dy) => {
    if (!pendingNudge) pendingNudge = { element, original: element.style.translate };
    const current = translateOf(element);
    element.style.translate = Math.round((current.x + dx) * 10) / 10 + "px " + Math.round((current.y + dy) * 10) / 10 + "px";
    const source = selectedSource;
    const id = selectedInstanceId;
    const version = selectionVersion;
    const box = () => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    window.parent.postMessage({ type: "framecraft:drag-move", source: source, instanceId: id, selectionVersion: version, rect: box() }, "*");
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => {
      if (mode !== "edit" || selectionVersion !== version || selectedInstanceId !== id) { cancelNudge(); return; }
      pendingNudge = null;
      window.parent.postMessage({ type: "framecraft:drag-end", source: source, instanceId: id, selectionVersion: version, rect: box(), translate: element.style.translate }, "*");
    }, 260);
  };
  document.addEventListener("keydown", (event) => {
    if (inlineTarget) {
      if (event.key === "Enter") { event.preventDefault(); inlineTarget.element.blur(); }
      if (event.key === "Escape") { inlineTarget.element.textContent = inlineTarget.original; inlineTarget.element.blur(); }
      return;
    }
    const editing = event.target instanceof Element && event.target.matches("input, textarea, [contenteditable=true]");
    // The editor shell never sees a key pressed inside the preview, so the shortcuts it owns are
    // forwarded. Without this, undo, redo and save are dead for as long as the canvas has focus.
    const modifier = event.ctrlKey || event.metaKey;
    const shortcut = modifier && !event.altKey ? event.key.toLowerCase() : "";
    if (shortcut === "s" || (!editing && (shortcut === "z" || shortcut === "y" || shortcut === "d"))) {
      event.preventDefault();
      event.stopPropagation();
      window.parent.postMessage({ type: "framecraft:shortcut", key: shortcut, shift: event.shiftKey }, "*");
      return;
    }
    // Arrow keys move the selection by a pixel, ten with Shift. It is the only way to place an
    // element exactly without typing numbers into the property sheet, and the mouse cannot do it.
    const step = arrowSteps[event.key];
    if (mode === "edit" && step && !editing && selectedSource) {
      const target = sourceElement(selectedSource, selectedInstanceId);
      if (target && !isClickThrough(target)) {
        event.preventDefault();
        event.stopPropagation();
        const size = event.shiftKey ? 10 : 1;
        nudge(target, step[0] * size, step[1] * size);
        return;
      }
    }
    const deleting = event.key === "Delete" || event.key === "Del" || event.key === "Backspace" || event.code === "Delete";
    if (mode === "edit" && deleting && !editing) {
      event.preventDefault();
      event.stopPropagation();
      // Naming the element instead of sending a bare command is what makes Canc predictable: the
      // editor deletes what the preview shows as selected, even when its own selection lags behind.
      const selected = selectedSource ? sourceElement(selectedSource, selectedInstanceId) : null;
      if (selected) {
        window.parent.postMessage({ type: "framecraft:delete", source: selectedSource, instanceId: selectedInstanceId, info: describeElement(selected, selectedSource) }, "*");
        selectedSource = null;
        selectedInstanceId = null;
        return;
      }
      // Without a local selection the editor still owns one, so the command is forwarded as it was.
      window.parent.postMessage({ type: "framecraft:shortcut", key: "delete", shift: false }, "*");
    }
  }, true);
  document.addEventListener("focusout", (event) => {
    if (!inlineTarget || event.target !== inlineTarget.element) return;
    const { element, original } = inlineTarget;
    inlineTarget = null;
    element.contentEditable = "false";
    const source = readSource(element);
    if (source && element.textContent !== original) window.parent.postMessage({ type: "framecraft:edit-text", source, value: element.textContent }, "*");
  }, true);
  document.addEventListener("dragover", (event) => {
    if (mode !== "edit" || !event.dataTransfer?.types.includes("application/x-framecraft-jsx")) return;
    const element = dropContainer(event.target);
    if (!element) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    dropMarker.style.display = "block";
    dropMarker.style.left = event.clientX + "px";
    dropMarker.style.top = event.clientY + "px";
  }, true);
  document.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) dropMarker.style.display = "none";
  }, true);
  document.addEventListener("drop", (event) => {
    dropMarker.style.display = "none";
    if (mode !== "edit") return;
    const jsx = event.dataTransfer?.getData("application/x-framecraft-jsx");
    if (!jsx) return;
    const element = dropContainer(event.target);
    const source = readSource(element);
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    window.parent.postMessage({ type: "framecraft:drop", source, jsx, ...dropPosition(element, event) }, "*");
  }, true);
  document.addEventListener("pointerdown", (event) => emitHmiEvent(event.target?.closest?.("[data-hmi-events]"), "Down"), true);
  document.addEventListener("pointerup", (event) => emitHmiEvent(event.target?.closest?.("[data-hmi-events]"), "Up"), true);
  document.addEventListener("click", (event) => emitHmiEvent(event.target?.closest?.("[data-hmi-events]"), "Tapped"), true);
  document.addEventListener("change", (event) => emitHmiEvent(event.target?.closest?.("[data-hmi-events]"), "Change"), true);
  document.addEventListener("focusin", (event) => emitHmiEvent(event.target?.closest?.("[data-hmi-events]"), "Activated"), true);
  document.addEventListener("focusout", (event) => emitHmiEvent(event.target?.closest?.("[data-hmi-events]"), "Deactivated"), true);
  document.addEventListener("contextmenu", (event) => emitHmiEvent(event.target?.closest?.("[data-hmi-events]"), "ContextTapped"), true);
  document.addEventListener("keydown", (event) => {
    const owner = event.target?.closest?.("[data-hmi-events]");
    emitHmiEvent(owner, "KeyDown", { key: event.key });
    emitHmiEvent(owner, "HotKey", { key: event.key });
  }, true);
  document.addEventListener("keyup", (event) => emitHmiEvent(event.target?.closest?.("[data-hmi-events]"), "KeyUp", { key: event.key }), true);
  document.addEventListener("framecraft:interface-event", (event) => emitHmiEvent(event.target?.closest?.("[data-hmi-events]"), "InterfaceEvent", { interfaceEvent: typeof event.detail === "string" ? event.detail : "InterfaceEvent" }), true);
  document.addEventListener("framecraft:faceplate-event", emitFaceplateInterfaceEvent, true);
  document.addEventListener("framecraft:command-fired", (event) => emitHmiEvent(event.target?.closest?.("[data-hmi-events]"), "CommandFired", { command: typeof event.detail === "string" ? event.detail : "Command" }), true);
  document.addEventListener("pointerdown", (event) => {
    if (mode === "navigate" && event.pointerType === "touch" && event.isPrimary !== false) {
      hmiGestureStart = { pointerId: event.pointerId, target: event.target, x: event.clientX, y: event.clientY, time: Date.now() };
    }
  }, true);
  document.addEventListener("pointerup", (event) => finishHmiGesture(event), true);
  document.addEventListener("pointercancel", (event) => finishHmiGesture(event, true), true);
  window.addEventListener("beforeunload", () => { for (const element of loadedEvents) emitHmiEvent(element, "Unloaded"); });
  window.addEventListener("popstate", sendReady);
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method].bind(history);
    history[method] = (...args) => { const result = original(...args); queueMicrotask(sendReady); return result; };
  }
  const sizeObserver = new ResizeObserver(sendSize);
  sizeObserver.observe(document.documentElement);
  if (document.body) sizeObserver.observe(document.body);
  window.addEventListener("resize", sendSize);
  window.addEventListener("load", sendSize);
  let lastStatePage;
  const watchStatePage = () => {
    // The poll outlives the page in tests and during navigation, so it checks it still has a window.
    if (typeof window === "undefined") return;
    if (typeof window.__framecraftRequestedPage === "string" && typeof window.__framecraftSetPage === "function") {
      const requested = window.__framecraftRequestedPage;
      window.__framecraftRequestedPage = undefined;
      window.__framecraftSetPage(requested);
    }
    if (typeof window.__framecraftCurrentPage === "string" && window.__framecraftCurrentPage !== lastStatePage) {
      lastStatePage = window.__framecraftCurrentPage;
      window.parent.postMessage({ type: "framecraft:state-page", value: lastStatePage }, "*");
    }
  };
  document.documentElement.dataset.framecraftMode = mode;
  sendReady();
  sendSize();
  queueMicrotask(emitLoadedEvents);
  watchStatePage();
  const statePageTimer = setInterval(watchStatePage, 100);
  window.addEventListener("pagehide", () => clearInterval(statePageTimer));
})();`;

export function previewWatchConfig(server, platform = process.platform) {
  if (platform !== "win32" || server?.watch === null) return;
  // Windows can reject fs.watch while an imported image is still being copied.
  // Polling avoids that handle race; Vite still excludes dependencies and build output.
  return { server: { watch: {
    usePolling: true,
    interval: server?.watch?.interval ?? 100,
    binaryInterval: server?.watch?.binaryInterval ?? 300,
  } } };
}

export default function framecraftSourcePlugin() {
  const uninstrumented = new Set();
  return {
    name: "framecraft-source-map",
    enforce: "pre",
    config(config, env) {
      if (env.command === "serve") return previewWatchConfig(config.server);
    },
    transform(code, rawId) {
      const id = rawId.split("?")[0];
      if (!/\.[jt]sx$/.test(id) || id.includes("node_modules")) return null;
      try {
        return instrument(code, id);
      } catch (error) {
        // Instrumentation is an editor convenience. A file Babel cannot handle is served untouched:
        // it becomes unselectable in the canvas, but the user's app still runs.
        if (!uninstrumented.has(id)) {
          uninstrumented.add(id);
          const message = `framecraft: ${id} non è stato strumentato (${error.message}). Resta visibile ma non selezionabile.`;
          if (typeof this?.warn === "function") this.warn(message); else console.warn(message);
        }
        return null;
      }
    },
    transformIndexHtml(html) {
      return { html, tags: [{ tag: "script", attrs: { type: "module" }, children: bridgeScript, injectTo: "body" }] };
    },
  };
}

function instrument(code, id) {
  const result = transformSync(code, {
    filename: id,
    sourceMaps: true,
    sourceFileName: id,
    configFile: false,
    babelrc: false,
    parserOpts: { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"] },
    generatorOpts: { retainLines: true },
    plugins: [() => {
      const instrumentedStateDeclarations = new WeakSet();
      // Which parameter of a list callback holds the index, per callback. The preview reports it so
      // the editor can change or delete one rendered copy without touching its siblings, and so that
      // it keeps pointing at the same item after one of them is removed.
      const listIndexNames = new Map();
      const mapCallbackFor = (path) => {
        let parent = path.parentPath;
        while (parent) {
          if ((parent.isArrowFunctionExpression() || parent.isFunctionExpression()) && parent.parentPath?.isCallExpression()) {
            const callee = parent.parentPath.node.callee;
            if (t.isMemberExpression(callee) && !callee.computed && t.isIdentifier(callee.property, { name: "map" })) return parent;
          }
          parent = parent.parentPath;
        }
        return null;
      };
      const listIndexName = (path) => {
        const callback = mapCallbackFor(path);
        if (!callback) return null;
        if (listIndexNames.has(callback.node)) return listIndexNames.get(callback.node);
        const params = callback.node.params;
        let name = null;
        // A parameter cannot follow a rest parameter, so a callback written with one is left alone.
        if (params.some((param) => t.isRestElement(param))) {
          listIndexNames.set(callback.node, null);
          return null;
        }
        if (t.isIdentifier(params[1])) {
          name = params[1].name;
        } else if (!params[1]) {
          name = "__framecraftIndex";
          // A callback declared without parameters would take the index as the item, so the item
          // keeps its place and only the second parameter is added.
          if (!params[0]) params.push(t.identifier("__framecraftItem"));
          params.push(t.identifier(name));
        }
        listIndexNames.set(callback.node, name);
        return name;
      };
      return { visitor: {
        VariableDeclarator(path) {
          if (!t.isArrayPattern(path.node.id) || !t.isCallExpression(path.node.init)) return;
          const state = path.node.id.elements[0];
          const setter = path.node.id.elements[1];
          const callee = path.node.init.callee;
          const useStateCall = t.isIdentifier(callee, { name: "useState" })
            || t.isMemberExpression(callee) && t.isIdentifier(callee.property, { name: "useState" });
          if (!useStateCall || !t.isIdentifier(state) || !t.isIdentifier(setter) || !/(page|view|screen|section)/i.test(state.name)) return;
          const declaration = path.parentPath;
          if (!declaration.isVariableDeclaration() || instrumentedStateDeclarations.has(declaration.node)) return;
          instrumentedStateDeclarations.add(declaration.node);
          declaration.insertAfter([
            t.expressionStatement(t.assignmentExpression("=", t.memberExpression(t.identifier("window"), t.identifier("__framecraftSetPage")), t.identifier(setter.name))),
            t.expressionStatement(t.assignmentExpression("=", t.memberExpression(t.identifier("window"), t.identifier("__framecraftCurrentPage")), t.identifier(state.name))),
          ]);
        },
        JSXOpeningElement(path) {
          if (!t.isJSXIdentifier(path.node.name) || !/^[a-z]/.test(path.node.name.name) || path.node.start == null || path.parent.end == null || !path.parent.loc) return;
          if (path.node.attributes.some((attribute) => t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name, { name: "data-fc-source" }))) return;
          const source = { file: id, start: path.parent.start, end: path.parent.end, line: path.parent.loc.start.line, column: path.parent.loc.start.column + 1 };
          path.node.attributes.push(t.jsxAttribute(
            t.jsxIdentifier("data-fc-source"),
            t.jsxExpressionContainer(t.stringLiteral(JSON.stringify(source))),
          ));
          const indexName = listIndexName(path);
          if (indexName) {
            path.node.attributes.push(t.jsxAttribute(
              t.jsxIdentifier("data-fc-index"),
              t.jsxExpressionContainer(t.identifier(indexName)),
            ));
          }
        },
      } };
    }],
  });
  return result?.code ? { code: result.code, map: result.map } : null;
}
