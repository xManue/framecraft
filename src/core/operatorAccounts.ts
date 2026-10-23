import { OperatorAuthError, operatorCapabilities, operatorText, operatorUsername, parseOperatorResources, type OperatorAuthConfig, type OperatorCapability, type OperatorResourceRule } from "../../runtime/operator-policy.mjs";
import type { OperatorAdminCommand, OperatorAccountSummary } from "../../runtime/operator-admin.mjs";
export type { OperatorAdminCommand, OperatorAccountSummary, OperatorAuthConfig, OperatorCapability };
export interface OperatorAccountsSnapshot { generation: number; configuration: string | null; version: 1 | 2 | null; resourceRules: OperatorResourceRule[]; revision: string | null; accounts: OperatorAccountSummary[] }
export function operatorAdminJournalKey(namespace: string, root: string): string {
  let path = root.replaceAll("\\", "/").replace(/\/+$/, "");
  if (/^[A-Za-z]:\//.test(path) || path.startsWith("//")) path = path.toLowerCase();
  return "framecraft:operator-admin-pending:" + namespace + ":" + encodeURIComponent(path);
}
export const operatorCapabilityLabels: Record<OperatorCapability, string> = {
  "audit.read": "Consultare il registro attività del servizio",
  "alarms.history.read": "Consultare tutto l’archivio storico degli allarmi",
  "recipes.import": "Importare più ricette da file (creazione e sostituzione)",
  "recipes.capture": "Leggere i valori PLC dei campi ricetta autorizzati",
  "recipes.read": "Leggere l’archivio ricette", "recipes.create": "Creare ricette", "recipes.update": "Modificare ricette", "recipes.copy": "Copiare ricette", "recipes.rename": "Rinominare ricette", "recipes.delete": "Eliminare ricette",
  "alarms.acknowledge": "Prendere visione degli allarmi", "alarms.confirm": "Confermare gli allarmi", "tags.write": "Scrivere le variabili PLC abilitate",
};
export function operatorAccountIssues(command: OperatorAdminCommand, existing: readonly OperatorAccountSummary[]): string[] {
  if (command.action === "disable") return [];
  const issues: string[] = [];
  if (command.action === "resources") { try { parseOperatorResources(command.limits); } catch { issues.push("Risorse: inserisci al massimo 256 ID univoci per gruppo, uno per riga, senza righe vuote o spazi iniziali/finali; massimo 200 caratteri per ID."); } return issues; }
  if (command.action === "add" && (!operatorUsername(command.username) || existing.some(item => item.username === command.username))) issues.push("Scegli un nome utente univoco: minuscole, numeri, punto, trattino o underscore; massimo 64 caratteri.");
  if (command.action === "add" || command.action === "update") {
    if (!operatorText(command.name)) issues.push("Nome visualizzato obbligatorio, senza spazi iniziali/finali o caratteri di controllo; massimo 160 caratteri.");
    if (!operatorText(command.role, 80)) issues.push("Etichetta ruolo obbligatoria; massimo 80 caratteri. Il ruolo non assegna permessi.");
    if (new Set(command.capabilities).size !== command.capabilities.length || command.capabilities.some(id => !operatorCapabilities.includes(id))) issues.push("Seleziona soltanto le capacità server disponibili.");
    if (command.permissions.length > 64 || new Set(command.permissions).size !== command.permissions.length || command.permissions.some(id => !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(id))) issues.push("Permessi grafici: massimo 64 ID univoci, con lettere, numeri, punto, trattino o underscore.");
  }
  if (command.action === "add" || command.action === "password") { const value = command.password; if ([...value].length < 12 || value.length > 256 || value.includes("\0") || new TextEncoder().encode(value).length > 1024) issues.push("La password deve avere almeno 12 caratteri e al massimo 256, senza caratteri nulli."); }
  return issues;
}
export function operatorAdminError(value: unknown): OperatorAuthError {
  const code = value instanceof OperatorAuthError ? value.code : typeof value === "string" && /^AUTH_[A-Z_]+$/.test(value) ? value : "AUTH_STORE";
  return new OperatorAuthError(code);
}
