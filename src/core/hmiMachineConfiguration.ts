import { cssColor, pagePalette, typography } from "./hmiStandard";

const color = (value: keyof typeof pagePalette) => cssColor(pagePalette[value]);
const font = JSON.stringify(typography.cssFamily);

function panel(left: number, top: number, width: number, height: number, radius = 0, attributes = ""): string {
  return `      <div data-hmi-type="HmiRectangle"${attributes} style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}, borderRadius: ${radius}, background: "${color("panel")}" }} />\n`;
}

function pageTitle(title: string, width: number, textLeft: number, textWidth: number): string {
  return panel(0, 0, width, 37, 4)
    + `      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: ${textLeft}, top: 0, width: ${textWidth}, height: 37, display: "flex", alignItems: "center", color: "${color("title")}", fontFamily: ${font}, fontSize: ${typography.heading.size} }}>${title}</span>\n`;
}

function configurableScreen(options: {
  left: number;
  top: number;
  width: number;
  height: number;
  graphic: string;
  next: string;
  label: string;
}): string {
  return `      <div data-hmi-type="HmiGraphicView" data-hmi-graphic="${options.graphic}" data-image-role="detail" data-framecraft-slot="machine-part-screen" data-framecraft-next="${options.next}" aria-label="${options.label}" style={{ position: "absolute", left: ${options.left}, top: ${options.top}, width: ${options.width}, height: ${options.height}, display: "grid", placeItems: "center", overflow: "hidden", border: "2px dashed ${color("borderStrong")}", borderRadius: 5, background: "${color("panelMuted")}" }}><svg aria-hidden="true" viewBox="0 0 120 90" style={{ width: 112, height: 84, fill: "none", stroke: "${color("textMuted")}", strokeWidth: 3 }}><rect x="8" y="8" width="104" height="74" rx="5"/><circle cx="36" cy="31" r="9"/><path d="m14 71 27-25 18 15 18-20 29 30"/></svg><span style={{ position: "absolute", left: 18, right: 18, bottom: 16, color: "${color("textMuted")}", fontFamily: ${font}, fontSize: 13, textAlign: "center" }}>${options.label}</span></div>\n`;
}

export function motorSpeedTemplateBody(title: string): string {
  return pageTitle(title, 1189, 15, 229)
    + panel(20, 60, 1189, 617, 8)
    + `      <span data-hmi-type="HmiEllipse" aria-hidden="true" style={{ position: "absolute", left: 408, top: 339, width: 590, height: 218, borderRadius: "50%", background: "${color("plate")}", transform: "rotate(15deg)" }} />\n`
    + configurableScreen({
      left: 421,
      top: 131,
      width: 559,
      height: 447,
      graphic: "Motor_Speed",
      next: "add-machine-callouts",
      label: "Inserisci lo screen della parte macchina, poi aggiungi targhette motore e linee di richiamo",
    })
    + `      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active" data-hmi-swipe-right="2041_Encoders_Main" data-hmi-swipe-left="2121_RobotFunction" style={{ position: "absolute", left: 8, top: 8, width: 1215, height: 689, pointerEvents: "none" }} />\n`;
}

export function specialFunctionTemplateBody(title: string): string {
  const rows = Array.from({ length: 7 }, (_, index) => {
    const top = 60 + index * 78;
    return panel(20, top, 403, 75, index === 6 ? 8 : 0, ` data-framecraft-slot="special-function-row" data-framecraft-slot-index="${index + 1}" data-framecraft-next="configure-special-function"`);
  }).join("");

  return pageTitle(title, 1192, 16, 251)
    + rows
    + panel(428, 60, 784, 618, 8)
    + `      <span data-hmi-type="HmiEllipse" aria-hidden="true" style={{ position: "absolute", left: 437, top: 248, width: 754, height: 310, borderRadius: "50%", background: "${color("plate")}", transform: "rotate(-20deg)" }} />\n`
    + configurableScreen({
      left: 428,
      top: 135,
      width: 784,
      height: 436,
      graphic: "PBP1 - Main",
      next: "add-machine-zones",
      label: "Inserisci lo screen della macchina, poi aggiungi le zone interattive necessarie",
    })
    + `      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active" data-hmi-swipe-right="1041_Counters" data-hmi-swipe-left="1121_Collector_Counters" style={{ position: "absolute", left: 8, top: 8, width: 1215, height: 689, pointerEvents: "none" }} />\n`;
}
