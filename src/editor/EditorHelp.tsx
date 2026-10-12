import { Blocks, Cable, MousePointer2, Play, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { formatEditorShortcut, type EditorCommandId } from "../../scripts/editor-shortcuts.mjs";
import { useEditorGuidance } from "../state/editorGuidance";
import { useEditorShortcuts } from "../state/editorShortcuts";
import { PlcConnectionGuide } from "./PlcConnectionGuide";

export function EditorHelp() {
  const setOpen = useEditorGuidance(state => state.setHelpOpen);
  const bindings = useEditorShortcuts(state => state.bindings);
  const panel = useRef<HTMLElement>(null);
  const shortcut = (id: EditorCommandId) => bindings[id].length ? formatEditorShortcut(bindings[id][0], /Mac|iPhone|iPad/.test(navigator.platform)) : "Non assegnata";
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); }
      if (event.key !== "Tab") return;
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), details > summary') ?? [])]
        .filter(node => !(node.tagName === "SUMMARY" ? node.parentElement?.parentElement : node.parentElement)?.closest("details:not([open])"));
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === nodes.length - 1)) { event.preventDefault(); nodes[0]?.focus(); }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      const target = previous?.isConnected && previous !== document.body ? previous : document.querySelector<HTMLElement>('.topbar-menu-help > button');
      target?.focus({ preventScroll: true });
    };
  }, [setOpen]);
  return createPortal(<div className="help-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
    <section className="quick-help" role="dialog" aria-modal="true" aria-labelledby="quick-help-title" ref={panel} tabIndex={-1} onMouseDown={event => event.stopPropagation()}>
      <header><div><small>GUIDA RAPIDA</small><h2 id="quick-help-title">Come modificare un pannello</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Chiudi guida"><X size={18} /></button></header>
      <div className="quick-help-body">
        <div className="quick-help-steps">
          <article><span><b>1</b><MousePointer2 size={18} /></span><strong>Scegli e modifica</strong><p>Scegli <b>Modifica</b> nello switch della barra superiore e clicca l’oggetto. Con <b>Usa il pannello</b> puoi usare pulsanti, campi e navigazione. Tieni <b>Shift</b> mentre trascini per muoverlo perfettamente dritto.</p></article>
          <article><span><b>2</b><Blocks size={18} /></span><strong>Aggiungi elementi</strong><p>Apri <b>Aggiungi</b> a sinistra e trascina pulsanti, spie o componenti del progetto nel punto desiderato.</p></article>
          <article><span><b>3</b><Cable size={18} /></span><strong>Controlla il PLC</strong><p>Seleziona un oggetto e usa la sezione <b>PLC e dati</b>. Il catalogo completo rimane nel pannello PLC. La guida qui sotto distingue configurazione e collegamento reale.</p></article>
          <article><span><b>4</b><Play size={18} /></span><strong>Prova e salva</strong><p><b>Pannello → Prova pannello</b> mostra il risultato senza editor. Usa <b>File → Salva</b> per la modifica corrente e <b>File → Esporta copia</b> per una copia del progetto.</p></article>
        </div>
        <PlcConnectionGuide id="editor-help-plc-guide" />
      </div>
      <footer><span><kbd>{shortcut("undo")}</kbd> annulla</span><span><kbd>{shortcut("delete")}</kbd> elimina</span><span><kbd>Shift</kbd> trascina dritto</span><span><kbd>Alt</kbd> ignora le guide</span></footer>
    </section>
  </div>, document.body);
}
