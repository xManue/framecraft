export function fitCanvasZoom(availableWidth: number, viewportWidth: number): number {
  if (!Number.isFinite(availableWidth) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) return 1;
  return Math.min(1, Math.max(0.25, (availableWidth - 48) / viewportWidth));
}

export function normalizeContentHeight(height: number): number {
  if (!Number.isFinite(height)) return 760;
  return Math.min(20000, Math.max(760, Math.ceil(height)));
}

export function normalizeContentWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) return viewportWidth;
  return Math.min(3840, Math.max(viewportWidth, Math.ceil(width)));
}
