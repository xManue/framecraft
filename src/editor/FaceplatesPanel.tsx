import { AlertTriangle, Box, Check, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  emptyHmiFaceplateCatalog,
  hmiFaceplateCatalogName,
  hmiFaceplateEventParameterTypes,
  hmiFaceplatePropertyTypes,
  hmiFaceplateVisualObjectTypes,
  hmiFaceplateVisualProperties,
  hmiFaceplateTypeIssues,
  parseHmiFaceplateCatalog,
  serializeHmiFaceplateCatalog,
  type HmiFaceplateCatalog,
  type HmiFaceplateTypeDefinition,
  type HmiFaceplateVisualBinding,
  type HmiFaceplateVisualObject,
  type HmiFaceplateVisualObjectType,
} from "../core/hmiFaceplates";
import { joinProjectPath } from "../core/paths";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";

const tagTypes = ["Bool", "Int", "DInt", "LInt", "UInt", "UDInt", "ULInt", "Real", "LReal", "String", "WString", "DateTime", "LTime", "Array", "HMIUDT"];
const typeKey = (type: Pick<HmiFaceplateTypeDefinition, "id" | "version">) => `${type.id}@${type.version}`;
const mappedValue = (record: Record<string, string>, name: string, value: string) => {
  const next = { ...record };
  if (value) next[name] = value; else delete next[name];
  return next;
};

function newType(catalog: HmiFaceplateCatalog): HmiFaceplateTypeDefinition {
  let index = catalog.types.length + 1;
  const ids = new Set(catalog.types.map((type) => type.id));
  while (ids.has(`faceplate-${index}`)) index += 1;
  return { id: `faceplate-${index}`, name: `Faceplate ${index}`, version: "0.0.1", status: "draft", width: 240, height: 120, interfaceTags: [], interfaceProperties: [], interfaceEvents: [], localTags: [], visualization: [], nestedInstances: [] };
}

export function FaceplatesPanel() {
  const project = useEditorStore((state) => state.project);
  const stored = useEditorStore((state) => state.faceplateCatalog);
  const refresh = useEditorStore((state) => state.refreshFaceplateCatalog);
  const [catalog, setCatalog] = useState(() => emptyHmiFaceplateCatalog());
  const [selectedKey, setSelectedKey] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setCatalog(stored); setSelectedKey((current) => stored.types.some((type) => typeKey(type) === current) ? current : stored.types[0] ? typeKey(stored.types[0]) : undefined);
    setDirty(false); setSaved(false); setError(undefined);
  }, [stored]);

  const selected = catalog.types.find((type) => typeKey(type) === selectedKey);
  const issues = useMemo(() => selected ? hmiFaceplateTypeIssues(selected, catalog) : [], [selected, catalog]);
  const nestedCandidates = catalog.types.filter((candidate) => candidate.status === "released" && (!selected || typeKey(candidate) !== typeKey(selected)));
  const change = (next: HmiFaceplateCatalog) => { setCatalog(next); setDirty(true); setSaved(false); setError(undefined); };
  const replaceSelected = (next: HmiFaceplateTypeDefinition) => {
    change({ ...catalog, types: catalog.types.map((type) => typeKey(type) === selectedKey ? next : type) });
    setSelectedKey(typeKey(next));
  };
  const patch = (values: Partial<HmiFaceplateTypeDefinition>) => selected?.status === "draft" && replaceSelected({ ...selected, ...values });

  const addType = () => {
    const type = newType(catalog);
    change({ ...catalog, types: [...catalog.types, type] });
    setSelectedKey(typeKey(type));
  };
  const removeType = () => {
    if (selected?.status === "released") { setError("Una versione rilasciata è immutabile. Crea una nuova bozza invece di eliminarla."); return; }
    if (!selected || !window.confirm(`Eliminare «${selected.name}» V${selected.version}? Le istanze verranno segnalate dal controllo pannello.`)) return;
    const remaining = catalog.types.filter((type) => typeKey(type) !== selectedKey);
    change({ ...catalog, types: remaining });
    setSelectedKey(remaining[0] ? typeKey(remaining[0]) : undefined);
  };
  const createDraft = () => {
    if (!selected) return;
    const parts = selected.version.split(".").map(Number);
    let patchNumber = Number.isFinite(parts[2]) ? parts[2] + 1 : 1;
    while (catalog.types.some((type) => type.id === selected.id && type.version === `${parts[0] || 0}.${parts[1] || 0}.${patchNumber}`)) patchNumber += 1;
    const draft = { ...selected, version: `${parts[0] || 0}.${parts[1] || 0}.${patchNumber}`, status: "draft" as const };
    change({ ...catalog, types: [...catalog.types, draft] });
    setSelectedKey(typeKey(draft));
  };
  const automaticNestedBindings = (target: HmiFaceplateTypeDefinition) => ({
    tagBindings: Object.fromEntries(target.interfaceTags.flatMap((inner) => selected?.interfaceTags.some((outer) => outer.name === inner.name && outer.dataType === inner.dataType) ? [[inner.name, inner.name]] : [])),
    propertyBindings: Object.fromEntries(target.interfaceProperties.flatMap((inner) => selected?.interfaceProperties.some((outer) => outer.name === inner.name && outer.dataType === inner.dataType) ? [[inner.name, inner.name]] : [])),
  });
  const addNested = () => {
    if (!selected || !nestedCandidates[0]) { setError("Rilascia prima un altro tipo faceplate da poter annidare."); return; }
    let index = selected.nestedInstances.length + 1;
    const ids = new Set(selected.nestedInstances.map((item) => item.id));
    while (ids.has(`Nested_${index}`)) index += 1;
    const target = nestedCandidates[0];
    patch({ nestedInstances: [...selected.nestedInstances, { id: `Nested_${index}`, typeId: target.id, version: target.version, left: 0, top: 0, width: target.width, height: target.height, ...automaticNestedBindings(target) }] });
  };
  const patchNested = (index: number, values: Partial<HmiFaceplateTypeDefinition["nestedInstances"][number]>) => selected && patch({ nestedInstances: selected.nestedInstances.map((item, current) => current === index ? { ...item, ...values } : item) });
  const selectNestedType = (index: number, value: string) => {
    const target = catalog.types.find((candidate) => typeKey(candidate) === value);
    if (target) patchNested(index, { typeId: target.id, version: target.version, ...automaticNestedBindings(target) });
  };
  const save = async () => {
    if (!project) return;
    const allIssues = catalog.types.flatMap((type) => hmiFaceplateTypeIssues(type, catalog));
    if (allIssues.some((issue) => issue.severity === "error")) { setError("Correggi gli errori dei tipi prima di salvare."); return; }
    setSaving(true); setError(undefined);
    try {
      await desktopBridge.writeFile(joinProjectPath(project.root, hmiFaceplateCatalogName), serializeHmiFaceplateCatalog(catalog));
      await refresh(); setDirty(false); setSaved(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  };

  return <div className="faceplates-panel">
    <div className="panel-title"><span>FACEPLATE</span><button type="button" onClick={addType} title="Nuovo tipo faceplate"><Plus size={14} /></button></div>
    <p className="panel-description">Tipi riusabili, versioni e interfacce Unified. Solo le versioni rilasciate possono essere assegnate alle istanze.</p>
    <div className="faceplate-type-list">
      {catalog.types.map((type) => <button type="button" key={typeKey(type)} className={typeKey(type) === selectedKey ? "active" : ""} onClick={() => setSelectedKey(typeKey(type))}>
        <Box size={14} /><span><strong>{type.name}</strong><small>V{type.version} · {type.status === "released" ? "rilasciato" : "bozza"}</small></span>
      </button>)}
      {!catalog.types.length && <p className="empty-panel-message">Nessun tipo. Creane uno oppure usa quelli inclusi nel nuovo pannello standard.</p>}
    </div>

    {selected && <div className="faceplate-editor">
      <div className="faceplate-editor-head"><strong>{selected.name}</strong><button type="button" disabled={selected.status === "released"} onClick={removeType} title={selected.status === "released" ? "Le versioni rilasciate sono immutabili" : "Elimina tipo"}><Trash2 size={14} /></button></div>
      <fieldset className="faceplate-version-fields" disabled={selected.status === "released"}>
      <div className="faceplate-grid">
        <label><span>Nome tipo</span><input value={selected.name} onChange={(event) => patch({ name: event.target.value })} /></label>
        <label><span>Versione</span><input value={selected.version} placeholder="0.0.1" onChange={(event) => patch({ version: event.target.value.replace(/^V/i, "") })} /></label>
        <label><span>Larghezza</span><input type="number" min="1" value={selected.width} onChange={(event) => patch({ width: Number(event.target.value) })} /></label>
        <label><span>Altezza</span><input type="number" min="1" value={selected.height} onChange={(event) => patch({ height: Number(event.target.value) })} /></label>
      </div>
      <label className="faceplate-source"><span>Sorgente / riferimento</span><input value={selected.source ?? ""} placeholder="src/faceplates/Motor.tsx" onChange={(event) => patch({ source: event.target.value || undefined })} /></label>
      <FaceplateVisualizationEditor type={selected} onChange={(visualization) => patch({ visualization })} />
      <FaceplateSection title="Tag di interfaccia" hint="Collegamento standard fra istanza e automazione" onAdd={() => patch({ interfaceTags: [...selected.interfaceTags, { name: `Tag_${selected.interfaceTags.length + 1}`, dataType: "Bool", required: true }] })}>
        {selected.interfaceTags.map((tag, index) => <div className="faceplate-contract-row" key={`${tag.name}-${index}`}>
          <input value={tag.name} aria-label="Nome tag interfaccia" onChange={(event) => patch({ interfaceTags: selected.interfaceTags.map((item, current) => current === index ? { ...item, name: event.target.value } : item) })} />
          <select value={tag.dataType} aria-label="Tipo tag interfaccia" onChange={(event) => patch({ interfaceTags: selected.interfaceTags.map((item, current) => current === index ? { ...item, dataType: event.target.value } : item) })}>{tagTypes.map((type) => <option key={type}>{type}</option>)}</select>
          <label className="faceplate-required"><input type="checkbox" checked={Boolean(tag.required)} onChange={(event) => patch({ interfaceTags: selected.interfaceTags.map((item, current) => current === index ? { ...item, required: event.target.checked || undefined } : item) })} /> obbligatorio</label>
          <button type="button" aria-label={`Elimina ${tag.name}`} onClick={() => patch({ interfaceTags: selected.interfaceTags.filter((_, current) => current !== index) })}><Trash2 size={12} /></button>
        </div>)}
      </FaceplateSection>

      <FaceplateSection title="Proprietà di interfaccia" hint="Valori configurabili per ogni istanza" onAdd={() => patch({ interfaceProperties: [...selected.interfaceProperties, { name: `Property_${selected.interfaceProperties.length + 1}`, dataType: "ConfigurationString" }] })}>
        {selected.interfaceProperties.map((property, index) => <div className="faceplate-contract-row" key={`${property.name}-${index}`}>
          <input value={property.name} aria-label="Nome proprietà interfaccia" onChange={(event) => patch({ interfaceProperties: selected.interfaceProperties.map((item, current) => current === index ? { ...item, name: event.target.value } : item) })} />
          <select value={property.dataType} aria-label="Tipo proprietà interfaccia" onChange={(event) => patch({ interfaceProperties: selected.interfaceProperties.map((item, current) => current === index ? { ...item, dataType: event.target.value as typeof item.dataType } : item) })}>{hmiFaceplatePropertyTypes.map((type) => <option key={type}>{type}</option>)}</select>
          <input value={String(property.defaultValue ?? "")} placeholder="default" aria-label="Valore predefinito" onChange={(event) => patch({ interfaceProperties: selected.interfaceProperties.map((item, current) => current === index ? { ...item, defaultValue: event.target.value || undefined } : item) })} />
          <button type="button" aria-label={`Elimina ${property.name}`} onClick={() => patch({ interfaceProperties: selected.interfaceProperties.filter((_, current) => current !== index) })}><Trash2 size={12} /></button>
        </div>)}
      </FaceplateSection>

      <FaceplateSection title="Eventi di interfaccia" hint="L'istanza decide quale script eseguire" onAdd={() => patch({ interfaceEvents: [...selected.interfaceEvents, { name: `Event_${selected.interfaceEvents.length + 1}`, parameters: [] }] })}>
        {selected.interfaceEvents.map((event, index) => <div className="faceplate-event" key={`${event.name}-${index}`}>
          <div className="faceplate-contract-row"><input value={event.name} aria-label="Nome evento interfaccia" onChange={(changeEvent) => patch({ interfaceEvents: selected.interfaceEvents.map((item, current) => current === index ? { ...item, name: changeEvent.target.value } : item) })} /><button type="button" onClick={() => patch({ interfaceEvents: selected.interfaceEvents.map((item, current) => current === index ? { ...item, parameters: [...item.parameters, { name: `Parameter_${item.parameters.length + 1}`, dataType: "Int" }] } : item) })}><Plus size={12} /> parametro</button><span /><button type="button" aria-label={`Elimina ${event.name}`} onClick={() => patch({ interfaceEvents: selected.interfaceEvents.filter((_, current) => current !== index) })}><Trash2 size={12} /></button></div>
          {event.parameters.map((parameter, parameterIndex) => <div className="faceplate-parameter" key={`${parameter.name}-${parameterIndex}`}><input value={parameter.name} aria-label="Nome parametro evento" onChange={(changeEvent) => patch({ interfaceEvents: selected.interfaceEvents.map((item, current) => current === index ? { ...item, parameters: item.parameters.map((entry, currentParameter) => currentParameter === parameterIndex ? { ...entry, name: changeEvent.target.value } : entry) } : item) })} /><select value={parameter.dataType} aria-label="Tipo parametro evento" onChange={(changeEvent) => patch({ interfaceEvents: selected.interfaceEvents.map((item, current) => current === index ? { ...item, parameters: item.parameters.map((entry, currentParameter) => currentParameter === parameterIndex ? { ...entry, dataType: changeEvent.target.value as typeof entry.dataType } : entry) } : item) })}>{hmiFaceplateEventParameterTypes.map((type) => <option key={type}>{type}</option>)}</select><button type="button" aria-label={`Elimina ${parameter.name}`} onClick={() => patch({ interfaceEvents: selected.interfaceEvents.map((item, current) => current === index ? { ...item, parameters: item.parameters.filter((_, currentParameter) => currentParameter !== parameterIndex) } : item) })}><Trash2 size={12} /></button></div>)}
        </div>)}
      </FaceplateSection>

      <FaceplateSection title="Tag locali" hint="Stato isolato: non compare nell'istanza" onAdd={() => patch({ localTags: [...selected.localTags, { name: `Local_${selected.localTags.length + 1}`, dataType: "Bool" }] })}>
        {selected.localTags.map((tag, index) => <div className="faceplate-contract-row" key={`${tag.name}-${index}`}>
          <input value={tag.name} aria-label="Nome tag locale" onChange={(event) => patch({ localTags: selected.localTags.map((item, current) => current === index ? { ...item, name: event.target.value } : item) })} />
          <select value={tag.dataType} aria-label="Tipo tag locale" onChange={(event) => patch({ localTags: selected.localTags.map((item, current) => current === index ? { ...item, dataType: event.target.value } : item) })}>{tagTypes.map((type) => <option key={type}>{type}</option>)}</select>
          <input value={tag.startValue ?? ""} placeholder="valore iniziale" aria-label="Valore iniziale tag locale" onChange={(event) => patch({ localTags: selected.localTags.map((item, current) => current === index ? { ...item, startValue: event.target.value || undefined } : item) })} />
          <button type="button" aria-label={`Elimina ${tag.name}`} onClick={() => patch({ localTags: selected.localTags.filter((_, current) => current !== index) })}><Trash2 size={12} /></button>
        </div>)}
      </FaceplateSection>

      <FaceplateSection title="Faceplate annidati" hint="Collega l'interfaccia interna a quella del tipo esterno" onAdd={addNested}>
        {selected.nestedInstances.map((nested, index) => {
          const target = catalog.types.find((candidate) => candidate.id === nested.typeId && candidate.version === nested.version);
          return <article className="faceplate-nested" key={`${nested.id}-${index}`}>
            <div className="faceplate-nested-head"><input value={nested.id} aria-label="Nome istanza annidata" onChange={(event) => patchNested(index, { id: event.target.value })} /><select value={`${nested.typeId}@${nested.version}`} aria-label="Tipo faceplate annidato" onChange={(event) => selectNestedType(index, event.target.value)}>{[...new Map([...(target ? [[typeKey(target), target] as const] : []), ...nestedCandidates.map((candidate) => [typeKey(candidate), candidate] as const)]).values()].map((candidate) => <option key={typeKey(candidate)} value={typeKey(candidate)}>{candidate.name} · V{candidate.version}</option>)}</select><button type="button" aria-label={`Elimina ${nested.id}`} onClick={() => patch({ nestedInstances: selected.nestedInstances.filter((_, current) => current !== index) })}><Trash2 size={12} /></button></div>
            <div className="faceplate-nested-geometry">
              <label><span>X</span><input type="number" value={nested.left} onChange={(event) => patchNested(index, { left: Number(event.target.value) })} /></label>
              <label><span>Y</span><input type="number" value={nested.top} onChange={(event) => patchNested(index, { top: Number(event.target.value) })} /></label>
              <label><span>L</span><input type="number" min="1" value={nested.width} onChange={(event) => patchNested(index, { width: Number(event.target.value) })} /></label>
              <label><span>H</span><input type="number" min="1" value={nested.height} onChange={(event) => patchNested(index, { height: Number(event.target.value) })} /></label>
            </div>
            {target?.interfaceTags.map((inner) => <label className="faceplate-nested-map" key={`tag-${inner.name}`}><span>{inner.name} · {inner.dataType}{inner.required ? " *" : ""}</span><select value={nested.tagBindings[inner.name] ?? ""} onChange={(event) => patchNested(index, { tagBindings: mappedValue(nested.tagBindings, inner.name, event.target.value) })}><option value="">Non collegato</option>{selected.interfaceTags.map((outer) => <option key={outer.name} value={outer.name}>{outer.name} · {outer.dataType}</option>)}</select></label>)}
            {target?.interfaceProperties.map((inner) => <label className="faceplate-nested-map" key={`property-${inner.name}`}><span>{inner.name} · {inner.dataType}</span><select value={nested.propertyBindings[inner.name] ?? ""} onChange={(event) => patchNested(index, { propertyBindings: mappedValue(nested.propertyBindings, inner.name, event.target.value) })}><option value="">Non collegata</option>{selected.interfaceProperties.map((outer) => <option key={outer.name} value={outer.name}>{outer.name} · {outer.dataType}</option>)}</select></label>)}
          </article>;
        })}
      </FaceplateSection>
      </fieldset>

      <div className="faceplate-release-row"><span className={`faceplate-status ${selected.status}`}>{selected.status === "released" ? "Versione rilasciata e immutabile" : "Bozza modificabile"}</span><button type="button" disabled={selected.status === "draft" && issues.some((issue) => issue.severity === "error")} onClick={() => selected.status === "released" ? createDraft() : patch({ status: "released" })}>{selected.status === "released" ? "Crea nuova versione" : "Rilascia versione"}</button></div>

      {issues.length > 0 && <div className="faceplate-issues"><strong><AlertTriangle size={13} /> Controlli</strong>{issues.map((issue, index) => <p className={issue.severity} key={index}>{issue.message}</p>)}</div>}
    </div>}

    <div className="faceplate-save"><button type="button" disabled={!project || saving || !dirty} onClick={save}><Save size={14} /> {saving ? "Salvataggio..." : "Salva catalogo"}</button>{saved && <span><Check size={13} /> salvato</span>}</div>
    {error && <p className="panel-error"><AlertTriangle size={13} /> {error}</p>}
  </div>;
}

function FaceplateSection({ title, hint, onAdd, children }: { title: string; hint: string; onAdd: () => void; children: ReactNode }) {
  return <section className="faceplate-section"><header><span><strong>{title}</strong><small>{hint}</small></span><button type="button" onClick={onAdd}><Plus size={12} /> Aggiungi</button></header>{children}</section>;
}

const visualLabels: Record<HmiFaceplateVisualObjectType, string> = {
  rectangle: "Rettangolo", ellipse: "Ellisse", text: "Testo", "io-field": "Campo I/O",
  button: "Pulsante", bar: "Barra", graphic: "Grafica",
};

function faceplatePreviewColor(value: string | undefined, fallback: string): string {
  const hex = value?.replace("#", "") ?? "";
  return /^[0-9a-f]{8}$/i.test(hex) ? `#${hex.slice(2)}` : value || fallback;
}

function defaultVisualObject(type: HmiFaceplateVisualObjectType, existing: readonly HmiFaceplateVisualObject[]): HmiFaceplateVisualObject {
  const prefix = type.replace("-", "_"); let index = existing.length + 1;
  const ids = new Set(existing.map((object) => object.id)); while (ids.has(`${prefix}_${index}`)) index += 1;
  return {
    id: `${prefix}_${index}`, type, left: 8, top: 8,
    width: type === "text" ? 120 : type === "bar" ? 160 : type === "graphic" ? 100 : 90,
    height: type === "text" ? 28 : type === "bar" ? 24 : type === "graphic" ? 80 : 44,
    text: type === "button" ? "Comando" : type === "text" ? "Testo" : undefined,
    backColor: type === "button" ? "#FF3F464C" : type === "bar" ? "#FF00A1D1" : "#FFF4F6F7",
    foreColor: type === "button" ? "#FFFFFFFF" : "#FF20262B", borderColor: "#FF8A949B", bindings: [],
  };
}

function FaceplateVisualizationEditor({ type, onChange }: { type: HmiFaceplateTypeDefinition; onChange: (visualization: HmiFaceplateVisualObject[]) => void }) {
  const [selectedId, setSelectedId] = useState<string>();
  const dragCleanup = useRef<(() => void) | undefined>(undefined);
  useEffect(() => { setSelectedId((current) => type.visualization.some((object) => object.id === current) ? current : type.visualization[0]?.id); }, [type.id, type.version, type.visualization]);
  useEffect(() => () => dragCleanup.current?.(), []);
  const selected = type.visualization.find((object) => object.id === selectedId);
  const replace = (id: string, values: Partial<HmiFaceplateVisualObject>) => onChange(type.visualization.map((object) => object.id === id ? { ...object, ...values } : object));
  const add = (kind: HmiFaceplateVisualObjectType) => {
    const object = defaultVisualObject(kind, type.visualization); onChange([...type.visualization, object]); setSelectedId(object.id);
  };
  const remove = () => {
    if (!selected) return; const remaining = type.visualization.filter((object) => object.id !== selected.id);
    onChange(remaining); setSelectedId(remaining[0]?.id);
  };
  const startDrag = (event: ReactPointerEvent<HTMLElement>, object: HmiFaceplateVisualObject) => {
    if (type.status === "released" || event.button !== 0) return;
    event.preventDefault(); setSelectedId(object.id);
    const canvas = event.currentTarget.parentElement; const rect = canvas?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const start = { x: event.clientX, y: event.clientY, left: object.left, top: object.top };
    const move = (pointer: PointerEvent) => replace(object.id, {
      left: Math.max(0, Math.min(type.width - object.width, Math.round(start.left + (pointer.clientX - start.x) * type.width / rect.width))),
      top: Math.max(0, Math.min(type.height - object.height, Math.round(start.top + (pointer.clientY - start.y) * type.height / rect.height))),
    });
    const finish = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); dragCleanup.current = undefined; };
    dragCleanup.current?.(); dragCleanup.current = finish;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish, { once: true });
  };
  const sourceOptions = [
    ...type.interfaceTags.map((item) => ({ key: `tag:${item.name}`, source: "tag" as const, name: item.name, label: `Tag · ${item.name}` })),
    ...type.interfaceProperties.map((item) => ({ key: `property:${item.name}`, source: "property" as const, name: item.name, label: `Proprietà · ${item.name}` })),
    ...type.localTags.map((item) => ({ key: `local:${item.name}`, source: "local" as const, name: item.name, label: `Locale · ${item.name}` })),
  ];
  const patchBinding = (index: number, value: Partial<HmiFaceplateVisualBinding>) => selected && replace(selected.id, { bindings: selected.bindings.map((binding, current) => current === index ? { ...binding, ...value } : binding) });
  return <section className="faceplate-visual-section" aria-label="Visualizzazione del tipo">
    <header><span><strong>Visualizzazione</strong><small>Trascina gli oggetti; tag, proprietà e locali ne pilotano l’aspetto nel Runtime.</small></span></header>
    <div className="faceplate-visual-toolbar" aria-label="Aggiungi oggetto visuale">{hmiFaceplateVisualObjectTypes.map((kind) => <button type="button" key={kind} onClick={() => add(kind)}><Plus size={11} /> {visualLabels[kind]}</button>)}</div>
    <div className="faceplate-visual-canvas-wrap"><div className="faceplate-visual-canvas" style={{ aspectRatio: `${type.width} / ${type.height}` }}>
      {type.visualization.map((object) => {
        const style = {
          left: `${object.left / type.width * 100}%`, top: `${object.top / type.height * 100}%`, width: `${object.width / type.width * 100}%`, height: `${object.height / type.height * 100}%`,
          background: faceplatePreviewColor(object.backColor, "#f4f6f7"), color: faceplatePreviewColor(object.foreColor, "#20262b"), borderColor: faceplatePreviewColor(object.borderColor, "#8a949b"),
          borderRadius: object.type === "ellipse" ? "50%" : "3px", fontSize: Math.max(7, Math.min(18, object.fontSize ?? 11)),
        };
        return <button type="button" key={object.id} className={`faceplate-visual-object ${selectedId === object.id ? "selected" : ""} ${object.type}`} style={style} onPointerDown={(event) => startDrag(event, object)} onClick={() => setSelectedId(object.id)} aria-label={`${visualLabels[object.type]} ${object.id}`}>
          {object.type === "graphic" ? "Grafica" : object.type === "bar" ? <i style={{ width: "58%", background: faceplatePreviewColor(object.backColor, "#00a1d1") }} /> : object.text || object.id}
        </button>;
      })}
      {type.nestedInstances.map((nested) => <span className="faceplate-visual-nested" key={nested.id} style={{ left: `${nested.left / type.width * 100}%`, top: `${nested.top / type.height * 100}%`, width: `${nested.width / type.width * 100}%`, height: `${nested.height / type.height * 100}%` }}>{nested.id}</span>)}
      {!type.visualization.length && !type.nestedInstances.length && <p>Tipo vuoto: aggiungi un oggetto come nel tab Visualization di Unified.</p>}
    </div></div>
    {selected && <div className="faceplate-visual-properties">
      <div className="faceplate-visual-properties-head"><strong>{selected.id}</strong><button type="button" onClick={remove} aria-label={`Elimina ${selected.id}`}><Trash2 size={12} /></button></div>
      <div className="faceplate-visual-geometry">
        <label><span>Nome</span><input value={selected.id} onChange={(event) => { const id = event.target.value; replace(selected.id, { id }); setSelectedId(id); }} /></label>
        <label><span>Tipo</span><select value={selected.type} onChange={(event) => replace(selected.id, { type: event.target.value as HmiFaceplateVisualObjectType })}>{hmiFaceplateVisualObjectTypes.map((kind) => <option key={kind} value={kind}>{visualLabels[kind]}</option>)}</select></label>
        {(["left", "top", "width", "height"] as const).map((name) => <label key={name}><span>{{ left: "X", top: "Y", width: "L", height: "H" }[name]}</span><input type="number" min={name === "width" || name === "height" ? 1 : undefined} value={selected[name]} onChange={(event) => replace(selected.id, { [name]: Number(event.target.value) })} /></label>)}
      </div>
      <div className="faceplate-visual-appearance">
        <label><span>Testo</span><input value={selected.text ?? ""} onChange={(event) => replace(selected.id, { text: event.target.value || undefined })} /></label>
        <label><span>Sfondo</span><input value={selected.backColor ?? ""} onChange={(event) => replace(selected.id, { backColor: event.target.value || undefined })} /></label>
        <label><span>Testo colore</span><input value={selected.foreColor ?? ""} onChange={(event) => replace(selected.id, { foreColor: event.target.value || undefined })} /></label>
        <label><span>Bordo</span><input value={selected.borderColor ?? ""} onChange={(event) => replace(selected.id, { borderColor: event.target.value || undefined })} /></label>
      </div>
      <div className="faceplate-visual-bindings"><div><strong>Dinamizzazioni</strong><button type="button" disabled={!sourceOptions.length} onClick={() => { const source = sourceOptions[0]; if (source) replace(selected.id, { bindings: [...selected.bindings, { property: selected.type === "bar" || selected.type === "io-field" ? "ProcessValue" : "Text", source: source.source, name: source.name }] }); }}><Plus size={11} /> Collega</button></div>
        {selected.bindings.map((binding, index) => <div className="faceplate-visual-binding" key={`${binding.property}-${index}`}><select aria-label="Proprietà visuale" value={binding.property} onChange={(event) => patchBinding(index, { property: event.target.value as HmiFaceplateVisualBinding["property"] })}>{hmiFaceplateVisualProperties.map((property) => <option key={property}>{property}</option>)}</select><select aria-label="Sorgente visuale" value={`${binding.source}:${binding.name}`} onChange={(event) => { const source = sourceOptions.find((item) => item.key === event.target.value); if (source) patchBinding(index, { source: source.source, name: source.name }); }}>{sourceOptions.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}</select><button type="button" aria-label="Elimina dinamizzazione" onClick={() => replace(selected.id, { bindings: selected.bindings.filter((_, current) => current !== index) })}><Trash2 size={11} /></button></div>)}
      </div>
      <label className="faceplate-visual-event"><span>Evento al click</span><select value={selected.event?.name ?? ""} onChange={(event) => replace(selected.id, { event: event.target.value ? { name: event.target.value, parameters: {} } : undefined })}><option value="">Nessuno</option>{type.interfaceEvents.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
    </div>}
  </section>;
}
