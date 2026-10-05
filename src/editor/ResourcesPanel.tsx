import { AlertTriangle, Check, FileImage, Languages, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  emptyHmiResourceCatalog,
  hmiResourceCatalogName,
  parseHmiResourceCatalog,
  serializeHmiResourceCatalog,
  type HmiGraphicResourceEntry,
  type HmiResourceCatalog,
  type HmiResourceEntryType,
  type HmiResourceRangeType,
  type HmiTextResourceEntry,
} from "../core/hmiResources";
import { joinProjectPath } from "../core/paths";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorStore } from "../state/editorStore";

type ListSelection = { kind: "text" | "graphic"; index: number };
const entryTypes: { value: HmiResourceEntryType; label: string }[] = [
  { value: "SingleValue", label: "Valore singolo" },
  { value: "Range", label: "Intervallo" },
  { value: "From", label: "Da questo valore" },
  { value: "To", label: "Fino a questo valore" },
];
const rangeTypes: { value: HmiResourceRangeType; label: string }[] = [
  { value: "Decimal", label: "Valore / intervallo" },
  { value: "Bool", label: "Falso / vero" },
  { value: "BitNumber", label: "Numero del bit" },
];

const nextName = (catalog: HmiResourceCatalog, base: string): string => {
  const names = new Set([...catalog.textLists, ...catalog.graphicLists].map((list) => list.name.toLocaleLowerCase()));
  let name = base;
  let suffix = 2;
  while (names.has(name.toLocaleLowerCase())) name = `${base} ${suffix++}`;
  return name;
};

const newId = () => globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now()}`;

const nextTextKey = (catalog: HmiResourceCatalog): string => {
  const keys = new Set(catalog.multilingualTexts.map((item) => item.key.toLocaleLowerCase()));
  let index = catalog.multilingualTexts.length + 1;
  while (keys.has(`text.${index}`)) index += 1;
  return `Text.${index}`;
};

export function ResourcesPanel() {
  const project = useEditorStore((state) => state.project);
  const stored = useEditorStore((state) => state.resourceCatalog);
  const refresh = useEditorStore((state) => state.refreshResourceCatalog);
  const setLiveLanguage = useEditorStore((state) => state.setResourceLanguage);
  const [catalog, setCatalog] = useState<HmiResourceCatalog>(() => emptyHmiResourceCatalog());
  const [selection, setSelection] = useState<ListSelection>();
  const [exists, setExists] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [newLanguage, setNewLanguage] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!project) return;
      setError(undefined);
      try {
        const next = parseHmiResourceCatalog(await desktopBridge.readFile(joinProjectPath(project.root, hmiResourceCatalogName)));
        if (!alive) return;
        setCatalog(next);
        setExists(true);
      } catch (caught) {
        if (!alive) return;
        // Un progetto vecchio non ha il file: parte dal catalogo vuoto. Un file presente ma rotto
        // viene comunque mostrato come errore, per non sovrascriverlo di nascosto.
        const projectContainsFile = project.files.some((entry) => entry.name === hmiResourceCatalogName);
        setCatalog(stored);
        setExists(projectContainsFile);
        if (projectContainsFile) setError(caught instanceof Error ? caught.message : String(caught));
      }
      setDirty(false);
      setSaved(false);
    };
    void load();
    return () => { alive = false; };
  }, [project?.root]);

  const lists = useMemo(() => [
    ...catalog.textLists.map((list, index) => ({ kind: "text" as const, index, list })),
    ...catalog.graphicLists.map((list, index) => ({ kind: "graphic" as const, index, list })),
  ], [catalog]);
  const selected = selection?.kind === "text" ? catalog.textLists[selection.index]
    : selection?.kind === "graphic" ? catalog.graphicLists[selection.index] : undefined;

  const change = (next: HmiResourceCatalog) => { setCatalog(next); setDirty(true); setSaved(false); setError(undefined); };
  const replaceSelected = (list: typeof selected) => {
    if (!selection || !list) return;
    if (selection.kind === "text") change({ ...catalog, textLists: catalog.textLists.map((item, index) => index === selection.index ? list as typeof item : item) });
    else change({ ...catalog, graphicLists: catalog.graphicLists.map((item, index) => index === selection.index ? list as typeof item : item) });
  };

  const addList = (kind: "text" | "graphic") => {
    if (kind === "text") {
      const index = catalog.textLists.length;
      change({ ...catalog, textLists: [...catalog.textLists, { name: nextName(catalog, "Nuova lista testi"), rangeType: "Decimal", entries: [] }] });
      setSelection({ kind, index });
    } else {
      const index = catalog.graphicLists.length;
      change({ ...catalog, graphicLists: [...catalog.graphicLists, { name: nextName(catalog, "Nuova lista grafiche"), rangeType: "Decimal", entries: [] }] });
      setSelection({ kind, index });
    }
  };

  const removeList = () => {
    if (!selection || !selected || !window.confirm(`Eliminare la lista «${selected.name}»? Le dinamiche che la usano verranno segnalate dal controllo pannello.`)) return;
    if (selection.kind === "text") change({ ...catalog, textLists: catalog.textLists.filter((_, index) => index !== selection.index) });
    else change({ ...catalog, graphicLists: catalog.graphicLists.filter((_, index) => index !== selection.index) });
    setSelection(undefined);
  };

  const addEntry = () => {
    if (!selected || !selection) return;
    const base = { id: newId(), type: "SingleValue" as const, fromValue: 0 };
    const entry = selection.kind === "text" ? { ...base, texts: {} } : { ...base, graphic: "" };
    replaceSelected({ ...selected, entries: [...selected.entries, entry] } as typeof selected);
  };

  const updateEntry = (index: number, values: Partial<HmiTextResourceEntry & HmiGraphicResourceEntry>) => {
    if (!selected) return;
    replaceSelected({ ...selected, entries: selected.entries.map((entry, current) => current === index ? { ...entry, ...values } : entry) } as typeof selected);
  };

  const setDefaultEntry = (index: number, checked: boolean) => {
    if (!selected) return;
    replaceSelected({ ...selected, entries: selected.entries.map((entry, current) => ({ ...entry, default: checked && current === index ? true : undefined })) } as typeof selected);
  };

  const chooseGraphic = async (entryIndex: number) => {
    try {
      const source = await desktopBridge.chooseImage();
      if (!source) return;
      updateEntry(entryIndex, { graphic: await desktopBridge.importProjectAsset(source) });
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };

  const save = async () => {
    if (!project) return;
    setSaving(true);
    setError(undefined);
    try {
      const content = serializeHmiResourceCatalog(catalog);
      if (exists) await desktopBridge.writeFile(joinProjectPath(project.root, hmiResourceCatalogName), content);
      else { await desktopBridge.createFile(hmiResourceCatalogName, content); setExists(true); }
      await refresh();
      setLiveLanguage(catalog.activeLanguage);
      setCatalog(parseHmiResourceCatalog(content));
      setDirty(false);
      setSaved(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  };

  const addLanguage = () => {
    const code = newLanguage.trim();
    if (!code || catalog.languages.includes(code)) return;
    change({ ...catalog, languages: [...catalog.languages, code] });
    setNewLanguage("");
  };

  const addMultilingualText = () => change({
    ...catalog,
    multilingualTexts: [...catalog.multilingualTexts, { key: nextTextKey(catalog), texts: {} }],
  });

  const updateMultilingualText = (index: number, values: Partial<HmiResourceCatalog["multilingualTexts"][number]>) => change({
    ...catalog,
    multilingualTexts: catalog.multilingualTexts.map((item, current) => current === index ? { ...item, ...values } : item),
  });

  return <div className="panel-content resource-panel">
    <div className="panel-title"><span>RISORSE E LINGUE</span><small>{lists.length + catalog.multilingualTexts.length}</small></div>
    <div className="resource-runtime">
      <Languages size={17} />
      <label><span>Lingua simulata</span><select value={catalog.activeLanguage} onChange={(event) => { const activeLanguage = event.target.value; change({ ...catalog, activeLanguage }); setLiveLanguage(activeLanguage); }}>{catalog.languages.map((language) => <option key={language}>{language}</option>)}</select></label>
    </div>
    <p className="panel-help">Come in WinCC Unified, il valore di un tag sceglie un testo multilingua o una grafica. La simulazione sul canvas usa subito la lingua selezionata.</p>
    <div className="resource-settings">
      <label><span>Lingua predefinita</span><select value={catalog.defaultLanguage} onChange={(event) => change({ ...catalog, defaultLanguage: event.target.value })}>{catalog.languages.map((language) => <option key={language}>{language}</option>)}</select></label>
      <label><span>Selezione BitNumber</span><select value={catalog.bitSelection} onChange={(event) => change({ ...catalog, bitSelection: event.target.value as HmiResourceCatalog["bitSelection"] })}><option value="ExactMatch">Corrispondenza esatta</option><option value="LeastSignificantBit">Primo bit attivo</option></select></label>
      <div className="resource-add-language"><input value={newLanguage} onChange={(event) => setNewLanguage(event.target.value)} placeholder="es. pt-BR" /><button onClick={addLanguage} aria-label="Aggiungi lingua"><Plus size={13} /></button></div>
    </div>
    <section className="resource-static-texts">
      <div className="resource-static-head"><span><strong>TESTI DELLA PAGINA</strong><small>Titoli, etichette e pulsanti senza tag PLC</small></span><button onClick={addMultilingualText} title="Aggiungi testo multilingua"><Plus size={13} /></button></div>
      {catalog.multilingualTexts.map((item, index) => <article key={`${item.key}:${index}`}>
        <div className="resource-static-key"><input value={item.key} onChange={(event) => updateMultilingualText(index, { key: event.target.value })} aria-label={`Chiave testo ${index + 1}`} /><button onClick={() => {
          if (window.confirm(`Eliminare il testo «${item.key}»? Gli elementi che lo usano verranno segnalati dal controllo pannello.`)) change({ ...catalog, multilingualTexts: catalog.multilingualTexts.filter((_, current) => current !== index) });
        }} aria-label={`Elimina testo ${item.key}`}><Trash2 size={12} /></button></div>
        <div className="resource-translations">{catalog.languages.map((language) => <label key={language}><span>{language}{language === catalog.defaultLanguage ? " · default" : ""}</span><input value={item.texts[language] ?? ""} onChange={(event) => updateMultilingualText(index, { texts: { ...item.texts, [language]: event.target.value } })} /></label>)}</div>
      </article>)}
      {!catalog.multilingualTexts.length && <p className="resource-empty">Aggiungi qui i testi che cambiano lingua senza dipendere da una variabile PLC, poi scegli la chiave dall’Inspector.</p>}
    </section>
    <div className="resource-toolbar"><button onClick={() => addList("text")}><Plus size={13} /> Lista testi</button><button onClick={() => addList("graphic")}><Plus size={13} /> Lista grafiche</button></div>
    <div className="resource-list">
      {lists.map((item) => <button key={`${item.kind}:${item.list.name}:${item.index}`} className={selection?.kind === item.kind && selection.index === item.index ? "active" : ""} onClick={() => setSelection({ kind: item.kind, index: item.index })}>
        {item.kind === "text" ? <Languages size={13} /> : <FileImage size={13} />}<span><strong>{item.list.name}</strong><small>{item.list.rangeType} · {item.list.entries.length} voci</small></span>
      </button>)}
      {!lists.length && <p className="resource-empty">Nessuna lista. Aggiungi una lista testi o grafiche, poi collegala a un tag dall’Inspector.</p>}
    </div>
    {selected && selection && <section className="resource-editor">
      <div className="resource-editor-head"><strong>{selection.kind === "text" ? "Lista testi" : "Lista grafiche"}</strong><button onClick={removeList} title="Elimina lista"><Trash2 size={14} /></button></div>
      <label><span>Nome usato dalle dinamiche</span><input value={selected.name} onChange={(event) => replaceSelected({ ...selected, name: event.target.value } as typeof selected)} /></label>
      <label><span>Tipo selezione</span><select value={selected.rangeType} onChange={(event) => replaceSelected({ ...selected, rangeType: event.target.value as HmiResourceRangeType } as typeof selected)}>{rangeTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {selected.entries.map((entry, index) => <article className="resource-entry" key={entry.id}>
        <div className="resource-entry-head"><strong>Voce {index + 1}</strong><label><input type="checkbox" checked={Boolean(entry.default)} onChange={(event) => setDefaultEntry(index, event.target.checked)} /> Predefinita</label><button onClick={() => replaceSelected({ ...selected, entries: selected.entries.filter((_, current) => current !== index) } as typeof selected)} aria-label={`Elimina voce ${index + 1}`}><Trash2 size={12} /></button></div>
        <select value={entry.type} onChange={(event) => updateEntry(index, { type: event.target.value as HmiResourceEntryType })}>{entryTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <div className="resource-entry-range">
          {(entry.type === "SingleValue" || entry.type === "Range" || entry.type === "From") && <label><span>{entry.type === "SingleValue" ? "Valore" : "Da"}</span><input type="number" value={entry.fromValue ?? ""} onChange={(event) => updateEntry(index, { fromValue: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>}
          {(entry.type === "Range" || entry.type === "To") && <label><span>A</span><input type="number" value={entry.toValue ?? ""} onChange={(event) => updateEntry(index, { toValue: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>}
        </div>
        {selection.kind === "text" ? <div className="resource-translations">{catalog.languages.map((language) => {
          const textEntry = entry as HmiTextResourceEntry;
          return <label key={language}><span>{language}{language === catalog.defaultLanguage ? " · default" : ""}</span><input value={textEntry.texts[language] ?? ""} onChange={(event) => updateEntry(index, { texts: { ...textEntry.texts, [language]: event.target.value } })} /></label>;
        })}</div> : <label><span>Grafica del progetto</span><div className="resource-graphic"><input value={(entry as HmiGraphicResourceEntry).graphic} onChange={(event) => updateEntry(index, { graphic: event.target.value })} placeholder="/assets/motor-on.svg" /><button onClick={() => void chooseGraphic(index)} title="Importa immagine"><FileImage size={13} /></button></div></label>}
      </article>)}
      <button className="resource-add-entry" onClick={addEntry}><Plus size={13} /> Aggiungi voce</button>
    </section>}
    {error && <div className="plc-error" role="alert"><AlertTriangle size={13} /><span>{error}</span></div>}
    {saved && !dirty && <div className="plc-imported" role="status"><Check size={13} /><span>Catalogo salvato e simulazione aggiornata.</span></div>}
    <button className="resource-save" onClick={() => void save()} disabled={!project || saving || !dirty}><Save size={14} />{saving ? "Salvataggio…" : dirty ? "Salva risorse" : "Risorse salvate"}</button>
  </div>;
}
