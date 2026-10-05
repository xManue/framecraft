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

const readScreen = (path: string) => JSON.parse(readFileSync(new URL(`../standard/screens/2000_Settings/${path}`, import.meta.url), "utf8")) as ScreenJson;
const script = (entry: ScreenItem) => (entry.EventHandlers ?? []).map((event) => event.Script?.ScriptCode ?? "").join("\n");
const tag = (entry: ScreenItem, property: string) => entry.Dynamizations?.find((dynamic) => dynamic.PropertyName === property)?.Tag;

const robotJson = readScreen("2121_Robot_Function/2121_RobotFunction.json");
const robotItem = (name: string) => robotJson.ScreenItems.find((entry) => entry.Name === name)!;
const robotGenerated = standardPageSource({
  componentName: "RobotFunctionPage",
  title: "Robot Function",
  plan: planPageNumber("settings", [2121], { slot: 3 })!,
  templateId: "robot-function",
});

const lubricationJson = readScreen("2161_Lubrification/2161_Lubrification.json");
const lubricationItem = (name: string) => lubricationJson.ScreenItems.find((entry) => entry.Name === name)!;
const lubricationGenerated = standardPageSource({
  componentName: "LubricationPage",
  title: "Lubrication",
  plan: planPageNumber("settings", [2161], { slot: 4 })!,
  templateId: "lubrification",
});

describe("2121 Robot Function ricavata dal JSON WinCC", () => {
  it("mantiene geometria, grafica e assenza di azioni dei quattro comandi", () => {
    for (const name of ["btnNok_1", "btnNok_2", "btnNok_3", "btnNok_4"]) {
      const button = robotItem(name);
      expect(script(button), name).toBe("");
      expect(tag(button, "ProcessValue"), name).toBeUndefined();
      expect(robotGenerated).toContain(`data-hmi-graphic="${button.Graphic}" data-plc-variable="" data-hmi-action=""`);
      expect(robotGenerated).toContain(`left: ${button.Left}, top: ${button.Top}, width: ${button.Width}, height: ${button.Height}`);
    }
    expect(robotGenerated.match(/data-framecraft-next="configure-command"/g)).toHaveLength(4);
  });

  it("espone lo screen robot e soltanto le grafiche realmente esportate", () => {
    const graphics = robotJson.ScreenItems.filter((entry) => entry._type === "HmiGraphicView").map((entry) => entry.Graphic);
    expect(graphics).toEqual(["Fanuc", "Manipolatore", "Kuka", "IRB_5720_9"]);
    expect(robotGenerated).toContain('data-hmi-graphic="Kuka"');
    expect(robotGenerated).toContain(`data-hmi-graphic-options="${graphics.join(",")}"`);
    expect(robotGenerated).toContain('data-framecraft-slot="machine-part-screen"');
  });

  it("mantiene gli swipe verso Motor Speed e Lubrification", () => {
    const touch = robotItem("Touch area_1");
    expect(script(touch)).toContain('ChangeScreen("2081_Motor_Speed_1"');
    expect(script(touch)).toContain('ChangeScreen("2161_Lubrification"');
    expect(robotGenerated).toContain('data-hmi-swipe-right="2081_Motor_Speed_1"');
    expect(robotGenerated).toContain('data-hmi-swipe-left="2161_Lubrification"');
    expect(robotGenerated).toContain(`left: ${touch.Left}, top: ${touch.Top}, width: ${touch.Width}, height: ${touch.Height}`);
  });
});

describe("2161 Lubrification ricavata dal JSON WinCC", () => {
  it("mantiene tag e geometria dei sette campi", () => {
    for (const name of ["IO field_1", "IO field_2", "IO field_3", "IO field_4", "IO field_5", "IO field_6", "IO field_7"]) {
      const field = lubricationItem(name);
      const variable = tag(field, "ProcessValue");
      expect(variable, name).toBeTruthy();
      expect(lubricationGenerated).toContain(`data-plc-variable="${variable}"`);
      expect(lubricationGenerated).toContain(`left: ${field.Left}, top: ${field.Top}, width: ${field.Width}, height: ${field.Height}`);
    }
  });

  it("conserva il comando test momentaneo Down e Up", () => {
    const button = lubricationItem("btnNok_1");
    expect(script(button)).toContain('SetBitInTag("DB_Lubrication_TEST_Cmd", 0)');
    expect(script(button)).toContain('ResetBitInTag("DB_Lubrication_TEST_Cmd", 0)');
    expect(lubricationGenerated).toContain('data-plc-variable="DB_Lubrication_TEST_Cmd" data-plc-write="set-bit-0-on-down-reset-on-up"');
    expect(lubricationGenerated).toContain('data-hmi-event="Down,Up" data-hmi-action="test-lubrication"');
    expect(lubricationGenerated).toContain(`left: ${button.Left}, top: ${button.Top}, width: ${button.Width}, height: ${button.Height}`);
  });

  it("mantiene screen pompa configurabile e swipe reali", () => {
    const graphic = lubricationItem("Graphic view_1");
    const touch = lubricationItem("Touch area_1");
    expect(lubricationGenerated).toContain(`data-hmi-graphic="${graphic.Graphic}"`);
    expect(lubricationGenerated).toContain('data-framecraft-slot="machine-part-screen"');
    expect(lubricationGenerated).toContain(`left: ${graphic.Left}, top: ${graphic.Top}, width: ${graphic.Width}, height: ${graphic.Height}`);
    expect(lubricationGenerated).toContain('data-hmi-swipe-right="2121_RobotFunction"');
    expect(lubricationGenerated).toContain('data-hmi-swipe-left="2201_MMC_Guide"');
    expect(lubricationGenerated).toContain(`left: ${touch.Left}, top: ${touch.Top}, width: ${touch.Width}, height: ${touch.Height}`);
  });
});
