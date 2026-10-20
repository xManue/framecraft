import { useId, useState, type ReactNode } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { recipeDraftNumber, recipeNewId, type RecipeCatalog, type RecipeField, type RecipeScalar } from "../core/recipeConfiguration";

function Field({ label, value, onChange, numeric = false }: { label: string; value: string | number | undefined; onChange(value: string): void; numeric?: boolean }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const display = typeof value === "number" && !Number.isFinite(value) ? "" : value ?? "";
  return <label>{label}<input value={numeric && editing ? draft : display} inputMode={numeric ? "decimal" : undefined} onFocus={() => { setEditing(true); setDraft(String(display)); }} onBlur={() => setEditing(false)} onChange={event => { setDraft(event.target.value); onChange(event.target.value); }} /></label>;
}
function Value({ field, value, onChange }: { field: RecipeField; value: RecipeScalar | undefined; onChange(value: RecipeScalar): void }) {
  const help = useId();
  const [text, setText] = useState(value === undefined ? "" : String(value));
  if (field.type === "boolean") return <label>{field.name}<select aria-label={field.name} value={typeof value === "boolean" ? String(value) : ""} onChange={event => onChange(event.target.value === "" ? "" : event.target.value === "true")}><option value="">Scegli il valore</option><option value="false">Disattivato · false</option><option value="true">Attivato · true</option></select></label>;
  return <div className="recipe-value"><label>{field.name}{field.unit ? ` · ${field.unit}` : ""}<input aria-label={field.name + (field.unit ? ` · ${field.unit}` : "")} aria-describedby={help} value={text} inputMode={field.type === "string" ? "text" : "decimal"} onChange={event => { setText(event.target.value); onChange(field.type === "string" ? event.target.value : recipeDraftNumber(event.target.value)); }} /><small id={help}>{field.type === "integer" ? "Numero intero" : field.type === "number" ? "Numero" : "Testo"}{field.minimum !== undefined ? ` · minimo ${field.minimum}` : ""}{field.maximum !== undefined ? ` · massimo ${field.maximum}` : ""}{field.maxLength ? ` · fino a ${field.maxLength} caratteri` : ""}</small></label>
    {field.type === "string" && typeof value !== "string" && <button type="button" aria-label={`Usa testo vuoto per ${field.name}`} onClick={() => { setText(""); onChange(""); }}>Usa testo vuoto</button>}
  </div>;
}
export function RecipeCatalogEditor({ catalog, onChange, disabled = false, toolbar, children }: { catalog: RecipeCatalog; onChange(catalog: RecipeCatalog): void; disabled?: boolean; toolbar?: ReactNode; children?: ReactNode }) {
  const [schemaIndex, setSchemaIndex] = useState(0), [recordIndex, setRecordIndex] = useState(0);
  const [removal, setRemoval] = useState<"schema" | "record" | number>();
  const schema = catalog.schemas[schemaIndex], record = schema?.records[recordIndex];
  const change = (next: RecipeCatalog) => { onChange(next); setRemoval(undefined); };
  const patchSchema = (patch: Partial<RecipeCatalog["schemas"][number]>) => { if (schema) change({ ...catalog, schemas: catalog.schemas.map((item, index) => index === schemaIndex ? { ...item, ...patch } : item) }); };
  function remove() {
    if (!schema) return;
    if (removal === "schema") { change({ ...catalog, schemas: catalog.schemas.filter((_, index) => index !== schemaIndex) }); setSchemaIndex(0); setRecordIndex(0); }
    else if (removal === "record") { patchSchema({ records: schema.records.filter((_, index) => index !== recordIndex) }); setRecordIndex(0); }
    else if (typeof removal === "number") { const id = schema.fields[removal].id; patchSchema({ fields: schema.fields.filter((_, index) => index !== removal), records: schema.records.map(item => ({ ...item, values: Object.fromEntries(Object.entries(item.values).filter(([key]) => key !== id)) })) }); }
  }
  const addRecord = (copy = false) => {
    if (!schema || copy && !record) return;
    const id = recipeNewId(schema.records.map(item => item.id), "recipe");
    let name = copy ? `${record.name} · copia` : `Ricetta ${schema.records.length + 1}`; while (schema.records.some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) name += " nuova";
    patchSchema({ records: [...schema.records, { id, name, values: copy ? { ...record.values } : {} }] }); setRecordIndex(schema.records.length);
  };
  return <fieldset disabled={disabled}>
        <div className="recipe-toolbar"><label>Schema<select aria-label="Schema" value={schemaIndex} onChange={event => { setSchemaIndex(Number(event.target.value)); setRecordIndex(0); setRemoval(undefined); }}>{catalog.schemas.length ? catalog.schemas.map((item, index) => <option key={item.id} value={index}>{item.name || "Schema senza nome"}</option>) : <option value="0">Nessuno schema</option>}</select></label>
          <button type="button" disabled={catalog.schemas.length >= 32} onClick={() => { const id = recipeNewId(catalog.schemas.map(item => item.id), "schema"); change({ ...catalog, schemas: [...catalog.schemas, { id, name: `Schema ${id.split("-").at(-1)}`, fields: [], records: [] }] }); setSchemaIndex(catalog.schemas.length); setRecordIndex(0); }}><Plus size={16} /> Nuovo schema</button>
          {toolbar}</div>
        {children}
        {!schema && <p>Nessuno schema configurato. Crea uno schema, aggiungi i campi che servono al tuo impianto e poi le ricette. L’AI non è necessaria.</p>}
        {schema && <>
          <div className="alarm-fields"><Field label="Nome schema" value={schema.name} onChange={name => patchSchema({ name })} /><p className="recipe-id">ID interno: <code>{schema.id}</code></p><button type="button" onClick={() => setRemoval("schema")}><Trash2 size={16} /> Rimuovi schema</button></div>
          <h3>1. Campi dello schema</h3><p>Non scegliamo valori macchina al tuo posto. Cambiare tipo o aggiungere un campo può richiedere di completare tutte le ricette.</p>
          <div className="recipe-fields">{schema.fields.map((field, index) => {
            const patch = (next: Partial<RecipeField>) => patchSchema({ fields: schema.fields.map((item, i) => i === index ? { ...item, ...next } : item) });
            return <article key={field.id}><Field label="Nome campo" value={field.name} onChange={name => patch({ name })} /><label>Tipo<select aria-label="Tipo" value={field.type} onChange={event => { const type = event.target.value as RecipeField["type"]; patch({ type, minimum: undefined, maximum: undefined, maxLength: undefined }); }}><option value="number">Numero decimale</option><option value="integer">Numero intero</option><option value="boolean">Attivato / disattivato</option><option value="string">Testo</option></select></label>
              <Field label="Unità (facoltativa)" value={field.unit} onChange={unit => patch({ unit: unit || undefined })} />
              {["number", "integer"].includes(field.type) && <><Field label="Minimo (facoltativo)" numeric value={field.minimum} onChange={value => patch({ minimum: value === "" ? undefined : Number(value.trim() || NaN) })} /><Field label="Massimo (facoltativo)" numeric value={field.maximum} onChange={value => patch({ maximum: value === "" ? undefined : Number(value.trim() || NaN) })} /></>}
              {field.type === "string" && <Field label="Lunghezza massima (facoltativa)" numeric value={field.maxLength} onChange={value => patch({ maxLength: value === "" ? undefined : Number(value) })} />}
              <small>ID: {field.id}</small><button type="button" aria-label={`Rimuovi campo ${field.name}`} onClick={() => setRemoval(index)}><Trash2 size={16} /> Rimuovi campo</button></article>;
          })}</div><button type="button" disabled={schema.fields.length >= 64} onClick={() => { const id = recipeNewId(schema.fields.map(item => item.id), "field"); patchSchema({ fields: [...schema.fields, { id, name: `Parametro ${id.split("-").at(-1)}`, type: "number" }] }); }}><Plus size={16} /> Aggiungi campo</button>
          <h3>2. Ricette iniziali</h3><div className="recipe-toolbar"><label>Ricetta<select aria-label="Ricetta" value={recordIndex} onChange={event => { setRecordIndex(Number(event.target.value)); setRemoval(undefined); }}>{schema.records.length ? schema.records.map((item, index) => <option key={item.id} value={index}>{item.name || "Ricetta senza nome"}</option>) : <option value="0">Nessuna ricetta</option>}</select></label><button type="button" disabled={!schema.fields.length || schema.records.length >= 500} onClick={() => addRecord()}><Plus size={16} /> Nuova ricetta</button>{record && <><button type="button" disabled={schema.records.length >= 500} onClick={() => addRecord(true)}><Copy size={16} /> Copia ricetta</button><button type="button" onClick={() => setRemoval("record")}><Trash2 size={16} /> Rimuovi ricetta</button></>}</div>
          {record ? <><div className="alarm-fields"><Field label="Nome ricetta" value={record.name} onChange={name => patchSchema({ records: schema.records.map((item, index) => index === recordIndex ? { ...item, name } : item) })} /></div><div className="alarm-fields">{schema.fields.map(field => <Value key={`${schema.id}:${record.id}:${field.id}:${field.type}`} field={field} value={record.values[field.id]} onChange={value => patchSchema({ records: schema.records.map((item, index) => index === recordIndex ? { ...item, values: { ...item.values, [field.id]: value } } : item) })} />)}</div></> : <p>Puoi salvare lo schema senza ricette oppure aggiungerne una e compilare tutti i valori.</p>}
        </>}
        {removal !== undefined && <section className="recipe-notice" role="group" aria-label="Conferma rimozione"><p>{removal === "schema" ? "Rimuovere lo schema e tutte le sue ricette dalla bozza?" : removal === "record" ? "Rimuovere questa ricetta dalla bozza?" : "Rimuovere il campo e i suoi valori da tutte le ricette della bozza?"} I dati operativi non vengono toccati.</p><button type="button" onClick={() => setRemoval(undefined)}>Mantieni</button><button type="button" onClick={remove}>Conferma rimozione</button></section>}
      </fieldset>;
}
