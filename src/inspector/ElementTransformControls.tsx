import { ArrowDown, ArrowUp, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { rotationDegrees } from "../canvas/elementTransforms";
import { useEditorStore } from "../state/editorStore";

function TransformNumber({ label, value, unit = "", disabled, integer, placeholder = "—", onCommit }: {
  label: string; value?: number; unit?: string; disabled?: boolean; integer?: boolean; placeholder?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const canceled = useRef(false);
  useEffect(() => { setDraft(value === undefined ? "" : String(value)); canceled.current = false; }, [value]);
  return <label className="property-field numeric-field"><span>{label}</span><span className="property-input-with-unit">
    <input aria-label={label} type="number" step={integer ? 1 : "any"} min={integer ? -2147483648 : undefined} max={integer ? 2147483646 : undefined}
      value={draft} disabled={disabled} placeholder={placeholder}
      onChange={(event) => { canceled.current = false; setDraft(event.target.value); }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") { canceled.current = true; setDraft(value === undefined ? "" : String(value)); event.currentTarget.blur(); }
      }}
      onBlur={() => {
        if (canceled.current) { canceled.current = false; return; }
        const next = Number(draft);
        if (!draft.trim() || !Number.isFinite(next) || (integer && (!Number.isInteger(next) || next < -2147483648 || next > 2147483646))) {
          setDraft(value === undefined ? "" : String(value)); return;
        }
        if (next !== value) onCommit(next);
      }} /><small>{unit}</small>
  </span></label>;
}

export function ElementTransformControls({ zIndex, rotate, disabled, group = false }: {
  zIndex?: string | number; rotate?: string | number; disabled?: boolean; group?: boolean;
}) {
  const updateOne = useEditorStore((state) => state.updateStyles);
  const updateGroup = useEditorStore((state) => state.updateMultiSelectionStyles);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const angle = group && rotate === undefined ? undefined : rotationDegrees(rotate);
  const nonPlanar = rotate !== undefined && angle === undefined;
  const levelNumber = Number(zIndex);
  const auto = zIndex === "auto" || zIndex === "" || (!group && zIndex === undefined);
  const level = auto ? undefined : Number.isInteger(levelNumber) ? levelNumber : undefined;
  const commit = async (values: Record<string, string | number>) => {
    if (disabled || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { if (group) await updateGroup(values); else await updateOne(values); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const inactive = disabled || busy;
  return <div className="element-transform-controls">
    <TransformNumber label="Z-index" value={level} integer disabled={inactive} placeholder={auto ? "Auto" : "Valori diversi"}
      onCommit={(value) => void commit({ zIndex: value })} />
    <div className="transform-actions">
      <button type="button" disabled={inactive || (!auto && level === undefined) || level === -2147483648} onClick={() => void commit({ zIndex: (level ?? 0) - 1 })} title="Riduci lo z-index di 1" aria-label="Sposta un livello indietro"><ArrowDown size={13} /> Indietro</button>
      <button type="button" disabled={inactive || (!auto && level === undefined) || level === 2147483646} onClick={() => void commit({ zIndex: (level ?? 0) + 1 })} title="Aumenta lo z-index di 1" aria-label="Sposta un livello avanti"><ArrowUp size={13} /> Avanti</button>
      <button type="button" disabled={inactive || auto} onClick={() => void commit({ zIndex: "auto" })} title="Ripristina l'ordine automatico">Auto</button>
    </div>
    <p className="inspector-note">Un numero più alto porta l'elemento sopra gli altri, nel suo contenitore. Gli elementi statici diventano relativi senza cambiare posizione.</p>
    <TransformNumber label="Rotazione" value={angle} unit="°" disabled={inactive || nonPlanar} placeholder={nonPlanar ? "Rotazione 3D" : "Valori diversi"}
      onCommit={(value) => void commit({ rotate: value + "deg" })} />
    <div className="transform-actions">
      <button type="button" disabled={inactive || angle === undefined} onClick={() => void commit({ rotate: (angle! - 90) + "deg" })} aria-label="Ruota di 90 gradi a sinistra"><RotateCcw size={13} /> −90°</button>
      <button type="button" disabled={inactive || angle === undefined} onClick={() => void commit({ rotate: (angle! + 90) + "deg" })} aria-label="Ruota di 90 gradi a destra"><RotateCw size={13} /> +90°</button>
      <button type="button" disabled={inactive || angle === undefined || angle === 0} onClick={() => void commit({ rotate: "0deg" })} aria-label="Azzera rotazione">0°</button>
    </div>
    <p className="inspector-note">{nonPlanar ? "La rotazione 3D si modifica nel campo Rotazione CSS." : group ? "L'angolo viene applicato ai singoli elementi, non all'intero gruppo. Con valori diversi, scrivi un angolo comune." : "Angolo in gradi. Spostamento, scala e trasformazioni esistenti vengono mantenuti."}</p>
  </div>;
}
