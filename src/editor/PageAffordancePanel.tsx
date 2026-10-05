import { useCallback, useEffect, useMemo, useState } from "react";
import { Cable, Crosshair, MapPin, Plus, SlidersHorizontal, Spline, Trash2, X } from "lucide-react";
import { fieldValue, type Affordance, type AffordanceField } from "../core/panelManifest";
import type { DataItem, DataValue } from "../source-parser/dataList";
import { useEditorStore } from "../state/editorStore";

/** What the open page says can be added to it, and nothing else.
 *
 * Questo pannello non sa cos'è una zona di una macchina né una funzione speciale: legge la
 * dichiarazione del `panel.json` — quale lista, quali campi, cosa si può farci — e disegna i campi
 * che quella dichiara. Un pannello che dichiara un'altra cosa ottiene un'altra scheda senza toccare
 * l'editor. */
export function PageAffordancePanel() {
  const affordances = useEditorStore((state) => state.activeAffordances());
  const documentVersion = useEditorStore((state) => state.document?.version);
  const [openId, setOpenId] = useState<string>();
  const affordance = affordances.find((item) => item.id === openId) ?? affordances[0];

  if (!affordance) return <div className="panel-content"><div className="panel-title"><span>QUESTA PAGINA</span></div>
    <p className="panel-help">Questa pagina non dichiara niente di modificabile: usa gli altri pannelli.</p></div>;

  return <div className="panel-content affordance-panel">
    {affordances.length > 1 && <div className="affordance-tabs" role="tablist">
      {affordances.map((item) => <button key={item.id} role="tab" aria-selected={item.id === affordance.id}
        className={item.id === affordance.id ? "active" : ""} onClick={() => setOpenId(item.id)}>
        {item.type === "image-zones" ? <MapPin size={12} /> : <SlidersHorizontal size={12} />}{item.label}
      </button>)}
    </div>}
    <AffordanceEditor key={`${affordance.id}-${documentVersion ?? 0}`} affordance={affordance} />
  </div>;
}

/** How a new item is named, read from the manifest: a zone takes the machine part it belongs to,
 * a setting takes the name the user types. */
function creationMode(affordance: Affordance) {
  const template = String(affordance.defaults?.id ?? "");
  if (template.includes("{partId}")) return "reference" as const;
  return "name" as const;
}

function slug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "voce";
}

function AffordanceEditor({ affordance }: { affordance: Affordance }) {
  const readItems = useEditorStore((state) => state.readAffordanceItems);
  const readReference = useEditorStore((state) => state.readAffordanceReference);
  const addItem = useEditorStore((state) => state.addAffordanceItem);
  const removeItem = useEditorStore((state) => state.removeAffordanceItem);
  const updateItem = useEditorStore((state) => state.updateAffordanceItem);
  const beginPicking = useEditorStore((state) => state.beginZonePicking);
  const picking = useEditorStore((state) => state.zonePicking);
  const [items, setItems] = useState<DataItem[]>([]);
  const [references, setReferences] = useState<{ id: string; label: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const reload = useCallback(() => { void readItems(affordance).then(setItems); }, [affordance, readItems]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const name = Object.keys(affordance.references ?? {})[0];
    if (name) void readReference(affordance, name).then(setReferences);
  }, [affordance, readReference]);

  const selected = items.find((item) => item.id === selectedId);
  const referenceField = affordance.fields.find((field) => field.type === "reference");
  const pointField = affordance.fields.find((field) => field.type === "point");
  const mode = creationMode(affordance);
  // Le voci di riferimento che non sono ancora state usate: sono quelle che ha senso aggiungere.
  const free = useMemo(() => references.filter((reference) =>
    !items.some((item) => referenceField && fieldValue(item, referenceField.path) === reference.id)), [items, referenceField, references]);

  const create = async (name: string, reference?: { id: string; label: string }) => {
    const defaults = { ...(affordance.defaults ?? {}) } as Record<string, DataValue>;
    const id = String(defaults.id ?? "{name}")
      .replace("{pageId}", String(defaults.pageId ?? ""))
      .replace("{partId}", reference?.id ?? "")
      .replace("{name}", slug(name));
    const item: DataItem = { ...defaults, id, label: name };
    if (reference && referenceField) item[referenceField.path] = reference.id;
    // Una zona senza posizione non si vedrebbe: parte al centro e si sposta indicandola sulla foto.
    if (pointField) item[pointField.path] = { x: 960, y: 544 };
    setAdding(false);
    setNewName("");
    await addItem(affordance, item);
    setSelectedId(id);
    reload();
    if (pointField) beginPicking(affordance.id, id, pointField.path, "point");
  };

  return <>
    <div className="panel-title"><span>{affordance.label.toUpperCase()}</span><small>{items.length}</small></div>
    {affordance.description && <p className="panel-help">{affordance.description}</p>}

    <div className="affordance-list">
      {items.map((item) => {
        const id = String(item.id);
        const active = id === selectedId;
        return <button key={id} className={`affordance-row ${active ? "active" : ""}`} onClick={() => setSelectedId(active ? undefined : id)}>
          {affordance.type === "image-zones" ? <MapPin size={13} /> : <SlidersHorizontal size={13} />}
          <span className="affordance-row-text"><strong>{String(item.label ?? id)}</strong>
            <small>{affordance.type === "image-zones"
              ? item.outline ? "con contorno" : "senza contorno"
              : `${String(item.control ?? "")}${item.tag ? ` · ${String(item.tag)}` : " · senza variabile"}`}</small></span>
        </button>;
      })}
      {!items.length && <p className="affordance-empty">Nessun elemento su questa pagina.</p>}

      {affordance.can.includes("add") && (adding
        ? <div className="affordance-add-list">
          <div className="affordance-add-heading"><strong>{mode === "reference" ? "Quale parte?" : "Come si chiama?"}</strong>
            <button onClick={() => setAdding(false)} aria-label="Annulla"><X size={13} /></button></div>
          {mode === "reference"
            ? <>
              {free.map((reference) => <button key={reference.id} onClick={() => void create(reference.label, reference)}>{reference.label}</button>)}
              {!free.length && <p className="affordance-empty">Tutte le parti hanno già un elemento qui.</p>}
            </>
            : <form onSubmit={(event) => { event.preventDefault(); if (newName.trim()) void create(newName.trim()); }}>
              <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Enable Metal Detector" />
              <button type="submit" disabled={!newName.trim()}>Aggiungi</button>
            </form>}
        </div>
        : <button className="affordance-add" onClick={() => setAdding(true)}><Plus size={14} /> Aggiungi</button>)}
    </div>

    {selected && <div className="affordance-detail">
      {affordance.fields.map((field) => <AffordanceFieldEditor
        key={field.path}
        affordance={affordance}
        field={field}
        item={selected}
        references={references}
        picking={picking?.itemId === String(selected.id) && picking.field === field.path}
        onChange={(value) => void updateItem(affordance, String(selected.id), field.path, value).then(reload)}
        onPick={() => beginPicking(affordance.id, String(selected.id), field.path, field.type === "path" ? "path" : "point")}
      />)}
      {affordance.can.includes("remove") && <button className="affordance-remove"
        onClick={() => { void removeItem(affordance, String(selected.id)).then(() => { setSelectedId(undefined); reload(); }); }}>
        <Trash2 size={13} /> Togli da questa pagina
      </button>}
    </div>}
  </>;
}

function AffordanceFieldEditor({ affordance, field, item, references, picking, onChange, onPick }: {
  affordance: Affordance;
  field: AffordanceField;
  item: DataItem;
  references: { id: string; label: string }[];
  picking: boolean;
  onChange: (value: unknown) => void;
  onPick: () => void;
}) {
  const plcVariables = useEditorStore((state) => state.plcVariables);
  const value = fieldValue(item, field.path);
  const [draft, setDraft] = useState(typeof value === "string" ? value : "");
  useEffect(() => { setDraft(typeof value === "string" ? value : ""); }, [value]);

  if (field.type === "point" || field.type === "path") {
    const point = value && typeof value === "object" && !Array.isArray(value) ? value as { x?: number; y?: number } : undefined;
    const summary = field.type === "path"
      ? (typeof value === "string" && value ? `${value.split(/[ML]/).length - 1} angoli` : "nessun contorno")
      : point ? `x ${Math.round(point.x ?? 0)} · y ${Math.round(point.y ?? 0)}` : "non indicata";
    return <div className="affordance-field">
      <span>{field.label}</span>
      <div className="affordance-pick">
        <em>{summary}</em>
        <button className={picking ? "active" : ""} onClick={onPick} disabled={!affordance.can.includes(field.type === "path" ? "outline" : "move")}>
          {field.type === "path" ? <Spline size={13} /> : <Crosshair size={13} />}
          {picking ? "Clicca sulla foto…" : field.type === "path" ? "Disegna" : "Indica"}
        </button>
      </div>
    </div>;
  }

  if (field.type === "tag") {
    // Il catalogo PLC del progetto è la fonte: si può anche scrivere un tag che non c'è ancora, e
    // resta scritto, ma quello che il pannello conosce davvero è a un click.
    return <label className="affordance-field"><span><Cable size={11} /> {field.label}</span>
      <input list={`fc-tags-${field.path}`} value={draft} placeholder="Machine.EnableUnscramblerCans"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        onBlur={() => { if (draft !== value) onChange(draft); }} />
      <datalist id={`fc-tags-${field.path}`}>
        {plcVariables.map((variable) => <option key={variable.name} value={variable.name}>{variable.description || variable.address || ""}</option>)}
      </datalist>
    </label>;
  }

  if (field.type === "reference" || field.type === "choice") {
    const options = field.type === "reference"
      ? references.map((reference) => ({ value: reference.id, label: reference.label }))
      : field.options ?? [];
    return <label className="affordance-field"><span>{field.label}</span>
      <select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || undefined)}>
        {field.optional && <option value="">Nessuna</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>;
  }

  return <label className="affordance-field"><span>{field.label}</span>
    <input value={draft} onChange={(event) => setDraft(event.target.value)}
      disabled={field.path === "label" && !affordance.can.includes("rename")}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      onBlur={() => { if (draft !== value) onChange(field.type === "number" ? Number(draft) : draft); }} />
  </label>;
}
