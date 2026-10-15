import { aiRuntimeProperties, aiStyleNames, aiStyleValue, parseAiProposal, type AiEditSnapshot, type AiOperation, type AiProposal } from "./aiProposal";
import { inspectElementValues, type ElementValue } from "../source-parser/inspectElementValues";

const labels: Record<string, string> = { text: "Testo", color: "Colore del testo", backgroundColor: "Colore di sfondo", borderColor: "Colore del bordo", borderRadius: "Arrotondamento", fontSize: "Dimensione del testo", fontWeight: "Spessore del testo", width: "Larghezza", height: "Altezza", left: "Posizione orizzontale", top: "Posizione verticale", zIndex: "Livello di sovrapposizione", opacity: "Opacità", rotate: "Rotazione" };
const pixels = new Set(["width", "height", "left", "top", "fontSize", "borderRadius"]);
export interface AiEditChange {
  operation: AiOperation; label: string; before: ElementValue; after: ElementValue;
  beforeText: string; afterText: string; unchanged: boolean; requiresConfirmation: boolean; warnings: string[]; blocked?: string;
}
export interface AiEditReview { changes: AiEditChange[]; defaults: string[]; error?: string }
export function aiEditValueText(value: ElementValue, property: string): string {
  if (value.kind === "dynamic") return "Valore dinamico, gestito dal codice";
  if (value.kind === "inherited") return "Non impostato inline · dipende da CSS o componente";
  if (value.value === "") return "Testo vuoto";
  return `${value.value}${typeof value.value === "number" && pixels.has(property) ? " px" : ""}`;
}
function sameValue(before: ElementValue, after: ElementValue, property: string) {
  if (before.kind !== "literal" || after.kind !== "literal") return false;
  const normalize = (value: string | number | undefined) => {
    const text = String(value).trim();
    return pixels.has(property) && /^-?\d+(\.\d+)?(px)?$/.test(text) ? String(parseFloat(text)) : /^#[\da-f]+$/i.test(text) ? text.toLowerCase() : text;
  };
  return normalize(before.value) === normalize(after.value);
}
function runtimeWarning(snapshot: AiEditSnapshot, operation: AiOperation): string | undefined {
  const node = snapshot.document.nodes[snapshot.selectedId];
  const runtime = aiRuntimeProperties(node);
  if (runtime.unknown) return "La configurazione delle dinamizzazioni non è statica o leggibile: verifica il comportamento nell’Inspector. Il confronto non rappresenta valori PLC.";
  if (runtime.properties.includes(operation.type === "text" ? "text" : operation.property!)) return "Modifica del valore base: la dinamizzazione HMI resta collegata e può sostituirlo nel pannello in esecuzione.";
}
export function reviewAiEdits(snapshot: AiEditSnapshot, proposal: AiProposal): AiEditReview {
  try {
    const validated = parseAiProposal(proposal, "edit"), node = snapshot.document.nodes[snapshot.selectedId];
    if (!node) throw new Error("L’elemento della proposta non è più disponibile.");
    const original = inspectElementValues(snapshot.document.source, node.source, aiStyleNames);
    const changes = validated.operations.map(operation => {
      const property = operation.type === "text" ? "text" : operation.property!, before = property === "text" ? original.text : original.styles[property];
      const warnings: string[] = [], controlled = runtimeWarning(snapshot, operation);
      if (before.kind === "dynamic") warnings.push("Sostituisce un valore calcolato con uno fisso. Seleziona questa modifica solo se vuoi rinunciare al comportamento dinamico di questo campo.");
      if (controlled) warnings.push(controlled);
      if (operation.type === "text" && original.mixedText) warnings.push("Cambia soltanto il testo fisso; icone, elementi figli e valori calcolati adiacenti restano invariati.");
      const after: ElementValue = { kind: "literal", value: operation.type === "text" ? operation.value : aiStyleValue(property, operation.value) };
      const blocked = operation.type === "text" && !node.capabilities.text || operation.type === "style" && !node.capabilities.style
        ? "Il template non permette questa modifica sull’elemento. Usa i campi guidati dell’Inspector."
        : operation.type === "style" && !original.canEditStyle ? "Lo stile è passato o sovrascritto da proprietà condivise. Configuralo dall’Inspector: l’AI non sostituisce stili che non può ricostruire." : undefined;
      return { operation, label: labels[property] ?? property, before, after, beforeText: aiEditValueText(before, property), afterText: aiEditValueText(after, property), unchanged: !blocked && sameValue(before, after, property), requiresConfirmation: before.kind === "dynamic" || !!controlled, warnings, blocked };
    });
    return { changes, defaults: changes.filter(change => !change.blocked && !change.unchanged && !change.requiresConfirmation).map(change => change.operation.id) };
  } catch (error) { return { changes: [], defaults: [], error: error instanceof Error ? error.message : String(error) }; }
}
