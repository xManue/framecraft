import { panelSize } from "./hmiStandard";
import { inheritedTemplateAnswers } from "./templateBehavior";

export interface PanelQuestion {
  id: string; label: string; hint?: string; options?: readonly (readonly [string, string])[];
  local?: boolean; when?: readonly [string, string];
}
export interface PanelRequirementGroup {
  id: string; label: string; hint: string; optional?: boolean; pageKinds?: readonly string[]; questions: readonly PanelQuestion[];
}
const choice = (id: string, label: string, options: readonly (readonly [string, string])[], hint?: string): PanelQuestion => ({ id, label, options, hint });
const detail = (id: string, label: string, hint?: string): PanelQuestion => ({ id, label, local: true, hint });
const yesNo = [["yes", "Sì"], ["no", "No"]] as const;
export const panelRequirementGroups: readonly PanelRequirementGroup[] = [
  { id: "device", label: "Dispositivo e grafica", hint: `Lo standard resta ${panelSize.width} × ${panelSize.height} con layout mobile. Gli altri formati e lo stile richiesto sono requisiti da adattare nell’editor.`, questions: [
    choice("target", "Su quale dispositivo verrà usato?", [["industrial", "Panel PC industriale"], ["pc", "PC con browser"], ["tablet", "Tablet"], ["phone", "Telefono"], ["mixed", "Più dispositivi"]]),
    choice("resolution", "Qual è la risoluzione del display principale?", [[`${panelSize.width}x${panelSize.height}`, `${panelSize.width} × ${panelSize.height} · standard`], ["1366x768", "1366 × 768"], ["1920x1080", "1920 × 1080"], ["1024x768", "1024 × 768"], ["custom", "Altro formato"]]),
    { ...detail("customResolution", "Quale altro formato serve?", "Larghezza × altezza in pixel; non viene applicato automaticamente."), when: ["resolution", "custom"] },
    choice("input", "Come userà i comandi l’operatore?", [["mouse", "Mouse e tastiera"], ["touch", "Touch"], ["gloves", "Touch con guanti"], ["mixed", "Touch e mouse"]]),
    choice("theme", "Quale stile grafico vuoi?", [["standard", "Standard Framecraft"], ["light", "Chiaro"], ["dark", "Scuro"], ["company", "Stile aziendale"]]),
    detail("branding", "Quali colori, logo o font aziendali sono necessari?", "Descrivi i riferimenti; non inserire percorsi o credenziali. Il logo va poi aggiunto come immagine reale nell’editor."),
    choice("mobileUse", "Da mobile si può comandare la macchina?", [["monitor", "Solo monitoraggio richiesto"], ["commands", "Anche comandi, da autorizzare e collaudare"]], "È un requisito: non configura una barriera di sicurezza o permessi server."),
  ] },
  { id: "navigation", label: "Navigazione e oggetti riutilizzabili", hint: "La pagina iniziale scelta viene applicata. Popup, componenti riutilizzabili e regole speciali restano da configurare.", questions: [
    choice("menu", "Come vuoi organizzare la navigazione?", [["categories", "Menu per categorie · standard"], ["linear", "Percorso guidato in sequenza"], ["stations", "Per stazione o zona macchina"]]),
    choice("popups", "Servono finestre di dettaglio o popup?", yesNo),
    { ...detail("popupDetails", "Quali popup servono e da quale oggetto si aprono?", "Es. dettaglio motore dalle targhette M2400/M2401."), when: ["popups", "yes"] },
    choice("faceplates", "Servono oggetti ripetuti con gli stessi comandi e stati?", yesNo),
    { ...detail("faceplateDetails", "Quali famiglie e quante istanze?", "Es. motori, valvole, inverter; descrivi letture, comandi e dettagli richiesti."), when: ["faceplates", "yes"] },
    detail("pageRules", "Quali pagine devono essere nascoste o bloccate e per chi?", "Le regole di pagina vanno configurate e verificate; non bastano permessi nel browser."),
  ] },
  { id: "connections", label: "PLC e qualità dei dati", hint: "Protocollo e requisiti vengono registrati; broker, nodi, topic, certificati e segreti si configurano in Connessioni PLC. Nessuna rete parte dalla procedura.", questions: [
    choice("plcCount", "Quanti PLC o sorgenti dati ci sono?", [["none", "Nessuno, pannello dimostrativo"], ["one", "Uno"], ["multiple", "Più di uno"]]),
    detail("equipment", "Quali PLC, modelli e stazioni devono essere collegati?", "Nomi e modelli restano locali. Non inserire password, token o certificati privati."),
    choice("environment", "A cosa collegherai la prima versione?", [["physical", "PLC fisico"], ["virtual", "PLC virtuale"], ["demo", "Solo dati di prova, riconoscibili come simulazione"]]),
    choice("update", "Quanto spesso devono aggiornarsi le letture?", [["250", "250 ms"], ["500", "500 ms"], ["1000", "1 secondo"], ["5000", "5 secondi"]], "Non modifica il polling del gateway: frequenza e carico vanno verificati sulla connessione reale."),
    choice("loss", "Come deve apparire una perdita di collegamento?", [["unknown", "Valore non disponibile e avviso"], ["last-marked", "Ultimo valore, marcato come non aggiornato"]]),
    detail("units", "Quali unità, decimali, scale e limiti servono per i valori?", "Indica valore/tag e unità, es. pressione in bar con due decimali. Non deduco soglie dal nome del tag."),
    choice("tls", "La connessione richiede TLS e certificati?", yesNo),
  ] },
  { id: "operations", label: "Comandi e sequenze", hint: "La procedura genera soltanto scritture singole esplicitamente approvate nelle pagine Comandi manuali. Sequenze, pressione/rilascio e sicurezza non vengono create da queste risposte.", questions: [
    choice("mode", "Quali modalità di lavoro deve mostrare?", [["monitor", "Solo monitoraggio"], ["manual", "Manuale"], ["automatic", "Automatico"], ["both", "Manuale e automatico"]]),
    choice("confirm", "Servono conferme prima dei comandi delicati?", yesNo),
    { ...detail("confirmDetails", "Quali comandi richiedono conferma e quale messaggio?"), when: ["confirm", "yes"] },
    choice("hold", "Ci sono comandi attivi solo mentre tieni premuto?", yesNo, "Non supportati nella generazione guidata: richiedono lease/watchdog e interlock PLC, mai il solo rilascio nel browser."),
    { ...detail("holdDetails", "Quali movimenti e quale contratto di arresto PLC sono previsti?"), when: ["hold", "yes"] },
    detail("interlocks", "Quali consensi, interblocchi e feedback autorizzano o confermano i comandi?", "Descrivi segnali reali e comportamento in caso di timeout; non sono implementati dalla descrizione."),
    detail("sequences", "Quali sequenze, stati e passaggi devono essere mostrati?", "Es. avvio ciclo, arresto, reset; la conferma del trasporto non equivale all’esecuzione nel PLC."),
  ] },
  { id: "alarms", label: "Allarmi e storico", optional: true, pageKinds: ["alarms", "history"], hint: "Catalogo importato e controlli allarmi sono generati; archivi persistenti, suoni e notifiche richiedono configurazione e collaudo separati.", questions: [
    choice("ack", "È richiesta la conferma degli allarmi?", [["none", "No"], ["operator", "Conferma operatore"], ["restricted", "Solo utenti autorizzati"]]),
    choice("history", "Per quanto tempo devono restare gli allarmi nello storico?", [["session", "Solo sessione iniziale"], ["7d", "7 giorni"], ["30d", "30 giorni"], ["365d", "1 anno"]]),
    choice("sound", "Servono segnalazioni sonore?", yesNo),
    detail("classes", "Quali classi, priorità e istruzioni per risolverli servono?", "I trigger devono provenire dal catalogo reale; un elenco di testi non identifica le condizioni PLC."),
    choice("export", "Serve esportare lo storico?", [["none", "No"], ["csv", "CSV"], ["pdf", "PDF"]]),
  ] },
  { id: "trends", label: "Trend e archiviazione dei valori", optional: true, pageKinds: ["trend", "function-trend"], hint: "Intervallo e campionamento vengono applicati ai grafici temporali e X/Y generati. Nei grafici X/Y l’intervallo seleziona i campioni, non l’asse X. Archiviazione persistente e destinazione dati restano da configurare.", questions: [
    choice("range", "Quale intervallo mostra il grafico all’apertura?", [["60000", "1 minuto"], ["600000", "10 minuti"], ["3600000", "1 ora"], ["28800000", "8 ore"], ["86400000", "24 ore"]]),
    choice("sample", "Ogni quanto acquisire un punto del trend?", [["1000", "1 secondo"], ["5000", "5 secondi"], ["10000", "10 secondi"], ["60000", "1 minuto"]]),
    choice("source", "Servono valori online o anche dati archiviati?", [["online", "Online"], ["history", "Archiviati"], ["both", "Entrambi"]]),
    choice("retention", "Quanto conservare i dati archiviati?", [["session", "Solo sessione"], ["7d", "7 giorni"], ["30d", "30 giorni"], ["365d", "1 anno"]]),
    choice("export", "Serve esportare i campioni?", yesNo),
    detail("axes", "Quali unità, assi, soglie e curve X/Y servono?", "I tag si scelgono nei contenuti delle pagine. Soglie e curve X/Y non vengono dedotte automaticamente."),
  ] },
  { id: "recipes", label: "Ricette e formati", optional: true, pageKinds: ["recipes"], hint: "Requisito raccolto, non ricette operative generate. Servono schema, valori reali, validazione e conferma applicativa PLC.", questions: [
    detail("fields", "Quali parametri compongono una ricetta?", "Per ogni parametro: tipo, unità, limiti, tag e valore iniziale reale; nessun valore inventato."),
    choice("source", "Da dove arrivano le ricette?", [["new", "Da inserire nell’editor"], ["csv", "File CSV disponibile"], ["json", "File JSON disponibile"], ["db", "Database esterno"]], "La procedura registra la disponibilità, non importa né interpreta questi file."),
    choice("edit", "L’operatore può creare o modificare ricette?", [["view", "Solo vedere/selezionare"], ["edit", "Modificare con permesso"]]),
    choice("apply", "Quando si possono inviare i parametri al PLC?", [["idle", "Solo a macchina ferma"], ["approved", "Dopo conferma operatore e consensi PLC"]]),
    detail("handshake", "Come il PLC conferma che la ricetta è stata applicata?", "Indica ID/versione e segnali di conferma o errore: una ricevuta di scrittura non basta."),
  ] },
  { id: "production", label: "Produzione e manutenzione", optional: true, pageKinds: ["production", "maintenance"], hint: "Requisiti da completare: indicatori, contatori e avvisi non vengono inventati né collegati automaticamente.", questions: [
    choice("kpi", "Servono indicatori di produzione?", [["none", "No"], ["counts", "Pezzi, scarti e velocità"], ["oee", "Disponibilità, prestazione e qualità / OEE"]]),
    detail("definitions", "Quali segnali e formule definiscono gli indicatori?", "Specifica sorgenti, reset, unità, obiettivi e finestre temporali."),
    choice("shifts", "Serve dividere i dati per turno o lotto?", [["none", "No"], ["shifts", "Turni"], ["batches", "Lotti"], ["both", "Entrambi"]]),
    choice("maintenance", "Servono contatori e scadenze di manutenzione?", yesNo),
    { ...detail("maintenanceDetails", "Quali parti, intervalli e permessi di reset?"), when: ["maintenance", "yes"] },
  ] },
  { id: "users", label: "Utenti, ruoli e audit", hint: "Le autorizzazioni dei comandi configurati restano fail-closed. Account server, SSO e audit industriale non sono attivati da queste scelte.", questions: [
    choice("identity", "Come si identificano gli utenti?", [["none", "Nessun accesso per la bozza"], ["local", "Account locali da configurare"], ["company", "Accesso aziendale / SSO da integrare"]]),
    detail("permissions", "Quali ruoli possono vedere, comandare, modificare e fare manutenzione?", "Descrivi la matrice ruoli/operazioni; non inserire nomi personali, password o PIN."),
    choice("timeout", "Dopo quanto tempo deve scadere la sessione inattiva?", [["5", "5 minuti"], ["15", "15 minuti"], ["30", "30 minuti"], ["none", "Da gestire senza scadenza automatica"]]),
    choice("audit", "È richiesto un registro delle operazioni degli utenti?", yesNo),
    { ...detail("auditDetails", "Quali operazioni e per quanto tempo conservare l’audit?"), when: ["audit", "yes"] },
  ] },
  { id: "localization", label: "Lingue, orari e accessibilità", hint: "Lingue aggiuntive, traduzioni, fuso e adattamenti dei controlli sono requisiti da configurare; l’AI non inventa testi macchina tradotti.", questions: [
    choice("languages", "Servono altre lingue oltre a quella principale?", [["none", "No"], ["it-en", "Italiano e inglese"], ["other", "Altre lingue"]]),
    { ...detail("languageDetails", "Quali lingue e chi fornirà le traduzioni?"), when: ["languages", "other"] },
    choice("time", "Quale riferimento usare per gli orari?", [["device", "Fuso del dispositivo"], ["utc", "UTC"], ["plant", "Fuso dell’impianto da specificare"]]),
    { ...detail("timeDetails", "Qual è il fuso dell’impianto?", "Es. Europe/Rome, includendo il cambio ora legale."), when: ["time", "plant"] },
    choice("accessibility", "Servono particolari accorgimenti di leggibilità?", [["standard", "Testo, icone e contrasto standard"], ["large", "Testi e comandi grandi"], ["color", "Stati distinguibili anche senza colori"]]),
  ] },
  { id: "reports", label: "Report, documenti e integrazioni", optional: true, pageKinds: ["reports"], hint: "La disponibilità dei documenti viene registrata. PDF, database, notifiche e servizi esterni non vengono importati, interpretati o attivati in questa procedura.", questions: [
    choice("format", "Quali report o esportazioni servono?", [["none", "Nessun report"], ["csv", "CSV"], ["pdf", "PDF"], ["both", "CSV e PDF"]]),
    choice("trigger", "Quando devono essere prodotti?", [["manual", "Su richiesta"], ["shift", "A fine turno"], ["batch", "A fine lotto"], ["schedule", "A orario programmato"]]),
    detail("contents", "Quali dati, filtri e destinatari devono avere i report?", "Descrivi i ruoli destinatari, non indirizzi email personali o segreti."),
    choice("documents", "Quali documenti macchina hai già?", [["none", "Nessuno"], ["electrical", "Schema elettrico / PDF"], ["manual", "Manuale macchina"], ["functional", "Specifiche di sequenza / progetto precedente"], ["multiple", "Più documenti di questi tipi"]]),
    detail("integrations", "Servono database, MES/ERP, API, notifiche o lettore barcode?", "Indica soltanto sistemi e flussi richiesti. Non inserire credenziali o URL privati con token."),
  ] },
  { id: "delivery", label: "Pubblicazione, backup e collaudo", hint: "Queste risposte preparano il piano di rilascio, non un eseguibile o installer. Nessun publish, connessione o approvazione produzione automatica.", questions: [
    choice("package", "Come vuoi distribuire il pannello finito?", [["browser", "Web app su server locale"], ["kiosk", "Browser kiosk / Panel PC"], ["exe", "Eseguibile richiesto · packaging da implementare"], ["installer", "Installer richiesto · packaging da implementare"]]),
    choice("network", "Dove sarà raggiungibile?", [["local", "Solo questo computer"], ["lan", "Rete locale impianto"], ["remote", "Accesso remoto protetto da progettare"]]),
    choice("offline", "Che cosa serve se manca rete o servizio PLC?", [["monitor", "Avviso e nessun comando"], ["history", "Anche consultazione archivio locale, da configurare"]]),
    choice("backup", "Servono backup e ripristino dei dati del pannello?", yesNo),
    detail("acceptance", "Quali prove devono passare prima del rilascio?", "Es. PLC virtuale poi reale, perdita rete, riavvio, ruoli, reset, allarmi, recupero dati e dispositivi touch."),
    detail("extra", "Quale altro requisito indispensabile non abbiamo chiesto?", "Solo requisiti aggiuntivi; niente credenziali. Resta locale e non diventa codice eseguibile."),
  ] },
];
export interface PanelRequirements { version: 1; enabled: Record<string, "yes" | "no" | "later">; answers: Record<string, string>; startPageId: string }
export function newPanelRequirements(): PanelRequirements {
  return { version: 1, enabled: Object.fromEntries(panelRequirementGroups.filter(group => group.optional).map(group => [group.id, "later"])), answers: {}, startPageId: "" };
}
export function requirementGroupEnabled(group: PanelRequirementGroup, requirements: PanelRequirements, pageKinds: readonly string[]) {
  return !group.optional || requirements.enabled[group.id] === "yes" || pageKinds.some(kind => group.pageKinds?.includes(kind));
}
export function requirementQuestionActive(group: PanelRequirementGroup, question: PanelQuestion, requirements: PanelRequirements) {
  return !question.when || requirements.answers[`${group.id}.${question.when[0]}`] === question.when[1];
}
export function panelRequirementsIssues(requirements: PanelRequirements, pages: readonly { id: string; kind: string }[]) {
  const issues: string[] = [];
  const record = (value: unknown) => !!value && typeof value === "object" && !Array.isArray(value);
  if (!requirements || requirements.version !== 1 || !record(requirements.answers) || !record(requirements.enabled) || typeof requirements.startPageId !== "string" || Object.keys(requirements).some(key => !["version", "answers", "enabled", "startPageId"].includes(key))) return ["Requisiti del pannello non validi."];
  if (requirements.startPageId && !pages.some(page => page.id === requirements.startPageId)) issues.push("Navigazione: scegli una pagina iniziale presente nel piano.");
  for (const [id, mode] of Object.entries(requirements.enabled)) {
    const group = panelRequirementGroups.find(group => group.id === id && group.optional);
    if (!group || !["yes", "no", "later"].includes(mode)) issues.push("Funzioni: una scelta non è valida.");
    else if (mode === "no" && pages.some(page => group.pageKinds?.includes(page.kind))) issues.push(`Funzioni: ${group.label} non può essere esclusa mentre è presente una pagina dedicata.`);
  }
  for (const [key, value] of Object.entries(requirements.answers)) {
    const [groupId, questionId, extra] = key.split("."), group = panelRequirementGroups.find(group => group.id === groupId), question = group?.questions.find(question => question.id === questionId);
    if (!group || !question || extra !== undefined || typeof value !== "string" || value.length > 1500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || question.options && value !== "later" && !question.options.some(option => option[0] === value)) issues.push(`${group?.label ?? "Requisiti"}: risposta non valida; controlla le scelte.`);
  }
  return issues;
}
export function panelRequirementsSummary(requirements: PanelRequirements, pageKinds: readonly string[]) {
  const defaults = inheritedTemplateAnswers(pageKinds), answers = { ...defaults, ...requirements.answers };
  return panelRequirementGroups.filter(group => requirementGroupEnabled(group, requirements, pageKinds)).map(group => ({
    id: group.id, label: group.label, hint: group.hint,
    answers: group.questions.filter(question => requirementQuestionActive(group, question, { ...requirements, answers })).map(question => {
      const key = `${group.id}.${question.id}`;
      return { key, label: question.label, value: answers[key] || "later", local: !!question.local, inherited: key in defaults && !(key in requirements.answers) };
    }),
  }));
}
export function panelRequirementsContext(requirements: PanelRequirements, pageKinds: readonly string[]) {
  return { startPageId: requirements.startPageId || null, features: Object.fromEntries(panelRequirementGroups.filter(group => group.optional).map(group => [group.id, requirementGroupEnabled(group, requirements, pageKinds) ? "yes" : requirements.enabled[group.id] ?? "later"])),
    groups: panelRequirementsSummary(requirements, pageKinds).map(group => ({ id: group.id, answers: Object.fromEntries(group.answers.map(answer => [answer.key, answer.local ? { detailsProvided: answer.value !== "later" && !!answer.value.trim() } : answer.value])) })),
  };
}
export function panelRequirementsPending(requirements: PanelRequirements, pageKinds: readonly string[]) {
  const pending = panelRequirementsSummary(requirements, pageKinds).map(group => `${group.label}: ${group.hint}`);
  for (const group of panelRequirementGroups.filter(group => group.optional && !requirementGroupEnabled(group, requirements, pageKinds) && requirements.enabled[group.id] !== "no")) pending.push(`${group.label}: necessità rimandata, da valutare prima del rilascio.`);
  const unanswered = panelRequirementsSummary(requirements, pageKinds).reduce((count, group) => count + group.answers.filter(answer => answer.value === "later").length, 0);
  if (unanswered) pending.push(`${unanswered} risposte sui requisiti rimandate: completarle o confermare che non servono prima del rilascio.`);
  return pending;
}
