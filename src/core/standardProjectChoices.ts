import type { StandardProjectSectionChoice, StandardProjectSectionId } from "./standardProject";
import { blueprintPages, sectionBlueprint, type SettingsProgram } from "./hmiSectionMenu";

export const standardProjectSectionChoices: readonly StandardProjectSectionChoice[] = [
  { id: "main", label: "Main", description: "Tutto il menu Main: vista linea, contatori, funzioni speciali, PackML e manutenzione (1001-1241).", route: "/", componentName: "UpstairPage", pageTitle: "Upstair", templateId: "machine-render" },
  { id: "settings", label: "Settings", description: "Tutto il menu Settings: programma, encoder, motori, robot, lubrificazione, guide e sistema (2001-2241).", route: "/settings", componentName: "SettingsPage", pageTitle: "Program Modification", templateId: "program-modification" },
  { id: "alarms", label: "Alarms", description: "Tutto il menu Alarms: lista, allarmi per zona, storico e media (3001-3121).", route: "/alarms", componentName: "AlarmsPage", pageTitle: "Alarm", templateId: "alarms" },
  { id: "statistics", label: "Statistics", description: "Tutto il menu Statistics: macchina, produzione e disponibilita' (4001-4081).", route: "/statistics", componentName: "StatisticsPage", pageTitle: "Statistics", templateId: "statistics" },
  { id: "manuals", label: "Manuals", description: "Tutto il menu Manuals: mappa macchina e le sei stazioni in manuale (5001-5241).", route: "/manuals", componentName: "ManualsPage", pageTitle: "Manual General", templateId: "machine-map" },
  { id: "diagnostic", label: "Diagnostic", description: "Tutto il menu Diagnostic: sinottico, robot, zone, dispositivi, manutenzione e Profinet (6001-6241).", route: "/diagnostic", componentName: "DiagnosticPage", pageTitle: "Synoptic", templateId: "synoptic" },
  { id: "formats", label: "Formats", description: "Tutto il menu Formats: selezione formato, copia e magazzino pallet (7001-7081).", route: "/formats", componentName: "FormatsPage", pageTitle: "Formats", templateId: "format-manager" },
] as const;

/** Quante pagine crea davvero una scelta di sezioni: la Main ne porta nove, non una. */
export function standardProjectPageCount(chosen: readonly StandardProjectSectionId[], settingsProgram: SettingsProgram = "robot"): number {
  return chosen.reduce((total, id) => {
    const blueprint = sectionBlueprint(id, settingsProgram);
    return total + (blueprint ? blueprintPages(blueprint).length : 1);
  }, 0);
}
