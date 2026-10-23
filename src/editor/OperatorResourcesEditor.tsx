import { useEffect, useId, useState } from "react";
import { operatorResourceKinds, operatorText, type OperatorResources, type OperatorResourceKind } from "../../runtime/operator-policy.mjs";
import { parseAlarmCatalog } from "../../runtime/alarm-engine.mjs";
import { parseRecipeCatalog } from "../../runtime/recipe-catalog.mjs";
import { parsePlcCatalog } from "../core/plcVariables";
import { desktopBridge } from "../filesystem/desktopBridge";

export const operatorResourceLabels = { tagWrites: "Scritture sulle variabili PLC", alarmActions: "Azioni sugli allarmi", recipeChanges: "Schemi ricetta: lettura PLC e modifiche" };
export function OperatorResourcesEditor({ value, onChange, root, generation }: { value: OperatorResources; onChange(value: OperatorResources): void; root: string; generation: number }) {
  const prefix = useId();
  const [catalog, setCatalog] = useState<Partial<Record<OperatorResourceKind, { id: string; label: string }[]>>>({}), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true; setLoading(true); setCatalog({});
    const tasks = [
      async () => { const result = await desktopBridge.readConnectionConfiguration(root); if (result.generation !== generation) throw new Error(); return parsePlcCatalog(result.files.plc ?? '{"variables":[]}').filter(item => item.access !== "read").map(item => ({ id: item.name, label: item.description ? item.description + " · " + item.name : item.name })); },
      async () => { const result = await desktopBridge.readAlarmConfiguration(root); if (result.generation !== generation) throw new Error(); return parseAlarmCatalog(JSON.parse(result.source ?? '{"version":1,"classes":[],"alarms":[]}')).alarms.map(item => ({ id: item.id, label: item.name + " · " + item.id })); },
      async () => { const result = await desktopBridge.readRecipeConfiguration(root); if (result.generation !== generation) throw new Error(); return parseRecipeCatalog(JSON.parse(result.source ?? '{"version":1,"schemas":[]}')).schemas.map(item => ({ id: item.id, label: item.name + " · " + item.id })); },
    ];
    void Promise.allSettled(tasks.map(task => Promise.resolve().then(task))).then(results => {
      if (!active) return; const next: typeof catalog = {};
      results.forEach((result, index) => { if (result.status === "fulfilled") { const seen = new Set(); next[operatorResourceKinds[index]] = result.value.filter(item => operatorText(item.id, 200) && !seen.has(item.id) && !!seen.add(item.id)).slice(0, 10000); } });
      setCatalog(next); setLoading(false);
    });
    return () => { active = false; };
  }, [root, generation]);
  return <>
    <p>Questi limiti si aggiungono alle capacità server: non concedono capacità mancanti. Le ricette sono limitate per schema, anche per la lettura dei loro valori PLC, non per singola ricetta. La lettura dell’archivio ricette e il monitoraggio generale PLC non vengono filtrati.</p>
    {operatorResourceKinds.map(kind => {
      const filter = value[kind], label = operatorResourceLabels[kind], id = prefix + kind;
      const mode = filter.mode === "all" ? "all" : filter.ids.length ? "selected" : "none";
      return <div key={kind}><label htmlFor={id}>{label}<select id={id} value={mode} onChange={event => onChange({ ...value, [kind]: event.target.value === "all" ? { mode: "all" } : { mode: "selected", ids: event.target.value === "selected" ? [""] : [] } })}><option value="none">Nessuna risorsa</option><option value="selected">Solo gli ID indicati</option><option value="all">Tutte, anche quelle future</option></select></label>
        {mode !== "all" && <label>Aggiungi dal progetto — {label.toLowerCase()}<select value="" disabled={loading || !catalog[kind]?.length || filter.mode !== "selected" || filter.ids.length >= 256} onChange={event => { const chosen = event.target.value; if (filter.mode === "selected" && chosen && catalog[kind]?.some(item => item.id === chosen)) onChange({ ...value, [kind]: { mode: "selected", ids: [...new Set([...filter.ids.filter(Boolean), chosen])] } }); }}><option value="">{loading ? "Lettura catalogo…" : catalog[kind] === undefined ? "Catalogo non disponibile: usa gli ID esatti" : !catalog[kind]?.length ? "Nessuna risorsa nel catalogo" : "Scegli una risorsa da consentire"}</option>{catalog[kind]?.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
        {filter.mode === "selected" && filter.ids.length > 0 && <label htmlFor={id + "-ids"}>ID consentiti — {label.toLowerCase()}<textarea id={id + "-ids"} rows={4} value={filter.ids.join("\n")} onChange={event => onChange({ ...value, [kind]: { mode: "selected", ids: event.target.value.split("\n") } })} aria-describedby={id + "-hint"} /><small id={id + "-hint"}>Uno per riga. Nome esatto del tag, ID dell’allarme o ID dello schema configurato nel progetto. Maiuscole e minuscole contano; * non è un jolly.</small></label>}
      </div>;
    })}
  </>;
}
