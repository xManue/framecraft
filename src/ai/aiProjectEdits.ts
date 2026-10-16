import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import { isPlcVariableName, parsePlcCatalog } from "../core/plcVariables";

const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;
export interface AiProjectChange { path: string; before: string | null; after: string }
export interface AiProjectPlan {
  summary: string; questions: string[]; warnings: string[];
  reads: { path: string; find: string }[];
  edits: { path: string; before: string; after: string }[];
  variables: { name: string; dataType: string; description: string }[];
}
export interface AiProjectReview { root: string; changes: AiProjectChange[]; plan: AiProjectPlan; bytes: number; rounds: number; backup?: string; restored?: boolean }
const string = { type: "string" };
const list = (properties: Record<string, unknown>) => ({ type: "array", items: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } });
export const aiProjectSchema = { type: "object", properties: {
  summary: string, questions: { type: "array", items: string }, warnings: { type: "array", items: string },
  reads: list({ path: string, find: string }), edits: list({ path: string, before: string, after: string }),
  variables: list({ name: string, dataType: string, description: string }),
}, required: ["summary", "questions", "warnings", "reads", "edits", "variables"], additionalProperties: false };
export const aiProjectTypes = ["BOOL", "INT", "DINT", "REAL", "LREAL", "STRING"];
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error("Piano progetto AI non valido: contiene campi non supportati.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error("Il piano contiene testo non valido o troppo lungo.");
  return value;
}
export function aiProjectPath(path: string): boolean {
  if (!path || path.length > 240 || path.includes("\\") || /[^A-Za-z0-9_./ -]/.test(path) || path.split("/").some(part => !part || part.startsWith(".") || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || /^(node_modules|dist|build|coverage|target|standard)$/i.test(part))) return false;
  if (path === "framecraft.plc.json") return true;
  if (!path.startsWith("src/") || !/\.(?:[jt]sx?|mjs|css)$/.test(path) || /(?:^|\/)(?:.*secret.*|.*credential.*|.*password.*|.*token.*|.*\.config)\.[^/]+$/i.test(path)) return false;
  return true;
}
export function parseAiProjectPlan(source: string): AiProjectPlan {
  const value = object(JSON.parse(text(source, 262_144)), Object.keys(aiProjectSchema.properties));
  const texts = (key: string) => {
    if (!Array.isArray(value[key]) || value[key].length > 24) throw new Error("Troppi chiarimenti o avvisi nel piano.");
    return value[key].map(item => text(item, 2000));
  };
  const rows = <T>(key: string, max: number, keys: string[], map: (row: Record<string, unknown>) => T): T[] => {
    if (!Array.isArray(value[key]) || value[key].length > max) throw new Error(`Elenco ${key} del piano non valido.`);
    return value[key].map(item => map(object(item, keys)));
  };
  const path = (value: unknown) => { const path = text(value, 240); if (!aiProjectPath(path)) throw new Error(`Il piano tenta di accedere a un file protetto: ${path}`); return path; };
  const reads = rows("reads", 4, ["path", "find"], row => ({ path: path(row.path), find: text(row.find, 200) }));
  const edits = rows("edits", 24, ["path", "before", "after"], row => {
    const file = path(row.path); if (file === "framecraft.plc.json") throw new Error("Le variabili si dichiarano con variables: il catalogo reale non può essere riscritto dall’AI.");
    return { path: file, before: text(row.before, 16_000), after: text(row.after, 24_000) };
  });
  const variables = rows("variables", 24, ["name", "dataType", "description"], row => {
    const name = text(row.name, 200), dataType = text(row.dataType, 16);
    if (!isPlcVariableName(name) || name !== name.trim() || !aiProjectTypes.includes(dataType)) throw new Error("Nome o tipo della nuova variabile non valido.");
    return { name, dataType, description: text(row.description, 500) };
  });
  if (new Set(variables.map(item => item.name.toLowerCase())).size !== variables.length) throw new Error("Variabili duplicate nel piano AI.");
  if (reads.length && (edits.length || variables.length)) throw new Error("Il piano deve prima leggere i file necessari, poi proporre le modifiche.");
  return { summary: text(value.summary, 2000), questions: texts("questions"), warnings: texts("warnings"), reads, edits, variables };
}
export function assertAiSourceShareable(source: string) {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,})\b|\bBearer\s+[A-Za-z0-9_.-]{16,}|\b(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*["'`][^"'`]{4,}/i.test(source)) throw new Error("Un file necessario sembra contenere credenziali. Non lo invio: sposta i segreti fuori dai sorgenti e riprova.");
}
const ast = (source: string) => parse(source, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"] });
function dangerousCalls(source: string) {
  const calls: string[] = [];
  traverse(ast(source), { CallExpression(path) {
    const callee = source.slice(path.node.callee.start!, path.node.callee.end!);
    if (!/\b(?:eval|Function|fetch|WebSocket|XMLHttpRequest|sendBeacon|exec|spawn|invoke|write|setpoint|delete|remove|unlink|rm)\b/.test(callee) && !path.node.callee.type.includes("Import") && !(path.node.callee.type === "MemberExpression" && path.node.callee.computed)) return;
    const owner = path.findParent(item => item.isJSXAttribute() || item.isFunctionDeclaration() || item.isVariableDeclarator());
    const ownerName = owner?.isJSXAttribute() ? owner.node.name.name : owner?.isFunctionDeclaration() ? owner.node.id?.name : owner?.isVariableDeclarator() && owner.node.id.type === "Identifier" ? owner.node.id.name : "module";
    calls.push(`${ownerName}:${source.slice(path.node.start!, path.node.end!)}`);
  }, NewExpression(path) { if (/[A-Za-z]/.test(source.slice(path.node.callee.start!, path.node.callee.end!)) && /\b(?:Function|WebSocket|XMLHttpRequest|Worker)\b/.test(source.slice(path.node.callee.start!, path.node.callee.end!))) calls.push(source.slice(path.node.start!, path.node.end!)); } });
  return calls;
}
export function validateAiProjectCode(path: string, before: string | null, after: string, known: ReadonlySet<string>) {
  if (!after.trim() || after.length > 300_000) throw new Error(`${path}: il risultato è vuoto o troppo grande.`);
  assertAiSourceShareable(after);
  if (path.endsWith(".css")) {
    if (/url\s*\(\s*["']?(?:https?:|data:|javascript:|\/\/)|@import/i.test(after) && after !== before) throw new Error("L’AI non aggiunge import CSS o risorse di rete.");
    if ((after.match(/\{/g)?.length ?? 0) !== (after.match(/\}/g)?.length ?? 0)) throw new Error(`${path}: parentesi CSS non bilanciate.`);
    return;
  }
  const next = ast(after), oldImports = new Set<string>();
  if (before) for (const item of ast(before).program.body) if (item.type === "ImportDeclaration" || item.type === "ExportNamedDeclaration" || item.type === "ExportAllDeclaration") if (item.source) oldImports.add(item.source.value);
  for (const item of next.program.body) {
    const dependency = (item.type === "ImportDeclaration" || item.type === "ExportNamedDeclaration" || item.type === "ExportAllDeclaration") && item.source?.value;
    if (!dependency || oldImports.has(dependency) || dependency === "react" || dependency === "react/jsx-runtime") continue;
    if (!dependency.startsWith(".")) throw new Error(`${path}: nessuna nuova dipendenza o import esterno (${dependency}).`);
    const parts = path.split("/"); parts.pop();
    for (const part of dependency.split("/")) { if (part === "..") parts.pop(); else if (part !== ".") parts.push(part); }
    const relative = parts.join("/");
    if (![relative, ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", "/index.ts", "/index.tsx"].map(ext => relative + ext)].some(file => aiProjectPath(file) && known.has(file))) throw new Error(`${path}: import non risolvibile nel progetto (${dependency}).`);
  }
  const existing = dangerousCalls(before ?? "");
  for (const call of dangerousCalls(after)) {
    const at = existing.indexOf(call); if (at < 0) throw new Error(`${path}: nuove chiamate di rete, esecuzione o scrittura PLC richiedono una funzione dedicata; non vengono attivate da una modifica al codice AI.`);
    existing.splice(at, 1);
  }
}
export function appendAiVariables(source: string | null, variables: AiProjectPlan["variables"]): string {
  variables = parseAiProjectPlan(JSON.stringify({ summary: "", questions: [], warnings: [], reads: [], edits: [], variables })).variables;
  const catalog = source === null ? { version: 1, variables: [] as unknown[] } : object(JSON.parse(source), Object.keys(JSON.parse(source)));
  if (!Array.isArray(catalog.variables)) throw new Error("Il catalogo variabili è incompleto: non viene sostituito.");
  const existing = source === null ? [] : parsePlcCatalog(source);
  const names = new Set(existing.map(tag => tag.name.toLowerCase()));
  const added = variables.map(variable => {
    if (names.has(variable.name.toLowerCase())) throw new Error(`La variabile ${variable.name} esiste già: l’AI deve riusarla, non sostituirla.`);
    names.add(variable.name.toLowerCase());
    return { ...variable, access: "read", address: "", table: "AI · Da collegare" };
  });
  return JSON.stringify({ ...catalog, variables: [...catalog.variables, ...added] }, null, 2) + "\n";
}
export function prepareAiProjectChanges(plan: AiProjectPlan, sources: ReadonlyMap<string, string | null>, excerpts: ReadonlyMap<string, string[]>, knownFiles: readonly string[]): AiProjectChange[] {
  plan = parseAiProjectPlan(JSON.stringify(plan));
  if (plan.questions.length || plan.reads.length) return [];
  const changes = new Map<string, AiProjectChange>(), known = new Set([...knownFiles, ...plan.edits.map(edit => edit.path)]);
  for (const edit of plan.edits) {
    if (!sources.has(edit.path)) throw new Error(`L’AI deve leggere ${edit.path} prima di modificarlo, o confermare che è nuovo.`);
    const original = sources.get(edit.path)!, current = changes.get(edit.path) ?? { path: edit.path, before: original, after: original ?? "" };
    if (original === null) {
      if (edit.before || changes.has(edit.path)) throw new Error("Un file nuovo deve avere una sola creazione, senza testo precedente.");
      current.after = edit.after;
    } else {
      if (!edit.before || !excerpts.get(edit.path)?.some(part => part.includes(edit.before))) throw new Error(`${edit.path}: modifica fuori dal codice letto dall’AI.`);
      const index = current.after.indexOf(edit.before);
      if (index < 0 || current.after.indexOf(edit.before, index + 1) >= 0) throw new Error(`${edit.path}: il testo da modificare non è unico o è cambiato.`);
      current.after = current.after.slice(0, index) + edit.after + current.after.slice(index + edit.before.length);
    }
    changes.set(edit.path, current);
  }
  for (const change of changes.values()) validateAiProjectCode(change.path, change.before, change.after, known);
  if (plan.variables.length) {
    if (!sources.has("framecraft.plc.json")) throw new Error("Il catalogo variabili non è stato verificato.");
    const before = sources.get("framecraft.plc.json")!; changes.set("framecraft.plc.json", { path: "framecraft.plc.json", before, after: appendAiVariables(before, plan.variables) });
  }
  const result = [...changes.values()].filter(change => change.before !== change.after);
  if (result.length > 8) throw new Error("La proposta coinvolge più di 8 file: dividila in passaggi più piccoli.");
  return result;
}
