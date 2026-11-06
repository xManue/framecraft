// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface } from '../scripts/hmi-property-flashing.mjs';
import { executeHmiScript, executeHmiScriptAsync, inspectHmiScript, type HmiScriptExecutionOptions, type HmiScriptBox } from '../src/core/hmiScript';
import { createHmiScriptContextManager, parseHmiScriptCatalog } from '../src/core/hmiScriptModules';
const box: HmiScriptBox = {
  Left: -12.25,
  Top: 40.5,
  Width: 120.75,
  Height: 30.25
};
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach(fn => fn());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const program = (source: string) => {
  const result = inspectHmiScript(source);
  expect(result.error).toBeUndefined();
  return result.program!;
};
function scene() {
  document.body.innerHTML = '<main data-hmi-screen="Main"><button data-hmi-name="A">A</button><section data-hmi-name="FP" data-hmi-faceplate="{}"><button data-hmi-name="Inner">Inner</button></section></main>';
  const target = document.querySelector<HTMLElement>('button')!;
  const rect = vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(box.Left, box.Top, box.Width, box.Height));
  vi.spyOn(target, 'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);
  const surface = createHmiPropertyFlashingDomSurface(document),
    controller = createHmiPropertyFlashing(surface);
  cleanups.push(() => surface.dispose());
  const owner = surface.items().find(item => item.name === 'A')!,
    manager = controller.context(owner.itemId);
  const run = (source: string, options: HmiScriptExecutionOptions = {}) => executeHmiScript(program(source), {}, {
    screenItems: manager,
    ...options
  });
  return {
    target,
    rect,
    surface,
    controller,
    manager,
    owner,
    run
  };
}
it('reads a plain copied HMIBox without integer rounding or DOM exposure', () => {
  const {
    run,
    target
  } = scene();
  expect(run('const b=item.GetBoundingBoxInScreenCoordinates();return JSON.stringify(b);').returned).toBe(JSON.stringify(box));
  expect(run('const b=item.GetBoundingBoxInScreenCoordinates();b.Left=999;return item.GetBoundingBoxInScreenCoordinates().Left;').returned).toBe(box.Left);
  expect(target.style.left).toBe('');
});
it('uses the current rendered geometry on every invocation and keeps collection enumeration lazy', () => {
  const {
    run,
    rect
  } = scene();
  expect(run('return Screen.Items.Count;').returned).toBe(2);
  expect(rect).not.toHaveBeenCalled();
  expect(run('return item.GetBoundingBoxInScreenCoordinates().Width;').returned).toBe(box.Width);
  rect.mockReturnValue(new DOMRect(2, 3, 4, 5));
  expect(run('return item.GetBoundingBoxInScreenCoordinates().Width;').returned).toBe(4);
});
it('supports this, Screen, Faceplate and detached methods with explicit call/apply/bind receivers', () => {
  const {
    run,
    surface,
    controller
  } = scene();
  for (const source of ['const f=item.GetBoundingBoxInScreenCoordinates;return f.call(item).Left;', 'const f=item.GetBoundingBoxInScreenCoordinates;return f.apply(item,[]).Left;', 'const f=item.GetBoundingBoxInScreenCoordinates.bind(item);return f().Left;']) expect(run(source).returned).toBe(box.Left);
  expect(run('return Screen.GetBoundingBoxInScreenCoordinates();').error).toBeUndefined();
  expect(run('return this.GetBoundingBoxInScreenCoordinates();').error).toBeUndefined();
  const inner = surface.items().find(item => item.name === 'Inner')!;
  expect(run('return Faceplate.GetBoundingBoxInScreenCoordinates();', {
    screenItems: controller.context(inner.itemId)
  }).error).toBeUndefined();
});
it('returns null for display:none or detached elements without a CSS box', () => {
  const {
    run,
    target
  } = scene();
  vi.spyOn(target, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
  expect(run('return item.GetBoundingBoxInScreenCoordinates();').returned).toBeNull();
  target.remove();
  expect(run('return item.GetBoundingBoxInScreenCoordinates();').error).toContain('non e\' piu\' disponibile');
});
it('rejects missing receivers, parts, prototype access and arbitrary arguments', () => {
  const {
    run
  } = scene();
  expect(run('const f=item.GetBoundingBoxInScreenCoordinates;return f();').error).toContain('contesto this');
  expect(run('const f=item.GetBoundingBoxInScreenCoordinates;return f.call(item.Margin);').error).toContain('contesto this');
  expect(run('return item.Margin.GetBoundingBoxInScreenCoordinates();').error).toContain('non espone');
  expect(run('const f=item.GetBoundingBoxInScreenCoordinates;return f.call(item,1);').error).toContain('argomenti');
  expect(inspectHmiScript('item.GetBoundingBoxInScreenCoordinates(1);').error).toBeDefined();
  expect(inspectHmiScript('return item.GetBoundingBoxInScreenCoordinates().constructor;').error).toBeDefined();
});
it.each([undefined, {
  ...box,
  Width: -1
}, {
  ...box,
  Left: NaN
}, {
  ...box,
  Top: Infinity
}, {
  ...box,
  Height: '4'
}])('rejects invalid host geometry without publishing changes: %j', value => {
  const {
    run,
    manager,
    controller
  } = scene();
  expect(run('return item.GetBoundingBoxInScreenCoordinates();', {
    screenItems: {
      ...manager,
      getBoundingBox: () => value as HmiScriptBox
    }
  }).error).toContain('misura');
  expect(controller.propertyCommands()).toEqual([]);
});
it('gives upgrade guidance for old hosts and invalidates captured methods with their context', () => {
  const {
    run,
    manager,
    controller
  } = scene();
  expect(run('return item.GetBoundingBoxInScreenCoordinates();', {
    screenItems: {
      ...manager,
      getBoundingBox: undefined
    }
  }).error).toContain('Runtime aggiornati');
  controller.reset();
  expect(run('return item.GetBoundingBoxInScreenCoordinates();').error).toContain('non e\' piu\' attivo');
});
it('uses a module-held method with its original manager and rejects it after context reset', () => {
  const {
    manager,
    controller,
    run
  } = scene();
  const contexts = createHmiScriptContextManager(),
    catalog = parseHmiScriptCatalog({
      globalModules: [{
        name: 'Shared',
        alias: 'Shared',
        globalDefinition: {
          source: 'let read;let owner;'
        },
        functions: [{
          name: 'Capture',
          parameters: [],
          source: 'owner=item;read=owner.GetBoundingBoxInScreenCoordinates;return true;'
        }, {
          name: 'Measure',
          parameters: [],
          source: 'return read.call(owner).Width;'
        }]
      }]
    });
  const options = contexts.options(catalog, '/', 'events');
  expect(run('return Modules.Shared.Capture();', {
    ...options,
    screenItems: manager
  }).error).toBeUndefined();
  expect(run('return Modules.Shared.Measure();', {
    ...options,
    screenItems: manager
  }).returned).toBe(box.Width);
  controller.reset();
  expect(run('return Modules.Shared.Measure();', {
    ...options,
    screenItems: manager
  }).error).toContain('non e\' piu\' attivo');
  contexts.dispose();
});
it('awaits the preview measurement internally without requiring await or a PLC transport', async () => {
  const {
      manager,
      surface,
      owner
    } = scene(),
    measure = vi.fn(async () => ({
      ...box,
      Left: 200
    }));
  const controller = createHmiPropertyFlashing({
    ...surface,
    measureBoundingBox: measure
  });
  const result = await executeHmiScriptAsync(program('const b=item.GetBoundingBoxInScreenCoordinates();return b.Left;'), {}, {
    screenItems: controller.context(owner.itemId)
  });
  expect(result.returned).toBe(200);
  expect(result.error).toBeUndefined();
  expect(measure).toHaveBeenCalledOnce();
  expect(result.commands).toBeUndefined();
  expect(executeHmiScript(program('return item.GetBoundingBoxInScreenCoordinates().Left;'), {}, {
    screenItems: manager
  }).returned).toBe(box.Left);
});
it('rejects results if the owner or context disappears while the preview is measuring', async () => {
  const {
    surface,
    owner,
    target
  } = scene();
  let reply!: (value: HmiScriptBox) => void;
  const controller = createHmiPropertyFlashing({
    ...surface,
    measureBoundingBox: () => new Promise(resolve => {
      reply = resolve;
    })
  });
  const pending = executeHmiScriptAsync(program('return item.GetBoundingBoxInScreenCoordinates();'), {}, {
    screenItems: controller.context(owner.itemId)
  });
  await Promise.resolve();
  target.remove();
  reply(box);
  expect((await pending).error).toContain('non e\' piu\' disponibile');
});
it('cancels pending measurements and cannot run following PLC writes after abort', async () => {
  const {
      manager
    } = scene(),
    abort = new AbortController(),
    write = vi.fn();
  const pending = executeHmiScriptAsync(program('const b=item.GetBoundingBoxInScreenCoordinates();Tags("Command").Write(1);'), {}, {
    signal: abort.signal,
    screenItems: {
      ...manager,
      getBoundingBoxAsync: (_reference, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('cancelled'))))
    },
    transport: {
      read: vi.fn(),
      write
    }
  });
  await Promise.resolve();
  abort.abort();
  expect((await pending).error).toContain('Misura');
  expect(write).not.toHaveBeenCalled();
});
it('bounds preview wait time and reports a geometry error without PLC terminology', async () => {
  vi.useFakeTimers();
  const {
    manager
  } = scene();
  const pending = executeHmiScriptAsync(program('return item.GetBoundingBoxInScreenCoordinates();'), {}, {
    screenItems: {
      ...manager,
      getBoundingBoxAsync: () => new Promise(() => {})
    }
  });
  await vi.advanceTimersByTimeAsync(3001);
  const result = await pending;
  expect(result.error).toContain('Misura');
  expect(result.error).not.toContain('PLC');
});
it('rejects non-finite browser rectangles rather than inventing a box', () => {
  const {
    run,
    rect
  } = scene();
  rect.mockReturnValue({
    left: Infinity,
    top: 0,
    width: 1,
    height: 1
  } as DOMRect);
  expect(run('return item.GetBoundingBoxInScreenCoordinates();').error).toContain('misura');
});

it('does not mislabel a synchronous host-geometry request as a PLC failure', () => {
  const { manager } = scene();
  const result=executeHmiScript(program('return item.GetBoundingBoxInScreenCoordinates();'), {}, {allowAsync:true,screenItems:{...manager,getBoundingBoxAsync:async()=>box}});
  expect(result.error).toContain('misura');
  expect(result.error).not.toContain('PLC');
});
it('rejects a late measurement when its script context was reset', async () => {
  const { surface, owner }=scene(); let reply!:(value:HmiScriptBox)=>void;
  const controller=createHmiPropertyFlashing({...surface,measureBoundingBox:()=>new Promise(resolve=>{reply=resolve;})});
  const pending=executeHmiScriptAsync(program('return item.GetBoundingBoxInScreenCoordinates();'),{},{screenItems:controller.context(owner.itemId)});
  await Promise.resolve(); controller.reset(); reply(box);
  expect((await pending).error).toContain('non e\' piu\' attivo');
});

it('measures at most once per snapshot even when the preview serializes it repeatedly', () => {
  const {surface,rect}=scene();
  const snapshot=surface.items().find(item=>item.name==='A')!;
  expect(snapshot.boundingBox).toEqual(box);
  expect(snapshot.boundingBox).toEqual(box);
  expect(rect).toHaveBeenCalledOnce();
  expect(surface.items().find(item=>item.name==='A')!.boundingBox).toEqual(box);
  expect(rect).toHaveBeenCalledTimes(2);
});
