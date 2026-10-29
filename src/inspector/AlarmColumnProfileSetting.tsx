import { useState } from "react";
import type { EditorNode } from "../core/types";
import { useEditorStore } from "../state/editorStore";
import { alarmColumnProfileAttribute, parseAlarmColumnProfileConfig, type AlarmColumnProfileConfig } from "../../scripts/hmi-alarm-views.mjs";

export function AlarmColumnProfileSetting({ node }: { node: EditorNode }) {
  const update = useEditorStore(state => state.updateAttribute), dynamic = node.dynamicProps.includes(alarmColumnProfileAttribute);
  let parsed: AlarmColumnProfileConfig | undefined, invalid = dynamic; if (!dynamic) try { parsed = parseAlarmColumnProfileConfig(node.props[alarmColumnProfileAttribute]); } catch { invalid = true; }
  const [enabled, setEnabled] = useState(!!parsed), [id, setId] = useState(() => parsed?.id ?? crypto.randomUUID()), [mode, setMode] = useState<AlarmColumnProfileConfig["save"]>(parsed?.save ?? "manual"), [replace, setReplace] = useState(false), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  return <form className="alarm-columns-fields" onSubmit={event => { event.preventDefault(); if (saving || invalid && !replace) return;
    try { const value = enabled ? JSON.stringify(parseAlarmColumnProfileConfig({ version: 1, id, save: mode })) : ""; setError(""); setSaving(true); void update(alarmColumnProfileAttribute, value).catch(() => setError("Impostazione non salvata. Controlla i messaggi dell’editor e riprova.")).finally(() => setSaving(false)); }
    catch (error) { setError(error instanceof Error ? error.message : "Impostazione non valida."); }
  }}>
    <h4>Salvataggio per operatore</h4>
    {invalid && <><p role="alert">{dynamic ? "Impostazione calcolata nel codice: non viene sostituita automaticamente." : "Impostazione del profilo non valida: il valore esistente è conservato."}</p><label className="alarm-columns-check"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} /><span>Sostituisci l’impostazione del profilo</span></label></>}
    <fieldset disabled={saving || invalid && !replace}>
      <label className="alarm-columns-check"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span>Conserva le colonne per ogni operatore</span></label>
      {enabled && <><label><span>Quando conservare le colonne</span><select value={mode} onChange={event => setMode(event.target.value as AlarmColumnProfileConfig["save"])}><option value="manual">Quando preme Salva le mie colonne</option><option value="automatic">Quando applica una visualizzazione</option></select></label><p className="inspector-hint">Ogni account ritrova le proprie colonne su questo browser. Se il progetto cambia, la disposizione precedente resta conservata da verificare.</p><details><summary>Identità della lista (avanzate)</summary><label><span>Identificativo della lista</span><input maxLength={80} value={id} onChange={event => setId(event.target.value)} /></label><p className="inspector-hint">Creato automaticamente. Deve essere unico nella pagina: lettere, numeri, punto, trattino o underscore. Cambialo se due liste copiate usano lo stesso profilo.</p></details></>}
      <button type="submit">{saving ? "Salvataggio…" : "Applica salvataggio per operatore"}</button>
    </fieldset>
    {error && <p role="alert">{error} Il valore precedente è conservato.</p>}
  </form>;
}
