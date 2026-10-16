import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { installAiChatRecovery } from "./editorAiChatRecovery";
import { aiChatContext, aiElementAttachment, aiPageAttachment, prepareAiChat, type AiChatAttachment, type AiChatMessage, type AiChatPrepared, type AiChatQuestionAnswer } from "../ai/aiChat";
import { aiSelectionKey } from "../ai/aiProposal";
import type { FileEntry, PageDefinition } from "../core/types";
import { useEditorAi } from "./editorAi";
import { useEditorStore } from "./editorStore";
import { aiChatScope } from "../ai/aiPageContext";
import { aiProposalGroups, prepareAiPageFiles } from "../ai/aiPageEdits";
import { insideProject } from "../core/paths";
import { parseSource } from "../source-parser/parseSource";
import { desktopBridge } from "../filesystem/desktopBridge";
import { aiMessageQuestions, pendingAiQuestions, prepareAiQuestionReply, prepareAiProjectQuestionReply } from "../ai/aiChatQuestions";
import { aiReadableData, assertAiDataCurrent, sameAiDataReferences, type AiDataReference } from "../ai/aiBindings";
import { runAiProject } from "../ai/aiProjectContext";
import { aiProjectSchema, validateAiProjectReview, type AiProjectReceipt, type AiProjectReview } from "../ai/aiProjectEdits";
import { applyAiProjectFiles, restoreAiProjectFiles } from "./editorAiProject";

export interface ChatState {
  root?: string;
  generation: number;
  draft: string;
  contextNotes: string;
  prepared?: AiChatPrepared;
  authorizedFor?: string;
  allowed(): boolean;
  setAllowed(allowed: boolean): void;
  attachments: AiChatAttachment[];
  dataReferences: AiDataReference[];
  addData(name: string, label: string): void;
  removeData(id: string): void;
  messages: AiChatMessage[];
  error?: string;
  recovered?: boolean;
  recoveredReferences?: string[];
  recoveryError?: string;
  recovering?: boolean;
  sending: boolean;
  applying: boolean;
  projectAccess: boolean;
  projectProgress?: string;
  setProjectAccess(value: boolean): void;
  stageProjectReview(review: AiProjectReview): void;
  sendProject(replyTo?: string): Promise<void>;
  applyProject(id: string, expected: AiProjectReview): Promise<void>;
  restoreProject(id: string, expected: AiProjectReceipt): Promise<void>;
  setDraft(value: string): void;
  setContextNotes(value: string): void;
  syncRoot(root?: string): void;
  clear(): void;
  attachSelection(): void;
  attachPage(page: PageDefinition): Promise<void>;
  removeAttachment(id: string): void;
  setAnswer(id: string, index: number, update: Partial<AiChatQuestionAnswer>): void;
  send(replyTo?: string): Promise<void>;
  cancel(): Promise<void>;
  apply(id: string, accepted: string[]): Promise<void>;
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
function sessionKey() {
  const root = useEditorStore.getState().project?.root, ai = useEditorAi.getState();
  return root && ai.account?.connected ? JSON.stringify([root, ai.provider.id, ai.account.email, useEditorAiChat.getState().projectAccess ? "project" : "selection"]) : undefined;
}
const filePaths = (entries: FileEntry[]): string[] => entries.flatMap(entry => entry.kind === "directory" ? filePaths(entry.children ?? []) : [entry.path]);
const createChatState: StateCreator<ChatState> = (set, get) => ({
  generation: 0, draft: "", contextNotes: "", attachments: [], dataReferences: [], messages: [], sending: false, applying: false, projectAccess: true,
  allowed() { return !!get().authorizedFor && get().authorizedFor === sessionKey(); },
  setAllowed(allowed) {
    set({ authorizedFor: allowed ? sessionKey() : undefined });
    if (!allowed && get().sending) void get().cancel();
  },
  setDraft(draft) { if (!get().sending && !get().applying && !get().recovering) set({ draft: draft.slice(0, 8000) }); },
  setContextNotes(contextNotes) { if (!get().sending && !get().applying && !get().recovering) set({ contextNotes: contextNotes.slice(0, 2000) }); },
  setProjectAccess(projectAccess) { if (!get().sending && !get().applying && !get().recovering) set({ projectAccess, authorizedFor: undefined, prepared: undefined, projectProgress: undefined }); },
  syncRoot(root) {
    if (get().root === root) return;
    const ai = useEditorAi.getState();
    if (get().sending && ai.mode === "edit") {
      void ai.cancel(); useEditorAi.setState({ requestId: undefined, busy: false, proposal: undefined, snapshot: undefined });
    }
    set({ root, generation: get().generation + 1, draft: "", contextNotes: "", prepared: undefined, projectProgress: undefined, authorizedFor: undefined, attachments: [], dataReferences: [], messages: [], sending: false, applying: false, error: undefined, recovered: false, recoveredReferences: [] });
  },
  clear() {
    if (get().sending || get().applying) return;
    set({ generation: get().generation + 1, draft: "", prepared: undefined, attachments: [], dataReferences: [], messages: [], error: undefined, recovered: false, recoveredReferences: [] });
    if (useEditorAi.getState().mode === "edit") useEditorAi.setState({ proposal: undefined, snapshot: undefined, error: undefined });
  },
  attachSelection() {
    if (get().sending || get().applying || get().recovering) return;
    const state = useEditorStore.getState(); get().syncRoot(state.project?.root);
    try {
      if (!state.project || !state.document || !state.selectedId || state.interactionMode !== "edit") throw new Error("Seleziona un elemento in Modifica, poi aggiungilo alla chat.");
      if (state.loading || state.reloadRecovery || state.highlightPicker) throw new Error("Completa prima l’operazione in corso nell’editor.");
      const attachment = aiElementAttachment({ root: state.project.root, document: state.document, selectedId: state.selectedId, selectionKey: aiSelectionKey(state.selectionInfo, state.editScope) });
      set({ attachments: [...get().attachments.filter(item => item.kind !== "element"), attachment], error: undefined });
    } catch (error) { set({ error: message(error) }); }
    useEditorAi.getState().show("edit");
  },
  async attachPage(page) {
    if (get().sending || get().applying || get().recovering) return;
    const state = useEditorStore.getState(); get().syncRoot(state.project?.root);
    if (!state.project || !state.pages.some(item => item === page)) return;
    if (!insideProject(state.project.root, page.file) || page.file.replaceAll("\\", "/").split("/").includes("..")) { set({ error: "La pagina è fuori dal progetto: non viene allegata automaticamente." }); return; }
    const generation = get().generation;
    let attachment: AiChatAttachment;
    try {
      const document = state.document?.file === page.file ? state.document : parseSource(page.file, await desktopBridge.readFile(page.file));
      if (get().generation !== generation || useEditorStore.getState().project?.root !== state.project.root || get().sending || get().applying) return;
      if (get().projectAccess) attachment = { id: `page:${page.id}`, root: state.project.root, kind: "page", label: page.name, snapshot: { root: state.project.root, document, selectedId: document.roots[0] ?? "" }, context: { name: page.name, route: page.route, file: page.file.split(/[\\/]/).at(-1) } };
      else attachment = aiPageAttachment(state.project.root, page, document);
    } catch (error) { if (get().generation === generation) set({ error: message(error) }); return; }
    const others = get().attachments.filter(item => item.id !== attachment.id);
    if (others.filter(item => item.kind === "page").length >= 5) { set({ error: "Puoi allegare fino a 5 pagine: rimuovi un riferimento prima di aggiungerne un altro." }); }
    else set({ attachments: [...others, attachment], error: undefined });
    useEditorAi.getState().show("edit");
  },
  removeAttachment(id) { if (!get().sending && !get().applying && !get().recovering) set({ attachments: get().attachments.filter(item => item.id !== id), error: undefined }); },
  addData(name, label) {
    if (get().sending || get().applying || get().recovering) return;
    const state = useEditorStore.getState(); get().syncRoot(state.project?.root);
    const matches = state.plcVariables.filter(tag => tag.name === name.trim());
    if (!state.project || matches.length !== 1 || !aiReadableData(matches[0])) { set({ error: "Scegli un tag scalare dichiarato e leggibile dal catalogo PLC. I tag rilevati soltanto nel sorgente non bastano." }); return; }
    if (get().dataReferences.length >= 8) { set({ error: "Puoi scegliere fino a 8 dati per richiesta. Rimuovi dal contesto quelli non necessari." }); return; }
    if (get().dataReferences.some(ref => ref.tag.name === matches[0].name)) { set({ error: "Questo dato è già nel contesto." }); return; }
    const clean = label.trim(); if (!clean || clean.length > 80 || /[\u0000-\u001f]/.test(clean)) { set({ error: "Dai al dato un nome da usare nella richiesta, fino a 80 caratteri: ad esempio Allarme motore." }); return; }
    if (get().dataReferences.some(ref => ref.label.toLocaleLowerCase("it") === clean.toLocaleLowerCase("it"))) { set({ error: "Usa nomi distinti per i dati, così l’AI non confonde i segnali." }); return; }
    set({ dataReferences: [...get().dataReferences, { id: `data_${crypto.randomUUID().replaceAll("-", "")}`, label: clean, tag: { ...matches[0] } }], error: undefined });
  },
  removeData(id) { if (!get().sending && !get().applying && !get().recovering) set({ dataReferences: get().dataReferences.filter(item => item.id !== id), error: undefined }); },
  setAnswer(id, index, update) {
    if (get().sending || get().applying || get().recovering) return;
    const target = pendingAiQuestions(get().messages, get().projectAccess);
    if (!target || target.id !== id || !Number.isInteger(index) || index < 0 || index >= aiMessageQuestions(target).length) return;
    const answers = aiMessageQuestions(target).map((_, at) => target.answers?.[at] ?? { text: "", deferred: false });
    answers[index] = { text: typeof update.text === "string" ? update.text.slice(0, 1000) : answers[index].text, deferred: typeof update.deferred === "boolean" ? update.deferred : answers[index].deferred };
    set({ messages: get().messages.map(item => item.id === id ? { ...item, answers } : item), error: undefined });
  },
  async send(replyTo) {
    if (get().projectAccess) return get().sendProject(replyTo);
    const ai = useEditorAi.getState(), state = get(), root = useEditorStore.getState().project?.root;
    if (state.sending || state.applying || state.recovering || ai.busy || ai.checking || ai.connecting) return;
    if (!root || state.root !== root) { get().syncRoot(root); set({ error: "Apri un progetto prima di usare la chat." }); return; }
    if (!replyTo && !state.draft.trim()) return;
    if (!ai.account?.connected || !ai.model) { set({ error: "Collega l’account ChatGPT e scegli il modello in Impostazioni → AI e account." }); return; }
    if (!get().allowed()) { set({ error: "Autorizza l’invio per questa sessione del progetto. Non dovrai confermarlo a ogni messaggio e puoi revocarlo quando vuoi." }); return; }
    let reply: ReturnType<typeof prepareAiQuestionReply> | undefined;
    try { assertAiDataCurrent(state.dataReferences, useEditorStore.getState().plcVariables); if (replyTo) reply = prepareAiQuestionReply(replyTo, state.attachments, state.messages, state.contextNotes, state.dataReferences); }
    catch (error) { set({ error: message(error) }); return; }
    const prompt = reply?.prompt ?? state.draft.trim(), attachments = state.attachments, generation = state.generation;
    if (state.messages.length + 2 > 40) { set({ error: "Questa conversazione ha raggiunto il limite di messaggi. Avvia una nuova chat per continuare." }); return; }
    const snapshot = reply?.snapshot ?? aiChatScope(attachments, state.dataReferences);
    const context = reply?.context ?? aiChatContext(attachments, state.messages, state.contextNotes, state.dataReferences);
    let prepared: AiChatPrepared;
    try { prepared = prepareAiChat(prompt, snapshot, context); }
    catch (error) { set({ error: message(error) }); return; }
    const user: AiChatMessage = { id: crypto.randomUUID(), role: "user", text: reply?.displayText ?? prompt, attachments: attachments.map(item => item.label), ...(replyTo ? { replyTo } : {}) };
    set({ sending: true, prepared, error: undefined, messages: [...state.messages, user] });
    ai.show("edit");
    await useEditorAi.getState().propose(prompt, snapshot, context);
    if (get().generation !== generation || useEditorStore.getState().project?.root !== root) return;
    const result = useEditorAi.getState();
    if (result.proposal && !result.error) {
      const proposal = result.proposal;
      if (snapshot?.targets) {
        try { aiProposalGroups(snapshot, proposal); }
        catch (error) { set({ sending: false, error: message(error), messages: get().messages.map(item => item.id === user.id ? { ...item, status: "error" } : item) }); return; }
      }
      set({ sending: false, ...(replyTo ? {} : { draft: "" }), messages: [...get().messages, { id: crypto.randomUUID(), role: "assistant", text: [proposal.summary, ...proposal.questions, ...proposal.warnings].join("\n\n"), proposal, snapshot, originalRequest: reply?.clarification.request ?? prompt, questionAttachments: proposal.questions.length ? attachments : undefined, questionData: proposal.questions.length ? state.dataReferences : undefined, clarification: reply?.clarification }] });
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
  stageProjectReview(input) {
    if (get().sending || get().applying || get().recovering) return;
    try {
      const review = validateAiProjectReview(input);
      if (review.root !== get().root || review.root !== useEditorStore.getState().project?.root) throw new Error("La proposta appartiene a un altro progetto.");
      if (get().messages.length >= 40) throw new Error("Avvia una nuova chat prima di aggiungere altre proposte.");
      set({ messages: [...get().messages, { id: crypto.randomUUID(), role: "assistant", text: [review.plan.summary, ...review.plan.questions, ...review.plan.warnings].join("\n\n"), projectReview: review }], error: undefined });
    } catch (error) { set({ error: message(error) }); }
  },
  async sendProject(replyTo) {
    const state = get(), ai = useEditorAi.getState(), editor = useEditorStore.getState(), project = editor.project;
    if (state.sending || state.applying || state.recovering || ai.busy || ai.checking || ai.connecting) return;
    if (!project || state.root !== project.root) { get().syncRoot(project?.root); set({ error: "Apri un progetto prima di usare la chat." }); return; }
    if (!ai.account?.connected || !ai.model) { set({ error: "Collega l’account ChatGPT e scegli il modello in Impostazioni → AI e account." }); return; }
    if (!get().allowed()) { set({ error: "Consenti l’invio di sorgenti e metadati del progetto per questa sessione prima di inviare." }); return; }
    if (editor.dirty || editor.loading || editor.reloadRecovery) { set({ error: "Salva o scarta prima la bozza aperta e completa il recupero del progetto." }); return; }
    if (state.messages.length + 2 > 40) { set({ error: "Questa conversazione ha raggiunto il limite. Avvia una nuova chat per continuare." }); return; }
    let prompt = state.draft.trim(), reply: ReturnType<typeof prepareAiProjectQuestionReply> | undefined;
    try { if (replyTo) { reply = prepareAiProjectQuestionReply(replyTo, state.attachments, state.messages); prompt = reply.clarification.request; } }
    catch (error) { set({ error: message(error) }); return; }
    if (!prompt) return;
    if (prompt.length > 8000) { set({ error: "La richiesta iniziale supera 8.000 caratteri: riducila prima dell’invio. Il testo è conservato." }); return; }
    const generation = state.generation, provider = ai.provider, model = ai.model, effort = ai.reasoningEffort;
    if (effort && !ai.models.find(item => item.id === model)?.supportedReasoningEfforts?.some(item => item.reasoningEffort === effort)) { set({ error: "Il ragionamento scelto non è disponibile: scegli il predefinito o aggiorna i modelli." }); return; }
    const current = () => get().generation === generation && get().allowed() && useEditorStore.getState().project === project && useEditorAi.getState().provider === provider;
    const user: AiChatMessage = { id: crypto.randomUUID(), role: "user", text: reply?.displayText ?? prompt, attachments: state.attachments.map(item => item.label), ...(replyTo ? { replyTo } : {}) };
    ai.show("edit"); useEditorAi.setState({ busy: true, requestId: crypto.randomUUID(), proposal: undefined, snapshot: undefined, error: undefined });
    set({ sending: true, error: undefined, prepared: undefined, projectProgress: "Preparo il contesto di progetto…", messages: [...state.messages, user] });
    try {
      const listed = await desktopBridge.listProjectSourceFiles(); if (!current()) return;
      const selections = reply?.selections ?? state.attachments.flatMap(item => item.snapshot ? [{ path: item.snapshot.document.file, start: item.snapshot.document.nodes[item.snapshot.selectedId]?.source.start ?? 0, label: item.label }] : []);
      if (!reply && !selections.length && editor.document) selections.push({ path: editor.document.file, start: editor.selectedId ? editor.document.nodes[editor.selectedId]?.source.start ?? 0 : 0, label: editor.pages.find(page => page.id === editor.activePageId)?.name ?? "Pagina aperta" });
      const result = await runAiProject({ root: project.root, request: prompt, notes: state.contextNotes, clarification: reply?.clarification.answers,
        history: aiChatContext([], state.messages).history.map(({ role, text }) => ({ role, text })),
        files: [...listed, ...filePaths(project.files ?? [])], selections, current,
        read: path => desktopBridge.readAiProjectFile(project.root, path),
        progress(projectProgress, input) {
          if (!current()) return;
          const inputBytes = new TextEncoder().encode(input + JSON.stringify(aiProjectSchema)).length;
          set({ projectProgress, prepared: { prompt: input, payload: JSON.parse(input), inputBytes, estimatedTokens: Math.ceil(inputBytes / 3), recentTurns: Math.min(3, state.messages.length / 2), recalledTurns: 0, omittedTurns: Math.max(0, (state.messages.length - 6) / 2), abbreviatedMessages: state.messages.slice(-6).filter(item => item.text.length > 4000).length, template: "none" } });
        },
        async propose(input, schema) {
          if (!current()) throw new Error("Invio annullato.");
          const requestId = crypto.randomUUID(); useEditorAi.setState({ requestId });
          const result = await provider.propose({ requestId, model, ...(effort ? { reasoningEffort: effort } : {}), prompt: input, schema });
          if (!current() || useEditorAi.getState().requestId !== requestId || result.requestId !== requestId) throw new Error("Risposta AI superata o annullata.");
          return result.text;
        },
      });
      if (!current()) return;
      const review = validateAiProjectReview(result);
      set({ sending: false, projectProgress: undefined, ...(replyTo ? {} : { draft: "" }), messages: [...get().messages, { id: crypto.randomUUID(), role: "assistant", text: [review.plan.summary, ...review.plan.questions, ...review.plan.warnings].join("\n\n"), projectReview: review, originalRequest: prompt, clarification: reply?.clarification,
        questionAttachments: review.plan.questions.length ? state.attachments : undefined, questionSelections: review.plan.questions.length ? selections : undefined }] });
    } catch (error) {
      if (get().generation === generation && useEditorStore.getState().project === project) set({ sending: false, projectProgress: undefined, error: message(error), messages: get().messages.map(item => item.id === user.id ? { ...item, status: "error" } : item) });
    } finally {
      if (get().generation === generation && useEditorAi.getState().provider === provider) { set({ sending: false }); useEditorAi.setState({ busy: false, requestId: undefined }); }
    }
  },
  async applyProject(id, expected) {
    const state = get(), target = state.messages.find(item => item.id === id);
    if (state.applying || state.sending || state.recovering || useEditorAi.getState().busy) return;
    if (!target || target !== state.messages.at(-1) || target.projectReview !== expected || target.status || target.recovered) { set({ error: "La proposta è superata: controlla la revisione più recente." }); return; }
    const generation = state.generation, editor = useEditorStore.getState(), project = editor.project;
    set({ applying: true, error: undefined });
    useEditorStore.setState({ aiProjectBusy: true });
    try {
      const receipt = await applyAiProjectFiles(expected, () => get().generation === generation && get().root === expected.root);
      if (get().generation !== generation) return;
      if (useEditorStore.getState().project === project && !useEditorStore.getState().dirty && useEditorStore.getState().history === editor.history) {
        const previous = expected.changes.filter(change => change.before !== null && /\.[jt]sx?$/.test(change.path)).map(change => ({ file: `${expected.root.replace(/[\\/]$/, "")}/${change.path}`, source: change.before! }));
        useEditorStore.setState({ history: [...editor.history, ...previous].slice(-100), future: [] });
      }
      set({ messages: get().messages.map(item => item.id === id ? { ...item, status: "applied", projectReceipt: receipt } : item), attachments: get().attachments.filter(item => !receipt.files.some(file => item.snapshot?.document.file.replaceAll("\\", "/").endsWith(`/${file}`))) });
      await useEditorStore.getState().refreshAiProjectFiles(receipt.root, receipt.files);
    } catch (error) { if (get().generation === generation) set({ error: message(error) }); }
    finally { if (useEditorStore.getState().project === project) useEditorStore.setState({ aiProjectBusy: false }); if (get().generation === generation) set({ applying: false }); }
  },
  async restoreProject(id, expected) {
    const state = get(), target = state.messages.find(item => item.id === id);
    if (state.applying || state.sending || state.recovering || useEditorAi.getState().busy) return;
    const latest = [...state.messages].reverse().find(item => item.projectReceipt && !item.projectReceipt.restored);
    if (!target || latest !== target || target.projectReceipt !== expected || expected.restored) { set({ error: "Ripristina prima la modifica di progetto più recente." }); return; }
    const generation = state.generation, project = useEditorStore.getState().project;
    set({ applying: true, error: undefined });
    useEditorStore.setState({ aiProjectBusy: true });
    try {
      const receipt = await restoreAiProjectFiles(expected, () => get().generation === generation && get().root === expected.root);
      if (get().generation !== generation) return;
      set({ messages: get().messages.map(item => item.id === id ? { ...item, projectReceipt: receipt, text: `${item.text}\n\nModifiche ripristinate dal backup su richiesta dell’utente.` } : item) });
      await useEditorStore.getState().refreshAiProjectFiles(receipt.root, receipt.files);
    } catch (error) { if (get().generation === generation) set({ error: message(error) }); }
    finally { if (useEditorStore.getState().project === project) useEditorStore.setState({ aiProjectBusy: false }); if (get().generation === generation) set({ applying: false }); }
  },
  async apply(id, accepted) {
    const state = get(), target = state.messages.find(item => item.id === id);
    if (state.applying || state.sending || useEditorAi.getState().busy) return;
    if (!target?.snapshot || !target.proposal || target.status || target !== state.messages.at(-1)) { set({ error: "Questa proposta è superata. Richiedi una nuova proposta sull’elemento attuale." }); return; }
    const generation = state.generation;
    set({ applying: true, error: undefined });
    try {
      if (target.proposal.operations.some(operation => operation.type === "binding") && !sameAiDataReferences(target.snapshot.dataReferences, state.dataReferences)) throw new Error("I dati nel contesto sono cambiati. Richiedi una nuova proposta prima di applicare collegamenti.");
      const files = target.snapshot.targets ? prepareAiPageFiles(target.snapshot, target.proposal, accepted) : [];
      if (files.length > 1) throw new Error("Approva un file alla volta: ogni pagina ha confronto e Annulla separati.");
      if (files.some(file => target.reviewedFiles?.includes(file.file))) throw new Error("Questo file della proposta è già stato applicato.");
      if (target.snapshot.targets) await useEditorStore.getState().applyAiPageProposal(target.snapshot, target.proposal, accepted);
      else await useEditorStore.getState().applyAiProposal(target.snapshot, target.proposal, accepted);
      if (get().generation === generation) {
        const appliedOperations = [...new Set([...(target.appliedOperations ?? []), ...accepted])], reviewedFiles = [...new Set([...(target.reviewedFiles ?? []), ...files.map(file => file.file)])];
        const pending = target.snapshot.targets && aiProposalGroups(target.snapshot, target.proposal).some(group => !reviewedFiles.includes(group.snapshot.document.file));
        set({ messages: get().messages.map(item => item.id === id ? { ...item, ...(pending ? {} : { status: "applied" as const }), appliedOperations, reviewedFiles } : item) });
        const current = useEditorStore.getState(), node = current.selectedId ? current.document?.nodes[current.selectedId] : undefined;
        if (files.length) {
          const saved = files[0], fresh = current.document?.file === saved.file ? current.document : parseSource(saved.file, saved.source);
          const pages = current.pages.filter(page => page.file === saved.file);
          const hasPage = get().attachments.some(item => item.kind === "page" && item.snapshot?.document.file === saved.file);
          set({ attachments: get().attachments.flatMap(item => {
            if (item.snapshot?.document.file !== saved.file) return [item];
            if (item.kind === "page") {
              const page = pages.find(page => item.id === `page:${page.id}`);
              return page ? [aiPageAttachment(target.snapshot!.root, page, fresh)] : [];
            }
            if (hasPage) return [];
            const old = item.snapshot.document.nodes[item.snapshot.selectedId], updated = Object.values(fresh.nodes).find(node => node.source.start === old?.source.start && node.type === old.type);
            return updated ? [aiElementAttachment({ ...item.snapshot, targets: undefined, document: fresh, selectedId: updated.id })] : [];
          }) });
        }
        const sameElement = (item: AiChatAttachment) => item.kind === "element" && item.snapshot?.document === target.snapshot!.document && item.snapshot.selectedId === target.snapshot!.selectedId;
        if (current.project?.root === target.snapshot.root && current.document && current.selectedId && node?.source.start === target.snapshot.document.nodes[target.snapshot.selectedId]?.source.start && get().attachments.some(sameElement)) {
          try {
            const fresh = aiElementAttachment({ root: current.project.root, document: current.document, selectedId: current.selectedId, selectionKey: aiSelectionKey(current.selectionInfo, current.editScope) });
            set({ attachments: get().attachments.map(item => sameElement(item) ? fresh : item) });
          } catch { /* Keep the explicitly attached snapshot if the updated element cannot be inspected. */ }
        }
        useEditorAi.setState({ proposal: undefined, snapshot: undefined });
      }
    } catch (error) { if (get().generation === generation) set({ error: message(error) }); }
    finally { if (get().generation === generation) set({ applying: false }); }
  },
});

const hotData = import.meta.hot?.data;
const previousChat = hotData?.chat as UseBoundStore<StoreApi<ChatState>> | undefined;
export const useEditorAiChat = previousChat ?? create<ChatState>(createChatState);
if (previousChat) {
  const methods = createChatState(previousChat.setState, previousChat.getState, previousChat);
  const data = Object.fromEntries(Object.entries(previousChat.getState()).filter(([, value]) => typeof value !== "function"));
  previousChat.setState({ ...methods, ...data } as ChatState, true);
}
if (hotData) hotData.chat = useEditorAiChat;

export function installAiChatProjectScope() {
  return installAiChatRecovery(useEditorAiChat);
}
