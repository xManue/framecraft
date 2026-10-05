export function fitCanvasZoom(availableWidth: number, viewportWidth: number): number {
  if (!Number.isFinite(availableWidth) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) return 1;
  return Math.min(1, Math.max(0.25, (availableWidth - 48) / viewportWidth));
}

/** A page is never drawn shorter than the panel it will run on: seeing the empty space below the
 * content is how the user finds out the screen is half used. */
export function normalizeContentHeight(height: number, viewportHeight = 760): number {
  if (!Number.isFinite(height)) return viewportHeight;
  return Math.min(20000, Math.max(viewportHeight, Math.ceil(height)));
}

export function normalizeContentWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) return viewportWidth;
  return Math.min(3840, Math.max(viewportWidth, Math.ceil(width)));
}

/** How many times the canvas will follow the page's own idea of its size between one page load and
 * the next. A page is measured inside the box the canvas gives it, so content that fills its box and
 * is then nudged — a shell dragged a few pixels, a shadow, a rounding — reports more than it was
 * given every single time it is measured. Granting that turns the canvas into a ratchet that widens
 * forever. Two or three grants are enough to reach the real size of any page; the rest is the loop. */
export const contentGrantLimit = 4;

/** The size the canvas should take from a report. A difference too small to be the page's real size
 * is the page overflowing its own box, which is the app's business and not the canvas's. */
export function settledContentSize(current: number, reported: number, tolerance = .05): number {
  if (!Number.isFinite(reported)) return current;
  return Math.abs(reported - current) > Math.max(8, current * tolerance) ? reported : current;
}
