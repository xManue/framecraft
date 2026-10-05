export function rotationDegrees(value?: string | number): number | undefined {
  const written = String(value ?? "").trim();
  if (!written || written === "none") return 0;
  const angle = /^(?:(?:z|0\s+0\s+1)\s+)?([+-]?(?:\d+(?:\.\d*)?|\.\d+))(deg|rad|grad|turn)?$/i.exec(written);
  if (!angle) return undefined;
  const number = Number(angle[1]);
  if (!angle[2] && number !== 0) return undefined;
  const factor = { deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 }[angle[2]?.toLowerCase() ?? "deg"]!;
  const degrees = number * factor;
  return Number.isFinite(degrees) ? Math.round(degrees * 1000) / 1000 : undefined;
}

export function elementTransformStyles(values: Record<string, string | number>, styles: Record<string, string | number> = {}) {
  const patch = { ...values };
  if (values.zIndex !== undefined && String(values.zIndex) !== "auto"
    && (values.position ?? styles.position ?? "static") === "static") patch.position = "relative";
  if ((values.rotate !== undefined || values.translate !== undefined || values.scale !== undefined)
    && (values.display ?? styles.display) === "inline") patch.display = "inline-block";
  return patch;
}
