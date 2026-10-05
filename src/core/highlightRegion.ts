export type HighlightPickMode = "element" | "rectangle" | "polygon";
export interface HighlightRegion {
  space: "box" | "svg";
  points: { x: number; y: number }[];
}

export function readHighlightRegion(value: unknown): HighlightRegion | undefined {
  try {
    const region = typeof value === "string" ? JSON.parse(value) : value;
    if (!region || !["box", "svg"].includes(region.space) || !Array.isArray(region.points)
      || region.points.length < 3 || region.points.length > 128) return undefined;
    const points: HighlightRegion["points"] = [];
    for (const point of region.points) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
      if (region.space === "box" && (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return undefined;
      if (Math.abs(point.x) > 1000000 || Math.abs(point.y) > 1000000) return undefined;
      points.push({ x: point.x, y: point.y });
    }
    const area = points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    if (Math.abs(area) < 1e-10) return undefined;
    return { space: region.space, points };
  } catch { return undefined; }
}

/** Self-contained: its compiled source is saved in the panel's click handler. */
export function toggleHighlightRegion(target: HTMLElement | SVGElement, region: HighlightRegion, color: string, width: number) {
  const host = target as (HTMLElement | SVGElement) & { __framecraftRegionCleanup?: () => void; __framecraftRegionKey?: string };
  const key = JSON.stringify([region, color, width]);
  if (host.__framecraftRegionCleanup) {
    const same = host.__framecraftRegionKey === key;
    host.__framecraftRegionCleanup();
    if (same) return;
  }
  const doc = target.ownerDocument;
  const view = doc.defaultView;
  if (!view || !doc.body || !target.isConnected) return;
  const layer = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  layer.setAttribute("data-fc-highlight-region-layer", "");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { all: "initial", display: "block", margin: "0", padding: "0", border: "0", background: "none", position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "2147483000", overflow: "hidden" });
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", color);
  path.setAttribute("fill-opacity", ".18");
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", String(width));
  path.setAttribute("vector-effect", "non-scaling-stroke");
  Object.assign(path.style, { fill: color, fillOpacity: ".18", stroke: color, strokeWidth: String(width), vectorEffect: "non-scaling-stroke", display: "inline", visibility: "visible", opacity: "1", filter: "none", transform: "none" });
  layer.append(path);
  doc.body.append(layer);
  let frame = 0;
  let previous = "";
  const cleanup = () => {
    view.cancelAnimationFrame(frame);
    view.removeEventListener("pagehide", cleanup);
    layer.remove();
    delete host.__framecraftRegionCleanup;
    delete host.__framecraftRegionKey;
    target.dataset.fcHighlightRegionActive = "false";
  };
  host.__framecraftRegionCleanup = cleanup;
  host.__framecraftRegionKey = key;
  target.dataset.fcHighlightRegionActive = "true";
  view.addEventListener("pagehide", cleanup, { once: true });
  const paint = () => {
    if (!target.isConnected) { cleanup(); return; }
    const box = target.getBoundingClientRect();
    const matrix = region.space === "svg" && "getScreenCTM" in target
      ? (target as SVGSVGElement).getScreenCTM() : undefined;
    if (region.space === "svg" && !matrix) { layer.style.display = "none"; }
    else {
      layer.style.display = box.width > 0 && box.height > 0 ? "" : "none";
      const d = region.points.map((point, index) => {
        const x = matrix ? matrix.a * point.x + matrix.c * point.y + matrix.e : box.left + point.x * box.width;
        const y = matrix ? matrix.b * point.x + matrix.d * point.y + matrix.f : box.top + point.y * box.height;
        return (index ? "L" : "M") + x + " " + y;
      }).join(" ") + " Z";
      if (d !== previous) { path.setAttribute("d", d); previous = d; }
    }
    frame = view.requestAnimationFrame(paint);
  };
  paint();
}
