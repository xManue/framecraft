// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComponentPalette } from "../src/components/ComponentPalette";
import { useEditorStore } from "../src/state/editorStore";
let root: Root, host: HTMLDivElement;
const originalInsert = useEditorStore.getState().insertComponent;
const insert = vi.fn(async () => undefined);
function pointer(element: HTMLElement, type: string, x = 10, y = 10) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: 1 }); element.dispatchEvent(event);
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); insert.mockClear();
  useEditorStore.setState({ insertComponent: insert, draggedComponent: undefined, pages: [], projectComponents: [] });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(ComponentPalette)));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); useEditorStore.setState({ insertComponent: originalInsert, draggedComponent: undefined }); });
const item = () => Array.from(host.querySelectorAll<HTMLButtonElement>(".component-card")).find((button) => button.querySelector("span")?.textContent === "Pulsante")!;
describe("palette: click dopo il trascinamento", () => {
  it("il drag annullato non consuma il click successivo", async () => {
    const button = item();
    await act(async () => { pointer(button, "pointerdown"); pointer(button, "pointermove", 40, 40); pointer(button, "pointercancel", 40, 40); button.click(); });
    expect(insert).toHaveBeenCalledOnce(); expect(useEditorStore.getState().draggedComponent).toBeUndefined();
  });
  it("non duplica il rilascio e non blocca i click futuri se il browser omette il click finale", async () => {
    const button = item();
    await act(async () => { pointer(button, "pointerdown"); pointer(button, "pointermove", 40, 40); pointer(button, "pointerup", 40, 40); });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await act(async () => button.click());
    expect(insert).toHaveBeenCalledOnce(); expect(useEditorStore.getState().draggedComponent).toBeUndefined();
  });
});
