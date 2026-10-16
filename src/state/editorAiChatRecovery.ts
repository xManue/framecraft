import type { StoreApi } from "zustand";
import { aiChatRecoveryKey, parseAiChatRecovery, serializeAiChatRecovery, type AiChatRecovery } from "../ai/aiChatRecovery";
import type { ChatState } from "./editorAiChat";
import { useEditorAi } from "./editorAi";
import { useEditorStore } from "./editorStore";
import { sameEditorRoot } from "./editorRecovery";

const identity = () => {
  const ai = useEditorAi.getState();
  return ai.account?.connected ? JSON.stringify([ai.provider.id, ai.account.email ?? null]) : null;
};
const hasText = (state: ChatState) => !!(state.draft || state.contextNotes || state.messages.length || state.attachments.length || state.dataReferences.length || state.recoveredReferences?.length);

export function installAiChatRecovery(chat: StoreApi<ChatState>, storage?: Storage) {
  let pending: AiChatRecovery | undefined, blocked = false, syncing = false, checkingAccount = false, active = true;
  let owner = identity(), root = useEditorStore.getState().project?.root;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fail = (error: unknown) => {
    blocked = true;
    chat.setState({ recoveryError: `Non posso conservare la chat al prossimo refresh. Non ricaricare: copia i testi importanti. Dettagli: ${error instanceof Error ? error.message : String(error)}` });
  };
  try { storage ??= window.sessionStorage; const source = storage.getItem(aiChatRecoveryKey); if (source) pending = parseAiChatRecovery(source); }
  catch (error) { fail(error); }
  // StrictMode/HMR: prefer the live store only at installation, not mutations made while checking.
  if (pending && root === chat.getState().root && hasText(chat.getState())) pending = undefined;
  const stopTimer = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const discard = () => {
    pending = undefined; stopTimer(); chat.setState({ recovering: false });
    try { storage?.removeItem(aiChatRecoveryKey); blocked = false; chat.setState({ recoveryError: undefined }); }
    catch (error) { fail(error); }
  };
  const save = () => {
    stopTimer();
    const state = chat.getState();
    if (!active || syncing || pending || blocked || !root || state.root !== root) return;
    try {
      if (!hasText(state)) { storage?.removeItem(aiChatRecoveryKey); return; }
      storage?.setItem(aiChatRecoveryKey, serializeAiChatRecovery({ version: 1, root, account: owner, open: useEditorAi.getState().open && useEditorAi.getState().mode === "edit", draft: state.draft,
        contextNotes: state.contextNotes, messages: state.messages.map((item, index, all) => state.sending && index === all.length - 1 && item.role === "user" ? { ...item, status: "cancelled" } : item), references: [...new Set([...state.attachments.map(item => item.label), ...state.dataReferences.map(item => item.label), ...(state.recoveredReferences ?? [])])].slice(0, 14) }));
    } catch (error) { fail(error); }
  };
  const sync = () => {
    if (syncing) return;
    syncing = true;
    try {
      const next = useEditorStore.getState().project?.root;
      if (root && root !== next) discard();
      root = next;
      chat.getState().syncRoot(root);
      if (!root || !pending || blocked) return;
      if (!sameEditorRoot(root, pending.root)) { discard(); return; }
      const ai = useEditorAi.getState();
      if (pending.account && !ai.account) {
        chat.setState({ recovering: true });
        if (!checkingAccount && !ai.checking && !ai.connecting && !ai.accountError) {
          checkingAccount = true;
          // Local CLI account status only: no login, inference or automatic resend.
          void ai.refresh();
        }
        return;
      }
      if (pending.account !== identity()) { discard(); return; }
      owner = identity();
      const recovered = pending; pending = undefined;
      chat.setState({ draft: recovered.draft, contextNotes: recovered.contextNotes, messages: recovered.messages, recovered: true,
        recoveredReferences: recovered.references, recovering: false, authorizedFor: undefined, prepared: undefined, sending: false, applying: false });
      if (recovered.open) useEditorAi.getState().show("edit");
    } finally { syncing = false; }
  };
  sync();
  const stopChat = chat.subscribe((state, previous) => {
    if (!syncing && state.generation !== previous.generation) { syncing = true; try { discard(); } finally { syncing = false; } }
    if (syncing || blocked || state === previous) return;
    if (state.draft === previous.draft && state.contextNotes === previous.contextNotes && state.messages === previous.messages && state.attachments === previous.attachments && state.dataReferences === previous.dataReferences && state.recoveredReferences === previous.recoveredReferences) return;
    stopTimer(); timer = setTimeout(save, 150);
  });
  const stopProject = useEditorStore.subscribe((state, previous) => { if (state.project?.root !== previous.project?.root) { sync(); save(); } });
  const stopAi = useEditorAi.subscribe((state, previous) => {
    const changed = state.provider.id !== previous.provider.id || (state.account?.connected && identity() !== owner && owner !== null)
      || (previous.account?.connected && !state.account?.connected && !state.accountError);
    if (changed) {
      syncing = true;
      try { discard(); chat.getState().syncRoot(undefined); chat.getState().syncRoot(root); owner = identity(); }
      finally { syncing = false; }
    } else if (state.account?.connected) owner = identity();
    sync();
    if (state.open !== previous.open || state.mode !== previous.mode || changed) save();
  });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    save();
    if (chat.getState().applying) { event.preventDefault(); event.returnValue = "Attendi il completamento delle modifiche al progetto."; return; }
    if (blocked && (hasText(chat.getState()) || pending)) { event.preventDefault(); event.returnValue = "Copia la chat prima di ricaricare."; }
  };
  const beforeFullReload = () => { save(); if (chat.getState().applying) throw new Error("Refresh fermato: attendi il completamento delle modifiche al progetto."); if (blocked && (hasText(chat.getState()) || pending)) throw new Error("Refresh fermato: copia la chat prima di ricaricare."); };
  const hot = import.meta.hot?.data ? import.meta.hot : undefined;
  hot?.on("vite:beforeFullReload", beforeFullReload);
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide", save);
  hot?.dispose(save);
  save();
  return () => { save(); active = false; stopTimer(); stopChat(); stopProject(); stopAi(); window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("pagehide", save); hot?.off("vite:beforeFullReload", beforeFullReload); };
}
