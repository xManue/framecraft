/** The maths behind the magnetic guides. It lives in its own module, free of any reference to the
 * page or to this file's scope, because the preview bridge is shipped as source text: the plugin
 * stringifies these functions into the script it injects. One copy, and it can still be tested. */

/** The nearest edge worth snapping to along one axis. An element offers three positions — its start,
 * its middle and its end — and any of them may land on a candidate edge; the one that needs the
 * smallest correction wins, so a box being dragged past a column never jumps over the alignment the
 * user was clearly reaching for. Returns the correction to add to the movement, or null. */
export function snapOffset(start, size, candidates, threshold) {
  const points = [start, start + size / 2, start + size];
  let best = null;
  for (let index = 0; index < points.length; index += 1) {
    for (let other = 0; other < candidates.length; other += 1) {
      const distance = candidates[other] - points[index];
      if (Math.abs(distance) > threshold) continue;
      if (best === null || Math.abs(distance) < Math.abs(best.distance)) best = { distance: distance, at: candidates[other] };
    }
  }
  return best;
}

/** What to add to a value to put it on the grid. A grid of zero or one is no grid at all: rounding
 * to it would be the same as rounding to whole pixels, which is not what turning snapping off means. */
export function gridOffset(value, grid) {
  if (!grid || grid <= 1) return 0;
  return Math.round(value / grid) * grid - value;
}

/** Centres an element between its nearest neighbours and reports the equal gap. Only neighbours
 * that overlap on the other axis count: a card on another row must not pull this one sideways. */
export function equalGapOffset(start, size, crossStart, crossSize, candidates, axis, threshold) {
  const end = start + size;
  const crossEnd = crossStart + crossSize;
  const mainStart = (box) => axis === "x" ? box.left : box.top;
  const mainEnd = (box) => axis === "x" ? box.right : box.bottom;
  const otherStart = (box) => axis === "x" ? box.top : box.left;
  const otherEnd = (box) => axis === "x" ? box.bottom : box.right;
  let before = null;
  let after = null;
  for (const box of candidates) {
    if (otherEnd(box) <= crossStart || otherStart(box) >= crossEnd) continue;
    if (mainEnd(box) <= start + threshold && (!before || mainEnd(box) > mainEnd(before))) before = box;
    if (mainStart(box) >= end - threshold && (!after || mainStart(box) < mainStart(after))) after = box;
  }
  if (!before || !after) return null;
  const beforeEnd = mainEnd(before);
  const afterStart = mainStart(after);
  const target = (beforeEnd + afterStart - size) / 2;
  const distance = target - start;
  const gap = (afterStart - beforeEnd - size) / 2;
  if (gap < 0 || Math.abs(distance) > threshold) return null;
  return { distance, gap, before: beforeEnd, after: afterStart };
}
