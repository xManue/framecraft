import { cssColor, pagePalette, typography } from "./hmiStandard";

const color = (value: keyof typeof pagePalette) => cssColor(pagePalette[value]);
const font = JSON.stringify(typography.cssFamily);

const guideMotorButtons = [
  { left: 142, top: 376, value: 1 }, { left: 277, top: 376, value: 2 },
  { left: 412, top: 376, value: 3 }, { left: 547, top: 376, value: 4 },
  { left: 681, top: 376, value: 5 }, { left: 816, top: 376, value: 6 },
  { left: 951, top: 376, value: 7 }, { left: 142, top: 602, value: 8 },
  { left: 277, top: 602, value: 9 }, { left: 412, top: 602, value: 10 },
  { left: 547, top: 602, value: 11 }, { left: 681, top: 602, value: 12 },
  { left: 816, top: 602, value: 13 }, { left: 951, top: 602, value: 14 },
] as const;

const motorBoxSlots = [
  { left: 451, top: 263, value: 7 }, { left: 604, top: 263, value: 5 },
  { left: 757, top: 263, value: 3 }, { left: 910, top: 263, value: 1 },
  { left: 451, top: 479, value: 8 }, { left: 604, top: 479, value: 6 },
  { left: 757, top: 479, value: 4 }, { left: 910, top: 479, value: 2 },
] as const;

const navIcon = (selection: number) => selection === 0
  ? `<svg aria-hidden="true" viewBox="0 0 32 32" style={{ width: 31, height: 31, fill: "white" }}><path d="M3 15.5 16 4l13 11.5-2.7 3L25 17.3V28h-7v-8h-4v8H7V17.3l-1.3 1.2z"/></svg>`
  : `<svg aria-hidden="true" viewBox="0 0 32 32" style={{ width: 31, height: 31, fill: "none", stroke: "white", strokeWidth: 4, strokeLinecap: "round", strokeLinejoin: "round" }}><path d="${selection === 1 ? "M20 6 10 16l10 10" : "m12 6 10 10-10 10"}"/></svg>`;

function titleBar(): string {
  return `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 0, top: 0, width: 1189, height: 37, borderRadius: "4px 4px 0 0", background: "${color("panel")}" }} />
      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: 15, top: 0, width: 229, height: 37, display: "flex", alignItems: "center", color: "${color("title")}", fontSize: ${typography.heading.size} }}>Infeed Guide</span>
`;
}

function navigationButton(left: number, graphic: string, action: string, selection: number, label: string): string {
  return `      <button type="button" data-hmi-type="HmiButton" data-hmi-graphic="${graphic}" data-hmi-event="Down" data-hmi-action="${action}" data-hmi-selection-value="${selection}" aria-label="${label}" style={{ position: "absolute", left: ${left}, top: 62, width: 53, height: 53, display: "grid", placeItems: "center", padding: 0, border: "1px solid ${color("commandBorder")}", borderRadius: 4, background: "${color("command")}", cursor: "pointer" }}>${navIcon(selection)}</button>
`;
}

function stateCell(left: number, top: number, width: number, height: number, label: string, variable: string): string {
  return `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}, background: "${color("panel")}" }} />
      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: ${left + 28}, top: ${top + 11}, width: ${width - 91}, height: ${height - 22}, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: 17, fontWeight: 700 }}>${label}</span>
      <span data-hmi-type="HmiButton" data-hmi-graphic="Yes" data-plc-variable="${variable}" data-hmi-dynamic-property="Graphic" aria-label="Stato ${label}" style={{ position: "absolute", left: ${left + width - 54}, top: ${top + Math.round((height - 37) / 2)}, width: 37, height: 37, display: "grid", placeItems: "center", borderRadius: "50%", background: "${color("statusBad")}", color: "white", fontSize: 22, fontWeight: 700 }}>!</span>
`;
}

function guideGraphic(top: number, firstMotor: number): string {
  const motors = Array.from({ length: 7 }, (_, index) => {
    const left = 126 + index * 135;
    return `<span aria-hidden="true" style={{ position: "absolute", left: ${left}, top: 33, width: 10, height: 60, border: "2px solid #424242", borderRadius: "1px 1px 3px 3px", background: "linear-gradient(90deg,#505050,#222)" }}><span style={{ position: "absolute", left: 3, top: -29, width: 2, height: 29, background: "#565656" }} /></span>`;
  }).join("");
  return `      <div data-hmi-type="HmiGraphicView" data-hmi-graphic="Guide" data-framecraft-slot="machine-part-screen" data-framecraft-slot-index="${firstMotor === 1 ? 1 : 2}" data-framecraft-next="configure-guide-motor-hotspots" aria-label="Screen guida motori ${firstMotor}-${firstMotor + 6}: sostituisci con la parte macchina reale" style={{ position: "absolute", left: 60, top: ${top}, width: 1095, height: 120, overflow: "hidden", border: "1px solid #F0F0F0", background: "white" }}><span aria-hidden="true" style={{ position: "absolute", left: 16, top: 11, width: 1060, height: 8, border: "2px solid #424242", transform: "skewX(35deg)", background: "#A6A6A6" }} />${motors}<span style={{ position: "absolute", right: 12, bottom: 6, color: "${color("textMuted")}", fontSize: 11 }}>Screen configurabile · motori ${firstMotor}-${firstMotor + 6}</span></div>
`;
}

export function guideControlTemplateBody(): string {
  const states = [
    [20, "Ready", "MMC_Guide.Status.Ready"], [258, "Active", "MMC_Guide.Status.Active"],
    [497, "Homed", "MMC_Guide.Status.HomingOK"], [736, "Positioned", "MMC_Guide.Status.PositioningOK"],
    [975, "Running", "MMC_Guide.Status.Running"],
  ] as const;
  const motorButtons = guideMotorButtons.map(({ left, top, value }) => `      <button type="button" data-hmi-type="HmiButton" data-plc-variable="MMC_HMI_Selection_Guide_Motor" data-plc-value="${value}" data-hmi-visible-tag="MMC_HMI_Guide_Motors_${value}.Box" data-hmi-event="Down" data-hmi-action="select-guide-motor" aria-label="Seleziona motore guida ${value}" style={{ position: "absolute", left: ${left}, top: ${top}, width: 134, height: 61, border: 0, background: "transparent", color: "transparent", cursor: "pointer" }}>Motore ${value}</button>
`).join("");

  return titleBar()
    + `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 62, width: 590, height: 53, background: "${color("panel")}" }} />
${navigationButton(20, "Home_SVG", "select-mmc-guide", 0, "Prima guida")}${navigationButton(75, "WizardBack", "select-mmc-guide", 1, "Guida precedente")}      <output data-hmi-type="HmiTextBox" style={{ position: "absolute", left: 254, top: 62, width: 82, height: 53, display: "grid", placeItems: "center", color: "${color("text")}", fontSize: ${typography.body.size} }}>Text1</output>
${navigationButton(557, "WizardNext", "select-mmc-guide", 2, "Guida successiva")}      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 615, top: 62, width: 594, height: 53, background: "${color("panel")}" }} />
      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: 859, top: 62, width: 182, height: 53, display: "grid", placeItems: "center", color: "${color("text")}", fontSize: 17, fontWeight: 700 }}>CONFIGURED</span>
      <button type="button" role="switch" aria-label="Abilita guida" aria-checked="true" data-hmi-type="HmiButton" data-plc-variable="MMC_Guide.InUse" data-plc-write="invert-bit-0" data-hmi-event="Down" data-hmi-action="toggle-guide-enabled" style={{ position: "absolute", left: 1113, top: 68, width: 86, height: 39, padding: "0 10px", border: 0, borderRadius: 20, background: "${color("on")}", color: "white", fontFamily: ${font}, fontSize: 14, fontWeight: 700, textAlign: "left", cursor: "pointer" }}>ON<span aria-hidden="true" style={{ position: "absolute", right: 6, top: 5, width: 29, height: 29, borderRadius: "50%", background: "white" }} /></button>
${states.map(([left, label, variable]) => stateCell(left, 120, 234, 60, label, variable)).join("")}      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 185, width: 394, height: 60, background: "${color("panel")}" }} />
      <label style={{ position: "absolute", left: 60, top: 196, width: 170, height: 37, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: ${typography.body.size}, fontWeight: 700 }}>TARGET [mm]</label><input data-hmi-type="HmiIOField" data-plc-variable="MMC_Guide.Command.TargetPosition" defaultValue="0" inputMode="decimal" style={{ position: "absolute", left: 236, top: 198, width: 132, height: 33, padding: "0 10px", border: "1px solid ${color("borderStrong")}", borderRadius: 4, background: "${color("field")}", color: "${color("text")}", fontFamily: ${font}, fontSize: ${typography.body.size} }} />
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 420, top: 185, width: 390, height: 60, background: "${color("panel")}" }} /><span style={{ position: "absolute", left: 458, top: 196, width: 82, height: 37, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: ${typography.body.size}, fontWeight: 700 }}>STATUS :</span><output style={{ position: "absolute", left: 540, top: 196, width: 229, height: 37, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: ${typography.body.size} }}>OK</output>
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 815, top: 185, width: 394, height: 60, background: "${color("panel")}" }} /><span style={{ position: "absolute", left: 836, top: 196, width: 206, height: 37, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: ${typography.body.size}, fontWeight: 700 }}>MOTOR BOX ALARM CODE:</span><output data-hmi-type="HmiTextBox" data-plc-variable="MMC_Guide.Status.AlarmCode" style={{ position: "absolute", left: 1042, top: 196, width: 167, height: 37, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: ${typography.body.size} }}>NONE</output>
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 250, width: 1189, height: 428, borderRadius: "0 0 10px 10px", background: "${color("panel")}" }} />
${guideGraphic(261, 1)}${guideGraphic(477, 8)}${motorButtons}      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active" data-hmi-swipe-right="2161_Lubrification" data-hmi-swipe-left="2241_SystemFunction" data-hmi-swipe-up="2202_MMC_Motor_Box" style={{ position: "absolute", left: 8, top: 2, width: 1215, height: 695, pointerEvents: "none" }} />
`;
}

export function motorBoxControlTemplateBody(): string {
  const slots = motorBoxSlots.map(({ left, top, value }) => `      <button type="button" data-hmi-type="HmiButton" data-plc-variable="MMC_HMI_Selection_Motor" data-plc-value="${value}" data-hmi-event="Down" data-hmi-action="select-mmc-motor" data-hmi-target-screen="2203_MMC_Motor" aria-label="Apri motore ${value}" onDoubleClick={() => openPage("/settings/infeed-guide/motor")} style={{ position: "absolute", left: ${left}, top: ${top}, width: 130, height: 143, border: "2px solid #D4D236", borderRadius: 4, background: "rgba(255,255,255,.08)", cursor: "pointer" }} />
`).join("");
  return titleBar()
    + `      <button type="button" data-hmi-type="HmiButton" data-plc-variable="MMC_HMI_Selection_SerialPort" data-hmi-event="Down" data-hmi-action="select-mmc-port" style={{ position: "absolute", left: 20, top: 62, width: 593, height: 53, border: "1px solid ${color("commandBorder")}", borderRadius: 4, background: "${color("command")}", color: "white", fontFamily: ${font}, fontSize: ${typography.body.size}, cursor: "pointer" }}>SERIAL-PORT P1</button>
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 620, top: 62, width: 589, height: 53, background: "${color("panel")}" }} />
${navigationButton(620, "Home_SVG", "select-mmc-box", 0, "Primo motor box")}${navigationButton(678, "WizardBack", "select-mmc-box", 1, "Motor box precedente")}${navigationButton(1156, "WizardNext", "select-mmc-box", 2, "Motor box successivo")}      <span style={{ position: "absolute", left: 844, top: 70, width: 229, height: 37, display: "grid", placeItems: "center", color: "${color("text")}", fontSize: ${typography.body.size} }}>Text11</span>
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 121, width: 435, height: 60, background: "${color("panel")}" }} /><span style={{ position: "absolute", left: 49, top: 132, width: 110, height: 37, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: ${typography.body.size} }}>Firmware Rev.</span><output style={{ position: "absolute", left: 168, top: 132, width: 229, height: 37, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: ${typography.body.size} }}>Text250</output>
${stateCell(461, 121, 245, 60, "Network Status", "MMC_HMI_MotorBox_CommunicationSts")}${stateCell(712, 121, 245, 60, "24V Fuse Status", "MMC_HMI_MotorBox_Status_Fuse")}${stateCell(964, 121, 245, 60, "24V Supply Status", "MMC_HMI_MotorBox_Status_Supply")}      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 188, width: 1189, height: 490, borderRadius: "0 0 10px 10px", background: "${color("panel")}" }} />
      <img data-hmi-type="HmiGraphicView" data-hmi-graphic="Ciabatta Infeed Guide" data-framecraft-slot="machine-part-screen" data-framecraft-next="configure-motor-box-hotspots" src="/placeholder.svg" alt="Sostituisci con lo screen del motor box della macchina" style={{ position: "absolute", left: 56, top: 232, width: 1095, height: 419, objectFit: "contain" }} />
${slots}      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active" data-hmi-swipe-right="2161_Lubrification" data-hmi-swipe-left="2241_SystemFunction" data-hmi-swipe-down="2201_MMC_Guide" data-hmi-swipe-up="2203_MMC_Motor" style={{ position: "absolute", left: 8, top: 8, width: 1215, height: 689, pointerEvents: "none" }} />
`;
}

const motorStates = [
  { left: 619, top: 120, label: "Ready", variable: "MMC_HMI_Motor.Ready" },
  { left: 917, top: 120, label: "Running Forward", variable: "MMC_HMI_Motor.Status.RunningForward" },
  { left: 619, top: 198, label: "Error", variable: "MMC_HMI_Motor.Status.Error" },
  { left: 917, top: 198, label: "Running Backward", variable: "MMC_HMI_Motor.Status.RunningBackward" },
  { left: 619, top: 276, label: "Homing OK", variable: "MMC_HMI_Motor.Status.HomingOK" },
  { left: 917, top: 276, label: "Positioning Ok", variable: "MMC_HMI_Motor.Status.PositioningOK" },
  { left: 619, top: 354, label: "Running Slow", variable: "MMC_HMI_Motor.Status.RunningSlow" },
  { left: 917, top: 354, label: "Spare", variable: "MMC_HMI_Motor.Status.Spare_1" },
] as const;

function motorField(left: number, top: number, label: string, variable: string, kind: "input" | "select" = "input"): string {
  const defaultValue = label.includes("Fwd") ? "500 mA" : label.includes("Bwd") ? "650 mA" : label === "Mode" ? "JOGGING" : "0";
  const controlTop = top + (label.includes("Bwd") ? 16 : 15);
  const control = kind === "select"
    ? `<select data-hmi-type="HmiSymbolicIOField" data-plc-variable="${variable}" defaultValue="${defaultValue}" style={{ position: "absolute", left: ${left + 200}, top: ${controlTop}, width: 187, height: 33, padding: "0 10px", border: "1px solid ${color("borderStrong")}", borderRadius: 4, background: "${color("fieldReadOnly")}", color: "${color("text")}", fontFamily: ${font}, fontSize: 14 }}><option>${defaultValue}</option></select>`
    : `<input data-hmi-type="HmiIOField" data-plc-variable="${variable}" defaultValue="${defaultValue}" style={{ position: "absolute", left: ${left + 200}, top: ${controlTop}, width: 187, height: 33, padding: "0 10px", border: "1px solid ${color("borderStrong")}", borderRadius: 4, background: "${label === "Mode" || label.startsWith("Target") ? color("fieldReadOnly") : color("field")}", color: "${color("text")}", fontFamily: ${font}, fontSize: 14 }} />`;
  return `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: ${left}, top: ${top}, width: 394, height: 60, background: "${color("panel")}" }} /><label style={{ position: "absolute", left: ${left + 13}, top: ${top + 16}, width: 181, height: 24, display: "flex", alignItems: "center", color: "${color("textMuted")}", fontSize: 12 }}>${label}</label>${control}
`;
}

export function motorControlTemplateBody(): string {
  return titleBar()
    + `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 62, width: 1189, height: 53, background: "${color("panel")}" }} />
${navigationButton(19, "Home_SVG", "select-mmc-motor-page", 0, "Primo motore")}${navigationButton(76, "WizardBack", "select-mmc-motor-page", 1, "Motore precedente")}      <output style={{ position: "absolute", left: 500, top: 70, width: 229, height: 37, display: "grid", placeItems: "center", color: "${color("text")}", fontSize: ${typography.body.size} }}>Text111</output>
${navigationButton(1157, "WizardNext", "select-mmc-motor-page", 2, "Motore successivo")}      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 120, width: 591, height: 432, background: "${color("panel")}" }} />
      <div data-hmi-type="HmiGraphicView" data-hmi-graphic="Motor Guide" data-framecraft-slot="machine-part-screen" data-framecraft-next="replace-motor-screen" aria-label="Sostituisci con lo screen del motore della macchina" style={{ position: "absolute", left: 37, top: 166, width: 542, height: 362, display: "grid", placeItems: "center", overflow: "hidden", background: "white" }}><svg aria-hidden="true" viewBox="0 0 542 362" style={{ width: "100%", height: "100%" }}><path d="M90 92h218l36 36h94v52h-94l-36 95H90a28 28 0 0 1-28-28V120a28 28 0 0 1 28-28Z" fill="#3D3D3D" stroke="#202020" strokeWidth="3"/><path d="M344 128h94v52h-94z" fill="#C9C9C9" stroke="#555"/><path d="M438 143h88v22h-88" fill="#E0E0E0" stroke="#555"/><path d="M101 275v99" stroke="#343434" strokeWidth="9"/><circle cx="245" cy="99" r="13" fill="white" stroke="#333" strokeWidth="5"/><circle cx="245" cy="257" r="13" fill="white" stroke="#333" strokeWidth="5"/></svg><span style={{ position: "absolute", left: 12, bottom: 8, color: "${color("textMuted")}", fontSize: 11 }}>Screen motore configurabile</span></div>
${motorStates.map((state) => stateCell(state.left, state.top, 292, 72, state.label, state.variable)).join("")}      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 618, top: 432, width: 591, height: 55, background: "${color("panel")}" }} /><span style={{ position: "absolute", left: 657, top: 440, width: 82, height: 37, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: ${typography.body.size} }}>STATUS :</span><output data-hmi-type="HmiTextBox" data-plc-variable="MMC_Guide.Status.AlarmCode" style={{ position: "absolute", left: 739, top: 440, width: 229, height: 37, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: ${typography.body.size} }}>OK</output>
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 618, top: 492, width: 293, height: 60, background: "${color("panel")}" }} /><span style={{ position: "absolute", left: 665, top: 498, width: 156, height: 48, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: 17, fontWeight: 700 }}>Stop</span><span data-hmi-type="HmiButton" data-hmi-graphic="On" data-plc-variable="MMC_HMI_Motor.Command.Stop" data-hmi-dynamic-property="Graphic" aria-label="Stato stop" style={{ position: "absolute", left: 821, top: 498, width: 41, height: 48, display: "grid", placeItems: "center", borderRadius: "50%", color: "white", background: "#55CCAE", fontSize: 22 }}>↕</span>
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 917, top: 492, width: 293, height: 60, background: "${color("panel")}" }} /><span style={{ position: "absolute", left: 964, top: 498, width: 156, height: 48, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: 17, fontWeight: 700 }}>Reset</span><span data-hmi-type="HmiButton" data-hmi-graphic="On" data-plc-variable="MMC_HMI_Motor.Command.Reset" data-hmi-dynamic-property="Graphic" aria-label="Stato reset" style={{ position: "absolute", left: 1121, top: 498, width: 41, height: 48, display: "grid", placeItems: "center", borderRadius: "50%", color: "white", background: "${color("statusBad")}", fontSize: 18 }}>ⓘ</span>
${motorField(20, 552, "Guide NR.", "MMC_HMI_Motor.Guide")}${motorField(419, 552, "Offset [mm]", "MMC_HMI_Motor.Offset")}${motorField(818, 552, "Current Limit Fwd [mA]", "MMC_HMI_Motor.Command.CurrentLimitFwd", "select")}${motorField(20, 617, "Mode", "MMC_HMI_Motor.Command.Mode")}${motorField(419, 617, "Target [mm]", "MMC_HMI_Motor.Command.TargetPosition")}${motorField(818, 617, "Current Limit Bwd [mA]", "MMC_HMI_Motor.Command.CurrentLimitBwd", "select")}      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active" data-hmi-swipe-right="2161_Lubrification" data-hmi-swipe-left="2241_SystemFunction" data-hmi-swipe-down="2202_MMC_Motor_Box" style={{ position: "absolute", left: 8, top: 8, width: 1215, height: 689, pointerEvents: "none" }} />
`;
}
