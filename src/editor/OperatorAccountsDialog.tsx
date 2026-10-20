import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, ShieldCheck, UserPlus, X } from "lucide-react";
import { parseOperatorAuthConfig, operatorCapabilities } from "../../runtime/operator-policy.mjs";
import { operatorAccountIssues, operatorAdminError, operatorAdminJournalKey, operatorCapabilityLabels, type OperatorAccountsSnapshot, type OperatorAdminCommand, type OperatorAuthConfig, type OperatorCapability } from "../core/operatorAccounts";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";
import { useRecipeDialog } from "./useRecipeDialog";
import "./operator-accounts.css";

export function OperatorAccountsDialog({ onClose, onLegacy }: { onClose(): void; onLegacy(): void }) {
  const project = useEditorStore(state => state.project), [initial] = useState(project);
  const [snapshot, setSnapshot] = useState<OperatorAccountsSnapshot>(), [config, setConfig] = useState<OperatorAuthConfig>();
  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "saving">("loading"), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [selected, setSelected] = useState(""), [mode, setMode] = useState<"account" | "add" | "password" | "service">("account");
  const [username, setUsername] = useState(""), [name, setName] = useState(""), [role, setRole] = useState(""), [capabilities, setCapabilities] = useState<OperatorCapability[]>([]), [permissions, setPermissions] = useState("");
  const [password, setPassword] = useState(""), [repeat, setRepeat] = useState(""), [review, setReview] = useState<"account" | "disable" | "service">(), [confirmClose, setConfirmClose] = useState(false);
  const [uncertain, setUncertain] = useState(false), [reviewed, setReviewed] = useState(false), [journalError, setJournalError] = useState(false);
  const mounted = useRef(true), generation = useRef(0), title = useId(), journalKey = useRef<string | undefined>(undefined);
  const account = snapshot?.accounts.find(item => item.id === selected), saving = phase === "saving";
  const base = account ? JSON.stringify({ username: account.username, name: account.name, role: account.role, capabilities: account.capabilities, permissions: account.permissions.join(", ") }) : "";
  const changed = mode === "service" ? !!snapshot && !!config && JSON.stringify(config) !== (() => { try { return JSON.stringify(parseOperatorAuthConfig(JSON.parse(snapshot.configuration!))); } catch { return ""; } })()
    : mode === "add" ? !!(username || name || role || password || capabilities.length || permissions) : mode === "password" ? !!password || !!repeat : !!account && JSON.stringify({ username, name, role, capabilities, permissions }) !== base;
  const current = () => mounted.current && useEditorStore.getState().project === initial;
  const clearPassword = () => { setPassword(""); setRepeat(""); };
  const close = () => { if (saving) return; if (changed) setConfirmClose(true); else onClose(); };
  const panel = useRecipeDialog(close);
  const choose = (id: string, next: typeof mode = "account", force = false) => {
    if (saving || !force && changed && !window.confirm("Scartare la bozza degli account? Nessuna modifica sarà salvata.")) return;
    if (mode === "service" && snapshot?.configuration) { try { setConfig(parseOperatorAuthConfig(JSON.parse(snapshot.configuration))); } catch { setConfig(undefined); } }
    clearPassword(); setSelected(id); setMode(next); setReview(undefined); setError(""); setConfirmClose(false);
    const item = snapshot?.accounts.find(account => account.id === id); setUsername(next === "add" ? "" : item?.username ?? ""); setName(next === "add" ? "" : item?.name ?? ""); setRole(next === "add" ? "" : item?.role ?? ""); setCapabilities(next === "add" ? [] : item?.capabilities ?? []); setPermissions(next === "add" ? "" : item?.permissions.join(", ") ?? "");
  };
  const read = async (discard = false) => {
    if (!initial || !current() || saving || !discard && changed && !window.confirm("Rileggere gli account e scartare la bozza non salvata?")) return;
    const request = ++generation.current; setPhase("loading"); setError(""); clearPassword();
    try {
      const next = await desktopBridge.readOperatorAccounts(initial.root); if (!current() || request !== generation.current) return;
      setSnapshot(next); setPhase("ready"); setSelected(""); setMode("account"); setReview(undefined); setConfirmClose(false); setReviewed(true);
      let parsed: OperatorAuthConfig | undefined; try { if (next.configuration !== null) parsed = parseOperatorAuthConfig(JSON.parse(next.configuration)); } catch { setError("framecraft.auth.json non valido: correggilo con chi ti assiste. Nessun archivio è stato sostituito."); }
      setConfig(parsed); journalKey.current = parsed ? operatorAdminJournalKey(parsed.namespace, initial.root) : undefined;
      try { setUncertain(!!journalKey.current && sessionStorage.getItem(journalKey.current) !== null); setJournalError(false); } catch { setJournalError(true); }
    } catch (caught) { if (current() && request === generation.current) { const safe = operatorAdminError(caught); setError(safe.message + ". " + safe.remedy); setPhase("error"); } }
  };
  useEffect(() => { mounted.current = true; void read(true); return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => { if (project !== initial) onClose(); }, [project, initial, onClose]);
  const editable = phase === "ready" && !!config && !uncertain && !journalError;
  const command = (): OperatorAdminCommand | undefined => mode === "add" ? { action: "add", username, name, role, capabilities, permissions: permissions ? permissions.split(",").map(id => id.trim()) : [], password }
    : account && mode === "password" ? { action: "password", id: account.id, password } : account ? { action: "update", id: account.id, name, role, capabilities, permissions: permissions ? permissions.split(",").map(id => id.trim()) : [] } : undefined;
  const preview = () => {
    if (!editable || !snapshot) return;
    if (mode === "service") { try { parseOperatorAuthConfig(config); setError(""); setReview("service"); } catch { setError("Controlla timeout e configurazione del servizio."); } return; }
    const next = command(); if (!next) return; const issues = operatorAccountIssues(next, snapshot.accounts);
    if ((next.action === "add" || next.action === "password") && password !== repeat) issues.push("Le due password non coincidono.");
    if (issues.length) { setError(issues.join(" ")); return; } setError(""); setReview("account");
  };
  async function save() {
    if (!initial || !current() || !snapshot || !editable || !review || !journalKey.current) return;
    const next = review === "disable" && account ? { action: "disable" as const, id: account.id, disabled: !account.disabled } : command();
    try { sessionStorage.setItem(journalKey.current, "pending"); if (sessionStorage.getItem(journalKey.current) !== "pending") throw new Error(); }
    catch { setJournalError(true); setError("Memoria di recupero non disponibile: nessuna richiesta inviata. Usa la gestione da terminale o ripristina la memoria dell’app."); clearPassword(); return; }
    setPhase("saving"); setError(""); const action = review;
    try {
      let fresh: OperatorAccountsSnapshot;
      if (action === "service") { const source = JSON.stringify(parseOperatorAuthConfig(config), null, 2) + "\n"; await desktopBridge.saveOperatorConfiguration(initial.root, snapshot, source); fresh = { ...snapshot, configuration: source }; }
      else { if (!next) throw new Error("AUTH_INPUT"); fresh = await desktopBridge.updateOperatorAccounts(initial.root, snapshot, next); }
      try { sessionStorage.removeItem(journalKey.current); if (sessionStorage.getItem(journalKey.current) !== null) throw new Error(); }
      catch { throw new Error("AUTH_UNCERTAIN"); }
      if (!current()) return;
      setMessage(action === "service" ? "Configurazione salvata. Riavvia manualmente il servizio HMI per applicarla; nessun collegamento o comando PLC avviato." : "Account aggiornati; le sessioni attive verranno revocate. Nessun comando PLC inviato.");
      setPhase("ready"); setReview(undefined); setSelected(""); setMode("account");
      if (current()) { setSnapshot(fresh); try { setConfig(fresh.configuration ? parseOperatorAuthConfig(JSON.parse(fresh.configuration)) : undefined); } catch { setConfig(undefined); } }
    } catch (caught) {
      if (!current()) return; const safe = operatorAdminError(caught);
      if (safe.code === "AUTH_CONFLICT") { try { sessionStorage.removeItem(journalKey.current); } catch { /* Verification still required if the local marker cannot be cleared. */ } }
      setUncertain(true); setReviewed(false); setError(safe.code === "AUTH_CONFLICT" ? "Gli account sono cambiati. Rileggi e confronta prima di salvare una nuova modifica." : "Operazione da verificare. " + safe.message + ". " + safe.remedy); setReview(undefined);
    } finally { clearPassword(); if (current()) setPhase("ready"); }
  }
  const acknowledge = () => { if (!reviewed || !journalKey.current) return; try { sessionStorage.removeItem(journalKey.current); if (sessionStorage.getItem(journalKey.current) !== null) throw new Error(); setUncertain(false); setError(""); } catch { setJournalError(true); } };
  const controls = <><button type="button" disabled={saving} onClick={() => void read()}><RefreshCw size={16} /> Rileggi account</button><button type="button" disabled={!editable} onClick={() => choose("", "add")}><UserPlus size={16} /> Nuovo account</button><button type="button" disabled={saving || !config} onClick={() => choose("", "service")}>Servizio e sessioni</button></>;
  return createPortal(<div className="operator-backdrop"><section ref={panel} className="operator-dialog" role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1}>
    <header><div><small>PROGETTO LOCALE · NON ACCOUNT CHATGPT</small><h2 id={title}><ShieldCheck size={22} /> Account del pannello HMI</h2></div><button type="button" aria-label="Chiudi account HMI" disabled={saving} onClick={close}><X size={20} /></button></header>
    <p>Qui amministri gli account del servizio nella cartella di questo progetto. Non cambi gli utenti di un server remoto. Password e hash non vengono salvati nel codice pubblico, nelle bozze o inviati all’AI.</p>
    <details><summary>Cartella degli account su questo PC</summary><code>{initial?.root}/.framecraft-runtime/security/operators.json</code><p>Gli account privati non vengono copiati nella copia di lavoro o nell’esportazione del codice. Configurali esplicitamente anche nella cartella del servizio sul PC di destinazione.</p></details>
    {error && <p role="alert" className="operator-notice">{error}</p>}{message && <p role="status">{message}</p>}
    {phase === "loading" ? <p role="status">Lettura degli account locali…</p> : phase === "error" ? <><p>L’archivio esistente resta invariato. Non viene sostituito con utenti predefiniti.</p><button type="button" onClick={() => void read(true)}>Riprova lettura account</button></> : <>
      <nav aria-label="Gestione account">{controls}</nav>
      {!config && <p className="operator-notice">Runtime account server non configurato o non compatibile. Aggiorna esplicitamente il Runtime del pannello e framecraft.auth.json; non eliminare gli archivi e non usare i PIN come rimedio.</p>}
      {config && !config.enabled && <p className="operator-notice">Accesso disabilitato nella configurazione locale. Puoi preparare gli account, poi abilitalo in Servizio e sessioni e riavvia manualmente il servizio. Questo stato non verifica il servizio attualmente in esecuzione.</p>}
      {journalError && <p role="alert">Memoria di recupero non disponibile. Modifiche bloccate; usa la gestione da terminale.</p>}
      {uncertain && <section className="operator-notice"><h3>Ultima operazione da verificare</h3><p>Non reinviare alla cieca. Rileggi e confronta gli account; se riguardava una password, verifica l’accesso al pannello. Nessuna password è conservata per riprovare.</p><button type="button" disabled={saving} onClick={() => void read(true)}>Rileggi per verificare</button><button type="button" disabled={saving || !reviewed} onClick={acknowledge}>Ho verificato: continua</button></section>}
      {review ? <section className="operator-review"><h3>Conferma {review === "service" ? "configurazione del servizio" : review === "disable" ? account?.disabled ? "riattivazione account" : "disabilitazione account" : mode === "add" ? "nuovo account" : mode === "password" ? "cambio password" : "modifica account"}</h3>
        <p>Cartella interessata: <code>{initial?.root}</code></p>
        {review === "service" ? <p>Accesso {config?.enabled ? "abilitato" : "disabilitato"}, inattività {config?.idleMinutes} minuti, durata massima {config?.absoluteMinutes} minuti. HTTP locale {config?.allowHttpLoopback ? "consentito solo sul loopback" : "non consentito: HTTPS richiesto"}. La modifica vale al prossimo avvio manuale del servizio.</p> : <><p>Utente: {username || account?.username}. Nome: {name || account?.name}. Ruolo: {role || account?.role}.</p><p>{mode === "password" ? "La nuova password sarà protetta sul servizio, non mostrata né registrata." : review === "disable" ? "Nessun account verrà cancellato." : "Capacità: " + (capabilities.map(id => operatorCapabilityLabels[id]).join(", ") || "nessuna") + ". Permessi grafici: " + (permissions || "nessuno") + "."}</p><p>Il cambio degli account revoca tutte le sessioni attive. Un comando PLC già accettato può terminare comunque.</p></>}
        <button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Salvataggio…" : "Conferma salvataggio"}</button><button type="button" disabled={saving} onClick={() => setReview(undefined)}>Torna alla bozza</button>
      </section> : mode === "service" && config ? <fieldset disabled={!editable}><legend>Servizio di accesso</legend>
        <label className="operator-check"><input type="checkbox" checked={config.enabled} onChange={event => setConfig({ ...config, enabled: event.target.checked })} /> Abilita accesso operatore sul server</label>
        <label>Scadenza senza comandi autorizzati (minuti)<input type="number" min={1} max={60} value={config.idleMinutes} onChange={event => setConfig({ ...config, idleMinutes: Number(event.target.value) })} /></label>
        <label>Durata massima sessione (minuti)<input type="number" min={config.idleMinutes} max={480} value={config.absoluteMinutes} onChange={event => setConfig({ ...config, absoluteMinutes: Number(event.target.value) })} /></label>
        <label className="operator-check"><input type="checkbox" checked={config.allowHttpLoopback} onChange={event => setConfig({ ...config, allowHttpLoopback: event.target.checked })} /> Consenti HTTP solo per prove sul PC locale</label>
        <p>In produzione usa HTTPS. Configura anche le origini esatte e il proxy in Connessioni PLC. Nessun servizio viene riavviato da questa finestra.</p><button type="button" disabled={!changed} onClick={preview}>Rivedi configurazione</button>
      </fieldset> : <div className="operator-columns"><aside aria-label="Account locali">{snapshot?.accounts.map(item => <button type="button" disabled={saving} key={item.id} aria-pressed={item.id === selected} onClick={() => choose(item.id)}><strong>{item.name}</strong><span>{item.username} · {item.disabled ? "Disabilitato" : "Attivo"}</span></button>)}{!snapshot?.accounts.length && <p>Nessun account. Aggiungine uno esplicitamente: non esiste un amministratore predefinito.</p>}</aside>
        {mode === "add" || account ? <fieldset disabled={!editable}><legend>{mode === "add" ? "Nuovo account" : mode === "password" ? "Nuova password" : "Dati e permessi dell’account"}</legend>
          {mode !== "password" && <><label>Nome utente<input value={username} disabled={mode !== "add"} autoComplete="off" maxLength={64} onChange={event => setUsername(event.target.value)} /></label><label>Nome visualizzato<input value={name} autoComplete="off" maxLength={160} onChange={event => setName(event.target.value)} /></label><label>Etichetta ruolo<input value={role} autoComplete="off" maxLength={80} onChange={event => setRole(event.target.value)} /></label><p>Il ruolo è un’etichetta: scegli qui sotto ogni capacità. Nessuna autorizzazione è implicita.</p>
          <fieldset><legend>Operazioni autorizzate dal server</legend>{operatorCapabilities.map(id => <label className="operator-check" key={id}><input type="checkbox" checked={capabilities.includes(id)} onChange={event => setCapabilities(event.target.checked ? [...capabilities, id] : capabilities.filter(value => value !== id))} />{operatorCapabilityLabels[id]}</label>)}</fieldset>
          <label>ID permessi grafici (separati da virgola)<input value={permissions} onChange={event => setPermissions(event.target.value)} autoComplete="off" placeholder="comandi, parametri, manutenzione" /></label><p>Gestiscono visibilità e reazioni degli elementi; non concedono permessi al server. Lascia vuoto per nessuno.</p></>}
          {(mode === "add" || mode === "password") && <><label>Nuova password<input type="password" value={password} maxLength={256} autoComplete="new-password" onChange={event => setPassword(event.target.value)} /></label><label>Ripeti password<input type="password" value={repeat} maxLength={256} autoComplete="new-password" onChange={event => setRepeat(event.target.value)} /></label><p>Almeno 12 caratteri. Non verrà mostrata nel riepilogo né conservata dopo l’invio.</p></>}
          <button type="button" disabled={!changed} onClick={preview}>Rivedi modifica</button>
          {account && mode === "account" && <><button type="button" onClick={() => choose(account.id, "password")}>Cambia password</button><button type="button" disabled={changed} title={changed ? "Salva o scarta prima la bozza dell’account" : undefined} onClick={() => { setReview("disable"); clearPassword(); }}>{account.disabled ? "Riattiva account" : "Disabilita account"}</button></>}
        </fieldset> : <p>Seleziona un account oppure premi Nuovo account. Le password esistenti non sono mai leggibili.</p>}
      </div>}
    </>}
    <footer>{confirmClose ? <><span>Scartare la bozza non salvata?</span><button type="button" onClick={() => setConfirmClose(false)}>Continua modifica</button><button type="button" onClick={onClose}>Scarta e chiudi</button></> : <><span>File privato sul PC del progetto. Nessuna scrittura PLC.</span><button type="button" disabled={saving || changed} onClick={onLegacy}>Permessi grafici e PIN precedenti</button><button type="button" disabled={saving} onClick={close}>Chiudi</button></>}</footer>
  </section></div>, document.body);
}
