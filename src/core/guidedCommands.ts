import { normalizeMqttTagValue } from "../../runtime/connection-config.mjs";
import { newGuidedWriteAction } from "./hmiActions";
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
}
export interface GuidedCommandItem { label: string; tag: string; command?: GuidedCommand }
export const newGuidedCommand = (): GuidedCommand => ({ event: "Tapped", value: "", permission: "", reviewed: false });
export function guidedCommandIssues(item: GuidedCommandItem, tags: readonly PlcVariableDefinition[], requireReview = true): string[] {
  const command = item.command; if (!command) return [];
  if (typeof command !== "object" || Array.isArray(command) || Object.keys(command).some(key => !["event", "value", "permission", "reviewed"].includes(key))) return ["La configurazione del comando contiene campi non supportati."];
  const issues: string[] = [];
  if (!guidedCommandEvents.includes(command.event)) issues.push("Scegli click, doppio click o click destro/tocco lungo. Le scritture non partono al caricamento della pagina.");
  if (!guidedCommandPermissions.some(permission => permission.id === command.permission)) issues.push("Scegli un permesso disponibile per questo comando.");
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
export function guidedCommandBinding(item: GuidedCommandItem, tags: readonly PlcVariableDefinition[]): HmiEventBinding | undefined {
  if (!item.command) return;
  const issues = guidedCommandIssues(item, tags); if (issues.length) throw new Error(`${item.label}: ${issues[0]}`);
  const tag = tags.find(tag => tag.name === item.tag)!;
  return newGuidedWriteAction(item.tag, normalizeMqttTagValue(item.command.value, tag.dataType), item.command.event);
}
export function guidedCommandAttributes(item: GuidedCommandItem, tags: readonly PlcVariableDefinition[]): string {
  const binding = guidedCommandBinding(item, tags);
  if (!binding) return ' disabled data-fc-reacts="false" title="Comando da configurare e collaudare"';
  const literal = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
  return ` data-fc-reacts="true" data-plc-variable=${literal(item.tag)} data-hmi-events={${literal(serializeHmiEvents([binding]))}}${item.command!.permission ? ` data-fc-user-requires=${literal(item.command!.permission)}` : ""} title="Mapping configurato: collegamento PLC e collaudo separati"`;
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
