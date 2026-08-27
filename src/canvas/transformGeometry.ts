import type { ElementGeometry, SelectionRect, TransformOperation } from "../core/types";

const minimumSize = 12;

export function transformedRect(origin: SelectionRect, operation: TransformOperation, deltaX: number, deltaY: number): SelectionRect {
  if (operation === "move") return { ...origin, x: origin.x + deltaX, y: origin.y + deltaY };
  let { x, y, width, height } = origin;
  if (operation.includes("e")) width = Math.max(minimumSize, origin.width + deltaX);
  if (operation.includes("s")) height = Math.max(minimumSize, origin.height + deltaY);
  if (operation.includes("w")) {
    width = Math.max(minimumSize, origin.width - deltaX);
    x = origin.x + origin.width - width;
  }
  if (operation.includes("n")) {
    height = Math.max(minimumSize, origin.height - deltaY);
    y = origin.y + origin.height - height;
  }
  return { x, y, width, height };
}

function numeric(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function translatePair(value: string): [number, number] {
  if (!value || value === "none") return [0, 0];
  const parts = value.split(/\s+/).map(numeric);
  return [parts[0] ?? 0, parts[1] ?? 0];
}

function scalePair(value: string): [number, number] {
  if (!value || value === "none") return [1, 1];
  const parts = value.split(/\s+/).map(numeric);
  return [parts[0] || 1, parts[1] || parts[0] || 1];
}

function scaleValue(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

function transformOrigin(operation: TransformOperation) {
  const horizontal = operation.includes("w") ? "right" : operation.includes("e") ? "left" : "center";
  const vertical = operation.includes("n") ? "bottom" : operation.includes("s") ? "top" : "center";
  return `${horizontal} ${vertical}`;
}

function pixels(value: number) {
  return `${Math.round(value * 10) / 10}px`;
}

export function stylePatch(origin: SelectionRect, next: SelectionRect, geometry: ElementGeometry, operation: TransformOperation) {
  const patch: Record<string, string | number> = {};
  const movedX = next.x - origin.x;
  const movedY = next.y - origin.y;
  if (operation === "move") {
    const [translateX, translateY] = translatePair(geometry.translate);
    patch.translate = `${pixels(translateX + movedX)} ${pixels(translateY + movedY)}`;
  }
  if (operation !== "move") {
    const [scaleX, scaleY] = scalePair(geometry.scale);
    const nextScaleX = operation.includes("e") || operation.includes("w") ? scaleX * next.width / origin.width : scaleX;
    const nextScaleY = operation.includes("n") || operation.includes("s") ? scaleY * next.height / origin.height : scaleY;
    patch.scale = `${scaleValue(nextScaleX)} ${scaleValue(nextScaleY)}`;
    patch.transformOrigin = transformOrigin(operation);
  }
  return patch;
}
