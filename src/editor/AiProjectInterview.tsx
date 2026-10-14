import { ArrowLeft, ArrowRight, ImagePlus, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { interviewConfig, interviewContext, interviewStepIssues, interviewSteps, newGuidedPage, parseInterviewAlarms, parseInterviewTags } from "../ai/aiInterview";
import { guidedItemLimit, guidedPageKinds, guidedProjectPending, type GuidedPage } from "../core/guidedProject";
import { standardProjectSectionChoices } from "../core/standardProject";
import { desktopBridge } from "../filesystem/desktopBridge";
import { useEditorAi } from "../state/editorAi";
import { useEditorStore } from "../state/editorStore";
import { GuidedCommandFields, GuidedCommandTagOptions } from "./GuidedCommandFields";
import { withGuidedItemLabels } from "../core/guidedCommands";
import { hmiEventLabels } from "../core/hmiEvents";
import { PanelRequirementFields, PanelRequirementsReview } from "./PanelRequirementFields";
import { panelRequirementGroups } from "../core/panelRequirements";
import { guidedTemplateBehavior } from "../core/templateBehavior";
import { TemplateBehaviorInfo } from "./TemplateBehaviorInfo";
import type { ReactNode } from "react";
import { delegatedQuestions, delegationQuestions, resolveInterviewDelegation, toggleInterviewDelegation } from "../ai/aiDelegation";
import { AiQuestion, AiDelegationReview } from "./AiQuestion";

export function AiProjectInterview() {
  const ai = useEditorAi(), interview = ai.interview, spec = interview.spec;
  const loading = useEditorStore(state => state.loading);
  const [consent, setConsent] = useState(false), [notice, setNotice] = useState<string>(), [fileBusy, setFileBusy] = useState(false), [applying, setApplying] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = interviewSteps(interview), index = Math.max(0, steps.findIndex(step => step.id === interview.step));
  const step = steps[index].id, page = spec.pages.find(page => page.id === step), kind = guidedPageKinds.find(kind => kind.id === page?.kind);
  const issues = interviewStepIssues(interview, step), busy = ai.busy || ai.connecting || ai.checking || fileBusy || applying || loading;
  useEffect(() => { setConsent(false); }, [interview, ai.model, ai.account?.email]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); setNotice(undefined); }, [step]);
  const update = (change: Partial<typeof interview>) => ai.updateInterview({ ...interview, followups: [], ...change });
  const updateSpec = (change: Partial<typeof spec>) => {
    const next = { ...spec, ...change };
    if (change.pages && next.requirements) next.requirements = { ...next.requirements, enabled: { ...next.requirements.enabled, ...Object.fromEntries(panelRequirementGroups.filter(group => group.optional && next.pages.some(page => group.pageKinds?.includes(page.kind))).map(group => [group.id, "yes" as const])) } };
    update({ spec: next });
  };
  const updatePage = (id: string, change: Partial<GuidedPage>) => updateSpec({ pages: spec.pages.map(page => page.id === id ? { ...page, ...change } : page) });
  const questions = delegationQuestions(interview);
  const delegate = (key: string) => update(toggleInterviewDelegation(interview, key));
  const question = (key: string, children: ReactNode) => { const item = questions.find(question => question.key === key)!; return <AiQuestion label={item.label} delegated={interview.delegated?.includes(key) ?? false} pending={item.type === "pending"} onToggle={() => delegate(key)}>{children}</AiQuestion>; };
  const go = (id: string) => useEditorAi.setState(state => ({ interview: { ...state.interview, step: id } }));
  const chooseImage = async (id: string) => {
    setFileBusy(true); setNotice(undefined);
    try { const image = await desktopBridge.chooseImage(); if (image && useEditorAi.getState().interview === interview) updatePage(id, { image, imageDeferred: false }); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setFileBusy(false); }
  };
  const importFile = async (file: File | undefined, type: "tags" | "alarms") => {
    if (!file) return; setFileBusy(true); setNotice(undefined);
    try {
      if (file.size > 2_000_000) throw new Error("Scegli un file fino a 2 MB. Nessun dato è stato importato.");
      const source = await file.text(); if (useEditorAi.getState().interview !== interview) return;
      if (type === "tags") {
        const { tags, warnings } = parseInterviewTags(file.name, source);
        updateSpec({ tags, tagsFile: file.name, tagsMode: "import", alarms: undefined, alarmsFile: undefined, pages: spec.pages.map(page => ({ ...page, items: page.items.map(item => ({ ...item, tag: tags.some(tag => tag.name === item.tag && (page.kind === "commands" ? tag.access !== "read" : tag.access !== "write")) ? item.tag : "", ...(item.command ? { command: { ...item.command, reviewed: false } } : {}) })) })) });
        setNotice(`${tags.length} tag importati localmente.${warnings.length ? ` Attenzione: ${warnings.slice(0, 8).join(" · ")}` : " Nessun collegamento PLC avviato."}`);
      } else { const alarms = parseInterviewAlarms(source, interview); updateSpec({ alarms, alarmsFile: file.name, alarmsMode: "import" }); setNotice(`${alarms.alarms.length} allarmi importati e validati con il catalogo tag.`); }
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setFileBusy(false); }
  };
  const approve = async () => {
    setApplying(true); setNotice(undefined);
    try {
      if (!ai.proposal || ai.proposal.questions.length) throw new Error("Completa prima le domande della proposta.");
      const config = interviewConfig(resolveInterviewDelegation(interview, ai.proposal.decisions ?? []));
      if (JSON.stringify(config) !== JSON.stringify(ai.proposal.project)) throw new Error("Le risposte sono cambiate: prepara una nuova proposta prima di creare.");
      const root = useEditorStore.getState().project?.root;
      await useEditorStore.getState().createStandardProject(config);
      if (useEditorStore.getState().project?.root !== root) { ai.close(); ai.resetInterview(); }
      else setNotice(useEditorStore.getState().lastError ?? "Scelta cartella annullata. Le risposte restano qui, puoi riprendere.");
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setApplying(false); }
  };
  return <section className="ai-interview" aria-label="Domande guidate per il nuovo pannello" data-step={step}>
    <p className="ai-hint">Passo {index + 1} di {steps.length} · Le domande si adattano alle pagine scelte. Puoi saltarne una con “Lascia scegliere all’AI”: controllerai la scelta prima di creare. Le risposte restano disponibili se chiudi questa finestra, finché l’app rimane aperta.</p>
    <h3 ref={heading} tabIndex={-1}>{steps[index].label}</h3>
    <fieldset className="ai-interview-fields" disabled={busy}>
      {step === "machine" && <>
        {question("machineName", <label>Come si chiama la macchina o linea?<input maxLength={80} value={interview.machineName} onChange={event => update({ machineName: event.target.value })} placeholder="Es. Linea palletizzazione 1" /></label>)}
        {question("purpose", <label>Che processo deve gestire il pannello?<input maxLength={500} value={spec.purpose} onChange={event => updateSpec({ purpose: event.target.value })} placeholder="Es. Controllare due trasportatori e un robot palletizzatore" /></label>)}
        {question("layout", <label>Dove verrà usato?<select value={interview.layout} onChange={event => update({ layout: event.target.value as typeof interview.layout })}><option value="desktop-mobile">Desktop e mobile, con scelta iniziale nel pannello</option><option value="desktop">Solo desktop</option></select></label>)}
      </>}
      {step === "pages" && <>
        {question("pages", <label>Quante pagine vuoi nel pannello?<select value={spec.pages.length} onChange={event => { const count = Number(event.target.value); if (count < spec.pages.length && !window.confirm("Ridurre il numero elimina le risposte delle pagine finali. Continuare?")) return; updateSpec({ pages: Array.from({ length: count }, (_, index) => spec.pages[index] ?? newGuidedPage(index)) }); }}><option value={0}>Scegli il numero</option>{Array.from({ length: 28 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select></label>)}
        <p>Una riga per ogni pagina. Verranno create solo queste; le categorie le organizzeranno nel menu. Ricette, produzione, manutenzione e report creano una struttura esplicitamente da completare, non una funzione già operativa.</p>
        {spec.pages.map((page, index) => <div className="ai-page-plan" key={page.id}>
          <strong>Pagina {index + 1}</strong>{question(`page.${page.id}.title`, <label>Nome pagina {index + 1}<input maxLength={80} value={page.title} onChange={event => updatePage(page.id, { title: event.target.value })} placeholder="Es. Sinottico trasportatori" /></label>)}
          {question(`page.${page.id}.kind`, <label>Funzione pagina {index + 1}<select value={page.kind} onChange={event => { const kind = guidedPageKinds.find(kind => kind.id === event.target.value)!; updatePage(page.id, { kind: kind.id, section: kind.section, imageNeed: ["overview", "synoptic", "commands"].includes(kind.id) ? "required" : kind.image ? "optional" : "none", items: [], itemsDeferred: false, image: undefined, imageDeferred: false }); }}>{guidedPageKinds.map(kind => <option value={kind.id} key={kind.id}>{kind.label}</option>)}</select></label>)}
          {question(`page.${page.id}.section`, <label>Categoria pagina {index + 1}<select value={page.section} onChange={event => updatePage(page.id, { section: event.target.value as typeof page.section })}>{standardProjectSectionChoices.map(section => <option value={section.id} key={section.id}>{section.label}</option>)}</select></label>)}
          <details className="ai-page-behavior"><summary>Come funziona questa base</summary><TemplateBehaviorInfo behavior={guidedTemplateBehavior(page.kind)!} /></details>
        </div>)}
      </>}
      {step === "data" && <>
        {question("tags", <label>Hai già una lista dei tag PLC?<select value={spec.tagsMode} onChange={event => updateSpec({ tagsMode: event.target.value as typeof spec.tagsMode, ...(event.target.value !== "import" ? { tags: [], tagsFile: undefined, alarms: undefined, alarmsFile: undefined, alarmsMode: "later" as const, pages: spec.pages.map(page => ({ ...page, items: page.items.map(item => ({ ...item, tag: "", ...(item.command ? { command: { ...item.command, reviewed: false } } : {}) })) })) } : {}) })}><option value="later">Non ancora: li collegherò dopo</option><option value="import">Sì, voglio importarla adesso</option><option value="none">Non servono dati PLC in questa prima versione</option></select></label>)}
        {spec.tagsMode === "import" && <div className="ai-import"><label>Inserisci la lista tag (JSON Framecraft oppure CSV)<input type="file" accept=".json,.csv" onChange={event => { void importFile(event.target.files?.[0], "tags"); event.target.value = ""; }} /></label><p>CSV: colonne Name, DataType (o Nome, Tipo), Address e Description facoltative. JSON: catalogo framecraft.plc.json. Fino a 2 MB; niente credenziali.</p>{spec.tagsFile && <details><summary>{spec.tagsFile}: {spec.tags.length} tag importati · controlla</summary><ul>{spec.tags.slice(0, 100).map(tag => <li key={tag.name}>{tag.name} · {tag.dataType} · {tag.address || "indirizzo non disponibile"}</li>)}</ul>{spec.tags.length > 100 && <p>Mostrati i primi 100; il progetto conserverà tutti i {spec.tags.length} tag.</p>}</details>}</div>}
        {spec.pages.some(page => ["alarms", "history"].includes(page.kind)) && <>
          {question("alarms", <label>Hai già la lista allarmi con segnali e condizioni di attivazione?<select value={spec.alarmsMode} onChange={event => updateSpec({ alarmsMode: event.target.value as typeof spec.alarmsMode, ...(event.target.value === "later" ? { alarms: undefined, alarmsFile: undefined } : {}) })}><option value="later">La configurerò dopo: non inventare allarmi o soglie</option><option value="import">Sì, ho un catalogo Framecraft JSON</option></select></label>)}
          {spec.alarmsMode === "import" && <div className="ai-import"><label>Inserisci framecraft.alarms.json<input type="file" accept=".json" onChange={event => { void importFile(event.target.files?.[0], "alarms"); event.target.value = ""; }} /></label><p>Importa prima i tag. Sono necessari messaggi, classi e trigger reali: un semplice elenco di testi non dice quale segnale attiva ogni allarme.</p>{spec.alarmsFile && <details><summary>{spec.alarmsFile}: {spec.alarms?.alarms.length} allarmi validati · controlla</summary><ul>{spec.alarms?.alarms.slice(0, 100).map(alarm => <li key={alarm.id}>{alarm.name} · {alarm.text} · {alarm.tag}</li>)}</ul></details>}</div>}
          {spec.pages.some(page => page.kind === "history") && <p className="ai-hint">Lo storico iniziale è di sessione. La conservazione persistente va configurata prima della produzione.</p>}
        </>}
      </>}
      {page && kind && <>
        <p>{kind.label} · {page.title}</p>
        <TemplateBehaviorInfo behavior={guidedTemplateBehavior(page.kind)!} />
        {kind.image && question(`page.${page.id}.image`, <>
          <label>Vuoi un’immagine in questa pagina?<select value={page.imageNeed} onChange={event => updatePage(page.id, { imageNeed: event.target.value as typeof page.imageNeed })}><option value="required">Sì, è necessaria per capire la macchina</option><option value="optional">È utile ma facoltativa</option><option value="none">No, questa pagina non la deve avere</option></select></label>
          {page.imageNeed !== "none" && <div className="ai-import"><strong>{page.imageNeed === "required" ? "Immagine richiesta" : "Immagine facoltativa"}: {kind.image}</strong><p>{page.kind === "synoptic" ? "Usa lo screen della parte della tua macchina. Le targhette sono elementi separati, spostabili con il mouse nell’editor: non fanno parte della foto." : "Scegli la grafica reale della tua macchina. Non verrà sostituita con un’immagine inventata dall’AI."}</p>
            <button type="button" onClick={() => void chooseImage(page.id)}><ImagePlus size={16} />{page.image ? "Sostituisci immagine" : "Scegli immagine per questa pagina"}</button>
            {page.image && <p>{page.image.split(/[\\/]/).at(-1)} <button type="button" onClick={() => updatePage(page.id, { image: undefined })}>Rimuovi</button></p>}
            {!page.image && <label className="ai-check"><input type="checkbox" checked={page.imageDeferred} onChange={event => updatePage(page.id, { imageDeferred: event.target.checked })} />Non l’ho ancora: crea un segnaposto da completare</label>}
          </div>}
        </>)}
        {kind.items && question(`page.${page.id}.items`, <>
          <label>{kind.items} · un nome per riga, massimo {guidedItemLimit(page.kind)}<textarea rows={4} maxLength={1000} value={page.items.map(item => item.label).join("\n")} onChange={event => updatePage(page.id, { items: withGuidedItemLabels(page.items, event.target.value.split("\n")) })} placeholder={page.kind === "synoptic" ? "M2400\nM2401" : "Inserisci i nomi reali"} /></label>
          {!page.items.some(item => item.label.trim()) && <label className="ai-check"><input type="checkbox" checked={page.itemsDeferred} onChange={event => updatePage(page.id, { itemsDeferred: event.target.checked, items: [] })} />Non li conosco ancora: li aggiungerò nell’editor</label>}
          {page.kind !== "commands" && page.items.map((item, index) => item.label.trim() && <label key={index}>Quale tag mostra “{item.label}”?<select value={item.tag} onChange={event => updatePage(page.id, { items: page.items.map((item, at) => at === index ? { ...item, tag: event.target.value } : item) })}><option value="">Lo collegherò dopo</option>{spec.tagsMode === "import" && spec.tags.filter(tag => tag.access !== "write").map(tag => <option key={tag.name} value={tag.name}>{tag.name} · {tag.dataType}</option>)}</select></label>)}
          {page.kind === "commands" && <><p className="ai-hint">Configura qui i comandi di cui conosci il mapping reale. Gli altri restano disabilitati. Rinominare un comando richiede un nuovo controllo del collegamento: le azioni non vengono trasferite a un nome diverso.</p>
            {spec.tagsMode === "import" && page.items.some(item => item.command) && <GuidedCommandTagOptions id={`ai-write-tags-${page.id}`} tags={spec.tags} />}
            {page.items.map((item, index) => item.label.trim() && <GuidedCommandFields key={index} item={item} tags={spec.tagsMode === "import" ? spec.tags : []} tagListId={`ai-write-tags-${page.id}`} onGoData={() => go("data")} onChange={next => updatePage(page.id, { items: page.items.map((item, at) => at === index ? next : item) })} />)}
            <p className="ai-hint">Sono scritture singole, non comandi a uomo presente. Pressione/rilascio, arresto sicuro e watchdog richiedono un contratto PLC da progettare e collaudare: il browser non è un dispositivo di sicurezza. Generare il progetto non avvia connessioni o scritture.</p>
          </>}
        </>)}
        {page.kind === "empty" && <p>Verrà creata una pagina con titolo e cornice, pronta per aggiungere elementi nell’editor.</p>}
      </>}
      {step === "use" && <>
        {question("protocol", <label>Come arriveranno i dati della macchina?<select value={spec.protocol} onChange={event => updateSpec({ protocol: event.target.value as typeof spec.protocol })}><option value="later">Non so ancora: configurerò la connessione dopo</option><option value="mqtt">MQTT</option><option value="opcua">OPC UA</option><option value="simulation">Per adesso solo simulazione</option></select></label>)}<p>Questa scelta registra il requisito. Broker, endpoint, certificati e credenziali si configurano dopo: la procedura non avvia connessioni.</p>
        {question("language", <label>Qual è la lingua prevista per l’operatore?<select value={spec.language} onChange={event => updateSpec({ language: event.target.value as typeof spec.language })}><option value="it">Italiano</option><option value="en">Inglese (traduzioni da completare)</option></select></label>)}
        {question("users", <label>Tutti possono usare gli stessi comandi?<select value={spec.users} onChange={event => updateSpec({ users: event.target.value as typeof spec.users })}><option value="everyone">Sì, per questa prima bozza</option><option value="roles-later">No: servono ruoli operatore / manutenzione da configurare</option><option value="later">Accesso da definire · niente comandi senza permesso reale</option></select></label>)}<p>Le autorizzazioni della macchina vanno verificate sul server e nel PLC, non affidate alla sola grafica.</p>
      </>}
      {spec.requirements && (step === "features" || step.startsWith("req-")) && <PanelRequirementFields step={step} requirements={spec.requirements} pages={spec.pages} delegated={interview.delegated} questions={questions} onDelegate={delegate} onChange={requirements => updateSpec({ requirements })} />}
      {step === "review" && <>
        <AiDelegationReview interview={interview} />
        <h4>{interview.machineName} · {spec.pages.length} pagine · {interview.layout === "desktop-mobile" ? "Desktop e mobile" : "Desktop"}</h4>
        <ol>{spec.pages.map(page => <li key={page.id}><strong>{page.title}</strong> · {guidedPageKinds.find(kind => kind.id === page.kind)?.label} · {page.section}{page.image ? ` · immagine: ${page.image.split(/[\\/]/).at(-1)}` : ""}</li>)}</ol>
        <p>{spec.tags.length} tag importati localmente · {spec.alarms?.alarms.length ?? 0} allarmi. Nessun indirizzo o soglia inventato.</p>
        {spec.requirements && <PanelRequirementsReview requirements={spec.requirements} pages={spec.pages} onEdit={go} />}
        {spec.pages.some(page => page.items.some(item => item.command)) && <section className="ai-command-review" aria-label="Mapping comandi da approvare"><h4>Controlla anche i comandi configurati</h4><ul>{spec.pages.flatMap(page => page.items.filter(item => item.command).map((item, index) => <li key={`${page.id}-${index}`}><strong>{page.title} · {item.label}</strong>: {hmiEventLabels[item.command!.event]} → {item.tag || "tag da scegliere"} = <code>{JSON.stringify(item.command!.value)}</code>{item.command!.permission ? ` · permesso ${item.command!.permission}` : " · tutti per la bozza"}</li>))}</ul><p>I mapping restano locali: tag e valori non vengono inviati a Codex. La ricevuta del trasporto non conferma l’esecuzione del comando nel PLC.</p></section>}
        <details><summary>Cosa resterà da completare e collaudare</summary><ul>{guidedProjectPending(spec).map((item, index) => <li key={index}>{item}</li>)}</ul></details>
        {interview.followups.map((item, index) => <AiQuestion key={index} label={item.question} delegated={!!item.skipped} onToggle={() => update({ followups: interview.followups.map((item, at) => at === index ? { ...item, skipped: !item.skipped } : item) })}><label>{item.question}<input maxLength={1000} value={item.answer} onChange={event => update({ followups: interview.followups.map((item, at) => at === index ? { ...item, answer: event.target.value } : item) })} /></label></AiQuestion>)}
        <details className="ai-context"><summary>Contesto che verrà inviato a Codex</summary><p>Solo le risposte, nomi delle pagine ed elementi e conteggi dei dati. Immagini, file, indirizzi, nomi tag e percorsi locali restano sul computer.</p><pre>{issues.length ? "Completa prima le risposte mancanti." : JSON.stringify(interviewContext(interview), null, 2)}</pre></details>
        <label className="ai-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Invia queste risposte a Codex usando il mio account ChatGPT. Controllerò la proposta prima di creare.</span></label>
        <button type="button" className="button primary" disabled={!consent || !!issues.length || !ai.account?.connected || !ai.model} onClick={() => void ai.propose("")}><Sparkles size={16} />Prepara proposta delle pagine scelte</button>
      </>}
    </fieldset>
    {!!issues.length && <ul className="ai-hint" aria-label="Risposte da completare">{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
    {ai.busy && <p role="status"><LoaderCircle size={16} className="spin" /> Codex sta verificando il piano. Nessun file viene modificato. <button type="button" onClick={() => void ai.cancel()}>Annulla richiesta</button></p>}
    {ai.error && <p className="ai-error" role="alert">{ai.error}</p>}
    {step === "review" && ai.proposal && <section className="ai-proposal" aria-label="Revisione proposta"><h3>Controlla il piano prima di creare</h3><p>{ai.proposal.summary}</p>
      <AiDelegationReview interview={interview} decisions={ai.proposal.decisions} />
      {ai.resolvedInterview && delegatedQuestions(interview).length > 0 && <><h4>{ai.resolvedInterview.machineName} · {ai.resolvedInterview.spec.pages.length} pagine · {ai.resolvedInterview.layout === "desktop-mobile" ? "Desktop e mobile" : "Desktop"}</h4><p>{ai.resolvedInterview.spec.purpose}</p><ol>{ai.resolvedInterview.spec.pages.map(page => <li key={page.id}><strong>{page.title}</strong> · {guidedPageKinds.find(kind => kind.id === page.kind)?.label} · {standardProjectSectionChoices.find(section => section.id === page.section)?.label}</li>)}</ol>{ai.resolvedInterview.spec.requirements && <PanelRequirementsReview requirements={ai.resolvedInterview.spec.requirements} pages={ai.resolvedInterview.spec.pages} onEdit={go} />}<details><summary>Parti da completare dopo le scelte AI</summary><ul>{guidedProjectPending(ai.resolvedInterview.spec).map((pending, index) => <li key={index}>{pending}</li>)}</ul></details></>}
      {ai.proposal.warnings.length > 0 && <ul>{ai.proposal.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      {ai.proposal.questions.length > 0 ? <><p>Servono ancora queste informazioni. Puoi rispondere oppure lasciare la scelta all’AI.</p><button type="button" disabled={busy} onClick={() => update({ followups: [...interview.followups, ...ai.proposal!.questions.map(question => ({ question, answer: "" }))] })}>Rispondi alle domande aggiuntive</button></> : <button type="button" className="button primary" disabled={busy || !!issues.length} onClick={() => void approve()}><Sparkles size={16} />Approva, scegli cartella e crea {ai.resolvedInterview?.spec.pages.length ?? spec.pages.length} pagine</button>}
    </section>}
    {notice && <p role="status" className="ai-error">{notice}</p>}
    <nav className="ai-interview-navigation" aria-label="Passi della procedura">
      <button type="button" disabled={!index || busy} onClick={() => go(steps[index - 1].id)}><ArrowLeft size={16} />Indietro</button>
      {index < steps.length - 1 && <button type="button" className="button primary" disabled={!!issues.length || busy} onClick={() => go(steps[index + 1].id)}>Avanti<ArrowRight size={16} /></button>}
    </nav>
  </section>;
}
