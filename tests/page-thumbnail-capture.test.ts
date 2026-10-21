// @vitest-environment jsdom
import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePageThumbnailCapture } from '../src/preview/usePageThumbnailCapture';
import { usePageThumbnails } from '../src/state/pageThumbnails';
import { useEditorStore } from '../src/state/editorStore';
const initial = useEditorStore.getState(), png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1kAAAAASUVORK5CYII=';
let root: Root, host: HTMLDivElement, frame: HTMLIFrameElement, post: ReturnType<typeof vi.spyOn>;
const calls = () => post.mock.calls as [{ type: string; requestId: string }, string][];
function Fixture() { const grid = useRef<HTMLDivElement>(null); usePageThumbnailCapture(grid); return createElement('div', { ref: grid }, createElement('iframe', { src: 'https://preview.invalid/a', title: 'Project preview' })); }
const emit = (data: unknown, origin = 'https://preview.invalid', source: MessageEventSource | null = frame.contentWindow) => window.dispatchEvent(new MessageEvent('message', { origin, source, data }));
async function hello() { await act(async () => { await vi.advanceTimersByTimeAsync(1100); }); return calls().find(call => call[0].type === 'framecraft:thumbnail-hello')![0].requestId; }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.useFakeTimers(); usePageThumbnails.getState().reset(undefined);
  useEditorStore.setState({ ...initial, project: { root: 'C:/synthetic' } as never, activePageId: 'a', pages: [{ id: 'a', name: 'A', route: '/a', file: 'A.tsx' }], previewUrl: 'https://preview.invalid', previewPath: '/a', previewStatus: 'ready', interactionMode: 'edit', document: { version: 1 } as never }, true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(Fixture))); frame = host.querySelector('iframe')!; post = vi.spyOn(frame.contentWindow!, 'postMessage');
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); useEditorStore.setState(initial, true); usePageThumbnails.getState().reset(undefined); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('contesto delle miniature nel solo iframe già aperto', () => {
  it('fa handshake e cattura solo la pagina attesa, senza navigare o caricare iframe aggiuntivi', async () => {
    const requestId = await hello(), source = frame.src;
    await act(async () => emit({ type: 'framecraft:thumbnail-ready', requestId, pageId: 'doc', path: '/a' }));
    expect(post).toHaveBeenLastCalledWith({ type: 'framecraft:thumbnail-capture', requestId, pageId: 'doc' }, 'https://preview.invalid');
    await act(async () => emit({ type: 'framecraft:thumbnail-result', requestId, pageId: 'doc', path: '/a', image: png }));
    expect(usePageThumbnails.getState().entries.a).toBe(png);
    expect(frame.src).toBe(source); expect(host.querySelectorAll('iframe')).toHaveLength(1);
  });
  it('scarta altre origini, finestre, percorsi e risultati non richiesti', async () => {
    const requestId = await hello();
    const ready = { type: 'framecraft:thumbnail-ready', requestId, pageId: 'doc', path: '/a' };
    await act(async () => { emit(ready, 'https://other.invalid'); emit(ready, 'https://preview.invalid', window); emit({ ...ready, path: '/wrong' }); });
    expect(calls().filter(call => call[0].type === 'framecraft:thumbnail-capture')).toHaveLength(0);
    await act(async () => emit({ type: 'framecraft:thumbnail-result', requestId, pageId: 'doc', path: '/a', image: png }));
    expect(usePageThumbnails.getState().entries).toEqual({});
  });
  it('non attribuisce una risposta tardiva a una nuova pagina o a un nuovo progetto', async () => {
    const requestId = await hello();
    await act(async () => emit({ type: 'framecraft:thumbnail-ready', requestId, pageId: 'doc', path: '/a' }));
    await act(async () => useEditorStore.setState({ activePageId: 'b', previewPath: '/b' }));
    await act(async () => emit({ type: 'framecraft:thumbnail-result', requestId, pageId: 'doc', path: '/a', image: png }));
    expect(usePageThumbnails.getState().entries).toEqual({});
    await act(async () => useEditorStore.setState({ project: { root: 'C:/other' } as never }));
    expect(usePageThumbnails.getState().project).toBe('C:/other');
    expect(usePageThumbnails.getState().entries).toEqual({});
  });
  it('interrompe le richieste passando a Usa pannello e non cattura una schermata di stato diversa', async () => {
    await act(async () => useEditorStore.setState({ pages: [{ id: 'a', name: 'A', route: '/a', file: 'A.tsx', stateValue: 'Upstair' }] }));
    const requestId = await hello();
    await act(async () => emit({ type: 'framecraft:thumbnail-ready', requestId, pageId: 'doc', path: '/a', statePage: 'Downstair' }));
    expect(calls().filter(call => call[0].type === 'framecraft:thumbnail-capture')).toHaveLength(0);
    await act(async () => useEditorStore.setState({ interactionMode: 'navigate' }));
    post.mockClear(); await act(async () => { emit({ type: 'framecraft:ready' }); await vi.advanceTimersByTimeAsync(2000); });
    expect(post).not.toHaveBeenCalled();
  });
});
