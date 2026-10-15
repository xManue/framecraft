import { useId, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { aiReadableData } from "../ai/aiBindings";
import { useEditorAiChat } from "../state/editorAiChat";
import { useEditorAi } from "../state/editorAi";
import { useEditorStore } from "../state/editorStore";

export function AiChatDataSources() {
  const chat = useEditorAiChat(), busy = useEditorAi(state => state.busy), catalog = useEditorStore(state => state.plcVariables);
  const [name, setName] = useState(""), [label, setLabel] = useState("");
  const id = useId(), blocked = busy || chat.sending || chat.applying;
  const readable = useMemo(() => {
    const counts = new Map<string, number>(); for (const tag of catalog) counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1);
    return catalog.filter(tag => aiReadableData(tag) && counts.get(tag.name) === 1);
  }, [catalog]);
  const choices = readable.filter(tag => tag.name.toLocaleLowerCase("it").includes(name.trim().toLocaleLowerCase("it"))).slice(0, 40);
  return <details className="ai-chat-data"><summary>Dati da usare{chat.dataReferences.length ? ` · ${chat.dataReferences.length}` : " · facoltativi"}</summary>
    <p>Scegli qui i segnali per le regole di lettura. All’AI arrivano solo il nome che scegli sotto, il tipo e un riferimento anonimo; nomi tag, indirizzi e valori PLC restano locali.</p>
    {chat.dataReferences.map(ref => <div className="ai-chat-data-item" key={ref.id}><span><strong>{ref.label}</strong><small>{ref.tag.name} · {ref.tag.dataType} · sola lettura</small></span><button type="button" disabled={blocked} aria-label={`Rimuovi dal contesto ${ref.label}`} onClick={() => chat.removeData(ref.id)}><X size={15} /></button></div>)}
    {!readable.length ? <p className="ai-hint">Importa o dichiara prima un tag scalare leggibile nel catalogo PLC. I riferimenti rilevati solo nel sorgente non bastano.</p> : <fieldset disabled={blocked || chat.dataReferences.length >= 8}>
      <label htmlFor={`${id}-tag`}>Segnale dal catalogo locale<input id={`${id}-tag`} list={`${id}-tags`} value={name} maxLength={200} onChange={event => setName(event.target.value)} placeholder="Cerca il nome del tag…" autoComplete="off" /></label>
      <datalist id={`${id}-tags`}>{choices.map(tag => <option key={tag.name} value={tag.name}>{tag.dataType}</option>)}</datalist>
      <label htmlFor={`${id}-label`}>Nome da usare con l’AI<input id={`${id}-label`} value={label} maxLength={80} onChange={event => setLabel(event.target.value)} placeholder="Es. Allarme motore" /></label>
      <button type="button" disabled={!name.trim() || !label.trim()} onClick={() => { const before = useEditorAiChat.getState().dataReferences.length; chat.addData(name, label); if (useEditorAiChat.getState().dataReferences.length > before) { setName(""); setLabel(""); } }}><Plus size={15} />Usa questo dato</button>
    </fieldset>}
    <p className="ai-hint">Rimuovere un dato dal contesto non scollega regole già applicate. Nessuna scrittura PLC o connessione viene creata da questi campi.</p>
  </details>;
}
