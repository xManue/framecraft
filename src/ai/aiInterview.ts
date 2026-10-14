import { guidedPageKinds, guidedProjectIssues, guidedProjectPending, type GuidedPage, type GuidedProjectSpec } from "../core/guidedProject";
import { parsePlcCatalog, isPlcVariableName } from "../core/plcVariables";
import { parseAlarmCatalog } from "../core/hmiAlarms";
import { plcVariablesFromSheet } from "../core/tagImport";
import type { StandardProjectConfig } from "../core/standardProject";
import { newPanelRequirements, panelRequirementGroups, panelRequirementsContext, requirementGroupEnabled } from "../core/panelRequirements";
import { guidedTemplateBehavior, inheritedTemplateAnswers } from "../core/templateBehavior";

export interface AiInterview { machineName: string; layout: StandardProjectConfig["layout"]; spec: GuidedProjectSpec; step: string; followups: { question: string; answer: string }[] }
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
  const { spec } = interview;
  if (step === "machine") return [...(!interview.machineName.trim() || interview.machineName.length > 80 ? ["Inserisci il nome della macchina (massimo 80 caratteri)."] : []), ...(!spec.purpose.trim() ? ["Indica che cosa deve gestire il pannello."] : [])];
  if (step === "pages") return [...(!spec.pages.length ? ["Scegli quante pagine vuoi creare."] : []), ...spec.pages.filter(page => !page.title.trim()).map((_, index) => `Dai un nome alla pagina ${index + 1}.`), ...([...new Set(spec.pages.map(page => page.section))].some(section => spec.pages.filter(page => page.section === section).length > 14) ? ["Distribuisci le pagine: massimo 14 per categoria."] : [])];
  const issues = guidedProjectIssues(spec);
  if (step === "review") return [...interviewStepIssues(interview, "machine"), ...issues, ...interview.followups.filter(item => !item.answer.trim()).map(item => `Rispondi a: ${item.question}`)];
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
  const issues = interviewStepIssues(interview, "review"); if (issues.length) throw new Error(issues[0]);
  const spec = interview.spec;
  return { machineName: interview.machineName.trim(), layout: interview.layout, sections: [...new Set(spec.pages.map(page => page.section))], settingsProgram: "robot", guided: spec.requirements ? { ...spec, requirements: { ...spec.requirements, answers: { ...inheritedTemplateAnswers(spec.pages.map(page => page.kind)), ...spec.requirements.answers } } } : spec };
}
export function interviewContext(interview: AiInterview) {
  interviewConfig(interview);
  return { machineName: interview.machineName.trim(), layout: interview.layout, purpose: interview.spec.purpose,
    templates: [...new Set(interview.spec.pages.map(page => page.kind))].map(kind => guidedTemplateBehavior(kind)!),
    pages: interview.spec.pages.map(page => ({ id: page.id, title: page.title, kind: page.kind, template: { id: `guided:${page.kind}`, version: 1 }, category: page.section, image: { need: page.imageNeed, available: !!page.image, deferred: page.imageDeferred }, elements: page.items.map(item => ({ label: item.label, tagLinked: !!item.tag, ...(page.kind === "commands" ? { command: item.command ? { configured: item.command.reviewed, event: item.command.event, permissionRequired: !!item.command.permission } : { configured: false } } : {}) })), itemsDeferred: page.itemsDeferred })),
    data: { tags: interview.spec.tagsMode, tagCount: interview.spec.tags.length, alarms: interview.spec.alarmsMode, alarmCount: interview.spec.alarms?.alarms.length ?? 0 },
    use: { protocol: interview.spec.protocol, language: interview.spec.language, users: interview.spec.users },
    ...(interview.spec.requirements ? { requirements: panelRequirementsContext(interview.spec.requirements, interview.spec.pages.map(page => page.kind)) } : {}),
    pending: guidedProjectPending(interview.spec), followups: interview.followups,
  };
}
export function interviewPrompt(interview: AiInterview) {
  return JSON.stringify({ task: "create", approvedInterview: interviewContext(interview), exactProject: { ...interviewConfig(interview), guided: undefined },
    rules: "Usa ESATTAMENTE queste pagine, titoli, categorie e layout; non aggiungere intere sezioni o pagine dello standard. Ogni pagina include la scheda template: known e defaults descrivono il funzionamento già previsto. Non chiedere di rispiegarlo o confermarlo; chiedi solo input macchina indispensabili ancora mancanti. implementation e limits distinguono struttura e funzioni disponibili: non dichiarare operative le strutture. Le risposte dell’utente prevalgono sui defaults del template; non richiedere nuovamente dati già forniti. Non generare codice né inventare tag, allarmi, indirizzi, soglie, immagini o autorizzazioni. La pipeline locale userà gli ingressi reali scelti dall’utente. project deve coincidere con exactProject. Le parti esplicitamente rimandate sono avvisi, non domande bloccanti ripetute. Se serve un’informazione veramente indispensabile non raccolta, scrivi una domanda breve e mirata in questions: l’app presenterà un campo per ogni risposta. Spiega cosa sarà già costruito e cosa resta da collaudare, senza dichiarare funzioni non supportate. provenance ammette solo approved-request e framecraft-standard." });
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
