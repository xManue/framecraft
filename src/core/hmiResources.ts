import { defaultLanguage, languages as standardLanguages } from "./hmiStandard";

/** Catalogo delle liste risorse usate dal pannello. I nomi dei tipi seguono l'export Openness
 * WinCC Unified: in questo modo la conversione non deve reinterpretare un formato inventato. */
export const hmiResourceCatalogName = "framecraft.resources.json";

export type HmiResourceRangeType = "Decimal" | "Bool" | "BitNumber";
export type HmiResourceEntryType = "SingleValue" | "Range" | "From" | "To";
export type HmiBitSelection = "ExactMatch" | "LeastSignificantBit";

export interface HmiResourceEntryBase {
  id: string;
  type: HmiResourceEntryType;
  fromValue?: number;
  toValue?: number;
  default?: boolean;
}

export interface HmiTextResourceEntry extends HmiResourceEntryBase {
  texts: Record<string, string>;
}

export interface HmiGraphicResourceEntry extends HmiResourceEntryBase {
  graphic: string;
}

export interface HmiTextResourceList {
  name: string;
  rangeType: HmiResourceRangeType;
  entries: HmiTextResourceEntry[];
}

export interface HmiGraphicResourceList {
  name: string;
  rangeType: HmiResourceRangeType;
  entries: HmiGraphicResourceEntry[];
}

/** Testo di un oggetto che non dipende da un tag, ma cambia con la lingua Runtime. */
export interface HmiMultilingualText {
  key: string;
  texts: Record<string, string>;
}

export interface HmiResourceCatalog {
  version: 1;
  defaultLanguage: string;
  activeLanguage: string;
  languages: string[];
  bitSelection: HmiBitSelection;
  multilingualTexts: HmiMultilingualText[];
  textLists: HmiTextResourceList[];
  graphicLists: HmiGraphicResourceList[];
}

export type ResolvedHmiResource =
  | { kind: "text"; value: string; language: string; fallback: boolean; entryId: string }
  | { kind: "graphic"; value: string; entryId: string };

export function emptyHmiResourceCatalog(): HmiResourceCatalog {
  return {
    version: 1,
    defaultLanguage,
    activeLanguage: defaultLanguage,
    languages: [...standardLanguages],
    bitSelection: "ExactMatch",
    multilingualTexts: [],
    textLists: [],
    graphicLists: [],
  };
}

const objectOf = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const finite = (value: unknown): number | undefined => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
};

const nonEmpty = (value: unknown): string => typeof value === "string" ? value.trim() : "";

function parseEntryBase(value: unknown, index: number): HmiResourceEntryBase {
  const entry = objectOf(value);
  if (!entry) throw new Error(`La voce ${index + 1} non e' un oggetto.`);
  const type = nonEmpty(entry.type) as HmiResourceEntryType;
  if (!["SingleValue", "Range", "From", "To"].includes(type)) throw new Error(`La voce ${index + 1} ha un tipo non valido.`);
  const id = nonEmpty(entry.id) || `entry-${index + 1}`;
  const fromValue = finite(entry.fromValue);
  const toValue = finite(entry.toValue);
  if ((type === "SingleValue" || type === "Range" || type === "From") && fromValue === undefined) {
    throw new Error(`La voce ${index + 1} richiede "fromValue".`);
  }
  if ((type === "Range" || type === "To") && toValue === undefined) throw new Error(`La voce ${index + 1} richiede "toValue".`);
  if (type === "Range" && fromValue! > toValue!) throw new Error(`La voce ${index + 1} ha un intervallo invertito.`);
  return {
    id,
    type,
    ...(fromValue === undefined ? {} : { fromValue }),
    ...(toValue === undefined ? {} : { toValue }),
    ...(entry.default === true ? { default: true } : {}),
  };
}

function parseListBase(value: unknown, index: number) {
  const list = objectOf(value);
  if (!list) throw new Error(`La lista ${index + 1} non e' un oggetto.`);
  const name = nonEmpty(list.name);
  if (!name) throw new Error(`La lista ${index + 1} non ha un nome.`);
  const rangeType = nonEmpty(list.rangeType) as HmiResourceRangeType;
  if (!["Decimal", "Bool", "BitNumber"].includes(rangeType)) throw new Error(`La lista "${name}" ha un tipo di intervallo non valido.`);
  if (!Array.isArray(list.entries)) throw new Error(`La lista "${name}" non contiene un array di voci.`);
  return { raw: list, name, rangeType, entries: list.entries };
}

function uniqueNames(textLists: HmiTextResourceList[], graphicLists: HmiGraphicResourceList[]) {
  const seen = new Set<string>();
  for (const list of [...textLists, ...graphicLists]) {
    const key = list.name.toLocaleLowerCase();
    if (seen.has(key)) throw new Error(`Esiste piu' di una lista risorse chiamata "${list.name}".`);
    seen.add(key);
    if (list.entries.filter((entry) => entry.default).length > 1) throw new Error(`La lista "${list.name}" ha piu' di una voce predefinita.`);
    const ids = new Set<string>();
    for (const entry of list.entries) {
      if (ids.has(entry.id)) throw new Error(`La lista "${list.name}" usa due volte l'id "${entry.id}".`);
      ids.add(entry.id);
    }
  }
}

/** Legge il file senza accettare configurazioni ambigue: se una lista e' spezzata, l'editor lo
 * segnala invece di scegliere silenziosamente una voce diversa da WinCC. */
export function parseHmiResourceCatalog(source: string | unknown): HmiResourceCatalog {
  const raw = typeof source === "string" ? JSON.parse(source) as unknown : source;
  const root = objectOf(raw);
  if (!root) throw new Error("Il catalogo risorse non e' un oggetto JSON.");
  const configuredLanguages = Array.isArray(root.languages) ? root.languages.map(nonEmpty).filter(Boolean) : [];
  const languageSet = [...new Set(configuredLanguages)];
  const configuredDefault = nonEmpty(root.defaultLanguage) || languageSet[0] || defaultLanguage;
  if (!languageSet.includes(configuredDefault)) languageSet.unshift(configuredDefault);
  const activeLanguage = nonEmpty(root.activeLanguage) || configuredDefault;
  if (!languageSet.includes(activeLanguage)) languageSet.push(activeLanguage);
  const bitSelection = root.bitSelection === "LeastSignificantBit" ? "LeastSignificantBit" : "ExactMatch";
  const multilingualTexts = (Array.isArray(root.multilingualTexts) ? root.multilingualTexts : []).map((value, index): HmiMultilingualText => {
    const item = objectOf(value);
    if (!item) throw new Error(`Il testo multilingua ${index + 1} non e' un oggetto.`);
    const key = nonEmpty(item.key);
    if (!key) throw new Error(`Il testo multilingua ${index + 1} non ha una chiave.`);
    const texts = objectOf(item.texts);
    return { key, texts: Object.fromEntries(Object.entries(texts ?? {}).filter((pair): pair is [string, string] => typeof pair[1] === "string")) };
  });
  const textKeys = new Set<string>();
  for (const item of multilingualTexts) {
    const normalizedKey = item.key.toLocaleLowerCase();
    if (textKeys.has(normalizedKey)) throw new Error(`Esiste piu' di un testo multilingua con chiave "${item.key}".`);
    textKeys.add(normalizedKey);
  }
  const textLists = (Array.isArray(root.textLists) ? root.textLists : []).map((value, index): HmiTextResourceList => {
    const list = parseListBase(value, index);
    return {
      name: list.name,
      rangeType: list.rangeType,
      entries: list.entries.map((entryValue, entryIndex) => {
        const entry = objectOf(entryValue);
        const base = parseEntryBase(entryValue, entryIndex);
        const texts = objectOf(entry?.texts);
        return { ...base, texts: Object.fromEntries(Object.entries(texts ?? {}).filter((pair): pair is [string, string] => typeof pair[1] === "string")) };
      }),
    };
  });
  const graphicLists = (Array.isArray(root.graphicLists) ? root.graphicLists : []).map((value, index): HmiGraphicResourceList => {
    const list = parseListBase(value, index);
    return {
      name: list.name,
      rangeType: list.rangeType,
      entries: list.entries.map((entryValue, entryIndex) => {
        const entry = objectOf(entryValue);
        const base = parseEntryBase(entryValue, entryIndex);
        return { ...base, graphic: nonEmpty(entry?.graphic) };
      }),
    };
  });
  uniqueNames(textLists, graphicLists);
  return {
    version: 1,
    defaultLanguage: configuredDefault,
    activeLanguage,
    languages: languageSet.length ? languageSet : [...standardLanguages],
    bitSelection,
    multilingualTexts,
    textLists,
    graphicLists,
  };
}

export function serializeHmiResourceCatalog(catalog: HmiResourceCatalog): string {
  return `${JSON.stringify(parseHmiResourceCatalog(catalog), null, 2)}\n`;
}

function numericValue(value: string): number | undefined {
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized === "true" || normalized === "on" || normalized === "yes") return 1;
  if (normalized === "false" || normalized === "off" || normalized === "no") return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function valueForRangeType(value: number, rangeType: HmiResourceRangeType, bitSelection: HmiBitSelection): number | undefined {
  if (rangeType !== "BitNumber") return value;
  if (!Number.isSafeInteger(value) || value <= 0) return undefined;
  if (bitSelection === "ExactMatch") {
    const bit = Math.log2(value);
    return Number.isInteger(bit) ? bit : undefined;
  }
  let bit = 0;
  let current = value;
  while (current % 2 === 0) { current /= 2; bit += 1; }
  return bit;
}

function matches(entry: HmiResourceEntryBase, value: number): boolean {
  if (entry.type === "SingleValue") return value === entry.fromValue;
  if (entry.type === "Range") return value >= entry.fromValue! && value <= entry.toValue!;
  if (entry.type === "From") return value >= entry.fromValue!;
  return value <= entry.toValue!;
}

function selectedEntry<T extends HmiResourceEntryBase>(entries: readonly T[], value: number): T | undefined {
  return entries.find((entry) => matches(entry, value)) ?? entries.find((entry) => entry.default);
}

/** Risolve testo o grafica usando il valore del tag. Il fallback linguistico e' esplicito nel
 * risultato, cosi' l'editor puo' avvertire quando una traduzione manca. */
export function resolveHmiResource(catalog: HmiResourceCatalog, name: string, rawValue: string, language = catalog.activeLanguage):
  ResolvedHmiResource | { reason: string } {
  const textList = catalog.textLists.find((list) => list.name === name);
  const graphicList = catalog.graphicLists.find((list) => list.name === name);
  const list = textList ?? graphicList;
  if (!list) return { reason: `La lista risorse "${name}" non esiste nel catalogo.` };
  const numeric = numericValue(rawValue);
  if (numeric === undefined) return { reason: `Il valore "${rawValue}" non e' numerico o booleano.` };
  const selected = valueForRangeType(numeric, list.rangeType, catalog.bitSelection);
  if (selected === undefined) return { reason: `Il valore ${rawValue} non seleziona un bit valido per la lista "${name}".` };
  if (textList) {
    const textEntry = selectedEntry(textList.entries, selected);
    if (!textEntry) return { reason: `Nessuna voce della lista "${name}" copre ${rawValue} e non c'e' una voce predefinita.` };
    const exact = textEntry.texts[language];
    if (exact !== undefined && exact !== "") return { kind: "text", value: exact, language, fallback: false, entryId: textEntry.id };
    const fallbackLanguage = textEntry.texts[catalog.defaultLanguage] ? catalog.defaultLanguage
      : catalog.languages.find((code) => Boolean(textEntry.texts[code]));
    if (!fallbackLanguage) return { reason: `La voce "${textEntry.id}" della lista "${name}" non contiene testi.` };
    return { kind: "text", value: textEntry.texts[fallbackLanguage], language: fallbackLanguage, fallback: true, entryId: textEntry.id };
  }
  const graphicEntry = selectedEntry(graphicList!.entries, selected);
  if (!graphicEntry) return { reason: `Nessuna voce della lista "${name}" copre ${rawValue} e non c'e' una voce predefinita.` };
  return graphicEntry.graphic ? { kind: "graphic", value: graphicEntry.graphic, entryId: graphicEntry.id }
    : { reason: `La voce "${graphicEntry.id}" della lista "${name}" non contiene una grafica.` };
}

export function hmiResourceListNames(catalog: HmiResourceCatalog): string[] {
  return [...catalog.textLists.map((list) => list.name), ...catalog.graphicLists.map((list) => list.name)].sort((a, b) => a.localeCompare(b));
}

/** Risolve un testo statico nella lingua Runtime con la stessa politica di fallback delle liste. */
export function resolveHmiText(catalog: HmiResourceCatalog, key: string, language = catalog.activeLanguage):
  { value: string; language: string; fallback: boolean } | { reason: string } {
  const item = catalog.multilingualTexts.find((candidate) => candidate.key === key);
  if (!item) return { reason: `Il testo multilingua "${key}" non esiste nel catalogo.` };
  const exact = item.texts[language];
  if (exact !== undefined && exact !== "") return { value: exact, language, fallback: false };
  const fallbackLanguage = item.texts[catalog.defaultLanguage] ? catalog.defaultLanguage
    : catalog.languages.find((code) => Boolean(item.texts[code]));
  return fallbackLanguage
    ? { value: item.texts[fallbackLanguage], language: fallbackLanguage, fallback: true }
    : { reason: `Il testo multilingua "${key}" non contiene valori.` };
}

/** Dizionario pronto da inviare al Runtime dell'anteprima. Le chiavi senza alcun testo restano
 * assenti: il ponte ripristina il testo scritto nel JSX invece di mostrare una stringa inventata. */
export function hmiTextDictionary(catalog: HmiResourceCatalog, language = catalog.activeLanguage): Record<string, string> {
  return Object.fromEntries(catalog.multilingualTexts.flatMap((item) => {
    const resolved = resolveHmiText(catalog, item.key, language);
    return "reason" in resolved ? [] : [[item.key, resolved.value]];
  }));
}
