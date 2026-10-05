import { cssColor, pagePalette, palette, sections, shellTags, typography, type StandardSection } from "./hmiStandard";
import {
  barrier, card, cardBody, command, emergencyBadge, field, folderTabs, label, lamp, machineImage,
  pageLayout, radioGroup, rowTop, rule, selectField, settingRow, statusStrip, table, tableRows,
  tile, toggle, value, webControl, zone,
} from "./hmiPrimitives";
import { clvSettingsTemplateBody, clvSettingsTemplates, isClvSettingsTemplate, type ClvSettingsTemplateId } from "./hmiClvSettings";
import { diagnosticTemplateBody, diagnosticTemplates, isDiagnosticTemplate, type DiagnosticTemplateId } from "./hmiDiagnostics";
import { guideControlTemplateBody, motorBoxControlTemplateBody, motorControlTemplateBody } from "./hmiInfeedGuides";
import { motorSpeedTemplateBody, specialFunctionTemplateBody } from "./hmiMachineConfiguration";
import { isManualTemplate, manualTemplateBody, manualTemplates, type ManualTemplateId } from "./hmiManuals";
import { isMainEmptyTemplate, mainEmptyTemplateBody, mainEmptyTemplates, type MainEmptyTemplateId } from "./hmiMain";
import { isProgramSettingsTemplate, programSettingsTemplateBody, programSettingsTemplates, type ProgramSettingsTemplateId } from "./hmiProgramSettings";
import { lubricationTemplateBody, robotFunctionTemplateBody } from "./hmiRobotLubrication";
import { systemFunctionTemplateBody, systemFunctionTemplateImports, systemFunctionTemplatePreamble } from "./hmiSystem";

/** Le famiglie di pagina che l'editor sa disegnare, ricavate dalle schermate vere.
 *
 * Ogni famiglia e' una schermata dello standard, non un'idea di schermata: `sourceScreen` dice
 * quale, `referenceImage` la foto con cui confrontarla e `visualStatus` quanto ci somiglia. Le
 * pagine sono disegnate con i pezzi di `hmiPrimitives`, che sono misurati sulle foto: pagina chiara,
 * schede bianche, righe separate dal grigio, switch magenta/verde, tabelle a righe alterne. */

export type StandardPageTemplateId =
  | "blank" | "data-board" | "machine-render" | "special-function" | "production-overview" | "command-grid" | "web-content"
  | MainEmptyTemplateId
  | "program-modification" | "program-layer" | "program-pallet" | "program-callouts" | "program-infeed"
  | "program-robot" | "program-quotes" | "program-squaring"
  | "encoder-index" | "encoder-settings" | "encoder-drawing" | "motor-speed" | "robot-function"
  | "lubrification" | "device-control" | "motor-box-control" | "motor-control" | "system-function"
  | "alarms" | "alarm-zone" | "alarm-history" | "media"
  | "statistics" | "statistics-production" | "statistics-availability" | "manual-station"
  | "format-manager" | "format-copy" | "pallet-selection"
  | DiagnosticTemplateId
  | ManualTemplateId
  | ProgramSettingsTemplateId
  | ClvSettingsTemplateId;

export interface StandardPageTemplate {
  id: StandardPageTemplateId;
  name: string;
  description: string;
  /** La schermata dello standard da cui e' presa. */
  sourceScreen: string;
  referenceImage?: string;
  /** `verified`: disegnata sulla foto. `partial`: la foto mostra la pagina, ma non il contenuto che
   * i controlli caricano a runtime. `missing`: della pagina non c'e' una foto. */
  visualStatus: "verified" | "partial" | "missing";
  recommendedSection?: StandardSection["id"];
  /** Quante e quali schermate vere hanno questa forma: serve a scegliere. */
  frequency?: string;
  /** Cosa deve fare l'utente dopo aver creato una base che dipende dalla macchina reale. */
  setupHint?: string;
}

const photo = (path: string) => `FotoStandardManu/${path}`;

export const standardPageTemplates: readonly StandardPageTemplate[] = [
  { id: "blank", name: "Pagina vuota", description: "Solo la cornice grigia, senza titolo o contenuto inventato: la base esatta della 1041.", sourceScreen: "1041_Counters", referenceImage: photo("Desktop/1000_Main/0004_Pagina_1041_Counters.png"), visualStatus: "verified" },
  { id: "data-board", name: "Lastra dati", description: "Titolo piu' una lastra bianca vuota da riempire manualmente; non viene usata al posto delle pagine vuote dello standard.", sourceScreen: "4041_Production", referenceImage: photo("Desktop/4000_Statistics/0092_Pagina_4041_Production.png"), visualStatus: "partial" },
  { id: "machine-render", name: "Vista macchina Upstair", description: "Il rendering della linea sulla pagina grigia, con funghi di emergenza, barriere e le zone che si toccano.", sourceScreen: "1001_Upstair", referenceImage: photo("Desktop/1000_Main/0002_Pagina_1001_Upstair.png"), visualStatus: "verified", recommendedSection: "main", frequency: "1001 Upstair; la 1002 Downstair esportata e' vuota e ha una base separata" },
  ...mainEmptyTemplates,
  { id: "special-function", name: "Funzioni speciali", description: "Sette righe configurabili e screen macchina sostituibile, senza funzioni o zone inventate.", sourceScreen: "1081_Special", referenceImage: photo("Desktop/1000_Main/0006_Pagina_1081_Special.png"), visualStatus: "verified", recommendedSection: "main", setupHint: "Configura le sette righe con i controlli della macchina; sostituisci lo screen a destra e aggiungi soltanto le zone interattive realmente necessarie." },
  { id: "production-overview", name: "Stati OMAC", description: "Modo e stato correnti piu' il diagramma PackML: diciassette caselle, le etichette delle transizioni e lo stato in corso in verde.", sourceScreen: "1201_Omac", referenceImage: photo("Desktop/1000_Main/0009_Pagina_1201_Omac.png"), visualStatus: "verified", recommendedSection: "main" },
  { id: "command-grid", name: "Pagina a dieci linguette", description: "La pagina su cui si apre il popup dei comandi: vuota, con una linguetta per robot.", sourceScreen: "1042_Robot_Ex_Popup", referenceImage: photo("Desktop/1000_Main/0005_Pagina_1042_Robot_Ex_Popup.png"), visualStatus: "verified", recommendedSection: "main" },
  { id: "web-content", name: "Assistente e contenuto web", description: "Vignetta dell'assistente a sinistra e area web a destra: nella foto l'area e' vuota perche' il pannello non ha rete.", sourceScreen: "1281_Chat_Bot", referenceImage: photo("Desktop/1000_Main/0011_Pagina_1281_Chat_Bot.png"), visualStatus: "verified", recommendedSection: "main" },

  { id: "program-modification", name: "Modifica programma - quote del pacco", description: "Striscia del programma, scheda con la quota illustrata e colonna di impostazioni con select, switch e scelte.", sourceScreen: "2001_Robot_Program_Modification_1", referenceImage: photo("Desktop/2000_Settings/0013_Pagina_2001_Robot_Program_Modification_1.png"), visualStatus: "verified", recommendedSection: "settings", frequency: "la prima delle dieci linguette: 2001, 2011, 2021, 2031" },
  { id: "program-layer", name: "Modifica programma - composizione strato", description: "Righe a passo e interruttori a sinistra, area verde a destra dove i pacchi si compongono davvero.", sourceScreen: "2002_Robot_Program_Modification_2", referenceImage: photo("Desktop/2000_Settings/0014_Pagina_2002_Robot_Program_Modification_2.png"), visualStatus: "verified", recommendedSection: "settings", frequency: "la seconda linguetta: 2002, 2012, 2022, 2032" },
  { id: "program-pallet", name: "Modifica programma - pallet e strati", description: "Le due schede del pallet a sinistra e la pila dei diciannove strati a destra.", sourceScreen: "2003_Robot_Program_Modification_3", referenceImage: photo("Desktop/2000_Settings/0015_Pagina_2003_Robot_Program_Modification_3.png"), visualStatus: "verified", recommendedSection: "settings", frequency: "la terza linguetta: 2003, 2013, 2023, 2033" },
  { id: "program-callouts", name: "Modifica programma - velocita' dei nastri", description: "Le schede a fumetto appoggiate all'immagine della linea, ognuna con la punta sul suo organo.", sourceScreen: "2004_Robot_Program_Modification_4", referenceImage: photo("Desktop/2000_Settings/0016_Pagina_2004_Robot_Program_Modification_4.png"), visualStatus: "verified", recommendedSection: "settings", frequency: "la quarta linguetta: 2004, 2024" },
  { id: "program-infeed", name: "Modifica programma - ingressi", description: "Impostazioni generali a sinistra e le otto velocita' di ingresso su due colonne.", sourceScreen: "2005_Robot_Program_Modification_5", referenceImage: photo("Desktop/2000_Settings/0017_Pagina_2005_Robot_Program_Modification_5.png"), visualStatus: "verified", recommendedSection: "settings", frequency: "la quinta linguetta: 2005, 2025" },
  { id: "program-robot", name: "Modifica programma - robot", description: "Le due colonne di offset dei robot e il disegno quotato della pinza.", sourceScreen: "2006_Robot_Program_Modification_6", referenceImage: photo("Desktop/2000_Settings/0018_Pagina_2006_Robot_Program_Modification_6.png"), visualStatus: "verified", recommendedSection: "settings", frequency: "la sesta linguetta: 2006, 2026" },
  { id: "program-quotes", name: "Modifica programma - centratura e ingombro", description: "Quattro schede attorno all'immagine della macchina, ognuna con la sua quota in millimetri.", sourceScreen: "2007_Robot_Program_Modification_7", referenceImage: photo("Desktop/2000_Settings/0019_Pagina_2007_Robot_Program_Modification_7.png"), visualStatus: "verified", recommendedSection: "settings", frequency: "settima e decima linguetta: 2007, 2010, 2027, 2030" },
  { id: "program-squaring", name: "Modifica programma - presquadratura", description: "La matrice delle otto presquadrature: cinque quote per colonna e la riga degli abilita.", sourceScreen: "2008_Robot_Program_Modification_8", referenceImage: photo("Desktop/2000_Settings/0020_Pagina_2008_Robot_Program_Modification_8.png"), visualStatus: "verified", recommendedSection: "settings", frequency: "ottava e nona linguetta: 2008, 2009, 2028, 2029" },
  ...programSettingsTemplates,
  { id: "encoder-index", name: "Indice a piastrelle", description: "La pagina scura con le piastrelle che aprono le tarature: sta sul nero del guscio, non sulla pagina chiara.", sourceScreen: "2041_Encoders_Main", referenceImage: photo("Desktop/2000_Settings/0041_Pagina_2041_Encoders_Main.png"), visualStatus: "verified", recommendedSection: "settings" },
  { id: "encoder-drawing", name: "Quote encoder", description: "La colonna delle posizioni e il disegno della parte con la scala quotata: la seconda pagina di ogni encoder.", sourceScreen: "2043_Encoders_Lifter_2", referenceImage: photo("Desktop/2000_Settings/0043_Pagina_2043_Encoders_Lifter_2.png"), visualStatus: "verified", recommendedSection: "settings", frequency: "le seconde pagine dei diciotto encoder: 2043, 2045, 2047 fino a 2077" },
  { id: "encoder-settings", name: "Taratura encoder", description: "Due colonne di righe compatte, immagine della parte macchina e comandi di homing.", sourceScreen: "2042_Encoders_Lifter_1", referenceImage: photo("Desktop/2000_Settings/0042_Pagina_2042_Encoders_Lifter_1.png"), visualStatus: "verified", recommendedSection: "settings", frequency: "18 coppie di pagine, da 2042 a 2077" },
  { id: "motor-speed", name: "Velocita' motori", description: "Tela 2081 con screen macchina configurabile; targhette e richiami si aggiungono dalla palette.", sourceScreen: "2081_Motor_Speed_1", referenceImage: photo("Desktop/2000_Settings/0078_Pagina_2081_Motor_Speed_1.png"), visualStatus: "verified", recommendedSection: "settings", setupHint: "1. Seleziona il riquadro e scegli lo screen della parte macchina. 2. Trascina Targhetta motore e Linea richiamo per ogni motore, poi modifica nome, azione e variabile PLC. I motori della macchina campione non vengono copiati." },
  { id: "robot-function", name: "Funzioni robot", description: "Screen robot configurabile e quattro comandi nelle posizioni reali della 2121.", sourceScreen: "2121_RobotFunction", referenceImage: photo("Desktop/2000_Settings/0079_Pagina_2121_RobotFunction.png"), visualStatus: "verified", recommendedSection: "settings", setupHint: "Scegli lo screen o una delle grafiche robot esportate. I quattro pulsanti restano da collegare: il JSON WinCC non contiene eventi né tag per questi comandi." },
  { id: "lubrification", name: "Lubrificazione", description: "Contatori, tempi, comando test momentaneo e screen pompa con i tag reali della 2161.", sourceScreen: "2161_Lubrification", referenceImage: photo("Desktop/2000_Settings/0080_Pagina_2161_Lubrification.png"), visualStatus: "verified", recommendedSection: "settings", setupHint: "Sostituisci lo screen del gruppo di lubrificazione; i sette campi e il comando Test Lubrication sono già collegati ai tag del JSON." },
  { id: "device-control", name: "Comando guida ingresso", description: "Selezione dei quattordici motori guida, stati, quota target e due screen della parte macchina.", sourceScreen: "2201_MMC_Guide", referenceImage: photo("Desktop/2000_Settings/0081_Pagina_2201_MMC_Guide.png"), visualStatus: "verified", recommendedSection: "settings", setupHint: "Sostituisci i due screen guida con le parti reali della macchina; gli hotspot 1-14 conservano tag e posizioni del JSON WinCC." },
  { id: "motor-box-control", name: "Motor box ingresso", description: "Porta seriale, stati alimentazione e otto connettori che aprono il motore associato.", sourceScreen: "2202_MMC_Motor_Box", referenceImage: photo("Desktop/2000_Settings/0082_Pagina_2202_MMC_Motor_Box.png"), visualStatus: "verified", recommendedSection: "settings", setupHint: "Sostituisci lo screen del motor box; gli otto hotspot mantengono i numeri motore del JSON e puoi poi adattarli alla macchina." },
  { id: "motor-control", name: "Controllo motore", description: "Screen motore configurabile, otto stati e sei parametri collegati ai tag reali.", sourceScreen: "2203_MMC_Motor", referenceImage: photo("Desktop/2000_Settings/0083_Pagina_2203_MMC_Motor.png"), visualStatus: "verified", recommendedSection: "settings", setupHint: "Sostituisci lo screen motore; stati, limiti, modo, offset e target mantengono i tag del JSON WinCC." },
  { id: "system-function", name: "Lingua e sistema", description: "Cinque lingue a bandiera e i comandi reali per runtime, layout, pannello di controllo e utenti.", sourceScreen: "2241_SystemFunction", referenceImage: photo("Desktop/2000_Settings/0084_Pagina_2241_SystemFunction.png"), visualStatus: "verified", recommendedSection: "settings" },
  ...clvSettingsTemplates,

  { id: "alarms", name: "Allarmi", description: "Tabella allarmi a righe alterne, troubleshooting e aggiornamento.", sourceScreen: "3001_Alarms", referenceImage: photo("Desktop/3000_Alarms/0086_Pagina_3001_Alarms.png"), visualStatus: "verified", recommendedSection: "alarms" },
  { id: "alarm-zone", name: "Allarmi per zona", description: "Controllo allarmi con le cinque colonne e il filtro Alarm_CTH della 3041.", sourceScreen: "3041_Alarms_By_Zone", referenceImage: photo("Mobile/3000_Alarms/0197_Pagina_3041_Alarms_By_Zone.png"), visualStatus: "verified", recommendedSection: "alarms" },
  { id: "alarm-history", name: "Storico allarmi", description: "Storico filtrato su Alarm_History con il comando reale di pulizia del log.", sourceScreen: "3081_Alarms_History", referenceImage: photo("Desktop/3000_Alarms/0088_Pagina_3081_Alarms_History.png"), visualStatus: "verified", recommendedSection: "alarms" },
  { id: "media", name: "Documenti e media", description: "WebControl a tutta pagina collegato al file browser Node-RED configurato nello standard.", sourceScreen: "3121_Media_Managment", referenceImage: photo("Desktop/3000_Alarms/0089_Pagina_3121_Media_Managment.png"), visualStatus: "partial", recommendedSection: "alarms" },

  { id: "statistics", name: "Statistiche macchina", description: "Rendering macchina, operatore e due WebControl con URL e geometrie della 4001.", sourceScreen: "4001_Statistics", referenceImage: photo("Desktop/4000_Statistics/0091_Pagina_4001_Statistics.png"), visualStatus: "verified", recommendedSection: "statistics" },
  { id: "statistics-production", name: "Statistiche produzione", description: "WebControl 1187x681 collegato alla pagina Production Node-RED della 4041.", sourceScreen: "4041_Production", referenceImage: photo("Desktop/4000_Statistics/0092_Pagina_4041_Production.png"), visualStatus: "partial", recommendedSection: "statistics" },
  { id: "statistics-availability", name: "Disponibilita' macchina", description: "WebControl 1187x681 collegato alla pagina Availability Node-RED della 4081.", sourceScreen: "4081_Availability", referenceImage: photo("Desktop/4000_Statistics/0093_Pagina_4081_Availability.png"), visualStatus: "partial", recommendedSection: "statistics" },

  ...manualTemplates,

  ...diagnosticTemplates,

  { id: "format-manager", name: "Gestione formati", description: "Formato in uso a sinistra e lista dei formati a destra, con le frecce del wizard.", sourceScreen: "7001_Formats_Normal", visualStatus: "missing", recommendedSection: "formats", frequency: "7001 in due varianti, Normal e Robot: ricostruita dal JSON, la foto non c'e'" },
  { id: "format-copy", name: "Copia formato", description: "Origine, destinazione e conferma della copia.", sourceScreen: "7041_Format_Copy_Normal", visualStatus: "missing", recommendedSection: "formats", frequency: "7041 in due varianti, Normal e Robot: ricostruita dal JSON, la foto non c'e'" },
  { id: "pallet-selection", name: "Selezione pallet", description: "Grafica del magazzino con il tipo e il posto scelti nelle due schede.", sourceScreen: "7081_Pallet_Store_Selection", visualStatus: "missing", recommendedSection: "formats", frequency: "7081: ricostruita dal JSON, la foto non c'e'" },
] as const;

export function standardPageTemplate(id: string | undefined): StandardPageTemplate {
  // Compatibilita' con i progetti salvati prima che le sei stazioni fossero separate.
  if (id === "manual-station") return manualTemplates[1];
  return standardPageTemplates.find((template) => template.id === id) ?? standardPageTemplates[0];
}

// ---------------------------------------------------------------------------- il foglio di lavoro

const color = (value: keyof typeof pagePalette) => cssColor(pagePalette[value]);
const { content, row, field: fieldSize, separator } = pageLayout;
const LEFT = content.left;
const TOP = content.top;
const WIDTH = content.width;
const RIGHT = LEFT + WIDTH;
const BOTTOM = TOP + content.height;
/** La barra del titolo, quando la pagina ce l'ha: alta 34, larga quanto il contenuto. */
const TITLE = 34;
/** Dove comincia il contenuto sotto la barra del titolo. */
const BOARD = TOP + TITLE + 6;
/** L'altezza di una riga compatta: etichetta a sinistra, campo a destra (pagina 2042). */
const COMPACT = 59;

/** La barra del titolo della pagina. Non tutte le famiglie ce l'hanno: la 2001 comincia con la
 * striscia del programma e la 1001 con l'immagine, quindi la disegna chi la ha davvero. */
function titleBar(title: string): string {
  return `      <div data-hmi-type="HmiTextBox" style={{ position: "absolute", left: ${LEFT}, top: ${TOP}, width: ${WIDTH}, height: ${TITLE}, display: "flex", alignItems: "center", paddingLeft: ${row.padding}, borderRadius: 4, background: "${color("panel")}", color: "${color("title")}", fontSize: ${typography.heading.size} }}>${title}</div>\n`;
}

/** Una riga compatta: etichetta a sinistra, campo appoggiato al bordo destro della scheda. */
function compactRow(left: number, top: number, width: number, text: string, options: { readOnly?: boolean; last?: boolean } = {}): string {
  const x = left + width - 10 - fieldSize.width;
  return label(left + row.padding, top + (COMPACT - 20) / 2, text, width - fieldSize.width - 40)
    + field({ left: x, top: top + (COMPACT - fieldSize.height) / 2, readOnly: options.readOnly })
    + (options.last ? "" : rule(left, top + COMPACT - separator, width));
}

/** La lastra bianca su cui un controllo porta il suo contenuto a runtime. */
function board(title: string, note: string, hmiType = "HmiWebControl"): string {
  return titleBar(title)
    + `      <div data-hmi-type="${hmiType}" aria-label="${note}" style={{ position: "absolute", left: ${LEFT}, top: ${BOARD}, width: ${WIDTH}, height: ${BOTTOM - BOARD}, borderRadius: 4, background: "${color("panel")}" }} />\n`;
}

// ---------------------------------------------------------------------------- le famiglie

/** 1001 Upstair: il rendering della linea appoggiato alla pagina grigia, con sopra
 * i punti che si toccano. Le misure sono quelle dell'export: la grafica `Main_1` a (60,64) 1102x534,
 * la figura dell'operatore `MAN_Flip` a (1025,475), tre funghi di emergenza, due barriere e cinque
 * poligoni cliccabili sugli organi. Nella foto la pagina resta grigia: l'immagine non ha una lastra
 * bianca sotto. */
function machineViewBody(): string {
  const zones = [[202, 367, 91, 101], [770, 340, 42, 76], [681, 227, 55, 90], [650, 374, 36, 87], [444, 441, 69, 82]] as const;
  return machineImage(60, 64, 1102, 534, "Sostituisci con il rendering della linea", "machine")
    + machineImage(1025, 475, 92, 130, "Figura dell'operatore")
    + emergencyBadge(627, 276) + emergencyBadge(909, 340) + emergencyBadge(535, 326)
    + barrier(512, 426, 95) + barrier(438, 447, 97)
    + zones.map(([left, top, width, height], index) => zone(left, top, width, height, `Organo ${index + 1}`)).join("");
}

/** 1201 OMAC: il diagramma degli stati PackML.
 *
 * Le caselle e le etichette stanno alle coordinate dell'export (137x79 su quattro file, etichette
 * 62x25); i collegamenti sono ridisegnati sulla foto, perche' nell'export le linee hanno perso
 * l'origine del gruppo. Il verde dei bordi vuol dire "stato che agisce", il giallo "stato fermo", il
 * blu e' Execute; lo stato in corso si riempie di verde acceso — nella foto e' Aborted. */
function omacBody(title: string): string {
  const boxWidth = 137;
  const boxHeight = 79;
  const rowY = [130, 277, 424, 572];
  const colX = [80, 312, 544, 776, 1008];
  const states = [
    [1, 0, "Un-Holding", "acting"], [2, 0, "Held", "waiting"], [3, 0, "Holding", "acting"],
    [0, 1, "Idle", "waiting"], [1, 1, "Starting", "acting"], [2, 1, "Execute", "execute"], [3, 1, "Completing", "acting"], [4, 1, "Complete", "waiting"],
    [0, 2, "Resetting", "acting"], [1, 2, "Un-Suspending", "acting"], [2, 2, "Suspended", "waiting"], [3, 2, "Suspending", "acting"],
    [0, 3, "Stopped", "waiting"], [1, 3, "Stopping", "acting"], [2, 3, "Clearing", "acting"], [3, 3, "Aborted", "current"], [4, 3, "Aborting", "acting"],
  ] as const;
  const transitions = [
    [465, 157, "Un-Hold"], [697, 157, "SC"], [465, 230, "SC"], [714, 230, "Hold"],
    [234, 304, "Start"], [465, 304, "SC"], [697, 289, "SC"], [698, 323, "Compl."], [929, 304, "SC"], [929, 332, ""],
    [118, 377, "SC"], [465, 377, "SC"], [727, 377, "Suspend"], [1042, 377, "Reset"],
    [465, 447, "Un-Susp."], [697, 447, "SC"],
    [118, 535, "Reset"], [350, 535, "Stop"], [1042, 541, "Abort"],
    [234, 599, "SC"], [705, 599, "Clear"], [929, 599, "SC"],
  ] as const;
  /** Ogni percorso finisce con la freccia sull'ultimo punto. */
  const links: readonly (readonly (readonly [number, number])[])[] = [
    [[776, 170], [681, 170]], [[544, 170], [449, 170]],
    [[380, 209], [380, 242], [568, 242], [568, 277]],
    [[649, 277], [649, 242], [844, 242], [844, 209]],
    [[217, 316], [312, 316]], [[449, 316], [544, 316]], [[681, 316], [776, 316]], [[913, 316], [1008, 316]],
    [[148, 424], [148, 356]],
    [[380, 424], [380, 389], [568, 389], [568, 356]],
    [[776, 463], [681, 463]],
    [[649, 356], [649, 389], [844, 389], [844, 424]],
    [[1076, 356], [1076, 509], [148, 509], [148, 503]],
    [[380, 509], [380, 572]],
    [[776, 611], [681, 611]], [[312, 611], [217, 611]],
    [[544, 611], [500, 611], [500, 664], [260, 664], [260, 611]],
  ];

  const strip = (left: number, width: number, name: string, value: string) =>
    `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: ${left}, top: ${BOARD}, width: ${width}, height: 37, display: "flex", alignItems: "center", borderRadius: 4, background: "${color("panel")}", color: "${color("text")}", fontSize: ${typography.heading.size} }}><span style={{ paddingLeft: 14 }}>${name}</span><output data-hmi-type="HmiTextBox" data-plc-variable="" style={{ flex: 1, textAlign: "center" }}>${value}</output></div>\n`;
  const half = Math.round((WIDTH - separator) / 2);

  const plates = `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 100, width: 1189, height: 428, borderRadius: 8, background: "${color("plate")}" }} />
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 37, top: 122, width: 1150, height: 403, borderRadius: 8, background: "${color("panel")}" }} />
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 697, top: 533, width: 512, height: 139, borderRadius: 8, background: "${color("panel")}" }} />\n`;

  const arrows = links.map((points) => {
    const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(" ");
    return `<path d="${path}" fill="none" stroke="${color("diagram")}" strokeWidth="2" markerEnd="url(#omac-arrow)" />`;
  }).join("");
  const wires = `      <svg aria-hidden="true" viewBox="0 0 1280 694" style={{ position: "absolute", left: 0, top: 0, width: 1280, height: 694, pointerEvents: "none" }}><defs><marker id="omac-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${color("diagram")}" /></marker></defs>${arrows}</svg>\n`;

  const boxes = states.map(([col, line, text, kind]) => {
    const border = kind === "waiting" ? color("stateWaiting") : kind === "execute" ? color("stateExecute") : color("stateActing");
    const background = kind === "current" ? cssColor(palette.confirm) : color("plate");
    const outline = kind === "current" ? color("stateWaiting") : border;
    return `      <div data-hmi-type="HmiRectangle" data-plc-variable="" style={{ position: "absolute", left: ${colX[col]}, top: ${rowY[line]}, width: ${boxWidth}, height: ${boxHeight}, display: "grid", placeItems: "center", border: "3px solid ${outline}", borderRadius: 8, background: "${background}", color: "${color("text")}", fontSize: ${typography.heading.size}, fontWeight: ${kind === "current" ? 700 : 400} }}>${text}</div>\n`;
  }).join("");

  const labels = transitions.map(([left, top, text]) =>
    `      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: ${left}, top: ${top}, width: 62, height: 25, display: "grid", placeItems: "center", borderRadius: 4, background: "${color("plate")}", color: "${color("text")}", fontSize: ${typography.body.size} }}>${text}</span>\n`).join("");

  return titleBar(title)
    + strip(LEFT, half, "Current Mode", "Production")
    + strip(LEFT + half + separator, WIDTH - half - separator, "Current State", "Aborted")
    + plates + wires + boxes + labels;
}

/** 1042 Robot Ex Popup: la pagina su cui si apre il popup dei comandi robot. Nella foto e' vuota, e
 * le dieci linguette a destra scelgono il robot: e' tutto quello che c'e'. */
function robotPopupBody(): string {
  return "";
}

/** 1281 Chat Bot: la vignetta dell'assistente a sinistra e l'area web a destra (429,8 779x681).
 * Nella foto l'area web e' vuota perche' il pannello non ha rete. */
function chatBotBody(): string {
  return machineImage(62, 40, 292, 304, "Immagine dell'assistente")
    + machineImage(278, 347, 38, 107, "Chiave di ingresso")
    + `      <div data-hmi-type="HmiWebControl" aria-label="Contenuto web" style={{ position: "absolute", left: 429, top: 8, width: 779, height: 681, borderRadius: 8, border: "1px solid ${color("border")}", background: "${color("panel")}" }} />
      <div data-hmi-type="HmiTouchArea" aria-label="Barra del contenuto web" style={{ position: "absolute", left: 429, top: 8, width: 779, height: 58, borderRadius: "8px 8px 0 0", background: "${color("plate")}" }} />\n`;
}

// ------------------------------------------------------- le dieci forme di Program Modification
//
// La voce Program Settings non ha una pagina: ne ha dieci, e sono le dieci linguette che si vedono
// in colonna a destra. Nell'export ogni linguetta ha lo script `ChangeScreen`, quindi cambia pagina
// per davvero; le dieci schermate 2001-2010 sono sette forme diverse (la settima e la decima si
// somigliano, come l'ottava e la nona). Le misure qui sotto sono quelle dei JSON dell'export, i
// testi quelli delle foto `0013`-`0022`.

/** L'altezza della striscia del programma, uguale in tutte e dieci. */
const STRIP = 72;

/** La striscia del programma: numero, descrizione, il bottone che salva e le due spie di "Saving...".
 * Nell'export il salvataggio e' `SetBitInTag("ProgModR.PV.Save_Program", 0)`, e sta scritto nel
 * pulsante insieme al tag. */
function programStrip(): string {
  const numberWidth = 145;
  const saveLeft = 1041;
  return card({ left: LEFT, top: TOP, width: WIDTH, height: STRIP })
    + label(LEFT + row.padding, TOP + 12, "PROGRAM NUMBER", numberWidth)
    + field({ left: LEFT + 8, top: TOP + 36, width: 130, variable: "ProgModR.PV.Program_Number", value: "000001", readOnly: true })
    + rule(LEFT + numberWidth, TOP, separator, STRIP)
    + label(LEFT + numberWidth + 16, TOP + 12, "PROGRAM DESCRIPTION", 300)
    + field({ left: LEFT + numberWidth + 8, top: TOP + 36, width: 860, variable: "ProgModR.PV.Program_Description", value: "" })
    + rule(saveLeft - 6, TOP, separator, STRIP)
    + command({ left: saveLeft, top: TOP + 8, width: 80, height: 56, text: "", variable: "ProgModR.PV.Save_Program", write: "set", step: 0, icon: true })
    + label(1130, TOP + 10, "Saving...", 80)
    + lamp(1136, TOP + 32, "on", 30)
    + lamp(1176, TOP + 32, "bad", 30);
}

/** Una lastra bianca alle misure dell'export. In queste schermate le intestazioni sono alte 29 o 37
 * e non 34, quindi la scheda standard non va: qui si disegna quello che c'e' scritto nel JSON. */
function plate(left: number, top: number, width: number, height: number): string {
  return `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}, borderRadius: 4, background: "${color("panel")}" }} />\n`;
}

/** L'intestazione di un gruppo, con la sua altezza vera. */
function head(left: number, top: number, width: number, height: number, title: string): string {
  return `      <div data-hmi-type="HmiTextBox" style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}, display: "flex", alignItems: "center", paddingLeft: 14, borderRadius: "4px 4px 0 0", background: "${color("panel")}", color: "${color("title")}", fontSize: ${typography.heading.size} }}>${title}</div>\n`;
}

/** L'etichetta di queste pagine va a capo invece di uscire dalla scheda: nelle foto "Pressor Stop
 * Before Doser [mm]" e "Offset Clamp Position Closed" stanno su due righe, e il `label` normale non
 * lo fa perche' non manda mai a capo. */
function wrapLabel(left: number, top: number, text: string, width: number): string {
  return `      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, color: "${color("textMuted")}", fontSize: ${typography.body.size}, lineHeight: 1.2 }}>${text}</span>\n`;
}

/** La casella che si ripete in tutte queste pagine: lastra, etichetta grigia in alto e il campo
 * appoggiato in basso a sinistra. */
function cell(left: number, top: number, width: number, height: number, text: string, variable = "", fieldWidth = width - 28): string {
  return plate(left, top, width, height)
    + wrapLabel(left + 15, top + 5, text, width - 24)
    + field({ left: left + 14, top: top + height - 45, width: fieldWidth, variable });
}

/** 2001 Case Dimension + General Setting: la prima linguetta, quella che si apre entrando. */
function programModificationBody(): string {
  const stripHeight = STRIP;
  const strip = programStrip();

  const cardTop = TOP + stripHeight + 10;
  const cardHeight = BOTTOM - cardTop;
  const leftWidth = 677;
  const rightLeft = LEFT + leftWidth + 18;
  const rightWidth = RIGHT - rightLeft;

  const dimensions = card({ left: LEFT, top: cardTop, width: leftWidth, height: cardHeight, title: "Case Dimension" })
    + machineImage(LEFT + 196, cardTop + 150, 280, 210, "Sostituisci con la quota illustrata del prodotto")
    + label(LEFT + 95, cardTop + 243, "Height [mm]", 120)
    + field({ left: LEFT + 94, top: cardTop + 263, width: 100, variable: "Case_Height" })
    + label(LEFT + 241, cardTop + 406, "Length [mm]", 120)
    + field({ left: LEFT + 240, top: cardTop + 426, width: 100, variable: "Case_Length" })
    + label(LEFT + 403, cardTop + 373, "Width [mm]", 120)
    + field({ left: LEFT + 402, top: cardTop + 393, width: 100, variable: "Case_Width" });

  const r = (index: number) => rowTop(cardTop, index);
  const control = (index: number) => r(index) + row.controlTop;
  const halfWidth = Math.round((rightWidth - separator) / 2);
  const settings = card({ left: rightLeft, top: cardTop, width: rightWidth, height: cardHeight, title: "General Setting" })
    + settingRow({ left: rightLeft, top: r(0), width: rightWidth, label: "Pallet Type", illustration: "Tipo di pallet", control: selectField(rightLeft + row.padding, control(0), ["800x1200", "1000x1200", "1200x1200"], "Pallet_Type") })
    + settingRow({ left: rightLeft, top: r(1), width: rightWidth, label: "Wrapper Program", illustration: "Programma di fasciatura", control: field({ left: rightLeft + row.padding, top: control(1) + 5, variable: "Wrapper_Program" }) })
    + settingRow({ left: rightLeft, top: r(2), width: rightWidth, label: "Stacker Enable", illustration: "Stacker", control: toggle(rightLeft + row.padding, control(2), false, "Stacker_Enable") })
    + settingRow({ left: rightLeft, top: r(3), width: rightWidth, label: "Infeed Product On Machine", illustration: "Verso di ingresso", control: radioGroup(rightLeft + row.padding + 6, control(3) - 8, ["Short Side", "Long Side"], "Infeed_Side") })
    + label(rightLeft + row.padding, r(4) + row.labelTop, "Enable Squaring For Layer", halfWidth - 30)
    + toggle(rightLeft + row.padding, control(4), false, "Squaring_Enable")
    + rule(rightLeft + halfWidth, r(4), separator, row.height)
    + label(rightLeft + halfWidth + row.padding + separator, r(4) + row.labelTop, "Control Pack Open", halfWidth - 30)
    + selectField(rightLeft + halfWidth + row.padding + separator, control(4), ["Disable", "Enable"], "Control_Pack_Open");

  return strip + dimensions + settings;
}

/** La punta bianca che lega una scheda a fumetto al suo organo, nella 2004. */
function pointer(left: number, top: number, width: number, height: number, towards: "down" | "up" | "right" = "down"): string {
  const shape = towards === "up" ? "polygon(50% 0, 100% 100%, 0 100%)"
    : towards === "right" ? "polygon(0 0, 100% 50%, 0 100%)"
    : "polygon(0 0, 100% 0, 50% 100%)";
  return `      <span data-hmi-type="HmiPolygon" aria-hidden="true" style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}, background: "${color("panel")}", clipPath: "${shape}" }} />\n`;
}

/** Un valore che si legge e basta, ma che nella pagina generata cambia davvero: dentro le graffe ci
 * va l'espressione, non un numero scritto a mano. */
function readout(left: number, top: number, width: number, height: number, expression: string, variable: string): string {
  return `      <output data-hmi-type="HmiIOField" data-plc-variable="${variable}" style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid ${color("border")}", borderRadius: 6, background: "${color("field")}", color: "${color("text")}", fontSize: ${typography.body.size} }}>{${expression}}</output>\n`;
}

/** Le quattro righe a passo della 2002, con il tag e il passo che usa lo script dell'export. */
const layerSteps = [
  { top: 154, label: "Group", tag: "ProgModR.PV.GroupN", step: 1, state: "groupN", setter: "setGroupN", max: 6 },
  { top: 208, label: "Case In Group", tag: "ProgModR.PV.DATA_PackInGroup", step: 1, state: "packInGroup", setter: "setPackInGroup", max: 5 },
  { top: 263, label: "Distance Next Group", tag: "ProgModR.PV.DATA_DistanceBeetweenPack", step: 10, state: "distance", setter: "setDistance", max: 120 },
  { top: 318, label: "Pos Group on Belt [Y]", tag: "ProgModR.PV.DATA_GroupInfo.PositionY", step: 10, state: "positionY", setter: "setPositionY", max: 200 },
] as const;

/** I dieci interruttori della 2002: nell'export sono dieci `InvertBitInTag` sullo stesso ramo. */
const layerToggles = [
  { left: 18, top: 373, label: "Line 1", tag: "ProgModR.PV.DATA_GroupInfo.Doser.Line_1", icon: [131, 379, 50, 37] },
  { left: 18, top: 434, label: "Line 2", tag: "ProgModR.PV.DATA_GroupInfo.Doser.Line_2", icon: [131, 438, 50, 37] },
  { left: 18, top: 496, label: "Singularize", tag: "ProgModR.PV.DATA_GroupInfo.Doser.Singularize", icon: [131, 504, 106, 37] },
  { left: 18, top: 558, label: "Robot 1", tag: "ProgModR.PV.DATA_GroupInfo.Robot.Robot_1", icon: [119, 563, 52, 47] },
  { left: 18, top: 620, label: "Robot 2", tag: "ProgModR.PV.DATA_GroupInfo.Robot.Robot_2", icon: [120, 625, 52, 47] },
  { left: 332, top: 373, label: "Rotation", tag: "ProgModR.PV.DATA_GroupInfo.Rotation.RotationMinus90", icon: [441, 384, 58, 36] },
  { left: 332, top: 434, label: "Rotation", tag: "ProgModR.PV.DATA_GroupInfo.Rotation.Rotation90", icon: [441, 438, 57, 49] },
  { left: 332, top: 496, label: "Rotation", tag: "ProgModR.PV.DATA_GroupInfo.Rotation.Rotation180", icon: [441, 499, 57, 51] },
  { left: 332, top: 558, label: "Layer Push", tag: "ProgModR.PV.DATA_GroupInfo.Layer_Push", icon: [459, 552, 66, 54] },
  { left: 332, top: 620, label: "Stop Group On Block", tag: "ProgModR.PV.DATA_GroupInfo.Block_Pack_UP", icon: [493, 630, 62, 37] },
] as const;

/** Il codice che sta prima del `return` della pagina 2002, e che la fa muovere davvero.
 *
 * Nel pannello vero il conto lo fa il PLC: scrive `PatternDisplay_Pack[i].Pos_X/Pos_Y/Size_X/Size_Y`
 * e le trenta faceplate parcheggiate fuori schermo entrano nell'area verde. Qui lo stesso conto e'
 * scritto in chiaro, cosi' la pagina si prova senza PLC: i quattro pulsanti a passo scrivono i
 * loro tag e i pacchi escono, si allontanano, si spostano. Il legame vero resta scritto su ogni
 * pacco, e l'Inspector lo mostra. */
export function programLayerPreamble(): string {
  const state = layerSteps
    .map((item) => `  const [${item.state}, ${item.setter}] = useState(${item.state === "groupN" ? 2 : item.state === "packInGroup" ? 3 : item.state === "distance" ? 10 : 0});\n`)
    .join("");
  return `  // Le quattro righe a passo: stesso tag e stesso passo degli script della schermata vera.
${state}  const step = (set: (update: (value: number) => number) => void, delta: number, max: number) =>
    () => set((value) => Math.min(max, Math.max(0, value + delta)));

  // Dove finisce il pacco numero \`index\`. E' il conto che nel pannello vero fa il PLC e arriva
  // nei tag PatternDisplay_Pack[i]; i pacchi che non ci stanno restano parcheggiati come nell'export.
  const pack = (index: number) => {
    const perGroup = Math.max(packInGroup, 1);
    const left = 732 + (index % perGroup) * 86;
    const top = 165 + positionY + Math.floor(index / perGroup) * (64 + distance);
    const shown = index < groupN * perGroup && left + 80 <= 1168 && top + 60 <= 561;
    return { position: "absolute", left, top, width: 80, height: 60, visibility: shown ? "visible" : "hidden" } as const;
  };

`;
}

/** 2002 Layer Composition. A sinistra il tipo di strato, quattro righe a passo e dieci interruttori;
 * a destra l'area verde in cui lo strato si compone, con il cursore degli strati a fianco. */
function programLayerBody(): string {
  const steps = layerSteps.map((item) => plate(18, item.top, 624, 51)
    + label(32, item.top + 7, item.label, 290)
    + command({ left: 327, top: item.top, width: 53, height: 51, text: "-", variable: item.tag, write: "decrease", step: item.step, fontSize: 22, onClick: `step(${item.setter}, -${item.step}, ${item.max})` })
    + readout(378, item.top, 213, 51, item.state, item.tag)
    + command({ left: 590, top: item.top, width: 53, height: 51, text: "+", variable: item.tag, write: "increase", step: item.step, fontSize: 22, onClick: `step(${item.setter}, ${item.step}, ${item.max})` })).join("");

  const toggles = layerToggles.map((item) => plate(item.left, item.top, 311, 58)
    + label(item.left + 14, item.top + 10, item.label, 150)
    + machineImage(item.icon[0], item.icon[1], item.icon[2], item.icon[3], `Icona ${item.label}`)
    + toggle(item.left + 224, item.top + 9, false, item.tag, "invert")).join("");

  // I trenta pacchi dell'export, uno per uno: il legame con il suo tag sta scritto addosso.
  const packs = Array.from({ length: 30 }, (_, index) => {
    const base = `ProgModR.PV.PatternDisplay_Pack[${index + 1}]`;
    const faceplate = JSON.stringify({
      typeId: "pack", version: "0.0.8",
      tagBindings: { Width: `${base}.Size_X`, Height: `${base}.Size_Y`, Group_Nr: `${base}.Group_N`, Group_Selected: "ProgModR.PV.GroupN" },
      propertyValues: {},
    });
    const dynamizations = JSON.stringify([
      { property: "Left", kind: "Tag", tag: `${base}.Pos_X`, conditionType: "None" },
      { property: "Top", kind: "Tag", tag: `${base}.Pos_Y`, conditionType: "None" },
      { property: "Width", kind: "Tag", tag: `${base}.Size_X`, conditionType: "None" },
      { property: "Height", kind: "Tag", tag: `${base}.Size_Y`, conditionType: "None" },
    ]);
    return `      <div data-hmi-type="HmiFaceplateContainer" aria-label="Pack ${index + 1}" data-plc-variable="${base}" data-hmi-faceplate='${faceplate}' data-hmi-dynamizations='${dynamizations}' style={{ ...pack(${index}), border: "1px solid ${color("packBorder")}", borderRadius: 2, background: "${color("pack")}" }} />\n`;
  }).join("");

  return programStrip()
    // La riga del tipo di strato, con la grafica gialla del pallet accanto al select.
    + plate(18, 104, 624, 46)
    + label(32, 115, "Layer Type", 200)
    + machineImage(284, 96, 70, 52, "Grafica del tipo di strato")
    + selectField(390, 106, ["- W -", "- X -", "- Y -"], "ProgModR.PV.Layer_Type", 252)
    + steps
    + toggles
    // L'area in cui si compone lo strato: lastra, cornice bianca e fondo verde, come nell'export.
    + plate(649, 104, 559, 506)
    + `      <div data-hmi-type="HmiRectangle" aria-label="Area di composizione dello strato" style={{ position: "absolute", left: 720, top: 153, width: 460, height: 420, background: "${color("layerCanvas")}" }} />\n`
    + rule(719, 148, 462, 4) + rule(719, 574, 462, 4) + rule(713, 158, 6, 409) + rule(1181, 158, 6, 409)
    // Il cursore verticale: nell'export e' una faceplate girata di 90 gradi.
    + `      <div data-hmi-type="HmiSlider" data-plc-variable="ProgModR.PV.PatternDisplay_Layer" aria-label="Strato mostrato" style={{ position: "absolute", left: 683, top: 153, width: 14, height: 420, borderRadius: 7, background: "${color("plate")}" }} />
      <span aria-hidden="true" style={{ position: "absolute", left: 673, top: 548, width: 34, height: 34, borderRadius: "50%", background: "${color("layerCanvas")}" }} />\n`
    + packs
    // Sotto: la visibilita' dello strato completo, la copia e il ricalcolo.
    + plate(649, 620, 206, 58)
    + wrapLabel(656, 626, "Layer Complete Visibility", 105)
    + toggle(767, 626, true, "PatternDisplay_Layer_Complete_Visibility", "invert")
    + command({ left: 865, top: 620, width: 168, height: 58, text: "Layer Copy", variable: "ProgModR.PV.Layer_Copy", write: "set", step: 0, icon: true })
    + command({ left: 1042, top: 620, width: 167, height: 58, text: "Layer Calculate", variable: "ProgModR.PV.Layer_Calculate", write: "set", step: 0, icon: true });
}

/** 2003 Pallet General Information e Pallet Layer Information, con la pila degli strati a destra. */
function programPalletBody(): string {
  const w = 616;
  const letters = ["W", "X", "Y"];
  return programStrip()
    + head(19, 100, w, 37, "Pallet General Information")
    + plate(19, 140, w, 105)
    + label(32, 145, "Total Layers On Pallet", 205)
    + field({ left: 32, top: 173, width: 251, variable: "ProgModR.PV.Total_Layers_On_Pallet" })
    + machineImage(410, 154, 103, 75, "Pallet completo")
    + plate(19, 248, w, 105)
    + label(33, 253, "Slip Sheet On Empty Pallet", 205)
    + selectField(30, 288, ["NO", "YES"], "ProgModR.PV.Slip_Sheet_On_Empty_Pallet", 251)
    + machineImage(403, 283, 110, 66, "Slip sheet sul pallet vuoto")
    + head(19, 362, w, 37, "Pallet Layer Information")
    + plate(19, 402, w, 90)
    + label(32, 407, "Layer In Modify", 205)
    + field({ left: 32, top: 435, width: 251, variable: "ProgModR.PV.Layer_In_Modify", value: 8 })
    + machineImage(415, 410, 86, 77, "Strato in modifica")
    + plate(19, 495, w, 90)
    + label(33, 500, "Layer Type", 160)
    + selectField(30, 525, ["- W -", "- X -", "- Y -"], "ProgModR.PV.Layer_Type", 251)
    + letters.map((letter, index) => label(340 + index * 82, 500, letter, 25)
      + machineImage(334 + index * 81, 510, 81, 79, `Strato ${letter}`)).join("")
    + plate(19, 588, w, 90)
    + label(33, 593, "Tie Sheet Presence On Layer", 205)
    + selectField(30, 620, ["NO", "YES"], "ProgModR.PV.Tie_Sheet_Presence_On_Layer", 251)
    + machineImage(423, 622, 69, 56, "Tie sheet sullo strato")
    // A destra il pallet. Nell'export sopra ci stanno diciannove strati sovrapposti a passo 25
    // (`Layer 1`..`Layer 19`), ognuno acceso dal suo tag: nella foto si vede solo il pallet vuoto,
    // e la pila cresce a runtime.
    + machineImage(815, 573, 194, 117, "Pallet, con sopra i diciannove strati a passo 25", "machine");
}

/** 2004 Preforming Speed: le schede a fumetto appoggiate all'immagine della linea, ognuna con la
 * punta sul suo organo. Le misure sono quelle dell'export, punte comprese. */
function programCalloutsBody(): string {
  const belts: [number, number, string, string][] = [
    [318, 123, "Pref Belt 4", "Pref_Belt_4"],
    [382, 236, "Pref Belt 3", "Pref_Belt_3"],
    [503, 122, "Pref Belt 2", "Pref_Belt_2"],
    [567, 237, "Pref Belt 1", "Pref_Belt_1"],
    [738, 237, "Robot Belt", "Robot_Belt"],
  ];
  const beltCards = belts.map(([left, top, title, tag]) => head(left, top, 111, 29, title)
    + cell(left, top + 31, 111, 71, "Speed[m/min]", `ProgModR.PV.${tag}_Speed`, 80)).join("");
  const doser = head(917, 114, 141, 29, "Doser")
    + cell(917, 145, 141, 71, "Speed[m/min]", "ProgModR.PV.Doser_Speed", 110)
    + cell(917, 218, 141, 71, "Acc[mm/s^2]", "ProgModR.PV.Doser_Acc", 110)
    + cell(917, 291, 141, 71, "Decc[mm/s^2]", "ProgModR.PV.Doser_Decc", 110);
  const pressor = head(1067, 114, 141, 29, "Pressor")
    + cell(1067, 145, 141, 71, "Speed[m/min]", "ProgModR.PV.Pressor_Speed", 110)
    + cell(1067, 218, 141, 71, "Pressor Stop Before Doser [mm]", "ProgModR.PV.Pressor_Stop_Before", 110)
    + cell(1067, 291, 141, 71, "Pressor Stop After Doser [ms]", "ProgModR.PV.Pressor_Stop_After", 110);
  return programStrip()
    + head(18, 123, 234, 29, "Pusher")
    + cell(18, 154, 234, 71, "Speed [%]", "ProgModR.PV.Pusher_Speed", 202)
    + cell(18, 227, 234, 71, "Offset Guide Down Before[mm]", "ProgModR.PV.Pusher_Offset_Guide_Down", 204)
    + plate(18, 301, 234, 191)
    + machineImage(23, 308, 217, 160, "Disegno del pusher")
    + pointer(250, 449, 25, 22, "right")
    + beltCards
    + doser + pressor
    + head(21, 575, 390, 29, "For Preforming All Block")
    + cell(21, 606, 194, 71, "Block Up Before[mm]", "ProgModR.PV.Block_Up_Before", 165)
    + cell(217, 606, 194, 71, "Block Down Before[mm]", "ProgModR.PV.Block_Down_Before", 165)
    + pointer(339, 543, 27, 33, "up")
    + pointer(326, 224, 31, 144) + pointer(396, 336, 33, 30) + pointer(509, 222, 33, 150)
    + pointer(581, 337, 33, 30) + pointer(752, 337, 33, 30)
    + pointer(948, 361, 33, 49) + pointer(1077, 360, 41, 54)
    // L'immagine della linea, con i nastri di preformazione e il gruppo dosatore-pressore.
    + machineImage(515, 364, 418, 184, "Nastri della linea", "machine")
    + machineImage(271, 373, 101, 162, "Nastro 4") + machineImage(352, 374, 101, 162, "Nastro 3")
    + machineImage(433, 375, 101, 162, "Nastro 2")
    + machineImage(921, 410, 176, 49, "Dosatore") + machineImage(921, 459, 176, 49, "Pressore");
}

/** 2005 General Settings e Infeed Motors Speed: tre quote piu' un interruttore a sinistra, le otto
 * velocita' di ingresso su due colonne a destra. */
function programInfeedBody(): string {
  const general = [
    ["Offset Infeed Guides [mm]", "Offset_Infeed_Guides"],
    ["Layer On Position On Last Conveyor [ms]", "Layer_On_Position_Last_Conveyor"],
    ["Doser Step Correction [ms]", "Doser_Step_Correction"],
  ];
  const infeed = Array.from({ length: 8 }, (_, index) => {
    const left = index < 4 ? 372 : 636;
    const top = 137 + (index % 4) * 78;
    return cell(left, top, 260, 75, `Infeed ${index + 1} [m/min]`, `ProgModR.PV.Infeed_${index + 1}_Speed`, 202);
  }).join("");
  return programStrip()
    + head(20, 105, 336, 29, "General Settings")
    + general.map(([text, tag], index) => cell(20, 137 + index * 78, 336, 75, text, `ProgModR.PV.${tag}`, 202)).join("")
    + plate(20, 371, 336, 96)
    + label(35, 377, "Last Preforming Belt Running While Pushing A Layer", 305)
    + toggle(33, 407, false, "ProgModR.PV.Last_Preforming_Belt_Running", "invert")
    + head(372, 105, 524, 29, "Infeed Motors Speed")
    + infeed;
}

/** 2006 Robot Settings: le stesse cinque quote per i due robot, e il disegno quotato della pinza. */
function programRobotBody(): string {
  const rows = [
    ["Speed Override - Preformation [%]", "Speed_Override_Preformation"],
    ["Y - Offset [mm]", "Y_Offset"],
    ["X - Pack Centering On Clamp [mm]", "X_Pack_Centering_On_Clamp"],
    ["Z - Offset [mm]", "Z_Offset"],
    ["Offset Clamp Position Closed [mm]", "Offset_Clamp_Position_Closed"],
  ];
  const columns = [0, 1].map((robot) => {
    const left = 18 + robot * 239;
    return head(left, 132, 234, 29, `Robot ${robot + 1} Settings`)
      + rows.map(([text, tag], index) => cell(left, 164 + index * 74, 234, 71, text, `ProgModR.PV.Robot_${robot + 1}.${tag}`, 202)).join("");
  }).join("");
  return programStrip()
    + columns
    // Il disegno: la pinza vista dall'alto sul fondo verde, e sotto la vista laterale con la quota Z.
    + `      <div data-hmi-type="HmiRectangle" aria-label="Vista dall'alto della pinza" style={{ position: "absolute", left: 669, top: 139, width: 452, height: 296, background: "${color("layerCanvas")}" }} />\n`
    + machineImage(723, 191, 343, 52, "Pinza, braccio superiore")
    + machineImage(724, 318, 343, 52, "Pinza, braccio inferiore")
    + wrapLabel(549, 206, "Offset Clamp Position Closed", 87)
    + wrapLabel(549, 317, "Offset Clamp Position Closed", 87)
    + label(1152, 277, "Y - Offset", 56)
    + wrapLabel(846, 442, "X - Pack Centering On Clamp", 102)
    + label(549, 593, "Z - Offset", 87)
    + machineImage(723, 531, 343, 62, "Pinza, vista laterale")
    + rule(669, 650, 452, 5);
}

/** 2007 e 2010: quattro schede attorno all'immagine della macchina, ognuna con la sua quota in
 * millimetri e la linea tratteggiata che dice a che cosa si riferisce. */
function programQuotesBody(): string {
  const quote = (left: number, top: number, title: string, tag: string) =>
    head(left, top, 182, 37, title)
      + plate(left, top + 39, 182, 56)
      + field({ left: left + 44, top: top + 47, width: 80, variable: `ProgModR.PV.${tag}` })
      + label(left + 131, top + 43, "[mm]", 51);
  return programStrip()
    + machineImage(396, 234, 317, 338, "Macchina vista dall'alto, con le quote di centratura", "machine")
    + quote(467, 111, "Short Side Centering", "Short_Side_Centering")
    + quote(142, 352, "Long Side Centering", "Long_Side_Centering")
    + quote(743, 355, "Long Side Dimension", "Long_Side_Dimension")
    + quote(472, 574, "Short Side Dimension", "Short_Side_Dimension")
    // Le linee che legano ogni scheda alla sua quota sul disegno.
    + rule(560, 221, 1, 116) + rule(439, 219, 239, 1)
    + rule(339, 325, 1, 147) + rule(340, 399, 156, 1)
    + rule(728, 339, 1, 123) + rule(625, 337, 117, 1)
    + rule(502, 467, 1, 96) + rule(628, 467, 1, 96) + rule(504, 555, 121, 1);
}

/** 2008 e 2009 Pre-squaring: la matrice delle otto presquadrature, cinque quote per colonna piu' la
 * riga degli abilita, e la nota che spiega il segno degli offset. */
function programSquaringBody(): string {
  const rows = ["Layer Bar (mm)", "Front Guide (mm)", "Right Guide [mm]", "Left Guide [mm]", "Plane Open [mm/ms]"];
  const columns = Array.from({ length: 8 }, (_, index) => index);
  const rowHeads = rows.map((text, index) => plate(18, 188 + index * 57, 169, 54)
    + label(29, 195 + index * 57, text, 169)).join("")
    + plate(18, 473, 169, 54) + label(29, 480, "PHASE ENABLE", 169);
  const grid = columns.map((column) => {
    const left = 190 + column * 118;
    const headCell = plate(left, 126, 115, 59) + label(left + 12, 145, `PreSquaring ${column + 1}`, 100);
    const values = rows.map((_, index) => cell(left, 188 + index * 57, 115, 54, "", `ProgModR.PV.PreSquaring[${column + 1}].Quote_${index + 1}`, 87)).join("");
    return headCell + values
      + plate(left, 473, 115, 54)
      + toggle(left + 18, 477, false, `ProgModR.PV.PreSquaring[${column + 1}].Phase_Enable`, "invert");
  }).join("");
  return programStrip()
    + rowHeads
    + grid
    + machineImage(230, 551, 39, 39, "Icona della nota")
    + label(285, 559, "Pre-squaring quotes are OFFSETS referred to the &quot;Reference Position&quot; (&gt;0 = close; &lt;0 = open)", 658);
}

/** I diciotto encoder della 2041, nell'ordine in cui la foto li mette in griglia.
 *
 * Non sono solo le piastrelle dell'indice: ognuno nel progetto vero ha **due** schermate (2042-2077,
 * `Encoders_<nome>_1` e `_2`), che sono le due linguette che si vedono aprendone uno. I nomi qui
 * sono quelli che si leggono nella foto; fra parentesi, dove cambia, quello del file dell'export. */
export const encoderStations: readonly string[] = [
  "Lifter", "Layer Bar", "Frontal Guide", "Right Guide", "Left Guide", "Trolley",
  "Tie Sheet Feeder Traslation", "Tie Sheet Feeder Lifter", "Row Pusher", "Layer Pusher", "Pad Store Lifter", "Unloading Plane",
  "Slip Sheet Feeder Traslation", "Slip Sheet Feeder Lifter", "Pad Store Right Guide", "Pad Store Left Guide", "Pad Store Front Guide", "Pad Store Back Guide",
];

/** La rotta della pagina di un encoder, dal suo nome: la usano sia le piastrelle dell'indice sia il
 * sottomenu, e devono per forza dire la stessa cosa. */
export function encoderRoute(name: string, page = 0): string {
  const slug = name.toLocaleLowerCase("it").replace(/[^a-z0-9]+/g, "-");
  return `/settings/encoders/${slug}${page ? `-${page + 1}` : ""}`;
}

function encoderIndexBody(): string {
  const names = encoderStations;
  const { pitchX, pitchY } = pageLayout.tile;
  // Il fondo non e' nero pieno: nella 2041 e' piu' chiaro in alto al centro e sfuma quasi al nero.
  const black = `      <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: 1280, height: 694, background: "radial-gradient(ellipse at 50% 20%, ${color("indexCanvas")} 0%, ${color("indexCanvasEdge")} 72%)" }} />\n`;
  // Ogni piastrella apre la taratura del suo encoder, che nel progetto generato c'e' davvero.
  return black + names.map((text, index) =>
    tile(165 + (index % 6) * pitchX, 118 + Math.floor(index / 6) * pitchY, text, encoderRoute(text))).join("");
}

/** 2043 e le altre seconde pagine degli encoder: a sinistra le posizioni, a destra il disegno della
 * parte con la scala quotata.
 *
 * Nell'export la colonna ha **undici** `IOField` a x=293, dal 108 al 637 con passo 53, e non undici
 * etichette: le posizioni che una macchina non ha restano nascoste, e nella foto del Lifter se ne
 * vedono sei. Qui si disegnano le sei che si vedono, e le altre cinque restano righe vuote —
 * pronte, con il loro stacco, per chi ce le deve mettere.
 *
 * La scala e' fatta di oggetti veri anche nel JSON: una `Line` verticale a x=766 dal 269 al 602,
 * cinque `Circle` sopra alle quote e le diagonali tratteggiate che vanno al disegno. */
function encoderDrawingBody(title: string): string {
  const listLeft = 20;
  const listWidth = 408;
  const imageLeft = 434;
  const imageWidth = 775;
  const ROW = 53;
  // Le sei posizioni della foto, alla loro riga. Le righe che restano fuori sono vuote per davvero.
  const positions: Record<number, string> = {
    0: "Min Limit [mm]",
    1: "Down Position [mm]",
    2: "Waiting Position [mm]",
    3: "Up Position [mm]",
    4: "Offset On Registration position [mm]",
    10: "Max Limit [mm]",
  };
  const rows = Array.from({ length: 11 }, (_, index) => {
    const top = rowTop(BOARD, index, ROW);
    const text = positions[index];
    return (text ? label(listLeft + row.padding, top + 16, text, listWidth - fieldSize.width - 40) + field({ left: listLeft + 273, top: top + 10, width: 121 }) : "")
      + (index === 10 ? "" : rule(listLeft, top + ROW - separator, listWidth));
  }).join("");

  // Le quote: l'etichetta finisce a x=751, il punto sta sulla riga verticale a 766.
  const quotes = [[261, "Max Limit", 83], [279, "Up Position", 93], [518, "Waiting Position", 114], [576, "Low Position", 128], [592, "Min Limit", 93]] as const;
  const marks = quotes.map(([top, text, width]) => label(751 - width, top, text, width)).join("");
  const dots = quotes.map(([top]) => `<circle cx="766" cy="${top + 10}" r="5" fill="${color("statusBad")}" />`).join("");
  // Le diagonali tratteggiate che legano la quota al punto sul disegno, come le `Line` dell'export.
  const leaders = [[766, 271, 1017, 204], [766, 289, 1018, 224], [766, 537, 1015, 463], [766, 586, 986, 543], [766, 602, 977, 531]] as const;
  const wires = leaders.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color("textMuted")}" strokeWidth="1" strokeDasharray="3 3" />`).join("");

  return titleBar(title)
    + card({ left: listLeft, top: BOARD, width: listWidth, height: BOTTOM - BOARD, title: "Position", body: rows })
    + card({ left: imageLeft, top: BOARD, width: imageWidth, height: BOTTOM - BOARD, title: "Illustrative Image" })
    + machineImage(905, 122, 218, 501, "Sostituisci con il disegno della parte quotata")
    + `      <svg aria-hidden="true" viewBox="0 0 1280 694" style={{ position: "absolute", left: 0, top: 0, width: 1280, height: 694, pointerEvents: "none" }}><line x1="766" y1="269" x2="766" y2="602" stroke="${color("statusBad")}" strokeWidth="2" />${dots}${wires}</svg>\n`
    + marks
    + label(803, 488, "for Entry Pallet Empty", 102);
}

function encoderSettingsBody(title: string): string {
  const generalLabels = ["Distance/Turn [mm]", "Homing Position [mm]", "Deceleration Space [mm]", "Approaching Space [mm]", "Minus Tolerance [mm]", "Plus Tolerance [mm]", "ACTUAL POSITION [mm]", "TARGET POSITION [mm]"];
  const speedLabels = ["Homing Speed [Hz]", "Max Speed [Hz]", "Min Speed [Hz]", "Upward Speed [mm]", "Downward Speed [Hz]", "Layer Levelling Speed [Hz]"];
  const columnTop = BOARD;
  const columnHeight = 501;
  const generalLeft = 20;
  const generalWidth = 403;
  const speedLeft = 432;
  const speedWidth = 405;
  const imageLeft = 844;
  const imageWidth = 361;
  const generalRows = generalLabels.map((text, index) =>
    compactRow(generalLeft, rowTop(columnTop, index, COMPACT), generalWidth, text, { readOnly: index > 5, last: index === generalLabels.length - 1 })).join("");
  const speedGap = Math.round((columnHeight - pageLayout.header - separator) / speedLabels.length);
  const speedRows = speedLabels.map((text, index) =>
    compactRow(speedLeft, rowTop(columnTop, index, speedGap), speedWidth, text, { last: index === speedLabels.length - 1 })).join("");

  const bottomTop = columnTop + columnHeight + 6;
  const bottomHeight = BOTTOM - bottomTop;
  const homingWidth = 510;
  const manualLeft = generalLeft + homingWidth + 6;
  const manualWidth = speedLeft + speedWidth - manualLeft;

  return titleBar(title)
    + card({ left: generalLeft, top: columnTop, width: generalWidth, height: columnHeight, title: "General Setting", body: generalRows })
    + card({ left: speedLeft, top: columnTop, width: speedWidth, height: columnHeight, title: "Speed Settings", body: speedRows })
    + card({ left: imageLeft, top: columnTop, width: imageWidth, height: BOTTOM - columnTop, title: "Illustrative Image" })
    + machineImage(imageLeft + 10, cardBody(columnTop) + 10, imageWidth - 20, BOTTOM - cardBody(columnTop) - 20, "Sostituisci con l'immagine della parte macchina")
    + card({ left: generalLeft, top: bottomTop, width: homingWidth, height: bottomHeight })
    + command({ left: generalLeft + 19, top: bottomTop + 22, width: 128, height: 62, text: "Homing Needed", variable: "Homing_Needed", tone: "warning" })
    + command({ left: generalLeft + 159, top: bottomTop + 22, width: 337, height: 62, text: "Homing", variable: "Homing_Start" })
    + card({ left: manualLeft, top: bottomTop, width: manualWidth, height: bottomHeight })
    + label(manualLeft + row.padding, bottomTop + 14, "Manual Command", 220)
    + command({ left: manualLeft + 60, top: bottomTop + 43, width: 184, height: 46, text: "M2010", variable: "Manual_Command" });
}

function systemFunctionBody(): string {
  return systemFunctionTemplateBody();
}

type AlarmTableMode = "active" | "zone" | "history";

function alarmTableBody(mode: AlarmTableMode): string {
  const title = mode === "active" ? "Alarm" : mode === "zone" ? "Alarm By Zone" : "Alarm History";
  const columns = mode === "zone"
    ? [
      { label: "", width: 54, align: "center" as const }, { label: "ID", width: 45, align: "center" as const },
      { label: "Cat", width: 50, align: "center" as const }, { label: "Alarm class", width: 709 },
      { label: "EM", width: 85, align: "center" as const }, { label: "Time", width: 250 },
    ]
    : [
      { label: "", width: 54, align: "center" as const }, { label: "ID", width: 45, align: "center" as const },
      { label: "Cat", width: 50, align: "center" as const }, { label: "Alarm class", width: 600 },
      { label: "EM", width: 85, align: "center" as const }, { label: "Time", width: 160 }, { label: "EM - Name", width: 200 },
    ];
  const tableLeft = 16;
  const tableTop = 55;
  const tableWidth = 1197;
  const header = `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 18, top: 18, width: 1195, height: 37, borderRadius: "4px 4px 0 0", background: "${color("panel")}" }} />
      <div data-hmi-type="HmiTextBox" style={{ position: "absolute", left: 32, top: 18, width: 663, height: 37, display: "flex", alignItems: "center", color: "${color("title")}", fontSize: ${typography.heading.size} }}>${title}</div>
`;
  const troubleshooting = mode === "active"
    ? `      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: 1038, top: 25, width: 114, height: 24, color: "${color("text")}", fontSize: ${typography.body.size} }}>Troubleshooting:</span>
      <button type="button" aria-label="Apri troubleshooting" data-hmi-type="HmiButton" data-plc-variable="Trigger_Open_Troubleshooting" data-plc-write="set" data-hmi-action="open-popup" data-hmi-popup-screen="9003_PDF_Troubleshooting_NodeRed" style={{ position: "absolute", left: 1164, top: 18, width: 49, height: 38, border: "1px solid ${color("commandBorder")}", borderRadius: 4, background: "linear-gradient(180deg, #5A5A5A 0%, #262626 100%)", color: "white", fontSize: 22, fontWeight: 700, cursor: "pointer" }}>?</button>
`
    : "";
  const clear = mode === "history"
    ? `      <button type="button" data-hmi-type="HmiButton" data-plc-variable="" data-hmi-action="clear-alarm-log" data-hmi-alarm-log="Alarm_History_Log" style={{ position: "absolute", left: 1043, top: 19, width: 168, height: 35, border: "1px solid #A8A8A8", borderRadius: 4, background: "linear-gradient(180deg, #DADADA 0%, #969696 100%)", color: "white", fontFamily: ${JSON.stringify(typography.cssFamily)}, fontSize: ${typography.body.size}, fontWeight: 700, cursor: "pointer" }}>Clear Alarm Log</button>
`
    : "";
  const refresh = mode === "active"
    ? `      <button type="button" aria-label="Aggiorna troubleshooting" data-hmi-type="HmiButton" data-plc-variable="Start_Copy" data-plc-write="set" data-hmi-secondary-writes='[{"tag":"Done_Copy","value":0},{"tag":"ID_Req_HMI","value":0}]' style={{ position: "absolute", left: 1223, top: 24, width: 48, height: 31, border: 0, borderRadius: "0 4px 4px 0", background: "${cssColor(sections.find((section) => section.id === "alarms")!.color.top)}", color: "white", fontSize: 24, fontWeight: 700, cursor: "pointer" }}>&#8635;</button>
`
    : "";
  return header + troubleshooting + clear
    + table({
      left: tableLeft, top: tableTop, width: tableWidth, columns,
      total: tableRows(679 - tableTop), hmiType: "HmiAlarmControl",
      alarmFilter: mode === "history" ? "AlarmClassName = 'Alarm_History'" : "AlarmClassName = 'Alarm_CTH'",
      alarmSource: mode === "history" ? "history" : "active",
      alarmLog: mode === "history" ? "Alarm_History_Log" : undefined,
      selectionTags: mode === "active" ? ["AlarmTextTroubleshooting", "AlarmID"] : [],
    })
    + refresh;
}

function alarmMediaBody(): string {
  return webControl(9, 8, 1199, 681, "https://10.14.1.228:1880/dashboard/filebrowser", "File browser troubleshooting Node-RED");
}

function swipeContract(left: number, top: number, width: number, height: number, previous?: string, next?: string): string {
  const before = previous ? ` data-hmi-swipe-right="${previous}"` : "";
  const after = next ? ` data-hmi-swipe-left="${next}"` : "";
  return `      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active"${before}${after} style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}, pointerEvents: "none" }} />
`;
}

/** 4001 Statistics. I due WebControl sono trasparenti nel riferimento offline; sotto restano il
 * rendering `Main_1`, le due ombre e la figura `MAN_Flip`, tutti alle coordinate dell'export. */
function statisticsBody(): string {
  return `      <span data-hmi-type="HmiEllipse" aria-hidden="true" style={{ position: "absolute", left: 22, top: 300, width: 728, height: 212, borderRadius: "50%", background: "rgba(92, 92, 92, .12)", transform: "rotate(-10deg)" }} />
`
    + webControl(584, 13, 624, 676, "https://10.14.1.228:1880/dashboard/statisticbase", "Dashboard statistiche di base Node-RED")
    + `      <img data-hmi-type="HmiGraphicView" data-image-role="machine" src="/placeholder.svg" data-plc-variable="Alarms_Trigger[65]" data-hmi-alternate-back-color-tag="Alarms_Trigger[65]" alt="Sostituisci con il rendering della macchina per le statistiche" style={{ position: "absolute", left: 41, top: 143, width: 743, height: 360, objectFit: "contain" }} />
      <span data-hmi-type="HmiEllipse" aria-hidden="true" style={{ position: "absolute", left: 498, top: 606, width: 58, height: 26, borderRadius: "50%", background: "rgba(92, 92, 92, .16)", transform: "rotate(-10deg)" }} />
`
    + machineImage(475, 491, 92, 130, "Figura dell'operatore MAN_Flip")
    + `      <div data-hmi-type="HmiRectangle" aria-hidden="true" style={{ position: "absolute", left: 1188, top: 8, width: 35, height: 681, background: "${color("canvas")}" }} />
`
    + swipeContract(9, 0, 1214, 689, undefined, "4041_Production")
    + webControl(9, 8, 590, 628, "https://10.14.1.228:1880/ui/#!/1?socketid=lG6bDa8Tb441kGTJAAAE", "Dashboard statistiche macchina Node-RED");
}

function statisticsReportBody(kind: "production" | "availability"): string {
  const production = kind === "production";
  const url = production
    ? "https://10.14.1.228:1880/dashboard/pageN"
    : "https://10.14.1.228:1880/dashboard/Availabilty";
  const content = webControl(21, 8, 1187, 681, url, production ? "Dashboard produzione Node-RED" : "Dashboard disponibilita' Node-RED");
  return content + (production
    ? swipeContract(31, 723, 1177, 663, "4001_Statistics", "4081_Availability")
    : swipeContract(47, 721, 1180, 570, "4041_Production"));
}

/** Delle tre pagine Formats non c'e' la foto: queste vengono dai JSON dell'export, che per nomi,
 * coordinate e tipi valgono quanto una foto. Quello che l'export non porta sono i testi (sono
 * riferimenti multilingua di TIA): le scritte qui sotto sono segnaposto in inglese, la lingua del
 * pannello, e si cambiano dall'Inspector. */

/** Una scritta di servizio in grigio con accanto le due grafiche Done/Not_Done: la legenda che
 * l'export mette sotto il comando grosso, uguale nella 7001 e nella 7041. */
function doneLegend(left: number, top: number, successTag: string, errorTag: string): string {
  return label(left, top, "Loaded", 100)
    + `      <img data-hmi-type="HmiGraphicView" data-hmi-graphic="Done_1" data-plc-variable="${successTag}" data-hmi-opacity-tag="${successTag}" src="/placeholder.svg" alt="Formato caricato" style={{ position: "absolute", left: ${left + 3}, top: ${top + 23}, width: 59, height: 57, objectFit: "contain" }} />\n`
    + `      <img data-hmi-type="HmiGraphicView" data-hmi-graphic="Not_Done_1" data-plc-variable="${errorTag}" data-hmi-opacity-tag="${errorTag}" src="/placeholder.svg" alt="Errore caricamento formato" style={{ position: "absolute", left: ${left + 42}, top: ${top + 23}, width: 59, height: 57, objectFit: "contain" }} />\n`;
}

/** 7001 Formats. A sinistra il formato in uso: il gruppo con la sua scelta, poi due schede uguali
 * (numero, nome, una freccia verso la lista e il bottone che apre la diagnostica) e il comando
 * grosso che carica. A destra la lista dei formati con la barra di scorrimento e le due frecce del
 * wizard, alle coordinate dell'export. */
function formatManagerBody(): string {
  const listLeft = 585;
  const listWidth = 619;
  const rowWidth = 579;
  const rows = Array.from({ length: 13 }, (_, index) => {
    const top = 81 + index * 41;
    const pointer = index + 1;
    return `      <button type="button" data-hmi-type="HmiTextBox" data-plc-variable="Program_Selection_Session" data-hmi-action="select-format" data-hmi-selection-offset="${pointer}" data-hmi-pointer-tag="Program_List_Pointers" data-hmi-description-tag-template="ProgModN_PLC_Prog_Description[${pointer}+Program_List_Pointers]" style={{ position: "absolute", left: ${listLeft}, top: ${top}, width: ${rowWidth}, height: 40, padding: "0 14px", display: "flex", alignItems: "center", border: 0, background: "${index ? color("panel") : color("panelMuted")}", color: "${color("text")}", fontSize: ${typography.body.size}, cursor: "pointer" }}>Format ${pointer}</button>\n`
      + (index === 12 ? "" : rule(listLeft, top + 40, rowWidth, 1));
  }).join("");
  const chooser = (top: number, name: string, current: boolean) =>
    card({ left: 26, top, width: 506, height: 124, title: name })
      + `      <input data-hmi-type="HmiIOField" data-plc-variable="${current ? "Program_Selection_In_Use_L[Line Selection-1]" : "Program_Selection_Session"}" data-hmi-value-expression="${current ? "Program_Selection_In_Use_L[Line Selection-1]" : "Program_Selection_Session"}" defaultValue="0" readOnly style={{ position: "absolute", left: 44, top: ${cardBody(top) + 12}, width: 101, height: 40, padding: "0 10px", border: "1px solid ${color("border")}", borderRadius: ${fieldSize.radius}, background: "${color("fieldReadOnly")}", color: "${color("text")}", fontFamily: ${JSON.stringify(typography.cssFamily)}, fontSize: ${typography.body.size}, textAlign: "center" }} />\n`
      + `      <output data-hmi-type="HmiTextBox" data-plc-variable="ProgModN_PLC_Prog_Description" data-hmi-text-expression="ProgModN_PLC_Prog_Description[${current ? "Program_Selection_In_Use_L[Line Selection-1]" : "Program_Selection_Session"}]" style={{ position: "absolute", left: 151, top: ${cardBody(top) + 12}, width: 367, height: 40, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: ${fieldSize.radius}, border: "1px solid ${color("border")}", background: "${color("fieldReadOnly")}", color: "${color("text")}", fontSize: ${typography.body.size} }}>{"—"}</output>\n`
      + `      <button type="button" data-hmi-type="HmiButton" data-hmi-graphic="Icon_Diagnostic" aria-label="Diagnostica ${name}" style={{ position: "absolute", left: ${current ? 504 : 503}, top: ${current ? 188 : 315}, width: 60, height: 51, border: "1px solid ${color("commandBorder")}", borderRadius: 4, background: "${color("command")}", cursor: "pointer" }} />\n`
      + `      <span data-hmi-type="HmiPolygon" aria-hidden="true" style={{ position: "absolute", left: 511, top: ${top + 34}, width: 22, height: 20, background: "${color("command")}", clipPath: "polygon(0 0, 100% 50%, 0 100%)" }} />\n`;
  return card({ left: 26, top: 82, width: 506, height: 119, title: "Format in use" })
    + label(38, cardBody(82) + 6, "Format group", 130)
    + selectField(175, cardBody(82) + 3, ["Line 1", "Line 2", "Line 3"], "Line Selection", 298)
    + chooser(204, "Format", true)
    + chooser(332, "Pallet", false)
    + `      <button type="button" data-hmi-type="HmiButton" data-plc-variable="Confirm_Change_Pressed" data-plc-write="pulse" data-hmi-action="load-format" data-hmi-target-expression="Program_Selection_In_Use_L[Line Selection-1]" data-hmi-source-tag="Program_Selection_Session" style={{ position: "absolute", left: 26, top: 481, width: 376, height: 97, display: "grid", placeItems: "center", border: "1px solid ${color("commandBorder")}", borderRadius: 4, background: "${color("command")}", color: "white", fontFamily: ${JSON.stringify(typography.cssFamily)}, fontSize: ${typography.body.size}, fontWeight: 700, cursor: "pointer" }}>Load format</button>\n`
    + doneLegend(415, 487, "Program_Selection_Successfully_L[Program_Selection_Session-1]", "Program_Selection_Error_L[Program_Selection_Session-1]")
    + card({ left: listLeft, top: 41, width: listWidth, height: 574, title: "Available formats" })
    + rows
    + `      <div data-hmi-type="HmiRectangle" aria-hidden="true" style={{ position: "absolute", left: 1164, top: 119, width: 39, height: 456, borderRadius: 4, background: "${color("plate")}" }} />\n`
    + `      <button type="button" data-hmi-type="HmiButton" data-hmi-graphic="WizardBack" data-plc-variable="Program_List_Pointers" data-plc-write="decrease" data-plc-step="1" data-hmi-min="0" aria-label="Formati precedenti" style={{ position: "absolute", left: 1164, top: 81, width: 40, height: 40, border: "1px solid ${color("commandBorder")}", borderRadius: 4, background: "${color("command")}", color: "white", cursor: "pointer" }}>▲</button>\n`
    + `      <button type="button" data-hmi-type="HmiButton" data-hmi-graphic="WizardNext" data-plc-variable="Program_List_Pointers" data-plc-write="increase" data-plc-step="1" data-hmi-max="87" aria-label="Formati successivi" style={{ position: "absolute", left: 1164, top: 575, width: 40, height: 40, border: "1px solid ${color("commandBorder")}", borderRadius: 4, background: "${color("command")}", color: "white", cursor: "pointer" }}>▼</button>\n`
    + swipeContract(9, 14, 1215, 689, undefined, "7041_Format_Copy_Normal");
}

/** 7041 Format Copy: due schede identiche, la seconda spostata in basso a destra come nell'export,
 * e in mezzo la grafica della freccia che dice da dove a dove si copia. */
function formatCopyBody(): string {
  const group = (left: number, top: number, name: string, variable: string, fieldLeft: number, fieldTop: number, textLeft: number) =>
    card({ left, top, width: 886, height: 172, title: name })
      + `      <input data-hmi-type="HmiIOField" data-plc-variable="${variable}" defaultValue="0" style={{ position: "absolute", left: ${fieldLeft}, top: ${fieldTop}, width: 101, height: 40, padding: "0 10px", border: "1px solid ${color("border")}", borderRadius: ${fieldSize.radius}, background: "${color("field")}", color: "${color("text")}", fontFamily: ${JSON.stringify(typography.cssFamily)}, fontSize: ${typography.body.size}, textAlign: "center" }} />\n`
      + `      <output data-hmi-type="HmiTextBox" data-plc-variable="ProgModN_PLC_Prog_Description" data-hmi-text-expression="ProgModN_PLC_Prog_Description[${variable}]" style={{ position: "absolute", left: ${textLeft}, top: ${fieldTop}, width: 690, height: 40, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: ${fieldSize.radius}, border: "1px solid ${color("border")}", background: "${color("field")}", color: "${color("text")}", fontSize: ${typography.body.size} }}>{"—"}</output>\n`;
  return `      <img data-hmi-type="HmiGraphicView" data-hmi-graphic="Arrow_Copy_1" src="/placeholder.svg" alt="Freccia copia formato" style={{ position: "absolute", left: 0, top: 0, width: 163, height: 120, objectFit: "contain" }} />\n`
    + `      <img data-hmi-type="HmiGraphicView" data-hmi-graphic="Arrow_Copy_1" src="/placeholder.svg" alt="Freccia copia formato" style={{ position: "absolute", left: 11, top: 12, width: 152, height: 120, objectFit: "contain" }} />\n`
    + group(74, 73, "Source format", "Program_Copy_Source", 106, 152, 236)
    + group(269, 230, "Target format", "Program_Copy_Destination", 301, 314, 431)
    + `      <button type="button" data-hmi-type="HmiButton" data-plc-variable="Program_Copy_Start_Copy" data-plc-write="pulse-bit-0" data-hmi-action="copy-format" data-hmi-progress-tag="Program_Copy_Copy_In_Progress" style={{ position: "absolute", left: 494, top: 478, width: 358, height: 83, display: "grid", placeItems: "center", border: "1px solid ${color("commandBorder")}", borderRadius: 4, background: "${color("command")}", color: "white", fontFamily: ${JSON.stringify(typography.cssFamily)}, fontSize: ${typography.body.size}, fontWeight: 700, cursor: "pointer" }}>Copy format</button>\n`
    + doneLegend(864, 477, "Program_Copy_Succesfully", "Program_Copy_Error")
    + swipeContract(8, 8, 1215, 689, "7001_Formats_Normal", "7081_Pallet_Store_Selection");
}

/** 7081 Pallet Store Selection: la grafica del magazzino al centro, e due schede — il tipo e il
 * posto — con il poligono che le lega al punto giusto dell'immagine. */
function palletSelectionBody(): string {
  const chooser = (left: number, top: number, name: string, hint: string, variable: string, selectLeft: number, selectTop: number, selectWidth: number) =>
    card({ left, top, width: 326, height: 165, title: name })
      + label(left + 12, cardBody(top) + 11, hint, 200)
      + `      <select data-hmi-type="HmiSymbolicIOField" data-plc-variable="${variable}" data-hmi-resource-list="Pallet Type" style={{ position: "absolute", left: ${selectLeft}, top: ${selectTop}, width: ${selectWidth}, height: 55, padding: "0 48px 0 12px", border: "1px solid ${color("borderStrong")}", borderRadius: 4, background: "${color("panel")}", color: "${color("text")}", fontFamily: ${JSON.stringify(typography.cssFamily)}, fontSize: ${typography.body.size} }}><option>1</option><option>2</option><option>3</option><option>4</option></select>\n`;
  return `      <span data-hmi-type="HmiEllipse" aria-hidden="true" style={{ position: "absolute", left: 289, top: 429, width: 684, height: 174, borderRadius: "50%", background: "rgba(92, 92, 92, .14)", transform: "rotate(-7deg)" }} />\n`
    + `      <img data-hmi-type="HmiGraphicView" data-hmi-graphic="Pallet_Store_Type" src="/placeholder.svg" alt="Grafica magazzino pallet" style={{ position: "absolute", left: 195, top: 59, width: 830, height: 548, objectFit: "contain" }} />\n`
    + `      <svg data-hmi-type="HmiPolygon" aria-label="Tipo scelto" viewBox="0 0 116 113" style={{ position: "absolute", left: 776, top: 233, width: 116, height: 113 }}><polygon points="43,9 0,113 116,0" fill="${color("panelMuted")}" stroke="${color("borderStrong")}" strokeWidth="2" /></svg>\n`
    + `      <svg data-hmi-type="HmiPolygon" aria-label="Posto scelto" viewBox="0 0 147 107" style={{ position: "absolute", left: 303, top: 317, width: 147, height: 107 }}><polygon points="0,0 147,107 83,0" fill="${color("panelMuted")}" stroke="${color("borderStrong")}" strokeWidth="2" /></svg>\n`
    + chooser(85, 162, "Pallet type", "Type", "Pallet_Type_Store_N2", 109, 244, 275)
    + chooser(782, 80, "Pallet store", "Position", "Pallet_Type_Store_N1", 811, 162, 272)
    + swipeContract(8, 8, 1215, 689, "7041_Format_Copy_Normal");
}

/** Il corpo della pagina: e' quello che cambia da una famiglia all'altra. Il titolo arriva da qui
 * perche' non tutte le famiglie lo mettono nello stesso posto. */
export function standardPageTemplateBody(id: StandardPageTemplateId, title = "Pagina"): string {
  if (isMainEmptyTemplate(id)) return mainEmptyTemplateBody(id);
  if (isProgramSettingsTemplate(id)) return programSettingsTemplateBody(id);
  if (isClvSettingsTemplate(id)) return clvSettingsTemplateBody(id, title);
  if (isManualTemplate(id)) return manualTemplateBody(id, title);
  if (isDiagnosticTemplate(id)) return diagnosticTemplateBody(id, title);
  switch (id) {
    case "blank": return "";
    case "data-board": return board(title, "Contenuto caricato dal controllo a runtime");
    case "machine-render": return machineViewBody();
    case "special-function": return specialFunctionTemplateBody(title);
    case "production-overview": return omacBody(title);
    case "command-grid": return robotPopupBody();
    case "web-content": return chatBotBody();
    case "program-modification": return programModificationBody();
    case "program-layer": return programLayerBody();
    case "program-pallet": return programPalletBody();
    case "program-callouts": return programCalloutsBody();
    case "program-infeed": return programInfeedBody();
    case "program-robot": return programRobotBody();
    case "program-quotes": return programQuotesBody();
    case "program-squaring": return programSquaringBody();
    case "encoder-index": return encoderIndexBody();
    case "encoder-settings": return encoderSettingsBody(title);
    case "encoder-drawing": return encoderDrawingBody(title);
    case "motor-speed": return motorSpeedTemplateBody(title);
    case "robot-function": return robotFunctionTemplateBody();
    case "lubrification": return lubricationTemplateBody();
    case "device-control": return guideControlTemplateBody();
    case "motor-box-control": return motorBoxControlTemplateBody();
    case "motor-control": return motorControlTemplateBody();
    case "system-function": return systemFunctionBody();
    case "alarms": return alarmTableBody("active");
    case "alarm-zone": return alarmTableBody("zone");
    case "alarm-history": return alarmTableBody("history");
    case "media": return alarmMediaBody();
    case "statistics": return statisticsBody();
    case "statistics-production": return statisticsReportBody("production");
    case "statistics-availability": return statisticsReportBody("availability");
    case "manual-station": return manualTemplateBody("manual-infeed", title);
    case "format-manager": return formatManagerBody();
    case "format-copy": return formatCopyBody();
    case "pallet-selection": return palletSelectionBody();
  }
}

/** Le righe di import della pagina, quando la famiglia ne ha bisogno. Ce l'ha solo la 2002, che
 * tiene lo stato dei quattro tag a passo per far muovere i pacchi. */
export function templateImports(id: StandardPageTemplateId): string {
  if (id === "program-layer") return 'import { useState } from "react";\n\n';
  if (id === "system-function") return systemFunctionTemplateImports;
  return "";
}

/** Il codice che sta fra la firma del componente e il `return`. */
export function templatePreamble(id: StandardPageTemplateId): string {
  if (id === "program-layer") return programLayerPreamble();
  if (id === "system-function") return systemFunctionTemplatePreamble;
  return "";
}

/** Le famiglie che aprono un'altra pagina con il doppio click: solo a quelle serve `openPage`. */
export function templateNeedsNavigation(id: StandardPageTemplateId): boolean {
  // Il sinottico e la diagnostica per dispositivo non ci sono piu': aprono un popup, non una pagina.
  return id === "machine-map" || id === "diagnostic-zone" || id === "encoder-index" || id === "clv-index" || id === "motor-box-control";
}

/** Quante linguette mostra la pagina nella schermata vera. Zero vuol dire che non ne ha: la lista
 * allarmi, per esempio, al loro posto ha il bottone rosso di aggiornamento. */
const folderCount: Record<StandardPageTemplateId, number> = {
  "blank": 1, "data-board": 1, "machine-render": 2, "special-function": 1, "production-overview": 1, "command-grid": 10, "web-content": 1,
  "machine-downstair": 2, "main-counters": 1, "main-collector-counters": 1, "main-free": 1, "main-maintenance": 1,
  "program-modification": 10, "program-layer": 10, "program-pallet": 10, "program-callouts": 10,
  "program-infeed": 10, "program-robot": 10, "program-quotes": 10, "program-squaring": 10,
  "program-classic-product": 10, "program-classic-layer": 10, "program-classic-row": 10, "program-classic-pallet": 10,
  "program-classic-line": 10, "program-classic-delays": 10, "program-classic-centering": 10,
  "program-classic-pre-squaring": 10, "program-classic-post-squaring": 10, "program-classic-padstore": 10,
  "program-nemo-product": 3, "program-nemo-squaring": 3, "program-nemo-robot": 3,
  "program-sweep-product": 2, "program-sweep-line": 2,
  "program-pouches-product": 3, "program-pouches-robot": 3, "program-pouches-tray": 3,
  "encoder-index": 0, "encoder-settings": 2, "encoder-drawing": 2, "motor-speed": 1, "robot-function": 1,
  "lubrification": 1, "device-control": 3, "motor-box-control": 3, "motor-control": 3, "system-function": 1,
  "alarms": 0, "alarm-zone": 1, "alarm-history": 1, "media": 1,
  "statistics": 1, "statistics-production": 1, "statistics-availability": 1,
  "machine-map": 1, "manual-infeed": 1, "manual-preforming": 1, "manual-layer-pusher": 1,
  "manual-lifter": 1, "manual-tie-sheet": 1, "manual-pallet-conveyor": 1, "manual-station": 1,
  "synoptic": 1, "diagnostic-robot": 1, "diagnostic-zone": 1, "device-diagnostic": 1,
  "diagnostic-maintenance": 1, "diagnostic-profinet": 1, "diagnostic-free": 1,
  "format-manager": 1, "format-copy": 1, "pallet-selection": 1,
  // Il blocco CLV e' fatto di tredici schermate: l'indice, che di linguette non ne ha nessuna
  // perche' ha le piastrelle, e le dodici sorelle, che le portano tutte e tredici.
  "clv-index": 0, "clv-fifo": 13, "clv-centering": 13, "clv-spacers": 13, "clv-doser": 13,
  "clv-grip": 13, "clv-extra": 13, "clv-preforming": 13, "clv-languages": 13, "clv-mmc": 13,
  "clv-padstore": 13, "clv-pallet-store": 13, "clv-lines": 13,
};

export const templateFolders = (id: StandardPageTemplateId): number => folderCount[id] ?? 0;

/** Le linguette a destra prendono il colore della sezione in cui sta la pagina. */
export function templateFolderTabs(sectionId: string | undefined, id: StandardPageTemplateId, active = 0, routes: readonly string[] = []): string {
  const section = sections.find((item) => item.id === sectionId);
  const count = templateFolders(id);
  if (!section || (count < 1 && routes.length < 1)) return "";
  // Nella foto 0109 la linguetta della 6241 e' arancione, pur restando aperta la sezione Diagnostic:
  // e' un'anomalia dello standard reale e non va normalizzata in blu dal generatore.
  const tabColor = id === "diagnostic-free"
    ? cssColor(sections.find((item) => item.id === "settings")!.color.top)
    : cssColor(section.color.top);
  return folderTabs(count, tabColor, shellTags.folderVisible, active, routes);
}
