// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { executeHmiScript, inspectHmiScript, type HmiScriptTimerContext } from "../src/core/hmiScript";
import { createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface } from "../scripts/hmi-property-flashing.mjs";
import { hmiScriptFunctions, parseHmiScriptCatalog } from "../src/core/hmiScriptModules";

function scene(markup = '<button data-hmi-name="M2400"></button>') {
  document.body.innerHTML = '<main data-hmi-screen="Main">' + markup + '</main>';
  const surface = createHmiPropertyFlashingDomSurface(document);
  const report = vi.fn();
  const controller = createHmiPropertyFlashing({ items: surface.items, apply: surface.apply, report });
  const owner = surface.items().find((item) => item.name === "M2400") ?? surface.items()[0];
  const context = controller.context(owner.itemId);
  const execute = (source: string, values = {}, options = {}) => {
    const inspection = inspectHmiScript(source);
    expect(inspection.error).toBeUndefined();
    return executeHmiScript(inspection.program!, values, { screenItems: context, ...options });
  };
  return { surface, controller, report, context, execute, target: document.querySelector<HTMLElement>('[data-hmi-name="M2400"]')! };
}

describe("PropertyFlashing del modello oggetti Unified", () => {
  it("compila la chiamata ufficiale e segue anche i tag nei parametri", () => {
    const inspection = inspectHmiScript('const target = Screen.Items("M2400"); return target.PropertyFlashing("BackColor", Tags("Fault").Read(), HMIRuntime.Math.RGB(255, 0, 0), HMIRuntime.Math.RGB(0, 0, 0), UI.Enums.HmiFlashingRate.Fast);');
    expect(inspection.error).toBeUndefined();
    expect(inspection.program).toBeDefined();
    expect(inspection.tagsRead).toEqual(["Fault"]);
  });

  it.each([["Slow", 2000], ["Medium", 1000], ["Fast", 500]] as const)("esegue RGB e la frequenza %s senza alterare il colore base", (rate, period) => {
    const { execute, target, controller } = scene();
    target.style.backgroundColor = "rgb(12, 34, 56)";
    target.style.animation = "pulse 4s infinite";
    expect(execute('const target = Screen.Items("M2400"); return target.PropertyFlashing("BackColor", true, HMIRuntime.Math.RGB(255, 0, 0), HMIRuntime.Math.RGB(0, 0, 0), UI.Enums.HmiFlashingRate.' + rate + ');')).toMatchObject({ returned: true });
    expect(target.style.animation).toContain("pulse 4s infinite, framecraft-hmi-flash-background " + period + "ms");
    expect(target.style.getPropertyValue("--framecraft-hmi-flash-background-color")).toBe("#ff0000");
    expect(target.style.backgroundColor).toBe("rgb(12, 34, 56)");
    expect(execute('return item.PropertyFlashing("BackColor", false);')).toMatchObject({ returned: true });
    expect(target.style.animation).toBe("pulse 4s infinite");
    expect(target.style.getPropertyValue("--framecraft-hmi-flash-background-color")).toBe("");
    expect(execute('return item.PropertyFlashing("BackColor", true);')).toMatchObject({ returned: true });
    expect(target.style.animation).toContain("1000ms");
    controller.reset();
    expect(target.style.animation).toBe("pulse 4s infinite");
  });

  it("usa i colori dichiarativi e sostituisce solo la proprietà scelta", () => {
    const { execute, target, surface } = scene();
    target.setAttribute("data-hmi-dynamizations", JSON.stringify([{ property: "BackColor", kind: "Flashing", color: "#FFFF0000", alternateColor: "#FF000000", flashingCondition: "Never" }]));
    surface.setDeclarative(target, [
      { property: "BackColor", color: "#123456", alternateColor: "#ffffff", periodMs: 500 },
      { property: "BorderColor", color: "#ffff00", alternateColor: "#000000", periodMs: 2000 },
    ]);
    expect(execute('return item.PropertyFlashing("BackColor", false);').returned).toBe(true);
    expect(target.style.animation).not.toContain("flash-background");
    expect(target.style.animation).toContain("flash-border");
    surface.setDeclarative(target, [{ property: "BackColor", color: "#123456", alternateColor: "#ffffff", periodMs: 500 }]);
    expect(target.style.animation).toBe("");
    expect(execute('return item.PropertyFlashing("BackColor", true);').returned).toBe(true);
    expect(target.style.getPropertyValue("--framecraft-hmi-flash-background-color")).toBe("#FF0000");
  });

  it("se mancano i colori non inventa una configurazione e segnala una sola volta", () => {
    const { execute, report, target } = scene();
    for (let index = 0; index < 3; index++) expect(execute('return item.PropertyFlashing("BackColor", true);').returned).toBe(false);
    expect(report).toHaveBeenCalledTimes(1);
    expect(target.style.animation).toBe("");
  });

  it.each([
    'item.PropertyFlashing("Visible", true, "#ff0000", "#000000");',
    'item.PropertyFlashing("BackColor", 1, "#ff0000", "#000000");',
    'item.PropertyFlashing("BackColor", true, "url(https://invalid)", "#000000");',
    'item.PropertyFlashing("BackColor", true, "#ff0000", "#000000", 3);',
    'item.PropertyFlashing("BackColor", true, HMIRuntime.Math.RGB(256, 0, 0), "#000000");',
    'const fake = { screenItemId: "hmi-item-1" }; fake.PropertyFlashing("BackColor", true, "#ff0000", "#000000");',
  ])("rifiuta argomenti invalidi senza modifiche: %s", (source) => {
    const { execute, controller, target } = scene();
    expect(execute(source).error).toBeDefined();
    expect(controller.commands()).toEqual([]);
    expect(target.style.animation).toBe("");
  });

  it("rifiuta nomi mancanti e duplicati, senza colpire la prima corrispondenza", () => {
    const { execute } = scene('<button data-hmi-name="M2400"></button><button data-hmi-name="M2400"></button>');
    expect(execute('Screen.Items("M2400").PropertyFlashing("BackColor", false);').error).toContain("duplicato");
    expect(execute('Screen.Items("Missing").PropertyFlashing("BackColor", false);').error).toContain("non trovato");
    const special = document.querySelector<HTMLElement>("button")!;
    special.dataset.hmiName = 'M2400["strano"]';
    expect(execute('return Screen.Items(' + JSON.stringify(special.dataset.hmiName) + ').PropertyFlashing("BackColor", true, "#ff0000", "#000000");').returned).toBe(true);
    expect(special.style.animation).toContain("flash-background");
  });

  it("isola i nomi fra istanze faceplate e risolve anche il loro contenitore", () => {
    const { surface, controller } = scene('<div data-hmi-faceplate="{}" data-hmi-name="A"><button data-hmi-name="Lamp"></button></div><div data-hmi-faceplate="{}" data-hmi-name="B"><button data-hmi-name="Lamp"></button></div>');
    const first = surface.items().find((item) => item.name === "Lamp")!;
    const context = controller.context(first.itemId);
    const run = (source: string) => executeHmiScript(inspectHmiScript(source).program!, {}, { screenItems: context });
    expect(run('return Faceplate.Items("Lamp").PropertyFlashing("ForeColor", true, "#ffffff", "#000000");').returned).toBe(true);
    const lamps = document.querySelectorAll<HTMLElement>("button");
    expect(lamps[0].style.animation).toContain("flash-foreground");
    expect(lamps[1].style.animation).toBe("");
    expect(run('Screen.Items("Lamp").PropertyFlashing("BackColor", false);').error).toContain("non trovato");
    expect(run('return Faceplate.PropertyFlashing("BorderColor", true, "#ffffff", "#000000");').returned).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-hmi-name="A"]')!.style.animation).toContain("flash-border");
  });

  it("propaga il contesto attraverso moduli e timer, e lo invalida al reset", () => {
    const { execute, context, target, controller } = scene();
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Alert", alias: "Alert", functions: [{ name: "On", parameters: [], source: 'return item.PropertyFlashing("BackColor", true, "#ff0000", "#000000");' }] }] });
    const functions = hmiScriptFunctions(catalog);
    let captured: HmiScriptTimerContext | undefined;
    expect(execute('return Modules.Alert.On();', {}, { functions }).returned).toBe(true);
    expect(target.style.animation).toContain("flash-background");
    expect(execute('HMIRuntime.Timers.SetTimeout(() => { item.PropertyFlashing("BackColor", false); }, 50);', {}, { timerManager: { set: (_mode: unknown, _callback: unknown, _delay: unknown, timerContext: HmiScriptTimerContext) => { captured = timerContext; return 1; }, clear: () => true } }).error).toBeUndefined();
    expect(captured?.screenItems).toBe(context);
    controller.reset();
    expect(execute('item.PropertyFlashing("BackColor", false);').error).toContain("non e' piu' attivo");
    expect(target.style.animation).toBe("");
  });

  it("non mantiene oggetti rimossi né i loro comandi", () => {
    const { execute, target, controller, surface } = scene();
    expect(execute('item.PropertyFlashing("BackColor", true, "#ff0000", "#000000");').error).toBeUndefined();
    target.remove();
    expect(execute('item.PropertyFlashing("BackColor", false);').error).toContain("non e' piu' disponibile");
    expect(controller.commands()).toEqual([]);
    surface.dispose();
    expect(target.style.animation).toBe("");
  });
});
