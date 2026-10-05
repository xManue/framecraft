// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface } from "../scripts/hmi-property-flashing.mjs";
import { executeHmiScript, executeHmiScriptAsync, inspectHmiScript, type HmiScriptExecutionOptions, type HmiScriptScreenItemReference, type HmiScriptTimerCallback, type HmiScriptTimerContext } from "../src/core/hmiScript";
import { hmiScriptFunctions, hmiScriptCatalogIssues, parseHmiScriptCatalog } from "../src/core/hmiScriptModules";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.restoreAllMocks(); document.body.innerHTML = ""; });

function scene(markup = '<button data-hmi-name="M2400" style="font-family:Arial,sans-serif;font-size:16px;font-weight:400;font-style:normal;text-decoration:overline">Motore<svg /></button>') {
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

describe("oggetto Font annidato del modello Unified", () => {
  it("legge il font configurato e distingue il nome del font dal nome dell'oggetto", () => {
    const { execute } = scene();
    const result = execute('const font = UI.ActiveScreen.Items("M2400").Font; return JSON.stringify([item.Name, font.Name, font.Size, font.Weight, font.Italic, font.Underline, font.StrikeOut]);');
    expect(result.error).toBeUndefined();
    expect(JSON.parse(String(result.returned))).toEqual(["M2400", "Arial", 16, 400, false, false, 0]);
    expect(result.writes).toEqual({});
  });

  it("scrive tutte le proprietà, rilegge subito e preserva nodi e listener", () => {
    const { execute, target, controller } = scene();
    const icon = target.querySelector("svg"), text = target.firstChild, click = vi.fn();
    target.addEventListener("click", click);
    const result = execute('const font = HMIRuntime.UI.ActiveScreen.Items("M2400").Font; font.Name = "Courier New"; font.Size = 18.5; font.Weight = 700; font.Italic = true; font.Underline = true; font.StrikeOut = 1; return JSON.stringify([item.Name, font.Name, font.Size, font.Weight, font.Italic, font.Underline, font.StrikeOut]);');
    expect(result.error).toBeUndefined();
    expect(JSON.parse(String(result.returned))).toEqual(["M2400", "Courier New", 18.5, 700, true, true, 1]);
    expect(result.writes).toEqual({});
    expect(target.style.fontFamily).toBe('"Courier New"'); expect(target.style.fontSize).toBe("18.5px");
    expect(target.style.fontWeight).toBe("700"); expect(target.style.fontStyle).toBe("italic");
    expect(target.style.textDecorationLine.split(" ")).toEqual(expect.arrayContaining(["overline", "underline", "line-through"]));
    expect(target.querySelector("svg")).toBe(icon); expect(target.firstChild).toBe(text);
    target.click(); expect(click).toHaveBeenCalledTimes(1);
    expect(execute('item.Name = "Altro";').error).toContain("sola lettura");
    controller.reset();
    expect(target.style.fontFamily).toBe("Arial, sans-serif"); expect(target.style.fontSize).toBe("16px");
    expect(target.style.fontWeight).toBe("400"); expect(target.style.fontStyle).toBe("normal");
    expect(target.style.textDecoration).toBe("overline"); expect(target.style.textDecorationLine).toBe("");
  });

  it("applica il font alla label annidata anche se questa ha stili propri important", () => {
    const { execute, target, controller } = scene('<button data-hmi-name="M2400" style="font-size:12px"><svg style="font-size:10px" /><span data-hmi-text style="font-size:16px!important;font-family:Arial;font-weight:400;font-style:normal">Motore</span></button>');
    const label = target.querySelector<HTMLElement>("span")!, icon = target.querySelector<SVGElement>("svg")!;
    const click = vi.fn(); label.addEventListener("click", click);
    expect(execute('item.Font.Size = 22.5; item.Font.Italic = true;').error).toBeUndefined();
    expect(label.style.fontSize).toBe("22.5px"); expect(label.style.getPropertyPriority("font-size")).toBe("important");
    expect(target.style.fontSize).toBe("12px"); expect(icon.style.fontSize).toBe("10px");
    label.click(); expect(click).toHaveBeenCalledTimes(1);
    controller.reset();
    expect(label.style.fontSize).toBe("16px"); expect(label.style.getPropertyPriority("font-size")).toBe("important");
    expect(label.style.fontStyle).toBe("normal"); expect(target.querySelector("span")).toBe(label);
  });

  it.each([
    '<input data-hmi-name="M2400" value="42" />',
    '<textarea data-hmi-name="M2400">42</textarea>',
    '<select data-hmi-name="M2400"><option value="42">Quarantadue</option></select>',
  ])("modifica il font di un campo senza cambiare valore, opzioni o tag: %s", (markup) => {
    const { execute, target, controller } = scene(markup);
    const input = target as HTMLInputElement;
    const children = [...target.childNodes];
    expect(execute('item.Font.Size = 20.5; item.Font.Name = "monospace"; item.Font.Weight = 600; return item.Font.Size;')).toMatchObject({ returned: 20.5, writes: {} });
    expect(input.value).toBe("42"); expect([...target.childNodes]).toEqual(children);
    expect(target.style.fontFamily).toBe("monospace"); expect(target.style.fontSize).toBe("20.5px");
    expect(execute('item.Text = "99";').error).toContain("non espone");
    controller.reset(); expect(input.value).toBe("42"); expect(target.style.fontSize).toBe("");
  });

  it.each([
    ['item.Font.Size = "18";', "Float"],
    ["item.Font.Size = -1;", "Float"],
    ["item.Font.Size = 1 / 0;", "Divisione per zero"],
    ["item.Font.Size = 0 / 0;", "Divisione per zero"],
    ["item.Font.Size = 1e39;", "Float"],
    ["item.Font.Weight = 500;", "HmiFontWeight"],
    ['item.Font.Weight = "700";', "HmiFontWeight"],
    ["item.Font.Weight = 400.5;", "HmiFontWeight"],
    ["item.Font.StrikeOut = true;", "HmiFontStrikeOut"],
    ["item.Font.StrikeOut = 2;", "HmiFontStrikeOut"],
    ['item.Font.Underline = "true";', "Boolean"],
    ["item.Font.Italic = 1;", "Boolean"],
    ["item.Font.Name = null;", "stringa"],
    ['item.Font.Name = "Arial\\n";', "stringa"],
  ])("rifiuta tipi e valori diversi dalle firme supportate: %s", (source, reason) => {
    const { execute, controller, target } = scene();
    expect(execute(source).error).toContain(reason);
    expect(controller.propertyCommands()).toEqual([]);
    expect(target.style.fontSize).toBe("16px");
  });

  it.each([[0, "0px"], [18.5, "18.5px"], [1e22, "10000000000000000000000px"], [1e-7, "0.0000001px"]] as const)("converte il Float %s in DIU CSS senza perdere i decimali o usare esponenti", (size, css) => {
    const { execute, target } = scene();
    const setProperty = vi.spyOn(target.style, "setProperty");
    expect(execute("item.Font.Size = " + size + "; return item.Font.Size;")).toMatchObject({ returned: size });
    expect(setProperty).toHaveBeenCalledWith("font-size", css, "important");
    expect(parseFloat(target.style.fontSize)).toBe(size);
  });

  it("None rimuove il grassetto e le decorazioni restano indipendenti", () => {
    const { execute, target, controller } = scene();
    expect(execute("item.Font.Weight = 0; item.Font.Underline = true; item.Font.StrikeOut = 1; item.Font.Underline = false; return item.Font.Weight;").returned).toBe(0);
    expect(target.style.fontWeight).toBe("normal"); expect(target.style.textDecorationLine).toBe("overline line-through");
    execute("item.Font.StrikeOut = 0;");
    expect(target.style.textDecorationLine || target.style.textDecoration).toBe("overline");
    expect(execute("return JSON.stringify([item.Font.Underline, item.Font.StrikeOut]);").returned).toBe("[false,0]");
    controller.reset(); expect(target.style.textDecorationLine).toBe("");
  });

  it("tratta il nome del font come una famiglia CSS, non come una dichiarazione eseguibile", () => {
    const { execute, target } = scene();
    const name = 'Font"; color:red; background:url(https://example.invalid/asset); "';
    const result = execute("item.Font.Name = " + JSON.stringify(name) + "; return item.Font.Name;");
    expect(result.returned).toBe(name); expect(result.error).toBeUndefined();
    expect(target.style.color).toBe(""); expect(target.style.backgroundImage).toBe("");
    expect(target.style.fontFamily).toContain("example.invalid");
  });

  it("non espone DOM/prototipi, non sostituisce Font e non confonde un oggetto dati con un riferimento", () => {
    const { execute, target } = scene();
    expect(inspectHmiScript("return item.Font.constructor;").error).toContain("non ammessa");
    expect(execute('const key = "__proto__"; return item.Font[key];').error).toContain("non ammessa");
    expect(execute("return item.Font.style;").error).toContain("Font non espone");
    expect(execute('return item["Font.Size"];').error).toContain("riferimento Font");
    expect(execute("item.Font = null;").error).toContain("non sostituibile");
    expect(execute('return item.Font.PropertyFlashing("BackColor", true, "#ffffff", "#000000");').error).toContain("non Font");
    expect(execute('const fake = {screenItemId:"hmi-item-2",screenPropertyPath:"Font"}; fake.Size = 99; return fake.Size;').returned).toBe(99);
    expect(target.style.fontSize).toBe("16px");
    const write = execute('Tags("Command").Write(item.Font);');
    expect(write.error).toContain("riferimento grafico"); expect(write.writes).toEqual({});
  });

  it("non sceglie automaticamente una label fra più testi e non aggiunge Font a immagini o SVG", () => {
    const { execute, controller } = scene('<button data-hmi-name="M2400"><span>Avvia</span><span>Stato</span></button><img data-hmi-name="Photo" /><svg data-hmi-name="Icon" />');
    for (const source of ["return item.Font;", 'Screen.Items("Photo").Font.Size = 20;', 'Screen.Items("Icon").Font.Size = 20;']) expect(execute(source).error).toContain("non espone Font");
    expect(controller.propertyCommands()).toEqual([]);
  });

  it("compone sospensioni annidate, font della label, traduzioni e lampeggio senza perdere la nuova base", () => {
    const { execute, target, surface, controller } = scene('<button data-hmi-name="M2400"><svg /><span data-hmi-text style="font-size:16px;font-style:normal;text-decoration:overline">Motore</span></button>');
    const label = target.querySelector<HTMLElement>("span")!;
    execute('item.Font.Size = 18.5; item.Font.Underline = true; item.Font.StrikeOut = 1; item.Text = "Da script"; item.PropertyFlashing("BackColor", true, "#ff0000", "#000000");');
    surface.suspend(); surface.suspend();
    expect(label.style.fontSize).toBe("16px");
    label.style.fontSize = "24px"; label.textContent = "Traduzione";
    surface.setDeclarative(target, [{ property: "BorderColor", color: "#ffffff", alternateColor: "#000000", periodMs: 500 }]);
    surface.resume(); expect(label.style.fontSize).toBe("24px");
    surface.resume(); expect(label.style.fontSize).toBe("18.5px"); expect(label.textContent).toBe("Da script");
    expect(target.style.animation).toContain("flash-background"); expect(target.style.animation).toContain("flash-border");
    controller.reset();
    expect(label.style.fontSize).toBe("24px"); expect(label.textContent).toBe("Traduzione"); expect(label.style.textDecorationLine).toBe("");
  });

  it("non sovrascrive un font modificato esternamente e mantiene le priorità della base", () => {
    const { execute, target, controller } = scene();
    target.style.setProperty("font-size", "16px", "important");
    execute("item.Font.Size = 18.5; item.Font.Weight = 700;");
    target.style.setProperty("font-size", "22px", "important"); target.style.opacity = "0.5";
    controller.reset();
    expect(target.style.fontSize).toBe("22px"); expect(target.style.getPropertyPriority("font-size")).toBe("important");
    expect(target.style.fontWeight).toBe("400"); expect(target.style.opacity).toBe("0.5");
  });

  it("legge e disattiva le decorazioni del contenitore senza toccare icone, altre linee o stili esterni", () => {
    const { execute, target, controller } = scene('<button data-hmi-name="M2400" style="text-decoration:underline overline wavy red!important"><svg /><div style="text-decoration:line-through"><span data-hmi-text style="font-size:16px">Motore</span></div></button>');
    const icon = target.querySelector("svg"), middle = target.querySelector<HTMLElement>("div")!, label = target.querySelector<HTMLElement>("span")!;
    expect(execute("return JSON.stringify([item.Font.Underline, item.Font.StrikeOut]);").returned).toBe("[true,1]");
    expect(execute("item.Font.Underline = false; item.Font.StrikeOut = 0;").error).toBeUndefined();
    expect(target.style.textDecorationLine).toBe("overline"); expect(middle.style.textDecorationLine).toBe("none");
    expect(label.style.textDecorationLine).toBe(""); expect(target.querySelector("svg")).toBe(icon);
    expect(target.style.textDecoration).toBe("underline overline wavy red");
    controller.reset();
    expect(target.style.textDecorationLine).toBe(""); expect(middle.style.textDecorationLine).toBe("");
    expect(target.style.getPropertyPriority("text-decoration")).toBe("important");
    expect(execute('return JSON.stringify([Screen.Items("M2400").Font.Underline, Screen.Items("M2400").Font.StrikeOut]);', { screenItems: controller.context() }).returned).toBe("[true,1]");
  });

  it("conserva shorthand e priorità del font al ripristino", () => {
    const { execute, target, controller } = scene();
    target.style.setProperty("font", "italic bold 16px Arial", "important");
    const before = [target.style.fontSize, target.style.fontWeight, target.style.fontStyle, target.style.fontFamily];
    const priority = target.style.getPropertyPriority("font-size");
    execute('item.Font.Size = 18.5; item.Font.Weight = 300; item.Font.Name = "Courier New"; item.Font.Italic = false;');
    expect(target.style.fontSize).toBe("18.5px"); expect(target.style.fontWeight).toBe("300");
    expect(target.style.getPropertyPriority("font-size")).toBe("important");
    controller.reset();
    expect([target.style.fontSize, target.style.fontWeight, target.style.fontStyle, target.style.fontFamily]).toEqual(before);
    expect(target.style.getPropertyPriority("font-size")).toBe(priority);
    expect(target.style.getPropertyPriority("font")).toBe("important");
  });

  it("isola i font fra pagina e istanze faceplate con nomi uguali", () => {
    const { surface, controller } = scene('<span data-hmi-name="Status" style="font-size:12px">Pagina</span><section data-hmi-name="A" data-hmi-faceplate="{}"><span data-hmi-name="Status" style="font-size:14px">A</span></section><section data-hmi-name="B" data-hmi-faceplate="{}"><span data-hmi-name="Status" style="font-size:16px">B</span></section>');
    const owner = surface.items().find((item) => item.name === "A")!;
    const result = executeHmiScript(inspectHmiScript('Faceplate.Items("Status").Font.Size = 20.5; Screen.Items("Status").Font.Size = 18;').program!, {}, { screenItems: controller.context(owner.itemId) });
    expect(result.error).toBeUndefined();
    expect([...document.querySelectorAll("span")].map((label) => label.style.fontSize)).toEqual(["18px", "20.5px", "16px"]);
  });

  it("passa il riferimento Font a moduli, dati annidati e callback timer senza esporre DOM", () => {
    const { execute, target, controller } = scene();
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Ui", alias: "Ui", functions: [{ name: "Ready", parameters: ["font"], source: "font.Size = 20.5; return font.Size;" }] }] });
    expect(execute("return Modules.Ui.Ready(item.Font);", { functions: hmiScriptFunctions(catalog) }).returned).toBe(20.5);
    let callback: HmiScriptTimerCallback | undefined, captured: HmiScriptTimerContext | undefined;
    const timerManager = { set: (_mode: unknown, next: HmiScriptTimerCallback, _delay: unknown, context?: HmiScriptTimerContext) => { callback = next; captured = context; return 1; }, clear: () => true };
    expect(execute('const data = {fonts: [item.Font]}; HMIRuntime.Timers.SetTimeout(() => { data.fonts[0].Size = 22.5; }, 50);', { timerManager }).error).toBeUndefined();
    if (callback?.kind !== "inline") throw new Error("Timer inline non catturato");
    expect(executeHmiScript(callback.program, {}, { ...captured, timerManager }).error).toBeUndefined();
    expect(target.style.fontSize).toBe("22.5px");
    controller.reset();
    expect(executeHmiScript(callback.program, {}, { ...captured, timerManager }).error).toContain("non e' piu' attivo");
  });

  it("rifiuta riferimenti rimossi, percorsi falsi e contesti scaduti", () => {
    const { context, target, controller, execute } = scene();
    const font = context.get(context.resolve("item"), "Font") as HmiScriptScreenItemReference;
    expect(font).toEqual({ screenItemId: font.screenItemId, screenPropertyPath: "Font" });
    expect(() => context.get({ ...font, screenPropertyPath: "style" } as never, "Name")).toThrow("non valido");
    execute("item.Font.Size = 18.5;");
    target.remove();
    expect(() => context.get(font, "Size")).toThrow("non e' piu' disponibile");
    expect(target.style.fontSize).toBe("16px"); expect(controller.propertyCommands()).toEqual([]);
    controller.reset();
    expect(() => context.set(font, "Size", 99)).toThrow("non e' piu' attivo");
  });

  it("ritorna Font da una funzione di modulo mantenendo il riferimento grafico", () => {
    const { execute, target } = scene();
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Ui", alias: "Ui", functions: [{ name: "CurrentFont", parameters: [], source: "return item.Font;" }] }] });
    const result = execute("const font = Modules.Ui.CurrentFont(); font.Size = 21.5; return font.Size;", { functions: hmiScriptFunctions(catalog) });
    expect(result).toMatchObject({ returned: 21.5, writes: {} }); expect(result.error).toBeUndefined();
    expect(target.style.fontSize).toBe("21.5px");
  });

  it("mantiene Font nel contesto await e nelle callback Promise della IR", async () => {
    const { context, target } = scene();
    const inspected = inspectHmiScript('const font = item.Font; const tags = Tags.CreateTagSet(["Ready"]); await tags.ReadAsync(); font.Size = 18.5; tags.ReadAsync().then(function() { font.Weight = 700; }); return font.Size;');
    expect(inspected.error).toBeUndefined();
    const result = await executeHmiScriptAsync(inspected.program!, { Ready: "1" }, { screenItems: context });
    expect(result).toMatchObject({ returned: 18.5, writes: {} }); expect(result.error).toBeUndefined();
    expect(target.style.fontSize).toBe("18.5px"); expect(target.style.fontWeight).toBe("700");
  });

  it("rilegge le scritture prima del ritorno del ponte e non inventa proprietà base sconosciute", () => {
    const applyProperties = vi.fn();
    const controller = createHmiPropertyFlashing({ items: () => [{ itemId: "1", screenId: "1", name: "Main", flashing: [], properties: { "Font.Size": null } }], apply: vi.fn(), applyProperties });
    const context = controller.context(), font = context.get(context.resolve("screen"), "Font") as HmiScriptScreenItemReference;
    expect(() => context.get(font, "Size")).toThrow("non e' risolvibile");
    context.set(font, "Size", 18.5); context.set(font, "Size", 18.5);
    expect(context.get(font, "Size")).toBe(18.5); expect(applyProperties).toHaveBeenCalledTimes(1);
    expect(controller.propertyCommands()).toEqual([{ itemId: "1", property: "Font.Size", value: 18.5 }]);
    controller.reset(); expect(applyProperties).toHaveBeenLastCalledWith([]);
  });

  it("filtra anche al confine DOM i comandi Font fuori contratto", () => {
    const { surface, target } = scene();
    const id = surface.items().find((item) => item.name === "M2400")!.itemId;
    surface.applyProperties([{ itemId: id, property: "Font.Size", value: -1 }, { itemId: id, property: "Font.Weight", value: 500 }, { itemId: id, property: "Font.StrikeOut", value: true }, { itemId: id, property: "Font.Underline", value: "true" }, { itemId: id, property: "Font.Name", value: "Arial\n" }, { itemId: id, property: "Font.style", value: "color:red" }]);
    expect(target.style.fontSize).toBe("16px"); expect(target.style.fontWeight).toBe("400"); expect(target.style.textDecorationLine).toBe("");
  });

  it.each(["const font = item.Font;", 'const font = Screen.Items("M2400").Font;', "const name = UI.ActiveScreen.Font.Name;"])("non permette catture grafiche negli inizializzatori globali: %s", (source) => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Ui", alias: "Ui", globalDefinition: { source }, functions: [] }] });
    expect(hmiScriptCatalogIssues(catalog).some((issue) => issue.includes("definizione globale"))).toBe(true);
  });
});
