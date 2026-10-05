import { cssColor, pagePalette, typography } from "./hmiStandard";

/** I pezzi con cui sono disegnate le pagine dello standard, misurati sulle foto.
 *
 * Le pagine vere non sono fatte di rettangoli qualsiasi: sono schede bianche appoggiate sul grigio
 * della pagina, con l'intestazione alta 34, righe alte 108 separate da 3 px di grigio (non da un
 * bordo), campi dal bordo sottile, select con il bottone grigio sfumato, switch a pillola e tabelle
 * a righe alterne. Finche' ogni famiglia ridisegnava questi pezzi a modo suo, ogni pagina veniva
 * diversa dalla foto: qui stanno una volta sola.
 *
 * Le misure vengono da `FotoStandardManu` lette pixel per pixel e riportate in coordinate di pagina:
 * la foto e' il pannello intero, la pagina sta dentro `SW_Screen` a (80,151) rimpicciolita di
 * 0.9375, quindi `pagina = (foto - (81,145)) / 0.9375`. I colori stanno in `pagePalette`. */

const color = (value: keyof typeof pagePalette) => cssColor(pagePalette[value]);
const font = JSON.stringify(typography.cssFamily);

/** Le misure ricorrenti, in coordinate di pagina. */
export const pageLayout = {
  /** La cornice chiara che si vede: e' la pagina stessa, arrotondata. */
  frame: { left: 9, top: 8, width: 1214, height: 681, radius: 14 },
  /** Il rettangolo in cui stanno le schede: da (16,19) fino a 677. */
  content: { left: 16, top: 19, width: 1192, height: 658 },
  /** Lo stacco fra due schede: e' grigio perche' in mezzo si vede la pagina. */
  gap: 6,
  /** L'intestazione di una scheda, piu' i 3 px di grigio che la staccano dal corpo. */
  header: 34,
  separator: 3,
  /** Una riga di impostazione, i 3 px di stacco compresi: etichetta a +14, controllo a +37. */
  row: { height: 108, labelTop: 14, controlTop: 37, padding: 16 },
  field: { width: 186, height: 32, radius: 6 },
  select: { width: 186, height: 42, button: 40, radius: 6 },
  toggle: { width: 82, height: 40, knob: 32 },
  radio: { size: 20, dot: 9, pitch: 35 },
  command: { height: 44, radius: 4 },
  /** Le linguette a destra. Nell'export sono bottoni 63x31 a x=1208, disegnati **prima** della
   * cornice: la cornice ne copre la meta' sinistra e sullo schermo se ne vede solo il moncone da
   * 1223 a 1271. Qui e' registrato quel moncone, perche' e' quello che si disegna. */
  tab: { left: 1223, top: 24, width: 48, height: 31, pitch: 36, activeOverhang: 6 },
  table: { head: 30, row: 27 },
  /** Le piastrelle delle pagine indice, che stanno sul nero e non sulla pagina chiara. */
  tile: { width: 74, height: 74, pitchX: 169, pitchY: 184, badge: 30 },
} as const;

const box = (left: number, top: number, width: number, height: number) =>
  `position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}`;

export interface CardOptions {
  left: number;
  top: number;
  width: number;
  height: number;
  /** L'intestazione con il titolo. Senza titolo la scheda e' una lastra bianca e basta. */
  title?: string;
  /** Quello che sta dentro, gia' posizionato in coordinate di pagina. */
  body?: string;
  /** Per le schede che fanno da sfondo a un'immagine e non devono essere bianche. */
  background?: string;
}

/** Una scheda bianca: il mattone di ogni pagina. Nelle foto non esiste un pannello che non sia
 * questo. Il titolo e' staccato dal corpo da 3 px di grigio, non da un bordo. */
export function card({ left, top, width, height, title, body = "", background }: CardOptions): string {
  const { header, separator } = pageLayout;
  const head = title
    ? `      <div data-hmi-type="HmiTextBox" style={{ ${box(left, top, width, header)}, display: "flex", alignItems: "center", paddingLeft: ${pageLayout.row.padding}, borderRadius: "4px 4px 0 0", background: "${color("panel")}", color: "${color("title")}", fontSize: ${typography.heading.size} }}>${title}</div>\n`
    : "";
  const offset = title ? header + separator : 0;
  const radius = title ? '"0 0 4px 4px"' : "4";
  return `${head}      <div data-hmi-type="HmiRectangle" style={{ ${box(left, top + offset, width, height - offset)}, borderRadius: ${radius}, background: "${background ?? color("panel")}" }} />\n${body}`;
}

/** Dove comincia il corpo di una scheda con l'intestazione. */
export function cardBody(top: number): number {
  return top + pageLayout.header + pageLayout.separator;
}

/** Dove comincia la riga `index` di una scheda che parte da `top`. */
export function rowTop(top: number, index: number, height: number = pageLayout.row.height): number {
  return cardBody(top) + index * height;
}

/** L'altezza che serve a una scheda con `rows` righe e l'intestazione. */
export function cardHeight(rows: number, height: number = pageLayout.row.height): number {
  return pageLayout.header + pageLayout.separator + rows * height;
}

/** L'etichetta grigia sopra un controllo. Nelle foto sta sempre sopra, mai a fianco. */
export function label(left: number, top: number, text: string, width = 320): string {
  return `      <span data-hmi-type="HmiTextBox" style={{ ${box(left, top, width, 20)}, color: "${color("textMuted")}", fontSize: ${typography.body.size}, whiteSpace: "nowrap" }}>${text}</span>\n`;
}

/** Un valore in evidenza: il numero grande dei contatori e delle statistiche. */
export function value(left: number, top: number, text: string, size: number = typography.valueLarge.size, width = 220): string {
  return `      <output data-hmi-type="HmiTextBox" data-plc-variable="" style={{ ${box(left, top, width, size + 10)}, color: "${color("text")}", fontSize: ${size}, fontWeight: 700 }}>${text}</output>\n`;
}

export interface FieldOptions {
  left: number;
  top: number;
  width?: number;
  variable?: string;
  value?: string | number;
  /** I valori che arrivano dal PLC si leggono soltanto: nella foto hanno lo sfondo grigino. */
  readOnly?: boolean;
  unit?: string;
}

/** Il campo numerico: bianco, bordo sottile, valore centrato come nelle foto. */
export function field({ left, top, width = pageLayout.field.width as number, variable = "", value: content = 0, readOnly = false, unit }: FieldOptions): string {
  const { height, radius } = pageLayout.field;
  const input = `      <input data-hmi-type="HmiIOField" data-plc-variable="${variable}" defaultValue="${content}"${readOnly ? " readOnly" : ""} style={{ ${box(left, top, width, height)}, padding: "0 10px", border: "1px solid ${color("border")}", borderRadius: ${radius}, background: "${readOnly ? color("fieldReadOnly") : color("field")}", color: "${color("text")}", fontFamily: ${font}, fontSize: ${typography.body.size}, textAlign: "center" }} />\n`;
  if (!unit) return input;
  return input + `      <span style={{ ${box(left + width + 10, top + 6, 80, 20)}, color: "${color("textMuted")}", fontSize: ${typography.body.size} }}>${unit}</span>\n`;
}

/** Il select: campo bianco piu' il bottone grigio sfumato con il triangolino. */
export function selectField(left: number, top: number, options: readonly string[], variable = "", width: number = pageLayout.select.width): string {
  const { height, button, radius } = pageLayout.select;
  const items = options.map((item) => `<option>${item}</option>`).join("");
  return `      <select data-hmi-type="HmiSymbolicIOField" data-plc-variable="${variable}" style={{ ${box(left, top, width, height)}, padding: "0 ${button + 10}px 0 12px", border: "1px solid ${color("borderStrong")}", borderRadius: ${radius}, background: "${color("panel")}", color: "${color("text")}", fontFamily: ${font}, fontSize: ${typography.body.size}, appearance: "none" }}>${items}</select>
      <span aria-hidden="true" style={{ ${box(left + width - button - 2, top + 2, button, height - 4)}, display: "grid", placeItems: "center", borderRadius: "0 ${radius - 1}px ${radius - 1}px 0", background: "linear-gradient(180deg, ${color("controlLight")} 0%, ${color("controlDark")} 100%)", color: "${color("title")}", fontSize: 11, pointerEvents: "none" }}>&#9660;</span>\n`;
}

/** Lo switch a pillola: spento e' magenta con il pallino a sinistra, acceso e' verde chiaro con il
 * pallino a destra. Sono i due colori misurati, non due colori qualsiasi. */
export function toggle(left: number, top: number, on: boolean, variable = "", write?: TagWrite): string {
  const { width, height, knob } = pageLayout.toggle;
  const offset = on ? width - knob - 4 : 4;
  return `      <button type="button" role="switch" aria-checked={${on}} data-hmi-type="HmiSwitch" data-plc-variable="${variable}"${tagWrite(write, write === "invert" ? 0 : undefined)} style={{ ${box(left, top, width, height)}, padding: "0 12px", border: 0, borderRadius: ${height / 2}, background: "${on ? color("on") : color("off")}", color: "white", fontFamily: ${font}, fontSize: ${typography.body.size}, fontWeight: 700, textAlign: "${on ? "left" : "right"}" }}>${on ? "ON" : "OFF"}</button>
      <span aria-hidden="true" style={{ ${box(left + offset, top + 4, knob, knob)}, borderRadius: "50%", background: "white", pointerEvents: "none" }} />\n`;
}

/** Il gruppo di scelte: cerchietto con il rilievo e il punto nero su quella scelta. */
export function radioGroup(left: number, top: number, items: readonly string[], variable = "", selected = 0): string {
  const { size, dot, pitch } = pageLayout.radio;
  return items.map((text, index) => {
    const y = top + index * pitch;
    const chosen = index === selected;
    const mark = chosen
      ? `      <span aria-hidden="true" style={{ ${box(left + (size - dot) / 2, y + (size - dot) / 2, dot, dot)}, borderRadius: "50%", background: "${color("text")}", pointerEvents: "none" }} />\n`
      : "";
    return `      <button type="button" role="radio" aria-checked={${chosen}} data-hmi-type="HmiRadioButtonGroup" data-plc-variable="${variable}" style={{ ${box(left, y, size, size)}, border: "1px solid ${color("borderStrong")}", borderRadius: "50%", background: "linear-gradient(180deg, ${color("panel")} 0%, ${color("fieldReadOnly")} 100%)" }} />\n${mark}      <span style={{ ${box(left + size + 12, y + 1, 260, 20)}, color: "${color("text")}", fontSize: ${typography.body.size} }}>${text}</span>\n`;
  }).join("");
}

/** Che cosa scrive un pulsante quando lo tocchi. Sono le quattro funzioni che usano davvero gli
 * script dell'export: `IncreaseTag(tag, passo)`, `DecreaseTag(tag, passo)`, `InvertBitInTag(tag, 0)`
 * e `SetBitInTag(tag, 0)`. Scritta nell'elemento, l'operazione resta leggibile dall'Inspector e
 * dice a chi generera' il progetto TIA quale script mettere. */
export type TagWrite = "increase" | "decrease" | "invert" | "set";

/** L'operazione e il passo, attaccati all'elemento come il tag. */
export function tagWrite(write: TagWrite | undefined, step?: number): string {
  if (!write) return "";
  return ` data-plc-write="${write}"` + (step === undefined ? "" : ` data-plc-step="${step}"`);
}

export interface CommandOptions {
  left: number;
  top: number;
  width: number;
  height?: number;
  text: string;
  variable?: string;
  /** Antracite e' il comando normale, arancio chiede conferma, rosso e' distruttivo. */
  tone?: "dark" | "danger" | "warning";
  /** Il posto dell'icona a sinistra, come nei comandi grandi delle pagine funzione. */
  icon?: boolean;
  /** Che cosa scrive nel tag: e' lo script della schermata vera. */
  write?: TagWrite;
  step?: number;
  /** L'espressione da mettere nell'`onClick`, quando la pagina generata deve muoversi davvero e non
   * solo dichiarare che cosa scriverebbe. */
  onClick?: string;
  /** Il testo grande dei pulsanti `-` e `+` delle righe a passo. */
  fontSize?: number;
}

/** Il comando: antracite con la scritta bianca. E' il solo bottone scuro delle pagine chiare. */
export function command({ left, top, width, height = pageLayout.command.height as number, text, variable = "", tone = "dark", icon = false, write, step, onClick, fontSize }: CommandOptions): string {
  const background = tone === "danger" ? color("danger") : tone === "warning" ? color("warning") : color("command");
  const foreground = tone === "warning" ? color("text") : "white";
  const click = onClick ? ` onClick={${onClick}}` : "";
  const button = `      <button type="button" data-hmi-type="HmiButton" data-plc-variable="${variable}"${tagWrite(write, step)}${click} style={{ ${box(left, top, width, height)}, display: "grid", placeItems: "center", ${icon && text ? "paddingLeft: 44, " : ""}border: "1px solid ${color("commandBorder")}", borderRadius: ${pageLayout.command.radius}, background: "${background}", color: "${foreground}", fontFamily: ${font}, fontSize: ${fontSize ?? typography.body.size}, fontWeight: 700 }}>${text}</button>\n`;
  if (!icon) return button;
  return button + `      <img data-hmi-type="HmiGraphicView" src="/placeholder.svg" alt="" style={{ ${box(left + 24, top + (height - 28) / 2, 28, 28)}, objectFit: "contain", pointerEvents: "none" }} />\n`;
}

/** La spia di stato: il cerchietto colorato accanto a un nome. Rosso vuol dire "non ancora". */
export function lamp(left: number, top: number, tone: "on" | "bad" | "warning" | "muted" = "muted", size = 26): string {
  const fill = tone === "on" ? color("on") : tone === "bad" ? color("statusBad") : tone === "warning" ? color("warning") : color("fieldReadOnly");
  return `      <span data-hmi-type="HmiCircle" data-plc-variable="" style={{ ${box(left, top, size, size)}, display: "grid", placeItems: "center", borderRadius: "50%", background: "${fill}", color: "white", fontSize: ${typography.body.size}, fontWeight: 700 }}>!</span>\n`;
}

/** L'immagine della macchina: e' un dato del singolo progetto, quindi il template lascia un posto
 * sostituibile invece di fingere di conoscerla.
 *
 * `role` dice che cosa ci va: `machine` e' la macchina intera, quella che il flusso "crea pannello
 * standard" sa gia' mettere se gli dai la foto; `detail` e' un pezzo (un encoder, un robot, una
 * stazione) e resta segnaposto finche' non lo scegli tu dall'Inspector. */
export function machineImage(left: number, top: number, width: number, height: number, alt: string, role: "machine" | "detail" = "detail"): string {
  return `      <img data-hmi-type="HmiGraphicView" data-image-role="${role}" src="/placeholder.svg" alt="${alt}" style={{ ${box(left, top, width, height)}, objectFit: "contain" }} />\n`;
}

/** Un WebControl WinCC: nel canvas resta trasparente quando il server non e' raggiungibile, ma URL
 * e geometria rimangono nel sorgente per l'anteprima runtime e per la futura esportazione TIA. */
export function webControl(left: number, top: number, width: number, height: number, url: string, labelText: string): string {
  return `      <div role="region" data-hmi-type="HmiWebControl" data-hmi-url="${url}" aria-label="${labelText}" style={{ ${box(left, top, width, height)}, background: "transparent" }} />\n`;
}

/** La zona verde sull'immagine della macchina: e' un poligono cliccabile, e nelle foto si vede
 * (1081 e 5001 hanno le parti in verde acceso). Porta a un'altra pagina o comanda un organo. */
export function zone(left: number, top: number, width: number, height: number, name: string, target?: string): string {
  const open = target ? ` onDoubleClick={() => openPage("${target}")}` : "";
  return `      <button type="button" data-hmi-type="HmiTouchArea" aria-label="${name}"${open} style={{ ${box(left, top, width, height)}, border: "2px solid ${color("selection")}", borderRadius: 4, background: "rgba(0, 232, 50, .35)" }} />
`;
}

/** Il fungo di emergenza sull'immagine della linea: nello standard e' la grafica `eMERGENCY`, qui
 * il disco rosso con la ghiera gialla, che si sostituisce con la grafica vera. */
export function emergencyBadge(left: number, top: number, size = 42): string {
  return `      <span data-hmi-type="HmiGraphicView" data-plc-variable="" aria-label="Emergenza" style={{ ${box(left, top, size, size)}, borderRadius: "50%", border: "3px solid ${color("warning")}", background: "radial-gradient(circle at 50% 40%, ${color("danger")} 0%, #7D0000 100%)" }} />
`;
}

/** La barriera fotoelettrica: la strisciolina gialla verticale delle viste macchina. */
export function barrier(left: number, top: number, height: number, width = 6): string {
  return `      <span data-hmi-type="HmiGraphicView" data-plc-variable="" aria-label="Barriera" style={{ ${box(left, top, width, height)}, borderRadius: ${width / 2}, background: "${color("warning")}" }} />
`;
}

/** I 3 px di grigio che separano due righe o due mezze righe. */
export function rule(left: number, top: number, width: number, height: number = pageLayout.separator): string {
  return `      <div aria-hidden="true" style={{ ${box(left, top, width, height)}, background: "${color("separator")}" }} />\n`;
}

export interface SettingRowOptions {
  left: number;
  top: number;
  width: number;
  label: string;
  /** Il controllo, gia' costruito con le funzioni qui sopra. */
  control: string;
  /** L'illustrazione a destra della riga, come nelle pagine Program Modification. */
  illustration?: string;
  /** L'ultima riga di una scheda non ha il grigio sotto. */
  last?: boolean;
  height?: number;
}

/** Una riga di impostazione dentro una scheda: etichetta in alto, controllo sotto, eventuale
 * illustrazione a destra, e i 3 px di grigio che la staccano dalla riga seguente. */
export function settingRow({ left, top, width, label: text, control, illustration, last = false, height = pageLayout.row.height as number }: SettingRowOptions): string {
  const { padding, labelTop } = pageLayout.row;
  const picture = illustration ? machineImage(left + width - 210, top + 14, 190, height - 32, illustration) : "";
  const separator = last ? "" : rule(left, top + height - pageLayout.separator, width);
  // Senza illustrazione l'etichetta ha tutta la riga: e' lunga, e nella foto sta su una riga sola.
  const labelWidth = width - 2 * padding - (illustration ? 214 : 0);
  return label(left + padding, top + labelTop, text, labelWidth) + control + picture + separator;
}

/** Le celle di stato affiancate: nome piu' spia, divise dal grigio. Le pagine dispositivo ne hanno
 * una fila sotto l'intestazione. */
export function statusStrip(left: number, top: number, width: number, height: number, items: readonly string[], variable = ""): string {
  const cell = Math.round((width - (items.length - 1) * pageLayout.separator) / items.length);
  return items.map((text, index) => {
    const x = left + index * (cell + pageLayout.separator);
    const gap = index === items.length - 1 ? "" : rule(x + cell, top, pageLayout.separator, height);
    return `      <div data-hmi-type="HmiRectangle" style={{ ${box(x, top, cell, height)}, background: "${color("panel")}" }} />
      <span data-hmi-type="HmiTextBox" style={{ ${box(x, top + (height - 20) / 2, cell - 60, 20)}, textAlign: "right", color: "${color("text")}", fontSize: ${typography.heading.size} }}>${text}</span>\n${lamp(x + cell - 48, top + (height - 26) / 2, "bad")}${gap}`;
  }).join("").replace(/data-plc-variable=""/g, `data-plc-variable="${variable}"`);
}

/** Una piastrella della pagina indice: icona, distintivo in alto a destra e nome sotto. Queste
 * pagine stanno sul nero del guscio, non sulla pagina chiara. */
export function tile(left: number, top: number, text: string, target = ""): string {
  const { width, height, badge } = pageLayout.tile;
  const open = target ? ` onDoubleClick={() => openPage("${target}")}` : "";
  return `      <button type="button" data-hmi-type="HmiButton" data-plc-variable=""${open} style={{ ${box(left, top, width, height)}, border: 0, borderRadius: 4, background: "${color("indexTile")}" }} />
      <img data-hmi-type="HmiGraphicView" src="/placeholder.svg" alt="${text}" style={{ ${box(left + 8, top + 12, width - 16, height - 24)}, objectFit: "contain", pointerEvents: "none" }} />
      <span aria-hidden="true" style={{ ${box(left + width - badge + 12, top - 12, badge, badge)}, display: "grid", placeItems: "center", borderRadius: 4, background: "${color("panel")}", color: "${color("title")}", fontSize: 15 }}>&#9776;</span>
      <span data-hmi-type="HmiTextBox" style={{ ${box(left - 48, top + height + 10, width + 96, 34)}, textAlign: "center", color: "white", fontSize: ${typography.body.size} }}>${text}</span>\n`;
}

export interface TableColumn {
  label: string;
  width: number;
  /** I numeri di riga e i codici stanno in mezzo alla colonna, i testi a sinistra. */
  align?: "left" | "center" | "right";
}

export interface TableOptions {
  left: number;
  top: number;
  width: number;
  columns: readonly TableColumn[];
  rows?: readonly (readonly (string | number)[])[];
  /** Quante righe disegnare in tutto, vuote comprese: nelle foto la tabella e' sempre piena. */
  total?: number;
  variable?: string;
  /** L'oggetto WinCC da dichiarare sopra la tabella. */
  hmiType?: string;
  /** Filtro e sorgente del controllo allarmi, copiati dal JSON WinCC. */
  alarmFilter?: string;
  alarmSource?: "active" | "history";
  alarmLog?: string;
  /** Tag valorizzati quando l'operatore seleziona una riga. */
  selectionTags?: readonly string[];
}

/** La tabella degli allarmi e dello storico: intestazione in grassetto, righe alterne
 * bianco/grigino, bordi appena accennati. */
export function table({ left, top, width, columns, rows = [], total = 21, variable = "", hmiType = "HmiAlarmControl", alarmFilter, alarmSource, alarmLog, selectionTags = [] }: TableOptions): string {
  const grid = columns.map((item) => `${item.width}px`).join(" ");
  /** Le colonne sono divise da una riga del grigio della pagina, come nella foto della 3001. */
  const cellStyle = (index: number) =>
    `padding: "0 10px", textAlign: "${columns[index].align ?? "left"}", ${index === columns.length - 1 ? "" : `borderRight: "1px solid ${color("separator")}", `}overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"`;
  const heads = columns.map((item, index) => `<span style={{ ${cellStyle(index)} }}>${item.label}</span>`).join("");
  const head = `      <div style={{ ${box(left, top, width, pageLayout.table.head)}, display: "grid", gridTemplateColumns: "${grid}", alignItems: "center", borderBottom: "1px solid ${color("tableHeadBorder")}", background: "${color("panel")}", color: "${color("text")}", fontSize: ${typography.body.size}, fontWeight: 700 }}>${heads}</div>\n`;
  const body = Array.from({ length: total }, (_, index) => {
    const cells = columns.map((_, cell) => {
      const text = String(rows[index]?.[cell] ?? "");
      return `<span style={{ ${cellStyle(cell)} }}>{${JSON.stringify(text)}}</span>`;
    }).join("");
    const y = top + pageLayout.table.head + index * pageLayout.table.row;
    return `      <div style={{ ${box(left, y, width, pageLayout.table.row)}, display: "grid", gridTemplateColumns: "${grid}", alignItems: "center", borderBottom: "1px solid ${color("tableBorder")}", background: "${index % 2 ? color("tableStripe") : color("panel")}", color: "${color("text")}", fontSize: ${typography.body.size} }}>${cells}</div>`;
  }).join("\n");
  const alarmContract = hmiType === "HmiAlarmControl"
    ? ` data-hmi-columns='${JSON.stringify(columns)}'${alarmFilter ? ` data-hmi-filter=${JSON.stringify(alarmFilter)}` : ""}${alarmSource ? ` data-hmi-alarm-source="${alarmSource}"` : ""}${alarmLog ? ` data-hmi-alarm-log="${alarmLog}"` : ""}${selectionTags.length ? ` data-hmi-selection-tags="${selectionTags.join(",")}"` : ""}`
    : "";
  const overlay = `      <div role="grid" tabIndex={0} data-hmi-type="${hmiType}" data-plc-variable="${variable}"${alarmContract} aria-label="Controllo allarmi" style={{ ${box(left, top, width, tableHeight(total))}, background: "transparent" }} />\n`;
  return `${head}${body}\n${overlay}`;
}

/** Quanto e' alta una tabella di `total` righe: serve a chi la mette dentro una scheda. */
export function tableHeight(total: number): number {
  return pageLayout.table.head + total * pageLayout.table.row;
}

/** Quante righe ci stanno in `height` pixel di tabella. */
export function tableRows(height: number): number {
  return Math.max(0, Math.floor((height - pageLayout.table.head) / pageLayout.table.row));
}

/** Le linguette numerate a destra: quella aperta prende il colore della sezione e sporge, le altre
 * restano grigie. Le pilota `Folder_Vis`, il tag piu' usato di tutto lo standard. */
export function folderTabs(count: number, sectionColor: string, variable = "Folder_Vis", active = 0, routes: readonly string[] = []): string {
  const { left, top, width, height, pitch, activeOverhang } = pageLayout.tab;
  return Array.from({ length: Math.max(count, routes.length) }, (_, index) => {
    const open = index === active;
    const x = open ? left - activeOverhang : left;
    // Nell'export ogni linguetta ha lo script `ChangeScreen`: non scopre un pezzo di pagina, cambia
    // proprio pagina. Dove la sorella non c'e' ancora la linguetta resta ferma, come oggi.
    const route = routes[index];
    const go = route && !open ? ` onClick={() => openPage("${route}")}` : "";
    return `      <button type="button" data-hmi-type="HmiButton" data-plc-variable="${variable}"${go} style={{ ${box(x, top + index * pitch, open ? width + activeOverhang : width, height)}, border: 0, borderRadius: "0 4px 4px 0", background: "${open ? sectionColor : color("tabInactive")}", color: "white", fontFamily: ${font}, fontSize: ${typography.body.size}, fontWeight: 700 }}>${index + 1}</button>\n`;
  }).join("");
}
