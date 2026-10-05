// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { installTrendAreaZoom, renderTrendSourcePicker, trendAreaZoomDragging, trendQualityClass, type HmiTrendSourceCatalog } from "../src/core/hmiTrendRuntimeUi";

const catalog: HmiTrendSourceCatalog = { tags: ["A", "B"], logs: [{ id: "process", name: "Processo", tags: [{ id: "temperature", name: "Temperatura", tag: "Oven.Temperature" }] }] };
const curves = [{ id: "curve", name: "Curva", sources: { x: { source: "online" as const, tag: "A" }, y: { source: "online" as const, tag: "B" } } }];
const change = (root: ParentNode, selector: string, value: string) => { const field = root.querySelector<HTMLSelectElement>(selector)!; field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); return field; };
export function pointer(type: string, x: number, y: number, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }); Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: true } }); return event;
}

describe("comandi condivisi dei trend", () => {
  it("valida atomicamente le sorgenti X/Y, consulta il catalogo e non modifica il progetto", () => {
    const root = document.createElement("div"); document.body.replaceChildren(root); const apply = vi.fn(), reset = vi.fn();
    renderTrendSourcePicker(root, curves, catalog, apply, reset);
    const y = root.querySelector('[data-trend-source-coordinate="y"]')!;
    expect(y.querySelector('[data-trend-source-field="logId"]')!.parentElement!.style.display).toBe("none");
    change(y, '[data-trend-source-field="source"]', "log"); root.querySelector<HTMLButtonElement>('[data-trend-source-action="apply"]')!.click();
    expect(y.querySelector('[data-trend-source-field="tag"]')!.parentElement!.style.display).toBe("none");
    expect(y.querySelector('[data-trend-source-field="logId"]')!.parentElement!.style.display).toBe("grid");
    expect(apply).not.toHaveBeenCalled(); expect(root.querySelector('[role="alert"]')?.textContent).toContain("Y");
    change(y, '[data-trend-source-field="logId"]', "process"); change(y, '[data-trend-source-field="loggedTagId"]', "temperature");
    root.querySelector<HTMLButtonElement>('[data-trend-source-action="apply"]')!.click();
    expect(apply).toHaveBeenCalledWith("curve", { x: { source: "online", tag: "A" }, y: { source: "log", tag: "Oven.Temperature", logId: "process", loggedTagId: "temperature" } });
    expect(curves[0].sources.y).toEqual({ source: "online", tag: "B" });
    root.querySelector<HTMLButtonElement>('[data-trend-source-action="reset"]')!.click(); expect(reset).toHaveBeenCalledOnce();
    expect(root.querySelector<HTMLSelectElement>('[data-trend-source-coordinate="y"] [data-trend-source-field="source"]')!.value).toBe("online");
  });
  it("mantiene menu, bozze e focus durante gli aggiornamenti", () => {
    const root = document.createElement("div"); document.body.replaceChildren(root); const apply = vi.fn();
    renderTrendSourcePicker(root, curves, catalog, apply, () => {});
    const details = root.querySelector("details")!; details.open = true;
    const field = change(root, '[data-trend-source-coordinate="x"] [data-trend-source-field="tag"]', "B"); field.focus();
    renderTrendSourcePicker(root, curves, catalog, apply, () => {});
    expect(details.open).toBe(true); expect(document.activeElement).toBe(field); expect(field.value).toBe("B");
    root.querySelector<HTMLButtonElement>('[data-trend-source-action="apply"]')!.click(); expect(apply.mock.calls[0][1].x.tag).toBe("B");
  });
  it("converte il rettangolo in intervalli, limita il trascinamento e ignora altri puntatori", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 640 300");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 640, height: 300 } as DOMRect);
    const apply = vi.fn(); installTrendAreaZoom(svg, true, [{ id: "area", left: 50, top: 10, width: 500, height: 200, xRange: [0, 100], yRange: [0, 100], rightRange: [100, 300] }], apply);
    svg.dispatchEvent(pointer("pointerdown", 300, 110)); svg.dispatchEvent(pointer("pointerdown", 400, 150, 2)); svg.dispatchEvent(pointer("pointercancel", 400, 150, 2));
    expect(trendAreaZoomDragging(svg)).toBe(true);
    svg.dispatchEvent(pointer("pointermove", 50, 210)); svg.dispatchEvent(pointer("pointerup", 50, 210));
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ xRange: [0, 50], yRange: [0, 50], rightRange: [100, 200] }));
    expect(trendAreaZoomDragging(svg)).toBe(false); expect(svg.querySelector("[data-trend-zoom-selection]")).toBeNull();
  });
  it("annulla con Esc, pointercancel e disattivazione e non applica click minimi", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 640, height: 300 } as DOMRect);
    const areas = [{ id: "area", left: 0, top: 0, width: 640, height: 300, xRange: [0, 100] as [number, number], yRange: [0, 100] as [number, number] }]; const apply = vi.fn(); installTrendAreaZoom(svg, true, areas, apply);
    svg.dispatchEvent(pointer("pointerdown", 10, 10)); svg.dispatchEvent(pointer("pointerup", 12, 12)); expect(apply).not.toHaveBeenCalled();
    svg.dispatchEvent(pointer("pointerdown", 10, 10)); svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); expect(trendAreaZoomDragging(svg)).toBe(false);
    svg.dispatchEvent(pointer("pointerdown", 10, 10)); svg.dispatchEvent(pointer("pointercancel", 10, 10)); expect(trendAreaZoomDragging(svg)).toBe(false);
    svg.dispatchEvent(pointer("pointerdown", 10, 10)); installTrendAreaZoom(svg, false, areas, apply); expect(trendAreaZoomDragging(svg)).toBe(false); expect(apply).not.toHaveBeenCalled();
  });
  it("classifica il byte qualità senza confondere flag alti e classi Good", () => {
    expect([undefined, 0, 0x2040, 0x2080, 192].map(trendQualityClass)).toEqual(["unknown", "bad", "uncertain", "good", "good"]);
  });
});
