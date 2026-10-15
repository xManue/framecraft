import { MessageSquare, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PageDefinition, SourceRef } from "../core/types";
import { useEditorStore } from "../state/editorStore";
import { useEditorAiChat } from "../state/editorAiChat";

export function pageChatContextMenu(page: PageDefinition, event: React.MouseEvent<HTMLElement>) {
  event.preventDefault();
  const box = event.currentTarget.getBoundingClientRect();
  window.dispatchEvent(new CustomEvent("framecraft:page-chat-menu", { detail: { page, x: event.clientX || box.left, y: event.clientY || box.bottom } }));
}
interface Menu { x: number; y: number; root: string; page?: PageDefinition; source?: SourceRef }
export function AiContextMenu() {
  const [menu, setMenu] = useState<Menu>(), panel = useRef<HTMLDivElement>(null);
  const root = useEditorStore(state => state.project?.root), mode = useEditorStore(state => state.interactionMode);
  useEffect(() => { setMenu(undefined); }, [root, mode]);
  useEffect(() => {
    const page = (event: Event) => {
      const { page, x, y } = (event as CustomEvent).detail, state = useEditorStore.getState();
      if (state.project && state.pages.includes(page)) setMenu({ root: state.project.root, page, x, y });
    };
    const preview = (event: MessageEvent) => {
      if (event.data?.type !== "framecraft:ai-context-menu" && event.data?.type !== "framecraft:select") return;
      const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Project preview"]'), state = useEditorStore.getState();
      if (!frame || event.source !== frame.contentWindow || !state.project || state.interactionMode !== "edit" || state.highlightPicker || state.loading) return;
      if (event.origin !== new URL(frame.src, location.href).origin) return;
      if (event.data.type === "framecraft:select") { setMenu(undefined); return; }
      const { source, x, y } = event.data;
      if (!source || typeof source.file !== "string" || !Number.isInteger(source.start) || !Number.isInteger(source.end) || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const box = frame.getBoundingClientRect();
      setMenu({ root: state.project.root, source, x: box.left + x * box.width / (frame.clientWidth || box.width), y: box.top + y * box.height / (frame.clientHeight || box.height) });
    };
    window.addEventListener("framecraft:page-chat-menu", page); window.addEventListener("message", preview);
    return () => { window.removeEventListener("framecraft:page-chat-menu", page); window.removeEventListener("message", preview); };
  }, []);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) setMenu(undefined); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); setMenu(undefined); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const buttons = [...panel.current!.querySelectorAll("button:not(:disabled)")] as HTMLButtonElement[]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }
      if (event.key === "Tab") setMenu(undefined);
    };
    document.addEventListener("pointerdown", close, true); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", key, true); if (previous?.isConnected && panel.current?.contains(document.activeElement)) previous.focus({ preventScroll: true }); };
  }, [menu]);
  if (!menu) return null;
  async function attach() {
    const state = useEditorStore.getState(), target = menu!;
    setMenu(undefined);
    if (state.project?.root !== target.root) return;
    if (target.page) { useEditorAiChat.getState().attachPage(target.page); return; }
    if (target.source && await state.selectSource(target.source)) {
      const current = useEditorStore.getState(), node = current.selectedId ? current.document?.nodes[current.selectedId] : undefined;
      if (current.project?.root === target.root && node?.source.file === target.source.file && node.source.start === target.source.start && node.source.end === target.source.end) useEditorAiChat.getState().attachSelection();
    }
  }
  return createPortal(<div className="ai-chat-context-menu" role="menu" aria-label="Azioni AI" data-editor-shortcuts="off" ref={panel} style={{ left: Math.min(Math.max(8, menu.x), Math.max(8, innerWidth - 238)), top: Math.min(Math.max(8, menu.y), Math.max(8, innerHeight - 108)) }}>
    <button type="button" role="menuitem" disabled={useEditorAiChat.getState().sending || useEditorAiChat.getState().applying} onClick={() => void attach()}><MessageSquare size={16} />Aggiungi {menu.page ? "pagina" : "elemento"} alla chat</button>
    <button type="button" role="menuitem" onClick={() => setMenu(undefined)}><X size={16} />Chiudi menu</button>
  </div>, document.body);
}
