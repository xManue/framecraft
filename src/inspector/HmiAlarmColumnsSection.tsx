import { ChevronDown, Table2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EditorNode } from "../core/types";
import { useEditorStore } from "../state/editorStore";
import { alarmColumnsAttribute, alarmColumnDefinitions, defaultAlarmColumns, parseAlarmColumns, serializeAlarmColumns, type AlarmColumnsConfig, type AlarmColumnKey } from "../../scripts/hmi-alarm-views.mjs";
import "./alarmColumns.css";

function ColumnFields({ config, columnKey, write }: { config: AlarmColumnsConfig; columnKey: AlarmColumnKey; write(value: AlarmColumnsConfig): Promise<void> }) {
  const index = config.columns.findIndex(item => item.key === columnKey), column = config.columns[index];
  const [label, setLabel] = useState(column.label), [width, setWidth] = useState(String(column.width)), [visible, setVisible] = useState(column.visible), [position, setPosition] = useState(index), [zone, setZone] = useState(config.timeZone), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  return <form className="alarm-columns-fields" onSubmit={event => { event.preventDefault(); if (saving) return; try {
    const next = parseAlarmColumns(config); next.columns[index] = { ...column, label, width: Number(width), visible }; next.timeZone = zone; const [moved] = next.columns.splice(index, 1); next.columns.splice(position, 0, moved); parseAlarmColumns(next);
    setError(""); setSaving(true); void write(next).catch(() => setError("Modifica non salvata. Controlla i messaggi dell’editor e riprova.")).finally(() => setSaving(false));
  } catch (error) { setError(error instanceof Error ? error.message : "Configurazione non valida."); } }}>
    <fieldset disabled={saving}>
      <label><span>Titolo della colonna</span><input value={label} maxLength={60} onChange={event => setLabel(event.target.value)} /></label>
      <label><span>Larghezza colonna (px)</span><input type="number" min={64} max={1200} step={1} value={width} onChange={event => setWidth(event.target.value)} /></label>
      <label className="alarm-columns-check"><input type="checkbox" checked={visible} disabled={columnKey === "name" || columnKey === "state"} onChange={event => setVisible(event.target.checked)} /><span>Mostra colonna</span></label>
      <label><span>Posizione della colonna</span><select value={position} onChange={event => setPosition(Number(event.target.value))}>{config.columns.map((item, i) => <option key={item.key} value={i}>{i + 1}</option>)}</select></label>
      <label><span>Orario della lista</span><select value={zone} onChange={event => setZone(event.target.value as AlarmColumnsConfig["timeZone"])}><option value="local">Locale del dispositivo</option><option value="UTC">UTC</option></select></label>
      <button type="submit">{saving ? "Salvataggio…" : "Applica colonne al progetto"}</button>
    </fieldset>
    {error && <p role="alert">{error} Il valore precedente è conservato.</p>}
  </form>;
}
export function HmiAlarmColumnsSection({ node, expandSignal }: { node: EditorNode; expandSignal?: number }) {
  const update = useEditorStore(state => state.updateAttribute), [open, setOpen] = useState(true), [columnKey, setColumnKey] = useState<AlarmColumnKey>("name"), [resetAllowed, setResetAllowed] = useState(false), [error, setError] = useState("");
  const previousExpand = useRef(expandSignal); useEffect(() => { if (expandSignal && previousExpand.current !== expandSignal) setOpen(true); previousExpand.current = expandSignal; }, [expandSignal]);
  if (node.props["data-hmi-type"] !== "HmiAlarmControl") return null;
  const raw = node.props[alarmColumnsAttribute], dynamic = node.dynamicProps.includes(alarmColumnsAttribute);
  let config: AlarmColumnsConfig | undefined; if (!dynamic) try { config = parseAlarmColumns(raw); } catch {}
  const write = async (value: AlarmColumnsConfig) => { setError(""); try { await update(alarmColumnsAttribute, serializeAlarmColumns(value)); } catch { setError("Modifica non salvata. Controlla i messaggi dell’editor."); throw new Error("Colonne non salvate"); } };
  return <section className={`inspector-section ${open ? "open" : ""}`}>
    <button className="inspector-section-title" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}><Table2 size={12} /><span>Colonne allarmi</span><ChevronDown size={13} /></button>
    {open && <div className="inspector-section-fields alarm-columns-fields">
      <p className="inspector-hint">Scegli una colonna, modifica i campi e applica. Controlla il risultato con Usa il pannello. Le impostazioni appartengono a questo elemento, con Annulla/Ripristina dell’editor. Nome e stato restano visibili. Su mobile le colonne diventano schede; le larghezze valgono sul desktop.</p>
      {error && <p role="alert">{error}</p>}
      {!config ? <><p role="alert">{dynamic ? "Configurazione calcolata nel codice: per modificarla qui devi sostituirla esplicitamente." : "Configurazione colonne non valida. Non viene sostituita automaticamente."}</p><label className="alarm-columns-check"><input type="checkbox" checked={resetAllowed} onChange={event => setResetAllowed(event.target.checked)} /><span>Sostituisci la configurazione colonne attuale</span></label><button type="button" disabled={!resetAllowed} onClick={() => void write(defaultAlarmColumns()).catch(() => {})}>Usa colonne iniziali</button></> : <>
        <label><span>Colonna da configurare</span><select value={columnKey} onChange={event => setColumnKey(event.target.value as AlarmColumnKey)}>{config.columns.map(item => <option key={item.key} value={item.key}>{alarmColumnDefinitions.find(definition => definition.key === item.key)!.label}{item.visible ? " · visibile" : " · nascosta"}</option>)}</select></label>
        <ColumnFields key={node.id + ":" + columnKey + ":" + String(raw)} config={config} columnKey={columnKey} write={write} />
        <p className="inspector-hint">Le impostazioni temporanee in Usa il pannello non cambiano il progetto. Lo storico di sessione non contiene qualità o stati correnti: quelle colonne lo indicano esplicitamente.</p>
      </>}
    </div>}
  </section>;
}
