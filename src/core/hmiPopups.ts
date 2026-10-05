import { card, command, label, machineImage, selectField } from "./hmiPrimitives";
import { cssColor, pagePalette, typography } from "./hmiStandard";

/** I cinque popup dello standard, ridisegnati dai JSON di `9000_Various`.
 *
 * Erano i pezzi piu' inventati della palette: finestre 760x520 sul grigio scuro, con dentro sei
 * pulsanti "Avanti / Indietro / Apri / Chiudi / Reset / Abilita" che nel pannello vero non esistono.
 * L'export invece dice tutto: misure al pixel, quali pulsanti ci sono e su quale tag scrivono.
 *
 * | Popup | Misura vera | Quello che c'e' dentro |
 * | --- | --- | --- |
 * | 9001 Control Panel | 343x500 | scelta della zona, Start/Stop/Reset tondi, il selettore, avanti e indietro |
 * | 9002 Diag By Device | 670x250 | sei righe etichetta-valore e la X in alto a destra |
 * | 9003 PDF Troubleshooting | 1062x637 | un solo web control a tutta finestra, legato a `PDF_Name` |
 * | 9004 Manual Popup | 426x300 | il disegno del nastro con le frecce e i due pulsanti di scelta |
 * | 9010 Alarm Loading | 1280x800 | la schermata intera d'attesa, col logo in mezzo e un pulsante |
 *
 * I testi restano segnaposto dove l'export li tiene nel dizionario multilingua (`MultilingualText`)
 * e la lista `Panel_Control_Selection` e' esportata vuota: meglio un segnaposto dichiarato che una
 * scritta inventata che sembra vera. I tag invece sono quelli veri, e un test li ricontrolla. */

const color = (name: keyof typeof pagePalette) => cssColor(pagePalette[name]);
const font = JSON.stringify(typography.cssFamily);

export type HmiPopupComponentType =
  | "hmi-control-popup" | "hmi-device-diagnostic-popup" | "hmi-document-viewer-popup"
  | "hmi-manual-popup" | "hmi-alarm-loading-popup";

export interface HmiPopupShape {
  type: HmiPopupComponentType;
  /** La schermata dell'export da cui e' presa, misure comprese. */
  sourceScreen: string;
  width: number;
  height: number;
}

export const hmiPopupShapes: readonly HmiPopupShape[] = [
  { type: "hmi-control-popup", sourceScreen: "9001_Popup_Control_Panel", width: 343, height: 500 },
  { type: "hmi-device-diagnostic-popup", sourceScreen: "9002_Popup_Diag_By_Device", width: 670, height: 250 },
  { type: "hmi-document-viewer-popup", sourceScreen: "9003_PDF_Troubleshooting_PDF", width: 1062, height: 637 },
  { type: "hmi-manual-popup", sourceScreen: "9004_Manual Popup", width: 426, height: 300 },
  { type: "hmi-alarm-loading-popup", sourceScreen: "9010_Alarm_Loading", width: 1280, height: 800 },
];

// ---------------------------------------------------------------------------- i pezzi

const box = (left: number, top: number, width: number, height: number) =>
  `position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}`;

/** La cornice del popup: trasparente, perche' nell'export il popup non ha uno sfondo suo — quello
 * che si vede sono le sue schede bianche appoggiate sulla pagina che resta sotto. */
function frame(shape: HmiPopupShape, name: string, body: string): string {
  return `<section role="dialog" aria-label="${name}" data-hmi-type="HmiScreen" data-hmi-popup-screen="${shape.sourceScreen}" style={{ position: "relative", width: ${shape.width}, height: ${shape.height}, background: "transparent", color: "${color("text")}", fontFamily: ${font} }}>\n${body}    </section>`;
}

/** L'ombra del popup: nell'export non e' un effetto, sono due rettangoli grigi disegnati sotto le
 * schede e spostati di otto pixel. */
const shadow = (left: number, top: number, width: number, height: number) =>
  `      <div aria-hidden="true" style={{ ${box(left, top, width, height)}, borderRadius: 4, background: "${color("separator")}" }} />\n`;

/** Una cella con il bordo: e' il `Text box` bordato con cui la 9002 fa la sua griglia. */
function cellBox(left: number, top: number, width: number, height: number, text: string, head = false): string {
  return `      <div data-hmi-type="HmiTextBox" data-plc-variable="" style={{ ${box(left, top, width, height)}, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px", border: "1px solid ${color("border")}", background: "${head ? color("panelMuted") : color("panel")}", color: "${head ? color("title") : color("text")}", fontSize: ${typography.body.size}${head ? ", fontWeight: 700" : ""} }}>${text}</div>\n`;
}

/** Il pulsante tondo: nell'export e' un `btnWizard*` 82x82 che dentro non ha nessuna scritta — solo
 * un cerchio e un rettangolino disegnati. La parola sta nel `Text box` sopra, che qui c'e' gia':
 * ripeterla dentro al cerchio vorrebbe dire mettere una scritta che il pannello vero non ha. */
function roundCommand(left: number, top: number, size: number, name: string, variable: string): string {
  return `      <button type="button" data-hmi-type="HmiButton" aria-label="${name}" data-plc-variable="${variable}" data-plc-write="set" data-plc-step="0" style={{ ${box(left, top, size, size)}, border: "2px solid ${color("commandBorder")}", borderRadius: "50%", background: "${color("command")}" }} />\n`;
}

/** La X in alto a destra: nell'export si chiama `btnNok` ed e' larga 34. */
const closeButton = (left: number, top: number, width: number, height: number) =>
  command({ left, top, width, height, text: "X", tone: "danger" });

// ---------------------------------------------------------------------------- 9001

/** Il popup dei comandi zona: la 9001 si apre dalle pagine manuali e comanda **una zona alla
 * volta**. Il menu in alto sceglie la zona, e ogni pulsante scrive nel suo array all'indice della
 * zona scelta (`PV_Control_Panel_Start_PB["+Index_Zone+"]` nello script). Qui il tag e' dichiarato
 * senza indice, che e' il nome dell'array: l'indice lo mette la zona. */
function controlPanel(shape: HmiPopupShape): string {
  const commands = [[27, "Start", "PV_Control_Panel_Start_PB"], [130, "Stop", "PV_Control_Panel_Stop_PB"], [234, "Reset", "PV_Control_Panel_Reset_PB"]] as const;
  const labels = [[39, "Start", 58], [142, "Stop", 58], [252, "Reset", 46]] as const;
  return frame(shape, "Comandi della zona",
    shadow(17, 15, 325, 38) + shadow(17, 57, 325, 444)
    // La lista `Panel_Control_Selection` nell'export e' vuota: le zone sono un segnaposto.
    + selectField(9, 7, ["Zona 1", "Zona 2", "Zona 3", "Zona 4"], "Panel_Control_Selection_Zone", 325)
    + card({ left: 9, top: 49, width: 325, height: 444 })
    + labels.map(([left, text, width]) => label(left, 64, text, width)).join("")
    + commands.map(([left, name, tag]) => roundCommand(left, 97, 82, name, tag)).join("")
    + command({ left: 46, top: 188, width: 252, height: 161, text: "Selettore", variable: "PV_Control_Panel_Selector_Switch", write: "invert", step: 0 })
    // Nell'export il pulsante di sinistra scrive `Forward_PB` e quello di destra `Backward_PB`.
    + command({ left: 40, top: 361, width: 111, height: 113, text: "Avanti", variable: "PV_Control_Panel_Forward_PB", write: "set", step: 0 })
    + command({ left: 191, top: 361, width: 115, height: 113, text: "Indietro", variable: "PV_Control_Panel_Backward_PB", write: "set", step: 0 }));
}

// ---------------------------------------------------------------------------- 9002

/** La scheda del dispositivo: la apre la 6121 accanto al punto toccato. Nell'export non ha nessun
 * tag e nessun parametro — sono sei righe di testo che il runtime riempie — quindi qui e' una
 * griglia di celle vuote, pronte, con le sue misure vere. */
function deviceDiagnostic(shape: HmiPopupShape): string {
  const rows = [33, 69, 105, 141, 177, 213];
  return frame(shape, "Diagnostica del dispositivo",
    cellBox(1, 2, 124, 31, "Dispositivo", true)
    + cellBox(126, 2, 508, 31, "Descrizione", true)
    + closeButton(635, 1, 34, 33)
    + rows.map((top, index) => cellBox(0, top, 126, 36, `Proprieta' ${index + 1}`) + cellBox(126, top, 543, 36, "")).join(""));
}

// ---------------------------------------------------------------------------- 9003

/** Il visore del documento: una finestra grande con dentro un solo web control. La variante PDF
 * gli lega il nome del file (`PDF_Name`), quella Node-RED punta a un indirizzo. */
function documentViewer(shape: HmiPopupShape): string {
  return frame(shape, "Documento",
    `      <div data-hmi-type="HmiWebControl" data-plc-variable="PDF_Name" style={{ ${box(6, 0, 1052, 632)}, display: "grid", placeItems: "center", border: "1px solid ${color("border")}", background: "${color("panel")}", color: "${color("textMuted")}", fontSize: ${typography.body.size} }}>Scegli il PDF o l'indirizzo nell'Inspector</div>\n`
    + closeButton(1024, 0, 34, 31));
}

// ---------------------------------------------------------------------------- 9004

/** Il popup dei comandi manuali del nastro: sopra il disegno con le frecce, sotto i due pulsanti
 * che scelgono quale nastro comandare. Lo script legge `Enable_Session_Index` per sapere se scrivere
 * su `XPB1` o su `XPB2`, e poi ci mette 0 o 1: e' una scelta fra due, non un comando. */
function manualPopup(shape: HmiPopupShape): string {
  // Le quattro operazioni che l'editor sa scrivere (`increase`, `decrease`, `invert`, `set`) non
  // comprendono `SetTagValue`: il tag si dichiara, il valore lo dice il nome del pulsante.
  const chooser = (left: number, text: string) =>
    command({ left, top: 218, width: 185, height: 68, text, variable: "HMI_Conveyors_Manager_DB_XPB1_Number_Select" });
  return frame(shape, "Comandi manuali del nastro",
    card({ left: 0, top: 2, width: 425, height: 201 })
    // Le due grafiche sono `Manual SingleDouble_Conv` e `Manual SingleDouble_Pallet`: il nastro
    // sborda sopra la scheda di cinque pixel, come nell'export.
    + machineImage(50, -5, 297, 197, "Sostituisci con il disegno del nastro")
    + machineImage(58, 32, 98, 129, "Sostituisci con il disegno del pallet")
    + arrows()
    + card({ left: 0, top: 206, width: 425, height: 92 })
    + chooser(13, "Nastro 0")
    + chooser(226, "Nastro 1"));
}

/** Le due frecce curve disegnate sopra il nastro: nell'export sono due `Line` e due `Polygon`, e i
 * punti della punta sono quelli scritti nel JSON, uno per uno. */
function arrows(): string {
  const head = [[3, 9], [0, 9], [1, 6], [3, 3], [6, 1], [9, 0], [13, 0], [16, 1], [19, 2], [22, 0], [23, 10], [14, 8], [17, 5], [15, 4], [12, 3], [9, 3], [5, 6]];
  const polygon = (left: number, top: number) =>
    `<polygon points="${head.map(([x, y]) => `${left + x},${top + y}`).join(" ")}" fill="${color("title")}" />`;
  const line = (left: number, top: number) =>
    `<line x1="${left}" y1="${top}" x2="${left + 23}" y2="${top + 40}" stroke="${color("title")}" strokeWidth="2" />`;
  return `      <svg aria-hidden="true" viewBox="0 0 426 300" style={{ ${box(0, 0, 426, 300)}, pointerEvents: "none" }}>${line(169, 101)}${polygon(140, 153)}${line(302, 85)}${polygon(278, 136)}</svg>\n`;
}

// ---------------------------------------------------------------------------- 9010

/** La schermata d'attesa degli allarmi: non e' una finestrella, e' 1280x800, cioe' tutto il
 * pannello. Sotto c'e' un rettangolo con la sfumatura a tre colori, sopra la trama `PatternBN` al
 * 40% di opacita', in mezzo il logo, in alto l'icona con la riga di testo e in basso a destra un
 * solo pulsante, che rilancia la copia degli allarmi (`Start_Copy` da falso a vero). */
function alarmLoading(shape: HmiPopupShape): string {
  return frame(shape, "Attesa del caricamento allarmi",
    `      <div aria-hidden="true" style={{ ${box(-1, -1, 1280, 800)}, background: "linear-gradient(90deg, ${color("panel")}, ${color("canvas")}, ${color("panel")})" }} />\n`
    + `      <img data-hmi-type="HmiGraphicView" data-image-role="detail" src="/placeholder.svg" alt="Sostituisci con la trama di sfondo" style={{ ${box(11, -1, 1280, 800)}, objectFit: "cover", opacity: .4 }} />\n`
    + machineImage(34, 36, 43, 45, "Sostituisci con l'icona dell'avviso")
    // Il testo e' nel dizionario multilingua: qui resta una riga da riscrivere, con la sua misura
    // vera (342x45) e il suo corpo vero (30).
    + `      <span data-hmi-type="HmiTextBox" style={{ ${box(87, 36, 342, 45)}, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: 30, whiteSpace: "nowrap" }}>Caricamento allarmi</span>\n`
    + machineImage(527, 373, 225, 54, "Sostituisci con il logo")
    // `SetTagValue` non e' una delle quattro scritture dell'editor: il tag e' dichiarato, e il
    // secondo tag dello script (`ID_Req_HMI`, messo a 0) resta scritto qui.
    + command({ left: 1059, top: 694, width: 194, height: 78, text: "Ricarica", variable: "Start_Copy", icon: true }));
}

export function hmiPopupJsx(type: HmiPopupComponentType): string {
  const shape = hmiPopupShapes.find((item) => item.type === type)!;
  switch (type) {
    case "hmi-control-popup": return controlPanel(shape);
    case "hmi-device-diagnostic-popup": return deviceDiagnostic(shape);
    case "hmi-document-viewer-popup": return documentViewer(shape);
    case "hmi-manual-popup": return manualPopup(shape);
    case "hmi-alarm-loading-popup": return alarmLoading(shape);
  }
}
