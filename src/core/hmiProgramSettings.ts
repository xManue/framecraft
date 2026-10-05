import { card, command, field, label, machineImage, radioGroup, rule, selectField, toggle } from "./hmiPrimitives";
import { cssColor, pagePalette, typography } from "./hmiStandard";

export type ProgramSettingsTemplateId =
  | "program-classic-product" | "program-classic-layer" | "program-classic-row" | "program-classic-pallet"
  | "program-classic-line" | "program-classic-delays" | "program-classic-centering"
  | "program-classic-pre-squaring" | "program-classic-post-squaring" | "program-classic-padstore"
  | "program-nemo-product" | "program-nemo-squaring" | "program-nemo-robot"
  | "program-sweep-product" | "program-sweep-line"
  | "program-pouches-product" | "program-pouches-robot" | "program-pouches-tray";

const photo = (name: string) => `FotoStandardManu/Desktop/2000_Settings/${name}`;

export const programSettingsTemplates = [
  ["program-nemo-product", "Programma Nemo - prodotto", "2011_Robot_Program_Modification_1", "0023_Pagina_2011_Robot_Program_Modification_1.png"],
  ["program-nemo-squaring", "Programma Nemo - squadratura", "2012_Robot_Program_Modification_2", "0024_Pagina_2012_Robot_Program_Modification_2.png"],
  ["program-nemo-robot", "Programma Nemo - robot e nastri", "2013_Robot_Program_Modification_3", "0025_Pagina_2013_Robot_Program_Modification_3.png"],
  ["program-classic-product", "Programma Classic - prodotto", "2021_Classic_Program_Modification_1", "0026_Pagina_2021_Classic_Program_Modification_1.png"],
  ["program-sweep-product", "Programma Sweep Off - prodotto", "2021_Robot_Program_Modification_1", "0027_Pagina_2021_Robot_Program_Modification_1.png"],
  ["program-classic-layer", "Programma Classic - composizione fila", "2022_Classic_Program_Modification_2", "0028_Pagina_2022_Classic_Program_Modification_2.png"],
  ["program-sweep-line", "Programma Sweep Off - robot e linea", "2022_Robot_Program_Modification_2", "0029_Pagina_2022_Robot_Program_Modification_2.png"],
  ["program-classic-row", "Programma Classic - tipo fila", "2023_Classic_Program_Modification_3", "0030_Pagina_2023_Classic_Program_Modification_3.png"],
  ["program-classic-pallet", "Programma Classic - pallet", "2024_Classic_Program_Modification_4", "0031_Pagina_2024_Classic_Program_Modification_4.png"],
  ["program-classic-line", "Programma Classic - velocita linea", "2025_Classic_Program_Modification_5", "0032_Pagina_2025_Classic_Program_Modification_5.png"],
  ["program-classic-delays", "Programma Classic - ritardi", "2026_Classic_Program_Modification_6", "0033_Pagina_2026_Classic_Program_Modification_6.png"],
  ["program-classic-centering", "Programma Classic - centratura", "2027_Classic_Program_Modification_7", "0034_Pagina_2027_Classic_Program_Modification_7.png"],
  ["program-classic-pre-squaring", "Programma Classic - pre-squadratura", "2028_Classic_Program_Modification_8", "0035_Pagina_2028_Classic_Program_Modification_8.png"],
  ["program-classic-post-squaring", "Programma Classic - post-squadratura", "2029_Classic_Program_Modification_9", "0036_Pagina_2029_Classic_Program_Modification_9.png"],
  ["program-classic-padstore", "Programma Classic - centratura pad store", "2030_Classic_Program_Modification_10", "0037_Pagina_2030_Classic_Program_Modification_10.png"],
  ["program-pouches-product", "Programma Pouches - prodotto", "2031_Robot_Program_Modification_1", "0038_Pagina_2031_Robot_Program_Modification_1.png"],
  ["program-pouches-robot", "Programma Pouches - robot", "2032_Robot_Program_Modification_2", "0039_Pagina_2032_Robot_Program_Modification_2.png"],
  ["program-pouches-tray", "Programma Pouches - vassoi", "2033_Robot_Program_Modification_3", "0040_Pagina_2033_Robot_Program_Modification_3.png"],
].map(([id, name, sourceScreen, image]) => ({
  id: id as ProgramSettingsTemplateId,
  name,
  description: `Schermata ${sourceScreen}, ricostruita dalle coordinate, dai tag e dagli script del JSON WinCC.`,
  sourceScreen,
  referenceImage: photo(image),
  visualStatus: "verified" as const,
  recommendedSection: "settings",
}));

const panel = cssColor(pagePalette.panel);
const text = cssColor(pagePalette.text);
const muted = cssColor(pagePalette.textMuted);
const separator = cssColor(pagePalette.separator);
const STRIP_TOP = 19;

type StripProfile = "classic" | "robot" | "cans";

function programStrip(profile: StripProfile, showSave = true): string {
  const classic = profile === "classic";
  const robot = profile === "robot";
  const number = classic ? "ProgModN.PV.ProgramN" : robot ? "ProgModR.PV.ProgramN" : "ProgMod_Cans[1].Prog_In_Mod_N";
  const description = classic ? "ProgModN.PV.Prog_In_Mod.Description" : robot ? "ProgModR.PV.Prog_In_Mod.Description" : "ProgMod_Cans[1].Prog_in_Mod.Description";
  const save = classic ? "ProgModN.PV.Save_Program" : "ProgMod_Cans[1].Save_Program";
  return card({ left: 18, top: STRIP_TOP, width: 1190, height: 72 })
    + label(32, 29, "PROGRAM NUMBER", 145)
    + field({ left: 32, top: 55, width: 132, variable: number, value: "000001", readOnly: true })
    + rule(174, 19, 3, 72)
    + label(193, 29, "PROGRAM DESCRIPTION", 340)
    + field({ left: 193, top: 55, width: 850, variable: description, value: "" })
    + (showSave ? command({ left: 1054, top: 27, width: 76, height: 56, text: "", variable: save, write: "set", step: 0, icon: true }) : "")
    + label(1142, 27, "Saving...", 68);
}

function head(left: number, top: number, width: number, title: string): string {
  return `      <div data-hmi-type="HmiTextBox" style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: 36, display: "flex", alignItems: "center", paddingLeft: 15, borderRadius: "5px 5px 0 0", background: "${panel}", color: "${text}", fontSize: ${typography.heading.size} }}>${title}</div>\n`;
}

function plate(left: number, top: number, width: number, height: number): string {
  return `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}, borderRadius: 5, background: "${panel}" }} />\n`;
}

function inputCell(left: number, top: number, width: number, height: number, title: string, tag: string, unit?: string): string {
  return plate(left, top, width, height) + label(left + 14, top + 9, title, width - 28)
    + field({ left: left + 14, top: top + height - 43, width: width - 28, variable: tag, unit });
}

function stepper(left: number, top: number, width: number, title: string, tag: string, step = 10): string {
  return head(left, top, width, title) + plate(left, top + 38, width, 88)
    + command({ left: left + 15, top: top + 65, width: 50, height: 46, text: "-", variable: tag, write: "decrease", step, fontSize: 22 })
    + field({ left: left + 65, top: top + 65, width: width - 130, variable: tag })
    + command({ left: left + width - 65, top: top + 65, width: 50, height: 46, text: "+", variable: tag, write: "increase", step, fontSize: 22 });
}

function productPage(kind: "nemo" | "sweep" | "pouches"): string {
  const isPouches = kind === "pouches";
  const base = "ProgMod_Cans[1].Prog_in_Mod";
  const imageAlt = isPouches ? "Vassoi e pouches" : kind === "sweep" ? "Prodotto e pallet" : "Pallet, bottiglia, cuvetta e pad";
  const rows = isPouches
    ? [
      ["Offset upper squaring front", `${base}.Nemo_Setting.Offset_Upper_Squaring_Front_Pre_Close`],
      ["Offset upper squaring left", `${base}.Nemo_Setting.Offset_Upper_Squaring_Left_Pre_Close`],
      ["Offset upper squaring right", `${base}.Nemo_Setting.Offset_Upper_Squaring_Right_Pre_Close`],
      ["Torque reached time", `${base}.Nemo_Setting.Time_Torque_Value_Reached`],
    ]
    : [
      [kind === "sweep" ? "Cans For Layer" : "Bottle For Layer", kind === "sweep" ? `${base}.General_Setting.Cans_For_Layer` : `${base}.Spare[0]`],
      ["Cuvette Height [mm]", `${base}.General_Setting.Cuvette_Height`],
      ["Pad Height [mm]", `${base}.General_Setting.Pad_Height`],
      [kind === "sweep" ? "Layer Number" : "Layer For Pallet", `${base}.General_Setting.${kind === "sweep" ? "Layer_Number" : "Layer_For_Pallet"}`],
      ["Pallet Height [mm]", `${base}.General_Setting.Pallet_Height`],
    ];
  const right = rows.map(([title, tag], index) => inputCell(760 + (index > 2 ? 235 : 0), 132 + (index % 3) * 110, index > 2 ? 213 : 448, 106, title, tag)).join("");
  return programStrip("cans")
    + head(18, 100, 632, "Product Dimension") + plate(18, 138, 632, 539)
    + machineImage(55, 166, 545, 455, imageAlt)
    + (isPouches ? "" : field({ left: 510, top: 355, width: 96, variable: `${base}.Product_Dimension.Height`, unit: "mm" }))
    + head(670, 100, 538, "General Setting") + plate(670, 138, 538, 539)
    + (isPouches ? "" : selectField(686, 164, ["800x1200", "1000x1200"], `${base}.General_Setting.Pallet_Type`, 185))
    + right
    + (isPouches ? "" : toggle(686, 438, false, `${base}.Pad_On_Top`, "invert"));
}

function classicProduct(): string {
  const root = "ProgModN.PV.Prog_In_Mod";
  return programStrip("classic")
    + head(18, 100, 632, "Case Dimension") + plate(18, 138, 632, 539)
    + machineImage(120, 190, 410, 340, "Scatola quotata")
    + field({ left: 110, top: 360, width: 100, variable: `${root}.Pack_Dimensions.Height_mm`, unit: "mm" })
    + field({ left: 260, top: 524, width: 100, variable: `${root}.Pack_Dimensions.Length_mm`, unit: "mm" })
    + field({ left: 430, top: 498, width: 100, variable: `${root}.Pack_Dimensions.Width_mm`, unit: "mm" })
    + head(670, 100, 538, "General Setting") + plate(670, 138, 538, 539)
    + label(686, 154, "Pallet Type", 200) + selectField(686, 178, ["800x1200", "1000x1200"], `${root}.GeneralSetting.Pallet_Type`, 185)
    + inputCell(670, 246, 538, 108, "Wrapper Program", `${root}.GeneralSetting.Wrapper_Program`)
    + label(686, 374, "Stacker Enable", 190) + toggle(686, 402, false, `${root}.GeneralSetting.Stacker_Enable`, "invert")
    + label(686, 480, "Infeed Product On Machine", 240) + radioGroup(692, 512, ["Short Side", "Long Side"], `${root}.GeneralSetting.Infeed_Machine_Long_Side`)
    + label(686, 594, "Enable Squaring For Layer", 230) + toggle(686, 620, false, `${root}.GeneralSetting.Enable_Layer_Type_Squaring`, "invert")
    + label(980, 594, "Control Pack Open", 200) + selectField(980, 620, ["Disable", "Enable"], `${root}.GeneralSetting.Photocell_Case_Open`, 210);
}

function classicLayer(): string {
  const root = "ProgModN.PV";
  const leftLabels = ["Slowdown Doser", "Stop Next Pack On Doser", "Free Pass", "Rotation", "Splitter 1", "Splitter 2", "Splitter 3", "Centering Pack", "Unlock Splitter", "Row Push"];
  const leftTags = ["Doser.Slow_Speed", "Doser.Stop_Doser", "Free_Pass", "Rotation.Rotation90", "Splitter.Splitter_1", "Splitter.Splitter_2", "Splitter.Splitter_3", "Splitter.Splitter_Centering_Pack", "Splitter.Unlock_Splitter", "Row_Push"];
  const rows = leftLabels.map((title, index) => {
    const top = 105 + index * 58;
    return plate(18, top, 585, 55) + label(32, top + 17, title, 210)
      + toggle(226, top + 7, false, `${root}.DATA_PackInfo.${leftTags[index]}`, "invert")
      + label(344, top + 17, `Spacer ${index + 1}`, 100)
      + toggle(430, top + 7, false, `${root}.DATA_PackInfo.Spacer.Spacer_${index + 1}`, "invert")
      + field({ left: 522, top: top + 10, width: 70, variable: `${root}.Prog_In_Mod.Timer_Spacer[${index + 1}]`, unit: "ms" });
  }).join("");
  const rowTypes = ["A", "B", "C", "D", "E", "F"].map((value, index) => command({ left: 856 + index * 50, top: 106, width: 46, height: 46, text: value, variable: `${root}.RowType`, write: "set", step: index })).join("");
  return programStrip("classic") + rows + plate(612, 105, 596, 55) + label(626, 124, "Row Type", 190) + rowTypes
    + stepper(612, 162, 596, "Pack Nr", `${root}.PackN`, 1)
    + plate(612, 290, 596, 329) + machineImage(650, 316, 520, 270, "Fila di pacchi sul trasportatore")
    + label(626, 636, "Layer Complete Visibility", 170) + toggle(790, 628, true, "PatternDisplay_Layer_Complete_Visibility", "invert")
    + label(890, 636, "Time Last Pack in Position", 190) + field({ left: 1080, top: 627, width: 110, variable: `${root}.DATA_PackInfo.Time_Last_Pack_On_Pusher`, unit: "ms" });
}

function classicRow(): string {
  const root = "ProgModN.PV";
  const types = ["A", "B", "C", "D", "E", "F"].map((value, index) => command({ left: 30 + index * 50, top: 355, width: 46, height: 46, text: value, variable: `${root}.DATA_RowSequenceInfo.RowType`, write: "set", step: index })).join("");
  return programStrip("classic") + head(20, 132, 460, "Layer Type Settings") + plate(20, 170, 460, 370)
    + label(32, 187, "Layer in Modify", 190) + selectField(30, 210, ["- W -", "- X -", "- Y -"], `${root}.LayerType`, 175)
    + label(276, 187, "Row In Layer", 150) + field({ left: 276, top: 210, width: 180, variable: `${root}.DATA_RowNumber` })
    + label(32, 277, "Row In Modify", 170) + field({ left: 30, top: 303, width: 175, variable: `${root}.RowN` })
    + label(32, 332, "Row Type", 150) + types
    + label(32, 418, "Enable Push On Preforming Table", 220) + toggle(164, 414, false, `${root}.DATA_RowSequenceInfo.Enable_Push_On_Preforming_Table`, "invert")
    + label(270, 418, "Last Belt Run Forward When Push", 210) + toggle(404, 414, false, `${root}.Prog_In_Mod.GeneralSetting.Enable_Belt_Running_While_Layer_Push`, "invert")
    + label(32, 478, "Enable Push On Plane", 190) + toggle(164, 474, false, `${root}.Prog_In_Mod.GeneralSetting.Enable_Row_On_Plane`, "invert")
    + label(270, 478, "Enable Discharge Row By Row", 210) + toggle(404, 474, false, `${root}.Prog_In_Mod.GeneralSetting.Enable_Discharge_Row`, "invert")
    + plate(505, 132, 630, 500) + machineImage(530, 158, 580, 450, "Composizione della fila");
}

function classicPallet(): string {
  const root = "ProgModN.PV";
  return programStrip("classic", false) + head(20, 100, 578, "Pallet General Information")
    + inputCell(20, 138, 578, 105, "Total Layers On Pallet", `${root}.Prog_In_Mod.GeneralSetting.Layer_For_Pallet`)
    + label(34, 260, "Slip Sheet On Empty Pallet", 220) + plate(20, 246, 578, 105) + selectField(30, 286, ["NO", "YES"], `${root}.Prog_In_Mod.PalletPad[0]`, 235)
    + head(20, 360, 578, "Pallet Layer Information")
    + inputCell(20, 398, 578, 90, "Layer In Modify", `${root}.LayerN`)
    + label(34, 510, "Layer Type", 170) + plate(20, 490, 578, 90) + selectField(30, 528, ["- W -", "- X -", "- Y -"], `${root}.DATA_LayerType`, 235)
    + label(34, 602, "Tie Sheet Presence On Layer", 240) + plate(20, 582, 578, 90) + selectField(30, 620, ["NO", "YES"], `${root}.DATA_PadOnLayer`, 235)
    + machineImage(720, 180, 430, 430, "Pallet e pila degli strati");
}

function classicLine(): string {
  const root = "ProgModN.PV.Prog_In_Mod";
  const cards = [
    [18, 210, "Pusher", "MotorSpeed[7]"], [350, 245, "Spacer Belt", "MotorSpeed[3]"],
    [540, 240, "Preforming Belt", "MotorSpeed[2]"], [700, 310, "Doser Fast Belt", "MotorSpeed[1]"],
    [880, 270, "Doser Slow Belt", "MotorSpeed[0]"],
  ] as const;
  return programStrip("robot", false) + machineImage(190, 150, 890, 470, "Linea di ingresso con richiami")
    + cards.map(([left, top, title, tag]) => inputCell(left, top, 180, 110, title, `${root}.${tag}`)).join("");
}

function classicDelays(): string {
  const root = "ProgModN.PV.Prog_In_Mod";
  const groups = [
    { left: 18, width: 438, title: "Fast/Slow Belt Delays", tags: [9, 8, 10, "GeneralSetting.Inertia_Doser"], labels: ["Delay Start M2180 After M2190 Start", "Delay Start M2190 After M2200 Start", "Delay Unlock M2190 After Pack With Stop", "Inertia M2190"] },
    { left: 466, width: 220, title: "Splitter Delays", tags: [0, 1, 4, 11], labels: ["Splitter Start Delay Traslation", "Splitter Backward Delay", "Splitter At Upper Position Delay", "Splitter Block Downward Delay"] },
  ];
  const blocks = groups.map((group) => head(group.left, 100, group.width, group.title) + group.labels.map((title, index) => inputCell(group.left, 138 + index * 74, group.width, 71, title, `${root}.${typeof group.tags[index] === "number" ? `TimerPreset[${group.tags[index]}]` : group.tags[index]}`)).join("")).join("");
  const speeds = Array.from({ length: 8 }, (_, index) => inputCell(696 + (index % 2) * 255, 100 + Math.floor(index / 2) * 74, 245, 71, `Infeed ${index + 1} [m/min]`, `${root}.MotorSpeed[${10 + index}]`)).join("");
  return programStrip("robot", false) + blocks + speeds
    + head(18, 450, 438, "Kicker Delays")
    + inputCell(18, 488, 218, 74, "Pack Kicker Forward Delay", `${root}.TimerPreset[5]`)
    + inputCell(238, 488, 218, 74, "Pack Kicker Return Delay", `${root}.TimerPreset[6]`);
}

function centeringPage(padStore = false): string {
  const root = padStore ? "ProgModN.PV.Prog_In_Mod.PadStore_Squaring" : "ProgModN.PV.DATA_SquaringInfo";
  const tags = padStore
    ? ["LayerFrontalDimension", "LayerLateralDimension", "LayerLateralCentering", "LayerFrontalCentering"]
    : ["LayerFrontalCentering", "LayerLateralDimension", "LayerLateralCentering", "LayerFrontalDimension"];
  return programStrip("robot", false) + machineImage(280, 140, 650, 500, padStore ? "Pad store quotato" : "Macchina con quote di centratura")
    + inputCell(500, 105, 190, 90, "Short Side Centering", `${root}.${tags[0]}`, "mm")
    + inputCell(890, 165, 190, 90, "Long Side Dimension", `${root}.${tags[1]}`, "mm")
    + inputCell(110, 415, 190, 90, "Long Side Centering", `${root}.${tags[2]}`, "mm")
    + inputCell(520, 570, 190, 90, "Short Side Dimension", `${root}.${tags[3]}`, "mm");
}

function squaringMatrix(post = false): string {
  const count = post ? 4 : 8;
  const start = post ? 11 : 1;
  const left = post ? 325 : 18;
  const column = 118;
  const labels = post ? ["Layer Bar (mm)", "Front Guide (mm)", "Right Guide [mm]", "Left Guide [mm]"] : ["Layer Bar (mm)", "Front Guide (mm)", "Right Guide [mm]", "Left Guide [mm]", "Plane Open [mm/ms]"];
  const fields = ["PhaseSq_LayerBarOffset", "PhaseSq_FrontGuideOffset", "PhaseSq_RightGuideOffset", "PhaseSq_LeftGuideOffset", "PhaseSq_PlaneOpen"];
  const grid = Array.from({ length: count }, (_, columnIndex) => {
    const phase = start + columnIndex;
    const x = left + 160 + columnIndex * column;
    return head(x, post ? 172 : 105, column, `PreSquaring ${columnIndex + 1}`)
      + labels.map((_, rowIndex) => field({ left: x + 13, top: (post ? 226 : 185) + rowIndex * 57, width: 90, variable: `ProgModN.PV.DATA_SquaringInfo.${fields[rowIndex]}[${phase}]` })).join("")
      + toggle(x + 16, (post ? 448 : 474), false, `ProgModN.PV.DATA_SquaringInfo.PhaseEnable[${phase}]`, "invert");
  }).join("");
  return programStrip("robot", false) + plate(left, post ? 172 : 105, 160 + count * column, post ? 325 : 380)
    + labels.map((title, index) => label(left + 14, (post ? 235 : 195) + index * 57, title, 145)).join("") + grid;
}

function nemoSquaring(): string {
  const root = "ProgMod_Cans[1].Prog_in_Mod.Nemo_Setting";
  const upper = ["Front", "Rear", "Right", "Left"].map((side, index) => inputCell(330, 118 + index * 74, 220, 71, `Offset Close Position - ${side}`, `${root}.Offset_Position_Timer_Close_Upper_${side}_Guide`)).join("");
  const lower = ["Front", "Rear", "Right", "Left"].map((side, index) => inputCell(990, 118 + index * 74, 218, 71, `Timer Close Position - ${side}`, `${root}.Timer_Close_Lower_${side}_Squaring`)).join("");
  return programStrip("cans") + head(18, 100, 300, "Machine Mode") + plate(18, 138, 300, 500)
    + label(34, 160, "Squaring Interchange", 190) + toggle(224, 150, false, `${root}.Enable_Interchange`, "invert")
    + inputCell(18, 205, 300, 95, "Offset Lifter Interchange [mm]", `${root}.Distance_Ok_Interchange`)
    + label(34, 320, "Search Level Each Layer", 190) + toggle(224, 310, false, `${root}.Research_Level_Always_Active`, "invert")
    + inputCell(18, 365, 300, 95, "Offset for Level ok [mm]", `${root}.Offset_For_Levelling_OK_Lower_Squaring`)
    + label(34, 585, "Squaring Removing Cuvette", 200) + toggle(224, 575, false, `${root}.Enable_Squaring_Couvette`, "invert")
    + head(330, 100, 220, "Upper Squaring") + upper + head(660, 100, 280, "Moving Plate")
    + inputCell(660, 138, 280, 95, "Offset Position", `${root}.Offset_Position_Moving_Plate`)
    + machineImage(560, 220, 430, 390, "Gruppo di squadratura") + head(990, 100, 218, "Lower Squaring") + lower;
}

function robotAndBelts(kind: "nemo" | "sweep" | "pouches-robot" | "pouches-tray"): string {
  const root = "ProgMod_Cans[1].Prog_in_Mod";
  const pouches = kind.startsWith("pouches");
  const sweep = kind === "sweep";
  if (sweep) {
    const geometry = [
      ["Layer Created Position", `${root}.Layer_Bar.Layer_Created_Position`],
      ["Layer Position For Picking", `${root}.Layer_Bar.Layer_Position_For_Picking`],
      ["Out Of Ingumbrance For Picking", `${root}.Layer_Bar.Out Of Ingumbrance For Picking`],
      ["Robot Product Offset", `${root}.Spare[4]`],
    ];
    const motors = [[0, "High_Speed"], [0, "Medium_Speed"], [0, "Low_Speed"], [1, "High_Speed"], [1, "Medium_Speed"], [1, "Low_Speed"], [10, "Low_Speed"], [10, "Medium_Speed"], [13, "Low_Speed"], [13, "Medium_Speed"]] as const;
    return programStrip("cans")
      + stepper(18, 104, 260, "Robot Product", `${root}.Spare[3]`, 10)
      + geometry.map(([title, tag], index) => inputCell(18, 240 + index * 72, 290, 69, title, tag)).join("")
      + machineImage(320, 130, 560, 520, "Robot e linea di ingresso")
      + motors.map(([motor, speed], index) => inputCell(890 + (index % 2) * 158, 105 + Math.floor(index / 2) * 104, 150, 98, `Motor ${motor} ${speed.replace("_", " ")}`, `${root}.Motor_Speed[${motor}].${speed}`)).join("");
  }
  if (kind === "pouches-robot") {
    const motors = [[16, "High_Speed"], [16, "Low_Speed"], [17, "High_Speed"], [19, "High_Speed"], [19, "Medium_Speed"], [19, "Low_Speed"], [20, "High_Speed"], [20, "Medium_Speed"], [20, "Low_Speed"]] as const;
    return programStrip("cans")
      + stepper(18, 104, 260, "Robot Trays", `${root}.Timer[20]`, 10)
      + machineImage(285, 130, 610, 520, "Robot vassoi")
      + motors.map(([motor, speed], index) => inputCell(900 + (index % 2) * 150, 104 + Math.floor(index / 2) * 104, 142, 98, `Motor ${motor} ${speed.replace("_", " ")}`, `${root}.Motor_Speed[${motor}].${speed}`)).join("");
  }
  const leftTag = pouches ? `${root}.Timer[0]` : `${root}.Spare[1]`;
  const left = stepper(18, 104, 260, pouches ? "Robot Trays" : sweep ? "Robot Product" : "Robot", leftTag, 10)
    + [0, 1, 2, 3].map((index) => inputCell(18, 240 + index * 72, 260, 69, ["Pick Offset X", "Place Offset X", "Pick Offset Y", "Place Offset Y"][index], pouches ? `${root}.Timer[${index + 1}]` : `${root}.Nemo_Setting.${["Offset_Open_Squaring_Before_Drawer_Discharge_Position", "Offset_Stop_Discharge_Conveyor_Before_Drawer_In_Discharge_Position", "Drawer_Offset_Slowdon_Start_From_Pallet", "Drawer_Offset_Slowdonw_Start_From_Table"][index]}`)).join("");
  const center = machineImage(285, 130, 610, 520, pouches ? "Robot vassoi" : "Robot e nastri")
  const tags = pouches ? [7, 8, 9, 10, 11] : [1, 2];
  const right = tags.map((tag, index) => inputCell(900 + (index % 2) * 150, 110 + Math.floor(index / 2) * 90, 142, 86, pouches ? ["Tray Pick Delay", "Tray Deposit Delay", "Layer Blow Time", "Approach Pick", "Approach Deposit"][index] : `Belt ${index + 1} speed`, `${root}.${pouches ? `Timer[${tag}]` : `Motor_Speed[${tag}].${index % 3 === 0 ? "High_Speed" : index % 3 === 1 ? "Medium_Speed" : "Low_Speed"}`}`)).join("");
  return programStrip("cans") + left + center + right;
}

export function programSettingsTemplateBody(id: ProgramSettingsTemplateId): string {
  switch (id) {
    case "program-classic-product": return classicProduct();
    case "program-classic-layer": return classicLayer();
    case "program-classic-row": return classicRow();
    case "program-classic-pallet": return classicPallet();
    case "program-classic-line": return classicLine();
    case "program-classic-delays": return classicDelays();
    case "program-classic-centering": return centeringPage();
    case "program-classic-pre-squaring": return squaringMatrix();
    case "program-classic-post-squaring": return squaringMatrix(true);
    case "program-classic-padstore": return centeringPage(true);
    case "program-nemo-product": return productPage("nemo");
    case "program-nemo-squaring": return nemoSquaring();
    case "program-nemo-robot": return robotAndBelts("nemo");
    case "program-sweep-product": return productPage("sweep");
    case "program-sweep-line": return robotAndBelts("sweep");
    case "program-pouches-product": return productPage("pouches");
    case "program-pouches-robot": return robotAndBelts("pouches-robot");
    case "program-pouches-tray": return robotAndBelts("pouches-tray");
  }
}

export function isProgramSettingsTemplate(id: string): id is ProgramSettingsTemplateId {
  return programSettingsTemplates.some((template) => template.id === id);
}
