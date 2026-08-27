import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { ImportDeclaration, JSXElement } from "@babel/types";
import MagicString from "magic-string";
import type { PageDefinition } from "./types";

const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

function ast(source: string) {
  return parse(source, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"] });
}

function normalized(path: string) {
  return path.replaceAll("\\", "/");
}

function resolveImport(importer: string, specifier: string, files: string[]) {
  if (specifier.startsWith("@/")) {
    const suffix = `/src/${specifier.slice(2)}`;
    return files.find((file) => normalized(file).replace(/\.(tsx|jsx)$/, "").endsWith(suffix));
  }
  if (!specifier.startsWith(".")) return undefined;
  const importerParts = normalized(importer).split("/");
  importerParts.pop();
  for (const part of specifier.split("/")) {
    if (part === ".") continue;
    if (part === "..") importerParts.pop();
    else importerParts.push(part);
  }
  const base = importerParts.join("/");
  return files.find((file) => {
    const candidate = normalized(file).replace(/\.(tsx|jsx)$/, "");
    return candidate === base || candidate === `${base}/index`;
  });
}

function jsxName(element: JSXElement) {
  const name = element.openingElement.name;
  return name.type === "JSXIdentifier" ? name.name : undefined;
}

function renderedComponent(element: JSXElement): string | undefined {
  for (const child of [...element.children].reverse()) {
    if (child.type === "JSXElement") {
      const nested = renderedComponent(child);
      if (nested) return nested;
    }
    if (child.type === "JSXExpressionContainer" && child.expression.type === "JSXElement") {
      const nested = renderedComponent(child.expression);
      if (nested) return nested;
    }
  }
  const name = jsxName(element);
  return name && /^[A-Z]/.test(name) ? name : undefined;
}

function routeAttribute(element: JSXElement) {
  const pathAttribute = element.openingElement.attributes.find((attribute) => attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" && attribute.name.name === "path");
  const index = element.openingElement.attributes.some((attribute) => attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" && attribute.name.name === "index");
  return pathAttribute?.type === "JSXAttribute" && pathAttribute.value?.type === "StringLiteral" ? pathAttribute.value.value : index ? "" : undefined;
}

function statePageName(value: string) {
  return value.split(/[-_\s]+/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ") || "Page";
}

function statePages(parsed: ReturnType<typeof ast>, file: string): PageDefinition[] {
  const stateNames = new Set<string>();
  const setterNames = new Set<string>();
  const values = new Set<string>();
  let initial: string | undefined;
  const pageObjects: string[] = [];
  const addExpression = (expression: unknown) => {
    if (!expression || typeof expression !== "object" || !("type" in expression)) return;
    const node = expression as { type: string; value?: string; expressions?: unknown[]; quasis?: Array<{ value: { cooked?: string } }>; consequent?: unknown; alternate?: unknown };
    if (node.type === "StringLiteral" && typeof node.value === "string") values.add(node.value);
    else if (node.type === "TemplateLiteral" && !node.expressions?.length) values.add(node.quasis?.[0]?.value.cooked ?? "");
    else if (node.type === "ConditionalExpression") { addExpression(node.consequent); addExpression(node.alternate); }
  };

  traverse(parsed, {
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (id.type === "Identifier" && init?.type === "ObjectExpression" && /(pages|views|screens)$/i.test(id.name)) {
        for (const property of init.properties) {
          if (property.type !== "ObjectProperty" || property.computed) continue;
          if (property.key.type === "Identifier") pageObjects.push(property.key.name);
          if (property.key.type === "StringLiteral") pageObjects.push(property.key.value);
        }
      }
      if (id.type !== "ArrayPattern" || init?.type !== "CallExpression") return;
      const state = id.elements[0];
      const setter = id.elements[1];
      const useStateCall = init.callee.type === "Identifier" && init.callee.name === "useState"
        || init.callee.type === "MemberExpression" && init.callee.property.type === "Identifier" && init.callee.property.name === "useState";
      if (!useStateCall || state?.type !== "Identifier" || setter?.type !== "Identifier" || !/(page|view|screen|section)/i.test(state.name)) return;
      stateNames.add(state.name);
      setterNames.add(setter.name);
      const argument = init.arguments[0];
      if (argument?.type === "StringLiteral") { initial = argument.value; values.add(argument.value); }
    },
  });
  if (!setterNames.size) return [];
  pageObjects.forEach((value) => values.add(value));
  traverse(parsed, {
    CallExpression(path) {
      if (path.node.callee.type === "Identifier" && setterNames.has(path.node.callee.name)) addExpression(path.node.arguments[0]);
    },
    BinaryExpression(path) {
      if (path.node.operator !== "===" && path.node.operator !== "==") return;
      const leftMatches = path.node.left.type === "Identifier" && (stateNames.has(path.node.left.name) || /^(page|view|screen|section)$/i.test(path.node.left.name));
      const rightMatches = path.node.right.type === "Identifier" && (stateNames.has(path.node.right.name) || /^(page|view|screen|section)$/i.test(path.node.right.name));
      if (leftMatches) addExpression(path.node.right);
      if (rightMatches) addExpression(path.node.left);
    },
  });
  const ordered = [...values].filter(Boolean).sort((a, b) => a === initial ? -1 : b === initial ? 1 : a.localeCompare(b));
  return ordered.map((value) => ({ id: `${file}:state:${value}`, name: statePageName(value), route: "/", file, stateValue: value }));
}

export function detectPages(sources: Record<string, string>): { pages: PageDefinition[]; routerFile?: string; routerEditable: boolean } {
  const files = Object.keys(sources);
  const pages: PageDefinition[] = [];
  let routerFile: string | undefined;
  let routerEditable = false;
  const stateDrivenPages: PageDefinition[] = [];

  for (const [file, source] of Object.entries(sources)) {
    const imports = new Map<string, string>();
    let parsed;
    try { parsed = ast(source); } catch { continue; }
    stateDrivenPages.push(...statePages(parsed, file));
    traverse(parsed, {
      ImportDeclaration(path) {
        const declaration = path.node as ImportDeclaration;
        for (const specifier of declaration.specifiers) {
          if (specifier.local?.name) imports.set(specifier.local.name, declaration.source.value);
        }
      },
      VariableDeclarator(path) {
        const { id, init } = path.node;
        if (id.type !== "Identifier" || init?.type !== "CallExpression" || init.callee.type !== "Identifier" || init.callee.name !== "lazy") return;
        const loader = init.arguments[0];
        if (!loader || loader.type !== "ArrowFunctionExpression" || loader.body.type !== "CallExpression" || loader.body.callee.type !== "Import") return;
        const imported = loader.body.arguments[0];
        if (imported?.type === "StringLiteral") imports.set(id.name, imported.value);
      },
      JSXElement(path) {
        const element = path.node;
        const name = jsxName(element);
        if (name === "Routes") {
          routerFile = file;
          routerEditable = true;
        }
        if (name !== "Route") return;
        const ownRoute = routeAttribute(element);
        const elementAttribute = element.openingElement.attributes.find((attribute) => attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" && attribute.name.name === "element");
        if (ownRoute == null) return;
        const ancestorRoutes: string[] = [];
        let parent = path.parentPath as typeof path.parentPath | null;
        while (parent) {
          if (parent.isJSXElement() && jsxName(parent.node) === "Route") {
            const segment = routeAttribute(parent.node);
            if (segment) ancestorRoutes.unshift(segment);
          }
          parent = parent.parentPath;
        }
        const segments = [...ancestorRoutes, ownRoute].filter(Boolean).map((segment) => segment.replace(/^\/+|\/+$/g, ""));
        const route = `/${segments.filter(Boolean).join("/")}`;
        let componentName: string | undefined;
        if (elementAttribute?.type === "JSXAttribute" && elementAttribute.value?.type === "JSXExpressionContainer" && elementAttribute.value.expression.type === "JSXElement") {
          componentName = renderedComponent(elementAttribute.value.expression);
        }
        const imported = componentName ? imports.get(componentName) : undefined;
        const targetFile = imported ? resolveImport(file, imported, files) : file;
        if (componentName === "Navigate") return;
        pages.push({ id: `${file}:${route}`, name: componentName?.replace(/Page$/, "") || (route === "/" ? "Home" : route.split("/").filter(Boolean).at(-1) || "Page"), route, file: targetFile ?? file, routerFile: file, componentName });
      },
    });
  }

  for (const file of files.filter((item) => /[\\/]pages[\\/].*\.(tsx|jsx)$/.test(item))) {
    if (pages.some((page) => page.file === file)) continue;
    const name = normalized(file).split("/").at(-1)!.replace(/\.(tsx|jsx)$/, "").replace(/Page$/, "");
    pages.push({ id: file, name, route: `/${name.toLowerCase()}`, file });
  }
  if (!pages.length) pages.push(...stateDrivenPages);
  if (!pages.length) {
    const appFile = files.find((file) => /[\\/]App\.(tsx|jsx)$/.test(file)) ?? files.find((file) => /\.(tsx|jsx)$/.test(file));
    if (appFile) pages.push({ id: `${appFile}:/`, name: "Home", route: "/", file: appFile });
  }
  pages.sort((a, b) => {
    if (a.stateValue || b.stateValue) return 0;
    if (a.route === "/" && b.route !== "/") return -1;
    if (b.route === "/" && a.route !== "/") return 1;
    return a.route.includes(":") === b.route.includes(":") ? a.route.localeCompare(b.route) : a.route.includes(":") ? 1 : -1;
  });
  return { pages, routerFile, routerEditable };
}

export function insertReactRoute(source: string, componentName: string, importPath: string, route: string): string {
  const parsed = ast(source);
  let routes: JSXElement | undefined;
  traverse(parsed, { JSXElement(path) { if (!routes && jsxName(path.node) === "Routes") routes = path.node; } });
  if (!routes?.closingElement?.start) throw new Error("Questo router non usa <Routes>: aggiungi la pagina dal codice.");
  const magic = new MagicString(source);
  const imports = parsed.program.body.filter((node): node is ImportDeclaration => node.type === "ImportDeclaration");
  const importAt = imports.at(-1)?.end ?? 0;
  magic.appendLeft(importAt, `${importAt ? "\n" : ""}import { ${componentName} } from ${JSON.stringify(importPath)};\n`);
  magic.appendLeft(routes.closingElement.start, `\n      <Route path=${JSON.stringify(route)} element={<${componentName} />} />`);
  return magic.toString();
}
