import { LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sandboxPending } from "../ai/aiProvider";
import { useEditorAi } from "../state/editorAi";

export function AiSandboxSettings() {
  const ai = useEditorAi(), [confirm, setConfirm] = useState(false), [approved, setApproved] = useState(false);
  const consent = useRef<HTMLInputElement>(null), configure = useRef<HTMLButtonElement>(null), status = useRef<HTMLParagraphElement>(null), wasConfirming = useRef(false);
  const pending = sandboxPending(ai.sandbox), busy = ai.busy || ai.checking || ai.connecting || ai.sandboxStarting || ai.sandboxChecking;
  const canConfigure = !!ai.account?.connected && !!ai.provider.setupSandbox && !pending && !ai.sandboxError && ["notConfigured", "updateRequired"].includes(ai.sandbox?.status ?? "");
  useEffect(() => { setConfirm(false); setApproved(false); }, [ai.provider, ai.account?.email, ai.account?.connected]);
  useEffect(() => { if (!canConfigure) { setConfirm(false); setApproved(false); } }, [canConfigure]);
  useEffect(() => {
    if (confirm) consent.current?.focus({ preventScroll: true });
    else if (wasConfirming.current) (configure.current ?? status.current)?.focus({ preventScroll: true });
    wasConfirming.current = confirm;
  }, [confirm]);
  const description = ai.sandboxStarting ? "Avvio della configurazione Windows… Non ripetere il comando." : ai.sandbox?.phase === "running" ? "Configurazione Windows in corso. Controlla l’eventuale richiesta amministratore. Chiudere le impostazioni non annulla il setup; attendi l’esito prima di usare l’AI." : ai.sandbox?.phase === "uncertain" ? "Esito non confermato. Non avviare un altro setup: controlla la finestra Windows o chiedi all’IT. Puoi verificare nuovamente lo stato senza ripetere la configurazione." : ai.sandbox?.phase === "failed" ? "Windows non ha completato la configurazione. Verifica la conferma amministratore e le regole del computer con l’IT, poi ricontrolla l’isolamento." : ai.sandbox?.status === "ready" ? "Protezione dei file pronta. Questo controllo non verifica il modello, le modifiche AI o i collegamenti PLC." : ai.sandbox?.status === "notConfigured" ? "Manca la configurazione Windows necessaria per le modifiche AI al progetto. Non serve scollegare l’account ChatGPT." : ai.sandbox?.status === "updateRequired" ? "La protezione Windows di Codex deve essere aggiornata. Aggiornare soltanto la CLI o ricollegare l’account non completa questo passaggio." : ai.sandbox?.status === "notRequired" ? "Questo computer non richiede il setup Windows. I controlli sui permessi del progetto restano attivi a ogni richiesta." : "Isolamento non verificato. Il controllo è locale: non invia il pannello al modello e non modifica Windows.";
  function dismiss() { setConfirm(false); setApproved(false); }
  function submit() { if (!approved || !canConfigure || busy) return; setConfirm(false); setApproved(false); void ai.setupSandbox(true); }
  return <fieldset className="ai-sandbox-settings"><legend>Protezione dei file · Codex</legend>
    <p ref={status} tabIndex={-1} role="status" aria-live="polite">{ai.sandboxChecking ? "Verifica locale dell’isolamento…" : description}</p>
    <div className="ai-buttons">
      <button type="button" disabled={busy || !ai.account?.connected || !ai.provider.sandboxStatus} onClick={() => void ai.checkSandbox()}>{ai.sandboxChecking ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Verifica isolamento</button>
      {canConfigure && <button type="button" ref={configure} disabled={busy || confirm} onClick={() => { setApproved(false); setConfirm(true); }}><ShieldCheck size={16} />Configura Windows…</button>}
    </div>
    {!ai.account?.connected && <p>Collega o verifica prima l’account qui sopra, poi controlla l’isolamento.</p>}
    {!ai.provider.sandboxStatus && <p>Questo provider non offre la configurazione Windows nell’app. Per Codex usa una build desktop aggiornata.</p>}
    {ai.sandboxError && <p className="ai-account-error" role="alert">{ai.sandboxError}</p>}
    {confirm && <div className="ai-sandbox-confirm" role="group" aria-labelledby="ai-sandbox-confirm-title">
      <h3 id="ai-sandbox-confirm-title">Autorizzi la configurazione Windows?</h3>
      <p id="ai-sandbox-effects">Codex può chiedere conferma amministratore e creare o aggiornare utenti locali dedicati, regole firewall e criteri di accesso del sandbox. Il setup riguarda il computer, non il progetto HMI. Su un PC aziendale verifica prima con l’IT.</p>
      <p>Non invia richieste AI, non cambia il pannello e non configura MQTT o OPC UA. Potrebbe richiedere alcuni minuti. Nessun avvio automatico.</p>
      <label className="editor-settings-toggle"><input ref={consent} type="checkbox" checked={approved} aria-describedby="ai-sandbox-effects" onChange={event => setApproved(event.target.checked)} />Ho letto gli effetti e autorizzo questo setup Windows</label>
      <div className="ai-buttons"><button type="button" onClick={dismiss}>Non adesso</button><button type="button" disabled={!approved || busy || !canConfigure} onClick={submit}>Autorizza e avvia configurazione</button></div>
    </div>}
    <p>L’editor manuale resta disponibile. Il setup non avvia o applica proposte AI. <a href="https://learn.chatgpt.com/docs/windows/windows-sandbox" target="_blank" rel="noreferrer">Guida ufficiale al sandbox Windows (browser)</a></p>
  </fieldset>;
}
