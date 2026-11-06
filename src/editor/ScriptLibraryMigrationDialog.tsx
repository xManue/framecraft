import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { HmiScriptCatalog } from '../core/hmiScriptModules';
import { scriptLibraryInterfaceChanges, type ScriptLibraryPlan, type ScriptLibraryReview } from '../core/scriptLibrary';
import { chooseLibraryMigrationTarget, initialLibraryMigrationChoices, libraryMigrationPageScopes, libraryMigrationRules, libraryMigrationTargets, type LibraryArgumentChoice, type LibraryMappingChoice } from '../core/scriptLibraryMigration';
import { previewScriptProjectMigration } from '../core/scriptMigrationClient';
import type { ScriptProjectMigration } from '../core/scriptProjectMigration';
import type { ScriptMigrationSnapshot } from '../core/scriptMigrationTransaction';
import { desktopBridge } from '../filesystem/desktopBridge';
import { useEditorStore } from '../state/editorStore';
import { applyScriptMigrationFiles, refreshScriptMigrationFiles, scriptMigrationNativeError } from '../state/editorScriptMigration';
import { hasUnsavedScriptModules, subscribeScriptDrafts } from '../state/scriptDraftState';
import './script-library.css';
import './script-library-migration.css';
export interface ScriptLibraryMigrationRequest {
  catalog: HmiScriptCatalog;
  plan: ScriptLibraryPlan;
  review: ScriptLibraryReview;
}
export function ScriptLibraryMigrationDialog({
  catalog,
  plan,
  review,
  onClose,
  onRecover,
  onUpdateRuntime
}: ScriptLibraryMigrationRequest & {
  onClose(): void;
  onRecover(): void;
  onUpdateRuntime(): void;
}) {
  const project = useEditorStore(s => s.project),
    pages = useEditorStore(s => s.pages),
    dirty = useEditorStore(s => s.dirty),
    unavailable = useEditorStore(s => s.loading || s.exporting || s.previewRestarting || !!s.reloadRecovery || !!s.highlightPicker || s.interactionMode !== 'edit');
  const scriptDirty = useSyncExternalStore(subscribeScriptDrafts, hasUnsavedScriptModules, () => false);
  const [initial] = useState(project),
    [changes] = useState(() => scriptLibraryInterfaceChanges(catalog, plan.next));
  const [choices, setChoices] = useState<LibraryMappingChoice[]>(() => initialLibraryMigrationChoices(changes, plan.next)),
    [snapshot, setSnapshot] = useState<ScriptMigrationSnapshot>(),
    [scopes, setScopes] = useState<Record<string, string[]>>({}),
    [scopeFiles, setScopeFiles] = useState<string[]>([]);
  const [phase, setPhase] = useState<'loading' | 'mapping' | 'checking' | 'review' | 'saving' | 'done' | 'error'>('loading'),
    [result, setResult] = useState<ScriptProjectMigration>(),
    [error, setError] = useState(''),
    [selected, setSelected] = useState(''),
    [checked, setChecked] = useState(false),
    [engine, setEngine] = useState(false),
    [contexts, setContexts] = useState(false),
    [stopped, setStopped] = useState(false),
    [receipt, setReceipt] = useState('');
  const title = useId(),
    dialog = useRef<HTMLElement>(null),
    mounted = useRef(true),
    sequence = useRef(0),
    controller = useRef<AbortController | undefined>(undefined),
    phaseRef = useRef(phase),
    close = useRef(onClose);
  phaseRef.current = phase;
  close.current = onClose;
  const busy = phase === 'saving',
    stale = project?.root !== initial?.root,
    current = (id: number) => mounted.current && sequence.current === id && useEditorStore.getState().project?.root === initial?.root;
  const invalidate = () => {
    sequence.current++;
    controller.current?.abort();
    setResult(undefined);
    setChecked(false);
    setEngine(false);
    setContexts(false);
    setStopped(false);
    setError('');
    setPhase('mapping');
  };
  const read = async () => {
    if (!initial) return;
    const id = ++sequence.current;
    controller.current?.abort();
    setPhase('loading');
    setResult(undefined);
    setSnapshot(undefined);
    setError('');
    setChecked(false);
    setStopped(false);
    setReceipt('');
    try {
      const next = await desktopBridge.readScriptMigration(initial.root, false);
      if (!current(id)) return;
      setSnapshot(next);
      setScopes(libraryMigrationPageScopes(next.files, useEditorStore.getState().pages, initial.root));
      setScopeFiles([]);
      setPhase('mapping');
    } catch (cause) {
      if (current(id)) {
        setError(scriptMigrationNativeError(cause).message);
        setPhase('error');
      }
    }
  };
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const timer = setTimeout(() => void read(), 0);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (phaseRef.current !== 'saving') close.current();
      }
      if (event.key === 'Tab') {
        const list = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])') ?? [])].filter(el => el.getClientRects().length);
        const first = list[0],
          last = list.at(-1);
        if (!list.length) {
          event.preventDefault();
          return;
        }
        if (!dialog.current?.contains(document.activeElement) || event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      sequence.current++;
      controller.current?.abort();
      document.removeEventListener('keydown', key, true);
      previous?.focus();
    };
  }, []);
  const pending = snapshot?.backups.some(b => !['completed', 'restored', 'rolled-back'].includes(b.state)),
    ready = !!snapshot?.token && snapshot.runtimeReady && !pending && !stale;
  const compare = async () => {
    if (!snapshot || !ready || busy) return;
    const id = ++sequence.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setError('');
    setResult(undefined);
    setChecked(false);
    setEngine(false);
    setContexts(false);
    setStopped(false);
    setPhase('checking');
    try {
      const mappings = libraryMigrationRules(changes, plan.next, choices),
        next = await previewScriptProjectMigration({
          files: snapshot.files,
          catalog: plan.next,
          mappings,
          scopes,
          library: {
            catalog,
            plan,
            review
          }
        }, abort.signal);
      if (!current(id)) return;
      setResult(next);
      setSelected(next.changes[0]?.path ?? '');
      setScopeFiles(old => [...new Set([...old, ...next.issues.filter(issue => /contesto|scope|Local\./i.test(issue.message)).map(issue => issue.path).filter(path => Object.hasOwn(snapshot.files, path) && path !== 'framecraft.scripts.json')])]);
      setPhase(next.issues.length ? 'mapping' : 'review');
    } catch (cause) {
      if (current(id)) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setPhase('mapping');
      }
    }
  };
  const apply = async () => {
    if (!snapshot || !result || !initial || phase !== 'review' || !checked || !stopped || scopeFiles.length && !contexts || result.previousVersions.some(v => v < 9) && !engine || dirty || scriptDirty || unavailable || stale) return;
    const id = ++sequence.current;
    setPhase('saving');
    setError('');
    let saved = false;
    try {
      const backup = await applyScriptMigrationFiles(initial.root, snapshot, result, stopped, () => current(id));
      saved = true;
      if (current(id)) setReceipt(backup);
      await refreshScriptMigrationFiles(initial.root, result.changes.map(c => c.path));
      if (current(id)) setPhase('done');
    } catch (cause) {
      if (current(id)) {
        setPhase(saved ? 'done' : 'error');
        if (!saved) {
          setSnapshot(undefined);
          setResult(undefined);
        }
        setError(saved ? 'I file sono stati aggiornati e il backup è conservato, ma l’editor non è riuscito a rileggerli. Conserva le eventuali bozze e riapri il progetto. Dettagli: ' + String(cause) : scriptMigrationNativeError(cause).message + ' Rileggi il progetto per un nuovo confronto; se la migrazione è rimasta interrotta, apri il recupero.');
      }
    }
  };
  const diff = result?.changes.find(c => c.path === selected),
    scopeOptions = [...new Set(['', ...pages.map(p => p.route), ...plan.next.localDefinitions.filter(d => d.context === 'dynamizations').map(d => d.scope)])].sort();
  const argument = (row: number, index: number, value: LibraryArgumentChoice) => {
    invalidate();
    setChoices(old => old.map((choice, r) => r === row ? {
      ...choice,
      arguments: choice.arguments.map((arg, i) => i === index ? value : arg)
    } : choice));
  };
  const label = (path: string) => {
    const page = pages.find(p => scopes[path]?.includes(p.route));
    return page ? `${page.name} · ${path}` : path;
  };
  return createPortal(<div className="script-library-overlay"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title} className="script-library-dialog script-library-migration"><header><div><h2 id={title}>Aggiorna libreria nel progetto</h2><p>{plan.library} · versione {plan.version} · collega le interfacce, poi controlla i file.</p></div><button aria-label="Chiudi aggiornamento libreria" disabled={busy} onClick={onClose}><X size={18} /></button></header><main aria-busy={phase === 'loading' || phase === 'checking' || busy}>
 {phase === 'loading' && <p role="status">Lettura dei sorgenti del progetto…</p>}{phase === 'checking' && <p role="status">Controllo di pagine, eventi, dinamizzazioni, moduli e operazioni pianificate…</p>}{error && <p role="alert" className="script-library-error">{error}</p>}
 {stale && <p role="alert">Il progetto è cambiato. Chiudi e riapri la libreria nel progetto corrente.</p>}
 {(dirty || scriptDirty) && <p role="alert">Salva prima la pagina e i moduli script modificati, poi riapri la libreria.</p>}
 {pending && <p role="alert">Una migrazione precedente deve essere recuperata prima di aggiornare. <button onClick={onRecover}>Apri recupero migrazioni</button></p>}
 {snapshot && !snapshot.runtimeReady && <p role="alert">Aggiorna prima i componenti del pannello: servono le protezioni che fermano l’avvio durante una migrazione interrotta. <button onClick={onUpdateRuntime}>Aggiorna componenti del pannello</button></p>}
 {receipt && <p role="status">Libreria e file aggiornati. Backup {receipt} conservato in Pannello → Recupera migrazioni script. L’anteprima resta ferma: verifica le pagine prima di riavviare pannello e servizio PLC.</p>}
 {snapshot && ready && phase !== 'done' && <>
 <p>{changes.length ? 'Per ogni interfaccia cambiata scegli il nuovo riferimento. I parametri con lo stesso nome sono già collegati; per gli altri serve una scelta.' : 'I nomi e i parametri pubblici sono compatibili. Il confronto aggiorna anche le dipendenze dai tag delle dinamizzazioni.'}</p>
 <fieldset disabled={busy || phase === 'checking'}>{changes.map((change, row) => {
              const choice = choices[row],
                targets = libraryMigrationTargets(plan.next, change.kind),
                target = targets.find(t => t.key === choice.target);
              return <section className="script-migration-rule" key={change.alias + '.' + change.name}><strong>Modules.{change.alias}.{change.name}{change.kind === 'function' ? '(' + change.parameters.join(', ') + ')' : ''}</strong><label>Nuovo riferimento<select aria-label={'Nuovo riferimento ' + change.alias + '.' + change.name} value={choice.target} onChange={e => {
                    invalidate();
                    setChoices(old => old.map((c, r) => r === row ? chooseLibraryMigrationTarget(change, plan.next, e.target.value) : c));
                  }}><option value="">Scegli…</option>{targets.map(t => <option key={t.key} value={t.key}>Modules.{t.alias}.{t.name}{t.kind === 'function' ? '(' + t.parameters.join(', ') + ')' : ''}</option>)}</select></label>{target?.parameters.map((param, index) => {
                  const arg = choice.arguments[index],
                    value = arg?.kind === 'argument' ? 'argument:' + arg.index : arg?.kind === 'fixed' ? 'fixed:' + arg.type : arg?.kind ?? 'unset';
                  return <div className="script-migration-argument" key={index}><label>Parametro {param}<select aria-label={'Valore ' + change.alias + '.' + change.name + '.' + param} value={value} onChange={e => {
                        const [kind, detail] = e.target.value.split(':');
                        argument(row, index, kind === 'argument' ? {
                          kind,
                          index: Number(detail)
                        } : kind === 'fixed' ? {
                          kind,
                          type: detail as 'string' | 'number' | 'boolean' | 'null',
                          text: detail === 'boolean' ? 'true' : ''
                        } : kind === 'undefined' ? {
                          kind
                        } : {
                          kind: 'unset'
                        });
                      }}><option value="unset">Scegli…</option>{change.parameters.map((p, i) => <option key={i} value={'argument:' + i}>Parametro precedente: {p}</option>)}<option value="fixed:number">Numero fisso</option><option value="fixed:string">Testo fisso</option><option value="fixed:boolean">Vero / Falso</option><option value="fixed:null">Valore null</option><option value="undefined">Non definito (undefined)</option></select></label>{arg?.kind === 'fixed' && arg.type !== 'null' && (arg.type === 'boolean' ? <label>Valore fisso<select aria-label={'Valore fisso ' + param} value={arg.text} onChange={e => argument(row, index, {
                        ...arg,
                        text: e.target.value
                      })}><option value="true">Vero</option><option value="false">Falso</option></select></label> : <label>Valore fisso<input aria-label={'Valore fisso ' + param} value={arg.text} onChange={e => argument(row, index, {
                        ...arg,
                        text: e.target.value
                      })} /></label>)}</div>;
                })}</section>;
            })}
 {scopeFiles.map(file => <fieldset key={file} className="script-migration-rule"><legend>Contesti d’uso · {label(file)}</legend><p>Seleziona tutte le pagine in cui è usato questo componente. Le dipendenze comprendono i tag letti in ciascun contesto.</p>{scopeOptions.map(scope => <label key={scope}><input type="checkbox" checked={scopes[file]?.includes(scope) ?? false} onChange={e => {
                  invalidate();
                  setScopes(old => ({
                    ...old,
                    [file]: e.target.checked ? [...new Set([...(old[file] ?? []), scope])] : (old[file] ?? []).filter(s => s !== scope)
                  }));
                }} />{scope || 'Solo definizioni globali'}</label>)}</fieldset>)}
 </fieldset>
 {result?.issues.length ? <section aria-label="Passaggi da risolvere"><p role="alert">Il confronto è fermo. Risolvi questi punti e ripeti il controllo; nessun file è stato scritto.</p><ul>{result.issues.map((issue, i) => <li key={i}><code>{issue.path}:{issue.line}</code> · {issue.message}</li>)}</ul></section> : null}
 {phase === 'review' && result && <section aria-label="File proposti"><p>{result.changes.length} file da aggiornare · {result.references.length} riferimenti esaminati · {result.recompiled} script ricompilati. La proposta riguarda i sorgenti; non invia comandi al PLC.</p><label>File da confrontare<select aria-label="File da confrontare" value={selected} onChange={e => setSelected(e.target.value)}>{result.changes.map(c => <option key={c.path} value={c.path}>{label(c.path)}</option>)}</select></label>{diff && <div className="script-library-diff"><label>Prima<textarea readOnly aria-label="File prima della migrazione" value={diff.before} /></label><label>Dopo<textarea readOnly aria-label="File dopo la migrazione" value={diff.after} /></label></div>}</section>}
 </>}
 </main><footer>{phase === 'review' && result && <div className="script-library-review-options"><label><input type="checkbox" disabled={busy} checked={checked} onChange={e => setChecked(e.target.checked)} />Ho controllato tutti i file proposti e i collegamenti.</label>{scopeFiles.length > 0 && <label><input type="checkbox" disabled={busy} checked={contexts} onChange={e => setContexts(e.target.checked)} />Ho incluso tutti i contesti d’uso dei componenti condivisi.</label>}{result.previousVersions.some(v => v < 9) && <label><input type="checkbox" disabled={busy} checked={engine} onChange={e => setEngine(e.target.checked)} />Gli script modificati usavano un motore precedente. Verificherò il comportamento dopo l’aggiornamento.</label>}<label><input type="checkbox" disabled={busy} checked={stopped} onChange={e => setStopped(e.target.checked)} />Ho arrestato il servizio PLC di questo progetto. Framecraft fermerà anche l’anteprima prima di scrivere.</label></div>}
 <span>{busy ? 'Aggiornamento e backup in corso: attendi.' : phase === 'done' ? 'Aggiornamento terminato.' : 'I file vengono salvati insieme; il backup permette di recuperarli.'}</span>
 <button disabled={busy} onClick={onClose}>Chiudi</button>{phase === 'error' && <><button onClick={() => void read()}>Rileggi progetto</button><button onClick={onRecover}>Apri recupero</button></>}
 {ready && phase !== 'done' && phase !== 'error' && <button disabled={busy || phase === 'checking' || dirty || scriptDirty || unavailable} onClick={() => void compare()}>Confronta file del progetto</button>}
 {phase === 'review' && <button disabled={!ready || busy || !result?.changes.length || !checked || !stopped || scopeFiles.length > 0 && !contexts || !!result?.previousVersions.some(v => v < 9) && !engine || dirty || scriptDirty || unavailable} onClick={() => void apply()}>Applica aggiornamento con backup</button>}
 </footer></section></div>, document.body);
}
