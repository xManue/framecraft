import { AlertTriangle, Check, Database, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  defaultHmiDataLog,
  defaultHmiLoggingTag,
  emptyHmiDataLogCatalog,
  estimateHmiDataLogBytes,
  hmiDataLogCatalogIssues,
  hmiDataLogCatalogName,
  parseHmiDataLogCatalog,
  serializeHmiDataLogCatalog,
  type HmiDataLogCatalog,
  type HmiDataLogDefinition,
  type HmiLoggingTagDefinition,
} from "../core/hmiDataLogs";
import { joinProjectPath } from "../core/paths";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";

const identifier = (value: string, fallback: string) => value.trim().toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || fallback;
const uniqueId = (used: readonly string[], base: string) => {
  let id = base;
  let suffix = 2;
  while (used.includes(id)) id = `${base}-${suffix++}`;
  return id;
};
const formatSize = (bytes: number) => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.ceil(bytes / 1_000)} kB`;

export function DataLogsPanel() {
  const project = useEditorStore((state) => state.project);
  const stored = useEditorStore((state) => state.dataLogCatalog);
  const variables = useEditorStore((state) => state.plcVariables);
  const refresh = useEditorStore((state) => state.refreshDataLogCatalog);
  const [catalog, setCatalog] = useState<HmiDataLogCatalog>(() => emptyHmiDataLogCatalog());
  const [selectedId, setSelectedId] = useState<string>();
  const [exists, setExists] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!project) return;
      setError(undefined);
      try {
        const next = parseHmiDataLogCatalog(await desktopBridge.readFile(joinProjectPath(project.root, hmiDataLogCatalogName)));
        if (!alive) return;
        setCatalog(next); setExists(true); setSelectedId((current) => next.logs.some((log) => log.id === current) ? current : next.logs[0]?.id);
      } catch (caught) {
        if (!alive) return;
        const projectContainsFile = project.files.some((entry) => entry.name === hmiDataLogCatalogName);
        setCatalog(stored); setExists(projectContainsFile); setSelectedId(stored.logs[0]?.id);
        if (projectContainsFile) setError(caught instanceof Error ? caught.message : String(caught));
      }
      setDirty(false); setSaved(false);
    };
    void load();
    return () => { alive = false; };
  }, [project?.root]);

  const selected = catalog.logs.find((log) => log.id === selectedId);
  const issues = useMemo(() => hmiDataLogCatalogIssues(catalog, variables), [catalog, variables]);
  const hasErrors = issues.some((issue) => issue.severity === "error");
  const change = (next: HmiDataLogCatalog) => { setCatalog(next); setDirty(true); setSaved(false); setError(undefined); };
  const patchLog = (values: Partial<HmiDataLogDefinition>) => {
    if (!selected) return;
    change({ ...catalog, logs: catalog.logs.map((log) => log.id === selected.id ? { ...log, ...values } : log) });
    if (values.id) setSelectedId(values.id);
  };
  const patchTag = (tagId: string, values: Partial<HmiLoggingTagDefinition>) => {
    if (!selected) return;
    patchLog({ tags: selected.tags.map((tag) => tag.id === tagId ? { ...tag, ...values } : tag) });
  };
  const addLog = () => {
    const index = catalog.logs.length;
    const seed = defaultHmiDataLog(index);
    const id = uniqueId(catalog.logs.map((log) => log.id), seed.id);
    change({ ...catalog, logs: [...catalog.logs, { ...seed, id }] }); setSelectedId(id);
  };
  const removeLog = () => {
    if (!selected || !window.confirm(`Eliminare il Data Log «${selected.name}»? I Trend che lo usano verranno segnalati dal controllo pannello.`)) return;
    const logs = catalog.logs.filter((log) => log.id !== selected.id);
    change({ ...catalog, logs }); setSelectedId(logs[0]?.id);
  };
  const addTag = () => {
    if (!selected) return;
    const seed = defaultHmiLoggingTag(selected.tags.length);
    const id = uniqueId(selected.tags.map((tag) => tag.id), seed.id);
    patchLog({ tags: [...selected.tags, { ...seed, id }] });
  };
  const save = async () => {
    if (!project || hasErrors) return;
    setSaving(true); setError(undefined);
    try {
      const content = serializeHmiDataLogCatalog(catalog);
      if (exists) await desktopBridge.writeFile(joinProjectPath(project.root, hmiDataLogCatalogName), content);
      else { await desktopBridge.createFile(hmiDataLogCatalogName, content); setExists(true); }
      await refresh(); setCatalog(parseHmiDataLogCatalog(content)); setDirty(false); setSaved(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  };

  return <div className="panel-content data-log-panel">
    <div className="panel-title"><span>DATA LOG</span><small>{catalog.logs.length}</small></div>
    <p className="panel-help">Archivi reali del Runtime: acquisizione su variazione, su trigger o ciclica. I Trend possono leggere questi campioni anche dopo il ricaricamento.</p>
    <datalist id="hmi-data-log-tags">{variables.map((variable) => <option key={variable.name} value={variable.name}>{variable.dataType}</option>)}</datalist>
    <div className="data-log-toolbar"><button type="button" onClick={addLog}><Plus size={13} /> Nuovo Data Log</button></div>
    <div className="data-log-list">
      {catalog.logs.map((log) => <button type="button" key={log.id} className={log.id === selectedId ? "active" : ""} onClick={() => setSelectedId(log.id)}>
        <Database size={14} /><span><strong>{log.name}</strong><small>{log.enabled ? "Attivo" : "Disattivato"} · {log.tags.length} variabili · {formatSize(estimateHmiDataLogBytes(log))} max</small></span>
      </button>)}
      {!catalog.logs.length && <p className="resource-empty">Nessun archivio. Creane uno, aggiungi le variabili e salvalo: apparirà tra le sorgenti del Trend Control.</p>}
    </div>
    {selected && <section className="data-log-editor">
      <div className="data-log-editor-head"><strong>Configurazione archivio</strong><button type="button" onClick={removeLog} title="Elimina Data Log" aria-label={`Elimina ${selected.name}`}><Trash2 size={14} /></button></div>
      <label><span>Nome</span><input value={selected.name} onChange={(event) => patchLog({ name: event.target.value })} /></label>
      <label><span>Identificatore</span><input value={selected.id} onChange={(event) => patchLog({ id: identifier(event.target.value, selected.id) })} /></label>
      <div className="data-log-grid">
        <label><span>Conservazione (giorni)</span><input type="number" min="0.001" step="0.25" value={Number((selected.retentionMs / 86_400_000).toFixed(3))} onChange={(event) => patchLog({ retentionMs: Math.max(60_000, Number(event.target.value) * 86_400_000 || 60_000) })} /></label>
        <label><span>Segmento (ore)</span><input type="number" min="0.017" step="1" value={Number((selected.segmentDurationMs / 3_600_000).toFixed(3))} onChange={(event) => patchLog({ segmentDurationMs: Math.max(60_000, Number(event.target.value) * 3_600_000 || 60_000) })} /></label>
        <label><span>Campioni massimi</span><input type="number" min="100" step="100" value={selected.maxEntries} onChange={(event) => patchLog({ maxEntries: Math.max(100, Math.round(Number(event.target.value) || 100)) })} /></label>
        <label><span>Memoria stimata</span><output>{formatSize(estimateHmiDataLogBytes(selected))}</output></label>
      </div>
      <label><span>Persistenza Runtime</span><select value={selected.storage} onChange={(event) => patchLog({ storage: event.target.value as HmiDataLogDefinition["storage"] })}><option value="browser-local">Locale e persistente</option><option value="memory">Solo sessione</option></select></label>
      <label className="data-log-check"><input type="checkbox" checked={selected.enabled} onChange={(event) => patchLog({ enabled: event.target.checked })} /> Acquisizione abilitata</label>
      <div className="data-log-tags-head"><span><strong>VARIABILI ARCHIVIATE</strong><small>timestamp e quality code vengono conservati con il valore</small></span><button type="button" onClick={addTag}><Plus size={13} /> Aggiungi</button></div>
      <div className="data-log-tag-list">{selected.tags.map((tag) => <article key={tag.id} className="data-log-tag-card">
        <header><span><Database size={13} /><strong>{tag.name}</strong></span><button type="button" onClick={() => patchLog({ tags: selected.tags.filter((item) => item.id !== tag.id) })} aria-label={`Elimina ${tag.name}`}><Trash2 size={12} /></button></header>
        <label><span>Nome visualizzato</span><input value={tag.name} onChange={(event) => patchTag(tag.id, { name: event.target.value })} /></label>
        <label><span>Identificatore log</span><input value={tag.id} onChange={(event) => patchTag(tag.id, { id: identifier(event.target.value, tag.id) })} /></label>
        <label><span>Variabile PLC</span><input list="hmi-data-log-tags" value={tag.tag} onChange={(event) => patchTag(tag.id, { tag: event.target.value })} placeholder="es. Oven.Temperature" /></label>
        <label><span>Modalità</span><select value={tag.mode} onChange={(event) => patchTag(tag.id, { mode: event.target.value as HmiLoggingTagDefinition["mode"] })}><option value="on-change">Su variazione</option><option value="on-demand">Su richiesta / trigger</option><option value="cyclic">Ciclica</option></select></label>
        {tag.mode === "cyclic" && <><label><span>Ciclo logging (ms)</span><input type="number" min="500" step="100" value={tag.cycleMs} onChange={(event) => patchTag(tag.id, { cycleMs: Math.max(500, Math.round(Number(event.target.value) || 500)) })} /></label><label className="data-log-check"><input type="checkbox" checked={tag.includeUnchanged} onChange={(event) => patchTag(tag.id, { includeUnchanged: event.target.checked })} /> Registra anche valori invariati</label></>}
        {tag.mode === "on-demand" && <><label><span>Variabile trigger</span><input list="hmi-data-log-tags" value={tag.triggerTag ?? ""} onChange={(event) => patchTag(tag.id, { triggerTag: event.target.value || undefined })} placeholder="Vuoto se richiamata da script" /></label><div className="data-log-grid"><label><span>Condizione</span><select value={tag.triggerCondition ?? "changed"} onChange={(event) => patchTag(tag.id, { triggerCondition: event.target.value as HmiLoggingTagDefinition["triggerCondition"] })}><option value="changed">Cambia</option><option value="rising">Fronte salita</option><option value="falling">Fronte discesa</option><option value="equals">Uguale a</option></select></label>{tag.triggerCondition === "equals" && <label><span>Valore</span><input value={tag.triggerValue ?? "1"} onChange={(event) => patchTag(tag.id, { triggerValue: event.target.value })} /></label>}</div></>}
        <details><summary>Elaborazione campione</summary><div className="data-log-grid"><label><span>Media mobile (campioni)</span><input type="number" min="1" max="64" value={tag.smoothingSamples} onChange={(event) => patchTag(tag.id, { smoothingSamples: Math.max(1, Math.min(64, Math.round(Number(event.target.value) || 1))) })} /></label><label><span>Aggregazione</span><select value={tag.aggregation} onChange={(event) => patchTag(tag.id, { aggregation: event.target.value as HmiLoggingTagDefinition["aggregation"] })}><option value="none">Nessuna</option><option value="average">Media</option><option value="minimum">Minimo</option><option value="maximum">Massimo</option></select></label>{tag.aggregation !== "none" && <label><span>Finestra (s)</span><input type="number" min="0.5" step="0.5" value={tag.aggregationWindowMs / 1000} onChange={(event) => patchTag(tag.id, { aggregationWindowMs: Math.max(500, Number(event.target.value) * 1000 || 500) })} /></label>}<label><span>Limite minimo</span><input type="number" value={tag.minimum ?? ""} onChange={(event) => patchTag(tag.id, { minimum: event.target.value === "" ? undefined : Number(event.target.value) })} /></label><label><span>Limite massimo</span><input type="number" value={tag.maximum ?? ""} onChange={(event) => patchTag(tag.id, { maximum: event.target.value === "" ? undefined : Number(event.target.value) })} /></label></div></details>
      </article>)}</div>
      {!selected.tags.length && <p className="resource-empty">Aggiungi almeno una variabile. Per carichi normali conviene “Su variazione”; il ciclo minimo Unified è 500 ms.</p>}
    </section>}
    {issues.map((issue, index) => <div key={`${issue.logId}:${issue.loggedTagId}:${index}`} className={issue.severity === "error" ? "plc-error" : "data-log-warning"} role={issue.severity === "error" ? "alert" : undefined}><AlertTriangle size={13} /><span>{issue.message}</span></div>)}
    {error && <div className="plc-error" role="alert"><AlertTriangle size={13} /><span>{error}</span></div>}
    {saved && !dirty && <div className="plc-imported" role="status"><Check size={13} /><span>Data Log salvati e disponibili nel Runtime.</span></div>}
    <button className="resource-save" type="button" onClick={() => void save()} disabled={!project || saving || !dirty || hasErrors}><Save size={14} />{saving ? "Salvataggio…" : hasErrors ? "Correggi gli errori" : dirty ? "Salva Data Log" : "Data Log salvati"}</button>
  </div>;
}
