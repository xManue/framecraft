import { LoaderCircle, LogIn, LogOut, RefreshCw } from "lucide-react";
import { useEditorAi } from "../state/editorAi";

export function AiAccountSettings() {
  const ai = useEditorAi(), blocked = ai.busy || ai.connecting || ai.checking;
  return <div className="editor-settings-workspace" aria-label="Impostazioni AI e account">
    <p className="editor-settings-hint">Collega qui il tuo account ChatGPT. La creazione e la modifica manuale del pannello restano disponibili senza AI.</p>
    <fieldset><legend>Account ChatGPT · Codex CLI</legend>
      <p role="status">{ai.account?.connected ? `${ai.account.email ?? "Account ChatGPT collegato"} · ${ai.account.plan ?? "Piano dell’account"}` : "Nessun account ChatGPT collegato a Framecraft."}</p>
      <div className="ai-buttons">
        <button type="button" disabled={blocked} onClick={() => void ai.connect()}>{ai.connecting ? <LoaderCircle className="spin" size={16} /> : <LogIn size={16} />}{ai.account?.connected ? "Controlla collegamento" : "Collega ChatGPT"}</button>
        {ai.account?.connected && <button type="button" disabled={blocked} onClick={() => void ai.logout()}><LogOut size={16} />Scollega account</button>}
        {!ai.account?.connected && <button type="button" disabled={blocked} onClick={() => void ai.refresh()}>{ai.checking ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Ho completato l’accesso / verifica account salvato</button>}
      </div>
      {!ai.account?.connected && <p>Completa l’accesso nel browser, poi torna qui. Se lo stato non si aggiorna, premi “Ho completato l’accesso”. Le risposte nella procedura AI restano conservate.</p>}
      {ai.checking && <p role="status">Verifica del collegamento e dei modelli disponibili…</p>}
      {ai.busy && <p>Una richiesta AI è in corso: attendi o annullala dalla schermata AI prima di cambiare account.</p>}
      {ai.accountError && <p className="ai-account-error" role="alert">{ai.accountError}</p>}
      <p>Il profilo di Framecraft è separato da quello dell’app Codex. Non serve una chiave API condivisa e nessuna credenziale viene salvata nel progetto HMI.</p>
    </fieldset>
    <fieldset><legend>Modello da usare</legend>
      <label htmlFor="editor-ai-model">Modello Codex</label><select id="editor-ai-model" value={ai.model} disabled={!ai.account?.connected || !ai.models.length || blocked} onChange={event => useEditorAi.setState({ model: event.target.value })}><option value="">Scegli un modello</option>{ai.models.map(model => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}</select>
      <p>Viene usato nelle richieste AI per questo account. Il catalogo non garantisce accesso a ogni modello: si applicano disponibilità e limiti del tuo piano.</p>
    </fieldset>
    <fieldset><legend>Installazione e privacy</legend>
      <p>Codex CLI deve essere installato sul computer. Se manca, installalo dalla guida ufficiale e riprova il collegamento. Framecraft non lo installa automaticamente.</p>
      <p>Aprire le Impostazioni non avvia accessi o richieste AI. Nella procedura vedrai il contesto da inviare e dovrai approvarlo; nessuna proposta modifica il pannello da sola.</p>
    </fieldset>
  </div>;
}
