import { useEffect, useRef } from "react";

export function useRecipeDialog(onClose: () => void, returnFocus?: HTMLElement | null) {
  const panel = useRef<HTMLElement>(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = returnFocus ?? document.activeElement as HTMLElement | null; panel.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      const active = document.activeElement?.closest('[role="dialog"][aria-modal="true"]');
      if (active && active !== panel.current) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') ?? [])].filter(node => !node.closest('[hidden],fieldset:disabled'));
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (!nodes.length) { event.preventDefault(); panel.current?.focus(); }
      else if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && (index === -1 || index === nodes.length - 1)) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return panel;
}
