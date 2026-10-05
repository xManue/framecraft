import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { ArrayExpression, Expression, JSXElement, ObjectExpression } from "@babel/types";
import MagicString from "magic-string";

const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

function ast(source: string) {
  return parse(source, { sourceType: "module", errorRecovery: true, plugins: ["jsx", "typescript", "decorators-legacy", "classProperties", "topLevelAwait"] });
}

function strict(source: string) {
  return parse(source, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"] });
}

function parses(source: string) {
  try { strict(source); return true; } catch { return false; }
}

/** How an element reaches the list that draws it: the array's name, where that array is declared,
 * and which property of the item the element displays. */
export interface ListReference {
  name: string;
  /** Set when the array literal is written in this same file. */
  local?: { start: number; end: number };
  /** Import specifier when the array comes from another module, with the name used there. */
  from?: { specifier: string; exported: string };
  itemName?: string;
  destructured: string[];
  /** Property the element shows, when its content is one property of the item. */
  textProperty?: string;
}

export interface ListItemProperty {
  name: string;
  kind: "text" | "number" | "boolean";
  value: string;
  start: number;
  end: number;
}

export interface ListItem {
  index: number;
  start: number;
  end: number;
  properties: ListItemProperty[];
}

export interface ListArray {
  start: number;
  end: number;
  items: ListItem[];
}

function propertyOfExpression(expression: Expression, itemName: string | undefined, destructured: string[]): string | undefined {
  if (expression.type === "MemberExpression" && !expression.computed && expression.object.type === "Identifier"
    && expression.object.name === itemName && expression.property.type === "Identifier") return expression.property.name;
  if (expression.type === "Identifier" && destructured.includes(expression.name)) return expression.name;
  return undefined;
}

function displayedExpression(element: JSXElement): Expression | undefined {
  const meaningful = element.children.filter((child) => child.type !== "JSXText" || child.value.trim());
  const only = meaningful.length === 1 ? meaningful[0] : undefined;
  if (only?.type !== "JSXExpressionContainer" || only.expression.type === "JSXEmptyExpression") return undefined;
  return only.expression;
}

/** Reads the `.map()` that draws an element and says where its data comes from. */
export function listReference(source: string, start: number, end: number): ListReference | undefined {
  let reference: ListReference | undefined;
  let element: JSXElement | undefined;
  traverse(ast(source), {
    JSXElement(path) {
      if (path.node.start !== start || path.node.end !== end) return;
      element = path.node;
      let parent: typeof path.parentPath | null = path.parentPath;
      while (parent) {
        if ((parent.isArrowFunctionExpression() || parent.isFunctionExpression()) && parent.parentPath?.isCallExpression()) {
          const call = parent.parentPath.node;
          const callee = call.callee;
          if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier"
            && callee.property.name === "map" && callee.object.type === "Identifier") {
            const [first] = parent.node.params;
            const destructured: string[] = [];
            if (first?.type === "ObjectPattern") {
              for (const property of first.properties) {
                if (property.type === "ObjectProperty" && property.key.type === "Identifier") destructured.push(property.key.name);
              }
            }
            reference = {
              name: callee.object.name,
              itemName: first?.type === "Identifier" ? first.name : undefined,
              destructured,
            };
          }
          break;
        }
        parent = parent.parentPath;
      }
    },
  });
  if (!reference) return undefined;

  const declaration = arrayDeclaration(source, reference.name);
  reference.local = declaration.local;
  reference.from = declaration.from;

  const displayed = element ? displayedExpression(element) : undefined;
  if (displayed) reference.textProperty = propertyOfExpression(displayed, reference.itemName, reference.destructured);
  return reference;
}

/** Where a name holding an array comes from in a file: a literal written here, or an import. A name
 * that is neither is a prop, and only the file that renders this component knows what it holds. */
export function arrayDeclaration(source: string, name: string): { local?: { start: number; end: number }; from?: { specifier: string; exported: string } } {
  const found: { local?: { start: number; end: number }; from?: { specifier: string; exported: string } } = {};
  traverse(ast(source), {
    VariableDeclarator(path) {
      if (path.node.id.type !== "Identifier" || path.node.id.name !== name) return;
      if (path.node.init?.type !== "ArrayExpression" || path.node.init.start == null || path.node.init.end == null) return;
      found.local = { start: path.node.init.start, end: path.node.init.end };
    },
    ImportDeclaration(path) {
      for (const specifier of path.node.specifiers) {
        if (specifier.local.name !== name) continue;
        found.from = {
          specifier: path.node.source.value,
          exported: specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier" ? specifier.imported.name
            : specifier.type === "ImportDefaultSpecifier" ? "default" : name,
        };
      }
    },
  });
  return found;
}

/** Reads the values of one row. Nested objects are read too, under a dotted name: on an HMI panel
 * what a part highlights and where its marker sits live in `highlight` and `marker`, and hiding them
 * would leave the most interesting half of the row unreachable. */
function readProperties(object: ObjectExpression, prefix: string, depth: number, into: ListItemProperty[]) {
  for (const property of object.properties) {
    if (property.type !== "ObjectProperty" || property.computed) continue;
    const key = property.key.type === "Identifier" ? property.key.name : property.key.type === "StringLiteral" ? property.key.value : "";
    const value = property.value;
    if (!key || value.start == null || value.end == null) continue;
    const name = prefix ? `${prefix}.${key}` : key;
    if (value.type === "StringLiteral") into.push({ name, kind: "text", value: value.value, start: value.start, end: value.end });
    else if (value.type === "NumericLiteral") into.push({ name, kind: "number", value: String(value.value), start: value.start, end: value.end });
    else if (value.type === "BooleanLiteral") into.push({ name, kind: "boolean", value: String(value.value), start: value.start, end: value.end });
    else if (value.type === "ObjectExpression" && depth > 0) readProperties(value, name, depth - 1, into);
  }
}

function readItems(array: ArrayExpression): ListItem[] {
  const items: ListItem[] = [];
  for (const [index, element] of array.elements.entries()) {
    if (!element || element.start == null || element.end == null) continue;
    const properties: ListItemProperty[] = [];
    if (element.type === "ObjectExpression") {
      readProperties(element, "", 2, properties);
    } else if (element.type === "StringLiteral") {
      properties.push({ name: "valore", kind: "text", value: element.value, start: element.start, end: element.end });
    }
    items.push({ index, start: element.start, end: element.end, properties });
  }
  return items;
}

/** The array literal a name is bound to, wherever it is declared or exported in a module. */
export function findArrayLiteral(source: string, name: string, range?: { start: number; end: number }): ListArray | undefined {
  let found: ArrayExpression | undefined;
  traverse(ast(source), {
    VariableDeclarator(path) {
      if (path.node.init?.type !== "ArrayExpression") return;
      if (range) {
        if (path.node.init.start !== range.start || path.node.init.end !== range.end) return;
      } else if (path.node.id.type !== "Identifier" || path.node.id.name !== name) return;
      found = path.node.init;
    },
  });
  if (!found || found.start == null || found.end == null) return undefined;
  return { start: found.start, end: found.end, items: readItems(found) };
}

/** What the search of an array through the project needs: who renders a file, and what one of its
 * imports points at. Both are supplied by the editor, so the search itself stays pure. */
export interface ArrayLookup {
  usesOf(file: string): { file: string; source: string; props: Record<string, string> }[];
  load(fromFile: string, specifier: string): Promise<{ file: string; source: string } | undefined>;
}

export interface ResolvedArray {
  file: string;
  source: string;
  array: ListArray;
}

const identifier = /^[A-Za-z_$][\w$]*$/;

/** Follows a list name to the array literal that feeds it, however many components it is handed
 * through. A menu popup draws `items`, which the shell fills with `mainMenuItems`, which the panel
 * fills from its data file: stopping at the first step left every one of those buttons without the
 * row that says which page it opens. */
export async function resolveListArray(file: string, source: string, name: string, lookup: ArrayLookup,
  known?: { local?: { start: number; end: number }; from?: { specifier: string; exported: string } }, depth = 5): Promise<ResolvedArray | undefined> {
  const declaration = known?.local || known?.from ? known : arrayDeclaration(source, name);
  if (declaration.local) {
    const array = findArrayLiteral(source, name, declaration.local);
    if (array) return { file, source, array };
  }
  if (declaration.from) {
    const loaded = await lookup.load(file, declaration.from.specifier);
    if (!loaded) return undefined;
    const exported = declaration.from.exported === "default" ? name : declaration.from.exported;
    const array = findArrayLiteral(loaded.source, exported);
    return array ? { file: loaded.file, source: loaded.source, array } : undefined;
  }
  // The name is a prop: only the panels that render this file know what it holds.
  if (depth <= 0) return undefined;
  const uses = lookup.usesOf(file);
  const passed = [...new Set(uses.map((use) => use.props[name]).filter(Boolean))];
  // Two panels filling the same list with different data have no single answer, and picking one of
  // them would present a guess as the row the user is editing.
  const expression = passed.length === 1 ? passed[0] : undefined;
  const use = expression ? uses.find((candidate) => candidate.props[name] === expression) : undefined;
  if (!use || !expression || !identifier.test(expression)) return undefined;
  return resolveListArray(use.file, use.source, expression, lookup, undefined, depth - 1);
}

function arrayAt(source: string, start: number, end: number): ArrayExpression {
  let found: ArrayExpression | undefined;
  traverse(ast(source), {
    ArrayExpression(path) {
      if (path.node.start === start && path.node.end === end) found = path.node;
    },
  });
  if (!found) throw new Error("La lista di dati non esiste più: aggiorna l'anteprima e riprova.");
  return found;
}

/** Removes one item from the data. Every list drawn from this array loses that row, which is the
 * point: the row is gone because the thing it described is gone. */
export function removeListItem(source: string, start: number, end: number, index: number): string {
  const array = arrayAt(source, start, end);
  const item = array.elements[index];
  if (!item || item.start == null || item.end == null) throw new Error(`La lista non ha una voce numero ${index + 1}.`);
  const next = array.elements[index + 1];
  const previous = array.elements[index - 1];
  const magic = new MagicString(source);
  if (next?.start != null) magic.remove(item.start, next.start);
  else if (previous?.end != null) magic.remove(previous.end, item.end);
  else magic.remove(array.start! + 1, array.end! - 1);
  const result = magic.toString();
  if (!parses(result)) throw new Error("La voce non può essere rimossa da sola: apri il codice per modificare la lista.");
  return result;
}

/** Copies an item straight after itself, which is how a new row is added to a data-driven list. */
export function duplicateListItem(source: string, start: number, end: number, index: number): string {
  const array = arrayAt(source, start, end);
  const item = array.elements[index];
  if (!item || item.start == null || item.end == null) throw new Error(`La lista non ha una voce numero ${index + 1}.`);
  const lineStart = source.lastIndexOf("\n", item.start - 1) + 1;
  const indent = source.slice(lineStart, item.start).match(/^\s*/)?.[0] ?? "";
  const copy = source.slice(item.start, item.end);
  const result = new MagicString(source).appendLeft(item.end, `,\n${indent}${copy}`).toString();
  if (!parses(result)) throw new Error("La voce non può essere duplicata: apri il codice per modificare la lista.");
  return result;
}

function propertyKey(name: string) {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

/** Rewrites the whole array with the rows given, keeping the indentation the file already uses. It
 * is how a table is filled from the PLC catalog: the placeholder rows a template ships with are
 * replaced by the signals the panel really has. */
export function replaceListItems(source: string, start: number, end: number, items: Record<string, string>[]): string {
  const array = arrayAt(source, start, end);
  const first = array.elements.find((element) => element?.start != null);
  const outerStart = source.lastIndexOf("\n", array.start! - 1) + 1;
  const outerIndent = source.slice(outerStart, array.start!).match(/^\s*/)?.[0] ?? "";
  const itemIndent = first?.start != null
    ? source.slice(source.lastIndexOf("\n", first.start - 1) + 1, first.start).match(/^\s*/)?.[0] ?? `${outerIndent}  `
    : `${outerIndent}  `;
  const body = items
    .map((item) => `${itemIndent}{ ${Object.entries(item).map(([key, value]) => `${propertyKey(key)}: ${JSON.stringify(value)}`).join(", ")} }`)
    .join(",\n");
  const literal = items.length ? `[\n${body},\n${outerIndent}]` : "[]";
  const result = new MagicString(source).overwrite(array.start!, array.end!, literal).toString();
  if (!parses(result)) throw new Error("Le righe non possono essere scritte in questa lista: aprila nel codice.");
  return result;
}

/** Adds, changes or disables the highlight owned by one data row. Disabling keeps the object in
 * place because many existing panels read `part.highlight.type` without optional chaining; an empty
 * path renders nothing and therefore removes the feature without crashing their preview. */
export function setListItemHighlight(source: string, start: number, end: number, index: number, highlight?: { type: string; d: string }): string {
  const array = arrayAt(source, start, end);
  const item = array.elements[index];
  if (!item || item.type !== "ObjectExpression") throw new Error("Questa voce non può contenere un'evidenziazione.");
  const keyOf = (property: ObjectExpression["properties"][number]) => property.type === "ObjectProperty" && !property.computed
    ? property.key.type === "Identifier" ? property.key.name : property.key.type === "StringLiteral" ? property.key.value : ""
    : "";
  const property = item.properties.find((candidate) => keyOf(candidate) === "highlight");
  const values = highlight ?? { type: "none", d: "" };
  const magic = new MagicString(source);
  const separatorFor = (object: ObjectExpression) => {
    const last = object.properties.at(-1);
    if (!last?.end) return "";
    return source.slice(last.end, object.end! - 1).includes(",") ? "" : ",";
  };
  if (!property) {
    if (!highlight) return source;
    const insertion = item.end! - 1;
    magic.appendLeft(insertion, `${item.properties.length ? separatorFor(item) : ""}\n      highlight: { type: ${JSON.stringify(values.type)}, d: ${JSON.stringify(values.d)} }`);
  } else {
    if (property.type !== "ObjectProperty" || property.value.type !== "ObjectExpression") throw new Error("La proprietà highlight esistente non è modificabile visualmente.");
    const object = property.value;
    const existing = new Map(object.properties.map((candidate) => [keyOf(candidate), candidate]));
    for (const [name, value] of Object.entries(values)) {
      const target = existing.get(name);
      if (target?.type === "ObjectProperty" && target.value.start != null && target.value.end != null) magic.overwrite(target.value.start, target.value.end, JSON.stringify(value));
      else magic.appendLeft(object.end! - 1, `${object.properties.length ? `${separatorFor(object)} ` : ""}${name}: ${JSON.stringify(value)}`);
    }
  }
  const result = magic.toString();
  if (!parses(result)) throw new Error("L'evidenziazione non può essere scritta senza rompere la lista.");
  return result;
}
