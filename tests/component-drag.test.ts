// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  canvasPointFromClient,
  componentDragDropEvent,
  dispatchComponentDrag,
  passedDragThreshold,
} from "../src/components/componentDrag";

describe("component palette pointer drag", () => {
  it("starts only after a deliberate movement, so a click still adds normally", () => {
    expect(passedDragThreshold(100, 100, 104, 103)).toBe(false);
    expect(passedDragThreshold(100, 100, 107, 100)).toBe(true);
  });

  it("maps the desktop pointer to the real React canvas coordinates at any zoom", () => {
    const rect = { left: 300, top: 100, right: 940, bottom: 500, width: 640, height: 400 };
    expect(canvasPointFromClient(620, 300, rect, 1280, 800)).toEqual({ x: 640, y: 400 });
    expect(canvasPointFromClient(200, 300, rect, 1280, 800)).toBeUndefined();
  });

  it("delivers the component and release point even when the pointer is captured by the palette", () => {
    const listener = vi.fn();
    window.addEventListener(componentDragDropEvent, listener);
    dispatchComponentDrag(componentDragDropEvent, { jsx: "<button>Avvia</button>", label: "Pulsante", clientX: 700, clientY: 420 });
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual(expect.objectContaining({ label: "Pulsante", clientX: 700, clientY: 420 }));
    window.removeEventListener(componentDragDropEvent, listener);
  });
});
