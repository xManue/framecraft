import { useEffect, useState } from "react";
import { panelHeaderFields, panelHeaderReading, panelHeaderScale, type PanelHeaderConfig, type PanelHeaderField } from "./framecraftPanelHeader";
import { runtimeTagStatus, runtimeTagValues, subscribeRuntimeTags } from "./framecraftHmiRuntime";

function useHeaderTag(tag: string | undefined, numeric: boolean) {
  const read = () => panelHeaderReading(tag, numeric, runtimeTagValues(), runtimeTagStatus());
  const [sample, setSample] = useState(() => ({ tag, numeric, reading: read() }));
  useEffect(() => {
    const update = () => setSample({ tag, numeric, reading: read() }); update();
    return subscribeRuntimeTags(changed => { if (changed === tag) update(); });
  }, [tag, numeric]);
  return sample.tag === tag && sample.numeric === numeric ? sample.reading : read();
}
export function HeaderValue({ field, config }: { field: PanelHeaderField; config: PanelHeaderConfig }) {
  const definition = panelHeaderFields.find(item => item.id === field)!;
  const reading = useHeaderTag(config.tags[field], definition.numeric);
  return <output data-hmi-type={definition.numeric ? "HmiIOField" : "HmiTextBox"} data-plc-variable={config.tags[field] ?? ""} data-panel-header-field={field} title={reading.reason} aria-label={definition.label + ": " + reading.text}>{reading.text}</output>;
}
export function HeaderGauge({ config }: { config: PanelHeaderConfig }) {
  const reading = useHeaderTag(config.tags.speed, true), scale = panelHeaderScale(config);
  const value = reading.value, percent = scale && value !== undefined ? Math.max(0, Math.min(100, (value - scale.min) / (scale.max - scale.min) * 100)) : 0;
  const reason = reading.reason || (!scale ? "Scala da configurare: indica i limiti reali della velocità." : value !== undefined && (value < scale.min || value > scale.max) ? "Valore fuori scala: controlla limiti e segnale PLC." : undefined);
  return <div className="hmi-gauge" data-panel-header-gauge="" title={reason}>
    <div className="hmi-gauge-bar" role={scale && value !== undefined ? "meter" : "img"} aria-label={reason || "Velocità"} aria-valuemin={scale && value !== undefined ? scale.min : undefined} aria-valuemax={scale && value !== undefined ? scale.max : undefined} aria-valuenow={scale && value !== undefined ? Math.max(scale.min, Math.min(scale.max, value)) : undefined} aria-valuetext={scale && value !== undefined ? reading.text + (config.speedUnit ? " " + config.speedUnit : "") : undefined}><i style={{ width: percent + "%" }} /></div>
    <div className="hmi-gauge-scale">{scale ? <><span>{scale.min}</span><span>{scale.max}</span></> : <span>Scala da configurare</span>}</div>
  </div>;
}
export function HeaderUser() {
  const read = () => {
    const access = (globalThis as typeof globalThis & { __framecraftUserAccess?: { currentUser(): { name: string } | null } }).__framecraftUserAccess;
    try { return access?.currentUser()?.name || "Nessun utente"; } catch { return "Accesso non disponibile"; }
  };
  const [name, setName] = useState(read);
  useEffect(() => { const update = () => setName(read()); update(); window.addEventListener("framecraft:user-changed", update); window.addEventListener("storage", update); return () => { window.removeEventListener("framecraft:user-changed", update); window.removeEventListener("storage", update); }; }, []);
  return <strong data-hmi-type="HmiTextBox" data-panel-header-user="">{name}</strong>;
}
