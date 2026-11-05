// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { executeHmiScript, executeHmiScriptAsync, inspectHmiScript, type HmiScriptTransport } from '../src/core/hmiScript';
import { createHmiScriptContextManager, parseHmiScriptCatalog, type HmiScriptCatalog } from '../src/core/hmiScriptModules';
import { migrateScriptReferences, migrateScriptPayload, validateScriptMigrations, type ScriptSymbolMigration } from '../src/core/scriptReferenceMigration';
const before = parseHmiScriptCatalog({
  globalModules: [{
    name: 'Motor',
    alias: 'Motor',
    globalDefinition: {
      source: 'export const Previous=4;'
    },
    functions: [{
      name: 'Old',
      parameters: ['speed', 'mode'],
      source: 'return speed+mode;'
    }]
  }]
});
const after = parseHmiScriptCatalog({
  globalModules: [{
    name: 'Motor',
    alias: 'Motor',
    globalDefinition: {
      source: 'export const Current=4;'
    },
    functions: [{
      name: 'New',
      parameters: ['mode', 'speed', 'offset'],
      source: 'return mode+speed+offset;'
    }]
  }]
});
const mapping: ScriptSymbolMigration = {
  kind: 'function',
  fromAlias: 'Motor',
  fromName: 'Old',
  toAlias: 'Motor',
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
const compile = (source: string) => {
  const inspected = inspectHmiScript(source);
  expect(inspected.error).toBeUndefined();
  return inspected.program!;
};
const run = (source: string, catalog = after) => {
  const manager = createHmiScriptContextManager(),
    options = manager.options(catalog, undefined, 'scheduler');
  try {
    return executeHmiScript(compile(source), {}, options);
  } finally {
    manager.dispose();
  }
};
function migrated(source: string, from = before, to = after, choice = mapping) {
  const result = migrateScriptReferences(source, from, to, [choice]);
  expect(result.issues).toEqual([]);
  return result.source;
}
describe('source references for script library API migrations', () => {
  it('migrates direct calls with explicit argument mapping', () => {
    const result = run(migrated('return Modules.Motor.Old(4,2);'));
    expect(result.error).toBeUndefined();
    expect(result.returned).toBe(7);
  });
  it('keeps native argument evaluation order, including dropped and duplicated inputs', () => {
    const source = 'let order="";function first(){order=order+"A";return 4;}function second(){order=order+"B";return 2;}function extra(){order=order+"C";return 9;}const value=Modules.Motor.Old(first(),second(),extra());return order+":"+value;';
    const result = run(migrated(source));
    expect(result.error).toBeUndefined();
    expect(result.returned).toBe('ABC:7');
    const actual = Function('Modules', '"use strict";' + migrated(source))({
      Motor: {
        New: (mode: number, speed: number, offset: number) => mode + speed + offset
      }
    });
    expect(actual).toBe('ABC:7');
  });
  it('keeps duplicated mappings by reference rather than evaluating the same argument twice', () => {
    const choice = {
      ...mapping,
      arguments: [{
        kind: 'argument',
        index: 0
      }, {
        kind: 'argument',
        index: 0
      }, {
        kind: 'literal',
        value: 1
      }]
    } as ScriptSymbolMigration;
    const source = 'let count=0;function input(){count=count+1;return 4;}const value=Modules.Motor.Old(input(),2);return count+":"+value;';
    expect(run(migrated(source, before, after, choice)).returned).toBe('1:9');
  });
  it('keeps references callable through call/apply/bind, callbacks and returned closures', () => {
    for (const source of ['const fn=Modules.Motor.Old;return fn.call(undefined,4,2);', 'const fn=Modules.Motor.Old;return fn.apply(undefined,[4,2]);', 'const fn=Modules.Motor.Old.bind(undefined,4);return fn(2);', 'function get(){return Modules.Motor.Old;}return get()(4,2);', 'return [4].map(Modules.Motor.Old)[0];']) {
      const result = run(migrated(source));
      expect(result.error).toBeUndefined();
      expect(result.returned).toBe(source.includes('.map(') ? 5 : 7);
    }
  });
  it('preserves explicit this, public name and length on adapted references', () => {
    const catalog = parseHmiScriptCatalog({
      globalModules: [{
        name: 'Motor',
        alias: 'Motor',
        functions: [{
          name: 'New',
          parameters: ['mode', 'speed', 'offset'],
          source: 'return this.value+speed+mode+offset;'
        }]
      }]
    });
    const source = 'const fn=Modules.Motor.Old;return JSON.stringify([fn.name,fn.length,fn.call({value:10},4,2)]);';
    expect(run(migrated(source, before, catalog), catalog).returned).toBe('["Old",2,17]');
  });
  it.each(['class', 'default', 'eval', 'arguments', 'Modules', '__fc_target', '__proto__', 'constructor'])('handles legal module member names without invalid wrapper bindings: %s', name => {
    const old = parseHmiScriptCatalog({
        globalModules: [{
          name: 'M',
          alias: 'M',
          functions: [{
            name,
            parameters: ['first', 'second'],
            source: 'return first+second;'
          }]
        }]
      }),
      next = parseHmiScriptCatalog({
        globalModules: [{
          name: 'M',
          alias: 'M',
          functions: [{
            name: 'Read',
            parameters: ['value'],
            source: 'return value;'
          }]
        }]
      }),
      choice: ScriptSymbolMigration = {
        kind: 'function',
        fromAlias: 'M',
        fromName: name,
        toAlias: 'M',
        toName: 'Read',
        arguments: [{
          kind: 'argument',
          index: 1
        }]
      };
    const source = 'const fn=Modules.M[' + JSON.stringify(name) + '];return JSON.stringify([fn.name,fn.length,fn(4,2)]);',
      result = run(migrated(source, old, next, choice), next);
    expect(result.error).toBeUndefined();
    expect(result.returned).toBe(JSON.stringify([name, 2, 2]));
  });
  it('renames compatible members without an adapter and preserves comments/strings', () => {
    const next = parseHmiScriptCatalog({
        globalModules: [{
          name: 'Motor',
          alias: 'Motor',
          functions: [{
            name: 'Renamed',
            parameters: ['speed', 'mode'],
            source: 'return speed+mode;'
          }]
        }]
      }),
      choice: ScriptSymbolMigration = {
        kind: 'function',
        fromAlias: 'Motor',
        fromName: 'Old',
        toAlias: 'Motor',
        toName: 'Renamed'
      };
    const source = '// Modules.Motor.Old(4,2)\nconst text="Modules.Motor.Old";return Modules /* note */ ["Motor"].Old(4,2);';
    expect(migrated(source, before, next, choice)).toBe('// Modules.Motor.Old(4,2)\nconst text="Modules.Motor.Old";return Modules /* note */ ["Motor"].Renamed(4,2);');
  });
  it('renames public variables and retains nested property access', () => {
    const choice: ScriptSymbolMigration = {
      kind: 'variable',
      fromAlias: 'Motor',
      fromName: 'Previous',
      toAlias: 'Motor',
      toName: 'Current'
    };
    expect(run(migrated('return Modules.Motor.Previous;', before, after, choice)).returned).toBe(4);
  });
  it.each(['return Modules.Motor[name](1);', 'const module=Modules.Motor;return module.Old(1,2);', 'return Modules[alias].Old(1,2);', 'Modules.Motor.Old=1;', 'delete Modules.Motor.Old;', 'new Modules.Motor.Old();'])('blocks opaque/invalid references without returning partial edits: %s', source => {
    const result = migrateScriptReferences(source, before, after, [mapping]);
    expect(result.changed).toBe(false);
    expect(result.source).toBe(source);
    expect(result.issues.length).toBeGreaterThan(0);
  });
  it('requires complete mappings and valid public targets', () => {
    expect(() => validateScriptMigrations(before, after, [{
      ...mapping,
      arguments: undefined
    }])).toThrow('esplicitamente');
    expect(() => validateScriptMigrations(before, after, [{
      ...mapping,
      toName: 'Missing'
    }])).toThrow('non è disponibile');
    expect(() => validateScriptMigrations(before, after, [{
      ...mapping,
      arguments: [{
        kind: 'argument',
        index: 99
      }, {
        kind: 'argument',
        index: 0
      }, {
        kind: 'literal',
        value: 1
      }]
    }])).toThrow('Argomento sorgente');
    expect(() => validateScriptMigrations(before, after, [mapping, mapping])).toThrow('più volte');
  });
  it('retains source/reference locations and never changes unrelated modules', () => {
    const source = 'return Modules.Other.Old(1)+Modules.Motor.Old(4,2);',
      result = migrateScriptReferences(source, before, after, [mapping]);
    expect(result.references).toHaveLength(1);
    expect(source.slice(result.references[0].start, result.references[0].end)).toBe('Modules.Motor.Old');
    expect(result.source).toContain('Modules.Other.Old(1)');
  });
  it('recompiles only changed event/dynamization/faceplate handlers and retains other data', () => {
    const eventSource = 'return Modules.Motor.Old(4,2);',
      untouched = compile('return 7;'),
      value = [{
        event: 'Tapped',
        script: eventSource,
        program: {
          ...compile(eventSource),
          version: 8
        },
        permission: 'operate'
      }, {
        event: 'Loaded',
        script: 'return 7;',
        program: untouched
      }, {
        property: 'Text',
        kind: 'Script',
        source: eventSource,
        program: compile(eventSource),
        triggers: ['Input']
      }, {
        eventBindings: {
          Changed: {
            script: eventSource,
            program: compile(eventSource)
          }
        },
        propertyValues: {
          script: 'Notes only'
        }
      }];
    const beforeJson = JSON.stringify(value),
      result = migrateScriptPayload(value, before, after, [mapping]);
    expect(JSON.stringify(value)).toBe(beforeJson);
    expect(result.issues).toEqual([]);
    expect(result.recompiled).toBe(3);
    expect(result.previousVersions).toEqual([8, 9]);
    const rows = result.value as any[];
    expect(rows[0].permission).toBe('operate');
    expect(rows[0].program.version).toBe(9);
    expect(rows[1].program).toEqual(untouched);
    expect(rows[2].triggers).toEqual(['Input']);
    expect(rows[3].propertyValues).toEqual({
      script: 'Notes only'
    });
  });
  it('blocks compiled/source disagreement instead of silently discarding hidden calls', () => {
    const value = [{
        event: 'Tapped',
        script: 'return 7;',
        program: compile('return Modules.Motor.Old(4,2);')
      }],
      result = migrateScriptPayload(value, before, after, [mapping]);
    expect(result.changed).toBe(false);
    expect(result.issues[0].message).toContain('non corrispondono');
    expect(result.value).toEqual(value);
  });
  it('returns the original complete payload if one handler cannot be migrated', () => {
    const value = [{
        event: 'Tapped',
        script: 'return Modules.Motor.Old(4,2);'
      }, {
        event: 'Loaded',
        script: 'return Modules.Motor[name](1);'
      }],
      result = migrateScriptPayload(value, before, after, [mapping]);
    expect(result.changed).toBe(false);
    expect(result.value).toEqual(value);
    expect(result.recompiled).toBe(0);
  });
  it('keeps adapted references passive in module global definitions', () => {
    const source = migrated('export const Read=Modules.Motor.Old;');
    const catalog = parseHmiScriptCatalog({
      globalModules: [...after.globalModules, {
        name: 'Caller',
        alias: 'Caller',
        globalDefinition: {
          source
        },
        functions: []
      }]
    });
    expect(catalog.globalModules[1].globalDefinition?.error).toBeUndefined();
    const manager = createHmiScriptContextManager(),
      options = manager.options(catalog, undefined, 'scheduler');
    const result = executeHmiScript(compile('return Modules.Caller.Read(4,2);'), {}, options);
    expect(result.error).toBeUndefined();
    expect(result.returned).toBe(7);
    manager.dispose();
  });
  it('evaluates every extra argument once even if the new signature drops it', () => {
    const next = parseHmiScriptCatalog({
        globalModules: [{
          name: 'Motor',
          alias: 'Motor',
          functions: [{
            name: 'New',
            parameters: [],
            source: 'return 7;'
          }]
        }]
      }),
      choice = {
        ...mapping,
        arguments: []
      } as ScriptSymbolMigration,
      source = 'let count=0;function value(){count=count+1;return 4;}const result=Modules.Motor.Old(value(),value(),value());return count+":"+result;';
    expect(run(migrated(source, before, next, choice), next).returned).toBe('3:7');
  });
  it('requires an explicit value when a new parameter is left unmapped', () => {
    expect(() => validateScriptMigrations(before, after, [{
      ...mapping,
      arguments: [{
        kind: 'argument',
        index: 0
      }]
    }])).toThrow('ogni parametro');
  });
  it('treats literal and undefined choices as data rather than executable source', () => {
    const choice = {
        ...mapping,
        arguments: [{
          kind: 'literal',
          value: 'return fetch("not-called")'
        }, {
          kind: 'literal',
          value: null
        }, {
          kind: 'undefined'
        }]
      } as ScriptSymbolMigration,
      next = parseHmiScriptCatalog({
        globalModules: [{
          name: 'Motor',
          alias: 'Motor',
          functions: [{
            name: 'New',
            parameters: ['text', 'other', 'optional'],
            source: 'return text+":"+typeof optional;'
          }]
        }]
      });
    const result = run(migrated('return Modules.Motor.Old(4,2);', before, next, choice), next);
    expect(result.error).toBeUndefined();
    expect(result.returned).toBe('return fetch("not-called"):undefined');
  });
  it('does not replay asynchronous reads or writes contained in original arguments', async () => {
    const source = migrated('return Modules.Motor.Old(Tags("Input").Read(),2);'),
      manager = createHmiScriptContextManager(),
      options = manager.options(after, undefined, 'scheduler'),
      read = vi.fn(async () => ({
        value: '4',
        status: {
          qualityCode: 192
        }
      })),
      write = vi.fn(),
      transport = {
        read,
        write
      } as unknown as HmiScriptTransport;
    const result = await executeHmiScriptAsync(compile(source), {}, {
      ...options,
      transport
    });
    expect(result.error).toBeUndefined();
    expect(result.returned).toBe(7);
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    manager.dispose();
  });
});
it('updates dynamization tag dependencies through the migrated module call without replaying reads', () => {
  const old = parseHmiScriptCatalog({
      globalModules: [{
        name: 'M',
        alias: 'M',
        functions: [{
          name: 'Old',
          parameters: ['a', 'b'],
          source: 'return Tags("OldInput").Read()+a+b;'
        }]
      }]
    }),
    next = parseHmiScriptCatalog({
      globalModules: [{
        name: 'M',
        alias: 'M',
        functions: [{
          name: 'New',
          parameters: ['b', 'a', 'c'],
          source: 'return Tags("NewInput").Read()+a+b+c;'
        }]
      }]
    });
  const value = [{
      kind: 'Script',
      property: 'Text',
      source: 'return Modules.M.Old(4,2);',
      program: compile('return Modules.M.Old(4,2);'),
      scriptTags: {
        read: ['OldInput'],
        written: []
      }
    }],
    result = migrateScriptPayload(value, old, next, [{
      ...mapping,
      fromAlias: 'M',
      toAlias: 'M'
    }]);
  expect(result.issues).toEqual([]);
  expect((result.value as typeof value)[0].scriptTags).toEqual({
    read: ['NewInput'],
    written: []
  });
  expect(result.recompiled).toBe(1);
});
it('refreshes tag dependencies for unchanged dynamic source through an updated intermediary and preserves its legacy IR', () => {
  const make = (name: string, source: string) => parseHmiScriptCatalog({
      globalModules: [{
        name: 'M',
        alias: 'M',
        functions: [{
          name,
          parameters: name === 'Old' ? ['a', 'b'] : ['b', 'a', 'c'],
          source: 'return Tags("' + (name === 'Old' ? 'OldInput' : 'NewInput') + '").Read();'
        }]
      }, {
        name: 'Caller',
        alias: 'Caller',
        functions: [{
          name: 'Read',
          parameters: [],
          source
        }]
      }]
    }),
    old = make('Old', 'return Modules.M.Old(4,2);'),
    next = make('New', 'return Modules.M.New(2,4,1);'),
    value = [{
      kind: 'Script',
      property: 'Text',
      source: 'return Modules.Caller.Read();',
      program: {
        ...compile('return Modules.Caller.Read();'),
        version: 8
      },
      scriptTags: {
        read: ['OldInput'],
        written: []
      }
    }];
  const result = migrateScriptPayload(value, old, next, [{
    ...mapping,
    fromAlias: 'M',
    toAlias: 'M'
  }]);
  expect(result.issues).toEqual([]);
  expect(result.changed).toBe(true);
  expect(result.recompiled).toBe(0);
  const dynamic = (result.value as typeof value)[0];
  expect(dynamic.scriptTags.read).toEqual(['NewInput']);
  expect(dynamic.program).toEqual(value[0].program);
  expect(dynamic.source).toBe(value[0].source);
});
it('requires an explicit page scope for local dynamization definitions and uses the chosen context', () => {
  const old = parseHmiScriptCatalog({
      ...before,
      localDefinitions: [{
        scope: 'Page',
        context: 'dynamizations',
        functions: [{
          name: 'Read',
          parameters: [],
          source: 'return Tags("Scoped").Read();'
        }]
      }]
    }),
    next = parseHmiScriptCatalog({
      ...after,
      localDefinitions: old.localDefinitions
    }),
    value = [{
      kind: 'Script',
      property: 'Text',
      source: 'return Local.Read();',
      program: compile('return Local.Read();')
    }];
  const blocked = migrateScriptPayload(value, old, next, [mapping]);
  expect(blocked.issues.some(issue => issue.message.includes('contesto'))).toBe(true);
  expect(blocked.changed).toBe(false);
  const result = migrateScriptPayload(value, old, next, [mapping], false, 'Page');
  expect(result.issues).toEqual([]);
  expect((result.value as {
    scriptTags: {
      read: string[];
    };
  }[])[0].scriptTags.read).toEqual(['Scoped']);
  expect(result.recompiled).toBe(0);
});
it.each(['const {Motor}=Modules;return Motor.Old(4,2);', 'const modules=Modules;return modules.Motor.Old(4,2);', 'return Modules?.Motor?.Old(4,2);'])('blocks opaque root namespace uses: %s', source => {
  const result = migrateScriptReferences(source, before, after, [mapping]);
  expect(result.issues.length).toBeGreaterThan(0);
  expect(result.changed).toBe(false);
});
