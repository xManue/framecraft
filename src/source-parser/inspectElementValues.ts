import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { Expression, JSXElement, ObjectExpression } from "@babel/types";
import type { SourceRef } from "../core/types";

const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;
export interface ElementValue { kind: "literal" | "dynamic" | "inherited"; value?: string | number }
const dynamic = (): ElementValue => ({ kind: "dynamic" });
function constant(value: unknown): ElementValue {
  const node = value as Expression;
  if (node?.type === "StringLiteral" || node?.type === "NumericLiteral") return { kind: "literal", value: node.value };
  if (node?.type === "UnaryExpression" && ["-", "+"].includes(node.operator) && node.argument.type === "NumericLiteral") return { kind: "literal", value: node.operator === "-" ? -node.argument.value : node.argument.value };
  if (node?.type === "TemplateLiteral" && !node.expressions.length) return { kind: "literal", value: node.quasis.map(part => part.value.cooked ?? part.value.raw).join("") };
  return dynamic();
}
function styleValue(expression: unknown, key: string, depth = 0): ElementValue {
  const object = expression as ObjectExpression;
  if (object?.type !== "ObjectExpression" || depth > 12) return dynamic();
  let result: ElementValue = { kind: "inherited" };
  for (const item of object.properties) {
    if (item.type === "SpreadElement") {
      const inherited = styleValue(item.argument, key, depth + 1);
      if (inherited.kind !== "inherited") result = inherited;
      continue;
    }
    const name = !item.computed && item.key.type === "Identifier" ? item.key.name : item.key.type === "StringLiteral" ? item.key.value : undefined;
    if (!name) { result = dynamic(); continue; }
    if (name === key) result = item.type === "ObjectProperty" ? constant(item.value) : dynamic();
  }
  return result;
}
export function createElementValueInspector(source: string) {
  const elements = new Map<string, JSXElement>();
  traverse(parse(source, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"] }), {
    JSXElement(path) { elements.set(`${path.node.start}:${path.node.end}`, path.node); },
  });
  return (ref: Pick<SourceRef, "start" | "end">, properties: readonly string[]) => inspectNodeValues(elements.get(`${ref.start}:${ref.end}`), properties);
}
export function inspectElementValues(source: string, ref: Pick<SourceRef, "start" | "end">, properties: readonly string[]) {
  return createElementValueInspector(source)(ref, properties);
}
function inspectNodeValues(element: JSXElement | undefined, properties: readonly string[]) {
  if (!element) throw new Error("L’elemento è cambiato: richiedi una nuova proposta.");
  const target = element as JSXElement, attributes = target.openingElement.attributes;
  const styles = attributes.filter(item => item.type === "JSXAttribute" && item.name.type === "JSXIdentifier" && item.name.name === "style");
  const style = styles[0], styleAt = style ? attributes.indexOf(style) : -1;
  const spreadAfter = attributes.some((item, index) => item.type === "JSXSpreadAttribute" && index > styleAt);
  const expression = style?.type === "JSXAttribute" && style.value?.type === "JSXExpressionContainer" ? style.value.expression : undefined;
  const canEditStyle = styles.length <= 1 && !spreadAfter && (!style || !!expression && expression.type !== "JSXEmptyExpression");
  const values = Object.fromEntries(properties.map(key => [key, spreadAfter ? dynamic() : expression ? styleValue(expression, key) : { kind: "inherited" } as ElementValue]));
  const runs = target.children.filter(child => child.type === "JSXText" && child.value.trim());
  const content = target.children.filter(child => child.type !== "JSXText" || child.value.trim()).filter(child => child.type !== "JSXExpressionContainer" || child.expression.type !== "JSXEmptyExpression");
  const only = content.length === 1 ? content[0] : undefined;
  const text: ElementValue = runs.length === 1 && runs[0].type === "JSXText" ? { kind: "literal", value: runs[0].value.trim() }
    : !content.length ? { kind: "literal", value: "" } : only?.type === "JSXExpressionContainer" ? constant(only.expression) : dynamic();
  return { text, styles: values, canEditStyle, mixedText: runs.length === 1 && content.length > 1 };
}
