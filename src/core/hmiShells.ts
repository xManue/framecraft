import { cssColor, desktopShell, lateralBar, mobileNavigator, mobileShell, palette, panelSize, sections, shellTags, submenuPalette, submenuPanel, typography } from "./hmiStandard";
import { mobileSectionTiles, submenuPlacementNear } from "./hmiSectionMenu";

/** Gli undici pezzi del guscio, ridisegnati sui JSON dell'export.
 *
 * Erano scritti a mano dentro `registry.ts`, con misure e colori decisi a occhio: la barra laterale
 * era grigia con la prima voce petrol, il sottomenu era 240x290, il navigatore aveva le tab alte 48
 * e il "punto informativo" era un cerchio con dentro una "i". Le schermate dicono altro, e adesso i
 * componenti vengono da li' e dalle costanti gia' misurate in `hmiStandard` — le stesse che usa il
 * generatore del pannello standard, cosi' quello che trascini e quello che genera il flusso "crea
 * pannello standard" sono la stessa cosa.
 *
 * | Componente | Schermata | Misura |
 * | --- | --- | --- |
 * | `hmi-layout-choice` | `0001_Choice` | 1280x800 |
 * | `hmi-desktop-shell` | `0000_Layout_PC` | 1280x800 |
 * | `hmi-mobile-shell` | `0000_Layout_Mobile` | 1280x800 |
 * | `hmi-top-bar` | `TopBar` | 1280x151 |
 * | `hmi-lateral-bar` | `Lateral Bar` | 80x649 |
 * | `hmi-mobile-top-bar` | `TopBar_Light` | 1280x70 |
 * | `hmi-mobile-bottom-bar` | `LowBar` | 1280x50 |
 * | `hmi-info-point` | `Info_Point` | 65x70 |
 * | `hmi-section-menu` | `2xxxx_Settings_Template` | 1280x800 |
 * | `hmi-mobile-section-menu` | `2xxxx_Settings_Template_1` | 1280x800 |
 * | `hmi-mobile-navigator` | `2xxxx_Settings_Template_Navigator` | 1280x64 |
 *
 * Due avvertenze oneste. La prima: nell'export **i gruppi sono stati appiattiti**, e i pezzi che
 * stavano dentro un gruppo hanno tenuto le coordinate locali — nel navigatore tutte e nove le tab
 * sono a Left 1, una sopra l'altra. Dove succede, la posizione e' ricostruita dal passo (che si
 * misura sulla larghezza) e il commento lo dice. La seconda: i testi sono `MultilingualText`,
 * quindi le scritte sono segnaposto, tranne dove il nome della sezione lo sappiamo gia'
 * (`sections`) o dove il testo e' un tag. */

const shellColor = (name: keyof typeof palette) => cssColor(palette[name]);
const font = JSON.stringify(typography.cssFamily);

export type HmiShellComponentType =
  | "hmi-layout-choice" | "hmi-desktop-shell" | "hmi-mobile-shell" | "hmi-top-bar" | "hmi-lateral-bar"
  | "hmi-mobile-top-bar" | "hmi-mobile-bottom-bar" | "hmi-info-point" | "hmi-section-menu"
  | "hmi-mobile-section-menu" | "hmi-mobile-navigator";

export interface HmiShellShape {
  type: HmiShellComponentType;
  /** La schermata dell'export da cui e' preso, misure comprese. */
  sourceScreen: string;
  width: number;
  height: number;
}

export const hmiShellShapes: readonly HmiShellShape[] = [
  { type: "hmi-layout-choice", sourceScreen: "0001_Choice", width: 1280, height: 800 },
  { type: "hmi-desktop-shell", sourceScreen: "0000_Layout_PC", width: 1280, height: 800 },
  { type: "hmi-mobile-shell", sourceScreen: "0000_Layout_Mobile", width: 1280, height: 800 },
  { type: "hmi-top-bar", sourceScreen: "TopBar", width: 1280, height: 151 },
  { type: "hmi-lateral-bar", sourceScreen: "Lateral Bar", width: 80, height: 649 },
  { type: "hmi-mobile-top-bar", sourceScreen: "TopBar_Light", width: 1280, height: 70 },
  { type: "hmi-mobile-bottom-bar", sourceScreen: "LowBar", width: 1280, height: 50 },
  { type: "hmi-info-point", sourceScreen: "Info_Point", width: 65, height: 70 },
  { type: "hmi-section-menu", sourceScreen: "2xxxx_Settings_Template", width: 1280, height: 800 },
  { type: "hmi-mobile-section-menu", sourceScreen: "2xxxx_Settings_Template_1", width: 1280, height: 800 },
  { type: "hmi-mobile-navigator", sourceScreen: "2xxxx_Settings_Template_Navigator", width: 1280, height: 64 },
];

// ---------------------------------------------------------------------------- i pezzi

const box = (left: number, top: number, width: number, height: number) =>
  `position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}`;

function frame(shape: HmiShellShape, name: string, body: string, background = shellColor("surfaceDark")): string {
  return `<div data-hmi-type="HmiScreen" aria-label="${name}" data-hmi-shell-screen="${shape.sourceScreen}" style={{ position: "relative", width: ${shape.width}, height: ${shape.height}, overflow: "hidden", background: "${background}", color: "${shellColor("text")}", fontFamily: ${font} }}>\n${body}    </div>`;
}

const rect = (left: number, top: number, width: number, height: number, fill: keyof typeof palette = "surface", border = false) =>
  `      <div data-hmi-type="HmiRectangle" style={{ ${box(left, top, width, height)}, background: "${shellColor(fill)}"${border ? `, border: "1px solid ${shellColor("border")}"` : ""} }} />\n`;

/** Un testo del guscio. Con `variable` diventa il campo che il runtime riempie; senza, e' una
 * scritta segnaposto, perche' nell'export vive nel dizionario multilingua. */
function text(left: number, top: number, width: number, height: number, content: string, variable = "", size: number = typography.body.size, weight = 400): string {
  // Un campo senza scritta e' un campo che riempie il runtime: invece di lasciarlo vuoto — e nella
  // barra sarebbero nove buchi neri — ci sta scritto il nome del tag, spento.
  const runtime = variable !== "" && content === "";
  return `      <span data-hmi-type="HmiTextBox" data-plc-variable="${variable}" style={{ ${box(left, top, width, height)}, display: "flex", alignItems: "center", color: "${shellColor(runtime ? "textMuted" : "text")}", fontSize: ${runtime ? 11 : size}, fontWeight: ${weight}, whiteSpace: "nowrap", overflow: "hidden" }}>${runtime ? variable : content}</span>\n`;
}

/** Un pulsante del guscio. `target` non diventa una `onClick`: la schermata di destinazione resta
 * scritta in `data-hmi-change-screen`, perche' un componente puo' finire in una pagina qualunque e
 * la `openPage` la' dentro potrebbe non esserci. */
function button(left: number, top: number, width: number, height: number, content: string, options: { target?: string; variable?: string; fill?: keyof typeof palette; radius?: number; size?: number; color?: string; borderColor?: string } = {}): string {
  const target = options.target ? ` data-hmi-change-screen="${options.target}"` : "";
  const fill = options.fill ?? "surfaceBlue";
  // Il sottomenu non e' del colore del guscio: la' `color` e `borderColor` arrivano gia' scritti.
  const color = options.color ?? shellColor("text");
  const borderColor = options.borderColor ?? shellColor("border");
  return `      <button type="button" data-hmi-type="HmiButton" data-plc-variable="${options.variable ?? ""}"${target} style={{ ${box(left, top, width, height)}, display: "grid", placeItems: "center", border: "1px solid ${borderColor}", borderRadius: ${options.radius ?? 0}, background: "${shellColor(fill)}", color: "${color}", fontFamily: ${font}, fontSize: ${options.size ?? typography.body.size}, overflow: "hidden" }}>${content}</button>\n`;
}

/** Il posto di una grafica TIA: le 225 icone del progetto non sono esportate, quindi resta un
 * riquadro tratteggiato con dentro il nome che ha nell'export. */
const graphic = (left: number, top: number, width: number, height: number, name: string) =>
  `      <span data-hmi-type="HmiGraphicView" aria-label="${name}" style={{ ${box(left, top, width, height)}, display: "grid", placeItems: "center", border: "1px dashed ${shellColor("borderLight")}", color: "${shellColor("textMuted")}", fontSize: 9, overflow: "hidden" }}>${name}</span>\n`;

/** La finestra di schermata: nel layout non c'e' niente dentro, c'e' il nome della schermata che il
 * runtime ci infila (`SW_Screen`, `SW_TopBar`, ...). */
const screenWindow = (left: number, top: number, width: number, height: number, name: string, screen: string, fill: keyof typeof palette) =>
  `      <div data-hmi-type="HmiScreenWindow" data-screen="${screen}" style={{ ${box(left, top, width, height)}, display: "grid", placeItems: "center", border: "1px dashed ${shellColor("border")}", background: "${shellColor(fill)}", color: "${shellColor("textMuted")}" }}>${name}</div>\n`;

// ---------------------------------------------------------------------------- 0001_Choice

/** La scelta della sessione: e' la prima schermata che si vede. Due quadrati 170x170, uno per il
 * pannello mobile e uno per il desktop, con il rettangolo che fa da cornice dietro e la scritta
 * sotto; il logo in basso a destra e, in alto a sinistra, la stessa icona con la riga di testo
 * della 9010. Il guscio che la ospita e' `0000_Layout_Choice`, che ci mette intorno i campi di
 * `PV_Enable_Session_PLC` e `PV_Watchdog_HMI`. */
function layoutChoice(shape: HmiShellShape): string {
  const choice = (rectLeft: number, target: string, label: string, labelLeft: number, labelWidth: number) =>
    rect(rectLeft, 296, 170, 170, "surface", true)
    // Il pulsante non e' centrato nella cornice: nell'export sta 19 pixel piu' in basso e a destra.
    + button(rectLeft + 19, 315, 170, 170, "", { target, fill: "surfaceBlue" })
    + text(labelLeft, 498, labelWidth, 18, label);
  return frame(shape, "Scelta della sessione",
    graphic(0, 0, 1280, 800, "Sfondo")
    + graphic(34, 36, 43, 45, "Icona")
    + text(87, 36, 342, 45, "Titolo della schermata", "", 30)
    + choice(410, "0000_Layout_Mobile", "Mobile", 484, 60)
    + choice(695, "0000_Layout_PC", "Desktop", 731, 61)
    + text(473, 585, 357, 77, "Riga di avviso")
    + graphic(1120, 640, 222, 68, "Logo"));
}

// ---------------------------------------------------------------------------- 0000_Layout_PC

/** Il guscio desktop: quattro finestre e basta. Le misure stanno in `desktopShell`, cosi' il
 * componente e il pannello generato non possono discordare. */
function desktopLayout(shape: HmiShellShape): string {
  const { topBar, lateralBar: bar, content, submenu } = desktopShell;
  return frame(shape, "Guscio desktop",
    screenWindow(topBar.left, topBar.top, topBar.width, topBar.height, "SW_TopBar", topBar.screen, "surface")
    + screenWindow(bar.left, bar.top, bar.width, bar.height, "SW_Main_Menu", bar.screen, "surfaceBlue")
    + screenWindow(content.left, content.top, content.width, content.height, "SW_Screen", "1001_Upstair", "surfaceDark")
    // Il sottomenu sta sopra tutto e di suo e' invisibile: lo accende `SW_PopUp_Visibility`.
    + `      <div data-hmi-type="HmiScreenWindow" data-screen="Sottomenu" data-plc-variable="${shellTags.popupVisible}" style={{ ${box(submenu.left, submenu.top, submenu.width, submenu.height)}, border: "1px dashed ${shellColor("accent")}", pointerEvents: "none" }} />\n`);
}

// ---------------------------------------------------------------------------- 0000_Layout_Mobile

/** Il guscio mobile: cinque finestre. La barra grande (350) e quella piccola (70) stanno tutte e
 * due a (0,0) e si alternano — non e' un errore di lettura, e' come sta nell'export. */
function mobileLayout(shape: HmiShellShape): string {
  const { topBar, topBarBig, navigator, content, lowBar, submenu } = mobileShell;
  return frame(shape, "Guscio mobile",
    screenWindow(topBar.left, topBar.top, topBar.width, topBar.height, "SW_TopBar", topBar.screen, "surface")
    + screenWindow(navigator.left, navigator.top, navigator.width, navigator.height, "SW_Navigator", "2xxxx_Settings_Template_Navigator", "surfaceBlue")
    + screenWindow(content.left, content.top, content.width, content.height, "SW_Screen", "1001_Upstair", "surfaceDark")
    + screenWindow(lowBar.left, lowBar.top, lowBar.width, lowBar.height, "SW_LowBar", lowBar.screen, "surface")
    // La barra grande sta nello stesso angolo di quella piccola e si alternano. Disegnata piena
    // sparirebbe sotto le altre finestre, quindi resta il suo contorno, sopra tutto.
    + screenWindow(topBarBig.left, topBarBig.top, topBarBig.width, topBarBig.height, "SW_TopBar_Big", topBarBig.screen, "transparent")
    + `      <div data-hmi-type="HmiScreenWindow" data-screen="Sottomenu_Mobile" data-plc-variable="${shellTags.popupSlideIn}" style={{ ${box(submenu.left, submenu.top, submenu.width, submenu.height)}, border: "1px dashed ${shellColor("accent")}", pointerEvents: "none" }} />\n`);
}

// ---------------------------------------------------------------------------- TopBar

/** La barra desktop: a sinistra l'utente e l'orologio, in mezzo la riga del programma e quella
 * dell'ultimo allarme, a destra modo e stato macchina, e in fondo il logo, che e' il pulsante da
 * cui si arriva alle pagine CLV. */
function topBar(shape: HmiShellShape): string {
  // Le quattro righe di programma nell'export hanno perso l'origine del gruppo: restano i loro
  // scarti interni (0, 148, 227) e le larghezze (130, 46, 449), rimessi dentro la fascia 177x747.
  const programRow = (index: number) => {
    const top = 53 + index * 23;
    // Le righe partono dopo l'icona della fascia (176..219), com'e' nella schermata.
    return text(228, top, 130, 23, "", `Line_${index + 1}_Name`)
      + text(376, top, 46, 23, "", `Program_Selection_Program_Selection_L[${index}]`)
      + text(455, top, 449, 23, "", `Prog_In_Use_L${index + 1}_Description`);
  };
  return frame(shape, "Barra superiore desktop",
    rect(0, 0, 1280, 151, "surface")
    // L'utente: il riquadro, l'icona, e il nome che arriva da `@UserName`.
    + rect(12, 49, 151, 96, "surfaceBlue", true)
    + graphic(72, 79, 31, 38, "Utente")
    + text(12, 120, 151, 24, "", "@UserName")
    // L'orologio non e' accanto al pulsante della sessione: ci sta sopra. Nell'export e' il gruppo
    // del pulsante (4,6 164x36) ad avere dentro l'ora e la data, con le coordinate sue.
    + button(4, 6, 164, 36, "", { target: "0001_Choice" })
    + text(-1, 7, 97, 48, "Orologio", "", typography.headingLarge.size)
    + text(101, 14, 71, 21, "Giorno", "", 11)
    + text(101, 27, 71, 21, "Data", "", 11)
    // La fascia in alto: l'ultimo allarme, con indice, messaggio e unita'.
    + rect(177, 7, 747, 36, "surfaceDark", true)
    + graphic(176, 5, 41, 38, "Allarmi")
    + text(311, 14, 55, 23, "", "Alarms_UN_History_FirstFault_Index")
    + text(368, 14, 398, 23, "", "Alarms_History_Message")
    + text(772, 14, 145, 23, "", "Alarms_History_EM")
    // La fascia sotto: le quattro linee col programma in uso.
    + rect(177, 49, 747, 95, "surfaceDark", true)
    + graphic(176, 45, 43, 38, "Programma")
    + [0, 1, 2, 3].map(programRow).join("")
    // Modo e stato macchina: due riquadri con la loro etichetta sopra.
    + rect(935, 49, 134, 34, "surfaceBlue", true)
    + graphic(948, 54, 33, 25, "Modo")
    + rect(935, 85, 65, 59, "surfaceBlue", true)
    + rect(1002, 85, 67, 59, "surfaceBlue", true)
    + text(935, 90, 57, 23, "Modo")
    + text(1003, 90, 64, 23, "Stato")
    + text(935, 113, 65, 23, "", "PV_Config.TopBar_Interface.Machine_Mode")
    + text(1002, 113, 67, 23, "", "PV_Config.TopBar_Interface.Machine_Status")
    // Il logo: non e' un disegno e basta, e' il pulsante che porta alla 2281.
    + rect(1085, 50, 185, 96, "surfaceBlue", true)
    + button(1093, 4, 169, 47, "", { target: "2281_CLV_User_Main" })
    + graphic(1093, 4, 169, 41, "Logo"));
}

// ---------------------------------------------------------------------------- Lateral Bar

/** La barra laterale: sette tessere 60x60 a passo 94, ognuna con il nome sotto. Ogni icona non
 * cambia pagina: apre il sottomenu della sezione (`ChangeScreen` verso `../Sottomenu`) e accende
 * `SW_PopUp_Visibility`. Il colore della tessera e' quello della sezione, e quella non attiva sta a
 * meta' opacita': la selezione e' un `Range` su `Actual_Page_Number`. */
function lateralBarShell(shape: HmiShellShape): string {
  const { iconLeft, iconSize, firstIconTop, pitch, labelOffset, labelWidth, labelHeight, inactiveOpacity } = lateralBar;
  return frame(shape, "Barra laterale", sections.map((section) => {
    const top = firstIconTop + section.slot * pitch;
    const active = section.slot === 0;
    return `      <button type="button" data-hmi-type="HmiButton" aria-label="${section.label}" data-plc-variable="${shellTags.actualPageNumber}" data-hmi-change-screen="${section.submenuScreen}" style={{ ${box(iconLeft, top, iconSize, iconSize)}, display: "grid", placeItems: "center", border: 0, background: "linear-gradient(180deg, ${cssColor(section.color.top)}, ${cssColor(section.color.bottom)})", color: "${shellColor("text")}", fontFamily: ${font}, fontSize: 9, opacity: ${active ? 1 : inactiveOpacity} }}>${section.icon.replace("Icon_", "")}</button>\n`
      + text(iconLeft - 1, top + labelOffset, labelWidth, labelHeight, section.label, shellTags.actualPageNumber, 12);
  }).join(""), shellColor("surfaceBlue"));
}

// ---------------------------------------------------------------------------- il sottomenu

/** Le sette voci: sono quelle della sezione Settings nell'export, che e' la schermata da cui e'
 * ricostruito il pannello. Chi lo usa per un'altra sezione cambia le scritte e le destinazioni. */
const settingsEntries = [
  ["Program Modification", "2001_Robot_Program_Modification_1"],
  ["Encoders", "2041_Encoders_Main"],
  ["Motor Speed", "2081_Motor_Speed_1"],
  ["Robot Function", "2121_RobotFunction"],
  ["Lubrification", "2161_Lubrification"],
  ["MMC Guide", "2201_MMC_Guide"],
  ["System Function", "2241_SystemFunction"],
] as const;

/** Il pannello del sottomenu, disegnato a partire dal suo angolo: e' lo stesso nel desktop e nel
 * mobile, cambia solo dove viene messo. */
function submenuAt(left: number, top: number, side: "left" | "right" = "right", pointerTop = top + submenuPanel.pointerOffset): string {
  const { panel, pointer, entry, separator } = submenuPanel;
  const dx = left - panel.left;
  // Il pannello non e' del colore del guscio: e' il grigio chiaro campionato sulle foto dei tre
  // sottomenu (#C8C8C8), col filo #C0C0C0 e la scritta #323232.
  const panelColor = cssColor(submenuPalette.panel);
  return `      <div data-hmi-type="HmiRectangle" style={{ ${box(left, top, panel.width, panel.height)}, borderRadius: 10, background: "${panelColor}" }} />\n`
    // Il triangolino che punta all'icona: nell'export e' un poligono, qui un triangolo di bordi.
    // Con il pannello aperto a sinistra del quadrato (menu mobile, prima colonna) guarda a destra.
    + `      <div aria-hidden="true" style={{ ${box(side === "left" ? left + panel.width - 1 : pointer.left + dx, pointerTop, pointer.width, pointer.height)}, borderTop: "${pointer.height / 2}px solid transparent", borderBottom: "${pointer.height / 2}px solid transparent", border${side === "left" ? "Left" : "Right"}: "${pointer.width}px solid ${panelColor}" }} />\n`
    + settingsEntries.map(([label, target], index) => {
      const entryTop = top + entry.first + index * entry.pitch;
      return graphic(separator.left + dx + 11, entryTop + 3, 25, 22, "Voce")
        + button(entry.left + dx, entryTop, entry.width, entry.height, label, { target, fill: "transparent", size: 13, color: cssColor(submenuPalette.text), borderColor: "transparent" })
        + (index < settingsEntries.length - 1
          ? `      <div data-hmi-type="HmiRectangle" style={{ ${box(separator.left + dx, entryTop + entry.height, separator.width, separator.height)}, background: "${cssColor(submenuPalette.separator)}" }} />\n`
          : "");
    }).join("");
}

/** La fila di icone di sezione che il sottomenu ridisegna sopra il guscio: sono le stesse sette
 * della barra laterale, alla stessa distanza, e nel desktop partono da 171. */
function sectionRail(left: number, firstTop: number): string {
  return sections.map((section) =>
    button(left, firstTop + section.slot * lateralBar.pitch, lateralBar.iconSize, lateralBar.iconSize, section.icon.replace("Icon_", ""), { target: section.submenuScreen, size: 9 })).join("");
}

/** Il velo che chiude il sottomenu: nell'export e' un pulsante trasparente grande quanto lo schermo
 * che spegne `SW_PopUp_Visibility`. */
const dismissLayer = () =>
  `      <button type="button" data-hmi-type="HmiButton" aria-label="Chiudi il sottomenu" data-plc-variable="${shellTags.popupVisible}" data-plc-write="set" data-plc-step="0" style={{ ${box(0, 0, 1280, 800)}, border: 0, background: "transparent" }} />\n`;

function sectionMenu(shape: HmiShellShape): string {
  return frame(shape, "Sottomenu desktop", dismissLayer() + sectionRail(27, 171) + submenuAt(129, 229), "transparent");
}

/** Il menu mobile: lo stesso pannello, ma le sezioni sono nove quadrati 80x80 in mezzo allo
 * schermo invece della fila a sinistra, e il pannello si apre accanto a quello toccato.
 *
 * Le misure sono quelle di `mobileSectionMenu` e `submenuPlacementNear`, cioe' le stesse che usa il
 * template `section-menu-popup`: colonne a 451/600/749, righe a 216/366/511, pannello a 40 px dal
 * quadrato. Qui e' aperto su Settings, la schermata da cui e' misurato. */
function mobileSectionMenuShell(shape: HmiShellShape): string {
  const tiles = mobileSectionTiles();
  const grid = tiles.map((tile) => {
    const section = sections[tile.index];
    if (section) {
      return button(tile.left, tile.top, tile.size, tile.size, section.label, { target: section.submenuScreen, size: 11 });
    }
    // Delle due caselle che avanzano, nell'export solo l'ultima fa qualcosa: torna alla scelta
    // della sessione. L'altra e' li' e basta.
    return tile.index === 8
      ? button(tile.left, tile.top, tile.size, tile.size, "Sessione", { target: "0001_Choice", size: 11 })
      : button(tile.left, tile.top, tile.size, tile.size, "", { size: 11 });
  }).join("");
  const open = submenuPlacementNear(tiles[1], submenuPanel.maxEntries);
  const panel = submenuAt(open.panel.left, open.panel.top, open.pointer.side, open.pointer.top);
  return frame(shape, "Menu di sezione mobile", dismissLayer() + grid + panel, "transparent");
}

// ---------------------------------------------------------------------------- il navigatore mobile

/** Il navigatore: le voci del sottomenu diventate tab, con la barretta accesa sotto quella attiva.
 * Nell'export le tab hanno perso l'origine del gruppo — sono tutte a Left 1 — quindi qui stanno in
 * fila al passo della barretta (158), dopo il pulsante della casa. L'ultima e' piu' stretta (103):
 * e' quella delle pagine CLV. */
function mobileNavigatorShell(shape: HmiShellShape): string {
  const { badge, tab, underline, firstTabLeft, pitch } = mobileNavigator;
  const home = button(badge.left, badge.top, badge.width, badge.height, "Home", { target: "Main_Mobile", size: 11 });
  const slot = (index: number) => firstTabLeft + index * pitch;
  const strip = (index: number, width: number, label: string, target: string, active = false) =>
    button(slot(index) + tab.left, 0, width - tab.left, tab.height, label, { target, variable: shellTags.actualPageNumber, fill: "transparent", size: 12 })
    + rect(slot(index) + underline.left, underline.top, width, underline.height, active ? "accent" : "borderDark");
  const tabs = settingsEntries.map(([label, target], index) => strip(index, pitch, label, target, index === 0)).join("");
  // L'ottava voce di Settings si prende quello che resta della striscia: 1280 - 71 - 7*158 = 103.
  const clv = strip(settingsEntries.length, panelSize.width - slot(settingsEntries.length), "CLV", "2281_CLV_User_Main");
  return frame(shape, "Navigatore mobile", home + tabs + clv, shellColor("surfaceBlue"));
}

// ---------------------------------------------------------------------------- le barre mobili

/** La barra mobile piccola: utente a destra, orologio a sinistra, il logo delle CLV in fondo e due
 * scorciatoie in mezzo. */
function mobileTopBar(shape: HmiShellShape): string {
  return frame(shape, "Barra superiore mobile",
    rect(0, 0, 1280, 52, "surface")
    + text(-5, 1, 97, 48, "Orologio", "", typography.headingLarge.size)
    + text(97, 8, 71, 21, "Giorno", "", 11)
    + text(97, 21, 71, 21, "Data", "", 11)
    + text(105, 0, 215, 34, "Nome macchina", "", typography.heading.size, 700)
    + button(214, 2, 50, 50, "", { target: "3001_Alarms" })
    + button(265, 3, 50, 50, "", { target: "2001_Robot_Program_Modification_1" })
    + graphic(804, 8, 18, 20, "Utente")
    + text(763, 25, 97, 24, "", "@UserName")
    + text(862, 14, 122, 23, "Stato")
    + rect(609, 52, 61, 14, "surfaceBlue")
    + button(1111, 4, 160, 47, "", { target: "2281_CLV_User_Main" })
    + graphic(1117, 5, 159, 41, "Logo"), shellColor("surface"));
}

/** La barra bassa: tre pulsanti, e quello in mezzo torna alla pagina principale mobile. */
function mobileBottomBar(shape: HmiShellShape): string {
  return frame(shape, "Barra inferiore mobile",
    button(425, 0, 80, 50, "", {})
    + button(598, 0, 82, 50, "Home", { target: "Main_Mobile" })
    + button(780, 0, 80, 50, "", {}), shellColor("surface"));
}

/** Il "punto informativo" non e' un punto informativo: e' la linguetta 65x70 che apre il popup dei
 * comandi zona (`OpenScreenInPopup("PanelControl", "9001_Popup_Control_Panel", ..., 870, 250)`).
 * Nella palette era un cerchio con dentro una "i", e non voleva dire niente. */
function infoPoint(shape: HmiShellShape): string {
  return frame(shape, "Linguetta dei comandi zona",
    rect(0, 0, 32, 21, "surfaceBlue")
    + button(17, 21, 45, 48, "", { target: "9001_Popup_Control_Panel", radius: 4 }), "transparent");
}

export function hmiShellJsx(type: HmiShellComponentType): string {
  const shape = hmiShellShapes.find((item) => item.type === type)!;
  switch (type) {
    case "hmi-layout-choice": return layoutChoice(shape);
    case "hmi-desktop-shell": return desktopLayout(shape);
    case "hmi-mobile-shell": return mobileLayout(shape);
    case "hmi-top-bar": return topBar(shape);
    case "hmi-lateral-bar": return lateralBarShell(shape);
    case "hmi-mobile-top-bar": return mobileTopBar(shape);
    case "hmi-mobile-bottom-bar": return mobileBottomBar(shape);
    case "hmi-info-point": return infoPoint(shape);
    case "hmi-section-menu": return sectionMenu(shape);
    case "hmi-mobile-section-menu": return mobileSectionMenuShell(shape);
    case "hmi-mobile-navigator": return mobileNavigatorShell(shape);
  }
}
