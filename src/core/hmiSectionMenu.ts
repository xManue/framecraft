import { encoderRoute, encoderStations, type StandardPageTemplateId } from "./hmiPageTemplates";
import { desktopShell, lateralBar, mobileSectionMenu, pageNumber, pageNumberParts, panelSize, sectionById, submenuPanel, type StandardSection } from "./hmiStandard";
import type { StandardPagePlan } from "./hmiPages";

/** Il sottomenu di una sezione, e le pagine che ci stanno dentro.
 *
 * Nello standard l'icona della barra laterale non porta da nessuna parte: apre un pannello bianco
 * (`Nxxxx_<Sezione>_Template`) con le voci della sezione, e sono le voci a cambiare pagina. Il
 * pannello e' sempre lo stesso — 210x290 a (131,160), voci alte 34 a passo 40, un filo grigio fra
 * una voce e l'altra e il triangolino che punta all'icona — quindi le misure stanno qui una volta
 * sola, e ogni sezione porta solo la sua lista.
 *
 * Le pagine sono quelle vere, con il numero che vuole la numerazione: `N000 + 1 + 40k`. Tutte e
 * sette le sezioni stanno qui, ognuna ricostruita sulla foto del suo `Nxxxx_<Sezione>_Template`. */

export type MenuIconId = "screen" | "counter" | "star" | "collector" | "chat" | "packml" | "wrench"
  | "program" | "encoder" | "motor" | "robot" | "oil" | "guide" | "system"
  | "alarmList" | "alarmZone" | "history" | "media"
  | "chart" | "production" | "availability"
  | "manual" | "infeed" | "preforming" | "layerPusher" | "lifter" | "tieSheet" | "palletConveyor"
  | "synoptic" | "zone" | "device" | "maintenance" | "profinet"
  | "format" | "copy" | "palletStore";

export interface StandardMenuPage {
  /** Il numero della schermata: 1001, 1002, 1041... */
  number: number;
  title: string;
  templateId: StandardPageTemplateId;
  componentName: string;
  route: string;
  /** Quale linguetta e' aperta, quando la voce ha piu' pagine sovrapposte. */
  folderTab?: number;
}

export interface StandardMenuEntry {
  /** La voce di menu, 0..13: decide il numero delle sue pagine. */
  slot: number;
  label: string;
  /** Nello standard e' una grafica TIA (`Graphic_14`, `Graphic_2`, ...): qui il disegno equivalente. */
  icon: MenuIconId;
  /** La prima e' quella che la voce apre; le altre sono le sue linguette.
   *
   * Vuoto vuol dire voce riservata: nelle foto sono le "Free", che tengono il posto nel menu ma nel
   * progetto vero non hanno ancora una schermata. Restano visibili e spente invece di sparire: il
   * posto e' loro, e chi ci mette la pagina si ritrova gia' il numero giusto. */
  pages: StandardMenuPage[];
}

export interface StandardSectionBlueprint {
  sectionId: StandardSection["id"];
  entries: StandardMenuEntry[];
}

/** Le cinque sessioni Program Modification presenti nello standard. I nomi file 2011/2021/2031
 * non sono numeri pagina aggiuntivi: i loro `Loaded` scrivono di nuovo 2001, 2002, 2003. Sono
 * alternative di macchina e non possono convivere nello stesso router con numeri duplicati. */
export type SettingsProgram = "robot" | "classic" | "nemo" | "sweep" | "pouches";

export const settingsProgramChoices: readonly { id: SettingsProgram; label: string; description: string; pages: number }[] = [
  { id: "robot", label: "Robot", description: "Dieci pagine 2001-2010, composizione layer e presquadratura.", pages: 10 },
  { id: "classic", label: "Classic / Palletizer", description: "Dieci pagine 2021-2030, file Classic dello standard.", pages: 10 },
  { id: "nemo", label: "Nemo", description: "Tre pagine; i file 2011-2013 impostano 2001-2003 a runtime.", pages: 3 },
  { id: "sweep", label: "Sweep Off", description: "Due pagine; i file 2021-2022 impostano 2001-2002 a runtime.", pages: 2 },
  { id: "pouches", label: "Pouches", description: "Tre pagine; i file 2031-2033 impostano 2001-2003 a runtime.", pages: 3 },
];

const page = (
  sectionNumber: number,
  slot: number,
  index: number,
  title: string,
  templateId: StandardPageTemplateId,
  componentName: string,
  route: string,
  folderTab?: number,
): StandardMenuPage => ({ number: pageNumber(sectionNumber, slot, index), title, templateId, componentName, route, folderTab });

/** Sezione 1 — Main. Le sette voci sono quelle della foto `0001_Menu_1xxxx_Main_Template`.
 *
 * La 1281 Chat Bot esiste nel progetto vero ma nel menu non c'e': il pannello ne mostra al massimo
 * sette, quindi resta fuori anche qui invece di inventare un'ottava voce. */
const mainSection: StandardSectionBlueprint = {
  sectionId: "main",
  entries: [
    { slot: 0, label: "Machine View", icon: "screen", pages: [
      page(1, 0, 0, "Upstair", "machine-render", "UpstairPage", "/", 0),
      page(1, 0, 1, "Downstair", "machine-downstair", "DownstairPage", "/downstair", 1),
    ] },
    { slot: 1, label: "Counter Machine", icon: "counter", pages: [
      page(1, 1, 0, "Counters", "main-counters", "CountersPage", "/counters"),
      page(1, 1, 1, "Robot Ex Popup", "command-grid", "RobotPopupPage", "/counters-robot"),
    ] },
    { slot: 2, label: "Special Function", icon: "star", pages: [
      page(1, 2, 0, "Machine Special Functions", "special-function", "SpecialFunctionPage", "/special-function"),
    ] },
    { slot: 3, label: "Collector Counters", icon: "collector", pages: [
      page(1, 3, 0, "Collector Counters", "main-collector-counters", "CollectorCountersPage", "/collector-counters"),
    ] },
    { slot: 4, label: "Free", icon: "chat", pages: [
      page(1, 4, 0, "Free", "main-free", "FreePage", "/free"),
    ] },
    { slot: 5, label: "PackML", icon: "packml", pages: [
      page(1, 5, 0, "OMAC - Machine", "production-overview", "PackMlPage", "/packml"),
    ] },
    { slot: 6, label: "Maintenance", icon: "wrench", pages: [
      page(1, 6, 0, "Maintenance", "main-maintenance", "MaintenancePage", "/maintenance"),
    ] },
  ],
};

/** Le dieci schermate di Program Settings, 2001-2010. Sono le dieci linguette che si vedono in
 * colonna a destra: nell'export ognuna ha lo script `ChangeScreen`, quindi non scoprono un pezzo di
 * pagina, cambiano pagina. Sette forme diverse, perche' la settima e la decima si somigliano come
 * l'ottava e la nona. */
const programPages: { title: string; templateId: StandardPageTemplateId; componentName: string; route: string }[] = [
  { title: "Program Modification", templateId: "program-modification", componentName: "SettingsPage", route: "/settings" },
  { title: "Layer Composition", templateId: "program-layer", componentName: "ProgramLayerPage", route: "/settings/program/layer" },
  { title: "Pallet Information", templateId: "program-pallet", componentName: "ProgramPalletPage", route: "/settings/program/pallet" },
  { title: "Preforming Speed", templateId: "program-callouts", componentName: "ProgramSpeedPage", route: "/settings/program/speed" },
  { title: "Infeed Settings", templateId: "program-infeed", componentName: "ProgramInfeedPage", route: "/settings/program/infeed" },
  { title: "Robot Settings", templateId: "program-robot", componentName: "ProgramRobotPage", route: "/settings/program/robot" },
  { title: "Pallet Centering", templateId: "program-quotes", componentName: "ProgramCenteringPage", route: "/settings/program/centering" },
  { title: "Pre-squaring", templateId: "program-squaring", componentName: "ProgramSquaringPage", route: "/settings/program/squaring" },
  { title: "Pre-squaring 2", templateId: "program-squaring", componentName: "ProgramSquaring2Page", route: "/settings/program/squaring-2" },
  { title: "Pallet Dimension", templateId: "program-quotes", componentName: "ProgramDimensionPage", route: "/settings/program/dimension" },
];

const programSettingsPages: StandardMenuPage[] = programPages.map((item, index) =>
  page(2, 0, index, item.title, item.templateId, item.componentName, item.route, index));

const variantPage = (index: number, title: string, templateId: StandardPageTemplateId, prefix: string, offset = 0) =>
  page(2, 0, offset + index, title, templateId, `${prefix}${index + 1}Page`, index === 0 ? "/settings" : `/settings/program/${prefix.toLowerCase()}/${index + 1}`, index);

const settingsProgramPages: Record<SettingsProgram, StandardMenuPage[]> = {
  robot: programSettingsPages,
  classic: [
    ["Product Dimension", "program-classic-product"], ["Row Composition", "program-classic-layer"],
    ["Row Type Settings", "program-classic-row"], ["Pallet Information", "program-classic-pallet"],
    ["Line Speed", "program-classic-line"], ["Delays and Infeed", "program-classic-delays"],
    ["Layer Centering", "program-classic-centering"], ["Pre-squaring", "program-classic-pre-squaring"],
    ["Post-squaring", "program-classic-post-squaring"], ["Pad Store Centering", "program-classic-padstore"],
  ].map(([title, template], index) => variantPage(index, title, template as StandardPageTemplateId, "Classic", 20)),
  nemo: [
    ["Product and Pallet", "program-nemo-product"], ["Squaring", "program-nemo-squaring"], ["Robot and Belts", "program-nemo-robot"],
  ].map(([title, template], index) => variantPage(index, title, template as StandardPageTemplateId, "Nemo")),
  sweep: [
    ["Product and Pallet", "program-sweep-product"], ["Robot and Line", "program-sweep-line"],
  ].map(([title, template], index) => variantPage(index, title, template as StandardPageTemplateId, "Sweep")),
  pouches: [
    ["Tray Product", "program-pouches-product"], ["Robot and Head", "program-pouches-robot"], ["Tray Approaches", "program-pouches-tray"],
  ].map(([title, template], index) => variantPage(index, title, template as StandardPageTemplateId, "Pouches")),
};

/** Le pagine della voce Encoders: l'indice piu' le due schermate di ognuno dei diciotto encoder,
 * 2042-2077. Le due pagine sono le due linguette che si aprono toccando una piastrella. */
const encoderPages: StandardMenuPage[] = [
  page(2, 1, 0, "Encoders", "encoder-index", "EncodersPage", "/settings/encoders"),
  ...encoderStations.flatMap((name, station) => [0, 1].map((tab) => page(
    2, 1, 1 + station * 2 + tab,
    `ENCODER - ${name}`,
    // La coppia sono due forme diverse: la prima e' la taratura, la seconda il disegno quotato.
    tab ? "encoder-drawing" : "encoder-settings",
    `Encoder${name.replace(/[^A-Za-z0-9]/g, "")}${tab ? "2" : ""}Page`,
    encoderRoute(name, tab),
    tab,
  ))),
];

/** Sezione 2 — Settings. Le sette voci sono quelle della foto `0012_Menu_2xxxx_Settings_Template`.
 *
 * Le cinque sessioni Program Settings sono alternative; a quella scelta si aggiungono l'indice
 * encoder con le trentasei pagine dei diciotto encoder, le tre dell'Infeed Guide e le quattro
 * funzioni autonome. Le CLV 2281-2293 restano fuori: nel sottomenu Settings non compaiono. */
function settingsSection(program: SettingsProgram = "robot"): StandardSectionBlueprint { return {
  sectionId: "settings",
  entries: [
    { slot: 0, label: "Program Settings", icon: "program", pages: settingsProgramPages[program] },
    { slot: 1, label: "Encoders", icon: "encoder", pages: encoderPages },
    { slot: 2, label: "Motor Speed", icon: "motor", pages: [
      page(2, 2, 0, "Motor Speed", "motor-speed", "MotorSpeedPage", "/settings/motor-speed"),
    ] },
    { slot: 3, label: "Robot Function", icon: "robot", pages: [
      page(2, 3, 0, "Robot Function", "robot-function", "RobotFunctionPage", "/settings/robot-function"),
    ] },
    { slot: 4, label: "Lubrication", icon: "oil", pages: [
      page(2, 4, 0, "Lubrification", "lubrification", "LubricationPage", "/settings/lubrication"),
    ] },
    { slot: 5, label: "Infeed Guide", icon: "guide", pages: [
      page(2, 5, 0, "MMC - Guide", "device-control", "InfeedGuidePage", "/settings/infeed-guide", 0),
      page(2, 5, 1, "MMC - Motor Box", "motor-box-control", "InfeedMotorBoxPage", "/settings/infeed-guide/motor-box", 1),
      page(2, 5, 2, "MMC - Motor", "motor-control", "InfeedMotorPage", "/settings/infeed-guide/motor", 2),
    ] },
    { slot: 6, label: "System Function", icon: "system", pages: [
      page(2, 6, 0, "System Function", "system-function", "SystemFunctionPage", "/settings/system-function"),
    ] },
  ],
}; }


/** Sezione 3 — Alarms. Le voci sono quelle della foto `0085_Menu_3xxxx_Alarms_Template`: le prime
 * quattro hanno la loro schermata, le ultime tre sono "Free" riservate. */
const alarmsSection: StandardSectionBlueprint = {
  sectionId: "alarms",
  entries: [
    { slot: 0, label: "Alarms", icon: "alarmList", pages: [
      page(3, 0, 0, "Alarm", "alarms", "AlarmsPage", "/alarms"),
    ] },
    { slot: 1, label: "Alarms By Zone", icon: "alarmZone", pages: [
      page(3, 1, 0, "Alarms By Zone", "alarm-zone", "AlarmsByZonePage", "/alarms/by-zone"),
    ] },
    { slot: 2, label: "History", icon: "history", pages: [
      page(3, 2, 0, "Alarms History", "alarm-history", "AlarmsHistoryPage", "/alarms/history"),
    ] },
    { slot: 3, label: "Media Mngmnt", icon: "media", pages: [
      page(3, 3, 0, "Media Managment", "media", "MediaManagementPage", "/alarms/media"),
    ] },
    { slot: 4, label: "Free", icon: "chat", pages: [] },
    { slot: 5, label: "Free", icon: "chat", pages: [] },
    { slot: 6, label: "Free", icon: "chat", pages: [] },
  ],
};

/** Sezione 4 — Statistics, foto `0090_Menu_4xxxx_Statistics_Template`.
 *
 * Production e Availability nell'export sono un `WebControl` che riempie la lastra: il contenuto
 * arriva dal server, non dalla schermata, quindi la pagina resta la lastra vuota. */
const statisticsSection: StandardSectionBlueprint = {
  sectionId: "statistics",
  entries: [
    { slot: 0, label: "Statistics", icon: "chart", pages: [
      page(4, 0, 0, "Statistics", "statistics", "StatisticsPage", "/statistics"),
    ] },
    { slot: 1, label: "Production", icon: "production", pages: [
      page(4, 1, 0, "Production", "statistics-production", "ProductionPage", "/statistics/production"),
    ] },
    { slot: 2, label: "Availability", icon: "availability", pages: [
      page(4, 2, 0, "Availability", "statistics-availability", "AvailabilityPage", "/statistics/availability"),
    ] },
    { slot: 3, label: "Free", icon: "chat", pages: [] },
    { slot: 4, label: "Free", icon: "chat", pages: [] },
    { slot: 5, label: "Free", icon: "chat", pages: [] },
    { slot: 6, label: "Free", icon: "chat", pages: [] },
  ],
};

/** Sezione 5 — Manuals, foto `0094_Menu_5xxxx_Manuals_Template`: e' l'unica con **otto** voci.
 *
 * Le sei stazioni sono quelle di questa linea (Infeed, Preforming, Layer Pusher, Lifter, Tie Sheet,
 * Pallet Conveyors): ognuna ha il proprio template, perche' nel JSON cambiano immagine, comandi,
 * tag, schede posizione e destinazioni swipe. */
const manualsSection: StandardSectionBlueprint = {
  sectionId: "manuals",
  entries: [
    { slot: 0, label: "General", icon: "manual", pages: [
      page(5, 0, 0, "Manual General", "machine-map", "ManualsPage", "/manuals"),
    ] },
    { slot: 1, label: "Infeed", icon: "infeed", pages: [
      page(5, 1, 0, "MANUAL - Infeed", "manual-infeed", "ManualInfeedPage", "/manuals/infeed"),
    ] },
    { slot: 2, label: "Preforming", icon: "preforming", pages: [
      page(5, 2, 0, "MANUAL - Preforming", "manual-preforming", "ManualPreformingPage", "/manuals/preforming"),
    ] },
    { slot: 3, label: "Layer Pusher", icon: "layerPusher", pages: [
      page(5, 3, 0, "MANUAL - Layer Pusher", "manual-layer-pusher", "ManualLayerPusherPage", "/manuals/layer-pusher"),
    ] },
    { slot: 4, label: "Lifter", icon: "lifter", pages: [
      page(5, 4, 0, "MANUAL - Lifter", "manual-lifter", "ManualLifterPage", "/manuals/lifter"),
    ] },
    { slot: 5, label: "Tie Sheet", icon: "tieSheet", pages: [
      page(5, 5, 0, "MANUAL - Tie Sheet", "manual-tie-sheet", "ManualTieSheetPage", "/manuals/tie-sheet"),
    ] },
    { slot: 6, label: "Pallet Conveyor", icon: "palletConveyor", pages: [
      page(5, 6, 0, "MANUAL - Pallet Conveyors", "manual-pallet-conveyor", "ManualPalletConveyorPage", "/manuals/pallet-conveyor"),
    ] },
    { slot: 7, label: "Free", icon: "chat", pages: [] },
  ],
};

/** Sezione 6 — Diagnostic, foto `0102_Menu_6xxxx_Diagnostic_Template`.
 *
 * Robot, Prev. Maintenance, Profinet e la 6241 sono vuote sia nella foto sia nel JSON: conservano
 * soltanto sfondo, linguetta e scorrimenti, senza aggiungere una lastra o contenuti arbitrari. */
const diagnosticSection: StandardSectionBlueprint = {
  sectionId: "diagnostic",
  entries: [
    { slot: 0, label: "Synoptic", icon: "synoptic", pages: [
      page(6, 0, 0, "Synoptic", "synoptic", "DiagnosticPage", "/diagnostic"),
    ] },
    { slot: 1, label: "Robot", icon: "robot", pages: [
      page(6, 1, 0, "Robot", "diagnostic-robot", "DiagnosticRobotPage", "/diagnostic/robot"),
    ] },
    { slot: 2, label: "Diagnostic Zone", icon: "zone", pages: [
      page(6, 2, 0, "Diagnostic By Zone", "diagnostic-zone", "DiagnosticByZonePage", "/diagnostic/by-zone"),
    ] },
    { slot: 3, label: "Diagnostic Device", icon: "device", pages: [
      page(6, 3, 0, "Diagnostic By Device", "device-diagnostic", "DiagnosticByDevicePage", "/diagnostic/by-device"),
    ] },
    { slot: 4, label: "Prev. Maintenance", icon: "maintenance", pages: [
      page(6, 4, 0, "Preventive Maintenance", "diagnostic-maintenance", "PreventiveMaintenancePage", "/diagnostic/preventive-maintenance"),
    ] },
    { slot: 5, label: "Profinet", icon: "profinet", pages: [
      page(6, 5, 0, "Profinet", "diagnostic-profinet", "ProfinetPage", "/diagnostic/profinet"),
    ] },
    { slot: 6, label: "Free", icon: "chat", pages: [
      page(6, 6, 0, "Free", "diagnostic-free", "DiagnosticFreePage", "/diagnostic/free"),
    ] },
  ],
};

/** Sezione 7 — Formats, foto `0110_Menu_7xxxx_Formats_Template`.
 *
 * Delle pagine non c'e' la foto: queste tre vengono dai JSON dell'export, che per nomi, coordinate
 * e tipi valgono quanto una foto. Nell'export 7001 e 7041 hanno due varianti (Normal e Robot): il
 * pannello nasce con la Normal, che e' quella buona per tutte le linee. */
const formatsSection: StandardSectionBlueprint = {
  sectionId: "formats",
  entries: [
    { slot: 0, label: "Format Selection", icon: "format", pages: [
      page(7, 0, 0, "Formats", "format-manager", "FormatsPage", "/formats"),
    ] },
    { slot: 1, label: "Formats Copy", icon: "copy", pages: [
      page(7, 1, 0, "Format Copy", "format-copy", "FormatCopyPage", "/formats/copy"),
    ] },
    { slot: 2, label: "Pallet Store Select", icon: "palletStore", pages: [
      page(7, 2, 0, "Pallet Store Selection", "pallet-selection", "PalletStorePage", "/formats/pallet-store"),
    ] },
    { slot: 3, label: "Free", icon: "chat", pages: [] },
    { slot: 4, label: "Free", icon: "chat", pages: [] },
    { slot: 5, label: "Free", icon: "chat", pages: [] },
    { slot: 6, label: "Free", icon: "chat", pages: [] },
  ],
};

export const standardSectionBlueprints: readonly StandardSectionBlueprint[] = [
  mainSection, settingsSection(), alarmsSection, statisticsSection, manualsSection, diagnosticSection, formatsSection,
];

/** Il sottomenu della sezione, se e' gia' stato ricostruito. */
export function sectionBlueprint(sectionId: string, settingsProgram: SettingsProgram = "robot"): StandardSectionBlueprint | undefined {
  if (sectionId === "settings") return settingsSection(settingsProgram);
  return standardSectionBlueprints.find((blueprint) => blueprint.sectionId === sectionId);
}

/** Tutte le pagine della sezione, nell'ordine in cui stanno nel menu. */
export function blueprintPages(blueprint: StandardSectionBlueprint): StandardMenuPage[] {
  return blueprint.entries.flatMap((entry) => entry.pages);
}

/** Le linguette numerate a destra di una pagina non sono decorazione: sono le sue pagine sorelle, e
 * nell'export ognuna ha lo script `ChangeScreen`. Qui si dice, per ogni pagina, dove portano le sue
 * linguette.
 *
 * Un gruppo comincia dove `folderTab` torna a 0 e finisce dove ricomincia: la voce Encoders e'
 * l'indice (che linguette non ne ha, quindi resta fuori) piu' diciotto coppie, una per encoder;
 * Program Settings e' un gruppo solo di dieci. Le pagine senza `folderTab` non sono sorelle di
 * nessuno: la 1042 ha dieci linguette e una schermata sola, e quelle restano ferme com'erano. */
export function folderGroupRoutes(pages: readonly StandardMenuPage[]): Map<number, string[]> {
  const result = new Map<number, string[]>();
  let group: StandardMenuPage[] = [];
  const flush = () => {
    if (group.length > 1) {
      const routes = group.map((item) => item.route);
      for (const item of group) result.set(item.number, routes);
    }
    group = [];
  };
  for (const item of pages) {
    if (item.folderTab === undefined) { flush(); continue; }
    if (item.folderTab === 0) flush();
    group.push(item);
  }
  flush();
  return result;
}

/** Il piano di numerazione di una pagina del progetto, ricavato dal suo numero. Serve a dare a
 * `standardPageSource` la stessa cosa che gli darebbe il pannello Pagine. */
export function menuPagePlan(sectionId: string, number: number): StandardPagePlan | undefined {
  const section = sectionById(sectionId);
  const parts = pageNumberParts(number);
  if (!section || !parts) return undefined;
  return { section, slot: parts.slot, page: parts.page, number, isMenuEntry: parts.page === 0 };
}

/** Dove si apre il pannello del sottomenu, in coordinate del pannello.
 *
 * Il triangolino punta all'icona della sezione, quindi il pannello scende con lei; sotto non puo'
 * uscire dallo schermo, percio' le ultime sezioni lo tengono appoggiato al fondo. */
export function submenuPlacement(slot: number, entries: number) {
  const { panel, pointer, entry } = submenuPanel;
  // In coordinate del pannello: l'icona della sezione sta a 158 + 94 per ogni posto piu' giu'.
  const iconTop = desktopShell.lateralBar.top + lateralBar.firstIconTop + slot * lateralBar.pitch;
  const height = entry.first + entries * entry.pitch + 2;
  // Nei sette `Template Desktop` dell'export il pannello sta 38 sopra l'icona della sezione (Main
  // 160 con l'icona a 163, Settings 229 con 265, Statistics 407 con 445), senza mai salire sopra la
  // pagina ne' uscire dal fondo: le ultime sezioni lo tengono appoggiato in basso (Diagnostic 500).
  const top = Math.min(
    Math.max(iconTop - submenuPanel.iconLead, desktopShell.content.top + submenuPanel.topMargin),
    panelSize.height - height - submenuPanel.bottomMargin,
  );
  return {
    panel: { left: panel.left, top, width: panel.width, height },
    pointer: { left: pointer.left, top: iconTop + submenuPanel.pointerLead, width: pointer.width, height: pointer.height },
    entry: { left: entry.left - panel.left, width: entry.width, height: entry.height, pitch: entry.pitch, first: entry.first },
  };
}

/** Dove si apre lo stesso pannello nel menu delle sezioni del mobile (`Nxxxx_<Sezione>_Template_1`).
 *
 * Li' non c'e' la barra laterale: le sezioni sono nove quadrati 80x80 in mezzo allo schermo, e il
 * pannello si apre di fianco a quello toccato. Per la prima colonna va a sinistra con il triangolino
 * a destra, per le altre due il contrario, altrimenti coprirebbe la griglia.
 *
 * Sulle sette schermate dell'export il triangolino cade entro quattro pixel dappertutto e il
 * pannello in cinque casi su sette; in Diagnostic e Formats il pannello e' stato tirato su a mano in
 * TIA lasciando il triangolino sul quadrato, che gli scorre lungo il bordo. */
export function submenuPlacementNear(
  tile: { left: number; top: number },
  entries: number,
  side?: "left" | "right",
) {
  const { panel, pointer, entry } = submenuPanel;
  const height = entry.first + Math.max(1, Math.min(entries, submenuPanel.maxEntries)) * entry.pitch + 2;
  const chosen = side ?? (tile.left <= mobileSectionMenu.columns[0] ? "left" : "right");
  const left = chosen === "left"
    ? tile.left - mobileSectionMenu.gap - panel.width
    : tile.left + mobileSectionMenu.size + mobileSectionMenu.gap;
  const pointerTop = tile.top + mobileSectionMenu.pointerLead;
  const top = Math.min(
    Math.max(pointerTop - submenuPanel.pointerOffset, submenuPanel.bottomMargin),
    panelSize.height - height - submenuPanel.bottomMargin,
  );
  return {
    panel: { left, top, width: panel.width, height },
    // Il triangolino sporge dal pannello dalla parte del quadrato, sovrapponendosi di un pixel.
    pointer: {
      left: chosen === "left" ? left + panel.width - 1 : left - pointer.width + 1,
      top: pointerTop,
      width: pointer.width,
      height: pointer.height,
      side: chosen,
    },
    entry: { left: entry.left - panel.left, width: entry.width, height: entry.height, pitch: entry.pitch, first: entry.first },
  };
}

/** I nove quadrati del menu delle sezioni mobile, nell'ordine in cui stanno nella griglia. */
export function mobileSectionTiles() {
  return mobileSectionMenu.rows.flatMap((top, row) =>
    mobileSectionMenu.columns.map((left, column) => ({
      index: row * mobileSectionMenu.columns.length + column,
      left,
      top,
      size: mobileSectionMenu.size,
      column,
    })),
  );
}
