import { cssColor, pagePalette, typography } from "./hmiStandard";

const color = (value: keyof typeof pagePalette) => cssColor(pagePalette[value]);
const font = JSON.stringify(typography.cssFamily);

const languages = [
  { label: "English US", locale: "en-US", code: 1033, left: 20, textLeft: 32, buttonLeft: 155, flagLeft: 43, graphic: "Graphic_86", flag: "repeating-linear-gradient(0deg, #B22234 0 25px, white 25px 50px)" },
  { label: "Italian", locale: "it-IT", code: 1040, left: 259, textLeft: 271, buttonLeft: 394, flagLeft: 282, graphic: "Graphic_85", flag: "linear-gradient(90deg, #009246 0 33.333%, white 33.333% 66.666%, #CE2B37 66.666%)" },
  { label: "German", locale: "de-DE", code: 1031, left: 498, textLeft: 510, buttonLeft: 633, flagLeft: 521, graphic: "Germany", flag: "linear-gradient(#000 0 33.333%, #DD0000 33.333% 66.666%, #FFCE00 66.666%)" },
  { label: "French", locale: "fr-FR", code: 1036, left: 737, textLeft: 749, buttonLeft: 872, flagLeft: 760, graphic: "Graphic_88", flag: "linear-gradient(90deg, #0055A4 0 33.333%, white 33.333% 66.666%, #EF4135 66.666%)" },
  { label: "Spanish", locale: "es-ES", code: 3082, left: 977, textLeft: 988, buttonLeft: 1111, flagLeft: 1000, graphic: "Graphic_89", flag: "linear-gradient(#AA151B 0 25%, #F1BF00 25% 75%, #AA151B 75%)" },
] as const;

function languageCard(item: typeof languages[number]): string {
  const { label, locale, code, left, textLeft, buttonLeft, flagLeft, graphic, flag } = item;
  return `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: ${left}, top: 60, width: 232, height: 96, borderRadius: "0 0 10px 10px", background: "${color("panel")}" }} />
      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: ${textLeft}, top: 89, width: 110, height: 37, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: ${typography.body.size} }}>${label}</span>
      <button type="button" role="switch" aria-label="Imposta lingua ${label}" aria-checked={currentLanguage === ${code}} data-hmi-type="HmiButton" data-plc-variable="@CurrentLanguage" data-hmi-event="Down" data-hmi-action="set-language" data-hmi-language-code="${code}" data-hmi-language="${locale}" onClick={() => { setCurrentLanguage(${code}); window.dispatchEvent(new CustomEvent("framecraft:set-language", { detail: "${locale}" })); }} style={{ position: "absolute", left: ${buttonLeft}, top: 85, width: 80, height: 45, padding: "0 9px", border: 0, borderRadius: 23, background: currentLanguage === ${code} ? "${color("on")}" : "${color("off")}", color: "white", fontFamily: ${font}, fontSize: ${typography.body.size}, fontWeight: 700, textAlign: currentLanguage === ${code} ? "left" : "right", cursor: "pointer" }}>{currentLanguage === ${code} ? "ON" : "OFF"}</button>
      <span aria-hidden="true" style={{ position: "absolute", left: currentLanguage === ${code} ? ${buttonLeft + 45} : ${buttonLeft + 4}, top: 89, width: 37, height: 37, borderRadius: "50%", background: "white", pointerEvents: "none" }} />
      <div data-hmi-type="HmiRectangle" aria-hidden="true" style={{ position: "absolute", left: ${flagLeft}, top: 152, width: 205, height: 323, border: "1px solid ${color("borderStrong")}", background: "rgba(255,255,255,.2)" }} />
      <div data-hmi-type="HmiGraphicView" data-hmi-graphic="${graphic}" role="img" aria-label="Bandiera ${label}" style={{ position: "absolute", left: ${flagLeft + 5}, top: 162, width: 195, height: 303, border: "1px solid rgba(0,0,0,.08)", background: "${flag}" }} />
`;
}

function icon(kind: "shutdown" | "layout" | "control" | "logout"): string {
  if (kind === "shutdown") return '<svg aria-hidden="true" viewBox="0 0 32 32" style={{ width: 40, height: 40 }}><path d="M16 3v12M8.2 7.5a12 12 0 1 0 15.6 0" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" /></svg>';
  if (kind === "layout") return '<svg aria-hidden="true" viewBox="0 0 32 32" style={{ width: 40, height: 40 }}><rect x="3" y="4" width="24" height="22" rx="2" fill="none" stroke="white" strokeWidth="2.5"/><path d="M3 10h24M10 10v16M20 19l7-7M22 12h5v5" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>';
  if (kind === "control") return '<svg aria-hidden="true" viewBox="0 0 32 32" style={{ width: 40, height: 40 }}><circle cx="16" cy="16" r="6" fill="none" stroke="white" strokeWidth="3"/><path d="M16 2v5M16 25v5M2 16h5M25 16h5M6.1 6.1l3.5 3.5M22.4 22.4l3.5 3.5M25.9 6.1l-3.5 3.5M9.6 22.4l-3.5 3.5" stroke="white" strokeWidth="3" strokeLinecap="round"/></svg>';
  return '<svg aria-hidden="true" viewBox="0 0 32 32" style={{ width: 40, height: 40 }}><path d="M4 16h15M16 11l5 5-5 5M20 8h8v16h-8" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>';
}

interface MainButton {
  left: number;
  text: string;
  graphic: string;
  action: string;
  event: "Down" | "Up";
  background: string;
  authorization: "CLV" | "None";
  icon: "shutdown" | "layout" | "control" | "logout";
  attributes?: string;
}

function mainButton(item: MainButton): string {
  const border = item.left === 53 ? '"1px solid ' + color("borderStrong") + '"' : "0";
  return `      <button type="button" data-hmi-type="HmiButton" data-hmi-graphic="${item.graphic}" data-hmi-event="${item.event}" data-hmi-action="${item.action}" data-hmi-authorization="${item.authorization}"${item.attributes ?? ""} style={{ position: "absolute", left: ${item.left}, top: 565, width: ${item.left === 53 ? 197 : 196}, height: 82, display: "flex", alignItems: "center", justifyContent: "center", gap: 18, padding: "0 16px", border: ${border}, borderRadius: 4, background: "${item.background}", color: "white", fontFamily: ${font}, fontSize: 17, fontWeight: 700, cursor: "pointer" }}>${icon(item.icon)}<span>${item.text}</span></button>
`;
}

export function systemFunctionTemplateBody(): string {
  const buttons: MainButton[] = [
    { left: 53, text: "Shutdown", graphic: "Graphic_95", action: "stop-runtime", event: "Up", background: "#A8A8AA", authorization: "CLV", icon: "shutdown", attributes: ' data-hmi-runtime-mode="hmiStopRuntime"' },
    { left: 293, text: "Layout", graphic: "Layout", action: "change-screen", event: "Down", background: "linear-gradient(180deg, #C68DF0 0%, #7E4EA0 100%)", authorization: "None", icon: "layout", attributes: ' data-plc-variable="PV_Enable_Session_PLC[Enable_Session_Index]" data-plc-value="0" data-hmi-target-screen="0001_Choice" data-hmi-target-window="../../Choice"' },
    { left: 533, text: "Control Panel", graphic: "Graphic_35", action: "show-control-panel", event: "Down", background: "#7CC5C7", authorization: "CLV", icon: "control" },
    { left: 788, text: "Logoff", graphic: "Graphic_37", action: "logoff", event: "Down", background: "linear-gradient(180deg, #F36A00 0%, #BD4300 100%)", authorization: "None", icon: "logout" },
  ];

  return `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 0, top: 0, width: 1189, height: 37, borderRadius: "4px 4px 0 0", background: "${color("panel")}" }} />
      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: 15, top: 0, width: 229, height: 37, display: "flex", alignItems: "center", color: "${color("title")}", fontSize: ${typography.heading.size} }}>Language on Panel</span>
${languages.map(languageCard).join("")}      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 494, width: 742, height: 37, borderRadius: "10px 10px 0 0", background: "${color("panel")}" }} />
      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: 34, top: 494, width: 385, height: 37, display: "flex", alignItems: "center", color: "${color("title")}", fontSize: ${typography.heading.size} }}>Function</span>
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 534, width: 742, height: 143, borderRadius: "0 0 10px 10px", background: "${color("panel")}" }} />
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 767, top: 494, width: 442, height: 37, borderRadius: "10px 10px 0 0", background: "${color("panel")}" }} />
      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: 777, top: 494, width: 128, height: 37, display: "flex", alignItems: "center", color: "${color("title")}", fontSize: ${typography.heading.size} }}>Users</span>
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 767, top: 534, width: 442, height: 143, borderRadius: "0 0 10px 10px", background: "${color("panel")}" }} />
${buttons.map(mainButton).join("")}      <button type="button" data-hmi-type="HmiButton" data-hmi-event="Down" data-hmi-action="import-user-administration" data-hmi-user-file="/media/simatic/X61/fileutenti.udz" style={{ position: "absolute", left: 1028, top: 565, width: 160, height: 40, border: 0, borderRadius: 4, background: "linear-gradient(180deg, #FF9C00 0%, #C67400 100%)", color: "white", fontFamily: ${font}, fontSize: 17, fontWeight: 700, cursor: "pointer" }}>Import User</button>
      <button type="button" data-hmi-type="HmiButton" data-hmi-event="Down" data-hmi-action="export-user-administration" data-hmi-user-file="/media/simatic/X61/fileutenti" data-hmi-after-action="logoff" style={{ position: "absolute", left: 1028, top: 607, width: 160, height: 40, border: 0, borderRadius: 4, background: "linear-gradient(180deg, #FF9C00 0%, #C67400 100%)", color: "white", fontFamily: ${font}, fontSize: 17, fontWeight: 700, cursor: "pointer" }}>Export User</button>
      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active" data-hmi-swipe-right="2201_MMC_Guide" style={{ position: "absolute", left: 8, top: 8, width: 1215, height: 682, pointerEvents: "none" }} />
`;
}

export const systemFunctionTemplateImports = 'import { useState } from "react";\n\n';
export const systemFunctionTemplatePreamble = "  const [currentLanguage, setCurrentLanguage] = useState(1040);\n\n";
