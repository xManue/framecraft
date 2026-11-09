// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface } from '../scripts/hmi-property-flashing.mjs';
import { executeHmiScript, inspectHmiScript, type HmiScriptExecutionOptions } from '../src/core/hmiScript';
import { createHmiScriptContextManager, parseHmiScriptCatalog } from '../src/core/hmiScriptModules';
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
function scene(styles = 'position:absolute;left:20px;top:30px;width:100px;height:40px;transform:matrix(0,2,-3,0,11,17);rotate:10deg;scale:1.5 2') {
  document.body.innerHTML = '<main data-hmi-screen="Main"><button data-hmi-name="A" style="' + styles + '">A</button></main>';
  const target = document.querySelector<HTMLElement>('button')!,
    surface = createHmiPropertyFlashingDomSurface(document),
    controller = createHmiPropertyFlashing(surface),
    owner = surface.items().find(item => item.name === 'A')!,
    manager = controller.context(owner.itemId);
  cleanup.push(() => surface.dispose());
  const run = (code: string, options: HmiScriptExecutionOptions = {}) => {
    const parsed = inspectHmiScript(code);
    expect(parsed.error).toBeUndefined();
    return executeHmiScript(parsed.program!, {}, {
      screenItems: manager,
      ...options
    });
  };
  return {
    target,
    surface,
    controller,
    manager,
    run
  };
}
const matrix = (value: string) => value.slice(7, -1).split(',').map(Number);
it('reads local planar orientation including matrix, individual rotation and nonuniform scale', () => {
  const {
    run
  } = scene();
  expect(run('return item.RotationAngle;').returned).toBe(100);
});
it('sets the absolute orientation while preserving translation, stretch, skew, reflection and pivot', () => {
  const {
    run,
    target,
    controller
  } = scene('transform:matrix(-2,0,1,3,11,17);transform-origin:10px 20px;translate:4px 8px;rotate:20deg;scale:1.5 2');
  const original = target.style.cssText;
  expect(run('item.RotationAngle=40;return item.RotationAngle;').returned).toBe(40);
  expect(target.style.rotate).toBe('none');
  expect(target.style.scale).toBe('none');
  expect(target.style.transformOrigin).toBe('10px 20px');
  expect(target.style.translate).toBe('4px 8px');
  const [a, b, c, d, e, f] = matrix(target.style.transform);
  expect(Math.atan2(b, a) * 180 / Math.PI).toBeCloseTo(40, 8);
  expect(a * a + b * b).toBeCloseTo(9, 8);
  expect(c * c + d * d).toBeCloseTo(38.25, 8);
  expect(a * c + b * d).toBeCloseTo(-4.5, 8);
  expect(a * d - b * c).toBeCloseTo(-18, 8);
  expect(e).toBeCloseTo(Math.cos(Math.PI / 9) * 16.5 - Math.sin(Math.PI / 9) * 34, 8);
  expect(f).toBeCloseTo(Math.sin(Math.PI / 9) * 16.5 + Math.cos(Math.PI / 9) * 34, 8);
  controller.reset();
  expect(target.style.cssText).toBe(original);
});
it.each([-32768, -360, -45, 0, 360, 32767])('accepts the full signed Int16 range without clamping or coercion: %s', value => {
  const {
    run
  } = scene('rotate:0deg');
  expect(run('item.RotationAngle=' + value + ';return item.RotationAngle;').returned).toBe(value);
});
it.each(['1.5', '32768', '-32769', '"20"', 'null', 'true'])('rejects invalid angles before a publication: %s', value => {
  const {
    run,
    surface,
    controller
  } = scene();
  const apply = vi.spyOn(surface, 'applyProperties');
  expect(run('item.RotationAngle=' + value + ';').error).toContain('Int16');
  expect(apply).not.toHaveBeenCalled();
  expect(controller.propertyCommands()).toEqual([]);
});
it('keeps complete individual turns and refuses unrepresentable fractional CSS input until explicitly set', () => {
  const {
    run
  } = scene('rotate:1.25turn');
  expect(run('return item.RotationAngle;').returned).toBe(450);
  const fractional = scene('rotate:12.5deg');
  expect(fractional.run('return item.RotationAngle;').error).toContain('Int16');
  expect(fractional.run('item.RotationAngle=13;return item.RotationAngle;').returned).toBe(13);
});
it('reads supported CSS angle units and accepts an axis pointing along negative Z', () => {
  expect(scene('rotate:0.5turn').run('return item.RotationAngle;').returned).toBe(180);
  expect(scene('rotate:100grad').run('return item.RotationAngle;').returned).toBe(90);
  expect(scene('rotate:0 0 -1 30deg').run('return item.RotationAngle;').returned).toBe(-30);
});
it.each(['rotate:x 30deg', 'scale:1 2 3', 'transform:matrix3d(1,0,0,0,0,1,0.4,0,0,0,1,0,0,0,0,1)'])('does not flatten an unsupported three-dimensional transform: %s', styles => {
  const {
    run,
    target,
    controller
  } = scene(styles);
  const original = target.getAttribute('style');
  expect(run('item.RotationAngle=20;').error).toContain('non espone');
  expect(target.getAttribute('style')).toBe(original);
  expect(controller.propertyCommands()).toEqual([]);
});
it('accepts planar matrix3d and rejects malformed non-finite matrices', () => {
  expect(scene('transform:matrix3d(0,2,0,0,-3,0,0,0,0,0,1,0,11,17,0,1)').run('return item.RotationAngle;').returned).toBe(90);
  expect(scene('transform:matrix(1,0,0,1,Infinity,0)').run('item.RotationAngle=20;').error).toContain('non espone');
});
it('restores original priorities and retains subsequent external CSS changes', () => {
  const {
    run,
    target,
    controller
  } = scene('rotate:10deg !important;scale:2;transform:matrix(1,0,0,1,7,9) !important');
  run('item.RotationAngle=60;');
  expect(target.style.getPropertyPriority('rotate')).toBe('important');
  target.style.setProperty('transform', 'matrix(2,0,0,2,1,3)', 'important');
  controller.reset();
  expect(target.style.transform).toBe('matrix(2,0,0,2,1,3)');
  expect(target.style.rotate).toBe('10deg');
  expect(target.style.scale).toBe('2');
  expect(target.style.getPropertyPriority('rotate')).toBe('important');
});
it('suspends and reapplies the same orientation without accumulating repeated rotations', () => {
  const {
    run,
    target,
    surface
  } = scene();
  run('item.RotationAngle=30;');
  const transformed = target.style.transform;
  surface.suspend();
  expect(target.style.rotate).toBe('10deg');
  surface.resume();
  expect(target.style.transform).toBe(transformed);
  run('item.Text="Motor";');
  expect(target.style.transform).toBe(transformed);
});
it('rolls back the scalar override and the graphical layer after a host publication fails', () => {
  const {
    run,
    surface,
    controller,
    target
  } = scene();
  run('item.RotationAngle=40;');
  const commands = controller.propertyCommands(),
    before = target.style.transform;
  const publish = surface.applyProperties.bind(surface);
  vi.spyOn(surface, 'applyProperties').mockImplementationOnce(commands => {
    publish(commands);
    throw Error('synthetic host failure');
  });
  expect(run('item.RotationAngle=60;').error).toContain('synthetic host failure');
  expect(controller.propertyCommands()).toEqual(commands);
  expect(target.style.transform).toBe(before);
  expect(run('return item.RotationAngle;').returned).toBe(40);
});
it('supports script modules while rejecting captured references after context invalidation', () => {
  const {
    run,
    manager,
    controller
  } = scene();
  const catalog = parseHmiScriptCatalog({
    globalModules: [{
      name: 'Shared',
      alias: 'Shared',
      globalDefinition: {
        source: 'let saved;'
      },
      functions: [{
        name: 'Save',
        parameters: [],
        source: 'saved=item;return saved.RotationAngle;'
      }, {
        name: 'Turn',
        parameters: [],
        source: 'saved.RotationAngle=45;return saved.RotationAngle;'
      }]
    }]
  });
  const contexts = createHmiScriptContextManager(),
    options = contexts.options(catalog, undefined, 'events');
  expect(run('return Modules.Shared.Save();', {
    ...options,
    screenItems: manager
  }).returned).toBe(100);
  expect(run('return Modules.Shared.Turn();', {
    ...options,
    screenItems: manager
  }).returned).toBe(45);
  controller.reset();
  expect(run('return Modules.Shared.Turn();', {
    ...options,
    screenItems: manager
  }).error).toContain('non e\' piu\' attivo');
  contexts.dispose();
});
it('validates raw surface commands and rejects access through nested Font or Margin parts', () => {
  const {
    surface,
    target,
    run,
    controller
  } = scene();
  const id = surface.items().find(item => item.name === 'A')!.itemId;
  surface.applyProperties([{
    itemId: id,
    property: 'RotationAngle',
    value: 32768
  }]);
  expect(target.style.rotate).toBe('10deg');
  expect(run('item.Margin.RotationAngle=30;').error).toContain('non espone');
  expect(run('item.Font.RotationAngle=30;').error).toContain('non espone');
  expect(controller.propertyCommands()).toEqual([]);
});
it.each([NaN, Infinity, -Infinity])('rejects non-finite values at the host boundary: %s', value => {
  const {
      manager,
      surface,
      controller
    } = scene(),
    apply = vi.spyOn(surface, 'applyProperties');
  expect(() => manager.set(manager.resolve('item'), 'RotationAngle', value)).toThrow('Int16');
  expect(apply).not.toHaveBeenCalled();
  expect(controller.propertyCommands()).toEqual([]);
});
it('preserves the declared angle when a scale axis collapses the visible shape', () => {
  const {
    run,
    target
  } = scene('rotate:45deg;scale:0 -1');
  expect(run('return item.RotationAngle;').returned).toBe(45);
  run('item.RotationAngle=45;');
  const [a, b, c, d] = matrix(target.style.transform);
  expect(a).toBeCloseTo(0);
  expect(b).toBeCloseTo(0);
  expect(c).toBeCloseTo(Math.SQRT1_2);
  expect(d).toBeCloseTo(-Math.SQRT1_2);
});
