import type { TemplateBehavior } from "../core/templateBehavior";

export function TemplateBehaviorInfo({ behavior }: { behavior: TemplateBehavior }) {
  return <aside className="template-behavior-info" aria-label="Funzionamento del template">
    <strong>Funzionamento già previsto dal template</strong><p>{behavior.purpose}</p>
    {behavior.implementation === "structure-only" && <p>Solo struttura: questa base non contiene ancora una funzione macchina operativa.</p>}
    <ul>{behavior.known.map(item => <li key={item}>{item}</li>)}</ul>
    <details><summary>Dati della macchina necessari e limiti</summary><h4>Da fornire o configurare</h4><ul>{behavior.inputs.map((item, index) => <li key={`${item.kind}-${index}`}>{item.label}</li>)}</ul><h4>Limiti da considerare</h4><ul>{behavior.limits.map(item => <li key={item}>{item}</li>)}</ul><small>Scheda {behavior.id} · versione {behavior.version}. Descrive la base, non certifica il progetto modificato.</small></details>
  </aside>;
}
