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
  Authorization?: string;
  EventHandlers?: EventHandler[];
  Dynamizations?: Dynamization[];
}
interface ScreenJson { ScreenItems: ScreenItem[] }

const json = JSON.parse(readFileSync(new URL("../standard/screens/2000_Settings/2241_System Function/2241_SystemFunction.json", import.meta.url), "utf8")) as ScreenJson;
const generated = standardPageSource({
  componentName: "SystemFunctionPage",
  title: "System Function",
  plan: planPageNumber("settings", [])!,
  templateId: "system-function",
});
const item = (name: string) => json.ScreenItems.find((entry) => entry.Name === name)!;
const script = (entry: ScreenItem) => (entry.EventHandlers ?? []).map((event) => event.Script?.ScriptCode ?? "").join("\n");

describe("2241 System Function ricavata dal JSON WinCC", () => {
  it("mantiene le cinque lingue, l'ordine e i codici SetLanguage", () => {
    const buttons = ["Button_11", "Button_2", "Button_3", "Button_4", "Button_5"].map(item);
    const labels = ["English US", "Italian", "German", "French", "Spanish"];

    for (const [index, button] of buttons.entries()) {
      const code = script(button).match(/SetLanguage\((\d+)\)/)?.[1];
      expect(code, button.Name).toBeTruthy();
      expect(generated).toContain(`data-hmi-language-code="${code}"`);
      expect(generated).toContain(`left: ${button.Left}, top: ${button.Top}, width: ${button.Width}, height: ${button.Height}`);
      expect(generated).toContain(`Imposta lingua ${labels[index]}`);
    }
    expect(generated.match(/data-hmi-action="set-language"/g)).toHaveLength(buttons.length);
    expect(generated).toContain('data-plc-variable="@CurrentLanguage"');
    expect(generated).toContain('setCurrentLanguage(1033); window.dispatchEvent(new CustomEvent("framecraft:set-language", { detail: "en-US" }))');
    expect(generated).toContain('data-hmi-language="it-IT"');
  });

  it("mantiene le cinque bandiere e le loro aree verticali", () => {
    const graphics = ["Graphic view_3", "Graphic view_1", "Graphic view_6", "Graphic view_5", "Graphic view_2"].map(item);
    const plates = ["Rectangle_7", "Rectangle_3", "Rectangle_4", "Rectangle_5", "Rectangle_6"].map(item);

    for (const graphic of graphics) expect(generated).toContain(`data-hmi-graphic="${graphic.Graphic}"`);
    for (const plate of plates) {
      expect(generated).toContain(`left: ${plate.Left}, top: ${plate.Top}, width: ${plate.Width}, height: ${plate.Height}`);
    }
  });

  it("espone i quattro comandi di sistema con evento e autorizzazione reali", () => {
    const actions = [
      ["btnNok_1", "stop-runtime", "StopRuntime"],
      ["Pulsante_8", "change-screen", "ChangeScreen"],
      ["Pulsante_1", "show-control-panel", "ShowControlPanel"],
      ["Pulsante_2", "logoff", "LogOff"],
    ] as const;

    for (const [name, action, scriptCall] of actions) {
      const button = item(name);
      expect(script(button), name).toContain(scriptCall);
      expect(generated).toContain(`data-hmi-action="${action}"`);
      expect(generated).toContain(`data-hmi-authorization="${button.Authorization}"`);
      expect(generated).toContain(`left: ${button.Left}, top: ${button.Top}, width: ${button.Width}, height: ${button.Height}`);
    }
    expect(generated).toContain('data-hmi-runtime-mode="hmiStopRuntime"');
    expect(generated).toContain('data-hmi-target-screen="0001_Choice"');
    expect(generated).toContain('data-plc-variable="PV_Enable_Session_PLC[Enable_Session_Index]" data-plc-value="0"');
  });

  it("conserva import, export utenti e logoff successivo", () => {
    const importButton = item("Pulsante_3");
    const exportButton = item("Pulsante_4");
    expect(script(importButton)).toContain('ImportUserAdministration("/media/simatic/X61/fileutenti.udz"');
    expect(script(exportButton)).toContain('ExportUserAdministration("/media/simatic/X61/fileutenti"');
    expect(script(exportButton)).toContain("LogOff()");
    expect(generated).toContain('data-hmi-action="import-user-administration" data-hmi-user-file="/media/simatic/X61/fileutenti.udz"');
    expect(generated).toContain('data-hmi-action="export-user-administration" data-hmi-user-file="/media/simatic/X61/fileutenti" data-hmi-after-action="logoff"');
    expect(generated).toContain(`left: ${importButton.Left}, top: ${importButton.Top}, width: ${importButton.Width}, height: ${importButton.Height}`);
    expect(generated).toContain(`left: ${exportButton.Left}, top: ${exportButton.Top}, width: ${exportButton.Width}, height: ${exportButton.Height}`);
  });

  it("mantiene lo swipe mobile verso la guida MMC", () => {
    const touch = item("Touch area_1");
    expect(script(touch)).toContain('ChangeScreen("2201_MMC_Guide"');
    expect(generated).toContain('data-hmi-swipe-right="2201_MMC_Guide"');
    expect(generated).toContain(`left: ${touch.Left}, top: ${touch.Top}, width: ${touch.Width}, height: ${touch.Height}`);
  });
});
