import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { componentRegistry } from "../src/components/registry";
import { standardPageTemplates } from "../src/core/hmiPageTemplates";
import { planPageNumber, standardPageSource } from "../src/core/hmiPages";
import { hmiObjectShapes } from "../src/core/hmiObjects";
import { hmiPopupShapes } from "../src/core/hmiPopups";
import { hmiShellShapes } from "../src/core/hmiShells";
import { standardScreenCoverage, standardShellComponentTypes } from "../src/core/hmiTemplateCoverage";

interface StandardIndex {
  panels: Array<{ screens: Array<{ name: string; group: string }> }>;
}

interface ScreenColumn {
  Width: number;
  Visible: boolean;
}

interface ScreenItem {
  _type: string;
  Width?: number;
  Height?: number;
  Radius?: number;
  RadiusX?: number;
  RadiusY?: number;
  AlarmView?: { Columns?: ScreenColumn[] };
  AlarmStatisticsView?: { Columns?: ScreenColumn[] };
}

interface ScreenJson {
  Width: number;
  Height: number;
  ScreenItems: ScreenItem[];
}

const standard = JSON.parse(readFileSync(new URL("../standard/index.json", import.meta.url), "utf8")) as StandardIndex;
const screens = standard.panels.flatMap((panel) => panel.screens);

describe("copertura del progetto HMI standard", () => {
  it("classifica tutte le 160 schermate esportate", () => {
    expect(screens).toHaveLength(160);
    const missing = screens.filter((screen) => !standardScreenCoverage(screen.name, screen.group));
    expect(missing).toEqual([]);
  });

  it("ogni pagina classificata punta a un template realmente disponibile", () => {
    const available = new Set(standardPageTemplates.map((template) => template.id));
    const missing = screens.flatMap((screen) => {
      const coverage = standardScreenCoverage(screen.name, screen.group);
      return coverage?.kind === "page" && (!coverage.templateId || !available.has(coverage.templateId)) ? [screen.name] : [];
    });
    expect(missing).toEqual([]);
  });

  it("inserisce nello standard ogni sessione Program Modification col proprio template", () => {
    const alternatives = standardPageTemplates.filter((template) => /^program-(classic|nemo|sweep|pouches)-/.test(template.id));
    expect(alternatives).toHaveLength(18);
    for (const template of alternatives) {
      const screen = screens.find((item) => item.name === template.sourceScreen)!;
      expect(standardScreenCoverage(screen.name, screen.group)?.templateId, screen.name).toBe(template.id);
    }

    expect(standardScreenCoverage("2002_Robot_Program_Modification_2", "2000_Settings/2001_Program Modification/01_Robot")?.templateId).toBe("program-layer");
    expect(standardScreenCoverage("2003_Robot_Program_Modification_3", "2000_Settings/2001_Program Modification/01_Robot")?.templateId).toBe("program-pallet");
    expect(standardScreenCoverage("2008_Robot_Program_Modification_8", "2000_Settings/2001_Program Modification/01_Robot")?.templateId).toBe("program-squaring");
  });

  it("ogni template dichiara una schermata sorgente che esiste davvero nell'export", () => {
    const names = new Set(screens.map((screen) => screen.name));
    expect(standardPageTemplates.filter((template) => !names.has(template.sourceScreen))).toEqual([]);
  });

  it("i tag PLC dei nuovi Program Settings esistono nei JSON della rispettiva sessione", () => {
    const programTemplates = standardPageTemplates.filter((template) => template.id.startsWith("program-classic-") || template.id.startsWith("program-nemo-") || template.id.startsWith("program-sweep-") || template.id.startsWith("program-pouches-"));
    const missing: string[] = [];
    for (const template of programTemplates) {
      const screen = screens.find((item) => item.name === template.sourceScreen)!;
      const json = readFileSync(new URL(`../standard/screens/${screen.group}/${screen.name}.json`, import.meta.url), "utf8");
      const source = standardPageSource({ componentName: "GeneratedPage", title: template.name, plan: planPageNumber("settings", [])!, templateId: template.id });
      const variables = [...source.matchAll(/data-plc-variable="([^"]+)"/g)].map((match) => match[1]);
      expect(variables.length, template.id).toBeGreaterThan(0);
      for (const variable of variables) if (!json.includes(variable)) missing.push(`${template.id}: ${variable}`);
    }
    expect(missing).toEqual([]);
  });

  it("copre il blocco CLV con tredici forme, una per schermata", () => {
    const clv = screens.filter((screen) => screen.group.includes("2281_CLV_User"));
    expect(clv).toHaveLength(13);
    const covered = clv.map((screen) => standardScreenCoverage(screen.name, screen.group)?.templateId);
    expect(covered).toEqual([...new Set(covered)]);
    expect(covered).not.toContain(undefined);
    expect(standardScreenCoverage("2281_CLV_User_Main", "2000_Settings/2281_CLV_User")?.templateId).toBe("clv-index");
    expect(standardScreenCoverage("2291_CLV_User_PadStore_Centering", "2000_Settings/2281_CLV_User")?.templateId).toBe("clv-padstore");
  });

  it("i tag PLC delle pagine CLV esistono nei JSON delle rispettive schermate", () => {
    const clvTemplates = standardPageTemplates.filter((template) => template.id.startsWith("clv-") && template.id !== "clv-index");
    const missing: string[] = [];
    for (const template of clvTemplates) {
      const screen = screens.find((item) => item.name === template.sourceScreen)!;
      const json = readFileSync(new URL(`../standard/screens/${screen.group}/${screen.name}.json`, import.meta.url), "utf8");
      const source = standardPageSource({ componentName: "GeneratedPage", title: template.name, plan: planPageNumber("settings", [])!, templateId: template.id });
      const variables = [...source.matchAll(/data-plc-variable="([^"]+)"/g)].map((match) => match[1]).filter((name) => name !== "Folder_Vis");
      expect(variables.length, template.id).toBeGreaterThan(0);
      for (const variable of variables) if (!json.includes(variable)) missing.push(`${template.id}: ${variable}`);
    }
    expect(missing).toEqual([]);
  });

  it("i cinque popup hanno la misura e i tag della loro schermata", () => {
    expect(hmiPopupShapes).toHaveLength(5);
    for (const shape of hmiPopupShapes) {
      const screen = screens.find((item) => item.name === shape.sourceScreen)!;
      const json = JSON.parse(readFileSync(new URL(`../standard/screens/${screen.group}/${screen.name}.json`, import.meta.url), "utf8"));
      // La misura non e' inventata: e' quella della schermata popup nell'export.
      expect({ width: json.Width, height: json.Height }, shape.sourceScreen).toEqual({ width: shape.width, height: shape.height });

      const jsx = componentRegistry.get(shape.type)!.createJsx();
      expect(jsx, shape.type).toContain(`width: ${shape.width}`);
      const raw = readFileSync(new URL(`../standard/screens/${screen.group}/${screen.name}.json`, import.meta.url), "utf8");
      const variables = [...jsx.matchAll(/data-plc-variable="([^"]+)"/g)].map((match) => match[1]);
      expect(variables.filter((variable) => !raw.includes(variable)), shape.type).toEqual([]);
    }
    // Il popup dei comandi zona e' quello con dentro qualcosa: i cinque tag dello script.
    const control = componentRegistry.get("hmi-control-popup")!.createJsx();
    for (const tag of ["PV_Control_Panel_Start_PB", "PV_Control_Panel_Stop_PB", "PV_Control_Panel_Reset_PB", "PV_Control_Panel_Forward_PB", "PV_Control_Panel_Backward_PB", "PV_Control_Panel_Selector_Switch"]) {
      expect(control, tag).toContain(tag);
    }
  });

  it("gli undici pezzi del guscio hanno la misura e i tag della loro schermata", () => {
    expect(hmiShellShapes).toHaveLength(11);
    for (const shape of hmiShellShapes) {
      const screen = screens.find((item) => item.name === shape.sourceScreen)!;
      const path = new URL(`../standard/screens/${screen.group ? `${screen.group}/` : ""}${screen.name}.json`, import.meta.url);
      const raw = readFileSync(path, "utf8");
      const json = JSON.parse(raw);
      // La misura e' quella della schermata del guscio, non una scelta di disegno.
      expect({ width: json.Width, height: json.Height }, shape.sourceScreen).toEqual({ width: shape.width, height: shape.height });

      const jsx = componentRegistry.get(shape.type)!.createJsx();
      expect(jsx, shape.type).toContain(`width: ${shape.width}`);
      const variables = [...jsx.matchAll(/data-plc-variable="([^"]+)"/g)].map((match) => match[1]);
      expect(variables.filter((variable) => !raw.includes(variable)), shape.type).toEqual([]);
      // Ogni schermata di destinazione scritta su un pulsante deve esistere davvero nell'export.
      const names = new Set(screens.map((item) => item.name));
      const targets = [...jsx.matchAll(/data-hmi-change-screen="([^"]+)"/g)].map((match) => match[1]);
      expect(targets.filter((target) => !names.has(target)), shape.type).toEqual([]);
    }

    // La barra laterale porta tutte e sette le sezioni, coi colori dello standard.
    const bar = componentRegistry.get("hmi-lateral-bar")!.createJsx();
    for (const section of ["Main", "Settings", "Alarms", "Statistics", "Manuals", "Diagnostic", "Formats"]) {
      expect(bar, section).toContain(`aria-label="${section}"`);
    }
    // La linguetta mobile apre il popup dei comandi zona: e' quello che fa nell'export.
    expect(componentRegistry.get("hmi-info-point")!.createJsx()).toContain("9001_Popup_Control_Panel");
  });

  it("i ventisei oggetti sciolti hanno la misura di un esemplare vero", () => {
    expect(hmiObjectShapes).toHaveLength(26);
    for (const shape of hmiObjectShapes) {
      const jsx = componentRegistry.get(shape.type)!.createJsx();
      expect(jsx, shape.type).toContain(`width: ${shape.width}`);
      expect(jsx, shape.type).toContain(`height: ${shape.height}`);
      // I pezzi di pagina non sono un oggetto solo: la loro misura sta nelle costanti dello standard.
      if (!shape.sourceScreen) continue;
      // Il DataGrid non e' un oggetto della schermata: e' una parte dentro il controllo allarmi, e
      // la sua prova sono le colonne, nel test qui sotto.
      if (shape.itemType === "HmiDataGridViewPart") continue;

      const screen = screens.find((item) => item.name === shape.sourceScreen)!;
      const json = JSON.parse(readFileSync(new URL(`../standard/screens/${screen.group ? `${screen.group}/` : ""}${screen.name}.json`, import.meta.url), "utf8")) as ScreenJson;
      const items = json.ScreenItems.filter((item) => item._type === shape.itemType);
      expect(items.length, shape.type).toBeGreaterThan(0);

      // Cerchio ed ellisse nel JSON non hanno lati ma raggi, e la linea e' alta zero: e' un filo.
      const fits = items.some((item) => {
        if (shape.itemType === "HmiCircle") return item.Radius! * 2 === shape.width;
        if (shape.itemType === "HmiEllipse") return item.RadiusX! * 2 === shape.width && item.RadiusY! * 2 === shape.height;
        if (shape.itemType === "HmiLine") {
          return item.Width === shape.width && (shape.type === "hmi-callout-line" ? item.Height === shape.height : item.Height === 0);
        }
        return item.Width === shape.width && item.Height === shape.height;
      });
      expect(fits, `${shape.type}: nessun ${shape.itemType} di ${shape.width}x${shape.height} in ${shape.sourceScreen}`).toBe(true);
    }
  });

  it("le griglie del controllo allarmi portano le colonne del JSON", () => {
    const screen = screens.find((item) => item.name === "3001_Alarms")!;
    const json = JSON.parse(readFileSync(new URL(`../standard/screens/${screen.group}/${screen.name}.json`, import.meta.url), "utf8")) as ScreenJson;
    const control = json.ScreenItems.find((item) => item._type === "HmiAlarmControl")!;
    const widths = (view: "AlarmView" | "AlarmStatisticsView") =>
      (control[view]!.Columns ?? []).filter((column) => column.Visible).map((column) => column.Width);

    // Sei colonne per gli allarmi, otto per le statistiche: non sono scelte, sono quelle accese.
    expect(widths("AlarmView")).toEqual([45, 50, 600, 85, 160, 200]);
    expect(widths("AlarmStatisticsView")).toEqual([40, 120, 100, 130, 160, 160, 200, 100]);

    // Le larghezze finiscono nelle colonne della griglia, nell'ordine del JSON.
    const columns = (widthList: number[]) => widthList.map((width) => `${width}px`).join(" ");
    expect(componentRegistry.get("hmi-alarm-control")!.createJsx()).toContain(columns(widths("AlarmView")));
    expect(componentRegistry.get("hmi-data-grid")!.createJsx()).toContain(columns(widths("AlarmStatisticsView")));
    // La griglia e' larga quanto le sue colonne accese.
    expect(widths("AlarmStatisticsView").reduce((sum, width) => sum + width, 0)).toBe(1010);
  });

  it("ogni guscio, menu e popup classificato è inseribile dalla palette", () => {
    expect(standardShellComponentTypes).toHaveLength(16);
    for (const type of standardShellComponentTypes) {
      const definition = componentRegistry.get(type);
      expect(definition, type).toBeDefined();
      expect(definition?.category).toBe("Standard HMI");
    }
  });

  it("distingue popup e gusci dalle normali pagine di contenuto", () => {
    expect(standardScreenCoverage("9001_Popup_Control_Panel", "9000_Various")?.kind).toBe("popup");
    expect(standardScreenCoverage("0000_Layout_PC", "")?.componentType).toBe("hmi-desktop-shell");
    expect(standardScreenCoverage("3041_Alarms_By_Zone", "3000_Alarms&Events/3041_Alarms_By_Zone")?.templateId).toBe("alarm-zone");
    expect(standardScreenCoverage("4001_Statistics", "4000_Statistics/4001_Statistics")?.templateId).toBe("statistics");
    expect(standardScreenCoverage("4041_Production", "4000_Statistics/4041_Advanced")?.templateId).toBe("statistics-production");
    expect(standardScreenCoverage("4081_Availability", "4000_Statistics/4081_Availability")?.templateId).toBe("statistics-availability");
    expect(standardScreenCoverage("5001_Manual_General", "5000_Manuals/5001_Manuals_General")?.templateId).toBe("machine-map");
    expect(standardScreenCoverage("5041_Infeed", "5000_Manuals/5041_Infeed")?.templateId).toBe("manual-infeed");
    expect(standardScreenCoverage("5081_Preforming", "5000_Manuals/5081_Preforming")?.templateId).toBe("manual-preforming");
    expect(standardScreenCoverage("5121_Layer_Pusher", "5000_Manuals/5121_Layer_Pusher")?.templateId).toBe("manual-layer-pusher");
    expect(standardScreenCoverage("5161_Lifter", "5000_Manuals/5161_Lifter")?.templateId).toBe("manual-lifter");
    expect(standardScreenCoverage("5201_Tie_Sheet", "5000_Manuals/5201_Tie Sheet")?.templateId).toBe("manual-tie-sheet");
    expect(standardScreenCoverage("5241_PalletConveyor", "5000_Manuals/5241_PalletConveyor")?.templateId).toBe("manual-pallet-conveyor");
    expect(standardScreenCoverage("6001_Synoptic", "6000_Diagnostic/6001_Synoptic")?.templateId).toBe("synoptic");
    expect(standardScreenCoverage("6041_Robot", "6000_Diagnostic/6041_Robot")?.templateId).toBe("diagnostic-robot");
    expect(standardScreenCoverage("6081_Diagnostic_By_Zone", "6000_Diagnostic/6081_Diagnostic_By_Zone")?.templateId).toBe("diagnostic-zone");
    expect(standardScreenCoverage("6121_Diagnostic_By_Device", "6000_Diagnostic/6121_Diagnostic_By_Device")?.templateId).toBe("device-diagnostic");
    expect(standardScreenCoverage("6161_Preventive_Maintenance", "6000_Diagnostic/6161_Preventive_Maintenance")?.templateId).toBe("diagnostic-maintenance");
    expect(standardScreenCoverage("6201_Profinet", "6000_Diagnostic/6201_Profinet")?.templateId).toBe("diagnostic-profinet");
    expect(standardScreenCoverage("6241", "6000_Diagnostic/6241")?.templateId).toBe("diagnostic-free");
  });
});
