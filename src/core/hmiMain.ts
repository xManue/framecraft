/** Schermate Main che nello standard sono realmente vuote.
 *
 * Non sono dashboard non caricate: foto e JSON mostrano soltanto la cornice grigia, la linguetta e
 * l'area touch mobile. Restano separate perche' ognuna ha numero, sorgente e swipe propri. */

export type MainEmptyTemplateId =
  | "machine-downstair"
  | "main-counters"
  | "main-collector-counters"
  | "main-free"
  | "main-maintenance";

export const mainEmptyTemplates = [
  {
    id: "machine-downstair",
    name: "Vista macchina Downstair vuota",
    description: "Seconda linguetta della vista macchina: nello standard e' una pagina grigia vuota con swipe verso Upstair e Counters.",
    sourceScreen: "1002_Downstair",
    referenceImage: "FotoStandardManu/Desktop/1000_Main/0003_Pagina_1002_Downstair.png",
    visualStatus: "verified" as const,
    recommendedSection: "main" as const,
  },
  {
    id: "main-counters",
    name: "Counters vuota",
    description: "La 1041 esportata non contiene contatori: conserva soltanto la pagina e gli swipe dello standard.",
    sourceScreen: "1041_Counters",
    referenceImage: "FotoStandardManu/Desktop/1000_Main/0004_Pagina_1041_Counters.png",
    visualStatus: "verified" as const,
    recommendedSection: "main" as const,
  },
  {
    id: "main-collector-counters",
    name: "Collector Counters vuota",
    description: "La 1121 e' predisposta ma vuota nel progetto reale; restano gli swipe fra Special e PackML.",
    sourceScreen: "1121_Collector_Counters",
    referenceImage: "FotoStandardManu/Desktop/1000_Main/0007_Pagina_1121_Collector_Counters.png",
    visualStatus: "verified" as const,
    recommendedSection: "main" as const,
  },
  {
    id: "main-free",
    name: "Main Free vuota",
    description: "Posto libero 1161 dello standard, senza contenuto aggiunto e con gli swipe esportati.",
    sourceScreen: "1161_",
    referenceImage: "FotoStandardManu/Desktop/1000_Main/0008_Pagina_1161_.png",
    visualStatus: "verified" as const,
    recommendedSection: "main" as const,
  },
  {
    id: "main-maintenance",
    name: "Maintenance vuota",
    description: "La 1241 reale e' una pagina grigia vuota; conserva il ritorno swipe a PackML.",
    sourceScreen: "1241_Maintenace",
    referenceImage: "FotoStandardManu/Desktop/1000_Main/0010_Pagina_1241_Maintenace.png",
    visualStatus: "verified" as const,
    recommendedSection: "main" as const,
  },
] as const;

export function isMainEmptyTemplate(id: string): id is MainEmptyTemplateId {
  return mainEmptyTemplates.some((template) => template.id === id);
}

interface SwipeShape {
  left?: string;
  right?: string;
  up?: string;
  down?: string;
}

const swipes: Record<MainEmptyTemplateId, SwipeShape> = {
  "machine-downstair": { left: "1041_Counters", down: "1001_Upstair" },
  "main-counters": { right: "1001_Upstair", left: "1081_Special" },
  "main-collector-counters": { right: "1081_Special", left: "1201_Omac" },
  "main-free": { right: "1041_Counters", left: "1201_Omac" },
  "main-maintenance": { right: "1201_Omac" },
};

export function mainEmptyTemplateBody(id: MainEmptyTemplateId): string {
  const swipe = swipes[id];
  const attributes = [
    swipe.left && ` data-hmi-swipe-left="${swipe.left}"`,
    swipe.right && ` data-hmi-swipe-right="${swipe.right}"`,
    swipe.up && ` data-hmi-swipe-up="${swipe.up}"`,
    swipe.down && ` data-hmi-swipe-down="${swipe.down}"`,
  ].filter(Boolean).join("");
  return `      <div aria-hidden="true" data-hmi-type="HmiTouchArea" data-plc-variable="Mobile_Layout_Active" data-hmi-visible-tag="Mobile_Layout_Active"${attributes} style={{ position: "absolute", left: 8, top: 8, width: 1215, height: 689, pointerEvents: "none" }} />\n`;
}
