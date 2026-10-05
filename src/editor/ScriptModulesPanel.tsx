import { AlertTriangle, Braces, Check, Clock3, FastForward, Play, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { advanceHmiScheduler, createHmiSchedulerState, notifyHmiSchedulerAlarm, runHmiScheduledTask, type HmiSchedulerResult, type HmiSchedulerState } from "../core/hmiScheduler";
import {
  emptyHmiScriptCatalog,
  hmiScriptCatalogIssues,
  parseHmiScriptCatalog,
  serializeHmiScriptCatalog,
  type HmiScriptCatalog,
  type HmiScriptFunctionDefinition,
  type HmiScheduledTask,
  type HmiScheduledTaskTrigger,
} from "../core/hmiScriptModules";
import { joinProjectPath } from "../core/paths";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";

type Selection = { kind: "global" | "local" | "task"; owner: number; fn?: number };
const catalogName = "framecraft.scripts.json";

const uniqueAlias = (catalog: HmiScriptCatalog, base = "Utilities") => {
  const used = new Set(catalog.globalModules.map((item) => item.alias));
  let value = base;
  let suffix = 2;
  while (used.has(value)) value = `${base}${suffix++}`;
  return value;
};

const newFunction = (name = "NewFunction"): HmiScriptFunctionDefinition => ({
  name,
  parameters: ["value"],
  source: "return value;",
});

const newTask = (catalog: HmiScriptCatalog): HmiScheduledTask => {
  const used = new Set(catalog.scheduledTasks.map((item) => item.id));
  let index = catalog.scheduledTasks.length + 1;
  while (used.has(`task-${index}`)) index += 1;
  return { id: `task-${index}`, name: `Operazione ${index}`, enabled: true, trigger: { kind: "interval", intervalMs: 1000 }, script: 'HMIRuntime.Trace("Operazione pianificata");' };
};

const weekDays = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

const taskTriggerSummary = (trigger: HmiScheduledTaskTrigger): string => {
  if (trigger.kind === "interval") return `ogni ${trigger.intervalMs} ms`;
  if (trigger.kind === "once") return "una volta";
  if (trigger.kind === "tag") return `tag ${trigger.tag || "mancante"}`;
  if (trigger.kind === "alarm") return `allarme · ${trigger.criterion} ${trigger.condition} ${trigger.operand || "?"}`;
  const frequency = { daily: "ogni giorno", weekly: "ogni settimana", monthly: "ogni mese", yearly: "ogni anno" }[trigger.frequency];
  return `${frequency} · ${trigger.time}`;
};

export function ScriptModulesPanel() {
  const project = useEditorStore((state) => state.project);
  const stored = useEditorStore((state) => state.scriptCatalog);
  const refresh = useEditorStore((state) => state.refreshScriptCatalog);
  const simulation = useEditorStore((state) => state.simulation);
  const setSimulationOn = useEditorStore((state) => state.setSimulationOn);
  const setSimulationValue = useEditorStore((state) => state.setSimulationValue);
  const setSimulationStatus = useEditorStore((state) => state.setSimulationStatus);
  const currentRoute = useEditorStore((state) => state.pages.find((page) => page.id === state.activePageId)?.route ?? state.previewPath ?? "/");
  const [catalog, setCatalog] = useState<HmiScriptCatalog>(() => emptyHmiScriptCatalog());
  const [selection, setSelection] = useState<Selection>();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [scheduler, setScheduler] = useState<HmiSchedulerState>(() => createHmiSchedulerState(emptyHmiScriptCatalog()));
  const [schedulerLog, setSchedulerLog] = useState<string>();
  const [runningTask, setRunningTask] = useState(false);
  const [testAlarm, setTestAlarm] = useState({ alarmClass: "Warning", state: "Incoming", priority: 8, name: "Alarm_Test" });

  useEffect(() => {
    setCatalog(stored);
    setScheduler(createHmiSchedulerState(stored, Date.now(), simulation.values));
    setDirty(false); setSaved(false); setSchedulerLog(undefined);
  }, [stored]);
  const validated = useMemo(() => parseHmiScriptCatalog(catalog), [catalog]);
  const issues = useMemo(() => hmiScriptCatalogIssues(validated), [validated]);
  const owner = selection?.kind === "global" ? catalog.globalModules[selection.owner] : selection?.kind === "local" ? catalog.localDefinitions[selection.owner] : undefined;
  const fn = owner && selection?.fn !== undefined ? owner.functions[selection.fn] : undefined;
  const task = selection?.kind === "task" ? catalog.scheduledTasks[selection.owner] : undefined;
  const definitionError = selection?.kind === "global" ? validated.globalModules[selection.owner]?.globalDefinition?.error : selection?.kind === "local" ? validated.localDefinitions[selection.owner]?.globalDefinition?.error : undefined;
  const publicDefinition = selection?.kind === "global" ? validated.globalModules[selection.owner]?.globalDefinition?.program : undefined;
  const publicVariables = publicDefinition?.exports ?? [];

  const change = (next: HmiScriptCatalog) => {
    setCatalog(next);
    setScheduler((current) => createHmiSchedulerState(parseHmiScriptCatalog(next), current.now, simulation.values));
    setDirty(true); setSaved(false); setError(undefined); setSchedulerLog(undefined);
  };
  const replaceOwner = (next: typeof owner) => {
    if (!selection || !next) return;
    change(selection.kind === "global"
      ? { ...catalog, globalModules: catalog.globalModules.map((item, index) => index === selection.owner ? next as typeof item : item) }
      : { ...catalog, localDefinitions: catalog.localDefinitions.map((item, index) => index === selection.owner ? next as typeof item : item) });
  };
  const replaceFunction = (next: HmiScriptFunctionDefinition) => {
    if (!owner || selection?.fn === undefined) return;
    replaceOwner({ ...owner, functions: owner.functions.map((item, index) => index === selection.fn ? next : item) });
  };
  const addGlobal = () => {
    const alias = uniqueAlias(catalog);
    change({ ...catalog, globalModules: [...catalog.globalModules, { name: alias, alias, functions: [newFunction()] }] });
    setSelection({ kind: "global", owner: catalog.globalModules.length, fn: 0 });
  };
  const addLocal = () => {
    change({ ...catalog, localDefinitions: [...catalog.localDefinitions, { scope: currentRoute, context: "events", functions: [newFunction("PageFunction")] }] });
    setSelection({ kind: "local", owner: catalog.localDefinitions.length, fn: 0 });
  };
  const addTask = () => {
    change({ ...catalog, scheduledTasks: [...catalog.scheduledTasks, newTask(catalog)] });
    setSelection({ kind: "task", owner: catalog.scheduledTasks.length });
  };
  const replaceTask = (next: HmiScheduledTask) => {
    if (selection?.kind !== "task") return;
    change({ ...catalog, scheduledTasks: catalog.scheduledTasks.map((item, index) => index === selection.owner ? next : item) });
  };
  const replaceIntervalTrigger = (patch: Partial<Extract<HmiScheduledTaskTrigger, { kind: "interval" }>>) => {
    if (!task || task.trigger.kind !== "interval") return;
    replaceTask({ ...task, trigger: { ...task.trigger, ...patch } });
  };
  const replaceTagTrigger = (patch: Partial<Extract<HmiScheduledTaskTrigger, { kind: "tag" }>>) => {
    if (!task || task.trigger.kind !== "tag") return;
    replaceTask({ ...task, trigger: { ...task.trigger, ...patch } });
  };
  const replaceCalendarTrigger = (patch: Partial<Extract<HmiScheduledTaskTrigger, { kind: "calendar" }>>) => {
    if (!task || task.trigger.kind !== "calendar") return;
    replaceTask({ ...task, trigger: { ...task.trigger, ...patch } });
  };
  const replaceAlarmTrigger = (patch: Partial<Extract<HmiScheduledTaskTrigger, { kind: "alarm" }>>) => {
    if (!task || task.trigger.kind !== "alarm") return;
    replaceTask({ ...task, trigger: { ...task.trigger, ...patch } });
  };
  const removeOwner = () => {
    if (!selection || (!owner && !task) || !window.confirm(`Eliminare ${selection.kind === "global" ? "il modulo" : selection.kind === "local" ? "la definizione locale" : "l'operazione pianificata"}?`)) return;
    change(selection.kind === "global" ? { ...catalog, globalModules: catalog.globalModules.filter((_, index) => index !== selection.owner) }
      : selection.kind === "local" ? { ...catalog, localDefinitions: catalog.localDefinitions.filter((_, index) => index !== selection.owner) }
        : { ...catalog, scheduledTasks: catalog.scheduledTasks.filter((_, index) => index !== selection.owner) });
    setSelection(undefined);
  };
  const applySchedulerResult = (result: HmiSchedulerResult) => {
    setScheduler(result.state);
    let wrote = false;
    for (const execution of result.executions) {
      for (const [tag, value] of Object.entries(execution.result.writes)) { setSimulationValue(tag, value); wrote = true; }
      for (const [tag, status] of Object.entries(execution.result.tagStatus)) setSimulationStatus(tag, status);
    }
    if (wrote && !simulation.on) setSimulationOn(true);
    const last = result.executions.at(-1);
    setSchedulerLog(result.error ?? (last ? `${result.executions.length} esecuzioni · ultima: ${last.taskName}${last.result.error ? ` · ${last.result.error}` : ""}` : "Nessuna operazione scaduta."));
  };
  const runTask = async (taskId: string) => {
    setRunningTask(true); setError(undefined);
    try { applySchedulerResult(await runHmiScheduledTask(parseHmiScriptCatalog(catalog), scheduler, taskId, simulation.values, { tagStatus: simulation.status })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setRunningTask(false); }
  };
  const advanceClock = async (milliseconds: number) => {
    setRunningTask(true); setError(undefined);
    try { applySchedulerResult(await advanceHmiScheduler(parseHmiScriptCatalog(catalog), scheduler, scheduler.now + milliseconds, simulation.values, { tagStatus: simulation.status })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setRunningTask(false); }
  };
  const simulateAlarm = async () => {
    setRunningTask(true); setError(undefined);
    try { applySchedulerResult(await notifyHmiSchedulerAlarm(parseHmiScriptCatalog(catalog), scheduler, testAlarm, simulation.values, { tagStatus: simulation.status })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setRunningTask(false); }
  };
  const save = async () => {
    if (!project) return;
    setSaving(true); setError(undefined);
    try {
      const normalized = parseHmiScriptCatalog(catalog);
      const problems = hmiScriptCatalogIssues(normalized);
      if (problems.length) throw new Error(`Correggi i moduli prima di salvare: ${problems[0]}`);
      await desktopBridge.writeFile(joinProjectPath(project.root, catalogName), serializeHmiScriptCatalog(normalized));
      await refresh();
      setDirty(false); setSaved(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  };

  return <div className="panel-content script-panel">
    <div className="panel-title"><span>MODULI JAVASCRIPT</span><small>{catalog.globalModules.length + catalog.localDefinitions.length + catalog.scheduledTasks.length}</small></div>
    <p className="script-intro">Funzioni compilate nella sandbox HMI. Usa <code>Modules.Alias.Funzione()</code> ovunque e <code>Local.Funzione()</code> nella pagina e nel contesto scelti.</p>
    <div className="script-toolbar"><button onClick={addGlobal}><Plus size={13} /> Modulo globale</button><button onClick={addLocal}><Plus size={13} /> Definizione pagina</button><button onClick={addTask}><Clock3 size={13} /> Operazione pianificata</button></div>
    <div className="script-module-list">
      {catalog.globalModules.map((item, index) => <button key={`g:${index}`} className={selection?.kind === "global" && selection.owner === index ? "active" : ""} onClick={() => setSelection({ kind: "global", owner: index })}><Braces size={14} /><span><strong>{item.name}</strong><small>Modules.{item.alias} · {item.functions.length} funzioni</small></span></button>)}
      {catalog.localDefinitions.map((item, index) => <button key={`l:${index}`} className={selection?.kind === "local" && selection.owner === index ? "active" : ""} onClick={() => setSelection({ kind: "local", owner: index })}><Braces size={14} /><span><strong>{item.scope}</strong><small>Locale · {item.context === "events" ? "eventi" : "dinamizzazioni"} · {item.functions.length}</small></span></button>)}
      {catalog.scheduledTasks.map((item, index) => <button key={`t:${item.id}:${index}`} className={selection?.kind === "task" && selection.owner === index ? "active" : ""} onClick={() => setSelection({ kind: "task", owner: index })}><Clock3 size={14} /><span><strong>{item.name || "Operazione senza nome"}</strong><small>{item.enabled ? "Attiva" : "Disattivata"} · {taskTriggerSummary(item.trigger)}</small></span></button>)}
      {!catalog.globalModules.length && !catalog.localDefinitions.length && !catalog.scheduledTasks.length && <p className="resource-empty">Crea un modulo per riusare calcoli, oppure un'operazione pianificata per eseguire logica a tempo o al cambio di un tag.</p>}
    </div>
    {owner && selection && <section className="script-editor">
      <header><strong>{selection.kind === "global" ? "Modulo globale" : "Definizione locale"}</strong><button onClick={removeOwner} aria-label="Elimina modulo"><Trash2 size={13} /></button></header>
      {selection.kind === "global" ? <>
        <label><span>Nome</span><input value={(owner as typeof catalog.globalModules[number]).name} onChange={(event) => replaceOwner({ ...owner, name: event.target.value })} /></label>
        <label><span>Alias nello script</span><input value={(owner as typeof catalog.globalModules[number]).alias} onChange={(event) => replaceOwner({ ...owner, alias: event.target.value })} /></label>
      </> : <>
        <label><span>Pagina / route</span><input value={(owner as typeof catalog.localDefinitions[number]).scope} onChange={(event) => replaceOwner({ ...owner, scope: event.target.value })} /></label>
        <label><span>Contesto separato</span><select value={(owner as typeof catalog.localDefinitions[number]).context} onChange={(event) => replaceOwner({ ...owner, context: event.target.value as "events" | "dynamizations" })}><option value="events">Eventi</option><option value="dynamizations">Dinamizzazioni</option></select></label>
      </>}
      <div className="script-functions"><strong>FUNZIONI</strong>{owner.functions.map((item, index) => <button key={`${item.name}:${index}`} className={selection.fn === index ? "active" : ""} onClick={() => setSelection({ ...selection, fn: index })}>{item.name}{item.error ? <AlertTriangle size={11} /> : <Check size={11} />}</button>)}<button onClick={() => { replaceOwner({ ...owner, functions: [...owner.functions, newFunction(`Function${owner.functions.length + 1}`)] }); setSelection({ ...selection, fn: owner.functions.length }); }}><Plus size={11} /> Aggiungi</button></div>
      <details>
        <summary>Variabili condivise del {selection.kind === "global" ? "modulo" : "contesto pagina"}</summary>
        <label><span>Definizione globale</span><textarea aria-label="Definizione globale" aria-describedby={selection.kind === "global" ? "script-definition-help script-data-help script-public-help" : "script-definition-help script-data-help"} aria-invalid={Boolean(definitionError)} value={owner.globalDefinition?.source ?? ""} placeholder={selection.kind === "global" ? "export let count = 0; const step = 1;" : "let count = 0; const step = 1;"} spellCheck={false} onChange={(event) => replaceOwner({ ...owner, globalDefinition: { source: event.target.value } })} /></label>
        <p id="script-definition-help" className="script-intro">Dichiara valori con let, const o var, anche da calcoli e letture tag. Restano condivisi tra chiamate nello stesso contesto, non tra pagine o tra eventi e dinamizzazioni. Si azzerano al nuovo caricamento; azioni e timer vanno nelle funzioni.</p>
        <p id="script-data-help" className="script-intro">Array e oggetti annidati: <code>{"const cfg = { speed: 10, steps: [10, 20] };"}</code>. Leggi o modifica i membri con <code>cfg.steps[0]</code>; le funzioni ricevono questi dati per riferimento. <code>const</code> protegge il binding, non congela i membri. Per un valore PLC o una proprietà usa un membro scalare oppure <code>JSON.stringify(cfg)</code>. Raccolte fino a 1024 elementi, 32 livelli e JSON fino a 20000 caratteri, entro il budget dello script; prototipi, classi e funzioni come valori non sono supportati.</p>
        {selection.kind === "global" && <>
          <p id="script-public-help" className="script-intro">Usa <code>export let count = 0;</code> per rendere un valore leggibile come <code>Modules.{(owner as typeof catalog.globalModules[number]).alias}.count</code>. Dall'esterno il binding è in sola lettura: per cambiarlo chiama una funzione del modulo. Senza export la variabile resta privata.</p>
          {publicVariables.length ? <div className="script-public-variables" role="region" aria-label="Variabili pubbliche del modulo">
            <strong>Variabili pubbliche · {publicVariables.length}</strong>
            <ul>{publicVariables.map((entry) => <li key={entry.name}>
              <code>Modules.{(owner as typeof catalog.globalModules[number]).alias}.{entry.name}</code>
              <small>{publicDefinition?.statements.some((statement) => statement.kind === "declare" && statement.name === entry.local && statement.constant) ? "Costante" : "Variabile"} · sola lettura dall'esterno{entry.name !== entry.local ? ` · nome interno: ${entry.local}` : ""}</small>
            </li>)}</ul>
          </div> : !definitionError && <p className="script-intro">Nessuna variabile pubblica: le dichiarazioni senza export sono private del modulo.</p>}
        </>}
        {definitionError && <p role="alert">{definitionError}</p>}
      </details>
      {fn && <div className="script-function-editor">
        <label><span>Nome funzione</span><input value={fn.name} onChange={(event) => replaceFunction({ ...fn, name: event.target.value })} /></label>
        <label><span>Parametri, separati da virgola</span><input value={fn.parameters.join(", ")} onChange={(event) => replaceFunction({ ...fn, parameters: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
        <label><span>Corpo funzione</span><textarea aria-describedby="script-data-help" value={fn.source} spellCheck={false} onChange={(event) => replaceFunction({ ...fn, source: event.target.value })} /></label>
        <button className="script-remove-function" onClick={() => { replaceOwner({ ...owner, functions: owner.functions.filter((_, index) => index !== selection.fn) }); setSelection({ ...selection, fn: undefined }); }}><Trash2 size={12} /> Elimina funzione</button>
      </div>}
    </section>}
    {task && selection?.kind === "task" && <section className="script-editor script-task-editor">
      <header><strong>Operazione pianificata</strong><button onClick={removeOwner} aria-label="Elimina operazione"><Trash2 size={13} /></button></header>
      <details>
        <summary>Variabili condivise dello Scheduler</summary>
        <label><span>Definizione globale Scheduler</span><textarea aria-label="Definizione globale Scheduler" aria-describedby="script-scheduler-data-help" aria-invalid={Boolean(validated.schedulerDefinition?.error)} value={catalog.schedulerDefinition?.source ?? ""} placeholder="let executions = 0;" spellCheck={false} onChange={(event) => change({ ...catalog, schedulerDefinition: { source: event.target.value } })} /></label>
        <p id="script-scheduler-data-help" className="script-intro">Tutte le operazioni pianificate condividono questi valori, anche array e oggetti. Si inizializzano una volta all'avvio dello Scheduler, separatamente dagli script delle pagine. Usa un membro scalare o JSON.stringify per scrivere i dati in un tag; azioni e modifiche vanno nello script Update.</p>
        {validated.schedulerDefinition?.error && <p role="alert">{validated.schedulerDefinition.error}</p>}
      </details>
      <label className="script-task-enabled"><span>Attiva</span><input type="checkbox" checked={task.enabled} onChange={(event) => replaceTask({ ...task, enabled: event.target.checked })} /></label>
      <label><span>Nome</span><input value={task.name} onChange={(event) => replaceTask({ ...task, name: event.target.value })} /></label>
      <label><span>ID stabile</span><input value={task.id} onChange={(event) => replaceTask({ ...task, id: event.target.value.trim() })} /></label>
      <label><span>Trigger</span><select value={task.trigger.kind} onChange={(event) => {
        const date = new Date(scheduler.now + 60000);
        const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, "0")).join(":");
        const trigger: HmiScheduledTaskTrigger = event.target.value === "once" ? { kind: "once", at: date.toISOString() }
          : event.target.value === "tag" ? { kind: "tag", tag: "", condition: "changed" }
            : event.target.value === "calendar" ? { kind: "calendar", frequency: "daily", time }
              : event.target.value === "alarm" ? { kind: "alarm", criterion: "class", condition: "equals", operand: "Warning" }
                : { kind: "interval", intervalMs: 1000 };
        replaceTask({ ...task, trigger });
      }}><option value="interval">Ciclo dal Runtime</option><option value="calendar">Calendario</option><option value="once">Data e ora, una volta</option><option value="tag">Cambio tag</option><option value="alarm">Cambio allarme</option></select></label>
      {task.trigger.kind === "interval" && <><label><span>Intervallo (ms)</span><input type="number" min={1} step={1} value={task.trigger.intervalMs} onChange={(event) => replaceIntervalTrigger({ intervalMs: Number(event.target.value) })} /></label><label><span>Ritardo iniziale (ms)</span><input type="number" min={0} step={1} value={task.trigger.startDelayMs ?? task.trigger.intervalMs} onChange={(event) => replaceIntervalTrigger({ startDelayMs: Number(event.target.value) })} /></label></>}
      {task.trigger.kind === "once" && <label><span>Data e ora</span><input type="datetime-local" value={Number.isFinite(Date.parse(task.trigger.at)) ? new Date(task.trigger.at).toISOString().slice(0, 16) : ""} onChange={(event) => replaceTask({ ...task, trigger: { kind: "once", at: event.target.value ? new Date(event.target.value).toISOString() : "" } })} /></label>}
      {task.trigger.kind === "tag" && <><label><span>Tag trigger</span><input value={task.trigger.tag} onChange={(event) => replaceTagTrigger({ tag: event.target.value })} placeholder="Machine.State" /></label><label><span>Condizione</span><select value={task.trigger.condition} onChange={(event) => replaceTagTrigger({ condition: event.target.value as Extract<HmiScheduledTaskTrigger, { kind: "tag" }>["condition"] })}><option value="changed">Valore cambiato</option><option value="rising">Fronte di salita</option><option value="falling">Fronte di discesa</option><option value="equals">Uguale a</option></select></label>{task.trigger.condition === "equals" && <label><span>Valore</span><input value={task.trigger.value ?? ""} onChange={(event) => replaceTagTrigger({ value: event.target.value })} /></label>}</>}
      {task.trigger.kind === "calendar" && <>
        <label><span>Ricorrenza</span><select value={task.trigger.frequency} onChange={(event) => {
          const frequency = event.target.value as Extract<HmiScheduledTaskTrigger, { kind: "calendar" }>["frequency"];
          replaceTask({ ...task, trigger: { kind: "calendar", frequency, time: task.trigger.kind === "calendar" ? task.trigger.time : "00:00:00", ...(frequency === "weekly" ? { weekDay: new Date(scheduler.now).getDay() } : {}), ...(frequency === "monthly" || frequency === "yearly" ? { day: new Date(scheduler.now).getDate() } : {}), ...(frequency === "yearly" ? { month: new Date(scheduler.now).getMonth() + 1 } : {}) } });
        }}><option value="daily">Ogni giorno</option><option value="weekly">Ogni settimana</option><option value="monthly">Ogni mese</option><option value="yearly">Ogni anno</option></select></label>
        <label><span>Ora locale pannello</span><input type="time" step={1} value={task.trigger.time} onChange={(event) => replaceCalendarTrigger({ time: event.target.value })} /></label>
        {task.trigger.frequency === "weekly" && <label><span>Giorno</span><select value={task.trigger.weekDay ?? 1} onChange={(event) => replaceCalendarTrigger({ weekDay: Number(event.target.value) })}>{weekDays.map((label, value) => <option key={label} value={value}>{label}</option>)}</select></label>}
        {(task.trigger.frequency === "monthly" || task.trigger.frequency === "yearly") && <label><span>Giorno del mese</span><input type="number" min={1} max={31} step={1} value={task.trigger.day ?? 1} onChange={(event) => replaceCalendarTrigger({ day: Number(event.target.value) })} /></label>}
        {task.trigger.frequency === "yearly" && <label><span>Mese</span><select value={task.trigger.month ?? 1} onChange={(event) => replaceCalendarTrigger({ month: Number(event.target.value) })}>{months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label>}
      </>}
      {task.trigger.kind === "alarm" && <>
        <label><span>Criterio allarme</span><select value={task.trigger.criterion} onChange={(event) => replaceAlarmTrigger({ criterion: event.target.value as Extract<HmiScheduledTaskTrigger, { kind: "alarm" }>["criterion"] })}><option value="class">Classe</option><option value="state">Stato</option><option value="priority">Priorità</option></select></label>
        <label><span>Condizione</span><select value={task.trigger.condition} onChange={(event) => replaceAlarmTrigger({ condition: event.target.value as Extract<HmiScheduledTaskTrigger, { kind: "alarm" }>["condition"] })}><option value="equals">Uguale a</option><option value="not-equals">Diverso da</option><option value="greater">Maggiore di</option><option value="greater-or-equal">Maggiore o uguale</option><option value="less">Minore di</option><option value="less-or-equal">Minore o uguale</option></select></label>
        <label><span>Operando</span><input type={task.trigger.criterion === "priority" ? "number" : "text"} min={task.trigger.criterion === "priority" ? 0 : undefined} max={task.trigger.criterion === "priority" ? 16 : undefined} value={task.trigger.operand} onChange={(event) => replaceAlarmTrigger({ operand: event.target.value })} placeholder={task.trigger.criterion === "class" ? "Warning" : task.trigger.criterion === "state" ? "Incoming" : "8"} /></label>
      </>}
      <label><span>Script Update</span><textarea value={task.script} spellCheck={false} onChange={(event) => replaceTask({ ...task, script: event.target.value })} /></label>
      <button className="script-run-task" disabled={runningTask || issues.length > 0} onClick={() => void runTask(task.id)}><Play size={12} /> Prova ora</button>
    </section>}
    {catalog.scheduledTasks.length > 0 && <section className="script-scheduler-test">
      <div><Clock3 size={13} /><span>Tempo virtuale</span><strong>{new Date(scheduler.now).toLocaleString("it-IT")}</strong></div>
      <div><button disabled={runningTask || issues.length > 0} onClick={() => void advanceClock(1000)}><FastForward size={12} /> +1 s</button><button disabled={runningTask || issues.length > 0} onClick={() => void advanceClock(60000)}><FastForward size={12} /> +1 min</button><button disabled={runningTask || issues.length > 0} onClick={() => void advanceClock(3600000)}><FastForward size={12} /> +1 h</button><button disabled={runningTask || issues.length > 0} onClick={() => void advanceClock(86400000)}><FastForward size={12} /> +1 giorno</button></div>
      {catalog.scheduledTasks.some((item) => item.trigger.kind === "alarm") && <div className="script-alarm-test"><input aria-label="Classe allarme di prova" value={testAlarm.alarmClass} onChange={(event) => setTestAlarm({ ...testAlarm, alarmClass: event.target.value })} /><input aria-label="Stato allarme di prova" value={testAlarm.state} onChange={(event) => setTestAlarm({ ...testAlarm, state: event.target.value })} /><input aria-label="Priorità allarme di prova" type="number" min={0} max={16} value={testAlarm.priority} onChange={(event) => setTestAlarm({ ...testAlarm, priority: Number(event.target.value) })} /><button disabled={runningTask || issues.length > 0} onClick={() => void simulateAlarm()}><Play size={12} /> Simula allarme</button></div>}
      {schedulerLog && <small>{schedulerLog}</small>}
    </section>}
    {issues.length > 0 && <div className="plc-error" role="alert"><AlertTriangle size={13} /><span>{issues[0]}{issues.length > 1 ? ` (+${issues.length - 1})` : ""}</span></div>}
    {error && <div className="plc-error" role="alert"><AlertTriangle size={13} /><span>{error}</span></div>}
    {saved && !dirty && <div className="plc-imported" role="status"><Check size={13} /><span>Moduli compilati e salvati.</span></div>}
    <button className="resource-save" onClick={() => void save()} disabled={!project || saving || !dirty || issues.length > 0}><Save size={14} />{saving ? "Compilazione…" : dirty ? "Compila e salva" : "Moduli salvati"}</button>
  </div>;
}
