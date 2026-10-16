import { normalizeMqttTagValue } from "../../runtime/connection-config.mjs";
import type { GuidedItem, GuidedPage, GuidedPageKind, GuidedProjectSpec } from "./guidedProject";
import type { PlcVariableDefinition } from "./plcVariables";
const readKinds: readonly GuidedPageKind[] = ["overview", "synoptic", "values", "trend"];
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
function readIssue(item: GuidedItem, kind: GuidedPageKind, catalog: ReadonlyMap<string, PlcVariableDefinition[]>) {
  if (!readKinds.includes(kind)) return "Questa funzione pagina non prevede elementi con letture guidate. Scegli una pagina valori, sinottico, vista macchina o trend.";
  if (!item.tag) return;
  const matches = catalog.get(item.tag) ?? [];
  if (matches.length !== 1) return "Scegli un tag dichiarato una sola volta nel catalogo importato, oppure lascia il collegamento da completare.";
  const tag = matches[0];
  if (!["read", "read-write"].includes(tag.access)) return "Il tag è di sola scrittura: per mostrare un valore serve un segnale leggibile.";
  if (!scalarType(tag.dataType, kind === "trend")) return kind === "trend"
    ? `La curva richiede un tag numerico scalare supportato; ${typeLabel(tag.dataType)} non è compatibile. Testi, BOOL, array e strutture non diventano curve numeriche automaticamente.`
    : `Il tipo ${typeLabel(tag.dataType)} non è supportato dai collegamenti scalari guidati. Array e strutture richiedono un mapping dedicato.`;
}
export function guidedReadBindingTags(kind: GuidedPageKind, tags: readonly PlcVariableDefinition[]) {
  if (!readKinds.includes(kind)) return [];
  const catalog = declaredTags(tags);
  return tags.filter(tag => !tag.detected && catalog.get(tag.name)?.length === 1 && ["read", "read-write"].includes(tag.access) && scalarType(tag.dataType, kind === "trend"));
}
export function guidedReadBindingIssues(page: Pick<GuidedPage, "kind" | "items">, tags: readonly PlcVariableDefinition[]): string[] {
  if (page.kind === "commands") return [];
  const catalog = declaredTags(tags);
  return page.items.flatMap(item => { const issue = readIssue(item, page.kind, catalog); return issue ? [`${item.label}: ${issue}`] : []; });
}
export function guidedReadBindings(spec: GuidedProjectSpec) {
  const catalog = declaredTags(spec.tagsMode === "import" ? spec.tags : []);
  return spec.pages.filter(page => page.kind !== "commands").flatMap(page => page.items.map((item, index) => {
    const issue = readIssue(item, page.kind, catalog);
    return { pageId: page.id, pageTitle: page.title, index, label: item.label, tag: item.tag,
      dataType: catalog.get(item.tag)?.length === 1 ? typeLabel(catalog.get(item.tag)![0].dataType) : undefined,
      state: issue ? "invalid" as const : item.tag ? "configured" as const : "unmapped" as const, issue };
  }));
}
