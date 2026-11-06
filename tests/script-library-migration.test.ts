// @vitest-environment node
import { expect, it } from 'vitest';
import { inspectHmiScript, executeHmiScript } from '../src/core/hmiScript';
import { parseHmiScriptCatalog, createHmiScriptContextManager, type HmiScriptCatalog } from '../src/core/hmiScriptModules';
import { applyScriptLibraryPlan, planScriptLibraryImport, prepareScriptLibraryMigration, releaseScriptLibrary, scriptLibraryAliases, type ScriptLibrary } from '../src/core/scriptLibrary';
import { chooseLibraryMigrationTarget, initialLibraryMigrationChoices, libraryMigrationPageScopes, libraryMigrationRules } from '../src/core/scriptLibraryMigration';
import { planScriptProjectMigration } from '../src/core/scriptProjectMigration';
import { migrateScriptPayload } from '../src/core/scriptReferenceMigration';
const review = {
    code: true,
    customized: true,
    downgrade: true
  },
  meta = {
    id: 'fixture.migrate',
    name: 'Synthetic migration',
    license: 'MIT',
    notice: 'Synthetic only'
  };
const empty = () => parseHmiScriptCatalog({});
const source = (name = 'Old', parameters = ['a', 'b'], body = 'return a+b;') => parseHmiScriptCatalog({
  globalModules: [{
    alias: 'M',
    name: 'M',
    functions: [{
      name,
      parameters,
      source: body
    }]
  }]
});
const plan = (catalog: HmiScriptCatalog, library: ScriptLibrary, allowMigration = true) => planScriptLibraryImport(catalog, library, library.versions.at(-1)!.version, 'type', scriptLibraryAliases(catalog, library, library.versions.at(-1)!, 'type'), {
  allowMigration
});
async function fixture(compatible = false) {
  const original = source(),
    first = await releaseScriptLibrary(undefined, meta, original, ['M'], '1.0.0', 'Initial'),
    before = await applyScriptLibraryPlan(empty(), await plan(empty(), first), review),
    library = await releaseScriptLibrary(first, meta, compatible ? source('Old', ['a', 'b'], 'return Tags("NewTag").Read();') : source('New', ['b', 'a', 'scale'], 'return (a+b)*scale;'), ['M'], '2.0.0', 'Migration'),
    proposal = await plan(before, library);
  return {
    before,
    library,
    proposal
  };
}
it('offers guided API migration while the ordinary import and draft application remain guarded', async () => {
  const {
    before,
    library,
    proposal
  } = await fixture();
  await expect(plan(before, library, false)).rejects.toThrow('interfaccia');
  expect(proposal.projectUpdate).toBe(true);
  expect(proposal.interfaceChanges).toEqual([{
    alias: 'M',
    name: 'Old',
    kind: 'function',
    parameters: ['a', 'b']
  }]);
  await expect(applyScriptLibraryPlan(before, {
    ...proposal,
    interfaceChanges: [],
    projectUpdate: false
  }, review)).rejects.toThrow('procedura guidata');
});
it('requires every changed function and unmatched parameter without guessing values', async () => {
  const {
      proposal
    } = await fixture(),
    changes = proposal.interfaceChanges!;
  const defaults = initialLibraryMigrationChoices(changes, proposal.next);
  expect(defaults[0].target).toBe('');
  expect(() => libraryMigrationRules(changes, proposal.next, defaults)).toThrow('Scegli');
  const choice = chooseLibraryMigrationTarget(changes[0], proposal.next, JSON.stringify(['M', 'New']));
  expect(choice.arguments).toEqual([{
    kind: 'argument',
    index: 1
  }, {
    kind: 'argument',
    index: 0
  }, {
    kind: 'unset'
  }]);
  expect(() => libraryMigrationRules(changes, proposal.next, [choice])).toThrow('scale');
  choice.arguments[2] = {
    kind: 'fixed',
    type: 'number',
    text: '1,5'
  };
  expect(libraryMigrationRules(changes, proposal.next, [choice])[0].arguments).toEqual([{
    kind: 'argument',
    index: 1
  }, {
    kind: 'argument',
    index: 0
  }, {
    kind: 'literal',
    value: 1.5
  }]);
});
it.each([{
  type: 'number',
  text: 'Infinity'
}, {
  type: 'number',
  text: ''
}, {
  type: 'boolean',
  text: 'yes'
}] as const)('rejects invalid fixed values: $type $text', async value => {
  const {
      proposal
    } = await fixture(),
    changes = proposal.interfaceChanges!,
    choice = chooseLibraryMigrationTarget(changes[0], proposal.next, JSON.stringify(['M', 'New']));
  choice.arguments[2] = {
    kind: 'fixed',
    ...value
  };
  expect(() => libraryMigrationRules(changes, proposal.next, [choice])).toThrow();
});
it.each([{
  kind: 'fixed',
  type: 'string',
  text: 'hello',
  expected: {
    kind: 'literal',
    value: 'hello'
  }
}, {
  kind: 'fixed',
  type: 'boolean',
  text: 'false',
  expected: {
    kind: 'literal',
    value: false
  }
}, {
  kind: 'fixed',
  type: 'null',
  text: '',
  expected: {
    kind: 'literal',
    value: null
  }
}, {
  kind: 'undefined',
  expected: {
    kind: 'undefined'
  }
}] as const)('preserves explicit $kind arguments', async value => {
  const {
      proposal
    } = await fixture(),
    changes = proposal.interfaceChanges!,
    choice = chooseLibraryMigrationTarget(changes[0], proposal.next, JSON.stringify(['M', 'New']));
  const {
    expected,
    ...arg
  } = value;
  choice.arguments[2] = arg;
  expect(libraryMigrationRules(changes, proposal.next, [choice])[0].arguments?.[2]).toEqual(expected);
});
it('merges disk source without discarding unknown root/module fields or unrelated legacy programs', async () => {
  const {
      before,
      proposal
    } = await fixture(),
    raw = {
      ...structuredClone(before),
      custom: {
        keep: true
      }
    };
  Object.assign(raw.globalModules[0], {
    customModule: 42
  });
  raw.localDefinitions = [{
    scope: '/page',
    context: 'events',
    functions: [{
      name: 'Keep',
      parameters: [],
      source: 'return 4;',
      program: {
        ...inspectHmiScript('return 4;').program!,
        version: 8
      }
    }]
  }];
  const current = parseHmiScriptCatalog(raw),
    nextPlan = {
      ...proposal,
      base: (await plan(current, (await fixture()).library)).base
    };
  const merged = await prepareScriptLibraryMigration(JSON.stringify(raw), current, nextPlan, review);
  expect((merged as any).custom).toEqual({
    keep: true
  });
  expect((merged.globalModules[0] as any).customModule).toBe(42);
  expect(merged.localDefinitions).toEqual(raw.localDefinitions);
  const migrated = await planScriptProjectMigration({
    'framecraft.scripts.json': JSON.stringify(raw)
  }, merged, [{
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
  }]);
  expect(migrated.issues).toEqual([]);
  const saved = JSON.parse(migrated.changes[0].after);
  expect(saved.custom).toEqual(raw.custom);
  expect(saved.localDefinitions).toEqual(raw.localDefinitions);
});
it('blocks stale disk catalogs and missing review before producing a proposal', async () => {
  const {
    before,
    proposal
  } = await fixture();
  await expect(prepareScriptLibraryMigration(JSON.stringify(empty()), before, proposal, review)).rejects.toThrow('diverso');
  await expect(prepareScriptLibraryMigration(JSON.stringify(before), before, proposal, {
    ...review,
    code: false
  })).rejects.toThrow();
  await expect(prepareScriptLibraryMigration('{}', before, proposal, review)).rejects.toThrow('formato');
});
it('updates indirect dynamization tag metadata for an API-compatible library update with no mappings', async () => {
  const {
      before,
      proposal
    } = await fixture(true),
    raw = structuredClone(before);
  raw.globalModules[0].functions[0].source = 'return Tags("OldTag").Read();';
  const {
      library
    } = await fixture(true),
    p = await plan(raw, library),
    merged = await prepareScriptLibraryMigration(JSON.stringify(raw), raw, p, review),
    program = {
      ...inspectHmiScript('return Modules.M.Old(1,2);').program!,
      version: 8
    };
  const value = [{
    kind: 'Script',
    property: 'Text',
    source: 'return Modules.M.Old(1,2);',
    program,
    scriptTags: {
      read: ['OldTag'],
      written: []
    }
  }];
  expect(proposal.projectUpdate).toBe(true);
  expect(proposal.interfaceChanges).toEqual([]);
  const files = {
    'framecraft.scripts.json': JSON.stringify(raw),
    'src/Page.tsx': 'export default function Page(){return <div data-hmi-dynamizations={' + JSON.stringify(JSON.stringify(value)) + '}/>;}'
  };
  const result = await planScriptProjectMigration(files, merged, []);
  expect(result.issues).toEqual([]);
  expect(result.changes.map(c => c.path)).toContain('src/Page.tsx');
  expect(result.changes.find(c => c.path === 'src/Page.tsx')!.after).toContain('NewTag');
  expect(result.recompiled).toBe(0);
});
it('unions local dependencies across shared-page contexts and rejects any invalid context', () => {
  const catalog = parseHmiScriptCatalog({
      localDefinitions: ['/a', '/b'].map((scope, i) => ({
        scope,
        context: 'dynamizations',
        functions: [{
          name: 'Read',
          parameters: [],
          source: `return Tags("Tag${i}").Read();`
        }]
      }))
    }),
    program = {
      ...inspectHmiScript('return Local.Read();').program!,
      version: 8
    },
    value = [{
      kind: 'Script',
      property: 'Text',
      source: 'return Local.Read();',
      program
    }];
  const result = migrateScriptPayload(value, catalog, catalog, [], false, ['/a', '/b']);
  expect(result.issues).toEqual([]);
  expect((result.value as any)[0].scriptTags.read).toEqual(['Tag0', 'Tag1']);
  expect((result.value as any)[0].program).toEqual(program);
  expect(migrateScriptPayload(value, catalog, catalog, [], false, ['/a', '/missing']).issues.length).toBeGreaterThan(0);
});
it('resolves all routes sharing a Windows page source without inferring component usage', () => {
  const files = {
      'src/Page.tsx': 'x',
      'src/Shared.tsx': 'x'
    },
    pages = [{
      file: 'c:/synthetic/src/page.tsx',
      route: '/a'
    }, {
      file: 'C:/synthetic/src/Page.tsx',
      route: '/b'
    }] as any;
  expect(libraryMigrationPageScopes(files, pages, 'C:/synthetic')).toEqual({
    'src/Page.tsx': ['/a', '/b']
  });
});
it('keeps reviewed library sources on the new API while adapting old project callers exactly once', async () => {
  const make = (newApi: boolean) => parseHmiScriptCatalog({
    globalModules: [{
      name: 'M',
      alias: 'M',
      functions: [{
        name: 'Compute',
        parameters: newApi ? ['right', 'left'] : ['left', 'right'],
        source: 'return left-right;'
      }, {
        name: 'Use',
        parameters: [],
        source: newApi ? 'return Modules.M.Compute(2,9);' : 'return Modules.M.Compute(9,2);'
      }]
    }]
  });
  const first = await releaseScriptLibrary(undefined, meta, make(false), ['M'], '1.0.0', 'Initial'),
    base = await applyScriptLibraryPlan(empty(), await plan(empty(), first), review),
    raw = parseHmiScriptCatalog({
      ...base,
      scheduledTasks: [{
        id: 'old',
        name: 'Old project caller',
        enabled: false,
        trigger: {
          kind: 'interval',
          intervalMs: 1000
        },
        script: 'return Modules.M.Compute(9,2);'
      }]
    }),
    pkg = await releaseScriptLibrary(first, meta, make(true), ['M'], '2.0.0', 'Reordered arguments'),
    p = await plan(raw, pkg),
    merged = await prepareScriptLibraryMigration(JSON.stringify(raw), raw, p, review),
    choices = initialLibraryMigrationChoices(p.interfaceChanges!, p.next),
    rules = libraryMigrationRules(p.interfaceChanges!, p.next, choices);
  const result = await planScriptProjectMigration({
    'framecraft.scripts.json': JSON.stringify(raw)
  }, merged, rules, {
    updatedModules: p.changes.map(c => c.alias)
  });
  expect(result.issues).toEqual([]);
  const saved = JSON.parse(result.changes[0].after);
  expect(saved.globalModules[0].functions.find((f: any) => f.name === 'Use').source).toBe('return Modules.M.Compute(2,9);');
  expect(saved.scheduledTasks[0].script).not.toBe(raw.scheduledTasks[0].script);
  const manager = createHmiScriptContextManager(),
    options = manager.options(parseHmiScriptCatalog(saved), undefined, 'scheduler');
  expect(executeHmiScript(inspectHmiScript('return Modules.M.Use();', options.functions, undefined, [], options.variables).program!, {}, options).returned).toBe(7);
  expect(executeHmiScript(saved.scheduledTasks[0].program, {}, options).returned).toBe(7);
  manager.dispose();
});
it('reports replaced library programs from an older IR for explicit engine review', async () => {
  const {
      before,
      proposal
    } = await fixture(true),
    raw = structuredClone(before);
  raw.globalModules[0].functions[0].program = {
    ...raw.globalModules[0].functions[0].program!,
    version: 8
  };
  const merged = await prepareScriptLibraryMigration(JSON.stringify(raw), before, proposal, review);
  const result = await planScriptProjectMigration({
    'framecraft.scripts.json': JSON.stringify(raw)
  }, merged, [], {
    updatedModules: proposal.changes.map(c => c.alias)
  });
  expect(result.issues).toEqual([]);
  expect(result.previousVersions).toEqual([8]);
  expect(result.recompiled).toBe(1);
});
