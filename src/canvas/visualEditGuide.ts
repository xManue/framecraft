import { useEffect, useRef, useState } from "react";

export const visualEditGuideStorageKey = "framecraft.visual-edit-guide.seen.v1";
let seenThisSession = false;

function alreadySeen() {
  try { return seenThisSession || localStorage.getItem(visualEditGuideStorageKey) === "1"; }
  catch { return seenThisSession; }
}

export function useVisualEditGuide(eligible: boolean, pageKey: string) {
  const [dismissed, setDismissed] = useState(alreadySeen);
  const shownPage = useRef<string | undefined>(undefined);
  const visible = !dismissed && eligible && (shownPage.current === undefined || shownPage.current === pageKey);

  useEffect(() => {
    if (visible && shownPage.current === undefined) {
      shownPage.current = pageKey;
      seenThisSession = true;
      try { localStorage.setItem(visualEditGuideStorageKey, "1"); }
      catch { /* The session flag still prevents repeated hints if storage is unavailable. */ }
    } else if (!visible && shownPage.current !== undefined) {
      setDismissed(true);
    }
  }, [pageKey, visible]);

  return { visible, dismiss: () => setDismissed(true) };
}
