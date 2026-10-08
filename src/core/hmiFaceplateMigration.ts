import {
  hmiFaceplateAttribute, hmiFaceplateBindingIssues, hmiFaceplateTypeIssues, parseHmiFaceplateBinding,
  type HmiFaceplateCatalog, type HmiFaceplateEventDefinition, type HmiFaceplateInstanceBinding,
  type HmiFaceplateIssue, type HmiFaceplateTypeDefinition,
} from "./hmiFaceplates";
import type { PlcVariableDefinition } from "./plcVariables";
import type { EditorDocument, EditorNode, RenderedInfo } from "./types";
import { readStaticAttributeForInstance } from "../source-parser/transformSource";

export function selectedFaceplateBinding(document: EditorDocument | undefined, node: EditorNode | undefined, info?: RenderedInfo): HmiFaceplateInstanceBinding | undefined {
  if (!node) return undefined;
  const staticBinding = parseHmiFaceplateBinding(node.props[hmiFaceplateAttribute]);
  if (staticBinding) return staticBinding;
  const index = info?.listIndex ?? info?.instanceIndex;
  if (!document || index == null || !node.dynamicProps?.includes(hmiFaceplateAttribute)) return undefined;
  try { return parseHmiFaceplateBinding(readStaticAttributeForInstance(document.source, node.source.start, node.source.end, hmiFaceplateAttribute, index)); }
  catch { return undefined; }
}

export type FaceplateInterfaceKind = "tag" | "property" | "event";
export interface FaceplateVersionChange {
  section: string;
  name: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
}
export interface FaceplateMigrationOptions {
  tagSources?: Record<string, string>;
  propertySources?: Record<string, string>;
  eventSources?: Record<string, string>;
  tagValues?: Record<string, string>;
  propertyValues?: Record<string, string | number | boolean>;
}
export interface FaceplateMigrationLoss {
  kind: FaceplateInterfaceKind;
  name: string;
}
export interface FaceplateMigrationPlan {
  binding?: HmiFaceplateInstanceBinding;
  changes: FaceplateVersionChange[];
  losses: FaceplateMigrationLoss[];
  issues: HmiFaceplateIssue[];
}

const typeName = (value: string) => value.replace(/\s+/g, "").toUpperCase();
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const sameEvent = (a: HmiFaceplateEventDefinition, b: HmiFaceplateEventDefinition) =>
  a.parameters.length === b.parameters.length && a.parameters.every((parameter, index) =>
    parameter.name === b.parameters[index].name && typeName(parameter.dataType) === typeName(b.parameters[index].dataType));

export function faceplateMigrationSources(before: HmiFaceplateTypeDefinition, after: HmiFaceplateTypeDefinition, kind: FaceplateInterfaceKind, name: string): string[] {
  if (kind === "event") {
    const target = after.interfaceEvents.find((item) => item.name === name);
    return target ? before.interfaceEvents.filter((item) => sameEvent(item, target)).map((item) => item.name) : [];
  }
  const source = kind === "tag" ? before.interfaceTags : before.interfaceProperties;
  const target = (kind === "tag" ? after.interfaceTags : after.interfaceProperties).find((item) => item.name === name);
  return target ? source.filter((item) => typeName(item.dataType) === typeName(target.dataType)).map((item) => item.name) : [];
}

export function diffHmiFaceplateTypes(before: HmiFaceplateTypeDefinition, after: HmiFaceplateTypeDefinition): FaceplateVersionChange[] {
  const changes: FaceplateVersionChange[] = [];
  const compare = <T extends { name: string }>(section: string, previous: readonly T[], next: readonly T[], describe?: (item: T) => string) => {
    for (const item of previous) if (!next.some((candidate) => candidate.name === item.name)) changes.push({ section, name: item.name, kind: "removed", ...(describe ? { before: describe(item) } : {}) });
    for (const item of next) {
      const old = previous.find((candidate) => candidate.name === item.name);
      if (!old) changes.push({ section, name: item.name, kind: "added", ...(describe ? { after: describe(item) } : {}) });
      else if (JSON.stringify(old) !== JSON.stringify(item)) changes.push({ section, name: item.name, kind: "changed", ...(describe ? { before: describe(old), after: describe(item) } : {}) });
    }
  };
  const valueText = (value: unknown) => String(value).slice(0, 180);
  compare("Tag", before.interfaceTags, after.interfaceTags, (item) => `${item.dataType} · ${item.required ? "obbligatorio" : "opzionale"}`);
  compare("Proprietà", before.interfaceProperties, after.interfaceProperties, (item) => `${item.dataType}${item.defaultValue === undefined ? " · senza predefinito" : ` · predefinito: ${valueText(item.defaultValue)}`}`);
  compare("Eventi", before.interfaceEvents, after.interfaceEvents, (item) => `${item.name}(${item.parameters.map((parameter) => `${parameter.name}: ${parameter.dataType}`).join(", ")})`);
  compare("Tag locali", before.localTags, after.localTags, (item) => `${item.dataType} · iniziale: ${item.startValue ?? "non impostato"} · limiti: ${item.minimum ?? "—"} / ${item.maximum ?? "—"}`);
  const geometry = (item: { left: number; top: number; width: number; height: number }) => `X ${item.left}, Y ${item.top}, ${item.width} × ${item.height}`;
  compare("Oggetti visuali", before.visualization.map((item) => ({ ...item, name: item.id })), after.visualization.map((item) => ({ ...item, name: item.id })), (item) => [item.type, geometry(item), item.text && `testo: ${valueText(item.text)}`, item.graphic && `grafica: ${valueText(item.graphic)}`, item.backColor && `sfondo: ${item.backColor}`, item.foreColor && `testo: ${item.foreColor}`, item.borderColor && `bordo: ${item.borderColor}`, item.fontSize && `font: ${item.fontSize}`, ...item.bindings.map((binding) => `${binding.property} ← ${binding.source}.${binding.name}`), item.event && `evento: ${item.event.name}`].filter(Boolean).join(" · "));
  compare("Faceplate annidati", before.nestedInstances.map((item) => ({ ...item, name: item.id })), after.nestedInstances.map((item) => ({ ...item, name: item.id })), (item) => [`${item.typeId} V${item.version}`, geometry(item), ...Object.entries(item.tagBindings).map(([name, source]) => `tag ${name} ← ${source}`), ...Object.entries(item.propertyBindings).map(([name, source]) => `proprietà ${name} ← ${source}`)].join(" · "));
  if (before.width !== after.width || before.height !== after.height) changes.push({ section: "Dimensioni", name: `${before.width} × ${before.height} → ${after.width} × ${after.height}`, kind: "changed" });
  if (before.source !== after.source) changes.push({ section: "Sorgente", name: "Riferimento del tipo", kind: "changed", before: before.source || "Non impostato", after: after.source || "Non impostato" });
  return changes;
}

export function planHmiFaceplateMigration(binding: HmiFaceplateInstanceBinding, catalog: HmiFaceplateCatalog,
  targetKey: string, variables: readonly PlcVariableDefinition[] = [], options: FaceplateMigrationOptions = {}): FaceplateMigrationPlan {
  const before = catalog.types.find((item) => item.id === binding.typeId && item.version === binding.version);
  const after = catalog.types.find((item) => `${item.id}@${item.version}` === targetKey);
  const fail = (message: string): FaceplateMigrationPlan => ({ changes: [], losses: [], issues: [{ severity: "error", message }] });
  if (!before || before.status !== "released") return fail("La versione attuale non è rilasciata nel catalogo. Ripristina il tipo prima di migrare l’istanza.");
  if (!after || after.status !== "released") return fail("Scegli una versione rilasciata presente nel catalogo.");
  if (before === after) return fail("L’istanza usa già questa versione.");
  const issues = hmiFaceplateTypeIssues(after, catalog);
  if (before.id !== after.id) issues.push({ severity: "warning", message: "Stai sostituendo il tipo: i collegamenti non vengono trasferiti automaticamente. Scegli quelli da conservare." });
  const next: HmiFaceplateInstanceBinding = { typeId: after.id, version: after.version, tagBindings: Object.create(null), propertyValues: Object.create(null), eventBindings: Object.create(null) };
  const used = { tag: new Set<string>(), property: new Set<string>(), event: new Set<string>() };
  const source = (kind: FaceplateInterfaceKind, name: string, mappings: Record<string, string> | undefined) => {
    const candidates = faceplateMigrationSources(before, after, kind, name);
    const mapped = mappings && own(mappings, name) ? mappings[name] : before.id === after.id && candidates.includes(name) ? name : "";
    if (mapped && !candidates.includes(mapped)) {
      issues.push({ severity: "error", message: `Il collegamento da «${mapped}» a «${name}» non è compatibile. Scegli un campo dello stesso tipo o configura un nuovo valore.` });
      return "";
    }
    return mapped;
  };
  for (const item of after.interfaceTags) {
    const mapped = source("tag", item.name, options.tagSources);
    const original = mapped && own(binding.tagBindings, mapped) ? binding.tagBindings[mapped] : undefined;
    const value = own(options.tagValues ?? {}, item.name) ? options.tagValues![item.name].trim() : original;
    if (value) next.tagBindings[item.name] = value;
    if (mapped && original && value === original) used.tag.add(mapped);
  }
  for (const item of after.interfaceProperties) {
    const mapped = source("property", item.name, options.propertySources);
    const original = mapped && own(binding.propertyValues, mapped) ? binding.propertyValues[mapped] : undefined;
    const value = own(options.propertyValues ?? {}, item.name) ? options.propertyValues![item.name] : original ?? item.defaultValue;
    if (value !== undefined) next.propertyValues[item.name] = value;
    if (mapped && original !== undefined && value === original) used.property.add(mapped);
    if (value !== undefined && item.dataType === "Bool" && typeof value !== "boolean") issues.push({ severity: "error", message: `«${item.name}» richiede True o False.` });
    if (value !== undefined && item.dataType === "LReal" && ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value)))) issues.push({ severity: "error", message: `«${item.name}» richiede un numero finito.` });
    if (value !== undefined && (item.dataType === "Int64" || item.dataType === "UInt64")) {
      const text = String(value);
      const integer = text.length <= 21 && /^-?\d+$/.test(text) && (typeof value !== "number" || Number.isSafeInteger(value)) ? BigInt(text) : undefined;
      const minimum = item.dataType === "Int64" ? -(1n << 63n) : 0n;
      const maximum = item.dataType === "Int64" ? (1n << 63n) - 1n : (1n << 64n) - 1n;
      if (integer === undefined || integer < minimum || integer > maximum) issues.push({ severity: "error", message: `«${item.name}» richiede un intero ${item.dataType} valido, senza perdita di precisione.` });
    }
  }
  for (const item of after.interfaceEvents) {
    const mapped = source("event", item.name, options.eventSources);
    if (mapped && binding.eventBindings && own(binding.eventBindings, mapped)) {
      next.eventBindings![item.name] = { script: binding.eventBindings[mapped].script };
      used.event.add(mapped);
    }
  }
  issues.push(...hmiFaceplateBindingIssues(next, catalog, variables));
  const losses: FaceplateMigrationLoss[] = [];
  for (const name of Object.keys(binding.tagBindings)) if (binding.tagBindings[name] && !used.tag.has(name)) losses.push({ kind: "tag", name });
  for (const name of Object.keys(binding.propertyValues)) if (!used.property.has(name)) losses.push({ kind: "property", name });
  for (const name of Object.keys(binding.eventBindings ?? {})) if (!used.event.has(name)) losses.push({ kind: "event", name });
  return { binding: next, changes: diffHmiFaceplateTypes(before, after), losses, issues };
}
