// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { inspectHmiScript, executeHmiScript } from '../src/core/hmiScript';
import { createHmiScriptContextManager, hmiScriptCatalogIssues, parseHmiScriptCatalog, type HmiScriptCatalog } from '../src/core/hmiScriptModules';
import { migrateHmiScriptCatalog, planScriptProjectMigration, scriptMigrationFingerprint } from '../src/core/scriptProjectMigration';
import type { ScriptSymbolMigration } from '../src/core/scriptReferenceMigration';
const oldSource = 'return Modules.M.Old(4,2);';
const mapping: ScriptSymbolMigration = {
  kind: 'function',
  fromAlias: 'M',
  fromName: 'Old',
  toAlias: 'M',
  toName: 'New',
  arguments: [{
    kind: 'argument',
    index: 1
  }, {
    kind: 'argument',
    index: 0
  }, {
    kind: 'literal',
    value: 1
  }]
};
function original() {
  return parseHmiScriptCatalog({
    globalModules: [{
      name: 'M',
      alias: 'M',
      functions: [{
        name: 'Old',
        parameters: ['a', 'b'],
        source: 'return a+b;'
      }]
    }, {
      name: 'Client',
      alias: 'Client',
      globalDefinition: {
        source: 'const handler=Modules.M.Old;'
      },
      functions: [{
        name: 'Run',
        parameters: [],
        source: 'return handler(4,2);'
      }]
    }],
    localDefinitions: [{
      scope: 'Page',
      context: 'events',
      globalDefinition: {
        source: 'const helper=Modules.M.Old;'
      },
      functions: [{
        name: 'Run',
        parameters: [],
        source: oldSource
      }]
    }],
    schedulerDefinition: {
      source: 'const compute=Modules.M.Old;'
    },
    scheduledTasks: [{
      id: 'periodic',
      name: 'Periodic',
      enabled: false,
      trigger: {
        kind: 'interval',
        intervalMs: 1000
      },
      script: 'return compute(4,2);'
    }, {
      id: 'call',
      name: 'Direct',
      enabled: false,
      trigger: {
        kind: 'interval',
        intervalMs: 1000
      },
      script: oldSource
    }]
  });
}
function target(before = original()) {
  const next = structuredClone(before);
  next.globalModules[0] = {
    name: 'M',
    alias: 'M',
    functions: [{
      name: 'New',
      parameters: ['b', 'a', 'c'],
      source: 'return b+a+c;'
    }]
  };
  return parseHmiScriptCatalog(next);
}
const source = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const event = () => ({
  event: 'Tapped',
  script: oldSource,
  program: inspectHmiScript(oldSource).program
});
const page = () => '<button data-hmi-events={' + JSON.stringify(JSON.stringify([event()])) + '}/>;';
const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
function run(catalog: HmiScriptCatalog) {
  const manager = createHmiScriptContextManager();
  try {
    const program = inspectHmiScript('return Modules.Client.Run();').program!,
      result = executeHmiScript(program, {}, manager.options(catalog, undefined, 'events'));
    expect(result.error).toBeUndefined();
    expect(result.returned).toBe(7);
  } finally {
    manager.dispose();
  }
}
describe('complete script project migration plans', () => {
  it('migrates global definitions, local functions/definitions and Scheduler in the same catalog', () => {
    const before = original(),
      result = migrateHmiScriptCatalog(before, target(before), [mapping]);
    expect(result.issues).toEqual([]);
    expect(result.recompiled).toBe(5);
    expect(result.catalog.globalModules[1].globalDefinition?.source).toContain('Modules.M.New');
    expect(result.catalog.localDefinitions[0].functions[0].source).toContain('Modules.M.New');
    expect(result.catalog.schedulerDefinition?.source).toContain('Modules.M.New');
    run(result.catalog);
  });
  it('never mutates supplied catalogs or evaluates definitions during planning', () => {
    const before = original(),
      next = target(before),
      snapshot = JSON.stringify([before, next]);
    const result = migrateHmiScriptCatalog(before, next, [mapping]);
    expect(result.issues).toEqual([]);
    expect(JSON.stringify([before, next])).toBe(snapshot);
  });
  it('requires every changed or removed public function to be mapped', () => {
    const before = original();
    before.globalModules[0].functions.push({
      name: 'Other',
      parameters: [],
      source: 'return 0;'
    });
    expect(() => migrateHmiScriptCatalog(before, target(before), [mapping])).toThrow('Modules.M.Other');
  });
  it('requires removed public exports to be mapped', () => {
    const before = parseHmiScriptCatalog({
      globalModules: [{
        name: 'M',
        alias: 'M',
        globalDefinition: {
          source: 'export const OldValue=1;'
        },
        functions: [{
          name: 'Old',
          parameters: ['a', 'b'],
          source: 'return a+b;'
        }]
      }]
    });
    expect(() => migrateHmiScriptCatalog(before, target(before), [mapping])).toThrow('Modules.M.OldValue');
  });
  it('blocks stale source/compiled-program disagreements in the catalog', () => {
    const before = original(),
      next = target(before);
    next.localDefinitions[0].functions[0].source = 'return 0;';
    const result = migrateHmiScriptCatalog(before, next, [mapping]);
    expect(result.issues.some(issue => issue.message.includes('non corrispondono'))).toBe(true);
    expect(result.recompiled).toBe(0);
    expect(result.catalog).toEqual(next);
  });
  it('updates catalog and page source together and reports the whole read-set fingerprint', async () => {
    const before = original(),
      files = {
        'framecraft.scripts.json': source(before),
        'src/Page.tsx': page(),
        'src/note.ts': 'export const note="Keep";'
      };
    const result = await planScriptProjectMigration(files, target(before), [mapping]);
    expect(result.issues).toEqual([]);
    expect(result.changes.map(change => change.path)).toEqual(['framecraft.scripts.json', 'src/Page.tsx']);
    expect(result.recompiled).toBe(6);
    expect(result.base).toBe(await scriptMigrationFingerprint(files));
    expect(result.totalBytes).toBeGreaterThan(0);
    run(JSON.parse(result.changes.find(change => change.path === 'framecraft.scripts.json')!.after));
  });
  it('conserves legacy compiled programs for unchanged units, even if the editor normalized them', async () => {
    const before = original();
    before.globalModules[1].functions[0].program = {
      ...before.globalModules[1].functions[0].program!,
      version: 7
    };
    before.scheduledTasks[0].program = {
      ...before.scheduledTasks[0].program!,
      version: 8
    };
    before.localDefinitions[0].functions[0].program = {
      ...before.localDefinitions[0].functions[0].program!,
      version: 8
    };
    const result = await planScriptProjectMigration({
      'framecraft.scripts.json': source(before)
    }, target(before), [mapping]);
    expect(result.issues).toEqual([]);
    const next = JSON.parse(result.changes[0].after);
    expect(next.globalModules[1].functions[0]).toEqual(before.globalModules[1].functions[0]);
    expect(next.scheduledTasks[0]).toEqual(before.scheduledTasks[0]);
    expect(next.localDefinitions[0].functions[0].program.version).toBe(9);
    expect(result.previousVersions).toContain(8);
  });
  it('retains library origin, notices and unrelated Scheduler configuration', async () => {
    const before = original(),
      next = target(before);
    next.globalModules[0].library = {
      id: 'example.motor',
      name: 'Motor',
      version: '2.0.0',
      license: 'MIT',
      notice: 'Copyright Example',
      mode: 'type',
      alias: 'M',
      digest: 'a'.repeat(64),
      release: 'b'.repeat(64),
      attributions: []
    };
    next.schedulerService = {
      enabled: false,
      accountId: ''
    };
    const result = await planScriptProjectMigration({
      'framecraft.scripts.json': source(before)
    }, next, [mapping]);
    expect(result.issues).toEqual([]);
    const catalog = JSON.parse(result.changes[0].after);
    expect(catalog.globalModules[0].library).toEqual(next.globalModules[0].library);
    expect(catalog.schedulerService).toEqual(next.schedulerService);
  });
  it('skips only unchanged generated helpers with a matching manifest hash', async () => {
    const helper = 'export function attach(value){element.setAttribute("data-hmi-events",value);}',
      before = original(),
      files = {
        'framecraft.scripts.json': source(before),
        'src/framecraftEvents.ts': helper,
        'src/Page.tsx': page(),
        'framecraft.runtime-components.json': source({
          version: 1,
          bundleVersion: '2026.11.05.1',
          files: {
            'src/framecraftEvents.ts': await hash(helper)
          }
        })
      };
    const result = await planScriptProjectMigration(files, target(before), [mapping]);
    expect(result.issues).toEqual([]);
    expect(result.ignoredGeneratedFiles).toEqual(['src/framecraftEvents.ts']);
    expect(result.changes.some(change => change.path === 'src/framecraftEvents.ts')).toBe(false);
  });
  it('does not hide customized helpers or user pages under a manifest entry', async () => {
    const before = original(),
      helper = 'export function attach(value){element.setAttribute("data-hmi-events",value);}';
    for (const [path, digest] of [['src/framecraftEvents.ts', 'a'.repeat(64)], ['src/Page.tsx', await hash(helper)]]) {
      const files = {
        'framecraft.scripts.json': source(before),
        [path]: helper,
        'framecraft.runtime-components.json': source({
          version: 1,
          files: {
            [path]: digest
          }
        })
      };
      const result = await planScriptProjectMigration(files, target(before), [mapping]);
      expect(result.changes).toEqual([]);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.ignoredGeneratedFiles).toEqual([]);
    }
  });
  it('invalidates the fingerprint when an unchanged import or inventory changes', async () => {
    const files = {
        'src/A.ts': 'const a=1;',
        'src/B.ts': 'const b=1;'
      },
      base = await scriptMigrationFingerprint(files);
    expect(await scriptMigrationFingerprint({
      'src/B.ts': files['src/B.ts'],
      'src/A.ts': files['src/A.ts']
    })).toBe(base);
    expect(await scriptMigrationFingerprint({
      ...files,
      'src/B.ts': 'const b=2;'
    })).not.toBe(base);
    expect(await scriptMigrationFingerprint({
      ...files,
      'src/New.ts': 'const c=1;'
    })).not.toBe(base);
  });
  it('returns no partial changes when an opaque page or invalid catalog blocks the proposal', async () => {
    const before = original(),
      files = {
        'framecraft.scripts.json': source(before),
        'src/Good.tsx': page(),
        'src/Bad.tsx': 'const page=<button data-hmi-events={runtimeValue}/>;'
      },
      result = await planScriptProjectMigration(files, target(before), [mapping]);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.changes).toEqual([]);
    expect(result.recompiled).toBe(0);
  });
  it('refuses missing/malformed catalogs, malformed manifests and out-of-root inventory paths', async () => {
    const before = original();
    for (const files of [{}, {
      'framecraft.scripts.json': '{}'
    }, {
      'framecraft.scripts.json': source(before),
      'framecraft.runtime-components.json': '{'
    }, {
      'framecraft.scripts.json': source(before),
      '../outside.ts': 'x'
    }]) await expect(planScriptProjectMigration(files as Record<string, string>, target(before), [mapping])).rejects.toThrow();
  });
  it('refuses an invalid current catalog and resource limits before producing any edits', async () => {
    const before = original(),
      invalid = structuredClone(before);
    invalid.globalModules[0].functions[0].source = 'while(true){}';
    await expect(planScriptProjectMigration({
      'framecraft.scripts.json': source(invalid)
    }, target(before), [mapping])).rejects.toThrow('catalogo attuale');
    await expect(planScriptProjectMigration({
      'framecraft.scripts.json': source(before),
      'src/Big.ts': 'x'.repeat(1024 * 1024 + 1)
    }, target(before), [mapping])).rejects.toThrow('limiti');
  });
});
it('compiles newly proposed source-only functions before inspecting dynamic dependencies', async () => {
  const before = original(),
    next = target(before);
  delete next.globalModules[0].functions[0].program;
  const dynamic = {
    kind: 'Script',
    property: 'Text',
    source: 'return Modules.Client.Run();',
    program: inspectHmiScript('return Modules.Client.Run();').program
  };
  next.globalModules[0].functions[0].source = 'return Tags("NewTag").Read()+a+b+c;';
  const files = {
      'framecraft.scripts.json': source(before),
      'src/Page.tsx': 'const page=<span data-hmi-dynamizations={' + JSON.stringify(JSON.stringify([dynamic])) + '}/>;'
    },
    result = await planScriptProjectMigration(files, next, [mapping]);
  expect(result.issues).toEqual([]);
  const catalog = JSON.parse(result.changes.find(change => change.path === 'framecraft.scripts.json')!.after);
  expect(catalog.globalModules[0].functions[0].program.version).toBe(9);
  const page = result.changes.find(change => change.path === 'src/Page.tsx')!.after;
  expect(page).toContain('NewTag');
});
it('continues rejecting missing global function references in module, local and Scheduler definitions', () => {
  const catalog = original();
  catalog.globalModules[1].globalDefinition = {
    source: 'const missing=Modules.M.NotFound;'
  };
  catalog.localDefinitions[0].globalDefinition = {
    source: 'const missing=Modules.M.NotFound;'
  };
  catalog.schedulerDefinition = {
    source: 'const missing=Modules.M.NotFound;'
  };
  const issues = hmiScriptCatalogIssues(parseHmiScriptCatalog(catalog));
  expect(issues.filter(issue => issue.includes('NotFound')).length).toBeGreaterThanOrEqual(3);
});
