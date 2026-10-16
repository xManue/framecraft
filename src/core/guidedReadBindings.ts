import { normalizeMqttTagValue } from "../../runtime/connection-config.mjs";
import type { GuidedItem, GuidedPage, GuidedPageKind, GuidedProjectSpec } from "./guidedProject";
import type { PlcVariableDefinition } from "./plcVariables";
import { guidedLogBindingIssue } from "./guidedDataLogs";
import type { HmiDataLogCatalog } from "./hmiDataLogs";
const readKinds: readonly GuidedPageKind[] = ["overview", "synoptic", "values", "trend", "function-trend"];
const numericKind = (kind: GuidedPageKind) => kind === "trend" || kind === "function-trend";
export function guidedReadBindingFields(kind: GuidedPageKind, item: GuidedItem) {
  return kind === "function-trend" ? [{ field: "xTag" as const, axis: "X", tag: item.xTag ?? "", logged: item.xLogged }, { field: "tag" as const, axis: "Y", tag: item.tag, logged: item.logged }] : [{ field: "tag" as const, axis: undefined, tag: item.tag, logged: item.logged }];
}
const typeLabel = (value: string) => typeof value !== "string" || !value ? "tipo mancante" : value.length > 80 ? `${value.slice(0, 77)}...` : value;

function scalarType(dataType: string, numeric: boolean) {
  if (typeof dataType !== "string" || dataType.length > 80) return false;
  const type = dataType.toLowerCase();
  try {
    // Type checking only: no sample value is stored, displayed or sent to a driver.
    const sample = ["bool", "boolean"].includes(type) ? false : ["string", "wstring"].includes(type) ? "" : 0;
    const value = normalizeMqttTagValue(sample, dataType);
    return !numeric || typeof value === "number";
  } catch { return false; }
}
function declaredTags(tags: readonly PlcVariableDefinition[]) {
  const byName = new Map<string, PlcVariableDefinition[]>();
  for (const tag of tags) if (!tag.detected) {
    const entries = byName.get(tag.name);
    if (entries) entries.push(tag); else byName.set(tag.name, [tag]);
  }
  return byName;
}
function readIssue(name: string, kind: GuidedPageKind, catalog: ReadonlyMap<string, PlcVariableDefinition[]>) {
  if (!readKinds.includes(kind)) return "Questa funzione pagina non prevede elementi con letture guidate. Scegli una pagina valori, sinottico, vista macchina o trend.";
  if (!name) return;
  const matches = catalog.get(name) ?? [];
  if (matches.length !== 1) return "Scegli un tag dichiarato una sola volta nel catalogo importato, oppure lascia il collegamento da completare.";
  const tag = matches[0];
  if (!["read", "read-write"].includes(tag.access)) return "Il tag è di sola scrittura: per mostrare un valore serve un segnale leggibile.";
  if (!scalarType(tag.dataType, numericKind(kind))) return numericKind(kind)
    ? `La curva richiede un tag numerico scalare supportato; ${typeLabel(tag.dataType)} non è compatibile. Testi, BOOL, array e strutture non diventano curve numeriche automaticamente.`
    : `Il tipo ${typeLabel(tag.dataType)} non è supportato dai collegamenti scalari guidati. Array e strutture richiedono un mapping dedicato.`;
}
export function guidedReadBindingTags(kind: GuidedPageKind, tags: readonly PlcVariableDefinition[]) {
  if (!readKinds.includes(kind)) return [];
  const catalog = declaredTags(tags);
  return tags.filter(tag => !tag.detected && catalog.get(tag.name)?.length === 1 && ["read", "read-write"].includes(tag.access) && scalarType(tag.dataType, numericKind(kind)));
}
export function guidedReadBindingIssues(page: Pick<GuidedPage, "kind" | "items">, tags: readonly PlcVariableDefinition[], dataLogs?: HmiDataLogCatalog): string[] {
  const extra = page.items.filter(item => item.xTag !== undefined && (page.kind !== "function-trend" || typeof item.xTag !== "string" || item.xTag.length > 200 || /[\u0000-\u001f]/.test(item.xTag))).map(item => `${item.label}: il collegamento X richiede una pagina X/Y e un nome tag valido fino a 200 caratteri.`);
  for (const item of page.items) if (item.logged !== undefined && !numericKind(page.kind) || item.xLogged !== undefined && page.kind !== "function-trend") extra.push(`${item.label}: le sorgenti archiviate richiedono una pagina trend temporale o X/Y.`);
  if (extra.length || page.kind === "commands") return extra;
  const catalog = declaredTags(tags);
  return page.items.flatMap(item => guidedReadBindingFields(page.kind, item).flatMap(binding => { const issue = binding.logged !== undefined ? guidedLogBindingIssue(binding.logged, binding.tag, dataLogs) ?? readIssue(binding.tag, page.kind, catalog) : readIssue(binding.tag, page.kind, catalog); return issue ? [`${item.label}${binding.axis ? ` · asse ${binding.axis}` : ""}: ${issue}`] : []; }));
}
export function guidedReadBindings(spec: GuidedProjectSpec) {
  const catalog = declaredTags(spec.tagsMode === "import" ? spec.tags : []);
  return spec.pages.filter(page => page.kind !== "commands").flatMap(page => page.items.flatMap((item, index) => guidedReadBindingFields(page.kind, item).map(binding => {
    const issue = binding.logged !== undefined ? guidedLogBindingIssue(binding.logged, binding.tag, spec.dataLogs) ?? readIssue(binding.tag, page.kind, catalog) : readIssue(binding.tag, page.kind, catalog);
    const log = binding.logged && spec.dataLogs?.logs.find(log => log.id === binding.logged!.logId);
    return { pageId: page.id, pageTitle: page.title, index, axis: binding.axis, label: item.label, tag: binding.tag, source: binding.logged ? "log" as const : "online" as const, logName: log?.name,
      dataType: catalog.get(binding.tag)?.length === 1 ? typeLabel(catalog.get(binding.tag)![0].dataType) : undefined,
      state: issue ? "invalid" as const : binding.tag ? "configured" as const : "unmapped" as const, issue };
  })));
}
