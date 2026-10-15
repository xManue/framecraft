import { create } from "zustand";
import { codexProvider, type AiAccount, type AiModel, type AiProvider } from "../ai/aiProvider";
import { aiEditContext, aiPrompt, aiProposalSchema, parseAiProposal, type AiEditSnapshot, type AiMode, type AiProposal } from "../ai/aiProposal";
import { interviewConfig, interviewPrompt, newAiInterview, sameInterviewAiContext, type AiInterview } from "../ai/aiInterview";
import { delegationQuestions, resolveInterviewDelegation } from "../ai/aiDelegation";

interface AiState {
  interview: AiInterview;
  resolvedInterview?: AiInterview;
  proposalUpdatedLocally: boolean;
  updateInterview(interview: AiInterview): void;
  resetInterview(): void;
  open: boolean; mode: AiMode; provider: AiProvider; account?: AiAccount; models: AiModel[]; model: string;
  busy: boolean; connecting: boolean; checking: boolean; accountError?: string; error?: string; proposal?: AiProposal; snapshot?: AiEditSnapshot; requestId?: string;
  show(mode: AiMode): void; close(): void; connect(): Promise<void>; refresh(): Promise<void>; logout(): Promise<void>;
  propose(prompt: string, snapshot?: AiEditSnapshot): Promise<void>; cancel(): Promise<void>;
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
let accountRefresh = 0;
export const useEditorAi = create<AiState>((set, get) => ({
  interview: newAiInterview(), proposalUpdatedLocally: false,
  updateInterview(interview) {
    const current = get(); if (current.busy) return;
    const keys = new Set(delegationQuestions(interview).map(question => question.key));
    const next = { ...interview, delegated: interview.delegated?.filter(key => keys.has(key)) };
    if (current.mode === "create" && current.proposal?.mode === "create" && current.proposal.project && !current.proposal.questions.length && sameInterviewAiContext(current.interview, next)) {
      try {
        const resolvedInterview = resolveInterviewDelegation(next, current.proposal.decisions ?? []), config = interviewConfig(resolvedInterview);
        set({ interview: next, proposal: { ...current.proposal, project: config }, resolvedInterview, proposalUpdatedLocally: true, error: undefined }); return;
      } catch { /* Invalid local mappings must not keep an approvable proposal. */ }
    }
    set({ interview: next, proposal: undefined, resolvedInterview: undefined, proposalUpdatedLocally: false, error: undefined });
  },
  resetInterview() { if (get().busy) return; set({ interview: newAiInterview(), proposal: undefined, resolvedInterview: undefined, proposalUpdatedLocally: false, error: undefined }); },
  open: false, mode: "create", provider: codexProvider, models: [], model: "", busy: false, connecting: false, checking: false,
  show(mode) { if (get().busy || get().mode === mode) { set({ open: true }); return; } set({ open: true, mode, proposal: undefined, snapshot: undefined, error: undefined }); },
  close() { set({ open: false }); },
  async refresh() {
    const provider = get().provider, revision = ++accountRefresh;
    const current = () => revision === accountRefresh && provider === get().provider;
    set({ checking: true, accountError: undefined });
    try {
      const account = await provider.connect(); if (!current()) return;
      set({ account });
      const models = account.connected ? await provider.models() : [];
      if (!current()) return;
      set({ account, models, model: models.some(model => model.id === get().model) ? get().model : (models.find(model => model.default) ?? models[0])?.id ?? "" });
    } catch (error) { if (current()) set({ accountError: message(error), account: undefined, models: [], model: "" }); }
    finally { if (current()) set({ checking: false }); }
  },
  async connect() {
    if (get().connecting || get().checking || get().busy) return; set({ connecting: true, accountError: undefined });
    try { await get().refresh(); if (!get().accountError && !get().account?.connected) await get().provider.login(); }
    catch (error) { set({ accountError: message(error) }); }
    finally { set({ connecting: false }); }
  },
  async logout() {
    if (get().busy || get().connecting || get().checking) return;
    ++accountRefresh; set({ checking: true, accountError: undefined });
    try { await get().provider.logout(); ++accountRefresh; set({ account: undefined, models: [], model: "", proposal: undefined }); }
    catch (error) { set({ accountError: message(error) }); }
    finally { set({ checking: false }); }
  },
  async propose(prompt, snapshot) {
    const { provider, mode, model, account, busy, checking, connecting } = get(); if (busy || checking || connecting) return;
    if (!account?.connected || !model) { set({ error: "Collega il tuo account ChatGPT e scegli un modello in Impostazioni → AI e account prima di inviare la richiesta." }); return; }
    const requestId = crypto.randomUUID();
    try {
      if (mode === "edit" && !snapshot) throw new Error("Seleziona l’elemento da modificare; l’AI non sceglie un altro oggetto al tuo posto.");
      const context = snapshot ? aiEditContext(snapshot) : undefined;
      const interview = get().interview;
      const input = mode === "create" ? interviewPrompt(interview) : aiPrompt(mode, prompt, context);
      set({ busy: true, requestId, snapshot, proposal: undefined, resolvedInterview: undefined, proposalUpdatedLocally: false, error: undefined });
      const result = await provider.propose({ requestId, model, prompt: input, schema: aiProposalSchema });
      if (get().requestId !== requestId || result.requestId !== requestId || get().provider !== provider) return;
      const proposal = parseAiProposal(result.text, mode);
      if (mode === "create") {
        if (get().interview !== interview) throw new Error("Le risposte sono cambiate: prepara una nuova proposta.");
        if (!proposal.project && !proposal.questions.length) throw new Error("L’AI ha cambiato il piano scelto. Nessun progetto creato: riprova la proposta.");
        if (proposal.project) {
          const resolvedInterview = resolveInterviewDelegation(interview, proposal.decisions ?? []), config = interviewConfig(resolvedInterview), { guided: _guided, ...base } = config;
          if (JSON.stringify({ ...proposal.project, sections: [...proposal.project.sections].sort() }) !== JSON.stringify({ ...base, sections: [...base.sections].sort() })) throw new Error("L’AI ha cambiato il piano scelto. Nessun progetto creato: riprova la proposta.");
          proposal.project = config; set({ resolvedInterview });
        } else if (proposal.decisions?.length) throw new Error("La proposta non contiene un piano completo per le scelte delegate.");
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
