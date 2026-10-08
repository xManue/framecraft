// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
// @ts-expect-error the project preview plugin is delivered as plain ESM.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";
import { parseHmiDynamizations } from "../src/core/hmiDynamizations";
import { simulationCommands } from "../src/core/plcSimulation";

it("mostra il segnale indiretto, elimina il valore obsoleto e ripristina la bozza quando la prova termina", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  const messages: { type: string; items?: { instanceId: string; raw: string }[] }[] = [];
  Object.defineProperty(window, "parent", { configurable: true, value: { postMessage: (message: never) => messages.push(message) } });
  const field = document.createElement("output"); field.textContent = "bozza";
  const input = document.createElement("input"); input.type = "number"; input.value = "7";
  field.setAttribute("data-hmi-dynamizations", JSON.stringify([{ property: "ProcessValue", kind: "Tag", tag: "Selected", indirect: true, indirectDataType: "REAL" }, { property: "Width", kind: "Tag", tag: "Width" }])); document.body.append(field);
  input.setAttribute("data-hmi-dynamizations", field.getAttribute("data-hmi-dynamizations")!); document.body.append(input);
  window.eval(framecraftPlugin().transformIndexHtml('<div id="root"></div>').tags[0].children);
  const send = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data }));
  send({ type: "framecraft:collect-dynamizations" });
  const items = messages.find((message) => message.type === "framecraft:dynamizations")!.items!;
  const elements = items.map((item) => ({ instanceId: item.instanceId, dynamizations: parseHmiDynamizations(item.raw) }));
  const catalog = [{ name: "Selected", dataType: "WSTRING", access: "read" }, { name: "Motor1", dataType: "REAL", access: "read" }];
  const update = (values: Record<string, string>) => send({ type: "framecraft:simulate", on: true, commands: simulationCommands(elements, values, undefined, undefined, undefined, undefined, undefined, undefined, undefined, catalog).commands });
  update({ Selected: "Motor1", Motor1: "21", Width: "44" }); expect(field.textContent).toBe("21"); expect(input.value).toBe("21"); expect(input.readOnly).toBe(true);
  update({ Selected: "Unknown", Width: "48" }); expect(field.textContent).toBe("—"); expect(field.style.width).toBe("48px"); expect(input.value).toBe("");
  update({ Selected: "Motor1", Motor1: "32", Width: "48" }); expect(field.textContent).toBe("32");
  send({ type: "framecraft:simulate", on: false }); expect(field.textContent).toBe("bozza"); expect(field.style.width).toBe(""); expect(input.value).toBe("7"); expect(input.readOnly).toBe(false);
  vi.unstubAllGlobals();
});
