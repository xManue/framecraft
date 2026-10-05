import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, Eraser, Info, Search, X } from "lucide-react";
import { useEditorStore } from "../state/editorStore";
import { cleanDiagnosticText, consoleMessageSource, describeEditorMessage } from "../core/editorMessages";
import type { ConsoleEntry } from "../core/types";

const icons = { info: Info, warning: AlertTriangle, error: CircleAlert, success: CheckCircle2 };
const levels = { info: "Informazione", warning: "Avviso", error: "Errore", success: "Operazione riuscita" };
type ConsoleFilter = "all" | "hmi" | "problems";

export function ConsolePanel() {
  const entries = useEditorStore((state) => state.consoleEntries);
  const close = useEditorStore((state) => state.setConsoleOpen);
  const clear = useEditorStore((state) => state.clearConsole);
  const [filter, setFilter] = useState<ConsoleFilter>("all");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it");
    return entries.filter((item) => {
      const source = consoleMessageSource(item);
      if (filter === "hmi" && source !== "hmi") return false;
      if (filter === "problems" && item.level !== "warning" && item.level !== "error") return false;
      const description = describeEditorMessage(item.message, source === "preview" ? "preview" : "editor", item.level);
      return !needle || [cleanDiagnosticText(item.message), description.text, description.nextStep ?? ""].join(" ").toLocaleLowerCase("it").includes(needle);
    });
  }, [entries, filter, query]);
  const grouped = useMemo(() => {
    const groups: { item: ConsoleEntry; count: number }[] = [];
    for (const item of visible) {
      const previous = groups.at(-1);
      if (previous && previous.item.message === item.message && previous.item.level === item.level && consoleMessageSource(previous.item) === consoleMessageSource(item)) {
        previous.count++;
      } else groups.push({ item, count: 1 });
    }
    return groups;
  }, [visible]);
  return <section className="console-panel">
    <header><strong>DIAGNOSTICA</strong><span>{visible.length}/{entries.length} messaggi</span>
      <nav aria-label="Filtra diagnostica">
        <button className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tutti</button>
        <button className={filter === "hmi" ? "active" : ""} aria-pressed={filter === "hmi"} onClick={() => setFilter("hmi")}>HMI</button>
        <button className={filter === "problems" ? "active" : ""} aria-pressed={filter === "problems"} onClick={() => setFilter("problems")}>Problemi</button>
      </nav>
      <label><Search size={12} /><input aria-label="Cerca nella diagnostica" value={query} placeholder="Cerca" onChange={(event) => setQuery(event.target.value)} /></label>
      <button onClick={clear} aria-label="Pulisci diagnostica" title="Pulisci l’elenco dei messaggi. Non cancella file o bozze."><Eraser size={14} /></button>
      <button onClick={() => close(false)} aria-label="Chiudi diagnostica"><X size={14} /></button>
    </header>
    <div>{visible.length ? grouped.map(({ item, count }) => {
      const Icon = icons[item.level];
      const source = consoleMessageSource(item);
      const message = describeEditorMessage(item.message, source === "preview" ? "preview" : "editor", item.level);
      return <article key={item.id} className={`console-entry ${item.level}`} aria-label={levels[item.level]}>
        <time className="console-time">{item.time}</time><span className={`console-source ${source}`}>{source === "hmi" ? "PANNELLO" : source === "preview" ? "ANTEPRIMA" : "EDITOR"}</span><Icon size={13} aria-hidden="true" />
        <div className="console-message"><p>{message.text}{count > 1 && <span className="console-repeat" title="Stesso messaggio ricevuto più volte">Ricevuto {count} volte</span>}</p>
          {message.nextStep && <p className="message-next-step">{message.nextStep}</p>}
          {message.details && <details className="message-details"><summary>Dettagli tecnici (per assistenza)</summary><pre>{message.details}</pre></details>}
        </div>
      </article>;
    }) : <p className="console-empty">Nessun messaggio con questi filtri.</p>}</div>
  </section>;
}
