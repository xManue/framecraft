import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { componentRegistry } from "./registry";
import { useEditorStore } from "../state/editorStore";

export function ComponentPalette() {
  const [query, setQuery] = useState("");
  const insert = useEditorStore((state) => state.insertComponent);
  const draggedComponent = useEditorStore((state) => state.draggedComponent);
  const setDraggedComponent = useEditorStore((state) => state.setDraggedComponent);
  const setInteractionMode = useEditorStore((state) => state.setInteractionMode);
  const items = useMemo(() => componentRegistry.all().filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [query]);
  return <div className="panel-content">
    <div className="panel-title"><span>COMPONENTS</span></div>
    <p className="panel-help"><strong>Trascina sul canvas</strong> per posizionare liberamente nel punto esatto. Clicca per aggiungere nel contenitore selezionato.</p>
    <label className="search-field"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search components" /></label>
    {componentRegistry.categories().map((category) => {
      const categoryItems = items.filter((item) => item.category === category);
      if (!categoryItems.length) return null;
      return <section className="component-group" key={category}>
        <h3>{category}</h3>
        <div className="component-grid">
          {categoryItems.map(({ type, name, icon: Icon, createJsx }) => <button key={type} draggable className={draggedComponent === createJsx() ? "dragging" : ""} title={`Trascina ${name} nel punto desiderato`}
            onDragStart={(event) => { const jsx = createJsx(); setInteractionMode("edit"); setDraggedComponent(jsx); event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/plain", jsx); event.dataTransfer.setData("application/x-framecraft-jsx", jsx); }}
            onDragEnd={() => setDraggedComponent(undefined)}
            onClick={() => void insert(createJsx())}><Icon size={17} /><span>{name}</span></button>)}
        </div>
      </section>;
    })}
  </div>;
}
