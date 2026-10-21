import { useEffect, type RefObject } from "react";
import { useEditorStore } from "../state/editorStore";
import { usePageThumbnails } from "../state/pageThumbnails";

/** Observe only the already-open editor iframe. Never navigate or start a second HMI instance. */
export function usePageThumbnailCapture(grid: RefObject<HTMLDivElement | null>) {
  const project = useEditorStore(state => state.project?.root);
  const pageId = useEditorStore(state => state.activePageId);
  const stateValue = useEditorStore(state => state.pages.find(page => page.id === state.activePageId)?.stateValue);
  const previewUrl = useEditorStore(state => state.previewUrl);
  const previewPath = useEditorStore(state => state.previewPath);
  const ready = useEditorStore(state => state.previewStatus === "ready" && state.interactionMode === "edit");
  const version = useEditorStore(state => state.document?.version);
  const viewport = useEditorStore(state => state.viewport);

  useEffect(() => { usePageThumbnails.getState().reset(project); }, [project]);
  useEffect(() => {
    if (!project || !pageId || !previewUrl || !ready) return;
    const origin = new URL(previewUrl).origin, expectedPath = new URL(previewPath || "/", previewUrl).pathname;
    let frame: HTMLIFrameElement | undefined, timer: ReturnType<typeof setTimeout> | undefined, requestId = "", bridgePageId = "", disposed = false;
    const matches = (data: { path?: string; statePage?: string }) => data.path === expectedPath && (!stateValue || data.statePage === stateValue);
    function hello() {
      if (disposed || !frame?.contentWindow || new URL(frame.src).origin !== origin) return;
      requestId = crypto.randomUUID(); bridgePageId = "";
      frame.contentWindow.postMessage({ type: "framecraft:thumbnail-hello", requestId }, origin);
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(hello, 1000); }
    function attach() {
      const next = grid.current?.querySelector<HTMLIFrameElement>('iframe[title="Project preview"]') ?? undefined;
      if (frame === next) return;
      frame?.removeEventListener("load", schedule); frame = next;
      frame?.addEventListener("load", schedule); schedule();
    }
    function receive(event: MessageEvent) {
      if (disposed || !frame || event.source !== frame.contentWindow || event.origin !== origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "framecraft:ready" || data.type === "framecraft:state-page") { schedule(); return; }
      if (!requestId || data.requestId !== requestId || !matches(data)) return;
      if (data.type === "framecraft:thumbnail-ready" && typeof data.pageId === "string" && data.pageId.length <= 100) {
        bridgePageId = data.pageId;
        frame.contentWindow?.postMessage({ type: "framecraft:thumbnail-capture", requestId, pageId: bridgePageId }, origin);
      } else if (data.type === "framecraft:thumbnail-result" && bridgePageId && data.pageId === bridgePageId) {
        const current = useEditorStore.getState();
        if (current.project?.root === project && current.activePageId === pageId && current.document?.version === version && current.viewport === viewport) usePageThumbnails.getState().put(project!, pageId!, data.image);
        requestId = ""; bridgePageId = "";
      }
    }
    window.addEventListener("message", receive);
    const observer = new MutationObserver(attach);
    if (grid.current) observer.observe(grid.current, { childList: true, subtree: true });
    attach();
    return () => { disposed = true; clearTimeout(timer); observer.disconnect(); frame?.removeEventListener("load", schedule); window.removeEventListener("message", receive); };
  }, [grid, project, pageId, stateValue, previewUrl, previewPath, ready, version, viewport]);
}
