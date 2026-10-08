import { parse } from "@babel/parser";
import * as t from "@babel/types";

export type HmiScriptScalar = string | number | boolean | null;

export type HmiScriptExpression =
  | { kind: "literal"; value: HmiScriptScalar }
  | { kind: "local"; name: string }
  | { kind: "module-variable"; name: string }
  | { kind: "array"; items: HmiScriptExpression[] }
  | { kind: "object"; entries: { name: string; value: HmiScriptExpression }[] }
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
  | { kind: "timer-set"; mode: "timeout" | "interval"; callback: HmiScriptTimerCallback; delay: HmiScriptExpression };

export type HmiScriptStatement =
  | { kind: "declare"; name: string; value?: HmiScriptExpression; constant?: boolean }
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
  | { kind: "tag-set-promise"; operation: "read" | "write"; set: HmiScriptExpression; mode?: HmiScriptExpression; maxAge?: HmiScriptExpression; qcd?: boolean; success?: { name?: string; statements: HmiScriptStatement[] }; failure?: { name?: string; statements: HmiScriptStatement[] } }
  | { kind: "try"; statements: HmiScriptStatement[]; failure?: { name?: string; statements: HmiScriptStatement[] }; final: HmiScriptStatement[] }
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
  version: 1;
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

export interface HmiScriptScreenItemReference { readonly screenItemId: string; readonly screenPropertyPath?: "Font" }
export interface HmiScriptScreenItemManager {
  resolve(scope: "screen" | "faceplate" | "item", name?: string): HmiScriptScreenItemReference;
  get(reference: HmiScriptScreenItemReference, property: string): HmiScriptScalar | HmiScriptScreenItemReference;
  set(reference: HmiScriptScreenItemReference, property: string, value: HmiScriptScalar): void;
  propertyFlashing(reference: HmiScriptScreenItemReference, args: HmiScriptScalar[]): boolean;
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
interface RuntimeTagStatus { qualityCode: number; timeStamp: string | number; lastError: number; errorDescription: string }
type TagSetState = { names: string[]; pending: Record<string, HmiScriptScalar>; status: Record<string, RuntimeTagStatus>; lastError: number; errorDescription: string };
type TagSetReference = { readonly tagSet: TagSetState };
type DataReference = { readonly data: RuntimeValue[] | Record<string, RuntimeValue> };
type RuntimeValue = HmiScriptScalar | TagReference | TagSetReference | HmiScriptPopupReference | HmiScriptScreenItemReference | DataReference;

export interface HmiScriptScope {
  values: Map<string, RuntimeValue>;
  constants: Set<string>;
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
type ScriptCoroutine<T> = Generator<HmiScriptTransportRequest, T, unknown>;

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
}

const safeCalls = new Set(["Boolean", "Number", "String", "Math.abs", "Math.round", "Math.floor", "Math.ceil", "Math.min", "Math.max", "HMIRuntime.Math.RGB"]);
const forbiddenCalls = new Set(["eval", "Function", "fetch", "setTimeout", "setInterval", "queueMicrotask", "alert", "confirm", "prompt"]);
const binaryOperators = new Set(["+", "-", "*", "/", "%", "**", "==", "!=", "===", "!==", "<", "<=", ">", ">=", "&", "|", "^", "<<", ">>", ">>>", "&&", "||", "??"]);
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

function compileTimerCallback(node: t.CallExpression["arguments"][number] | undefined, label: string): HmiScriptTimerCallback {
  if (node && (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node))) {
    if (node.async || node.generator || node.params.length) fail(`${label} richiede una callback sincrona senza parametri`, node);
    if (!t.isBlockStatement(node.body)) fail(`${label} richiede una callback con blocco { ... }`, node.body);
    return { kind: "inline", program: { version: 1, statements: compileBlock(node.body) } };
  }
  if (node && t.isMemberExpression(node)) {
    const name = dottedName(node);
    if (name && (/^Modules\.[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(name) || /^Local\.[A-Za-z_$][\w$]*$/.test(name))) {
      return { kind: "function", call: { kind: "module-call", name, arguments: [] } };
    }
  }
  fail(`${label} richiede una callback inline oppure il riferimento a una funzione Modules/Local`, node && t.isNode(node) ? node : undefined);
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
  if (!t.isExpression(node)) fail("Espressione non supportata", node);
  const constant = literal(node);
  if (constant) return constant;
  if (t.isArrayExpression(node)) {
    if (node.elements.length > 1024) fail("Un array supera 1024 elementi", node);
    return { kind: "array", items: node.elements.map((item) => item ? compileExpression(item) : { kind: "literal", value: null }) };
  }
  if (t.isObjectExpression(node)) {
    if (node.properties.length > 1024) fail("Un oggetto supera 1024 proprieta'", node);
    return { kind: "object", entries: node.properties.map((item) => {
      if (!t.isObjectProperty(item) || item.computed || !t.isExpression(item.value)) fail("Sono ammesse proprieta' di dati, senza getter, metodi, spread o chiavi calcolate", item);
      const key = t.isIdentifier(item.key) ? item.key.name : t.isStringLiteral(item.key) || t.isNumericLiteral(item.key) ? item.key.value : undefined;
      if (key === undefined) fail("Nome proprieta' non supportato", item);
      return { name: dataKey(key), value: compileExpression(item.value) };
    }) };
  }
  if (t.isIdentifier(node)) {
    if (node.name === "undefined") return { kind: "literal", value: null };
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
  if (t.isCallExpression(node)) {
    const name = dottedName(node.callee);
    if (["Screen.Items", "UI.ActiveScreen.Items", "HMIRuntime.UI.ActiveScreen.Items", "Faceplate.Items"].includes(name ?? "")) {
      return { kind: "screen-item", scope: name === "Faceplate.Items" ? "faceplate" : "screen", name: callArguments(node, 1, name!)[0] };
    }
    if (t.isMemberExpression(node.callee) && memberName(node.callee) === "PropertyFlashing" && t.isExpression(node.callee.object)) {
      if (node.arguments.length < 2 || node.arguments.length > 5 || node.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) fail("PropertyFlashing richiede propertyName, enable e fino a tre parametri opzionali", node);
      return { kind: "property-flashing", item: compileExpression(node.callee.object), arguments: node.arguments.map(compileExpression) };
    }
    if (["JSON.parse", "JSON.stringify", "Object.keys", "Object.values", "Object.entries"].includes(name ?? "")) return { kind: "data-call", name: name!, arguments: callArguments(node, 1, name!) };
    if (name && (/^Modules\.[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(name) || /^Local\.[A-Za-z_$][\w$]*$/.test(name))) {
      if (node.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) fail("Argomenti spread non supportati nelle funzioni HMI", node);
      return { kind: "module-call", name, arguments: node.arguments.map(compileExpression) };
    }
    if (t.isMemberExpression(node.callee) && t.isExpression(node.callee.object) && ["push", "pop", "shift", "unshift", "indexOf", "lastIndexOf", "includes", "slice", "join", "toString", "reverse", "sort", "splice"].includes(memberName(node.callee) ?? "")) {
      if (node.arguments.some((item) => t.isSpreadElement(item) || t.isArgumentPlaceholder(item))) fail("Argomenti spread non supportati", node);
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
    if (t.isIdentifier(node.callee) && !safeCalls.has(node.callee.name) && node.arguments.length === 1 && t.isExpression(node.arguments[0])) {
      return { kind: "tag-set-item", set: { kind: "local", name: node.callee.name }, tag: compileExpression(node.arguments[0]) };
    }
    if (t.isMemberExpression(node.callee) && memberName(node.callee) === "Read" && t.isExpression(node.callee.object)) {
      return { kind: "tag-read", tag: compileExpression(node.callee.object) };
    }
    if (!name || !safeCalls.has(name)) fail(`Chiamata ${name ?? "dinamica"} non ammessa nella sandbox`, node);
    if (node.arguments.some((argument) => t.isSpreadElement(argument) || t.isArgumentPlaceholder(argument))) fail("Argomenti spread non supportati", node);
    return { kind: "call", name, arguments: node.arguments.map(compileExpression) };
  }
  if (t.isMemberExpression(node) && t.isExpression(node.object)) {
    const name = dottedName(node);
    if (name === "UI.ActiveScreen" || name === "HMIRuntime.UI.ActiveScreen") return { kind: "local", name: "Screen" };
    if (name && /^Modules\.[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(name)) return { kind: "module-variable", name };
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

function promiseCallback(node: t.CallExpression["arguments"][number] | undefined, label: string): { name?: string; statements: HmiScriptStatement[] } {
  if (!node || (!t.isFunctionExpression(node) && !t.isArrowFunctionExpression(node)) || node.async || node.generator) {
    fail(`${label} richiede una funzione sincrona`, node && t.isNode(node) ? node : undefined);
  }
  if (node.params.length > 1 || node.params.some((param) => !t.isIdentifier(param))) fail(`${label} accetta al massimo un parametro con nome semplice`, node);
  if (!t.isBlockStatement(node.body)) fail(`${label} richiede un blocco { ... }`, node.body);
  return { ...(node.params[0] && t.isIdentifier(node.params[0]) ? { name: node.params[0].name } : {}), statements: compileBlock(node.body) };
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
  if (t.isMemberExpression(call.callee) && ["push", "pop", "shift", "unshift", "indexOf", "lastIndexOf", "includes", "slice", "join", "toString", "reverse", "sort", "splice"].includes(memberName(call.callee) ?? "")) {
    return { kind: "expression", value: compileExpression(call) };
  }
  fail(`La chiamata ${name ?? "dinamica"} non e' un'azione supportata`, call);
}

function compileBlock(node: t.Statement | t.BlockStatement | null | undefined): HmiScriptStatement[] {
  if (!node) return [];
  const statements = t.isBlockStatement(node) ? node.body : [node];
  const result: HmiScriptStatement[] = [];
  for (const statement of statements) {
    if (t.isEmptyStatement(statement) || t.isBreakStatement(statement)) continue;
    if (t.isVariableDeclaration(statement)) {
      for (const declaration of statement.declarations) {
        if (!t.isIdentifier(declaration.id)) fail("Sono ammesse solo variabili con nome semplice", declaration);
        if (declaration.init && !t.isExpression(declaration.init)) fail("Valore iniziale non supportato", declaration.init);
        result.push({ kind: "declare", name: declaration.id.name, ...(declaration.init ? { value: compileExpression(declaration.init) } : {}), ...(statement.kind === "const" ? { constant: true } : {}) });
      }
      continue;
    }
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
      if (statement.handler?.param && !t.isIdentifier(statement.handler.param)) fail("Il parametro catch deve avere un nome semplice", statement.handler.param);
      const catchName = statement.handler?.param && t.isIdentifier(statement.handler.param) ? statement.handler.param.name : undefined;
      result.push({
        kind: "try",
        statements: compileBlock(statement.block),
        ...(statement.handler ? { failure: { ...(catchName ? { name: catchName } : {}), statements: compileBlock(statement.handler.body) } } : {}),
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
        if (statement.expression.operator !== "=") fail("Sono ammesse solo assegnazioni semplici", statement.expression);
        if (t.isIdentifier(statement.expression.left)) {
          result.push({ kind: "assign", name: statement.expression.left.name, value: compileExpression(statement.expression.right) });
        } else if (t.isMemberExpression(statement.expression.left) && t.isExpression(statement.expression.left.object)) {
          result.push({ kind: "member-set", object: compileExpression(statement.expression.left.object), key: compileMemberKey(statement.expression.left), value: compileExpression(statement.expression.right) });
        } else {
          fail("Sono ammesse assegnazioni a variabili locali o a Value, QualityCode e TimeStamp di una voce TagSet", statement.expression);
        }
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
  const added = ["push", "unshift"].includes(expression.method) ? expression.arguments : expression.method === "splice" ? expression.arguments.slice(2) : [];
  const incoming = added.map((value) => bindStaticData(value, locals));
  for (const target of staticValues(expression.object, locals)) if (target.kind === "array") {
    const array = target as StaticArray;
    const possible = [...new Set([...staticArrayItems(array), ...incoming].flatMap((value) => staticValues(value, locals)))];
    if (possible.length > 1024) throw new Error("Troppi valori possibili nell'ispezione dei dati strutturati.");
    array.possibleItems = possible;
  }
}

function walkExpression(expression: HmiScriptExpression, read: Set<string>, locals: Map<string, HmiScriptExpression>) {
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
  if (expression.kind === "timer-set") walkExpression(expression.delay, read, locals);
}

function staticValues(expression: HmiScriptExpression, locals: Map<string, HmiScriptExpression>, path: Set<HmiScriptExpression> = new Set()): HmiScriptExpression[] {
  if (path.has(expression) || path.size >= 64) return [];
  const next = new Set(path); next.add(expression);
  const resolve = (value: HmiScriptExpression) => staticValues(value, locals, next);
  if (expression.kind === "local" || expression.kind === "module-variable") {
    const binding = locals.get(expression.name);
    return binding ? resolve(binding) : [];
  }
  if (expression.kind === "conditional") return [...new Set([...resolve(expression.consequent), ...resolve(expression.alternate)])];
  if (expression.kind === "member") {
    const keys = resolve(expression.key), known = keys.length && keys.every((key) => key.kind === "literal");
    const names = keys.flatMap((key) => key.kind === "literal" ? [String(key.value)] : []);
    const result: HmiScriptExpression[] = [];
    for (const object of resolve(expression.object)) {
      if (object.kind === "object") {
        for (const entry of object.entries) if (!known || names.includes(entry.name)) result.push(...resolve(entry.value));
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
    const arrays = resolve(expression.object).filter((value): value is StaticArray => value.kind === "array");
    if (["pop", "shift"].includes(expression.method)) return arrays.flatMap((array) => staticArrayItems(array).flatMap(resolve));
    if (["reverse", "sort"].includes(expression.method)) return arrays.map((array) => array.possibleItems ? array : { ...array, possibleItems: [...array.items] });
    if (["slice", "splice"].includes(expression.method)) return arrays.map((array) => ({ ...array, items: [...array.items], possibleItems: [...staticArrayItems(array)] }));
  }
  if (expression.kind === "data-call" && ["Object.values", "Object.entries"].includes(expression.name)) {
    return resolve(expression.arguments[0]).flatMap((value): HmiScriptExpression[] => {
      const entries = value.kind === "object" ? value.entries : value.kind === "array" ? staticArrayItems(value).map((item, index) => ({ name: String(index), value: item })) : [];
      const items: HmiScriptExpression[] = entries.map((entry) => expression.name === "Object.values" ? entry.value : { kind: "array", items: [{ kind: "literal", value: entry.name }, entry.value] });
      return [{ kind: "array", items, ...(value.kind === "array" && (value as StaticArray).possibleItems ? { possibleItems: items } : {}) } as StaticArray];
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
  if (expression.kind === "array") return { ...expression, items: expression.items.map((item) => bindStaticData(item, locals)) };
  if (expression.kind === "object") return { ...expression, entries: expression.entries.map((entry) => ({ ...entry, value: bindStaticData(entry.value, locals) })) };
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

function inspectStatements(statements: readonly HmiScriptStatement[], read: Set<string>, written: Set<string>, locals: Map<string, HmiScriptExpression>, asyncState: { value: boolean }): boolean {
  let hasReturn = false;
  for (const statement of statements) {
    if (statement.kind === "declare" || statement.kind === "assign") {
      if (statement.value) { walkExpression(statement.value, read, locals); locals.set(statement.name, bindStaticData(statement.value, locals)); }
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
      const successLocals = new Map(locals);
      if (statement.success?.name) successLocals.set(statement.success.name, statement.set);
      if (statement.success) hasReturn = inspectStatements(statement.success.statements, read, written, successLocals, asyncState) || hasReturn;
      const failureLocals = new Map(locals);
      if (statement.failure?.name) failureLocals.set(statement.failure.name, { kind: "literal", value: 0 });
      if (statement.failure) hasReturn = inspectStatements(statement.failure.statements, read, written, failureLocals, asyncState) || hasReturn;
    } else if (statement.kind === "bit") {
      walkExpression(statement.tag, read, locals); walkExpression(statement.bit, read, locals);
      const tag = staticTag(statement.tag, locals); if (tag) written.add(tag);
    } else if (statement.kind === "if") {
      walkExpression(statement.test, read, locals);
      const consequentReturn = inspectStatements(statement.consequent, read, written, new Map(locals), asyncState);
      const alternateReturn = inspectStatements(statement.alternate, read, written, new Map(locals), asyncState);
      hasReturn = consequentReturn || alternateReturn || hasReturn;
    } else if (statement.kind === "switch") {
      walkExpression(statement.value, read, locals);
      for (const entry of statement.cases) {
        if (entry.test) walkExpression(entry.test, read, locals);
        hasReturn = inspectStatements(entry.statements, read, written, new Map(locals), asyncState) || hasReturn;
      }
    } else if (statement.kind === "try") {
      hasReturn = inspectStatements(statement.statements, read, written, new Map(locals), asyncState) || hasReturn;
      const failureLocals = new Map(locals);
      if (statement.failure?.name) failureLocals.set(statement.failure.name, { kind: "literal", value: 0 });
      if (statement.failure) hasReturn = inspectStatements(statement.failure.statements, read, written, failureLocals, asyncState) || hasReturn;
      hasReturn = inspectStatements(statement.final, read, written, new Map(locals), asyncState) || hasReturn;
    }
  }
  return hasReturn;
}

function inspectTimerCallbacks(program: HmiScriptProgram, read: Set<string>, written: Set<string>, asyncState: { value: boolean }, locals: Map<string, HmiScriptExpression> = new Map()) {
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (item.kind === "timer-set" && item.callback && typeof item.callback === "object") {
      const callback = item.callback as HmiScriptTimerCallback;
      if (callback.kind === "inline") {
        inspectStatements(callback.program.statements, read, written, new Map(locals), asyncState);
        visit(callback.program);
      }
      return;
    }
    for (const child of Object.values(item)) visit(child);
  };
  visit(program);
}

function inspectModuleVariables(program: HmiScriptProgram, variables: Readonly<Record<string, HmiScriptRuntimeVariable>>, read: Set<string>, written: Set<string>, asyncState: { value: boolean }, bindings: Map<string, HmiScriptExpression> = new Map(), stack: string[] = []): Map<string, HmiScriptExpression> {
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (item.kind === "module-variable" && typeof item.name === "string") {
      const name = item.name;
      if (stack.includes(name)) throw new Error(`Dipendenza ciclica fra variabili pubbliche HMI: ${[...stack, name].join(" -> ")}.`);
      const binding = variables[name];
      if (!binding || !binding.definition.exports?.some((entry) => entry.local === binding.name && name.endsWith(`.${entry.name}`))) throw new Error(`Variabile pubblica HMI ${name} non esportata o modulo non disponibile.`);
      if (bindings.has(name)) return;
      inspectModuleVariables(binding.definition, variables, read, written, asyncState, bindings, [...stack, name]);
      const locals = new Map(bindings);
      inspectStatements(binding.definition.statements, read, written, locals, asyncState);
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
      if (!definition) throw new Error(`Funzione HMI ${item.name} non definita o non importata nel contesto corrente.`);
      if (definition.parameters.length !== item.arguments.length) throw new Error(`${item.name} richiede ${definition.parameters.length} argomenti, ricevuti ${item.arguments.length}.`);
      if (stack.includes(item.name)) throw new Error(`Chiamata ricorsiva non ammessa: ${[...stack, item.name].join(" -> ")}.`);
      for (const tag of definition.tagsRead ?? []) read.add(tag);
      for (const tag of definition.tagsWritten ?? []) written.add(tag);
      if (definition.hasAsync) asyncState.value = true;
      {
        const bindings = variables ? inspectModuleVariables(definition.program, variables, read, written, asyncState) : new Map<string, HmiScriptExpression>();
        const globalDefinition = definition.globalDefinition ?? definition.globalScope?.initializer;
        if (globalDefinition) {
          if (variables) inspectModuleVariables(globalDefinition, variables, read, written, asyncState, bindings);
          inspectStatements(globalDefinition.statements, read, written, bindings, asyncState);
        }
        for (let index = 0; index < definition.parameters.length; index += 1) {
          bindings.set(definition.parameters[index], bindStaticData(item.arguments[index] as HmiScriptExpression, callerLocals));
        }
        inspectStatements(definition.program.statements, read, written, bindings, asyncState);
        inspectTimerCallbacks(definition.program, read, written, asyncState, bindings);
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
  try {
    const read = new Set<string>();
    const written = new Set<string>();
    const asyncState = { value: false };
    const locals = new Map<string, HmiScriptExpression>();
    if (variables) {
      inspectModuleVariables(program, variables, read, written, asyncState, locals);
      if (definition) inspectModuleVariables(definition, variables, read, written, asyncState, locals);
    }
    if (definition) inspectStatements(definition.statements, read, written, locals, asyncState);
    for (const parameter of parameters) locals.set(parameter, { kind: "literal", value: null });
    const hasReturn = inspectStatements(program.statements, read, written, locals, asyncState);
    inspectTimerCallbacks(program, read, written, asyncState, locals);
    if (functions) inspectModuleDependencies(program, functions, read, written, asyncState, [], variables, locals);
    return { tagsRead: [...read], tagsWritten: [...written], hasReturn, hasAsync: asyncState.value, program };
  } catch (caught) {
    return { tagsRead: [], tagsWritten: [], hasReturn: false, hasAsync: false, error: caught instanceof Error ? caught.message : String(caught) };
  }
}

export function inspectHmiScript(source: string, functions?: Readonly<Record<string, HmiScriptRuntimeFunction>>, definition?: HmiScriptProgram, parameters: readonly string[] = [], variables?: Readonly<Record<string, HmiScriptRuntimeVariable>>): HmiScriptInspection {
  if (!source.trim()) return { tagsRead: [], tagsWritten: [], hasReturn: false, hasAsync: false, error: "Lo script e' vuoto." };
  if (source.length > 20_000) return { tagsRead: [], tagsWritten: [], hasReturn: false, hasAsync: false, error: "Lo script supera il limite di 20.000 caratteri." };
  try {
    const file = parse(`async function __framecraftScript() {\n${source}\n}`, { sourceType: "module" });
    const declaration = file.program.body[0];
    if (!t.isFunctionDeclaration(declaration) || !t.isBlockStatement(declaration.body)) fail("Script non leggibile");
    return inspectHmiScriptProgram({ version: 1, statements: compileBlock(declaration.body) }, functions, definition, parameters, variables);
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
          for (const declaration of declarations) if (declaration.kind === "declare") exports.push({ name: declaration.name, local: declaration.name });
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
    return inspectHmiScriptProgram({ version: 1, statements, ...(exports.length ? { exports } : {}) });
  } catch (caught) {
    return { tagsRead: [], tagsWritten: [], hasReturn: false, hasAsync: false, error: caught instanceof Error ? caught.message : String(caught) };
  }
}

function normal(value: string): HmiScriptScalar {
  const trimmed = value.trim();
  if (/^(?:true|yes|on)$/i.test(trimmed)) return true;
  if (/^(?:false|no|off)$/i.test(trimmed)) return false;
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return value;
}

function truthy(value: RuntimeValue): boolean {
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
  if (typeof value === "object" && value !== null) throw new Error("Un riferimento tag non e' un numero.");
  const converted = Number(value);
  if (!Number.isFinite(converted)) throw new Error(`"${String(value)}" non e' un numero.`);
  return converted;
}

function scalar(value: RuntimeValue): HmiScriptScalar {
  if (isDataReference(value)) throw new Error("Un valore strutturato richiede un membro scalare o JSON.stringify(), non puo' essere usato direttamente come valore PLC/proprieta'.");
  if (value && typeof value === "object" && "screenItemId" in value) throw new Error("Un riferimento grafico richiede una proprieta' scalare, per esempio Font.Size, non puo' essere usato come valore PLC/proprieta'.");
  if (typeof value === "object" && value !== null) throw new Error("Lo script sta usando il riferimento a un tag invece del suo valore: aggiungi .Read().");
  return value;
}

function dataKey(value: RuntimeValue): string {
  const key = String(scalar(value) ?? "null");
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
  const entries = Array.isArray(value.data) ? value.data : Object.values(value.data);
  if (entries.length > 1024) throw new Error("Una raccolta dati supera il limite di 1024 elementi.");
  path.add(value);
  for (const item of entries) checkData(item, tick, forbidden, depth + 1, path);
  path.delete(value);
}

function dataGet(value: DataReference, key: string): RuntimeValue {
  if (Array.isArray(value.data)) {
    if (key === "length") return value.data.length;
    if (!/^(?:0|[1-9][0-9]*)$/.test(key)) throw new Error("Un array richiede un indice intero non negativo o length.");
    const index = Number(key);
    if (index >= 1024) throw new Error("Un indice array supera il limite di 1024 elementi.");
    return value.data[index] ?? null;
  }
  return Object.prototype.hasOwnProperty.call(value.data, key) ? value.data[key] : null;
}

function dataSet(target: DataReference, key: string, value: RuntimeValue, tick: () => void) {
  checkData(value, tick, target, 1);
  if (Array.isArray(target.data)) {
    if (key === "length") {
      const length = number(value);
      if (!Number.isInteger(length) || length < 0 || length > 1024) throw new Error("La lunghezza array deve essere tra 0 e 1024.");
      while (target.data.length < length) { tick(); target.data.push(null); }
      target.data.length = length;
    } else {
      if (!/^(?:0|[1-9][0-9]*)$/.test(key)) throw new Error("Un array richiede un indice intero non negativo.");
      const index = Number(key);
      if (index >= 1024) throw new Error("Un indice array supera il limite di 1024 elementi.");
      while (target.data.length <= index) { tick(); target.data.push(null); }
      target.data[index] = value;
    }
  } else {
    if (!Object.prototype.hasOwnProperty.call(target.data, key) && Object.keys(target.data).length >= 1024) throw new Error("Un oggetto supera il limite di 1024 proprieta'.");
    target.data[key] = value;
  }
}

function dataString(value: RuntimeValue, tick: () => void, depth = 0): string {
  tick();
  if (depth >= 32) throw new Error("I dati strutturati superano 32 livelli.");
  if (!isDataReference(value)) return String(scalar(value));
  if (!Array.isArray(value.data)) return "[object Object]";
  const parts = value.data.map((item) => item === null ? "" : dataString(item, tick, depth + 1));
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

function dataJson(value: RuntimeValue, tick: () => void): string {
  checkData(value, tick);
  let length = 0;
  const convert = (item: RuntimeValue, depth: number): unknown => {
    tick();
    if (depth >= 32) throw new Error("I dati JSON superano 32 livelli.");
    let result: unknown;
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
      result = Object.assign(Object.create(null), Object.fromEntries(Object.entries(item.data).map(([key, child]) => {
        length += JSON.stringify(dataKey(key)).length + 2;
        return [key, convert(child, depth + 1)];
      })));
    }
    if (length > 20000) throw new Error("Il JSON supera 20000 caratteri.");
    return result;
  };
  return JSON.stringify(convert(value, 0));
}

function dataArrayMethod(target: RuntimeValue, method: string, args: RuntimeValue[], tick: () => void): RuntimeValue {
  if (!isDataReference(target) || !Array.isArray(target.data)) throw new Error(method + " richiede un array.");
  const array = target.data;
  const count = (minimum: number, maximum: number) => { if (args.length < minimum || args.length > maximum) throw new Error(method + " richiede da " + minimum + " a " + maximum + " argomenti."); };
  const index = (value: RuntimeValue | undefined, fallback: number) => value === undefined ? fallback : Math.trunc(number(value));
  const additions = (items: RuntimeValue[], removed = 0) => {
    if (array.length - removed + items.length > 1024) throw new Error("L'array supera il limite di 1024 elementi.");
    for (const item of items) checkData(item, tick, target, 1);
  };
  tick();
  if (method === "push" || method === "unshift") { additions(args); return method === "push" ? array.push(...args) : array.unshift(...args); }
  if (method === "pop" || method === "shift") { count(0, 0); return (method === "pop" ? array.pop() : array.shift()) ?? null; }
  if (method === "indexOf" || method === "lastIndexOf" || method === "includes") {
    count(1, 2);
    const start = index(args[1], method === "lastIndexOf" ? array.length - 1 : 0);
    return method === "includes" ? array.includes(args[0], start) : method === "indexOf" ? array.indexOf(args[0], start) : array.lastIndexOf(args[0], start);
  }
  if (method === "slice") { count(0, 2); return { data: array.slice(index(args[0], 0), index(args[1], array.length)) }; }
  if (method === "join" || method === "toString") {
    count(0, method === "join" ? 1 : 0);
    const separator = args[0] === undefined ? "," : dataString(args[0], tick);
    const parts = array.map((item) => item === null ? "" : dataString(item, tick));
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

function* executeHmiScriptCoroutine(program: HmiScriptProgram, input: Readonly<Record<string, string>>, options: HmiScriptExecutionOptions = {}): ScriptCoroutine<HmiScriptExecution> {
  const values = { ...input };
  const localScope = options.initializingScope ?? createHmiScriptScope(undefined, options.closureScope ?? options.globalScope);
  const locals = localScope.values;
  for (const [name, value] of Object.entries(options.locals ?? {})) locals.set(name, value);
  const ownerOf = (name: string): HmiScriptScope | undefined => {
    for (let scope: HmiScriptScope | undefined = localScope; scope; scope = scope.parent) {
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
  const faultCode = (caught: unknown): HmiScriptScalar => typeof caught === "object" && caught !== null && "__framecraftHmiFault" in caught
    ? Number((caught as unknown as { code: number }).code)
    : caught instanceof Error ? caught.message : String(caught);
  const faultMessage = (caught: unknown): string => typeof caught === "object" && caught !== null && "__framecraftHmiFault" in caught
    ? String((caught as unknown as { message: string }).message)
    : caught instanceof Error ? caught.message : String(caught);
  let steps = 0;
  const tick = () => {
    if (options.signal?.aborted || options.isActive && !options.isActive()) throw new Error("Il contesto script non e' piu' attivo; nessun nuovo comando viene inviato.");
    for (let scope: HmiScriptScope | undefined = localScope; scope; scope = scope.parent) if (!scope.active) throw new Error("Il contesto script non e' piu' attivo.");
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
      const initialized = (yield* executeHmiScriptCoroutine(scope.initializer, values, { ...options, locals: undefined, globalScope: undefined, closureScope: undefined, initializingScope: scope, maxSteps: Math.max(1, maxSteps - steps), timeoutMs: Math.max(1, timeoutMs - elapsed()) }));
      mergeNested(initialized);
      if (initialized.error) { scope.status = "failed"; scope.error = initialized.error; throw new Error(initialized.error); }
      scope.status = "ready";
    }
  };
  const evaluate = function* (expression: HmiScriptExpression): ScriptCoroutine<RuntimeValue> {
    tick();
    if (expression.kind === "literal") return expression.value;
    if (expression.kind === "local") {
      const owner = ownerOf(expression.name);
      if (!owner && ["Screen", "Faceplate", "item"].includes(expression.name)) {
        if (!options.screenItems) throw new Error("Il contesto corrente non dispone degli oggetti HMI della schermata.");
        return options.screenItems.resolve(expression.name === "Screen" ? "screen" : expression.name === "Faceplate" ? "faceplate" : "item");
      }
      if (!owner) throw new Error(`Variabile locale ${expression.name} non definita.`);
      return owner.values.get(expression.name)!;
    }
    if (expression.kind === "module-variable") {
      const binding = options.variables?.[expression.name];
      if (!binding?.globalScope || !binding.definition.exports?.some((entry) => entry.local === binding.name && expression.name.endsWith(`.${entry.name}`))) throw new Error(`Variabile pubblica HMI ${expression.name} non esportata o modulo non disponibile.`);
      (yield* initializeScope(binding.globalScope));
      if (!binding.globalScope.values.has(binding.name)) throw new Error(`Variabile pubblica HMI ${expression.name} non inizializzata.`);
      return binding.globalScope.values.get(binding.name)!;
    }
    if (expression.kind === "array" || expression.kind === "object") {
      if ((expression.kind === "array" ? expression.items.length : expression.entries.length) > 1024) throw new Error("Una raccolta dati supera il limite di 1024 elementi.");
      const result: DataReference = expression.kind === "array"
        ? { data: (yield* mapScriptValues(expression.items, evaluate)) }
        : { data: Object.assign(Object.create(null), Object.fromEntries((yield* mapScriptValues(expression.entries, function* (item) { return [dataKey(item.name), (yield* evaluate(item.value))]; })))) };
      checkData(result, tick);
      return result;
    }
    if (expression.kind === "array-method") return dataArrayMethod((yield* evaluate(expression.object)), expression.method, (yield* mapScriptValues(expression.arguments, evaluate)), tick);
    if (expression.kind === "screen-item") {
      if (!options.screenItems) throw new Error("Il contesto corrente non dispone degli oggetti HMI della schermata.");
      const name = scalar((yield* evaluate(expression.name)));
      if (typeof name !== "string" || !name.trim() || name.length > 128) throw new Error("Items richiede un nome oggetto HMI non vuoto, fino a 128 caratteri.");
      return options.screenItems.resolve(expression.scope, name);
    }
    if (expression.kind === "property-flashing") {
      if (!options.screenItems) throw new Error("Il contesto corrente non dispone degli oggetti HMI della schermata.");
      const target = (yield* evaluate(expression.item));
      if (!target || typeof target !== "object" || !("screenItemId" in target)) throw new Error("PropertyFlashing richiede un oggetto Screen/Faceplate, non dati o tag.");
      return options.screenItems.propertyFlashing(target, (yield* mapScriptValues(expression.arguments, function* (argument) { return scalar((yield* evaluate(argument))); })));
    }
    if (expression.kind === "data-call") {
      const argument = (yield* evaluate(expression.arguments[0]));
      if (expression.name === "JSON.parse") {
        const text = String(scalar(argument) ?? "null");
        if (text.length > 20000) throw new Error("Il JSON supera 20000 caratteri.");
        return dataFromJson(JSON.parse(text), tick);
      }
      if (expression.name === "JSON.stringify") return dataJson(argument, tick);
      if (!isDataReference(argument)) throw new Error(expression.name + " richiede un oggetto o un array di dati.");
      const entries = Object.entries(argument.data);
      return { data: expression.name === "Object.keys" ? entries.map(([key]) => key)
        : expression.name === "Object.values" ? entries.map(([, value]) => value)
          : entries.map(([key, value]) => ({ data: [key, value] })) };
    }
    if (expression.kind === "member") {
      const object = (yield* evaluate(expression.object)), key = dataKey((yield* evaluate(expression.key)));
      if (isDataReference(object)) return dataGet(object, key);
      if (object && typeof object === "object" && "screenItemId" in object) {
        if (!options.screenItems) throw new Error("Il contesto corrente non dispone degli oggetti HMI della schermata.");
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
      const value = (yield* evaluate(expression.value));
      if (expression.operator === "typeof" && typeof value === "object") return "object";
      if (expression.operator === "!") return !truthy(value);
      if (expression.operator === "+") return number(value);
      if (expression.operator === "-") return -number(value);
      if (expression.operator === "~") return ~number(value);
      return typeof scalar(value);
    }
    if (expression.kind === "conditional") return (yield* evaluate(truthy((yield* evaluate(expression.test))) ? expression.consequent : expression.alternate));
    if (expression.kind === "call") {
      const args = (yield* mapScriptValues(expression.arguments, evaluate));
      const first = args[0];
      if (expression.name === "Boolean") return truthy(first);
      if (expression.name === "Number") return number(first);
      if (expression.name === "String") return isDataReference(first) ? dataString(first, tick) : String(scalar(first));
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
      if (!definition) throw new Error(`Funzione HMI ${expression.name} non definita o non importata nel contesto corrente.`);
      if (definition.parameters.length !== expression.arguments.length) {
        throw new Error(`${expression.name} richiede ${definition.parameters.length} argomenti, ricevuti ${expression.arguments.length}.`);
      }
      const stack = options.callStack ?? [];
      if (stack.includes(expression.name)) throw new Error(`Chiamata ricorsiva non ammessa: ${[...stack, expression.name].join(" -> ")}.`);
      if (stack.length >= 16) throw new Error("Troppi livelli di chiamata fra funzioni HMI.");
      const args = (yield* mapScriptValues(expression.arguments, evaluate));
      const nested = (yield* executeHmiScriptCoroutine(definition.program, values, {
        ...options,
        maxSteps: Math.max(1, maxSteps - steps),
        timeoutMs: Math.max(1, timeoutMs - elapsed()),
        locals: Object.fromEntries(definition.parameters.map((parameter, index) => [parameter, args[index] ?? null])),
        globalScope: definition.globalScope,
        closureScope: undefined,
        initializingScope: undefined,
        tagStatus: { ...options.tagStatus, ...statusByTag },
        callStack: [...stack, expression.name],
        returnByReference: true,
      }));
      mergeNested(nested);
      if (nested.error) throw new Error(`${expression.name}: ${nested.error}`);
      return "returnedReference" in nested ? nested.returnedReference ?? null : "returned" in nested ? nested.returned ?? null : null;
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
        parentBound: expression.scope === "faceplate" ? !truthy(expression.independentWindow ? (yield* evaluate(expression.independentWindow)) : false) : expression.parentBound,
        invisible: expression.invisible ? truthy((yield* evaluate(expression.invisible))) : false,
        ...(popupWindowName ? { popupWindowName } : {}),
        adaptWindow: expression.adaptWindow ? truthy((yield* evaluate(expression.adaptWindow))) : true,
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
      const delay = number((yield* evaluate(expression.delay)));
      if (!Number.isInteger(delay) || delay < 0 || delay > 0xffffffff) throw new Error("Il ritardo del timer deve essere un UInt32 in millisecondi.");
      if (!options.timerManager) throw new Error("Il contesto corrente non dispone di un gestore timer.");
      return options.timerManager.set(expression.mode, expression.callback, delay, { functions: options.functions, variables: options.variables, globalScope: options.globalScope, screenItems: options.screenItems, transport: options.transport, transportTimeoutMs: options.transportTimeoutMs, localTags: options.localTags, localTagValues: options.localTagValues, signal: options.signal, isActive: options.isActive, ...(expression.callback.kind === "inline" ? { closureScope: localScope } : {}) });
    }
    const left = (yield* evaluate(expression.left));
    if (expression.operator === "&&" && !truthy(left)) return false;
    if (expression.operator === "||" && truthy(left)) return true;
    if (expression.operator === "??" && left !== null) return left;
    const right = (yield* evaluate(expression.right));
    switch (expression.operator) {
      case "&&": return truthy(right);
      case "||": case "??": return right;
      case "==": return scalar(left) == scalar(right); // semantica JavaScript esplicitamente richiesta dallo script
      case "!=": return scalar(left) != scalar(right);
      case "===": return left === right;
      case "!==": return left !== right;
      case "<": return number(left) < number(right);
      case "<=": return number(left) <= number(right);
      case ">": return number(left) > number(right);
      case ">=": return number(left) >= number(right);
      case "+": return typeof scalar(left) === "string" || typeof scalar(right) === "string" ? `${String(scalar(left))}${String(scalar(right))}` : number(left) + number(right);
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
  type Flow = { returned: true; value?: RuntimeValue } | undefined;
  const run = function* (statements: readonly HmiScriptStatement[]): ScriptCoroutine<Flow> {
    for (const statement of statements) {
      tick();
      if (statement.kind === "declare") {
        locals.set(statement.name, statement.value ? (yield* evaluate(statement.value)) : null);
        if (statement.constant) localScope.constants.add(statement.name);
      }
      else if (statement.kind === "assign") {
        const owner = ownerOf(statement.name);
        if (!owner) throw new Error(`Variabile locale ${statement.name} non definita.`);
        if (owner.constants.has(statement.name)) throw new Error(`La costante ${statement.name} non puo' essere riassegnata.`);
        owner.values.set(statement.name, (yield* evaluate(statement.value)));
      } else if (statement.kind === "member-set") {
        const object = (yield* evaluate(statement.object)), key = dataKey((yield* evaluate(statement.key))), value = (yield* evaluate(statement.value));
        if (isDataReference(object)) dataSet(object, key, value, tick);
        else if (object && typeof object === "object" && "screenItemId" in object) {
          if (!options.screenItems) throw new Error("Il contesto corrente non dispone degli oggetti HMI della schermata.");
          options.screenItems.set(object, key, scalar(value));
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
            if (statement.success.name) locals.set(statement.success.name, target);
            (yield* run(statement.success.statements));
            if (statement.success.name) locals.delete(statement.success.name);
          }
        } catch (caught) {
          if (!statement.failure) throw caught;
          if (statement.failure.name) locals.set(statement.failure.name, faultCode(caught));
          (yield* run(statement.failure.statements));
          if (statement.failure.name) locals.delete(statement.failure.name);
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
        const flow = (yield* run(truthy((yield* evaluate(statement.test))) ? statement.consequent : statement.alternate));
        if (flow) return flow;
      } else if (statement.kind === "switch") {
        const value = scalar((yield* evaluate(statement.value)));
        const entry = (yield* findScriptValue(statement.cases, function* (candidate) { return candidate.test && scalar((yield* evaluate(candidate.test))) === value; }))
          ?? statement.cases.find((candidate) => !candidate.test);
        if (entry) { const flow = (yield* run(entry.statements)); if (flow) return flow; }
      } else if (statement.kind === "try") {
        let flow: Flow;
        try {
          try {
            flow = (yield* run(statement.statements));
          } catch (caught) {
            if (!statement.failure) throw caught;
            if (statement.failure.name) locals.set(statement.failure.name, faultCode(caught));
            try { flow = (yield* run(statement.failure.statements)); }
            finally { if (statement.failure.name) locals.delete(statement.failure.name); }
          }
        } finally {
          const finalFlow = (yield* run(statement.final));
          if (finalFlow) return finalFlow;
        }
        if (flow) return flow;
      }
    }
    return undefined;
  };
  try {
    for (let scope = localScope.parent; scope; scope = scope.parent) {
      (yield* initializeScope(scope));
    }
    if (!localScope.active) throw new Error("Il contesto script non e' piu' attivo.");
    const flow = (yield* run(program.statements));
    return { ...(flow?.returned && flow.value !== undefined ? options.returnByReference ? { returnedReference: flow.value } : { returned: scalar(flow.value) } : {}), writes, traces, navigation, operatorMessages, faceplateEvents, tagStatus: { ...statusByTag }, steps, ...(options.transport ? { reads, commands } : {}) };
  } catch (caught) {
    return { writes, traces, navigation, operatorMessages, faceplateEvents, tagStatus: { ...statusByTag }, steps, error: faultMessage(caught), ...(options.transport ? { reads, commands } : {}) };
  }
}

export function executeHmiScript(program: HmiScriptProgram, input: Readonly<Record<string, string>>, options: HmiScriptExecutionOptions = {}): HmiScriptExecution {
  const iterator = executeHmiScriptCoroutine(program, input, options);
  let current = iterator.next();
  while (!current.done) current = iterator.throw(Object.assign(new Error("Il trasporto PLC richiede executeHmiScriptAsync(); nessun comando inviato."), { outcome: "rejected" }));
  return current.value;
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
    try { response = await performScriptTransport(current.value, options); }
    catch (caught) { failed = true; failure = caught; }
    finally { clock.elapsed += Date.now() - started; }
    current = failed ? iterator.throw(failure) : iterator.next(response);
  }
  return current.value;
}

/** Il progetto generato non porta con se' Babel: riceve il programma gia' compilato nell'attributo
 * e solo questo piccolo esecutore. Le funzioni sono le stesse usate dai test dell'editor. */
export function hmiScriptRuntimeModuleSource(): string {
  return `// @ts-nocheck\nexport ${String(createHmiScriptScope)}\n${String(staticArrayItems)}\n${String(staticChoice)}\n${String(staticBoundData)}\n${String(updateStaticArray)}\n${String(walkExpression)}\n${String(staticValues)}\n${String(staticValue)}\n${String(staticTags)}\n${String(bindStaticData)}\n${String(updateStaticMember)}\n${String(staticTag)}\n${String(staticTagSet)}\n${String(staticTagSets)}\n${String(updateStaticTagSet)}\n${String(inspectStatements)}\n${String(inspectTimerCallbacks)}\n${String(inspectModuleVariables)}\n${String(inspectModuleDependencies)}\nexport ${String(inspectHmiScriptProgram)}\n${String(normal)}\n${String(truthy)}\n${String(isTagReference)}\n${String(isTagSetReference)}\n${String(isPopupReference)}\n${String(number)}\n${String(scalar)}\n${String(dataKey)}\n${String(isDataReference)}\n${String(checkData)}\n${String(dataGet)}\n${String(dataSet)}\n${String(dataString)}\n${String(dataFromJson)}\n${String(dataJson)}\n${String(dataArrayMethod)}\n${String(mapScriptValues)}\n${String(findScriptValue)}\n${String(executeHmiScriptCoroutine)}\n${String(performScriptTransport)}\nexport ${String(executeHmiScript)}\nexport ${String(executeHmiScriptAsync)}\n`;
}
