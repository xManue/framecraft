/** Which element the pointer is really on when something that ignores the mouse covers the point.
 *
 * An app regularly draws a caption or a badge over its own button with `pointer-events: none`, so
 * the mouse can never land on it and the editor would only ever select the button underneath. That
 * is the case this rescues: the writing the user is pointing at wins the click.
 *
 * What it must never do is hand the click to a backdrop. A big picture made click-through is still
 * click-through, so an element dragged on top of it used to lose every click to the picture: the
 * component could not be moved any more, and picking a part landed on the photo instead. A layer
 * only wins if it is drawn *on* what was clicked — inside it, or no larger than it — and between
 * those the smallest one is the most specific thing under the pointer.
 *
 * `clicked` and each candidate carry `area` in square pixels; a candidate is `inside` when it is a
 * descendant of the clicked element.
 */
export function overlayCandidate(clicked, candidates) {
  let best = null;
  for (const candidate of candidates) {
    if (!candidate.inside && candidate.area > clicked.area) continue;
    if (!best || candidate.area < best.area) best = candidate;
  }
  return best;
}
