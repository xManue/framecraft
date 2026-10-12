import { useEffect, useRef, useState } from "react";
import { useEditorGuidance, visualEditGuideStorageKey } from "../state/editorGuidance";
export { visualEditGuideStorageKey } from "../state/editorGuidance";

function alreadySeen() {
  if (useEditorGuidance.getState().replayVersion > 0) return useEditorGuidance.getState().seen;
  try { return useEditorGuidance.getState().seen || localStorage.getItem(visualEditGuideStorageKey) === "1"; }
  catch { return useEditorGuidance.getState().seen; }
}

export function useVisualEditGuide(eligible: boolean, pageKey: string) {
  const enabled = useEditorGuidance(state => state.enabled);
  const replayVersion = useEditorGuidance(state => state.replayVersion);
  const replayed = useRef(replayVersion);
  const [dismissed, setDismissed] = useState(alreadySeen);
  const shownPage = useRef<string | undefined>(undefined);
  const visible = enabled && !dismissed && eligible && (shownPage.current === undefined || shownPage.current === pageKey);

  useEffect(() => {
    if (replayed.current === replayVersion) return;
    replayed.current = replayVersion;
    shownPage.current = undefined;
    setDismissed(false);
  }, [replayVersion]);

  useEffect(() => {
    if (visible && shownPage.current === undefined) {
      shownPage.current = pageKey;
      useEditorGuidance.getState().markSeen();
    } else if (!visible && shownPage.current !== undefined) {
      setDismissed(true);
    }
  }, [pageKey, visible]);

  return { visible, dismiss: () => setDismissed(true) };
}
