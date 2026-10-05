import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planPageNumber, standardPageSource, type StandardPageTemplateId } from "../src/core/hmiPages";

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
  EventHandlers?: Array<{ Script?: { ScriptCode?: string } }>;
  Dynamizations?: Array<{ PropertyName?: string; Tag?: string }>;
}

interface ScreenJson {
  ScreenItems: ScreenItem[];
}

const stations = [
  ["manual-infeed", "5041_Infeed", "5000_Manuals/5041_Infeed/5041_Infeed.json"],
  ["manual-preforming", "5081_Preforming", "5000_Manuals/5081_Preforming/5081_Preforming.json"],
  ["manual-layer-pusher", "5121_Layer_Pusher", "5000_Manuals/5121_Layer_Pusher/5121_Layer_Pusher.json"],
  ["manual-lifter", "5161_Lifter", "5000_Manuals/5161_Lifter/5161_Lifter.json"],
  ["manual-tie-sheet", "5201_Tie_Sheet", "5000_Manuals/5201_Tie Sheet/5201_Tie_Sheet.json"],
  ["manual-pallet-conveyor", "5241_PalletConveyor", "5000_Manuals/5241_PalletConveyor/5241_PalletConveyor.json"],
] as const;

const load = (path: string): ScreenJson => JSON.parse(readFileSync(new URL(`../standard/screens/${path}`, import.meta.url), "utf8")) as ScreenJson;
const source = (id: StandardPageTemplateId) => standardPageSource({
  componentName: "ManualPage",
  title: "MANUAL",
  plan: planPageNumber("manuals", [])!,
  templateId: id,
});
const scripts = (item: ScreenItem) => (item.EventHandlers ?? []).map((event) => event.Script?.ScriptCode ?? "").join("\n");

describe("template Manuals ricavati dai JSON WinCC", () => {
  it.each(stations)("%s conserva screen, ellisse e swipe senza imporre i motori campione", (templateId, _screen, path) => {
    const json = load(path);
    const generated = source(templateId);
    const graphic = json.ScreenItems.find((item) => item._type === "HmiGraphicView")!;
    const ellipse = json.ScreenItems.find((item) => item._type === "HmiEllipse")!;
    const touch = json.ScreenItems.find((item) => item._type === "HmiTouchArea")!;

    expect(generated).toContain(`data-hmi-graphic="${graphic.Graphic}"`);
    expect(generated).toContain(`left: ${graphic.Left}, top: ${graphic.Top}, width: ${graphic.Width}, height: ${graphic.Height}`);
    expect(generated).toContain(`left: ${ellipse.CenterX! - ellipse.RadiusX!}, top: ${ellipse.CenterY! - ellipse.RadiusY!}, width: ${ellipse.RadiusX! * 2}, height: ${ellipse.RadiusY! * 2}`);
    expect(generated).toContain(`transform: "rotate(${ellipse.RotationAngle}deg)"`);
    expect(generated).toContain('data-framecraft-slot="machine-part-screen"');
    expect(generated).toContain('data-framecraft-next="add-machine-callouts"');
    expect(generated).not.toContain("<line x1=");
    expect(generated).not.toContain('data-hmi-action="select-manual"');
    expect(generated).not.toMatch(/>M\d{4}</);
    expect(generated).not.toMatch(/>YV\d+</);

    const destinations = [...scripts(touch).matchAll(/ChangeScreen\("([^"]+)"/g)].map((match) => match[1]);
    for (const destination of destinations) expect(generated).toContain(destination);
    expect(generated).toContain('data-hmi-visible-tag="Mobile_Layout_Active"');
  });

  it("5001 conserva la TopView, le sei aree, il poligono e i sette cambi pagina", () => {
    const json = load("5000_Manuals/5001_Manuals_General/5001_Manual_General.json");
    const generated = source("machine-map");
    const graphic = json.ScreenItems.find((item) => item._type === "HmiGraphicView")!;
    const rectangles = json.ScreenItems.filter((item) => item.Name.startsWith("Rettangolo_"));
    const polygon = json.ScreenItems.find((item) => item._type === "HmiPolygon")!;
    const infoButtons = json.ScreenItems.filter((item) => item.Graphic === "Info_Logo_White");

    expect(generated).toContain(`data-hmi-graphic="${graphic.Graphic}"`);
    expect(generated).toContain(`left: ${graphic.Left}, top: ${graphic.Top}, width: ${graphic.Width}, height: ${graphic.Height}`);
    for (const rectangle of rectangles) {
      expect(generated).toContain(`left: ${rectangle.Left}, top: ${rectangle.Top}, width: ${rectangle.Width}, height: ${rectangle.Height}`);
    }
    expect(generated).toContain(`left: ${polygon.Left}, top: ${polygon.Top}, width: ${polygon.Width}, height: ${polygon.Height}`);
    expect(generated.match(/onDoubleClick=\{\(\) => openPage\(/g) ?? []).toHaveLength(infoButtons.length);
    for (const button of infoButtons) {
      const destination = scripts(button).match(/ChangeScreen\("([^"]+)"/)?.[1];
      expect(destination, button.Name).toBeTruthy();
      expect(generated).toContain(`left: ${button.Left}, top: ${button.Top}, width: 75, height: 39`);
    }
  });
});
