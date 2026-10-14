import type { EditorDocument, EditorNode } from "../core/types";
import { standardProjectSectionChoices, type StandardProjectConfig } from "../core/standardProject";
import { settingsProgramChoices } from "../core/hmiSectionMenu";
import { parseSource } from "../source-parser/parseSource";
import { updateInlineStyles, updateStaticText } from "../source-parser/transformSource";
import { standardPageTemplates } from "../core/hmiPageTemplates";
import { guidedTemplateBehavior, type TemplateBehavior } from "../core/templateBehavior";

export type AiMode = "create" | "edit";
export interface AiOperation { id: string; type: "text" | "style"; property: string | null; value: string }
export interface AiProposal { version: 1; mode: AiMode; summary: string; questions: string[]; warnings: string[]; provenance: string[]; project: StandardProjectConfig | null; operations: AiOperation[] }
export interface AiEditSnapshot { root: string; document: EditorDocument; selectedId: string }
const styleNames = ["color", "backgroundColor", "borderColor", "borderRadius", "fontSize", "fontWeight", "width", "height", "left", "top", "zIndex", "opacity", "rotate"];
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
};
export const aiProposalSchema = { type: "object", properties, required: Object.keys(properties), additionalProperties: false };

function object(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error("La proposta contiene campi non supportati. Nessuna modifica applicata.");
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 2000) {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error("La proposta contiene un testo non valido o troppo lungo.");
  return value;
}
function list(value: unknown) { if (!Array.isArray(value) || value.length > 24) throw new Error("Elenco della proposta non valido."); return value.map(item => text(item)); }
function styleValue(property: string, value: string) {
  if (!styleNames.includes(property)) throw new Error("L’AI non può applicare questa proprietà.");
  if (["color", "backgroundColor", "borderColor"].includes(property)) {
    if (!/^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|transparent|currentColor)$/i.test(value)) throw new Error("Colore non valido: usa esadecimale o trasparente.");
    return value;
  }
  if (property === "opacity") { const number = Number(value); if (!value.trim() || !Number.isFinite(number) || number < 0 || number > 1) throw new Error("Opacità fuori intervallo."); return number; }
  if (property === "zIndex" || property === "fontWeight") { const number = Number(value); if (!value.trim() || !Number.isInteger(number) || Math.abs(number) > 10_000 || property === "fontWeight" && (number < 100 || number > 900)) throw new Error("Numero non valido nella proprietà."); return number; }
  if (property === "rotate") { if (!/^-?\d{1,3}(\.\d+)?deg$/.test(value)) throw new Error("Rotazione non valida."); return value; }
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
  if (item.version !== 1 || item.mode !== mode || !Array.isArray(item.operations) || item.operations.length > 32) throw new Error("La proposta non corrisponde all’operazione richiesta.");
  const operations = item.operations.map(raw => {
    const operation = object(raw, ["id", "type", "property", "value"]), id = text(operation.id, 64), value = text(operation.value, 512);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || !["text", "style"].includes(String(operation.type))) throw new Error("Operazione della proposta non valida.");
    if (operation.type === "text") { if (operation.property !== null) throw new Error("Il testo non può modificare proprietà o comportamenti."); }
    else styleValue(text(operation.property, 64), value);
    return { id, type: operation.type, property: operation.property, value } as AiOperation;
  });
  if (new Set(operations.map(operation => operation.id)).size !== operations.length) throw new Error("Operazioni duplicate nella proposta.");
  let project: StandardProjectConfig | null = null;
  if (mode === "create" && item.project !== null) {
    const config = object(item.project, ["machineName", "layout", "sections", "settingsProgram"]), machineName = text(config.machineName, 120).trim();
    if (!machineName || !["desktop", "desktop-mobile"].includes(String(config.layout)) || !Array.isArray(config.sections) || !config.sections.length || config.sections.length > 7 || !config.sections.every(id => standardProjectSectionChoices.some(section => section.id === id)) || new Set(config.sections).size !== config.sections.length || !settingsProgramChoices.some(program => program.id === config.settingsProgram)) throw new Error("Il piano di creazione non è compatibile con lo standard dell’app.");
    project = { machineName, layout: config.layout as StandardProjectConfig["layout"], sections: config.sections as StandardProjectConfig["sections"], settingsProgram: config.settingsProgram as StandardProjectConfig["settingsProgram"] };
  }
  if (mode === "edit" && item.project !== null || mode === "create" && operations.length) throw new Error("La proposta mescola creazione e modifica del progetto.");
  const provenance = list(item.provenance);
  const allowed = mode === "create" ? ["approved-request", "framecraft-standard"] : ["approved-request", "approved-selection"];
  if (!provenance.every(source => allowed.includes(source))) throw new Error("La proposta cita una fonte che non è stata fornita o approvata.");
  return { version: 1, mode, summary: text(item.summary), questions: list(item.questions), warnings: list(item.warnings), provenance, project, operations };
}
export function aiEditContext(snapshot: AiEditSnapshot) {
  const node = snapshot.document.nodes[snapshot.selectedId]; if (!node) throw new Error("Seleziona un elemento prima di chiedere una modifica.");
  let current: EditorNode | undefined = node, template: TemplateBehavior | undefined;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id); const id = current.props["data-hmi-template-id"];
    if (typeof id === "string" && current.props["data-hmi-template-version"] === 1) { template = id.startsWith("guided:") ? guidedTemplateBehavior(id.slice(7)) : standardPageTemplates.find(item => item.behavior.id === id)?.behavior; break; }
    current = current.parentId ? snapshot.document.nodes[current.parentId] : undefined;
  }
  return { file: snapshot.document.file.split(/[\\/]/).at(-1), ...(template ? { template } : {}), element: { type: node.type, text: node.text, styles: Object.fromEntries(Object.entries(node.styles).filter(([key]) => styleNames.includes(key))) } };
}
export function aiPrompt(mode: AiMode, request: string, context?: ReturnType<typeof aiEditContext>) {
  return JSON.stringify({ task: mode, request: text(request, 8000), approvedContext: context ?? null,
    standard: mode === "create" ? { sections: standardProjectSectionChoices.map(({ id, label, description }) => ({ id, label, description })), settingsPrograms: settingsProgramChoices.map(({ id, label }) => ({ id, label })) } : null,
    rules: "Prepara una proposta, non eseguire nulla. Non inserire codice, tag PLC, soglie, indirizzi, credenziali, azioni o autorizzazioni. Per la creazione scegli soltanto sezioni e layout esistenti; spiega i dati macchina mancanti. Per la modifica proponi testo e le proprietà grafiche supportate, con colori esadecimali. Se la richiesta supera queste capacità spiega nelle questions cosa serve, senza fingere di averlo fatto. Il progetto rimane completamente modificabile a mano." });
}
export function prepareAiEdits(snapshot: AiEditSnapshot, proposal: AiProposal, accepted: readonly string[]): string {
  if (proposal.mode !== "edit" || proposal.questions.length) throw new Error("Rispondi alle domande della proposta prima di applicarla.");
  let source = snapshot.document.source;
  const original = snapshot.document.nodes[snapshot.selectedId]; if (!original) throw new Error("L’elemento della proposta non è più disponibile.");
  const picked = new Set(accepted);
  if (!picked.size || [...picked].some(id => !proposal.operations.some(operation => operation.id === id))) throw new Error("Scegli le modifiche valide da applicare.");
  for (const operation of proposal.operations.filter(operation => picked.has(operation.id))) {
    if (operation.type === "text" && !original.capabilities.text || operation.type === "style" && !original.capabilities.style) throw new Error("Il template non permette questa modifica sull’elemento. Usa i campi guidati dell’Inspector.");
    const parsed = parseSource(snapshot.document.file, source), node = Object.values(parsed.nodes).find(node => node.source.start === original.source.start && node.type === original.type) as EditorNode | undefined;
    if (!node) throw new Error("Il sorgente dell’elemento è cambiato. Richiedi una nuova proposta.");
    source = operation.type === "text" ? updateStaticText(source, node.source.start, node.source.end, operation.value)
      : updateInlineStyles(source, node.source.start, node.source.end, { [operation.property!]: styleValue(operation.property!, operation.value) });
  }
  parseSource(snapshot.document.file, source);
  return source;
}
