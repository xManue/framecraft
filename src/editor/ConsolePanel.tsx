import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, Eraser, Info, Search, X } from "lucide-react";
import { useEditorStore } from "../state/editorStore";

const icons = { info: Info, warning: AlertTriangle, error: CircleAlert, success: CheckCircle2 };
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
      const source = item.source ?? (item.message.startsWith("[HMI ") ? "hmi" : "editor");
      if (filter === "hmi" && source !== "hmi") return false;
      if (filter === "problems" && item.level !== "warning" && item.level !== "error") return false;
      return !needle || item.message.toLocaleLowerCase("it").includes(needle);
    });
  }, [entries, filter, query]);
  return <section className="console-panel">
    <header><strong>DIAGNOSTICA</strong><span>{visible.length}/{entries.length} messaggi</span>
      <nav aria-label="Filtra diagnostica">
        <button className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tutti</button>
        <button className={filter === "hmi" ? "active" : ""} aria-pressed={filter === "hmi"} onClick={() => setFilter("hmi")}>HMI</button>
        <button className={filter === "problems" ? "active" : ""} aria-pressed={filter === "problems"} onClick={() => setFilter("problems")}>Problemi</button>
      </nav>
      <label><Search size={12} /><input aria-label="Cerca nella diagnostica" value={query} placeholder="Cerca" onChange={(event) => setQuery(event.target.value)} /></label>
      <button onClick={clear} aria-label="Pulisci diagnostica" title="Pulisci diagnostica"><Eraser size={14} /></button>
      <button onClick={() => close(false)} aria-label="Chiudi diagnostica"><X size={14} /></button>
    </header>
    <div>{visible.length ? visible.map((item) => {
      const Icon = icons[item.level];
      const source = item.source ?? (item.message.startsWith("[HMI ") ? "hmi" : "editor");
      return <p key={item.id} className={item.level}><span className="console-time">{item.time}</span><span className={`console-source ${source}`}>{source === "hmi" ? "HMI" : source === "preview" ? "PREVIEW" : "EDITOR"}</span><Icon size={13} /><code title={item.message}>{item.message}</code></p>;
    }) : <p className="console-empty">Nessun messaggio con questi filtri.</p>}</div>
  </section>;
}
