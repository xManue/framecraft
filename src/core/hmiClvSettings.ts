import { card, field, label, machineImage, radioGroup, selectField, tile, toggle, zone } from "./hmiPrimitives";
import { cssColor, pagePalette, typography } from "./hmiStandard";

/** Il blocco CLV User: 2281 e le sue dodici sorelle, l'ultima famiglia dello standard che non aveva
 * una forma sua nell'editor.
 *
 * Due cose di questo blocco vanno dette subito, perche' cambiano quello che si puo' promettere:
 *
 * - **Non ci sono foto.** Delle tredici schermate non esiste nessuna immagine in `FotoStandardManu`,
 *   quindi queste pagine sono ricostruite dalle sole coordinate, dai tag e dagli script del JSON
 *   WinCC. Per questo il loro `visualStatus` e' `missing` e non `verified`: la geometria e' quella
 *   vera, i colori sono quelli dello standard, ma nessuno le ha confrontate con una fotografia.
 * - **I testi non ci sono nel JSON.** Ogni `Text box` e' un `Siemens.Engineering.MultilingualText`,
 *   cioe' un rimando al dizionario del progetto, non una scritta. Le etichette qui sotto sono
 *   ricavate dal nome del tag che sta accanto: `INPUT_Doser_Module_Lenght` diventa "Doser Module
 *   Lenght". E' l'unica cosa onesta da fare — meglio il nome del segnale che una frase inventata.
 *
 * I tag invece sono quelli veri, presi uno per uno dal JSON, e un test lo verifica. */

const color = (name: keyof typeof pagePalette) => cssColor(pagePalette[name]);

/** Il rettangolo di contenuto delle schermate CLV: nel JSON e' `recContentboard2_1` a (20, 19),
 * largo 1188. E' due pixel diverso dal foglio delle altre famiglie, e si tiene com'e'. */
const PAGE = { left: 20, top: 19, width: 1188 };

export type ClvSettingsTemplateId =
  | "clv-index" | "clv-fifo" | "clv-centering" | "clv-spacers" | "clv-doser" | "clv-grip"
  | "clv-extra" | "clv-preforming" | "clv-languages" | "clv-mmc" | "clv-padstore" | "clv-pallet-store"
  | "clv-lines";

/** Le dodici piastrelle della 2281, nell'ordine in cui la schermata le disegna: ognuna fa
 * `ChangeScreen` verso la sua sorella, dalla 2282 alla 2293. Nome, rotta e schermata stanno qui
 * una volta sola, cosi' l'indice e la mappa di copertura non possono contraddirsi. */
export const clvStations = [
  ["FIFO", "fifo", "2282_CLV_User_FIFO"],
  ["Layer Centering", "layer-centering", "2283_CLV_User_Layer_Centering"],
  ["Spacers Position", "spacers-position", "2284_CLV_User_Spacers_Position"],
  ["Doser Config", "doser-config", "2285_CLV_User_Doser_Config"],
  ["Grip Config", "grip-config", "2286_CLV_User_Grip_Config"],
  ["Machine Extra Function", "extra-function", "2287_CLV_User_Machine_Extra_Function"],
  ["Preforming Settings", "preforming-settings", "2288_CLV_User_Preforming_Settings"],
  ["Languages", "languages", "2289_CLV_User_Languages"],
  ["MMC Read Write", "mmc", "2290_CLV_User_MMC_Read_Write"],
  ["PadStore Centering", "padstore-centering", "2291_CLV_User_PadStore_Centering"],
  ["Pallet Store Mode", "pallet-store-mode", "2292_CLV_User_Pallet_Store_Mode"],
  ["Lines Names", "lines-names", "2293_CLV_User_Lines_Names"],
] as const;

/** La rotta di una pagina CLV, dal suo slug: la usano le piastrelle dell'indice e chi aggiunge la
 * pagina, e devono dire la stessa cosa. */
export const clvRoute = (slug: string): string => `/settings/clv/${slug}`;

export const clvSettingsTemplates = [
  ["clv-index", "CLV - indice", "2281_CLV_User_Main", "Le dodici piastrelle che aprono le pagine CLV, sul fondo scuro del guscio."],
  ["clv-fifo", "CLV - FIFO", "2282_CLV_User_FIFO", "Il layout della linea con la posizione del pacco davanti e dietro su ogni nastro."],
  ["clv-centering", "CLV - centratura strato", "2283_CLV_User_Layer_Centering", "Il disegno dello strato con le quattro quote attorno, tutte sulla lunghezza del pacco."],
  ["clv-spacers", "CLV - posizione distanziali", "2284_CLV_User_Spacers_Position", "Le dieci posizioni dei distanziali a sinistra e il disegno numerato a destra."],
  ["clv-doser", "CLV - dosatori", "2285_CLV_User_Doser_Config", "Le due colonne simmetriche dei dosatori, sei misure per dosatore."],
  ["clv-grip", "CLV - pinze", "2286_CLV_User_Grip_Config", "Le due schede della pinza a sinistra e il disegno quotato a destra."],
  ["clv-extra", "CLV - funzioni extra", "2287_CLV_User_Machine_Extra_Function", "La griglia degli interruttori che accendono le funzioni opzionali del pannello."],
  ["clv-preforming", "CLV - preformazione", "2288_CLV_User_Preforming_Settings", "Le sei schede dei nastri con sovrapposizione e lunghezza, e il disegno a destra."],
  ["clv-languages", "CLV - lingue", "2289_CLV_User_Languages", "Le cinque bandiere con il loro interruttore e il pannello che si apre sotto."],
  ["clv-mmc", "CLV - lettura e scrittura MMC", "2290_CLV_User_MMC_Read_Write", "I due comandi simmetrici con le spie di esito, uno per leggere e uno per scrivere."],
  ["clv-padstore", "CLV - centratura pad store", "2291_CLV_User_PadStore_Centering", "Il disegno del pad store con le quattro quote e le linee di richiamo."],
  ["clv-pallet-store", "CLV - modo magazzino pallet", "2292_CLV_User_Pallet_Store_Mode", "La grafica del magazzino con le due schede di modo, una per posto."],
  ["clv-lines", "CLV - nomi delle linee", "2293_CLV_User_Lines_Names", "I sei nomi di linea, accesi da quante linee sono attive."],
].map(([id, name, sourceScreen, description]) => ({
  id: id as ClvSettingsTemplateId,
  name,
  description,
  sourceScreen,
  // Di questo blocco non esiste nessuna foto: la forma viene dal JSON, e si dice.
  visualStatus: "missing" as const,
  recommendedSection: "settings",
  frequency: "il blocco CLV User: 2281 e le dodici pagine sorelle fino alla 2293",
}));

export function isClvSettingsTemplate(id: string): id is ClvSettingsTemplateId {
  return clvSettingsTemplates.some((template) => template.id === id);
}

// ---------------------------------------------------------------------------- i pezzi comuni

/** La barra del titolo delle CLV: la stessa delle altre pagine, alle coordinate di questo blocco. */
function titleBar(title: string): string {
  return `      <div data-hmi-type="HmiTextBox" style={{ position: "absolute", left: ${PAGE.left}, top: ${PAGE.top}, width: ${PAGE.width}, height: 37, display: "flex", alignItems: "center", paddingLeft: 14, borderRadius: 4, background: "${color("panel")}", color: "${color("title")}", fontSize: ${typography.heading.size} }}>${title}</div>\n`;
}

/** Le linee di richiamo e i tratti tecnici: nel JSON sono oggetti veri (`Line`, `Polygon`), non
 * parte dell'immagine, quindi restano oggetti anche qui. */
function overlay(content: string): string {
  return `      <svg aria-hidden="true" viewBox="0 0 1280 694" style={{ position: "absolute", left: 0, top: 0, width: 1280, height: 694, pointerEvents: "none" }}>${content}</svg>\n`;
}

/** Una `Line` dell'export: left/top e' il primo capo, width/height lo scostamento del secondo. */
const wire = (left: number, top: number, width: number, height: number) =>
  `<line x1="${left}" y1="${top}" x2="${left + width}" y2="${top + height}" stroke="${color("textMuted")}" strokeWidth="1" strokeDasharray="4 3" />`;

/** Una riga di lettura: etichetta a sinistra, campo a destra, allineati in mezzo. E' cosi' nel JSON
 * — il testo sta sei pixel sotto il bordo alto del campo, non sopra di esso. */
function reading(labelLeft: number, fieldLeft: number, top: number, text: string, variable: string, width = 88): string {
  return label(labelLeft, top + 6, text, fieldLeft - labelLeft - 12) + field({ left: fieldLeft, top, width, variable });
}

// ---------------------------------------------------------------------------- 2281, l'indice

function clvIndexBody(): string {
  const black = `      <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: 1280, height: 694, background: "radial-gradient(ellipse at 50% 20%, ${color("indexCanvas")} 0%, ${color("indexCanvasEdge")} 72%)" }} />\n`;
  // Quattro colonne per tre righe, alle x e alle y dei `Pulsante` della schermata vera.
  const columns = [350, 520, 690, 860];
  const rows = [135, 304, 473];
  return black + clvStations.map(([name, slug], index) =>
    tile(columns[index % 4], rows[Math.floor(index / 4)], name, clvRoute(slug))).join("");
}

// ---------------------------------------------------------------------------- 2282, il FIFO

/** Ogni nastro ha due schedine sovrapposte: sopra il pacco dietro, sotto il pacco davanti. I robot
 * ne hanno una sola, piu' alta. Le coordinate sono quelle del layout della linea, che nel JSON e'
 * una grafica sola con le schede appoggiate sopra. */
function clvFifoBody(): string {
  const conveyors = [["M2200", 738, 384], ["M2210", 550, 450], ["M2220", 313, 140], ["M2230", 382, 511], ["M2240", 164, 195], ["M2250", 206, 543]] as const;
  const pairs = conveyors.map(([tag, left, top]) => [0, 1].map((half) => {
    const cardTop = top + half * 68;
    return card({ left, top: cardTop, width: 106, height: 66 })
      + label(left + 12, cardTop + 2, half ? "Front pack" : "Rear pack", 85)
      + field({ left: left + 12, top: cardTop + 24, width: 79, variable: `${tag}.FIFO_CNTRL_${half ? "Front" : "Rear"}_Pack.Pos`, readOnly: true });
  }).join("")).join("");
  const robot = (left: number, top: number, tag: string) =>
    card({ left, top, width: 106, height: 81 })
      + label(left + 11, top + 6, "Robot", 84)
      + field({ left: left + 12, top: top + 31, width: 79, variable: tag, readOnly: true });
  // La 2282 non ha barra del titolo: le schede stanno direttamente sul layout, e la prima e' piu'
  // in alto della striscia che le altre pagine ci mettono.
  return machineImage(145, 103, 916, 465, "Sostituisci con il layout della linea", "machine")
    + machineImage(448, 67, 478, 345, "Sostituisci con il dettaglio della zona di preformazione")
    + pairs
    + robot(726, 33, "Robot1_CNTRL_FIFO_CNTRL_Pos")
    + robot(483, 67, "Robot2_CNTRL_FIFO_CNTRL_Pos");
}

// ---------------------------------------------------------------------------- 2283 e 2291

/** La centratura dello strato (2283) e quella del pad store (2291) sono la stessa pagina con un
 * disegno diverso: una lastra sola, il disegno in mezzo e quattro quote attorno. Tutte e quattro le
 * quote leggono lo stesso tag, `Pack_Dimensions.Length_mm`: nell'export e' cosi'. */
function clvCenteringBody(title: string, padStore = false): string {
  const tag = "ProgModR.PV.Prog_In_Mod.Pack_Dimensions.Length_mm";
  const quotes = padStore
    ? [[816, 178, 817, 200], [812, 502, 812, 524], [204, 177, 210, 199], [251, 494, 258, 516]] as const
    : [[569, 111, 569, 133], [541, 606, 541, 628], [841, 346, 841, 368], [236, 347, 236, 369]] as const;
  const lines = padStore
    ? [[487, 388, 72, 43], [463, 328, 96, 55], [567, 389, 94, 52], [565, 341, 72, 43], [642, 233, 172, 104], [298, 232, 160, 92], [348, 434, 136, 83], [667, 445, 142, 79]] as const
    : [[600, 408, 106, 0], [598, 312, 1, 93], [598, 411, 0, 85], [377, 369, 8, 23], [387, 408, 208, 1], [385, 252, 4, 233]] as const;
  const image = padStore
    ? machineImage(280, 139, 609, 489, "Sostituisci con il disegno del pad store")
    : machineImage(358, 150, 468, 496, "Sostituisci con il disegno dello strato");
  return titleBar(title)
    + card({ left: PAGE.left, top: 59, width: PAGE.width, height: 618 })
    + label(34, 66, padStore ? "Pad store centering" : "Layer centering", 507)
    + image
    + overlay(lines.map(([x, y, w, h]) => wire(x, y, w, h)).join(""))
    + quotes.map(([labelLeft, labelTop, fieldLeft, fieldTop]) =>
      label(labelLeft, labelTop, "Length [mm]", 106) + field({ left: fieldLeft, top: fieldTop, width: 88, variable: tag })).join("");
}

// ---------------------------------------------------------------------------- 2284, i distanziali

function clvSpacersBody(title: string): string {
  // Le dieci posizioni: campo a 139, etichetta sei pixel piu' in basso, passo 43.
  const rows = Array.from({ length: 10 }, (_, index) => {
    const top = 148 + index * 43;
    // L'etichetta ha 77 pixel, quanti gliene da' il JSON: ci sta il numero, non l'unita'.
    return label(54, top + 6, `Spacer ${index + 1}`, 77) + field({ left: 139, top, width: 88, variable: `Spacer_B.PV.CLV_User_Spacer_Position[${index + 1}]` });
  }).join("");
  // I numeri sul disegno e la riga che porta ognuno al suo distanziale.
  const numbers = [840, 807, 767, 724, 684, 644, 601, 560, 517, 464];
  const leaders = [[845, 216, 25, 12], [792, 206, 57, 28], [739, 196, 89, 46], [681, 186, 126, 63], [625, 176, 161, 80], [568, 166, 197, 98], [511, 156, 233, 115], [454, 146, 269, 132], [402, 136, 300, 147], [342, 125, 339, 166]] as const;
  return titleBar(title)
    + card({ left: PAGE.left, top: 60, width: 275, height: 617, title: "Spacers position", body: rows })
    + card({ left: 300, top: 60, width: 909, height: 617, title: "Illustrative image" })
    + machineImage(433, 183, 724, 468, "Sostituisci con il disegno dei distanziali")
    + overlay(leaders.map(([x, y, w, h]) => wire(x, y, w, h)).join(""))
    + numbers.map((left, index) => label(left, 206, String(index + 1), 25)).join("");
}

// ---------------------------------------------------------------------------- 2285, i dosatori

function clvDoserBody(title: string): string {
  const measures = [
    ["Doser Module Lenght [mm]", "INPUT_Doser_Module_Lenght"],
    ["Thrower Module Lenght [mm]", "INPUT_Thrower_Module_Lenght"],
    ["Encoder Doser Tolerance", "INPUT_EncoderDoser_Tolerance"],
    ["Encoder Thrower Tolerance", "INPUT_EncoderThrower_Tolerance"],
    ["Distance Between Photocell [mm]", "INPUT_Distance_Between_Photocell"],
    ["Minimum Presence Infeed [ms]", "T_Minimum_Presence_Infeed.PT"],
  ] as const;
  const column = (left: number, fieldLeft: number, doser: number) =>
    card({ left, top: 60, width: 590, height: 617, title: `Doser ${doser}` })
      + measures.map(([text, tag], index) =>
        reading(left + 20, fieldLeft, 127 + index * 59, text, `Doser_${doser}.${tag}`)).join("");
  return titleBar(title) + column(20, 283, 1) + column(618, 883, 2);
}

// ---------------------------------------------------------------------------- 2286, le pinze

function clvGripBody(title: string): string {
  const measures = ["Lenght", "Height", "Max_Open", "Min_Open"] as const;
  // Nell'export tutte e otto le righe leggono il **primo** robot: la seconda scheda ripete i tag
  // della prima. E' quello che dice il JSON, e si riporta com'e' invece di indovinare un Robot2.
  const block = (top: number, height: number, name: string, first: number) =>
    card({ left: 20, top, width: 590, height, title: name })
      + measures.map((measure, index) =>
        reading(40, 283, first + index * 59, measure.replace("_", " "), `Robot1_CNTRL_INPUT_Gripper.${measure}`)).join("");
  return titleBar(title)
    + block(60, 305, "Gripper 1", 127)
    + block(369, 308, "Gripper 2", 442)
    + card({ left: 618, top: 60, width: 590, height: 617, title: "Illustrative image" })
    + machineImage(797, 124, 316, 431, "Sostituisci con il disegno quotato della pinza")
    + label(669, 434, "Lenght", 99)
    + label(1054, 466, "Height", 128)
    + label(720, 576, "Max open", 126)
    + label(798, 551, "Min", 30);
}

// ---------------------------------------------------------------------------- 2287, le funzioni extra

/** La pagina che accende le funzioni opzionali del pannello: diciassette interruttori, un gruppo di
 * scelte, un menu a tendina e due campi. Ogni interruttore fa `InvertBitInTag` sul suo bit di
 * configurazione, ed e' da qui che il pannello decide che cosa mostrare nelle altre pagine. */
function clvExtraBody(title: string): string {
  const switches = [
    [32, 141, "Config Mode", "PV_Config.Config_Mode"],
    [29, 257, "Info System Visibility", "PV_Config.Info_System_Visibility"],
    [29, 373, "Pad Store Squaring", "PV_Config.Prog_ModR_Vis.Pad_Store_Squaring_Vis"],
    [29, 489, "Lubrification", "PV_Config.Lubrification"],
    [263, 270, "Preforming Robot Diagnostic", "PV_Config.Preforming_Robot_Diagnostic_Visibility"],
    [263, 611, "Infeed Guide Plus", "PV_Config.Infeed_Guide_Plus"],
    [550, 143, "Diagnostic By Zone", "PV_Config.Diagnostic_By_Zone_Activation"],
    [550, 258, "Diagnostic By Device", "PV_Config.Diagnostic_By_Device_Activation"],
    [550, 374, "Alarms Troubleshooting", "PV_Config.Alarms_Troubleshooting_Activation"],
    [550, 490, "Preventive Maintenance", "PV_Config.Preventive_Maintenance_Activation"],
    [550, 606, "Advanced Statistics", "PV_Config.Advanced_Statistics_Activation"],
    [835, 255, "Tie Sheet Type", "TieSheet_Type"],
    [1042, 255, "Layer Bar Type", "LayerBar_Type"],
    [836, 407, "Flip Vertical Pattern", "PV_Config.Flip_Vertical_Visual_PatternDisplay"],
    [1042, 407, "Flip Horizontal Pattern", "PV_Config.Flip_Horizontal_Visual_PatternDisplay"],
    [838, 528, "Spacer Belt", "ProgModN.PV.Spacer_Belt"],
    [1042, 528, "Spare", "PV_Config.Spare[0]"],
  ] as const;
  const boards = [
    [21, 102, 221, 112], [21, 218, 221, 112], [21, 334, 221, 112], [21, 450, 221, 112],
    [247, 103, 283, 122], [247, 230, 283, 109], [247, 343, 282, 112], [247, 460, 283, 102], [247, 566, 283, 113],
    [535, 103, 283, 112], [535, 219, 283, 112], [535, 335, 283, 112], [535, 451, 283, 112], [535, 567, 283, 112],
    [823, 103, 386, 105],
    [823, 212, 191, 110], [1019, 212, 191, 110], [823, 369, 191, 110], [1019, 369, 191, 110], [823, 483, 191, 110], [1019, 483, 191, 110],
  ] as const;
  const heads = [[21, 60, 221, "Panel"], [247, 60, 283, "Machine"], [535, 60, 283, "Diagnostic"], [823, 60, 386, "Line"], [823, 326, 387, "Pattern"]] as const;
  return titleBar(title)
    + heads.map(([left, top, width, name]) => card({ left, top, width, height: 39, title: name })).join("")
    + boards.map(([left, top, width, height]) => card({ left, top, width, height })).join("")
    // L'etichetta sta trentatre pixel sopra il suo interruttore, come nel JSON.
    + switches.map(([left, top, text, tag]) => label(left, top - 33, text, 213) + toggle(left, top, false, tag, "invert")).join("")
    + label(263, 109, "Machine Type", 106)
    + radioGroup(257, 139, ["Nemo", "Classic", "Sweep Off"], "PV_Config.Machine_Type")
    + label(263, 350, "Robot Type", 205)
    + selectField(263, 384, ["1", "2", "3", "4"], "PV_Config.Prog_ModR_Vis.Robot_Type", 244)
    + label(263, 467, "Active Lines", 213)
    + field({ left: 263, top: 502, width: 187, variable: "PV_Config.TopBar_Interface.Line_N_Active" })
    + label(834, 112, "Trolley Station Number", 213)
    + field({ left: 839, top: 146, width: 233, variable: "Trolley_Station_Number" });
}

// ---------------------------------------------------------------------------- 2288, la preformazione

function clvPreformingBody(title: string): string {
  const belts = [["M2200", 20, 64], ["M2210", 296, 64], ["M2220", 20, 271], ["M2230", 296, 272], ["M2240", 20, 478], ["M2250", 296, 478]] as const;
  const block = (tag: string, left: number, top: number) =>
    card({ left, top, width: 265, height: 37, title: tag })
      + card({ left, top: top + 39, width: 265, height: 73 })
      + card({ left, top: top + 114, width: 265, height: 81 })
      // Qui, a differenza dei dosatori, l'etichetta sta davvero sopra il campo: nel JSON e' a 110 e
      // il campo a 134, stessa x.
      + label(left + 14, top + 46, "Overlap value", 138)
      + field({ left: left + 14, top: top + 70, width: 237, variable: `${tag}.GroupPos_Rear_Pack.OverlapValue_Real` })
      + label(left + 14, top + 121, "Conveyor lenght", 138)
      + field({ left: left + 15, top: top + 147, width: 237, variable: `${tag}.GroupPos_Rear_Pack.ConveyorLenght` });
  return titleBar(title)
    + belts.map(([tag, left, top]) => block(tag, left, top)).join("")
    + card({ left: 574, top: 64, width: 634, height: 37, title: "Illustrative image" })
    + card({ left: 574, top: 103, width: 634, height: 570 })
    + machineImage(604, 193, 598, 436, "Sostituisci con il disegno della preformazione");
}

// ---------------------------------------------------------------------------- 2289, le lingue

/** Cinque bandiere con il loro interruttore. Il pannello sotto ogni bandiera nell'export ha
 * l'altezza legata al tag della lingua: si apre quello scelto. Qui restano cinque pannelli fermi,
 * con il tag dichiarato, perche' l'altezza dinamica la mette chi genera il progetto TIA. */
function clvLanguagesBody(title: string): string {
  const languages = [["English", 20, 43, 155], ["Italian", 259, 282, 394], ["German", 498, 521, 633], ["French", 737, 760, 872], ["Spanish", 977, 1000, 1111]] as const;
  return titleBar(title)
    + languages.map(([name, cardLeft, panelLeft, switchLeft]) => {
      const tag = `PV_Config.${name}_Language`;
      return card({ left: cardLeft, top: 60, width: 232, height: 96 })
        + label(cardLeft + 12, 89, name, 96)
        + toggle(switchLeft, 85, false, tag, "invert")
        + card({ left: panelLeft, top: 152, width: 205, height: 323 })
        + machineImage(panelLeft + 8, 204, 189, 204, `Sostituisci con la bandiera ${name}`)
        + `      <span data-hmi-type="HmiRectangle" data-plc-variable="${tag}" style={{ position: "absolute", left: ${panelLeft}, top: 152, width: 205, height: 323, borderRadius: 4, border: "1px solid ${color("border")}", pointerEvents: "none" }} />\n`;
    }).join("");
}

// ---------------------------------------------------------------------------- 2290, la MMC

/** Le due meta' della pagina fanno la stessa cosa da due lati: a sinistra si legge la scheda, a
 * destra la si scrive. Nell'export **tutti e due** i comandi fanno `SetBitInTag` su
 * `MMC_Write_Read.Read_Start_PB`: e' scritto cosi' nel JSON, e si riporta cosi'. */
function clvMmcBody(title: string): string {
  const half = (left: number, width: number, name: string, commandLeft: number, commandTop: number, lampLeft: number, lampTop: number, prefix: string) =>
    card({ left, top: 60, width, height: 617, title: name })
      + machineImage(left + 62, 133, 123, 143, "Sostituisci con il disegno del lettore")
      + `      <button type="button" data-hmi-type="HmiButton" data-plc-variable="MMC_Write_Read.Read_Start_PB" data-plc-write="set" data-plc-step="0" style={{ position: "absolute", left: ${commandLeft}, top: ${commandTop}, width: 272, height: 83, display: "grid", placeItems: "center", border: "1px solid ${color("commandBorder")}", borderRadius: 6, background: "${color("command")}", color: "white", fontSize: ${typography.heading.size}, fontWeight: 700 }}>${name}</button>\n`
      + label(lampLeft - 3, lampTop - 23, "Ok / Error", 100)
      + `      <span data-hmi-type="HmiGraphicView" data-plc-variable="MMC_Write_Read.${prefix}_Ok" style={{ position: "absolute", left: ${lampLeft}, top: ${lampTop}, width: 59, height: 57, borderRadius: "50%", background: "${color("on")}" }} />\n`
      + `      <span data-hmi-type="HmiGraphicView" data-plc-variable="MMC_Write_Read.${prefix}_Error" style={{ position: "absolute", left: ${lampLeft + 39}, top: ${lampTop}, width: 59, height: 57, borderRadius: "50%", background: "${color("statusBad")}" }} />\n`;
  return titleBar(title)
    + half(20, 592, "Read", 134, 555, 421, 577, "Read")
    + half(618, 590, "Write", 741, 551, 1028, 573, "Write");
}

// ---------------------------------------------------------------------------- 2292, il magazzino pallet

/** Anche questa, come la 2282, non ha la barra del titolo: la grafica del magazzino parte da 59 e
 * arriva fino in fondo. */
function clvPalletStoreBody(): string {
  const store = (left: number, top: number, name: string, tag: string, fieldLeft: number, width: number) =>
    card({ left, top, width: 326, height: 37, title: name })
      + card({ left, top: top + 40, width: 326, height: 125 })
      + label(left + 12, top + 48, "Mode", 75)
      + selectField(fieldLeft, top + 82, ["Automatic", "Manual", "Disabled"], tag, width);
  return machineImage(195, 59, 830, 548, "Sostituisci con la grafica del magazzino pallet", "machine")
    + zone(303, 317, 147, 107, "Magazzino 1")
    + zone(776, 233, 116, 113, "Magazzino 2")
    + store(85, 162, "Pallet store 1", "PV_Config.Pallet_Store_1_Mode", 109, 275)
    + store(782, 80, "Pallet store 2", "PV_Config.Pallet_Store_2_Mode", 811, 272);
}

// ---------------------------------------------------------------------------- 2293, i nomi delle linee

/** I sei nomi di linea. Nell'export ogni campo e' acceso o spento da `Line_N_Active`: se le linee
 * attive sono tre, dal quarto in giu' non si scrive. Il tag di comando sta nella scheda a destra. */
function clvLinesBody(title: string): string {
  const rows = Array.from({ length: 6 }, (_, index) =>
    label(42, 81 + index * 82, `Line ${index + 1}`, 150)
    + field({ left: 42, top: 106 + index * 82, width: 570, variable: `PV_Config.Line_Names[${index + 1}]` })).join("");
  // Il titolo di questa pagina e' l'intestazione della scheda: una barra a tutta larghezza non c'e'.
  return card({ left: 28, top: 26, width: 618, height: 37, title })
    + card({ left: 28, top: 66, width: 618, height: 519, body: rows })
    + card({ left: 673, top: 143, width: 248, height: 90 })
    + label(687, 152, "Active lines", 150)
    + field({ left: 687, top: 180, width: 214, variable: "PV_Config.TopBar_Interface.Line_N_Active" })
    + machineImage(910, 206, 209, 425, "Sostituisci con il disegno delle linee");
}

export function clvSettingsTemplateBody(id: ClvSettingsTemplateId, title: string): string {
  switch (id) {
    case "clv-index": return clvIndexBody();
    case "clv-fifo": return clvFifoBody();
    case "clv-centering": return clvCenteringBody(title);
    case "clv-padstore": return clvCenteringBody(title, true);
    case "clv-spacers": return clvSpacersBody(title);
    case "clv-doser": return clvDoserBody(title);
    case "clv-grip": return clvGripBody(title);
    case "clv-extra": return clvExtraBody(title);
    case "clv-preforming": return clvPreformingBody(title);
    case "clv-languages": return clvLanguagesBody(title);
    case "clv-mmc": return clvMmcBody(title);
    case "clv-pallet-store": return clvPalletStoreBody();
    case "clv-lines": return clvLinesBody(title);
  }
}
