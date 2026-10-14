import { useEffect } from "react";
import { useEditorAi } from "../state/editorAi";

/** Listen only: account checks happen after an explicit login/logout notification, not on mount. */
export function useAiAccountEvents() {
  const provider = useEditorAi(state => state.provider);
  useEffect(() => {
    let live = true, dispose: (() => void) | undefined;
    void provider.subscribe(event => {
      if (live && event.type === "account" && useEditorAi.getState().provider === provider) void useEditorAi.getState().refresh();
    }).then(value => { if (live) dispose = value; else value(); }).catch(() => {});
    return () => { live = false; dispose?.(); };
  }, [provider]);
}
