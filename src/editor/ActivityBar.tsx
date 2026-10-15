import { Boxes, Braces, Cable, Files, Languages, MessageSquare, Route, SquareMousePointer } from "lucide-react";
import { useEditorStore } from "../state/editorStore";
import { useEditorAi } from "../state/editorAi";

const items = [
  { id: "pages" as const, label: "Pagine", icon: Route },
  { id: "page" as const, label: "Questa pagina", icon: SquareMousePointer, declared: true },
  { id: "components" as const, label: "Aggiungi", icon: Boxes },
  { id: "plc" as const, label: "PLC", icon: Cable },
  { id: "resources" as const, label: "Risorse", icon: Languages },
  { id: "scripts" as const, label: "Script", icon: Braces },
  { id: "project" as const, label: "File", icon: Files },
];

export function ActivityBar() {
  const chatOpen = useEditorAi(state => state.open && state.mode === "edit");
  const active = useEditorStore((state) => state.leftPanel);
  const setActive = useEditorStore((state) => state.setLeftPanel);
  // La scheda della pagina esiste solo dove il pannello dichiara cosa si può cambiare: altrove
  // offrirla vuota direbbe che l'editor è rotto.
  const declared = useEditorStore((state) => state.activeAffordances().length > 0);
  return <nav className="activity-bar" aria-label="Pannelli dell’editor">
    {items.filter((item) => !item.declared || declared).map(({ id, label, icon: Icon }) => (
      <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)} aria-label={label} aria-pressed={active === id} title={id === "project" ? "File del progetto · strumenti avanzati" : label}>
        <Icon size={19} strokeWidth={1.7} />
        <span>{label}</span>
      </button>
    ))}
    <button type="button" className={chatOpen ? "active" : ""} aria-label="Chat AI" aria-pressed={chatOpen} title="Chat AI del progetto" onClick={() => chatOpen ? useEditorAi.getState().close() : useEditorAi.getState().show("edit")}><MessageSquare size={19} /><span>Chat AI</span></button>
  </nav>;
}
