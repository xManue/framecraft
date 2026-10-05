import { machineImage } from "./hmiPrimitives";
import { cssColor, pagePalette } from "./hmiStandard";

/** Le sette schermate della sezione Manuals. Ogni stazione ha coordinate, richiami e selezioni
 * proprie nel JSON WinCC: trattarle come un solo template produce comandi falsi. */
export type ManualTemplateId =
  | "machine-map"
  | "manual-infeed"
  | "manual-preforming"
  | "manual-layer-pusher"
  | "manual-lifter"
  | "manual-tie-sheet"
  | "manual-pallet-conveyor";

const photo = (name: string) => `FotoStandardManu/Desktop/5000_Manuals/${name}`;

export const manualTemplates = [
  ["machine-map", "Mappa macchina", "5001_Manual_General", "0095_Pagina_5001_Manual_General.png", "Vista generale con le sei aree reali e i collegamenti alle pagine manuali."],
  ["manual-infeed", "Manuale Infeed", "5041_Infeed", "0096_Pagina_5041_Infeed.png", "Area per lo screen Infeed; motori e comandi si aggiungono dalla palette."],
  ["manual-preforming", "Manuale Preforming", "5081_Preforming", "0097_Pagina_5081_Preforming.png", "Area per lo screen Preforming; motori e comandi si aggiungono dalla palette."],
  ["manual-layer-pusher", "Manuale Layer Pusher", "5121_Layer_Pusher", "0098_Pagina_5121_Layer_Pusher.png", "Area per lo screen Layer Pusher; motori e quote si aggiungono dalla palette."],
  ["manual-lifter", "Manuale Lifter", "5161_Lifter", "0099_Pagina_5161_Lifter.png", "Area per lo screen Lifter; motori e quote si aggiungono dalla palette."],
  ["manual-tie-sheet", "Manuale Tie Sheet", "5201_Tie_Sheet", "0100_Pagina_5201_Tie_Sheet.png", "Area per lo screen Tie Sheet; motori e valvole si aggiungono dalla palette."],
  ["manual-pallet-conveyor", "Manuale Pallet Conveyors", "5241_PalletConveyor", "0101_Pagina_5241_PalletConveyor.png", "Area per lo screen Pallet Conveyors; i motori reali si aggiungono dalla palette."],
].map(([id, name, sourceScreen, image, description]) => ({
  id: id as ManualTemplateId,
  name,
  description,
  sourceScreen,
  referenceImage: photo(image),
  visualStatus: "verified" as const,
  recommendedSection: "manuals" as const,
  setupHint: id === "machine-map" ? undefined : "1. Seleziona il riquadro e scegli lo screen della stazione. 2. Trascina Targhetta motore e Linea richiamo per ogni organo, quindi collega comando, popup e variabile PLC.",
}));

export function isManualTemplate(id: string): id is ManualTemplateId {
  return manualTemplates.some((template) => template.id === id);
}

const color = (name: keyof typeof pagePalette) => cssColor(pagePalette[name]);

interface StationShape {
  graphic: string;
  image: { left: number; top: number; width: number; height: number };
  ellipse: { centerX: number; centerY: number; radiusX: number; radiusY: number; angle: number };
  previous: string;
  next?: string;
}

const stations: Record<Exclude<ManualTemplateId, "machine-map">, StationShape> = {
  "manual-infeed": {
    graphic: "Manual_Infeed",
    image: { left: 329, top: 68, width: 610, height: 577 },
    ellipse: { centerX: 653, centerY: 423, radiusX: 396, radiusY: 184, angle: -25 },
    previous: "5001_Manual_General",
    next: "5081_Preforming",
  },
  "manual-preforming": {
    graphic: "Manual_Preforming",
    image: { left: 209, top: 64, width: 713, height: 588 },
    ellipse: { centerX: 601, centerY: 450, radiusX: 390, radiusY: 155, angle: -25 },
    previous: "5041_Infeed",
    next: "5121_Layer_Pusher",
  },
  "manual-layer-pusher": {
    graphic: "Manual_Layer_Pusher",
    image: { left: 258, top: 60, width: 658, height: 524 },
    ellipse: { centerX: 619, centerY: 443, radiusX: 292, radiusY: 148, angle: -25 },
    previous: "5081_Preforming",
    next: "5161_Lifter",
  },
  "manual-lifter": {
    graphic: "Manual_Lifter",
    image: { left: 142, top: 68, width: 362, height: 584 },
    ellipse: { centerX: 317, centerY: 572, radiusX: 181, radiusY: 93, angle: 0 },
    previous: "5121_Layer_Pusher",
    next: "5201_Tie_Sheet",
  },
  "manual-tie-sheet": {
    graphic: "Manual_TieSheet",
    image: { left: 367, top: 56, width: 609, height: 584 },
    ellipse: { centerX: 720, centerY: 545, radiusX: 296, radiusY: 122, angle: -10 },
    previous: "5161_Lifter",
    next: "5241_PalletConveyor",
  },
  "manual-pallet-conveyor": {
    graphic: "Manual_Pallet_Conveyors",
    image: { left: 143, top: 71, width: 949, height: 584 },
    ellipse: { centerX: 626, centerY: 396, radiusX: 469, radiusY: 202, angle: 15 },
    previous: "5201_Tie_Sheet",
  },
};

function titleBar(title: string): string {
  return `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 19, width: 1189, height: 37, borderRadius: "5px 5px 0 0", background: "${color("panel")}" }} />
      <div data-hmi-type="HmiTextBox" style={{ position: "absolute", left: 35, top: 19, width: 229, height: 37, display: "flex", alignItems: "center", color: "${color("title")}", fontSize: 15, fontWeight: 700 }}>${title}</div>
`;
}

function contentBoard(): string {
  return `      <div data-hmi-type="HmiRectangle" style={{ position: "absolute", left: 20, top: 60, width: 1189, height: 617, borderRadius: "0 0 6px 6px", background: "${color("panel")}" }} />
`;
}

function ellipse(shape: StationShape["ellipse"]): string {
  return `      <span data-hmi-type="HmiEllipse" aria-hidden="true" style={{ position: "absolute", left: ${shape.centerX - shape.radiusX}, top: ${shape.centerY - shape.radiusY}, width: ${shape.radiusX * 2}, height: ${shape.radiusY * 2}, borderRadius: "50%", background: "${color("plate")}", transform: "rotate(${shape.angle}deg)" }} />
`;
}

function swipeArea(previous: string, next?: string): string {
  const nextAttribute = next ? ` data-hmi-swipe-left="${next}"` : "";
  return `      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active" data-hmi-swipe-right="${previous}"${nextAttribute} style={{ position: "absolute", left: 8, top: 8, width: 1215, height: 689, pointerEvents: "none" }} />
`;
}

function stationBody(shape: StationShape, title: string): string {
  const image = machineImage(shape.image.left, shape.image.top, shape.image.width, shape.image.height, `Sostituisci con la grafica ${shape.graphic}`)
    .replace('data-image-role="detail"', `data-image-role="detail" data-framecraft-slot="machine-part-screen" data-framecraft-next="add-machine-callouts" data-hmi-graphic="${shape.graphic}"`);
  return titleBar(title) + contentBoard() + ellipse(shape.ellipse) + image + swipeArea(shape.previous, shape.next);
}

interface MapZone {
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  target: string;
  buttonLeft: number;
  buttonTop: number;
  points?: string;
}

function infoButton(zone: MapZone): string {
  return `      <button type="button" data-hmi-type="HmiButton" aria-label="Apri ${zone.label}" onDoubleClick={() => openPage("${zone.target}")} style={{ position: "absolute", left: ${zone.buttonLeft}, top: ${zone.buttonTop}, width: 75, height: 39, display: "grid", placeItems: "center", padding: 0, border: 0, background: "transparent", cursor: "pointer" }}><span aria-hidden="true" style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: "50%", background: "#050505", color: "white", fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 700, fontStyle: "italic" }}>i</span></button>
`;
}

function machineMapBody(): string {
  const zones: readonly MapZone[] = [
    { left: 454, top: 285, width: 313, height: 138, label: "Preforming", target: "/manuals/preforming", buttonLeft: 590, buttonTop: 343 },
    { left: 97, top: 299, width: 357, height: 83, label: "Infeed", target: "/manuals/infeed", buttonLeft: 245, buttonTop: 321 },
    { left: 767, top: 255, width: 82, height: 168, label: "Layer Pusher", target: "/manuals/layer-pusher", buttonLeft: 771, buttonTop: 321 },
    { left: 726, top: 423, width: 153, height: 99, label: "Lifter", target: "/manuals/lifter", buttonLeft: 765, buttonTop: 455 },
    { left: 879, top: 423, width: 98, height: 99, label: "Lifter", target: "/manuals/lifter", buttonLeft: 893, buttonTop: 455 },
    { left: 356, top: 423, width: 257, height: 99, label: "Lifter", target: "/manuals/lifter", buttonLeft: 454, buttonTop: 455 },
    { left: 870, top: 22, width: 238, height: 501, label: "Pallet Conveyors", target: "/manuals/pallet-conveyor", buttonLeft: 1004, buttonTop: 255, points: "108,500 238,501 238,0 0,0 0,110 112,110" },
  ];
  const outlines = zones.map((zone) => zone.points
    ? `      <svg data-hmi-type="HmiPolygon" aria-hidden="true" viewBox="0 0 ${zone.width} ${zone.height}" style={{ position: "absolute", left: ${zone.left}, top: ${zone.top}, width: ${zone.width}, height: ${zone.height}, overflow: "visible", pointerEvents: "none" }}><polygon points="${zone.points}" fill="rgba(0,232,50,.18)" stroke="${color("selection")}" strokeWidth="3" strokeLinejoin="round" /></svg>
`
    : `      <span data-hmi-type="HmiRectangle" aria-hidden="true" style={{ position: "absolute", left: ${zone.left}, top: ${zone.top}, width: ${zone.width}, height: ${zone.height}, boxSizing: "border-box", border: "3px solid ${color("selection")}", background: "rgba(0,232,50,.18)", pointerEvents: "none" }} />
`).join("");
  const image = machineImage(42, 14, 1132, 658, "Sostituisci con la vista Manual_TopView", "machine")
    .replace('data-image-role="machine"', 'data-image-role="machine" data-hmi-graphic="Manual_TopView" data-plc-variable="Alarms_Trigger[65]" data-hmi-alternate-back-color-tag="Alarms_Trigger[65]"');
  return image + outlines + zones.map(infoButton).join("")
    + `      <span data-hmi-type="HmiTextBox" style={{ position: "absolute", left: 15, top: 9, width: 255, height: 40, display: "flex", alignItems: "center", color: "${color("text")}", fontSize: 14 }}>&gt; Select an Area for Faster Navigation</span>
`
    + `      <button type="button" data-hmi-type="HmiButton" data-hmi-layout="mobile" data-hmi-action="select-manual" data-plc-variable="PV_Manual_Selected_Number_XPB[Enable_Session_Index]" data-hmi-selection-value="2380" data-hmi-popup-screen="9004_Manual Popup" data-hmi-popup-title="M2380 - Manual Command" style={{ position: "absolute", left: 38, top: 718, width: 148, height: 52, visibility: "hidden" }} />
`
    + `      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active" data-hmi-swipe-left="5041_Infeed" style={{ position: "absolute", left: 8, top: 8, width: 1215, height: 689, pointerEvents: "none" }} />
`;
}

export function manualTemplateBody(id: ManualTemplateId, title: string): string {
  if (id === "machine-map") return machineMapBody();
  return stationBody(stations[id], title);
}
