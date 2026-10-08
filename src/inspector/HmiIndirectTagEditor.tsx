import { useId } from "react";
import type { Dynamization } from "../core/hmiStandard";
import { hmiIndirectBindingIssue, resolveHmiTagReference } from "../core/hmiTagBinding";
import { useEditorStore } from "../state/editorStore";
import "./indirectTag.css";

export function HmiIndirectTagEditor({ item, onPatch }: { item: Dynamization; onPatch: (values: Partial<Dynamization>) => void }) {
  const catalog = useEditorStore((state) => state.plcVariables);
  const simulation = useEditorStore((state) => state.simulation);
  const helpId = useId();
  const types = [...new Set(["BOOL", "INT", "DINT", "REAL", "LREAL", "WSTRING", ...catalog.filter((tag) => !tag.detected && tag.access !== "write").map((tag) => tag.dataType), item.indirectDataType ?? ""].filter(Boolean))].sort();
  const issue = hmiIndirectBindingIssue(item, catalog);
  const resolution = item.indirect && simulation.on ? resolveHmiTagReference(item, simulation.values, catalog, simulation.status) : undefined;
  const reason = issue ?? (resolution && "reason" in resolution ? resolution.reason : undefined);
  return <div className="indirect-tag-editor">
    <label className="indirect-tag-toggle">
      <input type="checkbox" checked={item.indirect === true} aria-describedby={helpId} onChange={(event) => onPatch({ indirect: event.target.checked || undefined, indirectDataType: event.target.checked ? item.indirectDataType ?? "REAL" : undefined })} />
      <span>Il tag sceglie un altro segnale</span>
    </label>
    <p id={helpId}>Indirizzamento indiretto: il selettore WSTRING contiene un nome, per esempio <code>Motor1.Temperature</code>. L’elemento mostra il valore di quel segnale, non il nome.</p>
    {item.indirect && <>
      <label className="indirect-tag-type"><span>Tipo del segnale da leggere</span><select value={item.indirectDataType ?? ""} onChange={(event) => onPatch({ indirectDataType: event.target.value })}><option value="">Scegli tipo</option>{types.map((type) => <option key={type}>{type}</option>)}</select></label>
      <div className={`indirect-tag-resolution ${reason ? "error" : ""}`} role="status" aria-live="polite">
        {reason ?? (resolution && "tag" in resolution ? `${item.tag} → ${resolution.tag} · valore: ${resolution.value}` : "Attiva i valori di prova in PLC per vedere quale segnale viene scelto.")}
      </div>
      <p>Solo lettura della proprietà. Destinazione limitata al catalogo, tipo verificato e letture Bad/incerte bloccate. Nessuna scrittura PLC viene aggiunta.</p>
    </>}
  </div>;
}
