export const componentDragMoveEvent = "framecraft:component-drag-move";
export const componentDragDropEvent = "framecraft:component-drag-drop";

export type ComponentDragDetail = {
  jsx: string;
  label: string;
  clientX: number;
  clientY: number;
};

export type ClientRectLike = Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width" | "height">;

export function passedDragThreshold(startX: number, startY: number, clientX: number, clientY: number, threshold = 6) {
  return Math.hypot(clientX - startX, clientY - startY) >= threshold;
}

export function canvasPointFromClient(clientX: number, clientY: number, rect: ClientRectLike, canvasWidth: number, canvasHeight: number) {
  if (rect.width <= 0 || rect.height <= 0 || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return undefined;
  return {
    x: Math.max(0, Math.min(canvasWidth, (clientX - rect.left) * canvasWidth / rect.width)),
    y: Math.max(0, Math.min(canvasHeight, (clientY - rect.top) * canvasHeight / rect.height)),
  };
}

export function dispatchComponentDrag(type: typeof componentDragMoveEvent | typeof componentDragDropEvent, detail: ComponentDragDetail) {
  window.dispatchEvent(new CustomEvent<ComponentDragDetail>(type, { detail }));
}
