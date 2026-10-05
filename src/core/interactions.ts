import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { CallExpression, Function as BabelFunction, JSXElement, Node, OptionalCallExpression } from "@babel/types";

/** `onOpenPart?.(id)` is a call like any other, and it is exactly how an optional handler is written
 * in these panels: reading only CallExpression made the last step of the chain invisible. */
type AnyCall = CallExpression | OptionalCallExpression;

const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

/** A value written straight into the element, so the panel can offer it as a field instead of only
 * describing it: which page a button opens, which signal it writes, whether it opens or closes. */
export interface ActionValue {
  label: string;
  kind: "page" | "link" | "text" | "number" | "boolean";
  value: string;
  /** Where the literal sits in the file, which is what an edit rewrites. */
  start: number;
  end: number;
  /** The value is built at runtime — `manual-${partId}` — so what is shown is how it is written,
   * and writing a plain value here would fix it for everyone who passes through. */
  composed?: boolean;
  /** A composed destination can depend on the value passed through the click chain. Keeping this
   * information lets the inspector override one repeated item without flattening navigation for
   * every other item. */
  parameter?: string;
  defaultRaw?: string;
  itemOverrides?: { key: string; value: string }[];
  /** File the range belongs to, when it is not the one being edited: a handler lives in the page
   * that supplies it, and that is where "cosa fa al click" is actually written. */
  file?: string;
  /** What is written there now, checked before that other file is rewritten. */
  raw?: string;
}

/** The wiring of one handler: which function a page hands to the element, what else could take its
 * place, and the values inside that function. Changing what a click does means changing one of
 * these, because the element itself only forwards the call. */
export interface HandlerBinding {
  /** Prop the element calls, or the name of the function when it is written in this same file. */
  prop: string;
  /** File where the wiring is written. */
  file: string;
  /** Function passed there today, or "" when the page writes the behaviour inline. */
  name: string;
  /** What that wiring does, one line per step. */
  lines: string[];
  /** The wiring one file further up: a handler that only forwards to a prop of its own. */
  next: HandlerBinding[];
  start: number;
  end: number;
  /** Exactly what is written in that range now. */
  raw: string;
  /** Functions of that file that could take its place. */
  options: string[];
  /** Editable literals inside that function. */
  values: ActionValue[];
}

export interface InteractionAction {
  /** What sets it off: "Al click", "Alla pressione di un tasto", "Sempre"… */
  trigger: string;
  summary: string;
  /** What the called functions do, when they are written in the same file. */
  details: string[];
  /** Editable literals of this action, in the order they are written. */
  values: ActionValue[];
  /** Where the behaviour is wired, so it can be changed and not only read. */
  handlers: HandlerBinding[];
  /** Names the action reads from the row that draws the element: `onPartToggle(part.id)` is only
   * editable through `id`, and that field belongs next to the action it feeds. */
  dataProperties: string[];
}

/** What the file that renders this component passes to it. A handler that only forwards a prop is
 * a dead end on its own: the answer lives one file up, where that prop is given a value. */
export interface CallSiteContext {
  file: string;
  source: string;
  props: Record<string, string>;
  /** Where each prop expression sits in that file. */
  propRanges?: Record<string, { start: number; end: number }>;
  /** Who renders this file in turn, so a handler that forwards again can still be followed. */
  callers?: CallSiteContext[];
}

export interface InteractionReport {
  actions: InteractionAction[];
  /** Set when the actions belong to a container rather than to the selected element itself: a label
   * or a shape drawn inside a button has no handler of its own, the button around it has. */
  owner?: { type: string; line: number };
}

function text(source: string, node?: Node | null) {
  return node?.start != null && node.end != null ? source.slice(node.start, node.end) : "";
}

function short(value: string, max = 44) {
  const single = value.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max)}…` : single;
}

/** Only a plain string literal loses its quotes: `"manual-" + id` is an expression and stays as the
 * developer wrote it, because half-stripping it would read like a value it never has. */
function quoted(value: string) {
  const quote = value[0];
  if (value.length < 2 || (quote !== '"' && quote !== "'" && quote !== "`") || value.at(-1) !== quote) return value;
  const inner = value.slice(1, -1);
  return inner.includes(quote) ? value : inner;
}

const pageish = /page|view|screen|section|route|navigate/i;

function stateName(setter: string) {
  return setter.replace(/^set/, "").replace(/^[A-Z]/, (letter) => letter.toLowerCase());
}

function calleeName(call: AnyCall) {
  const callee = call.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") return callee.property.name;
  return "";
}

function fileName(file: string) {
  return file.split(/[\\/]/).at(-1) ?? file;
}

/** Turns one call into a sentence. Unknown calls are reported as they are written rather than
 * guessed at: naming the function is still an answer, inventing a behaviour is not. */
/** Every distinct value a prop is given, by file. The same component is often rendered by more
 * than one page — the overlay of a machine appears in the view and in the manual — and answering for
 * only one of them would be a guess presented as a fact. */
function passedBy(callSites: CallSiteContext[], name: string) {
  const byFile = new Map<string, string>();
  for (const site of callSites) {
    const passed = site.props[name];
    if (passed) byFile.set(site.file, passed);
  }
  return [...byFile].map(([file, expression]) => ({ file, expression }));
}

function describeCall(source: string, call: AnyCall, props: Set<string>, callSites: CallSiteContext[] = []): string | undefined {
  const callee = call.callee;
  const name = calleeName(call);
  const owner = callee.type === "MemberExpression" ? text(source, callee.object) : "";
  const args = call.arguments.map((argument) => short(text(source, argument), 30));
  if (["preventDefault", "stopPropagation", "persist", "focus", "blur"].includes(name)) return undefined;
  if (name === "write" && args.length) return `scrive ${args[1] ?? "un valore"} sulla variabile PLC ${quoted(args[0])}`;
  if (name === "open" && owner === "window") return `apre ${args[0] ? quoted(args[0]) : "un indirizzo"} in un'altra finestra`;
  if (["navigate", "push", "replace"].includes(name) && args.length) return `porta a ${quoted(args[0])}`;
  if (/^set[A-Z]/.test(name)) {
    const state = stateName(name);
    const value = args[0];
    if (/page|view|screen|section|route/i.test(state)) return value ? `porta alla pagina ${quoted(value)}` : "cambia pagina";
    if (/open|visible|show|expanded|active/i.test(state)) {
      if (value === "true") return `apre ${state}`;
      if (value === "false") return `chiude ${state}`;
      // Only a boolean is an opening: `setActivePartId(partId)` merely chooses a part.
      if (!value || value.startsWith("!")) return `apre o chiude ${state}`;
    }
    return value ? `imposta ${state} = ${value}` : `aggiorna ${state}`;
  }
  if (props.has(name)) {
    const passed = passedBy(callSites, name);
    if (passed.length) return `chiama ${passed.map((entry) => `${entry.expression} in ${fileName(entry.file)}`).join(" oppure ")} con (${args.join(", ")})`;
    return `chiama ${name}(${args.join(", ")}), che arriva da chi usa questo componente`;
  }
  // A handler named for pages is a navigation, whatever the panel calls its own router.
  if (pageish.test(name) && args.length) return `porta alla pagina ${quoted(args[0])}`;
  return `chiama ${name}(${args.join(", ")})`;
}

function parsed(source: string) {
  try {
    return parse(source, { sourceType: "module", errorRecovery: true, plugins: ["jsx", "typescript", "decorators-legacy", "classProperties", "topLevelAwait"] });
  } catch {
    return undefined;
  }
}

/** The calls a named function makes, read from any file. Used to follow a prop into the panel that
 * supplies it, which is where "cosa fa questo bottone" is actually answered. */
function functionCalls(source: string, name: string): AnyCall[] {
  const ast = parsed(source);
  if (!ast) return [];
  let target: BabelFunction | undefined;
  const calls: AnyCall[] = [];
  traverse(ast, {
    CallExpression(path) { calls.push(path.node); },
    OptionalCallExpression(path) { calls.push(path.node); },
    FunctionDeclaration(path) { if (path.node.id?.name === name) target = path.node; },
    VariableDeclarator(path) {
      if (path.node.id.type !== "Identifier" || path.node.id.name !== name || !path.node.init) return;
      if (path.node.init.type === "ArrowFunctionExpression" || path.node.init.type === "FunctionExpression") target = path.node.init;
    },
  });
  if (!target || target.start == null || target.end == null) return [];
  return calls.filter((call) => within(call, target!.start!, target!.end!));
}

export function functionBodyLines(source: string, name: string): string[] {
  return [...new Set(functionCalls(source, name).map((call) => describeCall(source, call, new Set())).filter((line): line is string => Boolean(line)))];
}

/** The literals written inside a function, with the ranges an edit rewrites. Turning "apre" into
 * "chiude" is the smallest honest way to change what a click does. */
export function functionValues(source: string, name: string, file: string): ActionValue[] {
  const values = functionCalls(source, name)
    .flatMap((call) => callValues(source, call))
    .map((value) => ({ ...value, file, raw: source.slice(value.start, value.end) }));
  // A function that opens and closes the same thing writes it twice: two fields with one name would
  // be impossible to tell apart.
  const totals = new Map<string, number>();
  for (const value of values) totals.set(value.label, (totals.get(value.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return values.map((value) => {
    if ((totals.get(value.label) ?? 0) < 2) return value;
    const position = (seen.get(value.label) ?? 0) + 1;
    seen.set(value.label, position);
    return { ...value, label: `${value.label} · ${position}` };
  });
}

/** Functions that could be handed to this element instead of the current one: written at module
 * level, or inside the component that renders it. Anything else would not be in scope there. */
export function functionsInScope(source: string, position: number): string[] {
  const ast = parsed(source);
  if (!ast) return [];
  const names: string[] = [];
  const keep = (path: { getFunctionParent(): { node: BabelFunction } | null }, name: string) => {
    // A component is not a handler, and a name that starts with a capital is a component here.
    if (/^[A-Z]/.test(name)) return;
    const parent = path.getFunctionParent();
    const node = parent?.node;
    if (!node || (node.start != null && node.end != null && position >= node.start && position <= node.end)) names.push(name);
  };
  traverse(ast, {
    FunctionDeclaration(path) { if (path.node.id) keep(path, path.node.id.name); },
    VariableDeclarator(path) {
      if (path.node.id.type !== "Identifier" || !path.node.init) return;
      if (path.node.init.type !== "ArrowFunctionExpression" && path.node.init.type !== "FunctionExpression") return;
      keep(path, path.node.id.name);
    },
  });
  return [...new Set(names)];
}

/** The literals of one call, each with the range an edit has to rewrite. */
function callValues(source: string, call: AnyCall): ActionValue[] {
  const name = calleeName(call);
  if (["preventDefault", "stopPropagation", "persist", "focus", "blur"].includes(name)) return [];
  const subject = /^set[A-Z]/.test(name) ? stateName(name) : name;
  const label = (kind: ActionValue["kind"], position: number, total: number) => {
    if (kind === "page") return "Pagina";
    if (name === "write") return position === 0 ? "Variabile PLC" : "Valore";
    if (["navigate", "push", "replace", "open"].includes(name)) return "Destinazione";
    return total > 1 ? `${subject} · ${position + 1}` : subject;
  };
  const values: ActionValue[] = [];
  const total = call.arguments.length;
  for (const [position, argument] of call.arguments.entries()) {
    if (argument.start == null || argument.end == null) continue;
    const kind: ActionValue["kind"] = argument.type === "BooleanLiteral" ? "boolean"
      : argument.type === "NumericLiteral" ? "number"
        : pageish.test(subject) ? "page" : "text";
    // A page written as `manual-${partId}` is still the destination of the click. Conditional
    // overrides are the representation written by the inspector when only one repeated item must
    // lead elsewhere; reading them back keeps that field editable after the first change.
    const composed = composedValue(source, argument, kind, label(kind, position, total));
    if (composed) {
      values.push(composed);
      continue;
    }
    if (argument.type !== "StringLiteral" && argument.type !== "BooleanLiteral" && argument.type !== "NumericLiteral") continue;
    const value = argument.type === "StringLiteral" ? argument.value : String(argument.value);
    values.push({ label: label(kind, position, total), kind, value, start: argument.start, end: argument.end });
  }
  return values;
}

function composedValue(source: string, argument: AnyCall["arguments"][number], kind: ActionValue["kind"], label: string): ActionValue | undefined {
  if (argument.type === "TemplateLiteral") {
    if (!argument.expressions.length || argument.start == null || argument.end == null) return undefined;
    const identifiers = argument.expressions.filter((expression) => expression.type === "Identifier").map((expression) => expression.name);
    const parameter = identifiers.length === argument.expressions.length && new Set(identifiers).size === 1 ? identifiers[0] : undefined;
    const raw = source.slice(argument.start, argument.end);
    return { label, kind, composed: true, value: raw.replace(/`/g, ""), parameter, defaultRaw: raw, itemOverrides: [], start: argument.start, end: argument.end };
  }
  if (argument.type !== "ConditionalExpression" || argument.start == null || argument.end == null) return undefined;
  const test = argument.test;
  if (test.type !== "BinaryExpression" || !["===", "=="].includes(test.operator)) return undefined;
  const leftParameter = test.left.type === "Identifier" ? test.left.name : undefined;
  const rightParameter = test.right.type === "Identifier" ? test.right.name : undefined;
  const key = test.left.type === "StringLiteral" ? test.left.value : test.right.type === "StringLiteral" ? test.right.value : undefined;
  const parameter = leftParameter ?? rightParameter;
  if (!parameter || key == null || argument.consequent.type !== "StringLiteral") return undefined;
  const fallback = composedValue(source, argument.alternate as AnyCall["arguments"][number], kind, label);
  if (!fallback?.parameter || fallback.parameter !== parameter || !fallback.defaultRaw) return undefined;
  return {
    ...fallback,
    start: argument.start,
    end: argument.end,
    itemOverrides: [{ key, value: argument.consequent.value }, ...(fallback.itemOverrides ?? [])],
  };
}

function within(node: Node, from: number, to: number) {
  return node.start != null && node.end != null && node.start >= from && node.end <= to;
}

const triggers: Record<string, string> = {
  onClick: "Al click", onDoubleClick: "Al doppio click", onChange: "Quando cambia il valore",
  onInput: "Mentre si scrive", onSubmit: "All'invio del form", onKeyDown: "Alla pressione di un tasto",
  onKeyUp: "Al rilascio di un tasto", onPointerDown: "Alla pressione del puntatore", onMouseEnter: "Al passaggio del mouse",
  onMouseLeave: "Quando il mouse esce", onFocus: "Quando prende il fuoco", onBlur: "Quando perde il fuoco",
};

function attributeValue(element: JSXElement, name: string) {
  for (const attribute of element.openingElement.attributes) {
    if (attribute.type !== "JSXAttribute" || attribute.name.type !== "JSXIdentifier" || attribute.name.name !== name) continue;
    return attribute.value ?? undefined;
  }
  return undefined;
}

function staticValue(source: string, element: JSXElement, name: string) {
  const value = attributeValue(element, name);
  if (!value) return undefined;
  if (value.type === "StringLiteral") return value.value;
  if (value.type === "JSXExpressionContainer") return short(text(source, value.expression));
  return undefined;
}

/** Reads an element and answers the question a visual editor cannot answer on its own: what happens
 * when this is used. Handlers, links, form submits and the editor's own highlight are all covered. */
/** Values of the surrounding data row an action reads: `part.id`, or a destructured `id`. Names are
 * collected generously and matched against the real row later, so a stray `event` costs nothing. */
function dataPropertiesOf(call: AnyCall): string[] {
  const names: string[] = [];
  for (const argument of call.arguments) {
    if (argument.type === "MemberExpression" && !argument.computed && argument.object.type === "Identifier" && argument.property.type === "Identifier") names.push(argument.property.name);
    else if (argument.type === "Identifier") names.push(argument.name);
  }
  return names;
}

/** Props of the component a position sits in: what a function written there can forward. */
function propsAt(source: string, position: number): Set<string> {
  const names = new Set<string>();
  const ast = parsed(source);
  if (!ast) return names;
  traverse(ast, {
    Function(path) {
      const node = path.node;
      if (node.start == null || node.end == null || position < node.start || position > node.end) return;
      for (const parameter of node.params) {
        if (parameter.type === "Identifier") names.add(parameter.name);
        if (parameter.type !== "ObjectPattern") continue;
        for (const property of parameter.properties) {
          if (property.type === "ObjectProperty" && property.key.type === "Identifier") names.add(property.key.name);
          if (property.type === "RestElement" && property.argument.type === "Identifier") names.add(property.argument.name);
        }
      }
    },
  });
  return names;
}

function functionsOf(source: string): Map<string, BabelFunction> {
  const functions = new Map<string, BabelFunction>();
  const ast = parsed(source);
  if (!ast) return functions;
  traverse(ast, {
    FunctionDeclaration(path) { if (path.node.id) functions.set(path.node.id.name, path.node); },
    VariableDeclarator(path) {
      if (path.node.id.type !== "Identifier" || !path.node.init) return;
      if (path.node.init.type === "ArrowFunctionExpression" || path.node.init.type === "FunctionExpression") functions.set(path.node.id.name, path.node.init);
    },
  });
  return functions;
}

/** The calls written inside one range: how the behaviour of an inline handler is read. */
function callsWithinRange(source: string, start: number, end: number): AnyCall[] {
  const ast = parsed(source);
  if (!ast) return [];
  const calls: AnyCall[] = [];
  traverse(ast, {
    CallExpression(path) { if (within(path.node, start, end)) calls.push(path.node); },
    OptionalCallExpression(path) { if (within(path.node, start, end)) calls.push(path.node); },
  });
  return calls;
}

/** The wiring one file further up: `selectPart` calls `onOpenPart`, which is a prop of its own
 * component, so the answer to "dove porta" lives in whoever renders that page. */
function forwardedHandlers(site: CallSiteContext, name: string, depth: number): HandlerBinding[] {
  const calls = functionCalls(site.source, name);
  if (!calls.length || !site.callers?.length) return [];
  const props = propsAt(site.source, calls[0].start ?? 0);
  const entries = calls.map((call) => ({ name: calleeName(call), start: -1, end: -1 }));
  return handlersFor(entries, props, functionsOf(site.source), site.source, site.file, site.callers, depth);
}

/** Where each function an action calls is wired up: in the pages that render this component, or in
 * this same file when the element names a local function directly. */
function handlersFor(called: { name: string; start: number; end: number }[], props: Set<string>, functions: Map<string, BabelFunction>, source: string, file: string, callSites: CallSiteContext[], depth = 2): HandlerBinding[] {
  const bindings: HandlerBinding[] = [];
  const seen = new Set<string>();
  for (const entry of called) {
    if (!entry.name || seen.has(entry.name)) continue;
    seen.add(entry.name);
    if (props.has(entry.name)) {
      for (const site of callSites) {
        const expression = site.props[entry.name];
        const range = site.propRanges?.[entry.name];
        if (!expression || !range) continue;
        if (identifier.test(expression)) {
          const siteProps = propsAt(site.source, range.start);
          const forwarded = depth > 0 ? forwardedHandlers(site, expression, depth - 1) : [];
          // A component often passes one of its own props straight through under another name:
          // Popup.onSelect -> Shell.onMainMenuItemSelect -> App.setCurrentPage. Follow that alias
          // just like a declared function or the final destination remains invisible.
          const aliased = depth > 0 && siteProps.has(expression) && site.callers?.length
            ? handlersFor([{ name: expression, start: -1, end: -1 }], siteProps, functionsOf(site.source), site.source, site.file, site.callers, depth - 1)
            : [];
          bindings.push({
            prop: entry.name, file: site.file, name: expression, start: range.start, end: range.end, raw: expression,
            options: functionsInScope(site.source, range.start),
            values: functionValues(site.source, expression, site.file),
            lines: functionBodyLines(site.source, expression),
            next: [...forwarded, ...aliased],
          });
          continue;
        }
        // The page writes the behaviour on the spot: onOpenPart={(id) => onPageChange(`manual-${id}`)}.
        const inner = callsWithinRange(site.source, range.start, range.end);
        const values = inner.flatMap((call) => callValues(site.source, call)).map((value) => ({ ...value, file: site.file, raw: site.source.slice(value.start, value.end) }));
        const lines = inner.map((call) => describeCall(site.source, call, new Set())).filter((line): line is string => Boolean(line));
        if (!values.length && !lines.length) continue;
        bindings.push({
          prop: entry.name, file: site.file, name: "", start: range.start, end: range.end, raw: expression,
          options: [], values, lines, next: [],
        });
      }
      continue;
    }
    // The handler is written here: the element names a function of its own file, and the name it
    // uses can be swapped in place.
    if (!functions.has(entry.name) || !file || entry.start < 0) continue;
    bindings.push({
      prop: entry.name, file, name: entry.name, start: entry.start, end: entry.end, raw: entry.name,
      options: functionsInScope(source, entry.start),
      values: functionValues(source, entry.name, file),
      lines: functionBodyLines(source, entry.name),
      next: [],
    });
  }
  return bindings;
}

/** True when a handler chain reaches a page setter/router, even if no literal destination exists
 * because the selected row's id itself is the destination. */
export function handlersNavigate(handlers: HandlerBinding[]): boolean {
  return handlers.some((handler) =>
    handler.values.some((value) => value.kind === "page")
    || pageish.test(handler.name)
    || handler.lines.some((line) => /porta alla pagina|cambia pagina|navigate|route/i.test(line))
    || handlersNavigate(handler.next));
}

const identifier = /^[A-Za-z_$][\w$]*$/;

export function describeInteractions(source: string, start: number, end: number, callSites: CallSiteContext[] = [], file = ""): InteractionReport {
  let ast;
  try {
    ast = parse(source, { sourceType: "module", errorRecovery: true, plugins: ["jsx", "typescript", "decorators-legacy", "classProperties", "topLevelAwait"] });
  } catch {
    return { actions: [] };
  }

  const calls: AnyCall[] = [];
  const functions = new Map<string, BabelFunction>();
  let target: JSXElement | undefined;
  let ancestors: JSXElement[] = [];
  const props = new Set<string>();

  traverse(ast, {
    CallExpression(path) { calls.push(path.node); },
    OptionalCallExpression(path) { calls.push(path.node); },
    FunctionDeclaration(path) { if (path.node.id) functions.set(path.node.id.name, path.node); },
    VariableDeclarator(path) {
      if (path.node.id.type !== "Identifier" || !path.node.init) return;
      if (path.node.init.type === "ArrowFunctionExpression" || path.node.init.type === "FunctionExpression") functions.set(path.node.id.name, path.node.init);
    },
    JSXElement(path) {
      if (path.node.start !== start || path.node.end !== end) return;
      target = path.node;
      ancestors = path.getAncestry().filter((item): item is typeof path => item.isJSXElement()).map((item) => item.node).slice(1);
      // Every function around the element, not just the nearest one: inside a list the nearest is the
      // map callback, and the props of the component are one step further out.
      for (let scope = path.getFunctionParent(); scope; scope = scope.getFunctionParent()) {
        for (const parameter of scope.node.params) {
          if (parameter.type === "Identifier") props.add(parameter.name);
          if (parameter.type !== "ObjectPattern") continue;
          for (const property of parameter.properties) {
            if (property.type === "ObjectProperty" && property.key.type === "Identifier") props.add(property.key.name);
            if (property.type === "RestElement" && property.argument.type === "Identifier") props.add(property.argument.name);
          }
        }
      }
    },
  });
  if (!target) return { actions: [] };

  const callsWithin = (from: number, to: number) => calls.filter((call) => within(call, from, to));

  /** What a function ends up doing, one level deep: here, or in the file that supplies it as a prop. */
  function bodyOf(name: string): string[] {
    const declared = functions.get(name);
    if (!declared || declared.start == null || declared.end == null) {
      if (!props.has(name)) return [];
      const lines = passedBy(callSites, name).flatMap((entry) => {
        const site = callSites.find((candidate) => candidate.file === entry.file);
        if (!site || !identifier.test(entry.expression)) return [];
        return functionBodyLines(site.source, entry.expression).map((line) => `${fileName(entry.file)}: ${line}`);
      });
      return [...new Set(lines)];
    }
    const inner = callsWithin(declared.start, declared.end)
      .map((call) => describeCall(source, call, props, callSites))
      .filter((line): line is string => Boolean(line));
    return [...new Set(inner)];
  }

  function actionsOf(element: JSXElement): InteractionAction[] {
    const actions: InteractionAction[] = [];
    const userAccess = staticValue(source, element, "data-fc-user-access");
    if (userAccess) {
      actions.push({ trigger: "Al click", summary: "apre la pagina di accesso del pannello", details: ["Scelta dell’account, PIN, utente attivo con i suoi permessi e uscita dal pannello."], values: [], dataProperties: [], handlers: [] });
    }
    const requires = staticValue(source, element, "data-fc-user-requires");
    if (requires) {
      actions.push({ trigger: "Al click", summary: `funziona solo con il permesso ${requires}`, details: ["Senza quel permesso l’elemento resta visibile ma bloccato, e il click non arriva al codice."], values: [], dataProperties: [], handlers: [] });
    }
    const highlight = staticValue(source, element, "data-fc-highlight-target");
    if (highlight) {
      const color = staticValue(source, element, "data-fc-highlight-color");
      actions.push({ trigger: "Al click", summary: `evidenzia la parte collegata${color ? ` con il colore ${color}` : ""}`, details: [], values: [], dataProperties: [], handlers: [] });
    }

    for (const name of ["href", "to"]) {
      const link = attributeValue(element, name);
      const target = staticValue(source, element, name);
      if (!target) continue;
      const literal = link?.type === "StringLiteral" ? link : undefined;
      actions.push({
        trigger: "Al click", summary: `apre il collegamento ${target}`, details: [], dataProperties: [], handlers: [],
        values: literal?.start != null && literal.end != null ? [{ label: "Indirizzo", kind: "link", value: literal.value, start: literal.start, end: literal.end }] : [],
      });
    }

    const submit = staticValue(source, element, "type");
    if (submit === "submit") actions.push({ trigger: "Al click", summary: "invia il form che lo contiene", details: [], values: [], dataProperties: [], handlers: [] });

    for (const attribute of element.openingElement.attributes) {
      if (attribute.type !== "JSXAttribute" || attribute.name.type !== "JSXIdentifier") continue;
      const name = attribute.name.name;
      if (!name.startsWith("on") || !attribute.value || attribute.value.type !== "JSXExpressionContainer") continue;
      const expression = attribute.value.expression;
      if (expression.type === "JSXEmptyExpression" || expression.start == null || expression.end == null) continue;
      if (highlight && name === "onClick") continue;

      // A component prop keeps its own name: "Su onPartToggle" says more than a guessed sentence.
      const trigger = triggers[name] ?? `Su ${name}`;
      const inner = callsWithin(expression.start, expression.end);
      if (expression.type === "Identifier") {
        actions.push({ trigger, summary: `chiama ${expression.name}`, details: bodyOf(expression.name), values: [], dataProperties: [], handlers: handlersFor([{ name: expression.name, start: expression.start, end: expression.end }], props, functions, source, file, callSites) });
        continue;
      }
      const described = inner.map((call) => describeCall(source, call, props, callSites)).filter((line): line is string => Boolean(line));
      const details = [...new Set(inner.flatMap((call) => (calleeName(call) ? bodyOf(calleeName(call)) : [])))];
      if (!described.length && !details.length) continue;
      actions.push({
        trigger,
        summary: described.length ? described.join(", poi ") : `esegue ${short(text(source, expression))}`,
        details: details.filter((line) => !described.includes(line)),
        // Only what the element itself passes is offered as a field: a literal buried in a shared
        // helper belongs to every caller of that helper, and changing it here would move all of them.
        values: inner.flatMap((call) => callValues(source, call)),
        dataProperties: [...new Set(inner.flatMap((call) => dataPropertiesOf(call)))],
        handlers: handlersFor(inner.map((call) => ({
          name: calleeName(call),
          start: call.callee.type === "Identifier" ? call.callee.start ?? -1 : -1,
          end: call.callee.type === "Identifier" ? call.callee.end ?? -1 : -1,
        })), props, functions, source, file, callSites),
      });
    }
    return actions;
  }

  const own = actionsOf(target);
  if (own.length) return { actions: own };

  // A label or a shape inside a button carries no handler: the answer the user is after is on the
  // element around it, so it is reported together with what it belongs to.
  for (const ancestor of ancestors) {
    const inherited = actionsOf(ancestor);
    if (!inherited.length) continue;
    const type = ancestor.openingElement.name.type === "JSXIdentifier" ? ancestor.openingElement.name.name : "elemento";
    return { actions: inherited, owner: { type, line: ancestor.loc?.start.line ?? 0 } };
  }
  return { actions: [] };
}
