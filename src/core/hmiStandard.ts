import type { HmiScriptProgram } from "./hmiScript";

/** The company HMI standard, as data.
 *
 * Lo standard aziendale è un progetto WinCC Unified (TIA V20) con un guscio fisso e una regola di
 * numerazione rigida: la sezione si illumina nella barra laterale in base al numero della pagina
 * aperta, e lo stesso numero va al PLC. Finché quel numero è giusto tutto funziona; se è sbagliato
 * non si rompe niente in modo visibile — semplicemente il menu non si accende più e il PLC crede che
 * l'operatore sia altrove. Per questo la regola sta qui, in un posto solo, e non sparsa nei template.
 *
 * Le misure e i colori vengono dall'export in `standard/` (vedi STANDARD-HMI.md): non sono scelte di
 * design, sono rilievi. */

/** Un colore dello standard, nel formato che esce da Openness. */
export type ArgbColor = `#${string}`;

// ---------------------------------------------------------------------------- tela e guscio

/** La risoluzione del pannello: `SR_1280X800`. */
export const panelSize = { width: 1280, height: 800 } as const;

/** Le quattro finestre del layout PC (`0000_Layout_PC`). */
export const desktopShell = {
  topBar: { left: 0, top: 0, width: 1280, height: 151, screen: "TopBar" },
  lateralBar: { left: 0, top: 151, width: 80, height: 649, screen: "Lateral Bar" },
  /** Dove vive la pagina di contenuto. */
  content: { left: 80, top: 151, width: 1200, height: 649 },
  /** Il pannello a scomparsa, sopra tutto il resto. */
  submenu: { left: 0, top: 0, width: 1280, height: 800 },
} as const;

/** Le finestre del layout mobile (`0000_Layout_Mobile`). La pagina di contenuto è la stessa del PC. */
export const mobileShell = {
  topBar: { left: 0, top: 0, width: 1280, height: 70, screen: "TopBar_Light" },
  topBarBig: { left: 0, top: 0, width: 1280, height: 350, screen: "TopBar_Big" },
  navigator: { left: 0, top: 47, width: 1280, height: 64 },
  content: { left: 0, top: 105, width: 1280, height: 694 },
  lowBar: { left: 0, top: 750, width: 1280, height: 50, screen: "LowBar" },
  submenu: { left: 0, top: 0, width: 1280, height: 800 },
} as const;

/** Le pagine di contenuto sono disegnate 1280x694 e poi adattate dalla finestra `SW_Screen`, che è
 * 1200x649. È un'incoerenza dello standard, non un errore di lettura: la tela di progetto è questa. */
export const pageCanvas = { width: 1280, height: 694 } as const;

/** La barra laterale: icona 60x60, etichetta 61x18 subito sotto, passo verticale 94. */
export const lateralBar = {
  iconLeft: 14,
  iconSize: 60,
  firstIconTop: 7,
  pitch: 94,
  labelOffset: 61,
  labelWidth: 61,
  labelHeight: 18,
  /** Opacità di una voce non selezionata: la selezione è un `Opacity <= Actual_Page_Number [Range]`. */
  inactiveOpacity: 0.5,
} as const;

/** Il pannello a scomparsa `Nxxxx_<Sezione>_Template`: non è un template, è il sottomenu. */
export const submenuPanel = {
  panel: { left: 131, width: 210, height: 290 },
  /** Il triangolino che punta all'icona della barra laterale. */
  pointer: { left: 102, width: 30, height: 43 },
  /** `first` e' lo scarto della prima voce dal bordo del pannello: 168 - 160. */
  entry: { left: 189, width: 158, height: 34, pitch: 40, first: 8 },
  separator: { left: 132, width: 200, height: 2 },
  /** Il pannello sta 38 sopra l'icona della sezione, il triangolino 4 sotto il bordo alto. */
  iconLead: 38,
  pointerLead: 4,
  /** Dove sta il triangolino dentro il pannello nelle schermate di mezzo dell'export. */
  pointerOffset: 42,
  /** Non sale sopra la pagina e non esce dal fondo: 9 px sotto il guscio, 10 px dal bordo basso. */
  topMargin: 9,
  bottomMargin: 10,
  /** Il velo che chiude il pannello: un pulsante trasparente grande quanto lo schermo. */
  backdrop: { left: 0, top: 0, width: 1280, height: 800 },
  maxEntries: 7,
} as const;

/** I colori del sottomenu, che non sono ne' quelli del guscio ne' quelli delle pagine.
 *
 * Il pannello e' un grigio chiaro con la scritta quasi nera: campionato con un lettore di pixel su
 * `0001_Menu_1xxxx_Main_Template`, `0085_Menu_3xxxx_Alarms_Template` e
 * `0102_Menu_6xxxx_Diagnostic_Template` in `FotoStandardManu/Desktop`, che danno gli stessi tre
 * valori. Mentre il pannello e' aperto lo schermo va in penombra: il bianco della pagina sotto (255)
 * finisce intorno a 100, cioe' un velo nero al 61 %. Il gemello e' `submenuPalette` in
 * `templateHmi/templates/_standard/hmiStandard.js`. */
export const submenuPalette = {
  panel: "#FFC8C8C8",
  separator: "#FFC0C0C0",
  text: "#FF323232",
  scrim: "#9B000000",
} as const;

/** Il navigatore mobile `Nxxxx_<Sezione>_Template_Navigator`: la stessa lista come tab orizzontali. */
export const mobileNavigator = {
  height: 64,
  tab: { left: 1, width: 157, height: 43 },
  /** La barretta della tab attiva, pilotata anche lei da `Actual_Page_Number`. Non sta sotto la
   * tab: sta sugli ultimi 5 px della tab (Top 38 di 43), e larga 158 sborda di 1 px per lato. */
  underline: { left: 0, top: 38, width: 158, height: 5 },
  /** Il distintivo della sezione a sinistra: 71x60 a (-6, 3), con dentro l'icona 46x42 a (12, 21).
   * Torna a `Main_Mobile`. */
  badge: { left: -6, top: 3, width: 71, height: 60, icon: { left: 12, top: 21, width: 46, height: 42 } },
  /** Le tab cominciano dopo il distintivo e valgono 158 l'una. La prova che 71 e 158 sono giusti sta
   * nella sezione Settings, l'unica con otto voci: 71 + 7*158 = 1177, e i 103 px che restano fino a
   * 1280 sono esattamente la larghezza della sua ottava tab. */
  firstTabLeft: 71,
  pitch: 158,
  /** Lo sfondo della striscia e' una grafica TIA (`PatternBN`), che nell'export non c'e'. */
  background: "PatternBN",
} as const;

/** Il menu delle sezioni del layout mobile: `Nxxxx_<Sezione>_Template_1`.
 *
 * In mobile la barra laterale non c'e': le sezioni sono nove quadrati 80x80 in mezzo allo schermo,
 * tre per riga, uguali in tutte e sette le schermate. I nove sono le sette sezioni piu' l'utente e
 * il cambio layout. Il pannello del sottomenu e' lo stesso del desktop: cambia solo dove si apre e
 * da che parte guarda il triangolino. Il gemello e' `mobileSectionMenu` in
 * `templateHmi/templates/_standard/hmiStandard.js`. */
export const mobileSectionMenu = {
  size: 80,
  columns: [451, 600, 749],
  rows: [216, 366, 511],
  /** Fra il quadrato e il pannello ci sono 40 px, che il triangolino attraversa. */
  gap: 40,
  /** Quanto sotto il bordo alto del quadrato sta la punta del triangolino: nell'export fra 13 e 20. */
  pointerLead: 17,
  extras: ["user", "layout"],
} as const;

/** Lo schema di riga della sezione Settings: rettangolo 403x75 a x=20, passo 78, sette righe. */
export const settingsRow = {
  left: 20,
  firstTop: 60,
  width: 403,
  height: 75,
  pitch: 78,
  rows: 7,
  label: { offsetLeft: 14, offsetTop: 16, width: 213, height: 43 },
  /** Il controllo a destra: o un campo, o l'interruttore a due immagini. */
  field: { left: 348, width: 70, height: 33 },
  toggle: { left: 297, width: 101, height: 50 },
} as const;

/** La cornice e le due lastre di una pagina di contenuto. */
export const pageFrame = {
  frame: { left: 9, top: 8, width: 1214, height: 681 },
  header: { width: 1192, height: 37, titleLeft: 16 },
  rightBoard: { left: 428, top: 60, width: 784, height: 618 },
  /** Le schede in alto a destra: `BackColor <= Folder_Vis [Range]`. */
  folderTab: { width: 63, height: 31 },
} as const;

/** Il controllo allarmi di `3001_Alarms`, misurato sul JSON e sulla foto della pagina.
 *
 * È l'unico `HmiAlarmControl` dello standard: 1197x624 a (16,55), sotto la barra bianca del titolo.
 * Le colonne visibili di `AlarmView` sono sei; la settima, quella dei numeri di riga, è
 * l'intestazione di riga del controllo (`RowHeaderType: "Index"`) e prende i 57 px che restano.
 * Le righe sono alte 28 e ne entrano 21.
 *
 * Il reticolo è solo verticale (`GridLineVisibility: "Vertical"`): fra una riga e l'altra non c'è
 * una linea, c'è il grigio alternato di `pagePalette.panelMuted`. Il testo è a 15 px dal bordo
 * sinistro della cella (`CellPadding.Left`). Lo storico `3081_Alarms_History` è la stessa pagina:
 * cambia solo il comando in alto a destra. */
export const alarmControl = {
  left: 16, top: 55, width: 1197, height: 624,
  head: 30, row: 28, visibleRows: 21,
  cellPadding: 15,
  /** L'intestazione bianca sopra il controllo: 1195x37 a (18,18), titolo a sinistra da 32. */
  board: { left: 18, top: 18, width: 1195, height: 37, titleLeft: 32 },
  /** "Troubleshooting:" e il bottone che apre il PDF, solo nella pagina degli allarmi attivi. */
  troubleshooting: {
    label: { left: 1038, top: 25, width: 114, height: 24 },
    button: { left: 1164, top: 18, width: 49, height: 38 },
  },
  /** Il comando largo che nello storico prende il posto dei due qui sopra. */
  historyCommand: { left: 1043, top: 19, width: 168, height: 35 },
  /** La colonna dei numeri di riga più le sei colonne visibili di `AlarmView`. */
  columns: [
    { id: "index", width: 57, caption: "" },
    { id: "id", width: 45, caption: "ID" },
    { id: "category", width: 50, caption: "Cat" },
    { id: "text", width: 600, caption: "Alarm text" },
    /** Nel JSON si chiama `EM` (Equipment Module); sui pannelli con le unità è la `UN`. */
    { id: "unit", width: 85, caption: "UN" },
    { id: "time", width: 160, caption: "Time" },
    { id: "unitName", width: 200, caption: "UN - Name" },
  ],
} as const;

/** I tag che i bottoni della pagina allarmi scrivono davvero, presi dagli script di `3001_Alarms`. */
export const alarmTags = {
  /** Il bottone rosso in alto a destra: copia gli allarmi per il PLC. */
  startCopy: "Start_Copy",
  doneCopy: "Done_Copy",
  requestId: "ID_Req_HMI",
  /** Il bottone con la lampadina: apre `9003_PDF_Troubleshooting_NodeRed` in popup. */
  openTroubleshooting: "Trigger_Open_Troubleshooting",
} as const;

/** La pagina a due colonne di valori, misurata su `2285_CLV_User_Doser_Config`.
 *
 * È la seconda forma più diffusa dopo le righe di impostazione: intestazione di pagina larga 1188,
 * poi due colonne larghe 590 che partono da 20 e da 618. Ogni colonna è una testata alta 37 e un
 * corpo alto 577 staccato di 3 px — i 3 px sono la pagina che si vede in mezzo, non un bordo.
 *
 * Dentro il corpo le righe sono etichetta più campo: il campo è 88x33 a 263 dal bordo della
 * colonna, l'etichetta alta 21 a 20, e il passo è 59. La prima riga ha il campo a 27 dal bordo
 * alto del corpo. */
export const twoColumnPage = {
  header: { left: 20, top: 19, width: 1188, height: 37, titleLeft: 34 },
  column: { top: 60, width: 590, head: 37, bodyTop: 100, bodyHeight: 577, gap: 3, lefts: [20, 618] },
  /** La scritta dentro la testata di una colonna. */
  caption: { offsetLeft: 14, offsetTop: 8, height: 21 },
  row: {
    pitch: 59,
    firstTop: 27,
    label: { left: 20, offsetTop: 6, height: 21 },
    field: { left: 263, width: 88, height: 33 },
  },
} as const;

// ---------------------------------------------------------------------------- tavolozza e font

/** I colori rilevati nelle schermate del guscio, in `#AARRGGBB`. `#00…` è trasparente ed è usato
 * apposta per dire "nessuno sfondo". */
export const palette = {
  surface: "#FF48494E",
  surfaceDark: "#FF333333",
  surfaceBlue: "#FF404D53",
  border: "#FF64646A",
  borderLight: "#FF7D7D85",
  borderDark: "#FF474957",
  text: "#FFF2F4FF",
  textWhite: "#FFFFFFFF",
  textMuted: "#FFB5BEC5",
  textDim: "#FFCDD3D7",
  grey: "#FF808080",
  greyLight: "#FF91939A",
  greyBlue: "#FF859399",
  /** Il petrol Siemens: è l'accento dello standard. */
  accent: "#FF00A1D1",
  confirm: "#FF00FF00",
  transparent: "#00F2F4FF",
} as const satisfies Record<string, ArgbColor>;

/** Le pagine viste nelle foto non usano la tavolozza scura del guscio.
 *
 * Questi valori non sono scelti a occhio: sono campionati dalle immagini in `FotoStandardManu` con
 * un lettore di pixel (fondo pagina, schede, separatori, campi, switch, tabelle). Dove la foto non
 * puo' dirlo — nelle 279 immagini nessuno switch e' acceso — il valore e' segnato come da
 * confermare, cosi' nessuno lo scambia per una misura. */
export const pagePalette = {
  /** Il grigio della pagina, sotto le schede bianche. */
  canvas: "#FFCFCFCF",
  panel: "#FFFFFFFF",
  /** La riga alternata delle tabelle. */
  panelMuted: "#FFF2F2F5",
  /** Il grigio che separa una scheda dall'altra: e' la pagina che si vede fra due bianchi. */
  separator: "#FFCFCFCF",
  /** Il bordo sottile di un campo. */
  border: "#FFD9D9D9",
  /** Il bordo di un select e dei controlli con rilievo. */
  borderStrong: "#FFA2A2A6",
  text: "#FF171717",
  /** Il titolo di una scheda. */
  title: "#FF333333",
  /** L'etichetta sopra un campo. */
  textMuted: "#FF6B6B6B",
  field: "#FFFFFFFF",
  fieldReadOnly: "#FFEDEDEF",
  /** Il bottone del select: sfumatura chiaro -> scuro. */
  controlLight: "#FFE8E8E8",
  controlDark: "#FFB4B4B4",
  command: "#FF2E2F32",
  commandBorder: "#FF56575C",
  /** Lo switch spento, misurato: e' magenta, non rosso. */
  off: "#FFE00046",
  /** Lo switch acceso, misurato sul "CONFIGURED" della pagina 2201: e' l'unico acceso di tutte le foto. */
  on: "#FFAAE682",
  /** Il pallino rosso degli stati non raggiunti (Ready, Homed, ...) nelle pagine dispositivo. */
  statusBad: "#FFDE3858",
  warning: "#FFFF9800",
  /** Il rosso dei comandi distruttivi e del refresh allarmi. */
  danger: "#FFC40000",
  selection: "#FF00E832",
  /** Il grigino delle lastre di servizio e delle caselle del diagramma OMAC (1201): sta fra il
   * bianco della scheda e il grigio della pagina, ed e' misurato sulla foto. */
  plate: "#FFEFEFEF",
  /** I bordi delle caselle OMAC: verde per gli stati che agiscono, giallo per quelli fermi, blu per
   * Execute. Lo stato in corso si riempie di verde acceso (`palette.confirm`). */
  stateActing: "#FF009501",
  stateWaiting: "#FFE9EA00",
  stateExecute: "#FF537EFF",
  /** Le linee dei collegamenti nei diagrammi, misurate sulla 1201. */
  diagram: "#FF3B3B3B",
  tableStripe: "#FFF2F2F5",
  tableBorder: "#FFE9E9EC",
  tableHeadBorder: "#FFD6D6D6",
  /** Le linguette a destra della pagina quando non sono quella aperta. */
  tabInactive: "#FF6A6A6A",
  /** La piastrella delle pagine indice, misurata sulla 2041: sta sul fondo scuro, non sul chiaro. */
  indexTile: "#FF373737",
  /** Il fondo delle pagine indice: piu' chiaro in alto al centro e quasi nero ai bordi. */
  indexCanvas: "#FF303030",
  indexCanvasEdge: "#FF050505",
  /** Il verde-petrolio dell'area in cui si compone lo strato (2002) e del disegno del robot (2006). */
  layerCanvas: "#FF17868C",
  /** Il pacco dello schema strato: cartone chiaro con il bordo piu' scuro. */
  pack: "#FFEBC99A",
  packBorder: "#FFC89B5E",
} as const satisfies Record<string, ArgbColor>;

/** `#AARRGGBB` di Openness -> `#RRGGBB` o `rgba(...)` per il CSS. */
export function cssColor(color: ArgbColor | string): string {
  const hex = color.replace("#", "");
  if (hex.length !== 8) return color;
  const alpha = parseInt(hex.slice(0, 2), 16);
  const rgb = hex.slice(2);
  if (alpha === 255) return `#${rgb}`;
  const [r, g, b] = [rgb.slice(0, 2), rgb.slice(2, 4), rgb.slice(4, 6)].map((part) => parseInt(part, 16));
  return `rgba(${r}, ${g}, ${b}, ${(alpha / 255).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")})`;
}

/** Un solo font in tutto lo standard. Il fallback serve fuori dal pannello, dove non è installato. */
export const typography = {
  family: "SiemensSans",
  cssFamily: '"Siemens Sans", "SiemensSans", "Segoe UI", Arial, sans-serif',
  body: { size: 14, weight: 400 },
  heading: { size: 16, weight: 700 },
  headingLarge: { size: 18, weight: 700 },
  valueLarge: { size: 24, weight: 700 },
  valueHuge: { size: 32, weight: 700 },
} as const;

// ---------------------------------------------------------------------------- sezioni e numerazione

export interface StandardSection {
  /** La cifra della sezione: la pagina 2041 sta nella sezione 2. */
  number: number;
  id: string;
  /** Come si chiama nella barra laterale. */
  label: string;
  /** Il nome della grafica dell'icona nel progetto TIA. */
  icon: string;
  /** Il sottomenu desktop che l'icona apre. */
  submenuScreen: string;
  /** Il navigatore mobile che le voci del sottomenu aprono. */
  navigatorScreen: string;
  /** La posizione nella barra laterale, 0..6. */
  slot: number;
  /** Il colore della tessera nella barra laterale, campionato dalle foto: sfumatura dall'alto al
   * basso. La voce non attiva e' la stessa sfumatura a meta' opacita' sopra il nero. */
  color: { top: ArgbColor; bottom: ArgbColor };
}

/** Le sette voci fisse della barra laterale, nell'ordine in cui stanno sullo schermo. */
export const sections: StandardSection[] = [
  { number: 1, id: "main", label: "Main", icon: "Icon_MachineControl", submenuScreen: "1xxxx_Main_Template", navigatorScreen: "1xxxx_Main_Template_Navigator", color: { top: "#FF329664", bottom: "#FF216140" }, slot: 0 },
  { number: 2, id: "settings", label: "Settings", icon: "Icon_Settings_1", submenuScreen: "2xxxx_Settings_Template", navigatorScreen: "2xxxx_Settings_Template_Navigator", color: { top: "#FFFA6400", bottom: "#FFA14000" }, slot: 1 },
  { number: 3, id: "alarms", label: "Alarms", icon: "Icon_Alarms_2", submenuScreen: "3xxxx_Alarms_Template", navigatorScreen: "3xxxx_Alarms_Template_Navigator", color: { top: "#FFC20000", bottom: "#FF7D0000" }, slot: 2 },
  { number: 4, id: "statistics", label: "Statistics", icon: "Icon_Statistics", submenuScreen: "4xxxx_Statistics_Template", navigatorScreen: "4xxxx_Statistics_Template_Navigator", color: { top: "#FF00C9C9", bottom: "#FF008181" }, slot: 3 },
  { number: 5, id: "manuals", label: "Manuals", icon: "Icon_Manuals_2", submenuScreen: "5xxxx_Manuals_Template", navigatorScreen: "5xxxx_Manuals_Template_Navigator", color: { top: "#FFFAC800", bottom: "#FFA18000" }, slot: 4 },
  { number: 6, id: "diagnostic", label: "Diagnostic", icon: "Icon_Diagnostic", submenuScreen: "6xxxx_Diagnostic_Template", navigatorScreen: "6xxxx_Diagnostic_Template_Navigator", color: { top: "#FF96C8FA", bottom: "#FF6182A1" }, slot: 5 },
  { number: 7, id: "formats", label: "Formats", icon: "Icon_Formats", submenuScreen: "7xxxx_Formats_Template", navigatorScreen: "7xxxx_Formats_Template_Navigator", color: { top: "#FF963264", bottom: "#FF623242" }, slot: 6 },
];

/** La sezione 9 non sta nella barra laterale: sono i popup (`9001_Popup_Control_Panel`, …). */
export const popupSectionNumber = 9;

/** Quanti slot di menu ha una sezione, e quanti numeri di pagina ha uno slot. */
export const numbering = { slotsPerSection: 14, pagesPerSlot: 40 } as const;

export const sectionByNumber = (number: number) => sections.find((section) => section.number === number);
export const sectionById = (id: string) => sections.find((section) => section.id === id);

/** Il numero della voce di menu `slot` (0..13) della sezione: `N000 + 1 + 40*slot`. */
export function menuSlotNumber(sectionNumber: number, slot: number): number {
  return sectionNumber * 1000 + 1 + numbering.pagesPerSlot * slot;
}

/** Tutti i numeri di voce di una sezione: 1001, 1041, 1081, … */
export function menuSlotNumbers(sectionNumber: number): number[] {
  return Array.from({ length: numbering.slotsPerSection }, (_, slot) => menuSlotNumber(sectionNumber, slot));
}

/** Il numero della pagina `page` (0..39) dentro una voce di menu. La pagina 0 è la voce stessa. */
export function pageNumber(sectionNumber: number, slot: number, page = 0): number {
  return menuSlotNumber(sectionNumber, slot) + page;
}

export interface PageNumberParts {
  sectionNumber: number;
  /** La voce di menu che illumina il sottomenu: 0..13. */
  slot: number;
  /** La posizione dentro la voce: 0..39. */
  page: number;
  /** Il numero della voce di menu a cui la pagina appartiene. */
  menuNumber: number;
}

/** Scompone un numero di pagina, o `undefined` se non rispetta la regola. */
export function pageNumberParts(number: number): PageNumberParts | undefined {
  if (!Number.isInteger(number)) return undefined;
  const sectionNumber = Math.floor(number / 1000);
  // Le categorie aggiunte in Framecraft usano 10..99, senza alterare le sette sezioni WinCC.
  if (!sectionByNumber(sectionNumber) && sectionNumber !== popupSectionNumber && !(sectionNumber >= 10 && sectionNumber <= 99)) return undefined;
  const withinSection = number - sectionNumber * 1000 - 1;
  if (withinSection < 0) return undefined;
  const slot = Math.floor(withinSection / numbering.pagesPerSlot);
  if (slot >= numbering.slotsPerSection) return undefined;
  const page = withinSection % numbering.pagesPerSlot;
  return { sectionNumber, slot, page, menuNumber: menuSlotNumber(sectionNumber, slot) };
}

export const isValidPageNumber = (number: number) => pageNumberParts(number) !== undefined;

/** Il primo numero libero dentro una voce di menu, dati quelli già usati. `undefined` se lo slot è
 * pieno: quaranta pagine sotto una sola voce di menu vogliono dire che va aperta una voce nuova. */
export function nextPageNumber(sectionNumber: number, slot: number, taken: Iterable<number>): number | undefined {
  const used = new Set(taken);
  const first = menuSlotNumber(sectionNumber, slot);
  for (let page = 0; page < numbering.pagesPerSlot; page += 1) {
    if (!used.has(first + page)) return first + page;
  }
  return undefined;
}

/** Il primo slot di menu libero di una sezione: serve quando si aggiunge una voce al sottomenu. */
export function nextMenuSlot(sectionNumber: number, taken: Iterable<number>): number | undefined {
  const used = new Set<number>();
  for (const number of taken) {
    const parts = pageNumberParts(number);
    if (parts?.sectionNumber === sectionNumber) used.add(parts.slot);
  }
  for (let slot = 0; slot < numbering.slotsPerSection; slot += 1) if (!used.has(slot)) return slot;
  return undefined;
}

// ---------------------------------------------------------------------------- contratto tag

/** I tag del guscio: non sono della macchina, sono di come funziona lo standard. Una pagina che non
 * li scrive non si integra, per quanto sia bella. */
export const shellTags = {
  actualPageNumber: "Actual_Page_Number",
  pageNumberForPlc: "PV_ActualPageNumber_For_PLC",
  sessionIndex: "Enable_Session_Index",
  folderVisible: "Folder_Vis",
  popupVisible: "SW_PopUp_Visibility",
  popupSlideIn: "SW_PopUp_SlideIN",
  mobileLayout: "Mobile_Layout_Active",
} as const;

/** Le tre righe che ogni pagina di contenuto deve avere nel proprio `onLoaded`. */
export function pageLoadedScript(number: number, folderVisible = 1): string {
  return [
    `HMIRuntime.Tags.SysFct.SetTagValue("${shellTags.actualPageNumber}", ${number});`,
    `Tags("${shellTags.pageNumberForPlc}["+ Tags("${shellTags.sessionIndex}").Read() +"]").Write(${number});`,
    `HMIRuntime.Tags.SysFct.SetTagValue("${shellTags.folderVisible}", ${folderVisible});`,
  ].join("\n");
}

/** Le due `ChangeScreen` di una voce di sottomenu: una per il desktop, una per il navigatore mobile. */
export function menuEntryScript(screen: string, navigatorScreen: string): string {
  return [
    `HMIRuntime.Tags.SysFct.ResetBitInTag("${shellTags.popupVisible}", 0);`,
    `HMIRuntime.UI.SysFct.ChangeScreen("${screen}", "../SW_Screen");`,
    `HMIRuntime.UI.SysFct.ChangeScreen("${navigatorScreen}", "../SW_Navigator");`,
  ].join("\n");
}

// ---------------------------------------------------------------------------- oggetti e animazioni

/** I tipi di oggetto che lo standard usa davvero, dal più al meno frequente. Un template che ne usa
 * uno fuori da questa lista sta inventando qualcosa che il pannello vero non sa disegnare. */
export const itemTypes = [
  "HmiRectangle", "HmiTextBox", "HmiButton", "HmiIOField", "HmiGraphicView", "HmiLine", "HmiPolygon",
  "HmiCircle", "HmiTouchArea", "HmiEllipse", "HmiFaceplateContainer", "HmiSymbolicIOField",
  "HmiScreenWindow", "HmiCustomWidgetContainer", "HmiWebControl", "HmiDataGridViewPart", "HmiBar",
  "HmiGauge", "HmiRadioButtonGroup", "HmiAlarmControl",
] as const;

export type ItemType = (typeof itemTypes)[number];

/** Le proprietà che lo standard anima, con quante volte. È il capitolato minimo dell'Inspector: se
 * non sa esprimere "BackColor in funzione di un tag con soglie", non copre lo standard. */
export const dynamizedProperties: { property: string; uses: number }[] = [
  { property: "ProcessValue", uses: 974 },
  { property: "BackColor", uses: 735 },
  { property: "Visible", uses: 492 },
  { property: "Graphic", uses: 182 },
  { property: "Text", uses: 159 },
  { property: "Opacity", uses: 79 },
  { property: "Width", uses: 59 },
  { property: "Left", uses: 56 },
  { property: "Height", uses: 55 },
  { property: "Top", uses: 53 },
  { property: "ForeColor", uses: 50 },
  { property: "Enabled", uses: 8 },
  { property: "BorderWidth", uses: 7 },
  { property: "BorderColor", uses: 7 },
  { property: "AlternateBackColor", uses: 4 },
  { property: "IsSelected", uses: 3 },
  { property: "RotationAngle", uses: 3 },
  { property: "Url", uses: 1 },
  { property: "AngleRange", uses: 1 },
];

export type DynamizationKind = "Tag" | "ResourceList" | "Script" | "Expression" | "Flashing";
export type MappingConditionType = "None" | "Range" | "Singlebit" | "Expression";
export type HmiFlashingCondition = "Never" | "Always" | "RangeViolation";
export type HmiFlashingRate = "Slow" | "Medium" | "Fast";

/** Una proprietà legata a una sorgente: è così che nello standard un oggetto si "anima". */
export interface Dynamization {
  property: string;
  kind: DynamizationKind;
  /** Il tag letto da una sorgente `Tag` oppure usato per scegliere una voce di `ResourceList`. */
  tag?: string;
  /** Nome della lista risorse, espressione o funzione, per le sorgenti che non sono un tag diretto. */
  source?: string;
  /** Tag che riattivano uno script. Se assenti, WinCC usa automaticamente i tag letti dal codice. */
  triggers?: string[];
  /** Trigger ciclico alternativo, in millisecondi. */
  cycleMs?: number;
  /** Metadati prodotti dall'editor: il Runtime sa quali scritture riattivano lo script. */
  scriptTags?: { read: string[]; written: string[] };
  /** Programma gia' controllato: il pannello generato non porta con se' Babel e non usa eval. */
  program?: HmiScriptProgram;
  /** Configurazione Unified del lampeggio su una proprietà colore. */
  color?: string;
  alternateColor?: string;
  flashingCondition?: HmiFlashingCondition;
  flashingRate?: HmiFlashingRate;
  minimum?: number;
  maximum?: number;
  conditionType?: MappingConditionType;
  /** Le soglie del `ValueConverter`: sotto `Range` è `from`/`to`, sotto `Singlebit` è `condition`. */
  entries?: { from?: number; to?: number; condition?: string; value: string }[];
}

/** Le lingue del progetto, nell'ordine di `runtime-settings.json`. L'italiano è quella di default. */
export const languages = ["it-IT", "en-US", "fr-FR", "en-GB", "de-DE", "es-ES"] as const;
export const defaultLanguage = languages[0];

/** I testi di Openness sono frammenti XHTML (`<body><p>Testo</p></body>`), non stringhe. Chi genera
 * un template deve estrarre il testo, non stampare il frammento. */
export function plainText(xhtml: string): string {
  return xhtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

/** Il testo di un `MultilingualText` esportato, nella lingua chiesta o nella prima disponibile. */
export function textIn(texts: Record<string, string> | string | undefined, language: string = defaultLanguage): string {
  if (!texts) return "";
  if (typeof texts === "string") return plainText(texts);
  const exact = texts[language];
  if (exact) return plainText(exact);
  for (const code of languages) if (texts[code]) return plainText(texts[code]);
  const first = Object.values(texts).find((value) => typeof value === "string" && value);
  return first ? plainText(first) : "";
}
