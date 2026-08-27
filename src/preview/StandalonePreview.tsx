import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useEditorStore } from "../state/editorStore";

export function StandalonePreview() {
  const previewUrl = useEditorStore((state) => state.previewUrl);
  const previewPath = useEditorStore((state) => state.previewPath);
  const close = useEditorStore((state) => state.closeStandalonePreview);
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  return <section className="standalone-preview" aria-label="Prova app">
    {!loaded && <div className="standalone-preview-loading"><RefreshCw className="spin" size={22} /><strong>Avvio della prova…</strong></div>}
    {src && <iframe key={reload} src={src} title="Prova app" onLoad={() => setLoaded(true)} />}
    <nav className="standalone-preview-controls" aria-label="Controlli prova app">
      <button onClick={close}><ArrowLeft size={15} /> Torna all'editor <kbd>Esc</kbd></button>
      <button className="preview-refresh" onClick={() => { setLoaded(false); setReload((value) => value + 1); }} aria-label="Ricarica prova app" title="Ricarica"><RefreshCw size={14} /></button>
    </nav>
  </section>;
}
