import { parseSource } from "../source-parser/parseSource";
import { parseAiProposal, prepareAiEdits, type AiEditSnapshot, type AiProposal } from "./aiProposal";

export function aiProposalGroups(snapshot: AiEditSnapshot, input: AiProposal) {
  const proposal = parseAiProposal(input, "edit"), groups = new Map<string, { key: string; snapshot: AiEditSnapshot; proposal: AiProposal }>(), fields = new Set<string>();
  for (const operation of proposal.operations) {
    const key = operation.target ?? (snapshot.targets && Object.keys(snapshot.targets).length === 1 ? Object.keys(snapshot.targets)[0] : "selection");
    const target = snapshot.targets ? snapshot.targets[key] : key === "selection" ? snapshot : undefined;
    if (!target || target.root !== snapshot.root) throw new Error("La proposta indica un elemento non allegato. Nessun file modificato.");
    const node = target.document.nodes[target.selectedId]; if (!node) throw new Error("L’elemento allegato non esiste più.");
    const canonical = `${target.document.file}:${node.source.start}:${operation.type}:${operation.property}`;
    if (fields.has(canonical)) throw new Error("La proposta cambia due volte lo stesso campo, anche attraverso allegati diversi."); fields.add(canonical);
    if (!groups.has(key)) groups.set(key, { key, snapshot: snapshot.dataReferences ? { ...target, dataReferences: snapshot.dataReferences } : target, proposal: { ...proposal, operations: [] } });
    groups.get(key)!.proposal.operations.push({ ...operation, target: null });
  }
  return [...groups.values()];
}
export function prepareAiPageFiles(snapshot: AiEditSnapshot, proposal: AiProposal, accepted: readonly string[]) {
  if (!accepted.length || new Set(accepted).size !== accepted.length || accepted.some(id => !proposal.operations.some(operation => operation.id === id))) throw new Error("Scegli modifiche valide prima di applicare.");
  const groups = aiProposalGroups(snapshot, proposal), files = new Map<string, { file: string; previous: string; source: string }>();
  for (const group of groups.sort((a, b) => b.snapshot.document.nodes[b.snapshot.selectedId].source.start - a.snapshot.document.nodes[a.snapshot.selectedId].source.start)) {
    const operations = group.proposal.operations.filter(operation => accepted.includes(operation.id)); if (!operations.length) continue;
    const { document, selectedId } = group.snapshot, original = document.nodes[selectedId];
    const current = files.get(document.file) ?? { file: document.file, previous: document.source, source: document.source };
    if (current.previous !== document.source) throw new Error("Due allegati dello stesso file hanno versioni diverse: allegali di nuovo.");
    const parsed = parseSource(document.file, current.source), node = Object.values(parsed.nodes).find(item => item.source.start === original.source.start && item.type === original.type);
    if (!node) throw new Error("La struttura è cambiata: prepara una nuova proposta.");
    current.source = prepareAiEdits({ ...group.snapshot, document: parsed, selectedId: node.id, targets: undefined }, { ...group.proposal, operations }, operations.map(item => item.id)); files.set(document.file, current);
  }
  return [...files.values()];
}
