import { Boxes, Cable, Files, Route } from "lucide-react";
import { useEditorStore } from "../state/editorStore";

const items = [
  { id: "project" as const, label: "Project", icon: Files },
  { id: "components" as const, label: "Components", icon: Boxes },
  { id: "pages" as const, label: "Pages", icon: Route },
  { id: "plc" as const, label: "Variabili PLC", icon: Cable },
];

export function ActivityBar() {
  const active = useEditorStore((state) => state.leftPanel);
  const setActive = useEditorStore((state) => state.setLeftPanel);
  return <nav className="activity-bar" aria-label="Editor panels">
    {items.map(({ id, label, icon: Icon }) => (
      <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)} aria-label={label} title={label}>
        <Icon size={19} strokeWidth={1.7} />
      </button>
    ))}
  </nav>;
}
