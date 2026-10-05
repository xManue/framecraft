import {
  card, command, field, folderTabs, label, machineImage, pageLayout, radioGroup, rule, selectField,
  settingRow, table, tableRows, toggle,
} from "./hmiPrimitives";
import { cssColor, pageFrame, pagePalette, sections, settingsRow, typography } from "./hmiStandard";

/** I ventisei pezzi sciolti della palette: gli oggetti WinCC e i pezzi di pagina.
 *
 * Erano l'ultimo mucchio di codice scritto a occhio dentro `registry.ts`, e avevano tutti lo stesso
 * difetto: erano **scuri**. Il guscio del pannello e' scuro, le pagine no — sono bianche sul grigio,
 * come dicono le foto e come le disegna `hmiPrimitives`. Chi trascinava "Riga impostazione" dentro
 * una pagina Settings si ritrovava una riga nera in mezzo a sei righe bianche. Adesso i pezzi di
 * pagina sono costruiti con le stesse funzioni dei template, e gli oggetti hanno la misura che
 * hanno davvero nell'export.
 *
 * Le misure non sono scelte: sono state contate su tutte e 160 le schermate, e ogni oggetto porta
 * scritto in quale schermata sta l'esemplare da cui e' presa. Un test le ricontrolla una per una.
 *
 * | Oggetto | Misura vera | Dove |
 * | --- | --- | --- |
 * | `HmiSymbolicIOField` | 187x45 | 2001 (7 volte) |
 * | `HmiTouchArea` | 1215x689 | 1002 (89 volte: e' la pagina intera) |
 * | `HmiLine` | 197 di larghezza, alta 0 | 1201 |
 * | `HmiPolygon` | 203x89 | 2003 (i "Pad") |
 * | `HmiCustomWidgetContainer` | 151x47 | 2001 (`DynamicSVG_1`) |
 * | `HmiCircle` | raggio 5 | 2043 (106 volte) |
 * | `HmiEllipse` | raggi 159x45 | 2042 |
 * | `HmiFaceplateContainer` | 80x80 | 2002 (i `Pack_1..30`) |
 * | `HmiWebControl` | 1187x681 | 4041 |
 * | `HmiBar` | 171x58 | TopBar |
 * | `HmiGauge` | 130x184 | TopBar_Big |
 * | `HmiRadioButtonGroup` | 154x69 | 2001 (sempre questa, tutte e tre le volte) |
 * | `HmiAlarmControl` | 1197x624 | 3001, 3041, 3081 (sempre a (16,55)) |
 *
 * Una cosa che si e' scoperta contando: **`HmiDataGridViewPart` da solo non esiste**. Le uniche
 * griglie dell'export stanno dentro i tre controlli allarmi, e ognuno ne ha due — quella degli
 * allarmi e quella delle statistiche. La "Tabella HMI" della palette era un oggetto inventato: al
 * suo posto ora c'e' la griglia vera delle statistiche, con le sue otto colonne e le loro
 * larghezze. */

const color = (name: keyof typeof pagePalette) => cssColor(pagePalette[name]);
const font = JSON.stringify(typography.cssFamily);

export type HmiObjectComponentType =
  | "hmi-line" | "hmi-polygon" | "hmi-circle" | "hmi-ellipse" | "hmi-touch-area" | "hmi-faceplate"
  | "hmi-machine-callout" | "hmi-callout-line"
  | "hmi-symbolic-io" | "hmi-custom-widget" | "hmi-web-control" | "hmi-data-grid" | "hmi-bar"
  | "hmi-gauge" | "hmi-radio-group" | "hmi-alarm-control"
  | "hmi-page-frame" | "hmi-page-title" | "hmi-settings-row" | "hmi-settings-toggle"
  | "hmi-settings-list" | "hmi-right-board" | "hmi-folder-tabs" | "hmi-io-field" | "hmi-text-box"
  | "hmi-button";

export interface HmiObjectShape {
  type: HmiObjectComponentType;
  width: number;
  height: number;
  /** L'oggetto WinCC dichiarato con `data-hmi-type`. */
  itemType: string;
  /** La schermata dove sta l'esemplare con questa misura. Vuoto per i pezzi di pagina, che non sono
   * un oggetto solo ma un pezzo composto: quelli hanno la misura nelle costanti dello standard. */
  sourceScreen?: string;
}

export const hmiObjectShapes: readonly HmiObjectShape[] = [
  { type: "hmi-line", width: 197, height: 2, itemType: "HmiLine", sourceScreen: "1201_Omac" },
  { type: "hmi-polygon", width: 203, height: 89, itemType: "HmiPolygon", sourceScreen: "2003_Robot_Program_Modification_3" },
  { type: "hmi-circle", width: 10, height: 10, itemType: "HmiCircle", sourceScreen: "2043_Encoders_Lifter_2" },
  { type: "hmi-ellipse", width: 318, height: 90, itemType: "HmiEllipse", sourceScreen: "2042_Encoders_Lifter_1" },
  { type: "hmi-touch-area", width: 1215, height: 689, itemType: "HmiTouchArea", sourceScreen: "1002_Downstair" },
  { type: "hmi-faceplate", width: 80, height: 80, itemType: "HmiFaceplateContainer", sourceScreen: "2002_Robot_Program_Modification_2" },
  { type: "hmi-symbolic-io", width: 187, height: 45, itemType: "HmiSymbolicIOField", sourceScreen: "2001_Robot_Program_Modification_1" },
  { type: "hmi-custom-widget", width: 151, height: 47, itemType: "HmiCustomWidgetContainer", sourceScreen: "2001_Robot_Program_Modification_1" },
  { type: "hmi-web-control", width: 1187, height: 681, itemType: "HmiWebControl", sourceScreen: "4041_Production" },
  { type: "hmi-data-grid", width: 1010, height: pageLayout.table.head + 20 * pageLayout.table.row, itemType: "HmiDataGridViewPart", sourceScreen: "3001_Alarms" },
  { type: "hmi-bar", width: 171, height: 58, itemType: "HmiBar", sourceScreen: "TopBar" },
  { type: "hmi-gauge", width: 130, height: 184, itemType: "HmiGauge", sourceScreen: "TopBar_Big" },
  { type: "hmi-radio-group", width: 154, height: 69, itemType: "HmiRadioButtonGroup", sourceScreen: "2001_Robot_Program_Modification_1" },
  { type: "hmi-alarm-control", width: 1197, height: 624, itemType: "HmiAlarmControl", sourceScreen: "3001_Alarms" },
  { type: "hmi-machine-callout", width: 148, height: 52, itemType: "HmiButton", sourceScreen: "2081_Motor_Speed_1" },
  { type: "hmi-callout-line", width: 156, height: 55, itemType: "HmiLine", sourceScreen: "2081_Motor_Speed_1" },
  { type: "hmi-page-frame", width: pageLayout.frame.width, height: pageLayout.frame.height, itemType: "HmiRectangle" },
  { type: "hmi-page-title", width: pageFrame.header.width, height: pageLayout.header + pageLayout.separator, itemType: "HmiTextBox" },
  { type: "hmi-settings-row", width: settingsRow.width, height: settingsRow.height, itemType: "HmiRectangle" },
  { type: "hmi-settings-toggle", width: settingsRow.width, height: settingsRow.height, itemType: "HmiRectangle" },
  { type: "hmi-settings-list", width: settingsRow.width, height: settingsRow.rows * settingsRow.pitch, itemType: "HmiRectangle" },
  { type: "hmi-right-board", width: pageFrame.rightBoard.width, height: pageFrame.rightBoard.height, itemType: "HmiRectangle" },
  { type: "hmi-folder-tabs", width: pageLayout.tab.left + pageLayout.tab.width, height: pageLayout.tab.top + 3 * pageLayout.tab.pitch, itemType: "HmiButton" },
  { type: "hmi-io-field", width: pageLayout.field.width, height: pageLayout.field.height, itemType: "HmiIOField" },
  { type: "hmi-text-box", width: 240, height: 20, itemType: "HmiTextBox" },
  { type: "hmi-button", width: pageLayout.field.width, height: pageLayout.command.height, itemType: "HmiButton" },
];

// ---------------------------------------------------------------------------- i pezzi

const box = (left: number, top: number, width: number, height: number) =>
  `position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}`;

/** La scheda bianca sotto un pezzo di pagina. Nelle pagine ce la mette la `card`; un pezzo preso da
 * solo dalla palette deve portarsela, se no sul grigio della tela non si vede. */
function sheet(shape: HmiObjectShape, body: string): string {
  return card({ left: 0, top: 0, width: shape.width, height: shape.height }) + body;
}

/** Il contenitore: i pezzi di `hmiPrimitives` si disegnano in coordinate assolute, quindi ognuno
 * viaggia dentro il suo riquadro, che e' grande quanto l'oggetto e non si vede. */
function wrap(shape: HmiObjectShape, name: string, body: string): string {
  return `<div aria-label="${name}" style={{ position: "relative", width: ${shape.width}, height: ${shape.height}, fontFamily: ${font}, color: "${color("text")}" }}>\n${body}    </div>`;
}

const alarmSection = cssColor(sections.find((section) => section.id === "alarms")!.color.top);

// ---------------------------------------------------------------------------- gli oggetti WinCC

function objectBody(shape: HmiObjectShape): string {
  switch (shape.type) {
    // Nell'export la linea e' alta 0: e' un filo. Qui e' alta 2, se no non si vedrebbe e non si
    // potrebbe prendere col mouse.
    case "hmi-line": return `      <div data-hmi-type="HmiLine" style={{ ${box(0, 0, shape.width, 2)}, background: "${color("borderStrong")}" }} />
`;

    // Il poligono e' quello dei "Pad" delle pagine programma: un quadrilatero, non un rettangolo.
    case "hmi-polygon": return `      <svg data-hmi-type="HmiPolygon" viewBox="0 0 203 89" style={{ ${box(0, 0, 203, 89)} }}><polygon points="6,4 197,10 189,84 14,79" fill="${color("fieldReadOnly")}" stroke="${color("borderStrong")}" strokeWidth="2" /></svg>\n`;

    // Il cerchio dello standard non e' una spia grande: e' un punto di raggio 5, quello che segna i
    // riferimenti nei disegni degli encoder. Nel JSON ha `Radius`, non larghezza e altezza.
    case "hmi-circle": return `      <span data-hmi-type="HmiCircle" data-plc-variable="" data-hmi-radius="5" style={{ ${box(0, 0, 10, 10)}, borderRadius: "50%", background: "${color("title")}" }} />\n`;

    // L'ellisse ha due raggi (159 e 45): e' larga il doppio dei raggi.
    case "hmi-ellipse": return `      <span data-hmi-type="HmiEllipse" data-hmi-radius-x="159" data-hmi-radius-y="45" style={{ ${box(0, 0, 318, 90)}, borderRadius: "50%", border: "2px solid ${color("borderStrong")}", background: "${color("panelMuted")}" }} />\n`;

    // L'area touch dello standard e' quasi sempre grande quanto la pagina: e' il tappeto che prende
    // il tocco dove non c'e' nient'altro.
    case "hmi-touch-area": return `      <button type="button" data-hmi-type="HmiTouchArea" aria-label="Area touch" style={{ ${box(0, 0, 1215, 689)}, border: "2px dashed ${color("borderStrong")}", borderRadius: 4, background: "transparent", color: "${color("textMuted")}", fontFamily: ${font}, fontSize: ${typography.body.size} }}>Area touch: 1215x689, tutta la pagina</button>\n`;

    // Il faceplate 80x80 e' quello dei trenta pacchi della 2002.
    case "hmi-faceplate": return `      <div data-hmi-type="HmiFaceplateContainer" data-hmi-faceplate="" style={{ ${box(0, 0, 80, 80)}, display: "grid", placeItems: "center", border: "1px solid ${color("borderStrong")}", background: "${color("panelMuted")}", color: "${color("textMuted")}", fontSize: 11 }}>Scegli faceplate</div>\n`;

    case "hmi-symbolic-io": return selectField(0, 0, ["Opzione 1", "Opzione 2"], "", 187);

    // Il widget SVG dinamico: nelle pagine programma si chiama `DynamicSVG_n` e disegna il pacco.
    case "hmi-custom-widget": return `      <div data-hmi-type="HmiCustomWidgetContainer" data-plc-variable="" style={{ ${box(0, 0, 151, 47)}, display: "grid", placeItems: "center", border: "1px dashed ${color("borderStrong")}", background: "${color("panel")}", color: "${color("textMuted")}", fontSize: 11 }}>Widget SVG</div>\n`;

    // Il web control porta un indirizzo vero: nello standard sono le dashboard Node-RED.
    case "hmi-web-control": return `      <div data-hmi-type="HmiWebControl" data-hmi-url="https://10.14.1.228:1880/dashboard/pageN" style={{ ${box(0, 0, 1187, 681)}, display: "grid", placeItems: "center", border: "1px solid ${color("border")}", background: "${color("panel")}", color: "${color("textMuted")}", fontSize: ${typography.body.size} }}>Cambia l'indirizzo nell'Inspector</div>\n`;

    // La griglia delle statistiche allarmi: otto colonne, e le larghezze sono quelle del JSON.
    case "hmi-data-grid": return table({
      left: 0, top: 0, width: shape.width, hmiType: "HmiDataGridViewPart", total: 20,
      columns: [
        { label: "ID", width: 40, align: "center" }, { label: "Event text", width: 120 },
        { label: "Alarm text 1", width: 100 }, { label: "Modification time", width: 130 },
        { label: "Average raised", width: 160 }, { label: "Average cleared", width: 160 },
        { label: "Average acknowledged", width: 200 }, { label: "Frequency", width: 100, align: "right" },
      ],
    });

    // La barra: nello standard e' quella del livello nella barra in alto, 171x58.
    case "hmi-bar": return `      <div data-hmi-type="HmiBar" data-plc-variable="" style={{ ${box(0, 0, 171, 58)}, border: "1px solid ${color("borderStrong")}", borderRadius: 4, background: "${color("fieldReadOnly")}" }} />
      <div aria-hidden="true" style={{ ${box(2, 2, 100, 54)}, borderRadius: 3, background: "${color("on")}" }} />\n`;

    // Il gauge: quello vero e' nella barra grande del mobile, 130x184. L'ago e la scala li disegna
    // WinCC; qui bastano l'arco e il numero, perche' si veda che cos'e' e quanto e' grande.
    case "hmi-gauge": return `      <div data-hmi-type="HmiGauge" data-plc-variable="" style={{ ${box(0, 0, 130, 184)}, border: "1px solid ${color("borderStrong")}", borderRadius: 8, background: "${color("panel")}" }} />
      <svg aria-hidden="true" viewBox="0 0 130 184" style={{ ${box(0, 0, 130, 184)} }}><path d="M25 130 A 45 45 0 1 1 105 130" fill="none" stroke="${color("fieldReadOnly")}" strokeWidth="12" /><path d="M25 130 A 45 45 0 0 1 33 62" fill="none" stroke="${color("title")}" strokeWidth="12" /></svg>
      <output data-hmi-type="HmiTextBox" data-plc-variable="" style={{ ${box(0, 140, 130, 34)}, color: "${color("text")}", fontSize: ${typography.valueLarge.size}, fontWeight: 700, textAlign: "center" }}>0</output>\n`;

    // Tre scelte: nell'export il gruppo e' 154x69, cioe' tre cerchietti a passo 35 meno l'ultimo.
    case "hmi-radio-group": return radioGroup(0, 0, ["Scelta 1", "Scelta 2"], "");

    // Il controllo allarmi: le sei colonne della 3001, con le larghezze del JSON.
    case "hmi-alarm-control": return table({
      left: 0, top: 0, width: 1197, hmiType: "HmiAlarmControl",
      total: tableRows(624),
      alarmFilter: "AlarmClassName = 'Alarm_CTH'", alarmSource: "active",
      // Le sei colonne visibili dell'`AlarmView`, con le larghezze del JSON: 45+50+600+85+160+200.
      columns: [
        { label: "ID", width: 45, align: "center" }, { label: "Cat", width: 50, align: "center" },
        { label: "Testo", width: 600 }, { label: "EM", width: 85, align: "center" },
        { label: "Ora", width: 160 }, { label: "EM - Name", width: 200 },
      ],
    });

    // Il richiamo motore della 2081: parte senza nome, azione e tag perche' dipendono dalla macchina
    // su cui l'utente mette lo screen. Testo, azione e variabile si completano dall'Inspector.
    case "hmi-machine-callout": return `      <button type="button" data-hmi-type="HmiButton" data-hmi-graphic="Graphic_55" data-plc-variable="" data-hmi-action="" aria-label="Targhetta motore da configurare" style={{ ${box(0, 0, 148, 52)}, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "0 13px", border: "1px solid ${color("commandBorder")}", borderRadius: 5, background: "#48494E", color: "white", fontFamily: ${font}, fontSize: 18, cursor: "pointer" }}><svg aria-hidden="true" viewBox="0 0 32 32" style={{ width: 30, height: 30, flex: "0 0 auto", fill: "none", stroke: "white", strokeWidth: 2.4, strokeLinecap: "round" }}><path d="M20 5a7 7 0 0 0-8 9L4 22l6 6 8-8a7 7 0 0 0 9-8l-5 5-5-5z"/><path d="M5 5l22 22M8 4l-4 4M24 28l4-4"/></svg><span data-hmi-type="HmiTextBox">M0000</span></button>
`;

    // Linea inclinata tratteggiata che lega la targhetta all'organo nello screen della macchina.
    case "hmi-callout-line": return `      <svg data-hmi-type="HmiLine" aria-label="Linea richiamo" viewBox="0 0 156 55" style={{ ${box(0, 0, 156, 55)}, overflow: "visible", fill: "none", stroke: "${color("textMuted")}", strokeWidth: 2, strokeDasharray: "5 4", strokeLinecap: "round", pointerEvents: "none" }}><line x1="0" y1="0" x2="156" y2="55" /></svg>
`;

    default: return pageBody(shape);
  }
}

// ---------------------------------------------------------------------------- i pezzi di pagina

function pageBody(shape: HmiObjectShape): string {
  switch (shape.type) {
    case "hmi-page-frame": return card({ left: 0, top: 0, width: shape.width, height: shape.height, title: "Titolo della pagina" });
    // Solo la fascia bianca del titolo e i 3 px di grigio che la staccano dal corpo.
    case "hmi-page-title": return `      <div data-hmi-type="HmiTextBox" style={{ ${box(0, 0, shape.width, pageLayout.header)}, display: "flex", alignItems: "center", paddingLeft: ${pageLayout.row.padding}, borderRadius: "4px 4px 0 0", background: "${color("panel")}", color: "${color("title")}", fontSize: ${typography.heading.size} }}>Titolo della pagina</div>
`
      + rule(0, pageLayout.header, shape.width);

    // `settingsRow.field.left` e `toggle.left` sono misurati sulla pagina, dove la riga comincia a
    // x=20: dentro la riga vanno riportati all'origine, se no il controllo esce dal bianco.
    case "hmi-settings-row": return sheet(shape, settingRow({
      left: 0, top: 0, width: shape.width, height: shape.height, label: "Impostazione", last: true,
      control: field({ left: settingsRow.field.left - settingsRow.left, top: 21, width: settingsRow.field.width, variable: "" }),
    }));

    case "hmi-settings-toggle": return sheet(shape, settingRow({
      left: 0, top: 0, width: shape.width, height: shape.height, label: "Impostazione", last: true,
      control: toggle(settingsRow.toggle.left - settingsRow.left, 17, false, "", "invert"),
    }));

    // Sette righe a passo 78: e' lo schema della sezione Settings, misurato sulle foto.
    case "hmi-settings-list": return sheet(shape, Array.from({ length: settingsRow.rows }, (_, index) => settingRow({
      left: 0, top: index * settingsRow.pitch, width: shape.width, height: settingsRow.height,
      label: `Impostazione ${index + 1}`, last: index === settingsRow.rows - 1,
      control: field({ left: settingsRow.field.left - settingsRow.left, top: index * settingsRow.pitch + 21, width: settingsRow.field.width, variable: "" }),
    })).join(""));

    case "hmi-right-board": return card({ left: 0, top: 0, width: shape.width, height: shape.height })
      + machineImage(20, 20, shape.width - 40, shape.height - 40, "Sostituisci con il disegno della macchina", "machine");

    // Le linguette stanno all'estremo destro della pagina: il riquadro e' largo fino a li', cosi'
    // messo a (0,0) il pezzo cade gia' al posto suo.
    case "hmi-folder-tabs": return folderTabs(3, alarmSection);

    case "hmi-io-field": return field({ left: 0, top: 0, variable: "Machine.Value" });
    case "hmi-text-box": return label(0, 0, "Testo", shape.width);
    case "hmi-button": return command({ left: 0, top: 0, width: shape.width, text: "Comando" });
    default: return "";
  }
}

export function hmiObjectJsx(type: HmiObjectComponentType): string {
  const shape = hmiObjectShapes.find((item) => item.type === type)!;
  const names: Record<HmiObjectComponentType, string> = {
    "hmi-line": "Linea", "hmi-polygon": "Poligono", "hmi-circle": "Cerchio", "hmi-ellipse": "Ellisse",
    "hmi-machine-callout": "Targhetta motore", "hmi-callout-line": "Linea richiamo",
    "hmi-touch-area": "Area touch", "hmi-faceplate": "Faceplate", "hmi-symbolic-io": "Campo simbolico",
    "hmi-custom-widget": "Widget SVG", "hmi-web-control": "Contenuto web", "hmi-data-grid": "Griglia statistiche allarmi",
    "hmi-bar": "Barra", "hmi-gauge": "Gauge", "hmi-radio-group": "Scelta", "hmi-alarm-control": "Lista allarmi",
    "hmi-page-frame": "Cornice della pagina", "hmi-page-title": "Intestazione della pagina",
    "hmi-settings-row": "Riga di impostazione", "hmi-settings-toggle": "Riga con interruttore",
    "hmi-settings-list": "Lista di impostazioni", "hmi-right-board": "Lastra destra",
    "hmi-folder-tabs": "Linguette", "hmi-io-field": "Campo I/O", "hmi-text-box": "Testo", "hmi-button": "Pulsante",
  };
  return wrap(shape, names[type], objectBody(shape));
}
