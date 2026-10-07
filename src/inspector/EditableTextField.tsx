import { Check, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from "react";

export function EditableTextField({ value, label = "Testo", ariaLabel = label, multiline = true, fieldRef, onCommit }: {
  value: string; label?: string; ariaLabel?: string; multiline?: boolean;
  fieldRef?: (field: HTMLInputElement | HTMLTextAreaElement | null) => void;
  onCommit: (value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value);
  const [accepted, setAccepted] = useState(value);
  const [feedback, setFeedback] = useState<"idle" | "applying" | "applied" | "error">("idle");
  const busy = useRef(false);
  const cancelled = useRef(false);
  const alive = useRef(true);
  const hintId = useId();
  useEffect(() => { setDraft(value); setAccepted(value); }, [value]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const changed = draft !== accepted;
  const apply = async () => {
    if (busy.current || !changed) return;
    busy.current = true; setFeedback("applying");
    try {
      const applied = await onCommit(draft);
      if (alive.current) { if (applied) setAccepted(draft); setFeedback(applied ? "applied" : "error"); }
    } catch { if (alive.current) setFeedback("error"); }
    finally { busy.current = false; }
  };
  const reset = () => { cancelled.current = true; setDraft(accepted); setFeedback("idle"); };
  const control = {
    value: draft, disabled: feedback === "applying", "aria-label": ariaLabel, "aria-describedby": hintId,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      cancelled.current = false; setDraft(event.target.value); setFeedback("idle");
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault(); void apply(); event.currentTarget.blur();
      }
      if (event.key === "Escape") { event.preventDefault(); reset(); event.currentTarget.blur(); }
    },
    onBlur: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (cancelled.current) { cancelled.current = false; return; }
      if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest("[data-text-edit-actions]")) return;
      if (feedback !== "error") void apply();
    },
  };
  return <div className="text-property-editor">
    <label className={multiline ? "property-stack" : "property-field"}><span>{label}</span>
      {multiline ? <textarea {...control} ref={fieldRef} rows={3} /> : <input {...control} ref={fieldRef} type="text" />}
    </label>
    <div className="text-edit-actions" data-text-edit-actions>
      <button type="button" disabled={!changed || feedback === "applying"} onClick={() => void apply()} onPointerDown={(event) => event.preventDefault()}><Check size={14} /> {feedback === "applying" ? "Applicazione…" : "Applica testo"}</button>
      <button type="button" disabled={!changed || feedback === "applying"} onClick={reset} onPointerDown={(event) => event.preventDefault()} aria-label="Annulla la modifica del testo"><RotateCcw size={14} /> Annulla</button>
    </div>
    <p id={hintId} className={`text-edit-feedback ${feedback === "error" ? "error" : ""}`} role={feedback === "error" ? "alert" : "status"}>
      {feedback === "error" ? changed ? "Testo non applicato. La tua scritta resta qui: controlla l’avviso dell’editor e riprova."
        : "La scritta è nella bozza, ma il file non è stato salvato. Risolvi l’avviso e usa File → Salva."
        : feedback === "applying" ? "Sto applicando la scritta…"
        : feedback === "applied" ? "Testo applicato. Ctrl+Z annulla la modifica."
        : changed ? "La scritta è pronta da applicare."
        : multiline ? "Applica testo o Ctrl+Invio. Esc annulla; uscire dal campo applica."
        : "Applica testo o Invio. Esc annulla; uscire dal campo applica."}
    </p>
  </div>;
}
