import { useId, useMemo } from "react";
import type { AiEditSnapshot, AiProposal } from "../ai/aiProposal";
import { prepareAiEdits, aiStyleNames } from "../ai/aiProposal";
import type { AiEditReview as Review } from "../ai/aiEditReview";
import { inspectElementValues, type ElementValue } from "../source-parser/inspectElementValues";
import { parseSource } from "../source-parser/parseSource";

function elementModel(snapshot: AiEditSnapshot, source: string) {
  const original = snapshot.document.nodes[snapshot.selectedId], parsed = parseSource(snapshot.document.file, source);
  const node = Object.values(parsed.nodes).find(node => node.source.start === original.source.start && node.type === original.type);
  if (!node) throw new Error("Elemento non disponibile per l’anteprima.");
  return inspectElementValues(source, node.source, aiStyleNames);
}
function Swatch({ value }: { value: ElementValue }) {
  const color = value.kind === "literal" ? String(value.value) : "";
  return /^#[\da-f]{3,8}$/i.test(color) ? <i className="ai-color-swatch" style={{ backgroundColor: color }} aria-hidden="true" /> : null;
}
function sketchSize(model: ReturnType<typeof elementModel>) {
  const dimension = (name: string, fallback: number) => {
    const raw = model.styles[name]; return raw?.kind === "literal" && /^\d+(\.\d+)?(px)?$/.test(String(raw.value)) ? Math.max(18, Math.min(4096, parseFloat(String(raw.value)))) : fallback;
  };
  return { width: dimension("width", 160), height: dimension("height", 48) };
}
function ElementSketch({ title, model, scale }: { title: string; model: ReturnType<typeof elementModel>; scale: number }) {
  const value = (name: string) => model.styles[name]?.kind === "literal" ? model.styles[name].value : undefined;
  const number = (name: string, fallback: number, max: number) => { const raw = value(name); return raw !== undefined && /^-?\d+(\.\d+)?(px|deg)?$/.test(String(raw)) ? Math.max(-max, Math.min(max, parseFloat(String(raw)))) : fallback; };
  const color = (name: string, fallback: string) => /^#[\da-f]{3,8}$/i.test(String(value(name))) ? String(value(name)) : fallback;
  const size = sketchSize(model), w = size.width * scale, h = size.height * scale;
  const content = model.text.kind === "literal" ? String(model.text.value) : "Valore dinamico";
  const foreground = color("color", "#17202d"), raw = foreground.slice(1), rgb = raw.length <= 4 ? raw.slice(0, 3).split("").map(char => char + char).join("") : raw.slice(0, 6);
  const lightText = [0, 2, 4].reduce((sum, index) => sum + parseInt(rgb.slice(index, index + 2), 16), 0) / 3 > 160;
  return <figure className="ai-element-sketch"><figcaption>{title}</figcaption><svg viewBox="0 0 280 160" role="img" aria-label={`Schema indicativo: ${title}`}>
    <g transform={`rotate(${number("rotate", 0, 999)} 140 80)`} opacity={Math.max(0, Math.min(1, number("opacity", 1, 1)))}>
      <rect x={(280 - w) / 2} y={(160 - h) / 2} width={w} height={h} rx={Math.min(h / 2, Math.max(0, number("borderRadius", 4, 100) * scale))} fill={color("backgroundColor", lightText ? "#28323f" : "#e5e7eb")} stroke={color("borderColor", "#718096")} />
      <text x="140" y="84" textAnchor="middle" fontSize={Math.max(8, Math.min(32, number("fontSize", 14, 4096) * scale))} fontWeight={number("fontWeight", 400, 900)} fill={foreground}>{content.length > 25 ? `${content.slice(0, 24)}…` : content}</text>
    </g>
  </svg></figure>;
}
export function AiEditReview({ snapshot, proposal, review, accepted, onAccepted, disabled }: { snapshot: AiEditSnapshot; proposal: AiProposal; review: Review; accepted: string[]; onAccepted(ids: string[]): void; disabled: boolean }) {
  const descriptionId = useId();
  const preview = useMemo(() => {
    try {
      const source = accepted.length ? prepareAiEdits(snapshot, { ...proposal, questions: [] }, accepted) : snapshot.document.source;
      const before = elementModel(snapshot, snapshot.document.source), after = elementModel(snapshot, source);
      const first = sketchSize(before), last = sketchSize(after), scale = Math.min(1, 220 / Math.max(first.width, last.width), 100 / Math.max(first.height, last.height));
      return { before, after, scale };
    } catch { return undefined; }
  }, [snapshot, proposal, accepted]);
  return <section aria-label="Confronto delle modifiche AI">
    <p>Confronto dei valori scritti nel file. Seleziona solo ciò che vuoi applicare; le sostituzioni di valori dinamici richiedono una scelta esplicita.</p>
    {review.error && <p role="alert" className="ai-error">{review.error}</p>}
    {review.changes.map(change => <label className="ai-operation" key={change.operation.id}>
      <input type="checkbox" aria-label={`Applica: ${change.label}`} aria-describedby={`${descriptionId}-${change.operation.id}`} checked={accepted.includes(change.operation.id)} disabled={disabled || !!change.blocked || change.unchanged} onChange={event => onAccepted(event.target.checked ? [...accepted, change.operation.id] : accepted.filter(id => id !== change.operation.id))} />
      <span id={`${descriptionId}-${change.operation.id}`}><strong>{change.label}</strong><span className="ai-change-values"><span><small>Prima · base nel file</small><code><Swatch value={change.before} />{change.beforeText}</code></span><span><small>Dopo · se selezionata</small><code><Swatch value={change.after} />{change.afterText}</code></span></span>
        {change.unchanged && <small>Nessuna variazione: questa modifica non verrà applicata.</small>}
        {change.blocked && <small className="ai-error">{change.blocked}</small>}
        {change.warnings.map(warning => <small key={warning}>{warning}</small>)}
      </span>
    </label>)}
    {preview && <><div className="ai-sketches"><ElementSketch title="Prima" model={preview.before} scale={preview.scale} /><ElementSketch title="Con le modifiche selezionate" model={preview.after} scale={preview.scale} /></div><p className="ai-hint">Schema indicativo dei valori base, con la stessa scala nei due riquadri. Dimensioni relative o non impostate sono indicative. Non esegue il componente: CSS esterni, immagini, posizione, livello e valori Runtime vanno verificati nel pannello reale.</p></>}
    <p role="status">{accepted.length} modifiche selezionate · un solo Annulla dopo l’applicazione.</p>
  </section>;
}
