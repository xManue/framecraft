import { create } from "zustand";
import { codexProvider, type AiAccount, type AiModel, type AiProvider } from "../ai/aiProvider";
import { aiEditContext, aiPrompt, aiProposalSchema, parseAiProposal, type AiEditSnapshot, type AiMode, type AiProposal } from "../ai/aiProposal";
import { interviewConfig, interviewPrompt, newAiInterview, type AiInterview } from "../ai/aiInterview";

interface AiState {
  interview: AiInterview;
  updateInterview(interview: AiInterview): void;
  resetInterview(): void;
  open: boolean; mode: AiMode; provider: AiProvider; account?: AiAccount; models: AiModel[]; model: string;
  busy: boolean; connecting: boolean; error?: string; proposal?: AiProposal; snapshot?: AiEditSnapshot; requestId?: string;
  show(mode: AiMode): void; close(): void; connect(): Promise<void>; refresh(): Promise<void>; logout(): Promise<void>;
  propose(prompt: string, snapshot?: AiEditSnapshot): Promise<void>; cancel(): Promise<void>;
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
export const useEditorAi = create<AiState>((set, get) => ({
  interview: newAiInterview(),
  updateInterview(interview) { if (get().busy) return; set({ interview, proposal: undefined, error: undefined }); },
  resetInterview() { if (get().busy) return; set({ interview: newAiInterview(), proposal: undefined, error: undefined }); },
  open: false, mode: "create", provider: codexProvider, models: [], model: "", busy: false, connecting: false,
  show(mode) { if (get().busy || get().mode === mode) { set({ open: true }); return; } set({ open: true, mode, proposal: undefined, snapshot: undefined, error: undefined }); },
  close() { set({ open: false }); },
  async refresh() {
    const provider = get().provider;
    try {
      const account = await provider.connect(); if (provider !== get().provider) return;
      const models = account.connected ? await provider.models() : [];
      if (provider !== get().provider) return;
      set({ account, models, model: models.some(model => model.id === get().model) ? get().model : (models.find(model => model.default) ?? models[0])?.id ?? "" });
    } catch (error) { set({ error: message(error) }); }
  },
  async connect() {
    if (get().connecting || get().busy) return; set({ connecting: true, error: undefined });
    try { await get().refresh(); if (!get().error && !get().account?.connected) await get().provider.login(); }
    catch (error) { set({ error: message(error) }); }
    finally { set({ connecting: false }); }
  },
  async logout() {
    if (get().busy || get().connecting) return;
    try { await get().provider.logout(); set({ account: undefined, models: [], model: "", proposal: undefined }); }
    catch (error) { set({ error: message(error) }); }
  },
  async propose(prompt, snapshot) {
    const { provider, mode, model, account, busy } = get(); if (busy) return;
    if (!account?.connected || !model) { set({ error: "Collega ChatGPT e scegli un modello prima di inviare la richiesta." }); return; }
    const requestId = crypto.randomUUID();
    try {
      if (mode === "edit" && !snapshot) throw new Error("Seleziona l’elemento da modificare; l’AI non sceglie un altro oggetto al tuo posto.");
      const context = snapshot ? aiEditContext(snapshot) : undefined;
      const interview = get().interview;
      const input = mode === "create" ? interviewPrompt(interview) : aiPrompt(mode, prompt, context);
      set({ busy: true, requestId, snapshot, proposal: undefined, error: undefined });
      const result = await provider.propose({ requestId, model, prompt: input, schema: aiProposalSchema });
      if (get().requestId !== requestId || result.requestId !== requestId || get().provider !== provider) return;
      const proposal = parseAiProposal(result.text, mode);
      if (mode === "create") {
        if (get().interview !== interview) throw new Error("Le risposte sono cambiate: prepara una nuova proposta.");
        const config = interviewConfig(interview), { guided: _guided, ...base } = config;
        if (proposal.project && JSON.stringify({ ...proposal.project, sections: [...proposal.project.sections].sort() }) !== JSON.stringify({ ...base, sections: [...base.sections].sort() }) || !proposal.project && !proposal.questions.length) throw new Error("L’AI ha cambiato il piano scelto. Nessun progetto creato: riprova la proposta.");
        if (proposal.project) proposal.project = config;
      }
      set({ proposal });
    } catch (error) { if (get().requestId === requestId || !get().busy) set({ error: message(error) }); }
    finally { if (get().requestId === requestId) set({ busy: false, requestId: undefined }); }
  },
  async cancel() {
    const id = get().requestId; if (!id) return;
    try { await get().provider.cancel(id); }
    catch (error) { if (get().requestId === id) set({ error: message(error) }); }
  },
}));
