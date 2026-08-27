import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { useEditorStore } from "../state/editorStore";

const icons = { info: Info, warning: AlertTriangle, error: CircleAlert, success: CheckCircle2 };

export function ConsolePanel() {
  const entries = useEditorStore((state) => state.consoleEntries);
  const close = useEditorStore((state) => state.setConsoleOpen);
  return <section className="console-panel">
    <header><strong>CONSOLE</strong><span>{entries.length} messages</span><button onClick={() => close(false)} aria-label="Close console"><X size={14} /></button></header>
    <div>{entries.map((item) => { const Icon = icons[item.level]; return <p key={item.id} className={item.level}><span>{item.time}</span><Icon size={13} /><code>{item.message}</code></p>; })}</div>
  </section>;
}
