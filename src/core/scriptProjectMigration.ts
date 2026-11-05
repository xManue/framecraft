import { hmiScriptCatalogIssues, parseHmiScriptCatalog, type HmiScriptCatalog } from './hmiScriptModules';
import { migrateHmiDocuments, type MigrationDocumentIssue, type MigrationFileChange } from './scriptDocumentMigration';
import { migrateScriptReferences, scriptMigrationProgramIssues, type ScriptReference, type ScriptSymbolMigration } from './scriptReferenceMigration';
import { isRuntimeUpdatePath, runtimeManifestPath } from './runtimeUpdate';
export interface ScriptCatalogMigration {
  catalog: HmiScriptCatalog;
  issues: MigrationDocumentIssue[];
  references: (ScriptReference & {
    path: string;
    unit: string;
  })[];
  recompiled: number;
  previousVersions: number[];
}
export interface ScriptProjectMigration {
  changes: MigrationFileChange[];
  issues: MigrationDocumentIssue[];
  references: (ScriptReference & {
    path: string;
    unit?: string;
    bindingLine?: number;
  })[];
  recompiled: number;
  previousVersions: number[];
  ignoredGeneratedFiles: string[];
  base: string;
  totalBytes: number;
}
const catalogPath = 'framecraft.scripts.json';
type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Il catalogo contiene un oggetto non valido.');
  return value as RecordValue;
}
function get(value: unknown, path: (string | number)[]): unknown {
  for (const part of path) value = objectOrArray(value)[part];
  return value;
}
function objectOrArray(value: unknown): Record<string | number, unknown> {
  if (Array.isArray(value)) return value as unknown as Record<string | number, unknown>;
  return object(value);
}
function completeMappings(before: HmiScriptCatalog, after: HmiScriptCatalog, choices: readonly ScriptSymbolMigration[]): void {
  for (const module of before.globalModules) {
    const next = after.globalModules.find(item => item.alias === module.alias);
    for (const fn of module.functions) {
      const target = next?.functions.find(item => item.name === fn.name);
      if (target && JSON.stringify(target.parameters) === JSON.stringify(fn.parameters)) continue;
      if (!choices.some(choice => choice.kind === 'function' && choice.fromAlias === module.alias && choice.fromName === fn.name)) throw Error('Manca il collegamento della funzione Modules.' + module.alias + '.' + fn.name + '. Completa tutte le interfacce cambiate prima di migrare.');
    }
    for (const item of module.globalDefinition?.program?.exports ?? []) if (!next?.globalDefinition?.program?.exports?.some(value => value.name === item.name) && !choices.some(choice => choice.kind === 'variable' && choice.fromAlias === module.alias && choice.fromName === item.name)) throw Error('Manca il collegamento dell’export Modules.' + module.alias + '.' + item.name + '.');
  }
}
function preservePrograms(previous: HmiScriptCatalog, proposed: HmiScriptCatalog): HmiScriptCatalog {
  const next = structuredClone(proposed),
    copy = (old: unknown, value: unknown, field = 'source') => {
      if (!old || !value) return;
      const a = object(old),
        b = object(value);
      if (a[field] !== b[field] || JSON.stringify(a.parameters) !== JSON.stringify(b.parameters)) return;
      for (const name of ['program', 'tagsRead', 'tagsWritten', 'hasAsync', 'error']) {
        delete b[name];
        if (a[name] !== undefined) b[name] = structuredClone(a[name]);
      }
    };
  for (const module of next.globalModules) {
    const old = previous.globalModules.find(item => item.alias === module.alias);
    if (!old) continue;
    copy(old.globalDefinition, module.globalDefinition);
    for (const fn of module.functions) copy(old.functions.find(item => item.name === fn.name), fn);
  }
  for (const local of next.localDefinitions) {
    const old = previous.localDefinitions.find(item => item.scope === local.scope && item.context === local.context);
    if (!old) continue;
    copy(old.globalDefinition, local.globalDefinition);
    for (const fn of local.functions) copy(old.functions.find(item => item.name === fn.name), fn);
  }
  copy(previous.schedulerDefinition, next.schedulerDefinition);
  for (const task of next.scheduledTasks) copy(previous.scheduledTasks.find(item => item.id === task.id), task, 'script');
  return next;
}
/** Compile only migrated units. Unchanged legacy programs and origin/license metadata stay intact. */
export function migrateHmiScriptCatalog(before: HmiScriptCatalog, proposed: HmiScriptCatalog, choices: readonly ScriptSymbolMigration[]): ScriptCatalogMigration {
  const inspectedProposal = parseHmiScriptCatalog(proposed);
  completeMappings(before, inspectedProposal, choices);
  const draft = structuredClone(proposed),
    issues: MigrationDocumentIssue[] = [],
    references: ScriptCatalogMigration['references'] = [],
    changed: {
      path: (string | number)[];
      label: string;
    }[] = [],
    versions = new Set<number>();
  const unit = (path: (string | number)[], label: string, field = 'source') => {
    const value = get(draft, path);
    if (!value) return;
    const item = object(value);
    if (typeof item[field] !== 'string') throw Error(label + ': sorgente mancante.');
    try {
      const result = migrateScriptReferences(item[field] as string, before, inspectedProposal, choices);
      references.push(...result.references.map(reference => ({
        ...reference,
        path: catalogPath,
        unit: label
      })));
      const problems = [...result.issues, ...scriptMigrationProgramIssues(item.program, result.references, choices)];
      problems.forEach(problem => issues.push({
        path: catalogPath,
        line: problem.line,
        message: label + ': ' + problem.message
      }));
      if (problems.length || !result.changed && item.program !== undefined) return;
      item[field] = result.source;
      changed.push({
        path,
        label
      });
      const old = object(item.program ?? {}).version;
      if (typeof old === 'number') versions.add(old);
    } catch (error) {
      issues.push({
        path: catalogPath,
        line: 1,
        message: label + ': ' + (error instanceof Error ? error.message : String(error))
      });
    }
  };
  draft.globalModules.forEach((module, index) => {
    unit(['globalModules', index, 'globalDefinition'], 'Modules.' + module.alias + ' · definizione');
    module.functions.forEach((fn, fnIndex) => unit(['globalModules', index, 'functions', fnIndex], 'Modules.' + module.alias + '.' + fn.name));
  });
  draft.localDefinitions.forEach((definition, index) => {
    const label = definition.scope + '/' + definition.context;
    unit(['localDefinitions', index, 'globalDefinition'], label + ' · definizione');
    definition.functions.forEach((fn, fnIndex) => unit(['localDefinitions', index, 'functions', fnIndex], label + ' · Local.' + fn.name));
  });
  unit(['schedulerDefinition'], 'Scheduler · definizione');
  draft.scheduledTasks.forEach((task, index) => unit(['scheduledTasks', index], 'Scheduler · ' + task.name, 'script'));
  if (!issues.length) {
    const compiled = parseHmiScriptCatalog(draft);
    hmiScriptCatalogIssues(compiled).forEach(message => issues.push({
      path: catalogPath,
      line: 1,
      message
    }));
    if (!issues.length) for (const change of changed) {
      const target = object(get(draft, change.path)),
        validated = object(get(compiled, change.path));
      for (const field of ['program', 'tagsRead', 'tagsWritten', 'hasAsync', 'error']) {
        delete target[field];
        if (validated[field] !== undefined) target[field] = structuredClone(validated[field]);
      }
    }
  }
  if (issues.length) return {
    catalog: structuredClone(proposed),
    issues,
    references,
    recompiled: 0,
    previousVersions: []
  };
  return {
    catalog: draft,
    issues,
    references,
    recompiled: changed.length,
    previousVersions: [...versions].sort((a, b) => a - b)
  };
}
async function hash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text),
    digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
/** Includes the complete read set. A later inventory, import or source change invalidates the plan. */
export async function scriptMigrationFingerprint(files: Readonly<Record<string, string>>): Promise<string> {
  return hash(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))));
}
async function generatedFiles(files: Readonly<Record<string, string>>): Promise<string[]> {
  const source = files[runtimeManifestPath];
  if (source === undefined) return [];
  let manifest: RecordValue;
  try {
    manifest = object(JSON.parse(source));
  } catch {
    throw Error('Il manifesto dei componenti Runtime non è valido. Aggiorna o correggi il Runtime prima della migrazione.');
  }
  if (manifest.version !== 1) throw Error('Versione del manifesto Runtime non supportata.');
  const entries = object(manifest.files),
    ignored: string[] = [];
  for (const [path, fingerprint] of Object.entries(entries)) {
    if (!isRuntimeUpdatePath(path) || !path.startsWith('src/') || !path.split('/').at(-1)?.startsWith('framecraft') || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) continue;
    if (files[path] !== undefined && (await hash(files[path])) === fingerprint) ignored.push(path);
  }
  return ignored.sort();
}
function printJson(value: unknown, before: string): string {
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  return JSON.stringify(value, null, 2).replaceAll('\n', eol) + (before.endsWith('\n') ? eol : '');
}
/** Pure preview: no reads outside the supplied inventory, no code execution, no writes. */
export async function planScriptProjectMigration(files: Readonly<Record<string, string>>, proposed: HmiScriptCatalog, choices: readonly ScriptSymbolMigration[], options: {
  scopes?: Readonly<Record<string, string>>;
} = {}): Promise<ScriptProjectMigration> {
  const entries = Object.entries(files);
  if (entries.length > 1200 || entries.some(([path, source]) => !path || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..') || typeof source !== 'string' || new TextEncoder().encode(source).length > 1024 * 1024) || entries.reduce((size, [, source]) => size + new TextEncoder().encode(source).length, 0) > 24 * 1024 * 1024) throw Error('Il confronto supera i limiti del progetto: 1 MB per file, 24 MB complessivi e 1.200 file.');
  if (!Object.hasOwn(files, catalogPath)) throw Error('Il catalogo framecraft.scripts.json manca dal confronto. Salva prima i moduli del progetto.');
  const raw = object(JSON.parse(files[catalogPath]));
  if (raw.version !== 1 || !Array.isArray(raw.globalModules) || !Array.isArray(raw.localDefinitions) || !Array.isArray(raw.scheduledTasks)) throw Error('Il catalogo script non ha un formato completo supportato.');
  const before = parseHmiScriptCatalog(raw),
    previousIssues = hmiScriptCatalogIssues(before);
  if (previousIssues.length) throw Error('Correggi il catalogo attuale prima di migrare: ' + previousIssues[0]);
  const ignoredGeneratedFiles = await generatedFiles(files),
    catalog = migrateHmiScriptCatalog(before, preservePrograms(raw as unknown as HmiScriptCatalog, proposed), choices),
    pages = migrateHmiDocuments(files, before, catalog.issues.length ? proposed : catalog.catalog, choices, {
      ignoreFiles: ignoredGeneratedFiles,
      scopes: options.scopes
    });
  const issues = [...catalog.issues, ...pages.issues],
    references = [...catalog.references, ...pages.references],
    base = await scriptMigrationFingerprint(files);
  if (issues.length) return {
    changes: [],
    issues,
    references,
    recompiled: 0,
    previousVersions: [],
    ignoredGeneratedFiles,
    base,
    totalBytes: 0
  };
  const changes = [...pages.changes],
    catalogSource = JSON.stringify(catalog.catalog) === JSON.stringify(raw) ? files[catalogPath] : printJson(catalog.catalog, files[catalogPath]);
  if (catalogSource !== files[catalogPath]) changes.push({
    path: catalogPath,
    before: files[catalogPath],
    after: catalogSource
  });
  const totalBytes = changes.reduce((size, change) => size + new TextEncoder().encode(change.before + change.after).length, 0);
  if (totalBytes > 24 * 1024 * 1024) throw Error('La migrazione supera 24 MB di modifiche: separa il lavoro prima di applicarla.');
  return {
    changes: changes.sort((a, b) => a.path.localeCompare(b.path)),
    issues,
    references,
    recompiled: catalog.recompiled + pages.recompiled,
    previousVersions: [...new Set([...catalog.previousVersions, ...pages.previousVersions])].sort((a, b) => a - b),
    ignoredGeneratedFiles,
    base,
    totalBytes
  };
}
