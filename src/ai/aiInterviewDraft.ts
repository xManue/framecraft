import { interviewSteps, newAiInterview, type AiInterview } from "./aiInterview";
import { delegationQuestions } from "./aiDelegation";
import { guidedPageKinds } from "../core/guidedProject";
import { guidedCommandEvents, guidedCommandPermissions } from "../core/guidedCommands";
import { panelRequirementGroups } from "../core/panelRequirements";
import { panelHeaderFields } from "../core/panelHeader";
import { parseAlarmCatalog } from "../core/hmiAlarms";

export interface AiInterviewDraft { version: 1; savedAt: number; interview: AiInterview }
export interface AiInterviewDraftSnapshot { revision: string; source: string | null }
export const aiInterviewDraftLimit = 8 * 1024 * 1024;
type Rule = (value: unknown) => boolean;
const text = (max = 8000): Rule => value => typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const one = (values: readonly unknown[]): Rule => value => values.includes(value);
const bool: Rule = value => typeof value === "boolean";
const list = (rule: Rule, max: number): Rule => value => Array.isArray(value) && value.length <= max && value.every(rule);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const shape = (fields: Record<string, Rule>, optional: string[] = []): Rule => value => object(value) && Object.keys(value).every(key => Object.hasOwn(fields, key)) && Object.entries(fields).every(([key, rule]) => value[key] === undefined && optional.includes(key) || rule(value[key]));
const dictionary = (keys: readonly string[], rule: Rule): Rule => value => object(value) && Object.entries(value).every(([key, item]) => keys.includes(key) && rule(item));
const tag = shape({ name: text(200), dataType: text(200), access: one(["read", "write", "read-write"]), address: text(), description: text(), table: text(), connection: text(), cycle: text(), detected: bool, usages: list(shape({ file: text(), line: value => Number.isSafeInteger(value) && Number(value) > 0, access: one(["read", "write", "read-write"]) }), 20000) }, ["table", "connection", "cycle", "detected", "usages"]);
const command = shape({ event: one(guidedCommandEvents), value: text(512), permission: one(guidedCommandPermissions.map(item => item.id)), reviewed: bool });
const page = shape({ id: value => typeof value === "string" && /^page-\d{1,2}$/.test(value), title: text(), section: one(["main", "settings", "alarms", "statistics", "manuals", "diagnostic", "formats"]), kind: one(guidedPageKinds.map(item => item.id)), imageNeed: one(["required", "optional", "none"]), image: text(2048), imageDeferred: bool, items: list(shape({ label: text(), tag: text(200), xTag: text(200), command }, ["xTag", "command"]), 200), itemsDeferred: bool }, ["image"]);
const requirements = shape({ version: one([1]), enabled: dictionary(panelRequirementGroups.filter(group => group.optional).map(group => group.id), one(["yes", "no", "later"])), answers: value => object(value) && Object.entries(value).every(([key, answer]) => {
  const question = panelRequirementGroups.flatMap(group => group.questions.map(question => ({ ...question, key: `${group.id}.${question.id}` }))).find(question => question.key === key);
  return !!question && text(1500)(answer) && (!question.options || answer === "later" || question.options.some(option => option[0] === answer));
}), startPageId: text(100) });
const header = shape({ version: one([1]), tags: dictionary(panelHeaderFields.map(field => field.id), text(200)), speedUnit: text(24), speedMin: text(100), speedMax: text(100) }, ["speedUnit", "speedMin", "speedMax"]);
const interviewShape = shape({ machineName: text(), layout: one(["desktop", "desktop-mobile"]), step: text(100), delegated: list(text(200), 1000), followups: list(shape({ question: text(), answer: text(), skipped: bool }, ["skipped"]), 100), spec: shape({ version: one([1]), purpose: text(), pages: list(page, 28), tagsMode: one(["import", "later", "none"]), tags: list(tag, 5000), tagsFile: text(), alarmsMode: one(["import", "later"]), alarms: object, alarmsFile: text(), protocol: one(["later", "mqtt", "opcua", "simulation"]), language: one(["it", "en"]), users: one(["everyone", "roles-later", "later"]), requirements, header }, ["tagsFile", "alarms", "alarmsFile", "requirements", "header"]) }, ["delegated"]);

function safeInterview(value: unknown): AiInterview {
  if (!interviewShape(value)) throw new Error("La bozza del questionario contiene campi non supportati. Nessuna risposta è stata caricata o eliminata.");
  const interview = structuredClone(value) as AiInterview;
  if (new Set(interview.spec.pages.map(page => page.id)).size !== interview.spec.pages.length) throw new Error("La bozza contiene pagine duplicate. Nessuna risposta è stata caricata.");
  if (interview.spec.alarms) interview.spec.alarms = parseAlarmCatalog(interview.spec.alarms, interview.spec.tags);
  const keys = new Set(delegationQuestions(interview).map(question => question.key));
  interview.delegated = interview.delegated?.filter(key => keys.has(key));
  for (const page of interview.spec.pages) for (const item of page.items) if (item.command) item.command.reviewed = false;
  if (!interviewSteps(interview).some(step => step.id === interview.step)) interview.step = "machine";
  return interview;
}
export function parseAiInterviewDraft(source: string): AiInterviewDraft {
  if (new TextEncoder().encode(source).byteLength > aiInterviewDraftLimit) throw new Error("La bozza del questionario supera 8 MiB. La copia conservata non è stata modificata.");
  let record: unknown; try { record = JSON.parse(source); } catch { throw new Error("La bozza del questionario non è leggibile. Puoi riprovare oppure eliminarla e ricominciare; nessun progetto è stato modificato."); }
  if (!shape({ version: one([1]), savedAt: value => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 8.64e15, interview: object })(record)) throw new Error("La versione della bozza del questionario non è supportata. La copia conservata non è stata modificata.");
  const draft = record as AiInterviewDraft;
  return { version: 1, savedAt: draft.savedAt, interview: safeInterview(draft.interview) };
}
export function serializeAiInterviewDraft(interview: AiInterview): string {
  const source = JSON.stringify({ version: 1, savedAt: Date.now(), interview: safeInterview(interview) });
  if (new TextEncoder().encode(source).byteLength > aiInterviewDraftLimit) throw new Error("Questionario troppo grande per il recupero locale (massimo 8 MiB). Le risposte restano in questa sessione.");
  return source;
}
export function hasAiInterviewAnswers(interview: AiInterview): boolean {
  const comparable = (value: AiInterview) => JSON.stringify({ ...value, step: "machine", delegated: value.delegated ?? [] });
  return comparable(interview) !== comparable(newAiInterview());
}
