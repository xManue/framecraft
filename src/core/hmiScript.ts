import { parse } from "@babel/parser";
import * as t from "@babel/types";
import { normalizeMqttTagValue } from "../../runtime/connection-config.mjs";
import type { HmiScriptProcessValue, HmiScriptProcessValueContext } from "./hmiProcessValue";
import type { HmiScriptQualityContext } from "./hmiCurrentQuality";
export type { HmiScriptProcessValue, HmiScriptProcessValueContext } from "./hmiProcessValue";

const normalizeProcessTag = normalizeMqttTagValue;

export type HmiScriptScalar = string | number | boolean | null;

export type HmiScriptPattern =
  | { kind: "name"; name: string }
  | { kind: "target"; object: HmiScriptExpression; key: HmiScriptExpression }
  | { kind: "default"; pattern: HmiScriptPattern; value: HmiScriptExpression }
  | { kind: "array-pattern"; items: (HmiScriptPattern | null)[]; rest?: HmiScriptPattern }
  | { kind: "object-pattern"; properties: { key: HmiScriptExpression; pattern: HmiScriptPattern }[]; rest?: HmiScriptPattern };

export type HmiScriptExpression =
  | { kind: "literal"; value: HmiScriptScalar }
  | { kind: "undefined" }
  | { kind: "construct"; callee: HmiScriptExpression; arguments: HmiScriptExpression[] }
  | { kind: "pattern-assign"; pattern: HmiScriptPattern; value: HmiScriptExpression }
  | { kind: "this" }
  | { kind: "array-hole" }
  | { kind: "spread"; value: HmiScriptExpression }
  | { kind: "function-value"; parameters: string[]; rest?: string; parameterPatterns?: HmiScriptPattern[]; functionLength?: number; program: HmiScriptProgram; name?: string; arrow?: boolean; displayName?: string; errorType?: string }
  | { kind: "invoke"; callee: HmiScriptExpression; arguments: HmiScriptExpression[] }
  | { kind: "local"; name: string }
  | { kind: "module-variable"; name: string }
  | { kind: "array"; items: HmiScriptExpression[] }
  | { kind: "object"; entries: { name: string; value: HmiScriptExpression; spread?: true; possible?: true }[] }
  | { kind: "member"; object: HmiScriptExpression; key: HmiScriptExpression }
  | { kind: "array-method"; object: HmiScriptExpression; method: string; arguments: HmiScriptExpression[] }
  | { kind: "data-call"; name: string; arguments: HmiScriptExpression[] }
  | { kind: "screen-item"; scope: "screen" | "faceplate"; name: HmiScriptExpression }
  | { kind: "property-flashing"; item: HmiScriptExpression; arguments: HmiScriptExpression[] }
  | { kind: "tag-ref"; name: string }
  | { kind: "tag-set"; entries: { name: string; value?: HmiScriptExpression }[] }
  | { kind: "tag-set-item"; set: HmiScriptExpression; tag: HmiScriptExpression }
  | { kind: "tag-read"; tag: HmiScriptExpression }
  | { kind: "runtime-property"; object: HmiScriptExpression; property: "Count" | "QualityCode" | "TimeStamp" | "LastError" | "ErrorDescription" }
  | { kind: "unary"; operator: string; value: HmiScriptExpression }
  | { kind: "binary"; operator: string; left: HmiScriptExpression; right: HmiScriptExpression }
  | { kind: "conditional"; test: HmiScriptExpression; consequent: HmiScriptExpression; alternate: HmiScriptExpression }
  | { kind: "call"; name: string; arguments: HmiScriptExpression[] }
  | { kind: "module-call"; name: string; arguments: HmiScriptExpression[] }
  | { kind: "popup-open"; scope: "screen" | "faceplate"; faceplateType: HmiScriptExpression; title: HmiScriptExpression; interfaceValues: HmiScriptPopupInterfaceValue[]; parentBound: boolean; independentWindow?: HmiScriptExpression; invisible?: HmiScriptExpression; popupWindowName?: HmiScriptExpression; adaptWindow?: HmiScriptExpression; left?: HmiScriptExpression; top?: HmiScriptExpression; width?: HmiScriptExpression; height?: HmiScriptExpression }
  | { kind: "popup-property"; popup: HmiScriptExpression; property: HmiScriptPopupProperty }
  | { kind: "timer-set"; mode: "timeout" | "interval"; callback: HmiScriptTimerCallback | { kind: "value"; value: HmiScriptExpression }; delay: HmiScriptExpression };

export type HmiScriptStatement =
  | { kind: "throw"; value: HmiScriptExpression }
  | { kind: "bind"; pattern: HmiScriptPattern; value: HmiScriptExpression; constant?: boolean; functionScoped?: boolean }
  | { kind: "declare"; name: string; value?: HmiScriptExpression; constant?: boolean; functionScoped?: boolean }
  | { kind: "block"; statements: HmiScriptStatement[] }
  | { kind: "break" }
  | { kind: "function-declare"; name: string; value: Extract<HmiScriptExpression, { kind: "function-value" }> }
  | { kind: "assign"; name: string; value: HmiScriptExpression }
  | { kind: "member-set"; object: HmiScriptExpression; key: HmiScriptExpression; value: HmiScriptExpression }
  | { kind: "expression"; value: HmiScriptExpression }
  | { kind: "return"; value?: HmiScriptExpression }
  | { kind: "trace"; value: HmiScriptExpression }
  | { kind: "write"; tag: HmiScriptExpression; value: HmiScriptExpression }
  | { kind: "tag-set-read"; set: HmiScriptExpression; async?: boolean; mode?: HmiScriptExpression; maxAge?: HmiScriptExpression }
  | { kind: "tag-set-add"; set: HmiScriptExpression; entries: { name: string; value?: HmiScriptExpression }[] }
  | { kind: "tag-set-remove"; set: HmiScriptExpression; names: string[] }
  | { kind: "tag-set-clear"; set: HmiScriptExpression }
  | { kind: "tag-set-stage"; set: HmiScriptExpression; tag: HmiScriptExpression; property: "Value" | "QualityCode" | "TimeStamp"; value: HmiScriptExpression }
  | { kind: "tag-set-write"; set: HmiScriptExpression; async?: boolean; mode?: HmiScriptExpression; qcd?: boolean }
  | { kind: "qcd-write"; target: HmiScriptExpression; arguments: HmiScriptExpression[] }
  | { kind: "operator-write"; target: HmiScriptExpression; reason: HmiScriptExpression; value?: HmiScriptExpression }
  | { kind: "tag-set-promise"; operation: "read" | "write"; set: HmiScriptExpression; mode?: HmiScriptExpression; maxAge?: HmiScriptExpression; qcd?: boolean; success?: { name?: string; arrow?: boolean; statements: HmiScriptStatement[] }; failure?: { name?: string; arrow?: boolean; statements: HmiScriptStatement[] } }
  | { kind: "try"; statements: HmiScriptStatement[]; failure?: { name?: string; arrow?: boolean; statements: HmiScriptStatement[] }; final: HmiScriptStatement[] }
  | { kind: "bit"; operation: "set" | "reset" | "toggle"; tag: HmiScriptExpression; bit: HmiScriptExpression }
  | { kind: "navigate"; target: HmiScriptExpression }
  | { kind: "module-call"; call: Extract<HmiScriptExpression, { kind: "module-call" }> }
  | { kind: "timer-set"; timer: Extract<HmiScriptExpression, { kind: "timer-set" }> }
  | { kind: "timer-clear"; mode: "timeout" | "interval"; id: HmiScriptExpression }
  | { kind: "popup-set"; popup: HmiScriptExpression; property: HmiScriptPopupProperty; value: HmiScriptExpression }
  | { kind: "popup-close"; popup?: HmiScriptExpression }
  | { kind: "raise-faceplate-event"; name: HmiScriptExpression; parameters: { name: string; value: HmiScriptExpression }[] }
  | { kind: "if"; test: HmiScriptExpression; consequent: HmiScriptStatement[]; alternate: HmiScriptStatement[] }
  | { kind: "switch"; value: HmiScriptExpression; cases: { test?: HmiScriptExpression; statements: HmiScriptStatement[] }[] };

export interface HmiScriptProgram {
  /** IR 1: legacy flat bindings. IR 2: lexical blocks. IR 3: callable values and closures. IR 4: undefined, sparse arrays and callbacks. IR 5: this and receiver semantics. IR 6: data/argument spreads and rest parameters. IR 7: binding patterns and parameter initialization. IR 8: assignment patterns and thrown values. IR 9: isolated Error objects and constructors. */
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  statements: HmiScriptStatement[];
  exports?: { name: string; local: string }[];
}

export type HmiScriptTimerCallback =
  | { kind: "inline"; program: HmiScriptProgram }
  | { kind: "function"; call: Extract<HmiScriptExpression, { kind: "module-call" }> };

export interface HmiScriptInspection {
  tagsRead: string[];
  tagsWritten: string[];
  hasReturn: boolean;
  hasAsync: boolean;
  program?: HmiScriptProgram;
  error?: string;
}

export interface HmiScriptExecution {
  /** Internal only: preserves an explicit thrown value across nested coroutine calls. */
  thrownReference?: RuntimeValue;
  /** Internal only: lets legacy callers retain their host-error string contract. */
  thrownFromHost?: true;
  returned?: HmiScriptScalar;
  returnedReference?: RuntimeValue;
  writes: Record<string, string>;
  traces: string[];
  navigation: string[];
  operatorMessages: HmiScriptOperatorMessage[];
  faceplateEvents: HmiScriptFaceplateEvent[];
  tagStatus: Record<string, HmiScriptTagStatus>;
  reads?: Record<string, string>;
  commands?: HmiScriptCommandResult[];
  steps: number;
  error?: string;
}

export interface HmiScriptFaceplateEvent {
  name: string;
  parameters: Record<string, HmiScriptScalar>;
}

export type HmiScriptPopupProperty = "Left" | "Top" | "Width" | "Height" | "Visible" | "WindowFlags";

export type HmiScriptPopupInterfaceValue =
  | { name: string; kind: "value"; value: HmiScriptExpression }
  | { name: string; kind: "tag"; tag: string };

export interface HmiScriptPopupOpenOptions {
  scope: "screen" | "faceplate";
  faceplateType: string;
  title: string;
  interfaceValues: Record<string, HmiScriptScalar | { Tag: string }>;
  parentBound: boolean;
  invisible: boolean;
  popupWindowName?: string;
  adaptWindow: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HmiScriptPopupReference { readonly popupId: string }

export interface HmiScriptBox { Left:number; Top:number; Width:number; Height:number }
export interface HmiScriptScreenItemReference { readonly screenItemId: string; readonly screenPropertyPath?: "Font" | "Margin" | "Padding" | "Caption" | "Title" | "Caption.Font" | "Title.Font" }
export interface HmiScriptScreenItemManager {
  resolve(scope: "screen" | "faceplate" | "item", name?: string): HmiScriptScreenItemReference;
  /** Current members, excluding the root and interiors of nested faceplates. */
  items?(scope: "screen" | "faceplate"): HmiScriptScreenItemReference[];
  get(reference: HmiScriptScreenItemReference, property: string): HmiScriptScalar | HmiScriptScreenItemReference;
  processValue?(reference:HmiScriptScreenItemReference,context:HmiScriptProcessValueContext,writing?:boolean):HmiScriptProcessValue;
  currentQuality?(reference:HmiScriptScreenItemReference,context:HmiScriptQualityContext):number;
  set(reference: HmiScriptScreenItemReference, property: string, value: HmiScriptScalar): void;
  propertyFlashing(reference: HmiScriptScreenItemReference, args: HmiScriptScalar[]): boolean;
  getBoundingBox?(reference:HmiScriptScreenItemReference):HmiScriptBox|null;
  getBoundingBoxAsync?(reference:HmiScriptScreenItemReference,signal:AbortSignal):Promise<HmiScriptBox|null>;
  setMargin?(reference:HmiScriptScreenItemReference,value:{Left:number;Top:number;Right:number;Bottom:number}):void;
  setPadding?(reference:HmiScriptScreenItemReference,value:{Left:number;Top:number;Right:number;Bottom:number}):void;
}

export interface HmiScriptPopupManager {
  open(options: HmiScriptPopupOpenOptions): HmiScriptPopupReference;
  get(reference: HmiScriptPopupReference, property: HmiScriptPopupProperty): HmiScriptScalar;
  set(reference: HmiScriptPopupReference, property: HmiScriptPopupProperty, value: HmiScriptScalar): void;
  close(reference?: HmiScriptPopupReference): void;
}

export interface HmiScriptOperatorMessage {
  tag: string;
  reason: string;
  oldValue: string;
  newValue: string;
  user?: string;
  host?: string;
  unit?: string;
}

type TagReference = { readonly tag: string; readonly tagSet?: TagSetState };
interface RuntimeTagStatus extends HmiScriptTagStatus { qualityCode: number; timeStamp: string | number; lastError: number; errorDescription: string }
type TagSetState = { names: string[]; pending: Record<string, HmiScriptScalar>; status: Record<string, RuntimeTagStatus>; lastError: number; errorDescription: string };
type TagSetReference = { readonly tagSet: TagSetState };
type DataReference = { readonly data: RuntimeValue[] | Record<string, RuntimeValue>; readonly errorType?: string };
type FunctionIntrinsic = "call" | "apply" | "bind" | "screen-items" | "screen-box" | "error-constructor" | "error-to-string";
interface HmiScriptThisBinding { value?: RuntimeValue; screenItems?: HmiScriptScreenItemManager }

type FunctionReference = { readonly scriptFunction: { parameters: readonly string[]; rest?: string; parameterPatterns?: HmiScriptPattern[]; functionLength?: number; program: HmiScriptProgram; scope?: HmiScriptScope; functions?: HmiScriptExecutionOptions["functions"]; variables?: HmiScriptExecutionOptions["variables"]; globalScope?: HmiScriptScope; name?: string; arrow?: boolean; lexicalThis?: HmiScriptThisBinding; intrinsic?: FunctionIntrinsic; errorType?: string; screenBox?: {manager:HmiScriptScreenItemManager}; screenCollection?: {scope:"screen"|"faceplate";manager:HmiScriptScreenItemManager;root:HmiScriptScreenItemReference}; bound?: { target: FunctionReference; thisArg: RuntimeValue; args: RuntimeValue[]; depth: number; count: number } } };

type UndefinedReference = { readonly undefinedValue: true; readonly reason?: string };

type RuntimeValue = UndefinedReference | FunctionReference | HmiScriptScalar | TagReference | TagSetReference | HmiScriptPopupReference | HmiScriptScreenItemReference | DataReference;

export interface HmiScriptScope {
  values: Map<string, RuntimeValue>;
  constants: Set<string>;
  /** A lexical binding before its declaration (TDZ), not a readable null value. */
  uninitialized?: Set<string>;
  /** Undefined is not an IR scalar: reject reads until a value has been assigned. */
  unassigned?: Set<string>;
  parent?: HmiScriptScope;
  initializer?: HmiScriptProgram;
  status: "new" | "initializing" | "ready" | "failed";
  error?: string;
  active: boolean;
}

export function createHmiScriptScope(initializer?: HmiScriptProgram, parent?: HmiScriptScope): HmiScriptScope {
  return { values: new Map(), constants: new Set(), initializer, parent, status: initializer ? "new" : "ready", active: true };
}

export interface HmiScriptTagStatus {
  /** A locally entered value is not a PLC acquisition. */
  localValue?: boolean;
  qualityCode?: number;
  qualityKnown?: boolean;
  timeStamp?: string | number;
  lastError?: number;
  errorDescription?: string;
}

export interface HmiScriptTagFailure { code?: number; description?: string }

export interface HmiScriptCommandResult {
  tag: string;
  outcome: "delivered" | "rejected" | "uncertain";
  delivery?: "broker-ack" | "transport" | "opcua-service";
  plcConfirmed: false;
  id?: string;
  error?: string;
}
export type HmiScriptTransportRequest =
  | { kind: "read"; tag: string; mode: number; maxAge?: number }
  | { kind: "write"; tag: string; value: HmiScriptScalar; mode: number; qcd?: boolean; operatorReason?: string };
export interface HmiScriptTransport {
  read(request: Extract<HmiScriptTransportRequest, { kind: "read" }>, signal: AbortSignal): Promise<{ value: string; status: HmiScriptTagStatus }>;
  write(request: Extract<HmiScriptTransportRequest, { kind: "write" }>, signal: AbortSignal): Promise<HmiScriptCommandResult>;
}
type HmiScriptHostRequest = HmiScriptTransportRequest | {kind:"screen-box";manager:HmiScriptScreenItemManager;reference:HmiScriptScreenItemReference};
type ScriptCoroutine<T> = Generator<HmiScriptHostRequest, T, unknown>;

function* mapScriptValues<T, U>(items: readonly T[], mapper: (item: T) => ScriptCoroutine<U>): ScriptCoroutine<U[]> {
  const result: U[] = [];
  for (const item of items) result.push(yield* mapper(item));
  return result;
}
function* findScriptValue<T>(items: readonly T[], predicate: (item: T) => ScriptCoroutine<unknown>): ScriptCoroutine<T | undefined> {
  for (const item of items) if (yield* predicate(item)) return item;
  return undefined;
}

export interface HmiScriptExecutionOptions {
  returnByReference?: boolean;
  maxSteps?: number;
  timeoutMs?: number;
  locals?: Readonly<Record<string, RuntimeValue>>;
  globalScope?: HmiScriptScope;
  closureScope?: HmiScriptScope;
  /** This esplicito e binding interno; nessun oggetto host viene esposto allo script. */
  thisValue?: RuntimeValue;
  thisBinding?: HmiScriptThisBinding;
  scriptContext?: "events" | "dynamizations" | "scheduler";
  /** Interno: le dichiarazioni iniziali appartengono al contesto, non a una chiamata. */
  initializingScope?: HmiScriptScope;
  tagStatus?: Readonly<Record<string, HmiScriptTagStatus>>;
  readFailures?: Readonly<Record<string, HmiScriptTagFailure>>;
  writeFailures?: Readonly<Record<string, HmiScriptTagFailure>>;
  operatorContext?: { user?: string; host?: string; units?: Readonly<Record<string, string>> };
  /** Funzioni compilate dei moduli globali e della definizione locale della pagina corrente. */
  functions?: Readonly<Record<string, HmiScriptRuntimeFunction>>;
  variables?: Readonly<Record<string, HmiScriptRuntimeVariable>>;
  /** Gestore persistente dei timer del Runtime o della prova pannello. */
  timerManager?: HmiScriptTimerManager;
  /** Gestore persistente delle finestre faceplate nella prova pannello o nel Runtime esportato. */
  popupManager?: HmiScriptPopupManager;
  screenItems?: HmiScriptScreenItemManager;
  /** Interno: impedisce ricorsioni infinite fra funzioni utente. */
  callStack?: readonly string[];
  /** Usato soltanto dall'esecutore Promise esportato; quello sincrono rifiuta le operazioni async. */
  allowAsync?: boolean;
  transport?: HmiScriptTransport;
  localTags?: ReadonlySet<string>;
  localTagValues?: Record<string, string>;
  signal?: AbortSignal;
  isActive?: () => boolean;
  transportTimeoutMs?: number;
  /** Interno: il tempo in attesa della rete non consuma il budget CPU, anche nei moduli. */
  suspensionClock?: { elapsed: number };
  /** Internal invocation input; parameter initializers execute before body declarations. */
  parameterBindings?: { patterns: HmiScriptPattern[]; values: RuntimeValue[] };
}

export interface HmiScriptRuntimeFunction {
  parameters: readonly string[];
  program: HmiScriptProgram;
  globalDefinition?: HmiScriptProgram;
  tagsRead?: readonly string[];
  tagsWritten?: readonly string[];
  hasAsync?: boolean;
  globalScope?: HmiScriptScope;
}

export interface HmiScriptRuntimeVariable {
  name: string;
  definition: HmiScriptProgram;
  globalScope?: HmiScriptScope;
}

export interface HmiScriptTimerManager {
  set(mode: "timeout" | "interval", callback: HmiScriptTimerCallback, delayMs: number, context?: HmiScriptTimerContext): number;
  clear(mode: "timeout" | "interval", id: number): boolean;
}

export interface HmiScriptTimerContext extends Pick<HmiScriptExecutionOptions, "transport" | "transportTimeoutMs" | "localTags" | "localTagValues" | "signal" | "isActive"> {
  screenItems?: HmiScriptScreenItemManager;
  functions?: Readonly<Record<string, HmiScriptRuntimeFunction>>;
  variables?: Readonly<Record<string, HmiScriptRuntimeVariable>>;
  globalScope?: HmiScriptScope;
  closureScope?: HmiScriptScope;
  thisBinding?: HmiScriptThisBinding;
  scriptContext?: HmiScriptExecutionOptions["scriptContext"];
}

const safeCalls = new Set(["Boolean", "Number", "String", "Math.abs", "Math.round", "Math.floor", "Math.ceil", "Math.min", "Math.max", "HMIRuntime.Math.RGB"]);
const forbiddenCalls = new Set(["eval", "Function", "fetch", "setTimeout", "setInterval", "queueMicrotask", "alert", "confirm", "prompt"]);
const binaryOperators = new Set(["+", "-", "*", "/", "%", "**", "==", "!=", "===", "!==", "<", "<=", ">", ">=", "&", "|", "^", "<<", ">>", ">>>", "&&", "||", "??", "instanceof"]);
const unaryOperators = new Set(["!", "+", "-", "~", "typeof"]);
const gestureEnums = new Map([
  ["UI.Enums.HmiGesture.Unknown", "Unknown"],
  ["UI.Enums.HmiGesture.SwipeRight", "SwipeRight"],
  ["UI.Enums.HmiGesture.SwipeLeft", "SwipeLeft"],
  ["UI.Enums.HmiGesture.SwipeUp", "SwipeUp"],
  ["UI.Enums.HmiGesture.SwipeDown", "SwipeDown"],
]);
const runtimeEnums = new Map([
  ["UI.Enums.HmiFlashingRate.Slow", 0],
  ["UI.Enums.HmiFlashingRate.Medium", 1],
  ["UI.Enums.HmiFlashingRate.Fast", 2],
  ["HMIRuntime.Tags.Enums.hmiReadType.hmiReadCache", 0],
  ["HMIRuntime.Tags.Enums.hmiReadType.hmiReadDirect", 1],
  ["HMIRuntime.Tags.Enums.hmiWriteType.hmiWriteNoWait", 0],
  ["HMIRuntime.Tags.Enums.hmiWriteType.hmiWriteWait", 1],
  ["UI.Enums.HmiWindowFlag.None", 0],
  ["UI.Enums.HmiWindowFlag.ShowCaption", 1],
  ["UI.Enums.HmiWindowFlag.ShowBorder", 2],
  ["UI.Enums.HmiWindowFlag.AlwaysOnTop", 4],
  ["UI.Enums.HmiWindowFlag.CanSize", 8],
  ["UI.Enums.HmiWindowFlag.CanMove", 16],
  ["UI.Enums.HmiWindowFlag.CanMaximize", 32],
  ["UI.Enums.HmiWindowFlag.CanClose", 64],
  ["UI.Enums.HmiWindowFlag.AlwaysInParent", 128],
]);

function fail(message: string, node?: t.Node): never {
  const place = node?.loc?.start;
  throw new Error(place ? `${message} (riga ${Math.max(1, place.line - 1)}, colonna ${place.column + 1})` : message);
}

function memberName(node: t.MemberExpression): string | undefined {
  if (!node.computed && t.isIdentifier(node.property)) return node.property.name;
  if (node.computed && t.isStringLiteral(node.property)) return node.property.value;
  return undefined;
}

function dottedName(node: t.Expression | t.V8IntrinsicIdentifier): string | undefined {
  if (t.isIdentifier(node)) return node.name;
  if (!t.isMemberExpression(node) || !t.isExpression(node.object)) return undefined;
  const left = dottedName(node.object);
  const right = memberName(node);
  return left && right ? `${left}.${right}` : undefined;
}

function literal(node: t.Expression): HmiScriptExpression | undefined {
  if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node)) return { kind: "literal", value: node.value };
  if (t.isNullLiteral(node)) return { kind: "literal", value: null };
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) return { kind: "literal", value: node.quasis[0]?.value.cooked ?? "" };
  return undefined;
}

function compileTagFactory(call: t.CallExpression): HmiScriptExpression | undefined {
  const name = dottedName(call.callee);
  if (name !== "Tags" && name !== "Tag" && name !== "HMIRuntime.Tags") return undefined;
  const argument = call.arguments[0];
  if (call.arguments.length !== 1 || !t.isStringLiteral(argument) || !argument.value.trim()) fail(`${name}() richiede un nome tag tra virgolette`, call);
  return { kind: "tag-ref", name: argument.value.trim() };
}

function compileTagSetEntries(argument: t.Expression, label: string): { name: string; value?: HmiScriptExpression }[] {
  const entry = (node: t.Expression): { name: string; value?: HmiScriptExpression } => {
    if (t.isStringLiteral(node) && node.value.trim()) return { name: node.value.trim() };
    if (t.isArrayExpression(node) && node.elements.length === 2 && t.isStringLiteral(node.elements[0]) && node.elements[0].value.trim() && node.elements[1] && t.isExpression(node.elements[1])) {
      return { name: node.elements[0].value.trim(), value: compileExpression(node.elements[1]) };
    }
    fail("Ogni voce del TagSet deve essere un nome tag o una coppia [nome, valore]", node);
  };
  if (t.isStringLiteral(argument)) return [entry(argument)];
  if (!t.isArrayExpression(argument) || argument.elements.some((item) => !item || t.isSpreadElement(item) || !t.isExpression(item))) {
    fail(`${label} richiede nomi tag statici`, argument);
  }
  return argument.elements.map((item) => entry(item as t.Expression));
}

function compileTagSetFactory(call: t.CallExpression): HmiScriptExpression | undefined {
  const name = dottedName(call.callee);
  if (name !== "Tags.CreateTagSet" && name !== "HMIRuntime.Tags.CreateTagSet") return undefined;
  if (call.arguments.length > 1 || call.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) {
    fail(`${name} accetta una stringa, un array di nomi o un array di coppie nome/valore`, call);
  }
  const argument = call.arguments[0];
  if (!argument) return { kind: "tag-set", entries: [] };
  if (!t.isExpression(argument)) fail(`${name} richiede nomi tag statici`, argument);
  return { kind: "tag-set", entries: compileTagSetEntries(argument, name) };
}

function compilePattern(node: t.Node, depth = 0, assignment = false): HmiScriptPattern {
  if (depth >= 32) fail("Il pattern supera 32 livelli.", node);
  if (t.isIdentifier(node)) return { kind: "name", name: node.name };
  if (assignment && t.isMemberExpression(node) && t.isExpression(node.object)) {
    if (/^Modules\.[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(dottedName(node) ?? "")) fail("Le variabili importate da un modulo sono in sola lettura: chiama una funzione del modulo per cambiarle.", node);
    return { kind: "target", object: compileExpression(node.object), key: compileMemberKey(node) };
  }
  if (t.isAssignmentPattern(node)) {
    const pattern = compilePattern(node.left, depth + 1, assignment), value = compileExpression(node.right);
    if (pattern.kind === "name" && value.kind === "function-value" && !value.name) value.displayName = pattern.name;
    return { kind: "default", pattern, value };
  }
  if (t.isArrayPattern(node)) {
    if (node.elements.length > 1024) fail("Il pattern supera 1024 elementi.", node);
    const last = node.elements.at(-1), rest = t.isRestElement(last) ? compilePattern(last.argument, depth + 1, assignment) : undefined;
    return { kind: "array-pattern", items: (rest ? node.elements.slice(0, -1) : node.elements).map(item => item ? compilePattern(item, depth + 1, assignment) : null), ...(rest ? { rest } : {}) };
  }
  if (t.isObjectPattern(node)) {
    if (node.properties.length > 1024) fail("Il pattern supera 1024 proprietà.", node);
    const properties: Extract<HmiScriptPattern, { kind: "object-pattern" }>["properties"] = [];let rest: HmiScriptPattern | undefined;
    for (const item of node.properties) {
      if (t.isRestElement(item)) { rest = compilePattern(item.argument, depth + 1, assignment); continue; }
      if (!t.isObjectProperty(item)) fail("Proprietà del pattern non supportata.", item);
      const key = item.computed ? compileExpression(item.key as t.Expression) : { kind: "literal" as const, value: dataKey(t.isIdentifier(item.key) ? item.key.name : t.isStringLiteral(item.key) || t.isNumericLiteral(item.key) ? item.key.value : "") };
      properties.push({ key, pattern: compilePattern(item.value, depth + 1, assignment) });
    }
    return { kind: "object-pattern", properties, ...(rest ? { rest } : {}) };
  }
  fail("Il binding richiede un nome o un pattern di array/oggetto.", node);
}
export function patternNames(pattern: HmiScriptPattern, depth = 0): string[] {
  if (!pattern || depth >= 32) throw new Error("Pattern non valido o oltre 32 livelli.");
  if (pattern.kind === "name") return [pattern.name];
  if (pattern.kind === "target") return [];
  if (pattern.kind === "default") return patternNames(pattern.pattern, depth + 1);
  const nested = pattern.kind === "array-pattern" ? pattern.items.filter((item): item is HmiScriptPattern => Boolean(item)) : pattern.properties.map(item => item.pattern);
  const result = [...nested, ...(pattern.rest ? [pattern.rest] : [])].flatMap(item => patternNames(item, depth + 1));
  if (result.length > 1024) throw new Error("Il pattern supera 1024 binding.");
  return result;
}
function compileFunctionValue(node: t.FunctionExpression | t.ArrowFunctionExpression | t.FunctionDeclaration | t.ObjectMethod): Extract<HmiScriptExpression, { kind: "function-value" }> {
  if (node.async || node.generator) fail("Le funzioni valore devono essere sincrone; await resta disponibile nelle azioni TagSet previste.", node);
  if (node.params.length > 32) fail("La funzione supera 32 parametri.", node);
  const nonSimple = node.params.some(parameter => !t.isIdentifier(parameter));
  const last = node.params.at(-1), restNode = t.isRestElement(last) ? last : undefined;
  const fixed = restNode ? node.params.slice(0, -1) : node.params;
  const parameters = fixed.map((parameter, index) => t.isIdentifier(parameter) ? parameter.name : "[argument" + index + "]");
  const parameterPatterns = nonSimple ? [...fixed.map(parameter => compilePattern(parameter)), ...(restNode ? [compilePattern(restNode.argument)] : [])] : undefined;
  const rest = restNode ? "[rest]" : undefined;
  const boundNames = nonSimple ? parameterPatterns!.flatMap(pattern => patternNames(pattern)) : parameters;
  if (new Set(boundNames).size !== boundNames.length) fail("I nomi dei parametri devono essere distinti.", node);
  const firstOptional = node.params.findIndex(parameter => t.isAssignmentPattern(parameter) || t.isRestElement(parameter));
  const functionLength = firstOptional < 0 ? node.params.length : firstOptional;
  const reserved = new Set([...safeCalls].map(name => name.split(".")[0]).concat([...forbiddenCalls], ["Tags", "Tag", "Modules", "Local", "UI", "Screen", "Faceplate", "Object", "JSON", "undefined"]));
  const names = [...boundNames, ...("id" in node && node.id ? [node.id.name] : [])];
  if (names.some(name => reserved.has(name))) fail("Nomi delle API HMI riservati: scegli un altro nome per la funzione o per il parametro.", node);
  let statements: HmiScriptStatement[];
  if (t.isBlockStatement(node.body)) statements = compileBlock(node.body);
  else if (t.isCallExpression(node.body)) {
    const action = compileCallStatement(node.body);
    statements = [!["expression", "module-call", "timer-set", "tag-set-read"].includes(action.kind) ? action : { kind: "return", value: compileExpression(node.body) }];
  } else statements = [{ kind: "return", value: compileExpression(node.body) }];
  return { kind: "function-value", parameters, ...(parameterPatterns ? { parameterPatterns, functionLength, ...(rest ? { rest } : {}) } : {}), program: { version: 9, statements }, arrow: t.isArrowFunctionExpression(node), ...("id" in node && node.id ? { name: node.id.name } : {}) };
}

function compileTimerCallback(node: t.CallExpression["arguments"][number] | undefined, label: string): Extract<HmiScriptExpression, { kind: "timer-set" }>["callback"] {
  if (!node || !t.isExpression(node)) fail(label + " richiede una funzione e il ritardo in millisecondi.");
  if (t.isMemberExpression(node)) {
    const name = dottedName(node);
    if (name && (/^Modules\.[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(name) || /^Local\.[A-Za-z_$][\w$]*$/.test(name))) return { kind: "function", call: { kind: "module-call", name, arguments: [] } };
  }
  return { kind: "value", value: compileExpression(node) };
}

function compileTimerSet(call: t.CallExpression): Extract<HmiScriptExpression, { kind: "timer-set" }> | undefined {
  const name = dottedName(call.callee);
  const mode = name === "HMIRuntime.Timers.SetTimeout" ? "timeout" : name === "HMIRuntime.Timers.SetInterval" ? "interval" : undefined;
  if (!mode) return undefined;
  if (call.arguments.length !== 2 || call.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) {
    fail(`${name} richiede callback e ritardo in millisecondi`, call);
  }
  return { kind: "timer-set", mode, callback: compileTimerCallback(call.arguments[0], name!), delay: compileExpression(call.arguments[1]) };
}

function popupInterfaceValues(node: t.CallExpression["arguments"][number] | undefined): HmiScriptPopupInterfaceValue[] {
  if (!node || !t.isObjectExpression(node)) fail("UI.OpenFaceplateInPopup richiede l'interfaccia in notazione oggetto", node && t.isNode(node) ? node : undefined);
  return node.properties.map((property) => {
    if (!t.isObjectProperty(property) || property.computed || property.shorthand || !t.isExpression(property.value)) fail("Ogni voce dell'interfaccia popup deve avere nome e valore semplici", property);
    const name = t.isIdentifier(property.key) ? property.key.name : t.isStringLiteral(property.key) ? property.key.value : undefined;
    if (!name || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)) fail("Nome interfaccia popup non valido", property.key);
    if (t.isObjectExpression(property.value)) {
      if (property.value.properties.length !== 1) fail(`Il binding tag di ${name} deve contenere soltanto Tag`, property.value);
      const tagProperty = property.value.properties[0];
      if (!t.isObjectProperty(tagProperty) || tagProperty.computed || !t.isIdentifier(tagProperty.key, { name: "Tag" }) || !t.isStringLiteral(tagProperty.value) || !tagProperty.value.value.trim()) fail(`Il binding tag di ${name} richiede { Tag: "NomeTag" }`, property.value);
      return { name, kind: "tag" as const, tag: tagProperty.value.value.trim() };
    }
    return { name, kind: "value" as const, value: compileExpression(property.value) };
  });
}

function optionalPopupExpression(call: t.CallExpression, index: number, label: string): HmiScriptExpression | undefined {
  const argument = call.arguments[index];
  if (!argument || t.isNullLiteral(argument) || t.isIdentifier(argument, { name: "undefined" })) return undefined;
  if (!t.isExpression(argument)) fail(`${label} non valido`, argument);
  return compileExpression(argument);
}

function compilePopupOpen(call: t.CallExpression): Extract<HmiScriptExpression, { kind: "popup-open" }> | undefined {
  const name = dottedName(call.callee);
  const screen = name === "UI.OpenFaceplateInPopup" || name === "HMIRuntime.UI.OpenFaceplateInPopup";
  const faceplate = name === "Faceplate.OpenFaceplateInPopup";
  if (!screen && !faceplate) return undefined;
  const maximum = screen ? 11 : 10;
  if (call.arguments.length < (screen ? 3 : 2) || call.arguments.length > maximum || call.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) {
    fail(`${name} richiede i parametri documentati da WinCC Unified`, call);
  }
  const faceplateType = call.arguments[0]; const title = call.arguments[1];
  if (!t.isExpression(faceplateType) || !t.isExpression(title)) fail(`${name} richiede tipo e titolo`, call);
  if (screen) {
    const parent = call.arguments[3];
    if (parent && !(t.isNullLiteral(parent) || t.isIdentifier(parent, { name: "undefined" }) || dottedName(parent as t.Expression) === "UI.ActiveScreen" || dottedName(parent as t.Expression) === "HMIRuntime.UI.ActiveScreen")) fail("parentScreen supporta UI.ActiveScreen oppure un valore omesso", parent);
    return {
      kind: "popup-open", scope: "screen", faceplateType: compileExpression(faceplateType), title: compileExpression(title),
      interfaceValues: popupInterfaceValues(call.arguments[2]), parentBound: Boolean(parent && !t.isNullLiteral(parent) && !t.isIdentifier(parent, { name: "undefined" })),
      ...(optionalPopupExpression(call, 4, "invisible") ? { invisible: optionalPopupExpression(call, 4, "invisible") } : {}),
      ...(optionalPopupExpression(call, 5, "popupWindowName") ? { popupWindowName: optionalPopupExpression(call, 5, "popupWindowName") } : {}),
      ...(optionalPopupExpression(call, 6, "adaptWindow") ? { adaptWindow: optionalPopupExpression(call, 6, "adaptWindow") } : {}),
      ...(optionalPopupExpression(call, 7, "left") ? { left: optionalPopupExpression(call, 7, "left") } : {}),
      ...(optionalPopupExpression(call, 8, "top") ? { top: optionalPopupExpression(call, 8, "top") } : {}),
      ...(optionalPopupExpression(call, 9, "width") ? { width: optionalPopupExpression(call, 9, "width") } : {}),
      ...(optionalPopupExpression(call, 10, "height") ? { height: optionalPopupExpression(call, 10, "height") } : {}),
    };
  }
  const independent = optionalPopupExpression(call, 2, "independentWindow");
  return {
    kind: "popup-open", scope: "faceplate", faceplateType: compileExpression(faceplateType), title: compileExpression(title), interfaceValues: [],
    parentBound: true, ...(independent ? { independentWindow: independent } : {}),
    ...(optionalPopupExpression(call, 3, "invisible") ? { invisible: optionalPopupExpression(call, 3, "invisible") } : {}),
    ...(optionalPopupExpression(call, 4, "popupWindowName") ? { popupWindowName: optionalPopupExpression(call, 4, "popupWindowName") } : {}),
    ...(optionalPopupExpression(call, 5, "adaptWindow") ? { adaptWindow: optionalPopupExpression(call, 5, "adaptWindow") } : {}),
    ...(optionalPopupExpression(call, 6, "left") ? { left: optionalPopupExpression(call, 6, "left") } : {}),
    ...(optionalPopupExpression(call, 7, "top") ? { top: optionalPopupExpression(call, 7, "top") } : {}),
    ...(optionalPopupExpression(call, 8, "width") ? { width: optionalPopupExpression(call, 8, "width") } : {}),
    ...(optionalPopupExpression(call, 9, "height") ? { height: optionalPopupExpression(call, 9, "height") } : {}),
  };
}

function compileExpression(node: t.Expression | t.JSXNamespacedName | t.ArgumentPlaceholder | t.SpreadElement): HmiScriptExpression {
  if (t.isSpreadElement(node)) return { kind: "spread", value: compileExpression(node.argument) };
  if (!t.isExpression(node)) fail("Espressione non supportata", node);
  if (t.isAssignmentExpression(node)) {
    if (node.operator !== "=") fail("Sono ammesse solo assegnazioni semplici.", node);
    const pattern = compilePattern(node.left, 0, true), value = compileExpression(node.right);
    if (pattern.kind === "name" && value.kind === "function-value" && !value.name) value.displayName = pattern.name;
    return { kind: "pattern-assign", pattern, value };
  }
  if (t.isThisExpression(node)) return { kind: "this" };
  if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) return compileFunctionValue(node);
  const constant = literal(node);
  if (constant) return constant;
  if (t.isArrayExpression(node)) {
    if (node.elements.length > 1024) fail("Un array supera 1024 elementi", node);
    return { kind: "array", items: node.elements.map((item) => item ? compileExpression(item) : { kind: "array-hole" }) };
  }
  if (t.isObjectExpression(node)) {
    if (node.properties.length > 1024) fail("Un oggetto supera 1024 proprieta'", node);
    return { kind: "object", entries: node.properties.map((item) => {
      if (t.isSpreadElement(item)) return { name: "", value: compileExpression(item.argument), spread: true as const };
      if (t.isObjectMethod(item) && item.kind === "method" && !item.computed) {
        const key = t.isIdentifier(item.key) ? item.key.name : t.isStringLiteral(item.key) || t.isNumericLiteral(item.key) ? String(item.key.value) : undefined;
        if (key === undefined) fail("Nome metodo non supportato.", item);
        return { name: dataKey(key), value: { ...compileFunctionValue(item), displayName: String(key) } };
      }
      if (!t.isObjectProperty(item) || item.computed || !t.isExpression(item.value)) fail("Sono ammesse proprieta' di dati e metodi semplici, senza getter/setter o chiavi calcolate", item);
      const key = t.isIdentifier(item.key) ? item.key.name : t.isStringLiteral(item.key) || t.isNumericLiteral(item.key) ? item.key.value : undefined;
      if (key === undefined) fail("Nome proprieta' non supportato", item);
      const value = compileExpression(item.value);
      if (value.kind === "function-value" && !value.name) value.displayName = String(key);
      return { name: dataKey(key), value };
    }) };
  }
  if (t.isIdentifier(node)) {
    if (node.name === "undefined") return { kind: "undefined" };
    return { kind: "local", name: node.name };
  }
  if (t.isUnaryExpression(node)) {
    if (!unaryOperators.has(node.operator)) fail(`Operatore ${node.operator} non supportato`, node);
    return { kind: "unary", operator: node.operator, value: compileExpression(node.argument) };
  }
  if (t.isBinaryExpression(node) || t.isLogicalExpression(node)) {
    if (!binaryOperators.has(node.operator)) fail(`Operatore ${node.operator} non supportato`, node);
    if (!t.isExpression(node.left) || !t.isExpression(node.right)) fail("Operandi non supportati", node);
    return { kind: "binary", operator: node.operator, left: compileExpression(node.left), right: compileExpression(node.right) };
  }
  if (t.isConditionalExpression(node)) {
    return { kind: "conditional", test: compileExpression(node.test), consequent: compileExpression(node.consequent), alternate: compileExpression(node.alternate) };
  }
  if (t.isNewExpression(node)) {
    if (node.arguments.length > 32 || node.arguments.some(argument => !t.isExpression(argument) && !t.isSpreadElement(argument))) fail("Argomenti del costruttore non supportati nella sandbox.", node);
    return { kind: "construct", callee: compileExpression(node.callee), arguments: node.arguments.map(compileExpression) };
  }
  if (t.isCallExpression(node)) {
    const name = dottedName(node.callee);
    if (["Screen.Items", "UI.ActiveScreen.Items", "HMIRuntime.UI.ActiveScreen.Items", "Faceplate.Items"].includes(name ?? "")) {
      return { kind: "screen-item", scope: name === "Faceplate.Items" ? "faceplate" : "screen", name: callArguments(node, 1, name!)[0] };
    }
    if (t.isMemberExpression(node.callee) && memberName(node.callee) === "PropertyFlashing" && t.isExpression(node.callee.object)) {
      if (node.arguments.length < 2 || node.arguments.length > 5 || node.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) fail("PropertyFlashing richiede propertyName, enable e fino a tre parametri opzionali", node);
      return { kind: "property-flashing", item: compileExpression(node.callee.object), arguments: node.arguments.map(compileExpression) };
    }
    if (["JSON.parse", "JSON.stringify", "Object.keys", "Object.values", "Object.entries"].includes(name ?? "")) return { kind: "data-call", name: name!, arguments: node.arguments.some(t.isSpreadElement) ? node.arguments.map(compileExpression) : callArguments(node, 1, name!) };
    if (name && (/^Modules\.[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(name) || /^Local\.[A-Za-z_$][\w$]*$/.test(name))) {
      if (node.arguments.some(t.isArgumentPlaceholder)) fail("Argomenti non supportati nelle funzioni HMI", node);
      return { kind: "module-call", name, arguments: node.arguments.map(compileExpression) };
    }
    if (t.isMemberExpression(node.callee) && t.isExpression(node.callee.object) && ["push", "pop", "shift", "unshift", "indexOf", "lastIndexOf", "includes", "slice", "join", "toString", "reverse", "sort", "splice", "map", "flatMap", "filter", "forEach", "find", "findIndex", "findLast", "findLastIndex", "some", "every", "reduce", "reduceRight"].includes(memberName(node.callee) ?? "")) {
      if (node.arguments.some(t.isArgumentPlaceholder)) fail("Argomenti non supportati", node);

      return { kind: "array-method", object: compileExpression(node.callee.object), method: memberName(node.callee)!, arguments: node.arguments.map(compileExpression) };
    }
    const popup = compilePopupOpen(node);
    if (popup) return popup;
    const timer = compileTimerSet(node);
    if (timer) return timer;
    const tag = compileTagFactory(node);
    if (tag) return tag;
    const tagSet = compileTagSetFactory(node);
    if (tagSet) return tagSet;
    if (t.isMemberExpression(node.callee) && memberName(node.callee) === "Item" && t.isExpression(node.callee.object)) {
      return { kind: "tag-set-item", set: compileExpression(node.callee.object), tag: callArguments(node, 1, "Item")[0] };
    }
    if (t.isIdentifier(node.callee) && forbiddenCalls.has(node.callee.name)) fail(`Chiamata ${node.callee.name} non ammessa nella sandbox`, node);
    if (t.isMemberExpression(node.callee) && memberName(node.callee) === "Read" && t.isExpression(node.callee.object)) {
      return { kind: "tag-read", tag: compileExpression(node.callee.object) };
    }
    if(t.isMemberExpression(node.callee)&&memberName(node.callee)==="GetBoundingBoxInScreenCoordinates"&&t.isExpression(node.callee.object)){
      return {kind:"invoke",callee:compileExpression(node.callee),arguments:callArguments(node,0,"GetBoundingBoxInScreenCoordinates")};
    }
    if (!name || !safeCalls.has(name)) {
      if (name && /^(?:Object|JSON|Math|HMIRuntime|UI|Faceplate|Screen|Tags)\./.test(name)) fail("Chiamata " + name + " non ammessa nella sandbox.", node);
      if (!t.isExpression(node.callee) || node.arguments.length > 32 || node.arguments.some(argument => !t.isExpression(argument) && !t.isSpreadElement(argument))) fail("Chiamata con argomenti non supportati nella sandbox.", node);
      return { kind: "invoke", callee: compileExpression(node.callee), arguments: node.arguments.map(compileExpression) };
    }
    if (node.arguments.some(t.isArgumentPlaceholder)) fail("Argomenti non supportati", node);
    return { kind: "call", name, arguments: node.arguments.map(compileExpression) };
  }
  if (t.isMemberExpression(node) && t.isExpression(node.object)) {
    const name = dottedName(node);
    if (name === "UI.ActiveScreen" || name === "HMIRuntime.UI.ActiveScreen") return { kind: "local", name: "Screen" };
    if (name && (/^Modules\.[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(name) || /^Local\.[A-Za-z_$][\w$]*$/.test(name))) return { kind: "module-variable", name };
    const gesture = gestureEnums.get(dottedName(node) ?? "");
    if (gesture) return { kind: "literal", value: gesture };
    const runtimeEnum = runtimeEnums.get(dottedName(node) ?? "");
    if (runtimeEnum !== undefined) return { kind: "literal", value: runtimeEnum };
    return { kind: "member", object: compileExpression(node.object), key: compileMemberKey(node) };
  }
  fail(`Espressione ${node.type} non supportata dalla sandbox`, node);
}

function compileMemberKey(node: t.MemberExpression): HmiScriptExpression {
  if (!node.computed && t.isIdentifier(node.property)) return { kind: "literal", value: dataKey(node.property.name) };
  if (!t.isExpression(node.property)) fail("Chiave membro non supportata", node);
  const key = compileExpression(node.property);
  if (key.kind === "literal") dataKey(key.value);
  return key;
}

function callArguments(call: t.CallExpression, count: number, label: string): HmiScriptExpression[] {
  if (call.arguments.length !== count || call.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) {
    fail(`${label} richiede ${count} ${count === 1 ? "argomento" : "argomenti"}`, call);
  }
  return call.arguments.map(compileExpression);
}

function tagSetOperation(call: t.CallExpression, asyncOnly = false): { operation: "read" | "write"; set: HmiScriptExpression; mode?: HmiScriptExpression; maxAge?: HmiScriptExpression; qcd?: boolean; async: boolean } | undefined {
  if (!t.isMemberExpression(call.callee) || !t.isExpression(call.callee.object)) return undefined;
  const method = memberName(call.callee);
  const operation = method === "Read" || method === "ReadAsync" || method === "ReadMaxAge" ? "read" : method === "Write" || method === "WriteAsync" || method === "WriteAsyncQCD" ? "write" : undefined;
  const asynchronous = method === "ReadAsync" || method === "WriteAsync" || method === "WriteAsyncQCD" || method === "ReadMaxAge";
  if (!operation || (asyncOnly && !asynchronous)) return undefined;
  if (method === "ReadMaxAge") {
    const [maxAge] = callArguments(call, 1, method);
    return { operation: "read", set: compileExpression(call.callee.object), maxAge, async: true };
  }
  // `tag.Write(value)` e `tagSet.Write(writeType)` hanno la stessa forma. Senza informazioni di
  // tipo, un argomento normale resta una scrittura singola; il TagSet esplicita il modo con l'enum.
  if (method === "Write" && call.arguments.length === 1 && (!t.isExpression(call.arguments[0]) || !runtimeEnums.has(dottedName(call.arguments[0]) ?? ""))) return undefined;
  if (call.arguments.length > 1 || call.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) {
    fail(`${method} accetta soltanto il tipo di accesso facoltativo`, call);
  }
  const mode = call.arguments[0];
  if (mode && (!t.isExpression(mode) || !(t.isNumericLiteral(mode) && (mode.value === 0 || mode.value === 1)) && !runtimeEnums.has(dottedName(mode) ?? ""))) {
    fail(`${method} accetta soltanto 0, 1 o l'enumerazione hmiReadType/hmiWriteType`, mode);
  }
  return { operation, set: compileExpression(call.callee.object), ...(mode ? { mode: compileExpression(mode) } : {}), ...(method === "WriteAsyncQCD" ? { qcd: true } : {}), async: asynchronous };
}

function compileQcdWrite(call: t.CallExpression): HmiScriptStatement | undefined {
  if (!t.isMemberExpression(call.callee) || memberName(call.callee) !== "WriteQCD" || !t.isExpression(call.callee.object)) return undefined;
  if (call.arguments.length > 4 || call.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) {
    fail("WriteQCD accetta valore, tipo scrittura, timestamp e QualityCode facoltativi", call);
  }
  return { kind: "qcd-write", target: compileExpression(call.callee.object), arguments: call.arguments.map(compileExpression) };
}

function compileOperatorWrite(call: t.CallExpression): HmiScriptStatement | undefined {
  if (!t.isMemberExpression(call.callee) || memberName(call.callee) !== "WriteWithOperatorMessage" || !t.isExpression(call.callee.object)) return undefined;
  if ((call.arguments.length !== 1 && call.arguments.length !== 2) || call.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) {
    fail("WriteWithOperatorMessage richiede il motivo per un TagSet oppure valore e motivo per un tag", call);
  }
  const args = call.arguments.map(compileExpression);
  return call.arguments.length === 1
    ? { kind: "operator-write", target: compileExpression(call.callee.object), reason: args[0] }
    : { kind: "operator-write", target: compileExpression(call.callee.object), value: args[0], reason: args[1] };
}

function compileTagSetMutation(call: t.CallExpression): HmiScriptStatement | undefined {
  if (!t.isMemberExpression(call.callee) || !t.isExpression(call.callee.object)) return undefined;
  const method = memberName(call.callee);
  if (method === "Clear") {
    if (call.arguments.length) fail("Clear non accetta argomenti", call);
    return { kind: "tag-set-clear", set: compileExpression(call.callee.object) };
  }
  if (method !== "Add" && method !== "Remove") return undefined;
  if (call.arguments.length !== 1 || !t.isExpression(call.arguments[0])) {
    fail(`${method} richiede un nome, un array di nomi o un array di coppie nome/valore`, call);
  }
  const entries = compileTagSetEntries(call.arguments[0], method);
  return method === "Add"
    ? { kind: "tag-set-add", set: compileExpression(call.callee.object), entries }
    : { kind: "tag-set-remove", set: compileExpression(call.callee.object), names: entries.map((entry) => entry.name) };
}

function promiseCallback(node: t.CallExpression["arguments"][number] | undefined, label: string): { name?: string; arrow?: boolean; statements: HmiScriptStatement[] } {
  if (!node || (!t.isFunctionExpression(node) && !t.isArrowFunctionExpression(node)) || node.async || node.generator) {
    fail(`${label} richiede una funzione sincrona`, node && t.isNode(node) ? node : undefined);
  }
  if (node.params.length > 1 || node.params.some((param) => !t.isIdentifier(param))) fail(`${label} accetta al massimo un parametro con nome semplice`, node);
  if (!t.isBlockStatement(node.body)) fail(`${label} richiede un blocco { ... }`, node.body);
  return { ...(node.params[0] && t.isIdentifier(node.params[0]) ? { name: node.params[0].name } : {}), arrow: t.isArrowFunctionExpression(node), statements: compileBlock(node.body) };
}

function compilePromiseStatement(call: t.CallExpression): HmiScriptStatement | undefined {
  let cursor: t.CallExpression = call;
  let failure: ReturnType<typeof promiseCallback> | undefined;
  let success: ReturnType<typeof promiseCallback> | undefined;
  if (t.isMemberExpression(cursor.callee) && memberName(cursor.callee) === "catch" && t.isCallExpression(cursor.callee.object)) {
    if (cursor.arguments.length !== 1) fail("catch richiede una funzione", cursor);
    failure = promiseCallback(cursor.arguments[0], "catch");
    cursor = cursor.callee.object;
  }
  if (t.isMemberExpression(cursor.callee) && memberName(cursor.callee) === "then" && t.isCallExpression(cursor.callee.object)) {
    if (cursor.arguments.length !== 1) fail("then richiede una funzione", cursor);
    success = promiseCallback(cursor.arguments[0], "then");
    cursor = cursor.callee.object;
  }
  if (!success && !failure) return undefined;
  const operation = tagSetOperation(cursor, true);
  if (!operation) fail("then/catch e' ammesso soltanto dopo ReadAsync, ReadMaxAge, WriteAsync o WriteAsyncQCD", call);
  return { kind: "tag-set-promise", operation: operation.operation, set: operation.set, ...(operation.mode ? { mode: operation.mode } : {}), ...(operation.maxAge ? { maxAge: operation.maxAge } : {}), ...(operation.qcd ? { qcd: true } : {}), ...(success ? { success } : {}), ...(failure ? { failure } : {}) };
}

function compileAwaitStatement(node: t.AwaitExpression): HmiScriptStatement {
  if (!t.isCallExpression(node.argument)) fail("await e' ammesso soltanto su ReadAsync, ReadMaxAge, WriteAsync o WriteAsyncQCD", node);
  const operation = tagSetOperation(node.argument, true);
  if (!operation) fail("await e' ammesso soltanto su ReadAsync, ReadMaxAge, WriteAsync o WriteAsyncQCD", node);
  return operation.operation === "read"
    ? { kind: "tag-set-read", set: operation.set, async: true, ...(operation.mode ? { mode: operation.mode } : {}), ...(operation.maxAge ? { maxAge: operation.maxAge } : {}) }
    : { kind: "tag-set-write", set: operation.set, async: true, ...(operation.mode ? { mode: operation.mode } : {}), ...(operation.qcd ? { qcd: true } : {}) };
}

function compileCallStatement(call: t.CallExpression): HmiScriptStatement {
  if (t.isMemberExpression(call.callee) && memberName(call.callee) === "PropertyFlashing") return { kind: "expression", value: compileExpression(call) };
  const moduleName = dottedName(call.callee);
  if (moduleName && (/^Modules\.[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(moduleName) || /^Local\.[A-Za-z_$][\w$]*$/.test(moduleName))) {
    const compiled = compileExpression(call);
    if (compiled.kind === "module-call") return { kind: "module-call", call: compiled };
  }
  const promise = compilePromiseStatement(call);
  if (promise) return promise;
  const name = dottedName(call.callee);
  if (name === "Faceplate.Close") {
    if (call.arguments.length) fail("Faceplate.Close non accetta argomenti", call);
    return { kind: "popup-close" };
  }
  if (t.isMemberExpression(call.callee) && memberName(call.callee) === "Close" && t.isExpression(call.callee.object)) {
    if (call.arguments.length) fail("Close non accetta argomenti", call);
    return { kind: "popup-close", popup: compileExpression(call.callee.object) };
  }
  const timer = compileTimerSet(call);
  if (timer) return { kind: "timer-set", timer };
  const clearMode = name === "HMIRuntime.Timers.ClearTimeout" ? "timeout" : name === "HMIRuntime.Timers.ClearInterval" ? "interval" : undefined;
  if (clearMode) return { kind: "timer-clear", mode: clearMode, id: callArguments(call, 1, name!)[0] };
  if (name && (/^Modules\.[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(name) || /^Local\.[A-Za-z_$][\w$]*$/.test(name))) {
    const compiled = compileExpression(call);
    if (compiled.kind !== "module-call") fail("Chiamata a funzione HMI non valida", call);
    return { kind: "module-call", call: compiled };
  }
  if (name === "HMIRuntime.Trace") return { kind: "trace", value: callArguments(call, 1, name)[0] };
  if (name === "Faceplate.RaiseEvent") {
    if (call.arguments.length < 1 || call.arguments.length > 2 || call.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) {
      fail("Faceplate.RaiseEvent richiede il nome evento e, facoltativamente, un oggetto di parametri", call);
    }
    const eventName = call.arguments[0];
    if (!t.isExpression(eventName)) fail("Il nome dell'evento faceplate non e' valido", eventName);
    const parameterObject = call.arguments[1];
    if (parameterObject && !t.isObjectExpression(parameterObject)) fail("I parametri di Faceplate.RaiseEvent devono essere un oggetto", parameterObject);
    const parameters = (parameterObject?.properties ?? []).map((property) => {
      if (!t.isObjectProperty(property) || property.computed || property.shorthand || !t.isExpression(property.value)) fail("Ogni parametro faceplate deve avere nome e valore semplici", property);
      const parameterName = t.isIdentifier(property.key) ? property.key.name : t.isStringLiteral(property.key) ? property.key.value : undefined;
      if (!parameterName || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(parameterName)) fail("Nome parametro faceplate non valido", property.key);
      return { name: parameterName, value: compileExpression(property.value) };
    });
    return { kind: "raise-faceplate-event", name: compileExpression(eventName), parameters };
  }
  if (name === "HMIRuntime.Tags.SysFct.SetTagValue") {
    const [tag, value] = callArguments(call, 2, name);
    return { kind: "write", tag, value };
  }
  const bitOperation = ({
    "HMIRuntime.Tags.SysFct.SetBitInTag": "set",
    "HMIRuntime.Tags.SysFct.ResetBitInTag": "reset",
    "HMIRuntime.Tags.SysFct.ToggleBitInTag": "toggle",
  } as const)[name ?? ""];
  if (bitOperation) {
    const [tag, bit] = callArguments(call, 2, name!);
    return { kind: "bit", operation: bitOperation, tag, bit };
  }
  if (name === "HMIRuntime.UI.SysFct.ChangeScreen" || name === "HMIRuntime.UI.SysFct.OpenScreen") {
    if (call.arguments.length < 1 || call.arguments.length > 2 || call.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) {
      fail(`${name} richiede la schermata e, facoltativamente, il contenitore`, call);
    }
    return { kind: "navigate", target: compileExpression(call.arguments[0]) };
  }
  const mutation = compileTagSetMutation(call);
  if (mutation) return mutation;
  const qcdWrite = compileQcdWrite(call);
  if (qcdWrite) return qcdWrite;
  const operatorWrite = compileOperatorWrite(call);
  if (operatorWrite) return operatorWrite;
  const tagSet = tagSetOperation(call);
  if (tagSet) {
    return tagSet.operation === "read"
      ? { kind: "tag-set-read", set: tagSet.set, ...(tagSet.async ? { async: true } : {}), ...(tagSet.mode ? { mode: tagSet.mode } : {}), ...(tagSet.maxAge ? { maxAge: tagSet.maxAge } : {}) }
      : { kind: "tag-set-write", set: tagSet.set, ...(tagSet.async ? { async: true } : {}), ...(tagSet.mode ? { mode: tagSet.mode } : {}), ...(tagSet.qcd ? { qcd: true } : {}) };
  }
  if (t.isMemberExpression(call.callee) && memberName(call.callee) === "Write" && t.isExpression(call.callee.object)) {
    return { kind: "write", tag: compileExpression(call.callee.object), value: callArguments(call, 1, "Write")[0] };
  }
  if (t.isMemberExpression(call.callee) && ["push", "pop", "shift", "unshift", "indexOf", "lastIndexOf", "includes", "slice", "join", "toString", "reverse", "sort", "splice", "map", "flatMap", "filter", "forEach", "find", "findIndex", "findLast", "findLastIndex", "some", "every", "reduce", "reduceRight"].includes(memberName(call.callee) ?? "")) {
    return { kind: "expression", value: compileExpression(call) };
  }
  return { kind: "expression", value: compileExpression(call) };
}

function compileBlock(node: t.Statement | t.BlockStatement | null | undefined): HmiScriptStatement[] {
  if (!node) return [];
  const statements = t.isBlockStatement(node) ? node.body : [node];
  const result: HmiScriptStatement[] = [];
  for (const statement of statements) {
    if (t.isEmptyStatement(statement)) continue;
    if (t.isFunctionDeclaration(statement)) {
      if (!statement.id) fail("La dichiarazione di funzione richiede un nome.", statement);
      result.push({ kind: "function-declare", name: statement.id.name, value: compileFunctionValue(statement) }); continue;
    }
    if (t.isBreakStatement(statement)) { result.push({ kind: "break" }); continue; }
    if (t.isBlockStatement(statement)) { result.push({ kind: "block", statements: compileBlock(statement) }); continue; }
    if (t.isVariableDeclaration(statement)) {
      for (const declaration of statement.declarations) {
        if (!t.isIdentifier(declaration.id)) {
          if (!declaration.init || !t.isExpression(declaration.init)) fail("Il pattern richiede un valore iniziale.", declaration);
          result.push({ kind: "bind", pattern: compilePattern(declaration.id), value: compileExpression(declaration.init), ...(statement.kind === "const" ? { constant: true } : {}), ...(statement.kind === "var" ? { functionScoped: true } : {}) });
          continue;
        }
        if (declaration.init && !t.isExpression(declaration.init)) fail("Valore iniziale non supportato", declaration.init);
        const value = declaration.init ? compileExpression(declaration.init) : undefined;
        if (value?.kind === "function-value" && !value.name) value.displayName = declaration.id.name;
        result.push({ kind: "declare", name: declaration.id.name, ...(value ? { value } : {}), ...(statement.kind === "const" ? { constant: true } : {}), ...(statement.kind === "var" ? { functionScoped: true } : {}) });
      }
      continue;
    }
    if (t.isThrowStatement(statement)) { result.push({ kind: "throw", value: compileExpression(statement.argument) });continue; }
    if (t.isReturnStatement(statement)) {
      if (statement.argument && !t.isExpression(statement.argument)) fail("Valore di ritorno non supportato", statement.argument);
      result.push({ kind: "return", ...(statement.argument ? { value: compileExpression(statement.argument) } : {}) });
      continue;
    }
    if (t.isIfStatement(statement)) {
      result.push({ kind: "if", test: compileExpression(statement.test), consequent: compileBlock(statement.consequent), alternate: compileBlock(statement.alternate) });
      continue;
    }
    if (t.isSwitchStatement(statement)) {
      result.push({
        kind: "switch",
        value: compileExpression(statement.discriminant),
        cases: statement.cases.map((entry) => ({
          ...(entry.test ? { test: compileExpression(entry.test) } : {}),
          statements: compileBlock(t.blockStatement(entry.consequent)),
        })),
      });
      continue;
    }
    if (t.isTryStatement(statement)) {
      const catchPattern = statement.handler?.param && !t.isIdentifier(statement.handler.param) ? compilePattern(statement.handler.param) : undefined;
      const catchName = catchPattern ? "[caught]" : statement.handler?.param && t.isIdentifier(statement.handler.param) ? statement.handler.param.name : undefined;
      result.push({
        kind: "try",
        statements: compileBlock(statement.block),
        ...(statement.handler ? { failure: { ...(catchName ? { name: catchName } : {}), statements: [...(catchPattern ? [{kind:"bind" as const,pattern:catchPattern,value:{kind:"local" as const,name:"[caught]"}}] : []), ...compileBlock(statement.handler.body)] } } : {}),
        final: compileBlock(statement.finalizer),
      });
      continue;
    }
    if (t.isExpressionStatement(statement)) {
      if ((t.isAssignmentExpression(statement.expression) || t.isUpdateExpression(statement.expression))) {
        const target = t.isAssignmentExpression(statement.expression) ? statement.expression.left : statement.expression.argument;
        if (t.isMemberExpression(target) && /^Modules\.[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(dottedName(target) ?? "")) fail("Le variabili importate da un modulo sono in sola lettura. Per modificarle chiama una funzione del modulo proprietario.", target);
      }
      if (t.isAssignmentExpression(statement.expression)) {
        result.push({kind:"expression",value:compileExpression(statement.expression)});
      } else if (t.isAwaitExpression(statement.expression)) {
        result.push(compileAwaitStatement(statement.expression));
      } else if (t.isCallExpression(statement.expression)) {
        result.push(compileCallStatement(statement.expression));
      } else {
        fail(`Istruzione ${statement.expression.type} non supportata`, statement);
      }
      continue;
    }
    fail(`Istruzione ${statement.type} non supportata dalla sandbox`, statement);
  }
  return result;
}

type StaticArray = Extract<HmiScriptExpression, { kind: "array" }> & { possibleItems?: HmiScriptExpression[] };

function staticSpreadArray(items: readonly HmiScriptExpression[], locals: Map<string, HmiScriptExpression>): StaticArray {
  const result: HmiScriptExpression[] = [];
  let uncertain = false;
  for (const item of items) {
    inspectionStep();
    if (item.kind !== "spread") { result.push(bindStaticData(item, locals)); continue; }
    const candidates = staticValues(item.value, locals);
    const variants = candidates.map(value => {
      if (value.kind === "array") {
        const bound = value.items.some(entry => entry.kind === "spread") ? staticSpreadArray(value.items, locals) : value as StaticArray;
        if (bound.possibleItems) uncertain = true;
        return staticArrayItems(bound).map(entry => entry.kind === "array-hole" ? { kind: "undefined" } as HmiScriptExpression : entry);
      }
      if (value.kind === "literal" && typeof value.value === "string") return [...value.value].map(value => ({ kind: "literal", value } as HmiScriptExpression));
      uncertain = true;
      return [{ kind: "local", name: "" } as HmiScriptExpression];
    });
    if (!variants.length) { uncertain = true; result.push({ kind: "local", name: "" }); }
    else if (variants.every(values => values.length === variants[0].length)) {
      for (let i = 0; i < variants[0].length; i++) result.push(staticChoice(variants.map(values => values[i]))!);
    } else { uncertain = true; result.push(...variants.flat()); }
    if (result.length > 1024) throw new Error("Lo spread supera 1024 valori nell’ispezione.");
  }
  return { kind: "array", items: result, ...(uncertain ? { possibleItems: result } : {}) };
}
function staticCallArguments(items: readonly HmiScriptExpression[], locals: Map<string, HmiScriptExpression>): HmiScriptExpression[] {
  if (!items.some(item => item.kind === "spread")) return [...items];
  const expanded = staticSpreadArray(items, locals);
  if (!expanded.possibleItems) return expanded.items;
  return Array.from({ length: 32 }, () => staticChoice(expanded.possibleItems!) ?? { kind: "undefined" });
}
function staticSpreadObject(expression: Extract<HmiScriptExpression, { kind: "object" }>, locals: Map<string, HmiScriptExpression>): Extract<HmiScriptExpression, { kind: "object" }> {
  const entries = new Map<string, HmiScriptExpression>();
  // Inspection-only wildcard: an array mutation can change which numeric keys exist.
  const possible = new Set<HmiScriptExpression>();
  const addPossible = (values: readonly HmiScriptExpression[]) => {
    for (const value of values) {
      inspectionStep(); possible.add(value);
      if (possible.size > 1024) throw new Error("Troppe proprietà possibili nell’ispezione dello spread.");
    }
  };
  for (const entry of expression.entries) {
    inspectionStep();
    if (entry.possible) { addPossible([entry.value]); continue; }
    if (!entry.spread) { entries.set(entry.name, bindStaticData(entry.value, locals)); continue; }
    const choices = new Map<string, HmiScriptExpression[]>();
    const sources = staticValues(bindStaticData(entry.value, locals), locals);
    for (const source of sources) {
      if (source.kind === "array" && (source as StaticArray).possibleItems) addPossible(staticArrayItems(source));
      const properties = source.kind === "object" ? (source.entries.some(item => item.spread) ? staticSpreadObject(source, locals).entries : source.entries)
        : source.kind === "array" ? source.items.flatMap((value, index) => value.kind === "array-hole" ? [] : [{ name: String(index), value }])
        : source.kind === "literal" && typeof source.value === "string" ? source.value.split("").map((value, index) => ({ name: String(index), value: { kind: "literal", value } as HmiScriptExpression })) : [];
      for (const property of properties) {
        if ((property as { possible?: true }).possible) addPossible([property.value]);
        else choices.set(property.name, [...(choices.get(property.name) ?? []), property.value]);
      }
    }
    for (const [name, values] of choices) {
      if (values.length < sources.length) values.push(entries.get(name) ?? { kind: "undefined" });
      entries.set(name, staticChoice(values)!);
    }
    if (entries.size > 1024) throw new Error("Lo spread supera 1024 proprietà nell’ispezione.");
  }
  const fixed = [...entries].map(([name, value]) => ({ name, value }));
  return { kind: "object", entries: possible.size ? [...fixed, { name: "", value: staticChoice([...possible])!, possible: true }] : fixed };
}
function inspectPatternBindings(pattern: HmiScriptPattern, input: HmiScriptExpression, locals: Map<string, HmiScriptExpression>, read: Set<string>, written: Set<string>, asyncState: { value: boolean }, depth = 0, alreadyBound = false, assignment = false): void {
  inspectionStep();if (depth >= 32) throw new Error("Il pattern supera 32 livelli nell’ispezione.");
  const bind = (next: HmiScriptPattern, value: HmiScriptExpression) => inspectPatternBindings(next, value, locals, read, written, asyncState, depth + 1, true, assignment);
  const source = alreadyBound ? input : bindStaticData(input, locals);
  if (pattern.kind === "target") {
    if(!assignment)throw new Error("Destinatario non valido in un binding.");
    inspectAssignmentTarget(pattern,locals,read,written,asyncState);
    for(const target of staticValues(pattern.object,locals))if(target.kind==="tag-ref")written.add(target.name);
    updateStaticMember(pattern.object,pattern.key,source,locals);return;
  }
  if (pattern.kind === "name") { locals.set(pattern.name, source);return; }
  if (pattern.kind === "default") {
    const values = staticValues(source, locals);const present: HmiScriptExpression[] = values.filter(value => value.kind !== "undefined" && value.kind !== "array-hole");
    const uncertain = !values.length || values.some(value => ["local", "member", "tag-read", "call", "module-call"].includes(value.kind));
    if (uncertain || present.length < values.length || !values.length) {
      inspectStatements([{kind:"expression",value:pattern.value}], read, written, locals, asyncState, true);
      present.push(bindStaticData(pattern.value, locals));
    }
    bind(pattern.pattern, staticChoice(present) ?? {kind:"undefined"});return;
  }
  if (pattern.kind === "array-pattern") {
    const candidates = staticValues(source, locals).map(value => value.kind === "literal" && typeof value.value === "string" ? {kind:"array" as const,items:[...value.value].map(value=>({kind:"literal" as const,value}))} : value);
    const arrays = staticChoice(candidates) ?? source;
    for (let i=0;i<pattern.items.length;i++) if (pattern.items[i]) {
      if(assignment)inspectAssignmentTarget(pattern.items[i]!,locals,read,written,asyncState);
      const item: HmiScriptExpression = {kind:"member",object:arrays,key:{kind:"literal",value:i}};
      bind(pattern.items[i]!, staticChoice(staticValues(item,locals)) ?? {kind:"undefined"});
    }
    if (pattern.rest) {
      if(assignment)inspectAssignmentTarget(pattern.rest,locals,read,written,asyncState);
      const tails = candidates.filter((value): value is StaticArray => value.kind === "array").map(value => ({...value,items:value.items.slice(pattern.items.length)}));
      bind(pattern.rest, staticChoice(tails) ?? {kind:"array",items:[]});
    }
    return;
  }
  const excluded = new Set<string>();
  for (const property of pattern.properties) {
    walkExpression(property.key,read,locals);const keys=staticValues(property.key,locals);
    if (keys.length===1 && keys[0].kind==="literal") excluded.add(String(keys[0].value));
    if(assignment)inspectAssignmentTarget(property.pattern,locals,read,written,asyncState);
    const member: HmiScriptExpression = {kind:"member",object:source,key:property.key};
    bind(property.pattern, staticChoice(staticValues(member,locals)) ?? {kind:"undefined"});
  }
  if (pattern.rest) {
    if(assignment)inspectAssignmentTarget(pattern.rest,locals,read,written,asyncState);
    const copies=staticValues(source,locals).map(value=>{
      const entries: Extract<HmiScriptExpression,{kind:"object"}>["entries"] = value.kind==="object" ? value.entries
        : value.kind==="array" ? [...value.items.flatMap((item,index)=>item.kind==="array-hole"?[]:[{name:String(index),value:item}]), ...((value as StaticArray).possibleItems ? [{name:"",value:staticChoice(staticArrayItems(value))!,possible:true as const}] : [])]
        : value.kind==="literal" && typeof value.value==="string" ? value.value.split("").map((value,index)=>({name:String(index),value:{kind:"literal" as const,value}})) : [];
      return {kind:"object" as const,entries:entries.filter(entry=>entry.possible || !excluded.has(entry.name)).map(entry=>({...entry}))};
    });
    bind(pattern.rest,staticChoice(copies)??{kind:"object",entries:[]});
  }
}
function staticArrayItems(array: StaticArray): HmiScriptExpression[] {
  return array.possibleItems ?? array.items;
}

function staticChoice(values: HmiScriptExpression[]): HmiScriptExpression | undefined {
  if (!values.length) return undefined;
  if (values.length === 1) return values[0];
  const middle = Math.floor(values.length / 2);
  return { kind: "conditional", test: { kind: "literal", value: null }, consequent: staticChoice(values.slice(0, middle))!, alternate: staticChoice(values.slice(middle))! };
}

function staticBoundData(expression: HmiScriptExpression, depth = 0): boolean {
  if (depth >= 64) return false;
  if (expression.kind === "local" || expression.kind === "module-variable") return true;
  if (expression.kind === "member") return staticBoundData(expression.object, depth + 1);
  if (expression.kind === "array-method" && ["reverse", "sort"].includes(expression.method)) return staticBoundData(expression.object, depth + 1);
  return false;
}

function updateStaticArray(expression: Extract<HmiScriptExpression, { kind: "array-method" }>, locals: Map<string, HmiScriptExpression>) {
  if (!["push", "pop", "shift", "unshift", "reverse", "sort", "splice"].includes(expression.method) || !staticBoundData(expression.object)) return;
  const arguments_ = staticCallArguments(expression.arguments, locals);
  const added = ["push", "unshift"].includes(expression.method) ? arguments_ : expression.method === "splice" ? arguments_.slice(2) : [];
  const incoming = added.map((value) => bindStaticData(value, locals));
  for (const target of staticValues(expression.object, locals)) if (target.kind === "array") {
    const array = target as StaticArray;
    const possible = [...new Set([...staticArrayItems(array), ...incoming].flatMap((value) => staticValues(value, locals)))];
    if (possible.length > 1024) throw new Error("Troppi valori possibili nell'ispezione dei dati strutturati.");
    array.possibleItems = possible;
  }
}

type StaticFunction = Extract<HmiScriptExpression, { kind: "function-value" }> & { bindings?: Map<string, HmiScriptExpression>; inspecting?: boolean; lexicalThis?: HmiScriptExpression; intrinsic?: "call" | "apply" | "bind"; bound?: { target: HmiScriptExpression; receiver: HmiScriptExpression; arguments: HmiScriptExpression[] } };

type InspectionEffects = { value: boolean; thrown?: HmiScriptExpression[] };
type StaticAssignmentEntry = { value?: HmiScriptExpression; read: Set<string>; written: Set<string>; effects: InspectionEffects };
let hmiInspectionBudget: { remaining: number; deadline: number; arrayDepth: number; callDepth: number; assignments?: WeakMap<Map<string,HmiScriptExpression>,Map<HmiScriptExpression,StaticAssignmentEntry>> } | undefined;
function recordStaticThrow(effects: {value:boolean}, value: HmiScriptExpression): void {
  const state=effects as InspectionEffects;state.thrown??=[];
  if(!state.thrown.includes(value))state.thrown.push(value);
  if(state.thrown.length>1024)throw new Error("Troppe eccezioni possibili nell’ispezione dello script.");
}
function inspectAssignmentTarget(pattern:HmiScriptPattern,locals:Map<string,HmiScriptExpression>,read:Set<string>,written:Set<string>,effects:{value:boolean}):void{
  const target=pattern.kind==="default"?pattern.pattern:pattern;
  if(target.kind==="target")inspectStatements([{kind:"expression",value:target.object},{kind:"expression",value:target.key}],read,written,locals,effects,true);
}
function inspectStaticAssignment(expression:Extract<HmiScriptExpression,{kind:"pattern-assign"}>,locals:Map<string,HmiScriptExpression>,read=new Set<string>(),written=new Set<string>(),effects:{value:boolean}={value:false}):HmiScriptExpression{
  const cache=hmiInspectionBudget?.assignments??(hmiInspectionBudget?(hmiInspectionBudget.assignments=new WeakMap()):undefined);
  let assignments=cache?.get(locals);if(cache&&!assignments){assignments=new Map();cache.set(locals,assignments);}
  let result=assignments?.get(expression);
  if(!result){
    result={read:new Set(),written:new Set(),effects:{value:false}};assignments?.set(expression,result);
    inspectAssignmentTarget(expression.pattern,locals,result.read,result.written,result.effects);
    inspectStatements([{kind:"expression",value:expression.value}],result.read,result.written,locals,result.effects,true);
    const value=bindStaticData(expression.value,locals);result.value=value;
    inspectPatternBindings(expression.pattern,value,locals,result.read,result.written,result.effects,0,true,true);
  }
  if(!result.value)throw new Error("Dipendenza ricorsiva durante l’ispezione di un’assegnazione.");
  for(const tag of result.read)read.add(tag);for(const tag of result.written)written.add(tag);if(result.effects.value)effects.value=true;
  for(const value of result.effects.thrown??[])recordStaticThrow(effects,value);
  return result.value;
}
function inspectionStep() {
  const budget = hmiInspectionBudget;
  if (budget && (--budget.remaining < 0 || (budget.remaining & 127) === 0 && Date.now() > budget.deadline)) throw new Error("Ispezione dello script interrotta: il calcolo e' troppo complesso. Riduci il numero di callback o dividi lo script in funzioni piu' semplici.");
}

function inspectCallable(expression: HmiScriptExpression, args: HmiScriptExpression[], locals: Map<string, HmiScriptExpression>, read = new Set<string>(), written = new Set<string>(), asyncState = { value: false }, receiver?: HmiScriptExpression): HmiScriptExpression[] {
  inspectionStep();
  const budget = hmiInspectionBudget;
  if (budget && budget.callDepth >= 32) throw new Error("Ispezione dello script interrotta: troppe chiamate di funzione annidate.");
  if (budget) budget.callDepth++;
  try {
  const result: HmiScriptExpression[] = [];
  for (const candidate of staticValues(expression, locals)) {
    if (candidate.kind !== "function-value") continue;
    if (candidate.errorType) { result.push(staticErrorValue(candidate.errorType, args, locals)); continue; }
    const fn = bindStaticData(candidate, locals) as StaticFunction;
    if (fn.inspecting) continue;
    if (fn.bound) { result.push(...inspectCallable(fn.bound.target, [...fn.bound.arguments, ...args], locals, read, written, asyncState, fn.bound.receiver)); continue; }
    if (fn.intrinsic) {
      if (!receiver) continue;
      const context: HmiScriptExpression = args[0] ?? { kind: "undefined" };
      if (fn.intrinsic === "call") result.push(...inspectCallable(receiver, args.slice(1), locals, read, written, asyncState, context));
      else if (fn.intrinsic === "apply") {
        for (const target of staticValues(receiver, locals)) if (target.kind === "function-value") {
          const values = target.parameters.map((_, index): HmiScriptExpression => args[1] ? { kind: "member", object: args[1], key: { kind: "literal", value: index } } : { kind: "undefined" });
          result.push(...inspectCallable(target, values, locals, read, written, asyncState, context));
        }
      } else for (const target of staticValues(receiver, locals)) if (target.kind === "function-value") result.push(Object.assign({ ...target, parameters: target.parameters.slice(Math.max(0, args.length - 1)), functionLength: Math.max(0,(target.functionLength ?? target.parameters.length)-Math.max(0,args.length-1)) }, { bound: { target: bindStaticData(target, locals), receiver: staticChoice(staticValues(context, locals)) ?? { kind: "local", name: "" }, arguments: args.slice(1).map(value => bindStaticData(value, locals)) } }));
      continue;
    }
    let bindings = new Map(fn.bindings ?? locals);
    const context = fn.arrow ? fn.lexicalThis ?? { kind: "undefined" } as HmiScriptExpression : receiver ?? { kind: "undefined" } as HmiScriptExpression;
    bindings.set("[this]", staticChoice(staticValues(context, locals)) ?? { kind: "local", name: "" });
    if (fn.name) bindings.set(fn.name, fn);
    if (fn.parameterPatterns) {
      const arguments_ = args.map(value=>bindStaticData(value,locals));
      for (const pattern of fn.parameterPatterns) for (const name of patternNames(pattern)) bindings.delete(name);
      inspectPatternBindings({kind:"array-pattern",items:fn.rest?fn.parameterPatterns.slice(0,-1):fn.parameterPatterns,...(fn.rest?{rest:fn.parameterPatterns.at(-1)!}:{})},{kind:"array",items:arguments_},bindings,read,written,asyncState,0,true);
      bindings = new Map(bindings); // Defaults may return closures over the separate parameter bindings.
    } else {
      for (let index = 0; index < fn.parameters.length; index++) {
        if (args[index]) bindings.set(fn.parameters[index], bindStaticData(args[index], locals)); else bindings.delete(fn.parameters[index]);
      }
      if (fn.rest) bindings.set(fn.rest, { kind: "array", items: args.slice(fn.parameters.length).map(value => bindStaticData(value, locals)) });
    }
    fn.inspecting = true;
    try {
      inspectStatements(fn.program.statements, read, written, bindings, asyncState, fn.program.version >= 2);
      const returns = (body: readonly HmiScriptStatement[]) => {
        for (const statement of body) {
          if (statement.kind === "return" && statement.value) result.push(bindStaticData(statement.value, bindings));
          else if (statement.kind === "block") returns(statement.statements);
          else if (statement.kind === "if") { returns(statement.consequent); returns(statement.alternate); }
          else if (statement.kind === "switch") for (const entry of statement.cases) returns(entry.statements);
          else if (statement.kind === "try") { returns(statement.statements); returns(statement.failure?.statements ?? []); returns(statement.final); }
        }
      };
      returns(fn.program.statements);
    } finally { fn.inspecting = false; }
  }
  return result;
  } finally { if (budget) budget.callDepth--; }
}

function inspectInvocation(expression: Extract<HmiScriptExpression, { kind: "invoke" }>, locals: Map<string, HmiScriptExpression>, read = new Set<string>(), written = new Set<string>(), asyncState = { value: false }): HmiScriptExpression[] {
  return inspectCallable(expression.callee, staticCallArguments(expression.arguments, locals), locals, read, written, asyncState, expression.callee.kind === "member" ? expression.callee.object : undefined);
}

function inspectArrayCallback(expression: Extract<HmiScriptExpression, { kind: "array-method" }>, locals: Map<string, HmiScriptExpression>, read = new Set<string>(), written = new Set<string>(), asyncState = { value: false }): HmiScriptExpression[] {
  inspectionStep();
  const budget = hmiInspectionBudget;
  if (budget && budget.arrayDepth >= 32) throw new Error("Ispezione dello script interrotta: troppe callback Array annidate (massimo 32).");
  if (budget) budget.arrayDepth++;
  try {
  expression = { ...expression, arguments: staticCallArguments(expression.arguments, locals) };
  const method = expression.method;
  if (!["map", "flatMap", "filter", "forEach", "find", "findIndex", "findLast", "findLastIndex", "some", "every", "reduce", "reduceRight", "sort"].includes(method) || !expression.arguments.length) return [];
  const targets = staticValues(expression.object, locals);
  const methods = targets.flatMap(value => value.kind === "object" ? value.entries.filter(entry => entry.name === method).map(entry => entry.value) : []);
  const methodReturns = methods.flatMap(value => inspectCallable(value, expression.arguments, locals, read, written, asyncState, expression.object));
  const arrays = targets.filter((value): value is StaticArray => value.kind === "array");
  if (!arrays.length && methods.length) return methodReturns;
  const items = arrays.flatMap(array => staticArrayItems(array)).filter(item => item.kind !== "array-hole");
  const element = staticChoice(items) ?? { kind: "undefined" } as HmiScriptExpression;
  const position: HmiScriptExpression = { kind: "local", name: "" };
  const reducing = method === "reduce" || method === "reduceRight";
  const seed = expression.arguments[1] ?? element;
  const callbackArgs = reducing ? [staticChoice([bindStaticData(seed, locals), element])!, element, position, expression.object] : method === "sort" ? [element, element] : [element, position, expression.object];
  const returns = inspectCallable(expression.arguments[0], callbackArgs, locals, read, written, asyncState, !reducing && method !== "sort" ? expression.arguments[1] : undefined);
  for (const value of returns) for (const tag of staticTags(value, locals, true)) read.add(tag);
  if (method === "map") return [{ kind: "array", items: returns, possibleItems: returns } as StaticArray];
  if (method === "flatMap") {
    const flat = returns.flatMap(value => value.kind === "array" ? staticArrayItems(value) : [value]);
    return [{ kind: "array", items: flat, possibleItems: flat } as StaticArray];
  }
  if (reducing) return [bindStaticData(seed, locals), ...returns];
  if (["find", "findLast"].includes(method)) return [...items, { kind: "undefined" }];
  if (method === "filter") return arrays.map(array => ({ ...array, possibleItems: [...staticArrayItems(array)] }));
  return [];
  } finally { if (budget) budget.arrayDepth--; }
}

function walkExpression(expression: HmiScriptExpression, read: Set<string>, locals: Map<string, HmiScriptExpression>) {
  if (expression.kind === "function-value") return;
  if (expression.kind === "construct") {
    if(expression.callee.kind==="local"&&!locals.has(expression.callee.name)&&!isScriptErrorName(expression.callee.name))throw new Error("Costruttore "+expression.callee.name+" non disponibile nella sandbox: usa un costruttore Error o un suo alias.");
    walkExpression(expression.callee, read, locals); expression.arguments.forEach(argument => walkExpression(argument, read, locals)); return;
  }
  if (expression.kind === "pattern-assign") {inspectStaticAssignment(expression,locals,read);return;}
  if (expression.kind === "spread") { walkExpression(expression.value, read, locals); return; }
  if (expression.kind === "invoke") { walkExpression(expression.callee, read, locals); expression.arguments.forEach(argument => walkExpression(argument, read, locals)); return; }
  if (expression.kind === "screen-item") { walkExpression(expression.name, read, locals); return; }
  if (expression.kind === "property-flashing") { walkExpression(expression.item, read, locals); expression.arguments.forEach((argument) => walkExpression(argument, read, locals)); return; }
  if (expression.kind === "local" && !locals.has(expression.name) && ["document", "window", "globalThis", "global", "self", "parent", "top", "frames", "opener", "location", "navigator", "localStorage", "sessionStorage", "process", "require", "Buffer", "fetch", "XMLHttpRequest", "WebSocket", "eval", "Function"].includes(expression.name)) {
    throw new Error("API host " + expression.name + " non disponibile nella sandbox HMI.");
  }
  if (expression.kind === "array") { expression.items.forEach((item) => walkExpression(item, read, locals)); return; }
  if (expression.kind === "object") { expression.entries.forEach((entry) => walkExpression(entry.value, read, locals)); return; }
  if (expression.kind === "member") {
    walkExpression(expression.object, read, locals); walkExpression(expression.key, read, locals);
    const keys = staticValues(expression.key, locals);
    if (keys.some((key) => key.kind === "literal" && ["Value", "QualityCode", "TimeStamp", "LastError", "ErrorDescription"].includes(String(key.value)))) {
      for (const target of staticValues(expression.object, locals)) if (target.kind === "tag-ref") read.add(target.name);
    }
    return;
  }
  if (expression.kind === "array-method") {
    walkExpression(expression.object, read, locals);
    for (const tag of staticTags(expression.object, locals, true)) read.add(tag);
    expression.arguments.forEach((argument) => { walkExpression(argument, read, locals); for (const tag of staticTags(argument, locals, true)) read.add(tag); });
    updateStaticArray(expression, locals);
    return;
  }
  if (expression.kind === "data-call") {
    expression.arguments.forEach((argument) => walkExpression(argument, read, locals));
    return;
  }
  if (expression.kind === "module-variable") {
    const value = staticValue(expression, locals);
    if (value) walkExpression(value, read, locals);
    return;
  }
  if (expression.kind === "tag-ref") return;
  if (expression.kind === "tag-set") { expression.entries.forEach((entry) => { if (entry.value) walkExpression(entry.value, read, locals); }); return; }
  if (expression.kind === "tag-set-item") { walkExpression(expression.set, read, locals); walkExpression(expression.tag, read, locals); return; }
  if (expression.kind === "runtime-property") { walkExpression(expression.object, read, locals); return; }
  if (expression.kind === "tag-read") {
    for (const tag of staticTags(expression.tag, locals)) read.add(tag);
    walkExpression(expression.tag, read, locals);
    return;
  }
  if (expression.kind === "unary") walkExpression(expression.value, read, locals);
  if (expression.kind === "binary") { walkExpression(expression.left, read, locals); walkExpression(expression.right, read, locals); }
  if (expression.kind === "conditional") { walkExpression(expression.test, read, locals); walkExpression(expression.consequent, read, locals); walkExpression(expression.alternate, read, locals); }
  if (expression.kind === "call") expression.arguments.forEach((argument) => walkExpression(argument, read, locals));
  if (expression.kind === "module-call") expression.arguments.forEach((argument) => {
    walkExpression(argument, read, locals);
    for (const tag of staticTags(argument, locals, true)) read.add(tag);
  });
  if (expression.kind === "popup-open") {
    walkExpression(expression.faceplateType, read, locals); walkExpression(expression.title, read, locals);
    expression.interfaceValues.forEach((item) => { if (item.kind === "tag") read.add(item.tag); else walkExpression(item.value, read, locals); });
    for (const item of [expression.independentWindow, expression.invisible, expression.popupWindowName, expression.adaptWindow, expression.left, expression.top, expression.width, expression.height]) if (item) walkExpression(item, read, locals);
  }
  if (expression.kind === "popup-property") walkExpression(expression.popup, read, locals);
  if (expression.kind === "timer-set") { walkExpression(expression.delay, read, locals); if (expression.callback.kind === "value") walkExpression(expression.callback.value, read, locals); }
}

function staticValues(expression: HmiScriptExpression, locals: Map<string, HmiScriptExpression>, path: Set<HmiScriptExpression> = new Set()): HmiScriptExpression[] {
  inspectionStep();
  if (path.has(expression) || path.size >= 64) return [];
  const next = new Set(path); next.add(expression);
  const resolve = (value: HmiScriptExpression) => staticValues(value, locals, next);
  if(expression.kind==="pattern-assign")return [inspectStaticAssignment(expression,locals)];
  if(expression.kind==="module-call")return inspectCallable({kind:"module-variable",name:expression.name},staticCallArguments(expression.arguments,locals),locals);
  if (expression.kind === "array" && expression.items.some(item => item.kind === "spread")) return [staticSpreadArray(expression.items, locals)];
  if (expression.kind === "object" && expression.entries.some(entry => entry.spread)) return [staticSpreadObject(expression, locals)];
  if (expression.kind === "data-call" && expression.arguments.some(item => item.kind === "spread")) return staticValues({ ...expression, arguments: staticCallArguments(expression.arguments, locals) }, locals, next);
  if (expression.kind === "construct") return staticValues(expression.callee, locals, next).filter(value => value.kind === "function-value" && value.errorType).map(value => staticErrorValue((value as Extract<HmiScriptExpression,{kind:"function-value"}>).errorType!, staticCallArguments(expression.arguments,locals),locals));
  if (expression.kind === "this") { const binding = locals.get("[this]"); return binding ? resolve(binding) : []; }
  if (expression.kind === "invoke") {
    const arguments_ = staticCallArguments(expression.arguments, locals);
    if ((arguments_.length === 1 || expression.arguments.some(item => item.kind === "spread")) && staticValues(expression.callee, locals, next).some(value => value.kind === "tag-set")) return staticValues({ kind: "tag-set-item", set: expression.callee, tag: arguments_[0] ?? { kind: "undefined" } }, locals, next);
    return inspectInvocation(expression, locals);
  }
  if (expression.kind === "local" || expression.kind === "module-variable") {
    const binding = locals.get(expression.name);
    return binding ? resolve(binding) : expression.kind === "local" && isScriptErrorName(expression.name) ? [{kind:"function-value",parameters:["message"],program:{version:9,statements:[]},errorType:expression.name}] : [];
  }
  if (expression.kind === "conditional") return [...new Set([...resolve(expression.consequent), ...resolve(expression.alternate)])];
  if (expression.kind === "member") {
    const keys = resolve(expression.key), known = keys.length && keys.every((key) => key.kind === "literal");
    const names = keys.flatMap((key) => key.kind === "literal" ? [String(key.value)] : []);
    const result: HmiScriptExpression[] = [];
    for (const object of resolve(expression.object)) {
      if (object.kind === "function-value") {
        const keys = known ? names : ["call", "apply", "bind", "name", "length"];
        for (const key of keys) {
          if (["call", "apply", "bind"].includes(key)) result.push(Object.assign({ kind: "function-value" as const, parameters: key === "apply" ? ["thisArg", "arguments"] : ["thisArg"], program: { version: 9 as const, statements: [] } }, { intrinsic: key }));
          else if (key === "length") result.push({ kind: "literal", value: object.functionLength ?? object.parameters.length });
          else if (key === "name") result.push({ kind: "literal", value: object.name ?? object.displayName ?? "" });
        }
      } else if (object.kind === "object") {
        for (const entry of object.entries) if (entry.possible || !known || names.includes(entry.name)) result.push(...resolve(entry.value));
      } else if (object.kind === "literal" && typeof object.value === "string") {
        if (known && names.includes("length")) result.push({kind:"literal",value:object.value.length});
        for (let i=0;i<object.value.length;i++) if (!known || names.includes(String(i))) { inspectionStep();result.push({kind:"literal",value:object.value[i]}); }
      } else if (object.kind === "array") {
        const possible = (object as StaticArray).possibleItems;
        if (known && names.includes("length") && !possible) result.push({ kind: "literal", value: object.items.length });
        if (possible) {
          if (!known || names.some((name) => /^(?:0|[1-9][0-9]*)$/.test(name))) result.push(...possible.flatMap(resolve));
        } else for (let index = 0; index < object.items.length; index += 1) if (!known || names.includes(String(index))) result.push(...resolve(object.items[index]));
      }
    }
    if (result.length > 1024) throw new Error("Troppi valori possibili nell'ispezione dei dati strutturati.");
    return [...new Set(result)];
  }
  if (expression.kind === "tag-set-item") {
    const names = resolve(expression.tag).flatMap((tag) => tag.kind === "tag-ref" ? [tag.name] : tag.kind === "literal" && typeof tag.value === "string" ? [tag.value] : []);
    const candidates = names.length ? names : resolve(expression.set).flatMap((set) => set.kind === "tag-set" ? set.entries.map((entry) => entry.name) : []);
    return candidates.map((name) => ({ kind: "tag-ref", name }));
  }
  if (expression.kind === "array-method") {
    if (["map", "flatMap", "filter", "find", "findLast", "reduce", "reduceRight"].includes(expression.method)) return inspectArrayCallback(expression, locals);
    const arrays = resolve(expression.object).filter((value): value is StaticArray => value.kind === "array");
    if (["pop", "shift"].includes(expression.method)) return arrays.flatMap((array) => staticArrayItems(array).flatMap(resolve));
    if (["reverse", "sort"].includes(expression.method)) return arrays.map((array) => array.possibleItems ? array : { ...array, possibleItems: [...array.items] });
    if (["slice", "splice"].includes(expression.method)) return arrays.map((array) => ({ ...array, items: [...array.items], possibleItems: [...staticArrayItems(array)] }));
  }
  if (expression.kind === "data-call" && ["Object.values", "Object.entries"].includes(expression.name)) {
    return resolve(expression.arguments[0]).flatMap((value): HmiScriptExpression[] => {
      const entries = value.kind === "object" ? value.entries : value.kind === "array" ? staticArrayItems(value).map((item, index) => ({ name: String(index), value: item })) : [];
      const items: HmiScriptExpression[] = entries.map((entry) => expression.name === "Object.values" ? entry.value : { kind: "array", items: [{ kind: "literal", value: entry.name }, entry.value] });
      return [{ kind: "array", items, ...(value.kind === "array" && (value as StaticArray).possibleItems || value.kind === "object" && value.entries.some(entry => entry.possible) ? { possibleItems: items } : {}) } as StaticArray];
    });
  }
  return [expression];
}

function staticValue(expression: HmiScriptExpression, locals: Map<string, HmiScriptExpression>): HmiScriptExpression | undefined {
  const values = staticValues(expression, locals);
  return values.length === 1 ? values[0] : undefined;
}

function staticTags(expression: HmiScriptExpression, locals: Map<string, HmiScriptExpression>, deep = false, path: Set<HmiScriptExpression> = new Set()): string[] {
  if (path.has(expression) || path.size >= 64) return [];
  const next = new Set(path); next.add(expression);
  const tags = new Set<string>();
  for (const value of staticValues(expression, locals)) {
    if (value.kind === "tag-ref") tags.add(value.name);
    else if (deep && value.kind === "tag-set") for (const entry of value.entries) tags.add(entry.name);
    else if (!deep && value.kind === "literal" && typeof value.value === "string") tags.add(value.value);
    else if (deep) {
      const children = value.kind === "array" ? staticArrayItems(value) : value.kind === "object" ? value.entries.map((entry) => entry.value) : [];
      for (const child of children) for (const tag of staticTags(child, locals, true, next)) tags.add(tag);
    }
  }
  return [...tags];
}

function bindStaticData(expression: HmiScriptExpression, locals: Map<string, HmiScriptExpression>): HmiScriptExpression {
  if(expression.kind==="pattern-assign")return inspectStaticAssignment(expression,locals);
  if(expression.kind==="module-call")return staticChoice(staticValues(expression,locals))??expression;
  if (expression.kind === "construct") return staticChoice(staticValues(expression,locals)) ?? expression;
  if (expression.kind === "this") return locals.get("[this]") ?? expression;
  if (expression.kind === "function-value") return (expression as StaticFunction).bindings ? expression : Object.assign({ ...expression }, { bindings: locals, ...(expression.arrow ? { lexicalThis: locals.get("[this]") ?? { kind: "undefined" } } : {}) });
  if (expression.kind === "invoke") return staticChoice(inspectInvocation(expression, locals)) ?? expression;
  if (expression.kind === "array") return staticSpreadArray(expression.items, locals);
  if (expression.kind === "object") return staticSpreadObject(expression, locals);
  if (expression.kind === "tag-set") return { ...expression, entries: expression.entries.map((entry) => ({ ...entry, ...(entry.value ? { value: bindStaticData(entry.value, locals) } : {}) })) };
  if (expression.kind === "conditional") return { ...expression, consequent: bindStaticData(expression.consequent, locals), alternate: bindStaticData(expression.alternate, locals) };
  if (["local", "module-variable", "member"].includes(expression.kind)) return staticChoice(staticValues(expression, locals)) ?? expression;
  if (expression.kind === "array-method" || expression.kind === "data-call") {
    const bound = expression.kind === "array-method" ? { ...expression, object: bindStaticData(expression.object, locals) } : { ...expression, arguments: expression.arguments.map((value) => bindStaticData(value, locals)) };
    return staticChoice(staticValues(bound, locals)) ?? expression;
  }
  return expression;
}

function updateStaticMember(object: HmiScriptExpression, key: HmiScriptExpression, value: HmiScriptExpression, locals: Map<string, HmiScriptExpression>) {
  if (!staticBoundData(object)) return;
  const names = staticValues(key, locals).flatMap((item) => item.kind === "literal" ? [String(item.value)] : []);
  const incoming = bindStaticData(value, locals);
  const merge = (previous: HmiScriptExpression): HmiScriptExpression => previous === incoming ? previous : { kind: "conditional", test: { kind: "literal", value: null }, consequent: previous, alternate: incoming };
  for (const target of staticValues(object, locals)) {
    if (target.kind === "object") {
      for (const entry of target.entries) if (!names.length || names.includes(entry.name)) entry.value = merge(entry.value);
      for (const name of names) if (!target.entries.some((entry) => entry.name === name)) target.entries.push({ name, value: incoming });
    } else if (target.kind === "array") {
      const possible = (target as StaticArray).possibleItems;
      if (possible) {
        const values = [...new Set([...possible, incoming].flatMap((item) => staticValues(item, locals)))];
        if (values.length > 1024) throw new Error("Troppi valori possibili nell'ispezione dei dati strutturati.");
        (target as StaticArray).possibleItems = values;
      }
      for (let index = 0; index < target.items.length; index += 1) if (!names.length || names.includes(String(index))) target.items[index] = merge(target.items[index]);
      for (const name of names) if (/^(?:0|[1-9][0-9]*)$/.test(name) && Number(name) < 1024 && Number(name) >= target.items.length) {
        while (target.items.length < Number(name)) target.items.push({ kind: "literal", value: null });
        target.items.push(incoming);
      }
    }
  }
}

function staticTag(expression: HmiScriptExpression, locals: Map<string, HmiScriptExpression>): string | undefined {
  const resolved = staticValue(expression, locals);
  if (resolved?.kind === "literal" && typeof resolved.value === "string") return resolved.value;
  return resolved?.kind === "tag-ref" ? resolved.name : undefined;
}

function staticTagSet(expression: HmiScriptExpression, locals: Map<string, HmiScriptExpression>): Extract<HmiScriptExpression, { kind: "tag-set" }> | undefined {
  const resolved = staticValue(expression, locals);
  return resolved?.kind === "tag-set" ? resolved : undefined;
}

function staticTagSets(expression: HmiScriptExpression, locals: Map<string, HmiScriptExpression>): Extract<HmiScriptExpression, { kind: "tag-set" }>[] {
  return staticValues(expression, locals).filter((value) => value.kind === "tag-set");
}

function updateStaticTagSet(expression: HmiScriptExpression, locals: Map<string, HmiScriptExpression>, entries: { name: string; value?: HmiScriptExpression }[]) {
  if (!["local", "module-variable", "member"].includes(expression.kind)) return;
  const sets = staticTagSets(expression, locals);
  if (sets.length === 1) sets[0].entries = entries;
}

function inspectStatements(statements: readonly HmiScriptStatement[], read: Set<string>, written: Set<string>, locals: Map<string, HmiScriptExpression>, asyncState: { value: boolean }, lexicalBlocks = true): boolean {
  let hasReturn = false;
  const callbacks: { program: HmiScriptProgram; bindings: Map<string, HmiScriptExpression>; parameters?: string[] }[] = [];
  for (const statement of statements) {
    if (lexicalBlocks && statement.kind === "declare" && !statement.functionScoped) locals.delete(statement.name);
    if (lexicalBlocks && statement.kind === "bind" && !statement.functionScoped) for (const name of patternNames(statement.pattern)) locals.delete(name);
  }
  for (const statement of statements) if (statement.kind === "function-declare") locals.set(statement.name, bindStaticData(statement.value, locals));
  const inspectCoercion = (expression:HmiScriptExpression|undefined) => {
    if(!expression)return;
    for(const candidate of staticValues(expression,locals))if(candidate.kind==="object")for(const entry of candidate.entries){
      inspectionStep();if(["toString","valueOf"].includes(entry.name))inspectCallable(entry.value,[],locals,read,written,asyncState,expression);
    }
  };
  const captureCallbacks = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if(item.kind==="pattern-assign"){inspectStaticAssignment(item as unknown as Extract<HmiScriptExpression,{kind:"pattern-assign"}>,locals,read,written,asyncState);return;}
    if(item.kind==="module-call" && typeof item.name==="string" && Array.isArray(item.arguments)){for(const argument of item.arguments)captureCallbacks(argument);inspectCallable({kind:"module-variable",name:item.name},staticCallArguments(item.arguments as HmiScriptExpression[],locals),locals,read,written,asyncState);return;}
    if (item.kind === "function-value") { callbacks.push({ program: item.program as HmiScriptProgram, bindings: new Map(locals), parameters: item.parameters as string[] }); return; }
    if(item.kind==="construct"&&Array.isArray(item.arguments))for(const argument of item.arguments)inspectCoercion(argument as HmiScriptExpression);
    if(item.kind==="invoke"&&Array.isArray(item.arguments)&&staticValues(item.callee as HmiScriptExpression,locals).some(value=>value.kind==="function-value"&&value.errorType))for(const argument of item.arguments)inspectCoercion(argument as HmiScriptExpression);
    if(item.kind==="call"&&item.name==="String"&&Array.isArray(item.arguments))inspectCoercion(item.arguments[0] as HmiScriptExpression);
    if(item.kind==="binary"&&!["===","!==","instanceof","&&","||","??"].includes(String(item.operator))){inspectCoercion(item.left as HmiScriptExpression);inspectCoercion(item.right as HmiScriptExpression);}
    if(item.kind==="array-method"&&item.method==="toString")inspectCallable({kind:"member",object:item.object as HmiScriptExpression,key:{kind:"literal",value:"toString"}},staticCallArguments(item.arguments as HmiScriptExpression[],locals),locals,read,written,asyncState,item.object as HmiScriptExpression);
    if (item.kind === "array-method") inspectArrayCallback(item as unknown as Extract<HmiScriptExpression, {kind:"array-method"}>, locals, read, written, asyncState);
    if (item.kind === "invoke") inspectInvocation(item as unknown as Extract<HmiScriptExpression, {kind:"invoke"}>, locals, read, written, asyncState);
    if (item.kind === "timer-set" && item.callback && typeof item.callback === "object") {
      const callback = item.callback as Extract<HmiScriptExpression, {kind:"timer-set"}>["callback"];
      if (callback.kind === "inline") callbacks.push({ program: callback.program, bindings: new Map(locals) });
      if (callback.kind === "value") { captureCallbacks(callback.value); inspectCallable(callback.value, [], locals, read, written, asyncState); }
      captureCallbacks(item.delay); return;
    }
    for (const [key, child] of Object.entries(item)) {
      if (!["statements", "consequent", "alternate", "cases", "success", "failure", "final"].includes(key)) captureCallbacks(child);
    }
  };
  const functionVars = (body: readonly HmiScriptStatement[], names = new Set<string>()): Set<string> => {
    for (const statement of body) {
      if (statement.kind === "declare" && (statement.functionScoped || !lexicalBlocks)) names.add(statement.name);
      else if (statement.kind === "bind" && (statement.functionScoped || !lexicalBlocks)) for (const name of patternNames(statement.pattern)) names.add(name);
      else if (statement.kind === "block") functionVars(statement.statements, names);
      else if (statement.kind === "if") { functionVars(statement.consequent, names); functionVars(statement.alternate, names); }
      else if (statement.kind === "switch") for (const entry of statement.cases) functionVars(entry.statements, names);
      else if (statement.kind === "try") { functionVars(statement.statements, names); functionVars(statement.failure?.statements ?? [], names); functionVars(statement.final, names); }
    }
    return names;
  };
  const mergeBindings = (child: Map<string, HmiScriptExpression>, body: readonly HmiScriptStatement[], functionBody = false, excluded: string[] = []) => {
    const vars = functionVars(body), hidden = new Set([...excluded, ...body.flatMap(statement => lexicalBlocks && !((statement.kind === "declare" || statement.kind === "bind") && statement.functionScoped) ? statement.kind === "declare" ? [statement.name] : statement.kind === "bind" ? patternNames(statement.pattern) : [] : []), ...(functionBody ? vars : [])]);
    for (const [name, value] of child) if (!hidden.has(name) && (locals.has(name) || !functionBody && vars.has(name))) {
      const before = locals.get(name); locals.set(name, before && before !== value ? staticChoice([before, value])! : value);
    }
  };
  const inspectNested = (body: readonly HmiScriptStatement[], bindings?: Record<string, HmiScriptExpression>, functionBody = false) => {
    const child = new Map(locals); for (const [name, value] of Object.entries(bindings ?? {})) child.set(name, value);
    const returned = inspectStatements(body, read, written, child, asyncState, lexicalBlocks);
    mergeBindings(child, body, functionBody, Object.keys(bindings ?? {})); return returned;
  };
  for (const statement of statements) {
    captureCallbacks(statement);
    if(statement.kind==="throw"){
      walkExpression(statement.value,read,locals);recordStaticThrow(asyncState,bindStaticData(statement.value,locals));
    } else if (statement.kind === "bind") {
      walkExpression(statement.value,read,locals);inspectPatternBindings(statement.pattern,statement.value,locals,read,written,asyncState);
    } else if (statement.kind === "declare" || statement.kind === "assign") {
      if (statement.value) { walkExpression(statement.value, read, locals); locals.set(statement.name, bindStaticData(statement.value, locals)); }
    } else if (statement.kind === "block") {
      hasReturn = inspectNested(statement.statements) || hasReturn;
    } else if (statement.kind === "member-set") {
      walkExpression(statement.object, read, locals); walkExpression(statement.key, read, locals); walkExpression(statement.value, read, locals);
      for (const target of staticValues(statement.object, locals)) if (target.kind === "tag-ref") written.add(target.name);
      for (const tag of staticTags(statement.value, locals, true)) read.add(tag);
      updateStaticMember(statement.object, statement.key, statement.value, locals);
    } else if (statement.kind === "expression") {
      walkExpression(statement.value, read, locals);
    } else if (statement.kind === "return") {
      hasReturn = true;
      if (statement.value) walkExpression(statement.value, read, locals);
    } else if (statement.kind === "trace" || statement.kind === "navigate") {
      walkExpression(statement.kind === "trace" ? statement.value : statement.target, read, locals);
    } else if (statement.kind === "module-call") {
      walkExpression(statement.call, read, locals);
    } else if (statement.kind === "timer-set") {
      walkExpression(statement.timer, read, locals);
    } else if (statement.kind === "timer-clear") {
      walkExpression(statement.id, read, locals);
    } else if (statement.kind === "popup-set") {
      walkExpression(statement.popup, read, locals); walkExpression(statement.value, read, locals);
    } else if (statement.kind === "popup-close") {
      if (statement.popup) walkExpression(statement.popup, read, locals);
    } else if (statement.kind === "raise-faceplate-event") {
      walkExpression(statement.name, read, locals);
      statement.parameters.forEach((parameter) => walkExpression(parameter.value, read, locals));
    } else if (statement.kind === "write") {
      walkExpression(statement.tag, read, locals); walkExpression(statement.value, read, locals);
      for (const tag of staticTags(statement.tag, locals)) written.add(tag);
    } else if (statement.kind === "tag-set-read") {
      walkExpression(statement.set, read, locals);
      if (statement.mode) walkExpression(statement.mode, read, locals);
      if (statement.maxAge) walkExpression(statement.maxAge, read, locals);
      if (statement.async) asyncState.value = true;
      for (const set of staticTagSets(statement.set, locals)) for (const entry of set.entries) read.add(entry.name);
    } else if (statement.kind === "tag-set-add") {
      walkExpression(statement.set, read, locals);
      statement.entries.forEach((entry) => { if (entry.value) walkExpression(entry.value, read, locals); });
      if (staticBoundData(statement.set)) for (const set of staticTagSets(statement.set, locals)) {
        const additions = statement.entries.filter((entry) => !set.entries.some((existing) => existing.name === entry.name));
        set.entries = [...set.entries, ...additions.map((entry) => ({ ...entry, ...(entry.value ? { value: bindStaticData(entry.value, locals) } : {}) }))];
      }
    } else if (statement.kind === "tag-set-remove") {
      walkExpression(statement.set, read, locals);
      const current = staticTagSet(statement.set, locals)?.entries ?? [];
      updateStaticTagSet(statement.set, locals, current.filter((entry) => !statement.names.includes(entry.name)));
    } else if (statement.kind === "tag-set-clear") {
      walkExpression(statement.set, read, locals);
      updateStaticTagSet(statement.set, locals, []);
    } else if (statement.kind === "tag-set-stage") {
      walkExpression(statement.set, read, locals); walkExpression(statement.tag, read, locals); walkExpression(statement.value, read, locals);
      const tag = staticTag(statement.tag, locals); if (tag) written.add(tag);
    } else if (statement.kind === "tag-set-write") {
      walkExpression(statement.set, read, locals);
      if (statement.mode) walkExpression(statement.mode, read, locals);
      if (statement.async) asyncState.value = true;
      for (const set of staticTagSets(statement.set, locals)) for (const entry of set.entries) if (entry.value) written.add(entry.name);
    } else if (statement.kind === "qcd-write") {
      walkExpression(statement.target, read, locals);
      statement.arguments.forEach((argument) => walkExpression(argument, read, locals));
      for (const tag of staticTags(statement.target, locals)) written.add(tag);
      for (const set of staticTagSets(statement.target, locals)) for (const entry of set.entries) if (entry.value) written.add(entry.name);
    } else if (statement.kind === "operator-write") {
      walkExpression(statement.target, read, locals); walkExpression(statement.reason, read, locals);
      if (statement.value) walkExpression(statement.value, read, locals);
      for (const tag of staticTags(statement.target, locals)) written.add(tag);
      for (const set of staticTagSets(statement.target, locals)) for (const entry of set.entries) if (entry.value) written.add(entry.name);
    } else if (statement.kind === "tag-set-promise") {
      asyncState.value = true;
      walkExpression(statement.set, read, locals);
      if (statement.mode) walkExpression(statement.mode, read, locals);
      if (statement.maxAge) walkExpression(statement.maxAge, read, locals);
      for (const tagSet of staticTagSets(statement.set, locals)) for (const entry of tagSet.entries) {
        if (statement.operation === "read") read.add(entry.name);
        else if (entry.value) written.add(entry.name);
      }
      if (statement.success) inspectNested(statement.success.statements, statement.success.name ? { [statement.success.name]: statement.set } : undefined, true);
      if (statement.failure) inspectNested(statement.failure.statements, statement.failure.name ? { [statement.failure.name]: { kind: "literal", value: 0 } } : undefined, true);
    } else if (statement.kind === "bit") {
      walkExpression(statement.tag, read, locals); walkExpression(statement.bit, read, locals);
      const tag = staticTag(statement.tag, locals); if (tag) written.add(tag);
    } else if (statement.kind === "if") {
      walkExpression(statement.test, read, locals);
      const consequentReturn = inspectNested(statement.consequent);
      const alternateReturn = inspectNested(statement.alternate);
      hasReturn = consequentReturn || alternateReturn || hasReturn;
    } else if (statement.kind === "switch") {
      walkExpression(statement.value, read, locals);
      const switchLocals = new Map(locals), body = statement.cases.flatMap(entry => entry.statements);
      for (const declaration of body) {
        if (lexicalBlocks && declaration.kind === "declare" && !declaration.functionScoped) switchLocals.delete(declaration.name);
        if (lexicalBlocks && declaration.kind === "bind" && !declaration.functionScoped) for (const name of patternNames(declaration.pattern)) switchLocals.delete(name);
      }
      for (const entry of statement.cases) {
        if (entry.test) walkExpression(entry.test, read, switchLocals);
        hasReturn = inspectStatements(entry.statements, read, written, switchLocals, asyncState, lexicalBlocks) || hasReturn;
      }
      mergeBindings(switchLocals, body);
    } else if (statement.kind === "try") {
      const state=asyncState as InspectionEffects,previous=state.thrown??[];state.thrown=[];
      hasReturn = inspectNested(statement.statements) || hasReturn;
      const caught=state.thrown;state.thrown=previous;
      if(statement.failure)hasReturn=inspectNested(statement.failure.statements,statement.failure.name?{[statement.failure.name]:staticChoice(caught)??{kind:"literal",value:0}}:undefined)||hasReturn;
      else for(const value of caught)recordStaticThrow(asyncState,value);
      hasReturn=inspectNested(statement.final)||hasReturn;
    }
  }
  for (const callback of callbacks) {
    for (const [name, value] of locals) {
      const before = callback.bindings.get(name);
      callback.bindings.set(name, before && before !== value ? staticChoice([before, value])! : value);
    }
    for (const name of callback.parameters ?? []) callback.bindings.delete(name);
    inspectStatements(callback.program.statements, read, written, callback.bindings, asyncState, callback.program.version >= 2);
  }
  return hasReturn;
}

function inspectModuleVariables(program: HmiScriptProgram, variables: Readonly<Record<string, HmiScriptRuntimeVariable>>, read: Set<string>, written: Set<string>, asyncState: { value: boolean }, bindings: Map<string, HmiScriptExpression> = new Map(), stack: string[] = [], functions: Readonly<Record<string, HmiScriptRuntimeFunction>> = {}): Map<string, HmiScriptExpression> {
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if ((item.kind === "module-variable" || item.kind === "module-call") && typeof item.name === "string") {
      const name = item.name;
      const fn = functions[name];
      if (fn) {
        if (!bindings.has(name)) {
          if(stack.includes(name))throw new Error("Chiamata ricorsiva non ammessa: "+[...stack,name].join(" -> "));
          const fnBindings = new Map<string, HmiScriptExpression>();
          const value: StaticFunction = { kind: "function-value", parameters: [...fn.parameters], program: fn.program, bindings: fnBindings, name };
          bindings.set(name, value);
          const definition = fn.globalDefinition ?? fn.globalScope?.initializer;
          if (definition) {
            inspectModuleVariables(definition,variables,read,written,asyncState,fnBindings,[...stack,name],functions);
            inspectStatements(definition.statements, read, written, fnBindings, asyncState, definition.version >= 2);
          }
          inspectModuleVariables(fn.program,variables,read,written,asyncState,fnBindings,[...stack,name],functions);
          for (const tag of fn.tagsRead ?? []) read.add(tag);
          for (const tag of fn.tagsWritten ?? []) written.add(tag);
          if (fn.hasAsync) asyncState.value = true;
        }
        return;
      }
      if (stack.includes(name)) throw new Error(`Dipendenza ciclica fra variabili pubbliche HMI: ${[...stack, name].join(" -> ")}.`);
      const binding = variables[name];
      if(item.kind==="module-call" && !binding)throw new Error("Funzione HMI " + name + " non definita o non importata nel contesto corrente.");
      if (!binding || !binding.definition.exports?.some((entry) => entry.local === binding.name && name.endsWith(`.${entry.name}`))) throw new Error(`Variabile pubblica HMI ${name} non esportata o modulo non disponibile.`);
      if (bindings.has(name)) return;
      inspectModuleVariables(binding.definition, variables, read, written, asyncState, bindings, [...stack, name], functions);
      const locals = new Map(bindings);
      inspectStatements(binding.definition.statements, read, written, locals, asyncState, binding.definition.version >= 2);
      const expression = staticValue({ kind: "local", name: binding.name }, locals);
      if (expression) bindings.set(name, expression);
      return;
    }
    for (const child of Object.values(item)) visit(child);
  };
  visit(program);
  return bindings;
}

function inspectModuleDependencies(program: HmiScriptProgram, functions: Readonly<Record<string, HmiScriptRuntimeFunction>>, read: Set<string>, written: Set<string>, asyncState: { value: boolean }, stack: string[] = [], variables?: Readonly<Record<string, HmiScriptRuntimeVariable>>, callerLocals: Map<string, HmiScriptExpression> = new Map()) {
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (item.kind === "module-call" && typeof item.name === "string" && Array.isArray(item.arguments)) {
      for (const argument of item.arguments) visit(argument);
      const definition = functions[item.name];
      if (!definition) {
        if (variables?.[item.name]) {
          const reference: HmiScriptExpression = { kind: "module-variable", name: item.name };
          const bindingProgram: HmiScriptProgram = { version: 9, statements: [{ kind: "expression", value: reference }] };
          const bindings = inspectModuleVariables(bindingProgram, variables, read, written, asyncState, new Map(callerLocals), [], functions);
          inspectCallable(reference, staticCallArguments(item.arguments as HmiScriptExpression[], bindings), bindings, read, written, asyncState); return;
        }
        throw new Error("Funzione HMI " + item.name + " non definita o non importata nel contesto corrente.");
      }
      if (definition.program.version < 5 && definition.parameters.length !== item.arguments.length) throw new Error(`${item.name} richiede ${definition.parameters.length} argomenti, ricevuti ${item.arguments.length}.`);
      if (stack.includes(item.name)) throw new Error(`Chiamata ricorsiva non ammessa: ${[...stack, item.name].join(" -> ")}.`);
      for (const tag of definition.tagsRead ?? []) read.add(tag);
      for (const tag of definition.tagsWritten ?? []) written.add(tag);
      if (definition.hasAsync) asyncState.value = true;
      {
        const bindings = variables ? inspectModuleVariables(definition.program, variables, read, written, asyncState, new Map(), [], functions) : new Map<string, HmiScriptExpression>();
        const globalDefinition = definition.globalDefinition ?? definition.globalScope?.initializer;
        if (globalDefinition) {
          if (variables) inspectModuleVariables(globalDefinition, variables, read, written, asyncState, bindings, [], functions);
          inspectStatements(globalDefinition.statements, read, written, bindings, asyncState, globalDefinition.version >= 2);
        }
        for (let index = 0; index < definition.parameters.length; index += 1) {
          bindings.set(definition.parameters[index], bindStaticData(staticCallArguments(item.arguments as HmiScriptExpression[], callerLocals)[index] ?? { kind: "undefined" }, callerLocals));
        }
        inspectStatements(definition.program.statements, read, written, bindings, asyncState, definition.program.version >= 2);
        const returnedTags = (value: unknown) => {
          if (!value || typeof value !== "object") return;
          const statement = value as Record<string, unknown>;
          if (statement.kind === "return" && statement.value) for (const tag of staticTags(statement.value as HmiScriptExpression, bindings, true)) read.add(tag);
          for (const child of Object.values(statement)) returnedTags(child);
        };
        returnedTags(definition.program);
        inspectModuleDependencies(definition.program, functions, read, written, asyncState, [...stack, item.name], variables, bindings);
      }
      return;
    }
    for (const child of Object.values(item)) visit(child);
  };
  visit(program);
}

export function inspectHmiScriptProgram(program: HmiScriptProgram, functions?: Readonly<Record<string, HmiScriptRuntimeFunction>>, definition?: HmiScriptProgram, parameters: readonly string[] = [], variables?: Readonly<Record<string, HmiScriptRuntimeVariable>>): HmiScriptInspection {
  const previousBudget = hmiInspectionBudget;
  hmiInspectionBudget = { remaining: 100000, deadline: Date.now() + 500, arrayDepth: 0, callDepth: 0 };
  try {
    if (!program || ![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(program.version) || !Array.isArray(program.statements)) throw new Error("Versione dello script non supportata: aggiorna il Runtime e ricompila il sorgente.");
    const read = new Set<string>();
    const written = new Set<string>();
    const asyncState = { value: false };
    const locals = new Map<string, HmiScriptExpression>();
    if (variables || functions) {
      inspectModuleVariables(program, variables ?? {}, read, written, asyncState, locals, [], functions);
      if (definition) inspectModuleVariables(definition, variables ?? {}, read, written, asyncState, locals, [], functions);
    }
    if (definition) inspectStatements(definition.statements, read, written, locals, asyncState, definition.version >= 2);
    for (const parameter of parameters) locals.set(parameter, { kind: "literal", value: null });
    const hasReturn = inspectStatements(program.statements, read, written, locals, asyncState, program.version >= 2);
    if (functions) inspectModuleDependencies(program, functions, read, written, asyncState, [], variables, locals);
    return { tagsRead: [...read], tagsWritten: [...written], hasReturn, hasAsync: asyncState.value, program };
  } catch (caught) {
    return { tagsRead: [], tagsWritten: [], hasReturn: false, hasAsync: false, error: caught instanceof Error ? caught.message : String(caught) };
  } finally { hmiInspectionBudget = previousBudget; }
}

export function inspectHmiScript(source: string, functions?: Readonly<Record<string, HmiScriptRuntimeFunction>>, definition?: HmiScriptProgram, parameters: readonly string[] = [], variables?: Readonly<Record<string, HmiScriptRuntimeVariable>>): HmiScriptInspection {
  if (!source.trim()) return { tagsRead: [], tagsWritten: [], hasReturn: false, hasAsync: false, error: "Lo script e' vuoto." };
  if (source.length > 20_000) return { tagsRead: [], tagsWritten: [], hasReturn: false, hasAsync: false, error: "Lo script supera il limite di 20.000 caratteri." };
  try {
    const file = parse(`async function __framecraftScript() {\n${source}\n}`, { sourceType: "module" });
    const declaration = file.program.body[0];
    if (!t.isFunctionDeclaration(declaration) || !t.isBlockStatement(declaration.body)) fail("Script non leggibile");
    return inspectHmiScriptProgram({ version: 9, statements: compileBlock(declaration.body) }, functions, definition, parameters, variables);
  } catch (caught) {
    return { tagsRead: [], tagsWritten: [], hasReturn: false, hasAsync: false, error: caught instanceof Error ? caught.message : String(caught) };
  }
}

export function inspectHmiScriptDefinition(source: string, allowExports = false): HmiScriptInspection {
  if (!source.trim() || source.length > 20_000) return inspectHmiScript(source);
  try {
    const file = parse(`\n${source}`, { sourceType: "module" });
    const statements: HmiScriptStatement[] = [];
    const exports: { name: string; local: string }[] = [];
    for (const item of file.program.body) {
      if (t.isExportNamedDeclaration(item)) {
        if (!allowExports) fail("Le dichiarazioni export sono disponibili solo nei moduli globali.", item);
        if (item.source || item.declaration && !t.isVariableDeclaration(item.declaration)) fail("Esporta variabili let/const/var; configura le funzioni nel catalogo del modulo. Re-export da file esterni non supportato.", item);
        if (item.declaration) {
          const declarations = compileBlock(item.declaration);
          statements.push(...declarations);
          for (const declaration of declarations) {
            if (declaration.kind === "declare") exports.push({ name: declaration.name, local: declaration.name });
            else if (declaration.kind === "bind") for (const name of patternNames(declaration.pattern)) exports.push({name,local:name});
          }
        }
        for (const entry of item.specifiers) {
          if (!t.isExportSpecifier(entry) || !t.isIdentifier(entry.exported)) fail("Gli export richiedono nomi JavaScript semplici.", entry);
          exports.push({ name: entry.exported.name, local: entry.local.name });
        }
      } else {
        if (!t.isStatement(item)) fail("Dichiarazione globale non supportata.", item);
        statements.push(...compileBlock(item));
      }
    }
    return inspectHmiScriptProgram({ version: 9, statements, ...(exports.length ? { exports } : {}) });
  } catch (caught) {
    return { tagsRead: [], tagsWritten: [], hasReturn: false, hasAsync: false, error: caught instanceof Error ? caught.message : String(caught) };
  }
}

function normalizeHmiProcessValue(value:unknown,definition:HmiScriptProcessValue):string|number|boolean {
  let result:string|number|boolean;
  try{result=normalizeProcessTag(value,definition.dataType);}catch(error){const reason=(error instanceof Error?error.message:String(error)).replace('driver MQTT','driver scalare');throw new TypeError('ProcessValue ('+definition.dataType.slice(0,80)+'): '+reason+' Controlla il tipo dichiarato e il valore.');}
  if(typeof result==='string'&&result.length>20000)throw new Error('ProcessValue supera 20000 caratteri.');
  if(typeof result==='number'&&(definition.minimum!==undefined&&result<definition.minimum||definition.maximum!==undefined&&result>definition.maximum))throw new Error('ProcessValue è fuori dai limiti del controllo.');
  if(definition.choices&&!definition.choices.includes(String(result)))throw new Error('ProcessValue non corrisponde a una delle scelte del controllo.');
  return result;
}
function normal(value: string): HmiScriptScalar {
  const trimmed = value.trim();
  if (/^(?:true|yes|on)$/i.test(trimmed)) return true;
  if (/^(?:false|no|off)$/i.test(trimmed)) return false;
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return value;
}

function isScriptErrorName(name: string): boolean {
  return ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "EvalError", "URIError", "AggregateError"].includes(name);
}
function staticErrorValue(name: string, args: HmiScriptExpression[], locals: Map<string,HmiScriptExpression>): HmiScriptExpression {
  const option = args[name === "AggregateError" ? 2 : 1];
  const entries: Extract<HmiScriptExpression,{kind:"object"}>["entries"] = [{name:"name",value:{kind:"literal",value:name}}, {name:"message",value:args[name === "AggregateError" ? 1 : 0] ?? {kind:"undefined"}}];
  if (option) entries.push({name:"cause",value:bindStaticData({kind:"member",object:option,key:{kind:"literal",value:"cause"}},locals)});
  if (name === "AggregateError") entries.push({name:"errors",value:args[0] ?? {kind:"undefined"}});
  return {kind:"object",entries};
}
function scriptErrorValue(name: string, args: RuntimeValue[], tick: () => void): DataReference {
  if (!isScriptErrorName(name)) throw new Error("Tipo di errore non supportato nella sandbox.");
  const data: Record<string,RuntimeValue> = Object.create(null);
  const result: DataReference = {data,errorType:name};
  const define = (key: string,value: RuntimeValue) => { checkData(value,tick,result,1);Object.defineProperty(data,key,{value,writable:true,configurable:true,enumerable:false}); };
  const message = args[name === "AggregateError" ? 1 : 0];
  if (message !== undefined && !isUndefinedReference(message)) define("message",dataString(message,tick));
  const options = args[name === "AggregateError" ? 2 : 1];
  if (options && isDataReference(options) && Object.prototype.hasOwnProperty.call(options.data,"cause")) define("cause",dataGet(options,"cause",true));
  if (name === "AggregateError") {
    const errors = args[0];
    if (typeof errors === "string") define("errors",{data:Array.from(errors)});
    else if (errors && isDataReference(errors) && Array.isArray(errors.data)) define("errors",{data:Array.from({length:errors.data.length},(_,index)=>dataGet(errors,String(index),true))});
    else throw new TypeError("AggregateError richiede un array o una stringa di errori nella sandbox.");
  }
  define("stack",scriptErrorString(result,tick)+"\n    at <hmi-script>");
  return result;
}
function scriptErrorString(value: DataReference, tick: () => void): string {
  const rawName=dataGet(value,"name",true), rawMessage=dataGet(value,"message",true);
  const name=isUndefinedReference(rawName)?"Error":dataString(rawName,tick),message=isUndefinedReference(rawMessage)?"":dataString(rawMessage,tick);
  const text=!name?message:!message?name:name+": "+message;
  if(text.length>20000)throw new Error("Il testo dell'errore supera 20000 caratteri.");
  return text;
}

function isScriptThrown(value: unknown): value is { __framecraftScriptThrown: true; value: RuntimeValue; fromHost?: true } {
  return typeof value === "object" && value !== null && "__framecraftScriptThrown" in value && value.__framecraftScriptThrown === true && "value" in value;
}
function scriptThrownMessage(value: RuntimeValue): string {
  if (isDataReference(value) && value.errorType && !Array.isArray(value.data)) { const name=typeof value.data.name === "string"?value.data.name:value.errorType,message=typeof value.data.message === "string"?value.data.message:"";return (message?name+": "+message:name).slice(0,1000); }
  const message = typeof value === "string" ? value : isDataReference(value) && !Array.isArray(value.data) && typeof value.data.message === "string" ? value.data.message : undefined;
  return message?.trim() ? message.slice(0,1000) : "Eccezione generata dallo script.";
}
function undefinedValue(reason?: string): UndefinedReference { return { undefinedValue: true, ...(reason ? { reason } : {}) }; }

function isUndefinedReference(value: RuntimeValue): value is UndefinedReference { return typeof value === "object" && value !== null && "undefinedValue" in value; }

function truthy(value: RuntimeValue, modern = false): boolean {
  if (isUndefinedReference(value)) return false;
  if (modern && typeof value === "string") return value.length > 0;
  if (typeof value === "object" && value !== null) return true;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value !== null && !/^(?:|0|false|no|off)$/i.test(String(value).trim());
}

function isTagReference(value: RuntimeValue): value is TagReference {
  return typeof value === "object" && value !== null && "tag" in value;
}

function isTagSetReference(value: RuntimeValue): value is TagSetReference {
  return typeof value === "object" && value !== null && "tagSet" in value && !("tag" in value);
}

function isPopupReference(value: RuntimeValue): value is HmiScriptPopupReference {
  return typeof value === "object" && value !== null && "popupId" in value;
}

function number(value: RuntimeValue): number {
  if (isUndefinedReference(value)) throw new Error(value.reason ?? "Valore assente (undefined): assegna un valore numerico prima di usarlo in un calcolo.");
  if (typeof value === "object" && value !== null) throw new Error("Un riferimento tag non e' un numero.");
  const converted = Number(value);
  if (!Number.isFinite(converted)) throw new Error(`"${String(value)}" non e' un numero.`);
  return converted;
}

function isFunctionReference(value: RuntimeValue): value is FunctionReference {
  return typeof value === "object" && value !== null && "scriptFunction" in value;
}

function scalar(value: RuntimeValue): HmiScriptScalar {
  if (isUndefinedReference(value)) throw new Error(value.reason ?? "Valore assente (undefined): assegna un valore prima di inviarlo al PLC o usarlo come proprieta' grafica.");
  if (isFunctionReference(value)) throw new Error("Una funzione non puo' essere usata come valore PLC, testo, proprieta' o JSON: chiamala e usa il risultato.");
  if (isDataReference(value)) throw new Error("Un valore strutturato richiede un membro scalare o JSON.stringify(), non puo' essere usato direttamente come valore PLC/proprieta'.");
  if (value && typeof value === "object" && "screenItemId" in value) throw new Error("Un riferimento grafico richiede una proprieta' scalare, per esempio Font.Size, non puo' essere usato come valore PLC/proprieta'.");
  if (typeof value === "object" && value !== null) throw new Error("Lo script sta usando il riferimento a un tag invece del suo valore: aggiungi .Read().");
  return value;
}

function dataKey(value: RuntimeValue): string {
  const key = isUndefinedReference(value) ? "undefined" : String(scalar(value) ?? "null");
  if (key.length > 128 || ["__proto__", "prototype", "constructor", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"].includes(key)) throw new Error("Proprieta' " + key.slice(0, 128) + " non ammessa nella sandbox.");
  return key;
}

function isDataReference(value: RuntimeValue): value is DataReference {
  return typeof value === "object" && value !== null && "data" in value;
}

function checkData(value: RuntimeValue, tick: () => void, forbidden?: DataReference, depth = 0, path: Set<DataReference> = new Set()) {
  tick();
  if (typeof value === "string" && value.length > 20000) throw new Error("Un valore strutturato supera il limite di 20000 caratteri.");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("I dati strutturati richiedono numeri finiti.");
  if (!isDataReference(value)) return;
  if (value === forbidden || path.has(value)) throw new Error("Riferimento ciclico nei dati strutturati non ammesso.");
  if (depth >= 32) throw new Error("I dati strutturati superano 32 livelli.");
  const entries = Array.isArray(value.data) ? value.data : Object.getOwnPropertyNames(value.data).map(key=>(value.data as Record<string,RuntimeValue>)[key]);
  if (entries.length > 1024) throw new Error("Una raccolta dati supera il limite di 1024 elementi.");
  path.add(value);
  for (const item of Array.isArray(value.data) ? Object.values(value.data) : entries) checkData(item, tick, forbidden, depth + 1, path);
  path.delete(value);
}

function dataGet(value: DataReference, key: string, modern = false): RuntimeValue {
  if (Array.isArray(value.data)) {
    if (key === "length") return value.data.length;
    if (!/^(?:0|[1-9][0-9]*)$/.test(key)) throw new Error("Un array richiede un indice intero non negativo o length.");
    const index = Number(key);
    if (index >= 1024) throw new Error("Un indice array supera il limite di 1024 elementi.");
    return Object.prototype.hasOwnProperty.call(value.data, index) ? value.data[index] : modern ? undefinedValue() : null;
  }
  if (Object.prototype.hasOwnProperty.call(value.data,key)) return value.data[key];
  if (value.errorType && key === "name") return value.errorType;
  if (value.errorType && key === "message") return "";
  return modern ? undefinedValue() : null;
}

function dataSet(target: DataReference, key: string, value: RuntimeValue, tick: () => void, modern = false) {
  checkData(value, tick, target, 1);
  if (Array.isArray(target.data)) {
    if (key === "length") {
      const length = number(value);
      if (!Number.isInteger(length) || length < 0 || length > 1024) throw new Error("La lunghezza array deve essere tra 0 e 1024.");
      if (!modern) while (target.data.length < length) { tick(); target.data.push(null); }
      target.data.length = length;
    } else {
      if (!/^(?:0|[1-9][0-9]*)$/.test(key)) throw new Error("Un array richiede un indice intero non negativo.");
      const index = Number(key);
      if (index >= 1024) throw new Error("Un indice array supera il limite di 1024 elementi.");
      if (!modern) while (target.data.length <= index) { tick(); target.data.push(null); }
      target.data[index] = value;
    }
  } else {
    if (!Object.prototype.hasOwnProperty.call(target.data, key) && Object.getOwnPropertyNames(target.data).length >= 1024) throw new Error("Un oggetto supera il limite di 1024 proprieta'.");
    target.data[key] = value;
  }
}

function dataString(value: RuntimeValue, tick: () => void, depth = 0): string {
  if (isUndefinedReference(value)) return "undefined";
  tick();
  if (depth >= 32) throw new Error("I dati strutturati superano 32 livelli.");
  if (!isDataReference(value)) return String(scalar(value));
  if (value.errorType) return scriptErrorString(value,tick);
  if (!Array.isArray(value.data)) return "[object Object]";
  const parts = value.data.map((item) => item === null || isUndefinedReference(item) ? "" : dataString(item, tick, depth + 1));
  if (parts.reduce((sum, item) => sum + item.length, 0) + Math.max(0, parts.length - 1) > 20000) throw new Error("Il testo dell'array supera 20000 caratteri.");
  return parts.join(",");
}

function dataFromJson(value: unknown, tick: () => void, depth = 0): RuntimeValue {
  tick();
  if (depth >= 32) throw new Error("I dati JSON superano 32 livelli.");
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    checkData(value, tick);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 1024) throw new Error("Un array JSON supera 1024 elementi.");
    return { data: value.map((item) => dataFromJson(item, tick, depth + 1)) };
  }
  if (typeof value !== "object") throw new Error("Il valore non e' un dato JSON supportato.");
  const entries = Object.entries(value);
  if (entries.length > 1024) throw new Error("Un oggetto JSON supera 1024 proprieta'.");
  return { data: Object.assign(Object.create(null), Object.fromEntries(entries.map(([key, item]) => [dataKey(key), dataFromJson(item, tick, depth + 1)]))) };
}

function dataJson(value: RuntimeValue, tick: () => void): string | UndefinedReference {
  if (isUndefinedReference(value)) return value;
  checkData(value, tick);
  let length = 0;
  const convert = (item: RuntimeValue, depth: number): unknown => {
    tick();
    if (depth >= 32) throw new Error("I dati JSON superano 32 livelli.");
    let result: unknown;
    if (isUndefinedReference(item)) return undefined;
    if (!isDataReference(item)) {
      const primitive = scalar(item);
      if (typeof primitive === "string" && primitive.length > 20000) throw new Error("Il JSON supera 20000 caratteri.");
      result = primitive;
      length += JSON.stringify(primitive).length;
    } else if (Array.isArray(item.data)) {
      length += 2 + item.data.length;
      result = item.data.map((child) => convert(child, depth + 1));
    } else {
      length += 2;
      result = Object.assign(Object.create(null), Object.fromEntries(Object.entries(item.data).filter(([, child]) => !isUndefinedReference(child)).map(([key, child]) => {
        length += JSON.stringify(dataKey(key)).length + 2;
        return [key, convert(child, depth + 1)];
      })));
    }
    if (length > 20000) throw new Error("Il JSON supera 20000 caratteri.");
    return result;
  };
  return JSON.stringify(convert(value, 0));
}

function dataArrayMethod(target: RuntimeValue, method: string, args: RuntimeValue[], tick: () => void, modern = false): RuntimeValue {
  if (!isDataReference(target) || !Array.isArray(target.data)) throw new Error(method + " richiede un array.");
  const array = target.data;
  const count = (minimum: number, maximum: number) => { if (args.length < minimum || args.length > maximum) throw new Error(method + " richiede da " + minimum + " a " + maximum + " argomenti."); };
  const index = (value: RuntimeValue | undefined, fallback: number) => value === undefined || modern && isUndefinedReference(value) ? fallback : Math.trunc(number(value));
  const additions = (items: RuntimeValue[], removed = 0) => {
    if (array.length - removed + items.length > 1024) throw new Error("L'array supera il limite di 1024 elementi.");
    for (const item of items) checkData(item, tick, target, 1);
  };
  tick();
  if (method === "push" || method === "unshift") { additions(args); return method === "push" ? array.push(...args) : array.unshift(...args); }
  if (method === "pop" || method === "shift") { count(0, 0); const value = method === "pop" ? array.pop() : array.shift(); return value === undefined ? modern ? undefinedValue() : null : value; }
  if (method === "indexOf" || method === "lastIndexOf" || method === "includes") {
    count(1, 2);
    const start = modern && args.length > 1 && isUndefinedReference(args[1]) ? 0 : index(args[1], method === "lastIndexOf" ? array.length - 1 : 0);
    if (modern && isUndefinedReference(args[0])) {
      const reverse = method === "lastIndexOf", step = reverse ? -1 : 1;
      let position = start < 0 ? array.length + start : start;
      position = reverse ? Math.min(position, array.length - 1) : Math.max(0, position);
      for (; position >= 0 && position < array.length; position += step) {
        tick(); const present = Object.prototype.hasOwnProperty.call(array, position);
        if ((!present && method === "includes") || present && isUndefinedReference(array[position])) return method === "includes" ? true : position;
      }
      return method === "includes" ? false : -1;
    }
    return method === "includes" ? array.includes(args[0], start) : method === "indexOf" ? array.indexOf(args[0], start) : array.lastIndexOf(args[0], start);
  }
  if (method === "slice") { count(0, 2); return { data: array.slice(index(args[0], 0), index(args[1], array.length)) }; }
  if (method === "join" || method === "toString") {
    count(0, method === "join" ? 1 : 0);
    const separator = args[0] === undefined || modern && isUndefinedReference(args[0]) ? "," : dataString(args[0], tick);
    const parts = array.map((item) => item === null || isUndefinedReference(item) ? "" : dataString(item, tick));
    if (parts.reduce((sum, item) => sum + item.length, 0) + Math.max(0, parts.length - 1) * separator.length > 20000) throw new Error("Il testo dell'array supera 20000 caratteri.");
    return parts.join(separator);
  }
  if (method === "reverse") { count(0, 0); array.reverse(); return target; }
  if (method === "sort") { count(0, 0); array.sort((left, right) => { const a = dataString(left, tick), b = dataString(right, tick); return a < b ? -1 : a > b ? 1 : 0; }); return target; }
  if (method === "splice") {
    count(0, 1024);
    if (!args.length) return { data: [] };
    const start = index(args[0], 0), actual = start < 0 ? Math.max(0, array.length + start) : Math.min(start, array.length);
    const removed = args.length === 1 ? array.length - actual : Math.min(Math.max(0, index(args[1], 0)), array.length - actual);
    additions(args.slice(2), removed);
    return { data: array.splice(actual, removed, ...args.slice(2)) };
  }
  throw new Error("Metodo Array " + method + " non supportato.");
}

function* dataArrayCallbackMethod(target: RuntimeValue, method: string, args: RuntimeValue[], tick: () => void, invoke: (fn: FunctionReference, args: RuntimeValue[], receiver?: RuntimeValue) => ScriptCoroutine<RuntimeValue>, receiverSupport = false): ScriptCoroutine<RuntimeValue> {
  if (!isDataReference(target) || !Array.isArray(target.data)) throw new Error(method + " richiede un array.");
  const array = target.data, length = array.length;
  if (length > 1024) throw new Error("L'array supera 1024 elementi.");
  const reducing = method === "reduce" || method === "reduceRight", sorting = method === "sort";
  const minimum = sorting ? 0 : 1, maximum = reducing ? 2 : !sorting && receiverSupport ? 2 : 1;
  if (args.length < minimum || args.length > maximum) throw new Error(method + " richiede da " + minimum + " a " + maximum + " argomenti; thisArg non e' disponibile in questo contesto.");
  const fn = args[0];
  if (!(sorting && (fn === undefined || isUndefinedReference(fn))) && !isFunctionReference(fn)) throw new Error("La callback di " + method + " deve essere una funzione HMI.");
  const call = function* (values: RuntimeValue[]): ScriptCoroutine<RuntimeValue> {
    tick();
    if (!isFunctionReference(fn)) throw new Error("Callback non valida.");
    return yield* invoke(fn, fn.scriptFunction.program.version >= 5 ? values : fn.scriptFunction.parameters.map((_, index) => values[index] === undefined ? undefinedValue() : values[index]), !sorting && !reducing && receiverSupport && args.length > 1 ? args[1] : undefinedValue());
  };
  if (sorting) {
    let rows = Object.values(array);
    const compare = function* (left: RuntimeValue, right: RuntimeValue): ScriptCoroutine<number> {
      tick();
      if (isUndefinedReference(left)) return isUndefinedReference(right) ? 0 : 1;
      if (isUndefinedReference(right)) return -1;
      if (!isFunctionReference(fn)) { const a = dataString(left, tick), b = dataString(right, tick); return a < b ? -1 : a > b ? 1 : 0; }
      const value = yield* call([left, right]);
      const order = isUndefinedReference(value) ? 0 : Number(scalar(value));
      return Number.isNaN(order) ? 0 : order;
    };
    for (let width = 1; width < rows.length; width *= 2) {
      const output: RuntimeValue[] = [];
      for (let start = 0; start < rows.length; start += width * 2) {
        const middle = Math.min(start + width, rows.length), end = Math.min(start + width * 2, rows.length);
        let left = start, right = middle;
        while (left < middle || right < end) {
          tick();
          if (left < middle && (right >= end || (yield* compare(rows[left], rows[right])) <= 0)) output.push(rows[left++]); else output.push(rows[right++]);
        }
      }
      rows = output;
    }
    for (let index = 0; index < rows.length; index++) { tick(); array[index] = rows[index]; }
    for (let index = rows.length; index < length; index++) { tick(); delete array[index]; }
    checkData(target, tick); return target;
  }
  const reverse = ["reduceRight", "findLast", "findLastIndex"].includes(method), step = reverse ? -1 : 1;
  let index = reverse ? length - 1 : 0;
  const inside = () => index >= 0 && index < length;
  let accumulator: RuntimeValue = args[1] === undefined ? undefinedValue() : args[1];
  if (reducing && args.length < 2) {
    while (inside() && !Object.prototype.hasOwnProperty.call(array, index)) { tick(); index += step; }
    if (!inside()) throw new Error(method + " su un array vuoto richiede un valore iniziale.");
    accumulator = array[index]; index += step;
  }
  const mapped: RuntimeValue[] = method === "map" ? new Array(length) : [];
  const visitsHoles = ["find", "findIndex", "findLast", "findLastIndex"].includes(method);
  const append = (value: RuntimeValue) => { if (mapped.length >= 1024) throw new Error("Il risultato di " + method + " supera 1024 elementi."); checkData(value, tick); mapped.push(value); };
  for (; inside(); index += step) {
    tick();
    const present = Object.prototype.hasOwnProperty.call(array, index);
    if (!present && !visitsHoles) continue;
    const value = present ? array[index] : undefinedValue();
    const result = yield* call(reducing ? [accumulator, value, index, target] : [value, index, target]);
    if (reducing) { accumulator = result; continue; }
    if (method === "map") { checkData(result, tick); mapped[index] = result; }
    else if (method === "flatMap") {
      if (isDataReference(result) && Array.isArray(result.data)) { for (const key of Object.keys(result.data)) append(result.data[Number(key)]); } else append(result);
    } else if (method === "filter") { if (truthy(result, true)) append(value); }
    else if (method === "some" && truthy(result, true)) return true;
    else if (method === "every" && !truthy(result, true)) return false;
    else if (visitsHoles && truthy(result, true)) return method === "find" || method === "findLast" ? value : index;
  }
  if (reducing) { checkData(accumulator, tick); return accumulator; }
  if (method === "forEach" || method === "find" || method === "findLast") return undefinedValue();
  if (method === "some") return false;
  if (method === "every") return true;
  if (method === "findIndex" || method === "findLastIndex") return -1;
  const result: DataReference = { data: mapped }; checkData(result, tick); return result;
}

function* executeHmiScriptCoroutine(program: HmiScriptProgram, input: Readonly<Record<string, string>>, options: HmiScriptExecutionOptions = {}): ScriptCoroutine<HmiScriptExecution> {
  if (!program || ![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(program.version) || !Array.isArray(program.statements)) return { writes: {}, traces: [], navigation: [], operatorMessages: [], faceplateEvents: [], tagStatus: {}, steps: 0, error: "Versione dello script non supportata. Aggiorna il Runtime e ricompila lo script nell’editor; nessun comando eseguito." };
  const lexicalBlocks = program.version >= 2;
  let thisBinding: HmiScriptThisBinding = options.thisBinding ?? ("thisValue" in options ? { value: options.thisValue === undefined ? undefinedValue() : options.thisValue } : program.version >= 5 && !options.initializingScope && options.scriptContext !== "scheduler" && options.screenItems ? { screenItems: options.screenItems } : { value: undefinedValue() });
  const currentThis = (): RuntimeValue => thisBinding.value !== undefined ? thisBinding.value : (thisBinding.value = thisBinding.screenItems ? thisBinding.screenItems.resolve("screen") : undefinedValue());
  const referenceEquality = (left: RuntimeValue, right: RuntimeValue): boolean | undefined => {
    if (program.version < 5) return undefined;
    if (left && right && typeof left === "object" && typeof right === "object" && "screenItemId" in left && "screenItemId" in right) return left.screenItemId === right.screenItemId && left.screenPropertyPath === right.screenPropertyPath;
    if (isFunctionReference(left) && isFunctionReference(right) && left.scriptFunction.intrinsic && right.scriptFunction.intrinsic) return left.scriptFunction.intrinsic === right.scriptFunction.intrinsic && left.scriptFunction.errorType === right.scriptFunction.errorType;
    if (isDataReference(left) && isDataReference(right)) return left === right;
    return undefined;
  };
  const modern = program.version >= 4;
  const truth = (value: RuntimeValue) => truthy(value, modern);
  const values = { ...input };
  const parameterInput = options.parameterBindings;
  options = { ...options, parameterBindings: undefined };
  const parameterScope = parameterInput ? createHmiScriptScope(undefined, options.closureScope ?? options.globalScope) : undefined;
  const localScope = options.initializingScope ?? createHmiScriptScope(undefined, parameterScope ?? options.closureScope ?? options.globalScope);
  let lexicalScope = localScope, functionScope = localScope, locals = localScope.values;
  for (const [name, value] of Object.entries(options.locals ?? {})) locals.set(name, value);
  const ownerOf = (name: string): HmiScriptScope | undefined => {
    for (let scope: HmiScriptScope | undefined = lexicalScope; scope; scope = scope.parent) {
      if (!scope.active) throw new Error("Il contesto script non e' piu' attivo.");
      if (scope.values.has(name)) return scope;
    }
    return undefined;
  };
  const writes: Record<string, string> = {};
  const traces: string[] = [];
  const navigation: string[] = [];
  const operatorMessages: HmiScriptOperatorMessage[] = [];
  const faceplateEvents: HmiScriptFaceplateEvent[] = [];
  const reads: Record<string, string> = {};
  const commands: HmiScriptCommandResult[] = [];
  const clock = options.suspensionClock ?? { elapsed: 0 };
  options = { ...options, suspensionClock: clock };
  const suspendedAtStart = clock.elapsed;
  const started = Date.now();
  const elapsed = () => Date.now() - started - (clock.elapsed - suspendedAtStart);
  const maxSteps = options.maxSteps ?? 500;
  // La IR vieta loop/eval e limita le operazioni. Le attese del trasporto non consumano
  // il budget CPU; 500 ms consentono anche la creazione legittima di finestre DOM.
  const timeoutMs = options.timeoutMs ?? 500;
  const statusByTag: Record<string, RuntimeTagStatus> = {};
  const statusFor = (name: string): RuntimeTagStatus => {
    if (!statusByTag[name]) {
      const configured = options.tagStatus?.[name];
      statusByTag[name] = {
        qualityCode: configured?.qualityKnown === false ? 0 : configured?.qualityCode ?? (Object.prototype.hasOwnProperty.call(values, name) ? 192 : 0),
        timeStamp: configured?.timeStamp ?? 0,
        lastError: configured?.lastError ?? 0,
        errorDescription: configured?.errorDescription ?? "",
      };
    }
    return statusByTag[name];
  };
  const hmiFault = (code: number, message: string) => ({ __framecraftHmiFault: true as const, code, message });
  const faultCode = (caught: unknown): RuntimeValue => isScriptThrown(caught) ? caught.value : typeof caught === "object" && caught !== null && "__framecraftHmiFault" in caught
    ? Number((caught as unknown as { code: number }).code)
    : caught instanceof Error ? program.version >= 9 ? scriptErrorValue(isScriptErrorName(caught.name)?caught.name:"Error",[caught.message.slice(0,1000)],()=>{}):caught.message : String(caught);
  const faultMessage = (caught: unknown): string => {
    const message = isScriptThrown(caught) ? scriptThrownMessage(caught.value) : typeof caught === "object" && caught !== null && "__framecraftHmiFault" in caught
      ? String((caught as unknown as { message: string }).message)
      : caught instanceof Error ? caught.message : String(caught);
    return program.version >= 9 ? message.slice(0,1000) : message;
  };
  let steps = 0;
  const tick = () => {
    if (options.signal?.aborted || options.isActive && !options.isActive()) throw new Error("Il contesto script non e' piu' attivo; nessun nuovo comando viene inviato.");
    for (let scope: HmiScriptScope | undefined = lexicalScope; scope; scope = scope.parent) if (!scope.active) throw new Error("Il contesto script non e' piu' attivo.");
    steps += 1;
    if (steps > maxSteps) throw new Error(`Script interrotto dopo ${maxSteps} operazioni.`);
    if (elapsed() > timeoutMs) throw new Error(`Script interrotto dopo ${timeoutMs} ms.`);
  };
  const mergeNested = (nested: HmiScriptExecution) => {
    steps += nested.steps;
    Object.assign(values, nested.reads, nested.writes);
    Object.assign(reads, nested.reads);
    Object.assign(writes, nested.writes);
    Object.assign(statusByTag, nested.tagStatus);
    commands.push(...nested.commands ?? []);
    traces.push(...nested.traces);
    navigation.push(...nested.navigation);
    operatorMessages.push(...nested.operatorMessages);
    faceplateEvents.push(...nested.faceplateEvents);
  };
  const remote = (name: string) => Boolean(options.transport && !options.localTags?.has(name));
  function* readRemote(name: string, mode = 0, maxAge?: number): ScriptCoroutine<void> {
    tick();
    try {
      const sample = (yield { kind: "read", tag: name, mode, ...(maxAge !== undefined ? { maxAge } : {}) }) as { value: string; status: HmiScriptTagStatus };
      if (!sample || typeof sample.value !== "string" || !sample.status || typeof sample.status !== "object") throw new Error("Risposta lettura del trasporto non valida.");
      const status = sample.status;
      if (status.lastError) throw hmiFault(status.lastError, status.errorDescription ?? "Lettura del trasporto non riuscita.");
      if (status.qualityCode !== undefined && (!Number.isInteger(status.qualityCode) || status.qualityCode < 0 || status.qualityCode > 0xffffffff)
        || status.timeStamp !== undefined && typeof status.timeStamp !== "string" && !Number.isFinite(status.timeStamp)) throw new Error("Qualita' o timestamp del trasporto non validi.");
      values[name] = sample.value; reads[name] = sample.value;
      Object.assign(statusFor(name), { qualityCode: status.qualityKnown === false ? 0 : status.qualityCode ?? 0, qualityKnown: status.qualityKnown ?? status.qualityCode !== undefined,
        timeStamp: status.timeStamp ?? 0, lastError: 0, errorDescription: "" });
    } catch (caught) {
      Object.assign(statusFor(name), { lastError: 0x80040002, errorDescription: faultMessage(caught), qualityCode: 0, timeStamp: 0 });
      throw caught;
    }
  }
  function* writeRemote(request: Extract<HmiScriptTransportRequest, { kind: "write" }>): ScriptCoroutine<HmiScriptCommandResult> {
    tick();
    let receipt: HmiScriptCommandResult;
    try {
      if (request.mode === 1) throw Object.assign(new Error("hmiWriteWait richiede una conferma PLC che questo trasporto non supporta; nessun comando inviato."), { outcome: "rejected" });
      const response = (yield request) as HmiScriptCommandResult;
      if (!response || response.tag !== request.tag || response.plcConfirmed !== false || !["delivered", "rejected", "uncertain"].includes(response.outcome)
        || response.outcome === "delivered" && !["broker-ack", "transport", "opcua-service"].includes(response.delivery ?? "")) throw new Error("Ricevuta del trasporto non valida.");
      receipt = { ...response };
    } catch (caught) {
      receipt = { tag: request.tag, outcome: caught && typeof caught === "object" && "outcome" in caught && caught.outcome === "rejected" ? "rejected" : "uncertain", plcConfirmed: false, error: faultMessage(caught) };
    }
    commands.push(receipt);
    const status = statusFor(request.tag);
    status.lastError = receipt.outcome === "delivered" ? 0 : receipt.outcome === "uncertain" ? 0x80040003 : 0x80040002;
    status.errorDescription = receipt.error ?? (receipt.outcome === "delivered" ? "" : "Comando " + receipt.outcome + ".");
    return receipt;
  }
  const tagName = (value: RuntimeValue) => {
    if (isTagReference(value)) return value.tag;
    if (typeof value === "string" && value.trim()) return value.trim();
    throw new Error("Il nome del tag non e' valido.");
  };
  const initializeScope = function* (scope: HmiScriptScope): ScriptCoroutine<void> {
    if (!scope.active) throw new Error("Il contesto script non e' piu' attivo.");
    if (scope.status === "failed") throw new Error(scope.error ?? "Definizione globale non inizializzata.");
    if (scope.status === "initializing") throw new Error("Inizializzazione ricorsiva del contesto script.");
    if (scope.status === "new" && scope.initializer) {
      scope.status = "initializing";
      const initialized = (yield* executeHmiScriptCoroutine(scope.initializer, values, { ...options, locals: undefined, globalScope: undefined, closureScope: undefined, initializingScope: scope, thisBinding: { value: undefinedValue() }, maxSteps: Math.max(1, maxSteps - steps), timeoutMs: Math.max(1, timeoutMs - elapsed()) }));
      mergeNested(initialized);
      if (initialized.error) { scope.status = "failed"; scope.error = initialized.error; throw new Error(initialized.error); }
      scope.status = "ready";
    }
  };
  const arrayValues = function* (items: HmiScriptExpression[], holes = true): ScriptCoroutine<RuntimeValue[]> {
    const values: RuntimeValue[] = [];
    const append = (value: RuntimeValue) => { tick(); if (values.length >= 1024) throw new Error("Lo spread supera il limite di 1024 elementi o argomenti."); values.push(value); };
    for (const item of items) {
      if (item.kind === "spread") {
        if (program.version < 6) throw new Error("Lo spread richiede IR 6: aggiorna il Runtime e ricompila lo script.");
        const source = yield* evaluate(item.value);
        if (typeof source === "string") { for (const value of source) append(value); }
        else if (isDataReference(source) && Array.isArray(source.data)) { const length = source.data.length; for (let i = 0; i < length; i++) append(dataGet(source, String(i), true)); }
        else throw new Error("Lo spread di elementi o argomenti richiede un array o una stringa.");
      } else if (item.kind === "array-hole" && holes) {
        if (!modern) throw new Error("Un array sparso richiede IR 4."); tick(); if (values.length >= 1024) throw new Error("Un array supera 1024 elementi."); values.length++;
      } else append(yield* evaluate(item));
    }
    return values;
  };
  const objectValues = function* (entries: Extract<HmiScriptExpression, { kind: "object" }>["entries"]): ScriptCoroutine<DataReference> {
    const data: Record<string, RuntimeValue> = Object.create(null);
    const put = (key: string, value: RuntimeValue) => { tick(); data[dataKey(key)] = value; if (Object.keys(data).length > 1024) throw new Error("Un oggetto supera 1024 proprietà."); };
    for (const entry of entries) {
      const source = yield* evaluate(entry.value);
      if (!entry.spread) { put(entry.name, source); continue; }
      if (program.version < 6) throw new Error("Lo spread richiede IR 6: aggiorna il Runtime e ricompila lo script.");
      if (source === null || isUndefinedReference(source) || typeof source === "number" || typeof source === "boolean" || isFunctionReference(source)) continue;
      if (typeof source === "string") { for (let i = 0; i < source.length; i++) put(String(i), source[i]); }
      else if (isDataReference(source)) { for (const key of Object.keys(source.data)) put(key, source.data[key as keyof typeof source.data] as RuntimeValue); }
      else throw new Error("Lo spread di proprietà richiede dati semplici: oggetti, array o stringhe. Gli oggetti delle API HMI non sono copiabili.");
    }
    return { data };
  };
  const intrinsics = new Map<FunctionIntrinsic, FunctionReference>();
  const intrinsicFunction = (intrinsic: FunctionIntrinsic): FunctionReference => {
    let fn = intrinsics.get(intrinsic);
    if (!fn) { fn = { scriptFunction: { intrinsic, name: intrinsic === "screen-items" ? "Items" : intrinsic === "error-to-string" ? "toString" : intrinsic, parameters: intrinsic === "apply" ? ["thisArg", "arguments"] : intrinsic === "error-to-string" ? [] : ["thisArg"], program: { version: 9, statements: [] } } }; intrinsics.set(intrinsic, fn); }
    return fn;
  };
  type ScreenCollection=NonNullable<FunctionReference["scriptFunction"]["screenCollection"]>;
  const collections=new Map<string,FunctionReference>();
  const assertCollectionRoot=(collection:ScreenCollection)=>{
    if(collection.manager.resolve(collection.scope).screenItemId!==collection.root.screenItemId)throw new Error("La collezione Items non appartiene più al contesto originale: acquisisci un nuovo riferimento.");
  };
  const collectionMembers=(collection:ScreenCollection)=>{
    assertCollectionRoot(collection);
    const list=collection.manager.items?.(collection.scope);
    if(!list)throw new Error("La collezione Items richiede i componenti Runtime aggiornati del pannello.");
    return list;
  };
  const collectionItem=(collection:ScreenCollection,name:RuntimeValue):HmiScriptScreenItemReference=>{
    assertCollectionRoot(collection);
    const value=scalar(name);
    if(typeof value==="string"&&value.trim()&&value.length<=128)return collection.manager.resolve(collection.scope,value);
    if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0)throw new Error("Items richiede un nome fino a 128 caratteri o un indice intero non negativo.");
    const item=collectionMembers(collection)[value];if(!item)throw new Error("Indice Items fuori intervallo: "+value+".");return item;
  };
  const collectionFunction=(scope:"screen"|"faceplate"):FunctionReference=>{
    if(!options.screenItems)throw new Error("Il contesto corrente non dispone degli oggetti HMI della schermata.");
    let fn=collections.get(scope);if(!fn){fn={scriptFunction:{intrinsic:"screen-items",name:"Items",parameters:[],program:{version:9,statements:[]},screenCollection:{scope,manager:options.screenItems,root:options.screenItems.resolve(scope)}}};collections.set(scope,fn);}return fn;
  };
  let boxMethod:FunctionReference|undefined;
  const errorConstructors = new Map<string,FunctionReference>();
  const errorConstructor = (name:string): FunctionReference => { let value=errorConstructors.get(name);if(!value){value={scriptFunction:{intrinsic:"error-constructor",errorType:name,name,parameters:name==="AggregateError"?["errors","message"]:["message"],program:{version:9,statements:[]}}};errorConstructors.set(name,value);}return value; };
  const processValueDefinition=(reference:HmiScriptScreenItemReference,writing=false)=>{
    if(!options.screenItems?.processValue)throw new Error('ProcessValue richiede i componenti Runtime aggiornati del pannello.');
    const definition=options.screenItems.processValue(reference,{values,tagStatus:{...options.tagStatus,...statusByTag},localTags:options.localTags,requireQuality:Boolean(options.transport)},writing);
    if(!definition||typeof definition.dataType!=='string'||!['read','write','read-write'].includes(definition.access)||definition.tag!==undefined&&(typeof definition.tag!=='string'||!definition.tag.trim()||definition.tag.length>200))throw new Error('Il collegamento ProcessValue restituito dal contesto non è valido.');
    if(definition.local&&(!definition.tag||!options.localTags?.has(definition.tag)))throw new Error('Il contesto locale di ProcessValue non è più disponibile.');
    if(!(writing?['write','read-write']:['read','read-write']).includes(definition.access))throw new Error(writing?'ProcessValue è di sola lettura.':'ProcessValue è di sola scrittura.');
    return definition;
  };
  const readMember = (object: RuntimeValue, key: string): RuntimeValue => {
    if (program.version >= 9 && isDataReference(object) && object.errorType && key === "toString" && !Object.prototype.hasOwnProperty.call(object.data,key)) return intrinsicFunction("error-to-string");
    if (program.version >= 5 && isFunctionReference(object)) {
      if (key === "length") return object.scriptFunction.functionLength ?? object.scriptFunction.parameters.length;
      if (key === "name") return object.scriptFunction.name ?? "";
      if (["call", "apply", "bind"].includes(key)) return intrinsicFunction(key as FunctionIntrinsic);
    }
    if (isFunctionReference(object) && object.scriptFunction.screenCollection) {
      const collection=object.scriptFunction.screenCollection,items=collectionMembers(collection);
      if (key === "Count") return items.length;
      if (/^(?:0|[1-9][0-9]*)$/.test(key)) return collectionItem(collection,Number(key));
      throw new Error("La collezione Items non espone la proprieta' "+key+".");
    }
    if (program.version >= 5 && key === "Items" && object && typeof object === "object" && "screenItemId" in object && !object.screenPropertyPath && options.screenItems) {
      if(object.screenItemId===options.screenItems.resolve("screen").screenItemId)return collectionFunction("screen");
      let faceplate:HmiScriptScreenItemReference|undefined;try{faceplate=options.screenItems.resolve("faceplate");}catch{ /* No faceplate in this graphical context. */ }
      if(faceplate?.screenItemId===object.screenItemId)return collectionFunction("faceplate");
    }

      if (isDataReference(object)) return dataGet(object, key, modern);
      if (object && typeof object === "object" && "screenItemId" in object) {
        if (!options.screenItems) throw new Error("Il contesto corrente non dispone degli oggetti HMI della schermata.");
        if(program.version>=5&&!object.screenPropertyPath&&key==="GetBoundingBoxInScreenCoordinates"){
          return boxMethod??={scriptFunction:{intrinsic:"screen-box",name:key,parameters:[],program:{version:9,statements:[]},screenBox:{manager:options.screenItems}}};
        }
        if(!object.screenPropertyPath&&key==='CurrentQuality'){
          if(!options.screenItems.currentQuality)throw new Error('CurrentQuality richiede i componenti Runtime aggiornati del pannello.');
          const quality=options.screenItems.currentQuality(object,{values,tagStatus:options.tagStatus,requireQuality:Boolean(options.transport),localTags:options.localTags,functions:options.functions,variables:options.variables});
          if(!Number.isInteger(quality)||quality<0||quality>199||(quality&~199)!==0||![0,1,2,4].includes(quality&7))throw new Error('Il contesto CurrentQuality ha restituito un codice non valido.');
          return quality;
        }
        if(!object.screenPropertyPath&&key==='ProcessValue'){
          const definition=processValueDefinition(object),tag=definition.tag;
          if(tag){
            const status=statusByTag[tag]??options.tagStatus?.[tag],requireQuality=Boolean(options.transport&&!definition.local);
            if(!definition.local&&(status?.lastError||status?.qualityKnown===false||requireQuality&&(!status||status.localValue||status.qualityCode===undefined)||status?.qualityCode!==undefined&&(!Number.isInteger(status.qualityCode)||status.qualityCode<0||status.qualityCode>65535||![128,192].includes(status.qualityCode&0xc0))))throw new Error('ProcessValue: il tag '+tag+' non ha un campione valido. Controlla collegamento, qualità e stato PLC.');
            if(!Object.hasOwn(values,tag))throw new Error('ProcessValue: il tag '+tag+' non ha ancora un valore acquisito o di prova.');
            return normalizeHmiProcessValue(values[tag],definition);
          }
          return normalizeHmiProcessValue(definition.value,definition);
        }
        return options.screenItems.get(object, key);
      }
      if (typeof object === "string") {
        if (key === "length") return object.length;
        if (/^(?:0|[1-9][0-9]*)$/.test(key)) return object[Number(key)] ?? null;
      }
      if (isPopupReference(object) && ["Left", "Top", "Width", "Height", "Visible", "WindowFlags"].includes(key)) {
        if (!options.popupManager) throw new Error("Il contesto corrente non dispone di un gestore popup faceplate.");
        return options.popupManager.get(object, key as HmiScriptPopupProperty);
      }
      if (isTagSetReference(object) && key === "Count") return object.tagSet.names.length;
      if (isTagSetReference(object) && key === "LastError") return object.tagSet.lastError;
      if (isTagSetReference(object) && key === "ErrorDescription") return object.tagSet.errorDescription;
      if (isTagReference(object)) {
        if (key === "Value") {
          if (object.tagSet && Object.prototype.hasOwnProperty.call(object.tagSet.pending, object.tag)) return object.tagSet.pending[object.tag];
          if (!Object.prototype.hasOwnProperty.call(values, object.tag) || values[object.tag].trim() === "") throw new Error("Il tag " + object.tag + " non ha un valore di prova.");
          return normal(values[object.tag]);
        }
        const status = object.tagSet?.status[object.tag] ?? statusFor(object.tag);
        if (key === "QualityCode") return status.qualityCode;
        if (key === "TimeStamp") return status.timeStamp;
        if (key === "LastError") return status.lastError;
        if (key === "ErrorDescription") return status.errorDescription;
      }
      throw new Error("Il valore non espone la proprieta' " + key + " nella sandbox.");
  };
  function* errorPrimitive(value: RuntimeValue, hint: "string"|"default" = "default"): ScriptCoroutine<RuntimeValue> {
    if(!isDataReference(value)||!value.errorType)return value;
    for(const key of hint==="string"?["toString","valueOf"]:["valueOf","toString"]){
      tick();const method=readMember(value,key);
      if(!isFunctionReference(method))continue;
      const result=yield* invokeFunction(method,[],value);
      if(isUndefinedReference(result)||result===null||typeof result!=="object")return result;
    }
    throw new TypeError("L’errore non può essere convertito in un valore primitivo.");
  }
  function* createError(name:string,args:RuntimeValue[]): ScriptCoroutine<DataReference> {
    const position=name==="AggregateError"?1:0;
    const values=[...args];if(values[position]!==undefined)values[position]=yield* errorPrimitive(values[position],"string");
    return scriptErrorValue(name,values,tick);
  }
  const evaluate = function* (expression: HmiScriptExpression): ScriptCoroutine<RuntimeValue> {
    tick();
    if (expression.kind === "literal") return expression.value;
    if (expression.kind === "construct") {
      if(program.version<9)throw new Error("I costruttori Error richiedono IR 9: aggiorna il Runtime e ricompila lo script.");
      const target=yield* evaluate(expression.callee),args=yield* arrayValues(expression.arguments,false);
      if(!isFunctionReference(target))throw new TypeError("Il valore non è un costruttore Error.");
      let fn=target.scriptFunction,prefix:RuntimeValue[]=[];
      while(fn.bound){prefix=[...fn.bound.args,...prefix];fn=fn.bound.target.scriptFunction;}
      if(fn.intrinsic!=="error-constructor"||!fn.errorType)throw new TypeError("new è disponibile soltanto per i costruttori Error nella sandbox.");
      return yield* createError(fn.errorType,[...prefix,...args]);
    }
    if (expression.kind === "spread") throw new Error("Lo spread è ammesso solo in array e liste di argomenti.");
    if (expression.kind === "pattern-assign") {
      if (program.version < 8) throw new Error("Le espressioni di assegnazione richiedono IR 8: aggiorna il Runtime e ricompila lo script.");
      let assigned: RuntimeValue = undefinedValue();
      yield* assignPattern(expression.pattern, function* () { assigned = yield* evaluate(expression.value);return assigned; });
      return assigned;
    }
    if (expression.kind === "this") { if (program.version < 5) throw new Error("this richiede IR 5: aggiorna il Runtime e ricompila lo script."); return currentThis(); }
    if (expression.kind === "undefined") { if (!modern) throw new Error("undefined richiede IR 4: ricompila lo script."); return undefinedValue(); }
    if (expression.kind === "array-hole") throw new Error("Una posizione array vuota e' ammessa solo in un array IR 4.");
    if (expression.kind === "local") {
      const owner = ownerOf(expression.name);
      if (!owner && ["Screen", "Faceplate", "item"].includes(expression.name)) {
        if (!options.screenItems) throw new Error("Il contesto corrente non dispone degli oggetti HMI della schermata.");
        return options.screenItems.resolve(expression.name === "Screen" ? "screen" : expression.name === "Faceplate" ? "faceplate" : "item");
      }
      if(!owner && program.version>=9 && isScriptErrorName(expression.name))return errorConstructor(expression.name);
      if (!owner) throw new ReferenceError(`Variabile locale ${expression.name} non definita.`);
      if (owner.uninitialized?.has(expression.name)) throw new ReferenceError(`La variabile ${expression.name} non e' ancora inizializzata: sposta la dichiarazione prima dell'uso.`);
      if (owner.unassigned?.has(expression.name)) { const message = `La variabile ${expression.name} non ha ancora un valore: assegnalo prima di leggerla o inviarla al PLC.`; if (modern) return undefinedValue(message); throw new Error(message); }
      return owner.values.get(expression.name)!;
    }
    if (expression.kind === "function-value") {
      if (program.version < 3) throw new Error("Le funzioni valore richiedono IR 3: ricompila lo script.");
      return makeFunction(expression);
    }
    if (expression.kind === "invoke") {
      if (program.version < 3) throw new Error("Le chiamate a funzioni valore richiedono IR 3: ricompila lo script.");
      let receiver: RuntimeValue = undefinedValue();
      let target: RuntimeValue;
      if (program.version >= 5 && expression.callee.kind === "member") {
        receiver = yield* evaluate(expression.callee.object);
        target = readMember(receiver, dataKey(yield* evaluate(expression.callee.key)));
      } else target = yield* evaluate(expression.callee);
      const args = (yield* arrayValues(expression.arguments, false));
      if (isTagSetReference(target) && args.length === 1) {
        const name = tagName(args[0]);
        if (!target.tagSet.names.includes(name)) throw new Error("Il tag " + name + " non appartiene al TagSet.");
        return { tag: name, tagSet: target.tagSet };
      }
      if (!isFunctionReference(target)) throw new Error("Il valore selezionato non e' una funzione HMI.");
      return (yield* invokeFunction(target, args, receiver));
    }
    if (expression.kind === "module-variable") {
      const definition = options.functions?.[expression.name];
      if (definition) return { scriptFunction: { parameters: definition.parameters, program: definition.program, scope: definition.globalScope, globalScope: definition.globalScope, functions: options.functions, variables: options.variables, name: expression.name } };
      const binding = options.variables?.[expression.name];
      if (!binding?.globalScope || !binding.definition.exports?.some((entry) => entry.local === binding.name && expression.name.endsWith(`.${entry.name}`))) throw new Error(`Variabile pubblica HMI ${expression.name} non esportata o modulo non disponibile.`);
      (yield* initializeScope(binding.globalScope));
      if (!binding.globalScope.values.has(binding.name)) throw new Error(`Variabile pubblica HMI ${expression.name} non inizializzata.`);
      if (binding.globalScope.uninitialized?.has(binding.name)) throw new Error(`La variabile pubblica ${expression.name} non ha ancora un valore: inizializzala nel modulo proprietario.`);
      if (binding.globalScope.unassigned?.has(binding.name)) { const message = `La variabile pubblica ${expression.name} non ha ancora un valore: inizializzala nel modulo proprietario.`; if (modern) return undefinedValue(message); throw new Error(message); }
      return binding.globalScope.values.get(binding.name)!;
    }
    if (expression.kind === "array" || expression.kind === "object") {
      if ((expression.kind === "array" ? expression.items.length : expression.entries.length) > 1024) throw new Error("Una raccolta dati supera il limite di 1024 elementi.");
      const result: DataReference = expression.kind === "array"
        ? { data: (yield* arrayValues(expression.items)) }
        : (yield* objectValues(expression.entries));
      checkData(result, tick);
      return result;
    }
    if (expression.kind === "array-method") {
      const callback = ["map", "flatMap", "filter", "forEach", "find", "findIndex", "findLast", "findLastIndex", "some", "every", "reduce", "reduceRight"].includes(expression.method);
      if (!modern && (callback || expression.method === "sort" && expression.arguments.length)) throw new Error("Le callback Array richiedono IR 4: aggiorna il Runtime e ricompila lo script.");
      const target = yield* evaluate(expression.object), args = yield* arrayValues(expression.arguments, false);
      if (program.version >= 5 && isDataReference(target) && !Array.isArray(target.data)) {
        const method = readMember(target, expression.method);
        if (!isFunctionReference(method)) throw new Error("Il membro " + expression.method + " non e' una funzione.");
        return yield* invokeFunction(method, args, target);
      }
      if (callback || expression.method === "sort" && modern) return yield* dataArrayCallbackMethod(target, expression.method, args, tick, invokeFunction, program.version >= 5);
      return dataArrayMethod(target, expression.method, args, tick, modern);
    }
    if (expression.kind === "screen-item") {
      if (!options.screenItems) throw new Error("Il contesto corrente non dispone degli oggetti HMI della schermata.");
      const name=yield* evaluate(expression.name);
      return collectionItem({scope:expression.scope,manager:options.screenItems,root:options.screenItems.resolve(expression.scope)},name);
    }
    if (expression.kind === "property-flashing") {
      if (!options.screenItems) throw new Error("Il contesto corrente non dispone degli oggetti HMI della schermata.");
      const target = (yield* evaluate(expression.item));
      if (!target || typeof target !== "object" || !("screenItemId" in target)) throw new Error("PropertyFlashing richiede un oggetto Screen/Faceplate, non dati o tag.");
      return options.screenItems.propertyFlashing(target, (yield* mapScriptValues(expression.arguments, function* (argument) { return scalar((yield* evaluate(argument))); })));
    }
    if (expression.kind === "data-call") {
      const arguments_ = yield* arrayValues(expression.arguments, false);
      if (arguments_.length !== 1) throw new Error(expression.name + " richiede un argomento di dati.");
      const argument = arguments_[0];
      if (expression.name === "JSON.parse") {
        const text = String(scalar(argument) ?? "null");
        if (text.length > 20000) throw new Error("Il JSON supera 20000 caratteri.");
        return dataFromJson(JSON.parse(text), tick);
      }
      if (expression.name === "JSON.stringify") return dataJson(argument, tick);
      let entries:[string,RuntimeValue][];
      if(isFunctionReference(argument)&&argument.scriptFunction.screenCollection){
        const items=collectionMembers(argument.scriptFunction.screenCollection);
        if(items.length>1024)throw new Error("L'enumerazione Items supera il limite di 1024 elementi.");
        entries=items.map((item,index)=>{tick();return[String(index),item];});
      }else{
        if (!isDataReference(argument)) throw new Error(expression.name + " richiede un oggetto o un array di dati.");
        entries=Object.entries(argument.data);
      }
      return { data: expression.name === "Object.keys" ? entries.map(([key]) => key)
        : expression.name === "Object.values" ? entries.map(([, value]) => value)
          : entries.map(([key, value]) => ({ data: [key, value] })) };
    }
    if (expression.kind === "member") {
      const object=yield* evaluate(expression.object),key=dataKey(yield* evaluate(expression.key));
      if(key==='ProcessValue'&&object&&typeof object==='object'&&'screenItemId' in object&&!object.screenPropertyPath){
        const definition=processValueDefinition(object);if(definition.tag&&remote(definition.tag))yield* readRemote(definition.tag);
      }
      return readMember(object,key);
    }
    if (expression.kind === "tag-ref") return { tag: expression.name };
    if (expression.kind === "tag-set") {
      const pending: Record<string, HmiScriptScalar> = {};
      for (const entry of expression.entries) if (entry.value) pending[entry.name] = scalar((yield* evaluate(entry.value)));
      const names = expression.entries.map((entry) => entry.name);
      return { tagSet: { names, pending, status: Object.fromEntries(names.map((name) => [name, statusFor(name)])), lastError: 0, errorDescription: "" } };
    }
    if (expression.kind === "tag-set-item") {
      const set = (yield* evaluate(expression.set));
      if (!isTagSetReference(set)) throw new Error("La variabile non contiene un TagSet.");
      const name = tagName((yield* evaluate(expression.tag)));
      if (!set.tagSet.names.includes(name)) throw new Error(`Il tag ${name} non appartiene al TagSet.`);
      return { tag: name, tagSet: set.tagSet };
    }
    if (expression.kind === "tag-read") {
      const reference = (yield* evaluate(expression.tag));
      const name = tagName(reference);
      if (remote(name)) {
        yield* readRemote(name);
        if (isTagReference(reference) && reference.tagSet) delete reference.tagSet.pending[name];
        return normal(values[name]);
      }
      if (isTagReference(reference) && reference.tagSet && Object.prototype.hasOwnProperty.call(reference.tagSet.pending, name)) return reference.tagSet.pending[name];
      if (!Object.prototype.hasOwnProperty.call(values, name) || values[name].trim() === "") throw new Error(`Il tag ${name} non ha un valore di prova.`);
      return normal(values[name]);
    }
    if (expression.kind === "runtime-property") {
      const object = (yield* evaluate(expression.object));
      if (isTagSetReference(object)) {
        if (expression.property === "Count") return object.tagSet.names.length;
        if (expression.property === "LastError") return object.tagSet.lastError;
        if (expression.property === "ErrorDescription") return object.tagSet.errorDescription;
        throw new Error(`${expression.property} appartiene ai tag del TagSet, non al TagSet.`);
      }
      if (isTagReference(object)) {
        const status = object.tagSet?.status[object.tag] ?? statusFor(object.tag);
        if (expression.property === "QualityCode") return status.qualityCode;
        if (expression.property === "TimeStamp") return status.timeStamp;
        if (expression.property === "LastError") return status.lastError;
        if (expression.property === "ErrorDescription") return status.errorDescription;
        throw new Error("Count appartiene al TagSet, non a un singolo tag.");
      }
      throw new Error(`${expression.property} richiede un tag o un TagSet.`);
    }
    if (expression.kind === "unary") {
      if (modern && expression.operator === "typeof" && expression.value.kind === "local" && !ownerOf(expression.value.name) && !["Screen", "Faceplate", "item"].includes(expression.value.name) && !(program.version>=9 && isScriptErrorName(expression.value.name))) return "undefined";
      const value = (yield* evaluate(expression.value));
      if (expression.operator === "typeof" && isUndefinedReference(value)) return "undefined";
      if (expression.operator === "typeof" && isFunctionReference(value)) return "function";
      if (expression.operator === "typeof" && typeof value === "object") return "object";
      if (expression.operator === "!") return !truth(value);
      if (expression.operator === "+") return number(value);
      if (expression.operator === "-") return -number(value);
      if (expression.operator === "~") return ~number(value);
      return typeof scalar(value);
    }
    if (expression.kind === "conditional") return (yield* evaluate(truth((yield* evaluate(expression.test))) ? expression.consequent : expression.alternate));
    if (expression.kind === "call") {
      const args = (yield* arrayValues(expression.arguments, false));
      const first = args[0];
      if (expression.name === "Boolean") return truth(modern && !args.length ? undefinedValue() : first);
      if (expression.name === "Number") return modern && !args.length ? 0 : number(first);
      if (expression.name === "String" && modern && !args.length) return "";
      if (expression.name === "String") { const value=yield* errorPrimitive(first,"string");return isUndefinedReference(value) ? "undefined" : isDataReference(value) ? dataString(value,tick) : String(scalar(value)); }
      if (expression.name === "HMIRuntime.Math.RGB") {
        if (args.length !== 3 || args.some((argument) => typeof argument !== "number" || !Number.isInteger(argument) || argument < 0 || argument > 255)) throw new Error("HMIRuntime.Math.RGB richiede tre interi da 0 a 255.");
        return (0xff000000 | (number(args[0]) << 16) | (number(args[1]) << 8) | number(args[2])) >>> 0;
      }
      if (expression.name === "Math.abs") return Math.abs(number(first));
      if (expression.name === "Math.round") return Math.round(number(first));
      if (expression.name === "Math.floor") return Math.floor(number(first));
      if (expression.name === "Math.ceil") return Math.ceil(number(first));
      const numbers = args.map(number);
      return expression.name === "Math.min" ? Math.min(...numbers) : Math.max(...numbers);
    }
    if (expression.kind === "module-call") {
      const definition = options.functions?.[expression.name];
      if (!definition) {
        if (options.variables?.[expression.name]) {
          const target = (yield* evaluate({ kind: "module-variable", name: expression.name }));
          if (!isFunctionReference(target)) throw new Error("La variabile pubblica " + expression.name + " non e' una funzione HMI.");
          return (yield* invokeFunction(target, (yield* arrayValues(expression.arguments, false))));
        }
        throw new Error("Funzione HMI " + expression.name + " non definita o non importata nel contesto corrente.");
      }
      if (definition.program.version < 5 && definition.parameters.length !== expression.arguments.length) {
        throw new Error(`${expression.name} richiede ${definition.parameters.length} argomenti, ricevuti ${expression.arguments.length}.`);
      }
      const stack = options.callStack ?? [];
      if (stack.includes(expression.name)) throw new Error(`Chiamata ricorsiva non ammessa: ${[...stack, expression.name].join(" -> ")}.`);
      if (stack.length >= 16) throw new Error("Troppi livelli di chiamata fra funzioni HMI.");
      const args = (yield* arrayValues(expression.arguments, false));
      const nested = (yield* executeHmiScriptCoroutine(definition.program, values, {
        ...options,
        maxSteps: Math.max(1, maxSteps - steps),
        timeoutMs: Math.max(1, timeoutMs - elapsed()),
        locals: Object.fromEntries(definition.parameters.map((parameter, index) => [parameter, args[index] === undefined ? definition.program.version >= 5 ? undefinedValue() : null : args[index]])),
        thisBinding: { value: undefinedValue() },
        globalScope: definition.globalScope,
        closureScope: undefined,
        initializingScope: undefined,
        tagStatus: { ...options.tagStatus, ...statusByTag },
        callStack: [...stack, expression.name],
        returnByReference: true,
      }));
      mergeNested(nested);
      if ("thrownReference" in nested) {
      if(program.version<9&&nested.thrownFromHost)throw new Error(nested.error??"Errore del modulo HMI.");
      throw {__framecraftScriptThrown:true,value:nested.thrownReference,...(nested.thrownFromHost?{fromHost:true}:{})};
    }
      if (nested.error) throw new Error(`${expression.name}: ${nested.error}`);
      return "returnedReference" in nested ? nested.returnedReference! : "returned" in nested ? nested.returned! : definition.program.version >= 4 ? undefinedValue() : null;
    }
    if (expression.kind === "popup-open") {
      if (!options.popupManager) throw new Error("Il contesto corrente non dispone di un gestore popup faceplate.");
      const faceplateType = String(scalar((yield* evaluate(expression.faceplateType))) ?? "").trim();
      const title = String(scalar((yield* evaluate(expression.title))) ?? "");
      if (!faceplateType) throw new Error("Il tipo faceplate del popup non puo' essere vuoto.");
      const coordinate = function* (value: HmiScriptExpression | undefined, fallback: number, label: string, unsigned = false): ScriptCoroutine<number> {
        if (!value) return fallback;
        const parsed = number((yield* evaluate(value)));
        if (!Number.isInteger(parsed) || (unsigned && parsed < 0) || parsed < -2147483648 || parsed > 4294967295) throw new Error(`${label} del popup non e' valido.`);
        return parsed;
      };
      const interfaceValues = Object.fromEntries((yield* mapScriptValues(expression.interfaceValues, function* (item) { return item.kind === "tag" ? [item.name, { Tag: item.tag }] : [item.name, scalar((yield* evaluate(item.value)))]; })));
      const popupWindowName = expression.popupWindowName ? String(scalar((yield* evaluate(expression.popupWindowName))) ?? "").trim() || undefined : undefined;
      return options.popupManager.open({
        scope: expression.scope, faceplateType, title, interfaceValues,
        parentBound: expression.scope === "faceplate" ? !truth(expression.independentWindow ? (yield* evaluate(expression.independentWindow)) : false) : expression.parentBound,
        invisible: expression.invisible ? truth((yield* evaluate(expression.invisible))) : false,
        ...(popupWindowName ? { popupWindowName } : {}),
        adaptWindow: expression.adaptWindow ? truth((yield* evaluate(expression.adaptWindow))) : true,
        left: (yield* coordinate(expression.left, 10, "Left")), top: (yield* coordinate(expression.top, 10, "Top")),
        width: (yield* coordinate(expression.width, 100, "Width", true)), height: (yield* coordinate(expression.height, 100, "Height", true)),
      });
    }
    if (expression.kind === "popup-property") {
      if (!options.popupManager) throw new Error("Il contesto corrente non dispone di un gestore popup faceplate.");
      const popup = (yield* evaluate(expression.popup));
      if (!isPopupReference(popup)) throw new Error(`${expression.property} richiede una finestra popup faceplate.`);
      return options.popupManager.get(popup, expression.property);
    }
    if (expression.kind === "timer-set") {
      if (expression.callback.kind === "value" && program.version < 3) throw new Error("I timer con funzioni valore richiedono IR 3.");
      const callbackTarget = expression.callback.kind === "value" ? (yield* evaluate(expression.callback.value)) : undefined;
      const delay = number((yield* evaluate(expression.delay)));
      if (!Number.isInteger(delay) || delay < 0 || delay > 0xffffffff) throw new Error("Il ritardo del timer deve essere un UInt32 in millisecondi.");
      if (!options.timerManager) throw new Error("Il contesto corrente non dispone di un gestore timer.");
      let callback = expression.callback;
      let closureScope = callback.kind === "inline" ? lexicalScope : undefined;
      if (callback.kind === "value") {
        const target = callbackTarget;
        if (target === undefined || !isFunctionReference(target) || (target.scriptFunction.functionLength ?? target.scriptFunction.parameters.length)) throw new Error("La callback del timer deve essere una funzione HMI senza parametri obbligatori.");
        closureScope = createHmiScriptScope(undefined, lexicalScope);
        closureScope.values.set("__framecraftTimerCallback", target); closureScope.constants.add("__framecraftTimerCallback");
        callback = { kind: "inline", program: { version: 9, statements: [{ kind: "expression", value: { kind: "invoke", callee: { kind: "local", name: "__framecraftTimerCallback" }, arguments: [] } }] } };
      }
      return options.timerManager.set(expression.mode, callback, delay, { functions: options.functions, variables: options.variables, globalScope: options.globalScope, screenItems: options.screenItems, thisBinding, scriptContext: options.scriptContext, transport: options.transport, transportTimeoutMs: options.transportTimeoutMs, localTags: options.localTags, localTagValues: options.localTagValues, signal: options.signal, isActive: options.isActive, ...(closureScope ? { closureScope } : {}) });
    }
    let left = (yield* evaluate(expression.left));
    if (expression.operator === "&&" && !truth(left)) return modern ? left : false;
    if (expression.operator === "||" && truth(left)) return modern ? left : true;
    if (expression.operator === "??" && left !== null && !isUndefinedReference(left)) return left;
    let right = (yield* evaluate(expression.right));
    if(program.version>=9 && ["+","-","*","/","%","**","<","<=",">",">=","&","|","^","<<",">>",">>>"].includes(expression.operator)){left=yield* errorPrimitive(left);right=yield* errorPrimitive(right);}
    if(program.version>=9 && ["==","!="].includes(expression.operator)){if(isDataReference(left)&&left.errorType&&right!==null&&!isUndefinedReference(right)&&typeof right!=="object")left=yield* errorPrimitive(left);else if(isDataReference(right)&&right.errorType&&left!==null&&!isUndefinedReference(left)&&typeof left!=="object")right=yield* errorPrimitive(right);else if(isDataReference(left)&&left.errorType&&(right===null||isUndefinedReference(right))||isDataReference(right)&&right.errorType&&(left===null||isUndefinedReference(left)))return expression.operator==="!=";}
    switch (expression.operator) {
      case "instanceof": {
        if(program.version<9)throw new Error("instanceof Error richiede IR 9: ricompila lo script.");
        if(!isFunctionReference(right))throw new TypeError("instanceof richiede un costruttore Error.");
        let target=right.scriptFunction;while(target.bound)target=target.bound.target.scriptFunction;
        if(target.intrinsic!=="error-constructor"||!target.errorType)throw new TypeError("instanceof è disponibile soltanto per i costruttori Error nella sandbox.");
        return isDataReference(left)&&Boolean(left.errorType)&&(target.errorType==="Error"||left.errorType===target.errorType);
      }
      case "&&": return modern ? right : truth(right);
      case "||": case "??": return right;
      case "==": return referenceEquality(left, right) ?? (isUndefinedReference(left) || isUndefinedReference(right) ? (isUndefinedReference(left) || left === null) && (isUndefinedReference(right) || right === null) : scalar(left) == scalar(right)); // semantica JavaScript esplicitamente richiesta dallo script
      case "!=": return referenceEquality(left, right) === undefined ? isUndefinedReference(left) || isUndefinedReference(right) ? !((isUndefinedReference(left) || left === null) && (isUndefinedReference(right) || right === null)) : scalar(left) != scalar(right) : !referenceEquality(left, right);
      case "===": return referenceEquality(left, right) ?? (isUndefinedReference(left) && isUndefinedReference(right) || left === right);
      case "!==": return !(referenceEquality(left, right) ?? (isUndefinedReference(left) && isUndefinedReference(right) || left === right));
      case "<": return isUndefinedReference(left) || isUndefinedReference(right) ? false : number(left) < number(right);
      case "<=": return isUndefinedReference(left) || isUndefinedReference(right) ? false : number(left) <= number(right);
      case ">": return isUndefinedReference(left) || isUndefinedReference(right) ? false : number(left) > number(right);
      case ">=": return isUndefinedReference(left) || isUndefinedReference(right) ? false : number(left) >= number(right);
      case "+": if (modern && (isUndefinedReference(left) && typeof right === "string" || typeof left === "string" && isUndefinedReference(right))) return dataString(left, tick) + dataString(right, tick);
        return typeof scalar(left) === "string" || typeof scalar(right) === "string" ? `${String(scalar(left))}${String(scalar(right))}` : number(left) + number(right);
      case "-": return number(left) - number(right);
      case "*": return number(left) * number(right);
      case "/": { const divisor = number(right); if (!divisor) throw new Error("Divisione per zero."); return number(left) / divisor; }
      case "%": { const divisor = number(right); if (!divisor) throw new Error("Divisione per zero."); return number(left) % divisor; }
      case "**": return number(left) ** number(right);
      case "&": return number(left) & number(right);
      case "|": return number(left) | number(right);
      case "^": return number(left) ^ number(right);
      case "<<": return number(left) << number(right);
      case ">>": return number(left) >> number(right);
      case ">>>": return number(left) >>> number(right);
      default: throw new Error(`Operatore ${expression.operator} non supportato.`);
    }
  };
  const modeValue = function* (mode: HmiScriptExpression | undefined, operation: "read" | "write"): ScriptCoroutine<number> {
    if (!mode) return 0;
    const value = number((yield* evaluate(mode)));
    if (!Number.isInteger(value) || value < 0 || value > 1) throw new Error(`${operation === "read" ? "hmiReadType" : "hmiWriteType"} deve valere 0 oppure 1.`);
    return value;
  };
  const maxAgeValue = function* (maxAge: HmiScriptExpression | undefined): ScriptCoroutine<number | undefined> {
    if (!maxAge) return undefined;
    const value = number((yield* evaluate(maxAge)));
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error("maxAge deve essere un UInt32 espresso in millisecondi.");
    return value;
  };
  const targetOf = function* (expression: HmiScriptExpression): ScriptCoroutine<{ target: RuntimeValue; names: string[]; state: TagSetState | undefined }> {
    const target = (yield* evaluate(expression));
    if (isTagSetReference(target)) return { target, names: target.tagSet.names, state: target.tagSet };
    if (isTagReference(target)) return { target, names: [target.tag], state: target.tagSet };
    throw new Error("L'operazione richiede un tag o un TagSet.");
  };
  const readTarget = function* (expression: HmiScriptExpression, mode?: HmiScriptExpression, maxAge?: HmiScriptExpression): ScriptCoroutine<RuntimeValue> {
    const age = maxAge ? yield* maxAgeValue(maxAge) : undefined;
    const readMode = maxAge ? 0 : yield* modeValue(mode, "read");
    const { target, names, state } = (yield* targetOf(expression));
    let succeeded = 0;
    const failed: string[] = [];
    for (const name of names) {
      const configuredFailure = options.readFailures?.[name];
      const missing = !Object.prototype.hasOwnProperty.call(values, name) || values[name].trim() === "";
      const status = state?.status[name] ?? statusFor(name);
      if (remote(name) && !configuredFailure) {
        try { yield* readRemote(name, readMode, age); Object.assign(status, statusFor(name)); if (state) delete state.pending[name]; succeeded++; }
        catch (caught) { status.lastError = 0x80040002; status.errorDescription = faultMessage(caught); status.qualityCode = 0; status.timeStamp = 0; failed.push(name); }
        continue;
      }
      if (configuredFailure || missing) {
        status.lastError = configuredFailure?.code ?? 0x80040002;
        status.errorDescription = configuredFailure?.description ?? `Il tag ${name} non ha un valore di prova.`;
        status.qualityCode = 0;
        status.timeStamp = 0;
        failed.push(name);
      } else {
        const configured = options.tagStatus?.[name];
        status.lastError = configured?.lastError ?? 0;
        status.errorDescription = configured?.errorDescription ?? "";
        status.qualityCode = configured?.qualityKnown === false ? 0 : configured?.qualityCode ?? 192;
        status.timeStamp = configured?.timeStamp ?? 0;
        succeeded += 1;
      }
    }
    if (state) {
      state.lastError = failed.length ? 0x80040004 : 0;
      state.errorDescription = failed.length ? `Lettura non riuscita per: ${failed.join(", ")}.` : "";
    }
    if (!succeeded && failed.length) {
      const reasons = [...new Set(failed.map((name) => (state?.status[name] ?? statusFor(name)).errorDescription).filter(Boolean))];
      throw hmiFault(names.length > 1 ? 0x80040004 : 0x80040002, `Nessun tag leggibile: ${failed.join(", ")}.${reasons.length ? " " + reasons.join("; ") : ""}`);
    }
    return target;
  };
  const recordOperatorMessage = (name: string, reason: string, oldValue: string, newValue: string) => {
    const unit = options.operatorContext?.units?.[name];
    operatorMessages.push({ tag: name, reason, oldValue, newValue,
      ...(options.operatorContext?.user ? { user: options.operatorContext.user } : {}),
      ...(options.operatorContext?.host ? { host: options.operatorContext.host } : {}),
      ...(unit ? { unit } : {}) });
  };
  const writeTarget = function* (expression: HmiScriptExpression, mode?: HmiScriptExpression, qcd = false, operatorReason?: string): ScriptCoroutine<RuntimeValue> {
    const writeMode = yield* modeValue(mode, "write");
    const { target, names, state } = (yield* targetOf(expression));
    const pending = state?.pending ?? {};
    const attempted = names.filter((name) => Object.prototype.hasOwnProperty.call(pending, name));
    let succeeded = 0;
    const failed: string[] = [];
    for (const name of attempted) {
      const configuredFailure = options.writeFailures?.[name];
      const status = state?.status[name] ?? statusFor(name);
      if (remote(name) && !configuredFailure) {
        const receipt = yield* writeRemote({ kind: "write", tag: name, value: pending[name], mode: writeMode, ...(qcd ? { qcd: true } : {}), ...(operatorReason !== undefined ? { operatorReason } : {}) });
        Object.assign(status, statusFor(name));
        if (receipt.outcome === "delivered") succeeded++; else failed.push(name);
        continue;
      }
      if (configuredFailure) {
        status.lastError = configuredFailure.code ?? 0x80040002;
        status.errorDescription = configuredFailure.description ?? `Scrittura non riuscita per ${name}.`;
        failed.push(name);
      } else {
        const oldValue = values[name] ?? "";
        const value = String(pending[name] ?? "");
        values[name] = value; writes[name] = value;
        status.lastError = 0; status.errorDescription = "";
        if (!qcd && operatorReason === undefined) { status.qualityCode = 0; status.timeStamp = 0; }
        if (operatorReason !== undefined) recordOperatorMessage(name, operatorReason, oldValue, value);
        succeeded += 1;
      }
    }
    if (state) {
      state.lastError = failed.length ? 0x80040004 : 0;
      state.errorDescription = failed.length ? `Scrittura non riuscita per: ${failed.join(", ")}.` : "";
    }
    if (attempted.length && !succeeded) {
      const reasons = [...new Set(failed.map((name) => (state?.status[name] ?? statusFor(name)).errorDescription).filter(Boolean))];
      throw hmiFault(attempted.length > 1 ? 0x80040004 : 0x80040002, `Nessun tag scrivibile: ${failed.join(", ")}.${reasons.length ? " " + reasons.join("; ") : ""}`);
    }
    return target;
  };
  let preparations = 0;
  const prepareStep = () => {
    if (++preparations > Math.min(65536, maxSteps * 4) || elapsed() > timeoutMs) throw new Error("Preparazione degli scope interrotta: lo script supera il budget di esecuzione.");
    if (options.signal?.aborted || options.isActive && !options.isActive()) throw new Error("Il contesto script non e' piu' attivo; nessun nuovo comando viene inviato.");
  };
  const writeMember = function* (object: RuntimeValue, key: string, value: RuntimeValue): ScriptCoroutine<void> {
        if (isDataReference(object)) dataSet(object, key, value, tick, modern);
        else if(isFunctionReference(object)&&object.scriptFunction.screenCollection)throw new Error("La collezione Items e' in sola lettura: modifica le proprieta' dei suoi elementi.");
        else if (object && typeof object === "object" && "screenItemId" in object) {
          if (!options.screenItems) throw new Error("Il contesto corrente non dispone degli oggetti HMI della schermata.");
          if(!object.screenPropertyPath&&key==='ProcessValue'){
            const definition=processValueDefinition(object,true),primitive=normalizeHmiProcessValue(scalar(value),definition),tag=definition.tag;
            if(tag){
              const failure=options.writeFailures?.[tag];
              if(failure){Object.assign(statusFor(tag),{lastError:failure.code??0x80040002,errorDescription:failure.description??'Scrittura ProcessValue non riuscita.'});throw hmiFault(statusFor(tag).lastError,statusFor(tag).errorDescription);}
              if(remote(tag)){
                const receipt=yield* writeRemote({kind:'write',tag,value:primitive,mode:0});
                if(receipt.outcome!=='delivered')throw hmiFault(statusFor(tag).lastError,statusFor(tag).errorDescription);
                tick();processValueDefinition(object,true); // No optimistic sample and no replay after context changes.
              }else{values[tag]=String(primitive);writes[tag]=String(primitive);}
            }else options.screenItems.set(object,key,primitive);
          }else if(!object.screenPropertyPath&&(key==="Margin"||key==="Padding")){
            const setter=key==="Margin"?options.screenItems.setMargin:options.screenItems.setPadding;
            if(!setter)throw new Error("La copia di "+key+" richiede i componenti Runtime aggiornati del pannello.");
            const sides=["Left","Top","Right","Bottom"] as const;
            if(isDataReference(value)){
              if(Array.isArray(value.data)||Object.keys(value.data).length!==4||!sides.every(side=>Object.hasOwn(value.data,side)))throw new TypeError(key+" richiede un oggetto con tutti e soli i lati Left, Top, Right, Bottom.");
            }else if(!value||typeof value!=="object"||!("screenItemId" in value)||value.screenPropertyPath!==key)throw new TypeError(key+" richiede un riferimento "+key+" o un oggetto con Left, Top, Right, Bottom.");
            const result={} as {Left:number;Top:number;Right:number;Bottom:number};
            for(const side of sides){const part=scalar(readMember(value,side));if(typeof part!=="number"||!Number.isInteger(part)||part < -2147483648||part>2147483647)throw new TypeError(key+"."+side+" richiede un numero intero tra -2147483648 e 2147483647 (Int32).");result[side]=part;}
            setter.call(options.screenItems,object,result);
          }else options.screenItems.set(object, key, scalar(value));
        }
        else if (isPopupReference(object) && ["Left", "Top", "Width", "Height", "Visible", "WindowFlags"].includes(key)) {
          if (!options.popupManager) throw new Error("Il contesto corrente non dispone di un gestore popup faceplate.");
          options.popupManager.set(object, key as HmiScriptPopupProperty, scalar(value));
        } else if (isTagReference(object) && object.tagSet && ["Value", "QualityCode", "TimeStamp"].includes(key)) {
          const primitive = scalar(value);
          if (key === "Value") object.tagSet.pending[object.tag] = primitive;
          else if (key === "QualityCode") {
            const qualityCode = number(primitive);
            if (!Number.isInteger(qualityCode) || qualityCode < 0 || qualityCode > 0xffffffff) throw new Error("QualityCode deve essere un UInt32.");
            object.tagSet.status[object.tag].qualityCode = qualityCode;
          } else {
            if (primitive === null || typeof primitive === "boolean") throw new Error("TimeStamp deve essere una data ISO o un valore temporale numerico.");
            object.tagSet.status[object.tag].timeStamp = primitive;
          }
        } else throw new Error("L'assegnazione richiede dati strutturati, un oggetto HMI, un popup o una voce TagSet.");
  };
  const assignmentTarget = function* (pattern: HmiScriptPattern): ScriptCoroutine<(value: RuntimeValue) => ScriptCoroutine<void>> {
    if (pattern.kind === "name") {
      const owner = ownerOf(pattern.name);
      return function* (value) {
        tick();if (!owner) throw new Error("Variabile locale " + pattern.name + " non definita.");
        if (owner.uninitialized?.has(pattern.name)) throw new Error("La variabile " + pattern.name + " non e' ancora inizializzata: sposta la dichiarazione prima dell'uso.");
        if (owner.constants.has(pattern.name)) throw new Error("La costante " + pattern.name + " non può essere riassegnata.");
        owner.values.set(pattern.name,value);owner.unassigned?.delete(pattern.name);
      };
    }
    if (pattern.kind !== "target") throw new Error("Destinatario dell’assegnazione non valido.");
    const object = yield* evaluate(pattern.object), key = dataKey(yield* evaluate(pattern.key));
    return function* (value) { tick();yield* writeMember(object,key,value); };
  };
  const assignPattern = function* (pattern: HmiScriptPattern, source: () => ScriptCoroutine<RuntimeValue>, depth = 0): ScriptCoroutine<void> {
    tick();if (depth >= 32) throw new Error("Il pattern supera 32 livelli.");
    const target = pattern.kind === "default" ? pattern.pattern : pattern;
    if (target.kind === "name" || target.kind === "target") {
      const write = yield* assignmentTarget(target);
      let value = yield* source();
      if (pattern.kind === "default" && isUndefinedReference(value)) value = yield* evaluate(pattern.value);
      yield* write(value);return;
    }
    let value = yield* source();
    if (pattern.kind === "default") {
      if (isUndefinedReference(value)) value = yield* evaluate(pattern.value);
      yield* assignPattern(pattern.pattern,function*(){return value;},depth+1);return;
    }
    if (pattern.kind === "array-pattern") {
      if (typeof value !== "string" && (!isDataReference(value) || !Array.isArray(value.data))) throw new Error("Il pattern di array richiede un array o una stringa.");
      const iterator = typeof value === "string" ? value[Symbol.iterator]() : ((value as DataReference).data as RuntimeValue[]).values();
      const next = function* (): ScriptCoroutine<RuntimeValue> { tick();const item=iterator.next();return item.done||item.value===undefined?undefinedValue():item.value; };
      for (const item of pattern.items) { if(item)yield* assignPattern(item,next,depth+1);else yield* next(); }
      if (pattern.rest) yield* assignPattern(pattern.rest,function*(){
        const data:RuntimeValue[]=[];let item=iterator.next();
        while(!item.done){tick();if(data.length>=1024)throw new Error("Il rest supera 1024 elementi.");data.push(item.value===undefined?undefinedValue():item.value);item=iterator.next();}
        return {data};
      },depth+1);
      return;
    }
    if(pattern.kind!=="object-pattern")throw new Error("Pattern di assegnazione non valido.");
    if (value === null || isUndefinedReference(value)) throw new Error("Il pattern di oggetto non può estrarre proprietà da null o undefined.");
    if (typeof value === "object" && !isDataReference(value) && !isFunctionReference(value)) throw new Error("Il pattern di oggetto richiede dati semplici, non oggetti delle API HMI.");
    const excluded=new Set<string>();
    for(const property of pattern.properties){
      const key=dataKey(yield* evaluate(property.key));excluded.add(key);
      yield* assignPattern(property.pattern,function*(){return isDataReference(value)||typeof value==="string"||isFunctionReference(value)?readMember(value,key):undefinedValue();},depth+1);
    }
    if(pattern.rest)yield* assignPattern(pattern.rest,function*(){
      const data:Record<string,RuntimeValue>=Object.create(null);
      const keys=isDataReference(value)?Object.keys(value.data):typeof value==="string"?Array.from({length:value.length},(_,index)=>String(index)):[];
      for(const key of keys)if(!excluded.has(key)){tick();if(Object.keys(data).length>=1024)throw new Error("Il rest supera 1024 proprietà.");data[dataKey(key)]=readMember(value,key);}
      return {data};
    },depth+1);
  };
  const bindPattern = function* (pattern: HmiScriptPattern, value: RuntimeValue, constant = false, functionScoped = false, depth = 0): ScriptCoroutine<void> {
    tick(); if (program.version < 7 || depth >= 32) throw new Error("Il pattern richiede IR 7 e fino a 32 livelli.");
    if (pattern.kind === "target") throw new Error("Un binding non può usare un destinatario di assegnazione.");
    if (pattern.kind === "name") {
      const owner = functionScoped ? ownerOf(pattern.name) ?? functionScope : lexicalScope;
      owner.values.set(pattern.name, value); owner.unassigned?.delete(pattern.name); owner.uninitialized?.delete(pattern.name);
      if (constant) owner.constants.add(pattern.name);
      return;
    }
    if (pattern.kind === "default") {
      const selected = isUndefinedReference(value) ? yield* evaluate(pattern.value) : value;
      yield* bindPattern(pattern.pattern, selected, constant, functionScoped, depth + 1);return;
    }
    if (pattern.kind === "array-pattern") {
      if (typeof value !== "string" && (!isDataReference(value) || !Array.isArray(value.data))) throw new Error("Il pattern di array richiede un array o una stringa.");
      const iterator = typeof value === "string" ? value[Symbol.iterator]() : ((value as DataReference).data as RuntimeValue[]).values();
      for (const item of pattern.items) {
        tick(); const next = iterator.next();
        if (item) yield* bindPattern(item, next.done || next.value === undefined ? undefinedValue() : next.value, constant, functionScoped, depth + 1);
      }
      if (pattern.rest) {
        const tail: RuntimeValue[] = [];let next = iterator.next();
        while (!next.done) { tick(); if (tail.length >= 1024) throw new Error("Il rest supera 1024 elementi."); tail.push(next.value === undefined ? undefinedValue() : next.value);next = iterator.next(); }
        yield* bindPattern(pattern.rest, { data: tail }, constant, functionScoped, depth + 1);
      }
      return;
    }
    if (value === null || isUndefinedReference(value)) throw new Error("Il pattern di oggetto non può estrarre proprietà da null o undefined.");
    if (typeof value === "object" && !isDataReference(value) && !isFunctionReference(value)) throw new Error("Il pattern di oggetto richiede dati semplici, non oggetti delle API HMI.");
    const excluded = new Set<string>();
    for (const property of pattern.properties) {
      tick();const key = dataKey(yield* evaluate(property.key));excluded.add(key);
      const propertyValue = isDataReference(value) || typeof value === "string" || isFunctionReference(value) ? readMember(value, key) : undefinedValue();
      yield* bindPattern(property.pattern, propertyValue, constant, functionScoped, depth + 1);
    }
    if (pattern.rest) {
      const data: Record<string, RuntimeValue> = Object.create(null);
      const keys = isDataReference(value) ? Object.keys(value.data) : typeof value === "string" ? Array.from({length:value.length}, (_, index) => String(index)) : [];
      for (const key of keys) if (!excluded.has(key)) {
        tick(); if (Object.keys(data).length >= 1024) throw new Error("Il rest supera 1024 proprietà.");
        data[dataKey(key)] = readMember(value, key);
      }
      yield* bindPattern(pattern.rest, { data }, constant, functionScoped, depth + 1);
    }
  };
  const hoistVars = (statements: readonly HmiScriptStatement[]) => {
    if (!lexicalBlocks) return;
    for (const statement of statements) {
      prepareStep();
      const names = statement.kind === "declare" && statement.functionScoped ? [statement.name] : statement.kind === "bind" && statement.functionScoped ? patternNames(statement.pattern) : [];
      for (const name of names) if (!functionScope.values.has(name)) {
        const parameter = parameterScope?.values.has(name);functionScope.values.set(name, parameter ? parameterScope!.values.get(name)! : null);
        if (!parameter) (functionScope.unassigned ??= new Set()).add(name);
      }
      if (names.length) continue;
      if (statement.kind === "block") hoistVars(statement.statements);
      else if (statement.kind === "if") { hoistVars(statement.consequent); hoistVars(statement.alternate); }
      else if (statement.kind === "switch") for (const entry of statement.cases) hoistVars(entry.statements);
      else if (statement.kind === "try") { hoistVars(statement.statements); hoistVars(statement.failure?.statements ?? []); hoistVars(statement.final); }
      // Promise handlers and timer programs own their function declarations.
    }
  };
  const makeFunction = (expression: Extract<HmiScriptExpression, { kind: "function-value" }>, declaration = false): FunctionReference => {
    const scope = expression.name && !declaration ? createHmiScriptScope(undefined, lexicalScope) : lexicalScope;
    const result: FunctionReference = { scriptFunction: { parameters: expression.parameters, ...(expression.rest ? { rest: expression.rest } : {}), ...(expression.parameterPatterns ? { parameterPatterns: expression.parameterPatterns, functionLength: expression.functionLength } : {}), program: expression.program, scope, globalScope: options.globalScope, functions: options.functions, variables: options.variables, name: expression.name ?? expression.displayName, arrow: program.version >= 5 && expression.arrow, ...(expression.arrow ? { lexicalThis: thisBinding } : {}) } };
    if (expression.name && !declaration) { scope.values.set(expression.name, result); scope.constants.add(expression.name); }
    return result;
  };
  const invokeFunction = function* (reference: FunctionReference, args: RuntimeValue[], receiver: RuntimeValue = undefinedValue(), intrinsicDepth = 0): ScriptCoroutine<RuntimeValue> {
    tick();
    if (intrinsicDepth >= 32) throw new Error("Troppi livelli di call/apply/bind (massimo 32).");
    let fn = reference.scriptFunction;
    for (let depth = 0; ; depth++) {
      if (depth > 32 || args.length > 1024) throw new Error("La funzione supera il limite di bind o di 1024 argomenti.");
      for (let scope = fn.scope; scope; scope = scope.parent) if (!scope.active) throw new Error("Il contesto della funzione non e' piu' attivo.");
      if (!fn.bound) break;
      tick(); receiver = fn.bound.thisArg; args = [...fn.bound.args, ...args]; fn = fn.bound.target.scriptFunction;
    }
    if (fn.intrinsic) {
      if(fn.intrinsic==="error-constructor"){if(program.version<9||!fn.errorType)throw new Error("Il costruttore richiede IR 9.");return yield* createError(fn.errorType,args);}
      if(fn.intrinsic==="error-to-string"){if(!isDataReference(receiver))throw new TypeError("Error.toString richiede un oggetto.");return scriptErrorString(receiver,tick);}
      if(fn.intrinsic==="screen-box"){
        if(args.length)throw new TypeError("GetBoundingBoxInScreenCoordinates non richiede argomenti.");
        if(!receiver||typeof receiver!=="object"||!("screenItemId" in receiver)||receiver.screenPropertyPath)throw new TypeError("GetBoundingBoxInScreenCoordinates richiede un oggetto grafico come contesto this.");
        const manager=fn.screenBox?.manager;
        if(!manager?.getBoundingBox)throw new Error("La misura degli oggetti richiede i componenti Runtime aggiornati del pannello.");
        const box=(options.allowAsync&&manager.getBoundingBoxAsync?yield {kind:"screen-box",manager,reference:receiver}:manager.getBoundingBox(receiver)) as HmiScriptBox|null;
        if(box===null)return null;
        if(!box||["Left","Top","Width","Height"].some(key=>typeof box[key as keyof HmiScriptBox]!=="number"||!Number.isFinite(box[key as keyof HmiScriptBox]))||box.Width<0||box.Height<0)throw new Error("La misura dell'oggetto HMI non e' valida.");
        return {data:{Left:box.Left,Top:box.Top,Width:box.Width,Height:box.Height}};
      }
      if (fn.intrinsic === "screen-items") {
        const collection=fn.screenCollection;
        if(!collection)throw new Error("Collezione Items non disponibile nel contesto corrente.");
        if(receiver!==null&&!isUndefinedReference(receiver)&&(!receiver||typeof receiver!=="object"||!("screenItemId" in receiver)||receiver.screenPropertyPath||receiver.screenItemId!==collection.root.screenItemId))throw new Error(collection.scope==="screen"?"Items richiede la schermata come contesto this.":"Items richiede il faceplate del contesto.");
        if(args.length!==1)throw new Error("Items richiede un nome o un indice.");
        return collectionItem(collection,args[0]);
      }
      if (!isFunctionReference(receiver)) throw new Error(fn.intrinsic + " richiede una funzione HMI come contesto.");
      const context = args[0] === undefined ? undefinedValue() : args[0];
      if (fn.intrinsic === "call") return yield* invokeFunction(receiver, args.slice(1), context, intrinsicDepth + 1);
      if (fn.intrinsic === "apply") {
        const source = args[1]; const applied: RuntimeValue[] = [];
        if (source !== undefined && source !== null && !isUndefinedReference(source)) {
          if (!isDataReference(source)) throw new Error("apply richiede un array o un oggetto con length.");
          const rawLength = dataGet(source, "length", true), numericLength = isUndefinedReference(rawLength) ? 0 : Number(scalar(rawLength));
          const length = Number.isNaN(numericLength) || numericLength <= 0 ? 0 : Math.trunc(numericLength);
          if (!Number.isFinite(length) || length > 1024) throw new Error("apply supera il limite di 1024 argomenti.");
          for (let index = 0; index < length; index++) { tick(); applied.push(dataGet(source, String(index), true)); }
        }
        return yield* invokeFunction(receiver, applied, context, intrinsicDepth + 1);
      }
      const target = receiver.scriptFunction, prefix = args.slice(1), depth = (target.bound?.depth ?? 0) + 1, count = (target.bound?.count ?? 0) + prefix.length;
      if (depth > 32 || count > 1024) throw new Error("bind supera 32 livelli o 1024 argomenti conservati.");
      return { scriptFunction: { parameters: target.parameters.slice(prefix.length), functionLength: Math.max(0, (target.functionLength ?? target.parameters.length) - prefix.length), program: target.program, name: "bound " + (target.name ?? ""), scope: lexicalScope, bound: { target: receiver, thisArg: context, args: prefix, depth, count } } };
    }
    const stack = options.callStack ?? [];
    if (stack.length >= 16) throw new Error("Troppi livelli di chiamata fra funzioni HMI (massimo 16).");
    if (fn.program.version < 5 && args.length !== fn.parameters.length) throw new Error("La funzione " + (fn.name ?? "anonima") + " richiede " + fn.parameters.length + " argomenti, ricevuti " + args.length + ".");
    const nested = yield* executeHmiScriptCoroutine(fn.program, values, { ...options,
      maxSteps: Math.max(1, maxSteps - steps), timeoutMs: Math.max(1, timeoutMs - elapsed()),
      locals: fn.parameterPatterns ? undefined : Object.fromEntries([...fn.parameters.map((parameter, index) => [parameter, args[index] === undefined ? undefinedValue() : args[index]]), ...(fn.rest ? [[fn.rest, { data: args.slice(fn.parameters.length) }]] : [])]),
      parameterBindings: fn.parameterPatterns ? { patterns: [{ kind: "array-pattern", items: fn.rest ? fn.parameterPatterns.slice(0, -1) : fn.parameterPatterns, ...(fn.rest ? { rest: fn.parameterPatterns.at(-1)! } : {}) }], values: [{ data: args }] } : undefined,
      thisBinding: fn.arrow ? fn.lexicalThis ?? { value: undefinedValue() } : { value: receiver },
      globalScope: fn.globalScope, closureScope: fn.scope, initializingScope: undefined,
      functions: fn.functions, variables: fn.variables, tagStatus: { ...options.tagStatus, ...statusByTag },
      callStack: [...stack, fn.name ?? "callback"], returnByReference: true,
    });
    mergeNested(nested);
    if ("thrownReference" in nested) {
      if(program.version<9&&nested.thrownFromHost)throw new Error(nested.error??"Errore del modulo HMI.");
      throw {__framecraftScriptThrown:true,value:nested.thrownReference,...(nested.thrownFromHost?{fromHost:true}:{})};
    }
    if (nested.error) throw new Error(nested.error);
    return "returnedReference" in nested ? nested.returnedReference! : "returned" in nested ? nested.returned! : fn.program.version >= 4 ? undefinedValue() : null;
  };
  const prepareLexicals = (statements: readonly HmiScriptStatement[]) => {
    if (!lexicalBlocks) return;
    lexicalScope.uninitialized ??= new Set();
    for (const statement of statements) {
      prepareStep();
      if (statement.kind === "function-declare") {
        if (program.version < 3) throw new Error("Le dichiarazioni di funzione richiedono IR 3: ricompila lo script.");
        if (locals.has(statement.name) && lexicalScope !== functionScope) throw new Error("Funzione gia' dichiarata nello scope: " + statement.name);
        locals.set(statement.name, makeFunction(statement.value, true)); lexicalScope.unassigned?.delete(statement.name); continue;
      }
      if (statement.kind !== "declare" && statement.kind !== "bind" || statement.functionScoped) continue;
      for (const name of statement.kind === "declare" ? [statement.name] : patternNames(statement.pattern)) {
        if (statement.kind === "bind") prepareStep();if (locals.has(name)) throw new Error("La variabile " + name + " è già dichiarata nello stesso scope.");
        locals.set(name, null);lexicalScope.uninitialized.add(name);if (statement.constant) lexicalScope.constants.add(name);
      }
    }
  };
  type Flow = { returned?: true; broken?: true; value?: RuntimeValue } | undefined;
  const runBody = function* (statements: readonly HmiScriptStatement[]): ScriptCoroutine<Flow> {
    for (const statement of statements) {
      tick();
      if (statement.kind === "function-declare") {
        if (program.version < 3) throw new Error("Le dichiarazioni di funzione richiedono IR 3.");
        continue;
      }
      if (statement.kind === "throw") {
        if(program.version<8)throw new Error("throw richiede IR 8: aggiorna il Runtime e ricompila lo script.");
        throw {__framecraftScriptThrown:true,value:yield* evaluate(statement.value)};
      } else if (statement.kind === "bind") {
        yield* bindPattern(statement.pattern, yield* evaluate(statement.value), Boolean(statement.constant), Boolean(statement.functionScoped));
      } else if (statement.kind === "declare") {
        const owner = statement.functionScoped ? ownerOf(statement.name) ?? functionScope : lexicalScope;
        if (statement.value) { owner.values.set(statement.name, (yield* evaluate(statement.value))); owner.unassigned?.delete(statement.name); }
        else if (!statement.functionScoped) { owner.values.set(statement.name, null); (owner.unassigned ??= new Set()).add(statement.name); }
        owner.uninitialized?.delete(statement.name);
        if (statement.constant) owner.constants.add(statement.name);
      } else if (statement.kind === "block") {
        if (!lexicalBlocks) throw new Error("Un blocco lessicale richiede la ricompilazione dello script in IR 2.");
        const flow = (yield* run(statement.statements, "block")); if (flow) return flow;
      } else if (statement.kind === "break") {
        if (!lexicalBlocks) throw new Error("break richiede la ricompilazione dello script in IR 2.");
        return { broken: true };
      }
      else if (statement.kind === "assign") {
        const owner = ownerOf(statement.name);
        if (!owner) throw new Error(`Variabile locale ${statement.name} non definita.`);
        if (owner.uninitialized?.has(statement.name)) throw new Error(`La variabile ${statement.name} non e' ancora inizializzata: sposta la dichiarazione prima dell'uso.`);
        if (owner.constants.has(statement.name)) throw new Error(`La costante ${statement.name} non puo' essere riassegnata.`);
        owner.values.set(statement.name, (yield* evaluate(statement.value)));
        owner.unassigned?.delete(statement.name);
      } else if (statement.kind === "member-set") {
        const object = (yield* evaluate(statement.object)), key = dataKey((yield* evaluate(statement.key))), value = (yield* evaluate(statement.value));
        yield* writeMember(object, key, value);
      } else if (statement.kind === "return") {
        const value = statement.value ? (yield* evaluate(statement.value)) : undefined;
        return { returned: true, ...(value !== undefined ? { value: options.returnByReference ? value : scalar(value) } : {}) };
      }
      else if (statement.kind === "expression") (yield* evaluate(statement.value));
      else if (statement.kind === "trace") traces.push(String(scalar((yield* evaluate(statement.value)))));
      else if (statement.kind === "navigate") navigation.push(String(scalar((yield* evaluate(statement.target)))));
      else if (statement.kind === "module-call") { (yield* evaluate(statement.call)); }
      else if (statement.kind === "timer-set") { (yield* evaluate(statement.timer)); }
      else if (statement.kind === "timer-clear") {
        const id = number((yield* evaluate(statement.id)));
        if (!Number.isInteger(id) || id < 1) throw new Error("L'ID del timer deve essere un intero positivo.");
        if (!options.timerManager) throw new Error("Il contesto corrente non dispone di un gestore timer.");
        options.timerManager.clear(statement.mode, id);
      }
      else if (statement.kind === "popup-set") {
        if (!options.popupManager) throw new Error("Il contesto corrente non dispone di un gestore popup faceplate.");
        const popup = (yield* evaluate(statement.popup));
        if (!isPopupReference(popup)) throw new Error(`${statement.property} richiede una finestra popup faceplate.`);
        options.popupManager.set(popup, statement.property, scalar((yield* evaluate(statement.value))));
      }
      else if (statement.kind === "popup-close") {
        if (!options.popupManager) throw new Error("Il contesto corrente non dispone di un gestore popup faceplate.");
        const popup = statement.popup ? (yield* evaluate(statement.popup)) : undefined;
        if (popup !== undefined && !isPopupReference(popup)) throw new Error("Close richiede una finestra popup faceplate.");
        options.popupManager.close(popup as HmiScriptPopupReference | undefined);
      }
      else if (statement.kind === "raise-faceplate-event") {
        const name = String(scalar((yield* evaluate(statement.name))) ?? "").trim();
        if (!name) throw new Error("Il nome dell'evento faceplate non puo' essere vuoto.");
        const parameters = Object.fromEntries((yield* mapScriptValues(statement.parameters, function* (parameter) { return [parameter.name, scalar((yield* evaluate(parameter.value)))]; })));
        faceplateEvents.push({ name, parameters });
      }
      else if (statement.kind === "write") {
        const name = tagName((yield* evaluate(statement.tag)));
        const primitive = scalar((yield* evaluate(statement.value)));
        const value = String(primitive ?? "");
        if (remote(name)) {
          const receipt = yield* writeRemote({ kind: "write", tag: name, value: primitive, mode: 0 });
          if (receipt.outcome !== "delivered") throw hmiFault(statusFor(name).lastError, statusFor(name).errorDescription);
          continue;
        }
        const failure = options.writeFailures?.[name];
        if (failure) { Object.assign(statusFor(name), { lastError: failure.code ?? 0x80040002, errorDescription: failure.description ?? "Scrittura non riuscita." }); throw hmiFault(statusFor(name).lastError, statusFor(name).errorDescription); }
        values[name] = value; writes[name] = value;
      } else if (statement.kind === "tag-set-read") {
        if (statement.async && !options.allowAsync) throw new Error("Lo script usa una lettura asincrona: eseguilo con executeHmiScriptAsync().");
        (yield* readTarget(statement.set, statement.mode, statement.maxAge));
      } else if (statement.kind === "tag-set-add") {
        const set = (yield* evaluate(statement.set));
        if (!isTagSetReference(set)) throw new Error("Add richiede un TagSet.");
        for (const entry of statement.entries) {
          if (!set.tagSet.names.includes(entry.name)) {
            set.tagSet.names.push(entry.name);
            set.tagSet.status[entry.name] = statusFor(entry.name);
          }
          if (entry.value) set.tagSet.pending[entry.name] = scalar((yield* evaluate(entry.value)));
        }
      } else if (statement.kind === "tag-set-remove") {
        const set = (yield* evaluate(statement.set));
        if (!isTagSetReference(set)) throw new Error("Remove richiede un TagSet.");
        set.tagSet.names = set.tagSet.names.filter((name) => !statement.names.includes(name));
        for (const name of statement.names) { delete set.tagSet.pending[name]; delete set.tagSet.status[name]; }
      } else if (statement.kind === "tag-set-clear") {
        const set = (yield* evaluate(statement.set));
        if (!isTagSetReference(set)) throw new Error("Clear richiede un TagSet.");
        set.tagSet.names = [];
        set.tagSet.pending = {};
        set.tagSet.status = {};
        set.tagSet.lastError = 0;
        set.tagSet.errorDescription = "";
      } else if (statement.kind === "tag-set-stage") {
        const set = (yield* evaluate(statement.set));
        if (!isTagSetReference(set)) throw new Error("L'assegnazione Value richiede un TagSet.");
        const name = tagName((yield* evaluate(statement.tag)));
        if (!set.tagSet.names.includes(name)) throw new Error(`Il tag ${name} non appartiene al TagSet.`);
        const value = scalar((yield* evaluate(statement.value)));
        if (statement.property === "Value") set.tagSet.pending[name] = value;
        else if (statement.property === "QualityCode") {
          const qualityCode = number(value);
          if (!Number.isInteger(qualityCode) || qualityCode < 0 || qualityCode > 0xffffffff) throw new Error("QualityCode deve essere un UInt32.");
          set.tagSet.status[name].qualityCode = qualityCode;
        } else {
          if (value === null || typeof value === "boolean") throw new Error("TimeStamp deve essere una data ISO o un valore temporale numerico.");
          set.tagSet.status[name].timeStamp = value;
        }
      } else if (statement.kind === "tag-set-write") {
        if (statement.async && !options.allowAsync) throw new Error("Lo script usa WriteAsync(): eseguilo con executeHmiScriptAsync().");
        (yield* writeTarget(statement.set, statement.mode, statement.qcd));
      } else if (statement.kind === "qcd-write") {
        const target = (yield* evaluate(statement.target));
        if (isTagSetReference(target)) {
          if (statement.arguments.length > 1) throw new Error("TagSet.WriteQCD accetta soltanto il tipo di scrittura facoltativo.");
          (yield* writeTarget(statement.target, statement.arguments[0], true));
        } else if (isTagReference(target)) {
          const name = target.tag;
          const args = (yield* mapScriptValues(statement.arguments, function* (argument) { return scalar((yield* evaluate(argument))); }));
          if (args[1] !== undefined) {
            const mode = number(args[1]);
            if (!Number.isInteger(mode) || mode < 0 || mode > 1) throw new Error("hmiWriteType deve valere 0 oppure 1.");
          }
          const current = values[name];
          const value = args[0] === undefined ? current : String(args[0] ?? "");
          if (value === undefined) throw new Error(`Il tag ${name} non ha un valore da scrivere.`);
          const failure = options.writeFailures?.[name];
          const status = target.tagSet?.status[name] ?? statusFor(name);
          if (remote(name) && !failure) {
            const receipt = yield* writeRemote({ kind: "write", tag: name, value: args[0] ?? value, mode: Number(args[1] ?? 0), qcd: true });
            Object.assign(status, statusFor(name));
            if (receipt.outcome !== "delivered") throw hmiFault(status.lastError, status.errorDescription);
            continue;
          }
          if (failure) {
            status.lastError = failure.code ?? 0x80040002;
            status.errorDescription = failure.description ?? `Scrittura non riuscita per ${name}.`;
            throw hmiFault(status.lastError, status.errorDescription);
          }
          if (args[2] !== undefined) {
            if (args[2] === null || typeof args[2] === "boolean") throw new Error("TimeStamp deve essere una data ISO o un valore temporale numerico.");
            status.timeStamp = args[2];
          }
          if (args[3] !== undefined) {
            const qualityCode = number(args[3]);
            if (!Number.isInteger(qualityCode) || qualityCode < 0 || qualityCode > 0xffffffff) throw new Error("QualityCode deve essere un UInt32.");
            status.qualityCode = qualityCode;
          }
          status.lastError = 0; status.errorDescription = "";
          values[name] = String(value); writes[name] = String(value);
        } else throw new Error("WriteQCD richiede un tag o un TagSet.");
      } else if (statement.kind === "operator-write") {
        const target = (yield* evaluate(statement.target));
        const reason = String(scalar((yield* evaluate(statement.reason))) ?? "");
        if (!reason.trim()) throw new Error("Il motivo del messaggio operatore non puo' essere vuoto.");
        if (isTagSetReference(target)) {
          if (statement.value) throw new Error("TagSet.WriteWithOperatorMessage accetta soltanto il motivo.");
          (yield* writeTarget(statement.target, { kind: "literal", value: 1 }, false, reason));
        } else if (isTagReference(target)) {
          if (!statement.value) throw new Error("Tag.WriteWithOperatorMessage richiede valore e motivo.");
          const name = target.tag;
          const oldValue = values[name] ?? "";
          const value = String(scalar((yield* evaluate(statement.value))) ?? "");
          const failure = options.writeFailures?.[name];
          const status = target.tagSet?.status[name] ?? statusFor(name);
          if (remote(name) && !failure) {
            const receipt = yield* writeRemote({ kind: "write", tag: name, value, mode: 1, operatorReason: reason });
            Object.assign(status, statusFor(name));
            if (receipt.outcome !== "delivered") throw hmiFault(status.lastError, status.errorDescription);
            continue;
          }
          if (failure) {
            status.lastError = failure.code ?? 0x80040002;
            status.errorDescription = failure.description ?? `Scrittura non riuscita per ${name}.`;
            throw hmiFault(status.lastError, status.errorDescription);
          }
          values[name] = value; writes[name] = value;
          status.lastError = 0; status.errorDescription = "";
          recordOperatorMessage(name, reason, oldValue, value);
        } else throw new Error("WriteWithOperatorMessage richiede un tag o un TagSet.");
      } else if (statement.kind === "tag-set-promise") {
        if (!options.allowAsync) throw new Error("Lo script usa una Promise TagSet: eseguilo con executeHmiScriptAsync().");
        try {
          const target = statement.operation === "read" ? (yield* readTarget(statement.set, statement.mode, statement.maxAge)) : (yield* writeTarget(statement.set, statement.mode, statement.qcd));
          if (statement.success) {
            (yield* run(statement.success.statements, "function", statement.success.name ? { [statement.success.name]: target } : undefined, true, statement.success.arrow ? thisBinding : { value: undefinedValue() }));
          }
        } catch (caught) {
          if (!statement.failure) throw caught;
          (yield* run(statement.failure.statements, "function", statement.failure.name ? { [statement.failure.name]: faultCode(caught) } : undefined, true, statement.failure.arrow ? thisBinding : { value: undefinedValue() }));
        }
      } else if (statement.kind === "bit") {
        const name = tagName((yield* evaluate(statement.tag)));
        const bit = number((yield* evaluate(statement.bit)));
        if (!Number.isInteger(bit) || bit < 0 || bit > 31) throw new Error(`Il bit ${bit} non e' compreso tra 0 e 31.`);
        const failure = options.writeFailures?.[name];
        if (remote(name) || failure) {
          const error = failure?.description ?? "Operazione atomica sui bit non supportata dal trasporto MQTT; nessun comando inviato.";
          Object.assign(statusFor(name), { lastError: failure?.code ?? 0x80040002, errorDescription: error });
          if (remote(name)) commands.push({ tag: name, outcome: "rejected", plcConfirmed: false, error });
          throw hmiFault(statusFor(name).lastError, error);
        }
        const current = Number(values[name] ?? "0");
        if (!Number.isFinite(current)) throw new Error(`Il tag ${name} non contiene un numero.`);
        const mask = 1 << bit;
        const next = statement.operation === "set" ? current | mask : statement.operation === "reset" ? current & ~mask : current ^ mask;
        values[name] = String(next); writes[name] = String(next);
      } else if (statement.kind === "if") {
        const flow = (yield* run(truth((yield* evaluate(statement.test))) ? statement.consequent : statement.alternate, "block"));
        if (flow) return flow;
      } else if (statement.kind === "switch") {
        const value = scalar((yield* evaluate(statement.value)));
        const parentScope = lexicalScope; if (lexicalBlocks) lexicalScope = createHmiScriptScope(undefined, lexicalScope); locals = lexicalScope.values;
        try {
        prepareLexicals(statement.cases.flatMap(entry => entry.statements));
        const entry = (yield* findScriptValue(statement.cases, function* (candidate) { return candidate.test && scalar((yield* evaluate(candidate.test))) === value; }))
          ?? statement.cases.find((candidate) => !candidate.test);
        if (entry) for (let index = statement.cases.indexOf(entry); index < statement.cases.length; index++) {
          const flow = (yield* run(statement.cases[index].statements, "current", undefined, false));
          if (flow?.broken) break;
          if (flow) return flow;
          if (!lexicalBlocks) break;
        }
        } finally { lexicalScope = parentScope; locals = lexicalScope.values; }
      } else if (statement.kind === "try") {
        let flow: Flow;
        try {
          try {
            flow = (yield* run(statement.statements, "block"));
          } catch (caught) {
            if (!statement.failure) throw caught;
            flow = (yield* run(statement.failure.statements, "block", statement.failure.name ? { [statement.failure.name]: faultCode(caught) } : undefined));
          }
        } finally {
          const finalFlow = (yield* run(statement.final, "block"));
          if (finalFlow) return finalFlow;
        }
        if (flow) return flow;
      }
    }
    return undefined;
  };
  const run = function* (statements: readonly HmiScriptStatement[], mode: "current" | "block" | "function" = "current", bindings?: Record<string, RuntimeValue>, prepare = true, functionThis?: HmiScriptThisBinding): ScriptCoroutine<Flow> {
    const previousScope = lexicalScope, previousFunction = functionScope, previousThis = thisBinding;
    if (functionThis) thisBinding = functionThis;
    const legacyBindings = !lexicalBlocks && mode === "block" ? Object.keys(bindings ?? {}).map(name => ({ name, exists: locals.has(name), value: locals.get(name), constant: lexicalScope.constants.has(name), unassigned: lexicalScope.unassigned?.has(name), pending: lexicalScope.uninitialized?.has(name) })) : [];
    if (mode === "function" || mode === "block" && lexicalBlocks) { lexicalScope = createHmiScriptScope(undefined, lexicalScope); locals = lexicalScope.values; }
    if (mode === "function") functionScope = lexicalScope;
    try {
      for (const [name, value] of Object.entries(bindings ?? {})) { locals.set(name, value); lexicalScope.unassigned?.delete(name); lexicalScope.uninitialized?.delete(name); }
      if (mode === "function") hoistVars(statements);
      if (prepare) prepareLexicals(statements);
      return (yield* runBody(statements));
    } finally {
      for (const binding of legacyBindings) {
        if (binding.exists) previousScope.values.set(binding.name, binding.value!); else previousScope.values.delete(binding.name);
        if (binding.constant) previousScope.constants.add(binding.name); else previousScope.constants.delete(binding.name);
        if (binding.unassigned) (previousScope.unassigned ??= new Set()).add(binding.name); else previousScope.unassigned?.delete(binding.name);
        if (binding.pending) (previousScope.uninitialized ??= new Set()).add(binding.name); else previousScope.uninitialized?.delete(binding.name);
      }
      lexicalScope = previousScope; functionScope = previousFunction; locals = lexicalScope.values; thisBinding = previousThis;
    }
  };
  try {
    for (let scope = localScope.parent; scope; scope = scope.parent) {
      (yield* initializeScope(scope));
    }
    if (!localScope.active) throw new Error("Il contesto script non e' piu' attivo.");
    if (parameterInput && parameterScope) {
      lexicalScope = functionScope = parameterScope;locals = parameterScope.values;
      parameterScope.uninitialized ??= new Set();
      for (const pattern of parameterInput.patterns) for (const name of patternNames(pattern)) { prepareStep();locals.set(name,null);parameterScope.uninitialized.add(name); }
      for (let i = 0; i < parameterInput.patterns.length; i++) yield* bindPattern(parameterInput.patterns[i], parameterInput.values[i] === undefined ? undefinedValue() : parameterInput.values[i]);
      lexicalScope = functionScope = localScope;locals = localScope.values;
    }
    hoistVars(program.statements);
    const flow = (yield* run(program.statements));
    if (flow?.broken) throw new Error("break richiede un blocco switch attivo.");
    return { ...(flow?.returned && flow.value !== undefined ? options.returnByReference ? { returnedReference: flow.value } : { returned: scalar(flow.value) } : {}), writes, traces, navigation, operatorMessages, faceplateEvents, tagStatus: { ...statusByTag }, steps, ...(options.transport ? { reads, commands } : {}) };
  } catch (caught) {
    return { writes, traces, navigation, operatorMessages, faceplateEvents, tagStatus: { ...statusByTag }, steps, error: faultMessage(caught), ...(options.returnByReference && (isScriptThrown(caught)||program.version>=9) ? {thrownReference:faultCode(caught),...((isScriptThrown(caught)?caught.fromHost:program.version>=9)?{thrownFromHost:true as const}:{})} : {}), ...(options.transport ? { reads, commands } : {}) };
  }
}

export function executeHmiScript(program: HmiScriptProgram, input: Readonly<Record<string, string>>, options: HmiScriptExecutionOptions = {}): HmiScriptExecution {
  const iterator = executeHmiScriptCoroutine(program, input, options);
  let current = iterator.next();
  while (!current.done) current = iterator.throw(Object.assign(new Error(current.value.kind === "screen-box" ? "La misura aggiornata nell’anteprima richiede executeHmiScriptAsync()." : "Il trasporto PLC richiede executeHmiScriptAsync(); nessun comando inviato."), { outcome: "rejected" }));
  return current.value;
}

async function performScriptGeometry(request: Extract<HmiScriptHostRequest, {
  kind: "screen-box";
}>, options: HmiScriptExecutionOptions): Promise<unknown> {
  const active = () => !options.signal?.aborted && (!options.isActive || options.isActive());
  if (!active()) throw new Error("La pagina non e' piu' attiva: misura annullata.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel!: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new Error("Misura dell'oggetto interrotta: la pagina potrebbe essere cambiata. Riprova sulla pagina attiva."));
      controller.abort();
    };
    options.signal?.addEventListener("abort", cancel, {
      once: true
    });
    timer = setTimeout(cancel, 3000);
  });
  try {
    const box = await Promise.race([request.manager.getBoundingBoxAsync!(request.reference, controller.signal), interrupted]);
    if (!active()) throw new Error("La pagina non e' piu' attiva: misura annullata.");
    return box;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

async function performScriptTransport(request: HmiScriptTransportRequest, options: HmiScriptExecutionOptions): Promise<unknown> {
  if (!options.transport || options.signal?.aborted || options.isActive && !options.isActive()) throw Object.assign(new Error("Contesto non attivo; comando non inviato."), { outcome: "rejected" });
  const timeoutMs = options.transportTimeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 70_000) throw Object.assign(new Error("Timeout del trasporto script non valido."), { outcome: "rejected" });
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel!: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => { controller.abort(); reject(Object.assign(new Error("Attesa trasporto interrotta; un comando inviato non deve essere ripetuto automaticamente."), { outcome: request.kind === "write" ? "uncertain" : "rejected" })); };
    options.signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(cancel, timeoutMs);
  });
  try {
    const operation = request.kind === "read" ? options.transport.read(request, controller.signal) : options.transport.write(request, controller.signal);
    return await Promise.race([operation, interrupted]);
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
}

export async function executeHmiScriptAsync(program: HmiScriptProgram, input: Readonly<Record<string, string>>, options: HmiScriptExecutionOptions = {}): Promise<HmiScriptExecution> {
  await Promise.resolve();
  const clock = { elapsed: 0 };
  options = { ...options, allowAsync: true, suspensionClock: clock };
  const iterator = executeHmiScriptCoroutine(program, input, options);
  let current = iterator.next();
  while (!current.done) {
    const started = Date.now();
    let response: unknown, failure: unknown, failed = false;
    try { response = await (current.value.kind==="screen-box"?performScriptGeometry(current.value,options):performScriptTransport(current.value, options)); }
    catch (caught) { failed = true; failure = caught; }
    finally { clock.elapsed += Date.now() - started; }
    current = failed ? iterator.throw(failure) : iterator.next(response);
  }
  return current.value;
}

/** Il progetto generato non porta con se' Babel: riceve il programma gia' compilato nell'attributo
 * e solo questo piccolo esecutore. Le funzioni sono le stesse usate dai test dell'editor. */
export function hmiScriptRuntimeModuleSource(): string {
  return `// @ts-nocheck\nexport ${String(createHmiScriptScope)}\n${String(isScriptErrorName)}\n${String(staticErrorValue)}\n${String(scriptErrorValue)}\n${String(scriptErrorString)}\n${String(patternNames)}\n${String(staticSpreadArray)}\n${String(staticCallArguments)}\n${String(staticSpreadObject)}\n${String(inspectPatternBindings)}\n${String(staticArrayItems)}\n${String(staticChoice)}\n${String(staticBoundData)}\n${String(updateStaticArray)}\nlet hmiInspectionBudget;\n${String(recordStaticThrow)}\n${String(inspectAssignmentTarget)}\n${String(inspectStaticAssignment)}\n${String(inspectionStep)}\n${String(inspectCallable)}\n${String(inspectInvocation)}\n${String(inspectArrayCallback)}\n${String(walkExpression)}\n${String(staticValues)}\n${String(staticValue)}\n${String(staticTags)}\n${String(bindStaticData)}\n${String(updateStaticMember)}\n${String(staticTag)}\n${String(staticTagSet)}\n${String(staticTagSets)}\n${String(updateStaticTagSet)}\n${String(inspectStatements)}\n${String(inspectModuleVariables)}\n${String(inspectModuleDependencies)}\nexport ${String(inspectHmiScriptProgram)}\nconst normalizeProcessTag = ${String(normalizeMqttTagValue)};\n${String(normalizeHmiProcessValue)}\n${String(normal)}\n${String(isScriptThrown)}\n${String(scriptThrownMessage)}\n${String(undefinedValue)}\n${String(isUndefinedReference)}\n${String(truthy)}\n${String(isTagReference)}\n${String(isTagSetReference)}\n${String(isPopupReference)}\n${String(number)}\n${String(isFunctionReference)}\n${String(scalar)}\n${String(dataKey)}\n${String(isDataReference)}\n${String(checkData)}\n${String(dataGet)}\n${String(dataSet)}\n${String(dataString)}\n${String(dataFromJson)}\n${String(dataJson)}\n${String(dataArrayMethod)}\n${String(mapScriptValues)}\n${String(findScriptValue)}\n${String(dataArrayCallbackMethod)}\n${String(executeHmiScriptCoroutine)}\n${String(performScriptGeometry)}\n${String(performScriptTransport)}\nexport ${String(executeHmiScript)}\nexport ${String(executeHmiScriptAsync)}\n`;
}
