import type { PlcVariableDefinition } from "./plcVariables";
import { inspectHmiScript, type HmiScriptProgram } from "./hmiScript";

export const hmiFaceplateCatalogName = "framecraft.faceplates.json";
export const hmiFaceplateAttribute = "data-hmi-faceplate";

export const hmiFaceplatePropertyTypes = [
  "Int64", "Authorization", "Bool", "Color", "LReal", "Graphic", "ConfigurationString",
  "MultilingualText", "ParameterSetControl", "ResourceList", "UInt64",
] as const;
export type HmiFaceplatePropertyType = (typeof hmiFaceplatePropertyTypes)[number];

export const hmiFaceplateEventParameterTypes = [
  "Bool", "Byte", "Char", "Color", "DateTime", "DInt", "DWord", "HmiEventTrigger", "HmiGesture",
  "HmiKeyboardModifier", "Int", "LInt", "LReal", "LString", "LWord", "Real", "SInt", "String",
  "Time", "UDInt", "UInt", "ULInt", "USInt", "Word",
] as const;
export type HmiFaceplateEventParameterType = (typeof hmiFaceplateEventParameterTypes)[number];

export interface HmiFaceplateTagDefinition {
  name: string;
  dataType: string;
  required?: boolean;
}

export interface HmiFaceplatePropertyDefinition {
  name: string;
  dataType: HmiFaceplatePropertyType;
  defaultValue?: string | number | boolean;
}

export interface HmiFaceplateEventParameter {
  name: string;
  dataType: HmiFaceplateEventParameterType;
}

export interface HmiFaceplateEventDefinition {
  name: string;
  parameters: HmiFaceplateEventParameter[];
}

export interface HmiFaceplateLocalTagDefinition {
  name: string;
  dataType: string;
  startValue?: string;
  minimum?: number;
  maximum?: number;
}

export const hmiFaceplateVisualObjectTypes = ["rectangle", "ellipse", "text", "io-field", "button", "bar", "graphic"] as const;
export type HmiFaceplateVisualObjectType = (typeof hmiFaceplateVisualObjectTypes)[number];
export const hmiFaceplateVisualProperties = ["Text", "ProcessValue", "BackColor", "ForeColor", "BorderColor", "Visible", "Enabled", "Left", "Top", "Width", "Height", "Graphic"] as const;
export type HmiFaceplateVisualProperty = (typeof hmiFaceplateVisualProperties)[number];
export type HmiFaceplateVisualSource = "tag" | "property" | "local";

export interface HmiFaceplateVisualBinding {
  property: HmiFaceplateVisualProperty;
  source: HmiFaceplateVisualSource;
  name: string;
}

export interface HmiFaceplateVisualObject {
  id: string;
  type: HmiFaceplateVisualObjectType;
  left: number;
  top: number;
  width: number;
  height: number;
  text?: string;
  backColor?: string;
  foreColor?: string;
  borderColor?: string;
  graphic?: string;
  fontSize?: number;
  bindings: HmiFaceplateVisualBinding[];
  event?: { name: string; parameters: Record<string, string | number | boolean> };
}

export interface HmiFaceplateNestedInstance {
  id: string;
  typeId: string;
  version: string;
  tagBindings: Record<string, string>;
  propertyBindings: Record<string, string>;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HmiFaceplateTypeDefinition {
  id: string;
  name: string;
  version: string;
  status: "draft" | "released";
  width: number;
  height: number;
  source?: string;
  interfaceTags: HmiFaceplateTagDefinition[];
  interfaceProperties: HmiFaceplatePropertyDefinition[];
  interfaceEvents: HmiFaceplateEventDefinition[];
  localTags: HmiFaceplateLocalTagDefinition[];
  visualization: HmiFaceplateVisualObject[];
  nestedInstances: HmiFaceplateNestedInstance[];
}

export interface HmiFaceplateCatalog {
  version: 1;
  types: HmiFaceplateTypeDefinition[];
}

export interface HmiFaceplateInstanceBinding {
  typeId: string;
  version: string;
  tagBindings: Record<string, string>;
  propertyValues: Record<string, string | number | boolean>;
  eventBindings?: Record<string, HmiFaceplateEventBinding>;
}

export interface HmiFaceplateEventBinding {
  script: string;
  program?: HmiScriptProgram;
}

export interface HmiFaceplateIssue {
  severity: "error" | "warning";
  message: string;
}

const faceplateName = /^[A-Za-z_][A-Za-z0-9_ ]{0,127}$/;
const interfaceName = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const versionName = /^\d+\.\d+\.\d+$/;

function positive(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function propertyRecord(value: unknown): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, string | number | boolean] => ["string", "number", "boolean"].includes(typeof entry[1])));
}

function eventBindingRecord(value: unknown): Record<string, HmiFaceplateEventBinding> {
  return Object.fromEntries(Object.entries(record(value)).flatMap(([name, raw]) => {
    const item = record(raw);
    if (!interfaceName.test(name) || typeof item.script !== "string" || !item.script.trim()) return [];
    const script = item.script.trim();
    const inspection = inspectHmiScript(script);
    const serialized = item.program as HmiScriptProgram | undefined;
    const program = serialized?.version === 1 && Array.isArray(serialized.statements) ? serialized : inspection.program;
    return [[name, { script, ...(program ? { program } : {}) }]];
  }));
}

function normalizeTag(value: unknown): HmiFaceplateTagDefinition | undefined {
  const item = record(value);
  if (typeof item.name !== "string" || !item.name.trim()) return undefined;
  return { name: item.name.trim(), dataType: typeof item.dataType === "string" ? item.dataType.trim() : "", ...(item.required ? { required: true } : {}) };
}

function normalizeProperty(value: unknown): HmiFaceplatePropertyDefinition | undefined {
  const item = record(value);
  if (typeof item.name !== "string" || !item.name.trim()) return undefined;
  const dataType = hmiFaceplatePropertyTypes.includes(item.dataType as HmiFaceplatePropertyType) ? item.dataType as HmiFaceplatePropertyType : "ConfigurationString";
  const defaultValue = item.defaultValue;
  return { name: item.name.trim(), dataType, ...(["string", "number", "boolean"].includes(typeof defaultValue) ? { defaultValue: defaultValue as string | number | boolean } : {}) };
}

function normalizeEvent(value: unknown): HmiFaceplateEventDefinition | undefined {
  const item = record(value);
  if (typeof item.name !== "string" || !item.name.trim()) return undefined;
  const parameters = Array.isArray(item.parameters) ? item.parameters.flatMap((parameter) => {
    const current = record(parameter);
    if (typeof current.name !== "string" || !current.name.trim()) return [];
    const dataType = hmiFaceplateEventParameterTypes.includes(current.dataType as HmiFaceplateEventParameterType) ? current.dataType as HmiFaceplateEventParameterType : "Int";
    return [{ name: current.name.trim(), dataType }];
  }) : [];
  return { name: item.name.trim(), parameters };
}

function normalizeLocalTag(value: unknown): HmiFaceplateLocalTagDefinition | undefined {
  const item = record(value);
  if (typeof item.name !== "string" || !item.name.trim()) return undefined;
  const minimum = Number(item.minimum); const maximum = Number(item.maximum);
  return {
    name: item.name.trim(), dataType: typeof item.dataType === "string" ? item.dataType.trim() : "",
    ...(typeof item.startValue === "string" ? { startValue: item.startValue } : {}),
    ...(Number.isFinite(minimum) ? { minimum } : {}), ...(Number.isFinite(maximum) ? { maximum } : {}),
  };
}

function normalizeNested(value: unknown): HmiFaceplateNestedInstance | undefined {
  const item = record(value);
  if (typeof item.id !== "string" || !item.id.trim() || typeof item.typeId !== "string" || !item.typeId.trim()) return undefined;
  return {
    id: item.id.trim(), typeId: item.typeId.trim(), version: typeof item.version === "string" ? item.version.trim() : "",
    tagBindings: stringRecord(item.tagBindings), propertyBindings: stringRecord(item.propertyBindings),
    left: Number.isFinite(Number(item.left)) ? Math.round(Number(item.left)) : 0,
    top: Number.isFinite(Number(item.top)) ? Math.round(Number(item.top)) : 0,
    width: positive(item.width, 120), height: positive(item.height, 80),
  };
}

function normalizeVisualBinding(value: unknown): HmiFaceplateVisualBinding | undefined {
  const item = record(value);
  if (!hmiFaceplateVisualProperties.includes(item.property as HmiFaceplateVisualProperty)
    || !["tag", "property", "local"].includes(String(item.source))
    || typeof item.name !== "string" || !item.name.trim()) return undefined;
  return { property: item.property as HmiFaceplateVisualProperty, source: item.source as HmiFaceplateVisualSource, name: item.name.trim() };
}

function normalizeVisualObject(value: unknown, index: number): HmiFaceplateVisualObject | undefined {
  const item = record(value);
  const type = hmiFaceplateVisualObjectTypes.includes(item.type as HmiFaceplateVisualObjectType) ? item.type as HmiFaceplateVisualObjectType : undefined;
  if (!type) return undefined;
  const scalar = (name: string) => typeof item[name] === "string" && String(item[name]).trim() ? String(item[name]).trim() : undefined;
  const fontSize = Number(item.fontSize);
  const event = record(item.event);
  const parameters = propertyRecord(event.parameters);
  return {
    id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `Object_${index + 1}`,
    type,
    left: Number.isFinite(Number(item.left)) ? Math.round(Number(item.left)) : 0,
    top: Number.isFinite(Number(item.top)) ? Math.round(Number(item.top)) : 0,
    width: positive(item.width, type === "text" ? 120 : 80), height: positive(item.height, type === "text" ? 28 : 48),
    ...(scalar("text") ? { text: scalar("text") } : {}), ...(scalar("backColor") ? { backColor: scalar("backColor") } : {}),
    ...(scalar("foreColor") ? { foreColor: scalar("foreColor") } : {}), ...(scalar("borderColor") ? { borderColor: scalar("borderColor") } : {}),
    ...(scalar("graphic") ? { graphic: scalar("graphic") } : {}), ...(Number.isFinite(fontSize) && fontSize > 0 ? { fontSize } : {}),
    bindings: Array.isArray(item.bindings) ? item.bindings.map(normalizeVisualBinding).filter((entry): entry is HmiFaceplateVisualBinding => Boolean(entry)) : [],
    ...(typeof event.name === "string" && event.name.trim() ? { event: { name: event.name.trim(), parameters } } : {}),
  };
}

function normalizeType(value: unknown, index: number): HmiFaceplateTypeDefinition | undefined {
  const item = record(value);
  if (typeof item.name !== "string" || !item.name.trim()) return undefined;
  const name = item.name.trim();
  const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `faceplate-${index + 1}`;
  return {
    id, name, version: typeof item.version === "string" && item.version.trim() ? item.version.trim().replace(/^V/i, "") : "0.0.1",
    status: item.status === "released" ? "released" : "draft",
    width: positive(item.width, 240), height: positive(item.height, 120),
    ...(typeof item.source === "string" && item.source.trim() ? { source: item.source.trim() } : {}),
    interfaceTags: Array.isArray(item.interfaceTags) ? item.interfaceTags.map(normalizeTag).filter((entry): entry is HmiFaceplateTagDefinition => Boolean(entry)) : [],
    interfaceProperties: Array.isArray(item.interfaceProperties) ? item.interfaceProperties.map(normalizeProperty).filter((entry): entry is HmiFaceplatePropertyDefinition => Boolean(entry)) : [],
    interfaceEvents: Array.isArray(item.interfaceEvents) ? item.interfaceEvents.map(normalizeEvent).filter((entry): entry is HmiFaceplateEventDefinition => Boolean(entry)) : [],
    localTags: Array.isArray(item.localTags) ? item.localTags.map(normalizeLocalTag).filter((entry): entry is HmiFaceplateLocalTagDefinition => Boolean(entry)) : [],
    visualization: Array.isArray(item.visualization) ? item.visualization.map(normalizeVisualObject).filter((entry): entry is HmiFaceplateVisualObject => Boolean(entry)) : [],
    nestedInstances: Array.isArray(item.nestedInstances) ? item.nestedInstances.map(normalizeNested).filter((entry): entry is HmiFaceplateNestedInstance => Boolean(entry)) : [],
  };
}

export function emptyHmiFaceplateCatalog(): HmiFaceplateCatalog {
  return { version: 1, types: [] };
}

export function parseHmiFaceplateCatalog(value: unknown): HmiFaceplateCatalog {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  const root = record(parsed);
  return { version: 1, types: Array.isArray(root.types) ? root.types.map(normalizeType).filter((entry): entry is HmiFaceplateTypeDefinition => Boolean(entry)) : [] };
}

export function serializeHmiFaceplateCatalog(catalog: HmiFaceplateCatalog): string {
  return `${JSON.stringify(parseHmiFaceplateCatalog(catalog), null, 2)}\n`;
}

export function parseHmiFaceplateBinding(value: unknown): HmiFaceplateInstanceBinding | undefined {
  if (value == null || value === "") return undefined;
  let parsed = value;
  if (typeof value === "string") { try { parsed = JSON.parse(value); } catch { return undefined; } }
  const item = record(parsed);
  if (typeof item.typeId !== "string" || !item.typeId.trim()) return undefined;
  return {
    typeId: item.typeId.trim(),
    version: typeof item.version === "string" ? item.version.trim().replace(/^V/i, "") : "",
    tagBindings: stringRecord(item.tagBindings),
    propertyValues: propertyRecord(item.propertyValues),
    eventBindings: eventBindingRecord(item.eventBindings),
  };
}

export function serializeHmiFaceplateBinding(binding: HmiFaceplateInstanceBinding): string {
  const eventBindings = Object.fromEntries(Object.entries(binding.eventBindings ?? {}).flatMap(([name, item]) => {
    if (!item.script.trim()) return [];
    const inspection = inspectHmiScript(item.script);
    return [[name, { script: item.script.trim(), ...(inspection.program ? { program: inspection.program } : {}) }]];
  }));
  return JSON.stringify(parseHmiFaceplateBinding({ ...binding, eventBindings }));
}

function normalizedPlcType(value: string): string {
  return value.replace(/\s+/g, "").replace(/^Array\[/i, "Array[").toLocaleUpperCase();
}

const lrealCompatible = new Set(["BOOL", "BYTE", "CHAR", "SINT", "USINT", "INT", "UINT", "DINT", "UDINT", "REAL", "LREAL"]);

export function hmiFaceplateTagCompatible(interfaceType: string, plcType: string): boolean {
  const expected = normalizedPlcType(interfaceType); const actual = normalizedPlcType(plcType);
  if (!expected || !actual) return true;
  if (expected === actual) return true;
  return expected === "LREAL" && lrealCompatible.has(actual);
}

export function hmiFaceplateTypeIssues(type: HmiFaceplateTypeDefinition, catalog?: HmiFaceplateCatalog): HmiFaceplateIssue[] {
  const issues: HmiFaceplateIssue[] = [];
  if (!faceplateName.test(type.name)) issues.push({ severity: "error", message: "Il nome deve iniziare con una lettera o underscore e non può contenere caratteri speciali." });
  if (!versionName.test(type.version)) issues.push({ severity: "error", message: "La versione deve avere il formato 0.0.1." });
  if (type.width <= 0 || type.height <= 0) issues.push({ severity: "error", message: "Larghezza e altezza devono essere positive." });
  const names = [...type.interfaceTags, ...type.interfaceProperties, ...type.localTags];
  const seen = new Set<string>();
  for (const item of names) {
    if (!interfaceName.test(item.name)) issues.push({ severity: "error", message: `«${item.name}» non è un nome di interfaccia valido.` });
    const key = item.name.toLocaleLowerCase();
    if (seen.has(key)) issues.push({ severity: "error", message: `«${item.name}» è usato più volte fra tag, proprietà e tag locali.` });
    seen.add(key);
    if (!("dataType" in item) || !item.dataType.trim()) issues.push({ severity: "error", message: `«${item.name}» non ha un tipo dati.` });
  }
  const eventNames = new Set<string>();
  for (const event of type.interfaceEvents) {
    if (!interfaceName.test(event.name)) issues.push({ severity: "error", message: `Evento «${event.name}» non valido.` });
    const key = event.name.toLocaleLowerCase();
    if (eventNames.has(key)) issues.push({ severity: "error", message: `Evento «${event.name}» duplicato.` });
    eventNames.add(key);
    const parameters = new Set<string>();
    for (const parameter of event.parameters) {
      if (!interfaceName.test(parameter.name)) issues.push({ severity: "error", message: `Parametro «${parameter.name}» di ${event.name} non valido.` });
      const parameterKey = parameter.name.toLocaleLowerCase();
      if (parameters.has(parameterKey)) issues.push({ severity: "error", message: `Parametro «${parameter.name}» duplicato in ${event.name}.` });
      parameters.add(parameterKey);
    }
  }
  for (const local of type.localTags) if (local.minimum !== undefined && local.maximum !== undefined && local.minimum > local.maximum) issues.push({ severity: "error", message: `Il tag locale «${local.name}» ha minimo maggiore del massimo.` });
  const visualIds = new Set<string>();
  for (const object of type.visualization) {
    const key = object.id.toLocaleLowerCase();
    if (!interfaceName.test(object.id)) issues.push({ severity: "error", message: `«${object.id}» non è un nome valido per un oggetto visuale.` });
    if (visualIds.has(key)) issues.push({ severity: "error", message: `L'oggetto visuale «${object.id}» è duplicato.` });
    visualIds.add(key);
    if (object.width <= 0 || object.height <= 0) issues.push({ severity: "error", message: `«${object.id}» deve avere dimensioni positive.` });
    if (object.left < 0 || object.top < 0 || object.left + object.width > type.width || object.top + object.height > type.height) issues.push({ severity: "warning", message: `«${object.id}» esce dai limiti visuali del tipo.` });
    const boundProperties = new Set<HmiFaceplateVisualProperty>();
    for (const binding of object.bindings) {
      if (boundProperties.has(binding.property)) issues.push({ severity: "error", message: `«${object.id}» dinamizza ${binding.property} più di una volta.` });
      boundProperties.add(binding.property);
      const sourceExists = binding.source === "tag" ? type.interfaceTags.some((item) => item.name === binding.name)
        : binding.source === "property" ? type.interfaceProperties.some((item) => item.name === binding.name)
          : type.localTags.some((item) => item.name === binding.name);
      if (!sourceExists) issues.push({ severity: "error", message: `«${object.id}» usa la sorgente ${binding.source} «${binding.name}» che non esiste.` });
    }
    if (object.event && !type.interfaceEvents.some((event) => event.name === object.event!.name)) issues.push({ severity: "error", message: `«${object.id}» emette l'evento inesistente «${object.event.name}».` });
  }
  if (catalog) {
    if (catalog.types.filter((candidate) => candidate.id === type.id && candidate.version === type.version).length > 1) issues.push({ severity: "error", message: `La versione V${type.version} è duplicata per lo stesso tipo.` });
    if (catalog.types.some((candidate) => candidate.id === type.id && candidate.name !== type.name)) issues.push({ severity: "error", message: "Le versioni dello stesso tipo devono mantenere lo stesso nome." });
    const nestedIds = new Set<string>();
    for (const nested of type.nestedInstances) {
      const nestedKey = nested.id.toLocaleLowerCase();
      if (!interfaceName.test(nested.id)) issues.push({ severity: "error", message: `«${nested.id}» non è un nome valido per un faceplate annidato.` });
      if (nestedIds.has(nestedKey)) issues.push({ severity: "error", message: `L'istanza annidata «${nested.id}» è duplicata.` });
      nestedIds.add(nestedKey);
      if (nested.width <= 0 || nested.height <= 0) issues.push({ severity: "error", message: `«${nested.id}» deve avere dimensioni positive.` });
      if (nested.left < 0 || nested.top < 0 || nested.left + nested.width > type.width || nested.top + nested.height > type.height) issues.push({ severity: "warning", message: `«${nested.id}» esce dai limiti visuali del tipo.` });
      const target = catalog.types.find((candidate) => candidate.id === nested.typeId && candidate.version === nested.version);
      if (nested.typeId === type.id && nested.version === type.version) issues.push({ severity: "error", message: `«${nested.id}» non può annidare la stessa versione del tipo corrente.` });
      else if (!target || target.status !== "released") issues.push({ severity: "error", message: `«${nested.id}» usa un tipo o una versione non rilasciata.` });
      if (!target) continue;
      const targetTags = new Set(target.interfaceTags.map((tag) => tag.name));
      const outerTags = new Set(type.interfaceTags.map((tag) => tag.name));
      const targetProperties = new Set(target.interfaceProperties.map((property) => property.name));
      const outerProperties = new Set(type.interfaceProperties.map((property) => property.name));
      for (const [inner, outer] of Object.entries(nested.tagBindings)) {
        if (!targetTags.has(inner)) issues.push({ severity: "error", message: `«${nested.id}» collega il tag interno inesistente «${inner}».` });
        if (!outerTags.has(outer)) issues.push({ severity: "error", message: `«${nested.id}» usa il tag esterno inesistente «${outer}».` });
        const innerTag = target.interfaceTags.find((tag) => tag.name === inner);
        const outerTag = type.interfaceTags.find((tag) => tag.name === outer);
        if (innerTag && outerTag && !hmiFaceplateTagCompatible(innerTag.dataType, outerTag.dataType)) issues.push({ severity: "error", message: `«${nested.id}» collega ${innerTag.name} (${innerTag.dataType}) a ${outerTag.name} (${outerTag.dataType}), tipi non compatibili.` });
      }
      for (const required of target.interfaceTags.filter((tag) => tag.required)) if (!nested.tagBindings[required.name]) issues.push({ severity: "error", message: `«${nested.id}» non collega il tag interno obbligatorio «${required.name}».` });
      for (const [inner, outer] of Object.entries(nested.propertyBindings)) {
        if (!targetProperties.has(inner)) issues.push({ severity: "error", message: `«${nested.id}» collega la proprietà interna inesistente «${inner}».` });
        if (!outerProperties.has(outer)) issues.push({ severity: "error", message: `«${nested.id}» usa la proprietà esterna inesistente «${outer}».` });
        const innerProperty = target.interfaceProperties.find((property) => property.name === inner);
        const outerProperty = type.interfaceProperties.find((property) => property.name === outer);
        if (innerProperty && outerProperty && innerProperty.dataType !== outerProperty.dataType) issues.push({ severity: "error", message: `«${nested.id}» collega ${innerProperty.name} (${innerProperty.dataType}) a ${outerProperty.name} (${outerProperty.dataType}), tipi non compatibili.` });
      }
    }
    const start = `${type.id}@${type.version}`;
    const reachesStart = (key: string, visited: Set<string>): boolean => {
      if (visited.has(key)) return false;
      visited.add(key);
      const current = catalog.types.find((candidate) => `${candidate.id}@${candidate.version}` === key);
      if (!current) return false;
      for (const nested of current.nestedInstances) {
        const next = `${nested.typeId}@${nested.version}`;
        if (next === start) return true;
        if (reachesStart(next, visited)) return true;
      }
      return false;
    };
    if (type.nestedInstances.some((nested) => {
      const next = `${nested.typeId}@${nested.version}`;
      return next !== start && reachesStart(next, new Set([start]));
    })) issues.push({ severity: "error", message: `La composizione di ${type.name} V${type.version} contiene un ciclo di faceplate annidati.` });
  }
  return issues;
}

export function hmiFaceplateBindingIssues(binding: HmiFaceplateInstanceBinding, catalog: HmiFaceplateCatalog, variables: readonly PlcVariableDefinition[] = []): HmiFaceplateIssue[] {
  const type = catalog.types.find((candidate) => candidate.id === binding.typeId && candidate.version === binding.version);
  if (!type) return [{ severity: "error", message: `Tipo ${binding.typeId} V${binding.version || "?"} non trovato.` }];
  const issues: HmiFaceplateIssue[] = [];
  if (type.status !== "released") issues.push({ severity: "error", message: `La versione V${type.version} di ${type.name} non è rilasciata.` });
  const knownTags = new Set(type.interfaceTags.map((tag) => tag.name));
  const knownProperties = new Set(type.interfaceProperties.map((property) => property.name));
  const knownEvents = new Set(type.interfaceEvents.map((event) => event.name));
  for (const name of Object.keys(binding.tagBindings)) if (!knownTags.has(name)) issues.push({ severity: "error", message: `Il tag di interfaccia «${name}» non esiste più in ${type.name}.` });
  for (const name of Object.keys(binding.propertyValues)) if (!knownProperties.has(name)) issues.push({ severity: "error", message: `La proprietà di interfaccia «${name}» non esiste più in ${type.name}.` });
  for (const [name, eventBinding] of Object.entries(binding.eventBindings ?? {})) {
    if (!knownEvents.has(name)) issues.push({ severity: "error", message: `L'evento di interfaccia «${name}» non esiste più in ${type.name}.` });
    const inspection = inspectHmiScript(eventBinding.script);
    if (inspection.error) issues.push({ severity: "error", message: `Script di ${name}: ${inspection.error}` });
  }
  for (const tag of type.interfaceTags) {
    const bound = binding.tagBindings[tag.name]?.trim();
    if (!bound) { if (tag.required) issues.push({ severity: "error", message: `Collega il tag obbligatorio «${tag.name}».` }); continue; }
    const variable = variables.find((candidate) => candidate.name === bound);
    if (!variable && variables.length) issues.push({ severity: "warning", message: `«${bound}» collegato a ${tag.name} non è nel catalogo PLC.` });
    else if (variable && !hmiFaceplateTagCompatible(tag.dataType, variable.dataType)) issues.push({ severity: "error", message: `${tag.name} richiede ${tag.dataType}, ma «${bound}» è ${variable.dataType}.` });
  }
  return issues;
}

/** Tipi realmente istanziati nei JSON dello standard esportato. I nomi e le versioni arrivano da
 * `ContainedType`; le interfacce arrivano dall'array `Interface` delle istanze. */
export function standardHmiFaceplateCatalog(): HmiFaceplateCatalog {
  const slider = (id: string, name: string, version: string, width: number): HmiFaceplateTypeDefinition => ({
    id, name, version, status: "released", width, height: 84, source: "standard WinCC · istanza esportata",
    interfaceTags: ["processValue", "Min_Value", "Max_Value"].map((name) => ({ name, dataType: "LReal", required: true })),
    interfaceProperties: [{ name: "Color", dataType: "Color" }, { name: "floor", dataType: "Bool", defaultValue: false }],
    interfaceEvents: [], localTags: [],
    visualization: [
      { id: "Track", type: "rectangle", left: 0, top: 29, width, height: 26, backColor: "#FFE5E7E9", borderColor: "#FF8A949B", bindings: [] },
      { id: "Value", type: "bar", left: 2, top: 31, width: width - 4, height: 22, backColor: "#FF00A1D1", bindings: [{ property: "ProcessValue", source: "tag", name: "processValue" }, { property: "BackColor", source: "property", name: "Color" }] },
      { id: "Readout", type: "io-field", left: Math.max(0, width - 92), top: 0, width: 92, height: 25, bindings: [{ property: "ProcessValue", source: "tag", name: "processValue" }] },
    ], nestedInstances: [],
  });
  return { version: 1, types: [
    {
      id: "pack", name: "Pack", version: "0.0.8", status: "released", width: 80, height: 80,
      source: "2002_Robot_Program_Modification_2.json · ContainedType V0.0.8\\Pack",
      interfaceTags: ["Width", "Height", "Group_Nr", "Group_Selected"].map((name) => ({ name, dataType: "Int", required: true })),
      interfaceProperties: [{ name: "color_Pack", dataType: "Color" }], interfaceEvents: [], localTags: [],
      visualization: [
        { id: "Body", type: "rectangle", left: 2, top: 2, width: 76, height: 76, backColor: "#FFD8DDE1", borderColor: "#FF555C63", bindings: [{ property: "BackColor", source: "property", name: "color_Pack" }] },
        { id: "Group", type: "text", left: 8, top: 26, width: 64, height: 28, text: "Pack", foreColor: "#FF20262B", fontSize: 12, bindings: [{ property: "Text", source: "tag", name: "Group_Nr" }] },
      ], nestedInstances: [],
    },
    slider("slider-v1", "Slider V1", "0.0.28", 485),
    slider("slider-v2", "Slider V2", "0.0.5", 476),
  ] };
}
