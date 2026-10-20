import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Database, X } from "lucide-react";
import { emptyRecipeCatalog, parseRecipeCatalog, recipeConfigurationIssues, type RecipeCatalog } from "../core/recipeConfiguration";
import { RecipeCatalogEditor } from "./RecipeCatalogEditor";
import { useRecipeDialog } from "./useRecipeDialog";
import "./alarms.css";
import "./recipes.css";

export function RecipeCatalogDraftDialog({ catalog, onApply, onClose, returnFocus }: { catalog?: RecipeCatalog; onApply(catalog: RecipeCatalog, changed: boolean): void; onClose(): void; returnFocus?: HTMLElement | null }) {
  const [initial] = useState(catalog), [draft, setDraft] = useState(() => structuredClone(catalog ?? emptyRecipeCatalog()));
  const [confirmClose, setConfirmClose] = useState(false), [error, setError] = useState("");
  const title = useId(), stale = catalog !== initial;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial ?? emptyRecipeCatalog());
  const issues = useMemo(() => recipeConfigurationIssues(draft), [draft]);
  const close = () => { if (dirty) setConfirmClose(true); else onClose(); };
  const panel = useRecipeDialog(close, returnFocus);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "La bozza ricette non è ancora nel questionario."; };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function apply() {
    if (stale || issues.length) return;
    try { onApply(parseRecipeCatalog(draft), dirty); }
    catch { setError("Controlla schemi, limiti e valori: la bozza non è stata inclusa nel progetto."); }
  }
  return createPortal(<div className="alarm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="alarm-dialog recipe-dialog" role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1} ref={panel}>
      <header><div><small>NUOVO PROGETTO · CONFIGURAZIONE LOCALE</small><h2 id={title}><Database size={22} /> Schemi e ricette iniziali</h2></div><button type="button" aria-label="Chiudi bozza ricette" onClick={close}><X size={20} /></button></header>
      <p>Definisci i parametri e, se li conosci, i valori delle prime ricette. Non servono un file JSON o un account AI. Nessun valore macchina viene scelto automaticamente.</p>
      <p>La bozza entra nel questionario solo con “Usa queste ricette nel progetto”. Sarà salvata su disco quando approvi la creazione del pannello.</p>
      {stale && <p className="alarm-error" role="alert">Le ricette del questionario sono cambiate mentre questa finestra era aperta. La bozza resta qui, ma non può sostituire il nuovo catalogo. Chiudi e riapri per lavorare sulla versione attuale.</p>}
      {error && <p className="alarm-error" role="alert">{error}</p>}
      <RecipeCatalogEditor catalog={draft} onChange={next => { setDraft(next); setConfirmClose(false); setError(""); }} />
      {!!issues.length && <section className="alarm-error" role="alert"><strong>Prima di usare il catalogo</strong><ul>{issues.slice(0, 12).map((issue, index) => <li key={index}>{issue}</li>)}</ul>{issues.length > 12 && <p>Altri {issues.length - 12} valori da completare nelle ricette.</p>}</section>}
      <footer>{confirmClose ? <><span>Hai modifiche non ancora incluse nel questionario. Vuoi scartare questa bozza? Le ricette già approvate non cambiano.</span><button type="button" onClick={() => setConfirmClose(false)}>Continua modifica</button><button type="button" onClick={onClose}>Scarta bozza ricette</button></> : <>
        <span>Solo configurazione iniziale. Form operatore, archivio Runtime e trasferimento PLC restano da collegare e collaudare.</span>
        <button type="button" onClick={close}>Annulla</button><button type="button" disabled={stale || !!issues.length} onClick={apply}>Usa queste ricette nel progetto</button>
      </>}</footer>
    </section>
  </div>, document.body);
}
