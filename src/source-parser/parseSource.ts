import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { JSXAttribute, JSXElement, JSXIdentifier, JSXMemberExpression, JSXNamespacedName, ObjectExpression } from "@babel/types";
import type { EditorDocument, EditorNode } from "../core/types";

const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

function jsxName(node: JSXIdentifier | JSXMemberExpression | JSXNamespacedName): string {
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXNamespacedName") return `${node.namespace.name}:${node.name.name}`;
  return `${jsxName(node.object)}.${jsxName(node.property)}`;
}

function staticAttribute(attribute: JSXAttribute): string | number | boolean | undefined {
  if (!attribute.value) return true;
  if (attribute.value.type === "StringLiteral") return attribute.value.value;
  if (attribute.value.type !== "JSXExpressionContainer") return undefined;
  const expression = attribute.value.expression;
  if (expression.type === "StringLiteral" || expression.type === "NumericLiteral" || expression.type === "BooleanLiteral") {
    return expression.value;
  }
  return undefined;
}

function readStyles(object: ObjectExpression): Record<string, string | number> {
  const styles: Record<string, string | number> = {};
  for (const property of object.properties) {
    if (property.type !== "ObjectProperty" || property.computed) continue;
    const key = property.key.type === "Identifier" ? property.key.name : property.key.type === "StringLiteral" ? property.key.value : null;
    const value = property.value;
    if (!key || (value.type !== "StringLiteral" && value.type !== "NumericLiteral")) continue;
    styles[key] = value.value;
  }
  return styles;
}

function details(element: JSXElement) {
  const props: Record<string, string | number | boolean> = {};
  let styles: Record<string, string | number> = {};
  let stylesEditable = true;
  for (const attribute of element.openingElement.attributes) {
    if (attribute.type !== "JSXAttribute" || attribute.name.type !== "JSXIdentifier") continue;
    const name = attribute.name.name;
    if (name === "style" && attribute.value?.type === "JSXExpressionContainer" && attribute.value.expression.type === "ObjectExpression") {
      styles = readStyles(attribute.value.expression);
      continue;
    }
    if (name === "style") continue;
    const value = staticAttribute(attribute);
    if (value !== undefined) props[name] = value;
  }
  const meaningful = element.children.filter((child) => child.type !== "JSXText" || child.value.trim());
  const textNode = meaningful.length === 1 && meaningful[0]?.type === "JSXText" ? meaningful[0] : undefined;
  const dynamic = element.children.some((child) => child.type === "JSXExpressionContainer" || child.type === "JSXSpreadChild");
  return { props, styles, stylesEditable, text: textNode?.value.trim(), textEditable: Boolean(textNode), dynamic };
}

export function parseSource(file: string, source: string, version = 1): EditorDocument {
  // Error recovery keeps a page with one broken region selectable instead of failing the whole project.
  const ast = parse(source, {
    sourceType: "module",
    errorRecovery: true,
    plugins: ["jsx", "typescript", "decorators-legacy", "classProperties", "topLevelAwait"],
  });
  const nodes: Record<string, EditorNode> = {};
  const roots: string[] = [];
  const stack: string[] = [];

  traverse(ast, {
    JSXElement: {
      enter(path) {
        const element = path.node;
        if (element.start == null || element.end == null || !element.loc) return;
        const type = jsxName(element.openingElement.name);
        const id = `${file}:${element.start}:${element.end}`;
        const parentId = stack.at(-1);
        const data = details(element);
        const intrinsic = /^[a-z]/.test(type);
        nodes[id] = {
          id,
          type,
          label: data.text ? `${type} · ${data.text.slice(0, 28)}` : type,
          source: { file, start: element.start, end: element.end, line: element.loc.start.line, column: element.loc.start.column + 1 },
          parentId,
          children: [],
          props: data.props,
          styles: data.styles,
          text: data.text,
          dynamic: data.dynamic,
          capabilities: {
            text: data.textEditable,
            style: intrinsic && data.stylesEditable,
            insert: !element.openingElement.selfClosing,
            remove: Boolean(parentId),
            reorder: Boolean(parentId),
          },
        };
        if (parentId) nodes[parentId]?.children.push(id);
        else roots.push(id);
        stack.push(id);
      },
      exit(path) {
        if (path.node.start != null && path.node.end != null) stack.pop();
      },
    },
  });
  return { file, source, nodes, roots, version };
}
