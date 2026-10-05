import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { ArrowFunctionExpression, Expression, FunctionExpression, JSXAttribute, JSXElement, JSXText, ObjectExpression } from "@babel/types";
import MagicString from "magic-string";
import { readHighlightRegion, toggleHighlightRegion, type HighlightRegion } from "../core/highlightRegion";

const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

function ast(source: string) {
  return parse(source, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"] });
}

function elementAt(source: string, start: number, end: number): JSXElement {
  let found: JSXElement | undefined;
  traverse(ast(source), {
    JSXElement(path) {
      if (path.node.start === start && path.node.end === end) found = path.node;
    },
  });
  if (!found) throw new Error("Il nodo JSX non esiste più: aggiorna la preview prima di modificare.");
  return found;
}

function attributeNamed(element: JSXElement, name: string): JSXAttribute | undefined {
  return element.openingElement.attributes.find(
    (attribute): attribute is JSXAttribute => attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" && attribute.name.name === name,
  );
}

function updateAttributes(magic: MagicString, element: JSXElement, values: Record<string, string>) {
  const missing: string[] = [];
  for (const [name, rawValue] of Object.entries(values)) {
    const attribute = attributeNamed(element, name);
    if (attribute?.start != null && attribute.end != null) magic.overwrite(attribute.start, attribute.end, `${name}=${rawValue}`);
    else missing.push(`${name}=${rawValue}`);
  }
  if (missing.length) {
    const insertion = element.openingElement.end! - (element.openingElement.selfClosing ? 2 : 1);
    magic.appendLeft(insertion, ` ${missing.join(" ")}`);
  }
}

/** The properties the highlight writes, and therefore the ones it has to put back. */
const highlightProperties = ["outline", "outlineOffset", "boxShadow", "stroke", "strokeWidth", "vectorEffect", "filter"];

/** The click the panel really runs. A part of a machine drawing is a shape inside an <svg>, where
 * an outline and a box-shadow paint nothing at all: there the stroke and a drop shadow are what
 * makes the part stand out. Everywhere else the outline is what does not disturb the layout. */
function highlightHandler(targetId: string, color: string, width: number, originalClick?: string, region?: HighlightRegion) {
  const original = originalClick ? `(${originalClick})(event); ` : "";
  if (region) return `{(event) => { ${original}const target = document.querySelector(${JSON.stringify(`[data-fc-highlight-id="${targetId}"]`)}); if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) return; (${String(toggleHighlightRegion)})(target, ${JSON.stringify(region)}, ${JSON.stringify(color)}, ${width}); }}`;
  const shapeStyle = JSON.stringify({ stroke: color, strokeWidth: String(width), vectorEffect: "non-scaling-stroke", filter: `drop-shadow(0 0 4px ${color})` });
  const boxStyle = JSON.stringify({ outline: `${width}px solid ${color}`, outlineOffset: "3px", boxShadow: `0 0 0 4px ${color}33` });
  return `{(event) => { ${original}const target = document.querySelector(${JSON.stringify(`[data-fc-highlight-id="${targetId}"]`)}); if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) return; const names = ${JSON.stringify(highlightProperties)}; const active = target.dataset.fcHighlightActive === "true"; if (active) { const previous = JSON.parse(target.dataset.fcHighlightPrevious || "{}"); for (const name of names) target.style[name] = previous[name] || ""; } else { const previous = {}; for (const name of names) previous[name] = target.style[name] || ""; target.dataset.fcHighlightPrevious = JSON.stringify(previous); const painted = target.ownerSVGElement ? ${shapeStyle} : ${boxStyle}; for (const name of names) target.style[name] = painted[name] || previous[name] || ""; target.scrollIntoView({ behavior: "smooth", block: "center" }); } target.dataset.fcHighlightActive = String(!active); }}`;
}

function triggerAttributes(targetId: string, color: string, width: number, originalClick?: string, region?: HighlightRegion) {
  return {
    "data-fc-highlight-target": JSON.stringify(targetId),
    "data-fc-highlight-color": JSON.stringify(color),
    "data-fc-highlight-width": JSON.stringify(String(width)),
    ...(originalClick ? { "data-fc-highlight-original-click": `{${JSON.stringify(originalClick)}}` } : {}),
    ...(region ? { "data-fc-highlight-region": `{${JSON.stringify(JSON.stringify(region))}}` } : {}),
    onClick: highlightHandler(targetId, color, width, originalClick, region),
  };
}

function clickExpression(source: string, element: JSXElement) {
  const value = attributeNamed(element, "onClick")?.value;
  if (!value || value.type !== "JSXExpressionContainer" || value.expression.type === "JSXEmptyExpression" || value.expression.start == null || value.expression.end == null) return undefined;
  return source.slice(value.expression.start, value.expression.end);
}

function storedOriginalClick(element: JSXElement) {
  const value = attributeNamed(element, "data-fc-highlight-original-click")?.value;
  if (value?.type === "JSXExpressionContainer" && value.expression.type === "StringLiteral") return value.expression.value;
  if (value?.type === "StringLiteral") return value.value;
  return undefined;
}

export interface HighlightOptions {
  targetId: string;
  color: string;
  width: number;
  region?: HighlightRegion;
}

function highlightAttributes(options: HighlightOptions, original?: string) {
  const region = options.region === undefined ? undefined : readHighlightRegion(options.region);
  if (options.region !== undefined && !region) throw new Error("Disegna una zona valida con almeno tre punti non allineati.");
  return triggerAttributes(options.targetId, options.color, options.width, original, region);
}

function clearHighlightRegion(magic: MagicString, trigger: JSXElement, options: HighlightOptions) {
  const previous = attributeNamed(trigger, "data-fc-highlight-region");
  if (!options.region && previous?.start != null && previous.end != null) magic.remove(previous.start, previous.end);
}

export function addHighlightTarget(source: string, start: number, end: number, targetId: string): string {
  const target = elementAt(source, start, end);
  const magic = new MagicString(source);
  updateAttributes(magic, target, { "data-fc-highlight-id": JSON.stringify(targetId) });
  return magic.toString();
}

export function addHighlightTrigger(source: string, start: number, end: number, options: HighlightOptions): string {
  const trigger = elementAt(source, start, end);
  const original = attributeNamed(trigger, "data-fc-highlight-target") ? storedOriginalClick(trigger) : clickExpression(source, trigger);
  const magic = new MagicString(source);
  clearHighlightRegion(magic, trigger, options);
  updateAttributes(magic, trigger, highlightAttributes(options, original));
  return magic.toString();
}

export function addHighlightInteraction(source: string, triggerStart: number, triggerEnd: number, targetStart: number, targetEnd: number, options: HighlightOptions): string {
  const trigger = elementAt(source, triggerStart, triggerEnd);
  const target = triggerStart === targetStart && triggerEnd === targetEnd ? trigger : elementAt(source, targetStart, targetEnd);
  const original = attributeNamed(trigger, "data-fc-highlight-target") ? storedOriginalClick(trigger) : clickExpression(source, trigger);
  const magic = new MagicString(source);
  clearHighlightRegion(magic, trigger, options);
  if (trigger === target) {
    updateAttributes(magic, trigger, { "data-fc-highlight-id": JSON.stringify(options.targetId), ...highlightAttributes(options, original) });
  } else {
    updateAttributes(magic, target, { "data-fc-highlight-id": JSON.stringify(options.targetId) });
    updateAttributes(magic, trigger, highlightAttributes(options, original));
  }
  return magic.toString();
}

export function updateHighlightTrigger(source: string, start: number, end: number, options: HighlightOptions): string {
  const trigger = elementAt(source, start, end);
  if (!attributeNamed(trigger, "data-fc-highlight-target")) throw new Error("L'elemento selezionato non contiene un'evidenziazione modificabile.");
  const magic = new MagicString(source);
  const saved = attributeNamed(trigger, "data-fc-highlight-region")?.value;
  const raw = saved?.type === "JSXExpressionContainer" && saved.expression.type === "StringLiteral" ? saved.expression.value : saved?.type === "StringLiteral" ? saved.value : undefined;
  const region = options.region ?? (raw === undefined ? undefined : readHighlightRegion(raw));
  if (raw !== undefined && !region) throw new Error("La zona salvata non è valida: ridisegnala prima di applicare le modifiche.");
  updateAttributes(magic, trigger, highlightAttributes({ ...options, region }, storedOriginalClick(trigger)));
  return magic.toString();
}

export function removeHighlightTrigger(source: string, start: number, end: number): string {
  const trigger = elementAt(source, start, end);
  if (!attributeNamed(trigger, "data-fc-highlight-target")) return source;
  const magic = new MagicString(source);
  const original = storedOriginalClick(trigger);
  for (const name of ["data-fc-highlight-target", "data-fc-highlight-color", "data-fc-highlight-width", "data-fc-highlight-original-click", "data-fc-highlight-region"]) {
    const attribute = attributeNamed(trigger, name);
    if (attribute?.start != null && attribute.end != null) magic.remove(attribute.start, attribute.end);
  }
  const click = attributeNamed(trigger, "onClick");
  if (click?.start != null && click.end != null) {
    if (original) magic.overwrite(click.start, click.end, `onClick={${original}}`);
    else magic.remove(click.start, click.end);
  }
  return magic.toString();
}

/** Mirrors what parseSource treats as a static value, so the Inspector never offers a field it
 * cannot then write back. */
/** A JSX string literal cannot contain a double quote and decodes HTML entities, so a value with
 * either is written as an expression container, which round-trips exactly. */
function attributeLiteral(value: string): string {
  return /^[^"&<>\r\n]*$/.test(value) ? `"${value}"` : `{${JSON.stringify(value)}}`;
}

/** A visual edit is an explicit request to replace the current value. Expression-backed attributes
 * therefore become literals instead of staying permanently locked in the property sheet. */
export function updateStaticAttributes(source: string, start: number, end: number, values: Record<string, string>): string {
  const element = elementAt(source, start, end);
  const patch: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (!/^[A-Za-z_$][\w$-]*(?::[A-Za-z_$][\w$-]*)?$/.test(name)) throw new Error(`Nome attributo non valido: ${name}`);
    if (name === "style") throw new Error("Lo stile si modifica dalle sezioni Aspetto, Layout e Dimensioni.");
    patch[name] = attributeLiteral(value);
  }
  const magic = new MagicString(source);
  updateAttributes(magic, element, patch);
  return magic.toString();
}

/** The single written run of an element, when it has exactly one. An element regularly holds an icon
 * and a label together, and that label is still the thing the user means by "the text". */
export function textRun(element: JSXElement): JSXText | undefined {
  const runs = element.children.filter((child): child is JSXText => child.type === "JSXText" && Boolean(child.value.trim()));
  return runs.length === 1 && runs[0].start != null && runs[0].end != null ? runs[0] : undefined;
}

function elementChildren(element: JSXElement) {
  return element.children.filter((child) => child.type === "JSXElement" || child.type === "JSXFragment");
}

/** The lone `{...}` child of an element, which is what a visual edit replaces with a fixed value. */
function singleExpressionChild(element: JSXElement): Expression | undefined {
  const meaningful = element.children.filter((child) => child.type !== "JSXText" || child.value.trim());
  const only = meaningful.length === 1 ? meaningful[0] : undefined;
  if (only?.type !== "JSXExpressionContainer" || only.expression.type === "JSXEmptyExpression") return undefined;
  return only.expression.start == null || only.expression.end == null ? undefined : only.expression;
}

function padding(text: string) {
  return { leading: text.match(/^\s*/)?.[0] ?? "", trailing: text.match(/\s*$/)?.[0] ?? "" };
}

export function updateStaticText(source: string, start: number, end: number, value: string): string {
  const element = elementAt(source, start, end);
  const run = textRun(element);
  if (run) {
    const { leading, trailing } = padding(run.value);
    return new MagicString(source).overwrite(run.start!, run.end!, `${leading}${value}${trailing}`).toString();
  }
  // Without a run of its own, the whole content is replaced. Doing that to an element that holds
  // other elements would silently delete them, so that case is refused instead.
  if (elementChildren(element).length) {
    throw new Error("Il testo di questo elemento sta dentro gli elementi figli: clicca direttamente la scritta per modificarla.");
  }
  if (element.openingElement.end == null || element.closingElement?.start == null) throw new Error("Questo elemento non può contenere testo.");
  return new MagicString(source).overwrite(element.openingElement.end, element.closingElement.start, `{${JSON.stringify(value)}}`).toString();
}

function literal(value: string | number): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

function normalizedStyleProperty(property: string) {
  const trimmed = property.trim();
  if (/^--[a-z0-9_-]+$/i.test(trimmed)) return trimmed;
  const camel = trimmed.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()).replace(/^-/, "");
  if (!/^[A-Za-z_$][\w$]*$/.test(camel)) throw new Error(`Nome proprietà CSS non valido: ${property}`);
  return camel;
}

function styleKey(property: string) {
  return /^[A-Za-z_$][\w$]*$/.test(property) ? property : JSON.stringify(property);
}

export function updateInlineStyles(source: string, start: number, end: number, values: Record<string, string | number>): string {
  const element = elementAt(source, start, end);
  const magic = new MagicString(source);
  const normalized = Object.fromEntries(Object.entries(values).map(([property, value]) => [normalizedStyleProperty(property), value]));
  applyInlineStyles(magic, source, element, normalized);
  return magic.toString();
}

function styleObject(values: Record<string, string | number>) {
  return `{ ${Object.entries(values).map(([property, value]) => `${styleKey(normalizedStyleProperty(property))}: ${literal(value)}`).join(", ")} }`;
}

type MapCallback = ArrowFunctionExpression | FunctionExpression;

interface InstanceTarget {
  element: JSXElement;
  callback: MapCallback;
  /** True when the element sits among JSX children, where a guard has to be wrapped in braces. */
  inJsxChildren: boolean;
}

/** One JSX element can render many elements on screen. Editing it edits all of them at once, which
 * is almost never what a click on a single card or button means, so every per-copy edit starts here:
 * the nearest `Array.map` callback is what tells one rendered copy from its siblings. */
function instanceTarget(source: string, start: number, end: number): InstanceTarget {
  let element: JSXElement | undefined;
  let callback: MapCallback | undefined;
  let inJsxChildren = false;
  traverse(ast(source), {
    JSXElement(path) {
      if (path.node.start !== start || path.node.end !== end) return;
      element = path.node;
      inJsxChildren = path.parent.type === "JSXElement" || path.parent.type === "JSXFragment";
      let parent: typeof path.parentPath | null = path.parentPath;
      while (parent) {
        if ((parent.isArrowFunctionExpression() || parent.isFunctionExpression()) && parent.parentPath?.isCallExpression()) {
          const callee = parent.parentPath.node.callee;
          if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier" && callee.property.name === "map") {
            callback = parent.node;
            break;
          }
        }
        parent = parent.parentPath;
      }
    },
  });
  if (!element) throw new Error("Il nodo JSX non esiste più: aggiorna la preview prima di modificare.");
  if (!callback) throw new Error("Questa copia non arriva da una lista ma da un componente riusato: l'editor può cambiarle solo tutte insieme. Passa a «Tutte le copie» oppure modifica il punto in cui il componente viene usato.");
  return { element, callback, inJsxChildren };
}

/** Names the callback's index parameter, adding it when the list does not already declare one. */
function ensureIndexName(magic: MagicString, source: string, callback: MapCallback): string {
  if (callback.params.some((param) => param.type === "RestElement")) {
    throw new Error("La funzione della lista raccoglie i parametri con ...: l'indice va aggiunto a mano dal codice.");
  }
  const second = callback.params[1];
  if (second?.type === "Identifier") return second.name;
  if (second) throw new Error("L'indice della lista usa una struttura non modificabile visualmente.");
  let indexName = "__framecraftIndex";
  let suffix = 2;
  const callbackSource = callback.start != null && callback.end != null ? source.slice(callback.start, callback.end) : source;
  while (callbackSource.includes(indexName)) indexName = `__framecraftIndex${suffix++}`;
  const first = callback.params[0];
  if (first?.start != null && first.end != null && callback.body.start != null && callback.start != null) {
    const before = source.slice(callback.start, first.start);
    const after = source.slice(first.end, callback.body.start);
    if (before.includes("(") && after.includes(")")) magic.appendLeft(first.end, `, ${indexName}`);
    else magic.overwrite(first.start, first.end, `(${source.slice(first.start, first.end)}, ${indexName})`);
  } else if (!first && callback.start != null && callback.body.start != null) {
    const signature = source.slice(callback.start, callback.body.start);
    const open = signature.indexOf("(");
    if (open < 0) throw new Error("La funzione della lista non espone parametri modificabili.");
    magic.appendLeft(callback.start + open + 1, indexName);
  } else {
    throw new Error("La funzione della lista non espone un indice modificabile.");
  }
  return indexName;
}

function listIndex(instanceIndex: number) {
  // A guard written against a missing index would compile to `i === NaN`, which is never true: the
  // edit would land nowhere and look like the editor had ignored it.
  if (!Number.isFinite(instanceIndex)) throw new Error("L'anteprima non ha detto quale copia è selezionata: riseleziona l'elemento nel canvas.");
  return Math.max(0, Math.floor(instanceIndex));
}

/** Editing the same copy twice must not stack one guard inside the other, so an existing guard for
 * this very index is rewritten in place. */
function guardedValue(expression: Expression, indexName: string, index: number) {
  if (expression.type !== "ConditionalExpression") return undefined;
  const test = expression.test;
  if (test.type !== "BinaryExpression" || test.operator !== "===") return undefined;
  if (test.left.type !== "Identifier" || test.left.name !== indexName) return undefined;
  if (test.right.type !== "NumericLiteral" || test.right.value !== index) return undefined;
  const { start, end } = expression.consequent;
  return start == null || end == null ? undefined : { start, end };
}

/** Adds an index parameter to the nearest Array.map callback when needed and applies the style only
 * when that callback renders the DOM instance selected in the preview. */
export function updateInlineStylesForInstance(source: string, start: number, end: number, values: Record<string, string | number>, instanceIndex: number): string {
  const { element, callback } = instanceTarget(source, start, end);
  const magic = new MagicString(source);
  const indexName = ensureIndexName(magic, source, callback);
  const index = listIndex(instanceIndex);
  const styleAttribute = attributeNamed(element, "style");
  const patch = styleObject(values);
  if (!styleAttribute) {
    const insertion = element.openingElement.end! - (element.openingElement.selfClosing ? 2 : 1);
    magic.appendLeft(insertion, ` style={${indexName} === ${index} ? ${patch} : undefined}`);
  } else if (styleAttribute.value?.type === "JSXExpressionContainer" && styleAttribute.value.expression.type !== "JSXEmptyExpression") {
    const expression = styleAttribute.value.expression;
    const expressionStart = expression.start;
    const expressionEnd = expression.end;
    if (typeof expressionStart !== "number" || typeof expressionEnd !== "number") throw new Error("Intervallo style non disponibile.");
    const original = source.slice(expressionStart, expressionEnd);
    magic.overwrite(expressionStart, expressionEnd, `{ ...(${original}), ...(${indexName} === ${index} ? ${patch} : {}) }`);
  } else {
    throw new Error("Lo style esistente non è modificabile visualmente.");
  }
  return magic.toString();
}

/** Rewrites the text of one rendered copy: the other items of the list keep the value they had. */
export function updateStaticTextForInstance(source: string, start: number, end: number, value: string, instanceIndex: number): string {
  const { element, callback } = instanceTarget(source, start, end);
  const magic = new MagicString(source);
  const indexName = ensureIndexName(magic, source, callback);
  const index = listIndex(instanceIndex);
  const run = textRun(element);
  if (run) {
    const { leading, trailing } = padding(run.value);
    magic.overwrite(run.start!, run.end!, `${leading}{${indexName} === ${index} ? ${JSON.stringify(value)} : ${JSON.stringify(run.value.trim())}}${trailing}`);
    return magic.toString();
  }
  if (elementChildren(element).length) {
    throw new Error("Il testo di questo elemento sta dentro gli elementi figli: clicca direttamente la scritta per modificarla.");
  }
  const expression = singleExpressionChild(element);
  if (!expression) throw new Error("Questo elemento non contiene un testo modificabile.");
  const existing = guardedValue(expression, indexName, index);
  if (existing) magic.overwrite(existing.start, existing.end, JSON.stringify(value));
  else magic.overwrite(expression.start!, expression.end!, `${indexName} === ${index} ? ${JSON.stringify(value)} : ${source.slice(expression.start!, expression.end!)}`);
  return magic.toString();
}

/** Same idea for attributes: the value is written as a guard so only the selected copy changes. */
export function updateStaticAttributesForInstance(source: string, start: number, end: number, values: Record<string, string>, instanceIndex: number): string {
  const { element, callback } = instanceTarget(source, start, end);
  const magic = new MagicString(source);
  const indexName = ensureIndexName(magic, source, callback);
  const index = listIndex(instanceIndex);
  const missing: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    if (!/^[A-Za-z_$][\w$-]*(?::[A-Za-z_$][\w$-]*)?$/.test(name)) throw new Error(`Nome attributo non valido: ${name}`);
    if (name === "style") throw new Error("Lo stile si modifica dalle sezioni Aspetto, Layout e Dimensioni.");
    const next = JSON.stringify(value);
    const attribute = attributeNamed(element, name);
    if (!attribute) { missing.push(`${name}={${indexName} === ${index} ? ${next} : undefined}`); continue; }
    const current = attribute.value;
    if (current?.type === "JSXExpressionContainer" && current.expression.type !== "JSXEmptyExpression" && current.expression.start != null && current.expression.end != null) {
      const expression = current.expression;
      const existing = guardedValue(expression, indexName, index);
      if (existing) magic.overwrite(existing.start, existing.end, next);
      else magic.overwrite(expression.start!, expression.end!, `${indexName} === ${index} ? ${next} : ${source.slice(expression.start!, expression.end!)}`);
      continue;
    }
    const original = current?.type === "StringLiteral" ? JSON.stringify(current.value) : "true";
    magic.overwrite(attribute.start!, attribute.end!, `${name}={${indexName} === ${index} ? ${next} : ${original}}`);
  }
  if (missing.length) {
    const insertion = element.openingElement.end! - (element.openingElement.selfClosing ? 2 : 1);
    magic.appendLeft(insertion, ` ${missing.join(" ")}`);
  }
  return magic.toString();
}

function applyInlineStyles(magic: MagicString, source: string, element: JSXElement, values: Record<string, string | number>) {
  const styleAttribute = element.openingElement.attributes.find(
    (attribute) => attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" && attribute.name.name === "style",
  );
  if (!styleAttribute) {
    const insertion = element.openingElement.end! - (element.openingElement.selfClosing ? 2 : 1);
    const properties = Object.entries(values).map(([property, value]) => `${styleKey(property)}: ${literal(value)}`).join(", ");
    magic.appendLeft(insertion, ` style={{ ${properties} }}`);
    return;
  }
  if (styleAttribute.type !== "JSXAttribute" || styleAttribute.value?.type !== "JSXExpressionContainer" || styleAttribute.value.expression.type === "JSXEmptyExpression") {
    throw new Error("Lo style esistente non è modificabile visualmente.");
  }
  const expression = styleAttribute.value.expression;
  if (expression.type !== "ObjectExpression") {
    if (expression.start == null || expression.end == null) throw new Error("Intervallo style non disponibile.");
    const properties = Object.entries(values).map(([property, value]) => `${styleKey(property)}: ${literal(value)}`).join(", ");
    magic.overwrite(expression.start, expression.end, `{ ...(${source.slice(expression.start, expression.end)}), ${properties} }`);
    return;
  }
  const object = expression as ObjectExpression;
  const remaining = new Map(Object.entries(values));
  for (const item of object.properties) {
    if (item.type !== "ObjectProperty" || item.computed) continue;
    const key = item.key.type === "Identifier" ? item.key.name : item.key.type === "StringLiteral" ? item.key.value : "";
    const value = remaining.get(key);
    if (value !== undefined) {
      if (item.value.start == null || item.value.end == null) throw new Error("Intervallo style non disponibile.");
      magic.overwrite(item.value.start, item.value.end, literal(value));
      remaining.delete(key);
    }
  }
  if (!remaining.size) return;
  let insertAt = object.end! - 1;
  while (insertAt > object.start! && /\s/.test(source[insertAt - 1])) insertAt -= 1;
  const properties = [...remaining].map(([property, value]) => `${styleKey(property)}: ${literal(value)}`).join(", ");
  magic.appendLeft(insertAt, `${object.properties.length ? ", " : ""}${properties}`);
}

export function updateInlineStyle(source: string, start: number, end: number, property: string, value: string | number): string {
  return updateInlineStyles(source, start, end, { [property]: value });
}

function parses(source: string): boolean {
  try { ast(source); return true; } catch { return false; }
}

export interface DeletionResult {
  source: string;
  /** True when the element could only be neutralised, not cut out: the expression around it stays. */
  emptied: boolean;
}

/** An element is not always free to remove. The body of a `.map()` callback, a `return`, a branch of
 * a ternary: cutting any of those out leaves `()` or `return ;`, code no parser accepts, and the
 * edit dies with a message about an unexpected token instead of doing what the user asked. When a
 * plain removal would not compile, the element becomes `null`: the expression around it survives, it
 * renders nothing, and undo puts it back. */
export function deleteElement(source: string, start: number, end: number): DeletionResult {
  elementAt(source, start, end);
  // Removing only the element leaves its indentation behind, so repeated deletes pile up blank lines.
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const lineBreak = source.indexOf("\n", end);
  const lineEnd = lineBreak === -1 ? source.length : lineBreak + 1;
  const aloneOnItsLine = !source.slice(lineStart, start).trim() && !source.slice(end, lineEnd).trim();
  const removed = aloneOnItsLine
    ? new MagicString(source).remove(lineStart, lineEnd).toString()
    : new MagicString(source).remove(start, end).toString();
  if (parses(removed)) return { source: removed, emptied: false };
  const emptied = new MagicString(source).overwrite(start, end, "null").toString();
  if (parses(emptied)) return { source: emptied, emptied: true };
  throw new Error("Questo elemento non può essere eliminato da solo: apri il codice per rimuovere il blocco che lo contiene.");
}

/** Deleting an element that a list repeats used to blank the whole list: cutting the body of a
 * `.map()` callback leaves code no parser accepts, so the element became `null` and every copy
 * disappeared at once. Guarding on the index removes the one copy the user actually selected. */
export function deleteElementInstance(source: string, start: number, end: number, instanceIndex: number): string {
  const { callback, inJsxChildren } = instanceTarget(source, start, end);
  const magic = new MagicString(source);
  const indexName = ensureIndexName(magic, source, callback);
  const guard = `${indexName} === ${listIndex(instanceIndex)} ? null : ${source.slice(start, end)}`;
  magic.overwrite(start, end, inJsxChildren ? `{${guard}}` : guard);
  const next = magic.toString();
  if (!parses(next)) throw new Error("Questa copia non può essere rimossa da sola: apri il codice per modificare la lista.");
  return next;
}

/** Takes attributes off an element, which is how a binding or a flag is undone. */
export function removeStaticAttributes(source: string, start: number, end: number, names: string[]): string {
  const element = elementAt(source, start, end);
  const magic = new MagicString(source);
  let removed = 0;
  for (const name of names) {
    const attribute = attributeNamed(element, name);
    if (attribute?.start == null || attribute.end == null) continue;
    // The space before the attribute goes with it, or every removal leaves a gap behind.
    const from = /\s/.test(source[attribute.start - 1] ?? "") ? attribute.start - 1 : attribute.start;
    magic.remove(from, attribute.end);
    removed += 1;
  }
  if (!removed) return source;
  const next = magic.toString();
  if (!parses(next)) throw new Error("L'attributo non puo' essere rimosso da solo: apri il codice.");
  return next;
}

/** Rewrites one literal in place — the page a button opens, the value it writes — and refuses the
 * result unless it still parses, so a bad value can never reach the file. */
export function replaceSourceRange(source: string, start: number, end: number, replacement: string): string {
  if (start < 0 || end > source.length || start >= end) throw new Error("Il valore da modificare non esiste più: aggiorna l'anteprima e riprova.");
  const next = new MagicString(source).overwrite(start, end, replacement).toString();
  if (!parses(next)) throw new Error("Questo valore non è scrivibile qui: apri il codice per modificarlo.");
  return next;
}

export function insertElement(source: string, start: number, end: number, jsx: string): string {
  const element = elementAt(source, start, end);
  if (!element.closingElement?.start) throw new Error("Non è possibile inserire figli in un elemento self-closing.");
  return new MagicString(source).appendLeft(element.closingElement.start, `\n${jsx}`).toString();
}

function positionedJsx(jsx: string, x: number, y: number) {
  const prefix = "const __framecraft_component = (\n";
  const suffix = "\n);";
  const wrapped = `${prefix}${jsx.trim()}${suffix}`;
  let root: JSXElement | undefined;
  traverse(ast(wrapped), {
    JSXElement(path) {
      if (!root) root = path.node;
    },
  });
  if (!root) throw new Error("Il componente trascinato non contiene un elemento JSX valido.");
  const magic = new MagicString(wrapped);
  applyInlineStyles(magic, wrapped, root, {
    position: "absolute",
    left: `${Math.max(0, Math.round(x))}px`,
    top: `${Math.max(0, Math.round(y))}px`,
    margin: "0px",
    zIndex: 1,
  });
  const positioned = magic.toString();
  return positioned.slice(prefix.length, positioned.length - suffix.length);
}

export function insertElementAtPosition(source: string, start: number, end: number, jsx: string, x: number, y: number, positionContainer: boolean): string {
  const element = elementAt(source, start, end);
  if (!element.closingElement?.start) throw new Error("Non è possibile inserire figli in un elemento self-closing.");
  const magic = new MagicString(source);
  if (positionContainer) applyInlineStyles(magic, source, element, { position: "relative" });
  magic.appendLeft(element.closingElement.start, `\n${positionedJsx(jsx, x, y)}`);
  return magic.toString();
}

export function duplicateElement(source: string, start: number, end: number): string {
  elementAt(source, start, end);
  return new MagicString(source).appendRight(end, source.slice(start, end)).toString();
}

export function reorderElement(source: string, start: number, end: number, direction: -1 | 1): string {
  let siblings: JSXElement[] = [];
  let index = -1;
  traverse(ast(source), {
    JSXElement(path) {
      if (path.node.start !== start || path.node.end !== end || path.parent.type !== "JSXElement") return;
      siblings = path.parent.children.filter((child): child is JSXElement => child.type === "JSXElement");
      index = siblings.indexOf(path.node);
    },
  });
  const other = siblings[index + direction];
  const current = siblings[index];
  if (!current || !other || current.start == null || current.end == null || other.start == null || other.end == null) {
    throw new Error("L'elemento non può essere spostato oltre questo limite.");
  }
  const first = direction < 0 ? other : current;
  const second = direction < 0 ? current : other;
  const between = source.slice(first.end!, second.start!);
  const replacement = `${source.slice(second.start!, second.end!)}${between}${source.slice(first.start!, first.end!)}`;
  return new MagicString(source).overwrite(first.start!, second.end!, replacement).toString();
}
