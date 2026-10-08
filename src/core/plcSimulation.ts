import { cssColor, type Dynamization } from "./hmiStandard";
import { hmiFlashingInlineStyle, resolveHmiFlashing, type HmiFlashingVisual } from "./hmiFlashing";
import { evaluateHmiExpression, inspectHmiExpression } from "./hmiExpression";
import { resolveHmiResource, type HmiResourceCatalog } from "./hmiResources";
import { resolveHmiTagDynamization, type HmiTagDefinition, type HmiTagStatus } from "./hmiTagBinding";
import { executeHmiScript, inspectHmiScript, type HmiScriptProgram, type HmiScriptRuntimeFunction, type HmiScriptRuntimeVariable, type HmiScriptScope, type HmiScriptScreenItemManager, type HmiScriptTimerManager } from "./hmiScript";

/** La simulazione degli stati PLC: dato un valore di prova per un tag, che aspetto prende l'oggetto.
 *
 * Nello standard un oggetto non si anima da solo: ha una `Dynamization` che lega una sua proprieta'
 * a un tag, e in mezzo c'e' un `ValueConverter` con una tabella. Quella tabella dice, per esempio,
 * «da 0 a 9 il colore e' rosso, da 10 a 99 e' verde». Qui c'e' la stessa lettura, ma al contrario:
 * si scrive un valore a mano e si guarda cosa diventa l'oggetto, senza un PLC collegato.
 *
 * Due cose che questo modulo **non** fa, e lo dice invece di fingere:
 *
 * - le tabelle dell'export sono vuote. Le 1068 soglie dei `Range` stanno in `fill.cmd` e si leggono
 *   solo con TIA aperto: una dinamizzazione a `Range` senza righe non si puo' risolvere, e finisce
 *   fra i `unresolved` con il motivo scritto;
 * - gli script JavaScript sono eseguiti solo nel sottoinsieme controllato da `hmiScript`: niente
 *   `eval`, accesso al browser o loop illimitati. Quello che esce dalla sandbox resta non risolto.
 *
 * Il resto si risolve: `None` prende il valore del tag cosi' com'e' — ed e' il caso delle pagine che
 * genera l'editor, dove i trenta pacchi hanno `Left`, `Top`, `Width` e `Height` legati ai loro tag. */

/** Perche' una proprieta' non si e' potuta simulare. */
export interface UnresolvedDynamization {
  property: string;
  reason: string;
}

export interface SimulationPatch {
  /** Le proprieta' CSS da mettere addosso all'elemento. */
  style: Record<string, string>;
  /** Il testo, quando la dinamizzazione e' su `Text` o `ProcessValue`. */
  text?: string;
  readOnly?: boolean;
  /** La grafica scelta da una lista risorse, quando la proprietà dinamizzata è `Graphic`. */
  graphic?: string;
  /** Lampeggi attivi, tenuti separati finché non vengono composti in un'unica animazione CSS. */
  flashing: HmiFlashingVisual[];
  unresolved: UnresolvedDynamization[];
}

export type SimulationValues = Readonly<Record<string, string>>;

/** I tag che una pagina userebbe: serve a chiedere solo quelli, invece di tutto il catalogo. */
export function simulationTags(items: readonly Dynamization[], functions?: Readonly<Record<string, HmiScriptRuntimeFunction>>, definition?: HmiScriptProgram, variables?: Readonly<Record<string, HmiScriptRuntimeVariable>>): string[] {
  const tags = new Set<string>();
  for (const item of items) {
    if ((item.kind === "Tag" || item.kind === "ResourceList") && item.tag) tags.add(item.tag);
    if (item.kind === "Script" && item.source) {
      const inspection = inspectHmiScript(item.source, functions, definition, [], variables);
      for (const tag of inspection.tagsRead) tags.add(tag);
      for (const trigger of item.triggers ?? []) tags.add(trigger);
    }
    if (item.kind === "Expression" && item.source) {
      for (const tag of inspectHmiExpression(item.source).tags) tags.add(tag);
    }
    if (item.conditionType === "Expression") {
      for (const entry of item.entries ?? []) {
        for (const tag of inspectHmiExpression(entry.condition ?? "").tags) tags.add(tag);
      }
    }
    if (item.kind === "Flashing" && item.flashingCondition === "RangeViolation" && item.tag) tags.add(item.tag);
  }
  return [...tags];
}

const numberOf = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : undefined;
};

/** Vero, falso, e le mille scritture con cui un valore di prova puo' dire di si'. */
function truthy(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "0" || normalized === "false" || normalized === "no") return false;
  return true;
}

/** Il valore che la proprieta' assume, o il motivo per cui non si sa. */
export function resolveDynamization(
  item: Dynamization,
  value: string | undefined,
  values: SimulationValues = {},
  resources?: HmiResourceCatalog,
  language?: string,
  functions?: Readonly<Record<string, HmiScriptRuntimeFunction>>,
  timerManager?: HmiScriptTimerManager,
  globalScope?: HmiScriptScope,
  variables?: Readonly<Record<string, HmiScriptRuntimeVariable>>,
  screenItems?: HmiScriptScreenItemManager,
  tagCatalog?: readonly HmiTagDefinition[],
  tagStatus?: Readonly<Record<string, HmiTagStatus>>,
): { value: string; resourceKind?: "text" | "graphic"; fallbackLanguage?: string } | { reason: string } {
  if (item.kind === "Script") {
    if (!item.source?.trim()) return { reason: "La dinamizzazione non contiene uno script." };
    const inspection = inspectHmiScript(item.source, functions, globalScope?.initializer, [], variables);
    if (inspection.error || !inspection.program) return { reason: `Script non valido: ${inspection.error ?? "programma non compilato"}` };
    const execution = executeHmiScript(inspection.program, values, { functions, variables, timerManager, globalScope, screenItems });
    if (execution.error) return { reason: `Script interrotto: ${execution.error}` };
    if (execution.returned === undefined) return { reason: "Lo script non ha restituito un valore per la proprieta'." };
    return { value: String(execution.returned ?? "") };
  }
  if (item.kind === "Expression") {
    if (!item.source?.trim()) return { reason: "La dinamizzazione non contiene un'espressione." };
    const result = evaluateHmiExpression(item.source, values);
    return "error" in result ? { reason: `Espressione non risolta: ${result.error}.` } : { value: String(result.value) };
  }
  if (item.kind === "ResourceList") {
    if (!item.source?.trim()) return { reason: "La dinamizzazione non dice quale lista risorse usa." };
    if (!item.tag?.trim()) return { reason: "La lista risorse non dice quale tag sceglie la voce." };
    if (value === undefined || value.trim() === "") return { reason: `Il tag ${item.tag} non ha un valore di prova.` };
    if (!resources) return { reason: `Il catalogo risorse non e' disponibile: impossibile risolvere "${item.source}".` };
    const resolved = resolveHmiResource(resources, item.source, value, language);
    if ("reason" in resolved) return resolved;
    return {
      value: resolved.value,
      resourceKind: resolved.kind,
      ...(resolved.kind === "text" && resolved.fallback ? { fallbackLanguage: resolved.language } : {}),
    };
  }
  if (item.kind !== "Tag") return { reason: `La sorgente e' ${item.kind}, non un tag.` };
  const resolved = resolveHmiTagDynamization(item, item.tag && value !== undefined ? { ...values, [item.tag]: value } : values, tagCatalog, tagStatus);
  return "reason" in resolved ? { reason: resolved.reason } : { value: resolved.value };
}

const pixels = (value: string): string | undefined => {
  const number = numberOf(value);
  return number === undefined ? undefined : `${number}px`;
};

/** Come una proprieta' dello standard si vede in una pagina web. Quelle che non si vedono — una
 * grafica che non e' stata esportata, un `IsSelected` che vive dentro un controllo — restano fuori,
 * con il motivo scritto. */
const cssFor: Record<string, (value: string) => Record<string, string> | undefined> = {
  Left: (value) => { const px = pixels(value); return px ? { left: px } : undefined; },
  Top: (value) => { const px = pixels(value); return px ? { top: px } : undefined; },
  Width: (value) => { const px = pixels(value); return px ? { width: px } : undefined; },
  Height: (value) => { const px = pixels(value); return px ? { height: px } : undefined; },
  Opacity: (value) => { const number = numberOf(value); return number === undefined ? undefined : { opacity: String(number > 1 ? number / 100 : number) }; },
  Visible: (value) => ({ visibility: truthy(value) ? "visible" : "hidden" }),
  BackColor: (value) => ({ backgroundColor: cssColor(value) }),
  ForeColor: (value) => ({ color: cssColor(value) }),
  BorderColor: (value) => ({ borderColor: cssColor(value) }),
  BorderWidth: (value) => { const px = pixels(value); return px ? { borderWidth: px, borderStyle: "solid" } : undefined; },
  RotationAngle: (value) => { const number = numberOf(value); return number === undefined ? undefined : { rotate: `${number}deg` }; },
  Enabled: (value) => truthy(value) ? { pointerEvents: "auto", filter: "none" } : { pointerEvents: "none", filter: "grayscale(1)" },
};

/** Le proprieta' che si risolvono ma non si possono mostrare, e perche'. */
const notShown: Record<string, string> = {
  Graphic: "La grafica e' un'immagine TIA, e le 225 grafiche non sono state esportate.",
  Url: "L'indirizzo di un contenuto web non si simula sul canvas.",
  IsSelected: "La selezione vive dentro il controllo, non nel suo stile.",
  AngleRange: "L'apertura di un indicatore ad ago non e' una proprieta' CSS.",
  AlternateBackColor: "E' il colore delle righe alterne di un controllo, non dell'elemento.",
};

const textProperties = new Set(["Text", "ProcessValue"]);

/** Lo stato di un elemento con i valori di prova dati: cosa diventa, e cosa non si e' potuto dire. */
export function simulationPatch(items: readonly Dynamization[], values: SimulationValues, resources?: HmiResourceCatalog, language?: string, functions?: Readonly<Record<string, HmiScriptRuntimeFunction>>, timerManager?: HmiScriptTimerManager, globalScope?: HmiScriptScope, variables?: Readonly<Record<string, HmiScriptRuntimeVariable>>, screenItems?: HmiScriptScreenItemManager, tagCatalog?: readonly HmiTagDefinition[], tagStatus?: Readonly<Record<string, HmiTagStatus>>): SimulationPatch {
  const patch: SimulationPatch = { style: {}, flashing: [], unresolved: [] };
  for (const item of items) {
    if (item.kind === "Tag" && item.indirect && item.property === "ProcessValue") patch.readOnly = true;
    if (item.kind === "Flashing") {
      const flashing = resolveHmiFlashing(item, values);
      if ("reason" in flashing) patch.unresolved.push({ property: item.property, reason: flashing.reason });
      else if (flashing.active) patch.flashing.push(flashing.visual);
      continue;
    }
    const resolved = resolveDynamization(item, item.tag ? values[item.tag] : undefined, values, resources, language, functions, timerManager, globalScope, variables, screenItems, tagCatalog, tagStatus);
    if ("reason" in resolved) {
      patch.unresolved.push({ property: item.property, reason: resolved.reason });
      if (item.kind === "Tag" && item.indirect) {
        if (textProperties.has(item.property)) patch.text = "—";
        else if (item.property === "Visible") patch.style.visibility = "hidden";
        else if (item.property === "Enabled") Object.assign(patch.style, { pointerEvents: "none", filter: "grayscale(1)" });
      }
      continue;
    }
    if (resolved.resourceKind === "graphic") {
      if (item.property === "Graphic") patch.graphic = resolved.value;
      else patch.unresolved.push({ property: item.property, reason: `La lista "${item.source}" restituisce una grafica, non un valore per ${item.property}.` });
      continue;
    }
    if (textProperties.has(item.property)) {
      patch.text = resolved.value;
      if (resolved.fallbackLanguage) patch.unresolved.push({ property: item.property, reason: `Traduzione ${language ?? resources?.activeLanguage} assente: mostrato ${resolved.fallbackLanguage}.` });
      continue;
    }
    const reason = notShown[item.property];
    if (reason) {
      patch.unresolved.push({ property: item.property, reason });
      continue;
    }
    const style = cssFor[item.property]?.(resolved.value);
    if (!style) {
      patch.unresolved.push({
        property: item.property,
        reason: cssFor[item.property]
          ? `"${resolved.value}" non e' un valore buono per ${item.property}.`
          : `${item.property} non ha un equivalente sul canvas.`,
      });
      continue;
    }
    Object.assign(patch.style, style);
  }
  Object.assign(patch.style, hmiFlashingInlineStyle(patch.flashing));
  return patch;
}

/** Un elemento della pagina che porta addosso delle dinamizzazioni, come lo racconta l'anteprima. */
export interface SimulatedElement {
  instanceId: string;
  dynamizations: Dynamization[];
}

export interface SimulationCommand {
  instanceId: string;
  style: Record<string, string>;
  text?: string;
  readOnly?: boolean;
  graphic?: string;
  flashing?: HmiFlashingVisual[];
}

/** Le istruzioni da mandare all'anteprima, piu' quello che non si e' potuto simulare.
 *
 * Un elemento senza niente da cambiare non entra nella lista: l'anteprima deve poter rimettere a
 * posto tutti quelli che tocca, e piu' corta e' la lista meno c'e' da rimettere a posto. */
export function simulationCommands(elements: readonly SimulatedElement[], values: SimulationValues, resources?: HmiResourceCatalog, language?: string, functions?: Readonly<Record<string, HmiScriptRuntimeFunction>>, timerManager?: HmiScriptTimerManager, globalScope?: HmiScriptScope, variables?: Readonly<Record<string, HmiScriptRuntimeVariable>>, screenItems?: (instanceId: string) => HmiScriptScreenItemManager, tagCatalog?: readonly HmiTagDefinition[], tagStatus?: Readonly<Record<string, HmiTagStatus>>):
  { commands: SimulationCommand[]; unresolved: UnresolvedDynamization[] } {
  const commands: SimulationCommand[] = [];
  const unresolved = new Map<string, UnresolvedDynamization>();
  for (const element of elements) {
    const patch = simulationPatch(element.dynamizations, values, resources, language, functions, timerManager, globalScope, variables, screenItems?.(element.instanceId), tagCatalog, tagStatus);
    for (const item of patch.unresolved) unresolved.set(`${item.property}|${item.reason}`, item);
    if (!Object.keys(patch.style).length && patch.text === undefined && patch.graphic === undefined) continue;
    commands.push({
      instanceId: element.instanceId,
      style: patch.style,
      ...(patch.flashing.length ? { flashing: patch.flashing } : {}),
      ...(patch.text === undefined ? {} : { text: patch.text }),
      ...(patch.readOnly ? { readOnly: true } : {}),
      ...(patch.graphic === undefined ? {} : { graphic: patch.graphic }),
    });
  }
  return { commands, unresolved: [...unresolved.values()] };
}
