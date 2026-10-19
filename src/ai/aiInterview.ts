import { guidedPageKinds, guidedProjectIssues, guidedProjectPending, type GuidedPage, type GuidedProjectSpec } from "../core/guidedProject";
import { parsePlcCatalog, isPlcVariableName } from "../core/plcVariables";
import { parseAlarmCatalog } from "../core/hmiAlarms";
import { plcVariablesFromSheet } from "../core/tagImport";
import type { StandardProjectConfig } from "../core/standardProject";
import { newPanelRequirements, panelRequirementGroups, panelRequirementsContext, requirementGroupEnabled } from "../core/panelRequirements";
import { guidedTemplateBehavior, inheritedTemplateAnswers } from "../core/templateBehavior";
import { delegatedQuestions, delegationContext, resolveInterviewDelegation } from "./aiDelegation";
import { panelHeaderFields } from "../core/panelHeader";

export interface AiInterview { machineName: string; layout: StandardProjectConfig["layout"]; spec: GuidedProjectSpec; step: string; delegated?: string[]; followups: { question: string; answer: string; skipped?: boolean }[] }
export function newAiInterview(): AiInterview {
  return { machineName: "", layout: "desktop-mobile", step: "machine", followups: [], spec: { version: 1, purpose: "", pages: [], tagsMode: "later", tags: [], alarmsMode: "later", protocol: "later", language: "it", users: "everyone", requirements: newPanelRequirements() } };
}
export function newGuidedPage(index: number): GuidedPage {
  return { id: `page-${index + 1}`, title: "", section: "main", kind: "overview", imageNeed: "required", imageDeferred: false, items: [], itemsDeferred: false };
}
export function interviewSteps(interview: AiInterview) {
  return [
    { id: "machine", label: "Macchina e dispositivo" }, { id: "pages", label: "Quante pagine e quali" },
    { id: "data", label: interview.spec.pages.some(page => ["alarms", "history"].includes(page.kind)) ? "Tag e lista allarmi" : "Dati e tag disponibili" },
    ...(interview.spec.tagsMode === "import" && interview.spec.tags.length || interview.spec.header ? [{ id: "header", label: "Informazioni nella barra superiore" }] : []),
    ...interview.spec.pages.filter(page => !["alarms", "history"].includes(page.kind)).map(page => ({ id: page.id, label: `Contenuti: ${page.title || page.id}` })),
    { id: "use", label: "Uso del pannello" },
    ...(interview.spec.requirements ? [
      { id: "features", label: "Quali altre funzioni servono?" },
      ...panelRequirementGroups.filter(group => requirementGroupEnabled(group, interview.spec.requirements!, interview.spec.pages.map(page => page.kind))).map(group => ({ id: `req-${group.id}`, label: group.label })),
    ] : []),
    { id: "review", label: "Riepilogo e proposta" },
  ];
}
export function interviewStepIssues(interview: AiInterview, step: string): string[] {
  const checked = resolveInterviewDelegation(interview), { spec } = checked;
  if (step === "machine") return [...(!checked.machineName.trim() || checked.machineName.length > 80 ? ["Inserisci il nome della macchina (massimo 80 caratteri)."] : []), ...(!spec.purpose.trim() ? ["Indica che cosa deve gestire il pannello."] : [])];
  if (step === "pages") return [...(!spec.pages.length ? ["Scegli quante pagine vuoi creare."] : []), ...spec.pages.filter(page => !page.title.trim()).map((_, index) => `Dai un nome alla pagina ${index + 1}.`), ...([...new Set(spec.pages.map(page => page.section))].some(section => spec.pages.filter(page => page.section === section).length > 14) ? ["Distribuisci le pagine: massimo 14 per categoria."] : [])];
  const issues = guidedProjectIssues(spec);
  if (step === "header") return issues.filter(issue => issue.startsWith("Barra del pannello:"));
  if (step === "review") return [...interviewStepIssues(interview, "machine"), ...issues, ...interview.followups.filter(item => !item.skipped && !item.answer.trim()).map(item => `Rispondi a: ${item.question}`)];
  if (step === "features") return issues.filter(issue => issue.startsWith("Funzioni:"));
  if (step.startsWith("req-")) {
    const label = panelRequirementGroups.find(group => `req-${group.id}` === step)?.label;
    return issues.filter(issue => label && issue.startsWith(`${label}:`) || step === "req-navigation" && issue.startsWith("Navigazione:"));
  }
  if (step === "data") return issues.filter(issue => !spec.pages.some(page => issue.startsWith(`${page.title}:`)) && !issue.startsWith("Completa nome") && !issue.startsWith("Spiega") && !issue.startsWith("Scegli da") && !panelRequirementGroups.some(group => issue.startsWith(`${group.label}:`)) && !issue.startsWith("Funzioni:") && !issue.startsWith("Navigazione:"));
  const page = spec.pages.find(page => page.id === step);
  return page ? issues.filter(issue => issue.startsWith(`${page.title}:`)) : [];
}
export function interviewConfig(interview: AiInterview): StandardProjectConfig {
  if (delegatedQuestions(interview).some(question => question.type !== "pending")) throw new Error("Prepara e controlla prima le scelte dell’AI per le domande delegate.");
  const issues = interviewStepIssues(interview, "review"); if (issues.length) throw new Error(issues[0]);
  interview = resolveInterviewDelegation(interview); const spec = interview.spec;
  return { machineName: interview.machineName.trim(), layout: interview.layout, sections: [...new Set(spec.pages.map(page => page.section))], settingsProgram: "robot", guided: spec.requirements ? { ...spec, requirements: { ...spec.requirements, answers: { ...inheritedTemplateAnswers(spec.pages.map(page => page.kind)), ...spec.requirements.answers } } } : spec };
}
export function interviewContext(interview: AiInterview) {
  const checked = resolveInterviewDelegation(interview); interviewConfig(checked);
  const skipped = new Set(delegatedQuestions(interview).map(question => question.key));
  const visible = (key: string, value: string) => skipped.has(key) ? null : value;
  const requirements = checked.spec.requirements ? panelRequirementsContext(checked.spec.requirements, checked.spec.pages.map(page => page.kind)) : undefined;
  if (requirements) for (const group of requirements.groups) for (const key of Object.keys(group.answers)) if (skipped.has(`req.${key}`)) delete group.answers[key];
  if (requirements) { if (skipped.has("startPageId")) requirements.startPageId = null; for (const key of Object.keys(requirements.features)) if (skipped.has(`feature.${key}`)) delete requirements.features[key]; }
  return { machineName: visible("machineName", interview.machineName.trim()), layout: visible("layout", interview.layout), purpose: visible("purpose", interview.spec.purpose),
    templates: (skipped.has("pages") || [...skipped].some(key => key.endsWith(".kind")) ? guidedPageKinds.map(kind => kind.id) : [...new Set(interview.spec.pages.map(page => page.kind))]).map(kind => guidedTemplateBehavior(kind)!),
    pages: checked.spec.pages.filter(page => interview.spec.pages.some(raw => raw.id === page.id)).map(page => ({ id: page.id, title: skipped.has("pages") && !interview.spec.pages.find(raw => raw.id === page.id)!.title.trim() ? null : visible(`page.${page.id}.title`, page.title), kind: visible(`page.${page.id}.kind`, page.kind), template: { id: skipped.has(`page.${page.id}.kind`) ? null : `guided:${page.kind}`, version: guidedTemplateBehavior(page.kind)!.version }, titleFromDictionary: !!page.titleTextKey, category: visible(`page.${page.id}.section`, page.section), image: { need: visible(`page.${page.id}.image`, page.imageNeed), available: !!page.image, deferred: page.imageDeferred }, elements: page.items.map(item => ({ label: item.label, textFromDictionary: !!item.textKey, tagLinked: !!item.tag, ...(page.kind === "function-trend" ? { xy: { xLinked: !!item.xTag, yLinked: !!item.tag } } : {}), ...(["trend", "function-trend"].includes(page.kind) ? { source: item.logged ? "log" : "online", ...(page.kind === "function-trend" ? { xSource: item.xLogged ? "log" : "online" } : {}) } : {}), ...(page.kind === "commands" ? { command: item.command ? { kind: item.command.kind ?? "write", ...(item.command.kind === "navigate" ? { targetPageId: item.command.targetPageId } : {}), configured: item.command.reviewed, event: item.command.event, permissionRequired: !!item.command.permission } : { configured: false } } : {}) })), itemsDeferred: page.itemsDeferred })),
    data: { tags: interview.spec.tagsMode, tagCount: interview.spec.tags.length, alarms: interview.spec.alarmsMode, alarmCount: interview.spec.alarms?.alarms.length ?? 0, textCount: interview.spec.resources?.multilingualTexts.length ?? 0, languageCount: interview.spec.resources?.languages.length ?? 0, dataLogCount: interview.spec.dataLogs?.logs.length ?? 0, loggedTagCount: interview.spec.dataLogs?.logs.reduce((sum, log) => sum + log.tags.length, 0) ?? 0 },
    header: { fields: Object.fromEntries(panelHeaderFields.map(field => [field.id, { linked: !!checked.spec.header?.tags[field.id] }])), speedScaleConfigured: !!checked.spec.header?.speedMin && !!checked.spec.header?.speedMax, values: "Only real samples with valid quality; no invented states, speed, formats or alarms. Device clock, not PLC time synchronization." },
    use: { protocol: visible("protocol", checked.spec.protocol), language: visible("language", checked.spec.language), users: visible("users", checked.spec.users) },
    ...(requirements ? { requirements } : {}), delegatedQuestions: delegationContext(interview),
    pending: guidedProjectPending(checked.spec), followups: interview.followups.map(item => item.skipped ? { question: item.question, delegated: true } : { question: item.question, answer: item.answer }),
  };
}
export function interviewPrompt(interview: AiInterview) {
  const context = interviewContext(interview), config = interviewConfig(resolveInterviewDelegation(interview));
  return JSON.stringify({ task: "create", approvedInterview: context, exactProject: { machineName: context.machineName, layout: context.layout, sections: context.delegatedQuestions.some(question => question.key === "pages" || question.key.endsWith(".section")) ? null : config.sections, settingsProgram: config.settingsProgram },
    rules: "Usa ESATTAMENTE pagine, titoli, categorie e layout non delegati. In decisions rispondi UNA volta a ogni delegatedQuestion non pending, solo con key e value ammessi; se non ci sono deleghe usa []. Le scelte delegate non hanno indicazioni: scegli tu una proposta coerente, non chiedere di nuovo la stessa cosa. Per pages e labels value contiene il JSON nel formato descritto. project rispecchia le decisions e tutte le scelte non delegate; i campi null di exactProject dipendono dalle decisions. Non eliminare o modificare le pagine già scelte; il numero delegato permette solo di aggiungerne. Se manca il processo usa uno scopo generico di bozza, non fatti macchina inventati. Ogni pagina include la scheda template: known e defaults descrivono il funzionamento già previsto. Non chiedere di rispiegarlo o confermarlo. implementation e limits distinguono struttura e funzioni disponibili: non dichiarare operative le strutture. La lingua scelta imposta il Runtime, non traduce tutto. Titoli e testi con titleFromDictionary/textFromDictionary sono già collegati localmente: non chiedere di riscriverne le traduzioni e non inventarne. Le parti non coperte e i ripieghi restano da verificare nel riepilogo locale. Non generare codice né inventare tag, allarmi, indirizzi, soglie, immagini, comandi PLC o autorizzazioni. Le domande pending restano da configurare localmente: non produrre decisions e non ripeterle in questions. Le domande aggiuntive delegate non vanno richieste nuovamente: proponi il layout nella descrizione, segnala i dati macchina non noti come limiti. La pipeline locale userà gli ingressi reali scelti dall’utente. Le parti esplicitamente rimandate sono avvisi, non domande bloccanti ripetute. Chiedi soltanto informazioni realmente indispensabili non raccolte e non delegate. Spiega cosa sarà già costruito e cosa resta da collaudare, senza dichiarare funzioni non supportate. provenance ammette solo approved-request e framecraft-standard." });
}
export function sameInterviewAiContext(previous: AiInterview, next: AiInterview): boolean {
  try { return interviewPrompt(previous) === interviewPrompt(next); } catch { return false; }
}
export function parseInterviewTags(name: string, source: string) {
  if (source.length > 2_000_000) throw new Error("Lista troppo grande: massimo 2 MB di testo.");
  if (!/\.(json|csv)$/i.test(name)) throw new Error("Scegli una lista tag JSON o CSV.");
  let warnings: string[] = [], tags;
  if (/\.json$/i.test(name)) {
    try { tags = parsePlcCatalog(source.replace(/^\uFEFF/, "")); }
    catch (error) { if (error instanceof SyntaxError) throw new Error("Il file JSON non è leggibile. Scegli un catalogo framecraft.plc.json valido oppure esporta la lista in CSV; nessun dato importato."); throw error; }
  }
  else {
    const rows = csvRows(source), nameColumn = rows[0]?.findIndex(header => ["name", "hmi tag name", "tag name", "tag", "nome", "variabile", "nome variabile"].includes(header.trim().toLowerCase())) ?? -1;
    const names = rows.slice(1).map(row => row[nameColumn]?.trim()).filter(Boolean);
    if (new Set(names).size !== names.length) throw new Error("Il CSV contiene nomi tag duplicati. Correggili prima di importare: non scelgo una riga al tuo posto.");
    const result = plcVariablesFromSheet({ name, rows });
    tags = result.variables; warnings = [...result.skipped.map(item => `Tag escluso perché non valido: ${item}`), ...(result.withoutPlcTag ? [`${result.withoutPlcTag} righe interne HMI escluse: non hanno un PLC tag.`] : [])];
  }
  if (!tags.length || tags.length > 5000 || tags.some(tag => !isPlcVariableName(tag.name) || !tag.dataType.trim()) || new Set(tags.map(tag => tag.name)).size !== tags.length) throw new Error("Servono da 1 a 5000 tag con nome unico e tipo dato. JSON: array variables; CSV: colonne Name e DataType (o Tipo). Gli indirizzi non vengono inventati.");
  return { tags, warnings };
}
export function parseInterviewAlarms(source: string, interview: AiInterview) {
  if (source.length > 2_000_000) throw new Error("Catalogo troppo grande: massimo 2 MB di testo.");
  if (interview.spec.tagsMode !== "import") throw new Error("Importa prima i tag usati dagli allarmi. Senza segnali e condizioni reali puoi solo scegliere di completare gli allarmi dopo.");
  return parseAlarmCatalog(source.replace(/^\uFEFF/, ""), interview.spec.tags);
}
export function csvRows(source: string): string[][] {
  const first = source.split(/\r?\n/)[0], delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [], row: string[] = []; let field = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') { if (quoted && source[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (char === delimiter || char === "\n" || char === "\r")) {
      row.push(field); field = "";
      if (char !== delimiter) { if (row.some(cell => cell.trim())) rows.push(row.splice(0)); else row.length = 0; if (char === "\r" && source[i + 1] === "\n") i++; }
    } else field += char;
  }
  if (quoted) throw new Error("CSV non valido: una cella tra virgolette non è chiusa.");
  row.push(field); if (row.some(cell => cell.trim())) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}
