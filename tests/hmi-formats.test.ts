import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planPageNumber, standardPageSource, type StandardPageTemplateId } from "../src/core/hmiPages";

interface Point { X: number; Y: number }
interface ScreenItem {
  _type: string;
  Name: string;
  Graphic?: string;
  Left?: number;
  Top?: number;
  Width?: number;
  Height?: number;
  CenterX?: number;
  CenterY?: number;
  RadiusX?: number;
  RadiusY?: number;
  RotationAngle?: number;
  Points?: Point[];
  EventHandlers?: Array<{ Script?: { ScriptCode?: string } }>;
  Dynamizations?: Array<{ PropertyName?: string; Tag?: string }>;
}

interface ScreenJson { ScreenItems: ScreenItem[] }

const load = (path: string): ScreenJson => JSON.parse(readFileSync(new URL(`../standard/screens/7000_Formats/${path}`, import.meta.url), "utf8")) as ScreenJson;
const source = (id: StandardPageTemplateId) => standardPageSource({
  componentName: "FormatsPage",
  title: "FORMATS",
  plan: planPageNumber("formats", [])!,
  templateId: id,
});
const scripts = (item: ScreenItem) => (item.EventHandlers ?? []).map((event) => event.Script?.ScriptCode ?? "").join("\n");
const tag = (item: ScreenItem, property: string) => item.Dynamizations?.find((entry) => entry.PropertyName === property)?.Tag;

describe("template Formats ricavati dai JSON WinCC", () => {
  it("7001 conserva le tredici righe, i tag di selezione e i limiti del wizard", () => {
    const json = load("7001_Formats/Normal/7001_Formats_Normal.json");
    const generated = source("format-manager");
    const rows = json.ScreenItems.filter((item) => item._type === "HmiTextBox" && /^Text box_(?:[1-9]|1[0-3])$/.test(item.Name));
    const back = json.ScreenItems.find((item) => item.Name === "btnWizardBack")!;
    const next = json.ScreenItems.find((item) => item.Name === "btnWIzardNext")!;

    expect(rows).toHaveLength(13);
    expect(generated.match(/data-hmi-action="select-format"/g)).toHaveLength(rows.length);
    for (const row of rows) {
      expect(generated).toContain(`left: ${row.Left}, top: ${row.Top}, width: ${row.Width}, height: ${row.Height}`);
    }
    expect(generated).toContain('data-plc-variable="Line Selection"');
    expect(generated).toContain('data-plc-variable="Program_Selection_Session"');
    expect(generated).toContain('data-hmi-target-expression="Program_Selection_In_Use_L[Line Selection-1]"');
    expect(generated).toContain('data-plc-variable="Confirm_Change_Pressed" data-plc-write="pulse"');
    expect(scripts(back)).toContain("Value>0");
    expect(scripts(next)).toContain("Value<87");
    expect(generated).toContain('data-hmi-min="0"');
    expect(generated).toContain('data-hmi-max="87"');
    expect(generated).toContain('data-hmi-swipe-left="7041_Format_Copy_Normal"');
  });

  it("7041 conserva origine, destinazione, comando e stati della copia", () => {
    const json = load("7041_Formats_Copy/Normal/7041_Format_Copy_Normal.json");
    const generated = source("format-copy");
    const fields = json.ScreenItems.filter((item) => item._type === "HmiIOField");

    for (const field of fields) {
      const variable = tag(field, "ProcessValue");
      expect(variable, field.Name).toBeTruthy();
      expect(generated).toContain(`data-plc-variable="${variable}"`);
      expect(generated).toContain(`left: ${field.Left}, top: ${field.Top}, width: ${field.Width}, height: ${field.Height}`);
    }
    expect(generated).toContain('data-hmi-graphic="Arrow_Copy_1"');
    expect(generated).toContain('data-plc-variable="Program_Copy_Start_Copy" data-plc-write="pulse-bit-0"');
    expect(generated).toContain('data-hmi-progress-tag="Program_Copy_Copy_In_Progress"');
    expect(generated).toContain('data-hmi-opacity-tag="Program_Copy_Succesfully"');
    expect(generated).toContain('data-hmi-opacity-tag="Program_Copy_Error"');
    expect(generated).toContain('data-hmi-swipe-right="7001_Formats_Normal" data-hmi-swipe-left="7081_Pallet_Store_Selection"');
  });

  it("7081 conserva grafica, ombra, poligoni e i due tag pallet", () => {
    const json = load("7081_Pallet_Store_Selection/7081_Pallet_Store_Selection.json");
    const generated = source("pallet-selection");
    const graphic = json.ScreenItems.find((item) => item._type === "HmiGraphicView")!;
    const ellipse = json.ScreenItems.find((item) => item._type === "HmiEllipse")!;
    const polygons = json.ScreenItems.filter((item) => item._type === "HmiPolygon");
    const fields = json.ScreenItems.filter((item) => item._type === "HmiSymbolicIOField");

    expect(generated).toContain(`data-hmi-graphic="${graphic.Graphic}"`);
    expect(generated).toContain(`left: ${graphic.Left}, top: ${graphic.Top}, width: ${graphic.Width}, height: ${graphic.Height}`);
    expect(generated).toContain(`left: ${ellipse.CenterX! - ellipse.RadiusX!}, top: ${ellipse.CenterY! - ellipse.RadiusY!}, width: ${ellipse.RadiusX! * 2}, height: ${ellipse.RadiusY! * 2}`);
    expect(generated).toContain(`transform: "rotate(${ellipse.RotationAngle}deg)"`);
    for (const polygon of polygons) {
      expect(generated).toContain(`left: ${polygon.Left}, top: ${polygon.Top}, width: ${polygon.Width}, height: ${polygon.Height}`);
      expect(generated).toContain(`points="${polygon.Points!.map((point) => `${point.X},${point.Y}`).join(" ")}"`);
    }
    for (const field of fields) {
      expect(generated).toContain(`data-plc-variable="${tag(field, "ProcessValue")}"`);
      expect(generated).toContain(`left: ${field.Left}, top: ${field.Top}, width: ${field.Width}, height: ${field.Height}`);
    }
    expect(generated).toContain('data-hmi-resource-list="Pallet Type"');
    expect(generated).toContain('data-hmi-swipe-right="7041_Format_Copy_Normal"');
  });
});
