import { guidedCommandEvents, guidedCommandIssues, guidedCommandPermissions, newGuidedCommand, type GuidedCommand, type GuidedCommandItem } from "../core/guidedCommands";
import { hmiEventLabels } from "../core/hmiEvents";
import type { PlcVariableDefinition } from "../core/plcVariables";
import { memo } from "react";

export const GuidedCommandTagOptions = memo(function GuidedCommandTagOptions({ id, tags }: { id: string; tags: readonly PlcVariableDefinition[] }) {
  return <datalist id={id}>{tags.filter(tag => !tag.detected && tag.access !== "read").map(tag => <option value={tag.name} key={tag.name}>{tag.dataType} · {tag.description}</option>)}</datalist>;
});

export function GuidedCommandFields({ item, tags, tagListId, onChange, onGoData }: { item: GuidedCommandItem; tags: readonly PlcVariableDefinition[]; tagListId: string; onChange(item: GuidedCommandItem): void; onGoData(): void }) {
  const command = item.command, tag = tags.find(tag => tag.name === item.tag);
  const issues = guidedCommandIssues(item, tags, false);
  const update = (change: Partial<GuidedCommand>) => onChange({ ...item, command: { ...command!, reviewed: false, ...change } });
  return <fieldset className="ai-command-fields" aria-label={`Comando ${item.label}`}>
    <legend>{item.label}</legend>
    <label>Cosa deve fare “{item.label}”?<select value={command ? "write" : "later"} onChange={event => onChange(event.target.value === "write" ? { ...item, tag: "", command: newGuidedCommand() } : { label: item.label, tag: "" })}><option value="later">Non lo so ancora: lascialo disabilitato</option><option value="write">Scrivere un valore in un tag PLC</option></select></label>
    {command && <>
      <label>Quando parte “{item.label}”?<select value={command.event} onChange={event => update({ event: event.target.value as GuidedCommand["event"] })}>{guidedCommandEvents.map(event => <option value={event} key={event}>{hmiEventLabels[event]}</option>)}</select></label>
      <label>Tag da scrivere per “{item.label}”<input list={tagListId} maxLength={200} autoComplete="off" value={item.tag} placeholder="Cerca e scegli un tag scrivibile" onChange={event => onChange({ ...item, tag: event.target.value, command: { ...command, value: "", reviewed: false } })} /></label>
      {tag && <p className="ai-hint">Tipo: {tag.dataType}{tag.description ? ` · ${tag.description}` : ""}. Deve corrispondere esattamente a un tag dichiarato e scrivibile.</p>}
      {!tags.some(tag => !tag.detected && tag.access !== "read") && <p className="ai-hint">Serve un catalogo reale con almeno un tag scrivibile. <button type="button" onClick={onGoData}>Torna ai dati e tag</button></p>}
      <label>Valore da scrivere per “{item.label}”{["bool", "boolean"].includes(tag?.dataType.toLowerCase() ?? "") ? <select value={command.value} onChange={event => update({ value: event.target.value })}><option value="">Scegli il valore</option><option value="true">Vero / 1</option><option value="false">Falso / 0</option></select> : <input maxLength={512} value={command.value} disabled={!tag} onChange={event => update({ value: event.target.value })} placeholder={tag ? `Valore esatto di tipo ${tag.dataType}` : "Scegli prima il tag"} />}</label>
      <label>Chi può usare “{item.label}”?<select value={command.permission} onChange={event => update({ permission: event.target.value as GuidedCommand["permission"] })}>{guidedCommandPermissions.map(permission => <option value={permission.id} key={permission.id}>{permission.label}</option>)}</select></label>
      {command.permission && <p className="ai-hint">Il Runtime bloccherà il pulsante finché l’account attivo non avrà questo permesso. Configura account e accessi nell’editor; la regola grafica non sostituisce l’autorizzazione server/PLC.</p>}
      {!!issues.length && <ul className="ai-hint">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      <label className="ai-check"><input type="checkbox" checked={command.reviewed} disabled={!!issues.length} onChange={event => update({ reviewed: event.target.checked })} />Confermo il mapping di “{item.label}”: ho verificato tag, valore ed evento nei dati della macchina.</label>
    </>}
  </fieldset>;
}
