import type { ReactNode } from "react";
import { newPanelHeader, panelHeaderFields, panelHeaderTags, type PanelHeaderConfig } from "../core/panelHeader";
import type { PlcVariableDefinition } from "../core/plcVariables";

export function PanelHeaderFields({ config, tags, onChange, question }: { config?: PanelHeaderConfig; tags: readonly PlcVariableDefinition[]; onChange(next: PanelHeaderConfig): void; question(key: string, children: ReactNode): ReactNode }) {
  const current = config ?? newPanelHeader();
  return <>
    <p>La barra è comune alle pagine. Orologio del dispositivo, utente attivo e allarmi usano i servizi del pannello. Non occorre riscriverne il funzionamento per l’AI.</p>
    <p>I dati macchina qui sotto sono facoltativi: scegli solo tag reali leggibili. In mancanza di collegamento o qualità valida compare “—”, non un valore di esempio. Un codice di stato viene mostrato così com’è: nessuna interpretazione PackML inventata.</p>
    {!tags.length && <p className="ai-hint">Non hai importato tag. Puoi andare avanti: questi dati resteranno da collegare.</p>}
    {panelHeaderFields.map(field => <div key={field.id}>{question(`header.${field.id}`, <label>{field.label}<select value={current.tags[field.id] ?? ""} onChange={event => onChange({ ...current, tags: { ...current.tags, [field.id]: event.target.value } })}>
      <option value="">Non collegato · lo configurerò dopo</option>{panelHeaderTags(tags, field.numeric).map(tag => <option key={tag.name} value={tag.name}>{tag.name} · {tag.dataType}</option>)}
    </select></label>)}</div>)}
    {current.tags.speed && question("header.speedScale", <>
      <label>Unità della velocità (facoltativa)<input maxLength={24} value={current.speedUnit ?? ""} placeholder="Inserisci l’unità reale" onChange={event => onChange({ ...current, speedUnit: event.target.value })} /></label>
      <label>Minimo della scala (facoltativo)<input inputMode="decimal" maxLength={40} value={current.speedMin ?? ""} onChange={event => onChange({ ...current, speedMin: event.target.value })} /></label>
      <label>Massimo della scala (facoltativo)<input inputMode="decimal" maxLength={40} value={current.speedMax ?? ""} onChange={event => onChange({ ...current, speedMax: event.target.value })} /></label>
      <p>Compila entrambi i limiti oppure lasciali vuoti. Non vengono scelti dall’AI. Il valore resta visibile anche senza scala.</p>
    </>)}
  </>;
}
export function PanelHeaderReview({ config }: { config?: PanelHeaderConfig }) {
  return <details><summary>Barra superiore · collegamenti e dati mancanti</summary><dl>{panelHeaderFields.map(field => <div key={field.id}><dt>{field.label}</dt><dd>{config?.tags[field.id] || "Da collegare · nessun valore inventato"}</dd></div>)}</dl>{config?.tags.speed && <p>Unità: {config.speedUnit || "non indicata"}. Scala: {config.speedMin && config.speedMax ? `${config.speedMin} → ${config.speedMax}` : "da configurare"}.</p>}<p>Solo letture valide. Orologio del dispositivo; utente attivo dal servizio accessi, senza account predefinito; allarmi dal catalogo reale.</p></details>;
}
