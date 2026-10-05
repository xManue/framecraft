import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { Expression, ObjectExpression } from "@babel/types";
import MagicString from "magic-string";

const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

function ast(source: string) {
  return parse(source, { sourceType: "module", errorRecovery: true, plugins: ["jsx", "typescript", "decorators-legacy", "classProperties", "topLevelAwait"] });
}

export type DataValue = string | number | boolean | null | DataValue[] | { [key: string]: DataValue };
export type DataItem = Record<string, DataValue>;

export interface DataList {
  name: string;
  /** The array literal itself, so only that range is ever rewritten. */
  start: number;
  end: number;
  items: DataItem[];
}

/** A value written by hand that is not a plain literal — a call, a variable, a spread. Reading stops
 * there rather than guessing, and writing refuses, so nothing hand-written is quietly thrown away. */
class NotLiteral extends Error {}

function literalOf(node: Expression | null | undefined): DataValue {
  if (!node) throw new NotLiteral();
  if (node.type === "StringLiteral" || node.type === "BooleanLiteral") return node.value;
  if (node.type === "NumericLiteral") return node.value;
  if (node.type === "NullLiteral") return null;
  if (node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "NumericLiteral") return -node.argument.value;
  if (node.type === "ArrayExpression") return node.elements.map((element) => literalOf(element as Expression));
  if (node.type === "ObjectExpression") return objectOf(node);
  throw new NotLiteral();
}

function objectOf(node: ObjectExpression): DataItem {
  const value: DataItem = {};
  for (const property of node.properties) {
    if (property.type !== "ObjectProperty" || property.computed) throw new NotLiteral();
    const key = property.key.type === "Identifier" ? property.key.name : property.key.type === "StringLiteral" ? property.key.value : undefined;
    if (key === undefined) throw new NotLiteral();
    value[key] = literalOf(property.value as Expression);
  }
  return value;
}

/** Reads an exported array of plain objects — the shape a panel keeps its own data in. Returns
 * undefined when the array is not there or is not made of literals the editor can write back. */
export function readDataList(source: string, name: string): DataList | undefined {
  let found: { start: number; end: number; items: DataItem[] } | undefined;
  traverse(ast(source), {
    VariableDeclarator(path) {
      if (path.node.id.type !== "Identifier" || path.node.id.name !== name) return;
      const init = path.node.init;
      if (init?.type !== "ArrayExpression" || init.start == null || init.end == null) return;
      try {
        found = {
          start: init.start,
          end: init.end,
          items: init.elements.map((element) => {
            if (element?.type !== "ObjectExpression") throw new NotLiteral();
            return objectOf(element);
          }),
        };
      } catch (error) {
        if (!(error instanceof NotLiteral)) throw error;
        found = undefined;
      }
      path.stop();
    },
  });
  return found ? { name, ...found } : undefined;
}

const identifier = /^[A-Za-z_$][\w$]*$/;

function printValue(value: DataValue, indent: string): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => printValue(item, indent)).join(", ")}]`;
  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  // Nested objects stay on one line: a hotspot reads as a point, not as a paragraph.
  return `{ ${entries.map(([key, item]) => `${identifier.test(key) ? key : JSON.stringify(key)}: ${printValue(item, indent)}`).join(", ")} }`;
}

function printItem(item: DataItem, indent: string): string {
  const entries = Object.entries(item).filter(([, value]) => value !== undefined);
  const inner = `${indent}  `;
  return `${indent}{\n${entries.map(([key, value]) => `${inner}${identifier.test(key) ? key : JSON.stringify(key)}: ${printValue(value, inner)},`).join("\n")}\n${indent}}`;
}

/** Rewrites the whole array literal from the items given. Only the array is touched: everything else
 * in the file — the other exports, the comments around it — stays exactly as it was. A comment
 * written between two items is the one thing that does not survive. */
export function writeDataList(source: string, list: DataList, items: DataItem[]): string {
  const lineStart = source.lastIndexOf("\n", list.start - 1) + 1;
  const indent = source.slice(lineStart, list.start).match(/^\s*/)?.[0] ?? "";
  const literal = items.length ? `[\n${items.map((item) => printItem(item, `${indent}  `)).join(",\n")},\n${indent}]` : "[]";
  const result = new MagicString(source).overwrite(list.start, list.end, literal).toString();
  try {
    parse(result, { sourceType: "module", plugins: ["jsx", "typescript"] });
  } catch {
    throw new Error(`La lista ${list.name} non può essere riscritta: aprila nel codice e controllala.`);
  }
  return result;
}
