// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import { parse as parseHtml } from 'parse5';
import { executeHmiScript, inspectHmiScript } from '../src/core/hmiScript';
import { createHmiScriptContextManager, parseHmiScriptCatalog } from '../src/core/hmiScriptModules';
import { migrateHmiDocuments } from '../src/core/scriptDocumentMigration';
import type { ScriptSymbolMigration } from '../src/core/scriptReferenceMigration';
const before = parseHmiScriptCatalog({
  globalModules: [{
    name: 'M',
    alias: 'M',
    functions: [{
      name: 'Old',
      parameters: ['a', 'b'],
      source: 'return a+b;'
    }]
  }]
});
const after = parseHmiScriptCatalog({
  globalModules: [{
    name: 'M',
    alias: 'M',
    functions: [{
      name: 'New',
      parameters: ['b', 'a', 'c'],
      source: 'return b+a+c;'
    }]
  }]
});
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
const event = (script = 'return Modules.M.Old(4,2);') => ({
  event: 'Tapped',
  script,
  program: inspectHmiScript(script).program
});
const plan = (sources: Record<string, string>) => migrateHmiDocuments(sources, before, after, [mapping]);
const json = () => JSON.stringify([event()]);
function run(events: ReturnType<typeof event>[]) {
  const manager = createHmiScriptContextManager();
  try {
    const result = executeHmiScript(events[0].program!, {}, manager.options(after, undefined, 'events'));
    expect(result.error).toBeUndefined();
    expect(result.returned).toBe(7);
  } finally {
    manager.dispose();
  }
}
function changed(sources: Record<string, string>, file: string) {
  const result = plan(sources);
  expect(result.issues).toEqual([]);
  const change = result.changes.find(item => item.path === file);
  expect(change).toBeDefined();
  return {
    result,
    source: change!.after
  };
}
describe('project HMI document migration', () => {
  it('changes a JSX string attribute while preserving surrounding content and valid syntax', () => {
    const original = '<button title="Keep" data-hmi-events="' + json().replaceAll('"', '&quot;') + '">Text</button>;',
      {
        source,
        result
      } = changed({
        'src/Page.tsx': original
      }, 'src/Page.tsx');
    parse(source, {
      plugins: ['jsx', 'typescript']
    });
    expect(source).toContain('title="Keep"');
    expect(source).toContain('>Text</button>');
    expect(source).toContain('Modules.M.New');
    expect(result.recompiled).toBe(1);
    expect(result.references[0]).toMatchObject({
      path: 'src/Page.tsx',
      bindingLine: 1
    });
  });
  it('updates local constant strings without touching comments or unrelated strings', () => {
    const original = 'const note="Modules.M.Old";\nconst events=' + JSON.stringify(json()) + ';\nconst page=<button data-hmi-events={events}/>;';
    const {
      source
    } = changed({
      'src/Page.tsx': original
    }, 'src/Page.tsx');
    expect(source).toContain('const note="Modules.M.Old"');
    expect(source).toContain('Modules.M.New');
    parse(source, {
      plugins: ['jsx']
    });
  });
  it('updates static objects in JSON.stringify and executes the new compiled handler', () => {
    const original = 'const events=' + json() + ';const text=JSON.stringify(events);const page=<button data-hmi-events={text}/>;';
    const {
      source
    } = changed({
      'src/Page.tsx': original
    }, 'src/Page.tsx');
    const setup = source.slice(0, source.indexOf('const page='));
    const events = Function(setup + ';return JSON.parse(text);')();
    run(events);
  });
  it('preserves object comments and trailing commas when adding a missing program', () => {
    const original = 'const events=[{event:"Tapped",script:"return Modules.M.Old(4,2);", /* keep */}];const text=JSON.stringify(events);const el=<button data-hmi-events={text}/>;';
    const {
      source
    } = changed({
      'src/Page.tsx': original
    }, 'src/Page.tsx');
    expect(source).toContain('/* keep */');
    parse(source, {
      plugins: ['jsx']
    });
    const events = Function(source.slice(0, source.indexOf('const el=')) + ';return events;')();
    run(events);
  });
  it('follows static member expressions, TypeScript wrappers and aliases', () => {
    const original = 'const config={events:' + json() + '};const alias=(config.events as unknown);const page=<button data-hmi-events={JSON.stringify(alias)}/>;';
    const {
      source
    } = changed({
      'src/Page.tsx': original
    }, 'src/Page.tsx');
    parse(source, {
      plugins: ['jsx', 'typescript']
    });
    expect(source).toContain('Modules.M.New');
    expect(source).toContain('const alias=(config.events as unknown)');
  });
  it('updates imported named/default values and re-exports at their shared source once', () => {
    const sources = {
      'src/events.ts': 'export const events=' + json() + ';export default events;',
      'src/index.ts': 'export {events as click} from "./events";',
      'src/A.tsx': 'import {click} from "./index";export const a=<button data-hmi-events={JSON.stringify(click)}/>;',
      'src/B.tsx': 'import events from "./events";export const b=<button data-hmi-events={JSON.stringify(events)}/>;'
    };
    const {
      result,
      source
    } = changed(sources, 'src/events.ts');
    expect(result.changes).toHaveLength(1);
    expect(source).toContain('Modules.M.New');
    parse(source, {
      sourceType: 'module'
    });
  });
  it('reads a namespace export without rejecting unrelated exported functions', () => {
    const sources = {
      'src/events.ts': 'export const events=' + json() + ';export function unrelated(){return 1;}',
      'src/Page.tsx': 'import * as cfg from "./events";cfg.unrelated();const page=<button data-hmi-events={JSON.stringify(cfg.events)}/>;'
    };
    expect(plan(sources).issues).toEqual([]);
    expect(plan(sources).changes).toHaveLength(1);
  });
  it('updates shared imported JSON while retaining unrelated keys and line endings', () => {
    const sources = {
      'src/events.json': JSON.stringify({
        events: [event()],
        other: 'Keep'
      }, null, 2).replaceAll('\n', '\r\n') + '\r\n',
      'src/Page.tsx': 'import cfg from "./events.json";const page=<button data-hmi-events={JSON.stringify(cfg.events)}/>;'
    };
    const {
      source
    } = changed(sources, 'src/events.json');
    expect(JSON.parse(source).other).toBe('Keep');
    expect(source.endsWith('\r\n')).toBe(true);
    expect(source.replaceAll('\r\n', '')).not.toContain('\n');
    run(JSON.parse(source).events);
  });
  it('updates explicit raw JSON imports as text and preserves unrelated files', () => {
    const sources = {
      'src/events.txt': json(),
      'src/Page.tsx': 'import events from "./events.txt?raw";const page=<button data-hmi-events={events}/>;',
      'src/Other.ts': 'export const label="Modules.M.Old";'
    };
    const {
      source,
      result
    } = changed(sources, 'src/events.txt');
    run(JSON.parse(source));
    expect(result.changes).toHaveLength(1);
  });
  it('updates HTML entities, templates and inline JavaScript without executing scripts', () => {
    const encoded = json().replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    const original = '<!doctype html><template><button data-hmi-events="' + encoded + '">Keep &amp; text</button></template><script type="application/json">{"not":"JavaScript"}</script><script>const events=' + JSON.stringify(json()) + ';document.querySelector("button").setAttribute("data-hmi-events",events);</script>';
    const {
      source,
      result
    } = changed({
      'index.html': original
    }, 'index.html');
    expect(result.recompiled).toBe(2);
    expect(source).toContain('Keep &amp; text');
    expect(source).toContain('<script type="application/json">{"not":"JavaScript"}</script>');
    expect(source).toContain('Modules.M.New');
    expect(() => parseHtml(source)).not.toThrow();
  });
  it('updates DOM dataset and object attribute maps', () => {
    const original = 'const attrs={"data-hmi-events":' + JSON.stringify(json()) + '};el.dataset.hmiEvents=' + JSON.stringify(json()) + ';';
    const {
      source,
      result
    } = changed({
      'src/Page.js': original
    }, 'src/Page.js');
    expect(result.recompiled).toBe(2);
    parse(source);
    expect(source).toContain('Modules.M.New');
  });
  it.each(['cfg[0].script="return 1;";', '(cfg as any)[0].script="return 1;";', 'const alias=cfg;alias.push({});', 'Object.assign(cfg,{x:1});', 'unknown(cfg);', 'function leak(){return cfg;}', 'const escape=<Widget config={cfg}/>;', 'const nested={config:cfg};unknown(nested);', 'const {script}=cfg[0];', 'JSON.stringify(cfg,(_,value)=>{cfg[0].script="wrong";return value;});'])('blocks dynamic mutation or escape of a shared local object: %s', use => {
    const original = 'const cfg=' + json() + ';' + use + 'const page=<button data-hmi-events={JSON.stringify(cfg)}/>;',
      result = plan({
        'src/Page.tsx': original
      });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.changes).toEqual([]);
  });
  it('checks other importers before modifying a shared exported object', () => {
    const sources = {
      'src/events.ts': 'export const events=' + json() + ';',
      'src/Page.tsx': 'import {events} from "./events";const page=<button data-hmi-events={JSON.stringify(events)}/>;',
      'src/Other.ts': 'import {events} from "./events";events[0].script="changed";'
    };
    const result = plan(sources);
    expect(result.issues.some(item => item.message.includes('src/Other.ts'))).toBe(true);
    expect(result.changes).toEqual([]);
  });
  it('checks mutation through a JSON import in another file', () => {
    const sources = {
      'events.json': json(),
      'src/Page.tsx': 'import events from "../events.json";const page=<button data-hmi-events={JSON.stringify(events)}/>;',
      'src/Other.ts': 'import events from "../events.json";events.push({});'
    };
    const result = plan(sources);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.changes).toEqual([]);
  });
  it.each(['makeEvents()', 'props.events', 'globalEvents', '[...base]'])('never evaluates dynamic producers: %s', expression => {
    const result = plan({
      'src/Page.tsx': 'const page=<button data-hmi-events={' + expression + '}/>;'
    });
    expect(result.changes).toEqual([]);
    expect(result.issues.length).toBeGreaterThan(0);
  });
  it('blocks missing imports and preserves all files when any page is opaque', () => {
    const sources = {
      'src/Good.tsx': 'const page=<button data-hmi-events={' + JSON.stringify(json()) + '}/>;',
      'src/Bad.tsx': 'import events from "./missing";const page=<button data-hmi-events={events}/>;'
    };
    const result = plan(sources);
    expect(result.references.length).toBeGreaterThan(0);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.changes).toEqual([]);
    expect(result.recompiled).toBe(0);
  });
  it('blocks ambiguous imports, external aliases and cyclic configuration values', () => {
    for (const sources of [{
      'src/Page.tsx': 'import events from "@/events";const page=<button data-hmi-events={events}/>;'
    }, {
      'src/events.ts': 'export default "[]";',
      'src/events.js': 'export default "[]";',
      'src/Page.tsx': 'import events from "./events";const page=<button data-hmi-events={events}/>;'
    }, {
      'src/Page.tsx': 'const cfg=[cfg];const page=<button data-hmi-events={JSON.stringify(cfg)}/>;'
    }]) {
      const result = plan(sources as Record<string, string>);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.changes).toEqual([]);
    }
  });
  it('keeps unchanged legacy programs and reports the versions recompiled by migration', () => {
    const old = event();
    old.program = {
      ...old.program!,
      version: 8
    };
    const other = event('return 3;');
    other.program = {
      ...other.program!,
      version: 7
    };
    const source = 'const events=' + JSON.stringify([old, other]) + ';const page=<button data-hmi-events={JSON.stringify(events)}/>;';
    const result = plan({
      'src/Page.tsx': source
    });
    expect(result.issues).toEqual([]);
    expect(result.previousVersions).toEqual([8]);
    const next = Function(result.changes[0].after.split('const page=')[0] + ';return events;')();
    expect(next[0].program.version).toBe(9);
    expect(next[1]).toEqual(other);
  });
  it('ignores declaration files and explicit generated helpers, never unrelated user code', () => {
    const result = migrateHmiDocuments({
      'src/global.d.ts': 'declare const bad: ???;',
      'src/helper.ts': 'const bad: ???;',
      'src/Page.tsx': 'const page=<button data-hmi-events={' + JSON.stringify(json()) + '}/>;'
    }, before, after, [mapping], {
      ignoreFiles: ['src/helper.ts']
    });
    expect(result.issues).toEqual([]);
    expect(result.changes.map(item => item.path)).toEqual(['src/Page.tsx']);
  });
});
it('blocks attribute-map mutations even when the binding is an inline literal', () => {
  const result = plan({
    'src/Page.tsx': 'const attrs={"data-hmi-events":' + JSON.stringify(json()) + '};attrs["data-hmi-events"]=runtime;const page=<button {...attrs}/>;'
  });
  expect(result.issues.length).toBeGreaterThan(0);
  expect(result.changes).toEqual([]);
});
it('supports a static attribute map spread into a native JSX element', () => {
  const {
    source
  } = changed({
    'src/Page.tsx': 'const attrs={"data-hmi-events":' + JSON.stringify(json()) + '};const page=<button {...attrs}/>;'
  }, 'src/Page.tsx');
  expect(source).toContain('Modules.M.New');
  parse(source, {
    plugins: ['jsx']
  });
});
it('blocks a shared string used in unrelated code rather than silently changing both consumers', () => {
  const result = plan({
    'src/Page.tsx': 'const events=' + JSON.stringify(json()) + ';sendElsewhere(events);const page=<button data-hmi-events={events}/>;'
  });
  expect(result.issues.length).toBeGreaterThan(0);
  expect(result.changes).toEqual([]);
});
it('blocks a shared compiled program escaping through a separate JSON output', () => {
  const program = JSON.stringify(event().program),
    script = JSON.stringify(event().script),
    result = plan({
      'src/Page.tsx': 'const program=' + program + ';const events=[{event:"Tapped",script:' + script + ',program}];const userData={program};sendElsewhere(JSON.stringify(userData));const page=<button data-hmi-events={JSON.stringify(events)}/>;'
    });
  expect(result.issues.length).toBeGreaterThan(0);
  expect(result.changes).toEqual([]);
});
it('preserves escaped HTML text including quotes, entities and non-ASCII characters', () => {
  const input = JSON.stringify([event('return Modules.M.Old(4,2)+" è < & ";')]),
    encoded = input.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
    {
      source
    } = changed({
      'index.html': '<button data-hmi-events="' + encoded + '">È &amp; resta</button>'
    }, 'index.html');
  expect(source).toContain('È &amp; resta');
  expect(source).toContain('&lt;');
  expect(source).toContain('Modules.M.New');
  expect(source).toContain('è');
});
it('preserves a trailing comma separated from the last property by a comment', () => {
  const {
    source
  } = changed({
    'src/Page.tsx': 'const events=[{event:"Tapped",script:"return Modules.M.Old(4,2);" /* retain */ ,}];const page=<button data-hmi-events={JSON.stringify(events)}/>;'
  }, 'src/Page.tsx');
  expect(source).toContain('/* retain */');
  expect(() => parse(source, {
    plugins: ['jsx']
  })).not.toThrow();
});
it('does not treat export-star as a default re-export', () => {
  const result = plan({
    'src/events.ts': 'export default ' + JSON.stringify(json()) + ';',
    'src/index.ts': 'export * from "./events";',
    'src/Page.tsx': 'import events from "./index";const page=<button data-hmi-events={events}/>;'
  });
  expect(result.issues.length).toBeGreaterThan(0);
  expect(result.changes).toEqual([]);
});
it('does not swallow an unsafe export behind a second re-export candidate', () => {
  const result = plan({
    'src/unsafe.ts': 'export const events=dynamicProducer();',
    'src/safe.ts': 'export const events=' + JSON.stringify(json()) + ';',
    'src/index.ts': 'export * from "./unsafe";export * from "./safe";',
    'src/Page.tsx': 'import {events} from "./index";const page=<button data-hmi-events={events}/>;'
  });
  expect(result.issues.length).toBeGreaterThan(0);
  expect(result.changes).toEqual([]);
});
it('rewrites JSON strings inside JSX expression containers without adding a second pair of braces', () => {
  const source = 'export const page=<button data-hmi-events={' + JSON.stringify(json()) + '}/>;',
    result = plan({
      'src/Page.tsx': source
    });
  expect(result.issues).toEqual([]);
  const output = result.changes[0].after;
  const ast = parse(output, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });
  const element = (ast.program.body[0] as any).declaration.declarations[0].init;
  const payload = JSON.parse(element.openingElement.attributes[0].value.expression.value);
  run(payload);
  expect(output).not.toContain('data-hmi-events={{');
});
it('migrates events and dynamizations on the same JSX element and remains parseable on the next migration', () => {
  const dynamic = [{
      kind: 'Script',
      property: 'Text',
      source: 'return Modules.M.Old(4,2);',
      program: inspectHmiScript('return Modules.M.Old(4,2);').program,
      scriptTags: {
        read: [],
        written: []
      }
    }],
    source = 'export const page=<button data-hmi-events={' + JSON.stringify(json()) + '} data-hmi-dynamizations={' + JSON.stringify(JSON.stringify(dynamic)) + '}/>;',
    result = plan({
      'src/Page.tsx': source
    });
  expect(result.issues).toEqual([]);
  expect(result.recompiled).toBe(2);
  const output = result.changes[0].after,
    ast = parse(output, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript']
    }),
    element = (ast.program.body[0] as any).declaration.declarations[0].init,
    attrs = element.openingElement.attributes;
  run(JSON.parse(attrs[0].value.expression.value));
  const value = JSON.parse(attrs[1].value.expression.value),
    manager = createHmiScriptContextManager();
  try {
    expect(executeHmiScript(value[0].program, {}, manager.options(after, undefined, 'dynamizations')).returned).toBe(7);
  } finally {
    manager.dispose();
  }
  expect(migrateHmiDocuments({
    'src/Page.tsx': output
  }, after, after, []).issues).toEqual([]);
});
