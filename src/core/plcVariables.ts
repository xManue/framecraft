export type PlcAccess = "read" | "write" | "read-write";

export interface PlcVariableUsage {
  file: string;
  line: number;
  access: PlcAccess;
}

export interface PlcVariableDefinition {
  name: string;
  dataType: string;
  access: PlcAccess;
  address: string;
  description: string;
  /** Where the tag lives in the panel that exported it: the TIA tag table, the connection it comes
   * through, how often it is read. Kept because it is how an operator recognises a signal — "the one
   * in Alarms" — long before its address means anything to them. */
  table?: string;
  connection?: string;
  cycle?: string;
  usages?: PlcVariableUsage[];
  detected?: boolean;
}

const accessValues = new Set<PlcAccess>(["read", "write", "read-write"]);

/** What a signal may be called. A panel exported from TIA names its tags `Alarms_Trigger`,
 * `Alarms_Data{1}_Active` or `PackML - DB Mode&State Manager_StateCurrent`: demanding the dotted
 * form rejected every real tag a project has, and demanding an identifier rejected the rest. What
 * is still refused is prose — a name has to start like a name. */
const variableName = /^[A-Za-z_][A-Za-z0-9_.\-&{}[\]()/: ]{0,199}$/;

export function isPlcVariableName(value: string): boolean {
  return variableName.test(value.trim());
}

function normalizeAccess(value: unknown): PlcAccess {
  return typeof value === "string" && accessValues.has(value as PlcAccess) ? value as PlcAccess : "read";
}

export function parsePlcCatalog(source: string): PlcVariableDefinition[] {
  const parsed = JSON.parse(source) as { variables?: unknown };
  if (!Array.isArray(parsed.variables)) throw new Error("framecraft.plc.json deve contenere un array variables.");
  return parsed.variables.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Variabile PLC ${index + 1} non valida.`);
    const value = item as Record<string, unknown>;
    const optional = (key: "table" | "connection" | "cycle") => typeof value[key] === "string" && value[key] ? { [key]: value[key] as string } : {};
    return {
      name: typeof value.name === "string" ? value.name : "",
      dataType: typeof value.dataType === "string" ? value.dataType : "",
      access: normalizeAccess(value.access),
      address: typeof value.address === "string" ? value.address : "",
      description: typeof value.description === "string" ? value.description : "",
      ...optional("table"), ...optional("connection"), ...optional("cycle"),
    };
  });
}

export function serializePlcCatalog(variables: PlcVariableDefinition[]): string {
  return `${JSON.stringify({
    version: 1,
    variables: variables.map(({ name, dataType, access, address, description, table, connection, cycle }) => ({
      name, dataType, access, address, description,
      // Written only when a tag actually carries them, so a catalog kept by hand stays as short as it was.
      ...(table ? { table } : {}), ...(connection ? { connection } : {}), ...(cycle ? { cycle } : {}),
    })),
  }, null, 2)}\n`;
}

function lineAt(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

function combineAccess(left: PlcAccess, right: PlcAccess): PlcAccess {
  return left === right ? left : "read-write";
}

function trendAttributePattern(): RegExp { return /(\bdata-hmi-(?:function-)?trend\s*=\s*)(["'])(.*?)\2/gs; }
function dynamizationAttributePattern(): RegExp { return /(\bdata-hmi-dynamizations\s*=\s*)(["'])(.*?)\2/gs; }
function dynamizationTagSources(raw: string): Record<string, unknown>[] {
  try {
    const parsed: unknown = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object" && ["Tag", "ResourceList", "Flashing"].includes(item.kind) && typeof item.tag === "string" && item.tag.trim()) : [];
  } catch { return []; }
}
function trendAttributeConfig(raw: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}
function trendTagSources(config: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(config.trends)) return [];
  const sources: Record<string, unknown>[] = [];
  for (const trend of config.trends) {
    if (!trend || typeof trend !== "object" || Array.isArray(trend)) continue;
    const item = trend as Record<string, unknown>;
    for (const source of [item, item.x, item.y]) if (source && typeof source === "object" && !Array.isArray(source)) {
      const tagSource = source as Record<string, unknown>;
      if (tagSource.source !== "log" && typeof tagSource.tag === "string" && tagSource.tag.trim()) sources.push(tagSource);
    }
  }
  return sources;
}

export function detectPlcVariables(sources: Record<string, string>): PlcVariableDefinition[] {
  const found = new Map<string, PlcVariableDefinition>();
  const record = (name: string, access: PlcAccess, file: string, line: number) => {
    if (!variableName.test(name)) return;
    const current = found.get(name);
    const usage = { file, line, access };
    if (current) {
      current.access = combineAccess(current.access, access);
      current.usages?.push(usage);
    } else {
      found.set(name, { name, dataType: "", access, address: "", description: "", usages: [usage], detected: true });
    }
  };

  for (const [file, source] of Object.entries(sources)) {
    const callPattern = /\b(?:hmi|plc)\.(value|read|write|setpoint)\(\s*["'`]([^"'`]+)["'`]/g;
    for (const match of source.matchAll(callPattern)) {
      const method = match[1];
      record(match[2], method === "write" || method === "setpoint" ? "write" : "read", file, lineAt(source, match.index ?? 0));
    }
    const hookPattern = /\busePlcVariable\(\s*["'`]([^"'`]+)["'`]/g;
    for (const match of source.matchAll(hookPattern)) record(match[1], "read-write", file, lineAt(source, match.index ?? 0));
    const attributePattern = /\bdata-plc-(?:variable|tag)\s*=\s*["']([^"']+)["']/g;
    for (const match of source.matchAll(attributePattern)) record(match[1], "read", file, lineAt(source, match.index ?? 0));
    for (const match of source.matchAll(dynamizationAttributePattern())) for (const binding of dynamizationTagSources(match[3])) record(binding.tag as string, "read", file, lineAt(source, match.index ?? 0));
    for (const match of source.matchAll(trendAttributePattern())) {
      const config = trendAttributeConfig(match[3]); if (!config) continue;
      for (const tagSource of trendTagSources(config)) record(tagSource.tag as string, "read", file, lineAt(source, match.index ?? 0));
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function mergePlcVariables(catalog: PlcVariableDefinition[], detected: PlcVariableDefinition[]): PlcVariableDefinition[] {
  const merged = new Map<string, PlcVariableDefinition>(catalog.map((variable) => [variable.name, { ...variable, detected: false }]));
  for (const variable of detected) {
    const configured = merged.get(variable.name);
    if (configured) {
      configured.usages = variable.usages;
      configured.access = combineAccess(configured.access, variable.access);
    } else merged.set(variable.name, variable);
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function plcVariableIssues(variable: PlcVariableDefinition): string[] {
  const issues: string[] = [];
  if (!variableName.test(variable.name)) issues.push("Nome della variabile non valido");
  if (!variable.dataType.trim()) issues.push("Tipo PLC mancante");
  if (!variable.address.trim()) issues.push("Indirizzo PLC mancante");
  return issues;
}

export function renamePlcVariableUsage(source: string, previousName: string, nextName: string): string {
  const replace = (pattern: RegExp) => source = source.replace(pattern, (complete, prefix: string, quote: string, name: string) =>
    name === previousName ? `${prefix}${quote}${nextName}${quote}` : complete);
  replace(/(\b(?:hmi|plc)\.(?:value|read|write|setpoint)\(\s*)(["'`])([^"'`]+)\2/g);
  replace(/(\busePlcVariable\(\s*)(["'`])([^"'`]+)\2/g);
  replace(/(\bdata-plc-(?:variable|tag)\s*=\s*)(["'])([^"']+)\2/g);
  source = source.replace(dynamizationAttributePattern(), (complete, prefix: string, quote: string, raw: string) => {
    const bindings = dynamizationTagSources(raw);
    if (!bindings.some((item) => item.tag === previousName)) return complete;
    // Si modifica solo il campo tag riconosciuto, non testi, condizioni o nomi restituiti dagli script.
    const decoded = raw.replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const items = JSON.parse(decoded) as Record<string, unknown>[];
    for (const item of items) if (item && ["Tag", "ResourceList", "Flashing"].includes(String(item.kind)) && item.tag === previousName) item.tag = nextName;
    const json = JSON.stringify(items).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    return `${prefix}${quote}${quote === '"' ? json.replaceAll('"', "&quot;") : json.replaceAll("'", "&apos;")}${quote}`;
  });
  source = source.replace(trendAttributePattern(), (complete, prefix: string, quote: string, raw: string) => {
    const config = trendAttributeConfig(raw); if (!config) return complete;
    let changed = false;
    for (const tagSource of trendTagSources(config)) if (tagSource.tag === previousName) { tagSource.tag = nextName; changed = true; }
    if (!changed) return complete;
    const json = JSON.stringify(config).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    return `${prefix}${quote}${quote === '"' ? json.replaceAll('"', "&quot;") : json.replaceAll("'", "&apos;")}${quote}`;
  });
  return source;
}

/** Tag names referenced anywhere in a slice of source: used to tell which PLC signal an element
 * on the canvas is wired to. Mirrors the patterns detectPlcVariables recognises. */
export function plcTagsInSource(source: string): string[] {
  const tags = new Set<string>();
  const patterns = [
    /\b(?:hmi|plc)\.(?:value|read|write|setpoint)\(\s*["'`]([^"'`]+)["'`]/g,
    /\busePlcVariable\(\s*["'`]([^"'`]+)["'`]/g,
    /\bdata-plc-(?:variable|tag)\s*=\s*\{?\s*["'`]([^"'`]+)["'`]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) if (match[1]) tags.add(match[1]);
  }
  for (const match of source.matchAll(trendAttributePattern())) {
    const config = trendAttributeConfig(match[3]); if (!config) continue;
    for (const tagSource of trendTagSources(config)) tags.add(tagSource.tag as string);
  }
  for (const match of source.matchAll(dynamizationAttributePattern())) for (const binding of dynamizationTagSources(match[3])) tags.add(binding.tag as string);
  return [...tags];
}
