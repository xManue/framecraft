import { Blocks, Search } from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { componentRegistry, type ComponentCategory } from "./registry";
import { useEditorStore } from "../state/editorStore";
import { projectComponentJsx } from "../core/projectIndex";
import { componentDragDropEvent, componentDragMoveEvent, dispatchComponentDrag, passedDragThreshold } from "./componentDrag";
import { isPaletteProjectComponent } from "./paletteItems";

type PaletteCategory = "Tutti" | "Del tuo progetto" | ComponentCategory;
type DragSession = { pointerId: number; startX: number; startY: number; jsx: string; label: string; active: boolean };

export function ComponentPalette() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PaletteCategory>("Tutti");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("it"));
  const insert = useEditorStore((state) => state.insertComponent);
  const draggedComponent = useEditorStore((state) => state.draggedComponent);
  const setDraggedComponent = useEditorStore((state) => state.setDraggedComponent);
  const setInteractionMode = useEditorStore((state) => state.setInteractionMode);
  const projectComponents = useEditorStore((state) => state.projectComponents);
  const pages = useEditorStore((state) => state.pages);
  const reusableComponents = useMemo(() => projectComponents.filter((item) => isPaletteProjectComponent(item, pages)), [pages, projectComponents]);
  const dragSession = useRef<DragSession | undefined>(undefined);
  const ignoreNextClick = useRef(false);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number; label: string }>();

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, jsx: string, label: string) => {
    if (event.button !== 0) return;
    dragSession.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, jsx, label, active: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = dragSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!session.active && !passedDragThreshold(session.startX, session.startY, event.clientX, event.clientY)) return;
    if (!session.active) {
      session.active = true;
      ignoreNextClick.current = true;
      setInteractionMode("edit");
      setDraggedComponent(session.jsx);
    }
    event.preventDefault();
    const detail = { jsx: session.jsx, label: session.label, clientX: event.clientX, clientY: event.clientY };
    setDragPreview({ x: event.clientX, y: event.clientY, label: session.label });
    dispatchComponentDrag(componentDragMoveEvent, detail);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = dragSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.active) {
      event.preventDefault();
      dispatchComponentDrag(componentDragDropEvent, { jsx: session.jsx, label: session.label, clientX: event.clientX, clientY: event.clientY });
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragSession.current = undefined;
    setDragPreview(undefined);
    setDraggedComponent(undefined);
    if (session.active) window.setTimeout(() => { ignoreNextClick.current = false; }, 0);
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = dragSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragSession.current = undefined;
    ignoreNextClick.current = false;
    setDragPreview(undefined);
    setDraggedComponent(undefined);
  };

  const addOnClick = (event: ReactMouseEvent<HTMLButtonElement>, jsx: string) => {
    if (ignoreNextClick.current) {
      ignoreNextClick.current = false;
      event.preventDefault();
      return;
    }
    void insert(jsx);
  };
  const ownItems = useMemo(() => reusableComponents.filter((item) => {
    if (category !== "Tutti" && category !== "Del tuo progetto") return false;
    const text = `${item.name} ${item.file}`.toLocaleLowerCase("it");
    return text.includes(deferredQuery);
  }), [category, deferredQuery, reusableComponents]);
  const items = useMemo(() => componentRegistry.all().filter((item) => {
    const matchesCategory = category === "Tutti" || item.category === category;
    const text = `${item.name} ${item.description} ${item.keywords ?? ""} ${item.category}`.toLocaleLowerCase("it");
    return matchesCategory && text.includes(deferredQuery);
  }), [category, deferredQuery]);
  return <div className="panel-content">
    <div className="panel-title"><span>AGGIUNGI ELEMENTI</span><small>{componentRegistry.all().length + reusableComponents.length}</small></div>
    <p className="panel-help"><strong>Trascina un elemento sulla pagina</strong> e rilascialo nel punto desiderato. Un click lo aggiunge invece vicino all’elemento selezionato.</p>
    <label className="search-field"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca un componente" /></label>
    <div className="component-filters" aria-label="Categorie componenti">
      {(["Tutti", ...(reusableComponents.length ? ["Del tuo progetto" as const] : []), ...componentRegistry.categories()] as const).map((item) => <button type="button" key={item}
        className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}
    </div>
    <p className="component-count">{items.length + ownItems.length} {items.length + ownItems.length === 1 ? "componente" : "componenti"}</p>
    {ownItems.length > 0 && <section className="component-group project-component-group">
      <h3>GIÀ NEL TUO PROGETTO <span>{ownItems.length}</span></h3>
      <p>Componenti React già presenti, con le proprietà reali viste nel pannello.</p>
      <div className="component-grid">
        {ownItems.map((item) => {
          const jsx = projectComponentJsx(item);
          return <button key={`${item.file}:${item.exported}`} className={`component-card ${draggedComponent === jsx ? "dragging" : ""}`}
            title={`${item.name}: componente già presente nel progetto. Trascinalo nel punto desiderato`}
            onPointerDown={(event) => beginDrag(event, jsx, item.name)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={cancelDrag}
            onClick={(event) => addOnClick(event, jsx)}>
            <Blocks size={17} /><span>{item.name}</span><small>{item.usageCount ? `usato ${item.usageCount} ${item.usageCount === 1 ? "volta" : "volte"}` : "pronto da usare"}</small>
          </button>;
        })}
      </div>
    </section>}
    {componentRegistry.categories().map((category) => {
      const categoryItems = items.filter((item) => item.category === category);
      if (!categoryItems.length) return null;
      return <section className="component-group" key={category}>
        <h3>{category}</h3>
        <div className="component-grid">
          {categoryItems.map(({ type, name, description, icon: Icon, createJsx }) => {
            const jsx = createJsx();
            return <button key={type} className={`component-card ${draggedComponent === jsx ? "dragging" : ""}`} title={`${name}: ${description}. Trascinalo nel punto desiderato`}
              onPointerDown={(event) => beginDrag(event, jsx, name)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={cancelDrag}
              onClick={(event) => addOnClick(event, jsx)}><Icon size={17} /><span>{name}</span><small>{description}</small></button>;
          })}
        </div>
      </section>;
    })}
    {!items.length && !ownItems.length && <div className="component-empty"><Search size={18} /><strong>Nessun componente trovato</strong><span>Prova un'altra parola o scegli Tutti.</span></div>}
    {dragPreview && createPortal(<div className="component-drag-preview" style={{ left: dragPreview.x + 14, top: dragPreview.y + 14 }} role="status">
      <Blocks size={15} /><span>{dragPreview.label}</span><small>Rilascia nella pagina</small>
    </div>, document.body)}
  </div>;
}
