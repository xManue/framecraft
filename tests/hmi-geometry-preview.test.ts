// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createHmiGeometryPreviewClient, installHmiGeometryPreviewEndpoint } from '../scripts/hmi-geometry-preview.mjs';
const box = {
  Left: -4.5,
  Top: 3,
  Width: 80,
  Height: 40
};
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn());
  vi.useRealTimers();
});
function setup() {
  const parent = new EventTarget() as unknown as Window,
    child = new EventTarget() as unknown as Window;
  Object.assign(parent, {
    crypto,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window)
  });
  Object.assign(child, {
    parent
  });
  const parentOrigin = 'http://localhost:1420',
    childOrigin = 'http://localhost:4173';
  const sendChild = vi.fn((data: unknown, _origin: string) => child.dispatchEvent(new MessageEvent('message', {
    data,
    origin: parentOrigin,
    source: parent
  })));
  const sendParent = vi.fn((data: unknown, _origin: string) => parent.dispatchEvent(new MessageEvent('message', {
    data,
    origin: childOrigin,
    source: child
  })));
  Object.assign(child, {
    postMessage: sendChild
  });
  Object.assign(parent, {
    postMessage: sendParent
  });
  let page = {
    window: child,
    origin: childOrigin,
    pageId: 'page-one'
  };
  const surface = {
    items: vi.fn(() => [{
      itemId: 'a',
      name: 'A',
      screenId: 'screen',
      flashing: [],
      boundingBox: box
    }]),
    apply: () => {}
  };
  const stop = installHmiGeometryPreviewEndpoint(child, surface, () => ({
    pageId: 'page-one',
    origin: parentOrigin
  }));
  cleanup.push(stop);
  const client = createHmiGeometryPreviewClient(parent, () => page, 100);
  cleanup.push(() => client.cancel());
  return {
    parent,
    child,
    page,
    setPage: (next: typeof page) => {
      page = next;
    },
    client,
    surface,
    stop,
    sendChild,
    sendParent,
    parentOrigin,
    childOrigin
  };
}
it('round trips a current measurement with an exact window, origin, page and request ID', async () => {
  const s = setup();
  expect(await s.client.measure('a', new AbortController().signal)).toEqual(box);
  expect(s.sendChild.mock.calls[0][1]).toBe(s.childOrigin);
  expect(s.sendParent.mock.calls[0][1]).toBe(s.parentOrigin);
});
it('rejects stale pages and untrusted sources/origins before measuring', () => {
  const s = setup(),
    query = {
      type: 'framecraft:geometry-query',
      requestId: 'id',
      pageId: 'page-one',
      itemId: 'a'
    };
  for (const event of [new MessageEvent('message', {
    data: query,
    origin: 'http://evil',
    source: s.parent
  }), new MessageEvent('message', {
    data: query,
    origin: s.parentOrigin,
    source: s.child
  }), new MessageEvent('message', {
    data: {
      ...query,
      pageId: 'old'
    },
    origin: s.parentOrigin,
    source: s.parent
  })]) s.child.dispatchEvent(event);
  expect(s.surface.items).not.toHaveBeenCalled();
  expect(s.sendParent).not.toHaveBeenCalled();
});
it('ignores forged responses and rejects a response after navigation', async () => {
  const s = setup();
  s.stop();
  const pending = s.client.measure('a', new AbortController().signal);
  const query = s.sendChild.mock.calls[0][0] as {
    requestId: string;
  };
  const data = {
    type: 'framecraft:geometry-result',
    requestId: query.requestId,
    pageId: 'page-one',
    box
  };
  s.parent.dispatchEvent(new MessageEvent('message', {
    data,
    origin: 'http://evil',
    source: s.child
  }));
  s.setPage({
    ...s.page,
    pageId: 'page-two'
  });
  s.parent.dispatchEvent(new MessageEvent('message', {
    data,
    origin: s.childOrigin,
    source: s.child
  }));
  await expect(pending).rejects.toThrow('annullata');
});
it('cancels pending requests on abort, timeout or explicit page cleanup', async () => {
  vi.useFakeTimers();
  const s = setup();
  s.stop();
  const abort = new AbortController(),
    first = s.client.measure('a', abort.signal);
  abort.abort();
  await expect(first).rejects.toThrow('annullata');
  const second = s.client.measure('a', new AbortController().signal);
  const failure = expect(second).rejects.toThrow('non ha risposto');
  await vi.advanceTimersByTimeAsync(101);
  await failure;
  const third = s.client.measure('a', new AbortController().signal);
  s.client.cancel();
  await expect(third).rejects.toThrow('annullata');
  expect(await s.client.measure('a', AbortSignal.abort()).catch(e => e.message)).toContain('non pronta');
});
it.each([{
  ...box,
  Width: -1
}, {
  ...box,
  Top: Infinity
}, {
  ...box,
  Left: '1'
}, undefined])('rejects malformed host responses: %j', async bad => {
  const s = setup();
  s.stop();
  const pending = s.client.measure('a', new AbortController().signal);
  const query = s.sendChild.mock.calls[0][0] as {
    requestId: string;
  };
  s.parent.dispatchEvent(new MessageEvent('message', {
    data: {
      type: 'framecraft:geometry-result',
      requestId: query.requestId,
      pageId: 'page-one',
      box: bad
    },
    origin: s.childOrigin,
    source: s.child
  }));
  await expect(pending).rejects.toThrow('misura non valida');
});
it('reports missing objects without making arbitrary commands available', async () => {
  const s = setup();
  await expect(s.client.measure('missing', new AbortController().signal)).rejects.toThrow('non e\' piu\' presente');
  const reply = s.sendParent.mock.calls[0][0] as object;
  expect(Object.keys(reply)).toEqual(['type', 'pageId', 'requestId', 'error']);
});
it('bounds outstanding requests and removes all message listeners on cleanup', async () => {
  const s = setup();
  s.stop();
  const waits = Array.from({
    length: 32
  }, () => s.client.measure('a', new AbortController().signal).catch(e => e.message));
  await expect(s.client.measure('a', new AbortController().signal)).rejects.toThrow('troppe');
  s.client.cancel();
  expect((await Promise.all(waits)).every(message => message.includes('annullata'))).toBe(true);
});
