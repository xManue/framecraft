import { cssColor, pagePalette, typography } from "./hmiStandard";

const color = (value: keyof typeof pagePalette) => cssColor(pagePalette[value]);
const font = JSON.stringify(typography.cssFamily);

function panel(left: number, top: number, width: number, height: number, radius = 0): string {
  return `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}, borderRadius: ${radius}, background: "${color("panel")}" }} />\n`;
}

function heading(left: number, top: number, width: number, text: string): string {
  return `      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: 37, display: "flex", alignItems: "center", color: "${color("title")}", fontFamily: ${font}, fontSize: ${typography.heading.size}, fontWeight: 700 }}>${text}</span>\n`;
}

const commandIcon = (graphic: "Home_SVG" | "Graphic_36") => graphic === "Home_SVG"
  ? `<svg aria-hidden="true" viewBox="0 0 32 32" style={{ width: 38, height: 38, fill: "white", flex: "0 0 auto" }}><path d="M3 15.5 16 4l13 11.5-2.7 3L25 17.3V28h-7v-8h-4v8H7V17.3l-1.3 1.2z"/></svg>`
  : `<svg aria-hidden="true" viewBox="0 0 40 40" style={{ width: 40, height: 40, fill: "none", stroke: "white", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", flex: "0 0 auto" }}><path d="M23 6a9 9 0 0 0-10 12L4 29l7 7 11-9a9 9 0 0 0 12-10l-7 7-7-7z"/><path d="M30 6v5M27.5 8.5h5M32 29v5M29.5 31.5h5"/></svg>`;

function robotCommand(left: number, top: number, text: string, graphic: "Home_SVG" | "Graphic_36"): string {
  return `      <button type="button" data-hmi-type="HmiButton" data-hmi-graphic="${graphic}" data-plc-variable="" data-hmi-action="" data-framecraft-next="configure-command" aria-label="${text}: comando da configurare" style={{ position: "absolute", left: ${left}, top: ${top}, width: 307, height: 82, display: "flex", alignItems: "center", gap: 54, padding: "0 31px", border: "1px solid ${color("commandBorder")}", borderRadius: 4, background: "linear-gradient(180deg, #4B4C50 0%, ${color("command")} 100%)", color: "white", fontFamily: ${font}, fontSize: ${typography.body.size}, cursor: "pointer" }}>${commandIcon(graphic)}<span>${text}</span></button>\n`;
}

export function robotFunctionTemplateBody(): string {
  return panel(0, 0, 769, 37, 4)
    + heading(11, 0, 479, "Robot Function - Illustrative Image")
    + panel(20, 60, 769, 619, 10)
    + `      <div data-hmi-type="HmiGraphicView" data-hmi-graphic="Kuka" data-hmi-graphic-options="Fanuc,Manipolatore,Kuka,IRB_5720_9" data-image-role="detail" data-framecraft-slot="machine-part-screen" data-framecraft-next="choose-robot-graphic" aria-label="Sostituisci con lo screen del robot della macchina" style={{ position: "absolute", left: 36, top: 76, width: 737, height: 587, display: "grid", placeItems: "center", overflow: "hidden", background: "white" }}><svg aria-hidden="true" viewBox="0 0 737 587" style={{ width: "100%", height: "100%" }}><ellipse cx="360" cy="535" rx="205" ry="35" fill="#EEEEEE"/><path d="M282 500h145l-18 51H300z" fill="#333"/><path d="M310 495c-6-91 10-153 60-214l65 31c-30 58-38 112-29 183z" fill="#E36D14" stroke="#9B3D06" strokeWidth="4"/><path d="m360 286 40-124 71 21-37 129z" fill="#EE7A1D" stroke="#9B3D06" strokeWidth="4"/><path d="m400 163 108-71 52 52-90 39z" fill="#E87318" stroke="#9B3D06" strokeWidth="4"/><circle cx="379" cy="296" r="34" fill="#343434"/><circle cx="426" cy="171" r="27" fill="#343434"/><circle cx="518" cy="116" r="24" fill="#343434"/><path d="m554 110 65-8 10 38-69 6z" fill="#E87318" stroke="#9B3D06" strokeWidth="4"/><circle cx="627" cy="121" r="24" fill="#242424"/></svg><span style={{ position: "absolute", left: 16, bottom: 12, color: "${color("textMuted")}", fontSize: 12 }}>Screen robot configurabile · grafiche standard: Fanuc, Manipolatore, Kuka, IRB 5720</span></div>\n`
    + panel(795, 0, 415, 37, 4)
    + heading(801, 0, 259, "Robot 1 Function")
    + panel(795, 60, 415, 142, 8)
    + panel(795, 205, 415, 142, 8)
    + robotCommand(849, 90, "Homing Request", "Home_SVG")
    + robotCommand(849, 235, "Maintenance Position", "Graphic_36")
    + panel(796, 351, 414, 37, 4)
    + heading(802, 351, 258, "Robot 2 Function")
    + panel(796, 391, 414, 142, 8)
    + panel(796, 536, 414, 142, 8)
    + robotCommand(849, 421, "Homing Request", "Home_SVG")
    + robotCommand(849, 566, "Maintenance Position", "Graphic_36")
    + `      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active" data-hmi-swipe-right="2081_Motor_Speed_1" data-hmi-swipe-left="2161_Lubrification" style={{ position: "absolute", left: 8, top: 8, width: 1215, height: 689, pointerEvents: "none" }} />\n`;
}

interface LubricationField {
  left: number;
  top: number;
  width: number;
  height: number;
  variable: string;
  defaultValue: string;
  readOnly?: boolean;
}

function lubricationField(field: LubricationField): string {
  return `      <input data-hmi-type="HmiIOField" data-plc-variable="${field.variable}" defaultValue="${field.defaultValue}"${field.readOnly ? " readOnly" : ""} inputMode="decimal" style={{ position: "absolute", left: ${field.left}, top: ${field.top}, width: ${field.width}, height: ${field.height}, padding: "0 12px", border: "1px solid ${color("borderStrong")}", borderRadius: 4, background: "${field.readOnly ? color("fieldReadOnly") : color("field")}", color: "${color("text")}", fontFamily: ${font}, fontSize: ${typography.body.size}, textAlign: "center" }} />\n`;
}

function lubricationLabel(left: number, top: number, width: number, text: string): string {
  return `      <label style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: 37, display: "flex", alignItems: "center", color: "${color("textMuted")}", fontFamily: ${font}, fontSize: 13 }}>${text}</label>\n`;
}

export function lubricationTemplateBody(): string {
  return panel(20, 20, 368, 37, 5)
    + heading(35, 19, 148, "Lubrication Status")
    + panel(20, 60, 368, 123)
    + lubricationLabel(36, 63, 221, "Actual Lubrification Cycle [Number]")
    + lubricationField({ left: 40, top: 109, width: 323, height: 40, variable: "DB_Lubrication_Cycles_Counter", defaultValue: "0", readOnly: true })
    + panel(20, 187, 368, 123)
    + lubricationLabel(36, 189, 221, "Next Lubrication Cycle In:")
    + lubricationField({ left: 40, top: 234, width: 101, height: 40, variable: "DB_Lubrication_RemainingHours", defaultValue: "116", readOnly: true })
    + lubricationLabel(146, 234, 54, "[Hours]")
    + lubricationField({ left: 214, top: 234, width: 101, height: 40, variable: "DB_Lubrication_RemainingMinutes", defaultValue: "24", readOnly: true })
    + lubricationLabel(318, 234, 65, "[Minutes]")
    + panel(20, 314, 368, 133, 8)
    + `      <button type="button" data-hmi-type="HmiButton" data-hmi-graphic="Graphic_42" data-plc-variable="DB_Lubrication_TEST_Cmd" data-plc-write="set-bit-0-on-down-reset-on-up" data-hmi-event="Down,Up" data-hmi-action="test-lubrication" aria-label="Avvia test lubrificazione finché il comando è premuto" style={{ position: "absolute", left: 60, top: 342, width: 288, height: 68, display: "flex", alignItems: "center", justifyContent: "center", gap: 55, padding: "0 24px", border: "1px solid ${color("commandBorder")}", borderRadius: 4, background: "linear-gradient(180deg, #4B4C50 0%, ${color("command")} 100%)", color: "white", fontFamily: ${font}, fontSize: 15, cursor: "pointer" }}><svg aria-hidden="true" viewBox="0 0 36 36" style={{ width: 35, height: 35, fill: "none", stroke: "white", strokeWidth: 2.5 }}><circle cx="18" cy="18" r="14"/><path d="M18 5c4 4 5 8 2 12-3 4-8 2-11 0M31 20c-5-1-9 1-10 5-1 5 3 7 7 8M10 31c1-5-1-9-5-11"/><circle cx="18" cy="18" r="3" fill="white"/></svg><span>Test Lubrication</span></button>\n`
    + panel(393, 20, 294, 37, 5)
    + heading(410, 20, 148, "Lubrication Setting")
    + panel(393, 60, 294, 102)
    + lubricationLabel(409, 60, 150, "Cycles [Number]")
    + lubricationField({ left: 414, top: 100, width: 252, height: 40, variable: "DB_Lubrication_SET_CyclesNumber", defaultValue: "3" })
    + panel(393, 165, 294, 102)
    + lubricationLabel(409, 165, 187, "Greasing Interval [Hours]")
    + lubricationField({ left: 414, top: 205, width: 252, height: 40, variable: "DB_Lubrication_SET_LubricatInterval_H", defaultValue: "120" })
    + panel(393, 270, 294, 98)
    + lubricationLabel(409, 267, 242, "Timeout For Lubrication Cycle [s]")
    + lubricationField({ left: 414, top: 308, width: 252, height: 45, variable: "DB_Lubrication_Pump_Pulse_Set", defaultValue: "60" })
    + panel(393, 371, 294, 114, 8)
    + lubricationLabel(409, 371, 246, "Pause Beetween Cycles [s]")
    + lubricationField({ left: 414, top: 410, width: 252, height: 45, variable: "DB_Lubrication_Pump_Pause_Set", defaultValue: "30" })
    + panel(692, 20, 516, 37, 5)
    + heading(712, 20, 322, "Illustrative Image")
    + panel(692, 60, 516, 619, 8)
    + `      <div data-hmi-type="HmiGraphicView" data-hmi-graphic="Pump_1" data-image-role="detail" data-framecraft-slot="machine-part-screen" data-framecraft-next="replace-lubrication-screen" aria-label="Sostituisci con lo screen del gruppo di lubrificazione" style={{ position: "absolute", left: 749, top: 162, width: 397, height: 381, display: "grid", placeItems: "center", overflow: "hidden", background: "white" }}><svg aria-hidden="true" viewBox="0 0 397 381" style={{ width: "100%", height: "100%" }}><ellipse cx="198" cy="346" rx="142" ry="23" fill="#EEEEEE"/><path d="M118 73h160l-12 185H130z" fill="#F4F4F4" fillOpacity=".72" stroke="#777" strokeWidth="5"/><path d="M108 55h180v35H108zM124 258h148v68H124z" fill="#242424" stroke="#111" strokeWidth="4"/><path d="M136 108h124v78H136z" fill="#F1F1F1" stroke="#5B87AD" strokeWidth="4"/><path d="M148 120h100v54H148z" fill="#D8EEF4"/><path d="M148 218h100v13H148z" fill="#2A8DCE"/><circle cx="198" cy="292" r="24" fill="#171717" stroke="#555" strokeWidth="4"/></svg><span style={{ position: "absolute", left: 12, bottom: 8, color: "${color("textMuted")}", fontSize: 12 }}>Screen lubrificazione configurabile</span></div>\n`
    + `      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active" data-hmi-swipe-right="2121_RobotFunction" data-hmi-swipe-left="2201_MMC_Guide" style={{ position: "absolute", left: 8, top: 8, width: 1215, height: 689, pointerEvents: "none" }} />\n`;
}
