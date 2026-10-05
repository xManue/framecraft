import { machineImage } from "./hmiPrimitives";
import { cssColor, pagePalette } from "./hmiStandard";

/** Le sette schermate 6001-6241 della sezione Diagnostic, separate perche' anche le pagine
 * vuote hanno numeri, foto e contratti di scorrimento propri nello standard WinCC. */
export type DiagnosticTemplateId =
  | "synoptic"
  | "diagnostic-robot"
  | "diagnostic-zone"
  | "device-diagnostic"
  | "diagnostic-maintenance"
  | "diagnostic-profinet"
  | "diagnostic-free";

const photo = (name: string) => `FotoStandardManu/Desktop/6000_Diagnostic/${name}`;

export const diagnosticTemplates = [
  ["synoptic", "Sinottico", "6001_Synoptic", "0103_Pagina_6001_Synoptic.png", "Sinottico Pallet Conveyor con i cinque trasportatori che aprono il faceplate Tracking."],
  ["diagnostic-robot", "Diagnostica robot", "6041_Robot", "0104_Pagina_6041_Robot.png", "Pagina robot predisposta nello standard: sfondo grigio, linguetta e scorrimento, senza contenuto inventato."],
  ["diagnostic-zone", "Diagnostica per zona", "6081_Diagnostic_By_Zone", "0105_Pagina_6081_Diagnostic_By_Zone.png", "Rendering Main_1 con le tre zone allarme reali che portano alla diagnostica dispositivo."],
  ["device-diagnostic", "Diagnostica dispositivo", "6121_Diagnostic_By_Device", "0106_Pagina_6121_Diagnostic_By_Device.png", "Rendering Motor_Speed e sette dispositivi dinamici collegati al popup diagnostico."],
  ["diagnostic-maintenance", "Manutenzione preventiva", "6161_Preventive_Maintenance", "0107_Pagina_6161_Preventive_Maintenance.png", "Pagina predisposta nello standard senza contenuto operativo."],
  ["diagnostic-profinet", "Profinet", "6201_Profinet", "0108_Pagina_6201_Profinet.png", "Pagina predisposta nello standard senza contenuto operativo."],
  ["diagnostic-free", "Diagnostic Free", "6241", "0109_Pagina_6241.png", "Pagina libera 6241, mantenuta vuota con il contratto di scorrimento esportato."],
].map(([id, name, sourceScreen, image, description]) => ({
  id: id as DiagnosticTemplateId,
  name,
  description,
  sourceScreen,
  referenceImage: photo(image),
  visualStatus: "verified" as const,
  recommendedSection: "diagnostic" as const,
  setupHint: id === "synoptic"
    ? "1. Seleziona il riquadro e scegli lo screen della parte macchina. 2. Trascina Targhetta motore e Linea richiamo per ogni motore, poi collega il popup Tracking e i tag PLC."
    : id === "device-diagnostic"
      ? "1. Seleziona il riquadro e scegli lo screen della parte macchina. 2. Aggiungi e posiziona le targhette dei dispositivi realmente presenti, poi collega il popup diagnostico."
      : undefined,
}));

export function isDiagnosticTemplate(id: string): id is DiagnosticTemplateId {
  return diagnosticTemplates.some((template) => template.id === id);
}

const color = (name: keyof typeof pagePalette) => cssColor(pagePalette[name]);

interface SwipeShape {
  previous?: string;
  next?: string;
}

function swipeArea({ previous, next }: SwipeShape): string {
  const right = previous ? ` data-hmi-swipe-right="${previous}"` : "";
  const left = next ? ` data-hmi-swipe-left="${next}"` : "";
  return `      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active"${right}${left} style={{ position: "absolute", left: 8, top: 8, width: 1215, height: 689, pointerEvents: "none" }} />
`;
}

function ellipse(centerX: number, centerY: number, radiusX: number, radiusY: number, angle: number): string {
  return `      <span data-hmi-type="HmiEllipse" aria-hidden="true" style={{ position: "absolute", left: ${centerX - radiusX}, top: ${centerY - radiusY}, width: ${radiusX * 2}, height: ${radiusY * 2}, borderRadius: "50%", background: "${color("plate")}", transform: "rotate(${angle}deg)" }} />
`;
}

function synopticHeader(title: string): string {
  return `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 19, width: 1189, height: 37, borderRadius: "5px 5px 0 0", background: "${color("panel")}" }} />
      <div data-hmi-type="HmiTextBox" style={{ position: "absolute", left: 35, top: 19, width: 500, height: 37, display: "flex", alignItems: "center", color: "${color("title")}", fontSize: 15, fontWeight: 700 }}>${title}</div>
      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 60, width: 1189, height: 616, borderRadius: "0 0 6px 6px", background: "${color("panel")}" }} />
`;
}

function synopticBody(title: string): string {
  const image = machineImage(316, 118, 643, 513, "Sostituisci con la grafica Synoptic")
    .replace('data-image-role="detail"', 'data-image-role="detail" data-framecraft-slot="machine-part-screen" data-framecraft-next="add-machine-callouts" data-hmi-graphic="Synoptic"');
  return synopticHeader(title)
    + ellipse(437, 323, 113, 240, 0)
    + ellipse(651, 511, 354, 121, 0)
    + image
    + swipeArea({ next: "6041_Robot" });
}

interface AlarmZone {
  left: number;
  top: number;
  width: number;
  height: number;
  points: string;
  buttonLeft: number;
  buttonTop: number;
  tag: string;
}

const alarmZones: readonly AlarmZone[] = [
  { left: 752, top: 101, width: 109, height: 285, points: "109,274 70,285 3,201 0,14 48,0 107,63", buttonLeft: 766, buttonTop: 186, tag: "Alarms_EM[9].NumEvents" },
  { left: 432, top: 258, width: 129, height: 115, points: "129,86 29,115 2,87 0,28 95,0 127,34", buttonLeft: 459, buttonTop: 293, tag: "Alarms_EM[3].NumEvents" },
  { left: 124, top: 339, width: 168, height: 87, points: "168,44 21,87 0,65 1,46 154,0 168,16", buttonLeft: 169, buttonTop: 367, tag: "Alarms_EM[1].NumEvents" },
];

function alarmZone(shape: AlarmZone, index: number): string {
  return `      <svg data-hmi-type="HmiPolygon" data-plc-variable="${shape.tag}" data-hmi-visible-tag="${shape.tag}" data-hmi-opacity-tag="Clock_1Hz" aria-label="Zona allarme ${index + 1}" viewBox="0 0 ${shape.width} ${shape.height}" style={{ position: "absolute", left: ${shape.left}, top: ${shape.top}, width: ${shape.width}, height: ${shape.height}, overflow: "visible", fill: "rgba(231, 42, 42, .08)", stroke: "#E72A2A", strokeWidth: 3, pointerEvents: "none" }}><polygon points="${shape.points}" /></svg>
      <button type="button" data-hmi-type="HmiButton" data-hmi-graphic="Info_Logo_White" data-plc-variable="${shape.tag}" data-hmi-visible-tag="${shape.tag}" data-hmi-event="Down" data-hmi-action="change-screen" aria-label="Apri diagnostica dispositivi della zona ${index + 1}" onDoubleClick={() => openPage("/diagnostic/by-device")} style={{ position: "absolute", left: ${shape.buttonLeft}, top: ${shape.buttonTop}, width: 75, height: 39, display: "grid", placeItems: "center", padding: 0, border: 0, background: "transparent", cursor: "pointer" }}><svg aria-hidden="true" viewBox="0 0 32 32" style={{ width: 32, height: 32 }}><circle cx="16" cy="16" r="15" fill="#050505"/><path d="M16 13v10M16 8.5v1" stroke="white" strokeWidth="3" strokeLinecap="round"/></svg></button>
`;
}

function diagnosticZoneBody(): string {
  const image = machineImage(60, 64, 1102, 534, "Sostituisci con la grafica Main_1", "machine")
    .replace('data-image-role="machine"', 'data-image-role="machine" data-hmi-graphic="Main_1" data-plc-variable="Alarms_Trigger[65]" data-hmi-alternate-back-color-tag="Alarms_Trigger[65]"');
  return ellipse(619, 451, 580, 156, -10)
    + image
    + alarmZones.map(alarmZone).join("")
    + swipeArea({ previous: "6041_Robot", next: "6121_Diagnostic_By_Device" });
}

function deviceDiagnosticBody(): string {
  const image = machineImage(296, 104, 559, 447, "Sostituisci con la grafica Motor_Speed")
    .replace('data-image-role="detail"', 'data-image-role="detail" data-framecraft-slot="machine-part-screen" data-framecraft-next="add-machine-callouts" data-hmi-graphic="Motor_Speed"');
  return ellipse(578, 421, 295, 109, 15)
    + image
    + swipeArea({ previous: "6081_Diagnostic_By_Zone", next: "6161_Preventive_Maintenance" });
}

function emptyDiagnosticBody(id: Exclude<DiagnosticTemplateId, "synoptic" | "diagnostic-zone" | "device-diagnostic">): string {
  const swipes: Record<typeof id, SwipeShape> = {
    "diagnostic-robot": { previous: "6001_Synoptic", next: "6081_Diagnostic_By_Zone" },
    "diagnostic-maintenance": { previous: "6121_Diagnostic_By_Device", next: "6201_Profinet" },
    "diagnostic-profinet": { previous: "6161_Preventive_Maintenance" },
    // L'export 6241 punta davvero a Manuals: si conserva l'anomalia invece di correggerla a intuito.
    "diagnostic-free": { previous: "5001_Manual_General", next: "5081_Preforming" },
  };
  return swipeArea(swipes[id]);
}

export function diagnosticTemplateBody(id: DiagnosticTemplateId, title: string): string {
  if (id === "synoptic") return synopticBody(title);
  if (id === "diagnostic-zone") return diagnosticZoneBody();
  if (id === "device-diagnostic") return deviceDiagnosticBody();
  return emptyDiagnosticBody(id);
}
