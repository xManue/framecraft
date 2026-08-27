import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { JSXAttribute, JSXElement, ObjectExpression } from "@babel/types";
import MagicString from "magic-string";

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

function highlightHandler(targetId: string, color: string, width: number) {
  return `{() => { const target = document.querySelector(${JSON.stringify(`[data-fc-highlight-id="${targetId}"]`)}); if (target instanceof HTMLElement || target instanceof SVGElement) { const active = target.dataset.fcHighlightActive === "true"; if (active) { target.style.outline = target.dataset.fcPreviousOutline ?? ""; target.style.outlineOffset = target.dataset.fcPreviousOutlineOffset ?? ""; target.style.boxShadow = target.dataset.fcPreviousBoxShadow ?? ""; } else { target.dataset.fcPreviousOutline = target.style.outline; target.dataset.fcPreviousOutlineOffset = target.style.outlineOffset; target.dataset.fcPreviousBoxShadow = target.style.boxShadow; target.style.outline = ${JSON.stringify(`${width}px solid ${color}`)}; target.style.outlineOffset = "3px"; target.style.boxShadow = ${JSON.stringify(`0 0 0 4px ${color}33`)}; target.scrollIntoView({ behavior: "smooth", block: "center" }); } target.dataset.fcHighlightActive = String(!active); } }}`;
}

function triggerAttributes(targetId: string, color: string, width: number) {
  return {
    "data-fc-highlight-target": JSON.stringify(targetId),
    "data-fc-highlight-color": JSON.stringify(color),
    "data-fc-highlight-width": JSON.stringify(String(width)),
    onClick: highlightHandler(targetId, color, width),
  };
}

function ensureReplaceableClick(element: JSXElement) {
  if (attributeNamed(element, "onClick") && !attributeNamed(element, "data-fc-highlight-target")) {
    throw new Error("Questo elemento ha già un'azione al click personalizzata. Apri il codice per combinarla senza sovrascriverla.");
  }
}

export interface HighlightOptions {
  targetId: string;
  color: string;
  width: number;
}

export function addHighlightTarget(source: string, start: number, end: number, targetId: string): string {
  const target = elementAt(source, start, end);
  const magic = new MagicString(source);
  updateAttributes(magic, target, { "data-fc-highlight-id": JSON.stringify(targetId) });
  return magic.toString();
}

export function addHighlightTrigger(source: string, start: number, end: number, options: HighlightOptions): string {
  const trigger = elementAt(source, start, end);
  ensureReplaceableClick(trigger);
  const magic = new MagicString(source);
  updateAttributes(magic, trigger, triggerAttributes(options.targetId, options.color, options.width));
  return magic.toString();
}

export function addHighlightInteraction(source: string, triggerStart: number, triggerEnd: number, targetStart: number, targetEnd: number, options: HighlightOptions): string {
  const trigger = elementAt(source, triggerStart, triggerEnd);
  const target = triggerStart === targetStart && triggerEnd === targetEnd ? trigger : elementAt(source, targetStart, targetEnd);
  ensureReplaceableClick(trigger);
  const magic = new MagicString(source);
  if (trigger === target) {
    updateAttributes(magic, trigger, { "data-fc-highlight-id": JSON.stringify(options.targetId), ...triggerAttributes(options.targetId, options.color, options.width) });
  } else {
    updateAttributes(magic, target, { "data-fc-highlight-id": JSON.stringify(options.targetId) });
    updateAttributes(magic, trigger, triggerAttributes(options.targetId, options.color, options.width));
  }
  return magic.toString();
}

export function updateHighlightTrigger(source: string, start: number, end: number, options: HighlightOptions): string {
  const trigger = elementAt(source, start, end);
  if (!attributeNamed(trigger, "data-fc-highlight-target")) throw new Error("L'elemento selezionato non contiene un'evidenziazione modificabile.");
  const magic = new MagicString(source);
  updateAttributes(magic, trigger, triggerAttributes(options.targetId, options.color, options.width));
  return magic.toString();
}

export function removeHighlightTrigger(source: string, start: number, end: number): string {
  const trigger = elementAt(source, start, end);
  if (!attributeNamed(trigger, "data-fc-highlight-target")) return source;
  const magic = new MagicString(source);
  for (const name of ["data-fc-highlight-target", "data-fc-highlight-color", "data-fc-highlight-width", "onClick"]) {
    const attribute = attributeNamed(trigger, name);
    if (attribute?.start != null && attribute.end != null) magic.remove(attribute.start, attribute.end);
  }
  return magic.toString();
}

/** Mirrors what parseSource treats as a static value, so the Inspector never offers a field it
 * cannot then write back. */
function holdsStaticValue(attribute: JSXAttribute): boolean {
  if (!attribute.value) return true;
  if (attribute.value.type === "StringLiteral") return true;
  if (attribute.value.type !== "JSXExpressionContainer") return false;
  const expression = attribute.value.expression;
  return expression.type === "StringLiteral" || expression.type === "NumericLiteral" || expression.type === "BooleanLiteral";
}

/** A JSX string literal cannot contain a double quote and decodes HTML entities, so a value with
 * either is written as an expression container, which round-trips exactly. */
function attributeLiteral(value: string): string {
  return /^[^"&<>\r\n]*$/.test(value) ? `"${value}"` : `{${JSON.stringify(value)}}`;
}

/** Only attributes that already hold a literal — or are absent altogether — are rewritten. An
 * expression-backed attribute keeps whatever logic the author wrote and stays code-only. */
export function updateStaticAttributes(source: string, start: number, end: number, values: Record<string, string>): string {
  const element = elementAt(source, start, end);
  const patch: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (!/^[A-Za-z_$][\w$-]*(?::[A-Za-z_$][\w$-]*)?$/.test(name)) throw new Error(`Nome attributo non valido: ${name}`);
    if (name === "style") throw new Error("Lo stile si modifica dalle sezioni Aspetto, Layout e Dimensioni.");
    const existing = attributeNamed(element, name);
    if (existing && !holdsStaticValue(existing)) {
      throw new Error(`L'attributo ${name} ha un valore dinamico: modificalo in modalità Code.`);
    }
    patch[name] = attributeLiteral(value);
  }
  const magic = new MagicString(source);
  updateAttributes(magic, element, patch);
  return magic.toString();
}

export function updateStaticText(source: string, start: number, end: number, value: string): string {
  const element = elementAt(source, start, end);
  const meaningful = element.children.filter((child) => child.type !== "JSXText" || child.value.trim());
  if (meaningful.length !== 1 || meaningful[0]?.type !== "JSXText" || meaningful[0].start == null || meaningful[0].end == null) {
    throw new Error("Il testo è dinamico e può essere modificato solo in modalità Code.");
  }
  const original = meaningful[0].value;
  const leading = original.match(/^\s*/)?.[0] ?? "";
  const trailing = original.match(/\s*$/)?.[0] ?? "";
  return new MagicString(source).overwrite(meaningful[0].start, meaningful[0].end, `${leading}${value}${trailing}`).toString();
}

function literal(value: string | number): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

export function updateInlineStyles(source: string, start: number, end: number, values: Record<string, string | number>): string {
  const element = elementAt(source, start, end);
  const magic = new MagicString(source);
  applyInlineStyles(magic, source, element, values);
  return magic.toString();
}

function applyInlineStyles(magic: MagicString, source: string, element: JSXElement, values: Record<string, string | number>) {
  const styleAttribute = element.openingElement.attributes.find(
    (attribute) => attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" && attribute.name.name === "style",
  );
  if (!styleAttribute) {
    const insertion = element.openingElement.end! - (element.openingElement.selfClosing ? 2 : 1);
    const properties = Object.entries(values).map(([property, value]) => `${property}: ${literal(value)}`).join(", ");
    magic.appendLeft(insertion, ` style={{ ${properties} }}`);
    return;
  }
  if (styleAttribute.type !== "JSXAttribute" || styleAttribute.value?.type !== "JSXExpressionContainer" || styleAttribute.value.expression.type === "JSXEmptyExpression") {
    throw new Error("Lo style esistente non è modificabile visualmente.");
  }
  const expression = styleAttribute.value.expression;
  if (expression.type !== "ObjectExpression") {
    if (expression.start == null || expression.end == null) throw new Error("Intervallo style non disponibile.");
    const properties = Object.entries(values).map(([property, value]) => `${property}: ${literal(value)}`).join(", ");
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
  const properties = [...remaining].map(([property, value]) => `${property}: ${literal(value)}`).join(", ");
  magic.appendLeft(insertAt, `${object.properties.length ? ", " : ""}${properties}`);
}

export function updateInlineStyle(source: string, start: number, end: number, property: string, value: string | number): string {
  return updateInlineStyles(source, start, end, { [property]: value });
}

export function deleteElement(source: string, start: number, end: number): string {
  elementAt(source, start, end);
  // Removing only the element leaves its indentation behind, so repeated deletes pile up blank lines.
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const lineBreak = source.indexOf("\n", end);
  const lineEnd = lineBreak === -1 ? source.length : lineBreak + 1;
  const aloneOnItsLine = !source.slice(lineStart, start).trim() && !source.slice(end, lineEnd).trim();
  return aloneOnItsLine
    ? new MagicString(source).remove(lineStart, lineEnd).toString()
    : new MagicString(source).remove(start, end).toString();
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
