import { create } from "zustand";

export const visualEditGuideStorageKey = "framecraft.visual-edit-guide.seen.v1";
export const editorGuidanceStorageKey = "framecraft.guidance.v1";

function readFlag(key: string) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function remember(enabled: boolean, replay = false) {
  try {
    localStorage.setItem(editorGuidanceStorageKey, enabled ? "1" : "0");
    if (replay) localStorage.removeItem(visualEditGuideStorageKey);
  } catch {
    return "La preferenza vale per questa sessione, ma non è stato possibile conservarla per il prossimo avvio.";
  }
}

export const useEditorGuidance = create<{
  enabled: boolean;
  seen: boolean;
  replayVersion: number;
  helpOpen: boolean;
  setHelpOpen(open: boolean): void;
  setEnabled(enabled: boolean): string | undefined;
  replay(): string | undefined;
  markSeen(): void;
}>((set) => ({
  enabled: readFlag(editorGuidanceStorageKey) !== "0",
  seen: readFlag(visualEditGuideStorageKey) === "1",
  replayVersion: 0,
  helpOpen: false,
  setHelpOpen: helpOpen => set({ helpOpen }),
  setEnabled(enabled) {
    const issue = remember(enabled);
    set({ enabled });
    return issue;
  },
  replay() {
    const issue = remember(true, true);
    set(state => ({ enabled: true, seen: false, replayVersion: state.replayVersion + 1 }));
    return issue;
  },
  markSeen() {
    set({ seen: true });
    try { localStorage.setItem(visualEditGuideStorageKey, "1"); }
    catch { /* Remembered in this session even when local preferences are unavailable. */ }
  },
}));
