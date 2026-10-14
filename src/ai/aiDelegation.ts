import type { AiInterview } from "./aiInterview";
import { guidedPageKinds, guidedItemLimit, type GuidedPage } from "../core/guidedProject";
import { standardProjectSectionChoices } from "../core/standardProject";
import { panelRequirementGroups, requirementGroupEnabled, requirementQuestionActive } from "../core/panelRequirements";

export interface AiDecision { key: string; value: string }
export interface DelegatedQuestion { key: string; label: string; type: "text" | "choice" | "pages" | "labels" | "pending"; options?: string[] }
const protectedGroups = ["connections", "operations", "recipes", "users"];
const protectedQuestions = ["device.mobileUse", "navigation.pageRules", "alarms.ack", "reports.documents", "delivery.network", "delivery.offline"];
const pageKey = (page: GuidedPage, field: string) => `page.${page.id}.${field}`;
export function delegationQuestions(interview: AiInterview): DelegatedQuestion[] {
  const questions: DelegatedQuestion[] = [
    { key: "machineName", label: "Nome della macchina o linea", type: "text" },
    { key: "purpose", label: "Scopo del pannello", type: "text" },
    { key: "layout", label: "Desktop o desktop e mobile", type: "choice", options: ["desktop", "desktop-mobile"] },
    { key: "pages", label: "Numero e piano delle pagine", type: "pages" },
    { key: "tags", label: "Lista tag PLC", type: "pending" },
    { key: "alarms", label: "Catalogo e condizioni allarmi", type: "pending" },
    { key: "protocol", label: "Protocollo della macchina", type: "pending" },
    { key: "language", label: "Lingua principale", type: "choice", options: ["it", "en"] },
    { key: "users", label: "Utenti e autorizzazioni", type: "pending" },
  ];
  for (const page of interview.spec.pages) {
    const kind = guidedPageKinds.find(kind => kind.id === page.kind)!;
    const name = interview.delegated?.includes(pageKey(page, "title")) ? page.id : page.title || page.id;
    questions.push(
      { key: pageKey(page, "title"), label: `Nome pagina ${page.id}`, type: "text" },
      { key: pageKey(page, "kind"), label: `Funzione pagina ${page.id}`, type: "choice", options: page.items.length && !interview.delegated?.includes(pageKey(page, "items")) ? [page.kind] : guidedPageKinds.map(kind => kind.id) },
      { key: pageKey(page, "section"), label: `Categoria pagina ${page.id}`, type: "choice", options: standardProjectSectionChoices.map(section => section.id) },
      { key: pageKey(page, "image"), label: `Immagine: ${name}`, type: kind?.image ? "choice" : "pending", options: ["required", "optional", "none"] },
      { key: pageKey(page, "items"), label: `Elementi: ${name}`, type: kind?.items ? "labels" : "pending" },
    );
  }
  if (interview.spec.requirements) {
    questions.push({ key: "startPageId", label: "Pagina iniziale", type: "choice", options: ["", ...new Set([...interview.spec.pages.map(page => page.id), ...(interview.delegated?.includes("pages") ? Array.from({ length: 28 }, (_, index) => `page-${index + 1}`) : [])])] });
    for (const group of panelRequirementGroups) {
      if (group.optional) questions.push({ key: `feature.${group.id}`, label: group.label, type: "choice", options: interview.spec.pages.some(page => group.pageKinds?.includes(page.kind)) ? ["yes"] : ["yes", "no"] });
      for (const question of group.questions) {
        const key = `${group.id}.${question.id}`;
        questions.push({ key: `req.${key}`, label: question.label, type: question.local || protectedGroups.includes(group.id) || protectedQuestions.includes(key) ? "pending" : "choice", options: question.options?.map(option => option[0]) });
      }
    }
  }
  return questions;
}
export function delegatedQuestions(interview: AiInterview) {
  const requested = new Set(interview.delegated ?? []);
  return delegationQuestions(interview).filter(question => {
    if (!requested.has(question.key)) return false;
    if (!question.key.startsWith("req.")) return true;
    const [, groupId, questionId] = question.key.split("."), group = panelRequirementGroups.find(group => group.id === groupId)!;
    return requirementGroupEnabled(group, interview.spec.requirements!, interview.spec.pages.map(page => page.kind)) && requirementQuestionActive(group, group.questions.find(question => question.id === questionId)!, interview.spec.requirements!);
  });
}
export function toggleInterviewDelegation(interview: AiInterview, key: string): AiInterview {
  if (!delegationQuestions(interview).some(question => question.key === key)) throw new Error("Questa domanda non può essere delegata.");
  const delegated = new Set(interview.delegated ?? []);
  if (delegated.has(key)) delegated.delete(key); else delegated.add(key);
  return { ...interview, delegated: [...delegated] };
}
function plain(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error("L’AI ha proposto un testo non valido per una domanda delegata.");
  return value.trim();
}
function structure(index: number, title: string, kind: GuidedPage["kind"], section: GuidedPage["section"]): GuidedPage {
  return { id: `page-${index + 1}`, title, kind, section, imageNeed: guidedPageKinds.find(item => item.id === kind)?.image ? "required" : "none", imageDeferred: true, items: [], itemsDeferred: true };
}
export function resolveInterviewDelegation(interview: AiInterview, decisions?: readonly AiDecision[]): AiInterview {
  const questions = delegatedQuestions(interview), byKey = new Map(questions.map(question => [question.key, question]));
  const chosen = new Map<string, string>();
  for (const decision of decisions ?? []) {
    const question = byKey.get(decision.key);
    if (!question || question.type === "pending" || chosen.has(decision.key)) throw new Error("L’AI ha risposto a una domanda non delegata o ha inventato dati macchina. Nessuna modifica applicata.");
    if (question.type === "choice" && !question.options?.includes(decision.value)) throw new Error(`Scelta AI non valida: ${question.label}.`);
    chosen.set(decision.key, decision.value);
  }
  if (decisions !== undefined) for (const question of questions) if (question.type !== "pending" && !chosen.has(question.key)) throw new Error(`Manca la scelta dell’AI: ${question.label}. Prepara di nuovo la proposta.`);
  const result: AiInterview = { ...interview, delegated: [], followups: interview.followups.map(item => ({ ...item })), spec: { ...interview.spec, pages: interview.spec.pages.map(page => ({ ...page, items: page.items.map(item => ({ ...item })) })), requirements: interview.spec.requirements ? { ...interview.spec.requirements, answers: { ...interview.spec.requirements.answers }, enabled: { ...interview.spec.requirements.enabled } } : undefined } };
  const spec = result.spec;
  if (byKey.has("pages")) {
    if (chosen.has("pages")) {
      let plan: unknown; try { plan = JSON.parse(chosen.get("pages")!); } catch { throw new Error("Il piano pagine dell’AI non è leggibile."); }
      if (!Array.isArray(plan) || plan.length < Math.max(1, spec.pages.length) || plan.length > 28) throw new Error("Il piano AI deve conservare le tue pagine e rispettare il limite di 28.");
      const usedIds = new Set(spec.pages.map(page => page.id));
      spec.pages = plan.map((raw, index) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(key => !["title", "kind", "section"].includes(key)) || !guidedPageKinds.some(kind => kind.id === raw.kind) || !standardProjectSectionChoices.some(section => section.id === raw.section)) throw new Error("Il piano AI contiene una pagina non supportata.");
        const previous = spec.pages[index], title = plain(raw.title, 80);
        if (previous) {
          for (const field of ["title", "kind", "section"] as const) if (!byKey.has(pageKey(previous, field)) && (field !== "title" || previous.title.trim()) && raw[field] !== previous[field]) throw new Error("L’AI ha cambiato una pagina già scelta. Nessun progetto creato.");
          return { ...previous, title: previous.title.trim() ? previous.title : title };
        }
        const available = Array.from({ length: 28 }, (_, index) => index).find(index => !usedIds.has(`page-${index + 1}`))!;
        usedIds.add(`page-${available + 1}`); return structure(available, title, raw.kind, raw.section);
      });
    } else if (!spec.pages.length) spec.pages = [structure(0, "Pagina da scegliere", "overview", "main")];
    else spec.pages = spec.pages.map(page => ({ ...page, title: page.title.trim() || "Pagina da scegliere" }));
  }
  for (const question of questions) {
    const value = chosen.get(question.key);
    if (question.key === "machineName") result.machineName = value === undefined ? "Bozza HMI" : plain(value, 80);
    else if (question.key === "purpose") spec.purpose = value === undefined ? "Pannello da definire" : plain(value, 500);
    else if (question.key === "layout") result.layout = value as AiInterview["layout"] ?? "desktop-mobile";
    else if (question.key === "language") spec.language = value as typeof spec.language ?? "it";
    else if (question.key === "protocol") spec.protocol = "later";
    else if (question.key === "users") {
      spec.users = "later";
      spec.pages = spec.pages.map(page => ({ ...page, items: page.items.map(item => item.command && !item.command.permission ? { label: item.label, tag: "" } : item) }));
    }
    else if (question.key === "tags" && !spec.tags.length) { spec.tagsMode = "later"; spec.tagsFile = undefined; }
    else if (question.key === "alarms" && !spec.alarms) { spec.alarmsMode = "later"; spec.alarmsFile = undefined; }
    else if (question.key === "startPageId" && spec.requirements) spec.requirements.startPageId = value ?? "";
    else if (question.key.startsWith("feature.") && spec.requirements) spec.requirements.enabled[question.key.slice(8)] = value as "yes" | "no" ?? "later";
    else if (question.key.startsWith("req.") && spec.requirements) spec.requirements.answers[question.key.slice(4)] = value ?? "later";
    else if (question.key.startsWith("page.")) {
      const [, id, field] = question.key.split("."), page = spec.pages.find(page => page.id === id)!;
      if (field === "title") page.title = value === undefined ? "Pagina da scegliere" : plain(value, 80);
      else if (field === "kind" && value) {
        const previous = guidedPageKinds.find(kind => kind.id === page.kind)!;
        page.kind = value as GuidedPage["kind"]; const kind = guidedPageKinds.find(kind => kind.id === page.kind)!;
        if (!kind.image) page.imageNeed = "none";
        else if (!previous.image) { page.imageNeed = "required"; page.imageDeferred = true; }
        if (!previous.items && kind.items && !page.items.length) page.itemsDeferred = true;
      }
      else if (field === "section" && value) page.section = value as GuidedPage["section"];
      else if (field === "image") {
        if (value && value !== "none" && !guidedPageKinds.find(kind => kind.id === page.kind)?.image) throw new Error("La funzione pagina proposta non prevede un’immagine. Correggi la proposta.");
        page.imageNeed = value as GuidedPage["imageNeed"] ?? page.imageNeed; if (!page.image) page.imageDeferred = true;
      }
      else if (field === "items") {
        let labels: unknown = []; if (value !== undefined) try { labels = JSON.parse(value); } catch { throw new Error("L’elenco degli elementi proposti non è leggibile."); }
        if (!Array.isArray(labels) || labels.length > guidedItemLimit(page.kind)) throw new Error("Troppi elementi nella scelta AI.");
        if (labels.length && !guidedPageKinds.find(kind => kind.id === page.kind)?.items) throw new Error("La funzione pagina proposta non prevede questi elementi. Correggi la proposta.");
        page.items = labels.map(label => ({ label: plain(label, 80), tag: "" })); page.itemsDeferred = true;
      }
    }
  }
  return result;
}
export function delegationContext(interview: AiInterview) {
  return delegatedQuestions(interview).map(question => ({ ...question, ...(question.type === "pages" ? { format: 'JSON di [{"title":"...","kind":"overview","section":"main"}]; conserva le righe già scelte e aggiungi soltanto quelle necessarie, massimo 28 totali', kinds: guidedPageKinds.map(kind => kind.id), categories: standardProjectSectionChoices.map(section => section.id) } : {}), ...(question.type === "labels" ? { format: "Array JSON di sole etichette di bozza, senza numeri motore, tag o azioni inventati" } : {}) }));
}
