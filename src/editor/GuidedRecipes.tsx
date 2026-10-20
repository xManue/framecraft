import { useEffect, useRef, useState } from "react";
import { parseRecipeCatalog, type RecipeCatalog, type RecipeSchema } from "../core/recipeConfiguration";
import { RecipeCatalogDraftDialog } from "./RecipeCatalogDraftDialog";

function SchemaReview({ schema }: { schema: RecipeSchema }) {
  const [selected, setSelected] = useState("");
  const record = schema.records.find(record => record.id === selected) ?? schema.records[0];
  return <details>
    <summary>{schema.name} · {schema.fields.length} {schema.fields.length === 1 ? "campo" : "campi"} · {schema.records.length} {schema.records.length === 1 ? "ricetta" : "ricette"}</summary>
    <ul>{schema.fields.map(field => <li key={field.id}>{field.name} · {{ number: "numero", integer: "intero", boolean: "attivato/disattivato", string: "testo" }[field.type]}{field.unit ? ` · ${field.unit}` : ""}{field.minimum !== undefined ? ` · minimo ${field.minimum}` : ""}{field.maximum !== undefined ? ` · massimo ${field.maximum}` : ""}{field.maxLength !== undefined ? ` · massimo ${field.maxLength} caratteri` : ""}</li>)}</ul>
    {record ? <>
      <label>Ricetta iniziale di {schema.name}<select value={record.id} onChange={event => setSelected(event.target.value)}>{schema.records.map(record => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
      <dl className="ai-recipes-values">{schema.fields.map(field => {
        const value = record.values[field.id];
        return <div key={field.id}><dt>{field.name}</dt><dd>{typeof value === "boolean" ? value ? "Attivato · true" : "Disattivato · false" : value === "" ? "Testo vuoto" : String(value)}</dd></div>;
      })}</dl>
    </> : <p>Solo schema: nessuna ricetta e nessun valore predefinito aggiunto.</p>}
  </details>;
}
export function GuidedRecipesReview({ catalog, file, onEdit, disabled = false }: { catalog?: RecipeCatalog; file?: string; onEdit?(): void; disabled?: boolean }) {
  if (!catalog) return null;
  const records = catalog.schemas.reduce((sum, schema) => sum + schema.records.length, 0);
  return <section className="ai-command-review ai-recipes" aria-label="Catalogo ricette iniziali">
    <h4>Ricette iniziali del nuovo progetto</h4>
    <p>{file || "Catalogo Framecraft"} · {catalog.schemas.length} {catalog.schemas.length === 1 ? "schema" : "schemi"} · {records} {records === 1 ? "ricetta" : "ricette"}</p>
    <p>Schema e valori saranno copiati nel nuovo progetto, non inviati all’AI. Non sono dati operativi del servizio né valori letti dal PLC. La pagina Ricette resta da collegare: nessun form operatore o trasferimento PLC viene generato.</p>
    {catalog.schemas.map(schema => <SchemaReview key={schema.id} schema={schema} />)}
    {!catalog.schemas.length && <p>Catalogo vuoto scelto esplicitamente: nessun parametro inventato.</p>}
    {onEdit && <button type="button" disabled={disabled} onClick={onEdit}>Rivedi le ricette iniziali</button>}
  </section>;
}
export function GuidedRecipesInput({ catalog, file, onChange, onBusyChange }: { catalog?: RecipeCatalog; file?: string; onChange(catalog?: RecipeCatalog, file?: string): void; onBusyChange(busy: boolean): void }) {
  const [pending, setPending] = useState<{ catalog: RecipeCatalog; file: string }>(), [error, setError] = useState("");
  const [reading, setReading] = useState(false), [editing, setEditing] = useState(false), mounted = useRef(true), sequence = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const current = useRef({ catalog, onChange, onBusyChange }); current.current = { catalog, onChange, onBusyChange };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; current.current.onBusyChange(false); }; }, []);
  useEffect(() => { setPending(undefined); }, [catalog]);
  async function choose(selected?: File) {
    if (!selected || reading || editing) return;
    const request = ++sequence.current, before = catalog;
    setReading(true); onBusyChange(true); setError(""); setPending(undefined);
    try {
      if (selected.size > 2_000_000) throw new Error("size");
      const parsed = parseRecipeCatalog(await selected.text());
      if (mounted.current && request === sequence.current && current.current.catalog === before) setPending({ catalog: parsed, file: selected.name });
    } catch {
      if (mounted.current && request === sequence.current) setError("Importazione ricette non valida. Scegli un catalogo Framecraft v1 entro 2 MB, con identificativi unici, tipi corretti e tutti i valori richiesti nei limiti dello schema. Il catalogo precedente resta invariato.");
    } finally {
      if (mounted.current && request === sequence.current) { setReading(false); current.current.onBusyChange(false); }
    }
  }
  return <section className="ai-import ai-recipes" aria-label="Importa le ricette iniziali">
    <h4>Come vuoi preparare le ricette iniziali?</h4>
    <p>Puoi creare schemi e valori qui, importare un catalogo Framecraft oppure saltare il passaggio. Non caricare l’archivio operativo del servizio: contiene anche revisioni e ricevute. CSV, database ed export WinCC/Optix richiedono un adattatore e non vengono interpretati automaticamente.</p>
    <button type="button" disabled={reading || editing} onClick={event => { returnFocus.current = event.currentTarget; setPending(undefined); setError(""); setEditing(true); onBusyChange(true); }}>{catalog ? "Modifica schemi e ricette" : "Crea schemi e ricette qui"}</button>
    <label>Inserisci framecraft.recipes.json (facoltativo)<input type="file" accept=".json,application/json" disabled={reading || editing} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {reading && <p role="status">Controllo locale di schemi e valori ricette…</p>}
    {error && <p className="ai-error" role="alert">{error}</p>}
    {pending && <section className="ai-recipes-pending" aria-label="Controlla l’importazione ricette">
      <p>Il file è valido, ma non è ancora incluso nel progetto. Controllalo qui sotto: “Usa questo catalogo” sostituirà solo le ricette iniziali già scelte in questo questionario. Non salva file né avvia il servizio.</p>
      <GuidedRecipesReview catalog={pending.catalog} file={pending.file} />
      <button type="button" onClick={() => { current.current.onChange(pending.catalog, pending.file); setPending(undefined); }}>Usa questo catalogo</button>
      <button type="button" onClick={() => setPending(undefined)}>Annulla importazione ricette</button>
    </section>}
    <GuidedRecipesReview catalog={catalog} file={file} />
    {catalog && <button type="button" onClick={() => { if (window.confirm("Rimuovere gli schemi e i valori iniziali dal questionario? Nessun file o archivio esistente verrà cancellato.")) current.current.onChange(); }}>Rimuovi ricette dal nuovo progetto</button>}
    <p>Puoi anche preparare o modificare il catalogo dopo, da Pannello → Ricette, senza AI. Le domande su parametri e conferma PLC restano requisiti: non cambiano i valori scelti qui.</p>
    {editing && <RecipeCatalogDraftDialog catalog={catalog} returnFocus={returnFocus.current} onClose={() => { setEditing(false); current.current.onBusyChange(false); }} onApply={(next, changed) => { current.current.onChange(next, changed ? undefined : file); setEditing(false); current.current.onBusyChange(false); }} />}
  </section>;
}
