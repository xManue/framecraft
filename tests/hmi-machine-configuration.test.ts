import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planPageNumber, standardPageSource } from "../src/core/hmiPages";

interface EventHandler { Script?: { ScriptCode?: string } }
interface ScreenItem {
  Name: string;
  _type: string;
  Left?: number;
  Top?: number;
  Width?: number;
  Height?: number;
  Graphic?: string;
  EventHandlers?: EventHandler | EventHandler[];
}
interface ScreenJson { ScreenItems: ScreenItem[] }

const readScreen = (path: string) => JSON.parse(readFileSync(new URL(`../standard/screens/${path}`, import.meta.url), "utf8")) as ScreenJson;
const item = (screen: ScreenJson, name: string) => screen.ScreenItems.find((entry) => entry.Name === name)!;
const geometry = (entry: ScreenItem) => `left: ${entry.Left}, top: ${entry.Top}, width: ${entry.Width}, height: ${entry.Height}`;
const script = (entry: ScreenItem) => {
  const handlers = entry.EventHandlers ? (Array.isArray(entry.EventHandlers) ? entry.EventHandlers : [entry.EventHandlers]) : [];
  return handlers.map((handler) => handler.Script?.ScriptCode ?? "").join("\n");
};

const motorJson = readScreen("2000_Settings/2081_Motor_Speed/2081_Motor_Speed_1.json");
const motorGenerated = standardPageSource({
  componentName: "MotorSpeedPage",
  title: "Motor Speed",
  plan: planPageNumber("settings", [])!,
  templateId: "motor-speed",
});

const specialJson = readScreen("1000_Main/1081_Special_Function/1081_Special.json");
const specialGenerated = standardPageSource({
  componentName: "SpecialFunctionPage",
  title: "Machine Special Functions",
  plan: planPageNumber("main", [])!,
  templateId: "special-function",
});

describe("2081 Motor Speed ricavata dal JSON WinCC", () => {
  it("mantiene pannelli e screen della parte macchina alle coordinate esportate", () => {
    for (const name of ["recContentboard2_3", "Text box_5", "recContentboard2_7", "Graphic view_1"]) {
      expect(motorGenerated, name).toContain(geometry(item(motorJson, name)));
    }
    const graphic = item(motorJson, "Graphic view_1");
    expect(motorGenerated).toContain(`data-hmi-graphic="${graphic.Graphic}"`);
    expect(motorGenerated).toContain('data-framecraft-slot="machine-part-screen"');
    expect(motorGenerated).toContain('data-framecraft-next="add-machine-callouts"');
    expect(motorGenerated).toContain("aggiungi targhette motore e linee di richiamo");
  });

  it("non copia linee, targhette, popup o tag della macchina campione", () => {
    const sampleScripts = motorJson.ScreenItems.filter((entry) => entry.Name.startsWith("btnNok_")).map(script).join("\n");
    const sampleMotors = [...new Set(sampleScripts.match(/M\d{4}/g) ?? [])];
    expect(sampleMotors).toEqual(["M2380", "M2410", "M2400", "M2390", "M2020", "M2890"]);
    for (const motor of sampleMotors) expect(motorGenerated).not.toContain(motor);
    expect(motorGenerated).not.toContain('data-hmi-type="HmiLine"');
    expect(motorGenerated).not.toContain("Setting Motor_V_0_0_12");
  });

  it("conserva area touch e destinazioni swipe reali", () => {
    const touch = item(motorJson, "Touch area_1");
    expect(script(touch)).toContain('ChangeScreen("2041_Encoders_Main"');
    expect(script(touch)).toContain('ChangeScreen("2121_RobotFunction"');
    expect(motorGenerated).toContain(geometry(touch));
    expect(motorGenerated).toContain('data-hmi-swipe-right="2041_Encoders_Main"');
    expect(motorGenerated).toContain('data-hmi-swipe-left="2121_RobotFunction"');
  });
});

describe("1081 Special Function ricavata dal JSON WinCC", () => {
  it("mantiene le sette righe configurabili nelle posizioni esportate", () => {
    expect(specialGenerated).toContain(geometry(item(specialJson, "recContentboard2_2")));
    expect(specialGenerated).toContain(geometry(item(specialJson, "Text box_1")));
    const rows = specialJson.ScreenItems
      .filter((entry) => entry._type === "HmiRectangle" && entry.Left === 20 && entry.Width === 403 && entry.Height === 75)
      .sort((left, right) => (left.Top ?? 0) - (right.Top ?? 0));
    expect(rows.map((row) => row.Top)).toEqual([60, 138, 216, 294, 372, 450, 528]);
    expect(specialGenerated.match(/data-framecraft-slot="special-function-row"/g)).toHaveLength(7);
    expect(specialGenerated.match(/data-framecraft-next="configure-special-function"/g)).toHaveLength(7);
    for (const row of rows) expect(specialGenerated).toContain(geometry(row));
  });

  it("mantiene il pannello e lo screen macchina, ma non i contenuti del campione", () => {
    const board = item(specialJson, "recContentboard2_7");
    const graphic = item(specialJson, "Graphic view_3");
    expect(specialGenerated).toContain(geometry(board));
    expect(specialGenerated).toContain(geometry(graphic));
    expect(specialGenerated).toContain(`data-hmi-graphic="${graphic.Graphic}"`);
    expect(specialGenerated).toContain('data-framecraft-slot="machine-part-screen"');
    expect(specialGenerated).toContain('data-framecraft-next="add-machine-zones"');
    expect(specialGenerated).not.toContain("AAAAAAA");
    expect(specialGenerated).not.toContain("M3031");
    expect(specialGenerated).not.toContain('data-plc-variable="Bool"');
    expect(specialGenerated).not.toContain('data-hmi-type="HmiPolygon"');
  });

  it("conserva area touch e destinazioni swipe reali", () => {
    const touch = item(specialJson, "Touch area_1");
    expect(script(touch)).toContain('ChangeScreen("1041_Counters"');
    expect(script(touch)).toContain('ChangeScreen("1121_Collector_Counters"');
    expect(specialGenerated).toContain(geometry(touch));
    expect(specialGenerated).toContain('data-hmi-swipe-right="1041_Counters"');
    expect(specialGenerated).toContain('data-hmi-swipe-left="1121_Collector_Counters"');
  });
});
