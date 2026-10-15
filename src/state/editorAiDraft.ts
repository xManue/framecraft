import { create } from "zustand";
import { useEditorAi } from "./editorAi";
import { desktopAvailable, desktopBridge } from "../filesystem/desktopBridge";
import { hasAiInterviewAnswers, parseAiInterviewDraft, serializeAiInterviewDraft, type AiInterviewDraft, type AiInterviewDraftSnapshot } from "../ai/aiInterviewDraft";

interface DraftBridge {
  readAiInterviewDraft(): Promise<AiInterviewDraftSnapshot>;
  writeAiInterviewDraft(expectedRevision: string, source: string | null): Promise<AiInterviewDraftSnapshot>;
}
interface DraftState {
  enabled: boolean; checking: boolean; saving: boolean; resetting: boolean; needsChoice: boolean; canClear: boolean;
  pending?: AiInterviewDraft; savedAt?: number; error?: string; recovered: boolean;
  resume(): void; restart(): Promise<void>; retry(): Promise<void>; sessionOnly(): void;
}
const noop = () => {};
export const useEditorAiDraft = create<DraftState>(() => ({ enabled: false, checking: false, saving: false, resetting: false, needsChoice: false, canClear: false, recovered: false, resume: noop, restart: async () => {}, retry: async () => {}, sessionOnly: noop }));
let io: Promise<unknown> = Promise.resolve();
function queue<T>(operation: () => Promise<T>): Promise<T> { const next = io.then(operation); io = next.catch(() => {}); return next; }
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function installAiInterviewDraftRecovery(bridge: DraftBridge | undefined = desktopAvailable ? desktopBridge : undefined) {
  if (!bridge) return noop;
  let active = true, blocked = false, snapshot: AiInterviewDraftSnapshot | undefined, timer: ReturnType<typeof setTimeout> | undefined, sequence = 0, pendingWrites = 0;
  const set = (next: Partial<DraftState>) => { if (active) useEditorAiDraft.setState(next); };
  const stopTimer = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const save = (source: string | null) => {
    const revision = ++sequence;
    pendingWrites++;
    set({ saving: true });
    return queue(async () => {
      try {
        if (!snapshot || blocked) { if (revision === sequence) set({ saving: false }); return; }
        snapshot = await bridge.writeAiInterviewDraft(snapshot.revision, source);
        if (revision === sequence) set({ saving: false, savedAt: source ? JSON.parse(source).savedAt : undefined, canClear: source !== null, error: undefined });
      } catch (error) { blocked = true; set({ saving: false, error: message(error) }); }
      finally { pendingWrites--; }
    });
  };
  const flush = () => {
    stopTimer();
    if (!snapshot || blocked || useEditorAiDraft.getState().needsChoice) return;
    try {
      const interview = useEditorAi.getState().interview, hasAnswers = hasAiInterviewAnswers(interview);
      if (!hasAnswers && !snapshot.source && !pendingWrites) return;
      return save(hasAnswers ? serializeAiInterviewDraft(interview) : null);
    }
    catch (error) { set({ saving: false, error: message(error) }); }
  };
  const schedule = () => {
    stopTimer();
    if (!snapshot || blocked || useEditorAiDraft.getState().needsChoice) return;
    // Reset/create completion clears the saved interview after any older queued write.
    if (!hasAiInterviewAnswers(useEditorAi.getState().interview)) { void flush(); return; }
    timer = setTimeout(() => void flush(), 350);
  };
  const read = async () => {
    stopTimer(); set({ checking: true });
    await queue(async () => {
      if (!active) return;
      try {
        const next = await bridge.readAiInterviewDraft(); if (!active) return;
        const changed = !snapshot || snapshot.revision !== next.revision || blocked || useEditorAiDraft.getState().needsChoice;
        snapshot = next; blocked = false;
        if (changed && next.source !== null) {
          blocked = true; set({ canClear: true, needsChoice: true, pending: undefined });
          const pending = parseAiInterviewDraft(next.source);
          set({ pending, savedAt: pending.savedAt, error: undefined, saving: false });
        } else {
          set({ pending: undefined, needsChoice: false, canClear: next.source !== null, savedAt: next.source === null ? undefined : useEditorAiDraft.getState().savedAt, error: undefined, saving: false });
          if (hasAiInterviewAnswers(useEditorAi.getState().interview)) schedule();
        }
      } catch (error) { blocked = true; set({ error: message(error), saving: false, needsChoice: true }); }
      finally { set({ checking: false }); }
    });
  };
  useEditorAiDraft.setState({ enabled: true, checking: true, saving: false, resetting: false, needsChoice: false, canClear: false, pending: undefined, savedAt: undefined, error: undefined, recovered: false,
    resume() {
      const pending = useEditorAiDraft.getState().pending; if (!pending || useEditorAi.getState().busy) return;
      // Reparse even the in-memory copy: no proposal, consent or command approval is restored.
      try {
        const interview = parseAiInterviewDraft(JSON.stringify(pending)).interview;
        blocked = false; set({ pending: undefined, needsChoice: false, recovered: true, error: undefined });
        useEditorAi.setState({ interview, proposal: undefined, resolvedInterview: undefined, proposalUpdatedLocally: false, error: undefined });
      } catch (error) { set({ error: message(error) }); }
    },
    async restart() {
      if (!snapshot || useEditorAi.getState().busy) return;
      stopTimer(); const revision = ++sequence; set({ saving: true, resetting: true });
      await queue(async () => {
        try {
          snapshot = await bridge.writeAiInterviewDraft(snapshot!.revision, null);
          if (!active || revision !== sequence) { set({ resetting: false }); return; }
          blocked = false; set({ pending: undefined, needsChoice: false, recovered: false, savedAt: undefined, canClear: false, saving: false, resetting: false, error: undefined });
          useEditorAi.getState().resetInterview();
        } catch (error) { blocked = true; set({ saving: false, resetting: false, error: message(error) }); }
      });
    },
    retry: read,
    sessionOnly() { stopTimer(); blocked = true; set({ pending: undefined, needsChoice: false, error: "Recupero locale sospeso: le nuove risposte restano solo finché l’app è aperta. La vecchia bozza non è stata eliminata." }); },
  });
  const unsubscribe = useEditorAi.subscribe((next, previous) => { if (next.interview !== previous.interview) schedule(); });
  const onHidden = () => { if (document.visibilityState === "hidden") void flush(); };
  const onPageHide = () => { void flush(); };
  document.addEventListener("visibilitychange", onHidden); window.addEventListener("pagehide", onPageHide);
  void read();
  return () => {
    void flush(); unsubscribe(); stopTimer(); active = false;
    document.removeEventListener("visibilitychange", onHidden); window.removeEventListener("pagehide", onPageHide);
  };
}
