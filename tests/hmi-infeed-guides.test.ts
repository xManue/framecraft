import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planPageNumber, standardPageSource } from "../src/core/hmiPages";

interface EventHandler { Script?: { ScriptCode?: string } }
interface Dynamization { PropertyName?: string; Tag?: string }
interface ScreenItem {
  Name: string;
  _type: string;
  Left?: number;
  Top?: number;
  Width?: number;
  Height?: number;
  Graphic?: string;
  EventHandlers?: EventHandler[];
  Dynamizations?: Dynamization[];
}
interface ScreenJson { ScreenItems: ScreenItem[] }

const readScreen = (name: string) => JSON.parse(readFileSync(new URL(`../standard/screens/2000_Settings/2201_Infeed_Guides/${name}.json`, import.meta.url), "utf8")) as ScreenJson;
const json = readScreen("2202_MMC_Motor_Box");
const generated = standardPageSource({
  componentName: "InfeedMotorBoxPage",
  title: "MMC - Motor Box",
  plan: planPageNumber("settings", [2201], { slot: 5 })!,
  templateId: "motor-box-control",
  folderTab: 1,
  folderRoutes: ["/settings/infeed-guide", "/settings/infeed-guide/motor-box", "/settings/infeed-guide/motor"],
});
const item = (name: string) => json.ScreenItems.find((entry) => entry.Name === name)!;
const script = (entry: ScreenItem) => (entry.EventHandlers ?? []).map((event) => event.Script?.ScriptCode ?? "").join("\n");
const tag = (entry: ScreenItem, property: string) => entry.Dynamizations?.find((dynamic) => dynamic.PropertyName === property)?.Tag;

const guideJson = readScreen("2201_MMC_Guide");
const guideGenerated = standardPageSource({
  componentName: "InfeedGuidePage",
  title: "MMC - Guide",
  plan: planPageNumber("settings", [2201], { slot: 4 })!,
  templateId: "device-control",
  folderTab: 0,
  folderRoutes: ["/settings/infeed-guide", "/settings/infeed-guide/motor-box", "/settings/infeed-guide/motor"],
});
const guideItem = (name: string) => guideJson.ScreenItems.find((entry) => entry.Name === name)!;

const motorJson = readScreen("2203_MMC_Motor");
const motorGenerated = standardPageSource({
  componentName: "InfeedMotorPage",
  title: "MMC - Motor",
  plan: planPageNumber("settings", [2201], { slot: 6 })!,
  templateId: "motor-control",
  folderTab: 2,
  folderRoutes: ["/settings/infeed-guide", "/settings/infeed-guide/motor-box", "/settings/infeed-guide/motor"],
});
const motorItem = (name: string) => motorJson.ScreenItems.find((entry) => entry.Name === name)!;

describe("2201 Infeed Guide ricavata dal JSON WinCC", () => {
  it("mantiene i quattordici hotspot, visibilità e valori di selezione reali", () => {
    const buttons = Array.from({ length: 14 }, (_, index) => guideItem(index === 0 ? "btnNok_2" : index === 1 ? "btnNok_1" : `btnNok_${index + 1}`));
    for (const button of buttons) {
      const value = script(button).match(/MMC_HMI_Selection_Guide_Motor",\s*(\d+)/)?.[1];
      const visible = tag(button, "Visible");
      expect(value, button.Name).toBeTruthy();
      expect(visible, button.Name).toBeTruthy();
      expect(guideGenerated).toContain(`data-plc-value="${value}" data-hmi-visible-tag="${visible}"`);
      expect(guideGenerated).toContain(`left: ${button.Left}, top: ${button.Top}, width: ${button.Width}, height: ${button.Height}`);
    }
    expect(guideGenerated.match(/data-hmi-action="select-guide-motor"/g)).toHaveLength(14);
  });

  it("conserva stati, target, enable e navigazione della guida", () => {
    for (const name of ["btnOK_1", "btnOK_2", "btnOK_3", "btnOK_4", "btnOK_5"]) {
      expect(guideGenerated).toContain(`data-plc-variable="${tag(guideItem(name), "Graphic")}"`);
    }
    expect(guideGenerated).toContain(`data-plc-variable="${tag(guideItem("ioValue2_4"), "ProcessValue")}"`);
    expect(script(guideItem("Button_13"))).toContain('InvertBitInTag("MMC_Guide.InUse", 0)');
    expect(guideGenerated).toContain('data-plc-variable="MMC_Guide.InUse" data-plc-write="invert-bit-0"');
    for (const [name, selection] of [["btnHome", 0], ["btnWizardBack", 1], ["btnWIzardNext", 2]] as const) {
      expect(script(guideItem(name))).toContain(`MMC_Guide_Selection(${selection})`);
      expect(guideGenerated).toContain(`data-hmi-action="select-mmc-guide" data-hmi-selection-value="${selection}"`);
    }
  });

  it("espone due screen macchina configurabili e gli swipe reali", () => {
    for (const name of ["Graphic view_1", "Graphic view_2"]) {
      const graphic = guideItem(name);
      expect(guideGenerated).toContain(`left: ${graphic.Left}, top: ${graphic.Top}, width: ${graphic.Width}, height: ${graphic.Height}`);
    }
    expect(guideGenerated.match(/data-framecraft-slot="machine-part-screen"/g)).toHaveLength(2);
    expect(guideGenerated).toContain('data-hmi-swipe-right="2161_Lubrification"');
    expect(guideGenerated).toContain('data-hmi-swipe-left="2241_SystemFunction"');
    expect(guideGenerated).toContain('data-hmi-swipe-up="2202_MMC_Motor_Box"');
  });
});

describe("2203 Motor ricavata dal JSON WinCC", () => {
  it("mantiene gli otto stati PLC del motore", () => {
    for (const name of ["btnOK_1", "btnOK_2", "btnOK_3", "btnOK_4", "btnOK_5", "btnOK_6", "btnOK_7", "btnOK_8"]) {
      expect(motorGenerated).toContain(`data-plc-variable="${tag(motorItem(name), "Graphic")}"`);
    }
    expect(motorGenerated).toContain('data-plc-variable="MMC_HMI_Motor.Command.Stop"');
    expect(motorGenerated).toContain('data-plc-variable="MMC_HMI_Motor.Command.Reset"');
  });

  it("mantiene geometria e tag dei sei campi reali", () => {
    for (const name of ["ioValue2_4", "ioValue2_1", "ioValue2_3", "ioValue2_5", "Symbolic IO field_1", "Symbolic IO field_2"]) {
      const control = motorItem(name);
      expect(motorGenerated).toContain(`data-plc-variable="${tag(control, "ProcessValue")}"`);
      expect(motorGenerated).toContain(`left: ${control.Left}, top: ${control.Top}, width: ${control.Width}, height: ${control.Height}`);
    }
  });

  it("mantiene screen configurabile, navigazione e swipe reali", () => {
    const graphic = motorItem("Graphic view_1");
    expect(motorGenerated).toContain(`data-hmi-graphic="${graphic.Graphic}" data-framecraft-slot="machine-part-screen"`);
    expect(motorGenerated).toContain(`left: ${graphic.Left}, top: ${graphic.Top}, width: ${graphic.Width}, height: ${graphic.Height}`);
    for (const [name, selection] of [["btnHome", 0], ["btnWizardBack", 1], ["btnWIzardNext", 2]] as const) {
      expect(script(motorItem(name))).toContain(`MMC_Motor_Selection(${selection})`);
      expect(motorGenerated).toContain(`data-hmi-action="select-mmc-motor-page" data-hmi-selection-value="${selection}"`);
    }
    expect(motorGenerated).toContain('data-hmi-swipe-down="2202_MMC_Motor_Box"');
  });
});

describe("2202 Motor Box ricavata dal JSON WinCC", () => {
  it("mantiene gli otto hotspot e il numero motore scritto da ciascuno", () => {
    const buttons = Array.from({ length: 8 }, (_, index) => item(`Button_${index + 3}`));
    for (const button of buttons) {
      const value = script(button).match(/MMC_HMI_Selection_Motor",\s*(\d+)/)?.[1];
      expect(value, button.Name).toBeTruthy();
      expect(generated).toContain(`data-plc-value="${value}"`);
      expect(generated).toContain(`left: ${button.Left}, top: ${button.Top}, width: ${button.Width}, height: ${button.Height}`);
    }
    expect(generated.match(/data-hmi-action="select-mmc-motor"/g)).toHaveLength(buttons.length);
    expect(generated).toContain('data-hmi-target-screen="2203_MMC_Motor"');
  });

  it("conserva porta seriale, navigazione motor box e stati reali", () => {
    expect(script(item("btnNok_2"))).toContain("MMC_Port_Selection()");
    expect(generated).toContain('data-plc-variable="MMC_HMI_Selection_SerialPort" data-hmi-event="Down" data-hmi-action="select-mmc-port"');
    for (const [name, selection] of [["btnHome", 0], ["btnWizardBack", 1], ["btnWIzardNext", 2]] as const) {
      expect(script(item(name))).toContain(`MMC_Box_Selection(${selection})`);
      expect(generated).toContain(`data-hmi-action="select-mmc-box" data-hmi-selection-value="${selection}"`);
    }
    for (const [name, label] of [["btnOK_3", "Network Status"], ["btnOK_4", "24V Fuse Status"], ["btnOK_5", "24V Supply Status"]] as const) {
      const variable = tag(item(name), "Graphic");
      expect(variable, name).toBeTruthy();
      expect(generated).toContain(`data-plc-variable="${variable}"`);
      expect(generated).toContain(label);
    }
  });

  it("mantiene screen configurabile e swipe nelle quattro direzioni", () => {
    const graphic = item("Graphic view_1");
    const touch = item("Touch area_1");
    expect(generated).toContain(`data-hmi-graphic="${graphic.Graphic}"`);
    expect(generated).toContain('data-framecraft-slot="machine-part-screen"');
    expect(generated).toContain(`left: ${graphic.Left}, top: ${graphic.Top}, width: ${graphic.Width}, height: ${graphic.Height}`);
    expect(generated).toContain('data-hmi-swipe-right="2161_Lubrification"');
    expect(generated).toContain('data-hmi-swipe-left="2241_SystemFunction"');
    expect(generated).toContain('data-hmi-swipe-down="2201_MMC_Guide"');
    expect(generated).toContain('data-hmi-swipe-up="2203_MMC_Motor"');
    expect(generated).toContain(`left: ${touch.Left}, top: ${touch.Top}, width: ${touch.Width}, height: ${touch.Height}`);
  });
});
