import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { JSXOpeningElement } from "@babel/types";
import { resolveRelative, type ReadSource } from "./moduleResolver";

const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

export interface ComponentUse {
  /** File that renders the component. */
  file: string;
  source: string;
  line: number;
  /** Attribute name to the expression written for it, exactly as it is in the source. */
  props: Record<string, string>;
  /** Where each of those expressions sits, so the wiring can be rewritten and not only read. */
  propRanges: Record<string, { start: number; end: number }>;
}

/** One place a value of the data ends up being drawn: `d={activePart.highlight.d}` is what makes
 * `highlight.d` "the outlined area" rather than an unreadable string. */
export interface ValueUse {
  file: string;
  /** Element it is drawn in. */
  tag: string;
  /** Attribute it fills, or "" when it is the text of the element. */
  attribute: string;
}

interface FileFacts {
  /** Import target without extension, and the name the file uses for it. */
  imports: { base: string; local: string; imported: string }[];
  usages: { name: string; line: number; props: Record<string, string>; propRanges: Record<string, { start: number; end: number }> }[];
  /** Expressions written into the JSX of this file, with where they are drawn. */
  values: { expression: string; tag: string; attribute: string }[];
  exports: { name: string; exported: string; isDefault: boolean }[];
}

export interface ProjectComponentDefinition {
  /** Name shown in the palette and used in the inserted JSX. */
  name: string;
  /** File that owns the component. */
  file: string;
  /** `default`, or the name between braces in an import. */
  exported: string;
  isDefault: boolean;
  usageCount: number;
  /** A real prop set already used by this project, kept as a sensible starting point. */
  exampleProps: Record<string, string>;
  /** Le props che la palette sa davvero portarsi dietro: i valori scritti li' e i dati importati. */
  carriedProps: Record<string, string>;
  /** Da dove vengono i dati che le props citano, per riscrivere gli import nel file di arrivo. */
  carriedImports: CarriedImport[];
  /** Le props di dati che l'editor non sa portare (arrivano da uno stato o da un calcolo locale).
   * Un componente che ne ha non va inserito nudo: senza i suoi dati non disegna niente. */
  missingProps: string[];
  /** I gestori (`onQualcosa`) rimasti indietro: il componente si vede lo stesso, ma non risponde. */
  droppedHandlers: string[];
}

export interface CarriedImport {
  /** Il nome con cui l'espressione lo chiama. */
  local: string;
  file: string;
  exported: string;
  isDefault: boolean;
}

const visible = ["d", "src", "href", "alt", "title", "value", "x", "y", "width", "height"];

const simpleExpression = /^(?:true|false|null|undefined|-?\d+(?:\.\d+)?|["'][^"']*["'])$/;

/** Nomi che non hanno bisogno di nessun import. */
const globalNames = new Set(["Math", "JSON", "Object", "Array", "String", "Number", "Boolean", "Date", "console", "window", "document", "undefined", "NaN", "Infinity"]);

/** I nomi che un'espressione cita e che devono venire da qualche parte. Torna `undefined` se
 * l'espressione non si lascia leggere, e salta i nomi che l'espressione stessa dichiara (i parametri
 * di una funzione scritta li'). */
function rootIdentifiers(expression: string): string[] | undefined {
  let ast;
  try { ast = parse(`(${expression})`, { sourceType: "module", plugins: ["jsx", "typescript"] }); }
  catch { return undefined; }
  const names = new Set<string>();
  traverse(ast, {
    Identifier(path) {
      const parent = path.parent;
      if (parent.type === "MemberExpression" && !parent.computed && parent.property === path.node) return;
      if (parent.type === "ObjectProperty" && !parent.computed && parent.key === path.node) return;
      if (parent.type === "JSXAttribute" || parent.type === "JSXOpeningElement") return;
      if (path.scope.hasBinding(path.node.name)) return;
      if (globalNames.has(path.node.name)) return;
      names.add(path.node.name);
    },
  });
  return [...names];
}

function rankOf(attribute: string) {
  if (attribute === "") return 0;
  if (visible.includes(attribute)) return 1;
  if (attribute.startsWith("aria-") || attribute === "className" || attribute === "role") return 3;
  return 2;
}

function tagOf(node: JSXOpeningElement): string {
  return node.name.type === "JSXIdentifier" ? node.name.name : "";
}

export interface ProjectIndex {
  sources: Record<string, string>;
  /** Every place a component file is rendered from, with what each call site passes to it. */
  usesOf(componentFile: string): ComponentUse[];
  /** Where a value of the data is drawn, found by the property it is read from. */
  whereUsed(property: string, limit?: number): ValueUse[];
  /** Reusable React components exported by the sources this panel actually renders. */
  components(): ProjectComponentDefinition[];
}

function withoutExtension(file: string) {
  return file.replaceAll("\\", "/").replace(/\.(jsx?|tsx?|mjs|cjs)$/, "").toLowerCase();
}

function factsOf(file: string, source: string): FileFacts {
  const facts: FileFacts = { imports: [], usages: [], values: [], exports: [] };
  let ast;
  try {
    ast = parse(source, { sourceType: "module", errorRecovery: true, plugins: ["jsx", "typescript", "decorators-legacy", "classProperties", "topLevelAwait"] });
  } catch {
    return facts;
  }
  traverse(ast, {
    ImportDeclaration(path) {
      const base = resolveRelative(file, path.node.source.value);
      if (!base) return;
      for (const specifier of path.node.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier") continue;
        const imported = specifier.type === "ImportDefaultSpecifier"
          ? "default"
          : specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
        facts.imports.push({ base: withoutExtension(base), local: specifier.local.name, imported });
      }
    },
    ExportDefaultDeclaration(path) {
      const declaration = path.node.declaration;
      if ((declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") && declaration.id && /^[A-Z]/.test(declaration.id.name)) {
        facts.exports.push({ name: declaration.id.name, exported: "default", isDefault: true });
      } else if (declaration.type === "Identifier" && /^[A-Z]/.test(declaration.name)) {
        facts.exports.push({ name: declaration.name, exported: "default", isDefault: true });
      }
    },
    ExportNamedDeclaration(path) {
      const declaration = path.node.declaration;
      if (declaration?.type === "FunctionDeclaration" || declaration?.type === "ClassDeclaration") {
        if (declaration.id && /^[A-Z]/.test(declaration.id.name)) facts.exports.push({ name: declaration.id.name, exported: declaration.id.name, isDefault: false });
      } else if (declaration?.type === "VariableDeclaration") {
        for (const item of declaration.declarations) {
          if (item.id.type === "Identifier" && /^[A-Z]/.test(item.id.name)) facts.exports.push({ name: item.id.name, exported: item.id.name, isDefault: false });
        }
      }
      for (const specifier of path.node.specifiers) {
        if (specifier.type !== "ExportSpecifier" || specifier.local.type !== "Identifier") continue;
        const exported = specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value;
        if (/^[A-Z]/.test(exported)) facts.exports.push({ name: exported, exported, isDefault: false });
      }
    },
    JSXOpeningElement(path) {
      if (path.node.name.type !== "JSXIdentifier" || !/^[A-Z]/.test(path.node.name.name)) return;
      const props: Record<string, string> = {};
      const propRanges: Record<string, { start: number; end: number }> = {};
      for (const attribute of path.node.attributes) {
        if (attribute.type !== "JSXAttribute" || attribute.name.type !== "JSXIdentifier") continue;
        const value = attribute.value;
        if (!value) { props[attribute.name.name] = "true"; continue; }
        const expression = value.type === "JSXExpressionContainer" ? value.expression : value;
        if (expression.start == null || expression.end == null) continue;
        props[attribute.name.name] = source.slice(expression.start, expression.end);
        propRanges[attribute.name.name] = { start: expression.start, end: expression.end };
      }
      facts.usages.push({ name: path.node.name.name, line: path.node.loc?.start.line ?? 0, props, propRanges });
    },
    JSXAttribute(path) {
      const value = path.node.value;
      if (path.node.name.type !== "JSXIdentifier" || value?.type !== "JSXExpressionContainer") return;
      const expression = value.expression;
      if (expression.start == null || expression.end == null) return;
      const parent = path.parentPath.node;
      if (parent.type !== "JSXOpeningElement") return;
      facts.values.push({ expression: source.slice(expression.start, expression.end), tag: tagOf(parent), attribute: path.node.name.name });
    },
    JSXExpressionContainer(path) {
      if (path.parentPath.node.type !== "JSXElement" || path.node.expression.start == null || path.node.expression.end == null) return;
      const element = path.parentPath.node;
      facts.values.push({ expression: source.slice(path.node.expression.start, path.node.expression.end), tag: tagOf(element.openingElement), attribute: "" });
    },
  });
  return facts;
}

/** Reads the project's own source files. Templates outside the project are deliberately left out:
 * what matters here is who, inside this panel, renders what. */
export async function readProjectSources(files: string[], read: ReadSource, limit = 200): Promise<Record<string, string>> {
  const wanted = files.filter((file) => /\.(jsx?|tsx?)$/.test(file)).slice(0, limit);
  const sources: Record<string, string> = {};
  await Promise.all(wanted.map(async (file) => {
    try { sources[file] = await read(file); } catch { /* A file that cannot be read is simply absent from the index. */ }
  }));
  return sources;
}

export function buildProjectIndex(sources: Record<string, string>): ProjectIndex {
  const facts = new Map<string, FileFacts>();
  for (const [file, source] of Object.entries(sources)) facts.set(file, factsOf(file, source));
  return {
    sources,
    usesOf(componentFile: string) {
      const target = withoutExtension(componentFile);
      const uses: ComponentUse[] = [];
      for (const [file, fact] of facts) {
        const locals = fact.imports.filter((entry) => entry.base === target).map((entry) => entry.local);
        if (!locals.length) continue;
        for (const usage of fact.usages) {
          if (!locals.includes(usage.name)) continue;
          uses.push({ file, source: sources[file], line: usage.line, props: usage.props, propRanges: usage.propRanges });
        }
      }
      return uses;
    },
    whereUsed(property: string, limit = 3) {
      // `highlight.d` is read as `part.highlight.d`, and `highlight.type` inside `is-${…type}`:
      // the tail of the expression is what identifies it, closing brace included.
      const suffix = `.${property}`;
      const found: { use: ValueUse; rank: number }[] = [];
      const seen = new Set<string>();
      for (const [file, fact] of facts) {
        for (const value of fact.values) {
          if (!value.tag || value.attribute === "key") continue;
          // The loose match is only for a template — `is-${part.highlight.type}` — or a whole list
          // expression would match every property its rows draw.
          const composed = value.expression.startsWith("`") && value.expression.includes(`${suffix}}`);
          if (!value.expression.endsWith(suffix) && !composed) continue;
          const key = `${file}:${value.tag}:${value.attribute}`;
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ use: { file, tag: value.tag, attribute: value.attribute }, rank: rankOf(value.attribute) });
        }
      }
      // What the user can see comes first: the writing, then the picture or the outline, and only
      // last the attributes that exist for the screen reader.
      return found.sort((left, right) => left.rank - right.rank).slice(0, limit).map((entry) => entry.use);
    },
    components() {
      const components: ProjectComponentDefinition[] = [];
      const seen = new Set<string>();
      for (const [file, fact] of facts) {
        // Plain .ts helper modules often export capitalised constants too. A palette entry is only
        // useful when the module itself contains JSX or the export is already rendered as JSX.
        const target = withoutExtension(file);
        for (const definition of fact.exports) {
          const key = `${target}:${definition.exported}`;
          if (seen.has(key)) continue;
          const uses: ComponentUse[] = [];
          for (const [consumerFile, consumer] of facts) {
            const locals = consumer.imports
              .filter((entry) => entry.base === target && entry.imported === definition.exported)
              .map((entry) => entry.local);
            for (const usage of consumer.usages) {
              if (locals.includes(usage.name)) uses.push({ file: consumerFile, source: sources[consumerFile], line: usage.line, props: usage.props, propRanges: usage.propRanges });
            }
          }
          if (!uses.length && !/<[A-Za-z][\w.:-]*(?:\s|>|\/)/.test(sources[file])) continue;
          seen.add(key);
          const example = [...uses].sort((left, right) => Object.keys(right.props).length - Object.keys(left.props).length)[0];
          const carried = carriedFrom(example, facts, sources);
          components.push({ ...definition, file, usageCount: uses.length, exampleProps: example?.props ?? {}, ...carried });
        }
      }
      return components.sort((left, right) => right.usageCount - left.usageCount || left.name.localeCompare(right.name, "it"));
    },
  };
}

/** Che cosa di una chiamata reale si riesce a portare nella pagina nuova.
 *
 * Un valore scritto li' (`label="AVVIA"`, `size={140}`) si copia e basta. Un dato importato
 * (`settings={specialFunctions}`) si copia **insieme al suo import**: e' questo che prima mancava, ed
 * e' il motivo per cui un template di pagina finiva inserito nudo e non disegnava niente. Quello che
 * arriva da uno stato o da un calcolo del file di partenza non si puo' portare: viene detto, non
 * inventato. */
function carriedFrom(example: ComponentUse | undefined, facts: Map<string, FileFacts>, sources: Record<string, string>) {
  const carriedProps: Record<string, string> = {};
  const carriedImports: CarriedImport[] = [];
  const missingProps: string[] = [];
  const droppedHandlers: string[] = [];
  const consumer = example ? facts.get(example.file) : undefined;

  for (const [name, raw] of Object.entries(example?.props ?? {})) {
    const expression = raw.trim();
    if (simpleExpression.test(expression)) { carriedProps[name] = expression; continue; }
    const identifiers = rootIdentifiers(expression);
    const resolved = identifiers?.map((identifier) => {
      const entry = consumer?.imports.find((item) => item.local === identifier);
      const from = entry && Object.keys(sources).find((candidate) => withoutExtension(candidate) === entry.base);
      return from && entry ? { local: identifier, file: from, exported: entry.imported, isDefault: entry.imported === "default" } : undefined;
    });
    if (!resolved || resolved.some((item) => !item)) {
      // Un gestore che resta indietro lascia il componente muto, un dato che resta indietro lo lascia
      // vuoto: sono due cose diverse e vanno dette in modo diverso.
      (name.startsWith("on") ? droppedHandlers : missingProps).push(name);
      continue;
    }
    carriedProps[name] = expression;
    for (const item of resolved as CarriedImport[]) {
      if (!carriedImports.some((existing) => existing.local === item.local)) carriedImports.push(item);
    }
  }
  return { carriedProps, carriedImports, missingProps, droppedHandlers };
}

/** Transport format used only while dragging. It is removed before Babel ever sees the JSX. */
export function projectComponentJsx(component: ProjectComponentDefinition) {
  const props = Object.entries(component.carriedProps).map(([name, value]) => {
    if (value === "true") return ` ${name}`;
    if (/^["']/.test(value)) return ` ${name}=${value}`;
    return ` ${name}={${value}}`;
  }).join("");
  const metadata = encodeURIComponent(JSON.stringify({
    file: component.file,
    name: component.name,
    exported: component.exported,
    isDefault: component.isDefault,
    imports: component.carriedImports,
    missing: component.missingProps,
  }));
  return `/*framecraft-project:${metadata}*/
  <${component.name}${props} />`;
}
