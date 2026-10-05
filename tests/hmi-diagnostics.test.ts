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
  X1?: number;
  X2?: number;
  Y1?: number;
  Y2?: number;
  Points?: Point[];
  EventHandlers?: Array<{ EventType?: string; Script?: { ScriptCode?: string } }>;
  Dynamizations?: Array<{ PropertyName?: string; Tag?: string }>;
}

interface ScreenJson { ScreenItems: ScreenItem[] }

const load = (path: string): ScreenJson => JSON.parse(readFileSync(new URL(`../standard/screens/6000_Diagnostic/${path}`, import.meta.url), "utf8")) as ScreenJson;
const source = (id: StandardPageTemplateId, title = "DIAGNOSTIC") => standardPageSource({
  componentName: "DiagnosticPage",
  title,
  plan: planPageNumber("diagnostic", [])!,
  templateId: id,
});
const scripts = (item: ScreenItem) => (item.EventHandlers ?? []).map((event) => event.Script?.ScriptCode ?? "").join("\n");
const tag = (item: ScreenItem, property: string) => item.Dynamizations?.find((item) => item.PropertyName === property)?.Tag;

describe("template Diagnostic ricavati dai JSON WinCC", () => {
  it("6001 conserva screen ed ellissi e lascia all'utente le targhette Tracking", () => {
    const json = load("6001_Synoptic/6001_Synoptic.json");
    const generated = source("synoptic", "SYNOPTIC - Pallet Conveyor");
    const graphic = json.ScreenItems.find((item) => item._type === "HmiGraphicView")!;
    const ellipses = json.ScreenItems.filter((item) => item._type === "HmiEllipse");

    expect(generated).toContain(`data-hmi-graphic="${graphic.Graphic}"`);
    expect(generated).toContain(`left: ${graphic.Left}, top: ${graphic.Top}, width: ${graphic.Width}, height: ${graphic.Height}`);
    for (const item of ellipses) {
      expect(generated).toContain(`left: ${item.CenterX! - item.RadiusX!}, top: ${item.CenterY! - item.RadiusY!}, width: ${item.RadiusX! * 2}, height: ${item.RadiusY! * 2}`);
      expect(generated).toContain(`transform: "rotate(${item.RotationAngle}deg)"`);
    }
    expect(generated).toContain('data-framecraft-slot="machine-part-screen"');
    expect(generated).toContain('data-framecraft-next="add-machine-callouts"');
    expect(generated).not.toContain('data-hmi-popup-faceplate="Tracking_V_0_0_8"');
    expect(generated).not.toMatch(/M(?:2400|2390|2380|2020|2890)/);
    expect(generated).toContain('data-hmi-swipe-left="6041_Robot"');
  });

  it("6081 conserva Main_1, le tre zone allarme e i tre cambi pagina", () => {
    const json = load("6081_Diagnostic_By_Zone/6081_Diagnostic_By_Zone.json");
    const generated = source("diagnostic-zone");
    const graphic = json.ScreenItems.find((item) => item._type === "HmiGraphicView")!;
    const polygons = json.ScreenItems.filter((item) => item._type === "HmiPolygon");
    const buttons = json.ScreenItems.filter((item) => item.Graphic === "Info_Logo_White");

    expect(generated).toContain(`data-hmi-graphic="${graphic.Graphic}"`);
    expect(generated).toContain(`left: ${graphic.Left}, top: ${graphic.Top}, width: ${graphic.Width}, height: ${graphic.Height}`);
    expect(generated).toContain('data-plc-variable="Alarms_Trigger[65]"');
    expect(generated.match(/onDoubleClick=\{\(\) => openPage\("\/diagnostic\/by-device"\)\}/g)).toHaveLength(buttons.length);
    for (const polygon of polygons) {
      const points = polygon.Points!.map((point) => `${point.X},${point.Y}`).join(" ");
      expect(generated).toContain(`left: ${polygon.Left}, top: ${polygon.Top}, width: ${polygon.Width}, height: ${polygon.Height}`);
      expect(generated).toContain(`points="${points}"`);
      expect(generated).toContain(`data-hmi-visible-tag="${tag(polygon, "Visible")}"`);
      expect(tag(polygon, "Opacity")).toBe("Clock_1Hz");
    }
    for (const button of buttons) {
      expect(generated).toContain(`left: ${button.Left}, top: ${button.Top}, width: ${button.Width}, height: ${button.Height}`);
      expect(generated).toContain(`data-hmi-visible-tag="${tag(button, "Visible")}"`);
      expect(scripts(button)).toContain('ChangeScreen("6121_Diagnostic_By_Device"');
    }
    expect(generated).toContain('data-hmi-swipe-right="6041_Robot" data-hmi-swipe-left="6121_Diagnostic_By_Device"');
  });

  it("6121 conserva lo screen Motor_Speed e lascia all'utente i dispositivi reali", () => {
    const json = load("6121_Diagnostic_By_Device/6121_Diagnostic_By_Device.json");
    const generated = source("device-diagnostic");
    const graphic = json.ScreenItems.find((item) => item._type === "HmiGraphicView")!;
    const ellipse = json.ScreenItems.find((item) => item._type === "HmiEllipse")!;

    expect(generated).toContain(`data-hmi-graphic="${graphic.Graphic}"`);
    expect(generated).toContain(`left: ${graphic.Left}, top: ${graphic.Top}, width: ${graphic.Width}, height: ${graphic.Height}`);
    expect(generated).toContain(`left: ${ellipse.CenterX! - ellipse.RadiusX!}, top: ${ellipse.CenterY! - ellipse.RadiusY!}, width: ${ellipse.RadiusX! * 2}, height: ${ellipse.RadiusY! * 2}`);
    expect(generated).toContain('data-framecraft-slot="machine-part-screen"');
    expect(generated).toContain('data-framecraft-next="add-machine-callouts"');
    expect(generated).not.toContain("<line x1=");
    expect(generated).not.toContain('data-hmi-popup-screen="9002_Popup_Diag_By_Device"');
    expect(generated).not.toContain("Diagnostic_By_Device_DB_O_Data");
    expect(generated).toContain('data-hmi-swipe-right="6081_Diagnostic_By_Zone" data-hmi-swipe-left="6161_Preventive_Maintenance"');
  });

  it.each([
    ["diagnostic-robot", "6041_Robot/6041_Robot.json"],
    ["diagnostic-maintenance", "6161_Preventive_Maintenance/6161_Preventive_Maintenance.json"],
    ["diagnostic-profinet", "6201_Profinet/6201_Profinet.json"],
    ["diagnostic-free", "6241/6241.json"],
  ] as const)("%s resta vuota e conserva gli scorrimenti esportati", (templateId, path) => {
    const json = load(path);
    const generated = source(templateId);
    const touch = json.ScreenItems.find((item) => item._type === "HmiTouchArea")!;
    const activeScript = scripts(touch).split("\n").filter((line) => !line.trimStart().startsWith("//")).join("\n");
    const destinations = [...activeScript.matchAll(/ChangeScreen\("([^"]+)"/g)].map((match) => match[1]);

    expect(generated).toContain('data-hmi-type="HmiTouchArea"');
    expect(generated).not.toContain('data-hmi-type="HmiGraphicView"');
    expect(generated).not.toContain('background: "#FFFFFF"');
    for (const destination of destinations) expect(generated).toContain(destination);
    if (templateId === "diagnostic-free") expect(generated).toContain('background: "#FA6400"');
  });
});
