export type HmiExpressionValue = string | number | boolean;

type Token = {
  type: "number" | "string" | "identifier" | "operator" | "left" | "right" | "comma" | "end";
  value: string;
  position: number;
};

type ExpressionNode =
  | { type: "literal"; value: HmiExpressionValue }
  | { type: "tag"; name: string }
  | { type: "unary"; operator: string; value: ExpressionNode }
  | { type: "binary"; operator: string; left: ExpressionNode; right: ExpressionNode }
  | { type: "call"; name: string; arguments: ExpressionNode[] };

export interface HmiExpressionInspection {
  tags: string[];
  error?: string;
}

export type HmiExpressionResult =
  | { value: HmiExpressionValue; tags: string[] }
  | { error: string; tags: string[] };

const binaryPrecedence: Record<string, number> = {
  "||": 1, OR: 1,
  XOR: 2,
  "&&": 3, AND: 3,
  "|": 4,
  "^": 5,
  "&": 6,
  "==": 7, "!=": 7, "===": 7, "!==": 7,
  "<": 8, "<=": 8, ">": 8, ">=": 8,
  "<<": 9, ">>": 9,
  "+": 10, "-": 10,
  "*": 11, "/": 11, "%": 11,
};

const unaryOperators = new Set(["!", "NOT", "+", "-", "~"]);
const wordOperators = new Set(["AND", "OR", "NOT", "XOR"]);
const functions = new Set(["bool", "number", "text", "abs", "round", "floor", "ceil", "min", "max"]);
const reservedLocals = new Set(["value"]);

function expressionError(message: string, position?: number): Error {
  return new Error(position === undefined ? message : `${message} alla posizione ${position + 1}`);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  const push = (type: Token["type"], value: string, start = position) => tokens.push({ type, value, position: start });

  while (position < source.length) {
    if (/\s/.test(source[position])) { position += 1; continue; }
    const start = position;
    const remaining = source.slice(position);
    const number = /^(?:0x[\da-f]+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)/i.exec(remaining)?.[0];
    if (number) { push("number", number, start); position += number.length; continue; }

    const quote = source[position];
    if (quote === '"' || quote === "'") {
      position += 1;
      let value = "";
      let closed = false;
      while (position < source.length) {
        const character = source[position++];
        if (character === quote) { closed = true; break; }
        if (character !== "\\") { value += character; continue; }
        if (position >= source.length) break;
        const escaped = source[position++];
        value += ({ n: "\n", r: "\r", t: "\t" } as Record<string, string>)[escaped] ?? escaped;
      }
      if (!closed) throw expressionError("Stringa non chiusa", start);
      push("string", value, start);
      continue;
    }

    const identifier = /^[@A-Za-z_$][\w@$]*(?:(?:\.[\w@$]+)|(?:\[\d+\]))*/.exec(remaining)?.[0];
    if (identifier) {
      const keyword = identifier.toUpperCase();
      push(wordOperators.has(keyword) ? "operator" : "identifier", wordOperators.has(keyword) ? keyword : identifier, start);
      position += identifier.length;
      continue;
    }

    const operator = ["===", "!==", "&&", "||", "==", "!=", "<=", ">=", "<<", ">>", "+", "-", "*", "/", "%", "<", ">", "!", "~", "&", "|", "^"].find((item) => remaining.startsWith(item));
    if (operator) { push("operator", operator, start); position += operator.length; continue; }
    if (source[position] === "(") { push("left", "(", start); position += 1; continue; }
    if (source[position] === ")") { push("right", ")", start); position += 1; continue; }
    if (source[position] === ",") { push("comma", ",", start); position += 1; continue; }
    throw expressionError(`Carattere "${source[position]}" non supportato`, position);
  }
  tokens.push({ type: "end", value: "", position: source.length });
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): ExpressionNode {
    const expression = this.binary(0);
    const token = this.current();
    if (token.type !== "end") throw expressionError(`Token "${token.value}" inatteso`, token.position);
    return expression;
  }

  private current(): Token { return this.tokens[this.index]; }
  private take(): Token { return this.tokens[this.index++]; }

  private binary(minimum: number): ExpressionNode {
    let left = this.unary();
    while (this.current().type === "operator") {
      const operator = this.current().value;
      const precedence = binaryPrecedence[operator];
      if (precedence === undefined || precedence < minimum) break;
      this.take();
      const right = this.binary(precedence + 1);
      left = { type: "binary", operator, left, right };
    }
    return left;
  }

  private unary(): ExpressionNode {
    const token = this.current();
    if (token.type === "operator" && unaryOperators.has(token.value)) {
      this.take();
      return { type: "unary", operator: token.value, value: this.unary() };
    }
    return this.primary();
  }

  private primary(): ExpressionNode {
    const token = this.take();
    if (token.type === "number") return { type: "literal", value: token.value.toLowerCase().startsWith("0x") ? Number.parseInt(token.value.slice(2), 16) : Number(token.value) };
    if (token.type === "string") return { type: "literal", value: token.value };
    if (token.type === "left") {
      const expression = this.binary(0);
      const closing = this.take();
      if (closing.type !== "right") throw expressionError("Manca la parentesi di chiusura", closing.position);
      return expression;
    }
    if (token.type !== "identifier") throw expressionError(token.type === "end" ? "Espressione incompleta" : `Token "${token.value}" inatteso`, token.position);

    const keyword = token.value.toLowerCase();
    if (keyword === "true" || keyword === "false") return { type: "literal", value: keyword === "true" };
    if (this.current().type !== "left") return { type: "tag", name: token.value };

    this.take();
    const arguments_: ExpressionNode[] = [];
    if (this.current().type !== "right") {
      while (true) {
        arguments_.push(this.binary(0));
        if (this.current().type !== "comma") break;
        this.take();
      }
    }
    const closing = this.take();
    if (closing.type !== "right") throw expressionError("Manca la parentesi di chiusura", closing.position);
    if (keyword === "tag") {
      const argument = arguments_[0];
      if (arguments_.length !== 1 || argument?.type !== "literal" || typeof argument.value !== "string" || !argument.value.trim()) {
        throw expressionError('tag() richiede un nome tra virgolette, per esempio tag("Linea 1.Ready")', token.position);
      }
      return { type: "tag", name: argument.value.trim() };
    }
    return { type: "call", name: keyword, arguments: arguments_ };
  }
}

function parse(source: string): ExpressionNode {
  if (!source.trim()) throw expressionError("L'espressione e' vuota");
  return new Parser(tokenize(source)).parse();
}

function collectTags(node: ExpressionNode, tags: Set<string>) {
  if (node.type === "tag") { if (!reservedLocals.has(node.name)) tags.add(node.name); return; }
  if (node.type === "unary") { collectTags(node.value, tags); return; }
  if (node.type === "binary") { collectTags(node.left, tags); collectTags(node.right, tags); return; }
  if (node.type === "call") node.arguments.forEach((argument) => collectTags(argument, tags));
}

function validateCalls(node: ExpressionNode) {
  if (node.type === "unary") { validateCalls(node.value); return; }
  if (node.type === "binary") { validateCalls(node.left); validateCalls(node.right); return; }
  if (node.type !== "call") return;
  if (!functions.has(node.name)) throw expressionError(`Funzione ${node.name}() non supportata dal simulatore`);
  if (["min", "max"].includes(node.name) ? node.arguments.length < 1 : node.arguments.length !== 1) {
    throw expressionError(["min", "max"].includes(node.name) ? `${node.name}() richiede almeno un valore` : `${node.name}() richiede un solo valore`);
  }
  node.arguments.forEach(validateCalls);
}

function normalizedValue(value: string): HmiExpressionValue {
  const trimmed = value.trim();
  if (/^(?:true|yes|on)$/i.test(trimmed)) return true;
  if (/^(?:false|no|off)$/i.test(trimmed)) return false;
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return value;
}

function asNumber(value: HmiExpressionValue): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const number = Number(value.trim());
  if (!Number.isFinite(number)) throw expressionError(`"${value}" non e' un numero`);
  return number;
}

export function hmiExpressionTruthy(value: HmiExpressionValue): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !/^(?:|0|false|no|off)$/i.test(value.trim());
}

function compare(left: HmiExpressionValue, right: HmiExpressionValue): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function evaluate(node: ExpressionNode, values: Readonly<Record<string, string>>): HmiExpressionValue {
  if (node.type === "literal") return node.value;
  if (node.type === "tag") {
    if (!Object.prototype.hasOwnProperty.call(values, node.name) || values[node.name].trim() === "") {
      throw expressionError(`Il tag ${node.name} non ha un valore di prova`);
    }
    return normalizedValue(values[node.name]);
  }
  if (node.type === "unary") {
    const value = evaluate(node.value, values);
    if (node.operator === "!" || node.operator === "NOT") return !hmiExpressionTruthy(value);
    if (node.operator === "+") return asNumber(value);
    if (node.operator === "-") return -asNumber(value);
    return ~asNumber(value);
  }
  if (node.type === "call") {
    const arguments_ = node.arguments.map((argument) => evaluate(argument, values));
    const first = arguments_[0];
    if (node.name === "bool") return hmiExpressionTruthy(first);
    if (node.name === "number") return asNumber(first);
    if (node.name === "text") return String(first);
    if (node.name === "abs") return Math.abs(asNumber(first));
    if (node.name === "round") return Math.round(asNumber(first));
    if (node.name === "floor") return Math.floor(asNumber(first));
    if (node.name === "ceil") return Math.ceil(asNumber(first));
    const numbers = arguments_.map(asNumber);
    return node.name === "min" ? Math.min(...numbers) : Math.max(...numbers);
  }

  const left = evaluate(node.left, values);
  if ((node.operator === "&&" || node.operator === "AND") && !hmiExpressionTruthy(left)) return false;
  if ((node.operator === "||" || node.operator === "OR") && hmiExpressionTruthy(left)) return true;
  const right = evaluate(node.right, values);
  switch (node.operator) {
    case "&&": case "AND": return hmiExpressionTruthy(right);
    case "||": case "OR": return hmiExpressionTruthy(right);
    case "XOR": return hmiExpressionTruthy(left) !== hmiExpressionTruthy(right);
    case "==": case "===": return left === right;
    case "!=": case "!==": return left !== right;
    case "<": return compare(left, right) < 0;
    case "<=": return compare(left, right) <= 0;
    case ">": return compare(left, right) > 0;
    case ">=": return compare(left, right) >= 0;
    case "+": return typeof left === "string" || typeof right === "string" ? `${left}${right}` : asNumber(left) + asNumber(right);
    case "-": return asNumber(left) - asNumber(right);
    case "*": return asNumber(left) * asNumber(right);
    case "/": { const divisor = asNumber(right); if (divisor === 0) throw expressionError("Divisione per zero"); return asNumber(left) / divisor; }
    case "%": { const divisor = asNumber(right); if (divisor === 0) throw expressionError("Divisione per zero"); return asNumber(left) % divisor; }
    case "&": return asNumber(left) & asNumber(right);
    case "|": return asNumber(left) | asNumber(right);
    case "^": return asNumber(left) ^ asNumber(right);
    case "<<": return asNumber(left) << asNumber(right);
    case ">>": return asNumber(left) >> asNumber(right);
    default: throw expressionError(`Operatore ${node.operator} non supportato`);
  }
}

export function inspectHmiExpression(source: string): HmiExpressionInspection {
  const tags = new Set<string>();
  try {
    const node = parse(source);
    collectTags(node, tags);
    validateCalls(node);
    return { tags: [...tags] };
  } catch (caught) {
    return { tags: [...tags], error: caught instanceof Error ? caught.message : String(caught) };
  }
}

export function evaluateHmiExpression(source: string, values: Readonly<Record<string, string>>): HmiExpressionResult {
  const inspection = inspectHmiExpression(source);
  if (inspection.error) return { error: inspection.error, tags: inspection.tags };
  try {
    return { value: evaluate(parse(source), values), tags: inspection.tags };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : String(caught), tags: inspection.tags };
  }
}
