// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: bridge }));
import { ProjectExplorer } from "../src/project-manager/ProjectExplorer";
import { useEditorStore } from "../src/state/editorStore";

const project = { root: 'C:/panel', name: 'Linea prova', framework: 'vite', language: 'javascript', files: [
  { name: 'src', path: 'C:/panel/src', kind: 'directory', children: [{ name: 'Page.jsx', path: 'C:/panel/src/Page.jsx', kind: 'file' }] },
  ...['framecraft.plc.json', 'style.css', 'manual.md', 'image.png', 'archive.zip'].map((name) => ({ name, path: 'C:/panel/' + name, kind: 'file' })),
] } as never;
let before: ReturnType<typeof useEditorStore.getState>;
let container: HTMLDivElement, root: Root;
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('.tree-row')].find((item) => item.querySelector('.tree-name')?.textContent === name)!;
async function click(name: string) { await act(async () => { button(name).focus(); button(name).click(); }); }

beforeEach(async () => {
  before = useEditorStore.getState(); vi.clearAllMocks();
  bridge.readFile.mockResolvedValue('{"name":"prova"}');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.removeAttribute('open'); });
  const document = parseSource('C:/panel/Current.jsx', 'export default function Current(){return <button>Avvia</button>}');
  useEditorStore.setState({ project, document, selectedId: document.roots[0], dirty: true, viewMode: 'visual', previewUrl: 'http://127.0.0.1:4173', previewStatus: 'ready', history: [{ file: document.file, source: document.source }], future: [], reloadRecovery: undefined });
  container = window.document.createElement('div'); window.document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(ProjectExplorer)));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); useEditorStore.setState(before); });

describe('apertura file dal pannello File', () => {
  it.each(['framecraft.plc.json', 'style.css', 'manual.md'])('legge %s e non sostituisce o salva la bozza aperta', async (name) => {
    const state = useEditorStore.getState();
    await click(name);
    const content = document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="Contenuto di ${name}"]`)!;
    expect(content.readOnly).toBe(true); expect(content.value).toBe('{"name":"prova"}');
    expect(bridge.readFile).toHaveBeenCalledWith('C:/panel/' + name); expect(bridge.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().document).toBe(state.document); expect(useEditorStore.getState().history).toBe(state.history); expect(useEditorStore.getState().dirty).toBe(true);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Chiudi file"]')!.click());
    expect(document.querySelector('dialog')).toBeNull(); expect(document.activeElement).toBe(button(name));
  });
  it('apre davvero un sorgente in vista affiancata e rispetta il salvataggio della bozza precedente', async () => {
    const original = useEditorStore.getState().document!;
    bridge.readFile.mockResolvedValue('export default function Page(){return <main>Pagina</main>}');
    await act(async () => { button('Page.jsx').click(); await vi.waitFor(() => expect(useEditorStore.getState().document?.file).toBe('C:/panel/src/Page.jsx')); });
    expect(bridge.writeFile).toHaveBeenCalledWith(original.file, original.source);
    expect(useEditorStore.getState().viewMode).toBe('split');
    expect(useEditorStore.getState().document?.source).toContain('Pagina');
  });
  it('non abbandona una bozza non salvabile e non cambia la vista', async () => {
    const source = useEditorStore.getState().document!; bridge.writeFile.mockRejectedValueOnce(new Error('EPERM'));
    await click('Page.jsx');
    expect(useEditorStore.getState().document).toBe(source); expect(useEditorStore.getState().dirty).toBe(true); expect(useEditorStore.getState().viewMode).toBe('visual');
    expect(bridge.readFile).not.toHaveBeenCalled();
  });
  it('mostra una vera URL immagine locale e non tenta di decodificare un PNG come testo', async () => {
    await click('image.png');
    expect(document.querySelector<HTMLImageElement>('dialog img')?.src).toBe('http://127.0.0.1:4173/@fs/C:/panel/image.png');
    expect(bridge.readFile).not.toHaveBeenCalled(); expect(bridge.writeFile).not.toHaveBeenCalled();
  });
  it('spiega un formato non supportato senza ignorare il clic', async () => {
    await click('archive.zip');
    expect(document.querySelector('dialog')?.textContent).toContain('non può essere visualizzato');
    expect(bridge.readFile).not.toHaveBeenCalled();
  });
  it('mostra un errore leggibile e permette di riprovare la lettura', async () => {
    bridge.readFile.mockRejectedValueOnce(new Error('EPERM: permission denied'));
    await click('style.css'); expect(document.querySelector('dialog [role="alert"]')?.textContent).toContain('non può accedere');
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find((item) => item.textContent?.includes('Riprova lettura'))!.click());
    expect(document.querySelector<HTMLTextAreaElement>('dialog textarea')?.value).toBe('{"name":"prova"}');
  });
  it('chiude con Escape attraverso il comportamento cancel del dialogo', async () => {
    await click('manual.md');
    await act(async () => document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { bubbles: false, cancelable: true })));
    expect(document.querySelector('dialog')).toBeNull(); expect(document.activeElement).toBe(button('manual.md'));
  });
  it.each(['manual.md', 'archive.zip'])('mantiene Tab e Shift+Tab nella consultazione di %s', async (name) => {
    await click(name);
    const first = document.querySelector<HTMLButtonElement>('dialog [data-close-file]')!;
    const last = document.querySelector<HTMLButtonElement>('dialog footer button')!;
    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    await act(async () => last.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true); expect(document.activeElement).toBe(first);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    await act(async () => first.dispatchEvent(back));
    expect(back.defaultPrevented).toBe(true); expect(document.activeElement).toBe(last);
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });
});
