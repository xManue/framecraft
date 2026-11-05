import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';
import MagicString from 'magic-string';
import { hmiScriptFunctions, hmiScriptVariables, hmiScriptGlobalDefinition, type HmiScriptCatalog } from './hmiScriptModules';
import { inspectHmiScript, type HmiScriptProgram, type HmiScriptScalar } from './hmiScript';
import { hmiEventTypes } from './hmiEvents';
const traverse = (traverseModule as unknown as {
  default?: typeof traverseModule;
}).default ?? traverseModule;
const identifier = /^[A-Za-z_$][\w$]*$/;
export type MigrationArgument = {
  kind: 'argument';
  index: number;
} | {
  kind: 'literal';
  value: HmiScriptScalar;
} | {
  kind: 'undefined';
};
export interface ScriptSymbolMigration {
  kind: 'function' | 'variable';
  fromAlias: string;
  fromName: string;
  toAlias: string;
  toName: string;
  arguments?: MigrationArgument[];
}
export interface ScriptReference {
  alias: string;
  name: string;
  start: number;
  end: number;
  line: number;
  column: number;
  use: 'call' | 'reference';
}
export interface ScriptMigrationIssue {
  message: string;
  line: number;
  column: number;
}
export interface ScriptMigrationResult {
  source: string;
  references: ScriptReference[];
  changed: boolean;
  issues: ScriptMigrationIssue[];
}
export interface ScriptMigrationPayload {
  value: unknown;
  changed: boolean;
  references: ScriptReference[];
  issues: ScriptMigrationIssue[];
  recompiled: number;
  previousVersions: number[];
}
function key(alias: string, name: string) {
  return alias + '.' + name;
}
function property(node: t.MemberExpression): string | undefined {
  return !node.computed && t.isIdentifier(node.property) ? node.property.name : node.computed && t.isStringLiteral(node.property) ? node.property.value : undefined;
}
function alias(node: t.Node): string | undefined {
  return t.isMemberExpression(node) && t.isIdentifier(node.object, {
    name: 'Modules'
  }) ? property(node) : undefined;
}
function memberText(source: string, node: t.MemberExpression, choice: ScriptSymbolMigration): string {
  const namespace = node.object as t.MemberExpression,
    code = new MagicString(source.slice(node.start!, node.end!)),
    replace = (part: t.MemberExpression, value: string) => {
      if (property(part) !== value) code.overwrite(part.property.start! - node.start!, part.property.end! - node.start!, part.computed ? JSON.stringify(value) : value);
    };
  replace(namespace, choice.toAlias);
  replace(node, choice.toName);
  return code.toString();
}
function parameters(catalog: HmiScriptCatalog, module: string, name: string): string[] | undefined {
  return catalog.globalModules.find(item => item.alias === module)?.functions.find(fn => fn.name === name)?.parameters;
}
function exported(catalog: HmiScriptCatalog, module: string, name: string): boolean {
  return Boolean(catalog.globalModules.find(item => item.alias === module)?.globalDefinition?.program?.exports?.some(item => item.name === name));
}
export function validateScriptMigrations(before: HmiScriptCatalog, after: HmiScriptCatalog, choices: readonly ScriptSymbolMigration[]): void {
  if (!choices.length || choices.length > 256) throw Error('Scegli da 1 a 256 riferimenti da migrare.');
  const seen = new Set<string>();
  for (const choice of choices) {
    if (!['function', 'variable'].includes(choice.kind) || ![choice.fromAlias, choice.fromName, choice.toAlias, choice.toName].every(value => typeof value === 'string' && value.length <= 128 && identifier.test(value))) throw Error('Alias o nome del riferimento non validi.');
    const name = key(choice.fromAlias, choice.fromName);
    if (seen.has(name)) throw Error('Il riferimento ' + name + ' è stato mappato più volte.');
    seen.add(name);
    if (choice.kind === 'variable') {
      if (choice.arguments !== undefined || !exported(before, choice.fromAlias, choice.fromName) || !exported(after, choice.toAlias, choice.toName)) throw Error('Scegli un export pubblico esistente per ' + name + '.');
      continue;
    }
    const old = parameters(before, choice.fromAlias, choice.fromName),
      next = parameters(after, choice.toAlias, choice.toName);
    if (!old || !next) throw Error('La funzione sorgente o destinazione di ' + name + ' non è disponibile.');
    if (choice.arguments === undefined) {
      if (JSON.stringify(old) !== JSON.stringify(next)) throw Error('Collega esplicitamente tutti i nuovi parametri di ' + name + '.');
      continue;
    }
    if (!Array.isArray(choice.arguments) || choice.arguments.length !== next.length) throw Error('È necessario scegliere un valore per ogni parametro di ' + key(choice.toAlias, choice.toName) + '.');
    for (const argument of choice.arguments) {
      if (argument.kind === 'argument') {
        if (!Number.isInteger(argument.index) || argument.index < 0 || argument.index >= old.length) throw Error('Argomento sorgente non disponibile per ' + name + '.');
      } else if (argument.kind === 'literal') {
        if (argument.value !== null && !['string', 'number', 'boolean'].includes(typeof argument.value) || typeof argument.value === 'number' && !Number.isFinite(argument.value) || typeof argument.value === 'string' && argument.value.length > 20000) throw Error('Il valore fisso deve essere uno scalare finito entro 20.000 caratteri.');
      } else if (argument.kind !== 'undefined') throw Error('Collegamento di parametro non riconosciuto.');
    }
  }
}
function adapter(reference: string, choice: ScriptSymbolMigration, count: number): string {
  const args = Array.from({
    length: count
  }, (_, index) => '__fc_arg_' + index);
  const mapped = choice.arguments!.map(argument => argument.kind === 'argument' ? args[argument.index] : argument.kind === 'undefined' ? 'undefined' : JSON.stringify(argument.value));
  // Module function definitions are immutable in an active Framecraft context. Defer lookup
  // so passive global initializers stay passive; this also avoids a factory invocation.
  const body = 'return ' + reference + '.apply(this, [' + mapped.join(', ') + ']);';
  if (['__proto__', 'prototype', 'constructor', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'].includes(choice.fromName)) return '(function ' + choice.fromName + '(' + args.join(', ') + ') { ' + body + ' })';
  // Logical OR extracts the method value, preserving strict undefined this for direct calls.
  return '(({ ' + JSON.stringify(choice.fromName) + '(' + args.join(', ') + ') { ' + body + ' } })[' + JSON.stringify(choice.fromName) + '] || undefined)';
}

/** No code is executed. Rewrites only actual Modules members, preserving comments and caller argument order. */
export function migrateScriptReferences(source: string, before: HmiScriptCatalog, after: HmiScriptCatalog, choices: readonly ScriptSymbolMigration[]): ScriptMigrationResult {
  validateScriptMigrations(before, after, choices);
  if (source.length > 20000) throw Error('Lo script supera il limite di 20.000 caratteri.');
  const rules = new Map(choices.map(choice => [key(choice.fromAlias, choice.fromName), choice])),
    aliases = new Set(choices.map(choice => choice.fromAlias)),
    references: ScriptReference[] = [],
    issues: ScriptMigrationIssue[] = [],
    edits: {
      start: number;
      end: number;
      value: string;
    }[] = [];
  const ast = parse(source, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true
  });
  traverse(ast, {
    Identifier(path) {
      if (path.node.name === 'Modules' && path.isReferencedIdentifier() && !(path.parentPath.isMemberExpression() && path.parentPath.node.object === path.node)) issues.push({
        message: 'Il namespace Modules viene usato senza un riferimento statico: verifica questo uso prima di migrare.',
        line: path.node.loc?.start.line ?? 1,
        column: (path.node.loc?.start.column ?? 0) + 1
      });
    },
    MemberExpression(path) {
      const node = path.node,
        namespace = alias(node.object),
        name = property(node);
      if (t.isIdentifier(node.object, {
        name: 'Modules'
      })) {
        if (name === undefined || aliases.has(name) && !(t.isMemberExpression(path.parent) && path.parent.object === node)) issues.push({
          message: 'Il namespace Modules viene passato o costruito dinamicamente: verifica questo uso prima di migrare.',
          line: node.loc?.start.line ?? 1,
          column: (node.loc?.start.column ?? 0) + 1
        });
        return;
      }
      if (t.isMemberExpression(node.object) && t.isIdentifier(node.object.object, {
        name: 'Modules'
      }) && namespace === undefined) {
        issues.push({
          message: 'L’alias Modules è dinamico: verifica questo riferimento prima di migrare.',
          line: node.loc?.start.line ?? 1,
          column: (node.loc?.start.column ?? 0) + 1
        });
        return;
      }
      if (namespace === undefined || !aliases.has(namespace)) return;
      if (name === undefined) {
        issues.push({
          message: 'Il membro di Modules.' + namespace + ' è dinamico: non verrà scelto un nome al suo posto.',
          line: node.loc?.start.line ?? 1,
          column: (node.loc?.start.column ?? 0) + 1
        });
        return;
      }
      const choice = rules.get(key(namespace, name));
      if (!choice) return;
      const use = t.isCallExpression(path.parent) && path.parent.callee === node ? 'call' : 'reference';
      references.push({
        alias: namespace,
        name,
        start: node.start!,
        end: node.end!,
        line: node.loc?.start.line ?? 1,
        column: (node.loc?.start.column ?? 0) + 1,
        use
      });
      if (t.isAssignmentExpression(path.parent) && path.parent.left === node || t.isUpdateExpression(path.parent) || t.isUnaryExpression(path.parent, {
        operator: 'delete'
      })) {
        issues.push({
          message: 'Il riferimento pubblico ' + key(namespace, name) + ' viene assegnato o eliminato: correggi prima questa operazione.',
          line: node.loc?.start.line ?? 1,
          column: (node.loc?.start.column ?? 0) + 1
        });
        return;
      }
      if (choice.kind === 'function' && t.isNewExpression(path.parent) && path.parent.callee === node) {
        issues.push({
          message: 'Una funzione di modulo usata come costruttore richiede verifica manuale.',
          line: node.loc?.start.line ?? 1,
          column: (node.loc?.start.column ?? 0) + 1
        });
        return;
      }
      const reference = memberText(source, node, choice),
        old = choice.kind === 'function' ? parameters(before, namespace, name) : undefined;
      const identity = choice.arguments === undefined || choice.arguments.length === old?.length && choice.arguments.every((argument, index) => argument.kind === 'argument' && argument.index === index);
      const value = choice.kind === 'function' && !identity ? adapter(reference, choice, old!.length) : reference;
      if (value !== source.slice(node.start!, node.end!)) edits.push({
        start: node.start!,
        end: node.end!,
        value
      });
    }
  });
  if (issues.length) return {
    source,
    references,
    changed: false,
    issues
  };
  const code = new MagicString(source);
  for (const edit of edits) code.overwrite(edit.start, edit.end, edit.value);
  const result = code.toString();
  if (result.length > 20000) return {
    source,
    references,
    changed: false,
    issues: [{
      message: 'Lo script migrato supera 20.000 caratteri: sposta parte della logica in un modulo prima di procedere.',
      line: 1,
      column: 1
    }]
  };
  return {
    source: result,
    references,
    changed: result !== source,
    issues
  };
}
const events = new Set<string>(hmiEventTypes);
function programReferences(program: unknown, known: Set<string>, found = new Set<string>(), depth = 0): Set<string> {
  if (depth > 128) throw Error('Il programma compilato supera i limiti di profondità.');
  if (!program || typeof program !== 'object') return found;
  const node = program as Record<string, unknown>;
  if (['module-call', 'module-variable'].includes(String(node.kind)) && typeof node.name === 'string' && known.has(node.name)) found.add(node.name);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(item => programReferences(item, known, found, depth + 1));else if (value && typeof value === 'object') programReferences(value, known, found, depth + 1);
  }
  return found;
}
export function scriptMigrationProgramIssues(program: unknown, references: readonly ScriptReference[], choices: readonly ScriptSymbolMigration[]): ScriptMigrationIssue[] {
  const known = new Set(choices.map(choice => 'Modules.' + key(choice.fromAlias, choice.fromName))),
    sourceNames = new Set(references.map(reference => 'Modules.' + key(reference.alias, reference.name)));
  return [...programReferences(program, known)].filter(name => !sourceNames.has(name)).map(name => ({
    message: 'Sorgente e programma compilato non corrispondono per ' + name + '. Ricompila lo script originale prima della migrazione.',
    line: 1,
    column: 1
  }));
}
/** Updates Script/source payloads and recompiles only changed handlers. Other data and legacy programs stay untouched. */
export function migrateScriptPayload(value: unknown, before: HmiScriptCatalog, after: HmiScriptCatalog, choices: readonly ScriptSymbolMigration[], eventBindingsRoot = false, scope?: string): ScriptMigrationPayload {
  validateScriptMigrations(before, after, choices);
  const references: ScriptReference[] = [],
    issues: ScriptMigrationIssue[] = [],
    previousVersions = new Set<number>();
  let recompiled = 0,
    changed = false;
  const walk = (input: unknown, path: string[], depth: number): unknown => {
    if (depth > 64) throw Error('I dati degli eventi superano 64 livelli.');
    if (Array.isArray(input)) return input.map((item, index) => walk(item, [...path, String(index)], depth + 1));
    if (!input || typeof input !== 'object') return input;
    const record = input as Record<string, unknown>,
      output: Record<string, unknown> = Object.create(null);
    for (const [key, item] of Object.entries(record)) output[key] = key === 'program' ? structuredClone(item) : walk(item, [...path, key], depth + 1);
    const event = typeof record.script === 'string' && (events.has(String(record.event)) || eventBindingsRoot && path.length <= 1 || path.includes('eventBindings'));
    const dynamic = record.kind === 'Script' && typeof record.source === 'string',
      field = event ? 'script' : dynamic ? 'source' : undefined;
    if (!field) return output;
    const result = migrateScriptReferences(record[field] as string, before, after, choices);
    references.push(...result.references);
    issues.push(...result.issues);
    issues.push(...scriptMigrationProgramIssues(record.program, result.references, choices));
    if (result.issues.length) return output;
    if (!result.changed && !dynamic) return output;
    if (dynamic && scope === undefined && after.localDefinitions.some(definition => definition.context === 'dynamizations')) {
      issues.push({
        message: 'Serve il contesto della pagina per aggiornare le dipendenze della dinamizzazione: indica lo scope locale prima di migrare.',
        line: 1,
        column: 1
      });
      return output;
    }
    const inspection = dynamic ? inspectHmiScript(result.source, hmiScriptFunctions(after, scope, 'dynamizations'), hmiScriptGlobalDefinition(after, scope, 'dynamizations')?.program, [], hmiScriptVariables(after)) : inspectHmiScript(result.source);
    if (inspection.error || !inspection.program) {
      issues.push({
        message: 'Lo script migrato non è compilabile: ' + (inspection.error ?? 'programma mancante'),
        line: 1,
        column: 1
      });
      return output;
    }
    if (dynamic) {
      const tags = {
        read: inspection.tagsRead,
        written: inspection.tagsWritten
      };
      if (JSON.stringify(tags) !== JSON.stringify(record.scriptTags)) {
        output.scriptTags = tags;
        changed = true;
      }
    }
    if (!result.changed) return output;
    output[field] = result.source;
    output.program = inspection.program;
    const version = (record.program as HmiScriptProgram | undefined)?.version;
    if (typeof version === 'number') previousVersions.add(version);
    recompiled++;
    changed = true;
    return output;
  };
  const migrated = walk(value, [], 0);
  if (issues.length) return {
    value: structuredClone(value),
    changed: false,
    references,
    issues,
    recompiled: 0,
    previousVersions: []
  };
  return {
    value: migrated,
    changed,
    references,
    issues,
    recompiled,
    previousVersions: [...previousVersions].sort((a, b) => a - b)
  };
}
