// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface } from '../scripts/hmi-property-flashing.mjs';
import { executeHmiScript, inspectHmiScript, type HmiScriptExecutionOptions } from '../src/core/hmiScript';
import { createHmiScriptContextManager, parseHmiScriptCatalog } from '../src/core/hmiScriptModules';
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  document.body.innerHTML = '';
});
function scene(owner = 'A') {
  document.body.innerHTML = '<div id="Outside">Outside</div><main data-hmi-screen="Main"><button data-hmi-name="A" hidden>A</button><button data-hmi-name="B">B</button><section data-hmi-name="FP1" data-hmi-faceplate="{}"><button data-hmi-name="Inner">First</button><section data-hmi-name="Nested" data-hmi-faceplate="{}"><button data-hmi-name="Deep">Deep</button></section></section><section data-hmi-name="FP2" data-hmi-faceplate="{}"><button data-hmi-name="Inner">Second</button></section></main><main data-hmi-screen="Other"><button data-hmi-name="X">Other</button></main>';
  const surface = createHmiPropertyFlashingDomSurface(document),
    controller = createHmiPropertyFlashing(surface);
  cleanups.push(() => surface.dispose());
  const item = surface.items().find(item => item.name === owner)!;
  const manager = controller.context(item.itemId);
  const run = (source: string, options: HmiScriptExecutionOptions = {}) => {
    const inspected = inspectHmiScript(source);
    expect(inspected.error).toBeUndefined();
    return executeHmiScript(inspected.program!, {}, {
      screenItems: manager,
      ...options
    });
  };
  return {
    surface,
    controller,
    manager,
    run
  };
}
it('counts configured objects, including invisible objects, without the screen root or faceplate interiors', () => {
  const {
    run
  } = scene();
  expect(run('const items=Screen.Items;return items.Count;')).toMatchObject({
    returned: 4
  });
  expect(run('return Screen.Items(0).Name;')).toMatchObject({
    returned: 'A'
  });
  expect(run('return JSON.stringify(Object.values(Screen.Items).map(entry=>entry.Name));')).toMatchObject({
    returned: JSON.stringify(['A', 'B', 'FP1', 'FP2'])
  });
});
it('supports every screen spelling, numeric and named access, callable aliases, call/apply/bind and identity', () => {
  const {
    run
  } = scene();
  for (const root of ['Screen', 'UI.ActiveScreen', 'HMIRuntime.UI.ActiveScreen', 'this']) expect(run('const items=' + root + '.Items;return JSON.stringify([items.Count,items(1).Name,items[1].Name,items("B").Name,items.apply(' + root + ',[1]).Name,items.bind(' + root + ')(1).Name,items===items]);')).toMatchObject({
    returned: JSON.stringify([4, 'B', 'B', 'B', 'B', 'B', true])
  });
});
it('keeps faceplate membership isolated, includes each nested instance once, and resolves repeated names locally', () => {
  const {
    surface,
    controller
  } = scene();
  const first = surface.items().find(item => item.name === 'Inner')!,
    deep = surface.items().find(item => item.name === 'Deep')!,
    second = surface.items().filter(item => item.name === 'Inner')[1];
  const run = (owner: string, source: string) => executeHmiScript(inspectHmiScript(source).program!, {}, {
    screenItems: controller.context(owner)
  });
  expect(run(first.itemId, 'return JSON.stringify(Object.values(Faceplate.Items).map(entry=>entry.Name));').returned).toBe(JSON.stringify(['Inner', 'Nested']));
  expect(run(deep.itemId, 'return Faceplate.Items(0).Name;').returned).toBe('Deep');
  expect(run(second.itemId, 'return Faceplate.Items("Inner").Text;').returned).toBe('Second');
  expect(run(first.itemId, 'return Faceplate.Items("Inner").Text;').returned).toBe('First');
  expect(run(first.itemId, 'return Faceplate.Items("Deep").Name;').error).toContain('non trovato');
  expect(run(first.itemId, 'return Screen.Items("Nested").Name;').error).toContain('non trovato');
});
it('enumerates numeric keys and entries without exposing host methods, DOM nodes or internal ids', () => {
  const {
    run
  } = scene();
  expect(run('return JSON.stringify(Object.keys(Screen.Items));').returned).toBe('["0","1","2","3"]');
  expect(run('return Object.entries(Screen.Items).map(pair=>pair[0]+":"+pair[1].Name).join(",");').returned).toBe('0:A,1:B,2:FP1,3:FP2');
  expect(run('return Screen.Items.screenCollection;').error).toContain('non espone');
  expect(run('return Screen.Items(0).ownerDocument;').error).toContain('non espone');
  expect(run('Tags("Bad").Write(Screen.Items(0));').writes).toEqual({});
  expect(run('return JSON.stringify(Object.values(Screen.Items));').error).toBeDefined();
});
it('updates properties on the indexed objects while keeping collections read-only and invisible membership stable', () => {
  const {
    run
  } = scene();
  expect(run('Object.values(Screen.Items).forEach(entry=>{entry.Visible=false;});return Screen.Items.Count;')).toMatchObject({
    returned: 4
  });
  expect(run('return Screen.Items("B").Visible;').returned).toBe(false);
  expect(run('Screen.Items.Count=0;').error).toBeDefined();
  expect(run('Screen.Items[0]=null;').error).toBeDefined();
  expect(inspectHmiScript('return Screen.Items.__proto__;').error).toBeDefined();
  expect(inspectHmiScript('return Screen.Items.constructor;').error).toBeDefined();
});
it.each(['-1', '1.5', 'NaN', 'Infinity', '99', 'null', 'false', '""'])('rejects invalid selectors instead of coercing them: %s', value => {
  const {
    run
  } = scene();
  const result = run('return Screen.Items(' + value + ').Name;');
  expect(result.error).toBeDefined();
  expect(result.writes).toEqual({});
});
it('treats numeric names as exact names and duplicate names as ambiguous while indices remain deterministic', () => {
  const {
    surface,
    controller,
    run
  } = scene();
  const root = document.querySelector('main')!;
  root.insertAdjacentHTML('beforeend', '<button data-hmi-name="1">Numeric name</button><button data-hmi-name="B">Duplicate</button>');
  expect(run('return Screen.Items("1").Text;').returned).toBe('Numeric name');
  expect(run('return Screen.Items(1).Text;').returned).toBe('B');
  expect(run('return Screen.Items("B").Text;').error).toContain('duplicato');
  expect(run('return Screen.Items(5).Text;').returned).toBe('Duplicate');
  expect(surface.items().some(item => item.name === 'Outside')).toBe(false);
  controller.reset();
});
it('keeps captured collections tied to their original context and rejects them after disposal', () => {
  const {
    controller,
    manager
  } = scene();
  const catalog = parseHmiScriptCatalog({
      globalModules: [{
        name: 'Store',
        alias: 'Store',
        globalDefinition: {
          source: 'let saved;'
        },
        functions: [{
          name: 'Capture',
          parameters: [],
          source: 'saved=Screen.Items;return saved.Count;'
        }, {
          name: 'Read',
          parameters: [],
          source: 'return saved.Count;'
        }]
      }]
    }),
    contexts = createHmiScriptContextManager(),
    options = contexts.options(catalog, undefined, 'events');
  const run = (source: string) => executeHmiScript(inspectHmiScript(source).program!, {}, {
    ...options,
    screenItems: manager
  });
  expect(run('return Modules.Store.Capture();').returned).toBe(4);
  controller.reset();
  expect(run('return Modules.Store.Read();').error).toContain('attivo');
  contexts.dispose();
});
it('does not acquire geometry or font snapshots while counting and enumerating names', () => {
  const {
      run
    } = scene(),
    spy = vi.spyOn(window, 'getComputedStyle');
  try {
    expect(run('return Object.values(Screen.Items).map(entry=>entry.Name).join(",");').returned).toBe('A,B,FP1,FP2');
    expect(spy).not.toHaveBeenCalled();
    expect(run('return Screen.Items.Count;').returned).toBe(4);
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});
it('reports outdated host adapters explicitly and rejects graphics in scheduler-only contexts', () => {
  const {
    manager
  } = scene();
  const old = {
    ...manager,
    items: undefined
  };
  const result = executeHmiScript(inspectHmiScript('return Screen.Items.Count;').program!, {}, {
    screenItems: old
  });
  expect(result.error).toContain('Runtime aggiornati');
  expect(executeHmiScript(inspectHmiScript('return Screen.Items.Count;').program!, {}, {}).error).toContain('oggetti HMI');
});
it('bounds enumeration by the VM budget and collection size without invoking element setters', () => {
  const objects = Array.from({
      length: 1025
    }, (_, i) => ({
      itemId: 'item' + i,
      name: 'N' + i,
      screenId: 'root',
      flashing: []
    })),
    surface = {
      items: () => [{
        itemId: 'root',
        name: 'Root',
        screenId: 'root',
        flashing: []
      }, ...objects],
      apply: vi.fn(),
      applyProperties: vi.fn()
    },
    controller = createHmiPropertyFlashing(surface),
    manager = controller.context('item0');
  const run = (source: string, maxSteps = 20000) => executeHmiScript(inspectHmiScript(source).program!, {}, {
    screenItems: manager,
    maxSteps
  });
  expect(run('return Screen.Items.Count;').returned).toBe(1025);
  expect(run('return Object.keys(Screen.Items);').error).toContain('1024');
  objects.length = 200;
  expect(run('Object.values(Screen.Items).forEach(entry=>{entry.Visible=false;});', 20).error).toBeDefined();
  expect(surface.applyProperties).not.toHaveBeenCalled();
});
it('preserves nested scope boundaries through the serialized snapshot contract used by the preview bridge', () => {
  const {
      surface
    } = scene(),
    snapshot = JSON.parse(JSON.stringify(surface.items())),
    controller = createHmiPropertyFlashing({
      items: () => snapshot,
      apply: () => {}
    }),
    owner = snapshot.find((item: any) => item.name === 'Inner'),
    context = controller.context(owner.itemId);
  const source = 'return JSON.stringify([Screen.Items.Count,Object.values(Faceplate.Items).map(entry=>entry.Name)]);';
  const result = executeHmiScript(inspectHmiScript(source).program!, {}, {
    screenItems: context
  });
  expect(result.error).toBeUndefined();
  expect(result.returned).toBe('[4,["Inner","Nested"]]');
  controller.reset();
});
it('does not retarget a held collection when its owner moves to a different screen', () => {
  const {
      manager
    } = scene(),
    catalog = parseHmiScriptCatalog({
      globalModules: [{
        name: 'Store',
        alias: 'Store',
        globalDefinition: {
          source: 'let saved;'
        },
        functions: [{
          name: 'Capture',
          parameters: [],
          source: 'saved=Screen.Items;return saved.Count;'
        }, {
          name: 'Read',
          parameters: [],
          source: 'return saved(0).Name;'
        }]
      }]
    }),
    contexts = createHmiScriptContextManager(),
    options = contexts.options(catalog, undefined, 'events'),
    run = (source: string) => executeHmiScript(inspectHmiScript(source).program!, {}, {
      ...options,
      screenItems: manager
    });
  expect(run('return Modules.Store.Capture();').returned).toBe(4);
  document.querySelector('[data-hmi-screen="Other"]')!.append(document.querySelector('[data-hmi-name="A"]')!);
  expect(run('return Modules.Store.Read();').error).toContain('contesto originale');
  expect(run('return Modules.Store.Capture();').returned).toBe(2);
  contexts.dispose();
});
it('treats runtime popup windows as independent roots while preserving their faceplate object access', () => {
  const {
    surface,
    controller,
    run
  } = scene();
  document.body.insertAdjacentHTML('beforeend', '<section data-framecraft-runtime-popup-id="popup" data-hmi-type="HmiFaceplatePopup"><div data-hmi-name="PopupFace" data-hmi-faceplate="{}"><button data-hmi-name="PopupButton">Popup</button></div></section>');
  const owner = surface.items().find(item => item.name === 'PopupButton')!;
  const result = executeHmiScript(inspectHmiScript('return JSON.stringify([Screen.Items.Count,Faceplate.Items.Count,Faceplate.Items(0).Text]);').program!, {}, {
    screenItems: controller.context(owner.itemId)
  });
  expect(result.error).toBeUndefined();
  expect(result.returned).toBe('[1,1,"Popup"]');
  expect(run('return Screen.Items.Count;').returned).toBe(4);
  expect(run('return Screen.Items("PopupFace").Name;').error).toContain('non trovato');
});
