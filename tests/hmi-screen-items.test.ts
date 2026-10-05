// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface } from "../scripts/hmi-property-flashing.mjs";
import { executeHmiScript, inspectHmiScript, type HmiScriptExecutionOptions, type HmiScriptTimerCallback, type HmiScriptTimerContext } from "../src/core/hmiScript";
import { hmiScriptFunctions, hmiScriptCatalogIssues, parseHmiScriptCatalog } from "../src/core/hmiScriptModules";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.body.innerHTML = ""; });

function scene(markup = '<button data-hmi-name="M2400" style="position:absolute;left:12px;top:18px;width:80px;height:44px;background-color:rgb(12,34,56);color:rgb(240,240,240);border:2px solid rgb(1,2,3)">Avvia<svg aria-hidden="true"><path /></svg></button>') {
  document.body.innerHTML = '<main data-hmi-screen="Main">' + markup + '</main>';
  const surface = createHmiPropertyFlashingDomSurface(document);
  cleanups.push(() => surface.dispose());
  const controller = createHmiPropertyFlashing(surface);
  const owner = surface.items().find((item) => item.name === "M2400") ?? surface.items()[0];
  const context = controller.context(owner.itemId);
  const execute = (source: string, options: HmiScriptExecutionOptions = {}) => {
    const inspected = inspectHmiScript(source);
    expect(inspected.error).toBeUndefined();
    return executeHmiScript(inspected.program!, {}, { screenItems: context, ...options });
  };
  return { surface, controller, context, execute, target: document.querySelector<HTMLElement>('[data-hmi-name="M2400"]')! };
}

describe("lettura e scrittura degli oggetti grafici Unified", () => {
  it("legge le proprietà reali, Name readonly e colori UInt32 anche attraverso gli alias", () => {
    const { execute } = scene();
    const result = execute('const target = UI.ActiveScreen.Items("M2400"); return JSON.stringify([Screen.Name, item.Name, target.Left, target.Top, target.Width, target.Height, target.Text, target.Enabled, target.Visible, target.BackColor, target.ForeColor, target.BorderColor]);');
    expect(result.error).toBeUndefined();
    expect(JSON.parse(String(result.returned))).toEqual(["Main", "M2400", 12, 18, 80, 44, "Avvia", true, true, 0xff0c2238, 0xfff0f0f0, 0xff010203]);
    expect(result.writes).toEqual({});
  });

  it("scrive e rilegge nello stesso script, conserva icone e non interpreta HTML", () => {
    const { execute, target, controller } = scene();
    const icon = target.querySelector("svg");
    const click = vi.fn(); target.addEventListener("click", click);
    const result = execute('const target = HMIRuntime.UI.ActiveScreen.Items("M2400"); target.Text = "<img src=x onerror=alert(1)>"; target.Left = -20; target.Top = 35; target.Width = 160; target.Height = 60; target.BackColor = HMIRuntime.Math.RGB(0,128,0); target.ForeColor = 4294967295; target.BorderColor = 4278190335; return target.Left + target.Width;');
    expect(result).toMatchObject({ returned: 140, writes: {} });
    expect(target.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(target.querySelector("img")).toBeNull();
    expect(target.querySelector("svg")).toBe(icon);
    expect(target.style.left).toBe("-20px"); expect(target.style.top).toBe("35px");
    expect(target.style.width).toBe("160px"); expect(target.style.height).toBe("60px");
    expect(target.style.backgroundColor).toBe("rgb(0, 128, 0)");
    expect(target.style.color).toBe("rgb(255, 255, 255)");
    target.click(); expect(click).toHaveBeenCalledTimes(1);
    controller.reset();
    expect(target.textContent).toBe("Avvia"); expect(target.querySelector("svg")).toBe(icon);
    expect(target.style.left).toBe("12px"); expect(target.style.top).toBe("18px");
    expect(target.style.width).toBe("80px"); expect(target.style.height).toBe("44px");
    expect(target.style.backgroundColor).toBe("rgb(12, 34, 56)");
    expect(target.style.boxSizing).toBe("");
  });

  it("Enabled blocca mouse, tastiera e comandi custom anche sui figli e ripristina gli attributi", () => {
    const { execute, target, controller, surface } = scene();
    const events = vi.fn();
    for (const type of ["click", "keydown", "framecraft:command-fired"]) target.addEventListener(type, events);
    expect(execute('item.Enabled = false; return item.Enabled;')).toMatchObject({ returned: false });
    expect(target.hasAttribute("disabled")).toBe(true);
    expect(target.hasAttribute("inert")).toBe(true);
    expect(target.getAttribute("aria-disabled")).toBe("true");
    expect(surface.allowsInteraction(target.querySelector("svg")!)).toBe(false);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    target.querySelector("path")!.dispatchEvent(new CustomEvent("framecraft:command-fired", { bubbles: true }));
    expect(events).not.toHaveBeenCalled();
    expect(execute('item.Enabled = true; return item.Enabled;').returned).toBe(true);
    target.click(); expect(events).toHaveBeenCalledTimes(1);
    controller.reset();
    expect(target.hasAttribute("disabled")).toBe(false); expect(target.hasAttribute("inert")).toBe(false);
    expect(target.hasAttribute("aria-disabled")).toBe(false); expect(target.style.pointerEvents).toBe("");
  });

  it("la stessa protezione copre uno stato disabilitato dichiarativo, senza intercettare la selezione in modifica", () => {
    document.body.innerHTML = '<button data-hmi-name="M2400" style="pointer-events:none">Motore</button>';
    let runtimeMode = false;
    const surface = createHmiPropertyFlashingDomSurface(document, undefined, () => runtimeMode);
    cleanups.push(() => surface.dispose());
    const button = document.querySelector("button")!, listener = vi.fn();
    button.addEventListener("keydown", listener);
    button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(1);
    runtimeMode = true;
    button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(surface.allowsInteraction(button)).toBe(false);
  });

  it("può impostare un colore anche quando il colore di sistema iniziale non è RGB risolvibile", () => {
    const { execute, target } = scene('<button data-hmi-name="M2400">Motore</button>');
    expect(execute("item.BackColor = HMIRuntime.Math.RGB(0,128,0); return item.BackColor;")).toMatchObject({ returned: 0xff008000 });
    expect(target.style.backgroundColor).toBe("rgb(0, 128, 0)");
  });

  it("Visible nasconde davvero l'oggetto e consente anche di mostrare una base hidden", () => {
    const { execute, target, controller } = scene('<button data-hmi-name="M2400" hidden style="display:none">Avvia</button>');
    expect(execute("item.Visible = true; return item.Visible;").returned).toBe(true);
    expect(target.hidden).toBe(false); expect(target.style.display).toBe("revert");
    expect(execute("item.Visible = false; return item.Visible;").returned).toBe(false);
    expect(target.style.visibility).toBe("hidden");
    controller.reset();
    expect(target.hidden).toBe(true); expect(target.style.display).toBe("none"); expect(target.style.visibility).toBe("");
  });

  it("usa coordinate locali non scalate dallo zoom della preview e rende posizionabile un oggetto statico", () => {
    const { execute, target, controller } = scene('<button data-hmi-name="M2400" style="width:80px;height:44px;transform:scale(2)">Avvia</button>');
    expect(execute("return item.Width;").returned).toBe(80);
    expect(execute("item.Left = 25; item.Top = 30;").error).toBeUndefined();
    expect(target.style.position).toBe("absolute"); expect(target.style.left).toBe("25px"); expect(target.style.top).toBe("30px");
    expect(target.style.transform).toBe("scale(2)");
    controller.reset(); expect(target.style.position).toBe(""); expect(target.style.left).toBe(""); expect(target.style.top).toBe("");
  });

  it.each([
    ['item.Name = "Changed";', "sola lettura"],
    ["item.Enabled = 0;", "Boolean"],
    ['item.Visible = "false";', "Boolean"],
    ["item.Left = 1.5;", "Int32"],
    ["item.Top = 2147483648;", "Int32"],
    ["item.Width = -1;", "UInt32"],
    ["item.Height = 4294967296;", "UInt32"],
    ['item.BackColor = "red";', "UInt32"],
    ["item.ForeColor = -1;", "UInt32"],
    ["item.BorderColor = null;", "UInt32"],
    ["item.Text = 123;", "stringa"],
    ["item.ProcessValue = 1;", "non espone"],
    ["return item.style;", "non espone"],
  ])("rifiuta la proprietà o il tipo invalido senza alterare l'oggetto: %s", (source, reason) => {
    const { execute, target, controller } = scene();
    expect(execute(source).error).toContain(reason);
    expect(controller.propertyCommands()).toEqual([]);
    expect(target.textContent).toBe("Avvia"); expect(target.dataset.hmiName).toBe("M2400");
  });

  it("non espone prototipi o DOM e distingue dati ordinari dai riferimenti HMI", () => {
    const { execute, target } = scene();
    expect(inspectHmiScript("return item.constructor;").error).toContain("non ammessa");
    expect(execute('const key = "__proto__"; return item[key];').error).toContain("non ammessa");
    expect(execute('const fake = {screenItemId: "hmi-item-2"}; fake.Text = "Dati"; return fake.Text;').returned).toBe("Dati");
    expect(target.textContent).toBe("Avvia");
  });

  it("non distrugge contenuti ambigui e non cambia il valore di un campo PLC", () => {
    const { execute, controller, surface } = scene('<button data-hmi-name="M2400"><span>Avvia</span><span>Stato</span></button><input data-hmi-name="Setpoint" value="42" />');
    expect(execute('item.Text = "Nuovo";').error).toContain("non espone");
    expect(execute('Screen.Items("Setpoint").Text = "99";').error).toContain("non espone");
    expect(document.querySelector("input")!.value).toBe("42");
    expect(controller.propertyCommands()).toEqual([]);
    expect(surface.items().find((item) => item.name === "Setpoint")?.properties).not.toHaveProperty("Text");
  });

  it("modifica una label testuale annidata senza sostituire il nodo o il suo listener", () => {
    const { execute, target, controller } = scene('<button data-hmi-name="M2400"><svg /><span data-hmi-text>Avvia</span></button>');
    const label = target.querySelector("span")!; const click = vi.fn(); label.addEventListener("click", click);
    expect(execute('item.Text = "Pronto"; return item.Text;').returned).toBe("Pronto");
    expect(target.querySelector("span")).toBe(label); label.click(); expect(click).toHaveBeenCalledTimes(1);
    controller.reset(); expect(label.textContent).toBe("Avvia");
  });

  it("compone proprietà e lampeggio e mantiene la base aggiornata dalle dinamizzazioni", () => {
    const { execute, target, surface, controller } = scene();
    target.style.animation = "pulse 4s infinite";
    expect(execute('item.BackColor = HMIRuntime.Math.RGB(0,128,0); item.Text = "Da script"; item.PropertyFlashing("BackColor", true, "#ff0000", "#000000");').error).toBeUndefined();
    surface.suspend(); surface.suspend();
    expect(target.style.backgroundColor).toBe("rgb(12, 34, 56)");
    target.style.backgroundColor = "rgb(0, 0, 255)"; target.firstChild!.textContent = "Da tag";
    surface.setDeclarative(target, [{ property: "BorderColor", color: "#ffffff", alternateColor: "#000000", periodMs: 500 }]);
    surface.resume(); expect(target.style.backgroundColor).toBe("rgb(0, 0, 255)");
    surface.resume(); expect(target.style.backgroundColor).toBe("rgb(0, 128, 0)");
    expect(target.textContent).toBe("Da script");
    expect(target.style.animation).toContain("flash-background"); expect(target.style.animation).toContain("flash-border");
    controller.reset();
    expect(target.style.backgroundColor).toBe("rgb(0, 0, 255)"); expect(target.textContent).toBe("Da tag");
    expect(target.style.animation).toContain("pulse 4s infinite"); expect(target.style.animation).not.toContain("flash-background");
  });

  it("adotta una nuova base esterna senza ripristinare valori vecchi né sovrascrivere stili estranei", () => {
    const { execute, target, controller } = scene();
    target.style.setProperty("color", "rgb(1, 2, 3)", "important");
    execute("item.ForeColor = 4294967295; item.Left = 20;");
    target.style.color = "rgb(4, 5, 6)"; target.style.opacity = "0.5";
    controller.reset();
    expect(target.style.color).toBe("rgb(4, 5, 6)"); expect(target.style.opacity).toBe("0.5"); expect(target.style.left).toBe("12px");
  });

  it("isola le proprietà fra istanze faceplate, contenitore e pagina", () => {
    const { surface, controller } = scene('<span data-hmi-name="Status">Pagina</span><section data-hmi-name="A" data-hmi-faceplate="{}"><span data-hmi-name="Status">A</span></section><section data-hmi-name="B" data-hmi-faceplate="{}"><span data-hmi-name="Status">B</span></section>');
    const owner = surface.items().find((item) => item.name === "A")!;
    const run = (source: string) => executeHmiScript(inspectHmiScript(source).program!, {}, { screenItems: controller.context(owner.itemId) });
    expect(run('Faceplate.Items("Status").Text = "Pronto"; Screen.Items("Status").Text = "Linea"; Faceplate.Visible = false; return Faceplate.Name;').returned).toBe("A");
    const labels = document.querySelectorAll("span"); expect([...labels].map((label) => label.textContent)).toEqual(["Linea", "Pronto", "B"]);
    expect(document.querySelector<HTMLElement>('[data-hmi-name="A"]')!.style.visibility).toBe("hidden");
    expect(document.querySelector<HTMLElement>('[data-hmi-name="B"]')!.style.visibility).toBe("");
  });

  it("propaga riferimenti opachi a funzioni di modulo e callback timer inline", () => {
    const { execute, target, controller } = scene();
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Ui", alias: "Ui", functions: [{ name: "Ready", parameters: [], source: 'item.Text = "Modulo"; return item.Text;' }] }] });
    expect(execute("return Modules.Ui.Ready();", { functions: hmiScriptFunctions(catalog) }).returned).toBe("Modulo");
    let callback: HmiScriptTimerCallback | undefined, captured: HmiScriptTimerContext | undefined;
    const timerManager = { set: (_mode: unknown, next: HmiScriptTimerCallback, _delay: unknown, context?: HmiScriptTimerContext) => { callback = next; captured = context; return 1; }, clear: () => true };
    expect(execute('const target = item; HMIRuntime.Timers.SetTimeout(() => { target.Text = "Timer"; }, 50);', { timerManager }).error).toBeUndefined();
    expect(callback?.kind).toBe("inline");
    if (callback?.kind === "inline") expect(executeHmiScript(callback.program, {}, { ...captured, timerManager }).error).toBeUndefined();
    expect(target.textContent).toBe("Timer");
    controller.reset(); expect(target.textContent).toBe("Avvia");
  });

  it.each(["const target = Screen;", "const value = item.Name;", "const value = UI.ActiveScreen.Width;"])("non consente letture o catture grafiche negli inizializzatori globali: %s", (source) => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Ui", alias: "Ui", globalDefinition: { source }, functions: [] }] });
    expect(hmiScriptCatalogIssues(catalog).some((issue) => issue.includes("definizione globale"))).toBe(true);
  });

  it("rifiuta nomi duplicati, riferimenti rimossi e contesti di una pagina terminata", () => {
    const { execute, target, controller, context } = scene();
    const reference = context.resolve("item");
    execute('item.Text = "Temporaneo";');
    target.remove();
    expect(() => context.get(reference, "Text")).toThrow("non e' piu' disponibile");
    expect(controller.propertyCommands()).toEqual([]); expect(target.textContent).toBe("Avvia");
    controller.reset();
    expect(() => context.set(reference, "Text", "Vecchio")).toThrow("non e' piu' attivo");
    document.querySelector("main")!.innerHTML = '<button data-hmi-name="X"></button><button data-hmi-name="X"></button>';
    expect(() => controller.context().resolve("screen", "X")).toThrow("duplicato");
  });

  it("rilegge subito le proprie scritture anche se il ponte DOM non ha ancora risposto", () => {
    const applyProperties = vi.fn();
    const controller = createHmiPropertyFlashing({ items: () => [{ itemId: "1", screenId: "1", name: "Main", flashing: [], properties: { Width: 80 } }], apply: vi.fn(), applyProperties });
    const context = controller.context(), reference = context.resolve("screen");
    context.set(reference, "Width", 160); context.set(reference, "Width", 160);
    expect(context.get(reference, "Width")).toBe(160);
    expect(applyProperties).toHaveBeenCalledTimes(1);
    controller.reset(); expect(applyProperties).toHaveBeenLastCalledWith([]);
  });

  it("filtra comandi DOM non tipizzati o fuori whitelist e rimuove il testo creato solo al termine", () => {
    const { surface, controller, execute, target } = scene('<button data-hmi-name="M2400"></button>');
    const id = surface.items().find((item) => item.name === "M2400")!.itemId;
    surface.applyProperties([{ itemId: id, property: "innerHTML", value: "<script />" }, { itemId: id, property: "Visible", value: "false" }, { itemId: id, property: "Width", value: -1 }]);
    expect(target.childNodes).toHaveLength(0); expect(target.style.width).toBe(""); expect(target.style.visibility).toBe("");
    execute('item.Text = "Pronto";');
    const text = target.firstChild;
    surface.suspend(); surface.resume(); expect(target.firstChild).toBe(text);
    controller.reset(); expect(target.childNodes).toHaveLength(0);
  });
});
