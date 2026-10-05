// @vitest-environment jsdom

import { parse } from "@babel/parser";
import { describe, expect, it, vi } from "vitest";
import type { HmiFaceplateCatalog, HmiFaceplateTypeDefinition } from "../src/core/hmiFaceplates";
import { hmiFaceplateVisualRuntimeModuleSource, renderHmiFaceplates } from "../src/core/hmiFaceplateVisuals";

const inner: HmiFaceplateTypeDefinition = {
  id: "inner", name: "Inner", version: "1.0.0", status: "released", width: 100, height: 40,
  interfaceTags: [{ name: "Value", dataType: "Int", required: true }], interfaceProperties: [], interfaceEvents: [], localTags: [],
  visualization: [{ id: "ValueText", type: "io-field", left: 0, top: 0, width: 100, height: 40, bindings: [{ property: "ProcessValue", source: "tag", name: "Value" }] }],
  nestedInstances: [],
};

const outer: HmiFaceplateTypeDefinition = {
  id: "motor", name: "Motor", version: "1.2.3", status: "released", width: 240, height: 120,
  interfaceTags: [{ name: "Speed", dataType: "Int", required: true }],
  interfaceProperties: [{ name: "Label", dataType: "ConfigurationString", defaultValue: "Motore" }],
  interfaceEvents: [{ name: "Selected", parameters: [{ name: "index", dataType: "Int" }] }],
  localTags: [{ name: "LocalState", dataType: "Int", startValue: "5" }],
  visualization: [
    { id: "Title", type: "text", left: 0, top: 0, width: 140, height: 32, bindings: [{ property: "Text", source: "property", name: "Label" }] },
    { id: "Open", type: "button", left: 145, top: 0, width: 90, height: 32, text: "Apri", bindings: [], event: { name: "Selected", parameters: { index: 4 } } },
    { id: "State", type: "text", left: 0, top: 78, width: 100, height: 30, bindings: [{ property: "Text", source: "local", name: "LocalState" }] },
  ],
  nestedInstances: [{ id: "InnerMotor", typeId: "inner", version: "1.0.0", tagBindings: { Value: "Speed" }, propertyBindings: {}, left: 0, top: 35, width: 100, height: 40 }],
};

const catalog: HmiFaceplateCatalog = { version: 1, types: [outer, inner] };

describe("visualizzazione dei tipi faceplate", () => {
  it("renderizza oggetti, dinamizzazioni, eventi e composizione annidata", () => {
    document.body.innerHTML = '<div id="host" data-hmi-faceplate></div>';
    const host = document.querySelector<HTMLElement>("#host")!;
    host.dataset.hmiFaceplate = JSON.stringify({ typeId: "motor", version: "1.2.3", tagBindings: { Speed: "Motor.Speed" }, propertyValues: { Label: "M2400" }, eventBindings: {} });
    const event = vi.fn(); host.addEventListener("framecraft:faceplate-event", event);
    expect(renderHmiFaceplates(document, catalog, { "Motor.Speed": "42" }, { localValues: () => ({ LocalState: "9" }) })).toBe(1);
    expect(host.querySelector('[data-hmi-faceplate-object="Title"]')?.textContent).toBe("M2400");
    expect(host.querySelector('[data-hmi-faceplate-nested="InnerMotor"] [data-hmi-faceplate-object="ValueText"]')?.textContent).toBe("42");
    expect(host.querySelector('[data-hmi-faceplate-object="State"]')?.textContent).toBe("9");
    host.querySelector<HTMLButtonElement>('[data-hmi-faceplate-object="Open"]')!.click();
    expect(event).toHaveBeenCalledOnce();
    expect((event.mock.calls[0][0] as CustomEvent).detail).toEqual({ name: "Selected", parameters: { index: 4 } });

    const title = host.querySelector('[data-hmi-faceplate-object="Title"]');
    renderHmiFaceplates(document, catalog, { "Motor.Speed": "42" }, { localValues: () => ({ LocalState: "9" }) });
    expect(host.querySelector('[data-hmi-faceplate-object="Title"]')).toBe(title);
    renderHmiFaceplates(document, catalog, { "Motor.Speed": "77" }, { localValues: () => ({ LocalState: "9" }) });
    expect(host.querySelector('[data-hmi-faceplate-nested="InnerMotor"] [data-hmi-faceplate-object="ValueText"]')?.textContent).toBe("77");
  });

  it("risolve il nome Runtime del popup e costruisce il binding di interfaccia", () => {
    document.body.innerHTML = '<div data-hmi-popup-faceplate-type="Motor_V_1_2_3" data-hmi-popup-interface=\'{"Speed":{"Tag":"Motor.Speed"},"Label":"M2400"}\'></div>';
    expect(renderHmiFaceplates(document, catalog, { "Motor.Speed": "1500" })).toBe(1);
    const popup = document.querySelector<HTMLElement>("[data-hmi-popup-faceplate-type]")!;
    expect(JSON.parse(popup.dataset.hmiFaceplate!)).toMatchObject({ typeId: "motor", version: "1.2.3", tagBindings: { Speed: "Motor.Speed" }, propertyValues: { Label: "M2400" } });
    expect(popup.textContent).toContain("M2400");
  });

  it("non sostituisce il contenuto interno gia costruito nel progetto", () => {
    document.body.innerHTML = '<div id="host" data-hmi-faceplate><button data-hmi-events="[]">Comando esistente</button></div>';
    const host = document.querySelector<HTMLElement>("#host")!;
    host.dataset.hmiFaceplate = JSON.stringify({ typeId: "motor", version: "1.2.3", tagBindings: { Speed: "Motor.Speed" }, propertyValues: {}, eventBindings: {} });
    const button = host.querySelector("button");
    expect(renderHmiFaceplates(document, catalog, { "Motor.Speed": "42" })).toBe(0);
    expect(host.querySelector("button")).toBe(button);
    expect(host.querySelector("[data-hmi-faceplate-visual-root]")).toBeNull();
  });

  it("genera un modulo Runtime autonomo senza parser dinamico", () => {
    const source = hmiFaceplateVisualRuntimeModuleSource();
    expect(() => parse(source, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(source).not.toMatch(/\beval\s*\(/);
  });
});
