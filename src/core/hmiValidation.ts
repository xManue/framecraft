import { hmiDynamizationAttribute, parseHmiDynamizations } from "./hmiDynamizations";
import { hmiFlashingContrast, hmiFlashingProperties } from "./hmiFlashing";
import { inspectHmiExpression } from "./hmiExpression";
import { inspectHmiScript, inspectHmiScriptProgram } from "./hmiScript";
import { pageNumberAttribute } from "./hmiPages";
import { pageNumberParts } from "./hmiStandard";
import type { PlcVariableDefinition } from "./plcVariables";
import { hmiIndirectBindingIssue } from "./hmiTagBinding";
import type { HmiResourceCatalog } from "./hmiResources";
import { hmiEventsAttribute, parseHmiEvents } from "./hmiEvents";
import { hmiScriptCatalogIssues, hmiScriptFunctions, hmiScriptGlobalDefinition, hmiScriptVariables, type HmiScriptCatalog } from "./hmiScriptModules";
import { hmiFaceplateAttribute, hmiFaceplateBindingIssues, hmiFaceplateTypeIssues, parseHmiFaceplateBinding, type HmiFaceplateCatalog } from "./hmiFaceplates";
import { hmiTrendAttribute, hmiTrendIssues, parseHmiTrendConfig } from "./hmiTrend";
import { hmiDataLogCatalogIssues, type HmiDataLogCatalog } from "./hmiDataLogs";
import { hmiFunctionTrendAttribute, hmiFunctionTrendIssues, parseHmiFunctionTrendConfig } from "./hmiFunctionTrend";
import { alarmCatalogIssues } from "./hmiAlarms";

/** I quattro modi in cui un pannello si rompe senza dirlo, e che si vedono solo aprendo la pagina
 * giusta al momento sbagliato: un tag che non esiste, una dinamica lasciata a meta', due pagine con
 * lo stesso numero, un pulsante che porta in un posto che non c'e'. */
export type HmiIssueKind =
  | "tag-missing"
  | "tag-undeclared"
  | "dynamization-incomplete"
  | "script-invalid"
  | "script-trigger-loop"
  | "event-invalid"
  | "resource-list-missing"
  | "multilingual-text-missing"
  | "translation-missing"
  | "faceplate-invalid"
  | "data-log-invalid"
  | "alarm-invalid"
  | "trend-invalid"
  | "page-number-duplicate"
  | "navigation-dangling";

export interface HmiIssue {
  kind: HmiIssueKind;
  /** `error`: il pannello in runtime sbaglia di sicuro. `warning`: puo' funzionare, ma il progetto
   * non lo dice — un tag che nessuno ha dichiarato lo si scopre col PLC attaccato. */
  severity: "error" | "warning";
  file: string;
  line: number;
  message: string;
}

export interface HmiValidationInput {
  /** I sorgenti del progetto, file per file. */
  sources: Record<string, string>;
  /** Il catalogo PLC: un tag e' dichiarato se sta qui con tipo e indirizzo. */
  variables?: readonly PlcVariableDefinition[];
  /** Liste risorse del progetto. Senza catalogo si controlla solo che nome e tag siano presenti. */
  resources?: HmiResourceCatalog;
  /** Moduli riusabili e definizioni locali: fanno parte del Runtime quanto gli script sugli oggetti. */
  scripts?: HmiScriptCatalog;
  /** Tipi faceplate e versioni rilasciate usati dalle istanze nelle pagine. */
  faceplates?: HmiFaceplateCatalog;
  /** Data Log disponibili come sorgente storica dei controlli. */
  dataLogs?: HmiDataLogCatalog;
  alarms?: unknown;
  /** Le route che il router conosce davvero. Se non arrivano, la navigazione non si controlla:
   * meglio tacere che accusare un progetto di cui non si e' letto il router. */
  routes?: readonly string[];
  /** Associa il file della pagina alla route per risolvere correttamente Local.Funzione. */
  pageRoutes?: Readonly<Record<string, string>>;
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function fileName(file: string): string {
  return file.replaceAll("\\", "/").split("/").pop() ?? file;
}

/** I tag su cui si puo' dire qualcosa: quelli del catalogo con tipo e indirizzo. Un tag trovato solo
 * leggendo il JSX (`detected`) non e' dichiarato — e' esattamente quello che si vuole segnalare. */
function declaredTags(variables: readonly PlcVariableDefinition[] | undefined): Set<string> | undefined {
  if (!variables?.length) return undefined;
  return new Set(variables.filter((variable) => !variable.detected).map((variable) => variable.name));
}

const tagAttribute = /\bdata-plc-(?:variable|tag)\s*=\s*["']([^"']*)["']/g;
const dynamizationAttribute = new RegExp(`\\b${hmiDynamizationAttribute}\\s*=\\s*(?:'([^']*)'|"([^"]*)")`, "g");
const pageNumber = new RegExp(`${pageNumberAttribute}\\s*=\\s*(?:\\{\\s*(\\d{3,5})\\s*\\}|["'](\\d{3,5})["'])`, "g");
const navigation = /\b(?:openPage|navigate)\(\s*["'`]([^"'`]*)["'`]/g;
const multilingualText = /\bdata-hmi-text\s*=\s*["']([^"']*)["']/g;
const hmiEventAttribute = new RegExp(`\\b${hmiEventsAttribute}\\s*=\\s*(?:'([^']*)'|"([^"]*)")`, "g");
const faceplateAttribute = new RegExp(`\\b${hmiFaceplateAttribute}\\s*=\\s*(?:'([^']*)'|"([^"]*)")`, "g");
const trendAttribute = new RegExp(`\\b${hmiTrendAttribute}\\s*=\\s*(?:'([^']*)'|"([^"]*)")`, "g");

function checkFaceplates(file: string, source: string, catalog: HmiFaceplateCatalog | undefined, variables: readonly PlcVariableDefinition[] | undefined, issues: HmiIssue[]) {
  faceplateAttribute.lastIndex = 0;
  for (let match = faceplateAttribute.exec(source); match; match = faceplateAttribute.exec(source)) {
    const raw = decodeAttribute(match[1] ?? match[2] ?? "");
    if (!raw) continue;
    const line = lineAt(source, match.index);
    const binding = parseHmiFaceplateBinding(raw);
    if (!binding) {
      issues.push({ kind: "faceplate-invalid", severity: "error", file, line, message: `${fileName(file)}:${line} — il collegamento faceplate non è un JSON valido.` });
      continue;
    }
    if (!catalog) continue;
    for (const issue of hmiFaceplateBindingIssues(binding, catalog, variables)) {
      issues.push({ kind: "faceplate-invalid", severity: issue.severity, file, line, message: `${fileName(file)}:${line} — ${issue.message}` });
    }
  }
}

function checkTrends(file: string, source: string, variables: readonly PlcVariableDefinition[] | undefined, dataLogs: HmiDataLogCatalog | undefined, issues: HmiIssue[]) {
  trendAttribute.lastIndex = 0;
  for (let match = trendAttribute.exec(source); match; match = trendAttribute.exec(source)) {
    const raw = decodeAttribute(match[1] ?? match[2] ?? "");
    const line = lineAt(source, match.index);
    const config = parseHmiTrendConfig(raw);
    if (!config) {
      issues.push({ kind: "trend-invalid", severity: "error", file, line, message: `${fileName(file)}:${line} — la configurazione Trend Control non è un JSON valido.` });
      continue;
    }
    for (const issue of hmiTrendIssues(config, variables, dataLogs)) issues.push({ kind: "trend-invalid", severity: issue.severity, file, line, message: `${fileName(file)}:${line} — ${issue.message}` });
  }
  const attribute = new RegExp(`\\b${hmiFunctionTrendAttribute}\\s*=\\s*(?:'([^']*)'|"([^"]*)")`, "g");
  for (let match = attribute.exec(source); match; match = attribute.exec(source)) {
    const line = lineAt(source, match.index); const config = parseHmiFunctionTrendConfig(decodeAttribute(match[1] ?? match[2] ?? ""));
    if (!config) { issues.push({ kind: "trend-invalid", severity: "error", file, line, message: `${fileName(file)}:${line} — la configurazione Function Trend non è un JSON valido.` }); continue; }
    for (const issue of hmiFunctionTrendIssues(config, variables, dataLogs)) issues.push({ kind: "trend-invalid", severity: issue.severity, file, line, message: `${fileName(file)}:${line} — ${issue.message}` });
  }
}

/** Il testo che si legge dentro `data-hmi-dynamizations`: nel JSX l'attributo e' una stringa con le
 * entita' HTML gia' risolte dal parser, qui invece si legge il sorgente cosi' com'e'. */
function decodeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function checkTags(file: string, source: string, declared: Set<string> | undefined, issues: HmiIssue[]) {
  tagAttribute.lastIndex = 0;
  for (let match = tagAttribute.exec(source); match; match = tagAttribute.exec(source)) {
    const name = match[1].trim();
    const line = lineAt(source, match.index);
    if (!name) {
      // Non e' un errore: lo standard disegna il campo e lascia il tag alla macchina. E' pero' la
      // lista di cosa resta da collegare, ed e' l'unico posto dove qualcuno la vede tutta insieme.
      issues.push({ kind: "tag-missing", severity: "warning", file, line, message: `${fileName(file)}:${line} — campo senza tag: non mostrera' nessun valore.` });
      continue;
    }
    if (declared && !declared.has(name)) {
      issues.push({ kind: "tag-undeclared", severity: "warning", file, line, message: `${fileName(file)}:${line} — il tag "${name}" non e' dichiarato nel catalogo PLC.` });
    }
  }
}

function checkDynamizations(file: string, source: string, declared: Set<string> | undefined, resources: HmiResourceCatalog | undefined, scripts: HmiScriptCatalog | undefined, scope: string | undefined, issues: HmiIssue[], variables?: readonly PlcVariableDefinition[]) {
  dynamizationAttribute.lastIndex = 0;
  for (let match = dynamizationAttribute.exec(source); match; match = dynamizationAttribute.exec(source)) {
    const line = lineAt(source, match.index);
    const raw = decodeAttribute(match[1] ?? match[2] ?? "");
    let parsed;
    try { parsed = JSON.parse(raw) as unknown; }
    catch {
      issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${fileName(file)}:${line} — le dinamiche dell'elemento non sono leggibili: l'attributo non e' un JSON valido.` });
      continue;
    }
    // Una lista che il parser scarta per intero e' scritta male quanto una spezzata: se il JSON
    // conteneva voci e non ne resta nessuna, l'elemento crede di essere dinamico e non lo e'.
    const items = parseHmiDynamizations(parsed);
    if (Array.isArray(parsed) && parsed.length && !items.length) {
      issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${fileName(file)}:${line} — nessuna delle dinamiche dichiarate ha una proprieta' valida.` });
      continue;
    }
    for (const item of items) {
      const where = `${fileName(file)}:${line} — la dinamica su ${item.property}`;
      const checkExpression = (expression: string, context: string) => {
        const inspection = inspectHmiExpression(expression);
        if (inspection.error) {
          issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} ha ${context} non valida: ${inspection.error}.` });
          return;
        }
        if (!declared) return;
        for (const tag of inspection.tags) {
          if (!declared.has(tag)) issues.push({ kind: "tag-undeclared", severity: "warning", file, line, message: `${where} usa il tag "${tag}" nell'espressione, ma non e' dichiarato nel catalogo PLC.` });
        }
      };
      if (item.kind === "Tag") {
        const indirectIssue = hmiIndirectBindingIssue(item, variables);
        if (indirectIssue) issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where}: ${indirectIssue}` });
        if (!item.tag?.trim()) {
          issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} non dice da quale tag prende il valore.` });
        } else if (declared && !declared.has(item.tag.trim())) {
          issues.push({ kind: "tag-undeclared", severity: "warning", file, line, message: `${where} usa il tag "${item.tag}", che non e' dichiarato nel catalogo PLC.` });
        }
      } else if (item.kind === "ResourceList") {
        if (!item.tag?.trim()) {
          issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} usa una lista risorse ma non dice quale tag sceglie la voce.` });
        } else if (declared && !declared.has(item.tag.trim())) {
          issues.push({ kind: "tag-undeclared", severity: "warning", file, line, message: `${where} usa il tag "${item.tag}", che non e' dichiarato nel catalogo PLC.` });
        }
        if (!item.source?.trim()) {
          issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} non dice quale lista risorse usa.` });
        } else if (resources) {
          const textList = resources.textLists.find((list) => list.name === item.source);
          const graphicList = resources.graphicLists.find((list) => list.name === item.source);
          if (!textList && !graphicList) {
            issues.push({ kind: "resource-list-missing", severity: "error", file, line, message: `${where} usa la lista "${item.source}", che non esiste in framecraft.resources.json.` });
          } else if (item.property === "Graphic" && !graphicList) {
            issues.push({ kind: "resource-list-missing", severity: "error", file, line, message: `${where} richiede una grafica, ma "${item.source}" e' una lista di testi.` });
          } else if ((item.property === "Text" || item.property === "ProcessValue") && !textList) {
            issues.push({ kind: "resource-list-missing", severity: "error", file, line, message: `${where} richiede un testo, ma "${item.source}" e' una lista di grafiche.` });
          }
          if (textList) {
            const missing = resources.languages.filter((language) => textList.entries.some((entry) => !entry.texts[language]?.trim()));
            if (missing.length) issues.push({ kind: "translation-missing", severity: "warning", file, line, message: `${where} usa "${item.source}", che ha traduzioni mancanti per ${missing.join(", ")}.` });
          }
        }
      } else if (item.kind === "Flashing") {
        if (!hmiFlashingProperties.includes(item.property as (typeof hmiFlashingProperties)[number])) {
          issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} non e' una proprieta' colore compatibile col lampeggio.` });
        }
        if (!item.color?.trim() || !item.alternateColor?.trim()) {
          issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} deve definire due colori di lampeggio.` });
        } else if (item.color.trim().toLocaleLowerCase() === item.alternateColor.trim().toLocaleLowerCase()) {
          issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} usa due colori uguali: il lampeggio non sarebbe visibile.` });
        } else {
          const contrast = hmiFlashingContrast(item.color, item.alternateColor);
          if (contrast !== undefined && contrast < 3) issues.push({ kind: "dynamization-incomplete", severity: "warning", file, line, message: `${where} ha contrasto ${contrast.toFixed(2)}:1 fra i colori; usa almeno 3:1 per rendere il segnale distinguibile.` });
        }
        if (item.flashingCondition === "RangeViolation") {
          if (!item.tag?.trim()) issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} usa il superamento limiti ma non indica il tag.` });
          else if (declared && !declared.has(item.tag.trim())) issues.push({ kind: "tag-undeclared", severity: "warning", file, line, message: `${where} usa il tag "${item.tag}", che non e' dichiarato nel catalogo PLC.` });
          if (item.minimum === undefined && item.maximum === undefined) issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} usa il superamento limiti ma non definisce minimo o massimo.` });
          if (item.minimum !== undefined && item.maximum !== undefined && item.minimum > item.maximum) issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} ha un minimo maggiore del massimo.` });
        }
      } else if (!item.source?.trim()) {
        issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} e' di tipo ${item.kind} ma non dice da dove viene il valore.` });
      } else if (item.kind === "Expression") {
        checkExpression(item.source, "un'espressione");
      } else if (item.kind === "Script") {
        const inspection = inspectHmiScript(item.source, scripts ? hmiScriptFunctions(scripts, scope, "dynamizations") : undefined, scripts ? hmiScriptGlobalDefinition(scripts, scope, "dynamizations")?.program : undefined, [], scripts ? hmiScriptVariables(scripts) : undefined);
        if (inspection.error) {
          issues.push({ kind: "script-invalid", severity: "error", file, line, message: `${where} contiene uno script non valido: ${inspection.error}` });
        } else {
          if (inspection.hasAsync) issues.push({ kind: "script-invalid", severity: "error", file, line, message: `${where} usa ReadAsync/WriteAsync: le Promise sono ammesse negli eventi, ma una dinamizzazione deve restituire il valore nello stesso ciclo.` });
          if (!inspection.hasReturn) issues.push({ kind: "script-invalid", severity: "error", file, line, message: `${where} deve restituire il valore della proprieta' con return.` });
          const triggers = item.triggers?.length ? item.triggers : inspection.tagsRead;
          if (!triggers.length && !item.cycleMs) issues.push({ kind: "script-invalid", severity: "error", file, line, message: `${where} non ha tag letti, trigger dichiarati o un ciclo.` });
          if (declared) {
            for (const tag of new Set([...inspection.tagsRead, ...inspection.tagsWritten, ...(item.triggers ?? [])])) {
              if (!declared.has(tag)) issues.push({ kind: "tag-undeclared", severity: "warning", file, line, message: `${where} usa il tag "${tag}" nello script, ma non e' dichiarato nel catalogo PLC.` });
            }
          }
          const loops = inspection.tagsWritten.filter((tag) => triggers.includes(tag));
          if (loops.length) issues.push({ kind: "script-trigger-loop", severity: "warning", file, line, message: `${where} riscrive ${loops.join(", ")}, che fa anche da trigger: puo' creare un ciclo continuo in Runtime.` });
        }
      }
      // Le soglie di un `Range` senza estremi non convertono niente: il valore resta quello che era.
      if (item.conditionType === "Range" && item.entries?.some((entry) => entry.from === undefined && entry.to === undefined)) {
        issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} ha una soglia senza da/a.` });
      }
      if (item.conditionType === "Expression") {
        for (const entry of item.entries ?? []) {
          if (!entry.condition?.trim()) {
            issues.push({ kind: "dynamization-incomplete", severity: "error", file, line, message: `${where} ha una regola personalizzata senza condizione.` });
          } else {
            checkExpression(entry.condition, "una condizione");
          }
        }
      }
    }
  }
}

function checkNavigation(file: string, source: string, routes: Set<string> | undefined, issues: HmiIssue[]) {
  if (!routes) return;
  navigation.lastIndex = 0;
  for (let match = navigation.exec(source); match; match = navigation.exec(source)) {
    const target = match[1].split("?")[0].split("#")[0];
    if (!target || routes.has(target)) continue;
    const line = lineAt(source, match.index);
    issues.push({ kind: "navigation-dangling", severity: "error", file, line, message: `${fileName(file)}:${line} — il pulsante porta a "${target}", che non e' una pagina del progetto.` });
  }
}

function checkMultilingualTexts(file: string, source: string, resources: HmiResourceCatalog | undefined, issues: HmiIssue[]) {
  multilingualText.lastIndex = 0;
  for (let match = multilingualText.exec(source); match; match = multilingualText.exec(source)) {
    const line = lineAt(source, match.index);
    const key = match[1].trim();
    if (!key) {
      issues.push({ kind: "multilingual-text-missing", severity: "error", file, line, message: `${fileName(file)}:${line} — il testo multilingua non ha una chiave.` });
      continue;
    }
    if (!resources) continue;
    const item = resources.multilingualTexts.find((candidate) => candidate.key === key);
    if (!item) {
      issues.push({ kind: "multilingual-text-missing", severity: "error", file, line, message: `${fileName(file)}:${line} — la chiave testo "${key}" non esiste in framecraft.resources.json.` });
      continue;
    }
    const missing = resources.languages.filter((language) => !item.texts[language]?.trim());
    if (missing.length) issues.push({ kind: "translation-missing", severity: "warning", file, line, message: `${fileName(file)}:${line} — il testo "${key}" non e' tradotto in ${missing.join(", ")}.` });
  }
}

function checkEvents(file: string, source: string, declared: Set<string> | undefined, scripts: HmiScriptCatalog | undefined, scope: string | undefined, issues: HmiIssue[]) {
  hmiEventAttribute.lastIndex = 0;
  for (let match = hmiEventAttribute.exec(source); match; match = hmiEventAttribute.exec(source)) {
    const line = lineAt(source, match.index);
    const raw = decodeAttribute(match[1] ?? match[2] ?? "");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch {
      issues.push({ kind: "event-invalid", severity: "error", file, line, message: `${fileName(file)}:${line} — gli eventi dell'elemento non sono un JSON valido.` });
      continue;
    }
    const events = parseHmiEvents(parsed);
    if (!Array.isArray(parsed) || (parsed.length > 0 && events.length === 0)) {
      issues.push({ kind: "event-invalid", severity: "error", file, line, message: `${fileName(file)}:${line} — nessun evento dichiarato e' riconoscibile.` });
      continue;
    }
    for (const binding of events) {
      const inspection = inspectHmiScript(binding.script, scripts ? hmiScriptFunctions(scripts, scope, "events") : undefined, scripts ? hmiScriptGlobalDefinition(scripts, scope, "events")?.program : undefined, [], scripts ? hmiScriptVariables(scripts) : undefined);
      const where = `${fileName(file)}:${line} — evento ${binding.event}`;
      if (inspection.error) {
        issues.push({ kind: "event-invalid", severity: "error", file, line, message: `${where} contiene uno script non valido: ${inspection.error}` });
        continue;
      }
      if (!declared) continue;
      for (const tag of new Set([...inspection.tagsRead, ...inspection.tagsWritten])) {
        if (!declared.has(tag)) issues.push({ kind: "tag-undeclared", severity: "warning", file, line, message: `${where} usa il tag "${tag}", che non e' dichiarato nel catalogo PLC.` });
      }
    }
  }
}

/** I numeri di pagina usati piu' di una volta. Il numero non e' un'etichetta: e' come il menu sa
 * dove sei, quindi due pagine con lo stesso numero si accendono a vicenda nel menu. */
function checkPageNumbers(sources: Record<string, string>, issues: HmiIssue[]) {
  const seen = new Map<number, { file: string; line: number }[]>();
  for (const [file, source] of Object.entries(sources)) {
    pageNumber.lastIndex = 0;
    for (let match = pageNumber.exec(source); match; match = pageNumber.exec(source)) {
      const number = Number(match[1] ?? match[2]);
      if (!pageNumberParts(number)) continue;
      const line = lineAt(source, match.index);
      seen.set(number, [...(seen.get(number) ?? []), { file, line }]);
    }
  }
  for (const [number, places] of seen) {
    if (places.length < 2) continue;
    const others = places.map((place) => fileName(place.file)).join(", ");
    for (const place of places) {
      issues.push({ kind: "page-number-duplicate", severity: "error", file: place.file, line: place.line, message: `${fileName(place.file)}:${place.line} — il numero ${number} e' usato da piu' pagine (${others}).` });
    }
  }
}

function checkScriptCatalog(catalog: HmiScriptCatalog | undefined, declared: Set<string> | undefined, routes: Set<string> | undefined, issues: HmiIssue[]) {
  if (!catalog) return;
  for (const message of hmiScriptCatalogIssues(catalog)) {
    issues.push({ kind: "script-invalid", severity: "error", file: "framecraft.scripts.json", line: 1, message: `framecraft.scripts.json — ${message}` });
  }
  for (const definition of catalog.localDefinitions) {
    const route = definition.scope.startsWith("/") ? definition.scope : `/${definition.scope}`;
    if (routes && !routes.has(route)) issues.push({ kind: "script-invalid", severity: "error", file: "framecraft.scripts.json", line: 1, message: `framecraft.scripts.json — la definizione locale ${definition.scope} non corrisponde a una pagina del progetto.` });
  }
  if (!declared) return;
  const publicVariables = hmiScriptVariables(catalog);
  const globalFunctions = hmiScriptFunctions(catalog);
  const definitions = [
    ...catalog.globalModules.map((module) => ({ label: `Modules.${module.alias}`, definition: module.globalDefinition?.program })),
    ...catalog.localDefinitions.map((definition) => ({ label: `${definition.scope}/${definition.context}`, definition: definition.globalDefinition?.program })),
    { label: "Scheduler", definition: catalog.schedulerDefinition?.program },
  ];
  for (const { label, definition } of definitions) if (definition) {
    const inspection = inspectHmiScriptProgram(definition, undefined, undefined, [], publicVariables);
    for (const tag of new Set([...inspection.tagsRead, ...inspection.tagsWritten])) if (!declared.has(tag)) {
      issues.push({ kind: "tag-undeclared", severity: "warning", file: "framecraft.scripts.json", line: 1, message: `framecraft.scripts.json — la definizione globale ${label} usa il tag "${tag}", che non e' dichiarato nel catalogo PLC.` });
    }
  }
  const functions = [
    ...catalog.globalModules.flatMap((module) => module.functions.map((fn) => ({ label: `Modules.${module.alias}.${fn.name}`, fn, functions: globalFunctions, definition: module.globalDefinition?.program }))),
    ...catalog.localDefinitions.flatMap((definition) => definition.functions.map((fn) => ({ label: `${definition.scope}/${definition.context}/Local.${fn.name}`, fn, functions: hmiScriptFunctions(catalog, definition.scope, definition.context), definition: definition.globalDefinition?.program }))),
  ];
  for (const { label, fn, functions: linkedFunctions, definition } of functions) {
    const inspection = inspectHmiScript(fn.source, linkedFunctions, definition, fn.parameters, publicVariables);
    for (const tag of new Set([...(fn.tagsRead ?? []), ...(fn.tagsWritten ?? []), ...inspection.tagsRead, ...inspection.tagsWritten])) {
      if (!declared.has(tag)) issues.push({ kind: "tag-undeclared", severity: "warning", file: "framecraft.scripts.json", line: 1, message: `framecraft.scripts.json — ${label} usa il tag "${tag}", che non e' dichiarato nel catalogo PLC.` });
    }
  }
  for (const task of catalog.scheduledTasks) {
    const inspection = inspectHmiScript(task.script, globalFunctions, catalog.schedulerDefinition?.program, [], publicVariables);
    const tags = new Set([...(inspection.tagsRead ?? []), ...(inspection.tagsWritten ?? []), ...(task.trigger.kind === "tag" ? [task.trigger.tag] : [])].filter(Boolean));
    for (const tag of tags) if (!declared.has(tag)) {
      issues.push({ kind: "tag-undeclared", severity: "warning", file: "framecraft.scripts.json", line: 1, message: `framecraft.scripts.json — l'operazione pianificata ${task.name || task.id} usa il tag "${tag}", che non e' dichiarato nel catalogo PLC.` });
    }
  }
}

/** Quello che il progetto dice di se' prima di uscire da Framecraft. Non tocca niente: legge i
 * sorgenti e mette in fila i problemi, file e riga, cosi' come li vedrebbe chi apre la pagina. */
export function validateHmiProject({ sources, variables, resources, scripts, faceplates, dataLogs, alarms, routes, pageRoutes }: HmiValidationInput): HmiIssue[] {
  const issues: HmiIssue[] = [];
  for (const issue of alarms === undefined ? [] : alarmCatalogIssues(alarms, variables)) issues.push({ kind: "alarm-invalid", severity: "error", file: "framecraft.alarms.json", line: 1, message: `Allarmi — ${issue.message}` });
  const declared = declaredTags(variables);
  const knownRoutes = routes ? new Set(routes.map((route) => (route.startsWith("/") ? route : `/${route}`))) : undefined;
  const routeByFile = new Map(Object.entries(pageRoutes ?? {}).map(([file, route]) => [file.replaceAll("\\", "/").toLocaleLowerCase(), route]));
  for (const [file, source] of Object.entries(sources)) {
    const scope = routeByFile.get(file.replaceAll("\\", "/").toLocaleLowerCase());
    checkTags(file, source, declared, issues);
    checkDynamizations(file, source, declared, resources, scripts, scope, issues, variables);
    checkEvents(file, source, declared, scripts, scope, issues);
    checkFaceplates(file, source, faceplates, variables, issues);
    checkTrends(file, source, variables, dataLogs, issues);
    checkMultilingualTexts(file, source, resources, issues);
    checkNavigation(file, source, knownRoutes, issues);
  }
  checkPageNumbers(sources, issues);
  checkScriptCatalog(scripts, declared, knownRoutes, issues);
  for (const type of faceplates?.types ?? []) for (const issue of hmiFaceplateTypeIssues(type, faceplates)) {
    issues.push({ kind: "faceplate-invalid", severity: issue.severity, file: "framecraft.faceplates.json", line: 1, message: `framecraft.faceplates.json — ${type.name} V${type.version}: ${issue.message}` });
  }
  for (const issue of dataLogs ? hmiDataLogCatalogIssues(dataLogs, variables) : []) {
    issues.push({ kind: "data-log-invalid", severity: issue.severity, file: "framecraft.logs.json", line: 1, message: `framecraft.logs.json — ${issue.message}` });
  }
  return issues.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

/** Una riga sola per la barra di stato o per la console: quanti problemi, e di che gravita'. */
export function describeHmiIssues(issues: readonly HmiIssue[]): string {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  if (!issues.length) return "Controllo HMI: nessun problema.";
  const parts = [errors ? `${errors} ${errors === 1 ? "errore" : "errori"}` : "", warnings ? `${warnings} ${warnings === 1 ? "avviso" : "avvisi"}` : ""].filter(Boolean);
  return `Controllo HMI: ${parts.join(" e ")}.`;
}
