import type { StandardPageTemplateId } from "./hmiPageTemplates";

export type StandardScreenKind = "page" | "popup" | "desktop-shell" | "mobile-shell" | "menu" | "reference";

export interface StandardScreenCoverage {
  kind: StandardScreenKind;
  templateId?: StandardPageTemplateId;
  componentType?: StandardShellComponentType;
  reason: string;
}

export const standardShellComponentTypes = [
  "hmi-layout-choice",
  "hmi-desktop-shell",
  "hmi-mobile-shell",
  "hmi-top-bar",
  "hmi-lateral-bar",
  "hmi-mobile-top-bar",
  "hmi-mobile-bottom-bar",
  "hmi-info-point",
  "hmi-section-menu",
  "hmi-mobile-section-menu",
  "hmi-mobile-navigator",
  "hmi-control-popup",
  "hmi-device-diagnostic-popup",
  "hmi-document-viewer-popup",
  "hmi-manual-popup",
  "hmi-alarm-loading-popup",
] as const;

export type StandardShellComponentType = typeof standardShellComponentTypes[number];

const page = (templateId: StandardPageTemplateId, reason: string): StandardScreenCoverage => ({ kind: "page", templateId, reason });
const component = (kind: Exclude<StandardScreenKind, "page" | "reference">, componentType: StandardShellComponentType, reason: string): StandardScreenCoverage => ({ kind, componentType, reason });

/** Le dodici sorelle del blocco CLV User: ognuna ha la sua forma, e nessuna ha una foto — la
 * ricostruzione viene dalle coordinate e dai tag del JSON. */
const clvSettingsCoverage: Readonly<Record<string, readonly [StandardPageTemplateId, string]>> = {
  "2282_CLV_User_FIFO": ["clv-fifo", "Posizione del pacco davanti e dietro su ogni nastro, sul layout della linea."],
  "2283_CLV_User_Layer_Centering": ["clv-centering", "Centratura dello strato: il disegno con le quattro quote attorno."],
  "2284_CLV_User_Spacers_Position": ["clv-spacers", "Le dieci posizioni dei distanziali e il disegno numerato."],
  "2285_CLV_User_Doser_Config": ["clv-doser", "Le sei misure di ognuno dei due dosatori."],
  "2286_CLV_User_Grip_Config": ["clv-grip", "Le misure della pinza e il suo disegno quotato."],
  "2287_CLV_User_Machine_Extra_Function": ["clv-extra", "Gli interruttori che accendono le funzioni opzionali del pannello."],
  "2288_CLV_User_Preforming_Settings": ["clv-preforming", "Sovrapposizione e lunghezza dei sei nastri di preformazione."],
  "2289_CLV_User_Languages": ["clv-languages", "Le cinque lingue, ognuna con la sua bandiera e il suo interruttore."],
  "2290_CLV_User_MMC_Read_Write": ["clv-mmc", "Lettura e scrittura della scheda MMC, con le spie di esito."],
  "2291_CLV_User_PadStore_Centering": ["clv-padstore", "Centratura del pad store: stessa forma della 2283 con un altro disegno."],
  "2292_CLV_User_Pallet_Store_Mode": ["clv-pallet-store", "Il modo dei due magazzini pallet sulla grafica del magazzino."],
  "2293_CLV_User_Lines_Names": ["clv-lines", "I sei nomi di linea, accesi da quante linee sono attive."],
};

/** Ogni schermata Program Modification punta alla propria forma reale. Le cinque sessioni
 * condividono alcuni numeri di runtime, ma non il template ne' i tag PLC. */
const programModificationTemplates: Readonly<Record<string, StandardPageTemplateId>> = {
  "2001_Robot_Program_Modification_1": "program-modification",
  "2002_Robot_Program_Modification_2": "program-layer",
  "2003_Robot_Program_Modification_3": "program-pallet",
  "2004_Robot_Program_Modification_4": "program-callouts",
  "2005_Robot_Program_Modification_5": "program-infeed",
  "2006_Robot_Program_Modification_6": "program-robot",
  "2007_Robot_Program_Modification_7": "program-quotes",
  "2008_Robot_Program_Modification_8": "program-squaring",
  "2009_Robot_Program_Modification_9": "program-squaring",
  "2010_Robot_Program_Modification_10": "program-quotes",
  "2011_Robot_Program_Modification_1": "program-nemo-product",
  "2012_Robot_Program_Modification_2": "program-nemo-squaring",
  "2013_Robot_Program_Modification_3": "program-nemo-robot",
  "2021_Classic_Program_Modification_1": "program-classic-product",
  "2022_Classic_Program_Modification_2": "program-classic-layer",
  "2023_Classic_Program_Modification_3": "program-classic-row",
  "2024_Classic_Program_Modification_4": "program-classic-pallet",
  "2025_Classic_Program_Modification_5": "program-classic-line",
  "2026_Classic_Program_Modification_6": "program-classic-delays",
  "2027_Classic_Program_Modification_7": "program-classic-centering",
  "2028_Classic_Program_Modification_8": "program-classic-pre-squaring",
  "2029_Classic_Program_Modification_9": "program-classic-post-squaring",
  "2030_Classic_Program_Modification_10": "program-classic-padstore",
  "2021_Robot_Program_Modification_1": "program-sweep-product",
  "2022_Robot_Program_Modification_2": "program-sweep-line",
  "2031_Robot_Program_Modification_1": "program-pouches-product",
  "2032_Robot_Program_Modification_2": "program-pouches-robot",
  "2033_Robot_Program_Modification_3": "program-pouches-tray",
};

/**
 * Mappa ogni schermata esportata verso una famiglia editabile. Le varianti della stessa famiglia
 * condividono un template: il catalogo resta leggibile, ma nessuno screen dello standard rimane
 * senza una base o un blocco corrispondente.
 */
export function standardScreenCoverage(name: string, group: string): StandardScreenCoverage | undefined {
  if (name === "00_CopyTemplate") return { kind: "reference", reason: "Schermata sorgente usata per copiare gli oggetti dello standard." };
  if (name === "0000_Layout_Choice" || name === "0001_Choice") return component("desktop-shell", "hmi-layout-choice", "Selettore iniziale tra layout desktop e mobile.");
  if (name === "0000_Layout_PC") return component("desktop-shell", "hmi-desktop-shell", "Guscio desktop con quattro finestre standard.");
  if (name === "0000_Layout_Mobile") return component("mobile-shell", "hmi-mobile-shell", "Guscio mobile con top bar, navigatore, contenuto e low bar.");

  if (group === "Modelli_Desktop" && name === "TopBar") return component("desktop-shell", "hmi-top-bar", "Barra superiore desktop.");
  if (group === "Modelli_Desktop" && name === "Lateral Bar") return component("desktop-shell", "hmi-lateral-bar", "Navigazione laterale delle sette sezioni.");
  if (group === "Modelli_Mobile" && name === "LowBar") return component("mobile-shell", "hmi-mobile-bottom-bar", "Barra inferiore mobile.");
  if (group === "Modelli_Mobile" && name === "Info_Point") return component("mobile-shell", "hmi-info-point", "Punto informativo mobile.");
  if (group === "Modelli_Mobile" && name.startsWith("TopBar")) return component("mobile-shell", "hmi-mobile-top-bar", "Barra superiore mobile nelle due altezze standard.");
  if (group === "Modelli_Mobile" && name === "Main_Mobile") return component("mobile-shell", "hmi-mobile-section-menu", "Menu principale mobile.");
  if (group === "Template Desktop") return component("menu", "hmi-section-menu", "Sottomenu desktop parametrico della sezione.");
  if (group === "Template Mobile" && name.endsWith("_Navigator")) return component("menu", "hmi-mobile-navigator", "Navigatore a tab della sezione mobile.");
  if (group === "Template Mobile") return component("menu", "hmi-mobile-section-menu", "Sottomenu mobile parametrico della sezione.");

  if (group === "9000_Various") {
    if (name === "9001_Popup_Control_Panel") return component("popup", "hmi-control-popup", "Popup dei comandi operatore.");
    if (name === "9002_Popup_Diag_By_Device") return component("popup", "hmi-device-diagnostic-popup", "Popup di dettaglio diagnostico.");
    if (name.startsWith("9003_PDF_Troubleshooting")) return component("popup", "hmi-document-viewer-popup", "Visualizzatore troubleshooting nelle varianti Node-RED e PDF.");
    if (name === "9004_Manual Popup") return component("popup", "hmi-manual-popup", "Popup dei comandi manuali.");
    if (name === "9010_Alarm_Loading") return component("popup", "hmi-alarm-loading-popup", "Popup di caricamento allarmi.");
  }

  if (group.startsWith("1000_Main/")) {
    if (name === "1042_Robot_Ex_Popup") return page("command-grid", "Griglia di comandi operativi.");
    if (name === "1081_Special") return page("special-function", "Funzioni speciali: righe a sinistra, immagine con le zone a destra.");
    if (name === "1201_Omac") return page("production-overview", "Quadro indicatori OMAC.");
    if (name === "1281_Chat_Bot") return page("web-content", "Contenuto web e viste grafiche integrate.");
    if (name === "1001_Upstair") return page("machine-render", "Rendering della linea a tutta cornice.");
    if (name === "1002_Downstair") return page("machine-downstair", "Seconda vista macchina vuota nel JSON e nella foto, con swipe propri.");
    if (name === "1041_Counters") return page("main-counters", "Pagina Counters predisposta ma vuota nello standard.");
    if (name === "1121_Collector_Counters") return page("main-collector-counters", "Pagina Collector Counters predisposta ma vuota nello standard.");
    if (name === "1161_") return page("main-free", "Pagina libera Main vuota nello standard.");
    if (name === "1241_Maintenace") return page("main-maintenance", "Pagina Maintenance predisposta ma vuota nello standard.");
    return page("blank", "Pagina di contenuto predisposta nello standard senza una struttura operativa distinta.");
  }

  if (group.startsWith("2000_Settings/")) {
    if (group.includes("Program Modification")) {
      const templateId = programModificationTemplates[name];
      return templateId ? page(templateId, "Schermata della sessione Program Modification associata al suo template e ai suoi tag reali.") : undefined;
    }
    if (group.includes("2041_Encoders")) {
      // La coppia di ogni encoder sono due schermate diverse: `_1` la taratura, `_2` le quote.
      if (name.endsWith("_Main")) return page("encoder-index", "Indice a piastrelle dei diciotto encoder.");
      return page(name.endsWith("_2") ? "encoder-drawing" : "encoder-settings", "Taratura dell'encoder o disegno quotato delle sue posizioni.");
    }
    if (name.startsWith("2081_")) return page("motor-speed", "Regolazione delle velocita' motore.");
    if (name.startsWith("2121_")) return page("robot-function", "Funzioni del robot.");
    if (name.startsWith("2161_")) return page("lubrification", "Lubrificazione: tempi, cicli e stato.");
    if (name.startsWith("2241_")) return page("system-function", "Funzioni di sistema del pannello.");
    if (name === "2201_MMC_Guide") return page("device-control", "Selezione e stato delle quattordici guide ingresso.");
    if (name === "2202_MMC_Motor_Box") return page("motor-box-control", "Motor box con otto connettori selezionabili.");
    if (name === "2203_MMC_Motor") return page("motor-control", "Stato e comandi del motore guida selezionato.");
    // Il blocco CLV: l'indice e le dodici sorelle, ognuna con la sua forma. Prima cadevano tutte
    // nel catch-all delle impostazioni, che le faceva sembrare tredici volte la stessa pagina.
    if (group.includes("2281_CLV_User")) {
      if (name === "2281_CLV_User_Main") return page("clv-index", "Indice a piastrelle delle impostazioni utente CLV.");
      const station = clvSettingsCoverage[name];
      if (station) return page(station[0], station[1]);
    }
    return page("encoder-settings", "Impostazioni, abilitazioni o configurazioni della macchina.");
  }

  if (group.startsWith("3000_Alarms&Events/")) {
    if (name === "3041_Alarms_By_Zone") return page("alarm-zone", "Allarmi filtrati per zona macchina.");
    if (name === "3081_Alarms_History") return page("alarm-history", "Storico temporale degli allarmi.");
    if (name === "3121_Media_Managment") return page("media", "Contenuto esterno per troubleshooting e media.");
    return page("alarms", "Lista allarmi operativa.");
  }

  if (group.startsWith("4000_Statistics/")) {
    if (name === "4001_Statistics") return page("statistics", "Rendering macchina e dashboard statistiche integrati.");
    if (name === "4041_Production") return page("statistics-production", "Dashboard di produzione Node-RED.");
    return page("statistics-availability", "Dashboard di disponibilita' Node-RED.");
  }
  if (group.startsWith("5000_Manuals/")) {
    const templates = {
      "5001_Manual_General": "machine-map",
      "5041_Infeed": "manual-infeed",
      "5081_Preforming": "manual-preforming",
      "5121_Layer_Pusher": "manual-layer-pusher",
      "5161_Lifter": "manual-lifter",
      "5201_Tie_Sheet": "manual-tie-sheet",
      "5241_PalletConveyor": "manual-pallet-conveyor",
    } as const;
    return page(templates[name as keyof typeof templates] ?? "manual-infeed", "Mappa o comandi della specifica stazione manuale.");
  }
  if (group.startsWith("6000_Diagnostic/")) {
    const templates = {
      "6001_Synoptic": "synoptic",
      "6041_Robot": "diagnostic-robot",
      "6081_Diagnostic_By_Zone": "diagnostic-zone",
      "6121_Diagnostic_By_Device": "device-diagnostic",
      "6161_Preventive_Maintenance": "diagnostic-maintenance",
      "6201_Profinet": "diagnostic-profinet",
      "6241": "diagnostic-free",
    } as const;
    return page(templates[name as keyof typeof templates] ?? "diagnostic-free", "Schermata della sezione Diagnostic ricostruita dal proprio JSON WinCC.");
  }
  if (group.startsWith("7000_Formats/")) {
    if (name === "7081_Pallet_Store_Selection") return page("pallet-selection", "Selettore grafico del pallet store.");
    if (name.startsWith("7041_")) return page("format-copy", "Copia formato nelle varianti robot e normale.");
    return page("format-manager", "Gestione formato nelle varianti robot e normale.");
  }

  return undefined;
}
