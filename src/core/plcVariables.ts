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
  usages?: PlcVariableUsage[];
  detected?: boolean;
}

const accessValues = new Set<PlcAccess>(["read", "write", "read-write"]);

function normalizeAccess(value: unknown): PlcAccess {
  return typeof value === "string" && accessValues.has(value as PlcAccess) ? value as PlcAccess : "read";
}

export function parsePlcCatalog(source: string): PlcVariableDefinition[] {
  const parsed = JSON.parse(source) as { variables?: unknown };
  if (!Array.isArray(parsed.variables)) throw new Error("framecraft.plc.json deve contenere un array variables.");
  return parsed.variables.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Variabile PLC ${index + 1} non valida.`);
    const value = item as Record<string, unknown>;
    return {
      name: typeof value.name === "string" ? value.name : "",
      dataType: typeof value.dataType === "string" ? value.dataType : "",
      access: normalizeAccess(value.access),
      address: typeof value.address === "string" ? value.address : "",
      description: typeof value.description === "string" ? value.description : "",
    };
  });
}

export function serializePlcCatalog(variables: PlcVariableDefinition[]): string {
  return `${JSON.stringify({
    version: 1,
    variables: variables.map(({ name, dataType, access, address, description }) => ({ name, dataType, access, address, description })),
  }, null, 2)}\n`;
}

function lineAt(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

function combineAccess(left: PlcAccess, right: PlcAccess): PlcAccess {
  return left === right ? left : "read-write";
}

export function detectPlcVariables(sources: Record<string, string>): PlcVariableDefinition[] {
  const found = new Map<string, PlcVariableDefinition>();
  const record = (name: string, access: PlcAccess, file: string, line: number) => {
    if (!/^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+$/.test(name)) return;
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
  if (!/^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+$/.test(variable.name)) issues.push("Nome logico non valido");
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
  return [...tags];
}
