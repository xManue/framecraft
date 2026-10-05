import { AlertTriangle, CheckCircle2, ChevronRight, Cpu, FileSpreadsheet, Pencil, Play, Plus, RefreshCw, Save, Search, ShieldCheck, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectPlcVariables, isPlcVariableName, mergePlcVariables, parsePlcCatalog, plcVariableIssues, renamePlcVariableUsage, serializePlcCatalog, type PlcVariableDefinition } from "../core/plcVariables";
import { describeHmiIssues } from "../core/hmiValidation";
import { mergeImportedVariables, plcVariablesFromSheet, tagSheetOf } from "../core/tagImport";
import { readWorkbook } from "../core/workbook";
import { joinProjectPath } from "../core/paths";
import type { FileEntry } from "../core/types";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";
import { simulationTags } from "../core/plcSimulation";
import { hmiEventsAttribute, parseHmiEvents } from "../core/hmiEvents";
import { inspectHmiScript, inspectHmiScriptProgram } from "../core/hmiScript";
import { hmiScriptFunctions, hmiScriptGlobalDefinition, hmiScriptVariables } from "../core/hmiScriptModules";
import { hmiTrendAttribute, parseHmiTrendConfig } from "../core/hmiTrend";
import { hmiFunctionTrendAttribute, parseHmiFunctionTrendConfig } from "../core/hmiFunctionTrend";

const emptyVariable: PlcVariableDefinition = { name: "", dataType: "", access: "read", address: "", description: "" };
const plcTypes = ["BOOL", "BYTE", "WORD", "DWORD", "INT", "DINT", "LINT", "REAL", "LREAL", "STRING", "TIME", "DATE_AND_TIME"];

function containsFile(entries: FileEntry[], name: string): boolean {
  return entries.some((entry) => entry.name === name || Boolean(entry.children && containsFile(entry.children, name)));
}

const catalogName = "framecraft.plc.json";

export function PlcVariablesPanel() {
  const project = useEditorStore((state) => state.project);
  const [variables, setVariables] = useState<PlcVariableDefinition[]>([]);
  const [query, setQuery] = useState("");
  const [editingName, setEditingName] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<PlcVariableDefinition>(emptyVariable);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogExists, setCatalogExists] = useState(false);
  const [error, setError] = useState<string>();
  const [imported, setImported] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const refreshCatalog = useEditorStore((state) => state.refreshPlcVariables);
  const checkProject = useEditorStore((state) => state.checkHmiProject);
  const issues = useEditorStore((state) => state.hmiIssues);
  const simulation = useEditorStore((state) => state.simulation);
  const document = useEditorStore((state) => state.document);
  const dataLogCatalog = useEditorStore((state) => state.dataLogCatalog);
  const scriptCatalog = useEditorStore((state) => state.scriptCatalog);
  const previewPath = useEditorStore((state) => state.previewPath);
  const setSimulationOn = useEditorStore((state) => state.setSimulationOn);
  const setSimulationValue = useEditorStore((state) => state.setSimulationValue);
  const setSimulationStatus = useEditorStore((state) => state.setSimulationStatus);
  const openFile = useEditorStore((state) => state.openFile);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  const load = useCallback(async (forceCatalog = false) => {
    if (!project) return;
    setLoading(true);
    setError(undefined);
    try {
      const sourcePairs = await Promise.all(project.entryFiles.map(async (file) => {
        try { return [file, await desktopBridge.readFile(file)] as const; } catch { return [file, ""] as const; }
      }));
      const exists = containsFile(project.files, catalogName) || catalogExists || forceCatalog;
      let catalog: PlcVariableDefinition[] = [];
      if (exists) catalog = parsePlcCatalog(await desktopBridge.readFile(joinProjectPath(project.root, catalogName)));
      setCatalogExists(exists);
      setVariables(mergePlcVariables(catalog, detectPlcVariables(Object.fromEntries(sourcePairs))));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoading(false); }
  }, [catalogExists, project]);

  useEffect(() => { void load(); }, [project?.root]);

  const filtered = useMemo(() => variables.filter((variable) =>
    `${variable.name} ${variable.dataType} ${variable.address} ${variable.description} ${variable.table ?? ""}`.toLowerCase().includes(query.toLowerCase())), [query, variables]);
  const readyCount = variables.filter((variable) => !plcVariableIssues(variable).length).length;
  const reviewCount = variables.length - readyCount;

  const edit = (variable: PlcVariableDefinition) => {
    setAdding(false);
    setEditingName(variable.name);
    setDraft({ ...variable });
  };

  const closeEditor = () => { setAdding(false); setEditingName(undefined); setDraft(emptyVariable); setError(undefined); };

  /** Writes the catalog, creating it the first time. Every change goes through here, so the
   * pickers in the inspector never keep offering the list from before. */
  const writeCatalog = useCallback(async (next: PlcVariableDefinition[]) => {
    if (!project) return;
    const content = serializePlcCatalog(next);
    if (catalogExists) await desktopBridge.writeFile(joinProjectPath(project.root, catalogName), content);
    else { await desktopBridge.createFile(catalogName, content); setCatalogExists(true); }
    await refreshCatalog();
  }, [catalogExists, project, refreshCatalog]);

  /** Reads a tag export straight from the panel that produced it: the file is picked in the
   * system dialog and its bytes are read here, without a copy into the project first. */
  const importWorkbook = async (file: File) => {
    setError(undefined);
    setImported(undefined);
    setSaving(true);
    try {
      const sheets = await readWorkbook(await file.arrayBuffer());
      const sheet = tagSheetOf(sheets);
      if (!sheet) throw new Error("Nessun foglio con una colonna «Name»: controlla di aver esportato le variabili HMI.");
      const result = plcVariablesFromSheet(sheet);
      if (!result.variables.length) throw new Error(result.withoutPlcTag
        ? `Nessuna delle ${result.withoutPlcTag} variabili di «${sheet.name}» ha un PLC tag: non c’è niente da collegare.`
        : `Il foglio «${sheet.name}» non contiene variabili leggibili.`);
      const merged = mergeImportedVariables(variables.filter((variable) => !variable.detected), result.variables);
      await writeCatalog(merged.variables);
      setImported(`${result.variables.length} variabili con PLC tag da «${sheet.name}»: ${merged.added} nuove, ${merged.updated} aggiornate`
        + `${result.withoutPlcTag ? ` · ${result.withoutPlcTag} senza PLC tag escluse` : ""}`
        + `${result.skipped.length ? ` · ${result.skipped.length} nomi non validi ignorati` : ""}.`);
      await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  };

  const persist = async () => {
    if (!project) return;
    const name = draft.name.trim();
    if (!isPlcVariableName(name)) { setError("Usa un nome come Alarms_Trigger oppure Machine.Speed."); return; }
    if (variables.some((variable) => variable.name === name && variable.name !== editingName)) { setError("Esiste già una variabile PLC con questo nome."); return; }
    setSaving(true);
    setError(undefined);
    try {
      const nextVariable = { ...draft, name, dataType: draft.dataType.trim(), address: draft.address.trim(), description: draft.description.trim(), detected: false };
      if (editingName && editingName !== name && draft.usages?.length) {
        for (const file of new Set(draft.usages.map((usage) => usage.file))) {
          const source = await desktopBridge.readFile(file);
          const renamed = renamePlcVariableUsage(source, editingName, name);
          if (renamed !== source) await desktopBridge.writeFile(file, renamed);
        }
      }
      const next = editingName ? variables.map((variable) => variable.name === editingName ? nextVariable : variable) : [...variables, nextVariable];
      await writeCatalog(next);
      closeEditor();
      await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  };

  // L'anteprima trova i tag delle dinamizzazioni; il documento completa l'elenco con quelli letti o
  // scritti dagli eventi. In questo modo anche uno script senza animazioni resta simulabile.
  const simulatedTags = useMemo(
    () => {
      const publicVariables = hmiScriptVariables(scriptCatalog);
      const dynamics = hmiScriptFunctions(scriptCatalog, previewPath, "dynamizations");
      const dynamicDefinition = hmiScriptGlobalDefinition(scriptCatalog, previewPath, "dynamizations")?.program;
      const events = hmiScriptFunctions(scriptCatalog, previewPath, "events");
      const eventDefinition = hmiScriptGlobalDefinition(scriptCatalog, previewPath, "events")?.program;
      const tags = new Set(simulationTags(simulation.elements.flatMap((element) => element.dynamizations), dynamics, dynamicDefinition, publicVariables));
      for (const node of Object.values(document?.nodes ?? {})) {
        for (const binding of parseHmiEvents(node.props[hmiEventsAttribute])) {
          const inspection = inspectHmiScript(binding.script, events, eventDefinition, [], publicVariables);
          inspection.tagsRead.forEach((tag) => tags.add(tag));
          inspection.tagsWritten.forEach((tag) => tags.add(tag));
        }
        for (const trend of parseHmiTrendConfig(node.props[hmiTrendAttribute])?.trends ?? []) if (trend.source === "online" && trend.tag) tags.add(trend.tag);
        for (const trend of parseHmiFunctionTrendConfig(node.props[hmiFunctionTrendAttribute])?.trends ?? []) for (const source of [trend.x, trend.y]) if (source.source === "online" && source.tag) tags.add(source.tag);
      }
      const schedulerActive = scriptCatalog.scheduledTasks.some((task) => task.enabled);
      for (const definition of [...scriptCatalog.globalModules.map((module) => module.globalDefinition?.program), eventDefinition, dynamicDefinition, ...(schedulerActive ? [scriptCatalog.schedulerDefinition?.program] : [])]) if (definition) {
        const inspection = inspectHmiScriptProgram(definition, undefined, undefined, [], publicVariables);
        inspection.tagsRead.forEach((tag) => tags.add(tag));
      }
      const schedulerFunctions = hmiScriptFunctions(scriptCatalog);
      for (const task of scriptCatalog.scheduledTasks.filter((task) => task.enabled)) {
        const inspection = inspectHmiScript(task.script, schedulerFunctions, scriptCatalog.schedulerDefinition?.program, [], publicVariables);
        inspection.tagsRead.forEach((tag) => tags.add(tag));
        inspection.tagsWritten.forEach((tag) => tags.add(tag));
        if (task.trigger.kind === "tag" && task.trigger.tag) tags.add(task.trigger.tag);
      }
      for (const log of dataLogCatalog.logs.filter((log) => log.enabled)) for (const logged of log.tags) { if (logged.tag) tags.add(logged.tag); if (logged.mode === "on-demand" && logged.triggerTag) tags.add(logged.triggerTag); }
      return [...tags].sort();
    },
    [document, simulation.elements, dataLogCatalog, scriptCatalog, previewPath],
  );

  const qualityLabel = (qualityCode: number) => {
    const quality = qualityCode & 0xc0;
    if (quality === 192) return "Buona · cascata";
    if (quality === 128) return "Buona";
    if (quality === 64) return "Incerta";
    return "Non valida";
  };

  const editing = adding || editingName !== undefined;
  return <div className="panel-content plc-panel">
    <div className="panel-title"><span>VARIABILI PLC</span><small>{variables.length}</small></div>
    <div className="plc-summary"><Cpu size={17} /><span><strong>Catalogo segnali</strong><small>{reviewCount ? `${reviewCount} da completare · ${readyCount} pronti` : `${readyCount} pronti per il mapping`}</small></span><button onClick={() => void load()} disabled={loading} aria-label="Aggiorna variabili PLC" title="Rileggi progetto"><RefreshCw className={loading ? "spin" : ""} size={14} /></button></div>
    {/* Il controllo sta qui perche' quasi tutto quello che trova e' un tag: un campo senza segnale,
        un tag che il catalogo non conosce, una dinamica che non dice da dove prende il valore. */}
    <div className="plc-check">
      <button className="plc-check-run" onClick={() => { setChecking(true); void checkProject().finally(() => { setChecking(false); setChecked(true); }); }} disabled={!project || checking}>
        <ShieldCheck size={14} />{checking ? "Controllo in corso…" : "Controlla il pannello"}
      </button>
      {checked && !checking && <small>{describeHmiIssues(issues)}</small>}
      {Boolean(issues.length) && !checking && <div className="plc-check-list">
        {issues.slice(0, 200).map((issue) => (
          <button key={`${issue.file}:${issue.line}:${issue.kind}:${issue.message}`} className={issue.severity} onClick={() => void openFile(issue.file)} title={issue.file}>
            <AlertTriangle size={12} /><span>{issue.message}</span>
          </button>
        ))}
        {issues.length > 200 && <small>e altri {issues.length - 200}.</small>}
      </div>}
    </div>
    {/* La simulazione: si scrive un valore e si guarda la pagina, senza collegare un PLC. Le regole
        sono quelle del `ValueConverter` dello standard, e quello che non si puo' risolvere lo dice. */}
    <div className="plc-sim">
      <button className={`plc-sim-run ${simulation.on ? "on" : ""}`} onClick={() => setSimulationOn(!simulation.on)} disabled={!project}>
        {simulation.on ? <Square size={14} /> : <Play size={14} />}{simulation.on ? "Ferma la simulazione" : "Simula stati PLC"}
      </button>
      {simulation.on && <>
        <small>
          {simulatedTags.length
            ? `${simulatedTags.length} tag usati dalla pagina, dagli script o dai Data Log. Scrivi un valore oppure un array JSON come [10,20,30] per provare le curve X/Y.`
            : "Questa pagina e i Data Log non usano ancora tag nelle animazioni, negli eventi o nei trend."}
        </small>
        {simulatedTags.map((tag) => <div className="plc-sim-tag" key={tag}>
          <label className="plc-sim-row">
            <span title={tag}>{tag}</span>
            <input aria-label={`Valore simulato ${tag}`} value={simulation.values[tag] ?? ""} onChange={(event) => setSimulationValue(tag, event.target.value)} placeholder="valore o [10,20,30]" inputMode="text" />
          </label>
          <details className="plc-sim-status">
            <summary><ChevronRight size={12} /><span>Qualità e timestamp</span><small>{qualityLabel(simulation.status[tag]?.qualityCode ?? 192)}</small></summary>
            <div>
              <label><span>Qualità lettura</span><select aria-label={`Qualità ${tag}`} value={simulation.status[tag]?.qualityCode ?? 192}
                onChange={(event) => setSimulationStatus(tag, { qualityCode: Number(event.target.value) })}>
                <option value={192}>Buona · Good cascade (192)</option><option value={128}>Buona · Good (128)</option><option value={64}>Incerta · Uncertain (64)</option><option value={0}>Non valida · Bad (0)</option>
              </select></label>
              <label><span>Data e ora campione</span><input type="datetime-local" aria-label={`Data e ora campione ${tag}`} value={String(simulation.status[tag]?.timeStamp ?? "")}
                onChange={(event) => setSimulationStatus(tag, { timeStamp: event.target.value || 0 })} /></label>
              <small>Usati dagli script WinCC come QualityCode e TimeStamp.</small>
            </div>
          </details>
        </div>)}
        {Boolean(simulation.unresolved.length) && <div className="plc-sim-notes">
          {simulation.unresolved.slice(0, 20).map((item) => (
            <small key={`${item.property}|${item.reason}`}><em>{item.property}</em>{item.reason}</small>
          ))}
        </div>}
      </>}
    </div>
    <p className="panel-help">Nomi usati dall’HMI, tipo, accesso e indirizzo reale. Il pulsante col foglio di calcolo importa l’export .xlsx del pannello: entrano solo le variabili che hanno un PLC tag.</p>
    <div className="plc-tools">
      <label className="search-field"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca tag, tabella o indirizzo" /></label>
      <button onClick={() => fileInput.current?.click()} disabled={!project || saving} aria-label="Importa variabili da Excel" title="Importa l’export .xlsx delle variabili HMI"><FileSpreadsheet size={15} /></button>
      <button onClick={() => { setAdding(true); setEditingName(undefined); setDraft(emptyVariable); setError(undefined); }} aria-label="Aggiungi variabile PLC" title="Aggiungi variabile"><Plus size={15} /></button>
      <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importWorkbook(file);
        }} />
    </div>
    {imported && <div className="plc-imported" role="status"><CheckCircle2 size={13} /><span>{imported}</span></div>}
    {error && <div className="plc-error" role="alert"><AlertTriangle size={13} /><span>{error}</span></div>}
    {editing && <div className="plc-editor">
      <div className="plc-editor-heading"><strong>{adding ? "Nuova variabile" : "Modifica variabile"}</strong><button onClick={closeEditor} aria-label="Chiudi modifica"><X size={14} /></button></div>
      <label><span>Nome logico</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Machine.Speed" /></label>
      <div className="plc-editor-pair">
        <label><span>Tipo PLC</span><select value={draft.dataType} onChange={(event) => setDraft({ ...draft, dataType: event.target.value })}><option value="">Da definire</option>{draft.dataType && !plcTypes.includes(draft.dataType) && <option value={draft.dataType}>{draft.dataType}</option>}{plcTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label><span>Accesso</span><select value={draft.access} onChange={(event) => setDraft({ ...draft, access: event.target.value as PlcVariableDefinition["access"] })}><option value="read">Lettura</option><option value="write">Scrittura</option><option value="read-write">Lettura/scrittura</option></select></label>
      </div>
      <label><span>Indirizzo PLC / NodeId</span><input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} placeholder="ns=3;s=... oppure DB..." /></label>
      <label><span>Descrizione</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Uso della variabile nel pannello" /></label>
      <button className="plc-save" onClick={() => void persist()} disabled={saving}><Save size={14} />{saving ? "Salvataggio…" : "Salva nel catalogo"}</button>
    </div>}
    <div className="plc-list">
      {filtered.map((variable) => {
        const issues = plcVariableIssues(variable);
        return <button key={variable.name} className={`plc-row ${issues.length ? "needs-review" : "ready"}`} onClick={() => edit(variable)}>
          <span className="plc-status">{issues.length ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}</span>
          <span className="plc-row-main"><strong>{variable.name}</strong><small>{variable.address || variable.description || issues.join(" · ")}</small><span><em>{variable.dataType || "TIPO?"}</em>{variable.table && <em>{variable.table}</em>}<em>{variable.access}</em>{variable.usages?.length ? <em>{variable.usages.length} usi</em> : <em>non usata</em>}</span></span>
          <Pencil size={12} />
        </button>;
      })}
      {!filtered.length && <div className="plc-empty"><Cpu size={20} /><span>{variables.length ? "Nessun risultato" : "Nessuna variabile PLC rilevata"}</span><small>Aggiungila oppure usa hmi.value(“Machine.Speed”) nel progetto.</small></div>}
    </div>
  </div>;
}
