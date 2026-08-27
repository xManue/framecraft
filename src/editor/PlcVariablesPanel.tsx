import { AlertTriangle, CheckCircle2, Cpu, Pencil, Plus, RefreshCw, Save, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { detectPlcVariables, mergePlcVariables, parsePlcCatalog, plcVariableIssues, renamePlcVariableUsage, serializePlcCatalog, type PlcVariableDefinition } from "../core/plcVariables";
import { joinProjectPath } from "../core/paths";
import type { FileEntry } from "../core/types";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";

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
    `${variable.name} ${variable.dataType} ${variable.address} ${variable.description}`.toLowerCase().includes(query.toLowerCase())), [query, variables]);
  const readyCount = variables.filter((variable) => !plcVariableIssues(variable).length).length;
  const reviewCount = variables.length - readyCount;

  const edit = (variable: PlcVariableDefinition) => {
    setAdding(false);
    setEditingName(variable.name);
    setDraft({ ...variable });
  };

  const closeEditor = () => { setAdding(false); setEditingName(undefined); setDraft(emptyVariable); setError(undefined); };

  const persist = async () => {
    if (!project) return;
    const name = draft.name.trim();
    if (!/^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+$/.test(name)) { setError("Usa un nome logico come Machine.Speed o Commands.Start."); return; }
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
      const content = serializePlcCatalog(next);
      if (catalogExists) await desktopBridge.writeFile(joinProjectPath(project.root, catalogName), content);
      else { await desktopBridge.createFile(catalogName, content); setCatalogExists(true); }
      closeEditor();
      await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  };

  const editing = adding || editingName !== undefined;
  return <div className="panel-content plc-panel">
    <div className="panel-title"><span>VARIABILI PLC</span><small>{variables.length}</small></div>
    <div className="plc-summary"><Cpu size={17} /><span><strong>Catalogo segnali</strong><small>{reviewCount ? `${reviewCount} da completare · ${readyCount} pronti` : `${readyCount} pronti per il mapping`}</small></span><button onClick={() => void load()} disabled={loading} aria-label="Aggiorna variabili PLC" title="Rileggi progetto"><RefreshCw className={loading ? "spin" : ""} size={14} /></button></div>
    <p className="panel-help">Nomi logici usati dall’HMI, tipo PLC, accesso e indirizzo reale. Nessun binding React.</p>
    <div className="plc-tools">
      <label className="search-field"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca tag o indirizzo" /></label>
      <button onClick={() => { setAdding(true); setEditingName(undefined); setDraft(emptyVariable); setError(undefined); }} aria-label="Aggiungi variabile PLC" title="Aggiungi variabile"><Plus size={15} /></button>
    </div>
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
          <span className="plc-row-main"><strong>{variable.name}</strong><small>{variable.address || issues.join(" · ")}</small><span><em>{variable.dataType || "TIPO?"}</em><em>{variable.access}</em>{variable.usages?.length ? <em>{variable.usages.length} usi</em> : <em>non usata</em>}</span></span>
          <Pencil size={12} />
        </button>;
      })}
      {!filtered.length && <div className="plc-empty"><Cpu size={20} /><span>{variables.length ? "Nessun risultato" : "Nessuna variabile PLC rilevata"}</span><small>Aggiungila oppure usa hmi.value(“Machine.Speed”) nel progetto.</small></div>}
    </div>
  </div>;
}
