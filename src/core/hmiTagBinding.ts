import { evaluateHmiExpression, hmiExpressionTruthy } from "./hmiExpression";

export interface HmiTagBinding {
  property: string;
  tag?: string;
  indirect?: boolean;
  indirectDataType?: string;
  conditionType?: string;
  entries?: { from?: number; to?: number; condition?: string; value: string }[];
}
export interface HmiTagDefinition { name: string; dataType: string; access: string; detected?: boolean }
export interface HmiTagStatus { qualityCode?: number; qualityKnown?: boolean; lastError?: number }
export type HmiTagResolution = { tag: string; value: string; dependencies: string[] } | { reason: string; dependencies: string[] };

const typeOf = (type: unknown) => typeof type === "string" ? type.trim().toUpperCase() : "";
const ownValue = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined => Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

export function hmiIndirectBindingIssue(binding: HmiTagBinding, catalog: readonly HmiTagDefinition[] = []): string | undefined {
  if (!binding.indirect) return undefined;
  const selector = catalog.filter((tag) => tag.name === binding.tag && !tag.detected);
  if (selector.length !== 1) return "Il tag selettore deve essere dichiarato una sola volta nel catalogo PLC.";
  if (typeOf(selector[0].dataType) !== "WSTRING") return "Il tag selettore deve essere di tipo WSTRING: contiene il nome del segnale da leggere.";
  if (!["read", "read-write"].includes(selector[0].access)) return "Il tag selettore è di sola scrittura o ha un accesso non valido: abilita la lettura nel catalogo e nel collegamento PLC.";
  if (!binding.indirectDataType?.trim()) return "Scegli il tipo del segnale di destinazione prima di usare il collegamento indiretto.";
  return undefined;
}

/** Una sola dereferenziazione, come Unified: il contenuto del tag di destinazione non è un altro indirizzo. */
export function resolveHmiTagReference(binding: HmiTagBinding, values: Readonly<Record<string, string>>, catalog: readonly HmiTagDefinition[] = [], status: Readonly<Record<string, HmiTagStatus>> = {}, requireQuality = false): HmiTagResolution {
  const selector = binding.tag ?? "";
  const dependencies = selector ? [selector] : [];
  const fail = (reason: string): HmiTagResolution => ({ reason, dependencies });
  if (!selector) return fail("La dinamizzazione non dice quale tag legge.");
  const value = ownValue(values, selector);
  if (!binding.indirect) return value === undefined || value.trim() === "" ? fail(`Il tag ${selector} non ha un valore di prova.`) : { tag: selector, value, dependencies };
  const issue = hmiIndirectBindingIssue(binding, catalog);
  if (issue) return fail(issue);
  const validSample = (name: string) => {
    const sample = ownValue(status, name);
    if (!sample) return !requireQuality;
    if (sample.lastError || sample.qualityKnown === false) return false;
    return sample.qualityCode === undefined ? !requireQuality : Number.isInteger(sample.qualityCode) && sample.qualityCode >= 0 && sample.qualityCode <= 65_535 && [128, 192].includes(sample.qualityCode & 0xc0);
  };
  if (!validSample(selector)) return fail("Il selettore non ha una lettura valida. Ripristina il collegamento PLC o controlla qualità e stato del tag.");
  if (typeof value !== "string" || !value.trim()) return fail("Il selettore è vuoto. Assegnagli il nome esatto di un tag del catalogo.");
  if (value.length > 200) return fail("Il nome nel selettore è troppo lungo: usa un nome del catalogo PLC.");
  const target = value.trim();
  if (target === selector) return fail("Il selettore punta a sé stesso. Scegli un altro tag: i riferimenti autoreferenziali sono bloccati.");
  dependencies.push(target);
  const targets = catalog.filter((tag) => tag.name === target && !tag.detected);
  if (targets.length !== 1) return fail("Il nome nel selettore non identifica un unico tag dichiarato. Controlla il catalogo PLC e il nome, comprese maiuscole e minuscole.");
  if (!["read", "read-write"].includes(targets[0].access)) return fail("La destinazione è di sola scrittura o ha un accesso non valido. Scegli un segnale leggibile oppure correggi il collegamento PLC.");
  if (typeOf(targets[0].dataType) !== typeOf(binding.indirectDataType!)) return fail(`Il tipo della destinazione non è ${binding.indirectDataType}. Scegli un tag del tipo richiesto oppure modifica il collegamento dell'elemento.`);
  if (!validSample(target)) return fail("La destinazione non ha una lettura valida. Controlla collegamento, qualità e stato del tag; il vecchio valore non viene riutilizzato.");
  const actual = ownValue(values, target);
  return actual === undefined ? fail("La destinazione non ha ancora un valore. Attendi una lettura PLC o inserisci il valore di prova.") : { tag: target, value: actual, dependencies };
}

export function resolveHmiTagDynamization(binding: HmiTagBinding, values: Readonly<Record<string, string>>, catalog: readonly HmiTagDefinition[] = [], status: Readonly<Record<string, HmiTagStatus>> = {}, requireQuality = false): HmiTagResolution {
  const result = resolveHmiTagReference(binding, values, catalog, status, requireQuality);
  if ("reason" in result) return result;
  const value = result.value.trim(), condition = binding.conditionType ?? "None";
  if (condition === "None") return { ...result, value };
  const fail = (reason: string): HmiTagResolution => ({ reason, dependencies: result.dependencies });
  if (!binding.entries?.length) return fail(`La tabella ${condition} e' vuota: le soglie non sono nell'export.`);
  if (condition === "Expression") {
    let firstError: string | undefined;
    for (const entry of binding.entries) {
      if (!entry.condition?.trim()) continue;
      const evaluated = evaluateHmiExpression(entry.condition, { ...values, [binding.tag!]: value, value });
      if ("error" in evaluated) { firstError ??= evaluated.error; continue; }
      if (hmiExpressionTruthy(evaluated.value)) return { ...result, value: entry.value };
    }
    return fail(firstError ? `Condizione personalizzata non risolta: ${firstError}.` : `Nessuna condizione personalizzata copre ${value}.`);
  }
  const number = value === "" ? NaN : Number(value);
  const numberOf = (raw: string) => raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
  const truthy = (raw: string) => !/^(?:|0|false|no)$/i.test(raw.trim());
  const entry = binding.entries.find((entry) => {
    if (condition === "Range") return Number.isFinite(number) && (entry.from ?? -Infinity) <= number && number <= (entry.to ?? Infinity);
    if (condition !== "Singlebit") return false;
    const bit = entry.condition === undefined ? undefined : numberOf(entry.condition);
    return bit !== undefined ? Number.isFinite(number) && ((number >> bit) & 1) === 1 : truthy(entry.condition ?? "") === truthy(value);
  });
  return entry ? { ...result, value: entry.value } : fail(`Nessuna riga della tabella ${condition} copre ${value}.`);
}
