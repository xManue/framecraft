import { standardPageSource, planPageNumber, type StandardPagePlan, type StandardPageTemplateId } from "./hmiPages";
import { blueprintPages, folderGroupRoutes, menuPagePlan, sectionBlueprint, submenuPlacement, type MenuIconId, type SettingsProgram } from "./hmiSectionMenu";
import { cssColor, desktopShell, lateralBar, mobileShell, pageCanvas, panelSize, sections, submenuPalette, submenuPanel } from "./hmiStandard";
import { emptyHmiResourceCatalog } from "./hmiResources";
import { hmiScriptRuntimeModuleSource } from "./hmiScript";
import { emptyHmiScriptCatalog, hmiScriptModulesRuntimeSource } from "./hmiScriptModules";
import { hmiFlashingRuntimeSource } from "./hmiFlashing";
import { hmiScheduleRuntimeSource } from "./hmiSchedule";
import { hmiTimersRuntimeSource } from "./hmiTimers";
import { serializeHmiFaceplateCatalog, standardHmiFaceplateCatalog } from "./hmiFaceplates";
import { hmiPopupManagerRuntimeModuleSource } from "./hmiPopupManager";
import { hmiFaceplateVisualRuntimeModuleSource } from "./hmiFaceplateVisuals";
import { hmiTrendRuntimeModuleSource } from "./hmiTrend";
import { hmiFunctionTrendRuntimeModuleSource } from "./hmiFunctionTrend";
import { emptyHmiDataLogCatalog, hmiDataLogRuntimeModuleSource } from "./hmiDataLogs";
import mqttDriverSource from "../../runtime/mqtt-driver.mjs?raw";
import opcUaDriverSource from "../../runtime/opcua-driver.mjs?raw";
import opcUaDriverTypes from "../../runtime/opcua-driver.d.mts?raw";
import connectionDiagnosticSource from "../../runtime/connection-diagnostics.mjs?raw";
import connectionDiagnosticTypes from "../../runtime/connection-diagnostics.d.mts?raw";
import runtimeLogSource from "../../runtime/runtime-log.mjs?raw";
import runtimeLogTypes from "../../runtime/runtime-log.d.mts?raw";
import mqttStartSource from "../../runtime/start-mqtt.mjs?raw";
import mqttReadmeSource from "../../runtime/README.md?raw";
import mqttDriverTypes from "../../runtime/mqtt-driver.d.mts?raw";
import connectionConfigSource from "../../runtime/connection-config.mjs?raw";
import connectionConfigTypes from "../../runtime/connection-config.d.mts?raw";
import gatewaySource from "../../runtime/gateway.mjs?raw";
import gatewayTypes from "../../runtime/gateway.d.mts?raw";
import gatewayStartSource from "../../runtime/start-gateway.mjs?raw";
import gatewayProxySource from "../../runtime/vite-gateway.mjs?raw";
import gatewayProxyTypes from "../../runtime/vite-gateway.d.mts?raw";
import gatewayClientSource from "./hmiGateway.ts?raw";

/** Il pannello nuovo, gia' allo standard.
 *
 * Il guscio non e' una barra qualsiasi con dei link: e' quello misurato sulle foto. In alto due file
 * di schede `#333333` sul nero (orologio, First Fault, PLC Connection, logo; utente, linea e formato,
 * OMAC, velocita'), a sinistra le sette tessere sfumate con il colore della sezione, e in mezzo la
 * finestra `SW_Screen` 1200x649 che rimpicciolisce la pagina di 0.9375. La voce non attiva e' la
 * stessa tessera a meta' opacita' sopra il nero, come nel progetto vero.
 *
 * L'icona della sezione non porta a una pagina: apre il sottomenu bianco con le voci della sezione,
 * come nello standard. Tutte e sette le sezioni hanno il loro sottomenu ricostruito
 * (`hmiSectionMenu`) e portano le loro pagine: Main nove (1001-1241), Settings con una sessione
 * Program Modification scelta e tutte le pagine 2041-2241,
 * Alarms quattro, Statistics tre, Manuals sette, Diagnostic sette, Formats tre. Le voci "Free"
 * delle foto restano nel menu senza pagina, perche' nel progetto vero non ce l'hanno. */

export type StandardProjectLayout = "desktop" | "desktop-mobile";
export type StandardProjectSectionId = "main" | "settings" | "alarms" | "statistics" | "manuals" | "diagnostic" | "formats";

export interface StandardProjectConfig {
  machineName: string;
  layout: StandardProjectLayout;
  sections: StandardProjectSectionId[];
  /** Famiglia alternativa delle schermate Program Modification dello standard reale. */
  settingsProgram?: SettingsProgram;
  /** Il percorso della foto della macchina, se l'hai scelta: finisce nel progetto e nelle pagine
   * che mostrano la macchina intera (1001, 1081, 4001 e 5001). I pezzi — sinottico, encoder,
   * robot, stazioni — restano segnaposto, perche' una foto sola non li puo' coprire. */
  machineImage?: string;
}

export interface GeneratedProjectFile {
  path: string;
  content: string;
  /** Quando c'e', il file viene copiato da questo percorso invece di scrivere `content`: le
   * immagini non sono testo. */
  source?: string;
}

export interface StandardProjectSectionChoice {
  id: StandardProjectSectionId;
  /** Come si chiama nella barra laterale: il nome dello standard, non una traduzione. */
  label: string;
  description: string;
  route: string;
  componentName: string;
  /** Il titolo della prima pagina della sezione, come nella schermata vera. */
  pageTitle: string;
  templateId: StandardPageTemplateId;
}

export const standardProjectSectionChoices: readonly StandardProjectSectionChoice[] = [
  { id: "main", label: "Main", description: "Tutto il menu Main: vista linea, contatori, funzioni speciali, PackML e manutenzione (1001-1241).", route: "/", componentName: "UpstairPage", pageTitle: "Upstair", templateId: "machine-render" },
  { id: "settings", label: "Settings", description: "Tutto il menu Settings: programma, encoder, motori, robot, lubrificazione, guide e sistema (2001-2241).", route: "/settings", componentName: "SettingsPage", pageTitle: "Program Modification", templateId: "program-modification" },
  { id: "alarms", label: "Alarms", description: "Tutto il menu Alarms: lista, allarmi per zona, storico e media (3001-3121).", route: "/alarms", componentName: "AlarmsPage", pageTitle: "Alarm", templateId: "alarms" },
  { id: "statistics", label: "Statistics", description: "Tutto il menu Statistics: macchina, produzione e disponibilita' (4001-4081).", route: "/statistics", componentName: "StatisticsPage", pageTitle: "Statistics", templateId: "statistics" },
  { id: "manuals", label: "Manuals", description: "Tutto il menu Manuals: mappa macchina e le sei stazioni in manuale (5001-5241).", route: "/manuals", componentName: "ManualsPage", pageTitle: "Manual General", templateId: "machine-map" },
  { id: "diagnostic", label: "Diagnostic", description: "Tutto il menu Diagnostic: sinottico, robot, zone, dispositivi, manutenzione e Profinet (6001-6241).", route: "/diagnostic", componentName: "DiagnosticPage", pageTitle: "Synoptic", templateId: "synoptic" },
  { id: "formats", label: "Formats", description: "Tutto il menu Formats: selezione formato, copia e magazzino pallet (7001-7081).", route: "/formats", componentName: "FormatsPage", pageTitle: "Formats", templateId: "format-manager" },
] as const;

/** Una pagina del progetto generato, con tutto quello che serve a scriverla e a registrarla. */
interface PlannedPage {
  number: number;
  title: string;
  templateId: StandardPageTemplateId;
  componentName: string;
  route: string;
  folderTab: number;
  /** Dove portano le sue linguette: le pagine sorelle, una per linguetta. */
  folderRoutes: readonly string[];
  plan: StandardPagePlan;
}

/** Una sezione del progetto generato: le sue pagine e, se lo standard ce l'ha, il suo sottomenu. */
interface PlannedSection {
  id: StandardProjectSectionId;
  label: string;
  route: string;
  pages: PlannedPage[];
  /** Rotta vuota: la voce e' una "Free" riservata dello standard, senza schermata. */
  entries: { label: string; icon: MenuIconId; route: string }[];
  menu: ReturnType<typeof submenuPlacement> | undefined;
}

/** Quante pagine crea davvero una scelta di sezioni: la Main ne porta nove, non una. */
export function standardProjectPageCount(chosen: readonly StandardProjectSectionId[], settingsProgram: SettingsProgram = "robot"): number {
  return chosen.reduce((total, id) => {
    const blueprint = sectionBlueprint(id, settingsProgram);
    return total + (blueprint ? blueprintPages(blueprint).length : 1);
  }, 0);
}

function planSections(chosen: readonly StandardProjectSectionChoice[], settingsProgram: SettingsProgram): PlannedSection[] {
  return chosen.map((section) => {
    const blueprint = sectionBlueprint(section.id, settingsProgram);
    if (!blueprint) {
      const plan = planPageNumber(section.id, []);
      if (!plan) throw new Error(`La sezione ${section.id} non ha un numero pagina disponibile.`);
      const page: PlannedPage = { number: plan.number, title: section.pageTitle, templateId: section.templateId, componentName: section.componentName, route: section.route, folderTab: 0, folderRoutes: [], plan };
      return { id: section.id, label: section.label, route: section.route, pages: [page], entries: [], menu: undefined };
    }
    // Le linguette portano alle pagine sorelle: chi sono lo dice il blueprint, gruppo per gruppo.
    const tabRoutes = folderGroupRoutes(blueprintPages(blueprint));
    const pages = blueprintPages(blueprint).map((page) => {
      const plan = menuPagePlan(section.id, page.number);
      if (!plan) throw new Error(`Il numero ${page.number} non sta nella numerazione dello standard.`);
      return { ...page, folderTab: page.folderTab ?? 0, folderRoutes: tabRoutes.get(page.number) ?? [], plan } satisfies PlannedPage;
    });
    // Rotta vuota = voce "Free" riservata: sta nel menu ma non porta da nessuna parte.
    const entries = blueprint.entries.map((entry) => ({ label: entry.label, icon: entry.icon, route: entry.pages[0]?.route ?? "" }));
    const slot = sections.find((item) => item.id === section.id)?.slot ?? 0;
    return { id: section.id, label: section.label, route: pages[0].route, pages, entries, menu: submenuPlacement(slot, entries.length) };
  });
}

/** Il posto e il nome che avra' la foto della macchina dentro il progetto. E' la stessa cartella
 * che usa l'Inspector quando importi un'immagine, cosi' le foto stanno tutte insieme. */
export function machineImageAsset(source: string): { path: string; url: string } {
  const base = source.split(/[\\/]/).pop() ?? "macchina.png";
  const dot = base.lastIndexOf(".");
  const extension = (dot > 0 ? base.slice(dot + 1) : "png").toLocaleLowerCase("it");
  const name = `${slug(dot > 0 ? base.slice(0, dot) : base) || "macchina"}.${extension.replace(/[^a-z0-9]/g, "") || "png"}`;
  return { path: `public/framecraft-assets/${name}`, url: `/framecraft-assets/${name}` };
}

/** Le immagini segnate come `machine` prendono la foto scelta; i pezzi restano segnaposto. */
function withMachineImage(source: string, url: string | undefined): string {
  if (!url) return source;
  return source.split(`data-image-role="machine" src="/placeholder.svg"`).join(`data-image-role="machine" src="${url}"`);
}

function safeName(value: string) {
  return value.trim().replace(/[<>]/g, "").slice(0, 80) || "Nuovo pannello";
}

function slug(value: string) {
  return safeName(value).toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pannello-hmi";
}

/** I pittogrammi delle sette tessere. Nel progetto vero sono grafiche TIA (`Icon_MachineControl`,
 * `Icon_Settings_1`, ...): qui sono disegni equivalenti, cosi' la barra si vede subito giusta e
 * restano sostituibili con le grafiche vere. */
const sectionIcon: Record<StandardProjectSectionId, string> = {
  main: "M4 12l8-7 8 7v7a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z",
  settings: "M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zm8-.6-1.4-2.4-2.3.8a7 7 0 0 0-1.6-.9L14.3 3H9.7l-.4 2.4c-.6.2-1.1.5-1.6.9l-2.3-.8L4 7.9l1.8 1.6a7 7 0 0 0 0 1.8L4 12.9l1.4 2.4 2.3-.8c.5.4 1 .7 1.6.9l.4 2.4h4.6l.4-2.4c.6-.2 1.1-.5 1.6-.9l2.3.8L20 12.9l-1.8-1.6a7 7 0 0 0 0-1.8z",
  alarms: "M12 3 2 20h20zm0 6 5.5 9.2h-11zm-.9 3v3.4h1.8V12zm0 4.6v1.6h1.8v-1.6z",
  statistics: "M4 20V9h4v11zm6 0V4h4v16zm6 0v-7h4v7z",
  manuals: "M11 3a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z",
  diagnostic: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM7 12h2l1.5-3 2 6 1.5-3H17",
  formats: "M4 6h3v3H4zm5 .5h11v2H9zM4 11h3v3H4zm5 .5h11v2H9zM4 16h3v3H4zm5 .5h11v2H9z",
};

/** I pittogrammi delle voci di sottomenu, sul modello di quelli della foto del menu Main. */
const menuIcon: Record<MenuIconId, string> = {
  screen: "M3 5h18v11H3zm7 13h4v2h-4z",
  counter: "M3 5h13v9H3zm2 2v5h9V7zm12 8.6 4.4 4.4-1.4 1.4-4.4-4.4a5 5 0 1 1 1.4-1.4zM14 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  star: "M12 3l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 17.3 6.2 20.8l1.6-6.6L2.6 9.8l6.8-.5z",
  collector: "M4 5h2.5v14H4zm4.5 0H11v14H8.5zm4.5 0h2.5v14H13zm4.5 0H20v14h-2.5z",
  chat: "M4 4h16v11H9.5L4 19zm3 4v2h10V8zm0 4v2h6v-2z",
  packml: "M3 18l5-6 3.5 3L17 7l4 5v6zm0 2h18v2H3z",
  wrench: "M14.7 3a5.5 5.5 0 0 0-5 7.7L3 17.4 5.6 20l6.7-6.7A5.5 5.5 0 1 0 14.7 3zm0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z",
  program: "M5 3h9l5 5v13H5zm8 1.5V9h4.5zM8 12h8v2H8zm0 4h8v2H8z",
  encoder: "M3 6h11v12H3zm2 2v8h7V8zm12-2h4v12h-4zm-9 1v2H6V7zm0 4v2H6v-2zm0 4v2H6v-2z",
  motor: "M3 8h10v8H3zm12 1h3v2h3v2h-3v2h-3zM5 5h6v2H5z",
  robot: "M12 3a2 2 0 0 1 1 3.7V9h4a3 3 0 0 1 3 3v3h-2v-3a1 1 0 0 0-1-1h-4v3.3a2 2 0 1 1-2 0V12H7a1 1 0 0 0-1 1v3H4v-3a3 3 0 0 1 3-3h4V6.7A2 2 0 0 1 12 3z",
  oil: "M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3zm0 3.6c-1.6 2-4 5.3-4 6.9a4 4 0 0 0 8 0c0-1.6-2.4-4.9-4-6.9z",
  guide: "M3 11h9V7l6 5-6 5v-4H3zm17-6h2v14h-2z",
  system: "M3 5h13v10H3zm2 2v6h9V7zm-1 10h11v2H4zm14-12h3v14h-3zm1 2v2h1V7z",
  alarmList: "M12 3 2 20h20zm0 4.6L18.4 18H5.6zm-.9 3.4v4h1.8v-4zm0 5.4V18h1.8v-1.6z",
  alarmZone: "M13 5 5 20h16zm0 4.6L17.8 18H8.2zM2 4l5 3-5 3z",
  history: "M12 3a9 9 0 1 0 8.5 12H18a7 7 0 1 1-6-10 7 7 0 0 1 6 3.4h-2.5l3.5 4 3.5-4H20A9 9 0 0 0 12 3zm-1 4v6l4.7 2.8 1-1.7L13 12V7z",
  media: "M3 6h11v12H3zm2 2v8h7V8zm10 2 6-3v10l-6-3z",
  chart: "M3 4h2v15h16v2H3zm5.4 11.6-1.8-1.8 4.4-4.4 3 2.6 4.4-5.4 1.6 1.3-5.6 6.9-3-2.6z",
  production: "M11 3v10h10a10 10 0 1 1-10-10zm-2 2.3a8 8 0 1 0 9.7 9.7H9zM13 3.2A10 10 0 0 1 20.8 11H13z",
  availability: "M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7zm2.6 1.2 1.3 1.5 1.5-1.3 2.6 3-1.5 1.3 1.3 1.5-3 2.6-1.3-1.5-1.5 1.3-2.6-3 1.5-1.3-1.3-1.5zM11 8v5l4 2.4 1-1.7-3-1.8V8z",
  manual: "M3 9h6a3 3 0 0 1 3 2 3 3 0 0 1 3-2h6v3a4 4 0 0 1-4 4h-2a3 3 0 0 1-3-3 3 3 0 0 1-3 3H7a4 4 0 0 1-4-4zm2 2v1a2 2 0 0 0 2 2h2a1 1 0 0 0 1-1v-2zm14 0h-5v2a1 1 0 0 0 1 1h2a2 2 0 0 0 2-2z",
  infeed: "M3 11h11V6l7 6-7 6v-5H3z",
  preforming: "M4 20V9h3v11zm4 0V4h3v16zm4 0v-8h3v8zm4 0V6h3v14z",
  layerPusher: "M11 3h2v6h4l-5 6-5-6h4zm-7 14h16v4H4z",
  lifter: "M11 3h2v9h3l-4 5-4-5h3zM5 19h14v2H5zm2-16h10v2H7z",
  tieSheet: "M3 5h18v9H3zm2 2v5h14V7zm5 9h4v2h-4zm-4 3h12v2H6z",
  palletConveyor: "M2 9h20v5H2zm2 2v1h16v-1zM4 16h3v4H4zm13 0h3v4h-3zM8 16h8v2H8z",
  synoptic: "M7 3v6a5 5 0 0 0 4 4.9V16a3 3 0 0 0 6 0v-1.2a3 3 0 1 0-2 0V16a1 1 0 0 1-2 0v-2.1A5 5 0 0 0 17 9V3h-2v6a3 3 0 0 1-6 0V3zm11 8.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z",
  zone: "M5 3h9l5 5v13H5zm2 2v14h10V9h-4V5zm2 5h6v2H9zm0 4h6v2H9z",
  device: "M11 3a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z",
  maintenance: "M9 3h6v3h2v15H7V6h2zm0 5v11h6V8zm2 2h2v7h-2z",
  profinet: "M10 3h4v4h-4zm1 4h2v3h-2zM5 12h14v2h-2v3h-2v-3H9v3H7v-3H5zm-2 5h4v4H3zm7 0h4v4h-4zm7 0h4v4h-4z",
  format: "M5 3h8l4 4v2.5l-2 2V8h-3V5H7v14h4v2H5zm12.4 8.6 2 2-5.4 5.4-2.6.6.6-2.6z",
  copy: "M8 3h7l4 4v10H8zm2 2v10h7V8h-3V5zM4 7h2v12h9v2H4z",
  palletStore: "M3 4h2v11h10v2H3zm13 4h3l3 4v4h-2.1a2 2 0 0 1-3.8 0h-1.2a2 2 0 0 1-3.8 0H10V8zm2 2v2h3.1L18 10z",
};

/** Scrive un valore come oggetto JS leggibile: chi apre `App.tsx` deve poter correggere una voce a
 * mano, non districare una riga di JSON. */
function literal(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(literal).join(", ")}]`;
  if (value && typeof value === "object") return `{ ${Object.entries(value).map(([key, item]) => `${key}: ${literal(item)}`).join(", ")} }`;
  return JSON.stringify(value);
}

const svgIcon = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}" /></svg>`;

function hmiRuntimeSource(): string {
  return `import { executeHmiScript, executeHmiScriptAsync, inspectHmiScriptProgram } from "./framecraftScriptRuntime";
import { hmiFlashingCss, hmiFlashingInlineStyle, resolveHmiFlashing, createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface } from "./framecraftHmiFlashing";
import { createHmiScriptContextManager } from "./framecraftScriptModules";
import { hmiAlarmMatches, nextHmiCalendarDue } from "./framecraftHmiSchedule";
import { createHmiTimerManager } from "./framecraftHmiTimers";
import { createHmiFaceplatePopupDomSurface, createHmiFaceplatePopupManager } from "./framecraftHmiPopups";
import { renderHmiFaceplates } from "./framecraftHmiFaceplateVisuals";
import { renderHmiTrendControls } from "./framecraftHmiTrend";
import { renderHmiFunctionTrendControls } from "./framecraftHmiFunctionTrend";
import { createHmiDataLogRuntime } from "./framecraftHmiDataLogs";
import scriptCatalogJson from "../framecraft.scripts.json";
import faceplateCatalogJson from "../framecraft.faceplates.json";
import dataLogCatalogJson from "../framecraft.logs.json";
import plcCatalogJson from "../framecraft.plc.json";
import runtimeCatalogJson from "../framecraft.runtime.json";
import { createHmiGatewayClient, HmiGatewayCommandError, type HmiGatewaySample, type HmiGatewaySnapshot } from "./framecraftGateway";
import type { ConnectionDiagnostic } from "./framecraftGateway";

type HmiEventType = "Activated" | "ContextTapped" | "Deactivated" | "Down" | "KeyDown" | "KeyUp" | "Loaded" | "Tapped" | "DoubleTapped" | "Up" | "Change" | "GestureDetected" | "Unloaded" | "HotKey" | "InterfaceEvent" | "Initialized" | "CommandFired";
type HmiGesture = "Unknown" | "SwipeRight" | "SwipeLeft" | "SwipeUp" | "SwipeDown";
interface ScriptProgram { version: 1; statements: unknown[] }
interface EventBinding { event: HmiEventType; script: string; program?: ScriptProgram }
interface FaceplateEventBinding { script: string; program?: ScriptProgram }
interface FaceplateInstanceBinding { typeId: string; version: string; eventBindings?: Record<string, FaceplateEventBinding> }
interface FaceplateLocalTag { name: string; dataType: string; startValue?: string }
interface FaceplateType { id: string; version: string; localTags?: FaceplateLocalTag[] }
interface DynamicBinding {
  property: string;
  kind: string;
  tag?: string;
  source?: string;
  triggers?: string[];
  cycleMs?: number;
  scriptTags?: { read?: string[]; written?: string[] };
  program?: ScriptProgram;
  color?: string;
  alternateColor?: string;
  flashingCondition?: "Never" | "Always" | "RangeViolation";
  flashingRate?: "Slow" | "Medium" | "Fast";
  minimum?: number;
  maximum?: number;
}
interface RuntimeOptions { navigate: (target: string) => void; trace?: (message: string) => void; error?: (message: string) => void }
export interface RuntimeAlarmNotification { alarmClass: string; state: string; priority: number; name?: string; text?: string }
interface ScheduledTask {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { kind: "interval"; intervalMs: number; startDelayMs?: number }
    | { kind: "once"; at: string }
    | { kind: "tag"; tag: string; condition: "changed" | "rising" | "falling" | "equals"; value?: string }
    | { kind: "calendar"; frequency: "daily" | "weekly" | "monthly" | "yearly"; time: string; weekDay?: number; day?: number; month?: number }
    | { kind: "alarm"; criterion: "class" | "state" | "priority"; condition: "equals" | "not-equals" | "greater" | "greater-or-equal" | "less" | "less-or-equal"; operand: string };
  program?: ScriptProgram;
}

const scriptCatalog = scriptCatalogJson as never;
const faceplateCatalog = faceplateCatalogJson as { types?: FaceplateType[] };
const scheduledTasks = ((scriptCatalogJson as { scheduledTasks?: ScheduledTask[] }).scheduledTasks ?? []).filter((task) => task && task.enabled);

const values: Record<string, string> = Object.create(null);
const tagStatus: Record<string, { qualityCode?: number; qualityKnown?: boolean; timeStamp?: string | number; lastError?: number; errorDescription?: string }> = Object.create(null);
const tagListeners = new Set<(tag: string, previous?: string) => void>();
const gatewayConfig = runtimeCatalogJson.gateway as { enabled: boolean; path: string; pollMs: number; timeoutMs?: number };
let gatewayClient: ReturnType<typeof createHmiGatewayClient> | undefined;
let gatewayReport: ((message: string) => void) | undefined;
let gatewaySnapshot: HmiGatewaySnapshot | undefined;
const faceplateLocalStates = new WeakMap<Element, { signature: string; names: Set<string>; values: Record<string, string> }>();
const dataLogRuntime = createHmiDataLogRuntime(dataLogCatalogJson, { onError: (message: string) => console.error(message) });

export function runtimeTagValues(): Readonly<Record<string, string>> { return values; }
export function runtimeTagStatus() { return tagStatus as Readonly<typeof tagStatus>; }
function updateRuntimeValue(tag: string, value: string | number | boolean, event: string) {
  const previous = values[tag];
  values[tag] = String(value);
  dataLogRuntime.updateTag(tag, values[tag], tagStatus[tag]);
  window.dispatchEvent(new CustomEvent(event, { detail: { tag, value: values[tag], status: tagStatus[tag] } }));
  for (const listener of tagListeners) listener(tag, previous);
}
export function applyRuntimeTagSample(sample: HmiGatewaySample) {
  tagStatus[sample.tag] = { qualityCode: sample.qualityCode, qualityKnown: sample.qualityCode !== undefined,
    timeStamp: sample.timestamp, lastError: sample.lastError ? 0x80040002 : 0, errorDescription: sample.errorDescription ?? "" };
  if (sample.value !== undefined) updateRuntimeValue(sample.tag, sample.value, "framecraft:tag-read");
  else for (const listener of tagListeners) listener(sample.tag, values[sample.tag]);
}
export async function requestRuntimeTagWrite(tag: string, value: string | number | boolean, signal?: AbortSignal) {
  if (!gatewayConfig.enabled) { updateRuntimeValue(tag, value, "framecraft:tag-write"); return { tag, outcome: "local", delivery: "local", plcConfirmed: false }; }
  try {
    if (!gatewayClient) throw new HmiGatewayCommandError("Gateway non disponibile; comando non accodato.", "rejected");
    const result = await gatewayClient.write(tag, value, signal);
    window.dispatchEvent(new CustomEvent("framecraft:command-result", { detail: result })); return result;
  } catch (error) {
    window.dispatchEvent(new CustomEvent("framecraft:command-result", { detail: { tag, outcome: error && typeof error === "object" && "outcome" in error ? error.outcome : "rejected", plcConfirmed: false, error: error instanceof Error ? error.message : String(error) } }));
    throw error;
  }
}
export function setRuntimeTagValue(tag: string, value: string | number | boolean) {
  void requestRuntimeTagWrite(tag, value).catch((error) => (gatewayReport ?? console.error)("[HMI COMANDO] " + (error instanceof Error ? error.message : String(error))));
}
function mergeScriptTagStatus(status: typeof tagStatus) {
  // In connettività reale soltanto l'acquisizione può cambiare qualità e valore PLC.
  if (!gatewayConfig.enabled) Object.assign(tagStatus, status);
}
function scriptWriteFailures(localTags?: Set<string>): Record<string, { code: number; description: string }> | undefined {
  if (!gatewayConfig.enabled) return undefined;
  return new Proxy(Object.create(null), { get: (_target, tag) => typeof tag === "string" && !localTags?.has(tag)
    ? { code: 0x80040002, description: "Una dinamizzazione sincrona non puo' attendere il gateway PLC; usa uno script evento asincrono." } : undefined });
}

function gatewayScriptTransport() {
  return {
    async read(request: { tag: string; mode: number; maxAge?: number }, signal: AbortSignal) {
      if (!gatewayClient) throw new HmiGatewayCommandError("Gateway non disponibile per la lettura.", "rejected");
      const sample = await gatewayClient.read(request.tag, { mode: request.mode, maxAge: request.maxAge, signal });
      return { value: sample.value!, status: { qualityCode: sample.qualityCode, qualityKnown: sample.qualityCode !== undefined, timeStamp: sample.timestamp, lastError: 0, errorDescription: "" } };
    },
    async write(request: { tag: string; value: string | number | boolean | null; mode: number; qcd?: boolean; operatorReason?: string }, signal: AbortSignal) {
      if (request.mode !== 0) throw new HmiGatewayCommandError("Il gateway non puo' attendere la conferma PLC; nessun comando inviato.", "rejected");
      if (request.qcd || request.operatorReason !== undefined) throw new HmiGatewayCommandError("Il gateway non supporta la scrittura QCD o i messaggi operatore con audit server; nessun comando inviato.", "rejected");
      if (request.value === null) throw new HmiGatewayCommandError("Il comando PLC richiede un valore scalare non nullo.", "rejected");
      return requestRuntimeTagWrite(request.tag, request.value, signal);
    },
  };
}

export function requestRuntimeDataLog(logId?: string, loggedTagId?: string) {
  return dataLogRuntime.request(logId, loggedTagId);
}

export function notifyRuntimeAlarm(alarm: RuntimeAlarmNotification) {
  window.dispatchEvent(new CustomEvent("framecraft:alarm-state", { detail: alarm }));
}

function bindings(element: Element): EventBinding[] {
  try {
    const parsed = JSON.parse(element.getAttribute("data-hmi-events") || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is EventBinding => Boolean(item && typeof item === "object" && "event" in item && "script" in item)) : [];
  } catch { return []; }
}

function faceplateBinding(element: Element): FaceplateInstanceBinding | undefined {
  try {
    const parsed = JSON.parse(element.getAttribute("data-hmi-faceplate") || "null") as unknown;
    if (!parsed || typeof parsed !== "object" || !("typeId" in parsed) || !("version" in parsed)) return undefined;
    return parsed as FaceplateInstanceBinding;
  } catch { return undefined; }
}

function faceplateLocalState(element: Element) {
  const instance = faceplateBinding(element);
  const type = instance && faceplateCatalog.types?.find((candidate) => candidate.id === instance.typeId && candidate.version === instance.version);
  const tags = type?.localTags ?? [];
  if (!tags.length) return undefined;
  const signature = type!.id + "@" + type!.version + ":" + tags.map((tag) => tag.name + "=" + (tag.startValue ?? "")).join("|");
  const current = faceplateLocalStates.get(element);
  if (current?.signature === signature) return current;
  const state = {
    signature,
    names: new Set(tags.map((tag) => tag.name)),
    values: Object.fromEntries(tags.map((tag) => [tag.name, tag.startValue ?? (/bool/i.test(tag.dataType) ? "false" : /string/i.test(tag.dataType) ? "" : "0")])),
  };
  faceplateLocalStates.set(element, state);
  return state;
}

function renderFaceplateVisuals() {
  renderHmiFaceplates(document, faceplateCatalog as never, values, { localValues: (host: Element) => faceplateLocalState(host)?.values });
}

function renderTrendControls() {
  const sources = { tags: plcCatalogJson.variables.map((variable: { name: string }) => variable.name), logs: dataLogCatalogJson.logs };
  renderHmiTrendControls(document, values, { status: tagStatus, sources, history: (trend, from, to) => trend.logId && trend.loggedTagId
    ? dataLogRuntime.query(trend.logId, trend.loggedTagId, from, to).flatMap((sample: { time: number; value: string; qualityCode?: number }) => {
      const value = Number(sample.value);
      return sample.value.trim() && Number.isFinite(value) ? [{ time: sample.time, value, qualityCode: sample.qualityCode }] : [];
    })
    : [] });
  renderHmiFunctionTrendControls(document, values, { status: tagStatus, sources, history: (source, from, to) => source.logId && source.loggedTagId
    ? dataLogRuntime.query(source.logId, source.loggedTagId, from, to) : [] });
}

function dynamizations(element: Element): DynamicBinding[] {
  try {
    const parsed = JSON.parse(element.getAttribute("data-hmi-dynamizations") || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is DynamicBinding => Boolean(item && typeof item === "object" && "property" in item && "kind" in item)) : [];
  } catch { return []; }
}

function runtimeTruthy(value: string): boolean {
  return !/^(?:|0|false|no|off)$/i.test(value.trim());
}

function runtimeColor(value: string): string {
  const hex = value.replace("#", "");
  if (!/^[0-9a-f]{8}$/i.test(hex)) return value;
  const alpha = Number.parseInt(hex.slice(0, 2), 16);
  const red = Number.parseInt(hex.slice(2, 4), 16);
  const green = Number.parseInt(hex.slice(4, 6), 16);
  const blue = Number.parseInt(hex.slice(6, 8), 16);
  return alpha === 255 ? "#" + hex.slice(2) : "rgba(" + red + ", " + green + ", " + blue + ", " + Number((alpha / 255).toFixed(3)) + ")";
}

function applyDynamicValue(element: Element, property: string, value: string): boolean {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
  const style = (element as HTMLElement | SVGElement).style;
  const number = Number(value);
  if (["Left", "Top", "Width", "Height", "BorderWidth"].includes(property)) {
    if (!Number.isFinite(number)) return false;
    const cssProperty = ({ Left: "left", Top: "top", Width: "width", Height: "height", BorderWidth: "borderWidth" } as const)[property as "Left"];
    (style as unknown as Record<string, string>)[cssProperty] = number + "px";
    if (property === "BorderWidth") style.borderStyle = "solid";
    return true;
  }
  if (property === "Opacity") { if (!Number.isFinite(number)) return false; style.opacity = String(number > 1 ? number / 100 : number); return true; }
  if (property === "Visible") { style.visibility = runtimeTruthy(value) ? "visible" : "hidden"; return true; }
  if (property === "BackColor") { style.backgroundColor = runtimeColor(value); return true; }
  if (property === "ForeColor") { style.color = runtimeColor(value); return true; }
  if (property === "BorderColor") { style.borderColor = runtimeColor(value); return true; }
  if (property === "RotationAngle") { if (!Number.isFinite(number)) return false; style.rotate = number + "deg"; return true; }
  if (property === "Enabled") { style.pointerEvents = runtimeTruthy(value) ? "auto" : "none"; style.filter = runtimeTruthy(value) ? "none" : "grayscale(1)"; return true; }
  if (property === "Text" || property === "ProcessValue") {
    if (element.childElementCount) return false;
    if (element.textContent !== value) element.textContent = value;
    return true;
  }
  if (property === "Graphic") {
    if (element instanceof HTMLImageElement) element.src = value;
    else style.backgroundImage = 'url("' + value.replaceAll('"', '\\"') + '")';
    return true;
  }
  if (property === "Url" && (element instanceof HTMLIFrameElement || element instanceof HTMLImageElement)) { element.src = value; return true; }
  return false;
}

export function installFramecraftHmiRuntime(options: RuntimeOptions): () => void {
  if ((window as Window & { __framecraftEditorPreview?: boolean }).__framecraftEditorPreview) return () => undefined;
  let runtimeActive = true;
  const scriptAbort = new AbortController();
  const scriptOptions = (local?: { names: ReadonlySet<string>; values: Record<string, string> }) => ({
    ...(gatewayConfig.enabled ? { transport: gatewayScriptTransport() } : {}), signal: scriptAbort.signal,
    isActive: () => runtimeActive, localTags: local?.names, localTagValues: local?.values,
  });
  const scriptContexts = createHmiScriptContextManager();
  let scriptPage: string | undefined;
  const retiredScriptScreens = new Set<() => void>();
  const eventContexts = new WeakMap<Element, ReturnType<typeof scriptContexts.options>>();
  const scriptDependencies = new Map<string, string[]>();
  const loaded = new Set<Element>();
  const reported = new WeakMap<Element, Set<string>>();
  const cycleTimers = new Map<number, ReturnType<typeof setInterval>>();
  const scheduledIntervals = new Set<ReturnType<typeof setInterval>>();
  const scheduledTimeouts = new Set<ReturnType<typeof setTimeout>>();
  const screenItemIds = new WeakMap<Element, string>();
  let nextScreenItemId = 0;
  const screenItemId = (element: Element) => { if (!screenItemIds.has(element)) screenItemIds.set(element, "runtime-item-" + ++nextScreenItemId); return screenItemIds.get(element)!; };
  const propertyFlashingSurface = createHmiPropertyFlashingDomSurface(document, screenItemId);
  const propertyFlashing = createHmiPropertyFlashing({ items: () => propertyFlashingSurface.items(), apply: (commands) => propertyFlashingSurface.apply(commands), applyProperties: (commands) => propertyFlashingSurface.applyProperties(commands), report: (message) => (options.error ?? console.error)("[HMI oggetti] " + message) });
  const renderRuntimeFaceplates = () => { propertyFlashingSurface.suspend(); try { renderFaceplateVisuals(); } finally { propertyFlashingSurface.resume(); } };
  const flashingStyle = document.createElement("style");
  flashingStyle.dataset.framecraftHmiFlashing = "";
  flashingStyle.textContent = hmiFlashingCss;
  (document.head || document.documentElement).appendChild(flashingStyle);
  let popupManager: ReturnType<typeof createHmiFaceplatePopupManager>;
  const popupSurface = createHmiFaceplatePopupDomSurface((reference) => popupManager.close(reference));
  popupManager = createHmiFaceplatePopupManager(popupSurface);
  const navigateTarget = (target: string) => { propertyFlashing.reset(); popupManager.closeParentBound("screen"); options.navigate(target); };
  const pendingTags = new Set<string>();
  const pendingCycles = new Set<number>();
  let refreshAll = false;
  let refreshing = false;
  let gestureStart: { pointerId: number; target: EventTarget | null; x: number; y: number; time: number } | null = null;
  const reportOnce = (element: Element, key: string, message: string) => {
    const messages = reported.get(element) ?? new Set<string>();
    if (messages.has(key)) return;
    messages.add(key); reported.set(element, messages);
    (options.error ?? console.error)(message);
  };
  const executeFlashing = (element: Element, items: DynamicBinding[]) => {
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) return;
    const visuals = [];
    for (const item of items) {
      const result = resolveHmiFlashing(item, values);
      if ("reason" in result) reportOnce(element, item.property + ":flashing:" + result.reason, "[HMI lampeggio " + item.property + "] " + result.reason);
      else if (result.active) visuals.push(result.visual);
    }
    propertyFlashingSurface.setDeclarative(element, visuals);
  };
  const executeDynamic = (element: Element, item: DynamicBinding) => {
    if (item.kind !== "Script") return;
    if (!item.program || item.program.version !== 1 || !Array.isArray(item.program.statements)) {
      reportOnce(element, item.property + ":compile", "[HMI dinamica " + item.property + "] script non compilato: salvalo da Framecraft.");
      return;
    }
    const result = executeHmiScript(item.program as never, values, { tagStatus, writeFailures: scriptWriteFailures(), ...scriptContexts.options(scriptCatalog, window.location.pathname, "dynamizations"), timerManager, popupManager, screenItems: propertyFlashing.context(screenItemId(element)) });
    mergeScriptTagStatus(result.tagStatus);
    for (const message of result.traces) (options.trace ?? console.info)("[HMI dinamica " + item.property + "] " + message);
    for (const message of result.operatorMessages) (options.trace ?? console.info)("[HMI OPERATORE] " + message.tag + ": " + message.oldValue + " -> " + message.newValue + " · " + message.reason);
    if (result.error) {
      reportOnce(element, item.property + ":" + result.error, "[HMI dinamica " + item.property + "] " + result.error);
      return;
    }
    for (const [tag, value] of Object.entries(result.writes)) setRuntimeTagValue(tag, value);
    for (const target of result.navigation) navigateTarget(target);
    if (!("returned" in result)) {
      reportOnce(element, item.property + ":return", "[HMI dinamica " + item.property + "] lo script non ha restituito un valore.");
      return;
    }
    if (!applyDynamicValue(element, item.property, String(result.returned ?? ""))) {
      reportOnce(element, item.property + ":property", "[HMI dinamica " + item.property + "] valore non applicabile all'elemento.");
    }
  };
  const requestRefresh = (tag?: string, cycleMs?: number) => {
    if (tag) pendingTags.add(tag);
    else if (cycleMs) pendingCycles.add(cycleMs);
    else refreshAll = true;
    if (refreshing) return;
    refreshing = true;
    propertyFlashingSurface.suspend();
    let passes = 0;
    try {
    while ((refreshAll || pendingTags.size || pendingCycles.size) && passes < 8) {
      passes += 1;
      const all = refreshAll;
      const tags = new Set(pendingTags);
      const cycles = new Set(pendingCycles);
      refreshAll = false; pendingTags.clear(); pendingCycles.clear();
      for (const element of document.querySelectorAll("[data-hmi-dynamizations]")) {
        const items = dynamizations(element);
        const flashing = items.filter((item) => item.kind === "Flashing");
        if (flashing.length && (all || flashing.some((item) => item.tag && tags.has(item.tag)))) executeFlashing(element, flashing);
        for (const item of items) {
          if (item.kind === "Flashing") continue;
          let triggers = item.triggers?.length ? item.triggers : item.scriptTags?.read ?? [];
          if (!item.triggers?.length && item.kind === "Script" && item.program) {
            const key = window.location.pathname + ":" + JSON.stringify(item.program);
            let reads = scriptDependencies.get(key);
            if (!reads) {
              const context = scriptContexts.options(scriptCatalog, window.location.pathname, "dynamizations");
              const inspected = inspectHmiScriptProgram(item.program as never, context.functions, context.globalScope?.initializer, [], context.variables);
              if (inspected.error) reportOnce(element, "script-dependencies:" + item.property, "[HMI dinamiche] " + inspected.error);
              reads = inspected.tagsRead;
              scriptDependencies.set(key, reads);
            }
            triggers = [...new Set([...triggers, ...reads])];
          }
          const selected = all || (item.cycleMs != null && cycles.has(Math.max(20, Math.round(item.cycleMs)))) || triggers.some((trigger) => tags.has(trigger));
          if (selected) executeDynamic(element, item);
        }
      }
    }
    if (refreshAll || pendingTags.size || pendingCycles.size) {
      refreshAll = false; pendingTags.clear(); pendingCycles.clear();
      (options.error ?? console.error)("[HMI dinamiche] aggiornamento interrotto: possibile ciclo fra trigger e scritture.");
    }
    renderRuntimeFaceplates();
    } finally { propertyFlashingSurface.resume(); refreshing = false; }
  };
  const syncCycles = () => {
    const wanted = new Set<number>();
    for (const element of document.querySelectorAll("[data-hmi-dynamizations]")) {
      for (const item of dynamizations(element)) if (item.kind === "Script" && item.cycleMs) wanted.add(Math.max(20, Math.round(item.cycleMs)));
    }
    for (const [cycle, timer] of cycleTimers) if (!wanted.has(cycle)) { clearInterval(timer); cycleTimers.delete(cycle); }
    for (const cycle of wanted) if (!cycleTimers.has(cycle)) cycleTimers.set(cycle, setInterval(() => requestRefresh(undefined, cycle), cycle));
  };
  let eventQueue = Promise.resolve();
  const prepareScriptContexts = () => {
    const page = window.location.pathname;
    if (scriptPage === page) return;
    if (scriptPage !== undefined) {
      const retire = scriptContexts.detachScreen(scriptPage);
      retiredScriptScreens.add(retire);
      const finish = () => { retire(); retiredScriptScreens.delete(retire); };
      void eventQueue.then(finish, finish);
    }
    scriptPage = page;
    scriptDependencies.clear();
    if (!gatewayConfig.enabled) for (const context of ["events", "dynamizations"] as const) for (const error of scriptContexts.initialize(scriptCatalog, page, context, values, { tagStatus })) (options.error ?? console.error)("[HMI SCRIPT " + context + "] " + error);
  };
  const timerManager = createHmiTimerManager((callback, timer, context) => {
    eventQueue = eventQueue.then(async () => {
      if (!runtimeActive || context?.isActive && !context.isActive()) return;
      const program = callback.kind === "inline" ? callback.program : { version: 1, statements: [{ kind: "module-call", call: callback.call }] };
      const result = await executeHmiScriptAsync(program as never, { ...values, ...context?.localTagValues }, { tagStatus, ...scriptOptions(), ...(context ?? scriptContexts.options(scriptCatalog, window.location.pathname, "events")), timerManager, popupManager, screenItems: context?.screenItems ?? propertyFlashing.context() });
      if (!runtimeActive || context?.isActive && !context.isActive()) return;
      mergeScriptTagStatus(result.tagStatus);
      for (const message of result.traces) (options.trace ?? console.info)("[HMI TIMER " + timer.id + "] " + message);
      for (const message of result.operatorMessages) (options.trace ?? console.info)("[HMI OPERATORE] " + message.tag + ": " + message.oldValue + " -> " + message.newValue + " · " + message.reason);
      if (result.error) (options.error ?? console.error)("[HMI TIMER " + timer.id + "] " + result.error);
      for (const [tag, value] of Object.entries(result.writes)) {
        if (context?.localTags?.has(tag) && context.localTagValues) context.localTagValues[tag] = value;
        else setRuntimeTagValue(tag, value);
      }
      renderRuntimeFaceplates();
      for (const target of result.navigation) navigateTarget(target);
    }).catch((error) => (options.error ?? console.error)("[HMI TIMER " + timer.id + "] " + (error instanceof Error ? error.message : String(error))));
  }, (error, timer) => (options.error ?? console.error)("[HMI TIMER " + timer.id + "] " + (error instanceof Error ? error.message : String(error))));
  const executeScheduledTask = async (task: ScheduledTask, cause: "interval" | "once" | "tag" | "calendar" | "alarm", alarm?: RuntimeAlarmNotification) => {
    if (!runtimeActive) return;
    if (!task.program || task.program.version !== 1 || !Array.isArray(task.program.statements)) {
      (options.error ?? console.error)("[HMI TASK " + task.name + "] script non compilato: salvalo da Framecraft.");
      return;
    }
    const result = await executeHmiScriptAsync(task.program as never, values, { tagStatus, ...scriptOptions(), ...scriptContexts.options(scriptCatalog, undefined, "scheduler"), locals: { taskId: task.id, scheduledAt: Date.now(), trigger: cause, ...(alarm ? { alarmClass: alarm.alarmClass, alarmState: alarm.state, alarmPriority: alarm.priority, alarmName: alarm.name ?? "", alarmText: alarm.text ?? "" } : {}) }, timerManager, popupManager, screenItems: propertyFlashing.context() });
    if (!runtimeActive) return;
    mergeScriptTagStatus(result.tagStatus);
    for (const message of result.traces) (options.trace ?? console.info)("[HMI TASK " + task.name + "] " + message);
    for (const message of result.operatorMessages) (options.trace ?? console.info)("[HMI OPERATORE] " + message.tag + ": " + message.oldValue + " -> " + message.newValue + " · " + message.reason);
    if (result.error) (options.error ?? console.error)("[HMI TASK " + task.name + "] " + result.error);
    for (const [tag, value] of Object.entries(result.writes)) setRuntimeTagValue(tag, value);
    for (const target of result.navigation) navigateTarget(target);
  };
  const queueScheduledTask = (task: ScheduledTask, cause: "interval" | "once" | "tag" | "calendar" | "alarm", alarm?: RuntimeAlarmNotification) => {
    eventQueue = eventQueue.then(() => executeScheduledTask(task, cause, alarm)).catch((error) => {
      (options.error ?? console.error)("[HMI TASK " + task.name + "] " + (error instanceof Error ? error.message : String(error)));
    });
  };
  const tagTriggerMatches = (task: ScheduledTask, previous: string | undefined, next: string) => {
    if (task.trigger.kind !== "tag" || previous === next) return false;
    if (task.trigger.condition === "changed") return true;
    if (task.trigger.condition === "rising") return !runtimeTruthy(previous ?? "") && runtimeTruthy(next);
    if (task.trigger.condition === "falling") return runtimeTruthy(previous ?? "") && !runtimeTruthy(next);
    return next === (task.trigger.value ?? "");
  };
  const installScheduledTasks = () => {
    const scheduleAt = (due: number, fire: () => void) => {
      const arm = () => {
        const delay = due - Date.now();
        if (delay <= 0) { fire(); return; }
        const timer = setTimeout(arm, Math.min(delay, 0x7fffffff));
        scheduledTimeouts.add(timer);
      };
      arm();
    };
    const scheduleCalendar = (task: ScheduledTask & { trigger: Extract<ScheduledTask["trigger"], { kind: "calendar" }> }, after: number, includeAfter: boolean) => {
      const due = nextHmiCalendarDue(task.trigger, after, includeAfter);
      if (due === undefined) { (options.error ?? console.error)("[HMI TASK " + task.name + "] ricorrenza calendario non valida."); return; }
      scheduleAt(due, () => {
        queueScheduledTask(task, "calendar");
        scheduleCalendar(task, Math.max(due, Date.now()), false);
      });
    };
    for (const task of scheduledTasks) {
      if (task.trigger.kind === "interval") {
        const interval = Math.max(1, Math.round(task.trigger.intervalMs));
        const start = Math.max(0, Math.round(task.trigger.startDelayMs ?? interval));
        const begin = () => {
          queueScheduledTask(task, "interval");
          const timer = setInterval(() => queueScheduledTask(task, "interval"), interval);
          scheduledIntervals.add(timer);
        };
        const timer = setTimeout(begin, start);
        scheduledTimeouts.add(timer);
      } else if (task.trigger.kind === "once") {
        const due = Date.parse(task.trigger.at);
        if (!Number.isFinite(due)) { (options.error ?? console.error)("[HMI TASK " + task.name + "] data e ora non valide."); continue; }
        scheduleAt(due, () => queueScheduledTask(task, "once"));
      } else if (task.trigger.kind === "calendar") {
        scheduleCalendar(task as ScheduledTask & { trigger: Extract<ScheduledTask["trigger"], { kind: "calendar" }> }, Date.now(), true);
      }
    }
  };
  const dispatchFaceplateEvents = (element: Element, emitted: unknown) => {
    if (!Array.isArray(emitted)) return;
    for (const item of emitted) {
      if (!item || typeof item !== "object" || !("name" in item) || typeof item.name !== "string") continue;
      element.dispatchEvent(new CustomEvent("framecraft:faceplate-event", { bubbles: true, detail: { name: item.name, parameters: "parameters" in item && item.parameters && typeof item.parameters === "object" ? item.parameters : {} } }));
    }
  };
  const applyEventResult = (label: string, result: Awaited<ReturnType<typeof executeHmiScriptAsync>>, local?: { names: ReadonlySet<string>; values: Record<string, string> }) => {
    mergeScriptTagStatus(result.tagStatus);
    for (const message of result.traces) (options.trace ?? console.info)("[HMI " + label + "] " + message);
    for (const message of result.operatorMessages) (options.trace ?? console.info)("[HMI OPERATORE] " + message.tag + ": " + message.oldValue + " -> " + message.newValue + " · " + message.reason);
    if (result.error) (options.error ?? console.error)("[HMI " + label + "] " + result.error);
    for (const [tag, value] of Object.entries(result.writes)) {
      if (local?.names.has(tag)) local.values[tag] = value;
      else setRuntimeTagValue(tag, value);
    }
    renderRuntimeFaceplates();
    for (const target of result.navigation) navigateTarget(target);
  };
  const executeEvent = async (element: Element | null, eventType: HmiEventType, context: { gesture?: HmiGesture; key?: string; command?: string; interfaceEvent?: string } = {}, scriptContext = scriptContexts.options(scriptCatalog, window.location.pathname, "events"), sourcePage = window.location.pathname) => {
    if (!element || !runtimeActive) return;
    if (!propertyFlashingSurface.allowsReactions(element)) return;
    if (!["Initialized", "Loaded", "Unloaded"].includes(eventType) && !propertyFlashingSurface.allowsInteraction(element)) return;
    for (const binding of bindings(element).filter((item) => item.event === eventType)) {
      if (!binding.program || binding.program.version !== 1 || !Array.isArray(binding.program.statements)) {
        (options.error ?? console.error)(\`[HMI \${eventType}] script non compilato: salvalo da Framecraft.\`);
        continue;
      }
      const locals = { ...(context.gesture ? { gesture: context.gesture } : {}), ...(context.key ? { key: context.key } : {}), ...(context.command ? { command: context.command } : {}), ...(context.interfaceEvent ? { interfaceEvent: context.interfaceEvent } : {}) };
      const owner = element.closest("[data-hmi-faceplate]");
      const local = owner ? faceplateLocalState(owner) : undefined;
      const isActive = () => runtimeActive && propertyFlashingSurface.allowsReactions(element) && (eventType === "Unloaded" || element.isConnected && sourcePage === window.location.pathname);
      const result = await executeHmiScriptAsync(binding.program as never, { ...values, ...(local?.values ?? {}) }, { locals: Object.keys(locals).length ? locals : undefined, tagStatus, ...scriptOptions(local), ...scriptContext, isActive, timerManager, popupManager, screenItems: propertyFlashing.context(screenItemId(element)) });
      if (!isActive()) return;
      applyEventResult(eventType, result, local);
      dispatchFaceplateEvents(element, result.faceplateEvents);
    }
  };
  const executeFaceplateEvent = async (element: Element, name: string, parameters: Record<string, string | number | boolean | null>) => {
    if (!runtimeActive || !propertyFlashingSurface.allowsInteraction(element)) return;
    const handler = faceplateBinding(element)?.eventBindings?.[name];
    if (!handler) return;
    if (!handler.program || handler.program.version !== 1 || !Array.isArray(handler.program.statements)) {
      (options.error ?? console.error)("[HMI FACEPLATE " + name + "] script non compilato: salvalo da Framecraft.");
      return;
    }
    const sourcePage = window.location.pathname;
    const isActive = () => runtimeActive && propertyFlashingSurface.allowsReactions(element) && element.isConnected && sourcePage === window.location.pathname;
    const result = await executeHmiScriptAsync(handler.program as never, values, { locals: { ...parameters, interfaceEvent: name }, tagStatus, ...scriptOptions(), ...(eventContexts.get(element) ?? scriptContexts.options(scriptCatalog, window.location.pathname, "events")), isActive, timerManager, popupManager, screenItems: propertyFlashing.context(screenItemId(element)) });
    if (!isActive()) return;
    applyEventResult("FACEPLATE " + name, result);
    dispatchFaceplateEvents(element.parentElement ?? element, result.faceplateEvents);
  };
  const run = (element: Element | null, eventType: HmiEventType, context: { gesture?: HmiGesture; key?: string; command?: string; interfaceEvent?: string } = {}) => {
    if (!runtimeActive) return;
    const scriptContext = element && eventContexts.get(element) || scriptContexts.options(scriptCatalog, window.location.pathname, "events");
    const sourcePage = window.location.pathname;
    eventQueue = eventQueue.then(() => executeEvent(element, eventType, context, scriptContext, sourcePage)).catch((error) => {
      (options.error ?? console.error)(\`[HMI \${eventType}] \${error instanceof Error ? error.message : String(error)}\`);
    });
  };
  const target = (event: Event) => event.target instanceof Element ? event.target.closest("[data-hmi-events]") : null;
  const down = (event: Event) => run(target(event), "Down");
  const up = (event: Event) => run(target(event), "Up");
  const tapped = (event: Event) => run(target(event), "Tapped");
  const doubleTapped = (event: Event) => run(target(event), "DoubleTapped");
  const changed = (event: Event) => run(target(event), "Change");
  const activated = (event: Event) => run(target(event), "Activated");
  const deactivated = (event: Event) => run(target(event), "Deactivated");
  const contextTapped = (event: Event) => run(target(event), "ContextTapped");
  const keyDown = (event: KeyboardEvent) => { const owner = target(event); run(owner, "KeyDown", { key: event.key }); run(owner, "HotKey", { key: event.key }); };
  const keyUp = (event: KeyboardEvent) => run(target(event), "KeyUp", { key: event.key });
  const interfaceEvent = (event: Event) => { const detail = (event as CustomEvent<unknown>).detail; run(target(event), "InterfaceEvent", { interfaceEvent: typeof detail === "string" ? detail : "InterfaceEvent" }); };
  const faceplateEvent = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const owner = event.target.closest("[data-hmi-faceplate]");
    const detail = (event as CustomEvent<unknown>).detail;
    if (!owner || !detail || typeof detail !== "object") return;
    const item = detail as { name?: unknown; parameters?: unknown };
    if (typeof item.name !== "string" || !item.name.trim()) return;
    const parameters = item.parameters && typeof item.parameters === "object" && !Array.isArray(item.parameters)
      ? Object.fromEntries(Object.entries(item.parameters).filter((entry): entry is [string, string | number | boolean | null] => entry[1] === null || ["string", "number", "boolean"].includes(typeof entry[1])))
      : {};
    eventQueue = eventQueue.then(() => executeFaceplateEvent(owner, item.name as string, parameters)).catch((error) => (options.error ?? console.error)("[HMI FACEPLATE " + String(item.name) + "] " + (error instanceof Error ? error.message : String(error))));
  };
  const commandFired = (event: Event) => { const detail = (event as CustomEvent<unknown>).detail; run(target(event), "CommandFired", { command: typeof detail === "string" ? detail : "Command" }); };
  const gestureFrom = (start: NonNullable<typeof gestureStart>, event: PointerEvent): HmiGesture | null => {
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Date.now() - start.time > 1200 || Math.max(Math.abs(dx), Math.abs(dy)) < 40) return null;
    return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "SwipeLeft" : "SwipeRight") : (dy < 0 ? "SwipeUp" : "SwipeDown");
  };
  const gestureDown = (event: PointerEvent) => {
    if (event.pointerType === "touch" && event.isPrimary !== false) gestureStart = { pointerId: event.pointerId, target: event.target, x: event.clientX, y: event.clientY, time: Date.now() };
  };
  const finishGesture = (event: PointerEvent, cancelled = false) => {
    const start = gestureStart;
    if (!start || start.pointerId !== event.pointerId) return;
    gestureStart = null;
    if (cancelled) return;
    const gesture = gestureFrom(start, event);
    if (!gesture) return;
    const direction = gesture.slice(5).toLowerCase();
    const attribute = "data-hmi-swipe-" + direction;
    const origin = start.target instanceof Element ? start.target : null;
    const navigationOwner = origin?.closest("[" + attribute + "]") || document.querySelector("[" + attribute + "]");
    const targetScreen = navigationOwner?.getAttribute(attribute);
    if (targetScreen) navigateTarget(targetScreen);
    const eventOwner = origin?.closest("[data-hmi-events]")
      || [...document.querySelectorAll("[data-hmi-events]")].find((element) => bindings(element).some((item) => item.event === "GestureDetected"));
    run(eventOwner ?? null, "GestureDetected", { gesture });
  };
  const gestureUp = (event: PointerEvent) => finishGesture(event);
  const gestureCancel = (event: PointerEvent) => finishGesture(event, true);
  const navigate = (event: Event) => { const route = (event as CustomEvent<string>).detail; if (typeof route === "string") navigateTarget(route); };
  const scanLoaded = () => {
    const pageChanged = scriptPage !== undefined && scriptPage !== window.location.pathname;
    for (const element of [...loaded]) {
      if (element.isConnected && !pageChanged) continue;
      run(element, "Unloaded"); loaded.delete(element);
    }
    prepareScriptContexts();
    for (const element of document.querySelectorAll("[data-hmi-events]")) {
      if (loaded.has(element)) continue;
      loaded.add(element);
      eventContexts.set(element, scriptContexts.options(scriptCatalog, window.location.pathname, "events"));
      run(element, "Initialized");
      run(element, "Loaded");
    }
  };
  const tagChanged = (tag: string, previous?: string) => {
    requestRefresh(tag);
    for (const task of scheduledTasks) if (task.trigger.kind === "tag" && task.trigger.tag === tag && tagTriggerMatches(task, previous, values[tag])) queueScheduledTask(task, "tag");
  };
  const alarmChanged = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object") { (options.error ?? console.error)("[HMI ALARM] notifica non valida."); return; }
    const raw = detail as Partial<RuntimeAlarmNotification>;
    const priority = Number(raw.priority);
    if (typeof raw.alarmClass !== "string" || typeof raw.state !== "string" || !Number.isFinite(priority)) { (options.error ?? console.error)("[HMI ALARM] classe, stato o priorita' non validi."); return; }
    const alarm: RuntimeAlarmNotification = { alarmClass: raw.alarmClass, state: raw.state, priority, ...(typeof raw.name === "string" ? { name: raw.name } : {}), ...(typeof raw.text === "string" ? { text: raw.text } : {}) };
    for (const task of scheduledTasks) if (task.trigger.kind === "alarm" && hmiAlarmMatches(task.trigger, alarm)) queueScheduledTask(task, "alarm", alarm);
  };
  const requestDataLog = (event: Event) => {
    const detail = (event as CustomEvent<{ logId?: string; loggedTagId?: string }>).detail;
    dataLogRuntime.request(detail?.logId, detail?.loggedTagId);
  };
  const commandResult = (event: Event) => {
    const result = (event as CustomEvent<{ tag?: string; outcome?: string; error?: string }>).detail;
    const host = document.querySelector<HTMLElement>("[data-framecraft-command-status]");
    if (!host || !result) return;
    host.hidden = false; host.dataset.outcome = result.outcome;
    const label = host.querySelector("span");
    if (label) label.textContent = (result.tag ? result.tag + ": " : "") + (result.outcome === "delivered" ? "Comando inoltrato al broker, non confermato dal PLC." : result.error ?? "Esito comando non disponibile.");
  };
  window.addEventListener("framecraft:command-result", commandResult);
  tagListeners.add(tagChanged);
  gatewayReport = options.error ?? console.error;
  const recentDiagnostics: ConnectionDiagnostic[] = [];
  const renderGatewayStatus = (state: string) => {
    const connected = gatewaySnapshot?.connections.filter((connection) => connection.state === "connected").length ?? 0;
    const total = gatewaySnapshot?.connections.length ?? 0;
    const invalid = gatewaySnapshot?.samples.filter((sample) => sample.lastError || sample.qualityCode !== undefined && (sample.qualityCode & 0xc0) === 0).length ?? 0;
    const label = !gatewayConfig.enabled ? "PLC: da configurare" : state !== "connected" ? "Gateway non collegato" : !total ? "Nessuna connessione" : "PLC " + connected + "/" + total + (invalid ? " · tag Bad" : "");
    for (const element of document.querySelectorAll<HTMLElement>("[data-framecraft-gateway-status]")) {
      if (element.textContent !== label) element.textContent = label;
      element.title = "Apri lo stato PLC per diagnostica e guida. Stato del trasporto MQTT/OPC UA, non conferma di esecuzione PLC.";
    }
    for (const element of document.querySelectorAll<HTMLElement>(".hmi-plc-bar i")) {
      element.style.width = total && state === "connected" ? String(connected / total * 100) + "%" : "0%";
    }
    for (const element of document.querySelectorAll<HTMLElement>("[data-framecraft-plc-summary]")) {
      const text = !gatewayConfig.enabled ? "Collegamento disabilitato. Configura Pannello → Connessioni PLC e avvia il servizio Node; salvare non apre la rete." : state !== "connected" ? "Il pannello non raggiunge il gateway. Controlla servizio, porta e proxy; i valori non sono aggiornati e i comandi non vengono accodati." : connected + "/" + total + " connessioni disponibili. " + invalid + " tag non validi. Connesso non equivale a qualità Good o esecuzione PLC.";
      if (element.textContent !== text) element.textContent = text;
    }
    for (const list of document.querySelectorAll<HTMLElement>("[data-framecraft-plc-connections]")) {
      const signature = JSON.stringify(gatewaySnapshot?.connections ?? []);
      if (list.dataset.signature === signature) continue; list.dataset.signature = signature;
      const names: Record<string, string> = { connected: "Connessa", connecting: "Collegamento in corso", reconnecting: "Riconnessione in corso", error: "Da controllare", stopped: "Arrestata" };
      list.replaceChildren(...(gatewaySnapshot?.connections ?? []).map((connection) => {
        const item = document.createElement("p"), title = document.createElement("strong");
        title.textContent = connection.id + " · " + (names[connection.state] ?? connection.state); item.append(title);
        if (connection.diagnostic) { const detail = document.createElement("span"); detail.textContent = connection.diagnostic.message + " Come risolvere: " + connection.diagnostic.action; item.append(detail); }
        return item;
      }));
    }
    for (const list of document.querySelectorAll<HTMLElement>("[data-framecraft-plc-events]")) {
      const events = recentDiagnostics.slice(-10).reverse(), signature = JSON.stringify(events);
      if (list.dataset.signature === signature) continue; list.dataset.signature = signature;
      list.replaceChildren(...events.map((event) => {
        const item = document.createElement("li"), title = document.createElement("strong"), detail = document.createElement("p"), action = document.createElement("p"), code = document.createElement("small");
        item.dataset.level = event.level;
        title.textContent = [event.connectionId, event.tag, event.title].filter(Boolean).join(" · ");
        detail.textContent = event.message + " " + event.impact; action.textContent = "Come risolvere: " + event.action;
        code.textContent = new Date(event.timestamp).toLocaleTimeString() + " · " + event.code + (event.technicalCode ? " / " + event.technicalCode : "") + (event.occurrences && event.occurrences > 1 ? " · " + event.occurrences + " eventi uguali" : "");
        item.append(title, detail, action, code); return item;
      }));
      if (!events.length) { const empty = document.createElement("li"); empty.textContent = "Nessun evento ricevuto. Controlla anche i log del servizio se non è avviato o non è raggiungibile."; list.append(empty); }
    }
  };
  if (gatewayConfig.enabled) {
    const unavailable = () => {
      for (const tag of plcCatalogJson.variables.map((variable: { name: string }) => variable.name)) {
        tagStatus[tag] = { ...tagStatus[tag], qualityCode: 0, qualityKnown: true, lastError: 0x80040002, errorDescription: "Gateway non collegato." };
        for (const listener of tagListeners) listener(tag, values[tag]);
      }
    };
    unavailable();
    gatewayClient = createHmiGatewayClient({ path: gatewayConfig.path, pollMs: gatewayConfig.pollMs, timeoutMs: gatewayConfig.timeoutMs,
      onState: (state) => { if (state === "disconnected") { gatewaySnapshot = undefined; unavailable(); } renderGatewayStatus(state); },
      onDiagnostic: (event) => {
        recentDiagnostics.push({ ...event }); if (recentDiagnostics.length > 100) recentDiagnostics.shift();
        if (event.level !== "info") gatewayReport?.([event.connectionId, event.tag, event.title, event.message, event.impact, "Come risolvere: " + event.action].filter(Boolean).join(" · "));
        renderGatewayStatus(gatewayClient?.state ?? "connecting");
      },
      onSnapshot: (snapshot) => {
        gatewaySnapshot = snapshot;
        for (const sample of snapshot.samples) applyRuntimeTagSample(sample);
        renderGatewayStatus("connected");
      },
    });
    gatewayClient.start();
  } else renderGatewayStatus("stopped");
  dataLogRuntime.start(() => ({ values, status: tagStatus }));
  const stopDataLogSubscription = dataLogRuntime.subscribe(renderTrendControls);
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointerup", up, true);
  document.addEventListener("click", tapped, true);
  document.addEventListener("dblclick", doubleTapped, true);
  document.addEventListener("change", changed, true);
  document.addEventListener("focusin", activated, true);
  document.addEventListener("focusout", deactivated, true);
  document.addEventListener("contextmenu", contextTapped, true);
  document.addEventListener("keydown", keyDown, true);
  document.addEventListener("keyup", keyUp, true);
  document.addEventListener("framecraft:interface-event", interfaceEvent, true);
  document.addEventListener("framecraft:faceplate-event", faceplateEvent, true);
  document.addEventListener("framecraft:command-fired", commandFired, true);
  document.addEventListener("pointerdown", gestureDown, true);
  document.addEventListener("pointerup", gestureUp, true);
  document.addEventListener("pointercancel", gestureCancel, true);
  window.addEventListener("framecraft:navigate", navigate);
  window.addEventListener("framecraft:alarm-state", alarmChanged);
  window.addEventListener("framecraft:data-log-request", requestDataLog);
  const observer = new MutationObserver((records) => {
    if (records.every((record) => record.target instanceof Element && record.target.closest("[data-hmi-trend-root], [data-hmi-function-trend-root]"))) return;
    scanLoaded(); syncCycles(); requestRefresh(); renderRuntimeFaceplates(); renderTrendControls(); renderGatewayStatus(gatewayClient?.state ?? "stopped");
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-hmi-events", "data-hmi-dynamizations", "data-hmi-faceplate", "data-hmi-trend", "data-hmi-function-trend"] });
  if (!gatewayConfig.enabled) for (const error of scriptContexts.initialize(scriptCatalog, undefined, "scheduler", values, { tagStatus })) (options.error ?? console.error)("[HMI SCRIPT scheduler] " + error);
  scanLoaded();
  syncCycles();
  installScheduledTasks();
  renderRuntimeFaceplates();
  renderTrendControls();
  const trendTimer = setInterval(renderTrendControls, 250);
  requestRefresh();
  return () => {
    scriptAbort.abort();
    gatewayClient?.stop(); gatewayClient = undefined; gatewayReport = undefined; gatewaySnapshot = undefined;
    window.removeEventListener("framecraft:command-result", commandResult);
    tagListeners.delete(tagChanged);
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("click", tapped, true);
    document.removeEventListener("dblclick", doubleTapped, true);
    document.removeEventListener("change", changed, true);
    document.removeEventListener("focusin", activated, true);
    document.removeEventListener("focusout", deactivated, true);
    document.removeEventListener("contextmenu", contextTapped, true);
    document.removeEventListener("keydown", keyDown, true);
    document.removeEventListener("keyup", keyUp, true);
    document.removeEventListener("framecraft:interface-event", interfaceEvent, true);
    document.removeEventListener("framecraft:faceplate-event", faceplateEvent, true);
    document.removeEventListener("framecraft:command-fired", commandFired, true);
    document.removeEventListener("pointerdown", gestureDown, true);
    document.removeEventListener("pointerup", gestureUp, true);
    document.removeEventListener("pointercancel", gestureCancel, true);
    window.removeEventListener("framecraft:navigate", navigate);
    window.removeEventListener("framecraft:alarm-state", alarmChanged);
    window.removeEventListener("framecraft:data-log-request", requestDataLog);
    for (const element of loaded) run(element, "Unloaded");
    loaded.clear();
    for (const timer of cycleTimers.values()) clearInterval(timer);
    for (const timer of scheduledIntervals) clearInterval(timer);
    for (const timer of scheduledTimeouts) clearTimeout(timer);
    clearInterval(trendTimer);
    stopDataLogSubscription();
    dataLogRuntime.stop();
    propertyFlashing.reset();
    propertyFlashingSurface.dispose();
    flashingStyle.remove();
    timerManager.dispose();
    runtimeActive = false;
    scriptContexts.dispose();
    for (const retire of retiredScriptScreens) retire();
    retiredScriptScreens.clear();
    popupManager.dispose();
    observer.disconnect();
  };
}
`;
}

function appSource(machineName: string, planned: readonly PlannedSection[], mobile: boolean) {
  const pages = planned.flatMap((section) => section.pages);
  const screenRoutes = literal(Object.fromEntries(pages.map((page) => [String(page.number), page.route])));
  const imports = pages.map((page) => `import { ${page.componentName} } from "./pages/${page.componentName}";`).join("\n");
  const routes = pages.map((page) => `          <Route path=${JSON.stringify(page.route)} element={<${page.componentName} />} />`).join("\n");
  const menu = planned.map((section) => `  ${literal({
    id: section.id,
    label: section.label,
    route: section.route,
    pages: section.pages.map((page) => page.route),
    entries: section.entries,
    menu: section.menu ?? null,
  })},`).join("\n");
  const icons = planned.map((section) => `  ${section.id}: (${svgIcon(sectionIcon[section.id])}),`).join("\n");
  const usedMenuIcons = [...new Set(planned.flatMap((section) => section.entries.map((entry) => entry.icon)))];
  const entryIcons = usedMenuIcons.map((id) => `  ${id}: (${svgIcon(menuIcon[id])}),`).join("\n");
  const fallback = planned[0]?.route ?? "/";
  const drawingControls = mobile
    ? `\n        {mobileLayout && <div className="hmi-drawing-controls"><button type="button" className="hmi-fit-switch" aria-pressed={mobileFit} title="Adatta riduce anche i comandi del disegno. Usa Dimensioni reali per controlli più grandi." onClick={() => setMobileFit((value) => !value)}>{mobileFit ? "Dimensioni reali" : "Adatta disegno"}</button></div>}`
    : "";
  const deviceReturn = mobile ? `
      <button type="button" className="hmi-device-return" data-panel-return="" aria-label="Cambia dispositivo: torna alla pagina iniziale" onClick={returnToDeviceChoice}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 5-7 7 7 7M5 12h15" /></svg>
        <span>Cambia<br />dispositivo</span>
      </button>` : "";
  const layoutEntry = mobile ? `
  const firstChoice = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (layoutMode === null) firstChoice.current?.focus({ preventScroll: true }); }, [layoutMode]);
  useEffect(() => {
    const resumed = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      try {
        const saved = sessionStorage.getItem(layoutPreferenceKey);
        setLayoutMode(saved === "desktop" || saved === "mobile" ? saved : null);
      } catch { /* Retain the current choice if storage is unavailable. */ }
    };
    window.addEventListener("pageshow", resumed);
    return () => window.removeEventListener("pageshow", resumed);
  }, [layoutPreferenceKey]);
  if (layoutMode === null) return (
    <main className="hmi-start" aria-labelledby="hmi-start-title" data-hmi-type="HmiScreen" data-panel-start="">
      <div className="hmi-start-content">
        <p className="hmi-start-eyebrow">Pannello HMI</p>
        <h1 id="hmi-start-title">Scegli come aprire il pannello</h1>
        <p className="hmi-start-machine">{${JSON.stringify(machineName)}}</p>
        <p className="hmi-start-description">Seleziona il layout per il dispositivo che vuoi usare.</p>
        <div className="hmi-start-options">
          <button ref={firstChoice} type="button" className="hmi-start-option" data-panel-start-mode="desktop" aria-label="Apri pannello Desktop" aria-describedby="hmi-start-desktop-description" onClick={() => chooseLayoutMode("desktop")}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
            <strong>Desktop</strong><span id="hmi-start-desktop-description">Layout completo per PC e monitor industriali.</span>
            <span className="hmi-start-open" aria-hidden="true">Apri Desktop →</span>
          </button>
          <button type="button" className="hmi-start-option" data-panel-start-mode="mobile" aria-label="Apri pannello Mobile" aria-describedby="hmi-start-mobile-description" onClick={() => chooseLayoutMode("mobile")}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 5h4M11 19h2" /></svg>
            <strong>Mobile</strong><span id="hmi-start-mobile-description">Navigazione adattata a telefono e tablet.</span>
            <span className="hmi-start-open" aria-hidden="true">Apri Mobile →</span>
          </button>
        </div>
        <p className="hmi-start-help">Per tornare qui e scegliere un altro layout, usa “Cambia dispositivo” nel pannello.</p>
      </div>
    </main>
  );
` : "";

  return `import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import resourceCatalogJson from "../framecraft.resources.json";
import { installFramecraftHmiRuntime } from "./framecraftHmiRuntime";
${imports}

interface Box { left: number; top: number; width: number; height: number }

interface RuntimeResourceCatalog {
  defaultLanguage: string;
  activeLanguage: string;
  languages: string[];
  multilingualTexts: { key: string; texts: Record<string, string> }[];
}

const resourceCatalog = resourceCatalogJson as RuntimeResourceCatalog;
const screenRoutes: Record<string, string> = ${screenRoutes};
  const runtimeRoute = (target: string) => screenRoutes[target.match(/^\\d{4,5}/)?.[0] ?? ""] ?? target;

interface PanelSection {
  id: string;
  label: string;
  /** La pagina che si apre quando la sezione non ha un sottomenu. */
  route: string;
  /** Tutte le sue pagine: servono a sapere quale tessera e' accesa. */
  pages: string[];
  entries: { label: string; icon: string; route: string }[];
  /** Dove si apre il pannello del sottomenu, in coordinate del pannello. */
  menu: { panel: Box; pointer: Box; entry: { left: number; width: number; height: number; pitch: number; first: number } } | null;
}

/** Le sezioni della barra laterale, nell'ordine dello standard.
 *
 * L'icona non porta a una pagina: apre il sottomenu bianco della sezione, e sono le voci a cambiare
 * pagina. Nel pannello vero il sottomenu e' la schermata \`Nxxxx_<Sezione>_Template\`. */
const panelSections: PanelSection[] = [
${menu}
];

/** I pittogrammi: sostituibili con le grafiche del progetto TIA. */
const sectionIcons: Record<string, ReactElement> = {
${icons}
};

const entryIcons: Record<string, ReactElement> = {
${entryIcons}
};

type PanelLayoutMode = "desktop" | "mobile";

export function App() {
  const layoutPreferenceKey = document.querySelector<HTMLMetaElement>('meta[name="framecraft-panel-layout-key"]')?.content || ${JSON.stringify(`framecraft.panel-layout:${machineName}`)};
  const [layoutMode, setLayoutMode] = useState<PanelLayoutMode | null>(() => {
    ${mobile ? `try {
      const saved = sessionStorage.getItem(layoutPreferenceKey);
      if (saved === "desktop" || saved === "mobile") return saved;
    } catch { /* Storage unavailable: keep the device choice usable. */ }
    return null;` : 'return "desktop";'}
  });
  const chooseLayoutMode = (value: PanelLayoutMode) => {
    if (!["desktop", "mobile"].includes(value)) return;
    try { sessionStorage.setItem(layoutPreferenceKey, value); } catch { /* The in-memory choice still works. */ }
    setLayoutMode(value);
  };
  const returnToDeviceChoice = () => {
    try { sessionStorage.removeItem(layoutPreferenceKey); } catch { /* The in-memory return still works. */ }
    setLayoutMode(null);
  };
${layoutEntry}
  return <Panel layoutMode={layoutMode ?? "desktop"} returnToDeviceChoice={returnToDeviceChoice} />;
}

function Panel({ layoutMode, returnToDeviceChoice }: { layoutMode: PanelLayoutMode; returnToDeviceChoice: () => void }) {
  const mobileLayout = layoutMode === "mobile";
  const [mobileFit, setMobileFit] = useState(false);
  const screen = useRef<HTMLElement>(null);
  const [mobileScale, setMobileScale] = useState(1);
  useEffect(() => { screen.current?.focus({ preventScroll: true }); }, []);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [runtimeLanguage, setRuntimeLanguage] = useState(resourceCatalog.activeLanguage || resourceCatalog.defaultLanguage || "it-IT");
  const localizedTexts = useRef(new Map<Element, string | null>());
  const location = useLocation();
  const navigate = useNavigate();
  const current = panelSections.find((section) => section.pages.includes(location.pathname)) ?? panelSections[0];
  const openSection = panelSections.find((section) => section.id === openMenu) ?? null;

  useEffect(() => {
    const content = screen.current;
    if (!content) return;
    const drawing = content.querySelector<HTMLElement>(".hmi-page");
    const resize = () => {
      const width = drawing?.offsetWidth || 1280;
      setMobileScale(Math.min(1, (content.clientWidth || window.innerWidth) / width));
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    observer?.observe(content);
    if (drawing) observer?.observe(drawing);
    window.addEventListener("resize", resize); resize();
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, [location.pathname, mobileLayout]);

  useEffect(() => {
    if (!mobileLayout) return;
    const nav = document.querySelector<HTMLElement>(".hmi-lateral");
    const active = nav?.querySelector<HTMLElement>(".hmi-section.active");
    if (!nav || !active) return;
    if (active.offsetLeft < nav.scrollLeft || active.offsetLeft + active.offsetWidth > nav.scrollLeft + nav.clientWidth)
      nav.scrollLeft = Math.max(0, active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2);
  }, [current.id, mobileLayout]);

  const closeMenu = () => {
    setOpenMenu(null);
    const opener = Array.from(document.querySelectorAll<HTMLButtonElement>(".hmi-section")).find((item) => item.dataset.section === openMenu);
    opener?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!openMenu) return;
    document.querySelector<HTMLButtonElement>("#hmi-section-menu li:not(.hmi-submenu-heading) button:not(:disabled)")?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); closeMenu();
    };
    const leave = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && !target.closest("#hmi-section-menu, .hmi-section")) setOpenMenu(null);
    };
    window.addEventListener("keydown", escape);
    document.addEventListener("focusin", leave);
    return () => { window.removeEventListener("keydown", escape); document.removeEventListener("focusin", leave); };
  }, [openMenu]);

  useEffect(() => installFramecraftHmiRuntime({
    navigate: (target) => navigate(runtimeRoute(target)),
    trace: (message) => console.info(message),
    error: (message) => console.error(message),
  }), [navigate]);

  useEffect(() => {
    const runtimeWindow = window as Window & { __framecraftSetPage?: (target: string) => void; __framecraftRequestedPage?: string };
    const open = (target: string) => navigate(runtimeRoute(target));
    runtimeWindow.__framecraftSetPage = open;
    if (runtimeWindow.__framecraftRequestedPage) {
      open(runtimeWindow.__framecraftRequestedPage);
      runtimeWindow.__framecraftRequestedPage = undefined;
    }
    return () => { if (runtimeWindow.__framecraftSetPage === open) delete runtimeWindow.__framecraftSetPage; };
  }, [navigate]);

  useEffect(() => {
    const changeLanguage = (event: Event) => {
      const language = (event as CustomEvent<string>).detail;
      if (resourceCatalog.languages.includes(language)) setRuntimeLanguage(language);
    };
    window.addEventListener("framecraft:set-language", changeLanguage);
    return () => window.removeEventListener("framecraft:set-language", changeLanguage);
  }, []);

  useEffect(() => {
    const dictionary: Record<string, string> = Object.fromEntries((resourceCatalog.multilingualTexts ?? []).flatMap((item) => {
      const exact = item.texts[runtimeLanguage];
      const fallback = item.texts[resourceCatalog.defaultLanguage]
        || resourceCatalog.languages.map((language) => item.texts[language]).find(Boolean);
      const value = exact || fallback;
      return value ? [[item.key, value]] : [];
    }));
    const originals = localizedTexts.current;
    const apply = () => {
      const found = new Set<Element>();
      for (const element of document.querySelectorAll("[data-hmi-text]")) {
        if (element.childElementCount) continue;
        if (!originals.has(element)) originals.set(element, element.textContent);
        found.add(element);
        const translated = dictionary[element.getAttribute("data-hmi-text") || ""] ?? originals.get(element);
        if (element.textContent !== translated) element.textContent = translated ?? "";
      }
      for (const [element, original] of [...originals]) {
        if (found.has(element)) continue;
        if (element.isConnected && element.textContent !== original) element.textContent = original;
        originals.delete(element);
      }
      document.documentElement.lang = runtimeLanguage;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, [runtimeLanguage]);

  const chooseSection = (section: PanelSection) => {
    if (!section.route) return;
    if (section.entries.length > 1) setOpenMenu(section.id === openMenu ? null : section.id);
    else navigate(section.route);
  };
  const chooseEntry = (route: string) => {
    if (!route) return; // voce "Free": tiene il posto, non porta a una pagina
    setOpenMenu(null);
    navigate(route);
    screen.current?.focus({ preventScroll: true });
  };

  return (
    <div className={\`hmi-shell \${mobileLayout ? "mobile" : "desktop"}\`} style={{ "--mobile-scale": mobileScale } as CSSProperties} data-hmi-type="HmiScreen" data-panel-layout={mobileLayout ? "mobile" : "desktop"} data-hmi-language={runtimeLanguage}>
      {/* Prima fila: orologio, primo allarme, collegamento PLC e logo. */}
      <header className="hmi-top-bar" data-hmi-type="HmiRectangle">
        <div className="hmi-clock">
          <strong data-hmi-type="HmiTextBox" data-plc-variable="">11:31</strong>
          <span><b>Monday</b><br />31.08.2026</span>
        </div>
        <section className="hmi-card hmi-fault" data-hmi-type="HmiRectangle" aria-label="Primo allarme">
          <span className="hmi-glyph" aria-hidden="true">&#9888;</span>
          <strong>First Fault</strong>
          <output data-hmi-type="HmiIOField" data-plc-variable="">3</output>
          <output data-hmi-type="HmiTextBox" data-plc-variable="">EMERGENCY BUTTON PRESSED E.C.2</output>
          <span>Machine Control</span>
        </section>
        <details className="hmi-plc"><summary title="PLC Connection: stato, diagnostica e guida" aria-label="Stato, diagnostica e guida PLC">
          <span data-framecraft-gateway-status="" role="status" aria-live="polite">PLC: da configurare</span>
          <div className="hmi-plc-bar" data-hmi-type="HmiBar" data-plc-variable=""><i /></div>
        </summary><section className="hmi-plc-diagnostics" aria-label="Diagnostica connessioni PLC">
          <h2>Connessioni PLC</h2><p data-framecraft-plc-summary="">Configurazione in Pannello → Connessioni PLC. Salvare non avvia collegamenti.</p>
          <div data-framecraft-plc-connections="" /><h3>Ultimi 10 eventi</h3><ol data-framecraft-plc-events="" />
          <details><summary>Guida rapida e posizione dei log</summary><p>Configura tag, broker MQTT o server OPC UA e mapping nell’editor; il responsabile del servizio deve preparare credenziali/certificati e avviare il servizio Node seguendo runtime/README.md. L’anteprima resta offline.</p><p>Controlla sempre qualità e aggiornamento dei tag. Una ricevuta MQTT o OPC UA non conferma l’esecuzione PLC. Esito incerto: verifica la macchina prima di un nuovo comando; nessun reinvio automatico.</p><p>Registro locale del servizio in .framecraft-runtime/logs, con rotazione. Niente password, token o valori dei comandi nei log. OPC UA scalare con trust esplicito e Namespace URI; array, UDT e metodi non ancora supportati. Nessuna conferma PLC simulata.</p></details>
        </section></details>
        <img className="hmi-logo" src="/placeholder.svg" alt="Logo del costruttore" />

        {/* Seconda fila: utente, linea e formato, OMAC, velocita'. */}
        <section className="hmi-card hmi-user" data-hmi-type="HmiRectangle">
          <span>User LogIn</span>
          <span className="hmi-avatar" aria-hidden="true" />
          <strong data-hmi-type="HmiTextBox" data-plc-variable="">DefaultUser</strong>
        </section>
        <section className="hmi-card hmi-format" data-hmi-type="HmiRectangle">
          <span className="hmi-glyph" aria-hidden="true">&#9776;</span>
          <div className="hmi-format-grid">
            <b>Line</b><b>Nr.</b><b>Format Running</b>
            <span>{${JSON.stringify(machineName)}}</span>
            <output data-hmi-type="HmiIOField" data-plc-variable="">1</output>
            <output data-hmi-type="HmiTextBox" data-plc-variable="">Formato 400x320 - Euro Pallet</output>
            <span>Line 2</span><output data-plc-variable="">0</output><output data-plc-variable="">Vassoio 234x7634 - Half Pallet</output>
            <span>Line 3</span><output data-plc-variable="">0</output><output data-plc-variable="">Open Case SCL 43x23 - Pallet 1000x1200</output>
          </div>
        </section>
        <section className="hmi-card hmi-omac" data-hmi-type="HmiRectangle">
          <strong>OMAC</strong>
          <div><span>Status</span><output data-hmi-type="HmiTextBox" data-plc-variable="">Production</output></div>
          <div><span>Mode</span><output data-hmi-type="HmiTextBox" data-plc-variable="">Aborted</output></div>
        </section>
        <section className="hmi-card hmi-speed" data-hmi-type="HmiRectangle">
          <strong>Speed <output data-hmi-type="HmiIOField" data-plc-variable="">40</output> cpm</strong>
          <div className="hmi-gauge">
            <div className="hmi-gauge-bar" data-hmi-type="HmiBar" data-plc-variable=""><i style={{ width: "40%" }} /></div>
            <div className="hmi-gauge-scale"><span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span></div>
          </div>
        </section>${drawingControls}
      </header>${deviceReturn}

      {/* La barra laterale: tessera sfumata con il colore della sezione, mezza opacita' se non e' la
          sezione aperta. Nello standard lo decide \`Actual_Page_Number\`. */}
      <nav className={\`hmi-lateral\${openSection ? " menu-open" : ""}\`} aria-label="Sezioni del pannello" data-hmi-type="HmiRectangle">
        {panelSections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={\`hmi-section\${section.id === current.id ? " active" : ""}\`}
            data-section={section.id}
            disabled={!section.route}
            data-hmi-type="HmiButton"
            data-plc-variable="Actual_Page_Number"
            aria-expanded={section.entries.length > 1 ? section.id === openMenu : undefined}
            aria-controls={section.entries.length > 1 && section.id === openMenu ? "hmi-section-menu" : undefined}
            onClick={() => chooseSection(section)}
          >
            <span className="hmi-section-icon">{sectionIcons[section.id] ?? Object.values(sectionIcons)[0]}</span>
            <span className="hmi-section-label">{section.label}</span>
          </button>
        ))}
      </nav>

      <main ref={screen} tabIndex={-1} aria-label="Pagina del pannello" className="hmi-screen" data-hmi-type="HmiScreenWindow" data-mobile-fit={mobileFit}>
        <Routes>
${routes}
          <Route path="*" element={<Navigate to=${JSON.stringify(fallback)} replace />} />
        </Routes>
      </main>
      <aside className="hmi-command-feedback" data-framecraft-command-status="" role="status" aria-live="polite" hidden>
        <span /><button type="button" aria-label="Chiudi esito comando" onClick={(event) => { event.currentTarget.parentElement!.hidden = true; }}>×</button>
      </aside>

      {/* Il sottomenu: il resto dello schermo si scurisce, il triangolino punta all'icona. */}
      {openSection && openSection.menu && (
        <div className="hmi-submenu">
          <button type="button" className="hmi-submenu-dim" aria-label="Chiudi il menu" tabIndex={-1} onClick={closeMenu} />
          <span className="hmi-submenu-pointer" aria-hidden="true" style={openSection.menu.pointer} />
          <ul id="hmi-section-menu" className="hmi-submenu-panel" aria-label={\`Menu \${openSection.label}\`} style={openSection.menu.panel}>
            <li className="hmi-submenu-heading"><strong>{openSection.label}</strong><button type="button" aria-label="Chiudi menu sezione" onClick={closeMenu}>Chiudi ×</button></li>
            {openSection.entries.map((entry, index) => (
              <li key={index} style={{ height: openSection.menu!.entry.pitch }}>
                <button type="button" data-hmi-type="HmiButton" disabled={!entry.route} onClick={() => chooseEntry(entry.route)}>
                  <span className="hmi-submenu-icon">{entryIcons[entry.icon] ?? Object.values(entryIcons)[0]}</span>
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
`;
}

function stylesSource(mobile: boolean) {
  const { topBar, lateralBar: bar, content } = desktopShell;
  const tiles = sections
    .map((section) => `.hmi-section[data-section="${section.id}"] .hmi-section-icon { background: linear-gradient(180deg, ${cssColor(section.color.top)} 0%, ${cssColor(section.color.bottom)} 100%); }`)
    .join("\n");
  const mobileTabs = sections
    .map((section) => `.hmi-shell.mobile .hmi-section[data-section="${section.id}"].active { color: ${cssColor(section.color.top)}; box-shadow: inset 0 -3px ${cssColor(section.color.top)}; }`)
    .join("\n");

  const mobileRules = mobile
    ? `
html:has(.hmi-start), body:has(.hmi-start), #root:has(.hmi-start) { min-width: 0; min-height: 0; height: 100%; }
.hmi-start { display: grid; place-items: center; width: 100%; min-height: 100dvh; padding: max(28px, env(safe-area-inset-top, 0px)) max(20px, env(safe-area-inset-right, 0px)) max(28px, env(safe-area-inset-bottom, 0px)) max(20px, env(safe-area-inset-left, 0px)); background: #111318; color: #FFFFFF; }
.hmi-start-content { width: min(760px, 100%); text-align: center; overflow-wrap: anywhere; }
.hmi-start-eyebrow { margin: 0; color: #B7C3D2; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
.hmi-start h1 { margin: 12px 0; font-size: clamp(26px, 4vw, 36px); line-height: 1.2; }
.hmi-start-machine { margin: 0 0 16px; color: #8ED1FF; font-size: 18px; font-weight: 600; }
.hmi-start-description { margin: 0; color: #D0D7E0; font-size: 16px; line-height: 1.5; }
.hmi-start-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 28px 0 22px; }
.hmi-start-option { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; min-width: 0; min-height: 220px; padding: 24px; border: 1px solid #606B7A; border-radius: 12px; background: #20242C; color: #FFFFFF; text-align: left; cursor: pointer; transition: background-color .15s, border-color .15s; }
.hmi-start-option:hover { background: #29333F; border-color: #8ED1FF; }
.hmi-start-option:focus-visible { outline: 3px solid #8ED1FF; outline-offset: 4px; }
.hmi-start-option svg { width: 48px; height: 48px; margin-bottom: 8px; color: #8ED1FF; flex-shrink: 0; }
.hmi-start-option strong { font-size: 24px; }
.hmi-start-option > span { color: #D0D7E0; font-size: 16px; line-height: 1.5; }
.hmi-start-option .hmi-start-open { margin-top: auto; padding-top: 8px; color: #8ED1FF; font-size: 14px; font-weight: 600; }
.hmi-start-help { max-width: 600px; margin: 0 auto; color: #B7C3D2; font-size: 14px; line-height: 1.6; }
@media (max-width: 600px) {
  .hmi-start { padding: max(24px, env(safe-area-inset-top, 0px)) max(20px, env(safe-area-inset-right, 0px)) max(24px, env(safe-area-inset-bottom, 0px)) max(20px, env(safe-area-inset-left, 0px)); }
  .hmi-start-options { grid-template-columns: 1fr; gap: 14px; margin: 24px 0 20px; }
  .hmi-start-option { min-height: 184px; padding: 20px; gap: 8px; }
  .hmi-start-option svg { width: 36px; height: 36px; margin-bottom: 4px; }
  .hmi-start-option strong { font-size: 22px; }
}
/* Layout mobile: barra compatta, navigatore a linguette, pagina a grandezza naturale. */
.hmi-shell.mobile .hmi-top-bar { height: ${mobileShell.navigator.top}px; background: #111111; }
.hmi-shell.mobile .hmi-clock { top: 4px; height: 40px; }
.hmi-shell.mobile .hmi-fault, .hmi-shell.mobile .hmi-format, .hmi-shell.mobile .hmi-omac, .hmi-shell.mobile .hmi-speed { display: none; }
.hmi-shell.mobile .hmi-user { left: 760px; top: 2px; width: 150px; height: 44px; background: transparent; grid-template-rows: 24px auto; gap: 0; }
.hmi-shell.mobile .hmi-user span:first-child { display: none; }
.hmi-shell.mobile .hmi-user .hmi-avatar { width: 22px; height: 22px; }
.hmi-shell.mobile .hmi-plc { left: 920px; top: 8px; }
.hmi-shell.mobile .hmi-logo { top: 2px; height: 40px; }
.hmi-shell.mobile .hmi-lateral { left: 0; top: ${mobileShell.navigator.top}px; width: ${panelSize.width}px; height: ${mobileShell.content.top - mobileShell.navigator.top}px; flex-direction: row; padding: 0 0 0 70px; background: #111111; }
.hmi-shell.mobile .hmi-section { flex: 1; height: 100%; flex-direction: row; gap: 0; opacity: 1; color: rgba(255, 255, 255, .82); }
.hmi-shell.mobile .hmi-section .hmi-section-icon { display: none; }
.hmi-shell.mobile .hmi-section-label { width: auto; height: auto; font-size: 15px; }
${mobileTabs}
.hmi-shell.mobile .hmi-screen { left: 0; top: ${mobileShell.content.top}px; width: ${mobileShell.content.width}px; height: ${mobileShell.content.height}px; }
.hmi-shell.mobile .hmi-screen .hmi-page { transform: none; }
/* Sul mobile il sottomenu scende da sotto il navigatore, e il triangolino non serve. */
.hmi-shell.mobile .hmi-submenu-pointer { display: none; }
.hmi-shell.mobile .hmi-submenu-panel { left: 16px !important; top: ${mobileShell.content.top + 8}px !important; width: 300px !important; }
.hmi-device-return { position: absolute; left: 1168px; top: 2px; z-index: 55; width: 104px; height: 44px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 6px; border: 1px solid #64646A; border-radius: 4px; background: #222222; color: #FFFFFF; font-size: 12px; line-height: 1.3; cursor: pointer; }
.hmi-device-return svg { flex: 0 0 16px; width: 16px; height: 16px; }
.hmi-device-return:hover { background: #3A4654; }
.hmi-device-return:focus-visible, .hmi-fit-switch:focus-visible { outline: 2px solid #6cc5ff; outline-offset: -2px; }
.hmi-shell.desktop .hmi-logo { width: 76px; }
.hmi-fit-switch { min-height: 44px; padding: 0 12px; border: 1px solid #64646A; border-radius: 4px; background: #333333; color: #FFFFFF; font-size: 14px; cursor: pointer; }
/* Il disegno resta nelle sue coordinate: si sposta nell'area contenuto, non l'intera pagina. */
html:has(.hmi-shell.mobile), body:has(.hmi-shell.mobile), #root:has(.hmi-shell.mobile) { min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
.hmi-shell.mobile { width: 100%; min-width: 0; height: 100dvh; min-height: 0; }
.hmi-shell.mobile .hmi-top-bar { width: 100%; height: calc(56px + env(safe-area-inset-top, 0px)); padding: calc(6px + env(safe-area-inset-top, 0px)) 8px 6px; display: grid; grid-template-columns: 64px minmax(44px, 1fr) 140px; gap: 8px; align-items: center; z-index: 50; }
.hmi-shell.mobile .hmi-clock { position: static; grid-column: 1; grid-row: 1; width: auto; height: 44px; }.hmi-shell.mobile .hmi-clock strong { font-size: 22px; }.hmi-shell.mobile .hmi-clock span { display: none; }
.hmi-shell.mobile .hmi-plc { position: static; grid-column: 3; grid-row: 1; width: auto; }
.hmi-shell.mobile .hmi-user { position: static; grid-column: 2; grid-row: 1; display: grid; grid-template-rows: 1fr; width: 100%; height: 44px; min-width: 0; padding: 0 4px; }
.hmi-shell.mobile .hmi-user span { display: none; }.hmi-shell.mobile .hmi-user strong { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hmi-shell.mobile .hmi-logo { display: none; }
.hmi-shell.mobile .hmi-plc-diagnostics { right: 8px; top: calc(56px + env(safe-area-inset-top, 0px)); width: min(430px, calc(100vw - 16px)); max-height: calc(100dvh - 72px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); }
.hmi-shell.mobile .hmi-device-return { left: 0; top: calc(56px + env(safe-area-inset-top, 0px)); height: 56px; border-radius: 0; }
.hmi-shell.mobile .hmi-lateral { left: 104px; top: calc(56px + env(safe-area-inset-top, 0px)); width: calc(100% - 104px); height: 56px; padding: 0; overflow-x: auto; overflow-y: hidden; z-index: 50; }
.hmi-shell.mobile .hmi-section { flex: 0 0 auto; width: auto; min-width: 110px; min-height: 44px; padding: 0 16px; }
.hmi-shell.mobile .hmi-screen { top: calc(112px + env(safe-area-inset-top, 0px)); width: 100%; height: calc(100dvh - 172px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); overflow: auto; overscroll-behavior: contain; touch-action: pan-x pan-y; zoom: 1 !important; }
.hmi-shell.mobile .hmi-screen[data-mobile-fit="true"] .hmi-page { zoom: var(--mobile-scale); }
.hmi-shell.mobile .hmi-submenu-panel { top: calc(120px + env(safe-area-inset-top, 0px)) !important; left: 8px !important; width: min(340px, calc(100vw - 16px)) !important; max-height: calc(100dvh - 184px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); overflow-y: auto; overscroll-behavior: contain; }
.hmi-shell.mobile .hmi-submenu-panel li { height: 48px !important; }.hmi-shell.mobile .hmi-submenu-panel button { min-height: 44px; }
.hmi-shell.mobile .hmi-submenu-heading { display: flex; position: sticky; top: -8px; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px 0 14px; background: ${cssColor(submenuPalette.panel)}; }
.hmi-shell.mobile .hmi-submenu-heading button { width: auto; padding: 0 8px; }
.hmi-shell.mobile .hmi-command-feedback { left: 8px; right: 8px; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); max-height: min(160px, calc(100dvh - 184px)); overflow: auto; }
.hmi-shell.mobile .hmi-drawing-controls { position: fixed; left: 0; right: 0; bottom: 0; height: calc(60px + env(safe-area-inset-bottom, 0px)); padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px)); display: flex; background: #111; justify-content: flex-end; z-index: 50; }
.hmi-shell.mobile .hmi-fit-switch { min-width: 0; }
`
    : "";

  return `* { box-sizing: border-box; }
:root { font-family: "Siemens Sans", SiemensSans, "Segoe UI", Arial, sans-serif; color: #FFFFFF; background: #000000; }
html, body, #root { width: 100%; min-width: ${panelSize.width}px; height: 100%; min-height: ${panelSize.height}px; margin: 0; }
body { overflow: auto; background: #000000; }
button, input, select, textarea { font: inherit; }

/* Il pannello: ${panelSize.width}x${panelSize.height}, tutto sul nero. */
.hmi-shell { position: relative; width: ${panelSize.width}px; height: ${panelSize.height}px; overflow: hidden; background: #000000; color: #FFFFFF; }
.hmi-top-bar { position: absolute; left: 0; top: 0; width: ${topBar.width}px; height: ${topBar.height}px; background: #000000; z-index: 20; }
.hmi-card { position: absolute; background: #333333; border-radius: 4px; }

/* Prima fila. */
.hmi-clock { position: absolute; left: 7px; top: 6px; width: 152px; height: 36px; display: flex; align-items: center; gap: 8px; }
.hmi-clock strong { font-size: 26px; letter-spacing: -.5px; }
.hmi-clock span { font-size: 11px; line-height: 1.2; }
.hmi-fault { left: 177px; top: 10px; width: 747px; height: 32px; display: grid; grid-template-columns: 44px 110px 40px 1fr 160px; align-items: center; font-size: 15px; font-weight: 700; }
.hmi-fault output:nth-of-type(2) { font-weight: 400; text-align: center; }
.hmi-fault span:last-child { text-align: right; padding-right: 14px; font-weight: 400; }
.hmi-glyph { display: grid; place-items: center; font-size: 19px; }
.hmi-plc { position: absolute; left: 932px; top: 1px; width: 142px; text-align: center; font-size: 13px; }
.hmi-plc > summary { min-height: 44px; display: grid; align-content: center; gap: 5px; cursor: pointer; list-style: none; border-radius: 3px; }
.hmi-plc > summary::-webkit-details-marker { display: none; }
.hmi-plc > summary:hover { background: #333333; }
.hmi-plc summary:focus-visible { outline: 2px solid #6cc5ff; outline-offset: 2px; }
.hmi-top-bar:has(.hmi-plc[open]) { z-index: 70; }
.hmi-plc-diagnostics { position: absolute; right: 0; top: 48px; z-index: 70; width: 430px; max-height: 580px; overflow: auto; padding: 18px; border: 1px solid #888888; border-radius: 5px; background: #222222; color: #ffffff; box-shadow: 0 12px 28px #00000099; text-align: left; line-height: 1.6; overflow-wrap: anywhere; }
.hmi-plc-diagnostics h2 { margin: 0 0 10px; font-size: 18px; }
.hmi-plc-diagnostics h3 { margin: 16px 0 8px; font-size: 15px; }
.hmi-plc-diagnostics ol { list-style: none; margin: 0; padding: 0; }
.hmi-plc-diagnostics li { padding: 12px; margin-bottom: 10px; border: 1px solid #666666; border-radius: 3px; }
.hmi-plc-diagnostics li[data-level="warning"] { border-color: #e0ba65; }
.hmi-plc-diagnostics li[data-level="error"] { border-color: #f58484; }
.hmi-plc-diagnostics p { margin: 6px 0; }
.hmi-plc-diagnostics [data-framecraft-plc-connections] span { display: block; }
.hmi-plc-diagnostics small { color: #cccccc; }
.hmi-plc-diagnostics details { border-top: 1px solid #777777; }
.hmi-plc-diagnostics details summary { min-height: 44px; padding: 10px 0; cursor: pointer; }
.hmi-plc-bar { height: 9px; background: #8B8D97; border-radius: 2px; overflow: hidden; }
.hmi-plc-bar i { display: block; width: 0%; height: 100%; background: #339966; }
.hmi-command-feedback { position: absolute; right: 20px; bottom: 12px; z-index: 60; max-width: 600px; display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #333333; border: 2px solid #d4a12a; color: white; font-size: 14px; }
.hmi-command-feedback[hidden] { display: none; }
.hmi-command-feedback[data-outcome="uncertain"], .hmi-command-feedback[data-outcome="rejected"] { border-color: #e66565; }
.hmi-command-feedback button { flex: 0 0 44px; height: 44px; border: 1px solid #777777; background: transparent; color: white; font-size: 24px; cursor: pointer; }
.hmi-logo { position: absolute; left: 1084px; top: 2px; width: 188px; height: 42px; object-fit: contain; }

/* Seconda fila. */
.hmi-user { left: 12px; top: 49px; width: 150px; height: 95px; display: grid; grid-template-rows: 22px 1fr 22px; justify-items: center; align-items: center; padding: 6px 0; font-size: 14px; }
.hmi-avatar { width: 34px; height: 34px; border-radius: 50%; background: #FFFFFF; }
.hmi-format { left: 177px; top: 49px; width: 747px; height: 96px; display: grid; grid-template-columns: 44px 1fr; align-items: center; font-size: 15px; }
.hmi-format-grid { display: grid; grid-template-columns: 120px 60px 1fr; align-items: center; row-gap: 1px; }
.hmi-format-grid b { font-size: 15px; }
.hmi-format-grid span, .hmi-format-grid output { color: #F0F0F0; }
.hmi-omac { left: 932px; top: 49px; width: 142px; height: 96px; display: grid; grid-template-rows: 34px 1fr; grid-template-columns: 1fr 1fr; align-items: center; text-align: center; font-size: 13px; }
.hmi-omac strong { grid-column: 1 / -1; font-size: 16px; }
.hmi-omac div { display: grid; gap: 4px; height: 100%; align-content: center; border-left: 1px solid #4A4A4A; }
.hmi-omac div:first-of-type { border-left: 0; }
.hmi-speed { left: 1084px; top: 49px; width: 187px; height: 96px; display: grid; grid-template-rows: 40px 1fr; justify-items: center; align-items: center; font-size: 16px; }
.hmi-gauge { width: 168px; display: grid; grid-template-rows: 12px 14px; gap: 2px; }
.hmi-gauge-bar { height: 12px; background: #64646A; border-radius: 2px; overflow: hidden; }
.hmi-gauge-bar i { display: block; height: 100%; background: #339966; }
.hmi-gauge-scale { display: grid; grid-template-columns: repeat(6, 1fr); font-size: 11px; text-align: center; color: #E0E0E0; }

/* La barra laterale: tessera 60x60 a x=${lateralBar.iconLeft}, passo ${lateralBar.pitch}. */
.hmi-lateral { position: absolute; left: 0; top: ${bar.top}px; width: ${bar.width}px; height: ${bar.height}px; display: flex; flex-direction: column; padding-top: ${lateralBar.firstIconTop}px; background: #000000; z-index: 35; overflow-y: auto; }
.hmi-lateral.menu-open .hmi-section { opacity: 1; }
.hmi-section { flex-shrink: 0; width: 100%; height: ${lateralBar.pitch}px; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0; border: 0; background: transparent; color: #FFFFFF; text-decoration: none; opacity: ${lateralBar.inactiveOpacity}; cursor: pointer; }
.hmi-section.active { opacity: 1; }
.hmi-section:focus-visible { outline: 2px solid #FFFFFF; outline-offset: -2px; }
.hmi-section-icon { width: ${lateralBar.iconSize}px; height: ${lateralBar.iconSize}px; display: grid; place-items: center; border-radius: 4px; }
.hmi-section-icon svg { width: 34px; height: 34px; fill: #FFFFFF; }
.hmi-section-label { width: ${lateralBar.labelWidth}px; height: ${lateralBar.labelHeight}px; font-size: 12px; text-align: center; }
${tiles}

/* La finestra della pagina: ${content.width}x${content.height}, con la pagina ${pageCanvas.width}x${pageCanvas.height} rimpicciolita. */
.hmi-screen { position: absolute; left: ${content.left}px; top: ${content.top}px; width: ${content.width}px; height: ${content.height}px; overflow: hidden; background: #000000; }
.hmi-screen .hmi-page { transform: scale(${(content.width / pageCanvas.width).toFixed(4)}); transform-origin: left top; }

/* Il sottomenu della sezione: pannello ${cssColor(submenuPalette.panel)}, voci alte ${submenuPanel.entry.height}, un filo
   ${cssColor(submenuPalette.separator)} fra una e l'altra e il triangolino che punta all'icona. I colori sono campionati
   sulle foto dei tre sottomenu, non scelti a occhio: il pannello non e' bianco. Mentre e' aperto lo
   schermo va in penombra, ma la barra laterale e quella in alto restano accese. */
.hmi-submenu { position: absolute; inset: 0; z-index: 25; }
.hmi-submenu-dim { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; padding: 0; background: ${cssColor(submenuPalette.scrim)}; cursor: default; }
.hmi-submenu-pointer { position: absolute; background: ${cssColor(submenuPalette.panel)}; clip-path: polygon(100% 0, 100% 100%, 0 50%); }
.hmi-submenu-panel { position: absolute; margin: 0; padding: ${submenuPanel.entry.first}px 0 2px; list-style: none; border-radius: 10px; background: ${cssColor(submenuPalette.panel)}; overflow: hidden; }
.hmi-submenu-panel li:not(.hmi-submenu-heading) + li { border-top: ${submenuPanel.separator.height}px solid ${cssColor(submenuPalette.separator)}; }
.hmi-submenu-heading { display: none; }
.hmi-submenu-panel button { display: flex; align-items: center; gap: 16px; width: 100%; height: 100%; padding: 0 14px; border: 0; background: transparent; color: ${cssColor(submenuPalette.text)}; font-size: 15px; font-weight: 700; text-align: left; cursor: pointer; }
.hmi-submenu-panel button:enabled:hover, .hmi-submenu-panel button:enabled:focus-visible { background: rgba(255, 255, 255, .5); }
/* Le voci "Free" sono nel menu come nelle foto, con lo stesso nero: solo, non aprono niente. */
.hmi-submenu-panel button:disabled { cursor: default; color: ${cssColor(submenuPalette.text)}; }
.hmi-submenu-icon { display: grid; place-items: center; width: 28px; height: 24px; }
.hmi-submenu-icon svg { width: 24px; height: 24px; fill: ${cssColor(submenuPalette.text)}; }
${mobileRules}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: .01ms !important; } }
`;
}

export function standardProjectFiles(config: StandardProjectConfig): GeneratedProjectFile[] {
  const machineName = safeName(config.machineName);
  const requested = new Set(config.sections);
  const chosen = standardProjectSectionChoices.filter((section) => requested.has(section.id));
  if (!chosen.length) chosen.push(standardProjectSectionChoices[0]);
  const mobile = config.layout === "desktop-mobile";
  const settingsProgram = config.settingsProgram ?? "robot";
  const planned = planSections(chosen, settingsProgram);
  const pages = planned.flatMap((section) => section.pages.map((page) => ({ page, section })));
  const photo = config.machineImage ? machineImageAsset(config.machineImage) : undefined;
  const pageFiles = pages.map(({ page }) => ({
    path: `src/pages/${page.componentName}.tsx`,
    content: withMachineImage(standardPageSource({ componentName: page.componentName, title: page.title, plan: page.plan, templateId: page.templateId, folderTab: page.folderTab, folderRoutes: page.folderRoutes }), photo?.url),
  }));
  const manifest = {
    id: slug(machineName), name: machineName, version: "1.0.0",
    standard: { family: "New_Layout_V19_V20", panel: [panelSize.width, panelSize.height], layout: config.layout, settingsProgram },
    editor: {
      version: 1,
      pages: pages.map(({ page, section }) => ({ id: page.route, name: `${page.number} ${page.title}`, locked: false, affordances: [], pageNumber: page.number, section: section.id })),
    },
  };
  return [
    { path: ".gitignore", content: "node_modules/\ndist/\n.framecraft/\n.framecraft-runtime/\n.framecraft-workspace.json\n*.log\n*.tsbuildinfo\n.env\n.env.*\n!.env.example\n*.pem\n*.key\n*.pfx\n*.p12\n" },
    { path: "src/App.tsx", content: appSource(machineName, planned, mobile) },
    { path: "runtime/mqtt-driver.mjs", content: mqttDriverSource },
    { path: "runtime/opcua-driver.mjs", content: opcUaDriverSource },
    { path: "runtime/opcua-driver.d.mts", content: opcUaDriverTypes },
    { path: "runtime/connection-diagnostics.mjs", content: connectionDiagnosticSource },
    { path: "runtime/connection-diagnostics.d.mts", content: connectionDiagnosticTypes },
    { path: "runtime/runtime-log.mjs", content: runtimeLogSource },
    { path: "runtime/runtime-log.d.mts", content: runtimeLogTypes },
    { path: "runtime/connection-config.mjs", content: connectionConfigSource },
    { path: "runtime/connection-config.d.mts", content: connectionConfigTypes },
    { path: "runtime/mqtt-driver.d.mts", content: mqttDriverTypes },
    { path: "runtime/start-mqtt.mjs", content: mqttStartSource },
    { path: "runtime/gateway.mjs", content: gatewaySource },
    { path: "runtime/gateway.d.mts", content: gatewayTypes },
    { path: "runtime/start-gateway.mjs", content: gatewayStartSource },
    { path: "runtime/vite-gateway.mjs", content: gatewayProxySource },
    { path: "runtime/vite-gateway.d.mts", content: gatewayProxyTypes },
    { path: "runtime/README.md", content: mqttReadmeSource },
    { path: "runtime/package.json", content: JSON.stringify({ name: "framecraft-plc-runtime", private: true, type: "module", engines: { node: ">=22.13.0" }, scripts: { mqtt: "node start-mqtt.mjs", gateway: "node start-gateway.mjs" }, dependencies: { mqtt: "5.16.0", "node-opcua-client": "2.186.17", "node-opcua-certificate-manager": "2.186.17", "node-opcua-debug": "2.186.7" } }, null, 2) + "\n" },
    { path: "framecraft.connections.json", content: JSON.stringify({ version: 1, connections: [] }, null, 2) + "\n" },
    { path: "framecraft.runtime.json", content: JSON.stringify({ version: 1, gateway: { enabled: false, path: "/_framecraft/plc/v1", pollMs: 250 } }, null, 2) + "\n" },
    { path: "src/framecraftGateway.ts", content: gatewayClientSource.replaceAll('"../../runtime/', '"../runtime/') },
    { path: "vite.config.ts", content: "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport { framecraftGatewayProxy } from './runtime/vite-gateway.mjs';\nconst proxy = framecraftGatewayProxy();\nexport default defineConfig({ plugins: [react()], server: { host: '127.0.0.1', proxy }, preview: { host: '127.0.0.1', proxy } });\n" },
    { path: "src/framecraftScriptRuntime.ts", content: hmiScriptRuntimeModuleSource() },
    { path: "src/framecraftHmiFlashing.ts", content: hmiFlashingRuntimeSource() },
    { path: "src/framecraftScriptModules.ts", content: hmiScriptModulesRuntimeSource() },
    { path: "src/framecraftHmiSchedule.ts", content: hmiScheduleRuntimeSource() },
    { path: "src/framecraftHmiTimers.ts", content: hmiTimersRuntimeSource() },
    { path: "src/framecraftHmiPopups.ts", content: hmiPopupManagerRuntimeModuleSource() },
    { path: "src/framecraftHmiFaceplateVisuals.ts", content: hmiFaceplateVisualRuntimeModuleSource() },
    { path: "src/framecraftHmiTrend.ts", content: hmiTrendRuntimeModuleSource() },
    { path: "src/framecraftHmiFunctionTrend.ts", content: hmiFunctionTrendRuntimeModuleSource() },
    { path: "src/framecraftHmiDataLogs.ts", content: hmiDataLogRuntimeModuleSource() },
    { path: "src/framecraftHmiRuntime.ts", content: hmiRuntimeSource() },
    { path: "src/styles.css", content: stylesSource(mobile) },
    { path: "public/placeholder.svg", content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect width="800" height="500" fill="#ececec"/><rect x="12" y="12" width="776" height="476" rx="10" fill="none" stroke="#8b8b8b" stroke-width="3" stroke-dasharray="12 10"/><path d="M280 318l78-88 62 62 46-48 76 74H280z" fill="#b9b9b9"/><circle cx="360" cy="180" r="30" fill="#b9b9b9"/><text x="400" y="390" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="28" fill="#555">Sostituisci immagine nell'Inspector</text></svg>\n` },
    ...(photo && config.machineImage ? [{ path: photo.path, content: "", source: config.machineImage }] : []),
    ...pageFiles,
    { path: "panel.json", content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: "framecraft.plc.json", content: `${JSON.stringify({ version: 1, variables: [] }, null, 2)}\n` },
    { path: "framecraft.resources.json", content: `${JSON.stringify(emptyHmiResourceCatalog(), null, 2)}\n` },
    { path: "framecraft.scripts.json", content: `${JSON.stringify(emptyHmiScriptCatalog(), null, 2)}\n` },
    { path: "framecraft.faceplates.json", content: serializeHmiFaceplateCatalog(standardHmiFaceplateCatalog()) },
    { path: "framecraft.logs.json", content: `${JSON.stringify(emptyHmiDataLogCatalog(slug(machineName)), null, 2)}\n` },
    { path: "README.md", content: `# ${machineName}\n\nPannello React creato da Framecraft sullo standard HMI ${panelSize.width}x${panelSize.height} (New_Layout_V19_V20).\n\nHMI React autonomo: non va distribuito in TIA/WinCC o FactoryTalk Runtime. MQTT e OPC UA scalare disponibili nel servizio Node; nessuna connessione automatica.\n\n- Layout: ${mobile ? "desktop e mobile" : "desktop"}\n- Sezioni: ${planned.map((section) => `${section.label} (${section.pages.length} pagine)`).join(", ")}\n- Sessione Program Modification: ${settingsProgram}.\n- L'icona di una sezione apre il suo sottomenu, come nel pannello vero: le voci portano alle pagine.\n- ${photo ? `Foto della macchina: \`${photo.url}\`, gia' messa nelle pagine che mostrano la macchina intera.` : "Le immagini sono segnaposto: sostituiscile dall'Inspector con le grafiche della macchina."}\n- I pezzi (encoder, robot, stazioni) restano segnaposto: scegli tu l'immagine dall'Inspector.\n- Variabili PLC: importabili da \`framecraft.plc.json\` tramite l'editor.\n- Moduli JavaScript HMI: funzioni globali, locali e operazioni pianificate in \`framecraft.scripts.json\`, compilate senza eval.\n- Data Log: acquisizione ciclica, su variazione o su richiesta in \`framecraft.logs.json\`; i Trend possono usare valori online e campioni archiviati.\n- Function Trend X/Y: due sorgenti indipendenti, scalari o array JSON coerenti, configurabili dall'Inspector; curve online/storiche, sorgenti selezionabili a Runtime, zoom rettangolare, qualità, righello e CSV.\n- MQTT e OPC UA scalare: servizio Node e gateway HTTP/browser in runtime/, disabilitati inizialmente. Configura i tag in Variabili PLC e usa Pannello -> Connessioni PLC per broker, mapping, gateway e client. Salvare non avvia rete o comandi; segreti soltanto nel servizio. Segui runtime/README.md per trust reciproco, Namespace URI e identificatori nodi. Array, UDT, metodi e allarmi OPC UA restano da implementare.\n- Comandi reali: requestRuntimeTagWrite attende la ricevuta del servizio, non una conferma PLC. Nessuna coda offline o aggiornamento ottimistico; eventi IR, moduli, timer e Scheduler attendono il trasporto PLC asincrono. WriteAsync(1)/hmiWriteWait non è disponibile senza conferma applicativa PLC.\n- Guida rapida nell'editor: Pannello -> Connessioni PLC -> Guida rapida. Nel pannello autonomo apri lo stato PLC in alto per diagnostica, conseguenze e Come risolvere.\n- Log locali con rotazione in .framecraft-runtime/logs, fino a tre file da 1 MiB per servizio; niente password, token o valori dei comandi. Directory esclusa da Git, ma nomi tag/connessioni possono essere aziendali: non pubblicare il registro senza revisione. Dettagli e limiti in runtime/README.md.\n\n## Prima della produzione\n\nNode LTS supportato (baseline Node 24), HTTPS/reverse proxy protetto, autenticazione e ruoli server, segreti fuori dal bundle, audit/storage persistenti e interlock nel PLC. Vite dev/preview e il PIN browser non sono un deployment industriale sicuro. Collaudare CPU/TLS, conferma e idempotenza dei comandi, guasti e recovery; conservare lockfile e verificare vulnerabilità, licenze/notice e diritti di foto/font/export della distribuzione reale. La generazione del progetto non equivale ad approvazione al rilascio.\n` },
  ];
}
