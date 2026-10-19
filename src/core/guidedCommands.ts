import { normalizeMqttTagValue } from "../../runtime/connection-config.mjs";
import { newGuidedAction, newGuidedWriteAction } from "./hmiActions";
import type { GuidedPage } from "./guidedProject";
import { serializeHmiEvents, type HmiEventBinding } from "./hmiEvents";
import type { PlcVariableDefinition } from "./plcVariables";

export const guidedCommandEvents = ["Tapped", "DoubleTapped", "ContextTapped"] as const;
export const guidedCommandPermissions = [
  { id: "", label: "Tutti, per questa bozza" }, { id: "comandi", label: "Comandare la macchina" },
  { id: "parametri", label: "Cambiare i parametri" }, { id: "manutenzione", label: "Manutenzione e diagnostica" },
] as const;
export interface GuidedCommand {
  event: (typeof guidedCommandEvents)[number]; value: string;
  permission: (typeof guidedCommandPermissions)[number]["id"]; reviewed: boolean;
  kind?: "write" | "navigate"; targetPageId?: string;
}
export interface GuidedCommandPage { id: string; title: string }
export interface GuidedCommandTarget extends GuidedCommandPage { route: string }
export interface GuidedCommandItem { label: string; tag: string; command?: GuidedCommand }
export const newGuidedCommand = (kind: "write" | "navigate" = "write"): GuidedCommand => ({ event: "Tapped", value: "", permission: "", reviewed: false, ...(kind === "navigate" ? { kind, targetPageId: "" } : {}) });
export function guidedCommandIssues(item: GuidedCommandItem, tags: readonly PlcVariableDefinition[], requireReview = true, pages: readonly GuidedCommandPage[] = []): string[] {
  const command = item.command; if (!command) return [];
  if (typeof command !== "object" || Array.isArray(command) || Object.keys(command).some(key => !["event", "value", "permission", "reviewed", "kind", "targetPageId"].includes(key))) return ["La configurazione del comando contiene campi non supportati."];
  const issues: string[] = [];
  if (command.kind !== undefined && !["write", "navigate"].includes(command.kind)) issues.push("Scegli scrittura PLC o apertura di una pagina del piano.");
  if (!guidedCommandEvents.includes(command.event)) issues.push("Scegli click, doppio click o click destro/tocco lungo. Le scritture non partono al caricamento della pagina.");
  if (!guidedCommandPermissions.some(permission => permission.id === command.permission)) issues.push("Scegli un permesso disponibile per questo comando.");
  if (command.kind === "navigate") {
    if (typeof command.targetPageId !== "string" || !/^page-\d{1,2}$/.test(command.targetPageId) || pages.filter(page => page.id === command.targetPageId).length !== 1) issues.push("Scegli una pagina presente una sola volta nel piano. La destinazione mancante non viene sostituita automaticamente.");
    if (item.tag !== "" || command.value !== "") issues.push("Aprire una pagina non può contenere tag o valori da scrivere. Riseleziona l’azione per rimuovere il vecchio mapping.");
    if (typeof command.reviewed !== "boolean" || requireReview && command.reviewed !== true) issues.push("Controlla destinazione, evento e permesso e conferma il collegamento, oppure lascia il pulsante disabilitato.");
    return issues;
  }
  if (command.targetPageId !== undefined) issues.push("Una scrittura PLC non può contenere una destinazione pagina. Riseleziona l’azione.");
  const matches = tags.filter(tag => tag.name === item.tag && !tag.detected), tag = matches.length === 1 ? matches[0] : undefined;
  if (!tag || !["write", "read-write"].includes(tag.access)) issues.push("Scegli un tag dichiarato e scrivibile del catalogo importato.");
  if (typeof command.value !== "string" || command.value.length > 512 || /[\u0000-\u001f\u007f]/.test(command.value)) issues.push("Inserisci un valore fino a 512 caratteri, senza caratteri di controllo.");
  else if (tag) try { normalizeMqttTagValue(command.value, tag.dataType); } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    issues.push(reason.startsWith("Tipo PLC non supportato") ? `Il tipo ${tag.dataType} non è disponibile per le scritture guidate. Lascia il comando disabilitato e configura un mapping supportato nell’editor.` : `Il valore non è compatibile con ${tag.dataType}: ${reason}`);
  }
  if (requireReview && command.reviewed !== true) issues.push("Controlla tag, valore ed evento e conferma il mapping, oppure scegli di configurarlo dopo.");
  return issues;
}
export function guidedCommandBinding(item: GuidedCommandItem, tags: readonly PlcVariableDefinition[], targets: readonly GuidedCommandTarget[] = []): HmiEventBinding | undefined {
  if (!item.command) return;
  const issues = guidedCommandIssues(item, tags, true, targets); if (issues.length) throw new Error(`${item.label}: ${issues[0]}`);
  if (item.command.kind === "navigate") {
    const target = targets.find(page => page.id === item.command!.targetPageId)!;
    if (!/^\/page-\d{4}$/.test(target.route) || targets.filter(page => page.route === target.route).length !== 1) throw new Error(`${item.label}: la rotta interna della pagina non è valida o è ambigua.`);
    return newGuidedAction("navigate", target.route, item.command.event);
  }
  const tag = tags.find(tag => tag.name === item.tag)!;
  return newGuidedWriteAction(item.tag, normalizeMqttTagValue(item.command.value, tag.dataType), item.command.event);
}
export function guidedCommandAttributes(item: GuidedCommandItem, tags: readonly PlcVariableDefinition[], targets: readonly GuidedCommandTarget[] = []): string {
  const binding = guidedCommandBinding(item, tags, targets);
  if (!binding) return ' disabled data-fc-reacts="false" title="Comando da configurare e collaudare"';
  const literal = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
  return ` data-fc-reacts="true"${item.command!.kind === "navigate" ? "" : ` data-plc-variable=${literal(item.tag)}`} data-hmi-events={${literal(serializeHmiEvents([binding]))}}${item.command!.permission ? ` data-fc-user-requires=${literal(item.command!.permission)}` : ""} title=${literal(item.command!.kind === "navigate" ? "Apri la pagina scelta" : "Mapping configurato: collegamento PLC e collaudo separati")}`;
}

export function invalidateMissingGuidedNavigation(pages: readonly GuidedPage[]): GuidedPage[] {
  return pages.map(page => ({ ...page, items: page.items.map(item => item.command?.kind === "navigate" && pages.filter(target => target.id === item.command!.targetPageId).length !== 1 ? { ...item, command: { ...item.command, reviewed: false } } : item) }));
}

/** Keep bindings attached to the same named item, never to a shifted textarea row. */
export function withGuidedItemLabels<T extends GuidedCommandItem>(items: readonly T[], labels: readonly string[]): GuidedCommandItem[] {
  return labels.map(label => {
    const matches = items.filter(item => item.label.trim() === label.trim());
    const unique = labels.filter(candidate => candidate.trim() === label.trim()).length === 1;
    const previous = unique && matches.length === 1 ? matches[0] : undefined;
    return previous ? { ...previous, label, ...(previous.command && previous.label !== label ? { command: { ...previous.command, reviewed: false } } : {}) } : { label, tag: "" };
  });
}
