// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/editor/TopBar", () => ({ TopBar: () => null }));
vi.mock("../src/editor/ActivityBar", () => ({ ActivityBar: () => null }));
vi.mock("../src/editor/LeftPanel", () => ({ LeftPanel: () => createElement('aside', { className: 'left-panel' }) }));
vi.mock("../src/editor/Workspace", () => ({ Workspace: () => createElement('div', { className: 'workspace' }) }));
vi.mock("../src/editor/ConsolePanel", () => ({ ConsolePanel: () => null }));
vi.mock("../src/inspector/Inspector", () => ({ Inspector: () => createElement('aside', { className: 'inspector' }, createElement('textarea', { defaultValue: 'Bozza non applicata' })) }));
vi.mock("../src/editor/AiProjectChat", () => ({ AiProjectChat: () => createElement('div', null, 'Chat del progetto') }));
vi.mock("../src/editor/AiContextMenu", () => ({ AiContextMenu: () => null }));
import { AppShell } from "../src/editor/AppShell";
import { useEditorStore } from "../src/state/editorStore";
import { useEditorAi } from "../src/state/editorAi";
import { parseSource } from "../src/source-parser/parseSource";
const initial = useEditorStore.getState(), initialAi = useEditorAi.getState();
let root: Root, host: HTMLDivElement;
const document = parseSource('C:/synthetic/Page.tsx', 'export function Page(){return <main><button>Avvia</button><span>Stato</span></main>}');
const nodes = Object.values(document.nodes), buttonId = nodes.find(node => node.type === 'button')!.id, spanId = nodes.find(node => node.type === 'span')!.id;
const panel = () => host.querySelector<HTMLElement>('#editor-property-panel')!;
const toggle = () => host.querySelector<HTMLButtonElement>('.workspace-heading button')!;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  useEditorStore.setState({ ...initial, document, selectedId: undefined, unresolvedSelection: undefined, selectionInfo: undefined, multiSelection: [], consoleEntries: [], propertiesExpandedAt: undefined, textFocusRequestedAt: undefined, interactionMode: 'edit', standalonePreviewOpen: false, consoleOpen: false }, true);
  useEditorAi.setState({ ...initialAi, open: false }, true);
  host = window.document.createElement('div'); window.document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); useEditorStore.setState(initial, true); useEditorAi.setState(initialAi, true); vi.restoreAllMocks(); });
describe('canvas ampio e proprietà a richiesta', () => {
  it('lascia libera la colonna destra senza selezione e la apre selezionando un elemento', async () => {
    await act(async () => root.render(createElement(AppShell)));
    expect(panel().hidden).toBe(true); expect(toggle().disabled).toBe(true);
    expect(host.querySelector('.editor-grid')?.classList.contains('inspector-closed')).toBe(true);
    expect(host.querySelector('.pane-resizer-inspector')).toBeNull();
    await act(async () => useEditorStore.setState({ selectedId: buttonId }));
    expect(panel().hidden).toBe(false); expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.pane-resizer-inspector')).not.toBeNull();
  });
  it('nasconde e riapre le proprietà senza perdere selezione, bozza o focus', async () => {
    useEditorStore.setState({ selectedId: buttonId });
    await act(async () => root.render(createElement(AppShell)));
    const draft = panel().querySelector('textarea')!; draft.value = 'Testo ancora da applicare';
    await act(async () => host.querySelector<HTMLButtonElement>('.context-panel-close')!.click());
    expect(panel().hidden).toBe(true); expect(useEditorStore.getState().selectedId).toBe(buttonId);
    expect(window.document.activeElement).toBe(toggle());
    await act(async () => toggle().click());
    expect(panel().hidden).toBe(false); expect(panel().querySelector('textarea')).toBe(draft); expect(draft.value).toBe('Testo ancora da applicare');
  });
  it('non riapre da sola dopo una modifica AST, ma riapre per un nuovo elemento o richiesta esplicita', async () => {
    useEditorStore.setState({ selectedId: buttonId }); await act(async () => root.render(createElement(AppShell)));
    await act(async () => toggle().click());
    const node = document.nodes[buttonId];
    await act(async () => useEditorStore.setState({ document: { ...document, version: 2, nodes: { ...document.nodes, [buttonId]: { ...node, source: { ...node.source, end: node.source.end + 10 } } } } }));
    expect(panel().hidden).toBe(true);
    await act(async () => useEditorStore.setState({ propertiesExpandedAt: 1 })); expect(panel().hidden).toBe(false);
    await act(async () => toggle().click());
    await act(async () => useEditorStore.setState({ selectedId: spanId })); expect(panel().hidden).toBe(false);
  });
  it('lascia il canvas libero in Usa il pannello e mantiene la chat facoltativa accessibile', async () => {
    useEditorStore.setState({ selectedId: buttonId }); await act(async () => root.render(createElement(AppShell)));
    await act(async () => useEditorStore.setState({ interactionMode: 'navigate' }));
    expect(panel().hidden).toBe(true); expect(toggle().disabled).toBe(true);
    await act(async () => useEditorAi.setState({ open: true, mode: 'edit' }));
    expect(panel().hidden).toBe(false); expect(panel().textContent).toContain('Chat del progetto');
    await act(async () => useEditorAi.setState({ open: false })); expect(panel().hidden).toBe(true);
  });
});
