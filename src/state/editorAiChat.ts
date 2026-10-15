import { create } from "zustand";
import { aiChatContext, aiElementAttachment, aiPageAttachment, type AiChatAttachment, type AiChatMessage } from "../ai/aiChat";
import { aiSelectionKey } from "../ai/aiProposal";
import type { PageDefinition } from "../core/types";
import { useEditorAi } from "./editorAi";
import { useEditorStore } from "./editorStore";

interface ChatState {
  root?: string;
  generation: number;
  draft: string;
  attachments: AiChatAttachment[];
  messages: AiChatMessage[];
  error?: string;
  sending: boolean;
  applying: boolean;
  setDraft(value: string): void;
  syncRoot(root?: string): void;
  clear(): void;
  attachSelection(): void;
  attachPage(page: PageDefinition): void;
  removeAttachment(id: string): void;
  send(): Promise<void>;
  cancel(): Promise<void>;
  apply(id: string, accepted: string[]): Promise<void>;
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
export const useEditorAiChat = create<ChatState>((set, get) => ({
  generation: 0, draft: "", attachments: [], messages: [], sending: false, applying: false,
  setDraft(draft) { if (!get().sending && !get().applying) set({ draft: draft.slice(0, 8000) }); },
  syncRoot(root) {
    if (get().root === root) return;
    const ai = useEditorAi.getState();
    if (get().sending && ai.mode === "edit") {
      void ai.cancel(); useEditorAi.setState({ requestId: undefined, busy: false, proposal: undefined, snapshot: undefined });
    }
    set({ root, generation: get().generation + 1, draft: "", attachments: [], messages: [], sending: false, applying: false, error: undefined });
  },
  clear() {
    if (get().sending || get().applying) return;
    set({ generation: get().generation + 1, draft: "", attachments: [], messages: [], error: undefined });
    if (useEditorAi.getState().mode === "edit") useEditorAi.setState({ proposal: undefined, snapshot: undefined, error: undefined });
  },
  attachSelection() {
    if (get().sending || get().applying) return;
    const state = useEditorStore.getState(); get().syncRoot(state.project?.root);
    try {
      if (!state.project || !state.document || !state.selectedId || state.interactionMode !== "edit") throw new Error("Seleziona un elemento in Modifica, poi aggiungilo alla chat.");
      if (state.loading || state.reloadRecovery || state.highlightPicker) throw new Error("Completa prima l’operazione in corso nell’editor.");
      const attachment = aiElementAttachment({ root: state.project.root, document: state.document, selectedId: state.selectedId, selectionKey: aiSelectionKey(state.selectionInfo, state.editScope) });
      set({ attachments: [...get().attachments.filter(item => item.kind !== "element"), attachment], error: undefined });
    } catch (error) { set({ error: message(error) }); }
    useEditorAi.getState().show("edit");
  },
  attachPage(page) {
    if (get().sending || get().applying) return;
    const state = useEditorStore.getState(); get().syncRoot(state.project?.root);
    if (!state.project || !state.pages.some(item => item === page)) return;
    const attachment = aiPageAttachment(state.project.root, page), others = get().attachments.filter(item => item.id !== attachment.id);
    if (others.filter(item => item.kind === "page").length >= 5) { set({ error: "Puoi allegare fino a 5 pagine: rimuovi un riferimento prima di aggiungerne un altro." }); }
    else set({ attachments: [...others, attachment], error: undefined });
    useEditorAi.getState().show("edit");
  },
  removeAttachment(id) { if (!get().sending && !get().applying) set({ attachments: get().attachments.filter(item => item.id !== id), error: undefined }); },
  async send() {
    const ai = useEditorAi.getState(), state = get(), root = useEditorStore.getState().project?.root;
    if (state.sending || state.applying || ai.busy || ai.checking || ai.connecting) return;
    if (!root || state.root !== root) { get().syncRoot(root); set({ error: "Apri un progetto prima di usare la chat." }); return; }
    if (!state.draft.trim()) return;
    if (!ai.account?.connected || !ai.model) { set({ error: "Collega l’account ChatGPT e scegli il modello in Impostazioni → AI e account." }); return; }
    const prompt = state.draft.trim(), attachments = state.attachments, generation = state.generation;
    if (state.messages.length + 2 > 40) { set({ error: "Questa conversazione ha raggiunto il limite di messaggi. Avvia una nuova chat per continuare." }); return; }
    const snapshot = attachments.find(item => item.kind === "element")?.snapshot;
    const user: AiChatMessage = { id: crypto.randomUUID(), role: "user", text: prompt, attachments: attachments.map(item => item.label) };
    set({ sending: true, error: undefined, messages: [...state.messages, user] });
    ai.show("edit");
    await useEditorAi.getState().propose(prompt, snapshot, aiChatContext(attachments, state.messages));
    if (get().generation !== generation || useEditorStore.getState().project?.root !== root) return;
    const result = useEditorAi.getState();
    if (result.proposal && !result.error) {
      const proposal = result.proposal;
      set({ sending: false, draft: "", messages: [...get().messages, { id: crypto.randomUUID(), role: "assistant", text: [proposal.summary, ...proposal.questions, ...proposal.warnings].join("\n\n"), proposal, snapshot }] });
    } else set({ sending: false, error: result.error ?? "Richiesta interrotta. Il testo è conservato: puoi riprovare.", messages: get().messages.map(item => item.id === user.id ? { ...item, status: "error" } : item) });
  },
  async cancel() {
    if (!get().sending) return;
    const ai = useEditorAi.getState(), id = ai.requestId, generation = get().generation + 1;
    const pending = ai.cancel();
    useEditorAi.setState({ requestId: undefined });
    set({ generation, messages: get().messages.map((item, index, all) => index === all.length - 1 && item.role === "user" ? { ...item, status: "cancelled" } : item), error: "Richiesta annullata. Il testo è conservato: puoi modificarlo e riprovare." });
    await pending;
    if (get().generation === generation) {
      set({ sending: false });
      if (!useEditorAi.getState().requestId && id) useEditorAi.setState({ busy: false });
    }
  },
  async apply(id, accepted) {
    const state = get(), target = state.messages.find(item => item.id === id);
    if (state.applying || state.sending || useEditorAi.getState().busy) return;
    if (!target?.snapshot || !target.proposal || target.status || target !== state.messages.at(-1)) { set({ error: "Questa proposta è superata. Richiedi una nuova proposta sull’elemento attuale." }); return; }
    const generation = state.generation;
    set({ applying: true, error: undefined });
    try {
      await useEditorStore.getState().applyAiProposal(target.snapshot, target.proposal, accepted);
      if (get().generation === generation) {
        set({ messages: get().messages.map(item => item.id === id ? { ...item, status: "applied" } : item) });
        const current = useEditorStore.getState(), node = current.selectedId ? current.document?.nodes[current.selectedId] : undefined;
        if (current.project?.root === target.snapshot.root && current.document && current.selectedId && node?.source.start === target.snapshot.document.nodes[target.snapshot.selectedId]?.source.start && get().attachments.some(item => item.snapshot === target.snapshot)) {
          try {
            const fresh = aiElementAttachment({ root: current.project.root, document: current.document, selectedId: current.selectedId, selectionKey: aiSelectionKey(current.selectionInfo, current.editScope) });
            set({ attachments: get().attachments.map(item => item.snapshot === target.snapshot ? fresh : item) });
          } catch { /* Keep the explicitly attached snapshot if the updated element cannot be inspected. */ }
        }
        useEditorAi.setState({ proposal: undefined, snapshot: undefined });
      }
    } catch (error) { if (get().generation === generation) set({ error: message(error) }); }
    finally { if (get().generation === generation) set({ applying: false }); }
  },
}));

export function installAiChatProjectScope() {
  useEditorAiChat.getState().syncRoot(useEditorStore.getState().project?.root);
  const stopProject = useEditorStore.subscribe((state, previous) => {
    if (state.project?.root !== previous.project?.root) useEditorAiChat.getState().syncRoot(state.project?.root);
  });
  const stopAccount = useEditorAi.subscribe((state, previous) => {
    if (previous.account?.connected && (!state.account?.connected || state.account.email !== previous.account.email)) {
      const root = useEditorStore.getState().project?.root;
      useEditorAiChat.getState().syncRoot(undefined); useEditorAiChat.getState().syncRoot(root);
    }
  });
  return () => { stopProject(); stopAccount(); };
}
