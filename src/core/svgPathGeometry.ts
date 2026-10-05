export interface PathBounds { x: number; y: number; width: number; height: number }
export type HighlightShape = "line" | "rectangle" | "square" | "ellipse";
export interface PathAnchor { x: number; y: number; index: number }

type Segment = { command: string; values: number[] };

const argumentCount: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function tokensOf(path: string) {
  return path.match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? [];
}

/** Normalises SVG path data to absolute commands. It deliberately keeps curves as curves: moving
 * or resizing an HMI highlight must not turn a carefully drawn machine outline into a rectangle. */
function parsePath(path: string): Segment[] {
  const tokens = tokensOf(path);
  const segments: Segment[] = [];
  let index = 0;
  let command = "";
  let current = { x: 0, y: 0 };
  let subpath = { x: 0, y: 0 };
  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    if (!command) throw new Error("Tracciato SVG non valido.");
    const upper = command.toUpperCase();
    const count = argumentCount[upper];
    if (count == null) throw new Error(`Il comando SVG ${command} non è supportato.`);
    if (upper === "Z") {
      segments.push({ command: "Z", values: [] });
      current = { ...subpath };
      command = "";
      continue;
    }
    if (index + count > tokens.length || /^[a-zA-Z]$/.test(tokens[index])) throw new Error(`Mancano valori dopo ${command}.`);
    const values = tokens.slice(index, index + count).map(Number);
    if (values.some((value) => !Number.isFinite(value))) throw new Error("Il tracciato contiene coordinate non valide.");
    index += count;
    const relative = command === command.toLowerCase();
    const point = (x: number, y: number) => relative ? [x + current.x, y + current.y] : [x, y];
    let normalized = upper;
    let absolute = [...values];
    if (upper === "H") { normalized = "L"; absolute = [relative ? values[0] + current.x : values[0], current.y]; }
    else if (upper === "V") { normalized = "L"; absolute = [current.x, relative ? values[0] + current.y : values[0]]; }
    else if (["M", "L", "T"].includes(upper)) absolute = point(values[0], values[1]);
    else if (["C", "S", "Q"].includes(upper)) {
      absolute = [];
      for (let pair = 0; pair < values.length; pair += 2) absolute.push(...point(values[pair], values[pair + 1]));
    } else if (upper === "A") {
      const end = point(values[5], values[6]);
      absolute = [values[0], values[1], values[2], values[3], values[4], ...end];
    }
    if (normalized === "M") {
      subpath = { x: absolute[0], y: absolute[1] };
      // Extra coordinate pairs after M are implicit L commands.
      if (segments.at(-1)?.command === "M" && !/^[a-zA-Z]$/.test(tokens[index - count - 1] ?? "")) normalized = "L";
    }
    segments.push({ command: normalized, values: absolute });
    if (["M", "L", "T"].includes(normalized)) current = { x: absolute[0], y: absolute[1] };
    else if (normalized === "C") current = { x: absolute[4], y: absolute[5] };
    else if (["S", "Q"].includes(normalized)) current = { x: absolute[2], y: absolute[3] };
    else if (normalized === "A") current = { x: absolute[5], y: absolute[6] };
    if (upper === "M") command = relative ? "l" : "L";
  }
  return segments;
}

function coordinates(segment: Segment): [number, number][] {
  if (["M", "L", "T"].includes(segment.command)) return [[segment.values[0], segment.values[1]]];
  if (segment.command === "C") return [[segment.values[0], segment.values[1]], [segment.values[2], segment.values[3]], [segment.values[4], segment.values[5]]];
  if (["S", "Q"].includes(segment.command)) return [[segment.values[0], segment.values[1]], [segment.values[2], segment.values[3]]];
  if (segment.command === "A") return [[segment.values[5], segment.values[6]]];
  return [];
}

export function pathBounds(path: string): PathBounds {
  const points = parsePath(path).flatMap(coordinates);
  if (!points.length) throw new Error("Il tracciato non contiene punti.");
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}

function clean(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function serialize(segments: Segment[]) {
  return segments.map((segment) => `${segment.command}${segment.values.length ? segment.values.map(clean).join(" ") : ""}`).join(" ");
}

function endpointOffset(segment: Segment) {
  if (["M", "L", "T"].includes(segment.command)) return 0;
  if (segment.command === "C") return 4;
  if (["S", "Q"].includes(segment.command)) return 2;
  if (segment.command === "A") return 5;
  return undefined;
}

export function pathAnchors(path: string): PathAnchor[] {
  let index = 0;
  const anchors: PathAnchor[] = [];
  for (const segment of parsePath(path)) {
    const offset = endpointOffset(segment);
    if (offset == null) continue;
    anchors.push({ x: segment.values[offset], y: segment.values[offset + 1], index });
    index += 1;
  }
  return anchors;
}

export function movePathAnchor(path: string, anchorIndex: number, x: number, y: number): string {
  const segments = parsePath(path);
  let current = 0;
  for (const segment of segments) {
    const offset = endpointOffset(segment);
    if (offset == null) continue;
    if (current === anchorIndex) {
      segment.values[offset] = clean(x);
      segment.values[offset + 1] = clean(y);
      return serialize(segments);
    }
    current += 1;
  }
  throw new Error("Angolo dell'evidenziazione non trovato.");
}

export function pathClosed(path: string) {
  return parsePath(path).at(-1)?.command === "Z";
}

function polylinePath(points: { x: number; y: number }[], closed: boolean) {
  if (points.length < 2) throw new Error("Servono almeno due punti.");
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"}${clean(point.x)} ${clean(point.y)}`).join(" ")}${closed ? " Z" : ""}`;
}

/** Adds a real corner to one side. Curves become a polygon only when the user deliberately adds a
 * corner: moving existing anchors continues to preserve their curve commands. */
export function insertPathAnchor(path: string, afterIndex: number, point?: { x: number; y: number }): string {
  const anchors = pathAnchors(path);
  const closed = pathClosed(path);
  if (afterIndex < 0 || afterIndex >= anchors.length || (!closed && afterIndex === anchors.length - 1)) throw new Error("Lato non disponibile.");
  const next = anchors[(afterIndex + 1) % anchors.length];
  const previous = anchors[afterIndex];
  const inserted = point ?? { x: (previous.x + next.x) / 2, y: (previous.y + next.y) / 2 };
  const points = anchors.map(({ x, y }) => ({ x, y }));
  points.splice(afterIndex + 1, 0, inserted);
  return polylinePath(points, closed);
}

/** Takes one corner away. What is left is joined straight across, because a corner cannot be lifted
 * out of a curve without redrawing that curve, and reshaping the rest silently would be worse than
 * saying so. */
export function removePathAnchor(path: string, anchorIndex: number): string {
  const anchors = pathAnchors(path);
  const closed = pathClosed(path);
  if (anchorIndex < 0 || anchorIndex >= anchors.length) throw new Error("Angolo dell'evidenziazione non trovato.");
  const minimum = closed ? 3 : 2;
  if (anchors.length <= minimum) throw new Error(closed ? "Un contorno chiuso ha bisogno di almeno tre angoli." : "Una linea ha bisogno di almeno due punti.");
  return polylinePath(anchors.filter((_, index) => index !== anchorIndex).map(({ x, y }) => ({ x, y })), closed);
}

export function setPathClosed(path: string, closed: boolean): string {
  const anchors = pathAnchors(path);
  if (closed && anchors.length < 3) throw new Error("Aggiungi almeno un angolo prima di chiudere il contorno.");
  return polylinePath(anchors, closed);
}

export function transformPathToBounds(path: string, target: PathBounds): string {
  const source = pathBounds(path);
  const width = Math.max(1, target.width);
  const height = Math.max(1, target.height);
  const scaleX = width / source.width;
  const scaleY = height / source.height;
  const transformPoint = (x: number, y: number) => [clean(target.x + (x - source.x) * scaleX), clean(target.y + (y - source.y) * scaleY)];
  const transformed = parsePath(path).map((segment) => {
    const values = [...segment.values];
    if (["M", "L", "T"].includes(segment.command)) [values[0], values[1]] = transformPoint(values[0], values[1]);
    else if (["C", "S", "Q"].includes(segment.command)) {
      for (let pair = 0; pair < values.length; pair += 2) [values[pair], values[pair + 1]] = transformPoint(values[pair], values[pair + 1]);
    } else if (segment.command === "A") {
      values[0] = clean(values[0] * Math.abs(scaleX));
      values[1] = clean(values[1] * Math.abs(scaleY));
      [values[5], values[6]] = transformPoint(values[5], values[6]);
    }
    return { command: segment.command, values };
  });
  return serialize(transformed);
}

/** Creates an immediately recognisable shape inside the current area. Ellipses use cubic curves so
 * they remain editable by the same geometry engine without special SVG arc cases. */
export function highlightShapePath(shape: HighlightShape, bounds: PathBounds): string {
  let { x, y } = bounds;
  let width = Math.max(4, bounds.width);
  let height = Math.max(4, bounds.height);
  if (shape === "square") {
    const size = Math.max(20, bounds.height <= 4 ? bounds.width : Math.min(bounds.width, bounds.height));
    x += (width - size) / 2;
    y += (height - size) / 2;
    width = size;
    height = size;
  }
  const right = x + width;
  const bottom = y + height;
  if (shape === "line") return `M${clean(x)} ${clean(y + height / 2)} L${clean(right)} ${clean(y + height / 2)}`;
  if (shape === "rectangle" || shape === "square") return `M${clean(x)} ${clean(y)} L${clean(right)} ${clean(y)} L${clean(right)} ${clean(bottom)} L${clean(x)} ${clean(bottom)} Z`;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const k = .5522847498;
  const ox = width / 2 * k;
  const oy = height / 2 * k;
  return `M${clean(cx)} ${clean(y)} C${clean(cx + ox)} ${clean(y)} ${clean(right)} ${clean(cy - oy)} ${clean(right)} ${clean(cy)} C${clean(right)} ${clean(cy + oy)} ${clean(cx + ox)} ${clean(bottom)} ${clean(cx)} ${clean(bottom)} C${clean(cx - ox)} ${clean(bottom)} ${clean(x)} ${clean(cy + oy)} ${clean(x)} ${clean(cy)} C${clean(x)} ${clean(cy - oy)} ${clean(cx - ox)} ${clean(y)} ${clean(cx)} ${clean(y)} Z`;
}
