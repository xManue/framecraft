import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { faceplateMigrationSources, planHmiFaceplateMigration, selectedFaceplateBinding, type FaceplateInterfaceKind, type FaceplateMigrationOptions } from "../core/hmiFaceplateMigration";
import { hmiFaceplateAttribute } from "../core/hmiFaceplates";
import { faceplateMigrationTargetCurrent, useEditorStore, type FaceplateMigrationTarget } from "../state/editorStore";
import "./faceplateMigration.css";

const kindLabels = { tag: "Tag", property: "Proprietà", event: "Script evento" };
const changeLabels = { added: "Aggiunto", removed: "Rimosso", changed: "Modificato" };

export function FaceplateMigrationDialog({ expected, targetKey, onClose }: { expected: FaceplateMigrationTarget; targetKey: string; onClose: () => void }) {
  const [options, setOptions] = useState<FaceplateMigrationOptions>({});
  const [acceptLosses, setAcceptLosses] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dialog = useRef<HTMLElement>(null);
  const current = useEditorStore((state) => faceplateMigrationTargetCurrent(state, expected));
  const node = expected.document?.nodes[expected.selectedId ?? ""];
  const binding = useMemo(() => selectedFaceplateBinding(expected.document, node, expected.selectionInfo), [expected, node]);
  const before = expected.faceplateCatalog.types.find((item) => item.id === binding?.typeId && item.version === binding?.version);
  const after = expected.faceplateCatalog.types.find((item) => `${item.id}@${item.version}` === targetKey);
  const plan = binding ? planHmiFaceplateMigration(binding, expected.faceplateCatalog, targetKey, expected.plcVariables, options) : undefined;
  const allCopies = expected.editScope === "all" && (expected.selectionInfo?.instanceCount ?? 1) > 1;
  const mixedCopies = allCopies && node?.dynamicProps?.includes(hmiFaceplateAttribute);
  const selectedIndex = expected.selectionInfo?.listIndex ?? expected.selectionInfo?.instanceIndex;
  const unknownCopy = expected.editScope === "instance" && (expected.selectionInfo?.instanceCount ?? 1) > 1 && (selectedIndex == null || !Number.isSafeInteger(selectedIndex) || selectedIndex < 0);
  const blocked = !current || mixedCopies || unknownCopy || !plan?.binding || plan.issues.some((issue) => issue.severity === "error") || Boolean(plan.losses.length && !acceptLosses);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); if (!busyRef.current) closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary') ?? [])];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { setAcceptLosses(false); setError(""); }, [options]);

  const patchSource = (kind: FaceplateInterfaceKind, name: string, value: string) => {
    const sources = kind === "tag" ? "tagSources" : kind === "property" ? "propertySources" : "eventSources";
    setOptions((previous) => {
      const next = { ...previous, [sources]: { ...previous[sources], [name]: value } };
      if (kind === "tag") { next.tagValues = { ...previous.tagValues }; delete next.tagValues[name]; }
      if (kind === "property") { next.propertyValues = { ...previous.propertyValues }; delete next.propertyValues[name]; }
      return next;
    });
  };
  const sourceField = (kind: FaceplateInterfaceKind, name: string) => {
    if (!before || !after) return null;
    const candidates = faceplateMigrationSources(before, after, kind, name);
    const mappings = kind === "tag" ? options.tagSources : kind === "property" ? options.propertySources : options.eventSources;
    const value = mappings && Object.prototype.hasOwnProperty.call(mappings, name) ? mappings[name] : before.id === after.id && candidates.includes(name) ? name : "";
    return <label><span>{kind === "event" ? "Script da conservare" : "Prendi dalla vecchia interfaccia"}</span><select aria-label={`Origine ${kindLabels[kind]} ${name}`} value={value} onChange={(event) => patchSource(kind, name, event.target.value)}>
      <option value="">{kind === "event" ? "Nessuno script" : "Nuova configurazione / predefinito"}</option>
      {candidates.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
    </select></label>;
  };
  const apply = async () => {
    if (blocked || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const applied = await useEditorStore.getState().migrateFaceplate(expected, targetKey, options, acceptLosses);
      if (applied) closeRef.current();
      else setError("Aggiornamento non applicato. Se pagina, selezione o cataloghi sono cambiati, chiudi e riapri il confronto; altrimenti controlla la diagnostica.");
    } catch { setError("Non riesco ad applicare l’aggiornamento. Controlla la diagnostica prima di riprovare."); }
    finally { busyRef.current = false; setBusy(false); }
  };

  return createPortal(<div className="fc-faceplate-backdrop"><section className="fc-faceplate-migration" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="fc-faceplate-migration-title" aria-describedby="fc-faceplate-migration-purpose" aria-busy={busy} onKeyDown={(event) => event.stopPropagation()}>
    <header><div><h2 id="fc-faceplate-migration-title">Aggiorna istanza faceplate</h2><p>{before?.name} · V{before?.version} → {after?.name} · V{after?.version}</p></div><button type="button" aria-label="Chiudi confronto faceplate" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    <div className="fc-faceplate-migration-body">
      <p id="fc-faceplate-migration-purpose">Controlla le differenze e scegli cosa conservare prima di applicare. Nessuna connessione o scrittura PLC viene avviata.</p>
      <p>Posizione e dimensioni del contenitore restano invariate. Il nuovo tipo ricrea il proprio stato locale nel pannello; non migra valori PLC o stato in memoria.</p>
      {allCopies && <p className="fc-faceplate-warning" role="status">Stai modificando il template: la conferma interessa tutte le {expected.selectionInfo?.instanceCount} copie, non solo quella selezionata.</p>}
      {mixedCopies && <p role="alert" className="fc-faceplate-error">Le copie hanno configurazioni separate. Chiudi e scegli «Solo questa» per aggiornarle una alla volta senza sovrascrivere le altre.</p>}
      {unknownCopy && <p role="alert" className="fc-faceplate-error">Non riesco a identificare la copia selezionata. Chiudi e riselezionala nell’anteprima, oppure scegli esplicitamente «Tutte» per modificare il template.</p>}
      <section><h3>Cosa cambia nel tipo</h3>{plan?.changes.length ? <ul>{plan.changes.map((change, index) => <li key={index}><strong>{changeLabels[change.kind]}</strong> · {change.section} · {change.name}{change.before && <small>Prima: {change.before}</small>}{change.after && <small>Dopo: {change.after}</small>}</li>)}</ul> : <p>Interfaccia e grafica del tipo non hanno differenze.</p>}</section>
      <fieldset disabled={busy || !current}><legend>Collegamenti della nuova versione</legend>
        {after?.interfaceTags.map((tag) => <article key={`tag-${tag.name}`}><h4>{tag.name} · {tag.dataType}{tag.required ? " · obbligatorio" : ""}</h4>{sourceField("tag", tag.name)}<label><span>Variabile PLC</span><input aria-label={`Variabile PLC ${tag.name}`} value={plan?.binding?.tagBindings[tag.name] ?? ""} maxLength={512} list="fc-faceplate-migration-tags" onChange={(event) => setOptions((previous) => ({ ...previous, tagValues: { ...previous.tagValues, [tag.name]: event.target.value } }))} /></label></article>)}
        <datalist id="fc-faceplate-migration-tags">{expected.plcVariables.map((variable) => <option key={variable.name} value={variable.name}>{variable.dataType}</option>)}</datalist>
        {after?.interfaceProperties.map((property) => <article key={`property-${property.name}`}><h4>{property.name} · {property.dataType}</h4>{sourceField("property", property.name)}<label><span>Valore dell’istanza</span>{property.dataType === "Bool"
          ? <select aria-label={`Valore ${property.name}`} value={String(plan?.binding?.propertyValues[property.name] ?? property.defaultValue ?? false)} onChange={(event) => setOptions((previous) => ({ ...previous, propertyValues: { ...previous.propertyValues, [property.name]: event.target.value === "true" } }))}><option value="false">False</option><option value="true">True</option></select>
          : <input aria-label={`Valore ${property.name}`} value={String(plan?.binding?.propertyValues[property.name] ?? "")} maxLength={5000} onChange={(event) => setOptions((previous) => ({ ...previous, propertyValues: { ...previous.propertyValues, [property.name]: event.target.value } }))} />}</label></article>)}
        {after?.interfaceEvents.map((event) => <article key={`event-${event.name}`}><h4>{event.name}({event.parameters.map((parameter) => `${parameter.name}: ${parameter.dataType}`).join(", ")})</h4>{sourceField("event", event.name)}<p>Si conservano soltanto script con gli stessi nomi e tipi dei parametri. Gli script non vengono riscritti automaticamente.</p></article>)}
        {!after?.interfaceTags.length && !after?.interfaceProperties.length && !after?.interfaceEvents.length && <p>Il nuovo tipo non ha campi da collegare.</p>}
      </fieldset>
      {plan?.losses.length ? <section className="fc-faceplate-warning"><h3>Configurazioni che verranno scartate</h3><ul>{plan.losses.map((loss) => <li key={`${loss.kind}-${loss.name}`}>{kindLabels[loss.kind]} · {loss.name}</li>)}</ul><label className="fc-faceplate-confirm"><input type="checkbox" disabled={busy || !current} checked={acceptLosses} onChange={(event) => setAcceptLosses(event.target.checked)} />Confermo lo scarto delle configurazioni elencate. Posso ripristinarle con Annulla.</label></section> : <p>Tutte le configurazioni esistenti dell’istanza saranno conservate.</p>}
      {plan?.issues.map((issue, index) => <p key={index} className={issue.severity === "error" ? "fc-faceplate-error" : "fc-faceplate-warning"}>{issue.message}</p>)}
      {!current && <p role="alert" className="fc-faceplate-error">Pagina, selezione o cataloghi sono cambiati. Chiudi e riapri il confronto: nessun aggiornamento verrà applicato da questa finestra.</p>}
      {error && <p role="alert" className="fc-faceplate-error">{error}</p>}
    </div>
    <footer><span>Ripristino disponibile con Annulla (Ctrl+Z).</span><button type="button" disabled={busy} onClick={onClose}>Annulla</button><button type="button" className="fc-faceplate-apply" disabled={busy || blocked} onClick={() => void apply()}>{busy ? "Applicazione…" : allCopies ? "Applica a tutte le copie" : "Applica all’istanza"}</button></footer>
  </section></div>, document.body);
}
