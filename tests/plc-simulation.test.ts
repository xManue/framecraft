import { describe, expect, it } from "vitest";
import type { Dynamization } from "../src/core/hmiStandard";
import { emptyHmiResourceCatalog } from "../src/core/hmiResources";
import { resolveDynamization, simulationCommands, simulationPatch, simulationTags } from "../src/core/plcSimulation";
import { hmiScriptFunctions, hmiScriptGlobalDefinition, hmiScriptVariables, parseHmiScriptCatalog } from "../src/core/hmiScriptModules";

const tag = (property: string, name: string, extra: Partial<Dynamization> = {}): Dynamization =>
  ({ property, kind: "Tag", tag: name, conditionType: "None", ...extra });

describe("la simulazione degli stati PLC", () => {
  it("trova i valori di prova letti tramite moduli pubblici e definizioni locali", () => {
    const catalog = parseHmiScriptCatalog({
      globalModules: [{ name: "Values", alias: "Values", functions: [], globalDefinition: { source: "export const speed = Tags('Speed');" } }],
      localDefinitions: [{ scope: "/settings", context: "dynamizations", globalDefinition: { source: "const start = Tags('Start').Read();" }, functions: [{ name: "Read", parameters: [], source: "return Modules.Values.speed.Read() + start;" }] }],
    });
    const item: Dynamization = { property: "Text", kind: "Script", source: "return Local.Read();" };
    expect(simulationTags([item], hmiScriptFunctions(catalog, "/settings", "dynamizations"), hmiScriptGlobalDefinition(catalog, "/settings", "dynamizations")?.program, hmiScriptVariables(catalog))).toEqual(expect.arrayContaining(["Start", "Speed"]));
  });

  it("prende il valore del tag quando non c'e' una tabella di mezzo", () => {
    expect(resolveDynamization(tag("Left", "Pack1.Pos_X"), " 240 ")).toEqual({ value: "240" });
  });

  it("dice perche' non sa rispondere, invece di inventare", () => {
    // Le tabelle dell'export sono vuote: le soglie stanno in `fill.cmd`, che vuole TIA aperto.
    const range = tag("BackColor", "Folder_Vis", { conditionType: "Range" });
    expect(resolveDynamization(range, "3")).toEqual({
      reason: "La tabella Range e' vuota: le soglie non sono nell'export.",
    });
    expect(resolveDynamization({ property: "Text", kind: "Script", conditionType: "None" }, "1"))
      .toEqual({ reason: "La dinamizzazione non contiene uno script." });
    expect(resolveDynamization(tag("Top", "Pack1.Pos_Y"), undefined))
      .toEqual({ reason: "Il tag Pack1.Pos_Y non ha un valore di prova." });
  });

  it("esegue una dinamica Script solo nel sottoinsieme sicuro", () => {
    const script: Dynamization = {
      property: "BackColor", kind: "Script", conditionType: "None",
      source: 'const state = Tags("Machine.State").Read(); return state === 2 ? "#FF00A1D1" : "#FF808080";',
    };
    expect(resolveDynamization(script, undefined, { "Machine.State": "2" })).toEqual({ value: "#FF00A1D1" });
    expect(simulationTags([script])).toEqual(["Machine.State"]);
  });

  it("usa la definizione locale separata delle dinamizzazioni", () => {
    const catalog = parseHmiScriptCatalog({ localDefinitions: [{ scope: "/settings", context: "dynamizations", functions: [{ name: "Percent", parameters: ["value"], source: "return value * 100;" }] }] });
    const item: Dynamization = { property: "Text", kind: "Script", conditionType: "None", source: "return Local.Percent(0.42);" };
    expect(resolveDynamization(item, undefined, {}, undefined, undefined, hmiScriptFunctions(catalog, "/settings", "dynamizations"))).toEqual({ value: "42" });
    expect(resolveDynamization(item, undefined, {}, undefined, undefined, hmiScriptFunctions(catalog, "/settings", "events"))).toMatchObject({ reason: expect.stringContaining("non definita") });
  });

  it("sceglie la riga del `Range` che contiene il valore, con gli estremi aperti", () => {
    const item = tag("BackColor", "State", {
      conditionType: "Range",
      entries: [
        { to: 9, value: "#FFE20B00" },
        { from: 10, to: 99, value: "#FF00A1D1" },
        { from: 100, value: "#FF3AB54A" },
      ],
    });
    expect(resolveDynamization(item, "0")).toEqual({ value: "#FFE20B00" });
    expect(resolveDynamization(item, "42")).toEqual({ value: "#FF00A1D1" });
    expect(resolveDynamization(item, "1000")).toEqual({ value: "#FF3AB54A" });
  });

  it("legge il `Singlebit` come numero di bit acceso", () => {
    // `PackML - Mode&State Manager_StatesDisabled` e' un DInt dove ogni bit spegne uno stato.
    const item = tag("Visible", "StatesDisabled", {
      conditionType: "Singlebit",
      entries: [{ condition: "0", value: "0" }, { condition: "3", value: "1" }],
    });
    expect(resolveDynamization(item, "8")).toEqual({ value: "1" });
    expect(resolveDynamization(item, "1")).toEqual({ value: "0" });
    expect(resolveDynamization(item, "4")).toEqual({ reason: "Nessuna riga della tabella Singlebit copre 4." });
  });

  it("traduce le proprieta' dello standard in quello che si vede", () => {
    const patch = simulationPatch([
      tag("Left", "x"), tag("Top", "y"), tag("Width", "w"), tag("Height", "h"),
      tag("BackColor", "colore"), tag("Opacity", "trasparenza"), tag("Visible", "acceso"),
      tag("Text", "scritta"),
    ], { x: "240", y: "96", w: "40", h: "20", colore: "#9B000000", trasparenza: "50", acceso: "0", scritta: "Pack 1" });

    expect(patch.style).toEqual({
      left: "240px", top: "96px", width: "40px", height: "20px",
      backgroundColor: "rgba(0, 0, 0, 0.608)",
      // Nello standard l'opacita' e' una percentuale, sul canvas e' un numero da 0 a 1.
      opacity: "0.5",
      visibility: "hidden",
    });
    expect(patch.text).toBe("Pack 1");
    expect(patch.unresolved).toEqual([]);
  });

  it("tiene fuori quello che sul canvas non si vede, col motivo", () => {
    const patch = simulationPatch([tag("Graphic", "icona"), tag("Left", "x")], { icona: "Icon_Alarms", x: "10" });
    expect(patch.style).toEqual({ left: "10px" });
    expect(patch.unresolved).toEqual([
      { property: "Graphic", reason: "La grafica e' un'immagine TIA, e le 225 grafiche non sono state esportate." },
    ]);
  });

  it("elenca i tag che una pagina userebbe, una volta sola", () => {
    expect(simulationTags([
      tag("Left", "Pack1.Pos_X"),
      tag("Top", "Pack1.Pos_X"),
      tag("Width", "Pack1.Size_X"),
      { property: "Text", kind: "ResourceList", source: "MachineState", tag: "Machine.State" },
      { property: "Visible", kind: "Expression", source: "Machine.Enabled AND Safety.Ok" },
      { property: "BackColor", kind: "Flashing", flashingCondition: "RangeViolation", tag: "Temperature", color: "#FFFF0000", alternateColor: "#FF000000" },
    ])).toEqual(["Pack1.Pos_X", "Pack1.Size_X", "Machine.State", "Machine.Enabled", "Safety.Ok", "Temperature"]);
  });

  it("simula il lampeggio e lo disattiva quando il valore torna nei limiti", () => {
    const item: Dynamization = {
      property: "BackColor", kind: "Flashing", conditionType: "None",
      color: "#FFFF0000", alternateColor: "#FF000000", flashingRate: "Fast",
      flashingCondition: "RangeViolation", tag: "Temperature", minimum: 10, maximum: 80,
    };
    const alarm = simulationPatch([item], { Temperature: "90" });
    expect(alarm.flashing).toEqual([{ property: "BackColor", color: "#FF0000", alternateColor: "#000000", periodMs: 500 }]);
    expect(alarm.style.animation).toContain("framecraft-hmi-flash-background 500ms");
    expect(alarm.style["--framecraft-hmi-flash-background-alternate"]).toBe("#000000");

    const normal = simulationPatch([item], { Temperature: "42" });
    expect(normal.flashing).toEqual([]);
    expect(normal.style).toEqual({});
  });

  it("simula testi e grafiche scelti dalle liste risorse", () => {
    const resources = {
      ...emptyHmiResourceCatalog(),
      textLists: [{ name: "MachineState", rangeType: "Decimal" as const, entries: [
        { id: "run", type: "SingleValue" as const, fromValue: 1, texts: { "it-IT": "Marcia" } },
      ] }],
      graphicLists: [{ name: "MotorIcon", rangeType: "Bool" as const, entries: [
        { id: "on", type: "SingleValue" as const, fromValue: 1, graphic: "/motor-on.svg" },
      ] }],
    };
    const patch = simulationPatch([
      { property: "Text", kind: "ResourceList", source: "MachineState", tag: "Machine.State" },
      { property: "Graphic", kind: "ResourceList", source: "MotorIcon", tag: "Motor.Running" },
    ], { "Machine.State": "1", "Motor.Running": "true" }, resources, "it-IT");
    expect(patch).toMatchObject({ text: "Marcia", graphic: "/motor-on.svg", unresolved: [] });
  });

  it("esegue le espressioni e le rivaluta con i valori di prova", () => {
    const expression: Dynamization = { property: "Visible", kind: "Expression", source: "Machine.Enabled AND NOT Machine.Alarm" };
    expect(simulationPatch([expression], { "Machine.Enabled": "1", "Machine.Alarm": "0" })).toMatchObject({
      style: { visibility: "visible" }, unresolved: [],
    });
    expect(simulationPatch([expression], { "Machine.Enabled": "1" }).unresolved[0].reason).toContain("Machine.Alarm");
  });

  it("usa la prima condizione personalizzata vera come WinCC", () => {
    const item = tag("BackColor", "Temperature", {
      conditionType: "Expression",
      entries: [
        { condition: "value >= HighLimit", value: "#FFE20B00" },
        { condition: "value >= 0", value: "#FF3AB54A" },
      ],
    });
    expect(resolveDynamization(item, "87", { Temperature: "87", HighLimit: "80" })).toEqual({ value: "#FFE20B00" });
    expect(resolveDynamization(item, "42", { Temperature: "42", HighLimit: "80" })).toEqual({ value: "#FF3AB54A" });
  });

  it("manda all'anteprima solo gli elementi che cambiano davvero", () => {
    const elements = [
      { instanceId: "fc-instance-1", dynamizations: [tag("Left", "x")] },
      // Questo non ha un valore di prova: non c'e' niente da mandare, ma il motivo si dice.
      { instanceId: "fc-instance-2", dynamizations: [tag("Top", "senza-valore")] },
    ];
    const { commands, unresolved } = simulationCommands(elements, { x: "12" });
    expect(commands).toEqual([{ instanceId: "fc-instance-1", style: { left: "12px" } }]);
    expect(unresolved).toEqual([
      { property: "Top", reason: "Il tag senza-valore non ha un valore di prova." },
    ]);
  });
});
