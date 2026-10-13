import { ArrowLeft, Maximize, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../state/editorStore";

export function StandalonePreview() {
  const previewUrl = useEditorStore((state) => state.previewUrl);
  const previewPath = useEditorStore((state) => state.previewPath);
  const close = useEditorStore((state) => state.closeStandalonePreview);
  const open = useEditorStore((state) => state.openStandalonePreview);
  const fullscreenError = useEditorStore((state) => state.standalonePreviewFullscreenError);
  const iframe = useRef<HTMLIFrameElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [previousFocus] = useState(() => document.activeElement as HTMLElement | null);
  const [token] = useState(() => crypto.randomUUID());
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const src = useMemo(() => {
    if (!previewUrl) return undefined;
    const url = new URL(previewUrl);
    url.pathname = previewPath || "/";
    url.searchParams.set("framecraftPreview", "1");
    return url.toString();
  }, [previewPath, previewUrl]);

  useEffect(() => {
    const focusReturn = () => panel.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const focusIn = (event: FocusEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target)) focusReturn(); };
    focusReturn();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); close(); }
    };
    const onMessage = (event: MessageEvent) => {
      if (!src || !iframe.current?.contentWindow || event.source !== iframe.current.contentWindow || event.origin !== new URL(src).origin) return;
      if (event.data?.type === "framecraft:standalone-close" && event.data.token === token) close();
    };
    let hadFullscreen = !!document.fullscreenElement;
    const fullscreenChange = () => {
      if (document.fullscreenElement) hadFullscreen = true;
      else if (hadFullscreen && useEditorStore.getState().standalonePreviewFullscreenReady) close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("message", onMessage);
    document.addEventListener("fullscreenchange", fullscreenChange);
    document.addEventListener("focusin", focusIn);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("fullscreenchange", fullscreenChange);
      document.removeEventListener("focusin", focusIn);
      if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
    };
  }, [close, src, token, previousFocus]);

  return <section ref={panel} className="standalone-preview" role="dialog" aria-modal="true" aria-label="Prova pannello">
    {!loaded && <div className="standalone-preview-loading"><RefreshCw className="spin" size={22} /><strong>Avvio della prova…</strong></div>}
    {src && <iframe ref={iframe} key={reload} name={`framecraft:standalone:${token}`} src={src} title="Prova pannello" onLoad={() => {
      setLoaded(true);
      iframe.current?.contentWindow?.postMessage({ type: "framecraft:standalone-connect", token }, new URL(src).origin);
    }} />}
    <nav className={`standalone-preview-controls${fullscreenError ? " has-error" : ""}`} aria-label="Controlli prova pannello">
      <button onClick={close}><ArrowLeft size={15} /> Torna all'editor <kbd>Esc</kbd></button>
      <button className="preview-refresh" onClick={() => { setLoaded(false); setReload((value) => value + 1); }} aria-label="Ricarica prova pannello" title="Ricarica"><RefreshCw size={14} /></button>
      {fullscreenError && <><button onClick={() => void open()}><Maximize size={15} /> Schermo intero</button><span className="standalone-preview-message" role="status">{fullscreenError}</span></>}
    </nav>
  </section>;
}
