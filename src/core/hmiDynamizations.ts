import { dynamizedProperties, type Dynamization, type DynamizationKind, type MappingConditionType } from "./hmiStandard";
import { inspectHmiScript } from "./hmiScript";

export const hmiDynamizationAttribute = "data-hmi-dynamizations";

const kinds = new Set<DynamizationKind>(["Tag", "ResourceList", "Script", "Expression", "Flashing"]);
const conditions = new Set<MappingConditionType>(["None", "Range", "Singlebit", "Expression"]);

function finite(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizedEntry(value: unknown): NonNullable<Dynamization["entries"]>[number] | undefined {
  if (!value || typeof value !== "object" || !("value" in value)) return undefined;
  const item = value as Record<string, unknown>;
  const entry: NonNullable<Dynamization["entries"]>[number] = { value: String(item.value ?? "") };
  const from = finite(item.from);
  const to = finite(item.to);
  if (from !== undefined) entry.from = from;
  if (to !== undefined) entry.to = to;
  if (item.condition != null) entry.condition = String(item.condition);
  return entry;
}

function normalized(value: unknown): Dynamization | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.property !== "string" || !item.property.trim()) return undefined;
  const kind = kinds.has(item.kind as DynamizationKind) ? item.kind as DynamizationKind : "Tag";
  const conditionType = conditions.has(item.conditionType as MappingConditionType) ? item.conditionType as MappingConditionType : "None";
  const result: Dynamization = { property: item.property.trim(), kind, conditionType };
  if (typeof item.tag === "string" && item.tag.trim()) result.tag = item.tag.trim();
  if (kind === "Tag" && item.indirect === true) {
    result.indirect = true;
    if (typeof item.indirectDataType === "string" && item.indirectDataType.trim()) result.indirectDataType = item.indirectDataType.trim();
  }
  if (typeof item.source === "string" && item.source.trim()) result.source = item.source.trim();
  if (Array.isArray(item.triggers)) {
    const triggers = [...new Set(item.triggers.filter((trigger): trigger is string => typeof trigger === "string").map((trigger) => trigger.trim()).filter(Boolean))];
    if (triggers.length) result.triggers = triggers;
  }
  const cycleMs = finite(item.cycleMs);
  if (cycleMs !== undefined && cycleMs > 0) result.cycleMs = Math.round(cycleMs);
  if (kind === "Script" && result.source) {
    const inspection = inspectHmiScript(result.source);
    if (inspection.program) {
      result.program = inspection.program;
      result.scriptTags = { read: inspection.tagsRead, written: inspection.tagsWritten };
    }
  }
  if (kind === "Flashing") {
    if (typeof item.color === "string" && item.color.trim()) result.color = item.color.trim();
    if (typeof item.alternateColor === "string" && item.alternateColor.trim()) result.alternateColor = item.alternateColor.trim();
    result.flashingCondition = ["Never", "RangeViolation"].includes(String(item.flashingCondition)) ? item.flashingCondition as "Never" | "RangeViolation" : "Always";
    result.flashingRate = ["Slow", "Fast"].includes(String(item.flashingRate)) ? item.flashingRate as "Slow" | "Fast" : "Medium";
    const minimum = finite(item.minimum);
    const maximum = finite(item.maximum);
    if (minimum !== undefined) result.minimum = minimum;
    if (maximum !== undefined) result.maximum = maximum;
  }
  const entries = Array.isArray(item.entries) ? item.entries.map(normalizedEntry).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)) : [];
  if (entries.length) result.entries = entries;
  return result;
}

export function parseHmiDynamizations(value: unknown): Dynamization[] {
  let raw = value;
  if (typeof value === "string") {
    try { raw = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map(normalized).filter((item): item is Dynamization => Boolean(item));
}

export function serializeHmiDynamizations(items: readonly Dynamization[]): string {
  return JSON.stringify(items.map(normalized).filter((item): item is Dynamization => Boolean(item)));
}

export function availableDynamizedProperties(items: readonly Dynamization[]): string[] {
  const used = new Set(items.map((item) => item.property));
  return dynamizedProperties.map((item) => item.property).filter((property) => !used.has(property));
}

export function newHmiDynamization(property: string, tag = ""): Dynamization {
  return { property, kind: "Tag", tag, conditionType: "None" };
}

export function replaceHmiDynamization(items: readonly Dynamization[], index: number, next: Dynamization): Dynamization[] {
  return items.map((item, itemIndex) => itemIndex === index ? normalized(next) ?? item : item);
}

export function removeHmiDynamization(items: readonly Dynamization[], index: number): Dynamization[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}
