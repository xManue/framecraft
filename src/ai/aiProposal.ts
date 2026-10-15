import type { EditorDocument, EditorNode, RenderedInfo } from "../core/types";
import { standardProjectSectionChoices, type StandardProjectConfig } from "../core/standardProject";
import { settingsProgramChoices } from "../core/hmiSectionMenu";
import { parseSource } from "../source-parser/parseSource";
import { updateInlineStyles, updateStaticText } from "../source-parser/transformSource";
import { standardPageTemplates } from "../core/hmiPageTemplates";
import { guidedTemplateBehavior, type TemplateBehavior } from "../core/templateBehavior";
import type { AiDecision } from "./aiDelegation";
import { inspectElementValues, type createElementValueInspector } from "../source-parser/inspectElementValues";

export type AiMode = "create" | "edit";
export interface AiOperation { id: string; type: "text" | "style"; property: string | null; value: string; target?: string | null }
export interface AiProposal { version: 1; mode: AiMode; summary: string; questions: string[]; warnings: string[]; provenance: string[]; project: StandardProjectConfig | null; operations: AiOperation[]; decisions?: AiDecision[] }
export interface AiEditSnapshot { root: string; document: EditorDocument; selectedId: string; selectionKey?: string; targets?: Record<string, AiEditSnapshot>; label?: string; pageId?: string }
export function aiSelectionKey(info: RenderedInfo | undefined, scope: string) {
  return JSON.stringify({ scope, index: info?.instanceIndex ?? 0, count: info?.instanceCount ?? 1, list: info?.listIndex ?? null, locked: info?.locked ?? false });
}
export function aiRuntimeProperties(node: EditorNode) {
  const mapping: Record<string, string[]> = { text: ["Text", "ProcessValue"], color: ["ForeColor"], backgroundColor: ["BackColor"], borderColor: ["BorderColor"], left: ["Left"], top: ["Top"], width: ["Width"], height: ["Height"], opacity: ["Opacity"], rotate: ["RotationAngle"] };
  const raw = node.props["data-hmi-dynamizations"];
  if (node.dynamicProps.includes("data-hmi-dynamizations")) return { properties: Object.keys(mapping), unknown: true };
  if (raw === undefined) return { properties: [], unknown: false };
  try {
    const bindings: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(bindings)) throw Error("invalid");
    return { properties: Object.keys(mapping).filter(key => bindings.some(binding => binding && typeof binding === "object" && mapping[key].includes(binding.property))), unknown: false };
  } catch { return { properties: Object.keys(mapping), unknown: true }; }
}
export const aiStyleNames = ["color", "backgroundColor", "borderColor", "borderRadius", "fontSize", "fontWeight", "width", "height", "left", "top", "zIndex", "opacity", "rotate", "display", "position", "padding", "margin", "gap", "rowGap", "columnGap", "textAlign", "alignItems", "justifyContent", "flexDirection", "flexWrap", "gridTemplateColumns", "borderWidth", "borderStyle"] as const;
const styleNames: readonly string[] = aiStyleNames;
const textSchema = { type: "string" };
const listSchema = { type: "array", items: textSchema };
const properties = {
  version: { type: "integer", enum: [1] }, mode: { type: "string", enum: ["create", "edit"] }, summary: textSchema,
  questions: listSchema, warnings: listSchema, provenance: { type: "array", items: { type: "string", enum: ["approved-request", "approved-selection", "framecraft-standard"] } },
  project: { anyOf: [{ type: "null" }, { type: "object", properties: {
    machineName: textSchema, layout: { type: "string", enum: ["desktop", "desktop-mobile"] },
    sections: { type: "array", items: { type: "string", enum: standardProjectSectionChoices.map(section => section.id) } },
    settingsProgram: { type: "string", enum: settingsProgramChoices.map(program => program.id) },
  }, required: ["machineName", "layout", "sections", "settingsProgram"], additionalProperties: false }] },
  operations: { type: "array", items: { type: "object", properties: { id: textSchema, type: { type: "string", enum: ["text", "style"] }, property: { anyOf: [{ type: "null" }, { type: "string", enum: styleNames }] }, value: textSchema }, required: ["id", "type", "property", "value"], additionalProperties: false } },
  decisions: { type: "array", items: { type: "object", properties: { key: textSchema, value: textSchema }, required: ["key", "value"], additionalProperties: false } },
};
export const aiProposalSchema = { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
export const aiPageProposalSchema = { ...aiProposalSchema, properties: { ...properties, operations: { type: "array", items: { ...properties.operations.items, properties: { ...properties.operations.items.properties, target: textSchema }, required: [...properties.operations.items.required, "target"] } } } };

function object(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error("La proposta contiene campi non supportati. Nessuna modifica applicata.");
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 2000) {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error("La proposta contiene un testo non valido o troppo lungo.");
  return value;
}
function list(value: unknown) { if (!Array.isArray(value) || value.length > 24) throw new Error("Elenco della proposta non valido."); return value.map(item => text(item)); }
export function aiStyleValue(property: string, value: string) {
  if (!styleNames.includes(property)) throw new Error("L’AI non può applicare questa proprietà.");
  const choices: Record<string, string[]> = { display: ["block", "inline-block", "flex", "inline-flex", "grid", "none"], position: ["static", "relative", "absolute", "fixed", "sticky"], textAlign: ["left", "right", "center", "start", "end", "justify"], alignItems: ["start", "end", "center", "stretch", "baseline", "flex-start", "flex-end"], justifyContent: ["start", "end", "center", "space-between", "space-around", "space-evenly", "flex-start", "flex-end"], flexDirection: ["row", "column", "row-reverse", "column-reverse"], flexWrap: ["wrap", "nowrap", "wrap-reverse"], borderStyle: ["none", "solid", "dashed", "dotted", "double"] };
  if (choices[property]) { if (!choices[property].includes(value)) throw new Error("Valore grafico non supportato."); return value; }
  if (property === "gridTemplateColumns") { if (!/^repeat\(([1-9]|[1-4][0-9]),\s*(1fr|minmax\(0,\s*1fr\))\)$/.test(value) && !/^(\d{1,4}(px|fr|%)\s*){1,8}$/.test(value)) throw new Error("Colonne della griglia non valide."); return value; }
  if (["color", "backgroundColor", "borderColor"].includes(property)) {
    if (!/^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|transparent|currentColor)$/i.test(value)) throw new Error("Colore non valido: usa esadecimale o trasparente.");
    return value;
  }
  if (property === "opacity") { const number = Number(value); if (!value.trim() || !Number.isFinite(number) || number < 0 || number > 1) throw new Error("Opacità fuori intervallo."); return number; }
  if (property === "zIndex" || property === "fontWeight") { const number = Number(value); if (!value.trim() || !Number.isInteger(number) || Math.abs(number) > 10_000 || property === "fontWeight" && (number < 100 || number > 900)) throw new Error("Numero non valido nella proprietà."); return number; }
  if (property === "rotate") { if (!/^-?\d{1,3}(\.\d+)?deg$/.test(value)) throw new Error("Rotazione non valida."); return value; }
  if (["padding", "margin"].includes(property)) {
    const parts = value.trim().split(/\s+/);
    if (!parts.length || parts.length > 4 || parts.some(part => !(property === "margin" && part === "auto") && (!/^-?\d{1,4}(\.\d+)?(px|%|em|rem)?$/.test(part) || Math.abs(parseFloat(part)) > 4096 || property === "padding" && parseFloat(part) < 0))) throw new Error("Spaziatura non valida: usa da una a quattro misure semplici.");
    return parts.length === 1 && /^-?\d+(\.\d+)?$/.test(parts[0]) ? Number(parts[0]) : parts.join(" ");
  }
  if (!/^-?\d{1,4}(\.\d+)?(px|%|em|rem)?$/.test(value) || Math.abs(parseFloat(value)) > 4096 || (!["left", "top"].includes(property) && parseFloat(value) < 0)) throw new Error("Dimensione o posizione non valida.");
  return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
}
export function parseAiProposal(input: unknown, mode: AiMode): AiProposal {
  let source = input;
  if (typeof input === "string") {
    try { source = JSON.parse(text(input, 262_144)); }
    catch (error) { if (error instanceof SyntaxError) throw new Error("Codex ha restituito una proposta incompleta o non leggibile. Nessun file modificato: prepara di nuovo la proposta."); throw error; }
  }
  const item = object(source, Object.keys(properties));
  if (item.version !== 1 || item.mode !== mode || !Array.isArray(item.operations) || item.operations.length > 128) throw new Error("La proposta non corrisponde all’operazione richiesta.");
  const operations = item.operations.map(raw => {
    const operation = object(raw, ["id", "type", "property", "value", "target"]), id = text(operation.id, 64), value = text(operation.value, 512);
    if (operation.target !== undefined && operation.target !== null && !/^[a-zA-Z0-9_-]{1,64}$/.test(text(operation.target, 64))) throw new Error("Destinazione della modifica non valida.");
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || !["text", "style"].includes(String(operation.type))) throw new Error("Operazione della proposta non valida.");
    if (operation.type === "text") { if (operation.property !== null) throw new Error("Il testo non può modificare proprietà o comportamenti."); }
    else aiStyleValue(text(operation.property, 64), value);
    return { id, type: operation.type, property: operation.property, value, ...(operation.target != null ? { target: operation.target } : {}) } as AiOperation;
  });
  if (new Set(operations.map(operation => operation.id)).size !== operations.length) throw new Error("Operazioni duplicate nella proposta.");
  if (new Set(operations.map(operation => `${operation.target ?? "selection"}:${operation.type === "text" ? "text" : `style:${operation.property}`}`)).size !== operations.length) throw new Error("La proposta modifica più volte la stessa proprietà. Richiedi una proposta con una sola modifica per campo.");
  let project: StandardProjectConfig | null = null;
  if (mode === "create" && item.project !== null) {
    const config = object(item.project, ["machineName", "layout", "sections", "settingsProgram"]), machineName = text(config.machineName, 120).trim();
    if (!machineName || !["desktop", "desktop-mobile"].includes(String(config.layout)) || !Array.isArray(config.sections) || !config.sections.length || config.sections.length > 7 || !config.sections.every(id => standardProjectSectionChoices.some(section => section.id === id)) || new Set(config.sections).size !== config.sections.length || !settingsProgramChoices.some(program => program.id === config.settingsProgram)) throw new Error("Il piano di creazione non è compatibile con lo standard dell’app.");
    project = { machineName, layout: config.layout as StandardProjectConfig["layout"], sections: config.sections as StandardProjectConfig["sections"], settingsProgram: config.settingsProgram as StandardProjectConfig["settingsProgram"] };
  }
  if (mode === "edit" && item.project !== null || mode === "create" && operations.length) throw new Error("La proposta mescola creazione e modifica del progetto.");
  const provenance = list(item.provenance);
  const rawDecisions = item.decisions === undefined ? [] : item.decisions;
  if (!Array.isArray(rawDecisions) || rawDecisions.length > 256 || mode === "edit" && rawDecisions.length) throw new Error("Scelte delegate non valide per questa operazione.");
  const decisions = rawDecisions.map(raw => { const decision = object(raw, ["key", "value"]), key = text(decision.key, 128); if (!/^[a-zA-Z0-9.-]+$/.test(key)) throw new Error("Domanda delegata non valida."); return { key, value: text(decision.value, 10000) }; });
  if (new Set(decisions.map(decision => decision.key)).size !== decisions.length) throw new Error("Scelte delegate duplicate.");
  const allowed = mode === "create" ? ["approved-request", "framecraft-standard"] : ["approved-request", "approved-selection"];
  if (!provenance.every(source => allowed.includes(source))) throw new Error("La proposta cita una fonte che non è stata fornita o approvata.");
  return { version: 1, mode, summary: text(item.summary), questions: list(item.questions), warnings: list(item.warnings), provenance, project, operations, decisions };
}
export function aiEditContext(snapshot: AiEditSnapshot, inspector?: ReturnType<typeof createElementValueInspector>) {
  const node = snapshot.document.nodes[snapshot.selectedId]; if (!node) throw new Error("Seleziona un elemento prima di chiedere una modifica.");
  let current: EditorNode | undefined = node, template: TemplateBehavior | undefined;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id); const id = current.props["data-hmi-template-id"];
    if (typeof id === "string" && current.props["data-hmi-template-version"] === 1) { template = id.startsWith("guided:") ? guidedTemplateBehavior(id.slice(7)) : standardPageTemplates.find(item => item.behavior.id === id)?.behavior; break; }
    current = current.parentId ? snapshot.document.nodes[current.parentId] : undefined;
  }
  const inspected = inspector ? inspector(node.source, styleNames) : inspectElementValues(snapshot.document.source, node.source, styleNames);
  return { file: snapshot.document.file.split(/[\\/]/).at(-1), ...(template ? { template } : {}), element: { type: node.type, text: inspected.text.kind === "literal" ? inspected.text.value : undefined,
    styles: Object.fromEntries(Object.entries(inspected.styles).filter(([, value]) => value.kind === "literal").map(([key, value]) => [key, value.value])),
    dynamicProperties: [...(inspected.text.kind === "dynamic" ? ["text"] : []), ...Object.entries(inspected.styles).filter(([, value]) => value.kind === "dynamic").map(([key]) => key)],
    runtimeProperties: aiRuntimeProperties(node), editable: { text: node.capabilities.text, style: node.capabilities.style && inspected.canEditStyle } } };
}
export function aiPrompt(mode: AiMode, request: string, context?: ReturnType<typeof aiEditContext>) {
  return JSON.stringify({ task: mode, request: text(request, 8000), approvedContext: context ?? null,
    standard: mode === "create" ? { sections: standardProjectSectionChoices.map(({ id, label, description }) => ({ id, label, description })), settingsPrograms: settingsProgramChoices.map(({ id, label }) => ({ id, label })) } : null,
    rules: "Prepara una proposta, non eseguire nulla. decisions è [] per la modifica. Una sola operazione per proprietà. I campi dynamicProperties sono gestiti da codice: non sostituirli con valori fissi se non richiesto esplicitamente; chiedi come conservare il comportamento. Rispetta le capacità editable. Non dichiarare come valore reale ciò che arriva da CSS o Runtime. Non inserire codice, tag PLC, soglie, indirizzi, credenziali, azioni o autorizzazioni. Per la creazione scegli soltanto sezioni e layout esistenti; spiega i dati macchina mancanti. Per la modifica proponi testo e le proprietà grafiche supportate, con colori esadecimali. Se la richiesta supera queste capacità spiega nelle questions cosa serve, senza fingere di averlo fatto. Il progetto rimane completamente modificabile a mano." });
}
export function prepareAiEdits(snapshot: AiEditSnapshot, proposal: AiProposal, accepted: readonly string[]): string {
  proposal = parseAiProposal(proposal, "edit");
  if (proposal.operations.some(operation => operation.target)) throw new Error("La proposta ha più destinatari: usa la revisione della pagina, non la modifica singola.");
  if (proposal.mode !== "edit" || proposal.questions.length) throw new Error("Rispondi alle domande della proposta prima di applicarla.");
  let source = snapshot.document.source;
  const original = snapshot.document.nodes[snapshot.selectedId]; if (!original) throw new Error("L’elemento della proposta non è più disponibile.");
  const inspection = inspectElementValues(source, original.source, styleNames);
  const picked = new Set(accepted);
  if (!picked.size || [...picked].some(id => !proposal.operations.some(operation => operation.id === id))) throw new Error("Scegli le modifiche valide da applicare.");
  const operations = proposal.operations.filter(operation => picked.has(operation.id));
  for (const operation of operations) {
    if (operation.type === "text" && !original.capabilities.text || operation.type === "style" && !original.capabilities.style) throw new Error("Il template non permette questa modifica sull’elemento. Usa i campi guidati dell’Inspector.");
    if (operation.type === "style" && !inspection.canEditStyle) throw new Error("Lo stile è passato o sovrascritto da proprietà condivise. Configuralo dall’Inspector: l’AI non sostituisce stili che non può ricostruire.");
  }
  const textOperation = operations.find(operation => operation.type === "text");
  if (textOperation) source = updateStaticText(source, original.source.start, original.source.end, textOperation.value);
  const styles = Object.fromEntries(operations.filter(operation => operation.type === "style").map(operation => [operation.property!, aiStyleValue(operation.property!, operation.value)]));
  if (Object.keys(styles).length) {
    const parsed = textOperation ? parseSource(snapshot.document.file, source) : snapshot.document;
    const node = Object.values(parsed.nodes).find(node => node.source.start === original.source.start && node.type === original.type);
    if (!node) throw new Error("Il sorgente dell’elemento è cambiato. Richiedi una nuova proposta.");
    source = updateInlineStyles(source, node.source.start, node.source.end, styles);
  }
  parseSource(snapshot.document.file, source);
  return source;
}
