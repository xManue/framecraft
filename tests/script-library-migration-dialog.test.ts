// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  apply: vi.fn(),
  stop: vi.fn(),
  refresh: vi.fn(),
  readFile: vi.fn(),
  preview: vi.fn()
}));
vi.mock('../src/filesystem/desktopBridge', () => ({
  desktopAvailable: true,
  desktopBridge: {
    readScriptMigration: mocks.read,
    applyScriptMigration: mocks.apply,
    stopPreview: mocks.stop,
    readFile: mocks.readFile
  }
}));
vi.mock('../src/core/scriptMigrationClient', () => ({
  previewScriptProjectMigration: mocks.preview
}));
import { ScriptLibraryMigrationDialog } from '../src/editor/ScriptLibraryMigrationDialog';
import { parseHmiScriptCatalog } from '../src/core/hmiScriptModules';
import { scriptMigrationFingerprint } from '../src/core/scriptProjectMigration';
import type { ScriptLibraryPlan } from '../src/core/scriptLibrary';
import { useEditorStore } from '../src/state/editorStore';
import { setScriptDraftDirty } from '../src/state/scriptDraftState';
const project = {
    root: 'C:/synthetic',
    name: 'Synthetic',
    framework: 'vite' as const,
    language: 'typescript' as const,
    packageManager: 'npm' as const,
    entryFiles: [],
    files: [],
    scripts: {},
    dependencies: [],
    hasNodeModules: true,
    missingDependencies: []
  },
  owner = Symbol('wizard draft');
const catalog = parseHmiScriptCatalog({
    globalModules: [{
      alias: 'M',
      name: 'M',
      functions: [{
        name: 'Read',
        parameters: ['value'],
        source: 'return value;'
      }]
    }]
  }),
  next = parseHmiScriptCatalog({
    globalModules: [{
      alias: 'M',
      name: 'M',
      functions: [{
        name: 'Read',
        parameters: ['value', 'scale'],
        source: 'return value*scale;'
      }]
    }]
  });
const plan: ScriptLibraryPlan = {
  base: 'unused mock worker',
  next,
  mode: 'type',
  library: 'Synthetic library',
  version: '2.0.0',
  changes: [],
  projectUpdate: true
};
const files = {
  'framecraft.scripts.json': JSON.stringify(catalog),
  'src/Page.tsx': 'export const page=1;'
};
const snap = () => ({
  generation: 9,
  token: 'inventory',
  files,
  runtimeReady: true,
  backups: []
});
const result = async () => ({
  base: await scriptMigrationFingerprint(files),
  changes: [{
    path: 'framecraft.scripts.json',
    before: files['framecraft.scripts.json'],
    after: JSON.stringify(next)
  }],
  issues: [],
  references: [],
  recompiled: 1,
  previousVersions: [],
  ignoredGeneratedFiles: [],
  totalBytes: 12
});
const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
};
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    close = vi.fn(),
    recover = vi.fn(),
    runtime = vi.fn();
  await act(async () => root.render(createElement(StrictMode, {}, createElement(ScriptLibraryMigrationDialog, {
    catalog,
    plan,
    review: {
      code: true,
      customized: true,
      downgrade: true
    },
    onClose: close,
    onRecover: recover,
    onUpdateRuntime: runtime
  }))));
  await act(async () => {
    await new Promise(r => setTimeout(r, 10));
  });
  await settle();
  const f = {
    close,
    recover,
    runtime,
    button: (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent?.includes(text))!,
    check: (text: string) => [...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find(el => el.parentElement?.textContent?.includes(text))!,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
    compare: async () => {
      const select = document.querySelector<HTMLSelectElement>('[aria-label="Valore M.Read.scale"]')!;
      await act(async () => {
        select.value = 'fixed:number';
        select.dispatchEvent(new Event('change', {
          bubbles: true
        }));
      });
      const input = document.querySelector<HTMLInputElement>('[aria-label="Valore fisso scale"]')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2');
        input.dispatchEvent(new Event('input', {
          bubbles: true
        }));
      });
      await act(async () => f.button('Confronta file').click());
      await settle();
    },
    confirm: async () => {
      await act(async () => f.check('Ho controllato').click());
      await act(async () => f.check('Ho arrestato').click());
    }
  };
  return f;
}
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(snap());
  mocks.apply.mockResolvedValue('backup-123');
  mocks.stop.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.readFile.mockResolvedValue(JSON.stringify(next));
  mocks.preview.mockResolvedValue(await result());
  setScriptDraftDirty(owner, false);
  useEditorStore.setState({
    project,
    pages: [],
    scriptCatalog: catalog,
    document: undefined,
    dirty: false,
    loading: false,
    exporting: false,
    previewRestarting: false,
    reloadRecovery: undefined,
    highlightPicker: undefined,
    interactionMode: 'edit',
    closeStandalonePreview: vi.fn(),
    refreshAiProjectFiles: mocks.refresh
  });
});
it('reads the authoritative inventory only once under StrictMode and requires an explicit unmatched parameter', async () => {
  const f = await mount();
  try {
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.read).toHaveBeenCalledWith(project.root, false);
    await act(async () => f.button('Confronta file').click());
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Scegli il valore di scale');
    expect(mocks.apply).not.toHaveBeenCalled();
  } finally {
    await f.unmount();
  }
});
it('passes the library review, explicit parameter mapping and snapshot to the worker without writing', async () => {
  const f = await mount();
  try {
    await f.compare();
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({
      files,
      library: {
        catalog,
        plan,
        review: {
          code: true,
          customized: true,
          downgrade: true
        }
      },
      mappings: [expect.objectContaining({
        arguments: [{
          kind: 'argument',
          index: 0
        }, {
          kind: 'literal',
          value: 2
        }]
      })]
    }), expect.any(AbortSignal));
    expect(f.button('Applica aggiornamento').disabled).toBe(true);
    expect(mocks.stop).not.toHaveBeenCalled();
  } finally {
    await f.unmount();
  }
});
it('requires file review and stopped service, stops preview before native transaction, and refreshes the script catalog', async () => {
  const order: string[] = [];
  mocks.stop.mockImplementation(async () => {
    order.push('stop');
  });
  mocks.apply.mockImplementation(async () => {
    order.push('apply');
    return 'backup-123';
  });
  const f = await mount();
  try {
    await f.compare();
    await act(async () => f.check('Ho controllato').click());
    expect(f.button('Applica aggiornamento').disabled).toBe(true);
    await act(async () => f.check('Ho arrestato').click());
    await act(async () => f.button('Applica aggiornamento').click());
    await settle();
    expect(order).toEqual(['stop', 'apply']);
    expect(mocks.apply).toHaveBeenCalledWith(project.root, 9, 'inventory', expect.any(Array));
    expect(useEditorStore.getState().scriptCatalog.globalModules[0].functions[0].parameters).toEqual(['value', 'scale']);
    expect(document.body.textContent).toContain('Libreria e file aggiornati');
    expect(useEditorStore.getState().previewUrl).toBeUndefined();
  } finally {
    await f.unmount();
  }
});
it('blocks an update when page or module drafts appear after comparison', async () => {
  const f = await mount();
  try {
    await f.compare();
    await f.confirm();
    await act(async () => setScriptDraftDirty(owner, true));
    expect(f.button('Applica aggiornamento').disabled).toBe(true);
    await act(async () => setScriptDraftDirty(owner, false));
    await act(async () => useEditorStore.setState({
      dirty: true
    }));
    expect(f.button('Applica aggiornamento').disabled).toBe(true);
    expect(mocks.apply).not.toHaveBeenCalled();
  } finally {
    setScriptDraftDirty(owner, false);
    await f.unmount();
  }
});
it('requires acknowledgement when a migrated script used an older VM', async () => {
  mocks.preview.mockResolvedValue({
    ...(await result()),
    previousVersions: [8]
  });
  const f = await mount();
  try {
    await f.compare();
    await f.confirm();
    expect(f.button('Applica aggiornamento').disabled).toBe(true);
    await act(async () => f.check('motore precedente').click());
    expect(f.button('Applica aggiornamento').disabled).toBe(false);
  } finally {
    await f.unmount();
  }
});
it('does not close while applying and distinguishes committed files from editor reload failure', async () => {
  let release!: (value: string) => void;
  mocks.apply.mockImplementation(() => new Promise(resolve => {
    release = resolve;
  }));
  mocks.readFile.mockRejectedValue(Error('synthetic read failure'));
  const f = await mount();
  try {
    await f.compare();
    await f.confirm();
    await act(async () => f.button('Applica aggiornamento').click());
    await settle();
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true
    })));
    expect(f.close).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Chiudi aggiornamento libreria"]')!.disabled).toBe(true);
    await act(async () => release('backup-123'));
    await settle();
    expect(document.body.textContent).toContain('I file sono stati aggiornati');
    expect(document.body.textContent).toContain('backup-123');
    expect(mocks.apply).toHaveBeenCalledTimes(1);
  } finally {
    await f.unmount();
  }
});
it('invalidates a consumed snapshot after a native failure and offers recovery without retrying the old token', async () => {
  mocks.apply.mockRejectedValue(Error('external source conflict'));
  const f = await mount();
  try {
    await f.compare();
    await f.confirm();
    await act(async () => f.button('Applica aggiornamento').click());
    await settle();
    expect(document.body.textContent).toContain('external source conflict');
    expect(f.button('Applica aggiornamento')).toBeUndefined();
    await act(async () => f.button('Apri recupero').click());
    expect(f.recover).toHaveBeenCalledTimes(1);
    expect(mocks.apply).toHaveBeenCalledTimes(1);
  } finally {
    await f.unmount();
  }
});
it.each(['runtime', 'backup'])('gates source comparison on %s prerequisites', async kind => {
  mocks.read.mockResolvedValue({
    ...snap(),
    runtimeReady: kind !== 'runtime',
    backups: kind === 'backup' ? [{
      state: 'applying'
    }] : []
  });
  const f = await mount();
  try {
    expect(f.button('Confronta file')).toBeUndefined();
    await act(async () => f.button(kind === 'runtime' ? 'Aggiorna componenti' : 'Apri recupero migrazioni').click());
    expect(kind === 'runtime' ? f.runtime : f.recover).toHaveBeenCalledTimes(1);
    expect(mocks.apply).not.toHaveBeenCalled();
  } finally {
    await f.unmount();
  }
});
it('retains manual shared contexts across a corrected comparison and requires confirmation of complete usage', async () => {
  mocks.preview.mockResolvedValueOnce({
    ...(await result()),
    changes: [],
    issues: [{
      path: 'src/Page.tsx',
      line: 1,
      message: 'Serve il contesto della pagina: scope locale'
    }]
  }).mockResolvedValueOnce(await result());
  const f = await mount();
  try {
    await f.compare();
    expect(document.body.textContent).toContain('Contesti d’uso');
    await act(async () => f.check('Solo definizioni globali').click());
    await act(async () => f.button('Confronta file').click());
    await settle();
    await f.confirm();
    expect(f.button('Applica aggiornamento').disabled).toBe(true);
    await act(async () => f.check('Ho incluso tutti').click());
    expect(f.button('Applica aggiornamento').disabled).toBe(false);
    expect(mocks.preview.mock.calls[1][0].scopes).toEqual({
      'src/Page.tsx': ['']
    });
  } finally {
    await f.unmount();
  }
});
it('drops late results after changing project', async () => {
  let release!: (value: any) => void;
  mocks.preview.mockImplementation(() => new Promise(resolve => {
    release = resolve;
  }));
  const f = await mount();
  try {
    await f.compare();
    await act(async () => useEditorStore.setState({
      project: {
        ...project,
        root: 'C:/another'
      }
    }));
    await act(async () => release(await result()));
    expect(document.body.textContent).toContain('Il progetto è cambiato');
    expect(f.button('Applica aggiornamento')).toBeUndefined();
    expect(mocks.apply).not.toHaveBeenCalled();
  } finally {
    await f.unmount();
  }
});
