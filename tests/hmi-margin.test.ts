// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface } from '../scripts/hmi-property-flashing.mjs';
import { executeHmiScript, inspectHmiScript, type HmiScriptExecutionOptions, type HmiScriptTimerCallback, type HmiScriptTimerContext } from '../src/core/hmiScript';
import { createHmiScriptContextManager, parseHmiScriptCatalog } from '../src/core/hmiScriptModules';
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach(fn => fn());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
function scene(markup = '<button data-hmi-name="A" style="position:absolute;left:20px;top:30px;width:80px;height:40px;margin:2px 4px 6px 8px">Motor<svg/></button><button data-hmi-name="B" style="margin:10px">Other</button>') {
  document.body.innerHTML = '<main data-hmi-screen="Main">' + markup + '</main>';
  const surface = createHmiPropertyFlashingDomSurface(document),
    controller = createHmiPropertyFlashing(surface),
    owner = surface.items().find(item => item.name === 'A')!;
  cleanups.push(() => surface.dispose());
  const manager = controller.context(owner.itemId),
    target = document.querySelector<HTMLElement>('[data-hmi-name="A"]')!;
  const run = (source: string, options: HmiScriptExecutionOptions = {}) => {
    const result = inspectHmiScript(source);
    expect(result.error).toBeUndefined();
    return executeHmiScript(result.program!, {}, {
      screenItems: manager,
      ...options
    });
  };
  return {
    surface,
    controller,
    manager,
    target,
    run
  };
}
it('reads all four typed sides through opaque Margin references and preserves reference identity', () => {
  const {
    run
  } = scene();
  expect(run('const m=Screen.Items("A").Margin;return JSON.stringify([m.Left,m.Top,m.Right,m.Bottom,m===item.Margin,item.Name]);')).toMatchObject({
    returned: '[8,2,4,6,true,"A"]',
    writes: {}
  });
});
it('writes signed Int32 sides without replacing nodes, changing other properties or losing listeners', () => {
  const {
      target,
      run,
      controller
    } = scene(),
    svg = target.querySelector('svg'),
    click = vi.fn();
  target.addEventListener('click', click);
  expect(run('const m=item.Margin;m.Left=-12;m.Top=5;m.Right=7;m.Bottom=0;return JSON.stringify([m.Left,m.Top,m.Right,m.Bottom]);')).toMatchObject({
    returned: '[-12,5,7,0]'
  });
  expect(target.style.marginLeft).toBe('-12px');
  expect(target.style.marginTop).toBe('5px');
  expect(target.style.left).toBe('20px');
  expect(target.style.width).toBe('80px');
  expect(target.querySelector('svg')).toBe(svg);
  target.click();
  expect(click).toHaveBeenCalledTimes(1);
  controller.reset();
  expect(target.style.margin).toBe('2px 4px 6px 8px');
});
it('assigns all sides from a plain value and copies another Margin with one surface publication', () => {
  const {
      surface,
      controller,
      manager,
      run
    } = scene(),
    apply = vi.spyOn(surface, 'applyProperties');
  expect(run('item.Margin={Left:1,Top:-2,Right:3,Bottom:4};return item.Margin.Top;').returned).toBe(-2);
  expect(apply).toHaveBeenCalledTimes(1);
  expect(controller.propertyCommands().length).toBe(4);
  apply.mockClear();
  expect(run('item.Margin=Screen.Items("B").Margin;return item.Margin.Left;').returned).toBe(10);
  expect(apply).toHaveBeenCalledTimes(1);
  expect(manager.get(manager.get(manager.resolve('item'), 'Margin') as any, 'Bottom')).toBe(10);
});
it.each(['1.5', '2147483648', '-2147483649', '"4"', 'true', 'null', 'NaN', 'Infinity'])('rejects invalid side values without a publication: %s', value => {
  const {
      run,
      surface,
      target
    } = scene(),
    apply = vi.spyOn(surface, 'applyProperties');
  const result = run('item.Margin.Left=' + value + ';');
  expect(result.error).toBeDefined();
  expect(apply).not.toHaveBeenCalled();
  expect(target.style.marginLeft).toBe('8px');
  expect(result.writes).toEqual({});
});
it.each(['{Left:1,Top:2,Right:3,Bottom:"bad"}', '{Left:1,Top:2,Right:3}', '{Left:1,Top:2,Right:3,Bottom:4,Width:5}', 'null', '[]', 'item.Font'])('rejects an invalid group before changing any side: %s', value => {
  const {
      run,
      surface,
      target,
      controller
    } = scene(),
    apply = vi.spyOn(surface, 'applyProperties');
  const result = run('item.Margin=' + value + ';');
  expect(result.error).toBeDefined();
  expect(apply).not.toHaveBeenCalled();
  expect(controller.propertyCommands()).toEqual([]);
  expect(target.style.margin).toBe('2px 4px 6px 8px');
});
it('does not round unsupported base values or turn auto into an invented numeric margin', () => {
  const {
    run,
    target
  } = scene('<button data-hmi-name="A" style="margin:1.5px auto">Motor</button>');
  expect(run('return item.Margin.Left;').error).toContain('non e\' risolvibile');
  expect(run('return item.Margin.Top;').error).toContain('non e\' risolvibile');
  expect(run('item.Margin={Left:1,Top:2,Right:3,Bottom:4};return item.Margin.Top;').returned).toBe(2);
  expect(target.style.margin).toBe('2px 3px 4px 1px');
});
it('validates a copied source before modifying the target', () => {
  const {
      run,
      target,
      surface
    } = scene('<button data-hmi-name="A" style="margin:8px">Target</button><button data-hmi-name="B" style="margin:1px auto">Source</button>'),
    apply = vi.spyOn(surface, 'applyProperties');
  expect(run('item.Margin=Screen.Items("B").Margin;').error).toBeDefined();
  expect(apply).not.toHaveBeenCalled();
  expect(target.style.margin).toBe('8px');
});
it('composes the temporary layer with stylesheet importance and restores an externally changed base', () => {
  const {
    run,
    target,
    surface,
    controller
  } = scene('<style>button{margin-left:99px!important}</style><button data-hmi-name="A" style="margin:2px 4px!important">Motor</button>');
  expect(run('item.Margin.Left=10;').error).toBeUndefined();
  expect(target.style.getPropertyPriority('margin-left')).toBe('important');
  surface.suspend();
  expect(target.style.marginLeft).toBe('4px');
  target.style.setProperty('margin-left', '44px');
  surface.resume();
  expect(target.style.marginLeft).toBe('10px');
  controller.reset();
  expect(target.style.marginLeft).toBe('44px');
});
it('does not overwrite a later author change while disposing the temporary margin', () => {
  const {
    run,
    target,
    controller
  } = scene();
  expect(run('item.Margin.Left=10;').error).toBeUndefined();
  target.style.setProperty('margin-left', '44px');
  controller.reset();
  expect(target.style.marginLeft).toBe('44px');
});
it('rejects unsupported SVG surfaces and scalar export of Margin without PLC writes', () => {
  const {
    run
  } = scene('<svg data-hmi-name="A"><rect/></svg>');
  expect(run('return item.Margin.Left;').error).toContain('non espone Margin');
  const next = scene();
  const result = next.run('Tags("Unsafe").Write(item.Margin);');
  expect(result.error).toContain('riferimento grafico');
  expect(result.writes).toEqual({});
  expect(next.run('return item.Margin.ownerDocument;').error).toContain('non espone');
  expect(next.run('return item.Margin.PropertyFlashing("BackColor",true);').error).toContain('non Font o Margin');
});
it('keeps plain lookalike objects as data and isolates the property paths from Font', () => {
  const {
    run
  } = scene();
  expect(run('const value={screenItemId:"fake",screenPropertyPath:"Margin"};value.Left=4;return value.Left;').returned).toBe(4);
  expect(run('item.Margin.Size=4;').error).toContain('Margin non espone');
  expect(run('item.Font.Left=4;').error).toContain('Font non espone');
});
it('retains margin references through modules and function receivers, and rejects disposed contexts', () => {
  const {
      manager,
      controller
    } = scene(),
    catalog = parseHmiScriptCatalog({
      globalModules: [{
        name: 'Shared',
        alias: 'Shared',
        globalDefinition: {
          source: 'let saved;'
        },
        functions: [{
          name: 'Capture',
          parameters: [],
          source: 'saved=item.Margin;return saved.Left;'
        }, {
          name: 'Change',
          parameters: [],
          source: 'function move(){this.Left=12;}move.call(saved);return saved.Left;'
        }]
      }]
    }),
    contexts = createHmiScriptContextManager(),
    options = contexts.options(catalog, undefined, 'events'),
    run = (source: string) => executeHmiScript(inspectHmiScript(source).program!, {}, {
      ...options,
      screenItems: manager
    });
  expect(run('return Modules.Shared.Capture();').returned).toBe(8);
  expect(run('return Modules.Shared.Change();').returned).toBe(12);
  controller.reset();
  expect(run('return Modules.Shared.Change();').error).toContain('non e\' piu\' attivo');
  contexts.dispose();
});
it('restores the logical state after a host publication failure', () => {
  const {
    surface,
    manager,
    run,
    controller
  } = scene();
  run('item.Margin.Left=11;');
  const previous = controller.propertyCommands();
  vi.spyOn(surface, 'applyProperties').mockImplementationOnce(() => {
    throw Error('synthetic failure');
  });
  const result = run('item.Margin={Left:1,Top:2,Right:3,Bottom:4};');
  expect(result.error).toContain('synthetic failure');
  expect(controller.propertyCommands()).toEqual(previous);
  expect(manager.get(manager.get(manager.resolve('item'), 'Margin') as any, 'Left')).toBe(11);
});
it('reports an outdated adapter for complete Margin assignments', () => {
  const {
    manager
  } = scene();
  const result = executeHmiScript(inspectHmiScript('item.Margin={Left:1,Top:2,Right:3,Bottom:4};').program!, {}, {
    screenItems: {
      ...manager,
      setMargin: undefined
    }
  });
  expect(result.error).toContain('Runtime aggiornati');
});
it('uses captured Margin parts in timer callbacks and stops them after context invalidation', () => {
  const {
    run,
    target,
    controller
  } = scene();
  let callback: HmiScriptTimerCallback | undefined, captured: HmiScriptTimerContext | undefined;
  const timerManager = {
    set: (_mode: unknown, next: HmiScriptTimerCallback, _delay: unknown, context?: HmiScriptTimerContext) => {
      callback = next;
      captured = context;
      return 1;
    },
    clear: () => true
  };
  expect(run('const m=item.Margin;HMIRuntime.Timers.SetTimeout(()=>{m.Left=-10;},5);', {
    timerManager
  }).error).toBeUndefined();
  if (callback?.kind !== 'inline') throw Error('Inline timer not captured');
  expect(executeHmiScript(callback.program, {}, {
    ...captured,
    timerManager
  }).error).toBeUndefined();
  expect(target.style.marginLeft).toBe('-10px');
  controller.reset();
  expect(executeHmiScript(callback.program, {}, {
    ...captured,
    timerManager
  }).error).toContain('non e\' piu\' attivo');
});
it.each(['<div data-hmi-name="A" style="display:contents">No box</div>', '<table><tbody><tr><td data-hmi-name="A">Cell</td></tr></tbody></table>'])('rejects layouts without a supported margin box: %s', markup => {
  const {
    run,
    controller
  } = scene(markup);
  expect(run('item.Margin.Left=2;').error).toContain('non espone Margin');
  expect(controller.propertyCommands()).toEqual([]);
});
it('validates all sides of a full assignment at the host boundary before creating overrides', () => {
  const {
      manager,
      surface,
      target,
      controller
    } = scene(),
    apply = vi.spyOn(surface, 'applyProperties');
  expect(() => manager.setMargin!(manager.resolve('item'), {
    Left: 1,
    Top: 2,
    Right: 3,
    Bottom: 1.5
  })).toThrow('Int32');
  expect(apply).not.toHaveBeenCalled();
  expect(controller.propertyCommands()).toEqual([]);
  expect(target.style.margin).toBe('2px 4px 6px 8px');
});
