import type { SelectionRect } from "../core/types";

export type AlignMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom" | "spread-x" | "spread-y";

export interface AlignItem {
  instanceId: string;
  rect: SelectionRect;
  /** The nudge already written on the element. Alignment moves elements by changing it, so a new
   * one can only be worked out from the one that is there. */
  translate: { x: number; y: number };
}

export interface AlignChange {
  instanceId: string;
  translate: string;
  dx: number;
  dy: number;
}

export const alignLabels: Record<AlignMode, string> = {
  left: "Allinea a sinistra",
  "center-x": "Centra in orizzontale",
  right: "Allinea a destra",
  top: "Allinea in alto",
  "center-y": "Centra in verticale",
  bottom: "Allinea in basso",
  "spread-x": "Distanzia in orizzontale",
  "spread-y": "Distanzia in verticale",
};

export const horizontalModes: AlignMode[] = ["left", "center-x", "right", "spread-x"];

/** A movement smaller than this is the rounding of a measurement, not an intention. Writing it would
 * rewrite the file and fill the undo history for a change nobody can see. */
const meaningful = .5;

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function offsetsFor(items: AlignItem[], mode: AlignMode): number[] {
  const horizontal = horizontalModes.includes(mode);
  const start = (item: AlignItem) => horizontal ? item.rect.x : item.rect.y;
  const size = (item: AlignItem) => horizontal ? item.rect.width : item.rect.height;
  const end = (item: AlignItem) => start(item) + size(item);
  const first = Math.min(...items.map(start));
  const last = Math.max(...items.map(end));

  if (mode === "spread-x" || mode === "spread-y") {
    // Fewer than three elements have nothing between them to space out: the two ends are the extent.
    if (items.length < 3) return items.map(() => 0);
    const order = [...items].sort((left, right) => start(left) - start(right));
    const occupied = order.reduce((total, item) => total + size(item), 0);
    const gap = (last - first - occupied) / (order.length - 1);
    const targets = new Map<string, number>();
    let cursor = first;
    for (const item of order) {
      targets.set(item.instanceId, cursor - start(item));
      cursor += size(item) + gap;
    }
    return items.map((item) => targets.get(item.instanceId) ?? 0);
  }

  const middle = (first + last) / 2;
  return items.map((item) => {
    if (mode === "left" || mode === "top") return first - start(item);
    if (mode === "right" || mode === "bottom") return last - end(item);
    return middle - (start(item) + size(item) / 2);
  });
}

/** What each element has to become for the group to line up. Only the axis being aligned is touched:
 * asking for a left edge must never move anything vertically, or one clean-up creates another. */
export function alignItems(items: AlignItem[], mode: AlignMode): AlignChange[] {
  if (items.length < 2) return [];
  const horizontal = horizontalModes.includes(mode);
  const offsets = offsetsFor(items, mode);
  const changes: AlignChange[] = [];
  items.forEach((item, index) => {
    const offset = offsets[index];
    if (Math.abs(offset) < meaningful) return;
    const dx = horizontal ? offset : 0;
    const dy = horizontal ? 0 : offset;
    changes.push({
      instanceId: item.instanceId,
      translate: `${round(item.translate.x + dx)}px ${round(item.translate.y + dy)}px`,
      dx: round(dx),
      dy: round(dy),
    });
  });
  return changes;
}
