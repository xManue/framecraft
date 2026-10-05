import { describe, expect, it } from "vitest";
import { parse } from "@babel/parser";
import { collectPageNumbers, describePageNumber, planPageNumber, standardPageSource, standardPageTemplates } from "../src/core/hmiPages";
import { manifestPageNumbers, manifestWithPageNumber, parsePanelManifest } from "../src/core/panelManifest";
import { menuSlotNumber, pageNumberParts } from "../src/core/hmiStandard";

describe("i numeri gia' presi", () => {
  it("legge il numero dall'attributo, in tutte e due le forme", () => {
    const jsx = `<section data-page-number={2041}/><div data-page-number="1001"/>`;
    expect(collectPageNumbers([jsx])).toEqual([1001, 2041]);
  });

  it("legge anche il pageNumber dei dati di un template", () => {
    expect(collectPageNumbers(["export const v = { pageNumber: 2042 };"])).toEqual([2042]);
  });

  it("scarta quello che non rispetta la regola", () => {
    // 2000 non e' un numero valido (le pagine partono da N001) e 8001 non e' una sezione.
    expect(collectPageNumbers([`<a data-page-number={2000}/><b data-page-number={8001}/>`])).toEqual([]);
  });

  it("non conta due volte lo stesso numero", () => {
    expect(collectPageNumbers([`<a data-page-number={1001}/>`, `<b data-page-number={1001}/>`])).toEqual([1001]);
  });
});

describe("il numero della prossima pagina", () => {
  it("apre la prima voce di menu libera della sezione", () => {
    expect(planPageNumber("settings", [])?.number).toBe(2001);
    expect(planPageNumber("settings", [2001])?.number).toBe(2041);
    expect(planPageNumber("settings", [2001, 2041, 2081])?.number).toBe(2121);
  });

  it("una sottopagina sta dentro la voce che le si indica", () => {
    const plan = planPageNumber("settings", [2041], { slot: 1 });
    expect(plan?.number).toBe(2042);
    expect(plan?.isMenuEntry).toBe(false);
    expect(pageNumberParts(plan!.number)?.menuNumber).toBe(2041);
  });

  it("dice che non si puo' quando la sezione e' piena", () => {
    const tutte = Array.from({ length: 14 }, (_, slot) => menuSlotNumber(2, slot));
    expect(planPageNumber("settings", tutte)).toBeUndefined();
  });

  it("una sezione che non esiste non produce numeri", () => {
    expect(planPageNumber("popup", [])).toBeUndefined();
  });

  it("racconta il numero a parole", () => {
    expect(describePageNumber(2041)).toContain("Settings");
    expect(describePageNumber(2042)).toContain("pagina 2");
  });
});

describe("il sorgente di una pagina nuova", () => {
  const plan = planPageNumber("settings", [])!;
  const source = standardPageSource({ componentName: "EncodersPage", title: "Encoders", plan });

  it("porta il numero sull'elemento e il tag del guscio", () => {
    expect(source).toContain("data-page-number={2001}");
    expect(source).toContain('data-hmi-tag="Actual_Page_Number"');
  });

  it("scrive nel commento le tre righe dell'onLoaded", () => {
    expect(source).toContain("SetTagValue(\"Actual_Page_Number\", 2001)");
    expect(source).toContain("PV_ActualPageNumber_For_PLC");
    expect(source).toContain("Folder_Vis");
  });

  it("usa le misure dello standard, non misure inventate", () => {
    expect(source).toContain("width: 1280");
    expect(source).toContain("height: 694");
    expect(source).toContain("width: 1214");
  });

  it("si rilegge da solo: il numero che scrive risulta preso", () => {
    expect(collectPageNumbers([source])).toEqual([2001]);
  });
});

describe("i template ricavati dalle schermate standard", () => {
  it("offre una famiglia per ogni forma di pagina vista nelle foto", () => {
    expect(standardPageTemplates.map((template) => template.id)).toEqual([
      "blank", "data-board", "machine-render", "machine-downstair", "main-counters", "main-collector-counters", "main-free", "main-maintenance", "special-function", "production-overview", "command-grid", "web-content",
      "program-modification", "program-layer", "program-pallet", "program-callouts", "program-infeed",
      "program-robot", "program-quotes", "program-squaring",
      "program-nemo-product", "program-nemo-squaring", "program-nemo-robot",
      "program-classic-product", "program-sweep-product", "program-classic-layer", "program-sweep-line",
      "program-classic-row", "program-classic-pallet", "program-classic-line", "program-classic-delays",
      "program-classic-centering", "program-classic-pre-squaring", "program-classic-post-squaring", "program-classic-padstore",
      "program-pouches-product", "program-pouches-robot", "program-pouches-tray",
      "encoder-index", "encoder-drawing", "encoder-settings", "motor-speed", "robot-function",
      "lubrification", "device-control", "motor-box-control", "motor-control", "system-function",
      "clv-index", "clv-fifo", "clv-centering", "clv-spacers", "clv-doser", "clv-grip",
      "clv-extra", "clv-preforming", "clv-languages", "clv-mmc", "clv-padstore", "clv-pallet-store",
      "clv-lines",
      "alarms", "alarm-zone", "alarm-history", "media",
      "statistics", "statistics-production", "statistics-availability",
      "machine-map", "manual-infeed", "manual-preforming", "manual-layer-pusher", "manual-lifter",
      "manual-tie-sheet", "manual-pallet-conveyor",
      "synoptic", "diagnostic-robot", "diagnostic-zone", "device-diagnostic",
      "diagnostic-maintenance", "diagnostic-profinet", "diagnostic-free",
      "format-manager", "format-copy", "pallet-selection",
    ]);
    expect(standardPageTemplates.find((template) => template.id === "alarms")?.sourceScreen).toBe("3001_Alarms");
    expect(standardPageTemplates.find((template) => template.id === "machine-map")?.recommendedSection).toBe("manuals");
    for (const template of standardPageTemplates) {
      expect(template.sourceScreen, template.id).toMatch(/^[0-9]{4}(?:_|$)/);
      if (template.visualStatus !== "missing") expect(template.referenceImage, template.id).toBeTruthy();
    }
  });

  it("genera sorgenti JSX validi per ogni base", () => {
    for (const template of standardPageTemplates) {
      const plan = planPageNumber(template.recommendedSection ?? "main", [])!;
      const source = standardPageSource({ componentName: "GeneratedPage", title: "Prova", plan, templateId: template.id });
      expect(() => parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }), template.id).not.toThrow();
      expect(source).toContain(`base ${template.sourceScreen}`);
      expect(source).toContain(`data-page-number={${plan.number}}`);
    }
  }, 30_000);

  it("disegna la pagina chiara dello standard, non un HMI scuro", () => {
    for (const template of standardPageTemplates) {
      const plan = planPageNumber(template.recommendedSection ?? "main", [])!;
      const source = standardPageSource({ componentName: "GeneratedPage", title: "Prova", plan, templateId: template.id });
      expect(source, template.id).toContain('background: "#CFCFCF"');
      expect(source, template.id).not.toContain('background: "#333333"');
      // Le targhette che l'utente aggiungera' sono scure; il fondo delle pagine resta chiaro.
      if (!template.id.startsWith("manual-") && template.id !== "synoptic") expect(source, template.id).not.toContain('background: "#48494E"');
      // Le viste macchina, i WebControl e la 1042 non hanno lastre bianche; l'indice encoder sta sul nero.
      if (!["blank", "machine-render", "machine-downstair", "main-counters", "main-collector-counters", "main-free", "main-maintenance", "encoder-index", "command-grid", "media", "statistics", "statistics-production", "statistics-availability", "machine-map", "diagnostic-robot", "diagnostic-zone", "device-diagnostic", "diagnostic-maintenance", "diagnostic-profinet", "diagnostic-free"].includes(template.id)) {
        expect(source, template.id).toContain('background: "#FFFFFF"');
      }
    }
  });

  it("mette il titolo dove lo mette la schermata vera, non in una barra sempre uguale", () => {
    const encoder = standardPageSource({ componentName: "EncoderPage", title: "ENCODER - Lifter", plan: planPageNumber("settings", [])!, templateId: "encoder-settings" });
    const program = standardPageSource({ componentName: "ProgramPage", title: "Programma", plan: planPageNumber("settings", [])!, templateId: "program-modification" });
    expect(encoder).toContain("ENCODER - Lifter");
    expect(program).toContain("PROGRAM NUMBER");
    expect(program).not.toContain(">Programma<");
  });

  it("usa i controlli misurati sulle foto", () => {
    const program = standardPageSource({ componentName: "ProgramPage", title: "Programma", plan: planPageNumber("settings", [])!, templateId: "program-modification" });
    const device = standardPageSource({ componentName: "DevicePage", title: "Infeed Guide", plan: planPageNumber("settings", [])!, templateId: "device-control" });
    expect(program).toContain('background: "#E00046"');
    expect(program).toContain('data-hmi-type="HmiSymbolicIOField"');
    expect(program).toContain('role="radio"');
    expect(program).toContain('data-hmi-type="HmiSwitch"');
    expect(device).toContain('background: "#AAE682"');
    expect(device).toContain("Positioned");
  });

  it("tara gli encoder con le righe compatte della pagina 2042", () => {
    const encoder = standardPageSource({ componentName: "EncoderPage", title: "Encoder", plan: planPageNumber("settings", [])!, templateId: "encoder-settings" });
    expect(encoder.match(/data-hmi-type="HmiIOField"/g)).toHaveLength(14);
    expect(encoder).toContain("General Setting");
    expect(encoder).toContain("Speed Settings");
    expect(encoder).toContain("Illustrative Image");
    expect(encoder).toContain("Homing");
    expect(encoder).toContain("Sostituisci con l'immagine della parte macchina");
  });

  it("tiene l'indice encoder sul nero, come nella schermata 2041", () => {
    const index = standardPageSource({ componentName: "EncoderIndex", title: "Encoders", plan: planPageNumber("settings", [])!, templateId: "encoder-index" });
    expect(index).toContain("radial-gradient");
    expect(index).toContain("#303030");
    expect(index).toContain('background: "#373737"');
    expect(index.match(/data-hmi-type="HmiButton"/g)).toHaveLength(18);
    expect(index).toContain("Pad Store Back Guide");
    expect(index).toContain("openPage");
  });

  it("elenca gli allarmi con la tabella a righe alterne", () => {
    const alarms = standardPageSource({ componentName: "AlarmsPage", title: "Alarms", plan: planPageNumber("alarms", [])!, templateId: "alarms" });
    const zone = standardPageSource({ componentName: "Zone", title: "Zona", plan: planPageNumber("alarms", [])!, templateId: "alarm-zone" });
    const history = standardPageSource({ componentName: "History", title: "Storico", plan: planPageNumber("alarms", [])!, templateId: "alarm-history" });
    const media = standardPageSource({ componentName: "Media", title: "Media", plan: planPageNumber("alarms", [])!, templateId: "media" });
    expect(alarms).toContain('data-hmi-type="HmiAlarmControl"');
    expect(alarms).toContain('background: "#F2F2F5"');
    expect(alarms).toContain("Troubleshooting");
    expect(alarms).toContain("Alarm class");
    expect(alarms).toContain('data-hmi-filter="AlarmClassName = \'Alarm_CTH\'"');
    expect(alarms).toContain('data-hmi-selection-tags="AlarmTextTroubleshooting,AlarmID"');
    expect(alarms).toContain('data-hmi-popup-screen="9003_PDF_Troubleshooting_NodeRed"');
    expect(alarms).toContain('data-plc-variable="Start_Copy" data-plc-write="set"');
    expect(alarms).not.toContain("FREE FOR MES M2530");
    expect(zone).toContain("Alarm By Zone");
    expect(zone).toContain('"Alarm class","width":709');
    expect(zone).not.toContain("EM - Name");
    expect(history).toContain("Alarm History");
    expect(history).not.toContain("Troubleshooting");
    expect(history).toContain('data-hmi-action="clear-alarm-log"');
    expect(history).toContain('data-hmi-filter="AlarmClassName = \'Alarm_History\'"');
    expect(history).toContain('data-hmi-alarm-log="Alarm_History_Log"');
    expect(media).toContain('data-hmi-type="HmiWebControl"');
    expect(media).toContain('data-hmi-url="https://10.14.1.228:1880/dashboard/filebrowser"');
    expect(media).not.toContain("Documenti e media");
  });

  it("riproduce i tre WebControl Statistics dai JSON", () => {
    const plan = planPageNumber("statistics", [])!;
    const statistics = standardPageSource({ componentName: "Statistics", title: "Statistics", plan, templateId: "statistics" });
    const production = standardPageSource({ componentName: "Production", title: "Production", plan, templateId: "statistics-production" });
    const availability = standardPageSource({ componentName: "Availability", title: "Availability", plan, templateId: "statistics-availability" });

    expect(statistics.match(/data-hmi-type="HmiWebControl"/g)).toHaveLength(2);
    expect(statistics).toContain('data-hmi-url="https://10.14.1.228:1880/dashboard/statisticbase"');
    expect(statistics).toContain('data-hmi-url="https://10.14.1.228:1880/ui/#!/1?socketid=lG6bDa8Tb441kGTJAAAE"');
    expect(statistics).toContain('left: 41, top: 143, width: 743, height: 360');
    expect(statistics).toContain('data-plc-variable="Alarms_Trigger[65]"');
    expect(statistics).toContain('data-hmi-swipe-left="4041_Production"');
    expect(statistics).not.toContain("Statistics</div>");

    expect(production).toContain('left: 21, top: 8, width: 1187, height: 681');
    expect(production).toContain('data-hmi-url="https://10.14.1.228:1880/dashboard/pageN"');
    expect(production).toContain('data-hmi-swipe-right="4001_Statistics" data-hmi-swipe-left="4081_Availability"');
    expect(availability).toContain('data-hmi-url="https://10.14.1.228:1880/dashboard/Availabilty"');
    expect(availability).toContain('data-hmi-swipe-right="4041_Production"');
    expect(production).not.toContain("Contenuto caricato dal controllo a runtime");
    expect(availability).not.toContain("Contenuto caricato dal controllo a runtime");
  });

  it("lascia sostituibili le immagini di macchina e apre le pagine con il doppio click", () => {
    const map = standardPageSource({ componentName: "MapPage", title: "Manual", plan: planPageNumber("manuals", [])!, templateId: "machine-map" });
    const render = standardPageSource({ componentName: "LinePage", title: "Upstair", plan: planPageNumber("main", [])!, templateId: "machine-render" });
    expect(map).toContain('<img data-hmi-type="HmiGraphicView"');
    expect(map).toContain('src="/placeholder.svg"');
    // La zona porta al manuale della sua stazione, come lo `ChangeScreen` della 5001.
    expect(map).toContain('onDoubleClick={() => openPage("/manuals/infeed")}');
    expect(render).toContain("Sostituisci con il rendering della linea");
    expect(render).not.toContain("openPage");
  });

  it("riproduce la mappa e prepara le sei stazioni per screen e targhette dell'utente", () => {
    const plan = planPageNumber("manuals", [])!;
    const source = (templateId: "machine-map" | "manual-infeed" | "manual-preforming" | "manual-layer-pusher" | "manual-lifter" | "manual-tie-sheet" | "manual-pallet-conveyor") =>
      standardPageSource({ componentName: "ManualPage", title: "MANUAL", plan, templateId });
    const map = source("machine-map");
    const infeed = source("manual-infeed");
    const preforming = source("manual-preforming");
    const layer = source("manual-layer-pusher");
    const lifter = source("manual-lifter");
    const tieSheet = source("manual-tie-sheet");
    const conveyors = source("manual-pallet-conveyor");

    expect(map).toContain('data-hmi-graphic="Manual_TopView"');
    expect(map).toContain('left: 42, top: 14, width: 1132, height: 658');
    expect(map).toContain('data-plc-variable="Alarms_Trigger[65]"');
    expect(map.match(/onDoubleClick=\{\(\) => openPage\(/g)).toHaveLength(7);
    expect(map).toContain('points="108,500 238,501 238,0 0,0 0,110 112,110"');
    expect(map).toContain('data-hmi-swipe-left="5041_Infeed"');

    expect(infeed).toContain('data-hmi-graphic="Manual_Infeed"');
    expect(infeed).toContain('data-framecraft-slot="machine-part-screen"');
    expect(infeed).toContain('data-framecraft-next="add-machine-callouts"');
    expect(infeed).toContain('data-hmi-swipe-right="5001_Manual_General" data-hmi-swipe-left="5081_Preforming"');
    expect(preforming).toContain('left: 209, top: 64, width: 713, height: 588');

    for (const station of [infeed, preforming, layer, lifter, tieSheet, conveyors]) {
      expect(station).toContain('data-framecraft-slot="machine-part-screen"');
      expect(station).not.toContain('data-hmi-action="select-manual"');
      expect(station).not.toMatch(/>M\d{4}</);
      expect(station).not.toMatch(/>YV\d+</);
    }
    expect(conveyors).toContain('data-hmi-swipe-right="5201_Tie_Sheet"');
    expect(conveyors).not.toContain('data-hmi-swipe-left=');
  });

  it("copre anche le famiglie che nelle foto mostrano solo la lastra", () => {
    const dataBoard = standardPageSource({ componentName: "BoardPage", title: "Production", plan: planPageNumber("statistics", [])!, templateId: "data-board" });
    const commands = standardPageSource({ componentName: "Commands", title: "Comandi", plan: planPageNumber("main", [])!, templateId: "command-grid" });
    expect(dataBoard).toContain('aria-label="Contenuto caricato dal controllo a runtime"');
    // La 1042 nella foto e' vuota: le sue dieci linguette scelgono il robot, il resto lo porta il popup.
    expect(commands.match(/data-hmi-type="HmiButton"/g)).toHaveLength(10);
    expect(commands).not.toContain("Comando 10");
  });

  it("genera anche le famiglie operative rimaste nello standard", () => {
    const settingsPlan = planPageNumber("settings", [])!;
    const formatsPlan = planPageNumber("formats", [])!;
    const robot = standardPageSource({ componentName: "RobotPage", title: "Robot", plan: settingsPlan, templateId: "robot-function" });
    const lubrification = standardPageSource({ componentName: "LubePage", title: "Lubrificazione", plan: settingsPlan, templateId: "lubrification" });
    const motorBox = standardPageSource({ componentName: "MotorBoxPage", title: "Motor box", plan: settingsPlan, templateId: "motor-box-control" });
    const motor = standardPageSource({ componentName: "MotorPage", title: "Motore", plan: settingsPlan, templateId: "motor-control" });
    const system = standardPageSource({ componentName: "SystemPage", title: "Sistema", plan: settingsPlan, templateId: "system-function" });
    const formats = standardPageSource({ componentName: "FormatsPage", title: "Formati", plan: formatsPlan, templateId: "format-manager" });
    const manual = standardPageSource({ componentName: "ManualPage", title: "Manuale", plan: planPageNumber("manuals", [])!, templateId: "manual-infeed" });
    const motorSpeed = standardPageSource({ componentName: "MotorSpeedPage", title: "Motor Speed", plan: settingsPlan, templateId: "motor-speed" });
    const special = standardPageSource({ componentName: "SpecialFunctionPage", title: "Machine Special Functions", plan: planPageNumber("main", [])!, templateId: "special-function" });
    expect(robot).toContain("Robot 1 Function");
    expect(robot).toContain("Maintenance Position");
    expect(lubrification).toContain("Lubrication Status");
    expect(lubrification).toContain("Test Lubrication");
    expect(motorBox).toContain('data-hmi-action="select-mmc-motor"');
    expect(motorBox).toContain('data-hmi-graphic="Ciabatta Infeed Guide"');
    expect(motor).toContain("screen del motore della macchina");
    expect(system).toContain("English US");
    expect(system).toContain("Spanish");
    expect(system).toContain('data-hmi-action="set-language"');
    expect(system).toContain('data-hmi-action="stop-runtime"');
    // Nell'export la lista della 7001 ha tredici righe da 40, da 81 a 573.
    expect(formats.match(/<button type="button" data-hmi-type="HmiTextBox"/g)).toHaveLength(13);
    expect(formats).toContain('data-hmi-type="HmiSymbolicIOField"');
    expect(formats).toContain("Available formats");
    expect(manual).toContain('data-hmi-graphic="Manual_Infeed"');
    expect(motorSpeed).toContain('data-hmi-graphic="Motor_Speed"');
    expect(motorSpeed).toContain('left: 421, top: 131, width: 559, height: 447');
    expect(motorSpeed).toContain('data-framecraft-next="add-machine-callouts"');
    expect(motorSpeed).not.toMatch(/>M\d{4}</);
    expect(motorSpeed).not.toContain('data-hmi-type="HmiLine"');
    expect(special.match(/data-framecraft-slot="special-function-row"/g)).toHaveLength(7);
    expect(special).toContain('data-hmi-graphic="PBP1 - Main"');
    expect(special).toContain('data-framecraft-next="add-machine-zones"');
    expect(special).not.toContain("M3031");
    expect(special).not.toContain('data-hmi-type="HmiPolygon"');
  });
});

describe("il numero scritto nel panel.json", () => {
  const manifest = JSON.stringify({
    id: "prova",
    editor: { version: 1, pages: [{ id: "settings", locked: true, affordances: [] }] },
  }, undefined, 2);

  it("aggiunge il numero alla pagina che c'e' gia'", () => {
    const next = manifestWithPageNumber(manifest, { id: "settings", pageNumber: 2001, section: "settings" })!;
    const page = JSON.parse(next).editor.pages[0];
    expect(page.pageNumber).toBe(2001);
    expect(page.section).toBe("settings");
    expect(page.locked).toBe(true);
  });

  it("aggiunge la pagina se non c'era", () => {
    const next = manifestWithPageNumber(manifest, { id: "nuova", name: "Nuova", pageNumber: 2041 })!;
    const pages = JSON.parse(next).editor.pages;
    expect(pages).toHaveLength(2);
    expect(pages[1]).toMatchObject({ id: "nuova", name: "Nuova", pageNumber: 2041, locked: false });
  });

  it("non tocca il resto del manifesto", () => {
    const next = manifestWithPageNumber(manifest, { id: "settings", pageNumber: 2001 })!;
    expect(JSON.parse(next).id).toBe("prova");
    expect(JSON.parse(next).editor.version).toBe(1);
  });

  it("non riscrive un file che direbbe la stessa cosa", () => {
    const next = manifestWithPageNumber(manifest, { id: "settings", pageNumber: 2001 })!;
    expect(manifestWithPageNumber(next, { id: "settings", pageNumber: 2001 })).toBeUndefined();
  });

  it("un file che non e' JSON non viene toccato", () => {
    expect(manifestWithPageNumber("non sono json", { id: "x", pageNumber: 2001 })).toBeUndefined();
  });

  it("i numeri dichiarati risultano presi anche prima che la pagina esista", () => {
    const next = manifestWithPageNumber(manifest, { id: "settings", pageNumber: 2001 })!;
    const parsed = parsePanelManifest(next);
    expect(manifestPageNumbers(parsed)).toEqual([2001]);
    expect(planPageNumber("settings", manifestPageNumbers(parsed))?.number).toBe(2041);
  });
});
