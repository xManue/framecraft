import { parse } from '@babel/parser';
import traverseModule, { type Scope, type Binding, type NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { parse as parseHtml, type DefaultTreeAdapterMap } from 'parse5';
import MagicString from 'magic-string';
import type { HmiScriptCatalog } from './hmiScriptModules';
import { migrateScriptPayload, validateScriptMigrations, type ScriptSymbolMigration, type ScriptReference } from './scriptReferenceMigration';
const traverse = (traverseModule as unknown as {
  default?: typeof traverseModule;
}).default ?? traverseModule;
const attributes = new Set(['data-hmi-events', 'data-hmi-dynamizations', 'data-hmi-faceplate']);
const datasetNames: Record<string, string> = {
  hmiEvents: 'data-hmi-events',
  hmiDynamizations: 'data-hmi-dynamizations',
  hmiFaceplate: 'data-hmi-faceplate'
};
export interface MigrationFileChange {
  path: string;
  before: string;
  after: string;
}
export interface MigrationDocumentIssue {
  path: string;
  line: number;
  message: string;
}
export interface MigrationDocumentResult {
  changes: MigrationFileChange[];
  issues: MigrationDocumentIssue[];
  references: (ScriptReference & {
    path: string;
    bindingLine: number;
  })[];
  recompiled: number;
  previousVersions: number[];
}
class MissingExport extends Error {}
interface Descriptor {
  value: unknown;
  patch(value: unknown): void;
  replace(value: unknown): void;
  child?(name: string): Descriptor;
}
interface JsDocument {
  key: string;
  file: string;
  source: string;
  offset: number;
  ast: t.File;
  scopes: WeakMap<t.Node, Scope>;
}
interface Edit {
  start: number;
  end: number;
  value: string;
}
interface JsonDocument {
  before: string;
  value: unknown;
  patches: Map<string, {
    path: string[];
    value: unknown;
  }>;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const safeKey = (name: string) => !['__proto__', 'prototype', 'constructor'].includes(name);
const memberKey = (node: t.MemberExpression) => !node.computed && t.isIdentifier(node.property) ? node.property.name : node.computed && (t.isStringLiteral(node.property) || t.isNumericLiteral(node.property)) ? String(node.property.value) : undefined;
const propertyKey = (node: t.ObjectProperty) => !node.computed && t.isIdentifier(node.key) ? node.key.name : t.isStringLiteral(node.key) || t.isNumericLiteral(node.key) ? String(node.key.value) : undefined;
const unwrap = (node: t.Node): t.Node => t.isTSAsExpression(node) || t.isTSSatisfiesExpression(node) || t.isTSNonNullExpression(node) || t.isTypeCastExpression(node) ? unwrap(node.expression) : node;
/** Pure project-source planning. Unsupported producers block the complete result; no source is executed. */
export function migrateHmiDocuments(sources: Readonly<Record<string, string>>, before: HmiScriptCatalog, after: HmiScriptCatalog, choices: readonly ScriptSymbolMigration[], options: {
  ignoreFiles?: readonly string[];
  scopes?: Readonly<Record<string, string | readonly string[]>>;
} = {}): MigrationDocumentResult {
  validateScriptMigrations(before, after, choices);
  const issues: MigrationDocumentIssue[] = [],
    references: MigrationDocumentResult['references'] = [],
    edits = new Map<string, Edit[]>(),
    json = new Map<string, JsonDocument>(),
    documents = new Map<string, JsDocument>(),
    ignored = new Set(options.ignoreFiles ?? []),
    versions = new Set<number>();
  let recompiled = 0;
  const issue = (file: string, line: number, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!issues.some(item => item.path === file && item.line === line && item.message === message)) issues.push({
      path: file,
      line,
      message
    });
  };
  const add = (file: string, start: number, end: number, value: string) => {
    if (sources[file] === undefined || start < 0 || end < start || end > sources[file].length) throw Error('Posizione del sorgente non valida.');
    const rows = edits.get(file) ?? [];
    for (const item of rows) if (start < item.end && end > item.start || start === end && item.start === start && item.end === end) {
      if (start === item.start && end === item.end && value === item.value) return;
      throw Error('Lo stesso dato è condiviso con modifiche incompatibili: separa le configurazioni prima di migrare.');
    }
    rows.push({
      start,
      end,
      value
    });
    edits.set(file, rows);
  };
  const loadJs = (file: string, source: string, offset = 0, key = file) => {
    try {
      const ast = parse(source, {
          sourceType: 'unambiguous',
          allowReturnOutsideFunction: true,
          plugins: ['jsx', ['typescript', {
            dts: /\.d\.[cm]?ts$/.test(file)
          }], 'decorators-legacy']
        }),
        scopes = new WeakMap<t.Node, Scope>();
      traverse(ast, {
        enter(path) {
          scopes.set(path.node, path.scope);
        }
      });
      const document = {
        key,
        file,
        source,
        offset,
        ast,
        scopes
      };
      documents.set(key, document);
      return document;
    } catch (error) {
      issue(file, 1, 'Il sorgente non è analizzabile: ' + (error instanceof Error ? error.message : 'sintassi non valida'));
      return undefined;
    }
  };
  const line = (doc: JsDocument, node: t.Node) => 1 + sources[doc.file].slice(0, doc.offset + (node.start ?? 0)).split('\n').length - 1;
  const prefix = (a: string[], b: string[]) => a.length <= b.length && a.every((part, index) => part === b[index]);
  const at = (root: unknown, path: string[]) => {
    let value = root;
    for (const name of path) {
      if (!value || typeof value !== 'object') return undefined;
      value = (value as Record<string, unknown>)[name];
    }
    return value;
  };
  const jsonDescriptor = (file: string, path: string[] = []): Descriptor => {
    let document = json.get(file);
    if (!document) {
      const value = JSON.parse(sources[file]);
      document = {
        before: sources[file],
        value,
        patches: new Map()
      };
      json.set(file, document);
    }
    const value = at(document.value, path),
      patch = (next: unknown) => {
        for (const row of document!.patches.values()) {
          if (prefix(row.path, path) && !same(at(row.value, path.slice(row.path.length)), next) || prefix(path, row.path) && !same(at(next, row.path.slice(path.length)), row.value)) throw Error('Il JSON condiviso richiede modifiche incompatibili.');
        }
        document!.patches.set(JSON.stringify(path), {
          path,
          value: structuredClone(next)
        });
      };
    return {
      value,
      patch,
      replace: patch,
      child: name => {
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, name)) throw Error('Proprietà JSON non disponibile: ' + name);
        return jsonDescriptor(file, [...path, name]);
      }
    };
  };
  const resolvedFile = (from: string, specifier: string): string => {
    const [name, query] = specifier.split('?');
    if (query && query !== 'raw') throw Error('L’importazione usa un formato non analizzabile: ' + specifier);
    let parts: string[];
    if (name.startsWith('.')) parts = from.split('/').slice(0, -1);else if (name.startsWith('/')) parts = [];else throw Error('L’importazione ' + specifier + ' richiede la risoluzione di un alias o di una dipendenza esterna.');
    for (const part of name.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!parts.length) throw Error('La dipendenza è fuori dal progetto.');
        parts.pop();
      } else parts.push(part);
    }
    const base = parts.join('/'),
      candidates = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'].map(ext => base + ext)].filter(file => Object.hasOwn(sources, file));
    if (candidates.length !== 1) throw Error(candidates.length ? 'Importazione ambigua: ' + specifier : 'Dipendenza non disponibile nel progetto: ' + specifier);
    return candidates[0];
  };
  const audited = new Set<Binding>(),
    auditing = new Set<Binding>(),
    consumerChecks = new Set<string>();
  const readCall = (path: NodePath<t.CallExpression>, value: t.Node) => {
    const node = path.node,
      callee = node.callee;
    if (node.arguments[0] !== value || node.arguments.length !== 1 || !t.isMemberExpression(callee) || !t.isIdentifier(callee.object) || path.scope.getBinding(callee.object.name)) return false;
    return callee.object.name === 'JSON' && memberKey(callee) === 'stringify';
  };
  const consumers = (file: string, name: string) => {
    const key = file + '#' + name;
    if (consumerChecks.has(key)) return;
    consumerChecks.add(key);
    for (const doc of documents.values()) for (const statement of doc.ast.program.body) {
      if (!(t.isImportDeclaration(statement) || t.isExportNamedDeclaration(statement) || t.isExportAllDeclaration(statement)) || !statement.source) continue;
      let target: string;
      try {
        target = resolvedFile(doc.file, statement.source.value);
      } catch {
        continue;
      }
      if (target !== file) continue;
      if (t.isImportDeclaration(statement)) for (const specifier of statement.specifiers) {
        const imported = t.isImportDefaultSpecifier(specifier) ? 'default' : t.isImportSpecifier(specifier) ? t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value : undefined;
        const binding = doc.scopes.get(specifier)?.getBinding(specifier.local.name);
        if (!binding) continue;
        if (imported === name || file.endsWith('.json')) audit(binding);else if (t.isImportNamespaceSpecifier(specifier)) for (const reference of binding.referencePaths) {
          const parent = reference.parentPath;
          if (!parent?.isMemberExpression() || parent.node.object !== reference.node) throw Error('Un namespace importato viene passato senza selezionare un export: ' + doc.file + '.');
          const member = memberKey(parent.node);
          if (member === undefined) throw Error('Un export importato è selezionato dinamicamente: ' + doc.file + '.');
          if (member === name) auditUse(parent);
        }
      } else if (t.isExportAllDeclaration(statement)) consumers(doc.file, name);else for (const specifier of statement.specifiers) if (t.isExportSpecifier(specifier) && specifier.local.name === name) consumers(doc.file, t.isIdentifier(specifier.exported) ? specifier.exported.name : specifier.exported.value);
    }
  };
  const auditUse = (reference: NodePath) => {
    if (reference.isExportNamedDeclaration()) return;
    let path = reference;
    for (;;) {
      const parent = path.parentPath;
      if (!parent) break;
      if (parent.isTSAsExpression() || parent.isTSSatisfiesExpression() || parent.isTSNonNullExpression() || parent.isTypeCastExpression() || parent.isMemberExpression() && parent.node.object === path.node) {
        path = parent;
        continue;
      }
      if (parent.isObjectProperty() && parent.node.value === path.node) {
        if (attributes.has(propertyKey(parent.node) ?? '')) return;
        path = parent;
        continue;
      }
      if (parent.isObjectExpression() || parent.isArrayExpression()) {
        path = parent;
        continue;
      }
      break;
    }
    const parent = path.parentPath;
    if (!parent) return;
    const doc = [...documents.values()].find(item => item.scopes.has(reference.node)),
      where = doc ? ' in ' + doc.file + ':' + line(doc, reference.node) : '';
    if (parent.isAssignmentExpression() && parent.node.left === path.node || parent.isUpdateExpression() || parent.isUnaryExpression({
      operator: 'delete'
    })) throw Error('Il dato degli eventi viene modificato dopo la creazione' + where + '.');
    if (parent.isVariableDeclarator() && parent.node.init === path.node) {
      if (!t.isIdentifier(parent.node.id)) throw Error('Un alias destrutturato richiede verifica manuale' + where + '.');
      const other = parent.scope.getBinding(parent.node.id.name);
      if (other) audit(other);
      return;
    }
    if (parent.isJSXSpreadAttribute()) {
      const opening = parent.parentPath;
      if (opening?.isJSXOpeningElement() && t.isJSXIdentifier(opening.node.name) && /^[a-z]/.test(opening.node.name.name)) return;
    }
    if (parent.isJSXExpressionContainer() && parent.parentPath?.isJSXAttribute() && t.isJSXIdentifier(parent.parentPath.node.name) && attributes.has(parent.parentPath.node.name.name)) return;
    if (parent.isCallExpression()) {
      if (readCall(parent, path.node)) {
        auditUse(parent);
        return;
      }
      const callee = parent.node.callee;
      if (t.isMemberExpression(callee) && memberKey(callee) === 'setAttribute' && t.isStringLiteral(parent.node.arguments[0]) && attributes.has(parent.node.arguments[0].value) && parent.node.arguments[1] === path.node) return;
      throw Error('Un’altra funzione può modificare la configurazione condivisa' + where + '.');
    }
    if (parent.isExportSpecifier()) return;
    if (parent.isExportDefaultDeclaration()) {
      if (doc) consumers(doc.file, 'default');
      return;
    }
    if (parent.isAssignmentExpression() && parent.node.right === path.node) {
      const left = parent.node.left;
      if (t.isMemberExpression(left) && t.isMemberExpression(left.object) && memberKey(left.object) === 'dataset' && datasetNames[memberKey(left) ?? '']) return;
    }
    if (parent.isExpressionStatement() || parent.isUnaryExpression() && ['typeof', 'void', '!'].includes(parent.node.operator)) return;
    throw Error('La configurazione condivisa esce dal contesto statico' + where + ': verifica questo uso prima di migrare.');
  };
  const audit = (binding: Binding) => {
    if (audited.has(binding) || auditing.has(binding)) return;
    auditing.add(binding);
    try {
      if (!binding.constant || binding.constantViolations.length) throw Error('Il dato degli eventi viene riassegnato: usa una configurazione statica o migra manualmente questo produttore.');
      for (const reference of binding.referencePaths) auditUse(reference);
      const doc = [...documents.values()].find(item => item.scopes.has(binding.path.node));
      if (doc) {
        if (binding.path.parentPath?.parentPath?.isExportNamedDeclaration()) consumers(doc.file, binding.identifier.name);
        for (const statement of doc.ast.program.body) {
          if (t.isExportDefaultDeclaration(statement) && t.isIdentifier(statement.declaration, {
            name: binding.identifier.name
          })) consumers(doc.file, 'default');
          if (t.isExportNamedDeclaration(statement) && !statement.source) for (const specifier of statement.specifiers) if (t.isExportSpecifier(specifier) && specifier.local.name === binding.identifier.name) consumers(doc.file, t.isIdentifier(specifier.exported) ? specifier.exported.name : specifier.exported.value);
        }
      }
      audited.add(binding);
    } finally {
      auditing.delete(binding);
    }
  };
  const descriptors = new Map<t.Node, Descriptor>(),
    resolving = new Set<t.Node>();
  const exportValue = (file: string, name: string, seen = new Set<string>()): Descriptor => {
    const id = file + '#' + name;
    if (seen.has(id)) throw Error('La dipendenza degli eventi è ciclica.');
    const next = new Set(seen);
    next.add(id);
    consumers(file, name);
    if (file.endsWith('.json')) {
      const root = jsonDescriptor(file);
      if (name === 'default') return root;
      if (!root.value || typeof root.value !== 'object' || !Object.hasOwn(root.value, name)) throw new MissingExport('Export JSON non disponibile: ' + name);
      return root.child!(name);
    }
    const doc = documents.get(file);
    if (!doc) throw Error('Sorgente importato non analizzabile: ' + file);
    for (const statement of doc.ast.program.body) {
      if (t.isExportDefaultDeclaration(statement) && name === 'default') return resolve(doc, statement.declaration);
      if (t.isExportNamedDeclaration(statement)) {
        if (t.isVariableDeclaration(statement.declaration)) for (const declaration of statement.declaration.declarations) if (t.isIdentifier(declaration.id, {
          name
        }) && declaration.init) return resolve(doc, declaration.id);
        for (const specifier of statement.specifiers) if (t.isExportSpecifier(specifier) && (t.isIdentifier(specifier.exported) ? specifier.exported.name : specifier.exported.value) === name) {
          if (statement.source) return exportValue(resolvedFile(file, statement.source.value), specifier.local.name, next);
          return resolve(doc, specifier.local);
        }
      }
    }
    const candidates: Descriptor[] = [];
    for (const statement of doc.ast.program.body) if (name !== 'default' && t.isExportAllDeclaration(statement)) {
      try {
        candidates.push(exportValue(resolvedFile(file, statement.source.value), name, next));
      } catch (error) {
        if (!(error instanceof MissingExport)) throw error;
      }
    }
    if (candidates.length === 1) return candidates[0];
    if (!candidates.length) throw new MissingExport('Export statico non disponibile: ' + name + ' in ' + file);
    throw Error('Export statico ambiguo: ' + name + ' in ' + file);
  };
  const namespace = (doc: JsDocument, node: t.Node): {
    file: string;
    raw: boolean;
  } | undefined => {
    if (!t.isIdentifier(node)) return;
    const binding = doc.scopes.get(node)?.getBinding(node.name);
    if (!binding || !binding.path.isImportNamespaceSpecifier()) return;
    const declaration = binding.path.parentPath;
    if (!declaration?.isImportDeclaration()) return;
    return {
      file: resolvedFile(doc.file, declaration.node.source.value),
      raw: false
    };
  };
  const resolve = (doc: JsDocument, original: t.Node): Descriptor => {
    const node = unwrap(original),
      cached = descriptors.get(node);
    if (cached) return cached;
    if (resolving.has(node)) throw Error('La configurazione degli eventi è ciclica.');
    resolving.add(node);
    const replace = (value: unknown) => add(doc.file, doc.offset + node.start!, doc.offset + node.end!, JSON.stringify(value));
    try {
      let result: Descriptor;
      if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node)) {
        const value = t.isNullLiteral(node) ? null : node.value;
        result = {
          value,
          patch: replace,
          replace
        };
      } else if (t.isTemplateLiteral(node) && !node.expressions.length) {
        result = {
          value: node.quasis[0].value.cooked ?? '',
          patch: replace,
          replace
        };
      } else if (t.isIdentifier(node)) {
        const binding = doc.scopes.get(node)?.getBinding(node.name);
        if (!binding) throw Error('La configurazione dipende da un valore non statico: ' + node.name);
        audit(binding);
        if (binding.path.isVariableDeclarator() && binding.path.node.init) result = resolve(doc, binding.path.node.init);else if (binding.path.isImportSpecifier() || binding.path.isImportDefaultSpecifier()) {
          const declaration = binding.path.parentPath;
          if (!declaration?.isImportDeclaration()) throw Error('Importazione non riconosciuta.');
          const file = resolvedFile(doc.file, declaration.node.source.value);
          if (declaration.node.source.value.endsWith('?raw')) {
            result = {
              value: sources[file],
              patch: value => {
                if (typeof value !== 'string') throw Error('Il file raw deve restare testo.');
                add(file, 0, sources[file].length, value);
              },
              replace: value => {
                if (typeof value !== 'string') throw Error('Il file raw deve restare testo.');
                add(file, 0, sources[file].length, value);
              }
            };
          } else result = exportValue(file, binding.path.isImportDefaultSpecifier() ? 'default' : t.isIdentifier(binding.path.node.imported) ? binding.path.node.imported.name : binding.path.node.imported.value);
        } else throw Error('Il dato degli eventi dipende da parametri o stato runtime.');
      } else if (t.isMemberExpression(node)) {
        const name = memberKey(node);
        if (name === undefined || !safeKey(name)) throw Error('La proprietà della configurazione è dinamica o non disponibile.');
        const imported = namespace(doc, node.object);
        result = imported ? exportValue(imported.file, name) : resolve(doc, node.object).child?.(name) ?? (() => {
          throw Error('La proprietà non è una configurazione statica.');
        })();
      } else if (t.isArrayExpression(node)) {
        if (node.elements.some(item => !item || t.isSpreadElement(item))) throw Error('Una raccolta degli eventi con buchi o spread richiede verifica manuale.');
        const children = node.elements.map(item => resolve(doc, item!));
        result = {
          value: children.map(item => item.value),
          replace,
          patch: value => {
            if (!Array.isArray(value) || value.length !== children.length) {
              replace(value);
              return;
            }
            value.forEach((item, index) => {
              if (!same(item, children[index].value)) children[index].patch(item);
            });
          },
          child: name => {
            if (!/^(0|[1-9]\d*)$/.test(name) || !children[Number(name)]) throw Error('Indice della configurazione non disponibile.');
            return children[Number(name)];
          }
        };
      } else if (t.isObjectExpression(node)) {
        const children = new Map<string, Descriptor>();
        for (const item of node.properties) {
          if (!t.isObjectProperty(item)) throw Error('Oggetti degli eventi con metodi o spread richiedono verifica manuale.');
          const name = propertyKey(item);
          if (name === undefined || !safeKey(name) || children.has(name)) throw Error('Proprietà dinamica, duplicata o protetta nella configurazione.');
          children.set(name, resolve(doc, item.value));
        }
        const value = Object.fromEntries([...children].map(([name, item]) => [name, item.value]));
        result = {
          value,
          replace,
          patch: next => {
            if (!next || typeof next !== 'object' || Array.isArray(next)) {
              replace(next);
              return;
            }
            const record = next as Record<string, unknown>,
              added = Object.keys(record).filter(name => !children.has(name));
            if ([...children.keys()].some(name => !Object.hasOwn(record, name))) {
              replace(next);
              return;
            }
            for (const [name, item] of children) if (!same(record[name], item.value)) {
              if (name === 'program') item.replace(record[name]);else item.patch(record[name]);
            }
            if (added.length) {
              const insert = added.map(name => JSON.stringify(name) + ':' + JSON.stringify(record[name])).join(',');
              const last = node.properties.at(-1),
                tail = last ? doc.source.slice(last.end!, node.end! - 1) : '';
              const comma = last && !/^\s*,/.test(tail.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '')) ? ',' : '';
              add(doc.file, doc.offset + node.end! - 1, doc.offset + node.end! - 1, comma + insert);
            }
          },
          child: name => {
            const value = children.get(name);
            if (!value) throw Error('Proprietà degli eventi non disponibile: ' + name);
            return value;
          }
        };
      } else if (t.isCallExpression(node) && t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.object, {
        name: 'JSON'
      }) && memberKey(node.callee) === 'stringify' && !doc.scopes.get(node)?.getBinding('JSON') && node.arguments.length === 1 && t.isExpression(node.arguments[0])) {
        const child = resolve(doc, node.arguments[0]),
          patch = (value: unknown) => {
            if (typeof value !== 'string') throw Error('Il binding deve restare una stringa JSON.');
            child.patch(JSON.parse(value));
          };
        result = {
          value: JSON.stringify(child.value),
          patch,
          replace: patch
        };
      } else throw Error('Il binding è prodotto da codice dinamico: non verrà valutato durante la migrazione.');
      descriptors.set(node, result);
      return result;
    } finally {
      resolving.delete(node);
    }
  };
  const processValue = (file: string, bindingLine: number, descriptor: Descriptor) => {
    let value: unknown = descriptor.value,
      string = false;
    if (typeof value === 'string') {
      if (!value.trim()) return;
      value = JSON.parse(value);
      string = true;
    }
    const result = migrateScriptPayload(value, before, after, choices, false, options.scopes?.[file] ?? after.localDefinitions.find(definition => definition.context === 'dynamizations' && definition.scope === file)?.scope);
    for (const item of result.references) references.push({
      ...item,
      path: file,
      bindingLine
    });
    for (const item of result.issues) issue(file, bindingLine, item.message);
    if (result.changed) {
      descriptor.patch(string ? JSON.stringify(result.value) : result.value);
      recompiled += result.recompiled;
      result.previousVersions.forEach(version => versions.add(version));
    }
  };
  const html = (file: string, source: string) => {
    const errors: {
        code: string;
        startOffset: number;
      }[] = [],
      document = parseHtml(source, {
        sourceCodeLocationInfo: true,
        onParseError: error => errors.push(error)
      });
    let index = 0;
    const walk = (node: DefaultTreeAdapterMap['node']) => {
      if ('tagName' in node) {
        for (const attribute of node.attrs) if (attributes.has(attribute.name)) {
          const location = node.sourceCodeLocation?.attrs?.[attribute.name];
          if (!location) {
            issue(file, 1, 'Posizione dell’attributo HTML non disponibile.');
            continue;
          }
          if (errors.some(error => error.code === 'duplicate-attribute' || error.startOffset >= location.startOffset && error.startOffset <= location.endOffset)) {
            issue(file, location.startLine, 'L’HTML contiene attributi duplicati o non validi: correggili prima di migrare.');
            continue;
          }
          try {
            const patch = (value: unknown) => {
              if (typeof value !== 'string') throw Error('L’attributo HTML deve restare testo.');
              add(file, location.startOffset, location.endOffset, attribute.name + '="' + value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;') + '"');
            };
            processValue(file, location.startLine, {
              value: attribute.value,
              patch,
              replace: patch
            });
          } catch (error) {
            issue(file, location.startLine, error);
          }
        }
        if (node.tagName === 'script' && !node.attrs.some(item => item.name === 'src') && ['', 'module', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'].includes((node.attrs.find(item => item.name === 'type')?.value ?? '').trim().toLowerCase())) {
          const content = node.childNodes.find(child => 'value' in child);
          if (content && 'value' in content && content.sourceCodeLocation) loadJs(file, content.value, content.sourceCodeLocation.startOffset, file + '#script' + index++);
        }
        if (node.tagName === 'template' && 'content' in node) walk(node.content);
      }
      if ('childNodes' in node) node.childNodes.forEach(walk);
    };
    walk(document);
  };
  for (const [file, source] of Object.entries(sources)) {
    if (ignored.has(file) || /\.d\.[cm]?ts$/.test(file)) continue;
    if (source.length > 1024 * 1024) {
      issue(file, 1, 'Il sorgente supera 1 MB.');
      continue;
    }
    if (/\.[cm]?[jt]sx?$/.test(file)) loadJs(file, source);else if (/\.html?$/.test(file)) html(file, source);
  }
  for (const doc of documents.values()) {
    const handle = (node: t.Node, value: t.Node) => {
      try {
        const descriptor = resolve(doc, value);
        if (t.isJSXAttribute(node) && t.isStringLiteral(value)) {
          const old = descriptor.patch;
          descriptor.patch = next => {
            const replacement = '{' + JSON.stringify(next) + '}';
            add(doc.file, doc.offset + value.start!, doc.offset + value.end!, replacement);
          };
          try {
            processValue(doc.file, line(doc, node), descriptor);
          } finally {
            descriptor.patch = old;
          }
        } else processValue(doc.file, line(doc, node), descriptor);
      } catch (error) {
        issue(doc.file, line(doc, node), error);
      }
    };
    traverse(doc.ast, {
      JSXAttribute(path) {
        if (t.isJSXIdentifier(path.node.name) && attributes.has(path.node.name.name) && path.node.value) {
          const value = t.isJSXExpressionContainer(path.node.value) ? path.node.value.expression : path.node.value;
          handle(path.node, value);
        }
      },
      ObjectProperty(path) {
        if (attributes.has(propertyKey(path.node) ?? '')) {
          try {
            auditUse(path.parentPath);
            handle(path.node, path.node.value);
          } catch (error) {
            issue(doc.file, line(doc, path.node), error);
          }
        }
      },
      CallExpression(path) {
        const node = path.node;
        if (t.isMemberExpression(node.callee) && memberKey(node.callee) === 'setAttribute' && t.isStringLiteral(node.arguments[0]) && attributes.has(node.arguments[0].value) && t.isExpression(node.arguments[1])) handle(node, node.arguments[1]);
      },
      AssignmentExpression(path) {
        const left = path.node.left;
        if (t.isMemberExpression(left) && t.isMemberExpression(left.object) && memberKey(left.object) === 'dataset') {
          const name = memberKey(left);
          if (name && datasetNames[name]) handle(path.node, path.node.right);
        }
      }
    });
  }
  for (const [file, document] of json) {
    if (!document.patches.size) continue;
    let value = structuredClone(document.value);
    for (const patch of [...document.patches.values()].sort((a, b) => a.path.length - b.path.length)) {
      if (!patch.path.length) value = patch.value;else {
        const parent = at(value, patch.path.slice(0, -1));
        if (!parent || typeof parent !== 'object') throw Error('Percorso JSON non più disponibile.');
        (parent as Record<string, unknown>)[patch.path.at(-1)!] = patch.value;
      }
    }
    const eol = document.before.includes('\r\n') ? '\r\n' : '\n';
    add(file, 0, document.before.length, JSON.stringify(value, null, 2).replaceAll('\n', eol) + (document.before.endsWith('\n') ? eol : ''));
  }
  if (issues.length) return {
    changes: [],
    issues,
    references,
    recompiled: 0,
    previousVersions: []
  };
  const changes: MigrationFileChange[] = [];
  for (const [file, rows] of edits) {
    const source = sources[file],
      code = new MagicString(source);
    for (const row of rows.sort((a, b) => b.start - a.start)) row.start === row.end ? code.appendLeft(row.start, row.value) : code.overwrite(row.start, row.end, row.value);
    const next = code.toString();
    if (next !== source) changes.push({
      path: file,
      before: source,
      after: next
    });
  }
  return {
    changes: changes.sort((a, b) => a.path.localeCompare(b.path)),
    issues,
    references,
    recompiled,
    previousVersions: [...versions].sort((a, b) => a - b)
  };
}
