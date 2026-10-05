import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planPageNumber, standardPageSource, type StandardPageTemplateId } from "../src/core/hmiPages";

interface ScreenItem {
  _type: string;
  EventHandlers?: Array<{ Script?: { ScriptCode?: string } }>;
}

interface ScreenJson { ScreenItems: ScreenItem[] }

const pages = [
  ["machine-downstair", "1001_Machine_Control/1002_Downstair.json"],
  ["main-counters", "1041_Counters/01_Robot/1041_Counters.json"],
  ["main-collector-counters", "1121_Collector_Counters/1121_Collector_Counters.json"],
  ["main-free", "1161_/1161_.json"],
  ["main-maintenance", "1241_Maintenance/1241_Maintenace.json"],
] as const;

const load = (path: string): ScreenJson => JSON.parse(readFileSync(new URL(`../standard/screens/1000_Main/${path}`, import.meta.url), "utf8")) as ScreenJson;
const source = (templateId: StandardPageTemplateId) => standardPageSource({
  componentName: "MainPage",
  title: "MAIN",
  plan: planPageNumber("main", [])!,
  templateId,
});
const scripts = (item: ScreenItem) => (item.EventHandlers ?? []).map((event) => event.Script?.ScriptCode ?? "").join("\n");

describe("pagine Main vuote ricavate dai JSON WinCC", () => {
  it.each(pages)("%s resta vuota e conserva tutti gli swipe attivi", (templateId, path) => {
    const json = load(path);
    const generated = source(templateId);
    const touch = json.ScreenItems.find((item) => item._type === "HmiTouchArea")!;
    const activeScript = scripts(touch).split("\n").filter((line) => !line.trimStart().startsWith("//")).join("\n");
    const gestures = [...activeScript.matchAll(/HmiGesture\.(SwipeLeft|SwipeRight|SwipeUp|SwipeDown)[\s\S]*?ChangeScreen\("([^"]+)"/g)];

    expect(generated).toContain('data-hmi-type="HmiTouchArea"');
    expect(generated).not.toContain('data-hmi-type="HmiGraphicView"');
    expect(generated).not.toContain('background: "#FFFFFF"');
    for (const [, gesture, destination] of gestures) {
      const direction = gesture.replace("Swipe", "").toLocaleLowerCase("en");
      expect(generated).toContain(`data-hmi-swipe-${direction}="${destination}"`);
    }
  });

  it("non usa piu' il rendering Upstair per la 1002", () => {
    const downstair = source("machine-downstair");
    expect(downstair).toContain("base 1002_Downstair");
    expect(downstair).not.toContain('data-hmi-graphic="Main_1"');
    expect(downstair).toContain('data-hmi-swipe-down="1001_Upstair"');
  });
});
