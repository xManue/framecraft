import { ArrowLeft, ArrowRight, Check, ChevronRight, Folder, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { opcUaStandardNamespace, type OpcUaBrowseNode, type OpcUaBrowsePage, type OpcUaBrowseQuery, type OpcUaBrowseTarget } from "../../runtime/opcua-browse-policy.mjs";
import { opcUaBrowseFailure, opcUaBrowseUnavailable, opcUaNodeAccepts, parseOpcUaBrowseReply, prepareOpcUaMapping, type OpcUaBrowseRequest, type OpcUaMappingChoice } from "../core/opcUaBrowser";
import type { ConnectionConfigurationSnapshot, ConnectionEditorModel } from "../core/plcConnections";
import type { PlcAccess } from "../core/plcVariables";
import { desktopBridge } from "../filesystem/desktopBridge";
import "./opcua-browser.css";

type Crumb = { title: string; target: OpcUaBrowseTarget };
const initialPath: Crumb[] = [{ title: "Objects", target: { namespaceUri: opcUaStandardNamespace, nodeId: "i=85" } }];
const issueNames: Record<string, string> = { remote: "Riferimento a un altro server", identity: "Identità del nodo non disponibile", metadata: "Metadati incompleti o incoerenti", array: "Array o struttura non supportati dal driver scalare", "unsupported-type": "Tipo non supportato dal driver scalare" };
export function OpcUaBrowserDialog({ root, snapshot, model, index, onApply, onClose }: { root: string; snapshot: ConnectionConfigurationSnapshot; model: ConnectionEditorModel; index: number; onApply(model: ConnectionEditorModel): void; onClose(): void }) {
  const titleId = useId(), fieldId = useId(), dialog = useRef<HTMLElement>(null), reviewElement = useRef<HTMLElement>(null), errorElement = useRef<HTMLDivElement>(null);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [cancelling, setCancelling] = useState(false);
  const [page, setPage] = useState<OpcUaBrowsePage>(), [path, setPath] = useState(initialPath), [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OpcUaBrowseNode>(), [mode, setMode] = useState<"create" | "existing">("create");
  const [name, setName] = useState(""), [access, setAccess] = useState<PlcAccess>("read"), [dataType, setDataType] = useState(""), [tagSearch, setTagSearch] = useState("");
  const [review, setReview] = useState<ReturnType<typeof prepareOpcUaMapping>>(), [error, setError] = useState(""), [status, setStatus] = useState("");
  const [technical, setTechnical] = useState("");
  const active = useRef<{ id: string; cancelled: boolean } | undefined>(undefined), mounted = useRef(true), closeAfter = useRef(false), handlers = useRef({ close: () => {} });
  const reason = useMemo(() => opcUaBrowseUnavailable(model, snapshot, index), [model, snapshot, index]), profile = model.catalog.connections[index];
  const compatible = useMemo(() => selected ? model.variables.filter(variable => opcUaNodeAccepts(selected, variable)) : [], [model.variables, selected]);
  const choices = compatible.filter(variable => !tagSearch || variable.name.toLowerCase().includes(tagSearch.toLowerCase())).slice(0, 100);
  if (name && mode === "existing" && !choices.some(v => v.name === name)) { const chosen = compatible.find(v => v.name === name); if (chosen) choices.push(chosen); }
  const rows = page?.nodes.filter(node => !search || (node.displayName + " " + node.browseName + " " + node.target?.nodeId).toLowerCase().includes(search.toLowerCase())) ?? [];
  const change = (action: () => void) => { action(); setReview(undefined); setError(""); setTechnical(""); };
  function pick(node: OpcUaBrowseNode) { change(() => { setSelected(node); setMode("create"); setName(""); setAccess("read"); setDataType(node.supportedDataType ?? ""); setTagSearch(""); }); }
  async function cancel() {
    const request = active.current; if (!request || request.cancelled) return;
    request.cancelled = true; setCancelling(true);
    try { await desktopBridge.cancelOpcUaBrowse(request.id); }
    catch { if (mounted.current) { const failure = opcUaBrowseFailure("OPC_UA_DESKTOP_FAILED"); setError(failure.message + ". " + failure.remedy); } }
  }
  function close() { if (active.current) { closeAfter.current = true; void cancel(); } else onClose(); }
  handlers.current.close = close;
  useEffect(() => { if (review) { reviewElement.current?.focus({ preventScroll: true }); reviewElement.current?.scrollIntoView?.({ block: "nearest" }); } }, [review]);
  useEffect(() => { if (error) { errorElement.current?.focus({ preventScroll: true }); errorElement.current?.scrollIntoView?.({ block: "nearest" }); } }, [error]);
  useEffect(() => {
    mounted.current = true; const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("[data-close-browser]")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); handlers.current.close(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") event.preventDefault();
      if (event.key === "Tab") {
        const scope = dialog.current, controls = [...(scope?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]') ?? [])].filter(element => !element.closest("fieldset:disabled") && !element.closest("[hidden]"));
        const first = controls[0], last = controls.at(-1);
        if (controls.length && (event.shiftKey && (document.activeElement === first || !scope?.contains(document.activeElement)) || !event.shiftKey && (document.activeElement === last || !scope?.contains(document.activeElement)))) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      }
      event.stopPropagation();
    };
    window.addEventListener("keydown", keydown, true);
    return () => { mounted.current = false; const request = active.current; active.current = undefined; if (request) void desktopBridge.cancelOpcUaBrowse(request.id).catch(() => {}); window.removeEventListener("keydown", keydown, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  async function load(query: OpcUaBrowseQuery = path.at(-1)!.target, nextPath = path) {
    if (!consent || reason || active.current || profile.protocol !== "opcua") return;
    const request: OpcUaBrowseRequest = { id: crypto.randomUUID().replaceAll("-", ""), root, expected: snapshot, connectionId: profile.id, query, consent: true };
    const pending = { id: request.id, cancelled: false }; active.current = pending;
    setBusy(true); setCancelling(false); setError(""); setTechnical(""); setStatus(""); setSelected(undefined); setReview(undefined); setPage(undefined);
    try {
      const reply = parseOpcUaBrowseReply(await desktopBridge.browseOpcUa(request), request);
      if (!mounted.current || active.current !== pending) return;
      if (pending.cancelled) { setStatus("Esplorazione annullata. Nessun risultato è stato inserito."); return; }
      setPage(reply.page); setPath(nextPath); setSearch("");
    } catch (failure) {
      if (!mounted.current || active.current !== pending) return;
      const message = opcUaBrowseFailure(pending.cancelled ? "OPC_UA_BROWSE_CANCELLED" : failure);
      if (message.code === "OPC_UA_BROWSE_CANCELLED") setStatus(message.message + ". " + message.remedy);
      else { setError(message.message + ". " + message.remedy); setTechnical(message.code); }
    } finally {
      if (mounted.current && active.current === pending) { active.current = undefined; setBusy(false); setCancelling(false); if (closeAfter.current) onClose(); }
    }
  }
  function prepare() {
    if (!selected || active.current) return;
    const choice: OpcUaMappingChoice = mode === "existing" ? { mode, name } : { mode, name, access, dataType };
    try { setReview(prepareOpcUaMapping(model, snapshot, index, selected, choice)); setError(""); setTechnical(""); }
    catch (failure) { setReview(undefined); setError(failure instanceof Error ? failure.message : "Controlla tipo, nome e accesso della variabile."); }
  }
  return createPortal(<div className="connections-backdrop opcua-browser-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="connections-dialog opcua-browser" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy}>
      <header><div><h2 id={titleId}>Esplora nodi OPC UA</h2><p>{profile.id} · {profile.url}</p></div><button type="button" data-close-browser onClick={close} aria-label="Chiudi esplorazione OPC UA" disabled={cancelling}><X size={18} /></button></header>
      <div className="connections-body opcua-browser-body">
        <section className="opcua-browser-consent"><p>Lettura dal PC dell’editor con il profilo salvato, i suoi certificati e le sue variabili ambiente. Solo nomi, tipi e permessi: niente valori di processo, comandi o Method. La PKI può creare file locali e registrare certificati rifiutati.</p><label><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /> Consento questa esplorazione del server dal PC dell’editor</label>{reason && <p role="alert">{reason}</p>}</section>
        <div className="opcua-browser-toolbar"><nav aria-label="Cartella OPC UA">{path.map((crumb, i) => <button key={i} type="button" disabled={busy || !consent || !!reason} aria-current={i === path.length - 1 ? "location" : undefined} onClick={() => void load(crumb.target, path.slice(0, i + 1))}>{i > 0 && <ChevronRight size={14} />}{crumb.title}</button>)}</nav><button type="button" disabled={!consent || busy || !!reason} onClick={() => void load()}><RefreshCw size={16} />{page ? "Rileggi cartella" : "Leggi nodi"}</button></div>
        {error && <div ref={errorElement} tabIndex={-1} className="connection-error-banner" role="alert">{error}{technical && <small>Codice assistenza: {technical}</small>}</div>}
        {status && <p className="connection-success" role="status"><Check size={16} />{status}</p>}
        {busy && <p role="status">{cancelling ? "Annullamento e chiusura della sessione…" : "Preparazione dei componenti OPC UA e lettura dei metadati. La prima esplorazione può richiedere più tempo…"}</p>}
        <div className="opcua-browser-columns">
          <section className="opcua-node-list" aria-label="Nodi della cartella"><label htmlFor={fieldId + "-search"}><Search size={15} /> Cerca solo in questa pagina</label><input id={fieldId + "-search"} type="search" value={search} disabled={!page || busy} onChange={event => setSearch(event.target.value)} />
            {!page && !busy && <p>Abilita il consenso e premi Leggi nodi. Puoi entrare nelle cartelle e associare un nodo alla volta.</p>}
            {page && !rows.length && <p>{page.total ? "Nessun risultato in questa pagina. Controlla anche le altre pagine della cartella." : "Questa cartella non contiene nodi navigabili."}</p>}
            <ul>{rows.map((node, i) => <li key={i}><button type="button" className="opcua-node-pick" aria-pressed={selected === node} onClick={() => pick(node)}><span>{node.displayName || node.browseName || "Nodo senza nome"}<small>{node.nodeClass} · {node.supportedDataType || (node.issues.includes("array") ? "Array / struttura" : "Tipo non associabile")}</small></span></button><button type="button" title="Esplora riferimenti del nodo" aria-label={"Esplora " + (node.displayName || node.browseName)} disabled={!node.target || node.nodeClass === "Method"} onClick={() => node.target && void load(node.target, [...path, { title: node.displayName || node.browseName || node.target.nodeId, target: node.target }])}><Folder size={17} /><ChevronRight size={14} /></button></li>)}</ul>
            {page && <div className="opcua-node-pagination"><span>{page.total ? page.offset + 1 : 0}–{page.offset + page.nodes.length} di {page.total}</span><button type="button" aria-label="Pagina nodi precedente" disabled={page.offset === 0} onClick={() => void load({ ...page.target, offset: Math.max(0, page.offset - page.limit), limit: page.limit, revision: page.revision })}><ArrowLeft size={17} /></button><button type="button" aria-label="Pagina nodi successiva" disabled={page.nextOffset === null} onClick={() => void load({ ...page.target, offset: page.nextOffset!, limit: page.limit, revision: page.revision })}><ArrowRight size={17} /></button></div>}
          </section>
          <section className="opcua-node-detail" aria-label="Dettagli e associazione nodo">
            {!selected && <p>Seleziona un nodo per vedere tipo, identità e accesso effettivo. Il selettore non concede permessi sul server.</p>}
            {selected && <><h3>{selected.displayName || selected.browseName || "Nodo selezionato"}</h3><dl><dt>Namespace URI</dt><dd>{selected.target?.namespaceUri || "Non disponibile"}</dd><dt>Identificatore nodo</dt><dd>{selected.target?.nodeId || "Non disponibile"}</dd><dt>Tipo / ValueRank</dt><dd>{selected.supportedDataType || selected.dataType?.nodeId || "Non disponibile"} / {selected.valueRank ?? "Non disponibile"}</dd><dt>Accesso dell’account OPC UA</dt><dd>Lettura: {selected.readable === null ? "non noto" : selected.readable ? "sì" : "no"} · Scrittura: {selected.writable === null ? "non noto" : selected.writable ? "sì" : "no"}</dd></dl>
              {(!selected.supportedDataType || selected.issues.length > 0) ? <p>{selected.nodeClass === "Method" ? "I metodi non vengono eseguiti o trasformati in variabili." : selected.issues.map(issue => issueNames[issue]).join(". ") || "Questo nodo non è una variabile scalare associabile."}</p> : <>
                <fieldset className="opcua-mapping-form" disabled={busy}><legend>Destinazione nel pannello</legend><div className="opcua-choice"><label><input type="radio" name={fieldId + "-mode"} checked={mode === "create"} onChange={() => change(() => { setMode("create"); setName(""); })} /> Crea nuova variabile</label><label><input type="radio" name={fieldId + "-mode"} checked={mode === "existing"} onChange={() => change(() => { setMode("existing"); setName(""); })} /> Usa variabile esistente</label></div>
                  {mode === "create" ? <><label htmlFor={fieldId + "-name"}>Nome locale della variabile</label><input id={fieldId + "-name"} value={name} maxLength={200} onChange={event => change(() => setName(event.target.value))} autoComplete="off" spellCheck={false} /><label htmlFor={fieldId + "-type"}>Tipo rilevato</label><select id={fieldId + "-type"} value={dataType} onChange={event => change(() => setDataType(event.target.value))}><option value={selected.supportedDataType}>{selected.supportedDataType}</option>{selected.supportedDataType === "String" && <option value="WString">WString (stesso tipo String OPC UA)</option>}</select><label htmlFor={fieldId + "-access"}>Accesso della variabile nel pannello</label><select id={fieldId + "-access"} value={access} onChange={event => change(() => setAccess(event.target.value as PlcAccess))}><option value="read" disabled={!selected.readable}>Sola lettura</option><option value="write" disabled={!selected.writable}>Solo scrittura</option><option value="read-write" disabled={!selected.readable || !selected.writable}>Lettura e scrittura</option></select></> : <>{compatible.length > 100 && <><label htmlFor={fieldId + "-tag-search"}>Cerca variabile nel catalogo</label><input id={fieldId + "-tag-search"} value={tagSearch} onChange={event => setTagSearch(event.target.value)} /><small>Fino a 100 scelte compatibili e la variabile selezionata.</small></>}<label htmlFor={fieldId + "-existing"}>Variabile compatibile</label><select id={fieldId + "-existing"} value={name} onChange={event => change(() => setName(event.target.value))}><option value="">Scegli una variabile</option>{choices.map(variable => <option key={variable.name} value={variable.name}>{variable.name} · {variable.dataType} · {variable.access}</option>)}</select>{!compatible.length && <p>Nessuna variabile compatibile con tipo e accesso di questo nodo. Puoi crearne una esplicitamente.</p>}</>}
                  <p>Nuove associazioni e sostituzioni partono senza comandi abilitati. Nessun indirizzo PLC o valore iniziale viene inventato.</p><button type="button" disabled={!name.trim()} onClick={prepare}>Rivedi associazione</button>
                </fieldset>
                {review && <section ref={reviewElement} tabIndex={-1} className="opcua-mapping-review" aria-label="Revisione associazione"><h4>{review.created ? "Nuova variabile e mapping" : review.previous ? "Sostituzione del mapping" : "Nuovo mapping"}</h4><p>{review.variable.name} · {review.variable.dataType} · {review.variable.access}</p>{review.previous && <p>Prima: {review.previous.namespaceUri} · {review.previous.nodeId}</p>}<p>Dopo: {review.binding.namespaceUri} · {review.binding.nodeId}</p><p>Comandi: disabilitati. Questa conferma aggiorna solo la bozza; per scrivere i JSON usa Salva configurazione in Connessioni PLC.</p><button type="button" className="connection-save" onClick={() => { onApply(review.model); setStatus("Associazione di " + review.variable.name + " aggiunta alla bozza. Salva configurazione dopo aver chiuso il selettore."); setReview(undefined); setSelected(undefined); }}>Aggiungi alla bozza</button></section>}
              </>}
            </>}
          </section>
        </div>
      </div><footer><span>Nessun salvataggio o comando PLC automatico</span><div>{busy && <button type="button" disabled={cancelling} onClick={() => void cancel()}>Annulla esplorazione</button>}<button type="button" disabled={cancelling} onClick={close}>{busy ? "Annulla e chiudi" : "Torna alle connessioni"}</button></div></footer>
    </section>
  </div>, document.body);
}
