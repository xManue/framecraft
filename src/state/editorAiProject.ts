import { parseAiProjectReceipt, validateAiProjectCode, validateAiProjectReview, type AiProjectReceipt, type AiProjectReview } from "../ai/aiProjectEdits";
import { desktopBridge } from "../filesystem/desktopBridge";
import { joinProjectPath } from "../core/paths";
import { useEditorStore } from "./editorStore";

export function assertAiProjectEditable(root: string) {
  const editor = useEditorStore.getState();
  if (!editor.project || editor.project.root !== root) throw new Error("Il progetto della proposta non è più aperto.");
  if (editor.dirty) throw new Error("Salva o scarta prima la bozza aperta: la proposta AI non la sovrascrive.");
  if (editor.loading || editor.exporting || editor.reloadRecovery || editor.highlightPicker || editor.interactionMode !== "edit") throw new Error("Torna in Modifica e completa le operazioni in corso prima di applicare o ripristinare.");
  return editor;
}
function nativeError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return /command.+not found|unknown command/i.test(detail)
    ? new Error("Questa finestra desktop non ha ancora i comandi per modifiche di progetto. Salva il lavoro e apri la build aggiornata di Framecraft. Nessuna modifica applicata.")
    : new Error(detail);
}
export async function applyAiProjectFiles(input: AiProjectReview, current: () => boolean): Promise<AiProjectReceipt> {
  const review = validateAiProjectReview(input), editor = assertAiProjectEditable(review.root), project = editor.project, document = editor.document;
  if (!review.changes.length) throw new Error("Questa proposta non contiene modifiche da applicare.");
  const valid = () => {
    if (!current() || useEditorStore.getState().project !== project || useEditorStore.getState().document !== document) throw new Error("L’editor è cambiato durante il controllo. Nessun file è stato scritto: rivedi la proposta.");
    assertAiProjectEditable(review.root);
  };
  try {
    const dependencies = new Set<string>(), known = new Set([...(review.knownFiles ?? []), ...review.changes.map(change => change.path)]);
    for (const change of review.changes) {
      valid();
      if (document?.file.replaceAll("\\", "/") === joinProjectPath(review.root, change.path).replaceAll("\\", "/") && document.source !== change.before) throw new Error(`${change.path}: l’editor ha una versione diversa da quella della proposta.`);
      const disk = await desktopBridge.readAiProjectFile(review.root, change.path); valid();
      if (disk !== change.before) throw new Error(`${change.path} è cambiato dopo la proposta. Non viene sovrascritto.`);
      if (change.path !== "framecraft.plc.json") validateAiProjectCode(change.path, change.before, change.after, known).forEach(file => dependencies.add(file));
    }
    for (const file of dependencies) if (!review.changes.some(change => change.path === file)) {
      if (await desktopBridge.readAiProjectFile(review.root, file) === null) throw new Error(`La dipendenza ${file} non esiste più. Richiedi una nuova proposta.`);
      valid();
    }
    valid();
    const backup = await desktopBridge.applyAiProjectChanges(review.root, review.changes);
    return parseAiProjectReceipt({ root: review.root, backup, files: review.changes.map(change => change.path), restored: false });
  } catch (error) { throw nativeError(error); }
}
export async function restoreAiProjectFiles(input: AiProjectReceipt, current: () => boolean): Promise<AiProjectReceipt> {
  const receipt = parseAiProjectReceipt(input); assertAiProjectEditable(receipt.root);
  if (receipt.restored || !current()) throw new Error("Questo backup non è più ripristinabile da questa richiesta.");
  try { await desktopBridge.restoreAiProjectChanges(receipt.root, receipt.backup); }
  catch (error) { throw nativeError(error); }
  return { ...receipt, restored: true };
}
