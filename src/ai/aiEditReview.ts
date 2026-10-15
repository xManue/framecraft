import { aiRuntimeProperties, aiStyleNames, aiStyleValue, parseAiProposal, type AiEditSnapshot, type AiOperation, type AiProposal } from "./aiProposal";
import { inspectElementValues, type ElementValue } from "../source-parser/inspectElementValues";
import { resolveAiBinding } from "./aiBindings";

const labels: Record<string, string> = { text: "Testo", color: "Colore del testo", backgroundColor: "Colore di sfondo", borderColor: "Colore del bordo", borderRadius: "Arrotondamento", fontSize: "Dimensione del testo", fontWeight: "Spessore del testo", width: "Larghezza", height: "Altezza", left: "Posizione orizzontale", top: "Posizione verticale", zIndex: "Livello di sovrapposizione", opacity: "Opacità", rotate: "Rotazione" };
const pixels = new Set(["width", "height", "left", "top", "fontSize", "borderRadius"]);
Object.assign(labels, { display: "Disposizione", position: "Posizionamento", padding: "Spazio interno", margin: "Margine esterno", gap: "Spazio tra elementi", rowGap: "Spazio tra righe", columnGap: "Spazio tra colonne", textAlign: "Allineamento testo", alignItems: "Allineamento elementi", justifyContent: "Distribuzione elementi", flexDirection: "Direzione", flexWrap: "A capo", gridTemplateColumns: "Colonne della griglia", borderWidth: "Spessore bordo", borderStyle: "Stile bordo" });
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
function reviewBinding(snapshot: AiEditSnapshot, operation: AiOperation): AiEditChange {
  const names: Record<string, string> = { Text: "Testo da un dato", ForeColor: "Colore del testo da un dato", BackColor: "Sfondo da un dato", BorderColor: "Bordo da un dato", Visible: "Visibilità da un dato" };
  const label = names[operation.property!] ?? "Collegamento dati";
  try {
    const { spec, ref, binding, previous } = resolveAiBinding(snapshot, operation), old = previous.find(item => item.property === binding.property);
    const beforeText = old ? `${old.kind} · ${old.tag ?? "sorgente esistente"} · ${old.conditionType}` : "Nessuna regola per questa proprietà";
    const afterText = `${ref.label} → ${ref.tag.name} (${ref.tag.dataType}, sola lettura)\n${spec.mode === "direct" ? "Mostra il valore letto" : `Falso: ${spec.falseValue}\nVero: ${spec.trueValue}`}`;
    const unchanged = !!old && old.kind === "Tag" && old.tag === binding.tag && old.conditionType === binding.conditionType && !old.indirect && !old.source && !old.triggers?.length && !old.cycleMs && JSON.stringify(old.entries ?? []) === JSON.stringify(binding.entries ?? []);
    return { operation, label, before: { kind: "literal", value: beforeText }, after: { kind: "literal", value: afterText }, beforeText, afterText, unchanged, requiresConfirmation: true,
      warnings: [...(old ? ["Sostituisce la regola esistente di questa proprietà. Le altre dinamiche e gli eventi restano invariati."] : []), "Controlla il tag e i due stati prima di selezionare. Nessuna regola dati è preselezionata.", "Il collegamento legge soltanto. Non configura MQTT/OPC UA, non aggiunge scritture PLC e non certifica il dato: qualità e diagnostica vanno verificate nel pannello.", "Eventi e script già configurati possono reagire ai cambiamenti: verifica l’impatto prima dell’uso sulla macchina.", ...(binding.property === "Visible" ? ["La visibilità è una regola grafica, non un’autorizzazione o una funzione di sicurezza."] : [])] };
  } catch (error) { const blocked = error instanceof Error ? error.message : String(error); return { operation, label, before: { kind: "dynamic" }, after: { kind: "literal", value: "Non applicabile" }, beforeText: "Da verificare nell’Inspector", afterText: "Regola bloccata", unchanged: false, requiresConfirmation: true, warnings: [], blocked }; }
}
export function reviewAiEdits(snapshot: AiEditSnapshot, proposal: AiProposal): AiEditReview {
  try {
    const validated = parseAiProposal(proposal, "edit"), node = snapshot.document.nodes[snapshot.selectedId];
    if (!node) throw new Error("L’elemento della proposta non è più disponibile.");
    const original = inspectElementValues(snapshot.document.source, node.source, aiStyleNames);
    const changes = validated.operations.map(operation => {
      if (operation.type === "binding") return reviewBinding(snapshot, operation);
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
