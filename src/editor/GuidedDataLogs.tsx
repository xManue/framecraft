import { hmiDataLogCatalogIssues, type HmiDataLogCatalog } from "../core/hmiDataLogs";

function retention(ms: number) {
  for (const [duration, one, many] of [[86_400_000, "giorno", "giorni"], [3_600_000, "ora", "ore"], [60_000, "minuto", "minuti"]] as const) if (ms % duration === 0) return `${ms / duration} ${ms === duration ? one : many}`;
  return `${ms / 1000} s`;
}
export function GuidedDataLogsReview({ catalog, file, onRemove }: { catalog?: HmiDataLogCatalog; file?: string; onRemove?(): void }) {
  if (!catalog) return null;
  const warnings = hmiDataLogCatalogIssues(catalog).filter(issue => issue.severity === "warning");
  return <details className="ai-command-review" aria-label="Configurazioni Data Log importate">
    <summary>{file || "Data Log"} · {catalog.logs.length} archivi · {catalog.logs.reduce((sum, log) => sum + log.tags.length, 0)} variabili</summary>
    <p>Sono configurazioni, non campioni precedenti. Gli archivi abilitati acquisiranno solo mentre il pannello è aperto e riceve i dati: memoria di sessione o archivio locale del browser, non database industriale. Salvare o generare non avvia una connessione PLC. Controlla limiti, quote del browser e backup prima dell’uso reale.</p>
    <p>Le risposte generali su sorgenti e conservazione sono requisiti: non sovrascrivono i collegamenti per curva né le impostazioni del catalogo elencate qui.</p>
    <ul>{catalog.logs.map(log => <li key={log.id}><strong>{log.name}</strong> · {log.enabled ? "abilitato" : "disabilitato"} · {log.storage === "memory" ? "solo memoria di sessione" : "locale in questo browser"} · massimo {log.maxEntries} campioni · conservazione massima {retention(log.retentionMs)}<ul>{log.tags.slice(0, 50).map(tag => <li key={tag.id}>{tag.name} → {tag.tag} · {tag.mode === "cyclic" ? `ciclico ogni ${tag.cycleMs} ms` : tag.mode === "on-change" ? "su variazione" : "su richiesta/trigger"}</li>)}</ul>{log.tags.length > 50 && <p>Mostrate le prime 50 configurazioni; verranno conservate tutte le {log.tags.length} variabili.</p>}</li>)}</ul>
    {!!warnings.length && <ul>{warnings.slice(0, 20).map((warning, index) => <li key={index}>{warning.message}</li>)}</ul>}
    {onRemove && <button type="button" onClick={onRemove}>Rimuovi catalogo Data Log</button>}
  </details>;
}
