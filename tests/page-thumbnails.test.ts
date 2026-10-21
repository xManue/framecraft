// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The real preview plugin is plain ESM.
import { installPreviewThumbnailCapture, previewThumbnailSvg } from "../scripts/framecraft-vite-plugin.mjs";
import { safeThumbnail, usePageThumbnails } from "../src/state/pageThumbnails";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1kAAAAASUVORK5CYII=";
afterEach(() => { document.body.innerHTML = ''; usePageThumbnails.getState().reset(undefined); vi.restoreAllMocks(); });
describe('miniature locali del pannello aperto', () => {
  it('accetta solo piccoli PNG statici, non URL esterni, SVG o immagini enormi', () => {
    expect(safeThumbnail(png)).toBe(true);
    for (const input of [undefined, 'https://example.invalid/image.png', 'data:image/svg+xml,<svg/>', png + '!', png.repeat(3000), 'data:image/png;base64,Zm9v']) expect(safeThumbnail(input)).toBe(false);
    const bytes = atob(png.slice(22));
    const huge = bytes.slice(0, 16) + '\0\0\x10\0' + bytes.slice(20);
    expect(safeThumbnail('data:image/png;base64,' + btoa(huge))).toBe(false);
    const animated = bytes.slice(0, 37) + 'acTL' + bytes.slice(41);
    expect(safeThumbnail('data:image/png;base64,' + btoa(animated))).toBe(false);
  });
  it('separa i progetti e limita il numero di miniature in RAM', () => {
    const cache = usePageThumbnails.getState(); cache.reset('A');
    cache.put('B', 'page', png); expect(Object.keys(usePageThumbnails.getState().entries)).toHaveLength(0);
    for (let index = 0; index < 70; index++) cache.put('A', String(index), png);
    expect(Object.keys(usePageThumbnails.getState().entries)).toHaveLength(64);
    expect(usePageThumbnails.getState().entries['0']).toBeUndefined();
    cache.reset('B'); expect(usePageThumbnails.getState().entries).toEqual({});
    cache.put('A', 'late-result', png); expect(usePageThumbnails.getState().entries).toEqual({});
    expect(localStorage.getItem('framecraft.thumbnails')).toBeNull();
  });
  it('clona la vista senza eseguire script, caricare risorse o includere password e token', () => {
    document.body.innerHTML = '<main style="background-image:url(https://external.invalid/photo.png)"><h1>Linea A</h1><input type="password" value="SYNTHETIC_PASSWORD"><input id="api-token" value="SYNTHETIC_TOKEN"><textarea>Nota visibile</textarea><iframe src="about:blank"></iframe><script>window.never=true</script><div onclick="danger()">Produzione</div></main>';
    const before = document.body.innerHTML, fetch = vi.spyOn(globalThis, 'fetch');
    const snapshot = previewThumbnailSvg(window);
    expect(snapshot.svg).toContain('Linea A'); expect(snapshot.svg).toContain('Nota visibile');
    for (const secret of ['SYNTHETIC_PASSWORD', 'SYNTHETIC_TOKEN', '<script', '<iframe', 'onclick', 'external.invalid', 'danger()']) expect(snapshot.svg).not.toContain(secret);
    expect(fetch).not.toHaveBeenCalled(); expect(document.body.innerHTML).toBe(before);
  });
  it('ferma la cattura di pagine troppo complesse senza modificare il documento', () => {
    document.body.innerHTML = '<div>' + '<span>x</span>'.repeat(2300) + '</div>';
    expect(() => previewThumbnailSvg(window)).toThrow('THUMBNAIL_COMPLEX');
    expect(document.querySelectorAll('span')).toHaveLength(2300);
  });
});

describe('protocollo cattura senza navigazione o comandi PLC', () => {
  const requestId = '1c67af43-c6f5-4ccb-8b33-562122384a4d';
  function fixture(capture = vi.fn().mockResolvedValue(png)) {
    let receive: (event: unknown) => Promise<void> = async () => {}, enabled = true, time = 1000;
    const parent = { postMessage: vi.fn() }, view = { parent, location: { pathname: '/page' }, __framecraftCurrentPage: 'Upstair', performance: { now: () => time }, addEventListener: (_: string, fn: typeof receive) => { receive = fn; }, removeEventListener: vi.fn() };
    const stop = installPreviewThumbnailCapture(view, { pageId: () => 'document-1', allowedOrigin: () => 'http://localhost:1420', enabled: () => enabled }, capture);
    const send = (data = {}, origin = 'http://localhost:1420', source: unknown = parent) => receive({ data: { type: 'framecraft:thumbnail-capture', requestId, pageId: 'document-1', ...data }, origin, source });
    return { parent, view, capture, stop, send, mode: (value: boolean) => { enabled = value; }, tick: () => { time += 1000; } };
  }
  it('richiede parent, origine fissata, nonce e documento correnti', async () => {
    const f = fixture();
    await f.send({}, 'https://other.invalid'); await f.send({}, 'http://localhost:1420', {});
    await f.send({ requestId: 'invalid' }); await f.send({ pageId: 'old-document' });
    expect(f.capture).not.toHaveBeenCalled(); expect(f.parent.postMessage).not.toHaveBeenCalled();
    await f.send(); expect(f.capture).toHaveBeenCalledTimes(1);
    expect(f.parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'framecraft:thumbnail-result', image: png, path: '/page', statePage: 'Upstair' }), 'http://localhost:1420');
  });
  it('non cattura il Runtime in Usa pannello e rende disponibile un handshake economico', async () => {
    const f = fixture(); f.mode(false); await f.send(); expect(f.capture).not.toHaveBeenCalled();
    f.mode(true); await f.send({ type: 'framecraft:thumbnail-hello' });
    expect(f.capture).not.toHaveBeenCalled(); expect(f.parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'framecraft:thumbnail-ready', pageId: 'document-1' }), 'http://localhost:1420');
  });
  it('non espone la cattura a un sito remoto anche se è riuscito a fissare l’origine del parent', async () => {
    const parent = { postMessage: vi.fn() }, capture = vi.fn(); let receive!: (event: unknown) => Promise<void>;
    const view = { parent, location: { pathname: '/' }, performance: { now: () => 0 }, addEventListener: (_: string, handler: typeof receive) => { receive = handler; }, removeEventListener: vi.fn() };
    installPreviewThumbnailCapture(view, { pageId: () => 'doc', allowedOrigin: () => 'https://remote.invalid', enabled: () => true }, capture);
    await receive({ source: parent, origin: 'https://remote.invalid', data: { type: 'framecraft:thumbnail-hello', requestId } });
    await receive({ source: parent, origin: 'https://remote.invalid', data: { type: 'framecraft:thumbnail-capture', requestId, pageId: 'doc' } });
    expect(capture).not.toHaveBeenCalled(); expect(parent.postMessage).not.toHaveBeenCalled();
  });
  it('non ripete una cattura concorrente e scarta il risultato dopo un cambio pagina', async () => {
    let resolve!: (value: string) => void;
    const f = fixture(vi.fn().mockImplementation(() => new Promise<string>(done => { resolve = done; })));
    const pending = f.send(); await f.send(); expect(f.capture).toHaveBeenCalledTimes(1);
    f.view.__framecraftCurrentPage = 'Other'; resolve(png); await pending;
    expect(f.parent.postMessage).not.toHaveBeenCalled();
  });
  it('ignora il risultato dopo la chiusura e contiene gli errori della cattura', async () => {
    let resolve!: (value: string) => void;
    const f = fixture(vi.fn().mockImplementation(() => new Promise<string>(done => { resolve = done; })));
    const pending = f.send(); f.stop(); resolve(png); await pending; expect(f.parent.postMessage).not.toHaveBeenCalled();
    const failure = fixture(vi.fn().mockRejectedValue(new Error('Render failed')));
    await expect(failure.send()).resolves.toBeUndefined(); expect(failure.parent.postMessage).not.toHaveBeenCalled();
  });
});
