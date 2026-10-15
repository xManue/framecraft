import type { PlcVariableDefinition } from "../core/plcVariables";
import { isPlcVariableName } from "../core/plcVariables";
import type { EditorNode } from "../core/types";
import type { Dynamization } from "../core/hmiStandard";
import { hmiDynamizationAttribute } from "../core/hmiDynamizations";
import type { AiEditSnapshot, AiOperation } from "./aiProposal";
import { inspectElementValues } from "../source-parser/inspectElementValues";
import { insideProject } from "../core/paths";

export const aiBindingProperties = ["Text", "ForeColor", "BackColor", "BorderColor", "Visible"] as const;
export interface AiDataReference { id: string; label: string; tag: PlcVariableDefinition }
export interface AiBindingSpec { source: string; mode: "direct" | "boolean"; falseValue?: string; trueValue?: string }
const scalarTypes = new Set("BOOL BOOLEAN SINT USINT INT UINT DINT UDINT LINT ULINT REAL LREAL BYTE WORD DWORD LWORD CHAR WCHAR STRING WSTRING".split(" "));
const typeOf = (value: string) => value.trim().toUpperCase();
const signature = (tag: PlcVariableDefinition) => JSON.stringify([tag.name, typeOf(tag.dataType), tag.access, tag.address, tag.connection ?? "", !!tag.detected]);
export function aiReadableData(tag: PlcVariableDefinition) { return !tag.detected && isPlcVariableName(tag.name) && ["read", "read-write"].includes(tag.access) && scalarTypes.has(typeOf(tag.dataType)); }
export function sameAiDataReferences(a: readonly AiDataReference[] = [], b: readonly AiDataReference[] = []) { return a.length === b.length && a.every((item, index) => item.id === b[index].id && item.label === b[index].label && signature(item.tag) === signature(b[index].tag)); }
export function extendsAiDataReferences(a: readonly AiDataReference[] = [], b: readonly AiDataReference[] = []) { return b.length >= a.length && sameAiDataReferences(a, b.slice(0, a.length)); }
export function publicAiData(references: readonly AiDataReference[]) { return references.map(({ id, label, tag }) => ({ id, label, dataType: typeOf(tag.dataType) })); }
export function assertAiDataCurrent(references: readonly AiDataReference[] = [], catalog: readonly PlcVariableDefinition[]) {
  for (const ref of references) {
    const matches = catalog.filter(tag => tag.name === ref.tag.name);
    if (matches.length !== 1 || !aiReadableData(matches[0]) || signature(matches[0]) !== signature(ref.tag)) throw new Error(`Il dato «${ref.label}» è cambiato nel catalogo PLC. Rimuovilo dal contesto, sceglilo di nuovo e richiedi una nuova proposta.`);
  }
}
export function parseAiBinding(property: string, value: string): AiBindingSpec {
  let item: unknown; try { item = JSON.parse(value); } catch { throw new Error("Regola dati non leggibile: richiedi una nuova proposta."); }
  if (!aiBindingProperties.includes(property as typeof aiBindingProperties[number]) || !item || typeof item !== "object" || Array.isArray(item)) throw new Error("Proprietà dati non supportata.");
  const spec = item as Record<string, unknown>, keys = spec.mode === "direct" ? ["source", "mode"] : ["source", "mode", "falseValue", "trueValue"];
  if (Object.keys(spec).some(key => !keys.includes(key)) || !["direct", "boolean"].includes(String(spec.mode)) || typeof spec.source !== "string" || !/^data_[a-zA-Z0-9_-]{1,48}$/.test(spec.source)) throw new Error("La regola deve usare un riferimento ai dati scelti, senza codice o nomi tag inventati.");
  if (spec.mode === "direct" && !["Text", "Visible"].includes(property)) throw new Error("Per i colori scegli valori espliciti per falso e vero.");
  if (spec.mode === "boolean") for (const key of ["falseValue", "trueValue"]) {
    const text = spec[key];
    if (typeof text !== "string" || text.length > 128 || /[\u0000-\u001f]/.test(text)) throw new Error("Valore della regola booleana non valido.");
    if (property === "Visible" && !["true", "false"].includes(text)) throw new Error("La visibilità richiede true o false.");
    if (!["Text", "Visible"].includes(property) && !/^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|transparent)$/i.test(text)) throw new Error("La regola colore richiede valori esadecimali o trasparenti.");
  }
  return { source: spec.source, mode: spec.mode as AiBindingSpec["mode"], ...(spec.mode === "boolean" ? { falseValue: spec.falseValue as string, trueValue: spec.trueValue as string } : {}) };
}
export function readAiBindings(node: EditorNode): Dynamization[] {
  if (node.dynamicProps.includes(hmiDynamizationAttribute)) throw new Error("Le dinamiche sono calcolate dal codice: usa l’Inspector, l’AI non le sostituisce.");
  const raw = node.props[hmiDynamizationAttribute]; if (raw === undefined) return [];
  let values: unknown; try { values = typeof raw === "string" ? JSON.parse(raw) : undefined; } catch { throw new Error("Le dinamiche esistenti non sono leggibili: correggile nell’Inspector prima di proseguire."); }
  if (!Array.isArray(values) || values.some(item => !item || typeof item !== "object" || typeof item.property !== "string") || new Set(values.map(item => item.property)).size !== values.length) throw new Error("Le dinamiche esistenti sono ambigue: correggile nell’Inspector.");
  return values;
}
export function aiBindingCapabilities(node: EditorNode, inspection: ReturnType<typeof inspectElementValues>) {
  if (!node.capabilities.style || !/^(div|span|p|label|button|h[1-6]|strong|em|small|section|article|main|aside|header|footer|nav|li|td|th|output)$/.test(node.type) || !inspection.canEditDynamizations) return [];
  let items: Dynamization[]; try { items = readAiBindings(node); } catch { return []; }
  return aiBindingProperties.filter(property => property !== "Text" || node.capabilities.text && !node.children.length && inspection.text.kind === "literal" && !items.some(item => item.property === "ProcessValue"));
}
export function resolveAiBinding(snapshot: AiEditSnapshot, operation: AiOperation) {
  if (!insideProject(snapshot.root, snapshot.document.file) || snapshot.document.file.replaceAll("\\", "/").split("/").includes("..")) throw new Error("Le regole dati del pannello non possono modificare file esterni o template condivisi. Usa una pagina o un’istanza locale al progetto.");
  const spec = parseAiBinding(operation.property!, operation.value), ref = snapshot.dataReferences?.find(item => item.id === spec.source);
  if (!ref || !aiReadableData(ref.tag)) throw new Error("La regola usa un dato non scelto o non leggibile. Aggiungi il dato al contesto e richiedi una nuova proposta.");
  if ((spec.mode === "boolean" || operation.property === "Visible") && !["BOOL", "BOOLEAN"].includes(typeOf(ref.tag.dataType))) throw new Error("Questa regola richiede un segnale BOOL dichiarato, non un numero o una stringa.");
  const node = snapshot.document.nodes[snapshot.selectedId], inspection = node && inspectElementValues(snapshot.document.source, node.source, []);
  if (!node || !inspection || !aiBindingCapabilities(node, inspection).includes(operation.property as typeof aiBindingProperties[number])) throw new Error("Questo elemento non supporta la regola dati senza sostituire contenuti dinamici o condivisi: usa l’Inspector.");
  const binding: Dynamization = { property: operation.property!, kind: "Tag", tag: ref.tag.name, conditionType: spec.mode === "direct" ? "None" : "Singlebit", ...(spec.mode === "boolean" ? { entries: [{ condition: "false", value: spec.falseValue! }, { condition: "true", value: spec.trueValue! }] } : {}) };
  return { spec, ref, binding, previous: readAiBindings(node) };
}
