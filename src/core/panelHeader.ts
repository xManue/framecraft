import { resolveHmiTagReference, type HmiTagStatus } from "./hmiTagBinding";

export const panelHeaderFields = [
  { id: "lineNumber", label: "Numero linea", numeric: true },
  { id: "formatNumber", label: "Numero formato", numeric: true },
  { id: "formatName", label: "Nome formato", numeric: false },
  { id: "state", label: "Stato macchina", numeric: false },
  { id: "mode", label: "Modalità macchina", numeric: false },
  { id: "speed", label: "Velocità", numeric: true },
] as const;
export type PanelHeaderField = typeof panelHeaderFields[number]["id"];
export interface PanelHeaderConfig { version: 1; tags: Partial<Record<PanelHeaderField, string>>; speedUnit?: string; speedMin?: string; speedMax?: string }
interface HeaderTag { name: string; dataType: string; access: string; detected?: boolean }
export const newPanelHeader = (): PanelHeaderConfig => ({ version: 1, tags: {} });
export function panelClockText(value: Date, language: string) {
  const format = (locale?: string) => ({ time: value.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }), weekday: value.toLocaleDateString(locale, { weekday: "short" }), date: value.toLocaleDateString(locale) });
  try { return format(language); } catch { return format(); }
}
const number = (text: unknown) => typeof text === "string" && text.length <= 40 && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) && Number.isFinite(Number(text)) ? Number(text) : undefined;
export function panelHeaderTags(tags: readonly HeaderTag[], numeric: boolean) {
  return tags.filter(tag => !tag.detected && ["read", "read-write"].includes(tag.access) && (/^(?:U?S?INT|U?D?INT|U?L?INT|BYTE|WORD|DWORD|LWORD|REAL|LREAL|FLOAT|DOUBLE|NUMBER)$/i.test(tag.dataType.trim()) || !numeric && /^(?:BOOL|BOOLEAN|W?STRING)$/i.test(tag.dataType.trim())));
}
export function panelHeaderScale(config: PanelHeaderConfig) {
  const min = number(config.speedMin), max = number(config.speedMax);
  return min !== undefined && max !== undefined && min < max && Number.isFinite(max - min) ? { min, max } : undefined;
}
export function panelHeaderIssues(value: unknown, tags: readonly HeaderTag[]): string[] {
  if (value === undefined) return [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Barra del pannello: configurazione non valida."];
  const c = value as PanelHeaderConfig;
  if (c.version !== 1 || Object.keys(c).some(key => !["version", "tags", "speedUnit", "speedMin", "speedMax"].includes(key)) || !c.tags || typeof c.tags !== "object" || Array.isArray(c.tags) || Object.keys(c.tags).some(key => !panelHeaderFields.some(field => field.id === key))) return ["Barra del pannello: versione o campi non supportati."];
  const issues: string[] = [];
  for (const field of panelHeaderFields) {
    const tag = c.tags[field.id];
    if (tag !== undefined && (typeof tag !== "string" || tag.length > 200 || tag && panelHeaderTags(tags, field.numeric).filter(item => item.name === tag).length !== 1)) issues.push(`Barra del pannello: ${field.label} richiede un tag scalare leggibile del catalogo${field.numeric ? ", di tipo numerico" : ""}.`);
  }
  if (c.speedUnit !== undefined && (typeof c.speedUnit !== "string" || c.speedUnit.length > 24 || /[\x00-\x1f]/.test(c.speedUnit))) issues.push("Barra del pannello: unità di misura breve, senza caratteri di controllo.");
  if ((c.speedMin || c.speedMax) && !panelHeaderScale(c)) issues.push("Barra del pannello: indica entrambi i limiti numerici della velocità, con massimo maggiore del minimo, oppure lasciali vuoti.");
  for (const key of ["speedMin", "speedMax"] as const) if (c[key] !== undefined && typeof c[key] !== "string") issues.push("Barra del pannello: i limiti devono essere testi numerici validi.");
  return issues;
}
export function panelHeaderReading(tag: string | undefined, numeric: boolean, values: Readonly<Record<string, string>>, status: Readonly<Record<string, HmiTagStatus>>) {
  if (!tag) return { text: "—", reason: "Dato da collegare: scegli un tag reale nella procedura iniziale o configura il pannello." };
  const result = resolveHmiTagReference({ property: "Text", tag }, values, [], status, true);
  if ("reason" in result) return { text: "—", reason: result.reason };
  const value = numeric ? number(result.value) : undefined;
  return numeric && value === undefined ? { text: "—", reason: "Il segnale non contiene un numero valido. Controlla tipo dato e mapping PLC." } : { text: result.value, value };
}
