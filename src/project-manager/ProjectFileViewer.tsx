import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, RefreshCw, X } from "lucide-react";
import type { FileEntry } from "../core/types";
import { projectFileKind, projectImageUrl } from "../core/projectFiles";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";
import { MessageNotice } from "../editor/MessageNotice";

export function ProjectFileViewer({ file, onClose }: { file: FileEntry; onClose(): void }) {
  const project = useEditorStore((state) => state.project);
  const previewUrl = useEditorStore((state) => state.previewUrl);
  const previewStatus = useEditorStore((state) => state.previewStatus);
  const [content, setContent] = useState<string>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [imageError, setImageError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const kind = projectFileKind(file.path);
  const imageUrl = project && previewStatus !== "error" ? projectImageUrl(project.root, file.path, previewUrl) : undefined;
  const limit = 100_000;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const modal = dialog.current;
    modal?.showModal();
    modal?.querySelector<HTMLButtonElement>("[data-close-file]")?.focus();
    return () => { modal?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    let active = true;
    setContent(undefined); setError(""); setImageError(false);
    if (kind === "text") {
      void desktopBridge.readFile(file.path).then((text) => {
        if (active && useEditorStore.getState().project === project) setContent(text);
      }).catch((e) => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    }
    return () => { active = false; };
  }, [file.path, kind, project, retry]);
  useEffect(() => setImageError(false), [imageUrl]);

  return createPortal(<dialog ref={dialog} className="project-file-viewer" aria-labelledby="project-file-title" aria-describedby="project-file-purpose"
    onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => {
      event.stopPropagation();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") event.preventDefault();
      if (event.key === "Tab") {
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled), [tabindex]")]
          .filter((control) => control.tabIndex >= 0 && !control.hidden);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
      }
    }}>
    <header><div><h2 id="project-file-title"><FileText size={18} aria-hidden="true" />{file.name}</h2><p>{file.path}</p></div><button type="button" data-close-file onClick={onClose} aria-label="Chiudi file"><X size={20} /></button></header>
    <p id="project-file-purpose" className="project-file-purpose">Consultazione del file · sola lettura. La pagina aperta e le sue modifiche restano intatte.</p>
    <div className="project-file-body">
      {kind === "text" && !error && (content === undefined ? <p role="status">Lettura del file…</p> : <>
        {content.length > limit && <p role="status">File lungo: sono mostrati i primi {limit.toLocaleString("it-IT")} caratteri. Il file originale non è stato modificato.</p>}
        <textarea readOnly spellCheck={false} value={content.slice(0, limit)} aria-label={`Contenuto di ${file.name}`} />
        {content === "" && <p>Questo file è vuoto.</p>}
      </>)}
      {error && <div role="alert"><MessageNotice raw={error} /><button type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={15} /> Riprova lettura</button></div>}
      {kind === "image" && (imageUrl ? <>
        {!imageError && <img src={imageUrl} alt={file.name} onError={() => setImageError(true)} />}
        {imageError && <p role="alert">L’immagine non è stata caricata. Verifica che il file sia valido e che l’anteprima sia attiva, poi riapri il file.</p>}
      </> : <p role="status">Per visualizzare questa immagine serve l’anteprima locale attiva. Chiudi questa finestra e usa Visualizza → Riprova anteprima, poi riapri il file.</p>)}
      {kind === "unsupported" && <p>Questo formato non può essere visualizzato nell’editor. Aprilo con un programma adatto sul computer; il file non è stato modificato.</p>}
    </div>
    <footer><span>Chiudi questa finestra per tornare al pannello.</span><button type="button" onClick={onClose}>Torna al pannello</button></footer>
  </dialog>, document.body);
}
