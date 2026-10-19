import { guidedCommandEvents, guidedCommandIssues, guidedCommandPermissions, newGuidedCommand, type GuidedCommand, type GuidedCommandItem, type GuidedCommandPage } from "../core/guidedCommands";
import type { GuidedPage } from "../core/guidedProject";
import { hmiEventLabels } from "../core/hmiEvents";
import type { PlcVariableDefinition } from "../core/plcVariables";
import { memo, useId } from "react";

export const GuidedCommandTagOptions = memo(function GuidedCommandTagOptions({ id, tags }: { id: string; tags: readonly PlcVariableDefinition[] }) {
  return <datalist id={id}>{tags.filter(tag => !tag.detected && tag.access !== "read").map(tag => <option value={tag.name} key={tag.name}>{tag.dataType} · {tag.description}</option>)}</datalist>;
});

export function GuidedCommandFields({ item, tags, pages = [], tagListId, onChange, onGoData }: { item: GuidedCommandItem; tags: readonly PlcVariableDefinition[]; pages?: readonly GuidedCommandPage[]; tagListId: string; onChange(item: GuidedCommandItem): void; onGoData(): void }) {
  const command = item.command, tag = tags.find(tag => tag.name === item.tag);
  const navigate = command?.kind === "navigate", errorId = useId();
  const issues = guidedCommandIssues(item, tags, false, pages);
  const update = (change: Partial<GuidedCommand>) => onChange({ ...item, command: { ...command!, reviewed: false, ...change } });
  return <fieldset className="ai-command-fields" aria-label={`Comando ${item.label}`}>
    <legend>{item.label}</legend>
    <label>Cosa deve fare “{item.label}”?<select value={command ? navigate ? "navigate" : "write" : "later"} onChange={event => onChange({ ...item, tag: "", command: event.target.value === "later" ? undefined : newGuidedCommand(event.target.value as "write" | "navigate") })}><option value="later">Non lo so ancora: lascialo disabilitato</option><option value="write">Scrivere un valore in un tag PLC</option><option value="navigate">Aprire una pagina del pannello</option></select></label>
    {command && <>
      <label>Quando parte “{item.label}”?<select value={command.event} onChange={event => update({ event: event.target.value as GuidedCommand["event"] })}>{guidedCommandEvents.map(event => <option value={event} key={event}>{hmiEventLabels[event]}</option>)}</select></label>
      {navigate ? <>
        <label>Pagina da aprire per “{item.label}”<select value={command.targetPageId ?? ""} aria-invalid={pages.filter(page => page.id === command.targetPageId).length !== 1} aria-describedby={issues.length ? errorId : undefined} onChange={event => update({ targetPageId: event.target.value })}><option value="">Scegli la destinazione · nessuna pagina preselezionata</option>
          {command.targetPageId && !pages.some(page => page.id === command.targetPageId) && <option value={command.targetPageId} disabled>Pagina rimossa · scegli una destinazione</option>}
          {pages.map(page => <option key={page.id} value={page.id}>{page.title}</option>)}
        </select></label>
        <p className="ai-hint">Aprirà soltanto la pagina scelta, mantenendo desktop/mobile. Non scrive tag, non apre siti esterni e non avvia connessioni.</p>
      </> : <>
      <label>Tag da scrivere per “{item.label}”<input list={tagListId} maxLength={200} autoComplete="off" value={item.tag} placeholder="Cerca e scegli un tag scrivibile" onChange={event => onChange({ ...item, tag: event.target.value, command: { ...command, value: "", reviewed: false } })} /></label>
      {tag && <p className="ai-hint">Tipo: {tag.dataType}{tag.description ? ` · ${tag.description}` : ""}. Deve corrispondere esattamente a un tag dichiarato e scrivibile.</p>}
      {!tags.some(tag => !tag.detected && tag.access !== "read") && <p className="ai-hint">Serve un catalogo reale con almeno un tag scrivibile. <button type="button" onClick={onGoData}>Torna ai dati e tag</button></p>}
      <label>Valore da scrivere per “{item.label}”{["bool", "boolean"].includes(tag?.dataType.toLowerCase() ?? "") ? <select value={command.value} onChange={event => update({ value: event.target.value })}><option value="">Scegli il valore</option><option value="true">Vero / 1</option><option value="false">Falso / 0</option></select> : <input maxLength={512} value={command.value} disabled={!tag} onChange={event => update({ value: event.target.value })} placeholder={tag ? `Valore esatto di tipo ${tag.dataType}` : "Scegli prima il tag"} />}</label>
      </>}
      <label>Chi può usare “{item.label}”?<select value={command.permission} onChange={event => update({ permission: event.target.value as GuidedCommand["permission"] })}>{guidedCommandPermissions.map(permission => <option value={permission.id} key={permission.id}>{permission.label}</option>)}</select></label>
      {command.permission && <p className="ai-hint">Il Runtime bloccherà il pulsante finché l’account attivo non avrà questo permesso. Configura account e accessi nell’editor; {navigate ? "la regola riguarda questo pulsante, non protegge la pagina da altri percorsi di accesso." : "la regola grafica non sostituisce l’autorizzazione server/PLC."}</p>}
      {!!issues.length && <ul id={errorId} className="ai-hint">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      <label className="ai-check"><input type="checkbox" checked={command.reviewed} disabled={!!issues.length} onChange={event => update({ reviewed: event.target.checked })} />{navigate ? `Confermo il collegamento di “${item.label}”: ho verificato pagina, evento e permesso.` : `Confermo il mapping di “${item.label}”: ho verificato tag, valore ed evento nei dati della macchina.`}</label>
    </>}
  </fieldset>;
}

export function GuidedCommandsReview({ pages, onEdit, disabled = false }: { pages: readonly GuidedPage[]; onEdit(id: string): void; disabled?: boolean }) {
  const rows = pages.flatMap(page => page.items.filter(item => item.command).map(item => ({ page, item })));
  if (!rows.length) return null;
  return <section className="ai-command-review" aria-label="Mapping comandi da approvare"><h4>Controlla anche i pulsanti configurati</h4><ul>{rows.map(({ page, item }, index) => <li key={index} style={{ overflowWrap: "anywhere" }}><strong>{page.title} · {item.label}</strong>: {hmiEventLabels[item.command!.event]} → {item.command!.kind === "navigate" ? `apri ${pages.find(page => page.id === item.command!.targetPageId)?.title ?? "pagina da scegliere"} · nessuna scrittura PLC` : <>{item.tag || "tag da scegliere"} = <code>{JSON.stringify(item.command!.value)}</code></>}{item.command!.permission ? ` · permesso ${item.command!.permission}` : " · tutti per la bozza"} · {item.command!.reviewed ? "confermato" : "da confermare"} <button type="button" disabled={disabled} onClick={() => onEdit(page.id)}>Rivedi pulsante: {item.label}</button></li>)}</ul><p>I mapping restano locali. La navigazione non protegge una pagina; le scritture richiedono autorizzazioni e collaudo PLC separati.</p></section>;
}
