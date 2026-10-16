import { emptyHmiResourceCatalog, parseHmiResourceCatalog, resolveHmiText, type HmiResourceCatalog } from "./hmiResources";
import type { GuidedPage, GuidedPageKind, GuidedProjectSpec } from "./guidedProject";

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, required: string[], optional: string[] = []) => required.every(key => key in value) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const text = (value: unknown, max = 200) => typeof value === "string" && !!value.trim() && value.length <= max && !/[\u0000-\u001f]/.test(value);
function invalid(reason: string): never { throw new Error(`Catalogo testi: ${reason}. Importa un framecraft.resources.json valido; nessuna traduzione o chiave è stata inventata.`); }
export function parseGuidedResources(source: unknown): HmiResourceCatalog {
  let raw = source;
  if (typeof raw === "string") {
    if (new TextEncoder().encode(raw).byteLength > 2_000_000) invalid("massimo 2 MB");
    try { raw = JSON.parse(raw.replace(/^\uFEFF/, "")); } catch { invalid("JSON non leggibile"); }
  }
  if (!record(raw) || !keys(raw, ["version", "defaultLanguage", "activeLanguage", "languages", "bitSelection", "multilingualTexts", "textLists", "graphicLists"]) || raw.version !== 1 || !Array.isArray(raw.languages) || !raw.languages.length || raw.languages.length > 32 || !raw.languages.every(language => text(language, 80)) || !raw.languages.includes(raw.defaultLanguage) || !raw.languages.includes(raw.activeLanguage) || !["ExactMatch", "LeastSignificantBit"].includes(String(raw.bitSelection))) invalid("lingue, versione o struttura non valide");
  try { if (Intl.getCanonicalLocales(raw.languages as string[]).length !== raw.languages.length) invalid("lingue duplicate"); } catch { invalid("usa codici lingua BCP 47 validi e non duplicati (es. it-IT, en-US)"); }
  const languages = raw.languages;
  const translations = (value: unknown) => record(value) && Object.entries(value).every(([language, content]) => languages.includes(language) && typeof content === "string" && content.length <= 8000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(content));
  if (!Array.isArray(raw.multilingualTexts) || raw.multilingualTexts.length > 5000 || raw.multilingualTexts.some(item => !record(item) || !keys(item, ["key", "texts"]) || !text(item.key) || !translations(item.texts))) invalid("testi multilingua non validi (massimo 5000)");
  let entries = 0;
  for (const type of ["textLists", "graphicLists"] as const) {
    const lists = raw[type]; if (!Array.isArray(lists) || lists.length > 200) invalid("massimo 200 liste per tipo");
    for (const list of lists) {
      if (!record(list) || !keys(list, ["name", "rangeType", "entries"]) || !text(list.name) || !["Decimal", "Bool", "BitNumber"].includes(String(list.rangeType)) || !Array.isArray(list.entries)) invalid("lista risorse non valida");
      entries += list.entries.length; if (entries > 20000) invalid("massimo 20000 voci nelle liste");
      for (const entry of list.entries) {
        const valueKey = type === "textLists" ? "texts" : "graphic";
        if (!record(entry) || !keys(entry, ["id", "type", valueKey], ["fromValue", "toValue", "default"]) || !text(entry.id) || !["SingleValue", "Range", "From", "To"].includes(String(entry.type)) || ["fromValue", "toValue"].some(key => entry[key] !== undefined && (typeof entry[key] !== "number" || !Number.isFinite(entry[key]))) || entry.default !== undefined && typeof entry.default !== "boolean" || (type === "textLists" ? !translations(entry.texts) : typeof entry.graphic !== "string" || entry.graphic.length > 2048 || /[\u0000-\u001f]/.test(entry.graphic))) invalid("voce risorsa non valida");
      }
    }
  }
  try { return parseHmiResourceCatalog(raw); } catch (error) { invalid(error instanceof Error ? error.message : String(error)); }
}
export function guidedResourceCatalog(spec?: Pick<GuidedProjectSpec, "resources" | "language">): HmiResourceCatalog {
  const catalog = spec?.resources === undefined ? emptyHmiResourceCatalog() : parseGuidedResources(spec.resources);
  if (!spec) return catalog;
  const preferred = spec.language === "en" ? "en-US" : "it-IT";
  const activeLanguage = catalog.languages.includes(preferred) ? preferred : catalog.languages.find(code => code.split("-")[0].toLowerCase() === spec.language) ?? preferred;
  return { ...catalog, activeLanguage, languages: catalog.languages.includes(activeLanguage) ? [...catalog.languages] : [...catalog.languages, activeLanguage] };
}
export const guidedStaticTextItems = (kind: GuidedPageKind) => ["overview", "synoptic", "values", "commands"].includes(kind);
export function guidedTextChoices(source: string, catalog?: HmiResourceCatalog) {
  return catalog?.multilingualTexts.filter(item => Object.values(item.texts).some(text => text === source)) ?? [];
}
export function guidedTextIssue(key: unknown, source: string, catalog?: HmiResourceCatalog) {
  if (key === undefined || key === "") return;
  if (!text(key) || typeof key !== "string") return "Scegli una chiave testo valida dal catalogo importato.";
  const matches = catalog?.multilingualTexts.filter(item => item.key === key) ?? [];
  if (matches.length !== 1) return "La chiave non esiste una sola volta nel catalogo importato. Rivedi il testo, senza sostituzioni automatiche.";
  if (!Object.values(matches[0].texts).includes(source)) return "Il testo originale non corrisponde alla chiave scelta. Rivedi il collegamento o lascia il testo originale.";
}
export function guidedPageTextIssues(page: Pick<GuidedPage, "title" | "titleTextKey" | "kind" | "items">, catalog?: HmiResourceCatalog) {
  const title = guidedTextIssue(page.titleTextKey, page.title, catalog), issues = title ? [`Titolo: ${title}`] : [];
  for (const item of page.items) if (item.textKey !== undefined && item.textKey !== "") {
    const issue = guidedStaticTextItems(page.kind) ? guidedTextIssue(item.textKey, item.label, catalog) : "Questa base collega il dizionario al titolo, non ai nomi delle curve o ai messaggi Runtime.";
    if (issue) issues.push(`${item.label}: ${issue}`);
  }
  return issues;
}
export function guidedTextRows(spec: GuidedProjectSpec) {
  const catalog = guidedResourceCatalog(spec);
  return spec.pages.flatMap(page => [{ pageId: page.id, label: "Titolo", source: page.title, key: page.titleTextKey }, ...(guidedStaticTextItems(page.kind) ? page.items.map(item => ({ pageId: page.id, label: item.label, source: item.label, key: item.textKey })) : [])]).map(row => {
    const issue = guidedTextIssue(row.key, row.source, spec.resources), resolved = row.key && !issue ? resolveHmiText(catalog, row.key) : undefined;
    return { ...row, issue, value: resolved && "value" in resolved ? resolved.value : row.source, language: resolved && "language" in resolved ? resolved.language : undefined, fallback: resolved && "fallback" in resolved ? resolved.fallback : false };
  });
}
